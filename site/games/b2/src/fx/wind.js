import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';
import { clamp, rng } from '../core/math.js';

function makeSoftMoteTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const _moteTex = makeSoftMoteTex();

export function createThermalWaypoints() {
  return [
    new THREE.Vector3(0, 18.5, 86),     // Just past the stone bridge
    new THREE.Vector3(-18, 25.5, 126),  // Near the watermill & lower terraces
    new THREE.Vector3(14, 36.5, 174),   // Rising over mid mirror terraces
    new THREE.Vector3(-6, 52.0, 222),   // Climbing high toward summer cumulus
    new THREE.Vector3(8, 64.0, 266),    // Cloud-edge panoramic peak
    new THREE.Vector3(0, 54.0, 306),    // Smooth glide approach to lookout hill
  ];
}

export class ThermalRings {
  constructor(waypoints) {
    this.group = new THREE.Group();
    this.group.name = 'thermalRings';
    this.group.userData.fx = true;
    this.group.userData.nonsolid = true;

    this.waypoints = waypoints;
    this.rings = [];
    this.passed = new Set();

    const ringGeo = new THREE.TorusGeometry(6.6, 0.22, 10, 44);
    const innerGeo = new THREE.TorusGeometry(5.6, 0.1, 8, 40);

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const next = i < waypoints.length - 1 ? waypoints[i + 1] : new THREE.Vector3(0, 46, 344);
      const dir = next.clone().sub(wp).normalize();

      const holder = new THREE.Group();
      holder.position.copy(wp);
      holder.lookAt(wp.clone().add(dir));
      holder.userData.fx = true;
      holder.userData.nonsolid = true;

      const matOuter = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? new THREE.Color('#fff5d8') : new THREE.Color('#d8f0ff'),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const matInner = new THREE.MeshBasicMaterial({
        color: PALETTE.yamabuki,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      });

      const outer = new THREE.Mesh(ringGeo, matOuter);
      const inner = new THREE.Mesh(innerGeo, matInner);
      outer.userData.fx = true;
      outer.userData.nonsolid = true;
      inner.userData.fx = true;
      inner.userData.nonsolid = true;
      holder.add(outer, inner);

      // Gentle ascending wind motes inside each thermal column
      const moteGeo = new THREE.BufferGeometry();
      const mCount = 16;
      const mPos = new Float32Array(mCount * 3);
      for (let m = 0; m < mCount; m++) {
        const a = (m / mCount) * Math.PI * 2;
        const rad = 3.2 + (m % 3) * 1.2;
        mPos[m * 3] = Math.cos(a) * rad;
        mPos[m * 3 + 1] = ((m / mCount) - 0.5) * 9.0;
        mPos[m * 3 + 2] = Math.sin(a) * rad;
      }
      moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
      const motes = new THREE.Points(
        moteGeo,
        new THREE.PointsMaterial({
          color: '#fff8e2',
          map: _moteTex,
          size: 0.48,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        })
      );
      motes.userData.fx = true;
      motes.userData.nonsolid = true;
      holder.add(motes);

      this.rings.push({ holder, outer, inner, motes, matOuter, matInner, pulse: 0 });
      this.group.add(holder);
    }
  }

  triggerBurst(idx) {
    if (this.rings[idx]) {
      this.rings[idx].pulse = 1.0;
      this.passed.add(idx);
    }
  }

  update(dt, t) {
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      r.pulse = Math.max(0, r.pulse - dt * 1.4);
      const s = 1 + Math.sin(t * 1.8 + i) * 0.03 + r.pulse * 0.28;
      r.outer.scale.setScalar(s);
      r.inner.scale.setScalar(1 + Math.cos(t * 2.2 + i) * 0.04 + r.pulse * 0.18);
      r.motes.rotation.z = t * 0.65 + i;
      const passed = this.passed.has(i);
      r.matOuter.opacity = passed ? 0.18 + r.pulse * 0.45 : 0.42 + Math.sin(t * 2.4 + i) * 0.08;
      r.matInner.opacity = passed ? 0.12 + r.pulse * 0.35 : 0.36;
    }
  }
}

export class WindStreaks {
  constructor(count = 140) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#f7fbff'),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.name = 'windStreaks';
    this.lines.userData.fx = true;
    this.lines.userData.nonsolid = true;
    this.lines.frustumCulled = false;

    const r = rng(303);
    this.seeds = Array.from({ length: count }, () => ({
      ox: (r() - 0.5) * 26,
      oy: (r() - 0.5) * 14,
      oz: r() * 44,
      len: 1.8 + r() * 2.4,
    }));
  }

  update(dt, center, forward, speed) {
    const alpha = clamp((speed - 7) / 14, 0, 0.42);
    this.lines.material.opacity = alpha;
    this.lines.visible = alpha > 0.02;
    if (!this.lines.visible) return;

    const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const step = (10 + speed * 1.4) * dt;

    for (let i = 0; i < this.count; i++) {
      const s = this.seeds[i];
      s.oz -= step;
      if (s.oz < -8) s.oz += 52;

      const x = center.x + right.x * s.ox + forward.x * s.oz;
      const y = center.y + up.y * s.oy + forward.y * s.oz;
      const z = center.z + right.z * s.ox + forward.z * s.oz;

      const o = i * 6;
      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z;
      this.positions[o + 3] = x - forward.x * s.len;
      this.positions[o + 4] = y - forward.y * s.len;
      this.positions[o + 5] = z - forward.z * s.len;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

export class GuideStream {
  constructor(count = 40) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color('#ffebb2'),
      map: _moteTex,
      size: 0.55,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.name = 'breezeGuide';
    this.points.userData.fx = true;
    this.points.userData.nonsolid = true;
    this.points.frustumCulled = false;
    this.t = 0;
  }

  update(dt, fromPos, goalPos, alpha) {
    this.t += dt;
    this.points.material.opacity = clamp(alpha, 0, 0.85);
    this.points.visible = alpha > 0.02;
    if (!this.points.visible) return;

    const dir = goalPos.clone().sub(fromPos);
    const dist = Math.max(1, dir.length());
    dir.divideScalar(dist);
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

    for (let i = 0; i < this.count; i++) {
      const u = ((i / this.count + this.t * 0.24) % 1);
      const ahead = 4 + u * Math.min(36, dist);
      const sway = Math.sin(this.t * 2.5 + i * 0.7) * 1.4;
      const lift = Math.cos(this.t * 2.0 + i * 0.5) * 0.65 + u * 1.5;
      this.positions[i * 3] = fromPos.x + dir.x * ahead + right.x * sway;
      this.positions[i * 3 + 1] = fromPos.y + dir.y * ahead + lift;
      this.positions[i * 3 + 2] = fromPos.z + dir.z * ahead + right.z * sway;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class FloatCanopy {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'floatCanopy';
    this.group.userData.fx = true;
    this.group.userData.nonsolid = true;

    const canopyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fbf7eb'),
      emissive: new THREE.Color('#ffe5a8'),
      emissiveIntensity: 0.45,
      roughness: 0.55,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const ribMat = new THREE.MeshBasicMaterial({
      color: PALETTE.yamabuki,
      transparent: true,
      opacity: 0.8,
    });
    const auraMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        void main(){
          float ndv = clamp(dot(normalize(vNormalView), normalize(vViewDir)), 0.0, 1.0);
          float rim = pow(1.0 - ndv, 2.2) * smoothstep(0.0, 0.35, ndv);
          float core = pow(ndv, 2.4) * 0.08;
          float a = clamp((rim * 0.32 + core) * (0.92 + 0.08 * sin(uTime * 2.5)), 0.0, 0.38);
          vec3 col = mix(vec3(1.0, 0.94, 0.72), vec3(1.0, 0.98, 0.90), ndv);
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.auraMat = auraMat;

    // Dandelion-pappus / sunlit paper parasol canopy above girl's hands
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.44),
      canopyMat
    );
    dome.scale.set(1.0, 0.52, 1.0);
    dome.position.y = 1.62;
    this.group.add(dome);

    // Subtle radial ribs tucked neatly inside the parasol dome
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.72, 5), ribMat);
      rib.position.set(Math.cos(a) * 0.36, 1.82, Math.sin(a) * 0.36);
      rib.rotation.z = Math.cos(a) * 1.32;
      rib.rotation.x = -Math.sin(a) * 1.32;
      this.group.add(rib);
    }

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.65, 6), ribMat);
    handle.position.y = 1.32;
    this.group.add(handle);

    // Soft ethereal wind aura around descending girl (no hard disc edge)
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.18, 18, 14), auraMat);
    this.aura.position.y = 0.85;
    this.group.add(this.aura);

    this.group.traverse((o) => {
      o.userData.fx = true;
      o.userData.nonsolid = true;
    });
    this.group.visible = false;
  }

  update(t, visible, girlPos) {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.copy(girlPos);
    this.group.rotation.y = Math.sin(t * 1.1) * 0.16;
    this.aura.scale.setScalar(1 + Math.sin(t * 2.8) * 0.05);
    this.auraMat.uniforms.uTime.value = t;
  }
}

export class LandingRing {
  constructor() {
    this.mesh = new THREE.Group();
    this.mesh.name = 'boardingRing';
    this.mesh.userData.fx = true;
    this.mesh.userData.nonsolid = true;

    const geoOuter = new THREE.RingGeometry(2.35, 2.72, 48);
    geoOuter.rotateX(-Math.PI / 2);
    this.matOuter = new THREE.MeshBasicMaterial({
      color: PALETTE.yamabuki,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.outerRing = new THREE.Mesh(geoOuter, this.matOuter);

    const geoInner = new THREE.RingGeometry(1.92, 2.1, 44);
    geoInner.rotateX(-Math.PI / 2);
    this.matInner = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fff9e2'),
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.innerRing = new THREE.Mesh(geoInner, this.matInner);
    this.innerRing.position.y = 0.04;

    // Gentle ascending breeze motes inviting boarding (wordless)
    const moteCount = 12;
    const mPos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      const a = (i / moteCount) * Math.PI * 2;
      mPos[i * 3] = Math.cos(a) * 1.75;
      mPos[i * 3 + 1] = 0.25 + (i % 4) * 0.32;
      mPos[i * 3 + 2] = Math.sin(a) * 1.75;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    this.motes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        color: '#ffe9a6',
        map: _moteTex,
        size: 0.3,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      })
    );

    this.mesh.add(this.outerRing, this.innerRing, this.motes);
    this.mesh.traverse((o) => {
      o.userData.fx = true;
      o.userData.nonsolid = true;
    });
  }

  update(t, visible, pos) {
    this.mesh.visible = visible;
    if (!visible) return;
    this.mesh.position.set(pos.x, pos.y + 0.14, pos.z);
    const s = 1 + Math.sin(t * 2.8) * 0.07;
    this.outerRing.scale.setScalar(s);
    this.innerRing.scale.setScalar(1 + Math.cos(t * 2.8) * 0.05);
    this.matOuter.opacity = 0.54 + Math.sin(t * 2.8) * 0.2;
    this.matInner.opacity = 0.42 + Math.cos(t * 2.8) * 0.18;
    this.motes.rotation.y = t * 0.85;
    this.motes.position.y = Math.sin(t * 2.0) * 0.14;
  }
}
