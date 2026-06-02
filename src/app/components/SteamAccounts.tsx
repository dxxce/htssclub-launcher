"use client";

import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  User, Trash2, Check, RefreshCw, AlertCircle, Loader2,
  LogIn, ExternalLink, Clock, Plus,
} from "lucide-react";

interface SteamAccount {
  steam_id: string;
  account_name: string;
  persona_name: string;
  remember_password: boolean;
  most_recent: boolean;
  timestamp: number;
  has_session?: boolean;
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
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const showStatus = (type: "success" | "error" | "info", text: string) => {
    setStatus({ type, text });
    setTimeout(() => setStatus(null), 6000);
  };

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
      showStatus("error", "Lỗi tải tài khoản Steam: " + err.toString());
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
    showStatus("info", `Đang chuyển sang ${acc.persona_name || acc.account_name}... Steam sẽ khởi động lại.`);
    try {
      await invoke("switch_steam_account", { accountName: acc.account_name, steamId: acc.steam_id });
      setActiveUser(acc.account_name);
      showStatus("success", `Đã chuyển sang ${acc.account_name}! Steam đang tự đăng nhập.`);
      setTimeout(() => loadData(), 1500);
    } catch (err: any) {
      showStatus("error", err.toString());
    } finally {
      setActionLoading(false);
      setSwitchingId(null);
    }
  };

  const handleRemove = (acc: SteamAccount) => {
    const doRemove = async () => {
      setActionLoading(true);
      try {
        await invoke("remove_steam_account", { steamId: acc.steam_id });
        showStatus("success", "Đã gỡ tài khoản khỏi danh sách.");
        await loadData();
      } catch (err: any) {
        showStatus("error", err.toString());
      } finally {
        setActionLoading(false);
      }
    };
    if (window.confirmCustom) {
      window.confirmCustom({
        title: "Gỡ tài khoản Steam",
        message: `Gỡ "${acc.account_name}" khỏi danh sách đăng nhập của Steam? (Không xoá dữ liệu game)`,
        confirmText: "Gỡ tài khoản",
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
      showStatus("info", "Đang mở Steam...");
    } catch (err: any) {
      showStatus("error", err.toString());
    }
  };

  const handleAddAccount = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    showStatus("info", "Steam sẽ khởi động lại ở màn hình đăng nhập. Hãy đăng nhập tài khoản mới và tích 'Ghi nhớ mật khẩu'.");
    try {
      await invoke("add_steam_account");
      showStatus("success", "Đã mở Steam ở màn hình đăng nhập. Đăng nhập xong, bấm 'Tải lại' để thấy tài khoản mới.");
    } catch (err: any) {
      showStatus("error", err.toString());
    } finally {
      setActionLoading(false);
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
      {/* Status banner */}
      {status && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border mb-6 text-sm transition-all duration-300 ${
          status.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
          status.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" :
          "bg-sky-500/10 border-sky-500/20 text-sky-400"
        }`}>
          {status.type === "info" ? <Loader2 className="w-4 h-4 mt-0.5 animate-spin flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span className="font-semibold leading-relaxed">{status.text}</span>
        </div>
      )}

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
            title="Tải lại"
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((acc) => {
            const active = isActive(acc);
            const switching = switchingId === acc.steam_id;
            return (
              <div
                key={acc.steam_id}
                className={`relative rounded-2xl overflow-hidden border transition-all duration-300 p-5 flex items-center justify-between gap-4 ${
                  active
                    ? "border-emerald-500/30 bg-emerald-500/[0.03] shadow-[0_0_20px_rgba(16,185,129,0.06)]"
                    : "border-white/5 bg-white/[0.02] hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`relative w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center border flex-shrink-0 ${
                    active ? "border-emerald-500/30" : "border-white/10"
                  }`}>
                    {avatars[acc.steam_id] ? (
                      <img src={avatars[acc.steam_id]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-black/40 flex items-center justify-center">
                        <User className="w-6 h-6 text-neutral-500" />
                      </div>
                    )}
                    {active && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#070710] flex items-center justify-center">
                        <Check className="w-3 h-3 text-black" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-white text-base truncate">{acc.persona_name || acc.account_name}</h3>
                      {acc.most_recent && !active && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 tracking-wider flex-shrink-0">GẦN ĐÂY</span>
                      )}
                      {!acc.has_session && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 tracking-wider flex-shrink-0">CẦN ĐĂNG NHẬP LẠI</span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5 truncate">{acc.account_name}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-neutral-600">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(acc.timestamp)}</span>
                      {!acc.has_session && (
                        <span className="text-amber-500/80 ml-1">• Phiên đã hết, sẽ cần nhập mật khẩu</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRemove(acc)}
                    disabled={actionLoading}
                    className="p-2.5 bg-red-500/5 hover:bg-red-500/15 text-red-400 rounded-xl border border-red-500/10 hover:border-red-500/20 transition-all cursor-pointer disabled:opacity-50"
                    title="Gỡ khỏi danh sách"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {active ? (
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
                      <Check className="w-3.5 h-3.5" /> ĐANG DÙNG
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSwitch(acc)}
                      disabled={actionLoading}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                        acc.has_session
                          ? "bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/20 hover:border-sky-500/30"
                          : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 hover:border-amber-500/30"
                      }`}
                      title={acc.has_session ? "Đăng nhập thẳng tài khoản này" : "Mở Steam để đăng nhập lại tài khoản này"}
                    >
                      {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                      {acc.has_session ? "Chuyển sang" : "Đăng nhập lại"}
                    </button>
                  )}
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
          Khi bấm "Chuyển sang", Steam sẽ tự tắt rồi mở lại đăng nhập tài khoản đã chọn. Chỉ tài khoản còn phiên đăng nhập (đã đăng nhập gần đây với "Ghi nhớ mật khẩu") mới vào thẳng được. Tài khoản gắn nhãn "Cần đăng nhập lại" sẽ mở Steam ra màn hình nhập mật khẩu — đăng nhập một lần là lần sau chuyển nhanh được.
        </p>
      </div>
    </div>
  );
}
