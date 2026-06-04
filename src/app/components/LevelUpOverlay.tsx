"use client";

import { useEffect } from "react";
import { Sparkles, ChevronsUp, ChevronsDown } from "lucide-react";
import { useLevelStore } from "../store/useLevelStore";
import RankBadge from "./RankBadge";

/**
 * Hiệu ứng "Level Up!" + thăng/tụt hạng toàn cục cho chính mình. Tự ẩn sau ~3.5s.
 * Mount 1 lần ở app level (vd trong layout / page).
 */
export default function LevelUpOverlay() {
  const flash = useLevelStore((s) => s.levelUpFlash);
  const clearFlash = useLevelStore((s) => s.clearFlash);
  const rankFlash = useLevelStore((s) => s.rankFlash);
  const clearRankFlash = useLevelStore((s) => s.clearRankFlash);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => clearFlash(), 3500);
    return () => window.clearTimeout(t);
  }, [flash, clearFlash]);

  useEffect(() => {
    if (!rankFlash) return;
    const t = window.setTimeout(() => clearRankFlash(), 3800);
    return () => window.clearTimeout(t);
  }, [rankFlash, clearRankFlash]);

  // Ưu tiên hiển thị thăng/tụt hạng (sự kiện hiếm hơn) nếu cả hai cùng xảy ra.
  if (rankFlash) {
    const promoted = rankFlash.kind === "promoted";
    const accent = promoted ? "from-amber-400 to-orange-500" : "from-slate-500 to-slate-700";
    const glow = promoted ? "rgba(245,158,11,0.6)" : "rgba(100,116,139,0.5)";
    return (
      <div className="fixed inset-0 z-[10050] flex items-center justify-center pointer-events-none animate-fade-in">
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative flex flex-col items-center gap-3 animate-pop-in">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-2xl animate-pulse-glow" style={{ background: glow }} />
            <div className={`relative w-28 h-28 rounded-full bg-gradient-to-br ${accent} flex items-center justify-center`} style={{ boxShadow: `0 0 50px ${glow}` }}>
              {promoted
                ? <ChevronsUp className="w-14 h-14 text-white" strokeWidth={2.5} />
                : <ChevronsDown className="w-14 h-14 text-white" strokeWidth={2.5} />}
            </div>
            {promoted && <Sparkles className="absolute -top-2 -right-2 w-7 h-7 text-amber-200 animate-float" />}
          </div>
          <div className="text-center">
            <div className={`text-[13px] font-black uppercase tracking-[0.3em] ${promoted ? "text-amber-300" : "text-slate-300"}`}>
              {promoted ? "Thăng hạng!" : "Tụt hạng"}
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              {rankFlash.from && <span className="text-[12px] font-bold text-neutral-400">{rankFlash.from}</span>}
              {rankFlash.from && <span className="text-neutral-500">→</span>}
              <RankBadge rank={rankFlash.rank} size="md" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!flash) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative flex flex-col items-center gap-3 animate-pop-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-amber-400/30 blur-2xl animate-pulse-glow" />
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-[0_0_50px_rgba(245,158,11,0.6)]">
            <ChevronsUp className="w-14 h-14 text-white" strokeWidth={2.5} />
          </div>
          <Sparkles className="absolute -top-2 -right-2 w-7 h-7 text-amber-200 animate-float" />
        </div>
        <div className="text-center">
          <div className="text-[13px] font-black uppercase tracking-[0.3em] text-amber-300">Level Up!</div>
          <div className="mt-1 text-[42px] font-black text-white leading-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
            Cấp {flash.level}
          </div>
          {typeof flash.previousLevel === "number" && (
            <div className="mt-1 text-[12px] text-neutral-300">từ cấp {flash.previousLevel} → {flash.level}</div>
          )}
        </div>
      </div>
    </div>
  );
}
