"use client";

import { io, Socket } from "socket.io-client";
import { getAccessToken, getValidAccessToken, normalizeCaroGame, normalizeGameRoom, type CaroGame, type GameRoom } from "./communityApi";

// WebSocket gốc của backend (KHÔNG có hậu tố /api).
const WS_ORIGIN = "https://appapi.htss.club";

// ── Sự kiện server → client trên namespace /ws-caro ───────────────────────────
export interface CaroMatchedGame extends CaroGame {}
export interface CaroMoveEvent {
  gameId: string;
  by: string;        // userId người vừa đi
  mark: 1 | 2;
  row: number;
  col: number;
  nextTurn: 1 | 2;
}
export interface CaroDisconnectEvent {
  gameId: string;
  userId: string;
  graceMs?: number;
}
export interface CaroReconnectEvent {
  gameId: string;
  userId: string;
}
// Lời mời thách đấu (đối thủ phải đồng ý).
export interface CaroChallengeReceived {
  challengeId: string;
  from: { id: string; username?: string; displayName?: string; avatarUrl?: string; level?: number; levelStyle?: any; rank?: any };
  mode?: string;
  ranked?: boolean;
  expiresInMs?: number;
}
export interface CaroChallengeResult {
  challengeId: string;
  gameId?: string;
  byUserId?: string;
}
// Người đang chờ ghép trận (để hiện rank).
export interface CaroQueuePlayer {
  userId: string;
  rankPoints?: number;
  user?: { id: string; username?: string; displayName?: string; avatarUrl?: string; level?: number; levelStyle?: any; rank?: any };
}
export interface CaroQueueCount {
  searching: number;
  players?: CaroQueuePlayer[];
}

type CaroEventMap = {
  "caro:matched": (game: CaroGame) => void;
  "caro:move": (e: CaroMoveEvent) => void;
  "caro:end": (game: CaroGame) => void;
  "caro:opponent-disconnected": (e: CaroDisconnectEvent) => void;
  "caro:opponent-reconnected": (e: CaroReconnectEvent) => void;
  "caro:challenge-received": (e: CaroChallengeReceived) => void;
  "caro:challenge-accepted": (e: CaroChallengeResult) => void;
  "caro:challenge-declined": (e: CaroChallengeResult) => void;
  "caro:queue:count": (e: CaroQueueCount) => void;
  "caro:room:updated": (room: GameRoom) => void;
  "caro:room:started": (e: { roomId: string; gameId: string }) => void;
  "caro:room:closed": (e: { roomId: string; reason?: string }) => void;
  exception: (e: { code?: string; message: string }) => void;
  error: (e: { code?: string; message: string }) => void;
  connect: () => void;
  disconnect: () => void;
};

let caroSocket: Socket | null = null;

export function getCaroSocket(): Socket {
  if (!caroSocket) {
    caroSocket = io(`${WS_ORIGIN}/ws-caro`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { token: getAccessToken() },
    });
    bindAuthRecovery(caroSocket);
  }
  return caroSocket;
}

// Khi server từ chối vì token hết hạn → refresh rồi nối lại (một lần).
function bindAuthRecovery(s: Socket) {
  let recovering = false;
  const tryRecover = async (reason: unknown) => {
    const msg = String((reason as any)?.message ?? (reason as any)?.code ?? reason ?? "").toLowerCase();
    const isAuth = msg.includes("unauthorized") || msg.includes("invalid token") || msg.includes("token") || msg.includes("jwt");
    if (!isAuth || recovering) return;
    recovering = true;
    try {
      const tok = await getValidAccessToken(0);
      if (tok) {
        (s.auth as Record<string, unknown>) = { token: tok };
        s.disconnect();
        s.connect();
      }
    } finally {
      setTimeout(() => { recovering = false; }, 1500);
    }
  };
  s.on("connect_error", (err) => { void tryRecover(err); });
  s.on("error", (err) => { void tryRecover(err); });
}

export function connectCaro(): Socket {
  const s = getCaroSocket();
  (s.auth as Record<string, unknown>) = { token: getAccessToken() };
  if (!s.connected) s.connect();
  void ensureFreshToken(s);
  return s;
}

async function ensureFreshToken(s: Socket): Promise<void> {
  try {
    const tok = await getValidAccessToken();
    const current = (s.auth as Record<string, unknown> | undefined)?.token as string | undefined;
    if (tok && tok !== current) {
      (s.auth as Record<string, unknown>) = { token: tok };
      s.disconnect();
      s.connect();
    }
  } catch { /* ignore */ }
}

export function disconnectCaro() {
  if (caroSocket) {
    caroSocket.removeAllListeners();
    caroSocket.disconnect();
    caroSocket = null;
  }
}

export function onCaro<E extends keyof CaroEventMap>(event: E, cb: CaroEventMap[E]): () => void {
  const s = getCaroSocket();
  s.on(event as string, cb as (...args: any[]) => void);
  return () => s.off(event as string, cb as (...args: any[]) => void);
}

// Bọc emit có ack + timeout, chuẩn hoá GameView trả về.
function emitGame(event: string, payload: Record<string, unknown>, timeoutMs = 12000): Promise<CaroGame | null> {
  return new Promise((resolve, reject) => {
    const s = getCaroSocket();
    const timer = setTimeout(() => reject(new Error("Hết thời gian chờ máy chủ game.")), timeoutMs);
    s.emit(event, payload, (resp: any) => {
      clearTimeout(timer);
      if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
      resolve(normalizeCaroGame(resp));
    });
  });
}

// Bọc emit có ack + timeout, chuẩn hoá RoomView trả về.
function emitRoom(event: string, payload: Record<string, unknown>, timeoutMs = 12000): Promise<GameRoom | null> {
  return new Promise((resolve, reject) => {
    const s = getCaroSocket();
    const timer = setTimeout(() => reject(new Error("Hết thời gian chờ máy chủ phòng.")), timeoutMs);
    s.emit(event, payload, (resp: any) => {
      clearTimeout(timer);
      if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
      resolve(normalizeGameRoom(resp));
    });
  });
}

export const caro = {
  // Ghép trận ranked. Trả { queued, queueSize, searching, players } hoặc { matched, gameId }.
  queueJoin: (): Promise<{ queued?: boolean; queueSize?: number; searching?: number; players?: CaroQueuePlayer[]; matched?: boolean; gameId?: string }> =>
    new Promise((resolve, reject) => {
      const s = getCaroSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian chờ ghép trận.")), 12000);
      s.emit("caro:queue:join", {}, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
        resolve(resp ?? {});
      });
    }),
  queueLeave: (): Promise<void> =>
    new Promise((resolve) => {
      const s = getCaroSocket();
      const timer = setTimeout(() => resolve(), 6000);
      s.emit("caro:queue:leave", {}, () => { clearTimeout(timer); resolve(); });
    }),
  // Vào "sảnh" để nhận số người đang tìm trận (không xếp hàng).
  lobbyJoin: (): Promise<CaroQueueCount> =>
    new Promise((resolve) => {
      const s = getCaroSocket();
      const timer = setTimeout(() => resolve({ searching: 0 }), 6000);
      s.emit("caro:lobby:join", {}, (resp: any) => { clearTimeout(timer); resolve(resp ?? { searching: 0 }); });
    }),
  lobbyLeave: () => { getCaroSocket().emit("caro:lobby:leave", {}); },
  queueCount: (): Promise<CaroQueueCount> =>
    new Promise((resolve) => {
      const s = getCaroSocket();
      const timer = setTimeout(() => resolve({ searching: 0 }), 6000);
      s.emit("caro:queue:count", {}, (resp: any) => { clearTimeout(timer); resolve(resp ?? { searching: 0 }); });
    }),
  // Gửi lời mời thách đấu (KHÔNG tạo trận ngay; đối thủ phải đồng ý).
  challenge: (opponentId: string, ranked = false): Promise<{ challengeId?: string; sent?: boolean; expiresInMs?: number }> =>
    new Promise((resolve, reject) => {
      const s = getCaroSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian gửi thách đấu.")), 12000);
      s.emit("caro:challenge", { opponentId, ranked }, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
        resolve(resp ?? {});
      });
    }),
  // Đồng ý lời mời → trả gameId.
  challengeAccept: (challengeId: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const s = getCaroSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian phản hồi lời mời.")), 12000);
      s.emit("caro:challenge:accept", { challengeId }, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
        const id = resp?.gameId ?? resp?.id;
        if (!id) { reject(new Error("Không vào được trận.")); return; }
        resolve(id);
      });
    }),
  challengeDecline: (challengeId: string) => { getCaroSocket().emit("caro:challenge:decline", { challengeId }); },
  join: (gameId: string) => emitGame("caro:join", { gameId }),
  move: (gameId: string, row: number, col: number) => emitGame("caro:move", { gameId, row, col }),
  resign: (gameId: string) => emitGame("caro:resign", { gameId }),
  leave: (gameId: string) => { getCaroSocket().emit("caro:leave", { gameId }); },
  // ── Phòng cược xu (WAGER) / phòng thường (CASUAL) ──
  roomCreate: (input: { betAmount?: number; isPrivate?: boolean; name?: string }) => emitRoom("caro:room:create", input),
  roomJoin: (input: { roomId?: string; code?: string }) => emitRoom("caro:room:join", input),
  roomReady: (roomId: string, ready: boolean) => emitRoom("caro:room:ready", { roomId, ready }),
  roomStart: (roomId: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const s = getCaroSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian bắt đầu trận.")), 12000);
      s.emit("caro:room:start", { roomId }, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
        const id = resp?.gameId ?? resp?.id;
        if (!id) { reject(new Error("Không bắt đầu được trận.")); return; }
        resolve(id);
      });
    }),
  roomLeave: (roomId: string): Promise<{ left?: boolean; cancelled?: boolean }> =>
    new Promise((resolve) => {
      const s = getCaroSocket();
      const timer = setTimeout(() => resolve({}), 6000);
      s.emit("caro:room:leave", { roomId }, (resp: any) => { clearTimeout(timer); resolve(resp ?? {}); });
    }),
};
