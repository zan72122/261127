// All sound is synthesised with WebAudio (no files): sand hiss, pebble clicks,
// pouring water, bubbles, glass knocks, and short formant-synth voices.
const VOW = { // F1, F2, F3 (adult female)
  a: [850, 1250, 2850], i: [320, 2700, 3250], u: [380, 1450, 2600], e: [560, 2250, 2900], o: [520, 900, 2800], n: [280, 1700, 2600],
};

export class Audio {
  constructor() { this.ctx = null; this.loops = {}; }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.out = c.createDynamicsCompressor();
      this.out.threshold.value = -16; this.out.ratio.value = 4;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      this.master.connect(this.out); this.out.connect(c.destination);
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.brown = c.createBuffer(1, len, c.sampleRate);
      const e = this.brown.getChannelData(0);
      for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; e[i] = b * 3.5; }
      this.ambient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  src(buf = this.noise) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); return s; }
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }

  ambient() { // aquarium filter hum + quiet room tone
    const c = this.ctx;
    const n = this.src(this.brown); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = c.createGain(); g.gain.value = 0.05; n.connect(f); f.connect(g); g.connect(this.master); n.start();
    this.amb = g;
  }
  // ---- continuous loops (level 0..1)
  loop(name, level) {
    if (!this.ctx) return;
    let L = this.loops[name];
    if (!L) {
      if (level <= 0) return;
      L = this.loops[name] = this.makeLoop(name);
    }
    L.g.gain.setTargetAtTime(Math.max(0, level) * L.k, this.t, 0.05);
  }
  makeLoop(name) {
    const c = this.ctx; const g = c.createGain(); g.gain.value = 0; g.connect(this.master);
    let k = 0.5;
    if (name === 'sand') {
      const n = this.src(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 0.7;
      const am = c.createGain(); const lfo = this.src(this.brown); const lg = c.createGain(); lg.gain.value = 0.6; lfo.connect(lg); lg.connect(am.gain);
      n.connect(f); f.connect(am); am.connect(g); n.start(); lfo.start(); k = 0.35;
    } else if (name === 'pour') {
      const n = this.src(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
      const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2600;
      const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 350; lfo.connect(lg); lg.connect(f.frequency);
      n.connect(f); f.connect(f2); f2.connect(g); n.start(); lfo.start(); k = 0.9;
      this.pourF = f;
    } else if (name === 'rub') {
      const n = this.src(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.8;
      n.connect(f); f.connect(g); n.start(); k = 0.35;
    } else if (name === 'spill') {
      const n = this.src(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      n.connect(f); f.connect(g); n.start(); k = 0.6;
    } else if (name === 'bubbles') {
      const n = this.src(this.brown); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 3;
      n.connect(f); f.connect(g); n.start(); k = 0.4;
    }
    return { g, k };
  }
  // ---- one shots
  click(f = 3000, v = 0.25) {
    if (!this.ctx) return; const c = this.ctx, t = this.t;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * (0.8 + Math.random() * 0.5);
    const g = c.createGain(); this.env(g, t, 0.001, v, 0.05 + Math.random() * 0.05);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  }
  pebble() { this.click(2200 + Math.random() * 1800, 0.18); if (Math.random() < 0.5) setTimeout(() => this.click(3000, 0.08), 40 + Math.random() * 60); }
  thud(f = 120, v = 0.5) {
    if (!this.ctx) return; const c = this.ctx, t = this.t;
    const o = c.createOscillator(); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = c.createGain(); this.env(g, t, 0.004, v, 0.18);
    const n = this.src(); const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900; const ng = c.createGain(); this.env(ng, t, 0.002, v * 0.4, 0.08);
    o.connect(g); g.connect(this.master); n.connect(nf); nf.connect(ng); ng.connect(this.master);
    o.start(t); o.stop(t + 0.4); n.start(t); n.stop(t + 0.3);
  }
  knock() {
    if (!this.ctx) return; const c = this.ctx, t = this.t;
    for (const [f, v, d] of [[1250, 0.35, 0.12], [2900, 0.18, 0.06], [480, 0.25, 0.09]]) {
      const o = c.createOscillator(); o.frequency.value = f * (0.97 + Math.random() * 0.06);
      const g = c.createGain(); this.env(g, t, 0.001, v, d); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
    }
  }
  bubble(v = 0.15) {
    if (!this.ctx) return; const c = this.ctx, t = this.t;
    const o = c.createOscillator(); const f0 = 350 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.4, t + 0.06);
    const g = c.createGain(); this.env(g, t, 0.004, v, 0.07); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.15);
  }
  splash(v = 0.5, dur = 0.5) {
    if (!this.ctx) return; const c = this.ctx, t = this.t;
    const n = this.src(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(4000, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = c.createGain(); this.env(g, t, 0.01, v, dur); n.connect(f); f.connect(g); g.connect(this.master); n.start(t); n.stop(t + dur + 0.1);
    for (let i = 0; i < 6; i++) setTimeout(() => this.bubble(0.08), 60 + i * 70 * Math.random());
  }
  whoosh(v = 0.2) {
    if (!this.ctx) return; const c = this.ctx, t = this.t;
    const n = this.src(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.25);
    const g = c.createGain(); this.env(g, t, 0.08, v, 0.25); n.connect(f); f.connect(g); g.connect(this.master); n.start(t); n.stop(t + 0.5);
  }
  pick() { this.click(1500, 0.12); setTimeout(() => this.click(2100, 0.08), 50); }
  chime() { // warm three-note marimba
    if (!this.ctx) return; const c = this.ctx;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = this.t + i * 0.13;
      for (const [m, v] of [[1, 0.22], [4, 0.04], [10, 0.015]]) {
        const o = c.createOscillator(); o.frequency.value = f * m; const g = c.createGain(); this.env(g, t, 0.004, v, m === 1 ? 0.9 : 0.15);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.2);
      }
    });
  }
  clap(n = 4) {
    if (!this.ctx) return;
    for (let i = 0; i < n; i++) setTimeout(() => {
      const c = this.ctx, t = this.t; const s = this.src(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300 + Math.random() * 400; f.Q.value = 1.2;
      const g = c.createGain(); this.env(g, t, 0.001, 0.5, 0.07); s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 0.15);
    }, i * 210);
  }
  // ---- voices.  seq: string of kana-ish tokens; who: 'girl' | 'mom'
  say(text, who = 'girl') {
    if (!this.ctx) return;
    const P = {
      'よーし': [['y', .05], ['o', .3, 1.0, 1.15], ['s', .08], ['i', .14, 1.15, 1.0]],
      'わあ': [['w', .08], ['a', .55, 1.25, 0.85]],
      'やったー': [['y', .05], ['a', .12, 1.1, 1.2], ['_', .07], ['t', .02], ['a', .45, 1.3, 1.0]],
      'できた': [['d', .03], ['e', .12, 1.1, 1.15], ['k', .05], ['i', .07, 1.2, 1.2], ['t', .03], ['a', .3, 1.3, 1.05]],
      'ふふっ': [['h', .06], ['u', .09, 1.2, 1.25], ['_', .05], ['h', .05], ['u', .1, 1.3, 1.1]],
      'あっ': [['a', .18, 1.25, 1.35]],
      'あらら': [['a', .12, 1.15, 1.1], ['r', .03], ['a', .1, 1.05, 1.0], ['r', .03], ['a', .32, 1.0, 0.85]],
      'あれ': [['a', .14, 1.0, 1.0], ['r', .03], ['e', .32, 1.0, 1.45]],
      'ありがとう': [['a', .1, 1.1, 1.1], ['r', .03], ['i', .07, 1.1, 1.05], ['g', .03], ['a', .08, 1.05, 1.0], ['t', .03], ['o', .1, 1.0, 0.95], ['o', .22, .95, 0.85]],
      'きれい': [['k', .04], ['i', .1, 1.1, 1.15], ['r', .03], ['e', .16, 1.15, 1.1], ['i', .3, 1.1, 0.9]],
      'えいっ': [['e', .08, 1.1, 1.2], ['i', .12, 1.25, 1.3]],
      'おさかな': [['o', .1, 1.1, 1.15], ['s', .07], ['a', .09, 1.15, 1.15], ['k', .04], ['a', .09, 1.1, 1.05], ['n', .05], ['a', .3, 1.05, 0.9]],
    }[text];
    if (!P) return;
    const c = this.ctx; let t = this.t + 0.02;
    const f0 = who === 'mom' ? 230 : 330, fs = who === 'mom' ? 1.0 : 1.18;
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    const vib = c.createOscillator(); vib.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = f0 * 0.012; vib.connect(vg); vg.connect(osc.frequency);
    const pre = c.createBiquadFilter(); pre.type = 'lowpass'; pre.frequency.value = 3800;
    const breath = this.src(); const bg = c.createGain(); bg.gain.value = 0;
    const amp = c.createGain(); amp.gain.value = 0;
    const out = c.createGain(); out.gain.value = who === 'mom' ? 0.5 : 0.55;
    const fl = [0, 1, 2].map(i => { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [6, 9, 10][i]; const g = c.createGain(); g.gain.value = [1, 0.6, 0.25][i]; f.connect(g); g.connect(out); return f; });
    osc.connect(pre); pre.connect(amp); breath.connect(bg); bg.connect(amp);
    fl.forEach(f => amp.connect(f));
    // consonant noise path
    const cn = this.src(); const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.Q.value = 1.5; const cg = c.createGain(); cg.gain.value = 0;
    cn.connect(cf); cf.connect(cg); cg.connect(out);
    out.connect(this.master);
    const setV = (v, tt, tc = 0.02) => fl.forEach((f, i) => f.frequency.setTargetAtTime(VOW[v][i] * fs, tt, tc));
    osc.frequency.setValueAtTime(f0, t);
    setV(P[0][0] in VOW ? P[0][0] : 'u', t, 0.001);
    for (const [ph, d, p0 = 1, p1 = 1] of P) {
      if (ph in VOW) {
        setV(ph, t, 0.025);
        osc.frequency.setValueAtTime(f0 * p0, t); osc.frequency.linearRampToValueAtTime(f0 * p1, t + d);
        amp.gain.setTargetAtTime(0.9, t, 0.015);
        bg.gain.setTargetAtTime(0.05, t, 0.02);
      } else if (ph === 'w' || ph === 'y') {
        setV(ph === 'w' ? 'u' : 'i', t, 0.005); amp.gain.setTargetAtTime(0.5, t, 0.01);
      } else if (ph === 'r' || ph === 'n' || ph === 'd' || ph === 'g') {
        amp.gain.setTargetAtTime(ph === 'n' ? 0.4 : 0.15, t, 0.006); if (ph === 'n') setV('n', t, 0.01);
      } else if (ph === '_') {
        amp.gain.setTargetAtTime(0, t, 0.006); bg.gain.setTargetAtTime(0, t, 0.006);
      } else { // s t k h : noise
        amp.gain.setTargetAtTime(ph === 'h' ? 0.05 : 0, t, 0.006);
        cf.frequency.setValueAtTime({ s: 5500, t: 3500, k: 2000, h: 1500 }[ph] * fs, t);
        cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(ph === 's' ? 0.35 : ph === 'h' ? 0.2 : 0.5, t + 0.008); cg.gain.linearRampToValueAtTime(0, t + d);
      }
      t += d;
    }
    amp.gain.setTargetAtTime(0, t, 0.03); bg.gain.setTargetAtTime(0, t, 0.03);
    for (const s of [osc, vib, breath, cn]) { s.start(this.t); s.stop(t + 0.3); }
  }
}
