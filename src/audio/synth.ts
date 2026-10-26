import type { WorldConfig } from '../game/types';

/** Tiny Web Audio synthesizer: engine, drift hiss, SFX and a procedural synthwave loop. No audio files. */
class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private engOsc?: OscillatorNode;
  private engOsc2?: OscillatorNode;
  private engGain?: GainNode;
  private engFilter?: BiquadFilterNode;
  private driftSrc?: AudioBufferSourceNode;
  private driftGain?: GainNode;
  private musicTimer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private world: WorldConfig | null = null;
  muted = false;
  private lastBump = 0;

  /** Must be called from a user gesture (iOS Safari). */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // ---- engine + drift ----
  startEngine(): void {
    const ctx = this.ctx;
    if (!ctx || this.engOsc) return;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 500;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.0001;
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.engOsc.connect(this.engFilter);
    this.engOsc2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.sfxBus);
    this.engOsc.start();
    this.engOsc2.start();

    this.driftGain = ctx.createGain();
    this.driftGain.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.8;
    this.driftSrc = ctx.createBufferSource();
    this.driftSrc.buffer = this.noise;
    this.driftSrc.loop = true;
    this.driftSrc.connect(bp).connect(this.driftGain).connect(this.sfxBus);
    this.driftSrc.start();
  }

  updateEngine(speedPct: number, drifting: boolean, boosting: boolean, fallen: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.engOsc || !this.engOsc2 || !this.engGain || !this.engFilter || !this.driftGain) return;
    const t = ctx.currentTime;
    const f = 55 + speedPct * 150 + (boosting ? 40 : 0);
    this.engOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(350 + speedPct * 1400 + (boosting ? 900 : 0), t, 0.08);
    this.engGain.gain.setTargetAtTime(fallen ? 0.0001 : 0.07 + speedPct * 0.07, t, 0.08);
    this.driftGain.gain.setTargetAtTime(drifting ? 0.16 : 0, t, 0.04);
  }

  stopEngine(): void {
    try {
      this.engOsc?.stop();
      this.engOsc2?.stop();
      this.driftSrc?.stop();
    } catch {
      /* already stopped */
    }
    this.engOsc = this.engOsc2 = undefined;
    this.driftSrc = undefined;
  }

  // ---- sfx ----
  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, slideTo?: number, when = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  beep(final = false): void {
    this.tone(final ? 880 : 440, final ? 0.5 : 0.18, 'square', 0.18);
  }
  boost(level: number): void {
    this.tone(220, 0.5, 'sawtooth', 0.18, 880 + level * 300);
    this.burst(0.4, 3000, 0.15);
  }
  driftLevel(level: number): void {
    this.tone(level === 1 ? 660 : 990, 0.12, 'triangle', 0.18);
  }
  pad(): void {
    this.tone(330, 0.35, 'sawtooth', 0.15, 1320);
  }
  pickup(): void {
    this.tone(660, 0.12, 'triangle', 0.2, 990);
    this.tone(990, 0.15, 'triangle', 0.15, 1320, 0.08);
  }
  shoot(): void {
    this.burst(0.3, 2500, 0.25);
    this.tone(500, 0.3, 'sawtooth', 0.12, 120);
  }
  bump(): void {
    const now = performance.now();
    if (now - this.lastBump < 200) return;
    this.lastBump = now;
    this.burst(0.15, 700, 0.35);
    this.tone(120, 0.15, 'square', 0.15, 60);
  }
  hit(): void {
    this.burst(0.35, 1200, 0.4);
    this.tone(200, 0.35, 'sawtooth', 0.2, 50);
  }
  fall(): void {
    this.tone(600, 0.9, 'sine', 0.2, 60);
  }
  lap(): void {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.2, undefined, i * 0.09));
  }
  finish(win: boolean): void {
    const notes = win ? [523, 659, 784, 1046, 1318] : [440, 392, 349, 330];
    notes.forEach((f, i) => this.tone(f, 0.22, 'square', 0.17, undefined, i * 0.11));
  }

  // ---- music ----
  startMusic(world: WorldConfig): void {
    if (!this.ctx) return;
    this.stopMusic();
    this.world = world;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 80);
  }

  stopMusic(): void {
    if (this.musicTimer != null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const w = this.world;
    if (!ctx || !w) return;
    const stepDur = 60 / w.music.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, stepDur, w);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff = 1800): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(200, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private playStep(step: number, t: number, d: number, w: WorldConfig): void {
    const ctx = this.ctx!;
    const { root, scale } = w.music;
    const bar = Math.floor(step / 16) % 4;
    const prog = [0, 0, 3, 2][bar] % scale.length;
    const rootF = root * Math.pow(2, scale[prog] / 12);
    // bass: driving 8ths
    if (step % 2 === 0) this.note(rootF, t, d * 1.8, 'sawtooth', 0.22, 700);
    // arp
    const arpIdx = [0, 2, 1, 3, 2, 4, 3, 1][step % 8] % scale.length;
    this.note(root * 4 * Math.pow(2, scale[arpIdx] / 12), t, d * 1.4, 'square', 0.05, 2600);
    // kick on beats
    if (step % 4 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.2);
    }
    // hats off-beat
    if (step % 4 === 2) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp).connect(g).connect(this.musicBus);
      src.start(t);
      src.stop(t + 0.06);
    }
  }
}

export const synth = new Synth();
