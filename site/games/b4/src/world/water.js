import * as THREE from '../../lib/three.module.js';
import { PALETTE, SUN_DIR, WATER_Y, shared } from '../core/env.js';

export class FjordWater {
  constructor({ low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'waterGroup';

    const geo = new THREE.PlaneGeometry(320, 740, low ? 40 : 68, low ? 80 : 136);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, WATER_Y, 310);

    this.uniforms = {
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uPlanePos: { value: new THREE.Vector3(6.2, 0, 17.0) },
      uPlaneDir: { value: new THREE.Vector2(0, 1) },
      uWakeStrength: { value: 0.0 },
      uDeepColor: { value: new THREE.Color(PALETTE.lakeDeep) },
      uGlacialColor: { value: new THREE.Color(PALETTE.lakeGlacial) },
      uSkyColor: { value: new THREE.Color(PALETTE.skyHorizon) },
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float w1 = sin(wp.x * 0.24 + uTime * 1.1) * cos(wp.z * 0.19 - uTime * 0.85);
          float w2 = sin((wp.x + wp.z) * 0.48 - uTime * 1.6);
          wp.y += (w1 * 0.025 + w2 * 0.012);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uPlanePos;
        uniform vec2 uPlaneDir;
        uniform float uWakeStrength;
        uniform vec3 uDeepColor;
        uniform vec3 uGlacialColor;
        uniform vec3 uSkyColor;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec3 vWorldPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p) {
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
          vec2 p = vWorldPos.xz;
          // Layered fine surface ripples
          float r1 = vnoise(p * 0.65 + vec2(uTime * 0.22, -uTime * 0.18));
          float r2 = vnoise(p * 1.75 - vec2(uTime * 0.34, uTime * 0.27));
          float ripple = (r1 * 0.65 + r2 * 0.35) - 0.5;

          vec3 N = normalize(vec3(
            (r1 - 0.5) * 0.13 + (r2 - 0.5) * 0.08,
            1.0,
            (r2 - 0.5) * 0.13 - (r1 - 0.5) * 0.08
          ));
          vec3 V = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.6);

          // Shift slightly toward glacial teal-navy near the glacier lodge basin
          float glacialT = smoothstep(350.0, 540.0, vWorldPos.z);
          vec3 waterBase = mix(uDeepColor, uGlacialColor, glacialT);

          // Sky reflection & warm autumn canyon tint (keep deep fjord navy as 70% base)
          vec3 R = reflect(-V, N);
          vec3 skyRef = mix(uSkyColor * 0.68, vec3(0.84, 0.78, 0.68), clamp(R.y * 0.4 + 0.1, 0.0, 1.0));
          vec3 col = mix(waterBase, skyRef, clamp(fresnel * 0.48 + 0.04, 0.0, 0.62));

          // Crisp afternoon sun glint path on the fjord surface
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 180.0);
          float broadSpec = pow(max(dot(N, H), 0.0), 28.0);
          col += vec3(1.0, 0.88, 0.68) * (spec * 1.45 + broadSpec * 0.14);

          // Twin-float V-wake behind the seaplane when on or skimming water
          if (uWakeStrength > 0.01) {
            vec2 rel = p - uPlanePos.xz;
            float along = dot(rel, -uPlaneDir);
            vec2 sideVec = vec2(-uPlaneDir.y, uPlaneDir.x);
            float side = abs(dot(rel, sideVec));
            if (along > -1.5 && along < 36.0) {
              float cone = 1.05 + along * 0.25;
              float dArm = abs(side - cone);
              float dCenter = abs(side - 0.95);
              float foamArm = exp(-dArm * dArm * 3.8) * smoothstep(36.0, 0.0, along) * smoothstep(-1.5, 1.2, along);
              float foamTrail = exp(-dCenter * dCenter * 2.5) * smoothstep(22.0, 0.0, along) * smoothstep(-1.0, 1.0, along);
              float wakeNoise = 0.55 + 0.45 * vnoise(p * 1.6 - uPlaneDir * uTime * 3.0);
              float wake = clamp((foamArm * 0.95 + foamTrail * 0.55) * wakeNoise * uWakeStrength, 0.0, 1.0);
              col = mix(col, vec3(0.92, 0.94, 0.96), wake * 0.88);
            }
          }

          // Exponential distance haze matching sky horizon
          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(col, 0.97);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'waterLake';
    mesh.userData.surface = true;
    mesh.userData.nonsolid = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  update(planePos, yaw, wakeStrength) {
    this.uniforms.uPlanePos.value.copy(planePos);
    this.uniforms.uPlaneDir.value.set(Math.sin(yaw), Math.cos(yaw));
    this.uniforms.uWakeStrength.value = wakeStrength;
  }
}
