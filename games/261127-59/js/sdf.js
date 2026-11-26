// Signed-distance modelling + surface-nets mesher. Used for gloved hands and people,
// so bodies are one organic surface (no capsule/cylinder joints).
import { T } from './core.js';
import { surfaceNets } from './sdfcore.js';
export * from './sdfcore.js';

// build BufferGeometry from raw arrays
export function toGeometry(r) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(r.pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(r.nor, 3));
  g.setAttribute('color', new T.BufferAttribute(r.col, 3));
  g.setAttribute('aMat', new T.BufferAttribute(r.mat, 1));
  g.setAttribute('aRough', new T.BufferAttribute(r.rough, 1));
  g.setAttribute('aRest', new T.BufferAttribute(r.rest || r.pos.slice(), 3));
  if (r.skinI) { g.setAttribute('skinIndex', new T.BufferAttribute(r.skinI, 4)); g.setAttribute('skinWeight', new T.BufferAttribute(r.skinW, 4)); }
  g.setIndex(new T.BufferAttribute(r.ind, 1));
  return g;
}
export function mesh(sdf, bmin, bmax, step, attr) { return toGeometry(surfaceNets(sdf, bmin, bmax, step, attr)); }
// binary mesh format written by tools/bake.mjs
export async function loadBin(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const h = new Uint32Array(buf, 0, 4); // N, nInd, hasSkin, pad
  const N = h[0], NI = h[1], skin = h[2] & 1, u16 = h[2] & 2;
  const bb = new Float32Array(buf, 16, 6);
  let o = 40;
  const take = (Ctor, n) => { const a = new Ctor(buf.slice(o, o + n * Ctor.BYTES_PER_ELEMENT)); o += n * Ctor.BYTES_PER_ELEMENT; o = (o + 3) & ~3; return a; };
  const q = take(Uint16Array, N * 3);
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) { const k = i % 3; pos[i] = bb[k] + (q[i] / 65535) * bb[3 + k]; }
  const nor8 = take(Int8Array, N * 3), col8 = take(Uint8Array, N * 3), mat8 = take(Uint8Array, N), r8 = take(Uint8Array, N);
  const nor = new Float32Array(N * 3), col = new Float32Array(N * 3), mat = new Float32Array(N), rough = new Float32Array(N);
  for (let i = 0; i < N * 3; i++) { nor[i] = nor8[i] / 127; col[i] = col8[i] / 255; }
  for (let i = 0; i < N; i++) { mat[i] = mat8[i]; rough[i] = r8[i] / 255; }
  let skinI = null, skinW = null;
  if (skin) { skinI = new Uint16Array(take(Uint8Array, N * 4)); const w8 = take(Uint8Array, N * 4); skinW = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) skinW[i] = w8[i] / 255; }
  const ind = u16 ? take(Uint16Array, NI) : take(Uint32Array, NI);
  return toGeometry({ pos, nor, col, mat, rough, skinI, skinW, ind });
}
// Material for SDF meshes: per-vertex albedo/roughness + procedural micro-relief by fabric type
// mat ids: 0 skin, 1 knit cotton (glove), 2 wool twill, 3 hair, 4 leather, 5 cotton weave, 6 denim, 7 metal(brass), 8 felt
export function clothMaterial(opts = {}) {
  const m = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0, sheen: 0.6, sheenRoughness: 0.55, sheenColor: new T.Color(0.6, 0.6, 0.6), ...opts });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMat; attribute float aRough; attribute vec3 aRest; varying float vMat; varying float vRough; varying vec3 vRest; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vRough = aRough; vRest = aRest; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vMat; varying float vRough; varying vec3 vRest; varying vec3 vObjN;
        float hsh(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z); }
        vec3 perturbArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos)); vec3 vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); return normalize(abs(fDet) * surf_norm - vGrad); }
        float relief(vec3 p, float id){
          vec3 an = abs(normalize(vObjN));
          if (id < 0.5) return vn(p*900.0)*0.15 + vn(p*180.0)*0.25;               // skin pores
          if (id < 1.5) { // knit loops
            float a = an.x > an.z ? p.z : p.x;
            return abs(sin(a*1400.0)) * 0.6 + abs(sin(p.y*900.0 + sin(a*700.0)*1.5))*0.4 + vn(p*600.0)*0.3; }
          if (id < 2.5) { float a = an.x > an.z ? p.z : p.x; return sin((a + p.y)*1100.0)*0.5 + vn(p*500.0)*0.35 + vn(p*60.0)*0.3; } // twill
          if (id < 3.5) { float a = an.x > an.z ? p.z : p.x; return vn(vec3(a*900.0, p.y*40.0, a*700.0))*0.9 + vn(p*120.0)*0.3; } // hair strands
          if (id < 4.5) return vn(p*300.0)*0.3 + vn(p*40.0)*0.4;                // leather
          if (id < 5.5) { float a = an.x > an.z ? p.z : p.x; return (sin(a*1800.0)*sin(p.y*1800.0))*0.3 + vn(p*400.0)*0.3 + vn(p*50.0)*0.3; }
          if (id < 6.5) { float a = an.x > an.z ? p.z : p.x; return sin((a - p.y)*1500.0)*0.4 + vn(p*500.0)*0.4; } // denim
          if (id < 7.5) return vn(p*200.0)*0.15;
          if (id > 8.5) return vn(p*30.0)*0.04;
          return vn(p*700.0)*0.5 + vn(p*90.0)*0.3; // felt
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = (vMat > 6.5 && vMat < 7.5) || (vMat > 10.5 && vMat < 11.5) ? 1.0 : 0.0;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float id = floor(vMat + 0.5);
          float hgt = relief(vRest, id);
          vec2 dh = vec2(dFdx(hgt), dFdy(hgt));
          float amp = id > 8.5 ? 0.0004 : id < 0.5 ? 0.0012 : id < 1.5 ? 0.012 : id < 3.5 ? 0.005 : 0.004;
          float fade = 1.0 / (1.0 + length(dh) * 1.5);
          normal = perturbArb(-vViewPosition, normal, dh * amp * 60.0 * fade, faceDirection);
        }`);
  };
  return m;
}
