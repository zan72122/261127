import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';

export class Girl {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'girlProtagonist';
    this.pos = this.group.position;

    this.body = new THREE.Group();
    this.group.add(this.body);

    const skinMat = new THREE.MeshStandardMaterial({ color: '#dfb191', roughness: 0.65 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#2b221e', roughness: 0.72 });
    const blouseMat = new THREE.MeshStandardMaterial({ color: '#f3efe4', roughness: 0.78 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: '#235870', roughness: 0.8 });
    const ribbonMat = new THREE.MeshStandardMaterial({ color: PALETTE.coralPink, roughness: 0.65 });
    const hatMat = new THREE.MeshStandardMaterial({ color: '#d8c18e', roughness: 0.88 });
    const sandalMat = new THREE.MeshStandardMaterial({ color: '#6b4d38', roughness: 0.85 });

    // Legs (articulated at hips y = 0.56)
    const makeLeg = (sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.085, 0.56, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.28, 8), skinMat);
      thigh.position.y = -0.14;
      hip.add(thigh);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.034, 0.25, 8), skinMat);
      shin.position.y = -0.39;
      hip.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.14), sandalMat);
      foot.position.set(0, -0.535, 0.025);
      hip.add(foot);
      return hip;
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);
    this.body.add(this.legL, this.legR);

    // Skirt (flared cotton knee-length skirt)
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.195, 0.30, 16), skirtMat);
    skirt.position.y = 0.63;
    skirt.castShadow = true;
    this.body.add(skirt);

    // Waist coral-pink sash
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.122, 0.05, 16), ribbonMat);
    sash.position.y = 0.77;
    this.body.add(sash);

    // Torso (fitted cotton blouse)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.112, 0.30, 14), blouseMat);
    torso.scale.set(1.12, 1.0, 0.78);
    torso.position.y = 0.92;
    torso.castShadow = true;
    this.body.add(torso);

    // Straw sun-hat slung behind shoulders
    const hat = new THREE.Group();
    hat.position.set(0, 0.93, -0.13);
    hat.rotation.x = -1.25;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.025, 18), hatMat);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.09, 16), hatMat);
    crown.position.y = 0.05;
    const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.132, 0.025, 16), ribbonMat);
    hatBand.position.y = 0.025;
    hat.add(brim, crown, hatBand);
    this.body.add(hat);

    // Arms (articulated at shoulders y = 1.03)
    const makeArm = (sx) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.145, 1.03, 0);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.11, 8), blouseMat);
      sleeve.position.y = -0.04;
      sh.add(sleeve);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.30, 8), skinMat);
      arm.position.y = -0.22;
      sh.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), skinMat);
      hand.position.y = -0.38;
      sh.add(hand);
      return sh;
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);
    this.body.add(this.armL, this.armR);

    // Neck & Head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.08, 8), skinMat);
    neck.position.y = 1.10;
    this.body.add(neck);

    this.head = new THREE.Group();
    this.head.position.set(0, 1.22, 0);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 12), skinMat);
    face.scale.set(0.95, 1.03, 0.96);
    face.castShadow = true;
    this.head.add(face);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#1b1614', roughness: 0.35 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), eyeMat);
      eye.position.set(sx * 0.044, 0.01, 0.105);
      this.head.add(eye);
    }

    // Bob hair cap + side locks + coral shell clip (no tiara/crown)
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat
    );
    hairTop.position.set(0, 0.015, -0.01);
    hairTop.rotation.x = -0.18;
    this.head.add(hairTop);

    const hairBack = new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.138, 0.18, 12), hairMat);
    hairBack.position.set(0, -0.055, -0.028);
    this.head.add(hairBack);

    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.022, 0.02), ribbonMat);
    clip.position.set(0.085, 0.04, 0.08);
    clip.rotation.z = -0.25;
    this.head.add(clip);

    this.body.add(this.head);

    // Luminous light-veil parasol canopy for slow aerial float descent (non-solid FX)
    this.floatCanopy = new THREE.Group();
    this.floatCanopy.name = 'girlFloatCanopy';
    this.floatCanopy.userData.nonsolid = true;
    this.floatCanopy.userData.fx = true;
    this.floatCanopy.visible = false;

    const canopyGeo = new THREE.SphereGeometry(0.92, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const canopyMat = new THREE.MeshBasicMaterial({
      color: '#ffe3a8',
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const canopyDome = new THREE.Mesh(canopyGeo, canopyMat);
    canopyDome.position.y = 1.46;
    canopyDome.userData.nonsolid = true;
    canopyDome.userData.fx = true;
    this.floatCanopy.add(canopyDome);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 1.18, 6),
      new THREE.MeshBasicMaterial({ color: '#ffdf9e', transparent: true, opacity: 0.85 })
    );
    shaft.position.set(0.14, 1.72, 0.08);
    shaft.userData.nonsolid = true;
    shaft.userData.fx = true;
    this.floatCanopy.add(shaft);

    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.89, 0.022, 8, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffb9aa',
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
      })
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 1.66;
    rimRing.userData.nonsolid = true;
    rimRing.userData.fx = true;
    this.floatCanopy.add(rimRing);

    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.56, 12, 10),
      new THREE.MeshBasicMaterial({
        color: '#ffd996',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    aura.position.y = 0.85;
    aura.userData.nonsolid = true;
    aura.userData.fx = true;
    this.floatCanopy.add(aura);

    this.group.add(this.floatCanopy);
    this._walkPhase = 0;
  }

  updatePose({ mode, speed = 0, time = 0, dt = 0.016, pitch = 0, roll = 0 }) {
    this.floatCanopy.visible = mode === 'float';

    if (mode === 'walk') {
      const moving = speed > 0.15;
      if (moving) this._walkPhase += dt * (4.2 + speed * 1.4);
      const swing = moving ? Math.sin(this._walkPhase) * 0.55 : 0;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.72;
      this.armR.rotation.x = swing * 0.72;
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
      this.body.position.y = moving ? Math.abs(Math.sin(this._walkPhase)) * 0.045 : Math.sin(time * 2.1) * 0.01;
      this.body.rotation.x = moving ? 0.06 : 0;
      this.head.rotation.x = Math.sin(time * 1.5) * 0.04;
    } else if (mode === 'ride') {
      // Seated gracefully astride whale's upper dorsal ridge
      this.legL.rotation.x = -0.58;
      this.legR.rotation.x = -0.58;
      this.legL.rotation.z = 0.34;
      this.legR.rotation.z = -0.34;
      this.armL.rotation.x = -0.62 + Math.sin(time * 2.4) * 0.05;
      this.armR.rotation.x = -0.62 + Math.sin(time * 2.4) * 0.05;
      this.armL.rotation.z = 0.12;
      this.armR.rotation.z = -0.12;
      this.body.position.y = -0.14;
      this.body.rotation.x = 0.16 - pitch * 0.22;
      this.body.rotation.z = -roll * 0.25;
      this.head.rotation.x = -0.05;
    } else if (mode === 'float') {
      // Slow luminous air descent: right hand holds canopy shaft, left arm balances in breeze
      const sway = Math.sin(time * 2.2) * 0.12;
      this.legL.rotation.x = 0.12 + sway;
      this.legR.rotation.x = -0.08 - sway;
      this.legL.rotation.z = 0.06;
      this.legR.rotation.z = -0.06;
      this.armL.rotation.x = -0.22;
      this.armR.rotation.x = -1.75;
      this.armL.rotation.z = 0.55 + Math.sin(time * 2.6) * 0.08;
      this.armR.rotation.z = -0.15;
      this.body.position.y = Math.sin(time * 2.0) * 0.04;
      this.body.rotation.x = 0.04;
      this.body.rotation.z = Math.sin(time * 1.4) * 0.06;
      this.floatCanopy.rotation.y = time * 0.35;
      this.floatCanopy.position.y = Math.sin(time * 2.5) * 0.03;
    } else {
      // Joyful wave / arrival pose
      this.legL.rotation.set(0, 0, 0);
      this.legR.rotation.set(0, 0, 0);
      this.armL.rotation.set(0, 0, 0.15);
      this.armR.rotation.set(-2.35 + Math.sin(time * 6.5) * 0.25, 0, -0.35);
      this.body.position.y = Math.abs(Math.sin(time * 3.2)) * 0.05;
      this.body.rotation.set(0, 0, 0);
    }
  }
}
