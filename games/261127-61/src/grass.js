// Instanced grass blades (short meadow grass, mid grass, tall interactive tufts) and the press map.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { LIGHT } from './giraffe.js';

export const PRESS = { size: 24, res: 384 };        // press map covers [-12,12]^2 m around the meadow centre
export const shared = {
  uTime: { value: 0 },
  uWind: { value: 0.25 },
  uPress: { value: null },
  uTuft: { value: [] },          // per-tuft bend (xz) + lift
  uKeyDir: LIGHT.dir, uKeyCol: LIGHT.col,
  uDew: { value: 0 },            // morning dew on untouched grass
};
export const MAX_TUFTS = 64;
for (let i = 0; i < MAX_TUFTS; i++) shared.uTuft.value.push(new THREE.Vector4(0, 0, 0, 0));

// --- press map (flattened grass) -------------------------------------------------------------------
export function makePressMap() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = PRESS.res;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#000'; cx.fillRect(0, 0, PRESS.res, PRESS.res);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  shared.uPress.value = tex;
  const api = {
    cv, cx, tex, dirty: false, lastUp: 0,
    // world xz -> pixel
    px(x) { return (x / PRESS.size + 0.5) * PRESS.res; },
    stamp(x, z, r, a) {
      const X = api.px(x), Y = api.px(z), R = Math.max(1.2, r / PRESS.size * PRESS.res);
      const g = cx.createRadialGradient(X, Y, 0, X, Y, R);
      const v = Math.round(255 * a);
      g.addColorStop(0, `rgb(${v},${v},${v})`); g.addColorStop(0.6, `rgb(${Math.round(v * 0.8)},${Math.round(v * 0.8)},${Math.round(v * 0.8)})`); g.addColorStop(1, 'rgb(0,0,0)');
      cx.globalCompositeOperation = 'lighten';
      cx.fillStyle = g; cx.beginPath(); cx.arc(X, Y, R, 0, Math.PI * 2); cx.fill();
      cx.globalCompositeOperation = 'source-over';
      api.dirty = true;
    },
    // slow recovery of flattened grass (keeps a faint trace for a long time)
    fade(amount) {
      cx.globalCompositeOperation = 'multiply';
      const k = Math.round(255 * (1 - amount));
      cx.fillStyle = `rgb(${k},${k},${k})`; cx.fillRect(0, 0, PRESS.res, PRESS.res);
      cx.globalCompositeOperation = 'source-over';
      api.dirty = true;
    },
    update(now) { if (api.dirty && now - api.lastUp > 120) { tex.needsUpdate = true; api.dirty = false; api.lastUp = now; } },
    snapshot() { try { return cx.getImageData(0, 0, PRESS.res, PRESS.res); } catch (e) { return null; } },
    restore(img) { if (img) { cx.putImageData(img, 0, 0); api.dirty = true; } },
  };
  return api;
}

// --- blade geometry -----------------------------------------------------------------------------------
function bladeGeometry(segs) {
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) { const t = i / segs; pos.push(-0.5, t, 0, 0.5, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const BLADE_VS = /* glsl */`
attribute vec3 iPos; attribute vec4 iP; attribute vec4 iC;
uniform float uTime; uniform float uWind; uniform sampler2D uPress; uniform vec4 uTuft[${MAX_TUFTS}];
varying vec4 vC; varying float vT; varying float vPr; varying float vHi;
vec3 bladePos(vec3 p, out vec3 nrm){
  float t = p.y;
  float h = iP.x;
  float c = cos(iP.z), s = sin(iP.z);
  vec3 side = vec3(c, 0.0, s); vec3 fwd = vec3(-s, 0.0, c);
  // flattened grass from the press map
  vec2 puv = iPos.xz / ${PRESS.size.toFixed(1)} + 0.5;
  float pr = 0.0;
  if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) pr = texture2D(uPress, puv).r;
  vPr = pr;
  vec2 B = fwd.xz * iP.w;
  float ph = dot(iPos.xz, vec2(0.21, 0.17)) + uTime * 1.4;
  B += vec2(sin(ph) + 0.5*sin(ph*2.7+1.3), 0.6*sin(ph*0.8+2.0)) * uWind * (0.4 + 0.6*iC.y);
  int ti = int(iC.w + 0.5);
  vHi = 0.0;
  if (ti > 0) { vec4 tb = uTuft[ti]; B += tb.xy; vHi = tb.z; }
  // pressed blades lie down in a direction that varies by place
  float pa = vnoise2(iPos.xz*1.3)*6.2832;
  B += vec2(cos(pa), sin(pa)) * pr * 1.7;
  float b = min(length(B), 1.55);
  vec2 bd = length(B) > 1e-4 ? normalize(B) : vec2(0.0, 1.0);
  float hb = h * (1.0 - 0.55*pr);
  vec3 o;
  o.xz = bd * hb * b * t * t * 0.85;
  o.y = hb * t * (1.0 - 0.42*b*b*t*t*0.6);
  o.y = max(o.y, 0.004*t);
  float w = iP.y * (1.0 - 0.75*t);
  o += side * p.x * w;
  vec3 tang = normalize(vec3(bd.x * b * t * 1.7, 1.0 - 0.5*b*b*t*t, bd.y * b * t * 1.7));
  nrm = normalize(cross(side, tang));
  nrm = normalize(mix(nrm, vec3(0.0,1.0,0.0), 0.45));
  vT = t; vC = iC;
  return iPos + o;
}
`;

function kindDew(k) { return k === 'meadow' ? '1.0' : (k === 'mid' ? '0.6' : '0.3'); }

export function bladeMaterial(kind) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + NOISE + BLADE_VS)
      .replace('#include <beginnormal_vertex>', 'vec3 bnrm; vec3 bpos = bladePos(position, bnrm);\nvec3 objectNormal = bnrm;')
      .replace('#include <begin_vertex>', 'vec3 transformed = bpos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vC; varying float vT; varying float vPr; varying float vHi; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uDew;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 base = mix(vec3(0.20,0.20,0.08), vec3(0.32,0.26,0.10), vC.x);
        vec3 tip = mix(vec3(0.52,0.50,0.24), vec3(0.78,0.62,0.34), vC.x);
        vec3 gc = mix(base, tip, smoothstep(0.0, 0.85, vT)) * (0.8 + 0.4*vC.y);
        gc = mix(gc, gc*1.18 + vec3(0.04,0.03,0.0), vPr*0.6);
        gc += vHi * vec3(0.20,0.15,0.05) * smoothstep(0.2, 1.0, vT);
        // dew: silvery on untouched blades, knocked off where the animal lay
        gc = mix(gc, gc*1.15 + vec3(0.10,0.11,0.13), uDew*(1.0-vPr)*${kindDew(kind)});
        gc *= 1.0 - uDew*vPr*0.35;
        diffuseColor.rgb = gc;`)
      .replace('#include <opaque_fragment>', `
        // light through the blades when backlit
        vec3 Vw = normalize(cameraPosition - vWorldP);
        float back = pow(clamp(dot(-Vw, uKeyDir), 0.0, 1.0), 3.0);
        outgoingLight += uKeyCol * diffuseColor.rgb * back * 0.55 * smoothstep(0.1, 0.9, vT);
        outgoingLight *= mix(0.55, 1.0, smoothstep(0.0, 0.5, vT));
        #include <opaque_fragment>`)
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorldP = (modelMatrix*vec4(transformed,1.0)).xyz;');
  };
  m.customProgramCacheKey = () => 'blade' + kind;
  return m;
}
export function bladeDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + NOISE + BLADE_VS)
      .replace('#include <begin_vertex>', 'vec3 bnrm; vec3 transformed = bladePos(position, bnrm);');
  };
  m.customProgramCacheKey = () => 'bladeDepth';
  return m;
}

export function makeBlades(list, segs, kind, castShadow) {
  const g = bladeGeometry(segs);
  const n = list.length;
  const a = new Float32Array(n * 3), b = new Float32Array(n * 4), c = new Float32Array(n * 4);
  list.forEach((q, i) => { a.set(q.p, i * 3); b.set(q.P, i * 4); c.set(q.C, i * 4); });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(a, 3));
  g.setAttribute('iP', new THREE.InstancedBufferAttribute(b, 4));
  g.setAttribute('iC', new THREE.InstancedBufferAttribute(c, 4));
  g.instanceCount = n;
  const mesh = new THREE.Mesh(g, bladeMaterial(kind));
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  if (castShadow) { mesh.castShadow = true; mesh.customDepthMaterial = bladeDepthMaterial(); }
  mesh.userData.full = n;
  return mesh;
}
