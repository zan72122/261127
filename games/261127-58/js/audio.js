// audio.js — everything synthesised with WebAudio (no files): furnace roar, breath,
// sizzle, glass clinks and ticks, chimes, birds, and short wordless voices.
export class Audio {
  constructor() { this.ctx = null; this.on = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    // noise buffer
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; }
    this.noise = b;
    const bb = ctx.createBuffer(1, len, ctx.sampleRate), bd = bb.getChannelData(0);
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.brown = bb;
    // furnace roar (continuous)
    this.roar = this.loop(this.brown, 'lowpass', 380, 0.0);
    this.breath = this.loop(this.noise, 'bandpass', 1100, 0.0, 0.8);
    this.sizzleL = this.loop(this.noise, 'highpass', 3200, 0.0);
    this.on = true;
  }
  loop(buf, type, f, g, q = 0.7) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gn = this.ctx.createGain(); gn.gain.value = g;
    s.connect(fl); fl.connect(gn); gn.connect(this.master); s.start();
    return { s, fl, g: gn };
  }
  set(node, v, t = 0.08) { if (!this.on) return; node.g.gain.setTargetAtTime(v, this.ctx.currentTime, t); }
  furnace(v) { this.on && this.set(this.roar, v, 0.5); }
  blow(v) { this.on && this.set(this.breath, v * 0.22, 0.05); }
  sizzle(v) { this.on && this.set(this.sizzleL, v * 0.25, 0.04); }
  tone(f, dur, { type = 'sine', vol = 0.2, at = 0, attack = 0.004, slide = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, type, f, vol, at = 0, q = 1) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  clink(k = 1) { // glass ping: inharmonic partials
    const f = 1900 * k;
    [1, 2.32, 4.25, 6.8].forEach((m, i) => this.tone(f * m, 1.4 / (i + 1), { vol: 0.12 / (i + 1) }));
  }
  tick() { this.tone(4200 + Math.random() * 2500, 0.08, { vol: 0.04 }); }
  thud() { this.tone(110, 0.25, { vol: 0.25, slide: 0.6 }); this.burst(0.12, 'lowpass', 600, 0.2); }
  whoosh() { this.burst(0.5, 'bandpass', 700, 0.12, 0, 0.6); }
  hiss() { this.burst(1.2, 'highpass', 2500, 0.25); for (let i = 0; i < 8; i++) this.burst(0.03, 'highpass', 5000, 0.12, Math.random() * 0.8); }
  sprinkle() { for (let i = 0; i < 6; i++) this.tone(5000 + Math.random() * 3000, 0.04, { vol: 0.03, at: Math.random() * 0.25 }); }
  chime(i = 0) { const sc = [523, 587, 659, 784, 880, 1047]; const f = sc[i % sc.length]; this.tone(f, 1.6, { vol: 0.12 }); this.tone(f * 2, 1.0, { vol: 0.04 }); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => { this.tone(f, 0.6, { vol: 0.12, at: i * 0.11, type: 'triangle' }); }); }
  pop() { this.tone(300, 0.15, { vol: 0.2, slide: 2.2 }); }
  birds() { if (!this.on) return; const b = 2600 + Math.random() * 1200; for (let i = 0; i < 3; i++) this.tone(b, 0.09, { vol: 0.03, at: i * 0.13, slide: 1.4 }); }
  // tiny formant "voice" (no words): vowels a/o/e/i/u with a pitch contour
  voice(kind, pitch = 1) {
    if (!this.on) return;
    const V = { a: [800, 1200], o: [450, 800], e: [500, 1800], i: [300, 2300], u: [350, 900] };
    const seqs = {
      wa: [['u', 0.06, 1.0], ['a', 0.28, 1.25]], yay: [['i', 0.07, 1.1], ['a', 0.2, 1.4], ['i', 0.12, 1.2]],
      are: [['a', 0.14, 1.0], ['e', 0.24, 1.35]], oo: [['o', 0.5, 0.95]], achi: [['a', 0.1, 1.3], ['i', 0.12, 1.5]],
      fuu: [['u', 0.55, 0.9]], un: [['u', 0.12, 1.0], ['u', 0.14, 0.8]], hee: [['e', 0.35, 1.2]]
    };
    const seq = seqs[kind] || seqs.wa;
    const c = this.ctx; let t = c.currentTime + 0.01;
    const base = 300 * pitch;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(); f1.type = f2.type = 'bandpass'; f1.Q.value = 6; f2.Q.value = 9;
    const g = c.createGain(); g.gain.value = 0;
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.master);
    const vib = c.createOscillator(); vib.frequency.value = 6; const vg = c.createGain(); vg.gain.value = base * 0.02; vib.connect(vg); vg.connect(o.frequency);
    o.frequency.setValueAtTime(base * seq[0][2], t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.03);
    for (const [v, d, p] of seq) {
      f1.frequency.setTargetAtTime(V[v][0] * (pitch > 1.2 ? 1.15 : 1), t, 0.02); f2.frequency.setTargetAtTime(V[v][1] * (pitch > 1.2 ? 1.15 : 1), t, 0.02);
      o.frequency.linearRampToValueAtTime(base * p, t + d); t += d;
    }
    g.gain.setTargetAtTime(0, t - 0.04, 0.03);
    o.start(); vib.start(); o.stop(t + 0.2); vib.stop(t + 0.2);
  }
}
