// Gameplay: time of day, sun / grass / moon interactions, observation position, hints, behaviour of both giraffes.
import * as THREE from 'three';
import { R_CAM, STATIONS, SITES, BROWSE, BG_SPOTS, applyLighting, dirFromElAz } from './world.js';
import { shared, MAX_TUFTS } from './grass.js';
import { SUN_DISC } from './sky.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const S0 = 11;               // late-afternoon sun elevation at the start of each dusk
const CAM_H = 1.15;

export class Game {
  constructor(o) {
    Object.assign(this, o); // renderer, camera, W, main, bg, sound, store, hand, dom
    this.t = 0;
    this.phase = 'dusk'; this.phaseT = 0;
    this.sunEl = S0; this.sunAz = 6; this.moonEl = -10; this.moonAz = 0; this.moonVis = 0;
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
    this.dayPath = null;
    this.cycle = 0;
    // camera
    const saved = this.store.load();
    this.phi = saved; this.phiTarget = saved; this.camYaw = 0; this.camPitch = 3; this.lookPt = new THREE.Vector3(0, 1.6, 0);
    this.camMoved = 0; this.lastSaved = saved;
    // input
    this.drag = null; this.idle = 0; this.demoShown = false; this.lastInputT = 0;
    this.particles = o.particles;
    // giraffes
    this.site = 0; this.siteHeading = 0; this.lieSide = 1;
    this.mainState = 'idle'; this.mainT = 0; this.remCount = 0; this.firstRem = true;
    this.arousal = 0; this.bgArousal = 0;
    this.bgState = 'browse'; this.bgT = 0; this.bgSpot = 0;
    this.disc = { pillow: 0, peek: 0, sideA: 0, sideB: 0, ears: 0, wake: 0, trace: 0 };
    this.log = [];
    this.nightStations = new Set(); this.morningStations = new Set();
    this.keyAnim = false;
    this.invite = null;
    this.setupCycle(true);
    this.sunAz = this.clearSkyAz(S0, 1);
  }

  ev(name, extra) { const e = { t: +this.t.toFixed(1), phase: this.phase, name, ...(extra || {}) }; this.log.push(e); if (this.log.length > 300) this.log.shift(); }

  // ------------------------------------------------------------------------------------------ cycle
  setupCycle(first) {
    const r = this.W.rnd;
    this.site = first ? 0 : (this.nextSite !== undefined ? this.nextSite : (this.site + 1) % SITES.length);
    this.siteHeading = (r() - 0.5) * 40 * D2R;
    this.lieSide = r() < 0.5 ? 1 : -1;
    if (first) {
      // first evening: the pillow is on the far side from where we watch, so the head disappears behind the body
      // and overlaps the hind leg; the out-leg flank faces the observer
      this.lieSide = this.phi >= 0 ? 1 : -1;
      const camA = this.phi * D2R; // heading that shows the right flank (+1) or left flank (-1) obliquely
      this.siteHeading = -camA * 0.5 + this.lieSide * 10 * D2R;
    }
    this.browse = BROWSE[Math.floor(r() * BROWSE.length)];
    const [sx, sz] = SITES[this.site];
    // traces of earlier nights stay, slowly recovering
    if (!first) { this.W.press.fade(0.3); this.W.prints.fade(0.7); }
    // vary which stems overlap the view each evening: one tuft per station stands in the line of sight
    for (const t of this.W.tufts) {
      if (!t.peek) continue;
      const si = STATIONS.reduce((b, s, i) => (Math.abs(s - t.psi) < Math.abs(STATIONS[b] - t.psi) ? i : b), 0);
      const a = STATIONS[si] * D2R, cx = -R_CAM * Math.sin(a), cz = R_CAM * Math.cos(a);
      const dx = sx - cx, dz = sz - cz, d = Math.hypot(dx, dz);
      const side = (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.22);
      const along = 2.4 + r() * 0.4;
      this.W.moveTuft(t, cx + dx / d * along - dz / d * side, cz + dz / d * along + dx / d * side);
    }
    if (first) {
      const [ax, az, ah] = this.approachOf(this.site);
      this.main.place(ax, az, ah);
      this.main.play([{ pose: this.main.P.lookDown, dur: 0.01 }]);
      this.bg.place(BG_SPOTS[0][0], BG_SPOTS[0][1], 2.6);
    }
  }

  // sky object helpers
  giraffeAz() {
    const c = this.camPos(this.phi);
    const f = this.mainFocus();
    return Math.atan2(f.x - c.x, -(f.z - c.z)) * R2D;
  }
  camPos(phi, out = new THREE.Vector3()) { const a = phi * D2R, r = this.camR || R_CAM; return out.set(-r * Math.sin(a), this.camH || CAM_H, r * Math.cos(a)); }
  // standing place beside a resting site, looking down at it (body seen from the side)
  approachOf(i) {
    const [sx, sz] = SITES[i];
    const s = sx > 0.3 ? 1 : -1;
    return [sx + s * 1.9, sz - 0.5, s > 0 ? -Math.PI / 2 + 0.15 : Math.PI / 2 - 0.15];
  }
  traceFocus() { return (this.phase === 'dawn' || this.phase === 'morning') && this.morningStations.size < 2 && this.phaseT < 30; }
  mainFocus(out = new THREE.Vector3()) {
    if (this.traceFocus() && this.mainState !== 'rising') { const [sx, sz] = SITES[this.site]; return out.set(sx, 0.6, sz); }
    const p = this.main.pos;
    const lying = this.main.posture !== 'stand';
    return out.set(p.x, lying ? 0.75 : 1.9, p.z);
  }

  // choose a sky direction near the animal that no tree crown hides from the observer
  clearSkyAz(el, prefer) {
    const c = this.camPos(this.phi), g = this.giraffeAz();
    const blocked = (az) => {
      const d = dirFromElAz(el * D2R, az * D2R);
      for (const t of this.W.trees) {
        const H = t.userData.H, R = t.userData.crownR;
        const cc = new THREE.Vector3(t.position.x, H - 0.4, t.position.z).sub(c);
        const along = cc.dot(d); if (along < 0) continue;
        const perp = cc.clone().addScaledVector(d, -along);
        if (Math.abs(perp.y) < 1.4 && Math.hypot(perp.x, perp.z) < R + 1.0) return true;
      }
      return false;
    };
    for (const k of [7, 10, 13, 4, 16]) for (const sgn of [prefer, -prefer]) { const az = g + sgn * k; if (!blocked(az)) return az; }
    return g + prefer * 7;
  }
  startDusk() {
    this.phase = 'dusk'; this.phaseT = 0;
    this.sunEl = S0;
    this.sunAz = this.clearSkyAz(S0, this.W.rnd() < 0.5 ? -1 : 1);
    this.moonVis = 0; this.nightA = 0; this.nightB = 0; this.disc.traceSeenThisMorning = false;
    this.cycle++;
    this.ev('dusk');
  }

  // ------------------------------------------------------------------------------------------ update
  update(dt) {
    if (this.frozen) dt = 0;
    this.t += dt; this.phaseT += dt; this.idle += dt;
    this.updateTime(dt);
    this.updateMain(dt);
    this.updateBg(dt);
    this.main.update(dt); this.bg.update(dt);
    this.updateTufts(dt);
    this.updateCamera(dt);
    const env = applyLighting(this.W, this.renderer, this.sunDir, this.moonDir, this.moonVis, this.mainFocus());
    this.env = env;
    this.updateShadowCam();
    this.updateHints(dt);
    this.W.press.update(performance.now());
    this.particles.update(dt);
    shared.uTime.value = this.t;
    const dewT = this.phase === 'dawn' ? 1 : this.phase === 'morning' ? clamp(1 - (this.phaseT - 30) / 25, 0, 1) : this.phase === 'day' ? 0 : 0;
    shared.uDew.value += (dewT - shared.uDew.value) * Math.min(1, dt * 0.5);
    this.W.sky.uni.uTime.value = this.t;
    if (this.sound.ok) this.sound.ambient(dt, { day: env.day, gold: env.gold, night: env.night, morning: (this.phase === 'dawn' || this.phase === 'morning') ? 1 : 0 });
  }

  updateTime(dt) {
    const p = this.phase;
    if (p === 'dusk') {
      if (this.sunEl <= -0.6) { this.phase = 'twilight'; this.phaseT = 0; this.ev('sunset'); }
    } else if (p === 'twilight') {
      this.sunEl = lerp(-0.6, -10, clamp(this.phaseT / 12, 0, 1));
      if (this.phaseT > 7 && this.moonVis === 0) { this.moonAz = this.giraffeAz() + (this.W.rnd() < 0.5 ? -1 : 1) * (6 + this.W.rnd() * 4); this.moonEl = 22; }
      if (this.phaseT > 7) this.moonVis = clamp((this.phaseT - 7) / 5, 0, 1);
      if (this.phaseT >= 12) { this.phase = 'night'; this.phaseT = 0; this.ev('night'); this.nightStations = new Set([this.station()]); }
    } else if (p === 'night') {
      // as the night goes on the moon travels; once it is time to end the night it comes round into view
      const explored = (this.nightA && this.nightB) || this.nightStations.size >= 3 || this.phaseT > 50;
      if (explored && !this.skyReach(this.moonAz) && !(this.drag && this.drag.type === 'moon')) {
        const g = this.giraffeAz() + 8; let da = g - this.moonAz; da = ((da + 540) % 360) - 180;
        this.moonAz += clamp(da, -6 * dt, 6 * dt);
      }
      if (this.moonEl <= 0.6) {
        this.phase = 'dawn'; this.phaseT = 0; this.ev('moonset');
        this.riseAz = this.camYaw + 180 + (this.W.rnd() < 0.5 ? -1 : 1) * 72; this.sunEl = -9;
      }
    } else if (p === 'dawn') {
      const k = clamp(this.phaseT / 10, 0, 1);
      this.sunAz = this.riseAz; this.sunEl = lerp(-9, 2.5, k);
      this.moonVis = clamp(1 - this.phaseT / 3, 0, 1);
      if (k >= 1) { this.phase = 'morning'; this.phaseT = 0; this.morningStations = new Set([this.station()]); this.ev('morning'); this.W.press.fade(0.0); }
    } else if (p === 'morning') {
      this.sunEl = Math.min(10, 2.5 + this.phaseT * 0.12);
      const explored = this.disc.trace && (this.morningStations.size >= 2 || this.phaseT > 40);
      if ((explored && this.phaseT > 14) || this.phaseT > 75) {
        this.phase = 'day'; this.phaseT = 0; this.ev('day');
        this.dayPath = { el0: this.sunEl, az0: this.sunAz };
      }
    } else if (p === 'day') {
      const k = clamp(this.phaseT / 16, 0, 1);
      if (this.setAz === undefined || this.phaseT < 0.05) this.setAz = this.clearSkyAz(S0, 1);
      const setAz = this.setAz;
      // rise -> high noon -> lower into the current view
      const d0 = dirFromElAz(this.dayPath.el0 * D2R, this.dayPath.az0 * D2R);
      const d2 = dirFromElAz(S0 * D2R, setAz * D2R);
      const top = d0.clone().add(d2).normalize(); top.y = 0; top.normalize(); top.y = 3.2; top.normalize();
      const d = k < 0.5 ? d0.clone().lerp(top, ease(k * 2)) : top.clone().lerp(d2, ease((k - 0.5) * 2));
      d.normalize();
      this.sunEl = Math.asin(d.y) * R2D; this.sunAz = Math.atan2(d.x, -d.z) * R2D;
      if (k >= 1) { this.setupCycle(false); this.startDusk(); this.sunAz = setAz; this.sunEl = S0; this.setAz = undefined; }
    }
    dirFromElAz(this.sunEl * D2R, this.sunAz * D2R, this.sunDir);
    dirFromElAz(this.moonEl * D2R, this.moonAz * D2R, this.moonDir);
    if (this.phase === 'dusk' || this.phase === 'day') this.moonVis = 0;
  }

  debugJump(name) {
    const A = this.main, P = A.P, s = this.lieSide;
    const [sx, sz] = SITES[this.site];
    const lieNow = (pose) => { A.walk = null; A.place(sx, sz, this.siteHeading); A.play([{ pose, dur: 0.05 }]); A.update(0.1); A.update(0.1); A.posture = 'lying'; };
    if (name === 'rem' || name === 'rest') {
      this.phase = 'night'; this.phaseT = 0; this.sunEl = -10; this.moonVis = 1; this.moonEl = 22; this.moonAz = this.giraffeAz() + 7;
      if (name === 'rem') { lieNow(P.rem(s)); this.setMainState('rem'); A.posture = 'rem'; this.firstRem = false; }
      else { lieNow(P.lie(s)); this.setMainState('rest'); this.mainT = -999; }
      this.stampContacts();
    }
    if (name === 'morning') {
      this.phase = 'night'; this.sunEl = -10; this.moonVis = 1; this.moonEl = 0.5; lieNow(P.lie(s)); this.setMainState('rest'); this.stampContacts();
      this.disc.sideA = this.disc.sideB = 1;
    }
    if (name === 'phi') { /* no-op */ }
    return this.mainState;
  }
  setPhi(p) { this.phi = p; this.phiTarget = p; }

  // ------------------------------------------------------------------------------------------ main giraffe
  setMainState(s) { this.mainState = s; this.mainT = 0; }
  updateMain(dt) {
    const A = this.main, P = A.P;
    this.mainT += dt;
    this.arousal = Math.max(0, this.arousal - dt * 0.35);
    const ph = this.phase, se = this.sunEl;
    const [sx, sz] = SITES[this.site];
    const dusky = ph === 'dusk' || ph === 'twilight' || ph === 'night';
    // eyes narrow with the low sun
    switch (this.mainState) {
      case 'idle': {
        A.chewing = true; A.posture = 'stand';
        A.eyeTarget = clamp(0.45 + (se - 6) / 10, 0.5, 0.95);
        if (!A.busy() && this.mainT > 3) {
          this.mainT = 0;
          A.play([{ pose: Math.random() < 0.6 ? P.lookDown : P.stand, dur: 2.2 }]);
        }
        if (ph === 'dusk' && se <= 7) { this.setMainState('doze'); A.play([{ pose: P.doze, dur: 2.5 }]); }
        if (ph === 'dusk' && se <= 4.2) this.setMainState('toSite');
        break;
      }
      case 'doze':
        A.eyeTarget = 0.35; A.chewing = false; A.earL.td = A.earR.td = 0.35;
        if ((ph === 'dusk' && se <= 4.2) || ph === 'twilight' || ph === 'night') this.setMainState('toSite');
        if (ph === 'morning' || ph === 'day') this.setMainState('toBrowse');
        break;
      case 'toSite': {
        A.eyeTarget = 0.55;
        A.walkTo(sx, sz, this.siteHeading, () => this.lieDown());
        this.setMainState('walking');
        break;
      }
      case 'walking': A.posture = 'stand'; break;
      case 'lyingDown': this.keyAnim = true; break;
      case 'rest': {
        A.posture = 'lying'; A.chewing = true; this.keyAnim = false;
        A.eyeTarget = 0.6; A.earL.td = A.earR.td = 0.15;
        const dark = this.sunEl <= 0.2;
        const wait = this.firstRem ? 2.2 : 9 + Math.random() * 6;
        if (dark && this.mainT > wait && !A.busy()) this.toRem();
        else if (!dark && this.mainT > 6 && !A.busy() && Math.random() < dt * 0.15) { A.play([{ pose: P.lieAlert(this.lieSide), dur: 1.4 }, { pose: P.lie(this.lieSide), dur: 2.0, start: () => {} }]); }
        if (ph === 'dawn' || ph === 'morning' || ph === 'day') this.rise();
        break;
      }
      case 'toRem': this.keyAnim = true; break;
      case 'rem': {
        A.posture = 'rem'; A.chewing = false; A.eyeTarget = 0.0; A.earL.td = A.earR.td = 0.55;
        if (Math.random() < dt * 0.4) A.twitch = 0.4 + Math.random() * 0.4;
        if (Math.random() < dt * 0.3) (Math.random() < 0.5 ? A.earL : A.earR).flick = 0.6;
        if (this.mainT > 22 + Math.random() * 10 && !A.busy()) this.wakeFromRem(false);
        if ((ph === 'dawn' || ph === 'morning' || ph === 'day') && !A.busy()) this.wakeFromRem(false);
        break;
      }
      case 'awake': {
        A.posture = 'lying'; A.chewing = this.mainT > 3; A.eyeTarget = 0.85; this.keyAnim = false;
        if ((ph === 'dawn' || ph === 'morning' || ph === 'day') && !A.busy()) { this.rise(); break; }
        if (this.mainT > 7 + Math.random() * 6 && !A.busy()) {
          this.remCount++;
          if (this.remCount >= 2 && Math.random() < 0.4 && ph === 'night') { this.reRest(); }
          else { this.setMainState('rest'); A.play([{ pose: P.lie(this.lieSide), dur: 2.2 }]); }
        }
        break;
      }
      case 'standNight': {
        A.posture = 'stand'; A.eyeTarget = 0.5; A.chewing = false;
        if (this.mainT > 8 && !A.busy()) {
          // settle again a little further on, maybe on the other hip
          this.lieSide = Math.random() < 0.5 ? 1 : -1;
          const f = A.forward();
          A.walkTo(A.pos.x + f.x * 0.7, A.pos.z + f.z * 0.7, this.siteHeading + (Math.random() - 0.5) * 0.4, () => this.lieDown());
          this.setMainState('walking');
        }
        if (ph === 'dawn' || ph === 'morning') this.setMainState('toBrowse');
        break;
      }
      case 'rising': this.keyAnim = true; break;
      case 'toBrowse': {
        A.posture = 'stand'; A.eyeTarget = 0.95;
        const [bx, bz] = this.browse;
        const dx = bx - A.pos.x, dz = bz - A.pos.z, d = Math.hypot(dx, dz);
        const tx = bx - dx / d * 2.3, tz = bz - dz / d * 2.3;
        A.walkTo(tx, tz, Math.atan2(dx, dz), () => { this.setMainState('browse'); });
        this.setMainState('walking');
        break;
      }
      case 'browse': {
        A.posture = 'stand'; A.chewing = true; A.eyeTarget = 0.95; this.keyAnim = false;
        if (!A.busy() && this.mainT > 2.5) { this.mainT = 0; A.play([{ pose: Math.random() < 0.65 ? P.alert : P.stand, dur: 2.5 }]); }
        if (ph === 'day' && this.phaseT > 7) {
          // head to the next resting place and wait there for the evening
          this.nextSite = (this.site + 1 + Math.floor(this.W.rnd() * (SITES.length - 1))) % SITES.length;
          const [nx, nz, nh] = this.approachOf(this.nextSite);
          this.setMainState('walking');
          A.walkTo(nx, nz, nh, () => { this.setMainState('idle'); });
        }
        break;
      }
    }
    // after the day, place the approach so the next dusk starts near the (new) site
    if (dusky && ph !== 'dusk' && (this.mainState === 'idle' || this.mainState === 'doze')) this.setMainState('toSite');
  }
  lieDown() {
    const A = this.main, P = A.P, s = this.lieSide;
    if (this.phase === 'dawn' || this.phase === 'morning' || this.phase === 'day') { this.setMainState('toBrowse'); return; }
    this.setMainState('lyingDown'); this.keyAnim = true;
    A.posture = 'down';
    A.play([
      { pose: P.lookDown, dur: 1.3 },
      { pose: P.prep, dur: 1.6 },
      { pose: P.kneel, dur: 2.3, end: () => { this.sound.thump(); this.stampHooves(0.6); } },
      { pose: () => P.lieLow(s), dur: 2.4, end: () => { this.sound.thump(); } },
      { pose: () => P.lie(s), dur: 1.8, end: () => { A.posture = 'lying'; this.stampContacts(); this.setMainState('rest'); this.ev('lying', { side: s }); } },
    ]);
  }
  toRem() {
    const A = this.main, P = A.P, s = this.lieSide;
    this.setMainState('toRem'); this.keyAnim = true;
    A.play([
      { pose: () => P.lieBack(s), dur: 1.6 },
      { pose: () => P.rem(s), dur: 3.2, end: () => {
        this.setMainState('rem'); this.keyAnim = false;
        if (this.firstRem) { this.firstRem = false; this.disc.pillow = 1; this.sound.success(0); this.ev('discover:pillow'); this.particles.sparkle(this.headWorld(), 12); }
        else this.ev('rem');
      } },
    ]);
  }
  wakeFromRem(bySound) {
    const A = this.main, P = A.P, s = this.lieSide;
    this.setMainState('waking');
    A.play([{ pose: () => P.lieAlert(s), dur: bySound ? 2.2 : 2.8, end: () => { this.setMainState('awake'); } }]);
    if (bySound) { this.disc.wake = 1; this.ev('discover:wake-by-sound'); }
  }
  reRest() {
    const A = this.main, P = A.P, s = this.lieSide;
    this.setMainState('rising'); this.keyAnim = true;
    this.stampContacts();
    A.play([
      { pose: () => P.lieBack(s), dur: 1.2 },
      { pose: P.riseHind, dur: 2.4 },
      { pose: () => P.riseFore(s), dur: 1.6 },
      { pose: P.doze, dur: 1.6, end: () => { A.posture = 'stand'; this.stampHooves(1); this.setMainState('standNight'); this.ev('re-rest'); } },
    ]);
    A.posture = 'rising';
  }
  rise() {
    const A = this.main, P = A.P, s = this.lieSide;
    if (this.mainState === 'rising') return;
    this.setMainState('rising'); this.keyAnim = true;
    this.stampContacts();
    A.posture = 'rising';
    A.play([
      { pose: () => P.lieBack(s), dur: 1.3 },
      { pose: P.riseHind, dur: 2.4, end: () => this.stampHooves(0.8) },
      { pose: () => P.riseFore(s), dur: 1.7 },
      { pose: P.stand, dur: 1.5, end: () => { A.posture = 'stand'; this.stampHooves(1); this.setMainState('toBrowse'); this.ev('rose'); } },
    ]);
  }
  stampContacts() {
    const pts = this.main.contactPoints(0.11);
    for (let i = 0; i < pts.length; i++) this.W.press.stamp(pts[i][0], pts[i][1], 0.13, 1);
    // flattened halo around the body
    const p = this.main.pos;
    this.W.press.stamp(p.x, p.z, 0.75, 0.25);
    this.ev('contacts', { n: pts.length });
  }
  stampHooves(k) {
    for (const h of this.main.hoofPositions()) { this.W.prints.add(h.x, h.z, Math.atan2(-Math.sin(this.main.heading), Math.cos(this.main.heading)), 0.26, k); this.W.press.stamp(h.x, h.z, 0.12, 0.6); }
  }
  headWorld() { return this.main.g.probeWorld('head', 2.0, 3.85, 0); }

  // ------------------------------------------------------------------------------------------ background giraffe
  updateBg(dt) {
    const A = this.bg, P = A.P;
    this.bgT += dt;
    this.bgArousal = Math.max(0, this.bgArousal - dt * 0.4);
    const night = this.phase === 'night' || this.phase === 'twilight';
    switch (this.bgState) {
      case 'browse':
        A.posture = 'stand'; A.chewing = true; A.eyeTarget = 0.9;
        if (!A.busy() && this.bgT > 3 + Math.random() * 2) { A.play([{ pose: Math.random() < 0.5 ? P.alert : P.stand, dur: 2.6 }]); }
        if (this.bgT > 14 + Math.random() * 10) {
          // independent choices; at night it sometimes lies down when the main one is up, but not as a rule
          const mainDown = this.main.posture !== 'stand';
          if (night && (!mainDown || Math.random() < 0.35)) this.bgLie();
          else this.bgWalk();
        }
        break;
      case 'walk': A.posture = 'stand'; break;
      case 'lie':
        A.posture = 'lying'; A.chewing = true; A.eyeTarget = 0.55;
        if (night && this.bgT > 10 && !A.busy() && Math.random() < dt * 0.08) { this.bgState = 'rem'; this.bgT = 0; A.play([{ pose: () => P.rem(-1), dur: 3.5 }]); }
        if ((!night && this.bgT > 6) || (night && this.bgT > 40 && this.main.posture !== 'stand' && Math.random() < dt * 0.05)) this.bgRise();
        break;
      case 'rem':
        A.posture = 'rem'; A.chewing = false; A.eyeTarget = 0;
        if (this.bgT > 20 || !night || this.bgArousal > 1.2) { this.bgState = 'lie'; this.bgT = 0; A.play([{ pose: () => P.lieAlert(-1), dur: 2.6 }]); }
        break;
      case 'down': case 'up': break;
    }
  }
  bgWalk() {
    const A = this.bg;
    this.bgSpot = (this.bgSpot + 1 + Math.floor(Math.random() * (BG_SPOTS.length - 1))) % BG_SPOTS.length;
    const [x, z] = BG_SPOTS[this.bgSpot];
    this.bgState = 'walk'; this.bgT = 0;
    A.walkTo(x, z, Math.random() * 6.28, () => { this.bgState = 'browse'; this.bgT = 0; });
  }
  bgLie() {
    const A = this.bg, P = A.P;
    this.bgState = 'down'; this.bgT = 0; A.posture = 'down';
    A.play([{ pose: P.prep, dur: 1.8 }, { pose: P.kneel, dur: 2.4 }, { pose: () => P.lieLow(-1), dur: 2.4 }, { pose: () => P.lie(-1), dur: 2.0, end: () => { this.bgState = 'lie'; this.bgT = 0; } }]);
  }
  bgRise() {
    const A = this.bg, P = A.P;
    this.bgState = 'up'; this.bgT = 0; A.posture = 'rising';
    A.play([{ pose: () => P.lieBack(-1), dur: 1.2 }, { pose: P.riseHind, dur: 2.4 }, { pose: () => P.riseFore(-1), dur: 1.7 }, { pose: P.stand, dur: 1.5, end: () => { this.bgState = 'browse'; this.bgT = 0; A.posture = 'stand'; } }]);
  }

  // sound from the grass reaches both animals
  hearRustle(x, z, intensity, dt) {
    for (const [A, isMain] of [[this.main, true], [this.bg, false]]) {
      const dx = x - A.pos.x, dz = z - A.pos.z, d = Math.hypot(dx, dz);
      const loud = intensity / (1 + d * d * 0.02);
      if (loud < 0.02) continue;
      // direction of the sound in the animal's frame
      const rel = Math.atan2(dx, dz) - A.heading;
      const ang = Math.atan2(Math.sin(rel), Math.cos(rel));
      const posture = A.posture;
      if (isMain) this.arousal += loud * dt * 8; else this.bgArousal += loud * dt * 8;
      const ar = isMain ? this.arousal : this.bgArousal;
      if (posture === 'rem') {
        // deep: only small ear movements unless the rustle goes on or is loud
        if (Math.random() < dt * 2) (ang > 0 ? A.earL : A.earR).flick = 0.5;
        if (isMain && ar > 0.9 && this.mainState === 'rem') this.wakeFromRem(true);
      } else {
        // awake (standing or lying with the neck up): ears turn toward the sound, head follows if it is louder
        const yawEar = clamp(Math.abs(ang) < Math.PI / 2 ? 0.9 : -0.4, -0.6, 1.0);
        A.earL.ty = yawEar; A.earR.ty = yawEar;
        A.earL.td = A.earR.td = 0;
        A.earT = 2.5;
        if (ar > 0.35) { A.look.ty = clamp(-ang, -0.9, 0.9) * 0.6; A.look.tp = -0.05; A.look.tw = 1; A.lookT = 3; }
        if (isMain && posture === 'lying' && !this.disc.ears) { this.disc.ears = 1; this.ev('discover:ears-while-lying'); }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ tufts
  updateTufts(dt) {
    const cam = this.camera.position;
    const hiIdx = this.invite && this.invite.kind === 'grass' ? this.invite.tuft : null;
    for (const t of this.W.tufts) {
      if (!t.idx) continue;
      // spring back with damping (stems recover in a decaying sway)
      const k = 26, c = 2.2;
      let tx = 0, tz = 0;
      if (t.hold) { tx = t.hold.x; tz = t.hold.y; }
      // the observer pushes stems aside when walking through the grass
      const dx = t.x - cam.x, dz = t.z - cam.z, d = Math.hypot(dx, dz);
      if (d < 1.6 && this.camMoving) { const push = (1.6 - d) / 1.6 * 1.1; tx += dx / d * push; tz += dz / d * push; }
      if (t === hiIdx && !this.keyAnim) {
        // invited tuft: gentle rhythmic bounce
        const s = Math.sin(this.t * 3.2) * 0.12 * (this.hintOn ? 1 : 0);
        const right = this.camRight;
        tx += right.x * s; tz += right.z * s;
      }
      const ax = (tx - t.bend.x) * k - t.vel.x * c, az = (tz - t.bend.y) * k - t.vel.y * c;
      if (t.hold) { t.bend.x += (tx - t.bend.x) * Math.min(1, dt * 14); t.bend.y += (tz - t.bend.y) * Math.min(1, dt * 14); t.vel.set(0, 0); }
      else { t.vel.x += ax * dt; t.vel.y += az * dt; t.bend.x += t.vel.x * dt; t.bend.y += t.vel.y * dt; }
      const hi = t === hiIdx && this.hintOn ? 0.6 + 0.4 * Math.sin(this.t * 3.2) : 0;
      t.hi += (hi - t.hi) * Math.min(1, dt * 4);
      shared.uTuft.value[t.idx].set(t.bend.x, t.bend.y, t.hi, 0);
    }
  }

  // ------------------------------------------------------------------------------------------ camera
  station() { let best = 0, bd = 1e9; STATIONS.forEach((s, i) => { const d = Math.abs(s - this.phi); if (d < bd) { bd = d; best = i; } }); return best; }
  updateCamera(dt) {
    const cam = this.camera;
    // glide to target
    const prev = this.phi;
    if (!this.drag || this.drag.type !== 'grass' || !this.drag.camMode) {
      this.phi += (this.phiTarget - this.phi) * Math.min(1, dt * 1.8);
    }
    this.camMoving = Math.abs(this.phi - prev) > dt * 2 || Math.abs((this.camR || R_CAM) - (this._lastR || R_CAM)) > dt * 0.3; this._lastR = this.camR || R_CAM;
    // the observer stands up to look over the grass at the vacated resting place in the morning
    // ...and steps forward through the gap in the grass to look at it closely
    const tf = this.traceFocus() && this.mainState !== 'rising';
    const wantH = tf ? 1.7 : CAM_H, wantR = tf ? 7.6 : R_CAM;
    this.camH = (this.camH || CAM_H) + (wantH - (this.camH || CAM_H)) * Math.min(1, dt * 0.8);
    const r0 = this.camR || R_CAM;
    this.camR = r0 + (wantR - r0) * Math.min(1, dt * 0.6);
    const pos = this.camPos(this.phi);
    // gentle breathing of the observer (hand-held feel)
    pos.y += Math.sin(this.t * 0.7) * 0.012;
    cam.position.copy(pos);
    // look target: the main giraffe, biased toward the invited sky object when both fit
    const f = this.mainFocus();
    this.lookPt.lerp(f, Math.min(1, dt * 1.5));
    const dir = this.lookPt.clone().sub(pos);
    let yaw = Math.atan2(dir.x, -dir.z) * R2D;
    const dist = Math.hypot(dir.x, dir.z);
    const vfov = cam.fov, hfov = 2 * Math.atan(Math.tan(vfov * D2R / 2) * cam.aspect) * R2D;
    const ch = this.camH || CAM_H; let pitchLo = Math.atan2(-ch, dist) * R2D - 2, pitchHi = Math.atan2(this.main.posture === 'stand' ? 4.4 - ch : 2.9 - ch, dist) * R2D + 2;
    const sky = this.skyGoal || (this.drag && (this.drag.type === 'sun' || this.drag.type === 'moon')) ? this.skyTarget() : null;
    // frame the animal (zoom so the face is readable) and, when it is the goal, the sun or moon too
    const ext = this.subjectExtent(pos, yaw);
    let left = -ext.h - 3, right = ext.h + 3;
    let lo = Math.min(pitchLo, ext.lo - 2), hi = ext.hi + 2;
    if (sky) {
      let da = sky.az - yaw; da = ((da + 540) % 360) - 180;
      left = Math.min(left, da - 5); right = Math.max(right, da + 5);
      hi = Math.max(hi, sky.el + 5 + this.safeTopDeg());
    }
    const aspect = cam.aspect;
    const needH = right - left + 4;
    const needV = Math.max(hi - lo + 6, 2 * Math.atan(Math.tan(needH * D2R / 2) / aspect) * R2D);
    // while walking through the grass the view opens up: the resting animal and the one standing far behind in one sweep
    const sweeping = this.camMoving || (this.drag && this.drag.camMode);
    this.sweepK = clamp((this.sweepK || 0) + (sweeping ? dt * 1.5 : -dt * 0.6), 0, 1);
    const fovT = lerp(clamp(needV, 24, this.baseFov || 60), this.baseFov || 60, this.sweepK);
    cam.fov += (fovT - cam.fov) * Math.min(1, dt * 1.5);
    cam.updateProjectionMatrix();
    const hNow = 2 * Math.atan(Math.tan(cam.fov * D2R / 2) * aspect) * R2D;
    // centre horizontally on the needed span when it fits, otherwise keep the animal in view
    let off = (left + right) / 2;
    if (needH > hNow) off = clamp(off, -(hNow / 2 - ext.h - 2), hNow / 2 - ext.h - 2);
    yaw += off;
    let pitch = (lo + hi) / 2;
    if (hi - lo > cam.fov - 3) pitch = lo + (cam.fov - 3) / 2;
    this.camYaw = lerpAngle(this.camYaw, yaw, Math.min(1, dt * 2.5));
    this.camPitch += (pitch - this.camPitch) * Math.min(1, dt * 2.5);
    const look = dirFromElAz(this.camPitch * D2R, this.camYaw * D2R);
    cam.lookAt(pos.clone().add(look));
    this.camRight = new THREE.Vector3(Math.cos(this.camYaw * D2R), 0, Math.sin(this.camYaw * D2R));
    // record stations visited / save the observation side when settled
    const st = this.station();
    if (Math.abs(this.phi - STATIONS[st]) < 1.5 && !this.drag) {
      if (this.phase === 'night' || this.phase === 'twilight') this.nightStations.add(st);
      if (this.phase === 'morning') this.morningStations.add(st);
      if (STATIONS[st] !== this.lastSaved) { this.lastSaved = STATIONS[st]; this.store.save(STATIONS[st]); this.ev('side', { phi: STATIONS[st] }); }
      this.checkViews(st);
    }
  }
  // angular extent of the main giraffe as seen from the observer (degrees): half-width around yaw, low/high pitch
  subjectExtent(pos, yaw) {
    const g = this.main.g;
    if (!this._ext) this._ext = [['head', 2.27, 3.62, 0], ['head', 1.80, 4.1, 0], ['tail0', -1.05, 2.0, 0], ['fpasR', 0.8, 0, 0.17], ['hpasL', -0.66, 0, -0.17], ['chest', 0.9, 1.6, 0], ['body', 0, 2.5, 0], ['hips', -0.9, 1.6, 0]];
    let hw = 0, lo = 90, hi = -90; const v = new THREE.Vector3();
    let pts = this._ext.map(([n, x, y, z]) => g.probeWorld(n, x, y, z, new THREE.Vector3()));
    if (this.traceFocus() && this.mainState !== 'rising') { const [sx, sz] = SITES[this.site]; pts = []; for (const [dx, dz] of [[-2.0, -1.4], [2.0, -1.4], [-2.0, 1.4], [2.0, 1.4], [0, 0]]) pts.push(new THREE.Vector3(sx + dx, dz === 0 ? 1.2 : 0, sz + dz)); }
    for (const q of pts) {
      v.copy(q);
      const d = v.sub(pos);
      const a = Math.atan2(d.x, -d.z) * R2D; let da = a - yaw; da = ((da + 540) % 360) - 180;
      hw = Math.max(hw, Math.abs(da));
      const el = Math.atan2(d.y, Math.hypot(d.x, d.z)) * R2D;
      lo = Math.min(lo, el); hi = Math.max(hi, el);
    }
    return { h: hw, lo, hi, v: hi - lo };
  }
  safeTopDeg() { return (this.dom.safeTop || 0) / Math.max(1, this.dom.h) * this.camera.fov; }
  skyTarget() {
    if (this.phase === 'dusk' && this.sunEl > -0.6) return { az: this.sunAz, el: this.sunEl };
    if (this.phase === 'night' || (this.phase === 'twilight' && this.moonVis > 0)) return { az: this.moonAz, el: this.moonEl };
    return null;
  }
  // discoveries that depend on where we look from
  checkViews(st) {
    const A = this.main;
    // which side of the animal faces the camera: +1 right flank, -1 left flank
    const cam = this.camera.position;
    const rel = Math.atan2(cam.x - A.pos.x, cam.z - A.pos.z) - A.heading;
    const side = Math.sin(rel) < 0 ? 1 : -1; // camera on the animal's right -> +1
    const oblique = Math.abs(Math.sin(rel)) > 0.55;
    if (this.mainState === 'rem' && oblique) {
      const pillow = -this.lieSide;
      if (side === pillow && !this.nightA) { this.nightA = 1; this.disc.sideA = 1; this.sound.success(1); this.ev('discover:pillow-side'); this.particles.sparkle(this.headWorld(), 10); }
      if (side !== pillow && !this.nightB && this.nightA) { this.nightB = 1; this.disc.sideB = 1; this.sound.success(2); this.ev('discover:legs-side'); }
    }
    if (this.phase === 'morning' && this.mainState !== 'rising') {
      const s = SITES[this.site];
      const away = Math.hypot(A.pos.x - s[0], A.pos.z - s[1]) > 2.5;
      if (away && !this.disc.traceSeenThisMorning) { this.disc.traceSeenThisMorning = true; this.disc.trace = 1; this.sound.success(3); this.ev('discover:trace'); }
    }
  }

  // ------------------------------------------------------------------------------------------ shadows
  updateShadowCam() {
    const key = this.W.key, sc = key.shadow.camera;
    const se = this.sunEl;
    const ext = 15;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.far = 140; sc.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------------------------------ input
  screenOf(v) { const p = v.clone().project(this.camera); return { x: (p.x * 0.5 + 0.5) * this.dom.w, y: (-p.y * 0.5 + 0.5) * this.dom.h, z: p.z }; }
  skyScreen(el, az) { const d = dirFromElAz(el * D2R, az * D2R).multiplyScalar(500).add(this.camera.position); return this.screenOf(d); }
  pickTuft(x, y) {
    let best = null, bd = 1e9;
    for (const t of this.W.tufts) {
      if (!t.idx) continue;
      const dc = Math.hypot(t.x - this.camera.position.x, t.z - this.camera.position.z);
      if (dc > 6.5) continue;
      const base = this.screenOf(new THREE.Vector3(t.x, 0, t.z)), top = this.screenOf(new THREE.Vector3(t.x, t.h, t.z));
      if (base.z > 1 || top.z > 1) continue;
      const halfW = Math.max(36, Math.abs(this.screenOf(new THREE.Vector3(t.x, t.h * 0.5, t.z).addScaledVector(this.camRight, t.wid * 0.75)).x - base.x));
      const inY = y > top.y - 30 && y < base.y + 30;
      const dx = Math.abs(x - base.x);
      if (inY && dx < halfW + 18) { const s = dx + (t.peek ? -20 : 0); if (s < bd) { bd = s; best = t; } }
    }
    return best;
  }
  hitSky(x, y, el, az) {
    const s = this.skyScreen(el, az);
    if (s.z > 1) return false;
    const R = Math.max(64, Math.min(this.dom.w, this.dom.h) * 0.13);
    return Math.hypot(x - s.x, y - s.y) < R;
  }
  pointerDown(id, x, y) {
    this.sound.unlock();
    this.idle = 0; this.demoShown = false; this.hand.hide();
    if (this.drag) return; // one finger at a time
    const d = { id, x0: x, y0: y, x, y, lx: x, ly: y, type: 'none', accX: 0, camMode: false, t0: this.t };
    if (this.phase === 'dusk' && this.sunEl > -0.6 && this.hitSky(x, y, this.sunEl, this.sunAz)) {
      d.type = 'sun';
      // the very first touch moves the sun right away
      this.lowerSun(1.2); this.sound.sunNudge(clamp(this.sunEl / S0, 0, 1));
      this.ev('sun-tap', { el: +this.sunEl.toFixed(2) });
    } else if ((this.phase === 'night' || (this.phase === 'twilight' && this.moonVis > 0.5)) && this.hitSky(x, y, this.moonEl, this.moonAz)) {
      d.type = 'moon'; this.lowerMoon(0.5); this.sound.moonSlide(1, 0.6);
    } else {
      const t = this.pickTuft(x, y);
      if (t) { d.type = 'grass'; d.tuft = t; this.ev('grass-touch', { peek: t.peek }); }
      else { this.localWiggle(x, y); }
    }
    this.drag = d;
  }
  pointerMove(id, x, y) {
    const d = this.drag; if (!d || d.id !== id) return;
    const dx = x - d.lx, dy = y - d.ly; d.lx = x; d.ly = y; d.x = x; d.y = y;
    this.idle = 0;
    const H = this.dom.h, Wd = this.dom.w;
    if (d.type === 'sun') {
      if (dy > 0) { this.lowerSun(dy / (H * 0.42) * S0); this.sound.sunSlide(clamp(this.sunEl / S0, 0, 1), clamp(dy / 12, 0, 1)); }
    } else if (d.type === 'moon') {
      if (dy > 0) { this.lowerMoon(dy / (H * 0.40) * 22); this.sound.moonSlide(clamp(this.moonEl / 22, 0, 1), clamp(dy / 12, 0, 1)); }
    } else if (d.type === 'grass') {
      const t = d.tuft;
      const ox = (x - d.x0) / (Wd * 0.2), oy = (y - d.y0) / (H * 0.3);
      const speed = Math.hypot(dx, dy) / Math.max(1, Wd) * 60;
      // same-direction long swipe moves the observer
      if (Math.sign(dx) === Math.sign(d.accX) || d.accX === 0) d.accX += dx; else d.accX = dx * 0.5 + d.accX * 0.3;
      if (!d.camMode && Math.abs(d.accX) > Wd * 0.3) { d.camMode = true; d.camDir = Math.sign(d.accX); d.phi0 = this.phi; d.xc = x; this.ev('walk-through', { dir: d.camDir }); }
      const bendAmt = clamp(ox, -1.25, 1.25);
      const right = this.camRight;
      t.hold = new THREE.Vector2(right.x * bendAmt + 0.15 * oy * (t.x - this.camera.position.x), right.z * bendAmt + 0.15 * oy * (t.z - this.camera.position.z));
      if (d.camMode) {
        // swipe right -> the observer moves left around the meadow (the grass follows the finger)
        this.phi = clamp(this.phi + dx / Wd * 52, STATIONS[0], STATIONS[STATIONS.length - 1]);
        this.phiTarget = this.phi;
        this.camMoving = true;
      }
      const inten = clamp(speed * 0.5 + Math.abs(bendAmt) * 0.25, 0, 1);
      this.sound.setRustle(inten, clamp(speed, 0, 1));
      const now = performance.now(); const mdt = clamp((now - (d.lt || now)) / 1000, 0, 0.05); d.lt = now;
      this.hearRustle(t.x, t.z, inten, mdt || 1 / 60);
      if (inten > 0.25 && Math.random() < inten * 0.5) this.particles.burst(new THREE.Vector3(t.x, t.h * (0.5 + Math.random() * 0.4), t.z), 1, right.clone().multiplyScalar(Math.sign(dx) || 1));
      if (Math.abs(bendAmt) > 0.55 && t.peek && !this.disc.peek) { this.disc.peek = 1; this.ev('discover:peek'); }
    }
  }
  pointerUp(id) {
    const d = this.drag; if (!d || d.id !== id) return;
    if (d.type === 'grass') {
      d.tuft.hold = null;
      this.sound.setRustle(0, 0);
      if (d.camMode) {
        // continue to the next gap in the swipe direction (position correction)
        const dir = d.camDir;
        let target = null;
        const list = dir > 0 ? STATIONS : STATIONS.slice().reverse();
        for (const s of list) if ((dir > 0 && s > this.phi + 3) || (dir < 0 && s < this.phi - 3)) { target = s; break; }
        if (target === null) target = STATIONS[this.station()];
        this.phiTarget = target;
        this.ev('move', { to: target });
      }
    }
    this.drag = null;
  }
  lowerSun(deg) {
    if (this.phase !== 'dusk') return;
    this.sunEl = Math.max(-0.7, this.sunEl - deg);
    dirFromElAz(this.sunEl * D2R, this.sunAz * D2R, this.sunDir);
  }
  lowerMoon(deg) {
    this.moonEl = Math.max(0.5, this.moonEl - deg);
    this.moonAz += deg * 0.25;
  }
  localWiggle(x, y) {
    // touching something unrelated: only a small local rustle at that spot
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / this.dom.w * 2 - 1, -(y / this.dom.h) * 2 + 1), this.camera);
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(pl, hit) && hit.distanceTo(this.camera.position) < 60) {
      this.particles.burst(hit.setY(0.05), 5, new THREE.Vector3(0, 0, 0));
      this.sound.tick();
    }
  }

  // ------------------------------------------------------------------------------------------ hints
  updateHints(dt) {
    let inv = null;
    const st = this.station();
    if (this.keyAnim || this.mainState === 'lyingDown' || this.mainState === 'toRem' || this.mainState === 'rising') inv = null;
    else if (this.phase === 'dusk') {
      inv = this.skyReach(this.sunAz) ? { kind: 'sun' } : { kind: 'grass', dir: this.dirToward(this.sunAz) };
    } else if (this.phase === 'night' || this.phase === 'twilight') {
      const explored = (this.nightA && this.nightB) || this.nightStations.size >= 3 || this.phaseT > 50;
      if (this.phase === 'night' && explored) {
        inv = this.skyReach(this.moonAz) ? { kind: 'moon' } : { kind: 'grass', dir: this.dirToward(this.moonAz) };
      } else if (this.mainState === 'rem' || this.mainState === 'rest' || this.mainState === 'awake') {
        // look for the pillow from the side; then from the other side
        const pillowDir = this.sideDir(-this.lieSide);
        const dir = !this.nightA ? pillowDir : -pillowDir;
        const peekFirst = !this.disc.peek && this.cycle <= 1 && this.peekTuft(st);
        inv = peekFirst ? { kind: 'grass', tuft: this.peekTuft(st), short: true } : { kind: 'grass', dir };
      }
    } else if (this.phase === 'morning') {
      if (!this.disc.traceSeenThisMorning || this.morningStations.size < 2) inv = { kind: 'grass', dir: this.dirTowardPoint(this.main.pos) || (this.phi > 0 ? -1 : 1) };
    }
    if (inv && inv.kind === 'grass' && !inv.tuft) inv.tuft = this.edgeTuft(st, inv.dir);
    if (inv && inv.kind === 'grass' && !inv.tuft) inv = null;
    if (this.phase === 'dusk' && this.sunEl > -0.6 && this.skyReach(this.sunAz)) this.skyGoal = 'sun';
    else if (this.phase === 'night' && this.skyReach(this.moonAz) && ((this.nightA && this.nightB) || this.nightStations.size >= 3 || this.phaseT > 50)) this.skyGoal = 'moon';
    else this.skyGoal = null;
    this.invite = inv;
    this.hintOn = !!inv;
    // sky glow
    const sky = this.W.sky.uni;
    let glow = 0;
    if (inv && inv.kind === 'sun') { glow = 0.55 + 0.45 * Math.sin(this.t * 3.0); dirFromElAz(this.sunEl * D2R, this.sunAz * D2R, sky.uGlowDir.value); }
    if (inv && inv.kind === 'moon') { glow = 0.55 + 0.45 * Math.sin(this.t * 3.0); dirFromElAz(this.moonEl * D2R, this.moonAz * D2R, sky.uGlowDir.value); }
    sky.uGlow.value += (glow - sky.uGlow.value) * Math.min(1, dt * 5);
    // finger demo after ~4 s without touching (once per idle period)
    if (inv && !this.drag && this.idle > 4 && !this.demoShown) {
      this.demoShown = true;
      this.hand.demo(inv, this);
      this.ev('hint-demo', { kind: inv.kind });
    }
    if (!inv) this.hand.hide();
    this.hand.update(dt, this);
  }
  // can the sky object be brought into the frame together with the animal from here (horizontally)?
  skyReach(az) {
    const g = this.giraffeAz(); let da = az - g; da = ((da + 540) % 360) - 180;
    const hmax = 2 * Math.atan(Math.tan((this.baseFov || 60) * D2R / 2) * this.camera.aspect) * R2D;
    return Math.abs(da) < hmax - 14;
  }
  // +1 means "swipe right" (observer moves left / phi increases)
  dirToward(az) {
    // which way to walk (+1: phi increases) to reach the station that frames this sky direction best
    const cur = this.station(); let best = cur, bd = 1e9;
    STATIONS.forEach((s, i) => { const c = this.camPos(s); const f = this.mainFocus(); const g = Math.atan2(f.x - c.x, -(f.z - c.z)) * R2D; let d = az - g; d = Math.abs(((d + 540) % 360) - 180); if (d < bd - 0.5) { bd = d; best = i; } });
    return best === cur ? 0 : (best > cur ? 1 : -1);
  }
  dirTowardPoint(p) {
    const st = this.station(); let best = null, bd = 1e9;
    STATIONS.forEach((s, i) => { const c = this.camPos(s); const d = Math.abs(Math.atan2(p.x - c.x, -(p.z - c.z)) * R2D - Math.atan2(-c.x, c.z) * R2D * 0) ; void d; });
    // choose the station from which the animal is seen most frontally (closest bearing to the meadow centre line)
    for (let i = 0; i < STATIONS.length; i++) {
      const c = this.camPos(STATIONS[i]);
      const toP = Math.atan2(p.x - c.x, -(p.z - c.z)), toO = Math.atan2(-c.x, -(-c.z));
      const dd = Math.abs(Math.atan2(Math.sin(toP - toO), Math.cos(toP - toO)));
      if (dd < bd) { bd = dd; best = i; }
    }
    if (best === null || best === st) return 0;
    return best > st ? 1 : -1;
  }
  sideDir(side) {
    // camera azimuth change (+1 = phi increases) that brings the given flank (+1 right, -1 left) into view
    const A = this.main;
    const rightWorld = new THREE.Vector3(-Math.cos(A.heading), 0, Math.sin(A.heading)).multiplyScalar(side);
    const want = Math.atan2(-rightWorld.x, rightWorld.z) * R2D; // camera phi that looks at that flank
    return want > this.phi ? 1 : -1;
  }
  peekTuft(st) { return this.W.tufts.find((t) => t.peek && Math.abs(t.psi - STATIONS[st]) < 6) || null; }
  edgeTuft(st, dir) {
    const pk = this.peekTuft(st);
    const onScreen = (t) => { const c = this.camera.position; if (Math.hypot(t.x - c.x, t.z - c.z) > 6) return null; const p = this.screenOf(new THREE.Vector3(t.x, t.h * 0.55, t.z)); return p.z < 1 && p.x > 0.06 * this.dom.w && p.x < 0.94 * this.dom.w && p.y > 0.3 * this.dom.h && p.y < this.dom.h ? p : null; };
    if (pk && onScreen(pk)) return pk;
    // otherwise the visible tuft nearest to the middle of the view
    let best = null, bd = 1e9;
    for (const t of this.W.tufts) { if (!t.idx) continue; const p = onScreen(t); if (!p) continue; const d = Math.abs(p.x - this.dom.w / 2); if (d < bd) { bd = d; best = t; } }
    if (best) return best;
    if (!dir) return pk;
    // a tuft just beyond the gap edge on the side we want to go (swiping it toward the gap moves us)
    const want = STATIONS[st] + (dir > 0 ? 1 : -1) * 8;
    let b2 = null, d2 = 1e9;
    for (const t of this.W.tufts) { if (!t.idx || t.peek) continue; const d = Math.abs(t.psi - want); if (d < d2) { d2 = d; b2 = t; } }
    return b2;
  }
}

function ease(t) { return t * t * (3 - 2 * t); }
function lerpAngle(a, b, k) { let d = b - a; d = ((d + 540) % 360) - 180; return a + d * k; }
export { MAX_TUFTS, SUN_DISC };
