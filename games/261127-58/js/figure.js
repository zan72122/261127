// figure.js — loads SDF-built skinned meshes (girl, papa, glove), poses, IK.
import * as THREE from './three.module.min.js';
import { organic, smooth, clamp } from './core.js';

export async function loadBin(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const hl = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl;
  const [lo, hi] = header.bbox;
  const geos = {};
  for (const m of header.meshes) {
    const n = m.count;
    const q = new Uint16Array(buf, base + m.pos, n * 3);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) { const k = i % 3; pos[i] = lo[k] + (q[i] / 65535) * (hi[k] - lo[k]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const nb = new THREE.InterleavedBuffer(new Int8Array(buf, base + m.nrm, n * 4), 4);
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(nb, 3, 0, true));
    const cb = new THREE.InterleavedBuffer(new Uint8Array(buf, base + m.col, n * 4), 4);
    g.setAttribute('color', new THREE.InterleavedBufferAttribute(cb, 3, 0, true));
    g.setAttribute('ao', new THREE.InterleavedBufferAttribute(cb, 1, 3, true));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(buf, base + m.si, n * 4), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(buf, base + m.sw, n * 4), 4, true));
    const idx = m.i16 ? new Uint16Array(buf, base + m.idx, m.icount) : new Uint32Array(buf, base + m.idx, m.icount);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    geos[m.name] = g;
  }
  return { bones: header.bones, geos };
}

// ------------------------------------------------------------------ Figure
export class Figure {
  constructor(data, mats, { shadows = true } = {}) {
    this.group = new THREE.Group();
    this.root = new THREE.Group(); this.group.add(this.root);
    const list = data.bones.list;
    this.bones = []; this.byName = {};
    list.forEach((b, i) => {
      const bone = new THREE.Bone(); bone.name = b.name;
      const p = b.pos, pp = b.parent >= 0 ? list[b.parent].pos : [0, 0, 0];
      bone.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      this.bones.push(bone); this.byName[b.name] = bone;
      if (b.parent >= 0) this.bones[b.parent].add(bone); else this.root.add(bone);
    });
    this.restPos = this.bones.map(b => b.position.clone());
    this.group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.meshes = {};
    for (const [name, g] of Object.entries(data.geos)) {
      if (!mats[name]) continue;
      const m = new THREE.SkinnedMesh(g, mats[name]);
      m.bind(this.skeleton);
      m.castShadow = shadows; m.receiveShadow = true; m.frustumCulled = false;
      this.root.add(m); this.meshes[name] = m;
    }
    // pose state: target & current euler per bone
    this.cur = {}; this.tgt = {}; this.add = {};
    for (const b of this.bones) { this.cur[b.name] = new THREE.Euler(); this.tgt[b.name] = new THREE.Euler(); this.add[b.name] = new THREE.Euler(); }
    this.rate = 8; this.ik = {};
    this.lift = 0; this.liftV = 0;
  }
  pose(p, rate) {
    for (const b of this.bones) this.tgt[b.name].set(0, 0, 0);
    for (const [k, v] of Object.entries(p)) if (this.tgt[k]) this.tgt[k].set(v[0] || 0, v[1] || 0, v[2] || 0);
    if (rate) this.rate = rate;
  }
  setPose(p) { this.pose(p); for (const b of this.bones) this.cur[b.name].copy(this.tgt[b.name]); }
  jump(v = 1.6) { if (this.lift <= 0.001) this.liftV = v; }
  update(dt) {
    const q = new THREE.Quaternion();
    for (const b of this.bones) {
      const c = this.cur[b.name], t = this.tgt[b.name], a = this.add[b.name];
      c.x = smooth(c.x, t.x, this.rate, dt); c.y = smooth(c.y, t.y, this.rate, dt); c.z = smooth(c.z, t.z, this.rate, dt);
      b.rotation.set(c.x + a.x, c.y + a.y, c.z + a.z);
    }
    // little jump physics
    if (this.liftV !== 0 || this.lift > 0) {
      this.liftV -= 9.8 * dt; this.lift += this.liftV * dt;
      if (this.lift <= 0) { this.lift = 0; this.liftV = 0; }
    }
    this.root.position.y = this.lift;
    this.group.updateMatrixWorld(true);
    for (const [side, t] of Object.entries(this.ik)) if (t && t.on) this.solveArm(side, t);
  }
  // two-bone arm IK towards a world target with an elbow pole
  solveArm(side, t) {
    const ua = this.byName['upperArm' + side], fa = this.byName['forearm' + side], hd = this.byName['hand' + side];
    const S = ua.getWorldPosition(new THREE.Vector3());
    const E0 = fa.getWorldPosition(new THREE.Vector3());
    const W0 = hd.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(E0), b = E0.distanceTo(W0);
    const T = t.target.clone();
    let d = S.distanceTo(T); const dmax = (a + b) * 0.995;
    const dir = T.clone().sub(S).normalize();
    if (d > dmax) { d = dmax; T.copy(S).addScaledVector(dir, d); }
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pole = t.pole.clone().sub(dir.clone().multiplyScalar(t.pole.dot(dir))).normalize();
    const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(pole, a * sinA);
    const w = t.weight == null ? 1 : t.weight;
    const aim = (bone, child, from, to) => {
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const want = to.clone().sub(from).normalize().applyQuaternion(pq);
      const rest = child.position.clone().normalize();
      const qq = new THREE.Quaternion().setFromUnitVectors(rest, want);
      bone.quaternion.slerp(qq, w);
      bone.updateMatrixWorld(true);
    };
    aim(ua, fa, S, E);
    const Ew = fa.getWorldPosition(new THREE.Vector3());
    aim(fa, hd, Ew, T);
    if (t.handQ) { // hand world orientation
      const pq = hd.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      hd.quaternion.slerp(pq.multiply(t.handQ), w); hd.updateMatrixWorld(true);
    }
  }
}

// ------------------------------------------------------------------ Glove
// Rig with hand + 5 finger chains, grip in [0,1]
export class Glove {
  constructor(data, mats) {
    this.fig = new Figure(data, mats, { shadows: true });
    this.group = this.fig.group;
    this.grip = 0.3; this.gripT = 0.3; this.spread = 0;
  }
  setGrip(g) { this.gripT = g; }
  update(dt) {
    this.grip = smooth(this.grip, this.gripT, 10, dt);
    const g = this.grip, p = {};
    const curl = [0.45, 0.85, 0.7];
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      const extra = f === 'pinky' ? 0.15 : f === 'ring' ? 0.08 : 0;
      for (let i = 0; i < 3; i++) p[f + (i + 1)] = [-(curl[i] + extra) * g * 1.25 - 0.08 * (i === 0 ? 1 : 0.5), 0, 0];
    }
    p.thumb1 = [-0.2 * g, 0.25 * g, 0.35 * g]; p.thumb2 = [-0.35 * g, 0, 0.2 * g]; p.thumb3 = [-0.4 * g, 0, 0];
    this.fig.pose(p, 12);
    this.fig.update(dt);
  }
}

// ------------------------------------------------------------------ materials
export function personMats(kind) {
  const girl = kind === 'girl';
  return {
    skin: organic('skin', { color: girl ? 0xeac8b4 : 0xd2ae98, roughness: 0.62, scale: 22, bump: 0.25, sheen: 0.25, sheenColor: 0xffc8b0, sheenRoughness: 0.5 }),
    shirt: organic(girl ? 'knit' : 'knit', { color: girl ? 0x9fb4c8 : 0x2c3a4c, roughness: 1, scale: girl ? 9 : 7, bump: 0.9, sheen: 0.8, sheenColor: girl ? 0xdde8f4 : 0x5a6a80, sheenRoughness: 0.45 }),
    pants: organic('denim', { color: girl ? 0xb0b8c8 : 0xd0d4dc, roughness: 1, scale: 6, bump: 1.0, sheen: 0.4, sheenColor: 0x8090b0 }),
    shoes: organic('canvas', { color: girl ? 0xc85a4a : 0x6a4a34, roughness: 0.9, scale: 12, bump: 1.0 }),
    hair: organic('hair_t', { color: girl ? 0x3a2418 : 0x221a14, roughness: 0.5, scale: 14, bump: 0.5, sheen: 1.0, sheenColor: girl ? 0x8a5a3a : 0x5a4a3a, sheenRoughness: 0.35, clearcoat: 0.0 }),
    apron: organic('leather', { color: 0xffffff, roughness: 0.85, scale: 5, bump: 1.3 }),
  };
}
export function gloveMats() {
  return {
    glove: organic('suede', { color: 0xd6c6ae, roughness: 1, scale: 7, bump: 0.35, sheen: 0.5, sheenColor: 0xd8c0a0, sheenRoughness: 0.7 }),
    sleeve: organic('knit', { color: 0x9fb4c8, roughness: 1, scale: 14, bump: 1.0, sheen: 0.8, sheenColor: 0xdde8f4, sheenRoughness: 0.45 }),
  };
}
