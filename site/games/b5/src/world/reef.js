import * as THREE from '../../lib/three.module.js';
import {
  ISLAND_GREEN_POS,
  LIGHTHOUSE_POS,
  PALETTE,
  SANDBAR_MAIN_POS,
  SANDBAR_WEST_POS,
  SEA_LEVEL,
} from '../core/env.js';
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
  ];
  for (let i = 0; i < pts.length; i++) {
    const gy = getGroundY(pts[i][0], pts[i][1]);
    if (gy < m) m = gy;
  }
  return m;
}

function sculptedRockGeo(radius, detail, seed, sx = 1, sy = 1, sz = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const r = rng(seed);
  const p1 = r() * Math.PI * 2;
  const p2 = r() * Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const len = Math.hypot(vx, vy, vz) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const nz = vz / len;
    const n = 1 + 0.14 * Math.sin(nx * 3.4 + p1) * Math.cos(nz * 3.7 + p2) + 0.08 * Math.sin(ny * 4.5 + p1);
    pos.setXYZ(i, vx * n * sx, vy * n * sy, vz * n * sz);
  }
  geo.computeVertexNormals();
  return geo;
}

function createCoralCluster({ name, x, z, scale = 1.0, pink = true, seed = 1, low = false }) {
  const gy = getGroundY(x, z);
  const minG = minGroundFootprint(x, z, 1.4 * scale, 1.4 * scale);
  const dip = Math.max(0.1, gy - minG + 0.08);
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, gy, z);

  const rockMat = new THREE.MeshStandardMaterial({ color: '#4c6a69', roughness: 0.9 });
  const coralMat = new THREE.MeshStandardMaterial({
    color: pink ? PALETTE.coralPink : '#3b8b88',
    roughness: 0.62,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: pink ? '#f3a496' : PALETTE.sunsetGold,
    emissive: pink ? '#d96f66' : '#d69745',
    emissiveIntensity: 0.16,
    roughness: 0.52,
  });

  const base = new THREE.Mesh(sculptedRockGeo(1.25 * scale, 1, seed, 1.18, 0.56, 1.12), rockMat);
  base.position.y = 0.52 * scale - dip * 0.35;
  base.receiveShadow = !low;
  g.add(base);

  const segs = low ? 10 : 14;
  const plates = [
    { px: 0, py: 1.04 * scale, pz: 0, r: 1.08 * scale, mat: coralMat },
    { px: 0.60 * scale, py: 1.32 * scale, pz: 0.40 * scale, r: 0.70 * scale, mat: tipMat },
    { px: -0.50 * scale, py: 1.24 * scale, pz: -0.34 * scale, r: 0.64 * scale, mat: coralMat },
  ];
  for (const pl of plates) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(pl.r, pl.r * 0.52, 0.22 * scale, segs), pl.mat);
    disc.position.set(pl.px, pl.py, pl.pz);
    g.add(disc);
  }

  return g;
}

function createIslandTree({ name, x, z, height = 5.2, radius = 1.25, seed = 1, low = false }) {
  const gy = getGroundY(x, z);
  const minG = minGroundFootprint(x, z, radius, radius);
  const dip = Math.max(0.08, gy - minG + 0.06);

  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, gy, z);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#534337', roughness: 0.9 });
  const trunkH = height * 0.46 + dip;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.30, trunkH, 9), trunkMat);
  trunk.position.y = height * 0.46 - trunkH * 0.5;
  trunk.castShadow = !low;
  g.add(trunk);

  const detail = low ? 1 : 2;
  const crownMatA = new THREE.MeshStandardMaterial({ color: PALETTE.fukugiLeaf, roughness: 0.72 });
  const crownMatB = new THREE.MeshStandardMaterial({ color: PALETTE.fukugiLeafAlt, roughness: 0.72 });
  const c1 = new THREE.Mesh(sculptedRockGeo(radius, detail, seed, 1.04, 0.92, 1.04), crownMatA);
  c1.position.y = height * 0.55;
  c1.castShadow = !low;
  g.add(c1);

  const c2 = new THREE.Mesh(sculptedRockGeo(radius * 0.80, detail, seed + 19, 1.0, 0.92, 1.0), crownMatB);
  c2.position.y = height * 0.77;
  c2.castShadow = !low;
  g.add(c2);

  return g;
}

function createRockStack({ name, x, z, rx = 2.2, ry = 3.2, rz = 2.0, seed = 1, low = false }) {
  const gy = getGroundY(x, z);
  const minG = minGroundFootprint(x, z, rx * 0.95, rz * 0.95);
  const dip = Math.max(0.16, gy - minG + 0.14);
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, gy, z);

  const rockMat = new THREE.MeshStandardMaterial({ color: '#7a786e', roughness: 0.92 });
  // Grounded stone plinth skirt so curved rock undersides never leave gaps on cove slopes
  const skirtH = Math.max(0.32, dip + 0.12);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(rx * 0.85, rx * 0.96, skirtH, 9), rockMat);
  skirt.scale.set(1, 1, rz / Math.max(0.1, rx));
  skirt.position.y = 0.12 - skirtH * 0.5;
  g.add(skirt);

  const main = new THREE.Mesh(sculptedRockGeo(1.0, 1, seed, rx, ry * 0.55, rz), rockMat);
  main.position.y = ry * 0.44 - dip * 0.25;
  main.castShadow = !low;
  main.receiveShadow = !low;
  g.add(main);

  const shoulder = new THREE.Mesh(sculptedRockGeo(0.55, 1, seed + 7, rx * 0.8, ry * 0.35, rz * 0.8), rockMat);
  shoulder.position.set(rx * 0.42, ry * 0.20 - dip * 0.3, rz * 0.22);
  shoulder.castShadow = !low;
  g.add(shoulder);

  return g;
}

function createChannelBuoy({ name, x, z }) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, SEA_LEVEL, z);

  const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.weatheredWood, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternWarm,
    emissive: PALETTE.sunsetGold,
    emissiveIntensity: 1.0,
    roughness: 0.25,
  });

  const floatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.35, 10), woodMat);
  floatBase.position.y = 0.05;
  g.add(floatBase);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6), woodMat);
  pole.position.y = 0.55;
  g.add(pole);

  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glassMat);
  orb.position.y = 1.06;
  g.add(orb);

  return g;
}

export class ReefAndCove {
  constructor(colliders, { low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'reefAndCoveGroup';
    this.buoys = [];
    const tex = getWorldTextures({ low });

    // 1. Coral reef outcrops between home beach and sandbar (channels stay wide & open)
    const corals = [
      { x: -12.0, z: 62.0, s: 1.45, pink: true },
      { x: 14.0, z: 68.0, s: 1.55, pink: false },
      { x: -4.0, z: 92.0, s: 1.65, pink: true },
      { x: 18.0, z: 98.0, s: 1.4, pink: true },
      { x: -16.0, z: 112.0, s: 1.5, pink: false },
      { x: 6.0, z: 122.0, s: 1.35, pink: true },
      { x: -34.0, z: 138.0, s: 1.55, pink: true },
      { x: 36.0, z: 182.0, s: 1.5, pink: false },
      { x: -14.0, z: 242.0, s: 1.6, pink: true },
      { x: 24.0, z: 254.0, s: 1.5, pink: false },
      { x: -26.0, z: 54.0, s: 1.4, pink: false },
      { x: 28.0, z: 82.0, s: 1.45, pink: true },
      { x: -28.0, z: 162.0, s: 1.5, pink: false },
      { x: 42.0, z: 204.0, s: 1.45, pink: true },
    ];
    corals.forEach((c, idx) => {
      const name = `coralOutcrop${idx + 1}`;
      this.group.add(createCoralCluster({ name, x: c.x, z: c.z, scale: c.s, pink: c.pink, seed: 301 + idx * 13, low }));
      const gy = getGroundY(c.x, c.z);
      colliders.addCyl(name, c.x, c.z, 1.9 * c.s, gy - 0.5, gy + 1.65 * c.s);
    });

    // 2. Small Green Island (ISLAND_GREEN_POS = (-42, 195)) fukugi grove & coastal arbor
    const islandTrees = [
      { x: ISLAND_GREEN_POS.x - 4.2, z: ISLAND_GREEN_POS.z - 2.4, h: 5.3, r: 1.28 },
      { x: ISLAND_GREEN_POS.x + 3.2, z: ISLAND_GREEN_POS.z - 3.8, h: 4.9, r: 1.2 },
      { x: ISLAND_GREEN_POS.x - 1.2, z: ISLAND_GREEN_POS.z + 4.4, h: 5.5, r: 1.32 },
      { x: ISLAND_GREEN_POS.x - 7.4, z: ISLAND_GREEN_POS.z + 2.0, h: 4.8, r: 1.18 },
      { x: ISLAND_GREEN_POS.x + 5.4, z: ISLAND_GREEN_POS.z + 2.8, h: 5.0, r: 1.22 },
    ];
    islandTrees.forEach((t, idx) => {
      const name = `treeIsland${idx + 1}`;
      this.group.add(createIslandTree({ name, x: t.x, z: t.z, height: t.h, radius: t.r, seed: 501 + idx * 19, low }));
      const minG = minGroundFootprint(t.x, t.z, t.r, t.r);
      const gy = getGroundY(t.x, t.z);
      colliders.addCyl(name, t.x, t.z, 0.95, minG - 0.1, gy + t.h);
    });

    // 3. Coastal limestone rock stacks & reef arch (ROCK_ARCH_POS = (38, 226))
    const rocks = [
      { name: 'rockReefSpit', x: -37.5, z: 84.0, rx: 2.6, ry: 2.0, rz: 2.4 },
      { name: 'rockArchWest', x: 32.0, z: 226.0, rx: 2.2, ry: 4.2, rz: 2.1 },
      { name: 'rockArchEast', x: 44.0, z: 226.0, rx: 2.2, ry: 4.6, rz: 2.1 },
      { name: 'rockCoveWest', x: -13.8, z: 316.5, rx: 2.2, ry: 2.4, rz: 2.0 },
      { name: 'rockCoveEast', x: 29.8, z: 313.5, rx: 2.6, ry: 2.8, rz: 2.4 },
    ];
    rocks.forEach((rk, idx) => {
      this.group.add(createRockStack({ ...rk, seed: 701 + idx * 23, low }));
      const minG = minGroundFootprint(rk.x, rk.z, rk.rx, rk.rz);
      const gy = getGroundY(rk.x, rk.z);
      colliders.addCyl(rk.name, rk.x, rk.z, Math.max(rk.rx, rk.rz) * 0.95, minG - 0.15, gy + rk.ry);
    });

    // 4. Mooring posts & driftwood on Main Sandbar & West Sandbar
    const sandbarPosts = [
      { name: 'postSandbarMain', x: SANDBAR_MAIN_POS.x + 5.5, z: SANDBAR_MAIN_POS.z + 3.5 },
      { name: 'postSandbarWest', x: SANDBAR_WEST_POS.x - 4.2, z: SANDBAR_WEST_POS.z + 2.2 },
    ];
    for (const sp of sandbarPosts) {
      const gy = getGroundY(sp.x, sp.z);
      const minG = minGroundFootprint(sp.x, sp.z, 0.25, 0.25);
      const dip = Math.max(0.06, gy - minG + 0.06);
      const g = new THREE.Group();
      g.name = sp.name;
      g.position.set(sp.x, gy, sp.z);

      const postH = 1.3 + dip;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.14, postH, 8),
        new THREE.MeshStandardMaterial({ color: PALETTE.weatheredWood, roughness: 0.86 })
      );
      post.position.y = 1.3 - postH * 0.5;
      post.castShadow = !low;
      g.add(post);

      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 8),
        new THREE.MeshStandardMaterial({
          color: PALETTE.lanternWarm,
          emissive: PALETTE.sunsetGold,
          emissiveIntensity: 1.1,
          roughness: 0.3,
        })
      );
      lantern.position.y = 1.38;
      g.add(lantern);

      this.group.add(g);
      colliders.addCyl(sp.name, sp.x, sp.z, 0.28, gy - dip, gy + 1.55);
    }

    // Driftwood bench on outer rim of Main Sandbar (clear of central walking path)
    {
      const dx = SANDBAR_MAIN_POS.x - 6.8;
      const dz = SANDBAR_MAIN_POS.z + 5.6;
      const gy = getGroundY(dx, dz);
      const minG = minGroundFootprint(dx, dz, 1.2, 0.45);
      const dip = Math.max(0.05, gy - minG + 0.05);
      const dw = new THREE.Group();
      dw.name = 'driftwoodSandbar';
      dw.position.set(dx, gy, dz);
      dw.rotation.y = 0.42;
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: '#9c8b73', roughness: 0.92 })
      );
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.16 - dip * 0.5;
      log.castShadow = !low;
      dw.add(log);
      this.group.add(dw);
      colliders.addBox('driftwoodSandbar', dx, dz, 1.2, 0.45, gy - dip, gy + 0.5);
    }

    // Channel marker buoys guiding the eye softly from reef toward cove
    const buoyLocs = [
      { name: 'buoyChannel1', x: 8.5, z: 54.0 },
      { name: 'buoyChannel2', x: 14.0, z: 112.0 },
      { name: 'buoyChannel3', x: 16.0, z: 194.0 },
      { name: 'buoyChannel4', x: 11.5, z: 256.0 },
    ];
    for (const b of buoyLocs) {
      const bm = createChannelBuoy(b);
      this.group.add(bm);
      this.buoys.push({ mesh: bm, phase: b.z * 0.05 });
      colliders.addCyl(b.name, b.x, b.z, 0.55, -0.4, 1.2);
    }

    // 5. Star-Sand Lighthouse Tower (LIGHTHOUSE_POS = (18, 315)) — grounded flush on cove headland
    {
      const lx = LIGHTHOUSE_POS.x;
      const lz = LIGHTHOUSE_POS.z;
      const gy = getGroundY(lx, lz);
      const minG = minGroundFootprint(lx, lz, 2.65, 2.65);
      const dip = Math.max(0.12, gy - minG + 0.08);
      const lh = new THREE.Group();
      lh.name = 'lighthouseTower';
      lh.position.set(lx, gy, lz);

      const stoneBaseMat = new THREE.MeshStandardMaterial({
        color: PALETTE.coralStone,
        map: tex.limestone,
        roughness: 0.9,
      });
      const whiteWashMat = new THREE.MeshStandardMaterial({ color: '#f0eadc', roughness: 0.7 });
      const trimBandMat = new THREE.MeshStandardMaterial({ color: PALETTE.coralPink, roughness: 0.68 });
      const darkCapMat = new THREE.MeshStandardMaterial({ color: PALETTE.roofSlate, roughness: 0.65 });
      const lampMat = new THREE.MeshStandardMaterial({
        color: '#fff2c2',
        emissive: '#ffbf54',
        emissiveIntensity: 2.2,
        roughness: 0.2,
      });

      const baseH = 1.4 + dip;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.68, baseH, 16), stoneBaseMat);
      base.position.y = 1.4 - baseH * 0.5;
      base.castShadow = !low;
      base.receiveShadow = !low;
      lh.add(base);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 2.15, 10.6, 16), whiteWashMat);
      shaft.position.y = 1.4 + 5.3;
      shaft.castShadow = !low;
      shaft.receiveShadow = !low;
      lh.add(shaft);

      // Vertical recessed window slits & arched entrance door
      const doorM = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.5, 0.3), darkCapMat);
      doorM.position.set(-0.35, 1.4 + 0.75, -2.05);
      lh.add(doorM);
      for (const wy of [4.8, 8.0]) {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.72, 0.25), darkCapMat);
        slit.position.set(-0.32, wy, -1.78);
        lh.add(slit);
      }

      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.46, 0.85, 16), trimBandMat);
      band.position.y = 11.4;
      lh.add(band);

      const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.88, 1.65, 0.45, 16), stoneBaseMat);
      gallery.position.y = 12.2;
      lh.add(gallery);

      // Gallery railing ring
      const rail = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.045, 6, 20), darkCapMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = 12.72;
      lh.add(rail);

      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 1.65, 14), lampMat);
      lantern.position.y = 13.25;
      lh.add(lantern);

      const dome = new THREE.Mesh(new THREE.ConeGeometry(1.38, 1.25, 14), darkCapMat);
      dome.position.y = 14.65;
      lh.add(dome);

      this.group.add(lh);
      colliders.addCyl('lighthouseTower', lx, lz, 2.65, gy - dip, gy + 15.2);

      // Lighthouse beacon glow & rotating light beams in separate non-solid FX group
      const fxGroup = new THREE.Group();
      fxGroup.name = 'lighthouseBeaconFX';
      fxGroup.position.set(lx, gy, lz);
      fxGroup.userData.nonsolid = true;
      fxGroup.userData.fx = true;

      this.beaconGlow = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 12, 10),
        new THREE.MeshBasicMaterial({
          color: '#ffd680',
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      this.beaconGlow.position.y = 13.25;
      this.beaconGlow.userData.nonsolid = true;
      this.beaconGlow.userData.fx = true;
      fxGroup.add(this.beaconGlow);

      this.beamPivot = new THREE.Group();
      this.beamPivot.position.y = 13.25;
      this.beamPivot.userData.nonsolid = true;
      this.beamPivot.userData.fx = true;
      const beamMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uCol: { value: new THREE.Color('#ffe09a') } },
        vertexShader: `
          varying float vDist;
          void main() {
            vDist = clamp(length(position) / 40.0, 0.0, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uCol;
          varying float vDist;
          void main() {
            float fade = pow(1.0 - vDist, 1.8) * 0.22;
            gl_FragColor = vec4(uCol, fade);
          }
        `,
      });
      const beamGeo = new THREE.ConeGeometry(4.8, 40, 14, 1, true);
      beamGeo.translate(0, -20, 0);
      beamGeo.rotateX(Math.PI / 2);
      const b1 = new THREE.Mesh(beamGeo, beamMat);
      b1.userData.nonsolid = true;
      b1.userData.fx = true;
      const b2 = new THREE.Mesh(beamGeo, beamMat);
      b2.rotation.y = Math.PI;
      b2.userData.nonsolid = true;
      b2.userData.fx = true;
      this.beamPivot.add(b1, b2);
      fxGroup.add(this.beamPivot);
      this.group.add(fxGroup);
    }

    // 6. Lighthouse Keeper's Cottage (4.5, 318) + Cove Fukugi Trees & Stone Wall
    {
      const kx = 4.5;
      const kz = 318.0;
      const gy = getGroundY(kx, kz);
      const minG = minGroundFootprint(kx, kz, 2.7, 2.2);
      const dip = Math.max(0.1, gy - minG + 0.06);
      const kg = new THREE.Group();
      kg.name = 'houseKeeper';
      kg.position.set(kx, gy, kz);
      kg.rotation.y = 0.16;

      const plinthH = 0.36 + dip;
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(5.4, plinthH, 4.4),
        new THREE.MeshStandardMaterial({ color: PALETTE.coralStone, map: tex.limestone, roughness: 0.9 })
      );
      plinth.position.y = 0.36 - plinthH * 0.5;
      kg.add(plinth);

      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(4.9, 2.0, 3.9),
        new THREE.MeshStandardMaterial({ color: PALETTE.plasterWall, roughness: 0.85 })
      );
      wall.position.y = 1.36;
      wall.castShadow = !low;
      kg.add(wall);

      const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.weatheredWood, roughness: 0.82 });
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.5, 0.08), woodMat);
      door.position.set(-1.05, 1.15, -1.96);
      kg.add(door);

      const win = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.9, 0.08),
        new THREE.MeshStandardMaterial({
          color: '#ffe0a8',
          emissive: PALETTE.sunsetGold,
          emissiveIntensity: 0.78,
        })
      );
      win.position.set(0.8, 1.4, -1.96);
      kg.add(win);

      const roofGeo = new THREE.ConeGeometry(3.8, 1.4, 4);
      roofGeo.rotateY(Math.PI / 4);
      roofGeo.scale(1.15, 1, 0.95);
      const roof = new THREE.Mesh(
        roofGeo,
        new THREE.MeshStandardMaterial({ color: PALETTE.roofTile, map: tex.roofTile, roughness: 0.72 })
      );
      roof.position.y = 2.95;
      roof.castShadow = !low;
      kg.add(roof);

      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 0.14, 0.2),
        new THREE.MeshStandardMaterial({ color: '#e6dfd0', roughness: 0.85 })
      );
      ridge.position.y = 3.65;
      kg.add(ridge);

      this.group.add(kg);
      colliders.addBox('houseKeeper', kx, kz, 2.9, 2.4, gy - dip, gy + 3.8);
    }

    const coveTrees = [
      { name: 'treeCove1', x: -3.2, z: 320.5, h: 5.0, r: 1.2 },
      { name: 'treeCove2', x: 11.2, z: 322.0, h: 5.3, r: 1.25 },
      { name: 'treeCove3', x: 24.5, z: 318.0, h: 5.1, r: 1.22 },
      { name: 'treeCove4', x: -8.5, z: 314.0, h: 4.8, r: 1.15 },
    ];
    coveTrees.forEach((ct, idx) => {
      this.group.add(createIslandTree({ ...ct, seed: 801 + idx * 17, low }));
      const minG = minGroundFootprint(ct.x, ct.z, ct.r, ct.r);
      const gy = getGroundY(ct.x, ct.z);
      colliders.addCyl(ct.name, ct.x, ct.z, 0.9, minG - 0.1, gy + ct.h);
    });

    // Stone lantern near cove beach
    {
      const lx = 13.5;
      const lz = 307.5;
      const gy = getGroundY(lx, lz);
      const minG = minGroundFootprint(lx, lz, 0.35, 0.35);
      const dip = Math.max(0.06, gy - minG + 0.06);
      const ln = new THREE.Group();
      ln.name = 'lanternCove';
      ln.position.set(lx, gy, lz);
      const pedH = 0.9 + dip;
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.24, pedH, 10),
        new THREE.MeshStandardMaterial({ color: PALETTE.coralStone, map: tex.limestone, roughness: 0.9 })
      );
      ped.position.y = 0.9 - pedH * 0.5;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.28, 0.28),
        new THREE.MeshStandardMaterial({ color: PALETTE.lanternWarm, emissive: PALETTE.sunsetGold, emissiveIntensity: 1.1 })
      );
      box.position.y = 1.04;
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.22, 4),
        new THREE.MeshStandardMaterial({ color: PALETTE.roofSlate, roughness: 0.75 })
      );
      cap.rotation.y = Math.PI / 4;
      cap.position.y = 1.28;
      ln.add(ped, box, cap);
      this.group.add(ln);
      colliders.addCyl('lanternCove', lx, lz, 0.28, gy - dip, gy + 1.5);
    }

    // 7. Sea-surface reef shimmer ring near lighthouse cove (non-solid FX)
    const starGlow = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 4.5, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffe099',
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    starGlow.name = 'coveStarSandGlow';
    starGlow.rotation.x = -Math.PI / 2;
    starGlow.position.set(9.0, SEA_LEVEL + 0.06, 300.0);
    starGlow.userData.nonsolid = true;
    starGlow.userData.fx = true;
    this.group.add(starGlow);
    this.starGlow = starGlow;
  }

  update(time) {
    if (this.beamPivot) {
      this.beamPivot.rotation.y = time * 0.42;
    }
    if (this.beaconGlow) {
      const s = 1.0 + Math.sin(time * 2.4) * 0.14;
      this.beaconGlow.scale.setScalar(s);
    }
    if (this.starGlow) {
      this.starGlow.material.opacity = 0.18 + Math.sin(time * 1.9) * 0.08;
    }
    for (let i = 0; i < this.buoys.length; i++) {
      const b = this.buoys[i];
      b.mesh.position.y = SEA_LEVEL + Math.sin(time * 1.6 + b.phase) * 0.06;
      b.mesh.rotation.z = Math.sin(time * 1.2 + b.phase) * 0.07;
    }
  }
}
