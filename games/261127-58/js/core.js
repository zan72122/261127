// core.js — renderer, post-processing (bloom, heat haze, DOF, ACES, sRGB),
// texture sets with low->high upgrade, PBR material helpers.
import * as THREE from './three.module.min.js';

export const T = THREE;
export const TEX = new URL('../tex/', import.meta.url).href;

// ---------------------------------------------------------------- textures
const loader = new THREE.ImageLoader();
const pending = [];        // high-res upgrades queued until first frame is out
let upgradesStarted = false;

function mkTex(img, srgb, repeat) {
  const t = new THREE.Texture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

// A PBR texture set: name_c (colour), name_n (normal), name_m (ao/rough/height)
// bind() hands out per-material clones (own repeat) that are upgraded in place.
export class TexSet {
  constructor(name, { small = true } = {}) {
    this.name = name; this.users = []; this.imgs = {}; this.ready = false;
    this.small = small;
    this.p = Promise.all(['c', 'n', 'm'].map(k => new Promise(res => {
      loader.load(TEX + `${name}_${k}${small ? '_s' : ''}.jpg`, img => { this.imgs[k] = img; res(); }, undefined, () => res());
    }))).then(() => { this.ready = true; this.users.forEach(u => this._apply(u)); });
    pending.push(this);
  }
  bind(mat, repeat = [1, 1], slots = { map: 'c', normalMap: 'n', roughnessMap: 'm', aoMap: 'm' }) {
    const u = { mat, repeat, slots };
    this.users.push(u);
    if (this.ready) this._apply(u);
    return this;
  }
  _apply(u) {
    for (const [slot, k] of Object.entries(u.slots)) {
      const img = this.imgs[k]; if (!img) continue;
      const t = mkTex(img, k === 'c', u.repeat);
      if (typeof slot === 'string' && slot.startsWith('u:')) {
        const un = u.mat.userData.uniforms || (u.mat.userData.uniforms = {});
        const name = slot.slice(2);
        if (!un[name]) un[name] = { value: null };
        const old = un[name].value; un[name].value = t; if (old) old.dispose();
      } else {
        const old = u.mat[slot]; u.mat[slot] = t; if (old) old.dispose();
      }
    }
    u.mat.needsUpdate = true;
  }
  upgrade() {
    if (!this.small) return Promise.resolve();
    return Promise.all(['c', 'n', 'm'].map(k => new Promise(res => {
      loader.load(TEX + `${this.name}_${k}.jpg`, img => { this.imgs[k] = img; res(); }, undefined, () => res());
    }))).then(() => { this.small = false; this.users.forEach(u => this._apply(u)); });
  }
}

const sets = {};
export function texSet(name) { return sets[name] || (sets[name] = new TexSet(name)); }
export function startUpgrades() {
  if (upgradesStarted) return; upgradesStarted = true;
  // one at a time so interaction stays smooth
  const list = Object.values(sets);
  (async () => { for (const s of list) { await s.upgrade(); await new Promise(r => setTimeout(r, 30)); } })();
}
export function loadTex(file, srgb = true, repeat) {
  const t = new THREE.Texture();
  loader.load(TEX + file, img => { t.image = img; t.needsUpdate = true; });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// Standard PBR material from a texture set
export function pbr(setName, { repeat = [1, 1], color = 0xffffff, roughness = 1, metalness = 0, normalScale = 1, aoIntensity = 1, envMapIntensity = 1, physical = false, extra = {} } = {}) {
  const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({ color, roughness, metalness, envMapIntensity, ...extra });
  m.normalScale = new THREE.Vector2(normalScale, normalScale);
  m.aoMapIntensity = aoIntensity;
  texSet(setName).bind(m, repeat);
  return m;
}

// ---------------------------------------------------------------- organic (triplanar) material
// For SDF-built skinned meshes: textures are projected triplanar in bind space
// (so cloth does not swim when bones move), height -> derivative bump,
// vertex colour tints albedo and vertex AO darkens indirect light.
export function organic(setName, { color = 0xffffff, roughness = 1, scale = 8, bump = 1, sheen = 0, sheenColor = 0xffffff, sheenRoughness = 0.6, clearcoat = 0, envMapIntensity = 1, aoStrength = 1 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, sheen, sheenColor, sheenRoughness, clearcoat, envMapIntensity, vertexColors: true });
  m.userData.uniforms = { tC: { value: null }, tM: { value: null }, triScale: { value: scale }, bumpK: { value: bump * 0.0012 }, aoK: { value: aoStrength } };
  texSet(setName).bind(m, [1, 1], { 'u:tC': 'c', 'u:tM': 'm' });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ao; varying float vAO; varying vec3 vTP; varying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = ao; vTP = position; vTN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tC; uniform sampler2D tM; uniform float triScale; uniform float bumpK; uniform float aoK;
varying float vAO; varying vec3 vTP; varying vec3 vTN;
vec3 triW(){ vec3 w = pow(abs(normalize(vTN)), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec4 tri(sampler2D t){ vec3 w = triW(); vec3 p = vTP * triScale;
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }`)
      .replace('#include <map_fragment>', `vec4 triCol = tri(tC); diffuseColor.rgb *= triCol.rgb; vec4 triM = tri(tM);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * (0.55 + 0.6 * triM.g);`)
      .replace('#include <normal_fragment_maps>', `{
  float hh = triM.b * bumpK;
  vec3 vSigmaX = dFdx(-vViewPosition); vec3 vSigmaY = dFdy(-vViewPosition);
  vec3 vN = normal; vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec2 dHdxy = vec2(dFdx(hh), dFdy(hh));
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  normal = normalize(abs(fDet) * vN - vGrad);
}`)
      .replace('#include <aomap_fragment>', `{ float ambientOcclusion = mix(1.0, vAO * mix(1.0, triM.r, 0.6), aoK);
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, 0.45);
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
}`);
  };
  m.customProgramCacheKey = () => 'organic';
  return m;
}

// ---------------------------------------------------------------- post
const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.size = new THREE.Vector2(1, 1);
    const dt = new THREE.DepthTexture(1, 1); dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: dt });
    const mk = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.b1 = mk(); this.b2 = mk(); this.c1 = mk(); this.c2 = mk();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.qs = new THREE.Scene(); this.qs.add(this.quad);
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bright = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, thr: { value: 0.75 } }, vertexShader: POST_VS,
      fragmentShader: `uniform sampler2D t; uniform float thr; varying vec2 vUv;
        void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(max(c.r, c.g), c.b);
          gl_FragColor = vec4(c * smoothstep(thr, thr * 2.5, l), 1.0); }`, depthTest: false, depthWrite: false });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: POST_VS,
      fragmentShader: `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
        void main(){ vec3 s = texture2D(t, vUv).rgb * 0.2270;
          s += (texture2D(t, vUv + dir * 1.3846).rgb + texture2D(t, vUv - dir * 1.3846).rgb) * 0.3162;
          s += (texture2D(t, vUv + dir * 3.2308).rgb + texture2D(t, vUv - dir * 3.2308).rgb) * 0.0703;
          gl_FragColor = vec4(s, 1.0); }`, depthTest: false, depthWrite: false });
    this.heat = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0));
    this.final = new THREE.ShaderMaterial({
      uniforms: {
        tC: { value: null }, tD: { value: null }, tB1: { value: null }, tB2: { value: null },
        res: { value: new THREE.Vector2() }, time: { value: 0 }, heat: { value: this.heat },
        nearFar: { value: new THREE.Vector2(0.05, 50) }, focus: { value: 1.0 }, dof: { value: 1.0 },
        bloomK: { value: 0.4 }, vign: { value: 0.28 }, grain: { value: 0.025 }, warm: { value: new THREE.Vector3(1, 1, 1) }
      },
      vertexShader: POST_VS,
      fragmentShader: `
        #include <common>
        uniform sampler2D tC; uniform sampler2D tD; uniform sampler2D tB1; uniform sampler2D tB2;
        uniform vec2 res; uniform float time; uniform vec4 heat[4]; uniform vec2 nearFar;
        uniform float focus; uniform float dof; uniform float bloomK; uniform float vign; uniform float grain; uniform vec3 warm;
        varying vec2 vUv;
        float linD(float d){ float n = nearFar.x, f = nearFar.y; return n * f / (f - d * (f - n)); }
        float hn(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv; vec2 asp = vec2(res.x / res.y, 1.0);
          // heat shimmer: rising, wobbling refraction above hot things
          vec2 off = vec2(0.0);
          for (int i = 0; i < 4; i++) {
            vec4 h = heat[i]; if (h.w <= 0.0) continue;
            vec2 d = (uv - h.xy) * asp; d.y -= h.z * 0.9;
            float m = exp(-dot(d * vec2(1.4, 0.55), d * vec2(1.4, 0.55)) / (h.z * h.z));
            float t = time * 2.3;
            off += m * h.w * vec2(sin(uv.y * 160.0 - t * 5.0 + sin(uv.x * 40.0 + t)) , cos(uv.x * 120.0 + t * 4.0 + uv.y * 70.0));
          }
          uv += off * 0.0022;
          // small depth of field (golden-angle taps scaled by circle of confusion)
          float z = linD(texture2D(tD, uv).r);
          float coc = clamp(abs(z - focus) / max(z, 0.1) * 1.6, 0.0, 1.0) * dof;
          vec3 col = texture2D(tC, uv).rgb;
          if (coc > 0.04) {
            vec3 acc = col; float wsum = 1.0;
            float rad = coc * 5.5 / res.y;
            for (int i = 1; i < 12; i++) {
              float fi = float(i); float r = sqrt(fi / 12.0) * rad; float a = fi * 2.39996;
              vec2 o = vec2(cos(a), sin(a)) * r * vec2(1.0 / asp.x, 1.0);
              vec2 su = uv + o; float zs = linD(texture2D(tD, su).r);
              float w = (zs > z - 0.15 || zs > focus) ? 1.0 : 0.3;
              acc += texture2D(tC, su).rgb * w; wsum += w;
            }
            col = acc / wsum;
          }
          col += (texture2D(tB1, uv).rgb * 0.7 + texture2D(tB2, uv).rgb * 0.9) * bloomK;
          col *= warm;
          vec2 vc = (vUv - 0.5) * asp * 0.9; col *= 1.0 - vign * dot(vc, vc);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb += (hn(vUv * res + fract(time) * 91.0) - 0.5) * grain;
        }`,
      depthTest: false, depthWrite: false
    });
    this.final.toneMapped = true;
  }
  setSize(w, h, pr) {
    const W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.size.set(W, H);
    this.rt.setSize(W, H);
    const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
    this.b1.setSize(bw, bh); this.b2.setSize(bw, bh);
    this.c1.setSize(Math.max(1, W >> 3), Math.max(1, H >> 3)); this.c2.setSize(Math.max(1, W >> 3), Math.max(1, H >> 3));
    this.final.uniforms.res.value.set(W, H);
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.qc); }
  render(scene, camera, time) {
    const r = this.r;
    r.setRenderTarget(this.rt); r.render(scene, camera);
    // bloom chain
    this.bright.uniforms.t.value = this.rt.texture; this.pass(this.bright, this.b1);
    const bl = this.blur.uniforms;
    bl.t.value = this.b1.texture; bl.dir.value.set(1 / this.b1.width, 0); this.pass(this.blur, this.b2);
    bl.t.value = this.b2.texture; bl.dir.value.set(0, 1 / this.b1.height); this.pass(this.blur, this.b1);
    bl.t.value = this.b1.texture; bl.dir.value.set(1 / this.c1.width, 0); this.pass(this.blur, this.c2);
    bl.t.value = this.c2.texture; bl.dir.value.set(0, 1 / this.c1.height); this.pass(this.blur, this.c1);
    bl.t.value = this.c1.texture; bl.dir.value.set(2 / this.c1.width, 0); this.pass(this.blur, this.c2);
    bl.t.value = this.c2.texture; bl.dir.value.set(0, 2 / this.c1.height); this.pass(this.blur, this.c1);
    const u = this.final.uniforms;
    u.tC.value = this.rt.texture; u.tD.value = this.rt.depthTexture; u.tB1.value = this.b1.texture; u.tB2.value = this.c1.texture;
    u.time.value = time; u.nearFar.value.set(camera.near, camera.far);
    this.pass(this.final, null);
  }
}

// ---------------------------------------------------------------- env maps
// A small "photo studio" room rendered to PMREM, giving HDR-like reflections.
export function makeEnv(renderer, mode) {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 14), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: mode === 'night' ? 0x2a2018 : 0x8a8478 }));
  box.position.y = 3.2; s.add(box);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), new THREE.MeshBasicMaterial({ color: mode === 'night' ? 0x3a3128 : 0x9a9080 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.2; s.add(floor);
  const panel = (w, h, col, I, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(I), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); s.add(m);
  };
  if (mode === 'night') {
    panel(2.5, 0.5, 0xffd2a0, 14, [0, 6.4, 0], [0, 0, 0]);         // work lights
    panel(1.2, 0.3, 0xffcc99, 10, [3, 6.3, -2], [3, 0, -2]);
    panel(1.6, 1.6, 0xff7a20, 12, [-6, 1.4, -4], [0, 1, 0]);       // furnace mouth
    panel(3, 2, 0x203048, 1.2, [7.9, 2.5, 0], [0, 2.5, 0]);        // night windows
    panel(5, 2.2, 0xffb070, 1.4, [0, 2.6, 6.9], [0, 2.6, 0]);       // warm bounce wall
  } else {
    panel(4, 3, 0xfff2dc, 9, [7.9, 2.6, -1], [0, 2.2, 0]);          // bright windows
    panel(4, 3, 0xcfe0ff, 4, [7.9, 2.6, 3], [0, 2.2, 0]);
    panel(3, 3, 0xffe2b8, 3, [0, 6.8, 0], [0, 0, 0]);
    panel(6, 2.5, 0xe8dcc8, 1.8, [-7.9, 2.0, 0], [0, 2, 0]);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  return rt.texture;
}

export function smooth(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
