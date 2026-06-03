"use client";

import { io, Socket } from "socket.io-client";
import { getAccessToken, getValidAccessToken } from "./communityApi";
import type { Message, NotificationItem, PresenceStatus, VoiceMember, Channel, MemberRole } from "./communityApi";

// WebSocket gốc của backend (KHÔNG có hậu tố /api).
const WS_ORIGIN = "https://appapi.htss.club";

// ── Chat namespace (/ws) ──────────────────────────────────────────────────────
export interface TypingEvent {
  channelId: string;
  userId: string;
  isTyping: boolean;
}
export interface PresenceChangedEvent {
  userId: string;
  presence: PresenceStatus;
}
export interface MessageDeletedEvent {
  messageId: string;
  channelId: string;
}
export interface ReactionEvent {
  channelId: string;
  messageId: string;
  emoji: string;
  userId: string;
}
export interface ChannelDeletedEvent {
  serverId: string;
  channelId: string;
}
export interface ChannelReorderedEvent {
  serverId: string;
  channels: Channel[];
}
// Voice occupancy realtime trên namespace chat (room server) — ai cũng nhận,
// kể cả người chưa vào kênh thoại.
export interface VoiceChannelJoinedEvent {
  serverId: string;
  channelId: string;
  member: VoiceMember;
}
export interface VoiceChannelLeftEvent {
  serverId: string;
  channelId: string;
  userId: string;
}
// Trạng thái mic/loa của thành viên trong kênh thoại, phát tới room server
// để người CHƯA vào phòng vẫn thấy ai đang tắt mic/tai nghe.
export interface VoiceMemberStateEvent {
  serverId?: string;
  channelId: string;
  userId: string;
  muted?: boolean;
  deafened?: boolean;
  speaking?: boolean;
  streaming?: boolean;
}
// Đồng bộ hồ sơ user (đổi tên/avatar) tới mọi server chung.
export interface UserUpdatedEvent {
  serverId?: string;
  user: { id: string; username?: string; displayName?: string; avatarUrl?: string };
}
// Đồng bộ thông tin server (đổi tên/icon).
export interface ServerUpdatedEvent {
  id: string;
  name?: string;
  iconUrl?: string;
  ownerId?: string;
  isDefault?: boolean;
}
export interface ServerMemberEvent {
  serverId: string;
  userId: string;
  role?: MemberRole;
  nickname?: string;
  reason?: string;
}
export interface ServerAnnouncementEvent {
  serverId: string;
  message: string;
  byUserId?: string;
  at?: string;
}
export interface ServerOwnershipEvent {
  serverId: string;
  from: string;
  to: string;
}

type ChatEventMap = {
  "message:new": (m: Message) => void;
  "message:updated": (m: Message) => void;
  "message:deleted": (e: MessageDeletedEvent) => void;
  "reaction:added": (e: ReactionEvent) => void;
  "reaction:removed": (e: ReactionEvent) => void;
  "channel:created": (c: Channel) => void;
  "channel:updated": (c: Channel) => void;
  "channel:deleted": (e: ChannelDeletedEvent) => void;
  "channel:reordered": (e: ChannelReorderedEvent) => void;
  "voice:channel-joined": (e: VoiceChannelJoinedEvent) => void;
  "voice:channel-left": (e: VoiceChannelLeftEvent) => void;
  "voice:channel-state": (e: VoiceMemberStateEvent) => void;
  "voice:member-state": (e: VoiceMemberStateEvent) => void;
  "voice:state-changed": (e: VoiceMemberStateEvent) => void;
  "stream:started": (e: { serverId?: string; channelId: string; userId: string; user?: VoiceMember; source?: "screen" | "camera" }) => void;
  "stream:stopped": (e: { serverId?: string; channelId: string; userId: string }) => void;
  "user:updated": (e: UserUpdatedEvent) => void;
  "server:updated": (s: ServerUpdatedEvent) => void;
  "server:member-joined": (e: ServerMemberEvent) => void;
  "server:member-left": (e: ServerMemberEvent) => void;
  "server:member-updated": (e: ServerMemberEvent) => void;
  "server:member-banned": (e: ServerMemberEvent) => void;
  "server:you-were-banned": (e: { serverId: string; reason?: string }) => void;
  "server:ownership-transferred": (e: ServerOwnershipEvent) => void;
  "server:announcement": (e: ServerAnnouncementEvent) => void;
  typing: (e: TypingEvent) => void;
  "presence:changed": (e: PresenceChangedEvent) => void;
  "notification:new": (n: NotificationItem) => void;
  error: (e: { code: string; message: string }) => void;
  connect: () => void;
  disconnect: () => void;
};

let chatSocket: Socket | null = null;

export function getChatSocket(): Socket {
  if (chatSocket && chatSocket.connected) return chatSocket;
  if (!chatSocket) {
    chatSocket = io(`${WS_ORIGIN}/ws`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { token: getAccessToken() },
    });
    bindAuthRecovery(chatSocket);
  }
  return chatSocket;
}

// Khi server từ chối vì token hết hạn/không hợp lệ → refresh token rồi nối lại (một lần).
function bindAuthRecovery(s: Socket) {
  let recovering = false;
  const tryRecover = async (reason: unknown) => {
    const msg = String(
      (reason as any)?.message ?? (reason as any)?.code ?? reason ?? ""
    ).toLowerCase();
    const isAuth = msg.includes("unauthorized") || msg.includes("invalid token") || msg.includes("token") || msg.includes("jwt");
    if (!isAuth || recovering) return;
    recovering = true;
    try {
      const tok = await getValidAccessToken(0); // ép kiểm tra/refresh ngay
      if (tok) {
        (s.auth as Record<string, unknown>) = { token: tok };
        s.disconnect();
        s.connect();
      }
    } finally {
      // cho phép thử lại ở lần lỗi sau (sau một nhịp).
      setTimeout(() => { recovering = false; }, 1500);
    }
  };
  s.on("connect_error", (err) => { void tryRecover(err); });
  s.on("error", (err) => { void tryRecover(err); });
}

export function connectChat(): Socket {
  const s = getChatSocket();
  // Cập nhật token hiện có (đồng bộ) rồi nối ngay.
  (s.auth as Record<string, unknown>) = { token: getAccessToken() };
  if (!s.connected) s.connect();
  // Đảm bảo token còn hạn: nếu sắp/đã hết hạn → refresh rồi nối lại bằng token mới.
  void ensureFreshSocketToken(s);
  return s;
}

/** Refresh access token nếu cần và gắn lại vào socket; nối lại nếu token đổi. */
async function ensureFreshSocketToken(s: Socket): Promise<void> {
  try {
    const tok = await getValidAccessToken();
    const current = (s.auth as Record<string, unknown> | undefined)?.token as string | undefined;
    if (tok && tok !== current) {
      (s.auth as Record<string, unknown>) = { token: tok };
      s.disconnect();
      s.connect();
    }
  } catch {
    /* ignore */
  }
}

export function disconnectChat() {
  if (chatSocket) {
    chatSocket.removeAllListeners();
    chatSocket.disconnect();
    chatSocket = null;
  }
}

export function onChat<E extends keyof ChatEventMap>(event: E, cb: ChatEventMap[E]): () => void {
  const s = getChatSocket();
  s.on(event as string, cb as (...args: any[]) => void);
  return () => s.off(event as string, cb as (...args: any[]) => void);
}

export const chat = {
  joinChannel: (channelId: string) => getChatSocket().emit("channel:join", { channelId }),
  leaveChannel: (channelId: string) => getChatSocket().emit("channel:leave", { channelId }),
  sendMessage: (payload: { channelId: string; content: string; attachments?: any[]; replyToId?: string }) =>
    getChatSocket().emit("message:send", payload),
  editMessage: (messageId: string, content: string) =>
    getChatSocket().emit("message:edit", { messageId, content }),
  deleteMessage: (messageId: string) => getChatSocket().emit("message:delete", { messageId }),
  typingStart: (channelId: string) => getChatSocket().emit("typing:start", { channelId }),
  typingStop: (channelId: string) => getChatSocket().emit("typing:stop", { channelId }),
  updatePresence: (status: PresenceStatus) => getChatSocket().emit("presence:update", { status }),
};

// ── Voice namespace (/ws-voice) — LiveKit control plane (KHÔNG còn mesh) ────────
export interface LivekitCreds {
  url: string;
  token: string;
  room: string;
  identity: string;
}
export interface VoiceJoinAck {
  channelId: string;
  livekit: LivekitCreds;
  peers: VoiceMember[];
}
export interface VoiceStateChanged {
  userId: string;
  muted?: boolean;
  deafened?: boolean;
  speaking?: boolean;
  streaming?: boolean;
}
export interface StreamEvent {
  channelId: string;
  userId: string;
  user?: VoiceMember;
  source?: "screen" | "camera";
}

type VoiceEventMap = {
  "voice:peers": (e: { channelId: string; peers: VoiceMember[] }) => void;
  "voice:user-joined": (e: { channelId: string; user: VoiceMember }) => void;
  "voice:user-left": (e: { channelId: string; userId: string }) => void;
  "voice:state-changed": (e: VoiceStateChanged) => void;
  "voice:token": (e: { channelId: string; livekit: LivekitCreds }) => void;
  "stream:started": (e: StreamEvent) => void;
  "stream:stopped": (e: StreamEvent) => void;
  "voice:channel-closed": (e: { channelId: string }) => void;
  error: (e: { code: string; message: string }) => void;
  connect: () => void;
  disconnect: () => void;
};

let voiceSocket: Socket | null = null;

export function getVoiceSocket(): Socket {
  if (!voiceSocket) {
    voiceSocket = io(`${WS_ORIGIN}/ws-voice`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { token: getAccessToken() },
    });
    bindAuthRecovery(voiceSocket);
  }
  return voiceSocket;
}

export function connectVoice(): Socket {
  const s = getVoiceSocket();
  (s.auth as Record<string, unknown>) = { token: getAccessToken() };
  if (!s.connected) s.connect();
  void ensureFreshSocketToken(s);
  return s;
}

export function disconnectVoice() {
  if (voiceSocket) {
    voiceSocket.removeAllListeners();
    voiceSocket.disconnect();
    voiceSocket = null;
  }
}

export function onVoice<E extends keyof VoiceEventMap>(event: E, cb: VoiceEventMap[E]): () => void {
  const s = getVoiceSocket();
  s.on(event as string, cb as (...args: any[]) => void);
  return () => s.off(event as string, cb as (...args: any[]) => void);
}

export const voice = {
  // Báo backend vào phòng; nhận lại { channelId, livekit, peers } qua ack.
  join: (channelId: string): Promise<VoiceJoinAck> =>
    new Promise((resolve, reject) => {
      const s = getVoiceSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian chờ máy chủ thoại.")), 12000);
      s.emit("voice:join", { channelId }, (resp: any) => {
        clearTimeout(timer);
        if (resp && resp.error) { reject(new Error(resp.error?.message || resp.error || "Vào phòng thoại thất bại.")); return; }
        if (!resp || !resp.livekit) { reject(new Error("Máy chủ thoại không trả về thông tin LiveKit.")); return; }
        resolve(resp as VoiceJoinAck);
      });
    }),
  leave: (channelId: string) => getVoiceSocket().emit("voice:leave", { channelId }),
  // Xin lại token LiveKit nếu hết hạn.
  requestToken: (channelId: string): Promise<LivekitCreds> =>
    new Promise((resolve, reject) => {
      const s = getVoiceSocket();
      const timer = setTimeout(() => reject(new Error("Hết thời gian chờ token thoại.")), 12000);
      s.emit("voice:token", { channelId }, (resp: any) => {
        clearTimeout(timer);
        const creds = resp?.livekit ?? resp;
        if (creds?.url && creds?.token) resolve(creds as LivekitCreds);
        else reject(new Error("Không lấy được token thoại."));
      });
    }),
  state: (state: { muted?: boolean; deafened?: boolean; speaking?: boolean }) =>
    getVoiceSocket().emit("voice:state", state),
  streamStart: (source: "screen" | "camera") => getVoiceSocket().emit("stream:start", { source }),
  streamStop: () => getVoiceSocket().emit("stream:stop", {}),
};
