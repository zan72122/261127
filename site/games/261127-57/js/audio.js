// Synthesised sounds (no files) + tiny voice exclamations via speech synthesis.
let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    birds();
  } catch (e) { ctx = null; }
}

function noise(t0, dur, f0, q, gain, type = 'bandpass', f1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t0); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.03, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}
function tone(t0, freq, dur, gain, type = 'sine', f1) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  spray() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.22, 5200, 0.7, 0.22, 'highpass'); noise(t, 0.12, 2600, 1.2, 0.06); tone(t, 140, 0.05, 0.05, 'triangle', 90); },
  jet() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.5, 1800, 0.8, 0.28, 'bandpass', 900); for (let i = 0; i < 4; i++) tone(t + i * 0.09, 300 + Math.random() * 200, 0.08, 0.05, 'sine', 160); },
  drip() { if (!ctx) return; const t = ctx.currentTime; const f = 900 + Math.random() * 700; tone(t, f, 0.12, 0.08, 'sine', f * 1.8); },
  clack() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.05, 2400 + Math.random() * 1200, 6, 0.3); tone(t, 1800 + Math.random() * 400, 0.04, 0.05, 'triangle'); },
  twig() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.07, 900 + Math.random() * 300, 4, 0.25); tone(t, 420 + Math.random() * 80, 0.06, 0.06, 'triangle', 300); },
  clink() { if (!ctx) return; const t = ctx.currentTime; for (const [f, g] of [[2380, 0.08], [3910, 0.05], [5650, 0.03], [1210, 0.04]]) tone(t, f, 1.3, g); },
  squeak(speed) { if (!ctx) return; const t = ctx.currentTime; const f = 900 + Math.min(1, speed) * 700; tone(t, f, 0.09, 0.03 * Math.min(1, speed + 0.3), 'sawtooth', f * 1.1); noise(t, 0.08, f * 2, 3, 0.02); },
  slurp() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.3, 400, 3, 0.18, 'bandpass', 1400); tone(t + 0.05, 220, 0.2, 0.05, 'sine', 520); },
  squirt() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.2, 1500, 2, 0.15, 'bandpass', 600); },
  pick() { if (!ctx) return; const t = ctx.currentTime; tone(t, 660, 0.08, 0.06, 'triangle'); tone(t + 0.05, 990, 0.1, 0.05, 'triangle'); },
  chime() { if (!ctx) return; const t = ctx.currentTime; [784, 988, 1175, 1568].forEach((f, i) => { tone(t + i * 0.09, f, 0.9, 0.06); tone(t + i * 0.09, f * 2.76, 0.4, 0.012); }); },
  whistle() { if (!ctx) return; const t = ctx.currentTime; for (const f of [880, 1108]) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.setValueAtTime(0.05, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.9); } noise(t, 0.8, 2000, 2, 0.03); },
  chuff() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.09, 700, 1.5, 0.05, 'bandpass', 300); },
  fanfare() { if (!ctx) return; const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => { tone(t + i * 0.12, f, 0.6, 0.07, 'triangle'); tone(t + i * 0.12, f * 2, 0.3, 0.015); }); },
  swoosh() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.45, 600, 1, 0.12, 'bandpass', 2400); },
  pop() { if (!ctx) return; const t = ctx.currentTime; tone(t, 400, 0.1, 0.08, 'sine', 900); },
  oops() { if (!ctx) return; const t = ctx.currentTime; tone(t, 520, 0.18, 0.06, 'triangle', 380); tone(t + 0.2, 400, 0.3, 0.06, 'triangle', 300); },
};

function birds() {
  if (!ctx) return;
  const next = () => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1500;
    for (let i = 0; i < n; i++) tone(t + i * 0.11, base * (1 + (Math.random() - 0.5) * 0.2), 0.08, 0.012, 'sine', base * 1.3);
    setTimeout(next, 3000 + Math.random() * 6000);
  };
  setTimeout(next, 2000);
}

// short voice lines (girl: high pitch, dad: low). Falls back silently.
let jaVoice = null;
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    jaVoice = vs.find((v) => /ja/i.test(v.lang)) || null;
  } catch (e) { /* ignore */ }
}
try { speechSynthesis.onvoiceschanged = pickVoice; pickVoice(); } catch (e) { /* ignore */ }

export function say(text, who = 'girl') {
  try {
    if (!('speechSynthesis' in window)) return;
    if (!jaVoice) pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.pitch = who === 'girl' ? 1.85 : 0.6;
    u.rate = who === 'girl' ? 1.15 : 0.95;
    u.volume = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}
