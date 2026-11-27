// Runtime giraffe: skinned mesh, reticulated coat shader, small parts, pose solver and animator.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const D2R = Math.PI / 180;
const HA = -32 * D2R;
export const HEAD_F = new THREE.Vector3(Math.cos(HA), Math.sin(HA), 0);
export const HEAD_U = new THREE.Vector3(-Math.sin(HA), Math.cos(HA), 0);
export function headPt(f, u, z = 0) { return new THREE.Vector3(1.74 + HEAD_F.x * f + HEAD_U.x * u, 3.90 + HEAD_F.y * f + HEAD_U.y * u, z); }

// shared light uniforms (updated by the world each frame)
export const LIGHT = {
  dir: { value: new THREE.Vector3(0, 1, 0) },       // world direction toward the key light
  col: { value: new THREE.Color(1, 1, 1) },        // key light colour * intensity
  sky: { value: new THREE.Color(0.3, 0.35, 0.45) },
};

// ------------------------------------------------------------------------------------------------
// coat material
function coatMaterial(seed, tint) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, sheen: 0.55, sheenRoughness: 0.55, sheenColor: new THREE.Color(0.9, 0.75, 0.55) });
  const uni = { uSeed: { value: seed }, uTint: { value: tint }, uKeyDir: LIGHT.dir, uKeyCol: LIGHT.col };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 coat; attribute float pale; varying vec3 vRest; varying vec4 vCoat; varying float vPale; varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRest = position; vCoat = coat; vPale = pale;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRest; varying vec4 vCoat; varying float vPale; varying vec3 vWPos;\nuniform vec3 uSeed; uniform vec3 uTint; uniform vec3 uKeyDir; uniform vec3 uKeyCol;\n${NOISE}
void voro(vec3 x, out float border, out vec3 cid, out float cdist){
  vec3 n = floor(x), f = fract(x);
  float d1 = 9.0, d2 = 9.0; vec3 r1 = vec3(0.0), r2 = vec3(1.0); cid = n;
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 g = vec3(float(i),float(j),float(k));
    vec3 o = h33(n+g+uSeed)*0.8+0.1;
    vec3 r = g + o - f; float d = dot(r,r);
    if(d<d1){ d2=d1; r2=r1; d1=d; r1=r; cid=n+g; } else if(d<d2){ d2=d; r2=r; }
  }
  border = dot(0.5*(r1+r2), normalize(r2-r1));
  cdist = sqrt(d1);
}
void giraffePat(float cell, float lw, out float inP, out vec3 pc){
  vec3 q = vRest/cell;
  q += (vec3(vnoise(q*0.9+uSeed), vnoise(q*0.9+uSeed+11.0), vnoise(q*0.9+uSeed+23.0))-0.5)*0.55;
  float border; vec3 cid; float cdist;
  voro(q, border, cid, cdist);
  border += (vnoise(q*7.0)-0.5)*0.035*(1.0 - smoothstep(0.08, 0.3, length(fwidth(q))));
  float aa = max(fwidth(border)*0.9, 0.004);
  inP = smoothstep(lw-aa, lw+aa, border);
  float cr = h31(cid+uSeed*3.1);
  pc = mix(vec3(0.20,0.062,0.018), vec3(0.34,0.115,0.035), cr) * uTint;
  pc *= mix(1.0, 0.72, smoothstep(0.55, 0.05, cdist)*step(0.35, cr));
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float patchAmt = vCoat.x; float ao = vCoat.y; float darkM = vCoat.z; float scl = max(0.18, vCoat.w*1.53);
  // the pattern is evaluated at fixed patch sizes (body / legs / face) and blended where regions meet,
  // so the cells never get squeezed by a varying scale
  float widen = smoothstep(0.45, 0.6, scl);
  float lwExtra = (1.0-patchAmt)*0.6*widen;
  float c0, c1, tB;
  if (scl >= 0.62) { c0 = 1.0; c1 = 0.62; tB = clamp((1.0-scl)/0.38, 0.0, 1.0); }
  else { c0 = 0.62; c1 = 0.42; tB = clamp((0.62-scl)/0.2, 0.0, 1.0); }
  float inPatch; vec3 patchCol; float ip2; vec3 pc2;
  if (tB < 0.98) giraffePat(0.155*c0, mix(0.042, 0.06, 1.0-c0) + lwExtra, inPatch, patchCol);
  if (tB > 0.02) {
    giraffePat(0.155*c1, mix(0.042, 0.06, 1.0-c1) + lwExtra, ip2, pc2);
    if (tB >= 0.98) { inPatch = ip2; patchCol = pc2; }
    else { inPatch = mix(inPatch, ip2, tB); patchCol = mix(patchCol, pc2, tB); }
  }
  patchCol = mix(patchCol, patchCol*vec3(1.25,1.2,1.15), smoothstep(0.6, 0.25, scl));
  vec3 cream = mix(vec3(0.74,0.66,0.50), vec3(0.80,0.73,0.58), vPale);
  vec3 lineCol = vec3(0.72,0.63,0.47);
  vec3 col = mix(mix(lineCol, cream, 1.0-patchAmt), patchCol, inPatch*step(0.02,patchAmt));
  vec3 faceTan = vec3(0.45,0.30,0.17)*uTint;
  col = mix(col, mix(faceTan, faceTan*0.8, inPatch), (1.0-widen)*(1.0-patchAmt)*1.4);
  // muzzle / pale regions
  col = mix(col, vec3(0.36,0.26,0.17), vPale*0.8*(1.0-inPatch*patchAmt));
  // hair grain: fine directional noise
  // fine hair grain, faded out when it would alias (distance / small screen size)
  vec3 gp = vRest*140.0;
  float gfw = length(fwidth(gp));
  float grain = vnoise(gp);
  col *= 1.0 + (grain-0.5)*0.12*(1.0 - smoothstep(0.35, 0.9, gfw));
  // hooves, ossicone tufts, tail tip
  col = mix(col, vec3(0.045,0.038,0.033), darkM);
  diffuseColor.rgb = col;
`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = mix(0.82, 0.45, darkM*step(vRest.y, 0.13));`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= mix(0.35, 1.0, ao); reflectedLight.directDiffuse *= mix(0.7, 1.0, ao); reflectedLight.indirectSpecular *= ao;`)
      .replace('#include <opaque_fragment>', `
  // backlit fur: bright rim when the key light is behind the animal
  vec3 Vw = normalize(cameraPosition - vWPos);
  vec3 Nw = normalize((vec4(normal,0.0)*viewMatrix).xyz);
  float rim = pow(1.0 - clamp(dot(Nw, Vw), 0.0, 1.0), 3.0);
  float back = clamp(dot(-Vw, uKeyDir), 0.0, 1.0);
  outgoingLight += uKeyCol * diffuseColor.rgb * rim * (0.25 + 1.6*back*back) * ao * 0.9;
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'giraffeCoat';
  return m;
}

// ------------------------------------------------------------------------------------------------
// hair strands geometry (tufts, mane, tail switch)
function strandGeometry(strands, segs, widthFn) {
  // strands: [{root:Vector3, dir:Vector3, len, curl:Vector3, w, bone, col}]
  const pos = [], col = [], idx = [], si = [], sw = [], tt = [];
  let v = 0;
  for (const s of strands) {
    const side = new THREE.Vector3().crossVectors(s.dir, s.view || new THREE.Vector3(0, 0, 1)).normalize();
    if (side.lengthSq() < 0.1) side.set(1, 0, 0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = s.root.clone().addScaledVector(s.dir, s.len * t).addScaledVector(s.curl, s.len * t * t);
      const w = s.w * widthFn(t);
      for (const sgn of [-1, 1]) {
        pos.push(p.x + side.x * w * sgn, p.y + side.y * w * sgn, p.z + side.z * w * sgn);
        col.push(s.col[0], s.col[1], s.col[2]);
        si.push(s.bone[0], s.bone[1] ?? s.bone[0], 0, 0);
        const b = s.bone[2] ?? 1;
        sw.push(b, 1 - b, 0, 0);
        tt.push(t);
      }
      if (i < segs) { idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      v += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('strandT', new THREE.Float32BufferAttribute(tt, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function hairMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float strandT; varying float vT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = strandT;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vT;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.5, vT));');
  };
  m.customProgramCacheKey = () => 'giraffeHair';
  return m;
}

function earGeometry() {
  // leaf-shaped cupped ear, base at origin, pointing +x, opening facing +z (outward-forward), built in ear-bone space
  const U = 14, Vn = 9, L = 0.165;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= U; i++) {
    const u = i / U;
    const w = 0.058 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.8) + 0.014 * (1 - u);
    for (let j = 0; j <= Vn; j++) {
      const v = j / Vn * 2 - 1;
      const x = u * L;
      const y = v * w;
      const z = -0.034 * (1 - v * v) * Math.sin(Math.PI * Math.min(1, u * 1.1)) + 0.010 * u * u;
      pos.push(x, y, z); uv.push(u, (v + 1) / 2);
    }
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < Vn; j++) {
    const a = i * (Vn + 1) + j, b = a + Vn + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function earMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 e = vUv;
      float edge = smoothstep(0.32, 0.5, abs(e.y-0.5));
      float n = vnoise(vec3(e*vec2(60.0,25.0),1.0));
      vec3 outer = mix(vec3(0.33,0.17,0.08), vec3(0.12,0.07,0.04), smoothstep(0.72,1.0,e.x));
      vec3 inner = mix(vec3(0.70,0.60,0.46), vec3(0.36,0.25,0.16), edge);
      inner = mix(inner, vec3(0.16,0.10,0.07), smoothstep(0.82,1.0,e.x));
      inner *= mix(0.75, 1.0, smoothstep(0.0, 0.35, e.x));
      diffuseColor.rgb = (gl_FrontFacing ? inner : outer) * (0.88+0.24*n);`);
  };
  m.defines = { USE_UV: '' };
  m.customProgramCacheKey = () => 'giraffeEar';
  return m;
}

// ------------------------------------------------------------------------------------------------
export class Giraffe {
  constructor(data, opts = {}) {
    this.opts = opts;
    const { geometry, header } = data;
    this.header = header;
    this.group = new THREE.Group();
    this.names = header.bones.map((b) => b[0]);
    this.index = Object.fromEntries(this.names.map((n, i) => [n, i]));
    this.bind = header.bones.map((b) => new THREE.Vector3(...b[2]));
    this.parent = header.bones.map((b) => (b[1] ? this.index[b[1]] : -1));
    this.bones = this.names.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    this.bones.forEach((b, i) => {
      const p = this.parent[i];
      if (p < 0) b.position.copy(this.bind[i]);
      else { b.position.copy(this.bind[i]).sub(this.bind[p]); this.bones[p].add(b); }
    });
    this.material = coatMaterial(opts.seed || new THREE.Vector3(0, 0, 0), opts.tint || new THREE.Vector3(1, 1, 1));
    this.mesh = new THREE.SkinnedMesh(geometry, this.material);
    this.mesh.add(this.bones[0]);
    this.bones[0].updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.nb = this.bones.length;
    // child bone (for bone direction)
    this.child = new Array(this.nb).fill(-1);
    const prefer = { chest: 'neck0', neck0: 'neck1', neck1: 'neck2', neck2: 'neck3', neck3: 'neck4', neck4: 'head', tail0: 'tail1', tail1: 'tail2', tail2: 'tail3' };
    for (let i = 0; i < this.nb; i++) {
      const pn = prefer[this.names[i]];
      if (pn) { this.child[i] = this.index[pn]; continue; }
      for (let j = 0; j < this.nb; j++) if (this.parent[j] === i) { this.child[i] = j; break; }
    }
    // tip point of every bone (child joint, or an anatomical end point for terminal bones)
    const tips = { fpasR: [0.80, 0, 0.175], fpasL: [0.80, 0, -0.175], hpasR: [-0.665, 0, 0.17], hpasL: [-0.665, 0, -0.17], tail3: [-1.14, 0.93, 0],
      head: [2.25, 3.58, 0], jaw: [2.2, 3.55, 0], earR: [1.65, 3.97, 0.25], earL: [1.65, 3.97, -0.25] };
    this.tip = this.bind.map((p, i) => (this.child[i] >= 0 ? this.bind[this.child[i]].clone() : (tips[this.names[i]] ? new THREE.Vector3(...tips[this.names[i]]) : p.clone().add(new THREE.Vector3(0, -0.1, 0)))));
    this.boneLen = this.bind.map((p, i) => this.tip[i].distanceTo(p));
    this.buildParts();
    // pose state
    this.cur = this.newPose();
    this.tmpPose = this.newPose();
    this.probes = this.makeProbes();
  }

  b(n) { return this.bones[this.index[n]]; }

  // ---------------------------------------------------------------------------------- parts
  buildParts() {
    const head = this.b('head');
    const hp = this.bind[this.index.head];
    const toHead = (v) => v.clone().sub(hp);
    // eyes: dark glossy globes with upper/lower lids
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x120a06, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x2c160b, roughness: 0.8 });
    const lashMat = new THREE.MeshStandardMaterial({ color: 0x0d0806, roughness: 0.9, side: THREE.DoubleSide });
    this.lids = [];
    for (const s of [1, -1]) {
      const c = headPt(0.168, 0.046, 0.093 * s);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0265, 20, 14), eyeMat);
      eye.position.copy(toHead(c)); head.add(eye);
      // lids: hemispherical shells rotating about the eye's horizontal (head-forward) axis
      const pivot = new THREE.Object3D(); pivot.position.copy(eye.position);
      // align pivot: x = head forward
      pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(HEAD_F, HEAD_U, new THREE.Vector3(0, 0, 1)));
      head.add(pivot);
      const upper = new THREE.Object3D(); pivot.add(upper);
      const lidG = new THREE.SphereGeometry(0.0285, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const lid = new THREE.Mesh(lidG, lidMat);
      // shell opening faces down (-y); rotate about x so it covers the top half then roll open
      upper.add(lid);
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.0289, 0.0024, 4, 24, Math.PI), lashMat);
      lash.rotation.set(Math.PI / 2, 0, s > 0 ? 0 : Math.PI);
      upper.add(lash);
      const lower = new THREE.Object3D(); pivot.add(lower);
      const lowLid = new THREE.Mesh(new THREE.SphereGeometry(0.0282, 20, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), lidMat);
      lower.add(lowLid);
      // open position: upper lid rotated up/back around the lateral axis (z in pivot space)
      this.lids.push({ upper, lower, side: s });
      eye.castShadow = false;
    }
    // ears
    const earG = earGeometry(), earM = earMaterial();
    this.ears = [];
    for (const n of ['earR', 'earL']) {
      const bone = this.b(n); const s = n === 'earR' ? 1 : -1;
      const mesh = new THREE.Mesh(earG, earM);
      // rest orientation: pointing sideways-back, slightly down; opening forward/outward
      const dir = new THREE.Vector3(-0.45, -0.22, 0.86 * s).normalize();
      const open = new THREE.Vector3(0.8, -0.35, 0.25 * s).normalize();
      const z = open.clone().addScaledVector(dir, -open.dot(dir)).normalize();
      const y = new THREE.Vector3().crossVectors(z, dir).normalize();
      const holder = new THREE.Object3D();
      holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, y, z));
      holder.add(mesh); bone.add(holder);
      mesh.castShadow = true;
      this.ears.push(holder);
    }
    // hair: ossicone tufts, mane, tail switch (skinned to the shared skeleton)
    const rnd = mulberry(this.opts.hairSeed || 7);
    const strands = [];
    const hi = this.index.head;
    for (const s of [1, -1]) {
      const tip = headPt(-0.062, 0.232, 0.071 * s);
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.03;
        const root = tip.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.9, -0.012 + rnd() * 0.012, Math.sin(a) * r));
        const dir = new THREE.Vector3(Math.cos(a) * 0.55 - 0.25, 1, Math.sin(a) * 0.55).normalize();
        strands.push({ root, dir, len: 0.025 + rnd() * 0.03, curl: new THREE.Vector3(-0.2, -0.1, 0).multiplyScalar(rnd()), w: 0.0028, bone: [hi], col: [0.035, 0.028, 0.024], view: new THREE.Vector3(1, 0, 0) });
      }
    }
    // mane along the dorsal ridge
    const mane = this.header.mane || [];
    const ni = ['neck0', 'neck1', 'neck2', 'neck3', 'neck4', 'head'].map((n) => this.index[n]);
    const neckPts = ['neck0', 'neck1', 'neck2', 'neck3', 'neck4', 'head'].map((n) => this.bind[this.index[n]]);
    for (let i = 0; i < mane.length - 1; i++) {
      const [x, y, nx, ny] = mane[i];
      for (let k = 0; k < 10; k++) {
        const t = rnd();
        const x2 = x + (mane[i + 1][0] - x) * t, y2 = y + (mane[i + 1][1] - y) * t;
        const root = new THREE.Vector3(x2 - nx * 0.006, y2 - ny * 0.006, (rnd() - 0.5) * 0.018);
        const dir = new THREE.Vector3(nx + (rnd() - 0.5) * 0.3, ny + (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.25).normalize();
        // bone weights: nearest two neck joints along the ridge
        let best = 0, bd = 1e9;
        for (let j = 0; j < neckPts.length; j++) { const d = Math.hypot(neckPts[j].x - x2, neckPts[j].y - y2); if (d < bd) { bd = d; best = j; } }
        // segment parameter
        const j0 = Math.max(0, Math.min(neckPts.length - 2, best - (proj(neckPts, best, x2, y2) < 0 ? 1 : 0)));
        const a = neckPts[j0], bb = neckPts[j0 + 1];
        const tt = THREE.MathUtils.clamp(((x2 - a.x) * (bb.x - a.x) + (y2 - a.y) * (bb.y - a.y)) / a.distanceToSquared(bb), 0, 1);
        const len = 0.03 + 0.025 * Math.sin(Math.PI * (i / mane.length)) + rnd() * 0.01;
        const dark = rnd() < 0.35;
        strands.push({ root, dir, len, curl: new THREE.Vector3(-0.06, 0, 0), w: 0.0055, bone: [ni[j0], ni[j0 + 1], 1 - tt], col: dark ? [0.13, 0.055, 0.025] : [0.30, 0.13, 0.05], view: new THREE.Vector3(0, 0, 1) });
      }
    }
    // tail switch: long black hairs from the last tail segment
    const t3 = this.index.tail3; const tEnd = new THREE.Vector3(-1.14, 0.93, 0);
    for (let i = 0; i < 150; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.02;
      const root = tEnd.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.16 * rnd(), Math.sin(a) * r));
      const dir = new THREE.Vector3(Math.cos(a) * 0.12 - 0.02, -1, Math.sin(a) * 0.12).normalize();
      strands.push({ root, dir, len: 0.22 + rnd() * 0.3, curl: new THREE.Vector3(0.0, 0, Math.cos(a) * 0.05), w: 0.0035, bone: [t3], col: [0.03, 0.025, 0.022], view: new THREE.Vector3(1, 0, 0.3) });
    }
    const hg = strandGeometry(strands, 3, (t) => 1 - 0.8 * t);
    this.hair = new THREE.SkinnedMesh(hg, hairMaterial());
    this.hair.bind(this.skeleton, this.mesh.bindMatrix);
    this.hair.frustumCulled = false;
    this.hair.castShadow = true;
    this.group.add(this.hair);
    function proj(pts, j, x, y) {
      if (j === 0) return 1;
      const a = pts[j], b = pts[j - 1];
      return (x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y) > 0 ? -1 : 1;
    }
  }

  // ---------------------------------------------------------------------------------- poses
  newPose() { const q = new Float32Array(this.nb * 4); for (let i = 0; i < this.nb; i++) q[i * 4 + 3] = 1; return { q, p: new Float32Array(3) }; }
  copyPose(dst, src) { dst.q.set(src.q); dst.p.set(src.p); return dst; }
  blendPose(out, a, b, t) {
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    for (let i = 0; i < this.nb; i++) {
      qa.fromArray(a.q, i * 4); qb.fromArray(b.q, i * 4);
      qa.slerp(qb, t); qa.toArray(out.q, i * 4);
    }
    for (let c = 0; c < 3; c++) out.p[c] = a.p[c] + (b.p[c] - a.p[c]) * t;
    return out;
  }
  applyPose(pose) {
    for (let i = 0; i < this.nb; i++) this.bones[i].quaternion.fromArray(pose.q, i * 4);
    const r = this.bones[0];
    r.position.set(pose.p[0], pose.p[1], pose.p[2]);
  }

  // Pose solver: spec describes body placement, limb joint targets and neck curve in group space.
  solve(spec) {
    const gp = this.group.position.clone(), gq = this.group.quaternion.clone();
    this.group.position.set(0, 0, 0); this.group.quaternion.identity(); this.group.updateMatrixWorld(true);
    const pose = this.solveInner(spec);
    this.group.position.copy(gp); this.group.quaternion.copy(gq); this.group.updateMatrixWorld(true);
    return pose;
  }
  solveInner(spec) {
    const pose = this.newPose();
    this.applyPose(pose);
    const B = this.bones, I = this.index;
    const setLocalEuler = (n, x, y, z, order = 'YZX') => { B[I[n]].quaternion.setFromEuler(new THREE.Euler(x * D2R, y * D2R, z * D2R, order)); };
    // body
    const bd = spec.body || {};
    B[0].position.set(bd.x || 0, bd.y || 0, bd.z || 0);
    setLocalEuler('body', -(bd.roll || 0), bd.yaw || 0, bd.pitch || 0);
    if (spec.chest) setLocalEuler('chest', -(spec.chest.roll || 0), spec.chest.yaw || 0, spec.chest.pitch || 0);
    if (spec.hips) setLocalEuler('hips', -(spec.hips.roll || 0), spec.hips.yaw || 0, spec.hips.pitch || 0);
    this.mesh.updateMatrixWorld(true);
    // aim helper
    const aim = (n, target) => {
      const i = I[n], bone = B[i];
      bone.updateMatrixWorld(true);
      const pw = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
      const parentQ = new THREE.Quaternion();
      bone.parent.getWorldQuaternion(parentQ);
      const d0 = this.tip[i].clone().sub(this.bind[i]).normalize().applyQuaternion(parentQ);
      const dT = target.clone().sub(pw).normalize();
      const sw = new THREE.Quaternion().setFromUnitVectors(d0, dT);
      const wq = sw.multiply(parentQ);
      bone.quaternion.copy(parentQ.clone().invert().multiply(wq));
      bone.updateMatrixWorld(true);
    };
    const toV = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    // limbs: list of [boneName, target]
    for (const leg of spec.legs || []) for (const [n, t] of leg) aim(n, toV(t));
    // extra local rotations (degrees) for fine adjustments
    for (const [n, e] of Object.entries(spec.rot || {})) {
      const bone = B[I[n]];
      bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0] * D2R, e[1] * D2R, e[2] * D2R, 'YZX')));
      bone.updateMatrixWorld(true);
    }
    // neck: cubic bezier through control points, aim each neck bone along it
    if (spec.neck) {
      const c = spec.neck.map(toV);
      const base = new THREE.Vector3().setFromMatrixPosition(B[I.neck0].matrixWorld);
      c[0] = base;
      const total = ['neck0', 'neck1', 'neck2', 'neck3', 'neck4'].reduce((a, n) => a + this.boneLen[I[n]], 0);
      const c1o = c[1].clone().sub(c[0]), c2o = c[2].clone().sub(c[3]);
      const arcLen = (k) => { let L = 0, prev = c[0];
        const q1 = c[0].clone().addScaledVector(c1o, k), q2 = c[3].clone().addScaledVector(c2o, k);
        for (let i = 1; i <= 60; i++) { const t = i / 60, u = 1 - t;
          const p = c[0].clone().multiplyScalar(u * u * u).addScaledVector(q1, 3 * u * u * t).addScaledVector(q2, 3 * u * t * t).addScaledVector(c[3], t * t * t);
          L += p.distanceTo(prev); prev = p; }
        return L; };
      if (spec.fitNeck !== false) {
        let lo = 0.05, hi = 4;
        for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (arcLen(m) < total) lo = m; else hi = m; }
        const k = (lo + hi) / 2;
        c[1] = c[0].clone().addScaledVector(c1o, k); c[2] = c[3].clone().addScaledVector(c2o, k);
      }
      const bez = (t) => {
        const u = 1 - t;
        return c[0].clone().multiplyScalar(u * u * u).addScaledVector(c[1], 3 * u * u * t).addScaledVector(c[2], 3 * u * t * t).addScaledVector(c[3], t * t * t);
      };
      // arc-length table
      const N = 120; const pts = [], acc = [0];
      for (let i = 0; i <= N; i++) pts.push(bez(i / N));
      for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const at = (s) => { // point at arc length s (clamped/extrapolated)
        if (s >= acc[N]) return pts[N].clone().add(pts[N].clone().sub(pts[N - 1]).normalize().multiplyScalar(s - acc[N]));
        let k = 1; while (acc[k] < s) k++;
        const t = (s - acc[k - 1]) / (acc[k] - acc[k - 1]);
        return pts[k - 1].clone().lerp(pts[k], t);
      };
      let s = 0;
      for (const n of ['neck0', 'neck1', 'neck2', 'neck3', 'neck4']) {
        s += this.boneLen[I[n]];
        // aim at the point whose distance from this joint equals the bone length (chord) -> use arc length as approximation
        aim(n, at(s));
      }
    }
    if (spec.head) {
      const f = toV(spec.head.f).normalize(), u0 = toV(spec.head.u);
      const z = new THREE.Vector3().crossVectors(f, u0).normalize(); const u = new THREE.Vector3().crossVectors(z, f);
      const wq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, u, z));
      const bindQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(HEAD_F, HEAD_U, new THREE.Vector3(0, 0, 1)));
      wq.multiply(bindQ.invert());
      const pq = new THREE.Quaternion(); B[I.head].parent.getWorldQuaternion(pq);
      B[I.head].quaternion.copy(pq.invert().multiply(wq));
    }
    if (spec.tail) for (const [n, e] of Object.entries(spec.tail)) setLocalEuler(n, e[0], e[1], e[2]);
    for (let i = 0; i < this.nb; i++) B[i].quaternion.toArray(pose.q, i * 4);
    pose.p[0] = B[0].position.x; pose.p[1] = B[0].position.y; pose.p[2] = B[0].position.z;
    return pose;
  }

  // ---------------------------------------------------------------------------------- ground
  makeProbes() {
    // [bone, point in bind space, radius]
    const P = (n, x, y, z, r) => ({ i: this.index[n], p: new THREE.Vector3(x, y, z), r });
    const pr = [];
    for (const s of [1, -1]) {
      const S = s > 0 ? 'R' : 'L';
      pr.push(P('fpas' + S, 0.80, 0.005, 0.175 * s, 0), P('fpas' + S, 0.72, 0.005, 0.175 * s, 0), P('fpas' + S, 0.86, 0.03, 0.175 * s, 0.0));
      pr.push(P('hpas' + S, -0.58, 0.005, 0.17 * s, 0), P('hpas' + S, -0.67, 0.005, 0.17 * s, 0), P('hpas' + S, -0.53, 0.03, 0.17 * s, 0.0));
      pr.push(P('carp' + S, 0.70, 0.87, 0.18 * s, 0.055), P('mcp' + S, 0.69, 0.5, 0.18 * s, 0.04), P('mcp' + S, 0.69, 0.26, 0.175 * s, 0.045));
      pr.push(P('tars' + S, -0.86, 0.90, 0.18 * s, 0.06), P('mtt' + S, -0.80, 0.5, 0.17 * s, 0.04), P('mtt' + S, -0.78, 0.25, 0.17 * s, 0.045));
      pr.push(P('rad' + S, 0.645, 1.2, 0.18 * s, 0.08), P('rad' + S, 0.66, 0.98, 0.18 * s, 0.055));
      pr.push(P('tib' + S, -0.56, 1.28, 0.2 * s, 0.09), P('tib' + S, -0.75, 1.0, 0.18 * s, 0.06));
      pr.push(P('fem' + S, -0.42, 1.42, 0.22 * s, 0.1), P('fem' + S, -0.75, 1.5, 0.2 * s, 0.14));
      pr.push(P('hum' + S, 0.64, 1.62, 0.19 * s, 0.1));
    }
    pr.push(P('chest', 0.72, 1.52, 0, 0.03), P('chest', 0.5, 1.52, 0, 0.03), P('body', 0.0, 1.50, 0, 0.03), P('hips', -0.45, 1.6, 0, 0.03));
    pr.push(P('head', 2.27, 3.62, 0, 0.04), P('jaw', 2.2, 3.55, 0, 0.03));
    return pr;
  }
  // world-space (group space) lowest clearance of probes
  minClearance() {
    this.mesh.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    let mn = 1e9; const v = new THREE.Vector3();
    const bi = this.skeleton.boneInverses;
    for (const pr of this.probes) {
      v.copy(pr.p).applyMatrix4(bi[pr.i]).applyMatrix4(this.bones[pr.i].matrixWorld).applyMatrix4(inv);
      const c = v.y - pr.r;
      if (c < mn) mn = c;
    }
    return mn;
  }
  probeWorld(name, x, y, z, out = new THREE.Vector3()) {
    const i = this.index[name];
    return out.set(x, y, z).applyMatrix4(this.skeleton.boneInverses[i]).applyMatrix4(this.bones[i].matrixWorld);
  }
}

export function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
