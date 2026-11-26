// Renderer, post pipeline (DOF + ACES + grain), asset loading, material helpers.
import * as THREE from 'three';

export const T = THREE;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ renderer
export const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xdddddd);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 40);
camera.filmGauge = 35;

let quality = 1.0;
const isMobile = /iPhone|iPad|Android|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
export const view = { w: 1, h: 1, dpr: 1, portrait: false };

let rt = null;
function makeRT(w, h) {
  if (rt) { rt.dispose(); rt.depthTexture.dispose(); }
  const depth = new THREE.DepthTexture(w, h);
  depth.type = THREE.UnsignedIntType;
  rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, samples: 4, depthTexture: depth, depthBuffer: true,
  });
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;
}

const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null }, tDepth: { value: null },
    uNear: { value: 0.02 }, uFar: { value: 40 }, uFocus: { value: 1 }, uAperture: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uFade: { value: 0 },
    uLens: { value: new THREE.Vector4(0.5, 0.5, 0, 2.2) }, uLensAspect: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tColor; uniform sampler2D tDepth;
    uniform float uNear, uFar, uFocus, uAperture, uTime, uFade, uLensAspect;
    uniform vec2 uRes; uniform vec4 uLens;
    varying vec2 vUv;
    float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    float coc(float z){ return clamp(abs(z - uFocus) / max(z, 0.001) * uAperture, 0.0, 1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // magnifier lens: zoom inside a circle
      vec2 ld = (uv - uLens.xy) * vec2(uLensAspect, 1.0);
      float lr = length(ld);
      float inLens = uLens.z > 0.001 ? smoothstep(uLens.z, uLens.z - 0.004, lr) : 0.0;
      if (inLens > 0.0) {
        float k = 1.0 / uLens.w;
        float barrel = 1.0 - 0.18 * pow(lr / uLens.z, 2.0);
        uv = mix(uv, uLens.xy + (uv - uLens.xy) * k * barrel, inLens);
      }
      float z = lin(texture2D(tDepth, uv).x);
      float c0 = coc(z);
      vec3 col = texture2D(tColor, uv).rgb;
      float maxPx = 7.0;
      if (c0 * maxPx > 0.6 && inLens < 0.5) {
        vec3 acc = col; float wsum = 1.0;
        vec2 px = 1.0 / uRes;
        float ang = hash(uv * uRes) * 6.2831;
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float r = sqrt((fi + 0.5) / 12.0);
          float a = ang + fi * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * r * c0 * maxPx * px;
          float zs = lin(texture2D(tDepth, uv + o).x);
          float cs = coc(zs);
          float w = (zs < z) ? cs : 1.0;
          acc += texture2D(tColor, uv + o).rgb * w; wsum += w;
        }
        col = acc / wsum;
      }
      // subtle vignette
      vec2 q = vUv - 0.5;
      col *= 1.0 - dot(q, q) * 0.35;
      // lens rim + glass tint
      if (uLens.z > 0.001) {
        float rim = smoothstep(uLens.z - 0.012, uLens.z, lr) * smoothstep(uLens.z + 0.02, uLens.z + 0.006, lr);
        col = mix(col, vec3(0.55, 0.42, 0.22) * (0.6 + 0.6 * (0.5 - ld.y / uLens.z * 0.5)), rim);
        col += inLens * 0.06 * smoothstep(uLens.z, 0.0, length(ld - vec2(-0.3, 0.3) * uLens.z));
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      float g = hash(vUv * uRes + fract(uTime) * 91.7) - 0.5;
      gl_FragColor.rgb += g * 0.018;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.94, 0.93, 0.9), uFade);
    }`,
  depthTest: false, depthWrite: false,
});
postMat.toneMapped = true;
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
postQuad.frustumCulled = false;
postScene.add(postQuad);
export const post = postMat.uniforms;

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dprMax = isMobile ? 2.0 : 1.5;
  const dpr = Math.min(window.devicePixelRatio || 1, dprMax) * quality;
  view.w = w; view.h = h; view.dpr = dpr; view.portrait = h > w;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, true);
  const rw = Math.max(1, Math.floor(w * dpr)), rh = Math.max(1, Math.floor(h * dpr));
  makeRT(rw, rh);
  post.uRes.value.set(rw, rh);
  post.uLensAspect.value = w / h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function setQuality(q) { quality = q; resize(); }
export function getQuality() { return quality; }

export function render(time) {
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  post.tColor.value = rt.texture;
  post.tDepth.value = rt.depthTexture;
  post.uNear.value = camera.near; post.uFar.value = camera.far;
  post.uTime.value = time;
  renderer.render(postScene, postCam);
}

// ------------------------------------------------------------ texture loading
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
const pendingHi = [];
export const BASE = './';

export function tex(name, { srgb = false, repeat = true, lo = true } = {}) {
  const key = name;
  if (texCache.has(key)) return texCache.get(key);
  const t = new THREE.Texture();
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  const hiUrl = `${BASE}tex/${name}.jpg`;
  const loUrl = `${BASE}tex/${name}_lo.jpg`;
  if (lo) {
    texLoader.load(loUrl, (lt) => { if (!t.userData.hi) { t.dispose(); t.image = lt.image; t.needsUpdate = true; } });
    pendingHi.push(() => texLoader.load(hiUrl, (ht) => { t.dispose(); t.image = ht.image; t.userData.hi = true; t.needsUpdate = true; }));
  } else {
    texLoader.load(hiUrl, (ht) => { t.image = ht.image; t.userData.hi = true; t.needsUpdate = true; });
  }
  return t;
}

export function png(name, { repeat = false } = {}) {
  const key = 'png:' + name;
  if (texCache.has(key)) return texCache.get(key);
  const t = texLoader.load(`${BASE}tex/${name}.png`);
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

export function loadHiTextures() {
  // stream the full-size textures a few at a time after the first frame
  let i = 0;
  const step = () => {
    for (let k = 0; k < 3 && i < pendingHi.length; k++, i++) pendingHi[i]();
    if (i < pendingHi.length) setTimeout(step, 120);
  };
  step();
}

// ------------------------------------------------------------- mesh loading
function srgbToLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const LUT = new Float32Array(256).map((_, i) => srgbToLin(i / 255));

export async function loadMeshPack(name) {
  const buf = await (await fetch(`${BASE}mesh/${name}.bin`)).arrayBuffer();
  const dv = new DataView(buf);
  const hl = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl;
  const out = {};
  for (const e of header) {
    const q = new Uint16Array(buf, base + e.pos, e.nv * 3);
    const pos = new Float32Array(e.nv * 3);
    for (let i = 0; i < e.nv; i++) for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = e.lo[k] + (q[i * 3 + k] / 65535) * (e.hi[k] - e.lo[k]);
    }
    const nrm = new Int16Array(buf, base + e.nrm, e.nv * 3);
    const col8 = new Uint8Array(buf, base + e.col, e.nv * 3);
    const col = new Float32Array(e.nv * 3);
    for (let i = 0; i < col.length; i++) col[i] = LUT[col8[i]];
    const ext = new Uint8Array(buf, base + e.ext, e.nv * 2);
    const idx = e.i32 ? new Uint32Array(buf, base + e.idx, e.ni) : new Uint16Array(buf, base + e.idx, e.ni);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(nrm), 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aExt', new THREE.BufferAttribute(new Uint8Array(ext), 2, true));
    g.setIndex(new THREE.BufferAttribute(e.i32 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    g.userData.origin = e.origin;
    out[e.name] = g;
  }
  return out;
}

// ---------------------------------------------------------- material helpers
export function pbr(name, o = {}) {
  const P = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new P({
    map: tex(name + '_c', { srgb: true }),
    normalMap: tex(name + '_n'),
    roughnessMap: tex(name + '_m'),
    aoMap: tex(name + '_m'),
    roughness: o.roughness ?? 1,
    metalness: o.metal ? 1 : 0,
    color: o.color ?? 0xffffff,
    envMapIntensity: o.env ?? 1,
    side: o.side ?? THREE.FrontSide,
    ...(o.physical || {}),
  });
  if (o.metal) m.metalnessMap = m.roughnessMap;
  m.normalScale.set(o.ns ?? 1, o.ns ?? 1);
  m.aoMapIntensity = o.ao ?? 1;
  return m;
}

// Box-mapped UVs in meters (for furniture without hand-made UVs).
export function boxUV(geo, scale = 1, offset = [0, 0, 0]) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset[0], y = p.getY(i) + offset[1], z = p.getZ(i) + offset[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

// Rounded box (adapted idea: segmented box with corners pushed onto spheres).
export function roundedBox(w, h, d, r, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd));
    const dir = v.clone().sub(c);
    if (dir.lengthSq() > 1e-12) { dir.normalize().multiplyScalar(r); v.copy(c).add(dir); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Shared GLSL for triplanar sampling on organic SDF meshes (no UVs).
const TRI_GLSL = /* glsl */`
  uniform sampler2D tAc, tAn, tAm, tBc, tBn, tBm;
  uniform float uScaleA, uScaleB, uNA, uNB, uRA, uRB, uSheenA;
  uniform vec3 uMeanA, uMeanB;
  uniform mat3 normalMatrix;
  varying vec3 vObjPos; varying vec3 vObjN; varying vec2 vExt;
  vec4 tri(sampler2D t, vec3 p, vec3 w){ return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
  vec3 triN(sampler2D t, vec3 p, vec3 n, vec3 w, float s){
    vec3 tx = texture2D(t, p.zy).xyz * 2.0 - 1.0; tx.xy *= s;
    vec3 ty = texture2D(t, p.xz).xyz * 2.0 - 1.0; ty.xy *= s;
    vec3 tz = texture2D(t, p.xy).xyz * 2.0 - 1.0; tz.xy *= s;
    tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
    tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
    return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  }
`;

const MEANS = {
  skin: [0.98, 0.98, 0.98], twill: [0.62, 0.53, 0.40], knit: [0.42, 0.46, 0.51], denim: [0.33, 0.40, 0.52],
  tweed: [0.42, 0.37, 0.29], linen: [0.78, 0.75, 0.69], sofa: [0.40, 0.41, 0.44], plaster: [0.83, 0.81, 0.76],
};

function lin3(a) { const c = new THREE.Color().setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace); return new THREE.Vector3(c.r, c.g, c.b); }

// Material for SDF meshes: vertex colour = base colour, aExt.x = baked AO,
// aExt.y = mask that selects detail set B (e.g. skin on a sleeve+hand mesh).
export function triMat(o) {
  const P = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new P({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: o.env ?? 1, ...(o.physical || {}) });
  const A = o.A || 'skin', B = o.B || A;
  const U = {
    tAc: { value: tex(A + '_c', { srgb: true }) }, tAn: { value: tex(A + '_n') }, tAm: { value: tex(A + '_m') },
    tBc: { value: tex(B + '_c', { srgb: true }) }, tBn: { value: tex(B + '_n') }, tBm: { value: tex(B + '_m') },
    uScaleA: { value: o.sA ?? 8 }, uScaleB: { value: o.sB ?? 8 }, uNA: { value: o.nA ?? 1 }, uNB: { value: o.nB ?? 1 },
    uRA: { value: o.rA ?? 0.8 }, uRB: { value: o.rB ?? 0.6 }, uSheenA: { value: 0 },
    uMeanA: { value: lin3(MEANS[A] || [0.5, 0.5, 0.5]) },
    uMeanB: { value: lin3(MEANS[B] || [0.5, 0.5, 0.5]) },
    ...(o.uniforms || {}),
  };
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aExt; varying vec3 vObjPos; varying vec3 vObjN; varying vec2 vExt;
        ${o.vertexPars || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjPos = position; vObjN = normal; vExt = aExt;
        ${o.vertexMain || ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${TRI_GLSL}
        ${o.fragPars || ''}`)
      .replace('#include <map_fragment>', `
        vec3 tn = normalize(vObjN); vec3 tw = pow(abs(tn), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        float mB = smoothstep(0.35, 0.65, vExt.y);
        vec3 pA = vObjPos * uScaleA; vec3 pB = vObjPos * uScaleB;
        vec3 dA = tri(tAc, pA, tw).rgb / uMeanA; vec3 dB = tri(tBc, pB, tw).rgb / uMeanB;
        diffuseColor.rgb *= mix(dA, dB, mB);
        ${o.fragColor || ''}`)
      .replace('#include <roughnessmap_fragment>', `
        float rA = tri(tAm, pA, tw).g; float rB = tri(tBm, pB, tw).g;
        float roughnessFactor = clamp(mix(uRA + (rA - 0.6) * 0.5, uRB + (rB - 0.5) * 0.4, mB), 0.04, 1.0);
        ${o.fragRough || ''}`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nA = triN(tAn, pA, tn, tw, uNA); vec3 nB = triN(tBn, pB, tn, tw, uNB);
        normal = normalize(normalMatrix * normalize(mix(nA, nB, mB)));
        if (!gl_FrontFacing) normal = -normal;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float vao = vExt.x;
        reflectedLight.indirectDiffuse *= vao; reflectedLight.indirectSpecular *= vao;
        reflectedLight.directDiffuse *= mix(1.0, vao, 0.55);
        ${o.fragAO || ''}`);
    if (o.patch) o.patch(sh);
  };
  m.customProgramCacheKey = () => 'tri:' + (o.key || A + B);
  return m;
}

export function meshFrom(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

// Canvas helper -> texture
export function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
