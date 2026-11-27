import { clamp } from './math.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windGain = null;
    this.windFilter = null;
    this.streamGain = null;
    this.ready = false;
    this.windTarget = 0;
    this.windPitch = 280;
    this.streamTarget = 0;
    this._unlock = this._unlock.bind(this);
    window.addEventListener('pointerdown', this._unlock, { once: true, passive: true });
  }

  _unlock() {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      if (ctx.state === 'suspended') ctx.resume();

      const master = (this.master = ctx.createGain());
      master.gain.value = 0.34;
      master.connect(ctx.destination);

      // Filtered white noise buffer for breeze & distant brook murmur
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.88 + white * 0.12;
        data[i] = last * 2.2;
      }

      const windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      const wf = (this.windFilter = ctx.createBiquadFilter());
      wf.type = 'bandpass';
      wf.frequency.value = 320;
      wf.Q.value = 1.4;
      const wg = (this.windGain = ctx.createGain());
      wg.gain.value = 0.02;
      windSrc.connect(wf).connect(wg).connect(master);
      windSrc.start();

      const stSrc = ctx.createBufferSource();
      stSrc.buffer = buf;
      stSrc.loop = true;
      const sf = ctx.createBiquadFilter();
      sf.type = 'bandpass';
      sf.frequency.value = 920;
      sf.Q.value = 0.9;
      const sg = (this.streamGain = ctx.createGain());
      sg.gain.value = 0.0;
      stSrc.connect(sf).connect(sg).connect(master);
      stSrc.start();

      this.ready = true;
    } catch {
      // Headless or audio-restricted browser
    }
  }

  setAmbience(speed, alt, streamProx) {
    this.windTarget = clamp(0.03 + speed * 0.009 + alt * 0.0012, 0.02, 0.28);
    this.windPitch = clamp(240 + speed * 26 + alt * 4, 220, 920);
    this.streamTarget = clamp(streamProx * 0.09, 0, 0.09);
  }

  update() {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(this.windTarget, t, 0.14);
    this.windFilter.frequency.setTargetAtTime(this.windPitch, t, 0.14);
    this.streamGain.gain.setTargetAtTime(this.streamTarget, t, 0.2);
  }

  paperRustle() {
    if (!this.ready || !this.ctx) return;
    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.16);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = Math.sin((i / len) * Math.PI);
        d[i] = (Math.random() * 2 - 1) * env;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.005, now + 0.16);
      src.connect(f).connect(g).connect(this.master);
      src.start(now);
    } catch {}
  }

  chime(freq = 528, dur = 0.65, gain = 0.11) {
    if (!this.ready || !this.ctx) return;
    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.015, now + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch {}
  }

  thermalLift() {
    this.chime(523.25, 0.7, 0.09);
    setTimeout(() => this.chime(659.25, 0.75, 0.08), 80);
    setTimeout(() => this.chime(783.99, 0.85, 0.07), 160);
  }

  arrivalChord() {
    [392.0, 493.88, 587.33, 783.99].forEach((f, idx) => {
      setTimeout(() => this.chime(f, 1.3, 0.08), idx * 95);
    });
  }
}
