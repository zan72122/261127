import * as THREE from '../../lib/three.module.js';
import {
  LODGE_POS,
  PALETTE,
  PIER_POS,
  WATERFALL_POS,
  WATER_Y,
  shared,
} from '../core/env.js';
import { rng } from '../core/math.js';
import { channelCenterX, channelHalfWidth, getGroundY } from './terrain.js';

function mergeBufferGeos(parts) {
  let totalVerts = 0;
  let hasColors = false;
  const normalized = [];

  for (const part of parts) {
    const src = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    if (part.matrix) src.applyMatrix4(part.matrix);
    const pos = src.attributes.position;
    if (!src.attributes.normal) src.computeVertexNormals();
    totalVerts += pos.count;
    if (part.color) hasColors = true;
    normalized.push({ geo: src, color: part.color ? new THREE.Color(part.color) : null });
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = hasColors ? new Float32Array(totalVerts * 3) : null;

  let offset = 0;
  for (const { geo, color } of normalized) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    positions.set(pos.array, offset * 3);
    normals.set(norm.array, offset * 3);
    if (colors) {
      const r = color ? color.r : 1;
      const g = color ? color.g : 1;
      const b = color ? color.b : 1;
      for (let i = 0; i < pos.count; i++) {
        const idx = (offset + i) * 3;
        colors[idx] = r;
        colors[idx + 1] = g;
        colors[idx + 2] = b;
      }
    }
    offset += pos.count;
    geo.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colors) out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

function makeMaterials() {
  return {
    cedarWall: new THREE.MeshStandardMaterial({ color: '#7c4e32', roughness: 0.88 }),
    neighborWall: new THREE.MeshStandardMaterial({ color: '#2b523b', roughness: 0.86 }),
    shedWall: new THREE.MeshStandardMaterial({ color: '#614a3a', roughness: 0.92 }),
    logWall: new THREE.MeshStandardMaterial({ color: '#6b472d', roughness: 0.9 }),
    ivoryTrim: new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.72 }),
    siennaRoof: new THREE.MeshStandardMaterial({ color: PALETTE.burntSienna, roughness: 0.82 }),
    slateRoof: new THREE.MeshStandardMaterial({ color: '#34414f', roughness: 0.84 }),
    ivoryRoof: new THREE.MeshStandardMaterial({ color: '#efe6d0', roughness: 0.65 }),
    darkTimber: new THREE.MeshStandardMaterial({ color: PALETTE.darkTimber, roughness: 0.9 }),
    deckPlank: new THREE.MeshStandardMaterial({ color: '#7a593e', roughness: 0.88 }),
    stone: new THREE.MeshStandardMaterial({ color: '#5c626b', roughness: 0.92 }),
    cableSteel: new THREE.MeshStandardMaterial({ color: '#39424d', roughness: 0.48, metalness: 0.6 }),
    windowGlow: new THREE.MeshStandardMaterial({
      color: '#ffdf9e',
      emissive: '#f4a942',
      emissiveIntensity: 0.95,
      roughness: 0.3,
    }),
    lanternGlow: new THREE.MeshStandardMaterial({
      color: '#ffe5ad',
      emissive: '#f6b85c',
      emissiveIntensity: 1.55,
      roughness: 0.2,
    }),
    bark: new THREE.MeshStandardMaterial({ color: '#4d392b', roughness: 0.94 }),
    pineFoliage: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
    mapleFoliage: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    bloomFoliage: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }),
    canoeCedar: new THREE.MeshStandardMaterial({ color: '#9c562c', roughness: 0.56, side: THREE.DoubleSide }),
    canoeGunwale: new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.65 }),
    boatHull: new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.68, side: THREE.DoubleSide }),
    boatTrim: new THREE.MeshStandardMaterial({ color: PALETTE.pineMid, roughness: 0.72 }),
    rock: new THREE.MeshStandardMaterial({ color: '#5c6470', roughness: 0.92 }),
    rope: new THREE.MeshStandardMaterial({ color: '#c4a97d', roughness: 0.9 }),
  };
}

function freezeStatic(obj) {
  obj.traverse((c) => {
    c.matrixAutoUpdate = false;
    c.updateMatrix();
  });
}

function makeOpenBoatHullGeometry(length, beam, depth) {
  const segZ = 14;
  const segU = 8;
  const positions = [];
  const indices = [];

  for (let iz = 0; iz <= segZ; iz++) {
    const v = iz / segZ;
    const z = (v - 0.5) * length;
    const widthProfile = Math.sin(v * Math.PI);
    const halfW = Math.max(0.02, widthProfile * beam * 0.5);
    const sheerY = depth * (1.0 + 0.18 * Math.pow(Math.abs(v - 0.5) * 2, 2));

    for (let iu = 0; iu <= segU; iu++) {
      const s = (iu / segU) * 2 - 1;
      const x = s * halfW;
      const y = Math.pow(Math.abs(s), 1.75) * sheerY;
      positions.push(x, y, z);
    }
  }

  const row = segU + 1;
  for (let iz = 0; iz < segZ; iz++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iz * row + iu;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeOpenBoat({ length, beam, depth, hullMat, gunwaleMat, seatMat }) {
  const g = new THREE.Group();
  const hullGeo = makeOpenBoatHullGeometry(length, beam, depth);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  g.add(hull);

  // Merge both curved wooden gunwale rails into 1 draw call
  const railParts = [];
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const v = i / 12;
      const z = (v - 0.5) * length;
      const halfW = Math.max(0.02, Math.sin(v * Math.PI) * beam * 0.5);
      const sheerY = depth * (1.0 + 0.18 * Math.pow(Math.abs(v - 0.5) * 2, 2));
      pts.push(new THREE.Vector3(sx * halfW, sheerY, z));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.036, 6, false);
    railParts.push({ geo: tube });
  }
  const railMesh = new THREE.Mesh(mergeBufferGeos(railParts), gunwaleMat);
  railParts.forEach((p) => p.geo.dispose());
  railMesh.castShadow = true;
  g.add(railMesh);

  // Merge floorboards & cross thwarts into 1 draw call
  const box1 = new THREE.BoxGeometry(1, 1, 1);
  const seatParts = [{ geo: box1, matrix: mtx(0, 0.08, 0, 0, 0, 0, beam * 0.36, 0.04, length * 0.52) }];
  for (const fz of [-0.2, 0.2]) {
    const w = Math.sin((fz + 0.5) * Math.PI) * beam * 0.72;
    seatParts.push({ geo: box1, matrix: mtx(0, depth * 0.62, fz * length, 0, 0, 0, w, 0.05, 0.22) });
  }
  const seatMesh = new THREE.Mesh(mergeBufferGeos(seatParts), seatMat);
  seatMesh.castShadow = true;
  g.add(seatMesh);
  box1.dispose();
  return g;
}

function addCabin({ name, x, z, rotY = 0, w = 5.6, h = 2.9, d = 4.6, wallMat, roofMat, m, withFlowerbox = false }) {
  const g = new THREE.Group();
  g.name = name;
  const gy = getGroundY(x, z);
  g.position.set(x, gy - 0.04, z);
  g.rotation.y = rotY;

  const box1 = new THREE.BoxGeometry(1, 1, 1);
  const roofH = 1.68;
  const pitchLen = Math.hypot(w * 0.57, roofH);
  const angle = Math.atan2(roofH, w * 0.5);

  // 1. Merged Stone Plinth + Chimney + Chimney Cap
  const stoneGeo = mergeBufferGeos([
    { geo: box1, matrix: mtx(0, 0.2, 0, 0, 0, 0, w + 0.24, 0.4, d + 0.24) },
    { geo: box1, matrix: mtx(w * 0.28, 0.35 + h + roofH * 0.65, -d * 0.22, 0, 0, 0, 0.64, 2.0, 0.64) },
    { geo: box1, matrix: mtx(w * 0.28, 0.35 + h + roofH * 0.65 + 1.02, -d * 0.22, 0, 0, 0, 0.76, 0.12, 0.76) },
  ]);
  const stoneMesh = new THREE.Mesh(stoneGeo, m.stone);
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  g.add(stoneMesh);

  // 2. Merged Walls + Gable prism (+ optional flowerboxes)
  const gableGeo = new THREE.ConeGeometry(w * 0.5, roofH, 4);
  gableGeo.rotateY(Math.PI / 4);
  gableGeo.scale(1.0, 1.0, d / (w * 0.707));
  const wallParts = [
    { geo: box1, matrix: mtx(0, 0.34 + h * 0.5, 0, 0, 0, 0, w, h, d) },
    { geo: gableGeo, matrix: mtx(0, 0.34 + h + roofH * 0.46, 0) },
  ];
  if (withFlowerbox) {
    for (const sx of [-1, 1]) {
      wallParts.push({
        geo: box1,
        matrix: mtx(sx * w * 0.29, 0.34 + h * 0.54 - 0.56, d * 0.5 + 0.14, 0, 0, 0, 1.04, 0.2, 0.28),
      });
    }
  }
  const wallGeo = mergeBufferGeos(wallParts);
  gableGeo.dispose();
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  g.add(wallMesh);

  // 3. Merged Gable Roof Slabs + Covered Porch Awning
  const roofGeo = mergeBufferGeos([
    { geo: box1, matrix: mtx(-w * 0.26, 0.34 + h + roofH * 0.48, 0, 0, 0, angle, pitchLen, 0.18, d + 0.74) },
    { geo: box1, matrix: mtx(w * 0.26, 0.34 + h + roofH * 0.48, 0, 0, 0, -angle, pitchLen, 0.18, d + 0.74) },
    { geo: box1, matrix: mtx(0, 2.46, d * 0.5 + 0.54, 0.22, 0, 0, 2.45, 0.12, 1.12) },
  ]);
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  g.add(roofMesh);

  // 4. Door + Porch Deck
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.92, 0.14), m.darkTimber);
  door.position.set(0, 0.34 + 0.96, d * 0.5 + 0.04);
  g.add(door);

  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.24, 1.04), m.deckPlank);
  porch.position.set(0, 0.16, d * 0.5 + 0.52);
  porch.receiveShadow = true;
  g.add(porch);

  // 5. Merged Ivory Trim: Porch Posts + Window Frames + Window Cross-Mullions
  const trimParts = [
    { geo: box1, matrix: mtx(-1.02, 1.32, d * 0.5 + 0.94, 0, 0, 0, 0.11, 2.2, 0.11) },
    { geo: box1, matrix: mtx(1.02, 1.32, d * 0.5 + 0.94, 0, 0, 0, 0.11, 2.2, 0.11) },
  ];
  const glowParts = [];
  for (const sx of [-1, 1]) {
    const wx = sx * w * 0.29;
    const wy = 0.34 + h * 0.54;
    const wz = d * 0.5;
    trimParts.push(
      { geo: box1, matrix: mtx(wx, wy, wz + 0.02, 0, 0, 0, 1.02, 1.02, 0.08) },
      { geo: box1, matrix: mtx(wx, wy, wz + 0.06, 0, 0, 0, 0.06, 0.88, 0.14) },
      { geo: box1, matrix: mtx(wx, wy, wz + 0.06, 0, 0, 0, 0.88, 0.06, 0.14) }
    );
    glowParts.push({ geo: box1, matrix: mtx(wx, wy, wz + 0.05, 0, 0, 0, 0.86, 0.86, 0.12) });
  }
  const trimMesh = new THREE.Mesh(mergeBufferGeos(trimParts), m.ivoryTrim);
  trimMesh.castShadow = true;
  g.add(trimMesh);
  g.add(new THREE.Mesh(mergeBufferGeos(glowParts), m.windowGlow));

  // 6. Optional autumn flowerbox blooms
  if (withFlowerbox) {
    const bloomUnit = new THREE.DodecahedronGeometry(0.09, 0);
    const bloomParts = [];
    for (const sx of [-1, 1]) {
      const wx = sx * w * 0.29;
      const wy = 0.34 + h * 0.54;
      const wz = d * 0.5;
      for (let bi = -1; bi <= 1; bi++) {
        bloomParts.push({
          geo: bloomUnit,
          matrix: mtx(wx + bi * 0.28, wy - 0.42, wz + 0.16),
          color: bi === 0 ? PALETTE.mapleGold : PALETTE.mapleBright,
        });
      }
    }
    g.add(new THREE.Mesh(mergeBufferGeos(bloomParts), m.bloomFoliage));
    bloomUnit.dispose();
  }

  box1.dispose();
  freezeStatic(g);
  return g;
}

function addPier({
  name,
  cx,
  cz,
  width,
  length,
  rotY = 0,
  deckY = 0.65,
  m,
  withLantern = true,
  twinLakeLanterns = false,
  withDetails = false,
}) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(cx, 0, cz);
  g.rotation.y = rotY;

  const box1 = new THREE.BoxGeometry(1, 1, 1);
  const cyl1 = new THREE.CylinderGeometry(1, 1, 1, 8);

  // Merge all planks into 1 mesh
  const plankParts = [];
  const plankCount = Math.max(8, Math.round(length / 0.64));
  const plankStep = length / plankCount;
  for (let i = 0; i < plankCount; i++) {
    plankParts.push({
      geo: box1,
      matrix: mtx(0, deckY - 0.06, -length * 0.5 + (i + 0.5) * plankStep, 0, 0, 0, width, 0.12, plankStep * 0.85),
    });
  }
  const plankMesh = new THREE.Mesh(mergeBufferGeos(plankParts), m.deckPlank);
  plankMesh.castShadow = true;
  plankMesh.receiveShadow = true;
  g.add(plankMesh);

  // Merge stringers, pilings, and lantern posts into 1 timber mesh
  const timberParts = [
    { geo: box1, matrix: mtx(-width * 0.44, deckY - 0.16, 0, 0, 0, 0, 0.18, 0.18, length) },
    { geo: box1, matrix: mtx(width * 0.44, deckY - 0.16, 0, 0, 0, 0, 0.18, 0.18, length) },
  ];
  const pilings = Math.max(3, Math.round(length / 4.2) + 1);
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  for (let i = 0; i < pilings; i++) {
    const lz = -length * 0.45 + (i / (pilings - 1)) * length * 0.9;
    for (const lx of [-width * 0.42, width * 0.42]) {
      const wx = cx + lx * cosR + lz * sinR;
      const wz = cz - lx * sinR + lz * cosR;
      const bedY = Math.min(deckY - 0.4, getGroundY(wx, wz) - 0.08);
      const topY = i === pilings - 1 || i === 0 ? deckY + 0.46 : deckY - 0.05;
      const h = Math.max(0.5, topY - bedY);
      timberParts.push({
        geo: cyl1,
        matrix: mtx(lx, bedY + h * 0.5, lz, 0, 0, 0, 0.15, h, 0.15),
      });
    }
  }

  const lanternPositions = [];
  if (twinLakeLanterns) {
    lanternPositions.push(new THREE.Vector3(-width * 0.42, deckY, -length * 0.45));
    lanternPositions.push(new THREE.Vector3(width * 0.42, deckY, -length * 0.45));
  } else if (withLantern) {
    lanternPositions.push(new THREE.Vector3(width * 0.42, deckY, length * 0.45));
  }

  if (lanternPositions.length > 0) {
    const sphere1 = new THREE.SphereGeometry(0.16, 10, 8);
    const cone1 = new THREE.ConeGeometry(0.24, 0.14, 8);
    const globeParts = [];
    const capParts = [];
    for (const lp of lanternPositions) {
      timberParts.push({ geo: cyl1, matrix: mtx(lp.x, deckY + 0.75, lp.z, 0, 0, 0, 0.07, 1.5, 0.07) });
      globeParts.push({ geo: sphere1, matrix: mtx(lp.x, deckY + 1.55, lp.z) });
      capParts.push({ geo: cone1, matrix: mtx(lp.x, deckY + 1.72, lp.z) });
    }
    g.add(new THREE.Mesh(mergeBufferGeos(globeParts), m.lanternGlow));
    g.add(new THREE.Mesh(mergeBufferGeos(capParts), m.siennaRoof));
    sphere1.dispose();
    cone1.dispose();
  }

  if (withDetails) {
    const ropeZ = twinLakeLanterns ? -length * 0.34 : length * 0.35;
    const ropeCoil = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 6, 14), m.rope);
    ropeCoil.rotation.x = Math.PI / 2;
    ropeCoil.position.set(-width * 0.28, deckY + 0.04, ropeZ);
    g.add(ropeCoil);

    const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.44), m.cableSteel);
    cleat.position.set(width * 0.35, deckY + 0.06, ropeZ * 0.85);
    g.add(cleat);
  }

  const timberMesh = new THREE.Mesh(mergeBufferGeos(timberParts), m.darkTimber);
  timberMesh.castShadow = true;
  g.add(timberMesh);

  box1.dispose();
  cyl1.dispose();
  freezeStatic(g);
  return { pier: g, lanternPositions };
}

// Pre-built shared Maple & Pine templates (2 draw calls per tree, organic sculpted forms)
function createTreeTemplates() {
  const mapleTemplates = [];
  const pineTemplates = [];
  const maplePalette = [PALETTE.mapleBright, PALETTE.mapleDeep, PALETTE.mapleGold, '#c85a24'];
  const pinePalette = [PALETTE.pineDark, PALETTE.pineMid, '#295039'];

  for (let v = 0; v < 3; v++) {
    const rand = rng(700 + v * 97);

    // Maple trunk + 3 upper branches
    const trunkH = 2.4 + rand() * 0.5;
    const cyl = new THREE.CylinderGeometry(0.12, 0.25, 1, 8);
    const trunkParts = [{ geo: cyl, matrix: mtx(0, trunkH * 0.5, 0, 0, 0, 0, 1, trunkH, 1) }];
    for (let b = 0; b < 3; b++) {
      const ang = (b * Math.PI * 2) / 3 + rand() * 0.6;
      trunkParts.push({
        geo: cyl,
        matrix: mtx(
          Math.cos(ang) * 0.35,
          trunkH * 0.92,
          Math.sin(ang) * 0.35,
          Math.sin(ang) * 0.45,
          0,
          -Math.cos(ang) * 0.45,
          0.48,
          1.15,
          0.48
        ),
      });
    }
    const trunkGeo = mergeBufferGeos(trunkParts);
    cyl.dispose();

    // Sculpted multi-lobe leaf clusters (subdivided dodecahedron with gentle organic variation)
    const leafUnit = new THREE.DodecahedronGeometry(1.0, 1);
    const lPos = leafUnit.attributes.position;
    for (let i = 0; i < lPos.count; i++) {
      const vx = lPos.getX(i);
      const vy = lPos.getY(i);
      const vz = lPos.getZ(i);
      const wobble = 0.88 + 0.22 * Math.sin(vx * 3.7 + vy * 2.9 - vz * 3.1);
      lPos.setXYZ(i, vx * wobble, vy * (0.85 + 0.18 * Math.cos(vz * 4.1)), vz * wobble);
    }
    leafUnit.computeVertexNormals();

    const crownParts = [];
    const clusterOffsets = [
      { x: 0, y: trunkH + 0.95, z: 0, sx: 1.55, sy: 0.85, sz: 1.55 },
      { x: -0.92, y: trunkH + 0.45, z: 0.48, sx: 1.15, sy: 0.72, sz: 1.12 },
      { x: 0.95, y: trunkH + 0.52, z: -0.35, sx: 1.18, sy: 0.74, sz: 1.15 },
      { x: 0.15, y: trunkH + 0.58, z: 0.88, sx: 1.05, sy: 0.68, sz: 1.05 },
      { x: -0.25, y: trunkH + 0.62, z: -0.85, sx: 1.08, sy: 0.68, sz: 1.02 },
      { x: 0.1, y: trunkH + 1.52, z: 0.12, sx: 1.02, sy: 0.66, sz: 1.02 },
    ];
    clusterOffsets.forEach((c, idx) => {
      crownParts.push({
        geo: leafUnit,
        matrix: mtx(
          c.x,
          c.y,
          c.z,
          (rand() - 0.5) * 0.45,
          rand() * Math.PI,
          (rand() - 0.5) * 0.45,
          c.sx,
          c.sy,
          c.sz
        ),
        color: maplePalette[(idx + v) % maplePalette.length],
      });
    });
    const crownGeo = mergeBufferGeos(crownParts);
    leafUnit.dispose();
    mapleTemplates.push({ trunkGeo, crownGeo });

    // Pine trunk + 5-tier sculpted conifer boughs (9-segment natural cones)
    const pineH = 5.6 + rand() * 1.4;
    const pCyl = new THREE.CylinderGeometry(0.09, 0.24, pineH * 0.56, 8);
    pCyl.translate(0, pineH * 0.28, 0);
    const pTrunkGeo = mergeBufferGeos([{ geo: pCyl }]);
    pCyl.dispose();

    const coneUnit = new THREE.ConeGeometry(1, 1, 9);
    const pineParts = [];
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const rad = 1.72 - t * 1.08;
      const ch = 2.05 - t * 0.55;
      pineParts.push({
        geo: coneUnit,
        matrix: mtx(0, pineH * (0.31 + t * 0.55), 0, 0, rand() * Math.PI, 0, rad, ch, rad),
        color: pinePalette[(i + v) % pinePalette.length],
      });
    }
    const pCrownGeo = mergeBufferGeos(pineParts);
    coneUnit.dispose();
    pineTemplates.push({ trunkGeo: pTrunkGeo, crownGeo: pCrownGeo });
  }

  return { mapleTemplates, pineTemplates };
}

function makeTreeFromTemplate(isMaple, x, z, scale, yaw, template, m) {
  const g = new THREE.Group();
  g.name = isMaple ? 'treeMaple' : 'treePine';
  const gy = getGroundY(x, z);
  g.position.set(x, gy - 0.32, z);
  g.rotation.y = yaw;
  g.scale.setScalar(scale);

  const trunk = new THREE.Mesh(template.trunkGeo, m.bark);
  trunk.castShadow = true;
  g.add(trunk);

  const crown = new THREE.Mesh(template.crownGeo, isMaple ? m.mapleFoliage : m.pineFoliage);
  crown.castShadow = true;
  crown.receiveShadow = true;
  g.add(crown);

  freezeStatic(g);
  return g;
}

function makeRock(x, z, scale, seed, m) {
  const rand = rng(seed);
  const geo = new THREE.DodecahedronGeometry(scale, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const j = 0.85 + rand() * 0.3;
    pos.setXYZ(i, vx * j, vy * (0.72 + rand() * 0.24), vz * j);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m.rock);
  mesh.name = 'rockBoulder';
  const gy = getGroundY(x, z);
  // Seat rock at 34% radius above ground so rocks never float or read as buried
  mesh.position.set(x, gy + scale * 0.34, z);
  mesh.rotation.y = rand() * Math.PI * 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

export class FjordProps {
  constructor(collision, { low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'propsGroup';
    this.collision = collision;
    this.m = makeMaterials();
    this.templates = createTreeTemplates();
    this.animated = { boats: [], hostArms: [] };

    this._buildHomeArea();
    this._buildRouteLandmarks();
    this._buildLodgeGoal();
    this._buildForestsAndRocks(low);
    this._buildNonSolidGrass(low);
  }

  _register(obj, pad = 0) {
    this.group.add(obj);
    this.collision.addObjectBox(obj, pad);
    return obj;
  }

  _registerPier({ pier, lanternPositions }, deckY) {
    this.group.add(pier);
    pier.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(pier);
    // Sub-deck collider allows girl to walk freely on deck while seaplane floats stay clear
    this.collision.addBox(pier.name, b.min.x, b.max.x, b.min.y, deckY - 0.02, b.min.z, b.max.z);
    lanternPositions.forEach((lp, idx) => {
      const wp = lp.clone().applyMatrix4(pier.matrixWorld);
      this.collision.addBox(
        `${pier.name}Lantern${idx}`,
        wp.x - 0.24,
        wp.x + 0.24,
        deckY - 0.05,
        deckY + 1.85,
        wp.z - 0.24,
        wp.z + 0.24
      );
    });
    return pier;
  }

  _buildHomeArea() {
    const m = this.m;

    // 1. Girl's lakeside cabin (with porch awning, mullioned windows & flowerboxes)
    this._register(
      addCabin({
        name: 'houseCabin',
        x: -11.0,
        z: -5.2,
        rotY: 0.55,
        w: 5.8,
        h: 2.9,
        d: 4.6,
        wallMat: m.cedarWall,
        roofMat: m.siennaRoof,
        m,
        withFlowerbox: true,
      })
    );

    // 2. Neighbor's house (clearly visible left side of shore, clear of camera lens)
    this._register(
      addCabin({
        name: 'houseNeighbor',
        x: 15.0,
        z: -9.5,
        rotY: -0.32,
        w: 5.0,
        h: 2.7,
        d: 4.2,
        wallMat: m.neighborWall,
        roofMat: m.slateRoof,
        m,
        withFlowerbox: true,
      })
    );

    // 3. Boathouse / tool shed behind cabin
    this._register(
      addCabin({
        name: 'houseShed',
        x: -17.4,
        z: -13.2,
        rotY: 0.35,
        w: 3.4,
        h: 2.3,
        d: 3.6,
        wallMat: m.shedWall,
        roofMat: m.slateRoof,
        m,
      })
    );

    // 4. Firewood rack cleanly beside cabin
    const rack = new THREE.Group();
    rack.name = 'woodRack';
    const rgy = getGroundY(-4.2, -9.8);
    rack.position.set(-4.2, rgy - 0.02, -9.8);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 0.65), m.darkTimber);
    frame.position.y = 0.58;
    frame.castShadow = true;
    rack.add(frame);
    const logGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.7, 7);
    logGeo.rotateX(Math.PI / 2);
    const logParts = [];
    for (let row = 0; row < 3; row++) {
      for (let col = -2; col <= 2; col++) {
        logParts.push({ geo: logGeo, matrix: mtx(col * 0.25, 0.26 + row * 0.24, 0) });
      }
    }
    rack.add(new THREE.Mesh(mergeBufferGeos(logParts), m.cedarWall));
    logGeo.dispose();
    freezeStatic(rack);
    this._register(rack);

    // 5. Wordless postbox (maple emblem shape only, zero text/digits, clear of girl start)
    const postbox = new THREE.Group();
    postbox.name = 'postbox';
    postbox.position.set(-3.2, getGroundY(-3.2, -2.8) - 0.02, -2.8);
    const pbPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), m.darkTimber);
    pbPost.position.y = 0.55;
    pbPost.castShadow = true;
    postbox.add(pbPost);
    const pbBox = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.52), m.ivoryTrim);
    pbBox.position.y = 1.14;
    pbBox.castShadow = true;
    postbox.add(pbBox);
    const pbRoof = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.58), m.siennaRoof);
    pbRoof.position.y = 1.3;
    postbox.add(pbRoof);
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), m.siennaRoof);
    emblem.scale.set(0.4, 1, 1);
    emblem.position.set(0.19, 1.15, 0);
    postbox.add(emblem);
    freezeStatic(postbox);
    this._register(postbox);

    // 6. Wooden split-rail fences along yard edges
    const addFence = (name, x, z, len) => {
      const f = new THREE.Group();
      f.name = name;
      f.position.set(x, getGroundY(x, z) - 0.02, z);
      const box1 = new THREE.BoxGeometry(1, 1, 1);
      const postParts = [];
      for (let i = 0; i < 4; i++) {
        const px = -len * 0.5 + (i / 3) * len;
        postParts.push({ geo: box1, matrix: mtx(px, 0.46, 0, 0, 0, 0, 0.14, 0.92, 0.14) });
      }
      const postMesh = new THREE.Mesh(mergeBufferGeos(postParts), m.darkTimber);
      postMesh.castShadow = true;
      f.add(postMesh);

      const railGeo = mergeBufferGeos([
        { geo: box1, matrix: mtx(0, 0.35, 0, 0, 0, 0, len, 0.09, 0.08) },
        { geo: box1, matrix: mtx(0, 0.72, 0, 0, 0, 0, len, 0.09, 0.08) },
      ]);
      const railMesh = new THREE.Mesh(railGeo, m.deckPlank);
      railMesh.castShadow = true;
      f.add(railMesh);
      box1.dispose();
      freezeStatic(f);
      this._register(f);
    };
    addFence('fenceWood', -5.6, -0.2, 3.0);
    addFence('fenceWood', 7.8, -6.4, 5.8);

    // 7. Open-hull cedar canoe resting on shore chocks with wooden paddle
    const canoe = new THREE.Group();
    canoe.name = 'canoeShore';
    canoe.position.set(5.4, getGroundY(5.4, -2.2) - 0.01, -2.2);
    canoe.rotation.y = 0.52;
    for (const cz of [-0.92, 0.92]) {
      const chock = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.2, 0.18), m.darkTimber);
      chock.position.set(0, 0.1, cz);
      chock.castShadow = true;
      canoe.add(chock);
    }
    const canoeBody = makeOpenBoat({
      length: 3.7,
      beam: 0.88,
      depth: 0.42,
      hullMat: m.canoeCedar,
      gunwaleMat: m.canoeGunwale,
      seatMat: m.deckPlank,
    });
    canoeBody.position.y = 0.16;
    canoe.add(canoeBody);
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 1.55), m.ivoryTrim);
    paddle.position.set(0.08, 0.44, 0.1);
    paddle.rotation.y = 0.18;
    canoe.add(paddle);
    freezeStatic(canoe);
    this._register(canoe);

    // 8. Main wooden pier + travel satchel clue + coiled mooring rope & cleats
    const pierInfo = addPier({
      name: 'pierDock',
      cx: 0,
      cz: PIER_POS.z,
      width: 4.0,
      length: 19.6,
      deckY: 0.65,
      m,
      withLantern: true,
      withDetails: true,
    });
    const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.26), m.siennaRoof);
    satchel.position.set(1.3, 0.82, 6.2);
    satchel.rotation.y = -0.35;
    satchel.castShadow = true;
    satchel.matrixAutoUpdate = false;
    satchel.updateMatrix();
    pierInfo.pier.add(satchel);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.28), m.ivoryTrim);
    strap.position.set(1.3, 0.9, 6.2);
    strap.rotation.y = -0.35;
    strap.matrixAutoUpdate = false;
    strap.updateMatrix();
    pierInfo.pier.add(strap);
    this._registerPier(pierInfo, 0.65);

    // 9. Open-hull wooden rowboat gently floating beside pier with oars
    const boat = new THREE.Group();
    boat.name = 'boatMoored';
    boat.position.set(-4.8, WATER_Y - 0.02, 14.2);
    boat.rotation.y = 0.22;
    const rowHull = makeOpenBoat({
      length: 3.4,
      beam: 1.26,
      depth: 0.48,
      hullMat: m.boatHull,
      gunwaleMat: m.boatTrim,
      seatMat: m.deckPlank,
    });
    boat.add(rowHull);
    for (const sx of [-0.3, 0.3]) {
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.75, 6), m.deckPlank);
      oar.rotation.x = Math.PI / 2;
      oar.position.set(sx, 0.33, 0.15);
      boat.add(oar);
    }
    this.group.add(boat);
    this.collision.addObjectBox(boat, 0.2);
    this.animated.boats.push({ mesh: boat, baseY: WATER_Y - 0.02, phase: 0.3 });
  }

  _buildRouteLandmarks() {
    const m = this.m;

    // West Village Cove (log cabins & fishing pier)
    this._register(
      addCabin({
        name: 'houseLogCabin',
        x: -50.0,
        z: 105.0,
        rotY: Math.PI * 0.42,
        w: 5.4,
        h: 2.7,
        d: 4.2,
        wallMat: m.logWall,
        roofMat: m.siennaRoof,
        m,
      })
    );
    this._register(
      addCabin({
        name: 'houseLogCabin',
        x: -53.5,
        z: 115.0,
        rotY: Math.PI * 0.36,
        w: 4.8,
        h: 2.5,
        d: 3.9,
        wallMat: m.cedarWall,
        roofMat: m.slateRoof,
        m,
      })
    );
    this._registerPier(
      addPier({
        name: 'pierSide',
        cx: -35.0,
        cz: 108.0,
        width: 3.2,
        length: 11.2,
        rotY: Math.PI / 2,
        deckY: 0.65,
        m,
        withLantern: true,
        withDetails: true,
      }),
      0.65
    );

    // High Wooden Suspension Bridge spanning the autumn canyon narrows at z = 268
    // Split into separate grounded towers + deck so air beneath the span stays completely open
    const bz = 268;
    const span = 65.4;
    const deckY = 22.0;
    const box1 = new THREE.BoxGeometry(1, 1, 1);

    for (const [sideName, sx] of [['bridgeTowerL', -34.2], ['bridgeTowerR', 34.2]]) {
      const tower = new THREE.Group();
      tower.name = sideName;
      const minTowerGy = Math.min(
        getGroundY(sx, bz),
        getGroundY(sx - 1.5, bz - 2.0),
        getGroundY(sx + 1.5, bz - 2.0),
        getGroundY(sx - 1.5, bz + 2.0),
        getGroundY(sx + 1.5, bz + 2.0)
      );
      const topTowerY = deckY + 7.4;
      const pierTopY = Math.max(minTowerGy + 1.8, getGroundY(sx, bz) + 0.8);
      const pierH = pierTopY - (minTowerGy - 0.4);

      const stonePier = new THREE.Mesh(new THREE.BoxGeometry(2.5, pierH, 4.2), m.stone);
      stonePier.position.set(sx, minTowerGy - 0.4 + pierH * 0.5, bz);
      stonePier.castShadow = true;
      stonePier.receiveShadow = true;
      tower.add(stonePier);

      const legH = topTowerY - (pierTopY - 0.3);
      const timberParts = [];
      for (const sz of [-1.45, 1.45]) {
        timberParts.push({ geo: box1, matrix: mtx(sx, pierTopY - 0.3 + legH * 0.5, bz + sz, 0, 0, 0, 0.72, legH, 0.72) });
      }
      for (const cy of [deckY - 1.2, deckY + 3.2, deckY + 6.5]) {
        timberParts.push({ geo: box1, matrix: mtx(sx, cy, bz, 0, 0, 0, 0.8, 0.55, 3.8) });
      }
      const braceLen = Math.hypot(2.9, 6.0);
      timberParts.push({ geo: box1, matrix: mtx(sx, deckY - 4.0, bz, 0.44, 0, 0, 0.28, braceLen, 0.28) });
      const towerMesh = new THREE.Mesh(mergeBufferGeos(timberParts), m.darkTimber);
      towerMesh.castShadow = true;
      tower.add(towerMesh);

      freezeStatic(tower);
      this._register(tower);
    }

    const bridgeDeck = new THREE.Group();
    bridgeDeck.name = 'bridgeDeck';

    const deckParts = [];
    const postParts = [];
    const plankCount = 52;
    const stepX = span / plankCount;
    for (let i = 0; i < plankCount; i++) {
      const px = -span * 0.5 + (i + 0.5) * stepX;
      const sag = -Math.sin((i / (plankCount - 1)) * Math.PI) * 0.8;
      const py = deckY + sag;
      deckParts.push({ geo: box1, matrix: mtx(px, py, bz, 0, 0, 0, stepX * 0.88, 0.22, 3.2) });
      if (i % 3 === 0) {
        for (const sz of [-1.52, 1.52]) {
          postParts.push({ geo: box1, matrix: mtx(px, py + 0.58, bz + sz, 0, 0, 0, 0.14, 1.12, 0.14) });
        }
      }
    }
    const deckMesh = new THREE.Mesh(mergeBufferGeos(deckParts), m.deckPlank);
    deckMesh.castShadow = true;
    bridgeDeck.add(deckMesh);

    const cyl1 = new THREE.CylinderGeometry(1, 1, 1, 5);
    const steelParts = [];
    const railPtsL = [];
    const railPtsR = [];
    const curvePtsL = [];
    const curvePtsR = [];
    for (let i = 0; i <= 18; i++) {
      const u = i / 18;
      const px = -32.7 + u * 65.4;
      const sag = Math.sin(u * Math.PI);
      const deckSag = deckY - sag * 0.8;
      const cy = deckY + 6.5 - sag * 5.2;
      railPtsL.push(new THREE.Vector3(px, deckSag + 1.08, bz - 1.52));
      railPtsR.push(new THREE.Vector3(px, deckSag + 1.08, bz + 1.52));
      curvePtsL.push(new THREE.Vector3(px, cy, bz - 1.55));
      curvePtsR.push(new THREE.Vector3(px, cy, bz + 1.55));
      if (i > 0 && i < 18 && i % 2 === 0) {
        const hLen = cy - deckSag;
        for (const sz of [-1.52, 1.52]) {
          steelParts.push({ geo: cyl1, matrix: mtx(px, deckSag + hLen * 0.5, bz + sz, 0, 0, 0, 0.038, hLen, 0.038) });
        }
      }
    }
    const railTubeL = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPtsL), 20, 0.06, 5, false);
    const railTubeR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPtsR), 20, 0.06, 5, false);
    postParts.push({ geo: railTubeL }, { geo: railTubeR });
    bridgeDeck.add(new THREE.Mesh(mergeBufferGeos(postParts), m.darkTimber));

    const cableTubeL = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePtsL), 22, 0.088, 6, false);
    const cableTubeR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePtsR), 22, 0.088, 6, false);
    steelParts.push({ geo: cableTubeL }, { geo: cableTubeR });
    bridgeDeck.add(new THREE.Mesh(mergeBufferGeos(steelParts), m.cableSteel));

    box1.dispose();
    cyl1.dispose();
    railTubeL.dispose();
    railTubeR.dispose();
    cableTubeL.dispose();
    cableTubeR.dispose();

    freezeStatic(bridgeDeck);
    this.group.add(bridgeDeck);
    this.collision.addBox('bridgeDeck', -32.7, 32.7, deckY - 1.1, deckY + 1.6, bz - 1.9, bz + 1.9);

    // Canyon Waterfall Cliff Buttress (grounded granite shelf on East wall behind waterfall)
    const wfCliff = new THREE.Group();
    wfCliff.name = 'waterfallCliff';
    const wcx = WATERFALL_POS.x + 7.2;
    const wcz = WATERFALL_POS.z;
    const wGy = getGroundY(wcx, wcz);
    const cliffLedge = new THREE.Mesh(new THREE.BoxGeometry(8.5, 25.5, 11.5), m.rock);
    cliffLedge.position.set(wcx, Math.min(wGy, 0) + 12.2, wcz);
    cliffLedge.castShadow = true;
    cliffLedge.receiveShadow = true;
    wfCliff.add(cliffLedge);
    freezeStatic(wfCliff);
    this._register(wfCliff);

    // Canyon Waterfall (East wall near z = 286) — non-solid flowing water sheet + base splash foam
    const wfGroup = new THREE.Group();
    wfGroup.name = 'waterfall';
    wfGroup.userData.fx = true;
    wfGroup.userData.nonsolid = true;
    const wfMat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float flow = fract(vUv.y * 5.0 + uTime * 2.2);
          float streak = sin(vUv.x * 26.0 + hash(vec2(floor(vUv.x * 18.0), 1.0)) * 6.28) * 0.5 + 0.5;
          float foam = smoothstep(0.15, 0.9, streak * 0.65 + sin(flow * 6.283) * 0.35);
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 col = mix(vec3(0.66, 0.84, 0.95), vec3(0.96, 0.98, 1.0), foam);
          float alpha = (0.55 + foam * 0.35) * edge;
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const wfMesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 24.5), wfMat);
    wfMesh.position.set(WATERFALL_POS.x + 2.4, 12.0, WATERFALL_POS.z);
    wfMesh.rotation.y = -Math.PI / 2;
    wfMesh.rotation.z = 0.08;
    wfMesh.userData.fx = true;
    wfMesh.userData.nonsolid = true;
    wfGroup.add(wfMesh);

    const splashDisk = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 18),
      new THREE.MeshBasicMaterial({ color: '#e8f3fa', transparent: true, opacity: 0.48, depthWrite: false })
    );
    splashDisk.rotation.x = -Math.PI / 2;
    splashDisk.position.set(WATERFALL_POS.x + 0.6, 0.08, WATERFALL_POS.z);
    splashDisk.userData.fx = true;
    splashDisk.userData.nonsolid = true;
    wfGroup.add(splashDisk);
    this.group.add(wfGroup);

    // East Quiet Cove detour (cabin with flowerboxes + pier with mooring details)
    this._register(
      addCabin({
        name: 'houseVillage',
        x: 52.0,
        z: 386.0,
        rotY: -Math.PI * 0.45,
        w: 5.2,
        h: 2.7,
        d: 4.2,
        wallMat: m.cedarWall,
        roofMat: m.ivoryRoof,
        m,
        withFlowerbox: true,
      })
    );
    this._registerPier(
      addPier({
        name: 'pierCove',
        cx: 37.2,
        cz: 382.2,
        width: 3.4,
        length: 11.5,
        rotY: Math.PI / 2,
        deckY: 0.65,
        m,
        withLantern: true,
        withDetails: true,
      }),
      0.65
    );
  }

  _buildLodgeGoal() {
    const m = this.m;

    // Prominent 1950s Glacier Lake Lodge with gleaming ivory roof & lakeside timber veranda
    const lodge = new THREE.Group();
    lodge.name = 'lodgeMain';
    const lodgeZ = LODGE_POS.z + 2.5; // 547.5; front porch reaches z = 539.6
    const gy = getGroundY(LODGE_POS.x, lodgeZ);
    lodge.position.set(LODGE_POS.x, gy - 0.03, lodgeZ);

    const w = 15.6;
    const h = 4.6;
    const d = 10.2;
    const box1 = new THREE.BoxGeometry(1, 1, 1);

    // 1. Merged Stone Plinth + River-stone Chimney + Cap
    const stoneGeo = mergeBufferGeos([
      { geo: box1, matrix: mtx(0, 0.275, 0, 0, 0, 0, w + 0.5, 0.55, d + 0.5) },
      { geo: box1, matrix: mtx(w * 0.34, 0.52 + h + 3.0, -d * 0.16, 0, 0, 0, 1.35, 4.2, 1.35) },
      { geo: box1, matrix: mtx(w * 0.34, 0.52 + h + 5.15, -d * 0.16, 0, 0, 0, 1.6, 0.18, 1.6) },
    ]);
    const stoneMesh = new THREE.Mesh(stoneGeo, m.stone);
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    lodge.add(stoneMesh);

    // 2. Main Log Cabin Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m.logWall);
    body.position.y = 0.52 + h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    lodge.add(body);

    // 3. Steep Ivory Roof
    const roofH = 4.6;
    const pitchLen = Math.hypot(w * 0.56, roofH);
    const ang = Math.atan2(roofH, w * 0.5);
    const roofGeo = mergeBufferGeos([
      { geo: box1, matrix: mtx(-w * 0.26, 0.52 + h + roofH * 0.48, 0, 0, 0, ang, pitchLen, 0.26, d + 1.3) },
      { geo: box1, matrix: mtx(w * 0.26, 0.52 + h + roofH * 0.48, 0, 0, 0, -ang, pitchLen, 0.26, d + 1.3) },
    ]);
    const roofMesh = new THREE.Mesh(roofGeo, m.ivoryRoof);
    roofMesh.castShadow = true;
    lodge.add(roofMesh);

    const gableGeo = new THREE.ConeGeometry(w * 0.5, roofH, 4);
    gableGeo.rotateY(Math.PI / 4);
    gableGeo.scale(1.0, 1.0, d / (w * 0.707));
    const gable = new THREE.Mesh(gableGeo, m.ivoryTrim);
    gable.position.y = 0.52 + h + roofH * 0.46;
    lodge.add(gable);

    // 4. Lakeside Veranda Deck + Porch Awning + Timber Pillars + Double Front Door
    const porch = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.32, 2.8), m.deckPlank);
    porch.position.set(0, 0.22, -d * 0.5 - 1.4);
    porch.receiveShadow = true;
    lodge.add(porch);

    const cyl1 = new THREE.CylinderGeometry(1, 1, 1, 8);
    const doorParts = [{ geo: box1, matrix: mtx(0, 0.52 + 1.25, -d * 0.5 - 0.04, 0, 0, 0, 1.85, 2.45, 0.16) }];
    for (const px of [-7.2, -2.4, 2.4, 7.2]) {
      doorParts.push({ geo: cyl1, matrix: mtx(px, 2.02, -d * 0.5 - 2.52, 0, 0, 0, 0.15, 3.3, 0.15) });
    }
    for (const tx of [-0.65, 0.65]) {
      doorParts.push({ geo: box1, matrix: mtx(tx, 0.52 + h + 1.4, -d * 0.5 - 0.05, 0, 0, 0, 0.1, 1.62, 0.2) });
    }
    const timberLodgeMesh = new THREE.Mesh(mergeBufferGeos(doorParts), m.darkTimber);
    timberLodgeMesh.castShadow = true;
    lodge.add(timberLodgeMesh);

    // Burnt-sienna veranda awning roof + carved mountain-peak gable crest + window trim
    const crestGeo = new THREE.ConeGeometry(0.7, 0.7, 3);
    crestGeo.rotateY(Math.PI / 6);
    crestGeo.scale(1.2, 1.0, 0.2);
    const siennaParts = [
      { geo: box1, matrix: mtx(0, 3.85, -d * 0.5 - 1.32, -0.18, 0, 0, w + 0.5, 0.16, 2.7) },
      { geo: crestGeo, matrix: mtx(0, 4.4, -d * 0.5 - 2.68) },
    ];
    for (const wx of [-5.0, -2.4, 2.4, 5.0]) {
      siennaParts.push({ geo: box1, matrix: mtx(wx, 2.5, -d * 0.5 - 0.03, 0, 0, 0, 1.9, 2.0, 0.09) });
    }
    const siennaLodgeMesh = new THREE.Mesh(mergeBufferGeos(siennaParts), m.siennaRoof);
    siennaLodgeMesh.castShadow = true;
    lodge.add(siennaLodgeMesh);
    crestGeo.dispose();

    // Ivory trim: porch handrails, double-door surround, and paned window mullions
    const trimParts = [
      { geo: box1, matrix: mtx(-4.8, 1.24, -d * 0.5 - 2.52, 0, 0, 0, 4.6, 0.12, 0.12) },
      { geo: box1, matrix: mtx(4.8, 1.24, -d * 0.5 - 2.52, 0, 0, 0, 4.6, 0.12, 0.12) },
      { geo: box1, matrix: mtx(0, 0.52 + 1.35, -d * 0.5 - 0.02, 0, 0, 0, 2.15, 2.65, 0.08) },
    ];
    const glowParts = [{ geo: box1, matrix: mtx(0, 0.52 + h + 1.4, -d * 0.5 - 0.04, 0, 0, 0, 2.5, 1.58, 0.16) }];
    for (const wx of [-5.0, -2.4, 2.4, 5.0]) {
      glowParts.push({ geo: box1, matrix: mtx(wx, 2.5, -d * 0.5 - 0.07, 0, 0, 0, 1.66, 1.76, 0.14) });
      trimParts.push(
        { geo: box1, matrix: mtx(wx, 2.5, -d * 0.5 - 0.08, 0, 0, 0, 0.08, 1.8, 0.18) },
        { geo: box1, matrix: mtx(wx, 2.5, -d * 0.5 - 0.08, 0, 0, 0, 1.7, 0.08, 0.18) }
      );
    }
    lodge.add(new THREE.Mesh(mergeBufferGeos(trimParts), m.ivoryTrim));
    lodge.add(new THREE.Mesh(mergeBufferGeos(glowParts), m.windowGlow));

    // Porch entry lanterns beside double cedar doors
    const bulbGeo = new THREE.SphereGeometry(0.15, 8, 6);
    const porchLanterns = mergeBufferGeos([
      { geo: bulbGeo, matrix: mtx(-1.42, 2.75, -d * 0.5 - 0.25) },
      { geo: bulbGeo, matrix: mtx(1.42, 2.75, -d * 0.5 - 0.25) },
    ]);
    lodge.add(new THREE.Mesh(porchLanterns, m.lanternGlow));
    bulbGeo.dispose();

    box1.dispose();
    cyl1.dispose();
    freezeStatic(lodge);
    this._register(lodge);

    // Side boathouse / lodge annex cleanly beside lodge (visible in arrival framing)
    this._register(
      addCabin({
        name: 'houseLodgeAnnex',
        x: -13.2,
        z: 549.5,
        rotY: 0.28,
        w: 3.8,
        h: 2.3,
        d: 3.6,
        wallMat: m.cedarWall,
        roofMat: m.siennaRoof,
        m,
      })
    );

    // Welcoming Lodge Pier (spans z = 512.0 .. 537.0) with twin lake-end lanterns & mooring rope
    const lodgePierInfo = addPier({
      name: 'pierLodge',
      cx: 0,
      cz: 524.5,
      width: 4.8,
      length: 25.0,
      deckY: 0.72,
      m,
      withLantern: false,
      twinLakeLanterns: true,
      withDetails: true,
    });
    this._registerPier(lodgePierInfo, 0.72);

    // Wooden ramp stairs linking pierLodge (z=537.0, y=0.72) up to lodge veranda (z=539.6, y=2.2)
    const ramp = new THREE.Group();
    ramp.name = 'pierLodgeRamp';
    const rBox = new THREE.BoxGeometry(1, 1, 1);
    const stepParts = [];
    for (let i = 0; i < 3; i++) {
      const u = i / 2;
      stepParts.push({
        geo: rBox,
        matrix: mtx(0, 0.94 + u * 1.04, 537.55 + u * 0.9, 0, 0, 0, 3.2, 0.24, 0.62),
      });
    }
    const rampMesh = new THREE.Mesh(mergeBufferGeos(stepParts), m.deckPlank);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    ramp.add(rampMesh);
    rBox.dispose();
    freezeStatic(ramp);
    this.group.add(ramp);
    // Register ramp base below walking surface so girl walks up freely while plane floats stay clear
    this.collision.addBox('pierLodgeRamp', -1.65, 1.65, 0.4, 0.70, 537.2, 539.5);

    // Welcoming lodge keeper waving warmly on the pier near the lodge
    const host = new THREE.Group();
    host.name = 'lodgeHost';
    host.userData.nonsolid = true;
    host.userData.character = true;
    host.position.set(1.1, 0.72, 529.2);
    host.rotation.y = Math.PI - 0.15;

    const skinMat = new THREE.MeshStandardMaterial({ color: '#f2ccb0', roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#4d3728', roughness: 0.8 });
    const trousersMat = new THREE.MeshStandardMaterial({ color: '#243a54', roughness: 0.85 });
    const bootMat = new THREE.MeshStandardMaterial({ color: '#4f3220', roughness: 0.75 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#201815', roughness: 0.35 });

    const legGeo = new THREE.CylinderGeometry(0.068, 0.056, 0.68, 8);
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(legGeo, trousersMat);
      leg.position.set(sx, 0.42, 0);
      leg.castShadow = true;
      host.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.19), bootMat);
      boot.position.set(sx, 0.06, 0.03);
      host.add(boot);
    }

    const jacket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.21, 0.62, 10),
      new THREE.MeshStandardMaterial({ color: PALETTE.burntSienna, roughness: 0.8 })
    );
    jacket.position.y = 1.02;
    jacket.castShadow = true;
    host.add(jacket);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 12), m.ivoryTrim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.32;
    host.add(collar);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skinMat);
    head.position.y = 1.46;
    head.castShadow = true;
    host.add(head);

    for (const sx of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), eyeMat);
      eye.position.set(sx, 1.47, 0.118);
      host.add(eye);
    }

    const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.132, 0.1, 10), hairMat);
    hair.position.set(0, 1.49, -0.02);
    host.add(hair);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.138, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), m.boatTrim);
    cap.position.y = 1.51;
    host.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.11), m.darkTimber);
    brim.position.set(0, 1.51, 0.12);
    brim.rotation.x = 0.12;
    host.add(brim);

    const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.52, 7);
    armGeo.translate(0, -0.24, 0);
    const armL = new THREE.Mesh(armGeo, m.ivoryTrim);
    armL.position.set(-0.22, 1.24, 0);
    host.add(armL);
    const armR = new THREE.Mesh(armGeo, m.ivoryTrim);
    armR.position.set(0.22, 1.24, 0);
    host.add(armR);

    this.group.add(host);
    this.animated.hostArms = [armL, armR];
  }

  _tryPlaceTree(isMaple, x, z, scale, seed, maxSlope = 1.25) {
    const gy = getGroundY(x, z);
    if (gy < 0.85 || gy > 32) return false;
    const slope = Math.max(
      Math.abs(getGroundY(x + 1.2, z) - getGroundY(x - 1.2, z)),
      Math.abs(getGroundY(x, z + 1.2) - getGroundY(x, z - 1.2))
    );
    if (slope > maxSlope) return false;
    // Clear of suspension bridge towers
    if (Math.abs(z - 268) < 6 && Math.abs(x) > 27 && Math.abs(x) < 42) return false;
    // Clear of waterfall cliff buttress
    if (Math.abs(z - WATERFALL_POS.z) < 12 && x > 24) return false;

    const rad = 2.6 * scale;
    if (this.collision.overlapsXZ(x - rad, x + rad, z - rad, z + rad)) return false;

    const list = isMaple ? this.templates.mapleTemplates : this.templates.pineTemplates;
    const tmpl = list[seed % list.length];
    const yaw = ((seed * 1.618) % 1) * Math.PI * 2;
    const tree = makeTreeFromTemplate(isMaple, x, z, scale, yaw, tmpl, this.m);
    this._register(tree, 0.22);
    return true;
  }

  _buildForestsAndRocks(low) {
    const rand = rng(1954);

    // Curated home cove & lodge peninsula trees
    const homeSpots = [
      { maple: true, x: -16.8, z: -15.5, s: 1.05 },
      { maple: true, x: 19.6, z: -6.5, s: 1.1 },
      { maple: true, x: -19.5, z: 4.5, s: 0.95 },
      { maple: false, x: 21.5, z: -16.0, s: 1.15 },
      { maple: false, x: -22.5, z: -15.5, s: 1.2 },
      { maple: false, x: 17.0, z: -19.0, s: 1.0 },
      { maple: true, x: 2.8, z: -17.5, s: 1.05 },
      { maple: false, x: -3.5, z: -19.5, s: 1.25 },
      { maple: true, x: -19.2, z: 545.5, s: 1.12 },
      { maple: true, x: 14.5, z: 546.0, s: 1.15 },
      { maple: false, x: -19.0, z: 557.5, s: 1.25 },
      { maple: false, x: 17.5, z: 556.0, s: 1.25 },
    ];
    homeSpots.forEach((t, i) => this._tryPlaceTree(t.maple, t.x, t.z, t.s, 200 + i * 13, 0.85));

    // Scenic autumn maples & pines lining both fjord shores and terraced canyon ledges
    const total = low ? 64 : 108;
    let placed = 0;
    let attempts = 0;
    while (placed < total && attempts < total * 8) {
      attempts++;
      const z = 25 + rand() * 545;
      const cx = channelCenterX(z);
      const hw = channelHalfWidth(z);
      const side = rand() > 0.5 ? 1 : -1;
      const offset = hw + 3.8 + rand() * 25;
      const x = cx + side * offset;
      if (z > 505 && Math.abs(x) < 20) continue;
      // Keep East Cove departure/climb lane clear of low shore-edge trees
      if (z > 365 && z < 442 && x > 20 && x < 54) continue;
      const isMaple = z > 135 && z < 360 ? rand() < 0.68 : rand() < 0.45;
      const scale = 0.9 + rand() * 0.52;
      if (this._tryPlaceTree(isMaple, x, z, scale, 900 + attempts * 17, 1.3)) {
        placed++;
      }
    }

    // Granite shore boulders
    const rockCount = low ? 18 : 28;
    for (let i = 0; i < rockCount; i++) {
      const z = 12 + rand() * 545;
      const cx = channelCenterX(z);
      const hw = channelHalfWidth(z);
      const side = rand() > 0.5 ? 1 : -1;
      const x = cx + side * (hw + 0.6 + rand() * 5.0);
      if (Math.abs(x) < 10 && z < 26) continue;
      if (z > 505 && Math.abs(x) < 15) continue;
      if (z > 365 && z < 440 && x > 22 && x < 52) continue;
      const gy = getGroundY(x, z);
      if (gy < 0.28 || gy > 8) continue;
      const s = 0.55 + rand() * 0.72;
      if (this.collision.overlapsXZ(x - s * 1.3, x + s * 1.3, z - s * 1.3, z + s * 1.3)) continue;
      this._register(makeRock(x, z, s, 4000 + i * 31, this.m));
    }
  }

  _buildNonSolidGrass(low) {
    const count = low ? 150 : 340;
    const rand = rng(888);
    const bladeGeo = new THREE.ConeGeometry(0.05, 0.34, 4);
    bladeGeo.translate(0, 0.17, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: '#5a683a',
      roughness: 0.9,
    });
    const inst = new THREE.InstancedMesh(bladeGeo, mat, count);
    inst.name = 'grassTufts';
    inst.userData.nonsolid = true;
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < count * 4 && idx < count; i++) {
      const inHome = i % 2 === 0;
      const x = inHome ? (rand() - 0.5) * 42 : (rand() > 0.5 ? 1 : -1) * (34 + rand() * 26);
      const z = inHome ? -19 + rand() * 21 : 35 + rand() * 515;
      if (inHome && Math.abs(x) < 2.2 && z > -5 && z < 3) continue;
      const gy = getGroundY(x, z);
      if (gy < 0.65 || gy > 6.5) continue;
      if (this.collision.overlapsXZ(x - 0.25, x + 0.25, z - 0.25, z + 0.25)) continue;
      dummy.position.set(x, gy - 0.02, z);
      dummy.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25);
      const sc = 0.65 + rand() * 0.75;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      inst.setMatrixAt(idx++, dummy.matrix);
    }
    inst.count = idx;
    inst.instanceMatrix.needsUpdate = true;
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    this.group.add(inst);
  }

  update(t) {
    for (const b of this.animated.boats) {
      b.mesh.position.y = b.baseY + Math.sin(t * 1.6 + b.phase) * 0.04;
      b.mesh.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.035;
      b.mesh.rotation.x = Math.cos(t * 1.3 + b.phase) * 0.02;
    }
    if (this.animated.hostArms.length === 2) {
      const wave = Math.sin(t * 4.2) * 0.35;
      this.animated.hostArms[0].rotation.z = -2.45 + wave;
      this.animated.hostArms[1].rotation.z = 2.45 - wave;
    }
  }
}
