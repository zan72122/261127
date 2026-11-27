import * as THREE from '../../lib/three.module.js';
import { PALETTE, markNonSolid } from '../core/env.js';
import { clamp, damp, lerp } from '../core/math.js';

export class Girl {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'girlProtagonist';
    this.pos = this.group.position;
    this.yaw = 0;
    this.pose = 'stand'; // 'stand' | 'walk' | 'ride' | 'float' | 'arrive'
    this.walkSpeed = 0;
    this.windSpeed = 0;
    this.lookTarget = null;
    this._t = 0;
    this._stride = 0;

    const skinMat = new THREE.MeshStandardMaterial({ color: '#e2b38f', roughness: 0.72 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#382319', roughness: 0.78 });
    const blouseMat = new THREE.MeshStandardMaterial({ color: PALETTE.creamCloth, roughness: 0.82 });
    const tunicMat = new THREE.MeshStandardMaterial({ color: PALETTE.terracottaWarm, roughness: 0.8 });
    const trouserMat = new THREE.MeshStandardMaterial({ color: '#24345c', roughness: 0.85 });
    const bootMat = new THREE.MeshStandardMaterial({ color: '#6b4228', roughness: 0.82 });
    const sashMat = new THREE.MeshStandardMaterial({ color: PALETTE.saffron, roughness: 0.68 });
    const turqMat = new THREE.MeshStandardMaterial({ color: PALETTE.turquoise, roughness: 0.65 });
    const cheekMat = new THREE.MeshStandardMaterial({ color: '#d87f6e', roughness: 0.7 });

    this.root = new THREE.Group();
    this.group.add(this.root);

    // Legs (hip pivot at y = 0.62)
    this.hipL = new THREE.Group();
    this.hipL.position.set(-0.09, 0.62, 0);
    this.hipR = new THREE.Group();
    this.hipR.position.set(0.09, 0.62, 0);

    for (const [side, hip] of [[-1, this.hipL], [1, this.hipR]]) {
      const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.048, 0.30, 8), trouserMat);
      upperLeg.position.y = -0.15;
      upperLeg.castShadow = true;
      hip.add(upperLeg);

      const knee = new THREE.Group();
      knee.position.y = -0.30;
      const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.24, 8), trouserMat);
      lowerLeg.position.y = -0.12;
      lowerLeg.castShadow = true;
      knee.add(lowerLeg);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.16), bootMat);
      boot.position.set(0, -0.265, 0.025);
      boot.castShadow = true;
      knee.add(boot);

      hip.add(knee);
      if (side < 0) this.kneeL = knee;
      else this.kneeR = knee;
      this.root.add(hip);
    }

    // Torso (waist at y = 0.64)
    this.torso = new THREE.Group();
    this.torso.position.y = 0.62;
    this.root.add(this.torso);

    // Tapered everyday tunic & blouse (realistic human torso, never spherical)
    const tunicLower = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.185, 0.24, 12), tunicMat);
    tunicLower.position.y = 0.04;
    tunicLower.castShadow = true;
    this.torso.add(tunicLower);

    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.122, 0.055, 12), sashMat);
    sash.position.y = 0.17;
    this.torso.add(sash);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.112, 0.28, 12), blouseMat);
    chest.position.y = 0.31;
    chest.scale.set(1.06, 1.0, 0.78);
    chest.castShadow = true;
    this.torso.add(chest);

    // Sleeveless vest trim
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.118, 0.22, 12), tunicMat);
    vest.position.y = 0.29;
    vest.scale.set(1.08, 1.0, 0.80);
    this.torso.add(vest);

    // Flowing saffron-turquoise scarf tail
    this.scarf = new THREE.Group();
    this.scarf.position.set(0, 0.42, -0.09);
    const scarfCollar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.028, 6, 14), sashMat);
    scarfCollar.rotation.x = Math.PI / 2;
    scarfCollar.position.set(0, 0.01, 0.09);
    this.scarf.add(scarfCollar);

    this.scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.022, 0.34), turqMat);
    this.scarfTail.position.set(0.04, -0.14, -0.09);
    this.scarfTail.rotation.x = -1.1;
    this.scarf.add(this.scarfTail);
    this.torso.add(this.scarf);

    // Arms (shoulder pivots)
    this.armL = new THREE.Group();
    this.armL.position.set(-0.155, 0.41, 0);
    this.armR = new THREE.Group();
    this.armR.position.set(0.155, 0.41, 0);
    for (const arm of [this.armL, this.armR]) {
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.24, 8), blouseMat);
      sleeve.position.y = -0.11;
      sleeve.castShadow = true;
      arm.add(sleeve);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.18, 8), skinMat);
      fore.position.y = -0.30;
      arm.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skinMat);
      hand.position.y = -0.40;
      arm.add(hand);
      this.torso.add(arm);
    }

    // Neck & Head
    this.head = new THREE.Group();
    this.head.position.set(0, 0.47, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.05, 0.08, 8), skinMat);
    neck.position.y = 0.03;
    this.head.add(neck);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.122, 14, 12), skinMat);
    skull.position.y = 0.16;
    skull.scale.set(0.95, 1.04, 0.98);
    skull.castShadow = true;
    this.head.add(skull);

    // Eyes & cheeks
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b1412' });
    for (const sx of [-0.044, 0.044]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), eyeMat);
      eye.position.set(sx, 0.165, 0.112);
      this.head.add(eye);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), cheekMat);
      cheek.position.set(sx * 1.45, 0.135, 0.102);
      cheek.scale.z = 0.4;
      this.head.add(cheek);
    }

    // Hair cap + neat braids with saffron ribbons (no crown/tiara)
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    hairCap.position.set(0, 0.175, -0.015);
    hairCap.rotation.x = -0.18;
    this.head.add(hairCap);

    for (const sx of [-0.095, 0.095]) {
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.24, 7), hairMat);
      braid.position.set(sx, 0.05, -0.05);
      braid.rotation.z = sx * 0.9;
      this.head.add(braid);
      const tie = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), sashMat);
      tie.position.set(sx * 1.12, -0.06, -0.05);
      this.head.add(tie);
    }
    this.torso.add(this.head);

    // Luminous silk canopy/parasol for slow aerial float (non-solid FX)
    this.canopy = new THREE.Group();
    this.canopy.name = 'floatCanopy';
    this.canopy.position.set(0, 1.72, 0.04);
    this.canopy.visible = false;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 6), sashMat);
    pole.position.y = -0.26;
    this.canopy.add(pole);

    const domeGeo = new THREE.SphereGeometry(0.84, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.38);
    const domeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.saffron,
      emissive: '#f5be4c',
      emissiveIntensity: 0.62,
      roughness: 0.48,
      side: THREE.DoubleSide,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = -0.20;
    dome.scale.set(1.0, 0.56, 1.0);
    this.canopy.add(dome);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.026, 8, 24), turqMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.02;
    this.canopy.add(rim);

    // Subtle soft glow ring beneath canopy (clear, never hides silhouette)
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.72, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffe49e',
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    aura.rotation.x = Math.PI / 2;
    aura.position.y = -0.05;
    this.canopy.add(aura);
    markNonSolid(this.canopy, 'fx');
    this.group.add(this.canopy);

    // Generous invisible tap hitbox (non-solid) so dismount tap works reliably in flight
    this.hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 1.85, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitbox.position.y = 0.85;
    this.hitbox.userData.tapRole = 'girl';
    markNonSolid(this.hitbox, 'nonsolid');
    this.group.add(this.hitbox);
  }

  update(dt) {
    this._t += dt;
    this.group.rotation.y = this.yaw;

    const showCanopy = this.pose === 'float';
    this.canopy.visible = showCanopy;

    if (this.pose === 'ride') {
      // Seated gracefully cross-legged / knees bent on the carpet
      this.root.position.y = damp(this.root.position.y, -0.44, 12, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0.16 + Math.sin(this._t * 2.4) * 0.03, 8, dt);
      this.hipL.rotation.x = damp(this.hipL.rotation.x, -1.25, 12, dt);
      this.hipR.rotation.x = damp(this.hipR.rotation.x, -1.25, 12, dt);
      this.hipL.rotation.z = damp(this.hipL.rotation.z, 0.34, 12, dt);
      this.hipR.rotation.z = damp(this.hipR.rotation.z, -0.34, 12, dt);
      this.kneeL.rotation.x = damp(this.kneeL.rotation.x, 1.45, 12, dt);
      this.kneeR.rotation.x = damp(this.kneeR.rotation.x, 1.45, 12, dt);
      this.armL.rotation.x = damp(this.armL.rotation.x, -0.52, 10, dt);
      this.armR.rotation.x = damp(this.armR.rotation.x, -0.52, 10, dt);
      this.armL.rotation.z = damp(this.armL.rotation.z, 0.18, 10, dt);
      this.armR.rotation.z = damp(this.armR.rotation.z, -0.18, 10, dt);
    } else if (this.pose === 'float') {
      this.root.position.y = damp(this.root.position.y, Math.sin(this._t * 2.2) * 0.04, 8, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0.04, 8, dt);
      this.hipL.rotation.set(damp(this.hipL.rotation.x, 0.12 + Math.sin(this._t * 1.9) * 0.08, 8, dt), 0, 0.06);
      this.hipR.rotation.set(damp(this.hipR.rotation.x, -0.08 - Math.sin(this._t * 1.9) * 0.08, 8, dt), 0, -0.06);
      this.kneeL.rotation.x = damp(this.kneeL.rotation.x, 0.16, 8, dt);
      this.kneeR.rotation.x = damp(this.kneeR.rotation.x, 0.22, 8, dt);
      // Right hand raised holding canopy handle
      this.armR.rotation.x = damp(this.armR.rotation.x, -2.55, 10, dt);
      this.armR.rotation.z = damp(this.armR.rotation.z, -0.12, 10, dt);
      this.armL.rotation.x = damp(this.armL.rotation.x, -0.25, 8, dt);
      this.armL.rotation.z = damp(this.armL.rotation.z, 0.38 + Math.sin(this._t * 2.3) * 0.08, 8, dt);
      this.canopy.rotation.z = Math.sin(this._t * 1.6) * 0.06;
    } else if (this.pose === 'walk') {
      this._stride += dt * (2.5 + this.walkSpeed * 2.2);
      const sw = Math.sin(this._stride) * clamp(this.walkSpeed / 3.0, 0.2, 0.72);
      this.root.position.y = damp(this.root.position.y, Math.abs(Math.cos(this._stride)) * 0.035, 14, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0.08, 10, dt);
      this.hipL.rotation.set(sw, 0, 0);
      this.hipR.rotation.set(-sw, 0, 0);
      this.kneeL.rotation.x = Math.max(0, -sw * 0.65);
      this.kneeR.rotation.x = Math.max(0, sw * 0.65);
      this.armL.rotation.set(-sw * 0.75, 0, 0.08);
      this.armR.rotation.set(sw * 0.75, 0, -0.08);
    } else if (this.pose === 'arrive') {
      this.root.position.y = damp(this.root.position.y, 0, 10, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, -0.04, 8, dt);
      this.hipL.rotation.set(0, 0, 0.03);
      this.hipR.rotation.set(0, 0, -0.03);
      this.kneeL.rotation.x = 0;
      this.kneeR.rotation.x = 0;
      this.armL.rotation.set(-0.2, 0, 0.14);
      this.armR.rotation.set(-1.35 + Math.sin(this._t * 3.1) * 0.14, 0, -0.35);
    } else {
      // 'stand'
      this.root.position.y = damp(this.root.position.y, 0, 10, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, Math.sin(this._t * 1.5) * 0.02, 8, dt);
      this.hipL.rotation.set(0, 0, 0.03);
      this.hipR.rotation.set(0, 0, -0.03);
      this.kneeL.rotation.x = 0;
      this.kneeR.rotation.x = 0;
      this.armL.rotation.set(0, 0, 0.08 + Math.sin(this._t * 1.4) * 0.02);
      this.armR.rotation.set(0, 0, -0.08 - Math.sin(this._t * 1.4) * 0.02);
    }

    // Gentle scarf drape & flutter driven by wind/flight speed
    const flutter = clamp(this.windSpeed / 16, 0, 0.75);
    this.scarfTail.rotation.x = -1.15 + flutter * 1.35 + Math.sin(this._t * (5 + this.windSpeed * 0.5)) * (0.04 + flutter * 0.22);
    this.scarfTail.position.y = -0.14 + flutter * 0.10;
    this.scarfTail.position.z = -0.09 - flutter * 0.08;
    this.scarfTail.rotation.y = Math.cos(this._t * 4.2) * (0.04 + flutter * 0.18);

    // Gentle head orientation toward lookTarget
    if (this.lookTarget) {
      const dx = this.lookTarget.x - this.pos.x;
      const dz = this.lookTarget.z - this.pos.z;
      const targetWorldYaw = Math.atan2(dx, dz);
      let rel = targetWorldYaw - this.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      this.head.rotation.y = damp(this.head.rotation.y, clamp(rel, -0.7, 0.7), 6, dt);
    } else {
      this.head.rotation.y = damp(this.head.rotation.y, 0, 6, dt);
    }
  }
}
