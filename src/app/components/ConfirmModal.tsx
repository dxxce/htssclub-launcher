"use client";

import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface ConfirmOptions {
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
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
  const confirmText = config.confirmText || "Đồng ý";
  const cancelText = config.cancelText || "Hủy bỏ";

  const handleClose = (confirmed: boolean) => {
    setClosing(true);
    setTimeout(() => {
      onClose();
      if (confirmed) {
        config.onConfirm();
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
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none transition-all duration-300 ${
      closing ? "opacity-0" : "opacity-100"
    }`}>
      {/* Click outside backdrop to close */}
      <div className="absolute inset-0" onClick={() => handleClose(false)} />

      {/* Modal Container */}
      <div className={`relative bg-[#070709] border border-white/5 rounded-3xl p-6 w-full max-w-[400px] shadow-2xl flex flex-col items-center text-center overflow-hidden transition-all duration-300 ${
        closing ? "scale-95 opacity-0 translate-y-2" : "scale-100 opacity-100 translate-y-0"
      }`}>
        {/* Glow ambient background based on type */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-[65px] pointer-events-none -translate-y-24 ${
          type === "danger" ? "bg-red-500/10" :
          type === "warning" ? "bg-amber-500/10" :
          "bg-blue-500/10"
        }`} />

        {/* Top Right Close Icon */}
        <button 
          onClick={() => handleClose(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon Circle */}
        <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 mt-2 ${
          type === "danger" ? "bg-red-500/10 border-red-500/20 text-red-400" :
          type === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
          "bg-blue-500/10 border-blue-500/20 text-blue-400"
        }`}>
          {type === "danger" && <AlertTriangle className="w-6 h-6 animate-pulse" />}
          {type === "warning" && <AlertCircle className="w-6 h-6" />}
          {type === "info" && <Info className="w-6 h-6" />}
        </div>

        {/* Text Details */}
        <h3 className="text-white font-black text-xl mb-2 tracking-tight">{title}</h3>
        <p className="text-neutral-400 text-xs font-semibold leading-relaxed max-w-[280px]">
          {config.message}
        </p>

        {/* Buttons Row */}
        <div className="flex gap-3 w-full mt-6">
          <button
            onClick={() => handleClose(false)}
            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white rounded-xl font-bold text-xs border border-white/5 hover:border-white/10 transition-all active:scale-95 cursor-pointer"
          >
            {cancelText}
          </button>
          
          <button
            onClick={() => handleClose(true)}
            className={`flex-1 py-2.5 text-white rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer ${
              type === "danger" ? "bg-red-600 hover:bg-red-700 shadow-[0_0_15px_rgba(239,68,68,0.2)]" :
              type === "warning" ? "bg-amber-600 hover:bg-amber-700 shadow-[0_0_15px_rgba(245,158,11,0.2)]" :
              "bg-blue-600 hover:bg-blue-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
