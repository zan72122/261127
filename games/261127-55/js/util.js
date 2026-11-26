import * as THREE from '../lib/three.module.min.js';

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export function damp(cur, target, lambda, dt) { return lerp(cur, target, 1 - Math.exp(-lambda * dt)); }

// 単純なジオメトリ結合（position/normal/uv/index）
export function merge(geos) {
  let nv = 0, ni = 0;
  const gs = geos.map((g) => (g.index ? g : g.toNonIndexed && g.index === null ? withIndex(g) : g));
  for (const g of gs) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const hasCol = gs.some((g) => g.attributes.color);
  const col = hasCol ? new Float32Array(nv * 3) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of gs) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    if (col) { if (c) col.set(c.array, vo * 3); else col.fill(1, vo * 3, (vo + p.count) * 3); }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < p.count; i++) idx[io + i] = vo + i; io += p.count; }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function withIndex(g) { return g; }

// 頂点ごとに変形
export function deform(geo, fn) {
  const p = geo.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); }
  p.needsUpdate = true; geo.computeVertexNormals(); return geo;
}

// onBeforeCompile をつなぐ
export function patch(mat, fn, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh, r); };
  mat.customProgramCacheKey = () => (key || 'p') + (mat.userData.ck || '');
  return mat;
}

export function srgbColor(hex) { return new THREE.Color(hex); }

// 大きな三角形を細かく割る（曲面に変形する前に）
export function subdivide(geo, maxEdge, maxIter = 6) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  const attrs = Object.keys(g.attributes).filter((k) => k === 'position' || k === 'uv');
  for (let it = 0; it < maxIter; it++) {
    const P = g.attributes.position.array, U = g.attributes.uv ? g.attributes.uv.array : null;
    const outP = [], outU = [];
    let split = false;
    for (let t = 0; t < P.length / 9; t++) {
      const v = [0, 1, 2].map((k) => [P[t * 9 + k * 3], P[t * 9 + k * 3 + 1], P[t * 9 + k * 3 + 2]]);
      const u = U ? [0, 1, 2].map((k) => [U[t * 6 + k * 2], U[t * 6 + k * 2 + 1]]) : null;
      const e = (a, b) => Math.hypot(v[a][0] - v[b][0], v[a][1] - v[b][1], v[a][2] - v[b][2]);
      const L = Math.max(e(0, 1), e(1, 2), e(2, 0));
      if (L <= maxEdge) { for (let k = 0; k < 3; k++) { outP.push(...v[k]); if (u) outU.push(...u[k]); } continue; }
      split = true;
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const midu = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const m01 = mid(v[0], v[1]), m12 = mid(v[1], v[2]), m20 = mid(v[2], v[0]);
      const tris = [[v[0], m01, m20], [m01, v[1], m12], [m20, m12, v[2]], [m01, m12, m20]];
      let tu = null;
      if (u) { const a = midu(u[0], u[1]), b = midu(u[1], u[2]), c = midu(u[2], u[0]); tu = [[u[0], a, c], [a, u[1], b], [c, b, u[2]], [a, b, c]]; }
      tris.forEach((tr, i) => { for (let k = 0; k < 3; k++) { outP.push(...tr[k]); if (tu) outU.push(...tu[i][k]); } });
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
    if (U) ng.setAttribute('uv', new THREE.Float32BufferAttribute(outU, 2));
    g = ng;
    if (!split) break;
  }
  return g;
}

// 位置が同じ頂点の法線をならす（UV の継ぎ目は残す）
export function smoothNormals(g, eps = 1e-4) {
  g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(P.getX(i) / eps)},${Math.round(P.getY(i) / eps)},${Math.round(P.getZ(i) / eps)}`;
  // 面の法線（面積重み）を位置ごとに集める
  const idx = g.index ? g.index.array : null; const nt = idx ? idx.length / 3 : P.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    fn.subVectors(c, b).cross(a.clone().sub(b));
    for (const i of [i0, i1, i2]) { const k = key(i); const v = map.get(k); if (v) v.add(fn); else map.set(k, fn.clone()); }
  }
  for (let i = 0; i < P.count; i++) { const v = map.get(key(i)); if (v) { const n = v.clone().normalize(); N.setXYZ(i, n.x, n.y, n.z); } }
  N.needsUpdate = true;
  return g;
}
