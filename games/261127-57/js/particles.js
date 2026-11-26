// Mist / water jet / steam / dust motes: CPU-simulated points, sprite-shaded with forward
// scattering so that backlit droplets glow in the low morning sun. Sizes & speeds vary.
import * as THREE from '../lib/three.module.min.js';
import { SUN_DIR, SUN_COLOR } from './room.js';

export class Particles {
  constructor(scene, cap = 1800) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.alpha = new Float32Array(cap);
    this.free = [];
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aKind = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aKind', this.aKind);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 800 }, uSunDir: { value: SUN_DIR }, uSunCol: { value: SUN_COLOR } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute float aKind;
        uniform float uScale; uniform vec3 uSunDir;
        varying float vA; varying float vK; varying float vPhase;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, aSize * uScale / -mv.z);
          vec3 V = normalize(position - cameraPosition);
          float c = dot(V, uSunDir);
          // Henyey-Greenstein-ish forward scattering
          float g = 0.72;
          vPhase = (1.0 - g*g) / pow(1.0 + g*g - 2.0*g*c, 1.5) * 0.12;
          vA = aAlpha; vK = aKind;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uSunCol;
        varying float vA; varying float vK; varying float vPhase;
        void main(){
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(q, q);
          if (r2 > 1.0) discard;
          vec3 base = vec3(0.78, 0.82, 0.84);
          float a;
          vec3 col;
          if (vK < 0.5) { // fine mist: soft gaussian blob
            a = exp(-r2 * 2.5) * vA * 0.6;
            col = base * 0.95 + uSunCol * vPhase * 5.0;
          } else if (vK < 1.5) { // jet drop: crisp bead with glint
            float z = sqrt(1.0 - r2);
            a = vA * (0.5 + 0.5 * pow(1.0 - z, 1.5));
            col = vec3(0.55, 0.62, 0.62) + uSunCol * (vPhase * 1.5 + exp(-dot(q - vec2(-0.3, 0.35), q - vec2(-0.3, 0.35)) * 40.0) * 3.0);
          } else if (vK < 2.5) { // steam puff
            a = exp(-r2 * 2.2) * vA * 0.55;
            col = vec3(0.92) + uSunCol * vPhase * 0.8;
          } else { // dust mote
            a = exp(-r2 * 5.0) * vA;
            col = uSunCol * (0.4 + vPhase * 3.0);
          }
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    scene.add(this.points);
    this.onHit = null;
  }

  emit(kind, p, v, life, size, alpha = 1) {
    const i = this.free.pop();
    if (i === undefined) return;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.max[i] = life;
    this.size[i] = size; this.kind[i] = kind; this.alpha[i] = alpha;
    this.aKind.array[i] = kind;
  }

  update(dt, collide) {
    const P = this.pos, Vv = this.vel;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = this.kind[i];
      const o = i * 3;
      if (this.life[i] <= 0) { this.size[i] = 0; this.alpha[i] = 0; this.free.push(i); continue; }
      let drag, grav;
      if (k === 0) { drag = 1.6; grav = -1.6; }
      else if (k === 1) { drag = 0.25; grav = -6.0; }
      else if (k === 2) { drag = 1.5; grav = 0.03; }
      else { drag = 0.5; grav = 0.0; }
      const f = Math.exp(-drag * dt);
      Vv[o] *= f; Vv[o + 1] = Vv[o + 1] * f + grav * dt; Vv[o + 2] *= f;
      if (k === 0 || k === 3) {
        const t = performance.now() * 0.001;
        Vv[o] += Math.sin(t * 1.3 + i) * 0.004 * dt * 10; Vv[o + 2] += Math.cos(t * 1.1 + i * 1.7) * 0.004 * dt * 10;
      }
      P[o] += Vv[o] * dt; P[o + 1] += Vv[o + 1] * dt; P[o + 2] += Vv[o + 2] * dt;
      const fade = Math.min(1, this.life[i] / Math.min(0.4, this.max[i] * 0.5));
      if (k === 2) { this.size[i] += dt * 0.012; this.alpha[i] = fade * 0.8; }
      else if (k === 3) { this.alpha[i] = fade * Math.min(1, (this.max[i] - this.life[i]) / 1.5) * 0.7; }
      else this.alpha[i] = Math.min(this.alpha[i], fade);
      if (collide && (k === 0 || k === 1)) {
        const res = collide(P[o], P[o + 1], P[o + 2], k, this.size[i]);
        if (res) { this.life[i] = 0; this.size[i] = 0; this.alpha[i] = 0; this.free.push(i); }
      }
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aKind.needsUpdate = true;
  }
}
