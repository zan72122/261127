// Procedural sound: crisp leaf rustle, wind, birds, chimes, car, plus short spoken reactions.
let ctx = null, master = null, noiseBuf = null, rustleGain = null, windGain = null, engine = null;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // continuous rustle layer (dry leaves), driven by sweeping speed
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
  const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 5200; bp.gain.value = 6;
  rustleGain = ctx.createGain(); rustleGain.gain.value = 0;
  src.connect(hp); hp.connect(bp); bp.connect(rustleGain); rustleGain.connect(master); src.start();
  // wind bed
  const w = ctx.createBufferSource(); w.buffer = noiseBuf; w.loop = true; w.playbackRate.value = 0.5;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  windGain = ctx.createGain(); windGain.gain.value = 0.02;
  w.connect(lp); lp.connect(windGain); windGain.connect(master); w.start();
  setInterval(() => { if (Math.random() < 0.5) bird(); }, 3500);
}
let crackleT = 0;
export function rustle(amount) {
  if (!ctx) return;
  const g = Math.min(0.5, amount * 0.012);
  rustleGain.gain.setTargetAtTime(g, ctx.currentTime, 0.04);
  // individual crackles (kasa-kasa)
  crackleT -= 1;
  if (amount > 2 && crackleT <= 0) { crackle(Math.min(1, amount / 40)); crackleT = 2 + Math.random() * 3; }
}
export function crackle(v = 0.5) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let k = 0; k < 3; k++) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500 + Math.random() * 5000; f.Q.value = 2;
    const g = ctx.createGain(); const t0 = t + k * (0.02 + Math.random() * 0.03);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.25 * v, t0 + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random() * 1.5, 0.08);
  }
}
export function gustSound(p = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  windGain.gain.cancelScheduledValues(t);
  windGain.gain.setTargetAtTime(0.02 + 0.12 * p, t, 0.4);
  windGain.gain.setTargetAtTime(0.02, t + 1.6, 0.9);
  for (let i = 0; i < 6; i++) setTimeout(() => crackle(0.3 * p), 300 + i * 220 + Math.random() * 200);
}
export function whoosh(p = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
  f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.25);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * Math.min(1.5, p), t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random(), 0.8);
  for (let i = 0; i < 8 * p; i++) setTimeout(() => crackle(0.4), 80 + i * 60 * Math.random() + i * 30);
}
function tone(freq, t0, dur, vol, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
export function chime(kind = 'ok') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const seq = kind === 'goal' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'pop' ? [880, 1174.7] : kind === 'bell' ? [1318.5, 987.8] : [659.25, 783.99];
  seq.forEach((f, i) => { tone(f, t + i * 0.11, 0.9, 0.16); tone(f * 2, t + i * 0.11, 0.4, 0.04); });
}
export function bird() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = 2 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const t0 = t + i * 0.13;
    const f0 = 3200 + Math.random() * 1200;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t0 + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.025, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.1);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.12);
  }
}
export function thud() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
  whoosh(1.4);
}
export function engineOn(on) {
  if (!ctx) return;
  if (on && !engine) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 57;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); o.start(); o2.start();
    engine = { o, o2, g, lp };
  }
  if (engine) engine.g.gain.setTargetAtTime(on ? 0.08 : 0, ctx.currentTime, on ? 0.3 : 0.8);
}
export function engineSpeed(v) { if (engine) { engine.o.frequency.setTargetAtTime(34 + v * 9, ctx.currentTime, 0.2); engine.o2.frequency.setTargetAtTime(51 + v * 13, ctx.currentTime, 0.2); } }

// short spoken reactions (no text on screen): girl high, dad low, grandma soft
const VOICES = { girl: { pitch: 1.75, rate: 1.05 }, papa: { pitch: 0.75, rate: 1.0 }, grandma: { pitch: 1.25, rate: 0.85 } };
let jaVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return null;
  const vs = speechSynthesis.getVoices();
  jaVoice = vs.find((v) => /ja/i.test(v.lang)) || null;
  return jaVoice;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
export function say(who, text) {
  try {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    const v = VOICES[who] || VOICES.girl;
    u.pitch = Math.min(2, v.pitch); u.rate = v.rate; u.volume = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}
