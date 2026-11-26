// 果物のかけら：切る・倒れて断面を見せる・果汁が飛び、まな板にしみる
import * as THREE from '../lib/three.module.min.js';
import { slice, toArrays } from './slice.js';
import { FRUITS, fruitMaterials, buildWhole, buildAccessories } from './fruits.js';
import { contactBlob } from './props.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
let uid = 1;

export class Piece {
  constructor(world, key, data, acc, level = 0) {
    this.id = uid++;
    this.world = world; this.key = key; this.data = data; this.acc = acc; this.level = level;
    const mp = data.massProps();
    this.volume = mp.volume; this.cLocal = new THREE.Vector3(...mp.c);
    this.radius = data.radiusFrom(mp.c);
    const A = toArrays(data);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(A.P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(A.N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(A.U, 2));
    g.addGroup(0, A.skinCount, 0); g.addGroup(A.skinCount, A.fleshCount, 1);
    g.computeBoundingSphere();
    this.fleshTris = A.fleshCount / 3;
    const mats = fruitMaterials(key);
    this.mesh = new THREE.Mesh(g, [mats.skin, mats.flesh]);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.inner.position.copy(this.cLocal).negate();
    this.inner.add(this.mesh);
    for (const a of acc) this.inner.add(a.mesh);
    this.group.add(this.inner);
    this.blob = contactBlob(this.radius * 2.6, 0.55);
    world.scene.add(this.blob);
    this.state = 'rest';
    this.anim = null;
    this.vel = new THREE.Vector3();
    this.fresh = 0; this.cutFace = null; // 新しい断面の法線（果物座標）
    this.placed = null; // 大皿の上
    this.lift = 0;
    this.groundY = 0;
  }
  get pos() { return this.group.position; }
  dispose() {
    this.group.parent && this.group.parent.remove(this.group);
    this.blob.parent && this.blob.parent.remove(this.blob);
    this.mesh.geometry.dispose(); this.blob.material.dispose();
  }
  // 果物座標→世界の行列
  fruitToWorld(out) { this.group.updateMatrixWorld(true); return out.copy(this.inner.matrixWorld); }
  // 回転 q のときの最下点（重心からの高さ）
  lowest(q) {
    const p = this.data.pos; let mn = 1e9; const c = this.cLocal;
    const step = Math.max(3, Math.floor(p.length / 3 / 600) * 3);
    for (let i = 0; i < p.length; i += step) {
      _v.set(p[i] - c.x, p[i + 1] - c.y, p[i + 2] - c.z).applyQuaternion(q);
      if (_v.y < mn) mn = _v.y;
    }
    return mn;
  }
  footprint() { return this.radius * 0.8; }
  // 断面がどれだけ上（カメラ）を向いているか
  faceUp() {
    if (!this.cutFace) return -1;
    _v.copy(this.cutFace).applyQuaternion(this.group.quaternion);
    return _v.y;
  }
  settleTo(q, x, z, dur = 0.5, gy = this.groundY, hop = 0.0) {
    const y = gy - this.lowest(q);
    this.anim = { t: 0, dur, p0: this.group.position.clone(), q0: this.group.quaternion.clone(), p1: new THREE.Vector3(x, y, z), q1: q.clone(), hop };
    this.state = 'anim';
  }
  update(dt) {
    if (this.state === 'anim' && this.anim) {
      const a = this.anim; a.t += dt / a.dur;
      const t = Math.min(1, a.t);
      // 落ちて少し弾む
      const e = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
      this.group.quaternion.slerpQuaternions(a.q0, a.q1, e);
      this.group.position.lerpVectors(a.p0, a.p1, e);
      this.group.position.y += Math.sin(t * Math.PI) * a.hop + (t > 0.7 ? Math.sin((t - 0.7) / 0.3 * Math.PI) * 0.003 * (1 - t) * 3 : 0);
      if (a.t >= 1) { this.state = 'rest'; this.anim = null; this.onLand && this.onLand(this); }
    }
    // 接地の暗がり
    const gp = this.group.position;
    this.blob.position.set(gp.x, this.groundY + 0.0008, gp.z);
    const hgt = Math.max(0, gp.y - this.radius * 0.5 - this.groundY);
    const s = this.radius * 2.4 * (1 + hgt * 6);
    this.blob.scale.set(s, s, 1);
    this.blob.material.opacity = 0.5 * Math.max(0, 1 - hgt * 12) * Math.min(1, this.radius / 0.03 * 0.6 + 0.4);
  }
}

export function makeWhole(world, key, seed) {
  const data = buildWhole(key, seed);
  const acc = buildAccessories(key, seed);
  const p = new Piece(world, key, data, acc, 0);
  return p;
}

// 世界の平面（法線 n, 点 o）で切る → [前, 後] の Piece か null
export function cutPiece(world, piece, nW, oW) {
  piece.fruitToWorld(_m);
  const inv = _m.clone().invert();
  const o = oW.clone().applyMatrix4(inv);
  const n = nW.clone().transformDirection(inv);
  const d = n.dot(o);
  const r = slice(piece.data, [n.x, n.y, n.z], d);
  if (!r) return null;
  const out = [];
  for (const [side, data] of [[1, r.front], [-1, r.back]]) {
    const acc = piece.acc.filter(a => (a.anchor[0] * n.x + a.anchor[1] * n.y + a.anchor[2] * n.z - d) * side > 0);
    const np = new Piece(world, piece.key, data, acc, piece.level + 1);
    const cw = np.cLocal.clone().applyMatrix4(_m);
    np.group.position.copy(cw);
    np.group.quaternion.copy(piece.group.quaternion);
    np.cutFace = n.clone().multiplyScalar(-side); // 果物座標での断面の外向き法線
    np.groundY = piece.groundY;
    np.fresh = 1; np.cutArea = r.area;
    out.push(np);
  }
  return out;
}

// ---------------------------------------------------------- 果汁の粒
export class Juice {
  constructor(world, max = 420) {
    this.world = world; this.max = max;
    const g = new THREE.IcosahedronGeometry(1, 2);
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transmission: 0, ior: 1.33, sheen: 0 });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb*0.25;'); };
    this.mesh = new THREE.InstancedMesh(g, m, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    world.scene.add(this.mesh);
    this.p = [];
    this.seeps = [];
    this.beads = [];
  }
  spray(origin, dir, col, n, speed = 0.6, spread = 0.7, size = 1) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5) * spread, dir.y + Math.random() * spread * 0.8, dir.z + (Math.random() - 0.5) * spread).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.9));
      const r = (0.0006 + Math.pow(Math.random(), 2.5) * 0.0028) * size;
      this.p.push({ x: origin.x + (Math.random() - 0.5) * 0.01, y: origin.y, z: origin.z + (Math.random() - 0.5) * 0.01, v, r, col: new THREE.Color(col[0], col[1], col[2]).multiplyScalar(0.8 + Math.random() * 0.3), life: 0, flat: 0 });
    }
  }
  seep(x, z, col, maxR, dur) { this.seeps.push({ x, z, col, maxR, dur, t: 0, ang: Math.random() * 6.28 }); }
  update(dt) {
    const B = this.world.board;
    const bx = this.world.boardGroup.position;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3();
    let k = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const d = this.p[i];
      d.life += dt;
      if (d.flat > 0) {
        d.flat += dt;
        if (d.flat > 2.5) { this.p.splice(i, 1); continue; }
      } else {
        d.v.y -= 9.8 * dt;
        d.x += d.v.x * dt; d.y += d.v.y * dt; d.z += d.v.z * dt;
        const lx = d.x - bx.x, lz = d.z - bx.z;
        const onBoard = B.inside(lx, lz);
        const gy = onBoard ? 0 : -0.024;
        if (d.y - d.r < gy) {
          if (onBoard) {
            B.stain(lx, lz, d.r * (5 + Math.random() * 4), [d.col.r ** (1 / 2.2), d.col.g ** (1 / 2.2), d.col.b ** (1 / 2.2)], 0.45);
            d.flat = 0.001; d.y = gy + d.r * 0.25;
          } else if (d.y < -0.8) { this.p.splice(i, 1); continue; }
          else { d.flat = 0.001; d.y = gy + d.r * 0.25; }
        }
      }
    }
    for (const d of this.p) {
      if (k >= this.max) break;
      const fl = d.flat > 0 ? Math.max(0.25, 1 - d.flat * 0.3) : 1;
      s.set(d.r * (d.flat > 0 ? 1.6 : 1), d.r * (d.flat > 0 ? 0.35 * fl : 1 + Math.min(1, d.v.length() * 0.5)), d.r * (d.flat > 0 ? 1.6 : 1));
      if (d.flat > 0 && d.flat > 1.5) s.multiplyScalar(Math.max(0, 1 - (d.flat - 1.5)));
      if (d.flat > 0) q.identity(); else q.setFromUnitVectors(UP, _v.copy(d.v).normalize());
      pp.set(d.x, d.y, d.z);
      mtx.compose(pp, q, s);
      this.mesh.setMatrixAt(k, mtx); this.mesh.setColorAt(k, d.col); k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // 切り口からゆっくりにじむ
    for (let i = this.seeps.length - 1; i >= 0; i--) {
      const s0 = this.seeps[i];
      s0.t += dt;
      const t = Math.min(1, s0.t / s0.dur);
      if (Math.random() < 0.5) {
        const r = s0.maxR * Math.sqrt(t) * (0.6 + Math.random() * 0.4);
        const a = s0.ang + (Math.random() - 0.5) * 2.5;
        B.stain(s0.x + Math.cos(a) * r * 0.5, s0.z + Math.sin(a) * r * 0.5, r * 0.7 + 0.003, s0.col, 0.05);
      }
      if (s0.t > s0.dur) this.seeps.splice(i, 1);
    }
  }
}
