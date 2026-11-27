// Web Audio synthesis: gentle two-beat call & response music + tactile sound effects.
const PENTA = [0, 2, 4, 7, 9];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function snapPenta(m) { const o = Math.floor(m / 12), n = ((m % 12) + 12) % 12; let best = PENTA[0], bd = 99; for (const p of PENTA) { const d = Math.abs(p - n); if (d < bd) { bd = d; best = p; } } return o * 12 + best; }
function degree(base, d) { // base midi on pentatonic, step d degrees
  let m = snapPenta(base), idx = PENTA.indexOf(((m % 12) + 12) % 12), oct = Math.floor(m / 12);
  idx += d; oct += Math.floor(idx / 5); idx = ((idx % 5) + 5) % 5; return oct * 12 + PENTA[idx];
}
export const VOICE = { mimi: 72, koko: 76, hana: 67, rara: 79 };

export class Sound {
  constructor() {
    this.ctx = null; this.started = false; this.energy = 0; this.nextBeat = 0; this.beat = 0; this.sleepy = 0;
    this.layers = 0; this.pourNode = null; this.muted = false;
  }
  start() {
    if (this.started) { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp); comp.connect(ctx.destination);
      this.music = ctx.createGain(); this.music.gain.value = 0.34; this.music.connect(this.master);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 0.62; this.sfx.connect(this.master);
      // small room reverb
      this.rev = ctx.createConvolver(); this.rev.buffer = this.impulse(1.3); const rg = ctx.createGain(); rg.gain.value = 0.22; this.rev.connect(rg); rg.connect(this.master);
      const len = ctx.sampleRate * 1.0, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = nb;
      this.started = true; this.nextBeat = ctx.currentTime + 0.12; this.beat = 0;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      // unlock blip (inaudible)
      const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.0001; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.02);
    } catch (e) { this.ctx = null; }
  }
  impulse(sec) { const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); } return b; }
  suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) {} this.stopPour(); }
  resume() { try { if (this.ctx && this.started) { this.ctx.resume(); this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.1); } } catch (e) {} }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  ok() { return this.ctx && this.started && this.ctx.state === 'running'; }

  // ---------- instruments ----------
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  out(bus, wet = 0.3) { const g = this.ctx.createGain(); g.connect(bus); if (wet > 0) { const w = this.ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.rev); } return g; }
  marimba(m, t, v = 0.3, bus) {
    if (!this.ctx) return; const ctx = this.ctx, f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain(), out = this.out(bus || this.sfx, 0.25);
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 3.99;
    this.env(g, t, 0.004, v, 0.55); this.env(g2, t, 0.002, v * 0.35, 0.09);
    o.connect(g); o2.connect(g2); g.connect(out); g2.connect(out); o.start(t); o2.start(t); o.stop(t + 0.7); o2.stop(t + 0.2);
  }
  musicbox(m, t, v = 0.22, bus) {
    if (!this.ctx) return; const ctx = this.ctx, f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain(), out = this.out(bus || this.sfx, 0.4);
    o.type = 'sine'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2;
    this.env(g, t, 0.003, v, 0.9); this.env(g2, t, 0.002, v * 0.25, 0.25);
    o.connect(g); o2.connect(g2); g.connect(out); g2.connect(out); o.start(t); o2.start(t); o.stop(t + 1.0); o2.stop(t + 0.3);
  }
  bell(m, t, v = 0.18, bus) {
    if (!this.ctx) return; const ctx = this.ctx, f = mtof(m), c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), out = this.out(bus || this.sfx, 0.5);
    c.frequency.value = f; mo.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.6);
    mo.connect(mg); mg.connect(c.frequency); this.env(g, t, 0.003, v, 1.3); c.connect(g); g.connect(out); c.start(t); mo.start(t); c.stop(t + 1.4); mo.stop(t + 1.4);
  }
  noise(t, dur, f, q, v, type = 'bandpass', bus, sweep) {
    if (!this.ctx) return; const ctx = this.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), out = this.out(bus || this.sfx, 0.15);
    s.buffer = this.noiseBuf; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur); fl.Q.value = q;
    this.env(g, t, Math.min(0.01, dur * 0.2), v, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  thump(t, f = 120, v = 0.4, dec = 0.12) {
    if (!this.ctx) return; const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), out = this.out(this.sfx, 0.1);
    o.frequency.setValueAtTime(f * 1.8, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); this.env(g, t, 0.003, v, dec); o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.05);
  }
  glide(m0, m1, t, dur, v = 0.15, type = 'sine') {
    if (!this.ctx) return; const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), out = this.out(this.sfx, 0.3);
    o.type = type; o.frequency.setValueAtTime(mtof(m0), t); o.frequency.exponentialRampToValueAtTime(mtof(m1), t + dur); this.env(g, t, 0.01, v, dur + 0.05); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.1);
  }

  // ---------- sound effects ----------
  pick(id) { if (!this.ok()) return; const t = this.t, b = VOICE[id] || 72; this.glide(b - 5, b + 2, t, 0.09, 0.12); this.musicbox(degree(b, 1), t + 0.02, 0.12); }
  drop(id, soft) { if (!this.ok()) return; const t = this.t; this.thump(t, soft ? 180 : 140, soft ? 0.18 : 0.3, 0.1); this.marimba(degree((VOICE[id] || 72) - 12, 0), t + 0.01, 0.16); }
  tapItem(m = 84) { if (!this.ok()) return; this.marimba(snapPenta(m), this.t, 0.16); }
  touchSmall(x) { if (!this.ok()) return; this.noise(this.t, 0.05, 2400 + x * 800, 3, 0.05); }
  sit(id) { if (!this.ok()) return; const t = this.t; this.noise(t, 0.12, 600, 0.8, 0.12, 'lowpass'); this.marimba(degree(VOICE[id], 2), t + 0.05, 0.2); this.marimba(degree(VOICE[id], 4), t + 0.16, 0.16); }
  greet(a, b) { if (!this.ok()) return; const t = this.t; this.thump(t, 220, 0.25, 0.08); this.noise(t, 0.04, 1800, 4, 0.12); this.bell(degree(VOICE[a], 0) + 12, t + 0.22, 0.14); this.bell(degree(VOICE[b], 2) + 12, t + 0.34, 0.12); }
  knock() { if (!this.ok()) return; const t = this.t; for (const d of [0, 0.22]) { this.thump(t + d, 150, 0.35, 0.09); this.noise(t + d, 0.05, 900, 2, 0.12); } }
  door(open) { if (!this.ok()) return; const t = this.t; if (open) { this.glide(58, 63, t, 0.25, 0.05, 'triangle'); this.noise(t, 0.2, 500, 1, 0.05); } else { this.thump(t, 200, 0.3, 0.07); this.noise(t, 0.04, 2500, 3, 0.1); } }
  give(a, b, n = 0) { if (!this.ok()) return; const t = this.t, s = n % 3; this.musicbox(degree(VOICE[a], s), t, 0.2); this.musicbox(degree(VOICE[b], s + 2), t + 0.16, 0.2); this.bell(degree(VOICE[b], s + 4) + 12, t + 0.34, 0.1); this.bump(0.16); }
  thanks(id) { if (!this.ok()) return; const t = this.t; this.musicbox(degree(VOICE[id], 3), t, 0.16); this.musicbox(degree(VOICE[id], 1), t + 0.14, 0.16); }
  chew(id) { if (!this.ok()) return; const t = this.t; for (let i = 0; i < 4; i++) this.noise(t + i * 0.16, 0.05, 2200 + Math.random() * 900 + (VOICE[id] - 72) * 40, 2.5, 0.07); this.glide(VOICE[id] - 3, VOICE[id] + 2, t + 0.7, 0.25, 0.08); this.bump(0.1); }
  sip(id) { if (!this.ok()) return; const t = this.t; this.noise(t, 0.25, 700, 2, 0.08, 'bandpass', null, 1400); this.glide(VOICE[id], VOICE[id] - 5, t + 0.3, 0.3, 0.07); }
  cheers(a, b, n = 0) { if (!this.ok()) return; const t = this.t, s = n % 4; this.bell(degree(VOICE[a], s) + 12, t, 0.16); this.bell(degree(VOICE[b], s + 2) + 12, t + 0.01, 0.16); this.noise(t, 0.03, 5000, 6, 0.08); this.bump(0.2); }
  clap(t0 = 0) { if (!this.ok()) return; const t = this.t + t0; this.noise(t, 0.05, 1500, 1.2, 0.12); }
  deco() { if (!this.ok()) return; const t = this.t; [0, 2, 4, 5, 7].forEach((d, i) => this.musicbox(degree(84, d), t + i * 0.07, 0.12)); this.bump(0.15); }
  shoe(on) { if (!this.ok()) return; const t = this.t; if (on) this.glide(76, 84, t, 0.08, 0.08, 'triangle'); else { this.thump(t, 260, 0.15, 0.05); this.glide(80, 72, t, 0.08, 0.06); } }
  shelf() { if (!this.ok()) return; const t = this.t; this.thump(t, 330, 0.2, 0.05); this.marimba(degree(79, Math.floor(Math.random() * 3)), t, 0.12); }
  pop() { if (!this.ok()) return; const t = this.t; this.glide(84, 91, t, 0.06, 0.1); this.bell(96, t + 0.05, 0.05); }
  sparkle() { if (!this.ok()) return; const t = this.t; this.bell(96, t, 0.06); this.bell(100, t + 0.08, 0.05); }
  swish() { if (!this.ok()) return; this.noise(this.t, 0.35, 400, 0.7, 0.12, 'bandpass', null, 2000); }
  yawn(id) { if (!this.ok()) return; this.glide(VOICE[id] - 5, VOICE[id] - 12, this.t, 0.5, 0.06, 'triangle'); }
  wake(id) { if (!this.ok()) return; const t = this.t; this.glide(VOICE[id] - 7, VOICE[id] + 5, t, 0.25, 0.1); this.musicbox(degree(VOICE[id], 2), t + 0.25, 0.15); }
  surprise(id) { if (!this.ok()) return; const t = this.t; this.glide(VOICE[id], VOICE[id] + 7, t, 0.15, 0.1); this.bell(degree(VOICE[id], 4) + 12, t + 0.1, 0.12); }
  open() { if (!this.ok()) return; const t = this.t; this.noise(t, 0.12, 1200, 1, 0.1); [0, 2, 4, 7].forEach((d, i) => this.bell(degree(79, d) + 12, t + 0.08 + i * 0.08, 0.08)); this.bump(0.2); }
  call(id, step = 0, t0 = 0) { if (!this.ok()) return; const t = this.t + t0; this.marimba(degree(VOICE[id], step), t, 0.18); this.marimba(degree(VOICE[id], step + 2), t + 0.17, 0.16); }
  answer(id, step = 0, t0 = 0) { if (!this.ok()) return; const t = this.t + t0; this.musicbox(degree(VOICE[id], step + 1), t, 0.17); this.musicbox(degree(VOICE[id], step - 1), t + 0.17, 0.15); }
  wave(id) { if (!this.ok()) return; const t = this.t; this.musicbox(degree(VOICE[id], 2), t, 0.1); this.musicbox(degree(VOICE[id], 3), t + 0.12, 0.08); }
  startPour() {
    if (!this.ok() || this.pourNode) return;
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), out = this.out(this.sfx, 0.2);
    s.buffer = this.noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 3; f.frequency.value = 700; g.gain.setValueAtTime(0.0001, this.t); g.gain.linearRampToValueAtTime(0.12, this.t + 0.08);
    s.connect(f); f.connect(g); g.connect(out); s.start(); this.pourNode = { s, f, g };
  }
  pourLevel(l) { if (this.pourNode) this.pourNode.f.frequency.setTargetAtTime(600 + l * 1400, this.t, 0.05); }
  stopPour(plip = false) {
    if (!this.pourNode) return; const { s, g } = this.pourNode; this.pourNode = null;
    try { g.gain.setTargetAtTime(0.0001, this.t, 0.04); s.stop(this.t + 0.3); } catch (e) {}
    if (plip && this.ok()) this.glide(84, 96, this.t + 0.02, 0.06, 0.08);
  }
  bump(e) { this.energy = Math.min(1, this.energy + e); }

  // ---------- music: two-beat call & response ----------
  update(dt, ctxInfo) {
    this.energy = Math.max(0, this.energy - dt * 0.018);
    if (!this.ok()) return;
    const ctx = this.ctx, spb = 60 / (this.sleepy > 0.5 ? 70 : 88);
    if (this.nextBeat < ctx.currentTime - 0.5) this.nextBeat = ctx.currentTime + 0.05;
    while (this.nextBeat < ctx.currentTime + 0.25) { this.playBeat(this.nextBeat, this.beat, spb); this.nextBeat += spb; this.beat++; }
  }
  playBeat(t, b, spb) {
    const chordRoots = [48, 53, 48, 43], bar = Math.floor(b / 2), inBar = b % 2, chord = chordRoots[Math.floor(bar / 2) % 4];
    const e = this.energy, m = this.music, sleepy = this.sleepy > 0.5;
    // base: gentle "pon - pon"
    if (inBar === 0) this.marimba(chord, t, sleepy ? 0.16 : 0.22, m); else this.marimba(chord + 7, t, 0.12, m);
    if (sleepy) { if (inBar === 0) [0, 4, 7, 12].forEach((d, i) => this.musicbox(chord + 24 + d, t + i * spb * 0.25, 0.06, m)); return; }
    const phrase = bar % 4; // 0,1 call ; 2,3 response
    const motifs = [[[0, 4], [0.5, 2]], [[0, 3], [0.5, 4], [1, 2]], [[0, 2], [1, 1]], [[0, 1], [0.5, 2], [1, 0]]];
    if (e > 0.12 && inBar === 0) {
      const mo = motifs[(Math.floor(b / 8) + phrase) % 4];
      for (const [off, d] of mo) {
        const note = degree(phrase < 2 ? 72 : 67, d + (phrase % 2));
        if (phrase < 2) this.musicbox(note, t + off * spb, 0.1 + e * 0.06, m); else this.marimba(note, t + off * spb, 0.12 + e * 0.06, m);
      }
    }
    if (e > 0.4) { this.noise(t + spb * 0.5, 0.04, 6000, 1, 0.04 * e, 'highpass', m); this.noise(t, 0.03, 5000, 1, 0.025 * e, 'highpass', m); }
    if (e > 0.6 && inBar === 0 && bar % 2 === 0) this.bell(degree(84, (bar / 2) % 5), t, 0.05 * e, m);
    if (e > 0.25 && inBar === 1) { [0, 4, 7].forEach(d => this.marimba(chord + 12 + d, t + spb * 0.5, 0.035 + 0.03 * e, m)); }
  }
}
