"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  X,
  Plus,
  Globe,
  Home,
  Search,
  Lock,
  AlertCircle,
  ExternalLink,
  Monitor,
} from "lucide-react";

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  navCount: number;
}

const DEFAULT_HOME = "https://www.google.com";

const isTauri =
  typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

function safeHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Trang mới";
  }
}

function makeTabId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function newTab(url: string = DEFAULT_HOME): BrowserTab {
  return { id: makeTabId(), url, title: safeHostname(url), loading: true, navCount: 0 };
}

async function tauriInvoke<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export default function WebBrowser({ isActive = true }: { isActive?: boolean }) {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [newTab(DEFAULT_HOME)]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id);
  const [addressInput, setAddressInput] = useState(DEFAULT_HOME);
  const [addressFocused, setAddressFocused] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const createdRef = useRef<Set<string>>(new Set());
  const creatingRef = useRef<Set<string>>(new Set());
  const lastBoundsRef = useRef<string>("");
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const mountedRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const scheduleSyncRef = useRef<(() => void) | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    mountedRef.current = true;
    if (isTauri) scheduleSyncRef.current?.();
    return () => {
      mountedRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ── Keep address bar in sync with the active tab ── */
  useEffect(() => {
    if (activeTab && !addressFocused) setAddressInput(activeTab.url);
  }, [activeTab?.id, activeTab?.url, addressFocused]);

  /* ── Measure viewport region & position the native webview over it ── */
  const syncBounds = useCallback(async () => {
    if (!isTauri || !mountedRef.current) return;
    const el = viewportRef.current;
    const tabId = activeTabIdRef.current;
    if (!el || !tabId) return;

    // Inactive (another app function is showing) → hide all browser webviews so
    // they don't cover the app.
    if (!isActiveRef.current) {
      if (lastBoundsRef.current !== "hidden") {
        lastBoundsRef.current = "hidden";
        await tauriInvoke("browser_hide_all").catch(() => {});
      }
      return;
    }

    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left);
    const y = Math.round(rect.top);
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // Region not laid out yet → retry next frame (don't bail).
    if (width < 2 || height < 2 || el.offsetParent === null) {
      requestAnimationFrame(() => scheduleSyncRef.current?.());
      return;
    }

    if (!createdRef.current.has(tabId)) {
      if (creatingRef.current.has(tabId)) return;
      creatingRef.current.add(tabId);
      if (mountedRef.current) setInitializing(true);
      const t = tabsRef.current.find((tt) => tt.id === tabId);
      try {
        await tauriInvoke("browser_create", {
          tabId,
          url: t?.url ?? DEFAULT_HOME,
          x, y, width, height,
        });
        createdRef.current.add(tabId);
        lastBoundsRef.current = `${tabId}:${x},${y},${width},${height}`;
        await tauriInvoke("browser_set_bounds", { tabId, x, y, width, height }).catch(() => {});
        await tauriInvoke("browser_show", { tabId }).catch(() => {});
      } catch (err) {
        console.error("browser_create failed:", err);
      } finally {
        creatingRef.current.delete(tabId);
        if (mountedRef.current && activeTabIdRef.current === tabId) setInitializing(false);
      }
      return;
    }

    const key = `${tabId}:${x},${y},${width},${height}`;
    if (key === lastBoundsRef.current) return;
    lastBoundsRef.current = key;
    await tauriInvoke("browser_set_bounds", { tabId, x, y, width, height }).catch(() => {});
    await tauriInvoke("browser_show", { tabId }).catch(() => {});
  }, []);

  const scheduleSync = useCallback(() => {
    if (!isTauri || rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      syncBounds();
    });
  }, [syncBounds]);
  scheduleSyncRef.current = scheduleSync;

  /* ── Show/hide driven by the isActive prop ── */
  useEffect(() => {
    if (!isTauri) return;
    if (isActive) {
      lastBoundsRef.current = "";
      scheduleSync();
    } else {
      lastBoundsRef.current = "hidden";
      tauriInvoke("browser_hide_all").catch(() => {});
    }
  }, [isActive, scheduleSync]);

  /* ── Reposition on viewport resize / window resize ── */
  useEffect(() => {
    if (!isTauri) return;
    const el = viewportRef.current;
    const ro = new ResizeObserver(() => scheduleSync());
    if (el) ro.observe(el);
    window.addEventListener("resize", scheduleSync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleSync);
    };
  }, [scheduleSync]);

  /* ── When inner browser tab changes: hide others, refresh bounds ── */
  useEffect(() => {
    if (!isTauri || !isActive) return;
    lastBoundsRef.current = "";
    (async () => {
      for (const t of tabsRef.current) {
        if (t.id !== activeTabId && createdRef.current.has(t.id)) {
          await tauriInvoke("browser_hide", { tabId: t.id }).catch(() => {});
        }
      }
      scheduleSync();
    })();
  }, [activeTabId, isActive, scheduleSync]);

  /* ── Native nav / title events ── */
  useEffect(() => {
    if (!isTauri) return;
    let unNav: (() => void) | null = null;
    let unTitle: (() => void) | null = null;
    let cleaned = false;

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const u1 = await listen<{ tabId: string; url: string; phase: string }>("browser-nav", (e) => {
        if (!mountedRef.current) return;
        const { tabId, url, phase } = e.payload;
        if (creatingRef.current.size === 0) setInitializing(false);
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            if (phase === "started") {
              return { ...t, url, loading: true, navCount: t.navCount + 1, title: safeHostname(url) };
            }
            return { ...t, url, loading: false };
          })
        );
      });
      const u2 = await listen<{ tabId: string; title: string }>("browser-title", (e) => {
        if (!mountedRef.current) return;
        const { tabId, title } = e.payload;
        if (!title) return;
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title } : t)));
      });
      if (cleaned) { u1(); u2(); } else { unNav = u1; unTitle = u2; }
    })();

    return () => {
      cleaned = true;
      unNav?.();
      unTitle?.();
    };
  }, []);

  /* ── Cleanup all webviews on unmount ── */
  useEffect(() => {
    return () => {
      if (isTauri) tauriInvoke("browser_close_all").catch(() => {});
    };
  }, []);

  /* ── Actions ── */
  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = addressInput.trim();
    if (!value) return;
    (e.target as HTMLFormElement).querySelector("input")?.blur();
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, loading: true } : t)));
    if (isTauri) tauriInvoke("browser_navigate", { tabId: activeTabId, url: value }).catch(console.error);
  };

  const handleBack = () => { if (isTauri) tauriInvoke("browser_back", { tabId: activeTabId }).catch(() => {}); };
  const handleForward = () => { if (isTauri) tauriInvoke("browser_forward", { tabId: activeTabId }).catch(() => {}); };
  const handleReload = () => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, loading: true } : t)));
    if (isTauri) tauriInvoke("browser_reload", { tabId: activeTabId }).catch(() => {});
  };
  const handleHome = () => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, loading: true, url: DEFAULT_HOME } : t)));
    if (isTauri) tauriInvoke("browser_navigate", { tabId: activeTabId, url: DEFAULT_HOME }).catch(() => {});
  };

  const handleAddTab = () => {
    const tab = newTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setAddressInput(tab.url);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabsRef.current.length <= 1) return;
    const prev = tabsRef.current;
    const idx = prev.findIndex((t) => t.id === tabId);
    const remaining = prev.filter((t) => t.id !== tabId);
    if (activeTabId === tabId) {
      const next = remaining[idx] ?? remaining[remaining.length - 1];
      if (next) setActiveTabId(next.id);
    }
    setTabs(remaining);
    if (isTauri) tauriInvoke("browser_close", { tabId }).catch(() => {});
    createdRef.current.delete(tabId);
  };

  const handleOpenExternal = () => {
    if (isTauri) tauriInvoke("open_in_browser", { url: activeTab?.url }).catch(console.error);
    else window.open(activeTab?.url, "_blank");
  };

  const canGoBack = (activeTab?.navCount ?? 0) > 1;
  const isHttps = activeTab?.url.startsWith("https://");

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#06060a", overflow: "hidden" }}>
      {/* Tab Bar */}
      <div
        className="browser-tab-bar"
        style={{
          display: "flex", alignItems: "center", background: "#08080e",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          height: 36, flexShrink: 0, paddingLeft: 8, gap: 2,
          overflowX: "auto", overflowY: "hidden",
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              role="tab" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveTabId(tab.id); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "0 8px 0 10px", height: 28, borderRadius: "8px 8px 0 0",
                border: active ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
                borderBottom: active ? "1px solid #06060a" : "1px solid transparent",
                background: active ? "#06060a" : "transparent",
                color: active ? "#e5e7eb" : "#6b7280",
                cursor: "pointer", flexShrink: 0, maxWidth: 200, minWidth: 90,
                transition: "all 0.15s ease", fontSize: 11,
                fontWeight: active ? 600 : 400, userSelect: "none", position: "relative", top: 1,
              }}
            >
              {tab.loading ? (
                <div style={{ width: 11, height: 11, borderRadius: "50%", border: "2px solid rgba(99,179,237,0.15)", borderTopColor: "#63b3ed", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              ) : (
                <Globe style={{ width: 11, height: 11, flexShrink: 0, color: active ? "#63b3ed" : "#4b5563" }} />
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  style={{ width: 15, height: 15, borderRadius: "50%", border: "none", background: "transparent", color: "#4b5563", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, transition: "all 0.15s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.18)"; (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#4b5563"; }}
                  title="Đóng tab"
                >
                  <X style={{ width: 9, height: 9 }} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={handleAddTab}
          style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: "#4b5563", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s", marginLeft: 2 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "#e5e7eb"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#4b5563"; }}
          title="Mở tab mới"
        >
          <Plus style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* Navigation Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", background: "#070710", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, position: "relative" }}>
        <NavBtn onClick={handleBack} disabled={!canGoBack} title="Quay lại"><ChevronLeft style={{ width: 16, height: 16 }} /></NavBtn>
        <NavBtn onClick={handleForward} title="Tiến"><ChevronRight style={{ width: 16, height: 16 }} /></NavBtn>
        <NavBtn onClick={handleReload} title="Tải lại"><RotateCw style={{ width: 13, height: 13, animation: activeTab?.loading ? "spin 0.8s linear infinite" : "none" }} /></NavBtn>
        <NavBtn onClick={handleHome} title="Trang chủ"><Home style={{ width: 14, height: 14 }} /></NavBtn>

        <form onSubmit={handleAddressSubmit} style={{ flex: 1, display: "flex" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: `1px solid ${addressFocused ? "rgba(99,179,237,0.4)" : "rgba(255,255,255,0.07)"}`, borderRadius: 8, padding: "0 10px", gap: 6, height: 32, transition: "border-color 0.15s" }}>
            {isHttps ? <Lock style={{ width: 12, height: 12, color: "#34d399", flexShrink: 0 }} /> : <AlertCircle style={{ width: 12, height: 12, color: "#f59e0b", flexShrink: 0 }} />}
            <input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onFocus={(e) => { setAddressFocused(true); e.target.select(); }}
              onBlur={() => setAddressFocused(false)}
              placeholder="Tìm kiếm Google hoặc nhập địa chỉ web"
              spellCheck={false}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e5e7eb", fontSize: 12, fontFamily: "inherit" }}
            />
            <Search style={{ width: 12, height: 12, color: "#374151", flexShrink: 0 }} />
          </div>
        </form>

        <NavBtn onClick={handleOpenExternal} title="Mở trong trình duyệt hệ thống"><ExternalLink style={{ width: 14, height: 14 }} /></NavBtn>

        {activeTab?.loading && (
          <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "transparent", overflow: "hidden" }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6)", animation: "browserProgress 1.4s ease-in-out infinite", width: "40%" }} />
          </div>
        )}
      </div>

      {/* Viewport region (native webview overlaid here) */}
      <div ref={viewportRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: "#0a0a12" }}>
        {isTauri && initializing && (
          <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "#0a0a12" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", border: "3px solid rgba(99,179,237,0.15)", borderTopColor: "#63b3ed", animation: "spin 0.8s linear infinite" }} />
            <div style={{ color: "#6b7280", fontSize: 12.5, fontWeight: 600 }}>Đang khởi tạo trình duyệt...</div>
          </div>
        )}
        {!isTauri && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "#6b7280", textAlign: "center", padding: 24 }}>
            <Monitor style={{ width: 40, height: 40, color: "#374151" }} />
            <div style={{ fontSize: 13, color: "#9ca3af", maxWidth: 360, lineHeight: 1.5 }}>
              Trình duyệt tích hợp chỉ hoạt động trong ứng dụng HTSS trên máy tính.
            </div>
            <button
              onClick={handleOpenExternal}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "rgba(99,179,237,0.1)", border: "1px solid rgba(99,179,237,0.25)", color: "#63b3ed", fontSize: 12, cursor: "pointer" }}
            >
              <ExternalLink style={{ width: 14, height: 14 }} />
              Mở trong trình duyệt hệ thống
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes browserProgress { 0% { transform: translateX(-120%); } 100% { transform: translateX(360%); } }
        .browser-tab-bar::-webkit-scrollbar { height: 3px; }
        .browser-tab-bar::-webkit-scrollbar-track { background: transparent; }
        .browser-tab-bar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 3px; }
      `}</style>
    </div>
  );
}

function NavBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "transparent", color: disabled ? "#1f2937" : "#9ca3af", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "all 0.15s", flexShrink: 0 }}
      onMouseEnter={(e) => { if (!disabled) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.color = "#e5e7eb"; } }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = disabled ? "#1f2937" : "#9ca3af"; }}
    >
      {children}
    </button>
  );
}
