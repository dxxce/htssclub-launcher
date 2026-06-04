"use client";

import type { Track, TrackProcessor, AudioProcessorOptions } from "livekit-client";

// ── Bộ lọc âm nâng cao (kiểu "Krisp" nhẹ) ────────────────────────────────────
// WebView không có model AI khử ồn như Krisp thật, nên dùng Web Audio API dựng
// một chuỗi xử lý thực tế và mạnh hơn bản cũ:
//   1) High-pass: cắt ầm tần số thấp (quạt, máy lạnh, rung bàn).
//   2) Low-pass nhẹ: bỏ rít tần số rất cao.
//   3) Noise gate THÍCH NGHI: tự ước lượng "sàn ồn" nền theo thời gian, mở cổng
//      khi mức âm vượt sàn ồn một biên (hysteresis) → bám giọng nói tốt hơn,
//      ít cắt cụt từ, ít "phập phù" khi im lặng.
//   4) DynamicsCompressor: nén nhẹ cho giọng đều, rõ.
// Đầu vào là MediaStream/MediaStreamTrack từ mic, đầu ra là track đã lọc.

interface FilterChain {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  dest: MediaStreamAudioDestinationNode;
  gate: GainNode;
  analyser: AnalyserNode;
  raf: number;
}

export class NoiseFilter {
  private chain: FilterChain | null = null;
  private data: Float32Array<ArrayBuffer>;
  private open = false;
  private lastOpenAt = 0;
  // sàn ồn nền ước lượng (RMS), khởi tạo nhỏ rồi tự thích nghi.
  private noiseFloor = 0.005;

  // strength 0..100 → độ nhạy noise gate. Càng cao càng mạnh tay cắt ồn.
  constructor(private strength = 55) {
    this.data = new Float32Array(new ArrayBuffer(4));
  }

  /** Tạo stream đã lọc từ stream mic gốc. Trả về stream mới (1 audio track). */
  process(input: MediaStream): MediaStream {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC();
    return this.build(ctx, ctx.createMediaStreamSource(input)).dest.stream;
  }

  /** Dựng chuỗi lọc trên 1 AudioContext + nguồn cho sẵn (dùng cho processor). */
  private build(ctx: AudioContext, source: MediaStreamAudioSourceNode): FilterChain {
    this.destroy();

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 100; // cắt dưới ~100Hz (ù nền)
    hp.Q.value = 0.7;

    // notch nhẹ quanh 50/60Hz đã nằm dưới highpass nên bỏ qua.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 12000; // bỏ rít tần số cao

    const gate = ctx.createGain();
    gate.gain.value = 0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -28;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    this.data = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

    const dest = ctx.createMediaStreamDestination();

    // chuỗi phát: source → hp → lp → gate → comp → dest
    // nhánh đo:   lp → analyser (điều khiển gate)
    source.connect(hp);
    hp.connect(lp);
    lp.connect(gate);
    gate.connect(comp);
    comp.connect(dest);
    lp.connect(analyser);

    this.open = false;
    this.lastOpenAt = 0;
    this.noiseFloor = 0.005;

    const chain: FilterChain = { ctx, source, dest, gate, analyser, raf: 0 };
    this.chain = chain;
    this.loop();
    return chain;
  }

  // strength 0..100 → hệ số biên trên sàn ồn để MỞ cổng (2.0..6.0).
  private openFactor() {
    const s = Math.max(0, Math.min(100, this.strength)) / 100;
    return 2.0 + s * 4.0;
  }

  private rms(): number {
    const a = this.chain?.analyser;
    if (!a) return 0;
    a.getFloatTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      sum += v * v;
    }
    return Math.sqrt(sum / this.data.length);
  }

  private loop = () => {
    const chain = this.chain;
    if (!chain) return;
    const level = this.rms();
    const now = performance.now();

    const openThresh = this.noiseFloor * this.openFactor();
    const closeThresh = openThresh * 0.6; // hysteresis: đóng ở mức thấp hơn

    if (level > openThresh) {
      this.open = true;
      this.lastOpenAt = now;
    } else if (this.open && level < closeThresh && now - this.lastOpenAt > 200) {
      // im đủ lâu (hold 200ms) → đóng cổng
      this.open = false;
    }

    // Cập nhật sàn ồn CHỈ khi cổng đóng (đang là nền) → thích nghi dần.
    if (!this.open) {
      // EMA: kéo sàn ồn về mức hiện tại từ từ.
      this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05;
      // chặn trần để không "điếc" khi ồn to liên tục.
      this.noiseFloor = Math.min(this.noiseFloor, 0.08);
    }

    const target = this.open ? 1 : 0;
    try {
      // mở nhanh (attack 8ms), đóng mượt (release 60ms) để không "pop"/cụt từ.
      const tc = this.open ? 0.008 : 0.06;
      chain.gate.gain.setTargetAtTime(target, chain.ctx.currentTime, tc);
    } catch {
      chain.gate.gain.value = target;
    }
    chain.raf = requestAnimationFrame(this.loop);
  };

  setStrength(strength: number) {
    this.strength = strength;
  }

  destroy() {
    const chain = this.chain;
    if (!chain) return;
    if (chain.raf) cancelAnimationFrame(chain.raf);
    try {
      chain.source.disconnect();
      chain.gate.disconnect();
      chain.analyser.disconnect();
      chain.dest.disconnect();
      // đóng ctx chỉ khi do chính ta tạo trong process(); processor tự quản ctx.
    } catch {/* ignore */}
    this.chain = null;
  }

  /** Đóng cả AudioContext (chỉ dùng khi process() tự tạo ctx). */
  dispose() {
    const ctx = this.chain?.ctx;
    this.destroy();
    try { ctx?.close(); } catch {/* ignore */}
  }
}

// ── LiveKit TrackProcessor: gắn NoiseFilter vào đường mic publish ────────────
// LiveKit gọi init() với { track, audioContext } → ta dựng chuỗi lọc trên
// audioContext của SDK và trả về processedTrack đã lọc.
export class NoiseFilterProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = "htss-noise-filter";
  processedTrack?: MediaStreamTrack;
  private filter: NoiseFilter;
  private ctx?: AudioContext;
  private ownCtx = false;

  constructor(strength = 55) {
    this.filter = new NoiseFilter(strength);
  }

  async init(opts: AudioProcessorOptions) {
    const ctx = opts.audioContext || new AudioContext();
    this.ownCtx = !opts.audioContext;
    this.ctx = ctx;
    const source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
    // dùng build() qua process-like: tạo chuỗi và lấy track ra.
    const stream = (this.filter as any).build(ctx, source).dest.stream as MediaStream;
    this.processedTrack = stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions) {
    await this.destroy();
    await this.init(opts);
  }

  setStrength(strength: number) {
    this.filter.setStrength(strength);
  }

  async destroy() {
    this.filter.destroy();
    if (this.ownCtx) { try { await this.ctx?.close(); } catch {/* ignore */} }
    this.ctx = undefined;
    this.processedTrack = undefined;
  }
}
