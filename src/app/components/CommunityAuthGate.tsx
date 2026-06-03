"use client";

import { useState } from "react";
import { Loader2, MessageSquare, Minus, Square, X, Eye, EyeOff } from "lucide-react";
import { useCommunityStore } from "../store/useCommunityStore";
import { toast } from "./Toast";

/**
 * Màn hình đăng nhập / đăng ký toàn màn hình — BẮT BUỘC để vào app.
 * Hiển thị khi đã kiểm tra phiên (authChecked) nhưng chưa đăng nhập.
 */
export default function CommunityAuthGate() {
  const login = useCommunityStore((s) => s.login);
  const register = useCommunityStore((s) => s.register);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().minimize();
  };
  const handleMaximize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const fs = await win.isFullscreen();
    win.setFullscreen(!fs);
  };
  const handleClose = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("quit_app");
    } catch {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      getCurrentWindow().close();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "login") {
        await toast.promise(login(identifier.trim(), password), {
          loading: "Đang đăng nhập...",
          success: "Đăng nhập thành công!",
          error: (err) => err?.message || "Đăng nhập thất bại.",
        });
      } else {
        await toast.promise(
          register({
            username: username.trim(),
            email: email.trim(),
            password,
            displayName: displayName.trim() || undefined,
          }),
          {
            loading: "Đang tạo tài khoản...",
            success: "Tạo tài khoản thành công!",
            error: (err) => err?.message || "Đăng ký thất bại.",
          }
        );
      }
    } catch {
      /* toast đã báo lỗi */
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 focus:bg-white/[0.05] transition-all";

  return (
    <div className="w-full h-full relative z-10 flex flex-col text-white overflow-hidden bg-[#06060d] bg-dot-pattern">
      {/* Aurora nền */}
      <div className="aurora-blob animate-aurora top-[-22%] left-[-12%] w-[55%] h-[55%]" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.28), transparent 70%)" }} />
      <div className="aurora-blob animate-float-reverse bottom-[-24%] right-[-10%] w-[50%] h-[50%]" style={{ background: "radial-gradient(circle, rgba(217,70,239,0.18), transparent 70%)" }} />

      {/* Thanh tiêu đề kéo + nút cửa sổ */}
      <div data-tauri-drag-region="true" className="w-full h-11 flex items-center justify-between pl-4 select-none relative z-50 flex-shrink-0 cursor-move">
        <div data-tauri-drag-region="false" className="flex items-center gap-2.5 cursor-default">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/10 border border-white/10 flex items-center justify-center">
            <img src="/logo.svg" alt="Logo" className="w-4 h-4 object-contain" />
          </div>
          <div className="text-[13px] font-black tracking-tight text-white flex items-center">
            <span>htss</span>
            <span className="text-grad">.club</span>
          </div>
        </div>
        <div data-tauri-drag-region="false" className="flex items-center h-full">
          <button onClick={handleMinimize} className="h-full px-3.5 hover:bg-white/[0.06] transition-colors text-neutral-400 hover:text-white cursor-pointer">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleMaximize} className="h-full px-3.5 hover:bg-white/[0.06] transition-colors text-neutral-400 hover:text-white cursor-pointer">
            <Square className="w-3 h-3" />
          </button>
          <button onClick={handleClose} className="h-full px-3.5 hover:bg-rose-500 hover:text-white transition-colors text-neutral-400 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        <div className="relative w-full max-w-[400px] glass rounded-2xl p-7 shadow-2xl animate-pop-in overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500/25 to-fuchsia-500/10 border border-white/10 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.25)] mb-3">
              <MessageSquare className="w-7 h-7 text-violet-300" />
            </div>
            <h2 className="text-lg font-black text-white">
              {mode === "login" ? "Đăng nhập HTSS Club" : "Tạo tài khoản mới"}
            </h2>
            <p className="text-[12px] text-neutral-500 mt-1">
              {mode === "login"
                ? "Đăng nhập để bắt đầu sử dụng ứng dụng."
                : "Tham gia cộng đồng HTSS Club ngay hôm nay."}
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === "login" ? (
              <input
                className={inputCls}
                placeholder="Email hoặc tên đăng nhập"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
              />
            ) : (
              <>
                <input className={inputCls} placeholder="Tên đăng nhập" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
                <input className={inputCls} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className={inputCls} placeholder="Tên hiển thị (tuỳ chọn)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </>
            )}
            <div className="relative">
              <input
                className={`${inputCls} pr-10`}
                placeholder="Mật khẩu"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-500 hover:text-neutral-300 cursor-pointer"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "login" ? "Đăng nhập" : "Đăng ký"}
            </button>
          </form>

          <div className="mt-5 text-center text-[12px] text-neutral-500">
            {mode === "login" ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="text-violet-400 hover:text-violet-300 font-bold cursor-pointer"
            >
              {mode === "login" ? "Đăng ký" : "Đăng nhập"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
