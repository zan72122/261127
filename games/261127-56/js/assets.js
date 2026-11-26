// テクスチャと素材。最初は小さな手続きノイズで描き、重い写真風テクスチャは後から差し替える。
import * as THREE from 'three';

const TEX_DIR = './tex/';
export const texList = ['floor', 'wall', 'board', 'brick', 'iron', 'steel', 'alu', 'knit', 'linen', 'flannel', 'cord', 'skin', 'hair', 'grain', 'plaster'];
const cache = {};
const pending = [];

// 仮テクスチャ（ノイズ）：単色ベタにならないように
function noiseCanvas(size, base, amp, kind) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const im = g.createImageData(size, size);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const n = (rnd() - 0.5) * amp;
    if (kind === 'n') { im.data[i * 4] = 128 + n * 40; im.data[i * 4 + 1] = 128 + (rnd() - 0.5) * amp * 40; im.data[i * 4 + 2] = 255; }
    else if (kind === 'm') { im.data[i * 4] = 255; im.data[i * 4 + 1] = base[1] + n * 30; im.data[i * 4 + 2] = base[2]; }
    else { im.data[i * 4] = base[0] * (1 + n); im.data[i * 4 + 1] = base[1] * (1 + n); im.data[i * 4 + 2] = base[2] * (1 + n); }
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}
const PH = {
  floor: [130, 92, 60], wall: [190, 150, 108], board: [170, 128, 88], brick: [140, 74, 52], iron: [40, 38, 36], steel: [170, 170, 168], alu: [160, 160, 158],
  knit: [232, 228, 220], linen: [196, 182, 156], flannel: [92, 70, 72], cord: [110, 74, 58], skin: [236, 188, 160], hair: [52, 34, 24], grain: [235, 232, 228], plaster: [214, 206, 192],
};

export function tex(name, kind, opts = {}) {
  // kind: 'c' 色, 'n' 法線, 'm' ORM
  const key = name + '_' + kind;
  let base = cache[key];
  if (!base) {
    const ph = PH[name] || [128, 128, 128];
    const cv = noiseCanvas(64, kind === 'm' ? [255, 220, 0] : ph, kind === 'c' ? 0.12 : 0.3, kind);
    base = new THREE.Texture(cv);
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.colorSpace = kind === 'c' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    base.anisotropy = 4;
    base.needsUpdate = true;
    cache[key] = base;
    pending.push({ key, url: TEX_DIR + key + '.jpg', tex: base });
  }
  if (!opts.repeat && !opts.offset) return base;
  const t = base.clone();
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.offset) t.offset.set(opts.offset[0], opts.offset[1]);
  t.needsUpdate = true;
  (base.userData.clones ||= []).push(t);
  return t;
}

// 後読み：1枚ずつデコードして差し替える（最初の画面を止めない）
export async function loadDeferred(onProgress) {
  let done = 0;
  const total = pending.length;
  const jobs = pending.splice(0);
  const loadOne = (job) => new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const apply = () => {
        job.tex.dispose(); job.tex.image = img; job.tex.needsUpdate = true;
        for (const c of job.tex.userData.clones || []) { c.dispose(); c.image = img; c.needsUpdate = true; }
        res(true);
      };
      if (img.decode) img.decode().then(apply, apply); else apply();
    };
    img.onerror = () => { console.warn('texture missing', job.url); res(false); };
    img.src = job.url;
  });
  const par = 3;
  let idx = 0;
  const worker = async () => {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      await loadOne(j);
      done++; onProgress && onProgress(done / total);
    }
  };
  await Promise.all(Array.from({ length: par }, worker));
}

export function loadImageTexture(url, srgb = true) {
  const t = new THREE.Texture();
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const img = new Image();
  img.onload = () => { t.image = img; t.needsUpdate = true; };
  img.src = url;
  return t;
}

// UV を持つ普通のメッシュ用 PBR 素材
export function pbr(name, o = {}) {
  const rep = o.repeat || [1, 1];
  const M = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({
    color: o.color !== undefined ? o.color : 0xffffff,
    map: tex(name, 'c', { repeat: rep, offset: o.offset }),
    normalMap: tex(name, 'n', { repeat: rep, offset: o.offset }),
    roughnessMap: tex(name, 'm', { repeat: rep, offset: o.offset }),
    aoMap: tex(name, 'm', { repeat: rep, offset: o.offset }),
    metalnessMap: o.metal ? tex(name, 'm', { repeat: rep, offset: o.offset }) : null,
    roughness: o.roughness !== undefined ? o.roughness : 1,
    metalness: o.metal ? 1 : 0,
    aoMapIntensity: o.ao !== undefined ? o.ao : 1,
    normalScale: new THREE.Vector2(o.ns || 1, o.ns || 1),
    envMapIntensity: o.env !== undefined ? o.env : 1,
    side: o.side || THREE.FrontSide,
  });
  if (o.physical) Object.assign(m, o.phys || {});
  return m;
}

// UV を持たない SDF メッシュ用：三方向投影（triplanar）で色・法線・粗さ・AO を貼る
export function triplanar(name, o = {}) {
  const M = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({ color: o.color !== undefined ? o.color : 0xffffff, roughness: o.roughness !== undefined ? o.roughness : 1, metalness: 0, vertexColors: true, envMapIntensity: o.env || 1 });
  if (o.physical) Object.assign(m, o.phys || {});
  const uni = {
    uTriMap: { value: tex(name, 'c') }, uTriNor: { value: tex(name, 'n') }, uTriOrm: { value: tex(name, 'm') },
    uTriScale: { value: o.scale || 10 }, uTriNS: { value: o.ns || 1 }, uTriTint: { value: new THREE.Color(o.tint || 0xffffff) },
    uClay: { value: 0 }, uClayCol: { value: new THREE.Color(0x5a3a26) },
  };
  m.userData.tri = uni;
  const clayCode = o.clay ? `
    // 指先に付いた泥（泥の量 uClay に応じて広がる）
    float cz = vTriObj.z * ${o.clayAxis || '1.0'};
    float cn = triTex(uTriOrm, vTriP * 1.7, triW).g;
    float clayMask = smoothstep(0.0, 0.25, uClay * 1.3 - (1.0 - smoothstep(${o.clayZ0 || '0.04'}, ${o.clayZ1 || '0.11'}, cz)) - cn * 0.35);
    clayMask = clamp(clayMask, 0.0, 1.0);
  ` : `float clayMask = 0.0;`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTriP; varying vec3 vTriN; varying vec3 vTriObj; varying vec3 vAx; varying vec3 vAy; varying vec3 vAz; uniform float uTriScale;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTriP = position * uTriScale; vTriN = normal; vTriObj = position;
        vAx = normalMatrix * vec3(1.0,0.0,0.0); vAy = normalMatrix * vec3(0.0,1.0,0.0); vAz = normalMatrix * vec3(0.0,0.0,1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTriP; varying vec3 vTriN; varying vec3 vTriObj; varying vec3 vAx; varying vec3 vAy; varying vec3 vAz;
        uniform sampler2D uTriMap; uniform sampler2D uTriNor; uniform sampler2D uTriOrm; uniform float uTriNS; uniform vec3 uTriTint;
        uniform float uClay; uniform vec3 uClayCol;
        vec4 triTex(sampler2D t, vec3 p, vec3 w){ return texture2D(t,p.zy)*w.x + texture2D(t,p.xz)*w.y + texture2D(t,p.xy)*w.z; }`)
      .replace('#include <map_fragment>', `
        vec3 triN0 = normalize(vTriN);
        vec3 triW = pow(abs(triN0), vec3(4.0)); triW /= (triW.x + triW.y + triW.z);
        vec4 triC = triTex(uTriMap, vTriP, triW);
        vec4 triM = triTex(uTriOrm, vTriP, triW);
        ${clayCode}
        diffuseColor.rgb *= triC.rgb * uTriTint;
        diffuseColor.rgb = mix(diffuseColor.rgb, uClayCol * (0.85 + 0.3 * triC.r), clayMask);`)
      .replace('#include <color_fragment>', `float vAO = 1.0;
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          vAO = vColor.r;
        #endif`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * triM.g; roughnessFactor = mix(roughnessFactor, 0.28, clayMask);`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 tx = texture2D(uTriNor, vTriP.zy).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(uTriNor, vTriP.xz).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(uTriNor, vTriP.xy).xyz * 2.0 - 1.0;
          float ns = uTriNS * (1.0 - clayMask * 0.6);
          tx.xy *= ns; ty.xy *= ns; tz.xy *= ns;
          tx = vec3(tx.xy + triN0.zy, abs(tx.z) * triN0.x);
          ty = vec3(ty.xy + triN0.xz, abs(ty.z) * triN0.y);
          tz = vec3(tz.xy + triN0.xy, abs(tz.z) * triN0.z);
          vec3 on = normalize(tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z);
          normal = normalize(on.x * vAx + on.y * vAy + on.z * vAz);
        }`)
      .replace('#include <aomap_fragment>', `
        float triAO = triM.r * vAO;
        reflectedLight.indirectDiffuse *= triAO;
        reflectedLight.directDiffuse *= mix(1.0, vAO, 0.6);
        reflectedLight.indirectSpecular *= mix(1.0, triAO, 0.7);`);
  };
  m.customProgramCacheKey = () => 'tri_' + (o.clay ? 'c' : '') + (o.physical ? 'p' : '');
  return m;
}

// SDF メッシュパック読み込み
export async function loadPack(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('pack ' + url);
  const buf = await r.arrayBuffer();
  const dv = new DataView(buf);
  const hl = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl;
  const out = { parts: header.parts || {}, meshes: [] };
  for (const m of header.meshes) {
    const qp = new Int16Array(buf, base + m.p, m.nv * 3);
    const pos = new Float32Array(m.nv * 3);
    for (let v = 0; v < m.nv; v++) for (let c = 0; c < 3; c++) {
      pos[v * 3 + c] = m.bmin[c] + (qp[v * 3 + c] + 32767) / 65534 * (m.bmax[c] - m.bmin[c]);
    }
    const qn = new Int8Array(buf, base + m.n, m.nv * 3);
    const nor = new Float32Array(m.nv * 3);
    for (let i = 0; i < m.nv * 3; i++) nor[i] = qn[i] / 127;
    const qa = new Uint8Array(buf, base + m.a, m.nv);
    const col = new Uint8Array(m.nv * 3);
    for (let v = 0; v < m.nv; v++) col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = qa[v];
    const idx = m.i32 ? new Uint32Array(buf.slice(base + m.i, base + m.i + m.ni * 4)) : new Uint16Array(buf.slice(base + m.i, base + m.i + m.ni * 2));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    out.meshes.push({ name: m.name, part: m.part, mat: m.mat, geo: g });
  }
  return out;
}
