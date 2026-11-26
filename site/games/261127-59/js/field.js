// Field: wet cobblestone ground with paintable maps (leaf-litter coverage, wetness, stains),
// leaf-pile mound heightfield and the individual leaf simulation (instanced, ~11k leaves).
import { T, scene, tex, renderer, camera } from './core.js';

export const F = { minX: -3.2, minZ: -6.8, W: 6.4, D: 7.6 };
// map texture (R coverage, G wetness, B dry-rate noise, A unused)
export const MW = 256, MH = 304;
const mapData = new Uint8Array(MW * MH * 4);
const cov = new Float32Array(MW * MH);
const wet = new Float32Array(MW * MH);
const dryRate = new Float32Array(MW * MH);
export const fieldTex = new T.DataTexture(mapData, MW, MH, T.RGBAFormat);
fieldTex.magFilter = T.LinearFilter; fieldTex.minFilter = T.LinearFilter;
fieldTex.wrapS = fieldTex.wrapT = T.ClampToEdgeWrapping;
let mapDirty = true;

function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash(a * 57 + b * 131);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}
export function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.2; }

for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
  const k = j * MW + i;
  cov[k] = 1; wet[k] = 1;
  dryRate[k] = 0.25 + 1.2 * Math.pow(fbm(i * 0.05, j * 0.05), 2.0);
}
function syncMap() {
  for (let k = 0; k < MW * MH; k++) {
    mapData[k * 4] = cov[k] * 255; mapData[k * 4 + 1] = wet[k] * 255;
    mapData[k * 4 + 2] = Math.min(255, dryRate[k] * 120); mapData[k * 4 + 3] = 255;
  }
  fieldTex.needsUpdate = true; mapDirty = false;
}
syncMap();

// ------------------------------------------------------------ stain canvas (leaf prints on wet stone)
export const stainCanvas = document.createElement('canvas');
stainCanvas.width = 512; stainCanvas.height = 608;
const sctx = stainCanvas.getContext('2d');
sctx.fillStyle = 'rgba(255,255,255,0)'; sctx.fillRect(0, 0, 512, 608);
export const stainTex = new T.CanvasTexture(stainCanvas);
stainTex.colorSpace = T.SRGBColorSpace; stainTex.flipY = false;
function worldToStain(x, z) { return [((x - F.minX) / F.W) * 512, ((z - F.minZ) / F.D) * 608]; }
export function paintStains(atlasImg, count = 1600) {
  const cw = atlasImg.width / 4, ch = atlasImg.height / 2;
  for (let n = 0; n < count; n++) {
    const x = F.minX + Math.random() * F.W, z = F.minZ + Math.random() * F.D;
    const [sx, sy] = worldToStain(x, z);
    const cell = [0, 1, 2, 3, 4, 5][Math.floor(Math.random() * 6)];
    const s = (0.07 + Math.random() * 0.05) / F.W * 512 * 1.15;
    sctx.save(); sctx.translate(sx, sy); sctx.rotate(Math.random() * 6.28);
    sctx.globalAlpha = 0.3 + Math.random() * 0.45;
    sctx.drawImage(atlasImg, (cell % 4) * cw, Math.floor(cell / 4) * ch, cw, ch, -s / 2, -s / 2, s, s);
    sctx.restore();
  }
  stainTex.needsUpdate = true;
}

// ------------------------------------------------------------ ground material (cobble + wet + litter)
function cobbleMaterial() {
  const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const setMaps = (suffix) => {
    m.map = tex('cobble_albedo' + suffix + '.jpg', { srgb: true });
    m.normalMap = tex('cobble_normal' + suffix + '.jpg');
    m.roughnessMap = tex('cobble_orm' + suffix + '.jpg');
    m.aoMap = m.roughnessMap;
    m.needsUpdate = true;
  };
  setMaps('_s');
  m.normalScale.set(0.9, 0.9);
  m.aoMapIntensity = 1.0;
  m.userData.upgrade = () => {
    let n = 0;
    const done = () => { if (++n === 3) setMaps(''); };
    tex('cobble_albedo.jpg', { srgb: true, onLoad: done }); tex('cobble_normal.jpg', { onLoad: done }); tex('cobble_orm.jpg', { onLoad: done });
  };
  const uniforms = {
    uField: { value: fieldTex }, uStain: { value: stainTex },
    uLitter: { value: tex('litter_albedo_s.jpg', { srgb: true }) }, uLitterN: { value: tex('litter_normal.jpg') },
    uJoint: { value: tex('cobble_joint.png') },
    uFieldMin: { value: new T.Vector2(F.minX, F.minZ) }, uFieldSize: { value: new T.Vector2(F.W, F.D) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = (modelMatrix * vec4(transformed,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vWXZ; uniform sampler2D uField, uStain, uLitter, uLitterN, uJoint; uniform vec2 uFieldMin, uFieldSize;
        float gWet, gCov, gJoint, gLit;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 fuv = (vWXZ - uFieldMin) / uFieldSize;
        vec4 fm = texture2D(uField, fuv);
        vec4 st = texture2D(uStain, fuv);
        gJoint = texture2D(uJoint, vMapUv).r;
        // wet stone: darker & more saturated, joints hold water longest
        gWet = clamp(fm.g * (0.75 + 0.6*gJoint) + fm.g*0.1, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.50,0.47,0.43), gWet);
        // tannin prints left by leaves
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (st.rgb*1.5+0.1), st.a * (0.6 + 0.4*gWet));
        // large-scale patina: some stones dirtier/warmer, slightly uneven wetness
        float pat = texture2D(uField, fuv * 7.0 + 0.37).b;
        diffuseColor.rgb *= 0.86 + 0.28 * pat;
        // flattened wet leaf litter
        vec3 lit = texture2D(uLitter, vWXZ * 1.45).rgb;
        float L = dot(lit, vec3(0.3,0.5,0.2));
        gCov = fm.r;
        gLit = smoothstep(0.12, 0.42, gCov + (L - 0.3) * 0.7 - 0.25 * (1.0 - gCov));
        gLit *= step(0.01, gCov);
        diffuseColor.rgb = mix(diffuseColor.rgb, lit * 0.9, gLit);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.24, 0.08, gJoint), gWet * (1.0 - gLit));
        roughnessFactor = mix(roughnessFactor, 0.5, gLit);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        mapN.xy *= normalScale * (1.0 - 0.55*gWet*gJoint) * (1.0 - 0.3*gWet);
        vec3 ln = texture2D(uLitterN, vWXZ * 1.45).xyz * 2.0 - 1.0;
        mapN = normalize(mix(mapN, ln, gLit));
        normal = normalize( tbn * mapN );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>`);
  };
  return m;
}

export const groundMat = cobbleMaterial();
{
  const g = new T.PlaneGeometry(40, 40, 1, 1).rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
  const ground = new T.Mesh(g, groundMat);
  ground.receiveShadow = true;
  ground.position.z = -3;
  // uv in world units: shift accordingly
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -(p.getZ(i) - 3));
  scene.add(ground);
  ground.name = 'ground';
}

// ------------------------------------------------------------ grid / heightfield
export const GW = 128, GH = 152, CELL = 0.05;
const cnt = new Float32Array(GW * GH);
const tmp = new Float32Array(GW * GH);
export const hgt = new Float32Array(GW * GH);
export function heightAt(x, z) {
  const gx = (x - F.minX) / CELL - 0.5, gz = (z - F.minZ) / CELL - 0.5;
  const i = Math.max(0, Math.min(GW - 2, Math.floor(gx))), j = Math.max(0, Math.min(GH - 2, Math.floor(gz)));
  const fx = Math.max(0, Math.min(1, gx - i)), fz = Math.max(0, Math.min(1, gz - j));
  const a = hgt[j * GW + i], b = hgt[j * GW + i + 1], c = hgt[(j + 1) * GW + i], d = hgt[(j + 1) * GW + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

// mound mesh (body of piles), textured with litter
const moundGeo = new T.PlaneGeometry(F.W, F.D, GW - 1, GH - 1).rotateX(-Math.PI / 2);
{
  // PlaneGeometry after rotateX: rows go from -z to +z? fix uv to world units
  const p = moundGeo.attributes.position, uv = moundGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + F.minX + F.W / 2) * 1.45, (p.getZ(i) + F.minZ + F.D / 2) * 1.45);
}
const moundMat = new T.MeshStandardMaterial({ roughness: 0.82, metalness: 0, color: 0xd8d0c8, vertexColors: true });
moundMat.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `
    // vColor = average colour of the leaves heaped here; keep the litter's light/dark detail
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
    diffuseColor.rgb = mix(diffuseColor.rgb, vColor * (0.35 + 1.6 * lum), 0.85);`);
};
moundMat.map = tex('litter_albedo_s.jpg', { srgb: true });
moundMat.normalMap = tex('litter_normal.jpg');
moundMat.normalScale.set(1.4, 1.4);
const moundCol = new Float32Array(GW * GH * 3).fill(0.5);
moundGeo.setAttribute('color', new T.BufferAttribute(moundCol, 3));
export const mound = new T.Mesh(moundGeo, moundMat);
mound.position.set(F.minX + F.W / 2, 0, F.minZ + F.D / 2);
mound.castShadow = true; mound.receiveShadow = true;
scene.add(mound);
// vertex index -> grid cell: PlaneGeometry vertices ordered row-major from top (y+) which after rotateX(-90) is z-
const PAL = [[0.78, 0.52, 0.06], [0.55, 0.06, 0.03], [0.30, 0.15, 0.06]];
const colCnt = new Float32Array(GW * GH * 3);
function updateMound() {
  const p = moundGeo.attributes.position;
  colCnt.fill(0);
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const gi = Math.floor((L.x[i] - F.minX) / CELL), gj = Math.floor((L.z[i] - F.minZ) / CELL);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const a = gi + di, b = gj + dj;
      if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
      colCnt[(b * GW + a) * 3 + L.col[i]] += 1;
    }
  }
  for (let k = 0; k < GW * GH; k++) {
    const c0 = colCnt[k * 3], c1 = colCnt[k * 3 + 1], c2 = colCnt[k * 3 + 2], t = c0 + c1 + c2;
    if (t < 0.5) continue;
    for (let ch = 0; ch < 3; ch++) moundCol[k * 3 + ch] = (PAL[0][ch] * c0 + PAL[1][ch] * c1 + PAL[2][ch] * c2) / t;
  }
  moundGeo.attributes.color.needsUpdate = true;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const h = hgt[j * GW + i];
    p.setY(j * GW + i, h > 0.012 ? h * 0.9 - 0.006 : -0.03);
  }
  p.needsUpdate = true;
  moundGeo.computeVertexNormals();
}

// ------------------------------------------------------------ leaves
export const MAXL = 11000;
export const L = {
  n: MAXL,
  x: new Float32Array(MAXL), y: new Float32Array(MAXL), z: new Float32Array(MAXL),
  vx: new Float32Array(MAXL), vy: new Float32Array(MAXL), vz: new Float32Array(MAXL),
  yaw: new Float32Array(MAXL), rx: new Float32Array(MAXL), rz: new Float32Array(MAXL),
  wy: new Float32Array(MAXL), wx: new Float32Array(MAXL), wz: new Float32Array(MAXL),
  st: new Uint8Array(MAXL), // 0 rest, 1 air, 2 carried, 3 hidden(reserve)
  col: new Uint8Array(MAXL), // 0 yellow, 1 red, 2 brown
  cell: new Float32Array(MAXL), sc: new Float32Array(MAXL), fr: new Float32Array(MAXL),
  ph: new Float32Array(MAXL), dirty: new Uint8Array(MAXL), placed: new Uint8Array(MAXL),
};
const CELL_COLOR = [0, 1, 2, 0, 1, 2, 0, 1];
const leafGeo = new T.PlaneGeometry(1, 1, 4, 4);
const aCell = new T.InstancedBufferAttribute(L.cell, 1);
const tint = new Float32Array(MAXL * 3);
const shape = new Float32Array(MAXL * 2);
leafGeo.setAttribute('aCell', aCell);
leafGeo.setAttribute('aTint', new T.InstancedBufferAttribute(tint, 3));
leafGeo.setAttribute('aShape', new T.InstancedBufferAttribute(shape, 2));

export const leafUniforms = { uTrans: { value: null }, uTransStrength: { value: 1.0 } };
function patchLeafVertex(sh, depth) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float aCell; attribute vec3 aTint; attribute vec2 aShape; varying vec3 vTint; varying vec2 vLeafUv;`)
    .replace('#include <uv_vertex>', `#include <uv_vertex>
      vec2 cellOff = vec2(mod(aCell, 4.0), 1.0 - floor(aCell / 4.0));
      vLeafUv = vec2((uv.x + cellOff.x) * 0.25, (uv.y + cellOff.y) * 0.5);
      #ifdef USE_MAP
      vMapUv = vLeafUv;
      #endif
      #ifdef USE_NORMALMAP
      vNormalMapUv = vLeafUv;
      #endif
      vTint = aTint;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.z += aShape.x * (position.x*position.x) * 4.0 + aShape.y * (position.y+0.5)*(position.y+0.5) * 2.0 - aShape.x*0.5;`);
  if (!depth) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      objectNormal = normalize(vec3(-aShape.x * 8.0 * position.x, -aShape.y * 4.0 * (position.y + 0.5), 1.0));`);
}
const leafMat = new T.MeshStandardMaterial({ side: T.DoubleSide, alphaTest: 0.5, roughness: 1, metalness: 0 });
leafMat.normalScale.set(1.0, 1.0);
leafMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, leafUniforms);
  patchLeafVertex(sh, false);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform sampler2D uTrans; uniform float uTransStrength; varying vec3 vTint; varying vec2 vLeafUv; vec3 gTrans;`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= vTint;
      gTrans = texture2D(uTrans, vLeafUv).rgb;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = gTrans.g;`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        // thin-leaf translucency: sunlight seen through the blade; veins glow
        float back = max(0.0, -dot(normal, directLight.direction));
        float fwd = pow(max(0.0, dot(normalize(vViewPosition), directLight.direction)), 4.0);
        vec3 tcol = pow(diffuseColor.rgb, vec3(0.85)) * vec3(1.0, 0.92, 0.7);
        reflectedLight.directDiffuse += directLight.color * tcol * gTrans.r * (back * 0.75 + fwd * 1.1) * uTransStrength;
      }
      #endif`);
};
const leafDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, alphaTest: 0.5 });
leafDepth.onBeforeCompile = (sh) => { patchLeafVertex(sh, true); };

export const leafMesh = new T.InstancedMesh(leafGeo, leafMat, MAXL);
leafMesh.customDepthMaterial = leafDepth;
leafMesh.castShadow = true; leafMesh.receiveShadow = true;
leafMesh.frustumCulled = false;
leafMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
leafMesh.visible = false;
scene.add(leafMesh);

export function loadLeafTextures(onReady) {
  let n = 0;
  const done = () => { if (++n === 3) { leafMesh.visible = true; onReady && onReady(); } };
  const atlasS = tex('leaf_atlas_s.png', { srgb: true, onLoad: done });
  leafMat.map = atlasS; leafDepth.map = atlasS; leafDepth.needsUpdate = true;
  leafMat.normalMap = tex('leaf_normal.jpg', { onLoad: done });
  leafUniforms.uTrans.value = tex('leaf_trans.jpg', { onLoad: done });
  for (const t of [atlasS, leafMat.normalMap, leafUniforms.uTrans.value]) { t.wrapS = t.wrapT = T.ClampToEdgeWrapping; }
  leafMat.needsUpdate = true;
  return () => {
    const big = tex('leaf_atlas.png', { srgb: true, onLoad: () => { leafMat.map = big; leafDepth.map = big; leafMat.needsUpdate = true; leafDepth.needsUpdate = true; } });
    big.wrapS = big.wrapT = T.ClampToEdgeWrapping;
    const lb = tex('litter_albedo.jpg', { srgb: true, onLoad: () => { groundMat.userData.uniforms.uLitter.value = lb; moundMat.map = lb; moundMat.needsUpdate = true; } });
  };
}

// ---- leaf init
const SCALE_BY_COLOR = [0.105, 0.118, 0.098];
export function setLeafType(i, color) {
  L.col[i] = color;
  const cells = color === 0 ? [0, 3, 6] : color === 1 ? [1, 4, 7] : [2, 5];
  L.cell[i] = cells[Math.floor(Math.random() * cells.length)];
  L.sc[i] = SCALE_BY_COLOR[color] * (0.8 + Math.random() * 0.4);
  const v = 0.82 + Math.random() * 0.3;
  const h = (Math.random() - 0.5) * 0.12;
  tint[i * 3] = v * (1 + h); tint[i * 3 + 1] = v * (1 - Math.abs(h) * 0.5); tint[i * 3 + 2] = v * (1 - h);
  shape[i * 2] = (Math.random() - 0.3) * 0.12; shape[i * 2 + 1] = (Math.random() - 0.2) * 0.18;
  leafGeo.attributes.aTint.needsUpdate = true; leafGeo.attributes.aShape.needsUpdate = true; aCell.needsUpdate = true;
}
function pickColor(x, z) {
  const n = fbm(x * 0.6 + 10, z * 0.6 + 3);
  const left = Math.max(0, Math.min(1, 0.5 - x * 0.18));
  const r = Math.random();
  const py = 0.25 + 0.35 * left + 0.25 * (n - 0.5), pr = 0.25 + 0.3 * (1 - left);
  return r < py ? 0 : r < py + pr ? 1 : 2;
}
export let INITIAL = 6200;
export function initLeaves() {
  for (let i = 0; i < MAXL; i++) {
    const x = F.minX + Math.random() * F.W, z = F.minZ + Math.random() * F.D;
    L.x[i] = x; L.z[i] = z; L.y[i] = 0;
    setLeafType(i, pickColor(x, z));
    L.yaw[i] = Math.random() * Math.PI * 2;
    L.rx[i] = (Math.random() - 0.5) * 0.25; L.rz[i] = (Math.random() - 0.5) * 0.25;
    if (Math.random() < 0.18) L.rx[i] += Math.PI; // some upside-down
    L.fr[i] = Math.random(); L.ph[i] = Math.random() * 100;
    L.st[i] = i < INITIAL ? 0 : 3;
    L.dirty[i] = 1;
  }
  recomputeGrid();
  updateMatrices(true);
}

const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _p = new T.Vector3(), _s = new T.Vector3();
const qBase = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
const zero = new T.Matrix4().makeScale(0, 0, 0);
function writeMatrix(i) {
  if (L.st[i] === 3) { leafMesh.setMatrixAt(i, zero); return; }
  _e.set(L.rx[i], L.yaw[i], L.rz[i]);
  _q.setFromEuler(_e).multiply(qBase);
  _p.set(L.x[i], L.y[i], L.z[i]);
  const s = L.sc[i];
  _s.set(s, s, s);
  _m.compose(_p, _q, _s);
  leafMesh.setMatrixAt(i, _m);
}
function updateMatrices(all) {
  let any = false;
  for (let i = 0; i < MAXL; i++) {
    if (all || L.dirty[i]) { writeMatrix(i); L.dirty[i] = 0; any = true; }
  }
  if (any) leafMesh.instanceMatrix.needsUpdate = true;
}

let gridDirty = true;
const restH = new Float32Array(MAXL);
export function recomputeGrid() {
  cnt.fill(0);
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const gi = Math.floor((L.x[i] - F.minX) / CELL), gj = Math.floor((L.z[i] - F.minZ) / CELL);
    if (gi < 0 || gj < 0 || gi >= GW || gj >= GH) continue;
    cnt[gj * GW + gi] += 1;
  }
  // separable box blur x2 (radius 2) => smooth dome
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < GH; j++) {
      let s = 0; const row = j * GW;
      for (let i = -2; i <= 2; i++) s += cnt[row + Math.max(0, Math.min(GW - 1, i))];
      for (let i = 0; i < GW; i++) {
        tmp[row + i] = s / 5;
        s += cnt[row + Math.min(GW - 1, i + 3)] - cnt[row + Math.max(0, i - 2)];
      }
    }
    for (let i = 0; i < GW; i++) {
      let s = 0;
      for (let j = -2; j <= 2; j++) s += tmp[Math.max(0, Math.min(GH - 1, j)) * GW + i];
      for (let j = 0; j < GH; j++) {
        cnt[j * GW + i] = s / 5;
        s += tmp[Math.min(GH - 1, j + 3) * GW + i] - tmp[Math.max(0, j - 2) * GW + i];
      }
    }
  }
  for (let k = 0; k < GW * GH; k++) {
    const c = cnt[k] - 1.1;
    if (c > 0) { const raw = Math.pow(c, 0.85) * 0.032; hgt[k] = 0.4 * (1 - Math.exp(-raw / 0.4)); } else hgt[k] = 0;
  }
  updateMound();
  // reseat resting leaves
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const h = heightAt(L.x[i], L.z[i]);
    const y = 0.003 + L.fr[i] * 0.012 + (h > 0.01 ? h * (0.86 + 0.16 * L.fr[i]) : 0);
    if (Math.abs(y - L.y[i]) > 0.002) { L.y[i] = y; L.dirty[i] = 1; }
    restH[i] = h;
  }
  gridDirty = false;
}

// ------------------------------------------------------------ painting maps
function toMap(x, z) { return [((x - F.minX) / F.W) * MW, ((z - F.minZ) / F.D) * MH]; }
let reserveCursor = 0;
function takeReserve() {
  for (let k = 0; k < MAXL; k++) {
    const i = (reserveCursor + k) % MAXL;
    if (L.st[i] === 3) { reserveCursor = i + 1; return i; }
  }
  return -1;
}
// erase litter coverage along a capsule; returns erased amount (m^2 of full coverage)
let peelAcc = 0;
export function eraseCoverage(x0, z0, x1, z1, radius, strength, front) {
  const [a0, b0] = toMap(x0, z0), [a1, b1] = toMap(x1, z1);
  const r = radius / F.W * MW;
  const minI = Math.max(0, Math.floor(Math.min(a0, a1) - r)), maxI = Math.min(MW - 1, Math.ceil(Math.max(a0, a1) + r));
  const minJ = Math.max(0, Math.floor(Math.min(b0, b1) - r)), maxJ = Math.min(MH - 1, Math.ceil(Math.max(b0, b1) + r));
  const dx = a1 - a0, dy = b1 - b0, len2 = dx * dx + dy * dy || 1e-6;
  let erased = 0;
  for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
    let t = ((i - a0) * dx + (j - b0) * dy) / len2; t = Math.max(0, Math.min(1, t));
    const ex = a0 + dx * t - i, ey = b0 + dy * t - j;
    const d = Math.sqrt(ex * ex + ey * ey) / r;
    if (d >= 1) continue;
    const k = j * MW + i;
    const f = (1 - d * d) * strength * (0.6 + 0.8 * dryRate[k] * 0.5);
    const before = cov[k];
    cov[k] = Math.max(0, cov[k] - f);
    erased += before - cov[k];
  }
  if (erased > 0) mapDirty = true;
  const area = erased * (F.W / MW) * (F.D / MH);
  // peeled wet leaves become loose leaves in front of the broom
  peelAcc += area * 160;
  while (peelAcc >= 1) {
    peelAcc -= 1;
    const i = takeReserve(); if (i < 0) break;
    L.x[i] = front[0] + (Math.random() - 0.5) * radius * 1.6; L.z[i] = front[1] + (Math.random() - 0.5) * 0.06;
    L.st[i] = 0; L.fr[i] = Math.random(); L.dirty[i] = 1;
    setLeafType(i, pickColor(L.x[i], L.z[i]));
    L.yaw[i] = Math.random() * 6.28; L.rx[i] = (Math.random() - 0.5) * 0.4; L.rz[i] = (Math.random() - 0.5) * 0.4;
  }
  gridDirty = true;
  return area;
}
export function wetAt(x, z) { const [a, b] = toMap(x, z); return wet[Math.max(0, Math.min(MH - 1, b | 0)) * MW + Math.max(0, Math.min(MW - 1, a | 0))]; }
export function coverageIn(x0, z0, x1, z1) {
  const [a0, b0] = toMap(x0, z0), [a1, b1] = toMap(x1, z1);
  let s = 0, n = 0;
  for (let j = Math.max(0, b0 | 0); j < Math.min(MH, b1 | 0); j += 2) for (let i = Math.max(0, a0 | 0); i < Math.min(MW, a1 | 0); i += 2) { s += cov[j * MW + i]; n++; }
  return n ? s / n : 0;
}
export function looseLeavesIn(x0, z0, x1, z1, maxH = 0.035) {
  let n = 0;
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0 && L.st[i] !== 1) continue;
    if (L.x[i] > x0 && L.x[i] < x1 && L.z[i] > z0 && L.z[i] < z1 && (L.st[i] === 1 || restH[i] < maxH)) n++;
  }
  return n;
}

// ------------------------------------------------------------ tools acting on leaves
// Push leaves like a broom / rake: snow-plough model. colorMask: bitmask of colours that follow strongly.
export function pushLeaves(x0, z0, x1, z1, width, opts = {}) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 1e-4) return 0;
  const nx = dx / len, nz = dz / len;
  const px = -nz, pz = nx;
  const half = width / 2;
  const mask = opts.colorMask ?? 7, weak = opts.weak ?? 1.0;
  const lift = opts.lift ?? 0.02;
  let moved = 0;
  for (let i = 0; i < MAXL; i++) {
    const s = L.st[i];
    if (s !== 0) continue;
    const rx = L.x[i] - x0, rz = L.z[i] - z0;
    const along = rx * nx + rz * nz, lat = rx * px + rz * pz;
    if (along < -0.06 || along > len + 0.05 || Math.abs(lat) > half) continue;
    const h = restH[i];
    // the broom can't reach the top of a tall pile
    if (h > 0.2 && L.fr[i] > 0.7 && Math.random() < 0.7) continue;
    const follow = ((mask >> L.col[i]) & 1) ? 1 : weak;
    if (follow < 1 && Math.random() > follow) continue;
    const target = len + 0.012 + Math.random() * 0.035;
    const push = target - along;
    if (push <= 0) continue;
    L.x[i] += nx * push + px * (Math.random() - 0.5) * 0.02 * (1 + Math.abs(lat) / half);
    L.z[i] += nz * push + pz * (Math.random() - 0.5) * 0.02 * (1 + Math.abs(lat) / half);
    L.yaw[i] += (Math.random() - 0.5) * 0.6;
    L.rx[i] = (L.rx[i] > 1.5 ? Math.PI : 0) + (Math.random() - 0.5) * 0.6;
    L.rz[i] = (Math.random() - 0.5) * 0.6;
    L.dirty[i] = 1; moved++;
    // flick a few into the air (dry leaves skitter)
    if (Math.random() < lift * Math.min(1, len * 30)) {
      L.st[i] = 1; L.vy[i] = 0.6 + Math.random() * 0.9; L.vx[i] = nx * (0.8 + Math.random()) + px * (Math.random() - 0.5);
      L.vz[i] = nz * (0.8 + Math.random()) + pz * (Math.random() - 0.5); L.y[i] += 0.03;
      L.wy[i] = (Math.random() - 0.5) * 8; L.wx[i] = (Math.random() - 0.5) * 10; L.wz[i] = (Math.random() - 0.5) * 10;
    }
  }
  if (moved) gridDirty = true;
  return moved;
}

// burst a pile: leaves near (x,z) jump into the air. strength ~ 0.5..2.5
export function burst(x, z, radius, strength) {
  let n = 0;
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const dx = L.x[i] - x, dz = L.z[i] - z, d = Math.hypot(dx, dz);
    if (d > radius) continue;
    const f = (1 - d / radius);
    if (Math.random() > 0.35 + 0.65 * f * Math.min(1, strength)) continue;
    const up = (0.6 + 0.4 * L.fr[i]) * strength * (1.4 + Math.random() * 2.2) * (0.5 + f * 0.8);
    L.st[i] = 1; L.vy[i] = up;
    const out = strength * (0.3 + Math.random() * 1.0);
    L.vx[i] = (dx / (d + 0.01)) * out + (Math.random() - 0.5) * 0.6;
    L.vz[i] = (dz / (d + 0.01)) * out + (Math.random() - 0.5) * 0.6;
    L.wy[i] = (Math.random() - 0.5) * 10; L.wx[i] = (Math.random() - 0.5) * 14; L.wz[i] = (Math.random() - 0.5) * 14;
    L.y[i] += 0.02; n++;
  }
  gridDirty = true;
  return n;
}

// lay a single leaf on the ground (pattern drawing)
let placeCursor = 0;
export function placeLeaf(x, z, color, yaw) {
  let i = takeReserve();
  if (i < 0) {
    // recycle loose leaves far from the action
    for (let k = 0; k < MAXL; k++) { const j = (placeCursor + k) % MAXL; if (L.st[j] === 0 && !L.placed[j] && restH[j] < 0.01) { i = j; placeCursor = j + 1; break; } }
  }
  if (i < 0) return -1;
  setLeafType(i, color);
  L.st[i] = 1; L.x[i] = x; L.z[i] = z; L.y[i] = 0.16; L.vx[i] = 0; L.vz[i] = 0; L.vy[i] = -0.3;
  L.yaw[i] = yaw; L.rx[i] = 0.3; L.rz[i] = 0.2; L.wx[i] = -0.6; L.wz[i] = -0.4; L.wy[i] = 0;
  L.placed[i] = 1; L.fr[i] = 0.9;
  return i;
}

// carried group (dad's armful)
export const carry = { list: [], ox: new Float32Array(MAXL), oy: new Float32Array(MAXL), oz: new Float32Array(MAXL), anchor: new T.Vector3() };
export function pickUp(x, z, radius, anchor) {
  carry.list.length = 0;
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const dx = L.x[i] - x, dz = L.z[i] - z;
    if (dx * dx + dz * dz > radius * radius) continue;
    L.st[i] = 2; carry.list.push(i);
    const a = Math.random() * 6.28, r = Math.sqrt(Math.random());
    carry.ox[i] = Math.cos(a) * r * 0.32; carry.oz[i] = Math.sin(a) * r * 0.2; carry.oy[i] = (Math.random() - 0.3) * 0.26 * (1 - r * 0.6);
  }
  carry.anchor.copy(anchor);
  gridDirty = true;
  return carry.list.length;
}
export function dropCarried(vx, vz, spread) {
  // the armful explodes forward: leaves are flung over a wide fan and flutter down
  const sp = Math.hypot(vx, vz) || 1, fx = vx / sp, fz = vz / sp;
  for (const i of carry.list) {
    L.st[i] = 1;
    const fwd = Math.random() * 2.6, side = (Math.random() - 0.5) * spread * (0.4 + fwd * 0.5);
    L.x[i] += fx * fwd * 0.5 - fz * side * 0.5; L.z[i] += fz * fwd * 0.5 + fx * side * 0.5;
    L.y[i] += Math.random() * 0.8;
    L.vx[i] = fx * fwd * 1.4 - fz * side * 1.2;
    L.vz[i] = fz * fwd * 1.4 + fx * side * 1.2;
    L.vy[i] = 1.2 + Math.random() * 2.8;
    L.wy[i] = (Math.random() - 0.5) * 10; L.wx[i] = (Math.random() - 0.5) * 12; L.wz[i] = (Math.random() - 0.5) * 12;
  }
  carry.list.length = 0;
}

// ------------------------------------------------------------ wind
export const wind = { x: 0.15, z: 0.05, gust: 0, t: 0, next: 6, dir: 0.4 };
export function gust(power = 1) { wind.gust = power; wind.dir = -0.3 + Math.random() * 1.2; liftPileTops(power); }
function liftPileTops(power) {
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const h = restH[i];
    let p = 0;
    if (h > 0.06 && L.fr[i] > 0.82) p = 0.22 * power;
    else if (h < 0.01 && !L.placed[i]) p = 0.012 * power; // loose leaves skitter
    if (Math.random() < p) {
      L.st[i] = 1; L.vy[i] = (h > 0.06 ? 0.7 + Math.random() * 1.0 : 0.15 + Math.random() * 0.3) * power;
      L.vx[i] = Math.cos(wind.dir) * (0.6 + Math.random()) * power; L.vz[i] = Math.sin(wind.dir) * (0.4 + Math.random()) * power;
      L.wy[i] = (Math.random() - 0.5) * 8; L.wx[i] = (Math.random() - 0.5) * 10; L.wz[i] = (Math.random() - 0.5) * 10;
      L.y[i] += 0.01;
    }
  }
}

// ------------------------------------------------------------ step
let gridTimer = 0;
export const stats = { air: 0, landedRecently: 0 };
export function step(dt, t) {
  wind.gust *= Math.exp(-dt * 0.8);
  const wx = wind.x + Math.cos(wind.dir) * wind.gust * 1.6, wz = wind.z + Math.sin(wind.dir) * wind.gust * 1.0;
  let air = 0, landed = 0;
  const kdH = 1 - Math.exp(-dt * 2.4);
  for (let i = 0; i < MAXL; i++) {
    const s = L.st[i];
    if (s === 1) {
      air++;
      const ph = L.ph[i] + t * 3.1;
      // flutter: drag toward wind, oscillating side-slip
      L.vx[i] += (wx - L.vx[i]) * kdH + Math.sin(ph) * 1.2 * dt;
      L.vz[i] += (wz - L.vz[i]) * kdH + Math.cos(ph * 1.3) * 1.0 * dt;
      L.vy[i] += -9.8 * dt;
      L.vy[i] -= L.vy[i] * Math.min(1, dt * (L.vy[i] < 0 ? 11 : 1.6));
      L.x[i] += L.vx[i] * dt; L.y[i] += L.vy[i] * dt; L.z[i] += L.vz[i] * dt;
      L.yaw[i] += L.wy[i] * dt; L.rx[i] += L.wx[i] * dt; L.rz[i] += L.wz[i] * dt;
      L.wx[i] *= Math.exp(-dt * 0.6); L.wz[i] *= Math.exp(-dt * 0.6);
      L.rx[i] += Math.sin(ph * 1.7) * dt * 1.5;
      // keep in field
      if (L.x[i] < F.minX + 0.02) { L.x[i] = F.minX + 0.02; L.vx[i] *= -0.3; }
      if (L.x[i] > F.minX + F.W - 0.02) { L.x[i] = F.minX + F.W - 0.02; L.vx[i] *= -0.3; }
      if (L.z[i] < F.minZ + 0.25) { L.z[i] = F.minZ + 0.25; L.vz[i] *= -0.3; }
      if (L.z[i] > F.minZ + F.D - 0.02) { L.z[i] = F.minZ + F.D - 0.02; L.vz[i] *= -0.3; }
      const g = heightAt(L.x[i], L.z[i]);
      if (L.y[i] <= g + 0.006 && L.vy[i] <= 0) {
        L.st[i] = 0; landed++;
        L.rx[i] = (Math.cos(L.rx[i]) < 0 ? Math.PI : 0) + (Math.random() - 0.5) * 0.35;
        L.rz[i] = (Math.random() - 0.5) * 0.35;
        L.y[i] = g + 0.004; gridDirty = true;
      }
      L.dirty[i] = 1;
    } else if (s === 2) {
      L.x[i] = carry.anchor.x + carry.ox[i]; L.y[i] = carry.anchor.y + carry.oy[i]; L.z[i] = carry.anchor.z + carry.oz[i];
      L.dirty[i] = 1;
    }
  }
  stats.air = air; stats.landedRecently = landed;
  // drying of exposed stone
  let anyDry = false;
  if ((t * 10 | 0) % 2 === 0) {
    for (let k = 0; k < MW * MH; k++) {
      if (cov[k] < 0.25 && wet[k] > 0.18) { wet[k] -= dt * 0.006 * dryRate[k] * 2; anyDry = true; }
    }
    if (anyDry) mapDirty = true;
  }
  gridTimer -= dt;
  if (gridDirty && gridTimer <= 0) { recomputeGrid(); gridTimer = 0.06; }
  updateMatrices(false);
  if (mapDirty) syncMap();
}

// a leaf detaches from a tree canopy and flutters down
export function dropFromTree(x, y, z, color) {
  const i = takeReserve(); if (i < 0) return -1;
  setLeafType(i, color);
  L.st[i] = 1; L.x[i] = x; L.y[i] = y; L.z[i] = z; L.vx[i] = 0; L.vy[i] = -0.2; L.vz[i] = 0;
  L.wy[i] = (Math.random() - 0.5) * 4; L.wx[i] = (Math.random() - 0.5) * 6; L.wz[i] = (Math.random() - 0.5) * 6;
  L.fr[i] = Math.random(); L.placed[i] = 0;
  return i;
}
// count resting leaves of each colour inside a disc
export function countInDisc(x, z, r) {
  const c = [0, 0, 0];
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const dx = L.x[i] - x, dz = L.z[i] - z;
    if (dx * dx + dz * dz < r * r) c[L.col[i]]++;
  }
  return c;
}
// strongest pile (max height) inside a rect
export function biggestPile(x0, z0, x1, z1) {
  let best = 0, bx = 0, bz = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = F.minX + (i + 0.5) * CELL, z = F.minZ + (j + 0.5) * CELL;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    const h = hgt[j * GW + i];
    if (h > best) { best = h; bx = x; bz = z; }
  }
  return { h: best, x: bx, z: bz };
}
// most leaf-covered spot inside a rect (coverage or loose leaves) for hints
export function dirtiestSpot(x0, z0, x1, z1) {
  let best = -1, bx = 0, bz = 0;
  for (let z = z0 + 0.2; z < z1; z += 0.3) for (let x = x0 + 0.15; x < x1; x += 0.3) {
    const v = coverageIn(x - 0.15, z - 0.15, x + 0.15, z + 0.15) * 3 + looseLeavesIn(x - 0.15, z - 0.15, x + 0.15, z + 0.15) / 20;
    if (v > best) { best = v; bx = x; bz = z; }
  }
  return { v: best, x: bx, z: bz };
}
// leaves near the car get blown aside
export function carWake(x, z, halfW, halfL, speed) {
  if (speed < 0.3) return;
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const dx = L.x[i] - x, dz = L.z[i] - z;
    if (Math.abs(dx) > halfW + 0.35 || Math.abs(dz) > halfL + 0.3) continue;
    if (Math.random() > 0.25) continue;
    L.st[i] = 1; L.vy[i] = 0.4 + Math.random() * 0.8 * speed * 0.4;
    const side = dz >= 0 ? 1 : -1; // car travels along +x
    L.vz[i] = side * (0.8 + Math.random()) * speed * 0.5; L.vx[i] = speed * (0.3 + Math.random() * 0.5);
    L.wy[i] = (Math.random() - 0.5) * 8; L.wx[i] = (Math.random() - 0.5) * 10; L.wz[i] = (Math.random() - 0.5) * 10;
    L.y[i] += 0.01;
  }
}

// set a mat down: leaves underneath are shoved out to its rim
export function clearDisc(x, z, r) {
  for (let i = 0; i < MAXL; i++) {
    if (L.st[i] !== 0) continue;
    const dx = L.x[i] - x, dz = L.z[i] - z, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    const a = d > 1e-3 ? Math.atan2(dz, dx) : Math.random() * 6.28;
    const nr = r + 0.02 + Math.random() * 0.08;
    L.x[i] = x + Math.cos(a) * nr; L.z[i] = z + Math.sin(a) * nr; L.dirty[i] = 1;
  }
  gridDirty = true;
}
