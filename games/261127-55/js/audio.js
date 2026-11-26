// 音：すべてその場で合成（外部ファイルなし）。声は端末の読み上げ（短いひとこと）。
let ctx = null, master = null, noiseBuf = null;
export function audioInit() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startAmbience();
    scratchInit();
    // iOS：最初のタッチの中で読み上げを解錠
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
  } catch (e) { ctx = null; }
}
const now = () => ctx.currentTime;
function noise(dur, filterType, freq, q, gain, when = 0, attack = 0.005) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const t = now() + when;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  return { f, g };
}
function tone(freq, dur, type = 'sine', gain = 0.2, when = 0, slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); const t = now() + when;
  o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

// チョークでこする音（速さで大きく）
let scr = null;
function scratchInit() {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.9;
  const f2 = ctx.createBiquadFilter(); f2.type = 'highshelf'; f2.frequency.value = 5000; f2.gain.value = -6;
  const g = ctx.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(f2); f2.connect(g); g.connect(master); s.start();
  scr = { f, g, v: 0 };
}
export function scratch(speed, dt) {
  if (!scr) return;
  const target = Math.min(0.32, speed * 0.9);
  scr.v += (target - scr.v) * Math.min(1, dt * 18);
  const grit = 0.75 + Math.random() * 0.5; // ざらざら
  scr.g.gain.setTargetAtTime(scr.v * grit, now(), 0.015);
  scr.f.frequency.setTargetAtTime(1800 + speed * 3000 + Math.random() * 600, now(), 0.02);
}

export function sparkle() {
  const notes = [1568, 1760, 2093, 2349, 2637, 3136];
  const n = notes[Math.floor(Math.random() * notes.length)];
  tone(n, 0.5, 'sine', 0.05); tone(n * 2.01, 0.25, 'sine', 0.015);
}
export function chime() { [1047, 1319, 1568, 2093].forEach((f, i) => { tone(f, 0.9, 'sine', 0.09, i * 0.09); tone(f * 2, 0.4, 'triangle', 0.02, i * 0.09); }); }
export function rise() { if (!ctx) return; const n = noise(0.9, 'bandpass', 400, 1.5, 0.12, 0, 0.3); if (n) n.f.frequency.exponentialRampToValueAtTime(2400, now() + 0.8); tone(300, 0.9, 'sine', 0.05, 0, 2.2); }
export function thump(g = 0.4) { tone(120, 0.25, 'sine', g, 0, 0.4); noise(0.08, 'lowpass', 900, 0.7, g * 0.4); }
export function clunk() { tone(90, 0.18, 'sine', 0.35, 0, 0.5); noise(0.06, 'bandpass', 1400, 2, 0.15); tone(260, 0.06, 'square', 0.03); }
export function splash(big = 1) { noise(0.6 * big, 'lowpass', 1800, 0.5, 0.25 * big); noise(0.3, 'bandpass', 3500, 1, 0.08 * big, 0.05); tone(500, 0.12, 'sine', 0.05, 0.02, 0.5); }
export function plop() { tone(700, 0.12, 'sine', 0.12, 0, 0.45); }
export function water() { for (let i = 0; i < 6; i++) { noise(0.5, 'bandpass', 600 + Math.random() * 800, 2, 0.05, i * 0.12, 0.1); tone(300 + Math.random() * 400, 0.15, 'sine', 0.03, i * 0.15, 1.6); } }
export function boing() { tone(220, 0.35, 'sine', 0.15, 0, 2.2); tone(110, 0.3, 'triangle', 0.06, 0, 1.8); }
export function pop() { tone(900, 0.08, 'sine', 0.15, 0, 0.5); noise(0.05, 'highpass', 3000, 0.7, 0.06); }
export function horn() { tone(392, 0.16, 'square', 0.035, 0); tone(494, 0.16, 'square', 0.03, 0); tone(392, 0.2, 'square', 0.035, 0.22); tone(494, 0.2, 'square', 0.03, 0.22); }
export function tap() { tone(1200, 0.05, 'sine', 0.05); }
export function whoosh() { const n = noise(0.5, 'bandpass', 800, 1, 0.12, 0, 0.15); if (n) n.f.frequency.exponentialRampToValueAtTime(200, now() + 0.45); }
export function flap() { noise(0.12, 'bandpass', 900, 1.5, 0.12); noise(0.1, 'bandpass', 700, 1.5, 0.1, 0.12); }

// エンジン（小さな電動カート風＋ぽこぽこ）
let eng = null;
export function engine(on, speed = 0, rough = 0) {
  if (!ctx) return;
  if (on && !eng) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 27.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 3;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lg = ctx.createGain(); lg.gain.value = 0.4; lfo.connect(lg); lg.connect(am.gain);
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(lp); o2.connect(lp); lp.connect(am); am.connect(g); g.connect(master);
    o.start(); o2.start(); lfo.start();
    g.gain.setTargetAtTime(0.13, now(), 0.2);
    eng = { o, o2, lp, g, lfo };
  }
  if (!on && eng) { const e = eng; eng = null; e.g.gain.setTargetAtTime(0, now(), 0.15); setTimeout(() => { try { e.o.stop(); e.o2.stop(); e.lfo.stop(); } catch (x) {} }, 900); return; }
  if (eng) {
    const f = 48 + speed * 40 + rough * Math.random() * 20;
    eng.o.frequency.setTargetAtTime(f, now(), 0.08); eng.o2.frequency.setTargetAtTime(f / 2, now(), 0.08);
    eng.lfo.frequency.setTargetAtTime(14 + speed * 14, now(), 0.1);
    eng.lp.frequency.setTargetAtTime(380 + speed * 500, now(), 0.1);
  }
}

// 環境音：そよ風と小鳥
function startAmbience() {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  const g = ctx.createGain(); g.gain.value = 0.03;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  s.connect(f); f.connect(g); g.connect(master); s.start();
  const bird = () => {
    if (!ctx) return;
    const base = 2600 + Math.random() * 1400; const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); const gg = ctx.createGain(); const t = now() + i * 0.13;
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.3), t + 0.06); o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.1);
      gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.018, t + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(gg); gg.connect(master); o.start(t); o.stop(t + 0.15);
    }
    setTimeout(bird, 3000 + Math.random() * 7000);
  };
  setTimeout(bird, 2000);
}

// 声（文字は出さない。短いひとことを読み上げ）
let jaVoice = null;
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    jaVoice = vs.find((v) => /ja/i.test(v.lang) && /Kyoko|O-ren|Hattori|Google/i.test(v.name)) || vs.find((v) => /ja/i.test(v.lang)) || null;
  } catch (e) {}
}
try { speechSynthesis.onvoiceschanged = pickVoice; pickVoice(); } catch (e) {}
export function say(text, who = 'girl') {
  try {
    if (!('speechSynthesis' in window)) return fallbackVoice(who);
    if (!jaVoice) pickVoice();
    if (!jaVoice) return fallbackVoice(who);
    const u = new SpeechSynthesisUtterance(text);
    u.voice = jaVoice; u.lang = 'ja-JP';
    u.pitch = who === 'girl' ? 1.75 : 0.65; u.rate = who === 'girl' ? 1.1 : 0.95; u.volume = 0.9;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { fallbackVoice(who); }
}
function fallbackVoice(who) {
  // 声色っぽい短い音（フォルマント）
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const base = who === 'girl' ? 380 : 140; const t = now();
  o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.3, t + 0.15); o.frequency.linearRampToValueAtTime(base * 0.9, t + 0.35);
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = who === 'girl' ? 1000 : 700; f1.Q.value = 5;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = who === 'girl' ? 1600 : 1100; f2.Q.value = 6;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(master); o.start(t); o.stop(t + 0.45);
}
