// Game core: world setup, input, picking, drag & drop, update loop.
import * as THREE from 'three';
import { Doll, DOLL, SPECS } from './doll.js';
import { buildItems, Slot, CAKE, cakeStand } from './items.js';
import { L } from './layout.js';
import { Particles, Shadows, glowSprite, ringDecal, P_SPARK, P_PETAL, P_HEART, P_NOTE, P_BUBBLE, P_DOT, P_CRUMB } from './fx.js';
import { Sound } from './audio.js';
import { M } from './mats.js';
import { Behave } from './behave.js';
import { Rules } from './rules.js';
import { Guide } from './guide.js';
import { Store, Persist } from './save.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V(), _v2 = V(), _v3 = V(), _q = new THREE.Quaternion(), _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
const UP = new THREE.Vector3(0, 1, 0);
export const DOLL_IDS = ['mimi', 'koko', 'hana', 'rara'];

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.quality = { dprScale: 1, shadows: true, frames: 0, acc: 0, checkT: 0, step: 0 };
    this.time = 0; this.play = 0; this.frameN = 0;
    this.sound = new Sound();
    this.fx = new Particles(this.scene, 140);
    this.shadows = new Shadows(this.scene, 72);
    this.flags = {};        // discoveries (for guidance only)
    this.events = [];       // debug log of meaningful reactions
    this.input = { id: null, down: false, x: 0, y: 0, sx: 0, sy: 0, t0: 0, moved: false, target: null, lastAny: -99, edgeT: 0 };
    this.drag = null; this.idle = 0;
    this.doorState = { a: 0, target: 0, open: false };
    this.store = new Store();

    // ---- dolls ----
    this.dolls = DOLL_IDS.map(id => { const d = new Doll(id); this.scene.add(d.root); return d; });
    this.doll = {}; for (const d of this.dolls) this.doll[d.id] = d;
    for (const d of this.dolls) Object.assign(d, { st: 'stand', zone: 'in', seat: -1, spot: -1, yaw: 0, yawT: 0, gest: [], focus: null, arrived: true, away: false, sleeping: false, lift: 0, dropT: 1, dropFrom: V(), dropTo: V(), cool: {}, mood: null, moodT: 0, attn: V(), attnKind: '', attnT: 0, vel: V(), prevPos: V(), lastFed: -99, walk: null, reachItem: [null, null], autoEat: null, peekCool: 0 });

    // ---- items & slots ----
    this.items = buildItems(); this.item = {};
    for (const it of this.items) { this.item[it.id] = it; this.scene.add(it.root); }
    this.cakeStand = cakeStand(); this.cakeStand.position.set(L.table.x, L.table.top, L.table.z); this.scene.add(this.cakeStand);
    this.buildSlots();
    // spread blanket mesh (on the bed)
    this.buildSpread();
    // tea stream
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0022, 1, 8, 1, true), M.stream); this.stream.visible = false; this.scene.add(this.stream);
    // guidance glow + preview ring
    this.hintGlow = glowSprite('#fff4d0', 0.07, 0); this.scene.add(this.hintGlow);
    this.preview = ringDecal('#fff8e8'); this.scene.add(this.preview);
    this.previewGlow = glowSprite('#fff2c8', 0.06, 0); this.scene.add(this.previewGlow); this.previewA = 0; this.previewRingA = 0;
    this.decoGlows = [];
    this.tapRing = ringDecal('#ffffff'); this.scene.add(this.tapRing); this.tapRingT = 9;

    Object.assign(this, Behave, Rules, Guide, Persist);
    this.initDefaults();
    this.restore();
    this.bindInput();
    this.initGuide();
    window.__gf62 = this.debugApi();
  }

  // ------------------------------------------------------------------ slots
  buildSlots() {
    const S = this.slots = []; this.slotById = {};
    const add = s => { S.push(s); this.slotById[s.id] = s; return s; };
    for (const d of this.dolls) {
      d.handSlots = [0, 1].map(i => add(new Slot({ id: `hand:${d.id}:${i}`, type: 'hand', doll: d, side: i, node: d.sockets[i], upright: true, yawFrom: () => d.root.rotation.y, filter: it => ['slice', 'plate', 'cup', 'spoon', 'pot', 'wreath', 'ribbon', 'bouquet', 'gift', 'cookie'].includes(it.kind) })));
      d.footSlots = [0, 1].map(i => add(new Slot({ id: `foot:${d.id}:${i}`, type: 'foot', doll: d, side: i, node: d.feet[i], filter: it => it.kind === 'shoe' && it.data.side === i })));
      const hn = new THREE.Object3D(); hn.position.set(0, 0.043, -0.004); d.head.add(hn);
      d.headSlot = add(new Slot({ id: `head:${d.id}`, type: 'head', doll: d, node: hn, filter: it => it.kind === 'ribbon' || it.kind === 'wreath' }));
    }
    const sh = L.shelf;
    for (let p = 0; p < 4; p++) for (const side of [0, 1]) {
      const n = new THREE.Object3D(); n.position.set(sh.pairs[p % 2] + (side === 0 ? 0.0125 : -0.0125), sh.tiers[Math.floor(p / 2)] + 0.0099, (sh.z0 + sh.z1) / 2 + 0.004); this.scene.add(n);
      add(new Slot({ id: `shelf:${p}:${side}`, type: 'shelf', node: n, side, pair: p, filter: it => it.kind === 'shoe' && it.data.side === side }));
    }
    this.room.hooks.forEach((h, i) => add(new Slot({ id: 'hook:' + i, type: 'hook', node: h, filter: it => !!it.data.deco })));
    add(new Slot({ id: 'hook:door', type: 'hook', node: this.room.doorHook, filter: it => it.kind === 'wreath' || it.kind === 'ribbon' }));
    for (let i = 0; i < 6; i++) {
      const n = new THREE.Object3D(); const a = i / 6 * Math.PI * 2 + Math.PI / 6;
      n.position.set(L.table.x + Math.sin(a) * CAKE.C, L.table.top + 0.015, L.table.z + Math.cos(a) * CAKE.C); n.rotation.y = a; this.scene.add(n);
      add(new Slot({ id: 'cake:' + i, type: 'cake', node: n, filter: it => it.kind === 'slice' }));
    }
    for (const it of this.items) if (it.kind === 'plate') {
      const n = new THREE.Object3D(); n.position.y = 0.0029; n.rotation.y = 1.95; it.root.add(n);
      it.slots.push(add(new Slot({ id: 'plate:' + it.id, type: 'plate', owner: it, node: n, filter: x => x.kind === 'slice' || x.kind === 'cookie' })));
    }
    const gift = this.item.gift;
    [[-0.011, -0.009], [0.011, -0.009], [-0.011, 0.009], [0.011, 0.009]].forEach(([x, z], i) => {
      const n = new THREE.Object3D(); n.position.set(x, 0.004, z); n.rotation.z = (i % 2 ? 0.25 : -0.25); gift.root.add(n);
      gift.slots.push(add(new Slot({ id: 'box:' + i, type: 'box', owner: gift, node: n, filter: x => x.kind === 'cookie' })));
    });
    const bn = new THREE.Object3D(); bn.position.set((L.bed.x0 + L.bed.x1) / 2, L.bed.top, (L.bed.z0 + L.bed.z1) / 2); this.scene.add(bn);
    this.bedSlot = add(new Slot({ id: 'bed', type: 'bed', node: bn, filter: it => it.kind === 'blanket' }));
  }

  buildSpread() {
    const b = L.bed, x0 = b.headX + 0.072, x1 = b.x1 - 0.004, z0 = b.z0 + 0.004, z1 = b.z1 + 0.016;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 28, 14); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.spreadBase = g.attributes.position.array.slice();
    this.spread = new THREE.Mesh(g, M.quilt); this.spread.castShadow = true; this.spread.receiveShadow = true; this.spread.visible = false; this.scene.add(this.spread);
    this.spreadKey = '';
  }
  updateSpread() {
    const b = L.bed, lying = this.dolls.filter(d => d.st === 'lie');
    const key = lying.map(d => d.spot).join(',');
    if (key === this.spreadKey) return; this.spreadKey = key;
    const p = this.spread.geometry.attributes.position, B = this.spreadBase;
    const zEdge = b.z1 - 0.004;
    for (let i = 0; i < p.count; i++) {
      const x = B[i * 3], z = B[i * 3 + 2];
      let h = b.top + 0.006;
      for (const d of lying) { const sz = L.bed.spots[d.spot]; const dz = (z - sz) / 0.036; const along = x > b.headX + 0.06 ? 1 : 0; const feet = Math.exp(-Math.pow((x - (b.headX + 0.235)) / 0.03, 2)); h = Math.max(h, b.top + 0.006 + (0.042 + 0.016 * feet) * Math.exp(-dz * dz) * along); }
      let y = h, zz = z;
      if (z > zEdge) { const k = (z - zEdge) / 0.02; y = h - k * 0.05; zz = zEdge + 0.004 + (z - zEdge) * 0.25; }
      const wav = Math.sin(x * 140) * 0.0012 * (z > zEdge ? 1 : 0.3);
      p.setXYZ(i, x, y + wav, zz);
    }
    p.needsUpdate = true; this.spread.geometry.computeVertexNormals();
  }

  // ------------------------------------------------------------------ defaults
  initDefaults() {
    const d = this.doll;
    this.placeDoll(d.mimi, -0.165, -0.15, 0.35);
    this.placeDoll(d.koko, L.porchSpot.x, L.porchSpot.z, 0, 'porch');
    for (const id of ['hana', 'rara']) { this.placeDoll(d[id], -0.7, -0.5, 0, 'porch'); d[id].away = true; d[id].arrived = false; d[id].root.visible = false; }
    // items
    const it = this.item, T = L.table;
    for (let i = 0; i < 6; i++) this.attach(it['slice' + i], this.slotById['cake:' + i], true);
    this.setFree(it.plate0, T.x - 0.066, T.top, T.z + 0.012, 0);
    this.setFree(it.plate1, T.x + 0.066, T.top, T.z + 0.012, 0);
    this.setFree(it.plate2, T.x, T.top, T.z - 0.068, 0);
    this.setFree(it.cup0, T.x - 0.042, T.top, T.z + 0.072, 0.4);
    this.setFree(it.cup1, T.x + 0.044, T.top, T.z + 0.07, -0.3);
    this.setFree(it.spoon0, T.x - 0.064, T.top, T.z + 0.052, 0.3);
    const tr = L.trolley;
    this.setFree(it.pot, (tr.x0 + tr.x1) / 2 - 0.02, tr.top, (tr.z0 + tr.z1) / 2, 0);
    this.setFree(it.cup2, tr.x1 - 0.022, tr.top, tr.z0 + 0.024, 0.2);
    this.setFree(it.cup3, tr.x1 - 0.022, tr.top, tr.z1 - 0.022, -0.4);
    this.setFree(it.spoon1, tr.x0 + 0.03, 0.045 + 0.003, (tr.z0 + tr.z1) / 2, 1.2);
    this.setFree(it.wreath, L.basket.x - 0.006, 0.04, L.basket.z - 0.012, 0.25, false);
    this.setFree(it.ribbon, L.basket.x + 0.022, 0.03, L.basket.z + 0.014, -0.35, false);
    this.attach(it.shoe_mimi0, this.slotById['shelf:0:0'], true); this.attach(it.shoe_mimi1, this.slotById['shelf:0:1'], true);
    this.attach(it.shoe_koko0, d.koko.footSlots[0], true); this.attach(it.shoe_koko1, d.koko.footSlots[1], true);
    this.attach(it.shoe_hana0, d.hana.footSlots[0], true); this.attach(it.shoe_hana1, d.hana.footSlots[1], true);
    this.attach(it.shoe_rara0, d.rara.footSlots[0], true); this.attach(it.shoe_rara1, d.rara.footSlots[1], true);
    this.setFree(it.blanket, L.bed.x1 - 0.06, L.bed.top, (L.bed.z0 + L.bed.z1) / 2 + 0.01, 0);
    this.attach(it.gift, d.hana.handSlots[1], true);
    for (let i = 0; i < 4; i++) { this.attach(it['cookie' + i], this.slotById['box:' + i], true); it['cookie' + i].hidden = true; }
    this.attach(it.bouquet, d.rara.handSlots[0], true);
    this.arrivalQueue = ['hana', 'rara'];
    this.nextArrival = 150;
  }

  placeDoll(d, x, z, yaw, zone = 'in') {
    d.root.position.set(x, zone === 'porch' ? L.porch.y : 0, z); d.yaw = d.yawT = yaw; d.root.rotation.y = yaw;
    d.st = 'stand'; d.zone = zone; d.seat = -1; d.spot = -1; d.dropT = 1; d.prevPos.copy(d.root.position);
  }

  // ------------------------------------------------------------------ items: attach / free
  attach(it, slot, instant = false) {
    if (it.slot) it.slot.occupant = null;
    it.slot = slot; slot.occupant = it; it.held = false;
    it.snapFrom.pos.copy(it.pos); it.snapFrom.quat.copy(it.quat); it.snapK = instant ? 1 : 0;
    it.lastMoved = this.time;
    if (instant) this.itemTransform(it, 0);
  }
  detach(it) { if (it.slot) { it.slot.occupant = null; it.slot = null; } }
  setFree(it, x, y, z, yaw = 0, flat) {
    this.detach(it); it.held = false;
    it.rest.pos.set(x, y, z); it.rest.yaw = yaw; it.rest.flat = flat === undefined ? !!it.data.deco : flat;
    it.snapFrom.pos.copy(it.pos); it.snapFrom.quat.copy(it.quat); it.snapK = 1;
    it.pos.set(x, y, z); this.restQuat(it, it.quat);
  }
  restQuat(it, q) {
    q.setFromAxisAngle(UP, it.rest.yaw);
    if (it.rest.flat) q.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    return q;
  }
  slotXform(it, slot, pos, quat) {
    slot.world(pos, quat);
    switch (slot.type) {
      case 'hand': pos.add(_v3.copy(it.handOffset).applyQuaternion(quat)); quat.multiply(it.handRot); if (it.data.deco && it.kind !== 'bouquet') { pos.y -= 0.01; } break;
      case 'hook': pos.add(_v3.set(0, -(it.data.hang || 0.02), 0.006)); break;
      case 'head': if (it.kind === 'wreath') { quat.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 + 0.25)); pos.add(_v3.set(0, 0.006, 0).applyQuaternion(quat)); } else { pos.add(_v3.set(0, 0.0, -0.01).applyQuaternion(quat)); quat.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35)); } break;
      case 'bed': break;
    }
    return pos;
  }
  itemTransform(it, dt) {
    if (it.hidden || (it.slot && it.slot.doll && it.slot.doll.away)) { it.root.visible = false; return; }
    it.root.visible = true;
    if (it.squashT !== undefined) { it.squashT += dt; const e = Math.exp(-it.squashT * 9) * Math.cos(it.squashT * 26) * (it.squashAmp || 0.1); it.root.scale.set(1 + e * 0.5, 1 - e, 1 + e * 0.5); if (it.squashT > 0.8) { it.squashT = undefined; it.root.scale.set(1, 1, 1); } }
    if (it.held) return; // drag code sets transform
    if (it.slot) {
      this.slotXform(it, it.slot, _v, _q);
      if (it.snapK < 1) {
        it.snapK = Math.min(1, it.snapK + dt / 0.2);
        const k = 1 - Math.pow(1 - it.snapK, 3);
        it.pos.lerpVectors(it.snapFrom.pos, _v, k); it.pos.y += Math.sin(Math.PI * k) * 0.012;
        it.quat.slerpQuaternions(it.snapFrom.quat, _q, k);
      } else { it.pos.copy(_v); it.quat.copy(_q); }
    } else {
      if (it.snapK < 1) {
        it.snapK = Math.min(1, it.snapK + dt / 0.16);
        const k = it.snapK * it.snapK;
        it.pos.lerpVectors(it.snapFrom.pos, it.rest.pos, k);
        this.restQuat(it, _q); it.quat.slerpQuaternions(it.snapFrom.quat, _q, Math.min(1, it.snapK * 1.5));
        if (it.snapK >= 1) this.onItemLanded(it);
      } else { it.pos.copy(it.rest.pos); this.restQuat(it, it.quat); }
    }
    // tilt (teapot pour)
    if (it.tilt > 0.001) it.vis.rotation.z = -it.tilt; else it.vis.rotation.z = 0;
    // small hop (tap / invitation) and pop-in after refilling
    if (it.hopT !== undefined) { it.hopT += dt; const k = it.hopT / 0.35; it.vis.position.y = k < 1 ? Math.sin(Math.PI * k) * 0.008 : 0; if (k >= 1) it.hopT = undefined; }
    if (it.popT !== undefined) { it.popT += dt / 0.35; const k = Math.min(1, it.popT), s = k < 1 ? 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2) : 1; const b = it.data.bites ? 1 - it.data.bites / ((it.kind === 'cookie' ? 2 : 3) + 0.6) : 1; it.vis.scale.set(s * b, s, s * b); if (k >= 1) it.popT = undefined; }
  }
  onItemLanded(it) {
    it.vis.position.y = 0; it.squashT = 0; it.squashAmp = 0.07;
    this.sound.tapItem(60 + (it.kind.length * 7) % 24);
  }

  // ------------------------------------------------------------------ projection helpers
  scr(p, out = { x: 0, y: 0, z: 0 }) { _v.copy(p).project(this.camera); out.x = (_v.x + 1) / 2 * this.S.w; out.y = (1 - _v.y) / 2 * this.S.h; out.z = _v.z; return out; }
  pxPerM(p) { // pixels per meter at world point p
    _v.copy(p).project(this.camera); _v2.setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(0.05).add(p).project(this.camera);
    return Math.hypot((_v2.x - _v.x) * this.S.w / 2, (_v2.y - _v.y) * this.S.h / 2) / 0.05;
  }
  rayPlane(x, y, h, out) {
    _ndc.set(x / this.S.w * 2 - 1, -(y / this.S.h) * 2 + 1); _ray.setFromCamera(_ndc, this.camera);
    const o = _ray.ray.origin, d = _ray.ray.direction; if (Math.abs(d.y) < 1e-4) return null;
    const t = (h - o.y) / d.y; if (t < 0) return null; return out.copy(o).addScaledVector(d, t);
  }
  minPx() { return Math.max(24, Math.min(this.S.w, this.S.h) * 0.045); }

  // ------------------------------------------------------------------ surfaces
  surfaceAt(x, z, forDoll = false, zone = 'in') {
    if (zone === 'porch') return { y: L.porch.y, kind: 'porch' };
    const T = L.table;
    if (Math.hypot(x - T.x, z - T.z) < T.r - 0.008) return { y: T.top, kind: 'table' };
    const b = L.bed; if (x > b.x0 + 0.01 && x < b.x1 - 0.01 && z > b.z0 && z < b.z1) return { y: b.top, kind: 'bed' };
    if (!forDoll) {
      const tr = L.trolley; if (x > tr.x0 && x < tr.x1 && z > tr.z0 && z < tr.z1) return { y: tr.top, kind: 'trolley' };
      const sh = L.shelf; if (x > sh.x0 && x < sh.x1 && z > sh.z0 && z < sh.z1 + 0.004) return { y: sh.top, kind: 'shelf' };
      const n = L.night; if (x > n.x0 && x < n.x1 && z > n.z0 && z < n.z1) return { y: n.top, kind: 'night' };
      for (const c of L.chairs) if (Math.hypot(x - c.x, z - c.z) < 0.027) return { y: L.seatH, kind: 'seat' };
      if (Math.hypot(x - L.basket.x, z - L.basket.z) < 0.045) return { y: 0.008, kind: 'basket' };
    }
    return { y: 0, kind: 'floor' };
  }
  // find what surface is under the finger by casting against each raised surface (+lift)
  dragHit(x, y, lift, forDoll, zone, out, grow = 0, prevKey = null) {
    const cands = [];
    const T = L.table, b = L.bed;
    if (zone !== 'porch') {
      cands.push({ key: 'table', y: T.top, inside: (p, g) => Math.hypot(p.x - T.x, p.z - T.z) < T.r - 0.006 + g });
      cands.push({ key: 'bed', y: b.top, inside: (p, g) => p.x > b.x0 + 0.01 - g && p.x < b.x1 - 0.01 + g && p.z > b.z0 && p.z < b.z1 + g });
      if (!forDoll) {
        for (const R of [{ k: 'trolley', r: L.trolley, y: L.trolley.top }, { k: 'shelf', r: L.shelf, y: L.shelf.top }, { k: 'night', r: L.night, y: L.night.top }]) cands.push({ key: R.k, y: R.y, inside: (p, g) => p.x > R.r.x0 - g && p.x < R.r.x1 + g && p.z > R.r.z0 && p.z < R.r.z1 + 0.004 + g });
        L.chairs.forEach((c, i) => cands.push({ key: 'seat' + i, y: L.seatH, inside: (p, g) => Math.hypot(p.x - c.x, p.z - c.z) < 0.027 + g * 0.5 }));
      }
    }
    let best = null, bt = 1e9;
    for (const c of cands) {
      const h = this.rayPlane(x, y, c.y + lift, _v3); if (!h) continue;
      const g = grow + (c.key === prevKey ? 0.03 : 0);
      if (!c.inside(h, g)) continue;
      const t = h.distanceTo(this.camera.position); if (t < bt) { bt = t; best = { y: c.y, x: h.x, z: h.z, key: c.key }; }
    }
    if (!best) { const fy = zone === 'porch' ? L.porch.y : 0; const h = this.rayPlane(x, y, fy + lift, _v3); if (!h) return null; best = { y: fy, x: h.x, z: h.z, key: 'floor' }; }
    out.set(best.x, best.y, best.z); this._hitKey = best.key;
    return out;
  }
  // clamp a point to walkable bounds, handling the wall/door crossing
  clampZone(p, zone, r = 0.03) {
    const R = L.room, P = L.porch, d = L.door, z0 = R.z0;
    const doorOpen = this.doorState.a > 0.9;
    const inDoorX = p.x > d.hingeX + 0.02 && p.x < d.hingeX + d.w - 0.02;
    if (zone === 'in') {
      if (p.z < z0 + r) { if (doorOpen && inDoorX && p.z < z0 - 0.01) zone = 'porch'; else p.z = z0 + r; }
    } else {
      if (p.z > z0 - 0.015) { if (doorOpen && inDoorX && p.z > z0 + 0.01) zone = 'in'; else p.z = z0 - 0.02; }
    }
    if (zone === 'in') { p.x = Math.min(R.x1 - r, Math.max(R.x0 + r, p.x)); p.z = Math.min(R.z1 - r * 0.5, p.z); }
    else { p.x = Math.min(P.x1 - 0.015, Math.max(P.x0 + 0.015, p.x)); p.z = Math.max(P.z0 + 0.02, Math.min(z0 - 0.02, p.z)); }
    // divider wall (partial)
    if (zone === 'in' && p.z < L.divZ1 + r) { if (Math.abs(p.x - L.divX) < 0.012 + r) p.x = p.x < L.divX ? L.divX - 0.012 - r : L.divX + 0.012 + r; }
    return zone;
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const cv = this.renderer.domElement;
    const opts = { passive: false };
    const prevent = e => { if (e.cancelable) e.preventDefault(); };
    document.addEventListener('touchstart', prevent, opts); document.addEventListener('touchmove', prevent, opts);
    document.addEventListener('gesturestart', prevent, opts); document.addEventListener('contextmenu', prevent, opts);
    document.addEventListener('dblclick', prevent, opts); document.addEventListener('selectstart', prevent, opts);
    cv.addEventListener('pointerdown', e => this.onDown(e), opts);
    window.addEventListener('pointermove', e => this.onMove(e), opts);
    window.addEventListener('pointerup', e => this.onUp(e, false), opts);
    window.addEventListener('pointercancel', e => this.onUp(e, true), opts);
    cv.addEventListener('lostpointercapture', e => { if (e.pointerId === this.input.id) this.onUp(e, true); });
    window.addEventListener('blur', () => this.cancelDrag());
  }
  onDown(e) {
    if (e.cancelable) e.preventDefault();
    this.sound.start();
    this.input.lastAny = this.time; this.idle = 0;
    this.demoAbort && this.demoAbort();
    if (this.input.id !== null) return; // single finger only
    const I = this.input; I.id = e.pointerId; I.down = true; I.x = I.sx = e.clientX; I.y = I.sy = e.clientY; I.t0 = this.time; I.moved = false; I.edgeT = 0;
    try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
    const hit = this.pickAt(I.x, I.y);
    I.target = hit;
    if (hit && hit.type === 'doll') this.grabDoll(hit.obj, hit);
    else if (hit && hit.type === 'item') this.grabItem(hit.obj);
    else if (hit && hit.type === 'door') this.toggleDoor(true);
    else this.tapEmpty(I.x, I.y);
  }
  onMove(e) {
    const I = this.input; if (e.pointerId !== I.id) return;
    if (e.cancelable) e.preventDefault();
    I.x = e.clientX; I.y = e.clientY;
    if (Math.hypot(I.x - I.sx, I.y - I.sy) > 9) I.moved = true;
  }
  onUp(e, cancel) {
    const I = this.input; if (e.pointerId !== I.id) return;
    I.id = null; I.down = false;
    try { this.renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
    const tap = !I.moved && this.time - I.t0 < 0.35 && !cancel;
    if (this.drag) this.release(tap);
    I.target = null;
  }
  cancelDrag() { if (this.input.id !== null) { this.input.id = null; this.input.down = false; if (this.drag) this.release(false); } }

  pickAt(x, y) {
    const minPx = this.minPx(); let best = null, bs = 1;
    const consider = (type, obj, p, r, bias = 1, part) => {
      if (!p) return; const s = this.scr(p); if (s.z > 1) return;
      const rp = Math.max(minPx * (type === 'doll' ? 1.2 : 1), r * this.pxPerM(p));
      const score = Math.hypot(s.x - x, s.y - y) / rp * bias;
      if (score < bs) { bs = score; best = { type, obj, part, score }; }
    };
    const doorOpen = this.doorState.a > 0.9;
    for (const d of this.dolls) {
      if (d.away || !d.root.visible) continue;
      let bias = 1.15;
      if (d.zone === 'porch' && !doorOpen) { // only through the door window / door area
        bias = 1.05;
      }
      d.chest.getWorldPosition(_v2); consider('doll', d, _v2.clone(), 0.04, bias * 0.92, 'chest');
      d.head.getWorldPosition(_v2); consider('doll', d, _v2.clone(), 0.045, bias, 'head');
      d.pelvis.getWorldPosition(_v2); consider('doll', d, _v2.clone(), 0.04, bias * 1.05, 'hips');
      if (d.st === 'lie') { d.knees[0].getWorldPosition(_v2); consider('doll', d, _v2.clone(), 0.04, bias * 1.1, 'legs'); }
    }
    for (const it of this.items) {
      if (it.hidden || !this.itemPickable(it)) continue;
      _v2.set(0, it.pickY, 0).applyQuaternion(it.quat).add(it.pos);
      let bias = 1;
      if (it.slot && it.slot.type === 'cake') bias = 1.02;
      if (it.slot && it.slot.type === 'foot') bias = 0.85;
      if (it.kind === 'blanket' && it.slot) { _v2.set((L.bed.headX + L.bed.x1) / 2 + 0.06, L.bed.top + 0.02, (L.bed.z0 + L.bed.z1) / 2 + 0.03); consider('item', it, _v2.clone(), 0.07, 0.9); continue; }
      consider('item', it, _v2.clone(), it.pickR, bias);
    }
    // door: whole panel
    const dp = this.doorCenter(_v3);
    const ds = this.scr(dp), ppm = this.pxPerM(dp);
    const hw = (L.door.w / 2) * ppm * Math.max(0.35, Math.cos(this.doorState.a)), hh = (L.door.h / 2) * ppm;
    if (Math.abs(x - ds.x) < hw + 6 && Math.abs(y - ds.y) < hh) {
      const sc = 0.98;
      // porch doll behind closed door takes priority when touching its window/body
      if (!best || best.score > 0.7 || (best.type === 'doll' && best.obj.zone === 'porch' && this.doorState.a < 0.5 && best.score > 0.45)) {
        if (!(best && best.type === 'doll' && best.obj.zone === 'porch' && best.score < 0.6)) { best = { type: 'door', obj: null, score: sc }; }
      }
    }
    return best;
  }
  itemPickable(it) {
    if (it.kind === 'gift' && it.slot && it.slot.doll && it.slot.doll.away) return false;
    if (it.slot && it.slot.doll && it.slot.doll.away) return false;
    if (it.kind === 'cookie' && !this.item.gift.data.open) return false;
    return true;
  }
  doorCenter(out) { const d = L.door, a = this.doorState.a; return out.set(d.hingeX + Math.cos(a) * d.w / 2, d.h / 2, d.z + Math.sin(a) * d.w / 2); }

  tapEmpty(x, y) {
    // local tiny ripple where touched (no global reaction)
    const p = this.rayPlane(x, y, 0, V());
    if (p && p.x > L.room.x0 - 0.1 && p.x < L.room.x1 + 0.1 && p.z > L.room.z0 - 0.1 && p.z < L.room.z1 + 0.15) {
      this.tapRing.position.set(p.x, 0.002, p.z); this.tapRingT = 0; this.sound.touchSmall(Math.random());
      if (this.S.w / this.S.h < 1.2) { if (this.S.viewName === 'living' && (p.x > L.divX - 0.02 || x > this.S.w * 0.88)) this.setView('bed'); else if (this.S.viewName === 'bed' && (p.x < L.divX + 0.03 || x < this.S.w * 0.12)) this.setView('living'); }
    }
  }

  // ------------------------------------------------------------------ grab / drag / release
  grabDoll(d, hit) {
    if (d.walk) d.walk = null;
    const prev = { st: d.st, seat: d.seat, spot: d.spot, zone: d.zone, pos: d.root.position.clone(), yaw: d.yaw };
    if (d.st === 'lie') this.wake(d, true);
    d.st = 'held'; d.seat = -1; d.spot = -1; d.gest = d.gest.filter(g => g.keep);
    d.squash = 0.07; d.squashV = -1.5;
    d.V.hipL = 0.5; d.V.hipR = -0.4;
    this.drag = { type: 'doll', obj: d, prev, surf: d.root.position.y, pos: d.root.position.clone(), zone: d.zone, t0: this.time };
    if (!this.firstResp) this.firstResp = { t0: performance.now(), id: d.id, y0: d.root.position.y, ms: -1 };
    this.flags.picked = true; this.flags.firstTouch = this.flags.firstTouch || this.time;
    this.setMood(d, 'open', 0.8, 0.6, 1.5);
    this.sound.pick(d.id);
    this.log('pick', d.id);
    this.onPickDoll && this.onPickDoll(d);
  }
  grabItem(it) {
    const from = it.slot;
    if (it.kind === 'blanket' && from && from.type === 'bed') this.blanketLifted();
    this.detach(it);
    it.held = true; it.snapK = 1; it.squashT = 0; it.squashAmp = 0.1;
    if (it.kind === 'blanket') { it.vis.visible = true; }
    this.drag = { type: 'item', obj: it, from, surf: it.pos.y, pos: it.pos.clone(), zone: this.zoneOf(it.pos), t0: this.time };
    if (from && from.doll) this.onItemTaken(from.doll, it, from);
    this.sound.tapItem(64 + (it.kind.charCodeAt(0) * 3) % 20);
    this.log('pickItem', it.id);
  }
  zoneOf(p) { return p.z < L.room.z0 - 0.005 && p.x > L.porch.x0 - 0.05 && p.x < L.porch.x1 + 0.05 ? 'porch' : 'in'; }

  updateDrag(dt) {
    const D = this.drag; if (!D) return;
    const I = this.input, k = 1 - Math.exp(-dt * 26);
    if (D.type === 'doll') {
      const d = D.obj;
      const lift = 0.03;
      const hit = this.dragHit(I.x, I.y, lift + DOLL.chestY, true, D.zone, _v, 0.015, D.key);
      if (hit) { D.key = this._hitKey; D.surf += (hit.y - D.surf) * (1 - Math.exp(-dt * 14)); D.pos.set(hit.x, D.surf + lift, hit.z); }
      D.zone = this.clampZone(D.pos, D.zone, 0.035);
      d.zone = D.zone;
      d.root.position.x += (D.pos.x - d.root.position.x) * k; d.root.position.z += (D.pos.z - d.root.position.z) * k;
      d.root.position.y += (D.pos.y + Math.sin(this.time * 7) * 0.002 - d.root.position.y) * (1 - Math.exp(-dt * 30));
      // face the viewer while carried (keep face visible)
      d.yawT = Math.atan2(this.camera.position.x - d.root.position.x, this.camera.position.z - d.root.position.z) * 0.7;
      this.autoDoor(D.pos);
    } else {
      const it = D.obj;
      const off = Math.min(30, this.S.h * 0.035) * (it.kind === 'blanket' ? 0.5 : 1);
      const lift = it.kind === 'blanket' ? 0.05 : 0.032;
      const hit = this.dragHit(I.x, I.y - off, lift, false, D.zone, _v, it.r * 0.8, D.key);
      if (hit) { D.key = this._hitKey; D.surf += (hit.y - D.surf) * (1 - Math.exp(-dt * 14)); D.pos.set(hit.x, D.surf + lift, hit.z); }
      D.wall = false;
      if (it.data.deco && hit && D.zone === 'in' && hit.z < L.room.z0 + 0.03) {
        // slide up the wall so decorations can reach hooks
        _ndc.set(I.x / this.S.w * 2 - 1, -((I.y - off) / this.S.h) * 2 + 1); _ray.setFromCamera(_ndc, this.camera);
        const o = _ray.ray.origin, dr = _ray.ray.direction, wz = L.room.z0 + 0.03;
        if (Math.abs(dr.z) > 1e-4) { const tt = (wz - o.z) / dr.z; const wy = o.y + dr.y * tt; if (tt > 0 && wy > D.surf + lift) { D.pos.set(o.x + dr.x * tt, Math.min(L.wallH - 0.04, wy), wz); D.wall = true; } }
      }
      if (!D.wall) D.zone = this.clampZone(D.pos, D.zone, 0.01);
      it.pos.lerp(D.pos, k);
      // orientation while carried
      _q.setFromAxisAngle(UP, it.data.deco ? 0 : it.rest.yaw);
      it.quat.slerp(_q, 1 - Math.exp(-dt * 12));
      this.autoDoor(D.pos);
    }
    // gentle preview of where it would settle
    if ((this.frameN % 3) === 0) {
      D.pv = null; D.pr = null;
      if (D.type === 'doll') {
        const t = this.dollDropTarget(D.obj, D);
        if (t.kind === 'seat') { const c = L.chairs[t.index]; D.pr = { x: c.x, y: L.seatH + 0.003, z: c.z, s: 0.08 }; }
        else if (t.kind === 'bed') { D.pr = { x: L.bed.headX + 0.1, y: L.bed.top + 0.003, z: L.bed.spots[t.index], s: 0.12 }; }
      } else {
        const sl = this.bestSlot(D.obj);
        if (sl && sl.type !== 'bed') { D.pv = sl.node.getWorldPosition(new THREE.Vector3()); if (sl.type === 'hook') D.pv.y -= 0.02; }
        else if (sl && sl.type === 'bed') D.pr = { x: (L.bed.x0 + L.bed.x1) / 2 + 0.04, y: L.bed.top + 0.003, z: (L.bed.z0 + L.bed.z1) / 2, s: 0.2 };
      }
    }
    // portrait: pan to other room when held at the screen edge
    if (this.S.w / this.S.h < 1.2) {
      const edge = this.S.w * 0.08;
      if ((I.x > this.S.w - edge && this.S.viewName === 'living') || (I.x < edge && this.S.viewName === 'bed')) { I.edgeT += dt; if (I.edgeT > 0.35) { this.setView(this.S.viewName === 'living' ? 'bed' : 'living'); I.edgeT = -0.6; } }
      else I.edgeT = Math.min(0, I.edgeT + dt);
    }
  }

  release(tap) {
    const D = this.drag; this.drag = null; if (!D) return;
    if (D.type === 'doll') this.dropDoll(D.obj, D, tap);
    else this.dropItem(D.obj, D, tap);
    this.saveSoon();
  }

  dropDoll(d, D, tap) {
    const p = d.root.position, target = this.dollDropTarget(d, D);
    d.dropFrom.copy(p); d.dropT = 0;
    if (target.kind === 'seat') { this.sitDoll(d, target.index); }
    else if (target.kind === 'bed') { this.lieDoll(d, target.index); }
    else {
      d.st = 'stand'; d.zone = D.zone; d.dropTo.copy(target.pos);
      this.sound.drop(d.id, false);
    }
    if (tap) this.tapDoll(d, D.prev);
    this.log('drop', d.id + ':' + (target.kind || 'floor'));
  }
  dollDropTarget(d, D) {
    const p = d.root.position, zone = D.zone;
    if (zone === 'in') {
      // chairs (generous)
      let bi = -1, bd = 0.085;
      L.chairs.forEach((c, i) => { if (this.seatOccupant(i)) return; const dd = Math.hypot(p.x - c.x, p.z - c.z); if (dd < bd) { bd = dd; bi = i; } });
      if (bi >= 0) return { kind: 'seat', index: bi };
      const b = L.bed;
      if (p.x > b.x0 - 0.02 && p.x < b.x1 + 0.02 && p.z > b.z0 - 0.02 && p.z < b.z1 + 0.03) {
        let si = -1, sd = 9; b.spots.forEach((sz, i) => { if (this.spotOccupant(i)) return; const dd = Math.abs(p.z - sz); if (dd < sd) { sd = dd; si = i; } });
        if (si >= 0) return { kind: 'bed', index: si };
      }
    }
    const pos = V().copy(p);
    let s = this.surfaceAt(pos.x, pos.z, true, zone);
    if (s.kind === 'table') {
      // dolls belong on chairs, not on the table: take the nearest free seat, or step down beside the table
      let bi = -1, bd = 0.24;
      L.chairs.forEach((c, i) => { if (this.seatOccupant(i)) return; const dd = Math.hypot(p.x - c.x, p.z - c.z); if (dd < bd) { bd = dd; bi = i; } });
      if (bi >= 0) return { kind: 'seat', index: bi };
      const T = L.table, dd = Math.max(1e-3, Math.hypot(pos.x - T.x, pos.z - T.z)), k = (T.r + 0.03) / dd;
      pos.x = T.x + (pos.x - T.x) * k; pos.z = T.z + (pos.z - T.z) * k; s = { y: 0, kind: 'floor' };
    }
    pos.y = s.y;
    if (s.kind === 'floor' || s.kind === 'porch') this.pushOut(pos, d);
    return { kind: s.kind, pos };
  }
  pushOut(pos, d) {
    const r = 0.03;
    const rects = [L.shelf, L.trolley, L.night, { x0: L.bed.x0, x1: L.bed.x1, z0: L.bed.z0, z1: L.bed.z1 }];
    for (const R of rects) {
      if (pos.x > R.x0 - r && pos.x < R.x1 + r && pos.z > R.z0 - r && pos.z < R.z1 + r) pos.z = R.z1 + r;
    }
    const T = L.table, dt = Math.hypot(pos.x - T.x, pos.z - T.z);
    if (dt < T.r + 0.025 && dt > T.r - 0.008) { const k = (T.r + 0.026) / Math.max(dt, 1e-3); pos.x = T.x + (pos.x - T.x) * k; pos.z = T.z + (pos.z - T.z) * k; }
    for (const c of L.chairs) { const dc = Math.hypot(pos.x - c.x, pos.z - c.z); if (dc < 0.055) { const k = 0.056 / Math.max(dc, 1e-3); pos.x = c.x + (pos.x - c.x) * k; pos.z = c.z + (pos.z - c.z) * k; } }
    // other dolls
    for (let it = 0; it < 3; it++) for (const o of this.dolls) {
      if (o === d || o.away || o.st !== 'stand' || o.zone !== (d ? d.zone : 'in')) continue;
      const op = o.dropT < 1 ? o.dropTo : o.root.position; const dx = pos.x - op.x, dz = pos.z - op.z, dd = Math.hypot(dx, dz);
      if (dd < 0.058) { const k = 0.06 / Math.max(dd, 1e-3); if (dd < 1e-3) { pos.x += 0.06; } else { pos.x = op.x + dx * k; pos.z = op.z + dz * k; } }
    }
    if (d) this.clampZone(pos, d.zone, 0.03);
  }
  seatOccupant(i) { return this.dolls.find(d => d.st === 'sit' && d.seat === i); }
  spotOccupant(i) { return this.dolls.find(d => d.st === 'lie' && d.spot === i); }

  dropItem(it, D, tap) {
    it.held = false;
    const slot = tap && D.from && D.from.type !== 'bed' ? D.from : this.bestSlot(it);
    if (tap && it.kind === 'gift' && !it.data.open) { this.openGift(it, D.from && D.from.doll); }
    if (slot && slot.accepts(it)) {
      this.attach(it, slot);
      this.onItemPlaced(it, slot, D);
    } else {
      const p = it.pos.clone();
      let s = this.surfaceAt(p.x, p.z, false, D.zone);
      if (it.kind === 'blanket' && s.kind === 'seat') s = { y: 0, kind: 'floor' };
      p.y = s.y + (s.kind === 'basket' ? 0.004 : 0);
      if (s.kind === 'floor' || s.kind === 'porch') this.pushOutItem(p, it);
      this.detach(it);
      it.snapFrom.pos.copy(it.pos); it.snapFrom.quat.copy(it.quat);
      it.rest.pos.copy(p); it.rest.flat = !!it.data.deco; it.snapK = 0;
      if (!it.data.deco) it.rest.yaw = it.rest.yaw || 0;
      this.onItemFree(it, s, D);
    }
    it.lastMoved = this.time;
    if (tap) this.tapItem(it);
    this.log('dropItem', it.id + ':' + (it.slot ? it.slot.id : 'free'));
  }
  pushOutItem(p, it) {
    const T = L.table, dt = Math.hypot(p.x - T.x, p.z - T.z);
    if (dt < T.r + 0.01 && dt > T.r - 0.008) { const k = (T.r + 0.012) / Math.max(dt, 1e-3); p.x = T.x + (p.x - T.x) * k; p.z = T.z + (p.z - T.z) * k; }
    for (const o of this.items) { if (o === it || o.slot || o.held || o.hidden) continue; const dx = p.x - o.rest.pos.x, dz = p.z - o.rest.pos.z, dd = Math.hypot(dx, dz), rr = (o.r + it.r) * 0.8; if (dd < rr && Math.abs(o.rest.pos.y - p.y) < 0.02) { const k = rr / Math.max(dd, 1e-3); if (dd < 1e-3) p.x += rr; else { p.x = o.rest.pos.x + dx * k; p.z = o.rest.pos.z + dz * k; } } }
  }
  bestSlot(it) {
    const minPx = this.minPx() * 1.15;
    const ip = _v3.set(0, it.pickY, 0).add(it.pos).clone(), is = this.scr(ip);
    let best = null, bs = 1;
    for (const s of this.slots) {
      if (!s.accepts(it)) continue;
      if (s.doll && (s.doll.away || s.doll.st === 'held')) continue;
      if (s.owner && (s.owner === it || s.owner.held || s.owner.hidden)) continue;
      if (s.type === 'box' && !this.item.gift.data.open) continue;
      if (s.type === 'bed') { const b = L.bed; if (it.pos.x > b.x0 - 0.03 && it.pos.x < b.x1 + 0.03 && it.pos.z > b.z0 - 0.03 && it.pos.z < b.z1 + 0.05) return s; continue; }
      const pts = [];
      s.node.getWorldPosition(_v2); pts.push(_v2.clone());
      if (s.type === 'hand') { const dl = s.doll; for (const n of (it.data.deco && it.kind !== 'bouquet' ? [dl.chest, dl.pelvis, dl.sockets[1 - s.side]] : [dl.chest, dl.head, dl.pelvis, dl.sockets[1 - s.side]])) { n.getWorldPosition(_v2); pts.push(_v2.clone()); } }
      let r = 0.03;
      if (s.type === 'hook') r = 0.05; if (s.type === 'shelf') r = 0.02; if (s.type === 'foot') r = 0.022; if (s.type === 'cake') r = 0.02; if (s.type === 'head') r = 0.03;
      for (const p of pts) {
        const ss = this.scr(p); const rp = Math.max(minPx, r * this.pxPerM(p));
        let sc = Math.hypot(ss.x - is.x, ss.y - is.y) / rp;
        if (s.type === 'hand' && s.occupant) sc *= 1.3;
        if (s.type === 'head') sc *= 0.7;
        if (s.type === 'hand' && s.doll.handSlots[1 - s.side].occupant === null && s.side === 1) sc *= 1.02;
        if (sc < bs) { bs = sc; best = s; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ door
  toggleDoor(byTap) {
    const st = this.doorState; st.open = !st.open; st.target = st.open ? 1.62 : 0;
    this.sound.door(st.open); if (st.open) this.onDoorOpened && this.onDoorOpened(byTap);
    this.log('door', st.open ? 'open' : 'close');
    this.saveSoon();
  }
  autoDoor(p) {
    const st = this.doorState; if (st.open) return;
    if (Math.abs(p.x - L.door.x) < 0.11 && Math.abs(p.z - L.room.z0) < 0.09) this.toggleDoor(false);
  }
  updateDoor(dt) {
    const st = this.doorState;
    const k = 1 - Math.exp(-dt * (st.target > st.a ? 6 : 8));
    st.a += (st.target - st.a) * k;
    this.room.door.rotation.y = -st.a;
  }

  // ------------------------------------------------------------------ main update
  onResize() { }
  update(dt, t) {
    this.time += dt; this.frameN++; this.dt = dt;
    if (this.sound.started) this.play += dt;
    this.idle += dt;
    this.updateDrag(dt);
    this.updateDoor(dt);
    this.updateDolls(dt);
    for (const it of this.items) this.itemTransform(it, dt);
    this.updateRules(dt);
    this.updateSpread();
    this.spread.visible = !!(this.item.blanket.slot && this.item.blanket.slot.type === 'bed');
    if (this.spread.visible) this.item.blanket.root.visible = false;
    this.updateFx(dt);
    this.updateGuide(dt);
    this.sound.sleepy = this.dolls.some(d => d.sleeping) && (this.S.viewName === 'bed' || this.S.w / this.S.h >= 1.2) && this.dolls.filter(d => !d.away && !d.sleeping).length <= 1 ? 1 : 0;
    this.sound.update(dt);
    this.saveTick(dt);
    this.adaptQuality(dt);
    if (this.quality.shadows && (this.frameN % 2 === 0)) this.renderer.shadowMap.needsUpdate = true;
  }
  afterRender() {
    const f = this.firstResp;
    if (f && f.ms < 0) { const d = this.doll[f.id]; if (d.root.position.y - f.y0 > 0.004 || Math.abs(d.squash) > 0.01) f.ms = Math.round(performance.now() - f.t0); }
  }
  onHide() { this.cancelDrag(); this.sound.suspend(); this.saveNow(); }
  onShow() { this.sound.resume(); }

  updateFx(dt) {
    this.fx.update(dt);
    const D = this.drag;
    const pv = D && D.pv, pr = D && D.pr;
    this.previewA += ((pv ? 1 : 0) - this.previewA) * (1 - Math.exp(-dt * 10));
    this.previewRingA += ((pr ? 1 : 0) - this.previewRingA) * (1 - Math.exp(-dt * 10));
    if (pv) this.previewGlow.position.copy(pv);
    this.previewGlow.material.opacity = 0.55 * this.previewA * (0.8 + 0.2 * Math.sin(this.time * 8));
    if (pr) { this.preview.position.set(pr.x, pr.y, pr.z); this.preview.scale.set(pr.s, pr.s, pr.s); }
    this.preview.material.opacity = 0.6 * this.previewRingA;
    // contact shadows
    const S = this.shadows; S.begin();
    for (const d of this.dolls) {
      if (d.away || !d.root.visible) continue;
      const p = d.root.position, zone = d.zone;
      const surf = d.st === 'sit' ? 0 : d.st === 'lie' ? L.bed.top : this.surfaceAt(p.x, p.z, true, zone).y;
      const hgt = Math.max(0, p.y - surf);
      if (d.st === 'lie') { S.add(p.x - 0.1, L.bed.top + 0.001, p.z, 0.09, 0.35, 2.8, 0); continue; }
      const a = (d.st === 'sit' ? 0.45 : 0.62) / (1 + hgt * 30), sz = 0.072 * (1 + hgt * 6);
      S.add(p.x, surf, p.z, sz, a, 1.1, d.yaw);
      if (d.st === 'sit') { const c = L.chairs[d.seat]; S.add(c.x, 0, c.z, 0.09, 0.25, 1); }
    }
    for (const it of this.items) {
      if (it.hidden || !it.root.visible) continue;
      const fr = !it.slot || it.held;
      if (!fr && !(it.slot.type === 'plate' || it.slot.type === 'cake')) continue;
      if (it.slot && it.slot.type === 'cake') continue;
      const p = it.pos, z = this.zoneOf(p), surf = this.surfaceAt(p.x, p.z, false, z).y, hgt = Math.max(0, p.y - surf);
      if (it.slot) continue;
      S.add(p.x, surf, p.z, it.r * 2.6 * (1 + hgt * 8), 0.5 / (1 + hgt * 25), it.kind === 'blanket' ? 1.4 : 1, it.rest.yaw);
    }
    S.end();
    // tap ripple
    this.tapRingT += dt; const k = this.tapRingT / 0.5;
    if (k < 1) { this.tapRing.material.opacity = 0.5 * (1 - k); const s = 0.02 + k * 0.05; this.tapRing.scale.set(s, s, s); this.tapRing.visible = true; } else this.tapRing.visible = false;
    for (const g of this.decoGlows) { g.t += dt; const a = g.t < 2.2 ? Math.min(1, g.t * 4) * (1 - g.t / 2.2) * 0.8 + 0.18 : 0.18 + 0.05 * Math.sin(this.time * 2 + g.ph); g.s.material.opacity = a; if (g.item) { g.item.pos && g.s.position.copy(g.item.pos).add(_v.set(0, 0.012, 0.01)); } if (Math.random() < dt * 0.35) this.fx.emit({ pos: g.s.position.clone().add(_v.set((Math.random() - 0.5) * 0.06, (Math.random() - 0.3) * 0.05, 0.01)), vel: _v2.set(0, 0.01, 0), size: 0.008, cell: P_SPARK, life: 1.2, col: '#fff6d0' }); }
  }

  adaptQuality(dt) {
    const Q = this.quality; Q.frames++; Q.acc += dt; Q.checkT += dt;
    if (Q.checkT > 3 && this.time > 4 && !Q.locked) {
      const avg = Q.acc / Q.frames; Q.frames = 0; Q.acc = 0; Q.checkT = 0;
      if (avg > 0.026 && Q.dprScale > 0.62) { Q.dprScale = Math.max(0.6, Q.dprScale - 0.15); this.resize && this.resize(); }
      else if (avg > 0.03 && Q.shadows) { Q.shadows = false; this.key.castShadow = false; this.renderer.shadowMap.enabled = false; this.scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } }); }
    }
  }

  log(type, info) { this.events.push({ t: +this.time.toFixed(2), type, info }); if (this.events.length > 400) this.events.shift(); }
  setMood(d, mouth, blush = 0.5, brow = 0, dur = 1.5) { d.mood = { mouth, blush, brow }; d.moodT = dur; }

  debugApi() {
    const g = this;
    return {
      game: g,
      screenOf(kind, id, part) {
        let p;
        if (kind === 'doll') { const d = g.doll[id]; p = (part === 'head' ? d.head : d.chest).getWorldPosition(V()); }
        else if (kind === 'item') { const it = g.item[id]; p = V(0, it.pickY, 0).applyQuaternion(it.quat).add(it.pos); }
        else if (kind === 'door') p = g.doorCenter(V());
        else if (kind === 'chair') { const c = L.chairs[id]; p = V(c.x, 0.1, c.z); }
        else if (kind === 'slot') { p = g.slotById[id].node.getWorldPosition(V()); }
        else if (kind === 'world') p = new THREE.Vector3(id[0], id[1], id[2]);
        else if (kind === 'mouth') p = g.doll[id].mouth.getWorldPosition(V());
        else if (kind === 'hand') p = g.doll[id].sockets[part || 0].getWorldPosition(V());
        const s = g.scr(p); return { x: s.x, y: s.y };
      },
      state() {
        return {
          dolls: g.dolls.map(d => ({ id: d.id, st: d.st, zone: d.zone, seat: d.seat, spot: d.spot, away: d.away, sleeping: d.sleeping, x: +d.root.position.x.toFixed(3), y: +d.root.position.y.toFixed(3), z: +d.root.position.z.toFixed(3), mouth: d.expr.mouth, hands: d.handSlots.map(s => s.occupant && s.occupant.id), feet: d.footSlots.map(s => s.occupant && s.occupant.id), head: d.headSlot.occupant && d.headSlot.occupant.id })),
          items: g.items.map(it => ({ id: it.id, slot: it.slot && it.slot.id, held: it.held, hidden: it.hidden, x: +it.pos.x.toFixed(3), y: +it.pos.y.toFixed(3), z: +it.pos.z.toFixed(3), data: it.data })),
          door: g.doorState.open, flags: g.flags, firstResp: g.firstResp, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, store: g.store.status, restore: g.restoreStatus, play: g.play, view: g.S.viewName, particles: g.fx.count, events: g.events.slice(-40), hint: g.hint && g.hint.name, dpr: g.renderer.getPixelRatio(), quality: g.quality,
        };
      },
      setPlay(s) { g.play = s; },
      place(id, mode, a, b) {
        const d = g.doll[id]; if (d.away) { d.away = false; d.arrived = true; g.arrivalQueue = g.arrivalQueue.filter(x => x !== id); }
        if (mode === 'sit') { g.sitDoll(d, a); } else if (mode === 'lie') { g.lieDoll(d, a); } else { g.placeDoll(d, a, b, 0, b < L.room.z0 ? 'porch' : 'in'); }
        d.dropT = 1; d.root.position.copy(mode === 'stand' ? d.root.position : d.dropTo); d.yaw = d.yawT; d.prevPos.copy(d.root.position);
      },
      put(itemId, slotId) { const it = g.item[itemId], sl = g.slotById[slotId]; if (sl && sl.accepts(it)) { g.attach(it, sl, true); return true; } return false; },
      level(cupId, v) { g.item[cupId].data.level = v; },
    };
  }
}
