import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';
import { makeSpriteTexture } from '../core/textures.js';

// Snow flurries, speed frost streaks, 20s luminous guide stream, and pulse target ring (all nonsolid FX)
export class ParticleFX {
  constructor({ snowCount = 240, guideCount = 36 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'particleFX';
    this.group.userData.nonsolid = true;
    this.group.userData.fx = true;
    const spriteTex = makeSpriteTexture();

    // 1. Drifting snow & frost sparkles around player
    this.snowCount = snowCount;
    this.snowPos = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * 44;
      this.snowPos[i * 3 + 1] = Math.random() * 18;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snowMat = new THREE.PointsMaterial({
      color: 0xeaf4ff,
      map: spriteTex,
      size: 0.24,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.snowPoints = new THREE.Points(snowGeo, this.snowMat);
    this.snowPoints.name = 'snowFlurries';
    this.snowPoints.userData.nonsolid = true;
    this.snowPoints.userData.fx = true;
    this.snowPoints.frustumCulled = false;
    this.group.add(this.snowPoints);

    // 2. Gentle 20s guide stream motes drifting toward Aurora Post Office
    this.guideCount = guideCount;
    this.guidePos = new Float32Array(guideCount * 3);
    const guideGeo = new THREE.BufferGeometry();
    guideGeo.setAttribute('position', new THREE.BufferAttribute(this.guidePos, 3));
    this.guideMat = new THREE.PointsMaterial({
      color: PALETTE.emeraldGlow,
      map: spriteTex,
      size: 0.62,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.guidePoints = new THREE.Points(guideGeo, this.guideMat);
    this.guidePoints.name = 'guideStream';
    this.guidePoints.userData.nonsolid = true;
    this.guidePoints.userData.fx = true;
    this.guidePoints.frustumCulled = false;
    this.group.add(this.guidePoints);

    // 3. Soft pulsing interaction ring on snow (e.g. around puppy / sleigh / post office)
    const ringGeo = new THREE.RingGeometry(0.65, 0.85, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.amberGlow,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.cueRing = new THREE.Mesh(ringGeo, this.ringMat);
    this.cueRing.name = 'cueRing';
    this.cueRing.userData.nonsolid = true;
    this.cueRing.userData.fx = true;
    this.group.add(this.cueRing);
  }

  update(dt, t, center, goalPos, guideAlpha = 0) {
    // Wrap snow flurries smoothly around active camera/player area
    const p = this.snowPos;
    const cx = center.x;
    const cy = center.y;
    const cz = center.z;
    for (let i = 0; i < this.snowCount; i++) {
      let x = p[i * 3];
      let y = p[i * 3 + 1];
      let z = p[i * 3 + 2];
      y -= dt * (1.2 + (i % 3) * 0.35);
      x += Math.sin(t + i) * dt * 0.45;
      if (y < cy - 5) y += 22;
      if (y > cy + 17) y -= 22;
      if (x < cx - 22) x += 44;
      if (x > cx + 22) x -= 44;
      if (z < cz - 22) z += 44;
      if (z > cz + 22) z -= 44;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    this.snowPoints.geometry.attributes.position.needsUpdate = true;

    // Guide stream toward goal when player is idle ~20s
    this.guideMat.opacity = guideAlpha * 0.85;
    this.guidePoints.visible = guideAlpha > 0.02;
    if (this.guidePoints.visible) {
      const dx = goalPos.x - cx;
      const dy = goalPos.y + 3 - cy;
      const dz = goalPos.z - cz;
      const len = Math.max(1, Math.hypot(dx, dy, dz));
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;
      for (let i = 0; i < this.guideCount; i++) {
        const phase = ((t * 0.38 + i / this.guideCount) % 1);
        const dist = 3 + phase * Math.min(48, len);
        this.guidePos[i * 3] = cx + nx * dist + Math.sin(t * 2 + i) * 0.55;
        this.guidePos[i * 3 + 1] = cy + 1.2 + ny * dist + Math.cos(t * 2.5 + i) * 0.35;
        this.guidePos[i * 3 + 2] = cz + nz * dist;
      }
      this.guidePoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  setCue(visible, x = 0, y = 0, z = 0, scale = 1, t = 0, emerald = false) {
    this.cueRing.visible = visible;
    if (!visible) return;
    this.cueRing.position.set(x, y + 0.05, z);
    const pulse = 1 + Math.sin(t * 3.8) * 0.1;
    this.cueRing.scale.setScalar(scale * pulse);
    this.ringMat.color.setHex(emerald ? PALETTE.emeraldGlow : PALETTE.amberGlow);
    this.ringMat.opacity = 0.52 + Math.sin(t * 3.8) * 0.22;
  }
}
