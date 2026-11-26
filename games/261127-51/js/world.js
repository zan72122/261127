// The room: an old tiled kitchen opening onto a small living corner,
// on a bright afternoon just after rain.  Units are meters, y up.
import { T, scene, renderer, tex, pbr, boxUV, scaleUV, roundedBox, meshFrom, canvasTex, clamp, rand, V3 } from './core.js';

export const W = {};
const ROOM = { x0: -3.2, x1: 3.2, z0: -2.3, z1: 2.6, h: 2.6 };
W.ROOM = ROOM;

// --------------------------------------------------------------- lighting
export function buildLights() {
  // sun breaking through after rain: ~5600K, low-ish afternoon angle
  const sun = new T.DirectionalLight(0xfff0dc, 5.2);
  const dir = V3(0.42, -0.50, 0.76).normalize();
  sun.position.copy(V3(-0.9, 0.9, -1.2).sub(dir.clone().multiplyScalar(6)));
  sun.target.position.set(-0.9, 0.9, -1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -4.2; sc.right = 4.2; sc.top = 3.6; sc.bottom = -3.6; sc.near = 0.5; sc.far = 14;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 5;
  scene.add(sun, sun.target);
  W.sun = sun; W.sunDir = dir;

  // diffuse skylight through the patio door (cool, 7000K), no shadows
  const sky = new T.DirectionalLight(0xdfe8f5, 0.9);
  sky.position.set(6, 2.5, -0.6);
  sky.target.position.set(0, 0.6, -0.6);
  scene.add(sky, sky.target);

  // warm pendant lamp over the table (on; keeps the play areas bright)
  const lamp = new T.PointLight(0xffd7a8, 7.0, 0, 2);
  lamp.position.set(-1.55, 1.95, 0.55);
  scene.add(lamp);
  W.lamp = lamp;

  // soft fill so the room never goes dark (bounce from the floor/ceiling)
  const hemi = new T.HemisphereLight(0xf2f0ec, 0x8a8278, 0.55);
  scene.add(hemi);
  W.hemi = hemi;
}

// Environment map: a simple version of this room (bright windows, warm walls)
export function buildEnv() {
  const es = new T.Scene();
  const box = new T.Mesh(new T.BoxGeometry(6.4, 2.6, 4.9), new T.MeshBasicMaterial({ color: 0xb8b2a8, side: T.BackSide }));
  box.position.set(0, 1.3, 0.15);
  es.add(box);
  const floor = new T.Mesh(new T.PlaneGeometry(6.4, 4.9), new T.MeshBasicMaterial({ color: 0x5e5b56 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; es.add(floor);
  const ceil = new T.Mesh(new T.PlaneGeometry(6.4, 4.9), new T.MeshBasicMaterial({ color: 0xd8d4cc }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 2.59; es.add(ceil);
  const win = (w, h, x, y, z, ry, c) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c }));
    m.position.set(x, y, z); m.rotation.y = ry; es.add(m);
  };
  const skyC = new T.Color(1, 1.02, 1.06).multiplyScalar(5.0);
  win(0.9, 1.0, -1.5, 1.6, -2.28, 0, skyC);
  win(1.4, 2.2, 3.18, 1.1, -1.2, -Math.PI / 2, new T.Color(0.95, 1.0, 1.08).multiplyScalar(3.5));
  const lampC = new T.Mesh(new T.SphereGeometry(0.15), new T.MeshBasicMaterial({ color: new T.Color(1, 0.8, 0.55).multiplyScalar(10) }));
  lampC.position.set(-1.55, 1.95, 0.55); es.add(lampC);
  const pm = new T.PMREMGenerator(renderer);
  const rtE = pm.fromScene(es, 0.03, 0.1, 20, { position: V3(-0.5, 1.2, -0.5) });
  scene.environment = rtE.texture;
  scene.environmentIntensity = 0.85;
  pm.dispose();
}

// ------------------------------------------------------------------ helpers
function shapeWall(w, h, holes, uvScale) {
  const s = new T.Shape();
  s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, h); s.lineTo(0, h); s.lineTo(0, 0);
  for (const [x, y, hw, hh] of holes) {
    const p = new T.Path();
    p.moveTo(x, y); p.lineTo(x, y + hh); p.lineTo(x + hw, y + hh); p.lineTo(x + hw, y); p.lineTo(x, y);
    s.holes.push(p);
  }
  const g = new T.ShapeGeometry(s);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, g.attributes.position.getX(i) / uvScale, g.attributes.position.getY(i) / uvScale);
  return g;
}

function add(m, parent = scene) { parent.add(m); return m; }

function box(w, h, d, mat, x, y, z, { r = 0.004, uv = 0.5, cast = true, receive = true } = {}) {
  const g = r > 0 ? roundedBox(w, h, d, r, 2) : new T.BoxGeometry(w, h, d);
  boxUV(g, uv, [x, y, z]);
  const m = meshFrom(g, mat, { cast, receive });
  m.position.set(x, y, z);
  return add(m);
}

// soft contact-shadow blob (fake AO where objects meet the floor/counter)
const blobTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { srgb: false });
export function contactShadow(x, y, z, sx, sz, op = 1, parent = scene) {
  const m = new T.Mesh(new T.PlaneGeometry(sx, sz), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: op, color: 0x000000 }));
  m.material.blending = T.MultiplyBlending;
  m.material.premultipliedAlpha = true;
  m.material.map = blobTex;
  m.material.color.set(0xffffff);
  m.material.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'float sa = texture2D(map, vMapUv).a * opacity; diffuseColor = vec4(vec3(1.0 - sa), 1.0);');
  };
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.002, z);
  m.renderOrder = 2;
  parent.add(m);
  return m;
}

// ------------------------------------------------------------------ the room
export function buildRoom() {
  const { x0, x1, z0, z1, h } = ROOM;
  const RW = x1 - x0, RD = z1 - z0;

  // floor: old checker tiles
  const floorMat = pbr('floor', { ns: 1.0, env: 0.9 });
  const fg = new T.PlaneGeometry(RW, RD);
  scaleUV(fg, RW / 1.6, RD / 1.6);
  const floor = meshFrom(fg, floorMat, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  add(floor);
  W.floor = floor; W.floorMat = floorMat;

  const plasterMat = pbr('plaster', { ns: 0.6 });
  const tileMat = pbr('walltile', { ns: 0.8, env: 1.2 });
  W.tileMat = tileMat;

  // back wall (z0): window over the counter
  const win = { x: -1.95, w: 0.9, y: 1.12, h: 0.98 };
  W.win = win;
  const back = meshFrom(shapeWall(RW, h, [[win.x - x0, win.y, win.w, win.h]], 0.8), plasterMat);
  back.position.set(x0, 0, z0);
  add(back);
  // tile backsplash band (counter -> 1.62m) with the same window hole
  const tileTop = 1.62;
  const tband = meshFrom(shapeWall(3.0, tileTop - 0.92, [[win.x - x0, win.y - 0.92, win.w, tileTop - win.y]], 0.6), tileMat);
  tband.position.set(x0, 0.92, z0 + 0.006);
  add(tband);
  W.tileWall = tband;
  // tile cap strip
  box(3.0, 0.02, 0.014, tileMat, x0 + 1.5, tileTop, z0 + 0.008, { r: 0.006 });

  // left wall, right wall with patio door, front wall, ceiling
  const left = meshFrom(shapeWall(RD, h, [], 0.8), plasterMat);
  left.rotation.y = Math.PI / 2; left.position.set(x0, 0, z1); add(left);
  const patio = { z: -1.95, w: 1.5, h: 2.2 };
  W.patio = patio;
  const right = meshFrom(shapeWall(RD, h, [[patio.z - z0, 0, patio.w, patio.h]], 0.8), plasterMat);
  right.rotation.y = -Math.PI / 2; right.position.set(x1, 0, z0); add(right);
  const front = meshFrom(shapeWall(RW, h, [], 0.8), plasterMat);
  front.rotation.y = Math.PI; front.position.set(x1, 0, z1); add(front);
  const ceil = meshFrom(new T.PlaneGeometry(RW, RD), plasterMat, { cast: false });
  ceil.rotation.x = Math.PI / 2; ceil.position.set((x0 + x1) / 2, h, (z0 + z1) / 2); add(ceil);
  // thick outer shells so the sun only enters through the openings
  const shellMat = new T.MeshStandardMaterial({ color: 0x777777 });
  const shell = (w, hh, d, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, hh, d), shellMat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = false; add(m); };
  shell(win.x - x0, h, 0.2, (x0 + win.x) / 2, h / 2, z0 - 0.11);
  shell(x1 - (win.x + win.w), h, 0.2, (win.x + win.w + x1) / 2, h / 2, z0 - 0.11);
  shell(win.w, win.y, 0.2, win.x + win.w / 2, win.y / 2, z0 - 0.11);
  shell(win.w, h - win.y - win.h, 0.2, win.x + win.w / 2, (win.y + win.h + h) / 2, z0 - 0.11);
  shell(0.2, h, RD, x0 - 0.11, h / 2, (z0 + z1) / 2);
  shell(RW + 0.4, 0.2, RD + 0.4, (x0 + x1) / 2, h + 0.11, (z0 + z1) / 2);

  // skirting boards
  const paintMat = pbr('paintwood', { ns: 0.7 });
  W.paintMat = paintMat;
  box(RW, 0.09, 0.016, paintMat, (x0 + x1) / 2, 0.045, z1 - 0.008);
  box(0.016, 0.09, RD, paintMat, x0 + 0.008, 0.045, (z0 + z1) / 2);

  buildWindow(win, plasterMat, paintMat);
  buildPatio(patio, paintMat);
  buildCounter(paintMat);
  buildTable();
  buildCupboard(paintMat);
  buildSofa();
  buildLamp();
  buildSign();
}

// ------------------------------------------------------------------ window
function buildWindow(win, plasterMat, paintMat) {
  const z0 = ROOM.z0;
  // outside view (bright, slightly over-exposed like a real interior photo)
  const outTex = tex('outside', { srgb: true, repeat: false });
  const out = new T.Mesh(new T.PlaneGeometry(4.2, 3.1), new T.MeshBasicMaterial({ map: outTex, color: new T.Color(2.6, 2.6, 2.6) }));
  out.position.set(win.x + win.w / 2 + 0.2, win.y + win.h / 2 + 0.1, z0 - 1.6);
  add(out);
  // reveal (deep sill)
  const sillMat = pbr('paintwood', { ns: 0.6 });
  box(win.w + 0.08, 0.035, 0.26, sillMat, win.x + win.w / 2, win.y - 0.0175, z0 - 0.06, { r: 0.008 });
  box(0.02, win.h, 0.22, plasterMat, win.x - 0.0, win.y + win.h / 2, z0 - 0.11, { r: 0 });
  box(0.02, win.h, 0.22, plasterMat, win.x + win.w, win.y + win.h / 2, z0 - 0.11, { r: 0 });
  // frame + mullions (painted wood)
  const fz = z0 - 0.14;
  const fw = 0.045;
  box(win.w, fw, 0.05, paintMat, win.x + win.w / 2, win.y + fw / 2, fz);
  box(win.w, fw, 0.05, paintMat, win.x + win.w / 2, win.y + win.h - fw / 2, fz);
  box(fw, win.h, 0.05, paintMat, win.x + fw / 2, win.y + win.h / 2, fz);
  box(fw, win.h, 0.05, paintMat, win.x + win.w - fw / 2, win.y + win.h / 2, fz);
  box(0.035, win.h, 0.045, paintMat, win.x + win.w / 2, win.y + win.h / 2, fz);
  box(win.w, 0.035, 0.045, paintMat, win.x + win.w / 2, win.y + win.h * 0.58, fz);
  // glass with rain drops
  const rn = tex('rain_n', { repeat: true, lo: false });
  const rm = tex('rain_m', { repeat: true, lo: false });
  const glassMat = new T.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.03, metalness: 0, transparent: true, opacity: 1,
    normalMap: rn, normalScale: new T.Vector2(1.2, 1.2), alphaMap: rm, envMapIntensity: 2.2, depthWrite: false,
  });
  glassMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', 'diffuseColor.a = 0.04 + texture2D(alphaMap, vAlphaMapUv).g * 0.35;');
  };
  glassMat.blending = T.CustomBlending;
  glassMat.blendSrc = T.OneFactor; glassMat.blendDst = T.OneMinusSrcAlphaFactor;
  const gg = new T.PlaneGeometry(win.w - 0.06, win.h - 0.06);
  scaleUV(gg, 1.4, 1.5);
  const glass = new T.Mesh(gg, glassMat);
  glass.position.set(win.x + win.w / 2, win.y + win.h / 2, fz + 0.005);
  add(glass);
  // a small potted herb on the sill
  const pot = new T.Mesh(new T.CylinderGeometry(0.06, 0.045, 0.1, 32, 1), pbr('tin', { metal: false, color: 0xc07a58, ns: 0.4 }));
  boxUV(pot.geometry, 0.2);
  pot.position.set(win.x + 0.22, win.y + 0.05, z0 - 0.06);
  pot.castShadow = pot.receiveShadow = true; add(pot);
  const leafMat = new T.MeshStandardMaterial({ color: 0x4d6b35, roughness: 0.55, side: T.DoubleSide });
  for (let i = 0; i < 40; i++) {
    const lg = new T.SphereGeometry(0.018, 8, 6); lg.scale(1, 0.25, 0.55);
    const l = new T.Mesh(lg, leafMat);
    const a = rand(0, Math.PI * 2), r = rand(0, 0.06), hh = rand(0.1, 0.24);
    l.position.set(pot.position.x + Math.cos(a) * r, win.y + hh, z0 - 0.06 + Math.sin(a) * r);
    l.rotation.set(rand(-0.8, 0.8), a, rand(-0.6, 0.6));
    l.castShadow = true; add(l);
  }
}

// ------------------------------------------------------------- patio door
function buildPatio(p, paintMat) {
  const x1 = ROOM.x1;
  const outTex = tex('outside', { srgb: true, repeat: false });
  const out = new T.Mesh(new T.PlaneGeometry(5, 3.4), new T.MeshBasicMaterial({ map: outTex, color: new T.Color(2.4, 2.4, 2.4) }));
  out.rotation.y = -Math.PI / 2;
  out.position.set(x1 + 2.0, 1.2, p.z + p.w / 2);
  add(out);
  const fw = 0.06;
  box(0.08, fw, p.w, paintMat, x1 - 0.02, p.h - fw / 2, p.z + p.w / 2);
  box(0.08, p.h, fw, paintMat, x1 - 0.02, p.h / 2, p.z + fw / 2);
  box(0.08, p.h, fw, paintMat, x1 - 0.02, p.h / 2, p.z + p.w - fw / 2);
  box(0.08, p.h, 0.05, paintMat, x1 - 0.02, p.h / 2, p.z + p.w / 2);
  box(0.09, 0.03, p.w, paintMat, x1 - 0.02, 0.015, p.z + p.w / 2);
  const rn = tex('rain_n', { repeat: true, lo: false });
  const glassMat = new T.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.02, transparent: true, normalMap: rn, normalScale: new T.Vector2(0.4, 0.4), envMapIntensity: 1.6, depthWrite: false });
  glassMat.blending = T.CustomBlending; glassMat.blendSrc = T.OneFactor; glassMat.blendDst = T.OneMinusSrcAlphaFactor;
  glassMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a = 0.05;\n#include <opaque_fragment>'); };
  const gg = new T.PlaneGeometry(p.w - 0.1, p.h - 0.1);
  scaleUV(gg, 2.0, 3.0);
  const glass = new T.Mesh(gg, glassMat);
  glass.rotation.y = -Math.PI / 2;
  glass.position.set(x1 - 0.03, p.h / 2, p.z + p.w / 2);
  add(glass);
  W.patioGlass = glass;
}

// ----------------------------------------------------------------- counter
function buildCounter(paintMat) {
  const z0 = ROOM.z0;
  const cx0 = -2.95, cx1 = -0.3;
  const oak = pbr('oak', { ns: 0.8, env: 1.0 });
  W.oakMat = oak;
  // carcass + doors
  box(cx1 - cx0, 0.08, 0.52, new T.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.8 }), (cx0 + cx1) / 2, 0.04, z0 + 0.28, { r: 0 });
  box(cx1 - cx0, 0.80, 0.56, paintMat, (cx0 + cx1) / 2, 0.49, z0 + 0.29, { r: 0.003 });
  const knobMat = new T.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 1, roughness: 0.32 });
  const ndoor = 5, dw = (cx1 - cx0) / ndoor;
  for (let i = 0; i < ndoor; i++) {
    const x = cx0 + dw * (i + 0.5);
    box(dw - 0.012, 0.74, 0.02, paintMat, x, 0.49, z0 + 0.58, { r: 0.004 });
    // inset panel shadow line
    box(dw - 0.1, 0.6, 0.006, paintMat, x, 0.49, z0 + 0.592, { r: 0.002 });
    const k = new T.Mesh(new T.SphereGeometry(0.014, 16, 12), knobMat);
    k.position.set(x + dw * 0.33, 0.78, z0 + 0.605); k.castShadow = true; add(k);
  }
  // countertop
  const top = box(cx1 - cx0 + 0.03, 0.035, 0.63, oak, (cx0 + cx1) / 2, 0.9025, z0 + 0.315, { r: 0.006, uv: 0.9 });
  W.counterTop = top;
  W.counterY = 0.92;
  // props: kettle, canister, cutting board
  const tin = pbr('tin', { metal: true, ns: 0.5, env: 1.2 });
  W.tinMat = tin;
  const kettle = lathe([[0, 0], [0.085, 0], [0.095, 0.02], [0.098, 0.08], [0.085, 0.15], [0.05, 0.18], [0.035, 0.2], [0, 0.205]], tin);
  kettle.position.set(-2.55, 0.92, z0 + 0.3); add(kettle);
  const handle = new T.Mesh(new T.TorusGeometry(0.06, 0.008, 10, 32, Math.PI), new T.MeshStandardMaterial({ color: 0x1d1c1b, roughness: 0.45 }));
  handle.position.set(-2.55, 1.12, z0 + 0.3); handle.castShadow = true; add(handle);
  contactShadow(-2.55, 0.92, z0 + 0.3, 0.3, 0.3, 0.9);
  const can = lathe([[0, 0], [0.06, 0], [0.062, 0.005], [0.062, 0.16], [0.058, 0.165], [0, 0.166]], new T.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.35 }));
  can.position.set(-2.2, 0.92, z0 + 0.18); add(can);
  contactShadow(-2.2, 0.92, z0 + 0.18, 0.22, 0.22, 0.9);
  const board = box(0.3, 0.42, 0.02, oak, -2.85, 0.92 + 0.2, z0 + 0.05, { r: 0.008, uv: 0.6 });
  board.rotation.x = -0.12;
}

export function lathe(pts, mat, seg = 48) {
  const g = new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg);
  // UV in meters around the circumference
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    uv.setXY(i, (Math.atan2(z, x) + Math.PI) * 0.1 / 0.3, p.getY(i) / 0.3);
  }
  const m = meshFrom(g, mat);
  return m;
}

// ------------------------------------------------------------------- table
function buildTable() {
  const oak = W.oakMat;
  const tx = -1.55, tz = 0.55;
  W.table = { x: tx, z: tz, y: 0.74 };
  box(1.3, 0.04, 0.8, oak, tx, 0.72, tz, { r: 0.01, uv: 1.0 });
  box(1.18, 0.08, 0.68, oak, tx, 0.66, tz, { r: 0.004 });
  for (const [dx, dz] of [[-0.58, -0.33], [0.58, -0.33], [-0.58, 0.33], [0.58, 0.33]]) {
    const leg = lathe([[0.022, 0], [0.028, 0.05], [0.026, 0.4], [0.032, 0.62], [0.032, 0.7], [0, 0.7]], oak, 24);
    leg.position.set(tx + dx, 0, tz + dz); add(leg);
    contactShadow(tx + dx, 0, tz + dz, 0.16, 0.16, 0.8);
  }
  contactShadow(tx, 0, tz, 1.7, 1.2, 0.55);
  // chairs: one pulled to the counter (the puppy climbed it!), one at the table
  W.chairA = chair(-0.95, -1.38, Math.PI * 0.95);
  W.chairB = chair(-1.55, 1.15, Math.PI);
}

function chair(x, z, ry) {
  const g = new T.Group();
  const oak = W.oakMat;
  const part = (w, h, d, px, py, pz, r = 0.006) => {
    const gg = roundedBox(w, h, d, r, 2); boxUV(gg, 0.6, [px, py, pz]);
    const m = meshFrom(gg, oak); m.position.set(px, py, pz); g.add(m); return m;
  };
  part(0.42, 0.03, 0.4, 0, 0.45, 0, 0.01);
  for (const [dx, dz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) part(0.03, 0.45, 0.03, dx, 0.225, dz);
  part(0.03, 0.42, 0.03, -0.18, 0.66, -0.17); part(0.03, 0.42, 0.03, 0.18, 0.66, -0.17);
  part(0.4, 0.07, 0.022, 0, 0.82, -0.17); part(0.4, 0.04, 0.02, 0, 0.66, -0.17);
  g.position.set(x, 0, z); g.rotation.y = ry;
  scene.add(g);
  contactShadow(x, 0, z, 0.6, 0.6, 0.7);
  return g;
}

// ---------------------------------------------------------------- cupboard
function buildCupboard(paintMat) {
  const x0 = ROOM.x0;
  const cz = -0.85, cw = 1.0, ch = 1.95, cd = 0.42;
  const cx = x0 + cd / 2 + 0.01;
  W.cupboard = { x: cx, z: cz };
  const g = new T.Group();
  scene.add(g);
  const b = (w, h, d, x, y, z, mat = paintMat, r = 0.004) => box(w, h, d, mat, x, y, z, { r });
  // carcass
  b(cd, 0.04, cw, cx, ch - 0.02, cz);
  b(cd, 0.08, cw - 0.04, cx, 0.04, cz, new T.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.8 }));
  b(cd, ch, 0.025, cx, ch / 2, cz - cw / 2 + 0.0125);
  b(cd, ch, 0.025, cx, ch / 2, cz + cw / 2 - 0.0125);
  b(0.02, ch, cw, x0 + 0.02, ch / 2, cz);
  // lower doors
  for (const s of [-1, 1]) {
    const dz = cz + s * cw / 4;
    b(0.022, 0.82, cw / 2 - 0.02, cx + cd / 2, 0.52, dz);
    b(0.006, 0.66, cw / 2 - 0.12, cx + cd / 2 + 0.012, 0.52, dz);
  }
  b(cd + 0.03, 0.03, cw + 0.03, cx + 0.01, 0.95, cz, W.oakMat);
  // upper: shelves + glass doors frames
  const inner = new T.MeshStandardMaterial({ color: 0xc9c6bd, roughness: 0.8 });
  for (const y of [1.3, 1.62]) b(cd - 0.04, 0.02, cw - 0.06, cx - 0.01, y, cz, paintMat);
  b(0.01, ch - 1.0, cw - 0.05, x0 + 0.035, 0.97 + (ch - 1.0) / 2, cz, inner);
  for (const s of [-1, 1]) {
    const dz = cz + s * cw / 4;
    b(0.03, 0.04, cw / 2 - 0.02, cx + cd / 2, 1.0, dz);
    b(0.03, 0.04, cw / 2 - 0.02, cx + cd / 2, ch - 0.06, dz);
    b(0.03, ch - 1.06, 0.04, cx + cd / 2, (ch + 0.96) / 2, dz - s * (cw / 4 - 0.03));
    b(0.03, ch - 1.06, 0.04, cx + cd / 2, (ch + 0.96) / 2, dz + s * (cw / 4 - 0.03));
  }
  // plates and bowls on shelves
  const ceramic = new T.MeshPhysicalMaterial({ color: 0xece8df, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  for (let i = 0; i < 6; i++) {
    const p = lathe([[0, 0], [0.07, 0.002], [0.1, 0.012], [0.11, 0.02], [0.108, 0.022], [0.07, 0.008], [0, 0.006]], ceramic, 40);
    p.rotation.z = Math.PI / 2 - 0.15; p.rotation.y = 0;
    p.position.set(x0 + 0.08 + i * 0.012, 1.42, cz - 0.25 + i * 0.008);
    p.position.set(x0 + 0.1, 1.34 + 0.1, cz - 0.3 + i * 0.022);
    add(p);
  }
  for (let i = 0; i < 3; i++) {
    const bw = lathe([[0, 0], [0.04, 0], [0.065, 0.03], [0.075, 0.07], [0.07, 0.072], [0.06, 0.035], [0, 0.008]], ceramic, 40);
    bw.position.set(cx - 0.02, 1.31, cz + 0.12 + i * 0.0) ; bw.position.y = 1.31 + i * 0.03; add(bw);
  }
  // glasses
  const glassM = new T.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.05, transparent: true, opacity: 0.25, envMapIntensity: 1.5 });
  for (let i = 0; i < 4; i++) {
    const gl = lathe([[0, 0], [0.035, 0], [0.038, 0.1], [0.036, 0.1], [0.033, 0.004], [0, 0.004]], glassM, 32);
    gl.castShadow = false;
    gl.position.set(cx - 0.05 + (i % 2) * 0.08, 1.63, cz + 0.1 + Math.floor(i / 2) * 0.1); add(gl);
  }
  // the powder refill tin on the counter of the cupboard (papa will knock it)
  const tinM = pbr('tin', { metal: true, ns: 0.5 });
  const label = canvasTex(256, 128, (gg, w, h) => {
    gg.fillStyle = '#2c2b2a'; gg.fillRect(0, 0, w, h);
    gg.fillStyle = '#4a4744'; for (let i = 0; i < 9; i++) { gg.beginPath(); gg.arc(30 + i * 28, 64, 9, 0, 7); gg.fill(); }
  });
  const pt = lathe([[0, 0], [0.055, 0], [0.056, 0.004], [0.056, 0.14], [0.052, 0.144], [0, 0.144]], tinM);
  pt.position.set(cx + 0.08, 0.965, cz + 0.28); add(pt);
  const band = new T.Mesh(new T.CylinderGeometry(0.0565, 0.0565, 0.07, 48, 1, true), new T.MeshStandardMaterial({ map: label, roughness: 0.5 }));
  band.position.set(0, 0.07, 0); pt.add(band);
  W.refill = pt;
  contactShadow(cx, 0, cz, 0.7, 1.3, 0.7);
}

// ------------------------------------------------------------------- sofa
function buildSofa() {
  const sofaMat = pbr('sofa', { ns: 1.0, env: 0.7 });
  W.sofaMat = sofaMat;
  const sx = 1.15, sz = -1.82;
  W.sofa = { x: sx, z: sz, seatY: 0.45 };
  const g = (w, h, d, x, y, z, r) => {
    const gg = roundedBox(w, h, d, r, 3); boxUV(gg, 0.35, [x, y, z]);
    const m = meshFrom(gg, sofaMat); m.position.set(x, y, z); scene.add(m); return m;
  };
  g(1.9, 0.26, 0.86, sx, 0.25, sz + 0.02, 0.05);       // base
  g(1.9, 0.5, 0.22, sx, 0.62, sz - 0.31, 0.08);        // back
  g(0.2, 0.36, 0.86, sx - 0.95, 0.52, sz + 0.02, 0.08); // arms
  g(0.2, 0.36, 0.86, sx + 0.95, 0.52, sz + 0.02, 0.08);
  W.cushions = [g(0.84, 0.14, 0.66, sx - 0.43, 0.44, sz + 0.1, 0.06), g(0.84, 0.14, 0.66, sx + 0.43, 0.44, sz + 0.1, 0.06)];
  g(0.8, 0.36, 0.16, sx - 0.43, 0.68, sz - 0.16, 0.07).rotation.x = -0.12;
  g(0.8, 0.36, 0.16, sx + 0.43, 0.68, sz - 0.16, 0.07).rotation.x = -0.12;
  for (const dx of [-0.88, 0.88]) for (const dz of [-0.36, 0.38]) {
    const leg = lathe([[0.015, 0], [0.02, 0.12], [0, 0.12]], W.oakMat, 16);
    leg.position.set(sx + dx, 0, sz + dz); scene.add(leg);
  }
  contactShadow(sx, 0, sz, 2.3, 1.3, 0.8);
  // rug
  const rugMat = pbr('rug', { ns: 1.2, env: 0.6 });
  const rg = new T.PlaneGeometry(2.0, 1.4, 1, 1);
  scaleUV(rg, 2.0 / 0.5, 1.4 / 0.5);
  const rug = meshFrom(rg, rugMat, { cast: false });
  rug.rotation.x = -Math.PI / 2; rug.position.set(1.1, 0.004, -0.55);
  scene.add(rug);
  W.rug = rug;
}

function buildLamp() {
  const shade = lathe([[0.02, 0.0], [0.03, -0.02], [0.12, -0.12], [0.2, -0.2], [0.198, -0.205], [0.118, -0.125], [0.028, -0.025], [0.018, -0.005]],
    new T.MeshStandardMaterial({ color: 0x3d4a45, roughness: 0.4, metalness: 0.6, side: T.DoubleSide }), 48);
  shade.position.set(-1.55, 2.15, 0.55); shade.castShadow = false; add(shade);
  const bulb = new T.Mesh(new T.SphereGeometry(0.04, 24, 16), new T.MeshBasicMaterial({ color: new T.Color(4, 3.2, 2.2) }));
  bulb.position.set(-1.55, 2.0, 0.55); add(bulb);
  const cord = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.45), new T.MeshStandardMaterial({ color: 0x1a1a1a }));
  cord.position.set(-1.55, 2.375, 0.55); add(cord);
}

// The one picture sign (child's crayon drawing taped to the tiles): the rules.
function buildSign() {
  const t = canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#f3efe4'; g.fillRect(0, 0, w, h);
    // paper grain
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    const crayon = (col, wdt, pts) => {
      g.strokeStyle = col; g.lineWidth = wdt; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let k = 0; k < 3; k++) {
        g.globalAlpha = 0.55; g.beginPath();
        pts.forEach(([x, y], i) => { const jx = x + (Math.random() - 0.5) * 3, jy = y + (Math.random() - 0.5) * 3; i ? g.lineTo(jx, jy) : g.moveTo(jx, jy); });
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    const blob = (col, x, y, rx, ry) => { g.fillStyle = col; g.globalAlpha = 0.6; for (let k = 0; k < 60; k++) { g.beginPath(); g.ellipse(x + (Math.random() - 0.5) * rx, y + (Math.random() - 0.5) * ry, rx * 0.3, ry * 0.3, 0, 0, 7); g.fill(); } g.globalAlpha = 1; };
    // brush -> paw print appears
    crayon('#7a5434', 10, [[40, 120], [110, 70]]);
    blob('#999', 120, 62, 30, 22);
    crayon('#333', 6, [[150, 50], [175, 50]]);
    crayon('#333', 6, [[165, 40], [178, 50], [165, 60]]);
    for (const [x, y, r] of [[215, 60, 16], [200, 32, 7], [216, 26, 7], [232, 32, 7]]) blob('#222', x, y, r * 1.6, r * 1.4);
    // flashlight -> glowing paw prints
    crayon('#333', 14, [[40, 260], [110, 220]]);
    crayon('#8a5cc8', 4, [[115, 215], [190, 190]]); crayon('#8a5cc8', 4, [[115, 222], [200, 240]]);
    for (const [x, y] of [[220, 215], [270, 240], [320, 210]]) { blob('#b8e0d8', x, y, 18, 14); blob('#b8e0d8', x - 9, y - 18, 6, 6); blob('#b8e0d8', x + 9, y - 18, 6, 6); }
    // -> puppy behind a curtain
    crayon('#333', 6, [[360, 210], [385, 210]]); crayon('#333', 6, [[375, 200], [388, 210], [375, 220]]);
    crayon('#9aa6a8', 8, [[410, 60], [400, 330]]); crayon('#9aa6a8', 8, [[440, 60], [430, 330]]); crayon('#9aa6a8', 8, [[470, 60], [460, 300]]);
    blob('#c99a5c', 455, 320, 40, 26); blob('#c99a5c', 478, 295, 20, 18);
    crayon('#5a3a20', 4, [[496, 330], [508, 300]]);
  });
  const mat = new T.MeshStandardMaterial({ map: t, roughness: 0.9 });
  const sign = new T.Mesh(new T.PlaneGeometry(0.24, 0.18, 8, 6), mat);
  // slight paper curl
  const p = sign.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.pow(p.getX(i) / 0.12, 2) * 0.004 + Math.pow(p.getY(i) / 0.09, 2) * 0.002);
  sign.geometry.computeVertexNormals();
  sign.position.set(-0.6, 1.36, ROOM.z0 + 0.012);
  sign.rotation.z = 0.03;
  sign.castShadow = true; sign.receiveShadow = true;
  add(sign);
  const tape = new T.MeshStandardMaterial({ color: 0xe8e1c8, roughness: 0.6, transparent: true, opacity: 0.8 });
  for (const s of [-1, 1]) { const tp = new T.Mesh(new T.PlaneGeometry(0.05, 0.018), tape); tp.position.set(-0.6 + s * 0.1, 1.45, ROOM.z0 + 0.017); tp.rotation.z = s * 0.3; add(tp); }
  W.sign = sign;
}
