"use client";

import { useState } from "react";
import { Monitor, AppWindow, X, ScreenShare, Check } from "lucide-react";

export interface ScreenShareOpts {
  width: number;
  height: number;
  fps: number;
  surface: "monitor" | "window";
}

const RESOLUTIONS = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1440p", width: 2560, height: 1440 },
] as const;

const FPS_OPTIONS = [15, 30, 60] as const;

/**
 * Pre-picker (theo theme Aurora Glass) cho chia sẻ màn hình: chọn loại nguồn
 * (toàn màn hình / cửa sổ) + độ phân giải + khung hình. Sau khi bấm "Chia sẻ",
 * trình duyệt vẫn hiện hộp thoại native của hệ điều hành để chọn nguồn cụ thể,
 * nhưng phần chọn chất lượng & loại nguồn là UI của app.
 */
export default function ScreenSharePicker({
  onClose, onConfirm,
}: {
  onClose: () => void;
  onConfirm: (opts: ScreenShareOpts) => void;
}) {
  const [surface, setSurface] = useState<"monitor" | "window">("monitor");
  const [resIdx, setResIdx] = useState(1); // 1080p
  const [fps, setFps] = useState<number>(30);

  const confirm = () => {
    const r = RESOLUTIONS[resIdx];
    onConfirm({ width: r.width, height: r.height, fps, surface });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-[440px] glass rounded-2xl p-6 shadow-2xl animate-pop-in overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <ScreenShare className="w-4 h-4 text-violet-300" /> Chia sẻ màn hình
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loại nguồn */}
        <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-2">Nguồn chia sẻ</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {([
            { id: "monitor", label: "Toàn màn hình", Icon: Monitor },
            { id: "window", label: "Cửa sổ ứng dụng", Icon: AppWindow },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setSurface(id)}
              className={`flex flex-col items-center gap-2 py-4 rounded-xl border transition-all cursor-pointer ${
                surface === id ? "border-violet-500/60 bg-violet-500/15 text-violet-100" : "border-white/10 bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]"
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[12px] font-bold">{label}</span>
            </button>
          ))}
        </div>

        {/* Độ phân giải */}
        <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-2">Độ phân giải</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {RESOLUTIONS.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setResIdx(i)}
              className={`py-2.5 rounded-xl border text-[12px] font-bold transition-all cursor-pointer ${
                resIdx === i ? "border-violet-500/60 bg-violet-500/15 text-violet-100" : "border-white/10 bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Khung hình */}
        <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-2">Khung hình / giây</label>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {FPS_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFps(f)}
              className={`py-2.5 rounded-xl border text-[12px] font-bold transition-all cursor-pointer ${
                fps === f ? "border-violet-500/60 bg-violet-500/15 text-violet-100" : "border-white/10 bg-white/[0.03] text-neutral-400 hover:bg-white/[0.06]"
              }`}
            >
              {f} fps
            </button>
          ))}
        </div>

        <p className="text-[10px] text-neutral-600 mb-4 leading-relaxed">
          Sau khi bấm Chia sẻ, hệ điều hành sẽ hỏi chọn màn hình/cửa sổ cụ thể (hộp thoại bảo mật của Windows, không thể bỏ qua).
        </p>

        <button
          onClick={confirm}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-[13px] font-bold transition-all cursor-pointer active:scale-[0.98]"
        >
          <Check className="w-4 h-4" /> Chia sẻ
        </button>
      </div>
    </div>
  );
}
