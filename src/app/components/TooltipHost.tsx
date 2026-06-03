"use client";

import { useEffect, useRef, useState } from "react";

interface TipState {
  text: string;
  // Toạ độ điểm neo (giữa cạnh trên hoặc dưới của phần tử mục tiêu).
  x: number;
  y: number;
  pos: "top" | "bottom";
}

/**
 * Tooltip toàn cục: lắng nghe hover trên mọi phần tử có thuộc tính `data-tip`,
 * render bong bóng ở cấp <body> với position: fixed nên KHÔNG bao giờ bị cắt
 * bởi overflow của thẻ cha (khắc phục lỗi tooltip bị che).
 *
 * Dùng: thêm `data-tip="Nội dung"` và (tuỳ chọn) `data-tip-pos="bottom"`.
 */
export default function TooltipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const [visible, setVisible] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTarget = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
    };

    const compute = (el: HTMLElement): TipState | null => {
      const text = el.getAttribute("data-tip");
      if (!text) return null;
      const pos = (el.getAttribute("data-tip-pos") as "top" | "bottom") || "top";
      const r = el.getBoundingClientRect();
      return {
        text,
        x: r.left + r.width / 2,
        y: pos === "bottom" ? r.bottom : r.top,
        pos,
      };
    };

    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-tip]") as HTMLElement | null;
      if (!el) return;
      if (el === currentTarget.current) return;
      currentTarget.current = el;
      clearTimer();
      showTimer.current = setTimeout(() => {
        const t = compute(el);
        if (t) {
          setTip(t);
          requestAnimationFrame(() => setVisible(true));
        }
      }, 250);
    };

    const hide = () => {
      clearTimer();
      currentTarget.current = null;
      setVisible(false);
      setTimeout(() => setTip(null), 150);
    };

    const onOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-tip]") as HTMLElement | null;
      if (!el) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (related && el.contains(related)) return;
      hide();
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("click", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);

    return () => {
      clearTimer();
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("click", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!tip) return null;

  const gap = 9;
  const isBottom = tip.pos === "bottom";

  // Căn giữa theo trục ngang, kẹp trong viewport.
  const bubbleW = bubbleRef.current?.offsetWidth ?? 0;
  const margin = 8;
  let left = tip.x;
  if (bubbleW) {
    const half = bubbleW / 2;
    left = Math.min(Math.max(tip.x, half + margin), window.innerWidth - half - margin);
  }

  return (
    <div className="fixed inset-0 z-[10001] pointer-events-none">
      <div
        ref={bubbleRef}
        style={{
          left,
          top: isBottom ? tip.y + gap : tip.y - gap,
          transform: `translate(-50%, ${isBottom ? "0" : "-100%"})`,
        }}
        className={`absolute transition-all duration-150 ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <div className="relative rounded-[10px] border border-white/[0.14] bg-[#1a1a2b] px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-white whitespace-pre shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
          {tip.text}
          {/* Mũi tên */}
          <span
            className="absolute left-1/2 w-2 h-2 bg-[#1a1a2b] border-white/[0.14] rotate-45"
            style={
              isBottom
                ? { top: -4, marginLeft: -4, borderLeftWidth: 1, borderTopWidth: 1 }
                : { bottom: -4, marginLeft: -4, borderRightWidth: 1, borderBottomWidth: 1 }
            }
          />
        </div>
      </div>
    </div>
  );
}
