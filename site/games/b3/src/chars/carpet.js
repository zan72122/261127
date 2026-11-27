import * as THREE from '../../lib/three.module.js';
import { PALETTE, markNonSolid } from '../core/env.js';
import { clamp, damp } from '../core/math.js';
import { makeCarpetTexture, makeRadialGlowTexture } from '../core/textures.js';

export class Carpet {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'flyingCarpet';
    this.pos = this.group.position;

    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.flightWave = 0; // 0 when resting flat, 1 when gliding in air
    this._t = 0;

    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    // Multi-segment deformable woven carpet mesh (1.36m wide x 2.16m long)
    const W = 1.36;
    const L = 2.16;
    const segX = 12;
    const segZ = 18;
    this.geo = new THREE.PlaneGeometry(W, L, segX, segZ);
    this.geo.rotateX(-Math.PI / 2);
    this.basePos = Float32Array.from(this.geo.attributes.position.array);

    const tex = makeCarpetTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.78,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.bodyPivot.add(this.mesh);

    // Corner & edge saffron tassels (stream back in flight)
    const tasselGeo = new THREE.CylinderGeometry(0.016, 0.008, 0.24, 5);
    tasselGeo.rotateX(Math.PI / 2);
    tasselGeo.translate(0, 0, 0.12);
    const tasselMat = new THREE.MeshStandardMaterial({ color: PALETTE.saffron, roughness: 0.72 });
    this.tassels = [];
    for (const tz of [-L * 0.5, L * 0.5]) {
      for (let i = -3; i <= 3; i++) {
        const tx = (i / 3) * (W * 0.45);
        const tMesh = new THREE.Mesh(tasselGeo, tasselMat);
        tMesh.position.set(tx, 0, tz);
        tMesh.userData.front = tz > 0;
        this.bodyPivot.add(tMesh);
        this.tassels.push(tMesh);
      }
    }

    // Subtle non-solid soft radial underside glow tucked neatly beneath weave
    const glowGeo = new THREE.PlaneGeometry(1.42, 2.08);
    glowGeo.rotateX(-Math.PI / 2);
    this.glowMat = new THREE.MeshBasicMaterial({
      color: '#4de2d8',
      map: makeRadialGlowTexture(),
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Mesh(glowGeo, this.glowMat);
    this.glow.position.y = -0.07;
    markNonSolid(this.glow, 'fx');
    this.bodyPivot.add(this.glow);

    // Invitation ring on ground in courtyard (non-solid)
    const ringGeo = new THREE.RingGeometry(0.95, 1.12, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.inviteMat = new THREE.MeshBasicMaterial({
      color: PALETTE.turquoiseGlow,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.inviteRing = new THREE.Mesh(ringGeo, this.inviteMat);
    this.inviteRing.position.y = -0.02;
    markNonSolid(this.inviteRing, 'fx');
    this.group.add(this.inviteRing);

    // Rider and goat local anchors
    this.riderOffset = new THREE.Vector3(0, 0.04, -0.08);
    this.goatOffset = new THREE.Vector3(0.32, 0.03, 0.62);

    // Invisible tap hitbox (non-solid)
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.9, 2.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitbox.position.y = 0.22;
    this.hitbox.userData.tapRole = 'carpet';
    markNonSolid(this.hitbox, 'nonsolid');
    this.group.add(this.hitbox);
  }

  forwardDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    return out.normalize();
  }

  setInviteAlpha(a) {
    this.inviteRing.visible = a > 0.02;
    this.inviteMat.opacity = a * 0.72;
  }

  update(dt) {
    this._t += dt;
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = -this.pitch;
    this.group.rotation.z = this.roll;

    const waveAmp = this.flightWave * (0.045 + clamp(this.speed / 28, 0, 0.055));
    const arr = this.geo.attributes.position.array;
    const base = this.basePos;
    const count = arr.length / 3;
    const freq = 3.8 + this.speed * 0.16;

    for (let i = 0; i < count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      // Travelling magic-weave ripple along Z with slight corner curl
      const edgeFactor = 0.35 + 0.65 * Math.min(1, Math.abs(bx) / 0.68 + Math.abs(bz) / 1.08);
      const w1 = Math.sin(bz * 3.1 - this._t * freq) * waveAmp * edgeFactor;
      const w2 = Math.cos(bx * 2.8 + this._t * (freq * 0.7)) * waveAmp * 0.35;
      // Subtle courtyard hover breath even when invited
      const idleCurl = (1 - this.flightWave) * 0.015 * Math.sin(this._t * 2.6 + bz * 2.2) * (Math.abs(bz) > 0.65 ? 1 : 0);
      arr[i * 3 + 1] = by + w1 + w2 + idleCurl;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();

    // Stream tassels backward with airspeed
    const stream = clamp(this.speed / 14, 0, 1) * this.flightWave;
    for (let i = 0; i < this.tassels.length; i++) {
      const t = this.tassels[i];
      if (t.userData.front) {
        t.rotation.y = Math.PI + Math.sin(this._t * 8 + i) * 0.15 * stream;
        t.rotation.x = 0.25 + stream * 0.28;
      } else {
        t.rotation.y = Math.sin(this._t * 9 + i) * 0.18 * stream;
        t.rotation.x = Math.sin(this._t * 7 + i) * 0.14 * stream;
      }
    }

    this.glowMat.opacity = damp(this.glowMat.opacity, this.flightWave * (0.14 + clamp(this.speed / 24, 0, 0.16)), 6, dt);

    if (this.inviteRing.visible) {
      const s = 1 + Math.sin(this._t * 2.6) * 0.07;
      this.inviteRing.scale.setScalar(s);
    }
  }
}
