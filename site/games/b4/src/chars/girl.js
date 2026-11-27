import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';

export class Girl {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'girlProtagonist';
    this.pos = new THREE.Vector3(0, 1.35, -1.5);
    this.yaw = 0;

    const skinMat = new THREE.MeshStandardMaterial({ color: '#f3cfb4', roughness: 0.68 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#4d3122', roughness: 0.76 });
    const sweaterMat = new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.82 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: PALETTE.burntSienna, roughness: 0.8 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: PALETTE.lakeDeep, roughness: 0.84 });
    const tightMat = new THREE.MeshStandardMaterial({ color: '#2b3446', roughness: 0.88 });
    const bootMat = new THREE.MeshStandardMaterial({ color: '#5b3923', roughness: 0.72 });
    const clipMat = new THREE.MeshStandardMaterial({ color: PALETTE.lanternAmber, roughness: 0.4, metalness: 0.3 });

    this.body = new THREE.Group();
    this.group.add(this.body);

    // Legs & boots (pivot at hip y = 0.56)
    const makeLeg = (sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.085, 0.56, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.42, 8), tightMat);
      leg.position.y = -0.21;
      leg.castShadow = true;
      pivot.add(leg);
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.16, 8), bootMat);
      boot.position.y = -0.48;
      boot.castShadow = true;
      pivot.add(boot);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.06, 0.14), bootMat);
      foot.position.set(0, -0.53, 0.025);
      foot.castShadow = true;
      pivot.add(foot);
      return pivot;
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);
    this.body.add(this.legL, this.legR);

    // Pleated navy skirt / culottes
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.175, 0.24, 14), skirtMat);
    skirt.position.y = 0.6;
    skirt.castShadow = true;
    this.body.add(skirt);

    // Torso (cream knit sweater — proportioned cylinder, not a ball)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.34, 12), sweaterMat);
    torso.position.y = 0.85;
    torso.castShadow = true;
    this.body.add(torso);

    // Burnt-sienna wool scarf & trailing tail
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.032, 8, 14), scarfMat);
    scarfRing.rotation.x = Math.PI / 2;
    scarfRing.position.y = 1.02;
    this.body.add(scarfRing);

    this.scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.22, 0.025), scarfMat);
    this.scarfTail.position.set(0.06, 0.92, -0.11);
    this.scarfTail.rotation.x = 0.28;
    this.body.add(this.scarfTail);

    // Arms (pivot at shoulder y = 0.98)
    const makeArm = (sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.145, 0.98, 0);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.28, 8), sweaterMat);
      sleeve.position.y = -0.14;
      sleeve.castShadow = true;
      pivot.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), skinMat);
      hand.position.y = -0.3;
      pivot.add(hand);
      return pivot;
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);
    this.body.add(this.armL, this.armR);

    // Head + chestnut bob hair (no crown/tiara)
    this.head = new THREE.Group();
    this.head.position.y = 1.15;
    this.body.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), skinMat);
    skull.castShadow = true;
    this.head.add(skull);

    // Eyes & gentle blush
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#261b16', roughness: 0.35 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), eyeMat);
      eye.position.set(sx * 0.042, 0.01, 0.102);
      this.head.add(eye);
    }

    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.124, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat
    );
    hairTop.position.set(0, 0.012, -0.01);
    hairTop.castShadow = true;
    this.head.add(hairTop);

    const hairBack = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.132, 0.18, 12, 1, false, Math.PI * 0.65, Math.PI * 0.7), hairMat);
    hairBack.position.set(0, -0.05, -0.015);
    this.head.add(hairBack);

    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.05), hairMat);
    bangs.position.set(0, 0.068, 0.095);
    this.head.add(bangs);

    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.016), clipMat);
    clip.position.set(0.075, 0.06, 0.092);
    this.head.add(clip);

    // Luminous ivory-and-amber parasol for slow aerial descent (state === 'float')
    this.parasol = new THREE.Group();
    this.parasol.name = 'parasolCanopy';
    this.parasol.userData.fx = true;
    this.parasol.userData.nonsolid = true;
    this.parasol.position.set(0, 1.38, 0.02);
    const poleMat = new THREE.MeshStandardMaterial({ color: '#e6c280', roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.98, 6), poleMat);
    pole.position.y = 0.44;
    this.parasol.add(pole);

    const canopyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.ivory,
      emissive: '#f5b864',
      emissiveIntensity: 0.42,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.92, 0.32, 8, 1, true), canopyMat);
    canopy.position.y = 0.9;
    this.parasol.add(canopy);

    // Sculpted ribs & warm finial cap
    const ribGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.96, 4);
    ribGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(ribGeo, poleMat);
      rib.position.y = 0.78;
      rib.rotation.y = (i * Math.PI) / 4;
      this.parasol.add(rib);
    }
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), poleMat);
    finial.position.y = 1.07;
    this.parasol.add(finial);

    this.parasol.visible = false;
  }

  syncTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  animate(mode, t, speed = 0) {
    const showParasol = mode === 'float';
    if (showParasol && this.parasol.parent !== this.body) {
      this.body.add(this.parasol);
    } else if (!showParasol && this.parasol.parent === this.body) {
      this.body.remove(this.parasol);
    }
    this.parasol.visible = showParasol;
    this.body.position.y = 0;

    if (mode === 'walk') {
      const stride = Math.sin(t * 8.5) * Math.min(1, speed / 3.2) * 0.55;
      this.legL.rotation.x = stride;
      this.legR.rotation.x = -stride;
      this.armL.rotation.x = -stride * 0.7;
      this.armR.rotation.x = stride * 0.7;
      this.armL.rotation.z = -0.1;
      this.armR.rotation.z = 0.1;
      this.body.position.y = Math.abs(Math.sin(t * 8.5)) * 0.03 * Math.min(1, speed / 3.2);
      this.scarfTail.rotation.x = 0.35 + Math.sin(t * 7) * 0.14;
      this.head.rotation.x = 0;
    } else if (mode === 'sit') {
      this.legL.rotation.x = -1.25;
      this.legR.rotation.x = -1.25;
      this.armL.rotation.x = -0.65;
      this.armR.rotation.x = -0.65;
      this.armL.rotation.z = -0.15;
      this.armR.rotation.z = 0.15;
      this.body.position.y = -0.26;
      this.scarfTail.rotation.x = 0.8 + Math.sin(t * 14) * 0.18;
      this.head.rotation.x = 0;
    } else if (mode === 'float') {
      this.legL.rotation.x = 0.15 + Math.sin(t * 2.4) * 0.08;
      this.legR.rotation.x = -0.12 - Math.sin(t * 2.4) * 0.08;
      this.armR.rotation.x = -2.65;
      this.armR.rotation.z = 0.18;
      this.armL.rotation.x = -0.2;
      this.armL.rotation.z = -0.35 - Math.sin(t * 2.2) * 0.1;
      this.scarfTail.rotation.x = 0.6 + Math.sin(t * 5) * 0.2;
      this.parasol.rotation.z = Math.sin(t * 1.8) * 0.05;
    } else if (mode === 'wave') {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.armR.rotation.x = 0;
      this.armR.rotation.z = 2.45 + Math.sin(t * 5.2) * 0.32;
      this.armL.rotation.x = 0;
      this.armL.rotation.z = -0.12;
      this.body.position.y = Math.abs(Math.sin(t * 3.5)) * 0.04;
      this.scarfTail.rotation.x = 0.3 + Math.sin(t * 4) * 0.1;
    } else {
      // Idle
      const breath = Math.sin(t * 2.1) * 0.03;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
      this.armL.rotation.z = -0.08 - breath;
      this.armR.rotation.z = 0.08 + breath;
      this.scarfTail.rotation.x = 0.25 + Math.sin(t * 2.6) * 0.08;
      this.head.rotation.y = Math.sin(t * 0.9) * 0.08;
    }
    this.syncTransform();
  }
}
