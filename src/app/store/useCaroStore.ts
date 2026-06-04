"use client";

import { create } from "zustand";
import { caroApi, type CaroGame, type CommunityUser, type GameRoom } from "../lib/communityApi";
import { connectCaro, disconnectCaro, onCaro, caro, getCaroSocket, type CaroChallengeReceived, type CaroQueuePlayer } from "../lib/caroSocket";
import { useCommunityStore } from "./useCommunityStore";
import { toast } from "../components/Toast";
import { playMatchFoundSound, playPlayerJoinSound, playPlayerLeaveSound, playWinSound, playLoseSound, playDrawSound, playMoveSound, playYourTurnSound } from "../lib/gameSounds";

type Phase = "idle" | "queue" | "playing" | "finished";

interface CaroState {
  connected: boolean;
  bound: boolean;
  phase: Phase;
  queueSize: number;
  searching: number;              // số người đang tìm trận nhanh
  queuePlayers: CaroQueuePlayer[];
  game: CaroGame | null;
  // userId đối thủ đang rớt mạng + thời điểm hết hạn forfeit (ms epoch) để đếm ngược.
  opponentDisconnectedUntil: number | null;
  // Lời mời thách đấu đang chờ mình phản hồi.
  incomingChallenge: CaroChallengeReceived | null;
  history: CaroGame[];
  loadingHistory: boolean;
  // Phòng cược xu / phòng thường.
  room: GameRoom | null;
  rooms: GameRoom[];
  loadingRooms: boolean;

  connect: () => void;
  bindRealtime: () => void;
  enterLobby: () => Promise<void>;
  leaveLobby: () => void;
  findMatch: () => Promise<void>;
  cancelQueue: () => Promise<void>;
  challenge: (user: CommunityUser, ranked?: boolean) => Promise<void>;
  acceptChallenge: () => Promise<void>;
  declineChallenge: () => void;
  joinGame: (gameId: string) => Promise<void>;
  makeMove: (row: number, col: number) => Promise<void>;
  resign: () => Promise<void>;
  leaveGame: () => void;
  resumeActive: () => Promise<void>;
  loadHistory: () => Promise<void>;
  // Phòng.
  loadRooms: () => Promise<void>;
  createRoom: (input: { betAmount?: number; isPrivate?: boolean; name?: string }) => Promise<void>;
  joinRoom: (input: { roomId?: string; code?: string }) => Promise<void>;
  toggleReady: () => Promise<void>;
  startRoom: () => Promise<void>;
  leaveRoom: () => Promise<void>;
  clearFinished: () => void;
  reset: () => void;
}

let unsubs: Array<() => void> = [];

export const useCaroStore = create<CaroState>((set, get) => {
  const myId = () => useCommunityStore.getState().user?.id;

  // Tìm mark (1=X, 2=O) của một userId trong ván.
  const markOf = (game: CaroGame | null, userId?: string): 1 | 2 | 0 => {
    if (!game || !userId) return 0;
    if (game.players.X?.id === userId) return 1;
    if (game.players.O?.id === userId) return 2;
    return 0;
  };

  return {
    connected: false,
    bound: false,
    phase: "idle",
    queueSize: 0,
    searching: 0,
    queuePlayers: [],
    game: null,
    opponentDisconnectedUntil: null,
    incomingChallenge: null,
    history: [],
    loadingHistory: false,
    room: null,
    rooms: [],
    loadingRooms: false,

    connect: () => {
      connectCaro();
      const s = getCaroSocket();
      set({ connected: s.connected });
      get().bindRealtime();
    },

    bindRealtime: () => {
      if (get().bound) return;
      set({ bound: true });

      unsubs.push(onCaro("connect", () => set({ connected: true })));
      unsubs.push(onCaro("disconnect", () => set({ connected: false })));

      // Được ghép cặp (matchmaking hoặc thách đấu) → vào trận.
      unsubs.push(onCaro("caro:matched", (game) => {
        set({ game, phase: "playing", queueSize: 0, opponentDisconnectedUntil: null });
        try { playMatchFoundSound(); } catch {/* ignore */}
        // join room để nhận update + cho reconnect.
        caro.join(game.id).then((g) => { if (g) set({ game: g }); }).catch(() => {});
      }));

      // Nước đi mới (của mình hoặc đối thủ).
      unsubs.push(onCaro("caro:move", (e) => {
        try { playMoveSound(); } catch {/* ignore */}
        set((st) => {
          if (!st.game || st.game.id !== e.gameId) return {};
          const board = st.game.board.slice();
          const idx = e.row * st.game.boardSize + e.col;
          board[idx] = e.mark;
          const moves = [...st.game.moves, { by: e.mark, row: e.row, col: e.col }];
          return { game: { ...st.game, board, moves, turn: e.nextTurn } };
        });
        // tới lượt mình → chuông báo.
        const g = get().game;
        const myMark = markOf(g, myId());
        if (g && g.status === "ACTIVE" && myMark !== 0 && e.nextTurn === myMark) {
          try { playYourTurnSound(); } catch {/* ignore */}
        }
      }));

      // Kết thúc trận.
      unsubs.push(onCaro("caro:end", (game) => {
        set({ game, phase: "finished", opponentDisconnectedUntil: null });
        const me = myId();
        const myMark = markOf(game, me);
        const myUserId = me;
        const rp = game.rpChange && myUserId ? game.rpChange[myUserId] : undefined;
        const rpText = typeof rp === "number" ? ` (${rp > 0 ? "+" : ""}${rp} RP)` : "";
        if (game.endReason === "DRAW") {
          toast.info(`Ván hoà!${rpText}`);
          try { playDrawSound(); } catch {/* ignore */}
        } else if (game.winner && me && game.winner === me) {
          toast.success(`Bạn thắng!${rpText}`);
          try { playWinSound(); } catch {/* ignore */}
        } else if (myMark !== 0) {
          toast.info(`Bạn thua.${rpText}`);
          try { playLoseSound(); } catch {/* ignore */}
        }
        // Tải lại lịch sử để trận vừa xong xuất hiện ngay khi về sảnh.
        get().loadHistory();
      }));

      unsubs.push(onCaro("caro:opponent-disconnected", (e) => {
        if (get().game?.id !== e.gameId) return;
        // chỉ báo một lần khi chuyển sang trạng thái mất kết nối (tránh spam).
        if (get().opponentDisconnectedUntil) { set({ opponentDisconnectedUntil: Date.now() + (e.graceMs ?? 30000) }); return; }
        set({ opponentDisconnectedUntil: Date.now() + (e.graceMs ?? 30000) });
        toast.info("Đối thủ mất kết nối, đang chờ vào lại...");
        try { playPlayerLeaveSound(); } catch {/* ignore */}
      }));
      unsubs.push(onCaro("caro:opponent-reconnected", (e) => {
        if (get().game?.id !== e.gameId) return;
        // chỉ báo khi trước đó đang ở trạng thái mất kết nối (tránh spam lặp lại).
        if (!get().opponentDisconnectedUntil) return;
        set({ opponentDisconnectedUntil: null });
        toast.success("Đối thủ đã vào lại.");
        try { playPlayerJoinSound(); } catch {/* ignore */}
      }));

      // Lỗi nước đi / hành động (sai lượt, ô đã có, ngoài biên...).
      unsubs.push(onCaro("exception", (e) => {
        if (e?.message) toast.error(e.message);
      }));

      // Số người đang tìm trận (live).
      unsubs.push(onCaro("caro:queue:count", (e) => {
        const prev = get().searching;
        if ((e.searching ?? 0) > prev) { try { playPlayerJoinSound(); } catch {/* ignore */} }
        set({ searching: e.searching ?? 0, queuePlayers: e.players ?? [] });
      }));

      // Nhận lời mời thách đấu → hiện popup cho mình phản hồi.
      unsubs.push(onCaro("caro:challenge-received", (e) => {
        set({ incomingChallenge: e });
        const nm = e.from?.displayName || e.from?.username || "Ai đó";
        toast.info(`${nm} mời bạn chơi cờ caro!`);
      }));
      // Đối thủ đồng ý lời mời mình gửi → vào trận (caro:matched cũng sẽ tới).
      unsubs.push(onCaro("caro:challenge-accepted", (e) => {
        if (e.gameId) get().joinGame(e.gameId);
      }));
      unsubs.push(onCaro("caro:challenge-declined", () => {
        toast.info("Lời mời thách đấu đã bị từ chối.");
      }));

      // Phòng cược xu / phòng thường.
      unsubs.push(onCaro("caro:room:updated", (room) => {
        const prev = get().room;
        if (prev && room.members.length > prev.members.length) {
          try { playPlayerJoinSound(); } catch {/* ignore */}
        }
        set({ room });
      }));
      unsubs.push(onCaro("caro:room:started", (e) => {
        set({ room: null });
        if (e.gameId) get().joinGame(e.gameId);
      }));
      unsubs.push(onCaro("caro:room:closed", (e) => {
        set({ room: null });
        if (e.reason === "HOST_LEFT") toast.info("Chủ phòng đã rời, phòng đã đóng.");
      }));
    },

    enterLobby: async () => {
      get().connect();
      try {
        const c = await caro.lobbyJoin();
        set({ searching: c.searching ?? 0, queuePlayers: c.players ?? [] });
      } catch { /* ignore */ }
    },

    leaveLobby: () => {
      try { caro.lobbyLeave(); } catch { /* ignore */ }
    },

    findMatch: async () => {
      get().connect();
      set({ phase: "queue" });
      try {
        const ack = await caro.queueJoin();
        if (ack.matched && ack.gameId) {
          await get().joinGame(ack.gameId);
        } else {
          set({ queueSize: ack.queueSize ?? 0, searching: ack.searching ?? get().searching, queuePlayers: ack.players ?? get().queuePlayers });
        }
      } catch (err: any) {
        set({ phase: "idle" });
        toast.error(err?.message || "Không vào được hàng chờ.");
      }
    },

    cancelQueue: async () => {
      try { await caro.queueLeave(); } catch { /* ignore */ }
      set({ phase: "idle", queueSize: 0 });
    },

    // Gửi lời mời thách đấu — KHÔNG tạo trận ngay, chờ đối thủ đồng ý.
    challenge: async (user, ranked = false) => {
      get().connect();
      try {
        await caro.challenge(user.id, ranked);
        toast.success(`Đã gửi lời mời tới ${user.displayName || user.username}. Chờ đối thủ đồng ý...`);
      } catch (err: any) {
        toast.error(err?.message || "Gửi lời mời thất bại.");
      }
    },

    acceptChallenge: async () => {
      const ch = get().incomingChallenge;
      if (!ch) return;
      set({ incomingChallenge: null });
      try {
        const gameId = await caro.challengeAccept(ch.challengeId);
        await get().joinGame(gameId);
      } catch (err: any) {
        toast.error(err?.message || "Không vào được trận (lời mời có thể đã hết hạn).");
      }
    },

    declineChallenge: () => {
      const ch = get().incomingChallenge;
      if (!ch) return;
      try { caro.challengeDecline(ch.challengeId); } catch { /* ignore */ }
      set({ incomingChallenge: null });
    },

    joinGame: async (gameId) => {
      get().connect();
      try {
        const game = await caro.join(gameId);
        if (game) set({ game, phase: game.status === "ACTIVE" ? "playing" : "finished", opponentDisconnectedUntil: null });
      } catch (err: any) {
        toast.error(err?.message || "Không vào được trận.");
      }
    },

    makeMove: async (row, col) => {
      const st = get();
      const g = st.game;
      const me = myId();
      if (!g || g.status !== "ACTIVE") return;
      const myMark = markOf(g, me);
      if (myMark === 0 || g.turn !== myMark) return;             // không phải lượt mình
      if (g.board[row * g.boardSize + col] !== 0) return;        // ô đã có quân
      try {
        const view = await caro.move(g.id, row, col);
        if (view) {
          set({ game: view, phase: view.status === "ACTIVE" ? "playing" : "finished" });
          if (view.status !== "ACTIVE") get().loadHistory();
        }
      } catch (err: any) {
        toast.error(err?.message || "Nước đi không hợp lệ.");
      }
    },

    resign: async () => {
      const g = get().game;
      if (!g || g.status !== "ACTIVE") return;
      try {
        const view = await caro.resign(g.id);
        if (view) { set({ game: view, phase: "finished" }); get().loadHistory(); }
      } catch (err: any) {
        toast.error(err?.message || "Không đầu hàng được.");
      }
    },

    leaveGame: () => {
      const g = get().game;
      if (g) { try { caro.leave(g.id); } catch { /* ignore */ } }
      set({ game: null, phase: "idle", opponentDisconnectedUntil: null });
      // làm mới lịch sử khi quay về sảnh.
      get().loadHistory();
    },

    resumeActive: async () => {
      try {
        const game = await caroApi.active();
        if (game && game.status === "ACTIVE") {
          get().connect();
          set({ game, phase: "playing" });
          const g = await caro.join(game.id);
          if (g) set({ game: g });
          return;
        }
        // không có trận → thử nối lại phòng đang mở.
        const mine = await caroApi.myRoom().catch(() => null);
        if (mine && mine.status !== "CLOSED" && !mine.gameId) {
          get().connect();
          set({ room: mine });
        }
      } catch { /* ignore */ }
    },

    loadHistory: async () => {
      set({ loadingHistory: true });
      try {
        const list = await caroApi.history(20);
        set({ history: list });
      } catch { /* ignore */ } finally {
        set({ loadingHistory: false });
      }
    },

    loadRooms: async () => {
      set({ loadingRooms: true });
      try {
        const [list, mine] = await Promise.all([
          caroApi.rooms().catch(() => [] as GameRoom[]),
          caroApi.myRoom().catch(() => null),
        ]);
        set({ rooms: list });
        if (mine && mine.status !== "CLOSED") set({ room: mine });
      } catch { /* ignore */ } finally {
        set({ loadingRooms: false });
      }
    },

    createRoom: async (input) => {
      get().connect();
      try {
        const room = await caro.roomCreate(input);
        if (room) set({ room });
      } catch (err: any) {
        toast.error(err?.message || "Tạo phòng thất bại.");
      }
    },

    joinRoom: async (input) => {
      get().connect();
      try {
        const room = await caro.roomJoin(input);
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
        const room = await caro.roomReady(r.id, !mine?.ready);
        if (room) set({ room });
      } catch (err: any) {
        toast.error(err?.message || "Không đổi được trạng thái.");
      }
    },

    startRoom: async () => {
      const r = get().room;
      if (!r) return;
      try {
        const gameId = await caro.roomStart(r.id);
        set({ room: null });
        await get().joinGame(gameId);
      } catch (err: any) {
        toast.error(err?.message || "Không bắt đầu được trận.");
      }
    },

    leaveRoom: async () => {
      const r = get().room;
      if (!r) { set({ room: null }); return; }
      try { await caro.roomLeave(r.id); } catch { /* ignore */ }
      set({ room: null });
      get().loadRooms();
    },

    clearFinished: () => {
      if (get().phase === "finished") set({ game: null, phase: "idle" });
    },

    reset: () => {
      unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
      unsubs = [];
      disconnectCaro();
      set({ connected: false, bound: false, phase: "idle", queueSize: 0, searching: 0, queuePlayers: [], game: null, opponentDisconnectedUntil: null, incomingChallenge: null, room: null, rooms: [] });
    },
  };
});
