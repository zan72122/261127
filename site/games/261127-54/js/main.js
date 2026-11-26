// くだもの わってみよう — 本体
import * as THREE from '../lib/three.module.min.js';
import { makeEnvironment, makeSun } from './env.js';
import { Board, makeCounter, makeCrate, makePlatter, makeKnife, makeTowel, pbr, clothSheet, roundBox, contactBlob } from './props.js';
import { FRUITS, FRUIT_KEYS, CAT_COLORS, fruitMaterials, buildWhole, buildAccessories } from './fruits.js';
import { toArrays } from './slice.js';
import { Piece, makeWhole, cutPiece, Juice } from './pieces.js';
import { tex, setAniso, TEX_FILES } from './tex.js';
import { Sound } from './audio.js';
import { People } from './people.js';
import { Game } from './game.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: /shot/.test(location.search) });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.localClippingEnabled = false;
app.appendChild(renderer.domElement);
setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 60);
const SUN_DIR = new THREE.Vector3(-0.55, 0.62, -0.75).normalize(); // 朝8時ごろ、左うしろから

const world = { scene, camera, renderer, pieces: [], time: 0 };
window.__world = world;

// --- 光 ------------------------------------------------------------------
scene.environment = makeEnvironment(renderer, { sunDir: SUN_DIR });
scene.environmentIntensity = 0.55;
const sun = makeSun(scene, SUN_DIR, { intensity: 3.6, size: 2048 });
world.sun = sun;
// 手前（女の子の後ろ）からの照り返し：手元を暗くしない
const fill = new THREE.DirectionalLight(0xfff1dd, 0.45); fill.position.set(0.2, 0.6, 1.2); scene.add(fill);
scene.fog = new THREE.Fog(0xd8d4c4, 4, 14);

// --- 遠景 ----------------------------------------------------------------
{
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  m.color.setScalar(1.0);
  tex('backdrop', true, t => { m.map = t; m.needsUpdate = true; }, { color: '#b8bc98', pri: 9 });
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), m);
  bd.position.set(0, -0.1, -2.1); scene.add(bd);
  world.backdrop = bd;
  // 地面（石畳）
  const gm = pbr('pavers', { color: '#8a8070', repeat: [5, 4] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), gm);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.744, -0.6); ground.receiveShadow = true; scene.add(ground);
}

// --- 屋台 ----------------------------------------------------------------
const counter = makeCounter(); scene.add(counter);
const board = new Board(0.46, 0.30, 0.024);
const boardGroup = board.group; scene.add(boardGroup);
world.board = board; world.boardGroup = boardGroup;
const crate = makeCrate(); crate.position.set(0, -0.024, -0.37); scene.add(crate);
world.crate = crate;
const platter = makePlatter(0.175); platter.position.set(0.44, -0.024, 0.0); scene.add(platter);
world.platter = platter;
{
  // 屋台の柱と日よけ
  const pm = pbr('crate', { color: '#8a6a48', tint: '#a08060', repeat: [0.3, 3] });
  for (const x of [-1.25, 1.25]) {
    const post = new THREE.Mesh(roundBox(0.07, 2.2, 0.07, 0.006, 1), pm);
    post.position.set(x, 0.36, 0.28); post.castShadow = true; post.receiveShadow = true; scene.add(post);
    const post2 = post.clone(); post2.position.z = -0.6; scene.add(post2);
  }
  const awM = pbr('cotton', { color: '#e8dcc0', repeat: [6, 3] });
  awM.side = THREE.DoubleSide;
  awM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vU0;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvU0 = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vU0;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat sp = step(0.5, fract(vU0.x*9.0)); diffuseColor.rgb *= mix(vec3(1.0,0.97,0.9), vec3(0.62,0.72,0.62), sp);');
  };
  const aw = new THREE.PlaneGeometry(2.8, 1.3, 30, 12);
  const ap = aw.attributes.position;
  for (let i = 0; i < ap.count; i++) { const x = ap.getX(i), y = ap.getY(i); ap.setZ(i, Math.sin((y + 0.65) / 1.3 * Math.PI) * 0.06 + Math.sin(x * 9) * 0.01 * (0.65 - y)); }
  aw.computeVertexNormals();
  const awn = new THREE.Mesh(aw, awM); awn.rotation.x = -Math.PI / 2 + 0.28; awn.position.set(0, 1.45, -0.15); awn.castShadow = true; awn.receiveShadow = true;
  scene.add(awn);
  world.awning = awn;
  // 木箱をもうひとつ（奥）
  const c2 = makeCrate(0.5, 0.33, 0.16); c2.position.set(0.74, -0.024, -0.3); c2.rotation.y = -0.12; scene.add(c2);
  const c3 = makeCrate(0.5, 0.33, 0.16); c3.position.set(-0.74, -0.024, -0.3); c3.rotation.y = 0.1; scene.add(c3); world.crate3 = c3;
  const c4 = makeCrate(0.6, 0.4, 0.2); c4.position.set(-0.95, -0.744, 0.75); c4.rotation.y = 0.4; scene.add(c4); world.crate4 = c4;
  world.crate2 = c2;
}

// --- 果汁・音・人 ---------------------------------------------------------
world.juice = new Juice(world);
world.sound = new Sound();
world.people = new People(world);

// 飾りの果物（さわらない）
function decor(key, parent, pos, q, seed) {
  const d = buildWhole(key, seed); const A = toArrays(d);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(A.P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(A.N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(A.U, 2));
  g.addGroup(0, A.skinCount, 0); g.addGroup(A.skinCount, A.fleshCount, 1);
  const M = fruitMaterials(key);
  const m = new THREE.Mesh(g, [M.skin, M.flesh]); m.castShadow = true; m.receiveShadow = true;
  const grp = new THREE.Group(); grp.add(m);
  for (const a of buildAccessories(key, seed)) grp.add(a.mesh);
  grp.quaternion.copy(q); grp.position.copy(pos);
  // 底を合わせる
  let mn = 1e9; const v = new THREE.Vector3();
  for (let i = 0; i < A.P.length; i += 9) { v.set(A.P[i], A.P[i + 1], A.P[i + 2]).applyQuaternion(q); mn = Math.min(mn, v.y); }
  grp.position.y -= mn;
  parent.add(grp);
  return grp;
}
function fillDecor(crate, key, n, rows, cols) {
  const { w, d } = crate.userData; let k = 0;
  const R = FRUITS[key].R[0];
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    if (k++ >= n) return;
    const x = -w / 2 + 0.03 + R + (w - 0.06 - 2 * R) * (cols > 1 ? j / (cols - 1) : 0.5) + (layer ? R * 0.9 : 0) + (Math.random() - 0.5) * 0.01;
    const z = -d / 2 + 0.03 + R + (d - 0.06 - 2 * R) * (rows > 1 ? i / (rows - 1) : 0.5) + (layer ? R * 0.9 : 0) + (Math.random() - 0.5) * 0.01;
    if (layer && (Math.abs(x) > w / 2 - R * 1.6 || Math.abs(z) > d / 2 - R * 1.6)) continue;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    decor(key, crate, new THREE.Vector3(x, 0.014 + layer * R * 1.6, z), q, k * 13 + 7);
  }
}
fillDecor(world.crate2, 'orange', 18, 3, 5);
fillDecor(world.crate3, 'pomegranate', 12, 3, 4);
fillDecor(world.crate4, 'watermelon', 4, 2, 2);

// --- カメラ（自動） -------------------------------------------------------
const DIAG_FOV = 56; // 40mm 相当
function vfovFor(aspect) {
  const h = 1 / Math.sqrt(1 + aspect * aspect);
  return 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(DIAG_FOV / 2)) * h) * 180 / Math.PI;
}
const camState = { pos: new THREE.Vector3(0, 0.5, 0.5), tgt: new THREE.Vector3(0, 0, -0.05), pos1: new THREE.Vector3(0, 0.5, 0.5), tgt1: new THREE.Vector3(0, 0, -0.05), k: 2.2 };
world.cam = camState;
// 点群が画面に収まる距離を探す（向き dir はターゲット→カメラ）
world.frame = (points, dir, opt = {}) => {
  const aspect = camera.aspect;
  const c = new THREE.Vector3(); for (const p of points) c.add(p); c.multiplyScalar(1 / points.length);
  if (opt.center) c.copy(opt.center);
  const d = dir.clone().normalize();
  const cam = new THREE.PerspectiveCamera(vfovFor(aspect), aspect, 0.01, 50);
  const mx = opt.margin ?? 0.9;
  let lo = 0.15, hi = 6;
  for (let it = 0; it < 24; it++) {
    const D = (lo + hi) / 2;
    cam.position.copy(c).addScaledVector(d, D); cam.lookAt(c.clone().add(new THREE.Vector3(0, D * (opt.lift || 0), 0))); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    let ok = true;
    for (const p of points) { const q = p.clone().project(cam); if (Math.abs(q.x) > mx || Math.abs(q.y) > mx * (opt.my ?? 1) || q.z > 1) { ok = false; break; } }
    if (ok) hi = D; else lo = D;
  }
  const D = Math.max(hi, opt.minD ?? 0);
  return { pos: c.clone().addScaledVector(d, D), tgt: c.clone().add(new THREE.Vector3(0, D * (opt.lift || 0), 0)) };
};
world.setCam = (f, k = 2.2, snap = false) => {
  camState.pos1.copy(f.pos); camState.tgt1.copy(f.tgt); camState.k = k;
  if (snap) { camState.pos.copy(f.pos); camState.tgt.copy(f.tgt); }
};

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, world.maxDpr || 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h; camera.fov = vfovFor(camera.aspect); camera.updateProjectionMatrix();
  world.portrait = h > w * 1.1;
  world.game && world.game.onResize();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
world.maxDpr = 2;
resize();

// --- ゲーム ---------------------------------------------------------------
const game = new Game(world);
world.game = game;
game.start();
resize();

// --- ループ ---------------------------------------------------------------
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
const clock = { dt: 0 };
function loop(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (world.fixedDt) dt = world.fixedDt;
  world.time += dt;
  // カメラは滑らかに追う
  const k = 1 - Math.exp(-camState.k * dt);
  camState.pos.lerp(camState.pos1, k); camState.tgt.lerp(camState.tgt1, k);
  camera.position.copy(camState.pos); camera.lookAt(camState.tgt);
  game.update(dt);
  world.juice.update(dt);
  board.update();
  world.people.update(dt);
  if (!world.skipRender) renderer.render(scene, camera);
  // 重い端末では解像度を下げる
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 2 && !world.fixedDt) {
    const fps = fpsN / fpsAcc;
    if (fps < 34 && world.maxDpr > 1.0) { world.maxDpr = Math.max(1.0, world.maxDpr - 0.25); resize(); }
    fpsAcc = 0; fpsN = 0; fpsT = 0;
  }
  if (!world.manual) requestAnimationFrame(loop);
}
world.step = (n = 1, dt = 1 / 30) => { world.manual = true; world.fixedDt = dt; for (let i = 0; i < n; i++) { world.skipRender = i < n - 1; loop(last + dt * 1000); } world.skipRender = false; };
requestAnimationFrame((t) => { last = t; loop(t); setTimeout(() => document.getElementById('veil').classList.add('off'), 300); });
world.texFiles = TEX_FILES;
