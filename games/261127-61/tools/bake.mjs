// Offline bake: SDF giraffe -> surface nets mesh with SDF normals, skin weights, AO and coat masks.
// usage: node bake.mjs [cell=0.017] [out=giraffe.bin]
import fs from 'node:fs';
import { sdf, prims, primDist, primBoneWeights, smoothstep, norm } from './sdf.mjs';
import { BONES, BBOX, J } from './anatomy.mjs';

const H = parseFloat(process.argv[2] || '0.017');
const OUT = process.argv[3] || 'giraffe.bin';
const t0 = Date.now();
const mn = BBOX.min, mx = BBOX.max;
const nx = Math.ceil((mx[0] - mn[0]) / H) + 1, ny = Math.ceil((mx[1] - mn[1]) / H) + 1, nz = Math.ceil((mx[2] - mn[2]) / H) + 1;
const N = nx * ny * nz;
const field = new Float32Array(N);
const idx = (i, j, k) => (k * ny + j) * nx + i;
const P = (i, j, k) => [mn[0] + i * H, mn[1] + j * H, mn[2] + k * H];

// coarse-to-fine evaluation
const C = 4;
let evals = 0;
for (let k0 = 0; k0 < nz; k0 += C) for (let j0 = 0; j0 < ny; j0 += C) for (let i0 = 0; i0 < nx; i0 += C) {
  const cc = P(i0 + C / 2, j0 + C / 2, k0 + C / 2);
  const dc = sdf(cc); evals++;
  const near = Math.abs(dc) < H * C * 1.8;
  for (let k = k0; k < Math.min(k0 + C, nz); k++) for (let j = j0; j < Math.min(j0 + C, ny); j++) for (let i = i0; i < Math.min(i0 + C, nx); i++) {
    field[idx(i, j, k)] = near ? (evals++, sdf(P(i, j, k))) : dc;
  }
}
console.log('grid', nx, ny, nz, 'evals', evals, ((Date.now() - t0) / 1000).toFixed(1) + 's');

// surface nets: one vertex per cell with a sign change
const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
const cidx = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
const verts = [];
const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
  let mask = 0; const v = [];
  for (let c = 0; c < 8; c++) { const d = field[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; v.push(d); if (d < 0) mask |= 1 << c; }
  if (mask === 0 || mask === 255) continue;
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (const [a, b] of edges) {
    if ((v[a] < 0) === (v[b] < 0)) continue;
    const t = v[a] / (v[a] - v[b]);
    sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
    sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
    sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
    n++;
  }
  cellVert[cidx(i, j, k)] = verts.length;
  verts.push([mn[0] + (i + sx / n) * H, mn[1] + (j + sy / n) * H, mn[2] + (k + sz / n) * H]);
}
// quads
const tris = [];
function quad(a, b, c, d, flip) {
  if (a < 0 || b < 0 || c < 0 || d < 0) return;
  if (flip) { [b, d] = [d, b]; }
  // choose the shorter diagonal
  const A = verts[a], B = verts[b], Cc = verts[c], D = verts[d];
  const d1 = Math.hypot(A[0] - Cc[0], A[1] - Cc[1], A[2] - Cc[2]), d2 = Math.hypot(B[0] - D[0], B[1] - D[1], B[2] - D[2]);
  if (d1 < d2) tris.push(a, b, c, a, c, d); else tris.push(a, b, d, b, c, d);
}
for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
  const d0 = field[idx(i, j, k)] < 0;
  // x edge
  if (i < nx - 1 && d0 !== (field[idx(i + 1, j, k)] < 0))
    quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !d0);
  if (j < ny - 1 && d0 !== (field[idx(i, j + 1, k)] < 0))
    quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !d0);
  if (k < nz - 1 && d0 !== (field[idx(i, j, k + 1)] < 0))
    quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !d0);
}
console.log('verts', verts.length, 'tris', tris.length / 3, ((Date.now() - t0) / 1000).toFixed(1) + 's');

// project onto the surface and compute normals from the SDF gradient
const e = H * 0.25;
function grad(p) {
  return [sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]), sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]), sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e])].map((x) => x / (2 * e));
}
const normals = [];
for (const v of verts) {
  for (let it = 0; it < 2; it++) {
    const d = sdf(v); const g = grad(v); const gl = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1;
    const s = Math.max(-H, Math.min(H, d)) / gl;
    v[0] -= g[0] * s; v[1] -= g[1] * s; v[2] -= g[2] * s;
  }
  normals.push(norm(grad(v)));
}
// orient triangles consistently with normals (surface nets orientation sanity check)
let flips = 0;
for (let t = 0; t < tris.length; t += 3) {
  const a = verts[tris[t]], b = verts[tris[t + 1]], c = verts[tris[t + 2]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const nn = normals[tris[t]];
  if (fn[0] * nn[0] + fn[1] * nn[1] + fn[2] * nn[2] < 0) { const x = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = x; flips++; }
}
console.log('orientation fixes', flips, ((Date.now() - t0) / 1000).toFixed(1) + 's');

// adjacency for weight smoothing
const nb = verts.map(() => new Set());
for (let t = 0; t < tris.length; t += 3) {
  const a = tris[t], b = tris[t + 1], c = tris[t + 2];
  nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
}

// skin weights, masks, AO
const NB = BONES.length;
const TAU = 0.022;
let W = verts.map(() => new Float32Array(NB));
const masks = verts.map(() => [0, 0, 0, 0]); // patch, scale, dark, pale
const ao = new Float32Array(verts.length);
for (let vi = 0; vi < verts.length; vi++) {
  const p = verts[vi];
  const ds = [];
  let dmin = 1e9;
  for (const Pp of prims) {
    if (Pp.k < 0) continue;
    const dc = Math.hypot(p[0] - Pp.bc[0], p[1] - Pp.bc[1], p[2] - Pp.bc[2]) - Pp.br;
    if (dc > dmin + 6 * TAU) continue;
    const d = primDist(p, Pp);
    ds.push([Pp, d]);
    if (d < dmin) dmin = d;
  }
  let sw = 0; const m = [0, 0, 0, 0];
  for (const [Pp, d] of ds) {
    const s = Math.exp(-(d - dmin) / TAU);
    if (s < 1e-3) continue;
    for (const [bi, bw] of primBoneWeights(p, Pp)) W[vi][bi] += s * bw;
    m[0] += s * Pp.m.patch; m[1] += s * Pp.m.scale; m[2] += s * Pp.m.dark; m[3] += s * Pp.m.pale;
    sw += s;
  }
  for (let c = 0; c < 4; c++) masks[vi][c] = m[c] / sw;
  // AO along the normal
  const n = normals[vi];
  let occ = 0;
  for (let s = 1; s <= 5; s++) {
    const dd = s * 0.035;
    const q = [p[0] + n[0] * dd, p[1] + n[1] * dd, p[2] + n[2] * dd];
    occ += (dd - Math.min(dd, sdf(q))) / Math.pow(1.7, s);
  }
  // ground occlusion near hooves and belly when standing is not baked (pose dependent)
  ao[vi] = Math.max(0, Math.min(1, 1 - occ * 3.2));
}
console.log('weights/AO', ((Date.now() - t0) / 1000).toFixed(1) + 's');
// normalise weights then smooth over the surface
for (const w of W) { let s = 0; for (const x of w) s += x; for (let i = 0; i < NB; i++) w[i] /= s; }
for (let it = 0; it < 4; it++) {
  const W2 = W.map((w, vi) => {
    const o = new Float32Array(NB);
    const ns = nb[vi]; const lam = 0.5;
    for (let i = 0; i < NB; i++) o[i] = w[i] * (1 - lam);
    for (const j of ns) for (let i = 0; i < NB; i++) o[i] += W[j][i] * lam / ns.size;
    return o;
  });
  W = W2;
}
// smooth AO and masks once
for (let it = 0; it < 2; it++) {
  const a2 = new Float32Array(ao.length);
  for (let vi = 0; vi < verts.length; vi++) { let s = ao[vi], c = 1; for (const j of nb[vi]) { s += ao[j]; c++; } a2[vi] = s / c; }
  ao.set(a2);
}
// belly and inner surfaces lighter; patch amount down on the underside
for (let vi = 0; vi < verts.length; vi++) {
  const p = verts[vi], n = normals[vi];
  if (p[1] > 1.25 && p[1] < 2.1 && p[0] > -0.8 && p[0] < 0.8) {
    const under = smoothstep(-0.35, -0.85, n[1]);
    masks[vi][0] *= 1 - 0.35 * under;
    masks[vi][3] = Math.max(masks[vi][3], 0.5 * under);
  }
  // inner side of legs paler
  const legInner = (Math.abs(p[2]) < 0.16 && p[1] < 1.5 && p[1] > 0.25) ? smoothstep(0.1, 0.7, -Math.sign(p[2]) * n[2]) : 0;
  masks[vi][3] = Math.max(masks[vi][3], 0.4 * legInner);
}

// pack: top-4 bone weights
const nv = verts.length;
const pos = new Uint16Array(nv * 3), nrm = new Int8Array(nv * 2), si = new Uint8Array(nv * 4), sw8 = new Uint8Array(nv * 4), at = new Uint8Array(nv * 4);
const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
function oct(n) {
  let l1 = Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]);
  let x = n[0] / l1, y = n[1] / l1;
  if (n[2] < 0) { const ox = x; x = (1 - Math.abs(y)) * Math.sign(ox || 1); y = (1 - Math.abs(ox)) * Math.sign(y || 1); }
  return [Math.round(x * 127), Math.round(y * 127)];
}
for (let vi = 0; vi < nv; vi++) {
  const p = verts[vi];
  for (let c = 0; c < 3; c++) pos[vi * 3 + c] = Math.round((p[c] - mn[c]) / ext[c] * 65535);
  const o = oct(normals[vi]); nrm[vi * 2] = o[0]; nrm[vi * 2 + 1] = o[1];
  const w = Array.from(W[vi]).map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 4);
  let s = w.reduce((a, b) => a + b[0], 0);
  let acc = 0;
  for (let c = 0; c < 4; c++) {
    si[vi * 4 + c] = w[c][1];
    const q = c < 3 ? Math.round(w[c][0] / s * 255) : 255 - acc;
    sw8[vi * 4 + c] = Math.max(0, q); acc += q;
  }
  const m = masks[vi];
  at[vi * 4] = Math.round(Math.max(0, Math.min(1, m[0])) * 255);
  at[vi * 4 + 1] = Math.round(ao[vi] * 255);
  at[vi * 4 + 2] = Math.round(Math.max(0, Math.min(1, m[2])) * 255);
  at[vi * 4 + 3] = Math.round(Math.max(0, Math.min(1, m[1] / 1.2)) * 200) + Math.round(Math.max(0, Math.min(1, m[3])) * 0) ; // scale (0..200)
}
// pale mask packed separately
const pale = new Uint8Array(nv);
for (let vi = 0; vi < nv; vi++) pale[vi] = Math.round(Math.max(0, Math.min(1, masks[vi][3])) * 255);
const ind = nv < 65536 ? new Uint16Array(tris) : new Uint32Array(tris);
const header = {
  nv, nt: tris.length / 3, bbox: BBOX, h: H,
  bones: BONES.map((b) => [b[0], b[1], (b[3] === 'L' ? [J[b[2]][0], J[b[2]][1], -J[b[2]][2]] : J[b[2]])]),
};
// landmarks: dorsal mane line (surface points on the midline from poll to withers), ossicone tips, tail end
function surfaceAlong(p, dir) { // march from p along dir until outside, return surface point
  let q = p.slice();
  for (let i = 0; i < 400; i++) { const d = sdf(q); if (d > 0 && d < 0.0015) break; q = [q[0] + dir[0] * d, q[1] + dir[1] * d, q[2] + dir[2] * d]; if (d > 0.002 && i > 200) break; }
  return q;
}
const mane = [];
for (let i = 0; i <= 64; i++) {
  const t = i / 64;
  // centre line from just behind the poll to the withers
  const a = [J.head[0] - 0.06, J.head[1] - 0.02, 0], b = [0.50, 2.56, 0];
  const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
  // outward direction: perpendicular to the neck line, up-back
  const nd = norm([-(a[1] - b[1]), (a[0] - b[0]), 0]);
  const dir = nd[1] > 0 ? nd : nd.map((x) => -x);
  // march inward from outside the body
  const start = [c[0] + dir[0] * 0.6, c[1] + dir[1] * 0.6, 0];
  const sp = surfaceAlong(start, [-dir[0], -dir[1], 0]);
  const g = norm(grad(sp));
  mane.push([+sp[0].toFixed(4), +sp[1].toFixed(4), +g[0].toFixed(3), +g[1].toFixed(3)]);
}
header.mane = mane;
const hjson = Buffer.from(JSON.stringify(header));
const parts = [pos, nrm, si, sw8, at, pale, ind];
const total = 4 + hjson.length + parts.reduce((a, b) => a + b.byteLength + 8, 0);
const buf = Buffer.alloc(total);
let off = 0;
buf.writeUInt32LE(hjson.length, off); off += 4; hjson.copy(buf, off); off += hjson.length;
for (const p of parts) { off = (off + 3) & ~3; buf.writeUInt32LE(p.byteLength, off); off += 4; Buffer.from(p.buffer, p.byteOffset, p.byteLength).copy(buf, off); off += p.byteLength; }
fs.writeFileSync(OUT, buf.subarray(0, off));
console.log('wrote', OUT, off, 'bytes', ((Date.now() - t0) / 1000).toFixed(1) + 's');
