// ============================================================================
//  Real-time pitch shifter for live audio (Web Audio only, no AudioWorklet).
//  Based on the well-known delay-line "Jungle" pitch shifter (two modulated
//  delay lines crossfaded together). Works reliably in Chromium / WebView2.
// ============================================================================

const DELAY_TIME = 0.1;
const FADE_TIME = 0.05;
const BUFFER_TIME = 0.1;

function createFadeBuffer(ctx: AudioContext, activeTime: number, fadeTime: number): AudioBuffer {
  const length1 = activeTime * ctx.sampleRate;
  const length2 = (activeTime - 2 * fadeTime) * ctx.sampleRate;
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const p = buffer.getChannelData(0);
  const fadeLength = fadeTime * ctx.sampleRate;
  const fadeIndex1 = fadeLength;
  const fadeIndex2 = length1 - fadeLength;

  for (let i = 0; i < length1; ++i) {
    let value: number;
    if (i < fadeIndex1) value = Math.sqrt(i / fadeLength);
    else if (i >= fadeIndex2) value = Math.sqrt(1 - (i - fadeIndex2) / fadeLength);
    else value = 1.0;
    p[i] = value;
  }
  for (let i = length1; i < length; ++i) p[i] = 0;
  return buffer;
}

function createDelayTimeBuffer(ctx: AudioContext, activeTime: number, fadeTime: number, shiftUp: boolean): AudioBuffer {
  const length1 = activeTime * ctx.sampleRate;
  const length2 = (activeTime - 2 * fadeTime) * ctx.sampleRate;
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const p = buffer.getChannelData(0);

  for (let i = 0; i < length1; ++i) {
    if (shiftUp) p[i] = (length1 - i) / length;
    else p[i] = i / length1;
  }
  for (let i = length1; i < length; ++i) p[i] = 0;
  return buffer;
}

export class Jungle {
  readonly input: GainNode;
  readonly output: GainNode;

  private ctx: AudioContext;
  private mod1Gain: GainNode;
  private mod2Gain: GainNode;
  private mod3Gain: GainNode;
  private mod4Gain: GainNode;
  private modGain1: GainNode;
  private modGain2: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Delay modulation sources (sawtooth ramps from buffers)
    const mod1 = ctx.createBufferSource();
    const mod2 = ctx.createBufferSource();
    const mod3 = ctx.createBufferSource();
    const mod4 = ctx.createBufferSource();
    const shiftDownBuffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, false);
    const shiftUpBuffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, true);
    mod1.buffer = shiftDownBuffer;
    mod2.buffer = shiftDownBuffer;
    mod3.buffer = shiftUpBuffer;
    mod4.buffer = shiftUpBuffer;
    mod1.loop = true; mod2.loop = true; mod3.loop = true; mod4.loop = true;

    this.mod1Gain = ctx.createGain();
    this.mod2Gain = ctx.createGain();
    this.mod3Gain = ctx.createGain();
    this.mod3Gain.gain.value = 0;
    this.mod4Gain = ctx.createGain();
    this.mod4Gain.gain.value = 0;

    mod1.connect(this.mod1Gain);
    mod2.connect(this.mod2Gain);
    mod3.connect(this.mod3Gain);
    mod4.connect(this.mod4Gain);

    // Delay lines
    const delay1 = ctx.createDelay();
    const delay2 = ctx.createDelay();
    this.mod1Gain.connect(delay1.delayTime);
    this.mod3Gain.connect(delay1.delayTime);
    this.mod2Gain.connect(delay2.delayTime);
    this.mod4Gain.connect(delay2.delayTime);

    // Crossfade between the two delay lines
    const fade1 = ctx.createBufferSource();
    const fade2 = ctx.createBufferSource();
    const fadeBuffer = createFadeBuffer(ctx, BUFFER_TIME, FADE_TIME);
    fade1.buffer = fadeBuffer;
    fade2.buffer = fadeBuffer;
    fade1.loop = true; fade2.loop = true;

    this.modGain1 = ctx.createGain();
    this.modGain2 = ctx.createGain();
    this.modGain1.gain.value = 0;
    this.modGain2.gain.value = 0;
    fade1.connect(this.modGain1.gain);
    fade2.connect(this.modGain2.gain);

    this.input.connect(delay1);
    this.input.connect(delay2);
    delay1.connect(this.modGain1);
    delay2.connect(this.modGain2);
    this.modGain1.connect(this.output);
    this.modGain2.connect(this.output);

    const t = ctx.currentTime + 0.05;
    const t2 = t + BUFFER_TIME - FADE_TIME;
    mod1.start(t); mod2.start(t2); mod3.start(t); mod4.start(t2);
    fade1.start(t); fade2.start(t2);

    this.sources = [mod1, mod2, mod3, mod4, fade1, fade2];
    this.started = true;

    this.setDelay(DELAY_TIME);
  }

  private setDelay(delayTime: number) {
    this.mod1Gain.gain.setTargetAtTime(0.5 * delayTime, this.ctx.currentTime, 0.01);
    this.mod2Gain.gain.setTargetAtTime(0.5 * delayTime, this.ctx.currentTime, 0.01);
    this.mod3Gain.gain.setTargetAtTime(0.5 * delayTime, this.ctx.currentTime, 0.01);
    this.mod4Gain.gain.setTargetAtTime(0.5 * delayTime, this.ctx.currentTime, 0.01);
  }

  /**
   * Set the pitch offset. `mult` in roughly [-1, 1]:
   *  - mult > 0 → pitch up
   *  - mult < 0 → pitch down
   *  - 0 → no change
   */
  setPitchOffset(mult: number) {
    if (mult > 0) {
      this.mod1Gain.gain.value = 0;
      this.mod2Gain.gain.value = 0;
      this.mod3Gain.gain.value = 1;
      this.mod4Gain.gain.value = 1;
    } else {
      this.mod1Gain.gain.value = 1;
      this.mod2Gain.gain.value = 1;
      this.mod3Gain.gain.value = 0;
      this.mod4Gain.gain.value = 0;
    }
    this.setDelay(DELAY_TIME * Math.abs(mult));
  }

  dispose() {
    if (!this.started) return;
    this.started = false;
    for (const s of this.sources) {
      try { s.stop(); } catch { /* ignore */ }
      try { s.disconnect(); } catch { /* ignore */ }
    }
    try { this.input.disconnect(); } catch { /* ignore */ }
    try { this.output.disconnect(); } catch { /* ignore */ }
  }
}

/** Convert semitones to a Jungle pitch multiplier (±12 semitones ≈ ±1 octave). */
export function semitonesToMult(semitones: number): number {
  return Math.max(-1, Math.min(1, semitones / 12));
}
