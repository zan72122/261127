// メッシュを平面で2つに割り、切り口（断面）を三角形分割してふさぐ。
// 形は三角形の羅列（非インデックス）。tri ごとに mat: 0=皮 1=果肉（断面）
import { ShapeUtils, Vector2 } from '../lib/three.module.min.js';

export class PieceData {
  constructor(pos, nrm, uv, mat) {
    this.pos = pos; this.nrm = nrm; this.uv = uv; this.mat = mat; // Float32Array / Uint8Array(tri)
  }
  get triCount() { return this.mat.length; }
  // 体積と重心（四面体分割）
  massProps() {
    const p = this.pos; let V = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3], by = p[i + 4], bz = p[i + 5], qx = p[i + 6], qy = p[i + 7], qz = p[i + 8];
      const v = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6;
      V += v; cx += v * (ax + bx + qx) / 4; cy += v * (ay + by + qy) / 4; cz += v * (az + bz + qz) / 4;
    }
    if (Math.abs(V) < 1e-12) { // 縮退：頂点平均
      let n = p.length / 3; cx = cy = cz = 0;
      for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
      return { volume: 0, c: [cx / n, cy / n, cz / n] };
    }
    return { volume: Math.abs(V), c: [cx / V, cy / V, cz / V] };
  }
  radiusFrom(c) {
    const p = this.pos; let r = 0;
    for (let i = 0; i < p.length; i += 3) {
      const dx = p[i] - c[0], dy = p[i + 1] - c[1], dz = p[i + 2] - c[2];
      const d = dx * dx + dy * dy + dz * dz; if (d > r) r = d;
    }
    return Math.sqrt(r);
  }
}

class Builder {
  constructor(cap) { this.pos = []; this.nrm = []; this.uv = []; this.mat = []; }
  v(p, n, t) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(t[0], t[1]); }
  tri(a, b, c, m) { this.v(a.p, a.n, a.t); this.v(b.p, b.n, b.t); this.v(c.p, c.n, c.t); this.mat.push(m); }
  done() { return new PieceData(new Float32Array(this.pos), new Float32Array(this.nrm), new Float32Array(this.uv), new Uint8Array(this.mat)); }
}

function vtx(d, i) {
  return { p: [d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]], n: [d.nrm[i * 3], d.nrm[i * 3 + 1], d.nrm[i * 3 + 2]], t: [d.uv[i * 2], d.uv[i * 2 + 1]] };
}
function less(a, b) { // 位置の辞書順（同じ辺は必ず同じ向きで補間する）
  if (a.p[0] !== b.p[0]) return a.p[0] < b.p[0];
  if (a.p[1] !== b.p[1]) return a.p[1] < b.p[1];
  return a.p[2] < b.p[2];
}
function inter(a, da, b, db) {
  if (!less(a, b)) { const t = a; a = b; b = t; const s = da; da = db; db = s; }
  const t = da / (da - db);
  const L = (x, y) => x + (y - x) * t;
  const n = [L(a.n[0], b.n[0]), L(a.n[1], b.n[1]), L(a.n[2], b.n[2])];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  return { p: [L(a.p[0], b.p[0]), L(a.p[1], b.p[1]), L(a.p[2], b.p[2])], n: [n[0] / nl, n[1] / nl, n[2] / nl], t: [L(a.t[0], b.t[0]), L(a.t[1], b.t[1])] };
}
const key = (p) => Math.round(p[0] * 2e5) + ',' + Math.round(p[1] * 2e5) + ',' + Math.round(p[2] * 2e5);

// 平面 n·x = d で分割。front = n·x > d 側。交わらなければ null。
export function slice(data, n, d) {
  const F = new Builder(), B = new Builder();
  const segs = [];
  const tc = data.triCount;
  let nf = 0, nb = 0;
  for (let t = 0; t < tc; t++) {
    const m = data.mat[t];
    const V = [vtx(data, t * 3), vtx(data, t * 3 + 1), vtx(data, t * 3 + 2)];
    const D = V.map(v => { let s = v.p[0] * n[0] + v.p[1] * n[1] + v.p[2] * n[2] - d; if (Math.abs(s) < 1e-7) s = 1e-7; return s; });
    const pos = (D[0] > 0) + (D[1] > 0) + (D[2] > 0);
    if (pos === 3) { F.tri(V[0], V[1], V[2], m); nf++; continue; }
    if (pos === 0) { B.tri(V[0], V[1], V[2], m); nb++; continue; }
    // 孤立した頂点 i（他2つと符号が違う）
    let i = 0;
    for (let k = 0; k < 3; k++) { const o1 = (k + 1) % 3, o2 = (k + 2) % 3; if ((D[k] > 0) !== (D[o1] > 0) && (D[k] > 0) !== (D[o2] > 0)) { i = k; break; } }
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const a = V[i], b = V[j], c = V[k];
    const ab = inter(a, D[i], b, D[j]);
    const ac = inter(a, D[i], c, D[k]);
    const lone = D[i] > 0 ? F : B, other = D[i] > 0 ? B : F;
    lone.tri(a, ab, ac, m);
    other.tri(ab, b, c, m);
    other.tri(ab, c, ac, m);
    segs.push([ab.p, ac.p]);
  }
  if (segs.length < 3 || F.mat.length === 0 || B.mat.length === 0) return null;
  // 切り口の輪をつなぐ
  const adj = new Map();
  const add = (k, idx) => { let l = adj.get(k); if (!l) adj.set(k, l = []); l.push(idx); };
  segs.forEach((s, i) => { add(key(s[0]), i); add(key(s[1]), i); });
  const used = new Uint8Array(segs.length);
  const loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const loop = [segs[s0][0], segs[s0][1]];
    let cur = segs[s0][1];
    for (let guard = 0; guard < segs.length; guard++) {
      const l = adj.get(key(cur)); let nx = -1;
      if (l) for (const si of l) if (!used[si]) { nx = si; break; }
      if (nx < 0) break;
      used[nx] = 1;
      const s = segs[nx];
      cur = key(s[0]) === key(cur) ? s[1] : s[0];
      if (key(cur) === key(loop[0])) break;
      loop.push(cur);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  // 平面座標系
  const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
  const ul = Math.hypot(u[0], u[1], u[2]); u = u.map(x => x / ul);
  const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const capArea = [];
  for (const loop of loops) {
    // ほぼ重なる点を除く
    const pts = [];
    for (const p of loop) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-6) pts.push(p); }
    if (pts.length < 3) continue;
    const c2 = pts.map(p => new Vector2(p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * w[0] + p[1] * w[1] + p[2] * w[2]));
    let tris;
    try { tris = ShapeUtils.triangulateShape(c2, []); } catch (e) { continue; }
    capArea.push(Math.abs(ShapeUtils.area(c2)));
    const nF = [-n[0], -n[1], -n[2]], nB = [n[0], n[1], n[2]];
    for (const t of tris) {
      const A = pts[t[0]], Bp = pts[t[1]], C = pts[t[2]];
      const e1 = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const dot = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2];
      const mk = (p, nn) => ({ p, n: nn, t: [0, 0] });
      // front 片の断面は -n を向く
      if (dot < 0) { F.tri(mk(A, nF), mk(Bp, nF), mk(C, nF), 1); B.tri(mk(A, nB), mk(C, nB), mk(Bp, nB), 1); }
      else { F.tri(mk(A, nF), mk(C, nF), mk(Bp, nF), 1); B.tri(mk(A, nB), mk(Bp, nB), mk(C, nB), 1); }
    }
  }
  return { front: F.done(), back: B.done(), area: capArea.reduce((a, b) => a + b, 0) };
}

// PieceData → BufferGeometry 用の配列（皮→果肉の順に並べ替えて groups を作る）
export function toArrays(data) {
  const tc = data.triCount; let ns = 0;
  for (let t = 0; t < tc; t++) if (data.mat[t] === 0) ns++;
  const P = new Float32Array(tc * 9), N = new Float32Array(tc * 9), U = new Float32Array(tc * 6);
  let a = 0, b = ns;
  for (let t = 0; t < tc; t++) {
    const o = data.mat[t] === 0 ? a++ : b++;
    P.set(data.pos.subarray(t * 9, t * 9 + 9), o * 9);
    N.set(data.nrm.subarray(t * 9, t * 9 + 9), o * 9);
    U.set(data.uv.subarray(t * 6, t * 6 + 6), o * 6);
  }
  return { P, N, U, skinCount: ns * 3, fleshCount: (tc - ns) * 3 };
}
