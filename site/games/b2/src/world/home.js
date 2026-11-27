import * as THREE from '../../lib/three.module.js';
import { HOME_POS, LAYER_MAIN, LAYER_REFLECT, PALETTE, PLANE_LAND_YARD } from '../core/env.js';
import { rng } from '../core/math.js';
import {
  getGroundY,
  registerBoxCollider,
  registerCylCollider,
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

function makeMaterials() {
  return {
    cedar: new THREE.MeshStandardMaterial({ color: PALETTE.cedarWood, roughness: 0.86, metalness: 0.02 }),
    darkTimber: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3726'), roughness: 0.88 }),
    plaster: new THREE.MeshStandardMaterial({ color: PALETTE.plasterWhite, roughness: 0.9 }),
    kawara: new THREE.MeshStandardMaterial({ color: PALETTE.kawaraSlate, roughness: 0.72, metalness: 0.12 }),
    shoji: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f7f0dc'),
      emissive: new THREE.Color('#ffe0a6'),
      emissiveIntensity: 0.16,
      roughness: 0.85,
    }),
    stone: new THREE.MeshStandardMaterial({ color: PALETTE.graniteStone, roughness: 0.92 }),
    mossStone: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b7766'), roughness: 0.94 }),
    indigo: new THREE.MeshStandardMaterial({ color: PALETTE.indigo, roughness: 0.88, side: THREE.DoubleSide }),
    linen: new THREE.MeshStandardMaterial({ color: new THREE.Color('#ece5d4'), roughness: 0.9, side: THREE.DoubleSide }),
    yamabuki: new THREE.MeshStandardMaterial({ color: PALETTE.yamabuki, roughness: 0.65 }),
    mailboxBlue: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3e5d84'), roughness: 0.62, metalness: 0.15 }),
    ceramic: new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a4232'), roughness: 0.45, metalness: 0.08 }),
    foliageA: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4b7939'), roughness: 0.86 }),
    foliageB: new THREE.MeshStandardMaterial({ color: new THREE.Color('#5f8f46'), roughness: 0.84 }),
    foliageC: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6c9b50'), roughness: 0.84 }),
    poolSurface: new THREE.MeshStandardMaterial({ color: new THREE.Color('#86b5cc'), roughness: 0.12, metalness: 0.35 }),
  };
}

function buildJapaneseHouse(mats, { width = 8.4, depth = 5.4, wallH = 2.8, hasEngawa = true, hasNoren = true }) {
  const g = new THREE.Group();

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.34, depth + 0.3), mats.stone);
  plinth.position.y = 0.17;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  g.add(plinth);

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, depth), mats.plaster);
  body.position.y = 0.34 + wallH * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const wainscot = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 1.15, depth + 0.04), mats.cedar);
  wainscot.position.y = 0.34 + 0.575;
  wainscot.castShadow = true;
  wainscot.receiveShadow = true;
  g.add(wainscot);

  const postGeo = new THREE.BoxGeometry(0.18, wallH + 0.1, 0.18);
  const px = width * 0.5 - 0.05;
  const pz = depth * 0.5 - 0.05;
  for (const sx of [-px, 0, px]) {
    for (const sz of [-pz, pz]) {
      const post = new THREE.Mesh(postGeo, mats.darkTimber);
      post.position.set(sx, 0.34 + wallH * 0.5, sz);
      post.castShadow = true;
      g.add(post);
    }
  }

  for (const sx of [-width * 0.25, width * 0.22]) {
    const shoji = new THREE.Mesh(new THREE.BoxGeometry(width * 0.32, 1.95, 0.06), mats.shoji);
    shoji.position.set(sx, 0.34 + 1.05, depth * 0.5 + 0.02);
    g.add(shoji);
    for (let b = -1; b <= 1; b++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.95, 0.08), mats.darkTimber);
      bar.position.set(sx + b * (width * 0.09), 0.34 + 1.05, depth * 0.5 + 0.03);
      g.add(bar);
    }
  }

  if (hasEngawa) {
    const engawa = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 0.14, 1.15), mats.cedar);
    engawa.position.set(0, 0.38, depth * 0.5 + 0.58);
    engawa.castShadow = true;
    engawa.receiveShadow = true;
    g.add(engawa);

    for (const sx of [-width * 0.38, 0, width * 0.38]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.14), mats.darkTimber);
      leg.position.set(sx, 0.17, depth * 0.5 + 1.05);
      g.add(leg);
    }

    const eaves = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.12, 1.45), mats.kawara);
    eaves.position.set(0, 0.34 + wallH - 0.12, depth * 0.5 + 0.65);
    eaves.rotation.x = 0.24;
    eaves.castShadow = true;
    g.add(eaves);
  }

  if (hasNoren) {
    for (let i = 0; i < 3; i++) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.85), mats.indigo);
      panel.position.set(width * 0.5 + 0.18, 2.25, -0.45 + i * 0.4);
      panel.rotation.y = Math.PI / 2;
      g.add(panel);
    }
  }

  const roofH = 1.95;
  const roofSpan = depth + 1.4;
  const roofLen = width + 1.3;
  const slopeLen = Math.hypot(roofSpan * 0.5, roofH);
  const slopeAngle = Math.atan2(roofH, roofSpan * 0.5);

  const roofBaseY = 0.34 + wallH;
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.16, slopeLen), mats.kawara);
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
  gable.castShadow = true;
  g.add(gable);

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(roofLen + 0.15, 0.24, 0.32), mats.kawara);
  ridge.position.set(0, roofBaseY + roofH + 0.05, 0);
  ridge.castShadow = true;
  g.add(ridge);

  return g;
}

function makeNaturalCanopyGeo(radius, seed) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 3.7 + seed) * Math.cos(y * 4.1 - seed) * Math.sin(z * 3.9 + seed * 0.5);
    const s = 1 + n * 0.18;
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildGardenTree(mats, seed, scale = 1.0) {
  const r = rng(seed);
  const g = new THREE.Group();

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * scale, 0.24 * scale, 2.35 * scale, 8), mats.darkTimber);
  trunk.position.y = 1.175 * scale;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  const boughAngles = [0.25, 1.85, 3.55, 5.1];
  const fMats = [mats.foliageA, mats.foliageB, mats.foliageC];
  for (let i = 0; i < boughAngles.length; i++) {
    const ang = boughAngles[i] + r() * 0.35;
    const reach = (0.7 + r() * 0.32) * scale;
    const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * scale, 0.105 * scale, 1.35 * scale, 6), mats.darkTimber);
    bough.position.set(Math.cos(ang) * 0.38 * scale, 2.15 * scale, Math.sin(ang) * 0.38 * scale);
    bough.rotation.z = -Math.cos(ang) * 0.56;
    bough.rotation.x = Math.sin(ang) * 0.56;
    bough.castShadow = true;
    g.add(bough);

    const crown = new THREE.Mesh(makeNaturalCanopyGeo((0.72 + r() * 0.18) * scale, seed + i * 7), fMats[i % 3]);
    crown.scale.set(1.25, 0.68, 1.15);
    crown.position.set(Math.cos(ang) * reach, (2.65 + r() * 0.45) * scale, Math.sin(ang) * reach);
    crown.castShadow = true;
    crown.receiveShadow = true;
    g.add(crown);
  }

  const topCrown = new THREE.Mesh(makeNaturalCanopyGeo(0.92 * scale, seed + 41), mats.foliageB);
  topCrown.scale.set(1.22, 0.74, 1.15);
  topCrown.position.set(0, 3.35 * scale, 0);
  topCrown.castShadow = true;
  topCrown.receiveShadow = true;
  g.add(topCrown);

  return g;
}

export class HomeGarden {
  constructor(opts = {}) {
    this.group = new THREE.Group();
    this.group.name = 'homeGarden';
    this.clothMeshes = [];

    const mats = makeMaterials();
    const y0 = HOME_POS.y; // 14.0

    // 1. Main traditional Japanese house with engawa facing +X into the sunlit yard
    const mainHouse = buildJapaneseHouse(mats, {
      width: 8.4,
      depth: 5.2,
      wallH: 2.85,
      hasEngawa: true,
      hasNoren: true,
    });
    mainHouse.name = 'houseMain';
    mainHouse.rotation.y = Math.PI / 2;
    snapToGround(mainHouse, -8.2, 1.5);
    markReflect(mainHouse);
    this.group.add(mainHouse);
    registerBoxCollider('houseMain', -8.2, 1.5, 3.7, 4.5, y0, y0 + 5.3);

    // 2. Neighbor house visible across the west stone wall
    const neighbor = buildJapaneseHouse(mats, {
      width: 7.4,
      depth: 5.0,
      wallH: 2.6,
      hasEngawa: false,
      hasNoren: false,
    });
    neighbor.name = 'houseNeighbor';
    neighbor.rotation.y = 0.25;
    snapToGround(neighbor, -20.2, 14.5);
    markReflect(neighbor);
    this.group.add(neighbor);
    registerBoxCollider('houseNeighbor', -20.2, 14.5, 4.3, 3.3, y0, y0 + 4.9);

    // 3. Small cedar garden shed / firewood shelter on east side (from Round 2 B)
    const shed = new THREE.Group();
    shed.name = 'gardenShed';
    const shedBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 1.8), mats.stone);
    shedBase.position.y = 0.11;
    const shedBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.75, 1.6), mats.cedar);
    shedBody.position.y = 1.09;
    const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 2.0), mats.kawara);
    shedRoof.position.y = 2.05;
    shedRoof.rotation.z = -0.14;
    [shedBase, shedBody, shedRoof].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
    shed.add(shedBase, shedBody, shedRoof);
    snapToGround(shed, 11.4, -1.6);
    markReflect(shed);
    this.group.add(shed);
    registerBoxCollider('gardenShed', 11.4, -1.6, 1.3, 1.0, y0, y0 + 2.2);

    // 4. Stone tsukubai basin beside the engawa (named without "water" so physics scanner includes it)
    const basinGrp = new THREE.Group();
    basinGrp.name = 'tsukubaiBasin';
    const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.56, 10), mats.mossStone);
    bBase.position.y = 0.28;
    bBase.castShadow = true;
    bBase.receiveShadow = true;
    const bPool = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12).rotateX(-Math.PI / 2), mats.poolSurface);
    bPool.position.y = 0.57;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 6), mats.foliageB);
    spout.position.set(0.32, 0.45, 0);
    spout.rotation.z = 0.4;
    basinGrp.add(bBase, bPool, spout);
    snapToGround(basinGrp, -2.4, -2.2);
    this.group.add(basinGrp);
    registerCylCollider('tsukubaiBasin', -2.4, -2.2, 0.55, y0, y0 + 0.8);

    // 5. Ceramic jar (kame) near engawa corner (from Round 2 B)
    const jar = new THREE.Group();
    jar.name = 'ceramicJar';
    const jarBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.48, 12), mats.ceramic);
    jarBody.position.y = 0.24;
    jarBody.castShadow = true;
    const jarPool = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10).rotateX(-Math.PI / 2), mats.poolSurface);
    jarPool.position.y = 0.47;
    jar.add(jarBody, jarPool);
    snapToGround(jar, -3.4, -0.4);
    this.group.add(jar);
    registerCylCollider('ceramicJar', -3.4, -0.4, 0.34, y0, y0 + 0.55);

    // 6. Cedar garden bench beside front yard (from Round 2 B)
    const bench = new THREE.Group();
    bench.name = 'gardenBench';
    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.09, 1.5), mats.cedar);
    benchTop.position.y = 0.42;
    benchTop.castShadow = true;
    benchTop.receiveShadow = true;
    bench.add(benchTop);
    for (const sz of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.12), mats.darkTimber);
      leg.position.set(0, 0.19, sz);
      leg.castShadow = true;
      bench.add(leg);
    }
    snapToGround(bench, -2.8, 4.6);
    this.group.add(bench);
    registerBoxCollider('gardenBench', -2.8, 4.6, 0.35, 0.82, y0, y0 + 0.5);

    // 7. Granite stone lantern (toro) near front corner of engawa
    const lantern = new THREE.Group();
    lantern.name = 'stoneLantern';
    const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.16, 6), mats.mossStone);
    lBase.position.y = 0.08;
    const lPost = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.72, 8), mats.stone);
    lPost.position.y = 0.52;
    const lBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.38), mats.stone);
    lBox.position.y = 1.04;
    const lGlow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), mats.shoji);
    lGlow.position.y = 1.04;
    const lCap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.28, 6), mats.mossStone);
    lCap.position.y = 1.34;
    [lBase, lPost, lBox, lCap].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
    lantern.add(lBase, lPost, lBox, lGlow, lCap);
    snapToGround(lantern, -3.2, 7.6);
    this.group.add(lantern);
    registerCylCollider('stoneLantern', -3.2, 7.6, 0.45, y0, y0 + 1.5);

    // 8. Wordless rural postbox on cedar post (zero letters or numbers)
    const postbox = new THREE.Group();
    postbox.name = 'postbox';
    const mbPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.14), mats.darkTimber);
    mbPost.position.y = 0.525;
    const mbBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.32), mats.mailboxBlue);
    mbBody.position.y = 1.15;
    const mbRoof = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.38), mats.cedar);
    mbRoof.position.y = 1.35;
    [mbPost, mbBody, mbRoof].forEach((m) => { m.castShadow = true; });
    postbox.add(mbPost, mbBody, mbRoof);
    postbox.rotation.y = -0.3;
    snapToGround(postbox, 5.8, 9.4);
    this.group.add(postbox);
    registerCylCollider('postbox', 5.8, 9.4, 0.42, y0, y0 + 1.4);

    // 9. Clothesline bamboo rack with fluttering plain indigo & natural linen cloth
    const rack = new THREE.Group();
    rack.name = 'laundryRack';
    for (const sx of [-1.25, 1.25]) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.85, 6), mats.cedar);
      stand.position.set(sx, 0.925, 0);
      stand.castShadow = true;
      rack.add(stand);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.8, 6), mats.foliageB);
    pole.rotation.z = Math.PI / 2;
    pole.position.y = 1.72;
    pole.castShadow = true;
    rack.add(pole);

    const clothConfigs = [
      { x: -0.58, w: 0.72, h: 0.95, mat: mats.indigo },
      { x: 0.48, w: 0.85, h: 1.05, mat: mats.linen },
    ];
    for (const cfg of clothConfigs) {
      const geo = new THREE.PlaneGeometry(cfg.w, cfg.h, 4, 6);
      geo.translate(0, -cfg.h * 0.5, 0);
      const cloth = new THREE.Mesh(geo, cfg.mat);
      cloth.position.set(cfg.x, 1.72, 0);
      cloth.castShadow = true;
      cloth.userData.basePos = geo.attributes.position.array.slice();
      rack.add(cloth);
      this.clothMeshes.push(cloth);
    }
    rack.rotation.y = -0.25;
    snapToGround(rack, 7.6, 0.4);
    this.group.add(rack);
    registerBoxCollider('laundryRack', 7.6, 0.4, 1.45, 0.45, y0, y0 + 1.85);

    // 10. Garden stone walls & wooden fences (strictly separated segments)
    const addStoneWall = (name, x, z, lenX, lenZ) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(lenX, 0.78, lenZ), mats.mossStone);
      wall.name = name;
      wall.position.set(x, y0 + 0.39, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.group.add(wall);
      registerBoxCollider(name, x, z, lenX * 0.5, lenZ * 0.5, y0, y0 + 0.82);
    };
    addStoneWall('stoneWallWest', -14.2, 4.0, 0.65, 14.0);
    addStoneWall('stoneWallFrontRight', 9.2, 12.2, 6.2, 0.62);

    const buildWoodFence = (name, cx, cz, len, alongX = true) => {
      const fg = new THREE.Group();
      fg.name = name;
      const posts = Math.max(2, Math.round(len / 1.8) + 1);
      for (let i = 0; i < posts; i++) {
        const off = -len * 0.5 + (len * i) / (posts - 1);
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.92, 0.11), mats.darkTimber);
        p.position.set(alongX ? off : 0, 0.46, alongX ? 0 : off);
        p.castShadow = true;
        fg.add(p);
      }
      for (const ry of [0.35, 0.72]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(alongX ? len : 0.07, 0.11, alongX ? 0.07 : len),
          mats.cedar
        );
        rail.position.y = ry;
        rail.castShadow = true;
        fg.add(rail);
      }
      snapToGround(fg, cx, cz);
      this.group.add(fg);
      registerBoxCollider(
        name,
        cx,
        cz,
        alongX ? len * 0.5 : 0.12,
        alongX ? 0.12 : len * 0.5,
        y0,
        y0 + 0.95
      );
    };
    buildWoodFence('fenceFrontLeft', -7.2, 12.2, 10.0, true);
    buildWoodFence('fenceEast', 13.8, 2.2, 16.5, false);

    // 11. Garden broadleaf trees (clear of buildings & fences)
    const treeSpecs = [
      { name: 'gardenTreeEast', x: 10.6, z: 6.4, s: 1.02, seed: 11 },
      { name: 'gardenTreeWest', x: -10.8, z: 9.6, s: 0.92, seed: 22 },
      { name: 'gardenTreeNorth', x: 9.6, z: -7.4, s: 1.05, seed: 33 },
    ];
    for (const ts of treeSpecs) {
      const tree = buildGardenTree(mats, ts.seed, ts.s);
      tree.name = ts.name;
      snapToGround(tree, ts.x, ts.z);
      markReflect(tree);
      this.group.add(tree);
      registerCylCollider(ts.name, ts.x, ts.z, 0.65 * ts.s, y0, y0 + 4.3 * ts.s);
    }

    // 12. Grounded yamabuki flowering shrubs along fence & wall edges (nonsolid)
    const shrubSpots = [
      [-12.6, 1.5], [-12.6, 6.2], [7.2, 11.2], [11.2, 11.2],
      [12.6, 2.5], [12.6, 8.2], [-4.8, 11.4], [-9.2, 11.4],
    ];
    for (let i = 0; i < shrubSpots.length; i++) {
      const [sx, sz] = shrubSpots[i];
      const sh = new THREE.Group();
      sh.name = `gardenShrub_${i}`;
      sh.userData.nonsolid = true;
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mats.foliageA);
      bush.scale.set(1.2, 0.72, 1.1);
      bush.position.y = 0.25;
      sh.add(bush);
      for (let f = 0; f < 4; f++) {
        const ang = (f / 4) * Math.PI * 2 + i;
        const fl = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), mats.yamabuki);
        fl.position.set(Math.cos(ang) * 0.28, 0.42 + (f % 2) * 0.08, Math.sin(ang) * 0.26);
        sh.add(fl);
      }
      sh.position.set(sx, y0, sz);
      this.group.add(sh);
    }

    // 13. Stepping stones (flush flat stones marked nonsolid)
    const stones = [
      [-3.5, 1.8],
      [-2.1, 3.0],
      [-1.0, 4.3],
      [-0.4, 6.2],
      [0.6, 8.0],
      [2.1, 9.4],
      [3.3, 11.2],
      [3.7, 13.0],
    ];
    for (let i = 0; i < stones.length; i++) {
      const [sx, sz] = stones[i];
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.36 + (i % 2) * 0.06, 0.42 + (i % 2) * 0.06, 0.06, 9), mats.stone);
      st.name = `steppingStone_${i}`;
      st.userData.nonsolid = true;
      st.position.set(sx, getGroundY(sx, sz) + 0.015, sz);
      st.scale.set(1.12, 1.0, 0.88);
      st.rotation.y = i * 0.7;
      st.receiveShadow = true;
      this.group.add(st);
    }

    // 14. Instanced curved grass tufts around the yard (nonsolid)
    this._buildYardFoliage(opts.grassCount || 1400, stones);
  }

  _buildYardFoliage(count, stones) {
    const r = rng(404);
    const positions = [
      -0.03, 0, 0,  0.03, 0, 0,  0.02, 0.28, 0.04,
      0, 0, -0.03,  0, 0, 0.03,  -0.04, 0.25, 0.02,
    ];
    const bladeGeo = new THREE.BufferGeometry();
    bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bladeGeo.computeVertexNormals();
    const bladeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#619044'),
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, count);
    blades.name = 'yardGrass';
    blades.userData.nonsolid = true;
    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < count * 2.5 && placed < count; i++) {
      const x = (r() - 0.5) * 34;
      const z = (r() - 0.4) * 28;
      if (x > -12.5 && x < -3.5 && z > -4.0 && z < 7.0) continue;
      if (x > -25.0 && x < -15.5 && z > 10.5 && z < 18.5) continue;
      if (x > 9.8 && x < 13.0 && z > -2.8 && z < -0.3) continue;
      if (Math.hypot(x - PLANE_LAND_YARD.x, z - PLANE_LAND_YARD.z) < 2.65) continue;
      let onStone = false;
      for (let s = 0; s < stones.length; s++) {
        if (Math.hypot(x - stones[s][0], z - stones[s][1]) < 0.72) { onStone = true; break; }
      }
      if (onStone) continue;

      const gy = getGroundY(x, z);
      dummy.position.set(x, gy - 0.01, z);
      dummy.rotation.set((r() - 0.5) * 0.22, r() * Math.PI * 2, (r() - 0.5) * 0.22);
      dummy.scale.set(0.9 + r() * 0.6, 0.7 + r() * 0.75, 0.9 + r() * 0.6);
      dummy.updateMatrix();
      blades.setMatrixAt(placed++, dummy.matrix);
    }
    blades.count = placed;
    blades.instanceMatrix.needsUpdate = true;
    this.group.add(blades);
  }

  update(t) {
    for (let c = 0; c < this.clothMeshes.length; c++) {
      const mesh = this.clothMeshes[c];
      const pos = mesh.geometry.attributes.position;
      const base = mesh.userData.basePos;
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        const hang = Math.max(0, -by);
        const wave = Math.sin(t * 2.4 + bx * 3.0 - by * 2.2 + c * 1.3) * 0.11 * hang;
        const sway = Math.cos(t * 1.5 + c) * 0.05 * hang;
        pos.setZ(i, wave + sway);
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }
}
