import * as THREE from '../../lib/three.module.js';
import {
  GLSL_NOISE,
  LAYER_MAIN,
  LAYER_REFLECT,
  PALETTE,
  shared,
} from '../core/env.js';
import {
  STREAM_WATER_Y,
  TERRACE_COUNT,
  streamCenterZ,
  terraceZRange,
} from './terrain.js';

export class MirrorWater {
  constructor(opts = {}) {
    this.low = !!opts.low;
    this.group = new THREE.Group();
    this.group.name = 'waterSurfaces';
    this.group.userData.nonsolid = true;

    this.reflectCam = new THREE.PerspectiveCamera(50, 1, 0.5, 4800);
    this.reflectRT = this.low
      ? null
      : new THREE.WebGLRenderTarget(opts.high ? 384 : 256, opts.high ? 288 : 192, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: true,
        });
    this.reflectMatrix = new THREE.Matrix4();
    this.reflectY = 10.5;

    shared.uReflectTex.value = this.reflectRT ? this.reflectRT.texture : null;
    shared.uHasReflect.value = this.reflectRT ? 1.0 : 0.0;

    this.mat = this._makeWaterMaterial();
    this._buildStream();
    this._buildPaddies();
  }

  _makeWaterMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uSunDir: shared.uSunDir,
        uZenith: shared.uSkyZenith,
        uHorizon: shared.uSkyHorizon,
        uReflectTex: shared.uReflectTex,
        uReflectMat: { value: this.reflectMatrix },
        uHasReflect: shared.uHasReflect,
        uBaseTint: { value: PALETTE.waterSilver },
      },
      vertexShader: /* glsl */ `
        uniform mat4 uReflectMat;
        varying vec3 vWorld;
        varying vec4 vRefCoord;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vRefCoord = uReflectMat * w;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uHasReflect;
        uniform vec3 uSunDir, uZenith, uHorizon, uBaseTint;
        uniform sampler2D uReflectTex;
        varying vec3 vWorld;
        varying vec4 vRefCoord;
        ${GLSL_NOISE}
        void main(){
          vec3 V = normalize(cameraPosition - vWorld);

          // Gentle early-summer wind ripples on shallow flooded paddy & brook
          vec2 p = vWorld.xz * 0.55;
          float r1 = vnoise2(p + vec2(uTime * 0.22, uTime * 0.11));
          float r2 = vnoise2(p * 2.1 - vec2(uTime * 0.16, uTime * 0.26));
          vec3 N = normalize(vec3((r1 - 0.5) * 0.055, 1.0, (r2 - 0.5) * 0.055));

          vec3 R = reflect(-V, N);
          float ry = clamp(R.y, 0.02, 1.0);

          // Analytic sky + summer cumulus mirror gradient
          vec3 skyRef = mix(uHorizon, uZenith, pow(ry, 0.56));
          float sunSide = 0.5 + 0.5 * dot(R, uSunDir);
          skyRef = mix(skyRef, vec3(1.0, 0.94, 0.82), pow(sunSide, 5.0) * (1.0 - ry) * 0.55);

          // Mirrored cumulus cloud highlights in the water
          vec2 cp = R.xz / (ry + 0.16);
          float cl = fbm2(cp * 1.15 + vec2(0.4, uTime * 0.005));
          float cloudMask = smoothstep(0.48, 0.78, cl) * smoothstep(0.05, 0.35, ry);
          skyRef = mix(skyRef, vec3(0.99, 0.97, 0.92), cloudMask * 0.65);

          // Planar reflection RT sample when available (real clouds + valley + paper plane reflection)
          if (uHasReflect > 0.5 && vRefCoord.w > 0.01) {
            vec2 ruv = vRefCoord.xy / vRefCoord.w * 0.5 + 0.5;
            ruv += N.xz * 0.14;
            if (ruv.x > 0.01 && ruv.x < 0.99 && ruv.y > 0.01 && ruv.y < 0.99) {
              vec3 rtCol = texture2D(uReflectTex, ruv).rgb;
              skyRef = mix(skyRef, rtCol, 0.82);
            }
          }

          // Shallow paddy mud & olive-emerald tint at steep downward gaze
          float fres = 0.28 + 0.72 * pow(1.0 - max(dot(N, V), 0.0), 3.2);
          vec3 shallowTint = mix(vec3(0.28, 0.37, 0.27), uBaseTint * 0.85, 0.58);
          vec3 col = mix(shallowTint, skyRef, clamp(fres, 0.38, 0.97));

          // Crisp afternoon specular sun path on water
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 160.0);
          float glint = pow(max(dot(N, H), 0.0), 28.0);
          col += vec3(1.0, 0.94, 0.80) * (spec * 2.2 + glint * 0.28);

          gl_FragColor = vec4(col, 0.92);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: true,
    });
  }

  _buildStream() {
    const segsX = 140;
    const xMin = -110;
    const xMax = 110;
    const halfW = 3.95;
    const positions = [];
    const indices = [];

    for (let i = 0; i <= segsX; i++) {
      const x = xMin + ((xMax - xMin) * i) / segsX;
      const cz = streamCenterZ(x);
      positions.push(x, STREAM_WATER_Y, cz - halfW);
      positions.push(x, STREAM_WATER_Y, cz + halfW);
      if (i < segsX) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const streamMesh = new THREE.Mesh(geo, this.mat);
    streamMesh.name = 'streamWater';
    streamMesh.userData.nonsolid = true;
    streamMesh.userData.isWater = true;
    streamMesh.layers.set(LAYER_MAIN);
    this.group.add(streamMesh);
  }

  _buildPaddies() {
    const segsX = 64;
    const xMin = -58.0;
    const xMax = 44.0;

    for (let t = 0; t < TERRACE_COUNT; t++) {
      const positions = [];
      const indices = [];
      for (let i = 0; i <= segsX; i++) {
        const x = xMin + ((xMax - xMin) * i) / segsX;
        const { z0, z1, waterY } = terraceZRange(x, t);
        positions.push(x, waterY + 0.05, z0 + 1.05);
        positions.push(x, waterY + 0.05, z1 - 1.05);
        if (i < segsX) {
          const b = i * 2;
          indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.name = `paddyWater_${t}`;
      mesh.userData.nonsolid = true;
      mesh.userData.isWater = true;
      mesh.layers.set(LAYER_MAIN);
      this.group.add(mesh);
    }
  }

  renderReflection(renderer, scene, mainCam, playerPos) {
    if (!this.reflectRT) return;
    // Center reflection plane near the terrace tier closest to the player's gaze
    const targetY = playerPos && playerPos.z > 90 && playerPos.z < 290
      ? Math.max(3.6, Math.min(19.5, 3.6 + ((playerPos.z - 112) / 168) * 15.3))
      : 10.5;
    this.reflectY = targetY;

    const cam = this.reflectCam;
    cam.fov = mainCam.fov;
    cam.aspect = mainCam.aspect;
    cam.near = mainCam.near;
    cam.far = mainCam.far;
    cam.position.set(mainCam.position.x, 2 * targetY - mainCam.position.y, mainCam.position.z);

    // Mirror look direction across horizontal reflection plane y = targetY
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mainCam.quaternion);
    fwd.y = -fwd.y;
    const lookTarget = cam.position.clone().add(fwd);
    cam.up.set(0, 1, 0);
    cam.lookAt(lookTarget);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    this.reflectMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    const prevTarget = renderer.getRenderTarget();
    const prevMask = mainCam.layers.mask;
    cam.layers.set(LAYER_REFLECT);

    renderer.setRenderTarget(this.reflectRT);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    mainCam.layers.mask = prevMask;
  }
}
