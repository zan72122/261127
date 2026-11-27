// Pure Web Audio procedural soundscape: desert wind, dune skim rush, star chimes, brass goat bell.
import { clamp } from './math.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windGain = null;
    this.windFilter = null;
    this.skimGain = null;
    this.skimFilter = null;
    this.targetWind = 0.06;
    this.targetSkim = 0;
    this.targetStar = 0;
    this._chimeCooldown = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = (this.ctx = new AC());
      const master = (this.master = ctx.createGain());
      master.gain.value = 0.42;
      master.connect(ctx.destination);

      // Pink-ish noise buffer for warm desert wind & sand-skim rush
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.950 * b2 + w * 0.048;
        data[i] = (b0 + b1 + b2 + w * 0.04) * 0.5;
      }

      const windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 320;
      this.windFilter.Q.value = 1.1;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.03;
      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(master);
      windSrc.start();

      const skimSrc = ctx.createBufferSource();
      skimSrc.buffer = buf;
      skimSrc.loop = true;
      this.skimFilter = ctx.createBiquadFilter();
      this.skimFilter.type = 'lowpass';
      this.skimFilter.frequency.value = 640;
      this.skimGain = ctx.createGain();
      this.skimGain.gain.value = 0;
      skimSrc.connect(this.skimFilter);
      this.skimFilter.connect(this.skimGain);
      this.skimGain.connect(master);
      skimSrc.start();
    } catch {
      this.ctx = null;
    }
  }

  setAmbience({ wind = 0.08, skim = 0, star = 0 } = {}) {
    this.targetWind = clamp(wind, 0, 0.5);
    this.targetSkim = clamp(skim, 0, 0.45);
    this.targetStar = clamp(star, 0, 1);
  }

  update(dt = 0.016) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(this.targetWind * 0.25, t, 0.18);
    this.windFilter.frequency.setTargetAtTime(240 + this.targetWind * 650, t, 0.2);
    this.skimGain.gain.setTargetAtTime(this.targetSkim * 0.22, t, 0.14);
    this.skimFilter.frequency.setTargetAtTime(420 + this.targetSkim * 1400, t, 0.14);

    this._chimeCooldown -= dt;
    if (this.targetStar > 0.35 && this._chimeCooldown <= 0) {
      this._chimeCooldown = 1.6 + Math.random() * 1.4;
      const notes = [523.25, 587.33, 659.25, 783.99, 987.77, 1046.5];
      const f = notes[Math.floor(Math.random() * notes.length)];
      this._tone(f, 0.035 * this.targetStar, 1.3, 'sine', (Math.random() - 0.5) * 0.5);
    }
  }

  bell(pan = 0) {
    this._tone(1174.66, 0.08, 0.55, 'triangle', pan);
    this._tone(1760.0, 0.04, 0.38, 'sine', pan);
  }

  launch() {
    const chord = [293.66, 369.99, 440.0, 587.33];
    chord.forEach((f, i) => this._tone(f, 0.06, 0.9 + i * 0.15, 'triangle', 0, i * 0.06));
  }

  arrival() {
    const chord = [261.63, 329.63, 392.0, 523.25, 659.25];
    chord.forEach((f, i) => this._tone(f, 0.075, 1.8, 'sine', (i - 2) * 0.18, i * 0.1));
  }

  _tone(freq, vol, dur, type = 'sine', pan = 0, delay = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.setValueAtTime(clamp(pan, -0.8, 0.8), t0);
      osc.connect(g);
      g.connect(p);
      p.connect(this.master);
    } else {
      osc.connect(g);
      g.connect(this.master);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  }
}
