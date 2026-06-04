"use client";

// ── Âm thanh thông báo (tin nhắn / ví xu) ────────────────────────────────────
// Tổng hợp bằng Web Audio API — không cần file asset. Mỗi sự kiện một mô-típ
// nốt riêng để phân biệt.

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

function playSeq(notes: Array<{ f: number; t: number; d: number; type?: OscillatorType }>, gainPeak = 0.1) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = 1;
  master.connect(ac.destination);
  notes.forEach(({ f, t, d, type }) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.value = f;
    const start = now + t;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + d);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + d + 0.02);
  });
  const total = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0);
  window.setTimeout(() => { try { master.disconnect(); } catch {/* ignore */} }, (total + 0.1) * 1000);
}

/** Tin nhắn mới đến — "ting" hai nốt nhẹ nhàng. */
export function playMessageSound() {
  playSeq([
    { f: 880, t: 0, d: 0.08 },
    { f: 1174.66, t: 0.07, d: 0.12 },
  ], 0.07);
}

/** Nhận được tiền/xu — bộ ba đi lên tươi vui (kiểu "coin"). */
export function playCoinReceiveSound() {
  playSeq([
    { f: 783.99, t: 0, d: 0.09 },
    { f: 1046.5, t: 0.07, d: 0.09 },
    { f: 1318.51, t: 0.14, d: 0.16 },
  ], 0.1);
}

/** Chuyển tiền thành công — hai nốt khẳng định. */
export function playTransferSuccessSound() {
  playSeq([
    { f: 659.25, t: 0, d: 0.1 },
    { f: 987.77, t: 0.09, d: 0.16 },
  ], 0.09);
}

/** Chuyển tiền thất bại — hai nốt đi xuống, hơi "buzz". */
export function playTransferFailSound() {
  playSeq([
    { f: 392, t: 0, d: 0.12, type: "triangle" },
    { f: 261.63, t: 0.1, d: 0.2, type: "triangle" },
  ], 0.09);
}
