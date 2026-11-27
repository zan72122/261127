import * as THREE from '../../lib/three.module.js';
import { PALETTE, PLANE_MOOR_POS, PLANE_MOOR_YAW } from '../core/env.js';

export class Seaplane {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'vehicleSeaplane';
    this.pos = PLANE_MOOR_POS.clone();
    this.yaw = PLANE_MOOR_YAW;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.propAngle = 0;

    // Inner rig handles pitch/roll/bobbing around waterline center
    this.rig = new THREE.Group();
    this.group.add(this.rig);

    const mIvory = new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.38, metalness: 0.14 });
    const mGreen = new THREE.MeshStandardMaterial({ color: PALETTE.pineMid, roughness: 0.42, metalness: 0.16 });
    const mSienna = new THREE.MeshStandardMaterial({ color: PALETTE.burntSienna, roughness: 0.44, metalness: 0.14 });
    const mAluminum = new THREE.MeshStandardMaterial({ color: '#c8cdd3', roughness: 0.34, metalness: 0.65 });
    const mDarkMetal = new THREE.MeshStandardMaterial({ color: '#2b323b', roughness: 0.48, metalness: 0.55 });
    const mGlass = new THREE.MeshPhysicalMaterial({
      color: '#1b2d42',
      roughness: 0.12,
      metalness: 0.08,
      transparent: true,
      opacity: 0.56,
    });
    const mSeat = new THREE.MeshStandardMaterial({ color: '#6b4328', roughness: 0.8 });

    const bodyY = 1.28; // Cabin floor height above waterline (y = 0)

    // 1. Twin streamlined pontoons (resting cleanly at waterline y = 0, shallow 0.08m draft)
    this.floats = [];
    for (const sx of [-0.92, 0.92]) {
      const fl = new THREE.Group();
      fl.position.set(sx, 0.06, 0.25);

      // Main pontoon hull
      const mainHull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 3.1), mIvory);
      mainHull.castShadow = true;
      mainHull.receiveShadow = true;
      fl.add(mainHull);

      // Forest-green side pinstripe on pontoon
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 2.9), mGreen);
      stripe.position.y = 0.05;
      fl.add(stripe);

      // Tapered bow nose cone
      const bow = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.85, 8), mAluminum);
      bow.rotation.x = Math.PI / 2;
      bow.scale.set(0.88, 1.0, 0.58);
      bow.position.set(0, 0.02, 1.95);
      bow.castShadow = true;
      fl.add(bow);

      // Tapered stern & water rudder
      const stern = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.72, 8), mIvory);
      stern.rotation.x = -Math.PI / 2;
      stern.scale.set(0.85, 1.0, 0.62);
      stern.position.set(0, 0.04, -1.88);
      fl.add(stern);

      const waterRudder = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.2), mSienna);
      waterRudder.position.set(0, -0.05, -2.22);
      fl.add(waterRudder);

      this.rig.add(fl);
      this.floats.push(fl);
    }

    // Spreader bars & diagonal float struts connecting pontoons to fuselage
    for (const sz of [-0.65, 1.05]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.84, 8), mDarkMetal);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 0.22, sz);
      this.rig.add(bar);
    }

    const addStrut = (ax, ay, az, bx, by, bz, rad = 0.032) => {
      const a = new THREE.Vector3(ax, ay, az);
      const b = new THREE.Vector3(bx, by, bz);
      const len = a.distanceTo(b);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 7), mDarkMetal);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      mesh.castShadow = true;
      this.rig.add(mesh);
    };
    for (const sx of [-1, 1]) {
      addStrut(sx * 0.92, 0.18, 1.05, sx * 0.42, bodyY - 0.16, 0.95);
      addStrut(sx * 0.92, 0.18, -0.65, sx * 0.42, bodyY - 0.16, -0.55);
      addStrut(sx * 0.92, 0.18, 1.05, sx * 0.42, bodyY - 0.16, -0.35, 0.024);
    }

    // 2. Tapered Fuselage (nose cowling -> cabin -> tapered tailcone)
    // Engine cowling
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.85, 16), mIvory);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, bodyY + 0.06, 1.68);
    cowl.castShadow = true;
    this.rig.add(cowl);

    const cowlRing = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.39, 0.16, 16), mSienna);
    cowlRing.rotation.x = Math.PI / 2;
    cowlRing.position.set(0, bodyY + 0.06, 2.04);
    this.rig.add(cowlRing);

    const noseCap = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mDarkMetal);
    noseCap.rotation.x = Math.PI / 2;
    noseCap.scale.set(1, 0.5, 1);
    noseCap.position.set(0, bodyY + 0.06, 2.1);
    this.rig.add(noseCap);

    // Lower cabin hull & seats (open-view canopy framing so the girl is visible inside)
    const cabinFloor = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.48, 1.78), mIvory);
    cabinFloor.position.set(0, bodyY, 0.36);
    cabinFloor.castShadow = true;
    this.rig.add(cabinFloor);

    const cabinStripe = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.14, 1.8), mGreen);
    cabinStripe.position.set(0, bodyY + 0.06, 0.36);
    this.rig.add(cabinStripe);

    // Cabin seats
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.46, 0.12), mSeat);
    seatBack.position.set(0, bodyY + 0.38, 0.05);
    this.rig.add(seatBack);

    // Sloped windshield & cabin roof pillars
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.48, 0.06), mGlass);
    windshield.position.set(0, bodyY + 0.45, 1.15);
    windshield.rotation.x = -0.52;
    this.rig.add(windshield);

    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.36, 1.25), mGlass);
    sideWindow.position.set(0, bodyY + 0.42, 0.34);
    this.rig.add(sideWindow);

    // Structural cabin window pillars connecting fuselage sills up to the high wing
    for (const sx of [-0.45, 0.45]) {
      addStrut(sx, bodyY + 0.22, 1.02, sx * 0.94, bodyY + 0.64, 0.92, 0.024);
      addStrut(sx, bodyY + 0.22, -0.22, sx * 0.94, bodyY + 0.64, -0.18, 0.026);
    }

    // Tapered rear tailcone
    const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.13, 2.25, 14), mIvory);
    tailCone.rotation.x = Math.PI / 2;
    tailCone.scale.set(0.92, 1.0, 1.08);
    tailCone.position.set(0, bodyY + 0.08, -1.65);
    tailCone.castShadow = true;
    this.rig.add(tailCone);

    const tailStripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 2.1), mGreen);
    tailStripe.position.set(0, bodyY + 0.12, -1.62);
    this.rig.add(tailStripe);

    // 3. High Wing + V-struts + Wingtip Trim
    const wingGroup = new THREE.Group();
    wingGroup.position.set(0, bodyY + 0.68, 0.38);

    const wingMain = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.14, 1.28), mIvory);
    wingMain.castShadow = true;
    wingMain.receiveShadow = true;
    wingGroup.add(wingMain);

    // Wing green trailing accent & burnt-sienna wingtips
    const wingBand = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.15, 0.24), mGreen);
    wingBand.position.set(0, 0.005, -0.42);
    wingGroup.add(wingBand);

    for (const sx of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.15, 1.18), mSienna);
      tip.position.set(sx * 3.45, 0, -0.02);
      tip.castShadow = true;
      wingGroup.add(tip);

      // Wingtip navigation bulb
      const nav = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        new THREE.MeshStandardMaterial({
          color: sx < 0 ? '#f4a261' : '#7fd8be',
          emissive: sx < 0 ? '#f4a261' : '#7fd8be',
          emissiveIntensity: 1.2,
        })
      );
      nav.position.set(sx * 3.63, 0.02, 0.35);
      wingGroup.add(nav);

      // Diagonal wing brace struts
      addStrut(sx * 0.48, bodyY - 0.12, 0.42, sx * 2.05, bodyY + 0.64, 0.42, 0.028);
    }
    this.rig.add(wingGroup);

    // 4. Tailplane (Vertical Fin + Articulated Rudder + Horizontal Stabilizer)
    const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.92, 0.78), mIvory);
    vFin.position.set(0, bodyY + 0.56, -2.42);
    vFin.rotation.x = -0.22;
    vFin.castShadow = true;
    this.rig.add(vFin);

    this.rudder = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.88, 0.36), mSienna);
    this.rudder.position.set(0, bodyY + 0.56, -2.86);
    this.rig.add(this.rudder);

    const hStab = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.08, 0.62), mIvory);
    hStab.position.set(0, bodyY + 0.24, -2.55);
    hStab.castShadow = true;
    this.rig.add(hStab);

    const hTipL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.56), mGreen);
    hTipL.position.set(-1.12, bodyY + 0.24, -2.55);
    this.rig.add(hTipL);
    const hTipR = hTipL.clone();
    hTipR.position.x = 1.12;
    this.rig.add(hTipR);

    // 5. Spinning 2-Blade Propeller + Motion Blur Disc
    this.propGroup = new THREE.Group();
    this.propGroup.position.set(0, bodyY + 0.06, 2.24);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 12), mAluminum);
    spinner.rotation.x = Math.PI / 2;
    this.propGroup.add(spinner);

    const bladeGeo = new THREE.BoxGeometry(0.11, 1.56, 0.028);
    const blade = new THREE.Mesh(bladeGeo, mDarkMetal);
    blade.castShadow = true;
    this.propGroup.add(blade);

    const tipTop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.032), mSienna);
    tipTop.position.y = 0.72;
    this.propGroup.add(tipTop);
    const tipBot = tipTop.clone();
    tipBot.position.y = -0.72;
    this.propGroup.add(tipBot);

    this.propDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.79, 24),
      new THREE.MeshBasicMaterial({
        color: '#dce2e8',
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.propDisc.userData.fx = true;
    this.propDisc.userData.nonsolid = true;
    this.propGroup.add(this.propDisc);
    this.rig.add(this.propGroup);

    // Seat anchor for the girl when riding
    this.seatAnchor = new THREE.Object3D();
    this.seatAnchor.position.set(0, bodyY + 0.08, 0.34);
    this.rig.add(this.seatAnchor);

    // Subtle non-solid invitation ring around moored plane float step (visible in garden)
    this.boardRing = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.38, 32),
      new THREE.MeshBasicMaterial({
        color: PALETTE.lanternAmber,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.boardRing.rotation.x = -Math.PI / 2;
    this.boardRing.position.set(-1.35, 0.16, 0.45);
    this.boardRing.userData.fx = true;
    this.boardRing.userData.nonsolid = true;
    this.group.add(this.boardRing);

    this.syncTransform();
  }

  forwardDir(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  getSeatWorldPos(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld(true);
    return this.seatAnchor.getWorldPosition(out);
  }

  syncTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.rig.rotation.order = 'XYZ';
    this.rig.rotation.x = -this.pitch;
    this.rig.rotation.z = -this.roll;
  }

  updateVisuals(dt, t, { throttle = 0.2, steerX = 0, showRing = false, bob = 0 } = {}) {
    const propSpin = 8 + throttle * 38;
    this.propAngle += propSpin * dt;
    this.propGroup.rotation.z = this.propAngle;
    this.propDisc.material.opacity = Math.min(0.28, Math.max(0, throttle - 0.25) * 0.35);

    this.rudder.rotation.y = -steerX * 0.32;
    this.rig.position.y = bob;

    this.boardRing.visible = showRing;
    if (showRing) {
      const pulse = 1 + Math.sin(t * 3.2) * 0.08;
      this.boardRing.scale.set(pulse, pulse, 1);
      this.boardRing.material.opacity = 0.42 + Math.sin(t * 3.2) * 0.18;
    }

    this.syncTransform();
  }
}
