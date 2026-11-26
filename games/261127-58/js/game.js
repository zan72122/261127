// game.js — "あついガラス、つめたいガラス"
// intro (gloves + goggles) -> s1 bench: blow / pull / frit / cut (x3)
// -> s2 cooling: water tub (crackle) or shelf (smooth) -> s3 morning window: coloured light.
import * as THREE from './three.module.min.js';
import { Post, startUpgrades, smooth, clamp, lerp, sstep, texSet } from './core.js';
import { World, rbox } from './world.js';
import { Glass, blackbody, mulberry } from './glass.js';
import { loadBin, Figure, Glove, personMats, gloveMats } from './figure.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = params.get('sm') === 'soft' ? THREE.PCFSoftShadowMap : params.get('sm') === 'vsm' ? THREE.VSMShadowMap : THREE.PCFShadowMap;
let PR = Math.min(window.devicePixelRatio || 1, 1.75);
const post = new Post(renderer);
const world = new World(renderer);
const scene = world.scene;
world.setMode('night');
const camera = new THREE.PerspectiveCamera(36, 1, 0.03, 40);
const fx = new FX(scene);
const audio = new Audio();

// ------------------------------------------------------------------ camera rig
// preset: target, dir (camera = target + dir*dist), dist, need (w,h metres to frame)
const CAM = {
  intro: { t: V3(0.1, 0.82, -2.6), dir: V3(0.22, 0.2, 1).normalize(), dist: 3.4, need: [2.4, 1.85] },
  s1: { t: V3(0.55, 0.845, 0.15), dir: V3(-0.28, 0.5, 1).normalize(), dist: 0.66, need: [0.6, 0.4] },
  s1gag: { t: V3(0.8, 1.2, -0.1), dir: V3(-0.5, 0.08, 0.86).normalize(), dist: 2.1, need: [1.3, 1.3] },
  s2: { t: V3(2.3, 0.82, -1.7), dir: V3(-0.1, 0.3, 1).normalize(), dist: 2.7, need: [2.6, 1.35] },
  s3: { t: V3(2.95, 0.5, 0.15), dir: V3(-0.78, 0.38, 0.5).normalize(), dist: 2.8, need: [2.3, 1.5] },
  end: { t: V3(3.0, 0.7, 0.2), dir: V3(-0.85, 0.36, 0.5).normalize(), dist: 3.1, need: [3.0, 1.9] },
};
const rig = { t: CAM.intro.t.clone(), pos: V3(), fov: 36, k: 1, focus: 2.5 };
let camPreset = CAM.intro, camRate = 2.2;
function camGoal(p) {
  const aspect = innerWidth / innerHeight;
  const portrait = aspect < 1;
  const minF = portrait ? 40 : 27, maxF = portrait ? 56 : 39;
  let d = p.dist;
  const halfH = Math.max(p.need[1] / 2, p.need[0] / 2 / aspect);
  let fov = 2 * Math.atan(halfH / d) * 180 / Math.PI;
  if (fov > maxF) { d = halfH / Math.tan(maxF * Math.PI / 360); fov = maxF; }
  if (fov < minF) { fov = minF; d = halfH / Math.tan(minF * Math.PI / 360); d = Math.max(d, p.dist * 0.9); }
  return { pos: p.t.clone().addScaledVector(p.dir, d), t: p.t.clone(), fov, d };
}
function snapCam() { const g = camGoal(camPreset); rig.pos.copy(g.pos); rig.t.copy(g.t); rig.fov = g.fov; rig.focus = g.d; }
function updateCam(dt) {
  const g = camGoal(camPreset);
  const k = 1 - Math.exp(-camRate * dt);
  rig.pos.lerp(g.pos, k); rig.t.lerp(g.t, k); rig.fov = lerp(rig.fov, g.fov, k); rig.focus = lerp(rig.focus, g.d, k);
  // gentle handheld breathing
  const tt = clock.t;
  camera.position.copy(rig.pos).add(V3(Math.sin(tt * 0.31) * 0.004, Math.sin(tt * 0.47) * 0.003, 0));
  camera.lookAt(rig.t);
  camera.fov = rig.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  post.final.uniforms.focus.value = rig.focus;
}

// ------------------------------------------------------------------ resize
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(PR); renderer.setSize(w, h, false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  post.setSize(w, h, PR);
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ state
const clock = { t: 0, last: performance.now() };
const S = {
  phase: 'intro', gloves: false, goggles: false,
  pieces: [], cur: null, made: 0, need: 3,
  blowing: false, grabbing: false, dish: null, dishT: 0, idle: 0,
  gag: 'none', gagT: 0, morningK: 0, spin: 0, spinRate: 1.5,
  transitioning: false, s3placed: 0, celebrateT: 0,
  hold: null
};
window.__S = S;

// ------------------------------------------------------------------ people
let girl = null, papa = null, gloveData = null;
const handGloves = [];           // gloves worn by the girl (attached to her bones)
let fpL = null, fpR = null;      // first-person gloves at the bench
let jacks = null, tongs = null, goggles = null, hookGoggles = null;
let papaBrows = [], papaTowel = null, girlMouth = null; const papaGloves = [];

function makeGoggles() {
  const g = new THREE.Group();
  const frameM = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.45, metalness: 0.1 });
  texSet('leather').bind(frameM, [2, 2], { normalMap: 'n', roughnessMap: 'm' });
  const lensM = new THREE.MeshPhysicalMaterial({ color: 0x9a8aa8, roughness: 0.04, transmission: 0.75, thickness: 0.003, ior: 1.5, metalness: 0, iridescence: 0.25, iridescenceThicknessRange: [300, 500] });
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0055, 12, 32), frameM);
    cup.position.set(s * 0.029, 0, 0); cup.castShadow = true; g.add(cup);
    const ln = new THREE.Mesh(new THREE.SphereGeometry(0.024, 24, 12, 0, Math.PI * 2, 0, 0.6), lensM);
    ln.rotation.x = Math.PI / 2; ln.position.set(s * 0.029, 0, -0.016); g.add(ln);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.016, 8).rotateZ(Math.PI / 2), frameM); g.add(bridge);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.006, 8, 48, Math.PI * 1.25), new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.9 }));
  texSet('canvas').bind(strap.material, [8, 1], { normalMap: 'n' });
  strap.rotation.set(Math.PI / 2, 0, Math.PI * 1.125); strap.scale.set(0.95, 1.05, 1); strap.position.set(0, 0, -0.075); g.add(strap);
  return g;
}
function addFace(fig, kind) {
  const head = fig.byName.head;
  const hc = new THREE.Vector3(...fig.headC).sub(head.getWorldPosition(new THREE.Vector3()).sub(fig.group.position));
  const girlK = kind === 'girl';
  const eyeM = new THREE.MeshPhysicalMaterial({ color: 0x1e140e, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(girlK ? 0.0105 : 0.011, 16, 12), eyeM);
    e.position.copy(hc).add(girlK ? V3(s * 0.03, 0.003, 0.072) : V3(s * 0.034, 0.012, 0.076));
    head.add(e);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(girlK ? 0.0025 : 0.0042, girlK ? 0.018 : 0.026, 4, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: girlK ? 0x3a2418 : 0x1e1612, roughness: 0.9 }));
    brow.position.copy(hc).add(girlK ? V3(s * 0.031, 0.022, 0.083) : V3(s * 0.034, 0.034, 0.093));
    brow.rotation.z = -s * 0.12; head.add(brow);
    if (!girlK) papaBrows.push(brow);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0024, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a3a34, roughness: 0.6 }));
  mouth.rotation.z = Math.PI; mouth.position.copy(hc).add(girlK ? V3(0, -0.042, 0.082) : V3(0, -0.05, 0.098));
  head.add(mouth);
  return { mouth, hc };
}
function setMouth(kind) {
  if (!girlMouth) return;
  const m = girlMouth;
  if (kind === 'smile') { m.rotation.z = Math.PI; m.scale.set(1, 1, 1); }
  else if (kind === 'o') { m.rotation.z = Math.PI; m.scale.set(0.55, 1.4, 1); }
  else if (kind === 'hm') { m.rotation.z = 0; m.scale.set(0.7, 0.4, 1); }
}

function addApron(fig) {
  // heavy leather apron: a curved, slightly wrinkled sheet hung from the chest
  const W = 0.4, H = 0.7, g = new THREE.PlaneGeometry(W, H, 20, 30);
  const p = g.attributes.position, R = 0.24;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i);
    const v = (y + H / 2) / H;                     // 0 bottom .. 1 top
    x *= 0.72 + 0.28 * (1 - sstep(0.62, 0.9, v)); // narrower bib
    const a = x / R;
    const wr = Math.sin(x * 70 + y * 9) * 0.003 + Math.sin(y * 38 + x * 20) * 0.004 * (1 - v);
    p.setXYZ(i, Math.sin(a) * R, y, Math.cos(a) * R - R + wr + (1 - v) * 0.02);
  }
  g.computeVertexNormals();
  const m = world.mats.leather.clone(); m.side = THREE.DoubleSide; m.color = new THREE.Color(0xd8c0a8);
  texSet('leather').bind(m, [1.3, 2.2]);
  const ap = new THREE.Mesh(g, m); ap.castShadow = true; ap.receiveShadow = true;
  const chest = fig.byName.chest;
  ap.position.set(0, -0.19, 0.135); chest.add(ap);
  for (const sx of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 6), m);
    st.position.set(sx * 0.1, 0.2, 0.06); st.rotation.set(-0.75, 0, sx * 0.35); st.castShadow = true; chest.add(st);
  }
}
function makeJacks() {
  const g = new THREE.Group();
  const st = world.mats.steel;
  for (const s of [-1, 1]) {
    const blade = new THREE.Mesh(rbox(0.006, 0.24, 0.012, 0.002, 0.3), st);
    blade.position.set(s * 0.009, 0.12, 0); blade.rotation.z = -s * 0.035; blade.castShadow = true; g.add(blade);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.09, 12), world.mats.oak);
    h.position.set(s * 0.012, 0.02, 0); h.castShadow = true; g.add(h);
  }
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 16, Math.PI), st);
  spring.position.y = -0.028; spring.rotation.z = Math.PI; g.add(spring);
  return g;
}
function makeTongs() {
  const g = new THREE.Group();
  const st = world.mats.iron;
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(rbox(0.007, 0.36, 0.01, 0.002, 0.3), st);
    arm.position.set(s * 0.012, 0.18, 0); arm.rotation.z = s * 0.03; arm.castShadow = true; g.add(arm);
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 16, Math.PI * 0.9), st);
    jaw.position.set(s * 0.02, 0.37, 0); jaw.rotation.set(0, 0, s > 0 ? -0.4 : Math.PI + 0.4); g.add(jaw);
  }
  return g;
}

async function loadPeople() {
  const [gd, pd, gl] = await Promise.all([loadBin('mesh/girl.bin'), loadBin('mesh/papa.bin'), loadBin('mesh/glove.bin')]);
  gloveData = gl;
  girl = new Figure(gd, personMats('girl')); girl.headC = gd.bones.headC;
  papa = new Figure(pd, personMats('papa')); papa.headC = pd.bones.headC;
  scene.add(girl.group, papa.group);
  for (const f of [girl, papa]) { const b = contactBlob(f === girl ? 0.45 : 0.7); f.group.add(b); f.blob = b; }
  girlMouth = addFace(girl, 'girl').mouth;
  addFace(papa, 'papa');
  addApron(papa);
  // papa wears the same heat gloves
  for (const side of ['L', 'R']) {
    const gm = gloveMats();
    const gv = new Glove(gl, { glove: gm.glove });
    papa.byName['hand' + side].add(gv.group);
    const m = new THREE.Matrix4();
    if (side === 'R') m.makeBasis(V3(0, 0, -1), V3(0, -1, 0), V3(-1, 0, 0)); else m.makeBasis(V3(0, 0, 1), V3(0, -1, 0), V3(1, 0, 0));
    gv.group.quaternion.setFromRotationMatrix(m);
    gv.group.position.set(0, 0.01, 0);
    gv.group.scale.set(side === 'L' ? -0.95 : 0.95, 0.95, 0.95);
    gv.setGrip(0.3); papaGloves.push(gv);
  }
  // hanging gloves on the board (pre-dress)
  for (let i = 0; i < 2; i++) {
    const gm = gloveMats();
    const gv = new Glove(gl, { glove: gm.glove });
    gv.group.scale.set(i === 0 ? -0.72 : 0.72, 0.72, 0.72);
    gv.setGrip(0.15);
    scene.add(gv.group); handGloves.push(gv);
  }
  hookGloves();
  goggles = makeGoggles(); scene.add(goggles); hookGogglesPlace();
  // first-person gloves (with sleeves)
  fpL = new Glove(gl, gloveMats()); fpR = new Glove(gl, gloveMats());
  fpL.group.scale.set(-0.86, 0.86, 0.86); fpR.group.scale.set(0.86, 0.86, 0.86);
  fpL.setGrip(0.62); fpR.setGrip(0.75);
  scene.add(fpL.group, fpR.group); fpL.group.visible = fpR.group.visible = false;
  jacks = makeJacks(); scene.add(jacks); jacks.visible = false;
  tongs = makeTongs(); scene.add(tongs); tongs.visible = false;
  placeIntro();
}
function contactBlob(size) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.8 }));
  m.position.y = 0.004; m.renderOrder = 1; return m;
}
function hookGloves() {
  const b = world.board;
  handGloves.forEach((gv, i) => {
    const p = b.localToWorld(V3(-0.2 + i * 0.1, 1.26, 0.07));
    gv.group.position.copy(p); gv.group.rotation.set(0.12, 0, Math.PI + (i ? 0.08 : -0.08));
  });
}
function hookGogglesPlace() {
  const p = world.board.localToWorld(V3(0.17, 1.21, 0.06));
  goggles.position.copy(p); goggles.rotation.set(-0.2, 0, 0.1);
}

// ------------------------------------------------------------------ poses
const POSE = {
  stand: { upperArmL: [0, 0, 0.12], upperArmR: [0, 0, -0.12], forearmL: [-0.15, 0, 0], forearmR: [-0.15, 0, 0] },
  wave: { upperArmR: [0, 0, -2.5], forearmR: [0, 0, -0.5], upperArmL: [0, 0, 0.12], head: [0.05, 0.2, 0] },
  clap: { upperArmL: [-1.15, 0.4, 0.1], upperArmR: [-1.15, -0.4, -0.1], forearmL: [-0.7, 0, 0], forearmR: [-0.7, 0, 0], head: [-0.1, 0, 0] },
  cheer: { upperArmL: [0, 0, 2.6], upperArmR: [0, 0, -2.6], forearmL: [0, 0, 0.3], forearmR: [0, 0, -0.3], head: [-0.2, 0, 0], chest: [-0.05, 0, 0] },
  lean: { spine: [0.25, 0, 0], chest: [0.25, 0, 0], neck: [0.15, 0, 0], head: [0.2, 0, 0], upperArmL: [0.2, 0, 0.15], upperArmR: [0.2, 0, -0.15], thighL: [-0.2, 0, 0], thighR: [-0.2, 0, 0], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0] },
  ouch: { spine: [-0.15, 0, 0], chest: [-0.1, 0, 0], head: [-0.25, 0, 0], upperArmL: [-2.2, 0.3, 0.6], upperArmR: [-2.2, -0.3, -0.6], forearmL: [-1.9, 0, 0], forearmR: [-1.9, 0, 0] },
  relief: { head: [-0.12, 0, 0], upperArmR: [-0.5, 0, -0.3], forearmR: [-1.6, 0, 0], upperArmL: [0, 0, 0.15] },
  thumbs: { upperArmR: [-1.2, 0, -0.2], forearmR: [-0.9, 0, 0], head: [0.05, 0, 0] },
  watch: { head: [0.12, 0, 0], neck: [0.08, 0, 0], upperArmL: [0, 0, 0.15], upperArmR: [0, 0, -0.15], forearmL: [-0.3, 0, 0], forearmR: [-0.3, 0, 0] },
  nod: { head: [0.35, 0, 0] },
  reach: { upperArmL: [0, 0, 0.12], chest: [0.05, 0.2, 0] },
};
function poseOf(fig, name, rate) { fig.pose(POSE[name] || {}, rate || 7); fig.poseName = name; }
let girlTimer = 0, papaTimer = 0;
function girlReact(kind) {
  if (!girl) return;
  if (kind === 'happy') { girl.jump(1.5); poseOf(girl, 'cheer', 10); setMouth('o'); audio.voice('wa', 1.55); girlTimer = 1.4; }
  if (kind === 'clap') { poseOf(girl, 'clap', 12); setMouth('smile'); audio.voice('yay', 1.6); girlTimer = 1.6; S.clapT = 1.2; }
  if (kind === 'nod') { poseOf(girl, 'nod', 10); setMouth('smile'); audio.voice('un', 1.5); girlTimer = 0.6; }
  if (kind === 'wow') { setMouth('o'); audio.voice('oo', 1.6); girlTimer = 1.0; }
}
function papaReact(kind) {
  if (!papa) return;
  if (kind === 'clap') { poseOf(papa, 'clap', 10); audio.voice('oo', 0.55); papaTimer = 1.6; S.papaClapT = 1.2; }
  if (kind === 'nod') { poseOf(papa, 'nod', 8); audio.voice('un', 0.5); papaTimer = 0.8; }
  if (kind === 'wave') { poseOf(papa, 'wave', 6); papaTimer = 2.0; }
  if (kind === 'thumbs') { poseOf(papa, 'thumbs', 6); audio.voice('hee', 0.55); papaTimer = 2.2; }
}

// ------------------------------------------------------------------ placement per phase
function placeFig(fig, x, z, ry) { fig.group.position.set(x, 0, z); fig.group.rotation.y = ry; }
function placeIntro() {
  placeFig(girl, 0.0, -2.55, 2.55); poseOf(girl, 'stand');
  placeFig(papa, -1.35, -1.55, 0.75); poseOf(papa, 'stand');
  girl.group.visible = true;
}
function wearGloves() {
  // reparent to her hand bones
  handGloves.forEach((gv, i) => {
    const side = i === 0 ? 'L' : 'R';
    const bone = girl.byName['hand' + side];
    bone.add(gv.group);
    gv.group.position.set(0, 0.012, 0);
    const m = new THREE.Matrix4();
    if (side === 'R') m.makeBasis(V3(0, 0, -1), V3(0, -1, 0), V3(-1, 0, 0)); else m.makeBasis(V3(0, 0, 1), V3(0, -1, 0), V3(1, 0, 0));
    gv.group.quaternion.setFromRotationMatrix(m);
    gv.group.scale.set(side === 'L' ? -0.62 : 0.62, 0.62, 0.62);
    gv.setGrip(0.35);
  });
}
function wearGoggles() {
  const head = girl.byName.head;
  head.add(goggles);
  const hc = new THREE.Vector3(...girl.headC).sub(V3(0, 0.945, -0.004));
  goggles.position.copy(hc).add(V3(0, 0.004, 0.096)); goggles.rotation.set(0.05, 0, 0);
  goggles.scale.setScalar(1.0);
}

// ------------------------------------------------------------------ glass gather on the pipe
const TINTS = [new THREE.Color(0.8, 0.95, 0.96), new THREE.Color(0.78, 0.88, 1.0), new THREE.Color(0.82, 1.0, 0.84)];
function newGather(i) {
  const g = new Glass({ tint: TINTS[i % 3], seed: 11 + i * 7 + Math.floor(Math.random() * 1000) });
  g.group.rotation.z = Math.PI / 2;     // pole (+Y) towards the pipe (-X)
  g.group.position.x = 0.03;
  world.spin.add(g.group);
  g.appear = 0; g.group.scale.setScalar(0.01);
  S.cur = g;
  world.glassL.intensity = 0;
  return g;
}

// ------------------------------------------------------------------ hints
const hintEl = document.getElementById('hint'), handEl = document.getElementById('hand');
let hintTarget = null;
function hintAt(v) { hintTarget = v; }
function screenOf(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, ok: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
}
function updateHint(dt) {
  if (!hintTarget || S.transitioning) { hintEl.style.opacity = 0; handEl.style.opacity = 0; return; }
  const s = screenOf(hintTarget);
  if (!s.ok) { hintEl.style.opacity = 0; handEl.style.opacity = 0; return; }
  hintEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
  hintEl.style.opacity = 0.9;
  const showHand = S.idle > 5;
  handEl.style.opacity = showHand ? 1 : 0;
  handEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
}

// ------------------------------------------------------------------ input
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let ptr = null;
function setRay(e) { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
function hit(objs) { const h = ray.intersectObjects(objs.filter(Boolean), true); return h[0] || null; }
function near(obj, px = 70) { // screen-space proximity (big friendly targets)
  const wp = obj.isVector3 ? obj : obj.getWorldPosition(V3());
  const s = screenOf(wp); if (!s.ok || !ptr) return Infinity;
  return Math.hypot(s.x - ptr.x, s.y - ptr.y) <= px * (innerWidth < 500 ? 0.8 : 1) ? Math.hypot(s.x - ptr.x, s.y - ptr.y) : Infinity;
}
function planeHit(point, normal) {
  const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  const out = V3(); return ray.ray.intersectPlane(pl, out) ? out : null;
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock(); S.idle = 0;
  ptr = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: clock.t, id: e.pointerId, mode: null };
  canvas.setPointerCapture(e.pointerId);
  setRay(e);
  if (S.transitioning) return;
  if (S.phase === 'intro') introDown();
  else if (S.phase === 's1') s1Down();
  else if (S.phase === 's2') s2Down();
  else if (S.phase === 's3') s3Down();
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptr || e.pointerId !== ptr.id) return;
  ptr.x = e.clientX; ptr.y = e.clientY; S.idle = 0;
  setRay(e);
  if (S.phase === 's1') s1Move();
  else if (S.phase === 's2') s2Move();
  else if (S.phase === 's3') s3Move();
});
const up = (e) => {
  if (!ptr || e.pointerId !== ptr.id) return;
  setRay(e);
  if (S.phase === 's1') s1Up(); else if (S.phase === 's2') s2Up(); else if (S.phase === 's3') s3Up();
  ptr = null;
};
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

// ================================================================== INTRO
function introDown() {
  if (!girl) return;
  const gl = handGloves[0].group, gr = handGloves[1].group;
  const dG = Math.min(near(gl, 90), near(gr, 90)), dO = near(goggles, 80);
  if (!S.gloves && dG <= dO && dG < Infinity) {
    S.gloves = true; audio.whoosh();
    flyTo(handGloves.map(g => g.group), () => { wearGloves(); audio.thud(); girlReact('clap'); papaReact('nod'); checkDressed(); },
      [girl.byName.handL, girl.byName.handR]);
  } else if (!S.goggles && dO < Infinity) {
    S.goggles = true; audio.whoosh();
    flyTo([goggles], () => { wearGoggles(); audio.tone(900, 0.08, { vol: 0.1 }); girlReact('nod'); checkDressed(); }, [girl.byName.head]);
  }
}
const flights = [];
function flyTo(objs, done, targets) {
  objs.forEach((o, i) => { scene.attach(o); flights.push({ o, from: o.position.clone(), q0: o.quaternion.clone(), target: targets[i], t: 0, done: i === objs.length - 1 ? done : null }); });
}
function updateFlights(dt) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i]; f.t += dt / 0.75;
    const k = sstep(0, 1, Math.min(1, f.t));
    const to = f.target.getWorldPosition(V3());
    f.o.position.lerpVectors(f.from, to, k); f.o.position.y += Math.sin(k * Math.PI) * 0.35;
    f.o.rotation.z += dt * 4 * (1 - k);
    if (f.t >= 1) { flights.splice(i, 1); f.done && f.done(); }
  }
}
function checkDressed() {
  if (S.gloves && S.goggles) {
    setTimeout(() => { girlReact('happy'); papaReact('clap'); audio.fanfare(); }, 500);
    setTimeout(() => goS1(), 2400);
  }
}

// ================================================================== S1: the bench
function goS1() {
  S.transitioning = true; camPreset = CAM.s1; camRate = 1.6;
  setTimeout(() => { S.transitioning = false; }, 1600);
  S.phase = 's1';
  girl.group.visible = false;     // we are her now: her gloved hands at the bench
  fpL.group.visible = fpR.group.visible = true; jacks.visible = true;
  placeFig(papa, 1.75, -0.75, -0.95); poseOf(papa, 'watch');
  newGather(0);
  audio.furnace(0.16);
}
function gatherHit() {
  if (!S.cur || S.cur.state !== 'hot') return null;
  const h = ray.intersectObject(S.cur.mesh, false)[0];
  if (h) return h;
  if (near(S.cur.worldCenter(), 46) < Infinity) {
    const c = S.cur.worldCenter();
    return { point: c.addScaledVector(camera.position.clone().sub(c).normalize(), S.cur.maxR * 0.9) };
  }
  return null;
}
function s1Down() {
  if (!S.cur || S.cur.appear < 1) return;
  // frit dishes
  for (const d of world.frits) {
    if (near(d.getWorldPosition(V3()), 60) < Infinity || hit([d])) { S.dish = d; S.dishT = 1.0; d.userData.held = true; ptr.mode = 'dish'; audio.sprinkle(); return; }
  }
  // the neck (cut) when ready
  if (S.cur.ready && near(world.pipeTip.getWorldPosition(V3()), 60) < Infinity) { cutPiece(); return; }
  // towel (after the eyebrow moment)
  if (S.gag === 'ouch' && (near(world.towel.getWorldPosition(V3()), 90) < Infinity || hit([world.towelBucket]))) { towelToPapa(); return; }
  const h = gatherHit();
  if (h) { ptr.mode = 'glass?'; ptr.hit = h.point.clone(); return; }
  if (hit([world.hose, world.pipe])) { ptr.mode = 'blow'; startBlow(); }
}
function startBlow() { S.blowing = true; }
function s1Move() {
  if (!ptr) return;
  if (ptr.mode === 'glass?' && Math.hypot(ptr.x - ptr.x0, ptr.y - ptr.y0) > 10) {
    ptr.mode = 'grab'; S.grabbing = true;
    const loc = S.cur.mesh.worldToLocal(ptr.hit.clone());
    S.cur.beginGrab(loc); ptr.plane = ptr.hit.clone();
    audio.tone(160, 0.3, { vol: 0.08, slide: 0.7 });
  }
  if (ptr.mode === 'grab') {
    const n = camera.getWorldDirection(V3()).negate();
    const p = planeHit(ptr.plane, n);
    if (p) {
      ptr.tip = p;
      const a = S.cur.mesh.worldToLocal(ptr.plane.clone()), b = S.cur.mesh.worldToLocal(p.clone());
      S.cur.dragGrab(b.sub(a));
      S.cur.pulled = (S.cur.pulled || 0) + 0.02;
    }
  }
}
function s1Up() {
  if (ptr.mode === 'grab') { S.cur.endGrab(); S.grabbing = false; audio.tone(220, 0.2, { vol: 0.05, slide: 0.8 }); }
  if (ptr.mode === 'glass?' && clock.t - ptr.t0 < 0.22) { /* a short tap on glass: a little puff */ S.cur.inflate(0.25, 1); audio.blow(0.6); setTimeout(() => audio.blow(0), 150); }
  if (ptr.mode === 'dish' && S.dish) { S.dish.userData.held = false; }
  S.blowing = false;
}
function updateS1(dt) {
  const g = S.cur;
  // long press on glass becomes blowing
  if (ptr && ptr.mode === 'glass?' && clock.t - ptr.t0 > 0.22) { ptr.mode = 'blow'; startBlow(); }
  if (g) {
    if (g.appear < 1) { g.appear = Math.min(1, g.appear + dt / 1.1); g.group.scale.setScalar(sstep(0, 1, g.appear)); }
    // keep turning the pipe (stop while pulling)
    const spinTarget = S.grabbing ? 0 : (S.dish ? 2.4 : 1.4);
    S.spinRate = smooth(S.spinRate, spinTarget, 4, dt);
    world.spin.rotation.x += S.spinRate * dt;
    // blowing
    if (S.blowing) { g.inflate(dt, 1); if (g.maxR > 0.105) S.over = true; }
    audio.blow(S.blowing ? 1 : 0);
    world.hose.scale.setScalar(1 + (S.blowing ? 0.04 * Math.sin(clock.t * 18) : 0));
    // molten glass relaxes, stays hot near the furnace
    if (g.state === 'hot') {
      g.relax(dt * 2.2);
      for (let i = 0; i < g.n; i++) g.heat[i] = Math.min(1, g.heat[i] + dt * 0.02);
      g.geo.attributes.heat.needsUpdate = true;
      if (g.blown > 0.35 && g.thin > 0.6) for (let i = 0; i < g.n; i++) g.heat[i] = Math.max(0.55, g.heat[i] - dt * 0.12);
    }
    g.update(dt);
    // frit dish rises to the glass
    for (const d of world.frits) {
      const active = d === S.dish && (d.userData.held || S.dishT > 0);
      const home = d.userData.home;
      let tgt = home;
      if (active) {
        const c = g.worldCenter(); const lowY = c.y - g.maxR * 0.92;
        const loc = d.parent.worldToLocal(V3(c.x, lowY - 0.02, c.z));
        tgt = loc;
      }
      d.position.lerp(tgt, 1 - Math.exp(-8 * dt));
      if (active && d.position.distanceTo(tgt) < 0.02) {
        const top = d.getWorldPosition(V3()).y + 0.021, dc = d.getWorldPosition(V3());
        const n = g.paintContact((p) => p.y < top + 0.004 && Math.hypot(p.x - dc.x, p.z - dc.z) < 0.075, d.userData.col);
        if (n) { g.fritUsed.add(d.userData.i); if (Math.random() < 0.5) fx.frit(V3(dc.x, top, dc.z), d.userData.col); if (Math.random() < 0.1) audio.sprinkle(); }
      }
    }
    if (S.dish) { S.dishT -= dt; if (S.dishT <= 0 && !S.dish.userData.held) S.dish = null; }
    if (clock.t - (g.lastPaintBlur || 0) > 0.6) { g.blurPaint(); g.lastPaintBlur = clock.t; }
    // ready to cut?
    const work = (g.blown > 0.6 ? 1 : 0) + (g.fritUsed.size > 0 ? 1 : 0) + ((g.pulled || 0) > 0.6 ? 1 : 0);
    g.ready = work >= 2 || g.blown > 2.0;
    // hot glass light
    const c = g.worldCenter();
    world.glassL.position.copy(c).add(V3(0, g.maxR * 1.8, g.maxR * 1.2));
    blackbody(g.meanHeat(), world.glassL.color);
    const bbI = world.glassL.color.r; world.glassL.color.multiplyScalar(1 / Math.max(bbI, 1e-3));
    world.glassL.intensity = g.appear * (0.25 + g.maxR * 4) * (1 - g.thin * 0.6);
    world.pipeTip.material.emissive.setRGB(0.5, 0.12, 0.02).multiplyScalar(g.appear * 0.6);
  }
  // papa's eyebrow moment: once, when the bubble gets too big (or after the first piece)
  if (S.gag === 'none' && (S.over || (S.made >= 1 && g && g.appear >= 1))) { S.gag = 'walk'; S.gagT = 0; camPreset = CAM.s1gag; camRate = 1.2; }
  updateGag(dt);
  // first-person gloves (put down while the camera pulls back for papa's moment)
  const wide = camPreset === CAM.s1gag;
  fpL.group.visible = fpR.group.visible = jacks.visible = !wide;
  updateHands(dt);
  // hints
  if (S.gag === 'ouch') hintAt(world.towel.getWorldPosition(V3()));
  else if (g && g.ready) hintAt(world.pipeTip.getWorldPosition(V3()));
  else if (g && g.blown < 0.6) hintAt(g.worldCenter());
  else if (g && g.fritUsed.size === 0) hintAt(world.frits[S.made % 3].getWorldPosition(V3()));
  else if (g) hintAt(g.worldCenter());
  // heat haze
  if (g) setHeat(0, g.worldCenter(), g.maxR * 2.2, 0.9 * g.meanHeat() * g.appear);
}
function updateHands(dt) {
  if (!fpR || !fpR.group.visible) return;
  const g = S.cur;
  const fwd = camera.getWorldDirection(V3()), right = V3().crossVectors(fwd, camera.up).normalize(), upv = V3().crossVectors(right, fwd);
  // right hand + jacks: tip follows the finger while pulling, otherwise rests near the glass
  let tip;
  if (S.grabbing && ptr && ptr.tip) tip = ptr.tip.clone();
  else if (g) tip = g.worldCenter().addScaledVector(right, g.maxR + 0.025).addScaledVector(upv, -0.02).addScaledVector(fwd, -0.02);
  else tip = world.pipeTip.getWorldPosition(V3()).addScaledVector(right, 0.08);
  if (S.cutAnim > 0) tip = world.pipeTip.getWorldPosition(V3()).addScaledVector(fwd, -0.01).addScaledVector(upv, 0.01 * Math.sin(S.cutAnim * 30));
  const dir = right.clone().multiplyScalar(-0.3).addScaledVector(upv, 0.55).addScaledVector(fwd, 0.78).normalize();
  const y = dir, z0 = upv.clone().addScaledVector(y, -upv.dot(y)).normalize(), x = V3().crossVectors(y, z0);
  const m = new THREE.Matrix4().makeBasis(x, y, z0);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  fpR.group.quaternion.slerp(q, 1 - Math.exp(-12 * dt));
  const wrist = tip.clone().addScaledVector(y, -0.25).addScaledVector(z0, 0.03);
  fpR.group.position.lerp(wrist, 1 - Math.exp(-14 * dt));
  fpR.setGrip(S.grabbing ? 0.95 : 0.8);
  fpR.update(dt);
  jacks.position.copy(fpR.group.position).addScaledVector(V3(0, 1, 0).applyQuaternion(fpR.group.quaternion), 0.05 * 0.86).addScaledVector(V3(0, 0, -1).applyQuaternion(fpR.group.quaternion), 0.026);
  jacks.quaternion.copy(fpR.group.quaternion);
  jacks.scale.setScalar(1);
  // spread jaws while pulling
  jacks.children[0].rotation.z = S.grabbing ? -0.01 : -0.06; jacks.children[2].rotation.z = S.grabbing ? 0.01 : 0.06;
  // left hand rolls the pipe on the rail
  const roll = Math.sin(world.spin.rotation.x) * 0.03;
  const lp = world.pipe.localToWorld(V3(0.47, 0.0, 0)).add(V3(0, 0.012, roll));
  const F = V3(0.3, -0.28, -1).normalize(), Uv = V3(0, 1, 0).addScaledVector(F, -F.y).normalize(), X = V3().crossVectors(F, Uv);
  fpL.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, F, Uv));
  fpL.group.position.copy(lp).addScaledVector(F, -0.07).addScaledVector(Uv, 0.026);
  fpL.update(dt);
}
function cutPiece() {
  const g = S.cur; if (!g || g.state !== 'hot') return;
  S.cutAnim = 0.45; audio.tone(2600, 0.05, { vol: 0.08 }); audio.tone(2600, 0.05, { vol: 0.08, at: 0.15 });
  setTimeout(() => {
    S.cutAnim = 0;
    audio.clink(1.2); fx.sparks(world.pipeTip.getWorldPosition(V3()), 8);
    const wp = g.worldCenter();
    scene.attach(g.group);
    g.finish();
    g.group.rotation.set(0, Math.random() * 6.28, 0); g.group.scale.setScalar(1);
    g.group.position.copy(wp).y -= g.maxR * 0.5;
    const slot = S.made;
    S.pieces.push(g); g.slot = { kind: 'tray', i: slot }; g.home = world.traySlots[slot].clone();
    // arc away to the hot tray in the cooling corner
    g.fly = { from: g.group.position.clone(), to: g.home.clone(), t: 0, dur: 1.1 };
    for (let i = 0; i < g.n; i++) g.heat[i] = Math.min(g.heat[i], 0.9);
    S.made++; S.cur = null; world.glassL.intensity = 0;
    girlClap();
    if (S.made >= S.need) {
      setTimeout(() => { papaReact('clap'); audio.fanfare(); }, 600);
      setTimeout(goS2, 2400);
    } else {
      setTimeout(() => { if (S.phase === 's1') { newGather(S.made); audio.tone(180, 0.6, { vol: 0.08, slide: 1.6 }); } }, 1500);
    }
  }, 380);
}
function girlClap() { // first-person: the gloves clap together
  S.fpClap = 0.9; audio.voice('yay', 1.6);
  setTimeout(() => { audio.thud(); }, 200); setTimeout(() => { audio.thud(); }, 450);
}
function updateGag(dt) {
  if (S.gag === 'none' || S.gag === 'done' || !papa) return;
  S.gagT += dt;
  const g = S.cur;
  if (S.gag === 'walk') {
    // papa comes over to admire the big bubble, leaning in far too close
    const tgt = V3(1.08, 0, -0.32);
    papa.group.position.lerp(tgt, 1 - Math.exp(-2.2 * dt));
    papa.group.rotation.y = smooth(papa.group.rotation.y, -1.2, 3, dt);
    papa.root.position.y = Math.abs(Math.sin(S.gagT * 7)) * 0.015;
    if (S.gagT > 1.6) { poseOf(papa, 'lean', 3); audio.voice('oo', 0.55); S.gag = 'lean'; S.gagT = 0; }
  } else if (S.gag === 'lean') {
    if (S.gagT > 1.7) {
      // tsk! eyebrows singe
      S.gag = 'ouch'; S.gagT = 0;
      poseOf(papa, 'ouch', 14); papa.jump(1.2); audio.voice('achi', 0.6); audio.burst(0.3, 'highpass', 4000, 0.2);
      const hb = papa.byName.head.getWorldPosition(V3()).add(V3(0, 0.12, 0.05));
      fx.smokePuff(hb, 14);
      papaBrows.forEach(b => { b.scale.set(0.45, 0.8, 0.8); b.material.color.setHex(0x0e0a08); });
      setTimeout(() => { if (S.gag === 'ouch') { setMouth('o'); audio.voice('are', 1.5); } }, 900);
    }
  } else if (S.gag === 'ouch') {
    papa.group.position.lerp(V3(1.35, 0, -0.55), 1 - Math.exp(-3 * dt));
    if (S.gagT % 1.2 < dt) fx.smokePuff(papa.byName.head.getWorldPosition(V3()).add(V3(0, 0.12, 0.05)), 3);
  } else if (S.gag === 'towel') {
    if (S.gagT > 0.8 && !S.towelOn) {
      S.towelOn = true; audio.hiss(); fx.steamAt(papa.byName.head.getWorldPosition(V3()).add(V3(0, 0.14, 0.06)), 3);
      poseOf(papa, 'relief', 5); audio.voice('fuu', 0.55);
    }
    if (S.gagT > 2.4) { papaReact('thumbs'); girlClap(); S.gag = 'done'; setTimeout(() => { camPreset = CAM.s1; camRate = 1.4; }, 1800); setTimeout(() => { poseOf(papa, 'watch'); }, 2600); }
  }
}
function towelToPapa() {
  S.gag = 'towel'; S.gagT = 0; audio.whoosh();
  const towel = world.towel;
  // a folded towel flies onto papa's forehead and stays there
  const small = new THREE.Mesh(rbox(0.2, 0.025, 0.09, 0.012, 0.25), world.mats.terry);
  small.castShadow = true;
  scene.add(small); small.position.copy(towel.getWorldPosition(V3()));
  towel.visible = false;
  flights.push({ o: small, from: small.position.clone(), q0: small.quaternion.clone(), target: papa.byName.head, t: 0, done: () => {
    papa.byName.head.attach(small);
    const hc = new THREE.Vector3(...papa.headC).sub(V3(0, 1.57, -0.012));
    small.position.copy(hc).add(V3(0, 0.06, 0.07)); small.rotation.set(-0.5, 0, 0);
    papaTowel = small; audio.thud();
  } });
}

// ================================================================== S2: cooling corner
function goS2() {
  S.transitioning = true; S.phase = 's2'; camPreset = CAM.s2; camRate = 1.3;
  setTimeout(() => { S.transitioning = false; }, 1800);
  fpL.group.visible = fpR.group.visible = false; jacks.visible = false;
  world.spin.visible = true;
  girl.group.visible = true;
  placeFig(girl, 1.85, -1.3, 1.35); poseOf(girl, 'stand');
  placeFig(papa, 3.75, -1.25, -1.9); poseOf(papa, 'watch');
  if (papaTowel) papaTowel.visible = true;
  tongs.visible = true;
  S.pieces.forEach((p, i) => { p.fly = null; p.group.position.copy(world.traySlots[i]); p.slot = { kind: 'tray', i }; p.home = world.traySlots[i].clone(); });
  S.shelfUsed = new Array(world.shelfSlots.length).fill(null);
}
function pieceAt() {
  let best = null, bd = 1e9;
  for (const p of S.pieces) {
    const h = ray.intersectObject(p.mesh, false)[0];
    const d = h ? 0 : near(p.worldCenter(), 70);
    if (d < bd) { bd = d; best = p; }
  }
  return bd < Infinity ? best : null;
}
function s2Down() {
  const p = pieceAt(); if (!p) return;
  S.hold = p; ptr.mode = 'carry';
  if (p.slot && p.slot.kind === 'shelf') S.shelfUsed[p.slot.i] = null;
  p.slot = { kind: 'held' };
  p.grabY = p.group.position.y;
  audio.tone(1400, 0.05, { vol: 0.05 });
}
function s2Move() {
  if (!S.hold) return;
  const p = S.hold;
  // move in a vertical plane through the corner (facing the camera)
  const n = camera.getWorldDirection(V3()).setY(0).normalize().negate();
  const h = planeHit(V3(2.3, 0.9, -1.72), n);
  if (!h) return;
  h.x = clamp(h.x, 1.3, 3.5); h.y = clamp(h.y, 0.5, 1.6);
  // over the tub: can be dunked into the water
  const tc = world.tubCenter;
  const overTub = Math.hypot(h.x - tc.x, h.z - tc.z) < world.tubR + 0.05;
  const floorY = overTub ? world.waterY - p.maxR * 1.3 : 0.86;
  h.y = Math.max(h.y, floorY);
  p.target = h;
}
function s2Up() {
  const p = S.hold; if (!p) return;
  S.hold = null;
  const pos = p.group.position;
  const tc = world.tubCenter;
  if (Math.hypot(pos.x - tc.x, pos.z - tc.z) < world.tubR + 0.08 && pos.y < world.waterY + 0.25) {
    // dunk briefly then rest on the shelf
    p.target = null; p.dunk = 0.9; p.slot = { kind: 'dunk' };
    return;
  }
  toShelfOrBack(p, pos.x > tc.x + 0.25);
}
function toShelfOrBack(p, wantShelf) {
  if (wantShelf || p.slot.kind === 'dunk') {
    let bi = -1, bd = 1e9;
    world.shelfSlots.forEach((s, i) => { if (S.shelfUsed[i]) return; const d = s.distanceTo(p.group.position); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) {
      S.shelfUsed[bi] = p; p.slot = { kind: 'shelf', i: bi }; p.home = world.shelfSlots[bi].clone(); p.target = null; audio.clink(0.9 + Math.random() * 0.3);
      if (!p.praised) { p.praised = true; girlReact('nod'); }
      return;
    }
  }
  // back to the tray
  const i = S.pieces.indexOf(p); p.slot = { kind: 'tray', i }; p.home = world.traySlots[i].clone(); p.target = null;
}
function updateS2(dt) {
  let sizzle = 0, hottest = 0, hotPos = V3(), sumHeat = 0;
  for (const p of S.pieces) {
    const goal = p.target || p.home;
    if (p.dunk > 0) {
      p.dunk -= dt;
      const tc = world.tubCenter;
      const dg = V3(tc.x, world.waterY - p.maxR * 1.6 * Math.min(1, (0.9 - p.dunk) * 3), tc.z);
      p.group.position.lerp(dg, 1 - Math.exp(-6 * dt));
      if (p.dunk <= 0) { p.dunk = 0; toShelfOrBack(p, true); }
    } else if (goal) p.group.position.lerp(goal, 1 - Math.exp(-(p.target ? 16 : 7) * dt));
    // cooling
    const wy = world.waterY, tc = world.tubCenter, R = world.tubR;
    const kind = p.slot.kind;
    const wet = p.cool(dt, (w) => {
      if (w.y < wy && Math.hypot(w.x - tc.x, w.z - tc.z) < R) return { k: 4.5, water: true };
      if (kind === 'shelf') return { k: 0.2 * (1 + p.thin * 2) };
      if (kind === 'tray') return { k: 0.012 };
      return { k: 0.07 * (1 + p.thin * 2) };
    });
    if (wet) {
      sizzle = Math.max(sizzle, Math.min(1, wet / 400) * p.maxHeat() * 2);
      if (Math.random() < 0.7) fx.steamAt(V3(p.group.position.x, wy + 0.02, p.group.position.z), 1 + p.maxHeat() * 2);
    }
    const mh = p.maxHeat();
    if (mh > 0.12 && mh < 0.5 && Math.random() < dt * 2) audio.tick();
    if (mh > hottest) { hottest = mh; p.worldCenter(hotPos); }
    sumHeat += p.meanHeat();
    if (p.wasHot && mh < 0.06) { p.wasHot = false; audio.chime(S.pieces.indexOf(p) + 2); }
    if (mh > 0.2) p.wasHot = true;
    p.update(dt);
  }
  audio.sizzle(sizzle);
  world.coolL.position.copy(hotPos).add(V3(0, 0.1, 0.1));
  blackbody(Math.max(0.2, hottest), world.coolL.color); world.coolL.color.multiplyScalar(1 / Math.max(world.coolL.color.r, 1e-3));
  world.coolL.intensity = sstep(0.15, 0.8, hottest) * 2.5 + sumHeat * 0.8;
  setHeat(0, hotPos, 0.15, hottest);
  // girl reaches with the tongs to whatever she is carrying
  if (girl) {
    const p = S.hold || S.pieces.find(q => q.dunk > 0);
    const ik = girl.ik.R || (girl.ik.R = { target: V3(), pole: V3(0, -1, -0.5), on: false, weight: 0 });
    if (p) {
      const c = p.worldCenter();
      const sh = girl.byName.upperArmR.getWorldPosition(V3());
      const dirv = sh.clone().sub(c).normalize();
      ik.target.copy(c).addScaledVector(dirv, 0.34); ik.target.y = Math.max(ik.target.y, 0.5);
      ik.on = true; ik.weight = smooth(ik.weight, 1, 8, dt);
      girl.group.position.x = smooth(girl.group.position.x, clamp(c.x - 0.55, 1.4, 2.4), 2, dt);
      const hw = girl.byName.handR.getWorldPosition(V3());
      tongs.visible = true; tongs.position.copy(hw);
      tongs.quaternion.setFromUnitVectors(V3(0, 1, 0), c.clone().sub(hw).normalize());
      tongs.scale.setScalar(Math.max(0.5, hw.distanceTo(c) / 0.39));
    } else {
      ik.weight = smooth(ik.weight, 0, 5, dt); if (ik.weight < 0.02) ik.on = false;
      const hw = girl.byName.handR.getWorldPosition(V3());
      tongs.position.copy(hw); tongs.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(0.15, -1, 0.2).normalize()); tongs.scale.setScalar(1);
    }
  }
  // hints
  const hot = S.pieces.filter(p => p.maxHeat() > 0.06);
  if (!S.hold && hot.length) {
    const onTray = hot.find(p => p.slot.kind === 'tray');
    hintAt(onTray ? onTray.worldCenter() : world.tubCenter.clone().setY(world.waterY + 0.05));
  } else if (S.hold) hintAt(world.tubCenter.clone().setY(world.waterY + 0.05));
  else hintAt(null);
  if (!hot.length && !S.s2done && S.pieces.every(p => p.slot.kind === 'shelf')) {
    S.s2done = true;
    setTimeout(() => { girlReact('happy'); papaReact('clap'); audio.fanfare(); }, 400);
    setTimeout(goS3, 2600);
  }
}

// ================================================================== S3: morning window
let sunCam = null, lightRT = null, casterScene = null, overlay = [];
function setupColouredLight() {
  casterScene = new THREE.Scene();
  lightRT = new THREE.WebGLRenderTarget(1024, 256, { type: THREE.HalfFloatType, depthBuffer: false });
  const c = V3(world.sillX, world.sillY + 0.1, 0);
  sunCam = new THREE.OrthographicCamera(-2.6, 2.6, 0.55, -0.55, 0.1, 12);
  sunCam.position.copy(c).addScaledVector(world.sunDir, -5);
  sunCam.up.set(0, 1, 0); sunCam.lookAt(c); sunCam.updateMatrixWorld(); sunCam.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(sunCam.projectionMatrix, sunCam.matrixWorldInverse);
  const mk = (geo) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { tL: { value: lightRT.texture }, vp: { value: vp }, k: { value: 0 }, xMax: { value: 9 } },
      vertexShader: `uniform mat4 vp; varying vec4 vS; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vS = vp * w; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D tL; uniform float k; uniform float xMax; varying vec4 vS; varying vec3 vW;
        void main(){ vec2 uv = vS.xy / vS.w * 0.5 + 0.5; vec3 c = vec3(1.0);
          if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
            vec3 s = vec3(0.0); float tot = 0.0;
            for (int i = -2; i <= 2; i++) for (int j = -1; j <= 1; j++) { s += texture2D(tL, uv + vec2(float(i) / 1024.0, float(j) / 256.0) * 1.5).rgb; tot += 1.0; }
            c = s / tot; }
          gl_FragColor = vec4(mix(vec3(1.0), c, k * smoothstep(xMax, xMax - 0.15, vW.x)), 1.0); }`,
      blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, depthWrite: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -2
    }));
    m.renderOrder = 2; scene.add(m); overlay.push(m); return m;
  };
  mk(new THREE.PlaneGeometry(3.6, 6.2).rotateX(-Math.PI / 2).translate(2.1, 0.002, 0)).material.uniforms.xMax.value = (world.sillX - 0.16) - world.sillY * (world.sunDir.x / world.sunDir.y) + 0.02;
  mk(new THREE.PlaneGeometry(0.34, 5.8).rotateX(-Math.PI / 2).translate(world.sillX + 0.02, world.sillY + 0.0015, 0));
  for (const p of S.pieces) casterScene.add(p.makeCaster());
}
let crate = null;
function goS3() {
  S.transitioning = true; S.phase = 's3'; camPreset = CAM.s3; camRate = 0.7;
  setTimeout(() => { S.transitioning = false; }, 3800);
  tongs.visible = false; if (girl.ik.R) girl.ik.R.on = false;
  // pieces wait on a wooden crate next to the window
  if (!crate) {
    crate = new THREE.Group(); crate.position.set(3.25, 0, 1.75);
    crate.add(Object.assign(new THREE.Mesh(rbox(0.5, 0.42, 0.36, 0.01, 0.6, 2, true), world.mats.pine), { castShadow: true, receiveShadow: true }));
    crate.children[0].position.y = 0.21;
    scene.add(crate);
  }
  S.crateSlots = [-0.15, 0, 0.15].map(z => V3(3.25, 0.42, 1.75 + z));
  S.pieces.forEach((p, i) => { p.slot = { kind: 'crate', i }; p.home = S.crateSlots[i].clone(); p.target = null; });
  placeFig(girl, 3.2, 0.75, 1.9); poseOf(girl, 'stand');
  placeFig(papa, 2.2, 2.2, 2.2); poseOf(papa, 'watch');
  setupColouredLight();
  S.sunrise = 0;
  audio.furnace(0.05);
}
function s3Down() {
  const p = pieceAt(); if (!p) return;
  S.hold = p; ptr.mode = 'carry'; p.slot = { kind: 'held' }; p.tap = { t: clock.t, x: ptr.x, y: ptr.y }; audio.tone(1500, 0.05, { vol: 0.05 });
}
function s3Move() {
  if (!S.hold) return;
  const p = S.hold;
  // on the sill top plane if the ray reaches it, otherwise a vertical plane
  const top = planeHit(V3(0, world.sillY, 0), V3(0, 1, 0));
  if (top && top.x > world.sillX - 0.3 && top.x < world.sillX + 0.2 && Math.abs(top.z) < 2.3) { p.target = V3(world.sillX - 0.08, world.sillY, clamp(top.z, -2.2, 2.2)); p.onSill = true; }
  else {
    const n = camera.getWorldDirection(V3()).setY(0).normalize().negate();
    const h = planeHit(V3(3.3, 0.8, 0.8), n);
    if (h) { h.y = clamp(h.y, 0.45, 1.5); h.x = clamp(h.x, 2.4, world.sillX); h.z = clamp(h.z, -2.2, 2.4); p.target = h; p.onSill = false; }
  }
}
function s3Up() {
  const p = S.hold; if (!p) return; S.hold = null;
  const moved = Math.hypot(ptr.x - p.tap.x, ptr.y - p.tap.y);
  if (moved < 12 && p.lastSill) {  // tap: turn it a little (light pattern changes)
    p.slot = { kind: 'sill' }; p.target = null; p.spinT = (p.spinT || 0) + Math.PI / 3; audio.chime(Math.floor(Math.random() * 6)); return;
  }
  if (p.onSill && p.target) {
    p.home = p.target.clone(); p.slot = { kind: 'sill' }; p.target = null; p.lastSill = true;
    audio.chime(S.pieces.indexOf(p) + Math.floor(Math.random() * 3));
    if (!p.placed) { p.placed = true; S.s3placed++; girlReact(S.s3placed === 3 ? 'happy' : 'clap'); if (S.s3placed === 3) { papaReact('clap'); setTimeout(() => audio.fanfare(), 300); } }
    else girlReact('wow');
  } else if (p.lastSill && p.home) { p.slot = { kind: 'sill' }; p.target = null; }
  else { const i = S.pieces.indexOf(p); p.slot = { kind: 'crate', i }; p.home = S.crateSlots[i].clone(); p.target = null; }
}
function updateS3(dt) {
  S.sunrise = Math.min(1, (S.sunrise || 0) + dt / 4);
  S.morningK = sstep(0, 1, S.sunrise);
  for (const p of S.pieces) {
    const goal = p.target || p.home;
    if (goal) p.group.position.lerp(goal, 1 - Math.exp(-(p.target ? 14 : 7) * dt));
    if (p.spinT) { const d = p.spinT * dt * 3; p.group.rotation.y += d; p.spinT -= d; if (Math.abs(p.spinT) < 0.001) p.spinT = 0; }
    p.cool(dt, () => ({ k: 0.5 }));
    p.update(dt);
  }
  // girl reaches for the carried piece with her gloved hand (no tool now)
  if (girl) {
    const ik = girl.ik.R || (girl.ik.R = { target: V3(), pole: V3(0, -1, -0.5), on: false, weight: 0 });
    if (S.hold) {
      const c = S.hold.worldCenter();
      ik.target.copy(c).add(V3(-0.04, 0.0, 0)); ik.on = true; ik.weight = smooth(ik.weight, 1, 8, dt);
      const gz = clamp(c.z + 0.28, -2.0, 2.2), gx = clamp(c.x - 0.38, 2.6, 3.45);
      girl.group.position.x = smooth(girl.group.position.x, gx, 2.5, dt); girl.group.position.z = smooth(girl.group.position.z, gz, 2.5, dt);
      girl.root.position.y = Math.abs(Math.sin(clock.t * 9)) * 0.01 * Math.min(1, girl.group.position.distanceTo(V3(gx, 0, gz)) * 10);
    } else { ik.weight = smooth(ik.weight, 0, 5, dt); if (ik.weight < 0.02) ik.on = false; }
  }
  // coloured light map from the sun's view
  if (lightRT) {
    S.pieces.forEach(p => { if (p.caster) p.caster.material.uniforms.sunDir.value.copy(world.sunDir); });
    renderer.setRenderTarget(lightRT); renderer.setClearColor(0xffffff, 1); renderer.clear();
    renderer.render(casterScene, sunCam); renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1);
    overlay.forEach(o => o.material.uniforms.k.value = S.morningK);
  }
  const box = new THREE.Box3(V3(1.6, 0.1, -1.8), V3(3.9, 2.2, 1.8));
  fx.mote(box, S.morningK);
  if (S.morningK > 0.9 && Math.random() < dt * 0.25) audio.birds();
  // hints
  const waiting = S.pieces.filter(p => !p.placed);
  if (S.hold) hintAt(V3(world.sillX, world.sillY + 0.03, S.hold.group.position.z));
  else if (waiting.length) hintAt(waiting[0].worldCenter());
  else hintAt(null);
  setHeat(0, V3(), 0, 0);
}

// ------------------------------------------------------------------ heat haze uniforms
function setHeat(i, wp, r, s) {
  const h = post.heat[i];
  if (s <= 0.02) { h.w = 0; return; }
  const p = wp.clone().project(camera);
  const sz = r / Math.max(0.2, camera.position.distanceTo(wp)) / Math.tan(camera.fov * Math.PI / 360);
  h.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, Math.max(0.02, sz * 0.8), s);
}
function furnaceHaze() {
  setHeat(1, world.mouth.clone().add(V3(0, 0.1, 0.1)), 0.4, 0.8 * (1 - S.morningK));
}

// ------------------------------------------------------------------ figures per frame
function updateFigures(dt) {
  if (girl) {
    girlTimer -= dt;
    if (girlTimer <= 0 && girl.poseName !== 'stand' && !S.hold) { poseOf(girl, 'stand', 5); setMouth('smile'); }
    if (S.clapT > 0) { S.clapT -= dt; const k = Math.sin(clock.t * 22) * 0.18; girl.add.upperArmL.y = k; girl.add.upperArmR.y = -k; } else { girl.add.upperArmL.y = girl.add.upperArmR.y = 0; }
    girl.add.chest.x = Math.sin(clock.t * 1.7) * 0.015; girl.add.head.y = Math.sin(clock.t * 0.6) * 0.06;
    girl.update(dt);
    handGloves.forEach(g => g.update(dt));
    papaGloves.forEach(g => g.update(dt));
  }
  if (papa) {
    papaTimer -= dt;
    if (papaTimer <= 0 && ['clap', 'nod', 'wave', 'thumbs'].includes(papa.poseName)) poseOf(papa, S.phase === 'intro' ? 'stand' : 'watch', 5);
    if (S.papaClapT > 0) { S.papaClapT -= dt; const k = Math.sin(clock.t * 18) * 0.16; papa.add.upperArmL.y = k; papa.add.upperArmR.y = -k; } else { papa.add.upperArmL.y = papa.add.upperArmR.y = 0; }
    papa.add.chest.x = Math.sin(clock.t * 1.3 + 1) * 0.012;
    papa.update(dt);
  }
  if (S.fpClap > 0 && fpL && fpL.group.visible) { S.fpClap -= dt; fpL.group.position.y += Math.abs(Math.sin(S.fpClap * 14)) * 0.03; }
  if (S.phase === 'intro' && girl) {
    // she looks at the board, then at you
    if (!S.gloves || !S.goggles) hintAt(!S.gloves ? handGloves[1].group.getWorldPosition(V3()) : goggles.getWorldPosition(V3()));
    else hintAt(null);
    if (clock.t > 2 && !S.waved) { S.waved = true; papaReact('wave'); audio.voice('hee', 0.55); }
  }
}

// ------------------------------------------------------------------ main loop
let fpsAcc = 0, fpsN = 0, lowCount = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - clock.last) / 1000); clock.last = now; clock.t += dt;
  S.idle += dt;
  // adaptive resolution to stay above ~30fps on phones
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (fps < 32 && PR > 1.0) { PR = Math.max(1.0, PR - 0.25); resize(); }
    if (fps < 24 && PR <= 1.0) { lowCount++; if (lowCount > 1) post.final.uniforms.dof.value = 0; }
  }
  updateFlights(dt);
  if (S.phase === 's1') updateS1(dt);
  else if (S.phase === 's2') updateS2(dt);
  else if (S.phase === 's3') updateS3(dt);
  for (const p of S.pieces) if (p.fly) {
    p.fly.t += dt / p.fly.dur; const k = Math.min(1, p.fly.t);
    p.group.position.lerpVectors(p.fly.from, p.fly.to, sstep(0, 1, k)); p.group.position.y += Math.sin(k * Math.PI) * 0.4;
    if (k >= 1) p.fly = null;
    p.update(dt);
  }
  updateFigures(dt);
  world.update(dt, clock.t, S.morningK);
  furnaceHaze();
  fx.update(dt);
  updateCam(dt);
  updateHint(dt);
  // exposure: keep the play area bright at night, a touch lower in the sunny morning
  renderer.toneMappingExposure = lerp(1.25, 1.0, S.morningK);
  post.render(scene, camera, clock.t);
  if (!S.firstFrame) { S.firstFrame = true; setTimeout(startUpgrades, 400); document.getElementById('cover').style.opacity = 0; }
}

// ------------------------------------------------------------------ boot
snapCam();
updateCam(0);
loadPeople().then(() => {
  if (params.get('jump')) debugJump(params.get('jump'));
  window.__ready = true;
});
requestAnimationFrame((t) => { clock.last = t; frame(t); });

// test hooks (used only for screenshots during development)
function debugJump(to) {
  S.gloves = S.goggles = true; wearGloves(); wearGoggles();
  if (to === 's1' || to === 's2' || to === 's3') {
    goS1(); S.transitioning = false; snapCam();
    if (to !== 's1') {
      for (let i = 0; i < 3; i++) {
        const g = S.cur; g.appear = 1; g.group.scale.setScalar(1);
        for (let k = 0; k < 30 + i * 30; k++) g.inflate(0.05, 1);
        g.update(0); world.spin.updateMatrixWorld(true);
        const cols = [[30, 70, 200], [20, 140, 80], [215, 140, 30]];
        for (let k = 0; k < 40; k++) { world.spin.rotation.x += 0.16; world.spin.updateMatrixWorld(true); g.paintContact((p) => p.y < g.worldCenter().y - g.maxR * 0.75, cols[i]); }
        g.blurPaint(); g.update(0);
        g.fritUsed.add(i);
        const wp = g.worldCenter(); scene.attach(g.group); g.finish(); g.group.rotation.set(0, 0, 0); g.group.position.copy(wp);
        S.pieces.push(g); S.made++;
        newGather(S.made);
      }
      if (S.cur) { S.cur.group.parent.remove(S.cur.group); S.cur = null; }
      S.gag = 'done';
      goS2(); S.transitioning = false; snapCam();
      if (to === 's3') {
        S.pieces.forEach((p, i) => { p.setHeat(0); if (i === 0) { p.crack.fill(0.8); p.geo.attributes.crack.needsUpdate = true; } p.slot = { kind: 'shelf' }; });
        goS3(); S.transitioning = false; S.sunrise = 1; snapCam();
        S.pieces.forEach((p, i) => { p.home = V3(world.sillX - 0.08, world.sillY, -0.7 + i * 0.55); p.group.position.copy(p.home); p.placed = true; p.lastSill = true; });
      }
    }
  }
}
window.__debug = { S, world, camera, CAM, scr: (v) => screenOf(v), get handGloves() { return handGloves; }, get goggles() { return goggles; }, get girl() { return girl; }, get papa() { return papa; }, snapCam, setCam: (k) => { camPreset = CAM[k]; snapCam(); } };
