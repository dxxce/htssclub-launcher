"use client";

// ── Kiểu dữ liệu & tiện ích chung cho thoại (LiveKit-only) ───────────────────

export interface VoiceParticipantInfo {
  userId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
}

// ── Quản lý phần tử <audio> ẩn để phát stream từ xa ──────────────────────────
export class AudioSink {
  private els = new Map<string, HTMLAudioElement>();
  private deafened = false;
  private volumes = new Map<string, number>(); // âm lượng riêng từng user (0..1)
  private outputDeviceId = ""; // thiết bị loa (setSinkId)

  attach(userId: string, stream: MediaStream) {
    let el = this.els.get(userId);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.dataset.voiceUser = userId;
      (el as any).playsInline = true;
      el.style.display = "none";
      document.body.appendChild(el);
      this.els.set(userId, el);
    }
    el.srcObject = stream;
    el.muted = this.deafened;
    const vol = this.volumes.get(userId);
    if (typeof vol === "number") el.volume = Math.min(1, Math.max(0, vol));
    this.applySink(el);
    el.play().catch(() => {/* cần tương tác người dùng — đã có khi bấm join */});
  }

  private applySink(el: HTMLAudioElement) {
    if (this.outputDeviceId && typeof (el as any).setSinkId === "function") {
      (el as any).setSinkId(this.outputDeviceId).catch(() => {/* ignore */});
    }
  }

  setOutputDevice(deviceId: string) {
    this.outputDeviceId = deviceId || "";
    this.els.forEach((el) => this.applySink(el));
  }

  remove(userId: string) {
    const el = this.els.get(userId);
    if (el) {
      try {
        el.srcObject = null;
        el.remove();
      } catch {/* ignore */}
      this.els.delete(userId);
    }
  }

  setDeafened(d: boolean) {
    this.deafened = d;
    this.els.forEach((el) => (el.muted = d));
  }

  setUserVolume(userId: string, volume: number) {
    const v = Math.min(1, Math.max(0, volume));
    this.volumes.set(userId, v);
    const el = this.els.get(userId);
    if (el) el.volume = v;
  }

  getUserVolume(userId: string): number {
    const v = this.volumes.get(userId);
    return typeof v === "number" ? v : 1;
  }

  clear() {
    this.els.forEach((el) => {
      try {
        el.srcObject = null;
        el.remove();
      } catch {/* ignore */}
    });
    this.els.clear();
    this.volumes.clear();
  }
}
