// 場面2：釉薬の桶にくぐらせる → 場面3 前半：窯で焼く
import * as THREE from 'three';
import { POS } from './room.js';
import { SMAX } from './clay.js';

const UW = 128, VH = 256;

export class GlazeStage {
  constructor(ctx) {
    this.ctx = ctx; this.name = 'glaze';
    this.thick = [new Float32Array(UW * VH), new Float32Array(UW * VH), new Float32Array(UW * VH)];
    this.data = new Uint8Array(UW * VH * 4);
    this.tex = new THREE.DataTexture(this.data, UW, VH, THREE.RGBAFormat);
    this.tex.wrapS = THREE.RepeatWrapping; this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.lp = new Float32Array(UW * VH * 3); this.valid = new Uint8Array(UW * VH); this.zoneOf = new Uint8Array(UW * VH);
    this.target = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.dips = 0; this.inTub = -1; this.wasIn = false;
    this.kiln = new KilnStage(ctx, this);
    // 貫入のマスク
    const c = document.createElement('canvas'); c.width = c.height = 256;
    this.crackCv = c; this.crackG = c.getContext('2d');
    this.crackTex = new THREE.CanvasTexture(c); this.crackTex.flipY = false; this.crackTex.wrapS = THREE.RepeatWrapping; this.crackTex.colorSpace = THREE.NoColorSpace;
  }
  reset() {
    for (const t of this.thick) t.fill(0);
    this.crackG.fillStyle = '#000'; this.crackG.fillRect(0, 0, 256, 256); this.crackTex.needsUpdate = true;
    this.dips = 0; this.upload();
  }
  // 器の表面の各点（u,v）の位置を前もって計算
  precompute() {
    const clay = this.ctx.clay;
    const pr = clay.prof, ps = clay.profS;
    const M = ps.length;
    for (let j = 0; j < VH; j++) {
      const s = (j + 0.5) / VH * SMAX;
      let m = 0; while (m < M - 2 && ps[m + 1] < s) m++;
      const ok = s <= ps[M - 1];
      const t = Math.max(0, Math.min(1, (s - ps[m]) / Math.max(1e-6, ps[m + 1] - ps[m])));
      const r = pr[m * 2] + (pr[m * 2 + 2] - pr[m * 2]) * t, y = pr[m * 2 + 1] + (pr[m * 2 + 3] - pr[m * 2 + 1]) * t;
      const z = clay.profZ[m];
      for (let i = 0; i < UW; i++) {
        const a = (i + 0.5) / UW * Math.PI * 2;
        const k = i + UW * j;
        this.lp[k * 3] = r * Math.cos(a); this.lp[k * 3 + 1] = y; this.lp[k * 3 + 2] = -r * Math.sin(a);
        this.valid[k] = ok ? 1 : 0; this.zoneOf[k] = z;
      }
    }
    // 外側の底（高台）の弧長
    this.footS = 0.0;
    for (let m = 0; m < M; m++) if (clay.profZ[m] === 0 && pr[m * 2 + 1] > 0.004) { this.footS = ps[m]; break; }
  }
  upload() {
    const d = this.data, [b, a, w] = this.thick;
    for (let k = 0; k < UW * VH; k++) {
      d[k * 4] = Math.min(255, b[k] * 255); d[k * 4 + 1] = Math.min(255, a[k] * 255); d[k * 4 + 2] = Math.min(255, w[k] * 255); d[k * 4 + 3] = 255;
    }
    this.tex.needsUpdate = true;
  }
  enter() {
    const C = this.ctx;
    C.setBusy(true);
    C.cutTo('glaze', () => {
      this.precompute();
      this.reset();
      const U = C.clay.material.userData.U;
      U.tGlaze.value = this.tex; U.tCrack.value = this.crackTex; U.uGlazeOn.value = 1; U.uFired.value = 0; U.uHot.value = 0;
      U.uDry.value = 1; U.uBisque.value = 1;
      // さかさまに持つ（高台を指でつまむ）
      const h = C.clayHolder;
      h.position.set(POS.tubs.x, 0.62 + C.clay.H, POS.tubs.z + 0.02);
      C.clay.mesh.rotation.set(Math.PI, 0, 0); C.clay.mesh.position.set(0, 0, 0);
      this.target.copy(h.position);
      this.hover = h.position.y;
      C.focusTarget.set(POS.tubs.x, 0.5, POS.tubs.z);
      C.post.aperture = 0.0035; C.post.exposure = 0.82;
      C.setHint(() => this.hintTarget(), 0.3);
      C.setBusy(false);
      C.say('いろ ぬろう!', 'girl');
    });
  }
  hintTarget() {
    const C = this.ctx;
    if (this.dips >= 1 && !this.holding && this.inTub < 0 && this.ctx.clayHolder.position.y > this.hover - 0.05) return C.clayHolder.localToWorld(new THREE.Vector3(0, -C.clay.H * 0.5, 0));
    // 次の桶
    const t = C.anim.tubs[(this.dips) % 3];
    return new THREE.Vector3(t.x, t.y + 0.02, t.z);
  }
  planeHit(p) {
    const C = this.ctx;
    C.setNdc(p.x, p.y);
    const pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(POS.tubs.z + 0.02));
    const q = new THREE.Vector3();
    return C.ray.ray.intersectPlane(pl, q) ? q : null;
  }
  down(p) {
    const C = this.ctx;
    if (C.busy) return;
    // 窯をさわったら焼きに行く
    if (this.dips >= 1 && C.hitObjFat(C.anim.kiln.group, p.x, p.y, 20) && !C.hitObj(C.clay.mesh, p.x, p.y)) { this.toKiln(); return; }
    this.holding = true;
    this.grabOff = null;
    this.downT = C.clock; this.downXY = [p.x, p.y]; this.downOnPot = !!C.hitObjFat(C.clay.mesh, p.x, p.y, 20);
    const q = this.planeHit(p);
    if (q) this.grabOff = new THREE.Vector3().subVectors(C.clayHolder.position, q);
    if (this.grabOff) this.grabOff.y = Math.max(0, Math.min(0.1, this.grabOff.y));
    this.move(p);
  }
  move(p) {
    if (!this.holding) return;
    const q = this.planeHit(p); if (!q) return;
    // 指の少し上に器（指の下に隠れないように）
    this.target.set(q.x, q.y + 0.06 + this.ctx.clay.H * 0.5, POS.tubs.z + 0.02);
  }
  up(p) {
    this.holding = false; this.target.y = this.hover;
    // 釉薬をかけたあと、器をトンとたたく → 窯へ
    const C = this.ctx;
    if (this.dips >= 1 && this.downOnPot && C.clock - this.downT < 0.35 && Math.hypot(p.x - this.downXY[0], p.y - this.downXY[1]) < 14 && this.inTub < 0) {
      this.target.copy(C.clayHolder.position); this.toKiln();
    }
  }
  toKiln() {
    const C = this.ctx;
    C.setHint(null);
    C.say('かまに いれよう', 'girl');
    C.goStage(this.kiln);
  }
  update(dt) {
    const C = this.ctx, h = C.clayHolder, clay = C.clay;
    const tubs = C.anim.tubs;
    const x0 = tubs[0].x - 0.06, x1 = tubs[2].x + 0.06;
    const rimY = h.position.y - clay.H; // さかさまなので口縁が一番下
    const rimTop = tubs[0].y + 0.045;
    // 桶の中にいるときは、その桶から横に出られない
    let tx = Math.max(x0, Math.min(x1, this.target.x));
    let near = 0, nd = 9;
    tubs.forEach((t, i) => { const d = Math.abs(h.position.x - t.x); if (d < nd) { nd = d; near = i; } });
    if (rimY < rimTop) tx = Math.max(tubs[near].x - 0.06, Math.min(tubs[near].x + 0.06, tx));
    let ty = Math.max(tubs[0].y - 0.16 + clay.H, Math.min(0.95, this.target.y));
    // 桶の縁の上を越えるまで下げない
    if (nd > 0.07 && ty - clay.H < rimTop) ty = rimTop + clay.H + 0.005;
    const visc = rimY < tubs[0].y ? 4 : 10;
    const px = h.position.x;
    h.position.x += (tx - h.position.x) * (1 - Math.exp(-dt * visc));
    h.position.y += (ty - h.position.y) * (1 - Math.exp(-dt * visc));
    const vx = (h.position.x - px) / Math.max(dt, 1e-3);
    // 横に動かすと傾く → 斜めの釉薬の線
    const tilt = Math.max(-0.45, Math.min(0.45, -vx * 1.6));
    h.rotation.z += (tilt - h.rotation.z) * (1 - Math.exp(-dt * 5));
    // 桶の中？
    let inTub = -1;
    tubs.forEach((t, i) => { if (Math.abs(h.position.x - t.x) < 0.1 && rimY < t.y) inTub = i; });
    if (inTub >= 0 && this.inTub < 0) { C.sfx.dipIn(); this.dipT = 0; }
    if (inTub < 0 && this.inTub >= 0) { C.sfx.dipOut(); this.dips++; this.afterDip(this.inTub); }
    this.inTub = inTub;
    // 浸かっている所に釉薬がつく（長く浸すほど厚く）
    if (inTub >= 0) {
      this.dipT += dt;
      const t = tubs[inTub], th = this.thick[inTub];
      h.updateMatrixWorld(true);
      const mw = clay.mesh.matrixWorld.elements;
      const rate = dt * 1.1;
      let changed = false;
      for (let k = 0; k < UW * VH; k++) {
        if (!this.valid[k]) continue;
        const lx = this.lp[k * 3], ly = this.lp[k * 3 + 1], lz = this.lp[k * 3 + 2];
        const wy = mw[1] * lx + mw[5] * ly + mw[9] * lz + mw[13];
        if (wy > t.y) continue;
        const wx = mw[0] * lx + mw[4] * ly + mw[8] * lz + mw[12], wz = mw[2] * lx + mw[6] * ly + mw[10] * lz + mw[14];
        if ((wx - t.x) ** 2 + (wz - t.z) ** 2 > t.r * t.r) continue;
        th[k] += rate * (1.25 - th[k]) * 0.8;
        changed = true;
      }
      if (changed) { this.maskFingers(); this.upload(); }
      // 桶の表面がゆれる
      t.surf.position.y = 0.255 + 0.004 * Math.sin(this.dipT * 9) * Math.exp(-this.dipT);
    }
    // 持っている手（高台をつまむ）
    this.placeHoldHand(dt);
    // しずく
    if (this.dripT > 0) {
      this.dripT -= dt;
      if (Math.random() < dt * 8) {
        const rim = new THREE.Vector3(h.position.x + (Math.random() - 0.5) * clay.stats().rimR * 1.6, rimY, h.position.z + (Math.random() - 0.5) * 0.05);
        this.spawnGlazeDrop(rim, this.lastTub);
      }
    }
    this.updateDrops(dt);
  }
  maskFingers() {
    // つまんでいる指の跡：高台のまわり 4 か所は釉薬がつかない
    const footV = this.footS / SMAX * VH;
    for (const a of [0.1, 0.3, 0.55, 0.8]) {
      const ci = a * UW, cj = footV + 1;
      for (let j = Math.max(0, Math.floor(cj - 4)); j < Math.min(VH, cj + 4); j++) for (let i = Math.floor(ci - 4); i < ci + 4; i++) {
        const ii = ((i % UW) + UW) % UW;
        const d = Math.hypot((i - ci) / 2.6, (j - cj) / 3.2);
        if (d < 1) for (const t of this.thick) t[ii + UW * j] *= d * d;
      }
    }
  }
  afterDip(i) {
    // 引き上げたあと、口縁へ向かってたれる（厚い筋 → 焼くと濃い線）
    const th = this.thick[i];
    for (let n = 0; n < 14; n++) {
      const iu = Math.floor(Math.random() * UW);
      // その列の外側で、釉薬が付いている一番上（高台側）
      let j0 = -1;
      for (let j = 0; j < VH; j++) { const k = iu + UW * j; if (this.valid[k] && this.zoneOf[k] === 0 && th[k] > 0.15) { j0 = j; break; } }
      if (j0 < 0) continue;
      const len = 6 + Math.random() * 22;
      for (let q = 0; q < len; q++) {
        const j = j0 + q; if (j >= VH) break;
        const w = (1 - q / len) * 0.35 + (q > len - 3 ? 0.3 : 0);
        for (let di = -1; di <= 1; di++) { const ii = (iu + di + UW) % UW; th[ii + UW * j] += w * (di ? 0.4 : 1); }
      }
    }
    this.upload();
    this.dripT = 1.4; this.lastTub = i;
    if (this.dips === 1) this.ctx.after(1.5, () => this.ctx.say('もっと!', 'girl'));
  }
  spawnGlazeDrop(at, i) {
    const C = this.ctx;
    this._dropM ||= C.anim.tubs.map(t => new THREE.MeshPhysicalMaterial({ color: t.raw, roughness: 0.3, clearcoat: 0.6 }));
    this._drops ||= [];
    const m = new THREE.Mesh(this._dg ||= new THREE.SphereGeometry(1, 8, 6), this._dropM[i]);
    const s = 0.002 + Math.random() * 0.003; m.scale.set(s, s * 1.6, s);
    m.position.copy(at); m.userData.v = 0;
    C.scene.add(m); this._drops.push(m);
  }
  updateDrops(dt) {
    if (!this._drops) return;
    const C = this.ctx;
    for (let i = this._drops.length - 1; i >= 0; i--) {
      const d = this._drops[i]; d.userData.v += 9.8 * dt; d.position.y -= d.userData.v * dt;
      if (d.position.y < C.anim.tubs[0].y) { C.scene.remove(d); this._drops.splice(i, 1); if (Math.random() < 0.3) C.sfx.drip(); }
    }
  }
  placeHoldHand(dt) {
    const C = this.ctx, hh = C.hands.hold;
    if (!hh) return;
    const h = C.clayHolder;
    // 高台（さかさまなので上）の上に手のひら
    const foot = h.localToWorld(new THREE.Vector3(0, 0.005, 0));
    const camDir = new THREE.Vector3().subVectors(foot, C.camera.position); camDir.y = 0; camDir.normalize();
    const wup = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), h.rotation.z);
    const z = camDir.clone().multiplyScalar(0.75).addScaledVector(wup, -0.66).normalize();
    const up = wup.clone().addScaledVector(z, -wup.dot(z)).normalize();
    const x = new THREE.Vector3().crossVectors(up, z).normalize(); const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const palm = new THREE.Vector3(0, -0.014, 0.045).applyQuaternion(q);
    hh.position.copy(foot).sub(palm).addScaledVector(up, 0.012);
    hh.quaternion.copy(q);
    hh.visible = true;
  }
  exit() { if (this.ctx.hands.hold) this.ctx.hands.hold.visible = false; }
}

// ================================================================ 窯
class KilnStage {
  constructor(ctx, glaze) { this.ctx = ctx; this.glaze = glaze; this.name = 'kiln'; }
  enter() {
    const C = this.ctx, K = C.anim.kiln;
    C.setBusy(true);
    C.cutTo('kiln', () => {
      if (C.hands.hold) C.hands.hold.visible = false;
      // 窯の棚の上に、まっすぐ置く
      const h = C.clayHolder;
      h.removeFromParent(); K.group.add(h);
      h.position.set(0, K.shelfY + 0.01, 0.02); h.rotation.set(0, 0, 0);
      C.clay.mesh.rotation.set(0, 0, 0);
      K.doorPivot.rotation.y = -1.95; K.dial.rotation.z = 0;
      this.sub = 'door'; this.t = 0; this.said = false; this.taps = 0; this.cracks = []; this.autoCracks = 0;
      C.focusTarget.copy(K.group.localToWorld(new THREE.Vector3(0, 0.55, 0.3)));
      C.post.aperture = 0.003; C.post.exposure = 0.95;
      C.setHint(() => this.hintTarget(), 0.3);
      C.setBusy(false);
    });
  }
  hintTarget() {
    const K = this.ctx.anim.kiln;
    if (this.sub === 'door' || this.sub === 'cooled') return K.handle.getWorldPosition(new THREE.Vector3());
    if (this.sub === 'dial') return K.dial.getWorldPosition(new THREE.Vector3());
    if (this.sub === 'open' && this.t > 3) return this.ctx.clayHolder.localToWorld(new THREE.Vector3(0, this.ctx.clay.H * 0.6, 0));
    return null;
  }
  down(p) {
    const C = this.ctx, K = C.anim.kiln;
    if (C.busy) return;
    if (this.sub === 'door' && (C.hitObjFat(K.doorPivot, p.x, p.y, 30) || C.hitObjFat(K.group, p.x, p.y, 10))) {
      this.sub = 'closing'; this.t = 0; C.sfx.door();
    } else if (this.sub === 'dial' && (C.hitObjFat(K.dial, p.x, p.y, 40) || C.hitObjFat(K.group, p.x, p.y, 0))) {
      this.sub = 'fire'; this.t = 0; C.sfx.click(); C.say('やけろー!', 'girl');
    } else if (this.sub === 'cooled' && C.hitObjFat(K.group, p.x, p.y, 20)) {
      this.sub = 'opening'; this.t = 0; C.sfx.door();
    } else if (this.sub === 'open') {
      const hit = C.hitObj(C.clay.mesh, p.x, p.y);
      if (hit && this.t > 2.6) {
        // さわった所から貫入がピキッと広がる
        if (hit.uv) this.crack(hit.uv.x, hit.uv.y, 1);
        this.taps = (this.taps || 0) + 1;
        if (this.taps >= 3 && this.t > 4) { this.sub = 'done'; C.after(0.6, () => C.goStage(C.tableStage)); }
      }
    }
  }
  crack(u, v, big) {
    const C = this.ctx, g = this.glaze;
    C.sfx.ping();
    (this.cracks ||= []).push({ u, v, r: 0, R: (14 + Math.random() * 20) * big, t: 0 });
  }
  update(dt) {
    const C = this.ctx, K = C.anim.kiln, L = C.L, U = C.clay.material.userData.U;
    this.t += dt;
    if (this.sub === 'closing') {
      K.doorPivot.rotation.y = -1.95 * (1 - C.ease(Math.min(1, this.t / 0.9)));
      if (this.t > 0.9) { this.sub = 'dial'; this.t = 0; C.sfx.clunk(); }
    } else if (this.sub === 'fire') {
      const f = Math.min(1, this.t / 2.5) * (this.t < 6 ? 1 : Math.max(0, 1 - (this.t - 6) / 2));
      K.dial.rotation.z = -Math.min(1, this.t / 0.5) * 2.4;
      K.lamp.material.emissiveIntensity = 3;
      // のぞき穴が 赤 → 橙 → 黄白
      const c = new THREE.Color().setRGB(1.0, 0.25 + 0.5 * f, 0.05 + 0.25 * f * f).multiplyScalar(f * 12);
      K.peepM.color.copy(c);
      L.kiln.intensity = f * 4;
      C.setKiln(f);
      U.uHot.value = f; U.uFired.value = Math.min(1, this.t / 6);
      C.camera.position.y += Math.sin(this.t * 40) * 0.0004 * f;
      if (this.t > 8) { this.sub = 'cooled'; this.t = 0; K.lamp.material.emissiveIntensity = 0; C.setKiln(0); C.say('あけて いい?', 'girl'); }
    } else if (this.sub === 'opening') {
      K.doorPivot.rotation.y = -1.95 * C.ease(Math.min(1, this.t / 1.0));
      U.uFired.value = 1; U.uHot.value = 0.55;
      if (this.t > 1.0) { this.sub = 'open'; this.t = 0; C.cutTo('kilnIn'); this.autoCracks = 5; }
    } else if (this.sub === 'open') {
      // まだ熱い → さめていく（色が見えてくる）
      U.uHot.value = Math.max(0, 0.55 * (1 - this.t / 2.5));
      if (this.t > 1.2 && this.autoCracks > 0 && Math.random() < dt * 1.4) {
        this.autoCracks--;
        this.crack(Math.random(), 0.05 + Math.random() * 0.4, 0.6);
      }
      if (this.t > 2.6 && !this.said) { this.said = true; C.say('わあ ぴかぴか!', 'girl'); C.sfx.chime(); }
      if (this.t > 14 && this.sub === 'open') { this.sub = 'done'; C.goStage(C.tableStage); }
    }
    // 貫入が広がる
    if (this.cracks && this.cracks.length) {
      const g = this.glaze.crackG;
      for (let i = this.cracks.length - 1; i >= 0; i--) {
        const c = this.cracks[i]; c.t += dt; const r = c.R * Math.min(1, c.t / 1.2);
        const x = c.u * 256, y = c.v / 1 * 256;
        for (const ox of [-256, 0, 256]) {
          const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, Math.max(1, r));
          gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y, Math.max(1, r), 0, 6.3); g.fill();
        }
        if (c.t > 1.2) this.cracks.splice(i, 1);
        else if (Math.random() < dt * 3) C.sfx.ping();
      }
      this.glaze.crackTex.needsUpdate = true;
    }
    // 炉の光が消えていく
    if (this.sub !== 'fire') {
      K.peepM.color.multiplyScalar(Math.exp(-dt * 1.5));
      L.kiln.intensity *= Math.exp(-dt * 1.5);
    }
  }
}
