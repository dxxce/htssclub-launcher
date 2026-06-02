"use client";

import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface ConfirmOptions {
  title?: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  okLabel?: string;
  type?: "danger" | "warning" | "info";
}

declare global {
  interface Window {
    confirmCustom?: (options: ConfirmOptions) => void;
  }
}

interface ConfirmModalProps {
  config: ConfirmOptions;
  onClose: () => void;
}

export default function ConfirmModal({ config, onClose }: ConfirmModalProps) {
  const [closing, setClosing] = useState(false);

  const type = config.type || "danger";
  const title = config.title || "Xác nhận";
  const confirmText = config.confirmText || config.okLabel || "Đồng ý";
  const cancelText = config.cancelText || "Hủy bỏ";

  const handleClose = (confirmed: boolean) => {
    setClosing(true);
    setTimeout(() => {
      onClose();
      if (confirmed) {
        if (config.onConfirm) {
          config.onConfirm();
        }
      } else if (config.onCancel) {
        config.onCancel();
      }
    }, 200); // Wait for scaleOut animation
  };

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 select-none transition-all duration-300 ${
      closing ? "opacity-0" : "opacity-100"
    }`}>
      {/* Click outside backdrop to close */}
      <div className="absolute inset-0" onClick={() => handleClose(false)} />

      {/* Modal Container */}
      <div className={`relative glass card-glow rounded-3xl p-6 w-full max-w-[400px] shadow-[0_30px_70px_rgba(0,0,0,0.7)] flex flex-col items-center text-center overflow-hidden transition-all duration-300 ${
        closing ? "scale-95 opacity-0 translate-y-2" : "scale-100 opacity-100 translate-y-0 animate-pop-in"
      }`}>
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        {/* Glow ambient background based on type */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-52 h-52 rounded-full blur-[70px] pointer-events-none -translate-y-24 ${
          type === "danger" ? "bg-rose-500/15" :
          type === "warning" ? "bg-amber-500/15" :
          "bg-violet-500/15"
        }`} />

        {/* Top Right Close Icon */}
        <button 
          onClick={() => handleClose(false)}
          className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/[0.05] border border-white/[0.06] hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-colors cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon Circle */}
        <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-4 mt-2 relative z-10 ${
          type === "danger" ? "bg-rose-500/10 border-rose-500/25 text-rose-400" :
          type === "warning" ? "bg-amber-500/10 border-amber-500/25 text-amber-400" :
          "bg-violet-500/10 border-violet-500/25 text-violet-300"
        }`}>
          {type === "danger" && <AlertTriangle className="w-7 h-7 animate-pulse" />}
          {type === "warning" && <AlertCircle className="w-7 h-7" />}
          {type === "info" && <Info className="w-7 h-7" />}
        </div>

        {/* Text Details */}
        <h3 className="text-white font-black text-xl mb-2 tracking-tight relative z-10">{title}</h3>
        <p className="text-neutral-400 text-[13px] font-medium leading-relaxed max-w-[280px] relative z-10">
          {config.message}
        </p>

        {/* Buttons Row */}
        <div className="flex gap-3 w-full mt-6 relative z-10">
          <button
            onClick={() => handleClose(false)}
            className="flex-1 py-2.5 bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 hover:text-white rounded-xl font-bold text-[13px] border border-white/[0.06] hover:border-white/15 transition-all active:scale-95 cursor-pointer"
          >
            {cancelText}
          </button>
          
          <button
            onClick={() => handleClose(true)}
            className={`flex-1 py-2.5 text-white rounded-xl font-bold text-[13px] transition-all active:scale-95 cursor-pointer ${
              type === "danger" ? "bg-gradient-to-r from-rose-500 to-red-600 hover:shadow-[0_8px_24px_rgba(244,63,94,0.4)]" :
              type === "warning" ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:shadow-[0_8px_24px_rgba(245,158,11,0.4)]" :
              "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 hover:shadow-[0_8px_24px_rgba(139,92,246,0.4)]"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
