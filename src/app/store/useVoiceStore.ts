"use client";

import { create } from "zustand";
import { useCommunityStore } from "./useCommunityStore";
import type { VoiceParticipantInfo } from "../lib/voice/voiceEngine";
import { LivekitVoiceEngine } from "../lib/voice/livekitEngine";
import {
  playJoinSound,
  playLeaveSound,
  playStreamStartSound,
  playStreamStopSound,
} from "../lib/voice/voiceSounds";

export interface VoiceParticipantState extends VoiceParticipantInfo {
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
}

// Video track (chia sẻ màn hình / camera) đang xem được, theo userId.
export interface VoiceVideo {
  userId: string;
  track: MediaStreamTrack;
  source: "screen" | "camera";
}

interface VoiceState {
  connected: boolean;
  connecting: boolean;
  channelId: string | null;
  channelName: string | null;
  serverId: string | null;
  myUserId: string | null;
  participants: Record<string, VoiceParticipantState>;
  videos: Record<string, VoiceVideo>; // userId → video track đang phát
  selfMuted: boolean;
  selfDeafened: boolean;
  selfStreaming: boolean;
  userVolumes: Record<string, number>; // âm lượng riêng từng user (0..1), mặc định 1
  error: string | null;

  join: (input: { channelId: string; channelName: string; serverId: string; myUserId: string; getSelf: () => VoiceParticipantInfo }) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setUserVolume: (userId: string, volume: number) => void;
  applyFilterStrength: (strength: number) => void;
  applyAdvancedFilter: (on: boolean, strength: number) => void;
  applyOutputDevice: (deviceId: string) => void;
  startScreenShare: (opts?: { sourceId?: string; width?: number; height?: number; fps?: number; surface?: "monitor" | "window" }) => Promise<void>;
  startCamera: () => Promise<void>;
  stopStream: () => Promise<void>;
}

let engine: LivekitVoiceEngine | null = null;
let voiceChannelClosedUnsub: (() => void) | null = null;

export const useVoiceStore = create<VoiceState>((set, get) => {
  // Bổ sung tên/avatar cho participant từ danh sách thành viên cộng đồng.
  const enrich = (p: VoiceParticipantInfo): VoiceParticipantInfo => {
    if (p.displayName || p.username || p.avatarUrl) return p;
    try {
      const cs = useCommunityStore.getState();
      const mem = cs.activeServer?.members.find((m) => m.userId === p.userId);
      const u = mem?.user || (cs.user?.id === p.userId ? cs.user : undefined);
      if (u) return { userId: p.userId, displayName: u.displayName, username: u.username, avatarUrl: u.avatarUrl };
    } catch {/* ignore */}
    return p;
  };

  const upsert = (raw: VoiceParticipantInfo, patch: Partial<VoiceParticipantState> = {}) => {
    const p = enrich(raw);
    set((s) => {
      const prev = s.participants[p.userId];
      const next: VoiceParticipantState = {
        userId: p.userId,
        displayName: p.displayName ?? prev?.displayName,
        username: p.username ?? prev?.username,
        avatarUrl: p.avatarUrl ?? prev?.avatarUrl,
        speaking: prev?.speaking ?? false,
        muted: prev?.muted ?? false,
        deafened: prev?.deafened ?? false,
        streaming: prev?.streaming ?? false,
        ...patch,
      };
      return { participants: { ...s.participants, [p.userId]: next } };
    });
  };

  const setField = (userId: string, patch: Partial<VoiceParticipantState>) => {
    set((s) => {
      const prev = s.participants[userId];
      if (!prev) return {};
      return { participants: { ...s.participants, [userId]: { ...prev, ...patch } } };
    });
  };

  return {
    connected: false,
    connecting: false,
    channelId: null,
    channelName: null,
    serverId: null,
    myUserId: null,
    participants: {},
    videos: {},
    selfMuted: false,
    selfDeafened: false,
    selfStreaming: false,
    userVolumes: {},
    error: null,

    join: async ({ channelId, channelName, serverId, myUserId, getSelf }) => {
      if (get().channelId && get().channelId !== channelId) {
        await get().leave();
      }
      if (get().channelId === channelId && (get().connected || get().connecting)) return;

      set({
        connecting: true,
        channelId,
        channelName,
        serverId,
        myUserId,
        error: null,
        videos: {},
        // Seed từ occupancy đã biết để không bị "trống rồi mới hiện".
        participants: (() => {
          const seed: Record<string, VoiceParticipantState> = {};
          try {
            const occ = useCommunityStore.getState().voiceOccupancy[channelId] || [];
            occ.forEach((m) => {
              if (!m.userId || m.userId === myUserId) return;
              seed[m.userId] = {
                userId: m.userId,
                displayName: m.user?.displayName,
                username: m.user?.username,
                avatarUrl: m.user?.avatarUrl,
                speaking: false,
                muted: !!m.muted,
                deafened: !!m.deafened,
                streaming: !!m.streaming,
              };
            });
          } catch {/* ignore */}
          seed[myUserId] = { ...getSelf(), speaking: false, muted: get().selfMuted, deafened: get().selfDeafened, streaming: false };
          return seed;
        })(),
      });

      const callbacks = {
        onConnected: () => {
          // onConnected có thể bắn 2 lần (LiveKit Room.Connected + socket connect).
          // Chỉ phát âm + đổi trạng thái khi LẦN ĐẦU chuyển sang connected.
          if (get().connected) { set({ connecting: false }); return; }
          set({ connected: true, connecting: false });
          playJoinSound();
        },
        onDisconnected: () => { if (get().channelId === channelId) set({ connected: false }); },
        onParticipantsList: (list: VoiceParticipantInfo[]) => {
          const ids = new Set(list.map((p) => p.userId).filter(Boolean));
          ids.add(myUserId);
          list.forEach((p) => upsert(p));
          set((s) => {
            let changed = false;
            const next: Record<string, VoiceParticipantState> = {};
            for (const [uid, p] of Object.entries(s.participants)) {
              if (ids.has(uid)) next[uid] = p; else changed = true;
            }
            return changed ? { participants: next } : {};
          });
        },
        onParticipantJoined: (p: VoiceParticipantInfo) => {
          const existed = !!get().participants[p.userId];
          upsert(p);
          // chỉ kêu khi thực sự có người MỚI vào (và mình đã kết nối xong).
          if (!existed && p.userId !== myUserId && get().connected) playJoinSound();
        },
        onParticipantLeft: (userId: string) => {
          if (userId !== myUserId && get().participants[userId] && get().connected) playLeaveSound();
          set((s) => {
            if (userId === myUserId) return {};
            const next = { ...s.participants };
            delete next[userId];
            const videos = { ...s.videos };
            delete videos[userId];
            return { participants: next, videos };
          });
        },
        onSpeaking: (userId: string, speaking: boolean) => setField(userId, { speaking }),
        onState: (userId: string, st: { muted?: boolean; deafened?: boolean; streaming?: boolean }) => {
          // phát tiếng khi NGƯỜI KHÁC bắt đầu / dừng chia sẻ.
          if (typeof st.streaming === "boolean" && userId !== get().myUserId && get().connected) {
            const was = get().participants[userId]?.streaming ?? false;
            if (st.streaming && !was) playStreamStartSound();
            else if (!st.streaming && was) playStreamStopSound();
          }
          setField(userId, {
            ...(typeof st.muted === "boolean" ? { muted: st.muted } : {}),
            ...(typeof st.deafened === "boolean" ? { deafened: st.deafened } : {}),
            ...(typeof st.streaming === "boolean" ? { streaming: st.streaming } : {}),
          });
        },
        onVideoTrack: (userId: string, track: MediaStreamTrack | null, source: "screen" | "camera") => {
          set((s) => {
            const videos = { ...s.videos };
            if (track) videos[userId] = { userId, track, source };
            else delete videos[userId];
            return { videos };
          });
          if (track) setField(userId, { streaming: true });
        },
        onError: (message: string) => set({ error: message, connecting: false }),
      };

      try {
        engine = new LivekitVoiceEngine(myUserId, callbacks);
        await engine.join(channelId);
        if (get().selfMuted || get().selfDeafened) {
          engine.setState({ muted: get().selfMuted, deafened: get().selfDeafened });
        }

        const { onVoice } = await import("../lib/communitySocket");
        if (voiceChannelClosedUnsub) voiceChannelClosedUnsub();
        voiceChannelClosedUnsub = onVoice("voice:channel-closed", (e) => {
          if (e?.channelId && e.channelId === get().channelId) get().leave();
        });
      } catch (e: any) {
        try { engine?.destroy(); } catch {/* ignore */}
        engine = null;
        set({ connecting: false, connected: false, channelId: null, channelName: null, serverId: null, participants: {}, videos: {} });
        throw e;
      }
    },

    leave: async () => {
      const wasConnected = get().connected;
      try {
        await engine?.leave();
        engine?.destroy();
      } catch {/* ignore */}
      engine = null;
      if (voiceChannelClosedUnsub) { voiceChannelClosedUnsub(); voiceChannelClosedUnsub = null; }
      if (wasConnected) playLeaveSound();
      set({
        connected: false,
        connecting: false,
        channelId: null,
        channelName: null,
        serverId: null,
        myUserId: null,
        participants: {},
        videos: {},
        selfStreaming: false,
        userVolumes: {},
      });
    },

    toggleMute: () => {
      const muted = !get().selfMuted;
      const deafened = get().selfDeafened;
      set({ selfMuted: muted });
      engine?.setState({ muted, deafened });
      const me = get().myUserId;
      if (me) setField(me, { muted });
    },

    toggleDeafen: () => {
      const deafened = !get().selfDeafened;
      const muted = deafened ? true : get().selfMuted;
      set({ selfDeafened: deafened, selfMuted: muted });
      engine?.setState({ muted, deafened });
      const me = get().myUserId;
      if (me) setField(me, { deafened, muted });
    },

    setUserVolume: (userId, volume) => {
      const v = Math.min(1, Math.max(0, volume));
      set((s) => ({ userVolumes: { ...s.userVolumes, [userId]: v } }));
      engine?.setUserVolume(userId, v);
    },

    applyFilterStrength: (strength) => {
      engine?.setFilterStrength(strength);
    },

    applyAdvancedFilter: (on, strength) => {
      if (!engine) return;
      if (on) engine.enableMicFilter(strength).catch(() => {});
      else engine.disableMicFilter().catch(() => {});
    },

    applyOutputDevice: (deviceId) => {
      engine?.setOutputDevice(deviceId);
    },

    startScreenShare: async (opts?: { sourceId?: string; width?: number; height?: number; fps?: number; surface?: "monitor" | "window" }) => {
      if (!engine) return;
      // Có sourceId → chia sẻ kiểu Discord (capture qua Rust, không hộp thoại native).
      const ok = opts?.sourceId
        ? await engine.startTauriScreenShare(opts.sourceId, { width: opts.width, height: opts.height, fps: opts.fps })
        : await engine.startScreenShare(opts);
      if (ok) {
        set({ selfStreaming: true });
        playStreamStartSound();
        const me = get().myUserId;
        if (me) {
          setField(me, { streaming: true });
          const track = engine.getLocalVideoTrack();
          if (track) set((s) => ({ videos: { ...s.videos, [me]: { userId: me, track, source: "screen" } } }));
        }
      }
    },

    startCamera: async () => {
      if (!engine) return;
      const ok = await engine.startCamera();
      if (ok) {
        set({ selfStreaming: true });
        playStreamStartSound();
        const me = get().myUserId;
        if (me) {
          setField(me, { streaming: true });
          const track = engine.getLocalVideoTrack();
          if (track) set((s) => ({ videos: { ...s.videos, [me]: { userId: me, track, source: "camera" } } }));
        }
      }
    },

    stopStream: async () => {
      if (!engine) return;
      await engine.stopStream();
      set({ selfStreaming: false });
      playStreamStopSound();
      const me = get().myUserId;
      if (me) {
        setField(me, { streaming: false });
        set((s) => {
          const videos = { ...s.videos };
          delete videos[me];
          return { videos };
        });
      }
    },
  };
});
