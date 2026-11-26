// Texture / mesh loading. Every path used by the game is listed here (TEX_FILES / MESH_FILES)
import * as THREE from '../lib/three.module.min.js';

const BASE = new URL('../', import.meta.url).href;

// textures the opening (room + people) needs before the first frame; the rest stream in
export const FIRST = ['oak_c', 'oak_n', 'oak_orm', 'plaster_c', 'plaster_n', 'plaster_orm', 'paint_c', 'paint_n', 'paint_orm',
  'garden_c', 'linen_c', 'linen_n', 'twill_c', 'twill_n', 'knit_n', 'knit_orm', 'flannel_c', 'flannel_n', 'denim_c', 'denim_n',
  'skin_c', 'skin_n', 'hair_c', 'hair_n', 'moss_dry_c_lo', 'moss_wet_c_lo'];
export const TEX_FILES = [
  'oak_c', 'oak_n', 'oak_orm', 'plaster_c', 'plaster_n', 'plaster_orm', 'paint_c', 'paint_n', 'paint_orm',
  'garden_c', 'linen_c', 'linen_n', 'twill_c', 'twill_n', 'knit_n', 'knit_orm', 'flannel_c', 'flannel_n',
  'denim_c', 'denim_n', 'skin_c', 'skin_n', 'hair_c', 'hair_n',
  'moss_dry_c_lo', 'moss_wet_c_lo',
  // second wave
  'moss_dry_c', 'moss_wet_c', 'moss_n', 'moss_orm', 'strata_c', 'strata_n', 'stone_c', 'stone_n', 'stone_orm',
  'bark_c', 'bark_n', 'metal_n', 'metal_orm', 'ceramic_c', 'ceramic_n', 'siding_c', 'siding_n', 'roof_c', 'roof_n',
  'cork_c', 'cork_n',
];
export const MESH_FILES = ['mesh/people.bin', 'mesh/people.json'];

const loader = new THREE.ImageLoader();
// tiny neutral placeholders so nothing renders black before its real image arrives
const PH = {};
function placeholder(kind) {
  if (PH[kind]) return PH[kind];
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const x = c.getContext('2d');
  x.fillStyle = kind === 'n' ? 'rgb(128,128,255)' : kind === 'orm' ? 'rgb(255,215,0)' : 'rgb(120,104,84)';
  x.fillRect(0, 0, 4, 4);
  PH[kind] = c;
  return c;
}
const cache = new Map();
let maxAniso = 4;
export function setAniso(n) { maxAniso = n; }

// returns a THREE.Texture immediately; image arrives later (texture.userData.ready promise)
export function tex(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (/_c(_lo)?$/.test(name)) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.image = placeholder(/_n$/.test(name) ? 'n' : /_orm$/.test(name) ? 'orm' : 'c');
  t.needsUpdate = true;
  t.userData.ready = new Promise((res) => {
    const src = BASE + 'tex/' + name + '.jpg';
    loader.load(src, (img) => { t.dispose(); t.image = img; t.needsUpdate = true; res(t); }, undefined, () => { console.warn('missing', src); res(t); });
  });
  cache.set(key, t);
  return t;
}

// clone sharing the same image but different repeat
export function texRep(name, rx, ry) {
  const base = tex(name);
  const t = base.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  base.userData.ready.then(() => { t.dispose(); t.image = base.image; t.needsUpdate = true; });
  t.userData.ready = base.userData.ready;
  return t;
}

export function whenAll(list) { return Promise.all(list.map((t) => t.userData.ready)); }

// ------------------------------------------------------------ organic meshes
export async function loadPeople() {
  const [bin, meta] = await Promise.all([
    fetch(BASE + 'mesh/people.bin').then((r) => r.arrayBuffer()),
    fetch(BASE + 'mesh/people.json').then((r) => r.json()),
  ]);
  const out = {};
  for (const [name, e] of Object.entries(meta)) {
    const g = new THREE.BufferGeometry();
    const n = e.count;
    if (e.posq) {
      const q = new Int16Array(bin, e.pos, n * 3), p = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) p[i] = e.posq.o[i % 3] + (q[i] / 32767) * e.posq.s[i % 3];
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    } else g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, e.pos, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, e.nrm, n * 3), 3, true));
    if (e.uvq) {
      const q = new Int16Array(bin, e.uv, n * 2), u = new Float32Array(n * 2);
      for (let i = 0; i < n * 2; i++) u[i] = e.uvq.o[i % 2] + (q[i] / 32767) * e.uvq.s[i % 2];
      g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
    } else g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, e.uv, n * 2), 2));
    const mat = new Uint8Array(bin, e.mat, n);
    const idx = e.i32 ? new Uint32Array(bin, e.index, e.icount) : new Uint16Array(bin, e.index, e.icount);
    // sort triangles into material groups
    const tri = e.icount / 3;
    const byMat = new Map();
    for (let i = 0; i < tri; i++) {
      const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
      let m = mat[a];
      if (mat[b] === mat[c]) m = mat[b];
      if (!byMat.has(m)) byMat.set(m, []);
      byMat.get(m).push(a, b, c);
    }
    const sorted = e.i32 ? new Uint32Array(e.icount) : new Uint16Array(e.icount);
    let o = 0;
    const groups = [];
    for (const [m, arr] of [...byMat.entries()].sort((x, y) => x[0] - y[0])) {
      sorted.set(arr, o);
      groups.push({ start: o, count: arr.length, mat: m });
      o += arr.length;
    }
    g.setIndex(new THREE.BufferAttribute(sorted, 1));
    for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
    if (e.si !== undefined) {
      g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(bin, e.si, n * 4), 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(bin, e.sw, n * 4), 4, true));
    }
    g.computeBoundingSphere();
    out[name] = { geometry: g, bones: e.bones || null };
  }
  return out;
}
