// 冬の午後の陶芸小屋（実寸・メートル）
import * as THREE from 'three';
import { pbr, tex, loadImageTexture } from './assets.js';

export const R = { W: 4.8, D: 4.4, H: 2.5, z0: -2.0, z1: 2.4, x0: -2.4, x1: 2.4 };
export const POS = {
  wheel: new THREE.Vector3(0.05, 0, -0.55),
  wheelHeadY: 0.47,
  tubs: new THREE.Vector3(1.05, 0, -1.45),
  kiln: new THREE.Vector3(1.85, 0, -0.05),
  table: new THREE.Vector3(-0.95, 0, 0.55),
  stove: new THREE.Vector3(-1.85, 0, -1.35),
  window: new THREE.Vector3(0.6, 1.45, -2.0),
  apron: new THREE.Vector3(-0.62, 1.32, -1.93),
  sign: new THREE.Vector3(-1.25, 1.42, -1.975),
  dryBoard: new THREE.Vector3(-1.2, 0.0, -0.75),
};

// 箱：UV を実寸に合わせる（tile = テクスチャ 1 枚の実寸 m）
export function boxGeo(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
  }
  g.setAttribute('uv1', uv.clone());
  return g;
}
export function mesh(g, m, x = 0, y = 0, z = 0, parent = null, cast = true, recv = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = recv;
  if (parent) parent.add(o);
  return o;
}
// 柔らかい接地影（AO）用のテクスチャ
let _blob = null;
export function blobTex() {
  if (_blob) return _blob;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _blob = new THREE.CanvasTexture(c);
  return _blob;
}
export function contactShadow(parent, x, z, sx, sz, op = 0.6, y = 0.002) {
  const m = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, opacity: op, depthWrite: false, color: 0x000000 });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), m);
  p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.renderOrder = 1;
  parent.add(p);
  return p;
}
// 回転体（器・桶・パイプ）
export function lathe(profile, segs = 48, m, parent, x = 0, y = 0, z = 0) {
  const g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), segs);
  const uv = g.attributes.uv;
  g.setAttribute('uv1', uv.clone());
  return mesh(g, m, x, y, z, parent);
}

// 窓の外の雪
function makeSnow(scene) {
  const N = 900;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3), s = new Float32Array(N), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    p[i * 3] = -2.5 + Math.random() * 6.5; p[i * 3 + 1] = Math.random() * 4.0; p[i * 3 + 2] = -2.3 - Math.random() * 3.2;
    s[i] = 0.4 + Math.pow(Math.random(), 3) * 2.2; ph[i] = Math.random() * 100;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 300 } },
    vertexShader: `attribute float aSize; attribute float aPh; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ vec3 p = position; float t = uTime * (0.25 + 0.12 * fract(aPh)) + aPh;
        p.y = mod(p.y - t * 0.6, 4.0) - 0.2; p.x += sin(t * 0.9 + aPh) * 0.12; p.z += cos(t * 0.7 + aPh * 1.3) * 0.08;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale * 0.006 / -mv.z; vA = smoothstep(-0.2, 0.3, p.y) * 0.9; }`,
    fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard;
      gl_FragColor = vec4(vec3(2.4, 2.45, 2.6), vA * smoothstep(0.25, 0.05, d)); }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return m;
}

// 窓から差す光の中のほこり
function makeDust(scene) {
  const N = 260;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3), s = new Float32Array(N), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    p[i * 3] = -0.6 + Math.random() * 2.0; p[i * 3 + 1] = 0.2 + Math.random() * 1.8; p[i * 3 + 2] = -1.9 + Math.random() * 2.2;
    s[i] = 0.3 + Math.pow(Math.random(), 4) * 1.6; ph[i] = Math.random() * 100;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uSunDir: { value: new THREE.Vector3() } },
    vertexShader: `attribute float aSize; attribute float aPh; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ vec3 p = position; float t = uTime * 0.05 + aPh;
        p += vec3(sin(t * 1.3), sin(t * 0.7 + 1.0) * 0.6, cos(t * 1.1)) * 0.15;
        // 窓から差す光の筋の中だけ見える
        vec3 w0 = vec3(0.6, 1.45, -2.0); vec3 sd = normalize(vec3(-0.42, -0.36, 0.83));
        vec3 rel = p - w0; float along = dot(rel, sd); vec3 perp = rel - sd * along;
        float inBeam = smoothstep(0.75, 0.35, length(perp.xy * vec2(1.0, 1.4))) * step(0.0, along);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale * 0.004 / -mv.z; vA = inBeam * (0.35 + 0.35 * sin(uTime * 0.8 + aPh)); }`,
    fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard;
      gl_FragColor = vec4(vec3(3.0, 2.6, 2.1), vA * smoothstep(0.25, 0.0, d)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return m;
}

// 炎（ストーブの中）
function makeFire(parent) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmp: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uAmp;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.1; a *= 0.5; } return s; }
      void main(){ vec2 uv = vUv; float t = uTime;
        float q = fb(vec2(uv.x * 4.0, uv.y * 3.0 - t * 2.2));
        float shape = (1.0 - uv.y) * 1.25 - abs(uv.x - 0.5) * 1.6 + q * 0.75 - 0.35;
        float f = smoothstep(0.0, 0.5, shape);
        vec3 c = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.75, 0.3), smoothstep(0.2, 0.9, shape));
        c = mix(c, vec3(1.0, 0.95, 0.8), smoothstep(0.75, 1.1, shape));
        gl_FragColor = vec4(c * 6.0 * uAmp * f, f); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.24), m);
    p.position.set((i - 1) * 0.07, 0.12, (i - 1) * 0.03);
    p.rotation.y = (i - 1) * 0.6;
    g.add(p);
  }
  parent.add(g);
  return m;
}

// 絵だけの看板（ルール）：土 → ろくろ → 桶 → 窯 → つやつや
function makeSign() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  // 黒板（すすけた緑灰色）
  const gr = g.createLinearGradient(0, 0, 1024, 512);
  gr.addColorStop(0, '#2e3a33'); gr.addColorStop(1, '#253029');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; g.fillRect(Math.random() * 1024, Math.random() * 512, 2 + Math.random() * 30, 1 + Math.random() * 2); }
  const chalk = (col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; };
  const jit = (v) => v + (Math.random() - 0.5) * 2.5;
  const line = (pts, close) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(jit(p[0]), jit(p[1])) : g.moveTo(jit(p[0]), jit(p[1]))); if (close) g.closePath(); g.stroke(); };
  const W = 'rgba(236,232,220,0.85)';
  // 1. 土のかたまり
  chalk('rgba(196,140,96,0.9)', 7);
  g.beginPath(); g.ellipse(110, 290, 62, 48, 0, Math.PI, 0); g.lineTo(172, 300); g.lineTo(48, 300); g.closePath(); g.stroke();
  chalk(W, 5); line([[30, 306], [190, 306]]);
  // 矢印
  const arrow = (x) => { chalk(W, 5); line([[x, 280], [x + 50, 280]]); line([[x + 36, 266], [x + 52, 280], [x + 36, 294]]); };
  arrow(205);
  // 2. ろくろの上で器
  chalk('rgba(196,140,96,0.9)', 7);
  line([[300, 300], [292, 240], [304, 205], [366, 205], [378, 240], [370, 300]], false);
  chalk(W, 5); line([[262, 306], [410, 306]]); line([[336, 312], [336, 360]]);
  g.beginPath(); g.ellipse(336, 205, 31, 7, 0, 0, Math.PI * 2); g.stroke();
  arrow(425);
  // 3. 桶（青・飴・白）
  const tub = (x, col) => { chalk(W, 5); line([[x - 34, 250], [x - 28, 320], [x + 28, 320], [x + 34, 250]]); chalk(col, 9); line([[x - 30, 262], [x + 30, 262]]); };
  tub(520, 'rgba(120,150,190,0.95)'); tub(600, 'rgba(190,140,80,0.95)'); tub(680, 'rgba(240,236,226,0.95)');
  arrow(722);
  // 4. 窯と火
  chalk(W, 5); line([[800, 330], [800, 210], [900, 210], [900, 330]], false); line([[792, 330], [908, 330]]);
  chalk('rgba(240,150,70,0.95)', 6);
  line([[835, 300], [845, 262], [852, 285], [862, 250], [872, 300]], false);
  // 5. つやつやの器（上段に小さく）
  chalk('rgba(110,150,200,0.95)', 8);
  line([[930, 300], [926, 250], [940, 225], [990, 225], [1004, 250], [1000, 300]]);
  chalk('rgba(255,255,255,0.95)', 4); line([[944, 240], [950, 262]]); line([[960, 232], [964, 238]]);
  // 花
  chalk('rgba(220,90,90,0.95)', 6); g.beginPath(); g.arc(965, 190, 10, 0, 6.3); g.stroke(); chalk('rgba(120,170,110,0.95)', 4); line([[965, 200], [965, 225]]);
  // 縁と粉
  g.strokeStyle = 'rgba(0,0,0,0)';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildRoom(scene) {
  const room = new THREE.Group();
  scene.add(room);
  const anim = {};

  // ---- 素材
  const mFloor = pbr('floor', { repeat: [1, 1], roughness: 1, ns: 1.2 });
  const mWall = pbr('wall', { roughness: 1, ns: 1.0 });
  const mPlaster = pbr('plaster', { roughness: 1 });
  const mBrick = pbr('brick', { roughness: 1, ns: 1.3 });
  const mBoard = pbr('board', { roughness: 1 });
  const mBeam = pbr('board', { color: 0x7a5a40, roughness: 1 });
  const mIron = pbr('iron', { roughness: 1, metal: true, ns: 1 });
  const mSteel = pbr('steel', { roughness: 1, metal: true });
  const mAlu = pbr('alu', { roughness: 1, metal: true, ns: 0.25 });
  const mPaint = pbr('steel', { color: 0x4c5a58, roughness: 1.5 }); // 塗装（金属感を消す）
  mPaint.metalness = 0.2;

  // ---- 床・壁・天井
  const floor = mesh(boxGeo(R.W, 0.1, R.D, 1.25), mFloor, 0, -0.05, (R.z0 + R.z1) / 2, room, false, true);
  // 奥の壁（窓の穴を空ける）
  const wz = R.z0 - 0.06, wt = 0.12;
  const wx0 = POS.window.x - 0.7, wx1 = POS.window.x + 0.7, wy0 = 0.95, wy1 = 1.98;
  mesh(boxGeo(wx0 - R.x0, R.H, wt, 1.1), mWall, (R.x0 + wx0) / 2, R.H / 2, wz, room);
  mesh(boxGeo(R.x1 - wx1, R.H, wt, 1.1), mWall, (wx1 + R.x1) / 2, R.H / 2, wz, room);
  mesh(boxGeo(wx1 - wx0, wy0, wt, 1.1), mWall, POS.window.x, wy0 / 2, wz, room);
  mesh(boxGeo(wx1 - wx0, R.H - wy1, wt, 1.1), mWall, POS.window.x, (wy1 + R.H) / 2, wz, room);
  // 左右・手前
  mesh(boxGeo(wt, R.H, R.D, 1.1), mWall, R.x0 - 0.06, R.H / 2, (R.z0 + R.z1) / 2, room);
  mesh(boxGeo(wt, R.H, R.D, 1.1), mWall, R.x1 + 0.06, R.H / 2, (R.z0 + R.z1) / 2, room);
  mesh(boxGeo(R.W, R.H, wt, 1.1), mWall, 0, R.H / 2, R.z1 + 0.06, room);
  mesh(boxGeo(R.W, 0.05, R.D, 1.0), mPlaster, 0, R.H + 0.025, (R.z0 + R.z1) / 2, room, false, true);
  for (let i = 0; i < 4; i++) mesh(boxGeo(R.W, 0.16, 0.12, 0.9), mBeam, 0, R.H - 0.08, R.z0 + 0.6 + i * 1.2, room);
  // 幅木
  const mBase = pbr('board', { color: 0x6e4f38, roughness: 1 });
  mesh(boxGeo(R.W, 0.1, 0.02, 0.6), mBase, 0, 0.05, R.z0 + 0.01, room);
  mesh(boxGeo(0.02, 0.1, R.D, 0.6), mBase, R.x1 - 0.01, 0.05, (R.z0 + R.z1) / 2, room);

  // ---- 窓
  const mFrame = pbr('board', { color: 0xd9c9b0, roughness: 0.9 });
  const fw = 0.06;
  mesh(boxGeo(1.4 + fw * 2, fw, 0.16, 0.5), mFrame, POS.window.x, wy0 - fw / 2 + 0.01, R.z0 - 0.02, room); // 下枠
  mesh(boxGeo(1.4 + fw * 2, 0.04, 0.26, 0.5), mFrame, POS.window.x, wy0 + 0.0, R.z0 + 0.06, room); // 窓台
  mesh(boxGeo(1.4 + fw * 2, fw, 0.16, 0.5), mFrame, POS.window.x, wy1 + fw / 2 - 0.01, R.z0 - 0.02, room);
  mesh(boxGeo(fw, wy1 - wy0, 0.16, 0.5), mFrame, wx0 - fw / 2 + 0.01, (wy0 + wy1) / 2, R.z0 - 0.02, room);
  mesh(boxGeo(fw, wy1 - wy0, 0.16, 0.5), mFrame, wx1 + fw / 2 - 0.01, (wy0 + wy1) / 2, R.z0 - 0.02, room);
  mesh(boxGeo(0.035, wy1 - wy0, 0.05, 0.5), mFrame, POS.window.x, (wy0 + wy1) / 2, R.z0 - 0.05, room);
  mesh(boxGeo(1.4, 0.035, 0.05, 0.5), mFrame, POS.window.x, (wy0 + wy1) / 2 + 0.05, R.z0 - 0.05, room);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.12, envMapIntensity: 1.2 });
  const gl = mesh(new THREE.PlaneGeometry(1.4, wy1 - wy0), glass, POS.window.x, (wy0 + wy1) / 2, R.z0 - 0.06, room, false, false);
  // 窓の外：雪の林（遠景・明るい）
  const view = loadImageTexture('./tex/snowview.jpg');
  const vm = new THREE.MeshBasicMaterial({ map: view, color: new THREE.Color(2.3, 2.3, 2.3) });
  const vp = mesh(new THREE.PlaneGeometry(14, 7), vm, POS.window.x - 0.4, 1.0, -7.5, room, false, false);
  // 外の雪面（窓の下に見える）
  const snowGround = mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.9, emissive: 0xc8d4e6, emissiveIntensity: 1.2 }), 0, 0.3, -5, room, false, false);
  snowGround.rotation.x = -Math.PI / 2;
  anim.snow = makeSnow(scene);
  anim.dust = makeDust(scene);
  // 窓台の小物：小さな湯のみ
  const cupM = new THREE.MeshPhysicalMaterial({ color: 0x5b6f78, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  lathe([[0, 0], [0.028, 0], [0.03, 0.005], [0.034, 0.06], [0.031, 0.062], [0.027, 0.008], [0, 0.01]], 32, cupM, room, POS.window.x + 0.45, wy0 + 0.02, R.z0 + 0.08);
  contactShadow(room, POS.window.x + 0.45, R.z0 + 0.08, 0.1, 0.1, 0.5, wy0 + 0.021);

  // ---- 薪ストーブ（鋳鉄）とれんがの炉台
  const st = new THREE.Group(); st.position.copy(POS.stove); st.rotation.y = 0.75; room.add(st);
  mesh(boxGeo(1.3, 1.7, 0.08, 0.9), mBrick, POS.stove.x - 0.2, 0.85, R.z0 + 0.04, room); // 奥のれんが壁
  mesh(boxGeo(0.08, 1.7, 1.2, 0.9), mBrick, R.x0 + 0.04, 0.85, R.z0 + 0.62, room);
  const hearth = mesh(boxGeo(1.25, 0.04, 1.1, 0.9), mBrick, POS.stove.x + 0.05, 0.02, POS.stove.z + 0.05, room);
  const body = mesh(boxGeo(0.5, 0.48, 0.42, 0.5), mIron, 0, 0.42, 0, st);
  mesh(boxGeo(0.54, 0.03, 0.46, 0.5), mIron, 0, 0.675, 0, st);
  for (const [lx, lz] of [[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.16], [0.2, 0.16]]) mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.18, 12), mIron, lx, 0.09, lz, st);
  // 扉（ガラス越しの火）
  const doorFrame = mesh(boxGeo(0.4, 0.3, 0.03, 0.5), mIron, 0, 0.42, 0.215, st);
  const fireGlass = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.05, transparent: true, opacity: 0.25, envMapIntensity: 1 });
  mesh(new THREE.PlaneGeometry(0.3, 0.2), fireGlass, 0, 0.43, 0.232, st, false, false);
  const fireBox = new THREE.Group(); fireBox.position.set(0, 0.3, 0.05); st.add(fireBox);
  const ember = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9, emissive: 0xff5a1a, emissiveIntensity: 2.5 });
  for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 10), ember, (i - 1) * 0.04, 0.05 + (i % 2) * 0.04, (i - 1) * 0.05, fireBox, false, false); l.rotation.z = Math.PI / 2; l.rotation.y = (i - 1) * 0.3; }
  anim.fire = makeFire(fireBox);
  anim.ember = ember;
  // 煙突
  const pipe = mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.9, 24, 1, true), mIron, 0, 0.69 + 0.95, -0.05, st);
  // 薪
  const mLog = pbr('board', { color: 0x8a6a50, roughness: 1, repeat: [1, 3] });
  for (let i = 0; i < 9; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.045 + Math.random() * 0.015, 0.05, 0.42, 9), mLog, POS.stove.x + 0.55 + (i % 3) * 0.1, 0.06 + Math.floor(i / 3) * 0.085, POS.stove.z - 0.45 + (Math.random() - 0.5) * 0.03, room);
    l.rotation.x = Math.PI / 2; l.rotation.z = (Math.random() - 0.5) * 0.1;
  }
  contactShadow(room, POS.stove.x + 0.65, POS.stove.z - 0.45, 0.45, 0.6, 0.6);
  contactShadow(room, POS.stove.x, POS.stove.z, 0.8, 0.8, 0.5, 0.042);

  // ---- ろくろ
  const wh = new THREE.Group(); wh.position.copy(POS.wheel); room.add(wh);
  // 本体（塗装した鉄の箱）
  mesh(boxGeo(0.42, 0.3, 0.46, 0.6), mPaint, 0, 0.17, 0.02, wh);
  for (const [lx, lz] of [[-0.18, -0.19], [0.18, -0.19], [-0.18, 0.23], [0.18, 0.23]]) mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 8), mIron, lx, 0.02, lz, wh);
  // 水受け（ドロで汚れた鉢）
  const panM = new THREE.MeshStandardMaterial({ color: 0x6e665d, roughness: 0.5, map: tex('grain', 'c', { repeat: [3, 3] }), normalMap: tex('grain', 'n', { repeat: [3, 3] }) });
  lathe([[0.04, 0.0], [0.24, 0.0], [0.26, 0.02], [0.28, 0.11], [0.285, 0.115], [0.27, 0.115], [0.255, 0.03], [0.24, 0.012], [0.04, 0.012]], 64, panM, wh, 0, 0.33, 0);
  // 鉢の中のどろ水
  const slurry = new THREE.MeshPhysicalMaterial({ color: 0x6a4b38, roughness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.1, normalMap: tex('grain', 'n', { repeat: [4, 4] }) });
  const sl = mesh(new THREE.RingGeometry(0.12, 0.245, 64), slurry, 0, 0.343, 0, wh, false, true); sl.rotation.x = -Math.PI / 2;
  // 回転する台（アルミ）
  const headG = new THREE.Group(); headG.position.set(0, POS.wheelHeadY - 0.025, 0); wh.add(headG);
  const headM = new THREE.MeshPhysicalMaterial({ color: 0x6d5e52, roughness: 0.4, metalness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.15, map: tex('grain', 'c', { repeat: [3, 3] }), normalMap: tex('grain', 'n', { repeat: [3, 3] }), normalScale: new THREE.Vector2(0.6, 0.6) });
  const headTop = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.022, 72), [mAlu, headM, mAlu], 0, 0.014, 0, headG);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 16), mSteel, 0, -0.06, 0, headG);
  // 回転台の上の板（バット）のどろ跡
  anim.wheelHead = headG;
  // 速さのレバー（右側）
  const lever = new THREE.Group(); lever.position.set(0.23, 0.27, 0.1); wh.add(lever);
  mesh(boxGeo(0.03, 0.06, 0.12, 0.3), mIron, 0, 0, 0, lever);
  const leverArm = new THREE.Group(); lever.add(leverArm);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 10), mSteel, 0, 0.07, 0, leverArm);
  const knob = mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0x1b1b1b, roughness: 0.3, clearcoat: 0.6 }), 0, 0.145, 0, leverArm);
  leverArm.rotation.z = -0.3;
  anim.lever = leverArm;
  contactShadow(room, POS.wheel.x, POS.wheel.z, 0.9, 0.9, 0.65);
  // 椅子（子どもの腰かけ）
  const stool = new THREE.Group(); stool.position.set(POS.wheel.x, 0, POS.wheel.z + 0.5); room.add(stool);
  mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 32), mBoard, 0, 0.3, 0, stool);
  for (let i = 0; i < 3; i++) { const a = i * 2.094; const l = mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.3, 8), mBeam, Math.cos(a) * 0.11, 0.15, Math.sin(a) * 0.11, stool); l.rotation.z = Math.cos(a) * 0.12; l.rotation.x = -Math.sin(a) * 0.12; }
  contactShadow(room, stool.position.x, stool.position.z, 0.45, 0.45, 0.45);

  // 道具（スポンジ・水の鉢・切り糸）を水受けのふちに
  const tools = new THREE.Group(); tools.position.copy(POS.wheel); room.add(tools);
  const bowlM = new THREE.MeshPhysicalMaterial({ color: 0x8a5d3e, roughness: 0.25, clearcoat: 0.6, map: tex('grain', 'c', { repeat: [2, 2] }), normalMap: tex('grain', 'n', { repeat: [2, 2] }) });
  const waterBowl = lathe([[0, 0], [0.06, 0], [0.075, 0.01], [0.09, 0.07], [0.087, 0.073], [0.07, 0.014], [0, 0.016]], 40, bowlM, tools, -0.34, 0.34, 0.12);
  const water = new THREE.MeshPhysicalMaterial({ color: 0x8b7564, roughness: 0.03, metalness: 0, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
  const wsurf = mesh(new THREE.CircleGeometry(0.083, 40), water, -0.34, 0.4, 0.12, tools, false, false); wsurf.rotation.x = -Math.PI / 2;
  // 小さな台（鉢を置く）
  mesh(boxGeo(0.24, 0.34, 0.24, 0.4), mBoard, -0.34, 0.17, 0.12, tools);
  contactShadow(room, POS.wheel.x - 0.34, POS.wheel.z + 0.12, 0.35, 0.35, 0.5);
  // スポンジ
  const spongeM = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.95, map: tex('grain', 'c', { repeat: [6, 6] }), normalMap: tex('grain', 'n', { repeat: [6, 6] }), normalScale: new THREE.Vector2(3, 3) });
  const sponge = mesh(new THREE.SphereGeometry(0.035, 24, 16), spongeM, -0.37, 0.423, 0.1, tools);
  sponge.scale.set(1.2, 0.55, 0.9);
  // 切り糸（木の取っ手 2 つと糸）
  const wire = new THREE.Group(); wire.position.set(0.2, 0.455, 0.2); tools.add(wire);
  const hM = pbr('board', { color: 0xa07850, roughness: 0.8, repeat: [0.2, 0.2] });
  mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10), hM, -0.1, 0, 0, wire).rotation.z = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10), hM, 0.1, 0, 0.03, wire).rotation.z = Math.PI / 2;
  const wl = mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.18, 4), mSteel, 0, 0, 0.015, wire, false, false); wl.rotation.z = Math.PI / 2; wl.rotation.y = -0.17;
  wire.rotation.y = 0.5;
  anim.wire = wire; anim.sponge = sponge; anim.waterBowl = waterBowl; anim.water = wsurf;

  // ---- 釉薬の桶（たが付きの木桶）
  const tubsG = new THREE.Group(); tubsG.position.copy(POS.tubs); room.add(tubsG);
  mesh(boxGeo(1.2, 0.16, 0.48, 0.6), mBoard, 0, 0.08, 0, tubsG);
  contactShadow(room, POS.tubs.x, POS.tubs.z, 1.5, 0.75, 0.6);
  const staveM = pbr('board', { color: 0xb08a62, roughness: 0.85, repeat: [3, 1] });
  const hoopM = pbr('iron', { roughness: 0.8, metal: true, repeat: [4, 0.2] });
  anim.tubs = [];
  // 生の釉薬は粉っぽくくすんだ色（焼くと変わる）
  const rawCols = [0x8e969e, 0xa48462, 0xdcd5c8];
  for (let i = 0; i < 3; i++) {
    const tx = (i - 1) * 0.38;
    const tg = new THREE.Group(); tg.position.set(tx, 0.16, 0); tubsG.add(tg);
    lathe([[0, 0.0], [0.15, 0.0], [0.16, 0.01], [0.175, 0.3], [0.165, 0.3], [0.152, 0.02], [0, 0.02]], 40, staveM, tg);
    for (const hy of [0.06, 0.24]) lathe([[0.158 + hy * 0.05, hy - 0.012], [0.161 + hy * 0.05, hy - 0.012], [0.162 + hy * 0.05, hy + 0.012], [0.159 + hy * 0.05, hy + 0.012]], 40, hoopM, tg);
    const gm = new THREE.MeshPhysicalMaterial({ color: rawCols[i], roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35, normalMap: tex('grain', 'n', { repeat: [3, 3] }), normalScale: new THREE.Vector2(0.4, 0.4) });
    const surf = mesh(new THREE.CircleGeometry(0.166, 48), gm, 0, 0.255, 0, tg, false, true); surf.rotation.x = -Math.PI / 2;
    // 内側の釉薬の跡
    lathe([[0.163, 0.255], [0.17, 0.29], [0.168, 0.292], [0.161, 0.257]], 40, new THREE.MeshStandardMaterial({ color: rawCols[i], roughness: 0.95 }), tg);
    anim.tubs.push({ group: tg, surf, mat: gm, raw: rawCols[i], x: POS.tubs.x + tx, z: POS.tubs.z, y: POS.tubs.y + 0.16 + 0.255, r: 0.16 });
  }

  // ---- 窯（電気窯：ステンレスの外装、中は白い耐火れんが）
  const kg = new THREE.Group(); kg.position.copy(POS.kiln); kg.rotation.y = -Math.PI / 2; room.add(kg);
  mesh(boxGeo(0.66, 0.06, 0.62, 0.5), mIron, 0, 0.24, 0, kg);
  for (const [lx, lz] of [[-0.28, -0.26], [0.28, -0.26], [-0.28, 0.26], [0.28, 0.26]]) mesh(boxGeo(0.04, 0.24, 0.04, 0.3), mIron, lx, 0.12, lz, kg);
  // 外箱（前が開いた箱を 5 枚の板で）
  const kw = 0.62, kh = 0.68, kd = 0.58, ky = 0.27;
  mesh(boxGeo(kw, kh, 0.03, 0.5), mSteel, 0, ky + kh / 2, -kd / 2, kg);
  mesh(boxGeo(0.03, kh, kd, 0.5), mSteel, -kw / 2, ky + kh / 2, 0, kg);
  mesh(boxGeo(0.03, kh, kd, 0.5), mSteel, kw / 2, ky + kh / 2, 0, kg);
  mesh(boxGeo(kw, 0.03, kd, 0.5), mSteel, 0, ky + kh, 0, kg);
  mesh(boxGeo(kw, 0.03, kd, 0.5), mSteel, 0, ky + 0.015, 0, kg);
  // 内側の耐火れんが
  const ifb = pbr('brick', { color: 0xf0e2cc, roughness: 1, repeat: [1.6, 1.6] });
  ifb.emissive = new THREE.Color(0xff5010); ifb.emissiveIntensity = 0;
  mesh(boxGeo(kw - 0.1, kh - 0.1, 0.04, 0.4), ifb, 0, ky + kh / 2, -kd / 2 + 0.05, kg);
  mesh(boxGeo(0.04, kh - 0.1, kd - 0.06, 0.4), ifb, -kw / 2 + 0.05, ky + kh / 2, 0.0, kg);
  mesh(boxGeo(0.04, kh - 0.1, kd - 0.06, 0.4), ifb, kw / 2 - 0.05, ky + kh / 2, 0.0, kg);
  mesh(boxGeo(kw - 0.1, 0.04, kd - 0.06, 0.4), ifb, 0, ky + 0.05, 0.0, kg);
  mesh(boxGeo(kw - 0.1, 0.04, kd - 0.06, 0.4), ifb, 0, ky + kh - 0.05, 0.0, kg);
  // 棚板
  const shelfM = pbr('plaster', { color: 0xd8cfc0, roughness: 1 });
  mesh(boxGeo(kw - 0.14, 0.018, kd - 0.12, 0.4), shelfM, 0, ky + 0.16, 0.0, kg);
  // 扉（左に蝶番）
  const doorPivot = new THREE.Group(); doorPivot.position.set(-kw / 2, ky + kh / 2, kd / 2); kg.add(doorPivot);
  const door = new THREE.Group(); door.position.set(kw / 2, 0, 0.0); doorPivot.add(door);
  mesh(boxGeo(kw, kh, 0.05, 0.5), mSteel, 0, 0, 0.025, door);
  mesh(boxGeo(kw - 0.1, kh - 0.1, 0.05, 0.4), ifb, 0, 0, -0.02, door);
  const handle = mesh(boxGeo(0.03, 0.18, 0.04, 0.2), new THREE.MeshPhysicalMaterial({ color: 0x1d1d1d, roughness: 0.35, clearcoat: 0.5 }), kw / 2 - 0.06, 0, 0.07, door);
  // のぞき穴
  const peepM = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const peep = mesh(new THREE.CircleGeometry(0.012, 20), peepM, 0, 0.12, 0.052, door, false, false);
  // 操作盤（側面）
  const ctrl = new THREE.Group(); ctrl.position.set(kw / 2 + 0.06, ky + kh - 0.16, 0.1); kg.add(ctrl);
  mesh(boxGeo(0.09, 0.22, 0.2, 0.3), mPaint, 0, 0, 0, ctrl);
  const dial = new THREE.Group(); dial.position.set(0.0, 0.02, 0.104); ctrl.add(dial);
  const dialM = new THREE.MeshPhysicalMaterial({ color: 0x202020, roughness: 0.4, clearcoat: 0.4 });
  const dk = mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.025, 28), dialM, 0, 0, 0.012, dial); dk.rotation.x = Math.PI / 2;
  const tick = mesh(boxGeo(0.004, 0.022, 0.004, 0.1), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 }), 0, 0.012, 0.026, dial);
  ctrl.rotation.y = Math.PI / 2; ctrl.position.x = kw / 2 + 0.11; ctrl.position.z = 0.12;
  const lamp = mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2200, emissiveIntensity: 0 }), 0, -0.06, 0.1, ctrl, false, false);
  contactShadow(room, POS.kiln.x, POS.kiln.z, 0.9, 0.9, 0.65);
  anim.kiln = { group: kg, doorPivot, dial, lamp, ifb, peepM, handle, shelfY: ky + 0.17, inner: new THREE.Vector3() };

  // ---- 壁の棚と器
  const shelf = new THREE.Group(); shelf.position.set(R.x1 - 0.17, 0, -1.15); room.add(shelf);
  for (const sy of [0.95, 1.35, 1.75]) {
    mesh(boxGeo(0.3, 0.03, 1.3, 0.8), mBoard, 0, sy, 0, shelf);
    for (const bz of [-0.55, 0.55]) mesh(boxGeo(0.04, 0.16, 0.03, 0.3), mBeam, 0.12, sy - 0.09, bz, shelf);
  }
  anim.shelf = shelf;
  const bisque = new THREE.MeshStandardMaterial({ color: 0xd9c3ad, roughness: 0.95, map: tex('grain', 'c', { repeat: [2, 2] }), normalMap: tex('grain', 'n', { repeat: [2, 2] }) });
  const glazes = [
    new THREE.MeshPhysicalMaterial({ color: 0x2d5a83, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, normalMap: tex('grain', 'n', { repeat: [2, 2] }), normalScale: new THREE.Vector2(0.2, 0.2) }),
    new THREE.MeshPhysicalMaterial({ color: 0x6b3412, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, normalMap: tex('grain', 'n', { repeat: [2, 2] }), normalScale: new THREE.Vector2(0.2, 0.2) }),
    new THREE.MeshPhysicalMaterial({ color: 0xe9e3d6, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: tex('grain', 'n', { repeat: [2, 2] }), normalScale: new THREE.Vector2(0.2, 0.2) }),
  ];
  const shapes = [
    [[0, 0], [0.04, 0], [0.045, 0.01], [0.06, 0.05], [0.065, 0.09], [0.058, 0.092], [0.052, 0.015], [0, 0.017]],
    [[0, 0], [0.035, 0], [0.04, 0.02], [0.05, 0.1], [0.035, 0.16], [0.03, 0.2], [0.035, 0.21], [0.028, 0.21], [0.024, 0.17], [0.04, 0.1], [0.03, 0.025], [0, 0.03]],
    [[0, 0], [0.05, 0], [0.06, 0.008], [0.1, 0.035], [0.096, 0.038], [0.055, 0.016], [0, 0.018]],
    [[0, 0], [0.04, 0], [0.045, 0.015], [0.05, 0.11], [0.046, 0.112], [0.042, 0.02], [0, 0.022]],
  ];
  const rows = [[0.95, 6], [1.35, 5], [1.75, 4]];
  let k = 0;
  for (const [sy, n] of rows) for (let i = 0; i < n; i++) {
    const shp = shapes[(k * 7 + i) % shapes.length];
    const m = sy > 1.6 ? bisque : (k % 3 === 2 ? bisque : glazes[(k + i) % 3]);
    const z = -0.55 + (i + 0.5) * (1.1 / n);
    lathe(shp, 32, m, shelf, -0.02, sy + 0.015, z);
    contactShadow(shelf, -0.02, z, 0.16, 0.16, 0.55, sy + 0.016);
    k++;
  }

  // ---- エプロン掛け（ペグ）と絵の看板
  const peg = new THREE.Group(); peg.position.set(POS.apron.x, POS.apron.y + 0.25, R.z0 + 0.02); room.add(peg);
  mesh(boxGeo(0.6, 0.06, 0.02, 0.5), mBeam, 0, 0, 0, peg);
  for (const px of [-0.2, 0.0, 0.2]) { const p = mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.07, 10), mBeam, px, 0, 0.04, peg); p.rotation.x = Math.PI / 2 - 0.25; }
  const sign = new THREE.Group(); sign.position.copy(POS.sign); room.add(sign);
  mesh(boxGeo(0.66, 0.36, 0.02, 0.5), mBeam, 0, 0, 0, sign);
  const signM = new THREE.MeshStandardMaterial({ map: makeSign(), roughness: 0.92 });
  mesh(new THREE.PlaneGeometry(0.6, 0.3), signM, 0, 0, 0.0115, sign, false, true);
  anim.sign = sign;

  // ---- 食卓（最後の場面）
  const tb = new THREE.Group(); tb.position.copy(POS.table); room.add(tb);
  const topM = pbr('board', { color: 0xc49a70, roughness: 0.75, repeat: [1.6, 1] });
  mesh(boxGeo(1.2, 0.04, 0.75, 0.75), topM, 0, 0.72, 0, tb);
  for (const [lx, lz] of [[-0.54, -0.32], [0.54, -0.32], [-0.54, 0.32], [0.54, 0.32]]) mesh(boxGeo(0.05, 0.7, 0.05, 0.5), mBeam, lx, 0.35, lz, tb);
  mesh(boxGeo(1.1, 0.08, 0.02, 0.5), mBeam, 0, 0.66, -0.34, tb);
  mesh(boxGeo(1.1, 0.08, 0.02, 0.5), mBeam, 0, 0.66, 0.34, tb);
  // 麻のテーブルランナー
  const runner = mesh(new THREE.PlaneGeometry(0.34, 0.75), pbr('linen', { color: 0xd8cbb4, repeat: [6, 13] }), 0.0, 0.7405, 0, tb, false, true);
  runner.rotation.x = -Math.PI / 2;
  contactShadow(room, POS.table.x, POS.table.z, 1.5, 1.1, 0.5);
  anim.table = tb;

  // ---- 敷物（ろくろの下）
  const rug = mesh(new THREE.PlaneGeometry(1.4, 1.0), pbr('linen', { color: 0x8e8370, repeat: [14, 10], ns: 2 }), POS.wheel.x, 0.003, POS.wheel.z + 0.25, room, false, true);
  rug.rotation.x = -Math.PI / 2;

  // ---- 照明器具（ほうろうのペンダント）
  const shadeM = new THREE.MeshPhysicalMaterial({ color: 0x2f3e3a, roughness: 0.3, clearcoat: 0.7, side: THREE.DoubleSide });
  const bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.6, 3.0) });
  const pend = (x, y, z) => {
    const g = new THREE.Group(); g.position.set(x, y, z); room.add(g);
    lathe([[0.02, 0.09], [0.04, 0.085], [0.11, 0.02], [0.14, -0.01], [0.138, -0.012]], 40, shadeM, g);
    mesh(new THREE.SphereGeometry(0.03, 16, 12), bulbM, 0, 0.03, 0, g, false, false);
    mesh(new THREE.CylinderGeometry(0.003, 0.003, R.H - y - 0.09, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }), 0, (R.H - y) / 2 + 0.045, 0, g, false, false);
    return g;
  };
  pend(POS.wheel.x, 1.55, POS.wheel.z);
  pend(POS.table.x, 1.6, POS.table.z);

  return { room, anim, materials: { mBoard, mBeam, mIron, mSteel, bisque, glazes } };
}

// ---- 光：冬の午後（低い太陽・雪からの青い空の光・ストーブの火・作業灯）
export function buildLights(scene) {
  const L = {};
  // 低い西日（約 4500K）：窓から斜めに差し込む
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.82, 0.64), 4.2);
  const sd = new THREE.Vector3(-0.42, -0.36, 0.83).normalize();
  sun.position.set(0.6, 1.45, -2.0).addScaledVector(sd, -6);
  sun.target.position.set(0.6, 1.45, -2.0).addScaledVector(sd, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -2.4; sun.shadow.camera.right = 2.4; sun.shadow.camera.top = 2.4; sun.shadow.camera.bottom = -2.4;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 14;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 6; sun.shadow.blurSamples = 12;
  scene.add(sun, sun.target);
  L.sun = sun;
  // 窓からの空の光（雪の照り返しで青白い）
  const sky = new THREE.SpotLight(new THREE.Color(0.78, 0.86, 1.0), 9, 7, 1.1, 1, 2);
  sky.position.set(0.6, 1.6, -1.9); sky.target.position.set(0.3, 0.5, 0.2);
  scene.add(sky, sky.target);
  L.sky = sky;
  // 作業灯（3000K）ろくろの真上
  const work = new THREE.SpotLight(new THREE.Color(1.0, 0.8, 0.6), 3.2, 4, 0.9, 0.85, 2);
  work.position.set(POS.wheel.x, 1.52, POS.wheel.z); work.target.position.set(POS.wheel.x, 0.4, POS.wheel.z + 0.05);
  work.castShadow = true; work.shadow.mapSize.set(1024, 1024); work.shadow.bias = -0.0006; work.shadow.normalBias = 0.01; work.shadow.radius = 5; work.shadow.blurSamples = 10;
  work.shadow.camera.near = 0.3; work.shadow.camera.far = 3;
  scene.add(work, work.target);
  L.work = work;
  // 食卓の灯り
  const tableL = new THREE.SpotLight(new THREE.Color(1.0, 0.8, 0.58), 6, 4, 1.0, 0.9, 2);
  tableL.position.set(POS.table.x, 1.57, POS.table.z); tableL.target.position.set(POS.table.x, 0.7, POS.table.z);
  tableL.castShadow = true; tableL.shadow.mapSize.set(1024, 1024); tableL.shadow.bias = -0.0006; tableL.shadow.radius = 5; tableL.shadow.blurSamples = 10;
  scene.add(tableL, tableL.target);
  L.table = tableL;
  // ストーブの火（ゆらぐ）
  const fire = new THREE.PointLight(new THREE.Color(1.0, 0.48, 0.18), 3.5, 5, 2);
  fire.position.set(POS.stove.x + 0.25, 0.45, POS.stove.z + 0.25);
  scene.add(fire);
  L.fire = fire;
  // 部屋全体の間接光（天井の反射）：遊ぶ場所を暗くしない
  const bounce = new THREE.HemisphereLight(new THREE.Color(1.0, 0.92, 0.82), new THREE.Color(0.42, 0.3, 0.22), 0.55);
  scene.add(bounce);
  L.bounce = bounce;
  // 窯の熱の光（焼成時だけ）
  const kilnL = new THREE.PointLight(new THREE.Color(1.0, 0.45, 0.12), 0, 2.5, 2);
  kilnL.position.set(POS.kiln.x - 0.4, 0.6, POS.kiln.z);
  scene.add(kilnL);
  L.kiln = kilnL;
  return L;
}

// 環境マップ（HDR 風）：明るい窓・暖かい壁・ストーブの火・電球を持つ簡単な部屋を PMREM に通す
export function buildEnv(renderer) {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 4.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.34, 0.25, 0.17), side: THREE.BackSide }));
  box.position.y = 1.3 - 1.0; s.add(box);
  const flo = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.15, 0.1) }));
  flo.rotation.x = -Math.PI / 2; flo.position.y = -0.99; s.add(flo);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.5, 0.44) }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 1.59; s.add(ceil);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 5.8, 6.4) }));
  win.position.set(0.6, 0.45, -2.15); s.add(win);
  const sunPatch = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.2) }));
  sunPatch.rotation.x = -Math.PI / 2; sunPatch.position.set(-0.2, -0.98, -0.6); s.add(sunPatch);
  const stove = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.5) }));
  stove.position.set(-2.4, -0.55, -1.2); stove.rotation.y = Math.PI / 2; s.add(stove);
  for (const [x, z] of [[0.05, -0.55], [-0.95, 0.55]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 10, 6) }));
    b.position.set(x, 0.55, z); s.add(b);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02, 0.1, 20);
  pm.dispose();
  return rt.texture;
}
