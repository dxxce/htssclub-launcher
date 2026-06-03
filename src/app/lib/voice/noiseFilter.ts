"use client";

// ── Bộ lọc âm nâng cao (kiểu "Krisp" nhẹ) ────────────────────────────────────
// Trình duyệt/WebView không có sẵn model AI khử ồn như Krisp thật, nên ở đây
// dùng Web Audio API để dựng một chuỗi xử lý thực tế:
//   1) High-pass filter: cắt ầm ầm tần số thấp (quạt, máy lạnh, rung bàn).
//   2) Low-pass nhẹ: bỏ tạp âm rít tần số rất cao.
//   3) Noise gate (qua AnalyserNode + GainNode): khi âm lượng dưới ngưỡng (im
//      lặng/ồn nền) thì hạ gain về ~0 để không truyền tạp âm; khi nói thì mở.
// Đầu vào là MediaStream từ mic, đầu ra là MediaStream đã lọc để publish.

export class NoiseFilter {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private hp: BiquadFilterNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private gate: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private data: Uint8Array<ArrayBuffer>;
  private raf = 0;
  private open = false;
  private lastOpenAt = 0;

  // strength 0..100 → ngưỡng noise gate. Càng cao càng mạnh tay cắt ồn.
  constructor(private strength = 55) {
    this.data = new Uint8Array(new ArrayBuffer(1));
  }

  /** Tạo stream đã lọc từ stream mic gốc. Trả về stream mới (1 audio track). */
  process(input: MediaStream): MediaStream {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.source = this.ctx.createMediaStreamSource(input);

    this.hp = this.ctx.createBiquadFilter();
    this.hp.type = "highpass";
    this.hp.frequency.value = 110; // cắt dưới ~110Hz (tiếng ù nền)

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 12000; // bỏ rít tần số cao

    this.gate = this.ctx.createGain();
    this.gate.gain.value = 1;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.5;
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    this.dest = this.ctx.createMediaStreamDestination();

    // chuỗi: source → hp → lp → gate → dest
    //        source → hp → lp → analyser (nhánh đo để điều khiển gate)
    this.source.connect(this.hp);
    this.hp.connect(this.lp);
    this.lp.connect(this.gate);
    this.gate.connect(this.dest);
    this.lp.connect(this.analyser);

    this.loop();
    return this.dest.stream;
  }

  private thresholdValue() {
    // strength 0..100 → ngưỡng âm lượng trung bình 4..28
    return 4 + (Math.max(0, Math.min(100, this.strength)) / 100) * 24;
  }

  private loop = () => {
    if (!this.analyser || !this.gate || !this.ctx) return;
    this.analyser.getByteFrequencyData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) sum += this.data[i];
    const avg = sum / this.data.length;
    const now = performance.now();
    const threshold = this.thresholdValue();

    if (avg > threshold) {
      // có tiếng nói → mở cổng
      this.open = true;
      this.lastOpenAt = now;
    } else if (this.open && now - this.lastOpenAt > 250) {
      // im lặng đủ lâu → đóng cổng (hold 250ms tránh cắt cụt từ)
      this.open = false;
    }

    const target = this.open ? 1 : 0;
    // ramp mượt để tránh "pop"
    try {
      this.gate.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    } catch {
      this.gate.gain.value = target;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  setStrength(strength: number) {
    this.strength = strength;
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    try {
      this.source?.disconnect();
      this.hp?.disconnect();
      this.lp?.disconnect();
      this.gate?.disconnect();
      this.analyser?.disconnect();
      this.dest?.disconnect();
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.source = null;
    this.hp = null;
    this.lp = null;
    this.gate = null;
    this.analyser = null;
    this.dest = null;
  }
}
