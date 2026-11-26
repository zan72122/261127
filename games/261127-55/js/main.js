// ぬったら ほんもの — チョークの絵が、指で塗ったところから本物になる
import * as THREE from '../lib/three.module.min.js';
import { tex, loadCore, loadLate, setAniso } from './tex.js';
import { clamp, lerp, smooth, easeInOut, easeOut, rng } from './util.js';
import { Paint } from './paint.js';
import { makeEnvironment, makeSky, makeSun, aimSun, makeGround, makeGrass, makeCherryTree, makeBench, makeSignBoard, makeFarTrees, Petals, Particles, SUN_DIR } from './world.js';
import { Car, Boat } from './vehicles.js';
import { Human, HandRig, makeStrawHat, clothMat, chalkStick } from './human.js';
import { ChalkTray, makeHintHand, makeBubble, CHALKS } from './ui.js';
import { recognize, Thing } from './shapes.js';
import * as A from './audio.js';

// ---------- 描画の準備 ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
setAniso(renderer.capabilities.getMaxAnisotropy());
let DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);

const scene = new THREE.Scene();
const env = makeEnvironment(renderer);
scene.environment = env;
scene.environmentIntensity = 0.85;
scene.fog = new THREE.Fog(new THREE.Color(0.74, 0.80, 0.86), 22, 120);
scene.add(makeSky());
const sun = makeSun(); scene.add(sun, sun.target);
// 空からの弱い補助光（影側が黒くつぶれないように）
const hemi = new THREE.HemisphereLight(new THREE.Color(0.62, 0.72, 0.9), new THREE.Color(0.32, 0.30, 0.26), 0.35); scene.add(hemi);

const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 400);

// ---------- ほんの少しの被写界深度（遠景だけやわらかく） ----------
const post = { on: !!renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float')), rt: null };
function makePost(W, H) {
  if (!post.on) return;
  if (post.rt) { post.rt.dispose(); }
  const pr = renderer.getPixelRatio();
  post.rt = new THREE.WebGLRenderTarget(Math.floor(W * pr), Math.floor(H * pr), { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(Math.floor(W * pr), Math.floor(H * pr)) });
  post.rt.depthTexture.type = THREE.UnsignedIntType;
  if (!post.mat) {
    post.mat = new THREE.ShaderMaterial({
      uniforms: { tC: { value: null }, tD: { value: null }, uN: { value: 0.03 }, uF: { value: 400 }, uFocus: { value: 2 }, uPx: { value: new THREE.Vector2() }, uAmt: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: `uniform sampler2D tC,tD; uniform float uN,uF,uFocus,uAmt; uniform vec2 uPx; varying vec2 vUv;
        float lin(float d){ float z=d*2.-1.; return 2.*uN*uF/(uF+uN-z*(uF-uN)); }
        float coc(float z){ return clamp(abs(1./uFocus-1./z)*uFocus*1.4-0.3,0.,1.); }
        void main(){
          vec4 c0=texture2D(tC,vUv); float z0=lin(texture2D(tD,vUv).r); float r0=coc(z0)*uAmt;
          vec3 acc=c0.rgb; float w=1.;
          if(r0>0.02){
            const int N=12; float ga=2.39996;
            for(int i=0;i<N;i++){ float fi=float(i)+0.5; float rr=sqrt(fi/float(N)); vec2 o=vec2(cos(fi*ga),sin(fi*ga))*rr*r0*6.*uPx;
              vec4 c=texture2D(tC,vUv+o); float z=lin(texture2D(tD,vUv+o).r); float wi=(z<z0-0.3)?coc(z):1.; acc+=c.rgb*wi; w+=wi; }
          }
          gl_FragColor=vec4(acc/w,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    post.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.mat); post.quad.frustumCulled = false;
    post.scene = new THREE.Scene(); post.scene.add(post.quad); post.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  post.mat.uniforms.tC.value = post.rt.texture; post.mat.uniforms.tD.value = post.rt.depthTexture;
  post.mat.uniforms.uPx.value.set(1 / (W * pr), 1 / (H * pr)).multiplyScalar(pr);
}

// ---------- 塗りマップと地面 ----------
const paint = new Paint(renderer, { minX: -4, maxX: 4, minZ: -3, maxZ: 1 }, [2048, 1024]);
const ground = makeGround(paint); scene.add(ground);
const GU = ground.material.userData.U;
const grass = makeGrass(); scene.add(grass);
scene.add(makeFarTrees());

// 桜の木
const trees = [
  [-4.6, -4.4, 1.15, 11], [4.9, -5.2, 1.2, 12], [-1.0, -8.5, 1.3, 13], [2.6, -9.5, 1.2, 14], [-7.5, -7.0, 1.1, 15], [8.0, -8.5, 1.25, 16],
  [-10, -2, 1.1, 17], [10.5, -1.5, 1.05, 18], [-5.5, -14, 1.3, 19], [6, -15, 1.3, 20], [0, -17, 1.4, 21], [-12, -11, 1.2, 22], [12, -12, 1.2, 23],
];
for (const [x, z, s, seed] of trees) { const t = makeCherryTree(seed, s, Math.hypot(x, z) > 12 ? 0.6 : 1); t.position.set(x, 0, z); t.rotation.y = seed; scene.add(t); }
// ベンチ
const bench = makeBench(); bench.position.set(-2.45, 0, -3.15); scene.add(bench);
const bench2 = makeBench(); bench2.position.set(0.5, 0, -3.5); bench2.rotation.y = -0.08; scene.add(bench2);
// 黒板の看板
const sign = makeSignBoard(); sign.position.set(1.3, 0, -2.45); sign.rotation.y = -0.45; scene.add(sign);
const petals = new Petals(scene);
const sparks = new Particles(scene, 'spark.png', 400, THREE.AdditiveBlending);
sparks.fade = 'twinkle';
const dust = new Particles(scene, 'soft.png', 500, THREE.NormalBlending, { grav: 0.25, drag: 0.2 });
const drops = new Particles(scene, 'soft.png', 300, THREE.NormalBlending, { grav: 6, drag: 0.6 });

// ---------- 乗り物 ----------
const carOrig = [0, -0.06];
const car = new Car(paint, carOrig); scene.add(car.pivot);
const boatOrig = [2.25, -0.08];
const boat = new Boat(paint, boatOrig); scene.add(boat.pivot);
const R0 = rng(2611);
car.drawOutline(R0); boat.drawOutline(R0);
// 接地の暗がり（立ち上がった後）
const softT = tex('soft.png', { clamp: true });
function contactBlob(w, d, a) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: softT, color: 0x000000, transparent: true, opacity: a, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
}
const carBlob = new THREE.Group();
const cb1 = contactBlob(1.6, 0.95, 0.42); carBlob.add(cb1);
for (const x of [car.wb[0], car.wb[1]]) for (const z of [-0.3, 0.3]) { const b = contactBlob(0.3, 0.2, 0.55); b.position.set(x, 0, z); carBlob.add(b); }
carBlob.position.y = 0.003; carBlob.visible = false; scene.add(carBlob);

// ---------- 人 ----------
const girl = new Human('girl'); scene.add(girl.root);
const papa = new Human('papa'); scene.add(papa.root);
const hat = makeStrawHat(1.0); scene.add(hat);
const humanBlob = (s) => { const b = contactBlob(0.5 * s, 0.4 * s, 0.45); b.position.y = 0.004; return b; };
const girlBlob = humanBlob(0.8), papaBlob = humanBlob(1.2); scene.add(girlBlob, papaBlob);
// 手（大きく映る）
const girlHand = new HandRig({ scale: 0.66, tone: 0xe2b092, sleeve: girl.top, chalkColor: new THREE.Color(CHALKS[0]) });
scene.add(girlHand.root);
const papaHand = new HandRig({ scale: 1.0, tone: 0xcf9c7b, sleeve: papa.top, chalkColor: new THREE.Color(CHALKS[3]), button: true });
scene.add(papaHand.root);
// チョークの箱（ベンチの上）
const chalkBox = new THREE.Group();
{
  const cb = new THREE.MeshStandardMaterial({ map: tex('cardboard_col.jpg', { srgb: true }), normalMap: tex('cardboard_nrm.jpg'), roughness: 0.9, color: 0xffffff });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.11), cb); base.position.y = 0.015; chalkBox.add(base);
  CHALKS.forEach((c, i) => { const s = chalkStick(new THREE.Color(c)); s.rotation.x = Math.PI / 2; s.position.set(-0.072 + i * 0.036, 0.04, -0.037); chalkBox.add(s); });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.006, 0.115), cb); lid.position.set(0, 0.048, -0.055); lid.geometry.translate(0, 0, 0.0575); chalkBox.add(lid); chalkBox.userData.lid = lid;
  chalkBox.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}
chalkBox.position.set(-2.05, 0.46, -3.12); chalkBox.rotation.y = 0.2; scene.add(chalkBox);
const tray = new ChalkTray(env);
const hintEl = makeHintHand();
const bubble = makeBubble(); bubble.visible = false; scene.add(bubble);

// ---------- カメラの構図 ----------
const SH = {
  intro: { t: [-2.2, 0.55, -2.95], yaw: 0.3, pitch: 0.12, rw: 1.5, rh: 0.8, pw: 0.6 },
  introBox: { t: [-2.15, 0.5, -3.05], yaw: 0.2, pitch: 0.42, rw: 0.62, rh: 0.45, pw: 0.75 },
  car: { t: [0.0, 0.0, -0.44], yaw: 0.0, pitch: 0.74, rw: 0.92, rh: 0.6, pw: 0.88, pp: 0.1 },
  carWide: { t: [0.0, 0.65, -0.45], yaw: 0.1, pitch: 0.2, rw: 2.1, rh: 1.2, pw: 0.62 },
  carFix: { t: [car.wb[0] + 0.07, 0.17, carOrig[1] + 0.76], yaw: 0.06, pitch: 0.2, rw: 0.55, rh: 0.36, pw: 0.8 },
  boat: { t: [2.25, 0.0, -0.66], yaw: -0.04, pitch: 0.72, rw: 0.82, rh: 0.75, pw: 0.85, pp: 0.08 },
  boatWide: { t: [2.1, 0.75, -0.6], yaw: -0.12, pitch: 0.2, rw: 1.9, rh: 1.3, pw: 0.62 },
  thumb: { t: [0.05, 0.3, 0.25], yaw: -0.62, pitch: 0.2, rw: 1.05, rh: 0.62 },
  free: { t: [0.6, 0.35, -1.7], yaw: 0.0, pitch: 0.34, rw: 2.0, rh: 1.2, pw: 0.6, pp: 0.1 },
};
const cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), dPos: new THREE.Vector3(), dTgt: new THREE.Vector3(), speed: 2.2, follow: null, shot: null };
function shotPose(s, out) {
  const W = innerWidth, H = innerHeight, asp = W / H;
  const short = THREE.MathUtils.degToRad(38);
  let vf, hf;
  if (asp >= 1) { vf = short; hf = 2 * Math.atan(Math.tan(vf / 2) * asp); } else { hf = short; vf = 2 * Math.atan(Math.tan(hf / 2) / asp); }
  // 縦持ちは横幅を少し切ってでも寄る（遊ぶ所を大きく）
  const port = asp < 0.85 ? 1 : asp < 1.15 ? 0.5 : 0;
  const rw = s.rw * lerp(1, s.pw || 0.8, port), pitch = s.pitch + (s.pp || 0) * port;
  const d = Math.max(rw / Math.tan(hf / 2), s.rh / Math.tan(vf / 2));
  const t = new THREE.Vector3(...s.t);
  if (cam.follow) t.add(cam.follow());
  const f = new THREE.Vector3(-Math.sin(s.yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(s.yaw) * Math.cos(pitch));
  out.tgt.copy(t); out.pos.copy(t).addScaledVector(f, -d);
  out.vf = THREE.MathUtils.radToDeg(vf);
  return out;
}
function setShot(name, cut = false, speed = 2.2) {
  cam.shot = SH[name]; cam.speed = speed;
  if (cut) { const p = shotPose(cam.shot, { pos: new THREE.Vector3(), tgt: new THREE.Vector3() }); cam.pos.copy(p.pos); cam.tgt.copy(p.tgt); camera.fov = p.vf; camera.updateProjectionMatrix(); }
}

// ---------- 状態 ----------
const S = { st: 'load', t: 0, time: 0, idle: 0, fillQ: [], things: [], wish: 'ball', papaTimer: 0, drive: null, boatSail: null, lastSpark: 0 };
function go(st) { S.st = st; S.t = 0; S.idle = 0; S.enter = true; }

// 人の配置
function placeHumans(where) {
  if (where === 'intro') {
    girl.root.position.set(-2.12, 0, -2.6); girl.root.rotation.y = Math.PI + 0.15; girl.play('idle');
    papa.root.position.set(-3.45, 0, -3.55); papa.root.rotation.y = 1.35; papa.play('idle');
  } else if (where === 'car') {
    girl.root.position.set(-0.95, 0, 0.62); girl.root.rotation.y = 2.25;
    papa.root.position.set(1.15, 0, -0.85); papa.root.rotation.y = -Math.PI / 2;
  } else if (where === 'boat') {
    girl.root.position.set(1.05, 0, 0.55); girl.root.rotation.y = 2.0;
    papa.root.position.set(3.95, 0, -1.25); papa.root.rotation.y = -Math.PI / 2 - 0.3;
  } else if (where === 'free') {
    papa.root.position.set(0.35, 0, -3.45); papa.root.rotation.y = 0.2; papa.play('sit');
    girl.root.visible = false;
  }
}

// ---------- 入力 ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
const P = { down: false, id: null, x: 0, y: 0, last: null, lastT: 0, speed: 0, mode: null, stroke: [], downT: 0, moved: 0, tip: new THREE.Vector3(), tipN: new THREE.Vector3(0, 1, 0), active: false };
function setRay(x, y) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
function groundHit() { const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -1e-4) return null; const t = -o.y / d.y; return new THREE.Vector3(o.x + d.x * t, 0, o.z + d.z * t); }

canvas.addEventListener('pointerdown', (e) => {
  A.audioInit();
  if (P.down) return;
  P.down = true; P.id = e.pointerId; P.x = e.clientX; P.y = e.clientY; P.downT = S.time; P.moved = 0; P.stroke = []; P.last = null; P.mode = null;
  S.idle = 0; hintEl.classList.remove('on');
  try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
  // チョーク箱
  const h = tray.hit(e.clientX, e.clientY);
  if (h >= 0) { tray.sel = h; tray.pulse = 0.5; girlHand.setChalkColor(tray.color); A.tap(); P.mode = 'ui'; return; }
  if (h === -2) { P.mode = 'ui'; return; }
  onDown(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', (e) => { if (!P.down || e.pointerId !== P.id) return; P.moved += Math.hypot(e.clientX - P.x, e.clientY - P.y); P.x = e.clientX; P.y = e.clientY; });
const up = (e) => { if (!P.down || e.pointerId !== P.id) return; P.down = false; onUp(); };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

function pickObj(x, y, objs) {
  setRay(x, y);
  const hits = ray.intersectObjects(objs.filter(Boolean), true);
  return hits.length ? hits[0] : null;
}

function onDown(x, y) {
  const st = S.st;
  if (st === 'intro_hat') {
    const h = pickObj(x, y, [hat, girl.root]);
    if (h || near2D(x, y, hat.position, 140)) { go('intro_hatfly'); A.whoosh(); }
    return;
  }
  if (st === 'intro_box') {
    if (pickObj(x, y, [chalkBox]) || near2D(x, y, chalkBox.position, 140)) { go('intro_open'); A.flap(); }
    return;
  }
  if (st === 'free') {
    // 完成した物・車・舟をさわる
    setRay(x, y);
    const objs = [car.pivot, boat.pivot, ...S.things.filter((t) => t.done).map((t) => t.pivot)];
    const hit = pickObj(x, y, objs);
    if (hit) {
      let o = hit.object; while (o && !objs.includes(o)) o = o.parent;
      if (o === car.pivot) { if (!S.drive) startDrive(false); else A.horn(); P.mode = 'tap'; return; }
      if (o === boat.pivot) { startSail(); P.mode = 'tap'; return; }
      const th = S.things.find((t) => t.pivot === o);
      if (th) { const k = th.poke(); if (k === 'ball') A.boing(); else A.flap(); P.mode = 'tap'; return; }
    }
    const g = groundHit();
    if (g) {
      const m = 0.16;
      const inThing = S.things.find((t) => !t.done && g.x > t.cov.x0 - m && g.x < t.cov.x0 + t.cov.nx * t.cov.cell + m && g.z > t.cov.z0 - m && g.z < t.cov.z0 + t.cov.nz * t.cov.cell + m);
      P.mode = inThing ? 'paint' : 'draw';
    }
    return;
  }
  if (st === 'car_paint' || st === 'boat_paint') { P.mode = 'paint'; return; }
  if (st === 'car_fix') { P.mode = 'wheel'; return; }
}
function near2D(x, y, wp, px) { const p = wp.clone().project(camera); const sx = (p.x * 0.5 + 0.5) * innerWidth, sy = (-p.y * 0.5 + 0.5) * innerHeight; return Math.hypot(sx - x, sy - y) < px; }

function onUp() {
  if (P.mode === 'draw' && P.stroke.length) {
    const info = recognize(P.stroke);
    if (info) {
      const th = new Thing(paint, info, tray.color);
      th.outline(R0);
      scene.add(th.pivot); S.things.push(th);
      A.chime();
      for (const p of P.stroke) if (Math.random() < 0.3) sparks.emit(p[0], 0.02, p[1], 0, 0.05, 0, 0.03, 0.8, 1, 0.95, 0.85, 0.9);
      if (S.things.length > 7) { const old = S.things.shift(); old.sinking = true; S.sinking = (S.sinking || []).concat([old]); }
    }
  }
  P.mode = null; P.last = null; P.stroke = [];
}

// ---------- 塗る ----------
function activeTargets() {
  if (S.st === 'car_paint' || S.st === 'car_fix') return car.parts;
  if (S.st === 'boat_paint') return boat.parts;
  if (S.st === 'free') return S.things.filter((t) => !t.done).map((t) => ({ cov: t.cov, thing: t, done: t.done, th: t.th }));
  return [];
}
function dab(x, z, r, col, strength, targets, real = true) {
  paint.chalk(x, z, r * (0.9 + Math.random() * 0.25), col, strength);
  if (!real) return;
  for (const p of targets) {
    if (p.done && !p.sloppy) continue;
    if (!p.cov.contains(x, z) && !p.cov.contains(x + r * 0.6, z) && !p.cov.contains(x - r * 0.6, z) && !p.cov.contains(x, z + r * 0.6) && !p.cov.contains(x, z - r * 0.6)) continue;
    const added = p.cov.hit(x, z, r * 0.92);
    if (added > 0 || p.sloppy) { paint.real(x, z, r * 1.02, 1, 0.3); if (p.thing) p.thing.color = col; else p.color = col; }
  }
}
function strokeTo(pt, r, col, strength, targets, real = true) {
  if (!P.last) { dab(pt.x, pt.z, r, col, strength, targets, real); P.last = pt.clone(); return; }
  const d = pt.distanceTo(P.last); const step = r * 0.33;
  if (d < step) return;
  const n = Math.ceil(d / step);
  for (let i = 1; i <= n; i++) { const q = P.last.clone().lerp(pt, i / n); dab(q.x, q.z, r, col, strength, targets, real); }
  P.last = pt.clone();
}

paint.onReal = (x, z, r) => {
  if (Math.random() < 0.35) {
    const y = 0.02 + Math.random() * 0.06;
    sparks.emit(x + (Math.random() - 0.5) * r, y, z + (Math.random() - 0.5) * r, 0, 0.08 + Math.random() * 0.1, 0, 0.018 + Math.random() * 0.03, 0.5 + Math.random() * 0.5, 1, 0.96, 0.86, 1);
  }
  if (S.time - S.lastSpark > 0.13) { S.lastSpark = S.time; A.sparkle(); }
};

// 部品を仕上げる（残りを自動で）
function completePart(p, color) {
  p.done = true; p.sloppy = false;
  const cells = p.cov.unpainted();
  const c = color || p.color || tray.color;
  const ref = P.last || new THREE.Vector3((p.cov.x0 + p.cov.nx * p.cov.cell / 2), 0, p.cov.z0);
  cells.sort((a, b) => Math.hypot(a[0] - ref.x, a[1] - ref.z) - Math.hypot(b[0] - ref.x, b[1] - ref.z));
  const n = cells.length;
  cells.forEach((cl, i) => S.fillQ.push({ t: S.time + 0.05 + (i / Math.max(1, n)) * 0.7, x: cl[0], z: cl[1], c, cov: p.cov, r: p.cov.cell * 1.6 }));
  A.chime();
}
function processFill() {
  if (!S.fillQ.length) return;
  const keep = [];
  for (const f of S.fillQ) {
    if (f.t <= S.time) { paint.chalk(f.x, f.z, f.r * 1.3, f.c, 0.5); paint.real(f.x, f.z, f.r * 1.4, 1, 0.12); f.cov.hit(f.x, f.z, f.r); }
    else keep.push(f);
  }
  S.fillQ = keep;
}

// ---------- パパのやらかし：後ろのタイヤを四角く塗る ----------
function papaScript() {
  const p = car.parts.find((q) => q.name === 'wheelR');
  const cx = car.wb[0], cy = car.R; const a = 0.103;
  const pts = [];
  const sq = [[-a, -a], [a, -a], [a, a], [-a, a], [-a, -a]];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) { const t = k / 8; pts.push([sq[i][0] + (sq[i + 1][0] - sq[i][0]) * t, sq[i][1] + (sq[i + 1][1] - sq[i][1]) * t]); }
  for (let y = -a + 0.02, row = 0; y <= a - 0.015; y += 0.03, row++) { pts.push([row % 2 ? a - 0.02 : -a + 0.02, y]); pts.push([row % 2 ? -a + 0.02 : a - 0.02, y]); }
  // 線の間も細かく打つ
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.012)); for (let k = 0; k < n; k++) dense.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); }
  dense.push(pts[pts.length - 1]);
  return { part: p, pts: dense.map(([x, y]) => car.toWorld(cx + x, cy + y)), i: 0, t: 0 };
}

// ---------- 車が走る ----------
const loop = new THREE.CatmullRomCurve3([
  [0, 0.31], [0.7, 0.33], [1.0, -0.25], [0.78, -1.3], [0.0, -1.7], [-0.88, -1.38], [-1.15, -0.4], [-0.72, 0.29],
].map(([x, z]) => new THREE.Vector3(x + carOrig[0], 0, z + carOrig[1] + 0.06)), true, 'catmullrom', 0.5);
const loopLen = loop.getLength();
function startDrive(first) {
  let curve = loop, len = loopLen;
  if (S.st === 'free') {
    // 止まっている所から、左回りに小さく一周
    const p0 = car.pivot.position.clone(), h = car.pivot.rotation.y;
    const fwd = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)), left = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(-1);
    const r = 0.75, c = p0.clone().addScaledVector(left, r); const pts = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pts.push(c.clone().addScaledVector(left, -Math.cos(a) * r).addScaledVector(fwd, Math.sin(a) * r * 1.3)); }
    curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5); len = curve.getLength();
  }
  S.drive = { s: 0, v: 0, first, done: false, lastH: 0, curve, len };
  A.engine(true, 0); car.lampM.emissiveIntensity = 2.0;
}
function updateDrive(dt) {
  const D = S.drive; if (!D) return;
  const rough = 1 - car.roundness(car.parts.find((p) => p.name === 'wheelR'));
  const vmax = rough > 0.05 ? 0.55 : 0.95;
  const remain = D.len - D.s;
  const target = remain < 0.6 ? Math.max(0.08, remain * 1.3) : vmax;
  D.v += (target - D.v) * (1 - Math.exp(-dt * 2));
  D.s += D.v * dt;
  if (D.s >= D.len) { D.s = D.len; D.done = true; }
  const u = Math.min(0.99999, D.s / D.len);
  const p = D.curve.getPointAt(u), tg = D.curve.getTangentAt(u);
  car.pivot.position.set(p.x, 0, p.z);
  car.pivot.rotation.set(0, Math.atan2(-tg.z, tg.x), 0);
  car.spin -= (D.v * dt) / car.R;
  for (const w of car.wheels) w.g.rotation.z = car.spin;
  const [hR, hF] = car.rideHeights();
  const y = (hR + hF) / 2 - car.R; const pitch = Math.atan2(hF - hR, car.wb[1] - car.wb[0]);
  car.root.position.y = y; car.root.rotation.z = pitch;
  if (D.lastH - hR > 0.006 && rough > 0.05) { A.clunk(); for (let i = 0; i < 3; i++) dust.emit(p.x + (Math.random() - 0.5) * 0.4, 0.02, p.z + 0.2, (Math.random() - 0.5) * 0.3, 0.2, 0, 0.05, 0.8, 0.8, 0.78, 0.74, 0.4); }
  D.lastH = hR;
  A.engine(true, D.v, rough);
  carBlob.position.set(p.x, 0.003, p.z); carBlob.rotation.y = car.pivot.rotation.y;
  if (D.done && D.v < 0.1) { S.drive = null; A.engine(false); car.lampM.emissiveIntensity = 0; car.root.position.y = 0; car.root.rotation.z = 0; return 'end'; }
  return null;
}

// ---------- 小舟 ----------
const pond = { c: new THREE.Vector2(2.5, -0.55), R: 1.22 };
function startSail() { if (!S.boatSail) S.boatSail = { a: Math.atan2(boat.pivot.position.z - pond.c.y, boat.pivot.position.x - pond.c.x), t: 0 }; A.splash(0.5); }

// ---------- ヒント ----------
function hintTarget() {
  const st = S.st;
  if (st === 'intro_hat') return hat.position.clone().add(new THREE.Vector3(0, 0.05, 0));
  if (st === 'intro_box') return chalkBox.position.clone().add(new THREE.Vector3(0, 0.05, 0));
  const parts = st === 'car_paint' || st === 'car_fix' ? car.parts : st === 'boat_paint' ? boat.parts : null;
  if (st === 'car_fix') { const w = car.wheels.find((q) => q.part.name === 'wheelR' && q.side > 0); return w.g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.05)); }
  if (parts) {
    let best = null, bf = 2;
    for (const p of parts) { if (p.done && !p.sloppy) continue; if (p.sloppy && st === 'car_paint') continue; const f = p.frac / p.th; if (f < bf) { bf = f; best = p; } }
    if (!best) return null;
    const c = best.cov.centroidUnpainted(); if (!c) return null;
    return new THREE.Vector3(c[0], 0.02, c[1]);
  }
  if (st === 'free') {
    const t = S.things.find((q) => !q.done);
    if (t) { const c = t.cov.centroidUnpainted(); if (c) return new THREE.Vector3(c[0], 0.02, c[1]); }
    return new THREE.Vector3(0.35, 0, -1.6);
  }
  return null;
}

// ---------- 画面サイズ ----------
function resize() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  tray.layout(W, H);
  try { makePost(W, H); } catch (e) { post.on = false; }
}
addEventListener('resize', resize);

// ---------- 進行 ----------
function update(dt) {
  S.time += dt; S.t += dt; S.idle += dt;
  const st = S.st; const enter = S.enter; S.enter = false;
  const T = S.t;

  // --- 導入：帽子とチョーク ---
  if (st === 'intro_hat') {
    if (enter) { setShot('intro', true); placeHumans('intro'); tray.visible = false; }
    const k = 0.5 + 0.5 * Math.sin(S.time * 4);
    hat.children.forEach((m) => { if (m.material && m.material.emissive) m.material.emissive.setRGB(0.12 * k, 0.1 * k, 0.05 * k); });
    hat.rotation.z = Math.sin(S.time * 3) * 0.03;
  }
  if (st === 'intro_hatfly') {
    if (enter) { S.hatFrom = hat.position.clone(); hat.children.forEach((m) => m.material.emissive && m.material.emissive.setRGB(0, 0, 0)); }
    const k = easeInOut(T / 0.9);
    const to = girl.head.localToWorld(girl.hatAnchor.clone());
    hat.position.lerpVectors(S.hatFrom, to, k); hat.position.y += Math.sin(k * Math.PI) * 0.35;
    hat.rotation.set(Math.sin(k * Math.PI) * 0.6, k * 6.28 + 0.4, 0);
    if (T >= 0.9) {
      girl.head.attach(hat); hat.position.copy(girl.hatAnchor); hat.rotation.set(-0.12, 0, 0);
      girl.play('hop'); A.say('わあ！', 'girl'); A.chime();
      for (let i = 0; i < 20; i++) sparks.emit(to.x, to.y, to.z, (Math.random() - 0.5) * 0.6, Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 0.04, 0.8, 1, 0.95, 0.8, 1);
      go('intro_box_wait');
    }
  }
  if (st === 'intro_box_wait') { if (T > 1.4) { girl.play('idle'); girl.root.rotation.y = Math.PI + 0.15; setShot('introBox'); go('intro_box'); } }
  if (st === 'intro_box') {
    chalkBox.rotation.z = Math.sin(S.time * 5) * 0.03; chalkBox.position.y = 0.46 + Math.max(0, Math.sin(S.time * 5)) * 0.01;
  }
  if (st === 'intro_open') {
    chalkBox.userData.lid.rotation.x = -easeOut(T / 0.5) * 1.9; chalkBox.rotation.z = 0;
    if (T > 0.3 && T < 0.35) A.say('かこう！', 'girl');
    if (T > 1.0) { fade(() => { go('car_intro'); }); go('wait'); }
  }

  // --- 車 ---
  if (st === 'car_intro') {
    if (enter) { setShot('car', true); placeHumans('car'); girl.root.visible = false; papa.root.visible = false; tray.visible = true; S.papa = papaScript(); A.say('パパもかくよ！', 'papa'); }
    if (T > 0.8) go('car_papa');
  }
  if (st === 'car_papa') {
    const ps = S.papa; const N = new THREE.Vector3(0, 1, 0);
    const from = new THREE.Vector3(car.wb[0] + carOrig[0] - 0.2, 1.4, carOrig[1] - 1.6);
    papaHand.root.visible = true;
    const idx = Math.min(ps.pts.length - 1, Math.floor(Math.max(0, T - 0.4) * 70));
    const [x, z] = ps.pts[idx];
    const tip = new THREE.Vector3(x, 0, z);
    papaHand.place(tip, N, from, dt, T > 0.4, 0.5);
    if (T > 0.4) {
      while (ps.i <= idx) { const [px, pz] = ps.pts[ps.i]; paint.chalk(px, pz, 0.03, new THREE.Color(CHALKS[3]), 0.7); paint.real(px, pz, 0.032, 1, 0.3); ps.part.cov.hit(px, pz, 0.028); ps.i++; dust.emit(px, 0.01, pz, (Math.random() - 0.5) * 0.1, 0.05, (Math.random() - 0.5) * 0.1, 0.012, 0.8, 0.95, 0.92, 0.75, 0.5); }
      A.scratch(0.6, dt);
    }
    if (idx >= ps.pts.length - 1 && T > ps.pts.length / 70 + 1.0) {
      ps.part.done = true; ps.part.sloppy = true; ps.part.color = new THREE.Color(CHALKS[3]);
      papaHand.root.visible = false; A.scratch(0, dt); go('car_paint');
    }
  }
  if (st === 'car_paint') {
    if (enter) { girlHand.root.visible = true; papaHand.root.visible = false; }
    paintTick(dt);
    for (const p of car.parts) {
      if (!p.done && p.frac >= p.th) completePart(p);
      if (p.sloppy && p.frac >= 0.9) { completePart(p); }
    }
    if (car.parts.every((p) => p.done) && !S.fillQ.length) { S.carDoneT = (S.carDoneT || 0) + dt; if (S.carDoneT > 0.6) go('car_lift'); }
  }
  if (st === 'car_lift') {
    if (enter) {
      girlHand.root.visible = false;
      for (const p of car.parts) if (p.isWheel) car.applyProfile(p, car.computeProfile(p));
      const wr = car.parts.find((p) => p.name === 'wheelR');
      car.setLifted(true); if (wr.sloppy || car.roundness(wr) < 0.97) wr.sloppy = true;
      setWheelMask(wr.sloppy);
      paint.lift(carOrig[0] - 0.75, carOrig[1] - 0.8, carOrig[0] + 0.75, carOrig[1] + 0.02);
      A.rise(); setShot('carWide', false, 1.6); tray.visible = false;
      girl.root.visible = true; papa.root.visible = true; girl.play('look'); papa.play('look');
      car.lifting = true;
    }
    const k = easeInOut((T - 0.3) / 1.3);
    car.pivot.rotation.x = -Math.PI / 2 * (1 - k);
    if (T > 1.6 && !S.liftDone) {
      S.liftDone = true; A.thump(0.5);
      // 回転の中心を車の中心へ
      car.pivot.rotation.x = 0; car.pivot.position.z += car.W / 2; car.root.position.z = 0;
      carBlob.visible = true; carBlob.position.set(car.pivot.position.x, 0.003, car.pivot.position.z);
      for (let i = 0; i < 26; i++) dust.emit(car.pivot.position.x + (Math.random() - 0.5) * 1.3, 0.02, car.pivot.position.z + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.5, 0.06, 1.2, 0.9, 0.88, 0.85, 0.35);
      girl.play('hop'); A.say('ほんものだ！', 'girl'); papa.play('clap');
    }
    if (T > 3.2) { S.liftDone = false; go('car_drive'); }
  }
  if (st === 'car_drive' || st === 'car_drive2') {
    if (enter) { startDrive(st === 'car_drive'); cam.follow = () => car.pivot.position.clone().multiplyScalar(0.35).setY(0); girl.play('clap'); papa.play('idle'); }
    const r = updateDrive(dt);
    if (S.t > 1.5) girl.play('idle');
    if (r === 'end') {
      cam.follow = null;
      const wr = car.parts.find((p) => p.name === 'wheelR');
      if (wr.sloppy) go('car_oops'); else go('car_yay');
    }
  }
  if (st === 'car_oops') {
    if (enter) { papa.play('scratch'); A.say('あれれ？', 'papa'); girl.play('tilt'); }
    if (T > 2.4) go('car_fix');
  }
  if (st === 'car_fix') {
    if (enter) { setShot('carFix', false, 1.8); tray.visible = true; girl.root.visible = false; papa.root.visible = false; girlHand.root.visible = true; }
    paintTick(dt);
    const wr = car.parts.find((p) => p.name === 'wheelR');
    if (wr.sloppy) {
      S.profT = (S.profT || 0) + dt;
      if (S.profT > 0.12) { S.profT = 0; car.applyProfile(wr, car.computeProfile(wr)); }
      if (wr.frac >= 0.9) { completePart(wr); }
    } else if (!S.fillQ.length) {
      S.fixT = (S.fixT || 0) + dt;
      car.applyProfile(wr, car.computeProfile(wr));
      if (S.fixT > 0.8) { setWheelMask(false); girlHand.root.visible = false; tray.visible = false; setShot('carWide', false, 1.6); girl.root.visible = true; papa.root.visible = true; girl.play('hop'); A.say('まんまる！', 'girl'); go('car_drive2'); }
    }
  }
  if (st === 'car_yay') {
    if (enter) { girl.play('hop'); papa.play('clap'); A.chime(); A.say('やったー！', 'girl'); A.horn(); }
    if (T > 3.2) { fade(() => go('boat_intro')); go('wait'); }
  }

  // --- 小舟 ---
  if (st === 'boat_intro') {
    if (enter) { setShot('boat', true); girl.root.visible = false; papa.root.visible = false; tray.visible = true; girlHand.root.visible = true; car.pivot.position.set(-0.35, 0, 0.42); car.pivot.rotation.y = 0.15; carBlob.position.set(-0.35, 0.003, 0.42); carBlob.rotation.y = 0.15; }
    if (T > 0.4) go('boat_paint');
  }
  if (st === 'boat_paint') {
    paintTick(dt);
    for (const p of boat.parts) if (!p.done && p.frac >= p.th) completePart(p);
    if (boat.parts.every((p) => p.done) && !S.fillQ.length) { S.boatDoneT = (S.boatDoneT || 0) + dt; if (S.boatDoneT > 0.6) go('boat_lift'); }
  }
  if (st === 'boat_lift') {
    if (enter) {
      girlHand.root.visible = false; tray.visible = false; boat.setLifted(true); boat.lifting = true;
      paint.lift(boatOrig[0] - 0.7, boatOrig[1] - 1.2, boatOrig[0] + 0.7, boatOrig[1] + 0.05);
      A.water(); setShot('boatWide', false, 1.4); placeHumans('boat'); girl.root.visible = true; papa.root.visible = true; girl.play('look'); papa.play('look');
      GU.uPond.value.set(pond.c.x, pond.c.y, 0.3, 0);
    }
    GU.uPond.value.z = lerp(0.3, pond.R, easeOut(T / 2.4));
    const k = easeInOut((T - 0.9) / 1.4);
    boat.pivot.rotation.x = -Math.PI / 2 * (1 - k);
    boat.pivot.position.y = -0.06 * k;
    if (T > 2.3 && !S.bLift) {
      S.bLift = true; boat.pivot.rotation.x = 0; boat.pivot.position.z += boat.W / 2; boat.root.position.z = 0;
      A.splash(1); GU.uRip.value.set(boat.pivot.position.x, boat.pivot.position.z, S.time, 1);
      for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; drops.emit(boat.pivot.position.x + Math.cos(a) * 0.3, 0.02, boat.pivot.position.z + Math.sin(a) * 0.25, Math.cos(a) * 0.6, 1 + Math.random() * 1.3, Math.sin(a) * 0.6, 0.02 + Math.random() * 0.02, 0.9, 0.85, 0.9, 0.95, 0.8); }
      girl.play('clap'); papa.play('hop'); A.say('ういた！', 'girl');
      S.boatFloat = true;
    }
    if (T > 5.5) { S.bLift = false; fade(() => go('free_intro')); go('wait'); }
  }

  // --- 自由に描く ---
  if (st === 'free_intro') {
    if (enter) {
      setShot('free', true); placeHumans('free'); papa.root.visible = true; tray.visible = true; girlHand.root.visible = true; papaHand.root.visible = false;
      car.pivot.position.set(-1.1, 0, -0.95); car.pivot.rotation.y = 0.45; carBlob.position.set(-1.1, 0.003, -0.95); carBlob.rotation.y = 0.45;
      bubble.visible = true; bubble.userData.draw(S.wish);
      S.boatHome = new THREE.Vector2(1.95, -0.85); boat.pivot.position.x = Math.min(boat.pivot.position.x, 2.2);
    }
    if (T > 0.3) go('free');
  }
  if (st === 'free') {
    paintTick(dt);
    for (const th of S.things) {
      if (!th.done && th.frac >= th.th) {
        th.done = true; const cells = th.cov.unpainted();
        cells.forEach((cl, i) => S.fillQ.push({ t: S.time + 0.05 + (i / Math.max(1, cells.length)) * 0.6, x: cl[0], z: cl[1], c: th.color, cov: th.cov, r: 0.04 }));
        A.chime(); th.finishAt = S.time + 1.0;
      }
      if (th.finishAt && S.time > th.finishAt) { th.finishAt = 0; th.U.uMaskOn.value = 0; if (th.kind === 'ball') th.vy = 2.2; A.pop(); A.say('できた！', 'girl'); papaReact(th.kind); }
    }
    if (S.drive) updateDrive(dt);
  }
  if (S.papaR) { S.papaR.t -= dt; if (S.papaR.t <= 0) { const f = S.papaR.next; S.papaR = null; f(); } }

  // 舟を浮かべる
  if (S.boatFloat) {
    const bp = boat.pivot;
    if (S.boatSail) {
      S.boatSail.t += dt; S.boatSail.a += dt * 0.55;
      const r = 0.68; const tx = pond.c.x + Math.cos(S.boatSail.a) * r, tz = pond.c.y + Math.sin(S.boatSail.a) * r * 0.75;
      bp.position.x += (tx - bp.position.x) * (1 - Math.exp(-dt * 2)); bp.position.z += (tz - bp.position.z) * (1 - Math.exp(-dt * 2));
      bp.rotation.y = -S.boatSail.a - Math.PI / 2 + 0.2;
      if (Math.random() < dt * 6) GU.uRip.value.set(bp.position.x, bp.position.z, S.time, 0.5);
      if (S.boatSail.t > 11.4) S.boatSail = null;
      if (!S.boatSail && S.boatHome) S.boatHome.set(bp.position.x, bp.position.z);
    } else {
      const hx = S.boatHome ? S.boatHome.x : pond.c.x + 0.05, hz = S.boatHome ? S.boatHome.y : pond.c.y + 0.1;
      bp.position.x += (hx - bp.position.x) * dt * 0.25; bp.position.z += (hz - bp.position.z) * dt * 0.25;
    }
    bp.position.y = -0.065 + Math.sin(S.time * 1.7) * 0.008;
    bp.rotation.x = Math.sin(S.time * 1.3) * 0.03; bp.rotation.z = Math.sin(S.time * 1.1 + 1) * 0.025;
    boat.animateSail(S.time, S.boatSail ? 1 : 0.3);
  }
  for (const th of S.things) th.update(dt);
  if (S.sinking) for (const th of S.sinking) { th.inner.position.z -= dt * 0.3; if (th.inner.position.z < -1) { scene.remove(th.pivot); th.gone = true; } }
  if (S.sinking) S.sinking = S.sinking.filter((t) => !t.gone);

  processFill();
  car.updateRise(dt); boat.updateRise(dt);
  for (const w of car.wheels) if (w.side < 0) w.g.visible = !!car.lifting;
  if (car.state !== 'up' && (st === 'car_lift' || S.liftDone)) car.state = 'up';

  // 人
  if (girl.root.visible) girl.update(dt); if (papa.root.visible) papa.update(dt);
  girlBlob.visible = girl.root.visible; girlBlob.position.set(girl.root.position.x, 0.004, girl.root.position.z);
  papaBlob.visible = papa.root.visible; papaBlob.position.set(papa.root.position.x, 0.004, papa.root.position.z + (papa.state.startsWith('sit') ? 0.15 : 0));
  if (bubble.visible) { const hp = papa.head.getWorldPosition(new THREE.Vector3()); bubble.position.set(hp.x + 0.36, hp.y + 0.16 + Math.sin(S.time * 2) * 0.02, hp.z); }

  // ヒント
  const ht = hintTarget();
  if (ht && S.idle > 4 && !P.down && ['intro_hat', 'intro_box', 'car_paint', 'car_fix', 'boat_paint', 'free'].includes(st)) {
    const p = ht.clone().project(camera);
    const sx = (p.x * 0.5 + 0.5) * innerWidth, sy = (-p.y * 0.5 + 0.5) * innerHeight;
    hintEl.style.transform = `translate(${sx - 30}px, ${sy - 4}px)`; hintEl.classList.add('on');
  } else hintEl.classList.remove('on');
  if (ht && ['car_paint', 'boat_paint', 'free'].includes(st)) GU.uHi.value.set(ht.x, ht.z, 0.45, 1); else GU.uHi.value.w = 0;

  // 女の子の手：まだ触っていない時は次に塗る所の上で待つ
  if (girlHand.root.visible && !P.down) {
    const tgt = P.tip.lengthSq() > 0 && P.active ? P.tip : (ht || new THREE.Vector3(0, 0, 0));
    girlHand.place(tgt, P.active ? P.tipN : new THREE.Vector3(0, 1, 0), camera.position, dt, false, 0);
  }
  if (!P.down) A.scratch(0, dt);
}

function setWheelMask(on) {
  const wr = car.parts.find((p) => p.name === 'wheelR');
  wr.U.uMaskOn.value = on ? 1 : 0;
}

function papaReact(kind) {
  const ok = kind === S.wish;
  if (ok) { papa.play('sitClap'); A.say('やったね！', 'papa'); S.papaR = { t: 2.2, next: nextWish }; }
  else { papa.play('sitTilt'); A.say('あれ？', 'papa'); S.papaR = { t: 1.3, next: () => { papa.play('sitClap'); A.say('それもいいね！', 'papa'); S.papaR = { t: 2.0, next: nextWish }; } }; }
}
function nextWish() { const k = ['ball', 'box', 'ladder']; let n; do { n = k[Math.floor(Math.random() * 3)]; } while (n === S.wish); S.wish = n; bubble.userData.draw(n); papa.play('sit'); }

// 指で塗る／描く
function paintTick(dt) {
  if (!P.down || (P.mode !== 'paint' && P.mode !== 'draw' && P.mode !== 'wheel')) { P.active = P.active && true; return; }
  setRay(P.x, P.y);
  let pt = null, N = new THREE.Vector3(0, 1, 0);
  if (P.mode === 'wheel') {
    // 立っている車の後ろのタイヤ（外側の面）
    const w = car.wheels.find((q) => q.part.name === 'wheelR' && q.side > 0);
    const c = w.g.getWorldPosition(new THREE.Vector3());
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(car.pivot.quaternion);
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, c.clone().addScaledVector(n, 0.055));
    const hit = ray.ray.intersectPlane(pl, new THREE.Vector3());
    if (!hit) return;
    const loc = car.root.worldToLocal(hit.clone());
    const dx = loc.x - car.wb[0], dy = loc.y - car.R;
    if (Math.hypot(dx, dy) > car.R * 1.25) { P.active = false; return; }
    const [X, Z] = car.toWorld(loc.x, loc.y);
    const gp = new THREE.Vector3(X, 0, Z);
    const col = tray.color;
    if (!P.lastW) P.lastW = gp.clone();
    const d = gp.distanceTo(P.lastW); const nn = Math.max(1, Math.ceil(d / 0.01));
    for (let i = 1; i <= nn; i++) { const q = P.lastW.clone().lerp(gp, i / nn); paint.chalk(q.x, q.z, 0.035, col, 0.6); const wr = car.parts.find((p) => p.name === 'wheelR'); if (wr.cov.hit(q.x, q.z, 0.032) > 0 || true) paint.real(q.x, q.z, 0.036, 1, 0.25); }
    P.lastW = gp.clone();
    pt = hit; N = n;
    const sp = d / Math.max(dt, 1e-3); P.speed = lerp(P.speed, sp, 0.3);
    if (Math.random() < 0.5) dust.emit(hit.x, hit.y, hit.z + 0.01, (Math.random() - 0.5) * 0.1, -0.05, 0.05, 0.012, 0.7, col.r, col.g, col.b, 0.6);
  } else {
    pt = groundHit(); if (!pt) return;
    // 寝ている車・舟の浮き彫りの上を塗る時は、その高さの面で指の下の点を取る（視差のずれをなくす）
    const dr = (S.st === 'car_paint') ? car : (S.st === 'boat_paint') ? boat : null;
    if (dr && !dr.lifting) {
      const h = dr.W * Math.max(0.02, dr.parts[0].rise);
      const o = ray.ray.origin, d = ray.ray.direction; const t = (h - o.y) / d.y;
      const q = new THREE.Vector3(o.x + d.x * t, 0, o.z + d.z * t);
      if (dr.topAt(q.x, q.z) > 0) { pt = q; pt.y = h; }
    }
    const col = tray.color;
    if (P.mode === 'draw') {
      strokeTo(pt, 0.014, col, 0.85, [], false);
      if (!P.stroke.length || Math.hypot(pt.x - P.stroke[P.stroke.length - 1][0], pt.z - P.stroke[P.stroke.length - 1][1]) > 0.02) P.stroke.push([pt.x, pt.z]);
    } else {
      strokeTo(new THREE.Vector3(pt.x, 0, pt.z), 0.062, col, 0.55, activeTargets(), true);
    }
    const prev = P.tip.clone(); const sp = prev.distanceTo(pt) / Math.max(dt, 1e-3); P.speed = lerp(P.speed, Math.min(sp, 4), 0.3);
    if (Math.random() < Math.min(1, P.speed * 0.8)) dust.emit(pt.x + (Math.random() - 0.5) * 0.04, 0.008, pt.z + (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.12, 0.05 + Math.random() * 0.08, (Math.random() - 0.5) * 0.12, 0.008 + Math.random() * 0.012, 0.6 + Math.random() * 0.8, col.r * 0.9 + 0.1, col.g * 0.9 + 0.1, col.b * 0.9 + 0.1, 0.55);
  }
  P.tip.copy(pt); P.tipN.copy(N); P.active = true;
  girlHand.place(pt, N, camera.position, dt, true, P.speed);
  A.scratch(Math.min(1, P.speed * 0.6), dt);
}
canvas.addEventListener('pointerup', () => { P.lastW = null; });

// 白くふわっと切り替え
const fadeEl = document.getElementById('fade');
function fade(fn) { fadeEl.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => fadeEl.classList.remove('on'), 120); }, 380); }

// ---------- ループ ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, qualityChecked = 0;
const tmpPose = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now; dt = Math.min(dt, window.__dtMax || 0.05);
  // 画質の自動調整（iPhone で 30fps を守る）
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2.5 && !window.__noAdapt) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; qualityChecked++;
    if (fps < 34 && post.on && DPR <= 1.5) { post.on = false; if (post.rt) post.rt.dispose(); post.rt = null; }
    else if (fps < 34 && DPR > 1) { DPR = Math.max(1, DPR - 0.25); renderer.setPixelRatio(DPR); resize(); }
    else if (fps < 28 && sun.shadow.mapSize.x > 1024) { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map && sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  update(dt);
  // カメラ
  if (cam.shot) {
    shotPose(cam.shot, tmpPose);
    const k = 1 - Math.exp(-dt * cam.speed);
    cam.pos.lerp(tmpPose.pos, k); cam.tgt.lerp(tmpPose.tgt, k);
    camera.fov += (tmpPose.vf - camera.fov) * Math.min(1, k * 3);
    camera.updateProjectionMatrix();
  }
  camera.position.copy(cam.pos); camera.lookAt(cam.tgt);
  aimSun(sun, new THREE.Vector3(cam.tgt.x, 0, cam.tgt.z), Math.max(2.2, (cam.shot ? cam.shot.rw : 2) * 1.8));
  petals.center.set(cam.tgt.x, 0, cam.tgt.z);
  GU.uTime.value = S.time; grass.userData.U.uTime.value = S.time;
  petals.update(dt, S.time); sparks.update(dt, S.time); dust.update(dt, S.time); drops.update(dt, S.time);
  const pr = renderer.getPixelRatio(); sparks.mat.uniforms.uScale.value = innerHeight * pr * 0.9; dust.mat.uniforms.uScale.value = innerHeight * pr * 0.9; drops.mat.uniforms.uScale.value = innerHeight * pr * 0.9;
  tray.update(dt);
  paint.update(dt);
  renderer.autoClear = true;
  if (post.on && post.rt) {
    post.mat.uniforms.uFocus.value = camera.position.distanceTo(cam.tgt);
    renderer.setRenderTarget(post.rt); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(post.scene, post.cam);
  } else renderer.render(scene, camera);
  renderer.autoClear = false;
  tray.render(renderer, innerWidth, innerHeight);
  renderer.autoClear = true;
}

// ---------- 開始 ----------
hat.position.set(-2.72, 0.478, -3.1); hat.rotation.set(0, 0.6, 0);
resize();
placeHumans('intro');
setShot('intro', true);
camera.position.copy(cam.pos); camera.lookAt(cam.tgt);
const loader = document.getElementById('load');
const ready = Promise.race([loadCore(), new Promise((r) => setTimeout(r, 9000))]);
ready.then(() => {
  // 最初の数フレームでシェーダーを用意
  renderer.compile(scene, camera);
  go('intro_hat');
  requestAnimationFrame((t) => { last = t; frame(t); });
  setTimeout(() => loader.classList.add('hide'), 250);
  setTimeout(() => loadLate(), 600);
});
// デバッグ用（自動テスト）：?st=状態名
const qs = new URLSearchParams(location.search);
window.__game = { SH, cam, post, autoDrag: (pts, px = 30) => new Promise((res) => {
  const sp = pts.map((q) => { const v = new THREE.Vector3(q[0], q[2] || 0, q[1]).project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
  A.audioInit(); P.down = true; P.x = sp[0][0]; P.y = sp[0][1]; P.stroke = []; P.last = null; P.mode = null; P.moved = 0; onDown(P.x, P.y);
  let i = 1; const stepF = () => { if (i >= sp.length) { P.down = false; onUp(); P.lastW = null; res(); return; } const [tx, ty] = sp[i]; const dx = tx - P.x, dy = ty - P.y, d = Math.hypot(dx, dy); if (d <= px) { P.x = tx; P.y = ty; i++; } else { P.x += dx / d * px; P.y += dy / d * px; } requestAnimationFrame(stepF); }; requestAnimationFrame(stepF); }),
  tap: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight; A.audioInit(); P.down = true; P.x = sx; P.y = sy; P.mode = null; onDown(sx, sy); P.down = false; onUp(); },
  scr: (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(camera); return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight]; }, S, go, car, boat, paint, girl, papa, tray, completePart, camera, setShot, P, scene, renderer, GU, things: () => S.things, Thing, recognize, startSail, papaHand, girlHand, update };
