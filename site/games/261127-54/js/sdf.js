// 距離関数（SDF）でなめらかにつながった形を作り、Surface Nets でメッシュにする。
// 指・手のひら・腕・服のしわが一続きの面になり、カプセルを並べた人形にならない。
import * as THREE from '../lib/three.module.min.js';

// ---- 形の部品 -----------------------------------------------------------
// どれも {f(x,y,z)->距離, m:材質, c:[r,g,b], k:なめらかさ, bb:[minx..maxz]}
export function roundCone(a, b, ra, rb, m, c, k = 0.01, disp = null) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, l = Math.sqrt(l2);
  const rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const f = (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yv = pax * bax + pay * bay + paz * baz;
    const zv = yv - l2;
    const xx = (pax * l2 - bax * yv), xy = (pay * l2 - bay * yv), xz = (paz * l2 - baz * yv);
    const x2 = xx * xx + xy * xy + xz * xz;
    const y2 = yv * yv * l2, z2 = zv * zv * l2;
    const kk = Math.sign(rr) * rr * rr * x2;
    let d;
    if (Math.sign(zv) * a2 * z2 > kk) d = Math.sqrt(x2 + z2) * il2 - rb;
    else if (Math.sign(yv) * a2 * y2 < kk) d = Math.sqrt(x2 + y2) * il2 - ra;
    else d = (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
    if (disp) d += disp(x, y, z, yv * il2);
    return d;
  };
  const r = Math.max(ra, rb) + 0.02;
  return { f, m, c, k, bb: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r] };
}
export function ellipsoid(c0, r, m, c, k = 0.01, rot = null, disp = null) {
  const inv = rot ? new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))).transpose().elements : null;
  const f = (x, y, z) => {
    let px = x - c0[0], py = y - c0[1], pz = z - c0[2];
    if (inv) { const qx = inv[0] * px + inv[3] * py + inv[6] * pz, qy = inv[1] * px + inv[4] * py + inv[7] * pz, qz = inv[2] * px + inv[5] * py + inv[8] * pz; px = qx; py = qy; pz = qz; }
    const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    const k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
    let d = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
    if (disp) d += disp(x, y, z);
    return d;
  };
  const R = Math.max(...r) + 0.02;
  return { f, m, c, k, bb: [c0[0] - R, c0[1] - R, c0[2] - R, c0[0] + R, c0[1] + R, c0[2] + R] };
}
export function roundBox(c0, h, rad, m, c, k = 0.01, rot = null, disp = null) {
  const inv = rot ? new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))).transpose().elements : null;
  const f = (x, y, z) => {
    let px = x - c0[0], py = y - c0[1], pz = z - c0[2];
    if (inv) { const qx = inv[0] * px + inv[3] * py + inv[6] * pz, qy = inv[1] * px + inv[4] * py + inv[7] * pz, qz = inv[2] * px + inv[5] * py + inv[8] * pz; px = qx; py = qy; pz = qz; }
    const qx = Math.abs(px) - h[0] + rad, qy = Math.abs(py) - h[1] + rad, qz = Math.abs(pz) - h[2] + rad;
    let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rad;
    if (disp) d += disp(x, y, z);
    return d;
  };
  const R = Math.hypot(...h) + 0.02;
  return { f, m, c, k, bb: [c0[0] - R, c0[1] - R, c0[2] - R, c0[0] + R, c0[1] + R, c0[2] + R] };
}
// 縦向きの円すい台（y0 で半径 r0、y1 で r1）
export function cappedCone(c0, y0, y1, r0, r1, m, c, k = 0.01, disp = null, round = 0.004) {
  const yb = Math.min(y0, y1), yt = Math.max(y0, y1);
  const rb = y0 < y1 ? r0 : r1, rt = y0 < y1 ? r1 : r0;
  const h = (yt - yb) / 2, cy = c0[1] + (yt + yb) / 2;
  const k2x = rt - rb, k2y = 2 * h, k2l = k2x * k2x + k2y * k2y;
  const f = (x, y, z) => {
    const qx = Math.hypot(x - c0[0], z - c0[2]), qy = y - cy;
    const cax = qx - Math.min(qx, qy < 0 ? rb : rt), cay = Math.abs(qy) - h;
    const t = Math.min(Math.max(((rt - qx) * k2x + (h - qy) * k2y) / k2l, 0), 1);
    const cbx = qx - rt + k2x * t, cby = qy - h + k2y * t;
    const s = (cbx < 0 && cay < 0) ? -1 : 1;
    let d = s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby)) - round;
    if (disp) d += disp(x, y, z);
    return d;
  };
  const R = Math.max(r0, r1) + 0.03;
  return { f, m, c, k, bb: [c0[0] - R, c0[1] + yb - 0.03, c0[2] - R, c0[0] + R, c0[1] + yt + 0.03, c0[2] + R] };
}
// 差（くりぬき）
export function subtract(prim, k = 0.004) { prim.sub = true; prim.k = k; return prim; }

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) { return -smin(-a, -b, k); }

export function evalSDF(prims, x, y, z) {
  let d = 1e9, mi = 0;
  let best = 1e9;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
    const bb = p.bb;
    if (!p.sub && (x < bb[0] - 0.03 || y < bb[1] - 0.03 || z < bb[2] - 0.03 || x > bb[3] + 0.03 || y > bb[4] + 0.03 || z > bb[5] + 0.03)) {
      // 箱の外：おおよその距離だけ（遠いので混ざらない）
      const dx = Math.max(bb[0] - x, 0, x - bb[3]), dy = Math.max(bb[1] - y, 0, y - bb[4]), dz = Math.max(bb[2] - z, 0, z - bb[5]);
      const e = Math.hypot(dx, dy, dz);
      if (e < d) { d = Math.min(d, e); }
      continue;
    }
    const v = p.f(x, y, z);
    if (p.sub) { d = smax(d, -v, p.k); continue; }
    if (v < best) { best = v; mi = i; }
    d = smin(d, v, p.k);
  }
  return [d, mi];
}

// ---- Surface Nets ------------------------------------------------------
export function mesh(prims, h, opts = {}) {
  // 範囲
  let bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of prims) { if (p.sub) continue; for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], p.bb[i]); bb[i + 3] = Math.max(bb[i + 3], p.bb[i + 3]); } }
  if (opts.clip) for (let i = 0; i < 6; i++) if (opts.clip[i] != null) bb[i] = i < 3 ? Math.max(bb[i], opts.clip[i]) : Math.min(bb[i], opts.clip[i]);
  const nx = Math.ceil((bb[3] - bb[0]) / h) + 1, ny = Math.ceil((bb[4] - bb[1]) / h) + 1, nz = Math.ceil((bb[5] - bb[2]) / h) + 1;
  const ox = bb[0], oy = bb[1], oz = bb[2];
  const N = nx * ny * nz;
  const D = new Float32Array(N);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  // 粗い格子で表面の近くだけ細かく評価
  const C = 4, cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const CD = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
    CD[i + cx * (j + cy * k)] = evalSDF(prims, ox + i * C * h, oy + j * C * h, oz + k * C * h)[0];
  const thr = C * h * 1.9;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ci = Math.round(i / C), cj = Math.round(j / C), ck = Math.round(k / C);
    const dc = CD[ci + cx * (cj + cy * ck)];
    let v = Math.abs(dc) > thr ? dc : evalSDF(prims, ox + i * h, oy + j * h, oz + k * h)[0];
    // 切り取り面の外は外側扱い（腕の端を開いたままにしない）
    D[idx(i, j, k)] = v;
  }
  if (opts.clip) {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) D[idx(i, j, k)] = Math.max(D[idx(i, j, k)], h * 0.5);
    }
  }
  // 頂点
  const vid = new Int32Array(N).fill(-1);
  const P = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const q = corners[c]; cv[c] = D[idx(i + q[0], j + q[1], k + q[2])]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      const A = corners[a], B = corners[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    vid[idx(i, j, k)] = P.length / 3;
    P.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
  }
  // 面
  const I = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const d0 = D[idx(i, j, k)] < 0;
    // x 方向の辺
    if (i < nx - 1 && (D[idx(i + 1, j, k)] < 0) !== d0) {
      const a = vid[idx(i, j - 1, k - 1)], b = vid[idx(i, j, k - 1)], c = vid[idx(i, j, k)], d = vid[idx(i, j - 1, k)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (d0) I.push(a, b, c, a, c, d); else I.push(a, c, b, a, d, c); }
    }
    if (j < ny - 1 && (D[idx(i, j + 1, k)] < 0) !== d0) {
      const a = vid[idx(i - 1, j, k - 1)], b = vid[idx(i, j, k - 1)], c = vid[idx(i, j, k)], d = vid[idx(i - 1, j, k)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (d0) I.push(a, c, b, a, d, c); else I.push(a, b, c, a, c, d); }
    }
    if (k < nz - 1 && (D[idx(i, j, k + 1)] < 0) !== d0) {
      const a = vid[idx(i - 1, j - 1, k)], b = vid[idx(i, j - 1, k)], c = vid[idx(i, j, k)], d = vid[idx(i - 1, j, k)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (d0) I.push(a, b, c, a, c, d); else I.push(a, c, b, a, d, c); }
    }
  }
  // 法線・色・材質・AO（頂点ごとに正確に）
  const nv = P.length / 3;
  const Nn = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), M = new Float32Array(nv), AO = new Float32Array(nv);
  const e = h * 0.5;
  const sd = (x, y, z) => evalSDF(prims, x, y, z)[0];
  const aoS = opts.aoScale || 0.012;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let gx = sd(x + e, y, z) - sd(x - e, y, z), gy = sd(x, y + e, z) - sd(x, y - e, z), gz = sd(x, y, z + e) - sd(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    Nn[v * 3] = gx; Nn[v * 3 + 1] = gy; Nn[v * 3 + 2] = gz;
    // 色：近い部品ほど強く混ぜる
    let wr = 0, wg = 0, wb = 0, ws = 0, best = 1e9, bm = 0;
    for (const p of prims) {
      if (p.sub) continue;
      const bb = p.bb;
      if (x < bb[0] - 0.02 || y < bb[1] - 0.02 || z < bb[2] - 0.02 || x > bb[3] + 0.02 || y > bb[4] + 0.02 || z > bb[5] + 0.02) continue;
      const dv = p.f(x, y, z);
      if (dv < best) { best = dv; bm = p.m; }
      const w = Math.exp(-Math.max(dv, 0) / (p.blend || 0.003));
      wr += p.c[0] * w; wg += p.c[1] * w; wb += p.c[2] * w; ws += w;
    }
    if (ws > 0) { Cc[v * 3] = wr / ws; Cc[v * 3 + 1] = wg / ws; Cc[v * 3 + 2] = wb / ws; }
    M[v] = bm;
    let ao = 0;
    for (let s = 1; s <= 4; s++) { const dd = aoS * s / 4; ao += (dd - sd(x + gx * dd, y + gy * dd, z + gz * dd)) / dd / s; }
    AO[v] = Math.max(0.25, Math.min(1, 1 - ao * 0.55));
  }
  // 向きをそろえる（面の法線と SDF 勾配が逆なら反転）
  let agree = 0;
  for (let t = 0; t < I.length; t += 3 * Math.max(1, Math.floor(I.length / 3 / 300))) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    agree += Math.sign(fx * Nn[a] + fy * Nn[a + 1] + fz * Nn[a + 2]);
  }
  if (agree < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(M, 1));
  g.setAttribute('aAO', new THREE.BufferAttribute(AO, 1));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}
