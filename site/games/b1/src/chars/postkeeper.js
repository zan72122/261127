import * as THREE from '../../lib/three.module.js';
import { FEEDER_POS, OFFICE_POS, PALETTE } from '../core/env.js';
import { getGroundY } from '../world/terrain.js';

// Welcoming Lapland post-keeper at Hilltop Aurora Post Office + companion reindeer at post office & forest feeder
export class CompanionChars {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'companionChars';

    // Post-keeper standing right on the snow beside the post office steps (grounded at getGroundY, clear of porch AABB)
    this.keeper = new THREE.Group();
    this.keeper.name = 'postKeeper';
    const kx = OFFICE_POS.x + 2.35;
    const kz = OFFICE_POS.z - 6.85;
    const oy = getGroundY(kx, kz);
    this.keeper.position.set(kx, oy, kz);
    this.keeper.rotation.y = Math.PI + 0.38;

    const mCoat = new THREE.MeshStandardMaterial({ color: 0x294c3d, roughness: 0.84 });
    const mTrim = new THREE.MeshStandardMaterial({ color: PALETTE.amber, roughness: 0.8 });
    const mSkin = new THREE.MeshStandardMaterial({ color: 0xf2ccb4, roughness: 0.7 });
    const mBoot = new THREE.MeshStandardMaterial({ color: 0x4b301f, roughness: 0.82 });
    const mLamp = new THREE.MeshStandardMaterial({
      color: PALETTE.emeraldGlow,
      emissive: PALETTE.emerald,
      emissiveIntensity: 1.7,
    });

    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.62, 8), mBoot);
      leg.position.set(sx, 0.31, 0);
      leg.castShadow = true;
      this.keeper.add(leg);
    }
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.78, 10), mCoat);
    coat.position.y = 0.93;
    coat.castShadow = true;
    this.keeper.add(coat);

    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.036, 6, 12), mTrim);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.32;
    this.keeper.add(scarf);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), mSkin);
    head.position.y = 1.46;
    this.keeper.add(head);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.14, 10), mTrim);
    cap.position.y = 1.57;
    this.keeper.add(cap);

    this.waveArm = new THREE.Group();
    this.waveArm.position.set(-0.22, 1.24, 0);
    const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.44, 7), mCoat);
    armMesh.position.y = -0.2;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.16, 6), mLamp);
    lamp.position.set(0, -0.45, 0.08);
    this.waveArm.add(armMesh, lamp);
    this.keeper.add(this.waveArm);

    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.44, 7), mCoat);
    armL.position.set(0.22, 1.04, 0);
    this.keeper.add(armL);

    this.group.add(this.keeper);

    // Two gentle stationary wild reindeer (anatomical silhouettes, grounded cleanly at getGroundY)
    this._reindeerSpots = [
      [OFFICE_POS.x + 5.8, OFFICE_POS.z - 5.4, -2.25],
      [FEEDER_POS.x + 3.4, FEEDER_POS.z - 1.4, -1.8],
    ];
    for (const [rx, rz, rot] of this._reindeerSpots) {
      this._addRestingReindeer(rx, rz, rot);
    }
  }

  registerColliders(colliders) {
    const k = this.keeper.position;
    colliders.addCircle('postKeeper', k.x, k.z, 0.55, k.y - 0.1, k.y + 1.8);
    for (const [rx, rz] of this._reindeerSpots) {
      const ry = getGroundY(rx, rz);
      colliders.addCircle('wildReindeer', rx, rz, 0.85, ry - 0.1, ry + 2.1);
    }
  }

  _addRestingReindeer(x, z, rotY) {
    const g = new THREE.Group();
    g.name = 'wildReindeer';
    const y = getGroundY(x, z);
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const mCoat = new THREE.MeshStandardMaterial({ color: 0x8f8274, roughness: 0.85 });
    const mRuff = new THREE.MeshStandardMaterial({ color: 0xc9c2b8, roughness: 0.84 });
    const mAntler = new THREE.MeshStandardMaterial({ color: 0xc2b29c, roughness: 0.78 });
    const mHoof = new THREE.MeshStandardMaterial({ color: 0x262932, roughness: 0.65 });

    // Tapered anatomical body profile
    const pts = [
      new THREE.Vector2(0.01, -0.52),
      new THREE.Vector2(0.18, -0.42),
      new THREE.Vector2(0.21, -0.15),
      new THREE.Vector2(0.26, 0.15),
      new THREE.Vector2(0.23, 0.38),
      new THREE.Vector2(0.01, 0.48),
    ];
    const bodyGeo = new THREE.LatheGeometry(pts, 10);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.scale(0.68, 1.04, 1.0);
    const body = new THREE.Mesh(bodyGeo, mCoat);
    body.position.y = 0.96;
    body.castShadow = true;
    g.add(body);

    const ruff = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 8), mRuff);
    ruff.rotation.x = Math.PI * 0.78;
    ruff.position.set(0, 0.92, 0.40);
    g.add(ruff);

    for (const [lx, lz, hind] of [[-0.13, 0.30, false], [0.13, 0.30, false], [-0.13, -0.32, true], [0.13, -0.32, true]]) {
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.036, 0.44, 7), mCoat);
      upper.position.set(lx, 0.68, lz + (hind ? 0.02 : 0));
      upper.rotation.x = hind ? -0.16 : 0.06;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.44, 7), mCoat);
      lower.position.set(lx, 0.25, lz + (hind ? -0.04 : 0.01));
      lower.rotation.x = hind ? 0.12 : 0;
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.046, 0.06, 7), mHoof);
      hoof.position.set(lx, 0.03, lz + (hind ? -0.02 : 0.02));
      g.add(upper, lower, hoof);
    }

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.15, 0.46, 8), mCoat);
    neck.scale.set(0.76, 1, 1);
    neck.position.set(0, 1.18, 0.42);
    neck.rotation.x = 0.48;
    g.add(neck);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 8), mCoat);
    cranium.scale.set(0.8, 0.86, 1.12);
    cranium.position.set(0, 1.38, 0.56);
    g.add(cranium);

    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.080, 0.22, 7), mCoat);
    snout.rotation.x = Math.PI / 2 + 0.22;
    snout.position.set(0, 1.33, 0.69);
    g.add(snout);

    for (const sx of [-0.06, 0.06]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.42, 5), mAntler);
      ant.position.set(sx * 1.4, 1.62, 0.50);
      ant.rotation.set(-0.35, 0, -sx * 3.8);
      g.add(ant);
    }

    this.group.add(g);
  }

  update(t, joy = 0) {
    const wave = 2.4 + Math.sin(t * (3.5 + joy * 4)) * (0.32 + joy * 0.25);
    this.waveArm.rotation.x = -0.35;
    this.waveArm.rotation.z = -wave;
  }
}
