// Signed-distance evaluation of the anatomy primitives (offline baking only).
import { PRIMS, BONES } from './anatomy.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smoothstep = (a, b, x) => { if (a === b) return 0.5; const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function mirror(v) { return [v[0], v[1], -v[2]]; }

// expand mirrored primitives and precompute frames / bounds
export const prims = [];
for (const p0 of PRIMS) {
  const sides = p0.side ? ['R', 'L'] : [null];
  for (const s of sides) {
    const p = { ...p0 };
    const mz = s === 'L';
    const M = (v) => (v ? (mz ? mirror(v) : v.slice()) : v);
    const bn = (b) => (s && typeof b === 'string' && /(R|L|S)$/.test(b) && b.endsWith('S')) ? b.slice(0, -1) + s : b;
    p.bone = Array.isArray(p0.bone) ? p0.bone.map(bn) : bn(p0.bone);
    if (p.t === 'rc') {
      p.a = M(p0.a); p.b = M(p0.b);
      const ab = sub(p.b, p.a); p.L = len(ab); p.w = norm(ab);
      // lateral axis = world z orthogonalised against w
      let zz = [0, 0, 1]; zz = norm(sub(zz, p.w.map((x) => x * dot(zz, p.w))));
      p.lat = zz; p.third = cross(p.w, zz);
      p.sq = p0.sq || 1;
      const rr = Math.max(p.ra, p.rb);
      p.bc = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2]; p.br = p.L / 2 + rr;
    } else if (p.t === 'el') {
      p.c = M(p0.c);
      let f = p0.fwd ? M(p0.fwd) : [1, 0, 0];
      f = norm(f);
      let up = [0, 1, 0];
      if (Math.abs(dot(up, f)) > 0.95) up = [1, 0, 0];
      let z = norm(cross(f, up)); up = cross(z, f);
      p.ax = [f, up, z];
      p.bc = p.c; p.br = Math.max(...p.r);
    } else if (p.t === 'hoof') {
      p.c = M(p0.c); p.bc = [p.c[0], 0.05, p.c[2]]; p.br = 0.16;
    }
    p.k = p0.k || 0;
    p.m = Object.assign({ patch: 1, scale: 1, dark: 0, pale: 0 }, p0.m || {});
    prims.push(p);
  }
}

function sdRC(p, P) {
  // into local frame
  const d = sub(p, P.a);
  const x = dot(d, P.w), yl = dot(d, P.lat) / P.sq, y3 = dot(d, P.third);
  const q = Math.hypot(yl, y3);
  // IQ round cone (2D)
  const r1 = P.ra, r2 = P.rb, h = P.L;
  const b = (r1 - r2) / h, a = Math.sqrt(Math.max(0, 1 - b * b));
  const k = q * (-b) + x * a; // dot(q, vec2(-b, a)) with q=(q,x)
  let dist;
  if (k < 0) dist = Math.hypot(q, x) - r1;
  else if (k > a * h) dist = Math.hypot(q, x - h) - r2;
  else dist = q * a + x * b - r1;
  return dist * Math.min(1, P.sq);
}
function sdEl(p, P) {
  const d = sub(p, P.c);
  const x = dot(d, P.ax[0]) / P.r[0], y = dot(d, P.ax[1]) / P.r[1], z = dot(d, P.ax[2]) / P.r[2];
  const k0 = Math.hypot(x, y, z);
  const x2 = x / P.r[0], y2 = y / P.r[1], z2 = z / P.r[2];
  const k1 = Math.hypot(x2, y2, z2);
  if (k1 < 1e-9) return -Math.min(...P.r);
  return k0 * (k0 - 1) / k1;
}
function sdHoof(p, P) {
  // local coordinates around the hoof centre on the ground; toe points +x
  const x = p[0] - P.c[0], y = p[1], z = p[2] - P.c[2];
  // body: ellipsoid sitting on the ground, longer toward the toe
  const cx = x - 0.005, cy = y - 0.028;
  const rx = cx > 0 ? 0.118 : 0.085, ry = 0.082, rz = 0.064 - 0.012 * clamp(cx / 0.1, -1, 1);
  const X = cx / rx, Y = cy / ry, Z = z / rz;
  const k0 = Math.hypot(X, Y, Z), k1 = Math.hypot(X / rx, Y / ry, Z / rz);
  let d = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -0.05;
  // sloped toe wall (about 50 degrees)
  const n = norm([0.77, 0.64, 0]);
  d = Math.max(d, (x - 0.07) * n[0] + (y - 0.0) * n[1]);
  // flat sole
  d = Math.max(d, 0.002 - y);
  // cleft between the two digits (front part)
  const cleft = Math.max(Math.abs(z) - 0.0045, -(x + 0.03), y - 0.085);
  d = Math.max(d, -cleft);
  return d;
}
export function primDist(p, P) {
  if (P.t === 'rc') return sdRC(p, P);
  if (P.t === 'el') return sdEl(p, P);
  return sdHoof(p, P);
}
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) { return -smin(-a, -b, k); }

export function sdf(p) {
  let d = 1e9;
  for (let i = 0; i < prims.length; i++) {
    const P = prims[i];
    const dc = Math.hypot(p[0] - P.bc[0], p[1] - P.bc[1], p[2] - P.bc[2]) - P.br;
    if (P.k < 0) {
      if (dc > -P.k) continue;
      d = smax(d, -primDist(p, P), -P.k);
    } else {
      if (dc > d + P.k) continue;
      d = smin(d, primDist(p, P), P.k);
    }
  }
  return d;
}

export const boneIndex = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// bone weights of one primitive at point p
export function primBoneWeights(p, P) {
  const out = [];
  if (!Array.isArray(P.bone)) { out.push([boneIndex[P.bone], 1]); return out; }
  let t;
  if (P.t === 'rc') {
    const tt = dot(sub(p, P.a), P.w) / P.L;
    const tb = P.tb || [0, 1];
    t = smoothstep(tb[0], tb[1], tt);
  } else {
    const r = P.range || [0, 1];
    if (r[0] === r[1]) t = 0.5;
    else {
      const ax = P.axis === 'y' || (r[0] > 1.2) ? 1 : 0; // ranges above 1.2 m are heights
      t = smoothstep(r[0], r[1], p[ax]);
    }
  }
  out.push([boneIndex[P.bone[0]], 1 - t], [boneIndex[P.bone[1]], t]);
  return out;
}
export { sub, dot, len, norm, cross, clamp };
