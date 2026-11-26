// Tools on the table and the miniature town inside the jar.
import * as THREE from '../lib/three.module.min.js';
import { tex, texRep } from './assets.js';
import { contactShadow } from './room.js';
import { groundH, trackPoint, TRACK, HOUSE, BASE_Y } from './moss.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- shared materials
export function makeMaterials() {
  const M = {};
  M.plastic = new THREE.MeshPhysicalMaterial({ color: 0xcfcac0, roughness: 0.42, metalness: 0, clearcoat: 0.2, roughnessMap: tex('metal_orm'), normalMap: tex('metal_n') });
  M.plastic.normalScale.set(0.25, 0.25);
  M.darkPlastic = new THREE.MeshPhysicalMaterial({ color: 0x3a3f3c, roughness: 0.5, metalness: 0, roughnessMap: tex('metal_orm'), normalMap: tex('metal_n') });
  M.darkPlastic.normalScale.set(0.3, 0.3);
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc9a25e, metalness: 1, roughness: 1, roughnessMap: tex('metal_orm'), metalnessMap: tex('metal_orm'), normalMap: tex('metal_n') });
  M.steel = new THREE.MeshStandardMaterial({ color: 0x8c8f90, metalness: 1, roughness: 1, roughnessMap: tex('metal_orm'), normalMap: tex('metal_n') });
  M.rail = new THREE.MeshStandardMaterial({ color: 0x6d6258, metalness: 0.85, roughness: 0.55, roughnessMap: tex('metal_orm') });
  M.wood = new THREE.MeshStandardMaterial({ map: texRep('oak_c', 0.15, 0.4), normalMap: texRep('oak_n', 0.15, 0.4), roughness: 0.6, color: 0xb08a68 });
  M.glassClear = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.3 });
  M.glassClear.blending = THREE.CustomBlending; M.glassClear.blendSrc = THREE.OneFactor; M.glassClear.blendDst = THREE.OneMinusSrcAlphaFactor;
  M.glassClear.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
      gl_FragColor = vec4(outgoingLight + vec3(0.03,0.04,0.04) * fres, clamp(0.08 + fres * 0.6, 0.0, 1.0));`);
  };
  M.water = new THREE.MeshPhysicalMaterial({ color: 0x9fb8b0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, envMapIntensity: 1.2, depthWrite: false });
  M.rubber = new THREE.MeshPhysicalMaterial({ color: 0x6b2a1c, roughness: 0.55, metalness: 0, sheen: 0.4, sheenColor: new THREE.Color(0.5, 0.3, 0.25), normalMap: tex('skin_n') });
  M.ceramic = new THREE.MeshPhysicalMaterial({ map: tex('ceramic_c'), normalMap: tex('ceramic_n'), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  M.stone = new THREE.MeshStandardMaterial({ map: tex('stone_c'), normalMap: tex('stone_n'), roughnessMap: tex('stone_orm'), aoMap: tex('stone_orm'), roughness: 1 });
  M.bark = new THREE.MeshStandardMaterial({ map: tex('bark_c'), normalMap: tex('bark_n'), roughness: 0.88 });
  M.siding = new THREE.MeshStandardMaterial({ map: texRep('siding_c', 1.4, 1.4), normalMap: texRep('siding_n', 1.4, 1.4), roughness: 0.8 });
  M.roof = new THREE.MeshStandardMaterial({ map: texRep('roof_c', 1.2, 1.2), normalMap: texRep('roof_n', 1.2, 1.2), roughness: 0.85 });
  M.trim = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.6, normalMap: tex('paint_n') });
  M.door = new THREE.MeshStandardMaterial({ color: 0x3f5a48, roughness: 0.55, normalMap: tex('paint_n') });
  M.window = new THREE.MeshStandardMaterial({ color: 0x1c2226, roughness: 0.1, metalness: 0.2, emissive: new THREE.Color(1.0, 0.62, 0.28), emissiveIntensity: 0 });
  M.locoGreen = new THREE.MeshStandardMaterial({ color: 0x1f3d2c, metalness: 0.55, roughness: 1, roughnessMap: tex('metal_orm'), normalMap: tex('metal_n') });
  M.maroon = new THREE.MeshStandardMaterial({ color: 0x5a1f18, metalness: 0.5, roughness: 1, roughnessMap: tex('metal_orm'), normalMap: tex('metal_n') });
  M.black = new THREE.MeshStandardMaterial({ color: 0x1b1a19, metalness: 0.7, roughness: 0.6, roughnessMap: tex('metal_orm') });
  M.lamp = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: new THREE.Color(1, 0.8, 0.5), emissiveIntensity: 0 });
  M.paper = new THREE.MeshStandardMaterial({ roughness: 0.92, normalMap: texRep('linen_n', 2, 2) });
  M.paper.normalScale.set(0.25, 0.25);
  return M;
}

function lathe(points, seg = 40) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// ---------------------------------------------------------------- spray bottle (glass body, plastic trigger head)
export function makeSprayer(M, scale = 1) {
  const g = new THREE.Group();
  const body = lathe([[0, 0], [0.026, 0.0], [0.029, 0.004], [0.030, 0.012], [0.030, 0.085], [0.026, 0.100], [0.013, 0.112], [0.012, 0.122], [0, 0.122]], 48);
  const glass = new THREE.Mesh(body, M.glassClear); glass.renderOrder = 7;
  g.add(glass);
  const water = new THREE.Mesh(lathe([[0, 0.004], [0.027, 0.004], [0.028, 0.012], [0.028, 0.07], [0, 0.07]], 40), M.water);
  water.renderOrder = 6;
  g.add(water);
  g.userData.water = water;
  // dip tube
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.11, 8), M.glassClear);
  tube.position.set(0.006, 0.062, 0); g.add(tube);
  // cap & trigger head
  const cap = shadowed(new THREE.Mesh(lathe([[0, 0.118], [0.0155, 0.118], [0.0160, 0.121], [0.0160, 0.134], [0.0145, 0.137], [0, 0.137]], 32), M.plastic));
  g.add(cap);
  const headShape = new THREE.Shape();
  headShape.moveTo(-0.014, 0); headShape.lineTo(0.014, 0); headShape.quadraticCurveTo(0.016, 0.028, 0.006, 0.034);
  headShape.lineTo(-0.038, 0.034); headShape.quadraticCurveTo(-0.044, 0.030, -0.042, 0.022); headShape.lineTo(-0.016, 0.018);
  headShape.quadraticCurveTo(-0.016, 0.004, -0.014, 0);
  const head = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(headShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 8 }), M.plastic));
  head.geometry.translate(0, 0, -0.011);
  head.rotation.y = Math.PI / 2; // nozzle (-x in shape) -> +z ... we orient so nozzle points to -Z
  head.rotation.y = -Math.PI / 2;
  head.position.y = 0.136;
  g.add(head);
  const nozzle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.008, 16), M.darkPlastic));
  nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.163, -0.044);
  g.add(nozzle);
  const trig = new THREE.Shape();
  trig.moveTo(0, 0); trig.quadraticCurveTo(-0.006, -0.02, 0.0, -0.04); trig.lineTo(0.006, -0.04); trig.quadraticCurveTo(0.002, -0.02, 0.006, 0); trig.lineTo(0, 0);
  const trigger = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(trig, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2 }), M.plastic));
  trigger.geometry.translate(0, 0, -0.006);
  const tp = new THREE.Group();
  tp.position.set(0, 0.152, -0.03);
  trigger.rotation.y = -Math.PI / 2;
  tp.add(trigger);
  g.add(tp);
  g.userData.trigger = tp;
  g.userData.tip = V3(0, 0.163, -0.049);
  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------- dropper (pipette)
export function makeDropper(M) {
  const g = new THREE.Group();
  const tubeG = lathe([[0, 0], [0.0012, 0.0], [0.0018, 0.004], [0.0045, 0.025], [0.0050, 0.030], [0.0050, 0.088], [0.0062, 0.090], [0, 0.090]], 24);
  const tube = new THREE.Mesh(tubeG, M.glassClear); tube.renderOrder = 7;
  g.add(tube);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.0041, 0.0041, 1, 16), M.water);
  water.position.y = 0.03; water.scale.y = 0.0001; water.renderOrder = 6;
  g.add(water);
  g.userData.water = water;
  const bulb = shadowed(new THREE.Mesh(lathe([[0, 0.086], [0.0068, 0.086], [0.0075, 0.092], [0.0090, 0.100], [0.0095, 0.110], [0.0085, 0.118], [0.0050, 0.124], [0, 0.125]], 32), M.rubber));
  g.add(bulb);
  g.userData.bulb = bulb;
  g.userData.tip = V3(0, 0, 0);
  return g;
}

// ---------------------------------------------------------------- magnifier
export function makeMagnifier(M) {
  const g = new THREE.Group();
  const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0032, 12, 64), M.brass));
  g.add(rim);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0352, 64), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  lens.renderOrder = 10;
  g.add(lens);
  const lensGlass = new THREE.Mesh(new THREE.SphereGeometry(0.06, 32, 8, 0, Math.PI * 2, 0, 0.62), M.glassClear);
  lensGlass.rotation.x = Math.PI / 2; lensGlass.position.z = -0.0485; lensGlass.renderOrder = 11;
  g.add(lensGlass);
  const ferrule = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0052, 0.016, 16), M.brass));
  ferrule.position.y = -0.045; g.add(ferrule);
  const handle = shadowed(new THREE.Mesh(lathe([[0, 0], [0.0062, 0.002], [0.0068, 0.03], [0.006, 0.07], [0.0052, 0.084], [0, 0.088]], 24), M.wood));
  handle.rotation.x = Math.PI; handle.position.y = -0.052;
  g.add(handle);
  g.userData.lens = lens;
  g.userData.tip = V3(0, 0, 0);
  return g;
}

// ---------------------------------------------------------------- pebbles & twigs
export function pebbleGeometries(n = 6) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const p = g.attributes.position;
    const sx = 0.8 + Math.random() * 0.5, sy = 0.45 + Math.random() * 0.2, sz = 0.65 + Math.random() * 0.3;
    const ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 1 + 0.08 * Math.sin(x * 3 + ph[0]) * Math.sin(z * 2.6 + ph[1]) + 0.05 * Math.sin(y * 4 + ph[2]);
      p.setXYZ(i, x * sx * d, y * sy * d * (y < 0 ? 0.7 : 1), z * sz * d);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

export function twigGeometry(len = 0.03, rad = 0.0021) {
  const pts = [];
  const bend = (Math.random() - 0.5) * 0.004;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(V3((t - 0.5) * len, Math.sin(t * Math.PI) * bend * 0.4, Math.sin(t * Math.PI * 1.3) * bend));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 12, rad, 7, false);
  // taper + end caps approximated by squashing ends
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getY(i) * 0.5, uv.getX(i) * len * 40);
  // stub branch
  const stub = new THREE.CylinderGeometry(rad * 0.45, rad * 0.6, len * 0.22, 6);
  stub.rotateZ(-1.0); stub.translate(len * 0.12, rad * 1.6, 0);
  const merged = mergeGeos([g, stub]);
  merged.computeVertexNormals();
  return merged;
}

function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, ov * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2);
    const ix = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
    ov += g.attributes.position.count; oi += ix.length;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

// instanced placement with a little drop animation
export class Placer {
  constructor(parent, geos, material, cap, castShadow = true) {
    this.meshes = geos.map((g) => {
      const m = new THREE.InstancedMesh(g, material, cap);
      m.count = 0; m.castShadow = castShadow; m.receiveShadow = true; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(m);
      return m;
    });
    this.items = [];
    this.anim = [];
    this.m4 = new THREE.Matrix4();
  }
  add(pos, quat, scale, color, delay = 0) {
    const k = this.items.length % this.meshes.length;
    const mesh = this.meshes[k];
    if (mesh.count >= mesh.instanceMatrix.count) return null;
    const i = mesh.count++;
    const it = { mesh, i, pos: pos.clone(), quat: quat.clone(), scale: scale.clone() };
    this.items.push(it);
    if (color) { mesh.setColorAt(i, color); mesh.instanceColor.needsUpdate = true; }
    this.anim.push({ it, t: -delay });
    this._write(it, 0.03);
    return it;
  }
  _write(it, dy, squash = 1) {
    const p = it.pos.clone(); p.y += dy;
    const s = it.scale.clone(); s.y *= squash;
    this.m4.compose(p, it.quat, s);
    it.mesh.setMatrixAt(it.i, this.m4);
    it.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt, onLand) {
    for (let k = this.anim.length - 1; k >= 0; k--) {
      const a = this.anim[k];
      a.t += dt;
      if (a.t < 0) { this._write(a.it, 0.03); continue; }
      const t = Math.min(1, a.t / 0.22);
      const dy = 0.03 * (1 - t * t);
      this._write(a.it, dy, t >= 1 ? 1 : 1);
      if (t >= 1) { this.anim.splice(k, 1); onLand && onLand(a.it); }
    }
  }
  get count() { return this.items.length; }
}

// ---------------------------------------------------------------- the little house
export function makeHouse(M) {
  const g = new THREE.Group();
  const W = 0.040, D = 0.032, H = 0.026, RH = 0.017;
  const walls = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), M.siding));
  walls.position.y = H / 2;
  g.add(walls);
  // gable ends
  const gs = new THREE.Shape(); gs.moveTo(-D / 2, 0); gs.lineTo(D / 2, 0); gs.lineTo(0, RH); gs.lineTo(-D / 2, 0);
  const gable = new THREE.ExtrudeGeometry(gs, { depth: W - 0.001, bevelEnabled: false });
  gable.translate(0, 0, -(W - 0.001) / 2); gable.rotateY(Math.PI / 2);
  const gm = shadowed(new THREE.Mesh(gable, M.siding)); gm.position.y = H; g.add(gm);
  // roof planes with thickness & overhang
  const slope = Math.hypot(D / 2 + 0.004, RH + 0.003);
  const ang = Math.atan2(RH + 0.003, D / 2 + 0.004);
  for (const s of [-1, 1]) {
    const r = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W + 0.008, 0.0022, slope), M.roof));
    r.position.set(0, H + RH / 2 + 0.0015, s * (D / 4 + 0.001));
    r.rotation.x = s * ang;
    g.add(r);
  }
  const ridge = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, W + 0.008, 8), M.roof));
  ridge.rotation.z = Math.PI / 2; ridge.position.y = H + RH + 0.0025; g.add(ridge);
  const chim = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.006), M.stone));
  chim.position.set(0.011, H + RH + 0.002, -0.006); g.add(chim);
  // windows (front +z faces camera) and door
  const wins = [];
  const addWin = (x, y, z, ry) => {
    const fr = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.0085, 0.0095, 0.0012), M.trim));
    fr.position.set(x, y, z); fr.rotation.y = ry; g.add(fr);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.0068, 0.0078), M.window);
    gl.position.set(x + Math.sin(ry) * 0.0007, y, z + Math.cos(ry) * 0.0007); gl.rotation.y = ry; g.add(gl);
    const mu = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.0078, 0.0006), M.trim);
    mu.position.copy(gl.position); mu.rotation.y = ry; g.add(mu);
    const mu2 = new THREE.Mesh(new THREE.BoxGeometry(0.0068, 0.0008, 0.0006), M.trim);
    mu2.position.copy(gl.position); mu2.rotation.y = ry; g.add(mu2);
    wins.push(gl);
  };
  addWin(-0.011, 0.014, D / 2 + 0.0006, 0);
  addWin(0.012, 0.014, D / 2 + 0.0006, 0);
  addWin(W / 2 + 0.0006, 0.014, 0.004, Math.PI / 2);
  addWin(-W / 2 - 0.0006, 0.014, 0.004, -Math.PI / 2);
  const door = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.0075, 0.0145, 0.0012), M.door));
  door.position.set(0.0005, 0.0073, D / 2 + 0.0006); g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0006, 8, 6), M.brass);
  knob.position.set(0.0028, 0.007, D / 2 + 0.0014); g.add(knob);
  const step = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.002, 0.005), M.stone));
  step.position.set(0.0005, 0.001, D / 2 + 0.003); g.add(step);
  // warm interior light (always present, intensity animated -> no shader recompiles)
  const light = new THREE.PointLight(0xffb067, 0, 0.16, 1.6);
  light.position.set(0, 0.014, 0.0);
  g.add(light);
  const outLight = new THREE.PointLight(0xffb067, 0, 0.12, 1.5);
  outLight.position.set(0, 0.012, D / 2 + 0.012);
  g.add(outLight);
  g.userData = { light, outLight, wins, lit: 0 };
  const y = groundH(HOUSE.x, HOUSE.z) - 0.0015;
  g.position.set(HOUSE.x, y, HOUSE.z);
  g.rotation.y = 0.12;
  return g;
}

// ---------------------------------------------------------------- track & train
function trackY(x, z) { return groundH(x, z) + 0.0032; }

export function makeTrack(M) {
  const g = new THREE.Group();
  const n = 160;
  const mk = (off) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const p = trackPoint(u);
      const p2 = trackPoint(u + 0.001);
      const t = p2.sub(p).normalize();
      const side = V3(-t.z, 0, t.x);
      const q = trackPoint(u).addScaledVector(side, off);
      q.y = trackY(q.x, q.z);
      pts.push(q);
    }
    return new THREE.CatmullRomCurve3(pts, true);
  };
  for (const off of [-0.0033, 0.0033]) {
    const tube = shadowed(new THREE.Mesh(new THREE.TubeGeometry(mk(off), 320, 0.00055, 5, true), M.rail));
    g.add(tube);
  }
  // sleepers
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.011, 0.0011, 0.0018), M.bark, 150);
  sl.castShadow = true; sl.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(1, 1, 1);
  for (let i = 0; i < 150; i++) {
    const u = i / 150;
    const p = trackPoint(u), p2 = trackPoint(u + 0.001);
    const ang = Math.atan2(p2.z - p.z, p2.x - p.x);
    q.setFromAxisAngle(V3(0, 1, 0), -ang + Math.PI / 2);
    p.y = trackY(p.x, p.z) - 0.0011;
    m4.compose(p, q, s);
    sl.setMatrixAt(i, m4);
  }
  g.add(sl);
  // ballast ribbon
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = trackPoint(u), p2 = trackPoint(u + 0.001);
    const t = p2.sub(p).normalize();
    const side = V3(-t.z, 0, t.x);
    for (const s2 of [-1, 1]) {
      const qq = p.clone().addScaledVector(side, s2 * 0.0075);
      pos.push(qq.x, groundH(qq.x, qq.z) + 0.0012 + (1 - Math.abs(s2)) * 0.001, qq.z);
      uv.push((s2 + 1) * 0.5 * 0.4, u * 22);
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  bg.setIndex(idx); bg.computeVertexNormals();
  const ballast = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: texRep('stone_c', 1, 1), normalMap: texRep('stone_n', 1, 1), roughness: 0.95, color: 0x8a8278 }));
  ballast.receiveShadow = true;
  g.add(ballast);
  return g;
}

export function makeTrain(M) {
  const cars = [];
  const wheelGeo = new THREE.CylinderGeometry(0.0021, 0.0021, 0.0012, 14);
  wheelGeo.rotateX(Math.PI / 2);
  const addWheels = (grp, xs) => {
    const ws = [];
    for (const x of xs) for (const z of [-0.0036, 0.0036]) {
      const w = new THREE.Mesh(wheelGeo, M.black); w.position.set(x, 0.0021, z); grp.add(w); ws.push(w);
    }
    return ws;
  };
  // loco (length along +x)
  const loco = new THREE.Group();
  const frame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.0022, 0.0078), M.black)); frame.position.y = 0.0042; loco.add(frame);
  const boiler = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.016, 20), M.locoGreen));
  boiler.rotation.z = Math.PI / 2; boiler.position.set(0.004, 0.0088, 0); loco.add(boiler);
  const smokebox = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0039, 0.0039, 0.0035, 20), M.black));
  smokebox.rotation.z = Math.PI / 2; smokebox.position.set(0.0128, 0.0088, 0); loco.add(smokebox);
  const chimney = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0011, 0.005, 12), M.black)); chimney.position.set(0.0115, 0.0145, 0); loco.add(chimney);
  const dome = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.0018, 14, 8), M.brass)); dome.position.set(0.004, 0.0125, 0); loco.add(dome);
  const cab = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.0085, 0.0095, 0.0082), M.locoGreen)); cab.position.set(-0.0075, 0.0098, 0); loco.add(cab);
  const cabRoof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.0009, 0.0092), M.black)); cabRoof.position.set(-0.0075, 0.0148, 0); loco.add(cabRoof);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.001, 12), M.lamp);
  head.rotation.z = Math.PI / 2; head.position.set(0.0148, 0.0098, 0); loco.add(head);
  const beam = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0016, 0.0086), M.maroon)); beam.position.set(0.0135, 0.0042, 0); loco.add(beam);
  const lw = addWheels(loco, [0.008, 0.0, -0.008]);
  const hl = new THREE.PointLight(0xffd9a0, 0, 0.08, 1.6); hl.position.set(0.02, 0.009, 0); loco.add(hl);
  loco.userData = { wheels: lw, len: 0.028, chimney, lamp: head, light: hl };
  cars.push(loco);
  for (let k = 0; k < 2; k++) {
    const c = new THREE.Group();
    const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.0018, 0.0078), M.black)); base.position.y = 0.0042; c.add(base);
    const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.0065, 0.0076), k === 0 ? M.maroon : M.locoGreen)); box.position.y = 0.0085; c.add(box);
    // load: little logs / moss
    for (let j = 0; j < 3; j++) {
      const log = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.016, 8), M.bark));
      log.rotation.z = Math.PI / 2; log.position.set(0, 0.0125 + (j === 2 ? 0.0018 : 0), (j - 1) * 0.0024 * (j === 2 ? 0 : 1)); c.add(log);
    }
    const ws = addWheels(c, [0.006, -0.006]);
    c.userData = { wheels: ws, len: 0.022 };
    cars.push(c);
  }
  return cars;
}

// ---------------------------------------------------------------- picture rule card (no text)
export function makeRuleCard(M) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const x = c.getContext('2d');
  // paper
  x.fillStyle = '#f4ecdb'; x.fillRect(0, 0, 512, 640);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(120,100,70,${Math.random() * 0.05})`; x.fillRect(Math.random() * 512, Math.random() * 640, 1.5, 1.5); }
  const blob = (cx, cy, r, col, n = 14) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, rr = Math.random() * r;
      x.fillStyle = col; x.globalAlpha = 0.55;
      x.beginPath(); x.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.6, r * (0.25 + Math.random() * 0.25), 0, 6.28); x.fill();
    }
    x.globalAlpha = 1;
  };
  const arrow = (x0, y0, x1, y1) => {
    x.strokeStyle = '#6b5a44'; x.lineWidth = 9; x.lineCap = 'round';
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    x.beginPath(); x.moveTo(x1 - 18, y1 - 16); x.lineTo(x1, y1); x.lineTo(x1 - 18, y1 + 16); x.stroke();
  };
  const sprayer = (cx, cy) => {
    x.fillStyle = 'rgba(160,190,200,0.6)'; x.strokeStyle = '#5d6b70'; x.lineWidth = 4;
    x.beginPath(); x.roundRect(cx - 22, cy - 10, 44, 62, 10); x.fill(); x.stroke();
    x.fillStyle = '#d8d3c6'; x.beginPath(); x.roundRect(cx - 30, cy - 34, 46, 24, 6); x.fill(); x.stroke();
    for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(120,160,190,0.7)'; x.beginPath(); x.arc(cx + 30 + Math.random() * 40, cy - 30 + (Math.random() - 0.5) * 30, 2 + Math.random() * 3, 0, 6.28); x.fill(); }
  };
  // row 1: brown moss + spray -> green sparkling moss
  blob(90, 120, 46, '#8a6a40'); sprayer(90, 40);
  arrow(170, 120, 290, 120);
  blob(390, 120, 52, '#4f8a2a', 20); blob(390, 112, 30, '#79ad3a', 10);
  for (let i = 0; i < 6; i++) { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(360 + Math.random() * 60, 95 + Math.random() * 40, 4, 0, 6.28); x.fill(); }
  // row 2: stones path -> little house
  x.strokeStyle = '#d9cfb8'; x.lineWidth = 2;
  for (let i = 0; i < 6; i++) { x.fillStyle = '#9a948a'; x.beginPath(); x.ellipse(70 + i * 34, 330 - i * 14, 14, 9, 0, 0, 6.28); x.fill(); }
  x.fillStyle = '#d8c39d'; x.fillRect(320, 250, 90, 64); x.fillStyle = '#7d4a3a'; x.beginPath(); x.moveTo(305, 252); x.lineTo(365, 205); x.lineTo(425, 252); x.fill();
  x.fillStyle = '#ffc874'; x.fillRect(336, 266, 20, 18); x.fillRect(376, 266, 20, 18);
  // row 3: magnifier -> train
  x.strokeStyle = '#a88a4a'; x.lineWidth = 9; x.beginPath(); x.arc(110, 500, 48, 0, 6.28); x.stroke();
  x.strokeStyle = '#7a5a3a'; x.lineWidth = 14; x.beginPath(); x.moveTo(145, 535); x.lineTo(190, 585); x.stroke();
  x.fillStyle = 'rgba(200,230,240,0.4)'; x.beginPath(); x.arc(110, 500, 44, 0, 6.28); x.fill();
  arrow(210, 500, 290, 500);
  x.fillStyle = '#2d4a36'; x.fillRect(320, 480, 70, 34); x.fillRect(370, 458, 26, 26); x.fillStyle = '#5a1f18'; x.fillRect(400, 484, 60, 30);
  x.fillStyle = '#1b1a19'; for (const wx of [334, 360, 384, 414, 446]) { x.beginPath(); x.arc(wx, 518, 8, 0, 6.28); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(332, 455, 10, 0, 6.28); x.arc(322, 438, 13, 0, 6.28); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const mat = M.paper.clone(); mat.map = t;
  const g = new THREE.Group();
  const card = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.106, 0.0012), [M.paper, M.paper, M.paper, M.paper, mat, M.paper]));
  card.position.y = 0.05;
  card.rotation.x = -0.18;
  g.add(card);
  const stand = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.03), M.wood));
  stand.position.set(0, 0.006, -0.004); g.add(stand);
  return g;
}

export function makeDish(M) {
  const g = new THREE.Group();
  const dish = shadowed(new THREE.Mesh(lathe([[0, 0], [0.040, 0.0], [0.050, 0.006], [0.056, 0.016], [0.057, 0.018], [0.053, 0.0185], [0.047, 0.010], [0, 0.007]], 48), M.ceramic));
  g.add(dish);
  return g;
}

export function makeCup(M) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(lathe([[0, 0], [0.026, 0], [0.028, 0.004], [0.030, 0.075], [0.028, 0.075], [0.026, 0.006], [0, 0.006]], 40), M.glassClear);
  glass.renderOrder = 7; g.add(glass);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.025, 1, 32), M.water);
  water.position.y = 0.006; water.scale.y = 0.012; water.renderOrder = 6;
  g.add(water);
  g.userData.water = water;
  return g;
}
