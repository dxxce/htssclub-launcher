"use client";

import { create } from "zustand";
import {
  dmApi,
  type DmConversation,
  type DmMessage,
  type CommunityUser,
  type Attachment,
} from "../lib/communityApi";
import { chat, onChat } from "../lib/communitySocket";
import { useCommunityStore } from "./useCommunityStore";
import { playMessageSound } from "../lib/notifySounds";

interface DmState {
  conversations: DmConversation[];
  activeId: string | null;
  messagesByConv: Record<string, DmMessage[]>;
  typingByConv: Record<string, Set<string>>; // conversationId → userId đang gõ
  loadingConvs: boolean;
  loadingMsgs: boolean;
  bound: boolean;

  totalUnread: () => number;
  loadConversations: () => Promise<void>;
  openConversation: (user: CommunityUser) => Promise<string | null>;
  selectConversation: (conversationId: string | null) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (input: { content?: string; attachments?: Attachment[]; replyToId?: string }) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markRead: (conversationId: string) => void;
  bindRealtime: () => void;
  reset: () => void;
}

let unsubs: Array<() => void> = [];

export const useDmStore = create<DmState>((set, get) => {
  const myId = () => useCommunityStore.getState().user?.id;

  const upsertConv = (conv: DmConversation) => {
    set((s) => {
      const others = s.conversations.filter((c) => c.id !== conv.id);
      return { conversations: [conv, ...others] };
    });
  };

  const bumpConv = (conversationId: string, message: DmMessage, incUnread: boolean) => {
    set((s) => {
      const idx = s.conversations.findIndex((c) => c.id === conversationId);
      if (idx === -1) return {};
      const conv = s.conversations[idx];
      const updated: DmConversation = {
        ...conv,
        lastMessage: message,
        updatedAt: message.createdAt,
        unread: incUnread && s.activeId !== conversationId ? (conv.unread || 0) + 1 : conv.unread,
      };
      const next = [updated, ...s.conversations.filter((c) => c.id !== conversationId)];
      return { conversations: next };
    });
  };

  return {
    conversations: [],
    activeId: null,
    messagesByConv: {},
    typingByConv: {},
    loadingConvs: false,
    loadingMsgs: false,
    bound: false,

    totalUnread: () => get().conversations.reduce((sum, c) => sum + (c.unread || 0), 0),

    loadConversations: async () => {
      set({ loadingConvs: true });
      try {
        const convs = await dmApi.conversations();
        set({ conversations: convs });
      } finally {
        set({ loadingConvs: false });
      }
    },

    openConversation: async (user) => {
      try {
        const conv = await dmApi.open(user.id);
        // đảm bảo có user info để hiển thị
        if (!conv.user) conv.user = user;
        upsertConv(conv);
        await get().selectConversation(conv.id);
        return conv.id;
      } catch {
        return null;
      }
    },

    selectConversation: async (conversationId) => {
      set({ activeId: conversationId });
      if (!conversationId) return;
      if (!get().messagesByConv[conversationId]) {
        await get().loadMessages(conversationId);
      }
      get().markRead(conversationId);
    },

    loadMessages: async (conversationId) => {
      set({ loadingMsgs: true });
      try {
        const msgs = await dmApi.messages(conversationId, { limit: 50 });
        // backend trả mới→cũ hoặc cũ→mới; chuẩn hoá tăng dần theo thời gian.
        msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        set((s) => ({ messagesByConv: { ...s.messagesByConv, [conversationId]: msgs } }));
      } finally {
        set({ loadingMsgs: false });
      }
    },

    sendMessage: async ({ content, attachments, replyToId }) => {
      const convId = get().activeId;
      const conv = get().conversations.find((c) => c.id === convId);
      const toUserId = conv?.user?.id;
      if (!toUserId) return;
      const text = (content || "").trim();
      if (!text && (!attachments || attachments.length === 0)) return;
      // gửi qua REST (đáng tin) — realtime dm:new sẽ về cho cả 2 phía.
      const msg = await dmApi.send({ toUserId, content: text || undefined, attachments, replyToId });
      // chèn ngay nếu chưa có (tránh chờ event).
      set((s) => {
        const list = s.messagesByConv[msg.conversationId] || [];
        if (list.some((m) => m.id === msg.id)) return {};
        return { messagesByConv: { ...s.messagesByConv, [msg.conversationId]: [...list, msg] } };
      });
      bumpConv(msg.conversationId, msg, false);
    },

    deleteMessage: async (messageId) => {
      await dmApi.remove(messageId);
      set((s) => {
        const next: Record<string, DmMessage[]> = {};
        for (const [cid, list] of Object.entries(s.messagesByConv)) {
          next[cid] = list.filter((m) => m.id !== messageId);
        }
        return { messagesByConv: next };
      });
    },

    markRead: (conversationId) => {
      const conv = get().conversations.find((c) => c.id === conversationId);
      if (!conv || !conv.unread) return;
      chat.dmRead(conversationId);
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
      }));
    },

    bindRealtime: () => {
      if (get().bound) return;
      set({ bound: true });

      unsubs.push(onChat("dm:new", ({ conversationId, message, from, unread }) => {
        const mine = message.senderId === myId();
        // 1) chèn tin vào hội thoại nếu đã tải (hoặc đang mở).
        set((s) => {
          const list = s.messagesByConv[conversationId] || [];
          if (list.some((m) => m.id === message.id)) return {};
          if (!s.messagesByConv[conversationId] && s.activeId !== conversationId) return {};
          return { messagesByConv: { ...s.messagesByConv, [conversationId]: [...list, message] } };
        });

        // 2) cập nhật inbox: nếu chưa có hội thoại → tạo từ `from` (không cần fetch).
        const exists = get().conversations.some((c) => c.id === conversationId);
        if (!exists) {
          const peer = from && !mine ? from : message.sender;
          set((s) => ({
            conversations: [
              {
                id: conversationId,
                user: peer ? ({ id: peer.id, username: peer.username || "", displayName: peer.displayName, avatarUrl: peer.avatarUrl, balance: 0, status: "ACTIVE", presence: "OFFLINE" } as any) : undefined,
                lastMessage: message,
                unread: typeof unread === "number" ? unread : (mine ? 0 : 1),
                updatedAt: message.createdAt,
              } as DmConversation,
              ...s.conversations,
            ],
          }));
        } else {
          set((s) => {
            const idx = s.conversations.findIndex((c) => c.id === conversationId);
            if (idx === -1) return {};
            const conv = s.conversations[idx];
            const isActive = s.activeId === conversationId;
            const nextUnread = isActive ? 0 : (typeof unread === "number" ? unread : (mine ? conv.unread : (conv.unread || 0) + 1));
            const updated: DmConversation = { ...conv, lastMessage: message, updatedAt: message.createdAt, unread: nextUnread };
            return { conversations: [updated, ...s.conversations.filter((c) => c.id !== conversationId)] };
          });
        }

        // 3) đang mở đúng hội thoại → đánh dấu đã đọc.
        if (get().activeId === conversationId && !mine) get().markRead(conversationId);

        // 4) âm thanh: tin chuyển xu (SYSTEM) KHÔNG kêu ở đây — đã có
        //    wallet:transaction lo tiếng "coin". Tin thường của người khác → tiếng tin nhắn.
        if (!mine && message.type !== "SYSTEM") {
          playMessageSound();
        }
      }));

      unsubs.push(onChat("dm:updated", ({ conversationId, message }) => {
        set((s) => {
          const list = s.messagesByConv[conversationId];
          if (!list) return {};
          return { messagesByConv: { ...s.messagesByConv, [conversationId]: list.map((m) => (m.id === message.id ? message : m)) } };
        });
      }));

      unsubs.push(onChat("dm:deleted", ({ conversationId, messageId }) => {
        set((s) => {
          const list = s.messagesByConv[conversationId];
          if (!list) return {};
          return { messagesByConv: { ...s.messagesByConv, [conversationId]: list.filter((m) => m.id !== messageId) } };
        });
      }));

      unsubs.push(onChat("dm:read", ({ conversationId, byUserId }) => {
        // người kia đọc → có thể hiển thị "đã xem" sau; hiện chỉ bỏ qua unread của mình.
        if (byUserId === myId()) {
          set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)) }));
        }
      }));

      unsubs.push(onChat("dm:typing", ({ conversationId, userId, isTyping }) => {
        if (userId === myId()) return;
        set((s) => {
          const cur = new Set(s.typingByConv[conversationId] || []);
          if (isTyping) cur.add(userId); else cur.delete(userId);
          return { typingByConv: { ...s.typingByConv, [conversationId]: cur } };
        });
      }));
    },

    reset: () => {
      unsubs.forEach((u) => { try { u(); } catch {/* ignore */} });
      unsubs = [];
      set({ conversations: [], activeId: null, messagesByConv: {}, typingByConv: {}, bound: false });
    },
  };
});
