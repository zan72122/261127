// ろくろで うつわ — 冬の陶芸小屋で、濡れた土をつやのある器にする
import * as THREE from 'three';
import { Post } from './post.js';
import { buildRoom, buildLights, buildEnv, POS, R, contactShadow } from './room.js';
import { loadDeferred, tex } from './assets.js';
import { Clay, SMAX } from './clay.js';
import { loadPerson, loadHand, makeApron, peopleMaterials } from './people.js';
import { audioInit, sfx, say, setMotor, setRub, setFireLevel, setKiln } from './audio.js';
import { GlazeStage } from './glaze.js';
import { TableStage } from './table.js';

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const canvas = document.getElementById('c');
const ui = document.getElementById('ui');
const uictx = ui.getContext('2d');
const veil = document.getElementById('veil');

// ------------------------------------------------------------ 描画の土台
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a221c);
const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 30);
const post = new Post(renderer);
const env = buildEnv(renderer);
scene.environment = env;
scene.environmentIntensity = 0.55;
const { room, anim } = buildRoom(scene);
const L = buildLights(scene);

// ------------------------------------------------------------ 画面サイズ・画質
let W = 1, H = 1, dprScale = 1, quality = 1;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
let baseDpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 1.5);
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  const dpr = baseDpr * quality;
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  post.setSize(Math.round(W * dpr), Math.round(H * dpr), isMobile ? 2 : 4);
  ui.width = Math.round(W * Math.min(2, window.devicePixelRatio || 1)); ui.height = Math.round(H * Math.min(2, window.devicePixelRatio || 1));
  camera.aspect = W / H;
  applyFocal();
}
window.addEventListener('resize', resize);
let focal = 40;
// 35mm 判換算：短い辺を 24mm として画角を決める
function applyFocal() {
  const short = 2 * Math.atan(12 / focal);
  if (camera.aspect >= 1) camera.fov = THREE.MathUtils.radToDeg(short);
  else camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(short / 2) / camera.aspect));
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------ カメラの場面（人の目の高さ、35〜50mm）
const SHOTS = {
  intro: { pos: [1.25, 1.32, 1.95], look: [-0.45, 0.95, -1.25], f: 35, pPos: [1.0, 1.25, 2.25], pLook: [-0.5, 0.9, -1.1] },
  apron: { pos: [0.35, 1.2, 0.6], look: [-0.45, 0.95, -1.4], f: 40 },
  wheel: { pos: [0.05, 0.86, -0.08], look: [0.05, 0.52, -0.56], f: 42, pPos: [0.05, 0.9, 0.0], pLook: [0.05, 0.5, -0.56] },
  wheelWide: { pos: [0.55, 1.0, 0.15], look: [0.05, 0.52, -0.56], f: 38 },
  dry: { pos: [-0.7, 0.75, -0.25], look: [-1.2, 0.5, -0.78], f: 45 },
  glaze: { pos: [1.05, 1.02, -0.62], look: [1.05, 0.5, -1.45], f: 38, pPos: [1.05, 1.15, -0.45], pLook: [1.05, 0.48, -1.45] },
  kiln: { pos: [0.95, 0.95, 0.15], look: [1.85, 0.6, -0.08], f: 38, pPos: [0.75, 1.0, 0.2], pLook: [1.85, 0.6, -0.08] },
  kilnIn: { pos: [1.18, 0.78, -0.02], look: [1.9, 0.48, -0.06], f: 45 },
  table: { pos: [-0.95, 1.08, 1.28], look: [-0.95, 0.8, 0.3], f: 40, pPos: [-0.95, 1.18, 1.45], pLook: [-0.95, 0.78, 0.35] },
};
const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3(), toPos: new THREE.Vector3(), toLook: new THREE.Vector3(), t: 1, dur: 1, f0: 40, f1: 40, shot: null };
function shotVec(s) {
  const portrait = W < H;
  return { p: new THREE.Vector3(...(portrait && s.pPos ? s.pPos : s.pos)), l: new THREE.Vector3(...(portrait && s.pLook ? s.pLook : s.look)) };
}
function setShot(name, dur = 1.6) {
  const s = SHOTS[name]; cam.shot = name;
  const v = shotVec(s);
  cam.fromPos.copy(cam.pos); cam.fromLook.copy(cam.look);
  cam.toPos.copy(v.p); cam.toLook.copy(v.l);
  cam.f0 = focal; cam.f1 = s.f;
  cam.t = 0; cam.dur = dur;
  if (dur <= 0) { cam.pos.copy(v.p); cam.look.copy(v.l); focal = s.f; cam.t = 1; applyFocal(); }
}
let fadeT = 0, fadeDir = 0, fadeCb = null;
function cutTo(name, cb) { // 短い暗転でカット
  fadeDir = 1; fadeCb = () => { setShot(name, 0); cb && cb(); fadeDir = -1; };
}
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let camShake = 0;
function updateCamera(dt, t) {
  if (cam.t < 1) {
    cam.t = Math.min(1, cam.t + dt / cam.dur);
    const k = ease(cam.t);
    cam.pos.lerpVectors(cam.fromPos, cam.toPos, k);
    cam.look.lerpVectors(cam.fromLook, cam.toLook, k);
    focal = cam.f0 + (cam.f1 - cam.f0) * k; applyFocal();
  } else if (cam.shot) {
    const v = shotVec(SHOTS[cam.shot]);
    cam.pos.lerp(v.p, 1 - Math.exp(-dt * 3)); cam.look.lerp(v.l, 1 - Math.exp(-dt * 3));
  }
  // 手持ちカメラのごくわずかな揺れ
  const br = 0.0018;
  camera.position.set(cam.pos.x + Math.sin(t * 0.7) * br + (Math.random() - 0.5) * camShake, cam.pos.y + Math.sin(t * 0.53 + 1) * br + (Math.random() - 0.5) * camShake, cam.pos.z);
  camera.lookAt(cam.look);
  post.focus = Math.max(0.2, camera.position.distanceTo(focusTarget));
  camShake *= Math.exp(-dt * 4);
  if (fadeDir) {
    fadeT += fadeDir * dt / 0.35;
    if (fadeT >= 1 && fadeDir > 0) { fadeT = 1; const cb = fadeCb; fadeCb = null; cb && cb(); }
    if (fadeT <= 0 && fadeDir < 0) { fadeT = 0; fadeDir = 0; }
  }
  post.mat.uniforms.uFade.value = ease(Math.min(1, Math.max(0, fadeT)));
}
const focusTarget = new THREE.Vector3();

// ------------------------------------------------------------ 粘土とろくろ
const clay = new Clay();
const clayHolder = new THREE.Group();
clayHolder.position.set(POS.wheel.x, POS.wheelHeadY + 0.0012, POS.wheel.z);
scene.add(clayHolder);
clayHolder.add(clay.mesh);
const wheel = { speed: 1.6, target: 1.6, angle: 0 };

// ------------------------------------------------------------ 人と手
const people = { girl: null, papa: null, mama: null };
const hands = { press: null, cup: null, papa: null, hold: null };
const apron = makeApron();
room.add(apron.mesh);
apron.mesh.position.set(POS.apron.x, POS.apron.y + 0.27, R.z0 + 0.03);
let apronState = 'hang', apronT = 0;

async function loadPeople() {
  try {
    const [girl, papa] = await Promise.all([loadPerson('girl'), loadPerson('papa')]);
    people.girl = girl; people.papa = papa;
    girl.root.position.set(-0.12, 0, -0.05); girl.root.rotation.y = Math.PI + 0.35;
    room.add(girl.root);
    girl.root.add(apron.neck, apron.waist);
    papa.root.position.set(-1.35, 0, -0.95); papa.root.rotation.y = -Math.PI / 2 - 0.5;
    room.add(papa.root);
    // 立ち姿：腕を少し体の横に
    girl.parts.armL.rotation.z = -0.06; girl.parts.armR.rotation.z = 0.06;
    papa.parts.armR.rotation.x = -0.5; papa.parts.armL.rotation.x = -0.3;
    shadowsFor(girl.root, 0.4); shadowsFor(papa.root, 0.55);
  } catch (e) { console.warn(e); }
  try {
    const [press, cup, ph] = await Promise.all([loadHand('hand_girl_press'), loadHand('hand_girl_cup'), loadHand('hand_papa', 'papa')]);
    hands.press = press; hands.cup = cup; hands.papa = ph;
    for (const h of [press, cup, ph]) { h.visible = false; scene.add(h); }
  } catch (e) { console.warn(e); }
  loadHand('hand_girl_hold').then(h => { hands.hold = h; h.visible = false; scene.add(h); }).catch(() => { });
  loadPerson('mama').then(m => { people.mama = m; m.root.visible = false; room.add(m.root); }).catch(() => { });
}
function shadowsFor(root, s) {
  const c = contactShadow(root, 0, 0.02, s, s * 0.8, 0.55, 0.003);
  c.userData.contact = true;
}

// ------------------------------------------------------------ 入力
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const ptr = { down: false, x: 0, y: 0, sx: 0, sy: 0, t0: 0, moved: 0, id: -1 };
function setNdc(x, y) { ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera); }
function hitObj(obj, x, y) { setNdc(x, y); const h = ray.intersectObject(obj, true); return h.length ? h[0] : null; }
// 指先の判定を少し太くする：周りも探す
function hitObjFat(obj, x, y, rad = 22) {
  let best = hitObj(obj, x, y); if (best) return best;
  for (let a = 0; a < 8; a++) { const h = hitObj(obj, x + Math.cos(a * 0.785) * rad, y + Math.sin(a * 0.785) * rad); if (h) return h; }
  return null;
}
let lastInput = 0;
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audioInit();
  if (ptr.down && e.pointerId !== ptr.id) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
  ptr.down = true; ptr.id = e.pointerId; ptr.x = ptr.sx = e.clientX; ptr.y = ptr.sy = e.clientY; ptr.t0 = performance.now(); ptr.moved = 0;
  lastInput = clock;
  stage.down && stage.down(ptr);
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.moved += Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y);
  ptr.x = e.clientX; ptr.y = e.clientY; lastInput = clock;
  stage.move && stage.move(ptr);
});
const endPtr = (e) => {
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false; lastInput = clock;
  stage.up && stage.up(ptr);
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------ ヒント（かすかな光 + 白い手）
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,236,200,0.9)'); gr.addColorStop(0.35, 'rgba(255,220,170,0.35)'); gr.addColorStop(1, 'rgba(255,210,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.8, 0.7, 0.55), opacity: 0 }));
glow.renderOrder = 10;
scene.add(glow);
const hint = { target: null, size: 0.2, show: 0 };
function setHint(fn, size = 0.2) { hint.target = fn; hint.size = size; }
function drawHintHand(t) {
  const dpr = ui.width / W;
  uictx.setTransform(1, 0, 0, 1, 0, 0);
  uictx.clearRect(0, 0, ui.width, ui.height);
  if (!hint.target || ptr.down) { hint.show = Math.max(0, hint.show - 0.08); }
  const tgt = hint.target && hint.target();
  if (!tgt) { glow.material.opacity = 0; return; }
  // かすかに光る
  glow.position.copy(tgt);
  const pul = 0.5 + 0.5 * Math.sin(t * 3.2);
  glow.scale.setScalar(hint.size * (0.9 + 0.2 * pul));
  glow.material.opacity = (0.18 + 0.22 * pul) * (ptr.down ? 0.3 : 1);
  // 数秒さわらないと白い手が指さす
  const idle = clock - lastInput;
  if (idle > 4 && !ptr.down && !busy) hint.show = Math.min(1, hint.show + 0.04);
  else hint.show = Math.max(0, hint.show - 0.08);
  if (hint.show <= 0.01) return;
  const v = tgt.clone().project(camera);
  if (v.z > 1) return;
  const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
  const tap = Math.max(0, Math.sin(t * 4.0));
  uictx.setTransform(dpr, 0, 0, dpr, 0, 0);
  uictx.globalAlpha = hint.show * 0.92;
  drawPointer(uictx, x + 8, y + 10 + 14 * (1 - tap), 1 + 0.06 * tap);
  // タップの輪
  uictx.globalAlpha = hint.show * (1 - (t * 1.3 % 1)) * 0.8;
  uictx.strokeStyle = 'rgba(255,255,255,0.9)'; uictx.lineWidth = 3;
  uictx.beginPath(); uictx.arc(x, y, 10 + 26 * (t * 1.3 % 1), 0, 6.3); uictx.stroke();
  uictx.globalAlpha = 1;
}
function drawPointer(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s); g.rotate(-0.35);
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
  g.fillStyle = '#fbfaf7'; g.strokeStyle = 'rgba(120,110,100,0.55)'; g.lineWidth = 1.5;
  g.beginPath();
  // 人さし指
  g.moveTo(-6, 0); g.quadraticCurveTo(-6, -6, 0, -6); g.quadraticCurveTo(6, -6, 6, 0);
  g.lineTo(6, 34);
  // 握った指
  g.quadraticCurveTo(14, 28, 18, 34); g.quadraticCurveTo(26, 30, 29, 37); g.quadraticCurveTo(37, 35, 38, 44);
  g.lineTo(38, 62); g.quadraticCurveTo(36, 80, 18, 82); g.lineTo(2, 82);
  g.quadraticCurveTo(-12, 80, -16, 64); g.lineTo(-22, 46); g.quadraticCurveTo(-24, 38, -16, 38); g.lineTo(-6, 50);
  g.closePath(); g.fill(); g.shadowColor = 'transparent'; g.stroke();
  g.beginPath(); g.moveTo(18, 34); g.lineTo(18, 46); g.moveTo(29, 37); g.lineTo(29, 48); g.stroke();
  g.restore();
}

// ------------------------------------------------------------ 進行
let clock = 0, busy = false;
const timers = [];
function after(sec, fn) { timers.push({ t: clock + sec, fn }); }
function runTimers() { for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
let stage = {};
const gameState = { mishapDone: false, firstShape: 0 };

// ================================================================ 場面0：エプロン
const introStage = {
  name: 'intro',
  enter() {
    setShot('intro', 0);
    focusTarget.set(-0.3, 0.9, -1.0);
    post.aperture = 0.0025;
    apronState = 'hang';
    setHint(() => apronState === 'hang' ? new THREE.Vector3(POS.apron.x, POS.apron.y + 0.05, R.z0 + 0.08) : null, 0.5);
    wheel.target = 0;
    if (people.girl) people.girl.root.visible = true;
  },
  down(p) {
    if (apronState !== 'hang' || busy) return;
    const h = hitObjFat(apron.mesh, p.x, p.y, 30);
    if (h) wearApron();
  },
  update(dt) {
    focusTarget.lerp(apronState === 'hang' ? new THREE.Vector3(-0.35, 1.0, -1.3) : new THREE.Vector3(-0.12, 0.8, -0.05), 1 - Math.exp(-dt * 2));
  },
};
function wearApron() {
  busy = true; apronState = 'fly'; apronT = 0;
  sfx.rustle(); say('エプロン!', 'girl');
  setHint(null);
}
function updateApron(dt) {
  const g = people.girl;
  const pos = apron.mesh.geometry.attributes.position;
  if (apronState === 'hang') {
    // ストーブの上昇気流で、ほんの少しゆれる
    const t = clock;
    for (let k = 0; k < pos.count; k++) {
      const v = 1 - (apron.hang[k * 3 + 1] + 0.55) / 0.5;
      pos.setXYZ(k, apron.hang[k * 3] + Math.sin(t * 1.3 + v * 2) * 0.004 * v, apron.hang[k * 3 + 1], apron.hang[k * 3 + 2] + Math.sin(t * 0.9 + apron.hang[k * 3] * 20) * 0.006 * v);
    }
    pos.needsUpdate = true; apron.mesh.geometry.computeVertexNormals();
  } else if (apronState === 'fly' && g) {
    apronT = Math.min(1, apronT + dt / 1.3);
    const k = ease(apronT);
    // ペグから女の子の体へ
    const from = new THREE.Matrix4().compose(new THREE.Vector3(POS.apron.x, POS.apron.y + 0.27, R.z0 + 0.03), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    g.root.updateMatrixWorld();
    const to = g.root.matrixWorld.clone();
    const pf = new THREE.Vector3(), qf = new THREE.Quaternion(), sf = new THREE.Vector3();
    const pt = new THREE.Vector3(), qt = new THREE.Quaternion(), st = new THREE.Vector3();
    from.decompose(pf, qf, sf); to.decompose(pt, qt, st);
    apron.mesh.position.lerpVectors(pf, pt, k); apron.mesh.position.y += Math.sin(k * Math.PI) * 0.25;
    apron.mesh.quaternion.slerpQuaternions(qf, qt, k);
    for (let i = 0; i < pos.count; i++) {
      const m = Math.min(1, Math.max(0, k * 1.4 - 0.2));
      pos.setXYZ(i, apron.hang[i * 3] * (1 - m) + apron.worn[i * 3] * m, apron.hang[i * 3 + 1] * (1 - m) + apron.worn[i * 3 + 1] * m, apron.hang[i * 3 + 2] * (1 - m) + apron.worn[i * 3 + 2] * m);
    }
    pos.needsUpdate = true; apron.mesh.geometry.computeVertexNormals();
    if (apronT >= 1) {
      apronState = 'worn';
      g.root.attach(apron.mesh);
      apron.mesh.position.set(0, 0, 0); apron.mesh.quaternion.identity();
      apron.neck.visible = apron.waist.visible = true;
      // うれしくて跳ねる
      hop(g, 2); sfx.chime(); say('よーし!', 'girl');
      after(1.8, () => { busy = false; goStage(wheelStage); });
    }
  } else if (apronState === 'fly' && !g) {
    apronState = 'worn'; busy = false; goStage(wheelStage);
  }
}
// 体の動き（跳ねる・拍手・うなずき・首かしげ）
const moves = [];
function hop(p, n = 1) { moves.push({ p, kind: 'hop', t: 0, dur: 0.45 * n, n }); }
function clap(p, n = 3) { moves.push({ p, kind: 'clap', t: 0, dur: 0.36 * n, n }); }
function nod(p) { moves.push({ p, kind: 'nod', t: 0, dur: 0.9 }); }
function tilt(p) { moves.push({ p, kind: 'tilt', t: 0, dur: 1.3 }); }
function updateMoves(dt) {
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]; m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    const P = m.p.parts, root = m.p.root;
    if (m.kind === 'hop') {
      const ph = (k * m.n) % 1;
      root.position.y = Math.max(0, Math.sin(ph * Math.PI)) * 0.07 * (1 - k * 0.3);
      P.armL.rotation.z = -0.06 - Math.sin(ph * Math.PI) * 0.5; P.armR.rotation.z = 0.06 + Math.sin(ph * Math.PI) * 0.5;
      if (k >= 1) { root.position.y = 0; P.armL.rotation.z = -0.06; P.armR.rotation.z = 0.06; }
    } else if (m.kind === 'clap') {
      const ph = (k * m.n) % 1;
      const a = 0.9 + 0.18 * Math.sin(ph * Math.PI * 2);
      const e = Math.min(1, Math.min(k, 1 - k) * 6);
      P.armL.rotation.x = -a * e; P.armR.rotation.x = -a * e;
      P.armL.rotation.y = 0.55 * e - 0.25 * Math.max(0, Math.sin(ph * Math.PI * 2)) * e; P.armR.rotation.y = -P.armL.rotation.y;
      if (k >= 1) { P.armL.rotation.set(0, 0, -0.06); P.armR.rotation.set(0, 0, 0.06); }
    } else if (m.kind === 'nod') {
      P.head.rotation.x = Math.sin(k * Math.PI * 3) * 0.22 * (1 - k);
    } else if (m.kind === 'tilt') {
      P.head.rotation.z = Math.sin(Math.min(1, k * 2) * Math.PI * 0.5) * 0.32 * (1 - Math.max(0, k - 0.6) / 0.4);
    }
    if (k >= 1) moves.splice(i, 1);
  }
}

// ================================================================ 場面1：ろくろ
const finger = { active: false, r: 0, y: 0, rad: 0.0075, nr: 1, ny: 0, mr: 0, my: 0, depth: 0, water: 0.35, side: 1, hold: 0, contact: new THREE.Vector3(), cN: new THREE.Vector3(), theta: 0, s: 0, prevU: null, prevS: 0, worldTip: new THREE.Vector3() };
const wheelStage = {
  name: 'wheel',
  sub: 'shape',
  enter() {
    cutTo('wheel', () => {
      if (people.girl) people.girl.root.visible = false;
      wheel.target = 1.6;
      this.sub = 'shape';
      focusTarget.set(POS.wheel.x, 0.53, POS.wheel.z);
      post.aperture = 0.0042;
      setHint(() => this.hintTarget(), 0.22);
      busy = false;
      say('まわった!', 'girl');
    });
  },
  hintTarget() {
    if (this.sub === 'mishap') return null;
    const st = this.stats || clay.stats();
    const base = clayHolder.position;
    if (this.sub === 'reball') return new THREE.Vector3(base.x, base.y + 0.04, base.z + 0.04);
    if (this.wireReady) return anim.wire.getWorldPosition(new THREE.Vector3());
    if (finger.water < 0.08) return anim.sponge.getWorldPosition(new THREE.Vector3());
    if (!st.open) return new THREE.Vector3(base.x, base.y + st.top, base.z);
    return new THREE.Vector3(base.x, base.y + st.top * 0.6, base.z + st.maxR * 0.9);
  },
  down(p) {
    if (busy) return;
    if (this.sub === 'reball') {
      if (hitObjFat(clay.mesh, p.x, p.y, 40)) { reballTap(); }
      return;
    }
    if (this.wireReady && hitObjFat(anim.wire, p.x, p.y, 34)) { cutWithWire(); return; }
    if (hitObjFat(anim.sponge, p.x, p.y, 34) || hitObjFat(anim.waterBowl, p.x, p.y, 20) || hitObj(anim.water, p.x, p.y)) { wetHands(); return; }
    this.tryContact(p, true);
  },
  move(p) { if (this.sub !== 'reball' && !busy) this.tryContact(p, false); },
  up() { endContact(); },
  tryContact(p, first) {
    const h = hitObjFat(clay.mesh, p.x, p.y, first ? 26 : 10);
    if (h) {
      const lp = clay.mesh.worldToLocal(h.point.clone());
      const r = Math.hypot(lp.x, lp.z), y = lp.y;
      // 断面の法線（面の法線を回転面へ）
      const n = h.face.normal.clone();
      const radial = r > 1e-4 ? new THREE.Vector2(lp.x / r, lp.z / r) : new THREE.Vector2(1, 0);
      let nr = n.x * radial.x + n.z * radial.y, ny = n.y;
      const nl = Math.hypot(nr, ny) || 1; nr /= nl; ny /= nl;
      finger.nr = nr; finger.ny = ny;
      finger.tr = r; finger.ty = y;
      finger.zone = clay.zoneAt(r, y);
      if (!clay.open && ny > 0.75) finger.zone = 'top';
      finger.contact.copy(h.point);
      finger.cN.copy(n).transformDirection(clay.mesh.matrixWorld);
      const lpH = clayHolder.worldToLocal(h.point.clone());
      finger.phi = Math.atan2(-lpH.z, lpH.x);
      if (first || !finger.active) {
        finger.active = true; finger.r = r; finger.y = y; finger.depth = 0; finger.hold = 0; finger.prevU = null;
        sfx.squish();
      }
      finger.lost = 0;
    } else if (finger.active) {
      // 器のふちから外れた：軸を通る面に投影して続ける
      setNdc(p.x, p.y);
      const nrm = new THREE.Vector3().subVectors(camera.position, clayHolder.position); nrm.y = 0; nrm.normalize();
      const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, clayHolder.position);
      const q = new THREE.Vector3();
      if (ray.ray.intersectPlane(pl, q)) {
        const lp = clayHolder.worldToLocal(q.clone());
        const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), nrm);
        const r = Math.abs(lp.dot(side));
        finger.tr = r; finger.ty = lp.y;
      }
      finger.lost = (finger.lost || 0) + 1;
    }
  },
  update(dt) {
    // 指の位置
    if (finger.active) updateFinger(dt);
    clay.dry(dt);
    // 形の判定
    this.stats = clay.stats();
    if (this.sub === 'shape' && this.stats.open && this.stats.top > 0.06) gameState.firstShape += dt * (finger.active ? 1 : 0.3);
    if (this.sub === 'shape' && !gameState.mishapDone && gameState.firstShape > 6 && !finger.active && clock - lastInput > 0.8) papaMishap();
    this.wireReady = (this.sub === 'shape2' || (this.sub === 'shape' && gameState.mishapDone)) && this.stats.kind !== 'lump' && (this.stats.top > 0.035);
    // 道具が光る
    anim.wire.position.y = 0.455 + (this.wireReady ? Math.sin(clock * 5) * 0.004 + 0.006 : 0);
  },
};
function wetHands() {
  busy = true;
  sfx.splash(); finger.water = 1;
  // 手を水につける → しずくを土に
  handAnim = { kind: 'wet', t: 0 };
  after(0.7, () => {
    sfx.drip();
    // 上から水をかける：口縁の近くから垂れる
    const st = clay.stats();
    for (let i = 0; i < 6; i++) {
      const u = Math.random();
      const top = clay.nearestS(st.rimR || 0.01, st.top);
      clay.drip(u, top.s + 0.01, 0.03 + Math.random() * 0.08);
    }
    clay.paintWet(0, 1, 0, SMAX, 0.0, 0);
    spawnDrops(clayHolder.position.clone().add(new THREE.Vector3(0.0, st.top + 0.06, 0.02)), 14);
    busy = false;
  });
  after(1.0, () => sfx.drip());
}
function endContact() {
  if (finger.active) { finger.active = false; setRub(0, 0); }
}
function updateFinger(dt) {
  // 触っている点（断面）と、その動き
  const pr = finger.r, py = finger.y;
  const tr = finger.tr, ty = finger.ty;
  const dx = tr - finger.r, dy = ty - finger.y, dl = Math.hypot(dx, dy), maxStep = 0.3 * dt;
  const k = dl > maxStep ? maxStep / dl : 1;
  finger.r += dx * k; finger.y += dy * k;
  const vr = (finger.r - pr) / dt, vy = (finger.y - py) / dt;
  finger.hold += dt;
  const zone = finger.zone || clay.zoneAt(finger.r, finger.y);
  const wetK = 0.5 + 0.5 * Math.min(1, finger.water * 1.6);
  const spd = Math.min(1.3, wheel.speed / 1.6);
  const p = Math.min(1, 0.35 + finger.hold * 0.45) * wetK * spd;
  clay.apply({ zone, r: finger.r, y: finger.y, p, vy: Math.max(-0.3, Math.min(0.3, vy)), vr: Math.max(-0.3, Math.min(0.3, vr)), dt, hold: finger.hold });
  clay.remesh();
  finger.depth = Math.min(1, finger.hold);
  // ろくろ目：回転にそって溝を描く
  const near = clay.nearestS(finger.r, finger.y);
  // 指は止まり、土が回る：土の上の位置 u = (指の角度 − 回転角)
  const uc = ((((finger.phi || 0) - wheel.angle) / (Math.PI * 2)) % 1 + 1) % 1;
  if (finger.prevU !== null) {
    let du = finger.prevU - uc; if (du < 0) du += 1; if (du > 0.5) du = 0;
    const u0 = finger.prevU, u1 = finger.prevU - du;
    const press = Math.min(1, 0.4 + p * 0.6);
    clay.drawGroove(u0, u1, finger.prevS, near.s, press, finger.water);
    clay.paintWet(u0, u1, finger.prevS, near.s, finger.water * 0.6, 0.25 * dt * 10);
  }
  finger.prevU = uc; finger.prevS = near.s;
  finger.water = Math.max(0, finger.water - dt * 0.05);
  setRub(1, finger.water);
}
let frameN = 0;
// 水しぶき・しずく
const drops = [];
const dropGeo = new THREE.SphereGeometry(1, 8, 6);
const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xcfc4b8, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.75, clearcoat: 1, envMapIntensity: 2 });
function spawnDrops(at, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(dropGeo, dropMat);
    const s = 0.0015 + Math.random() * Math.random() * 0.004;
    m.scale.set(s, s * 1.3, s);
    m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.06, Math.random() * 0.03, (Math.random() - 0.5) * 0.06));
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.05, -Math.random() * 0.2, (Math.random() - 0.5) * 0.05);
    m.userData.life = 1.5;
    scene.add(m); drops.push(m);
  }
}
function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.userData.v.y -= 9.8 * dt * 0.6; d.position.addScaledVector(d.userData.v, dt);
    d.userData.life -= dt;
    if (d.userData.life <= 0 || d.position.y < 0) { scene.remove(d); drops.splice(i, 1); }
  }
}

// ---- パパのやらかし：ろくろを回しすぎて器がぐにゃっと倒れる
function papaMishap() {
  const ws = wheelStage;
  ws.sub = 'mishap'; busy = true; gameState.mishapDone = true;
  endContact();
  handAnim = { kind: 'papa', t: 0 };
  say('はやく まわそう!', 'papa');
  after(1.3, () => { sfx.click(); wheel.target = 5.2; });
  after(2.2, () => { camShake = 0.004; });
  after(2.6, () => { clay.slumpDir = Math.random() * 6.28; slumpAnim = 0.001; sfx.squish(); sfx.plop(); say('あっ!', 'papa'); });
  after(3.6, () => { wheel.target = 0.5; sfx.click(); });
  after(4.2, () => { say('あーあ', 'girl'); });
  after(5.4, () => { say('ごめん ごめん', 'papa'); });
  after(6.4, () => { ws.sub = 'reball'; busy = false; handAnim = null; });
}
let slumpAnim = 0;
function reballTap() {
  sfx.slap();
  handAnim = { kind: 'pat', t: 0 };
  clay.reball(0.34);
  if (clay.slump < 0.06) {
    clay.slump = 0; clay.reball(1);
    wheelStage.sub = 'shape2';
    wheel.target = 1.6;
    say('もういっかい!', 'girl');
    sfx.chime();
  }
}
// ---- 切り糸で切り離して完成
function cutWithWire() {
  busy = true; wheelStage.wireReady = false;
  sfx.wire();
  wheel.target = 0.3;
  handAnim = { kind: 'wire', t: 0 };
  const st = clay.stats();
  gameState.kind = st.kind;
  after(1.4, () => {
    wheel.target = 0;
    say('できた!', 'girl'); sfx.chime();
  });
  after(2.6, () => { goStage(dryStage); });
}

// ---- 手の位置（右手は指先が触る点、左手は外から支える）
let handAnim = null;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const TIP = new THREE.Vector3(-0.006, -0.031, 0.112); // press 手の中指の腹（手の座標）
const CUP_PAD = new THREE.Vector3(0.006, -0.04, 0.1);  // cup 手（左手）
function placeHand(h, tipWorld, fwd, up, tipLocal, lerpK) {
  const z = fwd.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  _m.makeBasis(x, y, z);
  _q.setFromRotationMatrix(_m);
  const off = tipLocal.clone().applyQuaternion(_q);
  const pos = tipWorld.clone().sub(off);
  if (lerpK >= 1 || !h.visible) { h.position.copy(pos); h.quaternion.copy(_q); }
  else { h.position.lerp(pos, lerpK); h.quaternion.slerp(_q, lerpK); }
  h.visible = true;
}
const handRest = { r: new THREE.Vector3(), l: new THREE.Vector3() };
function updateHands(dt) {
  const st = stage.name;
  if (st === 'view') return;
  const showWheelHands = st === 'wheel' && hands.press && hands.cup;
  if (!showWheelHands) {
    if (hands.press) hands.press.visible = false;
    if (hands.cup) hands.cup.visible = false;
    if (hands.papa && !(handAnim && handAnim.kind === 'papa')) hands.papa.visible = false;
    return;
  }
  const base = clayHolder.position;
  const camDir = new THREE.Vector3().subVectors(base, camera.position); camDir.y = 0; camDir.normalize();
  const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
  const k = 1 - Math.exp(-dt * 14);
  const sts = wheelStage.stats || clay.stats();
  // 泥のつき具合
  const M = peopleMaterials();
  M.skin.userData.tri.uClay.value = Math.min(1, (M.skin.userData.tri.uClay.value || 0) + (finger.active ? dt * 0.08 : 0));
  if (handAnim && handAnim.kind === 'wet') {
    handAnim.t += dt;
    const p = anim.waterBowl.getWorldPosition(new THREE.Vector3());
    const dip = Math.sin(Math.min(1, handAnim.t / 0.9) * Math.PI);
    const tip = new THREE.Vector3(p.x + 0.01, 0.41 + (1 - dip) * 0.12, p.z);
    placeHand(hands.press, tip, new THREE.Vector3(0.1, -1, -0.4), camDir.clone().negate(), TIP, k);
    if (handAnim.t > 1.0) handAnim = null;
  } else if (handAnim && handAnim.kind === 'pat') {
    handAnim.t += dt;
    const a = Math.sin(Math.min(1, handAnim.t / 0.35) * Math.PI);
    const tip = base.clone().add(new THREE.Vector3(0, 0.05 + clay.stats().top * 0.6 + (1 - a) * 0.04, 0)).addScaledVector(camDir, -0.01);
    placeHand(hands.press, tip, new THREE.Vector3(0, -1, 0.2).add(camDir.clone().multiplyScalar(0.6)), camDir.clone().negate().add(new THREE.Vector3(0, 0.3, 0)), TIP, k);
    const tl = base.clone().addScaledVector(right, -0.075).add(new THREE.Vector3(0, 0.04, 0));
    placeHand(hands.cup, tl, right.clone().add(camDir.clone().multiplyScalar(0.3)), new THREE.Vector3(0, 1, 0).addScaledVector(camDir, -0.4), new THREE.Vector3(0.006, -0.02, 0.105), k);
    if (handAnim.t > 0.4) handAnim = null;
  } else if (handAnim && handAnim.kind === 'wire') {
    handAnim.t += dt;
    const tt = Math.min(1, handAnim.t / 1.1);
    // 糸を手前から奥へ引く
    const wp = base.clone().addScaledVector(camDir, -0.12 + tt * 0.25).add(new THREE.Vector3(0, 0.004, 0));
    anim.wire.position.copy(clayHolder.worldToLocal(wp.clone())).add(clayHolder.position).sub(POS.wheel);
    anim.wire.rotation.y = Math.atan2(right.x, right.z) + Math.PI / 2;
    placeHand(hands.press, wp.clone().addScaledVector(right, 0.1).add(new THREE.Vector3(0, 0.01, 0)), camDir.clone().add(new THREE.Vector3(0, -0.4, 0)), new THREE.Vector3(0, 1, 0), TIP, k);
    placeHand(hands.cup, wp.clone().addScaledVector(right, -0.1).add(new THREE.Vector3(0, 0.01, 0)), camDir.clone().add(new THREE.Vector3(0, -0.4, 0)), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.006, -0.02, 0.105), k);
  } else if (finger.active) {
    // 触る手：手のひらを器の面に向け、中指の腹が触っている点に
    const n = finger.cN.clone().normalize();
    const useLeft = n.dot(right) < -0.35;
    const act = useLeft ? hands.cup : hands.press, sup = useLeft ? hands.press : hands.cup;
    let fwd = camDir.clone().add(new THREE.Vector3(0, 0.25, 0));
    fwd.addScaledVector(n, -fwd.dot(n));
    if (fwd.lengthSq() < 0.08) { fwd = new THREE.Vector3(0, n.y > 0.5 ? 0 : 1, n.y > 0.5 ? 0 : 0).add(camDir.clone().multiplyScalar(n.y > 0.5 ? 1 : 0)); fwd.addScaledVector(n, -fwd.dot(n)); }
    if (n.y > 0.5 || finger.zone === 'inner' || finger.zone === 'floor') { fwd = camDir.clone().add(new THREE.Vector3(0, -0.6, 0)); fwd.addScaledVector(n, -fwd.dot(n) * 0.6); }
    fwd.normalize();
    const ang = finger.phi || 0;
    const rr0 = finger.r + finger.nr * 0.002;
    const tipW = clayHolder.localToWorld(new THREE.Vector3(Math.cos(ang) * rr0, finger.y + finger.ny * 0.002, -Math.sin(ang) * rr0));
    placeHand(act, tipW, fwd, n, useLeft ? CUP_PAD : TIP, k);
    // もう一方の手：反対側から支える（触っている高さに合わせる）
    const side = useLeft ? 1 : -1;
    const ly = Math.min(sts.top * 0.8, Math.max(0.02, finger.y));
    const lr = Math.max(0.03, sampleOuterR(ly)) + 0.003;
    const lt = base.clone().addScaledVector(right, side * lr).add(new THREE.Vector3(0, ly, 0)).addScaledVector(camDir, -0.012);
    const sn = right.clone().multiplyScalar(side);
    const sf = camDir.clone().add(new THREE.Vector3(0, 0.35, 0)); sf.addScaledVector(sn, -sf.dot(sn)); sf.normalize();
    placeHand(sup, lt, sf, sn, useLeft ? TIP : CUP_PAD, k);
  } else {
    // 休めている手：手前の水受けのふち
    const rr = base.clone().addScaledVector(camDir, -0.17).addScaledVector(right, 0.15).add(new THREE.Vector3(0, -0.005, 0));
    placeHand(hands.press, rr, camDir.clone().addScaledVector(right, -0.35).add(new THREE.Vector3(0, -0.15, 0)).normalize(), new THREE.Vector3(0, 1, 0), TIP, k * 0.5);
    const rl = base.clone().addScaledVector(camDir, -0.17).addScaledVector(right, -0.16).add(new THREE.Vector3(0, -0.005, 0));
    placeHand(hands.cup, rl, camDir.clone().addScaledVector(right, 0.35).add(new THREE.Vector3(0, -0.15, 0)).normalize(), new THREE.Vector3(0, 1, 0), CUP_PAD, k * 0.5);
  }
  // パパの手
  if (handAnim && handAnim.kind === 'papa' && hands.papa) {
    handAnim.t += dt;
    const t = handAnim.t;
    const lev = anim.lever.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.14, 0));
    const start = lev.clone().addScaledVector(right, 0.45).add(new THREE.Vector3(0, 0.25, 0.15));
    let tip;
    if (t < 1.2) tip = start.clone().lerp(lev, ease(Math.min(1, t / 1.2)));
    else if (t < 3.8) tip = lev.clone().add(new THREE.Vector3(0, 0, 0.03 * Math.min(1, (t - 1.2) / 0.3)));
    else if (t < 5.6) tip = lev.clone().add(new THREE.Vector3(0, 0.12 + Math.sin(t * 9) * 0.01, 0.05)).addScaledVector(right, 0.05); // ごめんね（頭をかくように上下）
    else tip = lev.clone().lerp(start, ease(Math.min(1, (t - 5.6) / 0.8)));
    placeHand(hands.papa, tip, camDir.clone().add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(right, -0.8), new THREE.Vector3(0, 1, 0).addScaledVector(camDir, -0.3), new THREE.Vector3(-0.009, -0.032, 0.165), 1 - Math.exp(-dt * 10));
    anim.lever.rotation.z = t > 1.2 && t < 3.6 ? THREE.MathUtils.lerp(anim.lever.rotation.z, 0.6, 1 - Math.exp(-dt * 8)) : THREE.MathUtils.lerp(anim.lever.rotation.z, -0.3, 1 - Math.exp(-dt * 6));
  }
}
function sampleOuterR(y) { return clay.outerRAt(y); }

// ================================================================ 乾かす（早回し）
const steam = [];
const steamMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.9, 0.88, 0.85), transparent: true, opacity: 0.0, depthWrite: false });
const dryStage = {
  name: 'dry',
  enter() {
    busy = true; setHint(null);
    cutTo('dry', () => {
      // 板の上へ（ストーブのそば）
      clayHolder.position.set(POS.dryBoard.x, 0.5, POS.dryBoard.z);
      clay.lumpy = 0; clay.offCenter = 0; clay.remesh();
      clay.mesh.position.set(0, 0, 0);
      focusTarget.set(POS.dryBoard.x, 0.56, POS.dryBoard.z);
      post.aperture = 0.004;
      this.t = 0;
      for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(steamMat.clone()); s.userData.ph = Math.random(); scene.add(s); steam.push(s); }
    });
  },
  update(dt) {
    if (fadeDir) return;
    this.t += dt;
    const U = clay.material.userData.U;
    U.uDry.value = Math.min(1, this.t / 4.2);
    U.uBisque.value = Math.min(1, Math.max(0, (this.t - 4.4) / 1.4));
    const st = clay.stats();
    for (const s of steam) {
      const ph = (s.userData.ph + this.t * 0.25) % 1;
      s.position.set(clayHolder.position.x + Math.sin(ph * 9 + s.userData.ph * 20) * 0.02, clayHolder.position.y + st.top + ph * 0.25, clayHolder.position.z + Math.cos(ph * 7) * 0.02);
      s.scale.setScalar(0.03 + ph * 0.12 * (0.6 + s.userData.ph));
      s.material.opacity = Math.sin(ph * Math.PI) * 0.12 * Math.max(0, 1 - this.t / 4);
    }
    if (this.t > 6.4 && !this.done) {
      this.done = true;
      for (const s of steam) scene.remove(s); steam.length = 0;
      goStage(glazeStage);
    }
  },
};

// ================================================================ 場面2・3（釉薬・窯・食卓）は別ファイル
const ctx = {
  THREE, scene, room, anim, camera, clay, clayHolder, hands, people, L, post,
  setShot, cutTo, setHint, hitObj, hitObjFat, setNdc, ray, after, sfx, say, setKiln, hop, clap, nod, tilt,
  focusTarget, get clock() { return clock; }, setBusy: (b) => { busy = b; }, get busy() { return busy; }, goStage: (s) => goStage(s), ease, gameState,
  restart: () => restartGame(),
};
const glazeStage = new GlazeStage(ctx);
const tableStage = new TableStage(ctx);
ctx.glazeStage = glazeStage; ctx.tableStage = tableStage;

function restartGame() {
  // 新しい土で、もう一度ろくろへ
  clay.material.userData.U.uDry.value = 0; clay.material.userData.U.uBisque.value = 0;
  clay.material.userData.U.uGlazeOn.value = 0; clay.material.userData.U.uFired.value = 0; clay.material.userData.U.uHot.value = 0;
  clay.mesh.rotation.set(0, 0, 0); clay.mesh.position.set(0, 0, 0);
  clayHolder.removeFromParent(); scene.add(clayHolder);
  clayHolder.rotation.set(0, 0, 0);
  clayHolder.position.set(POS.wheel.x, POS.wheelHeadY + 0.0012, POS.wheel.z);
  clay.resetLump(1);
  gameState.firstShape = 0;
  peopleMaterials().skin.userData.tri.uClay.value = 0;
  anim.wire.position.set(0.2, 0.455, 0.2); anim.wire.rotation.set(0, 0.5, 0);
  goStage(wheelStage);
}

function goStage(s) {
  stage = s;
  s.enter && s.enter();
}

// ------------------------------------------------------------ ループ
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (DEBUG && window.__fixedDt) dt = window.__fixedDt;
  clock += dt; frameN++;
  runTimers();
  // ろくろ
  wheel.speed += (wheel.target - wheel.speed) * (1 - Math.exp(-dt * 2.2));
  wheel.angle += wheel.speed * Math.PI * 2 * dt;
  if (stage.name === 'wheel' || stage.name === 'intro') {
    clay.mesh.rotation.y = wheel.angle;
    const oc = clay.offCenter + (wheel.speed > 3 ? (wheel.speed - 3) * 0.002 : 0);
    clay.mesh.position.set(Math.cos(wheel.angle) * oc, 0, Math.sin(wheel.angle) * oc);
  }
  anim.wheelHead.rotation.y = wheel.angle;
  setMotor(wheel.speed / 1.6 * 0.6);
  clay.material.userData.U.uBlur.value = stage.name === 'wheel' ? Math.min(0.5, wheel.speed * Math.PI * 2 / 60) : 0;
  if (slumpAnim > 0) {
    slumpAnim = Math.min(1, slumpAnim + dt / 0.9);
    clay.slump = ease(slumpAnim);
    clay.updateGeometry();
    if (slumpAnim >= 1) slumpAnim = 0;
  }
  if (clay.slump > 0 && stage.name === 'wheel' && wheelStage.sub === 'reball') clay.updateGeometry();
  // 部屋の動き
  const t = clock;
  anim.fire.uniforms.uTime.value = t;
  anim.snow.uniforms.uTime.value = t; anim.snow.uniforms.uScale.value = H * renderer.getPixelRatio();
  anim.dust.uniforms.uTime.value = t; anim.dust.uniforms.uScale.value = H * renderer.getPixelRatio();
  const fl = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 7.3 + 1) + 0.08 * Math.sin(t * 23);
  L.fire.intensity = 3.2 * fl; anim.ember.emissiveIntensity = 2.2 * fl; anim.fire.uniforms.uAmp.value = 0.8 + 0.25 * fl;
  setFireLevel(fl);
  updateApron(dt);
  updateMoves(dt);
  stage.update && stage.update(dt);
  updateHands(dt);
  updateDrops(dt);
  updateCamera(dt, t);
  drawHintHand(t);
  post.render(scene, camera, t);
  // 重いときは解像度を下げる（30fps を守る）
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (fps < 34 && quality > 0.6) { quality -= 0.15; resize(); }
    else if (fps > 55 && quality < 1) { quality = Math.min(1, quality + 0.1); resize(); }
    if (DEBUG) window.__fps = fps;
  }
}

// ------------------------------------------------------------ 起動
resize();
setShot('intro', 0);
goStage(introStage);
requestAnimationFrame((n) => { last = n; frame(n); });
setTimeout(() => veil.classList.add('off'), 250);
loadPeople();
// 重いテクスチャは最初の絵が出た後に
setTimeout(() => loadDeferred(), 120);

// デバッグ用（スクリーンショット）
// スクリプトで形を作る（確認用）
function simStroke(zone, path, secs, water = 1) {
  const n = Math.round(secs * 30);
  finger.active = true; finger.hold = 0; finger.prevU = null; finger.water = water; finger.zone = zone;
  const p0 = path(0); finger.r = p0[0]; finger.y = p0[1];
  for (let i = 0; i <= n; i++) {
    const p = path(i / n); finger.tr = p[0]; finger.ty = p[1];
    finger.phi = 0.6; wheel.angle += 1.6 * Math.PI * 2 / 30;
    updateFinger(1 / 30);
  }
  finger.active = false; finger.zone = null;
}
function viewHand(name, yaw = 0, pitch = 0.6, dist = 0.3) {
  const h = hands[name]; if (!h) return 'nohand';
  stage = { name: 'view' };
  for (const k in hands) if (hands[k]) hands[k].visible = false;
  h.visible = true; h.position.set(0.05, 0.62, -0.55); h.rotation.set(0, yaw, 0);
  cam.shot = null; cam.t = 1;
  const c = new THREE.Vector3(0.05, 0.6, -0.5);
  cam.look.copy(c); cam.pos.set(c.x + Math.sin(yaw + 2.5) * dist * Math.cos(pitch), c.y + dist * Math.sin(pitch), c.z + Math.cos(yaw + 2.5) * dist * Math.cos(pitch));
  focusTarget.copy(c);
  return 'ok';
}
if (DEBUG) {
  window.__game = { viewHand, simStroke, updateFinger, goStage, wheelStage, introStage, dryStage, glazeStage, tableStage, clay, finger, setShot, gameState, wearApron, papaMishap, cutWithWire, reballTap, wetHands, people, hands, camera, scene, post, L, renderer, wheel, ctx, restartGame, setFocal: (f) => { focal = f; applyFocal(); } };
}
