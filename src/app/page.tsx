"use client";

import {
  Settings, Search, Bell, Minus, Square, X,
  Film, Home, Compass, UserCircle, LogOut, TrendingUp, Sparkles, ChevronLeft, RotateCw, Gamepad2, MessageSquare, Languages, Globe,
  PanelLeft, PanelLeftClose, LayoutGrid, LayoutPanelLeft, Check, ChevronRight, Library, Users, Coins, ChevronDown
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import ConfirmModal, { ConfirmOptions } from "./components/ConfirmModal";
import { useCommunityStore } from "./store/useCommunityStore";
import { toast } from "./components/Toast";
import CommunityAuthGate from "./components/CommunityAuthGate";
import CommunityAccountSettings from "./components/CommunityAccountSettings";
import WalletModal from "./components/WalletModal";

// Heavy sub-apps are loaded on demand (client-only) so the initial route stays
// small. Each one is only compiled/fetched the first time it's needed, which
// keeps `GET /` from pulling in artplayer/hls.js/all hubs up front. We then
// prefetch these chunks during idle time after the app mounts (see effect
// below), so opening a function is instant instead of compiling on click.
const loadingFallback = () => (
  <div className="flex-1 flex items-center justify-center min-h-[300px]">
    <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-400 animate-spin" />
  </div>
);

// Import loaders kept as named functions so they can be reused for prefetching.
const importValorantHub = () => import("./components/ValorantHub");
const importAnimeHub = () => import("./components/AnimeHub");
const importShortReelsHub = () => import("./components/ShortReelsHub");
const importDiscordHub = () => import("./components/DiscordHub");
const importTranslationHub = () => import("./components/TranslationHub");
const importCombinedDeals = () => import("./components/CombinedDeals");
const importWebBrowser = () => import("./components/WebBrowser");
const importSteamAccounts = () => import("./components/SteamAccounts");
const importCommunityHub = () => import("./components/CommunityHub");

const PREFETCHERS = [
  importValorantHub,
  importAnimeHub,
  importShortReelsHub,
  importDiscordHub,
  importTranslationHub,
  importCombinedDeals,
  importWebBrowser,
  importSteamAccounts,
  importCommunityHub,
];

const ValorantHub = dynamic(importValorantHub, { ssr: false, loading: loadingFallback });
const AnimeHub = dynamic(importAnimeHub, { ssr: false, loading: loadingFallback });
const ShortReelsHub = dynamic(importShortReelsHub, { ssr: false, loading: loadingFallback });
const DiscordHub = dynamic(importDiscordHub, { ssr: false, loading: loadingFallback });
const TranslationHub = dynamic(importTranslationHub, { ssr: false, loading: loadingFallback });
const CombinedDeals = dynamic(importCombinedDeals, { ssr: false, loading: loadingFallback });
const WebBrowser = dynamic(importWebBrowser, { ssr: false, loading: loadingFallback });
const SteamAccounts = dynamic(importSteamAccounts, { ssr: false, loading: loadingFallback });
const CommunityHub = dynamic(importCommunityHub, { ssr: false, loading: loadingFallback });

const NAV_ITEMS = [
  { id: "home", label: "Trang chủ", icon: Home },
  { id: "community", label: "Cộng đồng", icon: Users },
  { id: "anime", label: "Anime", icon: Film },
  { id: "short_reels", label: "Phim Ngắn", icon: Compass },
  { id: "valorant", label: "Valorant", icon: Gamepad2 },
  { id: "steam", label: "Steam", icon: Library },
  { id: "deals", label: "Ưu đãi Game", icon: Sparkles },
  { id: "discord", label: "Discord", icon: MessageSquare },
  { id: "translation", label: "Dịch & Giọng nói", icon: Languages },
  { id: "browser", label: "Trình duyệt", icon: Globe },
];

const NAV_MAP: Record<string, { id: string; label: string; icon: typeof Home }> =
  Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item]));

const NEWS_ITEMS = [
  {
    id: 1,
    category: "Cập nhật",
    date: "Hôm nay, 14:20",
    title: "HTSS Launcher bổ sung tính năng dịch hội thoại AI đa ngôn ngữ",
    summary: "Trải nghiệm tính năng dịch thời gian thực tích hợp trực tiếp vào Launcher giúp giao tiếp không rào cản.",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: 2,
    category: "Sự kiện",
    date: "18 tháng 5",
    title: "Giải đấu Valorant HTSS Championship mùa hè chính thức mở đăng ký",
    summary: "Đăng ký tham gia ngay cùng đội tuyển của bạn để giành những phần quà giá trị cùng kỷ niệm chương.",
    image: "https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: 3,
    category: "Game News",
    date: "17 tháng 5",
    title: "Steam Sale hè 2026: Danh sách các tựa game AAA giảm giá sốc nhất",
    summary: "Điểm qua những tựa game bom tấn đang có mức giá cực hời trên cửa hàng Steam hiện nay.",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: 4,
    category: "Hệ thống",
    date: "15 tháng 5",
    title: "Nâng cấp máy chủ Anime Hub - xem phim chất lượng 4K siêu tốc",
    summary: "Nâng cấp băng thông máy chủ chuyên dụng giúp cải thiện tốc độ tải video anime lên đến 200%.",
    image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=300&q=80",
  }
];

const APPS = [
  {
    id: "anime",
    label: "Anime Hub",
    icon: Film,
    desc: "Xem phim Anime Vietsub chất lượng cao 4K với máy chủ siêu tốc.",
    accent: "#f43f5e",
    tag: "Giải trí",
  },
  {
    id: "short_reels",
    label: "Phim Ngắn",
    icon: Compass,
    desc: "Kho phim ngắn, video reels giải trí hot trending đặc sắc.",
    accent: "#f59e0b",
    tag: "Video",
  },
  {
    id: "valorant",
    label: "Valorant Hub",
    icon: Gamepad2,
    desc: "Tra cứu thông tin trận đấu, lịch sử, chỉ số tướng và skin.",
    accent: "#ef4444",
    tag: "Game",
  },
  {
    id: "steam",
    label: "Tài khoản Steam",
    icon: Library,
    desc: "Quản lý và chuyển đổi nhanh giữa các tài khoản Steam đã lưu.",
    accent: "#38bdf8",
    tag: "Game",
  },
  {
    id: "deals",
    label: "Ưu đãi Game",
    icon: Sparkles,
    desc: "Theo dõi game giảm giá, deal hot bản quyền từ Steam, Epic.",
    accent: "#22d3ee",
    tag: "Deals",
  },
  {
    id: "discord",
    label: "Discord Hub",
    icon: MessageSquare,
    desc: "Kết nối cộng đồng đàm thoại, giao lưu cùng các thành viên.",
    accent: "#6366f1",
    tag: "Cộng đồng",
  },
  {
    id: "community",
    label: "Cộng đồng HTSS",
    icon: Users,
    desc: "Chat realtime, kênh thoại, server riêng và ví xu cộng đồng.",
    accent: "#8b5cf6",
    tag: "Cộng đồng",
  },
  {
    id: "translation",
    label: "Dịch & Giọng nói",
    icon: Languages,
    desc: "Dịch thuật hội thoại đa ngôn ngữ AI và chuyển giọng nói.",
    accent: "#14b8a6",
    tag: "AI",
  },
  {
    id: "browser",
    label: "Trình duyệt Web",
    icon: Globe,
    desc: "Trình duyệt web tích hợp sẵn tối giản, tốc độ cao tiện lợi.",
    accent: "#a855f7",
    tag: "Tiện ích",
  },
];

const NEWS_ACCENTS: Record<string, string> = {
  "Cập nhật": "#34d399",
  "Sự kiện": "#818cf8",
  "Game News": "#fbbf24",
  "Hệ thống": "#c084fc",
};

const PRESENCE_DOT: Record<string, string> = {
  ONLINE: "text-emerald-400",
  IDLE: "text-amber-400",
  DND: "text-rose-400",
  OFFLINE: "text-neutral-600",
};
const PRESENCE_TEXT: Record<string, string> = {
  ONLINE: "Trực tuyến",
  IDLE: "Chờ",
  DND: "Bận",
  OFFLINE: "Ngoại tuyến",
};
function userInitials(name?: string) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

export default function HomePage() {
  const [activeNav, setActiveNav] = useState("home");
  const [activeTab, setActiveTab] = useState("Thịnh hành");
  const [reloadKey, setReloadKey] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<string[]>(["home", "community"]);
  const [backCallbacks, setBackCallbacks] = useState<Record<string, (() => void) | null>>({});
  const [confirmConfig, setConfirmConfig] = useState<ConfirmOptions | null>(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showPresenceMenu, setShowPresenceMenu] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showWallet, setShowWallet] = useState(false);

  // Cộng đồng: trạng thái auth dùng chung để hiển thị avatar/tên trên header.
  const communityUser = useCommunityStore((s) => s.user);
  const communityAuthChecked = useCommunityStore((s) => s.authChecked);
  const bootstrapCommunity = useCommunityStore((s) => s.bootstrap);
  const openCommunityAuth = useCommunityStore((s) => s.openAuthModal);
  const communityLogout = useCommunityStore((s) => s.logout);
  const setCommunityPresence = useCommunityStore((s) => s.setPresence);
  const communityPresence = communityUser?.presence ?? "OFFLINE";

  // Khôi phục phiên đăng nhập cộng đồng khi mở app (nếu có token đã lưu).
  useEffect(() => {
    bootstrapCommunity();
  }, [bootstrapCommunity]);

  // Layout preferences (persisted to localStorage).
  // "tabs"   = current top-tabs layout
  // "navbar" = left sidebar navigation
  const [layoutMode, setLayoutMode] = useState<"tabs" | "navbar">("tabs");
  const [navbarCollapsed, setNavbarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Load saved layout preferences on mount.
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("htss-layout-mode");
      if (savedMode === "tabs" || savedMode === "navbar") setLayoutMode(savedMode);
      const savedCollapsed = localStorage.getItem("htss-navbar-collapsed");
      if (savedCollapsed != null) setNavbarCollapsed(savedCollapsed === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const updateLayoutMode = useCallback((mode: "tabs" | "navbar") => {
    setLayoutMode(mode);
    try { localStorage.setItem("htss-layout-mode", mode); } catch { /* ignore */ }
  }, []);

  const toggleNavbarCollapsed = useCallback(() => {
    setNavbarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("htss-navbar-collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Drag-to-reorder state for the function tabs (pointer-based, since native
  // HTML5 drag-and-drop is unreliable inside Tauri's WebView2).
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragInfo = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const suppressTabClick = useRef(false);

  const [updateConfig, setUpdateConfig] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [appVersion, setAppVersion] = useState("0.6.9");

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
      return;
    }
    // Fetch version dynamically on mount
    const fetchVersion = async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const ver = await getVersion();
        setAppVersion(ver);
      } catch (err) {
        console.error("Lỗi lấy phiên bản:", err);
      }
    };
    fetchVersion();

    // Check for updates on mount
    const checkUpdates = async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        const res = await invoke<any>("check_for_updates");
        if (res && res.has_update) {
          setUpdateConfig(res);
          setShowUpdateModal(true);
        }
      } catch (err) {
        console.error("Lỗi kiểm tra cập nhật:", err);
      }
    };
    checkUpdates();

    // Listen to update progress events
    let unlistenFn: (() => void) | null = null;
    let isCleanedUp = false;

    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const cleanup = await listen<number>("update-progress", (event) => {
        setUpdateProgress(event.payload);
      });
      if (isCleanedUp) {
        cleanup();
      } else {
        unlistenFn = cleanup;
      }
    };
    setupListener();

    return () => {
      isCleanedUp = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

    useEffect(() => {
    window.confirmCustom = (options) => {
      setConfirmConfig(options);
    };
    return () => {
      delete window.confirmCustom;
    };
  }, []);

  // Reveal the main window (and close the native splash) once the app UI has
  // mounted, so users see the splash until real content is ready.
  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      (async () => {
        if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__) return;
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          if (!cancelled) await invoke("show_main_window");
        } catch {
          /* ignore */
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Warm up the sub-app chunks in the background after the dashboard is ready.
  // Each is loaded one-at-a-time during idle so opening a function is instant
  // (no compile/fetch on click) without competing with the initial paint.
  useEffect(() => {
    let cancelled = false;

    const run = () => {
      let i = 0;
      const next = () => {
        if (cancelled || i >= PREFETCHERS.length) return;
        const load = PREFETCHERS[i++];
        // Kick off this chunk, then schedule the next one when idle.
        Promise.resolve(load()).catch(() => {}).finally(() => {
          if (cancelled) return;
          const w = window as any;
          if (typeof w.requestIdleCallback === "function") {
            w.requestIdleCallback(next, { timeout: 1500 });
          } else {
            setTimeout(next, 300);
          }
        });
      };
      next();
    };

    // Start prefetching a moment after mount so it doesn't delay first paint.
    const t = setTimeout(run, 800);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!visitedTabs.includes(activeNav)) {
      setVisitedTabs(prev => [...prev, activeNav]);
    }
  }, [activeNav, visitedTabs]);

  const registerBack = useCallback((cb: (() => void) | null) => {
    setBackCallbacks(prev => ({
      ...prev,
      [activeNav]: cb
    }));
  }, [activeNav]);

  const handleReload = () => {
    setReloadKey(prev => prev + 1);
  };

  // Open tabs are all visited functions except the home dashboard.
  // "community" is pinned right after Home and cannot be closed.
  const openTabs = (() => {
    const rest = visitedTabs.filter((id) => id !== "home" && id !== "community" && NAV_MAP[id]);
    const ordered = NAV_MAP["community"] ? ["community", ...rest] : rest;
    return ordered;
  })();

  const closeTab = useCallback((id: string) => {
    if (id === "home" || id === "community") return; // tab cố định, không thể đóng
    setVisitedTabs((prev) => prev.filter((tab) => tab !== id));
    setBackCallbacks((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    // If we just closed the active tab, fall back to the previously opened
    // function, or the home dashboard if none remain.
    setActiveNav((current) => {
      if (current !== id) return current;
      const remaining = visitedTabs.filter(
        (tab) => tab !== id && tab !== "home" && NAV_MAP[tab]
      );
      return remaining.length ? remaining[remaining.length - 1] : "home";
    });
  }, [visitedTabs]);

  // Reorder function tabs: move `sourceId` to the position of `targetId`.
  // Only the function tabs (not the fixed "home" entry) are reordered, then
  // merged back into visitedTabs preserving "home".
  const moveTab = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    // "community" is pinned right after Home and cannot be dragged/displaced.
    if (sourceId === "community" || targetId === "community") return;
    setVisitedTabs((prev) => {
      const order = prev.filter((t) => t !== "home" && t !== "community" && NAV_MAP[t]);
      const from = order.indexOf(sourceId);
      const to = order.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      order.splice(from, 1);
      order.splice(to, 0, sourceId);
      // Keep "home" first, "community" pinned, then the reordered tabs.
      return ["home", ...(NAV_MAP["community"] ? ["community"] : []), ...order];
    });
  }, []);

  // Pointer-based drag reordering (works inside Tauri WebView2, unlike the
  // native HTML5 drag-and-drop which the OS file-drop handler intercepts).
  const startTabDrag = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return; // left button only
    dragInfo.current = { id, startX: e.clientX, moved: false };

    const handleMove = (ev: PointerEvent) => {
      const info = dragInfo.current;
      if (!info) return;
      if (!info.moved && Math.abs(ev.clientX - info.startX) < 4) return;
      info.moved = true;
      setDraggedTab(info.id);

      // Find which tab the pointer is currently over and swap into its slot.
      for (const [tid, el] of Object.entries(tabRefs.current)) {
        if (!el || tid === info.id) continue;
        const rect = el.getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
          moveTab(info.id, tid);
          break;
        }
      }
    };

    const handleUp = () => {
      const info = dragInfo.current;
      // If a real drag happened, suppress the click that fires right after.
      if (info?.moved) suppressTabClick.current = true;
      dragInfo.current = null;
      setDraggedTab(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [moveTab]);

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const isFullscreen = await win.isFullscreen();
    win.setFullscreen(!isFullscreen);
  };

  const handleClose = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('quit_app');
    } catch {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().close();
    }
  };

  // ── Bắt buộc đăng nhập để vào app ──
  // Trong khi chưa kiểm tra xong phiên đăng nhập đã lưu → màn hình chờ.
  if (!communityAuthChecked) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#06060d] bg-dot-pattern">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-400 animate-spin" />
      </div>
    );
  }
  // Chưa đăng nhập → chỉ hiện giao diện đăng nhập/đăng ký.
  if (!communityUser) {
    return <CommunityAuthGate />;
  }

  return (
    <div className="w-full h-full relative z-10 flex flex-col text-white overflow-hidden bg-[#06060d] bg-dot-pattern">
      {/* Aurora ambient background */}
      <div className="aurora-blob animate-aurora top-[-22%] left-[-12%] w-[55%] h-[55%]" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.28), transparent 70%)" }} />
      <div className="aurora-blob animate-float-reverse bottom-[-24%] right-[-10%] w-[50%] h-[50%]" style={{ background: "radial-gradient(circle, rgba(217,70,239,0.18), transparent 70%)" }} />
      <div className="aurora-blob animate-float top-[30%] right-[20%] w-[35%] h-[35%]" style={{ background: "radial-gradient(circle, rgba(34,211,238,0.12), transparent 70%)" }} />

      {/* Unified Top Header Bar */}
      <div 
        data-tauri-drag-region="true" 
        className="w-full h-14 bg-[#0e0e1a] border-b border-white/[0.06] flex items-center justify-between pl-4 select-none relative z-50 flex-shrink-0 cursor-move"
      >
        {/* Left Side: Logo & Launcher info & Sub-app Navigation controls */}
        <div data-tauri-drag-region="false" className="flex items-center gap-2 cursor-default">
          <div 
            onClick={() => {
              if (activeNav !== "home") setActiveNav("home");
            }}
            className={`flex items-center gap-3 select-none ml-1 ${activeNav !== "home" ? "cursor-pointer group/logo" : "cursor-default"}`}
          >
            <div className="relative flex items-center justify-center flex-shrink-0">
              <div className="absolute inset-0 bg-violet-500/30 blur-lg rounded-full opacity-50 group-hover/logo:opacity-100 transition-opacity duration-700" />
              <div className="relative z-10 w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/10 border border-white/10 flex items-center justify-center shadow-[0_0_16px_rgba(139,92,246,0.25)]">
                <img 
                  src="/logo.svg" 
                  alt="Logo" 
                  className="w-5 h-5 object-contain transition-transform duration-700 ease-out group-hover/logo:rotate-[180deg] group-hover/logo:scale-110" 
                />
              </div>
            </div>
            
            <div className="flex flex-col justify-center">
              <div className="text-[15px] font-black tracking-tight leading-none text-white flex items-center">
                <span>htss</span>
                <span className="text-grad drop-shadow-[0_0_6px_rgba(139,92,246,0.3)]">.club</span>
              </div>
              <div className="text-[8px] font-bold text-neutral-500 tracking-[0.22em] uppercase mt-0.5 leading-none">
                Launcher v{appVersion}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Search, Notifications, Profile, and Tauri Window Controls */}
        <div data-tauri-drag-region="false" className="flex items-center gap-1.5 cursor-default h-full">
          {/* Action icons */}
          <div className="flex items-center gap-1 pr-2 mr-1 border-r border-white/[0.06] h-7">
            <button className="relative w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-all text-neutral-400 hover:text-white cursor-pointer active:scale-90">
              <Search className="w-4 h-4" />
            </button>
            <div className="relative">
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-fuchsia-500 rounded-full shadow-[0_0_8px_rgba(217,70,239,0.9)] z-10" />
              <button className="relative w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-all text-neutral-400 hover:text-white cursor-pointer active:scale-90">
                <Bell className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              data-tip="Cài đặt giao diện"
              data-tip-pos="bottom"
              className="relative w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-all text-neutral-400 hover:text-white cursor-pointer active:scale-90 group/set"
            >
              <Settings className="w-4 h-4 transition-transform duration-500 group-hover/set:rotate-90" />
            </button>
          </div>

          {/* User Profile Dropdown Widget */}
          <div className="relative">
            <button 
              onClick={() => {
                if (communityUser) setShowProfileDropdown(!showProfileDropdown);
                else openCommunityAuth();
              }}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-white/[0.08] bg-white/[0.04] border border-white/[0.08] hover:border-white/15 transition-all cursor-pointer group"
            >
              <div className="relative flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center overflow-hidden">
                  {communityUser?.avatarUrl ? (
                    <img src={communityUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-black text-white">
                      {communityUser ? userInitials(communityUser.displayName || communityUser.username) : "?"}
                    </span>
                  )}
                </div>
                {communityUser && (
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-current ${PRESENCE_DOT[communityPresence]} ring-2 ring-[#0e0e1a]`} />
                )}
              </div>
              {communityUser ? (
                <div className="text-left hidden sm:block">
                  <div className="text-[11px] font-bold text-white leading-none max-w-[100px] truncate">{communityUser.displayName || communityUser.username}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Coins className="w-2.5 h-2.5 text-amber-400" />
                    <span className="text-[9px] font-bold text-amber-300 leading-none">{communityUser.balance.toLocaleString("vi-VN")}</span>
                  </div>
                </div>
              ) : (
                <span className="text-[11px] font-bold text-neutral-300 group-hover:text-white transition-colors hidden sm:inline px-0.5">Đăng nhập</span>
              )}
              {communityUser && <ChevronDown className="w-3 h-3 text-neutral-500 flex-shrink-0" />}
            </button>

            {showProfileDropdown && communityUser && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
                <div className="absolute right-0 mt-2.5 w-60 glass rounded-2xl p-3 shadow-2xl z-50 animate-pop-in overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
                  <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-tr from-indigo-500 via-violet-500 to-fuchsia-500 overflow-hidden">
                      {communityUser.avatarUrl ? (
                        <img src={communityUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-black text-white">{userInitials(communityUser.displayName || communityUser.username)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-extrabold text-white truncate">{communityUser.displayName || communityUser.username}</div>
                      {/* Trạng thái dạng select gọn ngay dưới tên */}
                      <div className="relative mt-0.5">
                        <button
                          onClick={() => setShowPresenceMenu((v) => !v)}
                          className="flex items-center gap-1.5 px-1.5 py-0.5 -ml-1.5 rounded-md text-[11px] font-bold text-neutral-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <span className={`w-2 h-2 rounded-full bg-current ${PRESENCE_DOT[communityPresence]}`} />
                          <span className={PRESENCE_DOT[communityPresence]}>{PRESENCE_TEXT[communityPresence]}</span>
                          <ChevronDown className={`w-3 h-3 text-neutral-500 transition-transform ${showPresenceMenu ? "rotate-180" : ""}`} />
                        </button>
                        {showPresenceMenu && (
                          <>
                            <div className="fixed inset-0 z-[55]" onClick={() => setShowPresenceMenu(false)} />
                            <div className="absolute left-0 top-full mt-1 z-[60] w-40 rounded-xl border border-white/10 bg-[#101019]/98 backdrop-blur-xl p-1 shadow-[0_18px_50px_rgba(0,0,0,0.65)] animate-pop-in">
                              {(["ONLINE", "IDLE", "DND", "OFFLINE"] as const).map((st) => (
                                <button
                                  key={st}
                                  onClick={() => { setCommunityPresence(st); setShowPresenceMenu(false); }}
                                  className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer ${
                                    communityPresence === st ? "bg-white/[0.08] text-white" : "text-neutral-300 hover:bg-white/[0.05] hover:text-white"
                                  }`}
                                >
                                  <span className={`w-2 h-2 rounded-full bg-current ${PRESENCE_DOT[st]}`} />
                                  {PRESENCE_TEXT[st]}
                                  {communityPresence === st && <Check className="w-3.5 h-3.5 ml-auto text-violet-300" />}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowProfileDropdown(false); setShowWallet(true); }}
                    className="group/wallet w-full flex items-center gap-2.5 px-3 py-2.5 mt-1 mb-1 rounded-xl bg-gradient-to-r from-amber-500/[0.12] to-orange-500/[0.06] border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                      <Coins className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-amber-400/70">Ví xu</div>
                      <div className="text-[15px] font-black text-amber-300 leading-tight">{communityUser.balance.toLocaleString("vi-VN")}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-400/50 group-hover/wallet:text-amber-300 group-hover/wallet:translate-x-0.5 transition-all" />
                  </button>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => { setShowProfileDropdown(false); setShowAccountSettings(true); }}
                      className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl text-[12px] font-semibold text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
                    >
                      <UserCircle className="w-4 h-4 text-neutral-400" />
                      Cài đặt tài khoản
                    </button>
                    <button
                      onClick={() => {
                        setShowProfileDropdown(false);
                        toast.promise(communityLogout(), {
                          loading: "Đang đăng xuất...",
                          success: "Đã đăng xuất.",
                          error: "Đăng xuất thất bại.",
                        });
                      }}
                      className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl text-[12px] font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="w-4 h-4 text-rose-400/80" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="w-px h-4 bg-white/10 mx-1 flex-shrink-0" />

          {/* Window Controls */}
          <div className="flex items-center h-full">
            <button 
              onClick={handleMinimize} 
              className="h-full px-3.5 bg-transparent border-0 outline-none focus:outline-none hover:bg-white/[0.06] transition-colors text-neutral-400 hover:text-white cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={handleMaximize} 
              className="h-full px-3.5 bg-transparent border-0 outline-none focus:outline-none hover:bg-white/[0.06] transition-colors text-neutral-400 hover:text-white cursor-pointer"
            >
              <Square className="w-3 h-3" />
            </button>
            <button 
              onClick={handleClose} 
              className="h-full px-3.5 bg-transparent border-0 outline-none focus:outline-none hover:bg-rose-500 hover:text-white transition-colors text-neutral-400 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Open Function Tabs Bar (tabs layout only) */}
      {layoutMode === "tabs" && openTabs.length > 0 && (
        <div className="w-full flex items-stretch gap-1.5 px-3 h-11 bg-[#0b0b15] border-b border-white/[0.06] flex-shrink-0 relative z-40 select-none">
          {/* Fixed navigation controls (do not scroll with tabs) */}
          <div className="flex items-center gap-1.5 flex-shrink-0 pr-2.5 mr-0.5 border-r border-white/[0.06]">
            {/* Back button */}
            <button
              onClick={() => {
                if (activeNav === "home") return;
                const cb = backCallbacks[activeNav];
                if (cb) {
                  cb();
                } else {
                  setActiveNav("home");
                }
              }}
              disabled={activeNav === "home"}
              className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-violet-500/40 text-neutral-400 hover:text-violet-300 flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-90 disabled:opacity-25 disabled:cursor-default disabled:hover:bg-white/[0.04] disabled:hover:border-white/[0.06] disabled:hover:text-neutral-400"
              data-tip={activeNav === "home" ? "Quay lại" : (backCallbacks[activeNav] ? "Quay lại" : "Quay lại Trang chủ")}
              data-tip-pos="bottom"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Reload button */}
            <button
              onClick={handleReload}
              className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-violet-500/40 text-neutral-400 hover:text-violet-300 flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-90 group/reload"
              data-tip="Tải lại"
              data-tip-pos="bottom"
            >
              <RotateCw className="w-3.5 h-3.5 transition-transform duration-500 group-hover/reload:rotate-180" />
            </button>
          </div>

          {/* Scrollable tabs area */}
          <div className="flex items-stretch gap-1.5 flex-1 min-w-0 overflow-x-auto custom-scrollbar">
            {/* Home tab */}
            <button
              onClick={() => setActiveNav("home")}
              className={`group flex items-center gap-2 px-3 my-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer border ${
                activeNav === "home"
                  ? "bg-gradient-to-b from-violet-500/20 to-violet-500/5 border-violet-500/40 text-violet-100 shadow-[0_0_14px_rgba(139,92,246,0.18)]"
                  : "bg-white/[0.03] border-transparent text-neutral-400 hover:text-white hover:bg-white/[0.07]"
              }`}
              title="Trang chủ"
            >
              <Home className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">Trang chủ</span>
            </button>

            {openTabs.map((id) => {
              const item = NAV_MAP[id];
              const Icon = item.icon;
              const isActive = activeNav === id;
              const isDragging = draggedTab === id;
              const isPinned = id === "community"; // tab cố định: không kéo, không đóng
              return (
                <div
                  key={id}
                  ref={(el) => { tabRefs.current[id] = el; }}
                  onPointerDown={(e) => { if (!isPinned) startTabDrag(id, e); }}
                  onClick={() => {
                    if (suppressTabClick.current) {
                      suppressTabClick.current = false;
                      return;
                    }
                    setActiveNav(id);
                  }}
                  style={{ touchAction: "none" }}
                  className={`group flex items-center gap-2 pl-3 ${isPinned ? "pr-3" : "pr-1.5"} my-1.5 rounded-xl text-xs font-bold whitespace-nowrap border ${
                    isDragging
                      ? "transition-none opacity-80 scale-[1.04] cursor-grabbing z-10 shadow-xl shadow-black/50"
                      : `transition-all duration-200 ${isPinned ? "cursor-pointer" : "cursor-grab"}`
                  } ${
                    isActive
                      ? "bg-gradient-to-b from-violet-500/20 to-violet-500/5 border-violet-500/40 text-violet-100 shadow-[0_0_14px_rgba(139,92,246,0.18)]"
                      : "bg-white/[0.03] border-transparent text-neutral-400 hover:text-white hover:bg-white/[0.07]"
                  }`}
                  title={item.label}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0 pointer-events-none" />
                  <span className="pointer-events-none">{item.label}</span>
                  {!isPinned && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(id);
                      }}
                      className="w-5 h-5 rounded-lg flex items-center justify-center text-neutral-500 hover:text-white hover:bg-rose-500/25 transition-colors flex-shrink-0 cursor-pointer"
                      data-tip="Đóng"
                      data-tip-pos="bottom"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* App Body: optional left navbar + main content */}
      <div className="flex-1 min-h-0 w-full relative z-10 flex flex-row p-0">
        {layoutMode === "navbar" && (
          <HomeSidebar
            items={NAV_ITEMS}
            activeNav={activeNav}
            onSelect={setActiveNav}
            collapsed={navbarCollapsed}
            onToggleCollapsed={toggleNavbarCollapsed}
            onReload={handleReload}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 min-w-0 relative z-10 flex flex-col p-0">
          {/* Home App Dashboard — luôn mounted, chỉ ẩn/hiện để các tab phía dưới
              không bị unmount (tránh reload lại từ đầu khi quay về trang chủ). */}
          <div className={`flex-1 custom-scrollbar overflow-y-auto flex-col gap-8 text-neutral-200 px-7 pt-6 pb-8 animate-fade-in ${activeNav === "home" ? "flex" : "hidden"}`}>
            {/* Applications Grid Section */}
            <div className="flex flex-col gap-5">
              <SectionHeader icon={LayoutGrid} title="Ứng dụng hệ thống" subtitle="Khám phá các tính năng và công cụ tiện ích tích hợp" />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger">
                {APPS.map((app) => {
                  const Icon = app.icon;
                  return (
                    <button
                      key={app.id}
                      onClick={() => setActiveNav(app.id)}
                      style={{ ["--ac" as any]: app.accent }}
                      className="group relative overflow-hidden text-left rounded-2xl p-5 glass card-glow glass-shine transition-all duration-300 cursor-pointer hover:-translate-y-1.5 hover:border-[color:var(--ac)]/40"
                    >
                      {/* accent glow on hover */}
                      <div
                        className="absolute -right-8 -top-8 w-32 h-32 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{ background: `radial-gradient(circle, ${app.accent}40, transparent 70%)` }}
                      />
                      <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                        <div className="flex items-start justify-between">
                          <div
                            className="w-11 h-11 rounded-2xl flex items-center justify-center border transition-all duration-300 group-hover:scale-105"
                            style={{
                              color: app.accent,
                              background: `${app.accent}1a`,
                              borderColor: `${app.accent}33`,
                              boxShadow: `0 0 0 0 ${app.accent}00`,
                            }}
                          >
                            <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
                          </div>
                          <span
                            className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full border"
                            style={{ color: app.accent, background: `${app.accent}12`, borderColor: `${app.accent}2a` }}
                          >
                            {app.tag}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-[15px] font-bold text-white tracking-wide">{app.label}</h3>
                          <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed line-clamp-2 group-hover:text-neutral-300 transition-colors duration-300">
                            {app.desc}
                          </p>
                        </div>

                        <div
                          className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 transition-colors duration-300 mt-1"
                          style={{ color: undefined }}
                        >
                          <span className="group-hover:text-white transition-colors">Mở ứng dụng</span>
                          <ChevronRight className="w-3.5 h-3.5 translate-x-0 group-hover:translate-x-1 transition-transform duration-300" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tin tức & Cập nhật Section */}
            <div className="flex flex-col gap-5">
              <SectionHeader icon={TrendingUp} title="Tin tức & Cập nhật" subtitle="Tin mới nhất về game và hệ thống HTSS.CLUB" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
                {NEWS_ITEMS.map((news) => {
                  const accent = NEWS_ACCENTS[news.category] ?? "#22d3ee";
                  return (
                    <div
                      key={news.id}
                      className="group glass card-glow rounded-2xl p-4 flex gap-4 transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:border-white/15"
                    >
                      <div className="relative w-28 h-20 overflow-hidden rounded-xl bg-neutral-950 border border-white/[0.06] shrink-0">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-10" />
                        <img src={news.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                      </div>
                      <div className="flex flex-col justify-between min-w-0 flex-1">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border"
                              style={{ color: accent, background: `${accent}14`, borderColor: `${accent}33` }}
                            >
                              {news.category}
                            </span>
                            <span className="text-[9px] text-neutral-500 font-semibold">{news.date}</span>
                          </div>
                          <h4 className="text-[13px] font-bold text-neutral-200 group-hover:text-white transition-colors duration-300 mt-2 line-clamp-2 leading-snug">
                            {news.title}
                          </h4>
                        </div>
                        <p className="text-[10px] text-neutral-500 group-hover:text-neutral-400 transition-colors duration-300 line-clamp-1 mt-1 leading-normal">
                          {news.summary}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sub-application View (Full-screen App Shell) — luôn mounted, chỉ ẩn
              khi đang ở trang chủ, để giữ nguyên trạng thái các tab đã mở. */}
          <div className={`flex-1 min-h-0 min-w-0 bg-[#070710] relative group/app animate-fade-in ${activeNav === "home" ? "hidden" : "flex flex-col"}`}>
            {/* App Content Workspace */}
            <div className={`flex-1 min-h-0 min-w-0 flex flex-col relative ${activeNav === "browser" || activeNav === "community" ? "overflow-hidden" : (activeNav === "deals" ? "overflow-hidden px-6 py-4" : "overflow-y-auto px-6 py-4")}`}>
              {visitedTabs.includes("valorant") && (
                <div className={activeNav === "valorant" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
                  <ValorantHub reloadKey={reloadKey} />
                </div>
              )}
              {visitedTabs.includes("steam") && (
                <div className={activeNav === "steam" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
                  <SteamAccounts reloadKey={reloadKey} />
                </div>
              )}
              {visitedTabs.includes("anime") && (
                <div className={activeNav === "anime" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
                  <AnimeHub reloadKey={reloadKey} onRegisterBack={registerBack} />
                </div>
              )}
              {visitedTabs.includes("short_reels") && (
                <div className={activeNav === "short_reels" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
                  <ShortReelsHub reloadKey={reloadKey} onRegisterBack={registerBack} />
                </div>
              )}
              {visitedTabs.includes("discord") && (
                <div className={activeNav === "discord" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
                  <DiscordHub reloadKey={reloadKey} />
                </div>
              )}
              {visitedTabs.includes("community") && (
                <div className={activeNav === "community" ? "flex flex-col flex-1 min-h-0 min-w-0" : "hidden"}>
                  <CommunityHub reloadKey={reloadKey} />
                </div>
              )}
              {visitedTabs.includes("translation") && (
                <div className={activeNav === "translation" ? "flex flex-col flex-1 min-w-0" : "hidden"}>
                  <TranslationHub reloadKey={reloadKey} />
                </div>
              )}
              {visitedTabs.includes("deals") && (
                <div className={activeNav === "deals" ? "flex flex-col flex-1 min-h-0 min-w-0" : "hidden"}>
                  <CombinedDeals />
                </div>
              )}
              {visitedTabs.includes("browser") && (
                <div className={activeNav === "browser" ? "flex flex-col flex-1 min-h-0 min-w-0" : "hidden"}>
                  <WebBrowser isActive={activeNav === "browser"} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmConfig && (
        <ConfirmModal 
          config={confirmConfig} 
          onClose={() => setConfirmConfig(null)} 
        />
      )}

      {/* Settings — Layout chooser */}
      {showSettings && (
        <SettingsModal
          layoutMode={layoutMode}
          onSelectLayout={updateLayoutMode}
          navbarCollapsed={navbarCollapsed}
          onToggleNavbarCollapsed={toggleNavbarCollapsed}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Cài đặt tài khoản cộng đồng (đổi tên + avatar có crop) */}
      {showAccountSettings && communityUser && (
        <CommunityAccountSettings onClose={() => setShowAccountSettings(false)} />
      )}

      {/* Ví xu (tổng quan + chuyển xu + lịch sử) */}
      {showWallet && communityUser && (
        <WalletModal onClose={() => setShowWallet(false)} />
      )}

      {/* Premium Auto-Updater Glassmorphic Modal */}
      {showUpdateModal && updateConfig && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 animate-fade-in">
          <div className="w-[440px] glass card-glow rounded-3xl p-6 shadow-[0_30px_70px_rgba(0,0,0,0.7)] relative overflow-hidden select-none animate-pop-in">
            {/* Ambient background glow */}
            <div className="absolute top-[-25%] left-[-25%] w-[65%] h-[65%] bg-violet-500/20 blur-[80px] rounded-full pointer-events-none animate-pulse-glow" />
            <div className="absolute bottom-[-25%] right-[-25%] w-[55%] h-[55%] bg-fuchsia-600/15 blur-[80px] rounded-full pointer-events-none animate-float" />
            <div className="absolute inset-x-0 top-0 h-px grad-hairline" />

            <div className="flex flex-col items-center text-center relative z-10">
              {/* Sparkles Icon */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/10 border border-violet-500/30 flex items-center justify-center mb-4 shadow-[0_0_18px_rgba(139,92,246,0.3)]">
                <Sparkles className="w-6 h-6 text-violet-300" />
              </div>

              <h2 className="text-xl font-black text-white tracking-tight mb-1 drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">
                Có Bản Cập Nhật Mới!
              </h2>
              <div className="flex items-center gap-2 text-[10px] font-extrabold text-neutral-400 bg-white/[0.06] border border-white/10 px-3 py-1 rounded-full mb-4 shadow-sm">
                <span>v{updateConfig.current_version}</span>
                <ChevronRight className="w-3 h-3 text-violet-400" />
                <span className="text-violet-200 font-black">v{updateConfig.latest_version}</span>
              </div>

              {/* Release Notes */}
              {updateConfig.notes && (
                <div className="w-full bg-[#030305]/80 border border-white/[0.04] rounded-xl p-3.5 text-left mb-5 max-h-[120px] overflow-y-auto custom-scrollbar shadow-inner">
                  <div className="text-[9px] font-black text-neutral-500 tracking-wider uppercase mb-1.5">
                    Nhật ký cập nhật
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-line font-medium">
                    {updateConfig.notes}
                  </p>
                </div>
              )}

              {isUpdating ? (
                /* Downloading Progress State */
                <div className="w-full space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-violet-300 animate-pulse">
                      Đang tải bản cập nhật...
                    </span>
                    <span className="text-neutral-300">{updateProgress}%</span>
                  </div>
                  
                  {/* Progress Bar Container */}
                  <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/[0.06] p-0.5">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-300 rounded-full relative"
                      style={{ width: `${updateProgress}%` }}
                    >
                      <div className="absolute inset-0 animate-shimmer-flow rounded-full" />
                    </div>
                  </div>
                  <div className="text-[9px] text-neutral-500 text-center font-bold tracking-wide uppercase mt-1">
                    Launcher sẽ tự khởi động lại sau khi hoàn tất.
                  </div>
                </div>
              ) : (
                /* Update Choice State */
                <div className="flex items-center gap-3 w-full mt-2">
                  <button
                    onClick={() => setShowUpdateModal(false)}
                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/[0.05] hover:border-white/10 text-neutral-300 hover:text-white rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95 shadow-sm"
                  >
                    Bỏ qua
                  </button>
                  <button
                    onClick={async () => {
                      setIsUpdating(true);
                      const { invoke } = await import('@tauri-apps/api/core');
                      try {
                        await invoke("download_and_install_update", { url: updateConfig.url });
                      } catch (err) {
                        console.error("Lỗi cập nhật:", err);
                        setIsUpdating(false);
                        alert("Không thể tải bản cập nhật: " + err);
                      }
                    }}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 hover:shadow-[0_8px_28px_rgba(139,92,246,0.45)] text-white rounded-xl text-xs font-bold transition-all duration-300 shadow-[0_4px_20px_rgba(139,92,246,0.3)] border border-violet-400/25 active:scale-95 cursor-pointer"
                  >
                    Cập nhật ngay
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Section header ───────────────────────── */

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof Home; title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl glass flex items-center justify-center shadow-md">
          <Icon className="w-[18px] h-[18px] text-violet-300" />
        </div>
        <div>
          <h2 className="text-[15px] font-black text-white tracking-tight">{title}</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5 font-medium">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Left Navbar (sidebar) layout ───────────────────────── */

type NavItem = { id: string; label: string; icon: typeof Home };

function HomeSidebar({
  items,
  activeNav,
  onSelect,
  collapsed,
  onToggleCollapsed,
  onReload,
  onOpenSettings,
}: {
  items: NavItem[];
  activeNav: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onReload: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div
      className={`flex flex-col flex-shrink-0 h-full bg-[#0b0b15] border-r border-white/[0.06] relative z-30 transition-[width] duration-300 ease-out ${
        collapsed ? "w-[68px]" : "w-[228px]"
      }`}
    >
      {/* Collapse toggle */}
      <div className={`flex items-center h-12 flex-shrink-0 border-b border-white/[0.05] ${collapsed ? "justify-center px-0" : "justify-between px-3.5"}`}>
        {!collapsed && (
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500">Điều hướng</span>
        )}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? "Mở rộng" : "Thu gọn"}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-400 hover:text-violet-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-3 flex flex-col gap-1.5 px-2.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={collapsed ? item.label : undefined}
              className={`group relative flex items-center rounded-2xl transition-all duration-200 cursor-pointer ${
                collapsed ? "justify-center h-12 w-12 mx-auto" : "gap-3 px-3 h-12 w-full"
              } ${
                isActive
                  ? "bg-gradient-to-r from-violet-500/20 to-fuchsia-500/[0.06] text-violet-100 border border-violet-500/35 shadow-[0_0_16px_rgba(139,92,246,0.18)]"
                  : "text-neutral-400 hover:text-white hover:bg-white/[0.06] border border-transparent"
              }`}
            >
              {/* Active accent bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-violet-400 to-fuchsia-400 shadow-[0_0_10px_rgba(139,92,246,0.7)]" />
              )}
              <Icon className="w-[19px] h-[19px] flex-shrink-0" />
              {!collapsed && <span className="text-[13px] font-semibold truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer actions */}
      <div className="flex-shrink-0 border-t border-white/[0.05] p-2.5 flex flex-col gap-1.5">
        <button
          onClick={onReload}
          title={collapsed ? "Tải lại" : undefined}
          className={`group flex items-center rounded-2xl text-neutral-400 hover:text-violet-300 hover:bg-white/[0.06] transition-colors cursor-pointer ${
            collapsed ? "justify-center h-11 w-11 mx-auto" : "gap-3 px-3 h-11 w-full"
          }`}
        >
          <RotateCw className="w-[19px] h-[19px] flex-shrink-0 transition-transform duration-500 group-hover:rotate-180" />
          {!collapsed && <span className="text-[13px] font-semibold">Tải lại</span>}
        </button>
        <button
          onClick={onOpenSettings}
          title={collapsed ? "Cài đặt" : undefined}
          className={`group flex items-center rounded-2xl text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer ${
            collapsed ? "justify-center h-11 w-11 mx-auto" : "gap-3 px-3 h-11 w-full"
          }`}
        >
          <Settings className="w-[19px] h-[19px] flex-shrink-0 transition-transform duration-500 group-hover:rotate-90" />
          {!collapsed && <span className="text-[13px] font-semibold">Cài đặt</span>}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Settings modal (layout chooser) ───────────────────────── */

function LayoutCard({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
  preview,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Home;
  title: string;
  desc: string;
  preview: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative text-left rounded-2xl p-4 border transition-all duration-200 cursor-pointer ${
        active
          ? "bg-gradient-to-b from-violet-500/[0.12] to-transparent border-violet-500/45 shadow-[0_0_22px_rgba(139,92,246,0.18)]"
          : "bg-white/[0.02] border-white/[0.07] hover:border-white/20 hover:bg-white/[0.04]"
      }`}
    >
      {active && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-[0_0_10px_rgba(139,92,246,0.5)]">
          <Check className="w-3 h-3 text-white" />
        </span>
      )}
      <div className="w-full h-24 rounded-xl bg-[#070710] border border-white/[0.07] overflow-hidden mb-3">
        {preview}
      </div>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-violet-300" />
        <span className="text-[13px] font-bold text-white">{title}</span>
      </div>
      <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">{desc}</p>
    </button>
  );
}

function SettingsModal({
  layoutMode,
  onSelectLayout,
  navbarCollapsed,
  onToggleNavbarCollapsed,
  onClose,
}: {
  layoutMode: "tabs" | "navbar";
  onSelectLayout: (mode: "tabs" | "navbar") => void;
  navbarCollapsed: boolean;
  onToggleNavbarCollapsed: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 animate-fade-in p-4" onClick={onClose}>
      <div
        className="w-[580px] max-w-[92vw] glass card-glow rounded-3xl p-6 shadow-[0_30px_70px_rgba(0,0,0,0.7)] relative overflow-hidden animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <div className="absolute -right-16 -top-20 w-56 h-56 rounded-full blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.25), transparent 70%)" }} />

        {/* Header */}
        <div className="flex items-center justify-between mb-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/10 border border-violet-500/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-violet-300" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">Cài đặt giao diện</h2>
              <p className="text-[11px] text-neutral-500 font-medium">Chọn kiểu bố cục trang chủ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Layout options */}
        <div className="grid grid-cols-2 gap-3 relative z-10">
          <LayoutCard
            active={layoutMode === "tabs"}
            onClick={() => onSelectLayout("tabs")}
            icon={LayoutGrid}
            title="Thanh tab trên"
            desc="Bố cục hiện tại — các chức năng mở thành tab ở thanh trên."
            preview={
              <div className="w-full h-full flex flex-col">
                <div className="h-4 bg-[#0b0b16] border-b border-white/[0.06] flex items-center gap-1 px-2">
                  <span className="w-7 h-2 rounded-full bg-gradient-to-r from-violet-500/70 to-fuchsia-500/40" />
                  <span className="w-5 h-2 rounded-full bg-white/10" />
                  <span className="w-5 h-2 rounded-full bg-white/10" />
                </div>
                <div className="flex-1 grid grid-cols-3 gap-1.5 p-2">
                  <span className="rounded-md bg-white/[0.05]" />
                  <span className="rounded-md bg-white/[0.05]" />
                  <span className="rounded-md bg-white/[0.05]" />
                </div>
              </div>
            }
          />
          <LayoutCard
            active={layoutMode === "navbar"}
            onClick={() => onSelectLayout("navbar")}
            icon={LayoutPanelLeft}
            title="Thanh điều hướng trái"
            desc="Menu dọc bên trái, có thể thu gọn thành biểu tượng."
            preview={
              <div className="w-full h-full flex">
                <div className="w-7 bg-[#0b0b16] border-r border-white/[0.06] flex flex-col items-center gap-1.5 py-2">
                  <span className="w-3.5 h-2 rounded-full bg-gradient-to-r from-violet-500/70 to-fuchsia-500/40" />
                  <span className="w-3.5 h-2 rounded-full bg-white/10" />
                  <span className="w-3.5 h-2 rounded-full bg-white/10" />
                </div>
                <div className="flex-1 grid grid-cols-2 gap-1.5 p-2">
                  <span className="rounded-md bg-white/[0.05]" />
                  <span className="rounded-md bg-white/[0.05]" />
                  <span className="rounded-md bg-white/[0.05]" />
                  <span className="rounded-md bg-white/[0.05]" />
                </div>
              </div>
            }
          />
        </div>

        {/* Navbar collapse option */}
        <div
          className={`mt-4 flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 relative z-10 ${
            layoutMode === "navbar"
              ? "bg-white/[0.03] border-white/[0.07]"
              : "bg-white/[0.01] border-white/[0.04] opacity-45 pointer-events-none"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <PanelLeftClose className="w-4 h-4 text-neutral-400" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-white">Thu gọn thanh điều hướng</div>
              <div className="text-[11px] text-neutral-500">Chỉ hiện biểu tượng để tiết kiệm không gian.</div>
            </div>
          </div>
          <button
            onClick={onToggleNavbarCollapsed}
            role="switch"
            aria-checked={navbarCollapsed}
            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${
              navbarCollapsed ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]" : "bg-white/10"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                navbarCollapsed ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
