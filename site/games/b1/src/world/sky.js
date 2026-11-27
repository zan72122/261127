import * as THREE from '../../lib/three.module.js';
import { GLSL_NOISE, SUN_DIR, shared } from '../core/env.js';

export class Sky {
  constructor() {
    const geo = new THREE.SphereGeometry(2200, 32, 24);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: shared.uTime,
        uNight: shared.uNight,
        uSunDir: { value: SUN_DIR.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uNight;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        ${GLSL_NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);

          // 70% Base deep indigo sky blending from crisp winter twilight to northern aurora night
          vec3 zenithDay = vec3(0.09, 0.15, 0.30);
          vec3 zenithNight = vec3(0.03, 0.06, 0.16);
          vec3 horizDay = vec3(0.32, 0.38, 0.56);
          vec3 horizNight = vec3(0.08, 0.15, 0.28);

          vec3 zenith = mix(zenithDay, zenithNight, uNight);
          vec3 horiz = mix(horizDay, horizNight, uNight);
          vec3 col = mix(horiz, zenith, smoothstep(-0.02, 0.55, h));

          // Low winter twilight amber band on the southwestern horizon
          float sunDot = max(0.0001, dot(d, normalize(uSunDir)));
          float sunGlow = pow(sunDot, 7.0) * (1.0 - uNight * 0.55);
          col += vec3(0.85, 0.54, 0.28) * sunGlow * 0.42;
          col += vec3(1.0, 0.80, 0.52) * smoothstep(0.996, 0.9995, sunDot) * (1.0 - uNight * 0.6) * 0.8;

          // Subtle northern emerald airglow along +Z horizon
          float north = smoothstep(0.1, 0.95, d.z) * smoothstep(-0.04, 0.28, h) * smoothstep(0.65, 0.15, h);
          col += vec3(0.10, 0.48, 0.36) * north * (0.28 + 0.55 * uNight);

          // Crisp stars above horizon
          if (h > 0.04) {
            vec2 sp = d.xz / (d.y + 0.45) * 42.0;
            vec2 cell = floor(sp);
            vec2 f = fract(sp) - 0.5;
            float rnd = hash12(cell);
            if (rnd > 0.962) {
              float dist = length(f - vec2(hash12(cell + 7.1), hash12(cell + 13.7)) * 0.5 + 0.25);
              float star = smoothstep(0.11, 0.01, dist);
              float tw = 0.72 + 0.28 * sin(uTime * 2.2 + rnd * 90.0);
              col += vec3(0.84, 0.92, 1.0) * star * tw * smoothstep(0.04, 0.25, h) * (0.45 + 0.55 * uNight);
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'skyDome';
    this.mesh.userData.nonsolid = true;
    this.mesh.frustumCulled = false;
  }

  makeEnvironment(renderer) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x283c66);
      const skyLight = new THREE.HemisphereLight(0x8bb2e8, 0x293b5c, 2.0);
      const warmKey = new THREE.DirectionalLight(0xffcb88, 1.4);
      warmKey.position.copy(SUN_DIR);
      const aurGlow = new THREE.DirectionalLight(0x4ee8b0, 0.9);
      aurGlow.position.set(0, 0.4, 1);
      envScene.add(skyLight, warmKey, aurGlow);
      const rt = pmrem.fromScene(envScene, 0.04);
      pmrem.dispose();
      return rt.texture;
      } catch (e) {
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
      return null;
    }
  }
}
