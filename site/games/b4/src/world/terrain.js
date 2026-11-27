import * as THREE from '../../lib/three.module.js';
import { WATER_Y } from '../core/env.js';
import { clamp, fbm2, lerp, smoothstep } from '../core/math.js';

export function channelCenterX(z) {
  return Math.sin(z * 0.011) * 7.5;
}

export function channelHalfWidth(z) {
  // Home cove wide -> canyon narrows -> cove widening -> glacial basin
  const canyon = smoothstep(130, 175, z) * (1 - smoothstep(315, 355, z));
  const basin = smoothstep(420, 485, z);
  let hw = lerp(44, 27.5, canyon);
  hw = lerp(hw, 68, basin);
  return hw;
}

function flatPad(x, z, cx, cz, rx, rz, targetY, currentY, blend = 8.0) {
  const dx = Math.max(0, Math.abs(x - cx) - rx);
  const dz = Math.max(0, Math.abs(z - cz) - rz);
  const d = Math.hypot(dx, dz);
  const w = 1 - smoothstep(0, blend, d);
  return lerp(currentY, targetY, w);
}

export function getGroundY(x, z) {
  const cx = channelCenterX(z);
  const hw = channelHalfWidth(z);

  // Side coves carved into the fjord walls
  const westCove = Math.exp(-Math.pow((x + 36) / 22, 2) - Math.pow((z - 108) / 28, 2));
  const eastCove = Math.exp(-Math.pow((x - 35) / 22, 2) - Math.pow((z - 385) / 30, 2));

  const dx = Math.abs(x - cx);
  const effectiveDx = dx - westCove * 16 - eastCove * 18;

  // Base lakebed depth
  const inLake = 1 - smoothstep(hw - 8, hw + 5, effectiveDx);
  let h = lerp(1.5, -4.5, inLake);

  // Home shore rises smoothly south of z = 4
  if (z < 22) {
    const homeMask = smoothstep(5, -6, z) * (1 - smoothstep(22, 46, Math.abs(x)));
    const homeBase = 1.35 + Math.max(0, -18 - z) * 0.16;
    h = lerp(h, homeBase, homeMask);
  }

  // Canyon & fjord valley walls outside channel
  const wallDist = Math.max(0, effectiveDx - hw);
  const canyonBoost = 0.55 + 1.15 * smoothstep(125, 175, z) * (1 - smoothstep(315, 365, z));
  const n1 = fbm2(x * 0.025 + 4.1, z * 0.022 - 1.7, 4);
  const n2 = fbm2(x * 0.07 - 2.3, z * 0.07 + 5.2, 3);

  if (wallDist > 0) {
    const cliff = Math.pow(smoothstep(0, 42, wallDist), 1.15) * 44 * canyonBoost;
    const ridge = n1 * 18 * smoothstep(6, 36, wallDist);
    h += cliff + ridge + (n2 - 0.5) * 2.5 * smoothstep(2, 18, wallDist);
  } else {
    // Gentle undulation on low shores
    h += (n1 - 0.5) * 1.1 * smoothstep(-1.5, 1.5, h);
  }

  // Far backdrop hills behind home (z < -26)
  if (z < -22) {
    h += smoothstep(-22, -90, z) * (28 + n1 * 22);
  }

  // Glacier mountain backdrop beyond the Lodge (z > 556) connecting naturally to Lodge peninsula
  if (z > 556) {
    const mMask = smoothstep(556, 625, z);
    const peakShape = 0.42 + 0.58 * Math.abs(Math.sin(x * 0.021 + 0.55));
    const ridgeNoise = fbm2(x * 0.017 + 11.3, z * 0.017, 4);
    h = Math.max(h, lerp(h, 2.2 + mMask * (82 * peakShape + ridgeNoise * 56), mMask));
  }

  // Flat, cleanly grounded pads for settlements, yards, and the Lodge peninsula
  h = flatPad(x, z, 0, -9.5, 20.0, 10.5, 1.35, h, 7.5);
  h = flatPad(x, z, -50, 108, 10, 14, 1.45, h, 8.0);
  h = flatPad(x, z, 51, 384, 10, 15, 1.35, h, 7.5);
  h = flatPad(x, z, 0, 558, 22, 22, 2.2, h, 14.0);

  return h;
}

export function getGroundGrad(x, z, eps = 1.2) {
  const gx = (getGroundY(x + eps, z) - getGroundY(x - eps, z)) / (2 * eps);
  const gz = (getGroundY(x, z + eps) - getGroundY(x, z - eps)) / (2 * eps);
  return { gx, gz };
}

// Pier deck rectangles for walking & grounding checks
export const WALK_DECKS = [
  { name: 'pierDock', minX: -2.1, maxX: 2.1, minZ: 1.5, maxZ: 21.2, y: 0.65 },
  { name: 'pierSide', minX: -40.5, maxX: -29.0, minZ: 105.5, maxZ: 110.5, y: 0.65 },
  { name: 'pierCove', minX: 31.5, maxX: 43.0, minZ: 380.0, maxZ: 384.5, y: 0.65 },
  { name: 'pierLodge', minX: -2.5, maxX: 2.5, minZ: 511.8, maxZ: 537.2, y: 0.72 },
];

export function getWalkSurfaceY(x, z) {
  let y = getGroundY(x, z);
  for (const d of WALK_DECKS) {
    if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) {
      y = Math.max(y, d.y);
    }
  }
  // Wooden ramp stairs from pierLodge (z=537.0, y=0.72) up to lodge veranda (z=540.0, y=2.2)
  if (Math.abs(x) <= 2.4 && z >= 536.8 && z <= 540.4) {
    const t = smoothstep(537.0, 540.0, z);
    y = Math.max(y, lerp(0.72, 2.2, t));
  }
  return y;
}

export function isWater(x, z) {
  return getGroundY(x, z) < WATER_Y - 0.12;
}

export function isWalkable(x, z) {
  return getWalkSurfaceY(x, z) >= WATER_Y - 0.04;
}

// Simple rigid collider registry so walking/flying never penetrates solid objects
export class CollisionWorld {
  constructor() {
    this.boxes = []; // { name, minX, maxX, minY, maxY, minZ, maxZ }
  }

  addBox(name, minX, maxX, minY, maxY, minZ, maxZ) {
    this.boxes.push({ name, minX, maxX, minY, maxY, minZ, maxZ });
  }

  addObjectBox(obj, pad = 0) {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    if (b.isEmpty()) return b;
    this.addBox(
      obj.name || 'solid',
      b.min.x - pad,
      b.max.x + pad,
      b.min.y,
      b.max.y,
      b.min.z - pad,
      b.max.z + pad
    );
    return b;
  }

  overlapsXZ(minX, maxX, minZ, maxZ) {
    for (const b of this.boxes) {
      if (maxX > b.minX && minX < b.maxX && maxZ > b.minZ && minZ < b.maxZ) return true;
    }
    return false;
  }

  // Push a moving sphere/cylinder out of solid AABBs cleanly (3 passes prevent corner fuzz)
  resolveCircle(pos, radius, height = 1.3) {
    let hit = false;
    let pushX = 0;
    let pushZ = 0;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of this.boxes) {
        if (pos.y + height <= b.minY || pos.y >= b.maxY) continue;
        const cx = clamp(pos.x, b.minX, b.maxX);
        const cz = clamp(pos.z, b.minZ, b.maxZ);
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          hit = true;
          moved = true;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const push = radius - d + 0.02;
            const nx = dx / d;
            const nz = dz / d;
            pos.x += nx * push;
            pos.z += nz * push;
            pushX += nx;
            pushZ += nz;
          } else {
            const px1 = pos.x - b.minX;
            const px2 = b.maxX - pos.x;
            const pz1 = pos.z - b.minZ;
            const pz2 = b.maxZ - pos.z;
            const m = Math.min(px1, px2, pz1, pz2);
            if (m === px1) {
              pos.x = b.minX - radius - 0.02;
              pushX -= 1;
            } else if (m === px2) {
              pos.x = b.maxX + radius + 0.02;
              pushX += 1;
            } else if (m === pz1) {
              pos.z = b.minZ - radius - 0.02;
              pushZ -= 1;
            } else {
              pos.z = b.maxZ + radius + 0.02;
              pushZ += 1;
            }
          }
        }
      }
      if (!moved) break;
    }
    const len = Math.hypot(pushX, pushZ);
    return { hit, nx: len > 1e-4 ? pushX / len : 0, nz: len > 1e-4 ? pushZ / len : 0 };
  }

  // Oriented 2-tier AABB separation for the twin-float high-wing seaplane (0 solid-clip at any yaw)
  resolveVehicle(pos, yaw) {
    const absC = Math.abs(Math.cos(yaw));
    const absS = Math.abs(Math.sin(yaw));
    const tiers = [
      // Tier 1: pontoons & lower fuselage (allows wing to overhang low piers)
      { minY: -0.18, maxY: 1.45, extX: 1.22 * absC + 2.45 * absS + 0.14, extZ: 1.22 * absS + 2.45 * absC + 0.14 },
      // Tier 2: high wing & tailplane (clears trees, lanterns, towers, buildings)
      { minY: 1.45, maxY: 2.38, extX: 3.74 * absC + 3.08 * absS + 0.14, extZ: 3.74 * absS + 3.08 * absC + 0.14 },
    ];
    let hit = false;
    let pushX = 0;
    let pushZ = 0;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const b of this.boxes) {
        for (const t of tiers) {
          if (pos.y + t.maxY <= b.minY || pos.y + t.minY >= b.maxY) continue;
          const ox = Math.min(pos.x + t.extX, b.maxX) - Math.max(pos.x - t.extX, b.minX);
          const oz = Math.min(pos.z + t.extZ, b.maxZ) - Math.max(pos.z - t.extZ, b.minZ);
          if (ox > 0 && oz > 0) {
            hit = true;
            moved = true;
            const bCx = (b.minX + b.maxX) * 0.5;
            const bCz = (b.minZ + b.maxZ) * 0.5;
            if (ox < oz) {
              const s = pos.x >= bCx ? 1 : -1;
              pos.x += s * (ox + 0.04);
              pushX += s;
            } else {
              const s = pos.z >= bCz ? 1 : -1;
              pos.z += s * (oz + 0.04);
              pushZ += s;
            }
          }
        }
      }
      if (!moved) break;
    }
    const len = Math.hypot(pushX, pushZ);
    return { hit, nx: len > 1e-4 ? pushX / len : 0, nz: len > 1e-4 ? pushZ / len : 0 };
  }
}

export class FjordTerrain {
  constructor({ low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'terrainGroup';

    const width = 340;
    const depth = 860;
    const segX = low ? 64 : 112;
    const segZ = low ? 124 : 220;
    const minZ = -100;

    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    // Shift so Z spans [-100, 760]
    geo.translate(0, 0, minZ + depth * 0.5);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cBed = new THREE.Color('#2a3948');
    const cShore = new THREE.Color('#74695a');
    const cPath = new THREE.Color('#867761');
    const cMeadow = new THREE.Color('#4a5f39');
    const cAutumn = new THREE.Color('#7c6038');
    const cRock = new THREE.Color('#646b75');
    const cRockWarm = new THREE.Color('#736960');
    const cSnow = new THREE.Color('#eef4f9');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getGroundY(x, z);
      pos.setY(i, y);

      const n = fbm2(x * 0.045 + 1.3, z * 0.045 - 2.1, 3);
      const strata = 0.5 + 0.5 * Math.sin(y * 0.55 + n * 3.5);
      if (y < -0.25) {
        tmp.copy(cBed).lerp(cShore, smoothstep(-3.0, -0.25, y));
      } else if (y < 0.85) {
        tmp.copy(cShore).lerp(cMeadow, smoothstep(0.15, 0.85, y));
      } else if (y < 8.5) {
        tmp.copy(cMeadow).lerp(cAutumn, clamp((n - 0.30) * 1.45, 0, 0.75));
        if (y > 4.2) tmp.lerp(cRockWarm, smoothstep(4.2, 8.5, y) * 0.58);
        // Subtle worn gravel path from home cabin yard to main pier
        if (z > -8.5 && z < 2.5 && x > -9 && x < 2) {
          const pathLine = Math.abs(x - lerp(-6.2, 0.0, clamp((z + 7.5) / 9.2, 0, 1)));
          const pathW = 1 - smoothstep(0.7, 2.0, pathLine);
          tmp.lerp(cPath, pathW * 0.72);
        }
      } else if (z < 562) {
        tmp.copy(cRock).lerp(cRockWarm, strata * 0.48);
        tmp.lerp(cAutumn, clamp((n - 0.44) * 1.0, 0, 0.28));
      } else {
        tmp.copy(cRock).lerp(cRockWarm, strata * 0.35);
        const snowW = smoothstep(26, 46, y);
        tmp.lerp(cSnow, snowW);
      }

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
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'terrainGround';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }
}
