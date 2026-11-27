import * as THREE from '../../lib/three.module.js';
import {
  BARN_POS,
  CHAPEL_POS,
  DETOUR_CABIN_POS,
  FEEDER_POS,
  ICE_Y,
  OFFICE_POS,
  OVEN_POS,
  shared,
} from '../core/env.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

// Smooth deterministic 2D value noise for Lapland snow terrain
function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
function fbm(x, z) {
  return noise2(x, z) * 0.62 + noise2(x * 2.1 + 7.3, z * 2.1 - 4.1) * 0.28 + noise2(x * 4.4 - 2.2, z * 4.4 + 9.5) * 0.1;
}

// Frozen lake mask (0 on land, 1 inside the frozen lake basin + smooth eastern bridge inlet)
export function lakeFactor(x, z) {
  const cx = -42;
  const cz = 162;
  const dx = (x - cx) / 46;
  const dz = (z - cz) / 48;
  const wobble = (noise2(x * 0.045, z * 0.045) - 0.5) * 0.18;
  const r = Math.hypot(dx, dz) + wobble;
  const mainLake = 1 - smoothstep(0.76, 1.0, r);
  // Smooth tapered inlet channel passing under bridgeIce at (-12, 114)
  const inlet = (1 - smoothstep(3.0, 10.5, Math.abs(x - (-12)))) * (1 - smoothstep(4.5, 13.5, Math.abs(z - 115)));
  return Math.max(mainLake, inlet);
}

export function isOverLake(x, z) {
  return lakeFactor(x, z) > 0.35;
}

// Path factor for packed snow lane from Home -> Village -> Bridge -> Hilltop Post Office
function roadFactor(x, z) {
  // Gentle S-curve spine of the village road
  const roadX =
    z < 30 ? 0 :
    z < 105 ? Math.sin((z - 30) * 0.045) * 5.0 :
    z < 135 ? lerp(Math.sin(75 * 0.045) * 5.0, -12, smoothstep(105, 114, z)) :
    z < 220 ? lerp(-12, 0, smoothstep(135, 220, z)) : 0;
  const d = Math.abs(x - roadX);
  const inRange = smoothstep(-8, 6, z) * (1 - smoothstep(328, 344, z));
  return (1 - smoothstep(2.4, 6.2, d)) * inRange;
}

function flattenPad(h, x, z, px, pz, targetY, innerR, outerR) {
  const d = Math.hypot(x - px, z - pz);
  const w = 1 - smoothstep(innerR, outerR, d);
  return lerp(h, targetY, w);
}

// Lake bed & land height (under the ice inside the lake basin)
export function getLakeBedY(x, z) {
  // Base gentle Lapland valley undulation
  let h = (fbm(x * 0.016 + 3.1, z * 0.016 - 1.7) - 0.45) * 5.2;

  // Gently rising northern hill toward Aurora Post Office (z: 215 -> 336)
  const hillRise = smoothstep(210, 336, z) * OFFICE_POS.y;
  h += hillRise;

  // Flanking outer snow ridges far to the left, right, and north
  const sideDist = Math.max(0, Math.abs(x) - 108);
  h += Math.pow(sideDist * 0.024, 1.55) * 14;
  const backDist = Math.max(0, -z - 34);
  h += Math.pow(backDist * 0.035, 1.45) * 10;
  const northDist = Math.max(0, z - 368);
  h += Math.pow(northDist * 0.03, 1.5) * 14;

  // Carve the frozen lake basin gently under the ice plane
  const lf = lakeFactor(x, z);
  if (lf > 0.001) {
    h = lerp(h, ICE_Y - 0.16, lf);
  }

  // Flatten exact pads for buildings & landmarks so every wall & post sits flush on snow
  // (Pads follow natural terrain closely with wide soft transitions so neighbors never sit on cliffs)
  h = flattenPad(h, x, z, 0, 2, 0.0, 21, 32); // Home yard & front garden
  h = flattenPad(h, x, z, -26, 6, 0.0, 7, 13);
  h = flattenPad(h, x, z, 24, 14, 0.0, 7, 13);
  h = flattenPad(h, x, z, -24, -18, 0.0, 6.5, 12);
  h = flattenPad(h, x, z, 0, 62, 0.5, 22, 34); // Village lane core
  h = flattenPad(h, x, z, -14.5, 36, 0.5, 6.5, 11);
  h = flattenPad(h, x, z, 15.5, 42, 0.5, 6.5, 10);
  h = flattenPad(h, x, z, -13.5, 82, 0.5, 6.5, 11);
  h = flattenPad(h, x, z, 16.5, 76, 0.5, 6.5, 10.5);
  h = flattenPad(h, x, z, OVEN_POS.x, OVEN_POS.z, OVEN_POS.y, 4.5, 9.0);
  h = flattenPad(h, x, z, CHAPEL_POS.x, CHAPEL_POS.z, CHAPEL_POS.y, 6.5, 13.0);
  h = flattenPad(h, x, z, FEEDER_POS.x, FEEDER_POS.z, FEEDER_POS.y, 6.5, 13.0);
  h = flattenPad(h, x, z, DETOUR_CABIN_POS.x, DETOUR_CABIN_POS.z, DETOUR_CABIN_POS.y, 7.0, 14.0);
  h = flattenPad(h, x, z, BARN_POS.x, BARN_POS.z, BARN_POS.y, 8.0, 18.0);
  // Northern snow-approach hamlet pads (matching natural hillside rise cleanly)
  h = flattenPad(h, x, z, 18.5, 166, 0.85, 6.5, 14.0);
  h = flattenPad(h, x, z, -19.0, 178, 0.95, 6.5, 14.0);
  h = flattenPad(h, x, z, -21.0, 248, 5.2, 6.5, 14.5);
  h = flattenPad(h, x, z, 22.0, 274, 10.2, 6.5, 14.5);
  h = flattenPad(h, x, z, OFFICE_POS.x, OFFICE_POS.z, OFFICE_POS.y, 19, 34);

  return h;
}

// Required Gate 2 API: ground / snow / frozen lake surface height
export function getGroundY(x, z) {
  const bed = getLakeBedY(x, z);
  const lf = lakeFactor(x, z);
  if (lf > 0.02) {
    return Math.max(bed, ICE_Y);
  }
  return bed;
}

export class SnowTerrain {
  constructor({ segs = 128 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'terrainWorld';

    // Main snowfield mesh (-220..220 in X, -80..440 in Z)
    const width = 440;
    const depth = 520;
    const geo = new THREE.PlaneGeometry(width, depth, segs, segs);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 180);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cSnow = new THREE.Color(0xe5edf7);
    const cShade = new THREE.Color(0xc2d2e8);
    const cRoad = new THREE.Color(0xd2dfef);
    const cIceShore = new THREE.Color(0xb6d2e6);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getLakeBedY(x, z);
      pos.setY(i, y);

      const n = fbm(x * 0.06, z * 0.06);
      const rf = roadFactor(x, z);
      const lf = lakeFactor(x, z);
      tmp.copy(cSnow).lerp(cShade, clamp((1 - n) * 0.65, 0, 1));
      tmp.lerp(cRoad, rf * 0.65);
      if (lf > 0.01) tmp.lerp(cIceShore, clamp(lf * 1.2, 0, 1));

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const snowMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.04,
    });
    snowMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSnowW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSnowW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vSnowW;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           vec2 sUv = vSnowW.xz * 12.0;
           vec2 sCell = floor(sUv);
           vec2 sF = fract(sUv) - 0.5;
           float g1 = fract(sin(dot(sCell, vec2(12.9898, 78.233))) * 43758.5453);
           float pin = smoothstep(0.18, 0.04, length(sF));
           float sp = pin * smoothstep(0.96, 0.998, g1) * (0.45 + 0.55 * sin(uTime * 2.8 + g1 * 40.0));
           totalEmissiveRadiance += vec3(0.45, 0.72, 0.95) * sp * 0.55;`
        );
    };

    const snowMesh = new THREE.Mesh(geo, snowMat);
    snowMesh.name = 'terrainSnow';
    snowMesh.receiveShadow = true;
    this.group.add(snowMesh);

    // Frozen lake ice surface plane at ICE_Y (follows lakeFactor shoreline cleanly; nonsolid since getGroundY handles ice support)
    const iceGeo = new THREE.PlaneGeometry(118, 128, 44, 44);
    iceGeo.rotateX(-Math.PI / 2);
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0xa6cbe0,
      roughness: 0.16,
      metalness: 0.18,
      envMapIntensity: 1.25,
      transparent: true,
      alphaTest: 0.02,
    });
    const iceAlpha = new Float32Array(iceGeo.attributes.position.count);
    const icePos = iceGeo.attributes.position;
    for (let i = 0; i < icePos.count; i++) {
      const wx = icePos.getX(i) - 42;
      const wz = icePos.getZ(i) + 158;
      const lf = lakeFactor(wx, wz);
      iceAlpha[i] = smoothstep(0.18, 0.55, lf);
    }
    iceGeo.setAttribute('aIceMask', new THREE.BufferAttribute(iceAlpha, 1));
    iceMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aIceMask;\nvarying float vIceMask;\nvarying vec3 vIceW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvIceMask = aIceMask;\nvIceW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vIceMask;\nvarying vec3 vIceW;')
        .replace('#include <dithering_fragment>', 'gl_FragColor.a *= vIceMask;\nif (gl_FragColor.a < 0.02) discard;\n#include <dithering_fragment>')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float streak = sin(vIceW.x * 0.25 + vIceW.z * 0.18) * 0.5 + 0.5;
           totalEmissiveRadiance += mix(vec3(0.04, 0.11, 0.18), vec3(0.08, 0.26, 0.22), streak) * 0.55;`
        );
    };
    const iceMesh = new THREE.Mesh(iceGeo, iceMat);
    iceMesh.name = 'frozenLakeIce';
    iceMesh.position.set(-42, ICE_Y, 158);
    iceMesh.receiveShadow = true;
    iceMesh.userData.nonsolid = true;
    this.group.add(iceMesh);
  }
}
