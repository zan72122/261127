import * as THREE from '../../lib/three.module.js';
import {
  BAMBOO_POS,
  BRIDGE_POS,
  GOAL_POS,
  LAYER_MAIN,
  LAYER_REFLECT,
  MILL_POS,
  PALETTE,
  WELL_POS,
} from '../core/env.js';
import { rng } from '../core/math.js';
import {
  STREAM_WATER_Y,
  TERRACE_COUNT,
  getGroundY,
  registerBoxCollider,
  registerCylCollider,
  streamCenterZ,
  terraceZRange,
} from './terrain.js';

function markReflect(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.layers.enable(LAYER_MAIN);
      o.layers.enable(LAYER_REFLECT);
    }
  });
}

function snapToGround(obj, x, z) {
  obj.position.set(x, 0, z);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const gy = getGroundY(x, z);
  obj.position.y = gy - box.min.y;
  obj.updateMatrixWorld(true);
  return gy;
}

function makeNaturalCanopyGeo(radius, seed) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 3.6 + seed) * Math.cos(y * 4.2 - seed) * Math.sin(z * 3.8 + seed * 0.6);
    const s = 1 + n * 0.18;
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildRuralHouse(mats, { width = 7.2, depth = 4.8, wallH = 2.6, hasEngawa = false, hasNoren = false, isKura = false }) {
  const g = new THREE.Group();

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.35, 0.42, depth + 0.35), mats.mossStone);
  plinth.position.y = 0.21;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  g.add(plinth);

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, depth), mats.plaster);
  body.position.y = 0.42 + wallH * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  if (!isKura) {
    const wainscot = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 1.1, depth + 0.04), mats.cedar);
    wainscot.position.y = 0.42 + 0.55;
    wainscot.castShadow = true;
    g.add(wainscot);
  }

  if (hasEngawa) {
    const engawa = new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, 0.14, 1.0), mats.cedar);
    engawa.position.set(0, 0.46, depth * 0.5 + 0.5);
    engawa.castShadow = true;
    g.add(engawa);
  }

  if (hasNoren) {
    for (let i = 0; i < 3; i++) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.78), mats.indigo);
      panel.position.set(-0.4 + i * 0.38, 1.95, depth * 0.5 + 0.12);
      g.add(panel);
    }
  }

  const roofH = isKura ? 1.55 : 1.75;
  const roofSpan = depth + 1.25;
  const roofLen = width + 1.15;
  const slopeLen = Math.hypot(roofSpan * 0.5, roofH);
  const slopeAngle = Math.atan2(roofH, roofSpan * 0.5);
  const roofBaseY = 0.42 + wallH;

  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.15, slopeLen), mats.kawara);
    slab.position.set(0, roofBaseY + roofH * 0.5 - 0.04, side * (roofSpan * 0.25));
    slab.rotation.x = side * slopeAngle;
    slab.castShadow = true;
    slab.receiveShadow = true;
    g.add(slab);
  }

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-depth * 0.5, 0);
  gableShape.lineTo(depth * 0.5, 0);
  gableShape.lineTo(0, roofH - 0.05);
  gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: width - 0.06, bevelEnabled: false });
  gableGeo.rotateY(Math.PI / 2);
  const gable = new THREE.Mesh(gableGeo, mats.plaster);
  gable.position.set(-(width - 0.06) * 0.5, roofBaseY, 0);
  g.add(gable);

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(roofLen + 0.12, 0.22, 0.3), mats.kawara);
  ridge.position.set(0, roofBaseY + roofH + 0.04, 0);
  g.add(ridge);

  return g;
}

function buildBroadleafTree(mats, seed, scale = 1.0) {
  const r = rng(seed);
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * scale, 0.24 * scale, 2.35 * scale, 7), mats.darkWood);
  trunk.position.y = 1.175 * scale;
  trunk.castShadow = true;
  g.add(trunk);

  const angles = [0.25, 1.85, 3.45, 5.05];
  for (let i = 0; i < angles.length; i++) {
    const ang = angles[i] + r() * 0.35;
    const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * scale, 0.1 * scale, 1.25 * scale, 5), mats.darkWood);
    bough.position.set(Math.cos(ang) * 0.36 * scale, 2.1 * scale, Math.sin(ang) * 0.36 * scale);
    bough.rotation.z = -Math.cos(ang) * 0.55;
    bough.rotation.x = Math.sin(ang) * 0.55;
    g.add(bough);

    const crown = new THREE.Mesh(
      makeNaturalCanopyGeo((0.72 + r() * 0.16) * scale, seed + i * 5),
      i % 2 === 0 ? mats.broadleafA : mats.broadleafB
    );
    crown.scale.set(1.22, 0.68, 1.14);
    crown.position.set(Math.cos(ang) * (0.68 + r() * 0.26) * scale, (2.6 + r() * 0.4) * scale, Math.sin(ang) * (0.68 + r() * 0.26) * scale);
    crown.castShadow = true;
    crown.receiveShadow = true;
    g.add(crown);
  }
  const top = new THREE.Mesh(makeNaturalCanopyGeo(0.9 * scale, seed + 29), mats.broadleafB);
  top.scale.set(1.2, 0.72, 1.15);
  top.position.set(0, 3.25 * scale, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  return g;
}

function buildCedarTree(mats, seed, scale = 1.0) {
  const r = rng(seed);
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.25 * scale, 2.9 * scale, 7), mats.darkWood);
  trunk.position.y = 1.45 * scale;
  trunk.castShadow = true;
  g.add(trunk);

  const tiers = [
    { y: 2.8, rad: 1.52, h: 1.8, mat: mats.pineLeaf },
    { y: 3.9, rad: 1.22, h: 1.7, mat: mats.broadleafA },
    { y: 4.95, rad: 0.85, h: 1.5, mat: mats.pineLeaf },
  ];
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const cone = new THREE.Mesh(new THREE.ConeGeometry(tier.rad * scale, tier.h * scale, 8), tier.mat);
    cone.position.set((r() - 0.5) * 0.08 * scale, tier.y * scale, (r() - 0.5) * 0.08 * scale);
    cone.rotation.y = r() * Math.PI;
    cone.castShadow = true;
    cone.receiveShadow = true;
    g.add(cone);
  }
  return g;
}

export class ValleyLandmarks {
  constructor(opts = {}) {
    this.low = !!opts.low;
    this.group = new THREE.Group();
    this.group.name = 'valleyLandmarks';

    this.millWheel = null;
    this.vanePivot = null;
    this.pennant = null;
    this.lookoutBell = null;
    this._placedBounds = [];

    const mats = {
      stone: new THREE.MeshStandardMaterial({ color: PALETTE.graniteStone, roughness: 0.92 }),
      mossStone: new THREE.MeshStandardMaterial({ color: new THREE.Color('#697663'), roughness: 0.94 }),
      bermGrass: new THREE.MeshStandardMaterial({ color: new THREE.Color('#648d46'), roughness: 0.92 }),
      cedar: new THREE.MeshStandardMaterial({ color: PALETTE.cedarWood, roughness: 0.85 }),
      darkWood: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4d3927'), roughness: 0.88 }),
      plaster: new THREE.MeshStandardMaterial({ color: PALETTE.plasterWhite, roughness: 0.9 }),
      kawara: new THREE.MeshStandardMaterial({ color: PALETTE.kawaraSlate, roughness: 0.72, metalness: 0.12 }),
      shoji: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#f7f0dc'),
        emissive: new THREE.Color('#ffe0a6'),
        emissiveIntensity: 0.16,
        roughness: 0.85,
      }),
      bamboo: new THREE.MeshStandardMaterial({ color: PALETTE.bambooGreen, roughness: 0.72 }),
      bambooLeaf: new THREE.MeshStandardMaterial({ color: new THREE.Color('#5f9148'), roughness: 0.84 }),
      yamabuki: new THREE.MeshStandardMaterial({
        color: PALETTE.yamabuki,
        emissive: new THREE.Color('#8f630a'),
        emissiveIntensity: 0.28,
        roughness: 0.36,
        metalness: 0.38,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#c89c3c'),
        roughness: 0.35,
        metalness: 0.65,
      }),
      indigo: new THREE.MeshStandardMaterial({ color: PALETTE.indigo, roughness: 0.86, side: THREE.DoubleSide }),
      riceShoot: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6ca349'), roughness: 0.85 }),
      riceStraw: new THREE.MeshStandardMaterial({ color: new THREE.Color('#c7af6b'), roughness: 0.9 }),
      pineLeaf: new THREE.MeshStandardMaterial({ color: new THREE.Color('#426b39'), roughness: 0.88 }),
      broadleafA: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4f7e3d'), roughness: 0.86 }),
      broadleafB: new THREE.MeshStandardMaterial({ color: new THREE.Color('#64964a'), roughness: 0.84 }),
      troughPool: new THREE.MeshStandardMaterial({ color: new THREE.Color('#7daec6'), roughness: 0.15, metalness: 0.3 }),
    };

    this._buildBridges(mats);
    this._buildWatermill(mats);
    this._buildValleyVillageAndProps(mats);
    this._buildStreamBankStones(mats);
    this._buildBambooClearing(mats);
    this._buildTerraceWallsAndRice(mats);
    this._buildHillsideCottagesAndTrees(mats);
    this._buildLookoutSanctuary(mats);
  }

  _recordZone(cx, cz, rad) {
    this._placedBounds.push({ cx, cz, rad });
  }

  _isClear(cx, cz, rad) {
    for (let i = 0; i < this._placedBounds.length; i++) {
      const b = this._placedBounds[i];
      if (Math.hypot(cx - b.cx, cz - b.cz) < rad + b.rad) return false;
    }
    return true;
  }

  _buildBridges(mats) {
    // 1. Main arched granite bridge at (0, 68)
    const bg = new THREE.Group();
    bg.name = 'stoneBridge';
    const bedMain = getGroundY(BRIDGE_POS.x, BRIDGE_POS.z);

    const segs = 9;
    const span = 12.2;
    for (let i = 0; i < segs; i++) {
      const u = (i + 0.5) / segs - 0.5;
      const z = u * span;
      const archY = STREAM_WATER_Y + 0.72 + (1 - (u * 2) * (u * 2)) * 0.72;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.32, span / segs + 0.14), mats.stone);
      slab.position.set(0, archY, z);
      slab.rotation.x = Math.atan2(-4 * 0.72 * u * 2, span);
      slab.castShadow = true;
      slab.receiveShadow = true;
      bg.add(slab);
    }

    const pierTop = STREAM_WATER_Y + 0.72;
    const pierH = pierTop - bedMain;
    for (const sz of [-5.8, 5.8]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(4.3, pierH, 1.3), mats.mossStone);
      pier.position.set(0, bedMain + pierH * 0.5, sz);
      pier.castShadow = true;
      pier.receiveShadow = true;
      bg.add(pier);
    }

    for (const sx of [-1.95, 1.95]) {
      for (let i = 0; i < 5; i++) {
        const u = i / 4 - 0.5;
        const z = u * 10.6;
        const archY = STREAM_WATER_Y + 0.92 + (1 - (u * 2) * (u * 2)) * 0.72;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.24), mats.stone);
        post.position.set(sx, archY + 0.2, z);
        post.castShadow = true;
        bg.add(post);
      }
    }

    bg.position.set(BRIDGE_POS.x, 0, BRIDGE_POS.z);
    markReflect(bg);
    this.group.add(bg);
    registerBoxCollider('stoneBridgeRailW', BRIDGE_POS.x - 2.05, BRIDGE_POS.z, 0.22, 5.8, STREAM_WATER_Y, STREAM_WATER_Y + 2.5);
    registerBoxCollider('stoneBridgeRailE', BRIDGE_POS.x + 2.05, BRIDGE_POS.z, 0.22, 5.8, STREAM_WATER_Y, STREAM_WATER_Y + 2.5);
    this._recordZone(BRIDGE_POS.x, BRIDGE_POS.z, 7.6);

    // Bridge-end stone lanterns clearly grounded on banks outside bridge footprint
    const lanternSpots = [
      { name: 'bridgeLanternSouth', x: -2.9, z: BRIDGE_POS.z - 6.8 },
      { name: 'bridgeLanternNorth', x: 2.9, z: BRIDGE_POS.z + 6.8 },
    ];
    for (const ls of lanternSpots) {
      const lt = new THREE.Group();
      lt.name = ls.name;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 8), mats.mossStone);
      base.position.y = 0.45;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), mats.stone);
      box.position.y = 1.08;
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), mats.shoji);
      glow.position.y = 1.08;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.3, 6), mats.mossStone);
      cap.position.y = 1.38;
      lt.add(base, box, glow, cap);
      const gy = snapToGround(lt, ls.x, ls.z);
      this.group.add(lt);
      registerCylCollider(ls.name, ls.x, ls.z, 0.45, gy, gy + 1.6);
      this._recordZone(ls.x, ls.z, 1.4);
    }

    // 2. Cedar plank bridges from Round 2 B (clear of watermill & hamlet)
    const buildWoodBridge = (name, bx, w, len, archH) => {
      const bz = streamCenterZ(bx);
      const bedY = getGroundY(bx, bz);
      const wb = new THREE.Group();
      wb.name = name;
      const pCount = 11;
      for (let i = 0; i < pCount; i++) {
        const u = (i + 0.5) / pCount - 0.5;
        const z = u * len;
        const ay = STREAM_WATER_Y + 0.62 + (1 - (u * 2) * (u * 2)) * archH;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, len / pCount - 0.06), mats.cedar);
        plank.position.set(0, ay, z);
        plank.castShadow = true;
        plank.receiveShadow = true;
        wb.add(plank);
      }
      const pierTop = STREAM_WATER_Y + 0.62;
      const pierH = pierTop - bedY;
      for (const sz of [-len * 0.46, len * 0.46]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, pierH, 1.0), mats.mossStone);
        pier.position.set(0, bedY + pierH * 0.5, sz);
        pier.castShadow = true;
        wb.add(pier);
      }
      for (const sx of [-w * 0.46, w * 0.46]) {
        for (let i = 0; i < 4; i++) {
          const u = i / 3 - 0.5;
          const z = u * (len - 1.2);
          const ay = STREAM_WATER_Y + 0.65 + (1 - (u * 2) * (u * 2)) * archH;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.14), mats.darkWood);
          post.position.set(sx, ay + 0.36, z);
          post.castShadow = true;
          wb.add(post);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len - 0.8), mats.cedar);
        rail.position.set(sx, STREAM_WATER_Y + 1.32 + archH * 0.4, 0);
        rail.castShadow = true;
        wb.add(rail);
      }
      wb.position.set(bx, 0, bz);
      markReflect(wb);
      this.group.add(wb);
      registerBoxCollider(`${name}RailW`, bx - w * 0.5, bz, 0.16, len * 0.48, STREAM_WATER_Y, STREAM_WATER_Y + 2.3);
      registerBoxCollider(`${name}RailE`, bx + w * 0.5, bz, 0.16, len * 0.48, STREAM_WATER_Y, STREAM_WATER_Y + 2.3);
      this._recordZone(bx, bz, 7.0);
    };

    buildWoodBridge('woodBridgeMill', -14, 3.2, 11.6, 0.35);
    buildWoodBridge('footBridgeEast', 32, 3.0, 11.6, 0.42);
  }

  _buildWatermill(mats) {
    const mx = MILL_POS.x; // -24
    const mz = MILL_POS.z; // 91.2

    const mg = new THREE.Group();
    mg.name = 'millHouse';
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.55, 5.0), mats.mossStone);
    plinth.position.y = 0.275;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    mg.add(plinth);

    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.7, 4.6), mats.cedar);
    body.position.y = 0.55 + 1.35;
    body.castShadow = true;
    body.receiveShadow = true;
    mg.add(body);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.75, 4.4), mats.plaster);
    upper.position.y = 3.25;
    upper.castShadow = true;
    mg.add(upper);

    for (const side of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.16, 3.3), mats.kawara);
      roof.position.set(0, 4.15, side * 1.45);
      roof.rotation.x = side * 0.52;
      roof.castShadow = true;
      mg.add(roof);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.22, 0.3), mats.kawara);
    ridge.position.y = 4.97;
    mg.add(ridge);

    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.58), mats.indigo);
    banner.position.set(2.68, 2.05, 1.0);
    mg.add(banner);

    const my = snapToGround(mg, mx, mz);
    markReflect(mg);
    this.group.add(mg);
    registerBoxCollider('millHouse', mx, mz, 3.1, 2.6, my, my + 5.1);

    // Rotating wooden waterwheel dipping directly into the stream & mounted on stone axle piers
    const streamZ = streamCenterZ(mx); // ~83.87 at x=-24
    const wheelZ = streamZ + 2.3; // ~86.17 (clear of millHouse z=88.7..93.7)
    const wheelBedY = getGroundY(mx, wheelZ); // 1.15 on stream bed
    const wheel = new THREE.Group();
    wheel.name = 'millWheel';

    for (const sx of [-0.42, 0.42]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.62, 0.42), mats.mossStone);
      pier.position.set(sx, 0.81, 0);
      pier.castShadow = true;
      pier.receiveShadow = true;
      wheel.add(pier);
    }

    const rotor = new THREE.Group();
    rotor.position.y = 1.55;

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.07, 8, 22), mats.darkWood);
    rim.rotation.y = Math.PI / 2;
    rim.castShadow = true;
    rotor.add(rim);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.96, 10), mats.darkWood);
    hub.rotation.z = Math.PI / 2;
    rotor.add(hub);

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.9, 0.1), mats.cedar);
      spoke.rotation.x = ang;
      rotor.add(spoke);

      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.26), mats.cedar);
      paddle.position.set(0, Math.cos(ang) * 0.92, Math.sin(ang) * 0.92);
      paddle.rotation.x = ang;
      paddle.castShadow = true;
      rotor.add(paddle);
    }

    wheel.add(rotor);
    wheel.position.set(mx, wheelBedY, wheelZ);
    markReflect(wheel);
    this.group.add(wheel);
    this.millWheel = rotor;
    registerBoxCollider('millWheel', mx, wheelZ, 0.52, 1.25, wheelBedY, wheelBedY + 2.65);

    // Raised wooden aqueduct flume (kakehi) from Round 2 B feeding the wheel from the stream side
    const flume = new THREE.Group();
    flume.name = 'millFlume';
    const fx = mx - 2.3;
    const fz = wheelZ;
    const chute = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.26, 0.54), mats.cedar);
    chute.position.y = 2.75;
    chute.castShadow = true;
    const chuteStream = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.36), mats.troughPool);
    chuteStream.position.y = 2.86;
    for (const sx of [-0.95, 0.65]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.75, 0.14), mats.darkWood);
      leg.position.set(sx, 1.375, 0);
      leg.castShadow = true;
      flume.add(leg);
    }
    flume.add(chute, chuteStream);
    const fy = snapToGround(flume, fx, fz);
    markReflect(flume);
    this.group.add(flume);
    registerBoxCollider('millFlume', fx, fz, 1.3, 0.38, fy, fy + 2.95);

    // Rice straw bales & wooden barrels beside mill entrance (from Round 2 B)
    const barrels = new THREE.Group();
    barrels.name = 'millBarrels';
    const bx = mx + 4.4;
    const bz = mz + 0.2;
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.72, 10), mats.cedar);
    barrel1.position.set(0, 0.36, -0.35);
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.62, 10), mats.cedar);
    barrel2.position.set(0.35, 0.31, 0.32);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.75, 10), mats.riceStraw);
    straw.rotation.z = Math.PI / 2;
    straw.position.set(-0.15, 0.26, 0.45);
    [barrel1, barrel2, straw].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
    barrels.add(barrel1, barrel2, straw);
    const by = snapToGround(barrels, bx, bz);
    this.group.add(barrels);
    registerBoxCollider('millBarrels', bx, bz, 0.85, 0.85, by, by + 0.8);

    this._recordZone(mx, mz - 1.5, 8.5);
  }

  _buildValleyVillageAndProps(mats) {
    // 1. Roofed stone well (ido) at WELL_POS (12, 45)
    const wx = WELL_POS.x;
    const wz = WELL_POS.z;
    const wg = new THREE.Group();
    wg.name = 'stoneWell';

    const apron = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.52, 0.14, 14), mats.stone);
    apron.position.y = 0.07;
    apron.receiveShadow = true;
    wg.add(apron);

    const curb = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.78, 0.82, 14), mats.mossStone);
    curb.position.y = 0.48;
    curb.castShadow = true;
    curb.receiveShadow = true;
    wg.add(curb);

    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.56, 14).rotateX(-Math.PI / 2), mats.troughPool);
    pool.position.y = 0.90;
    wg.add(pool);

    for (const sx of [-0.68, 0.68]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.1, 0.14), mats.darkWood);
      post.position.set(sx, 1.4, 0);
      post.castShadow = true;
      wg.add(post);
    }

    const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.38, 8), mats.cedar);
    cross.rotation.z = Math.PI / 2;
    cross.position.y = 2.05;
    wg.add(cross);

    for (const side of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.09, 1.02), mats.cedar);
      roof.position.set(0, 2.55, side * 0.36);
      roof.rotation.x = side * 0.46;
      roof.castShadow = true;
      wg.add(roof);
    }

    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.34, 10), mats.cedar);
    bucket.position.set(0.95, 0.31, 0.35);
    bucket.castShadow = true;
    wg.add(bucket);

    const wy = snapToGround(wg, wx, wz);
    markReflect(wg);
    this.group.add(wg);
    registerCylCollider('stoneWell', wx, wz, 1.35, wy, wy + 2.8);
    this._recordZone(wx, wz, 3.0);

    // 2. Traditional 1980s rural houses & storehouse framing the path to the stone bridge
    const houses = [
      { name: 'villageHouseWest', x: -24, z: 48, ry: 0.22, width: 7.4, depth: 5.0, wallH: 2.6, hasEngawa: true, hasNoren: true },
      { name: 'villageHouseEast', x: 26, z: 65, ry: -0.35, width: 7.0, depth: 4.8, wallH: 2.55, hasEngawa: true, hasNoren: false },
    ];
    for (const h of houses) {
      const grp = buildRuralHouse(mats, h);
      grp.name = h.name;
      grp.rotation.y = h.ry;
      const gy = snapToGround(grp, h.x, h.z);
      markReflect(grp);
      this.group.add(grp);
      registerBoxCollider(h.name, h.x, h.z, 4.2, 3.3, gy, gy + 5.1);
      this._recordZone(h.x, h.z, 6.0);
    }

    // White-plaster kura storehouse beside villageHouseWest
    const kx = -35;
    const kz = 55;
    const kura = buildRuralHouse(mats, { width: 4.6, depth: 4.0, wallH: 3.1, hasEngawa: false, hasNoren: false, isKura: true });
    kura.name = 'kuraStorehouse';
    kura.rotation.y = 0.12;
    const ky = snapToGround(kura, kx, kz);
    markReflect(kura);
    this.group.add(kura);
    registerBoxCollider('kuraStorehouse', kx, kz, 2.8, 2.5, ky, ky + 5.3);
    this._recordZone(kx, kz, 4.5);

    // Timber farm shed beside villageHouseEast
    const sx = 35;
    const sz = 72;
    const shed = new THREE.Group();
    shed.name = 'villageShedEast';
    const sBase = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 3.4), mats.mossStone);
    sBase.position.y = 0.175;
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.1, 3.0), mats.cedar);
    sBody.position.y = 1.4;
    sBody.castShadow = true;
    const sRoof = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.14, 3.6), mats.kawara);
    sRoof.position.y = 2.58;
    sRoof.rotation.x = 0.14;
    sRoof.castShadow = true;
    shed.add(sBase, sBody, sRoof);
    shed.rotation.y = -0.2;
    const sy = snapToGround(shed, sx, sz);
    markReflect(shed);
    this.group.add(shed);
    registerBoxCollider('villageShedEast', sx, sz, 2.5, 2.0, sy, sy + 2.85);
    this._recordZone(sx, sz, 4.0);

    // 3. Wayside granite shrine (hokora) near north bridge path at (7, 82) (from Round 2 B)
    const shx = 7.0;
    const shz = 82;
    const shrine = new THREE.Group();
    shrine.name = 'waysideShrine';
    const shBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 1.05), mats.mossStone);
    shBase.position.y = 0.275;
    const shBody = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.72, 0.64), mats.cedar);
    shBody.position.y = 0.91;
    const shRoof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 4), mats.kawara);
    shRoof.rotation.y = Math.PI / 4;
    shRoof.position.y = 1.48;
    [shBase, shBody, shRoof].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
    shrine.add(shBase, shBody, shRoof);
    const shy = snapToGround(shrine, shx, shz);
    this.group.add(shrine);
    registerBoxCollider('waysideShrine', shx, shz, 0.65, 0.6, shy, shy + 1.8);
    this._recordZone(shx, shz, 2.4);

    // 4. Wooden rice-drying racks (hazakake) along south terrace edge (from Round 2 B)
    const buildRiceRack = (name, rx, rz, ry) => {
      const rg = new THREE.Group();
      rg.name = name;
      for (const ox of [-1.8, 1.8]) {
        for (const legS of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.75, 6), mats.darkWood);
          leg.position.set(ox, 0.85, legS * 0.28);
          leg.rotation.x = -legS * 0.28;
          leg.castShadow = true;
          rg.add(leg);
        }
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 6), mats.bamboo);
      bar.rotation.z = Math.PI / 2;
      bar.position.y = 1.55;
      rg.add(bar);
      for (let b = -1.5; b <= 1.5; b += 0.6) {
        const sheaf = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.85, 6), mats.riceStraw);
        sheaf.position.set(b, 1.16, 0);
        sheaf.castShadow = true;
        rg.add(sheaf);
      }
      rg.rotation.y = ry;
      const rgy = snapToGround(rg, rx, rz);
      this.group.add(rg);
      registerBoxCollider(name, rx, rz, 2.15, 0.6, rgy, rgy + 1.75);
      this._recordZone(rx, rz, 3.2);
    };
    buildRiceRack('riceRackWest', -14, 102, 0.05);
    buildRiceRack('riceRackEast', 18, 102, -0.06);

    // 5. Village broadleaf trees clearly spaced from houses
    const villageTrees = [
      { name: 'villageTreeWest', x: -16.5, z: 42.5, s: 1.0, seed: 41 },
      { name: 'villageTreeKura', x: -31.0, z: 63.0, s: 1.05, seed: 42 },
      { name: 'villageTreeEast', x: 18.5, z: 59.0, s: 0.95, seed: 43 },
      { name: 'villageTreeBridge', x: 7.8, z: 60.5, s: 1.02, seed: 44 },
    ];
    for (const vt of villageTrees) {
      const tree = buildBroadleafTree(mats, vt.seed, vt.s);
      tree.name = vt.name;
      const gy = snapToGround(tree, vt.x, vt.z);
      markReflect(tree);
      this.group.add(tree);
      registerCylCollider(vt.name, vt.x, vt.z, 0.65 * vt.s, gy, gy + 4.3 * vt.s);
      this._recordZone(vt.x, vt.z, 2.5 * vt.s);
    }

    // 6. Low vegetable garden furrows near villageHouseEast (nonsolid)
    const rowGeo = new THREE.BoxGeometry(4.8, 0.18, 0.42);
    const cropGeo = new THREE.ConeGeometry(0.14, 0.28, 5);
    const dummy = new THREE.Object3D();
    const furrows = new THREE.InstancedMesh(rowGeo, mats.mossStone, 4);
    furrows.name = 'villageGardenFurrows';
    furrows.userData.nonsolid = true;
    const crops = new THREE.InstancedMesh(cropGeo, mats.riceShoot, 24);
    crops.name = 'villageGardenCrops';
    crops.userData.nonsolid = true;
    let ci = 0;
    for (let r = 0; r < 4; r++) {
      const fx = 21.5;
      const fz = 73.5 + r * 1.1;
      const fy = getGroundY(fx, fz);
      dummy.position.set(fx, fy + 0.04, fz);
      dummy.rotation.set(0, -0.15, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      furrows.setMatrixAt(r, dummy.matrix);
      for (let c = 0; c < 6; c++) {
        const cx = fx - 1.9 + c * 0.76;
        const cz = fz + (cx - fx) * 0.15;
        dummy.position.set(cx, getGroundY(cx, cz) + 0.22, cz);
        dummy.rotation.set(0, c * 0.7, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        crops.setMatrixAt(ci++, dummy.matrix);
      }
    }
    furrows.instanceMatrix.needsUpdate = true;
    crops.instanceMatrix.needsUpdate = true;
    this.group.add(furrows, crops);
  }

  _buildStreamBankStones(mats) {
    const r = rng(616);
    // Solid river boulders along stream banks (from Round 2 B)
    const rockGeo = new THREE.DodecahedronGeometry(0.72, 1);
    const rockXList = [-46, -38, -8, 10, 18, 24, 42, 52, 6];
    for (let i = 0; i < rockXList.length; i++) {
      const rx = rockXList[i];
      const side = i % 2 === 0 ? -1 : 1;
      const rz = streamCenterZ(rx) + side * (5.2 + r() * 0.8);
      if (!this._isClear(rx, rz, 2.4)) continue;
      const s = 0.75 + r() * 0.48;
      const rock = new THREE.Mesh(rockGeo, mats.mossStone);
      rock.name = `riverRock_${i}`;
      rock.scale.set(1.22 * s, 0.72 * s, 1.0 * s);
      rock.rotation.set(r() * 0.12, r() * Math.PI, r() * 0.12);
      rock.castShadow = true;
      rock.receiveShadow = true;
      const gy = snapToGround(rock, rx, rz);
      this.group.add(rock);
      registerCylCollider(rock.name, rx, rz, 0.88 * s, gy, gy + 1.2 * s);
      this._recordZone(rx, rz, 1.6);
    }

    // Riverside reed tufts (nonsolid)
    const reedCount = this.low ? 60 : 120;
    const reedGeo = new THREE.ConeGeometry(0.04, 0.75, 3);
    reedGeo.translate(0, 0.375, 0);
    const reeds = new THREE.InstancedMesh(reedGeo, mats.bambooLeaf, reedCount);
    reeds.name = 'streamReeds';
    reeds.userData.nonsolid = true;
    const dummy = new THREE.Object3D();
    let placedReeds = 0;
    for (let i = 0; i < reedCount * 2 && placedReeds < reedCount; i++) {
      const x = (r() - 0.5) * 110;
      const side = i % 2 === 0 ? -1 : 1;
      const z = streamCenterZ(x) + side * (4.3 + r() * 1.3);
      if (Math.abs(x) < 3.5 || Math.abs(x + 14) < 3.0 || Math.abs(x - 32) < 3.0) continue;
      const gy = getGroundY(x, z);
      dummy.position.set(x, gy - 0.04, z);
      dummy.rotation.set((r() - 0.5) * 0.2, r() * Math.PI, (r() - 0.5) * 0.2);
      dummy.scale.setScalar(0.75 + r() * 0.6);
      dummy.updateMatrix();
      reeds.setMatrixAt(placedReeds++, dummy.matrix);
    }
    reeds.count = placedReeds;
    reeds.instanceMatrix.needsUpdate = true;
    this.group.add(reeds);
  }

  _buildBambooClearing(mats) {
    const r = rng(777);
    const bx = BAMBOO_POS.x;
    const bz = BAMBOO_POS.z;

    const bench = new THREE.Group();
    bench.name = 'bambooBench';
    const bTop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 0.64), mats.stone);
    bTop.position.y = 0.48;
    bTop.castShadow = true;
    bTop.receiveShadow = true;
    bench.add(bTop);
    for (const sx of [-0.72, 0.72]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.44, 0.54), mats.mossStone);
      leg.position.set(sx, 0.22, 0);
      leg.castShadow = true;
      bench.add(leg);
    }
    bench.rotation.y = -0.4;
    const by = snapToGround(bench, bx, bz);
    this.group.add(bench);
    registerBoxCollider('bambooBench', bx, bz, 1.15, 0.45, by, by + 0.65);

    const perClump = this.low ? 10 : 16;
    const stalkGeo = new THREE.CylinderGeometry(0.06, 0.085, 8.2, 6);
    stalkGeo.translate(0, 4.1, 0);
    const leafGeo = new THREE.DodecahedronGeometry(0.92, 0);
    leafGeo.scale(1.45, 0.45, 1.25);
    const dummy = new THREE.Object3D();

    const quadrants = [
      { name: 'bambooClumpWest', ox: -7.2, oz: 0.0, sx: 2.2, sz: 4.2 },
      { name: 'bambooClumpEast', ox: 7.2, oz: 0.0, sx: 2.2, sz: 4.2 },
      { name: 'bambooClumpNorth', ox: 0.0, oz: 7.2, sx: 4.2, sz: 2.2 },
      { name: 'bambooClumpSouth', ox: 0.0, oz: -7.2, sx: 4.2, sz: 2.2 },
    ];
    for (const q of quadrants) {
      const stalks = new THREE.InstancedMesh(stalkGeo, mats.bamboo, perClump);
      stalks.name = q.name;
      stalks.castShadow = true;
      const leaves = new THREE.InstancedMesh(leafGeo, mats.bambooLeaf, perClump);
      leaves.name = `${q.name}Canopy`;
      leaves.userData.nonsolid = true;

      for (let i = 0; i < perClump; i++) {
        const x = bx + q.ox + (r() - 0.5) * q.sx * 1.9;
        const z = bz + q.oz + (r() - 0.5) * q.sz * 1.9;
        const gy = getGroundY(x, z);
        const s = 0.8 + r() * 0.46;
        dummy.position.set(x, gy, z);
        dummy.rotation.set((r() - 0.5) * 0.06, r() * Math.PI * 2, (r() - 0.5) * 0.06);
        dummy.scale.set(1, s, 1);
        dummy.updateMatrix();
        stalks.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, gy + 6.9 * s, z);
        dummy.rotation.set(0, r() * Math.PI * 2, 0);
        dummy.scale.setScalar(0.85 + r() * 0.5);
        dummy.updateMatrix();
        leaves.setMatrixAt(i, dummy.matrix);
      }
      stalks.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      markReflect(stalks);
      this.group.add(stalks, leaves);
      registerBoxCollider(q.name, bx + q.ox, bz + q.oz, q.sx, q.sz, by, by + 8.5);
    }
    this._recordZone(bx, bz, 15.0);

    // Secondary bamboo grove pockets on valley flanks (solid, named, flat-padded)
    const stalkPocketGeo = new THREE.CylinderGeometry(0.055, 0.08, 6.4, 6);
    stalkPocketGeo.translate(0, 3.2, 0);
    const bambooSpots = [
      { x: 48, z: 66 },
      { x: 50, z: 102 },
      { x: -50, z: 108 },
    ];
    for (let b = 0; b < bambooSpots.length; b++) {
      const bs = bambooSpots[b];
      if (!this._isClear(bs.x, bs.z, 4.0)) continue;
      const bg = new THREE.Group();
      bg.name = `bambooGrove_${b}`;
      for (let s = 0; s < 6; s++) {
        const ox = (r() - 0.5) * 2.5;
        const oz = (r() - 0.5) * 2.5;
        const st = new THREE.Mesh(stalkPocketGeo, mats.bamboo);
        st.position.set(ox, 0, oz);
        st.castShadow = true;
        const lf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), mats.bambooLeaf);
        lf.scale.set(1.3, 0.5, 1.2);
        lf.position.set(ox, 5.8, oz);
        bg.add(st, lf);
      }
      const bgy = snapToGround(bg, bs.x, bs.z);
      markReflect(bg);
      this.group.add(bg);
      registerCylCollider(bg.name, bs.x, bs.z, 2.2, bgy, bgy + 6.6);
      this._recordZone(bs.x, bs.z, 3.5);
    }
  }

  _buildTerraceWallsAndRice(mats) {
    const stoneBlocks = [];
    const bermBlocks = [];
    const shootPositions = [];
    const r = rng(909);

    for (let t = 0; t < TERRACE_COUNT; t++) {
      for (let x = -58; x <= 44; x += 4.0) {
        const { z0, z1, waterY } = terraceZRange(x, t);
        stoneBlocks.push({ x, y: waterY - 0.65, z: z1 + 0.55, w: 3.96, h: 1.65 });
        bermBlocks.push({ x, y: waterY + 0.16, z: z1 - 0.35, w: 4.1, h: 0.42 });
        bermBlocks.push({ x, y: waterY + 0.16, z: z0 + 0.35, w: 4.1, h: 0.42 });
      }
      const rowStepZ = this.low ? 3.3 : 2.2;
      const colStepX = this.low ? 3.3 : 2.2;
      for (let x = -56; x <= 42; x += colStepX) {
        const { z0, z1, waterY } = terraceZRange(x, t);
        for (let z = z0 + 2.2; z <= z1 - 2.2; z += rowStepZ) {
          shootPositions.push({
            x: x + (r() - 0.5) * 0.16,
            y: waterY - 0.08,
            z: z + (r() - 0.5) * 0.16,
            s: 0.8 + r() * 0.42,
            ry: r() * Math.PI,
          });
        }
      }
    }

    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const walls = new THREE.InstancedMesh(wallGeo, mats.mossStone, stoneBlocks.length);
    walls.name = 'stoneWallTerrace';
    walls.userData.isTerraceWall = true;
    walls.userData.nonsolid = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < stoneBlocks.length; i++) {
      const b = stoneBlocks[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(b.w, b.h, 0.95);
      dummy.updateMatrix();
      walls.setMatrixAt(i, dummy.matrix);
    }
    walls.instanceMatrix.needsUpdate = true;
    walls.receiveShadow = true;
    markReflect(walls);
    this.group.add(walls);

    const berms = new THREE.InstancedMesh(wallGeo, mats.bermGrass, bermBlocks.length);
    berms.name = 'terraceBerms';
    berms.userData.nonsolid = true;
    for (let i = 0; i < bermBlocks.length; i++) {
      const b = bermBlocks[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(b.w, b.h, 1.75);
      dummy.updateMatrix();
      berms.setMatrixAt(i, dummy.matrix);
    }
    berms.instanceMatrix.needsUpdate = true;
    berms.receiveShadow = true;
    markReflect(berms);
    this.group.add(berms);

    const shootGeo = new THREE.ConeGeometry(0.11, 0.44, 4);
    shootGeo.translate(0, 0.22, 0);
    const shoots = new THREE.InstancedMesh(shootGeo, mats.riceShoot, shootPositions.length);
    shoots.name = 'riceSeedlings';
    shoots.userData.nonsolid = true;
    for (let i = 0; i < shootPositions.length; i++) {
      const p = shootPositions[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      shoots.setMatrixAt(i, dummy.matrix);
    }
    shoots.instanceMatrix.needsUpdate = true;
    this.group.add(shoots);
  }

  _buildHillsideCottagesAndTrees(mats) {
    const spots = [
      { name: 'valleyCottageWest', x: -68, z: 162, ry: 0.45 },
      { name: 'valleyCottageEast', x: 70, z: 220, ry: -0.5 },
      { name: 'valleyCottageNorth', x: -66, z: 268, ry: 0.35 },
    ];
    for (const s of spots) {
      const c = buildRuralHouse(mats, { width: 5.8, depth: 4.2, wallH: 2.3, hasEngawa: false, hasNoren: false });
      c.name = s.name;
      c.rotation.y = s.ry;
      const gy = snapToGround(c, s.x, s.z);
      markReflect(c);
      this.group.add(c);
      registerBoxCollider(s.name, s.x, s.z, 3.3, 2.6, gy, gy + 4.8);
      this._recordZone(s.x, s.z, 5.2);
    }

    // Individual named solid Satoyama cedar & broadleaf trees along valley floor & flanks
    const r = rng(515);
    const candidateTrees = [
      { x: -12, z: 42, kind: 'broad', s: 1.0 },
      { x: -42, z: 44, kind: 'cedar', s: 1.1 },
      { x: 38, z: 36, kind: 'cedar', s: 1.05 },
      { x: -13, z: 86, kind: 'broad', s: 0.95 },
      { x: -44, z: 82, kind: 'cedar', s: 1.15 },
      { x: 42, z: 82, kind: 'cedar', s: 1.08 },
      { x: -25, z: 103, kind: 'broad', s: 0.95 },
      { x: 33, z: 102, kind: 'broad', s: 1.0 },
    ];
    const extraCount = this.low ? 22 : 40;
    for (let i = 0; i < extraCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (56 + r() * 36);
      const z = 34 + r() * 290;
      candidateTrees.push({
        x,
        z,
        kind: i % 3 === 0 ? 'broad' : 'cedar',
        s: 1.0 + r() * 0.65,
      });
    }

    let cedarIdx = 0;
    let broadIdx = 0;
    for (const ct of candidateTrees) {
      if (Math.hypot(ct.x, ct.z) < 34) continue;
      if (Math.hypot(ct.x - GOAL_POS.x, ct.z - GOAL_POS.z) < 26) continue;
      if (Math.hypot(ct.x - 38, ct.z - 92) < 9.5) continue; // keep meadow landing pad open
      if (Math.abs(ct.z - streamCenterZ(ct.x)) < 6.8) continue;
      if (ct.x > -63 && ct.x < 47 && ct.z > 109 && ct.z < 285) continue;
      const rad = 2.1 * ct.s;
      if (!this._isClear(ct.x, ct.z, rad + 0.8)) continue;

      const isBroad = ct.kind === 'broad';
      const tree = isBroad ? buildBroadleafTree(mats, 300 + broadIdx, ct.s) : buildCedarTree(mats, 500 + cedarIdx, ct.s);
      tree.name = isBroad ? `valleyBroadleaf_${broadIdx++}` : `valleyCedar_${cedarIdx++}`;
      tree.rotation.y = r() * Math.PI * 2;
      const gy = snapToGround(tree, ct.x, ct.z);
      markReflect(tree);
      this.group.add(tree);

      registerCylCollider(tree.name, ct.x, ct.z, 0.72 * ct.s, gy, gy + 5.8 * ct.s);
      this._recordZone(ct.x, ct.z, rad);
    }
  }

  _buildLookoutSanctuary(mats) {
    const gx = GOAL_POS.x;
    const gy = GOAL_POS.y; // 44.0
    const gz = GOAL_POS.z; // 344

    // 1. Timber lookout platform at (0, 44.0, 346.2)
    const deck = new THREE.Group();
    deck.name = 'lookoutPlatform';

    const stoneBase = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.44, 4.8), mats.mossStone);
    stoneBase.position.y = 0.22;
    stoneBase.receiveShadow = true;
    deck.add(stoneBase);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.16, 4.4), mats.cedar);
    floor.position.y = 0.48;
    floor.castShadow = true;
    floor.receiveShadow = true;
    deck.add(floor);

    for (const sx of [-2.9, 0, 2.9]) {
      const postB = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), mats.darkWood);
      postB.position.set(sx, 1.0, 2.05);
      postB.castShadow = true;
      deck.add(postB);
    }
    const backRail = new THREE.Mesh(new THREE.BoxGeometry(5.96, 0.1, 0.1), mats.cedar);
    backRail.position.set(0, 1.48, 2.05);
    deck.add(backRail);

    for (const sx of [-2.9, 2.9]) {
      const postF = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), mats.darkWood);
      postF.position.set(sx, 1.0, -2.05);
      postF.castShadow = true;
      deck.add(postF);
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 4.2), mats.cedar);
      sideRail.position.set(sx, 1.48, 0);
      deck.add(sideRail);
    }

    snapToGround(deck, gx, gz + 2.2);
    markReflect(deck);
    this.group.add(deck);
    registerBoxCollider('lookoutPlatform', gx, gz + 2.2, 3.3, 2.4, gy, gy + 1.55);

    // Granite steps leading onto the south edge of lookout deck (nonsolid flush approach steps)
    const steps = new THREE.Group();
    steps.name = 'lookoutSteps';
    steps.userData.nonsolid = true;
    for (let s = 0; s < 2; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.55), mats.stone);
      step.position.set(0, 0.09 + s * 0.16, 0.55 - s * 0.45);
      step.receiveShadow = true;
      steps.add(step);
    }
    steps.position.set(gx, gy, gz - 0.65);
    this.group.add(steps);

    // 2. Open timber hilltop bell arbor (lookoutArbor) flanking west-south of deck
    const arbor = new THREE.Group();
    arbor.name = 'lookoutArbor';
    const aBase = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 3.0), mats.mossStone);
    aBase.position.y = 0.14;
    aBase.receiveShadow = true;
    arbor.add(aBase);
    for (const sx of [-1.35, 1.35]) {
      for (const sz of [-1.15, 1.15]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.75, 0.18), mats.darkWood);
        post.position.set(sx, 1.55, sz);
        post.castShadow = true;
        arbor.add(post);
      }
    }
    const aRoof = new THREE.Mesh(new THREE.ConeGeometry(2.65, 1.25, 4), mats.kawara);
    aRoof.rotation.y = Math.PI / 4;
    aRoof.position.y = 3.52;
    aRoof.castShadow = true;
    arbor.add(aRoof);

    const bellPivot = new THREE.Group();
    bellPivot.position.set(0, 2.85, 0);
    const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.45, 12), mats.brass);
    bellBody.position.y = -0.32;
    const bellRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.04), mats.indigo);
    bellRibbon.position.y = -0.78;
    bellPivot.add(bellBody, bellRibbon);
    arbor.add(bellPivot);
    this.lookoutBell = bellPivot;

    snapToGround(arbor, gx - 7.4, gz + 1.2);
    markReflect(arbor);
    this.group.add(arbor);
    registerBoxCollider('lookoutArbor', gx - 7.4, gz + 1.2, 1.85, 1.65, gy, gy + 4.2);

    // 3. Weathervane Tower at (5.0, 44.0, 345.8) — gleaming yamabuki-gold rooster & indigo pennant
    const tower = new THREE.Group();
    tower.name = 'weathervaneTower';

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.94, 0.9, 8), mats.mossStone);
    plinth.position.y = 0.45;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    tower.add(plinth);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 6.0, 10), mats.darkWood);
    mast.position.y = 3.8;
    mast.castShadow = true;
    tower.add(mast);

    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.08), mats.cedar);
    cross.position.y = 5.6;
    tower.add(cross);

    const vane = new THREE.Group();
    vane.position.y = 6.95;
    vane.scale.setScalar(1.06);

    const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 8), mats.yamabuki);
    arrowShaft.rotation.z = Math.PI / 2;
    vane.add(arrowShaft);

    const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.58, 6), mats.yamabuki);
    arrowHead.rotation.z = -Math.PI / 2;
    arrowHead.position.x = 1.25;
    vane.add(arrowHead);

    const roosterBody = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 10), mats.yamabuki);
    roosterBody.scale.set(1.32, 0.9, 0.5);
    roosterBody.position.set(0.05, 0.34, 0);
    vane.add(roosterBody);

    const roosterNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.6, 8), mats.yamabuki);
    roosterNeck.position.set(0.52, 0.72, 0);
    roosterNeck.rotation.z = -0.35;
    vane.add(roosterNeck);

    const roosterHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mats.yamabuki);
    roosterHead.position.set(0.68, 1.02, 0);
    vane.add(roosterHead);

    const roosterTail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 5), mats.yamabuki);
    roosterTail.position.set(-0.58, 0.68, 0);
    roosterTail.rotation.z = 0.85;
    vane.add(roosterTail);

    const penGeo = new THREE.PlaneGeometry(1.75, 0.42, 6, 2);
    penGeo.translate(-0.9, 0, 0);
    const pennant = new THREE.Mesh(penGeo, mats.indigo);
    pennant.position.set(-0.1, -0.75, 0);
    pennant.userData.basePos = penGeo.attributes.position.array.slice();
    vane.add(pennant);
    this.pennant = pennant;

    tower.add(vane);
    this.vanePivot = vane;

    snapToGround(tower, gx + 5.4, gz + 1.8);
    markReflect(tower);
    this.group.add(tower);
    registerCylCollider('weathervaneTower', gx + 5.4, gz + 1.8, 0.95, gy, gy + 8.5);

    // 4. Stone bench & stone lantern beside deck (clear of arbor's overhanging roof)
    const bench = new THREE.Group();
    bench.name = 'lookoutBench';
    const bSeat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 0.62), mats.stone);
    bSeat.position.y = 0.46;
    bSeat.castShadow = true;
    bench.add(bSeat);
    for (const sx of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.5), mats.mossStone);
      leg.position.set(sx, 0.21, 0);
      bench.add(leg);
    }
    bench.rotation.y = 0.35;
    snapToGround(bench, gx - 5.2, gz + 6.2);
    this.group.add(bench);
    registerBoxCollider('lookoutBench', gx - 5.2, gz + 6.2, 1.05, 0.45, gy, gy + 0.6);

    const lLantern = new THREE.Group();
    lLantern.name = 'lookoutLantern';
    const llBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.88, 8), mats.stone);
    llBase.position.y = 0.44;
    const llBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.38), mats.stone);
    llBox.position.y = 1.04;
    const llGlow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), mats.shoji);
    llGlow.position.y = 1.04;
    const llCap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.28, 6), mats.mossStone);
    llCap.position.y = 1.35;
    lLantern.add(llBase, llBox, llGlow, llCap);
    snapToGround(lLantern, gx + 4.8, gz - 1.6);
    this.group.add(lLantern);
    registerCylCollider('lookoutLantern', gx + 4.8, gz - 1.6, 0.45, gy, gy + 1.5);

    // 5. Framing trees flanking the outer edges (leaving the central valley vista completely open!)
    const hillTrees = [
      { name: 'lookoutTreeWest', x: gx - 13.8, z: gz + 2.5, s: 1.05, seed: 81, broad: true },
      { name: 'lookoutTreeNorthWest', x: gx - 14.0, z: gz + 10.5, s: 1.05, seed: 82, broad: false },
      { name: 'lookoutTreeEast', x: gx + 12.4, z: gz + 2.5, s: 1.02, seed: 83, broad: false },
      { name: 'lookoutTreeNorthEast', x: gx + 13.5, z: gz + 10.5, s: 1.05, seed: 84, broad: true },
    ];
    for (const ht of hillTrees) {
      const tree = ht.broad ? buildBroadleafTree(mats, ht.seed, ht.s) : buildCedarTree(mats, ht.seed, ht.s);
      tree.name = ht.name;
      const hty = snapToGround(tree, ht.x, ht.z);
      markReflect(tree);
      this.group.add(tree);
      registerCylCollider(ht.name, ht.x, ht.z, 0.68 * ht.s, hty, hty + 4.6 * ht.s);
    }

    // 6. Grounded yamabuki flowering shrubs around the lookout plateau (nonsolid)
    const r = rng(888);
    const bushSpots = [
      [gx - 4.4, gz - 1.2], [gx + 6.8, gz + 0.4], [gx + 6.8, gz + 5.0],
      [gx - 8.2, gz + 5.2], [gx + 1.8, gz + 6.2], [gx - 3.6, gz + 6.0],
    ];
    for (let i = 0; i < bushSpots.length; i++) {
      const [fx, fz] = bushSpots[i];
      const fgy = getGroundY(fx, fz);
      const sh = new THREE.Group();
      sh.name = `lookoutFlowerBush_${i}`;
      sh.userData.nonsolid = true;
      const bsh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.44, 0), mats.broadleafA);
      bsh.scale.set(1.2, 0.7, 1.15);
      bsh.position.y = 0.24;
      sh.add(bsh);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2 + r();
        const fl = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), mats.yamabuki);
        fl.position.set(Math.cos(ang) * 0.28, 0.4 + (k % 2) * 0.08, Math.sin(ang) * 0.26);
        sh.add(fl);
      }
      sh.position.set(fx, fgy, fz);
      this.group.add(sh);
    }
  }

  lookoutStandSpot() {
    return new THREE.Vector3(GOAL_POS.x - 0.4, GOAL_POS.y + 0.56, GOAL_POS.z + 1.9);
  }

  planeLandSpot() {
    return new THREE.Vector3(GOAL_POS.x - 1.0, GOAL_POS.y, GOAL_POS.z + 7.2);
  }

  update(dt, t) {
    if (this.millWheel) {
      this.millWheel.rotation.x -= dt * 0.72;
    }
    if (this.vanePivot) {
      this.vanePivot.rotation.y = -0.35 + Math.sin(t * 0.35) * 0.25 + t * 0.04;
    }
    if (this.lookoutBell) {
      this.lookoutBell.rotation.z = Math.sin(t * 1.9) * 0.08;
    }
    if (this.pennant) {
      const pos = this.pennant.geometry.attributes.position;
      const base = this.pennant.userData.basePos;
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3];
        const dist = Math.max(0, -bx);
        pos.setZ(i, Math.sin(t * 5.2 + bx * 3.4) * 0.14 * dist);
      }
      pos.needsUpdate = true;
    }
  }
}
