"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, Coins, Loader2, Crown, Medal, Swords } from "lucide-react";
import { leaderboardApi, type LeaderboardEntry, type CommunityUser } from "../lib/communityApi";
import { useCommunityStore } from "../store/useCommunityStore";
import LevelBadge, { levelNameStyle } from "./LevelBadge";
import RankBadge from "./RankBadge";

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-fuchsia-500", "from-sky-500 to-cyan-400", "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-500", "from-rose-500 to-pink-500", "from-violet-500 to-purple-500",
];
function gradientFor(seed?: string) {
  if (!seed) return AVATAR_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function initials(name?: string) { return name ? name.trim().slice(0, 2).toUpperCase() : "?"; }

function Avatar({ user, size = 40 }: { user?: CommunityUser; size?: number }) {
  const name = user?.displayName || user?.username;
  return (
    <div className={`rounded-2xl flex items-center justify-center font-black text-white overflow-hidden flex-shrink-0 ${user?.avatarUrl ? "bg-[#15151f]" : `bg-gradient-to-br ${gradientFor(name)}`}`} style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {user?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : initials(name)}
    </div>
  );
}

const RANK_STYLE: Record<number, string> = {
  1: "from-amber-400 to-yellow-500 text-black",
  2: "from-neutral-300 to-neutral-400 text-black",
  3: "from-orange-500 to-amber-700 text-white",
};

type Tab = "xp" | "coins" | "rank";

export default function LeaderboardView({ onOpenProfile }: { onOpenProfile?: (userId: string) => void }) {
  const me = useCommunityStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("xp");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      const [list, mine] = await Promise.all([
        leaderboardApi.list(t, 50).catch(() => [] as LeaderboardEntry[]),
        leaderboardApi.myRank(t).catch(() => null),
      ]);
      setEntries(list);
      setMyRank(mine);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const fmtScore = (e: LeaderboardEntry) => tab === "xp"
    ? `${e.xp.toLocaleString("vi-VN")} XP`
    : tab === "coins"
    ? `${e.coins.toLocaleString("vi-VN")} xu`
    : `${(e.rankPoints ?? e.score ?? 0).toLocaleString("vi-VN")} RP`;

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  // sắp xếp top3 theo thứ tự bục: 2 - 1 - 3
  const podium = [top3[1], top3[0], top3[2]].filter(Boolean) as LeaderboardEntry[];

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]">
      {/* Header + tabs */}
      <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
        <Trophy className="w-4.5 h-4.5 text-amber-300 flex-shrink-0" />
        <span className="text-[14px] font-black text-white mr-2">Bảng xếp hạng</span>
        <div className="flex items-center gap-1">
          {([
            { id: "xp" as const, label: "Cấp độ", Icon: Trophy },
            { id: "coins" as const, label: "Xu", Icon: Coins },
            { id: "rank" as const, label: "Hạng đấu", Icon: Swords },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                tab === id ? "bg-amber-500/15 text-amber-200" : "text-neutral-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4">
        <div className="max-w-[680px] mx-auto">
          {loading ? (
            <div className="py-20 flex items-center justify-center"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
          ) : entries.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-3 text-center">
              <Trophy className="w-10 h-10 text-amber-500/30" />
              <p className="text-[13px] text-neutral-500">Chưa có dữ liệu xếp hạng.</p>
            </div>
          ) : (
            <>
              {/* Bục vinh danh top 3 */}
              {podium.length > 0 && (
                <div className="flex items-end justify-center gap-3 mb-6">
                  {podium.map((e) => {
                    const isFirst = e.rank === 1;
                    return (
                      <button
                        key={e.userId}
                        onClick={() => onOpenProfile?.(e.userId)}
                        className={`flex flex-col items-center gap-1.5 cursor-pointer group ${isFirst ? "order-none" : ""}`}
                        style={{ marginBottom: isFirst ? 0 : 12 }}
                      >
                        <div className="relative">
                          <div className={`${isFirst ? "ring-2 ring-amber-400" : ""} rounded-2xl transition-transform group-hover:scale-105`}>
                            <Avatar user={e.user} size={isFirst ? 72 : 56} />
                          </div>
                          <span className={`absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br ${RANK_STYLE[e.rank] || "from-violet-500 to-fuchsia-500 text-white"} flex items-center justify-center text-[12px] font-black shadow-lg`}>
                            {e.rank}
                          </span>
                          {isFirst && <Crown className="absolute -top-6 left-1/2 -translate-x-1/2 w-6 h-6 text-amber-400" />}
                        </div>
                        <div className="text-[12px] font-bold truncate max-w-[100px] flex items-center gap-1" style={levelNameStyle(e.level, e.user?.levelStyle) || { color: "#ffffff" }}>
                          {e.user?.displayName || e.user?.username || "—"}
                        </div>
                        {tab === "rank" ? <RankBadge rank={e.tier} size="md" /> : <LevelBadge level={e.level} />}
                        <div className="text-[11px] font-black text-amber-300">{fmtScore(e)}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Danh sách còn lại */}
              <div className="flex flex-col gap-1">
                {rest.map((e) => {
                  const mine = e.userId === me?.id;
                  return (
                    <button
                      key={e.userId}
                      onClick={() => onOpenProfile?.(e.userId)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${mine ? "bg-amber-500/10 ring-1 ring-amber-500/30" : "bg-white/[0.02] hover:bg-white/[0.05]"}`}
                    >
                      <span className="w-7 text-center text-[13px] font-black text-neutral-500 tabular-nums flex-shrink-0">{e.rank}</span>
                      <Avatar user={e.user} size={36} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-bold truncate" style={levelNameStyle(e.level, e.user?.levelStyle) || { color: "#ffffff" }}>{e.user?.displayName || e.user?.username || "—"}</span>
                          {tab === "rank" ? <RankBadge rank={e.tier} /> : <LevelBadge level={e.level} />}
                        </div>
                        <div className="text-[10px] text-neutral-500">@{e.user?.username}</div>
                      </div>
                      <span className="text-[12px] font-black text-amber-300 flex-shrink-0">{fmtScore(e)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hạng của tôi (ghim đáy) */}
      {myRank && myRank.rank > 0 && (
        <div className="flex-shrink-0 border-t border-white/[0.06] bg-[#0a0a14] px-4 py-2.5">
          <div className="max-w-[680px] mx-auto flex items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] font-black text-amber-300 flex-shrink-0"><Medal className="w-3.5 h-3.5" /> #{myRank.rank}</span>
            <Avatar user={myRank.user || me || undefined} size={32} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-white truncate">Bạn</span>
                {tab === "rank" ? <RankBadge rank={myRank.tier} /> : <LevelBadge level={myRank.level} />}
              </div>
            </div>
            <span className="text-[12px] font-black text-amber-300 flex-shrink-0">{fmtScore(myRank)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
