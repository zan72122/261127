// SDF（符号付き距離関数）から Surface Nets でメッシュを作る、ビルド時専用ツール。
// 人の体・手・腕を「カプセルの組み合わせ」ではなく、なめらかに溶け合う一つの面として作るため。
import fs from 'node:fs';

export const V = (x, y, z) => [x, y, z];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

// 回転行列（Y→X→Z の順のオイラー角）
export function rotM(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz * Rx * Ry
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(Rz, mul3(Rx, Ry));
}
export function mul3(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
export function apply3(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
export function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function scl(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function len(a) { return Math.hypot(a[0], a[1], a[2]); }
export function nrm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export function lerpv(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ---- プリミティブ（すべて {d(x,y,z), c:中心, R:外接半径} を返す）
export function roundCone(a, b, r1, r2, opt = {}) {
  const ba = sub(b, a), l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const sx = opt.sx || 1, sy = opt.sy || 1; // 断面の楕円化（軸に垂直な方向）
  const disp = opt.disp;
  const d = (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const yv = px * ba[0] + py * ba[1] + pz * ba[2];
    const zv = yv - l2;
    const qx = px * l2 - ba[0] * yv, qy = py * l2 - ba[1] * yv, qz = pz * l2 - ba[2] * yv;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yv * yv * l2, z2 = zv * zv * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    let r;
    if (Math.sign(zv) * a2 * z2 > k) r = Math.sqrt(x2 + z2) * il2 - r2;
    else if (Math.sign(yv) * a2 * y2 < k) r = Math.sqrt(x2 + y2) * il2 - r1;
    else r = (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
    if (disp) r += disp(x, y, z, clamp(yv / l2, 0, 1));
    return r;
  };
  const c = lerpv(a, b, 0.5);
  return { d, c, R: Math.sqrt(l2) / 2 + Math.max(r1, r2) + (opt.pad || 0.01) };
}
// 楕円体（近似距離）。rot は回転行列
export function ellipsoid(c, r, rot = null, opt = {}) {
  const inv = rot ? [rot[0], rot[3], rot[6], rot[1], rot[4], rot[7], rot[2], rot[5], rot[8]] : null;
  const disp = opt.disp;
  const d = (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    if (inv) { const q = apply3(inv, [px, py, pz]); px = q[0]; py = q[1]; pz = q[2]; }
    const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    const k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
    let v = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
    if (disp) v += disp(x, y, z, px, py, pz);
    return v;
  };
  return { d, c, R: Math.max(r[0], r[1], r[2]) + (opt.pad || 0.01) };
}
export function roundBox(c, h, rad, rot = null, opt = {}) {
  const inv = rot ? [rot[0], rot[3], rot[6], rot[1], rot[4], rot[7], rot[2], rot[5], rot[8]] : null;
  const disp = opt.disp;
  const d = (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    if (inv) { const q = apply3(inv, [px, py, pz]); px = q[0]; py = q[1]; pz = q[2]; }
    const qx = Math.abs(px) - h[0] + rad, qy = Math.abs(py) - h[1] + rad, qz = Math.abs(pz) - h[2] + rad;
    let v = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rad;
    if (disp) v += disp(x, y, z, px, py, pz);
    return v;
  };
  return { d, c, R: Math.hypot(h[0], h[1], h[2]) + (opt.pad || 0.01) };
}
export function plane(n, off) { // n·p - off（半空間で切る用）
  const d = (x, y, z) => n[0] * x + n[1] * y + n[2] * z - off;
  return { d, c: [0, 0, 0], R: 1e9 };
}

// ---- 組み立て: items = [{p: prim, op:'u'|'s'|'i', k}]
export function compose(items) {
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], p = it.p, k = it.k || 0;
      if (it.op === 'u' || !it.op) {
        const b = Math.hypot(x - p.c[0], y - p.c[1], z - p.c[2]) - p.R;
        if (b > d + k) continue;
        d = smin(d, p.d(x, y, z), k);
      } else if (it.op === 's') {
        const b = Math.hypot(x - p.c[0], y - p.c[1], z - p.c[2]) - p.R;
        if (b > k + 0.002 || d > 0.05) continue;
        d = smax(d, -p.d(x, y, z), k);
      } else if (it.op === 'i') {
        d = smax(d, p.d(x, y, z), k);
      }
    }
    return d;
  };
}

// 値ノイズ（決定的）
function hash3(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const wt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += wt * hash3(xi + dx, yi + dy, zi + dz);
  }
  return r * 2 - 1;
}
export function fbm(x, y, z, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

// ---- Surface Nets
export function polygonize(f, bmin, bmax, h, opt = {}) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const N = nx * ny * nz;
  const vals = new Float32Array(N);
  let idx = 0;
  for (let k = 0; k < nz; k++) {
    const z = bmin[2] + k * h;
    for (let j = 0; j < ny; j++) {
      const y = bmin[1] + j * h;
      for (let i = 0; i < nx; i++) vals[idx++] = f(bmin[0] + i * h, y, z);
    }
  }
  const at = (i, j, k) => vals[i + nx * (j + ny * k)];
  const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = corners[c]; cv[c] = at(i + o[0], j + o[1], k + o[2]); if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const oa = corners[a], ob = corners[b];
      sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; n++;
    }
    cell[cidx(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / n) * h, bmin[1] + (j + sy / n) * h, bmin[2] + (k + sz / n) * h);
  }
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = at(i, j, k), b = at(i + 1, j, k); if ((a < 0) === (b < 0)) continue;
    quad(cell[cidx(i, j - 1, k - 1)], cell[cidx(i, j, k - 1)], cell[cidx(i, j, k)], cell[cidx(i, j - 1, k)], a < 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = at(i, j, k), b = at(i, j + 1, k); if ((a < 0) === (b < 0)) continue;
    quad(cell[cidx(i - 1, j, k - 1)], cell[cidx(i - 1, j, k)], cell[cidx(i, j, k)], cell[cidx(i, j, k - 1)], a < 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = at(i, j, k), b = at(i, j, k + 1); if ((a < 0) === (b < 0)) continue;
    quad(cell[cidx(i - 1, j - 1, k)], cell[cidx(i, j - 1, k)], cell[cidx(i, j, k)], cell[cidx(i - 1, j, k)], a < 0);
  }
  // 面へ投影 + 法線
  const nv = pos.length / 3;
  const P = new Float32Array(pos), Nn = new Float32Array(nv * 3);
  const e = h * 0.35;
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z);
      const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      const step = clamp(d, -h * 0.5, h * 0.5);
      x -= gx / gl * step; y -= gy / gl * step; z -= gz / gl * step;
    }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    Nn[v * 3] = gx / gl; Nn[v * 3 + 1] = gy / gl; Nn[v * 3 + 2] = gz / gl;
  }
  // 向きをそろえる
  const T = new Uint32Array(tris);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const s = fx * (Nn[a * 3] + Nn[b * 3] + Nn[c * 3]) + fy * (Nn[a * 3 + 1] + Nn[b * 3 + 1] + Nn[c * 3 + 1]) + fz * (Nn[a * 3 + 2] + Nn[b * 3 + 2] + Nn[c * 3 + 2]);
    if (s < 0) { T[t + 1] = c; T[t + 2] = b; }
  }
  // AO（距離場を法線方向にたどる）
  const ao = new Float32Array(nv);
  const aoStep = opt.aoStep || h * 3;
  const aoField = opt.aoField || f;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], nx_ = Nn[v * 3], ny_ = Nn[v * 3 + 1], nz_ = Nn[v * 3 + 2];
    let occ = 0, w = 1;
    for (let s = 1; s <= 5; s++) {
      const dd = aoStep * s;
      occ += w * (dd - aoField(x + nx_ * dd, y + ny_ * dd, z + nz_ * dd)) / dd;
      w *= 0.5;
    }
    ao[v] = clamp(1 - occ * (opt.aoK || 0.9), 0.25, 1);
  }
  return { P, N: Nn, I: T, ao, nv };
}

// ---- 書き出し：1キャラ = 1ファイル（JSON ヘッダー + バイナリ）
export function writePack(file, meshes) {
  const header = { meshes: [] };
  const bufs = [];
  let off = 0;
  const pushBuf = (ta) => {
    const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength);
    const pad = (4 - (b.length % 4)) % 4;
    bufs.push(b); if (pad) bufs.push(Buffer.alloc(pad));
    const o = off; off += b.length + pad; return o;
  };
  for (const m of meshes) {
    const { P, N, I, ao, nv } = m.geo;
    const bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
    for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { bmin[c] = Math.min(bmin[c], P[v * 3 + c]); bmax[c] = Math.max(bmax[c], P[v * 3 + c]); }
    const qp = new Int16Array(nv * 3);
    for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) {
      const r = bmax[c] - bmin[c] || 1;
      qp[v * 3 + c] = Math.round(((P[v * 3 + c] - bmin[c]) / r) * 65534 - 32767);
    }
    const qn = new Int8Array(nv * 3);
    for (let i = 0; i < nv * 3; i++) qn[i] = Math.round(N[i] * 127);
    const qa = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) qa[i] = Math.round(ao[i] * 255);
    const qi = nv < 65536 ? new Uint16Array(I) : new Uint32Array(I);
    const e = { name: m.name, part: m.part, mat: m.mat, nv, ni: I.length, bmin, bmax, i32: nv >= 65536 };
    e.p = pushBuf(qp); e.n = pushBuf(qn); e.a = pushBuf(qa); e.i = pushBuf(qi);
    header.meshes.push(e);
  }
  header.parts = meshes.partsInfo || {};
  let hj = Buffer.from(JSON.stringify(header));
  const hp = (4 - ((hj.length + 4) % 4)) % 4;
  hj = Buffer.concat([hj, Buffer.alloc(hp, 32)]);
  const lenb = Buffer.alloc(4); lenb.writeUInt32LE(hj.length);
  fs.writeFileSync(file, Buffer.concat([lenb, hj, ...bufs]));
  return fs.statSync(file).size;
}
