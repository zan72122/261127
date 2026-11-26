// 地面の絵から起き上がる乗り物：子ども用の小さな車と、帆のある小舟
import * as THREE from '../lib/three.module.min.js';
import { tex } from './tex.js';
import { Coverage } from './paint.js';
import { makeMaskUniforms, maskMaterial, maskDepth } from './mask.js';
import { smooth, clamp, easeInOut, merge, rng, subdivide, smoothNormals } from './util.js';

export function pointInPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---- 部品：地面の絵の一部。塗った割合でせり上がる ----
class Part {
  constructor(owner, name, inside, bbox, cell, opts = {}) {
    this.owner = owner; this.name = name; this.inside = inside; // inside(x,y) 設計座標
    const o = owner.orig;
    // 地面座標で格子を作る（X = ox + x, Z = oz - y）
    this.cov = new Coverage((X, Z) => inside(X - o[0], o[1] - Z), o[0] + bbox[0], o[1] - bbox[3], o[0] + bbox[2], o[1] - bbox[1], cell);
    this.group = new THREE.Group();
    this.rise = 0; this.riseT = 0; this.done = false; this.th = opts.th ?? 0.72; this.sloppy = false;
    this.center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    this.color = null; // 最後に使ったチョーク色
    this.U = { ...owner.U, uMaskOn: { value: 1 } };
  }
  get frac() { return this.cov.frac; }
}

const BODY_W = 0.74;

class Drawable {
  constructor(paint, orig, W) {
    this.paint = paint; this.orig = orig; this.W = W;
    this.U = makeMaskUniforms(paint, orig);
    this.pivot = new THREE.Group(); this.pivot.position.set(orig[0], 0, orig[1]);
    this.root = new THREE.Group(); this.pivot.add(this.root);
    this.parts = [];
    this.state = 'flat'; // flat → lifting → up
    this.liftT = 0;
    this.pivot.rotation.x = -Math.PI / 2;
    this.root.position.z = W / 2;
  }
  addMesh(part, mesh, mode, fallback, off) {
    if (off) mesh.material.userData.off = off;
    maskMaterial(mesh.material, part.U, mode, fallback, this.key + part.name + (off ? 'o' : ''));
    mesh.customDepthMaterial = maskDepth(part.U, off);
    mesh.castShadow = true; mesh.receiveShadow = true;
    part.group.add(mesh);
    return mesh;
  }
  // 地面の点(X,Z)はどの部品か
  partAt(X, Z) { for (const p of this.parts) if (p.cov.contains(X, Z)) return p; return null; }
  toDraw(X, Z) { return [X - this.orig[0], this.orig[1] - Z]; }
  toWorld(x, y) { return [this.orig[0] + x, this.orig[1] - y]; }
  // 部品のせり上がり（地面に寝た状態）
  updateRise(dt) {
    // 寝ている間は全体で同じ高さの浅い浮き彫り（塗った分だけ高く）。起き上がる時に 1 へ
    let prog = 0; for (const p of this.parts) prog += p.done ? 1 : Math.min(1, p.frac / p.th);
    prog /= this.parts.length;
    const target = this.lifting ? 1 : 0.025 + 0.13 * smooth(prog);
    for (const p of this.parts) {
      p.rise += (target - p.rise) * (1 - Math.exp(-dt * (this.lifting ? 4 : 2.5)));
      const s = Math.max(0.02, p.rise);
      p.group.scale.z = s; p.group.position.z = (this.W / 2) * (s - 1);
    }
  }
  // 寝ている浮き彫りの上面の高さ（塗って本物になった所だけ）
  topAt(X, Z) {
    for (const p of this.parts) {
      const c = p.cov; const i = Math.floor((X - c.x0) / c.cell), j = Math.floor((Z - c.z0) / c.cell);
      if (i < 0 || j < 0 || i >= c.nx || j >= c.nz) continue;
      const k = j * c.nx + i; if (c.mask[k] && c.paint[k]) return this.W * Math.max(0.02, p.rise);
    }
    return 0;
  }
  allDone() { return this.parts.every((p) => p.done); }
  setLifted(v) { for (const p of this.parts) p.U.uMaskOn.value = v ? 0 : 1; }
}

// ===================== 車 =====================
export class Car extends Drawable {
  constructor(paint, orig) {
    super(paint, orig, BODY_W);
    this.key = 'car';
    const W = BODY_W;
    this.R = 0.155; this.wb = [-0.40, 0.42];
    // 側面の形（設計座標：x 前後, y 高さ）
    const s = new THREE.Shape();
    const arch = (cx, r, rev) => { const n = 14; for (let i = 0; i <= n; i++) { const a = Math.PI - (i / n) * Math.PI; s.lineTo(cx + Math.cos(a) * r, 0.13 + Math.sin(a) * r * 0.98); } };
    s.moveTo(-0.66, 0.15);
    s.quadraticCurveTo(-0.64, 0.13, -0.60, 0.13);
    arch(this.wb[0], 0.188);
    s.lineTo(0.232, 0.13);
    arch(this.wb[1], 0.188);
    s.lineTo(0.64, 0.13);
    s.quadraticCurveTo(0.69, 0.14, 0.695, 0.24);
    s.quadraticCurveTo(0.70, 0.36, 0.64, 0.40);
    s.quadraticCurveTo(0.42, 0.435, 0.22, 0.45);
    s.quadraticCurveTo(0.12, 0.60, 0.02, 0.705);
    s.quadraticCurveTo(-0.02, 0.735, -0.10, 0.738);
    s.lineTo(-0.34, 0.735);
    s.quadraticCurveTo(-0.40, 0.73, -0.44, 0.68);
    s.lineTo(-0.56, 0.47);
    s.quadraticCurveTo(-0.66, 0.455, -0.685, 0.42);
    s.quadraticCurveTo(-0.71, 0.30, -0.69, 0.20);
    s.quadraticCurveTo(-0.685, 0.16, -0.66, 0.15);
    const hole = new THREE.Path();
    hole.moveTo(0.165, 0.475); hole.quadraticCurveTo(0.09, 0.59, 0.0, 0.675); hole.quadraticCurveTo(-0.03, 0.695, -0.09, 0.696);
    hole.lineTo(-0.32, 0.694); hole.quadraticCurveTo(-0.37, 0.69, -0.40, 0.65); hole.lineTo(-0.49, 0.49); hole.quadraticCurveTo(-0.49, 0.475, -0.46, 0.475); hole.lineTo(0.165, 0.475);
    s.holes.push(hole);
    this.outer = s.getPoints(10).map((p) => [p.x, p.y]);
    this.win = hole.getPoints(10).map((p) => [p.x, p.y]);
    // --- 車体 ---
    const bt = 0.05;
    let geo = new THREE.ExtrudeGeometry(s, { depth: W - bt * 2, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.045, bevelSegments: 6, curveSegments: 16, steps: 4 });
    geo.translate(0, 0, -(W - bt * 2) / 2);
    geo = subdivide(geo, 0.045);
    // 平面形を丸め、上ほどすぼめる（タンブルホーム）
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ends = 0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x + 0.01) / 0.71, 5)));
      const tum = 1 - 0.20 * smooth((y - 0.44) / 0.3);
      const bulge = 1 + 0.03 * Math.sin(clamp((y - 0.13) / 0.33, 0, 1) * Math.PI);
      pos.setZ(i, z * ends * tum * bulge);
    }
    smoothNormals(geo);
    const detail = this.makeDetail();
    const paintM = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.045,
      clearcoatNormalMap: tex('paint_nrm.jpg', { late: true }), clearcoatNormalScale: new THREE.Vector2(0.25, 0.25),
      normalMap: detail.n, aoMap: detail.orm, roughnessMap: detail.orm, envMapIntensity: 1.25,
    });
    paintM.clearcoatNormalMap.repeat.set(3, 3);
    const body = this.part('body', (x, y) => pointInPoly(x, y, this.outer) && !pointInPoly(x, y, this.win), [-0.71, 0.12, 0.71, 0.75], 0.025, { th: 0.7 });
    this.bodyMesh = this.addMesh(body, new THREE.Mesh(geo, paintM), 'paint', new THREE.Color(0.75, 0.12, 0.1));
    // 室内：座席とハンドル（窓から見える）
    const seatM = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.9, normalMap: tex('cotton_nrm.jpg'), map: tex('cotton_col.jpg', { srgb: true }) });
    const rbox = (w, h, d, r) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.9, bevelSegments: 4, curveSegments: 6 }); g.translate(0, 0, -(d - 2 * r) / 2); return g; };
    const cush = rbox(0.24, 0.07, W * 0.72, 0.03); cush.translate(-0.2, 0.33, 0);
    const back = rbox(0.07, 0.28, W * 0.72, 0.03); back.rotateZ(0.18); back.translate(-0.33, 0.49, 0);
    const dash = rbox(0.12, 0.08, W * 0.8, 0.025); dash.translate(0.2, 0.44, 0);
    const seatG = merge([cush, back, dash]);
    const seat = new THREE.Mesh(seatG, seatM);
    this.addMesh(body, seat, 'keep');
    const wheelG = new THREE.TorusGeometry(0.075, 0.012, 8, 24); wheelG.rotateY(Math.PI / 2); wheelG.rotateZ(0.5); wheelG.translate(0.04, 0.52, 0.16);
    this.addMesh(body, new THREE.Mesh(wheelG, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 })), 'keep');
    // ライト（前・後）
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.12, normalMap: tex('metal_nrm.jpg', { late: true }), envMapIntensity: 1.4 });
    this.lampM = new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.05, metalness: 0, emissive: new THREE.Color(1, 0.95, 0.8), emissiveIntensity: 0 });
    for (const z of [-1, 1]) {
      const rim = new THREE.TorusGeometry(0.05, 0.01, 8, 24); rim.rotateY(Math.PI / 2); rim.translate(0.685, 0.31, z * 0.21);
      this.addMesh(body, new THREE.Mesh(rim, chrome), 'keep');
      const lens = new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); lens.scale(0.5, 1, 1); lens.rotateZ(-Math.PI / 2); lens.translate(0.68, 0.31, z * 0.21);
      this.addMesh(body, new THREE.Mesh(lens, this.lampM), 'keep');
      const tail = new THREE.BoxGeometry(0.02, 0.06, 0.09); tail.translate(-0.70, 0.35, z * 0.22);
      this.addMesh(body, new THREE.Mesh(tail, new THREE.MeshStandardMaterial({ color: 0x8a0d0d, roughness: 0.15, emissive: 0x220000 })), 'keep');
      // バンパー
    }
    const bump = new THREE.CapsuleGeometry(0.025, W * 0.78, 4, 12); bump.rotateX(Math.PI / 2);
    const bf = bump.clone(); bf.translate(0.70, 0.19, 0); const br = bump.clone(); br.translate(-0.71, 0.2, 0);
    this.addMesh(body, new THREE.Mesh(merge([bf, br]), chrome), 'keep');
    // ドアミラー
    const mir = new THREE.SphereGeometry(0.035, 12, 8); mir.scale(0.6, 0.7, 1);
    for (const z of [-1, 1]) { const m = mir.clone(); m.translate(0.16, 0.5, z * 0.33); this.addMesh(body, new THREE.Mesh(m, chrome), 'keep'); }
    // --- 窓ガラス ---
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0x9fb3bf, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.38, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false });
    const win = this.part('win', (x, y) => pointInPoly(x, y, this.win), [-0.5, 0.47, 0.17, 0.70], 0.02, { th: 0.62 });
    const wshape = new THREE.Shape(this.win.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const z of [-1, 1]) {
      const g = new THREE.ShapeGeometry(wshape, 8);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); const zz = (W / 2 - 0.035) * (1 - 0.20 * smooth((y - 0.44) / 0.3)) * 0.995; p.setZ(i, z * zz); }
      g.computeVertexNormals();
      const m = this.addMesh(win, new THREE.Mesh(g, glassM.clone()), 'keep');
      m.castShadow = false; m.renderOrder = 3;
    }
    // フロントガラス
    // --- タイヤ ---
    this.wheels = [];
    for (const [k, xw] of [['wheelR', this.wb[0]], ['wheelF', this.wb[1]]]) {
      const part = this.part(k, (x, y) => Math.hypot(x - xw, y - this.R) < this.R, [xw - this.R, 0, xw + this.R, 2 * this.R], 0.012, { th: 0.62 });
      part.isWheel = true; part.wx = xw;
      for (const z of [-1, 1]) {
        const wg = new THREE.Group();
        wg.position.set(xw, this.R, z * (W / 2 - 0.075));
        const off = new THREE.Vector2(xw, this.R);
        const tire = new THREE.Mesh(this.tireGeo(), new THREE.MeshStandardMaterial({ map: tex('tire_col.jpg', { srgb: true, late: true }), normalMap: tex('tire_nrm.jpg', { late: true }), aoMap: tex('tire_orm.jpg', { late: true }), roughnessMap: tex('tire_orm.jpg', { late: true }), roughness: 1, color: 0xffffff, normalScale: new THREE.Vector2(1.2, 1.2) }));
        const hub = new THREE.Mesh(this.hubGeo(), new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1, roughness: 0.22, normalMap: tex('metal_nrm.jpg', { late: true }), roughnessMap: tex('metal_orm.jpg', { late: true }), envMapIntensity: 1.3 }));
        if (z < 0) { hub.rotation.y = Math.PI; }
        this.addMesh(part, tire, 'keep', null, off); this.addMesh(part, hub, 'keep', null, off);
        part.group.add(wg); wg.add(tire, hub);
        this.wheels.push({ part, g: wg, tire, hub, x: xw, side: z, base: { t: tire.geometry.attributes.position.array.slice(), h: hub.geometry.attributes.position.array.slice() } });
      }
      part.prof = new Float32Array(64).fill(this.R);
    }
    for (const p of this.parts) this.root.add(p.group);
    this.spin = 0; this.speed = 0;
    this.drive = { on: false };
  }
  part(name, inside, bbox, cell, opts) { const p = new Part(this, name, inside, bbox, cell, opts); this.parts.push(p); return p; }
  tireGeo() {
    const R = this.R, r0 = 0.092, w = 0.105;
    const pts = [];
    const prof = [[r0, -w * 0.42], [r0 + 0.01, -w * 0.5], [R - 0.02, -w * 0.5], [R - 0.006, -w * 0.44], [R, -w * 0.3], [R, w * 0.3], [R - 0.006, w * 0.44], [R - 0.02, w * 0.5], [r0 + 0.01, w * 0.5], [r0, w * 0.42]];
    const c = new THREE.CatmullRomCurve3(prof.map(([a, b]) => new THREE.Vector3(a, b, 0)));
    c.getPoints(30).forEach((p) => pts.push(new THREE.Vector2(p.x, p.y)));
    const g = new THREE.LatheGeometry(pts, 48);
    g.rotateX(Math.PI / 2);
    // uv: u=周方向, v=幅方向
    return g;
  }
  hubGeo() {
    const prof = [[0.0, 0.03], [0.03, 0.032], [0.05, 0.025], [0.085, 0.02], [0.094, 0.03], [0.094, 0.0], [0.07, -0.03]];
    const g = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 40);
    g.rotateX(Math.PI / 2);
    const parts = [g];
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.BoxGeometry(0.06, 0.018, 0.012); sp.translate(0.055, 0, 0.038); sp.rotateZ((i / 5) * Math.PI * 2);
      parts.push(sp);
    }
    const cap = new THREE.SphereGeometry(0.022, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap.rotateX(Math.PI / 2); cap.translate(0, 0, 0.035); parts.push(cap);
    return merge(parts);
  }
  makeDetail() {
    // 車体のパネルの継ぎ目・ドアノブ・給油口（高さ→法線、AO）
    const Wc = 512, Hc = 288, sx = Wc / 1.44, sy = Hc / 0.81;
    const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, Wc, Hc);
    const P = (x, y) => [(x + 0.72) * sx, Hc - y * sy];
    g.strokeStyle = '#000'; g.lineWidth = 2.2; g.lineCap = 'round';
    const line = (pts) => { g.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
    line([[0.19, 0.15], [0.20, 0.30], [0.21, 0.44], [0.17, 0.47]]);
    line([[-0.24, 0.14], [-0.255, 0.3], [-0.26, 0.47]]);
    line([[0.205, 0.44], [0.6, 0.41]]);
    // ドアノブ（くぼみ）
    g.fillStyle = '#303030'; const [hx, hy] = P(0.12, 0.42); g.beginPath(); g.ellipse(hx, hy, 14, 4, 0, 0, 6.283); g.fill();
    g.fillStyle = '#b0b0b0'; g.beginPath(); g.ellipse(hx, hy - 1, 12, 2.4, 0, 0, 6.283); g.fill();
    // 給油口
    const [fx, fy] = P(-0.52, 0.40); g.strokeStyle = '#202020'; g.lineWidth = 1.6; g.beginPath(); g.arc(fx, fy, 9, 0, 6.283); g.stroke();
    // サイドのプレスライン（なだらかな出っ張り）
    const grd = g.createLinearGradient(0, P(0, 0.36)[1], 0, P(0, 0.30)[1]); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, P(0, 0.36)[1], Wc, P(0, 0.30)[1] - P(0, 0.36)[1]);
    const id = g.getImageData(0, 0, Wc, Hc).data;
    const h = new Float32Array(Wc * Hc); for (let i = 0; i < Wc * Hc; i++) h[i] = id[i * 4] / 255;
    const nc = document.createElement('canvas'); nc.width = Wc; nc.height = Hc; const ng = nc.getContext('2d'); const nd = ng.createImageData(Wc, Hc);
    const oc = document.createElement('canvas'); oc.width = Wc; oc.height = Hc; const og = oc.getContext('2d'); const od = og.createImageData(Wc, Hc);
    for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) {
      const i = y * Wc + x;
      const hl = h[y * Wc + Math.max(0, x - 1)], hr = h[y * Wc + Math.min(Wc - 1, x + 1)], hu = h[Math.max(0, y - 1) * Wc + x], hd = h[Math.min(Hc - 1, y + 1) * Wc + x];
      let nx = (hl - hr) * 2.2, ny = (hd - hu) * 2.2, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nd.data[i * 4] = (nx * 0.5 + 0.5) * 255; nd.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nd.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nd.data[i * 4 + 3] = 255;
      const ao = Math.min(1, 0.35 + h[i] * 1.3);
      const yy = 0.81 * (1 - y / Hc);
      const low = 0.75 + 0.25 * smooth((yy - 0.12) / 0.18);
      od.data[i * 4] = ao * low * 255; od.data[i * 4 + 1] = 255; od.data[i * 4 + 2] = 255; od.data[i * 4 + 3] = 255;
    }
    ng.putImageData(nd, 0, 0); og.putImageData(od, 0, 0);
    const n = new THREE.CanvasTexture(nc), orm = new THREE.CanvasTexture(oc);
    for (const t of [n, orm]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1 / 1.44, 1 / 0.81); t.offset.set(0.72 / 1.44, 0); t.colorSpace = THREE.NoColorSpace; }
    return { n, orm };
  }
  // 下絵（白いチョーク線）
  drawOutline(R) {
    const toW = (pts) => pts.map(([x, y]) => this.toWorld(x + (R() - 0.5) * 0.008, y + (R() - 0.5) * 0.008));
    this.paint.strokeLine(toW(this.outer.concat([this.outer[0]])), 0.011, 0.004, R);
    this.paint.strokeLine(toW(this.win.concat([this.win[0]])), 0.011, 0.004, R);
    for (const xw of this.wb) {
      const c = []; const a0 = R() * 6; for (let i = 0; i <= 30; i++) { const a = a0 + (i / 29) * Math.PI * 2.05; c.push([xw + Math.cos(a) * this.R * (1 + (R() - 0.5) * 0.04), this.R + Math.sin(a) * this.R]); }
      this.paint.strokeLine(toW(c), 0.011, 0.003, R);
    }
    // ライトの小丸
    const c = []; for (let i = 0; i <= 14; i++) { const a = (i / 14) * 6.3; c.push([0.6 + Math.cos(a) * 0.04, 0.32 + Math.sin(a) * 0.04]); }
    this.paint.strokeLine(toW(c), 0.008, 0.002, R);
  }
  // タイヤの形（角度ごとの半径）を塗りから求める
  computeProfile(part) {
    const cov = part.cov; const prof = new Float32Array(64).fill(0);
    const [cxW, czW] = this.toWorld(part.wx, this.R);
    for (let j = 0; j < cov.nz; j++) for (let i = 0; i < cov.nx; i++) {
      const k = j * cov.nx + i; if (!cov.mask[k] || !cov.paint[k]) continue;
      const X = cov.x0 + (i + 0.5) * cov.cell, Z = cov.z0 + (j + 0.5) * cov.cell;
      const dx = X - cxW, dy = czW - Z; // 設計座標の向き
      const r = Math.hypot(dx, dy) + cov.cell * 0.7; let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI * 2;
      const b = Math.floor((a / (Math.PI * 2)) * 64) % 64;
      // 隣のビンにも少し
      for (const d of [-1, 0, 1]) { const bb = (b + d + 64) % 64; prof[bb] = Math.max(prof[bb], d === 0 ? r : r * 0.985); }
    }
    for (let i = 0; i < 64; i++) prof[i] = clamp(prof[i], this.R * 0.55, this.R);
    // なめらかに
    const out = new Float32Array(64);
    for (let i = 0; i < 64; i++) out[i] = (prof[(i + 63) % 64] + prof[i] * 2 + prof[(i + 1) % 64]) / 4;
    return out;
  }
  applyProfile(part, prof) {
    part.prof = prof;
    for (const w of this.wheels) {
      if (w.part !== part) continue;
      const sample = (a) => { if (a < 0) a += Math.PI * 2; const f = (a / (Math.PI * 2)) * 64; const i0 = Math.floor(f) % 64, i1 = (i0 + 1) % 64, t = f - Math.floor(f); return (prof[i0] * (1 - t) + prof[i1] * t) / this.R; };
      const apply = (mesh, base, inner) => {
        const p = mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = base[i * 3], y = base[i * 3 + 1];
          const a = Math.atan2(y, x);
          let k = sample(a);
          if (inner) { let mn = 1; for (let q = 0; q < 64; q++) mn = Math.min(mn, prof[q] / this.R); k = mn; }
          p.setXY(i, x * k, y * k);
        }
        p.needsUpdate = true; mesh.geometry.computeVertexNormals();
      };
      apply(w.tire, w.base.t, false); apply(w.hub, w.base.h, true);
    }
  }
  profAt(prof, a) { a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); const f = (a / (Math.PI * 2)) * 64; const i0 = Math.floor(f) % 64; const t = f - Math.floor(f); return prof[i0] * (1 - t) + prof[(i0 + 1) % 64] * t; }
  roundness(part) { let mn = 1; for (let i = 0; i < 64; i++) mn = Math.min(mn, part.prof[i] / this.R); return mn; }
  // 走行中の車体の高さ・傾き
  rideHeights() {
    const pr = this.parts.find((p) => p.name === 'wheelR'), pf = this.parts.find((p) => p.name === 'wheelF');
    const a = -Math.PI / 2 - this.spin; // 地面に接する方向（車輪の座標）
    // 角ばったタイヤ：接地点の半径の最小値でなく、回転で持ち上がる
    const hR = this.contactH(pr.prof, a), hF = this.contactH(pf.prof, a);
    return [hR, hF];
  }
  contactH(prof, a) {
    // 回転した輪郭の最下点（中心から地面までの距離）
    let h = 0; for (let k = -6; k <= 6; k++) { const da = k * 0.09; const r = this.profAt(prof, a + da); h = Math.max(h, r * Math.cos(da)); }
    return h;
  }
}

// ===================== 小舟 =====================
export class Boat extends Drawable {
  constructor(paint, orig) {
    const B = 0.52;
    super(paint, orig, B);
    this.key = 'boat';
    this.B = B;
    const L0 = -0.56, L1 = 0.62;
    const S = (x) => (x - L0) / (L1 - L0);
    const deck = (x) => { const s = S(x); return 0.30 + 0.07 * s * s * s; };
    const keel = (x) => { const s = S(x); return 0.03 + 0.05 * Math.pow(1 - s, 3) + 0.30 * Math.pow(Math.max(0, s - 0.55) / 0.45, 2.2); };
    const beam = (x) => { const s = S(x); return (B / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, s - 0.35) / 0.65, 2.0)), 0.75) * (0.80 + 0.2 * Math.sin(Math.min(1, s / 0.35) * Math.PI / 2)); };
    this.deck = deck; this.keel = keel; this.beam = beam;
    // 側面の輪郭
    const sil = [];
    for (let i = 0; i <= 30; i++) { const x = L0 + (L1 - L0) * (i / 30); sil.push([x, deck(x)]); }
    for (let i = 30; i >= 0; i--) { const x = L0 + (L1 - L0) * (i / 30); sil.push([x, keel(x)]); }
    this.hullPoly = sil;
    this.mastX = 0.06;
    this.sails = [
      [[0.0, 0.42], [0.0, 1.1], [-0.46, 0.44]],
      [[0.11, 0.44], [0.11, 1.02], [0.47, 0.42]],
    ];
    // --- 船体（板張り、外は塗装、内はニス塗り） ---
    const nx = 40, nv = 12;
    const mkHull = (inner) => {
      const pos = [], uv = [], idx = [];
      for (const side of [1, -1]) {
        const base = pos.length / 3;
        for (let i = 0; i <= nx; i++) {
          const x = L0 + (L1 - L0) * (i / nx);
          const b = beam(x) - (inner ? 0.014 : 0), yk = keel(x) + (inner ? 0.014 : 0), yd = deck(x);
          for (let j = 0; j <= nv; j++) {
            const v = j / nv;
            const z = side * Math.max(0, b) * Math.pow(Math.sin(v * Math.PI / 2), 0.55);
            const y = yk + (yd - yk) * (1 - Math.cos(v * Math.PI / 2)) * 0.15 + (yd - yk) * v * 0.85;
            pos.push(x, Math.min(y, yd), z); uv.push(x * 1.4, v * 1.2 + (side > 0 ? 0 : 3));
          }
        }
        for (let i = 0; i < nx; i++) for (let j = 0; j < nv; j++) {
          const a = base + i * (nv + 1) + j, b2 = a + nv + 1;
          if ((side > 0) !== inner) idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); else idx.push(a, a + 1, b2, b2, a + 1, b2 + 1);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const plank = this.plankTex();
    const hullM = new THREE.MeshStandardMaterial({ map: tex('wood_col.jpg', { srgb: true, late: true }), normalMap: plank, roughness: 0.42, color: 0xffffff, envMapIntensity: 1.1 });
    const innerM = new THREE.MeshStandardMaterial({ map: tex('wood_col.jpg', { srgb: true, late: true }), normalMap: tex('wood_nrm.jpg', { late: true }), roughnessMap: tex('wood_orm.jpg', { late: true }), aoMap: tex('wood_orm.jpg', { late: true }), roughness: 0.7, color: 0xe8c9a0 });
    const hull = this.part('hull', (x, y) => pointInPoly(x, y, sil), [L0, 0, L1, 0.38], 0.022, { th: 0.7 });
    this.addMesh(hull, new THREE.Mesh(mkHull(false), hullM), 'tint', new THREE.Color(0.2, 0.35, 0.6));
    this.addMesh(hull, new THREE.Mesh(mkHull(true), innerM), 'keep');
    // ふなべり（縁材）・座板・船尾板
    const rimPts = []; for (let i = 0; i <= 30; i++) { const x = L0 + (L1 - L0) * (i / 30); rimPts.push(new THREE.Vector3(x, deck(x) + 0.006, beam(x) - 0.004)); }
    const rimM = new THREE.MeshStandardMaterial({ map: tex('wood_col.jpg', { srgb: true, late: true }), normalMap: tex('wood_nrm.jpg', { late: true }), roughness: 0.5, color: 0xd9b48a });
    for (const sd of [1, -1]) {
      const c = new THREE.CatmullRomCurve3(rimPts.map((p) => new THREE.Vector3(p.x, p.y, p.z * sd)));
      this.addMesh(hull, new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.012, 6), rimM), 'keep');
    }
    const thw = new THREE.BoxGeometry(0.12, 0.02, B * 0.86); thw.translate(-0.05, 0.25, 0);
    this.addMesh(hull, new THREE.Mesh(thw, rimM), 'keep');
    const tsh = new THREE.Shape(); const bs = beam(L0), yk0 = keel(L0), yd0 = deck(L0);
    tsh.moveTo(-bs, yd0); tsh.lineTo(bs, yd0); tsh.quadraticCurveTo(bs * 0.9, yk0 + 0.03, 0, yk0); tsh.quadraticCurveTo(-bs * 0.9, yk0 + 0.03, -bs, yd0);
    const tg = new THREE.ShapeGeometry(tsh, 8); tg.rotateY(Math.PI / 2); tg.translate(L0 + 0.002, 0, 0);
    // ShapeGeometry の xy→(z,y)：設計座標に直す
    const tp = tg.attributes.position; for (let i = 0; i < tp.count; i++) { /* already rotated */ }
    this.addMesh(hull, new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tex('wood_col.jpg', { srgb: true, late: true }), roughness: 0.45, side: THREE.DoubleSide, color: 0xffffff })), 'tint', new THREE.Color(0.2, 0.35, 0.6));
    // --- マストと帆 ---
    const sailPart = this.part('sail', (x, y) => this.sails.some((t) => pointInPoly(x, y, t)) || (Math.abs(x - this.mastX + 0.03) < 0.03 && y > 0.3 && y < 1.15), [-0.48, 0.38, 0.49, 1.13], 0.025, { th: 0.62 });
    const mastG = new THREE.CylinderGeometry(0.013, 0.018, 0.86, 10); mastG.translate(this.mastX - 0.03, 0.27 + 0.43, 0);
    const boomG = new THREE.CylinderGeometry(0.01, 0.01, 0.5, 8); boomG.rotateZ(Math.PI / 2); boomG.translate(-0.22, 0.43, 0);
    const mastM = new THREE.MeshStandardMaterial({ map: tex('wood_col.jpg', { srgb: true, late: true }), normalMap: tex('wood_nrm.jpg', { late: true }), roughness: 0.45, color: 0xe0c090 });
    this.addMesh(sailPart, new THREE.Mesh(merge([mastG, boomG]), mastM), 'keep');
    const clothM = new THREE.MeshStandardMaterial({ map: tex('cotton_col.jpg', { srgb: true, late: true }), normalMap: tex('cotton_nrm.jpg', { late: true }), roughness: 0.85, side: THREE.DoubleSide, color: 0xffffff, normalScale: new THREE.Vector2(0.8, 0.8) });
    clothM.map.repeat.set(6, 6); clothM.normalMap.repeat.set(6, 6);
    this.sailMeshes = [];
    for (const tri of this.sails) {
      const g = this.triGeo(tri, 14);
      const m = this.addMesh(sailPart, new THREE.Mesh(g, clothM), 'cloth', new THREE.Color(0.95, 0.93, 0.88));
      m.userData.base = g.attributes.position.array.slice(); m.userData.tri = tri;
      this.sailMeshes.push(m);
    }
    for (const p of this.parts) this.root.add(p.group);
    this.bob = 0;
  }
  part(name, inside, bbox, cell, opts) { const p = new Part(this, name, inside, bbox, cell, opts); this.parts.push(p); return p; }
  triGeo(tri, n) {
    const pos = [], uv = [], idx = [];
    const [A, Bp, C] = tri.map((p) => new THREE.Vector2(p[0], p[1]));
    const id = (i, j) => (i * (i + 1)) / 2 + j;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= i; j++) {
      const u = i / n, v = i ? j / i : 0;
      const p = A.clone().lerp(Bp, u).lerp(A.clone().lerp(C, u), v);
      // 三角の分割を A→B, A→C の間で
      const P = new THREE.Vector2().addScaledVector(A, 1 - u).addScaledVector(Bp, u * (1 - v)).addScaledVector(C, u * v);
      pos.push(P.x, P.y, 0); uv.push(P.x, P.y);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      idx.push(id(i, j), id(i + 1, j), id(i + 1, j + 1));
      if (j < i) idx.push(id(i, j), id(i + 1, j + 1), id(i, j + 1));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  plankTex() {
    // 板の重なり（よろい張り）の段差を法線で
    const W = 64, H = 256; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const d = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const v = (y % 51) / 51; const slope = v < 0.08 ? -0.7 : 0.08; // 段差
      const ny = slope * 0.5 + 0.5;
      for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; d.data[i] = 128 + (Math.random() - 0.5) * 6; d.data[i + 1] = ny * 255; d.data[i + 2] = 230; d.data[i + 3] = 255; }
    }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); t.colorSpace = THREE.NoColorSpace;
    return t;
  }
  drawOutline(R) {
    const toW = (pts) => pts.map(([x, y]) => this.toWorld(x + (R() - 0.5) * 0.006, y + (R() - 0.5) * 0.006));
    this.paint.strokeLine(toW(this.hullPoly.concat([this.hullPoly[0]])), 0.011, 0.004, R);
    for (const t of this.sails) this.paint.strokeLine(toW(t.concat([t[0]])), 0.011, 0.004, R);
    this.paint.strokeLine(toW([[this.mastX - 0.03, 0.30], [this.mastX - 0.03, 1.14]]), 0.012, 0.003, R);
    // 水の線（ちょっとした波）
    const wv = []; for (let i = 0; i <= 20; i++) wv.push([-0.7 + i * 0.07, -0.05 + Math.sin(i * 1.4) * 0.015]);
    this.paint.strokeLine(toW(wv), 0.009, 0.003, R);
  }
  animateSail(t, wind) {
    for (const m of this.sailMeshes) {
      const p = m.geometry.attributes.position, b = m.userData.base, tri = m.userData.tri;
      const mx = tri[0][0];
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], y = b[i * 3 + 1];
        const d = Math.abs(x - mx);
        const belly = Math.sin(clamp(d / 0.46, 0, 1) * Math.PI) * (0.06 + 0.04 * wind) * clamp((y - 0.42) / 0.3 + 0.4, 0, 1);
        p.setZ(i, belly * (1 + 0.15 * Math.sin(t * 3 + y * 6 + x * 4)));
      }
      p.needsUpdate = true; m.geometry.computeVertexNormals();
    }
  }
}
