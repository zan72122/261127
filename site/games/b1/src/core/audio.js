// Procedural Web Audio soundscape: crisp winter air, sleigh bells, snow crunch, puppy yips, aurora chime
import { clamp } from './math.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windGain = null;
    this.windFilter = null;
    this.bellTimer = 0;
    this.ready = false;
  }

  unlock() {
    if (this.ready) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(ctx.destination);

      // Gentle filtered wind noise
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = last * 0.96 + w * 0.04;
        data[i] = last * 2.2;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 340;
      this.windFilter.Q.value = 1.4;

      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.04;

      src.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      src.start();
      this.ready = true;
    } catch (_) {}
  }

  update(speed = 0, alt = 0) {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const spd = clamp(speed / 22, 0, 1);
    const high = clamp(alt / 30, 0, 1);
    if (this.windFilter) {
      this.windFilter.frequency.setTargetAtTime(280 + spd * 520 + high * 240, t, 0.15);
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(0.03 + spd * 0.12 + high * 0.04, t, 0.15);
    }
  }

  sleighBell(strength = 0.4) {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const freqs = [1568, 2093, 2637];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 28, t + idx * 0.012);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035 * strength / (idx + 1), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  puppyYip() {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(840, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(460, t + 0.14);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  chime(pitch = 1) {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * pitch, t + i * 0.07);
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.linearRampToValueAtTime(0.055, t + i * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.85);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.9);
    });
  }
}
