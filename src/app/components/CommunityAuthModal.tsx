"use client";

import { useState } from "react";
import { Loader2, MessageSquare, X } from "lucide-react";
import { useCommunityStore } from "../store/useCommunityStore";
import { toast } from "./Toast";

/**
 * Modal đăng nhập / đăng ký cộng đồng — mount toàn cục ở app level.
 * Mở bằng useCommunityStore().openAuthModal().
 */
export default function CommunityAuthModal() {
  const open = useCommunityStore((s) => s.authModalOpen);
  const closeAuthModal = useCommunityStore((s) => s.closeAuthModal);
  const login = useCommunityStore((s) => s.login);
  const register = useCommunityStore((s) => s.register);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

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
      // reset form
      setPassword("");
    } catch {
      /* toast đã báo lỗi */
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 focus:bg-white/[0.05] transition-all";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={() => !busy && closeAuthModal()}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-[400px] glass rounded-2xl p-7 shadow-2xl animate-pop-in overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <button
          onClick={() => closeAuthModal()}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500/25 to-fuchsia-500/10 border border-white/10 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.25)] mb-3">
            <MessageSquare className="w-7 h-7 text-violet-300" />
          </div>
          <h2 className="text-lg font-black text-white">
            {mode === "login" ? "Đăng nhập HTSS Club" : "Tạo tài khoản mới"}
          </h2>
          <p className="text-[12px] text-neutral-500 mt-1">
            {mode === "login"
              ? "Kết nối, trò chuyện và chia sẻ cùng cộng đồng."
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
          <input
            className={inputCls}
            placeholder="Mật khẩu"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
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
  );
}
