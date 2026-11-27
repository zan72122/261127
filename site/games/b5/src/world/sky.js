import * as THREE from '../../lib/three.module.js';
import { SUN_DIR, shared } from '../core/env.js';

export class Sky {
  constructor() {
    const geo = new THREE.SphereGeometry(2200, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: SUN_DIR },
        uTime: shared.uTime,
        uAlt: shared.uAlt,
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform float uTime;
        uniform float uAlt;
        varying vec3 vDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.1, 1.0);
          float sunDot = max(0.0, dot(d, normalize(uSunDir)));

          // Early summer Okinawan dusk gradient (soft teal zenith -> coral-peach horizon)
          vec3 zenith = mix(vec3(0.20, 0.42, 0.56), vec3(0.14, 0.30, 0.46), uAlt * 0.45);
          vec3 midSky = vec3(0.46, 0.63, 0.67);
          vec3 horizon = vec3(0.92, 0.72, 0.58);
          vec3 below = vec3(0.24, 0.52, 0.54);

          vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.24, h));
          col = mix(col, zenith, smoothstep(0.20, 0.78, h));
          if (h < 0.0) col = mix(horizon, below, smoothstep(0.0, -0.08, h));

          // Warm golden-coral sun glow & disc
          float sunHalo = pow(sunDot, 5.0) * 0.36 + pow(sunDot, 28.0) * 0.42;
          float sunDisc = smoothstep(0.9975, 0.9992, sunDot);
          col += vec3(0.98, 0.72, 0.44) * sunHalo;
          col = mix(col, vec3(1.0, 0.92, 0.76), sunDisc);

          // High dusk cirrus clouds (coral-gold lit undersides)
          if (h > 0.02) {
            vec2 uv = d.xz / (h + 0.14) * 1.4 + vec2(uTime * 0.004, uTime * 0.002);
            float c1 = noise(uv * 2.1);
            float c2 = noise(uv * 4.7 + 3.1);
            float cloud = smoothstep(0.55, 0.85, c1 * 0.65 + c2 * 0.35) * smoothstep(0.02, 0.22, h);
            vec3 cloudCol = mix(vec3(0.86, 0.78, 0.74), vec3(0.96, 0.73, 0.56), pow(sunDot, 1.8));
            col = mix(col, cloudCol, cloud * 0.42);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'skyDome';
    this.mesh.userData.nonsolid = true;
    this.mesh.frustumCulled = false;
  }

  makeEnvironment(renderer) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const tmpScene = new THREE.Scene();
      const envGeo = new THREE.SphereGeometry(20, 16, 12);
      const envMat = this.mesh.material.clone();
      const envMesh = new THREE.Mesh(envGeo, envMat);
      tmpScene.add(envMesh);
      const rt = pmrem.fromScene(tmpScene, 0.04);
      pmrem.dispose();
      envGeo.dispose();
      envMat.dispose();
      return rt.texture;
      } catch (e) {
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
      return null;
    }
  }
}
