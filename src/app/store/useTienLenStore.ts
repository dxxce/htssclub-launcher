"use client";

import { create } from "zustand";
import { tienlenApi, type TienLenGame, type CommunityUser, type GameRoom } from "../lib/communityApi";
import { connectTienLen, disconnectTienLen, onTienLen, tienlen, getTienLenSocket, type TLChallengeReceived, type TLQueuePlayer } from "../lib/tienlenSocket";
import { useCommunityStore } from "./useCommunityStore";
import { toast } from "../components/Toast";
import { playMatchFoundSound, playPlayerJoinSound, playCardPlaySound, playChopSound, playWinSound, playLoseSound } from "../lib/gameSounds";

type Phase = "idle" | "queue" | "playing" | "finished";

interface TienLenState {
  connected: boolean;
  bound: boolean;
  phase: Phase;
  queueSize: number | null;        // cỡ bàn đang xếp hàng
  searching: Record<string, number>;     // {2,3,4} → số người
  queuePlayers: Record<string, TLQueuePlayer[]>;
  game: TienLenGame | null;
  incomingChallenge: TLChallengeReceived | null;
  history: TienLenGame[];
  loadingHistory: boolean;
  room: GameRoom | null;
  rooms: GameRoom[];
  loadingRooms: boolean;
  // hiệu ứng chặt heo gần nhất.
  lastChop: { chopper: string; victim: string; heoCount: number; black?: number; red?: number } | null;

  connect: () => void;
  bindRealtime: () => void;
  enterLobby: () => Promise<void>;
  leaveLobby: () => void;
  findMatch: (size: number) => Promise<void>;
  cancelQueue: () => Promise<void>;
  challenge: (user: CommunityUser, opts?: { ranked?: boolean; betAmount?: number }) => Promise<void>;
  acceptChallenge: () => Promise<void>;
  declineChallenge: () => void;
  joinGame: (gameId: string) => Promise<void>;
  play: (cards: number[]) => Promise<void>;
  pass: () => Promise<void>;
  resign: () => Promise<void>;
  leaveGame: () => void;
  resumeActive: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadRooms: () => Promise<void>;
  createRoom: (input: { betAmount?: number; maxPlayers?: number; ranked?: boolean; isPrivate?: boolean; name?: string }) => Promise<void>;
  joinRoom: (input: { roomId?: string; code?: string }) => Promise<void>;
  toggleReady: () => Promise<void>;
  startRoom: () => Promise<void>;
  leaveRoom: () => Promise<void>;
  clearFinished: () => void;
  reset: () => void;
}

let unsubs: Array<() => void> = [];

export const useTienLenStore = create<TienLenState>((set, get) => {
  const myId = () => useCommunityStore.getState().user?.id;
  const mySeat = (g: TienLenGame | null): number | null => {
    const me = myId();
    if (!g || !me) return null;
    const p = g.players.find((x) => x.userId === me);
    return p ? p.seat : null;
  };

  return {
    connected: false,
    bound: false,
    phase: "idle",
    queueSize: null,
    searching: {},
    queuePlayers: {},
    game: null,
    incomingChallenge: null,
    history: [],
    loadingHistory: false,
    room: null,
    rooms: [],
    loadingRooms: false,
    lastChop: null,

    connect: () => {
      connectTienLen();
      set({ connected: getTienLenSocket().connected });
      get().bindRealtime();
    },

    bindRealtime: () => {
      if (get().bound) return;
      set({ bound: true });

      unsubs.push(onTienLen("connect", () => set({ connected: true })));
      unsubs.push(onTienLen("disconnect", () => set({ connected: false })));

      unsubs.push(onTienLen("tienlen:matched", (game) => {
        set({ game, phase: "playing", queueSize: null });
        try { playMatchFoundSound(); } catch {/* ignore */}
        tienlen.join(game.id).then((g) => { if (g) set({ game: g }); }).catch(() => {});
      }));

      unsubs.push(onTienLen("tienlen:queue:count", (e) => {
        set({ searching: e.searching ?? {}, queuePlayers: e.players ?? {} });
      }));

      // Nước đánh (đồng bộ lại bằng cách refetch nhẹ qua join để chắc chắn ẩn bài đúng).
      unsubs.push(onTienLen("tienlen:play", (e) => {
        try { playCardPlaySound(); } catch {/* ignore */}
        set((st) => {
          if (!st.game || st.game.id !== e.gameId) return {};
          const players = st.game.players.map((p) =>
            p.seat === e.seat ? { ...p, handCount: e.handCount, passed: false } : p
          );
          return { game: { ...st.game, players, turn: e.nextTurn, currentCombo: e.currentCombo ?? st.game.currentCombo, currentComboType: (e.comboType as any) ?? st.game.currentComboType } };
        });
      }));

      unsubs.push(onTienLen("tienlen:pass", (e) => {
        set((st) => {
          if (!st.game || st.game.id !== e.gameId) return {};
          const players = st.game.players.map((p) => (p.seat === e.seat ? { ...p, passed: true } : p));
          const patch: Partial<TienLenGame> = { players, turn: e.nextTurn };
          if (e.trickReset) { patch.currentCombo = []; patch.currentComboType = null; patch.players = players.map((p) => ({ ...p, passed: false })); }
          return { game: { ...st.game, ...patch } };
        });
      }));

      unsubs.push(onTienLen("tienlen:resigned", (e) => {
        set((st) => {
          if (!st.game || st.game.id !== e.gameId) return {};
          return { game: { ...st.game, turn: e.nextTurn } };
        });
      }));

      unsubs.push(onTienLen("tienlen:chop", (e) => {
        if (get().game?.id !== e.gameId) return;
        const heo = e.heoCount ?? ((e.black ?? 0) + (e.red ?? 0));
        set({ lastChop: { chopper: e.chopper, victim: e.victim, heoCount: heo, black: e.black, red: e.red } });
        try { playChopSound(); } catch {/* ignore */}
        const me = myId();
        const amt = typeof e.coins === "number" ? `${e.coins} xu` : typeof e.rp === "number" ? `${e.rp} RP` : "";
        if (me === e.chopper) {
          toast.success(`Bạn chặt heo!${amt ? ` +${amt}` : ""}`);
        } else if (me === e.victim) {
          toast.error(`Bạn bị chặt heo!${amt ? ` -${amt}` : ""}`);
        }
        setTimeout(() => { if (get().lastChop) set({ lastChop: null }); }, 3000);
      }));

      unsubs.push(onTienLen("tienlen:end", (game) => {
        set({ game, phase: "finished" });
        const me = myId();
        const seat = mySeat(game);
        const place = seat != null ? game.players.find((p) => p.seat === seat)?.place : null;
        const rp = game.rpChange && me ? game.rpChange[me] : undefined;
        const coin = game.coinChange && me ? game.coinChange[me] : undefined;
        const extra = typeof rp === "number" ? ` (${rp > 0 ? "+" : ""}${rp} RP)` : typeof coin === "number" ? ` (${coin > 0 ? "+" : ""}${coin} xu)` : "";
        const won = (game.instantWin && game.instantWin.userId === me) || place === 1;
        if (game.instantWin && game.instantWin.userId === me) {
          toast.success(`Tới trắng!${extra}`);
        } else if (place === 1) {
          toast.success(`Bạn về Nhất!${extra}`);
        } else if (place != null) {
          toast.info(`Bạn về hạng ${place}.${extra}`);
        }
        try { won ? playWinSound() : (place != null && playLoseSound()); } catch {/* ignore */}
        get().loadHistory();
      }));

      unsubs.push(onTienLen("tienlen:player-disconnected", () => {}));
      unsubs.push(onTienLen("tienlen:player-reconnected", () => {}));
      unsubs.push(onTienLen("exception", (e) => { if (e?.message) toast.error(e.message); }));

      // Lời mời thách đấu.
      unsubs.push(onTienLen("tienlen:challenge-received", (e) => {
        set({ incomingChallenge: e });
        const nm = e.from?.displayName || e.from?.username || "Ai đó";
        toast.info(`${nm} mời bạn chơi Tiến Lên!`);
      }));
      unsubs.push(onTienLen("tienlen:challenge-accepted", (e) => {
        if (e.gameId) get().joinGame(e.gameId);
      }));
      unsubs.push(onTienLen("tienlen:challenge-declined", () => {
        toast.info("Lời mời đã bị từ chối.");
      }));

      // Phòng.
      unsubs.push(onTienLen("tienlen:room:updated", (room) => {
        const prev = get().room;
        if (prev && room.members.length > prev.members.length) { try { playPlayerJoinSound(); } catch {/* ignore */} }
        set({ room });
      }));
      unsubs.push(onTienLen("tienlen:room:started", (e) => {
        set({ room: null });
        if (e.gameId) get().joinGame(e.gameId);
      }));
      unsubs.push(onTienLen("tienlen:room:closed", (e) => {
        set({ room: null });
        if (e.reason === "HOST_LEFT") toast.info("Chủ phòng đã rời, phòng đã đóng.");
      }));
    },

    enterLobby: async () => {
      get().connect();
      try {
        const c = await tienlen.lobbyJoin();
        set({ searching: c.searching ?? {}, queuePlayers: c.players ?? {} });
      } catch { /* ignore */ }
    },
    leaveLobby: () => { try { tienlen.lobbyLeave(); } catch { /* ignore */ } },

    findMatch: async (size) => {
      get().connect();
      set({ phase: "queue", queueSize: size });
      try {
        const ack = await tienlen.queueJoin(size);
        if (ack.matched && ack.gameId) {
          await get().joinGame(ack.gameId);
        } else {
          set({ searching: ack.searching ?? get().searching, queuePlayers: ack.players ?? get().queuePlayers });
        }
      } catch (err: any) {
        set({ phase: "idle", queueSize: null });
        toast.error(err?.message || "Không vào được hàng chờ.");
      }
    },

    cancelQueue: async () => {
      try { await tienlen.queueLeave(); } catch { /* ignore */ }
      set({ phase: "idle", queueSize: null });
    },

    challenge: async (user, opts = {}) => {
      get().connect();
      try {
        await tienlen.challenge(user.id, opts);
        toast.success(`Đã gửi lời mời tới ${user.displayName || user.username}. Chờ đồng ý...`);
      } catch (err: any) {
        toast.error(err?.message || "Gửi lời mời thất bại.");
      }
    },

    acceptChallenge: async () => {
      const ch = get().incomingChallenge;
      if (!ch) return;
      set({ incomingChallenge: null });
      try {
        const gameId = await tienlen.challengeAccept(ch.challengeId);
        await get().joinGame(gameId);
      } catch (err: any) {
        toast.error(err?.message || "Không vào được trận (lời mời có thể đã hết hạn).");
      }
    },

    declineChallenge: () => {
      const ch = get().incomingChallenge;
      if (!ch) return;
      try { tienlen.challengeDecline(ch.challengeId); } catch { /* ignore */ }
      set({ incomingChallenge: null });
    },

    joinGame: async (gameId) => {
      get().connect();
      try {
        const game = await tienlen.join(gameId);
        if (game) set({ game, phase: game.status === "ACTIVE" ? "playing" : "finished" });
      } catch (err: any) {
        toast.error(err?.message || "Không vào được trận.");
      }
    },

    play: async (cards) => {
      const g = get().game;
      if (!g || g.status !== "ACTIVE" || cards.length === 0) return;
      try {
        const view = await tienlen.play(g.id, cards);
        if (view) set({ game: view, phase: view.status === "ACTIVE" ? "playing" : "finished" });
      } catch (err: any) {
        toast.error(err?.message || "Bộ bài không hợp lệ.");
      }
    },

    pass: async () => {
      const g = get().game;
      if (!g || g.status !== "ACTIVE") return;
      try {
        const view = await tienlen.pass(g.id);
        if (view) set({ game: view });
      } catch (err: any) {
        toast.error(err?.message || "Không bỏ lượt được.");
      }
    },

    resign: async () => {
      const g = get().game;
      if (!g || g.status !== "ACTIVE") return;
      try {
        const view = await tienlen.resign(g.id);
        if (view) set({ game: view, phase: view.status === "ACTIVE" ? "playing" : "finished" });
      } catch (err: any) {
        toast.error(err?.message || "Không đầu hàng được.");
      }
    },

    leaveGame: () => {
      const g = get().game;
      if (g) { try { tienlen.leave(g.id); } catch { /* ignore */ } }
      set({ game: null, phase: "idle", lastChop: null });
      get().loadHistory();
    },

    resumeActive: async () => {
      try {
        const game = await tienlenApi.active();
        if (game && game.status === "ACTIVE") {
          get().connect();
          set({ game, phase: "playing" });
          const g = await tienlen.join(game.id);
          if (g) set({ game: g });
          return;
        }
        const mine = await tienlenApi.myRoom().catch(() => null);
        if (mine && mine.status !== "CLOSED" && !mine.gameId) {
          get().connect();
          set({ room: mine });
        }
      } catch { /* ignore */ }
    },

    loadHistory: async () => {
      set({ loadingHistory: true });
      try {
        const list = await tienlenApi.history(20);
        set({ history: list });
      } catch { /* ignore */ } finally {
        set({ loadingHistory: false });
      }
    },

    loadRooms: async () => {
      set({ loadingRooms: true });
      try {
        const [list, mine] = await Promise.all([
          tienlenApi.rooms().catch(() => [] as GameRoom[]),
          tienlenApi.myRoom().catch(() => null),
        ]);
        set({ rooms: list });
        if (mine && mine.status !== "CLOSED" && !mine.gameId) set({ room: mine });
      } catch { /* ignore */ } finally {
        set({ loadingRooms: false });
      }
    },

    createRoom: async (input) => {
      get().connect();
      try {
        const room = await tienlen.roomCreate(input);
        if (room) set({ room });
      } catch (err: any) {
        toast.error(err?.message || "Tạo phòng thất bại.");
      }
    },

    joinRoom: async (input) => {
      get().connect();
      try {
        const room = await tienlen.roomJoin(input);
        if (room) set({ room });
      } catch (err: any) {
        toast.error(err?.message || "Vào phòng thất bại.");
      }
    },

    toggleReady: async () => {
      const r = get().room;
      const me = myId();
      if (!r || !me) return;
      const mine = r.members.find((m) => m.userId === me);
      try {
        const room = await tienlen.roomReady(r.id, !mine?.ready);
        if (room) set({ room });
      } catch (err: any) {
        toast.error(err?.message || "Không đổi được trạng thái.");
      }
    },

    startRoom: async () => {
      const r = get().room;
      if (!r) return;
      try {
        const gameId = await tienlen.roomStart(r.id);
        set({ room: null });
        await get().joinGame(gameId);
      } catch (err: any) {
        toast.error(err?.message || "Không bắt đầu được trận.");
      }
    },

    leaveRoom: async () => {
      const r = get().room;
      if (!r) { set({ room: null }); return; }
      try { await tienlen.roomLeave(r.id); } catch { /* ignore */ }
      set({ room: null });
      get().loadRooms();
    },

    clearFinished: () => {
      if (get().phase === "finished") set({ game: null, phase: "idle" });
    },

    reset: () => {
      unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
      unsubs = [];
      disconnectTienLen();
      set({ connected: false, bound: false, phase: "idle", queueSize: null, searching: {}, queuePlayers: {}, game: null, incomingChallenge: null, room: null, rooms: [], lastChop: null });
    },
  };
});
