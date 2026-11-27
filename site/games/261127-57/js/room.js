// Room by the window on a late-November morning: oak table, plaster wall, window with garden,
// sheer linen curtain, low warm sun, sky fill, HDR-like environment map.
import * as THREE from '../lib/three.module.min.js';
import { tex, texRep } from './assets.js';

export const TABLE = { x0: -0.75, x1: 0.75, z0: -0.48, z1: 0.36, top: 0 };
export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -1.0).normalize(); // direction TO the sun
export const SUN_COLOR = new THREE.Color().setRGB(1.0, 0.82, 0.62); // ~4000K low morning sun

export function buildEnvironment(renderer) {
  // a tiny HDR "room" rendered into a PMREM: bright window behind the table, warm walls, floor
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 6), new THREE.MeshBasicMaterial({ color: 0xb9a68a, side: THREE.BackSide }));
  box.position.y = 0.8;
  s.add(box);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0x5e4630 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.75;
  s.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0xe8e0d2 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 2.35;
  s.add(ceil);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.4, 3.7) }));
  win.position.set(-0.1, 0.75, -2.95);
  s.add(win);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(40, 30, 20) }));
  sun.position.copy(SUN_DIR).multiplyScalar(2.9);
  sun.lookAt(0, 0, 0);
  s.add(sun);
  // window light patch on the wall behind camera (bounce)
  const bounce = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.3, 1.05) }));
  bounce.position.set(0.4, 0.6, 2.95); bounce.rotation.y = Math.PI;
  s.add(bounce);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  return rt.texture;
}

function pbr(name, rx, ry, extra = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: texRep(name + '_c', rx, ry),
    normalMap: texRep(name + '_n', rx, ry),
    roughnessMap: texRep(name + '_orm', rx, ry),
    aoMap: texRep(name + '_orm', rx, ry),
    metalness: 0, roughness: 1, ...extra,
  });
  return m;
}

export function buildRoom(scene) {
  const g = new THREE.Group();
  scene.add(g);
  // --- table
  const T = TABLE;
  const tw = T.x1 - T.x0, td = T.z1 - T.z0;
  const topMat = new THREE.MeshStandardMaterial({
    map: tex('oak_c'), normalMap: tex('oak_n'), roughnessMap: tex('oak_orm'), aoMap: tex('oak_orm'),
    roughness: 1, metalness: 0, envMapIntensity: 0.9,
  });
  topMat.normalScale.set(0.6, 0.6);
  const top = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.032, td), topMat);
  top.position.set((T.x0 + T.x1) / 2, -0.016, (T.z0 + T.z1) / 2);
  top.receiveShadow = true; top.castShadow = true;
  // box uv: make side faces show end grain stretched properly
  g.add(top);
  // rounded front edge (cylinder)
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, tw, 16, 1), topMat);
  edge.rotation.z = Math.PI / 2; edge.position.set((T.x0 + T.x1) / 2, -0.016, T.z1);
  edge.receiveShadow = true;
  g.add(edge);
  // apron & legs
  const legMat = pbr('oak', 0.3, 1.0);
  for (const sx of [T.x0 + 0.05, T.x1 - 0.05]) for (const sz of [T.z0 + 0.05, T.z1 - 0.06]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.69, 0.05), legMat);
    leg.position.set(sx, -0.032 - 0.345, sz); leg.castShadow = leg.receiveShadow = true;
    g.add(leg);
  }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.08, 0.08, 0.02), legMat);
  apron.position.set(0, -0.075, T.z1 - 0.06); apron.receiveShadow = true;
  g.add(apron);
  // --- floor (oak boards, darker)
  const floorMat = pbr('oak', 4, 9, { color: new THREE.Color(0.55, 0.42, 0.34) });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.72;
  floor.receiveShadow = true;
  g.add(floor);
  // --- wall with window opening
  const wallZ = -0.62;
  const wallMat = pbr('plaster', 3, 2.2);
  const W = { x0: -0.62, x1: 0.5, y0: 0.10, y1: 1.32 };
  const addWall = (x0, x1, y0, y1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wallMat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, wallZ); m.receiveShadow = true;
    const uv = m.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 1.2, (y0 + uv.getY(i) * (y1 - y0)) / 1.2);
    g.add(m);
  };
  addWall(-3, W.x0, -0.72, 2.4); addWall(W.x1, 3, -0.72, 2.4);
  addWall(W.x0, W.x1, W.y1, 2.4); addWall(W.x0, W.x1, -0.72, W.y0);
  // window reveal (depth) + sill + frame
  const paint = pbr('paint', 1, 1);
  const depth = 0.16;
  const rev = (w, h, x, y, z, ry, rx) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paint);
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); m.receiveShadow = true; g.add(m);
  };
  rev(depth, W.y1 - W.y0, W.x0, (W.y0 + W.y1) / 2, wallZ - depth / 2, Math.PI / 2);
  rev(depth, W.y1 - W.y0, W.x1, (W.y0 + W.y1) / 2, wallZ - depth / 2, -Math.PI / 2);
  rev(W.x1 - W.x0, depth, (W.x0 + W.x1) / 2, W.y1, wallZ - depth / 2, 0, Math.PI / 2);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W.x1 - W.x0 + 0.08, 0.025, depth + 0.06), paint);
  sill.position.set((W.x0 + W.x1) / 2, W.y0 - 0.012, wallZ - depth / 2 + 0.03);
  sill.receiveShadow = sill.castShadow = true;
  g.add(sill);
  // sash frame & muntins
  const fz = wallZ - depth + 0.02;
  const bar = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), paint);
    m.position.set(x, y, fz); m.castShadow = true; m.receiveShadow = true; g.add(m);
  };
  const cx = (W.x0 + W.x1) / 2, cy = (W.y0 + W.y1) / 2;
  bar(W.x1 - W.x0, 0.05, cx, W.y0 + 0.025); bar(W.x1 - W.x0, 0.05, cx, W.y1 - 0.025);
  bar(0.05, W.y1 - W.y0, W.x0 + 0.025, cy); bar(0.05, W.y1 - W.y0, W.x1 - 0.025, cy);
  bar(0.045, W.y1 - W.y0, cx, cy); bar(W.x1 - W.x0, 0.03, cx, cy + 0.12);
  // window glass (reflective, faint)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0, W.y1 - W.y0),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.08, envMapIntensity: 1.5 }));
  glass.position.set(cx, cy, fz - 0.005);
  g.add(glass);
  // garden outside (pre-blurred = depth of field)
  const garden = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.3), new THREE.MeshBasicMaterial({ map: tex('garden_c'), toneMapped: true }));
  garden.material.color.setRGB(1.55, 1.5, 1.42);
  garden.position.set(-0.2, 0.75, -2.6);
  g.add(garden);
  // sheer linen curtain on the left (displaced plane, translucent)
  const cg = new THREE.PlaneGeometry(0.5, 1.6, 48, 24);
  const p = cg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const fold = Math.sin(x * 34 + Math.sin(y * 2) * 0.6) * 0.03 + Math.sin(x * 71) * 0.006;
    p.setZ(i, fold * (0.7 + 0.3 * (0.8 - y) / 1.6));
    p.setX(i, x * (0.82 + 0.18 * (y + 0.8) / 1.6));
  }
  cg.computeVertexNormals();
  const cm = new THREE.MeshStandardMaterial({ map: texRep('linen_c', 2, 6), normalMap: texRep('linen_n', 2, 6), roughness: 0.95,
    transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: new THREE.Color(0.55, 0.47, 0.36), emissiveMap: texRep('linen_c', 2, 6) });
  const curtain = new THREE.Mesh(cg, cm);
  curtain.position.set(W.x0 + 0.02, 0.62, wallZ + 0.07);
  curtain.castShadow = true;
  g.add(curtain);
  // coat rack (turned wood) on the left for the lab coat
  const rack = new THREE.Group();
  const lathe = new THREE.LatheGeometry([
    new THREE.Vector2(0.16, 0), new THREE.Vector2(0.17, 0.02), new THREE.Vector2(0.05, 0.04), new THREE.Vector2(0.022, 0.06),
    new THREE.Vector2(0.018, 1.0), new THREE.Vector2(0.024, 1.5), new THREE.Vector2(0.03, 1.62), new THREE.Vector2(0.0, 1.66)], 24);
  const rackMat = pbr('oak', 0.25, 2.5, { color: new THREE.Color(0.55, 0.4, 0.3) });
  const pole = new THREE.Mesh(lathe, rackMat);
  pole.castShadow = pole.receiveShadow = true;
  rack.add(pole);
  for (let k = 0; k < 4; k++) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 16, Math.PI * 0.9), rackMat);
    hook.position.set(Math.cos(k * Math.PI / 2) * 0.04, 1.5, Math.sin(k * Math.PI / 2) * 0.04);
    hook.rotation.y = -k * Math.PI / 2; hook.rotation.z = Math.PI * 0.55;
    hook.castShadow = true;
    rack.add(hook);
  }
  rack.position.set(-0.98, -0.72, 0.72);
  g.add(rack);
  return { group: g, rack, wallZ, windowRect: W };
}

export function buildLights(scene) {
  const L = {};
  // low morning sun through the window
  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.6);
  sun.position.copy(SUN_DIR).multiplyScalar(2.5);
  sun.target.position.set(0, 0, 0.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -0.9; sc.right = 0.9; sc.top = 1.1; sc.bottom = -0.9; sc.near = 0.5; sc.far = 5;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.002;
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 12;
  scene.add(sun, sun.target);
  L.sun = sun;
  // sky fill from the window (cool), and warm room bounce from behind the camera
  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x8a6e52, 0.4);
  scene.add(hemi);
  L.hemi = hemi;
  const fill = new THREE.DirectionalLight(0xffe6cc, 0.55);
  fill.position.set(0.6, 1.2, 1.8);
  scene.add(fill);
  L.fill = fill;
  return L;
}

// soft contact shadow decal (ambient occlusion under objects)
let _aoTex = null;
export function contactShadow(w, d, strength = 0.55) {
  if (!_aoTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    _aoTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: _aoTex, transparent: true, opacity: strength, depthWrite: false, color: 0x1a1006 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.0006;
  m.renderOrder = 1;
  return m;
}
