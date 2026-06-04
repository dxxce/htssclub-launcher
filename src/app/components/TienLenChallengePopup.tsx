"use client";

import { useEffect, useState } from "react";
import { Spade, Check, X, Coins } from "lucide-react";
import { useTienLenStore } from "../store/useTienLenStore";

/** Popup lời mời thách đấu Tiến Lên (toàn cục). */
export default function TienLenChallengePopup() {
  const ch = useTienLenStore((s) => s.incomingChallenge);
  const accept = useTienLenStore((s) => s.acceptChallenge);
  const decline = useTienLenStore((s) => s.declineChallenge);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!ch) { setLeft(0); return; }
    const until = Date.now() + (ch.expiresInMs ?? 45000);
    const tick = () => {
      const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) decline();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [ch, decline]);

  if (!ch) return null;
  const nm = ch.from?.displayName || ch.from?.username || "Người chơi";
  const avatar = ch.from?.avatarUrl;
  const wager = (ch.betAmount ?? 0) > 0;

  return (
    <div className="fixed bottom-5 right-5 z-[10040] w-[300px] animate-pop-in" style={{ bottom: 96 }}>
      <div className="relative glass rounded-2xl p-4 shadow-2xl overflow-hidden border border-emerald-500/30">
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center bg-[#15151f] flex-shrink-0">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[13px] font-black text-white">{nm.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Spade className="w-3.5 h-3.5" />
              <span className="text-[11px] font-black uppercase tracking-wide">Lời mời Tiến Lên</span>
            </div>
            <div className="text-[13px] font-bold text-white truncate mt-0.5">{nm}</div>
            <div className="text-[10px] text-neutral-500 flex items-center gap-1">
              {wager ? <><Coins className="w-3 h-3 text-amber-400" /> Cược {ch.betAmount} xu</> : ch.mode === "RANKED" ? "Xếp hạng (RP)" : "Giao hữu"} · còn {left}s
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => accept()} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[12px] font-bold transition-all cursor-pointer active:scale-[0.98]">
            <Check className="w-4 h-4" /> Đồng ý
          </button>
          <button onClick={() => decline()} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 text-[12px] font-bold transition-all cursor-pointer active:scale-[0.98]">
            <X className="w-4 h-4" /> Từ chối
          </button>
        </div>
      </div>
    </div>
  );
}
