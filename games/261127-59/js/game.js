// おちばを はいて やまにしよう — game flow, camera direction, input and hints.
import { T, scene, camera, renderer, resize, render, buildEnvironment, post, quality, viewW, viewH } from './core.js';
import * as FD from './field.js';
import { buildWorld, world, door } from './world.js';
import { rig, buildRig, updateRig, buildBroom, sharedCloth } from './tools.js';
import { Person, makeCap } from './human.js';
import { car, loadCar, driveTo, updateCar } from './car.js';
import * as A from './audio.js';
import { loadBin } from './sdf.js';

const params = new URLSearchParams(location.search);
const $hand = document.getElementById('hand');

// ------------------------------------------------------------ setup
resize();
window.addEventListener('resize', () => { resize(); applyShot(false); });
buildWorld(FD.leafMesh.material);
buildEnvironment();
FD.initLeaves();
const upgradeLeaves = FD.loadLeafTextures(() => { FD.paintStains(FD.leafMesh.material.map.image); });

// ------------------------------------------------------------ timing helpers
let gameTime = 0;
const timers = [];
const wait = (s) => new Promise((r) => timers.push({ t: gameTime + s, r }));
function tickTimers() { for (let i = timers.length - 1; i >= 0; i--) if (gameTime >= timers[i].t) { const r = timers[i].r; timers.splice(i, 1); r(); } }
const ease = (k) => k * k * (3 - 2 * k);

// ------------------------------------------------------------ camera direction (automatic; the player never moves it)
const cam = { pos: new T.Vector3(), look: new T.Vector3(), from: null, t: 1, dur: 1, shot: 'intro', follow: new T.Vector3(), followOn: false };
function shotDef(name) {
  const a = viewW / viewH;
  const p = a < 0.8; // portrait
  const S = {
    intro: p ? [[-0.55, 1.5, 3.1], [0.55, 0.62, -0.9]] : [[-1.0, 1.4, 2.25], [0.55, 0.62, -0.9]],
    fp: p ? [[0, 1.2, 1.2], [0, 0.0, -0.75]] : [[0, 1.16, 1.05], [0, 0.0, -1.0]],
    papa: p ? [[0.2, 1.6, 2.8], [0, 0.45, -2.6]] : [[0.3, 1.45, 1.7], [0, 0.5, -2.8]],
    car: p ? [[1.4, 1.5, 0.9], [-0.7, 0.6, -5.2]] : [[1.5, 1.35, -0.5], [-0.8, 0.6, -5.2]],
    door: p ? [[2.0, 1.5, -1.3], [0.6, 0.95, -6.4]] : [[2.3, 1.45, -2.4], [0.6, 0.95, -6.4]],
    play: p ? [[0, 1.25, 1.2], [0, 0.0, -1.0]] : [[0, 1.2, 0.95], [0, 0.0, -1.4]],
  };
  const d = S[name];
  return { pos: new T.Vector3(...d[0]), look: new T.Vector3(...d[1]), fov: a >= 1 ? 38 : a > 0.8 ? 44 : 40 + (0.8 - a) * 45 };
}
function setShot(name, dur = 1.6) {
  cam.shot = name;
  cam.from = { pos: cam.pos.clone(), look: cam.look.clone() };
  cam.t = 0; cam.dur = dur;
}
function applyShot(instant) {
  const d = shotDef(cam.shot);
  camera.fov = d.fov; camera.updateProjectionMatrix();
  if (instant) { cam.pos.copy(d.pos); cam.look.copy(d.look); cam.t = 1; }
}
function updateCamera(dt) {
  if (camera.userData.lock) return;
  const d = shotDef(cam.shot);
  if (Math.abs(camera.fov - d.fov) > 0.01) { camera.fov += (d.fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  // gentle follow toward where the girl is working (as if stepping forward)
  const want = new T.Vector3();
  if (cam.followOn) {
    const P = rig.P;
    want.set(Math.max(-1.3, Math.min(1.3, P.x * 0.6)), 0, Math.max(-2.6, Math.min(0.4, (P.z + 0.6) * 0.6)));
  }
  cam.follow.lerp(want, 1 - Math.exp(-dt * 0.9));
  const tp = d.pos.clone().add(cam.follow), tl = d.look.clone().add(cam.follow);
  if (cam.t < 1) {
    cam.t = Math.min(1, cam.t + dt / cam.dur);
    const k = ease(cam.t);
    cam.pos.lerpVectors(cam.from.pos, tp, k); cam.look.lerpVectors(cam.from.look, tl, k);
  } else { cam.pos.copy(tp); cam.look.copy(tl); }
  // tiny hand-held breathing so it reads as a real camera
  const b = Math.sin(gameTime * 0.9) * 0.004;
  camera.position.copy(cam.pos); camera.position.y += b;
  camera.lookAt(cam.look);
}

// ------------------------------------------------------------ people & props
const girl = new Person('girl'), papa = new Person('papa'), granny = new Person('grandma');
let cap = null, broomProp = null;
const gloveProps = [];
const flyers = []; // objects flying along arcs
function fly(obj, toFn, dur, onDone) {
  const from = new T.Vector3(); obj.getWorldPosition(from);
  scene.attach(obj);
  flyers.push({ obj, from, toFn, t: 0, dur, onDone });
}
function updateFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t += dt / f.dur;
    const k = ease(Math.min(1, f.t));
    const to = f.toFn();
    f.obj.position.lerpVectors(f.from, to, k);
    f.obj.position.y += Math.sin(k * Math.PI) * 0.35;
    f.obj.rotation.y += dt * 6 * (1 - k);
    if (f.t >= 1) { flyers.splice(i, 1); f.onDone && f.onDone(); }
  }
}

// glowing hint on 3D objects
const glowing = new Set();
function setGlow(obj, on) {
  if (!obj) return;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.glowMat) { o.userData.baseMat = o.material; o.userData.glowMat = o.material.clone(); o.userData.glowMat.emissive = new T.Color(1, 0.85, 0.55); if (o.material.onBeforeCompile) o.userData.glowMat.onBeforeCompile = o.material.onBeforeCompile; }
    o.material = on ? o.userData.glowMat : o.userData.baseMat;
  });
  if (on) glowing.add(obj); else glowing.delete(obj);
}
function updateGlow(t) {
  const k = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 4));
  for (const obj of glowing) obj.traverse((o) => { if (o.isMesh && o.userData.glowMat) o.userData.glowMat.emissiveIntensity = k; });
}

// ------------------------------------------------------------ hint hand (appears after a few idle seconds)
const hint = { idle: 0, target: null, drag: null, phase: 0 };
function worldToScreen(v) {
  const p = v.clone().project(camera);
  return [(p.x * 0.5 + 0.5) * viewW, (-p.y * 0.5 + 0.5) * viewH, p.z < 1];
}
function updateHint(dt) {
  hint.idle += dt;
  const show = hint.idle > (state === 'intro' ? 2.5 : 4.5) && (hint.target || hint.drag) && !busy && !pointer.down;
  if (show) {
    hint.phase += dt;
    let wpos;
    if (hint.drag) {
      const k = (hint.phase % 1.8) / 1.8;
      wpos = new T.Vector3().lerpVectors(hint.drag[0], hint.drag[1], ease(Math.min(1, k * 1.3)));
    } else wpos = hint.target.clone();
    const [sx, sy, vis] = worldToScreen(wpos);
    const bob = hint.drag ? 0 : Math.abs(Math.sin(hint.phase * 4)) * -10;
    $hand.style.transform = `translate(${sx - 22}px, ${sy - 4 + bob}px)`;
    $hand.classList.toggle('show', vis);
  } else { $hand.classList.remove('show'); hint.phase = 0; }
}

// ------------------------------------------------------------ input
const ray = new T.Raycaster();
const ndc = new T.Vector2();
function groundPoint(cx, cy, out) {
  ndc.set((cx / viewW) * 2 - 1, -(cy / viewH) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  let h = 0;
  for (let k = 0; k < 4; k++) {
    const pl = new T.Plane(new T.Vector3(0, 1, 0), -h * 0.9);
    if (!ray.ray.intersectPlane(pl, out)) return false;
    h = FD.heightAt(out.x, out.z);
  }
  out.x = Math.max(FD.F.minX + 0.2, Math.min(FD.F.minX + FD.F.W - 0.2, out.x));
  out.z = Math.max(FD.F.minZ + 0.3, Math.min(FD.F.minZ + FD.F.D - 0.2, out.z));
  return true;
}
const pointer = { down: false, x: 0, y: 0, moved: 0, last: new T.Vector3(), cur: new T.Vector3(), has: false };
const canvasEl = renderer.domElement;
canvasEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  A.initAudio();
  try { canvasEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = 0;
  pointer.has = groundPoint(e.clientX, e.clientY, pointer.cur);
  pointer.last.copy(pointer.cur);
  hint.idle = 0;
  onDown(e.clientX, e.clientY);
});
canvasEl.addEventListener('pointermove', (e) => {
  if (!pointer.down) return;
  pointer.moved += Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y);
  pointer.x = e.clientX; pointer.y = e.clientY;
  hint.idle = 0;
});
const upH = () => { if (!pointer.down) return; pointer.down = false; hint.idle = 0; onUp(); };
canvasEl.addEventListener('pointerup', upH);
canvasEl.addEventListener('pointercancel', upH);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

function screenHit(obj, cx, cy, rpx = 70) {
  const v = new T.Vector3(); obj.getWorldPosition(v);
  const [sx, sy] = worldToScreen(v);
  return Math.hypot(sx - cx, sy - cy) < rpx * Math.max(1, Math.min(viewW, viewH) / 500);
}

// ------------------------------------------------------------ game state
let state = 'loading', busy = false;
const done = { cap: false, gloves: false };
let pressStart = 0, lastColor = 1;
function onDown(cx, cy) {
  if (state === 'intro' && !busy) {
    if (cap && !done.cap && screenHit(cap, cx, cy)) return void takeCap();
    if (!done.gloves && gloveProps.length && screenHit(gloveProps[0], cx, cy, 80)) return void takeGloves();
    if (broomProp && screenHit(broomProp.userData.hit, cx, cy, 90)) return void takeBroom();
    // tapping elsewhere: the girl looks round, the item glows
    girl.hop(); hint.idle = 2.4;
  }
  if (state === 'play') pressStart = gameTime;
}
function onUp() {
  if (state === 'play' && pointer.has && pointer.moved < 18) pokePile(pointer.cur, gameTime - pressStart);
}
function capOnHead() { girl.bones[4].add(cap); cap.position.set(0, 0.158, -0.004); cap.rotation.set(-0.2, 0, 0.05); }

// ---- intro: cap and gloves make her the hotel's little helper
function takeCap() {
  done.cap = true; busy = true; setGlow(cap, false);
  A.chime('pop');
  fly(cap, () => { const v = new T.Vector3(0, 0.158, -0.004); girl.bones[4].localToWorld(v); return v; }, 0.9, () => {
    capOnHead();
    girl.hop(); A.say('girl', 'わあ!'); busy = false; nextIntroHint();
  });
}
function takeGloves() {
  done.gloves = true; busy = true;
  gloveProps.forEach((g) => setGlow(g, false));
  A.chime('pop');
  let n = 0;
  gloveProps.forEach((g, i) => fly(g, () => { const v = new T.Vector3(); girl.bones[i === 0 ? 7 : 10].getWorldPosition(v); return v; }, 0.8, async () => {
    g.visible = false;
    if (++n === 2) {
      await girl.load('girl_gloved'); girl.root.visible = true;
      if (done.cap) capOnHead();
      girl.set('clap'); A.say('girl', 'ぴったり!');
      await wait(1.3); girl.set('idle'); busy = false; nextIntroHint();
    }
  }));
}
function nextIntroHint() {
  hint.idle = 0; hint.drag = null;
  if (!done.cap) { setGlow(cap, true); hint.target = cap.getWorldPosition(new T.Vector3()); }
  else if (!done.gloves) { setGlow(gloveProps[0], true); setGlow(gloveProps[1], true); hint.target = gloveProps[0].getWorldPosition(new T.Vector3()); }
  else { setGlow(broomProp, true); hint.target = broomProp.userData.hit.getWorldPosition(new T.Vector3()); }
}
async function takeBroom() {
  busy = true; setGlow(broomProp, false); setGlow(cap, false); gloveProps.forEach((g) => setGlow(g, false));
  hint.target = null;
  if (!done.cap) { done.cap = true; capOnHead(); }
  if (!done.gloves) { done.gloves = true; gloveProps.forEach((g) => (g.visible = false)); await girl.load('girl_gloved'); capOnHead(); }
  A.chime('ok'); A.say('girl', 'おそうじ するよ!');
  await new Promise((r) => fly(broomProp, () => { const v = new T.Vector3(); girl.bones[10].getWorldPosition(v); return v; }, 0.8, r));
  broomProp.visible = false;
  girl.set('cheer');
  await wait(0.9);
  // camera glides down into the girl's eyes: we become her
  setShot('fp', 1.8);
  await wait(1.0);
  girl.root.visible = false;
  world.bench.position.set(2.85, 0, 0.1); world.bench.rotation.y = -Math.PI / 2;
  rig.visible = true; rig.tool = 'broom'; rig.pose = 'tool';
  rig.P.set(0.25, 0, -1.2);
  await wait(0.8);
  startSweep();
}

// ---- scene 1: sweep the path clean
const PATH = { x0: -0.85, x1: 0.85, z0: -4.7, z1: -0.35 };
let goalTimer = 0, gustTimer = 6, treeTimer = 0;
function startSweep() {
  state = 'sweep'; busy = false; cam.followOn = true; hint.idle = 0; hint.target = null;
  updateSweepHint();
}
function updateSweepHint() {
  const s = FD.dirtiestSpot(PATH.x0, PATH.z0, PATH.x1, PATH.z1);
  const side = s.x >= 0 ? 1 : -1;
  hint.drag = [new T.Vector3(s.x - side * 0.35, 0, s.z), new T.Vector3(s.x + side * 0.65, 0, s.z + 0.1)];
}
function pathClean() {
  const c = FD.coverageIn(PATH.x0, PATH.z0, PATH.x1, PATH.z1);
  const l = FD.looseLeavesIn(PATH.x0, PATH.z0, PATH.x1, PATH.z1);
  return { c, l, ok: c < 0.09 && l < 70 };
}
async function sweepDone() {
  state = 'papa'; busy = true; cam.followOn = false; hint.drag = null;
  A.chime('goal'); A.say('girl', 'できた!');
  rig.pose = 'cheer'; rig.poseT = 0;
  await wait(1.6);
  rig.pose = 'tool'; rig.visible = false;
  setShot('papa', 2.0);
  await papaGag();
}

// ---- dad tries to carry the biggest pile at once, trips, leaves everywhere
let carryFollow = null, matGrow = 1, doorOpen = 0;
async function papaGag() {
  while (!papa.ready) await wait(0.2);
  const pile = FD.biggestPile(-2.6, -5.0, 2.6, 0.2);
  doorOpen = 1;
  papa.root.position.set(0.35, 0, -6.55); papa.root.rotation.y = 0; papa.root.visible = true; papa.set('idle');
  await wait(0.6);
  A.say('papa', 'おっ、 すごい やまだ!');
  const target = new T.Vector3(pile.x + (pile.x > 0 ? -0.5 : 0.5), 0, pile.z + 0.2);
  await new Promise((r) => papa.walkTo([new T.Vector3(0.35, 0, -5.6), target], 1.1, r));
  doorOpen = 0;
  papa.root.rotation.y = Math.atan2(pile.x - papa.root.position.x, pile.z - papa.root.position.z);
  papa.set('scoop'); A.say('papa', 'よいしょ!');
  await wait(0.9);
  papa.root.updateMatrixWorld(true);
  const anchor = () => new T.Vector3(0, 1.02, 0.34).applyMatrix4(papa.root.matrixWorld);
  FD.pickUp(pile.x, pile.z, 0.55, anchor());
  carryFollow = anchor;
  papa.set('carry');
  // walks proudly toward the girl... and trips
  const dir = new T.Vector3(0.0 - papa.root.position.x, 0, -1.6 - papa.root.position.z).normalize();
  const trip = papa.root.position.clone().addScaledVector(dir, Math.min(1.3, papa.root.position.distanceTo(new T.Vector3(0, 0, -1.6)) * 0.6));
  await new Promise((r) => papa.walkTo([trip], 0.9, r));
  papa.set('fall'); A.thud(); A.say('papa', 'うわっ!');
  await wait(0.3);
  carryFollow = null;
  FD.dropCarried(dir.x * 2.4, dir.z * 2.4, 2.8);
  await wait(1.7);
  A.say('girl', 'あーあ');
  await wait(0.9);
  papa.set('getup');
  await wait(1.2);
  papa.set('scratch'); A.say('papa', 'ごめん ごめん');
  await wait(1.6);
  // dad lays out three mats; the sign shows sorting by colour
  for (const m of world.mats) { m.visible = true; m.scale.setScalar(0.01); FD.clearDisc(m.position.x, m.position.z, m.userData.r + 0.02); }
  matGrow = 0;
  papa.set('idle');
  await new Promise((r) => papa.walkTo([new T.Vector3(1.55, 0, -2.6)], 1.0, r));
  papa.root.rotation.y = -Math.PI / 2 - 0.5;
  papa.set('nod'); A.say('papa', 'いろ ごとに あつめて くれる?');
  await wait(1.5);
  papa.set('idle');
  setShot('fp', 1.6);
  await wait(1.2);
  rig.visible = true; rig.tool = 'rake'; rig.pose = 'tool'; rig.P.set(0.0, 0, -1.4);
  A.chime('pop');
  startSort();
}

// ---- scene 2: rake leaves by colour onto the three mats
let lastWrong = [0, 0, 0], reactCool = 0;
function startSort() { state = 'sort'; busy = false; cam.followOn = true; hint.idle = 0; lastWrong = sortProgress().wrong; updateSortHint(); }
function matCounts() { return world.mats.map((m) => FD.countInDisc(m.position.x, m.position.z, m.userData.r + 0.04)); }
function updateSortHint() {
  const counts = matCounts();
  let worst = 0, wv = 1e9;
  counts.forEach((c, i) => { if (c[i] < wv) { wv = c[i]; worst = i; } });
  const m = world.mats[worst];
  let best = null, bd = 1e9;
  for (let i = 0; i < FD.MAXL; i += 3) {
    if (FD.L.st[i] !== 0 || FD.L.col[i] !== worst) continue;
    const d = Math.hypot(FD.L.x[i] - m.position.x, FD.L.z[i] - m.position.z);
    if (d < 0.4 || Math.abs(FD.L.x[i]) > 1.9 || FD.L.z[i] < -4.6 || FD.L.z[i] > 0.4) continue;
    const s = d + Math.abs(FD.L.x[i]) * 0.3;
    if (s < bd) { bd = s; best = new T.Vector3(FD.L.x[i], 0, FD.L.z[i]); }
  }
  hint.drag = best ? [best, m.position.clone().lerp(best, 0.15)] : null;
  hint.target = best ? null : m.position.clone();
}
function sortProgress() {
  const counts = matCounts();
  const NEED = 170;
  let ok = true;
  const wrong = [];
  counts.forEach((c, i) => { if (c[i] < NEED) ok = false; wrong.push(c[0] + c[1] + c[2] - c[i]); });
  return { counts, ok, wrong };
}
async function sortDone() {
  state = 'car'; busy = true; cam.followOn = false; hint.drag = null; hint.target = null;
  A.chime('goal'); A.say('girl', 'やったー!');
  papa.set('clap');
  rig.pose = 'cheer'; rig.poseT = 0;
  await wait(1.8);
  rig.pose = 'tool'; rig.visible = false;
  papa.set('idle');
  await carScene();
}

// ---- scene 3: the guest's car rolls up the clean path
async function carScene() {
  papa.walkTo([new T.Vector3(1.0, 0, -6.35)], 1.2, () => { papa.root.rotation.y = 0.2; papa.set('idle'); });
  setShot('car', 2.0);
  await wait(1.6);
  while (!car.ready || !granny.ready) await wait(0.2);
  car.group.position.set(-9.0, 0, -5.25); car.group.rotation.y = Math.PI / 2; car.group.visible = true;
  A.engineOn(true);
  await new Promise((r) => driveTo(0.35, r));
  A.engineOn(false);
  await wait(0.6);
  // grandma steps out on the far side and walks to the door
  granny.root.position.set(-0.1, 0, -4.15); granny.root.rotation.y = 0; granny.root.visible = true;
  await wait(0.2);
  await new Promise((r) => granny.walkTo([new T.Vector3(2.55, 0, -4.25), new T.Vector3(2.75, 0, -5.4), new T.Vector3(2.4, 0, -6.45), new T.Vector3(0.5, 0, -6.55)], 0.8, r));
  granny.root.rotation.y = Math.PI * 0.85;
  setShot('door', 1.6);
  granny.set('clap'); A.say('grandma', 'まあ、 きれい!');
  papa.set('wave');
  await wait(1.8);
  granny.set('nod');
  await wait(1.0);
  doorOpen = 1; A.chime('bell');
  await new Promise((r) => granny.walkTo([new T.Vector3(0.1, 0, -7.6)], 0.6, r));
  granny.root.visible = false; doorOpen = 0;
  papa.set('thumb'); A.say('papa', 'ありがとう!');
  await wait(1.2);
  papa.walkTo([new T.Vector3(2.3, 0, -3.4)], 1.0, () => { papa.root.rotation.y = -Math.PI / 2 - 0.4; papa.set('idle'); });
  setShot('play', 1.8);
  await wait(1.4);
  rig.visible = true; rig.tool = 'none'; rig.pose = 'rest';
  state = 'play'; busy = false; hint.idle = 0;
  updatePlayHint();
}

// ---- free play: poke piles (harder / more taps = bigger flurry), lay leaf patterns on bare stone
function updatePlayHint() {
  const p = FD.biggestPile(-2.2, -4.6, 2.2, 0.2);
  hint.drag = null; hint.target = new T.Vector3(p.x, p.h * 0.9, p.z);
}
const tapTimes = [];
function pokePile(P, held) {
  rig.pose = 'poke'; rig.pokeT = 0; rig.poke.copy(P);
  tapTimes.push(gameTime);
  while (tapTimes.length && gameTime - tapTimes[0] > 1.4) tapTimes.shift();
  const strength = Math.min(2.8, 0.7 + (tapTimes.length - 1) * 0.45 + Math.min(1.5, held) * 0.9);
  const n = FD.burst(P.x, P.z, 0.28 + strength * 0.1, strength);
  if (n > 0) {
    A.whoosh(Math.min(1.5, n / 120 + 0.3));
    const c = FD.countInDisc(P.x, P.z, 0.6); lastColor = c.indexOf(Math.max(...c));
    if (strength > 1.6 && Math.random() < 0.5) { papa.set('clap'); setTimeout(() => papa.set('idle'), 1500); }
    if (strength > 2.2) A.say('girl', 'わーい!');
  }
}

// ------------------------------------------------------------ per-frame interaction
let placeAcc = 0;
function interact(dt) {
  if (!pointer.down || busy) { rig.press += (0 - rig.press) * Math.min(1, dt * 8); rig.vel.multiplyScalar(0.8); A.rustle(0); return; }
  const P = new T.Vector3();
  if (!groundPoint(pointer.x, pointer.y, P)) return;
  const prev = pointer.last.clone();
  pointer.cur.copy(P); pointer.has = true;
  if (state === 'sweep' || state === 'sort') {
    // the broom head follows the finger with a little lag (bristles drag)
    const head = rig.P.clone().lerp(P, 1 - Math.exp(-dt * 18));
    head.y = FD.heightAt(head.x, head.z) * 0.85;
    const from = rig.P.clone();
    rig.vel.subVectors(head, from).divideScalar(Math.max(dt, 1e-3));
    rig.P.copy(head);
    rig.press += (1 - rig.press) * Math.min(1, dt * 10);
    const dist = Math.hypot(head.x - from.x, head.z - from.z);
    if (dist > 0.002) {
      let moved = 0;
      if (state === 'sweep') {
        const dir = new T.Vector3(head.x - from.x, 0, head.z - from.z).normalize();
        FD.eraseCoverage(from.x, from.z, head.x, head.z, 0.2, 0.7, [head.x + dir.x * 0.12, head.z + dir.z * 0.12]);
        moved = FD.pushLeaves(from.x, from.z, head.x, head.z, 0.4, { lift: 0.03 });
      } else {
        // rake: leaves of the colour whose mat lies ahead follow strongly, others slip through the tines
        const dir = new T.Vector2(head.x - from.x, head.z - from.z).normalize();
        let mask = 7, weak = 1, bestA = 0.6;
        world.mats.forEach((m) => {
          const to = new T.Vector2(m.position.x - head.x, m.position.z - head.z);
          if (to.length() < 0.05) return;
          const cosA = dir.dot(to.normalize());
          if (cosA > bestA) { bestA = cosA; mask = 1 << m.userData.color; weak = 0.1; }
        });
        moved = FD.pushLeaves(from.x, from.z, head.x, head.z, 0.48, { colorMask: mask, weak, lift: 0.015 });
      }
      A.rustle(moved / Math.max(dt * 60, 1));
    } else A.rustle(0);
  } else if (state === 'play') {
    const d = Math.hypot(P.x - prev.x, P.z - prev.z);
    if (pointer.moved > 18 && FD.heightAt(P.x, P.z) < 0.02) {
      placeAcc += d;
      while (placeAcc > 0.075) {
        placeAcc -= 0.075;
        const yaw = Math.atan2(P.x - prev.x, P.z - prev.z) + (Math.random() - 0.5) * 0.4;
        FD.placeLeaf(P.x + (Math.random() - 0.5) * 0.02, P.z + (Math.random() - 0.5) * 0.02, lastColor, yaw);
        A.crackle(0.25);
      }
      rig.pose = 'poke'; rig.pokeT = 0.15; rig.poke.copy(P);
    }
  }
  pointer.last.copy(P);
}

// ------------------------------------------------------------ main loop
let last = performance.now();
const perf = { acc: 0, n: 0, level: 0, frames: 0 };
const WARP = params.has('warp');
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.max(0, (now - last) / 1000); last = now;
  const n = WARP ? Math.min(12, Math.max(1, Math.round(rawDt / 0.05))) : 1;
  for (let k = 0; k < n; k++) logic(Math.min(0.05, rawDt));
  render(gameTime);
  perfAdapt(rawDt);
}
function logic(dt) {
  gameTime += dt;
  tickTimers();
  interact(dt);
  if (state === 'sweep' || state === 'sort' || state === 'play' || state === 'intro') {
    gustTimer -= dt;
    if (gustTimer <= 0) { const p = 0.6 + Math.random() * 0.6; FD.gust(p); A.gustSound(p); gustTimer = 9 + Math.random() * 8; }
    treeTimer -= dt;
    if (treeTimer <= 0) {
      treeTimer = 0.5 + Math.random() * 1.2;
      if (Math.random() < 0.5) FD.dropFromTree(-2.9 + Math.random() * 1.6, 3.0 + Math.random() * 1.5, -5.4 + Math.random() * 2.5, 0);
      else FD.dropFromTree(1.8 + Math.random() * 1.3, 2.4 + Math.random() * 1.2, -6.2 + Math.random() * 1.6, 1);
    }
  }
  if (carryFollow) FD.carry.anchor.copy(carryFollow());
  FD.step(dt, gameTime);
  if (door.left) { const a = door.left.rotation.y, tgt = doorOpen ? 1.3 : 0; door.left.rotation.y = a + (tgt - a) * Math.min(1, dt * 3); door.right.rotation.y = -door.left.rotation.y; }
  if (matGrow < 1) { matGrow = Math.min(1, matGrow + dt * 2); for (const m of world.mats) m.scale.setScalar(Math.max(0.01, ease(matGrow) * 0.75)); }
  const v = updateCar(dt);
  if (v > 0) { FD.carWake(car.group.position.x, car.group.position.z, 2.0, 0.85, v); A.engineSpeed(v); }
  girl.update(dt); papa.update(dt); granny.update(dt);
  updateFlyers(dt);
  updateCamera(dt);
  rig.poseT += dt; rig.pokeT += dt;
  if (rig.pose === 'poke' && rig.pokeT > 0.5) rig.pose = 'rest';
  updateRig(dt, gameTime);
  updateGlow(gameTime);
  updateHint(dt);
  // depth of field: focus on what the girl is touching, or on the action
  const focusPt = state === 'sweep' || state === 'sort' ? rig.P : (state === 'play' && pointer.has) ? pointer.cur : cam.look;
  const fd = camera.position.distanceTo(focusPt);
  post.uFocus.value += (fd - post.uFocus.value) * Math.min(1, dt * 3);
  goalTimer -= dt;
  if (goalTimer <= 0 && !busy) {
    goalTimer = 0.5;
    if (state === 'sweep') { const r = pathClean(); window.__progress = r; if (r.ok) sweepDone(); else if (hint.idle > 3) updateSweepHint(); }
    else if (state === 'sort') {
      const r = sortProgress(); window.__progress = r;
      reactCool -= 0.5;
      r.wrong.forEach((w, i) => {
        if (w - lastWrong[i] > 12 && reactCool <= 0) {
          reactCool = 7; papa.set('puzzled'); A.say('papa', 'あれ?');
          setTimeout(() => { papa.set('thumb'); A.say('papa', 'まあ いっか!'); setTimeout(() => papa.set('idle'), 1300); }, 1300);
        }
      });
      lastWrong = r.wrong;
      if (r.ok) sortDone(); else if (hint.idle > 3) updateSortHint();
    } else if (state === 'play' && hint.idle > 3) updatePlayHint();
  }
}
function perfAdapt(rawDt) {
  // adaptive quality to hold 30fps+ on phones
  perf.acc += rawDt; perf.n++; perf.frames++;
  if (perf.acc > 2.5) {
    const avg = perf.acc / perf.n; window.__fps = Math.round(1 / avg);
    if (avg > 1 / 30 && perf.level < 3 && perf.frames > 120 && !params.has('fixq')) {
      perf.level++;
      if (perf.level === 1) quality.msaa = 0;
      if (perf.level === 2) quality.maxDpr = 1.5;
      if (perf.level === 3) quality.maxDpr = 1.15;
      resize();
    }
    perf.acc = 0; perf.n = 0;
  }
}

// ------------------------------------------------------------ boot: first paint fast, heavy assets after
async function boot() {
  cam.shot = 'intro'; applyShot(true);
  updateCamera(0);
  requestAnimationFrame(frame);
  await new Promise((r) => setTimeout(r, 60));
  document.getElementById('boot').classList.add('hide');
  upgradeLeaves(); FD.groundMat.userData.upgrade();
  // intro props on the bench
  const bench = world.bench;
  bench.position.set(1.25, 0, -0.95); bench.rotation.y = -0.35;
  bench.updateMatrixWorld();
  cap = makeCap();
  cap.position.copy(new T.Vector3(-0.25, 0.465, 0.0).applyMatrix4(bench.matrixWorld)); cap.rotation.y = 0.4;
  scene.add(cap);
  broomProp = buildBroom();
  broomProp.position.copy(new T.Vector3(0.62, 0.0, 0.22).applyMatrix4(bench.matrixWorld)); broomProp.position.y = 0;
  broomProp.rotation.set(0.0, -0.35, -0.42);
  broomProp.userData.hit = new T.Object3D(); broomProp.userData.hit.position.set(0, 0.7, 0); broomProp.add(broomProp.userData.hit);
  broomProp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(broomProp);
  const girlP = girl.load('girl'), rigP = buildRig();
  const go = await loadBin('bin/hand_open.bin');
  for (let i = 0; i < 2; i++) {
    const g = new T.Mesh(go, sharedCloth);
    g.scale.set(0.9, 0.9, i ? -0.9 : 0.9);
    g.position.copy(new T.Vector3(0.12 + i * 0.13, 0.468, 0.02 - i * 0.03).applyMatrix4(bench.matrixWorld));
    g.rotation.set(-Math.PI / 2, 0, 0.5 + i * 0.4);
    g.castShadow = true;
    scene.add(g); gloveProps.push(g);
  }
  await girlP; await rigP;
  girl.root.position.set(0.15, 0, -0.35); girl.root.rotation.y = Math.PI + 0.35; girl.root.visible = true;
  state = 'intro';
  nextIntroHint();
  papa.load('papa'); granny.load('grandma'); loadCar();
  debugJump();
}

// ------------------------------------------------------------ debug / screenshot helpers (?scene=...)
window.__game = { FD, rig, girl, papa, granny, car, world, cam, setShot, get state() { return state; }, sweepDone, sortDone, takeBroom, takeCap, takeGloves, wait };
async function debugJump() {
  const s = params.get('scene');
  if (!s) return;
  if (s === 'intro2') { takeCap(); await wait(1.2); takeGloves(); return; }
  await takeBroom();
  if (params.has('autoclean') || s !== 'sweep') autoSweep(s === 'sweep' ? 0.6 : 1.0);
  if (s === 'sweep') return;
  await wait(0.5); if (state === 'sweep') sweepDone();
  if (s === 'papa') return;
  while (state !== 'sort') await wait(0.5);
  if (params.has('autosort') || s !== 'sort') autoSort();
  if (s === 'sort') return;
  await wait(0.5); if (state === 'sort') sortDone();
  if (!params.has('thumb')) return;
  while (state !== 'play') await wait(0.5);
  await wait(1.0);
  const red = world.mats[1].position;
  FD.burst(red.x, red.z, 0.32, 1.6);
  await wait(0.55);
  camera.userData.lock = true;
  camera.fov = 40; camera.updateProjectionMatrix();
  camera.position.set(-1.25, 0.95, 0.15); camera.lookAt(0.25, 0.12, -1.75);
  post.uFocus.value = 2.0;
}
function autoSweep(frac) {
  for (let z = PATH.z1; z > PATH.z0 + (1 - frac) * (PATH.z1 - PATH.z0) - 0.2; z -= 0.08) {
    for (const side of [-1, 1]) {
      for (let pass = 0; pass < 3; pass++) {
        let x = 0;
        const steps = 30;
        for (let k = 0; k < steps; k++) {
          const nx = side * (k + 1) / steps * 1.45, zz = z + Math.sin(k * 0.4) * 0.02;
          FD.eraseCoverage(x, zz, nx, zz, 0.2, 0.7, [nx + side * 0.12, zz]);
          FD.pushLeaves(x, zz, nx, zz, 0.4, { lift: 0.0 });
          x = nx;
        }
      }
    }
  }
  FD.recomputeGrid();
}
function autoSort() {
  for (let rep = 0; rep < 14; rep++) for (const m of world.mats) {
    const c = m.userData.color;
    for (let i = 0; i < FD.MAXL; i++) {
      if (FD.L.st[i] !== 0 || FD.L.col[i] !== c) continue;
      if (Math.abs(FD.L.x[i]) > 2.4 || FD.L.z[i] < -5 || FD.L.z[i] > 0.6) continue;
      if (Math.random() < 0.12) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.33; FD.L.x[i] = m.position.x + Math.cos(a) * r; FD.L.z[i] = m.position.z + Math.sin(a) * r; FD.L.dirty[i] = 1; }
    }
  }
  FD.recomputeGrid();
}
boot();
