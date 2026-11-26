// テクスチャの遅延読み込み。読み込むまでは平均色の1画素テクスチャで描く。
import * as THREE from '../lib/three.module.min.js';

const BASE = new URL('../tex/', import.meta.url).href;
export const TEX_FILES = new Set(); // 参照したファイル名（確認用）
const cache = new Map();
const queue = [];
let active = 0, maxAniso = 4;
export function setAniso(a) { maxAniso = a; }
const loader = new THREE.ImageBitmapLoader();
loader.setOptions({ imageOrientation: 'flipY' });

function solid(color) {
  const c = new THREE.Color(color);
  const d = new Uint8Array([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255]);
  const t = new THREE.DataTexture(d, 1, 1); t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// name: 'board_c' など（拡張子なし）。cb(texture) は読み込み後に呼ばれる（同名は共有）
export function tex(name, srgb, cb, opts = {}) {
  const file = name + (name === 'backdrop' ? '.jpg' : '.jpg');
  TEX_FILES.add(file);
  let e = cache.get(name);
  if (opts.color && cb) cb(solid(opts.color));
  if (e) { if (e.tex) cb && cb(e.tex); else cb && e.cbs.push(cb); return; }
  e = { tex: null, cbs: cb ? [cb] : [], srgb, opts, file, pri: opts.pri || 0 };
  cache.set(name, e);
  queue.push(e);
  queue.sort((a, b) => b.pri - a.pri);
  pump();
}
function pump() {
  while (active < 4 && queue.length) {
    const e = queue.shift(); active++;
    loader.load(BASE + e.file, (bmp) => {
      const t = new THREE.Texture(bmp);
      t.flipY = false;
      t.colorSpace = e.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      if (e.opts.repeat) t.repeat.set(e.opts.repeat[0], e.opts.repeat[1]);
      t.needsUpdate = true;
      e.tex = t;
      for (const cb of e.cbs) cb(t);
      e.cbs.length = 0;
      active--; pump();
    }, undefined, () => { console.warn('tex fail', e.file); active--; pump(); });
  }
}
export function pending() { return queue.length + active; }
