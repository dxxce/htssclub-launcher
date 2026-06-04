"use client";

import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  type RemoteTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Participant,
} from "livekit-client";
import {
  AudioSink,
  type VoiceParticipantInfo,
} from "./voiceEngine";
import { getVoiceSettings } from "./voiceSettings";
import { NoiseFilterProcessor } from "./noiseFilter";
import { startTauriCapture, type TauriCapture } from "./tauriScreenCapture";
import {
  connectVoice,
  disconnectVoice,
  getVoiceSocket,
  onVoice,
  voice,
  type LivekitCreds,
} from "../communitySocket";

export interface LivekitCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onParticipantsList: (list: VoiceParticipantInfo[]) => void;
  onParticipantJoined: (p: VoiceParticipantInfo) => void;
  onParticipantLeft: (userId: string) => void;
  onSpeaking: (userId: string, speaking: boolean) => void;
  onState: (userId: string, state: { muted?: boolean; deafened?: boolean; streaming?: boolean }) => void;
  // Một video track (chia sẻ màn hình / camera) của ai đó sẵn sàng để xem.
  onVideoTrack: (userId: string, track: MediaStreamTrack | null, source: "screen" | "camera") => void;
  onError: (message: string) => void;
}

function memberToInfo(m: any): VoiceParticipantInfo {
  const u = m?.user ?? m;
  return {
    userId: String(m?.userId ?? u?.id ?? u?._id ?? ""),
    displayName: u?.displayName,
    username: u?.username,
    avatarUrl: u?.avatarUrl,
  };
}

function metaInfo(p: Participant): VoiceParticipantInfo {
  let meta: any = {};
  try {
    meta = p.metadata ? JSON.parse(p.metadata) : {};
  } catch {/* ignore */}
  return {
    userId: p.identity,
    displayName: meta.displayName || p.name || undefined,
    username: meta.username,
    avatarUrl: meta.avatarUrl,
  };
}

/**
 * Engine thoại + streaming chạy 100% qua LiveKit (SFU).
 * - Control plane: namespace /ws-voice (join/leave/token/state/stream + roster).
 * - Media plane: LiveKit room (audio mic + video chia sẻ màn hình/camera).
 * KHÔNG còn mesh P2P / RTCPeerConnection.
 */
export class LivekitVoiceEngine {
  private room: Room | null = null;
  private sink = new AudioSink();
  private channelId: string | null = null;
  private unsub: Array<() => void> = [];
  private screenOn = false;
  private cameraOn = false;
  private tauriCapture: TauriCapture | null = null;
  private tauriPublished: LocalVideoTrack | null = null;
  private micProcessor: NoiseFilterProcessor | null = null;
  private audioCtx: AudioContext | null = null;

  constructor(private myUserId: string, private cb: LivekitCallbacks) {}

  async join(channelId: string) {
    this.channelId = channelId;
    this.sink.setOutputDevice(getVoiceSettings().outputDeviceId);

    // 1) Kết nối control socket + đăng ký sự kiện roster/stream.
    connectVoice();
    this.bindControlSocket();

    // 2) Báo backend vào phòng → nhận LiveKit credentials + roster.
    let ack;
    try {
      ack = await voice.join(channelId);
    } catch (e: any) {
      this.cb.onError(e?.message || "Không vào được phòng thoại.");
      throw e;
    }

    // Roster ban đầu (gồm cả mình).
    const peers = Array.isArray(ack.peers) ? ack.peers.map(memberToInfo).filter((p) => p.userId) : [];
    this.cb.onParticipantsList([{ userId: this.myUserId }, ...peers.filter((p) => p.userId !== this.myUserId)]);
    // trạng thái mic/stream sẵn có từ roster
    if (Array.isArray(ack.peers)) {
      ack.peers.forEach((m: any) => {
        if (!m?.userId) return;
        this.cb.onState(String(m.userId), {
          ...(typeof m.muted === "boolean" ? { muted: m.muted } : {}),
          ...(typeof m.deafened === "boolean" ? { deafened: m.deafened } : {}),
          ...(typeof m.streaming === "boolean" ? { streaming: m.streaming } : {}),
        });
      });
    }

    // 3) Kết nối LiveKit room.
    await this.connectRoom(ack.livekit);
  }

  private async connectRoom(creds: LivekitCreds) {
    // AudioContext dùng chung: LiveKit cần nó để bật processor (lọc âm) và để
    // chỉnh âm lượng từng người qua gainNode (mute/volume đáng tin cậy).
    let audioContext: AudioContext | undefined;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AC();
      audioContext = this.audioCtx;
    } catch { this.audioCtx = null; }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      ...(audioContext ? { webAudioMix: { audioContext } } : {}),
    });
    this.room = room;

    room
      .on(RoomEvent.Connected, () => this.cb.onConnected())
      .on(RoomEvent.Disconnected, () => this.cb.onDisconnected())
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => this.cb.onParticipantJoined(metaInfo(p)))
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => this.cb.onParticipantLeft(p.identity))
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          this.sink.attach(p.identity, track as RemoteAudioTrack);
        } else if (track.kind === Track.Kind.Video) {
          const source = pub.source === Track.Source.Camera ? "camera" : "screen";
          this.cb.onVideoTrack(p.identity, track.mediaStreamTrack, source);
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) this.sink.remove(p.identity);
        else if (track.kind === Track.Kind.Video) {
          const source = pub.source === Track.Source.Camera ? "camera" : "screen";
          this.cb.onVideoTrack(p.identity, null, source);
        }
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const ids = new Set(speakers.map((s) => s.identity));
        ids.forEach((id) => this.cb.onSpeaking(id, true));
        room.remoteParticipants.forEach((p) => { if (!ids.has(p.identity)) this.cb.onSpeaking(p.identity, false); });
        this.cb.onSpeaking(this.myUserId, ids.has(this.myUserId));
      })
      .on(RoomEvent.TrackMuted, (_pub, p: Participant) => this.cb.onState(p.identity, { muted: true }))
      .on(RoomEvent.TrackUnmuted, (_pub, p: Participant) => this.cb.onState(p.identity, { muted: false }));

    try {
      await room.connect(creds.url, creds.token);
      // AudioContext có thể ở trạng thái "suspended" → resume để phát + processor chạy.
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        try { await this.audioCtx.resume(); } catch {/* ignore */}
      }
      // LiveKit gọi acquireAudioContext() KHÔNG await trong connect() → audioContext
      // có thể chưa kịp gắn vào localParticipant. Gắn thủ công cho chắc.
      if (this.audioCtx) {
        try { (room.localParticipant as any).setAudioContext?.(this.audioCtx); } catch {/* ignore */}
      }
      const s = getVoiceSettings();
      // QUAN TRỌNG: KHÔNG truyền processor vào setMicrophoneEnabled. LiveKit áp
      // processor NGAY trong lúc tạo track (trước khi gắn audioContext) → luôn
      // ném "Audio context needs to be set...". Vì vậy bật mic trước (không lọc),
      // rồi gắn audioContext + processor lên track sau.
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: s.echoCancellation,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: s.autoGainControl,
        ...(s.inputDeviceId ? { deviceId: { exact: s.inputDeviceId } } : {}),
      });
      if (s.advancedFilter) {
        await this.enableMicFilter(s.filterStrength);
      }
      // áp loa đã chọn cho các track audio (đã/đang gắn).
      if (s.outputDeviceId) this.setOutputDevice(s.outputDeviceId);
    } catch (e: any) {
      this.cb.onError(e?.message || "Kết nối phòng thoại LiveKit thất bại.");
      throw e;
    }
  }

  private bindControlSocket() {
    const s = getVoiceSocket();

    this.unsub.push(onVoice("voice:peers", (e: any) => {
      const peers = Array.isArray(e?.peers) ? e.peers.map(memberToInfo).filter((p: VoiceParticipantInfo) => p.userId) : [];
      this.cb.onParticipantsList([{ userId: this.myUserId }, ...peers.filter((p: VoiceParticipantInfo) => p.userId !== this.myUserId)]);
    }));
    this.unsub.push(onVoice("voice:user-joined", (e: any) => {
      const info = memberToInfo(e?.user ?? e);
      if (info.userId && info.userId !== this.myUserId) this.cb.onParticipantJoined(info);
    }));
    this.unsub.push(onVoice("voice:user-left", (e) => {
      if (e?.userId) this.cb.onParticipantLeft(e.userId);
    }));
    this.unsub.push(onVoice("voice:state-changed", (e) => {
      if (!e?.userId || e.userId === this.myUserId) return;
      if (typeof e.speaking === "boolean") this.cb.onSpeaking(e.userId, e.speaking);
      this.cb.onState(e.userId, {
        ...(typeof e.muted === "boolean" ? { muted: e.muted } : {}),
        ...(typeof e.deafened === "boolean" ? { deafened: e.deafened } : {}),
        ...(typeof e.streaming === "boolean" ? { streaming: e.streaming } : {}),
      });
    }));
    this.unsub.push(onVoice("stream:started", (e) => {
      if (e?.userId) this.cb.onState(e.userId, { streaming: true });
    }));
    this.unsub.push(onVoice("stream:stopped", (e) => {
      if (e?.userId) this.cb.onState(e.userId, { streaming: false });
    }));

    const onConn = () => this.cb.onConnected();
    const onDisc = () => this.cb.onDisconnected();
    s.on("connect", onConn);
    s.on("disconnect", onDisc);
    this.unsub.push(() => { s.off("connect", onConn); s.off("disconnect", onDisc); });
  }

  // ── điều khiển mic / loa ──
  setState({ muted, deafened }: { muted: boolean; deafened: boolean }) {
    this.sink.setDeafened(deafened);
    this.room?.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
    voice.state({ muted, deafened });
  }

  setUserVolume(userId: string, volume: number) {
    this.sink.setUserVolume(userId, volume);
  }

  // Cập nhật độ mạnh lọc âm khi đang nói (nếu processor đang bật).
  setFilterStrength(strength: number) {
    this.micProcessor?.setStrength(strength);
  }

  // Bật/tắt lọc âm nâng cao trên track mic đang publish (gắn sau khi mic đã có
  // audioContext → tránh lỗi "Audio context needs to be set...").
  async enableMicFilter(strength: number): Promise<boolean> {
    if (!this.room) return false;
    try {
      const pub = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const track: any = pub?.track;
      if (!track) return false;
      // đảm bảo track có audioContext dùng chung trước khi gắn processor.
      if (this.audioCtx && typeof track.setAudioContext === "function") {
        track.setAudioContext(this.audioCtx);
      }
      if (!this.micProcessor) this.micProcessor = new NoiseFilterProcessor(strength);
      else this.micProcessor.setStrength(strength);
      await track.setProcessor(this.micProcessor);
      return true;
    } catch (e: any) {
      this.cb.onError(e?.message || "Không bật được lọc âm nâng cao.");
      try { await this.micProcessor?.destroy(); } catch {/* ignore */}
      this.micProcessor = null;
      return false;
    }
  }

  async disableMicFilter() {
    if (!this.room) return;
    try {
      const pub = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const track: any = pub?.track;
      if (track && typeof track.stopProcessor === "function") {
        await track.stopProcessor();
      }
    } catch {/* ignore */}
    try { await this.micProcessor?.destroy(); } catch {/* ignore */}
    this.micProcessor = null;
  }

  setOutputDevice(deviceId: string) {
    // Với webAudioMix, đổi loa nên đi qua room (áp cho cả audio context mix).
    if (this.room && deviceId) {
      this.room.switchActiveDevice("audiooutput", deviceId).catch(() => {
        // fallback: set trực tiếp trên từng track.
        this.sink.setOutputDevice(deviceId);
      });
    } else {
      this.sink.setOutputDevice(deviceId);
    }
  }

  // ── chia sẻ màn hình kiểu Discord (capture qua Rust, không dùng getDisplayMedia) ──
  async startTauriScreenShare(sourceId: string, opts?: { width?: number; height?: number; fps?: number }): Promise<boolean> {
    if (!this.room) return false;
    try {
      const fps = opts?.fps ?? 15;
      const capture = await startTauriCapture({
        sourceId,
        fps,
        maxWidth: opts?.width ?? 1280,
        quality: 60,
      });
      this.tauriCapture = capture;
      // userProvidedTrack = true: track từ canvas, SDK KHÔNG được tự release/reacquire
      // (không thể lấy lại track canvas qua getUserMedia).
      const lkTrack = new LocalVideoTrack(capture.track, undefined, true);
      this.tauriPublished = lkTrack;
      await this.room.localParticipant.publishTrack(lkTrack, { source: Track.Source.ScreenShare });
      this.screenOn = true;
      voice.streamStart("screen");
      return true;
    } catch (e: any) {
      try { await this.tauriCapture?.stop(); } catch {/* ignore */}
      this.tauriCapture = null;
      this.tauriPublished = null;
      this.cb.onError(e?.message || "Không bắt đầu được chia sẻ màn hình.");
      return false;
    }
  }

  // ── chia sẻ màn hình / camera ──
  async startScreenShare(opts?: { width?: number; height?: number; fps?: number; surface?: "monitor" | "window" }): Promise<boolean> {
    if (!this.room) return false;
    try {
      const resolution = opts?.width && opts?.height
        ? { width: opts.width, height: opts.height, frameRate: opts.fps ?? 30 }
        : undefined;
      await this.room.localParticipant.setScreenShareEnabled(true, {
        audio: false,
        ...(resolution ? { resolution } : {}),
        // gợi ý loại bề mặt để hộp thoại native mở sẵn đúng tab.
        ...(opts?.surface ? { video: { displaySurface: opts.surface } } as any : {}),
        contentHint: "detail",
      } as any);
      this.screenOn = true;
      voice.streamStart("screen");
      return true;
    } catch (e: any) {
      // người dùng huỷ chọn cửa sổ → không phải lỗi cần báo
      if (e?.name !== "NotAllowedError") this.cb.onError(e?.message || "Không bắt đầu được chia sẻ màn hình.");
      return false;
    }
  }

  async startCamera(): Promise<boolean> {
    if (!this.room) return false;
    try {
      await this.room.localParticipant.setCameraEnabled(true);
      this.cameraOn = true;
      voice.streamStart("camera");
      return true;
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") this.cb.onError(e?.message || "Không bật được camera.");
      return false;
    }
  }

  async stopStream() {
    if (!this.room) return;
    try {
      // Capture qua Rust (Tauri) → unpublish + dừng capture.
      if (this.tauriPublished) {
        try { await this.room.localParticipant.unpublishTrack(this.tauriPublished); } catch {/* ignore */}
        this.tauriPublished = null;
      }
      if (this.tauriCapture) {
        try { await this.tauriCapture.stop(); } catch {/* ignore */}
        this.tauriCapture = null;
      }
      if (this.cameraOn) await this.room.localParticipant.setCameraEnabled(false);
    } catch {/* ignore */}
    const wasStreaming = this.screenOn || this.cameraOn;
    this.screenOn = false;
    this.cameraOn = false;
    if (wasStreaming) voice.streamStop();
  }

  isStreaming() { return this.screenOn || this.cameraOn; }

  // Lấy video track local đang publish (để hiện preview của chính mình).
  getLocalVideoTrack(): MediaStreamTrack | null {
    if (this.tauriCapture?.track) return this.tauriCapture.track;
    if (!this.room) return null;
    const pubs = this.room.localParticipant.videoTrackPublications;
    for (const pub of pubs.values()) {
      if (pub.track?.mediaStreamTrack) return pub.track.mediaStreamTrack;
    }
    return null;
  }

  async leave() {
    if (this.channelId) voice.leave(this.channelId);
    await this.cleanup();
  }

  private async cleanup() {
    this.unsub.forEach((u) => { try { u(); } catch {/* ignore */} });
    this.unsub = [];
    try { await this.tauriCapture?.stop(); } catch {/* ignore */}
    this.tauriCapture = null;
    this.tauriPublished = null;
    try { await this.room?.disconnect(); } catch {/* ignore */}
    this.room = null;
    try { await this.micProcessor?.destroy(); } catch {/* ignore */}
    this.micProcessor = null;
    this.sink.clear();
    try { await this.audioCtx?.close(); } catch {/* ignore */}
    this.audioCtx = null;
    this.screenOn = false;
    this.cameraOn = false;
    this.channelId = null;
  }

  destroy() {
    this.cleanup();
    disconnectVoice();
  }
}
