"use client";

import { useEffect, useRef, useState } from "react";
import { 
  User, Trash2, Check, Plus, RefreshCw, 
  AlertCircle, Loader2, Laptop, LogOut, KeyRound, Eye, EyeOff, ChevronDown, ExternalLink
} from "lucide-react";
import { useValorantStore } from "../store/useValorantStore";

const SHARD_OPTIONS = [
  { value: "ap", label: "Châu Á - Thái Bình Dương (AP)" },
  { value: "na", label: "Bắc Mỹ / LATAM / BR (NA)" },
  { value: "eu", label: "Châu Âu (EU)" },
  { value: "kr", label: "Hàn Quốc (KR)" },
];

export default function ValorantAccounts() {
  const {
    savedAccounts: accounts,
    activePuuid,
    loading: storeLoading,
    loadAccounts: loadData,
    setActiveAccount: handleSelectAccountStore,
    deleteAccount: handleDeleteAccountStore,
    addClientAccount: handleAddClientStore,
    addCredentialsAccount: handleAddCredentialsStore,
    addBrowserAccount: handleAddBrowserStore,
    refreshAccount: handleRefreshStore,
    logoutClientKeepSession: handleLogoutKeepSessionStore
  } = useValorantStore();

  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Form đăng nhập bằng tài khoản/mật khẩu (lưu phiên đám mây, tự gia hạn).
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginShard, setLoginShard] = useState("ap");
  const [showPass, setShowPass] = useState(false);
  const [showPassLogin, setShowPassLogin] = useState(false);
  const [shardOpen, setShardOpen] = useState(false);
  const [refreshingPuuid, setRefreshingPuuid] = useState<string | null>(null);
  const shardRef = useRef<HTMLDivElement | null>(null);

  // Đóng dropdown chọn khu vực khi click ra ngoài.
  useEffect(() => {
    if (!shardOpen) return;
    const onClick = (e: MouseEvent) => {
      if (shardRef.current && !shardRef.current.contains(e.target as Node)) {
        setShardOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [shardOpen]);

  const showStatus = (type: "success" | "error" | "info", text: string) => {
    setStatus({ type, text });
    setTimeout(() => {
      setStatus(null);
    }, 6000);
  };

  const handleSelectAccount = async (puuid: string) => {
    try {
      setActionLoading(true);
      await handleSelectAccountStore(puuid);
      showStatus("success", "Đã chuyển đổi tài khoản thành công!");
    } catch (err: any) {
      showStatus("error", "Lỗi chuyển đổi tài khoản: " + err.toString());
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAccount = (puuid: string) => {
    if (window.confirmCustom) {
      window.confirmCustom({
        title: "Xóa tài khoản",
        message: "Bạn có chắc chắn muốn xóa tài khoản này khỏi danh sách đã lưu?",
        confirmText: "Xóa tài khoản",
        cancelText: "Hủy",
        type: "danger",
        onConfirm: async () => {
          try {
            setActionLoading(true);
            await handleDeleteAccountStore(puuid);
            showStatus("success", "Đã xóa tài khoản thành công!");
          } catch (err: any) {
            showStatus("error", "Lỗi khi xóa tài khoản: " + err.toString());
          } finally {
            setActionLoading(false);
          }
        }
      });
    } else {
      if (confirm("Bạn có chắc chắn muốn xóa tài khoản này khỏi danh sách đã lưu?")) {
        (async () => {
          try {
            setActionLoading(true);
            await handleDeleteAccountStore(puuid);
            showStatus("success", "Đã xóa tài khoản thành công!");
          } catch (err: any) {
            showStatus("error", "Lỗi khi xóa tài khoản: " + err.toString());
          } finally {
            setActionLoading(false);
          }
        })();
      }
    }
  };

  const handleAddClient = async () => {
    try {
      setActionLoading(true);
      setStatus({ type: "info", text: "Đang quét Riot Client đang chạy ở local..." });
      await handleAddClientStore();
      showStatus("success", `Lưu thành công tài khoản mới từ Riot Client!`);
    } catch (err: any) {
      showStatus("error", err.toString());
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCredentials = async () => {
    if (!loginUser.trim() || !loginPass) {
      showStatus("error", "Vui lòng nhập đầy đủ tài khoản và mật khẩu Riot.");
      return;
    }
    try {
      setActionLoading(true);
      setStatus({ type: "info", text: "Đang đăng nhập vào Riot... (có thể mất vài giây)" });
      await handleAddCredentialsStore(loginUser.trim(), loginPass, loginShard);
      setLoginUser("");
      setLoginPass("");
      showStatus("success", "Đăng nhập & lưu tài khoản thành công! Phiên sẽ tự động gia hạn.");
    } catch (err: any) {
      showStatus("error", err.toString().replace(/^Error:\s*/, ""));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddBrowser = async () => {
    try {
      setActionLoading(true);
      setStatus({ type: "info", text: "Đã mở cửa sổ đăng nhập Riot. Vui lòng đăng nhập trong cửa sổ vừa hiện ra..." });
      await handleAddBrowserStore(loginShard);
      showStatus("success", "Đăng nhập & lưu tài khoản thành công! Phiên sẽ tự động gia hạn.");
    } catch (err: any) {
      showStatus("error", err.toString().replace(/^Error:\s*/, ""));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshAccount = async (puuid: string) => {
    const acc = accounts.find((a) => a.puuid === puuid);
    try {
      setRefreshingPuuid(puuid);
      await handleRefreshStore(puuid);
      showStatus("success", "Đã gia hạn phiên đăng nhập thành công!");
    } catch (err: any) {
      const msg = err.toString();
      if (msg.includes("SESSION_EXPIRED") || msg.includes("REAUTH_EXPIRED")) {
        if (acc?.login_type === "credentials") {
          showStatus("error", "Phiên đã hết hạn hoàn toàn. Vui lòng đăng nhập lại bằng mật khẩu.");
        } else {
          showStatus("error", "Phiên đã hết hạn. Hãy mở Riot Client, đăng nhập lại tài khoản này rồi nhấn 'Lưu TK từ Riot Client đang chạy' để cập nhật.");
        }
      } else {
        showStatus("error", "Lỗi gia hạn phiên: " + msg);
      }
    } finally {
      setRefreshingPuuid(null);
    }
  };

  const handleLogoutKeepSession = async () => {
    try {
      setActionLoading(true);
      setStatus({ type: "info", text: "Đang tiến hành đăng xuất khỏi Riot Client..." });
      await handleLogoutKeepSessionStore();
      showStatus("success", "Đăng xuất thành công! (Phiên đăng nhập đã lưu vẫn an toàn)");
    } catch (err: any) {
      showStatus("error", "Lỗi đăng xuất: " + err.toString());
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (storeLoading && accounts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[450px]">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
        <p className="text-neutral-400 font-medium">Đang tải dữ liệu tài khoản...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full mt-6 select-none animate-fadeIn">
      {/* Banner status notification */}
      {status && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border mb-6 text-sm transition-all duration-300 ${
          status.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
          status.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" :
          "bg-blue-500/10 border-blue-500/20 text-blue-400"
        }`}>
          {status.type === "info" ? <Loader2 className="w-4 h-4 mt-0.5 animate-spin flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span className="font-semibold leading-relaxed">{status.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT & CENTER: Saved Accounts List */}
        <div className="xl:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                <User className="w-4 h-4 text-purple-400" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">Tài Khoản Đã Lưu</h2>
            </div>
            <button 
              onClick={loadData}
              disabled={actionLoading || storeLoading}
              className="p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${actionLoading || storeLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Riot Client default running item */}
            <div 
              className={`relative rounded-2xl overflow-hidden border transition-all duration-300 bg-white/[0.02] p-5 flex items-center justify-between ${
                activePuuid === "running_client" 
                  ? "border-emerald-500/30 bg-emerald-500/[0.02] shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
                  : "border-white/5 hover:border-white/10"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border backdrop-blur-md ${
                  activePuuid === "running_client" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-black/40 border-white/10"
                }`}>
                  <Laptop className={`w-6 h-6 ${activePuuid === "running_client" ? "text-emerald-400" : "text-neutral-400"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-white text-base">Riot Client Đang Chạy</h3>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-neutral-500/10 text-neutral-400 border border-neutral-500/20 tracking-wider">MẶC ĐỊNH</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">Tự động sử dụng tài khoản hiện đang mở trên máy tính</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {activePuuid === "running_client" ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
                    <Check className="w-3.5 h-3.5" />
                    ĐANG CHỌN
                  </div>
                ) : (
                  <button 
                    onClick={() => handleSelectAccount("running_client")}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold border border-white/5 hover:border-white/10 transition-colors cursor-pointer"
                  >
                    Chọn sử dụng
                  </button>
                )}
              </div>
            </div>

            {/* List of saved accounts */}
            {accounts.length > 0 ? (
              accounts.map((acc) => {
                const isActive = activePuuid === acc.puuid;
                return (
                  <div 
                    key={acc.puuid}
                    className={`relative rounded-2xl overflow-hidden border transition-all duration-300 bg-white/[0.02] p-5 flex items-center justify-between ${
                      isActive 
                        ? "border-emerald-500/30 bg-emerald-500/[0.02] shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
                        : "border-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border backdrop-blur-md ${
                        isActive ? "bg-emerald-500/10 border-emerald-500/20" : "bg-black/40 border-white/10"
                      }`}>
                        <User className={`w-6 h-6 ${isActive ? "text-emerald-400" : "text-neutral-400"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-white text-base">{acc.game_name}</h3>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-md tracking-wider border ${
                            acc.login_type === "credentials" 
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/20" 
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}>
                            {acc.login_type === "credentials" ? "MẬT KHẨU" : "RIOT CLIENT"}
                          </span>
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                            {acc.shard}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {acc.login_type === "credentials" 
                            ? "Lưu trữ đám mây, dùng cho dữ liệu (chưa đăng nhập được Client)" 
                            : "Đổi & đăng nhập trực tiếp vào Riot Client"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleRefreshAccount(acc.puuid)}
                        disabled={actionLoading || refreshingPuuid === acc.puuid}
                        className="p-2.5 bg-cyan-500/5 hover:bg-cyan-500/15 text-cyan-400 rounded-xl border border-cyan-500/10 hover:border-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
                        title="Gia hạn phiên đăng nhập"
                      >
                        <RefreshCw className={`w-4 h-4 ${refreshingPuuid === acc.puuid ? "animate-spin" : ""}`} />
                      </button>
                      <button 
                        onClick={() => handleDeleteAccount(acc.puuid)}
                        disabled={actionLoading}
                        className="p-2.5 bg-red-500/5 hover:bg-red-500/15 text-red-400 rounded-xl border border-red-500/10 hover:border-red-500/20 transition-all cursor-pointer"
                        title="Xóa tài khoản"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {isActive ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black">
                          <Check className="w-3.5 h-3.5" />
                          ĐANG CHỌN
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleSelectAccount(acc.puuid)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold border border-white/5 hover:border-white/10 transition-colors cursor-pointer"
                        >
                          Chọn sử dụng
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : null}
          </div>
        </div>

        {/* RIGHT SIDE: Add Accounts Methods */}
        <div className="flex flex-col gap-6">

          {/* Method 1: Login (browser is primary, password is fallback) */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                <KeyRound className="w-4 h-4 text-purple-400" />
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">Đăng Nhập Tài Khoản Riot</h3>
            </div>

            <div className="bg-gradient-to-b from-purple-500/[0.03] to-transparent border border-purple-500/10 rounded-2xl p-5 flex flex-col gap-3">
              <p className="text-xs text-neutral-400 leading-relaxed">
                Mở cửa sổ đăng nhập chính thức của Riot để đăng nhập an toàn. Hỗ trợ cả tài khoản bật <span className="text-purple-300 font-semibold">bảo mật 2 lớp (2FA)</span>. Phiên đăng nhập sẽ <span className="text-purple-300 font-semibold">tự động gia hạn</span>.
              </p>

              {/* Region picker (dùng chung cho cả 2 cách đăng nhập) */}
              <div className="relative" ref={shardRef}>
                <button
                  type="button"
                  onClick={() => !actionLoading && setShardOpen((o) => !o)}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-black/40 border border-white/10 hover:border-white/20 focus:border-purple-500/40 rounded-xl text-sm text-white outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="truncate">
                    {SHARD_OPTIONS.find((s) => s.value === loginShard)?.label ?? "Chọn khu vực"}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform duration-200 ${shardOpen ? "rotate-180" : ""}`} />
                </button>

                {shardOpen && (
                  <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-white/10 bg-[#0d0d14] shadow-[0_12px_30px_rgba(0,0,0,0.55)] overflow-hidden p-1 animate-fadeIn">
                    {SHARD_OPTIONS.map((s) => {
                      const selected = s.value === loginShard;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => { setLoginShard(s.value); setShardOpen(false); }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer ${
                            selected
                              ? "bg-purple-500/15 text-purple-200"
                              : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <span className="truncate">{s.label}</span>
                          {selected && <Check className="w-3.5 h-3.5 text-purple-300 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Primary: open Riot's official login window */}
              <button
                onClick={handleAddBrowser}
                disabled={actionLoading}
                className="w-full py-2.5 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 text-white rounded-xl font-bold text-xs shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Mở cửa sổ đăng nhập Riot
              </button>

              {/* Divider */}
              <button
                type="button"
                onClick={() => setShowPassLogin((s) => !s)}
                className="flex items-center gap-2 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer mt-1"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showPassLogin ? "rotate-180" : ""}`} />
                Hoặc đăng nhập nhanh bằng mật khẩu (không hỗ trợ 2FA)
              </button>

              {/* Fallback: direct username/password (may be blocked by captcha) */}
              {showPassLogin && (
                <div className="flex flex-col gap-3 pt-1 animate-fadeIn">
                  <input
                    type="text"
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    placeholder="Tên đăng nhập Riot"
                    autoComplete="off"
                    disabled={actionLoading}
                    className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 focus:border-purple-500/40 rounded-xl text-sm text-white placeholder:text-neutral-600 outline-none transition-colors"
                  />

                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddCredentials(); }}
                      placeholder="Mật khẩu"
                      autoComplete="off"
                      disabled={actionLoading}
                      className="w-full px-3.5 py-2.5 pr-10 bg-black/40 border border-white/10 focus:border-purple-500/40 rounded-xl text-sm text-white placeholder:text-neutral-600 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    onClick={handleAddCredentials}
                    disabled={actionLoading}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 disabled:bg-white/5 text-white rounded-xl font-bold text-xs border border-white/10 hover:border-purple-500/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Đăng nhập & Lưu tài khoản
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Method 2: Auto Link From Running Client */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center border border-red-500/30">
                <Laptop className="w-4 h-4 text-red-400" />
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">Liên Kết Riot Client</h3>
            </div>
            
            <div className="bg-gradient-to-b from-red-500/[0.03] to-transparent border border-red-500/10 rounded-2xl p-5 flex flex-col">
              <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                Nếu bạn đang mở Riot Client và đã đăng nhập tài khoản của mình trên máy tính, hệ thống sẽ tự động sao lưu cấu hình session để khôi phục nhanh sau này.
              </p>
              <button 
                onClick={handleAddClient}
                disabled={actionLoading}
                className="w-full py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white rounded-xl font-bold text-xs shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Lưu TK từ Riot Client đang chạy
              </button>

              <div className="h-px bg-white/5 my-4" />

              <button 
                onClick={handleLogoutKeepSession}
                disabled={actionLoading}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 disabled:bg-white/5 text-red-400 rounded-xl font-bold text-xs border border-white/5 hover:border-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.05)] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4 text-red-400" />
                Đăng xuất Riot Client (Giữ Session)
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
