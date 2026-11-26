// よるの すいそう — night aquarium building.  See NOTES.md.
import * as THREE from './lib/three.module.min.js';
import { pbr, single, setAniso } from './tex.js';
import { TK, U, Sand, Pebbles, Plants, Fish, Particles, Bubbles, Turbidity, makeShafts, makeCausticTexture, makeWaveNormal, underwater, driftwoodGeometry, SPECIES } from './tank.js';
import { Arm, buildGirl, bootPair, sleeveGeometry } from './people.js';
import { Audio } from './audio.js';

const DEBUG = new URLSearchParams(location.search);
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG.has('shot') });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.6;
setAniso(renderer.capabilities.getMaxAnisotropy());
let DPR = Math.min(window.devicePixelRatio || 1, 2);
let dprScale = DPR > 1.5 ? 0.8 : 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d140d);
const camera = new THREE.PerspectiveCamera(36, 1, 0.03, 30);
scene.add(camera);
const audio = new Audio();

// ------------------------------------------------------------------ environment (warm room at night, HDR-ish)
{
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.11, 0.075), side: THREE.BackSide }));
  room.position.y = 1.5; env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.07, 0.04) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; env.add(floor);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.6, 3.0) }));
  lamp.position.set(2.2, 1.5, 0.3); env.add(lamp);
  const cove = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.05, 0.6) }));
  cove.position.set(0, 2.9, -1.0); env.add(cove);
  const tankGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 2.6, 2.6) }));
  tankGlow.position.set(0, 0.8, -3.3); env.add(tankGlow);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.2, 0.15) }));
  win.position.set(-3.45, 1.4, 0); win.rotation.y = Math.PI / 2; env.add(win);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.035).texture;
  scene.environmentIntensity = 0.75;
}

// ------------------------------------------------------------------ helpers
function roundedBox(w, h, d, r, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    const dlt = v.clone().sub(c); if (dlt.lengthSq() > 0) dlt.setLength(r);
    v.copy(c).add(dlt); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// cushion: rounded box with soft puffed faces + seam wrinkles
function cushion(w, h, d, r, puff = 0.012) {
  const g = roundedBox(w, h, d, r, 6);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const fx = 1 - (2 * v.x / w) ** 2, fy = 1 - (2 * v.y / h) ** 2, fz = 1 - (2 * v.z / d) ** 2;
    const k = Math.max(0, fx) * Math.max(0, fz) * Math.sign(v.y) * puff + Math.max(0, fx) * Math.max(0, fy) * Math.sign(v.z) * puff * 0.6;
    const wr = Math.sin(v.x * 40 + v.z * 13) * 0.0015 * (1 - Math.abs(fx));
    p.setXYZ(i, v.x, v.y + k + wr, v.z + (Math.abs(v.z) > d * 0.4 ? Math.sign(v.z) * Math.max(0, fx) * Math.max(0, fy) * puff * 0.6 : 0));
  }
  g.computeVertexNormals();
  return g;
}
const std = (o) => new THREE.MeshStandardMaterial(o);
function mesh(g, m, cast = true, recv = true) { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = recv; return x; }
function boxUV(g, s = 1) { // world-scale box-projected uvs
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------------ materials
const MAT = {
  floor: pbr(std({ color: 0xffffff, roughness: 0.6 }), 'floor', [7, 7]),
  wall: pbr(std({ color: 0xffffff, roughness: 0.9 }), 'plaster', [5, 5]),
  walnut: pbr(std({ color: 0xffffff, roughness: 0.5 }), 'walnut', [1.4, 1.4]),
  linen: pbr(std({ color: 0xffffff, roughness: 0.9 }), 'linen', [2.5, 2.5]),
  rug: pbr(std({ color: 0xffffff, roughness: 1 }), 'rug', [2, 2]),
  metal: pbr(std({ color: 0xffffff, metalness: 1, roughness: 0.4, envMapIntensity: 2.4 }), 'metal', [2, 2], { metal: true }),
  alu: pbr(std({ color: 0xd8dadc, metalness: 1, roughness: 0.35, envMapIntensity: 2.0 }), 'metal', [4, 1], { metal: true, color: false }),
  black: std({ color: 0x1a1a1a, roughness: 0.55 }),
  paint: pbr(std({ color: 0xf2ece2, roughness: 0.7 }), 'plaster', [6, 6], { color: false }),
  terry: pbr(std({ color: 0xffffff, roughness: 1 }), 'terry', [3, 3]),
  enamel: pbr(new THREE.MeshPhysicalMaterial({ color: 0xe9e4da, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }), 'metal', [1, 1], { color: false, metal: false }),
  enamelRim: new THREE.MeshPhysicalMaterial({ color: 0x2f3a46, roughness: 0.3, clearcoat: 0.6 }),
  canGreen: pbr(new THREE.MeshPhysicalMaterial({ color: 0x7f9a86, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 }), 'metal', [2, 2], { color: false }),
  canBlue: pbr(new THREE.MeshPhysicalMaterial({ color: 0x6f8aa3, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 }), 'metal', [2, 2], { color: false }),
  drift: underwater(pbr(std({ color: 0xffffff, roughness: 0.85 }), 'drift', [1, 1]), { wet: true, caustic: 1, key: 'drift' }),
};
MAT.floor.color.setRGB(0.95, 0.9, 0.85);
// People
const skinTone = [0.56, 0.365, 0.27];
function skinMat() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.52, sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color(0.9, 0.45, 0.35), clearcoat: 0.08, clearcoatRoughness: 0.6 });
  single('tex/skin_n.jpg', false, { repeat: [1, 1] }, (t) => { m.normalMap = t; m.normalScale.set(0.35, 0.35); m.needsUpdate = true; });
  // soft wrap lighting: light bleeds a little past the terminator, tinted red (cheap subsurface)
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.10, 0.035, 0.02);`);
  };
  return m;
}
const PM = {
  skin: skinMat(), skinBody: skinMat(),
  hair: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0.5, 0.35, 0.25) }),
  sweater: pbr(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.95, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0.6, 0.55, 0.5) }), 'knit', [1, 1]),
  denim: pbr(std({ color: 0xffffff, roughness: 0.9 }), 'denim', [1, 1]),
  tights: pbr(std({ color: 0x5a4a52, roughness: 0.85 }), 'cotton', [1.5, 1.5], { color: false }),
  boot: pbr(new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.35 }), 'rubber', [1, 1]),
  tie: std({ color: 0x9a5a5a, roughness: 0.8 }),
  momSleeve: pbr(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color(0.5, 0.55, 0.6) }), 'cotton', [1, 1]),
};
pbr(PM.hair, 'hair', [1, 1]);

// ------------------------------------------------------------------ room
const room = new THREE.Group(); scene.add(room);
{
  const floor = mesh(new THREE.PlaneGeometry(8, 8), MAT.floor, false, true);
  floor.rotation.x = -Math.PI / 2; room.add(floor); MAT.floor.userData.mesh = floor;
  const wall = mesh(new THREE.PlaneGeometry(8, 2.6), MAT.wall, false, true); wall.position.set(0, 1.3, -0.27); room.add(wall);
  const wall2 = mesh(new THREE.PlaneGeometry(6, 2.6), MAT.wall, false, true); wall2.position.set(-2.6, 1.3, 2.7); wall2.rotation.y = Math.PI / 2; room.add(wall2);
  const base = mesh(boxUV(roundedBox(8, 0.07, 0.016, 0.004, 1), 2), MAT.paint); base.position.set(0, 0.035, -0.262); room.add(base);
  // cabinet
  const cab = new THREE.Group(); room.add(cab);
  const body = mesh(boxUV(roundedBox(0.9, 0.55, 0.47, 0.008, 2), 1.4), MAT.walnut); body.position.set(0, 0.275, -0.015); cab.add(body);
  const seamM = std({ color: 0x120a06, roughness: 0.9 });
  for (const x of [0]) { const s = mesh(new THREE.BoxGeometry(0.003, 0.47, 0.004), seamM); s.position.set(x, 0.29, 0.2235); cab.add(s); }
  const s2 = mesh(new THREE.BoxGeometry(0.86, 0.003, 0.004), seamM); s2.position.set(0, 0.05, 0.2235); cab.add(s2);
  for (const x of [-0.035, 0.035]) { const k = mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.022, 16), MAT.metal); k.rotation.x = Math.PI / 2; k.position.set(x, 0.33, 0.232); cab.add(k); }
  const plinth = mesh(new THREE.BoxGeometry(0.86, 0.04, 0.43), std({ color: 0x0e0a08, roughness: 0.8 })); plinth.position.set(0, 0.02, -0.02); cab.add(plinth);
  body.position.y = 0.295; body.scale.y = 0.51 / 0.55;
  // foam mat under the tank
  const foam = mesh(new THREE.BoxGeometry(0.6, 0.005, 0.37), std({ color: 0x151515, roughness: 0.95 })); foam.position.set(0, 0.5525, 0); room.add(foam);
  // sofa (left, behind)
  const sofa = new THREE.Group(); sofa.position.set(-1.55, 0, 0.75); sofa.rotation.y = Math.PI / 2 - 0.25; room.add(sofa);
  const sbase = mesh(boxUV(cushion(1.9, 0.26, 0.85, 0.05, 0.004), 2.5), MAT.linen); sbase.position.set(0, 0.25, 0); sofa.add(sbase);
  for (const x of [-0.45, 0.45]) { const c = mesh(boxUV(cushion(0.88, 0.14, 0.7, 0.05, 0.02), 2.5), MAT.linen); c.position.set(x, 0.44, 0.05); sofa.add(c); const b = mesh(boxUV(cushion(0.86, 0.42, 0.18, 0.06, 0.03), 2.5), MAT.linen); b.position.set(x, 0.66, -0.31); b.rotation.x = -0.12; sofa.add(b); }
  for (const x of [-1.0, 1.0]) { const a = mesh(boxUV(cushion(0.16, 0.56, 0.86, 0.06, 0.01), 2.5), MAT.linen); a.position.set(x, 0.4, 0); sofa.add(a); }
  for (const x of [-0.85, 0.85]) for (const z of [-0.33, 0.33]) { const l = mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.12, 12), MAT.walnut); l.position.set(x, 0.06, z); sofa.add(l); }
  const throwM = pbr(new THREE.MeshPhysicalMaterial({ color: 0xc9b49a, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0.8, 0.7, 0.6) }), 'knit', [6, 6], { color: false });
  const thr = mesh(cushion(0.5, 0.05, 0.6, 0.02, 0.015), throwM); thr.position.set(0.55, 0.53, 0.02); thr.rotation.set(0.05, 0.3, 0.04); sofa.add(thr);
  // floor lamp (right, behind)
  const lampG = new THREE.Group(); lampG.position.set(1.05, 0, -0.08); room.add(lampG);
  const lb = mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.025, 40), MAT.metal); lb.position.y = 0.012; lampG.add(lb);
  const lp = mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.38, 16), MAT.metal); lp.position.y = 0.7; lampG.add(lp);
  const shadePts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; shadePts.push(new THREE.Vector2(0.17 + t * 0.06, 1.34 + t * -0.26)); }
  const shadeM = pbr(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, emissive: new THREE.Color(1.0, 0.62, 0.3), emissiveIntensity: 1.6 }), 'linen', [3, 1], { color: false });
  shadeM.color.setRGB(0.95, 0.85, 0.7);
  const shade = mesh(new THREE.LatheGeometry(shadePts, 48), shadeM, false, false); lampG.add(shade);
  const bulbGlow = mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4, 2.2) }), false, false); bulbGlow.position.y = 1.2; lampG.add(bulbGlow);
  // rug in front of the cabinet
  const rug = mesh(boxUV(roundedBox(1.7, 0.012, 1.15, 0.006, 2), 1.2), MAT.rug, false, true); rug.position.set(0.35, 0.006, 1.25); room.add(rug);
  // curtain on the back wall (closed, night)
  const cg = new THREE.PlaneGeometry(1.3, 2.2, 90, 6); const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i); cp.setZ(i, Math.sin(x * 38) * 0.03 + Math.sin(x * 91) * 0.008); }
  cg.computeVertexNormals();
  const curtM = pbr(std({ color: 0xbfae98, roughness: 0.95, side: THREE.DoubleSide }), 'linen', [3, 4], { color: false });
  const curt = mesh(cg, curtM, false, true); curt.position.set(-1.55, 1.2, -0.21); room.add(curt);
}

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight(new THREE.Color(1.0, 0.78, 0.55), new THREE.Color(0.35, 0.22, 0.12), 0.55); scene.add(hemi);
const lampLight = new THREE.SpotLight(new THREE.Color(1.0, 0.7, 0.42), 9, 7, 1.25, 0.9, 2);
lampLight.position.set(1.05, 1.25, -0.08); lampLight.target.position.set(0.1, 0.0, 0.9);
lampLight.castShadow = true; lampLight.shadow.mapSize.set(1024, 1024); lampLight.shadow.bias = -0.0004; lampLight.shadow.normalBias = 0.02; lampLight.shadow.camera.near = 0.1; lampLight.shadow.radius = 4;
scene.add(lampLight, lampLight.target);
const lampUp = new THREE.PointLight(new THREE.Color(1.0, 0.68, 0.4), 1.6, 5, 2); lampUp.position.set(1.05, 1.45, -0.08); scene.add(lampUp);
const tankLight = new THREE.SpotLight(new THREE.Color(0.88, 0.98, 1.0), 0.95, 2.5, 1.05, 0.75, 2);
tankLight.position.set(0, TK.y1 + 0.02, 0.0); tankLight.target.position.set(0, TK.y0, 0);
tankLight.castShadow = true; tankLight.shadow.mapSize.set(1024, 1024); tankLight.shadow.bias = -0.0003; tankLight.shadow.normalBias = 0.006; tankLight.shadow.camera.near = 0.02; tankLight.shadow.camera.far = 1.2;
scene.add(tankLight, tankLight.target);
const spill = new THREE.PointLight(new THREE.Color(0.85, 0.97, 1.0), 0.3, 3, 2); spill.position.set(0, TK.y1 + 0.08, 0.35); scene.add(spill);
const handFill = new THREE.PointLight(new THREE.Color(1.0, 0.85, 0.7), 0.5, 3, 2); camera.add(handFill); handFill.position.set(0.2, 0.15, 0.1);

// ------------------------------------------------------------------ tank
const tank = new THREE.Group(); scene.add(tank);
U.tCaustic.value = makeCausticTexture();
const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 1.5, depthWrite: false, specularIntensity: 1 });
glassM.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
    float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 4.0);
    diffuseColor.a = clamp(0.035 + fr * 0.6, 0.0, 0.8);
    #include <opaque_fragment>`);
};
const edgeM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.42, 0.66, 0.58), roughness: 0.05, transparent: true, opacity: 0.65, depthWrite: false });
const seamGlueM = new THREE.MeshStandardMaterial({ color: 0x223028, roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false });
{
  const g = TK.g, ox = TK.W / 2 + g / 2, oz = TK.D / 2 + g / 2, H = TK.H, yc = TK.y0 + H / 2;
  const pane = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassM); m.position.set(x, y, z); m.renderOrder = 6; tank.add(m); return m; };
  pane(TK.W + 2 * g, H, g, 0, yc, TK.z1 + g / 2);
  pane(TK.W + 2 * g, H, g, 0, yc, TK.z0 - g / 2);
  pane(g, H, TK.D, TK.x0 - g / 2, yc, 0);
  pane(g, H, TK.D, TK.x1 + g / 2, yc, 0);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(TK.W + 2 * g, 0.008, TK.D + 2 * g), edgeM); bottom.position.set(0, TK.y0 - 0.004, 0); bottom.scale.set(1, 1, 1); tank.add(bottom); bottom.material = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.03, 0.045, 0.04), roughness: 0.08, transparent: true, opacity: 0.6, depthWrite: false });
  // green glass edges (top rims + vertical front/back corners)
  const e = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeM); m.position.set(x, y, z); m.renderOrder = 7; tank.add(m); };
  e(TK.W + 2 * g, 0.0015, g, 0, TK.y1, TK.z1 + g / 2); e(TK.W + 2 * g, 0.0015, g, 0, TK.y1, TK.z0 - g / 2);
  e(g, 0.0015, TK.D, TK.x0 - g / 2, TK.y1, 0); e(g, 0.0015, TK.D, TK.x1 + g / 2, TK.y1, 0);
  for (const x of [TK.x0 - g / 2, TK.x1 + g / 2]) for (const z of [TK.z1 + g / 2, TK.z0 - g / 2]) e(g * 1.02, H, g * 1.02, x, yc, z);
  // silicone seams inside the corners
  for (const x of [TK.x0 + 0.002, TK.x1 - 0.002]) for (const z of [TK.z1 - 0.002, TK.z0 + 0.002]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, H, 0.004), seamGlueM); s.position.set(x, yc, z); s.renderOrder = 5; tank.add(s); }
  // LED light bar on top
  const bar = mesh(boxUV(roundedBox(0.64, 0.014, 0.075, 0.005, 2), 3), MAT.alu); bar.position.set(0, TK.y1 + 0.035, 0); tank.add(bar);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 8, 8.5) })); led.rotation.x = Math.PI / 2; led.position.set(0, TK.y1 + 0.0275, 0); tank.add(led);
  for (const x of [TK.x0 - 0.002, TK.x1 + 0.002]) { const leg = mesh(new THREE.BoxGeometry(0.012, 0.035, 0.03), MAT.alu); leg.position.set(x, TK.y1 + 0.016, 0); tank.add(leg); }
  const cable = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0.3, TK.y1 + 0.035, -0.03), V3(0.33, TK.y1 + 0.02, -0.2), V3(0.34, 0.7, -0.24), V3(0.36, 0.3, -0.245)]), 30, 0.0025, 6), MAT.black); tank.add(cable);
  // filter intake pipe in the back corner (clear acrylic)
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, TK.H * 0.95, 14), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false }));
  pipe.position.set(TK.x1 - 0.03, TK.y0 + TK.H * 0.5, TK.z0 + 0.025); pipe.renderOrder = 5; tank.add(pipe);
}
const sandGroup = new THREE.Group(); sandGroup.position.y = TK.y0; tank.add(sandGroup);
const sand = new Sand(sandGroup);
const pebbles = new Pebbles(sandGroup, sand);
const plantGroup = new THREE.Group(); plantGroup.position.y = TK.y0; tank.add(plantGroup);
const plants = new Plants(plantGroup, sand, (url, cb) => single(url, true, { repeat: [1, 1] }, (t) => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; cb(t); }));
const woods = [];
const fish = new Fish(tank, sand, null);
single('tex/scale_n.jpg', false, { repeat: [6, 3] }, (t) => { fish.meshes.forEach(m => { m.material.normalMap = t; m.material.normalScale.set(0.25, 0.25); m.material.needsUpdate = true; }); });
const bubbles = new Bubbles(tank);
const turb = new Turbidity();
const shafts = makeShafts(tank);
const drops = new Particles(scene, 2200); // sand grains, water drops, splashes
// water body
const waterM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0.03, ior: 1.33, thickness: 0.05, attenuationColor: new THREE.Color(0.78, 0.95, 0.92), attenuationDistance: 0.8, specularIntensity: 0.6, envMapIntensity: 0.6, depthWrite: false });
waterM.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { tTurb: U.tTurb, uTank: U.uTank, uTime: U.uTime });
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tTurb; uniform vec4 uTank; uniform float uTime;')
    .replace('#include <opaque_fragment>', `
      {
        vec2 tp = vec2((vWorldPosition.x - uTank.x) / uTank.z, (vWorldPosition.y - uTank.y) / uTank.w);
        float tb = texture2D(tTurb, tp).r * 1.3;
        tb = clamp(tb + (tb > 0.02 ? (fract(sin(dot(floor(tp*vec2(160.0,90.0) + uTime*0.5), vec2(12.9,78.2)))*43758.5)-0.5)*0.05 : 0.0), 0.0, 1.0);
        vec3 milk = vec3(0.62, 0.62, 0.55) * (0.65 + 0.35 * tp.y);
        outgoingLight = mix(outgoingLight, milk, tb * 0.92);
        outgoingLight += vec3(0.0, 0.012, 0.014);
      }
      #include <opaque_fragment>`);
};
waterM.customProgramCacheKey = () => 'water1';
const waterBody = new THREE.Mesh(new THREE.BoxGeometry(TK.W - 0.0005, 1, TK.D - 0.0005), [waterM, waterM, new THREE.MeshBasicMaterial({ visible: false }), waterM, waterM, waterM]);
waterBody.visible = false; tank.add(waterBody);
const waveTex = makeWaveNormal();
waveTex.repeat.set(3, 2);
const surfM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.25, 0.32, 0.32), roughness: 0.03, transparent: true, opacity: 0.2, normalMap: waveTex, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.6, depthWrite: false, specularIntensity: 1 });
surfM.onBeforeCompile = (sh) => {
  sh.uniforms.uMurk = { value: 0 }; surfM.userData.sh = sh;
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uMurk;').replace('#include <opaque_fragment>', `
    float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
    outgoingLight = mix(outgoingLight, vec3(0.5,0.5,0.44), uMurk*0.6);
    diffuseColor.a = clamp(0.04 + fr * 0.5 + uMurk * 0.5, 0.0, 0.9);
    #include <opaque_fragment>`);
};
const surface = new THREE.Mesh(new THREE.PlaneGeometry(TK.W, TK.D), surfM); surface.rotation.x = -Math.PI / 2; surface.visible = false; surface.renderOrder = 2; tank.add(surface);
const menM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.0, 1.0), transparent: true, opacity: 0.55, depthWrite: false });
const meniscus = new THREE.Mesh(new THREE.PlaneGeometry(TK.W, 0.0025), menM); meniscus.position.z = TK.z1 - 0.0005; meniscus.renderOrder = 6; meniscus.visible = false; tank.add(meniscus);
// suspended motes (visible in the light, more while murky)
const motes = (() => {
  const N = 420, p = new Float32Array(N * 3), s = new Float32Array(N);
  for (let i = 0; i < N; i++) { p[i * 3] = rnd(TK.x0, TK.x1); p[i * 3 + 1] = rnd(0, 1); p[i * 3 + 2] = rnd(TK.z0, TK.z1); s[i] = rnd(0.3, 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('sz', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uLevel: U.uLevel, uY0: { value: TK.y0 }, uI: { value: 0 }, uScale: { value: 800 } },
    vertexShader: `attribute float sz; uniform float uTime, uLevel, uY0, uScale; varying float vA;
      void main(){ vec3 q = position; float h = uLevel - uY0; q.y = uY0 + fract(position.y + uTime * 0.004 * (sz-0.6)) * h;
        q.x += sin(uTime*0.3 + position.z*40.0) * 0.01; q.z += cos(uTime*0.25 + position.x*30.0)*0.008;
        vA = sz; vec4 mv = modelViewMatrix * vec4(q,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, 0.0011 * sz * uScale / -mv.z); }`,
    fragmentShader: `uniform float uI; varying float vA; void main(){ vec2 d = gl_PointCoord-0.5; float a = smoothstep(0.25, 0.0, dot(d,d)); gl_FragColor = vec4(vec3(0.95,0.92,0.82) * a * uI * vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4; tank.add(pts); pts.visible = false;
  return pts;
})();

// ------------------------------------------------------------------ floor puddle (wet map painted on the floor) + spill sheets
const WET = { x0: -0.7, x1: 0.7, z0: 0.2, z1: 1.2, NX: 64, NZ: 46 };
WET.v = new Float32Array(WET.NX * WET.NZ); WET.data = new Uint8Array(WET.NX * WET.NZ * 4);
WET.tex = new THREE.DataTexture(WET.data, WET.NX, WET.NZ, THREE.RGBAFormat); WET.tex.magFilter = WET.tex.minFilter = THREE.LinearFilter; WET.tex.needsUpdate = true;
MAT.floor.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { tWet: { value: WET.tex }, uWetR: { value: new THREE.Vector4(WET.x0, WET.z0, WET.x1 - WET.x0, WET.z1 - WET.z0) }, uTime: U.uTime });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;').replace('#include <project_vertex>', '#include <project_vertex>\nvFW = (modelMatrix * vec4(transformed,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; uniform sampler2D tWet; uniform vec4 uWetR; uniform float uTime;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 wuv = (vFW.xz - uWetR.xy) / uWetR.zw;
      float wv = (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) ? texture2D(tWet, wuv).r : 0.0;
      float wn = fract(sin(dot(floor(vFW.xz * 300.0), vec2(12.9898, 78.233))) * 43758.5453);
      float wet = smoothstep(0.12, 0.3, wv + (wn - 0.5) * 0.05);
      float damp = smoothstep(0.02, 0.15, wv);
      diffuseColor.rgb *= mix(1.0, 0.38, max(wet, damp * 0.7));`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.04, wet);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize(mix(normal, nonPerturbedNormal, wet));
      // shallow ripples on the puddle surface
      vec2 rp = vFW.xz * 60.0;
      normal = normalize(normal + wet * 0.025 * vec3(sin(rp.x + uTime * 1.3) + sin(rp.y * 1.3 - uTime), 0.0, cos(rp.y + uTime * 1.1)));`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectSpecular *= 1.0 + wet * 0.8;
      // bright rim where the water edge catches the light
      float rim = smoothstep(0.1, 0.2, wv) * smoothstep(0.34, 0.2, wv);
      reflectedLight.directSpecular += vec3(0.9, 0.95, 1.0) * rim * 0.015;`);
};
MAT.floor.customProgramCacheKey = () => 'floorwet';
const sheetM = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uI: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uTime, uI;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){ float s = n(vec2(vUv.x*40.0, vUv.y*6.0 + uTime*5.0)) * n(vec2(vUv.x*13.0, vUv.y*3.0 + uTime*3.0));
      float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
      gl_FragColor = vec4(vec3(0.9, 0.97, 1.0), clamp((0.05 + s * 0.55) * edge * uI, 0.0, 1.0)); }`,
  transparent: true, depthWrite: false,
});
const sheets = [];
{
  const a = new THREE.Mesh(new THREE.PlaneGeometry(0.42, TK.H + 0.01), sheetM); a.position.set(0.04, TK.y0 + TK.H / 2, TK.z1 + TK.g + 0.0015); a.renderOrder = 8; scene.add(a); sheets.push(a);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.55), sheetM); b.position.set(0.03, 0.275, 0.2245); b.renderOrder = 8; scene.add(b); sheets.push(b);
  sheets.forEach(s => s.visible = false);
}

// ------------------------------------------------------------------ people
const girl = buildGirl(PM); scene.add(girl);
girl.position.set(0.66, 0, 0.36); girl.rotation.y = Math.atan2(-0.6, -0.36);
const floorBoots = bootPair(girl, PM); floorBoots.position.set(0.98, 0, 0.55); floorBoots.rotation.y = 0.6; scene.add(floorBoots);
const arm = new Arm({ scale: 1, tone: skinTone, skinMat: PM.skin, sleeveMat: PM.sweater, rollX: -0.1, sleeveR: [0.034, 0.04], name: 'girlArm' });
scene.add(arm.group);
const momArm = new Arm({ scale: 1.38, tone: [0.6, 0.41, 0.31], skinMat: PM.skin, sleeveMat: PM.momSleeve, rollX: -0.12, sleeveR: [0.029, 0.034], name: 'momArm' });
scene.add(momArm.group);
// build the first hand pose now, the rest when idle
arm.build('point');
const lazyPoses = [['arm', 'grip'], ['arm', 'pinch'], ['arm', 'flat'], ['mom', 'grip']];
function buildLazy() { const j = lazyPoses.shift(); if (!j) return; (j[0] === 'arm' ? arm : momArm).build(j[1]); }

// ------------------------------------------------------------------ tools (in a wooden tray held near the bottom of the view)
const tray = new THREE.Group(); camera.add(tray);
const trayBoard = mesh(boxUV(roundedBox(0.36, 0.012, 0.12, 0.006, 2), 2), MAT.walnut); tray.add(trayBoard);
const trayRim = []; for (const [w, d, x, z] of [[0.36, 0.01, 0, 0.055], [0.36, 0.01, 0, -0.055], [0.01, 0.12, 0.175, 0], [0.01, 0.12, -0.175, 0]]) { const r = mesh(new THREE.BoxGeometry(w, 0.02, d), MAT.walnut); r.position.set(x, 0.012, z); tray.add(r); trayRim.push(r); }
const sandM = pbr(std({ color: 0xffffff, roughness: 0.9 }), 'sand', [0.3, 0.3]);
function cupMesh(fill) {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.026 + 0.008 * t + (i === 12 ? 0.002 : 0), t * 0.05)); }
  pts.push(new THREE.Vector2(0.032, 0.05)); pts.push(new THREE.Vector2(0.03, 0.003));
  const cup = mesh(new THREE.LatheGeometry(pts, 36), MAT.enamel); g.add(cup);
  const rim = mesh(new THREE.TorusGeometry(0.0335, 0.0018, 8, 40), MAT.enamelRim); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; g.add(rim);
  const top = mesh(new THREE.CircleGeometry(0.031, 30), fill === 'sand' ? sandM : sandM); top.rotation.x = -Math.PI / 2; top.position.y = 0.04; g.add(top);
  if (fill === 'pebble') {
    for (let i = 0; i < 9; i++) { const p = mesh(new THREE.IcosahedronGeometry(1, 1), pbr(std({ color: new THREE.Color().setHSL(0.08, 0.1, rnd(0.3, 0.65)) }), 'stone', [1, 1], { color: false })); p.scale.set(rnd(0.006, 0.009), 0.005, rnd(0.006, 0.009)); p.position.set(rnd(-0.018, 0.018), 0.043, rnd(-0.018, 0.018)); g.add(p); }
    top.visible = true;
  }
  g.userData.lip = V3(-0.033, 0.05, 0);
  return g;
}
function canMesh(big = false) {
  const g = new THREE.Group();
  const s = big ? 1.35 : 1;
  const cm = big ? MAT.canBlue : MAT.canGreen;
  const body = mesh(new THREE.LatheGeometry([0.0, 0.05, 0.055, 0.056, 0.055, 0.05, 0.03, 0.0].map((r, i) => new THREE.Vector2(r || 0.001, [0, 0, 0.005, 0.06, 0.1, 0.11, 0.115, 0.115][i])), 40), cm);
  g.add(body);
  const spout = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0.04, 0.02, 0), V3(0.09, 0.07, 0), V3(0.135, 0.12, 0)]), 20, 0.007, 10), cm); g.add(spout);
  const rose = mesh(new THREE.CylinderGeometry(0.016, 0.009, 0.018, 20), MAT.metal); rose.position.set(0.14, 0.126, 0); rose.rotation.z = -0.9; g.add(rose);
  const handle = mesh(new THREE.TorusGeometry(0.045, 0.0055, 10, 30, Math.PI), cm); handle.position.set(-0.01, 0.115, 0); g.add(handle);
  g.scale.setScalar(s);
  g.userData.lip = V3(0.148, 0.132, 0);
  return g;
}
function towelMesh() { const g = new THREE.Group(); const t = mesh(cushion(0.12, 0.03, 0.08, 0.012, 0.006), MAT.terry); g.add(t); g.userData.mat = MAT.terry; return g; }
function bagMesh(k) {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; const r = Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.045 * (1 - 0.65 * Math.max(0, t - 0.6) / 0.4) + 0.004; pts.push(new THREE.Vector2(r, t * 0.12)); }
  const bm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.0 });
  single('tex/metal_n.jpg', false, { repeat: [2, 2] }, (t) => { bm.normalMap = t; bm.normalScale.set(0.8, 0.8); bm.needsUpdate = true; });
  const bag = new THREE.Mesh(new THREE.LatheGeometry(pts, 30), bm); bag.renderOrder = 9; g.add(bag);
  const water = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 14, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.6, 0.8, 0.82), roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }));
  water.position.y = 0.045; water.renderOrder = 8; g.add(water);
  const knot = mesh(new THREE.TorusKnotGeometry(0.006, 0.0025, 30, 6), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.5 })); knot.position.y = 0.122; g.add(knot);
  g.userData.k = k;
  return g;
}
function shellMesh(tint) {
  const g = new THREE.Group();
  const pos = [], col = [], ind = [];
  const NA = 28, NR = 10;
  for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
    const r = i / NR, a = (j / NA - 0.5) * 2.3;
    const R = r * (1 - 0.08 * Math.abs(a)) * 0.026;
    const y = Math.sqrt(Math.max(0, 1 - r * r)) * 0.007 + Math.abs(Math.sin(a * 8)) * 0.0012 * r;
    pos.push(Math.sin(a) * R, y, Math.cos(a) * R - 0.01);
    const band = 0.85 + 0.15 * Math.sin(r * 30);
    col.push(tint[0] * band, tint[1] * band, tint[2] * band);
    if (i < NR && j < NA) { const p = i * (NA + 1) + j; ind.push(p, p + NA + 1, p + 1, p + 1, p + NA + 1, p + NA + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(ind); geo.computeVertexNormals();
  const m = underwater(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(1, 0.9, 0.85) }), { caustic: 1, key: 'shell' });
  g.add(mesh(geo, m));
  return g;
}
function airstoneMesh() {
  const g = new THREE.Group();
  const m = underwater(pbr(std({ color: 0xbfb6ad, roughness: 0.95 }), 'stone', [2, 1], { color: false }), { caustic: 1, key: 'stone2' });
  const s = mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.03, 24), m); s.position.y = 0.015; g.add(s);
  return g;
}
function plantBunchMesh() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(plants.ribbon(0.07), plants.matRibbon); g.add(m);
  const band = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.008, 16), std({ color: 0x8a8f94, metalness: 0.6, roughness: 0.4 })); band.position.y = 0.006; g.add(band);
  return g;
}
const TOOLS = {
  sand: { make: () => cupMesh('sand'), pose: 'grip' },
  pebble: { make: () => cupMesh('pebble'), pose: 'grip' },
  wood: { make: () => { const g = new THREE.Group(); const w = mesh(driftwoodGeometry(7), MAT.drift); w.scale.setScalar(0.45); g.add(w); return g; }, pose: 'grip' },
  plant: { make: plantBunchMesh, pose: 'pinch' },
  can: { make: () => canMesh(false), pose: 'grip' },
  towel: { make: towelMesh, pose: 'flat' },
  bag0: { make: () => bagMesh(0), pose: 'pinch' }, bag1: { make: () => bagMesh(1), pose: 'pinch' }, bag2: { make: () => bagMesh(2), pose: 'pinch' },
  shell: { make: () => shellMesh([0.95, 0.8, 0.72]), pose: 'pinch' },
  stone: { make: airstoneMesh, pose: 'pinch' },
};
for (const k in TOOLS) { const t = TOOLS[k]; t.obj = t.make(); t.obj.traverse(o => { if (o.isMesh) o.castShadow = true; }); t.key = k; t.home = new THREE.Group(); t.home.add(t.obj); }
let trayTools = [];
function setTray(keys) {
  for (const t of trayTools) tray.remove(t.home);
  trayTools = keys.map(k => TOOLS[k]);
  const n = trayTools.length;
  trayTools.forEach((t, i) => {
    t.home.position.set((i - (n - 1) / 2) * (0.32 / Math.max(n, 3)) * (n > 3 ? 1 : 1.1), 0.01, 0);
    t.home.rotation.set(0, 0, 0); t.home.scale.setScalar(t.key === 'can' ? 0.6 : t.key.startsWith('bag') ? 0.7 : t.key === 'wood' ? 0.9 : 1);
    if (!t.inHand) { t.home.add(t.obj); t.obj.position.set(0, 0, 0); t.obj.rotation.set(0, 0, 0); t.obj.scale.setScalar(1); }
    tray.add(t.home);
  });
}

// ------------------------------------------------------------------ sign card: picture rules (no text)
const sign = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 640;
  const x = c.getContext('2d');
  x.fillStyle = '#efe6d4'; x.fillRect(0, 0, 256, 640);
  for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(120,100,70,${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 640, 1, Math.random() * 3); }
  const crayon = (col, pts, w = 5) => { for (let k = 0; k < 4; k++) { x.strokeStyle = col; x.globalAlpha = 0.35; x.lineWidth = w * (0.6 + Math.random() * 0.5); x.lineCap = 'round'; x.beginPath(); pts.forEach(([px, py], i) => { const jx = px + (Math.random() - 0.5) * 3, jy = py + (Math.random() - 0.5) * 3; i ? x.lineTo(jx, jy) : x.moveTo(jx, jy); }); x.stroke(); } x.globalAlpha = 1; };
  const fillScrib = (col, x0, y0, x1, y1, dens = 60) => { for (let i = 0; i < dens; i++) { const a = x0 + Math.random() * (x1 - x0), b = y0 + Math.random() * (y1 - y0); crayon(col, [[a, b], [a + 18 * (Math.random() - 0.5) + 10, b + 6 * (Math.random() - 0.5)]], 4); } };
  const tankAt = (oy) => { crayon('#3e4a52', [[40, oy + 40], [40, oy + 160], [216, oy + 160], [216, oy + 40]], 6); };
  // panel 1: sand + plants
  tankAt(10); fillScrib('#c8a46a', 46, 135, 210, 165, 70); for (const px of [80, 120, 170]) crayon('#4f8a3a', [[px, 150], [px - 6, 110], [px + 4, 80]], 6);
  crayon('#7a5a3a', [[100, 150], [140, 135], [160, 142]], 8);
  // panel 2: watering can + water
  tankAt(220); fillScrib('#c8a46a', 46, 345, 210, 375, 50); fillScrib('#7fb9c4', 46, 280, 210, 345, 90);
  crayon('#8a9096', [[150, 225], [185, 225], [185, 255], [150, 255], [150, 225]], 7); crayon('#8a9096', [[185, 235], [215, 212]], 6);
  for (let i = 0; i < 6; i++) crayon('#6fb0c8', [[205 + i * 2, 220 + i], [195 + i * 3, 262]], 2);
  // panel 3: fish
  tankAt(430); fillScrib('#c8a46a', 46, 555, 210, 585, 50); fillScrib('#9fcdd2', 46, 480, 210, 555, 50);
  const fishD = (fx, fy, col) => { crayon(col, [[fx - 16, fy], [fx, fy - 8], [fx + 14, fy], [fx, fy + 8], [fx - 16, fy]], 6); crayon(col, [[fx - 16, fy], [fx - 26, fy - 8], [fx - 26, fy + 8], [fx - 16, fy]], 5); };
  fishD(100, 500, '#d0632a'); fishD(160, 530, '#3a7fa0'); fishD(120, 540, '#d0632a');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const g = new THREE.Group();
  const frame = mesh(boxUV(roundedBox(0.14, 0.33, 0.014, 0.004, 2), 3), MAT.walnut); g.add(frame);
  const paper = mesh(new THREE.PlaneGeometry(0.12, 0.3), std({ map: tex, roughness: 0.9 })); paper.position.z = 0.0075; g.add(paper);
  scene.add(g);
  return g;
})();

// ------------------------------------------------------------------ post: depth of field + glass corner mirror + tone map
const rtOpts = { type: THREE.HalfFloatType, samples: 4, depthBuffer: true };
let rt = new THREE.WebGLRenderTarget(4, 4, rtOpts);
rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
const post = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uNear: { value: 0.03 }, uFar: { value: 30 },
    uFocus: { value: 1 }, uAp: { value: 0.0 }, uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() }, uViewProj: { value: new THREE.Matrix4() },
    uCam: { value: new THREE.Vector3() }, uTank: { value: new THREE.Vector4(TK.x0, TK.x1, TK.z0, TK.z1) }, uTY: { value: new THREE.Vector2(TK.y0, TK.y1) }, uLevel: U.uLevel, uWater: U.uWater, uFade: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAp, uLevel, uWater, uFade;
    uniform mat4 uInvProj, uInvView, uViewProj; uniform vec3 uCam; uniform vec4 uTank; uniform vec2 uTY;
    float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    vec3 rayDir(vec2 uv){ vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0); p /= p.w; return normalize((uInvView * vec4(p.xyz, 0.0)).xyz); }
    vec3 mirrorSide(vec3 col, vec2 uv, float viewZ){
      vec3 d = rayDir(uv);
      vec3 fwd = normalize((uInvView * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
      for (int s = 0; s < 2; s++) {
        float px = s == 0 ? uTank.x : uTank.y;
        float dir = s == 0 ? -1.0 : 1.0;
        if (d.x * dir <= 0.0 || (uCam.x - px) * dir >= 0.0) continue;
        if (uCam.z < uTank.w) continue;
        float tf = (uTank.w - uCam.z) / d.z; vec3 F = uCam + d * tf;
        if (F.x < uTank.x || F.x > uTank.y) continue;
        float t = (px - uCam.x) / d.x; vec3 H = uCam + d * t;
        if (H.z < uTank.z || H.z > uTank.w || H.y < uTY.x || H.y > uTY.y) continue;
        if (t * dot(d, fwd) > viewZ + 0.002) continue;
        vec3 R = vec3(-d.x, d.y, d.z);
        vec3 Q = H + R * 0.09;
        vec4 c = uViewProj * vec4(Q, 1.0); vec2 q = c.xy / c.w * 0.5 + 0.5;
        if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) continue;
        vec3 m = texture2D(tColor, q).rgb;
        float under = uWater * step(H.y, uLevel);
        float k = mix(0.18, 0.6, under) * smoothstep(0.0, 0.02, H.z - uTank.z);
        col = mix(col, m * vec3(0.86, 0.98, 0.95), k);
        // bright glass edge seen at the corner
        col += vec3(0.05, 0.08, 0.07) * smoothstep(0.004, 0.0, abs(H.z - uTank.w)) ;
      }
      return col;
    }
    void main(){
      float dz = lin(texture2D(tDepth, vUv).r);
      float coc = (dz - uFocus) / dz * uAp;
      coc = coc > 0.0 ? min(coc, 1.0) : max(coc * 0.35, -0.25);
      float rad = abs(coc) * 0.012 * uRes.y;
      vec3 col = texture2D(tColor, vUv).rgb;
      if (rad > 0.6) {
        vec3 acc = col; float wsum = 1.0;
        for (int i = 0; i < 16; i++) {
          float a = float(i) * 2.39996; float r = sqrt((float(i) + 0.5) / 16.0);
          vec2 o = vec2(cos(a), sin(a)) * r * rad / uRes;
          float sd = lin(texture2D(tDepth, vUv + o).r);
          float sc = abs((sd - uFocus) / sd * uAp);
          float w = sd < dz - 0.02 ? smoothstep(0.0, 1.0, sc * 0.012 * uRes.y / max(r * rad, 0.001)) : 1.0;
          acc += texture2D(tColor, vUv + o).rgb * w; wsum += w;
        }
        col = acc / wsum;
      }
      col = mirrorSide(col, vUv, dz);
      vec2 vc = vUv - 0.5; col *= 1.0 - dot(vc, vc) * 0.45;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false,
});
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post); postQuad.frustumCulled = false;
const postScene = new THREE.Scene(); postScene.add(postQuad);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export { THREE, renderer, scene, camera, audio, rnd, clamp, lerp, ease, V3, tank, sand, pebbles, plants, woods, fish, bubbles, turb, shafts, drops, waterBody, surface, surfM, meniscus, motes, WET, sheets, sheetM, girl, floorBoots, arm, momArm, buildLazy, tray, TOOLS, setTray, sign, post, postScene, postCam, MAT, PM, tankLight, lampLight, spill, mesh, driftwoodGeometry, shellMesh, airstoneMesh, canMesh, DEBUG };
export function getRT() { return rt; }
export function resizeRT(w, h) {
  rt.dispose(); rt = new THREE.WebGLRenderTarget(w, h, rtOpts); rt.depthTexture = new THREE.DepthTexture(w, h); rt.depthTexture.type = THREE.UnsignedIntType;
}
export function dpr() { return DPR * dprScale; }
export function setDprScale(s) { dprScale = s; }
import('./game.js');
