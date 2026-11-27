export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.surfGain = null;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
      this._startSurf();
      this.unlocked = true;
    } catch {
      this.ctx = null;
    }
  }

  _startSurf() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.03 * white) / 1.03;
      data[i] = last * 1.4;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;

    this.surfGain = this.ctx.createGain();
    this.surfGain.gain.value = 0.06;

    src.connect(filter);
    filter.connect(this.surfGain);
    this.surfGain.connect(this.master);
    src.start();
  }

  whaleTone(pitch = 1.0, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc2.type = 'triangle';
    const base = 110 * pitch;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.32, t + 0.45);
    osc.frequency.exponentialRampToValueAtTime(base * 0.92, t + 1.4);
    osc2.frequency.setValueAtTime(base * 2, t);
    osc2.frequency.exponentialRampToValueAtTime(base * 2.4, t + 0.6);

    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol * 0.28, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    osc.connect(g);
    osc2.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1.55);
    osc2.stop(t + 1.55);
  }

  splash(intensity = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.45);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.32));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 620;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(0.28, 0.14 * intensity);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  chime(freq = 523.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.9);
  }

  update(speed = 0, alt = 0) {
    if (!this.surfGain || !this.ctx) return;
    const target = Math.max(0.03, 0.08 - alt * 0.003 + Math.min(0.06, speed * 0.004));
    this.surfGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }
}
