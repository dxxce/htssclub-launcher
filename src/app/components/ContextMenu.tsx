"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  type?: "item" | "separator" | "label" | "slider";
  label?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  /** Tô màu nguy hiểm (đỏ) cho hành động xoá. */
  danger?: boolean;
  disabled?: boolean;
  /** Màu accent tuỳ chỉnh (vd "amber", "sky", "emerald"). */
  accent?: "violet" | "sky" | "amber" | "emerald" | "rose" | "neutral";
  /** Cho type="slider": giá trị 0..100, callback khi đổi, và có giữ menu mở. */
  value?: number;
  onValueChange?: (value: number) => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** Tiêu đề nhỏ hiển thị trên cùng menu (vd tên tài khoản). */
  header?: string;
}

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
}

const ACCENT_TEXT: Record<string, string> = {
  violet: "text-violet-300",
  sky: "text-sky-300",
  amber: "text-amber-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
  neutral: "text-neutral-300",
};

const ACCENT_HOVER: Record<string, string> = {
  violet: "hover:bg-violet-500/15 hover:text-violet-200",
  sky: "hover:bg-sky-500/15 hover:text-sky-200",
  amber: "hover:bg-amber-500/15 hover:text-amber-200",
  emerald: "hover:bg-emerald-500/15 hover:text-emerald-200",
  rose: "hover:bg-rose-500/15 hover:text-rose-200",
  neutral: "hover:bg-white/[0.07] hover:text-white",
};

// Hàng thanh trượt âm lượng — giữ state nội bộ để kéo mượt, không phụ thuộc re-render menu.
function SliderRow({ item }: { item: ContextMenuItem }) {
  const Icon = item.icon;
  const [val, setVal] = useState<number>(Math.round(item.value ?? 100));
  // đồng bộ nếu giá trị ngoài thay đổi (vd bấm "tắt tiếng")
  useEffect(() => { setVal(Math.round(item.value ?? 100)); }, [item.value]);
  return (
    <div className="px-2.5 py-2" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 mb-1.5 text-[11px] font-bold text-neutral-300">
        {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0 text-violet-300" />}
        <span className="flex-1 truncate">{item.label}</span>
        <span className="text-[10px] font-black text-violet-300 tabular-nums">{val}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={val}
        onChange={(e) => { const v = Number(e.target.value); setVal(v); item.onValueChange?.(v); }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-violet-500"
      />
    </div>
  );
}

export default function ContextMenu({ menu, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Định vị menu trong viewport (không tràn mép màn hình).
  useLayoutEffect(() => {
    if (!menu) return;
    const el = ref.current;
    const margin = 8;
    let x = menu.x;
    let y = menu.y;
    if (el) {
      const { width, height } = el.getBoundingClientRect();
      if (x + width + margin > window.innerWidth) x = window.innerWidth - width - margin;
      if (y + height + margin > window.innerHeight) y = window.innerHeight - height - margin;
      if (x < margin) x = margin;
      if (y < margin) y = margin;
    }
    setPos({ x, y });
  }, [menu]);

  // Đóng khi cuộn hoặc nhấn Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div className="fixed inset-0 z-[9998]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        ref={ref}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ left: pos.x, top: pos.y }}
        className="fixed min-w-[200px] max-w-[260px] rounded-xl border border-white/10 bg-[#101019]/95 backdrop-blur-xl p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)] animate-pop-in overflow-hidden select-none"
      >
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />

        {menu.header && (
          <div className="px-2.5 pt-1.5 pb-2 mb-1 border-b border-white/[0.06]">
            <div className="text-[11px] font-black text-white truncate">{menu.header}</div>
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          {menu.items.map((item, i) => {
            if (item.type === "separator") {
              return <div key={i} className="h-px bg-white/[0.06] my-1 mx-1" />;
            }
            if (item.type === "label") {
              return (
                <div key={i} className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-600">
                  {item.label}
                </div>
              );
            }
            if (item.type === "slider") {
              return <SliderRow key={i} item={item} />;
            }
            const Icon = item.icon;
            const accent = item.danger ? "rose" : (item.accent || "neutral");
            const textClass = item.danger ? "text-rose-400" : (ACCENT_TEXT[accent] || "text-neutral-300");
            const hoverClass = ACCENT_HOVER[accent] || ACCENT_HOVER.neutral;
            return (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  onClose();
                  item.onClick?.();
                }}
                className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[12px] font-semibold text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${textClass} ${hoverClass}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
