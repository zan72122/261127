// Geometry helpers
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  geo.applyMatrix4(m);
  return geo;
}

export function rbox(w, h, d, r = 0.004, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
}

export function lathe(profile, seg = 32, phiStart = 0, phiLen = Math.PI * 2) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  return new THREE.LatheGeometry(pts, seg, phiStart, phiLen);
}

export function ell(rx, ry, rz, ws = 24, hs = 16) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

export function cyl(rt, rb, h, seg = 20, open = false) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
}

export function merge(list) {
  const norm = list.map(g => {
    let q = g.index ? g.toNonIndexed() : g;
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    if (!q.attributes.normal) q.computeVertexNormals();
    for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') q.deleteAttribute(k);
    return q;
  });
  return mergeGeometries(norm, false);
}

// tapered tube along a curve with elliptical cross-section; used for hair locks, handles, spouts.
// radius(t) -> [rx, ry]; rx along curve binormal (width), ry along normal (thickness)
export function taperTube(points, radius, opts = {}) {
  const curve = points.getPointAt ? points : new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const segs = opts.segs || 16, rad = opts.radial || 8;
  const frames = curve.computeFrenetFrames(segs, false);
  const up = opts.up || null;
  const pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), T = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    T.copy(frames.tangents[i]);
    const upv = opts.upFn ? opts.upFn(t, P) : up;
    if (upv) { B.crossVectors(T, upv).normalize(); N.crossVectors(B, T).normalize(); }
    else { N.copy(frames.normals[i]); B.copy(frames.binormals[i]); }
    const [rx, ry] = radius(t);
    for (let j = 0; j <= rad; j++) {
      const a = j / rad * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const ox = B.x * ca * rx + N.x * sa * ry, oy = B.y * ca * rx + N.y * sa * ry, oz = B.z * ca * rx + N.z * sa * ry;
      pos.push(P.x + ox, P.y + oy, P.z + oz);
      const nx = B.x * ca * ry + N.x * sa * rx, ny = B.y * ca * ry + N.y * sa * rx, nz = B.z * ca * ry + N.z * sa * rx;
      const l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l);
      uv.push(j / rad, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // caps
  if (opts.cap !== false) {
    for (const end of [0, segs]) {
      const c0 = pos.length / 3; const t = end / segs; curve.getPointAt(t, P);
      const tn = frames.tangents[end].clone().multiplyScalar(end === 0 ? -1 : 1);
      pos.push(P.x, P.y, P.z); nor.push(tn.x, tn.y, tn.z); uv.push(0.5, t);
      const base = end * (rad + 1);
      for (let j = 0; j < rad; j++) { if (end === 0) idx.push(c0, base + j + 1, base + j); else idx.push(c0, base + j, base + j + 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// planar front UV projection (for faces / decals). Back-facing vertices -> corner uv.
export function planarUV(geo, cx, cy, size, zMin = -1e9, corner = [0.02, 0.02]) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z < zMin) { uv[i * 2] = corner[0]; uv[i * 2 + 1] = corner[1]; }
    else { uv[i * 2] = 0.5 + (x - cx) / size; uv[i * 2 + 1] = 0.5 + (y - cy) / size; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// soft curve helper
export function curve(pts) { return new THREE.CatmullRomCurve3(pts.map(p => Array.isArray(p) ? new THREE.Vector3(...p) : p), false, 'catmullrom', 0.5); }

// rounded flat disc (plates, cookies)
export function disc(r, h, seg = 32, bevel = 0.3) {
  const b = h * bevel;
  return lathe([[0, 0], [r - b, 0], [r, b], [r, h - b], [r - b, h], [0, h]], seg);
}
