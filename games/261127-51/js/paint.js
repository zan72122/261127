// "Touch changes the look" systems:
//  - PaintRT: a GPU render-target that accumulates powder where the brush passes
//    (R = black powder, G = gold powder).  A small CPU mirror is kept for
//    gameplay checks.
//  - Latent prints: invisible residue (fingerprint ridges, paw pads) that only
//    shows where powder has been brushed: faint grey haze after one pass,
//    crisp ridges after several.
//  - DecalSet: instanced decals for UV-glow paw trails, papa's sock smudges and
//    the free-play hand/paw stamps.
import { T, renderer, png, tex, clamp, V3, rand } from './core.js';

export const UVL = { pos: { value: V3() }, dir: { value: V3(0, -1, 0) }, on: { value: 0 }, cos: { value: 0.93 } };
export const POWDER = {
  black: { c: new T.Color(0.045, 0.043, 0.042), metal: 0.15, rough: 0.6 },
  gold: { c: new T.Color(0.83, 0.62, 0.30), metal: 1.0, rough: 0.32 },
};

// ------------------------------------------------------------------ paint RT
const stampMat = new T.ShaderMaterial({
  uniforms: { uCol: { value: new T.Vector4() }, uSeed: { value: 0 }, uAng: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform vec4 uCol; uniform float uSeed; uniform float uAng; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)) + uSeed) * 43758.5); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec2 q = vUv * 2.0 - 1.0;
      float r = length(q);
      float fall = smoothstep(1.0, 0.2, r);
      // bristle streaks along the stroke direction
      vec2 d = vec2(cos(uAng), sin(uAng));
      float across = dot(q, vec2(-d.y, d.x));
      float streak = 0.55 + 0.45 * n(vec2(across * 14.0, uSeed * 3.1)) ;
      float grain = 0.6 + 0.4 * n(q * 24.0 + uSeed);
      gl_FragColor = uCol * fall * streak * grain;
    }`,
  transparent: true, depthTest: false, depthWrite: false,
  blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor,
});

export class PaintRT {
  constructor(w, h, cw = 96, ch = 48) {
    const ext = renderer.extensions;
    const hf = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.rt = new T.WebGLRenderTarget(w, h, { type: hf ? T.HalfFloatType : T.UnsignedByteType, depthBuffer: false });
    this.rt.texture.generateMipmaps = false;
    this.scene = new T.Scene();
    this.cam = new T.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.quad = new T.Mesh(new T.PlaneGeometry(1, 1), stampMat);
    this.scene.add(this.quad);
    this.queue = [];
    this.cw = cw; this.ch = ch;
    this.cpu = new Float32Array(cw * ch * 2);
    this.clear();
  }
  clear() {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(0xdddddd, 1);
    this.cpu.fill(0);
  }
  // u,v in [0,1]; ru,rv radius in uv; ch: 0 black, 1 gold; amt per stamp
  stamp(u, v, ru, rv, ch, amt, ang = 0) {
    this.queue.push([u, v, ru, rv, ch, amt, ang]);
    // cpu mirror
    const { cw, ch: chh } = this;
    const x0 = Math.floor((u - ru) * cw), x1 = Math.ceil((u + ru) * cw);
    const y0 = Math.floor((v - rv) * chh), y1 = Math.ceil((v + rv) * chh);
    for (let y = Math.max(0, y0); y < Math.min(chh, y1); y++) for (let x = Math.max(0, x0); x < Math.min(cw, x1); x++) {
      const dx = ((x + 0.5) / cw - u) / ru, dy = ((y + 0.5) / chh - v) / rv;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 1) this.cpu[(y * cw + x) * 2 + ch] += amt * clamp((1 - r) / 0.8, 0, 1) * 0.8;
    }
  }
  sample(u, v) {
    const x = clamp(Math.floor(u * this.cw), 0, this.cw - 1), y = clamp(Math.floor(v * this.ch), 0, this.ch - 1);
    const i = (y * this.cw + x) * 2;
    return this.cpu[i] + this.cpu[i + 1];
  }
  flush() {
    if (!this.queue.length) return;
    const prev = renderer.getRenderTarget();
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.rt);
    for (const [u, v, ru, rv, ch, amt, ang] of this.queue) {
      this.quad.position.set(u, v, 0);
      this.quad.scale.set(ru * 2, rv * 2, 1);
      stampMat.uniforms.uCol.value.set(ch === 0 ? amt : 0, ch === 1 ? amt : 0, 0, 0);
      stampMat.uniforms.uSeed.value = Math.random() * 100;
      stampMat.uniforms.uAng.value = ang;
      renderer.render(this.scene, this.cam);
    }
    renderer.setRenderTarget(prev);
    renderer.autoClear = ac;
    this.queue.length = 0;
  }
}

// GLSL used by surfaces receiving powder (haze where brushed)
export const POWDER_GLSL = /* glsl */`
  uniform sampler2D tPaint;
  float phash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec4 powderAt(vec2 uv, vec2 grainUv){
    vec4 p = texture2D(tPaint, uv);
    float a = p.r + p.g;
    // haze peaks after the first pass and thins as the brush keeps sweeping
    float haze = a * (1.1 - 0.85 * smoothstep(0.35, 1.4, a));
    float g = phash(floor(grainUv));
    haze *= 0.6 + 0.8 * g;
    float gold = p.g / max(a, 1e-4);
    return vec4(clamp(haze, 0.0, 0.55), gold, a, g);
  }
`;
export const BLACK = 'vec3(0.045, 0.043, 0.042)';
export const GOLD = 'vec3(0.83, 0.62, 0.30)';

// Patch a MeshStandardMaterial so it shows powder haze from a PaintRT.
// uvExpr: GLSL expression giving the paint uv (needs varyings declared in patch).
export function powderSurface(mat, paint, { world = false, rect = null, glass = false } = {}) {
  const U = { tPaint: { value: paint.rt.texture }, uRect: { value: rect || new T.Vector4(0, 0, 1, 1) } };
  mat.userData.powderU = U;
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prevCompile) prevCompile(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPUv; uniform vec4 uRect;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        ${world ? 'vec4 wpp = modelMatrix * vec4(transformed, 1.0); vPUv = (wpp.xy - uRect.xy) / uRect.zw;' : 'vPUv = uv;'}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vPUv;\n${POWDER_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 pw = vec4(0.0);
        if (vPUv.x > 0.0 && vPUv.x < 1.0 && vPUv.y > 0.0 && vPUv.y < 1.0) pw = powderAt(vPUv, vPUv * vec2(${world ? '1400.0, 700.0' : '900.0, 300.0'}));
        vec3 pcol = mix(${BLACK}, ${GOLD} * (0.7 + 0.6 * pw.w), pw.y);
        ${glass
          ? 'diffuseColor.rgb = pcol * pw.x; diffuseColor.a = max(diffuseColor.a, pw.x * 0.95);'
          : 'diffuseColor.rgb = mix(diffuseColor.rgb, pcol, pw.x);'}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.85, 0.4, pw.y), clamp(pw.x * 1.5, 0.0, 1.0));`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.9, pw.y * clamp(pw.x * 1.5, 0.0, 1.0));`);
  };
  mat.customProgramCacheKey = () => 'powder' + (world ? 'w' : 'u') + (glass ? 'g' : '');
  mat.needsUpdate = true;
  return U;
}

// --------------------------------------------------------------- latent print
// A small mesh (conforming patch) carrying a residue mask.  It reads the
// surface's PaintRT at aPUv to decide how much powder stuck to the residue.
const latentMats = new Map();
function latentMat(maskName, paint) {
  const key = maskName + paint.rt.texture.uuid;
  if (latentMats.has(key)) return latentMats.get(key);
  const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const U = { tMask: { value: png(maskName) }, tPaint: { value: paint.rt.texture }, uTexel: { value: 1 / 512 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aPUv; varying vec2 vPUv; varying vec2 vMUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPUv = aPUv; vMUv = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D tMask; uniform sampler2D tPaint; uniform float uTexel; varying vec2 vPUv; varying vec2 vMUv;
        float pgr(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        vec3 bumpN(vec3 nrm, float h, float sc){
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    float hx = dFdx(h) * sc, hy = dFdy(h) * sc;
    vec3 r1 = cross(dpy, nrm), r2 = cross(nrm, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    return normalize(abs(det) * nrm - grad);
  }`)
      .replace('#include <color_fragment>', `
        float mask = texture2D(tMask, vMUv).r;
        vec4 pp = texture2D(tPaint, vPUv);
        float amt = pp.r + pp.g;
        float gold = pp.g / max(amt, 1e-4);
        // ridges grab powder: faint after one pass, crisp after several
        float vis = smoothstep(0.02, 0.4, amt);
        float edge = smoothstep(0.25 - 0.18 * vis, 0.65 - 0.2 * vis, mask);
        float g = pgr(floor(vMUv * 700.0));
        float alpha = clamp(edge * vis * (0.8 + 0.3 * g), 0.0, 1.0);
        if (alpha < 0.01) discard;
        vec3 pcol = mix(vec3(0.03, 0.03, 0.03), vec3(0.78, 0.52, 0.2) * (0.75 + 0.5 * g), gold);
        diffuseColor = vec4(pcol, alpha);`)
      .replace('#include <normal_fragment_maps>', `
        normal = bumpN(normal, alpha, 0.25);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.88, 0.42, gold);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gold * 0.95;');
  };
  m.customProgramCacheKey = () => 'latent';
  latentMats.set(key, m);
  return m;
}

export class LatentPrint {
  // patch: BufferGeometry (with uv 0..1 over the print), aPUv set by caller
  constructor(geo, maskName, paint, center, info = {}) {
    this.mesh = new T.Mesh(geo, latentMat(maskName, paint));
    this.mesh.renderOrder = 3;
    this.paint = paint; this.center = center; this.info = info;
    this.found = false;
  }
  level() {
    const [u, v] = this.info.puv;
    const r = this.info.pr || [0.01, 0.01];
    let s = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) s += this.paint.sample(u + dx * r[0] * 0.6, v + dy * r[1] * 0.6);
    return s / 5;
  }
}

// Flat patch helper for planar surfaces. origin = center, ax/ay = in-plane axes (unit), size
export function planarPatch(center, ax, ay, w, h, rot, toPUv) {
  const g = new T.PlaneGeometry(w, h, 2, 2);
  const p = g.attributes.position;
  const nrm = V3().crossVectors(ax, ay).normalize();
  const pu = new Float32Array(p.count * 2);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const xr = x * c - y * s, yr = x * s + y * c;
    const wp = center.clone().addScaledVector(ax, xr).addScaledVector(ay, yr).addScaledVector(nrm, 0.0006);
    p.setXYZ(i, wp.x, wp.y, wp.z);
    const [u, v] = toPUv(wp);
    pu[i * 2] = u; pu[i * 2 + 1] = v;
  }
  g.setAttribute('aPUv', new T.BufferAttribute(pu, 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------- decals
// kinds: 0 powder (colour from aCol, metal from aCol.a), 1 UV-fluorescent residue
export class DecalSet {
  constructor(maskName, max, { kind = 0, size = 0.05, parent } = {}) {
    const g = new T.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2); // lie flat (normal +Y) by default
    this.mesh = new T.InstancedMesh(g, null, max);
    this.max = max; this.count = 0; this.kind = kind;
    this.aAmt = new T.InstancedBufferAttribute(new Float32Array(max), 1);
    this.aCol = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aRev = new T.InstancedBufferAttribute(new Float32Array(max), 1);
    g.setAttribute('aAmt', this.aAmt); g.setAttribute('aCol', this.aCol); g.setAttribute('aRev', this.aRev);
    const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    const U = { tMask: { value: png(maskName) }, uTexel: { value: 1 / 256 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uUVPos: UVL.pos, uUVDir: UVL.dir, uUVOn: UVL.on, uUVCos: UVL.cos });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAmt; attribute vec4 aCol; attribute float aRev; varying float vAmt; varying vec4 vCol; varying float vRev; varying vec2 vMUv; varying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAmt = aAmt; vCol = aCol; vRev = aRev; vMUv = uv;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform sampler2D tMask; uniform float uTexel; varying float vAmt; varying vec4 vCol; varying float vRev; varying vec2 vMUv; varying vec3 vWP;
          uniform vec3 uUVPos; uniform vec3 uUVDir; uniform float uUVOn; uniform float uUVCos;
          float dgr(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          vec3 bumpN(vec3 nrm, float h, float sc){
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    float hx = dFdx(h) * sc, hy = dFdy(h) * sc;
    vec3 r1 = cross(dpy, nrm), r2 = cross(nrm, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    return normalize(abs(det) * nrm - grad);
  }`)
        .replace('#include <color_fragment>', kind === 0 ? `
          float mask = texture2D(tMask, vMUv).r;
          float g = dgr(floor(vMUv * 400.0));
          float alpha = smoothstep(0.12, 0.6, mask * (0.7 + 0.5 * g)) * vAmt;
          if (alpha < 0.01) discard;
          diffuseColor = vec4(vCol.rgb * (0.8 + 0.4 * g), alpha);` : `
          vec2 muv = (vMUv - 0.5) * 2.0 + 0.5;
          float mask = (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) ? texture2D(tMask, muv).r : 0.0;
          vec3 L = vWP - uUVPos; float dl = length(L);
          float spot = smoothstep(uUVCos, mix(uUVCos, 1.0, 0.45), dot(L / dl, uUVDir)) * uUVOn / (1.0 + dl * dl * 0.25);
          float rr = length(vMUv - 0.5) * 2.0;
          float glow = smoothstep(0.08, 0.5, mask) * (spot * 2.2 + vRev * 0.75) * vAmt;
          float halo = exp(-rr * rr * 6.0) * (spot * 0.5 + vRev * 0.2) * vAmt;
          if (glow + halo < 0.004) discard;
          diffuseColor = vec4(0.0, 0.0, 0.0, clamp(glow * 0.7 + halo * 0.5, 0.0, 0.92));`)
        .replace('#include <normal_fragment_maps>', kind === 0 ? `
          normal = bumpN(normal, alpha, 0.8);` : '')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.75, 0.3, vCol.a);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vCol.a;')
        .replace('#include <emissivemap_fragment>', kind === 1 ? `#include <emissivemap_fragment>
          totalEmissiveRadiance = vec3(0.70, 0.92, 1.0) * glow * 5.0 + vec3(0.55, 0.42, 1.0) * halo * 2.5;` : '#include <emissivemap_fragment>');
    };
    m.customProgramCacheKey = () => 'decal' + kind;
    this.mesh.material = m;
    this.mesh.count = 0;
    this.mesh.receiveShadow = kind === 0;
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    this.items = [];
    this.defaultSize = size;
    (parent || null)?.add(this.mesh);
  }
  // pos on surface, normal n, yaw rotation around normal, size (w,h)
  add(pos, n, yaw, w, h, col = [0.05, 0.05, 0.05], metal = 0, amt = 1) {
    let i;
    if (this.count < this.max) i = this.count++;
    else { i = this.items.shift().i; }
    const up = V3(0, 1, 0);
    const q = new T.Quaternion().setFromUnitVectors(up, n.clone().normalize());
    const qy = new T.Quaternion().setFromAxisAngle(up, yaw);
    q.multiply(qy);
    const m = new T.Matrix4().compose(pos.clone().addScaledVector(n, 0.0008), q, V3(w, 1, h));
    this.mesh.setMatrixAt(i, m);
    this.aAmt.setX(i, amt); this.aCol.setXYZW(i, col[0], col[1], col[2], metal); this.aRev.setX(i, 0);
    const it = { i, pos: pos.clone(), amt, rev: 0, w, h };
    this.items.push(it);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true; this.aAmt.needsUpdate = true; this.aCol.needsUpdate = true; this.aRev.needsUpdate = true;
    return it;
  }
  setAmt(it, a) { it.amt = a; this.aAmt.setX(it.i, a); this.aAmt.needsUpdate = true; }
  setRev(it, r) { it.rev = r; this.aRev.setX(it.i, r); this.aRev.needsUpdate = true; }
}
