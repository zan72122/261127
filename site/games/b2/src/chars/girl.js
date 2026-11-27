import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';
import { clamp, damp, lerp } from '../core/math.js';

export class Girl {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'girlProtagonist';
    this.pos = new THREE.Vector3();
    this.yaw = 0;

    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f4cdb4'), roughness: 0.78 });
    const hair = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b2820'), roughness: 0.72 });
    const blouse = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f6f2e8'), roughness: 0.85 });
    const collar = new THREE.MeshStandardMaterial({ color: PALETTE.indigo, roughness: 0.85 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#304c7a'), roughness: 0.84 });
    const sockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f4f2ec'), roughness: 0.88 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ece9df'), roughness: 0.78 });
    const shoeSole = new THREE.MeshStandardMaterial({ color: new THREE.Color('#70553e'), roughness: 0.9 });
    const straw = new THREE.MeshStandardMaterial({ color: new THREE.Color('#dcc28a'), roughness: 0.9 });
    const yamabuki = new THREE.MeshStandardMaterial({ color: PALETTE.yamabuki, roughness: 0.7 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#221a16'), roughness: 0.35 });
    const cheekMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ec9c92'), roughness: 0.85 });

    // Root body pivot at hip height (~0.56m)
    this.hips = new THREE.Group();
    this.hips.position.y = 0.56;
    this.group.add(this.hips);

    // Culotte skirt & pelvis
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.175, 0.25, 14), skirtMat);
    pelvis.position.y = -0.02;
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    // Torso (slim realistic child proportions)
    this.torso = new THREE.Group();
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.31, 14), blouse);
    chest.position.y = 0.155;
    chest.castShadow = true;
    this.torso.add(chest);

    // Flat summer indigo collar & tie
    const collarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.07, 14), collar);
    collarMesh.position.y = 0.295;
    this.torso.add(collarMesh);

    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.025), yamabuki);
    tie.position.set(0, 0.23, 0.105);
    tie.rotation.x = -0.08;
    this.torso.add(tie);

    // Woven straw hat resting on her back
    const backHat = new THREE.Group();
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.025, 16), straw);
    const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.09, 14), straw);
    hatCrown.position.y = 0.05;
    const hatRibbon = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.025, 14), collar);
    hatRibbon.position.y = 0.02;
    backHat.add(hatBrim, hatCrown, hatRibbon);
    backHat.position.set(0, 0.18, -0.14);
    backHat.rotation.x = -1.25;
    this.torso.add(backHat);

    // Head & neck
    this.head = new THREE.Group();
    this.head.position.y = 0.35;
    this.torso.add(this.head);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.07, 10), skin);
    neck.position.y = -0.01;
    this.head.add(neck);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.122, 18, 16), skin);
    cranium.scale.set(0.95, 1.03, 0.96);
    cranium.position.y = 0.115;
    cranium.castShadow = true;
    this.head.add(cranium);

    // Eyes & cheeks facing +Z
    for (const sx of [-0.042, 0.042]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), eyeMat);
      eye.position.set(sx, 0.115, 0.11);
      this.head.add(eye);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 8), cheekMat);
      cheek.scale.set(1.2, 0.65, 0.4);
      cheek.position.set(sx * 1.4, 0.09, 0.104);
      this.head.add(cheek);
    }

    // Bobbed hair cap & back locks
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hair
    );
    hairCap.position.set(0, 0.125, -0.012);
    hairCap.rotation.x = -0.22;
    hairCap.castShadow = true;
    this.head.add(hairCap);

    // Bangs & side locks
    const bangs = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.125, 0.055, 14, 1, false, -0.9, 1.8), hair);
    bangs.position.set(0, 0.165, 0.015);
    this.head.add(bangs);

    this.tailL = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.11, 5, 8), hair);
    this.tailL.position.set(-0.11, 0.08, -0.04);
    this.tailL.rotation.z = 0.24;
    this.tailR = this.tailL.clone();
    this.tailR.position.x = 0.11;
    this.tailR.rotation.z = -0.24;
    const ribbonL = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), collar);
    ribbonL.position.set(-0.11, 0.145, -0.035);
    const ribbonR = ribbonL.clone();
    ribbonR.position.x = 0.11;
    this.head.add(this.tailL, this.tailR, ribbonL, ribbonR);

    // Arms (shoulder -> upper arm -> elbow -> forearm)
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.13, 0.275, 0);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, 0.11, 10), blouse);
      sleeve.position.y = -0.04;
      sleeve.castShadow = true;
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.13, 5, 8), skin);
      upper.position.y = -0.11;
      upper.castShadow = true;
      const elbow = new THREE.Group();
      elbow.position.y = -0.19;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.13, 5, 8), skin);
      fore.position.y = -0.085;
      fore.castShadow = true;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), skin);
      hand.position.y = -0.165;
      elbow.add(fore, hand);
      shoulder.add(sleeve, upper, elbow);
      this.torso.add(shoulder);
      return { shoulder, elbow };
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);

    // Legs (hip -> thigh -> knee -> calf -> shoe)
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.062, -0.08, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.041, 0.16, 6, 8), skin);
      thigh.position.y = -0.1;
      thigh.castShadow = true;
      const knee = new THREE.Group();
      knee.position.y = -0.21;
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.17, 10), sockMat);
      sock.position.y = -0.1;
      sock.castShadow = true;
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.068, 5, 8), shoeMat);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1.02, 1.0, 0.78);
      shoe.position.set(0, -0.222, 0.024);
      shoe.castShadow = true;
      const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.072, 4, 8), shoeSole);
      sole.rotation.x = Math.PI / 2;
      sole.scale.set(1.02, 1.0, 0.28);
      sole.position.set(0, -0.248, 0.024);
      knee.add(sock, shoe, sole);
      hip.add(thigh, knee);
      this.hips.add(hip);
      return { hip, knee };
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    this.walkPhase = 0;
  }

  setPose(mode, dt, t, speed = 0, bank = 0) {
    if (mode === 'walk') {
      const strideRate = clamp(speed * 2.4, 3.2, 9.0);
      this.walkPhase += dt * strideRate;
      const s = Math.sin(this.walkPhase);
      const bob = Math.abs(Math.cos(this.walkPhase)) * 0.025;
      this.hips.position.y = damp(this.hips.position.y, 0.54 + bob, 14, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0.08, 10, dt);
      this.torso.rotation.z = damp(this.torso.rotation.z, 0, 10, dt);
      this.head.rotation.x = damp(this.head.rotation.x, -0.04, 10, dt);

      this.legL.hip.rotation.x = s * 0.56;
      this.legR.hip.rotation.x = -s * 0.56;
      this.legL.knee.rotation.x = Math.max(0, -s) * 0.65;
      this.legR.knee.rotation.x = Math.max(0, s) * 0.65;

      this.armL.shoulder.rotation.x = -s * 0.45;
      this.armR.shoulder.rotation.x = s * 0.45;
      this.armL.shoulder.rotation.z = 0.08;
      this.armR.shoulder.rotation.z = -0.08;
      this.armL.elbow.rotation.x = -0.25;
      this.armR.elbow.rotation.x = -0.25;
    } else if (mode === 'ride') {
      // Sitting astride the central paper-airplane spine crease, leaning into wind
      this.hips.position.y = damp(this.hips.position.y, 0.34, 14, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0.32, 10, dt);
      this.torso.rotation.z = damp(this.torso.rotation.z, clamp(bank * 0.25, -0.2, 0.2), 8, dt);
      this.head.rotation.x = damp(this.head.rotation.x, -0.24, 10, dt);

      this.legL.hip.rotation.set(-0.62, 0, 0.22);
      this.legR.hip.rotation.set(-0.62, 0, -0.22);
      this.legL.knee.rotation.x = 0.85;
      this.legR.knee.rotation.x = 0.85;

      this.armL.shoulder.rotation.set(-0.82, 0, 0.22);
      this.armR.shoulder.rotation.set(-0.82, 0, -0.22);
      this.armL.elbow.rotation.x = -0.35;
      this.armR.elbow.rotation.x = -0.35;
    } else if (mode === 'float') {
      // Holding luminous dandelion canopy overhead with slow gentle breeze sway
      this.hips.position.y = damp(this.hips.position.y, 0.54, 10, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0.05, 8, dt);
      this.torso.rotation.z = damp(this.torso.rotation.z, Math.sin(t * 1.4) * 0.06, 6, dt);
      this.head.rotation.x = damp(this.head.rotation.x, -0.08, 8, dt);

      this.legL.hip.rotation.set(0.16 + Math.sin(t * 2.1) * 0.08, 0, 0.06);
      this.legR.hip.rotation.set(-0.08 - Math.sin(t * 2.1) * 0.08, 0, -0.06);
      this.legL.knee.rotation.x = 0.28;
      this.legR.knee.rotation.x = 0.18;

      this.armL.shoulder.rotation.set(-2.55, 0, 0.14);
      this.armR.shoulder.rotation.set(-2.55, 0, -0.14);
      this.armL.elbow.rotation.x = -0.22;
      this.armR.elbow.rotation.x = -0.22;
    } else if (mode === 'arrive') {
      // Relaxed joyful stance overlooking the valley
      this.hips.position.y = damp(this.hips.position.y, 0.56, 10, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0.0, 8, dt);
      this.torso.rotation.z = damp(this.torso.rotation.z, Math.sin(t * 1.6) * 0.03, 6, dt);
      this.head.rotation.x = damp(this.head.rotation.x, -0.06, 8, dt);

      this.legL.hip.rotation.set(0, 0, 0.04);
      this.legR.hip.rotation.set(0, 0, -0.04);
      this.legL.knee.rotation.x = 0;
      this.legR.knee.rotation.x = 0;

      this.armL.shoulder.rotation.set(0.05, 0, 0.16);
      this.armR.shoulder.rotation.set(-2.2 + Math.sin(t * 4.2) * 0.25, 0, -0.32);
      this.armL.elbow.rotation.x = -0.15;
      this.armR.elbow.rotation.x = -0.35;
    } else {
      // Idle standing
      this.hips.position.y = damp(this.hips.position.y, 0.56 + Math.sin(t * 2.0) * 0.008, 10, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0, 10, dt);
      this.torso.rotation.z = damp(this.torso.rotation.z, 0, 10, dt);
      this.head.rotation.x = damp(this.head.rotation.x, Math.sin(t * 1.1) * 0.04, 8, dt);

      this.legL.hip.rotation.set(0, 0, 0.03);
      this.legR.hip.rotation.set(0, 0, -0.03);
      this.legL.knee.rotation.x = 0;
      this.legR.knee.rotation.x = 0;

      this.armL.shoulder.rotation.set(0.04, 0, 0.1 + Math.sin(t * 1.8) * 0.02);
      this.armR.shoulder.rotation.set(0.04, 0, -0.1 - Math.sin(t * 1.8) * 0.02);
      this.armL.elbow.rotation.x = -0.14;
      this.armR.elbow.rotation.x = -0.14;
    }

    // Subtle wind flutter in hair locks
    const flutter = Math.sin(t * 4.6 + speed * 0.6) * (0.04 + clamp(speed * 0.015, 0, 0.16));
    this.tailL.rotation.x = flutter;
    this.tailR.rotation.x = -flutter * 0.8;

    this.pos.copy(this.group.position);
  }
}
