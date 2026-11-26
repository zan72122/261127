// The aquarium: glass box, sand heightfield, pebbles, driftwood, plants,
// water (refraction + turbidity field), caustics, light shafts, motes,
// bubbles, fish.  Everything changes only where / as long as it is touched.
import * as THREE from './lib/three.module.min.js';
import { pbr } from './tex.js';

export const TK = {
  x0: -0.294, x1: 0.294, z0: -0.174, z1: 0.174, // inner
  y0: 0.558, y1: 0.918, g: 0.006,
};
TK.W = TK.x1 - TK.x0; TK.D = TK.z1 - TK.z0; TK.H = TK.y1 - TK.y0;

export const U = { // shared uniforms
  uTime: { value: 0 }, uLevel: { value: TK.y0 - 0.01 }, uWater: { value: 0 }, uClear: { value: 0 },
  tCaustic: { value: null }, uCaus: { value: 1.0 }, uPush: { value: new THREE.Vector4(0, 0, 0, 0) },
  tTurb: { value: null }, uTank: { value: new THREE.Vector4(TK.x0, TK.y0, TK.W, TK.H) },
};

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

// ---------------------------------------------------------------- caustic texture
// photon-map a periodic wave heightfield onto the floor -> bright network lines
export function makeCausticTexture(N = 256) {
  const acc = new Float32Array(N * N);
  const waves = [];
  for (let i = 0; i < 9; i++) { const kx = Math.round(rnd(-5, 5)), ky = Math.round(rnd(-5, 5)); if (!kx && !ky) continue; waves.push([kx, ky, rnd(0, 6.28), rnd(0.5, 1) / Math.hypot(kx, ky)]); }
  const S = 3, scale = 0.9;
  for (let y = 0; y < N * S; y++) for (let x = 0; x < N * S; x++) {
    const u = x / (N * S), v = y / (N * S);
    let gx = 0, gy = 0;
    for (const [kx, ky, ph, a] of waves) { const c = Math.cos((kx * u + ky * v) * 6.2832 + ph) * a; gx += c * kx; gy += c * ky; }
    let px = (u + gx * 0.012 * scale) * N, py = (v + gy * 0.012 * scale) * N;
    px = ((px % N) + N) % N; py = ((py % N) + N) % N;
    const ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy;
    const i1 = (ix + 1) % N, j1 = (iy + 1) % N;
    acc[iy * N + ix] += (1 - fx) * (1 - fy); acc[iy * N + i1] += fx * (1 - fy);
    acc[j1 * N + ix] += (1 - fx) * fy; acc[j1 * N + i1] += fx * fy;
  }
  // light blur + normalise
  const out = new Uint8Array(N * N * 4);
  let mx = 0; const b = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += acc[((y + dy + N) % N) * N + ((x + dx + N) % N)] * (dx || dy ? 0.6 : 1);
    b[y * N + x] = s; if (s > mx) mx = s;
  }
  const mean = b.reduce((a, c) => a + c, 0) / (N * N);
  for (let i = 0; i < N * N; i++) {
    const v = clamp((b[i] / mean - 0.6) * 0.55, 0, 1);
    const q = Math.round(Math.pow(v, 1.2) * 255);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = q; out[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
// periodic wave normal map for the water surface
export function makeWaveNormal(N = 256) {
  const d = new Uint8Array(N * N * 4);
  const waves = [];
  for (let i = 0; i < 14; i++) { const kx = Math.round(rnd(-9, 9)), ky = Math.round(rnd(-9, 9)); if (!kx && !ky) continue; waves.push([kx, ky, rnd(0, 6.28), 1 / Math.hypot(kx, ky) ** 1.2]); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let gx = 0, gy = 0; const u = x / N, v = y / N;
    for (const [kx, ky, ph, a] of waves) { const c = Math.cos((kx * u + ky * v) * 6.2832 + ph) * a; gx += c * kx; gy += c * ky; }
    const nx = -gx * 0.06, ny = -gy * 0.06, l = Math.hypot(nx, ny, 1);
    const i = (y * N + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- shader patch: caustics, wet look
// opts: {wet: bool, caustic: strength}
export function underwater(mat, opts = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, { uTime: U.uTime, uLevel: U.uLevel, uWater: U.uWater, tCaustic: U.tCaustic, uCaus: U.uCaus, uClear: U.uClear });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 cw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
          #endif
          vCW = (modelMatrix * cw).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vCW; uniform float uTime, uLevel, uWater, uCaus, uClear; uniform sampler2D tCaustic;
      float caustic(vec2 p){
        vec2 q = p * 5.2;
        float a = texture2D(tCaustic, q + vec2(uTime*0.031, uTime*0.019)).r;
        float b = texture2D(tCaustic, q*1.37 + vec2(-uTime*0.023, uTime*0.029) + 0.37).r;
        return min(a, b);
      }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float sub = uWater * smoothstep(0.002, -0.004, vCW.y - uLevel);
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float facing = clamp(dot(normal, upV) * 0.8 + 0.3, 0.0, 1.0);
          float c = caustic(vCW.xz) * sub * facing * uCaus * ${(opts.caustic ?? 1).toFixed(2)};
          reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.85, 1.0, 1.05) * c * (0.6 + 1.6 * uClear);
        }`);
    if (opts.wet) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wet = uWater * smoothstep(0.004, -0.004, vCW.y - uLevel);
          diffuseColor.rgb *= mix(1.0, 0.68, wet);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, wet);`);
    }
    mat.userData.shader = sh;
  };
  mat.customProgramCacheKey = () => 'uw' + (opts.wet ? 1 : 0) + (opts.caustic ?? 1) + (opts.key || '');
  return mat;
}

// ---------------------------------------------------------------- sand heightfield
export class Sand {
  constructor(group) {
    this.NX = 118; this.NZ = 70;
    const NX = this.NX, NZ = this.NZ;
    this.h = new Float32Array(NX * NZ);
    this.dx = TK.W / (NX - 1); this.dz = TK.D / (NZ - 1);
    // grid + 4 skirts
    const nGrid = NX * NZ;
    const nSk = 2 * (NX * 2 + NZ * 2);
    const pos = new Float32Array((nGrid + nSk) * 3), nor = new Float32Array((nGrid + nSk) * 3), uv = new Float32Array((nGrid + nSk) * 2);
    const ind = [];
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const p = k * NX + i;
      pos[p * 3] = TK.x0 + i * this.dx; pos[p * 3 + 1] = 0; pos[p * 3 + 2] = TK.z0 + k * this.dz;
      uv[p * 2] = pos[p * 3] / 0.12; uv[p * 2 + 1] = pos[p * 3 + 2] / 0.12;
      nor[p * 3 + 1] = 1;
      if (i < NX - 1 && k < NZ - 1) ind.push(p, p + NX, p + 1, p + 1, p + NX, p + NX + 1);
    }
    // skirts: list of [gridIndex, outward normal]
    this.sk = [];
    const add = (list, n) => {
      const start = nGrid + this.sk.length * 2;
      list.forEach((gi, j) => {
        const v = nGrid + (this.sk.length) * 2;
        this.sk.push(gi);
        pos[v * 3] = pos[gi * 3]; pos[v * 3 + 2] = pos[gi * 3 + 2];
        pos[(v + 1) * 3] = pos[gi * 3]; pos[(v + 1) * 3 + 1] = -0.001; pos[(v + 1) * 3 + 2] = pos[gi * 3 + 2];
        for (const w of [v, v + 1]) { nor[w * 3] = n[0]; nor[w * 3 + 2] = n[1]; uv[w * 2] = (pos[gi * 3] + pos[gi * 3 + 2]) / 0.12; }
        if (j < list.length - 1) {
          const a = v, b = v + 1, c = v + 2, d = v + 3;
          ind.push(a, b, c, c, b, d);
        }
      });
      return start;
    };
    const front = [], back = [], left = [], right = [];
    for (let i = 0; i < NX; i++) { front.push((NZ - 1) * NX + i); back.push(NX - 1 - i); }
    for (let k = 0; k < NZ; k++) { left.push(k * NX); right.push((NZ - 1 - k) * NX + NX - 1); }
    this.skStart = nGrid;
    add(front, [0, 1]); add(back, [0, -1]); add(left.slice().reverse(), [-1, 0]); add(right.slice().reverse(), [1, 0]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(ind);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.04, 0), 0.4);
    this.geo = g;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.FrontSide });
    mat.color.setRGB(0.62, 0.53, 0.40);
    pbr(mat, 'sand', [1, 1]);
    mat.normalScale.set(1.2, 1.2);
    mat.addEventListener('dispose', () => {});
    // when the map arrives, set colour to white so the photo colour is used
    const chk = setInterval(() => { if (mat.map) { mat.color.setRGB(0.82, 0.8, 0.78); clearInterval(chk); } }, 200);
    underwater(mat, { wet: true, caustic: 1.0, key: 'sand' });
    const pre = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      pre(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          #ifdef USE_MAP
          float grain = texture2D(map, vMapUv).r;
          #else
          float grain = fract(sin(dot(floor(vCW.xz*900.0), vec2(12.9898,78.233)))*43758.5453);
          #endif
          if (vH < 0.0004 + grain * 0.0016) discard;`);
    };
    mat.customProgramCacheKey = () => 'sand2';
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true; this.mesh.castShadow = false;
    group.add(this.mesh);
    this.dirty = true; this.active = 0;
  }
  idx(x, z) { return [clamp(Math.round((x - TK.x0) / this.dx), 0, this.NX - 1), clamp(Math.round((z - TK.z0) / this.dz), 0, this.NZ - 1)]; }
  heightAt(x, z) {
    const fx = clamp((x - TK.x0) / this.dx, 0, this.NX - 1.001), fz = clamp((z - TK.z0) / this.dz, 0, this.NZ - 1.001);
    const i = fx | 0, k = fz | 0, a = fx - i, b = fz - k, N = this.NX, h = this.h;
    return (h[k * N + i] * (1 - a) + h[k * N + i + 1] * a) * (1 - b) + (h[(k + 1) * N + i] * (1 - a) + h[(k + 1) * N + i + 1] * a) * b;
  }
  deposit(x, z, vol, r = 0.012) {
    const N = this.NX, h = this.h;
    const [ci, ck] = this.idx(x, z);
    const ri = Math.ceil(r * 2 / this.dx) + 1;
    let wsum = 0; const ws = [];
    for (let k = ck - ri; k <= ck + ri; k++) for (let i = ci - ri; i <= ci + ri; i++) {
      if (i < 0 || k < 0 || i >= N || k >= this.NZ) continue;
      const px = TK.x0 + i * this.dx, pz = TK.z0 + k * this.dz;
      const d2 = ((px - x) ** 2 + (pz - z) ** 2) / (r * r);
      if (d2 > 4) continue;
      const w = Math.exp(-d2 * 1.5); wsum += w; ws.push(k * N + i, w);
    }
    for (let j = 0; j < ws.length; j += 2) h[ws[j]] = Math.min(0.085, h[ws[j]] + vol * ws[j + 1] / wsum / (this.dx * this.dz));
    this.dirty = true; this.active = 40;
  }
  relax(iter = 2) {
    const N = this.NX, M = this.NZ, h = this.h;
    const talus = this.dx * 0.62; // ~32 deg angle of repose
    for (let it = 0; it < iter; it++) {
      for (let k = 0; k < M; k++) for (let i = 0; i < N; i++) {
        const p = k * N + i;
        if (i < N - 1) { const d = h[p] - h[p + 1]; if (Math.abs(d) > talus) { const m = (Math.abs(d) - talus) * 0.25 * Math.sign(d); h[p] -= m; h[p + 1] += m; } }
        if (k < M - 1) { const d = h[p] - h[p + N]; if (Math.abs(d) > talus) { const m = (Math.abs(d) - talus) * 0.25 * Math.sign(d); h[p] -= m; h[p + N] += m; } }
      }
    }
  }
  flatten(x, z, r, amt) { // used when things are pressed into the sand
    const [ci, ck] = this.idx(x, z); const ri = Math.ceil(r / this.dx);
    for (let k = ck - ri; k <= ck + ri; k++) for (let i = ci - ri; i <= ci + ri; i++) {
      if (i < 0 || k < 0 || i >= this.NX || k >= this.NZ) continue;
      this.h[k * this.NX + i] *= 1 - amt;
    }
    this.dirty = true;
  }
  coverage() {
    let c = 0; for (let i = 0; i < this.h.length; i++) if (this.h[i] > 0.003) c++;
    return c / this.h.length;
  }
  update() {
    if (this.active > 0) { this.relax(2); this.active--; this.dirty = true; }
    if (!this.dirty) return;
    this.dirty = false;
    const N = this.NX, M = this.NZ, h = this.h;
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array;
    for (let k = 0; k < M; k++) for (let i = 0; i < N; i++) {
      const p = k * N + i;
      pos[p * 3 + 1] = h[p];
      const hl = h[k * N + Math.max(i - 1, 0)], hr = h[k * N + Math.min(i + 1, N - 1)];
      const hd = h[Math.max(k - 1, 0) * N + i], hu = h[Math.min(k + 1, M - 1) * N + i];
      let nx = (hl - hr) / (2 * this.dx), nz = (hd - hu) / (2 * this.dz);
      const l = Math.hypot(nx, 1, nz);
      nor[p * 3] = nx / l; nor[p * 3 + 1] = 1 / l; nor[p * 3 + 2] = nz / l;
    }
    for (let j = 0; j < this.sk.length; j++) {
      const v = this.skStart + j * 2;
      pos[v * 3 + 1] = h[this.sk[j]];
      this.geo.attributes.uv.array[v * 2 + 1] = h[this.sk[j]] / 0.12;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; this.geo.attributes.uv.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- pebbles
export class Pebbles {
  constructor(group, sand) {
    this.sand = sand; this.max = 260; this.n = 0; this.live = [];
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.12 * Math.sin(v.x * 3.1 + 1.3) * Math.cos(v.y * 2.7) + 0.08 * Math.sin(v.z * 5.3 + v.x * 2.1);
      v.multiplyScalar(n); p.setXYZ(i, v.x, v.y * 0.62, v.z);
    }
    g.computeVertexNormals();
    // spherical uv for stone texture
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); uv[i * 2] = Math.atan2(v.z, v.x) / 6.283 + 0.5; uv[i * 2 + 1] = v.y * 0.5 + 0.5; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    pbr(mat, 'stone', [1, 1]);
    underwater(mat, { wet: true, caustic: 1, key: 'peb' });
    this.mesh = new THREE.InstancedMesh(g, mat, this.max);
    this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.cols = [[0.55, 0.52, 0.5], [0.42, 0.38, 0.34], [0.75, 0.72, 0.66], [0.5, 0.42, 0.34], [0.3, 0.29, 0.28], [0.68, 0.6, 0.5]];
    group.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler();
  }
  drop(x, y, z) {
    if (this.n >= this.max) return null;
    const i = this.n++;
    const r = rnd(0.004, 0.0095);
    const p = { i, x, y, z, vx: rnd(-0.05, 0.05), vy: rnd(-0.2, 0), vz: rnd(-0.05, 0.05), r, s: [r * rnd(0.9, 1.3), r, r * rnd(0.8, 1.2)], rot: [rnd(0, 6), rnd(0, 6), rnd(0, 6)], rest: false, t: 0 };
    const c = this.cols[(Math.random() * this.cols.length) | 0];
    const k = rnd(0.85, 1.15);
    this.mesh.setColorAt(i, new THREE.Color(c[0] * k, c[1] * k, c[2] * k));
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.n;
    this.live.push(p);
    this.write(p);
    return p;
  }
  write(p) {
    this.e.set(p.rot[0], p.rot[1], p.rot[2]); this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, new THREE.Vector3(p.s[0], p.s[1], p.s[2]));
    this.mesh.setMatrixAt(p.i, this.m); this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt, audio) {
    for (let j = this.live.length - 1; j >= 0; j--) {
      const p = this.live[j];
      p.vy -= 9.8 * dt * (U.uWater.value && p.y < U.uLevel.value - TK.y0 ? 0.2 : 1);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.x = clamp(p.x, TK.x0 + p.r, TK.x1 - p.r); p.z = clamp(p.z, TK.z0 + p.r, TK.z1 - p.r);
      p.rot[0] += p.vx * dt * 40; p.rot[2] += p.vz * dt * 40;
      const floor = this.sand.heightAt(p.x, p.z) + p.r * 0.45;
      if (p.y <= floor) {
        p.y = floor;
        if (Math.abs(p.vy) > 0.25) { p.vy = -p.vy * 0.25; p.vx *= 0.5; p.vz *= 0.5; if (audio && Math.random() < 0.7) audio.pebble(); }
        else { this.live.splice(j, 1); this.sand.deposit(p.x, p.z, p.r * p.r * p.r * 1.6, 0.006); }
      }
      this.write(p);
    }
  }
  // keep resting pebbles on top of the sand if the sand grows under them
  settleAll(list) { }
}

// ---------------------------------------------------------------- driftwood
export function driftwoodGeometry(seed = 1) {
  const R = (n) => { const s = Math.sin(seed * 91.7 + n * 13.3) * 43758.5; return s - Math.floor(s); };
  const branches = [];
  const main = [];
  const len = 0.2 + R(1) * 0.1;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    main.push(new THREE.Vector3((t - 0.5) * len, Math.sin(t * 3.1) * 0.035 * (0.6 + R(2)) + t * 0.05 * R(3), Math.sin(t * 5 + R(4) * 6) * 0.02));
  }
  branches.push({ curve: new THREE.CatmullRomCurve3(main), r0: 0.013 + R(5) * 0.006, r1: 0.004 });
  for (let b = 0; b < 3; b++) {
    const t0 = 0.25 + R(10 + b) * 0.5;
    const base = branches[0].curve.getPoint(t0);
    const dir = new THREE.Vector3(R(20 + b) - 0.5, 0.7 + R(30 + b) * 0.5, R(40 + b) - 0.5).normalize();
    const L = 0.06 + R(50 + b) * 0.08;
    const pts = [base.clone()];
    for (let i = 1; i <= 4; i++) { const p = base.clone().addScaledVector(dir, L * i / 4); p.x += Math.sin(i * 2 + b) * 0.008; pts.push(p); }
    branches.push({ curve: new THREE.CatmullRomCurve3(pts), r0: 0.006, r1: 0.0018 });
  }
  const pos = [], uv = [], ind = [];
  let base = 0;
  for (const br of branches) {
    const S = 40, A = 12;
    const frames = br.curve.computeFrenetFrames(S, false);
    for (let i = 0; i <= S; i++) {
      const t = i / S; const P = br.curve.getPointAt(t);
      const r = br.r0 + (br.r1 - br.r0) * Math.pow(t, 0.8);
      for (let j = 0; j <= A; j++) {
        const a = j / A * 6.283;
        const bump = 1 + 0.12 * Math.sin(a * 3 + t * 20 + seed) + 0.08 * Math.sin(a * 7 + t * 47);
        const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
        pos.push(P.x + n.x * r * bump, P.y + n.y * r * bump, P.z + n.z * r * bump);
        uv.push(t * br.curve.getLength() / 0.06, j / A);
      }
    }
    for (let i = 0; i < S; i++) for (let j = 0; j < A; j++) {
      const a = base + i * (A + 1) + j, b = a + A + 1;
      ind.push(a, b, a + 1, b, b + 1, a + 1);
    }
    base += (S + 1) * (A + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- plants
function plantMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide, alphaTest: 0.45, vertexColors: true });
  if (tex) { m.map = tex; }
  underwater(m, { caustic: 0.6, key: 'plant' });
  const pre = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    pre(sh, r);
    sh.uniforms.uPush = U.uPush;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSway; attribute float aPhase; uniform float uTime, uWater, uLevel; uniform vec4 uPush;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          float sub = uWater * smoothstep(0.0, -0.02, wp.y - uLevel);
          float w = aSway * sub;
          transformed.x += (sin(uTime * 1.3 + aPhase + transformed.y * 18.0) * 0.007 + sin(uTime*0.6 + aPhase*0.3)*0.004) * w;
          transformed.z += cos(uTime * 1.05 + aPhase * 1.7 + transformed.y * 12.0) * 0.005 * w;
          // push from the pouring stream
          vec2 d = wp.xz - uPush.xy;
          float pf = uPush.z * exp(-dot(d, d) / 0.006) * aSway;
          transformed.xz += normalize(d + 1e-4) * pf * 0.03;
          transformed.y -= pf * 0.01;
          // droop a little in air
          transformed.y -= (1.0 - sub) * aSway * 0.0;
        }`);
    // gentle translucency: leaves glow a bit from the lamp above
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * 0.09;`);
  };
  m.customProgramCacheKey = () => 'plant3';
  return m;
}

export class Plants {
  constructor(group, sand, texLoader) {
    this.group = group; this.sand = sand; this.list = [];
    this.matRibbon = plantMaterial(null); this.matLeaf = plantMaterial(null);
    this.matRibbon.color.setRGB(0.3, 0.5, 0.2); this.matLeaf.color.setRGB(0.3, 0.5, 0.2);
    texLoader('tex/ribbon.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; this.matRibbon.map = t; this.matRibbon.color.setRGB(1, 1, 1); this.matRibbon.needsUpdate = true; });
    texLoader('tex/leaf.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; this.matLeaf.map = t; this.matLeaf.color.setRGB(1, 1, 1); this.matLeaf.needsUpdate = true; });
    this.kind = 0;
  }
  ribbon(h0) {
    const pos = [], uv = [], col = [], sw = [], ph = [], ind = [];
    const nb = 8 + (Math.random() * 6 | 0);
    for (let b = 0; b < nb; b++) {
      const bx = rnd(-0.012, 0.012), bz = rnd(-0.01, 0.01);
      const H = h0 * rnd(0.55, 1.05), w = rnd(0.005, 0.0075);
      const lean = rnd(-0.5, 0.5), dirA = rnd(0, 6.28), twist = rnd(-3, 3), phase = rnd(0, 6.28);
      const S = 14, base = pos.length / 3;
      const tint = rnd(0.55, 0.85);
      for (let i = 0; i <= S; i++) {
        const t = i / S;
        const bend = lean * t * t * H * 0.5;
        const cx = bx + Math.cos(dirA) * bend, cz = bz + Math.sin(dirA) * bend, cy = t * H;
        const ang = dirA + twist * t + 1.57;
        const ww = w * (i === S ? 0.25 : 1);
        for (const s of [-1, 1]) {
          pos.push(cx + Math.cos(ang) * ww * 0.5 * s, cy, cz + Math.sin(ang) * ww * 0.5 * s);
          uv.push(s < 0 ? 0 : 1, 1 - t); col.push(tint * rnd(0.95, 1.05), tint, tint * 0.9); sw.push(t * t * H * 8); ph.push(phase);
        }
        if (i < S) { const a = base + i * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    return this.geo(pos, uv, col, sw, ph, ind);
  }
  stems(h0) {
    const pos = [], uv = [], col = [], sw = [], ph = [], ind = [];
    const ns = 4 + (Math.random() * 4 | 0);
    const red = Math.random() < 0.5;
    for (let s = 0; s < ns; s++) {
      const bx = rnd(-0.012, 0.012), bz = rnd(-0.012, 0.012), H = h0 * rnd(0.6, 1), phase = rnd(0, 6.28);
      const lx = rnd(-0.15, 0.15), lz = rnd(-0.15, 0.15);
      // stem: thin ribbon pair (crossed)
      const S = 10;
      for (const rot of [0, 1.57]) {
        const base = pos.length / 3;
        for (let i = 0; i <= S; i++) {
          const t = i / S, y = t * H, x = bx + lx * y * y * 4, z = bz + lz * y * y * 4;
          for (const sg of [-1, 1]) { pos.push(x + Math.cos(rot) * 0.0012 * sg, y, z + Math.sin(rot) * 0.0012 * sg); uv.push(0.5, 0.5); col.push(0.55, 0.6, 0.35); sw.push(t * t * H * 8); ph.push(phase); }
          if (i < S) { const a = base + i * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
      }
      // leaves in decussate pairs
      const nl = Math.floor(H / 0.009);
      for (let l = 1; l <= nl; l++) {
        const t = l / nl, y = t * H, x = bx + lx * y * y * 4, z = bz + lz * y * y * 4;
        const size = 0.018 * (1 - 0.45 * t) + 0.005;
        for (const side of [0, Math.PI]) {
          const a = (l % 2) * 1.57 + side + rnd(-0.35, 0.35) + l * 0.4;
          const up = 0.15 + 0.7 * t + rnd(-0.15, 0.15);
          const dx = Math.cos(a), dz = Math.sin(a);
          const base = pos.length / 3;
          // leaf quad from stem outward, tilted up
          const L = size, Wd = size * 0.3;
          const tipx = x + dx * L * Math.cos(up), tipy = y + L * Math.sin(up), tipz = z + dz * L * Math.cos(up);
          const px = -dz * Wd, pz = dx * Wd;
          const c = red ? [0.75 + 0.35 * t, 0.62 - 0.12 * t, 0.5 - 0.1 * t] : [0.62, 0.72, 0.6];
          pos.push(x + px, y, z + pz, x - px, y, z - pz, tipx + px, tipy, tipz + pz, tipx - px, tipy, tipz - pz);
          uv.push(0, 0, 1, 0, 0, 1, 1, 1);
          for (let q = 0; q < 4; q++) { col.push(...c); sw.push(t * t * H * 8 + (q > 1 ? 0.1 : 0)); ph.push(phase); }
          ind.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
      }
    }
    return this.geo(pos, uv, col, sw, ph, ind);
  }
  rosette(h0) {
    const pos = [], uv = [], col = [], sw = [], ph = [], ind = [];
    const nl = 7 + (Math.random() * 5 | 0); const phase = rnd(0, 6.28);
    const bronze = Math.random() < 0.5;
    for (let l = 0; l < nl; l++) {
      const a = l / nl * 6.283 + rnd(-0.3, 0.3);
      const L = h0 * rnd(0.6, 1.0), Wd = L * rnd(0.22, 0.3);
      const dx = Math.cos(a), dz = Math.sin(a);
      const S = 6, base = pos.length / 3;
      const arch = rnd(0.9, 1.3);
      for (let i = 0; i <= S; i++) {
        const t = i / S;
        const r = L * t * 0.55, y = Math.sin(t * arch * 1.5) * L * 0.75;
        const w = Wd * Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.5 + 0.001;
        const cx = dx * r, cz = dz * r;
        for (const s of [-1, 1]) {
          pos.push(cx - dz * w * s, y + Math.abs(s) * 0, cz + dx * w * s);
          uv.push(s < 0 ? 0 : 1, t); col.push(...(bronze ? [0.78, 0.6, 0.45] : [0.6, 0.7, 0.55])); sw.push(t * t * 0.5); ph.push(phase + l);
        }
        if (i < S) { const q = base + i * 2; ind.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    }
    return this.geo(pos, uv, col, sw, ph, ind);
  }
  geo(pos, uv, col, sw, ph, ind) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
    g.setIndex(ind); g.computeVertexNormals();
    return g;
  }
  plant(x, z, kind) {
    if (kind === undefined) { kind = this.kind; this.kind = (this.kind + 1) % 3; }
    // tall ribbons at the back, rosettes in front
    const back = clamp((TK.z1 - z) / TK.D, 0, 1);
    let g, mat;
    if (kind === 0) { g = this.ribbon(0.12 + back * 0.2); mat = this.matRibbon; }
    else if (kind === 1) { g = this.stems(0.08 + back * 0.12); mat = this.matLeaf; }
    else { g = this.rosette(0.05 + back * 0.05); mat = this.matLeaf; }
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, this.sand.heightAt(x, z) - 0.004, z);
    m.rotation.y = rnd(0, 6.28);
    m.scale.setScalar(0.01);
    m.userData = { grow: 0, x, z };
    this.group.add(m); this.list.push(m);
    return m;
  }
  update(dt) {
    for (const m of this.list) {
      const u = m.userData;
      if (u.grow < 1) { u.grow = Math.min(1, u.grow + dt * 1.6); const t = u.grow; const s = 1 + Math.sin(t * Math.PI) * 0.15 * (1 - t); m.scale.set(s * t ** 0.5, t * s, s * t ** 0.5); }
      m.position.y = this.sand.heightAt(u.x, u.z) - 0.004 + (TK.y0 - TK.y0);
    }
  }
}

// ---------------------------------------------------------------- fish
export const SPECIES = [
  { name: 'platy', len: 0.046, h: 0.018, w: 0.009, back: '#9c3a1e', side: '#d9692c', belly: '#efc392', fin: 'rgba(222,110,52,0.8)', stripe: null, irid: 0.25, count: 5, speed: 0.05 },
  { name: 'tetra', len: 0.038, h: 0.0105, w: 0.0064, back: '#4a5550', side: '#9aa6a2', belly: '#c9ccc6', fin: 'rgba(220,225,225,0.45)', stripe: 'tetra', irid: 0.5, count: 8, speed: 0.07 },
  { name: 'danio', len: 0.04, h: 0.0095, w: 0.006, back: '#8c8466', side: '#d3c79e', belly: '#ece6d2', fin: 'rgba(230,226,200,0.5)', stripe: 'danio', irid: 0.5, count: 6, speed: 0.09 },
];
function fishTexture(sp) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  // body area v in [0, 0.7]: top at 0.05 & 0.7, belly at 0.375
  const g = x.createLinearGradient(0, 0, 0, 0.7 * 256);
  g.addColorStop(0, sp.back); g.addColorStop(0.16, sp.side); g.addColorStop(0.5, sp.belly); g.addColorStop(0.84, sp.side); g.addColorStop(1, sp.back);
  x.fillStyle = g; x.fillRect(0, 0, 256, 0.72 * 256);
  const band = (v0, v1, col, u0 = 0, u1 = 1) => { x.fillStyle = col; x.fillRect(u0 * 256, v0 * 256, (u1 - u0) * 256, (v1 - v0) * 256); };
  if (sp.stripe === 'tetra') {
    for (const off of [0, 0.325]) {
      band(0.13 + off, 0.2 + off, 'rgba(40,130,160,1)', 0.15, 0.92);
    }
    // red lower flank toward the tail
    for (const off of [0.2, 0.375]) { const gg = x.createLinearGradient(0, 0, 256, 0); gg.addColorStop(0, 'rgba(170,50,40,0)'); gg.addColorStop(0.45, 'rgba(170,50,40,0.85)'); gg.addColorStop(1, 'rgba(160,45,38,0.9)'); x.fillStyle = gg; x.fillRect(0, off * 256, 256, 0.12 * 256); }
  } else if (sp.stripe === 'danio') {
    for (const off of [0, 0.325]) for (let k = 0; k < 3; k++) band(0.1 + off + k * 0.045, 0.125 + off + k * 0.045, 'rgba(50,70,120,0.85)', 0.12, 1);
  } else {
    // speckles on platy back
    for (let i = 0; i < 160; i++) { x.fillStyle = 'rgba(70,20,10,0.25)'; const v = Math.random() < 0.5 ? Math.random() * 0.1 : 0.62 + Math.random() * 0.08; x.fillRect(Math.random() * 256, v * 256, 2, 2); }
  }
  // scale shading
  x.globalAlpha = 0.08;
  for (let i = 0; i < 400; i++) { x.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 0.7 * 256, 2, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  // eye region darkening near head (u small)
  // fin area v in [0.75, 1]: translucent with rays
  x.clearRect(0, 0.74 * 256, 256, 0.26 * 256);
  for (let i = 0; i < 256; i += 1) {
    const ray = 0.65 + 0.35 * Math.abs(Math.sin(i * 0.55));
    x.fillStyle = sp.fin.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * ray).toFixed(2) + ')');
    x.fillRect(i, 0.75 * 256, 1, 0.25 * 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function fishGeometry(sp) {
  const L = sp.len, H = sp.h, W = sp.w;
  const pos = [], uv = [], au = [], col = [], ind = [];
  const SU = 22, SV = 16;
  const prof = (u) => Math.pow(Math.sin(Math.PI * Math.min(u * 1.7, 1) / 2), 0.62) * (1 - 0.86 * (u < 0.3 ? 0 : Math.pow((u - 0.3) / 0.7, 1.15)));
  for (let i = 0; i <= SU; i++) {
    const u = i / SU, x = L * (0.5 - u);
    const a = H * 0.5 * prof(u) + 0.0004, b = W * 0.5 * prof(u) + 0.0003;
    for (let j = 0; j <= SV; j++) {
      const th = j / SV * Math.PI * 2;
      const belly = Math.cos(th) < 0 ? 1.08 : 1;
      pos.push(x, Math.cos(th) * a * belly, Math.sin(th) * b);
      uv.push(u, 1 - (0.05 + 0.65 * j / SV)); au.push(u); col.push(1, 1, 1);
    }
  }
  for (let i = 0; i < SU; i++) for (let j = 0; j < SV; j++) { const a = i * (SV + 1) + j, b = a + SV + 1; ind.push(a, a + 1, b, b, a + 1, b + 1); }
  const fin = (pts, u0) => { // pts: [[x,y,z],...] quad strip pairs; v mapped into fin area
    const base = pos.length / 3;
    pts.forEach(([x, y, z, fu, fv]) => { pos.push(x, y, z); uv.push(fu, 1 - (0.76 + 0.23 * fv)); au.push(u0 + (0.5 - x / L) * 0 + Math.max(0, (0.5 - x / L))); col.push(1, 1, 1); });
    const n = pts.length / 2;
    for (let i = 0; i < n - 1; i++) { const a = base + i * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  // tail fin (vertical fan, forked)
  const tl = L * 0.36, tx = -L * 0.5 + 0.001;
  const tail = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; const span = H * (0.12 + 0.48 * t) * (1 - 0.25 * Math.sin(t * Math.PI)); tail.push([tx - tl * t, span, 0, t, 0], [tx - tl * t, -span, 0, t, 1]); }
  fin(tail, 1);
  // dorsal
  const dor = []; for (let i = 0; i <= 4; i++) { const t = i / 4; const x = L * (0.5 - (0.36 + 0.26 * t)); const y = H * 0.5 * prof(0.36 + 0.26 * t); dor.push([x, y - 0.0006, 0, t, 0], [x - L * 0.06, y + H * 0.42 * Math.sin((1 - t * 0.7) * 1.6), 0, t, 1]); }
  fin(dor, 0);
  // anal
  const an = []; for (let i = 0; i <= 4; i++) { const t = i / 4; const x = L * (0.5 - (0.56 + 0.2 * t)); const y = -H * 0.5 * prof(0.56 + 0.2 * t); an.push([x, y + 0.0006, 0, t, 0], [x - L * 0.05, y - H * 0.3 * Math.sin((1 - t * 0.6) * 1.6), 0, t, 1]); }
  fin(an, 0);
  // pectorals
  for (const s of [-1, 1]) { const x = L * 0.22, y = -H * 0.12, z = s * W * 0.45; fin([[x, y, z, 0, 0], [x, y - 0.002, z, 0, 1], [x - L * 0.16, y - H * 0.18, z + s * W * 0.5, 1, 0], [x - L * 0.14, y - H * 0.36, z + s * W * 0.45, 1, 1]], 0); }
  // eyes: small spheres
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(H * 0.13, 10, 8); e.translate(L * 0.36, H * 0.08, s * W * 0.36);
    const base = pos.length / 3; const p = e.attributes.position;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(0.02, 0.5); au.push(0); const r = Math.hypot(p.getX(i) - L * 0.36, p.getY(i) - H * 0.08); const pupil = Math.abs(p.getZ(i)) > W * 0.36 + H * 0.08 ? 0.02 : 0.6; col.push(pupil, pupil, pupil * 0.9); }
    const ei = e.index.array; for (let i = 0; i < ei.length; i++) ind.push(base + ei[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(au, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ind); g.computeVertexNormals();
  return g;
}
export class Fish {
  constructor(group, sand, scaleNormal) {
    this.group = group; this.sand = sand; this.all = []; this.meshes = [];
    this.poi = []; // points of interest {x,y,z,w,ttl}
    for (const sp of SPECIES) {
      const geo = fishGeometry(sp);
      const phase = new Float32Array(sp.count); for (let i = 0; i < sp.count; i++) phase[i] = Math.random() * 10;
      const amp = new Float32Array(sp.count).fill(1);
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
      geo.setAttribute('aAmp', new THREE.InstancedBufferAttribute(amp, 1));
      const mat = new THREE.MeshPhysicalMaterial({ map: fishTexture(sp), roughness: 0.32, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.25, iridescence: sp.irid, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 600], vertexColors: true, side: THREE.DoubleSide, alphaHash: true, sheen: 0.1, sheenColor: new THREE.Color(0.7, 0.8, 0.9) });
      if (scaleNormal) { mat.normalMap = scaleNormal; mat.normalScale.set(0.3, 0.3); }
      underwater(mat, { caustic: 0.5, key: 'fish' });
      const pre = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        pre(sh, r);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aU; attribute float aPhase; attribute float aAmp; uniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            { float k = smoothstep(0.15, 1.3, aU);
              float wv = sin(uTime * 9.0 * (0.6 + 0.4*aAmp) + aPhase - aU * 5.5);
              transformed.z += wv * k * ${(sp.len * 0.16).toFixed(4)} * aAmp;
              transformed.z += sin(uTime * 2.0 + aPhase) * 0.001 * k; }`)
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>');
      };
      mat.customProgramCacheKey = () => 'fish' + sp.name;
      const mesh = new THREE.InstancedMesh(geo, mat, sp.count);
      mesh.castShadow = true; mesh.frustumCulled = false; mesh.count = sp.count;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh); this.meshes.push(mesh);
      for (let i = 0; i < sp.count; i++) {
        this.all.push({ sp, mesh, i, free: false, inBag: true, p: new THREE.Vector3(0, -5, 0), v: new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1)).multiplyScalar(0.02), goal: new THREE.Vector3(), gt: 0, amp: 1, q: new THREE.Quaternion(), hide: true });
      }
    }
    this.m = new THREE.Matrix4(); this.tmp = new THREE.Vector3(); this.look = new THREE.Matrix4();
    this.hideAll();
  }
  hideAll() { for (const f of this.all) { this.m.makeScale(0, 0, 0); f.mesh.setMatrixAt(f.i, this.m); } this.meshes.forEach(m => m.instanceMatrix.needsUpdate = true); }
  species(k) { return this.all.filter(f => f.sp === SPECIES[k]); }
  inBag(k, bagPos, sc = 1) { for (const f of this.species(k)) { if (!f.free) { f.inBag = true; f.hide = false; f.bag = bagPos; f.bagS = sc; } } }
  release(k, at) {
    for (const f of this.species(k)) {
      f.free = true; f.inBag = false; f.hide = false;
      f.p.copy(at).add(new THREE.Vector3(rnd(-0.01, 0.01), rnd(-0.02, 0), rnd(-0.01, 0.01)));
      f.v.set(rnd(-0.1, 0.1), rnd(-0.12, -0.04), rnd(-0.06, 0.06));
      f.gt = 0; f.burst = 1.2;
    }
  }
  attract(x, y, z, w = 1, ttl = 4, radius = 0.4) { this.poi.push({ p: new THREE.Vector3(x, y, z), w, ttl, radius }); }
  freeCount() { return this.all.filter(f => f.free).length; }
  update(dt, t, level) {
    const lo = new THREE.Vector3(TK.x0 + 0.02, 0, TK.z0 + 0.025), hi = new THREE.Vector3(TK.x1 - 0.02, level - 0.018, TK.z1 - 0.02);
    for (let j = this.poi.length - 1; j >= 0; j--) { this.poi[j].ttl -= dt; if (this.poi[j].ttl <= 0) this.poi.splice(j, 1); }
    // school centroid for tetras
    const cen = new THREE.Vector3(); let cn = 0;
    for (const f of this.all) if (f.free && f.sp.name === 'tetra') { cen.add(f.p); cn++; }
    if (cn) cen.multiplyScalar(1 / cn);
    for (const f of this.all) {
      if (f.hide) continue;
      if (f.inBag) {
        if (!f.bag) continue;
        // jiggle inside the bag
        const bs = f.bagS || 1; f.p.set(f.bag.x + Math.sin(t * 1.7 + f.i * 2.1) * 0.012 * bs, f.bag.y - 0.012 * bs + Math.sin(t * 1.3 + f.i) * 0.008 * bs, f.bag.z + Math.cos(t * 1.5 + f.i * 1.3) * 0.01 * bs);
        f.v.set(Math.cos(t * 1.7 + f.i * 2.1), 0, -Math.sin(t * 1.5 + f.i * 1.3));
      } else if (f.free) {
        const floor = TK.y0 + this.sand.heightAt(f.p.x, f.p.z) + 0.012;
        lo.y = floor;
        f.gt -= dt;
        if (f.gt <= 0) {
          f.goal.set(rnd(lo.x, hi.x), rnd(Math.max(floor + 0.01, TK.y0 + 0.04), hi.y), rnd(lo.z, hi.z));
          f.gt = rnd(1.5, 4);
        }
        const acc = this.tmp.subVectors(f.goal, f.p).normalize().multiplyScalar(0.06);
        // points of interest
        for (const q of this.poi) {
          const d = q.p.clone().sub(f.p); const L = d.length();
          if (L < q.radius) acc.addScaledVector(d.normalize(), q.w * 0.25 * Math.min(1, L / 0.03 - 0.4));
        }
        if (f.sp.name === 'tetra' && cn > 1) acc.addScaledVector(cen.clone().sub(f.p), 0.6);
        // walls
        const m = 0.03;
        if (f.p.x < lo.x + m) acc.x += 0.4; if (f.p.x > hi.x - m) acc.x -= 0.4;
        if (f.p.z < lo.z + m) acc.z += 0.4; if (f.p.z > hi.z - m) acc.z -= 0.4;
        if (f.p.y < lo.y + 0.01) acc.y += 0.4; if (f.p.y > hi.y - 0.01) acc.y -= 0.4;
        acc.y *= 0.5;
        f.v.addScaledVector(acc, dt);
        const sp = f.sp.speed * (1 + (f.burst || 0));
        if (f.burst) f.burst = Math.max(0, f.burst - dt * 0.6);
        const L = f.v.length(); if (L > sp) f.v.multiplyScalar(sp / L); if (L < sp * 0.3) f.v.multiplyScalar(1.05);
        f.v.y *= 0.96;
        f.p.addScaledVector(f.v, dt);
        f.p.clamp(new THREE.Vector3(TK.x0 + 0.008, lo.y - 0.005, TK.z0 + 0.008), new THREE.Vector3(TK.x1 - 0.008, hi.y + 0.005, TK.z1 - 0.008));
      }
      // orient along velocity (horizontal heading + pitch)
      const vx = f.v.x, vz = f.v.z, vy = f.v.y;
      const yaw = Math.atan2(-vz, vx);
      const pitch = Math.atan2(vy, Math.hypot(vx, vz)) * 0.6;
      const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, pitch, 'YZX'));
      f.q.slerp(target, Math.min(1, dt * 5));
      const s = f.inBag ? 0.85 * (f.bagS || 1) : 1;
      this.m.compose(f.p, f.q, new THREE.Vector3(s, s, s));
      f.mesh.setMatrixAt(f.i, this.m);
      f.mesh.geometry.attributes.aAmp.array[f.i] = 0.6 + Math.min(1.4, f.v.length() / f.sp.speed);
    }
    for (const m of this.meshes) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aAmp.needsUpdate = true; }
  }
}

// ---------------------------------------------------------------- particles (sand stream, motes, drops)
export class Particles {
  constructor(group, max = 1600) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 3); this.s = new Float32Array(max); this.life = new Float32Array(max); this.kind = new Uint8Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, size * uScale / -mv.z); }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard;
        float sh = 0.75 + 0.5 * (0.5 - d.y - d.x) ; gl_FragColor = vec4(vC * sh, 1.0); }`,
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false;
    group.add(this.pts); this.geo = g;
    this.onLand = null;
  }
  emit(x, y, z, vx, vy, vz, col, size, kind = 0, life = 3) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.c[i * 3] = col[0]; this.c[i * 3 + 1] = col[1]; this.c[i * 3 + 2] = col[2];
    this.s[i] = size; this.life[i] = life; this.kind[i] = kind;
  }
  update(dt, ground) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      const k = this.kind[i];
      this.v[i * 3 + 1] -= 9.8 * dt * (k === 1 ? 0.0 : 1);
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      let dead = this.life[i] <= 0;
      if (!dead && ground) { const gy = ground(this.p[i * 3], this.p[i * 3 + 2], k); if (this.p[i * 3 + 1] <= gy) { if (this.onLand) this.onLand(this.p[i * 3], gy, this.p[i * 3 + 2], k, this.s[i]); dead = true; } }
      if (dead) {
        const j = --this.n;
        if (i !== j) {
          for (let a = 0; a < 3; a++) { this.p[i * 3 + a] = this.p[j * 3 + a]; this.v[i * 3 + a] = this.v[j * 3 + a]; this.c[i * 3 + a] = this.c[j * 3 + a]; }
          this.s[i] = this.s[j]; this.life[i] = this.life[j]; this.kind[i] = this.kind[j];
        }
        i--;
      }
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.size.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- bubbles (instanced spheres)
export class Bubbles {
  constructor(group) {
    this.max = 160; this.list = [];
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, envMapIntensity: 2.2, depthWrite: false, specularIntensity: 1, emissive: new THREE.Color(0.25, 0.32, 0.33) });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        float fr = 1.0 - abs(dot(normalize(vViewPosition), normal));
        diffuseColor.a = clamp(0.08 + pow(fr, 2.0) * 1.2, 0.0, 0.9);
        #include <opaque_fragment>`);
    };
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, this.max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    group.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion();
  }
  emit(x, y, z, r = rnd(0.0012, 0.003)) { if (this.list.length < this.max) this.list.push({ x, y, z, r, ph: rnd(0, 6), vy: 0.1 + r * 30 }); }
  update(dt, level, audio) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.y += b.vy * dt; b.ph += dt * 9;
      b.x += Math.sin(b.ph) * 0.02 * dt; b.z += Math.cos(b.ph * 0.8) * 0.015 * dt;
      if (b.y > level - b.r) { this.list.splice(i, 1); if (audio && Math.random() < 0.08) audio.bubble(0.05); continue; }
    }
    for (const b of this.list) {
      this.m.compose(new THREE.Vector3(b.x, b.y, b.z), this.q, new THREE.Vector3(b.r * (1 + Math.sin(b.ph) * 0.12), b.r * (1 - Math.sin(b.ph) * 0.12), b.r));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- light shafts
export function makeShafts(group) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uI: { value: 0 }, uLevel: U.uLevel },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime, uI, uLevel;
      float h(float x){ return fract(sin(x*91.3)*437.5); }
      float n1(float x){ float i=floor(x), f=fract(x); return mix(h(i), h(i+1.0), f*f*(3.0-2.0*f)); }
      void main(){
        if (vW.y > uLevel) discard;
        float x = vUv.x;
        float rays = n1(x*9.0 + uTime*0.25) * n1(x*23.0 - uTime*0.4 + 3.0);
        float edge = smoothstep(0.0, 0.3, x) * smoothstep(1.0, 0.7, x);
        float fall = pow(vUv.y, 1.6);
        gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * rays * edge * fall * uI, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shafts = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const w = rnd(0.07, 0.14);
    const g = new THREE.PlaneGeometry(w, TK.H);
    const m = new THREE.Mesh(g, mat);
    m.position.set(rnd(TK.x0 + 0.06, TK.x1 - 0.06), TK.y0 + TK.H / 2, rnd(-0.08, 0.08));
    m.rotation.set(0, rnd(-0.6, 0.6), rnd(-0.16, 0.16));
    m.renderOrder = 4;
    shafts.add(m);
  }
  group.add(shafts);
  return { group: shafts, mat };
}

// ---------------------------------------------------------------- turbidity field (x by y over the tank front)
export class Turbidity {
  constructor() {
    this.NX = 40; this.NY = 24;
    this.v = new Float32Array(this.NX * this.NY);
    this.data = new Uint8Array(this.NX * this.NY * 4);
    this.tex = new THREE.DataTexture(this.data, this.NX, this.NY, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter; this.tex.needsUpdate = true;
    U.tTurb.value = this.tex;
  }
  stir(x, yLevelFrac, amt) { // add murk around x, spreading from the bottom up to the level
    const i0 = clamp(Math.round((x - TK.x0) / TK.W * (this.NX - 1)), 0, this.NX - 1);
    const top = Math.max(1, Math.round(yLevelFrac * (this.NY - 1)));
    for (let j = 0; j <= top; j++) for (let di = -5; di <= 5; di++) {
      const i = i0 + di; if (i < 0 || i >= this.NX) continue;
      const w = Math.exp(-di * di / 10) * (1 - j / (top + 4) * 0.6);
      const p = j * this.NX + i; this.v[p] = Math.min(1.3, this.v[p] + amt * w);
    }
  }
  update(dt, levelFrac) {
    const N = this.NX, M = this.NY, v = this.v;
    // diffuse sideways and upward, settle: bottom clears first
    const nv = new Float32Array(v.length);
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const p = j * N + i;
      const l = v[j * N + Math.max(i - 1, 0)], r = v[j * N + Math.min(i + 1, N - 1)], d = v[Math.max(j - 1, 0) * N + i], u = v[Math.min(j + 1, M - 1) * N + i];
      let x = v[p] + (l + r + d + u - 4 * v[p]) * Math.min(0.24, dt * 2.0);
      const y = j / (M - 1);
      const rate = 0.05 + 0.16 * (1 - y / Math.max(levelFrac, 0.05)) ** 2;
      x -= x * rate * dt;
      if (y > levelFrac + 0.04) x = 0;
      nv[p] = Math.max(0, x);
    }
    v.set(nv);
    let s = 0;
    for (let p = 0; p < v.length; p++) { const q = Math.min(255, v[p] * 200); this.data[p * 4] = q; s += v[p]; }
    this.tex.needsUpdate = true;
    this.mean = s / v.length;
  }
}
