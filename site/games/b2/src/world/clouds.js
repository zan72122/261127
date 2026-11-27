import * as THREE from '../../lib/three.module.js';
import { GLSL_NOISE, LAYER_MAIN, LAYER_REFLECT, shared } from '../core/env.js';
import { rng } from '../core/math.js';

export class SummerClouds {
  constructor(opts = {}) {
    this.maxPuffs = opts.maxPuffs || 420;
    this.puffs = [];
    this.group = new THREE.Group();
    this.group.name = 'cumulusClouds';
    this.group.userData.nonsolid = true;
    this.group.userData.fx = true;

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPuff = new THREE.InstancedBufferAttribute(new Float32Array(this.maxPuffs * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCl = new THREE.InstancedBufferAttribute(new Float32Array(this.maxPuffs * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPuff', this.aPuff);
    g.setAttribute('aCl', this.aCl);
    g.instanceCount = 0;
    this.geo = g;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: shared.uSunDir,
        uSunColor: shared.uSunColor,
        uZenith: shared.uSkyZenith,
        uHorizon: shared.uSkyHorizon,
        uTime: shared.uTime,
      },
      vertexShader: /* glsl */ `
        attribute vec4 aPuff;
        attribute vec4 aCl;
        varying vec2 vUv;
        varying vec3 vC;
        varying vec3 vClC;
        varying float vR;
        varying float vSeed;
        varying float vFade;
        varying vec3 vWorld;
        void main(){
          vec3 c = aPuff.xyz;
          float r = aPuff.w;
          vec3 toCam = cameraPosition - c;
          float dist = max(0.01, length(toCam));
          vec3 f = toCam / dist;
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), f));
          vec3 up = cross(f, right);
          vec3 p = c + (right * position.x + up * position.y) * r * 1.28;
          vUv = position.xy * 1.28;
          vC = c;
          vClC = aCl.xyz;
          vR = r;
          vSeed = aCl.w;
          vFade = smoothstep(r * 0.4, r * 1.45, dist);
          vWorld = p;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir, uSunColor, uZenith, uHorizon;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vC;
        varying vec3 vClC;
        varying float vR;
        varying float vSeed;
        varying float vFade;
        varying vec3 vWorld;
        ${GLSL_NOISE}
        void main(){
          vec2 q = vUv;
          float n = fbm2(q * 1.95 + vSeed * 11.7 + uTime * 0.008);
          float n2 = fbm2(q * 3.8 - vSeed * 5.3);
          float rr = length(q) + (n - 0.5) * 0.55 + (n2 - 0.5) * 0.18;
          float a = smoothstep(0.95, 0.34, rr);
          if (a < 0.01) discard;

          vec3 f = normalize(cameraPosition - vC);
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), f));
          vec3 up = cross(f, right);
          float z = sqrt(max(0.0, 1.0 - min(dot(q, q) * 0.55, 1.0)));
          vec3 N = normalize(right * q.x + up * q.y + f * z + (vec3(n, n2, n) - 0.5) * 0.52);

          vec3 fromC = normalize(vWorld - vClC + vec3(0.0, 0.42 * vR, 0.0));
          float sunSide = dot(normalize(N * 0.58 + fromC * 0.92), uSunDir);
          float lit = smoothstep(-0.5, 0.65, sunSide);
          float height = clamp((vWorld.y - vClC.y) / (vR * 2.2) + 0.48, 0.0, 1.0);

          // Cumulonimbus: sky-tinted underside, warm sunlit cream cauliflower tops
          vec3 shade = mix(vec3(0.70, 0.78, 0.88), vec3(0.86, 0.90, 0.95), height);
          vec3 sunlit = vec3(1.0, 0.98, 0.93);
          vec3 col = mix(shade, sunlit, lit * 0.86 + 0.12 * height);
          col *= 0.96 + 0.10 * height;

          vec3 V = normalize(vWorld - cameraPosition);
          float back = pow(max(dot(V, uSunDir), 0.0), 8.0);
          col += vec3(1.0, 0.96, 0.88) * back * (1.0 - lit * 0.4) * 0.32;

          // Distance atmospheric blend
          float camDist = length(vWorld - cameraPosition);
          float haze = smoothstep(320.0, 1050.0, camDist) * 0.28;
          col = mix(col, uHorizon, haze);

          float alpha = a * vFade * 0.92;
          gl_FragColor = vec4(col * alpha, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });

    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'cumulusPuffs';
    this.mesh.userData.nonsolid = true;
    this.mesh.userData.fx = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.layers.enable(LAYER_MAIN);
    this.mesh.layers.enable(LAYER_REFLECT);
    this.group.add(this.mesh);

    this._order = [];
    this._populate(opts.puffScale || 1.0);
  }

  _addToweringCluster(cx, cy, cz, size, heightScale, seed, puffScale) {
    const r = rng(seed);
    const cl = { x: cx, y: cy, z: cz, seed: r() * 10 };
    const n = Math.max(8, Math.round((14 + size / 4.2) * puffScale));
    for (let i = 0; i < n; i++) {
      if (this.puffs.length >= this.maxPuffs) return;
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.72) * size * 0.62;
      const towerT = Math.pow(r(), 0.85);
      const rad = size * (0.34 + r() * 0.28) * (1 - towerT * 0.24);
      const py = cy + towerT * size * heightScale + rad * 0.28;
      this.puffs.push({
        x: cx + Math.cos(a) * d,
        y: py,
        z: cz + Math.sin(a) * d * 0.72,
        r: rad,
        cl,
      });
    }
    // Cohesive flat cumulus base
    const baseN = Math.max(4, Math.round(n * 0.55));
    for (let i = 0; i < baseN; i++) {
      if (this.puffs.length >= this.maxPuffs) return;
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.55) * size * 0.65;
      this.puffs.push({
        x: cx + Math.cos(a) * d,
        y: cy + size * 0.06,
        z: cz + Math.sin(a) * d * 0.72,
        r: size * 0.34,
        cl,
      });
    }
  }

  _populate(puffScale) {
    // Towering summer cumulonimbus (nyudogumo) rising above the valley & beyond the lookout
    const towers = [
      { x: -125, y: 66, z: 330, s: 40, h: 1.4, seed: 101 },
      { x: 120, y: 68, z: 350, s: 44, h: 1.5, seed: 202 },
      { x: -45, y: 76, z: 420, s: 50, h: 1.6, seed: 303 },
      { x: 55, y: 74, z: 400, s: 44, h: 1.45, seed: 404 },
      // Mid-valley cumulus towers framing the horizon & thermal ceiling
      { x: -48, y: 66, z: 205, s: 22, h: 1.0, seed: 505 },
      { x: 52, y: 68, z: 230, s: 24, h: 1.05, seed: 606 },
      { x: 0, y: 74, z: 265, s: 26, h: 1.1, seed: 707 },
      { x: -95, y: 58, z: 155, s: 24, h: 1.0, seed: 808 },
      { x: 105, y: 60, z: 175, s: 23, h: 1.0, seed: 909 },
      // South & southwest horizon cumulus visible from hilltop lookout panorama & paddy reflections
      { x: -120, y: 68, z: -70, s: 34, h: 1.35, seed: 1010 },
      { x: 95, y: 70, z: -85, s: 32, h: 1.3, seed: 1111 },
      { x: -20, y: 78, z: -135, s: 38, h: 1.4, seed: 1212 },
    ];
    for (const t of towers) {
      this._addToweringCluster(t.x, t.y, t.z, t.s, t.h, t.seed, puffScale);
    }
  }

  update(camera) {
    const camPos = camera.position;
    const n = this.puffs.length;
    if (this._order.length !== n) {
      this._order = Array.from({ length: n }, (_, i) => i);
    }
    this._order.sort((ia, ib) => {
      const a = this.puffs[ia];
      const b = this.puffs[ib];
      const da = (a.x - camPos.x) ** 2 + (a.y - camPos.y) ** 2 + (a.z - camPos.z) ** 2;
      const db = (b.x - camPos.x) ** 2 + (b.y - camPos.y) ** 2 + (b.z - camPos.z) ** 2;
      return db - da;
    });

    const pArr = this.aPuff.array;
    const cArr = this.aCl.array;
    for (let k = 0; k < n; k++) {
      const p = this.puffs[this._order[k]];
      const o = k * 4;
      pArr[o] = p.x;
      pArr[o + 1] = p.y;
      pArr[o + 2] = p.z;
      pArr[o + 3] = p.r;
      cArr[o] = p.cl.x;
      cArr[o + 1] = p.cl.y;
      cArr[o + 2] = p.cl.z;
      cArr[o + 3] = p.cl.seed;
    }
    this.aPuff.needsUpdate = true;
    this.aCl.needsUpdate = true;
    this.geo.instanceCount = n;
  }
}
