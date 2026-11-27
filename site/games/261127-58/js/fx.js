// fx.js — lit-looking soft particles: steam, smoke puffs, frit dust, sun motes, sparks.
import * as THREE from './three.module.min.js';
import { loadTex } from './core.js';

export class Particles {
  constructor(scene, { max = 600, additive = false, tex = 'puff.png', atlas = 2, depthWrite = false } = {}) {
    this.max = max; this.n = 0;
    this.p = []; // particle objects
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.sz = new Float32Array(max); this.rot = new Float32Array(max); this.fr = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('psize', new THREE.BufferAttribute(this.sz, 1));
    g.setAttribute('prot', new THREE.BufferAttribute(this.rot, 1));
    g.setAttribute('pfr', new THREE.BufferAttribute(this.fr, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: loadTex(tex, false) }, scale: { value: 800 }, atlas: { value: atlas } },
      vertexShader: `attribute vec4 pcol; attribute float psize; attribute float prot; attribute float pfr;
        uniform float scale; varying vec4 vC; varying float vR; varying float vF;
        void main(){ vC = pcol; vR = prot; vF = pfr; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform float atlas; varying vec4 vC; varying float vR; varying float vF;
        void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = mat2(c, -s, s, c) * p + 0.5;
          if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
          float fi = floor(vF); vec2 cell = vec2(mod(fi, atlas), floor(fi / atlas));
          float a = texture2D(map, (p + cell) / atlas).r * vC.a; if (a < 0.003) discard;
          gl_FragColor = vec4(vC.rgb, a); }`,
      transparent: true, depthWrite, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(o) { if (this.p.length >= this.max) this.p.shift(); this.p.push({ age: 0, rot: Math.random() * 6.28, fr: Math.floor(Math.random() * 4), ...o }); }
  update(dt) {
    const P = this.p; let k = 0;
    for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; q.age += dt; if (q.age >= q.life) P.splice(i, 1); }
    for (const q of P) {
      const t = q.age / q.life;
      q.v.y += (q.buoy || 0) * dt; q.v.multiplyScalar(Math.exp(-(q.drag || 0) * dt));
      if (q.grav) q.v.y -= q.grav * dt;
      q.x.addScaledVector(q.v, dt);
      if (q.floor != null && q.x.y < q.floor) { q.x.y = q.floor; q.v.set(0, 0, 0); }
      this.pos[k * 3] = q.x.x; this.pos[k * 3 + 1] = q.x.y; this.pos[k * 3 + 2] = q.x.z;
      const fade = Math.min(1, t * (q.fadeIn || 6)) * Math.pow(1 - t, q.fadeOut || 1.4);
      this.col[k * 4] = q.c[0]; this.col[k * 4 + 1] = q.c[1]; this.col[k * 4 + 2] = q.c[2]; this.col[k * 4 + 3] = q.a * fade;
      this.sz[k] = q.s0 + (q.s1 - q.s0) * t; this.rot[k] = q.rot + (q.spin || 0) * q.age; this.fr[k] = q.fr;
      k++;
    }
    this.n = k;
    const g = this.points.geometry;
    g.setDrawRange(0, k);
    for (const a of ['position', 'pcol', 'psize', 'prot', 'pfr']) g.attributes[a].needsUpdate = true;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = (a) => (Math.random() - 0.5) * a;

export class FX {
  constructor(scene) {
    this.steam = new Particles(scene, { max: 500 });
    this.glow = new Particles(scene, { max: 300, additive: true });
  }
  steamAt(p, strength = 1, tint = [0.92, 0.92, 0.9]) {
    // steam rises, swells, is lit warm-ish by the room
    for (let i = 0; i < Math.ceil(2 * strength); i++) {
      const s = 0.03 + Math.random() * 0.05;
      this.steam.emit({ x: p.clone().add(V(R(0.06), R(0.01), R(0.06))), v: V(R(0.08), 0.18 + Math.random() * 0.25, R(0.08)), buoy: 0.25, drag: 1.2,
        life: 1.2 + Math.random() * 1.6, s0: s, s1: s * (3 + Math.random() * 3), a: 0.22 + Math.random() * 0.18, c: tint, spin: R(1.5), fadeIn: 8, fadeOut: 1.2 });
    }
  }
  smokePuff(p, n = 10) {
    for (let i = 0; i < n; i++) {
      const s = 0.02 + Math.random() * 0.03;
      this.steam.emit({ x: p.clone().add(V(R(0.04), R(0.02), R(0.04))), v: V(R(0.15), 0.15 + Math.random() * 0.2, R(0.15)), buoy: 0.1, drag: 2,
        life: 0.9 + Math.random() * 0.9, s0: s, s1: s * 4, a: 0.35, c: [0.42, 0.4, 0.38], spin: R(2) });
    }
  }
  frit(p, col) {
    for (let i = 0; i < 3; i++) {
      this.steam.emit({ x: p.clone().add(V(R(0.06), 0.005, R(0.06))), v: V(R(0.1), 0.15 + Math.random() * 0.2, R(0.1)), grav: 1.5, drag: 1,
        life: 0.5 + Math.random() * 0.5, s0: 0.004 + Math.random() * 0.004, s1: 0.003, a: 0.9, c: col.map(c => c / 255 * 0.8), fadeOut: 0.5 });
    }
  }
  sparks(p, n = 6) {
    for (let i = 0; i < n; i++) {
      this.glow.emit({ x: p.clone(), v: V(R(0.6), 0.3 + Math.random() * 0.6, R(0.6)), grav: 3, drag: 0.5, life: 0.4 + Math.random() * 0.4,
        s0: 0.006, s1: 0.002, a: 1, c: [3, 1.2, 0.3], fadeIn: 30, fadeOut: 1 });
    }
  }
  mote(box, sunK) {
    // floating dust lit by the morning sun
    if (Math.random() > 0.5 * sunK) return;
    const x = V(box.min.x + Math.random() * (box.max.x - box.min.x), box.min.y + Math.random() * (box.max.y - box.min.y), box.min.z + Math.random() * (box.max.z - box.min.z));
    this.glow.emit({ x, v: V(R(0.02), R(0.015), R(0.02)), life: 4 + Math.random() * 4, s0: 0.0025 + Math.random() * 0.003, s1: 0.003, a: 0.5 * sunK, c: [1.3, 1.15, 0.95], fadeIn: 1.5, fadeOut: 1.5, fr: 0 });
  }
  update(dt) { this.steam.update(dt); this.glow.update(dt); }
}
