import * as THREE from '../../lib/three.module.js';
import { PALETTE, markNonSolid } from '../core/env.js';
import { damp } from '../core/math.js';

export class Goat {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'goatGuide';
    this.pos = this.group.position;
    this.yaw = 0;
    this.mood = 'guide'; // 'guide' | 'ride' | 'arrive'
    this.trotSpeed = 0;
    this._t = 0;
    this._step = 0;

    const coatMat = new THREE.MeshStandardMaterial({ color: '#e8dcc7', roughness: 0.85 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#c4a682', roughness: 0.86 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: '#3b2b22', roughness: 0.78 });
    const hornMat = new THREE.MeshStandardMaterial({ color: '#7a5d46', roughness: 0.7 });
    const collarMat = new THREE.MeshStandardMaterial({ color: PALETTE.turquoise, roughness: 0.55 });
    const brassMat = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.35, metalness: 0.75 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: '#ffe59c',
      emissive: '#f2ac34',
      emissiveIntensity: 1.9,
      roughness: 0.25,
    });

    this.bodyRoot = new THREE.Group();
    this.group.add(this.bodyRoot);

    // Sculpted goat torso (slender horizontal cylinder + chest/rump tapering, never a sphere)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.155, 0.48, 10), coatMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.39, 0);
    barrel.scale.set(0.84, 1.0, 1.08);
    barrel.castShadow = true;
    this.bodyRoot.add(barrel);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), trimMat);
    chest.position.set(0, 0.40, 0.20);
    chest.scale.set(0.82, 0.96, 1.0);
    this.bodyRoot.add(chest);

    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), coatMat);
    rump.position.set(0, 0.39, -0.21);
    rump.scale.set(0.84, 0.95, 0.95);
    this.bodyRoot.add(rump);

    // Upright perky goat tail
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.14, 6), trimMat);
    tail.position.set(0, 0.49, -0.32);
    tail.rotation.x = -0.45;
    this.bodyRoot.add(tail);

    // Four slender legs
    this.legs = [];
    const legOffsets = [[-0.075, 0.17], [0.075, 0.17], [-0.078, -0.18], [0.078, -0.18]];
    for (const [lx, lz] of legOffsets) {
      const piv = new THREE.Group();
      piv.position.set(lx, 0.32, lz);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.021, 0.28, 6), coatMat);
      shin.position.y = -0.14;
      shin.castShadow = true;
      piv.add(shin);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.027, 0.045, 6), hoofMat);
      hoof.position.y = -0.295;
      piv.add(hoof);
      this.bodyRoot.add(piv);
      this.legs.push(piv);
    }

    // Neck, tapered head, floppy ears, curved horns
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.46, 0.22);
    this.bodyRoot.add(this.neck);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.095, 0.22, 8), coatMat);
    neckMesh.position.set(0, 0.09, 0.05);
    neckMesh.rotation.x = 0.42;
    neckMesh.castShadow = true;
    this.neck.add(neckMesh);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.22), coatMat);
    head.position.set(0, 0.20, 0.14);
    head.rotation.x = 0.2;
    head.castShadow = true;
    this.neck.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.11), trimMat);
    snout.position.set(0, 0.17, 0.25);
    snout.rotation.x = 0.22;
    this.neck.add(snout);

    const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b1412' });
    for (const sx of [-0.062, 0.062]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), eyeMat);
      eye.position.set(sx, 0.225, 0.17);
      this.neck.add(eye);

      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.05), trimMat);
      ear.position.set(sx * 1.45, 0.20, 0.08);
      ear.rotation.z = sx > 0 ? -0.55 : 0.55;
      ear.rotation.x = 0.2;
      this.neck.add(ear);

      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.11, 6), hornMat);
      horn.position.set(sx * 0.55, 0.295, 0.08);
      horn.rotation.x = -0.45;
      horn.rotation.z = sx > 0 ? -0.18 : 0.18;
      this.neck.add(horn);
    }

    // Turquoise collar + hanging glowing saffron-brass lantern (the visual guide!)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 6, 12), collarMat);
    collar.position.set(0, 0.06, 0.06);
    collar.rotation.x = Math.PI / 2 + 0.42;
    this.neck.add(collar);

    this.lantern = new THREE.Group();
    this.lantern.position.set(0, 0.02, 0.14);
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.11, 6), brassMat);
    frame.position.y = -0.07;
    this.lantern.add(frame);
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 0), glowMat);
    bulb.position.y = -0.07;
    this.lantern.add(bulb);
    this.neck.add(this.lantern);

    // Non-solid invitation ring on ground in courtyard
    const ringGeo = new THREE.RingGeometry(0.36, 0.46, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.inviteMat = new THREE.MeshBasicMaterial({
      color: PALETTE.saffron,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.inviteRing = new THREE.Mesh(ringGeo, this.inviteMat);
    this.inviteRing.position.y = 0.03;
    markNonSolid(this.inviteRing, 'fx');
    this.group.add(this.inviteRing);

    // Invisible tap hitbox (non-solid)
    this.hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitbox.position.y = 0.42;
    this.hitbox.userData.tapRole = 'goat';
    markNonSolid(this.hitbox, 'nonsolid');
    this.group.add(this.hitbox);
  }

  setInviteAlpha(a) {
    this.inviteRing.visible = a > 0.02;
    this.inviteMat.opacity = a * 0.72;
  }

  update(dt) {
    this._t += dt;
    this.group.rotation.y = this.yaw;

    if (this.mood === 'ride') {
      // Curled / perched calmly on the front corner of the carpet
      this.bodyRoot.position.y = damp(this.bodyRoot.position.y, -0.14, 10, dt);
      for (let i = 0; i < 4; i++) {
        this.legs[i].rotation.x = damp(this.legs[i].rotation.x, i < 2 ? -1.15 : 1.15, 10, dt);
      }
      this.neck.rotation.x = Math.sin(this._t * 2.2) * 0.06;
    } else {
      this.bodyRoot.position.y = damp(this.bodyRoot.position.y, 0, 10, dt);
      if (this.trotSpeed > 0.15) {
        this._step += dt * (4 + this.trotSpeed * 2.4);
        const s = Math.sin(this._step) * 0.42;
        this.legs[0].rotation.x = s;
        this.legs[1].rotation.x = -s;
        this.legs[2].rotation.x = -s;
        this.legs[3].rotation.x = s;
        this.bodyRoot.position.y = Math.abs(Math.cos(this._step)) * 0.04;
      } else {
        for (let i = 0; i < 4; i++) {
          this.legs[i].rotation.x = damp(this.legs[i].rotation.x, 0, 10, dt);
        }
        // Curious head nod toward carpet / girl
        this.neck.rotation.x = Math.sin(this._t * 2.5) * 0.08;
      }
    }

    // Gentle lantern swing
    this.lantern.rotation.z = Math.sin(this._t * 3.4) * 0.12;
    this.lantern.rotation.x = Math.cos(this._t * 2.6) * 0.08;
    if (this.inviteRing.visible) {
      const s = 1 + Math.sin(this._t * 3.0) * 0.1;
      this.inviteRing.scale.setScalar(s);
    }
  }
}
