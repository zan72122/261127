// 人：実際の頭身の体・服のしわ・髪の束。いちばん大きく映る「手と腕」はとくに細かく作る。
import * as THREE from '../lib/three.module.min.js';
import { tex } from './tex.js';
import { merge, clamp, lerp, smooth, rng } from './util.js';

// ---------- 皮ふ・布の材質 ----------
export function skinMat(tone = 0xefc3a6) {
  const m = new THREE.MeshPhysicalMaterial({
    color: tone, roughness: 0.52, metalness: 0,
    map: tex('skin_col.jpg', { srgb: true }), normalMap: tex('skin_nrm.jpg'), normalScale: new THREE.Vector2(0.55, 0.55),
    sheen: 0.35, sheenColor: new THREE.Color(1.0, 0.55, 0.45), sheenRoughness: 0.6,
  });
  m.map.repeat.set(3, 3); m.normalMap.repeat.set(3, 3);
  // 皮ふの下で光が散る感じ：影側を少し赤く持ち上げる
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      { float nl=dot(normal, normalize((viewMatrix*vec4(${'0.52,0.74,0.42'.split(',').map((v, i) => (i === 0 ? '-' : '') + v).join(',')},0.)).xyz));
        outgoingLight += diffuseColor.rgb*vec3(0.55,0.16,0.10)*0.22*smoothstep(0.35,-0.25,nl); }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'skin';
  return m;
}
export function clothMat(kind, color, rep = 4, opts = {}) {
  const nm = { knit: 'knit_nrm.jpg', denim: 'denim_nrm.jpg', cotton: 'cotton_nrm.jpg' }[kind];
  const cm = { knit: 'knit_col.jpg', denim: 'denim_col.jpg', cotton: 'cotton_col.jpg' }[kind];
  const m = new THREE.MeshStandardMaterial({ color, roughness: kind === 'denim' ? 0.88 : 0.93, map: tex(cm, { srgb: true, rep: [rep, rep] }), normalMap: tex(nm, { rep: [rep, rep] }), normalScale: new THREE.Vector2(1, 1), side: opts.side || THREE.FrontSide });
  if (kind === 'knit' || kind === 'cotton') { m.sheen = 0; }
  return m;
}

// ---------- 管（指・腕・脚）：曲線に沿って太さが変わる ----------
export function tube(points, radiusFn, opts = {}) {
  const radial = opts.radial || 12, rings = opts.rings || 24;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const up = opts.up || new THREE.Vector3(0, 1, 0);
  const pos = [], uv = [], idx = [];
  const frames = [];
  let prevN = null;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const p = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    let N;
    if (prevN) { N = prevN.clone().sub(T.clone().multiplyScalar(prevN.dot(T))).normalize(); }
    else { N = up.clone().sub(T.clone().multiplyScalar(up.dot(T))); if (N.lengthSq() < 1e-6) N.set(1, 0, 0); N.normalize(); }
    prevN = N;
    const B = new THREE.Vector3().crossVectors(T, N).normalize();
    const r = radiusFn(t);
    frames.push({ p, T, N, B, r });
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ex = opts.ell ? opts.ell(t, a) : [1, 1];
      const v = p.clone().addScaledVector(N, Math.cos(a) * r * ex[1]).addScaledVector(B, Math.sin(a) * r * ex[0]);
      pos.push(v.x, v.y, v.z); uv.push(j / radial, t * (opts.vScale || 1));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.userData.frames = frames;
  return g;
}

// 毎フレーム形を変える管（腕・脚）
class LiveTube {
  constructor(material, radial, rings, radiusFn, ellFn) {
    this.radial = radial; this.rings = rings; this.rf = radiusFn; this.ell = ellFn;
    const n = (rings + 1) * (radial + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2); const idx = [];
    for (let i = 0; i <= rings; i++) for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; uv[k * 2] = j / radial; uv[k * 2 + 1] = i / rings * 3; }
    for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.mesh = new THREE.Mesh(g, material); this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
    this._N = new THREE.Vector3(); this._B = new THREE.Vector3(); this._T = new THREE.Vector3(); this._p = new THREE.Vector3();
  }
  // a: 付け根, b: 中間の関節, c: 先, side: 前向きベクトル
  update(a, b, c, front, bend) {
    // 関節を通るように：制御点を関節より外へ
    const ctrl = b.clone().multiplyScalar(2).sub(a.clone().add(c).multiplyScalar(0.5));
    this.c.v0.copy(a); this.c.v1.copy(ctrl); this.c.v2.copy(c);
    const R = this.radial, n = this.rings; const P = this.pos;
    let prevN = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.c.getPoint(t, this._p); this.c.getTangent(t, this._T).normalize();
      const T = this._T;
      let N = this._N;
      if (prevN) N.copy(prevN).addScaledVector(T, -prevN.dot(T)).normalize();
      else { N.copy(front).addScaledVector(T, -front.dot(T)); if (N.lengthSq() < 1e-8) N.set(0, 0, 1); N.normalize(); }
      prevN = N.clone();
      this._B.crossVectors(T, N).normalize();
      const r = this.rf(t, bend || 0);
      for (let j = 0; j <= R; j++) {
        const ang = (j / R) * Math.PI * 2; const e = this.ell ? this.ell(t, ang) : 1;
        const k = (i * (R + 1) + j) * 3;
        const cx = Math.cos(ang) * r * e, sx = Math.sin(ang) * r;
        P[k] = this._p.x + N.x * cx + this._B.x * sx; P[k + 1] = this._p.y + N.y * cx + this._B.y * sx; P[k + 2] = this._p.z + N.z * cx + this._B.z * sx;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }
}

// ---------- 手 ----------
// 手の座標：+X 指先の向き, +Y 手の甲, +Z 右（右手：親指は -Z 側）
const FINGERS = [
  // name, mcp, lens, r0, splay
  ['index', [0.092, 0.004, -0.029], [0.041, 0.025, 0.020], 0.0094, -0.06],
  ['middle', [0.096, 0.006, -0.008], [0.046, 0.028, 0.022], 0.0097, 0.0],
  ['ring', [0.091, 0.004, 0.012], [0.042, 0.026, 0.021], 0.0090, 0.07],
  ['pinky', [0.081, 0.0, 0.030], [0.033, 0.020, 0.018], 0.0079, 0.16],
];
const POSES = {
  grip: { index: [0.42, 0.5, 0.32], middle: [0.95, 1.05, 0.55], ring: [1.25, 1.35, 0.75], pinky: [1.35, 1.35, 0.8] },
  relax: { index: [0.25, 0.32, 0.2], middle: [0.32, 0.4, 0.25], ring: [0.38, 0.45, 0.3], pinky: [0.42, 0.5, 0.3] },
  open: { index: [0.05, 0.1, 0.05], middle: [0.05, 0.1, 0.05], ring: [0.08, 0.12, 0.06], pinky: [0.1, 0.12, 0.08] },
  point: { index: [0.0, 0.06, 0.04], middle: [1.3, 1.4, 0.8], ring: [1.4, 1.45, 0.8], pinky: [1.45, 1.45, 0.8] },
};

function palmGeo(det) {
  const g = new THREE.SphereGeometry(1, det ? 32 : 14, det ? 20 : 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const sg = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
    x = sg(x, 0.55); z = sg(z, 0.6); y = sg(y, 0.85);
    // 寸法：長さ 0.1, 幅 0.086, 厚み 0.03（大人）
    let X = 0.048 + x * 0.05, Y = y * 0.016, Z = z * 0.043;
    // 手首側を細く、指の付け根で甲が少し盛り上がる
    const tW = smooth((X + 0.004) / 0.05); Z *= 0.72 + 0.28 * tW;
    Y *= 0.8 + 0.25 * tW;
    if (Y > 0) Y += 0.0035 * Math.exp(-Math.pow((X - 0.088) / 0.008, 2)) * (0.6 + 0.4 * Math.cos(Z * 140));
    // 手のひら側：母指球のふくらみ
    if (Y < 0) Y -= 0.006 * Math.exp(-(Math.pow((X - 0.035) / 0.022, 2) + Math.pow((Z + 0.024) / 0.016, 2)));
    // 甲は少し丸く
    Y += -Math.pow(Z / 0.043, 2) * 0.004;
    p.setXYZ(i, X, Y, Z);
  }
  g.computeVertexNormals();
  return g;
}

function fingerChain(mcp, lens, flex, splay) {
  const pts = [new THREE.Vector3(...mcp).add(new THREE.Vector3(-0.012, 0.0, 0))];
  let p = new THREE.Vector3(...mcp); pts.push(p.clone());
  let ang = 0;
  const yaw = new THREE.Matrix4().makeRotationY(-splay);
  for (let k = 0; k < 3; k++) {
    ang += flex[k];
    const d = new THREE.Vector3(Math.cos(ang), -Math.sin(ang), 0).applyMatrix4(yaw);
    p = p.clone().addScaledVector(d, lens[k]); pts.push(p.clone());
  }
  return pts;
}

function fingerTubeGeo(pts, r0, det, lensTotal) {
  // 関節のふくらみ・指先の丸み
  const L = []; let acc = 0; for (let i = 1; i < pts.length; i++) { acc += pts[i].distanceTo(pts[i - 1]); L.push(acc); }
  const total = acc;
  const jointT = L.slice(0, -1).map((v) => v / total);
  const rf = (t) => {
    let r = r0 * (1 - 0.22 * t);
    for (const jt of jointT.slice(1)) r *= 1 + 0.07 * Math.exp(-Math.pow((t - jt) / 0.04, 2));
    const capS = 1 - (r0 * 0.9) / total;
    if (t > capS) r *= Math.sqrt(Math.max(0, 1 - Math.pow((t - capS) / (1 - capS), 2)));
    return Math.max(r, 0.00001);
  };
  const g = tube(pts, rf, { radial: det ? 14 : 8, rings: det ? 34 : 14, ell: (t, a) => [1.08, 0.9 + 0.08 * Math.max(0, -Math.cos(a))], up: new THREE.Vector3(0, 1, 0) });
  return g;
}

function nailGeo(frames, r0, startT, det) {
  // 爪：指先の甲側だけを覆う薄い板
  const pos = [], idx = [], uv = [];
  const n = frames.length; const i0 = Math.floor(startT * (n - 1)), i1 = Math.floor(0.965 * (n - 1));
  const cols = det ? 7 : 4;
  for (let i = i0; i <= i1; i++) {
    const f = frames[i];
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols - 0.5) * 1.6;
      const rr = f.r * 1.035 + 0.0003;
      const v = f.p.clone().addScaledVector(f.N, Math.cos(a) * rr * 0.92).addScaledVector(f.B, Math.sin(a) * rr * 1.08);
      pos.push(v.x, v.y, v.z); uv.push(j / cols, (i - i0) / (i1 - i0));
    }
  }
  const rows = i1 - i0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildHand(opts = {}) {
  const det = opts.detail !== false;
  const pose = POSES[opts.pose || 'relax'];
  const left = !!opts.left;
  const skin = [], nails = [];
  skin.push(palmGeo(det));
  const tips = {};
  for (const [name, mcp, lens, r0, splay] of FINGERS) {
    const pts = fingerChain(mcp, lens, pose[name], splay);
    const g = fingerTubeGeo(pts, r0, det);
    skin.push(g);
    nails.push(nailGeo(g.userData.frames, r0, 0.80, det));
    tips[name] = pts[pts.length - 1].clone();
    tips[name + 'Pad'] = pts[pts.length - 1].clone().add(new THREE.Vector3(-0.006, -0.008, 0));
  }
  // 親指
  let thumbTip;
  if (opts.pose === 'grip') thumbTip = tips.indexPad.clone().add(new THREE.Vector3(-0.024, -0.016, -0.018));
  else if (opts.pose === 'point') thumbTip = new THREE.Vector3(0.075, -0.018, -0.012);
  else if (opts.pose === 'open') thumbTip = new THREE.Vector3(0.07, -0.004, -0.085);
  else thumbTip = new THREE.Vector3(0.088, -0.022, -0.05);
  const c0 = new THREE.Vector3(0.016, -0.008, -0.022);
  const tp = [c0.clone().add(new THREE.Vector3(-0.01, 0.002, 0.004)), c0,
    c0.clone().lerp(thumbTip, 0.4).add(new THREE.Vector3(0, -0.004, -0.024)),
    c0.clone().lerp(thumbTip, 0.72).add(new THREE.Vector3(0, -0.002, -0.014)), thumbTip];
  const tg = tube(tp, (t) => { let r = 0.0125 * (1 - 0.25 * t); if (t > 0.9) r *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.9) / 0.1, 2))); return Math.max(r, 0.00001); }, { radial: det ? 14 : 8, rings: det ? 30 : 12, ell: () => [1.1, 0.88], up: new THREE.Vector3(0, 0.3, -1).normalize() });
  skin.push(tg);
  nails.push(nailGeo(tg.userData.frames, 0.012, 0.84, det));
  // 手首
  const wr = tube([new THREE.Vector3(-0.07, 0.004, 0), new THREE.Vector3(-0.03, 0.002, 0), new THREE.Vector3(0.012, 0, 0)], (t) => 0.024 + 0.006 * t, { radial: det ? 16 : 10, rings: 6, ell: () => [1.35, 0.85] });
  skin.push(wr);
  let sg = merge(skin), ng = merge(nails);
  const s = opts.scale || 1;
  sg.scale(s, s, left ? -s : s); ng.scale(s, s, left ? -s : s);
  if (left) { flipWinding(sg); flipWinding(ng); }
  sg.computeVertexNormals(); ng.computeVertexNormals();
  const grip = tips.indexPad.clone().lerp(thumbTip, 0.5).add(new THREE.Vector3(0.0, -0.006, 0)).multiplyScalar(s);
  if (left) grip.z *= -1;
  return { skin: sg, nails: ng, grip };
}
function flipWinding(g) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }

export const nailMat = () => new THREE.MeshPhysicalMaterial({ color: 0xf4d2c8, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2, sheen: 0.2 });

// ---------- チョーク（棒） ----------
export function chalkStick(color) {
  const L = 0.075, r = 0.0085;
  const g = new THREE.CylinderGeometry(r, r, L, 18, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
    // 先が使われて丸くすり減る
    if (y < -L * 0.32) { const k = (-L * 0.32 - y) / (L * 0.18); const sh = Math.max(0.35, 1 - k * k * 0.6); p.setX(i, x * sh); p.setZ(i, z * sh); }
    const n = Math.sin(y * 300 + x * 900) * 0.0002; p.setX(i, p.getX(i) + n); p.setZ(i, p.getZ(i) + n);
  }
  g.computeVertexNormals();
  g.translate(0, -L / 2, 0); // 上端が原点、-Y に伸びる
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, normalMap: tex('chalk_nrm.jpg'), normalScale: new THREE.Vector2(1.4, 1.4) });
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true;
  mesh.userData.len = L;
  return mesh;
}

// ---------- 画面に大きく映る手（女の子・パパ） ----------
export class HandRig {
  constructor(opts) {
    this.root = new THREE.Group();
    this.s = opts.scale;
    const h = buildHand({ pose: 'grip', scale: opts.scale, detail: true });
    this.skinM = skinMat(opts.tone);
    const hand = new THREE.Mesh(h.skin, this.skinM); hand.castShadow = true; hand.receiveShadow = true;
    const nails = new THREE.Mesh(h.nails, nailMat()); nails.castShadow = false;
    this.handG = new THREE.Group(); this.handG.add(hand, nails); this.root.add(this.handG);
    // 前腕と袖（袖口のしわ）
    const s = opts.scale;
    const arm = tube([new THREE.Vector3(-0.06 * s, 0.003 * s, 0), new THREE.Vector3(-0.2 * s, 0.05 * s, 0), new THREE.Vector3(-0.42 * s, 0.13 * s, 0)], (t) => (0.027 + 0.012 * t) * s, { radial: 16, rings: 12, ell: () => [1.3, 0.9] });
    const armM = new THREE.Mesh(arm, this.skinM); armM.castShadow = true; this.root.add(armM);
    const sleeveM = opts.sleeve;
    const sl = tube([new THREE.Vector3(-0.085 * s, 0.006 * s, 0), new THREE.Vector3(-0.3 * s, 0.09 * s, 0), new THREE.Vector3(-0.9 * s, 0.33 * s, 0)], (t) => {
      let r = (0.036 + 0.02 * t) * s;
      r *= 1 + 0.07 * Math.sin(t * 46) * Math.exp(-t * 3) + 0.04 * Math.sin(t * 23 + 1);
      if (t < 0.03) r *= 0.92 + t * 2.6;
      return r;
    }, { radial: 22, rings: 40, ell: (t, a) => [1.22 + 0.04 * Math.sin(a * 3 + t * 9), 0.95] , vScale: 3 });
    this.sleeve = new THREE.Mesh(sl, sleeveM); this.sleeve.castShadow = true; this.sleeve.receiveShadow = true; this.root.add(this.sleeve);
    if (opts.button) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0055 * s, 0.0055 * s, 0.002 * s, 14), new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.3 }));
      b.rotation.x = Math.PI / 2; b.position.set(-0.1 * s, 0.012 * s, -0.035 * s); this.root.add(b);
    }
    // チョーク
    this.chalk = chalkStick(opts.chalkColor || 0xffffff);
    const dir = new THREE.Vector3(0.38, -1, 0.06).normalize();
    this.chalk.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    this.chalk.position.copy(h.grip).addScaledVector(dir, -0.018);
    this.root.add(this.chalk);
    this.tipLocal = this.chalk.position.clone().addScaledVector(dir, this.chalk.userData.len);
    this.root.visible = false;
    this.pos = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.first = true;
    this.lift = 0.05; this.wob = 0;
  }
  setChalkColor(c) { this.chalk.material.color.copy(c); }
  // P: チョークの先を置く点, N: 面の向き, cam: カメラ位置
  place(P, N, cam, dt, down, speed) {
    const F = new THREE.Vector3().subVectors(P, cam); F.addScaledVector(N, -F.dot(N));
    if (F.lengthSq() < 1e-4) F.set(0, 1, 0).addScaledVector(N, -N.y);
    F.normalize();
    // 少し右手側から差し出す
    const Z = new THREE.Vector3().crossVectors(F, N).normalize();
    const Fr = F.clone().applyAxisAngle(N, 0.28);
    const X = Fr, Y = N.clone(), Zb = new THREE.Vector3().crossVectors(X, Y).normalize();
    const m = new THREE.Matrix4().makeBasis(X, Y, Zb);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    // 塗っている時は手首が少し揺れる
    this.wob += dt * (6 + speed * 30);
    const wq = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(this.wob) * 0.05 * Math.min(1, speed * 3), 0, Math.sin(this.wob * 0.7) * 0.04 * Math.min(1, speed * 3)));
    q.multiply(wq);
    this.lift += ((down ? 0 : 0.045) - this.lift) * (1 - Math.exp(-dt * 14));
    const target = P.clone().addScaledVector(N, this.lift).sub(this.tipLocal.clone().applyQuaternion(q));
    if (this.first) { this.pos.copy(target); this.q.copy(q); this.first = false; }
    const k = 1 - Math.exp(-dt * 22);
    this.pos.lerp(target, k); this.q.slerp(q, 1 - Math.exp(-dt * 10));
    this.root.position.copy(this.pos); this.root.quaternion.copy(this.q);
  }
}

// ---------- 全身 ----------
const DEF = {
  girl: { H: 1.1, hip: 0.55, shY: 0.315, shW: 0.115, upper: 0.17, fore: 0.15, thigh: 0.255, shin: 0.245, ankle: 0.055, headR: 0.088, neck: 0.05, handS: 0.62, footL: 0.16, tone: 0xf1c7ab },
  papa: { H: 1.76, hip: 0.92, shY: 0.53, shW: 0.195, upper: 0.30, fore: 0.27, thigh: 0.44, shin: 0.43, ankle: 0.08, headR: 0.112, neck: 0.085, handS: 1.0, footL: 0.27, tone: 0xdcae8e },
};

function lathe(profile, seg, fold) {
  // profile: [[y, rx, rz, zoff]]
  const pos = [], uv = [], idx = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const [y, rx, rz, zo] = profile[i];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      let k = 1; if (fold) k = fold(i / (n - 1), a);
      pos.push(Math.sin(a) * rx * k, y, Math.cos(a) * rz * k + (zo || 0)); uv.push(j / seg * 3, i / (n - 1) * 2);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export class Human {
  constructor(kind) {
    const D = DEF[kind]; this.D = D; this.kind = kind;
    const R = rng(kind === 'girl' ? 3 : 4);
    this.root = new THREE.Group();
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    this.chest = new THREE.Group(); this.chest.position.y = D.shY * 0.35; this.pelvis.add(this.chest);
    this.neck = new THREE.Group(); this.neck.position.y = D.shY * 0.65 + 0.01; this.chest.add(this.neck);
    this.head = new THREE.Group(); this.head.position.y = D.neck; this.neck.add(this.head);
    const skin = skinMat(D.tone);
    this.skin = skin;
    const s = D.H / 1.1;
    let top, bottom, sleeveM, legM, sockM, shoeM;
    if (kind === 'girl') {
      top = clothMat('knit', 0xe2c25e, 5); // 春のカーディガン（からし色）
      bottom = clothMat('cotton', 0xf2efe4, 6, { side: THREE.DoubleSide }); // 生成りのワンピース
      sleeveM = top; legM = skin; sockM = clothMat('cotton', 0xfbfbf8, 8); shoeM = clothMat('cotton', 0x6f8db8, 6);
    } else {
      top = clothMat('cotton', 0x8fa7bf, 6); // シャンブレーのシャツ
      bottom = new THREE.MeshStandardMaterial({ map: tex('denim_col.jpg', { srgb: true, rep: [5, 5] }), normalMap: tex('denim_nrm.jpg', { rep: [5, 5] }), roughness: 0.9, color: 0xffffff });
      sleeveM = top; legM = bottom; sockM = bottom; shoeM = clothMat('cotton', 0x4a4a4c, 6);
    }
    this.top = top;
    // --- 胴（服） ---
    const sh = D.shY, w = D.shW;
    let tp;
    if (kind === 'girl') {
      tp = [[-0.045, 0.092, 0.074], [-0.01, 0.088, 0.069], [0.05, 0.082, 0.064], [0.12, 0.081, 0.063], [0.18, 0.087, 0.067], [0.23, 0.094, 0.07], [0.27, 0.10, 0.069], [0.295, 0.103, 0.065], [0.315, 0.094, 0.059], [0.33, 0.074, 0.051], [0.342, 0.052, 0.042], [0.352, 0.036, 0.034]];
    } else {
      tp = [[-0.06, 0.15, 0.11], [0.05, 0.145, 0.105], [0.15, 0.142, 0.105], [0.27, 0.155, 0.112], [0.38, 0.17, 0.118], [0.46, 0.185, 0.115], [0.51, 0.19, 0.105], [0.535, 0.16, 0.09], [0.555, 0.10, 0.075], [0.575, 0.055, 0.05]];
    }
    const torsoG = lathe(tp.map(([y, a, b]) => [y, a, b, 0]), 28, (t, a) => 1 + 0.018 * Math.sin(a * 7 + t * 5) * (1 - t));
    const torso = new THREE.Mesh(torsoG, top); torso.castShadow = torso.receiveShadow = true;
    torso.position.y = -D.shY * 0.35; this.chest.add(torso);
    // 下半身：ワンピースのスカート／ジーンズの腰
    if (kind === 'girl') {
      const sk = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; const y = 0.1 - t * 0.31; const r = 0.08 + t * t * 0.07 + t * 0.03; sk.push([y, r, r * 0.86, 0.004 * t]); }
      this.skirtBase = sk;
      const skG = lathe(sk, 48, (t, a) => 1 + (0.03 + 0.09 * t) * Math.pow(Math.max(0, Math.sin(a * 9 + Math.sin(a * 3) * 1.2)), 2) - 0.03 * t);
      this.skirt = new THREE.Mesh(skG, bottom); this.skirt.castShadow = this.skirt.receiveShadow = true;
      this.pelvis.add(this.skirt);
      // 胸元（ワンピースの襟）
      const col = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 24), bottom); col.rotation.x = Math.PI / 2; col.position.y = D.shY * 0.65 - 0.01; col.scale.set(1, 0.85, 1); this.chest.add(col);
    } else {
      const hp = lathe([[-0.12, 0.15, 0.11], [-0.04, 0.152, 0.112], [0.02, 0.15, 0.11], [0.04, 0.142, 0.106]], 28);
      const hips = new THREE.Mesh(hp, bottom); hips.castShadow = true; this.pelvis.add(hips);
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.146, 0.012, 6, 32), new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.55 }));
      belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.74, 1); belt.position.y = 0.03; this.pelvis.add(belt);
    }
    // --- 首・頭 ---
    const neckG = lathe([[-0.02, D.neck * 0.5, D.neck * 0.48], [D.neck * 0.6, D.neck * 0.45, D.neck * 0.44], [D.neck + 0.02, D.neck * 0.44, D.neck * 0.45]], 16);
    const neckM = new THREE.Mesh(neckG, skin); neckM.castShadow = true; this.neck.add(neckM);
    const hr = D.headR;
    const headG = new THREE.SphereGeometry(1, 40, 28);
    const hp2 = headG.attributes.position;
    for (let i = 0; i < hp2.count; i++) {
      let x = hp2.getX(i), y = hp2.getY(i), z = hp2.getZ(i);
      // 頭蓋：後ろが丸く、顔の下半分がすぼまる
      const jaw = smooth((-y + 0.1) / 0.9);
      x *= 0.86 - 0.18 * jaw; z *= 0.98 - 0.1 * jaw + (z < 0 ? 0.06 : 0);
      if (z > 0.6 && y < 0.25 && y > -0.35) z += 0.06 * Math.exp(-Math.pow(x / 0.12, 2)) * Math.exp(-Math.pow((y + 0.08) / 0.12, 2)); // 鼻
      if (z > 0.4 && y > -0.6 && y < -0.1) z += 0.025 * Math.exp(-Math.pow((Math.abs(x) - 0.38) / 0.18, 2)); // ほお
      y *= kind === 'girl' ? 1.04 : 1.12;
      hp2.setXYZ(i, x * hr, y * hr, z * hr);
    }
    headG.computeVertexNormals();
    const headM = new THREE.Mesh(headG, skin); headM.castShadow = true; headM.position.y = hr * 1.0; this.head.add(headM);
    for (const sx of [-1, 1]) {
      const ear = new THREE.SphereGeometry(hr * 0.2, 12, 8); ear.scale(0.4, 1, 0.75);
      const e = new THREE.Mesh(ear, skin); e.position.set(sx * hr * 0.86, hr * 0.92, -hr * 0.05); e.rotation.y = sx * 0.3; this.head.add(e);
    }
    // 髪：頭皮の帽子＋髪の束（アルファの短冊）
    const hairT = tex('hair.png', { srgb: true, clamp: true });
    const hairCol = kind === 'girl' ? new THREE.Color(0.30, 0.22, 0.17) : new THREE.Color(0.22, 0.18, 0.15);
    const hairCap = new THREE.MeshStandardMaterial({ color: hairCol.clone().multiplyScalar(0.7), roughness: 0.7, normalMap: tex('knit_nrm.jpg', { rep: [14, 2] }), normalScale: new THREE.Vector2(0.4, 0.4) });
    const capG = new THREE.SphereGeometry(hr * 1.045, 32, 20, 0, Math.PI * 2, 0, Math.PI * (kind === 'girl' ? 0.62 : 0.5));
    const cp = capG.attributes.position;
    for (let i = 0; i < cp.count; i++) { const z = cp.getZ(i), y = cp.getY(i); if (z > 0 && y < hr * 0.5) { cp.setY(i, y + (hr * 0.5 - y) * 0.5 * smooth(z / hr)); } cp.setX(i, cp.getX(i) * (0.88)); }
    capG.computeVertexNormals();
    const cap = new THREE.Mesh(capG, hairCap); cap.position.y = hr * 1.02; cap.rotation.x = -0.25; cap.castShadow = true; this.head.add(cap);
    if (kind === 'girl') {
      // ボブの髪：頭の形に沿って下がり、毛先は不ぞろい。縦の毛流れの法線。
      const hm = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.13, 0.085, 0.06), map: tex('hairflow_col.jpg', { srgb: true, rep: [5, 1] }), normalMap: tex('hairflow_nrm.jpg', { rep: [5, 1] }), normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.62, side: THREE.DoubleSide });
      const NT = 56, NP = 26, pos = [], uv = [], idx = [];
      const cy = hr * 1.02;
      for (let i = 0; i <= NT; i++) {
        const th = (i / NT) * Math.PI * 2; // 0 = 顔の正面(+Z)
        const front = Math.pow(Math.max(0, Math.cos(th)), 3);
        const fmax = 1 - front * 0.62 + (R() - 0.5) * 0.08;
        for (let j = 0; j <= NP; j++) {
          const v = (j / NP) * fmax; // 0..1 頭頂→毛先
          let x, y, z;
          const phi = Math.min(v, 0.5) / 0.5 * (Math.PI / 2) * 1.02;
          const rx = hr * 0.98, rz = hr * 1.1, ry = hr * 1.16;
          x = Math.sin(phi) * Math.sin(th) * rx; z = Math.sin(phi) * Math.cos(th) * rz - hr * 0.04; y = cy + Math.cos(phi) * ry;
          if (v > 0.5) {
            const h = (v - 0.5) / 0.5; // 下がる部分
            const out = 1 + 0.08 * Math.sin(h * Math.PI) - 0.1 * h * h * h;
            x *= out; z = (z + hr * 0.04) * out - hr * 0.04 - h * hr * 0.05;
            y = cy - h * hr * 0.95;
          }
          pos.push(x, y, z); uv.push((i / NT) * 1, 1 - v);
        }
      }
      for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j, b = a + NP + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const hairM = new THREE.Mesh(g, hm); hairM.castShadow = true; this.head.add(hairM);
      cap.visible = false;
      // 毛先の細い束（アルファ）
      const strands = [];
      for (let i = 0; i < 40; i++) {
        const th = Math.PI * (0.35 + 1.3 * (i / 40)) + (R() - 0.5) * 0.08;
        const r0 = hr * 1.06, y0 = cy - hr * 0.3, L = hr * (0.6 + R() * 0.25), w0 = hr * 0.22;
        const pp = [], uu = [], ii = [];
        for (let k = 0; k <= 4; k++) {
          const t = k / 4; const rr = r0 * (1 + 0.05 * Math.sin(t * Math.PI)) * (1 - 0.08 * t * t);
          const cx = Math.sin(th) * rr, cz = Math.cos(th) * rr * 1.08 - hr * 0.05, yy = y0 - t * L;
          const sx = Math.cos(th) * w0 / 2, sz = -Math.sin(th) * w0 / 2;
          pp.push(cx - sx, yy, cz - sz, cx + sx, yy, cz + sz); uu.push(0, 1 - t * 0.9, 1, 1 - t * 0.9);
        }
        for (let k = 0; k < 4; k++) { const q = k * 2; ii.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uu, 2)); sg.setIndex(ii); sg.computeVertexNormals();
        strands.push(sg);
      }
      const sm = new THREE.MeshStandardMaterial({ map: hairT, color: new THREE.Color(0.7, 0.55, 0.45), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 });
      const hs = new THREE.Mesh(merge(strands), sm); hs.castShadow = true; this.head.add(hs);
    } else {
      hairCap.map = tex('hairflow_col.jpg', { srgb: true, rep: [6, 1] }); hairCap.normalMap = tex('hairflow_nrm.jpg', { rep: [6, 1] }); hairCap.color = hairCol.clone(); hairCap.roughness = 0.7;
    }
    // --- 帽子（麦わら）：最初はベンチの上 ---
    if (kind === 'girl') this.hatAnchor = new THREE.Vector3(0, hr * 1.78, -hr * 0.05);
    // --- 腕・脚（毎フレーム曲げる管） ---
    const mkJ = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
    this.arms = [];
    for (const sd of [-1, 1]) {
      const shJ = mkJ(this.chest, sd * (w - 0.012 * s), D.shY * 0.65 - 0.04 * s, -0.005);
      const elJ = mkJ(shJ, 0, -D.upper, 0);
      const wrJ = mkJ(elJ, 0, -D.fore, 0);
      const rUp = (kind === 'girl' ? 0.037 : 0.055);
      const sleeve = new LiveTube(sleeveM, 14, 26, (t, bend) => {
        let r = rUp * (1 - 0.32 * t);
        r *= 1 + bend * 0.12 * Math.exp(-Math.pow((t - 0.52) / 0.08, 2)) * (0.6 + 0.4 * Math.sin(t * 60));
        r *= 1 + 0.035 * Math.sin(t * 31 + sd);
        if (t > 0.94) r *= 1.04;
        return r;
      }, (t, a) => 1 + 0.05 * Math.sin(a * 2));
      this.root.add(sleeve.mesh);
      // 体は +Z を向く：sd=+1 は左腕
      const hand = buildHand({ pose: 'relax', scale: D.handS, detail: false, left: sd > 0 });
      const hg = new THREE.Group();
      const hm = new THREE.Mesh(hand.skin, skin); hm.castShadow = true; const nm = new THREE.Mesh(hand.nails, nailMat());
      hg.add(hm, nm);
      // 手の向き：指が下、甲が外、親指が前
      const basis = sd > 0 ? [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)] : [new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1)];
      hg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...basis));
      hg.position.y = 0.012;
      wrJ.add(hg);
      this.arms.push({ sd, shJ, elJ, wrJ, sleeve, hand: hg, ang: { p: 0, r: 0, y: 0, e: 0.2 } });
    }
    this.legs = [];
    for (const sd of [-1, 1]) {
      const hipJ = mkJ(this.pelvis, sd * (kind === 'girl' ? 0.048 : 0.085), -0.03, 0);
      const knJ = mkJ(hipJ, 0, -D.thigh, 0);
      const anJ = mkJ(knJ, 0, -D.shin, 0);
      const rl = kind === 'girl' ? 0.045 : 0.075;
      const leg = new LiveTube(legM, 14, 22, (t, bend) => {
        let r;
        if (kind === 'girl') { r = rl * (1 - 0.45 * t) * (1 + 0.12 * Math.exp(-Math.pow((t - 0.68) / 0.12, 2))); }
        else { r = rl * (1 - 0.3 * t) * (1 + 0.05 * Math.sin(t * 40) * Math.exp(-Math.pow((t - 0.5) / 0.1, 2)) * (0.5 + bend)); if (t > 0.92) r *= 1.08; }
        return r;
      }, null);
      this.root.add(leg.mesh);
      let sock = null;
      if (kind === 'girl') {
        sock = new LiveTube(sockM, 12, 6, (t) => 0.026 * (1 - 0.15 * t) + 0.002, null);
        this.root.add(sock.mesh);
      }
      // 靴
      const shoe = this.shoe(D, shoeM);
      anJ.add(shoe);
      this.legs.push({ sd, hipJ, knJ, anJ, leg, sock, shoe, ang: { p: 0, k: 0, r: 0 } });
    }
    this.t = 0; this.state = 'idle'; this.stateT = 0; this.jump = 0;
    this.pose = { bend: 0, twist: 0, headTilt: 0, headNod: 0, crouch: 0 };
    this.target = null; // 体を向ける先
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  shoe(D, mat) {
    const L = D.footL, Wd = L * 0.38, Hh = L * 0.3;
    const g = new THREE.SphereGeometry(1, 24, 14);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      y = Math.max(y, -0.55);
      const toe = smooth((z + 0.2) / 1.0);
      const X = x * Wd * 0.5 * (0.85 + 0.15 * toe), Y = (y + 0.55) * Hh * 0.62 * (1 - 0.35 * toe), Z = z * L * 0.5 + L * 0.28;
      p.setXYZ(i, X, Y - D.ankle * 0.9, Z);
    }
    g.computeVertexNormals();
    const sole = new THREE.CylinderGeometry(1, 1, 1, 24); sole.scale(Wd * 0.53, L * 0.09, L * 0.53); sole.translate(0, -D.ankle * 0.9 + L * 0.03, L * 0.28);
    const grp = new THREE.Group();
    const a = new THREE.Mesh(g, mat); const b = new THREE.Mesh(sole, new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.75 }));
    a.castShadow = b.castShadow = true; grp.add(a, b);
    return grp;
  }
  // 腕の角度 p:前後, r:横へ, e:ひじ
  setArm(i, p, r, e, y = 0) { const A = this.arms[i].ang; A.p = p; A.r = r; A.e = e; A.y = y; }
  setLeg(i, p, k) { const L = this.legs[i].ang; L.p = p; L.k = k; }
  play(state) { if (this.state !== state) { this.state = state; this.stateT = 0; } }
  update(dt) {
    this.t += dt; this.stateT += dt; const t = this.t, st = this.stateT; const D = this.D;
    // 既定：立ち・呼吸・重心移動
    let bend = 0.02 + Math.sin(t * 1.6) * 0.01, crouch = 0, jump = 0, tilt = Math.sin(t * 0.7) * 0.03, nod = 0.05, sway = Math.sin(t * 0.8) * 0.02;
    let arm = [[0.06, 0.1, 0.25], [0.06, 0.1, 0.25]], leg = [[0, 0], [0, 0]];
    const S = this.state;
    if (S === 'hop') {
      const c = (st % 0.62) / 0.62;
      const air = Math.max(0, Math.sin(c * Math.PI * 2 - 0.6));
      jump = air * (this.kind === 'girl' ? 0.12 : 0.05);
      crouch = Math.max(0, -Math.sin(c * Math.PI * 2 - 0.6)) * 0.35;
      arm = [[-2.4 + air * 0.3, 0.5, 0.3], [-2.4 + air * 0.3, 0.5, 0.3]];
      nod = -0.15;
    } else if (S === 'clap') {
      const c = Math.sin(st * 13);
      arm = [[-1.05, -0.25 + c * 0.17, 1.0], [-1.05, -0.25 + c * 0.17, 1.0]];
      jump = Math.max(0, Math.sin(st * 6.5)) * (this.kind === 'girl' ? 0.04 : 0.0);
      nod = -0.08;
    } else if (S === 'tilt') { // あれ？
      tilt = 0.32 * smooth(st / 0.4); nod = 0.1;
      arm = [[0.1, 0.1, 0.25], [-1.3, 0.25, 2.2]];
    } else if (S === 'scratch') { // 頭をかく
      tilt = 0.18; nod = 0.15;
      arm = [[0.1, 0.1, 0.2], [-2.35, 0.55, 2.05 + Math.sin(st * 14) * 0.15]];
    } else if (S === 'point') {
      arm = [[0.06, 0.1, 0.25], [-1.35, 0.05, 0.1]]; nod = 0.25;
    } else if (S === 'look') { // 下を見る
      nod = 0.55; bend = 0.25; crouch = 0.25; arm = [[-0.2, 0.15, 0.6], [-0.2, 0.15, 0.6]];
    } else if (S === 'sit') {
      leg = [[-1.5, 1.5], [-1.45, 1.55]]; bend = -0.05; arm = [[-0.35, 0.12, 0.9], [-0.35, 0.12, 0.9]];
    } else if (S === 'sitClap') {
      leg = [[-1.5, 1.5], [-1.45, 1.55]]; const c = Math.sin(st * 13); arm = [[-1.0, -0.25 + c * 0.17, 1.0], [-1.0, -0.25 + c * 0.17, 1.0]]; nod = -0.05;
    } else if (S === 'sitTilt') {
      leg = [[-1.5, 1.5], [-1.45, 1.55]]; tilt = 0.3 * smooth(st / 0.4); arm = [[-0.35, 0.12, 0.9], [-1.25, 0.25, 2.2]];
    } else if (S === 'wave') {
      arm = [[0.06, 0.1, 0.25], [-2.6, 0.3, 0.4 + Math.sin(st * 9) * 0.35]];
    } else if (S === 'reach') {
      bend = 0.5; crouch = 0.4; nod = 0.5; arm = [[-0.3, 0.2, 0.4], [-1.2, -0.1, 0.25]];
    }
    // 腕と脚へ（なめらかに）
    const k = 1 - Math.exp(-dt * 12);
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i].ang; A.p += (arm[i][0] - A.p) * k; A.r += (arm[i][1] - A.r) * k; A.e += (arm[i][2] - A.e) * k;
      const L = this.legs[i].ang; L.p += (leg[i][0] - L.p) * k; L.k += (leg[i][1] - L.k) * k;
    }
    this.pose.bend += (bend - this.pose.bend) * k; this.pose.headTilt += (tilt - this.pose.headTilt) * k; this.pose.headNod += (nod - this.pose.headNod) * k;
    this.pose.crouch += (crouch - this.pose.crouch) * (1 - Math.exp(-dt * 18)); this.jump += (jump - this.jump) * (1 - Math.exp(-dt * 20));
    // 関節
    const sitting = S.startsWith('sit');
    const cr = this.pose.crouch;
    for (const L of this.legs) {
      const p = sitting ? L.ang.p : -cr * 0.9, kn = sitting ? L.ang.k : cr * 1.8;
      L.hipJ.rotation.set(p, 0, L.sd * 0.03); L.knJ.rotation.set(kn, 0, 0); L.anJ.rotation.set(-(p + kn), 0, 0);
    }
    const legLen = D.thigh * Math.cos(cr * 0.9) + D.shin * Math.cos(cr * 0.9);
    this.pelvis.position.y = sitting ? (this.kind === 'girl' ? 0.3 : 0.5) : legLen + D.ankle + 0.03 + this.jump;
    this.pelvis.rotation.set(sitting ? -0.05 : cr * 0.3, 0, sway * 0.3);
    this.chest.rotation.set(this.pose.bend, 0, -sway * 0.4);
    this.neck.rotation.set(this.pose.headNod * 0.4, 0, 0);
    this.head.rotation.set(this.pose.headNod * 0.6, 0, this.pose.headTilt);
    for (const A of this.arms) {
      A.shJ.rotation.set(A.ang.p, 0, A.sd * A.ang.r);
      A.elJ.rotation.set(-A.ang.e, 0, 0);
      A.wrJ.rotation.set(0.15, 0, 0);
    }
    if (this.skirt) { this.skirt.rotation.x = -cr * 0.2; this.skirt.scale.y = 1 - this.jump * 0.6; this.skirt.rotation.z = Math.sin(t * 7) * this.jump * 0.4; }
    // 管の更新（root 座標）
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const P = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z)).applyMatrix4(inv);
    const fwd = new THREE.Vector3(0, 0, 1);
    for (const A of this.arms) {
      const a = P(A.shJ, -A.sd * 0.01, 0.012, 0), b = P(A.elJ), c = P(A.wrJ, 0, 0.0, 0);
      A.sleeve.update(a, b, c, new THREE.Vector3(A.sd, 0, 0), A.ang.e);
    }
    for (const L of this.legs) {
      const a = P(L.hipJ, 0, 0.04, 0), b = P(L.knJ), c = P(L.anJ, 0, -0.01, 0);
      L.leg.update(a, b, c, fwd, L.ang.k);
      if (L.sock) { const s0 = P(L.anJ, 0, D.shin * 0.42, 0), s1 = P(L.anJ, 0, D.shin * 0.2, 0), s2 = P(L.anJ, 0, -0.02, 0); L.sock.update(s0, s1, s2, fwd, 0); }
    }
  }
}

// 麦わら帽子
export function makeStrawHat(scale = 1) {
  const g = new THREE.Group();
  const strawM = new THREE.MeshStandardMaterial({ map: tex('straw_col.jpg', { srgb: true, rep: [10, 3] }), normalMap: tex('straw_nrm.jpg', { rep: [10, 3] }), roughness: 0.82, color: 0xffffff, side: THREE.DoubleSide });
  const crown = new THREE.LatheGeometry([[0.0, 0.085], [0.04, 0.084], [0.07, 0.075], [0.085, 0.05], [0.09, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
  const brimPts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; brimPts.push(new THREE.Vector2(0.088 + t * 0.085, -0.004 - t * t * 0.018 + Math.sin(t * Math.PI) * 0.004)); }
  const brim = new THREE.LatheGeometry(brimPts, 56);
  const bp = brim.attributes.position; for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); const a = Math.atan2(z, x); bp.setY(i, bp.getY(i) + Math.sin(a * 2 + 0.4) * 0.006 * Math.hypot(x, z) / 0.17); }
  brim.computeVertexNormals();
  const c = new THREE.Mesh(crown, strawM), b = new THREE.Mesh(brim, strawM);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0905, 0.091, 0.022, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a3b3b, roughness: 0.75, normalMap: tex('cotton_nrm.jpg', { rep: [12, 1] }), side: THREE.DoubleSide }));
  band.position.y = 0.013;
  g.add(c, b, band);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(scale);
  return g;
}
