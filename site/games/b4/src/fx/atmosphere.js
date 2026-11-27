import * as THREE from '../../lib/three.module.js';
import { LODGE_POS, PALETTE, SUN_DIR, shared } from '../core/env.js';
import { rng } from '../core/math.js';

function makeSoftDotTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.4, 'rgba(255, 255, 255, 0.65)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class AutumnAtmosphere {
  constructor({ low = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'atmosphereFX';
    this.group.userData.fx = true;
    this.group.userData.nonsolid = true;

    this.dotTex = makeSoftDotTexture();
    this._buildCanyonSunShafts(low);
    this._buildWaterSpray(low ? 70 : 140);
    this._buildSpeedStreaks(low ? 48 : 110);
    this._buildFloatMotes(low ? 28 : 56);
    this._buildGuideStream(low ? 24 : 44);
  }

  _buildCanyonSunShafts(low) {
    // Diagonal crepuscular light shafts pouring across the autumn maple canyon
    const count = low ? 6 : 11;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float xFade = sin(vUv.x * 3.1415926);
          xFade = pow(max(xFade, 0.0), 1.65);
          float yFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.12, vUv.y);
          float shimmer = 0.82 + 0.18 * sin(uTime * 0.7 + vUv.x * 5.0);
          vec3 col = vec3(1.0, 0.84, 0.58) * 0.28 * shimmer;
          gl_FragColor = vec4(col * xFade * yFade, xFade * yFade * 0.32);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });

    const rand = rng(515);
    const geo = new THREE.PlaneGeometry(20, 74);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(-14 + rand() * 26, 22 + rand() * 9, 162 + (i / count) * 174);
      // Align diagonally along afternoon sun rays from (-0.78, 0.54, 0.22)
      m.rotation.set(0.18, 0.28, -0.78);
      m.userData.fx = true;
      m.userData.nonsolid = true;
      this.group.add(m);
    }
  }

  _buildWaterSpray(count) {
    const pos = new Float32Array(count * 3);
    this.sprayVel = [];
    this.sprayLife = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] = -999;
      this.sprayVel.push(new THREE.Vector3());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.44,
      map: this.dotTex,
      color: '#eef5fa',
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    this.sprayPts = new THREE.Points(geo, mat);
    this.sprayPts.name = 'sprayParticles';
    this.sprayPts.userData.fx = true;
    this.sprayPts.userData.nonsolid = true;
    this.sprayPts.frustumCulled = false;
    this.sprayCursor = 0;
    this.group.add(this.sprayPts);
  }

  _buildSpeedStreaks(count) {
    const pos = new Float32Array(count * 3);
    this.streakSeeds = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] = -999;
      this.streakSeeds.push({
        ox: (Math.random() - 0.5) * 24,
        oy: (Math.random() - 0.5) * 14,
        oz: Math.random() * 48,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.28,
      map: this.dotTex,
      color: '#fff3d6',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.streakPts = new THREE.Points(geo, mat);
    this.streakPts.name = 'speedStreaks';
    this.streakPts.userData.fx = true;
    this.streakPts.userData.nonsolid = true;
    this.streakPts.frustumCulled = false;
    this.group.add(this.streakPts);
  }

  _buildFloatMotes(count) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.36,
      map: this.dotTex,
      color: PALETTE.lanternAmber,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.motePts = new THREE.Points(geo, mat);
    this.motePts.name = 'floatMotes';
    this.motePts.userData.fx = true;
    this.motePts.userData.nonsolid = true;
    this.motePts.frustumCulled = false;
    this.group.add(this.motePts);
  }

  _buildGuideStream(count) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55,
      map: this.dotTex,
      color: PALETTE.lanternAmber,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.guidePts = new THREE.Points(geo, mat);
    this.guidePts.name = 'guideStream';
    this.guidePts.userData.fx = true;
    this.guidePts.userData.nonsolid = true;
    this.guidePts.frustumCulled = false;
    this.group.add(this.guidePts);
  }

  emitSpray(planePos, yaw, intensity) {
    const attr = this.sprayPts.geometry.attributes.position;
    const count = attr.count;
    const emitCount = Math.min(16, Math.ceil(intensity * 14));
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = fz;
    const rz = -fx;

    for (let k = 0; k < emitCount; k++) {
      const idx = this.sprayCursor % count;
      this.sprayCursor++;
      const side = k % 2 === 0 ? -0.92 : 0.92;
      const aft = k % 3 === 0 ? -1.8 : 0.35;
      attr.setXYZ(
        idx,
        planePos.x + rx * side + fx * aft + (Math.random() - 0.5) * 0.25,
        0.08 + Math.random() * 0.14,
        planePos.z + rz * side + fz * aft + (Math.random() - 0.5) * 0.25
      );
      this.sprayVel[idx].set(
        rx * Math.sign(side) * (2.1 + Math.random() * 2.2) - fx * (2.6 + Math.random() * 2.0),
        1.6 + Math.random() * 2.2 * intensity,
        rz * Math.sign(side) * (2.1 + Math.random() * 2.2) - fz * (2.6 + Math.random() * 2.0)
      );
      this.sprayLife[idx] = 0.42 + Math.random() * 0.4;
    }
    attr.needsUpdate = true;
  }

  update(dt, t, { planePos, yaw, speed, spray, girlPos, isFloating, guideAlpha }) {
    // 1. Update water spray droplets
    if (spray > 0.08) this.emitSpray(planePos, yaw, spray);
    const sAttr = this.sprayPts.geometry.attributes.position;
    for (let i = 0; i < sAttr.count; i++) {
      if (this.sprayLife[i] > 0) {
        this.sprayLife[i] -= dt;
        const v = this.sprayVel[i];
        v.y -= 7.8 * dt;
        sAttr.setXYZ(
          i,
          sAttr.getX(i) + v.x * dt,
          sAttr.getY(i) + v.y * dt,
          sAttr.getZ(i) + v.z * dt
        );
        if (this.sprayLife[i] <= 0 || sAttr.getY(i) < -0.2) {
          sAttr.setY(i, -999);
          this.sprayLife[i] = 0;
        }
      }
    }
    sAttr.needsUpdate = true;

    // 2. Speed wind streaks when gliding fast
    const kAttr = this.streakPts.geometry.attributes.position;
    const speedFade = Math.max(0, Math.min(1, (speed - 11) / 14));
    this.streakPts.material.opacity = speedFade * 0.45;
    if (speedFade > 0.02) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = fz;
      const rz = -fx;
      for (let i = 0; i < kAttr.count; i++) {
        const s = this.streakSeeds[i];
        s.oz -= speed * 1.4 * dt;
        if (s.oz < -6) s.oz += 52;
        kAttr.setXYZ(
          i,
          planePos.x + rx * s.ox + fx * s.oz,
          planePos.y + 1.2 + s.oy,
          planePos.z + rz * s.ox + fz * s.oz
        );
      }
      kAttr.needsUpdate = true;
    }

    // 3. Luminous descent motes around parasol
    this.motePts.material.opacity = isFloating ? 0.72 : 0;
    if (isFloating) {
      const mAttr = this.motePts.geometry.attributes.position;
      for (let i = 0; i < mAttr.count; i++) {
        const ang = t * 1.2 + i * 0.65;
        const rad = 0.55 + (i % 5) * 0.22;
        const oy = ((i / mAttr.count + t * 0.22) % 1.0) * 2.2 - 0.1;
        mAttr.setXYZ(i, girlPos.x + Math.cos(ang) * rad, girlPos.y + oy, girlPos.z + Math.sin(ang) * rad);
      }
      mAttr.needsUpdate = true;
    }

    // 4. Gentle 20s idle guide stream toward Glacier Lake Lodge
    this.guidePts.material.opacity = guideAlpha * 0.75;
    if (guideAlpha > 0.02) {
      const gAttr = this.guidePts.geometry.attributes.position;
      const dir = LODGE_POS.clone().sub(planePos);
      const dist = Math.max(1, dir.length());
      dir.divideScalar(dist);
      for (let i = 0; i < gAttr.count; i++) {
        const u = ((i / gAttr.count) + t * 0.35) % 1;
        const d = 4 + u * Math.min(55, dist * 0.8);
        const arc = Math.sin(u * Math.PI) * 3.5;
        const sway = Math.sin(t * 2 + i * 0.5) * 1.1;
        gAttr.setXYZ(
          i,
          planePos.x + dir.x * d + sway,
          Math.max(2.0, planePos.y + dir.y * d + arc),
          planePos.z + dir.z * d
        );
      }
      gAttr.needsUpdate = true;
    }
  }
}
