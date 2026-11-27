// World: old hotel facade, steps, door, windows, lamps, trees, bench, sign, mats.
import { T, scene, tex } from './core.js';
import { mergeGeometries } from './BufferGeometryUtils.js';

// world-unit UVs for boxes (so textures keep real scale)
export function worldUV(geo, scale = 1, axis = 'auto') {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u * scale, v * scale);
  }
  return geo;
}
function boxAt(w, h, d, x, y, z, scale = 1) {
  const g = new T.BoxGeometry(w, h, d, Math.max(1, Math.round(w * 2)), Math.max(1, Math.round(h * 2)), 1);
  g.translate(x, y, z);
  return worldUV(g, scale);
}

export const mats = {};
function makeMats() {
  mats.brick = new T.MeshStandardMaterial({ map: tex('brick_albedo.jpg', { srgb: true }), normalMap: tex('brick_normal.jpg'), roughnessMap: tex('brick_orm.jpg'), aoMap: tex('brick_orm.jpg'), roughness: 1 });
  mats.brick.normalScale.set(1.2, 1.2);
  mats.stone = new T.MeshStandardMaterial({ map: tex('stone_albedo.jpg', { srgb: true }), normalMap: tex('stone_normal.jpg'), roughness: 0.78 });
  mats.wood = new T.MeshStandardMaterial({ map: tex('wood_albedo.jpg', { srgb: true }), normalMap: tex('wood_normal.jpg'), roughnessMap: tex('wood_orm.jpg'), roughness: 1 });
  mats.paint = new T.MeshStandardMaterial({ color: new T.Color().setRGB(0.86, 0.85, 0.80, T.SRGBColorSpace), normalMap: tex('wood_normal.jpg'), normalScale: new T.Vector2(0.25, 0.25), roughness: 0.42 });
  mats.green = new T.MeshStandardMaterial({ color: new T.Color().setRGB(0.07, 0.17, 0.12, T.SRGBColorSpace), normalMap: tex('wood_normal.jpg'), normalScale: new T.Vector2(0.3, 0.3), roughness: 0.38 });
  mats.brass = new T.MeshStandardMaterial({ color: new T.Color().setRGB(0.80, 0.62, 0.32, T.SRGBColorSpace), metalness: 1, roughness: 0.32, normalMap: tex('stone_normal.jpg'), normalScale: new T.Vector2(0.15, 0.15) });
  mats.iron = new T.MeshStandardMaterial({ color: new T.Color().setRGB(0.06, 0.06, 0.06, T.SRGBColorSpace), metalness: 0.9, roughness: 0.45, normalMap: tex('stone_normal.jpg'), normalScale: new T.Vector2(0.3, 0.3) });
  mats.glass = new T.MeshPhysicalMaterial({ color: new T.Color().setRGB(0.04, 0.05, 0.05, T.SRGBColorSpace), metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, reflectivity: 0.6 });
  mats.canvas = new T.MeshStandardMaterial({ color: new T.Color().setRGB(0.10, 0.24, 0.16, T.SRGBColorSpace), normalMap: tex('twill_normal.jpg'), normalScale: new T.Vector2(0.7, 0.7), roughness: 0.9 });
  mats.bark = new T.MeshStandardMaterial({ map: tex('bark_albedo.jpg', { srgb: true }), normalMap: tex('bark_normal.jpg'), normalScale: new T.Vector2(1.6, 1.6), roughness: 0.95 });
  mats.burlap = new T.MeshStandardMaterial({ map: tex('burlap_albedo.jpg', { srgb: true }), normalMap: tex('burlap_normal.jpg'), normalScale: new T.Vector2(1.5, 1.5), roughness: 0.97 });
  mats.interior = new T.MeshStandardMaterial({ color: 0x000000, emissive: new T.Color().setRGB(1.0, 0.72, 0.42, T.SRGBColorSpace), emissiveIntensity: 1.3, roughness: 1 });
  mats.lampGlass = new T.MeshStandardMaterial({ color: new T.Color().setRGB(1, 0.9, 0.7, T.SRGBColorSpace), emissive: new T.Color().setRGB(1.0, 0.75, 0.4, T.SRGBColorSpace), emissiveIntensity: 5, roughness: 0.2 });
}

const FZ = -7.4; // facade plane
export const door = { left: null, right: null, open: 0 };

function buildHotel() {
  const g = new T.Group();
  // brick wall with openings: build as pieces around door (x -0.95..0.95, h 2.55) and windows
  const wallParts = [];
  const W = 24, H = 5.2;
  const holes = [[-0.95, 0.95, 0.35, 2.75], [-3.6, -2.2, 1.0, 2.9], [2.2, 3.6, 1.0, 2.9], [-6.6, -5.2, 1.0, 2.9], [5.2, 6.6, 1.0, 2.9],
    [-3.6, -2.2, 3.95, 4.95], [2.2, 3.6, 3.95, 4.95], [-0.7, 0.7, 3.95, 4.95]];
  // vertical slicing by holes: simple approach -> horizontal bands
  const bands = [[0.6, 1.0], [1.0, 2.75], [2.75, 2.9], [2.9, 3.95], [3.95, 4.95], [4.95, H]];
  for (const [y0, y1] of bands) {
    const cuts = holes.filter((h) => h[2] < y1 - 1e-3 && h[3] > y0 + 1e-3).map((h) => [h[0], h[1]]).sort((a, b) => a[0] - b[0]);
    let x = -W / 2;
    for (const [a, b] of cuts) { if (a > x) wallParts.push(boxAt(a - x, y1 - y0, 0.4, (a + x) / 2, (y0 + y1) / 2, FZ - 0.2)); x = Math.max(x, b); }
    if (x < W / 2) wallParts.push(boxAt(W / 2 - x, y1 - y0, 0.4, (W / 2 + x) / 2, (y0 + y1) / 2, FZ - 0.2));
  }
  const wall = new T.Mesh(mergeGeometries(wallParts), mats.brick);
  wall.geometry.setAttribute('uv1', wall.geometry.attributes.uv);
  wall.receiveShadow = true; wall.castShadow = true;
  g.add(wall);
  // stone plinth + door surround + window sills/lintels + cornice
  const st = [];
  st.push(boxAt(W, 0.6, 0.5, 0, 0.3, FZ - 0.15, 1.5));
  st.push(boxAt(0.32, 2.75, 0.55, -1.11, 1.375, FZ - 0.1, 1.5), boxAt(0.32, 2.75, 0.55, 1.11, 1.375, FZ - 0.1, 1.5));
  st.push(boxAt(2.6, 0.38, 0.6, 0, 2.94, FZ - 0.08, 1.5));
  for (const [a, b, y0, y1] of holes.slice(1)) {
    const cx = (a + b) / 2, w = b - a;
    st.push(boxAt(w + 0.24, 0.1, 0.5, cx, y0 - 0.05, FZ + 0.02, 1.5));
    st.push(boxAt(w + 0.3, 0.26, 0.48, cx, y1 + 0.13, FZ - 0.02, 1.5));
  }
  st.push(boxAt(W, 0.22, 0.6, 0, 3.55, FZ - 0.05, 1.5));
  st.push(boxAt(W, 0.34, 0.8, 0, H + 0.12, FZ - 0.0, 1.5));
  // steps (3 x 17cm)
  for (let i = 0; i < 3; i++) st.push(boxAt(3.4 - i * 0.25, 0.17, 0.6 - i * 0.2 + 0.2 * (2 - i) * 0, 0, 0.085 + i * 0.17, FZ + 0.6 - i * 0.2 - (0.6 - i * 0.2) / 2 + 0.0, 1.5));
  const stoneMesh = new T.Mesh(mergeGeometries(st), mats.stone);
  {
    const roof = new T.Mesh(worldUV(new T.BoxGeometry(W, 0.06, 4, 8, 1, 4), 3), new T.MeshStandardMaterial({ color: new T.Color().setRGB(0.20, 0.21, 0.24, T.SRGBColorSpace), normalMap: tex('brick_normal.jpg'), normalScale: new T.Vector2(0.8, 0.8), roughness: 0.6 }));
    roof.rotation.x = 0.75; roof.position.set(0, H + 1.6, FZ - 1.6);
    roof.castShadow = true; g.add(roof);
  }
  stoneMesh.castShadow = true; stoneMesh.receiveShadow = true;
  g.add(stoneMesh);
  // windows: frame, glass, warm interior with curtains
  for (const [a, b, y0, y1] of holes.slice(1)) {
    const cx = (a + b) / 2, w = b - a, h = y1 - y0, cy = (y0 + y1) / 2;
    const inner = new T.Mesh(new T.PlaneGeometry(w, h), mats.interior.clone());
    inner.material.emissive = new T.Color().setRGB(0.95, 0.68, 0.40, T.SRGBColorSpace).multiplyScalar(0.55 + Math.random() * 0.35);
    inner.position.set(cx, cy, FZ - 0.38);
    g.add(inner);
    // curtains (folded cloth)
    for (const side of [-1, 1]) {
      const cg = new T.PlaneGeometry(w * 0.3, h * 0.95, 24, 1);
      const p = cg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 60) * 0.02);
      cg.computeVertexNormals();
      const c = new T.Mesh(cg, new T.MeshStandardMaterial({ color: new T.Color().setRGB(0.78, 0.70, 0.56, T.SRGBColorSpace), roughness: 0.9, normalMap: tex('twill_normal.jpg'), emissive: new T.Color().setRGB(0.35, 0.25, 0.14, T.SRGBColorSpace), side: T.DoubleSide }));
      c.position.set(cx + side * w * 0.36, cy, FZ - 0.33);
      g.add(c);
    }
    const glass = new T.Mesh(new T.PlaneGeometry(w, h), mats.glass);
    glass.material.transparent = true; glass.material.opacity = 0.55;
    glass.position.set(cx, cy, FZ - 0.12);
    g.add(glass);
    const fr = [];
    fr.push(boxAt(w, 0.07, 0.1, cx, y0 + 0.035, FZ - 0.1), boxAt(w, 0.07, 0.1, cx, y1 - 0.035, FZ - 0.1));
    fr.push(boxAt(0.07, h, 0.1, a + 0.035, cy, FZ - 0.1), boxAt(0.07, h, 0.1, b - 0.035, cy, FZ - 0.1));
    fr.push(boxAt(0.05, h, 0.06, cx, cy, FZ - 0.1), boxAt(w, 0.05, 0.06, cx, y0 + h * 0.62, FZ - 0.1));
    const fm = new T.Mesh(mergeGeometries(fr), mats.paint);
    fm.castShadow = true; g.add(fm);
  }
  // door: two leaves with raised panels and glass
  const lobby = new T.Mesh(new T.PlaneGeometry(1.9, 2.4), mats.interior);
  lobby.position.set(0, 1.55, FZ - 0.6); g.add(lobby);
  for (const side of [-1, 1]) {
    const pivot = new T.Group();
    pivot.position.set(side * 0.93, 0.35, FZ - 0.12);
    const leaf = [];
    const w = 0.92;
    leaf.push(boxAt(w, 0.12, 0.06, -side * w / 2, 0.06, 0), boxAt(w, 0.14, 0.06, -side * w / 2, 2.33, 0));
    leaf.push(boxAt(0.12, 2.4, 0.06, -side * 0.06, 1.2, 0), boxAt(0.12, 2.4, 0.06, -side * (w - 0.06), 1.2, 0));
    leaf.push(boxAt(w - 0.2, 0.12, 0.06, -side * w / 2, 1.05, 0));
    leaf.push(boxAt(w - 0.2, 0.9, 0.035, -side * w / 2, 0.55, 0));
    leaf.push(boxAt(w - 0.34, 0.66, 0.05, -side * w / 2, 0.55, 0.01));
    const lm = new T.Mesh(mergeGeometries(leaf), mats.green);
    lm.castShadow = true;
    pivot.add(lm);
    const gl = new T.Mesh(new T.PlaneGeometry(w - 0.2, 1.15), mats.glass);
    gl.position.set(-side * w / 2, 1.68, 0);
    pivot.add(gl);
    const handle = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.42, 12), mats.brass);
    handle.position.set(-side * (w - 0.1), 1.15, 0.06);
    pivot.add(handle);
    g.add(pivot);
    if (side < 0) door.left = pivot; else door.right = pivot;
  }
  // canopy over door (green canvas awning with scalloped valance)
  {
    const cg = new T.PlaneGeometry(2.6, 1.1, 30, 8);
    const p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setZ(i, Math.sin(p.getX(i) * 9) * 0.006 * (0.5 - y));
    }
    cg.rotateX(-Math.PI / 2 + 0.42);
    cg.computeVertexNormals();
    const c = new T.Mesh(cg, mats.canvas);
    c.material.side = T.DoubleSide;
    c.position.set(0, 3.32, FZ + 0.45);
    c.castShadow = true; c.receiveShadow = true;
    g.add(c);
    const val = new T.Mesh(new T.PlaneGeometry(2.6, 0.22, 30, 2), mats.canvas);
    val.position.set(0, 3.02, FZ + 0.96);
    g.add(val);
    for (const s of [-1, 1]) {
      const rod = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 1.15, 8), mats.iron);
      rod.rotation.x = Math.PI / 2 - 0.42; rod.position.set(s * 1.25, 3.3, FZ + 0.45); g.add(rod);
    }
  }
  // brass lanterns beside door
  for (const s of [-1, 1]) {
    const lg = new T.Group();
    const body = new T.Mesh(new T.CylinderGeometry(0.09, 0.07, 0.3, 6), mats.lampGlass);
    const cap = new T.Mesh(new T.ConeGeometry(0.13, 0.12, 6), mats.brass);
    cap.position.y = 0.21;
    const base = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 0.05, 6), mats.brass);
    base.position.y = -0.17;
    const arm = new T.Mesh(new T.BoxGeometry(0.03, 0.03, 0.25), mats.brass);
    arm.position.set(0, 0.1, -0.15);
    lg.add(body, cap, base, arm);
    lg.position.set(s * 1.45, 2.35, FZ + 0.25);
    g.add(lg);
    const pl = new T.PointLight(new T.Color().setRGB(1, 0.72, 0.42, T.SRGBColorSpace), 1.4, 3.5, 2);
    pl.position.copy(lg.position).add(new T.Vector3(0, 0, 0.15));
    g.add(pl);
  }
  scene.add(g);
  return g;
}

// ------------------------------------------------------------ trees
let leafMatRef = null;
function tube(path, r0, r1, seg = 8, radial = 8) {
  const curve = new T.CatmullRomCurve3(path);
  const g = new T.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, n = g.attributes.normal;
  // taper: scale radial offset
  const pts = curve.getSpacedPoints(seg);
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / (radial + 1));
    const t = ring / seg;
    const c = pts[ring];
    const r = r0 + (r1 - r0) * t;
    p.setXYZ(i, c.x + n.getX(i) * r, c.y + n.getY(i) * r, c.z + n.getZ(i) * r);
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.max(r0, 0.05) * 6, uv.getY(i) * curve.getLength() * 2);
  g.computeVertexNormals();
  return g;
}
export const treeLeafMeshes = [];
function buildTree(x, z, { height, trunkR, spread, colorFn, leafCount, seed, lean = 0 }) {
  const rnd = (() => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const parts = [];
  const tips = [];
  function branch(p0, dir, len, r, depth) {
    const pts = [p0.clone()];
    let p = p0.clone(), d = dir.clone();
    for (let i = 0; i < 4; i++) {
      d.add(new T.Vector3((rnd() - 0.5) * 0.35, (rnd() - 0.4) * 0.2, (rnd() - 0.5) * 0.35)).normalize();
      p = p.clone().addScaledVector(d, len / 4);
      pts.push(p);
    }
    parts.push(tube(pts, r, r * 0.6, 6, depth < 2 ? 10 : 6));
    if (depth >= 3 || r < 0.012) { tips.push(p.clone()); return; }
    const nb = depth === 0 ? 5 : 3;
    for (let k = 0; k < nb; k++) {
      const t = 0.45 + 0.55 * (k + 1) / nb;
      const base = pts[Math.min(4, Math.round(t * 4))];
      const nd = d.clone().add(new T.Vector3((rnd() - 0.5) * 1.6, 0.2 + rnd() * 0.5, (rnd() - 0.5) * 1.6)).normalize();
      branch(base, nd, len * (0.55 + rnd() * 0.2), r * 0.55, depth + 1);
    }
    tips.push(p.clone());
  }
  branch(new T.Vector3(x, -0.05, z), new T.Vector3(lean, 1, 0).normalize(), height * 0.5, trunkR, 0);
  const wood = new T.Mesh(mergeGeometries(parts), mats.bark);
  wood.castShadow = true; wood.receiveShadow = true;
  scene.add(wood);
  // foliage: instanced leaves clustered around branch tips
  const geo = new T.PlaneGeometry(1, 1, 2, 2);
  const N = leafCount;
  const cellArr = new Float32Array(N), tintArr = new Float32Array(N * 3), shapeArr = new Float32Array(N * 2);
  const mesh = new T.InstancedMesh(geo, leafMatRef, N);
  const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), pp = new T.Vector3();
  for (let i = 0; i < N; i++) {
    const tp = tips[Math.floor(rnd() * tips.length)];
    const rr = spread * Math.cbrt(rnd());
    const a = rnd() * 6.28, b = Math.acos(2 * rnd() - 1);
    pp.set(tp.x + rr * Math.sin(b) * Math.cos(a), tp.y + rr * Math.cos(b) * 0.7, tp.z + rr * Math.sin(b) * Math.sin(a));
    e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    q.setFromEuler(e);
    const c = colorFn(rnd);
    cellArr[i] = c.cell;
    const sc = c.size * (0.8 + rnd() * 0.4);
    s.set(sc, sc, sc);
    m.compose(pp, q, s);
    mesh.setMatrixAt(i, m);
    const v = 0.85 + rnd() * 0.3;
    tintArr[i * 3] = v; tintArr[i * 3 + 1] = v * (0.95 + rnd() * 0.1); tintArr[i * 3 + 2] = v;
    shapeArr[i * 2] = (rnd() - 0.3) * 0.15; shapeArr[i * 2 + 1] = (rnd() - 0.2) * 0.2;
  }
  geo.setAttribute('aCell', new T.InstancedBufferAttribute(cellArr, 1));
  geo.setAttribute('aTint', new T.InstancedBufferAttribute(tintArr, 3));
  geo.setAttribute('aShape', new T.InstancedBufferAttribute(shapeArr, 2));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  treeLeafMeshes.push(mesh);
  return { wood, mesh, tips };
}

// ------------------------------------------------------------ bench, sign, mats
export const props = {};
function buildBench() {
  const g = new T.Group();
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(boxAt(1.3, 0.035, 0.085, 0, 0.44, -0.15 + i * 0.1, 2));
  for (let i = 0; i < 3; i++) { const b = boxAt(1.3, 0.085, 0.03, 0, 0.6 + i * 0.12, -0.21, 2); parts.push(b); }
  const wood = new T.Mesh(mergeGeometries(parts), mats.wood);
  wood.castShadow = true; wood.receiveShadow = true;
  g.add(wood);
  for (const sx of [-0.55, 0.55]) {
    const legs = [boxAt(0.04, 0.44, 0.04, sx, 0.22, 0.12), boxAt(0.04, 0.85, 0.04, sx, 0.425, -0.2), boxAt(0.04, 0.04, 0.36, sx, 0.4, -0.04), boxAt(0.04, 0.04, 0.3, sx, 0.62, -0.02)];
    const l = new T.Mesh(mergeGeometries(legs), mats.iron);
    l.castShadow = true; g.add(l);
  }
  scene.add(g);
  return g;
}
function signTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const x = c.getContext('2d');
  // slate board with chalk-like painting (no letters)
  const grd = x.createLinearGradient(0, 0, 0, 640); grd.addColorStop(0, '#2c3430'); grd.addColorStop(1, '#232a27');
  x.fillStyle = grd; x.fillRect(0, 0, 512, 640);
  for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; x.fillRect(Math.random() * 512, Math.random() * 640, 2, 2); }
  const chalk = (col, w) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; };
  const leaf = (cx, cy, s, col, rot = 0) => {
    x.save(); x.translate(cx, cy); x.rotate(rot); x.fillStyle = col; x.beginPath();
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.62; x.lineTo(Math.cos(a) * s, Math.sin(a) * s); x.lineTo(Math.cos(a + 0.31) * s * 0.45, Math.sin(a + 0.31) * s * 0.45); }
    x.lineTo(0, s * 0.3); x.closePath(); x.fill(); x.restore();
  };
  const fan = (cx, cy, s, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(cx, cy + s * 0.5); x.arc(cx, cy + s * 0.5, s, -Math.PI * 0.85, -Math.PI * 0.15); x.closePath(); x.fill(); };
  // top: scattered leaves + broom -> heap
  for (let i = 0; i < 9; i++) (i % 2 ? leaf : fan)(60 + Math.random() * 150, 70 + Math.random() * 120, 16, ['#e8b93a', '#d2482a', '#9a6a3a'][i % 3], Math.random() * 6);
  chalk('#efe6d0', 7); x.beginPath(); x.moveTo(250, 60); x.lineTo(200, 200); x.stroke();
  chalk('#d9c08a', 5); for (let k = -4; k <= 4; k++) { x.beginPath(); x.moveTo(200, 200); x.lineTo(185 + k * 9, 245); x.stroke(); }
  chalk('#efe6d0', 6); x.beginPath(); x.moveTo(290, 150); x.lineTo(360, 150); x.moveTo(340, 130); x.lineTo(362, 150); x.lineTo(340, 170); x.stroke();
  for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI, r = Math.random() * 60; (i % 2 ? leaf : fan)(430 + Math.cos(a) * r, 200 - Math.sin(a) * r * 0.7, 14, ['#e8b93a', '#d2482a', '#9a6a3a'][i % 3], Math.random() * 6); }
  // bottom: three sorted heaps by colour
  const heap = (cx, cy, col, kind) => { for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI, r = Math.random() * 45; (kind ? leaf : fan)(cx + Math.cos(a) * r, cy - Math.sin(a) * r * 0.6, 12, col, Math.random() * 6); } };
  heap(100, 480, '#e8b93a', 0); heap(256, 480, '#d2482a', 1); heap(412, 480, '#9a6a3a', 1);
  chalk('#efe6d0', 4); x.beginPath(); x.moveTo(40, 520); x.lineTo(472, 520); x.stroke();
  // little car on clean road
  x.fillStyle = '#efe6d0'; x.fillRect(196, 560, 120, 30); x.fillRect(220, 540, 70, 24);
  x.fillStyle = '#2c3430'; x.beginPath(); x.arc(222, 592, 11, 0, 7); x.arc(292, 592, 11, 0, 7); x.fill();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function buildSign() {
  const g = new T.Group();
  const board = new T.Mesh(new T.PlaneGeometry(0.5, 0.62), new T.MeshStandardMaterial({ map: signTexture(), roughness: 0.92, normalMap: tex('stone_normal.jpg'), normalScale: new T.Vector2(0.4, 0.4) }));
  board.position.set(0, 0.62, 0.035);
  const frame = [];
  frame.push(boxAt(0.6, 0.05, 0.05, 0, 0.95, 0, 2), boxAt(0.6, 0.05, 0.05, 0, 0.29, 0, 2));
  frame.push(boxAt(0.05, 1.0, 0.05, -0.3, 0.5, 0, 2), boxAt(0.05, 1.0, 0.05, 0.3, 0.5, 0, 2));
  const fm = new T.Mesh(mergeGeometries(frame), mats.wood);
  fm.castShadow = true;
  const back = fm.clone(); back.position.z = -0.32; back.rotation.x = 0;
  const af = new T.Group(); af.add(board, fm); af.rotation.x = -0.22;
  const ab = new T.Group(); ab.add(back); ab.rotation.x = 0.22; ab.position.z = 0.3;
  g.add(af, ab);
  scene.add(g);
  return g;
}
function buildMat(x, z, color) {
  const g = new T.Group();
  const geo = new T.CircleGeometry(0.42, 48, 0, Math.PI * 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); p.setZ(i, 0.004 + Math.sin(Math.atan2(p.getY(i), p.getX(i)) * 7) * 0.002 * r); }
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 2.5);
  geo.computeVertexNormals();
  const m = new T.Mesh(geo, mats.burlap);
  m.receiveShadow = true;
  const rope = new T.Mesh(new T.TorusGeometry(0.42, 0.014, 8, 64), mats.burlap);
  rope.rotation.x = Math.PI / 2; rope.position.y = 0.012; rope.castShadow = true;
  g.add(m, rope);
  g.position.set(x, 0.0, z);
  g.scale.setScalar(0.75);
  g.userData.color = color;
  scene.add(g);
  return g;
}

export const world = {};
export function buildWorld(leafMaterial) {
  leafMatRef = leafMaterial;
  makeMats();
  world.hotel = buildHotel();
  // ginkgo (left, yellow) and Japanese maple (right, red)
  world.ginkgo = buildTree(-3.5, -4.8, { height: 9, trunkR: 0.2, spread: 0.9, leafCount: 4200, seed: 11, lean: 0.05,
    colorFn: (r) => ({ cell: r() < 0.5 ? 0 : 3, size: 0.085 }) });
  world.maple = buildTree(4.1, -6.2, { height: 4.6, trunkR: 0.11, spread: 0.75, leafCount: 3600, seed: 23, lean: -0.35,
    colorFn: (r) => ({ cell: r() < 0.7 ? 1 : 4, size: 0.09 }) });
  // more autumn trees beyond the garden walls
  buildTree(-5.2, -1.5, { height: 8, trunkR: 0.18, spread: 1.0, leafCount: 3000, seed: 31, lean: 0.1, colorFn: (r) => ({ cell: r() < 0.5 ? 0 : 3, size: 0.09 }) });
  buildTree(5.3, -2.2, { height: 6.5, trunkR: 0.14, spread: 0.9, leafCount: 2600, seed: 41, lean: -0.1, colorFn: (r) => ({ cell: r() < 0.6 ? 4 : 0, size: 0.09 }) });
  buildTree(4.9, 1.8, { height: 7, trunkR: 0.15, spread: 0.9, leafCount: 2400, seed: 53, lean: -0.15, colorFn: (r) => ({ cell: r() < 0.5 ? 1 : 3, size: 0.09 }) });
  world.bench = buildBench();
  world.bench.position.set(1.45, 0, 0.25); world.bench.rotation.y = -0.5;
  world.sign = buildSign();
  world.sign.position.set(-1.75, 0, -5.9); world.sign.rotation.y = 0.35;
  world.mats = [buildMat(-0.5, -1.25, 0), buildMat(0.5, -1.25, 1), buildMat(0.0, -2.1, 2)];
  world.mats.forEach((m) => m.userData.r = 0.42 * 0.75);
  world.mats.forEach((m) => (m.visible = false));
  // hedge/garden wall at sides (low brick wall with stone coping)
  const sides = [];
  sides.push(boxAt(0.3, 0.75, 4.4, -3.35, 0.375, -1.4), boxAt(0.3, 1.9, 7.6, 3.35, 0.95, -3.0));
  for (const z of [-3.75]) sides.push(boxAt(0.42, 1.3, 0.42, -3.35, 0.65, z, 1.5));
  const sw = new T.Mesh(mergeGeometries(sides), mats.brick); sw.castShadow = true; sw.receiveShadow = true; scene.add(sw);
  const cap = [];
  cap.push(boxAt(0.4, 0.09, 4.5, -3.35, 0.79, -1.4, 1.5), boxAt(0.4, 0.09, 7.7, 3.35, 1.94, -3.0, 1.5));
  const cm = new T.Mesh(mergeGeometries(cap), mats.stone); cm.castShadow = true; cm.receiveShadow = true; scene.add(cm);
  return world;
}
