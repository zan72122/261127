import * as THREE from '../../lib/three.module.js';
import { OASIS_POS, OASIS_RADIUS, OASIS_WATER_Y, OBSERVATORY_POS, PALETTE, shared } from '../core/env.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { makeSandBumpTexture } from '../core/textures.js';
import { OASIS_DOCK, collectTerrainPads } from './layout.js';

function baseTerrainY(x, z) {
  // Gentle village valley floor sloping upward slightly after z=20
  let y = 2.0 + smoothstep(18, 90, z) * 2.4;

  // Sweeping desert dunes across z = 105 .. 355 (gentle central corridor keeps beacon visible)
  const duneMask = smoothstep(95, 138, z) * (1 - smoothstep(335, 376, z));
  if (duneMask > 0.001) {
    const warp = Math.sin(x * 0.022 + z * 0.014) * 14.0;
    const p1 = (z + warp) * 0.052 + x * 0.018;
    const s1 = Math.sin(p1);
    const ridge1 = Math.pow(0.5 + 0.5 * s1, 1.55) * 11.5;
    const p2 = (x * 0.044 - z * 0.028) + Math.cos(z * 0.025) * 2.2;
    const ridge2 = (0.5 + 0.5 * Math.sin(p2)) * 4.8;
    const micro = Math.sin(x * 0.14 + z * 0.09) * 0.42;
    const centerDip = 1 - 0.25 * (1 - smoothstep(10, 48, Math.abs(x - 6)));
    y += duneMask * centerDip * (ridge1 + ridge2 + micro);
  }

  // Oasis sunken spring basin around OASIS_POS (-48, 136) with wide flat shoreline
  const od = Math.hypot(x - OASIS_POS.x, z - OASIS_POS.z);
  if (od < 40) {
    const basinW = 1 - smoothstep(28, 40, od);
    const poolFloor = OASIS_WATER_Y - 0.35; // 1.90m shallow spring
    const shoreY = OASIS_WATER_Y + 0.34;    // 2.59m level sandy bank
    const localOasisY = od < OASIS_RADIUS - 1.5
      ? poolFloor
      : lerp(poolFloor, shoreY, smoothstep(OASIS_RADIUS - 1.5, OASIS_RADIUS + 1.8, od));
    y = lerp(y, localOasisY, basinW);
  }

  // Hilltop Observatory Mesa rising cleanly around (12, 392)
  const obsDist = Math.hypot((x - OBSERVATORY_POS.x) * 0.92, z - OBSERVATORY_POS.z);
  const mesaW = 1 - smoothstep(22, 70, obsDist);
  if (mesaW > 0.001) {
    const stepRidge = Math.sin(obsDist * 0.16) * 0.45 * (1 - mesaW);
    y = lerp(y, OBSERVATORY_POS.y, mesaW) + stepRidge;
  }

  // Outer Atlas foothill mountain rim
  const sideRim = smoothstep(125, 225, Math.abs(x));
  const backRim = smoothstep(420, 520, z);
  const frontRim = smoothstep(-32, -105, z);
  const rim = Math.max(sideRim, backRim, frontRim);
  if (rim > 0.001) {
    const peaks =
      18 +
      14 * Math.sin(x * 0.032 + z * 0.024) +
      9 * Math.cos(x * 0.065 - z * 0.041);
    y += rim * (24 + Math.max(0, peaks));
  }

  return y;
}

const PADS = collectTerrainPads(baseTerrainY);

/**
 * Required physics API: returns solid ground / shallow oasis bed height at (x, z).
 * Local pads under buildings ensure exact flat grounding with zero floating or burial.
 */
export function getGroundY(x, z) {
  let y = baseTerrainY(x, z);
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + p.blend) {
      const w = 1 - smoothstep(p.r, p.r + p.blend, d);
      y = lerp(y, p.y, w);
    }
  }
  return y;
}

export function getWaterY(x, z) {
  const od = Math.hypot(x - OASIS_POS.x, z - OASIS_POS.z);
  return od <= OASIS_RADIUS + 0.8 ? OASIS_WATER_Y : -999;
}

export function isOverOasisWater(x, z) {
  return Math.hypot(x - OASIS_POS.x, z - OASIS_POS.z) < OASIS_RADIUS - 0.4;
}

export function isOnOasisDock(x, z) {
  const dx = x - OASIS_DOCK.x;
  const dz = z - OASIS_DOCK.z;
  const c = Math.cos(-OASIS_DOCK.rot);
  const s = Math.sin(-OASIS_DOCK.rot);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= OASIS_DOCK.length * 0.5 + 0.15 && Math.abs(lz) <= OASIS_DOCK.width * 0.5 + 0.15;
}

export function getSurfaceY(x, z) {
  const g = getGroundY(x, z);
  const w = getWaterY(x, z);
  const d = isOnOasisDock(x, z) ? OASIS_WATER_Y + 0.44 : -999;
  return Math.max(g, w, d);
}

/** Spatial collider registry so structures never overlap and player/carpet collide cleanly. */
export class ColliderWorld {
  constructor() {
    this.boxes = [];     // { cx, cz, minX, maxX, minZ, maxZ, minY, maxY, name, roofGuard }
    this.cylinders = []; // { x, z, r, minY, maxY, name, roofGuard }
  }

  addBox(x, z, w, d, minY, maxY, rot = 0, name = 'box', roofGuard = false) {
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    const hw = (w * c + d * s) * 0.5;
    const hd = (w * s + d * c) * 0.5;
    this.boxes.push({
      cx: x,
      cz: z,
      minX: x - hw,
      maxX: x + hw,
      minZ: z - hd,
      maxZ: z + hd,
      minY,
      maxY,
      name,
      roofGuard,
    });
  }

  addCylinder(x, z, r, minY, maxY, name = 'cyl', roofGuard = false) {
    this.cylinders.push({ x, z, r, minY, maxY, name, roofGuard });
  }

  hasOverlapXZ(x, z, r, pad = 0.35, minY = -999, maxY = 999) {
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (maxY <= b.minY + 0.05 || minY >= b.maxY - 0.05) continue;
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      if (Math.hypot(x - cx, z - cz) < r + pad) return true;
    }
    for (let i = 0; i < this.cylinders.length; i++) {
      const c = this.cylinders[i];
      if (maxY <= c.minY + 0.05 || minY >= c.maxY - 0.05) continue;
      if (Math.hypot(x - c.x, z - c.z) < r + c.r + pad) return true;
    }
    return false;
  }

  /** Keep walking actor out of deep oasis pool unless standing on the wooden oasis dock. */
  resolveOasisShore(pos, radius = 0.42) {
    if (isOnOasisDock(pos.x, pos.z)) return;
    const dx = pos.x - OASIS_POS.x;
    const dz = pos.z - OASIS_POS.z;
    const dist = Math.hypot(dx, dz);
    const minDist = OASIS_RADIUS + radius * 0.45;
    if (dist < minDist) {
      const nx = dist > 1e-4 ? dx / dist : 1;
      const nz = dist > 1e-4 ? dz / dist : 0;
      pos.x = OASIS_POS.x + nx * minDist;
      pos.z = OASIS_POS.z + nz * minDist;
    }
  }

  /** Smooth lateral deflection when flying or floating just above roof/dome/palm obstacles. */
  deflectAboveObstacles(pos, radius, clearance = 2.2, slideStep = 0.38) {
    for (let i = 0; i < this.cylinders.length; i++) {
      const c = this.cylinders[i];
      if (!c.roofGuard) continue;
      if (pos.y < c.minY || pos.y > c.maxY + clearance) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const dist = Math.hypot(dx, dz);
      const safeR = c.r + radius + 0.32;
      if (dist < safeR) {
        const nx = dist > 1e-4 ? dx / dist : 0.7;
        const nz = dist > 1e-4 ? dz / dist : -0.7;
        const push = Math.min(slideStep, safeR - dist);
        pos.x += nx * push;
        pos.z += nz * push;
        if (pos.y < c.maxY + 0.85) {
          pos.y = Math.max(pos.y, c.maxY + 0.85);
        }
      }
    }
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!b.roofGuard) continue;
      if (pos.y < b.minY || pos.y > b.maxY + clearance) continue;
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist = Math.hypot(dx, dz);
      const safeR = radius + 0.3;
      if (dist < safeR) {
        if (dist > 1e-4) {
          const push = Math.min(slideStep, safeR - dist);
          pos.x += (dx / dist) * push;
          pos.z += (dz / dist) * push;
        } else {
          const sx = pos.x - b.cx;
          const sz = pos.z - b.cz;
          const len = Math.max(1e-4, Math.hypot(sx, sz));
          pos.x += (sx / len) * slideStep;
          pos.z += (sz / len) * slideStep;
        }
        if (pos.y < b.maxY + 0.65) {
          pos.y = Math.max(pos.y, b.maxY + 0.65);
        }
      }
    }
  }

  /** Push circle (pos.x, pos.z, radius) cleanly out of any solid rigid body at actorY. */
  resolveCircle(pos, radius, actorY, height = 1.45) {
    const topY = actorY + height;
    let pushed = false;
    let nx = 0;
    let nz = 0;
    for (let pass = 0; pass < 8; pass++) {
      let anyHit = false;
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i];
        if (topY <= b.minY + 0.02 || actorY >= b.maxY - 0.02) continue;
        const cx = clamp(pos.x, b.minX, b.maxX);
        const cz = clamp(pos.z, b.minZ, b.maxZ);
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const dist = Math.hypot(dx, dz);
        if (dist < radius) {
          pushed = true;
          anyHit = true;
          if (dist > 1e-4) {
            const push = radius - dist + 0.01;
            const px = dx / dist;
            const pz = dz / dist;
            pos.x += px * push;
            pos.z += pz * push;
            nx = px;
            nz = pz;
          } else {
            const dL = Math.abs(pos.x - b.minX);
            const dR = Math.abs(b.maxX - pos.x);
            const dB = Math.abs(pos.z - b.minZ);
            const dF = Math.abs(b.maxZ - pos.z);
            const m = Math.min(dL, dR, dB, dF);
            if (m === dL) { pos.x = b.minX - radius - 0.01; nx = -1; nz = 0; }
            else if (m === dR) { pos.x = b.maxX + radius + 0.01; nx = 1; nz = 0; }
            else if (m === dB) { pos.z = b.minZ - radius - 0.01; nx = 0; nz = -1; }
            else { pos.z = b.maxZ + radius + 0.01; nx = 0; nz = 1; }
          }
        }
      }
      for (let i = 0; i < this.cylinders.length; i++) {
        const c = this.cylinders[i];
        if (topY <= c.minY + 0.02 || actorY >= c.maxY - 0.02) continue;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const dist = Math.hypot(dx, dz);
        const minD = radius + c.r;
        if (dist < minD) {
          pushed = true;
          anyHit = true;
          if (dist > 1e-4) {
            const push = minD - dist + 0.01;
            const px = dx / dist;
            const pz = dz / dist;
            pos.x += px * push;
            pos.z += pz * push;
            nx = px;
            nz = pz;
          } else {
            pos.x += minD + 0.01;
            nx = 1;
            nz = 0;
          }
        }
      }
      if (!anyHit) break;
    }
    return { pushed, nx, nz };
  }
}

export class DesertTerrain {
  constructor({ segs = 128, low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'desertTerrain';

    const width = 440;
    const depth = 620;
    const centerZ = 210;
    const geo = new THREE.PlaneGeometry(width, depth, segs, Math.round(segs * 1.35));
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, centerZ);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const cSand = new THREE.Color(PALETTE.sandWarm);
    const cSandCrest = new THREE.Color('#e2b67f');
    const cSandDeep = new THREE.Color('#8d6142');
    const cPath = new THREE.Color('#b68960');
    const cOasis = new THREE.Color('#5a7746');
    const cMesa = new THREE.Color('#9e7757');
    const cRim = new THREE.Color('#6f5046');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getGroundY(x, z);
      pos.setY(i, y);

      // Tactile dune shading matching 70:25:5 palette (warm dusk crest vs cool trough)
      tmp.copy(cSand);
      const duneRange = smoothstep(95, 130, z) * (1 - smoothstep(335, 380, z));
      if (duneRange > 0.01) {
        const slopeZ = (getGroundY(x, z + 1.5) - getGroundY(x, z - 1.5)) / 3.0;
        const crest = smoothstep(7, 17.5, y);
        const sunlit = clamp(0.5 - slopeZ * 1.35 + crest * 0.5, 0, 1);
        tmp.lerp(cSandDeep, (1 - sunlit) * 0.62 * duneRange);
        tmp.lerp(cSandCrest, sunlit * 0.48 * duneRange);
      } else {
        const crest = smoothstep(5, 19, y) * (1 - smoothstep(320, 390, z));
        tmp.lerp(cSandDeep, 0.22 - crest * 0.18);
      }

      // Village earthen lane
      if (z > -14 && z < 92) {
        const laneW = 1 - smoothstep(2.6, 9.2, Math.abs(x));
        tmp.lerp(cPath, laneW * 0.65);
      }

      // Oasis shoreline green tint
      const od = Math.hypot(x - OASIS_POS.x, z - OASIS_POS.z);
      if (od < 30) {
        const ring = smoothstep(14.5, 17.5, od) * (1 - smoothstep(22, 30, od));
        tmp.lerp(cOasis, ring * 0.78);
      }

      // Observatory mesa stone
      const md = Math.hypot(x - OBSERVATORY_POS.x, z - OBSERVATORY_POS.z);
      if (md < 46) {
        tmp.lerp(cMesa, (1 - smoothstep(18, 46, md)) * 0.62);
      }

      // Distant foothill rock tone
      const rim = Math.max(smoothstep(130, 215, Math.abs(x)), smoothstep(420, 500, z), smoothstep(-35, -95, z));
      if (rim > 0) tmp.lerp(cRim, rim * 0.78);

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const bump = low ? null : makeSandBumpTexture();
    if (bump) bump.repeat.set(56, 72);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.90,
      metalness: 0.02,
      bumpMap: bump,
      bumpScale: bump ? 0.24 : 0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sandTerrain';
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Elevated Oasis spring water shader: soft wet-sand feathering, deep emerald-turquoise center, subtle dusk/starlight shimmer
    const waterGeo = new THREE.CircleGeometry(OASIS_RADIUS + 0.35, 56);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uNightMix: shared.uNightMix,
        uSunDir: shared.uSunDir,
      },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vLocal;
        varying vec3 vWorldPos;
        void main() {
          vLocal = vec2(position.x, position.z);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uNightMix;
        uniform vec3 uSunDir;
        varying vec2 vLocal;
        varying vec3 vWorldPos;
        void main() {
          float r = length(vLocal) / ${((OASIS_RADIUS + 0.35).toFixed(2))};
          float edgeFade = 1.0 - smoothstep(0.84, 1.0, r);
          float depthMix = smoothstep(0.95, 0.25, r);

          // Gentle layered wind + concentric spring ripples
          float w1 = sin(vLocal.x * 1.5 + vLocal.y * 0.9 + uTime * 1.45) * 0.025;
          float w2 = cos(vLocal.x * 1.1 - vLocal.y * 1.7 - uTime * 1.15) * 0.022;
          float w3 = sin(length(vLocal) * 2.2 - uTime * 1.8) * 0.015;
          vec3 n = normalize(vec3(w1 + w3, 1.0, w2 + w3));

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);

          vec3 shallowDusk = vec3(0.20, 0.56, 0.52);
          vec3 deepDusk    = vec3(0.06, 0.34, 0.36);
          vec3 shallowNight = vec3(0.08, 0.28, 0.34);
          vec3 deepNight    = vec3(0.03, 0.14, 0.22);

          vec3 baseCol = mix(
            mix(shallowDusk, deepDusk, depthMix),
            mix(shallowNight, deepNight, depthMix),
            uNightMix
          );

          // Subtle sky reflection + gentle dusk sunset / starlight glints (no harsh white disc glare)
          vec3 reflDir = reflect(-viewDir, n);
          vec3 skyRefl = mix(vec3(0.42, 0.34, 0.44), vec3(0.07, 0.12, 0.24), uNightMix);
          float sunSpec = pow(max(dot(reflDir, normalize(uSunDir)), 0.0), 28.0) * (1.0 - uNightMix * 0.78);
          vec3 glintCol = mix(vec3(0.95, 0.72, 0.42), vec3(0.45, 0.88, 0.84), uNightMix);

          vec3 col = mix(baseCol, skyRefl, fresnel * 0.48) + glintCol * sunSpec * 0.42;
          // Soft turquoise spring heart luminescence
          col += vec3(0.06, 0.22, 0.22) * depthMix * (0.4 + 0.5 * uNightMix);

          float alpha = clamp((0.68 + depthMix * 0.24) * edgeFade, 0.0, 0.94);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.name = 'oasisWater';
    water.position.set(OASIS_POS.x, OASIS_WATER_Y, OASIS_POS.z);
    water.userData.nonsolid = true;
    this.group.add(water);
  }
}
