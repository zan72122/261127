// Game flow: intro (become the detective) -> 1 powder & brush -> 2 UV torch trail
// (+ papa's sneeze mess) -> 3 behind the curtain + free play.
import { T, scene, camera, renderer, post, view, tex, pbr, png, meshFrom, boxUV, canvasTex, clamp, lerp, smooth, damp, rand, V3, canvas } from './core.js';
import { W, lathe, contactShadow } from './world.js';
import { A } from './actors.js';
import { Particles, Motes } from './fx.js';
import { PaintRT, powderSurface, LatentPrint, planarPatch, DecalSet, UVL, POWDER } from './paint.js';
import { S, audioInit } from './audio.js';

const G = { state: 'boot', t: 0, idle: 0, hint: null, stateT: 0 };
export { G };
let P, motes;
const ray = new T.Raycaster();
const ndc = new T.Vector2();

// ================================================================ camera rig
const cam = { pos: V3(), look: V3(), tPos: V3(), tLook: V3(), speed: 1.6, focus: 1, ap: 1.0, shake: 0 };
function shot(pos, look, { portraitPull = 0.35, speed = 1.6, ap = 1.0, snap = false } = {}) {
  if (G.camLock) return;
  const p = V3(...pos), l = V3(...look);
  if (view.portrait) {
    // pull back along the view line and lift slightly so the sides stay in frame
    const d = p.clone().sub(l);
    p.copy(l).add(d.multiplyScalar(1 + portraitPull));
  }
  cam.tPos.copy(p); cam.tLook.copy(l); cam.speed = speed; cam.ap = ap;
  if (snap) { cam.pos.copy(p); cam.look.copy(l); }
  G.shotArgs = [pos, look, { portraitPull, speed, ap }];
}
function updateCam(dt) {
  const k = 1 - Math.exp(-dt * cam.speed);
  cam.pos.lerp(cam.tPos, k); cam.look.lerp(cam.tLook, k);
  // tiny handheld drift: reads as a real camera held by a person
  const t = G.t;
  const dx = Math.sin(t * 0.37) * 0.004 + Math.sin(t * 0.91) * 0.0015;
  const dy = Math.sin(t * 0.29 + 1) * 0.003 + Math.sin(t * 1.13) * 0.001;
  camera.position.set(cam.pos.x + dx, cam.pos.y + dy, cam.pos.z);
  camera.lookAt(cam.look);
  camera.setFocalLength(view.portrait ? 30 : 38);
  camera.updateMatrixWorld();
  const fd = camera.position.distanceTo(cam.look);
  cam.focus = damp(cam.focus, G.focusOverride || fd, 4, dt);
  post.uFocus.value = cam.focus;
  post.uAperture.value = cam.ap * (view.portrait ? 0.8 : 1.0);
}
addEventListener('resize', () => { if (G.shotArgs) shot(...G.shotArgs); });

// ============================================================= hint pointer
const hcv = document.getElementById('hint');
const hctx = hcv.getContext('2d');
function sizeHint() { hcv.width = innerWidth * Math.min(2, devicePixelRatio); hcv.height = innerHeight * Math.min(2, devicePixelRatio); hcv.style.width = innerWidth + 'px'; hcv.style.height = innerHeight + 'px'; }
sizeHint(); addEventListener('resize', sizeHint);
function toScreen(p) { const v = p.clone().project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; }
function drawGlove(x, y, s, press, alpha) {
  const c = hctx; const r = Math.min(2, devicePixelRatio);
  c.save(); c.scale(r, r); c.translate(x, y + press * 8); c.rotate(-0.35); c.scale(s, s);
  c.globalAlpha = alpha;
  c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
  c.fillStyle = '#fff'; c.strokeStyle = 'rgba(90,90,100,0.55)'; c.lineWidth = 2;
  c.beginPath();
  // index finger
  c.moveTo(-7, 0); c.lineTo(-7, 34); c.lineTo(7, 34); c.lineTo(7, 0); c.arc(0, 0, 7, 0, Math.PI, true);
  c.fill(); c.stroke();
  // fist
  c.beginPath(); c.roundRect(-14, 26, 36, 34, 12); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(-22, 30, 14, 22, 7); c.fill(); c.stroke();
  c.restore();
  if (press > 0.6) { c.save(); c.scale(r, r); c.globalAlpha = alpha * (1 - (press - 0.6) / 0.4) * 0.8; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 18 + (press - 0.6) * 40, 0, 7); c.stroke(); c.restore(); }
}
let hintA = 0;
function updateHint(dt) {
  hctx.clearRect(0, 0, hcv.width, hcv.height);
  const h = G.hint;
  const show = h && G.idle > (h.delay ?? 3.5) && !G.busy;
  hintA = damp(hintA, show ? 1 : 0, 6, dt);
  if (hintA < 0.02 || !h) return;
  const ph = (G.t * 0.8) % 1;
  let p = h.p, press = 0;
  if (h.drag) {
    const k = smooth(clamp(ph * 1.4, 0, 1));
    p = h.p.clone().lerp(h.drag, k);
    press = ph < 0.08 ? 1 : 0;
  } else press = Math.max(0, Math.sin(ph * Math.PI * 2)) ** 2;
  const [x, y, z] = toScreen(p);
  if (z > 1) return;
  drawGlove(x, y, view.portrait ? 1.05 : 1.2, press, hintA);
}
function setHint(p, o = {}) { G.hint = p ? { p, ...o } : null; }

// glints near the hint target: real-looking sparkles in the light
let glintT = 0;
function glints(dt) {
  glintT += dt;
  const h = G.hint;
  if (!h || G.busy || glintT < 1.1) return;
  glintT = 0;
  P.emit(h.glint || h.p, 3, { size: 0.0016, color: [1.6, 1.5, 1.3], spread: 0.015, jitter: 0.02, gravity: -0.01, life: 0.8, alpha: 0.9 });
}

// ================================================================== input
const ptr = { down: false, x: 0, y: 0, sx: 0, sy: 0, moved: 0, t0: 0, id: null };
function setNdc(e) { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
function pick(objs) { const h = ray.intersectObjects(objs, true); return h[0] || null; }
canvas.addEventListener('pointerdown', (e) => {
  audioInit();
  if (ptr.down) return;
  ptr.down = true; ptr.id = e.pointerId; ptr.sx = ptr.x = e.clientX; ptr.sy = ptr.y = e.clientY; ptr.moved = 0; ptr.t0 = G.t;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
  G.idle = 0;
  setNdc(e);
  handlers.down?.(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.moved += Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y);
  ptr.x = e.clientX; ptr.y = e.clientY;
  G.idle = 0;
  setNdc(e);
  handlers.move?.(e);
});
const up = (e) => {
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false;
  setNdc(e);
  handlers.up?.(e, ptr.moved < 14 && G.t - ptr.t0 < 0.5);
  S.brush(0);
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
let handlers = {};

// =============================================================== props
const P0 = {};
function buildProps() {
  // ---- cookie jar (glass, empty but for crumbs)
  const H = 0.24;
  const prof = [[0.07, 0.0], [0.082, 0.006], [0.086, 0.03], [0.086, 0.165], [0.08, 0.19], [0.066, 0.208], [0.062, 0.22], [0.063, 0.236], [0.066, 0.24]];
  const rAt = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return lerp(r0, r1, (y - y0) / (y1 - y0 || 1)); } return prof[prof.length - 1][0]; };
  const jarG = new T.LatheGeometry(prof.map(([r, y]) => new T.Vector2(r, y)), 72);
  // re-parametrise: u = angle fraction, v = height fraction (paint map space)
  { const p = jarG.attributes.position, uv = jarG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, p.getY(i) / H); }
  const jarPaint = new PaintRT(1024, 512, 128, 64);
  const glassM = new T.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, transparent: true, envMapIntensity: 2.6, depthWrite: false, specularIntensity: 1, ior: 1.5 });
  glassM.blending = T.CustomBlending; glassM.blendSrc = T.OneFactor; glassM.blendDst = T.OneMinusSrcAlphaFactor;
  glassM.opacity = 0;
  powderSurface(glassM, jarPaint, { glass: true });
  const pc = glassM.onBeforeCompile;
  glassM.onBeforeCompile = (sh, r) => {
    pc(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
      diffuseColor.a = max(diffuseColor.a, 0.045 + 0.35 * fr);
      #include <opaque_fragment>`);
  };
  glassM.customProgramCacheKey = () => 'jarglass';
  const jar = new T.Group();
  jar.position.set(-0.84, W.counterY, -1.99);
  const outer = new T.Mesh(jarG, glassM); outer.renderOrder = 6;
  const innerM = new T.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.05, transparent: true, opacity: 0.08, envMapIntensity: 1.5, side: T.BackSide, depthWrite: false });
  innerM.blending = T.CustomBlending; innerM.blendSrc = T.OneFactor; innerM.blendDst = T.OneMinusSrcAlphaFactor;
  const inner = new T.Mesh(jarG, innerM); inner.scale.set(0.955, 1, 0.955); inner.renderOrder = 5;
  // thick glass base
  const baseM = innerM.clone(); baseM.side = T.FrontSide; baseM.opacity = 0.35; baseM.color.set(0x0a0d0c); baseM.envMapIntensity = 0.35;
  const base = new T.Mesh(new T.CylinderGeometry(0.078, 0.07, 0.012, 64), baseM);
  base.position.y = 0.006;
  jar.add(inner, outer);
  // crumbs inside and spilled
  const crumbM = new T.MeshStandardMaterial({ color: 0xb58a55, roughness: 0.85 });
  for (let i = 0; i < 26; i++) {
    const cg = new T.IcosahedronGeometry(rand(0.0018, 0.005), 0);
    const cp = cg.attributes.position; for (let j = 0; j < cp.count; j++) cp.setXYZ(j, cp.getX(j) * rand(0.6, 1.4), cp.getY(j) * rand(0.4, 1.0), cp.getZ(j) * rand(0.6, 1.4));
    cg.computeVertexNormals();
    const c = meshFrom(cg, crumbM);
    const a = rand(0, 6.28), r = rand(0, 0.06);
    if (i < 16) c.position.set(Math.cos(a) * r, 0.014, Math.sin(a) * r);
    else c.position.set(rand(0.06, 0.2), 0.002, rand(-0.02, 0.1));
    c.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    jar.add(c);
  }
  scene.add(jar);
  contactShadow(-0.84, W.counterY, -1.99, 0.26, 0.26, 0.6);
  // lid lying beside, upside down
  const lid = lathe([[0, 0.022], [0.06, 0.022], [0.07, 0.018], [0.071, 0.0], [0.066, 0.0], [0.064, 0.016], [0, 0.017]], W.tinMat);
  lid.position.set(-1.02, W.counterY, -1.88); lid.rotation.x = Math.PI; lid.position.y += 0.022;
  scene.add(lid);
  const knob = meshFrom(new T.SphereGeometry(0.016, 20, 12), pbr('darkwood', { ns: 0.5 }));
  knob.scale.y = 0.7; knob.position.set(-1.02, W.counterY + 0.001, -1.88); scene.add(knob);
  contactShadow(-1.02, W.counterY, -1.88, 0.2, 0.2, 0.6);
  P0.jar = { group: jar, outer, paint: jarPaint, H, rAt };

  // ---- tile wall paint map (rect in world xy on the back wall)
  const rect = new T.Vector4(-1.06, 0.92, 0.92, 0.56);
  const tilePaint = new PaintRT(1024, 640, 128, 80);
  powderSurface(W.tileMat, tilePaint, { world: true, rect });
  P0.tile = { paint: tilePaint, rect, mesh: W.tileWall };

  // ---- powder pots (black + gold) on the counter
  P0.pots = {};
  const potDefs = [['black', -0.56, -1.86], ['gold', -0.47, -1.94]];
  for (const [k, x, z] of potDefs) {
    const g = new T.Group();
    const body = lathe([[0, 0], [0.032, 0], [0.034, 0.003], [0.034, 0.058], [0.0355, 0.06], [0.0355, 0.064], [0.031, 0.064], [0.031, 0.008], [0, 0.008]], W.tinMat, 48);
    g.add(body);
    const fillG = new T.CircleGeometry(0.031, 48); fillG.rotateX(-Math.PI / 2);
    const fp = fillG.attributes.position; for (let i = 0; i < fp.count; i++) fp.setY(i, Math.random() * 0.0015 + (1 - Math.hypot(fp.getX(i), fp.getZ(i)) / 0.031) * 0.003);
    fillG.computeVertexNormals();
    const pd = POWDER[k];
    const fillM = new T.MeshStandardMaterial({ color: pd.c, metalness: pd.metal, roughness: pd.rough, normalMap: tex('sofa_n'), normalScale: new T.Vector2(1.5, 1.5) });
    const fill = meshFrom(fillG, fillM); fill.position.y = 0.05; g.add(fill);
    // a little powder spilled on the rim
    const rim = meshFrom(new T.TorusGeometry(0.033, 0.0016, 6, 48), fillM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.064; g.add(rim);
    g.position.set(x, W.counterY, z);
    scene.add(g);
    contactShadow(x, W.counterY, z, 0.12, 0.12, 0.6);
    P0.pots[k] = g; g.userData.kind = k;
  }

  // ---- hat + magnifier waiting on the table
  P0.hat = A.girl.hat;
  A.girl.hat.visible = true;
  P0.hatSpot = new T.Group(); P0.hatSpot.position.set(-1.0, 0.742, 0.3); P0.hatSpot.rotation.y = 0.6;
  scene.add(P0.hatSpot);
  P0.hatSpot.add(A.girl.hat);
  A.girl.hat.position.set(0, 0, 0); A.girl.hat.rotation.set(0, 0, 0);
  P0.mag = A.girl.magnifier;
  P0.magSpot = new T.Group(); P0.magSpot.position.set(-1.16, 0.746, 0.4); P0.magSpot.rotation.set(-Math.PI / 2, 0, 0.9);
  scene.add(P0.magSpot); P0.magSpot.add(P0.mag); P0.mag.visible = true; P0.mag.position.set(0, 0, 0); P0.mag.rotation.set(0, 0, 0);
  contactShadow(-1.0, 0.742, 0.3, 0.3, 0.3, 0.7);

  // ---- curtains on the patio door (two linen panels)
  P0.curtains = [makeCurtain(W.patio.z - 0.12, 0.85, 1), makeCurtain(W.patio.z + W.patio.w + 0.12 - 0.85, 0.85, -1)];
  // a dog bed? no: a dog biscuit + ball for the hand-over
  const biscuit = makeBiscuit();
  const ball = meshFrom(new T.SphereGeometry(0.035, 32, 20), new T.MeshPhysicalMaterial({ color: 0x7c2f2a, roughness: 0.55, clearcoat: 0.3, normalMap: tex('sofa_n'), normalScale: new T.Vector2(0.4, 0.4) }));
  P0.biscuit = biscuit; P0.ball = ball;
  biscuit.visible = ball.visible = false;
  scene.add(biscuit, ball);

  // ---- UV trail decals, papa mess decals, free-play stamps
  P0.trail = new DecalSet('paw', 120, { kind: 1, parent: scene });
  P0.mess = new DecalSet('sock', 60, { kind: 0, parent: scene });
  P0.spill = new DecalSet('nose', 6, { kind: 0, parent: scene });
  P0.hands = new DecalSet('hand', 80, { kind: 0, parent: scene });
  P0.paws = new DecalSet('paw', 160, { kind: 0, parent: scene });
  P0.uvHands = new DecalSet('hand', 80, { kind: 1, parent: scene });
  P0.uvPaws = new DecalSet('paw', 160, { kind: 1, parent: scene });

  // ---- free-play tray (two pots + torch) near the patio
  P0.tray = new T.Group();
  const trayG = boxUV(new T.BoxGeometry(0.34, 0.016, 0.2), 0.3);
  const tray = meshFrom(trayG, W.oakMat); tray.position.y = 0.008; P0.tray.add(tray);
  P0.tray.position.set(1.95, 0, -0.75); P0.tray.rotation.y = 0.5;
  scene.add(P0.tray); P0.tray.visible = false;
}

function makeBiscuit() {
  const g = new T.Group();
  const m = new T.MeshStandardMaterial({ color: 0xc08a4c, roughness: 0.9, normalMap: tex('sofa_n'), normalScale: new T.Vector2(1, 1) });
  const bar = meshFrom(new T.CapsuleGeometry(0.012, 0.06, 6, 16), m); bar.rotation.z = Math.PI / 2; g.add(bar);
  for (const s of [-1, 1]) for (const t of [-1, 1]) { const k = meshFrom(new T.SphereGeometry(0.014, 16, 12), m); k.position.set(s * 0.04, 0, t * 0.01); g.add(k); }
  g.scale.y = 0.7;
  return g;
}

// ---------------------------------------------------------------- curtain
function makeCurtain(z0, width, side) {
  const H = 2.28, segX = 56, segY = 44;
  const g = new T.PlaneGeometry(width, H, segX, segY);
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position;
  const rest = new Float32Array(p.array);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / 0.28, uv.getY(i) * H / 0.28);
  const m = pbr('linen', { ns: 1.2, side: T.DoubleSide, env: 0.8, physical: { sheen: 0.6, sheenColor: new T.Color(0.8, 0.78, 0.72), sheenRoughness: 0.6 } });
  // backlight from the window: linen glows a little where the light comes through
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.55;');
  };
  const mesh = new T.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.set(W.ROOM.x1 - 0.2, H / 2 + 0.03, z0 + width / 2);
  scene.add(mesh);
  // rod + rings
  const rod = meshFrom(new T.CylinderGeometry(0.012, 0.012, width + 0.1, 16), new T.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.8, roughness: 0.4 }));
  rod.rotation.x = Math.PI / 2; rod.position.set(W.ROOM.x1 - 0.2, H + 0.06, z0 + width / 2); scene.add(rod);
  return { mesh, rest, width, H, z0, side, open: new Float32Array(segX + 1), bulge: V3(), bulgeAmt: 0, segX, segY };
}
function updateCurtain(c, t) {
  const p = c.mesh.geometry.attributes.position;
  const { segX, segY, width, H, side } = c;
  for (let j = 0; j <= segY; j++) {
    const v = 1 - j / segY; // 1 top -> 0 bottom
    for (let i = 0; i <= segX; i++) {
      const idx = j * (segX + 1) + i;
      const u = i / segX;
      // gathering: open amount pulls columns toward the hinge side
      const op = c.open[i];
      const uu = side > 0 ? u : 1 - u;
      const gathered = uu * (1 - op * 0.82 * (1 - 0.15 * v));
      const zLocal = (side > 0 ? gathered : 1 - gathered) * width - width / 2;
      const pleatAmp = 0.03 + op * 0.06;
      const pleat = Math.sin(u * Math.PI * 14 + Math.sin(v * 3 + i * 0.2) * 0.3) * pleatAmp * (0.8 + 0.2 * v);
      const sway = Math.sin(t * 0.8 + u * 3) * 0.004 * (1 - v);
      let x = pleat + sway;
      // bulge (puppy behind the curtain)
      const wz = c.mesh.position.z + zLocal, wy = c.mesh.position.y + (v - 0.5) * H;
      const d = Math.hypot(wz - c.bulge.z, (wy - c.bulge.y) * 0.8);
      x -= c.bulgeAmt * Math.exp(-(d * d) / 0.035) * 0.2;
      // the hem drags on the floor a bit
      p.setXYZ(idx, x - (1 - v) * 0.0, (v - 0.5) * H, zLocal);
    }
  }
  p.needsUpdate = true;
  c.mesh.geometry.computeVertexNormals();
}

// ================================================================ scenes
function hideAll() {
  A.hand.show(false);
}

// ---------------- intro
function startIntro() {
  G.state = 'intro'; G.stateT = 0;
  A.girl.root.visible = true;
  A.girl.root.position.set(-0.36, 0, -1.38); A.girl.root.rotation.y = Math.PI + 0.5;
  A.papa.root.visible = false;
  A.dog.root.visible = false;
  hideAll();
  shot([0.55, 1.32, 1.45], [-0.95, 0.72, -0.8], { snap: true, ap: 0.8, portraitPull: 0.5 });
  G.seq = 0;
  handlers = {
    down() {
      const h = pick([P0.hatSpot, P0.magSpot]);
      if (h && G.seq < 2 && !G.busy) { G.seq = 2; wearHat(); }
    },
  };
}
function updateIntro(dt) {
  G.stateT += dt;
  const g = A.girl;
  if (G.seq === 0 && !G.busy) {
    // she peeks into the empty jar, then droops
    g.lookPitch = G.stateT < 2.2 ? 0.25 : 0;
    if (G.stateT > 1.2 && !G.introSad) { G.introSad = true; g.do('sad', 1.6); S.hmm(); }
    if (G.stateT > 3.0) {
      G.seq = 1; g.lookYaw = 0.6;
      setHint(P0.hatSpot.getWorldPosition(V3()).add(V3(0, 0.05, 0)), { delay: 1.5 });
    }
  }
  // the hat waits with a little wobble
  if (G.seq === 1 && !G.busy) { P0.hatSpot.rotation.z = Math.sin(G.t * 3) * 0.03; }
}
function wearHat() {
  G.busy = true; setHint(null);
  S.swoosh();
  const g = A.girl;
  const from = P0.hatSpot.getWorldPosition(V3());
  const mFrom = P0.magSpot.getWorldPosition(V3());
  g.lookYaw = 0;
  tween(1.0, (k) => {
    const to = g.neck.localToWorld(V3(0, 0.155, -0.006));
    const p = from.clone().lerp(to, smooth(k)); p.y += Math.sin(k * Math.PI) * 0.35;
    P0.hatSpot.position.copy(p); P0.hatSpot.rotation.y = lerp(0.6, g.root.rotation.y, k); P0.hatSpot.rotation.x = Math.sin(k * Math.PI) * 0.8;
    const to2 = g.arms[0].localToWorld(V3(0.035, -0.34, 0.07));
    const p2 = mFrom.clone().lerp(to2, smooth(clamp(k * 1.2 - 0.2, 0, 1))); p2.y += Math.sin(k * Math.PI) * 0.25;
    P0.magSpot.position.copy(p2);
  }, () => {
    g.neck.add(g.hat); g.hat.position.set(0, 0.155, -0.006); g.hat.rotation.set(-0.12, 0, 0);
    g.arms[0].add(g.magnifier); g.magnifier.position.set(0.035, -0.34, 0.07); g.magnifier.rotation.set(-0.4, 0, -0.2);
    S.yay(); g.do('jump', 1.3);
    P.emit(g.neck.localToWorld(V3(0, 0.2, 0)), 30, { size: 0.003, color: [1.5, 1.35, 1.0], spread: 0.08, jitter: 0.4, gravity: 0.3, life: 1.2, alpha: 0.9 });
    after(1.6, () => { g.holdMag = true; g.do('lookup', 0.8); S.aha(); });
    after(2.6, () => { g.holdMag = false; G.busy = false; startS1(); });
  });
}

// ---------------- scene 1: powder & brush
function startS1() {
  G.state = 's1'; G.stateT = 0;
  A.girl.root.visible = false; // first person: her hand is our finger
  A.hand.show(true); A.hand.setTool('brush'); A.hand.useFlat(false);
  shot([-0.6, 1.2, -1.2], [-0.72, 1.05, -2.15], { speed: 1.2, ap: 1.3, portraitPull: 0.45 });
  G.load = 0; G.powder = 'black';
  G.prints = buildLatents();
  G.found = 0;
  G.lastHit = null;
  hintPot();
  handlers = {
    down(e) {
      G.lastHit = null;
      const pot = pick(Object.values(P0.pots));
      if (pot) { let o = pot.object; while (o && !o.userData.kind) o = o.parent; dip(o.userData.kind); return; }
      brushAt();
    },
    move() { brushAt(); },
    up(e, tap) {
      G.lastHit = null;
      if (tap) {
        const hit = pick([P0.jar.outer, P0.tile.mesh]);
        if (hit) { const pr = G.prints.find((q) => q.found && q.center.distanceTo(hit.point) < 0.03); if (pr) magnify(pr.center); }
      }
    },
  };
}
function hintPot() {
  const k = G.load > 0 ? null : 'black';
  if (k) setHint(P0.pots[G.powder].getWorldPosition(V3()).add(V3(0, 0.07, 0)), { delay: 1.2 });
}
function hintPrint() {
  const pr = G.prints.find((q) => !q.found && q.info.main);
  if (!pr) return setHint(null);
  const n = pr.info.normal;
  const a = pr.center.clone().addScaledVector(n, 0.005);
  const side = V3().crossVectors(n, V3(0, 1, 0)).normalize();
  setHint(a.clone().addScaledVector(side, -0.04), { drag: a.clone().addScaledVector(side, 0.04), delay: 3.0, glint: a });
}
function dip(kind) {
  if (G.busy) return;
  G.busy = true; G.powder = kind;
  const pot = P0.pots[kind];
  const top = pot.getWorldPosition(V3()).add(V3(0, 0.055, 0));
  const pd = POWDER[kind];
  tween(0.55, (k) => {
    const d = Math.sin(k * Math.PI);
    A.hand.aim(top.clone().add(V3(0, 0.05 * (1 - d), 0)), V3(0, 1, 0), 1 / 60, { k: 22 });
  }, () => {
    G.load = 1; G.busy = false;
    A.hand.tool.userData.U.uPowder.value.copy(pd.c);
    S.dip(); S.puff(0.2);
    P.emit(top.clone().add(V3(0, 0.02, 0)), 70, { size: 0.0018, color: [pd.c.r, pd.c.g, pd.c.b].map((v) => v * 1.2), metal: pd.metal, spread: 0.02, jitter: 0.12, gravity: 0.05, life: 2.5, alpha: 0.7, drag: 3 });
    hintPrint();
  });
}
function brushAt() {
  if (G.busy) return;
  const hit = pick([P0.jar.outer, P0.tile.mesh]);
  if (!hit) { G.lastHit = null; return; }
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  if (hit.object === P0.jar.outer) n.copy(hit.point).sub(P0.jar.group.position).setY(0).normalize();
  const pts = [];
  if (G.lastHit && G.lastHit.object === hit.object) {
    const d = G.lastHit.point.distanceTo(hit.point);
    const steps = Math.min(30, Math.ceil(d / 0.004));
    for (let i = 1; i <= steps; i++) pts.push(G.lastHit.point.clone().lerp(hit.point, i / steps));
  } else pts.push(hit.point.clone());
  const speed = G.lastHit ? G.lastHit.point.distanceTo(hit.point) / (1 / 60) : 0;
  S.brush(Math.min(1, speed * 1.2));
  const ang = G.lastHit ? Math.atan2(hit.point.y - G.lastHit.point.y, hit.point.x - G.lastHit.point.x) : 0;
  for (const p of pts) stampPowder(hit.object, p, ang);
  // bristles bend against the stroke
  const bend = G.lastHit ? hit.point.clone().sub(G.lastHit.point).multiplyScalar(-2) : V3();
  bend.clampLength(0, 0.012);
  const inv = A.hand.grip.quaternion.clone().invert();
  A.hand.tool.userData.U.uBend.value.copy(bend.applyQuaternion(inv)).add(V3(0, 0, 0));
  A.hand.aim(hit.point, n, 1 / 60, { k: 30 });
  G.lastHit = { object: hit.object, point: hit.point.clone() };
  // dust from the bristle tips
  if (G.load > 0.02 && Math.random() < 0.6) {
    const pd = POWDER[G.powder];
    P.emit(hit.point.clone().addScaledVector(n, 0.006), 2 + Math.floor(speed * 6), { size: 0.0012, color: [pd.c.r * 1.3, pd.c.g * 1.3, pd.c.b * 1.3], metal: pd.metal, spread: 0.008, jitter: 0.05 + speed * 0.05, gravity: 0.06, life: 2.2, alpha: 0.65, drag: 3.5 });
  }
  checkPrints();
}
function stampPowder(obj, p, ang) {
  if (G.load <= 0.01) return;
  const ch = G.powder === 'gold' ? 1 : 0;
  const amt = 0.16 * Math.min(1, G.load * 1.6);
  const r = 0.014;
  if (obj === P0.jar.outer) {
    const lp = P0.jar.group.worldToLocal(p.clone());
    let u = Math.atan2(lp.x, lp.z) / (Math.PI * 2); if (u < 0) u += 1;
    const v = lp.y / P0.jar.H;
    const circ = 2 * Math.PI * 0.086;
    P0.jar.paint.stamp(u, v, r / circ, r / P0.jar.H, ch, amt, ang);
    if (u < r / circ) P0.jar.paint.stamp(u + 1, v, r / circ, r / P0.jar.H, ch, amt, ang);
  } else {
    const R = P0.tile.rect;
    P0.tile.paint.stamp((p.x - R.x) / R.z, (p.y - R.y) / R.w, r / R.z, r / R.w, ch, amt, ang);
  }
  G.load = Math.max(0, G.load - 0.0012);
  A.hand.tool.userData.U.uLoad.value = G.load;
  if (G.load <= 0.01 && !G.emptyHint) { G.emptyHint = true; after(0.6, () => { G.emptyHint = false; if (G.state === 's1' && G.load <= 0.01) hintPot(); }); }
}
function buildLatents() {
  const out = [];
  // tile wall: puppy leaned on the wall standing on the counter (paws + nose), plus papa's fingertips
  const R = P0.tile.rect;
  const toTile = (wp) => [(wp.x - R.x) / R.z, (wp.y - R.y) / R.w];
  const zW = W.ROOM.z0 + 0.0075;
  const tileDefs = [
    ['paw', -0.73, 1.03, 0.052, 0.25, true], ['paw', -0.6, 1.08, 0.052, -0.2, true],
    ['paw', -0.47, 0.995, 0.05, 0.4, true], ['paw', -0.35, 1.045, 0.05, -0.1, true],
    ['nose', -0.63, 1.2, 0.05, 0.0, true],
    ['finger', -0.2, 1.11, 0.018, 0.3, false], ['finger', -0.175, 1.135, 0.018, 0.1, false],
  ];
  for (const [mask, x, y, s, rot, main] of tileDefs) {
    const c = V3(x, y, zW);
    const geo = planarPatch(c, V3(1, 0, 0), V3(0, 1, 0), s, s * (mask === 'finger' ? 1.3 : mask === 'nose' ? 0.7 : 1), rot, toTile);
    const lp = new LatentPrint(geo, mask, P0.tile.paint, c, { puv: toTile(c), pr: [s / 2 / R.z, s / 2 / R.w], main, normal: V3(0, 0, 1), kind: mask });
    scene.add(lp.mesh); out.push(lp);
  }
  // jar: paw dabs + fingertips around the rim (facing the camera)
  const J = P0.jar;
  const facing = Math.atan2(cam.tPos.x - J.group.position.x, cam.tPos.z - J.group.position.z);
  const jarDefs = [['paw', 0.0, 0.09, 0.045, true], ['paw', 0.45, 0.125, 0.045, true], ['finger', -0.45, 0.19, 0.017, false], ['finger', -0.3, 0.2, 0.017, false], ['finger', -0.6, 0.17, 0.018, false]];
  for (const [mask, da, y, s, main] of jarDefs) {
    const a0 = facing + da;
    const seg = 6;
    const geo = new T.BufferGeometry();
    const pos = [], uv = [], puv = [], idx = [];
    const r0 = J.rAt(y);
    const dA = s / r0, dY = s * (mask === 'finger' ? 1.3 : 1);
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg - 0.5) * dA, yy = y + (j / seg - 0.5) * dY;
      const r = J.rAt(yy) + 0.0006;
      const lp = V3(Math.sin(a) * r, yy, Math.cos(a) * r);
      const wp = J.group.localToWorld(lp);
      pos.push(wp.x, wp.y, wp.z);
      uv.push(i / seg, j / seg);
      let u = a / (Math.PI * 2); u -= Math.floor(u);
      puv.push(u, yy / J.H);
      if (i < seg && j < seg) { const b = j * (seg + 1) + i; idx.push(b, b + 1, b + seg + 1, b + 1, b + seg + 2, b + seg + 1); }
    }
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aPUv', new T.Float32BufferAttribute(puv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const ca = a0, cr = J.rAt(y);
    const c = J.group.localToWorld(V3(Math.sin(ca) * cr, y, Math.cos(ca) * cr));
    let cu = ca / (Math.PI * 2); cu -= Math.floor(cu);
    const lp = new LatentPrint(geo, mask, J.paint, c, { puv: [cu, y / J.H], pr: [s / 2 / (2 * Math.PI * 0.086), s / 2 / J.H], main, normal: V3(Math.sin(ca), 0, Math.cos(ca)), kind: mask });
    lp.mesh.renderOrder = 7;
    scene.add(lp.mesh); out.push(lp);
  }
  return out;
}
function checkPrints() {
  let changed = false;
  for (const pr of G.prints) {
    if (pr.found) continue;
    if (pr.level() > 0.75) {
      pr.found = true; changed = true; G.found++;
      S.reveal(G.found);
      P.emit(pr.center.clone().addScaledVector(pr.info.normal, 0.01), 8, { size: 0.0014, color: [1.8, 1.7, 1.4], spread: 0.012, jitter: 0.03, gravity: -0.01, life: 0.7 });
      if (pr.info.kind === 'paw' && G.found % 2 === 1) S.aha();
    }
  }
  if (changed) {
    const mainLeft = G.prints.filter((q) => q.info.main && !q.found).length;
    if (mainLeft === 0 && G.state === 's1' && !G.s1done) {
      G.s1done = true;
      after(0.8, () => { S.wow(); S.win(); });
      after(1.0, () => magnify(G.prints[0].center, 2.2));
      after(3.6, () => startS2());
    } else if (G.load > 0) hintPrint();
  }
}
function magnify(p, dur = 1.8) {
  const [x, y] = toScreen(p);
  S.wow();
  G.lens = { x: x / innerWidth, y: 1 - y / innerHeight, t: 0, dur };
}

// ---------------- scene 2: UV torch trail
function trailPath() {
  // where the puppy walked: down from the chair, round the cupboard, under the
  // table, over the rug, a hop on the sofa, then behind the curtain
  return [
    [[-0.95, -1.5], [-1.3, -1.15], [-2.0, -1.0], [-2.5, -0.75], [-2.45, -0.4]],
    [[-2.45, -0.4], [-2.0, -0.15], [-1.3, -0.3], [-0.6, -0.45], [0.1, -0.3], [0.6, -0.3]],
    [[0.6, -0.3], [0.85, -0.85], [0.95, -1.6, 0.51], [1.4, -1.65, 0.51], [1.95, -1.35], [2.4, -1.5], [2.8, -1.6]],
  ];
}
function layTrail() {
  G.trail = [];
  const segs = trailPath();
  segs.forEach((seg, si) => {
    const items = [];
    let left = false;
    for (let i = 0; i < seg.length - 1; i++) {
      const [x0, z0, y0 = 0] = seg[i], [x1, z1, y1 = 0] = seg[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(L / 0.1));
      const dir = Math.atan2(x1 - x0, z1 - z0);
      for (let k = 0; k < n; k++) {
        const t = (k + rand(-0.15, 0.15)) / n;
        let x = lerp(x0, x1, t), z = lerp(z0, z1, t);
        // sofa cushion height
        let y = (y0 > 0 && y1 > 0) ? 0.512 : 0.0;
        if (y === 0 && x > 0.1 && x < 2.1 && z > -1.25 && z < 0.15) y = 0.004; // rug
        left = !left;
        x += Math.cos(dir) * (left ? 0.035 : -0.035); z -= Math.sin(dir) * (left ? 0.035 : -0.035);
        const it = P0.trail.add(V3(x, y + 0.001, z), V3(0, 1, 0), dir + Math.PI + rand(-0.15, 0.15), 0.11, 0.11, [0, 0, 0], 0, rand(0.75, 1.0));
        it.seg = si;
        items.push(it);
      }
    }
    G.trail.push(items);
  });
}
const S2SHOTS = [
  [[0.2, 1.1, -0.3], [-1.7, 0.0, -1.05]],
  [[0.95, 1.15, 0.85], [-1.0, 0.0, -0.4]],
  [[-0.1, 1.12, 0.95], [1.7, 0.2, -1.1]],
];
function startS2() {
  G.state = 's2'; G.stateT = 0; G.seg = 0;
  A.hand.setTool('flash'); A.hand.show(true);
  P0.flash = A.hand.tool.userData;
  layTrail();
  // hide prints that were already brushed? keep them (results remain)
  shot(...S2SHOTS[0], { speed: 1.0, ap: 0.9, portraitPull: 0.45 });
  hintTrail();
  G.uvOn = 0;
  handlers = {
    down() { if (G.state === 's2') G.uvTarget = aimUV(); },
    move() { if (G.state === 's2') G.uvTarget = aimUV(); },
    up() { G.uvTarget = null; },
  };
}
function aimUV() {
  const hits = ray.intersectObjects([W.floor, W.rug, ...W.cushions], false);
  return hits[0] ? hits[0].point.clone() : null;
}
function hintTrail() {
  const seg = G.trail[G.seg];
  const it = seg && seg.find((q) => q.rev < 0.5);
  if (it) setHint(it.pos.clone(), { delay: 2.5 }); else setHint(null);
}
function updateS2(dt) {
  const f = P0.flash;
  const on = (ptr.down && G.uvTarget && !G.busy) ? 1 : 0;
  G.uvOn = damp(G.uvOn, on, 14, dt);
  f.light.intensity = G.uvOn * 9;
  f.beamM.uniforms.uOn.value = G.uvOn;
  f.lensM.emissiveIntensity = G.uvOn * 4;
  S.hum(on > 0.5);
  const target = G.uvTarget || G.lastUV || cam.look.clone();
  if (G.uvTarget) G.lastUV = G.uvTarget.clone();
  if (G.state === 's2' && !G.busy) A.hand.aim(target, V3(0, 1, 0), dt, { k: 14 });
  // UV light uniforms from the torch lens
  const lens = A.hand.tool.localToWorld(V3(0.096, 0, 0));
  const dir = target.clone().sub(lens).normalize();
  UVL.pos.value.copy(lens); UVL.dir.value.copy(dir); UVL.on.value = G.uvOn;
  // reveal prints inside the cone
  if (G.uvOn > 0.5 && G.state === 's2') {
    const seg = G.trail[G.seg];
    let newly = 0;
    for (const s of G.trail) for (const it of s) {
      const L = it.pos.clone().sub(lens); const d = L.length();
      if (L.normalize().dot(dir) > UVL.cos.value + 0.01) {
        const before = it.rev;
        P0.trail.setRev(it, Math.min(1, it.rev + dt * 1.8));
        if (before < 0.5 && it.rev >= 0.5 && it.seg === G.seg) newly++;
      }
    }
    if (newly) { S.glow(); }
    const frac = seg.filter((q) => q.rev >= 0.5).length / seg.length;
    if (frac > 0.8 && !G.busy) nextSeg();
    else if (newly) hintTrail();
  }
}
function nextSeg() {
  G.seg++;
  S.aha();
  if (G.seg === 2 && !G.gagDone) { G.gagDone = true; return papaGag(); }
  if (G.seg >= G.trail.length) { G.busy = true; setHint(null); after(1.2, startS3); return; }
  shot(...S2SHOTS[G.seg], { speed: 1.0, ap: 0.9, portraitPull: 0.45 });
  hintTrail();
}

// ---------------- papa's mess: he brings the big refill tin, trips, sneezes
function papaGag() {
  G.busy = true; setHint(null);
  const pa = A.papa;
  pa.root.visible = true;
  pa.root.position.set(2.6, 0, 1.6); pa.root.rotation.y = -2.4;
  pa.powderAll(0);
  // he carries the refill tin from the cupboard
  const tin = W.refill;
  pa.arms[0].add(tin); tin.position.set(0.04, -0.6, 0.1); tin.rotation.set(0, 0, 0);
  shot([-0.8, 1.5, 2.5], [0.85, 0.92, -0.1], { speed: 1.0, ap: 0.6, portraitPull: 0.35 });
  A.hand.show(false);
  // the girl steps into the shot (seen from behind)
  const g = A.girl; g.root.visible = true; g.root.position.set(-0.15, 0, 0.95); g.root.rotation.y = 2.3;
  S.papaHmm();
  pa.target = { x: 1.2, z: -0.05 };
  after(2.6, () => { pa.do('oops', 0.8); S.papaOops(); });
  after(3.0, () => {
    // the tin slips: it tumbles to the floor and bursts
    const from = tin.getWorldPosition(V3());
    scene.attach(tin);
    const land = V3(1.05, 0.0, 0.25);
    tween(0.5, (k) => { const p = from.clone().lerp(land, k); p.y = lerp(from.y, 0.0, k * k) + Math.sin(k * Math.PI) * 0.15; tin.position.copy(p); tin.rotation.z = k * 2.4; tin.rotation.x = k * 0.8; }, () => {
      tin.position.set(1.05, 0.05, 0.25); tin.rotation.set(0.0, 0.3, Math.PI / 2);
      S.clank(); S.puff(0.5);
      cam.shake = 0.5;
      powderCloud(V3(1.0, 0.05, 0.2), 380);
      P0.spill.add(V3(0.98, 0.002, 0.2), V3(0, 1, 0), 0.4, 0.42, 0.3, [0.045, 0.044, 0.043], 0.1, 1);
      P0.spill.add(V3(1.12, 0.002, 0.3), V3(0, 1, 0), 1.4, 0.25, 0.2, [0.045, 0.044, 0.043], 0.1, 0.9);
      g.do('huh', 1.0); S.huh();
    });
  });
  after(4.0, () => { pa.do('sneeze', 1.6); S.sneeze(); });
  after(5.2, () => {
    pa.powderAll(1); powderCloud(pa.neck.localToWorld(V3(0, 0.0, 0.15)), 240, 0.6);
    cam.shake = 0.3;
  });
  // he wobbles around in the cloud leaving sock prints everywhere
  after(5.8, () => {
    pa.do('wobble', 3.0);
    const pts = [[1.3, 0.1], [0.75, 0.45], [0.5, -0.1], [1.0, -0.45], [1.45, -0.2], [1.15, 0.1]];
    let i = 0;
    const walk = () => {
      if (i >= pts.length) { pa.target = { x: 1.2, z: 0.05, ry: -2.6 }; return; }
      pa.target = { x: pts[i][0], z: pts[i][1] };
      i++; after(0.55, walk);
    };
    walk();
    let foot = 0;
    const stepT = setInterval(() => {
      if (!pa.speed || pa.speed < 0.15) return;
      foot = 1 - foot;
      const ry = pa.root.rotation.y;
      const side = V3(Math.cos(ry), 0, -Math.sin(ry)).multiplyScalar(foot ? 0.09 : -0.09);
      const p = pa.root.position.clone().add(side); p.y = 0.002;
      P0.mess.add(p, V3(0, 1, 0), ry + Math.PI, 0.13, 0.27, [0.05, 0.049, 0.048], 0.1, rand(0.7, 1));
      S.step(0.05);
    }, 260);
    after(3.4, () => clearInterval(stepT));
  });
  after(9.6, () => { pa.do('shrug', 1.2); S.papaHa(); G.busy = false; startCleanup(); });
}
function powderCloud(at, n, up = 0.3) {
  P.emit(at, n, { size: 0.006, color: [0.07, 0.068, 0.066], spread: 0.08, jitter: 0.9, gravity: 0.08, life: 3.5, alpha: 0.55, drag: 2.2, grow: 2.0, vel: V3(0, up, 0) });
  P.emit(at, n / 2, { size: 0.0016, color: [0.06, 0.06, 0.06], spread: 0.05, jitter: 1.4, gravity: 0.6, life: 2.0, alpha: 0.8, drag: 1.5, floor: 0.002 });
}
function startCleanup() {
  G.state = 'clean';
  const g = A.girl;
  g.brushProp = g.brushProp || makeGirlBrush();
  g.arms[0].add(g.brushProp); g.brushProp.visible = true;
  hintClean();
  handlers = {
    down() { cleanAt(); },
    move() { cleanAt(); },
    up() { },
  };
}
function makeGirlBrush() {
  const b = A.hand.tools.brush.clone();
  b.position.set(0.02, -0.33, 0.06); b.rotation.set(0, 0, -1.2);
  b.scale.setScalar(1.0);
  return b;
}
function hintClean() {
  const pa = A.papa;
  if (pa.powderLeft() > 0.2) return setHint(pa.neck.localToWorld(V3(0, -0.35, 0.1)), { delay: 1.5, drag: pa.neck.localToWorld(V3(0, -0.65, 0.1)) });
  const m = P0.mess.items.find((q) => q.amt > 0.15) || P0.spill.items.find((q) => q.amt > 0.15);
  if (m) setHint(m.pos.clone().add(V3(-0.1, 0, 0)), { delay: 2, drag: m.pos.clone().add(V3(0.1, 0, 0)) });
  else setHint(null);
}
function cleanAt() {
  if (G.busy || G.state !== 'clean') return;
  const pa = A.papa, g = A.girl;
  const hitP = pick(pa.meshes);
  let p = null, onPapa = false;
  if (hitP) { p = hitP.point; onPapa = true; }
  else { const h = ray.intersectObject(W.floor, false)[0] || ray.intersectObject(W.rug, false)[0]; if (h) p = h.point; }
  if (!p) return;
  // the girl hurries over and brushes
  const stand = p.clone(); stand.y = 0;
  const toCam = camera.position.clone().setY(0).sub(stand).normalize();
  const goal = onPapa ? pa.root.position.clone().addScaledVector(toCam, 0.42) : stand.clone().addScaledVector(toCam, 0.3);
  g.target = { x: goal.x, z: goal.z };
  g.brushing = 0.4;
  {
    S.brush(0.8);
    if (onPapa) {
      const rem = pa.brush(p, 0.22, 0.12);
      if (rem > 0.02) {
        P.emit(p, 4, { size: 0.002, color: [0.07, 0.07, 0.07], spread: 0.03, jitter: 0.35, gravity: 0.2, life: 1.5, alpha: 0.6 });
        if (Math.random() < 0.03) { pa.do('laugh', 0.8); S.papaHa(); }
      }
    }
    if (!onPapa || p.y < 0.8) {
      let any = false;
      const c = onPapa ? pa.root.position : p;
      for (const set of [P0.mess, P0.spill]) for (const it of set.items) {
        const d = Math.hypot(it.pos.x - c.x, it.pos.z - c.z) - (onPapa ? 0.15 : 0);
        if (d < 0.18 + Math.max(it.w, it.h) * 0.4 && it.amt > 0) { set.setAmt(it, Math.max(0, it.amt - 0.12)); any = true; }
      }
      if (any) P.emit(p.clone().add(V3(0, 0.01, 0)), 3, { size: 0.002, color: [0.07, 0.07, 0.07], spread: 0.04, jitter: 0.25, gravity: 0.1, life: 1.2, alpha: 0.5 });
    }
  }
  // every stroke also loosens the whole mess a little (no spot is ever impossible)
  for (const set of [P0.mess, P0.spill]) for (const it of set.items) if (it.amt > 0) set.setAmt(it, Math.max(0, it.amt - 0.006));
  const messLeft = [...P0.mess.items, ...P0.spill.items].reduce((s, q) => s + q.amt, 0) / Math.max(1, P0.mess.items.length + P0.spill.items.length);
  if (pa.powderLeft() < 0.2 && messLeft < 0.25) {
    G.busy = true; setHint(null);
    S.win(); pa.do('thumbs', 1.4); g.do('clap', 1.4); S.yay();
    after(1.8, () => {
      g.brushProp.visible = false; g.target = null;
      // papa goes to sit on the... he steps aside to watch
      pa.target = { x: -0.7, z: -0.75, ry: 2.4 };
      A.girl.root.visible = false;
      G.state = 's2'; G.busy = false;
      A.hand.show(true); A.hand.setTool('flash');
      shot(...S2SHOTS[G.seg], { speed: 1.0, ap: 0.9, portraitPull: 0.45 });
      handlers = {
        down() { G.uvTarget = aimUV(); }, move() { G.uvTarget = aimUV(); }, up() { G.uvTarget = null; },
      };
      hintTrail();
    });
  } else if (G.idle === 0 && Math.random() < 0.05) hintClean();
}

// ---------------- scene 3: behind the curtain
function startS3() {
  G.state = 's3'; G.stateT = 0; G.busy = false;
  S.hum(false); UVL.on.value = 0; P0.flash.light.intensity = 0; P0.flash.beamM.uniforms.uOn.value = 0; P0.flash.lensM.emissiveIntensity = 0;
  const d = A.dog; d.root.visible = true;
  d.root.position.set(3.08, 0, -1.6); d.root.rotation.y = Math.PI;
  d.wag = 0.6;
  const c = P0.curtains[0];
  c.bulge.set(0, 0.22, -1.6); c.bulgeAmt = 1;
  A.hand.setTool('flash'); A.hand.tool.visible = false; A.hand.show(true);
  shot([2.0, 1.0, -0.45], [2.98, 0.42, -1.58], { speed: 1.1, ap: 1.1, portraitPull: 0.45 });
  G.curOpen = 0;
  setHint(V3(2.98, 0.6, -1.35), { delay: 2, drag: V3(2.98, 0.6, -1.85) });
  handlers = {
    down() { G.curLast = null; pullCurtain(); },
    move() { pullCurtain(); },
    up() { G.curLast = null; },
  };
}
function pullCurtain() {
  if (G.state !== 's3' || G.busy) return;
  const c = P0.curtains[0];
  const h = ray.intersectObject(c.mesh, false)[0];
  if (!h) return;
  const lz = h.point.z - (c.mesh.position.z - c.width / 2);
  const u = clamp(lz / c.width, 0, 1);
  A.hand.aim(h.point, V3(-1, 0, 0), 1 / 60, { k: 20 });
  // dragging toward the hinge side (smaller z here) opens; any touch nudges
  let push = 0.02;
  if (G.curLast) push += Math.max(0, (G.curLast.z - h.point.z)) * 3.5 + Math.abs(G.curLast.y - h.point.y) * 0.5;
  G.curLast = h.point.clone();
  for (let i = 0; i <= c.segX; i++) {
    const du = Math.abs(i / c.segX - u);
    c.open[i] = clamp(c.open[i] + push * Math.exp(-du * du / 0.05) + push * 0.4, 0, 1);
  }
  if (Math.random() < 0.15) S.curtain();
  const avg = c.open.reduce((s, v) => s + v, 0) / c.open.length;
  if (avg > 0.55 && !G.found3) {
    G.found3 = true; G.busy = true; setHint(null);
    for (let i = 0; i <= c.segX; i++) c.open[i] = Math.max(c.open[i], 0.85);
    foundPuppy();
  }
}
function foundPuppy() {
  const d = A.dog, g = A.girl, pa = A.papa;
  P0.curtains[0].bulgeAmt = 0;
  d.target = { x: 2.85, z: -1.45 }; d.face = -0.6;
  d.do('sheepish', 1.6); S.whine();
  after(0.4, () => { S.wow(); });
  after(1.6, () => { d.do('yip', 0.4); S.yipyip(); d.wag = 1; });
  after(2.4, () => {
    // pull back: the girl kneels by the puppy, papa laughs
    A.hand.show(false);
    g.root.visible = true; g.root.position.set(2.2, 0, -0.25); g.root.rotation.y = 2.64; g.kneelHold = true;
    g.target = null;
    g.do('kneel', 2.5);
    pa.root.visible = true; pa.root.position.set(0.3, 0, -0.6); pa.target = { x: 1.0, z: -0.95, ry: 2.0 };
    shot([1.3, 1.2, 0.35], [2.65, 0.4, -1.3], { speed: 1.0, ap: 0.8, portraitPull: 0.5 });
    after(0.8, () => { pa.do('laugh', 1.5); S.papaHa(); });
    after(2.0, () => startGive());
  });
}
function startGive() {
  G.state = 'give'; G.busy = false;
  const d = A.dog;
  d.root.position.set(2.85, 0, -1.4); d.root.rotation.y = -0.6; d.face = -0.6;
  P0.biscuit.visible = P0.ball.visible = true;
  P0.biscuit.position.set(2.5, 0.012, -1.15); P0.biscuit.rotation.y = 0.8;
  P0.ball.position.set(2.6, 0.035, -0.85);
  const b = P0.biscuit.position.clone(), bl = P0.ball.position.clone();
  setHint(b.clone().add(V3(0, 0.03, 0)), { delay: 2.5 });
  handlers = {
    down() {
      if (G.busy) return;
      const h = pick([P0.biscuit, P0.ball]);
      if (!h) return;
      let o = h.object; while (o.parent && o.parent !== scene) o = o.parent;
      give(o);
    },
  };
}
function give(obj) {
  const d = A.dog, g = A.girl;
  G.busy = true; setHint(null); S.tap();
  g.do('point', 0.8);
  const from = obj.position.clone();
  const to = d.head.localToWorld(V3(0, 0.02, 0.14));
  tween(0.6, (k) => { obj.position.copy(from.clone().lerp(to, smooth(k))); obj.position.y += Math.sin(k * Math.PI) * 0.12; }, () => {
    if (obj === P0.ball) {
      // "huh?" first, then happy to play anyway
      d.do('huh', 1.3); S.whine();
      after(1.4, () => { d.do('happy', 1.4); S.yipyip(); obj.position.set(2.2, 0.035, -0.3); });
      after(2.6, () => { G.busy = false; setHint(P0.biscuit.position.clone().add(V3(0, 0.03, 0)), { delay: 2 }); });
    } else {
      obj.visible = false;
      d.do('eat', 1.2); S.munch();
      after(1.3, () => { d.do('happy', 1.5); S.yipyip(); g.do('clap', 1.4); S.yay(); S.win(); d.crumbs.visible = false; });
      after(3.2, () => startPlay());
    }
  });
}

// ---------------- free play: powder hand & paw stamps, torch
function startPlay() {
  G.state = 'play'; G.busy = false;
  const d = A.dog, g = A.girl, pa = A.papa;
  g.root.visible = false; g.kneelHold = false;
  pa.target = { x: 1.0, z: -0.95, ry: 2.0 };
  P0.ball.visible = false;
  d.target = { x: 2.6, z: -1.15 };
  // tools tray on the floor: black pot, gold pot, torch
  setupTray();
  A.hand.show(true); A.hand.useFlat(true);
  G.tool = 'black';
  shot([2.0, 0.78, -0.3], [2.62, 0.05, -1.1], { speed: 1.0, ap: 1.2, portraitPull: 0.35 });
  setHint(V3(2.45, 0.0, -0.95), { delay: 3 });
  d.onStep = (i) => {
    const ry = d.root.rotation.y;
    const side = (i % 2 ? 1 : -1) * 0.035;
    const p = d.root.position.clone().add(V3(Math.cos(ry) * side, 0.002, -Math.sin(ry) * side));
    if (G.dogPowder && G.dogPowder.amt > 0.05) {
      const pd = POWDER[G.dogPowder.kind];
      P0.paws.add(p, V3(0, 1, 0), ry + Math.PI, 0.034, 0.034, [pd.c.r, pd.c.g, pd.c.b], pd.metal, G.dogPowder.amt);
      G.dogPowder.amt *= 0.94;
    }
    P0.uvPaws.add(p, V3(0, 1, 0), ry + Math.PI, 0.09, 0.09, [0, 0, 0], 0, 1);
    S.pawStep();
  };
  handlers = {
    down() {
      const t = pick(P0.toolItems);
      if (t) { let o = t.object; while (!o.userData.tool) o = o.parent; selectTool(o.userData.tool); return; }
      const dh = pick([d.root]);
      if (dh) { dogRun(); return; }
      G.stampLast = null; playTouch(true);
    },
    move() { playTouch(false); },
    up() { G.uvTarget = null; },
  };
}
function setupTray() {
  P0.tray.visible = true;
  P0.tray.position.set(2.2, 0, -0.8); P0.tray.rotation.y = -0.66;
  P0.toolItems = [];
  const mk = (kind, x) => {
    let o;
    if (kind === 'flash') { o = A.hand.tools.flash.clone(); o.traverse((c) => { if (c.isSpotLight) c.intensity = 0; }); o.rotation.set(0, 0.4, 0); o.position.set(x, 0.03, 0.02); o.children.forEach((c) => { if (c.material && c.material.blending === T.AdditiveBlending) c.visible = false; }); }
    else { o = P0.pots[kind].clone(); o.position.set(x, 0.016, 0); }
    o.visible = true; o.userData.tool = kind;
    P0.tray.add(o); P0.toolItems.push(o);
    return o;
  };
  mk('black', -0.1); mk('gold', 0.0); mk('flash', 0.1);
}
function selectTool(k) {
  S.dip();
  G.tool = k;
  if (k === 'flash') { A.hand.useFlat(false); A.hand.setTool('flash'); A.hand.show(true); }
  else {
    A.hand.useFlat(true);
    const pd = POWDER[k];
    const at = P0.toolItems.find((o) => o.userData.tool === k).getWorldPosition(V3()).add(V3(0, 0.06, 0));
    P.emit(at, 50, { size: 0.0018, color: [pd.c.r * 1.2, pd.c.g * 1.2, pd.c.b * 1.2], metal: pd.metal, spread: 0.02, jitter: 0.15, gravity: 0.05, life: 2, alpha: 0.7 });
    S.puff(0.15);
  }
}
function playTouch(first) {
  if (G.tool === 'flash') { G.uvTarget = aimUV() || ray.intersectObject(W.patioGlass, false)[0]?.point || null; return; }
  const hg = ray.intersectObject(W.patioGlass, false)[0];
  const hf = ray.intersectObject(W.floor, false)[0];
  const h = hg && (!hf || hg.distance < hf.distance) ? hg : hf;
  if (!h) return;
  const n = hg && h === hg ? V3(-1, 0, 0) : V3(0, 1, 0);
  G.stampAt = { p: h.point.clone(), n };
  const far = !G.stampLast || G.stampLast.distanceTo(h.point) > 0.12;
  if (first || far) {
    G.stampLast = h.point.clone();
    G.stampAnim = 0;
    const pd = POWDER[G.tool];
    const yaw = rand(-0.25, 0.25) + (n.y > 0.5 ? Math.atan2(camera.position.x - h.point.x, camera.position.z - h.point.z) : 0);
    after(0.12, () => {
      const it = P0.hands.add(h.point, n, yaw, 0.085, 0.1, [pd.c.r, pd.c.g, pd.c.b], pd.metal, rand(0.8, 1.0));
      P0.uvHands.add(h.point, n, yaw, 0.17, 0.2, [0, 0, 0], 0, 1);
      S.stamp();
      P.emit(h.point.clone().addScaledVector(n, 0.01), 26, { size: 0.0017, color: [pd.c.r * 1.2, pd.c.g * 1.2, pd.c.b * 1.2], metal: pd.metal, spread: 0.04, jitter: 0.12, gravity: 0.05, life: 1.8, alpha: 0.65 });
      // the puppy gets curious, trots over and gets powder on its paws
      if (Math.random() < 0.35 && !A.dog.target?.done) dogTo(h.point, G.tool);
    });
  }
}
function dogTo(p, kind) {
  const d = A.dog;
  const q = p.clone(); q.x = clamp(q.x, 2.2, 3.0); q.z = clamp(q.z, -1.8, -0.85);
  G.dogPowder = { kind, amt: 1 };
  d.target = { x: q.x, z: q.z, done: () => { d.do('sniff', 0.9); S.sniff(); } };
}
function dogRun() {
  const d = A.dog;
  d.do('happy', 1.0); S.yip();
  const a = rand(0, Math.PI * 2);
  const p = V3(clamp(d.root.position.x + Math.cos(a) * 0.5, 2.2, 2.95), 0, clamp(d.root.position.z + Math.sin(a) * 0.5, -1.8, -0.85));
  G.dogPowder = G.dogPowder || { kind: G.tool === 'gold' ? 'gold' : 'black', amt: 0.8 };
  G.dogPowder.amt = Math.max(G.dogPowder.amt, 0.7);
  d.target = { x: p.x, z: p.z, done: () => { d.do('yip', 0.4); } };
}
function updatePlay(dt) {
  // keep the tool tray in the lower left of the view whatever the screen shape
  { const r = new T.Raycaster(); r.setFromCamera(new T.Vector2(-0.5, -0.62), camera); const t = -r.ray.origin.y / r.ray.direction.y; if (t > 0) { const p = r.ray.origin.clone().addScaledVector(r.ray.direction, t); P0.tray.position.lerp(V3(p.x, 0, p.z), 1 - Math.exp(-dt * 6)); } }
  // flat hand follows the touch and presses down
  if (G.tool !== 'flash') {
    if (G.stampAt) {
      G.stampAnim = (G.stampAnim ?? 1) + dt * 4;
      const lift = ptr.down ? Math.max(0, 0.06 * (1 - Math.min(1, G.stampAnim * 2.5)) ** 2) : 0.08;
      A.hand.aimFlat(G.stampAt.p, G.stampAt.n, lift, dt);
    } else {
      const r = new T.Raycaster(); r.setFromCamera(new T.Vector2(0.3, -0.45), camera); const tt = -r.ray.origin.y / r.ray.direction.y; const p = r.ray.origin.clone().addScaledVector(r.ray.direction, Math.max(0.3, tt)); p.y = 0; A.hand.aimFlat(p, V3(0, 1, 0), 0.1, dt);
    }
    UVL.on.value = damp(UVL.on.value, 0, 10, dt); S.hum(false);
  } else {
    const f = A.hand.tool.userData;
    const on = ptr.down && G.uvTarget ? 1 : 0;
    G.uvOn = damp(G.uvOn || 0, on, 14, dt);
    f.light.intensity = G.uvOn * 9; f.beamM.uniforms.uOn.value = G.uvOn; f.lensM.emissiveIntensity = G.uvOn * 4;
    S.hum(on > 0.5);
    const target = G.uvTarget || cam.look.clone();
    A.hand.aim(target, V3(0, 1, 0), dt, { k: 14 });
    const lens = A.hand.tool.localToWorld(V3(0.096, 0, 0));
    UVL.pos.value.copy(lens); UVL.dir.value.copy(target.clone().sub(lens).normalize()); UVL.on.value = G.uvOn;
  }
  // the puppy wanders a little on its own
  const d = A.dog;
  if (!d.target || (!d.target.done && d.root.position.distanceTo(V3(d.target.x, 0, d.target.z)) < 0.05)) {
    if (Math.random() < dt * 0.15) { const p = V3(rand(2.3, 2.95), 0, rand(-1.75, -0.95)); d.target = { x: p.x, z: p.z }; }
  }
}

// ================================================================ timing utils
const timers = [];
export function after(s, fn) { timers.push({ t: G.t + s, fn }); }
const tweens = [];
function tween(dur, fn, done) { tweens.push({ t0: G.t, dur, fn, done }); }
function runTimers() {
  for (let i = timers.length - 1; i >= 0; i--) if (G.t >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; const k = clamp((G.t - tw.t0) / tw.dur, 0, 1);
    tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.done && tw.done(); }
  }
}

// girl walking (third person shots)
function updateGirlWalk(dt) {
  const g = A.girl;
  if (!g.root.visible) return;
  if (g.target) {
    const d = V3(g.target.x - g.root.position.x, 0, g.target.z - g.root.position.z);
    const L = d.length();
    if (L > 0.03) {
      d.normalize();
      const sp = Math.min(1.1, L * 3);
      g.root.position.addScaledVector(d, sp * dt);
      const ry = Math.atan2(d.x, d.z);
      let dr = ry - g.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      g.root.rotation.y += dr * Math.min(1, dt * 8);
      g.walkPh = (g.walkPh || 0) + dt * 11;
      g.body.position.y += Math.abs(Math.sin(g.walkPh)) * 0.025;
    }
  }
  if (g.brushing > 0) {
    g.brushing -= dt;
    g.arms[0].rotation.x = -1.2 + Math.sin(G.t * 18) * 0.35;
    g.arms[0].rotation.z = 0.25 + Math.cos(G.t * 18) * 0.15;
  }
}

// ================================================================ main update
export function initGame() {
  P = new Particles();
  motes = new Motes(V3(-1.2, 1.1, -1.2), V3(0.9, 0.8, 0.9), 320);
  buildProps();
  startIntro();
  G.state = 'intro';
}
export function updateGame(dt) {
  G.t += dt; G.idle += dt;
  runTimers();
  updateCam(dt);
  if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt); camera.position.x += Math.sin(G.t * 60) * 0.01 * cam.shake; camera.position.y += Math.cos(G.t * 53) * 0.008 * cam.shake; }
  A.girl.update(dt); A.papa.update(dt); A.dog.update(dt);
  updateGirlWalk(dt);
  switch (G.state) {
    case 'intro': updateIntro(dt); break;
    case 's1':
      if (G.thumb) { const pr = G.prints[2]; A.hand.aim(pr.center.clone().add(V3(0.012, 0.005, 0.004)), V3(0, 0, 1), dt, { k: 30 }); A.hand.tool.userData.U.uLoad.value = 0.9; if (Math.random() < 0.5) P.emit(pr.center.clone().add(V3(0.02, 0.0, 0.01)), 3, { size: 0.0013, color: [0.06, 0.06, 0.06], spread: 0.012, jitter: 0.05, gravity: 0.05, life: 2.5, alpha: 0.7, drag: 3.5 }); break; }
      if (!ptr.down && !G.busy) A.hand.rest(dt);
      if (!ptr.down) A.hand.tool.userData.U.uBend.value.multiplyScalar(0.85);
      break;
    case 's2': updateS2(dt); break;
    case 'clean': break;
    case 's3': if (!ptr.down) A.hand.rest(dt); break;
    case 'play': updatePlay(dt); break;
  }
  // puppy behind the curtain: tail flicks, bulge shifts
  for (const c of P0.curtains) {
    if (G.state === 's3' && !G.found3) { c.bulge.z = -1.6 + Math.sin(G.t * 1.3) * 0.04; c.bulgeAmt = 0.8 + Math.sin(G.t * 2.1) * 0.2; }
    updateCurtain(c, G.t);
  }
  if (G.lens) {
    G.lens.t += dt;
    const k = G.lens.t / G.lens.dur;
    const a = k < 0.15 ? smooth(k / 0.15) : k > 0.85 ? smooth((1 - k) / 0.15) : 1;
    post.uLens.value.set(G.lens.x, G.lens.y, 0.17 * a, 2.6);
    if (k >= 1) { G.lens = null; post.uLens.value.z = 0; }
  }
  P0.jar.paint.flush(); P0.tile.paint.flush();
  P.update(dt, G.t);
  motes.update(dt, G.t);
  glints(dt);
  updateHint(dt);
}

// debug / screenshot helper: ?go=s1|s2|clean|s3|play
export function debugGo(name) {
  const A0 = A;
  if (name === 'intro1') { G.t += 0; return; }
  if (name === 's1') { A0.girl.hat.visible = true; startS1(); }
  if (name === 's1done') { startS1(); for (const pr of G.prints) { pr.found = true; } fakeBrush(); }
  if (name === 's2') { startS1(); fakeBrush(); startS2(); }
  if (name === 'gag') { startS1(); fakeBrush(); startS2(); G.seg = 1; nextSeg(); }
  if (name === 'clean') { startS1(); fakeBrush(); startS2(); G.seg = 1; G.gagDone = true; A0.papa.root.visible = true; A0.papa.root.position.set(1.2, 0, 0.05); A0.papa.powderAll(1); for (let i = 0; i < 12; i++) P0.mess.add(V3(rand(0.5, 1.5), 0.002, rand(-0.5, 0.5)), V3(0, 1, 0), rand(0, 6), 0.13, 0.27, [0.05, 0.049, 0.048], 0.1, 1); A0.girl.root.visible = true; A0.girl.root.position.set(-0.15, 0, 0.95); A0.girl.root.rotation.y = 2.3; A0.girl.root.rotation.y = Math.PI * 0.8; A0.hand.show(false); shot([-0.8, 1.5, 2.5], [0.85, 0.92, -0.1], { snap: true, ap: 0.6 }); startCleanup(); }
  if (name === 's3') { startS1(); startS2(); for (const s of G.trail) for (const it of s) P0.trail.setRev(it, 1); startS3(); }
  if (name === 'found') { startS1(); startS2(); startS3(); G.found3 = true; for (let i = 0; i <= P0.curtains[0].segX; i++) P0.curtains[0].open[i] = 0.9; foundPuppy(); }
  if (name === 'play') { startS1(); startS2(); startS3(); for (let i = 0; i <= P0.curtains[0].segX; i++) P0.curtains[0].open[i] = 0.9; P0.curtains[0].bulgeAmt = 0; A0.dog.crumbs.visible = false; startPlay(); }
  if (name === 's2uv') { startS1(); fakeBrush(); startS2(); for (const it of G.trail[0].slice(0, 9)) P0.trail.setRev(it, 1); ptr.down = true; G.uvTarget = G.trail[0][10].pos.clone(); }
  if (name === 's1brush') { startS1(); G.load = 1; fakeBrush(true); ptr.down = true; const pr = G.prints[1]; A0.hand.aim(pr.center, V3(0, 0, 1), 1, { snap: true }); A0.hand.tool.userData.U.uLoad.value = 0.8; }
  if (name === 'thumb') {
    startS1(); G.load = 1; G.powder = 'black';
    for (const [i, pr] of G.prints.entries()) {
      const ch = pr.paint === P0.jar.paint ? 1 : 0;
      const k = i === 3 ? 6 : 40;
      for (let j = 0; j < k; j++) pr.paint.stamp(pr.info.puv[0] + rand(-1, 1) * pr.info.pr[0] * 1.6, pr.info.puv[1] + rand(-1, 1) * pr.info.pr[1] * 1.6, pr.info.pr[0] * 1.8, pr.info.pr[1] * 1.8, ch, 0.08, rand(0, 3));
    }
    // a broad brushed haze band
    for (let j = 0; j < 60; j++) P0.tile.paint.stamp(0.25 + j * 0.006, 0.28 + Math.sin(j * 0.3) * 0.03, 0.02, 0.03, 0, 0.05, 0);
    shot([-0.73, 1.12, -1.58], [-0.77, 1.03, -2.3], { snap: true, ap: 1.4 });
    G.camLock = true;
    G.thumb = true;
  }
  if (G.shotArgs) shot(G.shotArgs[0], G.shotArgs[1], { ...G.shotArgs[2], snap: true });
}
function fakeBrush(partial) {
  // simulate a few brush passes over every print (for screenshots)
  G.load = 1; G.powder = 'black';
  for (const [i, pr] of G.prints.entries()) {
    if (partial && i > 3 && i < 7) continue;
    if (partial && i === 3) { pr.paint.stamp(pr.info.puv[0], pr.info.puv[1], pr.info.pr[0] * 2, pr.info.pr[1] * 2, 0, 0.12, 0); continue; }
    const obj = pr.mesh.material.userData; // unused
    const target = pr.info.puv;
    const paint = pr.paint;
    for (let k = 0; k < 40; k++) paint.stamp(target[0] + rand(-1, 1) * pr.info.pr[0] * 1.5, target[1] + rand(-1, 1) * pr.info.pr[1] * 1.5, pr.info.pr[0] * 1.6, pr.info.pr[1] * 1.6, 0, 0.06, rand(0, 3));
  }
}
export { G as GAME, P0 };
export function debugCam(a) { shot([a[0], a[1], a[2]], [a[3], a[4], a[5]], { snap: true, ap: a[6] ?? 1 }); G.camLock = true; }
