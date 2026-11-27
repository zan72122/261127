// じぶんで描いた形（丸・四角・長い線）→ ボール・段ボール箱・はしご
import * as THREE from '../lib/three.module.min.js';
import { tex } from './tex.js';
import { Coverage } from './paint.js';
import { makeMaskUniforms, maskMaterial, maskDepth } from './mask.js';
import { smooth, clamp, merge } from './util.js';

export function recognize(pts) {
  if (pts.length < 6) return null;
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (L < 0.35) return null;
  const s = pts[0], e = pts[pts.length - 1];
  const gap = Math.hypot(e[0] - s[0], e[1] - s[1]);
  let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
  const closed = gap < Math.max(0.14, L * 0.22);
  if (closed) {
    const rs = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz));
    const mr = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mr) ** 2, 0) / rs.length);
    // 角の数：向きが大きく変わる点
    let corners = 0; const step = Math.max(2, Math.floor(pts.length / 24));
    for (let i = step; i < pts.length - step; i += step) {
      const a = Math.atan2(pts[i][1] - pts[i - step][1], pts[i][0] - pts[i - step][0]);
      const b = Math.atan2(pts[i + step][1] - pts[i][1], pts[i + step][0] - pts[i][0]);
      let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; if (d > 0.9) corners++;
    }
    if (sd / mr < 0.17 && corners < 3) return { kind: 'ball', cx, cz, r: clamp(mr, 0.1, 0.32) };
    return { kind: 'box', cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: clamp(maxX - minX, 0.22, 0.7), d: clamp(maxZ - minZ, 0.22, 0.6) };
  }
  const straight = gap / L;
  if (straight > 0.62 && gap > 0.45) {
    return { kind: 'ladder', x0: s[0], z0: s[1], x1: e[0], z1: e[1], len: clamp(gap, 0.6, 1.9) };
  }
  return null;
}

export class Thing {
  constructor(paint, info, color) {
    this.info = info; this.kind = info.kind; this.paint = paint;
    const ox = info.kind === 'ladder' ? (info.x0 + info.x1) / 2 : info.cx, oz = info.kind === 'ladder' ? (info.z0 + info.z1) / 2 : info.cz;
    this.o = [ox, oz];
    this.U = makeMaskUniforms(paint, [ox, oz]);
    this.pivot = new THREE.Group(); this.pivot.position.set(ox, 0, oz); this.pivot.rotation.x = -Math.PI / 2;
    this.inner = new THREE.Group(); this.pivot.add(this.inner);
    this.rise = 0.02; this.done = false; this.th = 0.7; this.vy = 0; this.y = 0; this.color = color;
    this.t = 0; this.bounce = 0;
    let inside, bb;
    if (info.kind === 'ball') {
      const r = info.r; this.r = r;
      inside = (x, y) => x * x + y * y < r * r; bb = [-r, -r, r, r];
      const g = new THREE.SphereGeometry(r, 48, 32);
      const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.4, normalMap: tex('pebble_nrm.jpg', { late: true, rep: [3, 2] }), normalScale: new THREE.Vector2(0.5, 0.5), sheen: 0.2 });
      this.add(new THREE.Mesh(g, m), 'paint', color);
      // ゴムの継ぎ目（赤道の細い線）
      const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 1.001, r * 0.012, 6, 64), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }));
      this.add(seam, 'keep');
    } else if (info.kind === 'box') {
      const w = info.w, d = info.d, h = Math.min(w, d) * 0.85; this.h = h;
      inside = (x, y) => Math.abs(x) < w / 2 && Math.abs(y) < d / 2; bb = [-w / 2, -d / 2, w / 2, d / 2];
      const g = new THREE.BoxGeometry(w, d, h, 6, 6, 6); g.translate(0, 0, h / 2);
      // 段ボールの側面が少しふくらむ・角が丸い
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const bx = 1 + 0.025 * (1 - Math.pow(2 * y / d, 2)) * (1 - Math.pow(2 * z / h - 1, 2));
        const by = 1 + 0.025 * (1 - Math.pow(2 * x / w, 2)) * (1 - Math.pow(2 * z / h - 1, 2));
        p.setX(i, x * bx); p.setY(i, y * by);
      }
      g.computeVertexNormals();
      const cb = new THREE.MeshStandardMaterial({ map: tex('cardboard_col.jpg', { srgb: true, late: true }), normalMap: tex('cardboard_nrm.jpg', { late: true }), roughness: 0.88, color: 0xffffff });
      this.add(new THREE.Mesh(g, cb), 'keep');
      // ふた（4 枚）とテープ
      this.flaps = [];
      for (const [ax, ay, fw, fd] of [[0, d / 2, w, d / 2], [0, -d / 2, w, d / 2], [w / 2, 0, w / 2, d], [-w / 2, 0, w / 2, d]]) {
        const fg = new THREE.BoxGeometry(ax ? fw : fw, ay ? fd : fd, 0.004);
        const hinge = new THREE.Group(); hinge.position.set(ax, ay, h);
        fg.translate(ax ? -Math.sign(ax) * fw / 2 : 0, ay ? -Math.sign(ay) * fd / 2 : 0, 0.002);
        const fm = new THREE.Mesh(fg, cb); hinge.add(fm); this.add(fm, 'keep'); hinge.add(fm);
        this.inner.add(hinge); hinge.userData.ax = ax; hinge.userData.ay = ay;
        this.flaps.push(hinge);
      }
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.05, d * 1.02, 0.002), new THREE.MeshPhysicalMaterial({ color: 0xc9a46a, roughness: 0.25, transparent: true, opacity: 0.8, clearcoat: 0.6 }));
      tape.position.z = h + 0.006; this.add(tape, 'keep'); this.tape = tape;
    } else {
      const L = info.len, wd = 0.38; this.L = L;
      const ang = Math.atan2(-(info.z1 - info.z0), info.x1 - info.x0); // 設計座標 (x, y=-Z)
      this.ang = ang;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      inside = (x, y) => { const u = x * ca + y * sa, v = -x * sa + y * ca; return Math.abs(u) < L / 2 + 0.03 && Math.abs(v) < wd / 2 + 0.04; };
      const ex = Math.abs(ca) * L / 2 + Math.abs(sa) * wd / 2 + 0.05, ey = Math.abs(sa) * L / 2 + Math.abs(ca) * wd / 2 + 0.05;
      bb = [-ex, -ey, ex, ey];
      const parts = [];
      for (const sd of [-1, 1]) { const r = new THREE.BoxGeometry(L, 0.045, 0.028, 8, 1, 1); r.translate(0, sd * wd / 2, 0.022); parts.push(r); }
      const n = Math.max(2, Math.floor(L / 0.28));
      for (let i = 0; i < n; i++) { const c = new THREE.CylinderGeometry(0.014, 0.014, wd, 10); c.translate((i + 0.5) * (L / n) - L / 2, 0, 0.022); parts.push(c); }
      const g = merge(parts); g.rotateZ(ang);
      const uv = g.attributes.uv; const p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) * ca + p.getY(i) * sa) * 1.2, p.getZ(i) * 4 + p.getY(i));
      const wm = new THREE.MeshStandardMaterial({ map: tex('wood_col.jpg', { srgb: true, late: true }), normalMap: tex('wood_nrm.jpg', { late: true }), roughnessMap: tex('wood_orm.jpg', { late: true }), roughness: 0.9, color: 0xf0d2a8 });
      this.add(new THREE.Mesh(g, wm), 'tint', color);
    }
    this.cov = new Coverage((X, Z) => inside(X - ox, oz - Z), ox + bb[0], oz - bb[3], ox + bb[2], oz - bb[1], 0.025);
    this.inside = inside; this.bb = bb;
    this.update(0);
  }
  add(mesh, mode, color) {
    maskMaterial(mesh.material, this.U, mode, color ? color.clone() : null, 'thing' + this.kind + mode);
    mesh.customDepthMaterial = maskDepth(this.U);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.inner.add(mesh);
  }
  get frac() { return this.cov.frac; }
  outline(R) {
    const pts = []; const o = this.o;
    if (this.kind === 'ball') { for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push([o[0] + Math.cos(a) * this.r, o[1] + Math.sin(a) * this.r]); } }
    else if (this.kind === 'box') { const w = this.info.w / 2, d = this.info.d / 2; pts.push([o[0] - w, o[1] - d], [o[0] + w, o[1] - d], [o[0] + w, o[1] + d], [o[0] - w, o[1] + d], [o[0] - w, o[1] - d]); }
    else { const { x0, z0, x1, z1 } = this.info; const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz); const nx = -dz / l * 0.19, nz = dx / l * 0.19; const ux = dx / l * this.L / 2, uz = dz / l * this.L / 2; const cx = o[0], cz = o[1]; pts.push([cx - ux + nx, cz - uz + nz], [cx + ux + nx, cz + uz + nz], [cx + ux - nx, cz + uz - nz], [cx - ux - nx, cz - uz - nz], [cx - ux + nx, cz - uz + nz]); }
    this.paint.strokeLine(pts, 0.009, 0.003, R);
  }
  update(dt) {
    this.t += dt;
    const target = this.done ? 1 : 0.03 + 0.5 * smooth(this.frac / this.th);
    this.rise += (target - this.rise) * (1 - Math.exp(-dt * 3));
    if (this.kind === 'ball') {
      // 地面から少しずつ出てくる
      let z = -this.r + this.rise * 2 * this.r;
      if (this.done && this.rise > 0.97) {
        this.vy -= 9.8 * dt; this.y += this.vy * dt;
        if (this.y < 0) { this.y = 0; if (this.vy < -0.5) { this.vy = -this.vy * 0.62; this.bounce = 1; } else this.vy = 0; }
        z = this.r + this.y;
      }
      this.inner.position.z = z;
      this.bounce *= Math.exp(-dt * 8);
      const sq = 1 - this.bounce * 0.12; this.inner.scale.set(1 + this.bounce * 0.06, 1 + this.bounce * 0.06, sq);
    } else {
      const s = Math.max(0.03, this.rise);
      this.inner.scale.z = s;
      if (this.flaps) {
        for (const f of this.flaps) {
          const open = this.done ? (0.4 + 0.6 * (this.open || 0)) * 1.9 : 0;
          const tgt = (f.userData.ax ? -Math.sign(f.userData.ax) : 0) * open; const tgtx = (f.userData.ay ? Math.sign(f.userData.ay) : 0) * open;
          f.rotation.y += (-tgt - f.rotation.y) * (1 - Math.exp(-dt * 6)); f.rotation.x += (-tgtx - f.rotation.x) * (1 - Math.exp(-dt * 6));
        }
        if (this.tape) this.tape.visible = !this.done;
      }
    }
  }
  poke() {
    if (this.kind === 'ball') { this.vy = 3.2; this.y = Math.max(this.y, 0.001); return 'ball'; }
    if (this.kind === 'box') { this.open = this.open ? 0 : 1; return 'box'; }
    return 'ladder';
  }
}
