import { clamp } from './math.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.engineOsc = null;
    this.engineSub = null;
    this.engineGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.sprayGain = null;
    this.sprayFilter = null;

    this._throttle = 0;
    this._speed = 0;
    this._spray = 0;
    this._alt = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.26;
      master.connect(ctx.destination);
      this.master = master;

      // 1950s radial propeller hum (warm low fundamentals)
      const engGain = ctx.createGain();
      engGain.gain.value = 0;
      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 260;
      engFilter.connect(engGain);
      engGain.connect(master);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 48;
      osc1.connect(engFilter);
      osc1.start();

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 96;
      osc2.connect(engFilter);
      osc2.start();

      this.engineOsc = osc1;
      this.engineSub = osc2;
      this.engineGain = engGain;
      this.engineFilter = engFilter;

      // Shared white-noise buffer for autumn wind & water spray
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Wind rush
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 0.8;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.02;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
      this.windFilter = windFilter;
      this.windGain = windGain;

      // Water planing spray hiss
      const spraySrc = ctx.createBufferSource();
      spraySrc.buffer = buf;
      spraySrc.loop = true;
      const sprayFilter = ctx.createBiquadFilter();
      sprayFilter.type = 'bandpass';
      sprayFilter.frequency.value = 1400;
      sprayFilter.Q.value = 0.65;
      const sprayGain = ctx.createGain();
      sprayGain.gain.value = 0;
      spraySrc.connect(sprayFilter);
      sprayFilter.connect(sprayGain);
      sprayGain.connect(master);
      spraySrc.start();
      this.sprayFilter = sprayFilter;
      this.sprayGain = sprayGain;

      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  setFlight({ throttle = 0, speed = 0, spray = 0, alt = 0 }) {
    this._throttle = clamp(throttle, 0, 1);
    this._speed = clamp(speed, 0, 40);
    this._spray = clamp(spray, 0, 1);
    this._alt = clamp(alt, 0, 80);
  }

  chime(notes = [523.25, 659.25, 783.99]) {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + idx * 0.09);
      g.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.09 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 1.1);
      osc.connect(g);
      g.connect(this.master);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 1.15);
    });
  }

  update() {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 36 + this._throttle * 58 + this._speed * 0.85;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(rpm * 1.98, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(160 + this._throttle * 340, t, 0.08);
    this.engineGain.gain.setTargetAtTime(this._throttle * 0.14, t, 0.12);

    const windVol = 0.015 + clamp(this._speed / 30, 0, 1) * 0.11 + clamp(this._alt / 60, 0, 1) * 0.04;
    this.windGain.gain.setTargetAtTime(windVol, t, 0.12);
    this.windFilter.frequency.setTargetAtTime(340 + this._speed * 22, t, 0.12);

    this.sprayGain.gain.setTargetAtTime(this._spray * 0.16, t, 0.06);
    this.sprayFilter.frequency.setTargetAtTime(1100 + this._speed * 40, t, 0.08);
  }
}
