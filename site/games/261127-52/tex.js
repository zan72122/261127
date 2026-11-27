// Texture loading with a priority queue: the first frame renders with flat
// placeholder values, then PBR maps stream in (most visible first).
import * as THREE from './lib/three.module.min.js';

const loader = new THREE.TextureLoader();
const queue = [];
let busy = 0, maxAniso = 4;
export const loaded = new Set();
export function setAniso(a) { maxAniso = Math.min(8, a); }

function load(url, srgb, cb) {
  queue.push({ url, srgb, cb });
  pump();
}
function pump() {
  while (busy < 4 && queue.length) {
    const job = queue.shift(); busy++;
    loader.load(job.url, (t) => {
      busy--; loaded.add(job.url);
      if (job.srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      job.cb(t); pump();
    }, undefined, () => { busy--; console.warn('texture failed', job.url); pump(); });
  }
}
const cache = new Map();
function get(url, srgb, setup, cb) {
  let e = cache.get(url + '|' + JSON.stringify(setup));
  if (!e) {
    e = { tex: null, waiters: [] };
    cache.set(url + '|' + JSON.stringify(setup), e);
    load(url, srgb, (t) => {
      t.wrapS = t.wrapT = setup.mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      t.repeat.set(setup.repeat[0], setup.repeat[1]);
      if (setup.rot) { t.rotation = setup.rot; }
      e.tex = t; e.waiters.forEach(w => w(t)); e.waiters = null;
    });
  }
  if (e.tex) cb(e.tex); else e.waiters.push(cb);
}
// Attach base colour / normal / ORM maps of material `name` to `mat`.
const AVG = { sand: 0xb9a27e, floor: 0x9a6a42, walnut: 0x4a3122, plaster: 0xddd2c2, linen: 0x8a8172, cotton: 0xaab6be, denim: 0x7586a0, knit: 0xc9b9a0, rug: 0xa89884, drift: 0x73583f, metal: 0xaab0b2, terry: 0xd6dfe0, hair: 0x3a281b, rubber: 0x8c6a36, stone: 0xa29789 };
export function pbr(mat, name, repeat = [1, 1], o = {}) {
  const setup = { repeat, mirror: !!o.mirror, rot: o.rot || 0 };
  const base = 'tex/' + name;
  if (o.color !== false) {
    const keep = mat.color.clone();
    if (AVG[name] !== undefined) mat.color.setHex(AVG[name]).multiply(keep);
    get(base + '_c.jpg', true, setup, (t) => { mat.map = t; mat.color.copy(keep); mat.needsUpdate = true; });
  }
  if (o.normal !== false) get(base + '_n.jpg', false, setup, (t) => { mat.normalMap = t; mat.needsUpdate = true; });
  if (o.orm !== false) get(base + '_orm.jpg', false, setup, (t) => {
    mat.roughnessMap = t; if (o.ao !== false) { mat.aoMap = t; mat.aoMapIntensity = o.aoI ?? 1; }
    if (o.metal) mat.metalnessMap = t;
    mat.needsUpdate = true;
  });
  return mat;
}
export function single(url, srgb, setup, cb) { get(url, srgb, { repeat: [1, 1], mirror: false, ...setup }, cb); }
export function pending() { return queue.length + busy; }
