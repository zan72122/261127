import * as THREE from '../../lib/three.module.js';
import {
  BAMBOO_POS,
  BRIDGE_POS,
  GLSL_NOISE,
  GOAL_POS,
  HOME_POS,
  LAYER_MAIN,
  LAYER_REFLECT,
  MEADOW_LAND_POS,
  MILL_POS,
  PALETTE,
  WELL_POS,
} from '../core/env.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

export const STREAM_WATER_Y = 2.0;
export const TERRACE_COUNT = 7;

export function streamCenterZ(x) {
  return 68 + 18 * Math.sin(-x * 0.045);
}

export function terraceZRange(x, i) {
  const curve = 0.0022 * x * x + 4.0 * Math.sin(x * 0.032 + i * 0.55);
  const z0 = 112 + i * 24 + curve;
  const z1 = z0 + 21.2;
  return { z0, z1, waterY: 3.6 + i * 2.55 };
}

function getPaddyInfo(x, z) {
  if (x < -64 || x > 48 || z < 108 || z > 286) return null;
  for (let i = 0; i < TERRACE_COUNT; i++) {
    const { z0, z1, waterY } = terraceZRange(x, i);
    if (z >= z0 - 1.5 && z <= z1 + 1.5) {
      const inBasin = z >= z0 + 1.25 && z <= z1 - 1.25 && x >= -59 && x <= 45;
      return { idx: i, z0, z1, waterY, inBasin };
    }
  }
  return null;
}

function baseSlopeY(x, z) {
  // Valley profile from home terrace (+14) -> creek (+2.8) -> terraces (+3.6..19.5) -> lookout hill (+44)
  let y = 2.8;

  // Home ridge at z <= 28
  const homeFall = 1 - smoothstep(20, 50, z);
  y = lerp(y, 14.0, homeFall);

  // Northward climb across terrace zone toward lookout hill
  if (z > 98) {
    const tTerr = smoothstep(98, 286, z);
    y = lerp(y, 20.8, tTerr);
  }
  if (z > 268 && z <= 368) {
    const hillDist = Math.hypot(x - GOAL_POS.x, (z - GOAL_POS.z) * 1.25);
    const hillRise = 1 - smoothstep(13, 64, hillDist);
    const northSlope = smoothstep(285, 344, z) * 0.45;
    y = lerp(y, GOAL_POS.y, Math.max(hillRise, northSlope));
  } else if (z > 368) {
    // Open ridge saddle beyond the lookout so north view shows sky & distant peaks instead of a green wall
    const backDrop = smoothstep(360, 412, z);
    const hillDist = Math.hypot(x - GOAL_POS.x, (z - GOAL_POS.z) * 1.25);
    const peak = lerp(20.8, GOAL_POS.y, 1 - smoothstep(13, 64, hillDist));
    y = lerp(peak, 26.0, backDrop * 0.85);
    if (z > 435) {
      y += smoothstep(435, 510, z) * 20;
    }
  }

  // Satoyama side hills framing the valley (|x| > 64)
  const sideDist = Math.max(0, Math.abs(x) - 60);
  if (sideDist > 0) {
    const ridge = smoothstep(0, 120, sideDist);
    const undul = Math.sin(x * 0.025 + z * 0.018) * 4.5 + Math.cos(z * 0.022 - x * 0.015) * 3.5;
    y += ridge * (36 + undul);
  }

  // Far south horizon hills
  if (z < -26) {
    y += smoothstep(-26, -150, z) * 32;
  }

  // Gentle organic meadow undulation outside flat pads
  const micro = Math.sin(x * 0.07) * Math.cos(z * 0.065) * 0.42;
  y += micro;

  return y;
}

function applyPad(y, x, z, px, pz, targetY, innerR, outerR) {
  const d = Math.hypot(x - px, z - pz);
  if (d >= outerR) return y;
  const w = 1 - smoothstep(innerR, outerR, d);
  return lerp(y, targetY, w);
}

export function getGroundY(x, z) {
  let y = baseSlopeY(x, z);

  // Terrace sculpting (depressed paddy basins & raised earthen berms)
  const paddy = getPaddyInfo(x, z);
  if (paddy) {
    const fadeEdge =
      smoothstep(-66, -59, x) *
      (1 - smoothstep(43, 50, x));
    const basinDepth = paddy.inBasin ? -0.46 : 0.28;
    const targetY = paddy.waterY + basinDepth;
    y = lerp(y, targetY, fadeEdge * 0.99);
  }

  // Flat pads for home compound & every valley settlement / landmark so structures sit flush
  y = applyPad(y, x, z, HOME_POS.x, HOME_POS.z, HOME_POS.y, 26, 38);
  y = applyPad(y, x, z, WELL_POS.x, WELL_POS.z, WELL_POS.y, 4.5, 9.0);
  y = applyPad(y, x, z, -24, 48, 3.2, 6.2, 11.5);   // villageHouseWest
  y = applyPad(y, x, z, -35, 55, 3.2, 5.2, 10.0);   // kuraStorehouse
  y = applyPad(y, x, z, 26, 65, 3.1, 6.2, 11.5);    // villageHouseEast
  y = applyPad(y, x, z, 35, 72, 3.1, 4.5, 8.8);     // villageShedEast
  y = applyPad(y, x, z, 7.0, 82, 2.8, 3.5, 7.5);    // waysideShrine
  y = applyPad(y, x, z, -14, 102, 2.8, 3.8, 7.5);   // riceRackWest
  y = applyPad(y, x, z, 18, 102, 2.8, 3.8, 7.5);    // riceRackEast
  y = applyPad(y, x, z, MEADOW_LAND_POS.x, MEADOW_LAND_POS.z, MEADOW_LAND_POS.y, 6.5, 12.5); // open meadow landing pad
  y = applyPad(y, x, z, MILL_POS.x, MILL_POS.z, MILL_POS.y, 5.2, 9.5); // watermill house bank pad

  // Meandering stream channel (carved cleanly between banks; mill house sits just north of bank)
  const scz = streamCenterZ(x);
  const dStream = Math.abs(z - scz);
  if (dStream < 5.6) {
    const bankBlend = 1 - smoothstep(3.4, 5.6, dStream);
    const bedY = dStream < 3.4 ? 1.15 : lerp(1.15, 2.8, smoothstep(3.4, 5.2, dStream));
    y = lerp(y, bedY, bankBlend);
  }

  // Flat pads away from stream
  y = applyPad(y, x, z, BAMBOO_POS.x, BAMBOO_POS.z, BAMBOO_POS.y, 12.5, 20.0);
  y = applyPad(y, x, z, 48, 66, 3.2, 4.5, 8.5);
  y = applyPad(y, x, z, 50, 102, 4.5, 4.5, 8.5);
  y = applyPad(y, x, z, -50, 108, 4.5, 4.5, 8.5);
  y = applyPad(y, x, z, -68, 162, 9.8, 5.5, 11.0);
  y = applyPad(y, x, z, 70, 220, 18.0, 5.5, 11.0);
  y = applyPad(y, x, z, -66, 268, 22.0, 5.5, 11.0);
  y = applyPad(y, x, z, GOAL_POS.x, GOAL_POS.z + 2.5, GOAL_POS.y, 14.5, 23.0);

  return y;
}

export function getWaterY(x, z) {
  const scz = streamCenterZ(x);
  if (Math.abs(z - scz) < 4.5) {
    return STREAM_WATER_Y;
  }
  const paddy = getPaddyInfo(x, z);
  if (paddy && paddy.inBasin) {
    return paddy.waterY;
  }
  return null;
}

export function isWaterAt(x, z) {
  return getWaterY(x, z) !== null;
}

export function getBridgeDeckY(x, z) {
  // 1. Main granite arch bridge at (0, 68)
  if (Math.abs(x - BRIDGE_POS.x) <= 2.1 && Math.abs(z - BRIDGE_POS.z) <= 6.2) {
    const u = (z - BRIDGE_POS.z) / 6.2;
    return STREAM_WATER_Y + 0.78 + (1 - u * u) * 0.72;
  }
  // 2. Cedar plank bridge near watermill at x = -14
  const millBrZ = streamCenterZ(-14);
  if (Math.abs(x + 14) <= 1.6 && Math.abs(z - millBrZ) <= 5.8) {
    const u = (z - millBrZ) / 5.8;
    return STREAM_WATER_Y + 0.68 + (1 - u * u) * 0.35;
  }
  // 3. East cedar footbridge at x = +32
  const eastBrZ = streamCenterZ(32);
  if (Math.abs(x - 32) <= 1.5 && Math.abs(z - eastBrZ) <= 5.8) {
    const u = (z - eastBrZ) / 5.8;
    return STREAM_WATER_Y + 0.68 + (1 - u * u) * 0.42;
  }
  return null;
}

export function getWalkableY(x, z) {
  const bridge = getBridgeDeckY(x, z);
  const g = getGroundY(x, z);
  if (bridge !== null) return Math.max(g, bridge);
  return g;
}

export function getSurfaceY(x, z) {
  const g = getGroundY(x, z);
  const w = getWaterY(x, z);
  return w !== null ? Math.max(g, w) : g;
}

export function isFlatLandable(x, z) {
  if (getWaterY(x, z) !== null) return false;
  const dx = Math.abs(getGroundY(x + 1.6, z) - getGroundY(x - 1.6, z));
  const dz = Math.abs(getGroundY(x, z + 1.6) - getGroundY(x, z - 1.6));
  if (dx > 0.65 || dz > 0.65) return false;
  for (let i = 0; i < solidColliders.length; i++) {
    const col = solidColliders[i];
    if (col.kind === 'cyl') {
      if (Math.hypot(x - col.cx, z - col.cz) < col.r + 2.2) return false;
    } else {
      if (Math.abs(x - col.cx) < col.hx + 2.2 && Math.abs(z - col.cz) < col.hz + 2.2) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Rigid body collider registry (keeps girl & plane outside all structures)
// ---------------------------------------------------------------------------
export const solidColliders = [];

export function clearColliders() {
  solidColliders.length = 0;
}

export function registerBoxCollider(name, cx, cz, hx, hz, minY, maxY) {
  solidColliders.push({ kind: 'box', name, cx, cz, hx, hz, minY, maxY });
}

export function registerCylCollider(name, cx, cz, r, minY, maxY) {
  solidColliders.push({ kind: 'cyl', name, cx, cz, r, minY, maxY });
}

export function resolveGirlCollisions(pos, radius = 0.44) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < solidColliders.length; i++) {
      const c = solidColliders[i];
      if (pos.y + 1.25 < c.minY || pos.y > c.maxY + 0.1) continue;
      if (c.kind === 'cyl') {
        const dx = pos.x - c.cx;
        const dz = pos.z - c.cz;
        const dist = Math.hypot(dx, dz);
        const minD = c.r + radius;
        if (dist < minD) {
          const nx = dist > 1e-4 ? dx / dist : 1;
          const nz = dist > 1e-4 ? dz / dist : 0;
          pos.x = c.cx + nx * minD;
          pos.z = c.cz + nz * minD;
        }
      } else {
        const ex = c.hx + radius;
        const ez = c.hz + radius;
        const dx = pos.x - c.cx;
        const dz = pos.z - c.cz;
        if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
          const ox = ex - Math.abs(dx);
          const oz = ez - Math.abs(dz);
          if (ox < oz) {
            pos.x += dx >= 0 ? ox : -ox;
          } else {
            pos.z += dz >= 0 ? oz : -oz;
          }
        }
      }
    }
    // Keep walking girl out of deep stream channel unless crossing a bridge
    if (getBridgeDeckY(pos.x, pos.z) === null) {
      const scz = streamCenterZ(pos.x);
      const dz = pos.z - scz;
      if (Math.abs(dz) < 4.25) {
        pos.z = scz + (dz >= 0 ? 4.25 : -4.25);
      }
    }
  }
}

export function resolvePlaneCollisions(pos, radius = 1.85) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < solidColliders.length; i++) {
      const c = solidColliders[i];
      if (pos.y - 0.35 > c.maxY || pos.y + 0.55 < c.minY) continue;
      if (c.kind === 'cyl') {
        const dx = pos.x - c.cx;
        const dz = pos.z - c.cz;
        const dist = Math.hypot(dx, dz);
        const minD = c.r + radius;
        if (dist < minD) {
          const topPush = c.maxY + 0.52 - pos.y;
          if (topPush > 0 && topPush < 1.9) {
            pos.y = c.maxY + 0.52;
          } else {
            const nx = dist > 1e-4 ? dx / dist : 1;
            const nz = dist > 1e-4 ? dz / dist : 0;
            pos.x = c.cx + nx * minD;
            pos.z = c.cz + nz * minD;
          }
        }
      } else {
        const ex = c.hx + radius;
        const ez = c.hz + radius;
        const dx = pos.x - c.cx;
        const dz = pos.z - c.cz;
        if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
          const topPush = c.maxY + 0.52 - pos.y;
          if (topPush > 0 && topPush < 2.2) {
            pos.y = c.maxY + 0.52;
          } else {
            const ox = ex - Math.abs(dx);
            const oz = ez - Math.abs(dz);
            if (ox < oz) pos.x += dx >= 0 ? ox : -ox;
            else pos.z += dz >= 0 ? oz : -oz;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Satoyama Terrain Mesh
// ---------------------------------------------------------------------------
export class SatoyamaTerrain {
  constructor(opts = {}) {
    clearColliders();
    this.group = new THREE.Group();
    this.group.name = 'terrainValley';
    this.group.userData.isTerrain = true;

    const segs = opts.segs || 128;
    const width = 460;
    const depth = 580;
    const geo = new THREE.PlaneGeometry(width, depth, segs, Math.round(segs * 1.15));
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cMeadow = PALETTE.meadowGreen.clone();
    const cRiceBank = new THREE.Color('#6c944a');
    const cPath = new THREE.Color('#b6aa92');
    const cMud = new THREE.Color('#5a5442');
    const cHill = new THREE.Color('#4b733e');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) + 170; // cover z = -120 .. +460
      pos.setZ(i, z);

      const y = getGroundY(x, z);
      pos.setY(i, y);

      const paddy = getPaddyInfo(x, z);
      const scz = streamCenterZ(x);
      const dStream = Math.abs(z - scz);
      const dHome = Math.hypot(x - HOME_POS.x, z - HOME_POS.z);

      tmp.copy(cMeadow);
      if (dStream < 5.2) {
        tmp.lerp(cMud, 1 - smoothstep(2.8, 5.2, dStream));
      } else if (paddy && paddy.inBasin && x > -59 && x < 45) {
        tmp.lerp(cMud, 0.85);
      } else if (paddy) {
        tmp.lerp(cRiceBank, 0.65);
      } else if (dHome < 28) {
        // Warm gravel path leading from engawa past mailbox toward valley edge
        const pathDist = Math.abs(x - (z * 0.42 + 1.8));
        if (z > -2 && z < 24 && pathDist < 2.2) {
          tmp.lerp(cPath, 1 - smoothstep(0.8, 2.2, pathDist));
        }
      } else if (z >= 24 && z <= 106) {
        // Rural valley footpaths linking well, village houses, stone bridge, and watermill
        const laneBridge = Math.abs(x - 0.5);
        const laneCross = Math.abs(z - 52);
        if (laneBridge < 2.0 && z < 96) {
          tmp.lerp(cPath, (1 - smoothstep(0.7, 2.0, laneBridge)) * 0.82);
        } else if (laneCross < 1.9 && x > -34 && x < 30) {
          tmp.lerp(cPath, (1 - smoothstep(0.7, 1.9, laneCross)) * 0.78);
        }
      }

      if (Math.abs(x) > 64) {
        tmp.lerp(cHill, smoothstep(64, 125, Math.abs(x)) * 0.72);
      }

      // Subtle height-based warmth from oblique sun
      tmp.offsetHSL(0, 0, clamp((y - 12) * 0.0014, -0.04, 0.05));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: !!opts.low,
    });
    if (!opts.low) {
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vTerW;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvTerW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec3 vTerW;\n${GLSL_NOISE}`)
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float gTex = fbm2(vTerW.xz * 0.28);
            float gFine = vnoise2(vTerW.xz * 1.45);
            float varTone = (gTex - 0.5) * 0.16 + (gFine - 0.5) * 0.07;
            diffuseColor.rgb *= (1.0 + vec3(varTone * 0.85, varTone, varTone * 0.55));
            `
          );
      };
      mat.customProgramCacheKey = () => 'satoyama-terrain-v3';
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'terrainMesh';
    mesh.userData.isTerrain = true;
    mesh.receiveShadow = true;
    mesh.layers.enable(LAYER_MAIN);
    mesh.layers.enable(LAYER_REFLECT);
    this.group.add(mesh);

    // Distant horizon mountain rim for depth (non-solid visual backdrop)
    const rimGeo = new THREE.CylinderGeometry(310, 340, 88, 36, 1, true);
    const rimPos = rimGeo.attributes.position;
    for (let i = 0; i < rimPos.count; i++) {
      if (rimPos.getY(i) > 0) {
        const ang = Math.atan2(rimPos.getZ(i), rimPos.getX(i));
        const h = 38 + Math.sin(ang * 5) * 14 + Math.cos(ang * 9 + 1.2) * 8;
        rimPos.setY(i, h);
      } else {
        rimPos.setY(i, -12);
      }
    }
    rimGeo.computeVertexNormals();
    const rimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#6a8a78'),
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.BackSide,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.name = 'distantRidges';
    rim.userData.nonsolid = true;
    rim.position.set(0, 12, 170);
    rim.layers.enable(LAYER_MAIN);
    rim.layers.enable(LAYER_REFLECT);
    this.group.add(rim);
  }
}
