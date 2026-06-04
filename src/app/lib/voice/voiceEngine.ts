"use client";

import type { RemoteAudioTrack } from "livekit-client";

// ── Kiểu dữ liệu & tiện ích chung cho thoại (LiveKit-only) ───────────────────

export interface VoiceParticipantInfo {
  userId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
}

// ── Quản lý phát âm thanh từ xa qua LiveKit RemoteAudioTrack ─────────────────
// Dùng API gốc của LiveKit (track.attach / setVolume / setSinkId) thay vì tự
// tạo <audio> + gán srcObject. Cách này đáng tin cậy hơn: chỉnh âm lượng riêng
// từng người và "tắt tiếng" (volume 0) rồi chỉnh lại đều ăn ngay, không bị kẹt.
export class AudioSink {
  private tracks = new Map<string, RemoteAudioTrack>();
  private els = new Map<string, HTMLMediaElement>();
  private deafened = false;
  private volumes = new Map<string, number>(); // âm lượng riêng từng user (0..1)
  private outputDeviceId = ""; // thiết bị loa (setSinkId)

  /** Gắn 1 audio track từ xa của user. Truyền RemoteAudioTrack của LiveKit. */
  attach(userId: string, track: RemoteAudioTrack) {
    // nếu đã có track cũ → gỡ trước
    const old = this.tracks.get(userId);
    if (old && old !== track) {
      try { old.detach(); } catch {/* ignore */}
    }
    this.tracks.set(userId, track);

    // LiveKit tự tạo + quản lý <audio>, tự autoplay.
    const el = track.attach();
    (el as HTMLAudioElement).autoplay = true;
    el.dataset.voiceUser = userId;
    this.els.set(userId, el);

    if (this.outputDeviceId) {
      track.setSinkId(this.outputDeviceId).catch(() => {/* ignore */});
    }
    this.applyVolume(userId);
  }

  private applyVolume(userId: string) {
    const track = this.tracks.get(userId);
    if (!track) return;
    const base = this.volumes.get(userId);
    const vol = typeof base === "number" ? base : 1;
    // điếc (deafen) → 0 cho tất cả; còn lại theo âm lượng riêng.
    try { track.setVolume(this.deafened ? 0 : vol); } catch {/* ignore */}
  }

  setOutputDevice(deviceId: string) {
    this.outputDeviceId = deviceId || "";
    if (!this.outputDeviceId) return;
    this.tracks.forEach((track) => {
      track.setSinkId(this.outputDeviceId).catch(() => {/* ignore */});
    });
  }

  remove(userId: string) {
    const track = this.tracks.get(userId);
    if (track) {
      try { track.detach(); } catch {/* ignore */}
      this.tracks.delete(userId);
    }
    this.els.delete(userId);
  }

  setDeafened(d: boolean) {
    this.deafened = d;
    this.tracks.forEach((_t, userId) => this.applyVolume(userId));
  }

  setUserVolume(userId: string, volume: number) {
    const v = Math.min(1, Math.max(0, volume));
    this.volumes.set(userId, v);
    this.applyVolume(userId);
  }

  getUserVolume(userId: string): number {
    const v = this.volumes.get(userId);
    return typeof v === "number" ? v : 1;
  }

  clear() {
    this.tracks.forEach((track) => {
      try { track.detach(); } catch {/* ignore */}
    });
    this.tracks.clear();
    this.els.clear();
    // giữ lại volumes để lần sau vào vẫn nhớ mức từng người? → xoá cho sạch phiên.
    this.volumes.clear();
    this.deafened = false;
  }
}
