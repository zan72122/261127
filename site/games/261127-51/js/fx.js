// Particles: powder puffs, dust motes in the sunbeam, crumbs.
// Lit camera-facing sprites built on MeshStandardMaterial (they receive the sun
// shadow, so motes sparkle only inside the window beam).
import { T, scene, camera, rand, V3 } from './core.js';

const MAX = 1400;
export class Particles {
  constructor() {
    const g = new T.PlaneGeometry(1, 1);
    this.mesh = new T.InstancedMesh(g, null, MAX);
    this.aCol = new T.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); // rgb, metal
    this.aSz = new T.InstancedBufferAttribute(new Float32Array(MAX * 2), 2); // size, alpha
    g.setAttribute('aCol', this.aCol);
    g.setAttribute('aSz', this.aSz);
    const U = { uR: { value: V3(1, 0, 0) }, uU: { value: V3(0, 1, 0) }, uF: { value: V3(0, 0, 1) } };
    const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, transparent: true, depthWrite: false });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aCol; attribute vec2 aSz; varying vec4 vCol; varying vec2 vQ; varying float vA; uniform vec3 uR; uniform vec3 uU; uniform vec3 uF;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = uF;')
        .replace('#include <begin_vertex>', 'vec3 transformed = (uR * position.x + uU * position.y) * aSz.x; vCol = aCol; vQ = position.xy; vA = aSz.y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vCol; varying vec2 vQ; varying float vA;')
        .replace('#include <color_fragment>', `
          float r = length(vQ) * 2.0;
          float a = smoothstep(1.0, 0.35, r) * vA;
          if (a < 0.01) discard;
          diffuseColor = vec4(vCol.rgb, a);`)
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vCol.a;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.7, 0.3, vCol.a);');
    };
    this.mesh.material = m;
    this.U = U;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.p = [];
    this.dummy = new T.Matrix4();
  }
  // spawn n particles at pos with spread
  emit(pos, n, o = {}) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= MAX) this.p.shift();
      const sp = o.spread ?? 0.01;
      const v = o.vel ? o.vel.clone() : V3();
      v.x += rand(-1, 1) * (o.jitter ?? 0.08); v.y += rand(-0.3, 1) * (o.jitter ?? 0.08); v.z += rand(-1, 1) * (o.jitter ?? 0.08);
      // log-normal sizes: lots of fine dust, a few clumps
      const s = (o.size ?? 0.0025) * Math.exp(rand(-0.9, 0.9) + (Math.random() < 0.08 ? 1.0 : 0));
      const c = o.color || [0.05, 0.05, 0.05];
      const shade = rand(0.75, 1.25);
      this.p.push({
        x: pos.x + rand(-sp, sp), y: pos.y + rand(-sp, sp), z: pos.z + rand(-sp, sp),
        v, s, a: o.alpha ?? 0.8, life: 0, max: (o.life ?? 2.5) * rand(0.5, 1.4),
        c: [c[0] * shade, c[1] * shade, c[2] * shade], metal: o.metal ?? 0,
        drag: (o.drag ?? 2.2) * rand(0.6, 1.6), g: (o.gravity ?? 0.15) * rand(0.3, 1.5), grow: o.grow ?? 0.4,
        floor: o.floor ?? 0, onLand: o.onLand,
      });
    }
  }
  update(dt, t) {
    const R = this.U.uR.value.setFromMatrixColumn(camera.matrixWorld, 0);
    this.U.uU.value.setFromMatrixColumn(camera.matrixWorld, 1);
    this.U.uF.value.setFromMatrixColumn(camera.matrixWorld, 2);
    let n = 0;
    const alive = [];
    for (const q of this.p) {
      q.life += dt;
      if (q.life > q.max) continue;
      const d = Math.exp(-q.drag * dt);
      q.v.multiplyScalar(d);
      q.v.y -= q.g * dt;
      // gentle turbulence
      q.v.x += Math.sin(t * 1.7 + q.y * 30) * 0.004 * dt * 60 * 0.02;
      q.v.z += Math.cos(t * 1.3 + q.x * 30) * 0.004 * dt * 60 * 0.02;
      q.x += q.v.x * dt; q.y += q.v.y * dt; q.z += q.v.z * dt;
      if (q.y < q.floor) { q.y = q.floor; q.v.set(0, 0, 0); if (q.onLand) { q.onLand(q); q.onLand = null; } }
      alive.push(q);
      const k = q.life / q.max;
      const s = q.s * (1 + q.grow * k);
      this.dummy.makeTranslation(q.x, q.y, q.z);
      this.mesh.setMatrixAt(n, this.dummy);
      this.aCol.setXYZW(n, q.c[0], q.c[1], q.c[2], q.metal);
      this.aSz.setXY(n, s, q.a * Math.min(1, q.life * 8) * (1 - k * k));
      n++;
    }
    this.p = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aCol.needsUpdate = true; this.aSz.needsUpdate = true;
  }
}

// Dust motes always drifting in the room (visible where the sun hits them).
export class Motes {
  constructor(center, size, n = 260) {
    const g = new T.PlaneGeometry(1, 1);
    this.mesh = new T.InstancedMesh(g, null, n);
    this.n = n; this.center = center; this.size = size;
    this.pts = [];
    for (let i = 0; i < n; i++) this.pts.push({ p: V3(rand(-1, 1) * size.x, rand(-1, 1) * size.y, rand(-1, 1) * size.z).add(center), ph: rand(0, 100), s: 0.0007 * Math.exp(rand(-0.5, 0.8)) });
    const U = { uR: { value: V3(1, 0, 0) }, uU: { value: V3(0, 1, 0) }, uF: { value: V3(0, 0, 1) } };
    const m = new T.MeshStandardMaterial({ color: 0xfff6e8, roughness: 0.4, transparent: true, depthWrite: false, emissive: 0x000000 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vQ; uniform vec3 uR; uniform vec3 uU; uniform vec3 uF;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = uF;')
        .replace('#include <begin_vertex>', 'vec3 transformed = (uR * position.x + uU * position.y); vQ = position.xy;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vQ;')
        .replace('#include <color_fragment>', 'float a = smoothstep(0.5, 0.1, length(vQ)); diffuseColor.a = a * 0.9;')
        // motes are only seen when lit directly: drop ambient so they vanish in shade
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse *= 0.05; reflectedLight.indirectSpecular *= 0.0; reflectedLight.directDiffuse *= 2.5;');
    };
    this.mesh.material = m; this.U = U;
    this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.dummy = new T.Matrix4();
    scene.add(this.mesh);
  }
  update(dt, t) {
    this.U.uR.value.setFromMatrixColumn(camera.matrixWorld, 0);
    this.U.uU.value.setFromMatrixColumn(camera.matrixWorld, 1);
    this.U.uF.value.setFromMatrixColumn(camera.matrixWorld, 2);
    const c = this.center, s = this.size;
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[i];
      q.p.x += Math.sin(t * 0.21 + q.ph) * 0.006 * dt;
      q.p.y += (Math.sin(t * 0.17 + q.ph * 1.3) * 0.006 - 0.002) * dt;
      q.p.z += Math.cos(t * 0.19 + q.ph * 0.7) * 0.006 * dt;
      if (q.p.y < c.y - s.y) q.p.y += s.y * 2;
      this.dummy.makeScale(q.s, q.s, q.s).setPosition(q.p);
      this.mesh.setMatrixAt(i, this.dummy);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
