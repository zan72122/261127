import * as THREE from '../../lib/three.module.js';
import {
  BARN_POS,
  CHAPEL_POS,
  DETOUR_CABIN_POS,
  FEEDER_POS,
  FISHING_HUT_POS,
  HOME_POS,
  ICE_Y,
  OFFICE_POS,
  OVEN_POS,
  PALETTE,
  PIER_POS,
  BRIDGE_POS,
} from '../core/env.js';
import { clamp, rng } from '../core/math.js';
import { makeLogTexture, makePoolTexture, makeRoofTexture, makeStoneTexture } from '../core/textures.js';
import { getGroundY, isOverLake } from './terrain.js';

// Collision registry used both to guarantee zero placement overlap and for runtime girl/sleigh physics
export class Colliders {
  constructor() {
    this.items = []; // { name, type: 'box'|'circle', x, z, hw, hd, r, minY, maxY, passable }
  }

  canPlace(x, z, r, pad = 0.8) {
    for (const c of this.items) {
      if (c.type === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < r + c.r + pad) return false;
      } else {
        const cx = clamp(x, c.x - c.hw, c.x + c.hw);
        const cz = clamp(z, c.z - c.hd, c.z + c.hd);
        if (Math.hypot(x - cx, z - cz) < r + pad) return false;
      }
    }
    return true;
  }

  addCircle(name, x, z, r, minY, maxY, passable = false) {
    this.items.push({ name, type: 'circle', x, z, r, minY, maxY, passable });
  }

  addBox(name, x, z, hw, hd, minY, maxY, passable = false) {
    this.items.push({ name, type: 'box', x, z, hw, hd, minY, maxY, passable });
  }

  // Push (x, z) smoothly outside all solid colliders within height range; returns true if pushed
  resolveXZ(pos, radius) {
    let hit = false;
    for (let iter = 0; iter < 4; iter++) {
      for (const c of this.items) {
        if (c.passable) continue;
        if (pos.y > c.maxY + 0.35 || pos.y + 1.45 < c.minY) continue;
        if (c.type === 'circle') {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const d = Math.hypot(dx, dz);
          const minD = c.r + radius;
          if (d < minD) {
            const nx = d > 1e-4 ? dx / d : 1;
            const nz = d > 1e-4 ? dz / d : 0;
            pos.x = c.x + nx * minD;
            pos.z = c.z + nz * minD;
            hit = true;
          }
        } else {
          const cx = clamp(pos.x, c.x - c.hw, c.x + c.hw);
          const cz = clamp(pos.z, c.z - c.hd, c.z + c.hd);
          const dx = pos.x - cx;
          const dz = pos.z - cz;
          const d = Math.hypot(dx, dz);
          if (d < radius) {
            if (d > 1e-4) {
              pos.x = cx + (dx / d) * radius;
              pos.z = cz + (dz / d) * radius;
            } else {
              const ox = c.hw + radius - Math.abs(pos.x - c.x);
              const oz = c.hd + radius - Math.abs(pos.z - c.z);
              if (ox < oz) pos.x = c.x + (pos.x >= c.x ? 1 : -1) * (c.hw + radius);
              else pos.z = c.z + (pos.z >= c.z ? 1 : -1) * (c.hd + radius);
            }
            hit = true;
          }
        }
      }
    }
    return hit;
  }
}

export class WorldProps {
  constructor({ low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'worldProps';
    this.colliders = new Colliders();
    this.low = low;
    this.lanterns = [];

    // Shared materials (70:25:5 Lapland palette with natural timber & roof textures)
    const logTex = makeLogTexture();
    const stoneTex = makeStoneTexture();
    const roofTex = makeRoofTexture();
    this.mWood = new THREE.MeshStandardMaterial({ color: PALETTE.woodWarm, map: logTex, roughness: 0.85 });
    this.mWoodLight = new THREE.MeshStandardMaterial({ color: PALETTE.woodLight, map: logTex, roughness: 0.82 });
    this.mWoodDark = new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, map: logTex, roughness: 0.9 });
    this.mWoodSilver = new THREE.MeshStandardMaterial({ color: 0x76726e, map: logTex, roughness: 0.88 });
    this.mWoodOchre = new THREE.MeshStandardMaterial({ color: 0x9b6e42, map: logTex, roughness: 0.84 });
    this.mRoofSlate = new THREE.MeshStandardMaterial({ color: 0x334056, map: roofTex, roughness: 0.8 });
    this.mRoofTurf = new THREE.MeshStandardMaterial({ color: 0x263d34, roughness: 0.88 });
    this.mSnow = new THREE.MeshStandardMaterial({ color: PALETTE.snowLight, roughness: 0.78 });
    this.mSpruce = new THREE.MeshStandardMaterial({ color: PALETTE.spruceMid, roughness: 0.85 });
    this.mSpruceDark = new THREE.MeshStandardMaterial({ color: PALETTE.spruceDark, roughness: 0.88 });
    this.mBirch = new THREE.MeshStandardMaterial({ color: PALETTE.birchBark, roughness: 0.82 });
    this.mStone = new THREE.MeshStandardMaterial({ color: 0x768094, map: stoneTex, roughness: 0.9 });
    this.mPoolAmber = new THREE.MeshBasicMaterial({
      map: makePoolTexture('255, 198, 108'),
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mPoolEmerald = new THREE.MeshBasicMaterial({
      map: makePoolTexture('92, 242, 186'),
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.poolGeo = new THREE.PlaneGeometry(1, 1);
    this.poolGeo.rotateX(-Math.PI / 2);
    this.mIron = new THREE.MeshStandardMaterial({ color: 0x262c38, roughness: 0.65, metalness: 0.45 });
    this.mIce = new THREE.MeshStandardMaterial({ color: 0x99c6de, roughness: 0.2, metalness: 0.15 });
    this.mWinAmber = new THREE.MeshStandardMaterial({
      color: PALETTE.amberGlow,
      emissive: PALETTE.amber,
      emissiveIntensity: 1.45,
      roughness: 0.35,
    });
    this.mWinEmerald = new THREE.MeshStandardMaterial({
      color: PALETTE.emeraldGlow,
      emissive: PALETTE.emerald,
      emissiveIntensity: 1.5,
      roughness: 0.3,
    });
    this.mHay = new THREE.MeshStandardMaterial({ color: 0xc29e59, roughness: 0.92 });
    this.mDryStem = new THREE.MeshStandardMaterial({ color: 0x5c4738, roughness: 0.95 });
    this.mDoorEmerald = new THREE.MeshStandardMaterial({ color: 0x2b7a62, roughness: 0.65 });
    this.mSkiRed = new THREE.MeshStandardMaterial({ color: 0x6b3a2c, roughness: 0.72 });

    // Shared tree & rock geometries
    this.coneGeo1 = new THREE.ConeGeometry(1.55, 2.5, 7);
    this.coneGeo2 = new THREE.ConeGeometry(1.2, 2.2, 7);
    this.coneGeo3 = new THREE.ConeGeometry(0.8, 1.8, 7);
    this.snowConeGeo2 = new THREE.ConeGeometry(1.12, 0.75, 7);
    this.snowConeGeo3 = new THREE.ConeGeometry(0.75, 0.7, 7);
    this.birchBranchGeo = new THREE.CylinderGeometry(0.03, 0.06, 1.35, 5);
    this.rockGeo = new THREE.DodecahedronGeometry(1, 0);

    this._buildHomeArea();
    this._buildVillageArea();
    this._buildLakeAndDetours();
    this._buildApproachHamlet();
    this._buildPostOfficeHill();
    this._buildTrailAndForest();
    this._buildFootprints();
  }

  _addLightPool(x, z, diameter = 4.6, emerald = false) {
    const m = new THREE.Mesh(this.poolGeo, emerald ? this.mPoolEmerald : this.mPoolAmber);
    m.name = 'lightPoolFX';
    m.position.set(x, this._ground(x, z) + 0.03, z);
    m.scale.set(diameter, 1, diameter);
    m.userData.nonsolid = true;
    m.userData.fx = true;
    this.group.add(m);
  }

  _ground(x, z) {
    return getGroundY(x, z);
  }

  // Samples ground elevation across an object's XZ footprint so foundations/trunks hug slopes cleanly
  _sampleFootprint(x, z, rx, rz = rx) {
    const centerY = getGroundY(x, z);
    let minY = centerY;
    let maxY = centerY;
    const offsets = [
      [-rx, -rz], [rx, -rz], [-rx, rz], [rx, rz],
      [0, -rz], [0, rz], [-rx, 0], [rx, 0],
    ];
    for (const [ox, oz] of offsets) {
      const gy = getGroundY(x + ox, z + oz);
      if (gy < minY) minY = gy;
      if (gy > maxY) maxY = gy;
    }
    return { centerY, minY, maxY };
  }

  _buildCabin({
    name, x, z, rotY = 0, w = 5.4, d = 4.4, h = 2.8,
    emeraldDoor = false, hasPorch = true, hasFlowerBox = false,
    woodTone = 'warm', roofTone = 'slate', hasWing = false, hasSkis = false,
  }) {
    const g = new THREE.Group();
    g.name = name;
    const { centerY: y, minY } = this._sampleFootprint(x, z, w * 0.55 + 0.6, d * 0.55 + 0.8);
    const lakeExtra = y <= ICE_Y + 0.05 ? 0.22 : 0.10;
    const drop = Math.max(0, y - minY) + lakeExtra;
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const wallMat =
      woodTone === 'silver' ? this.mWoodSilver :
      woodTone === 'ochre' ? this.mWoodOchre :
      woodTone === 'dark' ? this.mWoodDark : this.mWood;
    const roofMat = roofTone === 'turf' ? this.mRoofTurf : this.mRoofSlate;

    // Stone foundation plinth extending down to minY so downhill edges never float
    const plinthH = 0.36 + drop;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.28, plinthH, d + 0.28), this.mStone);
    plinth.position.y = 0.36 - plinthH * 0.5;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    // Log walls
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    walls.position.y = 0.36 + h * 0.5;
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);

    // Log-end corner notches
    const notchGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.26, 6);
    notchGeo.rotateX(Math.PI / 2);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let row = 0; row < 4; row++) {
          const n = new THREE.Mesh(notchGeo, this.mWoodDark);
          n.position.set(sx * (w * 0.5 + 0.05), 0.72 + row * 0.6, sz * (d * 0.5 + 0.05));
          g.add(n);
        }
      }
    }

    // Steep pitched gable roof
    const roofOver = 0.45;
    const pitchAngle = 0.62;
    const slopeLen = (w * 0.5 + roofOver) / Math.cos(pitchAngle);
    const roofH = Math.tan(pitchAngle) * (w * 0.5);
    const baseRoofY = 0.36 + h;

    for (const side of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.18, d + roofOver * 2), roofMat);
      slab.position.set(side * (slopeLen * 0.5 * Math.cos(pitchAngle) - 0.04), baseRoofY + roofH * 0.5 + 0.04, 0);
      slab.rotation.z = -side * pitchAngle;
      slab.castShadow = true;
      g.add(slab);

      const snowCap = new THREE.Mesh(new THREE.BoxGeometry(slopeLen * 0.96, 0.16, d + roofOver * 1.9), this.mSnow);
      snowCap.position.set(side * (slopeLen * 0.5 * Math.cos(pitchAngle) - 0.02), baseRoofY + roofH * 0.5 + 0.18, 0);
      snowCap.rotation.z = -side * pitchAngle;
      g.add(snowCap);
    }

    // Gable end fill triangles
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-w * 0.5, 0);
    gableShape.lineTo(w * 0.5, 0);
    gableShape.lineTo(0, roofH);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: d, bevelEnabled: false });
    gableGeo.translate(0, 0, -d * 0.5);
    const gable = new THREE.Mesh(gableGeo, this.mWoodLight);
    gable.position.y = baseRoofY;
    g.add(gable);

    // Stone chimney
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.35, 0.62), this.mStone);
    chim.position.set(w * 0.24, baseRoofY + roofH * 0.6 + 0.45, -d * 0.18);
    chim.castShadow = true;
    g.add(chim);

    // Optional side lean-to woodshed wing (breaks silhouette repetition!)
    if (hasWing) {
      const wingPlinth = new THREE.Mesh(new THREE.BoxGeometry(1.75, plinthH, d * 0.65), this.mStone);
      wingPlinth.position.set(w * 0.5 + 0.82, 0.36 - plinthH * 0.5, -0.2);
      const wingWall = new THREE.Mesh(new THREE.BoxGeometry(1.65, h * 0.68, d * 0.62), this.mWoodDark);
      wingWall.position.set(w * 0.5 + 0.82, 0.36 + h * 0.34, -0.2);
      wingWall.castShadow = true;
      const wingRoof = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.14, d * 0.72), roofMat);
      wingRoof.position.set(w * 0.5 + 0.86, 0.36 + h * 0.68 + 0.1, -0.2);
      wingRoof.rotation.z = -0.32;
      const wingSnow = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, d * 0.68), this.mSnow);
      wingSnow.position.set(w * 0.5 + 0.88, 0.36 + h * 0.68 + 0.2, -0.2);
      wingSnow.rotation.z = -0.32;
      g.add(wingPlinth, wingWall, wingRoof, wingSnow);
    }

    // Front door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.0, 0.12), this.mWoodDark);
    door.position.set(-w * 0.18, 0.36 + 1.0, d * 0.5 + 0.04);
    g.add(door);
    if (emeraldDoor) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.68, 0.06), this.mDoorEmerald);
      panel.position.set(-w * 0.18, 0.36 + 1.0, d * 0.5 + 0.09);
      g.add(panel);
    }

    // Warm lit mullioned windows
    const addWin = (wx, wy, wz, ry = 0) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      wg.rotation.y = ry;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.98, 0.1), this.mWoodLight);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.76), this.mWinAmber);
      pane.position.z = 0.06;
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.78, 0.04), this.mWoodLight);
      barV.position.z = 0.07;
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.05, 0.04), this.mWoodLight);
      barH.position.z = 0.07;
      wg.add(frame, pane, barV, barH);
      if (hasFlowerBox && ry === 0) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.22, 0.28), this.mWoodDark);
        box.position.set(0, -0.58, 0.14);
        const snowInBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.22), this.mSnow);
        snowInBox.position.set(0, -0.45, 0.14);
        wg.add(box, snowInBox);
        for (let k = -2; k <= 2; k++) {
          const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.24, 5), this.mDryStem);
          twig.position.set(k * 0.18, -0.32, 0.14);
          twig.rotation.z = k * 0.08;
          wg.add(twig);
        }
      }
      g.add(wg);
    };

    addWin(w * 0.22, 0.36 + 1.45, d * 0.5 + 0.03, 0);
    addWin(w * 0.5 + 0.03, 0.36 + 1.45, 0, Math.PI / 2);
    addWin(-w * 0.5 - 0.03, 0.36 + 1.45, 0, -Math.PI / 2);

    if (hasPorch) {
      const stepH = 0.22 + drop;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, stepH, 0.9), this.mWoodDark);
      step.position.set(-w * 0.18, 0.22 - stepH * 0.5, d * 0.5 + 0.48);
      step.receiveShadow = true;
      g.add(step);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 1.05), roofMat);
      awning.position.set(-w * 0.18, 0.36 + 2.25, d * 0.5 + 0.52);
      awning.rotation.x = 0.24;
      g.add(awning);
      const awnSnow = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.1, 1.0), this.mSnow);
      awnSnow.position.set(-w * 0.18, 0.36 + 2.34, d * 0.5 + 0.52);
      awnSnow.rotation.x = 0.24;
      g.add(awnSnow);
    }

    // Cross-country wooden skis leaned by cabin porch (1970s Lapland household detail)
    if (hasSkis) {
      for (const sx of [0.1, 0.26]) {
        const ski = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.65, 0.03), this.mSkiRed);
        ski.position.set(w * 0.42 + sx * 0.4, 0.82, d * 0.5 + 0.22);
        ski.rotation.x = -0.14;
        g.add(ski);
      }
    }

    this.group.add(g);
    const extraW = hasWing ? 1.8 : 0;
    const rad = Math.hypot((w + extraW + 0.95) * 0.5, (d + (hasPorch ? 1.1 : 0.9)) * 0.5) + 0.25;
    if (Math.abs(rotY) < 0.05 && !hasWing) {
      this.colliders.addBox(name, x, z, w * 0.5 + 0.55, d * 0.5 + (hasPorch ? 0.85 : 0.55), minY - 0.1, y + h + roofH);
    } else {
      const lx = hasWing ? 0.85 : 0;
      const cx = x + lx * Math.cos(rotY);
      const cz = z - lx * Math.sin(rotY);
      this.colliders.addCircle(name, cx, cz, rad, minY - 0.1, y + h + roofH);
    }
    if (hasPorch) {
      const px = x - w * 0.18 * Math.cos(rotY) + (d * 0.5 + 1.2) * Math.sin(rotY);
      const pz = z + w * 0.18 * Math.sin(rotY) + (d * 0.5 + 1.2) * Math.cos(rotY);
      this._addLightPool(px, pz, 4.4, false);
    }
    return g;
  }

  _buildPostbox(x, z, rotY = 0) {
    const g = new THREE.Group();
    g.name = 'postbox';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 0.32);
    const drop = Math.max(0, y - minY) + (y <= ICE_Y + 0.05 ? 0.22 : 0.10);
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const postH = 1.28 + drop;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, postH, 0.16), this.mWoodDark);
    post.position.y = 1.28 - postH * 0.5;
    post.castShadow = true;
    g.add(post);

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.44, 0.38), this.mWoodLight);
    box.position.y = 1.32;
    box.castShadow = true;
    g.add(box);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.44), this.mRoofSlate);
    roof.position.y = 1.58;
    g.add(roof);

    const snow = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.42), this.mSnow);
    snow.position.y = 1.66;
    g.add(snow);

    // Wordless emblem: small emerald diamond mail seal (NO text or digits!)
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.04), this.mWinEmerald);
    seal.position.set(0, 1.32, 0.2);
    seal.rotation.z = Math.PI / 4;
    g.add(seal);

    this.group.add(g);
    this.colliders.addCircle('postbox', x, z, 0.58, minY, y + 1.7);
    return g;
  }

  _buildWell(x, z) {
    const g = new THREE.Group();
    g.name = 'wellWood';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 0.95);
    const drop = Math.max(0, y - minY) + 0.05;
    g.position.set(x, y, z);

    const ringH = 0.85 + drop;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.92, ringH, 10), this.mStone);
    ring.position.y = 0.85 - ringH * 0.5;
    ring.castShadow = true;
    ring.receiveShadow = true;
    g.add(ring);

    const iceTop = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 10), this.mIce);
    iceTop.position.y = 0.78;
    g.add(iceTop);

    for (const sx of [-0.72, 0.72]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.45, 0.14), this.mWoodDark);
      post.position.set(sx, 1.45, 0);
      post.castShadow = true;
      g.add(post);
    }

    for (const side of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 1.35), this.mWood);
      slab.position.set(side * 0.44, 2.28, 0);
      slab.rotation.z = -side * 0.56;
      slab.castShadow = true;
      g.add(slab);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 1.32), this.mSnow);
      sn.position.set(side * 0.45, 2.38, 0);
      sn.rotation.z = -side * 0.56;
      g.add(sn);
    }

    this.group.add(g);
    this.colliders.addCircle('wellWood', x, z, 1.15, minY, y + 2.5);
  }

  _buildFirewoodRack(x, z, rotY = 0) {
    const g = new THREE.Group();
    g.name = 'firewoodRack';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 1.05);
    const drop = Math.max(0, y - minY) + (y <= ICE_Y + 0.05 ? 0.22 : 0.10);
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const pH = 1.3 + drop;
    for (const sx of [-0.95, 0.95]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, pH, 0.58), this.mWoodDark);
      p.position.set(sx, 1.3 - pH * 0.5, 0);
      p.castShadow = true;
      g.add(p);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.1, 0.72), this.mRoofSlate);
    roof.position.y = 1.34;
    g.add(roof);
    const sn = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.68), this.mSnow);
    sn.position.y = 1.42;
    g.add(sn);

    const logGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.54, 6);
    logGeo.rotateX(Math.PI / 2);
    for (let row = 0; row < 4; row++) {
      for (let col = -3; col <= 3; col++) {
        const log = new THREE.Mesh(logGeo, (row + col) % 2 === 0 ? this.mWoodLight : this.mBirch);
        log.position.set(col * 0.22, 0.16 + row * 0.22, 0);
        g.add(log);
      }
    }

    this.group.add(g);
    this.colliders.addCircle('firewoodRack', x, z, 1.25, minY, y + 1.5);
  }

  _buildSmallSled(x, z, rotY = 0) {
    const g = new THREE.Group();
    g.name = 'smallSled';
    const { minY } = this._sampleFootprint(x, z, 0.7);
    g.position.set(x, minY - 0.02, z);
    g.rotation.y = rotY;

    for (const sx of [-0.32, 0.32]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 1.35), this.mIron);
      r.position.set(sx, 0.04, 0);
      g.add(r);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.72), this.mWoodDark);
      leg.position.set(sx, 0.18, -0.06);
      g.add(leg);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.85), this.mWoodLight);
    seat.position.set(0, 0.3, -0.06);
    seat.castShadow = true;
    g.add(seat);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.52, 0.06), this.mWood);
    handle.position.set(0, 0.58, -0.45);
    g.add(handle);

    this.group.add(g);
    this.colliders.addCircle('smallSled', x, z, 0.85, minY - 0.05, minY + 0.9);
  }

  _buildBench(x, z, rotY = 0) {
    const g = new THREE.Group();
    g.name = 'benchWood';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 0.85);
    const drop = Math.max(0, y - minY) + 0.10;
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const legH = 0.44 + drop;
    for (const sx of [-0.62, 0.62]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, legH, 0.42), this.mWoodDark);
      leg.position.set(sx, 0.44 - legH * 0.5, 0);
      leg.castShadow = true;
      g.add(leg);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.09, 0.46), this.mWoodLight);
    seat.position.y = 0.46;
    seat.castShadow = true;
    const snow = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 0.40), this.mSnow);
    snow.position.y = 0.54;
    g.add(seat, snow);

    this.group.add(g);
    this.colliders.addCircle('benchWood', x, z, 0.92, minY, y + 0.65);
  }

  _buildMilkStand(x, z, rotY = 0) {
    // Traditional 1970s Finnish rural milk-can platform (maitolaituri)
    const g = new THREE.Group();
    g.name = 'milkStand';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 0.9);
    const drop = Math.max(0, y - minY) + 0.04;
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const legH = 0.85 + drop;
    for (const sx of [-0.65, 0.65]) {
      for (const sz of [-0.45, 0.45]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, legH, 0.12), this.mWoodDark);
        post.position.set(sx, 0.85 - legH * 0.5, sz);
        post.castShadow = true;
        g.add(post);
      }
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.1, 1.15), this.mWoodLight);
    deck.position.y = 0.88;
    deck.castShadow = true;
    g.add(deck);
    for (const cx of [-0.28, 0.25]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.52, 10), this.mBirch);
      can.position.set(cx, 1.18, 0);
      can.castShadow = true;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), this.mIron);
      lid.position.set(cx, 1.46, 0);
      g.add(can, lid);
    }

    this.group.add(g);
    this.colliders.addCircle('milkStand', x, z, 1.05, minY, y + 1.5);
  }

  _buildFenceSegment(x, z, len = 6, rotY = 0) {
    const g = new THREE.Group();
    g.name = 'fenceWood';
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const posts = Math.max(2, Math.round(len / 1.5) + 1);
    const postGrounds = [];
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < posts; i++) {
      const lx = -len * 0.5 + (i / (posts - 1)) * len;
      const wx = x + lx * cos;
      const wz = z - lx * sin;
      const py = this._ground(wx, wz);
      postGrounds.push({ lx, py });
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    const baseY = minY;
    g.position.set(x, baseY, z);
    g.rotation.y = rotY;

    for (const { lx, py } of postGrounds) {
      const relY = py - baseY;
      const postH = 0.92 + relY + 0.12;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, postH, 0.13), this.mWoodDark);
      post.position.set(lx, relY + 0.92 - postH * 0.5, 0);
      g.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.16), this.mSnow);
      cap.position.set(lx, relY + 0.95, 0);
      g.add(cap);
    }
    for (let i = 0; i < posts - 1; i++) {
      const p0 = postGrounds[i];
      const p1 = postGrounds[i + 1];
      const spanX = p1.lx - p0.lx;
      const spanY = p1.py - p0.py;
      const spanLen = Math.hypot(spanX, spanY) + 0.04;
      const ang = Math.atan2(spanY, spanX);
      const midX = (p0.lx + p1.lx) * 0.5;
      const midY = (p0.py + p1.py) * 0.5 - baseY;
      for (const ry of [0.34, 0.68]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(spanLen, 0.08, 0.07), this.mWoodLight);
        rail.position.set(midX, midY + ry, 0);
        rail.rotation.z = ang;
        g.add(rail);
      }
    }

    this.group.add(g);
    if (Math.abs(rotY) < 0.05) {
      this.colliders.addBox('fenceWood', x, z, len * 0.5 + 0.2, 0.35, minY, maxY + 1.0);
    } else if (Math.abs(Math.abs(rotY) - Math.PI / 2) < 0.05) {
      this.colliders.addBox('fenceWood', x, z, 0.35, len * 0.5 + 0.2, minY, maxY + 1.0);
    } else {
      this.colliders.addCircle('fenceWood', x, z, len * 0.5 + 0.2, minY, maxY + 1.0);
    }
  }

  _buildLanternPost(x, z, emerald = false) {
    const g = new THREE.Group();
    g.name = 'lanternPost';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 0.65);
    const drop = Math.max(0, y - minY) + (y <= ICE_Y + 0.05 ? 0.22 : 0.10);
    g.position.set(x, y, z);

    const poleH = 2.55 + drop;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, poleH, 6), this.mWoodDark);
    pole.position.y = 2.55 - poleH * 0.5;
    pole.castShadow = true;
    g.add(pole);

    // Small stone plinth collar at base on slopes
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.18 + drop, 7), this.mStone);
    base.position.y = 0.18 - (0.18 + drop) * 0.5;
    g.add(base);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.08), this.mIron);
    arm.position.set(0.2, 2.48, 0);
    g.add(arm);

    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.11, 0.28, 6),
      emerald ? this.mWinEmerald : this.mWinAmber
    );
    lamp.position.set(0.38, 2.28, 0);
    g.add(lamp);

    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 6), this.mIron);
    hood.position.set(0.38, 2.47, 0);
    g.add(hood);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(emerald ? PALETTE.emeraldGlow : PALETTE.amberGlow) } },
        vertexShader: `varying vec3 vN, vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN, vV; void main(){ float f = pow(max(0.0001, dot(vN, vV)), 2.8); gl_FragColor = vec4(uColor * f * 0.55, f * 0.45); }`,
      })
    );
    halo.position.set(0.38, 2.28, 0);
    halo.userData.nonsolid = true;
    halo.userData.fx = true;
    g.add(halo);

    this.group.add(g);
    this.colliders.addCircle('lanternPost', x + 0.16, z, 0.58, minY - 0.1, y + 2.6);
    this.lanterns.push(halo);
    this._addLightPool(x + 0.36, z, emerald ? 5.2 : 4.8, emerald);
  }

  _buildCairn(x, z, rotY = 0) {
    // Traditional Lapland trail stone cairn with small amber marker lamp
    const g = new THREE.Group();
    g.name = 'cairnStone';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 0.72);
    const drop = Math.max(0, y - minY) + 0.12;
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const baseH = 0.72 + drop;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.62, baseH, 7), this.mStone);
    base.position.y = 0.72 - baseH * 0.5;
    base.castShadow = true;
    base.receiveShadow = true;
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.42, 0.52, 7), this.mStone);
    mid.position.y = 0.96;
    mid.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.25, 7), this.mSnow);
    cap.position.y = 1.32;
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 6), this.mWinAmber);
    lantern.position.y = 1.52;
    g.add(base, mid, cap, lantern);

    this.group.add(g);
    this.colliders.addCircle('cairnStone', x, z, 0.78, minY, y + 1.65);
  }

  _buildHaystack(x, z, scale = 1) {
    const g = new THREE.Group();
    g.name = 'haystack';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 1.1 * scale);
    const drop = Math.max(0, y - minY) + 0.05;
    g.position.set(x, y, z);

    const poleH = 2.4 * scale + drop;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, poleH, 6), this.mWoodDark);
    pole.position.y = 2.4 * scale - poleH * 0.5;
    g.add(pole);

    const baseH = 1.2 * scale + drop;
    const hayBase = new THREE.Mesh(new THREE.CylinderGeometry(0.85 * scale, 1.05 * scale, baseH, 9), this.mHay);
    hayBase.position.y = 1.2 * scale - baseH * 0.5;
    hayBase.castShadow = true;
    const hayTop = new THREE.Mesh(new THREE.ConeGeometry(0.92 * scale, 1.0 * scale, 9), this.mHay);
    hayTop.position.y = 1.65 * scale;
    const snow = new THREE.Mesh(new THREE.ConeGeometry(0.84 * scale, 0.5 * scale, 9), this.mSnow);
    snow.position.y = 1.96 * scale;
    g.add(hayBase, hayTop, snow);

    this.group.add(g);
    this.colliders.addCircle('haystack', x, z, 1.15 * scale, minY, y + 2.4 * scale);
  }

  _buildSpruce(x, z, scale = 1) {
    const g = new THREE.Group();
    g.name = 'treeSpruce';
    // Sample trunk footprint (not wide canopy) so roots sit flush on snow without burying deep
    const { centerY: y, minY } = this._sampleFootprint(x, z, 0.38 * scale);
    const drop = Math.max(0, y - minY) + 0.12;
    g.position.set(x, y, z);

    const treeTop = new THREE.Group();
    treeTop.scale.setScalar(scale);

    const c1 = new THREE.Mesh(this.coneGeo1, this.mSpruceDark);
    c1.position.y = 2.15;
    c1.castShadow = true;
    const c2 = new THREE.Mesh(this.coneGeo2, this.mSpruce);
    c2.position.y = 3.35;
    c2.castShadow = true;
    const c3 = new THREE.Mesh(this.coneGeo3, this.mSpruce);
    c3.position.y = 4.45;
    c3.castShadow = true;
    const s2 = new THREE.Mesh(this.snowConeGeo2, this.mSnow);
    s2.position.y = 4.12;
    const s3 = new THREE.Mesh(this.snowConeGeo3, this.mSnow);
    s3.position.y = 5.02;
    treeTop.add(c1, c2, c3, s2, s3);
    g.add(treeTop);

    // Trunk extends smoothly down to minY - 0.06
    const trunkTop = 1.55 * scale;
    const trunkH = trunkTop + drop;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, trunkH, 6),
      this.mWoodDark
    );
    trunk.position.y = trunkTop - trunkH * 0.5;
    trunk.castShadow = true;
    g.add(trunk);

    this.group.add(g);
    this.colliders.addCircle('treeSpruce', x, z, 1.52 * scale, minY - 0.1, y + 5.4 * scale);
  }

  _buildBirch(x, z, scale = 1) {
    const g = new THREE.Group();
    g.name = 'treeBirch';
    const { centerY: y, minY } = this._sampleFootprint(x, z, 0.28 * scale);
    const drop = Math.max(0, y - minY) + 0.12;
    g.position.set(x, y, z);

    const top = new THREE.Group();
    top.scale.setScalar(scale);
    for (let i = 0; i < 4; i++) {
      const br = new THREE.Mesh(this.birchBranchGeo, this.mBirch);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      br.position.set(Math.cos(a) * 0.35, 2.75 + (i % 2) * 0.35, Math.sin(a) * 0.35);
      br.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
      top.add(br);
    }
    g.add(top);

    const trunkTop = 3.4 * scale;
    const trunkH = trunkTop + drop;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11 * scale, 0.18 * scale, trunkH, 6),
      this.mBirch
    );
    trunk.position.y = trunkTop - trunkH * 0.5;
    trunk.castShadow = true;
    g.add(trunk);

    this.group.add(g);
    this.colliders.addCircle('treeBirch', x, z, 0.65 * scale, minY, y + 3.8 * scale);
  }

  _buildRock(x, z, scale = 1, rotY = 0) {
    const g = new THREE.Group();
    g.name = 'rockBoulder';
    const { minY } = this._sampleFootprint(x, z, 0.52 * scale);
    // Anchor boulder base slightly below lowest corner minY so it sits firmly embedded in snow slopes
    g.position.set(x, minY - 0.08, z);
    g.rotation.y = rotY;

    const rock = new THREE.Mesh(this.rockGeo, this.mStone);
    rock.scale.set(scale * 1.2, scale * 0.78, scale);
    rock.position.y = scale * 0.56;
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);

    const cap = new THREE.Mesh(this.rockGeo, this.mSnow);
    cap.scale.set(scale * 0.96, scale * 0.24, scale * 0.84);
    cap.position.y = scale * 0.96;
    g.add(cap);

    this.group.add(g);
    this.colliders.addCircle('rockBoulder', x, z, scale * 1.25, minY, minY + scale * 1.15);
  }

  _buildHomeArea() {
    // Girl's log cabin home (visible in garden framing with warm porch & windows facing the yard)
    this._buildCabin({
      name: 'houseCabin',
      x: HOME_POS.x,
      z: HOME_POS.z,
      rotY: 0.72,
      w: 6.0,
      d: 4.6,
      h: 2.9,
      emeraldDoor: true,
      hasPorch: true,
      hasFlowerBox: true,
      woodTone: 'warm',
      roofTone: 'slate',
      hasSkis: true,
    });
    this._buildCabin({
      name: 'houseNeighbor',
      x: -26,
      z: 6,
      rotY: 0.44,
      w: 5.2,
      d: 4.2,
      h: 2.7,
      hasFlowerBox: true,
      woodTone: 'silver',
      roofTone: 'turf',
    });
    this._buildCabin({
      name: 'houseNeighbor',
      x: 24,
      z: 14,
      rotY: -0.45,
      w: 5.4,
      d: 4.3,
      h: 2.8,
      woodTone: 'ochre',
      roofTone: 'slate',
      hasWing: true,
    });
    this._buildCabin({
      name: 'houseShed',
      x: -24,
      z: -18,
      rotY: 0.15,
      w: 4.2,
      d: 3.6,
      h: 2.3,
      hasPorch: false,
      woodTone: 'dark',
      roofTone: 'turf',
    });

    // Garden props (spaced with clean clearance for girl walking & sleigh landing at (2.2, 8.2))
    this._buildPostbox(3.8, 5.4, -0.35);
    this._buildWell(7.6, 2.2);
    this._buildFirewoodRack(-8.8, 3.8, 0.25);
    this._buildSmallSled(-3.1, 7.2, 0.35);
    this._buildBench(-4.8, 3.2, 0.72);
    this._buildMilkStand(6.2, 7.6, -0.22);
    this._buildLanternPost(5.0, 10.2, false);
    this._buildLanternPost(-5.0, 11.2, false);

    // Front yard fences with wide open central gateway
    this._buildFenceSegment(-9.2, 10.6, 5.2, 0);
    this._buildFenceSegment(9.2, 10.6, 5.2, 0);
    this._buildFenceSegment(-12.0, 2.2, 7.0, Math.PI / 2);
    this._buildFenceSegment(12.0, 2.2, 7.0, Math.PI / 2);

    // Hero spruce & birch framing the garden
    this._buildSpruce(-14.5, -8.5, 1.15);
    this._buildSpruce(13.5, -7.5, 1.25);
    this._buildSpruce(-15.5, 13.5, 1.05);
    this._buildSpruce(15.2, 12.8, 1.1);
    this._buildBirch(-10.5, -11.5, 1.0);
    this._buildBirch(10.5, -11.0, 0.95);
  }

  _buildVillageArea() {
    // Varied 1970s Lapland village cabins along the snow lane (no identical clones!)
    this._buildCabin({
      name: 'houseVillage',
      x: -14.5,
      z: 36,
      rotY: 0.25,
      w: 5.2,
      d: 4.2,
      h: 2.7,
      hasFlowerBox: true,
      woodTone: 'ochre',
      roofTone: 'turf',
      hasSkis: true,
    });
    this._buildCabin({
      name: 'houseVillage',
      x: 15.5,
      z: 42,
      rotY: -0.3,
      w: 5.0,
      d: 4.0,
      h: 2.6,
      woodTone: 'silver',
      roofTone: 'slate',
      hasWing: true,
    });
    this._buildCabin({
      name: 'houseVillage',
      x: -13.5,
      z: 82,
      rotY: 0.35,
      w: 5.4,
      d: 4.4,
      h: 2.8,
      woodTone: 'warm',
      roofTone: 'slate',
      hasWing: true,
    });
    this._buildCabin({
      name: 'houseVillage',
      x: 16.5,
      z: 76,
      rotY: -0.22,
      w: 5.2,
      d: 4.2,
      h: 2.7,
      emeraldDoor: true,
      woodTone: 'ochre',
      roofTone: 'turf',
      hasFlowerBox: true,
    });

    // Village details: firewood racks, benches, postboxes, fences, lanterns
    this._buildFirewoodRack(-17.8, 41.2, 0.25);
    this._buildFirewoodRack(19.6, 81.2, -0.22);
    this._buildBench(9.8, 44.5, -0.3);
    this._buildPostbox(-8.6, 38.5, 0.25);
    this._buildPostbox(9.6, 74.5, -0.2);
    this._buildFenceSegment(-10.5, 52, 5.0, Math.PI / 2);
    this._buildFenceSegment(11.2, 62, 5.2, Math.PI / 2);

    this._buildLanternPost(-5.8, 32, false);
    this._buildLanternPost(6.2, 56, false);
    this._buildLanternPost(-6.5, 86, false);
    this._buildLanternPost(6.2, 98, false);

    // Community stone bakehouse / oven (村の共同窯)
    {
      const g = new THREE.Group();
      g.name = 'ovenCommunity';
      const { centerY: y, minY } = this._sampleFootprint(OVEN_POS.x, OVEN_POS.z, 2.0);
      const drop = Math.max(0, y - minY) + 0.05;
      g.position.set(OVEN_POS.x, y, OVEN_POS.z);
      g.rotation.y = -0.5;

      const baseH = 1.1 + drop;
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, baseH, 3.0), this.mStone);
      base.position.y = 1.1 - baseH * 0.5;
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.42, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mStone);
      dome.position.set(0, 1.08, -0.15);
      dome.castShadow = true;
      g.add(dome);

      const snowCap = new THREE.Mesh(new THREE.SphereGeometry(1.38, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.36), this.mSnow);
      snowCap.position.set(0, 1.24, -0.15);
      g.add(snowCap);

      const ember = new THREE.Mesh(new THREE.CircleGeometry(0.48, 10), this.mWinAmber);
      ember.position.set(0, 1.15, 1.28);
      g.add(ember);

      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 1.4, 8), this.mStone);
      chim.position.set(0, 2.55, -0.55);
      g.add(chim);

      this.group.add(g);
      this.colliders.addCircle('ovenCommunity', OVEN_POS.x, OVEN_POS.z, 2.35, minY, y + 3.2);
    }

    // Small church-roofed village hall (steep Nordic gable & wooden belfry spire — NO cross!)
    {
      const g = new THREE.Group();
      g.name = 'chapelRoof';
      const { centerY: y, minY } = this._sampleFootprint(CHAPEL_POS.x, CHAPEL_POS.z, 3.8, 4.4);
      const drop = Math.max(0, y - minY) + 0.05;
      g.position.set(CHAPEL_POS.x, y, CHAPEL_POS.z);
      g.rotation.y = 0.42;

      const plinthH = 0.35 + drop;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.9, plinthH, 7.9), this.mStone);
      plinth.position.y = 0.35 - plinthH * 0.5;
      g.add(plinth);

      const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.1, 7.6), this.mWoodLight);
      body.position.y = 0.35 + 1.55;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      for (const side of [-1, 1]) {
        const slope = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 8.2), this.mRoofSlate);
        slope.position.set(side * 1.48, 4.8, 0);
        slope.rotation.z = -side * 0.85;
        slope.castShadow = true;
        g.add(slope);
        const sn = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 8.0), this.mSnow);
        sn.position.set(side * 1.5, 4.93, 0);
        sn.rotation.z = -side * 0.85;
        g.add(sn);
      }

      const belfry = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.4), this.mWood);
      belfry.position.set(0, 6.75, 2.2);
      g.add(belfry);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 4), this.mRoofSlate);
      spire.position.set(0, 9.05, 2.2);
      spire.rotation.y = Math.PI / 4;
      g.add(spire);

      const rose = new THREE.Mesh(new THREE.CircleGeometry(0.62, 12), this.mWinAmber);
      rose.position.set(0, 3.15, 3.84);
      g.add(rose);

      this.group.add(g);
      this.colliders.addCircle('chapelRoof', CHAPEL_POS.x, CHAPEL_POS.z, 4.9, minY, y + 10.2);
    }

    // Forest reindeer feeder station (detour landmark in eastern woods)
    {
      const g = new THREE.Group();
      g.name = 'feederStation';
      const { centerY: y, minY } = this._sampleFootprint(FEEDER_POS.x, FEEDER_POS.z, 1.7);
      const drop = Math.max(0, y - minY) + 0.05;
      g.position.set(FEEDER_POS.x, y, FEEDER_POS.z);
      g.rotation.y = -0.3;

      const postH = 2.3 + drop;
      for (const sx of [-1.4, 1.4]) {
        for (const sz of [-0.9, 0.9]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, postH, 6), this.mWoodDark);
          p.position.set(sx, 2.3 - postH * 0.5, sz);
          p.castShadow = true;
          g.add(p);
        }
      }
      const trough = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 1.2), this.mWood);
      trough.position.y = 0.72;
      g.add(trough);
      const hay = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.42, 0.95), this.mHay);
      hay.position.y = 1.02;
      g.add(hay);
      for (const side of [-1, 1]) {
        const rf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.5), this.mRoofSlate);
        rf.position.set(0, 2.48, side * 0.58);
        rf.rotation.x = side * 0.45;
        g.add(rf);
        const sn = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 1.44), this.mSnow);
        sn.position.set(0, 2.57, side * 0.58);
        sn.rotation.x = side * 0.45;
        g.add(sn);
      }

      this.group.add(g);
      this.colliders.addCircle('feederStation', FEEDER_POS.x, FEEDER_POS.z, 2.3, minY, y + 2.8);
      this._buildLanternPost(FEEDER_POS.x - 3.6, FEEDER_POS.z + 2.2, false);
    }
  }

  _buildLakeAndDetours() {
    // Arched ice & timber bridge split into deck + left/right piers so sleigh drives cleanly over deck with zero AABB clip
    {
      const y = ICE_Y;
      const deckGrp = new THREE.Group();
      deckGrp.name = 'bridgeIceDeck';
      deckGrp.position.set(BRIDGE_POS.x, y, BRIDGE_POS.z);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(3.64, 0.34, 11.5), this.mWood);
      deck.position.y = 1.45;
      deck.castShadow = true;
      deck.receiveShadow = true;
      deckGrp.add(deck);

      for (const sz of [-5.2, 5.2]) {
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.64, 0.32, 3.8), this.mWoodDark);
        ramp.position.set(0, 0.72, sz * 1.24);
        ramp.rotation.x = sz > 0 ? 0.40 : -0.40;
        deckGrp.add(ramp);
      }
      this.group.add(deckGrp);

      for (const [sx, pName] of [[-1.95, 'bridgeIcePierL'], [1.95, 'bridgeIcePierR']]) {
        const pierGrp = new THREE.Group();
        pierGrp.name = pName;
        pierGrp.position.set(BRIDGE_POS.x + sx, y, BRIDGE_POS.z);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 11.5), this.mIce);
        rail.position.set(0, 1.95, 0);
        pierGrp.add(rail);
        for (const pz of [-5, 0, 5]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.52, 0.22), this.mWoodDark);
          post.position.set(0, 1.04, pz);
          pierGrp.add(post);
        }
        this.group.add(pierGrp);
        this.colliders.addBox(pName, BRIDGE_POS.x + sx, BRIDGE_POS.z, 0.28, 5.8, y - 0.25, y + 2.4);
      }
    }

    // Wooden pier on the frozen lake shore (pilings grounded at ICE_Y - 0.22)
    {
      const g = new THREE.Group();
      g.name = 'pierWood';
      g.position.set(PIER_POS.x, ICE_Y, PIER_POS.z);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 7.4), this.mWood);
      deck.position.y = 0.58;
      deck.castShadow = true;
      g.add(deck);
      for (const sx of [-1.1, 1.1]) {
        for (const sz of [-3.2, 0, 3.2]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.90, 6), this.mWoodDark);
          leg.position.set(sx, 0.23, sz);
          g.add(leg);
        }
      }

      this.group.add(g);
      this.colliders.addBox('pierWood', PIER_POS.x, PIER_POS.z, 1.4, 3.8, ICE_Y - 0.25, ICE_Y + 0.75);
      this._buildLanternPost(PIER_POS.x + 1.8, PIER_POS.z - 3.6, true);
    }

    // Small wooden rowboat resting flush on the frozen ice beside the pier
    {
      const bx = PIER_POS.x - 2.3;
      const bz = PIER_POS.z + 1.2;
      const g = new THREE.Group();
      g.name = 'boatWood';
      g.position.set(bx, ICE_Y - 0.18, bz);
      g.rotation.y = 0.22;

      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.56, 2.8), this.mWoodLight);
      hull.position.y = 0.28;
      hull.castShadow = true;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.35), this.mWoodDark);
      bench.position.y = 0.54;
      const snow = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 1.6), this.mSnow);
      snow.position.set(0, 0.56, 0.1);
      g.add(hull, bench, snow);

      this.group.add(g);
      this.colliders.addCircle('boatWood', bx, bz, 1.45, ICE_Y - 0.2, ICE_Y + 0.55);
    }

    // Ice-fishing hut out on the frozen lake (detour!)
    this._buildCabin({
      name: 'hutFishing',
      x: FISHING_HUT_POS.x,
      z: FISHING_HUT_POS.z,
      rotY: 0.65,
      w: 3.4,
      d: 3.0,
      h: 2.2,
      emeraldDoor: false,
      hasPorch: false,
      woodTone: 'dark',
      roofTone: 'slate',
    });
    this._buildLanternPost(FISHING_HUT_POS.x + 3.4, FISHING_HUT_POS.z + 2.2, false);
    this._buildFirewoodRack(FISHING_HUT_POS.x - 4.2, FISHING_HUT_POS.z - 1.6, 0.65);

    // Detour lakeside cottage & yard on the western shore
    this._buildCabin({
      name: 'houseDetour',
      x: DETOUR_CABIN_POS.x,
      z: DETOUR_CABIN_POS.z,
      rotY: 0.9,
      w: 4.8,
      d: 3.8,
      h: 2.5,
      emeraldDoor: true,
      hasFlowerBox: true,
      woodTone: 'silver',
      roofTone: 'turf',
      hasSkis: true,
    });
    this._buildFirewoodRack(DETOUR_CABIN_POS.x - 4.8, DETOUR_CABIN_POS.z + 1.5, 0.9);
    this._buildFenceSegment(DETOUR_CABIN_POS.x + 2.5, DETOUR_CABIN_POS.z + 4.8, 5.0, 0.35);

    // Wayside Lapland timber hay-barn & haystacks along the northern ridge road (fills upper snowfield)
    this._buildCabin({
      name: 'barnTimber',
      x: BARN_POS.x,
      z: BARN_POS.z,
      rotY: -0.48,
      w: 5.4,
      d: 4.4,
      h: 2.8,
      emeraldDoor: false,
      hasPorch: false,
      woodTone: 'dark',
      roofTone: 'turf',
    });
    this._buildHaystack(BARN_POS.x - 6.0, BARN_POS.z + 3.6, 1.0);
    this._buildHaystack(BARN_POS.x - 4.8, BARN_POS.z + 6.6, 0.9);
    this._buildFenceSegment(BARN_POS.x - 7.2, BARN_POS.z - 5.2, 5.2, -0.45);
    this._buildLanternPost(BARN_POS.x - 7.8, BARN_POS.z - 0.5, false);
  }

  _buildPostOfficeHill() {
    // Hilltop Aurora Post Office (Goal landmark, grounded plinth + full-height timber beacon tower)
    const g = new THREE.Group();
    g.name = 'housePostOffice';
    const { centerY: y, minY } = this._sampleFootprint(OFFICE_POS.x, OFFICE_POS.z, 5.2, 4.6);
    const drop = Math.max(0, y - minY) + 0.06;
    g.position.set(OFFICE_POS.x, y, OFFICE_POS.z);

    const plinthH = 0.55 + drop;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.6, plinthH, 7.6), this.mStone);
    plinth.position.y = 0.55 - plinthH * 0.5;
    plinth.receiveShadow = true;
    g.add(plinth);

    const hall = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.6, 6.8), this.mWood);
    hall.position.y = 0.55 + 1.8;
    hall.castShadow = true;
    hall.receiveShadow = true;
    g.add(hall);

    // Tall timber beacon tower anchored from ground level y=0 up through the hall (never perched on roof!)
    const towerH = 8.45 + drop;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, towerH, 2.4), this.mWoodLight);
    tower.position.set(0, 8.45 - towerH * 0.5, -1.2);
    tower.castShadow = true;
    g.add(tower);

    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1.15, 8), this.mWinEmerald);
    beacon.position.set(0, 9.0, -1.2);
    g.add(beacon);

    const towerCap = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.1, 4), this.mRoofSlate);
    towerCap.position.set(0, 10.6, -1.2);
    towerCap.rotation.y = Math.PI / 4;
    g.add(towerCap);

    // Main steep pitched roof + gable triangle + snow
    const gShape = new THREE.Shape();
    gShape.moveTo(-4.4, 0);
    gShape.lineTo(4.4, 0);
    gShape.lineTo(0, 2.6);
    gShape.closePath();
    const gGeo = new THREE.ExtrudeGeometry(gShape, { depth: 6.8, bevelEnabled: false });
    gGeo.translate(0, 0, -3.4);
    const gableFill = new THREE.Mesh(gGeo, this.mWood);
    gableFill.position.y = 4.15;
    g.add(gableFill);

    for (const side of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.22, 7.8), this.mRoofSlate);
      slab.position.set(side * 2.35, 5.2, 0);
      slab.rotation.z = -side * 0.54;
      slab.castShadow = true;
      g.add(slab);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.18, 7.6), this.mSnow);
      sn.position.set(side * 2.38, 5.35, 0);
      sn.rotation.z = -side * 0.54;
      g.add(sn);
    }

    // Glowing front door & mullioned windows facing -Z (toward approaching player)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.14), this.mWinEmerald);
    door.position.set(0, 0.55 + 1.2, -3.45);
    g.add(door);

    for (const sx of [-2.4, 2.4]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), this.mWinAmber);
      win.position.set(sx, 0.55 + 1.8, -3.45);
      win.rotation.y = Math.PI;
      g.add(win);
    }

    // Wordless sculpted gold post-horn crest above porch (NO letters!)
    const hornRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.075, 8, 18), this.mWinAmber);
    hornRing.position.set(0, 4.0, -3.5);
    g.add(hornRing);

    // Porch deck & wide front step reaching snow level
    const porchH = 0.35 + drop;
    const porch = new THREE.Mesh(new THREE.BoxGeometry(5.2, porchH, 2.2), this.mWoodDark);
    porch.position.set(0, 0.35 - porchH * 0.5, -4.4);
    porch.receiveShadow = true;
    g.add(porch);

    const stepH = 0.18 + drop;
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.2, stepH, 0.7), this.mWood);
    step.position.set(0, 0.18 - stepH * 0.5, -5.65);
    step.receiveShadow = true;
    g.add(step);

    // Beacon glow aura (feathered fresnel FX)
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(3.8, 12, 10),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(PALETTE.emeraldGlow) } },
        vertexShader: `varying vec3 vN, vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN, vV; void main(){ float f = pow(max(0.0001, dot(vN, vV)), 2.8); gl_FragColor = vec4(uColor * f * 0.55, f * 0.45); }`,
      })
    );
    aura.position.set(0, 9.0, -1.2);
    aura.userData.nonsolid = true;
    aura.userData.fx = true;
    g.add(aura);
    this.lanterns.push(aura);

    this.group.add(g);
    this.colliders.addBox('housePostOffice', OFFICE_POS.x, OFFICE_POS.z - 0.9, 5.0, 5.2, minY - 0.1, y + 11.8);
    this._addLightPool(OFFICE_POS.x, OFFICE_POS.z - 7.0, 7.6, true);
    this._addLightPool(OFFICE_POS.x - 3.2, OFFICE_POS.z - 5.8, 4.4, false);
    this._addLightPool(OFFICE_POS.x + 3.2, OFFICE_POS.z - 5.8, 4.4, false);

    // Flanking yard details around the post office terrace
    this._buildPostbox(OFFICE_POS.x - 5.4, OFFICE_POS.z - 6.4, 0);
    this._buildLanternPost(OFFICE_POS.x - 7.0, OFFICE_POS.z - 7.8, true);
    this._buildLanternPost(OFFICE_POS.x + 7.0, OFFICE_POS.z - 7.8, true);
    this._buildFirewoodRack(OFFICE_POS.x - 6.8, OFFICE_POS.z + 1.5, Math.PI / 2);
    this._buildBench(OFFICE_POS.x + 6.2, OFFICE_POS.z - 2.4, -0.5);
    this._buildFenceSegment(OFFICE_POS.x - 10.2, OFFICE_POS.z - 2.0, 5.2, 0.35);
    this._buildFenceSegment(OFFICE_POS.x + 10.2, OFFICE_POS.z - 2.0, 5.2, -0.35);

    // Framing hilltop spruces & boulders behind/beside the post office
    this._buildSpruce(OFFICE_POS.x - 12.5, OFFICE_POS.z + 6.5, 1.2);
    this._buildSpruce(OFFICE_POS.x + 12.5, OFFICE_POS.z + 7.0, 1.25);
    this._buildSpruce(OFFICE_POS.x - 15.5, OFFICE_POS.z - 4.0, 1.05);
    this._buildSpruce(OFFICE_POS.x + 15.0, OFFICE_POS.z - 3.5, 1.1);
    this._buildRock(OFFICE_POS.x - 8.2, OFFICE_POS.z + 5.2, 1.15, 0.5);
    this._buildRock(OFFICE_POS.x + 8.4, OFFICE_POS.z + 4.4, 1.05, 1.8);
  }

  _buildApproachHamlet() {
    // Rich 1970s Lapland hillside hamlet & lantern-lined snow approach (z = 148..312, central sleigh lane |x|<9 clear)
    this._buildCabin({
      name: 'houseApproach',
      x: 18.5,
      z: 166,
      rotY: -0.38,
      w: 5.0,
      d: 4.1,
      h: 2.6,
      hasFlowerBox: true,
      woodTone: 'warm',
      roofTone: 'slate',
      hasSkis: true,
    });
    this._buildPostbox(12.2, 169, -0.35);
    this._buildFirewoodRack(22.2, 171.2, -0.38);
    this._buildBench(13.0, 163.5, -0.38);
    this._buildFenceSegment(12.5, 159.5, 5.0, 0.25);

    this._buildCabin({
      name: 'houseApproach',
      x: -19.0,
      z: 178,
      rotY: 0.42,
      w: 5.2,
      d: 4.2,
      h: 2.7,
      emeraldDoor: true,
      woodTone: 'silver',
      roofTone: 'turf',
      hasWing: true,
    });
    this._buildPostbox(-12.4, 181, 0.4);
    this._buildFirewoodRack(-22.8, 183.5, 0.42);
    this._buildFenceSegment(-12.4, 176.2, 3.6, Math.PI * 0.5);

    this._buildCabin({
      name: 'houseApproach',
      x: -21.0,
      z: 248,
      rotY: 0.55,
      w: 4.8,
      d: 3.9,
      h: 2.5,
      hasFlowerBox: true,
      woodTone: 'dark',
      roofTone: 'turf',
      hasSkis: true,
    });
    this._buildFirewoodRack(-24.8, 253.2, 0.55);
    this._buildFenceSegment(-13.8, 242.5, 5.2, 0.28);
    this._buildBench(-14.5, 250.2, 0.55);

    this._buildCabin({
      name: 'houseApproach',
      x: 22.0,
      z: 274,
      rotY: -0.52,
      w: 5.2,
      d: 4.2,
      h: 2.7,
      woodTone: 'ochre',
      roofTone: 'slate',
      hasWing: true,
      hasSkis: true,
    });
    this._buildMilkStand(14.5, 278.5, -0.45);
    this._buildFenceSegment(16.4, 269.0, 4.2, -0.45);
    this._buildHaystack(27.5, 280.5, 0.95);

    // Warm lanterns lining both sides of the snowy hillside approach
    this._buildLanternPost(-8.8, 152, false);
    this._buildLanternPost(8.8, 174, false);
    this._buildLanternPost(9.2, 218, false);
    this._buildLanternPost(-9.4, 238, false);
    this._buildLanternPost(9.6, 258, false);
    this._buildLanternPost(-9.4, 280, true);
  }

  _buildTrailAndForest() {
    // Trailside stone cairns & lanterns guiding gently from lake/village up the ridge to Post Office
    this._buildCairn(-9.2, 165, 0.2);
    this._buildCairn(9.5, 192, -0.3);
    this._buildCairn(-9.8, 224, 0.4);
    this._buildCairn(9.8, 256, -0.2);
    this._buildCairn(-9.5, 288, 0.3);
    this._buildLanternPost(-9.5, 196, false);
    this._buildLanternPost(9.6, 236, false);
    this._buildLanternPost(-9.4, 272, false);
    this._buildLanternPost(9.2, 304, true);

    const rand = rng(1974);
    const roadClear = (x, z) => {
      const roadX = z < 30 ? 0 : z < 105 ? Math.sin((z - 30) * 0.045) * 5.0 : z < 135 ? -12 : 0;
      return Math.abs(x - roadX) < 8.5 && z > -15 && z < 332;
    };

    const spruceCount = this.low ? 75 : 132;
    for (let i = 0; i < spruceCount; i++) {
      const x = (rand() - 0.5) * 205;
      const z = -22 + rand() * 380;
      if (isOverLake(x, z) || roadClear(x, z)) continue;
      if (Math.hypot(x, z) < 16) continue;
      if (Math.hypot(x - OFFICE_POS.x, z - OFFICE_POS.z) < 17) continue;
      const sc = 0.85 + rand() * 0.65;
      if (!this.colliders.canPlace(x, z, 1.65 * sc, 1.15)) continue;
      this._buildSpruce(x, z, sc);
    }

    // Extra scenic hillside spruce & birch clusters flanking the northern climb (z = 148..322)
    const ridgeSpots = [
      [-15, 148], [15, 148], [-26, 158], [26, 154],
      [-16, 196], [16, 190], [-20, 210], [15, 228], [-16, 228], [18, 244],
      [-15, 264], [18, 260], [-18, 278], [17, 294], [-15, 310], [16, 316],
      [-28, 222], [29, 245], [-26, 268], [28, 282], [-24, 298], [24, 306],
      [-34, 192], [35, 198], [-35, 232], [35, 226], [-34, 288], [34, 292],
    ];
    for (const [rx, rz] of ridgeSpots) {
      const sc = 0.9 + rand() * 0.45;
      if (this.colliders.canPlace(rx, rz, 1.65 * sc, 1.15)) {
        this._buildSpruce(rx, rz, sc);
      }
      const bx = rx + (rx > 0 ? 3.8 : -3.8);
      const bz = rz + 3.2;
      if (this.colliders.canPlace(bx, bz, 1.1, 1.0)) {
        this._buildBirch(bx, bz, 0.95);
      }
    }

    const birchCount = this.low ? 22 : 42;
    for (let i = 0; i < birchCount; i++) {
      const x = (rand() - 0.5) * 180;
      const z = -15 + rand() * 345;
      if (isOverLake(x, z) || roadClear(x, z)) continue;
      if (Math.hypot(x, z) < 15) continue;
      const sc = 0.85 + rand() * 0.45;
      if (!this.colliders.canPlace(x, z, 1.0 * sc, 1.0)) continue;
      this._buildBirch(x, z, sc);
    }

    const rockCount = this.low ? 18 : 34;
    for (let i = 0; i < rockCount; i++) {
      const x = (rand() - 0.5) * 185;
      const z = 12 + rand() * 330;
      if (isOverLake(x, z) || roadClear(x, z)) continue;
      const sc = 0.75 + rand() * 0.85;
      if (!this.colliders.canPlace(x, z, 2.15 * sc, 1.5)) continue;
      this._buildRock(x, z, sc, rand() * Math.PI * 2);
    }
  }

  _buildFootprints() {
    // Non-solid snow footprints leading from cabin porch into the garden & along the village lane
    const fpGeo = new THREE.CircleGeometry(0.11, 8);
    fpGeo.rotateX(-Math.PI / 2);
    const fpMat = new THREE.MeshBasicMaterial({ color: 0xaabed8, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 16; i++) {
      const f = new THREE.Mesh(fpGeo, fpMat);
      f.name = 'snowFootprint';
      const u = i / 15;
      const x = -3.8 + u * 4.2 + (i % 2 === 0 ? -0.14 : 0.14);
      const z = -0.2 + u * 4.8;
      f.position.set(x, this._ground(x, z) + 0.02, z);
      f.scale.set(0.8, 1, 1.35);
      f.userData.nonsolid = true;
      this.group.add(f);
    }
    for (let i = 0; i < 18; i++) {
      const f = new THREE.Mesh(fpGeo, fpMat);
      f.name = 'snowFootprint';
      const z = 24 + i * 3.2;
      const x = Math.sin((z - 30) * 0.045) * 3.5 + (i % 2 === 0 ? -0.18 : 0.18);
      f.position.set(x, this._ground(x, z) + 0.02, z);
      f.scale.set(0.85, 1, 1.35);
      f.userData.nonsolid = true;
      this.group.add(f);
    }
    // Subtle approach lane snow tracks guiding up the northern hill (z = 140..308)
    for (let i = 0; i < 28; i++) {
      const f = new THREE.Mesh(fpGeo, fpMat);
      f.name = 'snowFootprint';
      const z = 140 + i * 6.0;
      const x = Math.sin(z * 0.03) * 1.6 + (i % 2 === 0 ? -0.45 : 0.45);
      f.position.set(x, this._ground(x, z) + 0.025, z);
      f.scale.set(0.9, 1, 1.8);
      f.userData.nonsolid = true;
      this.group.add(f);
    }
  }
}
