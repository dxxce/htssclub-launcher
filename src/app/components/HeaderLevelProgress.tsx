"use client";

import { useEffect } from "react";
import { useLevelStore } from "../store/useLevelStore";
import { useCommunityStore } from "../store/useCommunityStore";
import LevelBadge from "./LevelBadge";
import RankBadge from "./RankBadge";

/**
 * Tiến trình Level (XP) + Rank (RP) gọn cho popup user trên header.
 * Đọc từ useLevelStore (đã bind realtime + load khi đăng nhập trong CommunityHub).
 */
export default function HeaderLevelProgress() {
  const progress = useLevelStore((s) => s.progress);
  const rank = useLevelStore((s) => s.rank);
  const loadMyLevel = useLevelStore((s) => s.loadMyLevel);
  const user = useCommunityStore((s) => s.user);

  // Đảm bảo có dữ liệu khi mở dropdown (nếu hub chưa kịp tải).
  useEffect(() => {
    if (user && !progress) loadMyLevel();
  }, [user, progress, loadMyLevel]);

  if (!progress && !rank) return null;

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 mt-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      {progress && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <LevelBadge level={progress.level} style={progress.style} size="md" />
            <span className="text-[10px] font-bold text-neutral-500 tabular-nums">
              {progress.xpIntoLevel.toLocaleString("vi-VN")} / {(progress.xpIntoLevel + progress.xpToNextLevel).toLocaleString("vi-VN")} XP
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.round(progress.progress * 100)}%`, background: `linear-gradient(to right, ${progress.style?.color || "#8b5cf6"}, ${progress.style?.colorSecondary || "#d946ef"})` }}
            />
          </div>
        </div>
      )}
      {rank && rank.tier && rank.tier !== "UNRANKED" && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <RankBadge rank={rank} size="md" />
            {!rank.isApex && typeof rank.rpToNextStep === "number" ? (
              <span className="text-[10px] font-bold text-neutral-500 tabular-nums">
                {(rank.rpIntoDivision ?? 0).toLocaleString("vi-VN")} / {((rank.rpIntoDivision ?? 0) + (rank.rpToNextStep ?? 0)).toLocaleString("vi-VN")} RP
              </span>
            ) : (
              <span className="text-[10px] font-bold text-neutral-500 tabular-nums">{(rank.rp ?? 0).toLocaleString("vi-VN")} RP</span>
            )}
          </div>
          {!rank.isApex && (
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.round((rank.progress ?? 0) * 100)}%`, background: `linear-gradient(to right, ${rank.color || "#f59e0b"}, ${rank.colorSecondary || "#fcd34d"})` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
