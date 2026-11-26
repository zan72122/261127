// しょうぼうしの ほうすいくんれん — main: scenes, input, camera, simulation glue.
import * as THREE from '../lib/three.module.min.js';
import { G, initGfx, resize, render, adaptResolution, pbr, tex, wettable, contactShadow, fsq, pending } from './gfx.js';
import { tube, updateTube, limb, roundedBox } from './geo.js';
import { Fire, Puffs, Drops, launchVel, getNoise } from './fx.js';
import { SUN, buildWorld, buildEnv, buildBurnPan, buildPallets, buildBear, buildChair, buildToyTruck, buildBall, buildFan, buildWorkLight, buildRack } from './world.js';
import { Person, peopleMaterials, makeGlove } from './people.js';
import * as A from './audio.js';

const V = THREE.Vector3;
const rnd = Math.random;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- setup
const canvas = document.getElementById('c');
initGfx(canvas);
const scene = new THREE.Scene();
const W = buildWorld(scene);
const H = W.house;
scene.environment = buildEnv(G.renderer, W.sky);
scene.environmentIntensity = 0.6;
const smoke = new Puffs(scene, 420);
smoke.light.sunDir.copy(SUN);
const drops = new Drops(scene, 1500);
const girl = new Person('girl');
const dad = new Person('dad');
scene.add(girl.root, dad.root);
const girlShadow = contactShadow(0.5, 0.5, 0.65); girl.root.add(girlShadow);
const dadShadow = contactShadow(0.75, 0.75, 0.65); dad.root.add(dadShadow);
const M = peopleMaterials();

// fires
const pan = buildBurnPan(); pan.position.set(-0.8, 0, 2.7); scene.add(pan);
const pallets = buildPallets(3); pallets.position.set(2.4, 0, 2.1); pallets.rotation.y = 0.3; scene.add(pallets);
const fires = [
  new Fire(scene, new V((H.holes.u1.x0 + H.holes.u1.x1) / 2, H.holes.u1.y0 + 0.03, -0.28), 0.52, { id: 0, lightZ: 1.6, light: 5 }),
  new Fire(scene, new V((H.holes.u2.x0 + H.holes.u2.x1) / 2, H.holes.u2.y0 + 0.03, -0.28), 0.52, { id: 1, lightZ: 1.6, light: 5 }),
  new Fire(scene, new V(-0.8, 0.11, 2.7), 0.6, { id: 2, light: 6, layers: 4, spread: 0.3, lightZ: 0.4 }),
  new Fire(scene, new V(2.4, 0.44, 2.1), 0.5, { id: 3, light: 5, lightZ: 0.4 }),
];
fires[0].hole = H.holes.u1; fires[1].hole = H.holes.u2;
fires[2].mat = pan.userData.mat; fires[3].mat = pallets.userData.mat;
smoke.fires = fires;

// nozzle + hose (scene 1)
function makeNozzle() {
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0xbdbdb8, metalness: 1, roughness: 0.3, normalMap: tex('steel_n.jpg', false, 6), normalScale: new THREE.Vector2(0.25, 0.25) });
  const blk = pbr('rubber', { tile: 0.04, metal0: true });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb4935a, metalness: 1, roughness: 0.32 });
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.046, 0.046, 0.07, 28).rotateX(Math.PI / 2), brass, 0, 0, -0.16);
  for (let i = 0; i < 3; i++) { const l = add(roundedBox(0.02, 0.03, 0.05, 0.006), brass, 0, 0, -0.16); l.position.x = Math.cos(i * 2.09) * 0.05; l.position.y = Math.sin(i * 2.09) * 0.05; }
  add(new THREE.CylinderGeometry(0.034, 0.04, 0.24, 28).rotateX(Math.PI / 2), alu, 0, 0, -0.02);
  add(new THREE.CylinderGeometry(0.052, 0.046, 0.08, 28).rotateX(Math.PI / 2), blk, 0, 0, 0.13);
  for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.051, 0.004, 6, 28), blk, 0, 0, 0.1 + i * 0.018);
  add(new THREE.CylinderGeometry(0.022, 0.028, 0.03, 20).rotateX(Math.PI / 2), alu, 0, 0, 0.18);
  const grip = add(roundedBox(0.034, 0.11, 0.045, 0.012), blk, 0, -0.075, -0.07, 0.25);
  const bale = new THREE.Mesh(tube({ path: [new V(-0.045, 0.0, -0.08), new V(-0.05, 0.06, -0.03), new V(0, 0.085, 0.0), new V(0.05, 0.06, -0.03), new V(0.045, 0.0, -0.08)], radial: 8, segs: 20, radius: 0.007 }), alu);
  g.add(bale);
  const tip = new THREE.Object3D(); tip.position.set(0, 0, 0.2); g.add(tip);
  g.userData = { tip, grip };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const nozzle = makeNozzle(); scene.add(nozzle);
const hoseMat = pbr('hose', { tile: 0.06, metal0: true, color: 0xe8e0cc });
wettable(hoseMat, { wet: 0.4 });
let hosePts = [new V(0, 0.6, 7.8), new V(0, 0.4, 8.0), new V(0.2, 0.04, 8.4), new V(1.4, 0.04, 8.9), new V(3.0, 0.04, 8.6), new V(4.0, 0.04, 7.7), new V(4.2, 0.4, 7.45)];
const hoseGeo = tube({ path: hosePts, radial: 12, segs: 60, radius: [0.034, 0.03] });
const hose = new THREE.Mesh(hoseGeo, hoseMat); hose.castShadow = true; hose.receiveShadow = true; scene.add(hose);

// ---------------------------------------------------------------- overlay: hint hand + fade
const hintEl = document.getElementById('hint');
const fadeEl = document.getElementById('fade');
let idle = 0;
function fadeCut(fn, color = '#f3d9b8') {
  fadeEl.style.background = color; fadeEl.classList.add('on');
  setTimeout(() => { fn(); setTimeout(() => fadeEl.classList.remove('on'), 120); }, 520);
}

// ---------------------------------------------------------------- camera rig
const cam = { pos: new V(6.7, 1.2, 12.0), look: new V(4.3, 0.85, 9.3), fov: 38, tPos: new V(6.7, 1.2, 12.0), tLook: new V(4.3, 0.85, 9.3), tFov: 38, k: 2, halfW: 20 };
function setCam(pos, look, fov, k = 2, snap = false, halfW = 20) {
  cam.tPos.copy(pos); cam.tLook.copy(look); cam.tFov = fov; cam.k = k; cam.halfW = halfW;
  if (snap) { cam.pos.copy(pos); cam.look.copy(look); cam.fov = fov; }
}
function updateCam(dt) {
  const a = 1 - Math.exp(-dt * cam.k);
  cam.pos.lerp(cam.tPos, a); cam.look.lerp(cam.tLook, a); cam.fov += (cam.tFov - cam.fov) * a;
  const c = G.camera;
  c.position.copy(cam.pos); c.lookAt(cam.look);
  const aspect = G.w / G.h;
  const need = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.halfW)) / aspect) * 180 / Math.PI;
  c.fov = clamp(Math.max(cam.fov, need), cam.fov, 74);
  c.aspect = aspect;
  c.updateProjectionMatrix();
  c.updateMatrixWorld();
}

// ---------------------------------------------------------------- input
const ptr = { down: false, id: -1, ndc: new THREE.Vector2(), x: 0, y: 0, t0: 0 };
const rc = new THREE.Raycaster();
function setNdc(e) { ptr.x = e.clientX; ptr.y = e.clientY; ptr.ndc.set((e.clientX / G.w) * 2 - 1, -(e.clientY / G.h) * 2 + 1); }
function ray() { rc.setFromCamera(ptr.ndc, G.camera); return rc.ray; }
function pick(objs) { rc.setFromCamera(ptr.ndc, G.camera); const h = rc.intersectObjects(objs, true); return h.length ? h[0] : null; }
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault(); A.audioUnlock(); idle = 0;
  if (ptr.down && e.pointerId !== ptr.id) return;
  ptr.down = true; ptr.id = e.pointerId; ptr.t0 = performance.now(); setNdc(e);
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (S && S.down) S.down();
});
canvas.addEventListener('pointermove', (e) => { if (!ptr.down || e.pointerId !== ptr.id) return; idle = 0; setNdc(e); if (S && S.move) S.move(); });
const up = (e) => { if (e.pointerId !== ptr.id) return; ptr.down = false; ptr.id = -1; if (S && S.up) S.up(); };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ---------------------------------------------------------------- helpers
function steamBurst(p, k = 1, n = 5, dir = new V(0, 0, 1)) {
  for (let i = 0; i < n; i++) {
    smoke.spawn({ p: p.clone().add(new V((rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2)), v: new V((rnd() - 0.5) * 2.6 + dir.x * 1.2, 0.5 + rnd() * 2.0, (rnd() - 0.2) * 1.4 + dir.z * 1.2).multiplyScalar(k), size: 0.06 + rnd() * 0.18, grow: 0.7 + rnd() * 1.6, life: 0.8 + rnd() * 1.8, alpha: 0.14 + rnd() * 0.16, col: [0.8, 0.8, 0.82], kind: 1, drag: 2.2, buoy: 0.8 });
  }
}
function glowPulse(mats, on, t, base = 0.25) {
  const v = on ? base * (0.55 + 0.45 * Math.sin(t * 4)) : 0;
  mats.forEach((m) => { if (m.userData.glow) m.userData.glow.value = v; });
}
function wpos(o) { return o.getWorldPosition(new V()); }
function facadeUV(x, y) { const r = H.paintRect; return [(x - r.x0) / r.w, (y - r.y0) / r.h]; }
function groundUV(x, z) { return [(x - W.pad.x0) / W.pad.w, (z - W.pad.z0) / W.pad.d]; }
function groundSplash(p, amt = 0.12, r = 0.16) {
  const [u, v] = groundUV(p.x, p.z);
  if (u > 0 && u < 1 && v > 0 && v < 1) W.groundPaint.splash(u, v, r, amt);
}

// first-person mode for the girl (camera = her eyes, only arms + gloves are drawn)
function girlFP(on) {
  girl.chest.visible = !on; girl.head.visible = !on;
  for (const s of ['R', 'L']) { const L = girl.legs[s]; L.leg.visible = L.boot.visible = !on; }
  girlShadow.visible = !on;
}
function placeFP(fwd) {
  const c = G.camera.position;
  girl.root.position.set(c.x, c.y - girl.D.headY + 0.02, c.z).addScaledVector(new V(fwd.x, 0, fwd.z).normalize(), -0.03);
  girl.root.rotation.y = Math.atan2(fwd.x, fwd.z);
  girl.root.updateMatrixWorld();
}

// ---------------------------------------------------------------- scenes
const scenes = {};
let S = null, sceneName = '';
function go(name) { if (S && S.exit) S.exit(); S = scenes[name]; sceneName = name; S.t = 0; S.enter(); idle = 0; }

// ================================================================ scene 0: dress up at the gear rack
const rack = buildRack(); scene.add(rack);
rack.position.set(3.7, 0, 8.9); rack.rotation.y = Math.atan2(0.95, 0.9);
const helmetProp = girl.makeHelmet(); // a second helmet for the bench
helmetProp.traverse((o) => { if (o.isMesh && o.material.userData && o.material.isMeshPhysicalMaterial) { o.material = o.material.clone(); wettable(o.material); } });
helmetProp.position.set(0.95, 0.45 + 0.06, 0.15); helmetProp.rotation.set(0, 0.6, 0);
rack.add(helmetProp);
const helmetMats = []; helmetProp.traverse((o) => { if (o.isMesh && o.material.userData.glow) helmetMats.push(o.material); });
// hanging coat
function makeHangingCoat() {
  const g = new THREE.Group();
  const D = girl.D;
  const mat = M.coat.clone(); wettable(mat);
  const pts = []; for (let i = 0; i <= 6; i++) pts.push(new V(0, -0.52 + 0.5 * i / 6, 0));
  const body = new THREE.Mesh(tube({ path: pts, radial: 36, segs: 24, up: new V(1, 0, 0), radius: (t) => { const p = girl.coatProf(t); return [p[0] * 1.02, p[1] * 0.55]; }, disp: (t, a) => 0.006 * (1 - t) * Math.sin(a * 6 + 1) }), mat);
  g.add(body);
  const inner = new THREE.Mesh(body.geometry, new THREE.MeshStandardMaterial({ color: 0x15171c, side: THREE.BackSide, roughness: 0.9 })); g.add(inner);
  for (const t0 of [0.06, 0.62]) {
    const bp = []; for (let i = 0; i <= 2; i++) bp.push(new V(0, -0.52 + 0.5 * (t0 + 0.06 * i / 2), 0));
    g.add(new THREE.Mesh(tube({ path: bp, radial: 36, segs: 2, up: new V(1, 0, 0), radius: (t) => { const p = girl.coatProf(t0 + 0.06 * t); return [p[0] * 1.02 + 0.003, p[1] * 0.55 + 0.003]; } }), M.reflect));
  }
  for (const sx of [-1, 1]) {
    const sl = new THREE.Mesh(limb(0.31, D.armR * 1.1, D.armR * 0.95, { flat: 0.8, disp: (t, a) => 0.003 * Math.sin(a * 5 + t * 30) }), mat);
    sl.position.set(sx * 0.13, -0.08, 0.01); sl.rotation.z = Math.PI + sx * 0.12; g.add(sl);
    const gl = makeGlove(girl.D.glove * 0.95, sx > 0 ? 'L' : 'R', { ...M, leather: M.leather });
    gl.position.set(sx * 0.17, -0.4, 0.04); gl.rotation.set(0.1, 0, Math.PI + sx * 0.15); g.add(gl);
  }
  const hanger = new THREE.Mesh(tube({ path: [new V(-0.14, -0.04, 0), new V(0, 0.0, 0), new V(0.14, -0.04, 0)], radial: 8, segs: 12, radius: 0.008 }), pbr('wood', { tile: 0.3, metal0: true }));
  g.add(hanger);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.mat = mat;
  return g;
}
const coatProp = makeHangingCoat(); coatProp.position.set(0, 1.56, 0.06); rack.add(coatProp);

scenes.dress = {
  enter() {
    girl.setDressed(false, false); girlFP(false);
    girl.root.position.set(4.75, 0, 9.95); girl.root.rotation.y = Math.atan2(-1.0, -1.05);
    girl.hold = null;
    dad.root.position.set(5.35, 0, 7.9); dad.root.rotation.y = Math.atan2(-0.6, 1.5);
    dad.hold = null;
    nozzle.visible = false; hose.visible = false;
    setCam(new V(6.55, 1.18, 11.75), new V(4.25, 0.95, 9.15), 40, 2, true, 21);
    W.setSunFocus(new V(4.5, 0, 9.3), 6);
    G.focus = 3.4; G.focusRange = 5;
    this.done = { helmet: false, coat: false }; this.fly = []; this.fin = -1;
  },
  down() {
    const h = pick([helmetProp, coatProp]);
    if (!h) return;
    let o = h.object; while (o.parent && o !== helmetProp && o !== coatProp) o = o.parent;
    if (o === helmetProp && !this.done.helmet && !this.fly.some((f) => f.obj === helmetProp)) this.launch(helmetProp, 'helmet');
    if (o === coatProp && !this.done.coat && !this.fly.some((f) => f.obj === coatProp)) this.launch(coatProp, 'coat');
  },
  launch(obj, kind) {
    scene.attach(obj);
    this.fly.push({ obj, kind, t: 0, from: obj.position.clone(), q0: obj.quaternion.clone() });
    girl.action('nod', 0.8);
    A.burst('whoosh', 0.8);
  },
  update(dt, t) {
    glowPulse(helmetMats, !this.done.helmet, t, 0.35);
    glowPulse([coatProp.userData.mat], !this.done.coat, t, 0.35);
    girl.p.headYaw = Math.sin(t * 0.6) * 0.15 + 0.2;
    for (let i = this.fly.length - 1; i >= 0; i--) {
      const f = this.fly[i]; f.t += dt / 0.75;
      const u = Math.min(1, f.t), e = u * u * (3 - 2 * u);
      const to = f.kind === 'helmet' ? wpos(girl.helmet) : girl.chest.localToWorld(new V(0, 0.18, 0)).add(girl.root.position.clone().sub(girl.root.position));
      const target = f.kind === 'helmet' ? girl.head.localToWorld(girl.helmet.position.clone()) : girl.root.localToWorld(new V(0, girl.D.hipY + 0.15, 0));
      f.obj.position.lerpVectors(f.from, target, e); f.obj.position.y += Math.sin(Math.PI * e) * 0.35;
      f.obj.scale.setScalar(1 - (f.kind === 'coat' ? e * 0.4 : 0));
      if (u >= 1) {
        f.obj.visible = false; this.fly.splice(i, 1);
        this.done[f.kind] = true;
        girl.setDressed(this.done.coat, this.done.helmet);
        A.clank(f.kind === 'helmet' ? 1.4 : 0.8, 0.6); A.say.ya();
        girl.action('cheer', 0.9);
      }
    }
    if (this.done.helmet && this.done.coat && this.fin < 0) { this.fin = 0; }
    if (this.fin >= 0) {
      const was = this.fin; this.fin += dt;
      if (was < 0.4 && this.fin >= 0.4) { girl.action('jump', 1.6); A.say.yay(); A.chime([0, 4, 7, 12]); dad.action('clap', 1.6); A.claps(6, 0.35); }
      if (was < 2.6 && this.fin >= 2.6) go('s1');
    }
  },
  hint() { return !this.done.helmet ? wpos(helmetProp) : (!this.done.coat ? wpos(coatProp) : null); },
};

// ================================================================ scene 1: put out the fires
scenes.s1 = {
  enter() {
    girl.setDressed(true, true); girlFP(false);
    girl.root.position.set(0.42, 0, 7.75); girl.root.rotation.y = Math.PI;
    dad.root.position.set(-1.65, 0, 7.35); dad.root.rotation.y = Math.PI + 0.35;
    dad.hold = null;
    nozzle.visible = true; hose.visible = true;
    setCam(new V(1.3, 1.22, 9.15), new V(-0.4, 1.55, 0), 43, 1.1, false, 23);
    W.setSunFocus(new V(0.2, 0, 4), 9);
    G.focus = 8.3; G.focusRange = 9;
    this.aim = new V(0, 2.2, 0); this.aimCur = new V(0, 1.6, 0.5); this.target = this.aim.clone();
    this.spray = 0; this.emitAcc = 0; this.fin = -1; this.burstBudget = 0; this.outCount = 0;
    this.nozDir = new V(0, 0.2, -1).normalize();
  },
  pickTarget() {
    const r = ray();
    if (r.direction.z < -0.02) {
      const t = -r.origin.z / r.direction.z; const p = r.origin.clone().addScaledVector(r.direction, t);
      if (p.x > -3.3 && p.x < 3.3 && p.y > -0.1 && p.y < 5.5) { if (p.y < 0.05) { /* fallthrough to ground */ } else return p; }
    }
    if (r.direction.y < -0.02) { const t = -r.origin.y / r.direction.y; const p = r.origin.clone().addScaledVector(r.direction, t); if (p.distanceTo(r.origin) < 30) return p; }
    return r.origin.clone().addScaledVector(r.direction, 14);
  },
  down() { this.target.copy(this.pickTarget()); },
  move() { this.target.copy(this.pickTarget()); },
  update(dt, t) {
    // aim smoothing
    this.aimCur.lerp(this.target, 1 - Math.exp(-dt * 7));
    if (this.fin < 0) cam.tLook.set(-0.4, 1.55, 0).lerp(new V(this.aimCur.x, Math.max(0.9, this.aimCur.y), 0), 0.18);
    const spraying = ptr.down && this.fin < 0.5;
    this.spray += ((spraying ? 1 : 0) - this.spray) * (1 - Math.exp(-dt * 10));
    // nozzle at the girl's chest, pointing along the launch velocity
    const base = girl.root.localToWorld(new V(-0.03, 0.66, 0.3));
    const dist = base.distanceTo(this.aimCur);
    const T = dist / 15 + 0.1;
    const v0 = launchVel(base, this.aimCur, T);
    const dir = v0.clone().normalize();
    if (this.spray < 0.05 && !spraying) dir.lerp(new V(0, -0.35, -1).normalize(), 0.0);
    this.nozDir.lerp(dir, 1 - Math.exp(-dt * 10)).normalize();
    nozzle.position.copy(base);
    nozzle.quaternion.setFromUnitVectors(new V(0, 0, 1), this.nozDir);
    nozzle.updateMatrixWorld();
    // recoil wobble
    if (this.spray > 0.1) nozzle.position.addScaledVector(this.nozDir, -0.012 * Math.sin(t * 40) * this.spray);
    // girl's body follows the aim
    const yaw = Math.atan2(this.nozDir.x, -this.nozDir.z);
    girl.p.yaw = clamp(-yaw * 0.5, -0.4, 0.4); girl.p.lean = 0.06 - this.spray * 0.04; girl.p.headPitch = -this.nozDir.y * 0.4; girl.p.crouch = 0.15 + this.spray * 0.1;
    const fwd = this.nozDir, upv = new V(0, 1, 0), side = new V().crossVectors(fwd, upv).normalize();
    girl.hold = {
      R: { p: nozzle.localToWorld(new V(0.0, -0.095, -0.09)), dir: new V(0, -1, 0).applyQuaternion(nozzle.quaternion).lerp(side.clone().negate(), 0.2), palm: fwd.clone(), pole: new V(-0.7, -0.6, 0.1) },
      L: { p: nozzle.localToWorld(new V(0.0, 0.0, 0.1)), dir: side.clone().lerp(fwd, 0.2), palm: new V(0, -1, 0).applyQuaternion(nozzle.quaternion), pole: new V(0.8, -0.6, 0.2) },
    };
    girl.grip.R = 0.85; girl.grip.L = 0.8;
    // hose follows the nozzle tail
    const tail = nozzle.localToWorld(new V(0, 0, -0.2));
    hosePts[0].copy(tail); hosePts[1].copy(nozzle.localToWorld(new V(0, -0.05, -0.45))); hosePts[1].y = Math.max(0.2, hosePts[1].y - 0.15);
    hosePts[2].set(girl.root.position.x + 0.15, 0.04, girl.root.position.z + 0.55);
    updateTube(hoseGeo, hosePts);
    // emit water
    if (this.spray > 0.2) {
      const tip = wpos(nozzle.userData.tip);
      this.emitAcc += dt * 340 * this.spray;
      while (this.emitAcc > 1) {
        this.emitAcc -= 1;
        const v = v0.clone().multiplyScalar(0.98 + rnd() * 0.04);
        v.x += (rnd() - 0.5) * 0.25; v.y += (rnd() - 0.5) * 0.25; v.z += (rnd() - 0.5) * 0.25;
        drops.emit(tip.clone().addScaledVector(v, rnd() * dt), v, { size: 0.028 + rnd() * 0.04, life: 2.2, alpha: 0.9, kind: 0, drag: 0.04 });
      }
      girl.action(null);
    }
    this.burstBudget = Math.min(40, this.burstBudget + dt * 50);
    // lingering steam from hot wet steel
    for (let i = 0; i < 4; i++) {
      const u = rnd(), v = 0.45 + rnd() * 0.55;
      const heat = H.paint.sample('heat', u, v), wet = H.paint.sample('wet', u, v);
      if (heat > 0.06 && wet > 0.25 && rnd() < 0.5) {
        const x = H.paintRect.x0 + u * H.paintRect.w, y = v * H.paintRect.h;
        smoke.spawn({ p: new V(x, y, 0.08), v: new V((rnd() - 0.5) * 0.2, 0.4 + rnd() * 0.4, 0.15), size: 0.15 + rnd() * 0.2, grow: 0.6, life: 2 + rnd() * 2, alpha: 0.18 + heat * 0.4, col: [0.95, 0.95, 0.97], kind: 1, drag: 1.2, buoy: 0.35 });
        H.paint.heat[Math.floor(v * H.paint.h) * H.paint.w + Math.floor(u * H.paint.w)] *= 0.97;
      }
    }
    // fire bookkeeping
    fires.forEach((f, i) => {
      if (f.H <= 0 && !f.counted) {
        f.counted = true; this.outCount++;
        dad.action('nod', 1.0); A.say.ya(); A.chime([0, 7], 0.1, 0.18);
        f.after = 14;
      }
      if (f.after > 0) { // after-steam wisps from wet hot steel / pan / pallets
        f.after -= dt;
        if (rnd() < dt * 8 * (f.after / 14)) smoke.spawn({ p: f.pos.clone().add(new V((rnd() - 0.5) * f.size, f.size * 0.3, (rnd() - 0.5) * 0.3)), v: new V(0, 0.5 + rnd() * 0.4, 0.1), size: 0.2, grow: 0.7, life: 2.5, alpha: 0.3 * (f.after / 14), col: [0.95, 0.95, 0.97], kind: 1, drag: 1, buoy: 0.4 });
      }
      if (f.mat) f.mat.userData.wet.value = Math.max(f.mat.userData.wet.value, (1 - f.H) * 0.9);
      if (f.hole) { // facade glow around a window fades with the fire
        const cx = (f.hole.x0 + f.hole.x1) / 2; const [u, v] = facadeUV(cx, f.hole.y1 + 0.2);
        if (f.H < 0.9 && rnd() < 0.3) H.paint.splat('heat', u, v, 0.5, dt * 0.15 * (1 - f.H), 'sub', 1);
      }
    });
    if (this.outCount >= fires.length && this.fin < 0) this.fin = 0;
    if (this.fin >= 0) {
      const was = this.fin; this.fin += dt;
      if (was < 1.0 && this.fin >= 1.0) { girl.action('jump', 1.8); dad.action('clap', 1.8); A.say.yay(); A.claps(8, 0.4); A.chime([0, 4, 7, 12, 16]); }
      if (was < 1.4 && this.fin >= 1.4) setCam(new V(1.2, 1.5, 9.3), new V(0, 2.2, 0), 42, 0.6, false, 24);
      if (was < 5.0 && this.fin >= 5.0) fadeCut(() => go('s2'));
    }
  },
  collide(q) {
    const p = q.p;
    // through flames
    if (q.kind === 0) {
      for (const f of fires) {
        if (f.H <= 0) continue;
        const cx = f.pos.x, cy = f.pos.y + f.size * 0.5, cz = f.pos.z + (f.hole ? 0.25 : 0);
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        if (dx * dx + dy * dy * 0.6 + dz * dz < f.r * f.r) {
          f.cool(0.0032);
          if (S.burstBudget > 1 && rnd() < 0.35) { S.burstBudget -= 1; steamBurst(p, 1, 2, new V(0, 0, 0.6)); A.burst('sizzle', 0.25); }
          if (rnd() < 0.55) return true;
        }
      }
    }
    // facade plane
    if (q.pp.z > 0 && p.z <= 0 && p.x > H.paintRect.x0 && p.x < H.paintRect.x0 + H.paintRect.w && p.y > 0 && p.y < H.paintRect.h) {
      for (const k of ['u1', 'u2']) {
        const h = H.holes[k];
        if (p.x > h.x0 && p.x < h.x1 && p.y > h.y0 && p.y < h.y1) {
          const f = k === 'u1' ? fires[0] : fires[1];
          if (f.H > 0) { f.cool(0.0026); if (S.burstBudget > 1 && rnd() < 0.3) { S.burstBudget -= 1; steamBurst(new V(p.x, p.y, 0.05), 1, 2); A.burst('sizzle', 0.2); } }
          return true;
        }
      }
      const [u, v] = facadeUV(p.x, p.y);
      H.paint.splash(u, v, 0.08 + rnd() * 0.09, 0.4);
      const heat = H.paint.sample('heat', u, v);
      if (heat > 0.04) {
        H.paint.splat('heat', u, v, 0.22, 0.05, 'sub', 1);
        if (S.burstBudget > 1 && rnd() < 0.5) { S.burstBudget -= 1; steamBurst(new V(p.x, p.y, 0.06), 1 + heat, 2); A.burst('sizzle', 0.15 + heat * 0.3); }
      }
      if (rnd() < 0.25) drops.emit(new V(p.x, p.y, 0.03), new V((rnd() - 0.5) * 1.6, rnd() * 1.6, 0.6 + rnd() * 1.6), { size: 0.01 + rnd() * 0.012, life: 0.8, alpha: 0.6, kind: 1 });
      return true;
    }
    if (p.y <= 0.0) {
      groundSplash(p, 0.15, 0.12 + rnd() * 0.08);
      if (q.kind === 0 && rnd() < 0.15) drops.emit(new V(p.x, 0.01, p.z), new V((rnd() - 0.5) * 1.2, 0.6 + rnd() * 1.2, (rnd() - 0.5) * 1.2), { size: 0.01, life: 0.5, alpha: 0.5, kind: 1 });
      return true;
    }
    return false;
  },
  hint() {
    if (this.fin >= 0) return null;
    let best = null, bd = 1e9;
    for (const f of fires) if (f.H > 0) { const d = f.pos.distanceTo(G.camera.position); if (d < bd) { bd = d; best = f; } }
    return best ? best.pos.clone().add(new V(0, best.size * 0.4, 0.2)) : null;
  },
};

// ================================================================ scene 2: the smoky room
const room = new THREE.Group(); scene.add(room);
const chair = buildChair(); chair.position.set(-2.45, 0, -1.6); chair.rotation.y = Math.PI / 2; room.add(chair);
const bear = buildBear(); bear.position.set(-2.4, 0.46, -1.6); bear.rotation.y = Math.PI / 2; bear.scale.setScalar(1.25); room.add(bear);
const toy = buildToyTruck(); toy.position.set(-0.9, 0.012, -0.55); toy.rotation.y = 2.2; room.add(toy);
const ball = buildBall(); ball.position.set(0.5, 0.012, -2.0); room.add(ball);
const fan = buildFan(); fan.position.set(2.45, 0.012, -0.5); fan.rotation.y = -Math.PI / 2 + 0.05; room.add(fan);
const wl = buildWorkLight(); wl.position.set(2.7, 0.012, -2.12); room.add(wl);
wl.userData.head.rotation.set(0.25, -1.9, 0);
const spot = new THREE.SpotLight(0xffe6c8, 0, 0, 0.75, 0.75, 2);
spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005; spot.shadow.radius = 4;
scene.add(spot); scene.add(spot.target);
const bulb = new THREE.PointLight(0xffc890, 0, 0, 2); bulb.position.set(0.3, 2.3, -1.2); scene.add(bulb);
const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd8a0, emissiveIntensity: 0 })); bulbMesh.position.copy(bulb.position); scene.add(bulbMesh);
[fan, chair, bear, toy, ball].forEach((o) => o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); wettable(m.material); } }));
const glowMats = (o) => { const a = []; o.traverse((m) => { if (m.isMesh && m.material.userData.glow) a.push(m.material); }); return a; };
const bearMats = glowMats(bear), toyMats = glowMats(toy), ballMats = glowMats(ball), fanMats = glowMats(fan);
// thought bubble (picture of the bear)
function makeBubble() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(128, 112, 108, 92, 0, 0, 7); x.fill();
  x.beginPath(); x.arc(70, 215, 18, 0, 7); x.fill(); x.beginPath(); x.arc(44, 240, 10, 0, 7); x.fill();
  x.fillStyle = '#9a6a3c';
  x.beginPath(); x.arc(88, 70, 24, 0, 7); x.fill(); x.beginPath(); x.arc(168, 70, 24, 0, 7); x.fill();
  x.beginPath(); x.arc(128, 118, 62, 0, 7); x.fill();
  x.fillStyle = '#e8cfae'; x.beginPath(); x.ellipse(128, 140, 28, 22, 0, 0, 7); x.fill();
  x.fillStyle = '#1c140e'; x.beginPath(); x.arc(106, 104, 7, 0, 7); x.fill(); x.beginPath(); x.arc(150, 104, 7, 0, 7); x.fill(); x.beginPath(); x.ellipse(128, 132, 9, 7, 0, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(0.32, 0.32, 1); s.renderOrder = 20;
  return s;
}
const bubble = makeBubble(); bubble.visible = false; scene.add(bubble);

// smoke volume (3D grid simulated on the CPU, raymarched in a post pass against the scene depth)
const NX = 26, NY = 10, NZ = 10;
const BOXMIN = new V(-2.98, 0.02, -2.37), BOXMAX = new V(3.0, 2.54, -0.07);
const rho = new Float32Array(NX * NY * NZ), rho2 = new Float32Array(NX * NY * NZ);
const volData = new Uint8Array(NX * NY * NZ);
const volTex = new THREE.Data3DTexture(volData, NX, NY, NZ);
volTex.format = THREE.RedFormat; volTex.type = THREE.UnsignedByteType; volTex.minFilter = volTex.magFilter = THREE.LinearFilter; volTex.unpackAlignment = 1; volTex.needsUpdate = true;
const volPass = fsq(`
precision highp sampler3D;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler3D tVol; uniform sampler2D uNoise;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform vec3 uBoxMin; uniform vec3 uBoxMax;
uniform float uTime; uniform float uSigma; uniform vec4 uWin[3]; uniform vec3 uWinCol; uniform vec3 uAmb; uniform vec3 uLampPos; uniform vec3 uLampCol;
varying vec2 vUv;
vec2 boxHit(vec3 ro, vec3 rd){ vec3 inv = 1.0 / rd; vec3 t0 = (uBoxMin - ro) * inv, t1 = (uBoxMax - ro) * inv; vec3 a = min(t0, t1), b = max(t0, t1); return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z)); }
float dens(vec3 p){
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  float d = texture(tVol, uvw).r;
  float n = texture2D(uNoise, p.xz * 0.33 + vec2(uTime * 0.025, 0.0)).g * 0.6 + texture2D(uNoise, p.xy * 0.45 + vec2(0.0, -uTime * 0.03)).b * 0.4;
  float n2 = texture2D(uNoise, p.zy * 0.8 + vec2(uTime * 0.04, uTime * 0.02)).r;
  return d * clamp(0.25 + 1.5 * n * (0.5 + n2), 0.0, 2.2);
}
void main(){
  vec3 col = texture2D(tColor, vUv).rgb;
  float z = texture2D(tDepth, vUv).x;
  vec4 ndc = vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  vec4 vp = uInvProj * ndc; vp /= vp.w;
  vec3 wp = (uCamWorld * vp).xyz;
  vec3 ro = uCamPos; vec3 rd = wp - ro; float maxT = length(rd); rd /= maxT;
  vec2 h = boxHit(ro, rd);
  float t0 = max(h.x, 0.0), t1 = min(h.y, maxT);
  if (t1 <= t0) { gl_FragColor = vec4(col, 1.0); return; }
  const int N = 20;
  float dt = (t1 - t0) / float(N);
  float jit = fract(sin(dot(vUv * 731.0, vec2(12.9898, 78.233))) * 43758.5453);
  float T = 1.0; vec3 L = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = t0 + (float(i) + jit) * dt;
    vec3 p = ro + rd * t;
    float d = dens(p);
    if (d < 0.003) continue;
    vec3 li = uAmb * (0.75 + 0.35 * (p.y / 2.5));
    for (int k = 0; k < 3; k++) { vec3 dv = p - uWin[k].xyz; li += uWinCol * uWin[k].w * 2.2 / (1.0 + dot(dv, dv) * 1.6); }
    vec3 dl = p - uLampPos; li += uLampCol / (1.0 + dot(dl, dl) * 0.5);
    float a = 1.0 - exp(-d * uSigma * dt);
    L += T * a * li;
    T *= 1.0 - a;
    if (T < 0.01) break;
  }
  gl_FragColor = vec4(col * T + L, 1.0);
}`, {
  tColor: { value: null }, tDepth: { value: null }, tVol: { value: volTex }, uNoise: { value: getNoise() },
  uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new V() },
  uBoxMin: { value: BOXMIN }, uBoxMax: { value: BOXMAX }, uTime: { value: 0 }, uSigma: { value: 1.7 },
  uWin: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uWinCol: { value: new THREE.Color(0.9, 0.52, 0.3) },
  uAmb: { value: new THREE.Color(0.11, 0.105, 0.1) }, uLampPos: { value: new V() }, uLampCol: { value: new THREE.Color(0.42, 0.37, 0.3) },
});
G.vol = { enabled: false, scene: volPass.scene, mat: volPass.mat };
const cellC = (i, j, k) => new V(BOXMIN.x + (i + 0.5) / NX * (BOXMAX.x - BOXMIN.x), BOXMIN.y + (j + 0.5) / NY * (BOXMAX.y - BOXMIN.y), BOXMIN.z + (k + 0.5) / NZ * (BOXMAX.z - BOXMIN.z));
const CS = new V((BOXMAX.x - BOXMIN.x) / NX, (BOXMAX.y - BOXMIN.y) / NY, (BOXMAX.z - BOXMIN.z) / NZ);
function sampleRho(x, y, z) { // x,y,z in cell coords (continuous)
  x = clamp(x - 0.5, 0, NX - 1.001); y = clamp(y - 0.5, 0, NY - 1.001); z = clamp(z - 0.5, 0, NZ - 1.001);
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
  const id = (a, b, c) => a + NX * (b + NY * c);
  const i1 = Math.min(NX - 1, i + 1), j1 = Math.min(NY - 1, j + 1), k1 = Math.min(NZ - 1, k + 1);
  const c00 = rho[id(i, j, k)] * (1 - fx) + rho[id(i1, j, k)] * fx, c10 = rho[id(i, j1, k)] * (1 - fx) + rho[id(i1, j1, k)] * fx;
  const c01 = rho[id(i, j, k1)] * (1 - fx) + rho[id(i1, j, k1)] * fx, c11 = rho[id(i, j1, k1)] * (1 - fx) + rho[id(i1, j1, k1)] * fx;
  return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
}
function rhoAtWorld(p) { return sampleRho((p.x - BOXMIN.x) / CS.x, (p.y - BOXMIN.y) / CS.y, (p.z - BOXMIN.z) / CS.z); }
function transmittance(a, b) {
  const n = 24; let s = 0; const d = a.distanceTo(b) / n; const p = new V();
  for (let i = 0; i < n; i++) { p.lerpVectors(a, b, (i + 0.5) / n); if (p.x < BOXMIN.x || p.x > BOXMAX.x || p.y < BOXMIN.y || p.y > BOXMAX.y || p.z < BOXMIN.z || p.z > BOXMAX.z) continue; s += rhoAtWorld(p) * d; }
  return Math.exp(-s * 1.7 * 0.9);
}
const WINS = [
  { key: 'w1', p: new V((H.holes.w1.x0 + H.holes.w1.x1) / 2, 1.38, -0.05) },
  { key: 'w2', p: new V((H.holes.w2.x0 + H.holes.w2.x1) / 2, 1.38, -0.05) },
  { key: 'back', p: new V(-3.0, 1.38, (H.backWin.z0 + H.backWin.z1) / 2) },
];
WINS.forEach((w) => { w.sh = H.shutters.find((s) => s.key === w.key); w.mats = []; w.sh.group.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); wettable(m.material); w.mats.push(m.material); } }); });
H.shutters.forEach((s) => H.setShutter(s, 0));

function stepSmoke(dt, fanSpeed) {
  const vel = new V(), c = new V();
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    c.copy(cellC(i, j, k));
    vel.set(0, 0.03, 0);
    if (fanSpeed > 0) {
      const fp = fan.position; const along = fp.x - c.x;
      if (along > -0.2) { const lat = Math.hypot(c.y - 0.45, c.z - fp.z); const spread = 0.35 + along * 0.22; vel.x -= fanSpeed * 2.4 * Math.exp(-((lat / spread) ** 2)) / (1 + along * 0.2); }
      vel.y += Math.sin(c.x * 1.3 + S.t) * 0.12 * fanSpeed; vel.z += Math.cos(c.x * 0.9 + S.t * 0.7) * 0.1 * fanSpeed;
    }
    for (const w of WINS) {
      const o = w.sh.open; if (o <= 0.02) continue;
      const d = w.p.clone().sub(c); const dl = d.length();
      vel.addScaledVector(d, o * (0.22 + fanSpeed * 1.5) / (dl * (0.5 + dl * 0.5)));
    }
    // semi-Lagrangian
    const x = (c.x - BOXMIN.x) / CS.x - vel.x * dt / CS.x, y = (c.y - BOXMIN.y) / CS.y - vel.y * dt / CS.y, z = (c.z - BOXMIN.z) / CS.z - vel.z * dt / CS.z;
    let r = sampleRho(x, y, z);
    for (const w of WINS) {
      const o = w.sh.open; if (o <= 0.02) continue;
      const dl = w.p.distanceTo(c);
      if (dl < 0.9) r *= Math.exp(-dt * o * (0.5 + fanSpeed * 2.6) * (1 - dl / 0.9));
    }
    rho2[i + NX * (j + NY * k)] = r;
  }
  // slight diffusion along x (mixing) and write back
  for (let n = 0; n < rho.length; n++) rho[n] = rho2[n];
}
function uploadSmoke() {
  for (let n = 0; n < rho.length; n++) volData[n] = clamp(rho[n], 0, 1) * 255;
  volTex.needsUpdate = true;
}

scenes.s2 = {
  enter() {
    girl.setDressed(true, true); girlFP(true);
    nozzle.visible = false; hose.visible = false;
    fires.forEach((f) => { f.group.visible = false; f.light.intensity = 0; });
    const camP = new V(3.32, 1.02, -1.2);
    setCam(camP, new V(-2.8, 0.85, -1.25), 52, 2, true, 31);
    dad.root.position.set(2.35, 0, -1.98); dad.root.rotation.y = -Math.PI / 2 - 0.25; dad.hold = null;
    W.setSunFocus(new V(0, 1, -1.2), 5);
    G.focus = 3.0; G.focusRange = 5;
    W.hemi.intensity = 0.35; scene.environmentIntensity = 0.45; G.exposure = 1.25;
    spot.intensity = 28; bulb.intensity = 2.5; bulbMesh.material.emissiveIntensity = 6;
    const lh = wpos(wl.userData.head); spot.position.copy(lh); spot.target.position.set(-2.2, 0.6, -1.3);
    volPass.mat.uniforms.uLampPos.value.copy(lh);
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const door = i / (NX - 1); rho[i + NX * (j + NY * k)] = clamp((0.62 + 0.3 * (j / NY)) * (1 - Math.pow(door, 2.2) * 0.85) + (rnd() - 0.5) * 0.08, 0, 1); }
    uploadSmoke();
    G.vol.enabled = true;
    smoke.clear();
    this.fan = 0; this.fanOn = false; this.give = null; this.fin = -1; this.reach = null; this.handed = [];
    this.bubbleT = 0;
  },
  exit() { G.vol.enabled = false; spot.intensity = 0; bulb.intensity = 0; bulbMesh.material.emissiveIntensity = 0; W.hemi.intensity = 0.45; scene.environmentIntensity = 0.6; G.exposure = 1.0; bubble.visible = false; },
  items() { return [{ o: bear, k: 'bear', mats: bearMats }, { o: toy, k: 'toy', mats: toyMats }, { o: ball, k: 'ball', mats: ballMats }].filter((it) => !this.handed.includes(it.k)); },
  down() {
    if (this.give) return;
    const objs = [fan, ...WINS.map((w) => w.sh.group), ...this.items().map((i) => i.o)];
    const h = pick(objs);
    this.wave = !h;
    if (!h) return;
    let o = h.object; while (o.parent && !objs.includes(o)) o = o.parent;
    if (o === fan) { this.fanOn = true; A.clank(0.6, 0.5); return; }
    const w = WINS.find((w) => w.sh.group === o);
    if (w) { if (w.sh.target < 1) { w.sh.target = 1; A.shutter(1.0); } return; }
    const it = this.items().find((i) => i.o === o);
    if (it) {
      const T = transmittance(G.camera.position, wpos(it.o).add(new V(0, 0.15, 0)));
      if (T > 0.18) this.startGive(it);
    }
  },
  move() {
    if (!this.wave) return;
    // fanning the smoke with the hand thins it along the ray
    const r = ray();
    for (let s = 0.6; s < 3.2; s += 0.3) {
      const p = r.origin.clone().addScaledVector(r.direction, s);
      const ci = Math.floor((p.x - BOXMIN.x) / CS.x), cj = Math.floor((p.y - BOXMIN.y) / CS.y), ck = Math.floor((p.z - BOXMIN.z) / CS.z);
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj, k = ck + dk; if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) continue;
        rho[i + NX * (j + NY * k)] *= 0.985;
      }
    }
  },
  startGive(it) {
    this.give = { it, t: 0, from: wpos(it.o), q0: it.o.quaternion.clone() };
    scene.attach(it.o);
    A.burst('whoosh', 0.5);
  },
  update(dt, t) {
    this.t += dt;
    const camP = G.camera.position;
    const fwd = new V(); G.camera.getWorldDirection(fwd);
    placeFP(fwd);
    // fan
    const fanTarget = this.fanOn ? (ptr.down && this.holdFan ? 1.4 : 1.0) : 0;
    this.fan += (fanTarget - this.fan) * (1 - Math.exp(-dt * 1.2));
    fan.userData.rotor.rotation.z -= this.fan * dt * 40;
    A.setLoop('fan', this.fan * 0.9, 120 + this.fan * 200); A.setLoop('motor', this.fan, 300 + this.fan * 300);
    // shutters
    WINS.forEach((w, i) => {
      const s = w.sh; s.open += (s.target - s.open) * (1 - Math.exp(-dt * 2.2));
      H.setShutter(s, s.open);
      volPass.mat.uniforms.uWin.value[i].set(w.p.x, w.p.y, w.p.z, s.open);
      glowPulse(w.mats, s.target < 1, t, 0.12);
    });
    glowPulse(fanMats, !this.fanOn, t, 0.18);
    // smoke sim at ~30 Hz
    this.simAcc = (this.simAcc || 0) + dt;
    if (this.simAcc > 1 / 30) { stepSmoke(this.simAcc, this.fan); this.simAcc = 0; uploadSmoke(); }
    // items reveal glow
    this.items().forEach((it) => {
      const T = transmittance(camP, wpos(it.o).add(new V(0, 0.15, 0)));
      it.T = T;
      glowPulse(it.mats, T > 0.18 && !this.give, t, it.k === 'bear' ? 0.22 : 0.1);
    });
    // dad's thought bubble
    this.bubbleT += dt;
    bubble.visible = this.bubbleT > 1.2 && this.fin < 0;
    bubble.position.copy(dad.head.getWorldPosition(new V())).add(new V(-0.25, 0.36, 0.12));
    bubble.material.opacity = 0.85 + 0.15 * Math.sin(t * 3);
    // girl's hand: reaches toward the finger
    const right = new V().crossVectors(fwd, new V(0, 1, 0)).normalize();
    const rest = camP.clone().addScaledVector(fwd, 0.27).addScaledVector(right, 0.12).add(new V(0, -0.13, 0));
    let handP = rest;
    if (ptr.down && !this.give) { const r = ray(); handP = r.origin.clone().addScaledVector(r.direction, 0.5); handP.y -= 0.04; }
    this.handP = (this.handP || rest.clone()).lerp(handP, 1 - Math.exp(-dt * 9));
    if (this.wave && ptr.down) this.handP.addScaledVector(right, Math.sin(t * 14) * 0.03);
    const restL = camP.clone().addScaledVector(fwd, 0.25).addScaledVector(right, -0.13).add(new V(0, -0.17, 0));
    girl.hold = { R: { p: this.handP.clone(), dir: fwd.clone().add(new V(0, 0.25, 0)), palm: new V(0, -0.3, 0).addScaledVector(right, -0.6).addScaledVector(fwd, 0.4), pole: new V(0.6, -1, -0.2) }, L: { p: restL, dir: fwd.clone().add(new V(0, 0.1, 0)), palm: right.clone().addScaledVector(fwd, 0.2), pole: new V(-0.6, -1, -0.2) } };
    girl.grip.R = ptr.down ? 0.25 : 0.45; girl.grip.L = 0.5;
    // giving an item to dad
    if (this.give) {
      const g = this.give; g.t += dt;
      const dadHands = dad.root.localToWorld(new V(0, dad.D.hipY + 0.25, 0.35));
      if (g.t < 0.8) { // item to girl's hand
        const u = g.t / 0.8, e = u * u * (3 - 2 * u);
        g.it.o.position.lerpVectors(g.from, this.handP.clone().addScaledVector(fwd, 0.12), e); g.it.o.position.y += Math.sin(Math.PI * e) * 0.3;
        girl.grip.R = 0.7;
      } else if (g.t < 1.7) {
        const u = (g.t - 0.8) / 0.9, e = u * u * (3 - 2 * u);
        const a = this.handP.clone().addScaledVector(fwd, 0.12);
        g.it.o.position.lerpVectors(a, dadHands, e); g.it.o.position.y += Math.sin(Math.PI * e) * 0.15;
        dad.hold = { R: { p: dadHands.clone().add(new V(0, 0, -0.12)) }, L: { p: dadHands.clone().add(new V(0, 0, 0.12)) } };
      } else {
        g.it.o.position.copy(dadHands);
        if (!g.reacted) {
          g.reacted = true;
          if (g.it.k === 'bear') { dad.action('cheer', 1.6); A.say.dadYay(); girl.action('jump', 1.4); setTimeout(() => A.say.yay(), 300); A.chime([0, 4, 7, 12, 16]); A.claps(6, 0.3); this.fin = 0; }
          else { dad.action('tilt', 1.3); A.say.huh(); }
        }
        if (g.it.k !== 'bear') {
          if (g.t > 3.0 && !g.happy) { g.happy = true; dad.action('nod', 1.0); A.say.dadYay(); }
          if (g.t > 3.8) { // put the item down by the door
            g.it.o.position.copy(dad.root.localToWorld(new V(0.35 + this.handed.length * 0.25, 0.012, 0.2)));
            g.it.o.quaternion.copy(g.q0);
            this.handed.push(g.it.k); this.give = null; dad.hold = null;
            g.it.mats.forEach((m) => (m.userData.glow.value = 0));
          }
        } else {
          dad.hold = { R: { p: dadHands.clone().add(new V(0, 0.05, -0.1)) }, L: { p: dadHands.clone().add(new V(0, 0.05, 0.1)) } };
        }
      }
    }
    if (this.fin >= 0) {
      const was = this.fin; this.fin += dt;
      if (was < 3.2 && this.fin >= 3.2) fadeCut(() => go('s3'));
    }
  },
  hint() {
    if (this.give || this.fin >= 0) return null;
    const vis = this.items().filter((i) => i.T > 0.18);
    const b = vis.find((i) => i.k === 'bear'); if (b) return wpos(b.o).add(new V(0, 0.2, 0));
    const w = WINS.find((w) => w.sh.target < 1); if (w) return w.p.clone();
    if (!this.fanOn) return wpos(fan).add(new V(0, 0.45, 0));
    return vis.length ? wpos(vis[0].o) : null;
  },
};

// ================================================================ scene 3: hose mishap + ladder rainbow
const D3 = new V(-SUN.x, 0, -SUN.z).normalize(); // facing away from the sun
const R3 = new V().crossVectors(D3, new V(0, 1, 0)).normalize();
const CAM3 = new V(11.48, 1.15, 10.68);
// rainbow sky layer
const MW = 96, MH = 48;
const mist = new Float32Array(MW * MH), mistB = new Float32Array(MW * MH);
const mistData = new Uint8Array(MW * MH * 4);
const mistTex = new THREE.DataTexture(mistData, MW, MH, THREE.RGBAFormat); mistTex.magFilter = mistTex.minFilter = THREE.LinearFilter; mistTex.needsUpdate = true;
const AZ0 = Math.atan2(D3.x, D3.z);
const rainbowMat = new THREE.ShaderMaterial({
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
  uniform sampler2D tMist; uniform vec3 uAnti; uniform float uAz0; uniform float uGain;
  varying vec3 vDir;
  float gs(float x, float c, float w){ float d = (x - c) / w; return exp(-d * d); }
  vec3 spec(float x){ return vec3(gs(x, 0.92, 0.2) + 0.25 * gs(x, 0.0, 0.1), gs(x, 0.55, 0.17), gs(x, 0.16, 0.17)); }
  void main(){
    vec3 d = normalize(vDir);
    float ang = degrees(acos(clamp(dot(d, uAnti), -1.0, 1.0)));
    float az = degrees(atan(d.x, d.z) - uAz0); az = mod(az + 180.0, 360.0) - 180.0;
    float el = degrees(asin(clamp(d.y, -1.0, 1.0)));
    vec2 uv = vec2((az + 70.0) / 140.0, (el + 12.0) / 72.0);
    float m = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(tMist, uv).r : 0.0;
    vec3 c = vec3(0.0);
    float x1 = (ang - 40.3) / 2.2; if (x1 > -0.2 && x1 < 1.2) c += spec(x1);
    float x2 = (53.8 - ang) / 3.4; if (x2 > -0.2 && x2 < 1.2) c += spec(x2) * 0.32;
    c += vec3(0.16, 0.15, 0.14) * smoothstep(25.0, 40.0, ang) * (1.0 - step(40.6, ang));
    gl_FragColor = vec4(c * m * uGain, 1.0);
  }`,
  uniforms: { tMist: { value: mistTex }, uAnti: { value: SUN.clone().negate() }, uAz0: { value: AZ0 }, uGain: { value: 2.2 } },
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
});
const rainbow = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 32), rainbowMat); rainbow.renderOrder = 2; rainbow.frustumCulled = false; rainbow.visible = false; scene.add(rainbow);
function addMist(p, amt) {
  const d = p.clone().sub(G.camera.position).normalize();
  let az = (Math.atan2(d.x, d.z) - AZ0) * 180 / Math.PI; az = ((az + 180) % 360 + 360) % 360 - 180;
  const el = Math.asin(clamp(d.y, -1, 1)) * 180 / Math.PI;
  const u = (az + 70) / 140 * MW, v = (el + 12) / 72 * MH;
  const i = Math.floor(u), j = Math.floor(v);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
    const w = (di === 0 && dj === 0) ? 1 : 0.4;
    mist[y * MW + x] = Math.min(3, mist[y * MW + x] + amt * w);
  }
}
// hose for the gag
const hose3Pts = []; for (let i = 0; i < 12; i++) hose3Pts.push(new V(14, 0.05, 8 + i * 0.2));
const hose3Geo = tube({ path: hose3Pts, radial: 10, segs: 70, radius: [0.034, 0.03] });
const hose3 = new THREE.Mesh(hose3Geo, hoseMat); hose3.castShadow = true; hose3.visible = false; scene.add(hose3);
const noz3 = makeNozzle(); noz3.visible = false; scene.add(noz3);
const hoseGlowMat = hoseMat;

scenes.s3 = {
  enter() {
    girl.setDressed(true, true); girlFP(true); dad.hold = null;
    nozzle.visible = false; hose.visible = false;
    W.setSunFocus(new V(12.5, 0, 6), 15);
    G.focus = 8; G.focusRange = 14;
    // dad with a hose to the right
    this.dadHome = CAM3.clone().addScaledVector(D3, 3.4).addScaledVector(R3, 1.7); this.dadHome.y = 0;
    dad.root.position.copy(this.dadHome); dad.root.rotation.y = Math.atan2(D3.x, D3.z) + 0.9;
    dad.setWet(0); this.dadWet = 0;
    hose3.visible = true; noz3.visible = true; rainbow.visible = true;
    W.truck.setLadder(0.04, 0, 0);
    this.elev = 0.04; this.ext = 0; this.yaw = 0; this.yawT = 0;
    // start looking at the sunset, then turn around
    const sunLook = CAM3.clone().addScaledVector(new V(SUN.x, 0, SUN.z).normalize(), 10).add(new V(0, 1.2, 0));
    setCam(CAM3.clone().add(new V(0, 0.1, 0)), sunLook, 40, 2, true, 22);
    this.phase = 'sunset'; this.pt = 0;
    this.outlet = W.truck.group.localToWorld(new V(-1.3, 0.85, -1.9));
    this.spray = 0; this.emitAcc = 0; this.mistAcc = 0; this.rainbowSeen = false; this.rbSum = 0;
    this.endP = new V(); this.endDir = new V(0, 0, 1);
    this.grab = 0;
    mist.fill(0);
    drops.mat.uniforms.uAnti.value.copy(SUN).negate(); drops.mat.uniforms.uRainbow.value = 1;
  },
  down() {
    if (this.phase === 'whip') {
      // grab the hose anywhere near it
      const sp = this.endP.clone().project(G.camera);
      const sx = (sp.x + 1) / 2 * G.w, sy = (1 - sp.y) / 2 * G.h;
      const h = pick([hose3, noz3]);
      if (h || Math.hypot(sx - ptr.x, sy - ptr.y) < Math.min(G.w, G.h) * 0.3) { this.phase = 'grab'; this.pt = 0; A.clank(0.7, 0.5); A.say.ya(); }
      return;
    }
    if (this.phase === 'ladder' || this.phase === 'free') {
      const h = pick([W.truck.turntable]);
      this.holdLadder = !!h;
    }
  },
  up() { this.holdLadder = false; },
  update(dt, t) {
    this.t += dt; this.pt += dt;
    const camP = G.camera.position;
    const fwd = new V(); G.camera.getWorldDirection(fwd);
    placeFP(fwd);
    const lookMain = CAM3.clone().addScaledVector(D3, 15).add(new V(0, 4.2, 0));
    if (this.phase === 'sunset' && this.pt > 2.8) { this.phase = 'open'; this.pt = 0; setCam(CAM3, lookMain, 38, 0.9, false, 24); }
    const dadHands = dad.root.localToWorld(new V(0, dad.D.hipY + 0.12, 0.42));
    // hose end motion per phase
    const free = this.endP;
    let sprayOn = 0, sprayDir = new V();
    if (this.phase === 'sunset' || this.phase === 'open') {
      free.copy(dadHands); this.endDir.copy(new V(0, 0, 1).applyQuaternion(dad.root.quaternion)).add(new V(0, 0.15, 0)).normalize();
      dad.hold = { R: { p: dadHands.clone().addScaledVector(this.endDir, -0.15) }, L: { p: dadHands.clone().addScaledVector(this.endDir, 0.05) } };
      if (this.phase === 'open' && this.pt > 1.6) { sprayOn = 0.6; }
      if (this.phase === 'open' && this.pt > 3.0) { this.phase = 'whip'; this.pt = 0; A.say.dadOops(); dad.hold = null; dad.action('shake', 1.2); }
    } else if (this.phase === 'whip') {
      // the hose escapes and thrashes around dad, soaking him
      const tt = this.pt;
      const c = dad.root.position.clone();
      const a = tt * 2.3 + Math.sin(tt * 3.1) * 1.2;
      free.set(c.x + Math.cos(a) * 1.0, 0.35 + 0.35 * Math.abs(Math.sin(tt * 4.2)), c.z + Math.sin(a) * 1.0);
      const toDad = c.clone().add(new V(0, 1.0 + Math.sin(tt * 5) * 0.6, 0)).sub(free).normalize();
      this.endDir.lerp(toDad.add(new V(Math.sin(tt * 7) * 0.6, 0.3, Math.cos(tt * 6) * 0.6)).normalize(), 0.3).normalize();
      sprayOn = 1;
      if (!dad.act) dad.action(rnd() < 0.5 ? 'shake' : 'tilt', 0.9);
      if (rnd() < dt * 3) A.burst('splash', 0.5);
    } else if (this.phase === 'grab') {
      // girl holds it down; dad closes the valve
      const target = camP.clone().addScaledVector(fwd, 0.55).add(new V(0, -0.35, 0));
      free.lerp(target, 1 - Math.exp(-dt * 6));
      this.endDir.lerp(fwd.clone().add(new V(0, -0.5, 0)).normalize(), 0.2).normalize();
      sprayOn = this.pt < 1.4 ? 1 - this.pt / 1.4 : 0;
      if (this.pt > 1.6 && !this.shook) { this.shook = true; dad.action('shake', 1.6); A.burst('splash', 0.8); for (let i = 0; i < 40; i++) drops.emit(dad.root.position.clone().add(new V((rnd() - 0.5) * 0.5, 0.8 + rnd() * 0.9, (rnd() - 0.5) * 0.5)), new V((rnd() - 0.5) * 3, rnd() * 2, (rnd() - 0.5) * 3), { size: 0.012, life: 1, alpha: 0.6, kind: 1 }); }
      if (this.pt > 3.4 && !this.thanked) { this.thanked = true; dad.action('nod', 1.2); A.say.dadYay(); }
      if (this.pt > 4.8) { this.phase = 'ladder'; this.pt = 0; }
    } else {
      // hose lies on the ground near the girl
      free.lerp(camP.clone().addScaledVector(fwd, 0.9).addScaledVector(R3, 0.3).setY(0.05), 1 - Math.exp(-dt * 2));
      this.endDir.lerp(fwd.clone().setY(0).normalize(), 0.1).normalize();
    }
    // hose geometry: outlet -> ground -> free end with a whip wave
    const n = hose3Pts.length;
    const o = this.outlet;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const p = hose3Pts[i];
      const groundP = o.clone().lerp(free, u); groundP.y = 0.05;
      if (i === 0) p.copy(o);
      else if (i < n - 3) {
        p.copy(groundP);
        if (this.phase === 'whip') { const w = Math.sin(this.pt * 9 - u * 7) * 0.35 * u * u; p.addScaledVector(R3, w); p.y = 0.05 + Math.max(0, Math.sin(this.pt * 7 - u * 6)) * 0.2 * u * u; }
      } else { const k = (i - (n - 3)) / 2; p.lerpVectors(groundP, free.clone().addScaledVector(this.endDir, -0.35 * (1 - k)), k * 0.7 + 0.3); if (i === n - 1) p.copy(free).addScaledVector(this.endDir, -0.2); }
    }
    updateTube(hose3Geo, hose3Pts);
    noz3.position.copy(free); noz3.quaternion.setFromUnitVectors(new V(0, 0, 1), this.endDir);
    glowPulse([hoseGlowMat], this.phase === 'whip', t, 0.3);
    // spray from the loose hose
    this.spray += (sprayOn - this.spray) * (1 - Math.exp(-dt * 8));
    if (this.spray > 0.05) {
      const tip = noz3.localToWorld(new V(0, 0, 0.2));
      this.emitAcc += dt * 220 * this.spray;
      while (this.emitAcc > 1) { this.emitAcc -= 1; const v = this.endDir.clone().multiplyScalar(7 + rnd() * 2).add(new V((rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8)); drops.emit(tip, v, { size: 0.02 + rnd() * 0.02, life: 1.5, alpha: 0.75, kind: 0, src: 1 }); }
    }
    dad.setWet(this.dadWet);
    if (this.dadWet > 0.3 && rnd() < dt * 20 * this.dadWet) drops.emit(dad.root.localToWorld(new V((rnd() - 0.5) * 0.4, dad.D.hem + rnd() * 0.1, (rnd() - 0.5) * 0.3)), new V(0, -0.5, 0), { size: 0.008 + rnd() * 0.006, life: 1.2, alpha: 0.7, kind: 1 });
    // girl's hands
    const right = new V().crossVectors(fwd, new V(0, 1, 0)).normalize();
    let handR = camP.clone().addScaledVector(fwd, 0.36).addScaledVector(right, 0.16).add(new V(0, -0.28, 0));
    let handL = camP.clone().addScaledVector(fwd, 0.3).addScaledVector(right, -0.2).add(new V(0, -0.34, 0));
    if (this.phase === 'grab') { handR = free.clone().addScaledVector(this.endDir, -0.1).add(new V(0, 0.04, 0)); handL = free.clone().addScaledVector(this.endDir, -0.32).add(new V(0, 0.04, 0)); }
    else if (ptr.down) { const r = ray(); handR = r.origin.clone().addScaledVector(r.direction, 0.5); }
    this.hR = (this.hR || handR.clone()).lerp(handR, 1 - Math.exp(-dt * 9));
    this.hL = (this.hL || handL.clone()).lerp(handL, 1 - Math.exp(-dt * 9));
    girl.hold = { R: { p: this.hR.clone(), dir: fwd.clone().add(new V(0, 0.2, 0)), palm: new V(0, -1, 0).addScaledVector(right, -0.5), pole: new V(0.6, -1, -0.2) }, L: { p: this.hL.clone(), dir: fwd.clone(), palm: new V(0, -1, 0).addScaledVector(right, 0.5), pole: new V(-0.6, -1, -0.2) } };
    girl.grip.R = this.phase === 'grab' ? 0.9 : (ptr.down ? 0.3 : 0.5); girl.grip.L = this.phase === 'grab' ? 0.9 : 0.5;
    // ladder control + spraying the sky
    const T = W.truck;
    const ladderPhase = this.phase === 'ladder' || this.phase === 'free';
    glowPulse([], false, t);
    T.lightBar.material.emissiveIntensity = 0.4 + (Math.sin(t * 9) > 0 ? 2.5 : 0);
    if (ladderPhase) {
      if (ptr.down && this.holdLadder) {
        if (this.elev < 1.0) this.elev = Math.min(1.0, this.elev + dt * 0.35); else this.ext = Math.min(1, this.ext + dt * 0.22);
        if (!this.ladSnd || t - this.ladSnd > 0.25) { this.ladSnd = t; A.clank(0.5 + this.ext * 0.4, 0.25); }
      }
      let skySpray = ptr.down && !this.holdLadder;
      if (skySpray) {
        const r = ray(); this.skyT = r.origin.clone().addScaledVector(r.direction, 24);
        const tt = W.truck.turntable.getWorldPosition(new V());
        const dirXZ = this.skyT.clone().sub(tt); const wantYaw = Math.atan2(dirXZ.x, dirXZ.z) - W.truck.group.rotation.y;
        this.yawT = clamp(Math.atan2(Math.sin(wantYaw), Math.cos(wantYaw)), -0.9, 0.9);
      }
      this.yaw += (this.yawT - this.yaw) * (1 - Math.exp(-dt * 1.5));
      T.setLadder(this.elev, this.ext, this.yaw);
      T.group.updateMatrixWorld(true);
      this.ladSpray = (this.ladSpray || 0) + ((skySpray ? 1 : 0) - (this.ladSpray || 0)) * (1 - Math.exp(-dt * 6));
      if (this.ladSpray > 0.05 && this.skyT) {
        const tip = T.nozzle.getWorldPosition(new V());
        const v0 = launchVel(tip, this.skyT, 1.25 + tip.distanceTo(this.skyT) / 40);
        this.emitAcc += dt * 230 * this.ladSpray;
        const hi = 0.4 + this.elev * 0.6 + this.ext * 0.6;
        while (this.emitAcc > 1) {
          this.emitAcc -= 1;
          const v = v0.clone().multiplyScalar(0.96 + rnd() * 0.08).add(new V((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9));
          const q = drops.emit(tip, v, { size: 0.03 + rnd() * 0.04, life: 3, alpha: 0.7, kind: 0, src: 2 });
          if (q) q.hi = hi;
        }
        A.setLoop('jet', this.ladSpray, 1400); A.setLoop('jetLow', this.ladSpray * 0.6);
      }
      if (this.phase === 'ladder' && this.pt > 0.5) this.phase = 'free';
    }
    // break-up of the ladder stream into fine mist + mist map
    this.mistAcc += dt;
    for (const q of drops.P) {
      if (q.src === 2 && q.kind === 0 && q.age > 0.25 && rnd() < dt * 5 * (q.hi || 1)) {
        drops.emit(q.p, q.v.clone().multiplyScalar(0.25).add(new V((rnd() - 0.5) * 1.5, (rnd() - 0.2) * 1.0, (rnd() - 0.5) * 1.5)), { size: 0.05 + rnd() * 0.1, life: 2.5 + rnd() * 2.5, alpha: 0.22, kind: 2, drag: 1.4, src: 3 });
      }
      if ((q.src === 3 || q.src === 2) && rnd() < 0.5) addMist(q.p, q.src === 3 ? 0.05 : 0.02);
    }
    // decay + blur mist, upload
    const dec = Math.exp(-dt / 1.6);
    let sum = 0;
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
      const k = j * MW + i;
      const a = mist[k] * 0.4 + ((i > 0 ? mist[k - 1] : 0) + (i < MW - 1 ? mist[k + 1] : 0) + (j > 0 ? mist[k - MW] : 0) + (j < MH - 1 ? mist[k + MW] : 0)) * 0.15;
      mistB[k] = a * dec;
    }
    for (let k = 0; k < mist.length; k++) { mist[k] = mistB[k]; const v = Math.min(1, mist[k] * 0.9); mistData[k * 4] = v * 255; mistData[k * 4 + 3] = 255; sum += v; }
    mistTex.needsUpdate = true;
    // rainbow seen? measure mist near the bow band
    this.rbSum = this.rbSum * 0.95 + this.bowMist() * 0.05;
    if (!this.rainbowSeen && this.rbSum > 0.06) { this.rainbowSeen = true; A.chime([0, 4, 7, 11, 14, 19], 0.14, 0.22); A.say.ooh(); dad.action('cheer', 1.6); setTimeout(() => A.say.dadYay(), 500); }
    if (this.rainbowSeen && rnd() < dt * 0.1 && this.rbSum > 0.05) { dad.action('clap', 1.2); }
  },
  bowMist() {
    // sample mist along the primary bow
    let s = 0, n = 0;
    for (let a = -60; a <= 60; a += 6) {
      const az = a * Math.PI / 180;
      // direction at 42deg from antisolar: rotate antisolar up by 42deg around an axis
      const anti = SUN.clone().negate();
      const axis = new V(Math.sin(az), 0, 0);
      const dir = anti.clone().applyAxisAngle(new V().crossVectors(anti, new V(0, 1, 0)).normalize().applyAxisAngle(anti, az), -42 * Math.PI / 180);
      let azd = (Math.atan2(dir.x, dir.z) - AZ0) * 180 / Math.PI; azd = ((azd + 180) % 360 + 360) % 360 - 180;
      const el = Math.asin(dir.y) * 180 / Math.PI;
      const u = Math.floor((azd + 70) / 140 * MW), v = Math.floor((el + 12) / 72 * MH);
      if (u >= 0 && v >= 0 && u < MW && v < MH) { s += Math.min(1, mist[v * MW + u]); n++; }
    }
    return n ? s / n : 0;
  },
  collide(q) {
    const p = q.p;
    if (sceneName === 's3' && (q.src === 1) && S.phase !== 'grab') {
      const d = dad.root.position; const dx = p.x - d.x, dz = p.z - d.z;
      if (dx * dx + dz * dz < 0.12 && p.y < 1.8) { S.dadWet = Math.min(1, S.dadWet + 0.004); if (rnd() < 0.2) drops.emit(p, new V((rnd() - 0.5) * 2, rnd() * 1.5, (rnd() - 0.5) * 2), { size: 0.01, life: 0.6, alpha: 0.6, kind: 1 }); return rnd() < 0.7; }
    }
    if (p.y <= 0) { groundSplash(p, q.kind === 2 ? 0.02 : 0.12, 0.15 + rnd() * 0.1); if (q.kind === 0 && rnd() < 0.15) drops.emit(new V(p.x, 0.01, p.z), new V((rnd() - 0.5) * 1.2, 0.5 + rnd(), (rnd() - 0.5) * 1.2), { size: 0.01, life: 0.5, alpha: 0.5, kind: 1 }); return true; }
    return false;
  },
  hint() {
    if (this.phase === 'whip') return this.endP.clone();
    if (this.phase === 'ladder' || (this.phase === 'free' && this.elev < 0.5)) return W.truck.turntable.getWorldPosition(new V()).add(new V(0, 0.8, 0));
    if (this.phase === 'free' && !this.rainbowSeen) return CAM3.clone().addScaledVector(D3, 20).add(new V(0, 11, 0));
    return null;
  },
};

// ---------------------------------------------------------------- main loop
let last = performance.now(), time = 0;
const hintV = new V();
function tick(dt) {
  time += dt;
  S.update(dt, time);
  girl.update(dt); dad.update(dt);
  if (sceneName === 'dress' || sceneName === 's1') {
    let heat = 0;
    fires.forEach((f) => { f.update(dt, time, G.camera, smoke); heat += Math.max(0, f.H); });
    A.setLoop('fire', Math.min(1, heat * 0.3) * (sceneName === 's1' ? 1 : 0.4)); A.crackle(heat * 0.25 * (sceneName === 's1' ? 1 : 0.4), dt);
    A.setLoop('sizzle', Math.min(1, fires.reduce((a, f) => a + f.steam, 0) * 0.4));
  } else { A.setLoop('fire', 0); A.setLoop('sizzle', 0); }
  if (sceneName === 's1') { const sp = S.spray || 0; A.setLoop('jet', sp, 1600); A.setLoop('jetLow', sp * 0.7, 300); }
  else if (sceneName === 's3') { const sp = Math.max(S.spray || 0, 0); if (!(S.ladSpray > 0.05)) { A.setLoop('jet', sp * 0.8, 1500); A.setLoop('jetLow', sp * 0.5); } }
  else { A.setLoop('jet', 0); A.setLoop('jetLow', 0); }
  if (sceneName !== 's2') { A.setLoop('fan', 0); A.setLoop('motor', 0); }
  A.setLoop('wind', sceneName === 's2' ? 0.2 : 1);
  drops.mat.uniforms.uAspect.value = G.w / G.h;
  drops.update(dt, (q) => (S.collide ? S.collide(q) : false));
  smoke.update(dt, G.camera);
  H.paint.update(dt); W.groundPaint.update(dt);
  updateCam(dt);
  W.sky.position.copy(G.camera.position); W.sky.material.uniforms.uTime.value = time;
  rainbow.position.copy(G.camera.position);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  tick(dt);
  render(scene, time);
  adaptResolution(dt * 1000);
  // hint hand
  idle += dt;
  const hp = S.hint ? S.hint() : null;
  if (hp && idle > 4.0) {
    hintV.copy(hp).project(G.camera);
    if (hintV.z < 1) {
      const x = clamp((hintV.x + 1) / 2 * G.w, 30, G.w - 30), y = clamp((1 - hintV.y) / 2 * G.h, 30, G.h - 30);
      hintEl.style.transform = `translate(${x}px, ${y}px)`; hintEl.classList.add('on');
    }
  } else hintEl.classList.remove('on');
}

// ---------------------------------------------------------------- boot
window.addEventListener('resize', () => resize());
window.__game = { go, scenes, get S() { return S; }, G, girl, dad, fires, W, ptr, cam, setCam, drops, smoke, nozzle,
  step(n, dt = 1 / 30) { for (let i = 0; i < n; i++) tick(dt); },
  press(x, y) { ptr.down = true; ptr.id = 99; ptr.x = x * G.w; ptr.y = y * G.h; ptr.ndc.set(x * 2 - 1, -(y * 2 - 1)); if (S.down) S.down(); },
  drag(x, y) { ptr.x = x * G.w; ptr.y = y * G.h; ptr.ndc.set(x * 2 - 1, -(y * 2 - 1)); if (S.move) S.move(); },
  release() { ptr.down = false; ptr.id = -1; if (S.up) S.up(); } };
const start = params.get('scene') || 'dress';
go(start);
updateCam(0);
// reveal after the first textures arrive (or a short timeout) so we never show blank materials
const loadEl = document.getElementById('load');
let revealed = false;
function reveal() { if (revealed) return; revealed = true; loadEl.classList.add('off'); setTimeout(() => loadEl.remove(), 900); }
Promise.race([Promise.all([...pending]), new Promise((r) => setTimeout(r, 7000))]).then(() => setTimeout(reveal, 150));
requestAnimationFrame(frame);
