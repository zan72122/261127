// Animation controller for one giraffe: pose sequences, walking gait, secondary motion, ground contact.
import * as THREE from 'three';

const D2R = Math.PI / 180;
const ease = (t) => t * t * (3 - 2 * t);
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpE = new THREE.Euler();
const LEGS = [
  // name, upper chain bones with swing gains, phase offset (lateral sequence walk), hoof probe
  { n: 'LH', up: 'femL', knee: 'tib', s: 'L', fore: false, ph: 0.0 },
  { n: 'LF', up: 'humL', knee: 'rad', s: 'L', fore: true, ph: 0.12 },
  { n: 'RH', up: 'femR', knee: 'tib', s: 'R', fore: false, ph: 0.5 },
  { n: 'RF', up: 'humR', knee: 'rad', s: 'R', fore: true, ph: 0.62 },
];

export class Actor {
  constructor(g, poses, opts = {}) {
    this.g = g; this.P = poses; this.opts = opts;
    this.base = g.copyPose(g.newPose(), poses.stand);
    this.from = g.copyPose(g.newPose(), poses.stand);
    this.to = g.copyPose(g.newPose(), poses.stand);
    this.work = g.newPose();
    this.seq = []; this.step = null; this.stepT = 0;
    this.heading = 0; this.pos = new THREE.Vector3();
    this.walk = null; this.gaitPh = 0; this.walkBlend = 0; this.speed = 0;
    this.lieSide = 1;
    this.posture = 'stand';    // stand | down | lying | rem | rising
    this.eyeOpen = 1; this.eyeTarget = 1; this.blinkT = 2;
    this.earL = { yaw: 0, droop: 0, ty: 0, td: 0 }; this.earR = { yaw: 0, droop: 0, ty: 0, td: 0 };
    this.chew = 0; this.chewing = false;
    this.look = { yaw: 0, pitch: 0, ty: 0, tp: 0, w: 0, tw: 0 };
    this.tailSwish = 0.2; this.t = 0;
    this.twitch = 0;
    this.listeners = {};
    this.lastPlant = [0, 0, 0, 0];
    this.onPrint = null; this.onStep = null;
  }
  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, a) { for (const f of this.listeners[ev] || []) f(a); }

  place(x, z, heading) { this.pos.set(x, 0, z); this.heading = heading; this.syncGroup(); }
  syncGroup() {
    const gr = this.g.group;
    gr.position.copy(this.pos);
    gr.rotation.set(0, this.heading - Math.PI / 2, 0); // local +x faces heading (heading 0 = +z)
  }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  // queue a pose sequence: [{pose, dur, ev?}]
  play(list, replace = true) {
    if (replace) { this.seq = []; }
    for (const s of list) this.seq.push(s);
    if (replace || !this.step) this.nextStep();
  }
  nextStep() {
    this.step = this.seq.shift() || null; this.stepT = 0;
    if (this.step) {
      this.g.copyPose(this.from, this.base);
      this.g.copyPose(this.to, typeof this.step.pose === 'function' ? this.step.pose() : this.step.pose);
      if (this.step.start) this.step.start();
    }
  }
  busy() { return !!this.step || this.seq.length > 0 || !!this.walk; }

  walkTo(x, z, finalHeading, then) {
    this.walk = { tx: x, tz: z, fh: finalHeading, then };
    this.play([{ pose: this.P.stand, dur: 0.6 }]);
  }

  update(dt) {
    this.t += dt;
    const g = this.g;
    // pose sequence
    if (this.step) {
      this.stepT += dt / this.step.dur;
      const k = Math.min(1, this.stepT);
      g.blendPose(this.base, this.from, this.to, this.step.lin ? k : ease(k));
      if (this.step.mid && !this.step.midDone && k > (this.step.midAt || 0.5)) { this.step.midDone = true; this.step.mid(); }
      if (k >= 1) { const done = this.step.end; this.step = null; if (done) done(); if (!this.step) this.nextStep(); }
    }
    // locomotion
    let gaitW = 0;
    if (this.walk && !this.step) {
      const w = this.walk;
      const dx = w.tx - this.pos.x, dz = w.tz - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.35) w.arrived = true;
      const want = Math.atan2(dx, dz);
      let dh = want - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const targetSpeed = !w.arrived ? Math.min(1.0, 0.45 + dist * 0.4) * (Math.abs(dh) > 1.3 ? 0.55 : 1) : 0;
      this.speed += (targetSpeed - this.speed) * Math.min(1, dt * (w.arrived ? 5 : 2.2));
      if (!w.arrived) {
        this.heading += THREE.MathUtils.clamp(dh, -1, 1) * Math.min(1, dt * 2.0);
        this.pos.addScaledVector(this.forward(), this.speed * dt);
      } else {
        // settle onto the exact spot while slowing down
        this.pos.x += dx * Math.min(1, dt * 2); this.pos.z += dz * Math.min(1, dt * 2);
      }
      if (w.arrived && this.speed < 0.12) {
        // final turn on the spot
        if (w.fh !== undefined) {
          let d2 = w.fh - this.heading; d2 = Math.atan2(Math.sin(d2), Math.cos(d2));
          this.heading += THREE.MathUtils.clamp(d2, -1.0 * dt, 1.0 * dt);
          this.speed = Math.max(this.speed, Math.abs(d2) > 0.05 ? 0.18 : 0);
          if (Math.abs(d2) < 0.05) { this.walk = null; this.speed = 0; if (w.then) w.then(); }
        } else { this.walk = null; this.speed = 0; if (w.then) w.then(); }
      }
      gaitW = Math.min(1, this.speed / 0.35);
    } else this.speed *= 0.9;
    this.walkBlend += ((this.walk ? 1 : 0) * gaitW - this.walkBlend) * Math.min(1, dt * 4);
    this.syncGroup();
    // compose
    const P = this.work; g.copyPose(P, this.base);
    if (this.walkBlend > 0.01) this.applyGait(P, dt);
    this.applySecondary(P, dt);
    g.applyPose(P);
    // ground clamp: the lowest part of the body rests on the ground
    g.group.updateMatrixWorld(true);
    const mc = g.minClearance();
    g.bones[0].position.y -= mc;
    g.mesh.updateMatrixWorld(true);
    if (this.walkBlend > 0.05) this.detectPlants();
  }

  applyGait(P, dt) {
    const g = this.g, I = g.index;
    const T = 1.75; // stride period
    this.gaitPh = (this.gaitPh + dt * Math.max(0.25, this.speed / 0.9) / T) % 1;
    const W = this.walkBlend;
    for (const L of LEGS) {
      const ph = (this.gaitPh + L.ph) % 1;
      const stance = ph < 0.62;
      let swing, knee = 0, fet = 0;
      if (stance) { const u = ph / 0.62; swing = 1 - 2 * u; }
      else { const u = (ph - 0.62) / 0.38; swing = -1 + 2 * ease(u); knee = Math.sin(u * Math.PI); fet = Math.sin(Math.min(1, u * 1.3) * Math.PI); }
      const A = 15 * D2R * W;
      const up = I[L.up];
      rotZ(P, up, swing * A * (L.fore ? 0.8 : 0.9));
      if (L.fore) {
        rotZ(P, I['carp' + L.s], -knee * 38 * D2R * W);
        rotZ(P, I['mcp' + L.s], -knee * 30 * D2R * W);
        rotZ(P, I['fpas' + L.s], -fet * 25 * D2R * W);
        rotZ(P, I['rad' + L.s], knee * 10 * D2R * W);
      } else {
        rotZ(P, I['tib' + L.s], -knee * 18 * D2R * W);
        rotZ(P, I['tars' + L.s], knee * 26 * D2R * W);
        rotZ(P, I['mtt' + L.s], knee * 22 * D2R * W);
        rotZ(P, I['hpas' + L.s], -fet * 25 * D2R * W);
      }
    }
    // neck swings with the stride (twice per cycle), body sways sideways a little (pacing gait)
    const s2 = Math.sin(this.gaitPh * Math.PI * 4);
    rotZ(P, I.neck0, -s2 * 2.2 * D2R * W);
    rotZ(P, I.neck3, s2 * 1.5 * D2R * W);
    rotX(P, I.body, Math.sin(this.gaitPh * Math.PI * 2) * 2.0 * D2R * W);
  }

  applySecondary(P, dt) {
    const g = this.g, I = g.index, t = this.t;
    // breathing
    const br = Math.sin(t * (this.posture === 'rem' ? 1.1 : 1.6));
    rotZ(P, I.chest, br * 0.35 * D2R); rotZ(P, I.hips, -br * 0.25 * D2R);
    // head look (yaw/pitch offsets distributed on the upper neck and head)
    const L = this.look;
    L.w += (L.tw - L.w) * Math.min(1, dt * 1.6);
    L.yaw += (L.ty - L.yaw) * Math.min(1, dt * 2.0); L.pitch += (L.tp - L.pitch) * Math.min(1, dt * 2.0);
    if (L.w > 0.01) {
      rotY(P, I.neck3, L.yaw * 0.25 * L.w); rotY(P, I.neck4, L.yaw * 0.3 * L.w); rotY(P, I.head, L.yaw * 0.45 * L.w);
      rotZ(P, I.head, L.pitch * L.w);
    }
    // ears
    for (const [E, n, s] of [[this.earL, 'earL', -1], [this.earR, 'earR', 1]]) {
      E.yaw += (E.ty - E.yaw) * Math.min(1, dt * 6); E.droop += (E.td - E.droop) * Math.min(1, dt * 3);
      // flick
      const fl = (E.flick || 0); if (fl > 0) E.flick = Math.max(0, fl - dt * 4);
      const f = Math.sin((1 - (E.flick || 0)) * Math.PI * 3) * (E.flick || 0) * 0.35;
      const i = I[n];
      tmpE.set(0, (E.yaw + f) * s, -E.droop, 'YZX');
      tmpQ.setFromEuler(tmpE); tmpQ2.fromArray(P.q, i * 4).multiply(tmpQ).toArray(P.q, i * 4);
    }
    if (Math.random() < dt * 0.25) (Math.random() < 0.5 ? this.earL : this.earR).flick = 1;
    // jaw: rumination chewing
    const cw = this.chewing ? 1 : 0; this.chew += (cw - this.chew) * Math.min(1, dt * 2);
    if (this.chew > 0.01) {
      const c = Math.sin(t * 7.2);
      rotZ(P, I.jaw, -(0.5 + 0.5 * c) * 4.5 * D2R * this.chew);
      rotY(P, I.jaw, Math.sin(t * 7.2 + 1.2) * 2.5 * D2R * this.chew);
    }
    // tail
    const tw = this.posture === 'stand' ? 1 : 0.25;
    const sw = Math.sin(t * 1.3) * this.tailSwish * tw + (this.twitch > 0 ? Math.sin(t * 22) * this.twitch * 0.3 : 0);
    rotY(P, I.tail1, sw * 0.35); rotY(P, I.tail2, sw * 0.5); rotY(P, I.tail3, sw * 0.6);
    this.twitch = Math.max(0, this.twitch - dt);
    // eyelids
    this.blinkT -= dt;
    let blink = 0;
    if (this.blinkT < 0) { blink = Math.max(0, 1 - Math.abs(this.blinkT + 0.09) / 0.09); if (this.blinkT < -0.18) this.blinkT = 2.5 + Math.random() * 4; }
    this.eyeOpen += (this.eyeTarget - this.eyeOpen) * Math.min(1, dt * 1.5);
    const open = Math.max(0, this.eyeOpen - blink);
    for (const lid of g.lids) {
      // rotation about the head-forward axis: positive raises the lid edge on the right eye
      lid.upper.rotation.x = -lid.side * (-0.25 + 1.05 * open);
      lid.lower.rotation.x = -lid.side * (0.28 * (1 - open));
    }
  }

  // ---- foot plants -> hoof prints -------------------------------------------------------------
  detectPlants() {
    const g = this.g;
    for (let k = 0; k < LEGS.length; k++) {
      const L = LEGS[k];
      const ph = (this.gaitPh + L.ph) % 1;
      const inStance = ph < 0.62;
      if (inStance && !this.lastPlant[k] && this.onPrint) {
        const n = (L.fore ? 'fpas' : 'hpas') + L.s;
        const p = L.fore ? g.probeWorld(n, 0.775, 0, (L.s === 'R' ? 0.175 : -0.175)) : g.probeWorld(n, -0.69, 0, (L.s === 'R' ? 0.17 : -0.17));
        this.onPrint(p.x, p.z, this.heading, L.fore);
        if (this.onStep) this.onStep(L.fore);
      }
      this.lastPlant[k] = inStance ? 1 : 0;
    }
  }
  hoofPositions() {
    const g = this.g, out = [];
    for (const [n, x, z] of [['fpasR', 0.775, 0.175], ['fpasL', 0.775, -0.175], ['hpasR', -0.69, 0.17], ['hpasL', -0.69, -0.17]]) out.push(g.probeWorld(n, x, 0, z));
    return out;
  }

  // world-space points of the body touching the ground (CPU skinning of a vertex sample)
  contactPoints(maxY = 0.07) {
    const g = this.g, mesh = g.mesh;
    if (!this._sample) {
      const pos = mesh.geometry.attributes.position; const s = [];
      for (let i = 0; i < pos.count; i += 3) if (pos.getY(i) < 2.25) s.push(i);
      this._sample = s;
    }
    const v = new THREE.Vector3(), out = [];
    mesh.updateMatrixWorld(true);
    for (const i of this._sample) {
      v.fromBufferAttribute(mesh.geometry.attributes.position, i);
      mesh.applyBoneTransform(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      if (v.y < maxY) out.push([v.x, v.z]);
    }
    return out;
  }
}

function rotZ(P, i, a) { if (!a) return; tmpQ.setFromAxisAngle(Z, a); tmpQ2.fromArray(P.q, i * 4).multiply(tmpQ).toArray(P.q, i * 4); }
function rotY(P, i, a) { if (!a) return; tmpQ.setFromAxisAngle(Y, a); tmpQ2.fromArray(P.q, i * 4).multiply(tmpQ).toArray(P.q, i * 4); }
function rotX(P, i, a) { if (!a) return; tmpQ.setFromAxisAngle(X, a); tmpQ2.fromArray(P.q, i * 4).multiply(tmpQ).toArray(P.q, i * 4); }
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
