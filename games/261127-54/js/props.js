// 道具と舞台：まな板（果汁のしみ）・台・木箱・麻袋・大皿・包丁・ふきん・接地の暗がり
import * as THREE from '../lib/three.module.min.js';
import { tex } from './tex.js';

export function roundBox(w, h, d, r, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.round(w / r)) + seg * 2, seg * 2 + 2, Math.max(2, Math.round(d / r)) + seg * 2);
  const p = g.attributes.position; const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    n.subVectors(v, c);
    if (n.lengthSq() < 1e-12) n.fromBufferAttribute(nrm, i);
    n.normalize();
    v.copy(c).addScaledVector(n, r);
    p.setXYZ(i, v.x, v.y, v.z); nrm.setXYZ(i, n.x, n.y, n.z);
  }
  // 上面の UV を平面投影に（木目の向きをそろえる）
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.fromBufferAttribute(nrm, i);
    const L = Math.max(w, d);
    if (Math.abs(n.y) > 0.5) uv.setXY(i, v.x / w + 0.5, v.z / d + 0.5);
    else if (Math.abs(n.x) > 0.5) uv.setXY(i, v.z / L + 0.5, v.y / L + 0.5);
    else uv.setXY(i, v.x / L + 0.5, v.y / L + 0.5);
  }
  return g;
}

export function pbr(name, opts = {}) {
  const m = new (opts.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({ color: 0xffffff, roughness: 1, metalness: opts.metal ? 1 : 0 });
  const rep = opts.repeat;
  const fix = (t) => { if (rep) { t = t.clone(); t.repeat.set(rep[0], rep[1]); t.needsUpdate = true; } return t; };
  tex(name + '_c', true, t => { m.map = fix(t); m.needsUpdate = true; }, { color: opts.color || '#a08060', pri: opts.pri });
  tex(name + '_n', false, t => { m.normalMap = fix(t); m.needsUpdate = true; }, { pri: opts.pri });
  tex(name + '_m', false, t => { const f = fix(t); m.roughnessMap = f; m.aoMap = opts.ao ? f : null; if (opts.metal) m.metalnessMap = f; m.needsUpdate = true; }, { pri: opts.pri });
  if (opts.normalScale) m.normalScale.set(opts.normalScale, opts.normalScale);
  if (opts.rough != null) m.roughness = opts.rough;
  if (opts.tint) m.color.set(opts.tint);
  return m;
}

// ---------------------------------------------------------- まな板＋しみの描画面
export class Board {
  constructor(w = 0.46, d = 0.30, t = 0.024) {
    this.w = w; this.d = d; this.t = t;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * d / w);
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.ctx.clearRect(0, 0, cv.width, cv.height);
    this.stainTex = new THREE.CanvasTexture(cv); this.stainTex.colorSpace = THREE.NoColorSpace;
    const m = pbr('board', { physical: true, color: '#cfa77a', pri: 5 });
    m.clearcoat = 1; m.clearcoatRoughness = 0.08;
    m.userData.uStain = { value: this.stainTex };
    m.userData.uSize = { value: new THREE.Vector2(w, d) };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uStain = m.userData.uStain; sh.uniforms.uSize = m.userData.uSize;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP; varying float vTop;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position; vTop = step(0.5, normal.y);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP; varying float vTop; uniform sampler2D uStain; uniform vec2 uSize; float stA; vec3 stC;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 st = texture2D(uStain, vec2(vLP.x/uSize.x+0.5, 0.5 - vLP.z/uSize.y));
          stA = st.a * vTop; stC = st.a > 0.001 ? st.rgb : vec3(1.0);
          vec3 lin = pow(stC, vec3(2.2));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*lin*1.25, clamp(stA*1.4,0.0,1.0));
          diffuseColor.rgb *= 1.0 - stA*0.12;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, clamp(stA*1.6,0.0,1.0));')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= clamp(stA*1.8, 0.0, 1.0);');
    };
    m.customProgramCacheKey = () => 'board-stain';
    this.mat = m;
    const g = roundBox(w, t, d, 0.006, 3);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.receiveShadow = true; this.mesh.castShadow = true;
    this.mesh.position.y = -t / 2;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    this.dirty = false; this.wet = 0;
  }
  // ローカル xz → キャンバス座標
  toCv(x, z) { return [(x / this.w + 0.5) * this.cv.width, (z / this.d + 0.5) * this.cv.height]; }
  inside(x, z, m = 0) { return Math.abs(x) < this.w / 2 - m && Math.abs(z) < this.d / 2 - m; }
  stain(x, z, rad, col, alpha) {
    const [cx, cy] = this.toCv(x, z);
    const r = rad / this.w * this.cv.width;
    const g = this.ctx;
    const c = `${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)}`;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(${c},${alpha})`); gr.addColorStop(0.65, `rgba(${c},${alpha * 0.8})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = gr;
    // しみはまんまるでなく少しゆがむ
    g.save(); g.translate(cx, cy); g.rotate(Math.random() * 6.28); g.scale(1, 0.75 + Math.random() * 0.4);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.translate(-cx, -cy); g.restore();
    g.fill();
    this.dirty = true;
  }
  wipe(x, z, rad, strength = 0.35) {
    const [cx, cy] = this.toCv(x, z);
    const r = rad / this.w * this.cv.width;
    const g = this.ctx;
    g.globalCompositeOperation = 'destination-out';
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(0,0,0,${strength})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    this.dirty = true;
  }
  coverage() {
    const d = this.ctx.getImageData(0, 0, this.cv.width, this.cv.height).data;
    let s = 0; for (let i = 3; i < d.length; i += 16) s += d[i];
    return s / (d.length / 16) / 255;
  }
  update() { if (this.dirty) { this.stainTex.needsUpdate = true; this.dirty = false; } }
}

// ---------------------------------------------------------- 接地の暗がり（AO の影ぼかし）
let blobTex = null;
export function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
export function contactBlob(size, strength = 0.6) {
  const m = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: strength, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.rotation.x = -Math.PI / 2; mesh.scale.set(size, size, 1);
  mesh.renderOrder = 1;
  return mesh;
}

// ---------------------------------------------------------- 台（屋台のカウンター）
export function makeCounter() {
  const g = new THREE.Group();
  const m = pbr('counter', { color: '#8a6a48', pri: 4 });
  const top = new THREE.Mesh(roundBox(2.6, 0.045, 0.82, 0.008, 2), m);
  top.position.set(0, -0.0225 - 0.024, -0.08);
  top.receiveShadow = true; top.castShadow = true;
  g.add(top);
  // 前板
  const fm = pbr('counter', { color: '#7a5a3a', repeat: [1.5, 0.5] });
  const front = new THREE.Mesh(roundBox(2.6, 0.7, 0.03, 0.006, 2), fm);
  front.position.set(0, -0.40, 0.32); front.receiveShadow = true;
  g.add(front);
  return g;
}

// 木箱（板を組んだもの）
export function makeCrate(w = 0.52, d = 0.34, h = 0.16) {
  const g = new THREE.Group();
  const m = pbr('crate', { color: '#c8a878', pri: 3 });
  const slat = (sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(roundBox(sx, sy, sz, 0.002, 1), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); };
  const t = 0.012, sh = 0.045;
  for (let i = 0; i < 3; i++) {
    const y = 0.012 + i * (sh + 0.012) + sh / 2;
    slat(w, sh, t, 0, y, d / 2 - t / 2); slat(w, sh, t, 0, y, -d / 2 + t / 2);
    slat(t, sh, d - 2 * t, w / 2 - t / 2, y, 0); slat(t, sh, d - 2 * t, -w / 2 + t / 2, y, 0);
  }
  for (let i = 0; i < 5; i++) slat(w - 0.02, 0.01, d / 5 - 0.008, 0, 0.006, -d / 2 + d / 10 + i * d / 5);
  // 角の柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slat(0.022, h, 0.022, sx * (w / 2 - 0.025), h / 2, sz * (d / 2 - 0.025));
  // 中に麻布
  const cl = clothSheet(w - 0.03, d - 0.03, 0.03, pbr('burlap', { color: '#9a7a50', repeat: [2.4, 1.6] }), 41);
  cl.position.y = 0.012; g.add(cl);
  g.userData = { w, d, h };
  return g;
}

// しわのある布のシート（麻袋・ふきん）
export function clothSheet(w, d, amp, mat, seed = 1, seg = 40) {
  const geo = new THREE.PlaneGeometry(w, d, seg, Math.round(seg * d / w));
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  let s = seed;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const waves = []; for (let i = 0; i < 6; i++) waves.push([R() * 30 + 6, R() * 30 + 6, R() * 6.28, R()]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let y = 0; for (const wv of waves) y += Math.sin(x * wv[0] * Math.cos(wv[3] * 3) + z * wv[1] * Math.sin(wv[3] * 3) + wv[2]) * amp / waves.length;
    const ex = 1 - Math.pow(Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (d / 2)), 6);
    p.setY(i, Math.max(0, y + amp * 0.5) * (0.3 + 0.7 * ex) + (1 - ex) * amp * 0.8);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

// 大皿（陶器）：旋盤で作る
export function makePlatter(R = 0.2) {
  const pts = [];
  const prof = [[0, 0.006], [R * 0.55, 0.006], [R * 0.6, 0.004], [R * 0.62, 0.0], [R * 0.66, 0.002], [R * 0.72, 0.008], [R * 0.86, 0.016], [R * 0.97, 0.024], [R, 0.027], [R * 1.005, 0.024], [R * 0.98, 0.02], [R * 0.85, 0.011], [R * 0.68, 0.004], [R * 0.6, -0.0]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 96);
  g.computeVertexNormals();
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / R * 0.5 + 0.5, p.getZ(i) / R * 0.5 + 0.5);
  const m = pbr('ceramic', { physical: true, color: '#efe9de', pri: 2 });
  m.clearcoat = 0.9; m.clearcoatRoughness = 0.05; m.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true;
  // 縁の釉薬だまりの色（藍の線）
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.985, 0.0018, 8, 128), new THREE.MeshPhysicalMaterial({ color: 0x3a5a7a, roughness: 0.2, clearcoat: 1 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.0262;
  const grp = new THREE.Group(); grp.add(mesh); grp.add(ring);
  grp.userData.R = R;
  return grp;
}

// 子ども用の果物ナイフ（先が丸い）
export function makeKnife() {
  const g = new THREE.Group();
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0); bladeShape.lineTo(0.105, 0.0); bladeShape.quadraticCurveTo(0.125, 0.0, 0.124, 0.012);
  bladeShape.quadraticCurveTo(0.12, 0.022, 0.10, 0.024); bladeShape.lineTo(0, 0.024); bladeShape.lineTo(0, 0);
  const bg = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.0012, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 12 });
  bg.translate(0, -0.024, -0.0006);
  const uv = bg.attributes.uv; const p = bg.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 6, p.getY(i) * 6);
  const bm = pbr('metal', { metal: true, color: '#c8c8c8', pri: 3 });
  bm.envMapIntensity = 1.2;
  const blade = new THREE.Mesh(bg, bm); blade.castShadow = true;
  g.add(blade);
  // 柄：木
  const hp = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; hp.push(new THREE.Vector2(0.0085 + 0.002 * Math.sin(t * Math.PI) - (t > 0.92 ? (t - 0.92) * 0.05 : 0), t * 0.1)); }
  const hg = new THREE.LatheGeometry(hp, 24); hg.scale(1, 1, 0.72);
  const hm = pbr('crate', { color: '#8a5a30', tint: '#9a6a44' }); hm.roughness = 0.7;
  const handle = new THREE.Mesh(hg, hm); handle.rotation.z = Math.PI / 2; handle.position.set(0, -0.012, 0); handle.castShadow = true;
  g.add(handle);
  // 口金
  const fer = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.006, 20), bm); fer.rotation.z = Math.PI / 2; fer.position.set(0.001, -0.012, 0); fer.scale.set(1, 1, 0.75);
  g.add(fer);
  // 刃先基準：柄は -x 方向、刃は +x（刃先 y=-0.024）
  return g;
}

export function makeTowel() {
  const m = pbr('towel', { color: '#efe9df', repeat: [1, 1] });
  const t = clothSheet(0.16, 0.12, 0.012, m, 77, 30);
  return t;
}
