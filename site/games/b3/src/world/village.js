import * as THREE from '../../lib/three.module.js';
import { OASIS_POS, OASIS_RADIUS, OASIS_WATER_Y, PALETTE, markNonSolid } from '../core/env.js';
import { rng } from '../core/math.js';
import {
  makeAdobeTexture,
  makeAwningStripeTexture,
  makeCourtyardTileTexture,
  makeZelligeTexture,
} from '../core/textures.js';
import {
  DESERT_CAIRNS,
  DESERT_ROCKS,
  OASIS_DOCK,
  VILLAGE_COLONNADE,
  VILLAGE_COURTYARDS,
  VILLAGE_HOUSES,
  VILLAGE_STALLS,
  VILLAGE_WELL,
} from './layout.js';
import { getGroundY, isOverOasisWater } from './terrain.js';

export class VillageWorld {
  constructor(colliders, { low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'villageWorld';
    this.colliders = colliders;
    this.low = low;
    this.lanternGlows = [];
    this.waterRipples = [];

    const adobeTex = low ? null : makeAdobeTexture();
    const tileTex = low ? null : makeCourtyardTileTexture(4, 5);
    const zelligeTex = low ? null : makeZelligeTexture();
    const awningSaffron = low ? null : makeAwningStripeTexture(PALETTE.saffron);
    const awningTurq = low ? null : makeAwningStripeTexture(PALETTE.turquoise);

    this.mats = {
      terracotta: new THREE.MeshStandardMaterial({ color: PALETTE.terracotta, map: adobeTex, roughness: 0.88 }),
      terracottaDark: new THREE.MeshStandardMaterial({ color: PALETTE.terracottaDark, map: adobeTex, roughness: 0.9 }),
      terracottaWarm: new THREE.MeshStandardMaterial({ color: PALETTE.terracottaWarm, map: adobeTex, roughness: 0.87 }),
      adobe: new THREE.MeshStandardMaterial({ color: PALETTE.adobeWall, map: adobeTex, roughness: 0.9 }),
      adobeLight: new THREE.MeshStandardMaterial({ color: PALETTE.adobeLight, map: adobeTex, roughness: 0.88 }),
      wood: new THREE.MeshStandardMaterial({ color: '#6b4730', roughness: 0.86 }),
      woodDark: new THREE.MeshStandardMaterial({ color: '#4d3221', roughness: 0.88 }),
      stone: new THREE.MeshStandardMaterial({ color: '#8a7460', roughness: 0.92 }),
      stoneWarm: new THREE.MeshStandardMaterial({ color: '#a88766', roughness: 0.9 }),
      trunk: new THREE.MeshStandardMaterial({ color: '#6d503a', roughness: 0.9 }),
      palm: new THREE.MeshStandardMaterial({ color: PALETTE.palmGreen, roughness: 0.82, side: THREE.DoubleSide }),
      palmLight: new THREE.MeshStandardMaterial({ color: '#5c7d4b', roughness: 0.82, side: THREE.DoubleSide }),
      olive: new THREE.MeshStandardMaterial({ color: PALETTE.oliveGreen, roughness: 0.84 }),
      sage: new THREE.MeshStandardMaterial({ color: '#6e885a', roughness: 0.86 }),
      reed: new THREE.MeshStandardMaterial({ color: '#5b7e48', roughness: 0.84 }),
      brass: new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.38, metalness: 0.72 }),
      saffron: new THREE.MeshStandardMaterial({ color: PALETTE.saffron, roughness: 0.72 }),
      turquoise: new THREE.MeshStandardMaterial({ color: PALETTE.turquoise, roughness: 0.55 }),
      cream: new THREE.MeshStandardMaterial({ color: PALETTE.creamCloth, roughness: 0.84 }),
      courtyardTile: new THREE.MeshStandardMaterial({
        color: tileTex ? '#ffffff' : '#c48f64',
        map: tileTex,
        roughness: 0.78,
      }),
      zellige: new THREE.MeshStandardMaterial({
        color: zelligeTex ? '#ffffff' : PALETTE.turquoise,
        map: zelligeTex,
        roughness: 0.48,
      }),
      tileTerra: new THREE.MeshStandardMaterial({ color: '#b4694c', roughness: 0.78 }),
      awningSaffron: new THREE.MeshStandardMaterial({
        color: awningSaffron ? '#ffffff' : PALETTE.saffron,
        map: awningSaffron,
        roughness: 0.84,
        side: THREE.DoubleSide,
      }),
      awningTurq: new THREE.MeshStandardMaterial({
        color: awningTurq ? '#ffffff' : PALETTE.turquoise,
        map: awningTurq,
        roughness: 0.84,
        side: THREE.DoubleSide,
      }),
      windowGlow: new THREE.MeshStandardMaterial({
        color: '#f7cf78',
        emissive: '#e59f38',
        emissiveIntensity: 0.95,
        roughness: 0.4,
      }),
      lanternGlow: new THREE.MeshStandardMaterial({
        color: '#ffe08a',
        emissive: '#f2ac34',
        emissiveIntensity: 1.45,
        roughness: 0.32,
      }),
    };

    this._buildHouses();
    this._buildColonnade();
    this._buildCourtyardProps();
    this._buildStallsAndWell();
    this._buildVillageCourtyards();
    this._buildOasis();
    this._buildPalmsAndRocks();
  }

  _addHangingLantern(parent, x, y, z) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 5), this.mats.brass);
    cord.position.set(x, y - 0.17, z);
    parent.add(cord);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.14, 6), this.mats.brass);
    cap.position.set(x, y - 0.34, z);
    parent.add(cap);

    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), this.mats.lanternGlow);
    bulb.position.set(x, y - 0.46, z);
    parent.add(bulb);
  }

  _addGroundTile(x, z, w, d, rot = 0, border = true) {
    const gy = getGroundY(x, z);
    const grp = new THREE.Group();
    grp.name = 'tileCourtyard';
    grp.position.set(x, gy + 0.015, z);
    grp.rotation.y = rot;

    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), this.mats.courtyardTile);
    slab.receiveShadow = true;
    grp.add(slab);

    if (border) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.02, d + 0.24), this.mats.stoneWarm);
      rim.position.y = -0.005;
      rim.receiveShadow = true;
      grp.add(rim);
    }

    markNonSolid(grp, 'nonsolid');
    this.group.add(grp);
  }

  _buildHouses() {
    for (let idx = 0; idx < VILLAGE_HOUSES.length; idx++) {
      const h = VILLAGE_HOUSES[idx];
      const gy = getGroundY(h.x, h.z);
      const grp = new THREE.Group();
      grp.name = 'houseMudbrick';
      grp.position.set(h.x, gy, h.z);
      grp.rotation.y = h.rot;

      const wallMat = this.mats[h.color] || this.mats.terracotta;
      const body = new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h, h.d), wallMat);
      body.position.y = h.h * 0.5;
      body.castShadow = true;
      body.receiveShadow = true;
      grp.add(body);

      const plinth = new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.14, 0.32, h.d + 0.14), this.mats.stoneWarm);
      plinth.position.y = 0.16;
      plinth.receiveShadow = true;
      grp.add(plinth);

      const parapetH = 0.42;
      const para = new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.14, parapetH, h.d + 0.14), this.mats.adobeLight);
      para.position.y = h.h + parapetH * 0.5;
      para.castShadow = true;
      para.receiveShadow = true;
      grp.add(para);

      let maxTop = h.h + parapetH + 0.1;
      if (h.tier === 2) {
        const uw = h.w * 0.56;
        const ud = h.d * 0.56;
        const uh = h.h * 0.44;
        const lx = -h.w * 0.14;
        const lz = -h.d * 0.12;
        const upper = new THREE.Mesh(new THREE.BoxGeometry(uw, uh, ud), this.mats.adobeLight);
        upper.position.set(lx, h.h + parapetH + uh * 0.5, lz);
        upper.castShadow = true;
        upper.receiveShadow = true;
        grp.add(upper);

        const upperCap = new THREE.Mesh(new THREE.BoxGeometry(uw + 0.12, 0.24, ud + 0.12), this.mats.terracottaWarm);
        upperCap.position.set(lx, h.h + parapetH + uh + 0.12, lz);
        grp.add(upperCap);

        const upperWin = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.1), this.mats.windowGlow);
        upperWin.position.set(lx, h.h + parapetH + uh * 0.52, lz + ud * 0.5 + 0.02);
        grp.add(upperWin);
        maxTop = Math.max(maxTop, h.h + parapetH + uh + 0.30);
      } else if (h.pergola) {
        for (const [px, pz] of [[-h.w * 0.28, -h.d * 0.24], [h.w * 0.28, -h.d * 0.24], [-h.w * 0.28, h.d * 0.24], [h.w * 0.28, h.d * 0.24]]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.55, 6), this.mats.wood);
          post.position.set(px, h.h + parapetH + 0.77, pz);
          grp.add(post);
        }
        const shade = new THREE.Mesh(new THREE.BoxGeometry(h.w * 0.68, 0.08, h.d * 0.62), this.mats.cream);
        shade.position.set(0, h.h + parapetH + 1.56, 0);
        grp.add(shade);
        maxTop = Math.max(maxTop, h.h + parapetH + 1.65);
      }

      const doorMat = idx % 3 === 1 ? this.mats.turquoise : this.mats.woodDark;
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.08, 2.1, 0.12), doorMat);
      door.position.set(0, 1.05, h.d * 0.5 + 0.02);
      grp.add(door);

      const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.20, 0.14), this.mats.zellige);
      lintel.position.set(0, 2.18, h.d * 0.5 + 0.03);
      grp.add(lintel);

      const pLantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), this.mats.lanternGlow);
      pLantern.position.set(0.72, 2.15, h.d * 0.5 + 0.22);
      grp.add(pLantern);

      const winGeo = new THREE.BoxGeometry(0.76, 0.92, 0.1);
      for (const sx of [-h.w * 0.28, h.w * 0.28]) {
        const win = new THREE.Mesh(winGeo, this.mats.windowGlow);
        win.position.set(sx, h.h * 0.58, h.d * 0.5 + 0.02);
        grp.add(win);
      }
      const sideSign = h.x > 0 ? -1 : 1;
      const sideWinGeo = new THREE.BoxGeometry(0.1, 0.92, 0.78);
      for (const sz of [-h.d * 0.24, h.d * 0.24]) {
        const sWin = new THREE.Mesh(sideWinGeo, this.mats.windowGlow);
        sWin.position.set(sideSign * (h.w * 0.5 + 0.02), h.h * 0.58, sz);
        grp.add(sWin);
      }

      if (h.awning) {
        const awnMat = h.awning === 'turquoise' ? this.mats.awningTurq : this.mats.awningSaffron;
        const awn = new THREE.Mesh(new THREE.BoxGeometry(h.w * 0.44, 0.06, 1.08), awnMat);
        awn.position.set(0, 2.52, h.d * 0.5 + 0.52);
        awn.rotation.x = 0.24;
        awn.castShadow = true;
        grp.add(awn);
      }

      if (h.veranda) {
        const rug = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.9, 0.08), idx % 2 === 0 ? this.mats.saffron : this.mats.turquoise);
        rug.position.set(h.w * 0.2, h.h - 0.05, h.d * 0.5 + 0.09);
        grp.add(rug);
      }

      if (h.steps) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.65), this.mats.adobe);
        bench.position.set(-h.w * 0.24, 0.21, h.d * 0.5 + 0.34);
        bench.castShadow = true;
        bench.receiveShadow = true;
        grp.add(bench);
      }

      const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, h.d + 0.42, 6);
      beamGeo.rotateX(Math.PI / 2);
      for (let bx = -h.w * 0.36; bx <= h.w * 0.38; bx += h.w * 0.24) {
        const beam = new THREE.Mesh(beamGeo, this.mats.wood);
        beam.position.set(bx, h.h - 0.18, 0);
        grp.add(beam);
      }

      this.group.add(grp);
      // Full-footprint house collider strictly enclosing front awnings, steps, roof beams & upper stories
      const extraFront = h.awning ? 1.15 : (h.steps ? 0.72 : 0.25);
      const colD = h.d + 0.45 + extraFront;
      const shiftZ = (extraFront - 0.25) * 0.5;
      const boxX = h.x + Math.sin(h.rot) * shiftZ;
      const boxZ = h.z + Math.cos(h.rot) * shiftZ;
      this.colliders.addBox(boxX, boxZ, h.w + 0.35, colD, gy, gy + maxTop + 0.25, h.rot, 'houseMudbrick', true);
    }
  }

  _buildColonnade() {
    // Lantern colonnade piers flanking the village lane + high non-solid overhead striped banners
    for (const col of VILLAGE_COLONNADE) {
      const gyL = getGroundY(-5.3, col.z);
      const gyR = getGroundY(5.3, col.z);

      for (const [sx, gy, dir] of [[-5.3, gyL, 1], [5.3, gyR, -1]]) {
        if (this.colliders.hasOverlapXZ(sx, col.z, 0.55, 0.35, gy, gy + 4.1)) continue;
        const pGrp = new THREE.Group();
        pGrp.name = 'colonnadePillar';
        pGrp.position.set(sx, gy, col.z);

        const base = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.45, 0.76), this.mats.stone);
        base.position.y = 0.225;
        base.castShadow = true;
        base.receiveShadow = true;
        pGrp.add(base);

        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.56, 3.35, 0.56), this.mats.adobeLight);
        shaft.position.y = 0.45 + 1.675;
        shaft.castShadow = true;
        shaft.receiveShadow = true;
        pGrp.add(shaft);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.22, 0.74), this.mats.terracottaWarm);
        cap.position.y = 3.91;
        pGrp.add(cap);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.08), this.mats.woodDark);
        arm.position.set(0.36 * dir, 3.45, 0);
        pGrp.add(arm);

        const lanternMat = this.mats.lanternGlow.clone();
        const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.19, 0), lanternMat);
        bulb.position.set(0.58 * dir, 3.12, 0);
        pGrp.add(bulb);
        this.lanternGlows.push(lanternMat);

        this.group.add(pGrp);
        // Box collider centered to include base and lantern bracket arm cleanly
        this.colliders.addBox(sx + 0.18 * dir, col.z, 1.32, 0.92, gy, gy + 4.14, 0, 'colonnadePillar', true);
      }

      // High non-solid woven striped banner draped overhead between left & right piers
      const midY = Math.max(gyL, gyR) + 4.02;
      const awnMat = col.stripe === 'turquoise' ? this.mats.awningTurq : this.mats.awningSaffron;
      const banner = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.05, 2.0), awnMat);
      banner.name = 'awningCanopy';
      banner.position.set(0, midY, col.z);
      banner.castShadow = true;
      markNonSolid(banner, 'nonsolid');
      this.group.add(banner);
    }
  }

  _addWall(x, z, w, h, d, rot = 0) {
    const gy = getGroundY(x, z);
    if (this.colliders.hasOverlapXZ(x, z, Math.max(w, d) * 0.5, 0.45, gy, gy + h)) return;
    const grp = new THREE.Group();
    grp.name = 'wallAdobe';
    grp.position.set(x, gy, z);
    grp.rotation.y = rot;

    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mats.adobe);
    wall.position.y = h * 0.5;
    wall.castShadow = true;
    wall.receiveShadow = true;
    grp.add(wall);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.14, d + 0.12), this.mats.terracottaWarm);
    cap.position.y = h + 0.07;
    grp.add(cap);

    this.group.add(grp);
    this.colliders.addBox(x, z, w + 0.16, d + 0.18, gy, gy + h + 0.25, rot, 'wallAdobe');
  }

  _addLamp(x, z, height = 2.65, armDir = 1) {
    const gy = getGroundY(x, z);
    if (this.colliders.hasOverlapXZ(x, z, 0.45, 0.6, gy, gy + height + 0.2)) return;
    const grp = new THREE.Group();
    grp.name = 'lampPost';
    grp.position.set(x, gy, z);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.35, 8), this.mats.stone);
    base.position.y = 0.175;
    grp.add(base);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, height, 8), this.mats.wood);
    post.position.y = height * 0.5;
    post.castShadow = true;
    grp.add(post);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.06), this.mats.brass);
    arm.position.set(0.14 * armDir, height - 0.08, 0);
    grp.add(arm);

    const lanternMat = this.mats.lanternGlow.clone();
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lanternMat);
    lantern.position.set(0.24 * armDir, height - 0.30, 0);
    grp.add(lantern);
    this.lanternGlows.push(lanternMat);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 6), this.mats.brass);
    cap.position.set(0.24 * armDir, height - 0.14, 0);
    grp.add(cap);

    this.group.add(grp);
    this.colliders.addCylinder(x, z, 0.45, gy, gy + height + 0.15, 'lampPost');
  }

  _addJar(x, z, scale = 1.0, glaze = 'terracotta') {
    const gy = getGroundY(x, z);
    const r = 0.34 * scale;
    // Pad 1.05 ensures zero pinch gaps between jars/walls/lamps
    if (this.colliders.hasOverlapXZ(x, z, r, 1.05, gy, gy + 0.78 * scale)) return;
    const grp = new THREE.Group();
    grp.name = 'clayJar';
    grp.position.set(x, gy, z);

    const mat = glaze === 'turquoise' ? this.mats.turquoise : this.mats.terracottaWarm;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.18 * scale, 0.62 * scale, 10), mat);
    body.position.y = 0.31 * scale;
    body.castShadow = true;
    grp.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 10, 8), mat);
    belly.position.y = 0.36 * scale;
    belly.scale.y = 1.15;
    grp.add(belly);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17 * scale, 0.04 * scale, 6, 12), this.mats.saffron);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.64 * scale;
    grp.add(rim);

    this.group.add(grp);
    this.colliders.addCylinder(x, z, r + 0.04, gy, gy + 0.78 * scale, 'clayJar');
  }

  _addShrub(x, z, scale = 1.0, potted = true, name = 'shrubCourtyard') {
    const gy = getGroundY(x, z);
    const r = (potted ? 0.50 : 0.68) * scale;
    if (this.colliders.hasOverlapXZ(x, z, r, 1.05, gy, gy + 1.5 * scale)) return;
    const grp = new THREE.Group();
    grp.name = name;
    grp.position.set(x, gy, z);

    let crownBaseY = 0.32 * scale;
    if (potted) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.24 * scale, 0.44 * scale, 10), this.mats.terracotta);
      pot.position.y = 0.22 * scale;
      pot.castShadow = true;
      grp.add(pot);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 0.45 * scale, 6), this.mats.trunk);
      stem.position.y = 0.62 * scale;
      grp.add(stem);
      crownBaseY = 0.96 * scale;
    }

    const offsets = potted
      ? [[0, 0, 0.42], [-0.20, -0.05, 0.26], [0.20, -0.04, 0.26]]
      : [[0, 0.04, 0.52], [-0.32, -0.08, 0.36], [0.30, -0.1, 0.35], [0, -0.1, 0.38]];
    for (let i = 0; i < offsets.length; i++) {
      const [ox, oy, rad] = offsets[i];
      const oz = i === 3 ? 0.28 : (i % 2 === 0 ? 0.07 : -0.07);
      const bush = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rad * scale, 1),
        i % 2 === 0 ? this.mats.olive : this.mats.sage
      );
      bush.position.set(ox * scale, crownBaseY + oy * scale, oz * scale);
      bush.scale.y = 0.78;
      bush.castShadow = true;
      grp.add(bush);
    }

    this.group.add(grp);
    this.colliders.addCylinder(x, z, r + 0.04, gy, gy + (potted ? 1.45 : 0.95) * scale, name);
  }

  _addPergola(x, z, w = 3.5, d = 2.9, stripe = 'saffron', rot = 0) {
    const gy = getGroundY(x, z);
    if (this.colliders.hasOverlapXZ(x, z, Math.max(w, d) * 0.52, 0.95, gy, gy + 2.8)) return;
    const grp = new THREE.Group();
    grp.name = 'pergolaWood';
    grp.position.set(x, gy, z);
    grp.rotation.y = rot;

    const hx = w * 0.43;
    const hz = d * 0.41;
    for (const [cx, cz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 2.6, 8), this.mats.wood);
      post.position.set(cx, 1.3, cz);
      post.castShadow = true;
      grp.add(post);
    }

    const awnMat = stripe === 'turquoise' ? this.mats.awningTurq : this.mats.awningSaffron;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), awnMat);
    canopy.position.set(0, 2.62, 0);
    canopy.castShadow = true;
    grp.add(canopy);
    this._addHangingLantern(grp, 0, 2.58, 0);

    this.group.add(grp);
    this.colliders.addBox(x, z, w + 0.15, d + 0.15, gy, gy + 2.8, rot, 'pergolaWood', true);
  }

  _buildCourtyardProps() {
    // Non-solid geometric courtyard tile patios & stone border + stepping stones down the lane
    this._addGroundTile(0.4, 1.4, 7.6, 11.4, 0, true);
    this._addGroundTile(-6.0, -2.0, 3.6, 3.2, 0.08, false);
    this._addGroundTile(7.6, 4.6, 3.8, 3.2, 0, true);

    for (let z = 9.2; z <= 80.0; z += 3.2) {
      const gy = getGroundY(0, z);
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.22, 0.035, 8), this.mats.stoneWarm);
      stone.name = 'pathStone';
      stone.position.set(Math.sin(z * 0.18) * 0.45, gy + 0.015, z);
      stone.scale.set(1.25, 1, 0.85);
      stone.receiveShadow = true;
      markNonSolid(stone, 'nonsolid');
      this.group.add(stone);
    }

    // Low adobe courtyard enclosure with clear opening toward village lane
    this._addWall(1.3, -10.5, 6.2, 1.45, 0.55, 0);
    this._addWall(-7.0, 9.8, 4.2, 1.25, 0.55, 0);
    this._addWall(7.0, 9.8, 4.4, 1.25, 0.55, 0);

    // Wooden pergola with striped shade & hanging brass lantern on east side of courtyard
    this._addPergola(7.6, 4.6, 3.4, 2.8, 'saffron', 0);

    // Wordless terracotta postbox beside courtyard gate (zero text/numbers)
    {
      const bx = -3.6, bz = 10.7;
      const gy = getGroundY(bx, bz);
      if (!this.colliders.hasOverlapXZ(bx, bz, 0.4, 0.9, gy, gy + 1.6)) {
        const grp = new THREE.Group();
        grp.name = 'postbox';
        grp.position.set(bx, gy, bz);

        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.05, 8), this.mats.wood);
        stand.position.y = 0.525;
        stand.castShadow = true;
        grp.add(stand);

        const box = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.32), this.mats.terracottaWarm);
        box.position.y = 1.2;
        box.castShadow = true;
        grp.add(box);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.18, 4), this.mats.turquoise);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 1.47;
        grp.add(roof);

        this.group.add(grp);
        this.colliders.addCylinder(bx, bz, 0.36, gy, gy + 1.62, 'postbox');
      }
    }

    // Courtyard gate lamp & lane lamps (spaced >= 1.1m clear of walls and piers)
    this._addLamp(3.3, 11.4, 2.5, -1);
    this._addLamp(-4.4, 23.0, 2.7, 1);
    this._addLamp(4.6, 45.5, 2.7, -1);
    this._addLamp(-4.6, 58.0, 2.7, 1);
    this._addLamp(4.8, 82.0, 2.7, -1);

    // Courtyard clay jars & potted olive shrubs (each spaced >= 1.1m clear)
    this._addJar(-3.1, -3.5, 1.05, 'turquoise');
    this._addJar(5.6, -3.5, 0.95, 'turquoise');
    this._addShrub(3.8, -4.1, 1.0, true);
    this._addShrub(-6.2, 6.4, 1.05, true);
    this._addShrub(-6.0, -2.5, 0.9, true);
  }

  _buildStallsAndWell() {
    for (const st of VILLAGE_STALLS) {
      const gy = getGroundY(st.x, st.z);
      if (this.colliders.hasOverlapXZ(st.x, st.z, 2.0, 0.85, gy, gy + 2.5)) continue;

      this._addGroundTile(st.x, st.z, 3.6, 2.6, st.rot, false);

      const grp = new THREE.Group();
      grp.name = 'stallAwning';
      grp.position.set(st.x, gy, st.z);
      grp.rotation.y = st.rot;

      for (const [px, pz] of [[-1.35, -0.75], [1.35, -0.75], [-1.35, 0.75], [1.35, 0.75]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.35, 6), this.mats.wood);
        post.position.set(px, 1.175, pz);
        post.castShadow = true;
        grp.add(post);
      }

      const awnMat = st.stripe === 'turquoise' ? this.mats.awningTurq : this.mats.awningSaffron;
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.07, 1.85), awnMat);
      canopy.position.set(0, 2.32, 0);
      canopy.rotation.x = 0.14;
      canopy.castShadow = true;
      grp.add(canopy);
      this._addHangingLantern(grp, 0, 2.28, 0.55);

      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.78, 0.9), this.mats.wood);
      counter.position.set(0, 0.39, 0);
      counter.castShadow = true;
      grp.add(counter);

      if (st.kind === 'pottery') {
        for (let i = -1; i <= 1; i++) {
          const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.14, 0.42, 10),
            i === 0 ? this.mats.turquoise : this.mats.terracottaWarm
          );
          pot.position.set(i * 0.68, 0.99, 0.04);
          grp.add(pot);
        }
      } else if (st.kind === 'rugs') {
        for (let i = -1; i <= 1; i++) {
          const roll = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 0.72, 10),
            i === 0 ? this.mats.saffron : this.mats.turquoise
          );
          roll.rotation.z = Math.PI / 2;
          roll.position.set(i * 0.72, 0.92, 0.04);
          grp.add(roll);
        }
      } else {
        for (let i = -1; i <= 1; i++) {
          const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.24, 10), this.mats.adobeLight);
          basket.position.set(i * 0.65, 0.9, 0.05);
          grp.add(basket);
          const spice = new THREE.Mesh(
            new THREE.ConeGeometry(0.2, 0.16, 10),
            i === 0 ? this.mats.turquoise : this.mats.saffron
          );
          spice.position.set(i * 0.65, 1.06, 0.05);
          grp.add(spice);
        }
      }

      this.group.add(grp);
      this.colliders.addBox(st.x, st.z, 3.05, 1.9, gy, gy + 2.5, st.rot, 'stallAwning', true);
    }

    // Village stone well with tiled apron
    {
      const w = VILLAGE_WELL;
      const gy = getGroundY(w.x, w.z);
      if (!this.colliders.hasOverlapXZ(w.x, w.z, w.r, 0.85, gy, gy + 2.5)) {
        this._addGroundTile(w.x, w.z, 4.2, 4.2, 0.2, true);

        const grp = new THREE.Group();
        grp.name = 'wellStone';
        grp.position.set(w.x, gy, w.z);

        const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.28, 0.85, 12), this.mats.stone);
        rim.position.y = 0.425;
        rim.castShadow = true;
        rim.receiveShadow = true;
        grp.add(rim);

        const water = new THREE.Mesh(new THREE.CircleGeometry(0.95, 12), this.mats.turquoise);
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.78;
        grp.add(water);

        for (const sx of [-0.95, 0.95]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.9, 6), this.mats.wood);
          post.position.set(sx, 1.35, 0);
          post.castShadow = true;
          grp.add(post);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.14), this.mats.wood);
        beam.position.y = 2.3;
        grp.add(beam);

        this.group.add(grp);
        this.colliders.addCylinder(w.x, w.z, 1.38, gy, gy + 2.45, 'wellStone');
      }
    }
  }

  _buildVillageCourtyards() {
    for (let i = 0; i < VILLAGE_COURTYARDS.length; i++) {
      const vc = VILLAGE_COURTYARDS[i];
      this._addGroundTile(vc.x, vc.z, vc.tileW, vc.tileD, vc.wallRot, true);
      const side = vc.x > 0 ? 1 : -1;
      if (vc.pergola) {
        this._addPergola(vc.x, vc.z, 3.0, 2.4, i % 2 === 0 ? 'turquoise' : 'saffron', vc.wallRot);
      } else {
        this._addWall(vc.x + side * 0.8, vc.z, vc.wallLen, 1.25, 0.5, vc.wallRot);
      }
      this._addJar(vc.x - side * 1.4, vc.z + 1.4, 0.92, i % 2 === 0 ? 'turquoise' : 'terracotta');
      this._addShrub(vc.x - side * 1.4, vc.z - 1.4, 0.95, true);
    }
  }

  _buildOasis() {
    // Wooden oasis dock extending cleanly from sandy shore onto spring edge
    const d = OASIS_DOCK;
    const dockDeckY = OASIS_WATER_Y + 0.34;
    const cosR = Math.cos(d.rot);
    const sinR = Math.sin(d.rot);
    const toWorld = (lx, lz) => [d.x + lx * cosR + lz * sinR, d.z - lx * sinR + lz * cosR];

    const pilingLocal = [[-2.1, -0.85], [0, -0.85], [2.1, -0.85], [-2.1, 0.85], [0, 0.85], [2.1, 0.85]];
    let minGround = 999;
    for (const [lx, lz] of pilingLocal) {
      const [wx, wz] = toWorld(lx, lz);
      minGround = Math.min(minGround, getGroundY(wx, wz));
    }

    const grp = new THREE.Group();
    grp.name = 'pierDock';
    grp.position.set(d.x, minGround, d.z);
    grp.rotation.y = d.rot;

    const deckLocalY = dockDeckY - minGround;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(d.length, 0.16, d.width), this.mats.wood);
    deck.position.y = deckLocalY;
    deck.castShadow = true;
    deck.receiveShadow = true;
    grp.add(deck);

    for (const [lx, lz] of pilingLocal) {
      const [wx, wz] = toWorld(lx, lz);
      const localGround = getGroundY(wx, wz) - minGround;
      const legH = Math.max(0.25, deckLocalY - localGround);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, legH, 6), this.mats.woodDark);
      leg.position.set(lx, localGround + legH * 0.5, lz);
      grp.add(leg);
    }

    const tipLocalX = -d.length * 0.5 + 0.35;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.05, 6), this.mats.woodDark);
    post.position.set(tipLocalX, deckLocalY + 0.52, -0.82);
    grp.add(post);

    const lanternMat = this.mats.lanternGlow.clone();
    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), lanternMat);
    lamp.position.set(tipLocalX, deckLocalY + 1.12, -0.82);
    grp.add(lamp);
    this.lanternGlows.push(lanternMat);

    this.group.add(grp);
    this.colliders.addBox(d.x, d.z, d.length, d.width, minGround, dockDeckY - 0.12, d.rot, 'pierDock');
    const [bolX, bolZ] = toWorld(tipLocalX, -0.82);
    this.colliders.addCylinder(bolX, bolZ, 0.32, dockDeckY, dockDeckY + 1.35, 'pierDockPost');

    // Animated non-solid ripples on oasis water
    for (let i = 0; i < 4; i++) {
      const rGeo = new THREE.RingGeometry(1.5 + i * 2.4, 1.66 + i * 2.4, 32);
      rGeo.rotateX(-Math.PI / 2);
      const rMat = new THREE.MeshBasicMaterial({
        color: '#6ce2da',
        transparent: true,
        opacity: 0.22 - i * 0.03,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.position.set(OASIS_POS.x, OASIS_WATER_Y + 0.03, OASIS_POS.z);
      ring.userData.baseScale = 1 + i * 0.15;
      ring.userData.phase = i * 1.4;
      markNonSolid(ring, 'fx');
      this.waterRipples.push(ring);
      this.group.add(ring);
    }

    // Oasis shoreline lanterns & clay jars (spaced cleanly clear of palms & dock)
    this._addLamp(OASIS_POS.x + 19.6, OASIS_POS.z - 0.5, 2.55, -1);
    this._addLamp(OASIS_POS.x + 12.2, OASIS_POS.z - 14.5, 2.55, 1);
    this._addJar(OASIS_POS.x + 18.6, OASIS_POS.z - 9.4, 1.12, 'turquoise');
  }

  _addPalm(x, z, h = 6.2, lean = 0.12, rot = 0) {
    if (isOverOasisWater(x, z)) return;
    const gy = getGroundY(x, z);
    if (this.colliders.hasOverlapXZ(x, z, 2.75, 0.8, -999, 999)) return;

    // Segmented curved date palm trunk (min.y = 0)
    const segs = 6;
    let cx = 0, cy = 0;
    const segH = h / segs;
    const grp = new THREE.Group();
    grp.name = 'treePalm';
    grp.position.set(x, gy, z);
    grp.rotation.y = rot;

    for (let i = 0; i < segs; i++) {
      const rBot = 0.26 - i * 0.022;
      const rTop = 0.22 - i * 0.022;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, segH + 0.06, 7), this.mats.trunk);
      const tilt = lean * (i + 0.5) / segs;
      seg.position.set(cx + Math.sin(tilt) * segH * 0.5, cy + segH * 0.5, 0);
      seg.rotation.z = -tilt;
      seg.castShadow = true;
      grp.add(seg);
      cx += Math.sin(tilt) * segH;
      cy += Math.cos(tilt) * segH;
    }

    const crownWX = x + Math.cos(rot) * cx;
    const crownWZ = z - Math.sin(rot) * cx;
    if (this.colliders.hasOverlapXZ(crownWX, crownWZ, 2.75, 0.8, -999, 999)) return;

    const dateCluster = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), this.mats.saffron);
    dateCluster.position.set(cx + 0.14, cy - 0.16, 0);
    grp.add(dateCluster);

    // Compact, realistic arched two-segment date palm fronds (max reach <= 2.32m)
    const crown = new THREE.Group();
    crown.position.set(cx, cy, 0);
    const frondCount = this.low ? 7 : 10;
    const innerGeo = new THREE.BoxGeometry(0.34, 0.04, 1.22);
    innerGeo.translate(0, 0, 0.61);
    const outerGeo = new THREE.ConeGeometry(0.30, 1.18, 4);
    outerGeo.scale(1.05, 1.0, 0.14);
    outerGeo.rotateX(Math.PI * 0.5);
    outerGeo.translate(0, 0, 0.59);

    for (let i = 0; i < frondCount; i++) {
      const a = (i / frondCount) * Math.PI * 2 + (i % 2) * 0.14;
      const frondGrp = new THREE.Group();
      frondGrp.rotation.y = a;

      const basePitch = i % 2 === 0 ? -0.26 : 0.06;
      const inner = new THREE.Mesh(innerGeo, this.mats.palm);
      inner.rotation.x = basePitch;
      inner.castShadow = true;
      frondGrp.add(inner);

      const outer = new THREE.Mesh(outerGeo, i % 2 === 0 ? this.mats.palmLight : this.mats.palm);
      outer.position.set(0, -Math.sin(basePitch) * 1.16, Math.cos(basePitch) * 1.16);
      outer.rotation.x = basePitch + 0.64;
      outer.castShadow = true;
      frondGrp.add(outer);

      crown.add(frondGrp);
    }
    grp.add(crown);

    this.group.add(grp);
    // Strict trunk + crown colliders enclosing full palm frond reach (2.32m -> 2.55m collider)
    this.colliders.addCylinder(x, z, 0.50, gy, gy + cy + 0.1, 'treePalm');
    this.colliders.addCylinder(crownWX, crownWZ, 2.55, gy + cy - 1.15, gy + cy + 1.35, 'treePalmCrown', true);
  }

  _addRock(x, z, scale = 1.2, rot = 0) {
    if (isOverOasisWater(x, z)) return;
    const gy = getGroundY(x, z);
    if (this.colliders.hasOverlapXZ(x, z, scale * 1.4, 0.9, -999, 999)) return;

    const grp = new THREE.Group();
    grp.name = 'rockDesert';
    grp.position.set(x, gy, z);
    grp.rotation.y = rot;

    const geo = new THREE.DodecahedronGeometry(scale, 0);
    geo.scale(1.25, 0.68, 1.05);
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox.min.y, 0);
    const rock = new THREE.Mesh(geo, this.mats.stone);
    rock.castShadow = true;
    rock.receiveShadow = true;
    grp.add(rock);

    const subGeo = new THREE.DodecahedronGeometry(scale * 0.54, 0);
    subGeo.scale(1.05, 0.6, 0.9);
    subGeo.computeBoundingBox();
    subGeo.translate(scale * 0.52, -subGeo.boundingBox.min.y, scale * 0.32);
    const sub = new THREE.Mesh(subGeo, this.mats.stoneWarm);
    sub.castShadow = true;
    grp.add(sub);

    this.group.add(grp);
    this.colliders.addCylinder(x, z, scale * 1.38, gy, gy + scale * 1.48, 'rockDesert');
  }

  _addCairn(x, z) {
    const gy = getGroundY(x, z);
    if (this.colliders.hasOverlapXZ(x, z, 0.8, 0.8, gy, gy + 2.2)) return;
    const grp = new THREE.Group();
    grp.name = 'cairnStone';
    grp.position.set(x, gy, z);

    const sizes = [[0.55, 0.42], [0.42, 0.38], [0.3, 0.34]];
    let yAcc = 0;
    for (const [r, h] of sizes) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 7), this.mats.stoneWarm);
      m.position.y = yAcc + h * 0.5;
      m.castShadow = true;
      grp.add(m);
      yAcc += h;
    }
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this.mats.turquoise);
    cap.position.y = yAcc + 0.2;
    grp.add(cap);

    this.group.add(grp);
    this.colliders.addCylinder(x, z, 0.68, gy, gy + yAcc + 0.48, 'cairnStone');
  }

  _buildPalmsAndRocks() {
    const rand = rng(904);

    // Rocks & cairns placed first on their flat pads
    for (const r of DESERT_ROCKS) {
      this._addRock(r.x, r.z, r.s, rand() * Math.PI * 2);
    }
    for (const c of DESERT_CAIRNS) {
      this._addCairn(c.x, c.z);
    }

    // Date palms around village edges (clear of houses & colonnade)
    const villagePalms = [
      [-17.8, 13.5, 6.2], [18.0, 13.5, 5.8], [-18.2, 37.5, 6.6], [20.5, 36.5, 6.4],
      [-18.8, 55.0, 6.8], [21.5, 67.5, 6.0], [-7.5, 74.5, 5.9], [16.5, 87.5, 6.5],
    ];
    for (const [x, z, h] of villagePalms) {
      this._addPalm(x, z, h, 0.08 + rand() * 0.09, rand() * Math.PI * 2);
    }

    // Date palm grove ringing the Oasis shore (clear around dock & spaced for zero overlap)
    const oasisPalms = 14;
    for (let i = 0; i < oasisPalms; i++) {
      const a = (i / oasisPalms) * Math.PI * 2 + 0.24;
      if (a > -0.68 && a < 0.22) continue;
      const rad = OASIS_RADIUS + 3.4 + (i % 2) * 3.8;
      const px = OASIS_POS.x + Math.cos(a) * rad;
      const pz = OASIS_POS.z + Math.sin(a) * rad;
      this._addPalm(px, pz, 5.2 + rand() * 2.2, 0.08 + rand() * 0.07, rand() * Math.PI * 2);
    }

    // Oasis shoreline olive/sage shrubs in wide gaps between palms
    for (let i = 0; i < 14; i++) {
      const a = ((i + 0.5) / 14) * Math.PI * 2 + 0.2;
      if (a > -0.62 && a < 0.18) continue;
      const rad = OASIS_RADIUS + 2.2 + (i % 2) * 3.0;
      const sx = OASIS_POS.x + Math.cos(a) * rad;
      const sz = OASIS_POS.z + Math.sin(a) * rad;
      this._addShrub(sx, sz, 0.85 + rand() * 0.3, false, 'shrubOasis');
    }

    // Water-edge reed clusters (non-solid botanical tufts)
    const reedGeo = new THREE.CylinderGeometry(0.018, 0.032, 0.95, 5);
    reedGeo.translate(0, 0.475, 0);
    const reedCount = this.low ? 16 : 34;
    for (let i = 0; i < reedCount; i++) {
      const a = (i / reedCount) * Math.PI * 2 + rand() * 0.15;
      if (a > -0.58 && a < 0.12) continue;
      const rad = OASIS_RADIUS - 0.05 + rand() * 1.1;
      const rx = OASIS_POS.x + Math.cos(a) * rad;
      const rz = OASIS_POS.z + Math.sin(a) * rad;
      const gy = Math.max(getGroundY(rx, rz), OASIS_WATER_Y - 0.12);
      const grp = new THREE.Group();
      grp.name = 'reedOasis';
      grp.position.set(rx, gy, rz);
      for (let k = 0; k < 4; k++) {
        const blade = new THREE.Mesh(reedGeo, this.mats.reed);
        blade.position.set((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
        blade.rotation.set((rand() - 0.5) * 0.35, rand() * Math.PI, (rand() - 0.5) * 0.35);
        blade.scale.y = 0.7 + rand() * 0.55;
        grp.add(blade);
      }
      markNonSolid(grp, 'nonsolid');
      this.group.add(grp);
    }

    // Organic low desert rosette bushes & flowering cushions (non-solid, no bare triangles)
    const rosetteGeo = new THREE.DodecahedronGeometry(0.22, 0);
    rosetteGeo.scale(1.35, 0.52, 1.35);
    rosetteGeo.translate(0, 0.09, 0);
    const tuftCount = this.low ? 24 : 58;
    for (let i = 0; i < tuftCount; i++) {
      const nearOasis = i > 20;
      const cx = nearOasis ? OASIS_POS.x + (rand() - 0.5) * 48 : (rand() < 0.5 ? -1 : 1) * (6.6 + rand() * 12);
      const cz = nearOasis ? OASIS_POS.z + (rand() - 0.5) * 48 : 13 + rand() * 68;
      if (isOverOasisWater(cx, cz)) continue;
      const gy = getGroundY(cx, cz);
      const tuft = new THREE.Mesh(rosetteGeo, i % 5 === 0 ? this.mats.saffron : this.mats.sage);
      tuft.name = 'desertFlora';
      tuft.position.set(cx, gy, cz);
      tuft.rotation.y = rand() * Math.PI;
      tuft.scale.setScalar(0.8 + rand() * 0.65);
      markNonSolid(tuft, 'nonsolid');
      this.group.add(tuft);
    }
  }

  update(t) {
    for (let i = 0; i < this.waterRipples.length; i++) {
      const r = this.waterRipples[i];
      const cyc = (t * 0.28 + r.userData.phase) % 1;
      r.scale.setScalar(r.userData.baseScale + cyc * 0.35);
      r.material.opacity = (1 - cyc) * 0.2;
    }
  }
}
