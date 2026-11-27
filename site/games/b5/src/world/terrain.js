import * as THREE from '../../lib/three.module.js';
import {
  COVE_POS,
  ISLAND_GREEN_POS,
  LIGHTHOUSE_POS,
  PALETTE,
  SANDBAR_MAIN_POS,
  SANDBAR_WEST_POS,
  SEA_LEVEL,
  SUN_DIR,
  shared,
} from '../core/env.js';
import { clamp, fbm2D, lerp, smoothstep } from '../core/math.js';
import { getWorldTextures } from '../core/textures.js';

// Exact flat building pads so all structures rest flush on ground
export const BUILDING_PADS = [
  { x: -5.5, z: -6.5, r: 6.2, blend: 4.5, h: 2.0 }, // houseHome
  { x: -12.5, z: -2.5, r: 2.6, blend: 2.4, h: 1.92 }, // wellStone
  { x: 4.4, z: -3.5, r: 2.5, blend: 2.4, h: 1.85 }, // rackFishing
  { x: 6.8, z: -10.5, r: 3.8, blend: 3.2, h: 2.02 }, // shedNetHome
  { x: -1.1, z: 0.2, r: 1.8, blend: 1.8, h: 1.72 }, // postbox
  { x: -13.2, z: 8.6, r: 1.6, blend: 2.0, h: 1.02 }, // cratesPierHome
  { x: 14.5, z: -8.0, r: 6.0, blend: 4.5, h: 2.05 }, // houseNeighbor1
  { x: -21.5, z: -5.5, r: 6.0, blend: 4.5, h: 2.05 }, // houseNeighbor2
  { x: -15.5, z: -18.5, r: 5.8, blend: 4.5, h: 2.12 }, // houseBackWest
  { x: 11.5, z: -19.5, r: 5.8, blend: 4.5, h: 2.12 }, // houseBackEast
  { x: 26.5, z: 2.0, r: 5.4, blend: 4.0, h: 1.78 }, // houseEastBoat
  { x: -28.0, z: 3.0, r: 5.4, blend: 4.0, h: 1.78 }, // houseWestBeach
  // East coastal village continuation
  { x: 68.0, z: 78.0, r: 5.4, blend: 4.2, h: 2.05 }, // houseEast0
  { x: 69.0, z: 98.0, r: 5.6, blend: 4.5, h: 2.05 }, // houseEast1
  { x: 72.0, z: 120.0, r: 5.8, blend: 4.5, h: 2.05 }, // houseEast2
  { x: 68.0, z: 142.0, r: 5.6, blend: 4.5, h: 2.05 }, // houseEast3
  { x: 67.0, z: 162.0, r: 5.4, blend: 4.2, h: 2.05 }, // houseEast4
  // Small island hilltop
  { x: ISLAND_GREEN_POS.x, z: ISLAND_GREEN_POS.z, r: 10.2, blend: 6.0, h: 2.55 },
  // Star-Sand Lighthouse Cove
  { x: LIGHTHOUSE_POS.x, z: LIGHTHOUSE_POS.z, r: 5.5, blend: 4.5, h: 2.15 }, // lighthouseTower
  { x: 4.5, z: 318.0, r: 5.8, blend: 4.5, h: 2.15 }, // houseKeeper
];

export const PIER_DECK_RECTS = [
  { name: 'pierHome', x: -10.5, z: 22.0, hx: 1.8, hz: 9.8, deckY: 0.75 },
  { name: 'pierReef', x: -25.0, z: 84.0, hx: 7.5, hz: 1.7, deckY: 0.75 },
  { name: 'pierIsland', x: -19.5, z: 195.0, hx: 7.5, hz: 1.7, deckY: 0.75 },
  { name: 'pierEast', x: 56.5, z: 118.0, hx: 9.5, hz: 1.8, deckY: 0.75 },
  { name: 'pierCove', x: 0.0, z: 290.0, hx: 1.8, hz: 8.2, deckY: 0.75 },
];

export function shoreZ(x) {
  return 16.2 + 2.4 * Math.sin(x * 0.05) + 1.4 * Math.cos(x * 0.095);
}

export function getGroundY(x, z) {
  // Base shallow emerald lagoon seabed
  const n = fbm2D(x * 0.032 + 11.3, z * 0.032 - 4.7, 3);
  let y = -2.25 + (n - 0.5) * 1.15;

  // Gentle sand waves in lagoon
  y += 0.16 * Math.sin(x * 0.14 + z * 0.08);

  // Home village shoreline (z < shoreZ)
  const sz = shoreZ(x);
  if (z < sz + 6.0) {
    const landT = smoothstep(sz + 2.6, sz - 12.5, z);
    const villageY = -1.9 + landT * 4.1 + (n - 0.5) * 0.16 * smoothstep(sz - 2, sz - 18, z);
    y = Math.max(y, villageY);
  }

  // East coastal continuation peninsula (x > 46, z in [50, 192]) — cohesive flat coastal terrace for x >= 61.5
  if (x > 46 && z > 50 && z < 192) {
    const edgeZ = smoothstep(50, 68, z) * smoothstep(192, 174, z);
    const riseX = smoothstep(54.0, 61.5, x);
    const eastY = lerp(-1.8, 2.05, riseX) * edgeZ - 1.8 * (1 - edgeZ);
    y = Math.max(y, eastY);
  }

  // Main Sandbar (x=24, z=150) — wide, flat-topped coral sandbar ideal for landing & walking
  {
    const d = Math.hypot((x - SANDBAR_MAIN_POS.x) * 0.92, (z - SANDBAR_MAIN_POS.z) * 0.85);
    const t = 1 - smoothstep(10.0, 24.0, d);
    if (t > 0) y = Math.max(y, lerp(-1.6, 0.54, t));
  }

  // West Detour Sandbar (x=-56, z=118)
  {
    const d = Math.hypot((x - SANDBAR_WEST_POS.x) * 0.95, (z - SANDBAR_WEST_POS.z) * 0.88);
    const t = 1 - smoothstep(8.0, 19.5, d);
    if (t > 0) y = Math.max(y, lerp(-1.7, 0.46, t));
  }

  // Small Green Island (x=-42, z=195)
  {
    const d = Math.hypot(x - ISLAND_GREEN_POS.x, z - ISLAND_GREEN_POS.z);
    const t = 1 - smoothstep(11.0, 27.0, d);
    if (t > 0) y = Math.max(y, lerp(-1.9, 2.75, t));
  }

  // Reef shelf (shallow coral shelves around z=68..122, x=-35..30)
  {
    const d = Math.hypot((x + 6) * 0.72, (z - 94) * 0.58);
    const shelf = (1 - smoothstep(16, 36, d)) * 1.15;
    y = Math.max(y, -2.2 + shelf);
  }

  // Reef pier rocky spit (-34, 84)
  {
    const d = Math.hypot((x + 36) * 0.85, (z - 84) * 0.85);
    const t = 1 - smoothstep(4.5, 13.5, d);
    if (t > 0) y = Math.max(y, lerp(-1.6, 0.95, t));
  }

  // Star-Sand Lighthouse Cove crescent (centered around COVE_POS (11, 304), lighthouse at (18, 315))
  {
    const dx = x - COVE_POS.x;
    const dz = z - 322;
    const dBack = Math.hypot(dx * 0.72, dz * 0.85);
    const coveRise = 1 - smoothstep(16.0, 36.0, dBack);
    if (coveRise > 0) {
      y = Math.max(y, lerp(-1.8, 2.2, coveRise));
    }
    // Keep cove front opening (around x=7..11, z=286..298) crystal-shallow water for whale rest
    const dOpen = Math.hypot(x - 8.8, z - 294.0);
    if (dOpen < 14.5) {
      const scoop = 1 - smoothstep(4.5, 14.5, dOpen);
      y = lerp(y, Math.min(y, -0.82), scoop * 0.92);
    }
  }

  // Apply exact flat pads for buildings/landmarks
  for (let i = 0; i < BUILDING_PADS.length; i++) {
    const p = BUILDING_PADS[i];
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + p.blend) {
      const w = 1 - smoothstep(p.r, p.r + p.blend, d);
      y = lerp(y, p.h, w);
    }
  }

  return y;
}

export function getWalkSurfaceY(x, z) {
  let y = getGroundY(x, z);
  for (let i = 0; i < PIER_DECK_RECTS.length; i++) {
    const p = PIER_DECK_RECTS[i];
    if (Math.abs(x - p.x) <= p.hx && Math.abs(z - p.z) <= p.hz) {
      y = Math.max(y, p.deckY);
    }
  }
  return y;
}

export function isWalkableDryOrShallow(x, z) {
  return getWalkSurfaceY(x, z) >= -0.25;
}

export class LagoonTerrain {
  constructor({ segs = 128, low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'terrainGroup';

    const sizeX = 290;
    const sizeZ = 400;
    const segX = segs;
    const segZ = Math.round(segs * 1.25);

    const geo = new THREE.PlaneGeometry(sizeX, sizeZ, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    // Center Z at 160 so terrain spans z in [-40, +360]
    geo.translate(0, 0, 160);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const cDeepReef = new THREE.Color(PALETTE.reefDeep);
    const cLagoon = new THREE.Color('#6dbeb1');
    const cWetSand = new THREE.Color(PALETTE.sandWet);
    const cWhiteSand = new THREE.Color(PALETTE.sandWhite);
    const cCoastalTurf = new THREE.Color('#4b7347');
    const cPathSand = new THREE.Color('#ded3bb');
    const cTmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getGroundY(x, z);
      pos.setY(i, y);

      if (y < -1.35) {
        const t = smoothstep(-2.8, -1.35, y);
        cTmp.lerpColors(cDeepReef, cLagoon, t);
      } else if (y < -0.12) {
        const t = smoothstep(-1.35, -0.12, y);
        cTmp.lerpColors(cLagoon, cWetSand, t);
      } else if (y < 0.72) {
        const t = smoothstep(-0.12, 0.72, y);
        cTmp.lerpColors(cWetSand, cWhiteSand, t);
      } else {
        const t = smoothstep(0.65, 1.35, y);
        cTmp.lerpColors(cWhiteSand, cCoastalTurf, t);
        // Coral sand path from home gate (0, -2) down to beach (0, 17)
        if (z > -8 && z < 17 && Math.abs(x) < 3.4) {
          const pathW = 1 - smoothstep(1.3, 3.3, Math.abs(x));
          cTmp.lerp(cPathSand, pathW * 0.88);
        }
      }

      colors[i * 3] = cTmp.r;
      colors[i * 3 + 1] = cTmp.g;
      colors[i * 3 + 2] = cTmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const tex = getWorldTextures({ low });
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.0,
      bumpMap: low ? null : tex.sandRipple,
      bumpScale: 0.032,
    });

    this.groundMesh = new THREE.Mesh(geo, mat);
    this.groundMesh.name = 'lagoonGround';
    this.groundMesh.receiveShadow = !low;
    this.group.add(this.groundMesh);

    // Translucent emerald-turquoise water surface (wide circle blends seamlessly with dusk horizon; non-solid)
    const waterSegs = low ? 32 : 64;
    const wGeo = new THREE.CircleGeometry(1200, waterSegs);
    wGeo.rotateX(-Math.PI / 2);
    wGeo.translate(0, SEA_LEVEL, 160);

    const wMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: shared.uTime,
        uSunDir: { value: SUN_DIR },
        uShallow: { value: new THREE.Color('#47bfb0') },
        uDeep: { value: new THREE.Color('#195875') },
        uSunCol: { value: new THREE.Color('#ffd391') },
        uFogCol: { value: new THREE.Color('#e4c0a3') },
        uHorizonCol: { value: new THREE.Color('#ebb894') },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 p = position;
          float dCam = length(p.xz - vec2(0.0, 140.0));
          float dampFar = 1.0 - smoothstep(140.0, 420.0, dCam);
          float w = (sin(p.x * 0.22 + uTime * 1.15) * 0.04
                   + cos(p.z * 0.19 - uTime * 0.92) * 0.04
                   + sin((p.x + p.z) * 0.45 + uTime * 1.65) * 0.018) * dampFar;
          p.y += w;
          vWave = w;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uSunCol;
        uniform vec3 uFogCol;
        uniform vec3 uHorizonCol;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 toCam = cameraPosition - vWorldPos;
          float viewDist = length(toCam);
          vec3 V = toCam / max(viewDist, 0.0001);
          float waveFade = 1.0 - smoothstep(40.0, 145.0, viewDist);
          vec3 N = normalize(vec3(
            (-cos(vWorldPos.x * 0.22 + uTime * 1.15) * 0.055 - cos((vWorldPos.x + vWorldPos.z) * 0.45 + uTime * 1.65) * 0.03) * waveFade,
            1.0,
            (sin(vWorldPos.z * 0.19 - uTime * 0.92) * 0.055 - cos((vWorldPos.x + vWorldPos.z) * 0.45 + uTime * 1.65) * 0.03) * waveFade
          ));
          float fres = pow(1.0 - max(0.0, dot(V, N)), 3.2);
          float dist = length(vWorldPos.xz - vec2(0.0, 140.0));
          float outer = smoothstep(95.0, 230.0, dist);
          vec3 baseCol = mix(uShallow, uDeep, clamp(outer * 0.68 + fres * 0.30, 0.0, 1.0));
          baseCol = mix(baseCol, uHorizonCol, fres * 0.58);

          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(0.0, dot(N, H)), 90.0) * 0.85 * waveFade;
          float glitter = pow(max(0.0, dot(N, H)), 24.0) * 0.18 * (0.35 + 0.65 * waveFade);

          vec3 col = baseCol + uSunCol * (spec + glitter + fres * 0.22);
          float fogFactor = 1.0 - exp(-0.0019 * 0.0019 * viewDist * viewDist);
          col = mix(col, mix(uFogCol, uHorizonCol, 0.45), clamp(fogFactor, 0.0, 1.0));
          float alpha = mix(0.46, 0.96, clamp(outer * 0.52 + fres * 0.65 + fogFactor * 0.62, 0.0, 1.0));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.waterMesh = new THREE.Mesh(wGeo, wMat);
    this.waterMesh.name = 'lagoonWater';
    this.waterMesh.userData.nonsolid = true;
    this.waterMesh.renderOrder = 2;
    this.group.add(this.waterMesh);
  }
}
