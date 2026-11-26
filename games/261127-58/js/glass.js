// glass.js — the molten -> cold glass piece: vertex sculpting (blow / pull),
// frit painting into a texture, per-vertex heat with black-body glow,
// quench crackle, seed bubbles, and a "sun caster" for coloured light.
import * as THREE from './three.module.min.js';
import { loadTex, clamp, sstep } from './core.js';

let crackleTex = null;
function crackle() {
  if (!crackleTex) { crackleTex = loadTex('crackle_c.jpg', false, [3, 1.5]); }
  return crackleTex;
}

const SEG_W = 72, SEG_H = 54;
const PW = 256, PH = 128;

export function blackbody(t, out = new THREE.Color()) {
  // t: 0 (cold) .. 1 (~1150°C working heat). returns linear emission colour (HDR)
  if (t < 0.1) return out.setRGB(0, 0, 0);
  const k = clamp((t - 0.1) / 0.9, 0, 1);
  const r = 1.0, g = 0.025 + 0.3 * Math.pow(k, 1.7), b = 0.003 + 0.03 * Math.pow(k, 3);
  const I = 0.065 * Math.pow(15, k) * sstep(0.1, 0.25, t);
  return out.setRGB(r * I, g * I, b * I);
}

export class Glass {
  constructor({ tint = new THREE.Color(0.82, 0.95, 0.95), seed = 1, R0 = 0.034 } = {}) {
    this.R0 = R0; this.seed = seed;
    const g = new THREE.SphereGeometry(R0, SEG_W, SEG_H);
    this.geo = g;
    const P = g.attributes.position;
    this.n = P.count;
    this.theta = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const y = P.getY(i) / R0; this.theta[i] = Math.acos(clamp(y, -1, 1));
    }
    // small flattening so a fresh gather looks like a slightly sagging drop
    for (let i = 0; i < this.n; i++) P.setY(i, P.getY(i) * 1.08 - R0 * 0.08);
    this.heat = new Float32Array(this.n).fill(1);
    this.crack = new Float32Array(this.n).fill(0);
    g.setAttribute('heat', new THREE.BufferAttribute(this.heat, 1));
    g.setAttribute('crack', new THREE.BufferAttribute(this.crack, 1));
    // seam / pole duplicate groups so normals stay smooth after sculpting
    const map = new Map(); this.dups = [];
    for (let i = 0; i < this.n; i++) {
      const k = `${Math.round(P.getX(i) * 1e5)},${Math.round(P.getY(i) * 1e5)},${Math.round(P.getZ(i) * 1e5)}`;
      if (!map.has(k)) map.set(k, []); map.get(k).push(i);
    }
    for (const a of map.values()) if (a.length > 1) this.dups.push(a);
    // paint texture (frit colour) — white = clear
    this.paintData = new Uint8Array(PW * PH * 4).fill(255);
    this.paint = new THREE.DataTexture(this.paintData, PW, PH, THREE.RGBAFormat);
    this.paint.colorSpace = THREE.SRGBColorSpace; this.paint.wrapS = THREE.RepeatWrapping;
    this.paint.magFilter = THREE.LinearFilter; this.paint.minFilter = THREE.LinearFilter; this.paint.needsUpdate = true;
    this.tint = tint.clone();
    const m = new THREE.MeshPhysicalMaterial({
      color: this.tint, metalness: 0, roughness: 0.035, transmission: 1, thickness: 0.03, ior: 1.5,
      attenuationColor: this.tint.clone().lerp(new THREE.Color(1, 1, 1), 0.15), attenuationDistance: 0.09,
      specularIntensity: 1, envMapIntensity: 1.25, map: this.paint, bumpMap: crackle(), bumpScale: 3.0,
      iridescence: 0, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520], side: THREE.DoubleSide,
      emissive: 0xffffff
    });
    this.uni = { emisK: { value: 1 }, hotDark: { value: 1 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float heat; attribute float crack; varying float vHeat; varying float vCrack;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = heat; vCrack = crack;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float emisK; uniform float hotDark; varying float vHeat; varying float vCrack;
vec3 bb(float t){ if (t < 0.1) return vec3(0.0); float k = clamp((t - 0.1) / 0.9, 0.0, 1.0);
  vec3 c = vec3(1.0, 0.025 + 0.3 * pow(k, 1.7), 0.003 + 0.03 * pow(k, 3.0));
  return c * 0.065 * pow(15.0, k) * smoothstep(0.1, 0.25, t); }`)
        .replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment.replaceAll('bumpScale *', 'bumpScale * vCrack *'))
        .replace('#include <map_fragment>', `#include <map_fragment>
  float crl = texture2D(bumpMap, vBumpMapUv).r * vCrack;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), crl * 0.55);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.32, 0.1, 0.03), smoothstep(0.18, 0.6, vHeat) * hotDark);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float nv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  vec3 pc = texture2D(map, vMapUv).rgb; float pamt = 1.0 - min(pc.r, min(pc.g, pc.b));
  // molten glass swirls: slow luminance streaks inside the gather
  vec2 sw = vMapUv * vec2(6.2832, 3.1416);
  float swirl = 0.88 + 0.12 * sin(sw.x * 3.0 + sin(sw.y * 4.0) * 2.0) * sin(sw.y * 5.0 + sw.x);
  totalEmissiveRadiance = bb(vHeat) * emisK * mix(0.5, 1.15, nv * nv) * swirl * mix(vec3(1.0), vec3(0.3) + pc * 0.45, pamt);`)
        .replace('#include <transmission_fragment>', THREE.ShaderChunk.transmission_fragment.replace('material.transmission = transmission;',
          'material.transmission = transmission * (1.0 - smoothstep(0.12, 0.55, vHeat) * 0.9 * hotDark) * (1.0 - crl * 0.4);'));
    };
    m.customProgramCacheKey = () => 'glass';
    this.mat = m;
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    // seed bubbles: opaque mirror specks seen through refraction
    const rnd = mulberry(seed * 977 + 3);
    this.bub = [];
    const nb = 10 + Math.floor(rnd() * 10);
    const bm = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.18, envMapIntensity: 0.7 });
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), bm, nb);
    for (let i = 0; i < nb; i++) {
      let vi; do { vi = Math.floor(rnd() * this.n); } while (this.theta[vi] < 0.6);
      this.bub.push({ vi, f: 0.25 + rnd() * 0.6, r: 0.0004 + Math.pow(rnd(), 3) * 0.0016, s: 0.6 + rnd() * 0.5 });
    }
    this.group.add(this.bubbles);
    this.dirty = true; this.paintDirty = false;
    this.blown = 0; this.thin = 0; this.opened = false; this.state = 'hot';
    this.core = new THREE.Vector3(0, -R0 * 0.1, 0);
    this.maxR = R0; this.grab0 = null;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
    this.lastPaintBlur = 0; this.fritUsed = new Set();
    this.update(0);
  }
  get P() { return this.geo.attributes.position.array; }
  // ---------------------------------------------------------- sculpting
  inflate(dt, rate = 1) {
    const P = this.P, n = this.n;
    // bulb centre = mean of bulb vertices
    let cx = 0, cy = 0, cz = 0, c = 0;
    for (let i = 0; i < n; i++) if (this.theta[i] > 1.2) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; c++; }
    cx /= c; cy /= c; cz /= c;
    const over = this.maxR > 0.105;
    const k = rate * dt * (over ? 0.004 : 0.018) * (1 + this.blown * 0.4);
    for (let i = 0; i < n; i++) {
      const w = sstep(0.28, 1.25, this.theta[i]);
      if (w <= 0 && this.theta[i] < 0.05) continue;
      let dx = P[i * 3] - cx, dy = P[i * 3 + 1] - cy, dz = P[i * 3 + 2] - cz;
      const l = Math.hypot(dx, dy, dz) || 1;
      // grow more where the wall is hotter (hot glass moves first)
      const hot = 0.35 + 0.65 * this.heat[i];
      // the bulb swells and drifts away from the pipe, so a soft neck forms
      const away = k * 0.55 * sstep(0.05, 1.3, this.theta[i]);
      P[i * 3] += dx / l * k * w * hot; P[i * 3 + 1] += dy / l * k * w * hot - away; P[i * 3 + 2] += dz / l * k * w * hot;
    }
    this.blown += rate * dt;
    this.dirty = true;
  }
  beginGrab(localPoint) {
    this.grab0 = { p: localPoint.clone(), base: Float32Array.from(this.P), r: Math.max(0.018, this.maxR * 0.75) };
  }
  dragGrab(localDelta) {
    if (!this.grab0) return;
    const d = localDelta.clone(); const L = d.length(), Lmax = Math.max(0.05, this.maxR * 2.2);
    if (L > Lmax) d.multiplyScalar(Lmax / L);
    const P = this.P, B = this.grab0.base, a = this.grab0.p, r2 = this.grab0.r * this.grab0.r;
    for (let i = 0; i < this.n; i++) {
      const dx = B[i * 3] - a.x, dy = B[i * 3 + 1] - a.y, dz = B[i * 3 + 2] - a.z;
      const f = Math.exp(-(dx * dx + dy * dy + dz * dz) / r2) * sstep(0.2, 0.9, this.theta[i]);
      // stretched glass thins: pull more at the tip, neck stays
      P[i * 3] = B[i * 3] + d.x * f; P[i * 3 + 1] = B[i * 3 + 1] + d.y * f; P[i * 3 + 2] = B[i * 3 + 2] + d.z * f;
    }
    this.dirty = true;
  }
  endGrab() { this.grab0 = null; }
  relax(amount) {
    // surface-tension smoothing along the grid (keeps sculpted shapes soft)
    const P = this.P, W = SEG_W + 1;
    const Q = Float32Array.from(P);
    for (let y = 1; y < SEG_H; y++) for (let x = 0; x <= SEG_W; x++) {
      const i = y * W + x, xl = y * W + ((x + SEG_W - 1) % SEG_W), xr = y * W + ((x + 1) % SEG_W);
      const up = (y - 1) * W + x, dn = (y + 1) * W + x;
      const k = amount * this.heat[i];
      for (let c = 0; c < 3; c++) {
        const avg = (Q[xl * 3 + c] + Q[xr * 3 + c] + Q[up * 3 + c] + Q[dn * 3 + c]) * 0.25;
        P[i * 3 + c] += (avg - Q[i * 3 + c]) * k;
      }
    }
    this.dirty = true;
  }
  // ---------------------------------------------------------- frit
  // test(worldPos) -> bool ; colour [r,g,b] 0..255
  paintContact(test, col, rnd = Math.random) {
    const P = this.P, uv = this.geo.attributes.uv.array, M = this.mesh.matrixWorld;
    let hits = 0;
    for (let i = 0; i < this.n; i++) {
      this._v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M);
      if (!test(this._v)) continue;
      hits++;
      const u = uv[i * 2], v = uv[i * 2 + 1];
      for (let s = 0; s < 5; s++) {
        const px = Math.floor((u * PW + (rnd() - 0.5) * 5 + PW) % PW), py = clamp(Math.floor(v * PH + (rnd() - 0.5) * 4), 0, PH - 1);
        const o = (py * PW + px) * 4, a = 0.35 + rnd() * 0.5;
        for (let c = 0; c < 3; c++) this.paintData[o + c] = this.paintData[o + c] * (1 - a) + col[c] * a;
      }
    }
    if (hits) { this.paintDirty = true; }
    return hits;
  }
  blurPaint() {
    const D = this.paintData, S = Float32Array.from(D);
    for (let y = 1; y < PH - 1; y++) for (let x = 0; x < PW; x++) {
      const o = (y * PW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = S[o + c] * 4 + S[(y * PW + (x + 1) % PW) * 4 + c] + S[(y * PW + (x + PW - 1) % PW) * 4 + c] + S[((y + 1) * PW + x) * 4 + c] + S[((y - 1) * PW + x) * 4 + c];
        D[o + c] = v / 8;
      }
    }
    this.paintDirty = true;
  }
  // ---------------------------------------------------------- heat
  cool(dt, rateAt) {
    // rateAt(worldPos, i) -> cooling rate (1/s); returns number of vertices in water
    const P = this.P, M = this.mesh.matrixWorld; let wet = 0; let any = false;
    for (let i = 0; i < this.n; i++) {
      const h = this.heat[i]; if (h <= 0.001 && this.crack[i] >= 1) continue;
      this._v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M);
      const r = rateAt(this._v, i);
      if (r.water) { wet++; if (h > 0.22) this.crack[i] = Math.min(1, this.crack[i] + dt * 3.5 * h); }
      this.heat[i] = Math.max(0, h - h * r.k * dt - 0.0015 * dt);
      any = true;
    }
    // heat diffuses a little along the surface
    if (any) {
      const H = this.heat, W = SEG_W + 1, Q = Float32Array.from(H);
      for (let y = 1; y < SEG_H; y++) for (let x = 0; x <= SEG_W; x++) {
        const i = y * W + x;
        H[i] += ((Q[y * W + (x + 1) % SEG_W] + Q[y * W + (x + SEG_W - 1) % SEG_W] + Q[i - W] + Q[i + W]) * 0.25 - Q[i]) * Math.min(1, dt * 6);
      }
      this.geo.attributes.heat.needsUpdate = true; this.geo.attributes.crack.needsUpdate = true;
    }
    return wet;
  }
  setHeat(h) { this.heat.fill(h); this.geo.attributes.heat.needsUpdate = true; }
  maxHeat() { let m = 0; for (let i = 0; i < this.n; i++) if (this.heat[i] > m) m = this.heat[i]; return m; }
  meanHeat() { let m = 0; for (let i = 0; i < this.n; i++) m += this.heat[i]; return m / this.n; }
  // ---------------------------------------------------------- finishing
  // cut from the pipe: open a lip (if blown) and flatten a foot; local +Y = up afterwards
  finish() {
    const P = this.P, W = SEG_W + 1;
    // orient: pole (+Y) is where the pipe was. Cups stand opening-up.
    this.opened = this.blown > 0.9 && this.maxR > 0.045;
    if (this.opened) {
      const th0 = 0.62; const r0 = Math.ceil(th0 / Math.PI * SEG_H);
      for (let y = 0; y < r0; y++) for (let x = 0; x <= SEG_W; x++) {
        const i = y * W + x, j = r0 * W + x;
        P[i * 3] = P[j * 3]; P[i * 3 + 1] = P[j * 3 + 1]; P[i * 3 + 2] = P[j * 3 + 2];
      }
      // flare the lip slightly
      for (let y = r0; y < r0 + 4; y++) for (let x = 0; x <= SEG_W; x++) {
        const i = y * W + x, f = (1 - (y - r0) / 4) * 0.12;
        P[i * 3] *= 1 + f; P[i * 3 + 2] *= 1 + f; P[i * 3 + 1] += this.maxR * f * 0.3;
      }
    }
    // flat foot
    let ymin = 1e9, ymax = -1e9;
    for (let i = 0; i < this.n; i++) { ymin = Math.min(ymin, P[i * 3 + 1]); ymax = Math.max(ymax, P[i * 3 + 1]); }
    const flat = ymin + (ymax - ymin) * 0.07;
    let cx = 0, cz = 0, c = 0;
    for (let i = 0; i < this.n; i++) if (P[i * 3 + 1] < flat) { P[i * 3 + 1] = flat; cx += P[i * 3]; cz += P[i * 3 + 2]; c++; }
    if (!c) { cx = 0; cz = 0; c = 1; }
    cx /= c; cz /= c;
    for (let i = 0; i < this.n; i++) { P[i * 3] -= cx; P[i * 3 + 1] -= flat; P[i * 3 + 2] -= cz; }
    this.dirty = true; this.state = 'cut';
    this.update(0);
  }
  // ---------------------------------------------------------- per frame
  update(dt) {
    if (this.dirty) {
      const g = this.geo; g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      const N = g.attributes.normal.array;
      for (const a of this.dups) {
        let x = 0, y = 0, z = 0;
        for (const i of a) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
        const l = Math.hypot(x, y, z) || 1;
        for (const i of a) { N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; }
      }
      g.computeBoundingSphere(); g.computeBoundingBox();
      // size, wall thickness
      const P = this.P; let mr = 0; const c = g.boundingSphere.center;
      for (let i = 0; i < this.n; i++) mr = Math.max(mr, Math.hypot(P[i * 3] - c.x, P[i * 3 + 1] - c.y, P[i * 3 + 2] - c.z));
      this.maxR = mr;
      const vol = 4 / 3 * Math.PI * this.R0 ** 3;
      const area = 4 * Math.PI * mr * mr;
      const wall = Math.min(this.R0, vol / area);
      this.thin = clamp((0.0035 - wall) / 0.003, 0, 1);
      const m = this.mat;
      m.thickness = Math.max(0.002, Math.min(mr * 1.4, this.blown > 0.3 ? wall * 2.5 : mr * 1.5));
      m.iridescence = sstep(0.55, 1, this.thin) * 0.9;
      this.uni.hotDark.value = 1 - 0.75 * sstep(0.4, 1, this.thin);
      this.uni.emisK.value = 1 - 0.55 * sstep(0.3, 1, this.thin);
      this.hotEnv = true;
      // bubbles follow the wall
      const B = this.bubbles, mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
      this.bub.forEach((b, k) => {
        const i = b.vi;
        const x = c.x + (P[i * 3] - c.x) * b.f, y = c.y + (P[i * 3 + 1] - c.y) * b.f, z = c.z + (P[i * 3 + 2] - c.z) * b.f;
        const s = b.r * (this.blown > 0.3 ? Math.max(0.35, 1 - this.thin) : 1);
        mtx.compose(this._w.set(x, y, z), q, new THREE.Vector3(s, s * b.s, s));
        B.setMatrixAt(k, mtx);
      });
      B.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    }
    if (this.paintDirty) { this.paint.needsUpdate = true; this.paintDirty = false; }
    // hot glass is mostly its own glow: damp mirror reflections while it is hot
    if ((this._envT = (this._envT || 0) + dt) > 0.25 || dt === 0) { this._envT = 0; const mh = this.meanHeat(); this.mat.envMapIntensity = 1.25 * (1 - 0.8 * sstep(0.15, 0.6, mh)); this.mat.specularIntensity = 1 - 0.5 * sstep(0.2, 0.7, mh); }
  }
  worldCenter(out = new THREE.Vector3()) {
    this.geo.boundingSphere || this.geo.computeBoundingSphere();
    return out.copy(this.geo.boundingSphere.center).applyMatrix4(this.mesh.matrixWorld);
  }
  // ---------------------------------------------------------- coloured light
  makeCaster() {
    const self = this;
    const mat = new THREE.ShaderMaterial({
      uniforms: { tP: { value: this.paint }, tint: { value: this.tint }, sunDir: { value: new THREE.Vector3(0, -1, 0) }, crk: { value: crackle() } },
      vertexShader: `attribute float crack; varying vec3 vN; varying vec2 vUv; varying float vCr;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vCr = crack;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tP; uniform vec3 tint; uniform vec3 sunDir; uniform sampler2D crk;
        varying vec3 vN; varying vec2 vUv; varying float vCr;
        void main(){
          vec3 c = texture2D(tP, vUv).rgb; c = pow(c, vec3(2.2)) * tint;
          // light through coloured glass: lighter tint than the glass looks, bright focused core
          vec3 tl = mix(vec3(1.0), c / max(max(c.r, max(c.g, c.b)), 0.05), 0.62) * mix(1.0, 0.8, dot(c, vec3(0.33)) < 0.3 ? 1.0 : 0.0);
          float d = abs(dot(normalize(vN), -sunDir));
          float lens = 0.82 + 1.9 * pow(d, 9.0) - 0.25 * smoothstep(0.35, 0.0, d);
          float cr = texture2D(crk, vUv * vec2(3.0, 1.5)).r * vCr;
          lens = mix(lens, 0.75 + 1.4 * cr, vCr * 0.7);
          gl_FragColor = vec4(tl * lens, 1.0);
        }`,
      side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      depthTest: false, depthWrite: false, transparent: true
    });
    const cm = new THREE.Mesh(this.geo, mat);
    cm.matrixAutoUpdate = false; cm.frustumCulled = false;
    cm.onBeforeRender = () => { cm.matrix.copy(self.mesh.matrixWorld); cm.matrixWorld.copy(self.mesh.matrixWorld); };
    this.caster = cm;
    return cm;
  }
}

export function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
