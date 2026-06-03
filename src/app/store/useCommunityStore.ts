"use client";

import { create } from "zustand";
import {
  authApi,
  serversApi,
  channelsApi,
  usersApi,
  uploadsApi,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  normalizeMessage,
  normalizeChannel,
  normalizeVoiceMember,
  type CommunityUser,
  type ServerSummary,
  type ServerDetail,
  type Channel,
  type Message,
  type PresenceStatus,
  type VoiceMember,
} from "../lib/communityApi";
import {
  connectChat,
  disconnectChat,
  onChat,
  chat,
} from "../lib/communitySocket";

interface CommunityState {
  // auth
  user: CommunityUser | null;
  authChecked: boolean;
  authLoading: boolean;
  authModalOpen: boolean;

  // data
  servers: ServerSummary[];
  activeServerId: string | null;
  activeServer: ServerDetail | null;
  channels: Channel[];
  activeChannelId: string | null;
  messages: Record<string, Message[]>; // theo channelId
  typingByChannel: Record<string, string[]>; // userId đang gõ
  presenceMap: Record<string, PresenceStatus>; // userId → trạng thái hiện diện
  unreadByChannel: Record<string, number>; // số tin chưa đọc theo kênh (không phải kênh đang mở)
  voiceOccupancy: Record<string, VoiceMember[]>; // channelId → ai đang trong kênh thoại
  loadingServers: boolean;
  loadingMessages: boolean;
  socketConnected: boolean;

  // ── actions: auth ──
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: { username: string; email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setPresence: (status: PresenceStatus) => Promise<void>;
  updateProfile: (input: { displayName?: string; avatarUrl?: string }) => Promise<void>;
  uploadAvatar: (file: Blob, filename?: string) => Promise<string>;
  openAuthModal: () => void;
  closeAuthModal: () => void;

  // ── actions: servers/channels ──
  loadServers: () => Promise<void>;
  selectServer: (serverId: string) => Promise<void>;
  reorderServers: (sourceId: string, targetId: string) => void;
  createServer: (name: string) => Promise<void>;
  joinServer: (inviteCode: string) => Promise<void>;
  createChannel: (name: string, type: "TEXT" | "VOICE", topic?: string, userLimit?: number) => Promise<void>;
  updateChannel: (channelId: string, input: { name?: string; topic?: string; userLimit?: number }) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  reorderChannels: (sourceId: string, targetId: string) => Promise<void>;

  // ── actions: messages ──
  selectChannel: (channelId: string) => Promise<void>;
  loadMessages: (channelId: string) => Promise<void>;
  sendMessage: (content: string, attachments?: import("../lib/communityApi").Attachment[], replyToId?: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markChannelRead: (channelId: string) => void;
  toggleReaction: (messageId: string, emoji: string) => void;

  // ── actions: voice occupancy (ai đang trong kênh thoại) ──
  loadVoiceOccupancy: (serverId: string, channels: Channel[]) => Promise<void>;

  // ── socket lifecycle ──
  initSocket: () => void;
  teardownSocket: () => void;

  // helper nội bộ
  _appendMessage: (m: Message) => void;
  _applyReaction: (channelId: string, messageId: string, emoji: string, userId: string, add: boolean) => void;
  _upsertChannel: (c: Channel) => void;
  _removeChannel: (channelId: string) => void;
  _setChannels: (serverId: string, channels: Channel[]) => void;
}

let socketBound = false;

// ── lưu thứ tự server + server đang active vào localStorage ──────────────────
const SERVER_ORDER_KEY = "htss_community_server_order";
const ACTIVE_SERVER_KEY = "htss_community_active_server";

function loadServerOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SERVER_ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveServerOrder(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SERVER_ORDER_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}
function loadActiveServer(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_SERVER_KEY);
  } catch {
    return null;
  }
}
function saveActiveServer(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_SERVER_KEY, id);
    else window.localStorage.removeItem(ACTIVE_SERVER_KEY);
  } catch {
    /* ignore */
  }
}

/** Sắp xếp server theo thứ tự đã lưu; server mới (chưa có trong order) xếp cuối. */
function applySavedOrder(servers: ServerSummary[]): ServerSummary[] {
  const order = loadServerOrder();
  if (order.length === 0) return servers;
  const rank = new Map(order.map((id, i) => [id, i]));
  return servers
    .slice()
    .sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
}

export const useCommunityStore = create<CommunityState>((set, get) => ({
  user: null,
  authChecked: false,
  authLoading: false,
  authModalOpen: false,
  servers: [],
  activeServerId: null,
  activeServer: null,
  channels: [],
  activeChannelId: null,
  messages: {},
  typingByChannel: {},
  presenceMap: {},
  unreadByChannel: {},
  voiceOccupancy: {},
  loadingServers: false,
  loadingMessages: false,
  socketConnected: false,

  bootstrap: async () => {
    if (get().authChecked) return;
    const token = getAccessToken();
    const refresh = getRefreshToken();
    // Không có cả access lẫn refresh token → coi như chưa đăng nhập.
    if (!token && !refresh) {
      set({ authChecked: true });
      return;
    }
    set({ authLoading: true });
    try {
      // authApi.me() tự refresh access token (qua rawRequest) nếu hết hạn.
      const user = await authApi.me();
      set({ user });
      get().initSocket();
      await get().loadServers();
    } catch {
      clearTokens();
      set({ user: null });
    } finally {
      set({ authChecked: true, authLoading: false });
    }
  },

  login: async (identifier, password) => {
    const res = await authApi.login(identifier, password);
    set({ user: res.user, authModalOpen: false });
    get().initSocket();
    await get().loadServers();
  },

  register: async (input) => {
    const res = await authApi.register(input);
    set({ user: res.user, authModalOpen: false });
    get().initSocket();
    await get().loadServers();
  },

  openAuthModal: () => set({ authModalOpen: true }),
  closeAuthModal: () => set({ authModalOpen: false }),

  logout: async () => {
    get().teardownSocket();
    await authApi.logout();
    set({
      user: null,
      servers: [],
      activeServerId: null,
      activeServer: null,
      channels: [],
      activeChannelId: null,
      messages: {},
      typingByChannel: {},
      presenceMap: {},
      unreadByChannel: {},
      voiceOccupancy: {},
    });
  },

  refreshMe: async () => {
    try {
      const user = await authApi.me();
      set({ user });
    } catch {
      /* ignore */
    }
  },

  setPresence: async (status) => {
    await usersApi.updatePresence(status);
    set((s) => ({
      user: s.user ? { ...s.user, presence: status } : s.user,
      presenceMap: s.user ? { ...s.presenceMap, [s.user.id]: status } : s.presenceMap,
    }));
    if (get().socketConnected) chat.updatePresence(status);
  },

  updateProfile: async (input) => {
    const updated = await usersApi.updateProfile(input);
    set((s) => ({
      user: s.user
        ? {
            ...s.user,
            displayName: updated?.displayName ?? input.displayName ?? s.user.displayName,
            avatarUrl: updated?.avatarUrl ?? input.avatarUrl ?? s.user.avatarUrl,
          }
        : s.user,
    }));
  },

  uploadAvatar: async (file, filename) => {
    const { url } = await uploadsApi.avatar(file, filename);
    return url;
  },

  loadServers: async () => {
    set({ loadingServers: true });
    try {
      const raw = await serversApi.list();
      const servers = applySavedOrder(raw);
      set({ servers });
      // chọn server: ưu tiên server đang active hiện tại, rồi server đã lưu, rồi đầu danh sách.
      const { activeServerId } = get();
      if (!activeServerId && servers.length > 0) {
        const saved = loadActiveServer();
        const target = saved && servers.some((s) => s.id === saved) ? saved : servers[0].id;
        await get().selectServer(target);
      }
    } finally {
      set({ loadingServers: false });
    }
  },

  reorderServers: (sourceId, targetId) => {
    if (sourceId === targetId) return;
    set((s) => {
      const list = s.servers.slice();
      const from = list.findIndex((x) => x.id === sourceId);
      const to = list.findIndex((x) => x.id === targetId);
      if (from === -1 || to === -1) return {};
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      saveServerOrder(list.map((x) => x.id));
      return { servers: list };
    });
  },

  selectServer: async (serverId) => {
    set({ activeServerId: serverId, activeServer: null, channels: [], activeChannelId: null });
    saveActiveServer(serverId);
    let detail: ServerDetail | null = null;
    try {
      detail = await serversApi.detail(serverId);
    } catch {
      detail = null;
    }

    // Kênh có thể nằm trong detail.channels; nếu thiếu thì gọi endpoint riêng.
    let channels: Channel[] = Array.isArray(detail?.channels) ? detail!.channels : [];
    if (channels.length === 0) {
      try {
        channels = await serversApi.channels(serverId);
      } catch {
        channels = [];
      }
    }
    channels = channels
      .map(normalizeChannel)
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // Thành viên: nếu detail không kèm members thì gọi endpoint riêng.
    let members = Array.isArray(detail?.members) ? detail!.members : [];
    if (members.length === 0) {
      try {
        members = await serversApi.members(serverId);
      } catch {
        members = [];
      }
    }

    const summary = get().servers.find((s) => s.id === serverId);
    const merged: ServerDetail = {
      id: serverId,
      name: detail?.name ?? summary?.name ?? "Server",
      iconUrl: detail?.iconUrl ?? summary?.iconUrl,
      ownerId: detail?.ownerId ?? summary?.ownerId ?? "",
      inviteCode: detail?.inviteCode ?? summary?.inviteCode,
      role: detail?.role ?? summary?.role,
      isDefault: detail?.isDefault ?? summary?.isDefault,
      channels,
      members,
    };
    set({ activeServer: merged, channels });

    // Khởi tạo occupancy kênh thoại ngay từ field voiceMembers kèm trong danh sách kênh (mục 1a).
    set((s) => {
      const occ = { ...s.voiceOccupancy };
      channels.forEach((c) => {
        if (c.type === "VOICE" && Array.isArray(c.voiceMembers)) occ[c.id] = c.voiceMembers;
      });
      return { voiceOccupancy: occ };
    });

    // Khởi tạo presence map từ thành viên + chính mình.
    set((s) => {
      const pm: Record<string, PresenceStatus> = { ...s.presenceMap };
      members.forEach((mem: any) => {
        const uid = mem.userId || mem.user?.id;
        if (uid && mem.user?.presence) pm[uid] = mem.user.presence;
      });
      if (s.user) pm[s.user.id] = s.user.presence;
      return { presenceMap: pm };
    });

    // tự chọn kênh TEXT đầu tiên
    const firstText = channels.find((c) => c.type === "TEXT");
    if (firstText) {
      await get().selectChannel(firstText.id);
    } else {
      set({ activeChannelId: null });
    }

    // Tải danh sách người đang trong từng kênh thoại (hiển thị kể cả khi mình chưa tham gia).
    get().loadVoiceOccupancy(serverId, channels);

    // Join tất cả kênh TEXT để nhận message:new ở mọi kênh → đếm tin chưa đọc.
    if (get().socketConnected) {
      channels.filter((c) => c.type === "TEXT").forEach((c) => chat.joinChannel(c.id));
    }
  },

  createServer: async (name) => {
    const srv = await serversApi.create(name);
    await get().loadServers();
    await get().selectServer(srv.id);
  },

  joinServer: async (inviteCode) => {
    const srv = await serversApi.join(inviteCode);
    await get().loadServers();
    if (srv?.id) await get().selectServer(srv.id);
  },

  createChannel: async (name, type, topic, userLimit) => {
    const { activeServerId } = get();
    if (!activeServerId) throw new Error("Chưa chọn server.");
    const ch = await serversApi.createChannel(activeServerId, { name, type, topic, userLimit });
    // cập nhật ngay (socket channel:created cũng sẽ đồng bộ cho client khác)
    get()._upsertChannel(ch);
  },

  updateChannel: async (channelId, input) => {
    const ch = await channelsApi.update(channelId, input);
    get()._upsertChannel(ch);
  },

  deleteChannel: async (channelId) => {
    await channelsApi.remove(channelId);
    get()._removeChannel(channelId);
  },

  reorderChannels: async (sourceId, targetId) => {
    const { activeServerId, channels } = get();
    if (!activeServerId || sourceId === targetId) return;
    // sắp xếp cục bộ trước cho mượt
    const list = channels.slice();
    const from = list.findIndex((c) => c.id === sourceId);
    const to = list.findIndex((c) => c.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    // gán lại position theo thứ tự mới (giữ riêng theo loại không cần thiết — backend tự xử lý)
    const rePositioned = list.map((c, i) => ({ ...c, position: i }));
    set({ channels: rePositioned });
    try {
      await serversApi.reorderChannels(
        activeServerId,
        rePositioned.map((c) => ({ channelId: c.id, position: c.position }))
      );
    } catch (e) {
      // lỗi → tải lại để đồng bộ
      await get().selectServer(activeServerId);
      throw e;
    }
  },

  selectChannel: async (channelId) => {
    set({ activeChannelId: channelId });
    get().markChannelRead(channelId);
    // Giữ join tất cả kênh để vẫn nhận message:new (đếm chưa đọc); chỉ cần đảm bảo kênh này đã join.
    if (get().socketConnected) chat.joinChannel(channelId);
    if (!get().messages[channelId]) {
      await get().loadMessages(channelId);
    }
  },

  loadMessages: async (channelId) => {
    set({ loadingMessages: true });
    try {
      const list = await channelsApi.messages(channelId);
      const arr = Array.isArray(list) ? list : [];
      // backend trả mới→cũ; đảo lại để hiển thị cũ→mới.
      // Sắp xếp theo thời gian tạo để chắc chắn đúng thứ tự.
      const ordered = arr
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      set((s) => ({ messages: { ...s.messages, [channelId]: ordered } }));
    } catch {
      set((s) => ({ messages: { ...s.messages, [channelId]: s.messages[channelId] || [] } }));
    } finally {
      set({ loadingMessages: false });
    }
  },

  sendMessage: async (content, attachments, replyToId) => {
    const { activeChannelId, socketConnected } = get();
    const text = content.trim();
    const atts = attachments && attachments.length ? attachments : undefined;
    // cần ít nhất nội dung hoặc ảnh đính kèm
    if (!activeChannelId || (!text && !atts)) return;
    if (socketConnected) {
      // gửi realtime; server sẽ phát message:new về (kể cả cho mình)
      chat.sendMessage({ channelId: activeChannelId, content: text, attachments: atts, replyToId });
    } else {
      const msg = await channelsApi.sendMessage(activeChannelId, { content: text, attachments: atts, replyToId });
      get()._appendMessage(msg);
    }
  },

  deleteMessage: async (messageId) => {
    const { activeChannelId, socketConnected } = get();
    if (!activeChannelId) return;
    if (socketConnected) {
      chat.deleteMessage(messageId);
    } else {
      await channelsApi.deleteMessage(activeChannelId, messageId);
      set((s) => ({
        messages: {
          ...s.messages,
          [activeChannelId]: (s.messages[activeChannelId] || []).filter((m) => m.id !== messageId),
        },
      }));
    }
  },

  markChannelRead: (channelId) => {
    set((s) => {
      if (!s.unreadByChannel[channelId]) return {};
      const next = { ...s.unreadByChannel };
      delete next[channelId];
      return { unreadByChannel: next };
    });
  },

  toggleReaction: (messageId, emoji) => {
    const { activeChannelId, user } = get();
    if (!activeChannelId || !user || !emoji) return;
    const channelId = activeChannelId;
    // xác định đang bật hay tắt dựa vào trạng thái hiện tại
    const list = get().messages[channelId] || [];
    const msg = list.find((m) => m.id === messageId);
    const existing = msg?.reactions?.find((r) => r.emoji === emoji);
    const isRemoving = !!existing?.me;
    // cập nhật lạc quan
    get()._applyReaction(channelId, messageId, emoji, user.id, !isRemoving);
    // gọi API; lỗi → revert
    const call = isRemoving
      ? channelsApi.removeReaction(channelId, messageId, emoji)
      : channelsApi.addReaction(channelId, messageId, emoji);
    Promise.resolve(call).catch(() => {
      get()._applyReaction(channelId, messageId, emoji, user.id, isRemoving);
    });
  },

  loadVoiceOccupancy: async (serverId, channels) => {
    // Chỉ gọi API cho kênh thoại CHƯA kèm sẵn voiceMembers (mục 1a đã set trực tiếp).
    const voiceChannels = channels.filter((c) => c.type === "VOICE" && !Array.isArray(c.voiceMembers));
    if (voiceChannels.length === 0) return;
    const results = await Promise.allSettled(
      voiceChannels.map((c) => channelsApi.voiceMembers(c.id).then((members) => ({ id: c.id, members })))
    );
    // chỉ áp dụng nếu vẫn đang ở đúng server
    if (get().activeServerId !== serverId) return;
    set((s) => {
      const occ = { ...s.voiceOccupancy };
      for (const r of results) {
        if (r.status === "fulfilled") occ[r.value.id] = r.value.members;
      }
      return { voiceOccupancy: occ };
    });
  },

  initSocket: () => {
    connectChat();
    if (socketBound) {
      set({ socketConnected: true });
      return;
    }
    socketBound = true;

    onChat("connect", () => {
      set({ socketConnected: true });
      const st = get();
      // join lại mọi kênh TEXT của server đang mở để nhận message:new (đếm chưa đọc).
      st.channels.filter((c) => c.type === "TEXT").forEach((c) => chat.joinChannel(c.id));
      if (st.activeChannelId) chat.joinChannel(st.activeChannelId);
    });
    onChat("disconnect", () => set({ socketConnected: false }));

    onChat("message:new", (raw) => {
      const m = normalizeMessage(raw);
      get()._appendMessage(m);
      // Tăng số "chưa đọc" nếu tin đến kênh KHÔNG đang mở và không phải do mình gửi.
      const st = get();
      const mine = st.user && m.authorId === st.user.id;
      if (m.channelId !== st.activeChannelId && !mine) {
        set((s) => ({
          unreadByChannel: { ...s.unreadByChannel, [m.channelId]: (s.unreadByChannel[m.channelId] || 0) + 1 },
        }));
      }
    });
    onChat("message:updated", (raw) => {
      const m = normalizeMessage(raw);
      set((s) => ({
        messages: {
          ...s.messages,
          [m.channelId]: (s.messages[m.channelId] || []).map((x) => (x.id === m.id ? m : x)),
        },
      }));
    });
    onChat("message:deleted", (e) => {
      set((s) => ({
        messages: {
          ...s.messages,
          [e.channelId]: (s.messages[e.channelId] || []).filter((x) => x.id !== e.messageId),
        },
      }));
    });

    // ── Reaction realtime ──
    onChat("reaction:added", (e) => {
      if (e?.channelId && e.messageId && e.emoji && e.userId) {
        get()._applyReaction(e.channelId, e.messageId, e.emoji, e.userId, true);
      }
    });
    onChat("reaction:removed", (e) => {
      if (e?.channelId && e.messageId && e.emoji && e.userId) {
        get()._applyReaction(e.channelId, e.messageId, e.emoji, e.userId, false);
      }
    });

    // ── Kênh realtime ──
    onChat("channel:created", (raw) => get()._upsertChannel(normalizeChannel(raw)));
    onChat("channel:updated", (raw) => get()._upsertChannel(normalizeChannel(raw)));
    onChat("channel:deleted", (e) => {
      if (e?.channelId) get()._removeChannel(e.channelId);
    });
    onChat("channel:reordered", (e) => {
      if (e?.serverId && Array.isArray(e.channels)) {
        get()._setChannels(e.serverId, e.channels.map(normalizeChannel));
      }
    });

    // Ai đang trong kênh thoại (room server) — thấy kể cả khi mình chưa vào.
    onChat("voice:channel-joined", (e) => {
      if (!e?.channelId || !e.member) return;
      const member = normalizeVoiceMember(e.member);
      if (!member.userId) return;
      set((s) => {
        const cur = s.voiceOccupancy[e.channelId] || [];
        if (cur.some((m) => m.userId === member.userId)) {
          // đã có → cập nhật trạng thái
          return {
            voiceOccupancy: {
              ...s.voiceOccupancy,
              [e.channelId]: cur.map((m) => (m.userId === member.userId ? { ...m, ...member } : m)),
            },
          };
        }
        return { voiceOccupancy: { ...s.voiceOccupancy, [e.channelId]: [...cur, member] } };
      });
    });
    onChat("voice:channel-left", (e) => {
      if (!e?.channelId || !e.userId) return;
      set((s) => {
        const cur = s.voiceOccupancy[e.channelId];
        if (!cur) return {};
        return {
          voiceOccupancy: { ...s.voiceOccupancy, [e.channelId]: cur.filter((m) => m.userId !== e.userId) },
        };
      });
    });

    // Trạng thái mic/loa thay đổi (phát tới room server) → cập nhật occupancy
    // để người CHƯA vào phòng vẫn thấy ai đang tắt mic / tai nghe / đang stream.
    const applyVoiceState = (e: { channelId?: string; userId?: string; muted?: boolean; deafened?: boolean; speaking?: boolean; streaming?: boolean }) => {
      if (!e?.channelId || !e.userId) return;
      set((s) => {
        const cur = s.voiceOccupancy[e.channelId!];
        if (!cur) return {};
        let changed = false;
        const next = cur.map((m) => {
          if (m.userId !== e.userId) return m;
          changed = true;
          return {
            ...m,
            ...(typeof e.muted === "boolean" ? { muted: e.muted } : {}),
            ...(typeof e.deafened === "boolean" ? { deafened: e.deafened } : {}),
            ...(typeof e.speaking === "boolean" ? { speaking: e.speaking } : {}),
            ...(typeof e.streaming === "boolean" ? { streaming: e.streaming } : {}),
          };
        });
        return changed ? { voiceOccupancy: { ...s.voiceOccupancy, [e.channelId!]: next } } : {};
      });
    };
    onChat("voice:channel-state", applyVoiceState);
    onChat("voice:member-state", applyVoiceState);
    onChat("voice:state-changed", applyVoiceState);
    // Stream bắt đầu / dừng (badge Live cho người ngoài phòng).
    onChat("stream:started", (e) => applyVoiceState({ channelId: e?.channelId, userId: e?.userId, streaming: true }));
    onChat("stream:stopped", (e) => applyVoiceState({ channelId: e?.channelId, userId: e?.userId, streaming: false }));

    // Đồng bộ hồ sơ user (tên/avatar) ở mọi nơi đang hiển thị.
    onChat("user:updated", (e) => {
      const u = e?.user;
      if (!u?.id) return;
      set((s) => {
        // user hiện tại
        const user = s.user && s.user.id === u.id
          ? { ...s.user, displayName: u.displayName ?? s.user.displayName, username: u.username ?? s.user.username, avatarUrl: u.avatarUrl ?? s.user.avatarUrl }
          : s.user;
        // thành viên trong server đang mở
        let activeServer = s.activeServer;
        if (activeServer) {
          const members = activeServer.members.map((mem) =>
            mem.userId === u.id && mem.user
              ? { ...mem, user: { ...mem.user, displayName: u.displayName ?? mem.user.displayName, username: u.username ?? mem.user.username, avatarUrl: u.avatarUrl ?? mem.user.avatarUrl } }
              : mem
          );
          activeServer = { ...activeServer, members };
        }
        // occupancy kênh thoại
        const voiceOccupancy: Record<string, import("../lib/communityApi").VoiceMember[]> = {};
        let occChanged = false;
        for (const [cid, list] of Object.entries(s.voiceOccupancy)) {
          let changed = false;
          const next = list.map((m) => {
            if (m.userId === u.id) {
              changed = true;
              const base = m.user || ({ id: u.id } as any);
              return { ...m, user: { ...base, displayName: u.displayName ?? base.displayName, username: u.username ?? base.username, avatarUrl: u.avatarUrl ?? base.avatarUrl } };
            }
            return m;
          });
          voiceOccupancy[cid] = changed ? next : list;
          if (changed) occChanged = true;
        }
        // tin nhắn đã tải (cập nhật author lồng trong tin)
        const messages: Record<string, import("../lib/communityApi").Message[]> = {};
        let msgChanged = false;
        for (const [cid, list] of Object.entries(s.messages)) {
          let changed = false;
          const next = list.map((m) => {
            if (m.authorId === u.id && m.author) {
              changed = true;
              return { ...m, author: { ...m.author, displayName: u.displayName ?? m.author.displayName, username: u.username ?? m.author.username, avatarUrl: u.avatarUrl ?? m.author.avatarUrl } };
            }
            return m;
          });
          messages[cid] = changed ? next : list;
          if (changed) msgChanged = true;
        }
        return {
          user,
          activeServer,
          ...(occChanged ? { voiceOccupancy } : {}),
          ...(msgChanged ? { messages } : {}),
        };
      });
    });

    // Đồng bộ tên/icon server.
    onChat("server:updated", (srv) => {
      if (!srv?.id) return;
      set((s) => {
        const servers = s.servers.map((x) =>
          x.id === srv.id
            ? { ...x, name: srv.name ?? x.name, iconUrl: srv.iconUrl ?? x.iconUrl, ownerId: srv.ownerId ?? x.ownerId, isDefault: srv.isDefault ?? x.isDefault }
            : x
        );
        const activeServer = s.activeServer && s.activeServer.id === srv.id
          ? { ...s.activeServer, name: srv.name ?? s.activeServer.name, iconUrl: srv.iconUrl ?? s.activeServer.iconUrl, ownerId: srv.ownerId ?? s.activeServer.ownerId, isDefault: srv.isDefault ?? s.activeServer.isDefault }
          : s.activeServer;
        return { servers, activeServer };
      });
    });

    // Thành viên server thay đổi.
    onChat("server:member-joined", (e) => {
      if (e?.serverId && get().activeServerId === e.serverId) get().selectServer(e.serverId);
    });
    onChat("server:member-left", (e) => {
      if (!e?.serverId || !e.userId) return;
      set((s) => {
        if (!s.activeServer || s.activeServer.id !== e.serverId) return {};
        return { activeServer: { ...s.activeServer, members: s.activeServer.members.filter((m) => m.userId !== e.userId) } };
      });
    });
    onChat("server:member-updated", (e) => {
      if (!e?.serverId || !e.userId) return;
      set((s) => {
        if (!s.activeServer || s.activeServer.id !== e.serverId) return {};
        const members = s.activeServer.members.map((m) =>
          m.userId === e.userId
            ? { ...m, ...(e.role ? { role: e.role } : {}), ...(typeof e.nickname === "string" ? { nickname: e.nickname } : {}) }
            : m
        );
        return { activeServer: { ...s.activeServer, members } };
      });
    });
    onChat("server:member-banned", (e) => {
      if (!e?.serverId || !e.userId) return;
      set((s) => {
        if (!s.activeServer || s.activeServer.id !== e.serverId) return {};
        return { activeServer: { ...s.activeServer, members: s.activeServer.members.filter((m) => m.userId !== e.userId) } };
      });
    });
    onChat("server:you-were-banned", (e) => {
      if (!e?.serverId) return;
      // bị ban → tải lại danh sách server (server sẽ biến mất).
      get().loadServers();
    });
    onChat("server:ownership-transferred", (e) => {
      if (e?.serverId && get().activeServerId === e.serverId) get().selectServer(e.serverId);
    });

    onChat("typing", (e) => {
      set((s) => {
        const current = new Set(s.typingByChannel[e.channelId] || []);
        if (e.isTyping) current.add(e.userId);
        else current.delete(e.userId);
        return { typingByChannel: { ...s.typingByChannel, [e.channelId]: [...current] } };
      });
    });
    onChat("presence:changed", (e) => {
      set((s) => {
        const presenceMap = { ...s.presenceMap, [e.userId]: e.presence };
        // Cập nhật cả trạng thái user hiện tại nếu là chính mình.
        const user =
          s.user && s.user.id === e.userId ? { ...s.user, presence: e.presence } : s.user;
        // Cập nhật trong danh sách thành viên (nếu có).
        let activeServer = s.activeServer;
        if (activeServer) {
          const members = activeServer.members.map((mem) =>
            mem.userId === e.userId && mem.user
              ? { ...mem, user: { ...mem.user, presence: e.presence } }
              : mem
          );
          activeServer = { ...activeServer, members };
        }
        return { presenceMap, user, activeServer };
      });
    });
  },

  teardownSocket: () => {
    disconnectChat();
    socketBound = false;
    set({ socketConnected: false });
  },

  // helper nội bộ
  _appendMessage(m: Message) {
    set((s) => {
      const list = s.messages[m.channelId] || [];
      if (list.some((x) => x.id === m.id)) return {};
      return { messages: { ...s.messages, [m.channelId]: [...list, m] } };
    });
  },

  _applyReaction(channelId, messageId, emoji, userId, add) {
    set((s) => {
      const list = s.messages[channelId];
      if (!list) return {};
      const myId = s.user?.id;
      const next = list.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = (m.reactions || []).map((r) => ({ ...r, userIds: [...r.userIds] }));
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (add) {
          if (idx === -1) {
            reactions.push({ emoji, count: 1, userIds: [userId], me: userId === myId });
          } else {
            const r = reactions[idx];
            if (!r.userIds.includes(userId)) {
              r.userIds.push(userId);
              r.count += 1;
            }
            if (userId === myId) r.me = true;
          }
        } else if (idx !== -1) {
          const r = reactions[idx];
          if (r.userIds.includes(userId)) {
            r.userIds = r.userIds.filter((u) => u !== userId);
            r.count = Math.max(0, r.count - 1);
          }
          if (userId === myId) r.me = false;
          if (r.count <= 0) reactions.splice(idx, 1);
        }
        return { ...m, reactions };
      });
      return { messages: { ...s.messages, [channelId]: next } };
    });
  },

  _upsertChannel(c: Channel) {
    set((s) => {
      // chỉ áp dụng cho server đang mở
      if (!s.activeServer || (c.serverId && c.serverId !== s.activeServer.id)) return {};
      const exists = s.channels.some((x) => x.id === c.id);
      const channels = exists
        ? s.channels.map((x) => (x.id === c.id ? { ...x, ...c } : x))
        : [...s.channels, c];
      channels.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return {
        channels,
        activeServer: { ...s.activeServer, channels },
      };
    });
  },

  _removeChannel(channelId: string) {
    set((s) => {
      const channels = s.channels.filter((x) => x.id !== channelId);
      const activeServer = s.activeServer ? { ...s.activeServer, channels } : s.activeServer;
      // nếu kênh đang mở bị xoá → chuyển sang kênh TEXT đầu tiên còn lại
      let activeChannelId = s.activeChannelId;
      if (activeChannelId === channelId) {
        activeChannelId = channels.find((c) => c.type === "TEXT")?.id ?? null;
      }
      const messages = { ...s.messages };
      delete messages[channelId];
      return { channels, activeServer, activeChannelId, messages };
    });
    // nếu cần, tải tin nhắn cho kênh mới active
    const next = get().activeChannelId;
    if (next && !get().messages[next]) get().loadMessages(next);
  },

  _setChannels(serverId: string, channels: Channel[]) {
    set((s) => {
      if (!s.activeServer || s.activeServer.id !== serverId) return {};
      const sorted = channels.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return { channels: sorted, activeServer: { ...s.activeServer, channels: sorted } };
    });
  },
}));
