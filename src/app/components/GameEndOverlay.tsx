"use client";

import { Trophy, Frown, Handshake, Sparkles, Coins } from "lucide-react";

export type GameEndKind = "win" | "lose" | "draw";

/**
 * Màn hình kết thúc game hoành tráng (Caro / Tiến Lên). Hiển thị inline phía trên
 * bàn chơi (không phải modal full-screen) để vẫn thấy kết quả bàn.
 */
export default function GameEndOverlay({
  kind, title, subtitle, rp, coins, onPrimary, primaryLabel = "Về sảnh",
}: {
  kind: GameEndKind;
  title: string;
  subtitle?: string;
  rp?: number;
  coins?: number;
  onPrimary?: () => void;
  primaryLabel?: string;
}) {
  const theme = kind === "win"
    ? { grad: "from-amber-400 via-yellow-500 to-orange-500", glow: "rgba(245,158,11,0.55)", text: "text-amber-300", Icon: Trophy }
    : kind === "draw"
    ? { grad: "from-slate-400 to-slate-600", glow: "rgba(148,163,184,0.4)", text: "text-slate-200", Icon: Handshake }
    : { grad: "from-slate-500 to-slate-700", glow: "rgba(100,116,139,0.4)", text: "text-slate-300", Icon: Frown };

  return (
    <div className="relative w-full max-w-[520px] mx-auto animate-pop-in">
      <div className="relative rounded-3xl border border-white/10 bg-[#0c0c16]/90 backdrop-blur-xl px-6 py-7 overflow-hidden text-center shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${theme.glow}, transparent 60%)` }} />
        {kind === "win" && (
          <>
            <Sparkles className="absolute top-4 left-6 w-5 h-5 text-amber-300/70 animate-float" />
            <Sparkles className="absolute top-8 right-8 w-4 h-4 text-yellow-200/60 animate-float" style={{ animationDelay: "0.4s" }} />
          </>
        )}
        <div className="relative flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-2xl animate-pulse-glow" style={{ background: theme.glow }} />
            <div className={`relative w-24 h-24 rounded-full bg-gradient-to-br ${theme.grad} flex items-center justify-center shadow-[0_0_40px_${theme.glow}]`}>
              <theme.Icon className="w-12 h-12 text-white" strokeWidth={2} />
            </div>
          </div>
          <div className={`text-[13px] font-black uppercase tracking-[0.3em] ${theme.text}`}>
            {kind === "win" ? "Chiến thắng" : kind === "draw" ? "Hoà" : "Kết thúc"}
          </div>
          <div className="text-[30px] font-black text-white leading-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">{title}</div>
          {subtitle && <div className="text-[13px] text-neutral-300">{subtitle}</div>}
          {(typeof rp === "number" || typeof coins === "number") && (
            <div className="flex items-center gap-3 mt-1">
              {typeof rp === "number" && (
                <span className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[15px] font-black ${rp >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                  {rp > 0 ? "+" : ""}{rp} RP
                </span>
              )}
              {typeof coins === "number" && (
                <span className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[15px] font-black ${coins >= 0 ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300"}`}>
                  <Coins className="w-4 h-4" /> {coins > 0 ? "+" : ""}{coins}
                </span>
              )}
            </div>
          )}
          {onPrimary && (
            <button onClick={onPrimary} className="mt-3 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[13px] font-black transition-all cursor-pointer active:scale-[0.98]">
              {primaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
