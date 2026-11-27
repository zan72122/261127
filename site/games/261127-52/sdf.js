// Signed-distance modelling + naive surface nets.
// People (hands, arms, the girl's body) are modelled as smooth unions of
// tapered limbs so they read as soft organic forms instead of capsules.
import * as THREE from './lib/three.module.min.js';

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

// tapered capsule from a to b with radii r1 -> r2 (a,b are [x,y,z])
export function cone(px, py, pz, a, b, r1, r2) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const bb = bx * bx + by * by + bz * bz;
  let t = (qx * bx + qy * by + qz * bz) / bb;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = qx - bx * t, dy = qy - by * t, dz = qz - bz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * t);
}
// ellipsoid (iq approximation) centred at c with radii r
export function ellip(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = x / r[0], y2 = y / r[1], z2 = z / r[2];
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
}
export function sphere(px, py, pz, c, r) {
  const dx = px - c[0], dy = py - c[1], dz = pz - c[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}
export function rbox(px, py, pz, c, h, r) {
  const qx = Math.abs(px - c[0]) - h[0] + r, qy = Math.abs(py - c[1]) - h[1] + r, qz = Math.abs(pz - c[2]) - h[2] + r;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// Naive surface nets.  f(x,y,z) -> signed distance (negative inside).
// opts.color(x,y,z,out) optional vertex colour; opts.uv(x,y,z,n,out) optional uv.
export function surfaceNets(f, bmin, bmax, step, opts = {}) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / step) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1]) / step) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2]) / step) + 1;
  const g = new Float32Array(nx * ny * nz);
  // coarse pre-pass: skip blocks that are far from the surface
  const B = 4, cs = step * B;
  const cx = Math.ceil(nx / B) + 1, cy = Math.ceil(ny / B) + 1, cz = Math.ceil(nz / B) + 1;
  const cg = new Float32Array(cx * cy * cz);
  let p = 0;
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
    cg[p++] = f(bmin[0] + (i + 0.5) * cs - step * 0.5, bmin[1] + (j + 0.5) * cs - step * 0.5, bmin[2] + (k + 0.5) * cs - step * 0.5);
  const far = cs * 1.2;
  p = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = cg[((i / B) | 0) + cx * (((j / B) | 0) + cy * ((k / B) | 0))];
    g[p++] = Math.abs(c) > far ? c : f(bmin[0] + i * step, bmin[1] + j * step, bmin[2] + k * step);
  }
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const vmap = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const cc = corner[c];
      v[c] = g[idx(i + cc[0], j + cc[1], k + cc[2])];
      if (v[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      const A = corner[a], B = corner[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; cnt++;
    }
    vmap[cidx(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / cnt) * step, bmin[1] + (j + sy / cnt) * step, bmin[2] + (k + sz / cnt) * step);
  }
  const ind = [];
  const quad = (c0, c1, c2, c3) => {
    const a = vmap[c0], b = vmap[c1], c = vmap[c2], d = vmap[c3];
    if (a >= 0 && b >= 0 && c >= 0 && d >= 0) ind.push(a, b, c, a, c, d);
  };
  const sx1 = nx - 1, sxy1 = (nx - 1) * (ny - 1);
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) {
    const row = nx * (j + ny * k);
    for (let i = 1; i < nx - 1; i++) {
      const a0 = g[row + i] < 0;
      const c = i + sx1 * j + sxy1 * k;
      if ((g[row + i + 1] < 0) !== a0) quad(c - sx1 - sxy1, c - sxy1, c, c - sx1);
      if ((g[row + i + nx] < 0) !== a0) quad(c - 1 - sxy1, c - 1, c, c - sxy1);
      if ((g[row + i + nx * ny] < 0) !== a0) quad(c - 1 - sx1, c - sx1, c, c - 1);
    }
  }
  const n = pos.length / 3;
  const nor = new Float32Array(n * 3);
  const e = step * 0.5;
  const col = opts.color ? new Float32Array(n * 3) : null;
  const uv = opts.uv ? new Float32Array(n * 2) : null;
  const tmp = [0, 0, 0];
  for (let q = 0; q < n; q++) {
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z);
    let gy = f(x, y + e, z) - f(x, y - e, z);
    let gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l; gy /= l; gz /= l;
    nor[q * 3] = gx; nor[q * 3 + 1] = gy; nor[q * 3 + 2] = gz;
    if (col) { opts.color(x, y, z, tmp); col[q * 3] = tmp[0]; col[q * 3 + 1] = tmp[1]; col[q * 3 + 2] = tmp[2]; }
    if (uv) { opts.uv(x, y, z, gx, gy, gz, tmp); uv[q * 2] = tmp[0]; uv[q * 2 + 1] = tmp[1]; }
  }
  // flip winding check: our quads may be oriented either way; fix by comparing with normals
  const P = new Float32Array(pos);
  for (let t = 0; t < ind.length; t += 3) {
    const a = ind[t], b = ind[t + 1], c = ind[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const d = cx * (nor[a * 3] + nor[b * 3] + nor[c * 3]) + cy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) + cz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]);
    if (d < 0) { ind[t + 1] = c; ind[t + 2] = b; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
  geo.computeBoundingSphere();
  return geo;
}

// ------------------------------------------------------------------ hands
// Local frame: wrist at origin, fingers toward +x, back of hand +y, thumb at -z
// (a right hand, palm down).  Units metres.  s = overall scale (child 1, adult 1.4)
const FINGERS = [
  // knuckle z offset, lengths of 3 phalanges, base radius, splay
  { z: -0.0165, L: [0.021, 0.013, 0.011], r: 0.0062, sp: -0.10 }, // index
  { z: -0.0055, L: [0.023, 0.015, 0.012], r: 0.0064, sp: -0.02 }, // middle
  { z: 0.0055, L: [0.021, 0.014, 0.011], r: 0.0060, sp: 0.05 },   // ring
  { z: 0.0155, L: [0.016, 0.011, 0.010], r: 0.0052, sp: 0.14 },   // little
];
// curl angles per finger [proximal, middle, distal] (radians) per pose
export const POSES = {
  point: { f: [[0.05, 0.05, 0.05], [1.3, 1.5, 0.9], [1.35, 1.5, 0.9], [1.4, 1.5, 0.9]], th: [0.55, 0.5, 0.4], thOut: 0.25 },
  relax: { f: [[0.25, 0.3, 0.2], [0.3, 0.35, 0.25], [0.35, 0.4, 0.25], [0.4, 0.45, 0.3]], th: [0.2, 0.15, 0.1], thOut: 0.55 },
  pinch: { f: [[0.55, 0.5, 0.35], [0.8, 0.9, 0.6], [1.1, 1.2, 0.8], [1.2, 1.3, 0.8]], th: [0.55, 0.3, 0.25], thOut: 0.35 },
  grip: { f: [[1.0, 1.25, 0.75], [1.05, 1.3, 0.8], [1.1, 1.3, 0.8], [1.15, 1.3, 0.8]], th: [0.75, 0.45, 0.35], thOut: 0.3 },
  flat: { f: [[0.06, 0.08, 0.05], [0.04, 0.08, 0.05], [0.06, 0.1, 0.06], [0.1, 0.12, 0.08]], th: [0.1, 0.05, 0.05], thOut: 0.7 },
};

function rotY(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }

export function handSkeleton(pose, s = 1) {
  const P = POSES[pose];
  const segs = []; // [a,b,r1,r2]
  const tips = [];
  FINGERS.forEach((F, fi) => {
    let p = [0.052 * s, 0.002 * s, F.z * s];
    if (fi === 0) p[0] -= 0.001 * s; if (fi === 3) p[0] -= 0.006 * s;
    let ang = 0;
    let r = F.r * s;
    for (let k = 0; k < 3; k++) {
      ang += P.f[fi][k];
      let d = [Math.cos(ang), -Math.sin(ang), 0];
      d = rotY(d, F.sp);
      const L = F.L[k] * s;
      const q = [p[0] + d[0] * L, p[1] + d[1] * L, p[2] + d[2] * L];
      const r2 = r * (k === 2 ? 0.8 : 0.9);
      segs.push([p, q, r, r2, k === 2 ? 'tip' : 'ph', fi]);
      p = q; r = r2;
    }
    tips.push(p);
  });
  // thumb: base near wrist on the -z side, below the palm plane
  let p = [0.012 * s, -0.006 * s, -0.020 * s];
  let dir = [0.62, -0.25, -0.74];
  const out = P.thOut;
  dir = rotY(dir, -out * 0.6);
  const TL = [0.022, 0.017, 0.014];
  let r = 0.0085 * s;
  for (let k = 0; k < 3; k++) {
    // curl the thumb toward the palm (+z, -y)
    const a = P.th[k];
    dir = rotY(dir, -a * 0.9);
    dir = [dir[0], dir[1] - a * 0.25, dir[2]];
    const l = Math.hypot(...dir); dir = dir.map(x => x / l);
    const L = TL[k] * s;
    const q = [p[0] + dir[0] * L, p[1] + dir[1] * L, p[2] + dir[2] * L];
    const r2 = r * (k === 0 ? 0.82 : 0.85);
    segs.push([p, q, r, r2, k === 2 ? 'tip' : 'th', 4]);
    p = q; r = r2;
  }
  tips.push(p);
  return { segs, tips };
}

// SDF of hand + forearm.  forearm runs from wrist (0,0,0) back to x=-fl
export function handSDF(pose, s = 1, fl = 0.2) {
  const { segs, tips } = handSkeleton(pose, s);
  const curl = POSES[pose].f[1][0];
  const f = (x, y, z) => {
    // palm: flattened rounded block, slightly cupped
    let d = rbox(x, y + 0.001 * s + 0.004 * s * Math.min(1, curl), z, [0.028 * s, 0, 0.0], [0.026 * s, 0.0105 * s, 0.024 * s], 0.009 * s);
    // thenar eminence (thumb muscle)
    d = smin(d, ellip(x, y, z, [0.022 * s, -0.004 * s, -0.016 * s], [0.02 * s, 0.011 * s, 0.011 * s]), 0.01 * s);
    // wrist + forearm (elliptical cross-section: wider in z than y)
    const fy = y * 1.25;
    d = smin(d, cone(x, fy, z, [0.004 * s, 0, 0], [-fl * s, 0.004 * s, 0], 0.0175 * s, 0.024 * s), 0.016 * s);
    // forearm muscle belly
    d = smin(d, ellip(x, y, z, [-0.14 * s, 0.004 * s, 0.002 * s], [0.08 * s, 0.019 * s, 0.025 * s]), 0.025 * s);
    // knuckles
    for (const kz of [-0.0165, -0.0055, 0.0055, 0.0155]) d = smin(d, sphere(x, y, z, [0.051 * s, 0.007 * s, kz * s], 0.0062 * s), 0.004 * s);
    for (const [a, b, r1, r2] of segs) d = smin(d, cone(x, y, z, a, b, r1, r2), 0.0045 * s);
    return d;
  };
  return { f, tips, segs };
}

export function buildHandGeometry(pose, s, tone, step = 0.0024) {
  const fl = 0.2;
  const { f, tips, segs } = handSDF(pose, s, fl);
  const lo = [-fl * s - 0.03 * s, -0.07 * s, -0.075 * s], hi = [0.12 * s, 0.05 * s, 0.06 * s];
  // nails: near each finger tip on the dorsal side
  const nailPts = segs.filter(sg => sg[4] === 'tip').map(sg => {
    const [a, b] = sg; const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    return { a, b, d };
  });
  const base = tone; // [r,g,b] linear skin colour
  const geo = surfaceNets(f, lo, hi, step * s, {
    color: (x, y, z, out) => {
      let r = base[0], g = base[1], b = base[2];
      // redder knuckles / fingertips, paler palm
      let tipK = 0;
      for (const n of nailPts) {
        const dx = x - n.b[0], dy = y - n.b[1], dz = z - n.b[2];
        const dist = Math.hypot(dx, dy, dz);
        tipK = Math.max(tipK, Math.max(0, 1 - dist / (0.012 * s)));
        // nail plate: dorsal side of the distal phalanx, near the tip
        const L = Math.hypot(...n.d);
        const t = ((x - n.a[0]) * n.d[0] + (y - n.a[1]) * n.d[1] + (z - n.a[2]) * n.d[2]) / (L * L);
        if (t > 0.3 && t < 1.05) {
          // dorsal = direction perpendicular to d, toward +y-ish
          const px = n.a[0] + n.d[0] * t, py = n.a[1] + n.d[1] * t, pz = n.a[2] + n.d[2] * t;
          let ox = x - px, oy = y - py, oz = z - pz;
          const ol = Math.hypot(ox, oy, oz) || 1;
          // dorsal normal of the phalanx
          let ux = -n.d[1], uy = n.d[0], uz = 0; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
          const dot = (ox * ux + oy * uy + oz * uz) / ol;
          if (dot > 0.55) { const k = Math.min(1, (dot - 0.55) * 4); r = r + (0.95 - r) * 0.55 * k; g = g + (0.72 - g) * 0.55 * k; b = b + (0.66 - b) * 0.55 * k; }
        }
      }
      const palm = y < -0.004 * s && x > -0.01 * s ? 1 : 0;
      r += 0.05 * tipK; g -= 0.03 * tipK; b -= 0.02 * tipK;
      r += 0.02 * palm; g += 0.01 * palm; b += 0.01 * palm;
      // slight vein/blue tint inside wrist
      if (x < -0.01 * s && x > -0.07 * s && y < -0.01 * s) { b += 0.015; r -= 0.01; }
      out[0] = r; out[1] = g; out[2] = b;
    },
    uv: (x, y, z, nx, ny, nz, out) => { out[0] = x * 18; out[1] = (Math.atan2(z, y) / 6.283 * 0.17) * 18; },
  });
  return { geo, tips };
}
