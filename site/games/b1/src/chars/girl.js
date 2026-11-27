import * as THREE from '../../lib/three.module.js';

// Realistic 1970s Finnish Lapland girl (no crown/tiara/princess dress; winter wool coat, scarf, skirt, fur boots)
export class Girl {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'girlProtagonist';
    this.pos = this.group.position;
    this.yaw = 0;
    this.walkPhase = 0;

    const mCoat = new THREE.MeshStandardMaterial({ color: 0x2d5166, roughness: 0.82 });
    const mTrim = new THREE.MeshStandardMaterial({ color: 0xdfd9c8, roughness: 0.85 });
    const mSkirt = new THREE.MeshStandardMaterial({ color: 0x243b4d, roughness: 0.84 });
    const mScarf = new THREE.MeshStandardMaterial({ color: 0xdaa04b, roughness: 0.85 });
    const mSkin = new THREE.MeshStandardMaterial({ color: 0xf4cfb8, roughness: 0.68 });
    const mHair = new THREE.MeshStandardMaterial({ color: 0x4b3324, roughness: 0.72 });
    const mBoot = new THREE.MeshStandardMaterial({ color: 0x5c3c28, roughness: 0.8 });
    const mEye = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.3 });

    this.body = new THREE.Group();
    this.group.add(this.body);

    // Articulated legs + fur-cuffed winter boots (standing height ~1.18m)
    const makeLeg = (sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 0.44, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.34, 8), mSkirt);
      leg.position.y = -0.17;
      leg.castShadow = true;
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.058, 0.16, 8), mBoot);
      boot.position.y = -0.35;
      boot.castShadow = true;
      const fur = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.018, 6, 12), mTrim);
      fur.rotation.x = Math.PI / 2;
      fur.position.y = -0.28;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.06, 0.16), mBoot);
      foot.position.set(0, -0.41, 0.03);
      pivot.add(leg, boot, fur, foot);
      return pivot;
    };
    this.legL = makeLeg(-0.075);
    this.legR = makeLeg(0.075);
    this.body.add(this.legL, this.legR);

    // Wool skirt & fitted winter coat torso
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.175, 0.24, 12), mSkirt);
    skirt.position.y = 0.50;
    skirt.castShadow = true;
    this.body.add(skirt);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.34, 12), mCoat);
    torso.position.y = 0.74;
    torso.castShadow = true;
    this.body.add(torso);

    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.127, 0.129, 0.05, 12), mTrim);
    hem.position.y = 0.60;
    this.body.add(hem);

    // Knit wool scarf & trailing tail
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.034, 7, 14), mScarf);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.90;
    this.body.add(collar);

    this.scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.24, 0.028), mScarf);
    this.scarfTail.position.set(0.05, 0.80, -0.10);
    this.scarfTail.rotation.x = 0.25;
    this.body.add(this.scarfTail);

    // Articulated arms with warm mittens
    const makeArm = (sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 0.86, 0);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.28, 8), mCoat);
      sleeve.position.y = -0.14;
      sleeve.castShadow = true;
      const mitten = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), mScarf);
      mitten.position.y = -0.29;
      pivot.add(sleeve, mitten);
      return pivot;
    };
    this.armL = makeArm(-0.145);
    this.armR = makeArm(0.145);
    this.body.add(this.armL, this.armR);

    // Head, face, braided hair, knit winter beret (no crown/tiara)
    this.head = new THREE.Group();
    this.head.position.y = 0.94;
    this.body.add(this.head);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, 0.07, 8), mSkin);
    neck.position.y = 0.01;
    this.head.add(neck);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), mSkin);
    headMesh.position.y = 0.12;
    headMesh.scale.set(0.95, 1.02, 0.96);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mHair);
    hairBack.position.set(0, 0.135, -0.022);
    this.head.add(hairBack);

    for (const sx of [-0.085, 0.085]) {
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.2, 7), mHair);
      braid.position.set(sx, 0.03, -0.02);
      braid.rotation.z = sx > 0 ? -0.14 : 0.14;
      this.head.add(braid);
    }

    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.122, 0.1, 12), mScarf);
    hat.position.set(0, 0.20, -0.015);
    hat.rotation.x = -0.14;
    this.head.add(hat);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mTrim);
    pom.position.set(0, 0.26, -0.03);
    this.head.add(pom);

    for (const sx of [-0.04, 0.04]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 6), mEye);
      eye.position.set(sx, 0.125, 0.103);
      this.head.add(eye);
    }

    // Luminous snow-canopy & glow aura for aerial float (hidden until float)
    this.canopy = new THREE.Group();
    this.canopy.position.set(0, 1.72, 0.05);
    this.canopy.visible = false;
    this.canopy.userData.nonsolid = true;
    this.canopy.userData.fx = true;

    const domeGeo = new THREE.SphereGeometry(1.15, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.46);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0xe8faf2,
      emissive: 0x4be6ad,
      emissiveIntensity: 0.58,
      roughness: 0.38,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.scale.set(1, 0.54, 1);
    dome.userData.nonsolid = true;
    dome.userData.fx = true;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.13, 0.022, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0x9cf8d2, transparent: true, opacity: 0.72 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.07;
    rim.userData.nonsolid = true;
    rim.userData.fx = true;
    this.canopy.add(rim);
    for (let k = 0; k < 6; k++) {
      const ribPivot = new THREE.Group();
      ribPivot.rotation.y = (k / 6) * Math.PI * 2;
      ribPivot.position.y = 0.08;
      ribPivot.userData.nonsolid = true;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.86, 5), mScarf);
      rib.position.set(0.45, 0.16, 0);
      rib.rotation.z = -1.34;
      rib.userData.nonsolid = true;
      ribPivot.add(rib);
      this.canopy.add(ribPivot);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.88, 6), mScarf);
    pole.position.y = -0.35;
    pole.userData.nonsolid = true;
    this.canopy.add(dome, pole);
    this.body.add(this.canopy);
  }

  setPose(mode, dt, speed = 0, t = 0) {
    this.canopy.visible = mode === 'float';
    if (mode === 'walk') {
      this.walkPhase += dt * Math.max(4.5, speed * 2.4);
      const s = Math.sin(this.walkPhase);
      this.legL.rotation.x = s * 0.52;
      this.legR.rotation.x = -s * 0.52;
      this.armL.rotation.x = -s * 0.42;
      this.armR.rotation.x = s * 0.42;
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
      this.body.position.y = Math.abs(s) * 0.03;
      this.body.rotation.x = 0.04;
      this.head.rotation.x = 0;
    } else if (mode === 'pet') {
      this.legL.rotation.x = -0.35;
      this.legR.rotation.x = 0.2;
      this.body.position.y = -0.14;
      this.body.rotation.x = 0.34;
      this.armL.rotation.x = -0.75 + Math.sin(t * 7.5) * 0.18;
      this.armR.rotation.x = -0.82 - Math.sin(t * 7.5) * 0.18;
      this.head.rotation.x = 0.25;
    } else if (mode === 'sit') {
      this.legL.rotation.x = -1.25;
      this.legR.rotation.x = -1.25;
      this.armL.rotation.x = -0.65;
      this.armR.rotation.x = -0.65;
      this.armL.rotation.z = 0.06;
      this.armR.rotation.z = -0.06;
      this.body.position.y = -0.22;
      this.body.rotation.x = 0.08;
      this.head.rotation.x = 0;
    } else if (mode === 'float') {
      this.legL.rotation.x = Math.sin(t * 2.2) * 0.08;
      this.legR.rotation.x = -Math.sin(t * 2.2) * 0.08;
      this.armL.rotation.x = -1.1; // cradling puppy
      this.armR.rotation.x = -2.45; // holding canopy handle
      this.body.position.y = Math.sin(t * 2.6) * 0.04;
      this.body.rotation.x = 0;
      this.head.rotation.x = -0.05;
    } else {
      // Idle standing
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
      this.body.position.y = Math.sin(t * 2.0) * 0.008;
      this.body.rotation.x = 0;
      this.head.rotation.x = Math.sin(t * 1.4) * 0.04;
    }

    this.scarfTail.rotation.x = 0.25 + Math.min(0.95, speed * 0.045) + Math.sin(t * 6.5) * 0.1;
  }
}
