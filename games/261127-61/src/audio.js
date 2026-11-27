// Web Audio: all sounds are synthesised. Starts on the first touch; never blocks rendering.
export class Sound {
  constructor() { this.ctx = null; this.ok = false; this.rustleG = null; }
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.build();
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      this.ok = true;
    } catch (e) { this.ok = false; }
  }
  suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* ignore */ } }
  resume() { try { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ } }
  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
    // noise buffer
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99 * b0 + w * 0.06; b1 = 0.6 * b1 + w * 0.4; d[i] = (b0 + b1) * 0.6; }
    this.noise = buf;
    const loop = (gain, type, freq, q) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.3;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { g, f };
    };
    this.wind = loop(0, 'lowpass', 420, 0.5);
    this.rustle = loop(0, 'bandpass', 2400, 0.9);
    this.rustle2 = loop(0, 'highpass', 5200, 0.5);
    this.insectG = c.createGain(); this.insectG.gain.value = 0; this.insectG.connect(this.master);
    this.birdsG = c.createGain(); this.birdsG.gain.value = 0; this.birdsG.connect(this.master);
    this.nextChirp = 0; this.nextBird = 0; this.nextHum = 30;
  }
  t() { return this.ctx ? this.ctx.currentTime : 0; }
  // continuous layers, called every frame
  ambient(dt, env) {
    if (!this.ok || !this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, now = c.currentTime;
    this.wind.g.gain.setTargetAtTime(0.05 + 0.05 * env.day, now, 0.5);
    this.insectG.gain.setTargetAtTime(0.05 * Math.max(env.gold, env.night), now, 1.0);
    this.birdsG.gain.setTargetAtTime(0.11 * env.morning, now, 1.0);
    // crickets: short bursts of a high tone
    if (now > this.nextChirp && (env.gold > 0.2 || env.night > 0.2)) {
      this.nextChirp = now + 0.35 + Math.random() * 0.9;
      const f0 = 4300 + Math.random() * 500;
      for (let k = 0; k < 3; k++) this.tone(f0, now + k * 0.045, 0.03, 0.05, 'sine', this.insectG);
    }
    if (now > this.nextBird && env.morning > 0.2) {
      this.nextBird = now + 1.2 + Math.random() * 2.5;
      const f = 1800 + Math.random() * 1400;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) this.glide(f * (1 + k * 0.08), f * (1.25 + k * 0.05), now + k * 0.16, 0.12, 0.12, this.birdsG);
    }
  }
  // grass rustle intensity 0..1, brightness (pitch) 0..1
  setRustle(v, bright) {
    if (!this.ok || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.rustle.g.gain.setTargetAtTime(v * 0.5, now, 0.04);
    this.rustle2.g.gain.setTargetAtTime(v * 0.16, now, 0.04);
    this.rustle.f.frequency.setTargetAtTime(1500 + bright * 3200, now, 0.08);
  }
  tone(freq, at, dur, vol, type = 'sine', dest = null) {
    const c = this.ctx; const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest || this.master); o.start(at); o.stop(at + dur + 0.05);
  }
  glide(f0, f1, at, dur, vol, dest = null) {
    const c = this.ctx; const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest || this.master); o.start(at); o.stop(at + dur + 0.05);
  }
  bell(freq, at, vol = 0.12) {
    // soft bell: fundamental + inharmonic partials
    for (const [m, v, d] of [[1, 1, 1.6], [2.76, 0.35, 0.8], [5.4, 0.12, 0.4]]) this.tone(freq * m, at, d, vol * v, 'sine');
  }
  // events ------------------------------------------------------------------------------------------
  sunNudge(h) { if (!this.ok) return; const now = this.t(); this.tone(330 + 220 * h, now, 0.35, 0.05, 'triangle'); }
  sunSlide(h, v) {
    if (!this.ok) return; const now = this.t();
    if (!this._slideT || now - this._slideT > 0.12) { this._slideT = now; this.tone(260 + 260 * h, now, 0.25, 0.025 * v + 0.01, 'sine'); }
  }
  moonSlide(h, v) {
    if (!this.ok) return; const now = this.t();
    if (!this._mslideT || now - this._mslideT > 0.16) { this._mslideT = now; this.tone(520 + 300 * h, now, 0.5, 0.02 * v + 0.01, 'sine'); this.tone(780 + 450 * h, now + 0.03, 0.4, 0.008, 'sine'); }
  }
  success(kind = 0) {
    if (!this.ok) return; const now = this.t();
    const roots = [[523.25, 659.25, 783.99], [587.33, 739.99, 880], [493.88, 622.25, 739.99], [440, 554.37, 659.25]][kind % 4];
    roots.forEach((f, i) => this.bell(f, now + i * 0.16, 0.09));
  }
  tick() { if (!this.ok) return; const now = this.t(); this.noiseHit(now, 0.06, 2600, 0.05); }
  hoof(fore) { if (!this.ok) return; const now = this.t(); this.tone(fore ? 95 : 80, now, 0.12, 0.05, 'sine'); this.noiseHit(now, 0.08, 900, 0.03); }
  thump() { if (!this.ok) return; const now = this.t(); this.tone(60, now, 0.35, 0.12, 'sine'); this.noiseHit(now, 0.4, 1400, 0.08); }
  hum() { if (!this.ok) return; const now = this.t(); const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = 92; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.035, now + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6); o.connect(g); g.connect(this.master); o.start(now); o.stop(now + 2.8); }
  noiseHit(at, dur, freq, vol) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(at, Math.random()); s.stop(at + dur + 0.05);
  }
}
