"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, Info, Loader2, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "loading";

interface ToastItem {
  id: number;
  type: ToastType;
  text: string;
  leaving?: boolean;
  /** loading toast không tự ẩn cho tới khi resolve/update. */
  sticky?: boolean;
}

interface ToastApi {
  show: (type: ToastType, text: string) => number;
  update: (id: number, type: ToastType, text: string) => void;
  dismiss: (id: number) => void;
}

declare global {
  interface Window {
    __toastApi?: ToastApi;
  }
}

let counter = 0;

const TTL: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  error: 6000,
  loading: 0, // không tự ẩn
};

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = (id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  };

  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();

    const scheduleAutoHide = (id: number, type: ToastType) => {
      const ttl = TTL[type];
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      if (ttl > 0) {
        timers.set(id, setTimeout(() => remove(id), ttl));
      } else {
        timers.delete(id);
      }
    };

    const api: ToastApi = {
      show: (type, text) => {
        const id = ++counter;
        setToasts((prev) => [...prev.slice(-4), { id, type, text, sticky: type === "loading" }]);
        scheduleAutoHide(id, type);
        return id;
      },
      update: (id, type, text) => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, type, text, sticky: type === "loading", leaving: false } : t))
        );
        scheduleAutoHide(id, type);
      },
      dismiss: (id) => remove(id),
    };

    window.__toastApi = api;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      delete window.__toastApi;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[10000] flex flex-col-reverse gap-2.5 pointer-events-none select-none">
      {toasts.map((t) => {
        const accent =
          t.type === "success"
            ? "border-emerald-500/30 text-emerald-300"
            : t.type === "error"
            ? "border-rose-500/30 text-rose-300"
            : t.type === "loading"
            ? "border-violet-500/30 text-violet-300"
            : "border-sky-500/30 text-sky-300";
        const glow =
          t.type === "success"
            ? "shadow-[0_10px_30px_rgba(16,185,129,0.18)]"
            : t.type === "error"
            ? "shadow-[0_10px_30px_rgba(244,63,94,0.18)]"
            : t.type === "loading"
            ? "shadow-[0_10px_30px_rgba(139,92,246,0.18)]"
            : "shadow-[0_10px_30px_rgba(56,189,248,0.18)]";
        return (
          <div
            key={t.id}
            className={`pointer-events-auto relative flex items-start gap-2.5 min-w-[260px] max-w-[380px] rounded-xl border bg-[#101019]/95 backdrop-blur-xl pl-3.5 pr-9 py-3 ${accent} ${glow} ${
              t.leaving ? "animate-toast-out" : "animate-toast-in"
            }`}
          >
            <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
            <span className="mt-0.5 flex-shrink-0">
              {t.type === "success" ? (
                <CheckCircle className="w-4 h-4" />
              ) : t.type === "error" ? (
                <AlertCircle className="w-4 h-4" />
              ) : t.type === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Info className="w-4 h-4" />
              )}
            </span>
            <span className="text-[12px] font-semibold leading-relaxed text-neutral-100">{t.text}</span>
            {t.type !== "loading" && (
              <button
                onClick={() => remove(t.id)}
                className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function api(): ToastApi | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__toastApi;
}

/**
 * Hiển thị toast nhanh. Trả về id (dùng để update/dismiss nếu cần).
 */
export function toast(type: ToastType, text: string): number {
  return api()?.show(type, text) ?? -1;
}

toast.loading = (text: string): number => api()?.show("loading", text) ?? -1;
toast.success = (text: string): number => api()?.show("success", text) ?? -1;
toast.error = (text: string): number => api()?.show("error", text) ?? -1;
toast.info = (text: string): number => api()?.show("info", text) ?? -1;
toast.update = (id: number, type: ToastType, text: string) => api()?.update(id, type, text);
toast.dismiss = (id: number) => api()?.dismiss(id);

interface PromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((err: any) => string);
}

/**
 * Bọc một promise bằng toast loading → tự đổi sang success/error khi xong.
 * Trả về chính promise đó để tiếp tục await/catch nếu cần.
 */
toast.promise = async function <T>(p: Promise<T>, msgs: PromiseMessages<T>): Promise<T> {
  const id = toast.loading(msgs.loading);
  try {
    const value = await p;
    const text = typeof msgs.success === "function" ? msgs.success(value) : msgs.success;
    if (id >= 0) toast.update(id, "success", text);
    else toast.success(text);
    return value;
  } catch (err: any) {
    const text = typeof msgs.error === "function" ? msgs.error(err) : msgs.error;
    if (id >= 0) toast.update(id, "error", text);
    else toast.error(text);
    throw err;
  }
};

export { Loader2 as ToastSpinner };
