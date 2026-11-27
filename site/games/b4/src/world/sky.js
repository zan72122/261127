import * as THREE from '../../lib/three.module.js';
import { PALETTE, SUN_DIR, shared } from '../core/env.js';

export class AutumnSky {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'skyGroup';
    this.group.userData.nonsolid = true;

    const geo = new THREE.SphereGeometry(2200, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: shared.uTime,
        uSunDir: shared.uSunDir,
        uZenith: { value: new THREE.Color(PALETTE.skyZenith) },
        uMid: { value: new THREE.Color(PALETTE.skyMid) },
        uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        varying vec3 vDir;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.24, h));
          col = mix(col, uZenith, smoothstep(0.22, 0.82, h));

          // Crisp afternoon sun disc and warm atmospheric halo
          float mu = max(dot(d, normalize(uSunDir)), 0.0);
          col += vec3(0.98, 0.84, 0.62) * pow(mu, 10.0) * 0.28;
          col += vec3(1.0, 0.94, 0.82) * smoothstep(0.9975, 0.9994, mu) * 2.1;

          // High wispy autumn cirrus clouds
          if (d.y > 0.04) {
            vec2 uv = d.xz / (d.y + 0.22);
            float n = noise(uv * 2.2 + vec2(uTime * 0.008, 0.0)) * 0.65
                    + noise(uv * 5.1 - vec2(uTime * 0.012, 1.7)) * 0.35;
            float cirrus = smoothstep(0.56, 0.86, n) * smoothstep(0.04, 0.25, d.y) * 0.34;
            vec3 cloudCol = mix(vec3(0.94, 0.93, 0.90), vec3(1.0, 0.91, 0.78), pow(mu, 4.0));
            col = mix(col, cloudCol, cirrus);
          }

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'skyDome';
    this.mesh.userData.nonsolid = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  makeEnvironment(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    s.add(this.mesh.clone());
    const rt = pmrem.fromScene(s, 0.04);
    pmrem.dispose();
    return rt.texture;
  }

  update(camPos) {
    this.mesh.position.copy(camPos);
  }
}
