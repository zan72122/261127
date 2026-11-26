// びんのなかのもり — main: renderer, layout, camera, input, tools, scene flow.
import * as THREE from '../lib/three.module.min.js';
import { tex, whenAll, loadPeople, TEX_FILES, setAniso } from './assets.js';
import { buildEnvironment, buildRoom, buildLights, contactShadow, SUN_DIR } from './room.js';
import { Moss, R as MOSS_R, BASE_Y, creekDist, creekDir, trackPoint, HOUSE, groundH } from './moss.js';
import { Jar, JAR } from './jar.js';
import { makeMaterials, makeSprayer, makeDropper, makeMagnifier, pebbleGeometries, twigGeometry, Placer, makeHouse, makeTrack, makeTrain, makeRuleCard, makeDish, makeCup } from './props.js';
import { Hand, Figure, peopleMaterials } from './people.js';
import { Particles } from './particles.js';
import { initAudio, sfx, say } from './audio.js';

const Q = new URLSearchParams(location.search);
const DBG = Q.get('dbg') || '';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!DBG });
const isMobile = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
let pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcbb99c);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 30);
camera.layers.enable(1);

// ------------------------------------------------------------------ world (built after first textures)
let room, lights, moss, jar, M, parts, particles, girl, dad, coatHang, hand, dadHand;
let tools = {}, house, train, stones, twigs, card, cup;
const world = new THREE.Group();
scene.add(world);

async function boot() {
  const first = TEX_FILES.filter((n) => !['moss_dry_c', 'moss_wet_c'].includes(n)).map((n) => tex(n));
  const peopleP = loadPeople();
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.9;
  await whenAll(first);
  parts = await peopleP;
  build();
  resize();
  setState(DBG.startsWith('s') ? DBG : 'intro', true);
  renderer.compile(scene, camera);
  requestAnimationFrame(loop);
  setTimeout(() => { document.getElementById('veil').style.opacity = '0'; }, 120);
  // hi-res moss arrives later
  whenAll([tex('moss_dry_c'), tex('moss_wet_c')]).then(() => moss.setHiRes());
}

function build() {
  room = buildRoom(world);
  lights = buildLights(scene);
  M = makeMaterials();
  moss = new Moss(world, { low: isMobile && Math.min(screen.width, screen.height) < 500 });
  jar = new Jar(world);
  particles = new Particles(scene);
  // miniature town
  house = makeHouse(M);
  world.add(house);
  world.add(makeTrack(M));
  train = { cars: makeTrain(M), u: 0.12, speed: 0, running: false, puff: 0 };
  for (const c of train.cars) world.add(c);
  placeTrain();
  stones = new Placer(world, pebbleGeometries(6), M.stone, 90);
  twigs = new Placer(world, [twigGeometry(0.026, 0.0019), twigGeometry(0.030, 0.0022), twigGeometry(0.023, 0.0017), twigGeometry(0.028, 0.0020)], M.bark, 80);
  // tools on the table
  tools.spray = mkTool('spray', makeSprayer(M), 0.06);
  tools.dropper = mkTool('dropper', makeDropper(M), 0.035);
  tools.magnifier = mkTool('magnifier', makeMagnifier(M), 0.05);
  const dish = makeDish(M);
  dish.children[0].material = M.ceramic.clone(); dish.children[0].material.color.setRGB(0.62, 0.55, 0.48);
  const pebs = pebbleGeometries(4);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(pebs[i % 4], M.stone.clone());
    const tn = 0.45 + Math.random() * 0.35; s.material.color.setRGB(tn, tn * 0.95, tn * 0.86);
    const a = i * 2.4, r = 0.012 + (i % 3) * 0.011;
    s.position.set(Math.cos(a) * r, 0.012 + (i % 2) * 0.003, Math.sin(a) * r);
    s.scale.setScalar(0.005 + Math.random() * 0.002); s.rotation.y = a; s.castShadow = true;
    dish.add(s);
  }
  tools.pebble = mkTool('pebble', dish, 0.06);
  const bundle = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const t = new THREE.Mesh(twigGeometry(0.06 + Math.random() * 0.02, 0.0024), M.bark);
    t.position.set((Math.random() - 0.5) * 0.01, 0.0025 + (i % 3) * 0.003, (i - 3) * 0.0042);
    t.rotation.y = (Math.random() - 0.5) * 0.2; t.castShadow = true; t.receiveShadow = true;
    bundle.add(t);
  }
  const string = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0012, 6, 20), new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.9 }));
  string.rotation.y = Math.PI / 2; string.position.y = 0.004; string.scale.set(1, 0.7, 1);
  bundle.add(string);
  tools.twig = mkTool('twig', bundle, 0.05);
  card = makeRuleCard(M);
  world.add(card);
  cup = makeCup(M);
  world.add(cup);
  // held items (small pebble/twig in fingers)
  tools.pebble.held = new THREE.Mesh(pebs[0], M.stone); tools.pebble.held.scale.setScalar(0.0045); tools.pebble.held.castShadow = true;
  tools.twig.held = new THREE.Mesh(twigGeometry(0.028, 0.002), M.bark); tools.twig.held.castShadow = true;
  for (const k of ['pebble', 'twig']) { tools[k].held.visible = false; tools[k].held.layers.set(1); scene.add(tools[k].held); }
  // people
  const pm = peopleMaterials();
  girl = new Figure(parts.girl, pm);
  girl.coat = girl.addSkinnedLayer(parts.coat, pm[2]);
  girl.coat.visible = false;
  girl.group.position.set(-0.12, -0.72, 0.60);
  world.add(girl.group);
  const dm = peopleMaterials();
  dad = new Figure(parts.dad, dm);
  dad.group.position.set(0.42, -0.72, 0.66);
  dad.group.rotation.y = -0.35;
  world.add(dad.group);
  coatHang = new THREE.Mesh(parts.coathang.geometry, pm[2]);
  coatHang.castShadow = true; coatHang.receiveShadow = true;
  coatHang.position.set(-0.62, -0.72 + 0.62, 0.50);
  coatHang.rotation.y = 0.5;
  world.add(coatHang);
  const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 10), M.wood);
  hanger.rotation.z = Math.PI / 2; hanger.position.set(0, 0.835, 0.0); coatHang.add(hanger);
  // stand for the coat (simple turned pole)
  room.rack.position.set(-0.62, -0.72, 0.48);
  for (const fig of [girl, dad]) { const s = contactShadow(fig === dad ? 0.6 : 0.4, 0.4, 0.5); s.position.set(0, 0.002, -0.02); fig.group.add(s); }
  // foreground hands
  hand = new Hand(parts.hand, parts.sleeve, 1);
  hand.group.traverse((o) => o.layers.set(1));
  hand.group.visible = false;
  scene.add(hand.group);
  const flannel = pm[9];
  dadHand = new Hand(parts.hand, parts.sleeve, 1.42, [0.93, 0.86, 0.82], flannel);
  dadHand.group.traverse((o) => o.layers.set(1));
  dadHand.group.visible = false;
  dadHand.setPose('grip');
  scene.add(dadHand.group);
  dadHand.tool = makeSprayer(M, 1.25);
  dadHand.tool.traverse((o) => o.layers.set(1));
  dadHand.tool.visible = false;
  scene.add(dadHand.tool);
  // halos for "touch me" glow
  for (const t of Object.values(tools)) t.halo = mkHalo(t.r * 2.6);
  lid.halo = mkHalo(0.30);
  coatHalo = mkHalo(0.5);
  initLens();
  layoutTable();
}

// ------------------------------------------------------------------ tools on the table
let coatHalo;
const lid = { get obj() { return jar.lid; } };
function mkTool(name, obj, r) {
  world.add(obj);
  const sh = contactShadow(r * 2.4, r * 2.4, 0.45);
  world.add(sh);
  return { name, obj, r, home: new THREE.Vector3(), homeRot: 0, homeTilt: 0, shadow: sh, enabled: false, inHand: false };
}
let _haloTex;
function mkHalo(size) {
  if (!_haloTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,248,225,0.0)'); g.addColorStop(0.45, 'rgba(255,248,225,0.55)'); g.addColorStop(0.7, 'rgba(255,245,215,0.25)'); g.addColorStop(1, 'rgba(255,240,210,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    _haloTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _haloTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  s.scale.setScalar(size); s.renderOrder = 20;
  scene.add(s);
  return s;
}

let portrait = false;
function layoutTable() {
  // portrait: tools in a row in front of the jar; landscape: on both sides
  const L = portrait ? {
    spray: [0.215, 0, 0.13, 0.5, 0], dropper: [0.12, 0.0055, 0.255, 0.9, 1], magnifier: [0.02, 0.006, 0.27, -0.3, 2],
    pebble: [-0.14, 0, 0.23, 0, 0], twig: [-0.215, 0, 0.10, 0.9, 0], card: [0.24, 0, -0.17, -0.45], cup: [0.23, 0, -0.02], lid: [-0.27, 0.0045, -0.12],
  } : {
    spray: [0.255, 0, 0.03, 0.6, 0], dropper: [0.23, 0.0055, 0.165, 0.7, 1], magnifier: [-0.235, 0.006, 0.02, -0.3, 2],
    pebble: [-0.22, 0, 0.16, 0, 0], twig: [-0.27, 0, -0.10, 1.1, 0], card: [0.27, 0, -0.18, -0.5], cup: [0.33, 0, -0.08], lid: [-0.40, 0.0045, -0.23],
  };
  for (const [k, t] of Object.entries(tools)) {
    const [x, y, z, ry, lie] = L[k];
    t.home.set(x, y, z); t.homeRot = ry; t.lie = lie;
    t.shadow.position.set(x, 0.0006, z);
    if (!t.inHand) placeHome(t);
  }
  card.position.set(L.card[0], 0, L.card[2]); card.rotation.y = L.card[3];
  cup.position.set(L.cup[0], 0, L.cup[2]);
  jar.lidHome.set(L.lid[0], L.lid[1], L.lid[2]);
  if (jar.lidState === 0 && !jar.lidAnim) { jar.lid.position.copy(jar.lidHome); }
  jar.lidShadow.position.set(L.lid[0], 0.0006, L.lid[2]);
}
function placeHome(t) {
  t.obj.position.copy(t.home);
  t.obj.rotation.set(0, t.homeRot, 0);
  if (t.lie === 1) { t.obj.rotation.set(0, t.homeRot, Math.PI / 2 - 0.06); t.obj.position.y = 0.0095; }
  if (t.lie === 2) { t.obj.rotation.set(-Math.PI / 2, 0, t.homeRot, 'XZY'); t.obj.position.y = 0.0068; }
  t.obj.visible = true;
}

// ------------------------------------------------------------------ magnifier lens (render-to-texture)
let lensRT, lensCam, lensMat;
function initLens() {
  lensRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 2 });
  lensCam = new THREE.PerspectiveCamera(10, 1, 0.01, 10);
  lensMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: lensRT.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D uTex; varying vec2 vUv;
      void main(){
        vec2 q = vUv * 2.0 - 1.0; float r = length(q);
        vec2 d = q * (1.0 - 0.10 * r * r);
        vec3 c;
        c.r = texture2D(uTex, d * 1.004 * 0.5 + 0.5).r;
        c.g = texture2D(uTex, d * 0.5 + 0.5).g;
        c.b = texture2D(uTex, d * 0.996 * 0.5 + 0.5).b;
        c *= 1.0 - 0.35 * smoothstep(0.75, 1.0, r);
        c += vec3(0.9, 0.95, 1.0) * smoothstep(0.35, 0.0, length(q - vec2(-0.45, 0.5))) * 0.35;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  tools.magnifier.obj.userData.lens.material = lensMat;
  tools.magnifier.obj.userData.lens.visible = false;
}

// ------------------------------------------------------------------ camera shots
const shots = {
  intro: { dir: V3(0.1, -0.30, -1), target: V3(-0.12, 0.0, 0.30), pts: () => [V3(-0.70, 0.25, 0.5), V3(-0.62, -0.40, 0.5), V3(-0.12, 0.42, 0.6), V3(-0.12, -0.72, 0.6), V3(0, 0.28, 0), V3(0.2, 0, -0.1), V3(0.38, 0.6, 0.66)] },
  play: { dir: V3(0, -0.47, -1), target: V3(0, 0.085, 0.02), pts: () => playPts() },
  cheer: { dir: V3(0.12, -0.32, -1), target: V3(0.0, 0.05, 0.3), pts: () => [V3(-0.28, 0.46, 0.6), V3(-0.12, -0.35, 0.6), V3(0.16, 0.27, 0), V3(-0.16, 0, 0), V3(0.5, 0.75, 0.66)] },
};
function playPts() {
  const p = [V3(-0.165, 0.27, 0), V3(0.165, 0.27, 0), V3(0, 0.27, -0.16), V3(-0.165, 0.0, 0.02), V3(0.165, 0.0, 0.02), V3(0, 0.0, 0.17), V3(0.08, 0.315, 0.12)];
  for (const t of Object.values(tools)) p.push(t.home.clone().add(V3(0, 0.02, 0)));
  return p;
}
const cam = { pos: V3(0, 0.4, 1.8), tgt: V3(0, 0, 0), from: null, to: null, t: 1, dur: 1.6, shot: 'intro' };
function shotPose(name) {
  const s = shots[name];
  const dir = s.dir.clone().normalize();
  const right = dir.clone().cross(UP).normalize();
  const up = right.clone().cross(dir).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  const m = name === 'play' ? 0.99 : 0.92;
  let d = 0.2;
  for (const p of s.pts()) {
    const q = p.clone().sub(s.target);
    const x = q.dot(right), y = q.dot(up), z = q.dot(dir);
    d = Math.max(d, Math.abs(x) / (tanH * m) - z, Math.abs(y) / (tanV * m) - z);
  }
  // the play view leans a little to keep the jar mouth in the upper-middle
  return { pos: s.target.clone().addScaledVector(dir, -d), tgt: s.target.clone() };
}
function goShot(name, dur = 1.6, instant = false) {
  const p = shotPose(name);
  cam.shot = name;
  if (instant) { cam.pos.copy(p.pos); cam.tgt.copy(p.tgt); cam.t = 1; return; }
  cam.from = { pos: cam.pos.clone(), tgt: cam.tgt.clone() };
  cam.to = p; cam.t = 0; cam.dur = dur;
}
function updateCamera(dt) {
  if (cam.t < 1 && cam.to) {
    cam.t = Math.min(1, cam.t + dt / cam.dur);
    const e = ease(cam.t);
    cam.pos.lerpVectors(cam.from.pos, cam.to.pos, e);
    cam.tgt.lerpVectors(cam.from.tgt, cam.to.tgt, e);
    // gentle arc
    cam.pos.y += Math.sin(cam.t * Math.PI) * 0.05;
  }
  const showPeople = cam.shot !== 'play' || cam.t < 0.55;
  girl.group.visible = dad.group.visible = showPeople;
  // tiny breathing handheld drift (real camera feel)
  const t = clock.elapsedTime * (DBG ? 0 : 1);
  camera.position.copy(cam.pos).add(V3(Math.sin(t * 0.37) * 0.0012, Math.sin(t * 0.53) * 0.0009, 0));
  camera.lookAt(cam.tgt);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const f = 38; // mm, on the long side of a 36mm frame
  if (w >= h) camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(18 / f / camera.aspect));
  else camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(18 / f));
  camera.updateProjectionMatrix();
  const wasPortrait = portrait;
  portrait = h > w;
  if (M && wasPortrait !== portrait) layoutTable();
  if (cam.shot && M && shots[cam.shot]) {
    const p = shotPose(cam.shot);
    if (cam.t >= 1) { cam.pos.copy(p.pos); cam.tgt.copy(p.tgt); } else cam.to = p;
  }
  particles && (particles.mat.uniforms.uScale.value = h * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
  moss && (moss.dropMat.uniforms.uScale.value = h * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
}
window.addEventListener('resize', () => setTimeout(resize, 60));

// ------------------------------------------------------------------ game state
const G = {
  state: 'loading', t: 0, held: null, pressing: false, idle: 0, sprayAcc: 0, pumpT: 0,
  dadDone: false, dadT: 0, cheerNext: null, floodStart: 0, huhT: 0,
  path: null, lastPlace: null, lastTwig: null, bridges: [], stoneGoal: 14,
  wipeLen: 0, fogT: 0, houseHover: 0, trainHover: 0, lit: false, dropFill: 0, emptying: 0,
  target: V3(0, BASE_Y, 0.02), touchPoint: null, lastUV: null, squeakT: 0,
};
function setState(s, instant = false) {
  G.state = s; G.t = 0; G.idle = 0;
  if (s === 'intro') { goShot('intro', 1, true); enableTools([]); }
  if (s === 's1') { goShot('play', 2.2, instant); enableTools(['spray']); girl.coat.visible = true; coatHang.visible = false; room.rack.visible = true; }
  if (s === 's2') { goShot('play', 2.0, instant); enableTools(['pebble', 'twig']); girl.coat.visible = true; coatHang.visible = false; }
  if (s === 's3') { goShot('play', 2.0, instant); enableTools(['magnifier']); girl.coat.visible = true; coatHang.visible = false; }
  if (s === 'free') { goShot('play', 2.0, instant); enableTools(['spray', 'pebble', 'twig', 'dropper', 'magnifier']); }
  if (instant && DBG) debugPrep(s);
}
function enableTools(list) {
  for (const [k, t] of Object.entries(tools)) t.enabled = list.includes(k);
}

// celebration: camera pulls back, girl hops & claps, dad nods; then next state
function cheer(next) {
  G.state = 'cheer'; G.t = 0; G.cheerNext = next;
  releaseTool();
  hand.group.visible = false;
  goShot('cheer', 1.4);
  setTimeout(() => { sfx.fanfare(); say('やったー!'); }, 700);
}

// ------------------------------------------------------------------ input
const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();
let pointerId = null;
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  if (pointerId !== null) return;
  pointerId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* */ }
  G.idle = 0;
  setNDC(e);
  onDown();
});
canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== pointerId) return; setNDC(e); G.idle = 0; onMove(); });
const up = (e) => { if (e.pointerId !== pointerId) return; pointerId = null; onUp(); };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
document.addEventListener('gesturestart', (e) => e.preventDefault());

function setNDC(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  G.screen = { x: e.clientX, y: e.clientY };
}
function screenOf(p) {
  const v = p.clone().project(camera);
  return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, z: v.z };
}
function hitTool(px, py) {
  let best = null, bd = 1e9;
  const cands = Object.values(tools).filter((t) => t.enabled && !t.inHand).map((t) => ({ t, p: t.home.clone().add(V3(0, t.name === 'spray' ? 0.07 : 0.012, 0)), r: t.r }));
  if (canTapLid()) cands.push({ t: 'lid', p: jar.lid.position.clone(), r: 0.12 });
  for (const c of cands) {
    const s = screenOf(c.p);
    const rr = Math.max(48, pxPerMeter(c.p) * c.r * 1.3);
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < rr && d < bd) { bd = d; best = c.t; }
  }
  return best;
}
function pxPerMeter(p) {
  const d = camera.position.distanceTo(p);
  return window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d);
}
function canTapLid() {
  if (!jar || jar.lidAnim) return false;
  if (G.state === 's2') return jar.lidState === 0 && G.s2ready;
  if (G.state === 'free') return true;
  return false;
}

function onDown() {
  const s = G.state;
  if (s === 'intro') {
    const sc = screenOf(coatHang.position.clone().add(V3(0, 0.55, 0)));
    const sg = screenOf(girl.group.position.clone().add(V3(0, 0.8, 0)));
    const dc = Math.hypot(sc.x - G.screen.x, sc.y - G.screen.y), dg = Math.hypot(sg.x - G.screen.x, sg.y - G.screen.y);
    if (dc < Math.max(90, pxPerMeter(coatHang.position) * 0.35) || dg < 80) dress();
    return;
  }
  if (!['s1', 's2', 's3', 'free'].includes(s)) return;
  const t = hitTool(G.screen.x, G.screen.y);
  if (t === 'lid') { toggleLid(); return; }
  if (t) { takeTool(t); return; }
  G.pressing = true;
  G.path = [];
  G.lastPlace = null; G.lastTwig = null; G.lastUV = null;
  if (!G.held) hand.setPose('point');
  onMove();
}
function onMove() {
  if (!G.pressing) return;
  ray.setFromCamera(ndc, camera);
  // fog wiping on closed jar / finger on glass
  if (!G.held && jar.lidState === 1) {
    const h = jar.raycastGlass(ray.ray);
    if (h) {
      G.touchGlass = h.point;
      if (G.lastUV && jar.fogAmt > 0.2) {
        jar.wipe(G.lastUV, h.uv);
        const sp = G.lastUV.distanceTo(h.uv);
        G.wipeLen += sp;
        if (G.squeakT <= 0 && sp > 0.004) { sfx.squeak(sp * 40); G.squeakT = 0.09; }
      }
      G.lastUV = h.uv.clone();
      return;
    }
    G.lastUV = null;
  }
  let p = moss.raycast(ray.ray);
  if (!p) {
    // project onto the bed plane, clamp into the jar
    const t = (BASE_Y + 0.01 - ray.ray.origin.y) / ray.ray.direction.y;
    if (t > 0) {
      p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
      const r = Math.hypot(p.x, p.z);
      if (r > MOSS_R - 0.006) { p.x *= (MOSS_R - 0.006) / r; p.z *= (MOSS_R - 0.006) / r; }
      p.y = moss.surfaceAt(p.x, p.z);
    }
  }
  if (p) { G.touchPoint = p; G.path.push(p.clone()); }
}
function onUp() {
  G.pressing = false;
  G.touchGlass = null;
  if (!G.held) hand.setPose('relax');
  if (G.held === 'dropper' && G.dropFill > 0.25) G.emptying = 1.2;
}

function takeTool(t) {
  if (G.held === t.name) return;
  releaseTool();
  G.held = t.name;
  t.inHand = true;
  t.shadow.visible = false;
  sfx.pick();
  hand.group.visible = true;
  if (t.name === 'pebble' || t.name === 'twig') { t.held.visible = true; hand.setPose('pinch'); }
  else if (t.name === 'spray') hand.setPose('grip');
  else if (t.name === 'dropper') hand.setPose('pinch');
  else if (t.name === 'magnifier') { hand.setPose('hold'); t.obj.userData.lens.visible = true; }
  G.handPos = null;
}
function releaseTool() {
  if (!G.held) return;
  const t = tools[G.held];
  t.inHand = false; t.shadow.visible = true;
  if (t.held) t.held.visible = false;
  if (t.name === 'magnifier') t.obj.userData.lens.visible = false;
  placeHome(t);
  G.held = null;
  hand.setPose('relax');
}

function toggleLid() {
  if (jar.lidState === 0) {
    releaseTool();
    jar.closeLid(() => { sfx.clink(); });
    sfx.swoosh();
  } else {
    jar.openLid(() => sfx.clink());
  }
}

function dress() {
  G.state = 'dress'; G.t = 0;
  sfx.swoosh();
  say('けんきゅういん!');
}

// ------------------------------------------------------------------ tool usage per frame
const tmpM = new THREE.Matrix4();
const camF = new THREE.Vector3(), camR = new THREE.Vector3();
function camBasis() {
  camera.getWorldDirection(camF); camF.y = 0; camF.normalize();
  camR.copy(camF).cross(UP).normalize();
}
function basis(yAxis, zAxis) {
  const y = yAxis.clone().normalize();
  const z = zAxis.clone().addScaledVector(y, -zAxis.dot(y)).normalize();
  const x = y.clone().cross(z);
  return new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(x, y, z));
}
// fingertip & pinch points in hand-local space (computed from the posed skeleton)
function handLocal(h, boneName, ext = 0.012) {
  h.mesh.updateMatrixWorld(true);
  const b = h.b[boneName];
  const p = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  const ch = b.children[0];
  let tip;
  if (ch) tip = new THREE.Vector3().setFromMatrixPosition(ch.matrixWorld);
  else {
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
    tip = p.clone().addScaledVector(dir, ext * h.group.scale.x);
  }
  return h.group.worldToLocal(tip);
}

function updateTools(dt) {
  camBasis();
  const held = G.held;
  const pressing = G.pressing && ['s1', 's2', 's3', 'free'].includes(G.state);
  // target point: where the finger is (or a resting point near the jar)
  const rest = V3(0.10, BASE_Y + 0.05, 0.11);
  let tgt = pressing && G.touchPoint ? G.touchPoint.clone() : null;
  if (G.emptying > 0) tgt = null;
  hand.update(dt);

  if (!held) {
    if (pressing && (G.touchPoint || G.touchGlass)) {
      hand.group.visible = true;
      const tipL = handLocal(hand, 'index2', 0.012);
      let q, at;
      if (G.touchGlass) {
        const n = V3(G.touchGlass.x, 0, G.touchGlass.z).normalize();
        at = G.touchGlass.clone().addScaledVector(n, 0.004);
        q = basis(n.clone().negate().addScaledVector(UP, 0.3).addScaledVector(camR, -0.65), n.clone().addScaledVector(UP, 0.6).addScaledVector(camR, 0.3));
      } else {
        at = G.touchPoint.clone().add(V3(0, 0.002, 0));
        q = basis(V3(0, -1, 0).addScaledVector(camF, 0.7).addScaledVector(camR, -0.45), camF.clone().negate().addScaledVector(UP, 0.5));
        // gentle press: moss under the fingertip gets a touch of moisture from the skin? no - just a pat
      }
      placeHand(hand, q, tipL, at, dt);
    } else hand.group.visible = false;
    return;
  }
  const t = tools[held];
  hand.group.visible = true;
  if (held === 'spray') {
    // nozzle aims at the target from up/front-right
    const aimAt = tgt || V3(0.02, BASE_Y, 0.0);
    // nozzle stays above the jar mouth (front-right), the bottle outside the glass
    const tipW = tgt ? V3(0.075 + aimAt.x * 0.3, JAR.h + 0.03, 0.095 + aimAt.z * 0.25) : V3(0.17, JAR.h + 0.02, 0.17);
    const dir = aimAt.clone().sub(tipW).normalize();
    // tool orientation: -Z along dir, up ~ world up
    const zt = dir.clone().negate();
    const yt = UP.clone().addScaledVector(zt, -UP.dot(zt)).normalize();
    const qt = new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(yt.clone().cross(zt), yt, zt));
    smoothTool(t.obj, tipW.clone().sub(t.obj.userData.tip.clone().applyQuaternion(qt)), qt, dt, 12);
    // hand: wraps the neck from the right/behind, index on top near the trigger, arm toward the camera-right
    const gripC = V3(0, 0.124, 0.002).applyQuaternion(t.obj.quaternion).add(t.obj.position);
    const xh = V3(0, -1, 0).applyQuaternion(t.obj.quaternion);
    const yh = V3(-0.35, 0, -1).applyQuaternion(t.obj.quaternion);
    const zh = yh.clone().normalize().cross(xh).negate();
    const qh = basis(yh, xh.clone().cross(yh).normalize());
    placeHand(hand, qh, V3(0.0, 0.05, -0.021), gripC, dt, true);
    if (pressing && tgt) {
      G.pumpT -= dt;
      if (G.pumpT <= 0) { G.pumpT = 0.3; pump(t.obj, dir); }
    }
    const tr = t.obj.userData.trigger;
    const pullT = Math.max(0, G.pumpT - 0.18) / 0.12;
    tr.rotation.x = -pullT * 0.35;
    hand.squeeze = pullT;
  } else if (held === 'pebble' || held === 'twig') {
    const q = basis(V3(-0.25, -0.55, 0).addScaledVector(camF, 0.8).addScaledVector(camR, -0.35), UP.clone().addScaledVector(camF, -0.6).addScaledVector(camR, 0.25));
    const iTip = handLocal(hand, 'index2', 0.011), tTip = handLocal(hand, 'thumb2', 0.010);
    const pinch = iTip.clone().add(tTip).multiplyScalar(0.5);
    const at = tgt ? tgt.clone().add(V3(0, 0.016, 0)) : rest.clone();
    placeHand(hand, q, pinch, at, dt);
    const heldObj = t.held;
    heldObj.position.copy(pinch).applyMatrix4(hand.group.matrixWorld);
    heldObj.quaternion.copy(hand.group.quaternion);
    if (held === 'twig') heldObj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), Math.PI / 2));
    if (pressing && tgt) placeAlong(held, tgt);
  } else if (held === 'dropper') {
    let at = tgt ? tgt.clone() : rest.clone();
    if (G.emptying > 0) {
      G.emptying -= dt;
      at = cup.position.clone().add(V3(0, 0.09, 0));
      if (G.emptying < 0.8 && G.dropFill > 0) {
        const d = Math.min(G.dropFill, dt * 2.2);
        G.dropFill -= d;
        cup.userData.water.scale.y = Math.min(0.06, cup.userData.water.scale.y + d * 0.012);
        hand.squeeze = 1;
        if (Math.random() < 0.3) sfx.drip();
        particles.emit(1, t.obj.position.clone(), V3(0, -0.2, 0), 0.25, 0.0025);
      }
      if (G.emptying <= 0) { G.emptying = 0; G.dropFill = 0; }
    }
    // tool vertical-ish, leaning back toward camera
    const yt = UP.clone().addScaledVector(camF, -0.2).addScaledVector(camR, 0.15).normalize();
    const zt = camF.clone().negate();
    const qt = basis(yt, zt);
    smoothTool(t.obj, at.clone().add(V3(0, 0.004, 0)), qt, dt, 14);
    const q = basis(V3(-0.6, -0.2, 0).addScaledVector(camF, 0.7), UP.clone().addScaledVector(camF, -0.4).addScaledVector(camR, 0.5));
    const iTip = handLocal(hand, 'index2', 0.011), tTip = handLocal(hand, 'thumb2', 0.010);
    const pinch = iTip.clone().add(tTip).multiplyScalar(0.5);
    const bulb = V3(0, 0.106, 0).applyQuaternion(t.obj.quaternion).add(t.obj.position);
    placeHand(hand, q, pinch, bulb, dt, true);
    // suck water
    let sq = 0;
    if (pressing && tgt && G.emptying <= 0) {
      const got = moss.suck(tgt.x, tgt.z, 0.014, dt * 0.0045);
      if (got > 0) {
        G.dropFill = Math.min(1, G.dropFill + got * 9);
        sq = 0.6 + 0.4 * Math.sin(clock.elapsedTime * 12);
        G.slurpT = (G.slurpT || 0) - dt;
        if (G.slurpT <= 0) { sfx.slurp(); G.slurpT = 0.35; }
      }
      if (G.dropFill >= 1) G.emptying = 1.2;
    }
    if (G.emptying <= 0) hand.squeeze += ((pressing ? 0.3 + sq * 0.7 : 0) - hand.squeeze) * Math.min(1, dt * 10);
    const b = t.obj.userData.bulb;
    b.scale.set(1 - hand.squeeze * 0.25, 1, 1 - hand.squeeze * 0.15);
    const w = t.obj.userData.water;
    w.scale.y = Math.max(0.0001, G.dropFill * 0.055);
    w.position.y = 0.022 + w.scale.y / 2;
  } else if (held === 'magnifier') {
    const at = tgt ? tgt.clone() : rest.clone().add(V3(-0.05, 0, 0));
    // lens floats between eye and target, facing the camera
    const toCam = camera.position.clone().sub(at).normalize();
    const lensC = at.clone().addScaledVector(toCam, tgt ? 0.085 : 0.05);
    const qt = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, lensC, UP));
    // lookAt gives -Z toward lens, we want +Z (lens normal) toward the camera
    const qL = basis(UP.clone().addScaledVector(toCam, -UP.dot(toCam)).applyAxisAngle(toCam, -0.35), toCam);
    smoothTool(t.obj, lensC, qL, dt, 12);
    // fist around the handle: handle axis = hand X, palm faces camera-left
    const handleW = V3(0, -0.095, 0).applyQuaternion(t.obj.quaternion).add(t.obj.position);
    const hy = V3(-1, 0, 0).applyQuaternion(t.obj.quaternion).negate(); // fingers wrap toward -tool X
    const hz = toCam.clone().negate().addScaledVector(V3(1, 0, 0).applyQuaternion(t.obj.quaternion), 0.3);
    const qh = basis(V3(0, 0, -1).applyQuaternion(t.obj.quaternion).addScaledVector(V3(1, 0, 0).applyQuaternion(t.obj.quaternion), -0.6), V3(1, 0, 0).applyQuaternion(t.obj.quaternion).addScaledVector(toCam, 0.3));
    const fist = V3(0.003, 0.046, -0.02);
    hand.group.quaternion.copy(qh);
    hand.group.position.copy(handleW).sub(fist.clone().applyQuaternion(qh));
    if (tgt) lensHover(tgt, dt);
  }
}
function placeHand(h, q, localPt, worldAt, dt, instant = false) {
  h.group.quaternion.copy(q);
  const p = worldAt.clone().sub(localPt.clone().multiplyScalar(h.group.scale.x).applyQuaternion(q));
  if (!G.handPos || instant) G.handPos = p.clone();
  G.handPos.lerp(p, 1 - Math.exp(-dt * 16));
  h.group.position.copy(instant ? p : G.handPos);
  h.group.updateMatrixWorld(true);
}
function smoothTool(obj, pos, q, dt, k) {
  const a = 1 - Math.exp(-dt * k);
  obj.position.lerp(pos, a);
  obj.quaternion.slerp(q, a);
  obj.updateMatrixWorld(true);
}

// spray pump: a cone of fine mist
function pump(obj, dir) {
  G.pumps = (G.pumps || 0) + 1;
  sfx.spray();
  const tip = obj.userData.tip.clone().applyMatrix4(obj.matrixWorld);
  const n = 150;
  const lingering = G.state === 's3' || G.state === 'free';
  for (let i = 0; i < n; i++) {
    const spread = 0.17 * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    const ortho1 = dir.clone().cross(UP).normalize(), ortho2 = dir.clone().cross(ortho1).normalize();
    const d = dir.clone().addScaledVector(ortho1, Math.cos(a) * spread).addScaledVector(ortho2, Math.sin(a) * spread).normalize();
    const sp = 0.9 + Math.random() * 1.0;
    if (i % 5 === 0) {
      // a few larger droplets that catch the sun
      particles.emit(1, tip, d.clone().multiplyScalar(sp * 0.8), 1.0, 0.0009 + Math.random() * 0.0012, 0.9);
    } else {
      const sz = 0.003 + Math.pow(Math.random(), 2) * 0.009;
      particles.emit(0, tip, d.multiplyScalar(sp), 0.9 + Math.random() * 1.0, sz, 0.35 + Math.random() * 0.4);
    }
  }
  if (lingering) {
    for (let i = 0; i < 10; i++) {
      const p = tip.clone().addScaledVector(dir, 0.04 + Math.random() * 0.06);
      particles.emit(2, p, dir.clone().multiplyScalar(0.05).add(V3((Math.random() - 0.5) * 0.02, -0.01, (Math.random() - 0.5) * 0.02)), 5 + Math.random() * 4, 0.012 + Math.random() * 0.01, 0.25);
    }
  }
  // spraying the flood again -> "huh?"
  if (G.state === 's1' && G.dadDone && G.touchPoint && moss.waterAt(G.touchPoint.x, G.touchPoint.z) > 0.0008 && G.huhT <= 0) {
    G.huhT = 3; sfx.oops(); say('あれ?'); G.huhWobble = 1;
  }
}

// particle collisions: moss, glass, table
function collide(x, y, z, kind, size) {
  const r = Math.hypot(x, z);
  G.cc = G.cc || {}; const key = r < JAR.ri - 0.001 ? (y < BASE_Y + 0.05 ? 'low' : 'in') : (r < JAR.r + 0.002 && y < JAR.h && y > 0 ? 'glass' : 'out'); G.cc[key] = (G.cc[key] || 0) + 1;
  if (r < JAR.ri - 0.001) {
    if (jar.lidState === 1 && y > JAR.h - 0.004) return true;
    if (y < BASE_Y + 0.05) {
      const h = moss.heightAt(x, z) + 0.002;
      if (y <= h) {
        if (kind === 0) moss.addWet(x, z, 0.012 + size * 4, 0.0085);
        else if (G.dadT > 0) { moss.addWater(x, z, 0.00055, 0.010); if (Math.random() < 0.05) sfx.drip(); }
        else moss.addWet(x, z, 0.03, 0.005);
        return true;
      }
    }
  } else if (r < JAR.r + 0.002 && y < JAR.h && y > 0) {
    if (kind === 0 && Math.random() < 0.3) jar.mistHit(V3(x, y, z));
    return true;
  }
  if (y < 0) return true;
  return false;
}

// placing stones / twigs along the traced path
function placeAlong(kind, p) {
  if (Math.hypot(p.x, p.z) > MOSS_R - 0.006) return;
  if (Math.hypot(p.x - HOUSE.x, p.z - HOUSE.z) < 0.026) return;
  if (kind === 'pebble') {
    if (G.lastPlace && G.lastPlace.distanceTo(p) < 0.0085) return;
    const s = 0.0032 + Math.random() * 0.0028;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.3, Math.random() * 6.28, (Math.random() - 0.5) * 0.3));
    const pos = V3(p.x + (Math.random() - 0.5) * 0.002, moss.heightAt(p.x, p.z) + s * 0.18, p.z + (Math.random() - 0.5) * 0.002);
    const tone = 0.42 + Math.random() * 0.4;
    const col = new THREE.Color(tone, tone * (0.92 + Math.random() * 0.08), tone * (0.82 + Math.random() * 0.12));
    stones.add(pos, q, V3(s, s, s), col);
    G.lastPlace = p.clone();
  } else {
    if (!G.lastTwig) { G.lastTwig = p.clone(); return; }
    const d = G.lastTwig.distanceTo(p);
    // bridge: crossing the creek
    const mid = G.lastTwig.clone().lerp(p, 0.5);
    const sideA = creekSide(G.lastTwig), sideB = creekSide(p);
    if (sideA !== sideB && d > 0.006) {
      const cross = findCrossing(G.lastTwig, p);
      if (cross && !G.bridges.some((b) => b.distanceTo(cross) < 0.03)) buildBridge(cross);
      G.lastTwig = p.clone();
      return;
    }
    if (d < 0.024) return;
    if (creekDist(mid.x, mid.z) < 0.012) { G.lastTwig = p.clone(); return; }
    const ang = Math.atan2(p.z - G.lastTwig.z, p.x - G.lastTwig.x);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -ang + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.1));
    twigs.add(V3(mid.x, moss.heightAt(mid.x, mid.z) + 0.0012, mid.z), q, V3(1, 1, 1), null);
    G.lastTwig = p.clone();
  }
}
function creekSide(p) {
  const dir = creekDir(p.x, p.z);
  // find nearest creek point via small search
  let best = 1e9, bp = null;
  for (let a = -0.15; a <= 0.15; a += 0.0025) {
    // the creek is roughly a function of x
    const z0 = creekZ(a);
    const d = Math.hypot(p.x - a, p.z - z0);
    if (d < best) { best = d; bp = V3(a, 0, z0); }
  }
  return Math.sign((p.x - bp.x) * dir.y - (p.z - bp.z) * dir.x) || 1;
}
function creekZ(x) {
  // sample polyline z at x
  const C = [[-0.135, 0.062], [-0.085, 0.088], [-0.03, 0.094], [0.025, 0.083], [0.075, 0.093], [0.132, 0.072]];
  if (x <= C[0][0]) return C[0][1];
  for (let i = 0; i < C.length - 1; i++) if (x <= C[i + 1][0]) { const t = (x - C[i][0]) / (C[i + 1][0] - C[i][0]); return C[i][1] + (C[i + 1][1] - C[i][1]) * t; }
  return C[C.length - 1][1];
}
function findCrossing(a, b) {
  let best = 1e9, bp = null;
  for (let i = 0; i <= 20; i++) {
    const p = a.clone().lerp(b, i / 20);
    const d = creekDist(p.x, p.z);
    if (d < best) { best = d; bp = p; }
  }
  return best < 0.012 ? bp : null;
}
function buildBridge(c) {
  G.bridges.push(c.clone());
  const dir = creekDir(c.x, c.z); // along the creek
  const across = V3(-dir.y, 0, dir.x);
  const yaw = Math.atan2(dir.y, dir.x);
  const y = Math.max(groundH(c.x + across.x * 0.016, c.z + across.z * 0.016), groundH(c.x - across.x * 0.016, c.z - across.z * 0.016)) + 0.0012;
  // planks laid along the creek direction, stepping across it
  for (let i = 0; i < 9; i++) {
    const o = (i - 4) * 0.0037;
    const p = V3(c.x + across.x * o, y + Math.sin(i * 1.7) * 0.0003, c.z + across.z * o);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -yaw + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.05));
    twigs.add(p, q, V3(0.72, 0.85, 0.85), null, i * 0.07);
  }
  // two side rails across
  for (const s of [-1, 1]) {
    const p = V3(c.x + dir.x * s * 0.0085, y + 0.0028, c.z + dir.y * s * 0.0085);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.atan2(across.z, across.x), 0));
    twigs.add(p, q, V3(1.25, 0.7, 0.7), null, 0.6 + (s + 1) * 0.08);
  }
  setTimeout(() => { sfx.chime(); say('はし!'); }, 900);
}

// magnifier: hover detection & lens render
function lensHover(p, dt) {
  const dh = Math.hypot(p.x - HOUSE.x, p.z - HOUSE.z);
  if (dh < 0.035) {
    G.houseHover += dt;
    if (G.houseHover > 0.6 && !G.lit) { G.lit = true; sfx.chime(); say('わあ!'); }
  }
  const lp = train.cars[0].position;
  if (Math.hypot(p.x - lp.x, p.z - lp.z) < 0.03) {
    G.trainHover += dt;
    if (G.trainHover > 0.4 && !train.running) { train.running = true; sfx.whistle(); setTimeout(() => say('しゅっぱーつ!'), 600); }
  }
}
function renderLens() {
  const mag = tools.magnifier.obj;
  if (G.held !== 'magnifier') return;
  const lensC = mag.position.clone();
  const dist = camera.position.distanceTo(lensC);
  const lensAng = 2 * Math.atan(0.0352 / dist);
  lensCam.fov = THREE.MathUtils.radToDeg(lensAng) / 2.4;
  lensCam.position.copy(camera.position);
  const dir = lensC.clone().sub(camera.position).normalize();
  lensCam.up.copy(camera.up);
  lensCam.lookAt(camera.position.clone().add(dir));
  // roll to match the lens orientation
  const lensUp = V3(0, 1, 0).applyQuaternion(mag.quaternion);
  const cu = V3(0, 1, 0).applyQuaternion(lensCam.quaternion);
  const cr = V3(1, 0, 0).applyQuaternion(lensCam.quaternion);
  const roll = Math.atan2(lensUp.dot(cr), lensUp.dot(cu));
  lensCam.rotateZ(-roll);
  lensCam.updateMatrixWorld();
  lensCam.updateProjectionMatrix();
  mag.visible = false;
  renderer.setRenderTarget(lensRT);
  renderer.render(scene, lensCam);
  renderer.setRenderTarget(null);
  mag.visible = true;
}

// ------------------------------------------------------------------ train & house
function placeTrain() {
  let u = train.u;
  const circ = 0.58;
  const p = V3(), p2 = V3();
  for (const car of train.cars) {
    trackPoint(u, p); trackPoint(u + 0.002, p2);
    p.y = groundH(p.x, p.z) + 0.0032; p2.y = groundH(p2.x, p2.z) + 0.0032;
    car.position.copy(p);
    const yaw = Math.atan2(p2.z - p.z, p2.x - p.x);
    const pitch = Math.atan2(p2.y - p.y, Math.hypot(p2.x - p.x, p2.z - p.z));
    car.rotation.set(0, -yaw, pitch, 'YXZ');
    car.rotation.order = 'YZX';
    car.rotation.set(0, -yaw, pitch);
    u -= (car.userData.len + 0.003) / circ;
  }
}
function updateTown(dt) {
  if (train.running) train.speed = Math.min(0.045, train.speed + dt * 0.02);
  if (train.speed > 0) {
    train.u = (train.u + train.speed * dt) % 1;
    placeTrain();
    const rotd = train.speed * 0.58 * dt / 0.0021;
    for (const c of train.cars) for (const w of c.userData.wheels) w.rotation.z -= rotd;
    train.puff -= dt;
    if (train.puff <= 0) {
      train.puff = 0.32;
      const ch = train.cars[0].userData.chimney;
      const p = new THREE.Vector3().setFromMatrixPosition(ch.matrixWorld).add(V3(0, 0.003, 0));
      particles.emit(2, p, V3((Math.random() - 0.5) * 0.004, 0.012, (Math.random() - 0.5) * 0.004), 1.6, 0.004, 0.7);
      if (Math.random() < 0.5) sfx.chuff();
    }
  }
  const lit = house.userData;
  lit.lit += ((G.lit ? 1 : 0) - lit.lit) * Math.min(1, dt * 1.5);
  M.window.emissiveIntensity = lit.lit * 2.2;
  lit.light.intensity = lit.lit * 0.035;
  lit.outLight.intensity = lit.lit * 0.02;
  const loco = train.cars[0].userData;
  M.lamp.emissiveIntensity = train.running ? 3 : 0;
  loco.light.intensity = train.running ? 0.01 : 0;
}

// ------------------------------------------------------------------ dad's over-spray
function updateDad(dt) {
  const st = G.dadT;
  if (st <= 0) return;
  G.dadT += dt;
  const T = G.dadT;
  camBasis();
  const flood = V3(0.065, BASE_Y, -0.005);
  const nozzleAim = flood.clone().add(V3(0.075, 0.13, 0.04));
  const off = camR.clone().multiplyScalar(0.45).add(V3(0, 0.15, 0.1));
  let k;
  if (T < 1.4) k = 1 - ease(T / 1.4); else if (T < 4.2) k = 0; else k = ease(Math.min(1, (T - 4.2) / 1.2));
  const tip = nozzleAim.clone().addScaledVector(off, k);
  const dir = flood.clone().sub(tip).normalize();
  const zt = dir.clone().negate();
  const yt = UP.clone().addScaledVector(zt, -UP.dot(zt)).normalize();
  const qt = new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(yt.clone().cross(zt), yt, zt));
  const tool = dadHand.tool;
  tool.visible = true; dadHand.group.visible = true;
  tool.quaternion.copy(qt);
  tool.position.copy(tip).sub(tool.userData.tip.clone().multiplyScalar(1.25).applyQuaternion(qt));
  tool.updateMatrixWorld(true);
  const xh = V3(0, -1, 0).applyQuaternion(qt), yh = V3(-0.35, 0, -1).applyQuaternion(qt);
  const qh = basis(yh, xh.clone().cross(yh).normalize());
  dadHand.group.quaternion.copy(qh);
  const gc = V3(0, 0.124, 0.002).multiplyScalar(1.25).applyQuaternion(qt).add(tool.position);
  dadHand.group.position.copy(gc).sub(V3(0.0, 0.05, -0.021).multiplyScalar(1.42).applyQuaternion(qh));
  dadHand.update(dt);
  if (T > 1.4 && T < 3.6) {
    // a strong jet instead of mist
    dadHand.squeeze = 0.5 + 0.5 * Math.sin(T * 20);
    const tipW = tool.userData.tip.clone().applyMatrix4(tool.matrixWorld);
    for (let i = 0; i < 6; i++) {
      const d = dir.clone().add(V3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05)).normalize();
      particles.emit(1, tipW, d.multiplyScalar(1.2 + Math.random() * 0.4), 0.8, 0.0012 + Math.random() * 0.0016);
    }
    G.jetT = (G.jetT || 0) - dt;
    if (G.jetT <= 0) { sfx.jet(); G.jetT = 0.45; }
  } else dadHand.squeeze = 0;
  if (T > 1.5 && !G.saidOops) { G.saidOops = true; say('おっとっと!', 'dad'); }
  if (T > 3.9 && !G.saidAh) { G.saidAh = true; setTimeout(() => { say('あっ! みずびたし!'); sfx.oops(); }, 200); }
  if (T > 5.6) {
    G.dadT = 0; dadHand.group.visible = false; tool.visible = false;
    enableTools(['spray', 'dropper']);
    G.floodStart = moss.flood();
  }
}

// ------------------------------------------------------------------ hints & glow
const hintEl = document.getElementById('hint');
let hintOn = false;
function hintTarget() {
  const s = G.state;
  if (s === 'intro') return { p: coatHang.position.clone().add(V3(0, 0.5, 0)) };
  if (s === 's1') {
    if (G.dadT > 0) return null;
    if (G.dadDone && moss.flood() > G.floodStart * 0.12 + 0.00002) {
      if (G.held !== 'dropper') return { p: tools.dropper.home.clone() };
      const c = moss.floodCenter();
      return c ? { p: V3(c.x, BASE_Y + 0.004, c.y) } : null;
    }
    if (G.held !== 'spray') return { p: tools.spray.home.clone().add(V3(0, 0.08, 0)) };
    return { p: driestSpot(), drag: true };
  }
  if (s === 's2') {
    if (jar.lidState === 1 && !jar.lidAnim) return { p: V3(-0.03, 0.17, JAR.r), drag: true, glass: true };
    if (G.s2ready && jar.lidState === 0) return { p: jar.lid.position.clone() };
    if (stones.count < G.stoneGoal) return G.held !== 'pebble' ? { p: tools.pebble.home.clone() } : { p: V3(0.0, BASE_Y + 0.003, 0.13), drag: true, to: V3(0.0, BASE_Y + 0.02, -0.01) };
    if (!G.bridges.length) return G.held !== 'twig' ? { p: tools.twig.home.clone() } : { p: V3(-0.03, BASE_Y, 0.115), drag: true, to: V3(-0.03, BASE_Y, 0.07) };
  }
  if (s === 's3') {
    if (G.held !== 'magnifier') return { p: tools.magnifier.home.clone() };
    if (!G.lit) return { p: V3(HOUSE.x, BASE_Y + 0.03, HOUSE.z) };
    if (!train.running) return { p: train.cars[0].position.clone() };
  }
  return null;
}
function driestSpot() {
  let best = null, bw = 9;
  for (let i = 0; i < 40; i++) {
    const a = (i * 2.399) % 6.283, r = Math.sqrt((i + 0.5) / 40) * 0.13;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = moss.wetAt(x, z);
    if (w < bw) { bw = w; best = V3(x, BASE_Y, z); }
  }
  return best;
}
function updateHints(dt) {
  G.idle += dt;
  const ht = hintTarget();
  const show = ht && G.idle > (G.state === 'intro' ? 2.5 : 4.5) && !G.pressing && cam.t >= 1;
  if (show) {
    let p = ht.p;
    if (ht.drag) {
      const to = ht.to || p.clone().add(V3(0.04, 0, -0.02));
      const k = (clock.elapsedTime * 0.6) % 1;
      p = p.clone().lerp(to, ease(Math.min(1, k * 1.4)));
    }
    const s = screenOf(p);
    const bob = ht.drag ? 0 : Math.abs(Math.sin(clock.elapsedTime * 4)) * 10;
    hintEl.style.transform = `translate(${s.x}px, ${s.y + bob}px) rotate(-18deg)`;
    if (!hintOn) { hintEl.style.opacity = '0.95'; hintOn = true; }
  } else if (hintOn) { hintEl.style.opacity = '0'; hintOn = false; }
  // glow halos on touchable things (breathing)
  const pulse = 0.35 + 0.25 * Math.sin(clock.elapsedTime * 3.2);
  for (const t of Object.values(tools)) {
    const on = t.enabled && !t.inHand && ['s1', 's2', 's3', 'free'].includes(G.state) && (G.state !== 'free' && G.state !== 's1' || needGlow(t));
    t.halo.material.opacity += ((on ? pulse : 0) - t.halo.material.opacity) * Math.min(1, dt * 5);
    t.halo.position.copy(t.home).add(V3(0, t.name === 'spray' ? 0.07 : 0.015, 0));
    // little wobble invites a touch
    if (on && !t.inHand) t.obj.rotation.y = t.homeRot + Math.sin(clock.elapsedTime * 5) * 0.05 * pulse;
  }
  const lidOn = canTapLid() && G.state === 's2';
  lid.halo.material.opacity += ((lidOn ? pulse : 0) - lid.halo.material.opacity) * Math.min(1, dt * 5);
  lid.halo.position.copy(jar.lid.position).add(V3(0, 0.02, 0));
  const coatOn = G.state === 'intro';
  coatHalo.material.opacity += ((coatOn ? pulse * 0.8 : 0) - coatHalo.material.opacity) * Math.min(1, dt * 5);
  coatHalo.position.copy(coatHang.position).add(V3(0, 0.55, 0));
  if (coatOn) coatHang.rotation.z = Math.sin(clock.elapsedTime * 4) * 0.025;
}
function needGlow(t) {
  if (G.state === 's1') {
    if (G.dadDone && moss.flood() > G.floodStart * 0.12 + 0.00002) return t.name === 'dropper';
    return t.name === 'spray';
  }
  return G.held !== t.name && G.idle > 6;
}

// ------------------------------------------------------------------ state machine
function updateFlow(dt) {
  G.t += dt;
  G.huhT -= dt;
  G.squeakT -= dt;
  const s = G.state;
  if (s === 'dress') {
    // the coat flies from the rack onto the girl
    const k = Math.min(1, G.t / 0.9);
    const from = V3(-0.62, -0.1, 0.50), to = girl.group.position.clone().add(V3(0, 0.62, 0));
    coatHang.position.lerpVectors(from, to, ease(k));
    coatHang.position.y += Math.sin(k * Math.PI) * 0.25;
    coatHang.rotation.y = 0.5 + k * 2.6;
    coatHang.scale.setScalar(1 - k * 0.15);
    if (k >= 1 && coatHang.visible) {
      coatHang.visible = false; girl.coat.visible = true;
      flash(); sfx.pop();
      girl.hop = 1;
      setTimeout(() => { girl.hop = 0; }, 1300);
    }
    if (G.t > 2.2) setState('s1');
    return;
  }
  if (s === 'cheer') {
    girl.hop = G.t > 1.0 && G.t < 3.2 ? 1 : 0;
    girl.clap = G.t > 1.0 && G.t < 3.4 ? Math.min(1, (G.t - 1.0) * 3) : Math.max(0, girl.clap - dt * 3);
    dad.nod = G.t > 1.2 && G.t < 2.6 ? 1 : 0;
    if (G.t > 4.0) { girl.clap = 0; girl.hop = 0; dad.nod = 0; setState(G.cheerNext); }
    return;
  }
  if (s === 's1') {
    const cov = moss.coverage(0.4);
    if (!G.dadDone && cov > 0.42 && !G.pressing) {
      G.dadDone = true; G.dadT = 0.0001;
      releaseTool();
      enableTools([]);
    }
    if (G.dadDone && G.dadT === 0) {
      const fl = moss.flood();
      if (fl < G.floodStart * 0.12 + 0.00002 && cov > 0.6 && !G.pressing) cheer('s2');
      else if (fl < G.floodStart * 0.12 + 0.00002 && G.held === 'dropper' && !G.pressing && G.emptying <= 0) { /* back to spraying */ }
    }
  }
  if (s === 's2') {
    G.s2ready = stones.count >= G.stoneGoal && G.bridges.length > 0;
    if (jar.lidState === 1) {
      if (jar.fogAmt < 1) jar.formFog(dt);
      else if (Math.random() < dt * 0.4) jar.formFog(dt * 0.2);
      if (jar.fogAmt > 0.5 && G.wipeLen > 1.0 && !G.pressing) cheer('s3');
    }
  }
  if (s === 's3') {
    if (G.t < 0.1 && jar.lidState === 1 && !jar.lidAnim) jar.openLid(() => sfx.clink());
    if (G.lit && train.running && G.t > 1 && !G.pressing && !G.s3cheer) { G.s3cheer = true; setTimeout(() => cheer('free'), 2200); }
  }
  if ((s === 's3' || s === 'free') && jar.lidState === 0 && jar.fogAmt > 0) jar.clearFog(dt);
  if (s === 'free' && jar.lidState === 1 && jar.fogAmt < 1) jar.formFog(dt);
}

function flash() {
  const f = document.getElementById('flash');
  f.style.transition = 'none'; f.style.opacity = '0.7';
  requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = '0'; });
}

// ------------------------------------------------------------------ adaptive quality
let fpsAcc = 0, fpsN = 0, qualityChecked = 0;
function adapt(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2.5) {
    const fps = fpsN / fpsAcc;
    fpsAcc = 0; fpsN = 0;
    if (fps < 32 && pixelRatio > 1.0 && qualityChecked < 4) {
      pixelRatio = Math.max(1.0, pixelRatio - 0.35);
      renderer.setPixelRatio(pixelRatio);
      resize();
      qualityChecked++;
    } else if (fps < 28 && qualityChecked >= 2 && moss.shoots.count > 2500) {
      moss.shoots.count = Math.floor(moss.shoots.count * 0.7);
    }
  }
}

// ------------------------------------------------------------------ main loop
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const sub = DBG ? 6 : 1; // debug: fast-forward the simulation (headless rendering is slow)
  for (let k = 0; k < sub; k++) {
    const d = DBG ? 0.05 : dt;
    updateFlow(d);
    updateCamera(d);
    updateTools(d);
    updateDad(d);
    particles.update(d, collide);
    moss.step(d);
    jar.update(); jar.animate(d);
    stones.update(d, () => sfx.clack());
    twigs.update(d, () => sfx.twig());
    updateTown(d);
    girl.update(d); dad.update(d);
  }
  updateHints(dt);
  if (G.huhWobble > 0) { G.huhWobble -= dt; hand.group.rotateZ(Math.sin(G.huhWobble * 20) * 0.08 * G.huhWobble); }
  renderLens();
  renderer.render(scene, camera);
  if (!DBG) adapt(dt);
}

// ------------------------------------------------------------------ debug / screenshot helpers
function debugPrep(s) {
  if (s === 's2' || s === 's3' || s === 'free') {
    for (let k = 0; k < 6000; k++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.15; moss.addWet(Math.cos(a) * r, Math.sin(a) * r, 0.12, 0.008); }
    G.dadDone = true;
  }
  if (s === 's3' || s === 'free') {
    for (let i = 0; i < 16; i++) placeAlong('pebble', V3(0.004 + Math.sin(i * 0.5) * 0.01, 0, 0.14 - i * 0.0088));
    placeAlong('twig', V3(-0.03, 0, 0.12)); placeAlong('twig', V3(-0.03, 0, 0.065));
  }
  if (s === 'free') { G.lit = true; train.running = true; train.speed = 0.045; }
}
window.__G = G;
window.__api = {
  G, setState, takeTool: (n) => takeTool(tools[n]), moss: () => moss, jar: () => jar, cheer, toggleLid,
  press: (x, y) => { setNDC({ clientX: x, clientY: y }); G.pressing = true; G.path = []; G.lastPlace = null; G.lastTwig = null; G.lastUV = null; onMove(); },
  move: (x, y) => { setNDC({ clientX: x, clientY: y }); onMove(); },
  release: () => onUp(),
  screenOf: (x, y, z) => screenOf(V3(x, y, z)),
  wetAll: () => debugPrep('s2'),
  pathAll: () => debugPrep('s3'),
  dad: () => { G.dadDone = true; G.dadT = 0.0001; },
  light: () => { G.lit = true; train.running = true; },
  cam: () => ({ pos: camera.position.toArray(), fov: camera.fov }),
  setCam: (p, t) => { cam.pos.set(...p); cam.tgt.set(...t); cam.t = 1; cam.shot = null; },
  handPos: () => hand.group.position.toArray(),
  look: (k = 0.45) => { const h = hand.group.position.clone(); const c = camera.position.clone(); const p = c.lerp(h, k); cam.pos.copy(p); cam.tgt.copy(h); cam.t = 1; cam.shot = null; },
  emitTest: () => { particles.emit(0, V3(0, 0.2, 0), V3(0, 0, 0), 2, 0.005, 1); const i = particles.free.length; const before = particles.life.filter((x) => x > 0).length; particles.update(0.016, collide); return [before, particles.life.filter((x) => x > 0).length, i]; },
  parts: () => { let n = 0; for (let i = 0; i < particles.cap; i++) if (particles.life[i] > 0) n++; const t = tools.spray.obj.userData.tip.clone().applyMatrix4(tools.spray.obj.matrixWorld); return { n, tip: t.toArray(), free: particles.free.length, pump: G.pumpT, press: G.pressing, tp: G.touchPoint && G.touchPoint.toArray() }; },
  stats: () => ({ cov: moss.coverage(0.4), flood: moss.flood(), stones: stones.count, bridges: G.bridges.length, held: G.held, fog: jar.fogAmt, wipe: G.wipeLen }),
};

boot();
