"use client";

import { io, Socket } from "socket.io-client";
import { getAccessToken, getValidAccessToken, normalizeTienLenGame, normalizeGameRoom, type TienLenGame, type GameRoom } from "./communityApi";

const WS_ORIGIN = "https://appapi.htss.club";

// ── Event payloads ────────────────────────────────────────────────────────────
export interface TLQueuePlayer {
  userId: string;
  user?: { id: string; username?: string; displayName?: string; avatarUrl?: string; level?: number; levelStyle?: any; rank?: any };
}
export interface TLQueueCount {
  searching: Record<string, number>;      // { "2": n, "3": n, "4": n }
  players?: Record<string, TLQueuePlayer[]>;
}
export interface TLChallengeReceived {
  challengeId: string;
  from: { id: string; username?: string; displayName?: string; avatarUrl?: string; level?: number; levelStyle?: any; rank?: any };
  mode?: string;
  betAmount?: number;
  expiresInMs?: number;
}
export interface TLPlayEvent {
  gameId: string;
  seat: number;
  userId: string;
  cards: number[];
  comboType?: string;
  handCount: number;
  nextTurn: number;
  currentCombo: number[];
  chop?: { chopper: string; victim: string; heoCount: number } | null;
}
export interface TLPassEvent {
  gameId: string;
  seat: number;
  userId: string;
  nextTurn: number;
  trickReset?: boolean;
}
export interface TLChopEvent {
  gameId: string;
  chopper: string;
  victim: string;
  heoCount?: number;
  black?: number;
  red?: number;
  units?: number;
  coins?: number;
  blackPrice?: number;
  redPrice?: number;
  rp?: number;
  insufficient?: boolean;
}

type TLEventMap = {
  "tienlen:matched": (game: TienLenGame) => void;
  "tienlen:queue:count": (e: TLQueueCount) => void;
  "tienlen:play": (e: TLPlayEvent) => void;
  "tienlen:pass": (e: TLPassEvent) => void;
  "tienlen:resigned": (e: { gameId: string; userId: string; seat: number; nextTurn: number }) => void;
  "tienlen:chop": (e: TLChopEvent) => void;
  "tienlen:end": (game: TienLenGame) => void;
  "tienlen:player-disconnected": (e: { gameId: string; userId: string }) => void;
  "tienlen:player-reconnected": (e: { gameId: string; userId: string }) => void;
  "tienlen:challenge-received": (e: TLChallengeReceived) => void;
  "tienlen:challenge-accepted": (e: { challengeId: string; gameId: string; byUserId?: string }) => void;
  "tienlen:challenge-declined": (e: { challengeId: string; byUserId?: string }) => void;
  "tienlen:room:updated": (room: GameRoom) => void;
  "tienlen:room:started": (e: { roomId: string; gameId: string }) => void;
  "tienlen:room:closed": (e: { roomId: string; reason?: string }) => void;
  exception: (e: { code?: string; message: string }) => void;
  error: (e: { code?: string; message: string }) => void;
  connect: () => void;
  disconnect: () => void;
};

let tlSocket: Socket | null = null;

export function getTienLenSocket(): Socket {
  if (!tlSocket) {
    tlSocket = io(`${WS_ORIGIN}/ws-tienlen`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { token: getAccessToken() },
    });
    bindAuthRecovery(tlSocket);
  }
  return tlSocket;
}

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

export function connectTienLen(): Socket {
  const s = getTienLenSocket();
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

export function disconnectTienLen() {
  if (tlSocket) {
    tlSocket.removeAllListeners();
    tlSocket.disconnect();
    tlSocket = null;
  }
}

export function onTienLen<E extends keyof TLEventMap>(event: E, cb: TLEventMap[E]): () => void {
  const s = getTienLenSocket();
  s.on(event as string, cb as (...args: any[]) => void);
  return () => s.off(event as string, cb as (...args: any[]) => void);
}

function emitGame(event: string, payload: Record<string, unknown>, timeoutMs = 12000): Promise<TienLenGame | null> {
  return new Promise((resolve, reject) => {
    const s = getTienLenSocket();
    const timer = setTimeout(() => reject(new Error("Hết thời gian chờ máy chủ game.")), timeoutMs);
    s.emit(event, payload, (resp: any) => {
      clearTimeout(timer);
      if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
      resolve(normalizeTienLenGame(resp));
    });
  });
}

function emitRoom(event: string, payload: Record<string, unknown>, timeoutMs = 12000): Promise<GameRoom | null> {
  return new Promise((resolve, reject) => {
    const s = getTienLenSocket();
    const timer = setTimeout(() => reject(new Error("Hết thời gian chờ máy chủ phòng.")), timeoutMs);
    s.emit(event, payload, (resp: any) => {
      clearTimeout(timer);
      if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
      resolve(normalizeGameRoom(resp));
    });
  });
}

export const tienlen = {
  lobbyJoin: (): Promise<TLQueueCount> =>
    new Promise((resolve) => {
      const s = getTienLenSocket();
      const timer = setTimeout(() => resolve({ searching: {} }), 6000);
      s.emit("tienlen:lobby:join", {}, (resp: any) => { clearTimeout(timer); resolve(resp ?? { searching: {} }); });
    }),
  lobbyLeave: () => { getTienLenSocket().emit("tienlen:lobby:leave", {}); },
  queueCount: (): Promise<TLQueueCount> =>
    new Promise((resolve) => {
      const s = getTienLenSocket();
      const timer = setTimeout(() => resolve({ searching: {} }), 6000);
      s.emit("tienlen:queue:count", {}, (resp: any) => { clearTimeout(timer); resolve(resp ?? { searching: {} }); });
    }),
  queueJoin: (size: number): Promise<{ queued?: boolean; size?: number; searching?: Record<string, number>; players?: Record<string, TLQueuePlayer[]>; matched?: boolean; gameId?: string }> =>
    new Promise((resolve, reject) => {
      const s = getTienLenSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian chờ ghép trận.")), 12000);
      s.emit("tienlen:queue:join", { size }, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
        resolve(resp ?? {});
      });
    }),
  queueLeave: (): Promise<void> =>
    new Promise((resolve) => {
      const s = getTienLenSocket();
      const timer = setTimeout(() => resolve(), 6000);
      s.emit("tienlen:queue:leave", {}, () => { clearTimeout(timer); resolve(); });
    }),
  // Thách đấu 1v1 (lời mời, phải đồng ý).
  challenge: (opponentId: string, opts: { ranked?: boolean; betAmount?: number } = {}): Promise<{ challengeId?: string; sent?: boolean; expiresInMs?: number }> =>
    new Promise((resolve, reject) => {
      const s = getTienLenSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian gửi thách đấu.")), 12000);
      s.emit("tienlen:challenge", { opponentId, ...opts }, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
        resolve(resp ?? {});
      });
    }),
  challengeAccept: (challengeId: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const s = getTienLenSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian phản hồi.")), 12000);
      s.emit("tienlen:challenge:accept", { challengeId }, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
        const id = resp?.gameId ?? resp?.id;
        if (!id) { reject(new Error("Không vào được trận.")); return; }
        resolve(id);
      });
    }),
  challengeDecline: (challengeId: string) => { getTienLenSocket().emit("tienlen:challenge:decline", { challengeId }); },
  // Phòng.
  roomCreate: (input: { betAmount?: number; maxPlayers?: number; ranked?: boolean; isPrivate?: boolean; name?: string }) => emitRoom("tienlen:room:create", input),
  roomJoin: (input: { roomId?: string; code?: string }) => emitRoom("tienlen:room:join", input),
  roomReady: (roomId: string, ready: boolean) => emitRoom("tienlen:room:ready", { roomId, ready }),
  roomStart: (roomId: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const s = getTienLenSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian bắt đầu trận.")), 12000);
      s.emit("tienlen:room:start", { roomId }, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error)); return; }
        const id = resp?.gameId ?? resp?.id;
        if (!id) { reject(new Error("Không bắt đầu được trận.")); return; }
        resolve(id);
      });
    }),
  roomLeave: (roomId: string): Promise<{ left?: boolean; cancelled?: boolean }> =>
    new Promise((resolve) => {
      const s = getTienLenSocket();
      const timer = setTimeout(() => resolve({}), 6000);
      s.emit("tienlen:room:leave", { roomId }, (resp: any) => { clearTimeout(timer); resolve(resp ?? {}); });
    }),
  // Trong trận.
  join: (gameId: string) => emitGame("tienlen:join", { gameId }),
  play: (gameId: string, cards: number[]) => emitGame("tienlen:play", { gameId, cards }),
  pass: (gameId: string) => emitGame("tienlen:pass", { gameId }),
  resign: (gameId: string) => emitGame("tienlen:resign", { gameId }),
  leave: (gameId: string) => { getTienLenSocket().emit("tienlen:leave", { gameId }); },
};
