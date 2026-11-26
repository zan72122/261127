// All sounds are synthesised with WebAudio (no files): brush swish, powder puff,
// reveal chimes, UV hum, papa's sneeze, short voices (girl / papa / puppy),
// curtain swish, drips outside after the rain.
let ctx = null, master = null, noiseBuf = null;
let brushGain = null, brushFilter = null, humGain = null;

export function audioInit() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // continuous brush swish (gain driven by stroke speed)
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  brushFilter = ctx.createBiquadFilter(); brushFilter.type = 'bandpass'; brushFilter.frequency.value = 3500; brushFilter.Q.value = 0.7;
  brushGain = ctx.createGain(); brushGain.gain.value = 0;
  n.connect(brushFilter); brushFilter.connect(brushGain); brushGain.connect(master); n.start();
  // UV flashlight hum
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 120;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 240.7;
  humGain = ctx.createGain(); humGain.gain.value = 0;
  o.connect(humGain); o2.connect(humGain); humGain.connect(master); o.start(); o2.start();
  ambience();
}
export const now = () => (ctx ? ctx.currentTime : 0);

function noise(t, dur, { f = 1000, q = 1, type = 'bandpass', g = 0.3, a = 0.01, r = 0.1, f2 = null } = {}) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + a);
  gn.gain.setValueAtTime(g, t + Math.max(a, dur - r)); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(gn); gn.connect(master);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(t, f, dur, { type = 'sine', g = 0.2, a = 0.005, f2 = null, dest = master } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
// formant voice: f0 contour + vowel formants
const VOW = { a: [800, 1250, 2600], i: [320, 2600, 3200], u: [350, 900, 2400], e: [500, 2000, 2700], o: [500, 900, 2500], aa: [900, 1400, 2800] };
function voice(t, seq, { f0 = 300, g = 0.22, breath = 0.1 } = {}) {
  if (!ctx) return;
  // seq: [[vowel, dur, pitchMul0, pitchMul1], ...]
  let tt = t;
  for (const [v, dur, p0, p1] of seq) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * p0, tt); o.frequency.linearRampToValueAtTime(f0 * p1, tt + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = f0 * 0.015; vib.connect(vg); vg.connect(o.frequency);
    const sum = ctx.createGain(); sum.gain.value = 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, tt); env.gain.exponentialRampToValueAtTime(g, tt + 0.03);
    env.gain.setValueAtTime(g, tt + dur * 0.7); env.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
    VOW[v].forEach((F, i) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F * (f0 > 250 ? 1.15 : 1); bp.Q.value = 8 + i * 3;
      const gg = ctx.createGain(); gg.gain.value = [1, 0.5, 0.25][i] * 3;
      o.connect(bp); bp.connect(gg); gg.connect(sum);
    });
    sum.connect(env); env.connect(master);
    o.start(tt); o.stop(tt + dur + 0.05); vib.start(tt); vib.stop(tt + dur + 0.05);
    if (breath) noise(tt, dur * 0.6, { f: 2500, q: 0.6, g: breath * g, a: 0.02, r: dur * 0.3 });
    tt += dur * 0.92;
  }
}

export const S = {
  brush(speed) {
    if (!ctx) return;
    const v = Math.min(1, speed * 1.2);
    brushGain.gain.setTargetAtTime(v * 0.16, ctx.currentTime, 0.03);
    brushFilter.frequency.setTargetAtTime(2500 + v * 3000, ctx.currentTime, 0.05);
  },
  hum(on) { if (ctx) humGain.gain.setTargetAtTime(on ? 0.012 : 0, ctx.currentTime, 0.1); },
  puff(g = 0.35) { const t = now(); noise(t, 0.35, { f: 900, f2: 300, q: 0.8, g, a: 0.005, r: 0.28, type: 'lowpass' }); noise(t, 0.2, { f: 4000, q: 0.5, g: g * 0.3, a: 0.003, r: 0.15 }); },
  dip() { const t = now(); noise(t, 0.12, { f: 1800, q: 1.2, g: 0.2, r: 0.1 }); tone(t, 180, 0.1, { type: 'triangle', g: 0.08, f2: 120 }); },
  tap() { const t = now(); tone(t, 1200, 0.06, { type: 'triangle', g: 0.07, f2: 900 }); },
  reveal(i = 0) {
    const t = now(); const base = [523.25, 587.33, 659.25, 783.99, 880, 1046.5][i % 6];
    tone(t, base, 0.9, { g: 0.12 }); tone(t + 0.07, base * 1.5, 0.8, { g: 0.06 }); tone(t + 0.02, base * 2.0, 0.5, { g: 0.03 });
  },
  sparkle() { const t = now(); for (let i = 0; i < 6; i++) tone(t + i * 0.06, 1500 + Math.random() * 1500, 0.25, { g: 0.04 }); },
  glow() { const t = now(); tone(t, 660, 0.6, { g: 0.06, type: 'sine', f2: 990 }); tone(t + 0.05, 330, 0.7, { g: 0.04 }); },
  win() {
    const t = now(); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(t + i * 0.12, f, 0.6, { g: 0.12, type: 'triangle' }); tone(t + i * 0.12, f * 2, 0.4, { g: 0.03 }); });
  },
  swoosh() { const t = now(); noise(t, 0.5, { f: 600, f2: 2400, q: 1.0, g: 0.15, a: 0.15, r: 0.3 }); },
  curtain() { const t = now(); noise(t, 0.6, { f: 1500, f2: 700, q: 0.6, g: 0.12, a: 0.1, r: 0.4 }); },
  thud() { const t = now(); tone(t, 110, 0.25, { type: 'sine', g: 0.35, f2: 50 }); noise(t, 0.1, { f: 400, q: 1, g: 0.2, type: 'lowpass' }); },
  clank() { const t = now(); [620, 1310, 2110].forEach((f) => tone(t, f, 0.4, { type: 'triangle', g: 0.06 })); tone(t + 0.18, 900, 0.3, { type: 'triangle', g: 0.04 }); },
  stamp() { const t = now(); noise(t, 0.08, { f: 500, q: 0.8, g: 0.25, type: 'lowpass' }); tone(t, 160, 0.08, { g: 0.08 }); },
  step(g = 0.06) { const t = now(); noise(t, 0.06, { f: 700, q: 1.5, g, type: 'bandpass' }); },
  pawStep() { const t = now(); noise(t, 0.035, { f: 2500, q: 2, g: 0.05 }); },
  // voices
  wow() { voice(now(), [['a', 0.18, 1.0, 1.25], ['o', 0.35, 1.3, 1.0]], { f0: 330 }); },
  yay() { voice(now(), [['i', 0.12, 1.1, 1.3], ['e', 0.3, 1.35, 1.2]], { f0: 340 }); },
  aha() { voice(now(), [['a', 0.12, 1.0, 1.0], ['aa', 0.28, 1.3, 1.45]], { f0: 330 }); },
  hmm() { voice(now(), [['u', 0.5, 1.0, 0.85]], { f0: 300, g: 0.12 }); },
  huh() { voice(now(), [['e', 0.32, 1.0, 1.4]], { f0: 330, g: 0.15 }); },
  papaOops() { voice(now(), [['o', 0.2, 1.1, 1.0], ['o', 0.35, 1.1, 0.75]], { f0: 120, g: 0.25 }); },
  papaHa() { voice(now(), [['a', 0.14, 1.0, 1.1], ['a', 0.14, 1.0, 1.1], ['a', 0.14, 1.0, 1.1]], { f0: 125, g: 0.2 }); },
  papaHmm() { voice(now(), [['u', 0.45, 1.0, 1.2]], { f0: 115, g: 0.18 }); },
  sneeze() {
    const t = now();
    voice(t, [['a', 0.35, 1.0, 1.25]], { f0: 140, g: 0.16, breath: 0.4 });
    voice(t + 0.6, [['a', 0.45, 1.1, 1.45]], { f0: 140, g: 0.2, breath: 0.5 });
    noise(t + 1.2, 0.35, { f: 3000, f2: 1200, q: 0.7, g: 0.55, a: 0.004, r: 0.25 });
    voice(t + 1.2, [['u', 0.3, 1.6, 1.0]], { f0: 140, g: 0.25, breath: 0.6 });
  },
  yip() { const t = now(); voice(t, [['aa', 0.09, 2.0, 2.6]], { f0: 520, g: 0.22, breath: 0.05 }); },
  yipyip() { const t = now(); voice(t, [['aa', 0.08, 2.0, 2.6]], { f0: 520, g: 0.2, breath: 0.05 }); voice(t + 0.18, [['aa', 0.09, 2.1, 2.7]], { f0: 520, g: 0.2, breath: 0.05 }); },
  whine() { voice(now(), [['i', 0.5, 2.2, 2.8]], { f0: 480, g: 0.1, breath: 0.1 }); },
  sniff() { const t = now(); for (let i = 0; i < 4; i++) noise(t + i * 0.09, 0.06, { f: 3000, q: 1.2, g: 0.08, a: 0.01, r: 0.04 }); },
  munch() { const t = now(); for (let i = 0; i < 5; i++) noise(t + i * 0.13, 0.05, { f: 1800, q: 1.5, g: 0.12 }); },
};

function ambience() {
  // slow drips from the gutter after the rain + a faint bird now and then
  const drip = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = 900 + Math.random() * 700;
    tone(t, f, 0.12, { g: 0.02, f2: f * 1.8 });
    setTimeout(drip, 900 + Math.random() * 2600);
  };
  const bird = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) tone(t + i * 0.12, 2800 + Math.random() * 600, 0.08, { g: 0.012, f2: 3600 });
    setTimeout(bird, 7000 + Math.random() * 9000);
  };
  setTimeout(drip, 1500); setTimeout(bird, 5000);
}
