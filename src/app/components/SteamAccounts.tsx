"use client";

import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  User, Trash2, Check, RefreshCw, AlertCircle, Loader2,
  LogIn, LogOut, ExternalLink, Clock, Plus, FolderOpen, Hash, Copy,
} from "lucide-react";
import ContextMenu, { ContextMenuState } from "./ContextMenu";
import { toast } from "./Toast";

interface SteamAccount {
  steam_id: string;
  account_name: string;
  persona_name: string;
  remember_password: boolean;
  most_recent: boolean;
  timestamp: number;
  in_vdf?: boolean;
}

interface SteamAccountsProps {
  reloadKey?: number;
}

export default function SteamAccounts({ reloadKey }: SteamAccountsProps) {
  const [accounts, setAccounts] = useState<SteamAccount[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const loadAvatars = useCallback(async (list: SteamAccount[]) => {
    const entries = await Promise.all(
      list.map(async (acc) => {
        try {
          const data = await invoke<string | null>("get_steam_avatar", { steamId: acc.steam_id });
          return [acc.steam_id, data] as const;
        } catch {
          return [acc.steam_id, null] as const;
        }
      })
    );
    const map: Record<string, string> = {};
    for (const [id, data] of entries) {
      if (data) map[id] = data;
    }
    setAvatars(map);
  }, []);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const list = await invoke<SteamAccount[]>("get_steam_accounts");
      setAccounts(list);
      try {
        const active = await invoke<string | null>("get_active_steam_account");
        setActiveUser(active);
      } catch { /* ignore */ }
      loadAvatars(list);
    } catch (err: any) {
      toast.error("Lỗi tải tài khoản Steam: " + err.toString());
    } finally {
      setLoading(false);
    }
  }, [loadAvatars]);

  useEffect(() => {
    loadData(true);
  }, [loadData, reloadKey]);

  const handleSwitch = async (acc: SteamAccount) => {
    if (actionLoading) return;
    setActionLoading(true);
    setSwitchingId(acc.steam_id);
    const name = acc.persona_name || acc.account_name;
    try {
      await toast.promise(
        invoke("switch_steam_account", { accountName: acc.account_name, steamId: acc.steam_id }),
        {
          loading: `Đang chuyển sang ${name}... Steam sẽ khởi động lại.`,
          success: `Đã chuyển sang ${acc.account_name}! Steam đang tự đăng nhập.`,
          error: (e) => "Lỗi chuyển tài khoản: " + e.toString(),
        }
      );
      setActiveUser(acc.account_name);
      setTimeout(() => loadData(), 1500);
    } catch { /* toast đã hiển thị lỗi */ }
    finally {
      setActionLoading(false);
      setSwitchingId(null);
    }
  };

  const handleRemove = (acc: SteamAccount) => {
    const doRemove = async () => {
      setActionLoading(true);
      try {
        await toast.promise(invoke("remove_steam_account", { steamId: acc.steam_id }), {
          loading: "Đang gỡ tài khoản khỏi danh sách...",
          success: "Đã gỡ tài khoản khỏi danh sách quản lý.",
          error: (e) => e.toString(),
        });
        await loadData();
      } catch { /* ignore */ }
      finally { setActionLoading(false); }
    };
    if (window.confirmCustom) {
      window.confirmCustom({
        title: "Gỡ khỏi danh sách",
        message: `Gỡ "${acc.account_name}" khỏi danh sách quản lý của app? (Không ảnh hưởng tới Steam, không xoá dữ liệu game)`,
        confirmText: "Gỡ khỏi danh sách",
        cancelText: "Hủy",
        type: "danger",
        onConfirm: doRemove,
      });
    } else {
      doRemove();
    }
  };

  const handleRemoveFromSteam = (acc: SteamAccount) => {
    const doRemove = async () => {
      setActionLoading(true);
      try {
        await toast.promise(invoke("remove_steam_from_vdf", { steamId: acc.steam_id }), {
          loading: `Đang gỡ "${acc.account_name}" khỏi đăng nhập Steam...`,
          success: `Đã gỡ "${acc.account_name}" khỏi màn hình đăng nhập Steam.`,
          error: (e) => e.toString(),
        });
        await loadData();
      } catch { /* ignore */ }
      finally { setActionLoading(false); }
    };
    if (window.confirmCustom) {
      window.confirmCustom({
        title: "Gỡ khỏi Steam",
        message: `Gỡ "${acc.account_name}" khỏi màn hình đăng nhập của Steam (loginusers.vdf)? Tài khoản vẫn còn trong danh sách quản lý và đăng nhập lại được. Không xoá dữ liệu game.`,
        confirmText: "Gỡ khỏi Steam",
        cancelText: "Hủy",
        type: "danger",
        onConfirm: doRemove,
      });
    } else {
      doRemove();
    }
  };

  const handleLaunchSteam = async () => {
    try {
      await invoke("launch_steam");
      toast.info("Đang mở Steam...");
    } catch (err: any) {
      toast.error(err.toString());
    }
  };

  const handleAddAccount = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await toast.promise(invoke("add_steam_account"), {
        loading: "Đang mở Steam ở màn hình đăng nhập...",
        success: "Đã mở Steam. Đăng nhập tài khoản mới (nhớ tích 'Ghi nhớ mật khẩu'), xong bấm 'Tải lại'.",
        error: (e) => e.toString(),
      });
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  const handleLogout = async () => {
    if (actionLoading) return;
    const doLogout = async () => {
      setActionLoading(true);
      try {
        await toast.promise(invoke("logout_steam_account"), {
          loading: "Đang đăng xuất & xoá tài khoản khỏi Steam...",
          success: "Đã đăng xuất khỏi Steam. Đăng nhập lại tài khoản nào sẽ tự lưu lại vào danh sách.",
          error: (e) => e.toString(),
        });
        setActiveUser(null);
        setTimeout(() => loadData(), 1500);
      } catch { /* ignore */ }
      finally { setActionLoading(false); }
    };
    if (window.confirmCustom) {
      window.confirmCustom({
        title: "Đăng xuất Steam",
        message: "Xoá tất cả tài khoản khỏi màn hình đăng nhập Steam và đăng xuất? Tài khoản nào đăng nhập lại sẽ tự xuất hiện lại trong danh sách.",
        confirmText: "Đăng xuất",
        cancelText: "Hủy",
        type: "warning",
        onConfirm: doLogout,
      });
    } else {
      doLogout();
    }
  };

  const handleOpenFolder = async (acc: SteamAccount) => {
    try {
      await invoke("open_steam_userdata", { steamId: acc.steam_id });
    } catch (err: any) {
      toast.error(err.toString());
    }
  };

  const handleCopySteamId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Đã sao chép SteamID64.");
    } catch {
      toast.error("Không sao chép được.");
    }
  };

  const openContextMenu = (e: React.MouseEvent, acc: SteamAccount) => {
    e.preventDefault();
    const active = isActive(acc);
    const items: ContextMenuState["items"] = [];

    if (!active) {
      items.push({ label: "Đăng nhập tài khoản này", icon: LogIn, accent: "sky", onClick: () => handleSwitch(acc) });
    }
    items.push({ label: "Mở thư mục userdata", icon: FolderOpen, onClick: () => handleOpenFolder(acc) });
    items.push({ label: "Sao chép SteamID64", icon: Copy, onClick: () => handleCopySteamId(acc.steam_id) });
    items.push({ type: "separator" });
    if (acc.in_vdf && !active) {
      items.push({ label: "Gỡ khỏi đăng nhập Steam", icon: LogOut, accent: "amber", onClick: () => handleRemoveFromSteam(acc) });
    }
    items.push({ label: "Gỡ khỏi danh sách app", icon: Trash2, danger: true, onClick: () => handleRemove(acc) });

    setMenu({ x: e.clientX, y: e.clientY, header: acc.persona_name || acc.account_name, items });
  };

  // SteamID3 (account id) = SteamID64 - 76561197960265728
  const steam3 = (id64: string) => {
    try {
      const v = BigInt(id64) - BigInt("76561197960265728");
      return v >= BigInt(0) ? v.toString() : id64;
    } catch {
      return id64;
    }
  };

  const isActive = (acc: SteamAccount) =>
    activeUser != null && acc.account_name.toLowerCase() === activeUser.toLowerCase();

  const formatTime = (ts: number) => {
    if (!ts) return "Không rõ";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  if (loading && accounts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[450px]">
        <Loader2 className="w-12 h-12 text-sky-500 animate-spin mb-4" />
        <p className="text-neutral-400 font-medium">Đang tải tài khoản Steam...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full mt-6 select-none animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center border border-sky-500/30">
            <User className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Tài Khoản Steam</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Chuyển đổi nhanh giữa các tài khoản đã lưu trên Steam</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddAccount}
            disabled={actionLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:bg-sky-500/50 text-white border border-sky-400/30 transition-colors cursor-pointer text-xs font-bold shadow-[0_0_15px_rgba(56,189,248,0.2)]"
          >
            <Plus className="w-4 h-4" /> Thêm tài khoản
          </button>
          <button
            onClick={handleLogout}
            disabled={actionLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/30 transition-colors cursor-pointer text-xs font-bold"
            data-tip="Gỡ tất cả tài khoản khỏi đăng nhập Steam"
            data-tip-pos="bottom"
          >
            <LogOut className="w-4 h-4" /> Đăng xuất tất cả
          </button>
          <button
            onClick={handleLaunchSteam}
            disabled={actionLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 hover:border-sky-500/30 transition-colors cursor-pointer text-xs font-bold"
          >
            <ExternalLink className="w-4 h-4" /> Mở Steam
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={actionLoading || loading}
            className="p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            data-tip="Tải lại danh sách"
            data-tip-pos="bottom"
          >
            <RefreshCw className={`w-4 h-4 ${actionLoading || loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Empty state */}
      {accounts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4">
            <User className="w-7 h-7 text-sky-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Chưa có tài khoản nào</h3>
          <p className="text-sm text-neutral-500 max-w-md mb-4">
            Hãy đăng nhập ít nhất một tài khoản trên Steam (nhớ tích "Ghi nhớ mật khẩu") để nó hiện ở đây và có thể chuyển đổi nhanh.
          </p>
          <button
            onClick={handleAddAccount}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:bg-sky-500/50 text-white text-sm font-bold transition-colors cursor-pointer shadow-[0_0_15px_rgba(56,189,248,0.2)]"
          >
            <Plus className="w-4 h-4" /> Thêm tài khoản Steam
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {accounts.map((acc) => {
            const active = isActive(acc);
            const switching = switchingId === acc.steam_id;
            return (
              <div
                key={acc.steam_id}
                onContextMenu={(e) => openContextMenu(e, acc)}
                className={`group relative rounded-2xl border transition-all duration-300 p-4 flex flex-col gap-3 ${
                  active
                    ? "border-emerald-500/30 bg-emerald-500/[0.04] shadow-[0_0_24px_rgba(16,185,129,0.07)]"
                    : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.035]"
                }`}
              >
                {/* Top: avatar + identity + status */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`relative w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center border flex-shrink-0 ${
                    active ? "border-emerald-500/40" : "border-white/10"
                  }`}>
                    {avatars[acc.steam_id] ? (
                      <img src={avatars[acc.steam_id]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-black/40 flex items-center justify-center">
                        <User className="w-6 h-6 text-neutral-500" />
                      </div>
                    )}
                    {active && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0b0b14] flex items-center justify-center">
                        <Check className="w-3 h-3 text-black" strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-white text-base truncate leading-tight">{acc.persona_name || acc.account_name}</h3>
                    <p className="text-xs text-neutral-500 truncate">{acc.account_name}</p>
                  </div>

                  {/* Status badge */}
                  {active ? (
                    <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 tracking-wider flex-shrink-0">ĐANG DÙNG</span>
                  ) : acc.in_vdf ? (
                    <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 tracking-wider flex-shrink-0">CÓ TRÊN STEAM</span>
                  ) : (
                    <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-neutral-500/10 text-neutral-400 border border-neutral-500/20 tracking-wider flex-shrink-0">ĐÃ LƯU</span>
                  )}
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-3 text-[10px] text-neutral-600 pl-0.5">
                  <span className="flex items-center gap-1" data-tip="SteamID3 (account id)">
                    <Hash className="w-3 h-3" />
                    {steam3(acc.steam_id)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(acc.timestamp)}
                  </span>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/5" />

                {/* Action bar */}
                <div className="flex items-center justify-between gap-2">
                  {/* Primary action */}
                  {active ? (
                    <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
                      <Check className="w-3.5 h-3.5" /> Đang sử dụng
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSwitch(acc)}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border-sky-500/25 hover:border-sky-500/40"
                    >
                      {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                      Đăng nhập
                    </button>
                  )}

                  {/* Icon toolbar */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenFolder(acc)}
                      disabled={actionLoading}
                      className="p-2 bg-white/[0.03] hover:bg-white/[0.08] text-neutral-400 hover:text-white rounded-lg border border-white/5 hover:border-white/10 transition-all cursor-pointer disabled:opacity-50"
                      data-tip="Mở thư mục userdata"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                    {acc.in_vdf && !active && (
                      <button
                        onClick={() => handleRemoveFromSteam(acc)}
                        disabled={actionLoading}
                        className="p-2 bg-amber-500/5 hover:bg-amber-500/15 text-amber-400 rounded-lg border border-amber-500/10 hover:border-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                        data-tip="Gỡ khỏi đăng nhập Steam"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(acc)}
                      disabled={actionLoading}
                      className="p-2 bg-red-500/5 hover:bg-red-500/15 text-red-400 rounded-lg border border-red-500/10 hover:border-red-500/20 transition-all cursor-pointer disabled:opacity-50"
                      data-tip="Gỡ khỏi danh sách app"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <div className="mt-6 flex items-start gap-2.5 p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <AlertCircle className="w-4 h-4 text-neutral-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-neutral-500 leading-relaxed">
          Tài khoản đang đăng nhập hiển thị ở đầu danh sách. Nhãn <span className="text-sky-400 font-semibold">CÓ TRÊN STEAM</span> = đang lưu trong loginusers.vdf, <span className="text-neutral-300 font-semibold">ĐÃ LƯU</span> = chỉ còn trong danh sách app.
          Các nút: <span className="text-neutral-300 font-semibold">📁 mở thư mục userdata</span>, <span className="text-amber-400 font-semibold">⤴ gỡ khỏi đăng nhập Steam</span>, <span className="text-red-400 font-semibold">🗑 gỡ khỏi danh sách app</span>. "Đăng xuất tất cả" gỡ mọi tài khoản khỏi Steam. <span className="text-neutral-400">Chuột phải vào thẻ tài khoản để mở thêm tùy chọn.</span>
        </p>
      </div>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
