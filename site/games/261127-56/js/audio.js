// 音：すべてその場で合成（外部ファイルなし）。声は短い間投詞だけを端末の音声で。
let ctx = null, master = null, noiseBuf = null;
export function audioInit() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 2; }
    startAmbience();
  } catch (e) { ctx = null; }
}
function now() { return ctx.currentTime; }
function noise(dur, f0, q, gain, type = 'bandpass', when = 0, attack = 0.005) {
  if (!ctx) return null;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = f0; f.Q.value = q;
  const g = ctx.createGain(); const t = now() + when;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  return { s, f, g };
}
function tone(freq, dur, gain, type = 'sine', when = 0, slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; const t = now() + when;
  o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

// ---- 常に鳴っている音：ストーブのぱちぱち・ろくろのモーター・こする音
let fireG = null, motor = null, rub = null, kilnRoar = null;
function startAmbience() {
  // 火のゴーッという低い音
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
  fireG = ctx.createGain(); fireG.gain.value = 0.05;
  s.connect(f); f.connect(fireG); fireG.connect(master); s.start();
  // ろくろ
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50;
  const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 300;
  const og = ctx.createGain(); og.gain.value = 0;
  o.connect(of); of.connect(og); og.connect(master); o.start();
  motor = { o, og, of };
  // 濡れた土をこする音
  const r = ctx.createBufferSource(); r.buffer = noiseBuf; r.loop = true;
  const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 0.8;
  const rg = ctx.createGain(); rg.gain.value = 0;
  r.connect(rf); rf.connect(rg); rg.connect(master); r.start();
  rub = { rf, rg };
  // 窯のうなり
  const k = ctx.createBufferSource(); k.buffer = noiseBuf; k.loop = true;
  const kf = ctx.createBiquadFilter(); kf.type = 'lowpass'; kf.frequency.value = 160;
  const kg = ctx.createGain(); kg.gain.value = 0;
  k.connect(kf); kf.connect(kg); kg.connect(master); k.start();
  kilnRoar = { kg, kf };
  crackleLoop();
}
function crackleLoop() {
  if (!ctx) return;
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) noise(0.02 + Math.random() * 0.03, 1800 + Math.random() * 2500, 2, 0.04 + Math.random() * 0.06, 'bandpass', i * 0.03);
  setTimeout(crackleLoop, 200 + Math.random() * 1400);
}
export function setFireLevel(v) { if (fireG) fireG.gain.setTargetAtTime(0.03 + v * 0.04, now(), 0.3); }
export function setMotor(speed) { // 0..1+
  if (!motor) return;
  motor.o.frequency.setTargetAtTime(40 + speed * 70, now(), 0.2);
  motor.og.gain.setTargetAtTime(speed > 0.01 ? 0.018 + speed * 0.02 : 0, now(), 0.2);
  motor.of.frequency.setTargetAtTime(200 + speed * 500, now(), 0.2);
}
export function setRub(level, wet) {
  if (!rub) return;
  rub.rg.gain.setTargetAtTime(level * (0.07 + wet * 0.05), now(), 0.05);
  rub.rf.frequency.setTargetAtTime(500 + (1 - wet) * 900, now(), 0.1);
}
export function setKiln(v) { if (kilnRoar) { kilnRoar.kg.gain.setTargetAtTime(v * 0.12, now(), 0.4); kilnRoar.kf.frequency.setTargetAtTime(120 + v * 120, now(), 0.4); } }

// ---- 効果音
export const sfx = {
  tap() { tone(520, 0.08, 0.05, 'triangle'); },
  squish() { noise(0.18, 500, 1.2, 0.12, 'lowpass'); noise(0.12, 1400, 2, 0.04, 'bandpass', 0.04); },
  splash() { noise(0.35, 1600, 0.8, 0.12, 'bandpass'); for (let i = 0; i < 4; i++) tone(900 + Math.random() * 900, 0.06, 0.03, 'sine', 0.05 + i * 0.05, 1.6); },
  drip() { tone(1400 + Math.random() * 600, 0.08, 0.04, 'sine', 0, 1.8); },
  plop() { tone(220, 0.18, 0.12, 'sine', 0, 0.5); noise(0.15, 400, 1, 0.08, 'lowpass'); },
  slap() { noise(0.12, 700, 0.9, 0.2, 'lowpass'); tone(140, 0.1, 0.08, 'sine', 0, 0.6); },
  wire() { noise(0.5, 3200, 6, 0.05, 'bandpass'); tone(2200, 0.45, 0.012, 'sine', 0, 0.95); },
  whoosh() { noise(0.6, 600, 0.6, 0.08, 'bandpass', 0, 0.2); },
  clunk() { noise(0.2, 300, 1, 0.25, 'lowpass'); tone(110, 0.25, 0.15, 'sine', 0, 0.7); },
  click() { noise(0.04, 3000, 3, 0.1, 'bandpass'); tone(1800, 0.03, 0.03, 'square'); },
  dipIn() { noise(0.5, 300, 0.7, 0.1, 'lowpass', 0, 0.05); tone(180, 0.3, 0.04, 'sine', 0, 0.6); },
  dipOut() { for (let i = 0; i < 6; i++) tone(700 + Math.random() * 800, 0.07, 0.025, 'sine', 0.1 + i * 0.09 + Math.random() * 0.05, 1.5); },
  ping() { const f = 2400 + Math.random() * 1800; tone(f, 0.9, 0.035, 'sine'); tone(f * 2.76, 0.4, 0.012, 'sine'); },
  clap() { for (let i = 0; i < 3; i++) noise(0.06, 1500, 1, 0.15, 'bandpass', i * 0.22); },
  chime() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.9, 0.05, 'sine', i * 0.11)); },
  pour() { noise(1.2, 700, 0.7, 0.07, 'bandpass', 0, 0.15); },
  rustle() { noise(0.4, 2600, 0.8, 0.05, 'highpass'); },
  door() { noise(0.3, 250, 1, 0.12, 'lowpass'); tone(90, 0.3, 0.06, 'sine', 0, 0.8); },
  thud() { tone(90, 0.2, 0.15, 'sine', 0, 0.5); },
};

// 短い声（文字は出さない）
const voices = { girl: null, adult: null };
function pickVoices() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /ja/i.test(v.lang));
  voices.girl = vs[0] || null; voices.adult = vs[1] || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoices(); speechSynthesis.onvoiceschanged = pickVoices; }
export function say(text, who = 'girl') {
  try {
    if (!('speechSynthesis' in window) || !ctx) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    const v = who === 'girl' ? voices.girl : voices.adult;
    if (v) u.voice = v;
    u.pitch = who === 'girl' ? 1.8 : who === 'papa' ? 0.7 : 1.2;
    u.rate = who === 'girl' ? 1.15 : 1.0;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { }
}
