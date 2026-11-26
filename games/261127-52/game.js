// Game flow: dress-up -> aquascape -> water (mom's overflow, towel) -> fish.
import * as M from './main.js';
const { THREE, renderer, scene, camera, audio, rnd, clamp, lerp, ease, V3, sand, pebbles, plants, woods, fish, bubbles, turb, shafts, drops,
  waterBody, surface, surfM, meniscus, motes, WET, sheets, sheetM, girl, floorBoots, arm, momArm, tray, TOOLS, setTray, sign, post, postScene, postCam, MAT, DEBUG } = M;
import { TK, U, SPECIES } from './tank.js';

const canvas = document.getElementById('c');
const hintEl = document.getElementById('hint');
const veil = document.getElementById('veil');

// ------------------------------------------------------------------ camera framing
const PRESET = {
  wide: { target: V3(0.3, 0.6, 0.2), dir: V3(0.38, 0.32, 1).normalize(), w: 1.7, h: 1.25 },
  tank: { target: V3(0, 0.665, 0.0), dir: V3(0, 0.3, 1).normalize(), w: 0.86, h: 0.66 },
  tankHigh: { target: V3(0, 0.75, 0.0), dir: V3(0, 0.26, 1).normalize(), w: 0.9, h: 0.8 },
  floor: { target: V3(0.05, 0.22, 0.48), dir: V3(0.12, 0.95, 1).normalize(), w: 1.05, h: 0.7 },
};
let vfov = 36;
function presetPose(name) {
  const P = PRESET[name];
  const aspect = innerWidth / innerHeight;
  vfov = lerp(54, 34, clamp((aspect - 0.5) / (1.6 - 0.5), 0, 1));
  const th = Math.tan(THREE.MathUtils.degToRad(vfov) / 2);
  let w = P.w, h = P.h;
  if (name.startsWith('tank') && aspect < 0.9) w = 0.75;
  if (name === 'wide' && aspect < 0.9) { w = 1.3; h = 1.5; } // portrait: tank fills the width
  const d = Math.max((h / 2) / th, (w / 2) / (th * aspect));
  const tgt = P.target.clone();
  if (name.startsWith('tank') && aspect < 0.9) tgt.y -= 0.05; // leave room for the sign above, tray below
  return { pos: tgt.clone().addScaledVector(P.dir, d), target: tgt, d };
}
const cam = { from: null, to: null, t: 1, dur: 1, name: 'wide', pos: V3(0, 1, 2), target: V3(0, 0.7, 0) };
function camTo(name, dur = 2.2) {
  cam.from = { pos: cam.pos.clone(), target: cam.target.clone() };
  cam.name = name; cam.t = 0; cam.dur = dur;
}
function camUpdate(dt, t) {
  const to = presetPose(cam.name);
  if (cam.t < 1 && cam.from) {
    cam.t = Math.min(1, cam.t + dt / cam.dur);
    const k = ease(cam.t);
    cam.pos.lerpVectors(cam.from.pos, to.pos, k); cam.target.lerpVectors(cam.from.target, to.target, k);
  } else { cam.pos.copy(to.pos); cam.target.copy(to.target); }
  camera.fov = vfov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  // tiny hand-held breathing
  camera.position.copy(cam.pos).add(V3(Math.sin(t * 0.31) * 0.002, Math.sin(t * 0.43) * 0.0015, 0));
  camera.lookAt(cam.target);
  post.uniforms.uFocus.value = camera.position.distanceTo(cam.target);
  post.uniforms.uAp.value = cam.name === 'wide' ? 0.55 : 0.85;
  // tray: bottom of the view, scaled to fit the width
  const z = 0.42, halfH = z * Math.tan(THREE.MathUtils.degToRad(vfov) / 2), halfW = halfH * camera.aspect;
  const s = Math.min(halfW * 2 * (camera.aspect < 0.9 ? 0.95 : camera.aspect > 1.6 ? 0.36 : 0.42) / 0.37, 1);
  tray.scale.setScalar(s);
  const side = camera.aspect > 1.6 && cam.name !== 'floor';
  tray.position.set(side ? halfW - 0.19 * s - 0.01 : 0, -halfH + 0.04 * s, -z);
  tray.rotation.set(0.62, 0, 0);
  // sign: on the cabinet beside the tank (landscape) or on the wall above (portrait)
  if (camera.aspect >= 0.9) { sign.position.set(0.37, 0.55 + 0.165, -0.2); sign.rotation.set(-0.08, -0.18, 0); }
  else { sign.position.set(0, TK.y1 + 0.2, -0.26); sign.rotation.set(0, 0, Math.PI / 2); }
}

// ------------------------------------------------------------------ state
const S = {
  scene: 'intro', phase: '', t: 0, idle: 0, busy: 0,
  boots: false, sleeves: false, level: 0, gagDone: false, overflow: 0, clearT: 0,
  tool: null, down: false, ptr: null, lastAct: 0, released: [false, false, false], shells: [], stone: null,
  celebrate: 0, girlAnim: { hop: 0, clap: 0, cheer: 0, look: 0 }, spillLevel: 0, wrongTold: false,
};
window.__S = S;
setTray([]);
tray.visible = false;

function setScene(name) {
  S.scene = name; S.t = 0; S.phase = '';
  if (name === 'scape') { setTray(['sand', 'pebble', 'wood', 'plant']); selectTool('sand', true); camTo('tank', 2.6); }
  if (name === 'water') { setTray(['can']); selectTool('can', true); camTo('tankHigh', 2.0); }
  if (name === 'fish') { setTray(['bag0', 'bag1', 'bag2', 'shell', 'stone']); selectTool(null, true); camTo('tankHigh', 2.0); fish.all.forEach(f => { f.hide = false; }); }
  tray.visible = name !== 'intro';
}
function selectTool(key, silent) {
  const prev = S.tool && TOOLS[S.tool];
  if (prev && armCtl.tool !== S.tool) homeTool(prev);
  S.tool = key;
  if (key && !silent) audio.pick();
}

// ------------------------------------------------------------------ girl (wide shots) animation
const GA = S.girlAnim;
function girlUpdate(dt, t) {
  const U2 = girl.userData;
  GA.hop = Math.max(0, GA.hop - dt); GA.clap = Math.max(0, GA.clap - dt); GA.cheer = Math.max(0, GA.cheer - dt);
  const hopY = GA.hop > 0 ? Math.abs(Math.sin((0.9 - GA.hop) / 0.9 * Math.PI * 2)) * 0.07 : 0;
  U2.body.position.y = hopY;
  U2.body.rotation.z = Math.sin(t * 1.1) * 0.012;
  U2.body.rotation.x = Math.sin(t * 0.7) * 0.01;
  // arms: hang + sway / clap / cheer
  for (const a of U2.arms) {
    let rx = Math.sin(t * 1.3 + a.sx) * 0.03, rz = a.sx * 0.08;
    if (GA.clap > 0) { const c = Math.sin(GA.clap * 18) * 0.5 + 0.5; rx = -1.15; rz = a.sx * (0.25 - 0.22 * c); }
    if (GA.cheer > 0) { rx = -0.3; rz = a.sx * 2.5; }
    if (!S.sleeves && S.scene === 'intro') rx += Math.sin(t * 3) * 0.05; // her arm wiggles: "touch my sleeve"
    a.pivot.rotation.x = lerp(a.pivot.rotation.x, rx, Math.min(1, dt * 10));
    a.pivot.rotation.z = lerp(a.pivot.rotation.z, rz, Math.min(1, dt * 10));
  }
  if (GA.clap > 0 && Math.floor(GA.clap * 18 / Math.PI) !== Math.floor((GA.clap + dt) * 18 / Math.PI) && Math.sin(GA.clap * 18) > 0.8) {}
}

// boots fly onto her feet
const bootAnim = { t: -1 };
function putBoots() {
  if (S.boots) return; S.boots = true; bootAnim.t = 0; audio.whoosh(0.25);
}
function bootsUpdate(dt) {
  if (bootAnim.t < 0) return;
  bootAnim.t += dt;
  const k = Math.min(1, bootAnim.t / 0.8);
  const from = V3(0.3, 0, 0.42), to = girl.position.clone();
  floorBoots.position.lerpVectors(from, to, ease(k)); floorBoots.position.y = Math.sin(k * Math.PI) * 0.25;
  floorBoots.rotation.y = lerp(0.6, girl.rotation.y, k);
  if (k >= 1) {
    bootAnim.t = -1; floorBoots.visible = false; girl.userData.boots.forEach(b => b.visible = true);
    audio.thud(140, 0.5); setTimeout(() => audio.thud(120, 0.45), 160); GA.hop = 0.9; audio.say('ふふっ'); checkIntro();
  }
}
const sleeveAnim = { t: -1 };
function rollSleeves() { if (S.sleeves) return; S.sleeves = true; sleeveAnim.t = 0; audio.whoosh(0.2); setTimeout(() => audio.whoosh(0.2), 300); }
function sleeveUpdate(dt) {
  if (sleeveAnim.t < 0) return;
  sleeveAnim.t += dt;
  const k = Math.min(1, sleeveAnim.t / 0.7);
  for (const a of girl.userData.arms) {
    a.sl.scale.y = lerp(1, 0.45, ease(k)); a.sl.visible = k < 0.95; a.ss.visible = k > 0.5; a.ss.scale.setScalar(lerp(0.85, 1, k));
  }
  if (k >= 1) { sleeveAnim.t = -1; GA.cheer = 0.8; checkIntro(); }
}
function checkIntro() {
  if (S.boots && S.sleeves && S.scene === 'intro' && !S.introDone) {
    S.introDone = true;
    setTimeout(() => { audio.say('よーし'); GA.hop = 0.9; }, 700);
    setTimeout(() => setScene('scape'), 1900);
  }
}

// ------------------------------------------------------------------ celebrations
function celebrate(next, voice = 'できた') {
  S.busy = 1; S.down = false; armCtl.release();
  audio.chime();
  setTimeout(() => { camTo('wide', 1.8); girl.visible = true; }, 400);
  setTimeout(() => { audio.say(voice); GA.hop = 0.9; }, 1600);
  setTimeout(() => { GA.clap = 1.4; audio.clap(5); }, 2300);
  setTimeout(() => { S.busy = 0; if (next) setScene(next); else camTo('tankHigh', 2); }, 4600);
}

// ------------------------------------------------------------------ arm controller (the player's finger = the girl's hand)
const armCtl = {
  T: V3(), goal: V3(), on: false, vis: 0, until: 0, pose: 'point', roll: 0, pitch: 0, yaw: 0, local: V3(0.098, 0.0, -0.016), tool: null,
  show(goal, pose, opts = {}) {
    if (!arm.hands[pose]) arm.build(pose);
    const S0 = shoulder();
    if (!this.on && this.vis < 0.05) this.T.copy(S0).lerp(goal, 0.6);
    this.on = true; this.goal.copy(goal); this.pose = pose; arm.setPose(pose);
    this.roll = opts.roll ?? 0; this.pitch = opts.pitch ?? 0; this.yaw = 0; this.tiltGoal = opts.tilt ?? 0;
    this.local.copy(opts.local || POSE_LOCAL[pose]);
    this.until = S.t + (opts.hold ?? 0.9);
    this.attach(opts.tool || null, opts.toolXf);
  },
  attach(key) {
    if (this.tool === key) return;
    if (this.tool && TOOLS[this.tool] && this.tool !== S.tool) homeTool(TOOLS[this.tool]);
    const t = key && TOOLS[key];
    if (t) { t.inHand = true; scene.add(t.obj); t.obj.scale.setScalar(HOLD[key]?.s || 1); this.tilt = 0; }
    this.tool = key;
  },
  release() { this.until = Math.min(this.until, S.t + 0.5); },
  update(dt) {
    const S0 = shoulder();
    if (this.on && S.t > this.until) this.on = false;
    const target = this.on ? this.goal : S0.clone().lerp(this.T, 0.0);
    this.T.lerp(target, 1 - Math.exp(-dt * (this.on ? 14 : 5)));
    this.vis = this.on ? 1 : Math.max(0, this.T.distanceTo(S0) > 0.08 ? 1 : 0);
    arm.group.visible = this.vis > 0 && S.scene !== 'intro' && cam.name !== 'wide';
    if (!arm.group.visible && this.tool) { const t = TOOLS[this.tool]; if (t && !t.gone) homeTool(t); this.tool = null; }
    if (arm.group.visible) arm.place(this.T, S0, this.local, this.roll, this.pitch, this.yaw);
    // held tool: oriented in world space, hung from the grip point
    if (this.tool && TOOLS[this.tool] && arm.group.visible) {
      const goal = S.down || S.bagAnim ? this.tiltGoal : 0;
      this.tilt = lerp(this.tilt || 0, goal, Math.min(1, dt * 6));
      placeHeld(TOOLS[this.tool].obj, HOLD[this.tool], this.T, this.tilt);
    }
    // the tool currently selected but not in hand floats a bit above its tray slot
    for (const k in TOOLS) {
      const t = TOOLS[k]; if (t.inHand) continue;
      const sel = S.tool === k;
      t.obj.position.y = lerp(t.obj.position.y, sel ? 0.02 + Math.sin(S.t * 4) * 0.004 : 0, Math.min(1, dt * 8));
      t.obj.rotation.y = sel ? Math.sin(S.t * 2) * 0.25 : t.obj.rotation.y * 0.9;
      // the tool the hint suggests wiggles now and then
      const wig = S.suggest === k && !sel ? Math.max(0, Math.sin(S.t * 2.2)) : 0;
      t.obj.rotation.z = Math.sin(S.t * 14) * 0.12 * wig;
    }
  },
};
// hand-local points that should land on the touch target
const POSE_LOCAL = { point: V3(0.101, -0.004, -0.0165), pinch: V3(0.088, -0.018, -0.02), grip: V3(0.065, -0.028, 0.0), flat: V3(0.05, -0.03, 0.0) };
// how each tool hangs from the hand: grip point (tool-local), yaw (world), tilt axis = world z
const HOLD = {
  sand: { grip: [0.034, 0.03, 0], yaw: 0, s: 1 }, pebble: { grip: [0.034, 0.03, 0], yaw: 0, s: 1 },
  wood: { grip: [0.06, 0.0, 0], yaw: 0.3, s: 0.9 },
  plant: { grip: [0, 0.03, 0], yaw: 0, s: 1 },
  can: { grip: [-0.01, 0.16, 0], yaw: Math.PI, s: 1 },
  towel: { grip: [0, 0.012, 0], yaw: 0, s: 1 },
  bag0: { grip: [0, 0.125, 0], yaw: 0, s: 1 }, bag1: { grip: [0, 0.125, 0], yaw: 0, s: 1 }, bag2: { grip: [0, 0.125, 0], yaw: 0, s: 1 },
};
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function placeHeld(obj, h, T, tilt) {
  if (!h) return;
  _q.setFromAxisAngle(V3(0, 1, 0), h.yaw); _q2.setFromAxisAngle(V3(0, 0, 1), tilt); obj.quaternion.copy(_q2).multiply(_q);
  const g = V3(...h.grip).multiplyScalar(h.s).applyQuaternion(obj.quaternion);
  obj.position.copy(T).sub(g);
}
function homeTool(t) { t.inHand = false; t.home.add(t.obj); t.obj.position.set(0, 0, 0); t.obj.rotation.set(0, 0, 0); t.obj.scale.setScalar(1); }
function shoulder() { return camera.localToWorld(S.scene === 'water' && S.phase === 'wipe' ? V3(0.16, -0.3, -0.3) : V3(0.15, -0.27, -0.5)); }
const momShoulder = () => camera.localToWorld(V3(0.62, 0.12, -0.25));

// ------------------------------------------------------------------ input
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setNdc(e) { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
function hitPlaneY(y) { const r = ray.ray; if (Math.abs(r.direction.y) < 1e-4) return null; const t = (y - r.origin.y) / r.direction.y; return t > 0 ? r.origin.clone().addScaledVector(r.direction, t) : null; }
function hitPlaneZ(z) { const r = ray.ray; const t = (z - r.origin.z) / r.direction.z; return t > 0 ? r.origin.clone().addScaledVector(r.direction, t) : null; }
function screenOf(obj) { const p = new THREE.Vector3(); obj.getWorldPosition(p); p.project(camera); return p; }
function pickTray() {
  if (!tray.visible) return null;
  let best = null, bd = 1e9;
  for (const k in TOOLS) {
    const t = TOOLS[k]; if (!t.home.parent || t.home.parent !== tray || t.gone) continue;
    const p = screenOf(t.home);
    const dx = (p.x - ndc.x) * camera.aspect, dy = p.y - ndc.y;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = t; }
  }
  const lim = 0.16 * Math.max(0.6, tray.scale.x);
  return bd < lim ? best : null;
}
// tank interior point from the pointer
function tankPoint(y) {
  const p = hitPlaneY(y); if (!p) return null;
  if (p.x < TK.x0 - 0.04 || p.x > TK.x1 + 0.04 || p.z < TK.z0 - 0.1 || p.z > TK.z1 + 0.16) return null;
  p.x = clamp(p.x, TK.x0 + 0.015, TK.x1 - 0.015); p.z = clamp(p.z, TK.z0 + 0.015, TK.z1 - 0.015);
  return p;
}
function onDown(e) {
  audio.unlock();
  if (S.ptr !== null) return;
  S.ptr = e.pointerId; S.idle = 0; hideHint();
  setNdc(e);
  if (S.busy) return;
  if (S.scene === 'intro') { introTap(); return; }
  const t = pickTray();
  if (t) { trayTap(t); return; }
  S.down = true; S.moved = 0; S.lastP = null;
  act(true);
}
function onMove(e) {
  if (e.pointerId !== S.ptr) return;
  setNdc(e); S.idle = 0;
  if (S.down && !S.busy) act(false);
}
function onUp(e) {
  if (e.pointerId !== S.ptr) return;
  S.ptr = null; S.down = false; armCtl.release();
  audio.loop('sand', 0); audio.loop('pour', 0); audio.loop('rub', 0);
}
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function introTap() {
  const b = screenOf(floorBoots);
  const g = girl.localToWorld(V3(0, 0.62, 0)).project(camera);
  const db = Math.hypot((b.x - ndc.x) * camera.aspect, b.y - ndc.y);
  const dg = Math.hypot((g.x - ndc.x) * camera.aspect, (g.y - ndc.y) * 0.6);
  if (!S.boots && db < 0.22 && (db < dg || S.sleeves)) putBoots();
  else if (!S.sleeves && dg < 0.32) rollSleeves();
  else if (!S.boots && db < 0.32) putBoots();
  else { GA.hop = 0.9; audio.say('ふふっ'); }
}
function trayTap(t) {
  const k = t.key;
  if (k.startsWith('bag')) { releaseBag(+k[3]); return; }
  if (S.scene === 'fish' && S.tool === k) { selectTool(null); return; }
  selectTool(k);
}

// ------------------------------------------------------------------ actions
const tmpV = V3();
function act(first) {
  const tool = S.tool;
  if (S.scene === 'scape') {
    const p = tankPoint(TK.y0 + 0.015); if (!p) return;
    const h = sand.heightAt(p.x, p.z);
    if (tool === 'sand' || tool === 'pebble') {
      // cup held above the spot, tilted to pour
      armCtl.show(V3(p.x + 0.05, TK.y0 + sand.heightAt(p.x, p.z) + 0.15, p.z + 0.02), 'grip', { tool, roll: 1.57, tilt: 1.7, hold: 0.6 });
      S.pour = { x: p.x, z: p.z };
    } else if (tool === 'wood') {
      if (!first) return;
      placeWood(p);
      armCtl.show(V3(p.x, TK.y0 + h + 0.05, p.z), 'grip', { tool: 'wood', roll: 0, pitch: -0.4, hold: 0.5 });
    } else if (tool === 'plant') {
      const lp = S.lastP; if (!first && lp && Math.hypot(lp.x - p.x, lp.z - p.z) < 0.045) { armCtl.show(V3(p.x, TK.y0 + h + 0.006, p.z), 'pinch', { tool: 'plant', roll: 0, pitch: -0.9, hold: 0.5 }); return; }
      S.lastP = p.clone();
      plants.plant(p.x, p.z); audio.thud(260, 0.25); audio.click(900, 0.08);
      if (plants.list.length === 1) setTimeout(() => audio.say('えいっ'), 200);
      sand.flatten(p.x, p.z, 0.008, 0.05);
      armCtl.show(V3(p.x, TK.y0 + h + 0.006, p.z), 'pinch', { tool: 'plant', roll: 0, pitch: -0.9, hold: 0.5 });
    }
  } else if (S.scene === 'water') {
    if (S.phase === 'gag') return;
    if (S.phase === 'wipe') {
      const p = hitPlaneY(0.0); if (!p) return;
      if (S.tool === 'towel') {
        armCtl.show(V3(p.x, 0.035, p.z), 'flat', { tool: 'towel', roll: 0, pitch: 0.05, hold: 0.5 });
        wipeAt(p.x, p.z, S.lastP ? Math.hypot(S.lastP.x - p.x, S.lastP.z - p.z) : 0.01);
        S.lastP = p.clone();
      } else if (S.tool === 'can') {
        armCtl.show(V3(p.x + 0.1, 0.42, p.z + 0.05), 'grip', { tool: 'can', roll: 1.57, tilt: 0.8, hold: 0.6 });
        S.pour = { x: p.x, z: p.z, floor: true };
        if (!S.wrongTold) { S.wrongTold = true; setTimeout(() => { audio.say('あれ', 'mom'); }, 500); setTimeout(() => { audio.say('ふふっ', 'mom'); }, 1500); }
      }
      return;
    }
    const q = hitPlaneZ(0); if (!q || q.x < TK.x0 - 0.1 || q.x > TK.x1 + 0.1) return;
    const p = V3(clamp(q.x, TK.x0 + 0.05, TK.x1 - 0.05), TK.y1, 0);
    armCtl.show(V3(p.x + 0.1, TK.y1 + 0.2, p.z + 0.03), 'grip', { tool: 'can', roll: 1.57, tilt: 0.75, hold: 0.6 });
    S.pour = { x: p.x, z: p.z };
  } else if (S.scene === 'fish') {
    if (tool === 'shell' || tool === 'stone') {
      if (!first) return;
      const p = tankPoint(TK.y0 + 0.02); if (!p) return;
      placeDecor(tool, p);
      armCtl.show(V3(p.x, TK.y0 + sand.heightAt(p.x, p.z) + 0.01, p.z), 'pinch', { tool: null, roll: 0, pitch: -0.9, hold: 0.45 });
    } else {
      // finger knocks on the front glass
      const p = hitPlaneZ(TK.z1 + TK.g + 0.002); if (!p) return;
      if (p.x < TK.x0 || p.x > TK.x1 || p.y < TK.y0 || p.y > TK.y1) return;
      if (!first) return;
      armCtl.show(V3(p.x, p.y, TK.z1 + TK.g + 0.004), 'point', { roll: 0, pitch: 0, yaw: 0, hold: 0.6 });
      S.knock = { t: 0.18, x: p.x, y: p.y };
    }
  }
}
function placeWood(p) {
  for (const w of woods) if (Math.hypot(w.position.x - p.x, w.position.z - p.z) < 0.06) { w.userData.spin += 0.7; audio.thud(150, 0.35); return; }
  if (woods.length >= 3) { const w = woods.shift(); w.parent.remove(w); }
  const w = M.mesh(M.driftwoodGeometry(woods.length * 3 + 1 + Math.floor(rnd(0, 20))), MAT.drift);
  w.userData = { x: p.x, z: p.z, spin: rnd(0, 6), drop: 0.12 };
  w.rotation.set(0, w.userData.spin, rnd(-0.15, 0.15));
  M.tank.add(w); woods.push(w);
  audio.thud(110, 0.6); audio.splash(S.level > 0.1 ? 0.2 : 0.0, 0.2);
  sand.flatten(p.x, p.z, 0.02, 0.1);
}
function placeDecor(kind, p) {
  if (kind === 'stone') {
    if (!S.stone) { S.stone = M.airstoneMesh(); S.stone.traverse(o => { if (o.isMesh) o.castShadow = true; }); M.tank.add(S.stone); }
    S.stone.position.set(p.x, TK.y0 + sand.heightAt(p.x, p.z) - 0.004, p.z);
    audio.thud(220, 0.3); audio.say('えいっ');
    fish.attract(p.x, TK.y0 + sand.heightAt(p.x, p.z) + 0.04, p.z, 1.2, 5, 0.5);
  } else {
    const tints = [[0.95, 0.82, 0.74], [0.92, 0.88, 0.8], [0.9, 0.7, 0.62]];
    const sh = M.shellMesh(tints[S.shells.length % 3]); sh.position.set(p.x, TK.y0 + sand.heightAt(p.x, p.z) + 0.002, p.z); sh.rotation.y = rnd(0, 6);
    M.tank.add(sh); S.shells.push(sh);
    if (S.shells.length > 5) { const o = S.shells.shift(); o.parent.remove(o); }
    audio.click(1800, 0.2); audio.thud(300, 0.2);
    fish.attract(p.x, TK.y0 + sand.heightAt(p.x, p.z) + 0.02, p.z, 1.4, 5, 0.5);
  }
}
// fish bag: hand carries it to the surface, it opens, fish swim out
function releaseBag(k) {
  if (S.released[k] || S.bagBusy) return;
  S.bagBusy = true; const key = 'bag' + k; const t = TOOLS[key];
  const x = lerp(TK.x0 + 0.08, TK.x1 - 0.08, (k + 0.5) / 3) + rnd(-0.03, 0.03), z = rnd(-0.04, 0.06);
  const surfY = U.uLevel.value;
  audio.pick();
  armCtl.show(V3(x, surfY + 0.09, z + 0.02), 'pinch', { tool: key, roll: 0, pitch: -0.6, hold: 3.2, tilt: 0 });
  const t0 = S.t;
  S.bagAnim = { k, x, z, t0, key };
}
function bagUpdate(dt) {
  const B = S.bagAnim; if (!B) return;
  const e = S.t - B.t0;
  const surfY = U.uLevel.value;
  const t = TOOLS[B.key];
  if (e < 0.9) armCtl.goal.set(B.x, surfY + 0.09 - e * 0.04, B.z + 0.02);
  else if (e < 2.2) {
    armCtl.goal.set(B.x, surfY + 0.05 + Math.sin(e * 3) * 0.004, B.z + 0.02);
    armCtl.tiltGoal = Math.min(1, (e - 0.9) / 0.6) * 1.3; // tip the bag
    if (!B.out && e > 1.3) {
      B.out = true; fish.release(B.k, V3(B.x, surfY - 0.03, B.z)); audio.splash(0.35, 0.6);
      for (let i = 0; i < 25; i++) bubbles.emit(B.x + rnd(-0.02, 0.02), surfY - rnd(0.02, 0.06), B.z + rnd(-0.02, 0.02));
      setTimeout(() => audio.say(B.k === 0 ? 'わあ' : B.k === 1 ? 'おさかな' : 'きれい'), 400);
    }
  } else {
    S.released[B.k] = true; t.gone = true; t.inHand = false; t.home.visible = false; if (t.obj.parent) t.obj.parent.remove(t.obj);
    armCtl.tool = null; armCtl.release();
    S.bagAnim = null; S.bagBusy = false;
    if (S.released.every(Boolean) && !S.fishDone) { S.fishDone = true; setTimeout(() => celebrate(null, 'やったー'), 1500); }
  }
  // fish ride inside the bag while it is carried
  const bp = V3(); t.obj.getWorldPosition(bp);
  if (!B.out) fish.inBag(B.k, bp.add(V3(0, 0.045, 0)), 1);
}

// ------------------------------------------------------------------ floor wetness
function wetIdx(x, z) { return [Math.round((x - WET.x0) / (WET.x1 - WET.x0) * (WET.NX - 1)), Math.round((z - WET.z0) / (WET.z1 - WET.z0) * (WET.NZ - 1))]; }
function wetAdd(x, z, amt, r = 0.05) {
  const [ci, ck] = wetIdx(x, z); const ri = Math.ceil(r / ((WET.x1 - WET.x0) / WET.NX)) + 1;
  for (let k = ck - ri; k <= ck + ri; k++) for (let i = ci - ri; i <= ci + ri; i++) {
    if (i < 0 || k < 0 || i >= WET.NX || k >= WET.NZ) continue;
    const px = WET.x0 + i / (WET.NX - 1) * (WET.x1 - WET.x0), pz = WET.z0 + k / (WET.NZ - 1) * (WET.z1 - WET.z0);
    const d2 = ((px - x) ** 2 + (pz - z) ** 2) / (r * r); if (d2 > 1.5) continue;
    const p = k * WET.NX + i; WET.v[p] = clamp(WET.v[p] + amt * Math.exp(-d2 * 2), 0, 1.2);
  }
  WET.dirty = true;
}
function wipeAt(x, z, moved) {
  const [ci, ck] = wetIdx(x, z); const r = 0.07; const ri = Math.ceil(r / ((WET.x1 - WET.x0) / WET.NX)) + 1;
  let got = 0;
  for (let k = ck - ri; k <= ck + ri; k++) for (let i = ci - ri; i <= ci + ri; i++) {
    if (i < 0 || k < 0 || i >= WET.NX || k >= WET.NZ) continue;
    const px = WET.x0 + i / (WET.NX - 1) * (WET.x1 - WET.x0), pz = WET.z0 + k / (WET.NZ - 1) * (WET.z1 - WET.z0);
    const d2 = ((px - x) ** 2 + (pz - z) ** 2) / (r * r); if (d2 > 1) continue;
    const p = k * WET.NX + i; const before = WET.v[p];
    WET.v[p] = Math.max(0, WET.v[p] - (0.08 + moved * 6) * (1 - d2 * 0.6)); got += before - WET.v[p];
  }
  WET.dirty = true;
  S.towelWet = Math.min(1, (S.towelWet || 0) + got * 0.01);
  MAT.terry.color.setRGB(1 - S.towelWet * 0.35, 1 - S.towelWet * 0.3, 1 - S.towelWet * 0.25);
  audio.loop('rub', got > 0.01 ? 1 : 0.3);
}
function wetUpdate(dt) {
  if (S.overflow > 0) { for (let i = 0; i < 3; i++) wetAdd(rnd(-0.2, 0.24), rnd(0.23, 0.3), S.overflow * dt * 3, 0.06); }
  if (WET.spread > 0) {
    WET.spread -= dt;
    const N = WET.NX, v = WET.v, nv = new Float32Array(v.length);
    for (let k = 0; k < WET.NZ; k++) for (let i = 0; i < N; i++) {
      const p = k * N + i; const c = v[p];
      const l = v[k * N + Math.max(0, i - 1)], r = v[k * N + Math.min(N - 1, i + 1)], d = v[Math.max(0, k - 1) * N + i], u = v[Math.min(WET.NZ - 1, k + 1) * N + i];
      const mx = Math.max(l, r, d, u);
      nv[p] = c + (mx > 0.3 && c < mx ? (mx - c) * dt * 1.6 * (0.6 + 0.8 * Math.abs(Math.sin(i * 1.7 + k * 2.3))) : 0) - (c > mx ? (c - mx) * dt * 0.4 : 0);
    }
    v.set(nv); WET.dirty = true;
  }
  if (WET.dirty) {
    WET.dirty = false; let s = 0;
    for (let p = 0; p < WET.v.length; p++) { WET.data[p * 4] = Math.min(255, WET.v[p] * 255); s += WET.v[p] > 0.15 ? 1 : 0; }
    WET.tex.needsUpdate = true; WET.area = s;
  }
}

// ------------------------------------------------------------------ mom's overflow gag
const momCan = M.canMesh(true); momCan.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(momCan); momCan.visible = false;
const momCtl = { on: false, T: V3(), goal: V3() };
function startGag() {
  S.phase = 'gag'; S.gagT = 0; S.down = false; armCtl.release(); audio.loop('pour', 0);
  momArm.build('grip'); momArm.setPose('grip');
  momCtl.on = true; momCtl.T.copy(momShoulder());
}
function gagUpdate(dt) {
  S.gagT += dt; const g = S.gagT;
  const x = 0.1;
  momCtl.goal.set(0.37, TK.y1 + 0.13, 0.1);
  if (g > 1.0 && g < 3.4) {
    // pour hard
    const lip = momCan.localToWorld(momCan.userData.lip.clone());
    for (let i = 0; i < 26; i++) drops.emit(lip.x + rnd(-0.01, 0.01), lip.y, lip.z + rnd(-0.01, 0.01), rnd(-0.35, -0.1), rnd(-0.3, 0.1), rnd(-0.08, 0.08), [0.75, 0.85, 0.88], rnd(0.0012, 0.0026), 2, 2);
    S.level = Math.min(1.0, S.level + dt * 0.33);
    turb.stir(lip.x - 0.05, S.level, dt * 4.5);
    audio.loop('pour', 1);
    U.uPush.value.set(lip.x - 0.05, 0, 1.0, 0);
    if (S.level >= 1.0) { S.overflow = Math.min(1, S.overflow + dt * 2); if (!S.saidOops) { S.saidOops = true; audio.say('あっ', 'mom'); } }
  } else if (g >= 3.4) { audio.loop('pour', 0); U.uPush.value.z *= 0.9; }
  if (g > 3.4 && !S.saidArara) { S.saidArara = true; audio.say('あらら', 'mom'); WET.spread = 2.5; }
  if (g > 3.6) momCtl.on = false;
  if (g > 4.0) S.overflow = Math.max(0, S.overflow - dt * 0.8);
  if (g > 4.8 && S.phase === 'gag') {
    S.phase = 'wipe'; S.level = 0.95; camTo('floor', 1.6); setTray(['towel', 'can']); selectTool('towel', true); S.lastP = null;
    setTimeout(() => audio.say('えいっ'), 1200);
  }
}
function momUpdate(dt) {
  const S0 = momShoulder();
  const target = momCtl.on ? momCtl.goal : S0;
  momCtl.T.lerp(target, 1 - Math.exp(-dt * (momCtl.on ? 4 : 3)));
  momArm.group.visible = momCtl.T.distanceTo(S0) > 0.06 && cam.name.startsWith('tank'); momCan.visible = momArm.group.visible;
  if (momArm.group.visible) {
    const tilt = S.phase === 'gag' && S.gagT > 0.9 && S.gagT < 3.4 ? 1 : 0;
    momArm.place(momCtl.T, S0, V3(0.065 * 1.38, -0.028 * 1.38, 0), 1.57, 0, -0.15);
    momCtl.tilt = lerp(momCtl.tilt || 0, tilt * 1.0, Math.min(1, dt * 4));
    placeHeld(momCan, { grip: [-0.01, 0.16, 0], yaw: Math.PI, s: 1.2 }, momCtl.T, momCtl.tilt);
  }
}

// ------------------------------------------------------------------ hints
const hint = { el: hintEl, on: false };
function hideHint() { if (hint.on) { hint.on = false; hintEl.classList.remove('on'); } }
function showHintAt(world) {
  const p = world.clone().project(camera);
  if (p.z > 1) return;
  const x = (p.x * 0.5 + 0.5) * innerWidth, y = (-p.y * 0.5 + 0.5) * innerHeight;
  hintEl.style.setProperty('--x', (x - 34) + 'px'); hintEl.style.setProperty('--y', (y - 6) + 'px');
  hintEl.style.transform = `translate(${x - 34}px, ${y - 6}px)`;
  if (!hint.on) { hint.on = true; hintEl.classList.add('on'); }
}
function toolPos(k) { const p = V3(); TOOLS[k].home.getWorldPosition(p); return p; }
function nextHint() {
  const tankP = (x, y, z) => V3(x, y, z);
  if (S.scene === 'intro') return !S.boots ? floorBoots.position.clone().add(V3(0, 0.1, 0)) : girl.localToWorld(V3(-0.13, 0.55, 0.03));
  if (S.scene === 'scape') {
    const cov = sand.coverage();
    const need = cov < 0.5 ? 'sand' : !woods.length ? 'wood' : plants.list.length < 3 ? 'plant' : 'sand';
    if (S.tool !== need) return toolPos(need);
    if (need === 'sand') { // emptiest column
      let best = 0, bx = 0, bz = 0; for (let i = 0; i < 6; i++) { const x = rnd(TK.x0 + 0.04, TK.x1 - 0.04), z = rnd(TK.z0 + 0.04, TK.z1 - 0.04); const e = 1 / (0.001 + sand.heightAt(x, z)); if (e > best) { best = e; bx = x; bz = z; } }
      return tankP(bx, TK.y0 + 0.01, bz);
    }
    return tankP(rnd(-0.15, 0.15), TK.y0 + 0.03, rnd(-0.05, 0.08));
  }
  if (S.scene === 'water') {
    if (S.phase === 'wipe') { if (S.tool !== 'towel') return toolPos('towel'); let bx = 0, bz = 0.4, bv = 0; for (let p = 0; p < WET.v.length; p += 7) if (WET.v[p] > bv) { bv = WET.v[p]; bx = WET.x0 + (p % WET.NX) / (WET.NX - 1) * (WET.x1 - WET.x0); bz = WET.z0 + Math.floor(p / WET.NX) / (WET.NZ - 1) * (WET.z1 - WET.z0); } return V3(bx, 0, bz); }
    if (S.level < 0.45) return V3(0, TK.y1 + 0.01, 0.05);
    return null;
  }
  if (S.scene === 'fish') {
    for (let k = 0; k < 3; k++) if (!S.released[k]) return toolPos('bag' + k);
    return V3(rnd(-0.15, 0.15), TK.y0 + 0.16, TK.z1);
  }
  return null;
}
let hintTarget = null;

// ------------------------------------------------------------------ per-frame simulation
drops.onLand = (x, y, z, kind, size) => {
  if (kind === 0) { // sand grain
    sand.deposit(x, z, 5.5e-7, 0.012);
  } else if (kind === 2) { // water drop
    if (y > 0.3) {
      if (Math.random() < 0.04) drops.emit(x, y + 0.002, z, rnd(-0.2, 0.2), rnd(0.3, 0.7), rnd(-0.2, 0.2), [0.8, 0.9, 0.92], size * 0.6, 3, 0.5);
      if (S.level > 0.02 && Math.random() < 0.03) bubbles.emit(x + rnd(-0.01, 0.01), y - rnd(0.01, 0.04), z, rnd(0.001, 0.0025));
    }
  }
};
function groundFor(x, z, kind) {
  if (x > TK.x0 && x < TK.x1 && z > TK.z0 && z < TK.z1) {
    if (kind === 2 && S.level > 0.005) return U.uLevel.value;
    return TK.y0 + sand.heightAt(x, z);
  }
  if (Math.abs(x) < 0.45 && z > -0.25 && z < 0.225) return 0.55;
  return 0;
}
const sandCols = [[0.78, 0.68, 0.5], [0.7, 0.58, 0.42], [0.85, 0.78, 0.65], [0.6, 0.5, 0.38], [0.9, 0.86, 0.78]];
function simulate(dt) {
  S.t += dt; S.idle += dt;
  U.uTime.value += dt;
  // pouring tools
  if (S.down && S.pour && arm.group.visible && armCtl.on) {
    const tool = TOOLS[S.tool];
    if (S.scene === 'scape' && (S.tool === 'sand' || S.tool === 'pebble')) {
      const lip = tool.obj.localToWorld(tool.obj.userData.lip.clone());
      if (S.tool === 'sand') {
        const n = Math.round(dt * 320);
        for (let i = 0; i < n; i++) { const c = sandCols[(Math.random() * 5) | 0]; const k = rnd(0.8, 1.1); drops.emit(lip.x + rnd(-0.008, 0.008), lip.y - 0.005, lip.z + rnd(-0.008, 0.008), (S.pour.x - lip.x) * 1.8 + rnd(-0.03, 0.03), rnd(-0.2, 0.0), (S.pour.z - lip.z) * 1.8 + rnd(-0.03, 0.03), [c[0] * k, c[1] * k, c[2] * k], rnd(0.001, 0.0024), 0, 3); }
        audio.loop('sand', 1);
      } else {
        S.pebT = (S.pebT || 0) - dt;
        if (S.pebT <= 0) { S.pebT = 0.09; pebbles.drop(clamp(lip.x + rnd(-0.01, 0.01), TK.x0, TK.x1), lip.y - 0.01 - TK.y0, clamp(lip.z + rnd(-0.01, 0.01), TK.z0, TK.z1)).vx = (S.pour.x - lip.x) * 2; }
      }
    } else if (S.scene === 'water' && S.tool === 'can') {
      const lip = tool.obj.localToWorld(tool.obj.userData.lip.clone());
      const n = Math.round(dt * 600);
      for (let i = 0; i < n; i++) drops.emit(lip.x + rnd(-0.008, 0.008), lip.y, lip.z + rnd(-0.008, 0.008), rnd(-0.3, -0.05), rnd(-0.25, 0.05), rnd(-0.05, 0.05), [0.95, 1.05, 1.1], rnd(0.0012, 0.0028), 2, 2);
      audio.loop('pour', 0.8);
      if (S.pour.floor) { wetAdd(S.pour.x, S.pour.z, dt * 0.8, 0.06); }
      else {
        const before = S.level;
        S.level = Math.min(1.02, S.level + dt * 0.055);
        if (S.level >= 1.0) S.overflow = Math.min(1, S.overflow + dt * 0.8);
        const impact = 1 / (1 + 9 * S.level);
        const ix = lip.x - 0.06;
        turb.stir(ix, S.level, dt * 5.0 * impact + dt * 0.4);
        if (S.level < 0.25 && before > 0) sand.deposit(ix, S.pour.z, -dt * 2e-6, 0.02);
        U.uPush.value.set(ix, S.pour.z, 1.0, 0);
        if (S.level >= 0.45 && !S.gagDone && S.phase === '') { S.gagDone = true; startGag(); }
      }
    }
  } else { U.uPush.value.z *= 0.92; if (!S.down) audio.loop('pour', S.phase === 'gag' ? 1 : 0); }
  if (S.knock) { S.knock.t -= dt; if (S.knock.t <= 0) { audio.knock(); S.knocks = (S.knocks || 0) + 1; if (S.knocks % 4 === 1) setTimeout(() => audio.say('ふふっ'), 900); fish.attract(S.knock.x, S.knock.y, TK.z1 - 0.04, 2.0, 3.5, 0.45); S.knock = null; } }
  if (S.phase === 'gag') gagUpdate(dt);
  if (S.overflow > 0 && S.phase !== 'gag') {
    const pouring = S.down && S.pour && !S.pour.floor && S.tool === 'can';
    if (!pouring) S.overflow = Math.max(0, S.overflow - dt * 0.8);
    if (S.level > 0.98 && !pouring) { S.level = 0.98; WET.spread = Math.max(WET.spread || 0, 1); }
    if (S.overflow > 0.2 && S.phase !== 'wipe' && !S.busy) { // she overflowed it herself: wipe again
      S.phase = 'wipe'; S.wiped = false; S.down = false; armCtl.release(); camTo('floor', 1.6); setTray(['towel', 'can']); selectTool('towel', true); S.lastP = null; audio.say('あっ');
    }
  }
  if (S.phase === 'wipe' && S.overflow === 0 && WET.area !== undefined && WET.area < 18 && S.t > 0 && !S.wiped) {
    S.wiped = true; audio.say('ありがとう', 'mom'); setTimeout(() => { audio.say('ふふっ'); }, 1300);
    setTimeout(() => { S.phase = 'clear'; camTo('tankHigh', 1.8); setTray(['can']); selectTool('can', true); }, 1800);
  }
  if (S.overflow > 0) { audio.loop('spill', S.overflow); } else audio.loop('spill', 0);
  sheetM.uniforms.uI.value = S.overflow; sheets.forEach(s => s.visible = S.overflow > 0.01);
  // water state -> visuals
  const lvlH = S.level * TK.H;
  U.uLevel.value = TK.y0 + Math.max(lvlH, 0.0001);
  U.uWater.value = S.level > 0.003 ? 1 : 0;
  waterBody.visible = surface.visible = meniscus.visible = motes.visible = S.level > 0.003;
  waterBody.scale.y = Math.max(lvlH, 0.001); waterBody.position.y = TK.y0 + lvlH / 2;
  surface.position.y = TK.y0 + lvlH + 0.0005; meniscus.position.y = surface.position.y;
  surfM.normalMap.offset.set(U.uTime.value * 0.012, U.uTime.value * 0.007);
  turb.update(dt, S.level);
  const clear = clamp(1 - turb.mean * 7, 0, 1);
  U.uClear.value = clear;
  if (surfM.userData.sh) surfM.userData.sh.uniforms.uMurk.value = clamp(turb.mean * 4, 0, 0.8);
  shafts.mat.uniforms.uI.value = S.level > 0.3 ? clear * 0.55 * clamp((S.level - 0.3) * 3, 0, 1) : 0;
  motes.material.uniforms.uI.value = 0.35 + clamp(turb.mean * 6, 0, 1) * 1.2;
  // scene goals
  if (S.scene === 'scape' && !S.busy && S.t > 2) {
    if (sand.coverage() > 0.5 && woods.length >= 1 && plants.list.length >= 3 && !S.scapeDone) { S.scapeDone = true; S.down = false; celebrate('water', 'できた'); }
  }
  if (S.scene === 'water' && S.phase === 'clear' && !S.busy) {
    S.clearT = clear > 0.85 ? S.clearT + dt : 0;
    if (S.clearT > 1.5 && !S.waterDone) { S.waterDone = true; celebrate('fish', 'きれい'); }
  }
  // sub-systems
  sand.update();
  pebbles.update(dt, audio);
  plants.update(dt);
  for (const w of woods) { const u = w.userData; u.drop = Math.max(0, u.drop - dt * 0.6); w.position.set(u.x, TK.y0 + sand.heightAt(u.x, u.z) + 0.004 + u.drop * u.drop * 8, u.z); w.rotation.y = lerp(w.rotation.y, u.spin, Math.min(1, dt * 8)); }
  drops.update(dt, groundFor);
  if (S.stone) { S.stoneT = (S.stoneT || 0) - dt; if (S.stoneT <= 0) { S.stoneT = rnd(0.02, 0.07); const p = S.stone.position; bubbles.emit(p.x + rnd(-0.006, 0.006), p.y + 0.03, p.z + rnd(-0.006, 0.006)); } audio.loop('bubbles', 0.6); if (Math.random() < dt * 0.4) fish.attract(p0(S.stone).x, p0(S.stone).y + 0.05, p0(S.stone).z, 0.8, 2, 0.35); }
  for (const sh of S.shells) if (Math.random() < dt * 0.15) fish.attract(sh.position.x, sh.position.y + 0.02, sh.position.z, 0.9, 2.5, 0.3);
  bubbles.update(dt, U.uLevel.value, audio);
  fish.update(dt, S.t, U.uLevel.value);
  bagUpdate(dt);
  if (S.scene === 'fish') for (let k = 0; k < 3; k++) {
    if (S.released[k] || (S.bagAnim && S.bagAnim.k === k && S.bagAnim.out)) continue;
    const t = TOOLS['bag' + k]; if (S.bagAnim && S.bagAnim.k === k) continue;
    const bp = V3(); t.obj.getWorldPosition(bp); const sc = tray.scale.x * t.home.scale.x; fish.inBag(k, bp.add(V3(0, 0.045 * sc, 0)), sc);
  }
  wetUpdate(dt);
  bootsUpdate(dt); sleeveUpdate(dt);
  girlUpdate(dt, S.t);
  girl.visible = cam.name === 'wide' || (cam.t < 0.5 && S.scene === 'scape' && S.t < 1.2);
  if (S.scene !== 'intro' && cam.name !== 'wide' && cam.t >= 1) girl.visible = false;
  floorBoots.rotation.z = !S.boots && S.scene === 'intro' ? Math.sin(S.t * 6) * 0.05 * (Math.sin(S.t * 1.3) > 0.3 ? 1 : 0) : 0;
  // which tool to nudge (wiggle) even before the white hand appears
  S.suggest = null;
  if (S.scene === 'scape') S.suggest = sand.coverage() < 0.5 ? 'sand' : !woods.length ? 'wood' : plants.list.length < 3 ? 'plant' : null;
  else if (S.scene === 'water' && S.phase === 'wipe') S.suggest = 'towel';
  else if (S.scene === 'fish') { for (let k = 0; k < 3; k++) if (!S.released[k]) { S.suggest = 'bag' + k; break; } }
  if (S.suggest === S.tool) S.suggest = null;
  // hints after 4 s idle
  if (S.idle > 4 && !S.busy && !S.down && S.phase !== 'gag' && cam.t >= 1) { if (!hintTarget || S.idle % 4 < dt) hintTarget = nextHint(); if (hintTarget) showHintAt(hintTarget); }
  else { hintTarget = null; hideHint(); }
}
const p0 = (o) => o.position;

// ------------------------------------------------------------------ render loop + dynamic resolution
let last = performance.now(), acc = 0, frames = 0, W = 0, H = 0;
function resize() {
  const d = M.dpr();
  const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
  if (w === W && h === H) return;
  W = w; H = h;
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false);
  canvas.width = w; canvas.height = h; renderer.setViewport(0, 0, w, h);
  renderer.setSize(w, h, false); canvas.style.width = '100%'; canvas.style.height = '100%';
  M.resizeRT(w, h);
  post.uniforms.uRes.value.set(w, h);
}
addEventListener('resize', () => { W = 0; });
function render(dt) {
  resize();
  camUpdate(dt, S.t);
  armCtl.update(dt); momUpdate(dt);
  camera.updateMatrixWorld();
  M.lampLight.shadow.autoUpdate = cam.name === 'wide' || cam.name === 'floor' || cam.t < 1;
  const scalePx = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  drops.mat.uniforms.uScale.value = scalePx; motes.material.uniforms.uScale.value = scalePx;
  const rt = M.getRT();
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  window.__info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, progs: renderer.info.programs.length, tex: renderer.info.memory.textures, geo: renderer.info.memory.geometries };
  renderer.setRenderTarget(null);
  post.uniforms.tColor.value = rt.texture; post.uniforms.tDepth.value = rt.depthTexture;
  post.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse); post.uniforms.uInvView.value.copy(camera.matrixWorld);
  post.uniforms.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  post.uniforms.uCam.value.copy(camera.position);
  renderer.render(postScene, postCam);
}
let lazyT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  simulate(dt);
  render(dt);
  // frame budget: lower resolution if slow
  acc += dt; frames++;
  if (acc > 2) {
    const avg = acc / frames;
    if (avg > 0.034 && M.dpr() > 0.75) { M.setDprScale(Math.max(0.5, M.dpr() / (window.devicePixelRatio || 1) - 0.12)); W = 0; }
    acc = 0; frames = 0;
  }
  lazyT += dt; if (lazyT > 0.25) { lazyT = 0; M.buildLazy(); }
  requestAnimationFrame(loop);
}
// initial camera: wide
const p0w = presetPose('wide'); cam.pos.copy(p0w.pos); cam.target.copy(p0w.target);
requestAnimationFrame((t) => { last = t; loop(t); setTimeout(() => veil.classList.add('off'), 250); });

// debug hooks for screenshots: ?scene=scape|water|fish|floor&auto=1
import { pending } from './tex.js';
window.__texPending = pending;
window.__game = { S, setScene, camTo, sand, plants, woods, fish, turb, pebbles, placeWood, wetAdd, putBoots, rollSleeves, act, armCtl, releaseBag, startGag, placeDecor, TOOLS, selectTool };
if (DEBUG.has('scene')) {
  const sc = DEBUG.get('scene');
  S.boots = S.sleeves = true; S.introDone = true; girl.userData.boots.forEach(b => b.visible = true); floorBoots.visible = false;
  for (const a of girl.userData.arms) { a.sl.visible = false; a.ss.visible = true; }
  const fill = () => {
    for (let i = 0; i < 1400; i++) { const x = rnd(TK.x0, TK.x1), z = rnd(TK.z0, TK.z1); sand.deposit(x, z, 2.6e-6 * (1.3 - (z - TK.z0) / TK.D), 0.03); }
    for (let i = 0; i < 2; i++) placeWood(V3(rnd(-0.15, 0.1), 0, rnd(-0.1, 0.0)));
    for (let i = 0; i < 9; i++) plants.plant(rnd(-0.25, 0.25), rnd(-0.14, 0.05));
    for (let i = 0; i < 40; i++) { const p = pebbles.drop(rnd(-0.27, 0.27), 0.05, rnd(-0.16, 0.16)); }
    for (let i = 0; i < 30; i++) sand.relax(3);
  };
  if (sc === 'scape') { setScene('scape'); cam.t = 1; cam.name = 'tank'; if (DEBUG.has('fill')) fill(); }
  if (sc === 'water' || sc === 'floor' || sc === 'fish') { fill(); setScene(sc === 'floor' ? 'water' : sc); cam.t = 1; S.level = sc === 'water' ? +(DEBUG.get('level') || 0.4) : 0.95; }
  if (sc === 'floor') { S.phase = 'wipe'; S.gagDone = true; camTo('floor', 0.01); setTray(['towel', 'can']); selectTool('towel', true); for (let i = 0; i < 40; i++) wetAdd(rnd(-0.25, 0.25), rnd(0.24, 0.6), 0.5, 0.08); }
  if (sc === 'fish') { for (let k = 0; k < 3; k++) { fish.release(k, V3(rnd(-0.2, 0.2), TK.y0 + 0.2, 0)); S.released[k] = DEBUG.has('allfish'); if (S.released[k]) { TOOLS['bag' + k].gone = true; TOOLS['bag' + k].home.visible = false; } } fish.all.forEach(f => { f.p.set(rnd(-0.25, 0.25), TK.y0 + rnd(0.08, 0.28), rnd(-0.12, 0.12)); }); }
  if (DEBUG.has('turb')) turb.stir(0, S.level, +DEBUG.get('turb'));
  if (DEBUG.has('wide')) camTo('wide', 0.01);
  if (DEBUG.has('close')) camTo('tank', 0.01);
}
if (DEBUG.has('hand')) {
  const pose = DEBUG.get('hand') || 'point';
  setScene('scape'); cam.t = 1;
  arm.build(pose); arm.setPose(pose);
  armCtl.show = () => {};
  const T = V3(0, 0.75, 0.25);
  armCtl.update = () => { arm.group.visible = true; arm.place(T, V3(0.25, 0.6, 0.6), V3(0.05, 0, 0), +(DEBUG.get('roll') || 0), 0, 0); };
  PRESET.tank = { target: T.clone().add(V3(-0.03, 0, 0)), dir: V3(0.1, 0.6, 1).normalize(), w: 0.22, h: 0.16 };
  tray.visible = false;
}
window.__cam = { V: THREE.Vector3, camera };
window.__wet = () => WET.area;
window.__wetClear = () => { WET.v.fill(0); WET.dirty = true; };
