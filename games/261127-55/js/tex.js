// テクスチャ読み込み：まず中立の 1x1 で描き、読み込めたら同じ Texture に画像を差し込む
import * as THREE from '../lib/three.module.min.js';

const BASE = new URL('../tex/', import.meta.url).href;
const cache = new Map();
const queue = { core: [], late: [] };
let lateStarted = false;
let maxAniso = 4;
export function setAniso(n) { maxAniso = Math.min(8, n); }

function neutral(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const g = c.getContext('2d');
  g.fillStyle = kind === 'nrm' ? 'rgb(128,128,255)' : kind === 'orm' ? 'rgb(255,220,0)' : kind === 'alpha' ? 'rgba(0,0,0,0)' : 'rgb(150,150,150)';
  g.fillRect(0, 0, 1, 1);
  return c;
}

// name: ファイル名, opt: {srgb, rep:[x,y], late, kind}
export function tex(name, opt = {}) {
  const key = name + '|' + (opt.rep ? opt.rep.join(',') : '');
  if (cache.has(key)) return cache.get(key);
  const kind = opt.kind || (name.includes('_nrm') ? 'nrm' : name.includes('_orm') ? 'orm' : name.endsWith('.png') ? 'alpha' : 'col');
  const t = new THREE.Texture(neutral(kind));
  t.colorSpace = opt.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = opt.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (opt.rep) t.repeat.set(opt.rep[0], opt.rep[1]);
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  cache.set(key, t);
  if (lateStarted) apply([{ name, t }]); // 遊んでいる途中で初めて要った物はすぐ読む
  else (opt.late ? queue.late : queue.core).push({ name, t });
  return t;
}

const loaded = new Map(); // name -> Promise<Image>
function loadImg(name) {
  if (loaded.has(name)) return loaded.get(name);
  const p = new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => { console.warn('tex missing', name); res(null); };
    im.src = BASE + name;
  });
  loaded.set(name, p);
  return p;
}

function apply(list) {
  return Promise.all(list.map(({ name, t }) => loadImg(name).then((im) => {
    if (!im) return;
    // 1x1 の仮画像がもう GPU に載っていたら作り直す（大きさが変わるため）
    t.dispose(); t.image = im; t.anisotropy = maxAniso; t.needsUpdate = true;
  })));
}

export function loadCore() { const l = queue.core.splice(0); return apply(l); }
export function loadLate() { lateStarted = true; const l = queue.late.concat(queue.core); queue.late = []; queue.core = []; return apply(l); }
export function allNames() { return [...new Set([...cache.keys()].map((k) => k.split('|')[0]))]; }

// PBR セット
export function pbr(base, opt = {}) {
  const o = { rep: opt.rep, late: opt.late };
  const r = {};
  if (opt.col !== false) r.map = tex(base + '_col.jpg', { ...o, srgb: true });
  if (opt.nrm !== false) r.normalMap = tex(base + '_nrm.jpg', o);
  if (opt.orm) { const t = tex(base + '_orm.jpg', o); r.aoMap = t; r.roughnessMap = t; if (opt.metal) r.metalnessMap = t; }
  return r;
}
