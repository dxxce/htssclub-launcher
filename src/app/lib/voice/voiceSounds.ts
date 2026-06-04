"use client";

// ── Hiệu ứng âm thanh cho thoại (join / leave / stream) ──────────────────────
// Không dùng file asset — tổng hợp tiếng "blip" ngắn bằng Web Audio API để gọn
// nhẹ và không cần tải thêm. Mỗi sự kiện một mô-típ nốt riêng cho dễ phân biệt.

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

// Phát chuỗi nốt: mỗi nốt {f: Hz, t: thời điểm bắt đầu (s), d: kéo dài (s)}.
function playSequence(notes: Array<{ f: number; t: number; d: number }>, gainPeak = 0.12) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = 1;
  master.connect(ac.destination);

  notes.forEach(({ f, t, d }) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    // bao biên (ADSR rút gọn): lên nhanh, xuống mượt.
    const start = now + t;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + d);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + d + 0.02);
  });

  // dọn master sau khi xong.
  const total = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0);
  window.setTimeout(() => { try { master.disconnect(); } catch {/* ignore */} }, (total + 0.1) * 1000);
}

/** Mình hoặc người khác VÀO phòng — đi lên (C5 → G5), tươi. */
export function playJoinSound() {
  playSequence([
    { f: 523.25, t: 0, d: 0.12 },
    { f: 783.99, t: 0.09, d: 0.16 },
  ]);
}

/** RỜI phòng — đi xuống (G5 → C5), trầm dần. */
export function playLeaveSound() {
  playSequence([
    { f: 783.99, t: 0, d: 0.12 },
    { f: 523.25, t: 0.09, d: 0.18 },
  ]);
}

/** Bắt đầu LIVE/chia sẻ — bộ ba đi lên (C5 → E5 → G5), rộn ràng. */
export function playStreamStartSound() {
  playSequence([
    { f: 523.25, t: 0, d: 0.1 },
    { f: 659.25, t: 0.08, d: 0.1 },
    { f: 783.99, t: 0.16, d: 0.18 },
  ], 0.1);
}

/** Dừng chia sẻ — hai nốt đi xuống nhẹ. */
export function playStreamStopSound() {
  playSequence([
    { f: 659.25, t: 0, d: 0.1 },
    { f: 440.0, t: 0.08, d: 0.16 },
  ], 0.09);
}
