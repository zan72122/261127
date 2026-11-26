// 場面の流れと指の操作
import * as THREE from '../lib/three.module.min.js';
import { FRUITS, FRUIT_KEYS, CAT_COLORS } from './fruits.js';
import { makeWhole, cutPiece } from './pieces.js';
import { makeKnife, makeTowel, pbr, roundBox, clothSheet, makePlatter, contactBlob } from './props.js';
import { SKIN, lin, Body, getPersonMaterial } from './people.js';

const UP = new THREE.Vector3(0, 1, 0);
const BIG = 0.072; // 大皿にのせられる大きさ
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const clamp = THREE.MathUtils.clamp;
const rand = (a, b) => a + Math.random() * (b - a);

// 手の向き（世界）から、腕の向きを手の座標に直す
function basis(x, y) { const X = x.clone().normalize(); const Z = new THREE.Vector3().crossVectors(X, y).normalize(); const Y = new THREE.Vector3().crossVectors(Z, X); return [X, Y, Z]; }
function toLocal(B, w) { return [B[0].dot(w), B[1].dot(w), B[2].dot(w)]; }
function quatFrom(B) { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(B[0], B[1], B[2])); }

export class Game {
  constructor(world) {
    this.w = world;
    this.scene = null;
    this.pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, t0: 0, path: [], mode: null };
    this.idle = 0;
    this.ray = new THREE.Raycaster();
    this.flags = {};
    this.opened = new Set();
    this.events = [];
    this.setupInput();
  }
  // ---------------------------------------------------------------- 準備
  start() {
    const W = this.w;
    this.knife = makeKnife(); this.knife.visible = false; W.scene.add(this.knife);
    this.towel = makeTowel(); this.towel.visible = false; W.scene.add(this.towel);
    this.makeHint();
    this.makeArms();
    this.makeGirl();
    this.makeApron();
    this.makeSign();
    this.fillCrate();
    this.go('intro');
  }
  makeArms() {
    const P = this.w.people;
    const girlSkin = { s: 0.64, fr: 1.12, skin: SKIN.girl, tip: SKIN.girlTip, nail: lin('#efcfc2'), res: 0.0021 };
    const sleeve = { type: 'short', col: lin('#c98f7c'), col2: lin('#b97e6c'), at: 0.5 };
    // 包丁を持つ右手：甲は右上、刃は前
    const fwd = new THREE.Vector3(0, 0, -1), right = new THREE.Vector3(1, 0, 0);
    this.knifeB = (b) => { const Zh = b.clone().negate(); const Yh = new THREE.Vector3().addScaledVector(UP, 0.75).addScaledVector(new THREE.Vector3().crossVectors(b, UP).normalize(), 0.66).normalize(); const Xh = new THREE.Vector3().crossVectors(Yh, Zh).normalize(); return [Xh, new THREE.Vector3().crossVectors(Zh, Xh), Zh]; };
    const kb = this.knifeB(fwd);
    const armW = new THREE.Vector3(0.42, 0.22, 0.88).normalize();
    const upW = new THREE.Vector3(0.3, 0.3, 0.9).normalize();
    this.girlR = P.makeArm(Object.assign({}, girlSkin, { side: 'R', sleeve, arm: toLocal(kb, armW), upper: toLocal(kb, upW), fore: 0.26, upLen: 0.3 }), []);
    // つまむ右手：手のひらは下、指先は前下
    this.pinchB = basis(new THREE.Vector3(-0.15, -0.55, -0.82), new THREE.Vector3(0.05, 0.85, -0.5));
    const pinArm = new THREE.Vector3(0.28, 0.25, 0.93).normalize();
    this.girlRP = P.makeArm(Object.assign({}, girlSkin, { side: 'R', sleeve, arm: toLocal(this.pinchB, pinArm), upper: toLocal(this.pinchB, upW), fore: 0.26, upLen: 0.3 }), []);
    // ふきんを押さえる平らな手
    this.flatB = basis(new THREE.Vector3(-0.1, -0.25, -0.96), new THREE.Vector3(0, 1, -0.2));
    this.girlRF = P.makeArm(Object.assign({}, girlSkin, { side: 'R', sleeve, arm: toLocal(this.flatB, new THREE.Vector3(0.22, 0.22, 0.95).normalize()), upper: toLocal(this.flatB, upW), fore: 0.26, upLen: 0.3 }), []);
    // 拍手：左右の手のひらが向き合う
    this.clapRB = basis(new THREE.Vector3(-0.25, 0.75, -0.6), new THREE.Vector3(1, 0.1, 0.2));
    this.clapLB = basis(new THREE.Vector3(0.25, 0.75, -0.6), new THREE.Vector3(-1, 0.1, 0.2));
    this.girlCR = P.makeArm(Object.assign({}, girlSkin, { side: 'R', sleeve, arm: toLocal(this.clapRB, new THREE.Vector3(0.35, -0.55, 0.75).normalize()), upper: toLocal(this.clapRB, new THREE.Vector3(0.3, -0.2, 0.9).normalize()), fore: 0.26, upLen: 0.3 }), []);
    this.girlCL = P.makeArm(Object.assign({}, girlSkin, { side: 'L', sleeve, arm: toLocal(this.clapLB, new THREE.Vector3(-0.35, -0.55, 0.75).normalize()), upper: toLocal(this.clapLB, new THREE.Vector3(-0.3, -0.2, 0.9).normalize()), fore: 0.26, upLen: 0.3 }), []);
    this.makePapa(); this.makeCustomerKit(); this.makeFamily();
    this.armQueue = [[this.girlR, 'grip'], [this.girlRP, 'pinch'], [this.girlRF, 'flat'], [this.papaR, 'flat'], [this.papaL, 'flat'], [this.girlCR, 'flat'], [this.girlCL, 'flat'], [this.ghost, 'point']];
    for (const a of this.custArms) this.armQueue.push([a, 'pinch']);
    for (const a of this.family) { this.armQueue.push([a, 'reach']); this.armQueue.push([a, 'pinch']); }
    this.handGrip = new THREE.Vector3(0.068 * 0.64, -0.028 * 0.64, 0);
  }
  makePapa() {
    const P = this.w.people;
      const papaSkin = { s: 1.0, fr: 1.0, skin: SKIN.papa, tip: SKIN.papaTip, nail: lin('#e4bca8'), res: 0.0028 };
      const sl = { type: 'rolled', col: lin('#5a7090'), col2: lin('#6a80a0'), at: 0.35 };
      this.pressB = basis(new THREE.Vector3(0.0, -0.35, 0.94), new THREE.Vector3(0, 0.95, 0.3));
      const armW = new THREE.Vector3(0, 0.55, -0.83).normalize();
      this.papaR = P.makeArm(Object.assign({}, papaSkin, { side: 'R', sleeve: sl, arm: toLocal(this.pressB, armW), upper: toLocal(this.pressB, new THREE.Vector3(0.2, 0.3, -0.93).normalize()), fore: 0.27, upLen: 0.3 }), []);
      this.papaL = P.makeArm(Object.assign({}, papaSkin, { side: 'L', sleeve: sl, arm: toLocal(this.pressB, armW), upper: toLocal(this.pressB, new THREE.Vector3(-0.2, 0.3, -0.93).normalize()), fore: 0.27, upLen: 0.3 }), []);
    
  }
  makeFamily() {
    const P = this.w.people;
      this.reachB = (dir) => basis(dir.clone().setY(-0.4).normalize(), new THREE.Vector3(0, 1, 0));
      const mk = (spec, from) => {
        const B = this.reachB(from.clone().negate());
        const a = P.makeArm(Object.assign({ side: 'R', nail: lin('#e8c8b8'), arm: toLocal(B, from.clone().setY(0.35).normalize()), upper: toLocal(B, from.clone().setY(0.25).normalize()), fore: 0.26, upLen: 0.3, res: 0.0026 }, spec), []);
        a.B = B; a.from = from; return a;
      };
      this.family = [
        mk({ s: 1.0, skin: SKIN.papa, tip: SKIN.papaTip, sleeve: { type: 'rolled', col: lin('#5a7090'), col2: lin('#6a80a0'), at: 0.35 }, voice: 'papa' }, new THREE.Vector3(-0.8, 0, -0.6).normalize()),
        mk({ s: 0.9, skin: SKIN.mama, tip: SKIN.mamaTip, sleeve: { type: 'long', col: lin('#c8b8a0'), at: 0.3 }, voice: 'mama' }, new THREE.Vector3(0.8, 0, -0.6).normalize()),
        mk({ s: 0.66, fr: 1.1, skin: SKIN.kid2, tip: SKIN.kid2Tip, sleeve: { type: 'short', col: lin('#8aa0b0') }, voice: 'kid' }, new THREE.Vector3(-1, 0, 0.15).normalize()),
        mk({ s: 0.62, fr: 1.12, skin: SKIN.girl, tip: SKIN.girlTip, sleeve: { type: 'short', col: lin('#d8a8a0') }, voice: 'kid' }, new THREE.Vector3(1, 0, 0.1).normalize()),
      ];
      this.family.forEach((a, i) => { a.voice = [ 'papa', 'mama', 'kid', 'kid'][i];  });
    
  }
  makeGirl() {
    const b = new Body({ h: 1.1, kid: true, skin: SKIN.girl, top: lin('#c98f7c'), bottom: lin('#c98f7c'), dress: true, hair: lin('#2a1c14'), shoe: lin('#d8d2c8'), socks: lin('#f0ece4'), tie: lin('#d0a040') });
    this.girl = b;
    b.root.position.set(0.05, -0.744 + 0.14, 0.62); b.root.rotation.y = Math.PI;
    this.w.scene.add(b.root);
    // 踏み台（木箱）
    const step = new THREE.Mesh(roundBox(0.42, 0.14, 0.3, 0.006, 2), pbr('crate', { color: '#b89a70' }));
    step.position.set(0.05, -0.744 + 0.07, 0.6); step.castShadow = true; step.receiveShadow = true;
    this.w.scene.add(step);
    this.stepBox = step;
  }
  makeApron() {
    // 柱のフックにかかった前掛け（藍の帆布）
    const m = pbr('cotton', { color: '#3a4a66', tint: '#55688a', repeat: [3, 3] });
    m.side = THREE.DoubleSide;
    const g = new THREE.PlaneGeometry(0.34, 0.42, 24, 30);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i);
      const t = (y + 0.21) / 0.42; // 0下 1上
      const w = t > 0.62 ? 0.5 + 0.5 * (1 - (t - 0.62) / 0.38) * 0.0 + 0.0 : 1;
      const narrow = t > 0.62 ? 0.62 : 1;
      x *= narrow + (1 - narrow) * (1 - Math.min(1, (t - 0.62) / 0.06));
      const z = Math.sin(x * 40 + t * 3) * 0.008 * (1 - t) + Math.sin(x * 18) * 0.006 + (1 - t) * 0.02;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const ap = new THREE.Mesh(g, m); ap.castShadow = true; ap.receiveShadow = true;
    // ひも
    const sm = new THREE.MeshStandardMaterial({ color: 0x3a4a66, roughness: 0.9 });
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 8, 30, Math.PI), sm); loop.position.y = 0.21; ap.add(loop);
    const pocket = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.09, 4, 4), m); pocket.position.set(0, -0.06, 0.012); ap.add(pocket);
    const grp = new THREE.Group(); grp.add(ap);
    // フック（真鍮）
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 16, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0xb89a5a, metalness: 1, roughness: 0.35 }));
    hook.position.set(0, 0.27, -0.01); grp.add(hook);
    grp.position.set(-0.52, -0.06, 0.355);
    this.w.scene.add(grp);
    this.apron = grp;
  }
  makeSign() {
    // 絵の看板（黒板）：風船の色 → 同じ色の断面 → 大皿
    const c = document.createElement('canvas'); c.width = 512; c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = '#2c312c'; g.fillRect(0, 0, 512, 384);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(Math.random() * 512, Math.random() * 384, 2, 2); }
    const chalk = (col, w = 6) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; };
    const rows = [['#d9554e', '#d9554e'], ['#f0a040', '#f0a040'], ['#7aa83a', '#7aa83a']];
    rows.forEach(([bc, fc], i) => {
      const y = 70 + i * 120;
      // 風船
      g.fillStyle = bc; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(70, y - 10, 30, 38, 0, 0, 6.28); g.fill(); g.globalAlpha = 1;
      chalk('#eeeeea', 3); g.beginPath(); g.moveTo(70, y + 28); g.quadraticCurveTo(80, y + 45, 66, y + 55); g.stroke();
      // 矢印
      chalk('#eeeeea', 6); g.beginPath(); g.moveTo(130, y); g.lineTo(200, y); g.moveTo(185, y - 14); g.lineTo(202, y); g.lineTo(185, y + 14); g.stroke();
      // 断面
      g.fillStyle = fc; g.beginPath(); g.arc(265, y, 38, Math.PI, 0); g.closePath(); g.fill();
      chalk('#eeeeea', 4); g.beginPath(); g.arc(265, y, 38, Math.PI, 0); g.stroke();
      if (i === 0) { g.fillStyle = '#222'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(240 + k * 12, y - 12 - (k % 2) * 8, 3, 5, 0, 0, 6.28); g.fill(); } }
      chalk('#eeeeea', 6); g.beginPath(); g.moveTo(325, y); g.lineTo(385, y); g.moveTo(370, y - 14); g.lineTo(387, y); g.lineTo(370, y + 14); g.stroke();
      // 皿
      chalk('#eeeeea', 5); g.beginPath(); g.ellipse(450, y + 10, 46, 16, 0, 0, 6.28); g.stroke();
      g.fillStyle = fc; g.beginPath(); g.ellipse(450, y + 2, 20, 9, 0, 0, 6.28); g.fill();
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    const frame = pbr('crate', { color: '#8a6a48', tint: '#9a7a58' });
    const grp = new THREE.Group();
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.21), face); bd.position.z = 0.006; grp.add(bd);
    const fr = new THREE.Mesh(roundBox(0.31, 0.24, 0.012, 0.003, 1), frame); grp.add(fr);
    for (const sx of [-1, 1]) { const leg = new THREE.Mesh(roundBox(0.016, 0.3, 0.012, 0.003, 1), frame); leg.position.set(sx * 0.13, -0.06, -0.008); grp.add(leg); }
    grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    grp.rotation.x = -0.32;
    grp.visible = false;
    this.w.scene.add(grp);
    this.sign = grp;
  }
  fillCrate(pop = false) {
    // 木箱に丸ごとの果物（ひとつずつ）
    const cr = this.w.crate.position;
    const spots = {
      watermelon: [-0.135, 0.0], pineapple: [0.125, 0.04], orange: [0.0, -0.07], kiwi: [0.035, 0.085], dragon: [-0.01, 0.02], pomegranate: [0.21, -0.1], star: [0.06, -0.1],
    };
    this.crateFruits = this.crateFruits || [];
    let n = 0;
    for (const key of FRUIT_KEYS) {
      if (this.crateFruits.find(p => p.key === key && p.state === 'crate')) continue;
      const pc = makeWhole(this.w, key, Math.floor(Math.random() * 1e6));
      const s = spots[key];
      // 置き方：横に寝かせる/立てる
      const q = new THREE.Quaternion();
      if (key === 'pineapple') q.setFromEuler(new THREE.Euler(0.15, 0.3, Math.PI / 2 - 0.05));
      else if (key === 'star') q.setFromEuler(new THREE.Euler(0.1, 0.6, Math.PI / 2));
      else if (FRUITS[key].lie) q.setFromEuler(new THREE.Euler(rand(-0.3, 0.3) + Math.PI / 2 * (Math.random() < 0.5 ? 1 : 0), rand(0, 6), rand(-0.2, 0.2)));
      else q.setFromEuler(new THREE.Euler(rand(-0.2, 0.2), rand(0, 6), rand(-0.2, 0.2)));
      pc.group.quaternion.copy(q);
      const gy = cr.y + 0.012;
      pc.groundY = gy;
      pc.group.position.set(cr.x + s[0], gy - pc.lowest(q), cr.z + s[1]);
      pc.state = 'crate'; pc.homeQ = q.clone(); pc.home = pc.group.position.clone();
      this.w.scene.add(pc.group);
      this.w.pieces.push(pc);
      this.crateFruits.push(pc);
      if (pop) { pc.group.scale.setScalar(0.01); pc.popT = -n * 0.12; }
      n++;
    }
  }
  // ---------------------------------------------------------------- 手がかり（光る輪・白い手）
  makeHint() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,250,230,0)'); gr.addColorStop(0.55, 'rgba(255,248,225,0.55)'); gr.addColorStop(0.75, 'rgba(255,245,220,0.25)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.glow.renderOrder = 10;
    this.w.scene.add(this.glow);
    // 白い手袋の手（指さし）
    const gm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(1, 1, 1), emissive: new THREE.Color(0.35, 0.35, 0.35), transparent: true, opacity: 0.0, depthWrite: true });
    this.ghostB = basis(new THREE.Vector3(-0.2, -0.75, -0.62), new THREE.Vector3(0.1, 0.6, -0.8));
    this.ghost = this.w.people.makeArm({ s: 0.56, fr: 1.1, skin: [1, 1, 1], tip: [1, 1, 1], nail: [1, 1, 1], side: 'R', sleeve: { type: 'none' }, arm: toLocal(this.ghostB, new THREE.Vector3(0.3, 0.6, 0.75).normalize()), fore: 0.09, upLen: 0.0, res: 0.0026 }, []);
    this.ghost.mesh.material = gm; this.ghost.mesh.castShadow = false;
    this.ghost.root.renderOrder = 11;
    this.ghostMat = gm;
    this.hintSpec = null; this.hintT = 0;
  }
  setHint(spec) { this.hintSpec = spec; }
  updateHint(dt) {
    const h = this.hintSpec;
    this.idle += dt;
    const show = h && !this.pointer.down && !this.busy;
    const a = show ? Math.min(1, (this.glow.material.opacity + dt * 2)) : Math.max(0, this.glow.material.opacity - dt * 3);
    this.glow.material.opacity = a * (0.55 + 0.3 * Math.sin(this.w.time * 4));
    if (h) {
      const p = h.at instanceof Function ? h.at() : h.at;
      if (p) { this.glow.position.copy(p); const s = (h.size || 0.12) * (1 + 0.08 * Math.sin(this.w.time * 4)); this.glow.scale.set(s, s, 1); }
    }
    // 数秒さわらなければ白い手が見本をみせる
    const gOn = show && this.idle > 4.5 && this.ghost.geoms.point;
    const go = this.ghostMat.opacity;
    this.ghostMat.opacity = gOn ? Math.min(0.88, go + dt * 1.5) : Math.max(0, go - dt * 3);
    this.ghost.root.visible = this.ghostMat.opacity > 0.01;
    if (this.ghost.root.visible && h) {
      this.ghost.setPose('point');
      this.hintT += dt;
      const p0 = h.at instanceof Function ? h.at() : h.at;
      let p = p0.clone();
      const cyc = (this.hintT % 2.2) / 2.2;
      if (h.type === 'tap') p.y += 0.02 + Math.abs(Math.sin(cyc * Math.PI * 2)) * 0.03;
      else if (h.type === 'swipe') { const d = h.dir || new THREE.Vector3(1, 0, 0); p.addScaledVector(d, (ease(clamp(cyc * 1.4, 0, 1)) - 0.5) * (h.len || 0.15)); p.y += 0.015; }
      else if (h.type === 'rub') { p.x += Math.sin(cyc * Math.PI * 4) * 0.05; p.z += Math.cos(cyc * Math.PI * 2) * 0.02; p.y += 0.01; }
      else if (h.type === 'drag') { const q = h.to instanceof Function ? h.to() : h.to; const t = ease(clamp(cyc * 1.3, 0, 1)); p.lerp(q, t); p.y += 0.03 + Math.sin(t * Math.PI) * 0.06; }
      const tipL = this.ghost.tip('point', 0);
      const B = this.ghostB; const q = quatFrom(B);
      this.ghost.root.quaternion.copy(q);
      this.ghost.root.position.copy(p).sub(tipL.applyQuaternion(q));
    } else this.hintT = 0;
  }
  // ---------------------------------------------------------------- 入力
  setupInput() {
    const el = this.w.renderer.domElement;
    const P = this.pointer;
    const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('pointerdown', (e) => {
      if (P.down) return;
      try { el.setPointerCapture && el.setPointerCapture(e.pointerId); } catch (err) { }
      P.id = e.pointerId; P.down = true; [P.x, P.y] = pos(e); P.sx = P.x; P.sy = P.y; P.t0 = performance.now(); P.path = [[P.x, P.y]]; P.moved = 0;
      this.idle = 0;
      this.scene && this.onDown && this.onDown(P);
    });
    el.addEventListener('pointermove', (e) => {
      if (!P.down || e.pointerId !== P.id) return;
      const [x, y] = pos(e); P.moved += Math.hypot(x - P.x, y - P.y); P.x = x; P.y = y; P.path.push([x, y]);
      this.idle = 0;
      this.onMove && this.onMove(P);
    });
    const up = (e) => { if (!P.down || e.pointerId !== P.id) return; P.down = false; this.idle = 0; this.onUp && this.onUp(P); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  ndc(x, y) { const el = this.w.renderer.domElement; return new THREE.Vector2(x / el.clientWidth * 2 - 1, -(y / el.clientHeight) * 2 + 1); }
  rayTo(x, y) { this.ray.setFromCamera(this.ndc(x, y), this.w.camera); return this.ray; }
  onPlane(x, y, h) { const r = this.rayTo(x, y).ray; const t = (h - r.origin.y) / r.direction.y; if (!(t > 0)) return null; return r.origin.clone().addScaledVector(r.direction, t); }
  toScreen(v) { const q = v.clone().project(this.w.camera); const el = this.w.renderer.domElement; return [(q.x + 1) / 2 * el.clientWidth, (1 - q.y) / 2 * el.clientHeight]; }
  screenR(p, r) { const a = this.toScreen(p); const cam = this.w.camera; const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0); const b = this.toScreen(p.clone().addScaledVector(right, r)); return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  pickPiece(x, y, filter) {
    let best = null, bd = 1e9;
    for (const p of this.w.pieces) {
      if (!filter(p)) continue;
      const s = this.toScreen(p.group.position); const r = this.screenR(p.group.position, p.radius) * 1.05 + 14;
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < r && d / r < bd) { bd = d / r; best = p; }
    }
    return best;
  }
  // ---------------------------------------------------------------- 場面
  go(name) {
    this.scene = name; this.sceneT = 0; this.onDown = this.onMove = this.onUp = null; this.setHint(null); this.busy = false;
    this['enter_' + name]();
    this.onResize();
  }
  onResize() {
    if (!this.scene) return;
    const f = this['frame_' + this.scene];
    if (f) this.w.setCam(f.call(this), 2.0, this.sceneT < 0.05);
    this.layout && this.layout();
  }
  update(dt) {
    this.sceneT += dt;
    // アーム形状は少しずつ作る（初回フレームを軽く）
    if (this.armQueue.length && this.sceneT > 0.25) { const [a, p] = this.armQueue.shift(); a.ensure(p); if (!this.ghost.geoms.point && !this.armQueue.length) this.ghost.ensure('point'); }
    else if (!this.ghost.geoms.point && this.sceneT > 1.5 && !this.armQueue.length) this.ghost.ensure('point');
    for (let i = this.events.length - 1; i >= 0; i--) { const e = this.events[i]; e.t -= dt; if (e.t <= 0) { this.events.splice(i, 1); e.f(); } }
    this['update_' + this.scene] && this['update_' + this.scene](dt);
    this.updatePieces(dt);
    this.updateHint(dt);
    this.updateBob(dt);
  }
  after(t, f) { this.events.push({ t, f }); }
  // 女の子の体の動き（カメラが少しはずむ＝うれしくて跳ねる）
  bob(amt = 1) { this.bobT = 0; this.bobA = amt; }
  updateBob(dt) {
    if (this.bobT == null) return;
    this.bobT += dt;
    const t = this.bobT;
    const y = Math.max(0, Math.sin(t * 9)) * Math.exp(-t * 2.2) * 0.012 * this.bobA;
    this.w.camera.position.y += y;
    if (t > 2) this.bobT = null;
  }

  // ======================================================== 0. はじまり：前掛けをつける
  frame_intro() {
    const pts = [new THREE.Vector3(-0.72, 0.25, 0.36), new THREE.Vector3(0.3, -0.1, -0.5), new THREE.Vector3(0.05, -0.6, 0.62), new THREE.Vector3(0.05, 0.4, 0.62), new THREE.Vector3(-0.72, -0.3, 0.36)];
    return this.w.frame(pts, new THREE.Vector3(0.12, 0.42, 1).normalize(), { margin: 0.88, center: new THREE.Vector3(-0.15, -0.02, 0.15) });
  }
  enter_intro() {
    this.girl.use('plain');
    this.girl.root.visible = true;
    this.onUp = (P) => {
      if (this.flags.apron) return;
      const hit = this.rayTo(P.x, P.y).intersectObject(this.apron, true)[0];
      const s = this.toScreen(this.apron.position.clone().add(new THREE.Vector3(0, 0.05, 0)));
      if (hit || Math.hypot(s[0] - P.x, s[1] - P.y) < 90) this.putApron();
    };
    this.setHint({ type: 'tap', at: () => this.apron.position.clone().add(new THREE.Vector3(0, 0.02, 0.05)), size: 0.22 });
  }
  putApron() {
    this.flags.apron = true; this.setHint(null); this.busy = true;
    this.w.sound.pop();
    const a = this.apron; const p0 = a.position.clone(); const p1 = this.girl.root.position.clone().add(new THREE.Vector3(0, 0.68, 0.02));
    let t = 0;
    this.anim = (dt) => {
      t += dt / 0.8; const e = ease(Math.min(1, t));
      a.position.lerpVectors(p0, p1, e); a.position.y += Math.sin(e * Math.PI) * 0.25;
      a.rotation.y = e * Math.PI; a.scale.setScalar(1 - e * 0.6);
      if (t >= 1) {
        a.visible = false; this.anim = null;
        this.girl.use('apron', { apron: lin('#3a4a66') });
        this.w.sound.voice('yay', 'girl'); this.w.sound.sparkle();
        this.hop = 0;
        this.after(1.6, () => this.go('cut'));
      }
    };
  }
  update_intro(dt) {
    this.anim && this.anim(dt);
    // 待っているあいだ、女の子は小さくゆれる
    const g = this.girl;
    g.headPivot.rotation.z = Math.sin(this.w.time * 0.8) * 0.04;
    g.headPivot.rotation.x = Math.sin(this.w.time * 0.6) * 0.03;
    if (this.hop != null) {
      this.hop += dt;
      const y = Math.max(0, Math.sin(this.hop * 7)) * 0.07 * Math.exp(-this.hop * 1.2);
      g.root.position.y = -0.744 + 0.14 + y;
      g.root.scale.set(1, 1 - (y > 0 ? 0 : 0.02), 1);
    }
  }

  // ======================================================== 1. わってみよう
  frame_cut() {
    const pts = [new THREE.Vector3(-0.25, 0, 0.17), new THREE.Vector3(0.25, 0, 0.17), new THREE.Vector3(-0.27, 0.12, -0.52), new THREE.Vector3(0.27, 0.12, -0.52)];
    const dir = this.w.portrait ? new THREE.Vector3(0.05, 1.0, 0.8) : new THREE.Vector3(0.06, 0.7, 0.95);
    const f = this.w.frame(pts, dir, { margin: 0.88, lift: this.w.portrait ? 0.05 : 0.1 });
    return f;
  }
  enter_cut() {
    this.girl.root.visible = false; this.stepBox.visible = false;
    this.onDown = (P) => this.cutDown(P);
    this.onMove = (P) => this.cutMove(P);
    this.onUp = (P) => this.cutUp(P);
    this.w.sound.pop();
  }
  update_cut(dt) {
    this.anim && this.anim(dt);
    this.updateKnife(dt);
    this.papaEvent && this.papaEvent(dt);
    if (this.busy) return;
    // 手がかり
    const onBoard = this.boardWholeOrBig();
    if (this.towelMode) {
      this.setHint({ type: 'rub', at: () => this.stainCenter || new THREE.Vector3(0, 0.01, 0), size: 0.2 });
    } else if (onBoard) {
      this.setHint({ type: 'swipe', at: () => onBoard.group.position.clone().add(new THREE.Vector3(0, onBoard.radius * 0.6, 0)), size: onBoard.radius * 2.6, dir: new THREE.Vector3(1, 0, -0.15).normalize(), len: onBoard.radius * 2.4 });
    } else {
      const nx = this.crateFruits.find(p => p.state === 'crate' && !this.opened.has(p.key)) || this.crateFruits.find(p => p.state === 'crate');
      if (nx) this.setHint({ type: 'tap', at: () => nx.group.position.clone().add(new THREE.Vector3(0, nx.radius * 0.8, 0)), size: nx.radius * 3 });
      else this.setHint(null);
    }
    // ゴール：7種類ぜんぶ割った
    if (!this.flags.cutDone && this.opened.size >= FRUIT_KEYS.length && !this.busy && !this.pointer.down) {
      this.flags.cutDone = true;
      this.after(0.8, () => this.celebrate(() => this.go('shop')));
    }
  }
  boardWholeOrBig() {
    let best = null;
    for (const p of this.w.pieces) {
      if (p.state !== 'rest' || p.placed || p.held) continue;
      if (!this.w.board.inside(p.group.position.x, p.group.position.z)) continue;
      if (p.level === 0) return p;
      if (p.radius > 0.05 && (!best || p.radius > best.radius)) best = p;
    }
    return best;
  }
  // 果物をまな板へ
  fruitToBoard(p) {
    this.w.sound.pop();
    p.state = 'rest';
    // 空いている場所
    let spot = new THREE.Vector3(0, 0, 0.0);
    for (let tries = 0; tries < 30; tries++) {
      const c = new THREE.Vector3(rand(-0.08, 0.08), 0, rand(-0.04, 0.05));
      let ok = true;
      for (const o of this.w.pieces) if (o !== p && o.state !== 'crate' && !o.placed && o.group.position.distanceTo(c) < o.radius + p.radius) ok = false;
      if (ok) { spot = c; break; }
    }
    p.groundY = 0;
    const q = p.group.quaternion.clone();
    // スターフルーツは横向きに、パイナップルも寝かせる
    p.settleTo(q, spot.x, spot.z, 0.6, 0, 0.12);
    p.onLand = () => { this.w.sound.thud(p.radius / 0.04); if (p.key === 'watermelon' && !this.flags.papa) this.startPapa(p); };
  }
  // ---- なぞって切る
  cutDown(P) {
    if (this.busy) return;
    if (this.towelMode) { this.towelDown(P); return; }
    // 箱の果物をタップ → 後で（up）
    P.mode = 'knife'; P.cutState = new Map();
    const crate = this.pickPiece(P.x, P.y, p => p.state === 'crate');
    if (crate) { P.mode = 'crate'; P.crate = crate; return; }
    if (this.scene !== 'cut') {
      const pk = this.pickPiece(P.x, P.y, p => p.state === 'rest' && p.level > 0 && !p.held && (!p.placed || this.scene === 'table'));
      if (pk && this.canDrag(pk)) { this.dragStart(pk, P); return; }
    }
    this.knifeOn(P);
  }
  cutMove(P) {
    if (P.mode === 'towel') return this.towelMove(P);
    if (P.mode === 'drag') return this.dragMove(P);
    if (P.mode !== 'knife') { if (P.mode === 'crate' && P.moved > 25) { P.mode = 'knife'; P.cutState = new Map(); this.knifeOn(P); } return; }
    this.knifeTrack(P, false);
  }
  cutUp(P) {
    if (P.mode === 'towel') return this.towelUp(P);
    if (P.mode === 'drag') return this.dragEnd(P);
    if (P.mode === 'crate') {
      if (P.moved < 25 && P.crate.state === 'crate' && !this.busy) {
        if (this.scene === 'table' || !this.papaActive) this.fruitToBoard(P.crate);
      }
      P.mode = null; return;
    }
    if (P.mode === 'knife') { this.knifeTrack(P, true); this.knifeOff(); }
    P.mode = null;
  }
  knifeOn(P) {
    this.knifeActive = true; this.knife.visible = true;
    this.knifeYaw = 0; this.knifeDir = new THREE.Vector3(0, 0, -1);
    this.knifeTarget = this.onPlane(P.x, P.y, 0.03) || new THREE.Vector3();
    this.knifePos = this.knifeTarget.clone().add(new THREE.Vector3(0, 0.04, 0.02));
    this.girlR.setPose('grip'); this.girlR.root.visible = true;
  }
  knifeOff() { this.knifeActive = false; }
  updateKnife(dt) {
    const k = this.knife;
    if (!this.knifeActive) {
      if (k.visible) { this.knifePos.y += dt * 0.4; this.knifePos.z += dt * 0.3; if (this.knifePos.y > 0.2) { k.visible = false; this.girlR.root.visible = false; } }
      else return;
    } else {
      this.knifePos.lerp(this.knifeTarget, 1 - Math.exp(-dt * 25));
    }
    // 刃の向き：なぞる方向に少し向く
    const b = this.knifeDir.clone(); b.y = 0; b.normalize();
    const B = this.knifeB(b);
    // ナイフ：X=刃の向き, Y=上
    const kq = quatFrom([b, UP.clone(), new THREE.Vector3().crossVectors(b, UP)]);
    k.quaternion.copy(kq);
    // 刃の下端が knifePos
    k.position.copy(this.knifePos).add(new THREE.Vector3(0, 0.024, 0)).addScaledVector(b, -0.06);
    // 手：柄をにぎる
    const hq = quatFrom(B);
    const handle = k.position.clone().addScaledVector(b, -0.052).add(new THREE.Vector3(0, -0.012, 0));
    this.girlR.root.quaternion.copy(hq);
    this.girlR.root.position.copy(handle).sub(this.handGrip.clone().applyQuaternion(hq));
  }
  knifeTrack(P, final) {
    const W = this.w;
    const n = P.path.length;
    if (n >= 2) {
      const a = P.path[Math.max(0, n - 6)], b = P.path[n - 1];
      const pa = this.onPlane(a[0], a[1], 0.0), pb = this.onPlane(b[0], b[1], 0.0);
      if (pa && pb && pa.distanceTo(pb) > 0.004) {
        const d = pb.clone().sub(pa).normalize();
        // 刃の向きは前（-z）から ±60°まで
        const ang = clamp(Math.atan2(d.x, -d.z), -1.0, 1.0);
        const ang2 = Math.abs(ang) > Math.PI / 2 ? ang : ang;
        this.knifeDir.lerp(new THREE.Vector3(Math.sin(ang2), 0, -Math.cos(ang2)), 0.3).normalize();
      }
    }
    // 刃の高さ：果物の上をなぞると中に沈む
    const over = this.pickPiece(P.x, P.y, p => p.state === 'rest' && !p.held && (this.scene === 'cut' || !p.placed));
    const h = over ? Math.max(0.006, over.group.position.y - over.radius * 0.2) : 0.03;
    const tp = this.onPlane(P.x, P.y, h);
    if (tp) this.knifeTarget.copy(tp);
    // 各かけらへの出入り
    for (const p of W.pieces.slice()) {
      if (p.state !== 'rest' || p.held || p.radius < 0.011) continue;
      if (p.placed && this.scene !== 'table') continue;
      if (this.scene === 'table' && p.placed) continue;
      const c = this.toScreen(p.group.position);
      const r = this.screenR(p.group.position, p.radius) * 0.92;
      const inside = Math.hypot(P.x - c[0], P.y - c[1]) < r;
      let st = P.cutState.get(p);
      if (inside && !st) { st = { entry: [P.x, P.y], max: 0 }; if (n > 1) st.entry = P.path[Math.max(0, n - 2)]; P.cutState.set(p, st); }
      if (st) {
        st.max = Math.max(st.max, Math.hypot(P.x - st.entry[0], P.y - st.entry[1]));
        if ((!inside || final) && st.max > r * (final ? 0.9 : 1.2)) {
          P.cutState.delete(p);
          this.doCut(p, st.entry, [P.x, P.y]);
        } else if (!inside) P.cutState.delete(p);
      }
    }
  }
  doCut(p, s0, s1) {
    const h = p.group.position.y;
    const a = this.onPlane(s0[0], s0[1], h), b = this.onPlane(s1[0], s1[1], h);
    if (!a || !b) return;
    const d = b.clone().sub(a); d.y = 0; if (d.lengthSq() < 1e-8) return;
    d.normalize();
    const n = new THREE.Vector3().crossVectors(UP, d).normalize();
    // 直線がかけらの中心からずれすぎていれば、中心寄りに
    const off = p.group.position.clone().sub(a); off.y = 0;
    const dist = off.dot(n);
    const o = a.clone();
    if (Math.abs(dist) > p.radius * 0.8) o.addScaledVector(n, dist - Math.sign(dist) * p.radius * 0.6);
    this.splitPiece(p, n, o);
  }
  splitPiece(p, n, o, power = 1) {
    const W = this.w;
    const r = cutPiece(W, p, n, o);
    if (!r) return null;
    const total = r[0].volume + r[1].volume;
    const cam = W.camera.position;
    const f = FRUITS[p.key];
    const center = o.clone(); center.y = p.group.position.y;
    W.pieces.splice(W.pieces.indexOf(p), 1);
    p.dispose();
    const sides = [1, -1];
    r.forEach((np, i) => {
      W.scene.add(np.group);
      W.pieces.push(np);
      np.placed = null;
      const frac = np.volume / total;
      const fW = np.cutFace.clone().applyQuaternion(np.group.quaternion);
      const toCam = cam.clone().sub(np.group.position); toCam.y = 0; toCam.normalize();
      const D = UP.clone().multiplyScalar(0.9).addScaledVector(toCam, 0.35).normalize();
      const k = frac < 0.62 ? 1 : frac < 0.85 ? 0.45 : 0.15;
      const full = new THREE.Quaternion().setFromUnitVectors(fW, D);
      const part = new THREE.Quaternion().slerp(full, k);
      const q = part.multiply(np.group.quaternion.clone());
      const push = fW.clone(); push.y = 0; push.normalize().multiplyScalar(np.radius * 0.35 + 0.008);
      const tx = np.group.position.x + push.x, tz = np.group.position.z + push.z;
      np.groundY = this.groundAt(tx, tz);
      np.settleTo(q, tx, tz, 0.42 + Math.random() * 0.15, np.groundY, 0.01 + 0.01 * power);
      np.onLand = () => {
        if (!np.group.parent) return;
        if (W.board.inside(np.group.position.x, np.group.position.z)) W.juice.seep(np.group.position.x, np.group.position.z, f.juice.map(c => Math.pow(c, 1 / 2.2)), np.radius * (0.5 + 0.6 * juicy(p.key)), 2.5);
      };
    });
    // 果汁
    const jn = Math.round((14 + 40 * juicy(p.key)) * Math.min(1.6, p.radius / 0.04) * power);
    const toCam = cam.clone().sub(center).normalize();
    W.juice.spray(center, UP.clone().addScaledVector(toCam, 0.3), f.juice, jn, 0.45 + 0.4 * power, 0.9 + 0.5 * power, 1 + 0.3 * power);
    W.sound.slice(p.radius / 0.05, p.key === 'pineapple' || p.key === 'watermelon' ? 1 : 0.6);
    if (!this.opened.has(p.key)) {
      this.opened.add(p.key);
      this.after(0.35, () => { W.sound.voice(Math.random() < 0.5 ? 'wa' : 'ooh', 'girl'); this.bob(1); });
    }
    return r;
  }
  groundAt(x, z) {
    if (this.w.board.inside(x - this.w.boardGroup.position.x, z - this.w.boardGroup.position.z, -0.005)) return 0;
    return -0.024;
  }
  // ---- 大人のやらかし：パパがスイカを強く押して、ぱかっ
  startPapa(melon) {
    this.flags.papa = true; this.busy = true; this.papaActive = true; this.setHint(null);
    const P = this.w.people;
    const hands = [this.papaR, this.papaL];
    hands.forEach(h => { h.setPose('flat'); h.root.visible = true; h.root.quaternion.copy(quatFrom(this.pressB)); });
    const top = melon.group.position.clone(); top.y += melon.radius * 0.95;
    let t = 0, phase = 0;
    this.w.sound.voice('hai', 'papa');
    this.papaEvent = (dt) => {
      t += dt;
      const sq = phase === 1 ? Math.min(1, (t - 1.2) / 1.3) : 0;
      // 手が向こうから来て、スイカの上を押す
      const come = ease(clamp(t / 1.2, 0, 1));
      hands.forEach((h, i) => {
        const sx = i === 0 ? 0.055 : -0.055;
        const p = top.clone().add(new THREE.Vector3(sx, 0.012 - sq * 0.02 + (1 - come) * 0.25, -0.02 - (1 - come) * 0.35));
        if (phase === 2) { const k = ease(clamp((t - 2.6) / 0.35, 0, 1)); p.y += k * 0.16; p.z -= k * 0.12; p.x += sx * k * 1.5; h.root.rotation.z = 0; }
        if (phase === 3) { const k = clamp((t - 3.4) / 1.2, 0, 1); p.y += 0.16 + k * 0.3; p.z -= 0.12 + k * 0.4; }
        // 手のひら中央が押す点に来るように
        h.root.position.copy(p).sub(new THREE.Vector3(0.05, -0.012, 0).applyQuaternion(h.root.quaternion));
      });
      if (phase === 0 && t > 1.2) { phase = 1; this.w.sound.squeeze(); }
      if (phase === 1) {
        // むぎゅっとつぶれる
        melon.group.scale.set(1 + sq * 0.05, 1 - sq * 0.07, 1 + sq * 0.05);
        if (sq >= 1) {
          phase = 2; t = 2.6;
          melon.group.scale.set(1, 1, 1);
          this.w.sound.crack(); this.w.sound.splash();
          const n = new THREE.Vector3(rand(-0.3, 0.3), 0.12, 1).normalize();
          const r = this.splitPiece(melon, n, melon.group.position.clone(), 2.6);
          // 大きなしみ
          for (let i = 0; i < 14; i++) this.w.board.stain(rand(-0.17, 0.17), rand(-0.11, 0.11), rand(0.02, 0.06), [0.75, 0.12, 0.16].map(c => c ** (1 / 2.2)), 0.45);
          this.w.juice.spray(melon.group.position.clone().add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3(0, 1, 0.4), FRUITS.watermelon.juice, 140, 1.2, 1.6, 1.5);
          this.after(0.5, () => this.w.sound.voice('oops', 'papa'));
          this.after(0.9, () => this.w.sound.voice('wa', 'girl'));
        }
      }
      if (phase === 2 && t > 3.4) phase = 3;
      if (phase === 3 && t > 4.6) {
        hands.forEach(h => h.root.visible = false);
        this.papaEvent = null; this.papaActive = false;
        this.startTowel();
      }
    };
  }
  // ---- 女の子がふきんでふく
  startTowel() {
    this.towelMode = true; this.busy = false;
    const tw = this.towel; tw.visible = true;
    tw.position.set(0.17, 0.0, 0.1); tw.rotation.set(0, 0.3, 0);
    this.stainStart = Math.max(0.02, this.w.board.coverage());
    // しみのいちばん濃い場所
    this.stainCenter = new THREE.Vector3(0, 0.005, 0);
  }
  towelDown(P) { P.mode = 'towel'; this.girlRF.setPose('flat'); this.girlRF.root.visible = true; this.towelMove(P); }
  towelMove(P) {
    const p = this.onPlane(P.x, P.y, 0.004);
    if (!p) return;
    const B = this.w.board;
    const prev = this.towel.position.clone();
    const lx = clamp(p.x, -B.w / 2 + 0.03, B.w / 2 - 0.03), lz = clamp(p.z, -B.d / 2 + 0.03, B.d / 2 - 0.03);
    this.towel.position.set(lx, 0.0, lz);
    const v = prev.distanceTo(this.towel.position);
    this.towel.rotation.y += (Math.random() - 0.5) * v * 4;
    // ふいたところだけ消える（ふきんの大きさ）
    for (let i = 0; i < 4; i++) B.wipe(lx + rand(-0.04, 0.04), lz + rand(-0.03, 0.03), 0.045, 0.22);
    // 果汁の粒もふきとる
    for (const d of this.w.juice.p) if (d.flat > 0 && Math.hypot(d.x - lx, d.z - lz) < 0.07) d.flat = 3;
    if (v > 0.002) this.w.sound.wipe(v * 30);
    const q = quatFrom(this.flatB);
    this.girlRF.root.quaternion.copy(q);
    this.girlRF.root.position.copy(this.towel.position).add(new THREE.Vector3(0, 0.03, 0.0)).sub(new THREE.Vector3(0.05, -0.012, 0).applyQuaternion(q));
    this.wipeCheck = (this.wipeCheck || 0) + 1;
    if (this.wipeCheck % 10 === 0) {
      const c = B.coverage();
      if (c < this.stainStart * 0.18 || c < 0.006) this.towelDone();
    }
  }
  towelUp(P) { this.girlRF.root.visible = false; P.mode = null; }
  towelDone() {
    if (!this.towelMode) return;
    this.towelMode = false;
    this.w.sound.sparkle(); this.w.sound.voice('yay', 'girl'); this.bob(1.2);
    this.girlRF.root.visible = false;
    // 残りもきれいに
    let k = 0; const B = this.w.board;
    const fade = () => { for (let i = 0; i < 30; i++) B.wipe(rand(-0.23, 0.23), rand(-0.15, 0.15), 0.06, 0.25); if (++k < 8) this.after(0.05, fade); };
    fade();
    this.towel.visible = false;
    this.after(0.6, () => this.w.sound.voice('un', 'papa'));
  }
  // ---- お祝い（拍手）
  celebrate(next) {
    this.busy = true; this.setHint(null);
    const cam = this.w.camera;
    const R = this.girlCR, Lh = this.girlCL;
    R.setPose('flat'); Lh.setPose('flat');
    R.root.visible = Lh.root.visible = true;
    let t = 0;
    this.w.sound.voice('yay', 'girl');
    this.after(0.3, () => this.w.sound.clap(5));
    this.bob(1.5);
    this.anim = (dt) => {
      t += dt;
      // カメラの前、下のほうで手をたたく
      const f = new THREE.Vector3(); cam.getWorldDirection(f);
      const right = new THREE.Vector3().crossVectors(f, UP).normalize();
      const up = new THREE.Vector3().crossVectors(right, f);
      const base = cam.position.clone().addScaledVector(f, 0.32).addScaledVector(up, -0.13 - Math.max(0, 0.6 - t) * 0.3);
      const gap = 0.012 + Math.abs(Math.sin(t * Math.PI * 2.5)) * 0.05;
      const qR = quatFrom(basis(f.clone().multiplyScalar(0.6).addScaledVector(up, 0.75).addScaledVector(right, -0.15), right.clone().negate()));
      const qL = quatFrom(basis(f.clone().multiplyScalar(0.6).addScaledVector(up, 0.75).addScaledVector(right, 0.15), right.clone()));
      R.root.quaternion.copy(qR); Lh.root.quaternion.copy(qL);
      R.root.position.copy(base).addScaledVector(right, gap + 0.01).sub(new THREE.Vector3(0.04, 0, 0).applyQuaternion(qR));
      Lh.root.position.copy(base).addScaledVector(right, -gap - 0.01).sub(new THREE.Vector3(0.04, 0, 0).applyQuaternion(qL));
      if (t > 2.2) { R.root.visible = Lh.root.visible = false; this.anim = null; this.busy = false; next && next(); }
    };
  }

  // ======================================================== 2. 風船のお客さん
  layout() {
    const W = this.w;
    if (this.scene === 'shop' || this.scene === 'cut') {
      if (W.portrait) { W.platter.position.set(-0.02, -0.024, 0.39); this.sign.position.set(0.36, 0.13, -0.15); }
      else { W.platter.position.set(0.45, -0.024, 0.0); this.sign.position.set(0.47, 0.13, -0.33); }
      this.relayoutPlaced();
    }
  }
  relayoutPlaced() {
    for (const p of this.w.pieces) if (p.placed && p.placed.slot) {
      const s = this.slotPos(p.placed.arc, p.placed.slot);
      p.group.position.x = s.x; p.group.position.z = s.z;
    }
  }
  slotPos(arc, k) {
    const pl = this.w.platter.position;
    const radii = [0.14, 0.108, 0.078, 0.05, 0.022];
    const nsl = [3, 3, 2, 2, 1][arc];
    const r = radii[arc];
    const th = nsl === 1 ? Math.PI / 2 : Math.PI * (0.12 + 0.76 * (k / (nsl - 1)));
    // 奥側に半円（カメラから見て虹のアーチ）
    return new THREE.Vector3(pl.x + Math.cos(th) * r, pl.y, pl.z - Math.sin(th) * r * 0.95 + 0.04);
  }
  frame_shop() {
    const pl = this.w.platter.position;
    const pts = [new THREE.Vector3(-0.25, 0, 0.17), new THREE.Vector3(0.25, 0, 0.17), new THREE.Vector3(-0.25, 0.1, -0.45), new THREE.Vector3(0.25, 0.1, -0.45), pl.clone().add(new THREE.Vector3(0.19, 0, 0.18)), pl.clone().add(new THREE.Vector3(-0.19, 0, 0.18)), pl.clone().add(new THREE.Vector3(0, 0.36, -0.2))];
    const dir = this.w.portrait ? new THREE.Vector3(0.04, 1.0, 0.78) : new THREE.Vector3(0.05, 0.75, 0.92);
    return this.w.frame(pts, dir, { margin: 0.9, lift: this.w.portrait ? 0.04 : 0.08 });
  }
  enter_shop() {
    this.layout();
    this.sign.visible = true;
    this.fillCrate(true);
    this.onDown = (P) => this.cutDown(P);
    this.onMove = (P) => this.cutMove(P);
    this.onUp = (P) => this.cutUp(P);
    // お客さんの順番（色）
    const cats = [0, 1, 2, 3, 4];
    for (let i = cats.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cats[i], cats[j]] = [cats[j], cats[i]]; }
    this.queue = cats.map((c, i) => ({ cat: c, arc: i, need: [3, 3, 2, 2, 1][i], got: 0 }));
    this.cust = null;
    this.makeCustomerKit();
    this.after(0.8, () => this.nextCustomer());
  }
  makeCustomerKit() {
    if (this.balloon) return;
    // 風船（ゴムのつや）
    const g = new THREE.SphereGeometry(0.11, 48, 32);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = y < 0 ? 1 - Math.pow(-y / 0.11, 2.2) * 0.35 : 1; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y * 1.12); }
    g.computeVertexNormals();
    const m = new THREE.MeshPhysicalMaterial({ color: 0xc03030, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.5, sheenColor: new THREE.Color(1, 0.9, 0.9), transmission: 0.0, thickness: 0.002, ior: 1.4, specularIntensity: 0.6 });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb*0.12;'); };
    const b = new THREE.Mesh(g, m); b.castShadow = true;
    const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.016, 12), m); knot.position.y = -0.13; b.add(knot);
    this.balloon = new THREE.Group(); this.balloon.add(b); this.balloonMesh = b;
    // ひも
    this.stringGeo = new THREE.BufferGeometry(); this.stringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 24), 3));
    this.string = new THREE.Line(this.stringGeo, new THREE.LineBasicMaterial({ color: 0xe8e2d4 }));
    this.string.frustumCulled = false;
    this.w.scene.add(this.balloon); this.w.scene.add(this.string);
    this.balloon.visible = this.string.visible = false;
    // お客さんの手（ひもを持つ）
    const P = this.w.people;
    this.custB = basis(new THREE.Vector3(-0.3, 0.2, 0.93), new THREE.Vector3(0.2, 0.95, 0.1));
    const types = [
      { s: 0.9, skin: SKIN.mama, tip: SKIN.mamaTip, sleeve: { type: 'long', col: lin('#b9c4b0'), at: 0.3 }, voice: 'mama' },
      { s: 0.66, fr: 1.1, skin: SKIN.kid2, tip: SKIN.kid2Tip, sleeve: { type: 'short', col: lin('#d8b860') }, voice: 'kid' },
      { s: 1.0, skin: SKIN.papa, tip: SKIN.papaTip, sleeve: { type: 'long', col: lin('#7a6a5a'), at: 0.28 }, voice: 'papa' },
    ];
    this.custArms = types.map(t => {
      const a = P.makeArm(Object.assign({ side: 'R', nail: lin('#e8c8b8'), arm: toLocal(this.custB, new THREE.Vector3(0.75, -0.25, -0.6).normalize()), upper: toLocal(this.custB, new THREE.Vector3(0.9, -0.3, -0.3).normalize()), fore: 0.26, upLen: 0.3, res: 0.0026 }, t), []);
      a.voice = t.voice; return a;
    });
  }
  nextCustomer() {
    const c = this.queue.find(q => q.got < q.need);
    if (!c) { this.shopDone(); return; }
    this.cust = c; c.t = 0; c.state = 'in';
    c.arm = this.custArms[this.queue.indexOf(c) % this.custArms.length];
    c.arm.setPose('pinch'); c.arm.root.visible = true;
    const col = CAT_COLORS[c.cat];
    // 風船の色は断面の色に近い落ち着いた色
    const bc = [[0.62, 0.08, 0.09], [0.85, 0.36, 0.06], [0.85, 0.66, 0.12], [0.30, 0.50, 0.10], [0.86, 0.85, 0.80]][c.cat];
    this.balloonMesh.material.color.setRGB(bc[0], bc[1], bc[2]);
    this.balloon.visible = this.string.visible = true;
    this.w.sound.bell();
    this.after(0.6, () => this.w.sound.squeak());
  }
  custAnchor() {
    const pl = this.w.platter.position;
    return this.w.portrait ? new THREE.Vector3(0.2, 0.16, -0.28) : new THREE.Vector3(pl.x + 0.06, 0.12, pl.z - 0.3);
  }
  update_shop(dt) {
    this.anim && this.anim(dt);
    this.updateKnife(dt);
    this.updateDrag(dt);
    const c = this.cust;
    if (c) {
      c.t += dt;
      const A = this.custAnchor();
      let k = c.state === 'in' ? ease(clamp(c.t / 1.4, 0, 1)) : c.state === 'out' ? 1 - ease(clamp(c.t / 1.4, 0, 1)) : 1;
      // 手：右奥からひもを持って入ってくる
      const hand = A.clone().add(new THREE.Vector3(0.18 * (1 - k) + 0.03, 0.02 + Math.sin(this.w.time * 1.3) * 0.006, -0.1 * (1 - k)));
      if (c.react) { c.react.t += dt; const rt = c.react.t; if (c.react.kind === 'ok') hand.y += Math.abs(Math.sin(rt * 9)) * 0.025 * Math.max(0, 1 - rt); else hand.x += Math.sin(rt * 14) * 0.01 * Math.max(0, 1 - rt); if (rt > 1.6) c.react = null; }
      const q = quatFrom(this.custB);
      c.arm.root.quaternion.copy(q);
      const pc = c.arm.tip('pinch', 0).add(c.arm.tip('pinch', 4)).multiplyScalar(0.5);
      c.arm.root.position.copy(hand).sub(pc.applyQuaternion(q));
      // 風船は手の上でゆれる
      const sway = Math.sin(this.w.time * 1.1) * 0.03;
      let tilt = 0, hop = 0;
      if (c.react) { const rt = c.react.t; if (c.react.kind === 'are' && rt < 0.9) tilt = Math.sin(rt * 12) * 0.35 * (1 - rt / 0.9); else hop = Math.abs(Math.sin(rt * 8)) * 0.04 * Math.max(0, 1.6 - rt); }
      const bp = hand.clone().add(new THREE.Vector3(-0.05 + sway, 0.3 + hop, 0.0));
      this.balloon.position.copy(bp);
      this.balloon.rotation.set(0, 0, sway * 2 + tilt);
      // ひも（たるみ）
      const arr = this.stringGeo.attributes.position.array;
      const top = bp.clone().add(new THREE.Vector3(0, -0.145, 0).applyEuler(this.balloon.rotation));
      for (let i = 0; i < 24; i++) { const t = i / 23; const p = hand.clone().lerp(top, t); p.x += Math.sin(t * Math.PI) * 0.012 * Math.sin(this.w.time * 2 + t * 3); arr.set([p.x, p.y, p.z], i * 3); }
      this.stringGeo.attributes.position.needsUpdate = true;
      if (c.state === 'in' && c.t > 1.4) { c.state = 'wait'; }
      if (c.state === 'out' && c.t > 1.4) { c.arm.root.visible = false; this.balloon.visible = this.string.visible = false; this.cust = null; this.after(0.5, () => this.nextCustomer()); }
    }
    // 手がかり：色の合うかけら → 大皿
    if (!this.busy && c && c.state === 'wait') {
      const want = this.bestPiece(c.cat);
      if (want) this.setHint({ type: 'drag', at: () => want.group.position.clone().add(new THREE.Vector3(0, want.radius * 0.5, 0)), to: () => this.slotPos(c.arc, c.got).add(new THREE.Vector3(0, 0.02, 0)), size: want.radius * 2.8 });
      else {
        const wf = this.crateFruits.find(p => p.state === 'crate' && FRUITS[p.key].cat === c.cat) || this.crateFruits.find(p => p.state === 'crate');
        const big = this.w.pieces.find(p => p.state === 'rest' && !p.placed && p.level > 0 && p.radius > BIG && FRUITS[p.key].cat === c.cat);
        const onB = big || this.boardWholeOrBig();
        if (onB) this.setHint({ type: 'swipe', at: () => onB.group.position.clone().add(new THREE.Vector3(0, onB.radius * 0.6, 0)), size: onB.radius * 2.6, dir: new THREE.Vector3(1, 0, -0.1).normalize(), len: onB.radius * 2.4 });
        else if (wf) this.setHint({ type: 'tap', at: () => wf.group.position.clone().add(new THREE.Vector3(0, wf.radius * 0.8, 0)), size: wf.radius * 3 });
      }
    } else if (!c) this.setHint(null);
    // 木箱がからになったら補充
    if (!this.crateFruits.some(p => p.state === 'crate') && !this.refillT) { this.refillT = 1; this.after(1.5, () => { this.refillT = 0; this.fillCrate(true); }); }
  }
  bestPiece(cat) {
    let best = null, bs = -1e9;
    for (const p of this.w.pieces) {
      if (p.state !== 'rest' || p.placed || p.held || p.level === 0 || p.fleshTris === 0 || p.radius > BIG) continue;
      const s = (FRUITS[p.key].cat === cat ? 10 : 0) + p.faceUp() - p.radius * 10;
      if (s > bs) { bs = s; best = p; }
    }
    return best && FRUITS[best.key].cat === cat ? best : null;
  }
  canDrag(p) { return p.level > 0; }
  dragStart(p, P) {
    P.mode = 'drag'; P.piece = p; p.held = true; p.state = 'held';
    this.w.sound.pop();
    p.holdQ = p.group.quaternion.clone();
    // 断面を上に向けて持つ
    if (p.cutFace) {
      const fW = p.cutFace.clone().applyQuaternion(p.group.quaternion);
      const D = UP.clone().addScaledVector(this.w.camera.position.clone().sub(p.group.position).setY(0).normalize(), 0.3).normalize();
      p.holdQ = new THREE.Quaternion().setFromUnitVectors(fW, D).multiply(p.group.quaternion.clone());
    }
    this.dragTarget = p.group.position.clone();
    this.girlRP.setPose('pinch'); this.girlRP.root.visible = true;
    this.dragMove(P);
  }
  dragMove(P) {
    const p = P.piece; if (!p) return;
    const h = 0.06 + p.radius;
    const t = this.onPlane(P.x, P.y, h);
    if (t) this.dragTarget.copy(t);
  }
  updateDrag(dt) {
    const P = this.pointer;
    if (P.mode !== 'drag' || !P.piece) return;
    const p = P.piece;
    p.group.position.lerp(this.dragTarget, 1 - Math.exp(-dt * 18));
    p.group.quaternion.slerp(p.holdQ, 1 - Math.exp(-dt * 10));
    // 指先でつまむ
    const q = quatFrom(this.pinchB);
    const a = this.girlRP;
    const pinch = a.tip('pinch', 0).add(a.tip('pinch', 4)).multiplyScalar(0.5);
    a.root.quaternion.copy(q);
    const top = p.group.position.clone().add(new THREE.Vector3(0, p.radius * 0.55, p.radius * 0.2));
    a.root.position.copy(top).sub(pinch.applyQuaternion(q));
  }
  dragEnd(P) {
    const p = P.piece; P.mode = null; P.piece = null;
    this.girlRP.root.visible = false;
    if (!p) return;
    p.held = false;
    const pos = p.group.position;
    const pl = this.w.platter.position;
    if (this.scene === 'shop' && this.cust && this.cust.state === 'wait' && Math.hypot(pos.x - pl.x, pos.z - pl.z) < 0.24) {
      if (p.radius > BIG) {
        // 大きすぎる：お客さんは「あれ？」→ まな板にもどる（もっと小さく切ろう）
        this.cust.react = { kind: 'are', t: 0 }; this.w.sound.voice('are', this.cust.arm.voice);
        p.groundY = 0; p.settleTo(p.group.quaternion, clamp(pos.x - pl.x, -0.12, 0.12), 0.0, 0.5, 0, 0.06);
        p.onLand = () => this.w.sound.thud(0.6);
        return;
      }
      this.placeOnPlatter(p);
      return;
    }
    if (this.scene === 'table') { this.tableDrop(p); return; }
    // 元の台の上へ
    const gy = this.groundAt(pos.x, pos.z);
    p.groundY = gy;
    p.settleTo(p.group.quaternion, clamp(pos.x, -0.55, 0.65), clamp(pos.z, -0.16, 0.28), 0.3, gy, 0.0);
    p.onLand = () => this.w.sound.thud(0.5);
  }
  placeOnPlatter(p) {
    const c = this.cust;
    const s = this.slotPos(c.arc, c.got);
    p.placed = { arc: c.arc, slot: c.got };
    const gy = this.w.platter.position.y + 0.007;
    p.groundY = gy;
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, rand(-0.3, 0.3));
    p.settleTo(yaw.multiply(p.holdQ.clone()), s.x, s.z, 0.35, gy, 0.02);
    p.state = 'anim';
    p.onLand = () => this.w.sound.thud(0.4);
    c.got++;
    const ok = FRUITS[p.key].cat === c.cat;
    const voice = c.arm.voice;
    if (ok) {
      c.react = { kind: 'ok', t: 0 };
      this.w.sound.voice('wa', voice); this.w.sound.squeak();
    } else {
      c.react = { kind: 'are', t: 0 };
      this.w.sound.voice('are', voice);
      this.after(1.0, () => { if (this.cust === c) { c.react = { kind: 'ok', t: 0 }; this.w.sound.voice('un', voice); } });
    }
    if (c.got >= c.need) {
      this.after(ok ? 1.2 : 2.0, () => { c.state = 'out'; c.t = 0; this.w.sound.voice('yay', voice); });
    }
  }
  shopDone() {
    this.sign.visible = true;
    this.w.sound.sparkle();
    this.after(0.6, () => this.celebrate(() => this.go('table')));
  }

  // ======================================================== 3. 食卓
  frame_table() {
    const T = this.tablePos;
    const wd = this.w.portrait ? 0.2 : 0.32;
    const pts = [T.clone().add(new THREE.Vector3(-wd, 0, 0.38)), T.clone().add(new THREE.Vector3(wd, 0, 0.38)), T.clone().add(new THREE.Vector3(-wd, 0.05, -0.26)), T.clone().add(new THREE.Vector3(wd, 0.05, -0.26))];
    const dir = this.w.portrait ? new THREE.Vector3(0.0, 0.92, 0.82) : new THREE.Vector3(0.0, 0.8, 0.85);
    return this.w.frame(pts, dir, { margin: 0.95 });
  }
  enter_table() {
    const W = this.w;
    this.sign.visible = false;
    if (!this.table) this.buildTable();
    const T = this.tablePos;
    // 大皿と並んだ果物を食卓へ
    const pl = W.platter.position.clone();
    const np = T.clone().add(new THREE.Vector3(0, 0, -0.06));
    const off = np.clone().sub(pl);
    W.platter.position.copy(np);
    for (const p of W.pieces) {
      if (p.placed) { p.group.position.add(off); p.state = 'rest'; p.anim = null; }
    }
    // 残りの果物は片づける（まな板の上は残す）
    this.flags.table = true;
    this.onDown = (P) => this.tableDown(P);
    this.onMove = (P) => { if (P.mode === 'drag') this.dragMove(P); else this.cutMove(P); };
    this.onUp = (P) => this.tableUp(P);
    this.w.setCam(this.frame_table(), 2, true);
    this.startFamily();
  }
  buildTable() {
    const W = this.w;
    const T = new THREE.Vector3(4.2, 0, 0);
    this.tablePos = T;
    const g = new THREE.Group(); g.position.copy(T);
    const tm = pbr('counter', { color: '#8a6a48', tint: '#c0a080', repeat: [1.2, 1] });
    const top = new THREE.Mesh(roundBox(1.8, 0.045, 1.0, 0.01, 2), tm); top.position.y = -0.024 - 0.0225; top.receiveShadow = true; top.castShadow = true; g.add(top);
    // 麻のランナー
    const run = clothSheet(0.5, 1.0, 0.004, pbr('towel', { color: '#d8ccb4', tint: '#d8c8a8', repeat: [3, 6] }), 9, 30);
    run.position.set(0, -0.024, 0); g.add(run);
    // 自分のお皿
    const plate = makePlatter(0.11); plate.position.set(0, -0.024, 0.27); g.add(plate);
    this.myPlate = plate;
    // まわりの器（湯のみ・皿）
    const cupM = pbr('ceramic', { physical: true, color: '#d8d0c0', tint: '#c8bca8' }); cupM.clearcoat = 0.8;
    for (const [x, z] of [[-0.55, -0.25], [0.55, -0.2], [-0.5, 0.25], [0.52, 0.28]]) {
      const pts = [[0, 0], [0.03, 0], [0.034, 0.004], [0.04, 0.07], [0.037, 0.072], [0.033, 0.01], [0, 0.008]].map(([a, b]) => new THREE.Vector2(a, b));
      const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), cupM); cup.position.set(x, -0.024, z); cup.castShadow = true; cup.receiveShadow = true; g.add(cup);
      const sp = makePlatter(0.08); sp.position.set(x * 0.8, -0.024, z * 0.6 + (z > 0 ? 0.05 : -0.05)); g.add(sp);
    }
    // 小さなまな板と追加の果物
    W.scene.add(g);
    this.table = g;
    const lb = contactBlob(1.2, 0.0); // 予備
    // ベンチ影の代わりに地面
  }
  startFamily() {
    const P = this.w.people;
    const T = this.tablePos;
    this.takeQ = 0; this.takeN = 0; this.taking = null;
    this.after(1.0, () => this.w.sound.voice('wa', 'mama'));
    this.after(1.3, () => this.w.sound.clap(3));
  }
  update_table(dt) {
    this.anim && this.anim(dt);
    this.updateKnife(dt);
    this.updateDrag(dt);
    const placed = this.w.pieces.filter(p => p.placed && p.state === 'rest' && !p.held);
    // 家族がひとつずつ取っていく
    if (!this.taking && this.takeN < 5 && placed.length > 5 && this.sceneT > 1.5) {
      const arm = this.family[this.takeN % this.family.length];
      const target = placed[Math.floor(Math.random() * placed.length)];
      this.taking = { arm, target, t: 0 };
      target.state = 'taken';
      arm.setPose('reach'); arm.root.visible = true;
    }
    if (this.taking) {
      const tk = this.taking; tk.t += dt;
      const a = tk.arm, p = tk.target;
      const q = quatFrom(a.B);
      a.root.quaternion.copy(q);
      const out = p.group.position.clone().addScaledVector(a.from, 0.6).add(new THREE.Vector3(0, 0.15, 0));
      const at = p.group.position.clone().add(new THREE.Vector3(0, p.radius * 0.6, 0));
      let pos;
      if (tk.t < 1.0) pos = out.clone().lerp(at, ease(tk.t / 1.0));
      else if (tk.t < 1.3) { pos = at; if (a.pose !== 'pinch') { a.setPose('pinch'); this.w.sound.pop(); } }
      else { const k = ease(clamp((tk.t - 1.3) / 1.0, 0, 1)); pos = at.clone().lerp(out, k); p.group.position.copy(pos).sub(new THREE.Vector3(0, p.radius * 0.6, 0)); }
      const pinch = a.tip(a.pose, 0).add(a.tip(a.pose, 4)).multiplyScalar(0.5);
      a.root.position.copy(pos).sub(pinch.applyQuaternion(q));
      if (tk.t > 1.5 && !tk.said) { tk.said = true; this.w.sound.voice('mm', a.voice); }
      if (tk.t > 2.4) {
        a.root.visible = false;
        const i = this.w.pieces.indexOf(p); if (i >= 0) this.w.pieces.splice(i, 1); p.dispose();
        this.taking = null; this.takeN++;
        if (this.takeN === 5) this.after(0.8, () => { this.w.sound.voice('yay', 'girl'); this.bob(1); this.freePlay = true; });
      }
    }
    // 手がかり：自分のお皿へ並べる
    if (this.freePlay && !this.busy) {
      const T = this.tablePos;
      const onPlate = this.w.pieces.filter(p => p.onPlate).length;
      if (onPlate < 2) {
        const src = this.w.pieces.find(p => p.placed && p.state === 'rest');
        if (src) this.setHint({ type: 'drag', at: () => src.group.position.clone().add(new THREE.Vector3(0, src.radius * 0.5, 0)), to: () => T.clone().add(new THREE.Vector3(0, 0.02, 0.27)), size: src.radius * 2.6 });
      } else this.setHint(null);
    }
  }
  tableDown(P) {
    if (this.taking) return;
    const pk = this.pickPiece(P.x, P.y, p => p.state === 'rest' && p.level > 0 && !p.held);
    if (pk) { P.tapPiece = pk; this.dragStart(pk, P); return; }
    P.mode = null;
  }
  tableUp(P) {
    if (P.mode === 'drag') {
      // タップだけなら向きを回す
      if (P.moved < 12 && P.piece) {
        const p = P.piece; P.mode = null; P.piece = null; p.held = false; this.girlRP.root.visible = false;
        const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 4).multiply(p.group.quaternion);
        p.settleTo(q, p.group.position.x, p.group.position.z, 0.3, p.groundY, 0.02);
        p.onLand = () => this.w.sound.thud(0.3);
        this.w.sound.pop();
        return;
      }
      this.dragEnd(P);
    }
    P.mode = null;
  }
  tableDrop(p) {
    const T = this.tablePos;
    const pos = p.group.position;
    const mp = T.clone().add(new THREE.Vector3(0, 0, 0.27));
    const pl = this.w.platter.position;
    let gy = -0.024;
    p.onPlate = false;
    if (Math.hypot(pos.x - mp.x, pos.z - mp.z) < 0.1) { gy = -0.024 + 0.006; p.onPlate = true; }
    else if (Math.hypot(pos.x - pl.x, pos.z - pl.z) < 0.16) gy = -0.024 + 0.007;
    p.groundY = gy;
    p.placed = p.placed || { free: true };
    p.settleTo(p.group.quaternion, clamp(pos.x, T.x - 0.7, T.x + 0.7), clamp(pos.z, T.z - 0.4, T.z + 0.42), 0.3, gy, 0.0);
    p.onLand = () => { this.w.sound.thud(0.35); if (p.onPlate && Math.random() < 0.4) this.w.sound.voice(Math.random() < 0.5 ? 'wa' : 'ooh', 'girl'); };
  }

  // ---------------------------------------------------------------- かけらの更新
  updatePieces(dt) {
    const W = this.w;
    const ps = W.pieces;
    for (const p of ps) {
      if (p.popT != null) { p.popT += dt; const t = clamp(p.popT / 0.35, 0, 1); const s = t <= 0 ? 0.01 : 1 + Math.sin(t * Math.PI) * 0.12 * (1 - t) - (1 - t) * 0.99; p.group.scale.setScalar(Math.max(0.01, t < 1 ? Math.min(1.1, t * 1.15) : 1)); if (t >= 1) { p.group.scale.setScalar(1); p.popT = null; } }
      p.update(dt);
    }
    // 重なりをほどく（台の上のかけら）
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i]; if (a.state !== 'rest' || a.placed || a.held) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j]; if (b.state !== 'rest' || b.placed || b.held) continue;
        const dx = b.group.position.x - a.group.position.x, dz = b.group.position.z - a.group.position.z;
        const d = Math.hypot(dx, dz) || 1e-4; const m = (a.footprint() + b.footprint()) * 0.92;
        if (d < m) {
          const push = (m - d) * Math.min(1, dt * 6);
          const ux = dx / d, uz = dz / d;
          const wa = b.volume / (a.volume + b.volume), wb = 1 - wa;
          a.group.position.x -= ux * push * wa; a.group.position.z -= uz * push * wa;
          b.group.position.x += ux * push * wb; b.group.position.z += uz * push * wb;
        }
      }
    }
    // 台の範囲と高さ
    for (const p of ps) {
      if (p.state !== 'rest' || p.placed || p.held) continue;
      const pos = p.group.position;
      if (this.scene !== 'table') { pos.x = clamp(pos.x, -0.62, 0.7); pos.z = clamp(pos.z, -0.17, 0.28); }
      const gy = this.scene === 'table' ? p.groundY : this.groundAt(pos.x, pos.z);
      if (Math.abs(gy - p.groundY) > 0.001) { p.groundY = gy; }
      const want = p.groundY - (p.lowCache != null && p.lowQ && p.lowQ.equals(p.group.quaternion) ? p.lowCache : (p.lowQ = p.group.quaternion.clone(), p.lowCache = p.lowest(p.group.quaternion)));
      pos.y += (want - pos.y) * Math.min(1, dt * 12);
    }
  }
}

function juicy(k) { return { watermelon: 1.0, orange: 0.9, pomegranate: 0.8, kiwi: 0.5, pineapple: 0.7, star: 0.6, dragon: 0.35 }[k]; }
