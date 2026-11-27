// Rendering core: renderer, HDR post pipeline (DoF-lite + bloom + ACES + sRGB), textures, PBR materials.
import * as THREE from '../lib/three.module.min.js';

export const G = {
  renderer: null, scene: null, camera: null,
  w: 1, h: 1, dpr: 1, scale: 1,
  rt: null, q1: null, q2: null, post: null,
  focus: 6, focusRange: 6, exposure: 1.0, bloom: 0.32,
  frameMs: 16, slowFrames: 0, fastFrames: 0,
};

const FSQ_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsq(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ vertexShader: FSQ_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh);
  return { scene: sc, mat: m };
}

export function initGfx(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NoToneMapping;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.setClearColor(0x000000, 1);
  G.renderer = r;
  G.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 900);
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  G.mobile = mobile;
  G.dprMax = Math.min(window.devicePixelRatio || 1, 2);
  G.scale = mobile ? Math.min(G.dprMax, 1.5) : G.dprMax;
  G.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // float render targets: fall back to 8-bit if the GPU cannot render to half floats
  const ext = r.extensions;
  const full = ext.has('EXT_color_buffer_float');
  const half = full || ext.has('EXT_color_buffer_half_float');
  G.rtType = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
  G.samples = full ? 4 : 0;

  const qOpts = { type: G.rtType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  G.q1 = new THREE.WebGLRenderTarget(4, 4, qOpts);
  G.q2 = new THREE.WebGLRenderTarget(4, 4, qOpts);

  G.down = fsq(`
    uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0,-1.0)).rgb
             + texture2D(tSrc, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.0,1.0)).rgb;
      c *= 0.25;
      c = min(c, vec3(40.0));
      gl_FragColor = vec4(c, 1.0);
    }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });

  G.blur = fsq(`
    uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
      c += texture2D(tSrc, vUv + uDir*1.3846).rgb * 0.3162162;
      c += texture2D(tSrc, vUv - uDir*1.3846).rgb * 0.3162162;
      c += texture2D(tSrc, vUv + uDir*3.2308).rgb * 0.0702703;
      c += texture2D(tSrc, vUv - uDir*3.2308).rgb * 0.0702703;
      gl_FragColor = vec4(c, 1.0);
    }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });

  G.comp = fsq(`
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBlur;
    uniform float uNear, uFar, uFocus, uRange, uExposure, uBloom, uTime, uVig, uDofMax;
    uniform vec3 uGrade;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 aces(vec3 color){
      const mat3 ACESInputMat = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      color *= 1.0/0.6;
      color = ACESInputMat*color; color = RRTAndODTFit(color); color = ACESOutputMat*color;
      return clamp(color,0.0,1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(0.41666))-0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec3 sharp = texture2D(tColor, vUv).rgb;
      vec3 bl = texture2D(tBlur, vUv).rgb;
      float d = texture2D(tDepth, vUv).x;
      float z = (uNear*uFar)/((uFar-uNear)*d - uFar); z = -z;
      float coc = clamp(abs(z - uFocus)/uRange, 0.0, 1.0);
      coc = coc*coc*uDofMax;
      vec3 c = mix(sharp, bl, coc);
      vec3 glow = max(bl - vec3(1.2), vec3(0.0));
      c += glow*uBloom + bl*0.02*uBloom;
      c *= uExposure * uGrade;
      c = aces(c);
      vec2 q = vUv - 0.5; c *= 1.0 - dot(q,q)*uVig;
      c = toSRGB(c);
      c += (hash(vUv*913.0 + uTime) - 0.5) * (1.5/255.0);
      gl_FragColor = vec4(c, 1.0);
    }`, {
    tColor: { value: null }, tDepth: { value: null }, tBlur: { value: null },
    uNear: { value: 0.05 }, uFar: { value: 900 }, uFocus: { value: 6 }, uRange: { value: 8 },
    uExposure: { value: 1 }, uBloom: { value: 0.5 }, uTime: { value: 0 }, uVig: { value: 0.55 }, uDofMax: { value: 0.45 },
    uGrade: { value: new THREE.Vector3(1, 1, 1) },
  });
  resize();
  return r;
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  G.w = w; G.h = h;
  const r = G.renderer;
  r.setPixelRatio(G.scale);
  r.setSize(w, h, true);
  const pw = Math.max(2, Math.floor(w * G.scale)), ph = Math.max(2, Math.floor(h * G.scale));
  if (G.rt) { G.rt.depthTexture.dispose(); G.rt.dispose(); }
  const dt = new THREE.DepthTexture(pw, ph);
  dt.type = THREE.UnsignedIntType;
  G.rt = new THREE.WebGLRenderTarget(pw, ph, { type: G.rtType, samples: G.samples, depthTexture: dt, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const qw = Math.max(2, pw >> 2), qh = Math.max(2, ph >> 2);
  G.q1.setSize(qw, qh); G.q2.setSize(qw, qh);
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
}

export function render(scene, time) {
  const r = G.renderer, cam = G.camera;
  r.setRenderTarget(G.rt);
  r.render(scene, cam);
  let colorTex = G.rt.texture;
  if (G.vol && G.vol.enabled) {
    if (!G.rt2 || G.rt2.width !== G.rt.width || G.rt2.height !== G.rt.height) {
      if (G.rt2) G.rt2.dispose();
      G.rt2 = new THREE.WebGLRenderTarget(G.rt.width, G.rt.height, { type: G.rtType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    }
    const vu = G.vol.mat.uniforms;
    vu.tColor.value = G.rt.texture; vu.tDepth.value = G.rt.depthTexture;
    vu.uInvProj.value.copy(cam.projectionMatrixInverse); vu.uCamWorld.value.copy(cam.matrixWorld);
    vu.uCamPos.value.copy(cam.position); vu.uTime.value = time;
    r.setRenderTarget(G.rt2); r.render(G.vol.scene, G.postCam);
    colorTex = G.rt2.texture;
  }
  // downsample + blur
  const qw = G.q1.width, qh = G.q1.height;
  G.down.mat.uniforms.tSrc.value = colorTex;
  G.down.mat.uniforms.uTexel.value.set(1 / G.rt.width, 1 / G.rt.height);
  r.setRenderTarget(G.q1); r.render(G.down.scene, G.postCam);
  for (let i = 0; i < 2; i++) {
    G.blur.mat.uniforms.tSrc.value = G.q1.texture; G.blur.mat.uniforms.uDir.value.set(1 / qw, 0);
    r.setRenderTarget(G.q2); r.render(G.blur.scene, G.postCam);
    G.blur.mat.uniforms.tSrc.value = G.q2.texture; G.blur.mat.uniforms.uDir.value.set(0, 1 / qh);
    r.setRenderTarget(G.q1); r.render(G.blur.scene, G.postCam);
  }
  const u = G.comp.mat.uniforms;
  u.tColor.value = colorTex; u.tDepth.value = G.rt.depthTexture; u.tBlur.value = G.q1.texture;
  u.uNear.value = cam.near; u.uFar.value = cam.far;
  u.uFocus.value = G.focus; u.uRange.value = G.focusRange;
  u.uExposure.value = G.exposure; u.uBloom.value = G.bloom; u.uTime.value = time % 10;
  r.setRenderTarget(null);
  r.render(G.comp.scene, G.postCam);
}

// adaptive resolution to hold >= 30 fps on phones
export function adaptResolution(dtMs) {
  G.frameMs = G.frameMs * 0.9 + dtMs * 0.1;
  if (G.frameMs > 30) { G.slowFrames++; G.fastFrames = 0; } else if (G.frameMs < 18) { G.fastFrames++; G.slowFrames = 0; } else { G.slowFrames = 0; G.fastFrames = 0; }
  if (G.slowFrames > 45 && G.scale > 0.75) { G.scale = Math.max(0.75, G.scale - 0.2); G.slowFrames = 0; resize(); }
  if (G.fastFrames > 240 && G.scale < G.dprMax) { G.scale = Math.min(G.dprMax, G.scale + 0.15); G.fastFrames = 0; resize(); }
}

// ------------------------------------------------------------------ textures
const loader = new THREE.TextureLoader();
const texCache = new Map();
const imgCache = new Map();
export const pending = new Set();

function srcTex(file, srgb) {
  const key = file + (srgb ? ':s' : ':l');
  if (texCache.has(key)) return texCache.get(key);
  const t = new THREE.Texture();
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  let p = imgCache.get(file);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => res(img);
      img.onerror = () => { console.warn('missing texture', file); res(null); };
      img.src = 'tex/' + file;
    });
    imgCache.set(file, p);
    pending.add(p); p.then(() => pending.delete(p));
  }
  p.then((img) => { if (img) { t.image = img; t.needsUpdate = true; } });
  texCache.set(key, t);
  return t;
}

export function tex(file, srgb = true, repeat = 1) {
  const base = srcTex(file, srgb);
  if (repeat === 1) return base;
  const key = file + (srgb ? ':s' : ':l') + ':' + repeat;
  if (texCache.has(key)) return texCache.get(key);
  const t = base.clone();
  t.source = base.source;
  t.repeat.set(repeat, repeat);
  // when the base image arrives, the clone shares the source; flag version bump
  imgCache.get(file).then((img) => { if (img) t.needsUpdate = true; });
  texCache.set(key, t);
  return t;
}

// PBR material from a generated texture set. uv are in meters; tile = meters per texture repeat.
export function pbr(name, o = {}) {
  const rep = 1 / (o.tile || 1);
  const P = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const orm = tex(name + '_orm.jpg', false, rep);
  const m = new P({
    map: tex(name + '_c.jpg', true, rep),
    normalMap: tex(name + '_n.jpg', false, rep),
    roughnessMap: orm, metalnessMap: orm, aoMap: orm,
    roughness: o.roughness ?? 1, metalness: o.metalness ?? 1,
    color: o.color !== undefined ? new THREE.Color(o.color) : new THREE.Color(1, 1, 1),
    normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
    aoMapIntensity: o.ao ?? 1,
    envMapIntensity: o.env ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.physical) {
    if (o.clearcoat) { m.clearcoat = o.clearcoat; m.clearcoatRoughness = o.clearcoatRoughness ?? 0.08; }
    if (o.sheen) { m.sheen = o.sheen; m.sheenRoughness = o.sheenRoughness ?? 0.6; m.sheenColor = new THREE.Color(o.sheenColor ?? 0xffffff); }
  }
  if (o.metal0) m.metalness = 0; // ignore metalness map blue channel
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  return m;
}

// --- wetness / heat injection. paint: {tex: DataTexture} sampled with mesh uv2-like attribute 'puv'
export function wettable(mat, opts = {}) {
  mat.userData.wet = { value: opts.wet ?? 0 };
  mat.userData.paint = opts.paint ? { value: opts.paint } : null;
  mat.userData.heatGain = { value: opts.heatGain ?? 3.0 };
  mat.userData.glow = { value: 0 };
  mat.userData.glowColor = { value: new THREE.Color(1, 0.9, 0.7) };
  const usePaint = !!opts.paint;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uWet = mat.userData.wet;
    sh.uniforms.uGlow = mat.userData.glow;
    sh.uniforms.uGlowColor = mat.userData.glowColor;
    if (usePaint) { sh.uniforms.uPaint = mat.userData.paint; sh.uniforms.uHeatGain = mat.userData.heatGain; }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${usePaint ? 'attribute vec2 puv; varying vec2 vPuv;' : ''}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n${usePaint ? 'vPuv = puv;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uWet; uniform float uGlow; uniform vec3 uGlowColor;\n${usePaint ? 'uniform sampler2D uPaint; uniform float uHeatGain; varying vec2 vPuv;' : ''}\nfloat gWet; vec4 gPnt;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        gPnt = ${usePaint ? 'texture2D(uPaint, vPuv)' : 'vec4(0.0)'};
        gWet = clamp(max(uWet, gPnt.r), 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.16, gPnt.g);
        diffuseColor.rgb *= mix(1.0, 0.5, gWet);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 1.0) * 0.12 + 0.04, gWet*0.92);
        roughnessFactor = mix(roughnessFactor, 0.95, gPnt.g*0.35*(1.0-gWet));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${usePaint ? `{ float hh = gPnt.b; vec3 hc = mix(vec3(0.9,0.12,0.02), vec3(1.0,0.45,0.08), hh); totalEmissiveRadiance += hc * hh * hh * uHeatGain; }` : ''}
        { float fr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition))); totalEmissiveRadiance += uGlowColor * uGlow * (0.15 + 1.6 * fr * fr * fr); }`);
  };
  mat.customProgramCacheKey = () => 'wet' + (usePaint ? 'p' : '') + (mat.isMeshPhysicalMaterial ? 'P' : '');
  return mat;
}

// glow helper for 'touch me' hint on any standard material
export function addGlow(mat) {
  if (!mat.userData.glow) wettable(mat);
  return mat.userData.glow;
}

export function shadowify(obj, cast = true, recv = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = recv; } });
  return obj;
}

// soft contact shadow decal (ground AO)
let blobTex = null;
export function contactShadow(w, d, strength = 0.75) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.35, 'rgba(0,0,0,0.75)'); g.addColorStop(0.7, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: strength, depthWrite: false, color: 0x000000 });
  m.blending = THREE.MultiplyBlending; m.premultipliedAlpha = true;
  // multiply blending with black*alpha: use custom normal blend instead for portability
  m.blending = THREE.NormalBlending; m.premultipliedAlpha = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = -1;
  mesh.position.y = 0.006;
  return mesh;
}

export { THREE, fsq };
