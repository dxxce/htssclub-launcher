"use client";

// ───────────────────────────────────────────────────────────────────────────
// HTSS Community API client
// Backend: NestJS realtime API tại http://localhost:3366/api (HTTP).
// Response chuẩn: { success, data?, error? }.
// Auth: Bearer access token (header). Refresh token trả về trong body
//       (register/login/refresh); lưu localStorage, gửi qua body khi refresh.
// ───────────────────────────────────────────────────────────────────────────

export const API_BASE = "https://appapi.htss.club/api";

const ACCESS_TOKEN_KEY = "htss_community_access_token";
const REFRESH_TOKEN_KEY = "htss_community_refresh_token";

// ── enums / kiểu dữ liệu khớp với backend ────────────────────────────────────
export type AccountStatus = "ACTIVE" | "BANNED" | "SUSPENDED" | "PENDING";
export type PresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";
export type ChannelType = "TEXT" | "VOICE";
export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export interface CommunityUser {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  balance: number;
  status: AccountStatus;
  presence: PresenceStatus;
  lastSeenAt?: string;
  createdAt?: string;
}

export interface AuthResult {
  accessToken: string;
  user: CommunityUser;
}

export interface ServerSummary {
  id: string;
  name: string;
  iconUrl?: string;
  ownerId: string;
  inviteCode?: string;
  role?: MemberRole;
  isDefault?: boolean;
  createdAt?: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  topic?: string;
  position: number;
  userLimit?: number;
  voiceMembers?: VoiceMember[]; // chỉ cho kênh VOICE: ai đang trong phòng (kèm khi GET channels)
}

export interface ServerMember {
  id: string;
  userId: string;
  serverId: string;
  role: MemberRole;
  nickname?: string;
  user?: CommunityUser;
  joinedAt?: string;
}

export interface ServerBan {
  id: string;
  userId: string;
  serverId: string;
  reason?: string;
  bannedBy?: string;
  user?: CommunityUser;
  createdAt?: string;
}

export interface ServerDetail extends ServerSummary {
  channels: Channel[];
  members: ServerMember[];
}

export interface Attachment {
  url: string;
  type: string;
  name: string;
  size: number;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
  me: boolean;
}

export interface ReplyPreview {
  id: string;
  authorId: string;
  author?: CommunityUser;
  content: string;
  hasAttachments?: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  author?: CommunityUser;
  content: string;
  attachments?: Attachment[];
  replyToId?: string;
  replyTo?: ReplyPreview | null;
  reactions?: MessageReaction[];
  editedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FriendEntry {
  id: string;
  state: "PENDING" | "ACCEPTED" | "BLOCKED";
  requesterId: string;
  addresseeId: string;
  user?: CommunityUser;
  createdAt?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: "TOPUP" | "SPEND" | "REWARD" | "REFUND" | "TRANSFER";
  amount: number;
  balanceAfter: number;
  reason?: string;
  refId?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, any>;
  readAt?: string;
  createdAt: string;
}

export interface VoiceMember {
  userId: string;
  user?: CommunityUser;
  muted?: boolean;
  deafened?: boolean;
  speaking?: boolean;
  streaming?: boolean; // đang chia sẻ màn hình / camera
}

// ── token helpers (lưu access token ở localStorage) ──────────────────────────
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    else window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// Refresh token: backend trả về trong response body (register/login/refresh) và
// /auth/refresh nhận token qua cookie HOẶC body. Launcher lưu vào localStorage và
// gửi qua body để giữ đăng nhập giữa các lần mở app.
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
    else window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Lưu cả access + refresh token (nếu có) từ kết quả auth. */
function persistTokens(data: any) {
  const access = data?.accessToken ?? data?.access_token ?? data?.token;
  const refresh = data?.refreshToken ?? data?.refresh_token;
  if (access) setAccessToken(access);
  if (refresh) setRefreshToken(refresh);
}

export function clearTokens() {
  setAccessToken(null);
  setRefreshToken(null);
}

// ── chuẩn hoá dữ liệu từ backend (map _id → id) ──────────────────────────────
export function normId(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.id ?? v._id ?? (typeof v.toString === "function" ? v.toString() : "");
  return String(v);
}

export function normalizeUser(u: any): CommunityUser | undefined {
  if (!u || typeof u !== "object") return undefined;
  return {
    id: normId(u.id ?? u._id),
    username: u.username ?? "",
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    balance: typeof u.balance === "number" ? u.balance : 0,
    status: u.status ?? "ACTIVE",
    presence: u.presence ?? "OFFLINE",
    lastSeenAt: u.lastSeenAt,
    createdAt: u.createdAt,
  };
}

export function normalizeReplyPreview(r: any): ReplyPreview | null | undefined {
  if (r === null) return null;
  if (!r || typeof r !== "object") return undefined;
  return {
    id: normId(r.id ?? r._id),
    authorId: normId(r.authorId ?? r.author),
    author: normalizeUser(r.author),
    content: r.content ?? "",
    hasAttachments: !!r.hasAttachments,
  };
}

export function normalizeReaction(x: any): MessageReaction {
  return {
    emoji: String(x?.emoji ?? ""),
    count: typeof x?.count === "number" ? x.count : Array.isArray(x?.userIds) ? x.userIds.length : 0,
    userIds: Array.isArray(x?.userIds) ? x.userIds.map((u: any) => normId(u)) : [],
    me: !!x?.me,
  };
}

export function normalizeMessage(m: any): Message {
  return {
    id: normId(m?.id ?? m?._id),
    channelId: normId(m?.channelId ?? m?.channel),
    authorId: normId(m?.authorId ?? m?.author),
    author: normalizeUser(m?.author),
    content: m?.content ?? "",
    attachments: Array.isArray(m?.attachments) ? m.attachments : undefined,
    replyToId: m?.replyToId ? normId(m.replyToId) : undefined,
    replyTo: normalizeReplyPreview(m?.replyTo),
    reactions: Array.isArray(m?.reactions) ? m.reactions.map(normalizeReaction).filter((r: MessageReaction) => r.emoji) : undefined,
    editedAt: m?.editedAt,
    createdAt: m?.createdAt ?? new Date().toISOString(),
    updatedAt: m?.updatedAt,
  };
}

export function normalizeMember(m: any): any {
  return {
    id: normId(m?.id ?? m?._id ?? m?.userId ?? m?.user),
    userId: normId(m?.userId ?? m?.user),
    serverId: normId(m?.serverId ?? m?.server),
    role: m?.role ?? "MEMBER",
    nickname: m?.nickname ?? undefined,
    user: normalizeUser(m?.user),
    joinedAt: m?.joinedAt,
  };
}

export function normalizeVoiceMember(m: any): VoiceMember {
  return {
    userId: normId(m?.userId ?? m?.user ?? m?.id ?? m?._id),
    user: normalizeUser(m?.user ?? (m && typeof m === "object" && (m.username || m.displayName) ? m : undefined)),
    muted: typeof m?.muted === "boolean" ? m.muted : undefined,
    deafened: typeof m?.deafened === "boolean" ? m.deafened : undefined,
    speaking: typeof m?.speaking === "boolean" ? m.speaking : undefined,
    streaming: typeof m?.streaming === "boolean" ? m.streaming : undefined,
  };
}

export function normalizeBan(b: any): any {
  return {
    id: normId(b?.id ?? b?._id ?? b?.userId ?? b?.user),
    userId: normId(b?.userId ?? b?.user),
    serverId: normId(b?.serverId ?? b?.server),
    reason: b?.reason,
    bannedBy: b?.bannedBy ? normId(b.bannedBy) : undefined,
    user: normalizeUser(b?.user),
    createdAt: b?.createdAt,
  };
}

export function normalizeFriend(f: any): FriendEntry {
  return {
    id: normId(f?.id ?? f?._id),
    state: (f?.state ?? f?.status ?? "PENDING") as FriendEntry["state"],
    requesterId: normId(f?.requesterId ?? f?.requester),
    addresseeId: normId(f?.addresseeId ?? f?.addressee),
    user: normalizeUser(f?.user ?? f?.friend ?? f?.otherUser),
    createdAt: f?.createdAt,
  };
}

/** Bóc danh sách từ nhiều dạng response: mảng thẳng, {items}, {data}. */
export function extractList<T = any>(raw: any): T[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.messages)) return raw.messages;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

export function normalizeServer(s: any): ServerSummary {
  return {
    id: normId(s?.id ?? s?._id),
    name: s?.name ?? "Server",
    iconUrl: s?.iconUrl,
    ownerId: normId(s?.ownerId ?? s?.owner),
    inviteCode: s?.inviteCode,
    role: s?.role,
    isDefault: !!(s?.isDefault ?? s?.default),
    createdAt: s?.createdAt,
  };
}

export function normalizeChannel(c: any): Channel {
  const rawType = String(c?.type ?? "TEXT").toUpperCase();
  const type: ChannelType = rawType === "VOICE" ? "VOICE" : "TEXT";
  const vm = c?.voiceMembers ?? c?.voice_members;
  return {
    id: normId(c?.id ?? c?._id),
    serverId: normId(c?.serverId ?? c?.server),
    name: c?.name ?? "kênh",
    type,
    topic: c?.topic,
    position: typeof c?.position === "number" ? c.position : 0,
    userLimit: c?.userLimit,
    voiceMembers: Array.isArray(vm) ? vm.map(normalizeVoiceMember) : undefined,
  };
}

// ── lỗi API ──────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  code: string;
  httpStatus: number;
  constructor(message: string, code = "UNKNOWN", httpStatus = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

let refreshing: Promise<string | null> | null = null;

async function rawRequest<T>(
  path: string,
  init: RequestInit,
  retryOn401 = true
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Không tự set Content-Type khi gửi FormData (browser tự thêm boundary).
  const isForm = init.body instanceof FormData;
  if (!isForm && init.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch (err: any) {
    throw new ApiError(
      "Không kết nối được máy chủ cộng đồng. Hãy chắc chắn backend đang chạy.",
      "NETWORK",
      0
    );
  }

  // 401 → thử refresh token một lần rồi gọi lại.
  if (res.status === 401 && retryOn401 && path !== "/auth/refresh") {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return rawRequest<T>(path, init, false);
    }
  }

  let body: ApiEnvelope<T> | null = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      body = null;
    }
  }

  if (!res.ok || (body && body.success === false)) {
    const code = body?.error?.code || String(res.status);
    const message =
      body?.error?.message ||
      (res.status === 401
        ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : `Yêu cầu thất bại (${res.status}).`);
    throw new ApiError(message, code, res.status);
  }

  // Một số endpoint trả thẳng object, số khác bọc trong { data }.
  if (body && "success" in body) {
    return (body.data as T) ?? (undefined as unknown as T);
  }
  return (body as unknown as T) ?? (undefined as unknown as T);
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      // Backend nhận refresh token từ cookie HOẶC body — ưu tiên cookie nếu có,
      // nhưng launcher khó dùng cookie httpOnly nên gửi kèm refresh token trong body.
      const storedRefresh = getRefreshToken();
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(storedRefresh ? { refreshToken: storedRefresh } : {}),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const raw = await res.json().catch(() => null);
      const data = raw && "data" in raw ? raw.data : raw;
      const newToken = data?.accessToken ?? data?.access_token ?? data?.token ?? null;
      if (newToken) {
        persistTokens(data); // lưu cả accessToken + refreshToken mới (xoay vòng)
        return newToken as string;
      }
      clearTokens();
      return null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// Giải mã payload JWT (không xác thực chữ ký) để đọc thời điểm hết hạn `exp`.
function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return typeof payload?.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Trả về access token còn hạn cho kết nối WebSocket.
 * Nếu token đã hết hạn (hoặc còn dưới `skewSec` giây) thì refresh trước khi trả về.
 * Dùng cho socket vì socket không tự retry-on-401 như REST.
 */
export async function getValidAccessToken(skewSec = 30): Promise<string | null> {
  const token = getAccessToken();
  if (!token) {
    // Không còn access token nhưng có thể còn refresh token.
    return getRefreshToken() ? await refreshAccessToken() : null;
  }
  const exp = decodeJwtExp(token);
  if (exp != null) {
    const now = Math.floor(Date.now() / 1000);
    if (exp - now <= skewSec) {
      const fresh = await refreshAccessToken();
      return fresh ?? getAccessToken();
    }
  }
  return token;
}

function get<T>(path: string) {
  return rawRequest<T>(path, { method: "GET" });
}
function post<T>(path: string, body?: unknown) {
  return rawRequest<T>(path, {
    method: "POST",
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
function patch<T>(path: string, body?: unknown) {
  return rawRequest<T>(path, {
    method: "PATCH",
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
function del<T>(path: string, body?: unknown) {
  return rawRequest<T>(path, {
    method: "DELETE",
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  async register(input: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResult> {
    const data = await post<any>("/auth/register", input);
    persistTokens(data);
    return { accessToken: getAccessToken() || "", user: normalizeUser(data?.user) as CommunityUser };
  },
  async login(identifier: string, password: string): Promise<AuthResult> {
    const data = await post<any>("/auth/login", { identifier, password });
    persistTokens(data);
    return { accessToken: getAccessToken() || "", user: normalizeUser(data?.user) as CommunityUser };
  },
  async me(): Promise<CommunityUser> {
    const data = await get<any>("/auth/me");
    // /auth/me có thể trả user thẳng hoặc bọc trong { user }.
    return normalizeUser(data?.user ?? data) as CommunityUser;
  },
  async logout(): Promise<void> {
    try {
      // Gửi refresh token để backend thu hồi đúng session (cookie hoặc body).
      const storedRefresh = getRefreshToken();
      await post("/auth/logout", storedRefresh ? { refreshToken: storedRefresh } : {});
    } finally {
      clearTokens();
    }
  },
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await post("/auth/change-password", { oldPassword, newPassword });
  },
};

// ── Users / Presence ──────────────────────────────────────────────────────────
export const usersApi = {
  search(q: string) {
    return get<any>(`/users/search?q=${encodeURIComponent(q)}`).then(
      (raw) => extractList(raw).map(normalizeUser).filter(Boolean) as CommunityUser[]
    );
  },
  getById(id: string) {
    return get<any>(`/users/${id}`).then((d) => normalizeUser(d?.user ?? d) as CommunityUser);
  },
  updateProfile(input: { displayName?: string; avatarUrl?: string }) {
    return patch<any>("/users/me", input).then((d) => normalizeUser(d?.user ?? d) as CommunityUser);
  },
  updatePresence(status: PresenceStatus) {
    return patch<CommunityUser>("/users/me/presence", { status });
  },
};

// ── Wallet ─────────────────────────────────────────────────────────────────────
export const walletApi = {
  balance() {
    return get<{ balance: number }>("/wallet/balance");
  },
  transactions() {
    return get<any>("/wallet/transactions").then((raw) =>
      extractList(raw).map((t: any) => ({
        id: normId(t?.id ?? t?._id),
        userId: normId(t?.userId ?? t?.user),
        type: t?.type ?? "SPEND",
        amount: typeof t?.amount === "number" ? t.amount : Number(t?.amount) || 0,
        balanceAfter: typeof t?.balanceAfter === "number" ? t.balanceAfter : Number(t?.balanceAfter) || 0,
        reason: t?.reason,
        refId: t?.refId,
        createdAt: t?.createdAt ?? new Date().toISOString(),
      })) as Transaction[]
    );
  },
  topup(amount: number, method: string) {
    return post<Transaction>("/wallet/topup", { amount, method });
  },
  spend(amount: number, reason: string, refId?: string) {
    return post<Transaction>("/wallet/spend", { amount, reason, refId });
  },
  transfer(toUserId: string, amount: number, note?: string) {
    return post<Transaction>("/wallet/transfer", { toUserId, amount, note });
  },
};

// ── Friends ─────────────────────────────────────────────────────────────────────
export const friendsApi = {
  list() {
    return get<any>("/friends").then((raw) => extractList(raw).map(normalizeFriend) as FriendEntry[]);
  },
  requests() {
    return get<any>("/friends/requests").then((raw) => extractList(raw).map(normalizeFriend) as FriendEntry[]);
  },
  request(userId: string) {
    return post("/friends/request", { userId });
  },
  accept(requestId: string) {
    return post("/friends/accept", { requestId });
  },
  decline(requestId: string) {
    return post("/friends/decline", { requestId });
  },
  remove(userId: string) {
    return del(`/friends/${userId}`);
  },
  block(userId: string) {
    return post("/friends/block", { userId });
  },
  unblock(userId: string) {
    return del(`/friends/block/${userId}`);
  },
};

// ── Servers & Channels ──────────────────────────────────────────────────────────
export const serversApi = {
  list() {
    return get<any>("/servers").then((raw) => extractList(raw).map(normalizeServer) as ServerSummary[]);
  },
  detail(id: string) {
    return get<any>(`/servers/${id}`).then((raw) => {
      const d = raw && "data" in raw && !raw.id && !raw._id ? raw.data : raw;
      const channels = Array.isArray(d?.channels) ? d.channels : [];
      const members = Array.isArray(d?.members) ? d.members.map(normalizeMember) : [];
      return {
        ...d,
        id: normId(d?.id ?? d?._id),
        ownerId: normId(d?.ownerId ?? d?.owner),
        isDefault: !!(d?.isDefault ?? d?.default),
        channels,
        members,
      } as ServerDetail;
    });
  },
  create(name: string, iconUrl?: string) {
    return post<any>("/servers", { name, iconUrl }).then(normalizeServer);
  },
  update(id: string, input: { name?: string; iconUrl?: string }) {
    return patch<any>(`/servers/${id}`, input).then(normalizeServer);
  },
  remove(id: string) {
    return del(`/servers/${id}`);
  },
  join(inviteCode: string) {
    return post<any>("/servers/join", { inviteCode }).then(normalizeServer);
  },
  invite(id: string) {
    return post<{ inviteCode: string }>(`/servers/${id}/invite`);
  },
  leave(id: string) {
    return del(`/servers/${id}/leave`);
  },
  members(id: string) {
    return get<any>(`/servers/${id}/members`).then((raw) => extractList(raw).map(normalizeMember) as ServerMember[]);
  },
  channels(serverId: string) {
    return get<any>(`/servers/${serverId}/channels`).then((raw) => extractList(raw).map(normalizeChannel) as Channel[]);
  },
  createChannel(
    serverId: string,
    input: { name: string; type: ChannelType; topic?: string; userLimit?: number }
  ) {
    return post<any>(`/servers/${serverId}/channels`, input).then(normalizeChannel);
  },
  // Sắp xếp lại kênh (ADMIN+): gửi danh sách { channelId, position }.
  reorderChannels(serverId: string, items: { channelId: string; position: number }[]) {
    return patch(`/servers/${serverId}/channels/reorder`, { items });
  },

  // ── Quản trị thành viên ──
  updateRole(serverId: string, userId: string, role: "ADMIN" | "MEMBER") {
    return patch(`/servers/${serverId}/members/${userId}/role`, { role });
  },
  kick(serverId: string, userId: string) {
    return del(`/servers/${serverId}/members/${userId}`);
  },
  // Đặt nickname cho 1 thành viên (bản thân hoặc ADMIN+ cho người khác).
  setNickname(serverId: string, userId: string, nickname: string) {
    return patch(`/servers/${serverId}/members/${userId}/nickname`, { nickname });
  },

  // ── Quản trị server nâng cao ──
  transferOwnership(serverId: string, userId: string) {
    return post(`/servers/${serverId}/transfer-ownership`, { userId });
  },
  banMember(serverId: string, userId: string, reason?: string) {
    return post(`/servers/${serverId}/members/${userId}/ban`, { reason });
  },
  unban(serverId: string, userId: string) {
    return del(`/servers/${serverId}/bans/${userId}`);
  },
  bans(serverId: string) {
    return get<any>(`/servers/${serverId}/bans`).then((raw) => extractList(raw).map(normalizeBan) as ServerBan[]);
  },
  announce(serverId: string, message: string) {
    return post(`/servers/${serverId}/announce`, { message });
  },
  revokeInvite(serverId: string) {
    return del(`/servers/${serverId}/invite`);
  },
};
// ── Channels & Messages ─────────────────────────────────────────────────────────
export const channelsApi = {
  update(channelId: string, input: { name?: string; topic?: string; position?: number; userLimit?: number }) {
    return patch<any>(`/channels/${channelId}`, input).then(normalizeChannel);
  },
  remove(channelId: string) {
    return del(`/channels/${channelId}`);
  },
  voiceMembers(channelId: string) {
    return get<any>(`/channels/${channelId}/voice-members`).then((raw) =>
      extractList(raw).map(normalizeVoiceMember) as VoiceMember[]
    );
  },
  messages(channelId: string, opts?: { before?: string; limit?: number }): Promise<Message[]> {
    const qs = new URLSearchParams();
    if (opts?.before) qs.set("before", opts.before);
    if (opts?.limit) qs.set("limit", String(opts.limit));
    const q = qs.toString() ? `?${qs.toString()}` : "";
    return get<any>(`/channels/${channelId}/messages${q}`).then((raw) =>
      extractList(raw).map(normalizeMessage)
    );
  },
  sendMessage(channelId: string, input: { content: string; attachments?: Attachment[]; replyToId?: string }): Promise<Message> {
    return post<any>(`/channels/${channelId}/messages`, input).then(normalizeMessage);
  },
  editMessage(channelId: string, messageId: string, content: string): Promise<Message> {
    return patch<any>(`/channels/${channelId}/messages/${messageId}`, { content }).then(normalizeMessage);
  },
  deleteMessage(channelId: string, messageId: string) {
    return del(`/channels/${channelId}/messages/${messageId}`);
  },
  // ── Reaction (thả cảm xúc) ──
  addReaction(channelId: string, messageId: string, emoji: string) {
    return post(`/channels/${channelId}/messages/${messageId}/reactions`, { emoji });
  },
  removeReaction(channelId: string, messageId: string, emoji: string) {
    return del(`/channels/${channelId}/messages/${messageId}/reactions`, { emoji });
  },
};

// ── Voice / SFU (LiveKit) ─────────────────────────────────────────────────────
export interface VoiceConfig {
  // "sfu" nếu backend bật LiveKit, ngược lại dùng mesh P2P.
  mode: "mesh" | "sfu";
  url?: string; // wss://... (chỉ khi sfu)
}

export interface LivekitToken {
  url: string;
  token: string;
}

export const voiceApi = {
  // Hỏi backend xem kênh dùng chế độ nào. Nếu endpoint không tồn tại → mesh.
  // Nếu có cấu hình LiveKit dev ở localStorage → ép chế độ "sfu" để test.
  async config(): Promise<VoiceConfig> {
    if (typeof window !== "undefined") {
      try {
        const { getLivekitDevConfig } = await import("./voice/livekitDevToken");
        const dev = getLivekitDevConfig();
        if (dev) return { mode: "sfu", url: dev.url };
      } catch {
        /* ignore */
      }
    }
    try {
      const data = await get<any>("/voice/config");
      const mode = data?.mode === "sfu" ? "sfu" : "mesh";
      return { mode, url: data?.url };
    } catch {
      return { mode: "mesh" };
    }
  },
  // Lấy token LiveKit cho 1 kênh voice (chế độ SFU).
  async livekitToken(channelId: string): Promise<LivekitToken> {
    // Test cục bộ: ký token ngay ở client bằng cấu hình dev (devkey/secret).
    if (typeof window !== "undefined") {
      try {
        const { getLivekitDevConfig, signLivekitDevToken } = await import("./voice/livekitDevToken");
        const dev = getLivekitDevConfig();
        if (dev) {
          const me = await authApi.me().catch(() => null);
          const identity = me?.id || `guest-${Math.random().toString(36).slice(2, 8)}`;
          const token = await signLivekitDevToken(dev, {
            identity,
            room: channelId,
            name: me?.displayName || me?.username,
            metadata: JSON.stringify({
              displayName: me?.displayName,
              username: me?.username,
              avatarUrl: me?.avatarUrl,
            }),
          });
          return { url: dev.url, token };
        }
      } catch {
        /* rơi xuống dùng backend */
      }
    }
    // thử vài đường dẫn phổ biến để linh hoạt với backend
    const data = await get<any>(`/channels/${channelId}/voice-token`);
    const url = data?.url ?? data?.wsUrl ?? data?.serverUrl;
    const token = data?.token ?? data?.accessToken;
    if (!url || !token) throw new ApiError("Backend chưa cấu hình LiveKit cho kênh này.", "NO_LIVEKIT");
    return { url, token };
  },
};

// ── Notifications ───────────────────────────────────────────────────────────────
export const notificationsApi = {
  list() {
    return get<NotificationItem[]>("/notifications");
  },
  unreadCount() {
    return get<{ count: number }>("/notifications/unread-count");
  },
  read(id: string) {
    return patch(`/notifications/${id}/read`);
  },
  readAll() {
    return patch("/notifications/read-all");
  },
};

// ── Uploads ──────────────────────────────────────────────────────────────────────
export const uploadsApi = {
  async avatar(file: File | Blob, filename = "avatar.png"): Promise<{ url: string }> {
    const form = new FormData();
    form.append("file", file, filename);
    const data = await rawRequest<any>("/uploads/avatar", { method: "POST", body: form });
    // backend có thể trả { url } hoặc { data: { url } } hoặc thẳng string
    const url = typeof data === "string" ? data : data?.url ?? data?.data?.url ?? data?.path;
    if (!url) throw new ApiError("Tải ảnh thất bại (không nhận được URL).", "UPLOAD");
    return { url };
  },
  async attachment(file: File): Promise<Attachment> {
    const form = new FormData();
    form.append("file", file);
    return rawRequest<Attachment>("/uploads/attachment", { method: "POST", body: form });
  },
};
