// 音はすべてその場で合成（ファイル不要）
export class Sound {
  constructor() {
    this.ctx = null; this.on = false;
    const unlock = () => {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
        const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        this.master.connect(comp); comp.connect(this.ctx.destination);
        this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.ambient();
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
      this.on = true;
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('touchend', unlock, { capture: true });
  }
  get t() { return this.ctx.currentTime; }
  noise(t0, dur, f, q, gain, type = 'bandpass', f2 = null) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.01, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }
  tone(t0, dur, f, gain, type = 'sine', f2 = null, att = 0.005) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  ok() { return this.on && this.ctx && this.ctx.state === 'running'; }
  slice(size = 1, crisp = 0.6) {
    if (!this.ok()) return; const t = this.t;
    // 刃が通る「しゃくっ」
    this.noise(t, 0.12 + size * 0.08, 3200, 1.2, 0.35 * crisp, 'bandpass', 1500);
    for (let i = 0; i < 5; i++) this.noise(t + i * 0.018 + Math.random() * 0.01, 0.025, 2500 + Math.random() * 2500, 4, 0.18 * crisp);
    // 果汁の「じゅわ」
    this.noise(t + 0.04, 0.25 + size * 0.2, 900, 0.8, 0.22, 'lowpass', 300);
    // まな板に当たる
    this.tone(t + 0.07, 0.12, 190 + Math.random() * 30, 0.25, 'sine', 120);
    this.noise(t + 0.07, 0.04, 1800, 2, 0.12);
  }
  thud(size = 1) { if (!this.ok()) return; const t = this.t; this.tone(t, 0.18, 150 / Math.sqrt(size), 0.35, 'sine', 80); this.noise(t, 0.05, 1200, 1.5, 0.15); }
  pop() { if (!this.ok()) return; const t = this.t; this.tone(t, 0.12, 380, 0.18, 'sine', 760); this.noise(t, 0.03, 4000, 2, 0.05); }
  drip() { if (!this.ok()) return; const t = this.t; this.tone(t, 0.07, 1400 + Math.random() * 400, 0.06, 'sine', 600); }
  splash() { if (!this.ok()) return; const t = this.t; this.noise(t, 0.6, 2400, 0.7, 0.5, 'lowpass', 400); this.noise(t + 0.02, 0.35, 900, 1.2, 0.4); for (let i = 0; i < 8; i++) this.tone(t + 0.1 + Math.random() * 0.5, 0.06, 900 + Math.random() * 900, 0.05, 'sine', 500); }
  crack() { if (!this.ok()) return; const t = this.t; for (let i = 0; i < 4; i++) this.noise(t + i * 0.03, 0.06, 600 + i * 300, 3, 0.3); this.tone(t, 0.3, 110, 0.4, 'sine', 60); }
  squeeze() { if (!this.ok()) return; const t = this.t; this.noise(t, 0.6, 500, 3, 0.12, 'bandpass', 900); }
  wipe(v) { if (!this.ok()) return; const t = this.t; this.noise(t, 0.09, 1800 + v * 800, 0.9, Math.min(0.16, 0.04 + v * 0.1)); }
  sparkle() { if (!this.ok()) return; const t = this.t; [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(t + i * 0.07, 0.5, f, 0.06)); }
  bell() { if (!this.ok()) return; const t = this.t; for (const [f, g] of [[1320, 0.12], [2640, 0.05], [3960, 0.03]]) { this.tone(t, 1.0, f, g); this.tone(t + 0.18, 0.9, f * 1.26, g * 0.8); } }
  squeak() { if (!this.ok()) return; const t = this.t; const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1100, t + 0.08); o.frequency.linearRampToValueAtTime(800, t + 0.18); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3); }
  clap(n = 4) { if (!this.ok()) return; const t = this.t; for (let i = 0; i < n; i++) { this.noise(t + i * 0.2, 0.06, 1400, 0.9, 0.35); this.noise(t + i * 0.2, 0.03, 3000, 1, 0.15); } }
  // 声（母音のフォルマントで合成。言葉ではなく「わあ」「あれ？」のような短い声）
  voice(kind, who = 'girl') {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const P = { girl: [330, 1.25], kid: [300, 1.2], mama: [230, 1.12], papa: [120, 0.95], lady: [210, 1.1] }[who] || [300, 1.2];
    const F = { a: [850, 1250, 2900], i: [330, 2600, 3300], u: [380, 1100, 2500], e: [520, 2000, 2900], o: [520, 900, 2700], n: [280, 1200, 2600], w: [330, 750, 2400] };
    const seqs = {
      wa: [['w', 0.06, 1.0], ['a', 0.32, 1.15], ['a', 0.18, 0.95]],
      ware: [['w', 0.05, 1.0], ['a', 0.25, 1.15]],
      yay: [['i', 0.06, 1.1], ['a', 0.22, 1.25], ['i', 0.15, 1.15]],
      are: [['a', 0.14, 1.0], ['e', 0.14, 1.05], ['e', 0.08, 1.35]],
      oops: [['o', 0.1, 1.15], ['o', 0.06, 0.9], ['o', 0.08, 1.0], ['o', 0.12, 0.85]],
      mm: [['n', 0.35, 1.0], ['n', 0.25, 1.15]],
      hai: [['a', 0.12, 1.15], ['i', 0.14, 1.0]],
      un: [['u', 0.1, 1.05], ['n', 0.18, 0.95]],
      ooh: [['o', 0.35, 1.1], ['o', 0.15, 0.95]],
    };
    const seq = seqs[kind] || seqs.wa;
    const src = c.createOscillator(); src.type = 'sawtooth';
    const vib = c.createOscillator(); vib.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = P[0] * 0.015; vib.connect(vg); vg.connect(src.frequency);
    const out = c.createGain(); out.gain.value = 0.0001;
    const bp = [0, 1, 2].map(i => { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [6, 9, 12][i]; const g = c.createGain(); g.gain.value = [1, 0.6, 0.25][i]; src.connect(f); f.connect(g); g.connect(out); return f; });
    const breath = c.createBufferSource(); breath.buffer = this.noiseBuf; const bf = c.createBiquadFilter(); bf.type = 'highpass'; bf.frequency.value = 2500; const bgn = c.createGain(); bgn.gain.value = 0.02; breath.connect(bf); bf.connect(bgn); bgn.connect(out);
    let tt = t;
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(who === 'papa' ? 0.5 : 0.35, t + 0.03);
    for (const [v, dur, pm] of seq) {
      const f = F[v] || F.a;
      const sc = P[1];
      bp.forEach((b, i) => b.frequency.linearRampToValueAtTime(f[i] * sc, tt + Math.min(0.05, dur)));
      src.frequency.linearRampToValueAtTime(P[0] * pm, tt + dur * 0.6);
      tt += dur;
    }
    out.gain.setValueAtTime(who === 'papa' ? 0.45 : 0.3, tt - 0.05); out.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
    src.frequency.setValueAtTime(P[0], t);
    out.connect(this.master);
    src.start(t); vib.start(t); breath.start(t);
    src.stop(tt + 0.1); vib.stop(tt + 0.1); breath.stop(tt + 0.1);
  }
  ambient() {
    const c = this.ctx;
    // 遠いざわめき
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0.035;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    // 小鳥
    const chirp = () => {
      if (this.ctx.state === 'running') {
        const t = this.t; const base = 2600 + Math.random() * 1600; const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone(t + i * 0.11, 0.07, base * (1 + Math.random() * 0.2), 0.015, 'sine', base * 1.4);
      }
      setTimeout(chirp, 2500 + Math.random() * 6000);
    };
    setTimeout(chirp, 2000);
  }
}
