import * as THREE from '../../lib/three.module.js';
import { PALETTE, markNonSolid, shared } from '../core/env.js';
import { clamp, rng } from '../core/math.js';
import { makeRadialGlowTexture } from '../core/textures.js';

/** Combined carpet stardust trail & dune-skimming golden sand plume (non-solid FX). */
export class MagicTrail {
  constructor(maxParticles = 240) {
    this.max = maxParticles;
    this.idx = 0;
    this.pos = new Float32Array(maxParticles * 3);
    this.vel = new Float32Array(maxParticles * 3);
    this.life = new Float32Array(maxParticles);
    this.maxLife = new Float32Array(maxParticles);
    this.col = new Float32Array(maxParticles * 3);

    for (let i = 0; i < maxParticles; i++) {
      this.pos[i * 3 + 1] = -9999;
      this.life[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.42,
      map: makeRadialGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'magicTrailFx';
    markNonSolid(this.points, 'fx');
  }

  emit(origin, vx, vy, vz, colorHex, lifeSec = 1.2) {
    const i = this.idx;
    this.idx = (this.idx + 1) % this.max;
    this.pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.45;
    this.pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.25;
    this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.45;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = lifeSec;
    this.maxLife[i] = lifeSec;

    const c = new THREE.Color(colorHex);
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
  }

  update(dt, dpr = 1) {
    this.points.material.size = 0.28 * Math.min(dpr, 1.8);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.vel[i * 3] *= 0.96;
        this.vel[i * 3 + 1] *= 0.96;
        this.vel[i * 3 + 2] *= 0.96;
        if (this.life[i] <= 0) {
          this.pos[i * 3 + 1] = -9999;
        }
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** Speed wind streaks for exhilarating low-dune & high-sky flight feel. */
export class WindStreaks {
  constructor(count = 140) {
    this.count = count;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const rand = rng(518);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 34;
      pos[i * 3 + 1] = (rand() - 0.5) * 18;
      pos[i * 3 + 2] = (rand() - 0.5) * 46;
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uAlpha: { value: 0 },
        uSize: { value: 18 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uSize;
        varying float vSeed;
        void main() {
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(uSize / max(1.0, -mv.z), 1.5, 6.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha;
        varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d) * uAlpha * (0.5 + 0.5 * vSeed);
          vec3 c = mix(vec3(0.95, 0.78, 0.42), vec3(0.45, 0.92, 0.88), vSeed);
          gl_FragColor = vec4(c, a);
        }`,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'windStreaksFx';
    markNonSolid(this.points, 'fx');
  }

  update(dt, center, dir, speed, dpr = 1) {
    const pos = this.points.geometry.attributes.position.array;
    const flow = clamp((speed - 5.5) / 13, 0, 1);
    this.points.material.uniforms.uAlpha.value = flow * 0.68;
    this.points.material.uniforms.uSize.value = 21 * dpr;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      pos[i3] -= dir.x * speed * dt * 1.15;
      pos[i3 + 1] -= dir.y * speed * dt * 1.15;
      pos[i3 + 2] -= dir.z * speed * dt * 1.15;

      if (Math.abs(pos[i3] - center.x) > 22) pos[i3] = center.x + (Math.random() - 0.5) * 32;
      if (Math.abs(pos[i3 + 1] - center.y) > 12) pos[i3 + 1] = center.y + (Math.random() - 0.5) * 18;
      if (Math.abs(pos[i3 + 2] - center.z) > 26) pos[i3 + 2] = center.z + dir.z * 18 + (Math.random() - 0.5) * 26;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Gentle 20s guide stream pointing smoothly toward the observatory beacon. */
export class GuideStream {
  constructor(count = 40) {
    this.count = count;
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: PALETTE.turquoiseGlow,
      size: 0.52,
      map: makeRadialGlowTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'guideStreamFx';
    markNonSolid(this.points, 'fx');
    this._t = 0;
  }

  update(dt, origin, target, alpha, dpr = 1) {
    this._t += dt;
    this.points.material.opacity = alpha * 0.78;
    this.points.material.size = 0.36 * Math.min(dpr, 1.8);
    if (alpha <= 0.01) return;

    const arr = this.points.geometry.attributes.position.array;
    const dx = target.x - origin.x;
    const dy = target.y + 4 - origin.y;
    const dz = target.z - origin.z;
    const len = Math.max(1, Math.hypot(dx, dy, dz));
    const ux = dx / len, uy = dy / len, uz = dz / len;

    for (let i = 0; i < this.count; i++) {
      const f = ((i / this.count + this._t * 0.28) % 1);
      const dist = 3.5 + f * 34;
      const sway = Math.sin(this._t * 2.5 + i * 0.7) * 0.65;
      arr[i * 3] = origin.x + ux * dist + sway;
      arr[i * 3 + 1] = origin.y + 0.6 + uy * dist + Math.cos(this._t * 2 + i) * 0.35;
      arr[i * 3 + 2] = origin.z + uz * dist;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Lightweight dusk desert cloud wisps (soft radial falloff, non-solid). */
export class DesertClouds {
  constructor(count = 24) {
    this.group = new THREE.Group();
    this.group.name = 'desertClouds';
    const rand = rng(303);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#d89b78',
      map: makeRadialGlowTexture(),
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mat = mat;

    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      const sx = 46 + rand() * 58;
      const sz = 24 + rand() * 34;
      m.scale.set(sx, 1, sz);
      m.rotation.y = (rand() - 0.5) * 0.5;
      m.position.set(
        (rand() - 0.5) * 340,
        44 + rand() * 24,
        40 + rand() * 380
      );
      this.group.add(m);
    }
    markNonSolid(this.group, 'nonsolid');
  }

  update(nightMix) {
    const c1 = new THREE.Color('#d89b78');
    const c2 = new THREE.Color('#27355d');
    this.mat.color.copy(c1).lerp(c2, clamp(nightMix, 0, 1));
    this.mat.opacity = 0.22 - clamp(nightMix, 0, 1) * 0.16;
  }
}
