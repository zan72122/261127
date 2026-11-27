import * as THREE from '../../lib/three.module.js';
import { OBSERVATORY_POS, PALETTE, markNonSolid } from '../core/env.js';
import { makeAdobeTexture, makeCourtyardTileTexture, makeZelligeTexture } from '../core/textures.js';

export class ObservatorySanctuary {
  constructor(colliders, { low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'observatorySanctuary';
    this.group.position.copy(OBSERVATORY_POS);

    const gy = OBSERVATORY_POS.y;
    const adobeTex = low ? null : makeAdobeTexture();
    const zelligeTex = low ? null : makeZelligeTexture();
    const tileTex = low ? null : makeCourtyardTileTexture(6, 6);

    const creamMat = new THREE.MeshStandardMaterial({ color: PALETTE.creamCloth, map: adobeTex, roughness: 0.8 });
    const adobeMat = new THREE.MeshStandardMaterial({ color: PALETTE.adobeLight, map: adobeTex, roughness: 0.86 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#9c8168', roughness: 0.88 });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#6b4730', roughness: 0.86 });
    const oliveMat = new THREE.MeshStandardMaterial({ color: PALETTE.oliveGreen, roughness: 0.84 });
    const copperMat = new THREE.MeshStandardMaterial({ color: '#397b74', roughness: 0.42, metalness: 0.55 });
    const brassMat = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.35, metalness: 0.78 });
    const zelligeMat = new THREE.MeshStandardMaterial({
      color: zelligeTex ? '#ffffff' : PALETTE.turquoise,
      map: zelligeTex,
      roughness: 0.46,
    });
    const plazaMat = new THREE.MeshStandardMaterial({
      color: tileTex ? '#ffffff' : '#c6956c',
      map: tileTex,
      roughness: 0.78,
    });
    const turqGlowMat = new THREE.MeshStandardMaterial({
      color: '#5ae8e0',
      emissive: '#22c2b8',
      emissiveIntensity: 1.55,
      roughness: 0.28,
    });
    const saffronGlowMat = new THREE.MeshStandardMaterial({
      color: '#ffd984',
      emissive: '#e59a28',
      emissiveIntensity: 1.35,
      roughness: 0.32,
    });

    // 0. Non-solid tiled mosaic hilltop terrace floor framing the Star Fountain & observatory
    const plazaDisk = new THREE.Mesh(new THREE.CylinderGeometry(14.8, 15.2, 0.04, 24), plazaMat);
    plazaDisk.name = 'terracePlaza';
    plazaDisk.position.set(0, 0.02, -0.8);
    plazaDisk.receiveShadow = true;
    markNonSolid(plazaDisk, 'nonsolid');
    this.group.add(plazaDisk);

    const plazaRim = new THREE.Mesh(new THREE.RingGeometry(14.6, 15.6, 24), stoneMat);
    plazaRim.name = 'terraceRim';
    plazaRim.rotation.x = -Math.PI / 2;
    plazaRim.position.set(0, 0.03, -0.8);
    markNonSolid(plazaRim, 'nonsolid');
    this.group.add(plazaRim);

    // 1. Astronomical Observatory Building & Copper Dome set well behind plaza at local (0, 0, +8.4)
    const obsZ = 8.4;
    const obsGrp = new THREE.Group();
    obsGrp.name = 'observatoryDome';
    obsGrp.position.set(0, 0, obsZ);

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.2, 1.4, 8), adobeMat);
    plinth.position.y = 0.7;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    obsGrp.add(plinth);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.0, 3.2, 16), creamMat);
    drum.position.y = 1.4 + 1.6;
    drum.castShadow = true;
    drum.receiveShadow = true;
    obsGrp.add(drum);

    const frieze = new THREE.Mesh(new THREE.CylinderGeometry(3.92, 3.92, 0.42, 16), zelligeMat);
    frieze.position.y = 4.35;
    obsGrp.add(frieze);

    // Arched observatory entrance facing the fountain plaza (-Z)
    const portal = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.3, 0.45), copperMat);
    portal.position.set(0, 2.55, -3.9);
    obsGrp.add(portal);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3.85, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.54),
      copperMat
    );
    dome.position.y = 4.55;
    dome.castShadow = true;
    obsGrp.add(dome);

    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.2, 12), brassMat);
    scope.position.set(0, 6.2, -2.1);
    scope.rotation.x = 0.85;
    scope.castShadow = true;
    obsGrp.add(scope);

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 2.2, 8), brassMat);
    spire.position.y = 9.1;
    obsGrp.add(spire);

    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.78, 1), turqGlowMat);
    beacon.position.y = 10.6;
    obsGrp.add(beacon);
    this.beacon = beacon;

    const haloGeo = new THREE.CylinderGeometry(0.32, 1.05, 6.0, 12, 1, true);
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#46e6dc',
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 13.4;
    markNonSolid(halo, 'fx');
    obsGrp.add(halo);
    this.beaconHalo = halo;

    this.group.add(obsGrp);
    // Tall single cylinder collider covering plinth, dome, telescope & spire with roofGuard deflection
    colliders.addCylinder(
      OBSERVATORY_POS.x,
      OBSERVATORY_POS.z + obsZ,
      5.45,
      gy,
      gy + 12.2,
      'observatoryDome',
      true
    );

    // 2. Octagonal Star Zellige Fountain in front courtyard at local (-3.2, 0, -5.6) -> world (8.8, 36, 386.4)
    const fx = -3.2, fz = -5.6;
    const fGrp = new THREE.Group();
    fGrp.name = 'fountainZellige';
    fGrp.position.set(fx, 0, fz);

    for (const rotY of [0, Math.PI / 4]) {
      const starBase = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.22, 3.35), stoneMat);
      starBase.position.y = 0.11;
      starBase.rotation.y = rotY;
      starBase.receiveShadow = true;
      fGrp.add(starBase);
    }

    const fBase = new THREE.Mesh(new THREE.CylinderGeometry(2.10, 2.24, 0.48, 8), zelligeMat);
    fBase.position.y = 0.34;
    fBase.castShadow = true;
    fBase.receiveShadow = true;
    fGrp.add(fBase);

    const curbMat = new THREE.MeshStandardMaterial({ color: PALETTE.creamCloth, map: adobeTex, roughness: 0.78 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.24, 0.26), i % 2 === 0 ? zelligeMat : curbMat);
      seg.position.set(Math.sin(a) * 1.94, 0.64, Math.cos(a) * 1.94);
      seg.rotation.y = a;
      seg.castShadow = true;
      seg.receiveShadow = true;
      fGrp.add(seg);
    }

    const fWater = new THREE.Mesh(
      new THREE.CylinderGeometry(1.82, 1.82, 0.08, 16),
      new THREE.MeshStandardMaterial({
        color: '#29aba2',
        emissive: '#146964',
        emissiveIntensity: 0.45,
        roughness: 0.52,
        metalness: 0.04,
      })
    );
    fWater.position.y = 0.60;
    fGrp.add(fWater);

    const fPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.4, 8), creamMat);
    fPillar.position.y = 1.14;
    fGrp.add(fPillar);

    const fBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.34, 0.34, 8), zelligeMat);
    fBowl.position.y = 1.68;
    fGrp.add(fBowl);

    const fStem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.52, 8), brassMat);
    fStem.position.y = 2.02;
    fGrp.add(fStem);

    const starFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.30, 0), turqGlowMat);
    starFinial.position.y = 2.40;
    fGrp.add(starFinial);
    this.fountainStar = starFinial;

    const jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.42, 0.90, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#88f7ee',
        transparent: true,
        opacity: 0.46,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    jet.position.y = 2.18;
    markNonSolid(jet, 'fx');
    fGrp.add(jet);
    this.fountainJet = jet;

    this.group.add(fGrp);
    colliders.addCylinder(
      OBSERVATORY_POS.x + fx,
      OBSERVATORY_POS.z + fz,
      2.55,
      gy,
      gy + 2.85,
      'fountainZellige',
      true
    );

    // 3. Brass Terrace Lanterns & Potted Olive Trees framing the arrival courtyard
    const lampOffsets = [[-8.6, -11.2], [8.6, -11.2], [-10.8, -0.8], [10.8, -0.8]];
    for (const [lx, lz] of lampOffsets) {
      const lGrp = new THREE.Group();
      lGrp.name = 'lampPost';
      lGrp.position.set(lx, 0, lz);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.32, 8), stoneMat);
      base.position.y = 0.16;
      lGrp.add(base);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.5, 8), woodMat);
      post.position.y = 1.25;
      post.castShadow = true;
      lGrp.add(post);
      const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), saffronGlowMat);
      lantern.position.y = 2.62;
      lGrp.add(lantern);
      this.group.add(lGrp);
      colliders.addCylinder(OBSERVATORY_POS.x + lx, OBSERVATORY_POS.z + lz, 0.35, gy, gy + 2.88, 'lampPost');
    }

    for (const [tx, tz] of [[-6.5, -11.8], [6.5, -11.8]]) {
      const sGrp = new THREE.Group();
      sGrp.name = 'shrubOlive';
      sGrp.position.set(tx, 0, tz);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.26, 0.5, 10), adobeMat);
      pot.position.y = 0.25;
      pot.castShadow = true;
      sGrp.add(pot);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.52, 6), woodMat);
      stem.position.y = 0.70;
      sGrp.add(stem);
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.54, 1), oliveMat);
      crown.position.y = 1.15;
      crown.scale.y = 0.8;
      crown.castShadow = true;
      sGrp.add(crown);
      this.group.add(sGrp);
      colliders.addCylinder(OBSERVATORY_POS.x + tx, OBSERVATORY_POS.z + tz, 0.58, gy, gy + 1.65, 'shrubOlive');
    }

    // Arrival carpet touch-down target world position right beside Star Fountain (well clear of dome & fountain)
    this.landingSpot = new THREE.Vector3(OBSERVATORY_POS.x + 2.9, gy, OBSERVATORY_POS.z - 5.4);
    this.fountainPos = new THREE.Vector3(OBSERVATORY_POS.x + fx, gy, OBSERVATORY_POS.z + fz);
    this.domePos = new THREE.Vector3(OBSERVATORY_POS.x, gy, OBSERVATORY_POS.z + obsZ);
  }

  update(t) {
    if (this.beacon) {
      this.beacon.rotation.y = t * 0.7;
      const pulse = 0.92 + Math.sin(t * 2.4) * 0.1;
      this.beacon.scale.setScalar(pulse);
    }
    if (this.beaconHalo) {
      this.beaconHalo.material.opacity = 0.16 + Math.sin(t * 2.0) * 0.06;
    }
    if (this.fountainJet) {
      this.fountainJet.scale.y = 0.9 + Math.sin(t * 6.5) * 0.1;
      this.fountainJet.rotation.y = t * 1.8;
    }
    if (this.fountainStar) {
      this.fountainStar.rotation.y = -t * 1.1;
      this.fountainStar.position.y = 2.40 + Math.sin(t * 2.6) * 0.05;
    }
  }
}
