// Effects: flames, lit puffs (smoke/steam), water droplets/streaks, paint maps (wet/soot/heat).
import * as THREE from '../lib/three.module.min.js';
import { tex } from './gfx.js';

const V = THREE.Vector3;

// ---------------------------------------------------------------- paint map (R=wet, G=soot, B=heat)
export class PaintMap {
  constructor(w, h, metersW, metersH) {
    this.w = w; this.h = h; this.mw = metersW; this.mh = metersH;
    this.wet = new Float32Array(w * h); this.damp = new Float32Array(w * h);
    this.soot = new Float32Array(w * h); this.heat = new Float32Array(w * h);
    this.data = new Uint8Array(w * h * 4);
    this.tex = new THREE.DataTexture(this.data, w, h, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.drips = [];
    this.dirty = true;
    this.vertical = true;
  }
  // u,v in 0..1 ; radius in meters
  splat(ch, u, v, rm, amount, mode = 'add', soft = 1) {
    const arr = this[ch];
    const rx = rm / this.mw * this.w, ry = rm / this.mh * this.h;
    const cx = u * this.w, cy = v * this.h;
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry; const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const f = Math.pow(1 - d2, soft) * amount;
      const i = y * this.w + x;
      if (mode === 'add') arr[i] = Math.min(1, arr[i] + f);
      else if (mode === 'sub') arr[i] = Math.max(0, arr[i] - f);
      else if (mode === 'max') arr[i] = Math.max(arr[i], f);
    }
    this.dirty = true;
  }
  // irregular splat made of several sub-blobs (looks like real water landing)
  splash(u, v, rm, amount, rnd = Math.random) {
    this.splat('wet', u, v, rm * 0.6, amount, 'add', 1.5);
    for (let i = 0; i < 3; i++) {
      const a = rnd() * 6.283, r = rm * (0.4 + rnd() * 0.7);
      this.splat('wet', u + Math.cos(a) * r / this.mw, v + Math.sin(a) * r / this.mh, rm * (0.15 + rnd() * 0.3), amount * 0.8, 'add', 1.2);
    }
    if (this.vertical && amount > 0.05 && this.drips.length < 90 && rnd() < 0.12) {
      this.drips.push({ u: u + (rnd() - 0.5) * rm / this.mw, v, s: 0.25 + rnd() * 0.5, w: 0.012 + rnd() * 0.02, life: 2 + rnd() * 5 });
    }
  }
  sample(ch, u, v) {
    const x = Math.min(this.w - 1, Math.max(0, Math.floor(u * this.w))), y = Math.min(this.h - 1, Math.max(0, Math.floor(v * this.h)));
    return this[ch][y * this.w + x];
  }
  update(dt) {
    // drips run down leaving wet trails
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      const step = d.s * dt;
      d.v -= step / this.mh; d.u += (Math.random() - 0.5) * 0.002; d.life -= dt;
      d.s *= 0.995;
      this.splat('wet', d.u, d.v, d.w, 0.6, 'max', 0.6);
      if (d.v < 0 || d.life < 0) this.drips.splice(i, 1);
    }
    // slow evaporation of fresh water down to a lasting damp level
    this.tick = (this.tick || 0) + dt;
    if (this.tick > 0.25) {
      const k = this.tick; this.tick = 0;
      const wet = this.wet, damp = this.damp, heat = this.heat;
      for (let i = 0; i < wet.length; i++) {
        if (wet[i] > 0) {
          damp[i] = Math.max(damp[i], Math.min(wet[i], 0.55));
          wet[i] = Math.max(damp[i], wet[i] - k * 0.02 * (1 + heat[i] * 6));
        }
      }
      this.dirty = true;
    }
    this.upT = (this.upT || 0) + dt;
    if (this.dirty && this.upT > 0.08) {
      this.upT = 0;
      const D = this.data;
      for (let i = 0, j = 0; i < this.wet.length; i++, j += 4) {
        D[j] = this.wet[i] * 255; D[j + 1] = this.soot[i] * 255; D[j + 2] = this.heat[i] * 255; D[j + 3] = 255;
      }
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
  }
  coverage(ch, u0, v0, u1, v1, thr = 0.3) {
    let n = 0, c = 0;
    for (let y = Math.floor(v0 * this.h); y < Math.floor(v1 * this.h); y += 2) for (let x = Math.floor(u0 * this.w); x < Math.floor(u1 * this.w); x += 2) { n++; if (this[ch][y * this.w + x] > thr) c++; }
    return n ? c / n : 0;
  }
}

// ---------------------------------------------------------------- flames
const FLAME_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FLAME_FS = `
uniform sampler2D uNoise; uniform float uTime; uniform float uSeed; uniform float uPower; uniform float uSmolder;
varying vec2 vUv;
float fbm(vec2 p){ return texture2D(uNoise, p).g * 0.5 + texture2D(uNoise, p * 2.03 + 0.17).b * 0.3 + texture2D(uNoise, p * 4.1 + 0.53).r * 0.2; }
void main(){
  float y = vUv.y;
  float x = (vUv.x - 0.5) * 2.0;
  float n = fbm(vec2(x * 0.35 + uSeed, y * 0.55 - uTime * 0.75));
  float n2 = fbm(vec2(x * 0.8 + uSeed * 3.0, y * 1.1 - uTime * 1.35));
  float px = x + (n - 0.5) * 1.2 * y + (n2 - 0.5) * 0.25;
  float width = mix(0.95, 0.3, y);
  float body = 1.0 - smoothstep(0.15, 1.0, abs(px) / width);
  float flame = body * (1.0 - y) * 2.1 - (n * 1.1 + n2 * 0.8) * pow(y, 0.8) * 1.6 + (n2 - 0.5) * 0.25;
  flame *= smoothstep(0.0, 0.06, y);
  flame = clamp(flame, 0.0, 1.2);
  float heat = flame * 1.25;
  vec3 c = mix(vec3(0.55, 0.06, 0.0), vec3(1.0, 0.3, 0.03), smoothstep(0.03, 0.3, heat));
  c = mix(c, vec3(1.0, 0.6, 0.16), smoothstep(0.3, 0.7, heat));
  c = mix(c, vec3(1.0, 0.86, 0.55), smoothstep(0.75, 1.3, heat));
  float a = smoothstep(0.02, 0.3, flame);
  c = mix(c, vec3(0.9, 0.18, 0.02), uSmolder);
  gl_FragColor = vec4(c * a * uPower * (0.55 + heat * 1.5), a);
}`;

let noiseTex = null;
export function getNoise() { if (!noiseTex) { noiseTex = tex('noise.png', false); } return noiseTex; }

export class Fire {
  constructor(parent, pos, size, o = {}) {
    this.pos = pos.clone(); this.size = size;
    this.H = 1; this.r = o.r ?? size * 0.75; this.steam = 0; this.out = false; this.id = o.id ?? 0;
    this.group = new THREE.Group(); this.group.position.copy(pos); parent.add(this.group);
    this.flames = [];
    const nf = o.layers ?? 3;
    for (let i = 0; i < nf; i++) {
      const m = new THREE.ShaderMaterial({
        vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uNoise: { value: getNoise() }, uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uPower: { value: 1 }, uSmolder: { value: 0 } },
      });
      const g = new THREE.PlaneGeometry(1.1, 2.0); g.translate(0, 1.0, 0);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set((i - (nf - 1) / 2) * size * (o.spread ?? 0.35), 0, (i % 2) * 0.05);
      mesh.userData.w = (1 - Math.abs(i - (nf - 1) / 2) * 0.22) * (0.85 + Math.random() * 0.3);
      mesh.renderOrder = 5;
      this.group.add(mesh); this.flames.push(mesh);
    }
    this.light = new THREE.PointLight(0xff8a3a, 0, 0, 2);
    this.light.position.copy(pos).add(new V(0, size * 0.9, o.lightZ ?? 0.6));
    parent.add(this.light);
    this.lightPower = o.light ?? 14;
    this.smokeAcc = 0; this.steamAcc = 0;
    this.burst = 0;
    this.smokeZ = o.smokeZ ?? 0; this.smokeUp = o.smokeUp ?? 0;
  }
  cool(amount) {
    if (this.H <= 0) return 0;
    const before = this.H;
    this.H = Math.max(0, this.H - amount);
    this.steam = Math.min(1.5, this.steam + amount * 6 + 0.05);
    return before - this.H;
  }
  update(dt, t, cam, smoke) {
    const H = this.H;
    const flameK = H > 0.45 ? 0.55 + 0.45 * (H - 0.45) / 0.55 : (H > 0.12 ? 0.18 + (H - 0.12) * 1.1 : H * 1.5);
    const smolder = H > 0.45 ? 0 : 1 - Math.max(0, (H - 0.12) / 0.33);
    const flick = 0.85 + 0.15 * Math.sin(t * 17 + this.id) * Math.sin(t * 9.3 + this.id * 2);
    this.flames.forEach((m, i) => {
      const s = this.size * flameK * m.userData.w * (0.9 + 0.1 * Math.sin(t * 5 + i * 2));
      m.scale.set(s, s * (1 + 0.1 * Math.sin(t * 7 + i)), s);
      m.visible = s > 0.01;
      m.material.uniforms.uTime.value = t + i * 3.1;
      m.material.uniforms.uPower.value = H > 0 ? (0.6 + 0.4 * flick) : 0;
      m.material.uniforms.uSmolder.value = smolder * 0.6;
      const wp = m.getWorldPosition(_a);
      m.rotation.y = Math.atan2(cam.position.x - wp.x, cam.position.z - wp.z);
    });
    this.light.intensity = this.lightPower * Math.pow(Math.max(0, H), 0.8) * flick * (H > 0 ? 1 : 0) + this.burst * 4;
    this.burst = Math.max(0, this.burst - dt * 3);
    // smoke from flames (dark), smolder (grey), steam (white)
    if (smoke) {
      this.smokeAcc += dt * (H > 0 ? (H > 0.45 ? 5 : 9) : 0);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        const top = this.pos.clone().add(new V((Math.random() - 0.5) * this.size * 0.5, this.size * (0.6 + flameK * 1.2) + this.smokeUp, (Math.random() - 0.2) * 0.2 + this.smokeZ));
        const dark = H > 0.45 ? 0.16 : 0.32;
        smoke.spawn({ p: top, v: new V((Math.random() - 0.5) * 0.15, 0.6 + Math.random() * 0.4, 0.15 + Math.random() * 0.1), size: this.size * (0.35 + Math.random() * 0.3), grow: 0.55 + Math.random() * 0.4, life: 2.8 + Math.random() * 2, alpha: H > 0.45 ? 0.5 : 0.42, col: [dark, dark * 0.97, dark * 0.95], kind: 0 });
      }
      this.steam = Math.max(0, this.steam - dt * 0.6);
      this.steamAcc += dt * this.steam * 10;
      while (this.steamAcc > 1) {
        this.steamAcc -= 1;
        const p = this.pos.clone().add(new V((Math.random() - 0.5) * this.size * 0.9, this.size * (0.15 + Math.random() * 0.6), (Math.random() - 0.3) * 0.3));
        smoke.spawn({ p, v: new V((Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 1.0, 0.25 + Math.random() * 0.3), size: this.size * (0.2 + Math.random() * 0.35), grow: 0.8 + Math.random() * 0.9, life: 1.6 + Math.random() * 1.8, alpha: 0.1 + Math.random() * 0.1, col: [0.8, 0.8, 0.82], kind: 1 });
      }
    }
    if (H <= 0 && !this.out && this.steam < 0.2) this.out = true;
  }
}
const _a = new V();

// ---------------------------------------------------------------- puff particles (smoke/steam), lit on CPU, depth-sorted
const PUFF_VS = `
attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iData; // size, rot, frame
varying vec2 vUv; varying vec4 vCol; varying float vFrame;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iData.x;
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
  vUv = uv; vCol = iCol; vFrame = iData.z;
}`;
const PUFF_FS = `
uniform sampler2D uAtlas; varying vec2 vUv; varying vec4 vCol; varying float vFrame;
void main(){
  float f = floor(vFrame + 0.5);
  vec2 off = vec2(mod(f, 2.0), floor(f / 2.0)) * 0.5;
  float a = texture2D(uAtlas, vUv * 0.5 + off).a;
  a *= vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * a, a);
}`;

export class Puffs {
  constructor(parent, max = 500) {
    this.max = max; this.n = 0;
    this.P = [];
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aDat = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iData', this.aDat);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uAtlas: { value: tex('puff.png', false) } } });
    this.mat.blending = THREE.CustomBlending; this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8;
    parent.add(this.mesh);
    this.light = { amb: new THREE.Color(0.55, 0.52, 0.6), sun: new THREE.Color(1.6, 0.95, 0.55), sunDir: new V(-0.5, 0.2, 0.8).normalize() };
    this.fires = [];
    this.wind = new V(0.15, 0, 0.05);
    this.ceiling = null;
  }
  spawn(o) {
    if (this.P.length >= this.max) this.P.shift();
    this.P.push({ p: o.p.clone(), v: o.v.clone(), s: o.size, grow: o.grow ?? 0.5, life: o.life ?? 3, age: 0, a: o.alpha ?? 0.5, col: o.col ?? [0.5, 0.5, 0.5], kind: o.kind ?? 0, rot: Math.random() * 6.28, rv: (Math.random() - 0.5) * 0.6, frame: Math.floor(Math.random() * 4), drag: o.drag ?? 1.2, buoy: o.buoy ?? 0.25 });
  }
  update(dt, cam) {
    const P = this.P;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.age += dt;
      if (q.age > q.life) { P.splice(i, 1); continue; }
      q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.v.y += q.buoy * dt;
      q.v.addScaledVector(this.wind, dt * 0.8);
      q.p.addScaledVector(q.v, dt);
      if (this.ceiling !== null && q.p.y > this.ceiling) { q.p.y = this.ceiling; q.v.y = 0; }
      q.s += q.grow * dt * (1 - q.age / q.life * 0.5);
      q.rot += q.rv * dt;
    }
    // sort back-to-front
    const cp = cam.position;
    for (const q of P) q.d = q.p.distanceToSquared(cp);
    P.sort((a, b) => b.d - a.d);
    const pos = this.aPos.array, col = this.aCol.array, dat = this.aDat.array;
    const L = this.light;
    const n = Math.min(P.length, this.max);
    for (let i = 0; i < n; i++) {
      const q = P[i];
      const u = q.age / q.life;
      const fade = Math.min(1, q.age * 4) * (1 - u) * (1 - u * 0.3);
      // lighting: ambient + sun (forward scattering toward camera) + nearby fire glow
      let r = q.col[0] * (L.amb.r + L.sun.r * 0.55), g = q.col[1] * (L.amb.g + L.sun.g * 0.55), b = q.col[2] * (L.amb.b + L.sun.b * 0.55);
      for (const f of this.fires) {
        if (f.H <= 0) continue;
        const d2 = q.p.distanceToSquared(f.pos) + 0.3;
        const k = Math.min(0.45, f.H * 0.25 / d2);
        r += q.col[0] * 1.0 * k * 1.5 + 0.08 * k; g += q.col[1] * 0.45 * k + 0.03 * k; b += q.col[2] * 0.12 * k;
      }
      pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
      col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = q.a * fade;
      dat[i * 3] = q.s; dat[i * 3 + 1] = q.rot; dat[i * 3 + 2] = q.frame;
    }
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aDat.needsUpdate = true;
  }
  clear() { this.P.length = 0; }
}

// ---------------------------------------------------------------- water droplets (stretched along motion)
const DROP_VS = `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iDat; // size, alpha, twinkle, rainbow
uniform float uStretch; uniform vec3 uAnti; uniform float uRainbow; uniform float uAspect;
varying vec2 vUv; varying float vA; varying float vTw; varying vec3 vRb;
vec3 spectrum(float x){ // x 0..1 : red->violet
  vec3 c = vec3(1.0 - smoothstep(0.25,0.55,x) , smoothstep(0.15,0.45,x)*(1.0-smoothstep(0.55,0.85,x)), smoothstep(0.55,0.85,x));
  return c;
}
void main(){
  vec4 c0 = modelViewMatrix * vec4(iPos, 1.0);
  vec4 c1 = modelViewMatrix * vec4(iPos - iVel * uStretch, 1.0);
  vec4 p0 = projectionMatrix * c0; vec4 p1 = projectionMatrix * c1;
  vec2 s0 = p0.xy / p0.w; vec2 s1 = p1.xy / p1.w;
  vec2 d = (s0 - s1) * vec2(uAspect, 1.0); float len = length(d);
  vec2 dir = d / max(len, 1e-5);
  if (len < 1e-5) dir = vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = iDat.x / max(0.2, -c0.z) * projectionMatrix[1][1] * 0.5;
  vec2 off = (nrm * position.x * w + dir * position.y * w) * vec2(1.0 / uAspect, 1.0);
  vec2 sp = mix(s1, s0, position.y + 0.5) + off;
  gl_Position = vec4(sp * p0.w, p0.z, p0.w);
  vUv = uv; vA = iDat.y; vTw = iDat.z;
  // rainbow: angle between view ray and antisolar direction (primary ~42 deg)
  vec3 wp = (modelMatrix * vec4(iPos,1.0)).xyz;
  vec3 vd = normalize(wp - cameraPosition);
  float ang = degrees(acos(clamp(dot(vd, uAnti), -1.0, 1.0)));
  float x = (42.3 - ang) / 2.0;
  vRb = (x > 0.0 && x < 1.0) ? spectrum(x) * uRainbow : vec3(0.0);
}`;
const DROP_FS = `
uniform vec3 uCol; uniform vec3 uGlint;
varying vec2 vUv; varying float vA; varying float vTw; varying vec3 vRb;
void main(){
  vec2 q = vUv - 0.5; float r = length(q * vec2(2.0, 1.0)) * 2.0;
  float a = (1.0 - smoothstep(0.3, 1.0, r)) * vA;
  if (a < 0.003) discard;
  vec3 c = uCol + uGlint * vTw + vRb * 3.0;
  gl_FragColor = vec4(c * a, a * 0.85);
}`;

export class Drops {
  constructor(parent, max = 1800) {
    this.max = max;
    this.P = [];
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aDat = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iVel', this.aVel); g.setAttribute('iDat', this.aDat);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: DROP_VS, fragmentShader: DROP_FS, transparent: true, depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uAspect: { value: 1 }, uStretch: { value: 0.03 }, uCol: { value: new THREE.Color(0.95, 0.97, 1.0) }, uGlint: { value: new THREE.Color(3.0, 2.2, 1.4) }, uAnti: { value: new V(0, -0.1, -1).normalize() }, uRainbow: { value: 0 } },
    });
    this.mat.blending = THREE.CustomBlending; this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    parent.add(this.mesh);
    this.g = 9.8;
  }
  emit(p, v, o = {}) {
    if (this.P.length >= this.max) return null;
    const q = { p: p.clone(), pp: p.clone(), v: v.clone(), life: o.life ?? 2, age: 0, s: o.size ?? 0.02, a: o.alpha ?? 0.8, kind: o.kind ?? 0, drag: o.drag ?? 0.05, tw: Math.random() < 0.25 ? Math.random() : 0, src: o.src ?? 0 };
    this.P.push(q);
    return q;
  }
  update(dt, collide) {
    const P = this.P;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.age += dt;
      if (q.age > q.life) { P.splice(i, 1); continue; }
      q.pp.copy(q.p);
      q.v.y -= this.g * dt * (q.kind === 2 ? 0.12 : 1);
      if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (collide && collide(q)) { P.splice(i, 1); continue; }
    }
    const n = Math.min(P.length, this.max);
    const pos = this.aPos.array, vel = this.aVel.array, dat = this.aDat.array;
    for (let i = 0; i < n; i++) {
      const q = P[i];
      pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
      vel[i * 3] = q.v.x; vel[i * 3 + 1] = q.v.y; vel[i * 3 + 2] = q.v.z;
      const u = q.age / q.life;
      dat[i * 4] = q.s * (q.kind === 2 ? 1 + u * 2.5 : 1); dat[i * 4 + 1] = q.a * (1 - u * u) * Math.min(1, q.age * 20 + 0.3);
      dat[i * 4 + 2] = q.tw * (0.5 + 0.5 * Math.sin(q.age * 30 + i)); dat[i * 4 + 3] = 0;
    }
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = true; this.aVel.needsUpdate = true; this.aDat.needsUpdate = true;
  }
}

// ballistic launch velocity from p0 to p1 with flight time T
export function launchVel(p0, p1, T, g = 9.8) {
  return new V((p1.x - p0.x) / T, (p1.y - p0.y) / T + 0.5 * g * T, (p1.z - p0.z) / T);
}
