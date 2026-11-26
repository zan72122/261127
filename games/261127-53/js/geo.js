// Geometry helpers: profiled tubes (limbs, torso, hose), rounded boxes, corrugated walls.
import * as THREE from '../lib/three.module.min.js';

const V = THREE.Vector3;

// Tube along a path. opts:
//  path: array of Vector3 (>=2) (polyline, will be smoothed by catmull-rom if smooth)
//  radius(t, a) -> [rx, ry] or number ; a = angle
//  radial, segs, caps, uvScale [u meters per repeat ignored; we give meters], disp(t,a)->dr
export function tube(opts) {
  const radial = opts.radial ?? 16, segs = opts.segs ?? 16;
  const curve = opts.curve || new THREE.CatmullRomCurve3(opts.path, false, 'centripetal');
  const geo = new THREE.BufferGeometry();
  const nv = (segs + 1) * (radial + 1) + (opts.caps ? 2 * (radial + 2) : 0);
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = [];
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.userData = { curve, radial, segs, opts };
  // indices
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  // material groups (e.g. reflective bands): opts.bands = [[t0, t1], ...] -> group 1
  if (opts.bands) {
    const tri = radial * 6;
    const inBand = (i) => opts.bands.some(([t0, t1]) => (i + 0.5) / segs >= t0 && (i + 0.5) / segs <= t1);
    let start = 0, cur = inBand(0) ? 1 : 0;
    for (let i = 1; i <= segs; i++) {
      const m = i < segs ? (inBand(i) ? 1 : 0) : -1;
      if (m !== cur) { geo.addGroup(start * tri, (i - start) * tri, cur); start = i; cur = m; }
    }
    if (opts.caps) geo.addGroup(segs * tri, radial * 6, 0);
  }
  if (opts.caps) {
    const base = (segs + 1) * (radial + 1);
    for (let c = 0; c < 2; c++) {
      const o = base + c * (radial + 2);
      for (let j = 0; j < radial; j++) {
        if (c === 0) idx.push(o, o + 1 + j, o + 2 + j); else idx.push(o, o + 2 + j, o + 1 + j);
      }
    }
  }
  geo.setIndex(idx);
  updateTube(geo, opts.path);
  return geo;
}

const _t = new V(), _n = new V(), _b = new V(), _p = new V(), _tmp = new V();
export function updateTube(geo, path) {
  const { radial, segs, opts } = geo.userData;
  let curve = geo.userData.curve;
  if (path && curve.points) { curve.points = path; curve.needsUpdate = true; }
  const pos = geo.attributes.position.array, uv = geo.attributes.uv.array;
  const L = curve.getLength();
  // parallel transport frames
  let prevN = null;
  const ringC = [], ringN = [], ringB = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const tg = curve.getTangentAt(t).normalize();
    let n;
    if (!prevN) {
      let up = opts.up || (Math.abs(tg.y) < 0.9 ? new V(0, 1, 0) : new V(1, 0, 0));
      if (Math.abs(up.dot(tg)) > 0.98) up = Math.abs(tg.x) < 0.9 ? new V(1, 0, 0) : new V(0, 0, 1);
      n = up.clone().sub(_tmp.copy(tg).multiplyScalar(up.dot(tg))).normalize();
    } else {
      n = prevN.clone().sub(_tmp.copy(tg).multiplyScalar(prevN.dot(tg))).normalize();
    }
    const b = new V().crossVectors(tg, n).normalize();
    prevN = n;
    ringC.push(p); ringN.push(n); ringB.push(b);
  }
  const rf = opts.radius;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = ringC[i], n = ringN[i], b = ringB[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      let r = typeof rf === 'function' ? rf(t, a) : rf;
      let rx, ry;
      if (Array.isArray(r)) { rx = r[0]; ry = r[1]; } else { rx = ry = r; }
      let d = opts.disp ? opts.disp(t, a) : 0;
      const ca = Math.cos(a), sa = Math.sin(a);
      const k = (i * (radial + 1) + j);
      pos[k * 3] = p.x + (n.x * ca * (rx + d) + b.x * sa * (ry + d));
      pos[k * 3 + 1] = p.y + (n.y * ca * (rx + d) + b.y * sa * (ry + d));
      pos[k * 3 + 2] = p.z + (n.z * ca * (rx + d) + b.z * sa * (ry + d));
      const circ = Math.PI * (rx + ry);
      uv[k * 2] = (j / radial) * circ * (opts.uScale ?? 1);
      uv[k * 2 + 1] = t * L * (opts.vScale ?? 1);
    }
  }
  if (opts.caps) {
    const base = (segs + 1) * (radial + 1);
    for (let c = 0; c < 2; c++) {
      const ri = c === 0 ? 0 : segs;
      const o = base + c * (radial + 2);
      const p = ringC[ri];
      const tg = curve.getTangentAt(c === 0 ? 0 : 1);
      const bulge = opts.capBulge ?? 0.6;
      const rr = (typeof rf === 'function' ? rf(c, 0) : rf);
      const rr0 = Array.isArray(rr) ? (rr[0] + rr[1]) / 2 : rr;
      pos[o * 3] = p.x + tg.x * rr0 * bulge * (c ? 1 : -1);
      pos[o * 3 + 1] = p.y + tg.y * rr0 * bulge * (c ? 1 : -1);
      pos[o * 3 + 2] = p.z + tg.z * rr0 * bulge * (c ? 1 : -1);
      uv[o * 2] = 0.5; uv[o * 2 + 1] = 0.5;
      for (let j = 0; j <= radial; j++) {
        const s = ri * (radial + 1) + j;
        pos[(o + 1 + j) * 3] = pos[s * 3]; pos[(o + 1 + j) * 3 + 1] = pos[s * 3 + 1]; pos[(o + 1 + j) * 3 + 2] = pos[s * 3 + 2];
        uv[(o + 1 + j) * 2] = uv[s * 2]; uv[(o + 1 + j) * 2 + 1] = uv[s * 2 + 1];
      }
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.uv.needsUpdate = true;
  geo.computeVertexNormals();
  fixSeam(geo, radial, segs);
  geo.computeBoundingSphere();
}

function fixSeam(geo, radial, segs) {
  const nr = geo.attributes.normal.array;
  for (let i = 0; i <= segs; i++) {
    const a = i * (radial + 1), b = a + radial;
    for (let c = 0; c < 3; c++) {
      const v = (nr[a * 3 + c] + nr[b * 3 + c]) * 0.5;
      nr[a * 3 + c] = v; nr[b * 3 + c] = v;
    }
  }
  geo.attributes.normal.needsUpdate = true;
}

// straight limb along +Y from 0..len with radius profile r0->r1 (elliptical), bulge in middle
export function limb(len, r0, r1, o = {}) {
  const pts = [];
  const n = 4;
  for (let i = 0; i <= n; i++) pts.push(new V(0, (i / n) * len, 0));
  return tube({
    path: pts, radial: o.radial ?? 14, segs: o.segs ?? 10, caps: o.caps ?? true, capBulge: o.capBulge ?? 0.8,
    up: new V(0, 0, 1),
    radius: (t, a) => {
      let r = r0 + (r1 - r0) * t;
      r *= 1 + (o.bulge ?? 0.08) * Math.sin(Math.PI * t);
      const fl = o.flat ?? 1;
      return [r, r * fl];
    },
    disp: o.disp,
  });
}

// Rounded box (all edges rounded by r), uv in meters per face
export function roundedBox(w, h, d, r, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.ceil(w / 0.1)), Math.max(2, Math.ceil(h / 0.1)), Math.max(2, Math.ceil(d / 0.1)));
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new V(), c = new V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const dir = v.clone().sub(c);
    if (dir.lengthSq() < 1e-12) continue;
    dir.normalize();
    v.copy(c).addScaledVector(dir, r);
    p.setXYZ(i, v.x, v.y, v.z);
    n.setXYZ(i, dir.x, dir.y, dir.z);
  }
  // metric uv per face
  const nn = new V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
    const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    if (ax >= ay && ax >= az) uv.setXY(i, v.z, v.y);
    else if (ay >= az) uv.setXY(i, v.x, v.z);
    else uv.setXY(i, v.x, v.y);
  }
  g.computeVertexNormals();
  return g;
}

// metric UVs on any geometry (box projection)
export function boxUV(g, s = 1) {
  const p = g.attributes.position; const n = g.attributes.normal;
  const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax >= ay && ax >= az) uv.setXY(i, z * s, y * s); else if (ay >= az) uv.setXY(i, x * s, z * s); else uv.setXY(i, x * s, y * s);
  }
  g.setAttribute('uv', uv);
  return g;
}

// corrugated wall panel in XY plane (normal +Z), covering x0..x1, y0..y1. paint uv (puv) = (x-X0)/W,(y-Y0)/H
export function corrugated(x0, x1, y0, y1, o = {}) {
  const per = o.period ?? 0.28, depth = o.depth ?? 0.05;
  const nx = Math.max(2, Math.ceil((x1 - x0) / per * 8)), ny = Math.max(1, Math.ceil((y1 - y0) / 0.5));
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, nx, ny);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  const puv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // trapezoid-ish corrugation
    const ph = ((x / per) % 1 + 1) % 1;
    const s = Math.max(-1, Math.min(1, Math.sin(ph * Math.PI * 2) * 2.2));
    p.setZ(i, s * depth * 0.5);
    uv.setXY(i, x, y);
    puv[i * 2] = (x - (o.X0 ?? x0)) / (o.W ?? (x1 - x0));
    puv[i * 2 + 1] = (y - (o.Y0 ?? y0)) / (o.H ?? (y1 - y0));
  }
  g.setAttribute('puv', new THREE.BufferAttribute(puv, 2));
  g.computeVertexNormals();
  return g;
}

// split rect W x H into pieces around rectangular openings [{x0,x1,y0,y1}]
export function wallPieces(X0, X1, Y0, Y1, holes) {
  const xs = [X0, X1];
  holes.forEach((h) => { xs.push(h.x0, h.x1); });
  const ux = [...new Set(xs)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < ux.length - 1; i++) {
    const a = ux[i], b = ux[i + 1];
    if (b - a < 1e-4) continue;
    const mid = (a + b) / 2;
    const hs = holes.filter((h) => h.x0 < mid && h.x1 > mid).sort((p, q) => p.y0 - q.y0);
    let y = Y0;
    hs.forEach((h) => { if (h.y0 > y) out.push([a, b, y, h.y0]); y = Math.max(y, h.y1); });
    if (y < Y1) out.push([a, b, y, Y1]);
  }
  return out;
}

export function merge(geos) {
  // minimal merge (same attributes: position, normal, uv[, puv])
  let count = 0, icount = 0;
  const hasP = geos.every((g) => g.attributes.puv);
  geos.forEach((g) => { count += g.attributes.position.count; icount += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2), puv = hasP ? new Float32Array(count * 2) : null;
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  geos.forEach((g) => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    if (hasP) puv.set(g.attributes.puv.array, vo * 2);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; } else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (hasP) g.setAttribute('puv', new THREE.BufferAttribute(puv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// apply a matrix to a geometry (non-indexed safe), returns g
export function xf(g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(new V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new V(...s));
  g.applyMatrix4(m);
  return g;
}

export function ensureNonIndexedAttrs(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) boxUV(g);
  return g;
}
