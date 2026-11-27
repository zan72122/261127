import * as THREE from '../../lib/three.module.js';
import { PALETTE, SEA_LEVEL } from '../core/env.js';
import { rng } from '../core/math.js';
import { getWorldTextures } from '../core/textures.js';
import { getGroundY } from './terrain.js';

function minGroundFootprint(x, z, hx, hz) {
  let m = getGroundY(x, z);
  const pts = [
    [x - hx, z - hz],
    [x + hx, z - hz],
    [x - hx, z + hz],
    [x + hx, z + hz],
    [x - hx, z],
    [x + hx, z],
    [x, z - hz],
    [x, z + hz],
  ];
  for (let i = 0; i < pts.length; i++) {
    const gy = getGroundY(pts[i][0], pts[i][1]);
    if (gy < m) m = gy;
  }
  return m;
}

function organicCrownGeo(radius, detail, seed, sy = 0.92) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const r = rng(seed);
  const p1 = r() * Math.PI * 2;
  const p2 = r() * Math.PI * 2;
  const colors = new Float32Array(pos.count * 3);
  const cDeep = new THREE.Color(PALETTE.fukugiLeaf);
  const cMid = new THREE.Color(PALETTE.fukugiLeafAlt);
  const cTip = new THREE.Color('#3c744c');
  const cTmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const len = Math.hypot(vx, vy, vz) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const nz = vz / len;
    const ripple =
      1 +
      0.09 * Math.sin(nx * 4.2 + p1) * Math.cos(nz * 4.0 + p2) +
      0.05 * Math.cos(ny * 5.0 + nx * 3.1);
    pos.setXYZ(i, vx * ripple, vy * ripple * sy, vz * ripple);

    const sunT = Math.max(0, Math.min(1, (ny + 0.65) * 0.65 + (ripple - 0.9) * 1.4));
    cTmp.lerpColors(cDeep, cMid, Math.min(1, sunT * 1.2));
    if (sunT > 0.55) cTmp.lerp(cTip, (sunT - 0.55) * 1.1);
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function createHouse({ name, x, z, rotY = 0, w = 5.6, d = 4.4, roofColor = PALETTE.roofTile, low = false, withYardJar = false }) {
  const gy = getGroundY(x, z);
  const minG = minGroundFootprint(x, z, w * 0.52, d * 0.58);
  const footDip = Math.max(0.14, gy - minG + 0.08);

  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, gy, z);
  g.rotation.y = rotY;

  const tex = getWorldTextures({ low });
  const plinthMat = new THREE.MeshStandardMaterial({
    color: PALETTE.coralStone,
    map: tex.limestone,
    roughness: 0.9,
  });
  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.plasterWall, roughness: 0.85 });
  const woodMat = new THREE.MeshStandardMaterial({
    color: PALETTE.weatheredWood,
    map: low ? null : tex.woodPlank,
    roughness: 0.82,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    map: tex.roofTile,
    roughness: 0.72,
  });
  const ridgeMat = new THREE.MeshStandardMaterial({ color: '#e6dfd0', roughness: 0.85 });
  const winMat = new THREE.MeshStandardMaterial({
    color: '#ffe0a8',
    emissive: '#f2b75c',
    emissiveIntensity: 0.78,
    roughness: 0.35,
  });

  // Stone foundation plinth extending below minimum corner ground
  const plinthH = 0.36 + footDip;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.52, plinthH, d + 0.52), plinthMat);
  plinth.position.y = 0.36 - plinthH * 0.5;
  plinth.receiveShadow = !low;
  g.add(plinth);

  // Main wooden & plaster body
  const wallH = 2.05;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
  body.position.y = 0.36 + wallH * 0.5;
  body.castShadow = !low;
  body.receiveShadow = !low;
  g.add(body);

  // Wooden veranda (engawa) facing front (+Z local)
  const engawa = new THREE.Mesh(new THREE.BoxGeometry(w + 0.22, 0.14, 0.95), woodMat);
  engawa.position.set(0, 0.43, d * 0.5 + 0.32);
  g.add(engawa);

  // Porch step stone rooted cleanly into pad
  const stepH = 0.18 + footDip;
  const stepStone = new THREE.Mesh(new THREE.BoxGeometry(1.35, stepH, 0.48), plinthMat);
  stepStone.position.set(-w * 0.18, 0.18 - stepH * 0.5, d * 0.5 + 0.85);
  g.add(stepStone);

  // Wooden corner posts & veranda eaves posts
  const postGeo = new THREE.BoxGeometry(0.14, wallH + 0.05, 0.14);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(sx * (w * 0.5 - 0.08), 0.36 + wallH * 0.5, sz * (d * 0.5 - 0.08));
      g.add(post);
    }
    const vPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, wallH - 0.15, 0.1), woodMat);
    vPost.position.set(sx * (w * 0.46), 0.48 + (wallH - 0.15) * 0.5, d * 0.5 + 0.72);
    g.add(vPost);
  }

  // Front shoji/glowing warm window & wooden door with transom lattice
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.55, 0.08), woodMat);
  door.position.set(-w * 0.18, 0.36 + 0.82, d * 0.5 + 0.02);
  g.add(door);

  const winF = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.95, 0.08), winMat);
  winF.position.set(w * 0.22, 0.36 + 1.15, d * 0.5 + 0.02);
  g.add(winF);

  // Shoji lattice bars across front window
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.11), woodMat);
  mullion.position.set(w * 0.22, 0.36 + 1.15, d * 0.5 + 0.03);
  g.add(mullion);
  const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.98, 0.11), woodMat);
  vMullion.position.set(w * 0.22, 0.36 + 1.15, d * 0.5 + 0.03);
  g.add(vMullion);

  const winS = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.35), winMat);
  winS.position.set(w * 0.5 + 0.02, 0.36 + 1.15, 0);
  g.add(winS);

  // Traditional Okinawan hipped roof (low & wide eaves + exposed wood eaves fascia)
  const eaveW = w + 1.65;
  const eaveD = d + 1.65;
  const roofH = 1.5;
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(eaveW * 0.98, 0.1, eaveD * 0.98), woodMat);
  fascia.position.y = 0.36 + wallH - 0.03;
  g.add(fascia);

  const roofGeo = new THREE.ConeGeometry(Math.hypot(eaveW, eaveD) * 0.52, roofH, 4);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale((eaveW / Math.hypot(eaveW, eaveD)) * 1.38, 1, (eaveD / Math.hypot(eaveW, eaveD)) * 1.38);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 0.36 + wallH + roofH * 0.5 - 0.06;
  roof.castShadow = !low;
  roof.receiveShadow = !low;
  g.add(roof);

  // White shikkui plaster ridge beam & end caps
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.46, 0.16, 0.24), ridgeMat);
  ridge.position.y = 0.36 + wallH + roofH - 0.04;
  g.add(ridge);

  // Traditional Okinawan ceramic water jar (kamii) beside home porch
  if (withYardJar) {
    const jarMat = new THREE.MeshStandardMaterial({ color: '#6b4232', roughness: 0.58 });
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.44, 10), jarMat);
    jar.position.set(w * 0.42, 0.36 + 0.22, d * 0.5 + 0.58);
    g.add(jar);
  }

  return g;
}

function createStoneWall({ name, x, z, w, d, h = 1.05, low = false }) {
  const minG = minGroundFootprint(x, z, w * 0.5, d * 0.5);
  const gyC = getGroundY(x, z);
  const maxG = Math.max(
    gyC,
    getGroundY(x - w * 0.5, z - d * 0.5),
    getGroundY(x + w * 0.5, z + d * 0.5),
    getGroundY(x - w * 0.5, z + d * 0.5),
    getGroundY(x + w * 0.5, z - d * 0.5)
  );
  const baseY = minG - 0.08;
  const topH = h + (maxG - baseY);

  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, baseY, z);

  const tex = getWorldTextures({ low });
  const wallMat = new THREE.MeshStandardMaterial({
    color: PALETTE.coralStone,
    map: tex.limestone,
    roughness: 0.94,
  });
  const blockMat = new THREE.MeshStandardMaterial({
    color: '#b4ab9a',
    map: tex.limestone,
    roughness: 0.92,
  });
  const capMat = new THREE.MeshStandardMaterial({ color: '#a59c8b', roughness: 0.9 });

  const core = new THREE.Mesh(new THREE.BoxGeometry(w, topH, d), wallMat);
  core.position.y = topH * 0.5;
  core.castShadow = !low;
  core.receiveShadow = !low;
  g.add(core);

  // Coursed Ryukyu limestone coping stones along the wall top
  const alongX = w >= d;
  const span = alongX ? w : d;
  const count = Math.max(2, Math.floor(span / 0.92));
  const segLen = span / count;
  for (let i = 0; i < count; i++) {
    const offset = -span * 0.5 + (i + 0.5) * segLen;
    const hVar = ((i * 7) % 3) * 0.035;
    const bw = alongX ? segLen * 0.9 : w + 0.08;
    const bd = alongX ? d + 0.08 : segLen * 0.9;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.14 + hVar, bd), i % 2 === 0 ? capMat : blockMat);
    cap.position.set(alongX ? offset : 0, topH + 0.06 + hVar * 0.5, alongX ? 0 : offset);
    cap.castShadow = !low;
    cap.receiveShadow = !low;
    g.add(cap);
  }

  return { group: g, baseY, topY: baseY + topH + 0.15 };
}

function createFukugiTree({ name, x, z, height = 5.4, radius = 1.35, seed = 1, low = false }) {
  const gy = getGroundY(x, z);
  const minG = minGroundFootprint(x, z, radius * 1.4, radius * 1.4);
  const dip = Math.max(0.06, gy - minG + 0.06);

  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, gy, z);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4c3c31', roughness: 0.92 });
  const leafMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.02,
  });

  const trunkH = height * 0.46 + dip;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, trunkH, 9), trunkMat);
  trunk.position.y = height * 0.46 - trunkH * 0.5;
  trunk.castShadow = !low;
  g.add(trunk);

  // Subtle root flare at base
  const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.28 + dip, 9), trunkMat);
  flare.position.y = 0.14 - dip * 0.5;
  g.add(flare);

  // Dense multi-lobed sculpted evergreen fukugi crown
  const r = rng(seed);
  const detail = low ? 1 : 2;
  const tiers = [
    { x: 0, y: height * 0.47, z: 0, rad: radius * 0.98, sy: 0.88 },
    { x: (r() - 0.5) * 0.26, y: height * 0.61, z: (r() - 0.5) * 0.26, rad: radius * 0.94, sy: 0.92 },
    { x: (r() - 0.5) * 0.22, y: height * 0.75, z: (r() - 0.5) * 0.22, rad: radius * 0.80, sy: 0.92 },
    { x: 0, y: height * 0.88, z: 0, rad: radius * 0.56, sy: 0.88 },
  ];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const crown = new THREE.Mesh(organicCrownGeo(t.rad, detail, seed + i * 31, t.sy), leafMat);
    crown.position.set(t.x, t.y, t.z);
    crown.rotation.y = r() * Math.PI;
    crown.castShadow = !low;
    crown.receiveShadow = !low;
    g.add(crown);
  }

  return g;
}

function createPier({ name, x, z, lengthX, lengthZ, deckY = 0.75, low = false }) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, 0, z);

  const tex = getWorldTextures({ low });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#7c5f47', roughness: 0.88 });
  const plankMat = new THREE.MeshStandardMaterial({
    color: '#9c7d62',
    map: tex.woodPlank,
    roughness: 0.84,
  });
  const postMat = new THREE.MeshStandardMaterial({ color: '#5b4534', roughness: 0.9 });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternWarm,
    emissive: PALETTE.sunsetGold,
    emissiveIntensity: 0.95,
    roughness: 0.3,
  });

  const alongZ = lengthZ > lengthX;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(lengthX, 0.16, lengthZ), plankMat);
  deck.position.y = deckY - 0.08;
  deck.castShadow = !low;
  deck.receiveShadow = !low;
  g.add(deck);

  if (alongZ) {
    for (const sx of [-lengthX * 0.38, lengthX * 0.38]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, lengthZ - 0.2), woodMat);
      beam.position.set(sx, deckY - 0.22, 0);
      g.add(beam);
    }
  } else {
    for (const sz of [-lengthZ * 0.38, lengthZ * 0.38]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(lengthX - 0.2, 0.18, 0.16), woodMat);
      beam.position.set(0, deckY - 0.22, sz);
      g.add(beam);
    }
  }

  const steps = alongZ ? Math.max(3, Math.round(lengthZ / 4.2)) : Math.max(3, Math.round(lengthX / 4.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps - 0.5;
    for (const side of [-1, 1]) {
      const lx = alongZ ? side * (lengthX * 0.44) : t * (lengthX - 0.6);
      const lz = alongZ ? t * (lengthZ - 0.6) : side * (lengthZ * 0.44);
      const gy = getGroundY(x + lx, z + lz);
      const botY = Math.min(gy - 0.35, deckY - 0.45);
      const topY = deckY + 0.48;
      const h = topY - botY;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 8), postMat);
      post.position.set(lx, botY + h * 0.5, lz);
      post.castShadow = !low;
      g.add(post);

      // Warm pier-end glass buoy lantern on the outer pair of posts
      if (i === steps && side === 1) {
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lanternMat);
        glow.position.set(lx, topY + 0.12, lz);
        g.add(glow);
      }
    }
  }

  return g;
}

function createSabani({ name, x, z, rotY = 0.3, low = false }) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, SEA_LEVEL + 0.04, z);
  g.rotation.y = rotY;

  const tex = getWorldTextures({ low });
  const hullMat = new THREE.MeshStandardMaterial({
    color: '#6e4e37',
    map: low ? null : tex.woodPlank,
    roughness: 0.78,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.plasterWall, roughness: 0.8 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#9c7d5e', roughness: 0.82 });

  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.38, 4.4, 10), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1.1, 1.0, 0.68);
  hull.position.y = 0.14;
  hull.castShadow = !low;
  g.add(hull);

  // Curved prow & stern posts
  const prow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.24), hullMat);
  prow.position.set(0, 0.34, 2.25);
  prow.rotation.x = 0.35;
  g.add(prow);

  const gunwale = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 3.4), trimMat);
  gunwale.position.y = 0.38;
  g.add(gunwale);

  for (const sz of [-0.7, 0.6]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.06, 0.28), seatMat);
    bench.position.set(0, 0.32, sz);
    g.add(bench);
  }

  // Resting wooden oar across thwarts
  const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.8, 6), seatMat);
  oar.rotation.x = Math.PI / 2;
  oar.rotation.z = 0.18;
  oar.position.set(0.18, 0.38, 0.0);
  g.add(oar);

  return g;
}

function createLanternPost({ name, x, z, h = 1.25, low = false }) {
  const gy = getGroundY(x, z);
  const minG = minGroundFootprint(x, z, 0.38, 0.38);
  const dip = Math.max(0.06, gy - minG + 0.06);

  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, gy, z);

  const tex = getWorldTextures({ low });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: PALETTE.coralStone,
    map: tex.limestone,
    roughness: 0.9,
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: PALETTE.roofSlate, roughness: 0.78 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternWarm,
    emissive: PALETTE.sunsetGold,
    emissiveIntensity: 1.15,
    roughness: 0.28,
  });

  const pedH = h * 0.68 + dip;
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, pedH, 10), stoneMat);
  ped.position.y = h * 0.68 - pedH * 0.5;
  g.add(ped);

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), lampMat);
  box.position.y = h * 0.68 + 0.14;
  g.add(box);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 4), roofMat);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = h * 0.68 + 0.38;
  g.add(cap);

  return { group: g, gy, baseY: gy - dip };
}

export class Village {
  constructor(colliders, { low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'villageGroup';
    this.boats = [];
    const tex = getWorldTextures({ low });

    // 1. Protagonist's home & nearby Okinawan settlement houses
    const houses = [
      { name: 'houseHome', x: -5.5, z: -6.5, rotY: 0, w: 6.2, d: 4.8, roofColor: PALETTE.roofTile, withYardJar: true },
      { name: 'houseNeighbor1', x: 14.5, z: -8.0, rotY: -0.18, w: 5.8, d: 4.4, roofColor: PALETTE.roofSlate },
      { name: 'houseNeighbor2', x: -21.5, z: -5.5, rotY: 0.22, w: 5.6, d: 4.4, roofColor: PALETTE.roofTile },
      { name: 'houseBackWest', x: -15.5, z: -18.5, rotY: 0.12, w: 5.6, d: 4.2, roofColor: PALETTE.roofSlate },
      { name: 'houseBackEast', x: 11.5, z: -19.5, rotY: -0.14, w: 5.8, d: 4.2, roofColor: PALETTE.roofTile },
      { name: 'houseEastBoat', x: 26.5, z: 2.0, rotY: -0.32, w: 5.0, d: 4.0, roofColor: PALETTE.roofSlate },
      { name: 'houseWestBeach', x: -28.0, z: 3.0, rotY: 0.28, w: 5.0, d: 4.0, roofColor: PALETTE.roofTile },
      { name: 'shedNetHome', x: 6.8, z: -10.5, rotY: 0.05, w: 3.2, d: 2.6, roofColor: PALETTE.roofSlate },
      // East coastal village continuation
      { name: 'houseEast0', x: 68.0, z: 78.0, rotY: -Math.PI * 0.42, w: 5.4, d: 4.2, roofColor: PALETTE.roofSlate },
      { name: 'houseEast1', x: 69.0, z: 98.0, rotY: -Math.PI * 0.46, w: 5.8, d: 4.5, roofColor: PALETTE.roofTile },
      { name: 'houseEast2', x: 72.0, z: 120.0, rotY: -Math.PI * 0.5, w: 6.0, d: 4.6, roofColor: PALETTE.roofSlate },
      { name: 'houseEast3', x: 68.0, z: 142.0, rotY: -Math.PI * 0.54, w: 5.6, d: 4.4, roofColor: PALETTE.roofTile },
      { name: 'houseEast4', x: 67.0, z: 162.0, rotY: -Math.PI * 0.56, w: 5.2, d: 4.0, roofColor: PALETTE.roofSlate },
    ];
    for (const h of houses) {
      const mesh = createHouse({ ...h, low });
      this.group.add(mesh);
      const gy = getGroundY(h.x, h.z);
      const hx = (Math.abs(Math.cos(h.rotY)) * h.w + Math.abs(Math.sin(h.rotY)) * h.d) * 0.5 + 0.4;
      const hz = (Math.abs(Math.sin(h.rotY)) * h.w + Math.abs(Math.cos(h.rotY)) * h.d) * 0.5 + 0.4;
      colliders.addBox(h.name, h.x, h.z, hx, hz, gy - 0.3, gy + 4.2);
    }

    // 2. Coursed Ryukyu limestone walls around yards & lanes (clean gate opening at x in [-2.2, +0.9])
    const walls = [
      { name: 'wallCoralFrontL', x: -6.4, z: -0.6, w: 6.8, d: 0.52, h: 1.05 },
      { name: 'wallCoralFrontR', x: 2.3, z: -0.6, w: 2.2, d: 0.52, h: 1.05 },
      { name: 'wallCoralWest', x: -10.1, z: -5.8, w: 0.52, d: 8.4, h: 1.05 },
      { name: 'wallCoralBack', x: -5.5, z: -10.8, w: 7.8, d: 0.52, h: 1.05 },
      { name: 'wallNeighbor1Front', x: 14.5, z: -3.6, w: 7.2, d: 0.48, h: 0.98 },
      { name: 'wallNeighbor2Front', x: -21.5, z: -1.2, w: 6.8, d: 0.48, h: 0.98 },
      { name: 'wallLaneWest', x: -14.8, z: 1.4, w: 5.2, d: 0.46, h: 0.92 },
      { name: 'wallLaneEast', x: 9.8, z: 0.4, w: 6.4, d: 0.46, h: 0.92 },
      { name: 'wallVillageNorthW', x: -15.5, z: -13.6, w: 6.2, d: 0.48, h: 0.96 },
      { name: 'wallVillageNorthE', x: 11.5, z: -14.6, w: 6.2, d: 0.48, h: 0.96 },
      // East coastal village stone walls (set on flat bluff x = 64.0)
      { name: 'wallEastVillage1', x: 64.0, z: 88.0, w: 0.48, d: 8.5, h: 0.98 },
      { name: 'wallEastVillage2', x: 64.0, z: 108.0, w: 0.48, d: 8.5, h: 0.98 },
      { name: 'wallEastVillage3', x: 64.0, z: 130.0, w: 0.48, d: 8.5, h: 0.98 },
      { name: 'wallEastVillage4', x: 64.0, z: 152.0, w: 0.48, d: 8.5, h: 0.98 },
    ];
    for (const wl of walls) {
      const built = createStoneWall({ ...wl, low });
      this.group.add(built.group);
      colliders.addBox(wl.name, wl.x, wl.z, wl.w * 0.5, wl.d * 0.5, built.baseY, built.topY);
    }

    // Wooden garden bench in home yard
    {
      const bx = -7.8;
      const bz = -2.4;
      const gy = getGroundY(bx, bz);
      const minG = minGroundFootprint(bx, bz, 0.85, 0.35);
      const dip = Math.max(0.05, gy - minG + 0.05);
      const bench = new THREE.Group();
      bench.name = 'benchGarden';
      bench.position.set(bx, gy, bz);
      const bMat = new THREE.MeshStandardMaterial({
        color: PALETTE.weatheredWood,
        map: low ? null : tex.woodPlank,
        roughness: 0.85,
      });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.46), bMat);
      seat.position.y = 0.42;
      seat.castShadow = !low;
      bench.add(seat);
      for (const sx of [-0.58, 0.58]) {
        const legH = 0.40 + dip;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, legH, 0.42), bMat);
        leg.position.set(sx, 0.40 - legH * 0.5, 0);
        bench.add(leg);
      }
      this.group.add(bench);
      colliders.addBox('benchGarden', bx, bz, 0.8, 0.25, gy - dip, gy + 0.48);
    }

    // Stone gate pillars + warm village stone lanterns
    const gatePillars = [
      { name: 'gatePillarL', x: -2.4, z: -0.6 },
      { name: 'gatePillarR', x: 0.85, z: -0.6 },
    ];
    for (const gp of gatePillars) {
      const { group, gy, baseY } = createLanternPost({ name: gp.name, x: gp.x, z: gp.z, h: 1.25, low });
      this.group.add(group);
      colliders.addCyl(gp.name, gp.x, gp.z, 0.28, baseY, gy + 1.7);
    }
    const extraLanterns = [
      { name: 'lanternBeachPath', x: -2.3, z: 8.5 },
      { name: 'lanternPierHead', x: -7.8, z: 11.2 },
      { name: 'lanternEastPier', x: 64.6, z: 115.6 },
    ];
    for (const ln of extraLanterns) {
      const { group, gy, baseY } = createLanternPost({ name: ln.name, x: ln.x, z: ln.z, h: 1.15, low });
      this.group.add(group);
      colliders.addCyl(ln.name, ln.x, ln.z, 0.25, baseY, gy + 1.6);
    }

    // 3. Wordless wooden postbox (no text or digits, shell emblem only)
    {
      const px = -1.1;
      const pz = 0.2;
      const gy = getGroundY(px, pz);
      const minG = minGroundFootprint(px, pz, 0.3, 0.3);
      const dip = Math.max(0.06, gy - minG + 0.06);
      const pb = new THREE.Group();
      pb.name = 'postbox';
      pb.position.set(px, gy, pz);

      const postH = 1.05 + dip;
      const postM = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, postH, 8),
        new THREE.MeshStandardMaterial({ color: PALETTE.weatheredWood, roughness: 0.85 })
      );
      postM.position.y = 1.05 - postH * 0.5;
      pb.add(postM);

      const boxM = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.34, 0.32),
        new THREE.MeshStandardMaterial({ color: PALETTE.coralPink, roughness: 0.72 })
      );
      boxM.position.y = 1.12;
      pb.add(boxM);

      const capM = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.16, 4),
        new THREE.MeshStandardMaterial({ color: PALETTE.roofSlate, roughness: 0.75 })
      );
      capM.rotation.y = Math.PI / 4;
      capM.position.y = 1.36;
      pb.add(capM);

      const emblem = new THREE.Mesh(
        new THREE.CircleGeometry(0.07, 10),
        new THREE.MeshStandardMaterial({ color: PALETTE.sandWhite, roughness: 0.6 })
      );
      emblem.position.set(0, 1.12, 0.165);
      pb.add(emblem);

      this.group.add(pb);
      colliders.addCyl('postbox', px, pz, 0.32, gy - dip, gy + 1.45);
    }

    // 4. Dug stone well (wellStone)
    {
      const wx = -12.5;
      const wz = -2.5;
      const gy = getGroundY(wx, wz);
      const minG = minGroundFootprint(wx, wz, 0.9, 0.9);
      const dip = Math.max(0.08, gy - minG + 0.06);
      const well = new THREE.Group();
      well.name = 'wellStone';
      well.position.set(wx, gy, wz);

      const curbH = 0.75 + dip;
      const curb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.76, 0.86, curbH, 14),
        new THREE.MeshStandardMaterial({ color: PALETTE.coralStone, map: tex.limestone, roughness: 0.92 })
      );
      curb.position.y = 0.75 - curbH * 0.5;
      curb.castShadow = !low;
      well.add(curb);

      const waterDisc = new THREE.Mesh(
        new THREE.CircleGeometry(0.62, 12),
        new THREE.MeshStandardMaterial({ color: '#1b5a72', roughness: 0.25 })
      );
      waterDisc.rotation.x = -Math.PI / 2;
      waterDisc.position.y = 0.76;
      well.add(waterDisc);

      const woodM = new THREE.MeshStandardMaterial({ color: PALETTE.weatheredWood, roughness: 0.84 });
      for (const sx of [-0.62, 0.62]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.35, 0.1), woodM);
        leg.position.set(sx, 0.98, 0);
        well.add(leg);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.12), woodM);
      beam.position.set(0, 1.65, 0);
      well.add(beam);

      const wellRoof = new THREE.Mesh(
        new THREE.ConeGeometry(1.05, 0.45, 4),
        new THREE.MeshStandardMaterial({ color: PALETTE.roofSlate, map: tex.roofTile, roughness: 0.78 })
      );
      wellRoof.rotation.y = Math.PI / 4;
      wellRoof.position.y = 1.88;
      well.add(wellRoof);

      this.group.add(well);
      colliders.addCyl('wellStone', wx, wz, 0.9, gy - dip, gy + 2.1);
    }

    // 5. Fishing gear rack with bamboo poles & glass floats (rackFishing)
    {
      const rx = 4.4;
      const rz = -3.5;
      const gy = getGroundY(rx, rz);
      const minG = minGroundFootprint(rx, rz, 1.0, 0.45);
      const dip = Math.max(0.06, gy - minG + 0.06);
      const rack = new THREE.Group();
      rack.name = 'rackFishing';
      rack.position.set(rx, gy, rz);

      const woodM = new THREE.MeshStandardMaterial({ color: PALETTE.weatheredWood, roughness: 0.85 });
      const bambooM = new THREE.MeshStandardMaterial({ color: '#c4af76', roughness: 0.7 });
      const floatGreen = new THREE.MeshStandardMaterial({ color: '#4db8a3', roughness: 0.2, metalness: 0.1 });
      const floatGold = new THREE.MeshStandardMaterial({ color: PALETTE.sunsetGold, roughness: 0.25 });

      const upH = 1.45 + dip;
      for (const sx of [-0.85, 0.85]) {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.1, upH, 0.1), woodM);
        upright.position.set(sx, 1.45 - upH * 0.5, 0);
        rack.add(upright);
      }
      const barTop = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.09, 0.09), woodM);
      barTop.position.y = 1.32;
      rack.add(barTop);

      const barLow = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.09, 0.09), woodM);
      barLow.position.y = 0.55;
      rack.add(barLow);

      for (let i = 0; i < 3; i++) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 2.3, 6), bambooM);
        pole.rotation.z = -0.35;
        pole.position.set(-0.35 + i * 0.25, 1.08, 0.08);
        rack.add(pole);
      }

      const buoy1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), floatGreen);
      buoy1.position.set(0.45, 0.18, 0.24);
      rack.add(buoy1);

      const buoy2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), floatGold);
      buoy2.position.set(0.15, 0.14, 0.28);
      rack.add(buoy2);

      this.group.add(rack);
      colliders.addBox('rackFishing', rx, rz, 1.05, 0.45, gy - dip, gy + 1.6);
    }

    // Wooden fishing crates & buoy basket near pierHome landing (seated on flat pad)
    {
      const cx = -13.2;
      const cz = 8.6;
      const gy = getGroundY(cx, cz);
      const minG = minGroundFootprint(cx, cz, 0.75, 0.55);
      const dip = Math.max(0.06, gy - minG + 0.06);
      const crates = new THREE.Group();
      crates.name = 'cratesPierHome';
      crates.position.set(cx, gy, cz);

      const crateMat = new THREE.MeshStandardMaterial({
        color: '#7b5d42',
        map: low ? null : tex.woodPlank,
        roughness: 0.86,
      });
      const floatMat = new THREE.MeshStandardMaterial({ color: '#4db8a3', roughness: 0.25 });
      const c1H = 0.58 + dip;
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, c1H, 0.72), crateMat);
      c1.position.set(0, 0.58 - c1H * 0.5, 0);
      c1.castShadow = !low;
      crates.add(c1);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.46, 0.58), crateMat);
      c2.position.set(0.12, 0.58 + 0.23, -0.04);
      c2.rotation.y = 0.22;
      crates.add(c2);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), floatMat);
      b.position.set(-0.55, 0.16, 0.26);
      crates.add(b);
      this.group.add(crates);
      colliders.addBox('cratesPierHome', cx, cz, 0.75, 0.55, gy - dip, gy + 1.1);
    }

    // 6. Dense Fukugi Tree Windbreak Avenue & Village Grove (positioned on gentle village shelf, strictly grounded)
    const trees = [
      // Avenue framing the path from houseHome toward the white sand beach
      { x: -4.4, z: 1.8, h: 5.5, r: 1.3 },
      { x: 4.4, z: 1.8, h: 5.3, r: 1.25 },
      { x: -4.2, z: 5.5, h: 5.7, r: 1.32 },
      { x: 4.2, z: 5.5, h: 5.4, r: 1.26 },
      { x: -7.4, z: 3.6, h: 5.1, r: 1.2 },
      { x: 7.4, z: 3.6, h: 5.0, r: 1.18 },
      // Dense village windbreak around houses & stone walls
      { x: -14.6, z: -11.2, h: 5.9, r: 1.42 },
      { x: -15.5, z: -6.5, h: 5.5, r: 1.34 },
      { x: -16.4, z: 3.4, h: 5.3, r: 1.24 },
      { x: -21.2, z: 2.2, h: 4.9, r: 1.18 },
      { x: -28.0, z: -11.5, h: 5.7, r: 1.38 },
      { x: -33.8, z: -3.5, h: 5.6, r: 1.36 },
      { x: -9.5, z: -15.2, h: 5.8, r: 1.4 },
      { x: 0.5, z: -16.2, h: 5.6, r: 1.36 },
      { x: 4.8, z: -14.8, h: 5.5, r: 1.32 },
      { x: 20.5, z: -12.8, h: 5.8, r: 1.38 },
      { x: 21.5, z: -4.2, h: 5.4, r: 1.3 },
      { x: 20.8, z: 3.4, h: 4.9, r: 1.18 },
      { x: 33.2, z: -4.5, h: 5.7, r: 1.36 },
      { x: 33.8, z: 4.2, h: 5.1, r: 1.22 },
      { x: -23.5, z: -16.2, h: 5.7, r: 1.36 },
      { x: 24.5, z: -15.8, h: 5.6, r: 1.34 },
      { x: -29.0, z: -17.5, h: 5.4, r: 1.3 },
      { x: 24.5, z: -7.5, h: 5.3, r: 1.28 },
      // East coastal village windbreak grove (all on flat bluff x >= 66.2)
      { x: 66.2, z: 71.5, h: 5.4, r: 1.3 },
      { x: 66.4, z: 88.0, h: 5.5, r: 1.32 },
      { x: 66.2, z: 105.4, h: 5.6, r: 1.35 },
      { x: 66.6, z: 112.0, h: 5.3, r: 1.28 },
      { x: 66.6, z: 125.0, h: 5.5, r: 1.32 },
      { x: 66.5, z: 136.0, h: 5.3, r: 1.28 },
      { x: 66.6, z: 149.5, h: 5.4, r: 1.3 },
      { x: 66.6, z: 155.6, h: 5.2, r: 1.25 },
      { x: 75.5, z: 88.0, h: 5.8, r: 1.4 },
      { x: 76.2, z: 108.0, h: 5.9, r: 1.42 },
      { x: 75.5, z: 132.0, h: 5.7, r: 1.38 },
      { x: 74.8, z: 154.0, h: 5.6, r: 1.35 },
    ];
    trees.forEach((t, idx) => {
      const name = `treeFukugi${idx + 1}`;
      this.group.add(createFukugiTree({ name, x: t.x, z: t.z, height: t.h, radius: t.r, seed: 101 + idx * 17, low }));
      const minG = minGroundFootprint(t.x, t.z, t.r, t.r);
      const gy = getGroundY(t.x, t.z);
      colliders.addCyl(name, t.x, t.z, t.r * 0.72, minG - 0.1, gy + t.h);
    });

    // 7. Multiple Wooden Piers (home beach, reef spit, island, east village, lighthouse cove)
    const piers = [
      { name: 'pierHome', x: -10.5, z: 22.0, lx: 3.4, lz: 19.4, deckY: 0.75 },
      { name: 'pierReef', x: -25.0, z: 84.0, lx: 15.0, lz: 3.2, deckY: 0.75 },
      { name: 'pierIsland', x: -19.5, z: 195.0, lx: 15.0, lz: 3.2, deckY: 0.75 },
      { name: 'pierEast', x: 56.5, z: 118.0, lx: 19.0, lz: 3.4, deckY: 0.75 },
      { name: 'pierCove', x: 0.0, z: 290.0, lx: 3.4, lz: 16.4, deckY: 0.75 },
    ];
    for (const p of piers) {
      this.group.add(createPier({ name: p.name, x: p.x, z: p.z, lengthX: p.lx, lengthZ: p.lz, deckY: p.deckY, low }));
      colliders.addBox(p.name, p.x, p.z, p.lx * 0.5 + 0.1, p.lz * 0.5 + 0.1, -2.5, p.deckY + 0.55, {
        walkableTop: true,
        whaleSolid: true,
        girlSolid: true,
      });
      colliders.addPierDeck(p.name, p.x, p.z, p.lx * 0.5, p.lz * 0.5, p.deckY);
    }

    // 8. Moored Okinawan Sabani wooden boats
    const boats = [
      { name: 'boatSabani1', x: -16.5, z: 26.5, rotY: 0.18 },
      { name: 'boatSabani2', x: 18.0, z: 21.5, rotY: -0.35 },
      { name: 'boatSabani3', x: 48.0, z: 126.5, rotY: 0.42 },
      { name: 'boatSabani4', x: 50.5, z: 109.5, rotY: -0.24 },
      { name: 'boatSabani5', x: -5.8, z: 286.5, rotY: 0.25 },
    ];
    for (const b of boats) {
      const bm = createSabani({ ...b, low });
      this.group.add(bm);
      this.boats.push({ mesh: bm, baseZ: b.z, phase: b.x * 0.3 });
      colliders.addCyl(b.name, b.x, b.z, 1.75, -0.5, 1.0);
    }

    // 9. Coral-stone stepping stones along the path from gate to beach (non-solid ground detail)
    const stepGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.08, 9);
    const stepMat = new THREE.MeshStandardMaterial({ color: '#d4cbb8', roughness: 0.92 });
    const stepCount = 9;
    const stepInst = new THREE.InstancedMesh(stepGeo, stepMat, stepCount);
    stepInst.name = 'pathSteppingStones';
    stepInst.userData.nonsolid = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < stepCount; i++) {
      const sx = -0.35 + (i % 2 === 0 ? -0.28 : 0.28) + i * 0.06;
      const sz = 0.6 + i * 1.45;
      const sy = getGroundY(sx, sz);
      dummy.position.set(sx, sy + 0.02, sz);
      dummy.rotation.set(0, i * 0.65, 0);
      dummy.scale.set(1.05, 1, 0.85);
      dummy.updateMatrix();
      stepInst.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(stepInst);

    // 10. Grounded Hibiscus shrubs & coastal adan clusters (foliage base + coral-pink blooms, non-solid)
    const rand = rng(904);
    const bushGeo = new THREE.IcosahedronGeometry(0.42, 1);
    const bushMat = new THREE.MeshStandardMaterial({ color: PALETTE.fukugiLeafAlt, roughness: 0.78 });
    const flowerGeo = new THREE.CylinderGeometry(0.11, 0.03, 0.06, 6);
    const flowerMat = new THREE.MeshStandardMaterial({ color: PALETTE.coralPink, roughness: 0.52 });
    const grassGeo = new THREE.ConeGeometry(0.1, 0.44, 5);
    const grassMat = new THREE.MeshStandardMaterial({ color: '#396d49', roughness: 0.8 });

    const shrubCount = low ? 18 : 34;
    const bInst = new THREE.InstancedMesh(bushGeo, bushMat, shrubCount);
    bInst.name = 'hibiscusShrubs';
    bInst.userData.nonsolid = true;
    const fInst = new THREE.InstancedMesh(flowerGeo, flowerMat, shrubCount * 3);
    fInst.name = 'hibiscusFlowers';
    fInst.userData.nonsolid = true;
    const grassCount = low ? 34 : 72;
    const gInst = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    gInst.name = 'coastalGrassTufts';
    gInst.userData.nonsolid = true;

    for (let i = 0; i < shrubCount; i++) {
      let sx;
      let sz;
      if (i < 12) {
        // Line the front stone walls & path edge cleanly
        const side = i % 2 === 0 ? -1 : 1;
        sx = side * (2.6 + (i % 6) * 1.5 + rand() * 0.7);
        sz = -0.1 + rand() * 7.5;
      } else {
        sx = (rand() - 0.5) * 56;
        sz = -14 + rand() * 21;
        if (Math.abs(sx) < 2.2 && sz > -2) sx += sx >= 0 ? 3.2 : -3.2;
      }
      const sy = getGroundY(sx, sz);
      if (sy < 0.25) sz = 4.2;
      const sy2 = getGroundY(sx, sz);
      dummy.position.set(sx, sy2 + 0.18, sz);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(1.1 + rand() * 0.5, 0.72 + rand() * 0.3, 1.0 + rand() * 0.5);
      dummy.updateMatrix();
      bInst.setMatrixAt(i, dummy.matrix);

      for (let k = 0; k < 3; k++) {
        const ang = rand() * Math.PI * 2;
        dummy.position.set(sx + Math.cos(ang) * 0.24, sy2 + 0.36 + rand() * 0.14, sz + Math.sin(ang) * 0.24);
        dummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
        dummy.scale.setScalar(0.8 + rand() * 0.35);
        dummy.updateMatrix();
        fInst.setMatrixAt(i * 3 + k, dummy.matrix);
      }
    }

    for (let i = 0; i < grassCount; i++) {
      const gx = (rand() - 0.5) * 50;
      const gz = -8 + rand() * 18;
      let gy = getGroundY(gx, gz);
      let gzz = gz;
      if (gy < 0.15) {
        gzz = 4.6;
        gy = getGroundY(gx, gzz);
      }
      dummy.position.set(gx, gy + 0.16, gzz);
      dummy.rotation.set((rand() - 0.5) * 0.28, rand() * Math.PI, (rand() - 0.5) * 0.28);
      dummy.scale.setScalar(0.75 + rand() * 0.7);
      dummy.updateMatrix();
      gInst.setMatrixAt(i, dummy.matrix);
    }

    this.group.add(bInst, fInst, gInst);
  }

  update(time) {
    for (let i = 0; i < this.boats.length; i++) {
      const b = this.boats[i];
      b.mesh.position.y = SEA_LEVEL + 0.04 + Math.sin(time * 1.4 + b.phase) * 0.05;
      b.mesh.rotation.z = Math.sin(time * 1.1 + b.phase) * 0.04;
      b.mesh.rotation.x = Math.cos(time * 0.9 + b.phase) * 0.025;
    }
  }
}
