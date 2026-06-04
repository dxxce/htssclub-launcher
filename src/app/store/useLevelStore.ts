"use client";

import { create } from "zustand";
import { usersApi, normalizeRank, type LevelProgress, type RankInfo } from "../lib/communityApi";
import { onChat } from "../lib/communitySocket";
import { useCommunityStore } from "./useCommunityStore";
import { toast } from "../components/Toast";

interface LevelState {
  progress: LevelProgress | null;
  rank: RankInfo | null;
  loading: boolean;
  bound: boolean;
  // Hiệu ứng "Level Up!" cho chính mình → component overlay đọc giá trị này.
  levelUpFlash: { level: number; previousLevel?: number } | null;
  rankFlash: { kind: "promoted" | "demoted"; from?: string; to?: string; rank: RankInfo } | null;

  loadMyLevel: () => Promise<void>;
  bindRealtime: () => void;
  clearFlash: () => void;
  clearRankFlash: () => void;
  reset: () => void;
}

let unsubs: Array<() => void> = [];

export const useLevelStore = create<LevelState>((set, get) => ({
  progress: null,
  rank: null,
  loading: false,
  bound: false,
  levelUpFlash: null,
  rankFlash: null,

  loadMyLevel: async () => {
    set({ loading: true });
    try {
      const [p, r] = await Promise.all([
        usersApi.myLevel().catch(() => null),
        usersApi.myRank().catch(() => null),
      ]);
      if (p) set({ progress: p });
      if (r) set({ rank: r });
    } finally {
      set({ loading: false });
    }
  },

  bindRealtime: () => {
    if (get().bound) return;
    set({ bound: true });

    // XP của CHÍNH mình thay đổi (payload không có serverId/userId).
    unsubs.push(onChat("level:xp", (e) => {
      if (e.serverId || e.userId) return; // event của người khác (room server) → bỏ
      const prog: LevelProgress = {
        level: e.level,
        xp: e.xp,
        xpIntoLevel: e.xpIntoLevel ?? 0,
        xpForNextLevel: e.xpForNextLevel ?? 0,
        xpToNextLevel: e.xpToNextLevel ?? 0,
        progress: typeof e.progress === "number" ? Math.max(0, Math.min(1, e.progress)) : 0,
        style: get().progress?.style,
      };
      set({ progress: prog });
      // đồng bộ level/xp vào user store để huy hiệu cập nhật ngay.
      try {
        const cs = useCommunityStore.getState();
        if (cs.user) useCommunityStore.setState({ user: { ...cs.user, level: e.level, xp: e.xp } });
      } catch {/* ignore */}
    }));

    // Lên cấp.
    unsubs.push(onChat("level:up", (e) => {
      const me = useCommunityStore.getState().user;
      if (!e.serverId || e.userId === me?.id) {
        set({ levelUpFlash: { level: e.level, previousLevel: e.previousLevel } });
        try {
          if (me) useCommunityStore.setState({ user: { ...me, level: e.level, xp: e.xp ?? me.xp } });
        } catch {/* ignore */}
      } else if (e.serverId && e.userId) {
        try {
          const cs = useCommunityStore.getState();
          const mem = cs.activeServer?.members.find((m) => m.userId === e.userId);
          const nm = mem?.user?.displayName || mem?.user?.username;
          if (nm) toast.info(`🎉 ${nm} vừa lên cấp ${e.level}!`);
        } catch {/* ignore */}
      }
    }));

    // Rank: RP thay đổi.
    unsubs.push(onChat("rank:changed", (e) => {
      const r = normalizeRank(e.rank);
      if (r) {
        set({ rank: r });
        try {
          const cs = useCommunityStore.getState();
          if (cs.user) useCommunityStore.setState({ user: { ...cs.user, rank: r, rankPoints: r.rp ?? cs.user.rankPoints } });
        } catch {/* ignore */}
      }
    }));
    // Thăng / tụt hạng → hiệu ứng + cập nhật.
    const onStep = (kind: "promoted" | "demoted") => (e: { from?: string; to?: string; rank: any }) => {
      const r = normalizeRank(e.rank);
      if (!r) return;
      set({ rank: r, rankFlash: { kind, from: e.from, to: e.to, rank: r } });
      try {
        const cs = useCommunityStore.getState();
        if (cs.user) useCommunityStore.setState({ user: { ...cs.user, rank: r, rankPoints: r.rp ?? cs.user.rankPoints } });
      } catch {/* ignore */}
    };
    unsubs.push(onChat("rank:promoted", onStep("promoted")));
    unsubs.push(onChat("rank:demoted", onStep("demoted")));
  },

  clearFlash: () => set({ levelUpFlash: null }),
  clearRankFlash: () => set({ rankFlash: null }),

  reset: () => {
    unsubs.forEach((u) => { try { u(); } catch {/* ignore */} });
    unsubs = [];
    set({ progress: null, rank: null, bound: false, levelUpFlash: null, rankFlash: null });
  },
}));
