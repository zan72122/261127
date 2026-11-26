// Pure SDF modelling + surface nets (no three.js) so it runs in the browser and in the offline baker.
export const v3 = (x, y, z) => [x, y, z];
export function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export function smax(a, b, k) { return -smin(-a, -b, k); }
// round cone between a(radius ra) and b(radius rb)
export function roundCone(px, py, pz, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  let t = (pax * bax + pay * bay + paz * baz) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = pax - bax * t, cy = pay - bay * t, cz = paz - baz * t;
  return Math.sqrt(cx * cx + cy * cy + cz * cz) - (ra + (rb - ra) * t);
}
export function ellipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = x / r[0], y2 = y / r[1], z2 = z / r[2];
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
}
export function roundBox(px, py, pz, c, h, r) {
  const qx = Math.abs(px - c[0]) - h[0] + r, qy = Math.abs(py - c[1]) - h[1] + r, qz = Math.abs(pz - c[2]) - h[2] + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
// cheap 3D value noise
function h3(x, y, z) { let n = x * 374761393 + y * 668265263 + z * 1274126177; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) & 0xffff) / 0xffff; }
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
}

// Surface nets. sdf(x,y,z) -> distance. attr(x,y,z) -> {color:[r,g,b], mat:int, rough:float, bones?:[[idx,w],...]}
export function surfaceNets(sdf, bmin, bmax, step, attr) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / step) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / step) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / step) + 1;
  const f = new Float32Array(nx * ny * nz);
  const idx = (x, y, z) => (z * ny + y) * nx + x;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++)
    f[idx(x, y, z)] = sdf(bmin[0] + x * step, bmin[1] + y * step, bmin[2] + z * step);
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const k = corners[c]; cv[c] = f[idx(x + k[0], y + k[1], z + k[2])]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const ka = corners[a], kb = corners[b];
      sx += ka[0] + (kb[0] - ka[0]) * t; sy += ka[1] + (kb[1] - ka[1]) * t; sz += ka[2] + (kb[2] - ka[2]) * t; n++;
    }
    vid[idx(x, y, z)] = pos.length / 3;
    pos.push(bmin[0] + (x + sx / n) * step, bmin[1] + (y + sy / n) * step, bmin[2] + (z + sz / n) * step);
  }
  const ind = [];
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const v0 = f[idx(x, y, z)] < 0;
    // x edge
    if (x < nx - 1 && v0 !== (f[idx(x + 1, y, z)] < 0)) {
      const a = vid[idx(x, y - 1, z - 1)], b = vid[idx(x, y, z - 1)], c = vid[idx(x, y, z)], d = vid[idx(x, y - 1, z)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? ind.push(a, b, c, a, c, d) : ind.push(a, c, b, a, d, c);
    }
    if (y < ny - 1 && v0 !== (f[idx(x, y + 1, z)] < 0)) {
      const a = vid[idx(x - 1, y, z - 1)], b = vid[idx(x, y, z - 1)], c = vid[idx(x, y, z)], d = vid[idx(x - 1, y, z)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? ind.push(a, c, b, a, d, c) : ind.push(a, b, c, a, c, d);
    }
    if (z < nz - 1 && v0 !== (f[idx(x, y, z + 1)] < 0)) {
      const a = vid[idx(x - 1, y - 1, z)], b = vid[idx(x, y - 1, z)], c = vid[idx(x, y, z)], d = vid[idx(x - 1, y, z)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? ind.push(a, b, c, a, c, d) : ind.push(a, c, b, a, d, c);
    }
  }
  const N = pos.length / 3;
  const nor = new Float32Array(N * 3), col = new Float32Array(N * 3), mat = new Float32Array(N), rough = new Float32Array(N);
  const e = step * 0.5;
  let skinI = null, skinW = null;
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nor[i * 3] = gx / l; nor[i * 3 + 1] = gy / l; nor[i * 3 + 2] = gz / l;
    const a = attr(x, y, z);
    col[i * 3] = a.color[0]; col[i * 3 + 1] = a.color[1]; col[i * 3 + 2] = a.color[2];
    mat[i] = a.mat; rough[i] = a.rough;
    if (a.bones) {
      if (!skinI) { skinI = new Uint16Array(N * 4); skinW = new Float32Array(N * 4); }
      for (let k = 0; k < 4; k++) { const b = a.bones[k]; skinI[i * 4 + k] = b ? b[0] : 0; skinW[i * 4 + k] = b ? b[1] : 0; }
    }
  }
  return { pos: new Float32Array(pos), nor, col, mat, rough, skinI, skinW, ind: new Uint32Array(ind) };
}

