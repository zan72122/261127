// Synthesized sound: water jet, sizzle, fire crackle, fan, shutter, voices (formant), claps, chimes.
let ctx = null, master = null, noiseBuf = null;
const loops = {};

export function audioUnlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.0; }
  // silent buffer kick for iOS
  const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(master); s.start(0);
  makeLoops();
}

function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.loopStart = Math.random(); return s; }

function makeLoops() {
  // water jet: bandpassed noise + low rumble
  const mk = (type, f, q, gain) => {
    const n = noiseSrc(); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; n.connect(fl); fl.connect(g); g.connect(master); n.start();
    return { g, fl, base: gain };
  };
  loops.jet = mk('bandpass', 1800, 0.6, 0.35);
  loops.jetLow = mk('lowpass', 300, 0.7, 0.3);
  loops.sizzle = mk('highpass', 4200, 0.8, 0.5);
  loops.fire = mk('lowpass', 420, 0.9, 0.5);
  loops.fan = mk('bandpass', 180, 2.5, 0.5);
  loops.wind = mk('lowpass', 500, 0.5, 0.06);
  // fan motor tone
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50;
  const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 300;
  const og = ctx.createGain(); og.gain.value = 0; o.connect(of); of.connect(og); og.connect(master); o.start();
  loops.motor = { g: og, fl: of, osc: o, base: 0.08 };
}

export function setLoop(name, level, freq) {
  if (!ctx || !loops[name]) return;
  const L = loops[name]; const t = ctx.currentTime;
  L.g.gain.setTargetAtTime(Math.max(0, level) * L.base, t, 0.08);
  if (freq && L.fl) L.fl.frequency.setTargetAtTime(freq, t, 0.1);
  if (freq && L.osc) L.osc.frequency.setTargetAtTime(freq / 6, t, 0.2);
}

// crackles for fire: random clicks
let crackT = 0;
export function crackle(level, dt) {
  if (!ctx || level <= 0.01) return;
  crackT -= dt;
  if (crackT > 0) return;
  crackT = 0.02 + Math.random() * 0.25 / (0.3 + level);
  const t = ctx.currentTime;
  const n = noiseSrc(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500 + Math.random() * 3000;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.25 * level * Math.random(), t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
  n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 0.1);
}

export function burst(kind = 'sizzle', vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = noiseSrc(); const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  if (kind === 'sizzle') { f.type = 'highpass'; f.frequency.value = 3000; g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.4 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); }
  else if (kind === 'whoosh') { f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.35); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.35 * vol, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); }
  else if (kind === 'splash') { f.type = 'lowpass'; f.frequency.value = 1400; g.gain.setValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); }
  else if (kind === 'thump') { f.type = 'lowpass'; f.frequency.value = 220; g.gain.setValueAtTime(0.8 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); }
  n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 1);
}

export function clank(pitch = 1, vol = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  [1, 2.76, 5.4].forEach((m, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 340 * pitch * m;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.18 * vol / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35 / (i + 1));
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.5);
  });
  burst('thump', 0.4 * vol);
}

export function shutter(dur = 0.8) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 14; i++) {
    const tt = t + (i / 14) * dur;
    const n = noiseSrc(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 500; f.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.25, tt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
    n.connect(f); f.connect(g); g.connect(master); n.start(tt); n.stop(tt + 0.08);
  }
}

export function chime(notes = [0, 4, 7, 12], step = 0.12, vol = 0.25) {
  if (!ctx) return;
  const t = ctx.currentTime;
  notes.forEach((n, i) => {
    const f = 659.25 * Math.pow(2, n / 12);
    [1, 2.01, 3.0].forEach((m, j) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
      const g = ctx.createGain(); const tt = t + i * step;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(vol / (j * 2 + 1), tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.4 / (j + 1));
      o.connect(g); g.connect(master); o.start(tt); o.stop(tt + 1.6);
    });
  });
}

export function claps(n = 6, vol = 0.5) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < n; i++) {
    const tt = t + i * 0.22 + Math.random() * 0.02;
    const s = noiseSrc(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300 + Math.random() * 300; f.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(vol, tt + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.09);
    s.connect(f); f.connect(g); g.connect(master); s.start(tt); s.stop(tt + 0.15);
  }
}

// formant voice. vowels: sequence of [vowel, dur, pitchMul]
const FORM = {
  a: [[900, 1], [1400, 0.55], [2900, 0.25]], i: [[350, 1], [2600, 0.45], [3400, 0.3]], u: [[380, 1], [1100, 0.4], [2500, 0.2]],
  e: [[560, 1], [2100, 0.5], [2950, 0.25]], o: [[560, 1], [950, 0.5], [2700, 0.2]], r: [[500, 0.7], [1500, 0.35], [2500, 0.2]],
};
export function voice(seq, f0 = 300, vol = 0.35, child = true) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const src = ctx.createOscillator(); src.type = 'sawtooth';
  const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = f0 * 0.02; vib.connect(vg); vg.connect(src.frequency);
  const breath = noiseSrc(); const bg = ctx.createGain(); bg.gain.value = 0.08;
  const out = ctx.createGain(); out.gain.value = 0;
  const filters = [0, 1, 2].map(() => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6; const g = ctx.createGain(); src.connect(f); breath.connect(bg); bg.connect(f); f.connect(g); g.connect(out); return { f, g }; });
  out.connect(master);
  const fm = child ? 1.25 : 0.85;
  let t = t0;
  src.frequency.setValueAtTime(f0 * seq[0][2], t);
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol, t + 0.04);
  seq.forEach(([v, d, pm], i) => {
    const F = FORM[v];
    filters.forEach((x, j) => {
      if (i === 0) { x.f.frequency.setValueAtTime(F[j][0] * fm, t); x.g.gain.setValueAtTime(F[j][1], t); }
      else { x.f.frequency.linearRampToValueAtTime(F[j][0] * fm, t + Math.min(0.08, d * 0.5)); x.g.gain.linearRampToValueAtTime(F[j][1], t + 0.06); }
    });
    src.frequency.linearRampToValueAtTime(f0 * pm, t + d);
    t += d;
  });
  out.gain.setValueAtTime(vol, t - 0.05); out.gain.linearRampToValueAtTime(0, t + 0.08);
  src.start(t0); vib.start(t0); breath.start(t0);
  src.stop(t + 0.2); vib.stop(t + 0.2); breath.stop(t + 0.2);
}

export const say = {
  yay: () => voice([['u', 0.08, 1.0], ['a', 0.3, 1.25], ['i', 0.22, 1.1]], 310, 0.33, true),
  ooh: () => voice([['o', 0.35, 1.15], ['o', 0.2, 0.9]], 300, 0.28, true),
  huh: () => voice([['a', 0.16, 1.0], ['r', 0.05, 1.0], ['e', 0.3, 1.45]], 130, 0.35, false),
  dadYay: () => voice([['o', 0.12, 1.0], ['o', 0.3, 1.3], ['u', 0.1, 1.0]], 125, 0.35, false),
  dadOops: () => voice([['u', 0.08, 1.4], ['a', 0.25, 1.0], ['a', 0.25, 0.7]], 140, 0.38, false),
  ya: () => voice([['i', 0.06, 1.0], ['a', 0.22, 1.2]], 320, 0.3, true),
};
