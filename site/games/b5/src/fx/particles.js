import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';

function makeSoftCircleTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const SOFT_TEX = makeSoftCircleTexture();

export class ParticleFX {
  constructor(count = 160) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.col = new Float32Array(count * 3);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.48,
      map: SOFT_TEX,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.name = 'lagoonFXParticles';
    this.points.userData.nonsolid = true;
    this.points.userData.fx = true;
    this.points.frustumCulled = false;
  }

  emit(origin, { count = 8, spread = 1.5, speed = 2.5, up = 2.2, color = '#ffe0a3', life = 1.2 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;

      this.pos[idx * 3] = origin.x + (Math.random() - 0.5) * spread;
      this.pos[idx * 3 + 1] = origin.y + Math.random() * 0.5;
      this.pos[idx * 3 + 2] = origin.z + (Math.random() - 0.5) * spread;

      this.vel[idx * 3] = (Math.random() - 0.5) * speed;
      this.vel[idx * 3 + 1] = up * (0.6 + Math.random() * 0.7);
      this.vel[idx * 3 + 2] = (Math.random() - 0.5) * speed;

      this.life[idx] = life * (0.7 + Math.random() * 0.5);
      this.maxLife[idx] = this.life[idx];

      this.col[idx * 3] = c.r;
      this.col[idx * 3 + 1] = c.g;
      this.col[idx * 3 + 2] = c.b;
    }
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 2.4 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class GuideStream {
  constructor(count = 36) {
    this.count = count;
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.72,
      map: SOFT_TEX,
      color: PALETTE.sunsetGold,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.name = 'guideStreamFX';
    this.points.userData.nonsolid = true;
    this.points.userData.fx = true;
    this.points.frustumCulled = false;
    this.phase = 0;
  }

  update(dt, from, to, alpha) {
    this.points.material.opacity = alpha * 0.85;
    if (alpha <= 0.01) return;
    this.phase += dt * 0.42;
    const attr = this.points.geometry.attributes.position;
    for (let i = 0; i < this.count; i++) {
      const t = (i / this.count + this.phase) % 1;
      const arc = Math.sin(t * Math.PI) * 3.5;
      const sway = Math.sin(t * 8 + this.phase * 4) * 1.2;
      const x = from.x + (to.x - from.x) * t + sway;
      const y = from.y + (to.y - from.y) * t + 1.5 + arc;
      const z = from.z + (to.z - from.z) * t;
      attr.setXYZ(i, x, y, z);
    }
    attr.needsUpdate = true;
  }
}
