// Movable props and the slot system they snap into.
import * as THREE from 'three';
import { M, TX } from './mats.js';
import { ell, xf, lathe, merge, taperTube, curve, cyl, rbox, disc } from './geo.js';
import { SPECS } from './doll.js';

function mk(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }

// ---------------- geometry builders ----------------
const SLICE_R = 0.042, SLICE_A = Math.PI / 3, SLICE_C = (2 * SLICE_R * Math.sin(SLICE_A / 2)) / (3 * (SLICE_A / 2));
export const CAKE = { R: SLICE_R, C: SLICE_C, H: 0.026 };

function sliceGeo() {
  // wedge: tip at z=-C, arc toward +z, angle ±30deg. groups: 0 section(cut faces), 1 cream (top+arc), 2 sponge(bottom)
  const H = CAKE.H, R = SLICE_R, n = 12, pos = [], uv = [], groups = [];
  const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r - SLICE_C];
  const tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  let start = 0;
  // cut faces (two radial planes)
  for (const s of [-1, 1]) {
    const a = s * SLICE_A / 2;
    const o0 = P(0, 0, 0), o1 = P(0, 0, H), e0 = P(a, R, 0), e1 = P(a, R, H);
    if (s > 0) { tri(o0, e0, e1, [0, 0], [1, 0], [1, 1]); tri(o0, e1, o1, [0, 0], [1, 1], [0, 1]); }
    else { tri(o0, e1, e0, [0, 0], [1, 1], [1, 0]); tri(o0, o1, e1, [0, 0], [0, 1], [1, 1]); }
  }
  groups.push([start, pos.length / 3 - start, 0]); start = pos.length / 3;
  // top + arc
  for (let i = 0; i < n; i++) {
    const a0 = -SLICE_A / 2 + SLICE_A * i / n, a1 = -SLICE_A / 2 + SLICE_A * (i + 1) / n;
    tri(P(0, 0, H), P(a0, R, H), P(a1, R, H), [0.5, 0.5], [0, 1], [1, 1]);
    tri(P(a0, R, 0), P(a1, R, 0), P(a1, R, H), [i / n, 0], [(i + 1) / n, 0], [(i + 1) / n, 1]);
    tri(P(a0, R, 0), P(a1, R, H), P(a0, R, H), [i / n, 0], [(i + 1) / n, 1], [i / n, 1]);
  }
  groups.push([start, pos.length / 3 - start, 1]); start = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const a0 = -SLICE_A / 2 + SLICE_A * i / n, a1 = -SLICE_A / 2 + SLICE_A * (i + 1) / n;
    tri(P(0, 0, 0), P(a1, R, 0), P(a0, R, 0), [0.5, 0.5], [1, 1], [0, 1]);
  }
  groups.push([start, pos.length / 3 - start, 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  for (const [s, c, m] of groups) g.addGroup(s, c, m);
  return g;
}
let _sliceGeo, _berryGeo, _rosetteGeo, _leafGeo;
function strawberryGeo() {
  const g = lathe([[0, 0], [0.0035, 0.0012], [0.0058, 0.0045], [0.0055, 0.0075], [0.0035, 0.0098], [0, 0.0102]], 14);
  return g;
}
function rosetteGeo() {
  const g = lathe([[0, 0], [0.0062, 0], [0.0068, 0.0025], [0.0048, 0.0055], [0.0022, 0.0078], [0, 0.0088]], 20), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.14 * Math.sin(a * 8 + p.getY(i) * 600); p.setX(i, x * k); p.setZ(i, z * k); }
  g.computeVertexNormals(); return g;
}

function plateGeo() {
  return lathe([[0, 0.0008], [0.016, 0.0008], [0.017, 0], [0.019, 0.0008], [0.022, 0.0026], [0.029, 0.0052], [0.0305, 0.006], [0.0298, 0.0066], [0.022, 0.0042], [0.016, 0.0028], [0, 0.0028]], 40);
}
function cupGeo() {
  const body = lathe([[0, 0.0008], [0.0072, 0.0008], [0.0076, 0], [0.0088, 0.0006], [0.011, 0.006], [0.0128, 0.013], [0.0134, 0.0175], [0.0128, 0.0178], [0.0122, 0.0135], [0.0105, 0.007], [0.0085, 0.0025], [0, 0.0025]], 32);
  const handle = taperTube(curve([[0.0118, 0.0145, 0], [0.0175, 0.0145, 0], [0.0188, 0.009, 0], [0.0165, 0.0045, 0], [0.0108, 0.0048, 0]]), () => [0.0016, 0.0013], { segs: 16, radial: 6, up: new THREE.Vector3(0, 0, 1) });
  return { body, handle };
}
function teapotGeo() {
  const body = lathe([[0, 0], [0.012, 0], [0.013, 0.0015], [0.021, 0.006], [0.026, 0.016], [0.025, 0.026], [0.019, 0.033], [0.012, 0.0355], [0.0115, 0.0345], [0, 0.0345]], 36);
  const lid = lathe([[0.0125, 0], [0.0125, 0.0015], [0.009, 0.0045], [0.003, 0.0058], [0.0028, 0.0075], [0.0045, 0.0085], [0.004, 0.0105], [0, 0.011]], 24);
  lid.translate(0, 0.034, 0);
  const spout = taperTube(curve([[0.019, 0.01, 0], [0.03, 0.013, 0], [0.037, 0.022, 0], [0.043, 0.032, 0]]), t => [0.0058 - 0.0028 * t, 0.0058 - 0.0028 * t], { segs: 14, radial: 10, cap: false });
  const handle = taperTube(curve([[-0.022, 0.027, 0], [-0.034, 0.029, 0], [-0.038, 0.017, 0], [-0.03, 0.007, 0], [-0.022, 0.008, 0]]), () => [0.0028, 0.0022], { segs: 18, radial: 8, up: new THREE.Vector3(0, 0, 1) });
  return { body, lid, spout, handle };
}
function spoonGeo() {
  // shallow bowl (double-sided shell) + flat handle that widens to a rounded end
  const bowl = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38); bowl.scale(0.0068, 0.0055, 0.009); bowl.translate(0, 0.0058, 0.012);
  const rim = new THREE.TorusGeometry(1, 0.06, 5, 24); rim.rotateX(Math.PI / 2); rim.scale(0.0068 * Math.sin(Math.PI * 0.62), 0.004, 0.009 * Math.sin(Math.PI * 0.62)); rim.translate(0, 0.0058 + 0.0055 * Math.cos(Math.PI * 0.62), 0.012);
  const handle = taperTube(curve([[0, 0.0032, 0.005], [0, 0.0038, -0.006], [0, 0.0052, -0.018], [0, 0.0058, -0.026]]), t => [0.0011 + 0.0019 * t * t, 0.0006], { segs: 14, radial: 8, up: new THREE.Vector3(0, 1, 0) });
  return merge([bowl, rim, handle]);
}
export function shoeGeo() {
  // centered on the doll foot node: foot ellipsoid ~ (0.0097, 0.0078, 0.0168)
  const rx = 0.0118, ry = 0.0098, rz = 0.0196;
  const shell = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < -0.72) y = -0.72 - (y + 0.72) * 0.12; p.setXYZ(i, x * rx, y * ry - 0.0005, z * rz + 0.0012); }
  shell.computeVertexNormals();
  const inner = shell.clone(); inner.scale(0.86, 0.86, 0.9); inner.translate(0, 0.0007, 0);
  // toe cap
  const toe = new THREE.SphereGeometry(1, 16, 8, Math.PI * 0.15, Math.PI * 0.7, 0, Math.PI * 0.42); toe.rotateY(-Math.PI * 0.0);
  const tp = toe.attributes.position; for (let i = 0; i < tp.count; i++) tp.setXYZ(i, tp.getX(i) * rx, tp.getY(i) * ry - 0.0005, tp.getZ(i) * rz + 0.0012);
  toe.computeVertexNormals();
  const yRim = Math.cos(Math.PI * 0.42) * ry - 0.0005, rimR = Math.sin(Math.PI * 0.42);
  const rim = new THREE.TorusGeometry(1, 0.075, 6, 40); rim.rotateX(Math.PI / 2);
  const rp = rim.attributes.position; for (let i = 0; i < rp.count; i++) rp.setXYZ(i, rp.getX(i) * rx * rimR, rp.getY(i) * 0.0012 / 0.075 + yRim, rp.getZ(i) * rz * rimR + 0.0012);
  rim.computeVertexNormals();
  const strap = taperTube(curve([[-rx * 0.95, yRim + 0.0004, -0.002], [0, yRim + 0.0042, 0.0005], [rx * 0.95, yRim + 0.0004, -0.002]]), () => [0.0016, 0.0007], { segs: 12, radial: 6, up: new THREE.Vector3(0, 0, 1) });
  const sole = lathe([[0, 0], [1, 0], [1, 0.12], [0, 0.12]], 28); sole.scale(rx * 1.02, 0.012, rz * 1.02); sole.translate(0, -ry * 0.72 - 0.0012, 0.0012);
  return { outer: merge([shell, toe, rim, strap]), inner, sole };
}
function wreathGeo() {
  const leaves = [], flowers = [], centers = [];
  for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2; leaves.push(xf(ell(0.0075, 0.0032, 0.0022, 8, 6), [Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0.002], [0, 0, a + 0.9])); }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2, cx = Math.cos(a) * 0.026, cy = Math.sin(a) * 0.026;
    for (let k = 0; k < 5; k++) { const b = k / 5 * Math.PI * 2; flowers.push(xf(ell(0.0042, 0.0026, 0.0014, 8, 6), [cx + Math.cos(b) * 0.004, cy + Math.sin(b) * 0.004, 0.005], [0, 0, b])); }
    centers.push(xf(new THREE.SphereGeometry(0.0022, 8, 6), [cx, cy, 0.0062]));
  }
  return { base: merge([xf(new THREE.TorusGeometry(0.026, 0.0042, 8, 40), [0, 0, 0]), ...leaves]), flowers: merge(flowers), centers: merge(centers) };
}
function bowBig(s) {
  const loop = side => taperTube(curve([[0, 0, 0], [side * 0.012, 0.008, 0.002], [side * 0.022, 0.004, 0], [side * 0.02, -0.006, 0], [side * 0.008, -0.004, 0.001], [0, 0, 0]].map(v => v.map(c => c * s))), t => [0.0055 * s * Math.sin(Math.PI * t) + 0.0015 * s, 0.0011 * s], { segs: 22, radial: 6, up: new THREE.Vector3(0, 0, 1) });
  const tail = side => taperTube(curve([[0, 0, 0], [side * 0.006, -0.012, 0.001], [side * 0.008, -0.022, 0.0], [side * 0.012, -0.03, 0.001]].map(v => v.map(c => c * s))), t => [0.0042 * s * (1 + 0.3 * t), 0.0009 * s], { segs: 12, radial: 6, up: new THREE.Vector3(0, 0, 1) });
  return merge([loop(1), loop(-1), tail(1), tail(-1), ell(0.0052 * s, 0.0046 * s, 0.004 * s, 12, 8)]);
}
function bouquetGeo() {
  const fl = [], ctr = [], lv = [];
  const spots = [[0, 0.034, 0.002], [-0.011, 0.028, 0.004], [0.011, 0.029, 0.003], [-0.005, 0.022, 0.008], [0.006, 0.02, 0.009]];
  for (const [x, y, z] of spots) { for (let k = 0; k < 6; k++) { const b = k / 6 * Math.PI * 2; fl.push(xf(ell(0.0042, 0.0028, 0.0016, 8, 6), [x + Math.cos(b) * 0.0042, y + Math.sin(b) * 0.0042, z], [0, 0, b])); } ctr.push(xf(new THREE.SphereGeometry(0.0024, 8, 6), [x, y, z + 0.0015])); }
  for (const [x, y, r] of [[-0.016, 0.02, 0.5], [0.017, 0.022, -0.5], [0.0, 0.012, 0]]) lv.push(xf(ell(0.003, 0.009, 0.0015, 8, 6), [x, y, -0.002], [0, 0, r]));
  const wrap = lathe([[0.0025, -0.02], [0.006, -0.012], [0.017, 0.016], [0.0165, 0.017], [0.0055, -0.011], [0.0018, -0.019]], 24, -Math.PI * 0.85, Math.PI * 1.7);
  return { fl: merge(fl), ctr: merge(ctr), lv: merge(lv), wrap };
}

// ---------------- Slot ----------------
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export class Slot {
  constructor(o) { Object.assign(this, { occupant: null, offset: new THREE.Vector3(), rot: new THREE.Quaternion(), upright: false }, o); }
  // world transform for an occupant
  world(pos, quat) {
    const n = this.node;
    n.updateWorldMatrix(true, false);
    n.matrixWorld.decompose(pos, quat, _s);
    if (this.upright) { // keep only yaw of owner
      const yaw = this.yawFrom ? this.yawFrom() : 0;
      quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    }
    pos.add(_p.copy(this.offset).applyQuaternion(quat));
    quat.multiply(this.rot);
    return pos;
  }
  accepts(item) { return !this.occupant && this.filter(item); }
}

// ---------------- Item ----------------
let _uid = 0;
export class Item {
  constructor(kind, opts = {}) {
    this.kind = kind; this.id = opts.id || (kind + (++_uid));
    this.root = new THREE.Group(); this.root.name = this.id;
    this.vis = new THREE.Group(); this.root.add(this.vis);
    this.pos = this.root.position; this.quat = this.root.quaternion;
    this.slot = null; this.held = false; this.heldBy = null;
    this.rest = { pos: new THREE.Vector3(), yaw: 0, flat: false, y: 0 };
    this.snapK = 1; this.snapFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.pickR = 0.022; this.pickY = 0.01; this.r = 0.02; this.h = 0.02;
    this.data = {}; this.slots = []; this.lastMoved = -99; this.hidden = false;
    this.handOffset = new THREE.Vector3(0, -0.004, 0.006); this.handRot = new THREE.Quaternion();
    this.tilt = 0;
  }
}

export function buildItems() {
  const items = [];
  const add = it => { items.push(it); return it; };
  if (!_sliceGeo) { _sliceGeo = sliceGeo(); _berryGeo = strawberryGeo(); _rosetteGeo = rosetteGeo(); _leafGeo = ell(0.0032, 0.0008, 0.002, 8, 4); }

  // cake slices
  for (let i = 0; i < 6; i++) {
    const it = add(new Item('slice', { id: 'slice' + i }));
    it.vis.add(mk(_sliceGeo, [M.section, M.creamTop, M.sponge]));
    const ro = mk(_rosetteGeo, M.creamTop); ro.position.set(0.006, CAKE.H, SLICE_R * 0.72 - SLICE_C); it.vis.add(ro);
    const be = mk(_berryGeo, M.berry); be.position.set(-0.004, CAKE.H + 0.0015, SLICE_R * 0.66 - SLICE_C); be.rotation.set(0.35, 0, 0.15); it.vis.add(be);
    const lf = mk(_leafGeo, M.berryLeaf, false); lf.position.set(-0.004, CAKE.H + 0.012, SLICE_R * 0.62 - SLICE_C); it.vis.add(lf);
    it.pickR = 0.024; it.pickY = 0.013; it.r = 0.024; it.h = CAKE.H; it.data = { bites: 0, home: i, food: true };
    it.handOffset.set(0, -0.016, 0.012); it.handRot.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, 1.9);
  }
  // plates
  for (let i = 0; i < 3; i++) {
    const it = add(new Item('plate', { id: 'plate' + i }));
    it.vis.add(mk(plateGeo(), M.plate));
    it.pickR = 0.03; it.pickY = 0.004; it.r = 0.031; it.h = 0.006;
    it.handOffset.set(0, -0.006, 0.018);
  }
  // cups
  const cg = cupGeo();
  for (let i = 0; i < 4; i++) {
    const it = add(new Item('cup', { id: 'cup' + i }));
    it.vis.add(mk(cg.body, M.cup)); it.vis.add(mk(cg.handle, M.ceramicWhite));
    const tea = new THREE.Mesh(new THREE.CircleGeometry(1, 28), M.tea); tea.rotation.x = -Math.PI / 2; tea.visible = false; it.vis.add(tea);
    it.tea = tea; it.data = { level: 0 };
    it.pickR = 0.02; it.pickY = 0.01; it.r = 0.016; it.h = 0.018;
    it.handOffset.set(-0.004, -0.012, 0.01); it.handRot.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI);
  }
  // spoons
  const sg = spoonGeo();
  for (let i = 0; i < 2; i++) {
    const it = add(new Item('spoon', { id: 'spoon' + i }));
    it.vis.add(mk(sg, M.silverDS));
    const bite = new THREE.Group(); bite.position.set(0, 0.004, 0.012);
    bite.add(mk(xf(ell(0.0045, 0.003, 0.0045, 10, 6), [0, 0, 0]), M.sponge)); bite.add(mk(xf(ell(0.0035, 0.0022, 0.0035, 10, 6), [0, 0.0024, 0]), M.creamTop));
    bite.visible = false; it.vis.add(bite); it.bite = bite; it.data = { loaded: false };
    it.pickR = 0.02; it.pickY = 0.004; it.r = 0.02; it.h = 0.006;
    it.handOffset.set(0, -0.006, 0.01);
  }
  // teapot
  {
    const g = teapotGeo(), it = add(new Item('pot', { id: 'pot' }));
    it.vis.add(mk(g.body, M.potBody)); it.vis.add(mk(g.lid, M.ceramicWhite)); it.vis.add(mk(g.spout, M.ceramicWhite)); it.vis.add(mk(g.handle, M.ceramicWhite));
    const knob = mk(new THREE.SphereGeometry(0.0035, 10, 8), M.pinkDeep); knob.position.y = 0.046; it.vis.add(knob);
    it.spout = new THREE.Object3D(); it.spout.position.set(0.044, 0.033, 0); it.vis.add(it.spout);
    it.pickR = 0.036; it.pickY = 0.018; it.r = 0.03; it.h = 0.045;
    it.handOffset.set(0, -0.022, 0.02); it.handRot.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -Math.PI / 2);
  }
  // decorations
  {
    const g = wreathGeo(), it = add(new Item('wreath', { id: 'wreath' }));
    it.vis.add(mk(g.base, M.leaf));
    it.vis.add(mk(g.flowers, new THREE.MeshPhysicalMaterial({ color: '#f9b7c8', roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') })));
    it.vis.add(mk(g.centers, new THREE.MeshPhysicalMaterial({ color: '#ffd86b', roughness: 0.5 })));
    const bw = mk(bowBig(0.8), M.satin); bw.position.set(0, -0.028, 0.004); it.vis.add(bw);
    it.pickR = 0.036; it.pickY = 0.0; it.r = 0.032; it.h = 0.008; it.data = { deco: true, hang: 0.03 };
  }
  {
    const it = add(new Item('ribbon', { id: 'ribbon' }));
    it.vis.add(mk(bowBig(1.55), M.satin));
    it.pickR = 0.03; it.pickY = 0.0; it.r = 0.028; it.h = 0.006; it.data = { deco: true, hang: 0.004 };
  }
  {
    const g = bouquetGeo(), it = add(new Item('bouquet', { id: 'bouquet' }));
    it.vis.add(mk(g.fl, new THREE.MeshPhysicalMaterial({ color: '#c9a7ee', roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#fff') })));
    it.vis.add(mk(g.ctr, new THREE.MeshPhysicalMaterial({ color: '#fff3a8', roughness: 0.5 })));
    it.vis.add(mk(g.lv, M.leaf));
    it.vis.add(mk(g.wrap, new THREE.MeshPhysicalMaterial({ color: '#fff4f6', roughness: 0.6, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color('#fff') })));
    const bw = mk(bowBig(0.6), M.satinRed); bw.position.set(0, -0.01, 0.01); it.vis.add(bw);
    it.pickR = 0.032; it.pickY = 0.01; it.r = 0.03; it.h = 0.008; it.data = { deco: true, hang: 0.02 };
    it.handOffset.set(0, 0.0, 0.012);
  }
  // shoes (pairs for each doll)
  const sgeo = shoeGeo();
  for (const did of ['mimi', 'koko', 'hana', 'rara']) {
    const col = SPECS[did].shoe;
    const outer = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
    const inner = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(col).multiplyScalar(0.55), roughness: 0.8, side: THREE.BackSide });
    const sole = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(col).lerp(new THREE.Color('#5a4030'), 0.5), roughness: 0.7 });
    for (const side of [0, 1]) {
      const it = add(new Item('shoe', { id: 'shoe_' + did + side }));
      it.vis.add(mk(sgeo.outer, outer)); it.vis.add(mk(sgeo.inner, inner, false)); it.vis.add(mk(sgeo.sole, sole));
      const btn = mk(new THREE.SphereGeometry(0.0017, 8, 6), M.gold, false); btn.position.set((side === 0 ? 1 : -1) * 0.0113, 0.0025, -0.0015); it.vis.add(btn);
      it.data = { side, owner: did }; it.pickR = 0.02; it.pickY = 0.006; it.r = 0.018; it.h = 0.012;
    }
  }
  // blanket (folded / spread)
  {
    const it = add(new Item('blanket', { id: 'blanket' }));
    const folded = mk(rbox(0.085, 0.016, 0.06, 0.006, 4), M.quilt); folded.position.y = 0.008; it.vis.add(folded);
    const fold2 = mk(rbox(0.087, 0.004, 0.062, 0.002, 2), M.quilt); fold2.position.y = 0.0105; fold2.visible = true; it.vis.add(fold2);
    it.folded = folded;
    it.pickR = 0.05; it.pickY = 0.008; it.r = 0.05; it.h = 0.016;
  }
  // gift box with cookies
  {
    const it = add(new Item('gift', { id: 'gift' }));
    const W = 0.048, Hh = 0.03, D = 0.04;
    const box = new THREE.Group(); it.vis.add(box);
    const walls = merge([xf(rbox(W, 0.003, D, 0.001), [0, 0.0015, 0]), xf(rbox(W, Hh, 0.003, 0.001), [0, Hh / 2, D / 2 - 0.0015]), xf(rbox(W, Hh, 0.003, 0.001), [0, Hh / 2, -D / 2 + 0.0015]), xf(rbox(0.003, Hh, D, 0.001), [W / 2 - 0.0015, Hh / 2, 0]), xf(rbox(0.003, Hh, D, 0.001), [-W / 2 + 0.0015, Hh / 2, 0])]);
    box.add(mk(walls, M.giftWrap)); box.add(mk(rbox(W - 0.006, 0.001, D - 0.006, 0.0004), M.boxInside));
    const lid = new THREE.Group(); lid.position.y = Hh; it.vis.add(lid);
    lid.add(mk(rbox(W + 0.003, 0.008, D + 0.003, 0.002), M.giftWrap));
    lid.add(mk(xf(rbox(0.007, 0.0085, D + 0.0035, 0.001), [0, 0, 0]), M.satin)); lid.add(mk(xf(rbox(W + 0.0035, 0.0085, 0.007, 0.001), [0, 0, 0]), M.satin));
    const bw = mk(bowBig(0.75), M.satin); bw.position.set(0, 0.006, 0); bw.rotation.x = -Math.PI / 2 + 0.6; lid.add(bw);
    it.lid = lid; it.data = { open: false };
    it.pickR = 0.036; it.pickY = 0.018; it.r = 0.032; it.h = 0.04;
    it.handOffset.set(0, -0.02, 0.026);
  }
  for (let i = 0; i < 4; i++) {
    const it = add(new Item('cookie', { id: 'cookie' + i }));
    it.vis.add(mk(disc(0.0095, 0.0045, 24, 0.35), M.cookie));
    if (i % 2 === 0) { const ic = mk(disc(0.0068, 0.0012, 20, 0.4), M.icing, false); ic.position.y = 0.0045; it.vis.add(ic); }
    it.pickR = 0.016; it.pickY = 0.003; it.r = 0.012; it.h = 0.005; it.data = { bites: 0, food: true, home: i };
    it.handOffset.set(0, -0.012, 0.01);
  }
  return items;
}

// whole-cake stand (fixed on the table)
export function cakeStand() {
  const g = new THREE.Group();
  g.add(mk(lathe([[0, 0], [0.026, 0], [0.028, 0.002], [0.012, 0.004], [0.008, 0.009], [0.008, 0.011], [0.05, 0.012], [0.052, 0.0135], [0.05, 0.015], [0, 0.015]], 40), M.ceramicWhite));
  return g;
}
