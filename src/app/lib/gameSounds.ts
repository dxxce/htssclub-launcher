"use client";

// ── Âm thanh cho game (Caro / Tiến Lên) ──────────────────────────────────────
// Tổng hợp bằng Web Audio API, mô-típ riêng để KHÁC hẳn âm thông báo/ví.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {/* ignore */});
    return ctx;
  } catch {
    return null;
  }
}

interface Note { f: number; t: number; d: number; type?: OscillatorType; g?: number }

function playSeq(notes: Note[], gainPeak = 0.12) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = 1;
  master.connect(ac.destination);
  notes.forEach(({ f, t, d, type, g }) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.value = f;
    const start = now + t;
    const peak = g ?? gainPeak;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + d + 0.02);
  });
  const total = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0);
  window.setTimeout(() => { try { master.disconnect(); } catch {/* ignore */} }, (total + 0.1) * 1000);
}

// Tiếng "noise" ngắn (dùng cho hiệu ứng đặt quân / lá bài).
function playClick(freq = 320, dur = 0.05, type: OscillatorType = "square", gainPeak = 0.05) {
  playSeq([{ f: freq, t: 0, d: dur, type, g: gainPeak }]);
}

/** Tìm thấy trận / được ghép cặp — fanfare 3 nốt đi lên dứt khoát. */
export function playMatchFoundSound() {
  playSeq([
    { f: 523.25, t: 0, d: 0.12, type: "triangle" },
    { f: 698.46, t: 0.1, d: 0.12, type: "triangle" },
    { f: 1046.5, t: 0.2, d: 0.22, type: "triangle" },
  ], 0.13);
}

/** Có người vào phòng / hàng chờ — "blip" đôi nhẹ. */
export function playPlayerJoinSound() {
  playSeq([
    { f: 587.33, t: 0, d: 0.07, type: "sine" },
    { f: 880, t: 0.06, d: 0.1, type: "sine" },
  ], 0.07);
}

/** Có người rời — "blip" đi xuống. */
export function playPlayerLeaveSound() {
  playSeq([
    { f: 587.33, t: 0, d: 0.07, type: "sine" },
    { f: 392, t: 0.06, d: 0.1, type: "sine" },
  ], 0.06);
}

/** Tới lượt mình — 2 nốt chuông trong trẻo. */
export function playYourTurnSound() {
  playSeq([
    { f: 988, t: 0, d: 0.08, type: "sine" },
    { f: 1318.51, t: 0.08, d: 0.14, type: "sine" },
  ], 0.08);
}

/** Đặt quân cờ / đánh bài — tiếng gõ ngắn. */
export function playMoveSound() {
  playClick(300, 0.05, "square", 0.05);
}

/** Đánh ra bộ bài — "swish" 2 nốt nhanh. */
export function playCardPlaySound() {
  playSeq([
    { f: 440, t: 0, d: 0.05, type: "triangle" },
    { f: 660, t: 0.04, d: 0.07, type: "triangle" },
  ], 0.06);
}

/** Chặt heo — tiếng "bùm" mạnh, kịch tính. */
export function playChopSound() {
  playSeq([
    { f: 196, t: 0, d: 0.16, type: "sawtooth", g: 0.12 },
    { f: 130.81, t: 0.08, d: 0.22, type: "sawtooth", g: 0.12 },
    { f: 98, t: 0.18, d: 0.28, type: "square", g: 0.1 },
  ]);
}

/** Thắng — khải hoàn 4 nốt đi lên (major arpeggio + nốt cao). */
export function playWinSound() {
  playSeq([
    { f: 523.25, t: 0, d: 0.14, type: "triangle" },
    { f: 659.25, t: 0.13, d: 0.14, type: "triangle" },
    { f: 783.99, t: 0.26, d: 0.14, type: "triangle" },
    { f: 1046.5, t: 0.39, d: 0.34, type: "triangle" },
    { f: 1318.51, t: 0.5, d: 0.34, type: "sine" },
  ], 0.14);
}

/** Thua — 3 nốt trầm đi xuống, buồn. */
export function playLoseSound() {
  playSeq([
    { f: 440, t: 0, d: 0.18, type: "triangle" },
    { f: 349.23, t: 0.16, d: 0.2, type: "triangle" },
    { f: 261.63, t: 0.34, d: 0.4, type: "triangle" },
  ], 0.1);
}

/** Hoà — 2 nốt bằng phẳng trung tính. */
export function playDrawSound() {
  playSeq([
    { f: 523.25, t: 0, d: 0.16, type: "sine" },
    { f: 523.25, t: 0.18, d: 0.22, type: "sine" },
  ], 0.09);
}
