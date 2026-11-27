import * as THREE from '../../lib/three.module.js';
import { markNonSolid, shared } from '../core/env.js';
import { rng } from '../core/math.js';

export class Sky {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'skyGroup';

    const geo = new THREE.SphereGeometry(1800, 40, 28);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uAltitude: shared.uAltitude,
        uNightMix: shared.uNightMix,
        uSunDir: shared.uSunDir,
      },
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAltitude, uNightMix;
        uniform vec3 uSunDir;
        varying vec3 vDir;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        // Smooth trilinear value noise (zero grid artifacts)
        float vnoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          float n000 = hash31(i + vec3(0, 0, 0));
          float n100 = hash31(i + vec3(1, 0, 0));
          float n010 = hash31(i + vec3(0, 1, 0));
          float n110 = hash31(i + vec3(1, 1, 0));
          float n001 = hash31(i + vec3(0, 0, 1));
          float n101 = hash31(i + vec3(1, 0, 1));
          float n011 = hash31(i + vec3(0, 1, 1));
          float n111 = hash31(i + vec3(1, 1, 1));
          return mix(
            mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
            mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
            u.z
          );
        }

        float fbm3(vec3 p) {
          float s = 0.0;
          s += 0.55 * vnoise(p);
          s += 0.30 * vnoise(p * 2.13 + 7.1);
          s += 0.15 * vnoise(p * 4.27 + 13.7);
          return s;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          float night = clamp(uNightMix, 0.0, 1.0);

          // Linear-space dusk -> deep sapphire starlit night (calibrated for ACES + gamma 2.2)
          vec3 duskZenith  = vec3(0.036, 0.068, 0.195);
          vec3 duskMid     = vec3(0.28, 0.165, 0.30);
          vec3 duskHorizon = vec3(0.82, 0.45, 0.26);

          vec3 nightZenith  = vec3(0.004, 0.011, 0.046);
          vec3 nightMid     = vec3(0.014, 0.032, 0.095);
          vec3 nightHorizon = vec3(0.042, 0.058, 0.135);

          vec3 zenith  = mix(duskZenith, nightZenith, night);
          vec3 mid     = mix(duskMid, nightMid, night);
          vec3 horizon = mix(duskHorizon, nightHorizon, night);

          vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
          col = mix(col, zenith, smoothstep(0.18, 0.72, h));

          // Warm sunset aureole near sun azimuth
          float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
          float sunGlow = pow(sunDot, 9.0) * (1.0 - night * 0.86);
          float sunDisc = smoothstep(0.9975, 0.9993, sunDot) * (1.0 - night * 0.94);
          col += vec3(0.96, 0.58, 0.24) * sunGlow * 0.62;
          col += vec3(1.0, 0.86, 0.58) * sunDisc * 1.35;

          // Luminous Milky Way ribbon with dark dust rifts & turquoise/amber nebula tint
          float mwCoord = d.x * 0.62 + d.y * 0.55 - d.z * 0.56;
          float mwBand = exp(-mwCoord * mwCoord * 11.0) * smoothstep(0.02, 0.36, h);
          float mwCore = exp(-mwCoord * mwCoord * 34.0) * smoothstep(0.05, 0.42, h);
          float dust = fbm3(d * 7.2);
          float dustLane = smoothstep(0.32, 0.78, dust);
          col += vec3(0.10, 0.20, 0.40) * mwBand * (0.22 + 0.88 * night) * (0.50 + 0.50 * dustLane);
          col += vec3(0.20, 0.34, 0.48) * mwCore * (0.14 + 0.62 * night) * dustLane;

          // Crescent moon high above desert horizon
          vec3 moonDir = normalize(vec3(0.28, 0.36, 0.89));
          vec3 cutDir  = normalize(vec3(0.305, 0.375, 0.88));
          float mMain = smoothstep(0.9985, 0.9991, dot(d, moonDir));
          float mCut  = smoothstep(0.9986, 0.9992, dot(d, cutDir));
          float crescent = max(0.0, mMain - mCut);
          float moonHalo = pow(max(dot(d, moonDir), 0.0), 48.0) * 0.32;
          col += vec3(0.98, 0.90, 0.70) * crescent * 1.75 + vec3(0.45, 0.68, 0.94) * moonHalo * (0.32 + 0.68 * night);

          float hFog = exp(-max(h, 0.0) * 15.0);
          vec3 fogCol = mix(vec3(0.62, 0.42, 0.32), vec3(0.045, 0.062, 0.138), night);
          col = mix(col, fogCol, hFog * mix(0.40, 0.26, night));

          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    const dome = new THREE.Mesh(geo, mat);
    dome.name = 'skyDome';
    this.group.add(dome);

    // Crisp twinkling 3D starfield with varied star magnitudes
    const starCount = 1900;
    const pos = new Float32Array(starCount * 3);
    const col = new Float32Array(starCount * 3);
    const size = new Float32Array(starCount);
    const phase = new Float32Array(starCount);
    const rand = rng(731);
    const cGold = new THREE.Color('#ffe5a8');
    const cTurq = new THREE.Color('#9af0ea');
    const cWhite = new THREE.Color('#eef2ff');
    const tmp = new THREE.Color();

    for (let i = 0; i < starCount; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(0.04 + rand() * 0.96);
      const r = 1520;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const pick = rand();
      tmp.copy(pick < 0.28 ? cGold : pick < 0.52 ? cTurq : cWhite);
      const intensity = 0.62 + rand() * 0.38;
      col[i * 3] = tmp.r * intensity;
      col[i * 3 + 1] = tmp.g * intensity;
      col[i * 3 + 2] = tmp.b * intensity;
      size[i] = 2.6 + Math.pow(rand(), 2.1) * 6.2;
      phase[i] = rand() * Math.PI * 2;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

    this.starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uOpacity: { value: 0.38 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        varying vec3 vCol;
        varying float vTwinkle;
        void main() {
          vCol = color;
          vTwinkle = 0.72 + 0.28 * sin(uTime * 1.9 + aPhase);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vCol;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(1.0, 0.0, d);
          float alpha = pow(core, 1.7) * uOpacity * vTwinkle;
          gl_FragColor = vec4(vCol * (0.95 + 0.55 * core), alpha);
        }`,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.name = 'starField';
    this.group.add(this.stars);

    markNonSolid(this.group, 'nonsolid');
    this.mesh = this.group;
  }

  update(nightMix, altMix, t) {
    const vis = Math.min(1, 0.34 + nightMix * 0.66 + altMix * 0.45);
    this.starMat.uniforms.uOpacity.value = vis;
    this.stars.rotation.y = t * 0.004;
  }

  makeEnvironment(renderer) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(new THREE.HemisphereLight('#5c6f9c', '#a97a54', 1.5));
      const rt = pmrem.fromScene(envScene, 0.04);
      pmrem.dispose();
      return rt.texture;
      } catch (e) {
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
      return null;
    }
  }
}
