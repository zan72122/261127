// Umbrella-thorn acacias, distant hills and tree lines.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { mulberry } from './giraffe.js';

function leafTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 128, 128);
  const r = mulberry(11);
  // twigs with tiny bipinnate leaflets
  for (let k = 0; k < 7; k++) {
    const x0 = 20 + r() * 88, y0 = 20 + r() * 88, a = r() * Math.PI * 2;
    c.strokeStyle = 'rgba(70,60,40,1)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * 30, y0 + Math.sin(a) * 30); c.stroke();
    for (let i = 0; i < 26; i++) {
      const t = i / 26, x = x0 + Math.cos(a) * 30 * t, y = y0 + Math.sin(a) * 30 * t;
      for (const s of [-1, 1]) {
        const g = 120 + r() * 50;
        c.fillStyle = `rgb(${Math.round(g * 0.62)},${Math.round(g * 0.78)},${Math.round(g * 0.42)})`;
        c.beginPath(); c.ellipse(x + Math.cos(a + s * 1.4) * 5, y + Math.sin(a + s * 1.4) * 5, 3.4, 1.6, a + s * 1.4, 0, Math.PI * 2); c.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let LEAF = null;
function leafMats() {
  if (LEAF) return LEAF;
  const map = leafTexture();
  const mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xe6edc0, emissive: 0x0c1206 });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45, side: THREE.DoubleSide });
  const bark = new THREE.MeshLambertMaterial({ color: 0x5c4c3e });
  bark.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.7 + 0.5*vnoise(vP*vec3(30.0,4.0,30.0));');
  };
  LEAF = { mat, depth, bark };
  return LEAF;
}

export function makeAcacia(seed, scale = 1) {
  const r = mulberry(seed);
  const M = leafMats();
  const grp = new THREE.Group();
  const H = (5.2 + r() * 1.6) * scale, crownR = (3.0 + r() * 1.3) * scale;
  const fork = H * (0.32 + r() * 0.12);
  const parts = [];
  const cyl = (a, b, r0, r1) => {
    const d = b.clone().sub(a); const L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, 7, 1);
    g.translate(0, L / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
    parts.push(g);
  };
  const lean = new THREE.Vector3((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize();
  const top = lean.clone().multiplyScalar(fork);
  cyl(new THREE.Vector3(0, -0.2, 0), top, 0.22 * scale, 0.16 * scale);
  const tips = [];
  const nb = 4 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const a = i / nb * Math.PI * 2 + r() * 0.6;
    const out = crownR * (0.45 + r() * 0.45);
    const tip = new THREE.Vector3(Math.cos(a) * out, H - 0.4 * scale - r() * 0.8 * scale, Math.sin(a) * out);
    const mid = top.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.3 * scale, 0));
    cyl(top, mid, 0.13 * scale, 0.09 * scale); cyl(mid, tip, 0.09 * scale, 0.04 * scale);
    tips.push(tip);
  }
  const trunk = new THREE.Mesh(mergeGeoms(parts), M.bark);
  trunk.castShadow = true; trunk.receiveShadow = true; grp.add(trunk);
  // flat-topped crown: leaf cards in a thin layer, denser on top
  const cards = [];
  const nCards = Math.round(520 * scale * scale + 200);
  for (let i = 0; i < nCards; i++) {
    const t = tips[i % tips.length];
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * crownR * 0.75;
    const c = new THREE.Vector3(t.x * 0.55 + Math.cos(a) * d, H - r() * 0.9 * scale * (0.4 + 0.6 * d / crownR), t.z * 0.55 + Math.sin(a) * d);
    if (Math.hypot(c.x, c.z) > crownR * 1.05) continue;
    const s = (0.75 + r() * 0.6) * scale;
    const g = new THREE.PlaneGeometry(s, s);
    g.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.9); g.rotateY(r() * Math.PI * 2); g.translate(c.x, c.y, c.z);
    cards.push(g);
  }
  const cg = mergeGeoms(cards);
  // soft volume lighting for the crown: normals point away from the crown centre, biased upward
  const P = cg.attributes.position, Nn = cg.attributes.normal; const cy = H - 0.5 * scale;
  for (let i = 0; i < P.count; i++) { const v = new THREE.Vector3(P.getX(i), (P.getY(i) - cy) * 2.5 + 0.8, P.getZ(i)).normalize(); Nn.setXYZ(i, v.x, v.y, v.z); }
  const crown = new THREE.Mesh(cg, M.mat);
  crown.customDepthMaterial = M.depth;
  crown.castShadow = true; crown.receiveShadow = true;
  grp.add(crown);
  grp.userData = { H, crownR };
  return grp;
}

export function mergeGeoms(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) nrm.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; io += g.index.count; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export function makeHills() {
  const N = 256, pos = [], idx = [];
  const r = mulberry(5);
  const ph = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2;
    const h = 6 + 9 * Math.max(0, Math.sin(a * 3 + ph[0])) + 5 * Math.sin(a * 7 + ph[1]) * 0.5 + 3 * Math.sin(a * 17 + ph[2]) * 0.4;
    const R = 360;
    pos.push(Math.cos(a) * R, -2, Math.sin(a) * R, Math.cos(a) * R, Math.max(2, h), Math.sin(a) * R);
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x5a5a5e, side: THREE.DoubleSide, fog: true });
  const m = new THREE.Mesh(g, mat);
  return m;
}
