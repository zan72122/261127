// Doll behaviour: states (stand/held/sit/lie/walk), gestures, gaze, expressions, pose smoothing.
import * as THREE from 'three';
import { DOLL } from './doll.js';
import { L } from './layout.js';
import { P_HEART, P_SPARK, P_BUBBLE, P_NOTE } from './fx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m = new THREE.Matrix4();
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function env(g) { const t = g.t, d = g.dur, a = Math.min(0.25, d * 0.3); return t < a ? ease(t / a) : t > d - a ? ease(Math.max(0, (d - t) / a)) : 1; }

export const Behave = {
  gesture(d, type, o = {}) {
    if (d.away) return;
    d.gest = d.gest.filter(g => g.type !== type || g.side !== o.side);
    const durs = { bow: 1.0, nod: 0.6, tilt: 0.9, wave: 1.5, smallWave: 1.2, clap: 1.1, hop: 0.38, cheer: 1.0, reach: 0.6, eat: 1.1, peek: 1.9, stretch: 1.3, surprise: 0.8, giggle: 0.9, knock: 0.9, hatTip: 1.1, lookFoot: 1.0, clap1: 0.45, sip: 1.1, look: 2.5, offer: 1.2 };
    const g = Object.assign({ type, t: 0, dur: durs[type] || 1, side: 0 }, o);
    if (o.delay) g.t = -o.delay;
    d.gest.push(g);
    if (type === 'clap') { for (const t0 of [0.18, 0.45, 0.72]) this.sound.clap(t0 + (o.delay || 0)); }
    if (type === 'clap1') this.sound.clap(0.15 + (o.delay || 0));
    return g;
  },
  hasGest(d, type) { return d.gest.some(g => g.type === type && g.t >= 0); },

  sitDoll(d, i) {
    const c = L.chairs[i];
    d.st = 'sit'; d.seat = i; d.zone = 'in'; d.dropT = 0; d.dropFrom.copy(d.root.position);
    d.dropTo.set(c.x - Math.sin(c.yaw) * 0.006, 0, c.z - Math.cos(c.yaw) * 0.006);
    d.yawT = c.yaw;
    this.sound.sit(d.id);
    this.flags.sat = (this.flags.sat || 0) + 1;
    this.setMood(d, 'smile', 0.6, 0.3, 1.2);
    // look at someone across the table and smile
    const other = this.dolls.find(o => o !== d && o.st === 'sit');
    if (other) { d.focus = { doll: other, until: this.time + 2.5 }; this.gesture(other, 'nod', { delay: 0.4 }); this.setMood(other, 'open', 0.6, 0.4, 1.2); this.log('seatSmile', d.id + '>' + other.id); }
    this.log('sit', d.id + ':' + i);
  },
  lieDoll(d, i) {
    d.st = 'lie'; d.spot = i; d.zone = 'in'; d.dropT = 0; d.dropFrom.copy(d.root.position);
    d.dropTo.set(L.bed.headX + DOLL.headY - 0.002, L.bed.top, L.bed.spots[i]);
    d.yawT = Math.PI / 2;
    this.sound.drop(d.id, true);
    const covered = this.blanketOn();
    if (covered) { d.sleepAt = this.time + 0.7; }
    else {
      const sleeper = this.dolls.find(o => o !== d && o.sleeping);
      if (sleeper) { d.focus = { doll: sleeper, until: this.time + 3 }; this.gesture(d, 'smallWave', { side: 1, delay: 0.5 }); this.sound.wave(d.id); this.flags.peek = (this.flags.peek || 0) + 1; this.log('peekBed', d.id + '>' + sleeper.id); }
    }
    this.log('lie', d.id + ':' + i);
  },
  sleep(d) {
    if (d.sleeping) return;
    d.sleeping = true; d.sleepAt = 0; this.sound.yawn(d.id);
    this.flags.slept = (this.flags.slept || 0) + 1; this.log('sleep', d.id);
  },
  wake(d, quiet) {
    d.sleepAt = 0;
    if (!d.sleeping) return;
    d.sleeping = false;
    if (!quiet) { this.gesture(d, 'stretch'); this.sound.wake(d.id); this.setMood(d, 'open', 0.5, 0.5, 1.3); }
    this.log('wake', d.id);
  },
  tapDoll(d, prev) {
    // persistent, visible change on a short tap: turns to face the child (or a friend) and beams
    const cam = this.camera.position;
    const toCam = Math.atan2(cam.x - d.root.position.x, cam.z - d.root.position.z);
    const near = this.nearestDoll(d, 0.5);
    const faceCam = Math.abs(wrap(prev.yaw - toCam)) > 0.5 || !near;
    const yaw = faceCam ? toCam : Math.atan2(near.root.position.x - d.root.position.x, near.root.position.z - d.root.position.z);
    if (d.st === 'stand') d.yawT = yaw;
    d.tapYaw = yaw; d.focus = faceCam ? { cam: true, until: this.time + 3 } : { doll: near, until: this.time + 3 };
    this.setMood(d, 'open', 0.9, 0.7, 2.6);
    this.gesture(d, 'hop');
    this.fx.emit({ pos: d.head.getWorldPosition(new THREE.Vector3()).add(_v.set(0.03, 0.04, 0.02)), vel: _v2.set(0.01, 0.05, 0), cell: P_HEART, size: 0.014, life: 1.0, col: d.spec.accent, drag: 2 });
    this.log('tapDoll', d.id);
  },
  nearestDoll(d, maxD, filter) {
    let best = null, bd = maxD;
    for (const o of this.dolls) { if (o === d || o.away || (filter && !filter(o))) continue; const dd = o.root.position.distanceTo(d.root.position); if (dd < bd) { bd = dd; best = o; } }
    return best;
  },
  headPos(d, out) { return d.head.getWorldPosition(out); },

  // ----------------------------------------------------------------- per-frame
  updateDolls(dt) {
    for (const d of this.dolls) {
      if (d.away) { d.root.visible = false; continue; }
      d.root.visible = true;
      const P = d.P = d.newPose(), C = d.C, t = this.time;
      // --- placement / transitions
      if (d.walk) {
        const w = d.walk; w.t += dt; const k = Math.min(1, w.t / w.dur);
        d.root.position.lerpVectors(w.from, w.to, k);
        d.yawT = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z);
        if (k >= 1) { d.walk = null; d.yawT = w.endYaw !== undefined ? w.endYaw : d.yawT; w.done && w.done(); }
      } else if (d.st !== 'held' && d.dropT < 1) {
        const dur = d.st === 'stand' ? 0.17 : 0.32;
        d.dropT = Math.min(1, d.dropT + dt / dur);
        const k = d.st === 'stand' ? d.dropT * d.dropT : ease(d.dropT);
        d.root.position.lerpVectors(d.dropFrom, d.dropTo, k);
        if (d.st !== 'stand') d.root.position.y += Math.sin(Math.PI * d.dropT) * 0.02;
        if (d.dropT >= 1) { d.squashV += d.st === 'stand' ? 2.4 : 1.2; }
      }
      // yaw
      const dy = wrap(d.yawT - d.yaw); d.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * (d.st === 'held' ? 5 : 3.2));
      d.root.rotation.y = d.yaw;
      // velocity / acceleration for dangling physics
      _v.copy(d.root.position).sub(d.prevPos).divideScalar(Math.max(dt, 1e-3));
      const acc = _v2.copy(_v).sub(d.vel).divideScalar(Math.max(dt, 1e-3)); d.vel.copy(_v); d.prevPos.copy(d.root.position);
      acc.clampLength(0, 30);
      const cy = Math.cos(d.yaw), sy = Math.sin(d.yaw);
      const aF = acc.x * sy + acc.z * cy, aS = acc.x * cy - acc.z * sy; // forward, sideways (local)

      // --- base pose by state
      const breath = Math.sin(t * 1.8 + d.id.length) * 0.012;
      if (d.st === 'stand') {
        P.spineX = breath; P.headZ = Math.sin(t * 0.7 + d.id.charCodeAt(0)) * 0.04;
        P.armZ = [0.13 + breath, -0.13 - breath];
      } else if (d.st === 'sit') {
        P.pelvisY = L.seatH + 0.007; P.hipX = [-1.5, -1.5]; P.knee = [1.42, 1.42]; P.skirtSit = 1;
        P.armX = [-0.55, -0.55]; P.elbow = [-0.75, -0.75]; P.armZ = [0.08, -0.08]; P.spineX = 0.05 + breath;
        // gently swinging feet
        P.knee[0] += Math.sin(t * 2.1 + 1) * 0.12; P.knee[1] += Math.sin(t * 2.1 + 2.4) * 0.12;
      } else if (d.st === 'lie') {
        P.lay = 1; P.armZ = [0.25, -0.25]; P.armX = [0, 0]; P.elbow = [-0.2, -0.2];
        P.headY = -0.85; P.lid = d.sleeping ? 1 : 0;
        P.spineX = d.sleeping ? Math.sin(t * 1.2) * 0.01 : 0;
      } else if (d.st === 'held') {
        P.armZ = [0.5, -0.5]; P.armX = [-0.25, -0.25]; P.elbow = [-0.45, -0.45];
        P.knee = [0.12, 0.12];
      }
      if (d.walk) { const ph = t * 13; P.hipX = [Math.sin(ph) * 0.42, -Math.sin(ph) * 0.42]; P.knee = [Math.max(0, -Math.cos(ph)) * 0.5, Math.max(0, Math.cos(ph)) * 0.5]; P.armX = [-Math.sin(ph) * 0.35, Math.sin(ph) * 0.35]; P.bodyY = Math.abs(Math.sin(ph)) * 0.004; }

      // --- dangling physics
      const V = d.V, held = d.st === 'held';
      const legT = held ? clamp(aF * 0.012, -0.7, 0.7) : 0;
      const kL = held ? 70 : 160, cL = held ? 4.5 : 18;
      V.hipLv += (-(V.hipL - legT) * kL - V.hipLv * cL) * dt; V.hipL += V.hipLv * dt;
      V.hipRv += (-(V.hipR - legT * 0.85) * kL * 1.1 - V.hipRv * cL) * dt; V.hipR += V.hipRv * dt;
      const sideT = held ? clamp(-aS * 0.01, -0.4, 0.4) : 0;
      V.hipZv += (-(V.hipZL - sideT) * kL - V.hipZv * cL) * dt; V.hipZL += V.hipZv * dt;
      if (held) { P.hipX[0] += V.hipL; P.hipX[1] += V.hipR; P.hipZ = [V.hipZL + 0.05, V.hipZL - 0.05]; P.knee[0] += Math.max(0, -V.hipL) * 0.6; P.knee[1] += Math.max(0, -V.hipR) * 0.6; P.armZ[0] += V.hipZL * 0.6; P.armZ[1] += V.hipZL * 0.6; P.armX[0] += V.hipL * 0.4; P.armX[1] += V.hipR * 0.4; }
      // hair & skirt sway
      for (const h of d.hairPivots) {
        const tx = clamp(aF * 0.006, -0.5, 0.5), tz = clamp(-aS * 0.006, -0.5, 0.5);
        h.vx += (-(h.x - tx) * 90 - h.vx * 5) * dt; h.x += h.vx * dt;
        h.vz += (-(h.z - tz) * 90 - h.vz * 5) * dt; h.z += h.vz * dt;
      }
      d.skirt.rotation.x = clamp(V.hipL * 0.25, -0.15, 0.15); d.skirt.rotation.z = clamp(V.hipZL * 0.3, -0.12, 0.12);
      // squash spring
      d.squashV += (-d.squash * 420 - d.squashV * 16) * dt; d.squash += d.squashV * dt; d.squash = clamp(d.squash, -0.12, 0.12);

      // --- attention / gaze
      this.updateAttention(d, dt);

      // --- holding poses
      for (let i = 0; i < 2; i++) {
        const it = d.handSlots[i].occupant;
        if (it && d.st !== 'lie') {
          P.armX[i] = d.st === 'sit' ? -1.05 : -0.8; P.elbow[i] = -0.95; P.armZ[i] = i === 0 ? 0.18 : -0.18;
          if (it.kind === 'gift') { P.armX[i] = -0.9; P.elbow[i] = -0.8; }
        }
      }
      // --- gestures
      d.ik[0].w = 0; d.ik[1].w = 0;
      for (let gi = d.gest.length - 1; gi >= 0; gi--) {
        const g = d.gest[gi]; g.t += dt; if (g.t < 0) continue;
        if (g.t >= g.dur) { d.gest.splice(gi, 1); g.end && g.end(); continue; }
        this.applyGesture(d, g, P, env(g));
      }
      // reaching for food nearby
      for (let i = 0; i < 2; i++) { const r = d.reachItem[i]; if (r && d.ik[i].w < r.w) { d.ik[i].w = r.w; d.ik[i].tgt.copy(r.pos); } }
      // look
      this.lookPose(d, P);
      // --- expression
      if (d.moodT > 0) d.moodT -= dt;
      let mouth = 'smile', blush = 0.12, brow = 0;
      if (d.st === 'held') { mouth = 'open'; blush = 0.45; brow = 0.4; }
      if (d.moodT > 0 && d.mood) { mouth = d.mood.mouth; blush = d.mood.blush; brow = d.mood.brow; }
      if (d.sleeping) { mouth = 'sleep'; blush = 0.35; brow = -0.2; }
      if (d.chewT > 0) { d.chewT -= dt; mouth = Math.floor(d.chewT * 7) % 2 ? 'chewA' : 'chewB'; blush = 0.7; brow = 0.3; P.lid = Math.max(P.lid, 0.8); P.headX += Math.sin(this.time * 14) * 0.04; }
      if (d.happyEyes > 0) { d.happyEyes -= dt; P.lid = Math.max(P.lid, 0.82); }
      d.expr.mouth = mouth; d.expr.blush = blush; d.expr.brow = brow; d.expr.sleep = !!d.sleeping;
      d.redrawFace();
      // blink
      d.blinkT -= dt; if (d.blinkT < 0) { d.blink = 1; if (d.blinkT < -0.12) { d.blink = 0; d.blinkT = 2 + Math.random() * 3.5; } } else d.blink = 0;
      if (d.sleeping) d.blink = 0;
      if (d.sleepAt && this.time > d.sleepAt) this.sleep(d);

      // --- smoothing into current pose
      const k = 1 - Math.exp(-dt * (held ? 22 : 13));
      for (const key in P) {
        const pv = P[key];
        if (Array.isArray(pv)) { const cv = C[key]; cv[0] += (pv[0] - cv[0]) * k; cv[1] += (pv[1] - cv[1]) * k; }
        else C[key] += (pv - C[key]) * (key === 'lay' || key === 'pelvisY' || key === 'skirtSit' ? 1 - Math.exp(-dt * 9) : k);
      }
      for (let i = 0; i < 2; i++) { const ik = d.ik[i]; ik.cw += (ik.w - ik.cw) * (1 - Math.exp(-dt * 10)); }
      if (!isFinite(V.hipL + V.hipR + V.hipZL + V.hipLv + V.hipRv + V.hipZv)) { V.hipL = V.hipR = V.hipZL = V.hipLv = V.hipRv = V.hipZv = 0; }
      d.applyPose();
    }
  },

  applyGesture(d, g, P, e) {
    const s = g.side || 0, sg = s === 0 ? 1 : -1, t = g.t;
    switch (g.type) {
      case 'bow': P.spineX += 0.42 * e; P.headX += 0.28 * e; P.armX[0] -= 0.2 * e; P.armX[1] -= 0.2 * e; break;
      case 'nod': P.headX += 0.32 * Math.sin(Math.PI * t / g.dur); break;
      case 'tilt': P.headZ += 0.32 * e * (g.dir || 1); break;
      case 'giggle': P.spineZ += 0.06 * Math.sin(t * 28) * e; P.headZ += 0.12 * e; d.happyEyes = Math.max(d.happyEyes || 0, 0.1); break;
      case 'hop': if (t < 0.38) P.bodyY += 0.014 * Math.sin(Math.PI * t / 0.38); break;
      case 'wave': P.armZ[s] = P.armZ[s] * (1 - e) + sg * (2.5 + 0.28 * Math.sin(t * 13)) * e; P.armX[s] *= (1 - e); P.elbow[s] = P.elbow[s] * (1 - e) - 0.45 * e; d.ik[s].w = 0; break;
      case 'smallWave': P.armX[s] = P.armX[s] * (1 - e) - 1.2 * e; P.armZ[s] = P.armZ[s] * (1 - e) + sg * 0.45 * e; P.elbow[s] = P.elbow[s] * (1 - e) - 1.35 * e; P.elbowZ[s] = 0.5 * Math.sin(t * 12) * e; P.headZ += 0.12 * e * sg; break;
      case 'clap': case 'clap1': {
        const m = g.type === 'clap1' ? Math.sin(Math.min(1, t / 0.3) * Math.PI) : 0.5 + 0.5 * Math.cos(t * Math.PI * 2 / 0.27);
        for (const i of [0, 1]) { const sgi = i === 0 ? 1 : -1; P.armX[i] = P.armX[i] * (1 - e) - 1.2 * e; P.armZ[i] = P.armZ[i] * (1 - e) + sgi * (0.12 - 0.62 * m) * e; P.elbow[i] = P.elbow[i] * (1 - e) - 0.7 * e; d.ik[i].w = 0; }
        d.happyEyes = Math.max(d.happyEyes || 0, 0.05); break;
      }
      case 'stretch': for (const i of [0, 1]) { const sgi = i === 0 ? 1 : -1; P.armZ[i] = P.armZ[i] * (1 - e) + sgi * 2.85 * e; P.elbow[i] *= (1 - e); } P.headX -= 0.2 * e; if (t < 0.8) P.lid = Math.max(P.lid, 0.9 * e); break;
      case 'surprise': for (const i of [0, 1]) { const sgi = i === 0 ? 1 : -1; P.armZ[i] += sgi * 0.6 * e; P.armX[i] -= 0.4 * e; } P.headX -= 0.12 * e; break;
      case 'peek': P.spineX += 0.42 * e; P.headX += 0.38 * e; break;
      case 'hatTip': P.armX[1] = P.armX[1] * (1 - e) - 2.6 * e; P.armZ[1] = P.armZ[1] * (1 - e) - 0.3 * e; P.elbow[1] = P.elbow[1] * (1 - e) - 1.6 * e; P.headX += 0.15 * e; if (d.hat) d.hat.rotation.x = -0.22 - 0.25 * e; break;
      case 'lookFoot': P.headX += 0.5 * e; P.spineX += 0.15 * e; P.hipX[s] -= 0.35 * e * (0.6 + 0.4 * Math.sin(t * 16)); break;
      case 'reach': case 'cheer': case 'knock': case 'eat': case 'sip': case 'offer': {
        const tg = typeof g.target === 'function' ? g.target(_v3) : g.target;
        if (tg) { d.ik[s].w = Math.max(d.ik[s].w, e * (g.type === 'knock' ? 0.95 : 1)); d.ik[s].tgt.copy(tg); if (g.type === 'knock') d.ik[s].tgt.z += 0.006 * Math.sin(t * 22); }
        if (g.type === 'eat' || g.type === 'sip') P.headX += 0.08 * e;
        break;
      }
      case 'look': break;
    }
  },

  updateAttention(d, dt) {
    d.attnT -= dt;
    const t = this.time;
    if (d.focus && d.focus.until < t) d.focus = null;
    let target = null;
    const f = d.focus;
    if (f) {
      if (f.doll) target = f.doll.head.getWorldPosition(_v3);
      else if (f.cam) target = _v3.copy(this.camera.position);
      else if (f.pos) target = _v3.copy(f.pos);
      else if (f.item) target = _v3.set(0, f.item.pickY, 0).add(f.item.pos);
    }
    if (!target) {
      if (d.attnT <= 0 || !d.attnKind) {
        d.attnT = 0.25 + Math.random() * 0.2;
        d.attnKind = this.chooseAttn(d);
      }
      const a = d.attnKind;
      if (a && a.doll) target = a.doll.head.getWorldPosition(_v3);
      else if (a && a.item) target = _v3.set(0, a.item.pickY, 0).add(a.item.pos);
      else if (a && a.pos) target = _v3.copy(a.pos);
      else target = _v3.copy(this.camera.position);
      // standing dolls turn their body toward a nearby friend
      if (d.st === 'stand' && !d.walk && a && a.doll && a.turn) { const yy = Math.atan2(target.x - d.root.position.x, target.z - d.root.position.z); if (Math.abs(wrap(yy - d.yaw)) > 0.45) d.yawT = yy; }
    }
    d.attn.lerp(target, 1 - Math.exp(-dt * 8));
  },
  chooseAttn(d) {
    const t = this.time;
    // a dragged item nearby draws the eye
    if (this.drag && this.drag.type === 'item') { const it = this.drag.obj; if (it.pos.distanceTo(d.chest.getWorldPosition(_v)) < 0.26) return { item: it }; }
    if (this.drag && this.drag.type === 'doll' && this.drag.obj !== d && d.st !== 'lie') { const o = this.drag.obj; if (o.root.position.distanceTo(d.root.position) < 0.35) return { doll: o, turn: true }; }
    if (this.lastDeco && t - this.lastDeco.t < 4.5 && this.sameRoom(d.root.position, this.lastDeco.pos)) return { pos: this.lastDeco.pos };
    if (this.hint && this.hint.posVec && Math.random() < 0.08) return { pos: this.hint.posVec.clone() };
    if (d.st === 'held') { const n = this.nearestDoll(d, 0.4); return n ? { doll: n } : null; }
    if (d.st === 'lie') { if (d.sleeping) return { pos: _v.set(d.root.position.x - 0.3, 0.3, d.root.position.z + 0.5).clone() }; const n = this.nearestDoll(d, 0.35); return n ? { doll: n } : null; }
    if (d.st === 'sit') {
      const others = this.dolls.filter(o => o !== d && !o.away && (o.st === 'sit' || o.root.position.distanceTo(d.root.position) < 0.3));
      if (others.length && (Math.floor(t / 3.5 + d.seat) % 3 !== 2)) { others.sort((a, b) => a.root.position.distanceTo(d.root.position) - b.root.position.distanceTo(d.root.position)); return { doll: others[Math.floor(t / 7 + d.seat) % others.length] }; }
      const food = this.items.find(it => !it.hidden && it.data.food && it.pos.distanceTo(d.root.position) < 0.16);
      if (food) return { item: food };
      return null;
    }
    const n = this.nearestDoll(d, 0.3, o => o.st !== 'held');
    if (n) return { doll: n, turn: true };
    if (Math.floor(t / 4 + d.id.length) % 4 === 3) return { pos: _v.set(d.root.position.x + Math.sin(t) * 0.3, 0.12, d.root.position.z + 0.25).clone() };
    return null;
  },
  sameRoom(a, b) { return (a.x < L.divX) === (b.x < L.divX); },
  lookPose(d, P) {
    const tg = d.attn;
    d.spine.updateWorldMatrix(true, false);
    _m.copy(d.spine.matrixWorld).invert();
    _v.copy(tg).applyMatrix4(_m); _v.y -= 0.108;
    let yaw = Math.atan2(_v.x, _v.z), pitch = -Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    if (Math.abs(yaw) > 2.2) { yaw = 0; pitch = 0; }
    const hy = clamp(yaw, -1.0, 1.0), hx = clamp(pitch, -0.45, 0.5);
    if (d.st === 'lie') { P.headY = clamp(P.headY * 0.5 + hy * 0.5, -1.1, 0.4); P.headX += clamp(hx * 0.4, -0.2, 0.2); }
    else { P.headY += hy; P.headX += hx; }
    P.eyeY = clamp(yaw - hy, -0.3, 0.3) + clamp(hy * 0.15, -0.12, 0.12); P.eyeX = clamp((pitch - hx) * 0.8 + hx * 0.1, -0.2, 0.25);
  },
};
