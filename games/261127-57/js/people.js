// People: the girl (back view), dad (back view), the lab coat, and the large foreground child hand
// in a lab-coat sleeve whose fingers are posed with a skeleton.
import * as THREE from '../lib/three.module.min.js';
import { tex, texRep } from './assets.js';

const SKIN = 0, NAIL = 1, COAT = 2, HAIR = 3, KNIT = 4, TIGHTS = 5, SHOE = 6, TIE = 7, DENIM = 8, FLANNEL = 9, MUG = 10, SKIRT = 11;

function skinMaterial(rep = 30, tone = [1, 1, 1]) {
  const m = new THREE.MeshPhysicalMaterial({
    map: texRep('skin_c', rep, rep), normalMap: texRep('skin_n', rep, rep), roughness: 0.52,
    sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.9, 0.45, 0.35),
    color: new THREE.Color(tone[0], tone[1], tone[2]), specularIntensity: 0.5,
  });
  m.normalScale.set(0.35, 0.35);
  // cheap subsurface: wrap lighting + reddish transmitted tint in the shadowed part
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `
      #include <lights_fragment_end>
      reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.11, 0.045, 0.03);
    `);
  };
  m.customProgramCacheKey = () => 'skin';
  return m;
}

export function peopleMaterials() {
  const M = [];
  M[SKIN] = skinMaterial(30);
  M[NAIL] = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.95, 0.78, 0.74), roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  M[COAT] = new THREE.MeshPhysicalMaterial({ map: texRep('twill_c', 45, 45), normalMap: texRep('twill_n', 45, 45), roughness: 0.82, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(1, 1, 1), color: new THREE.Color(0.97, 0.97, 0.95) });
  M[HAIR] = new THREE.MeshPhysicalMaterial({ map: texRep('hair_c', 26, 9), normalMap: texRep('hair_n', 26, 9), roughness: 0.42, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0.55, 0.38, 0.22), anisotropy: 0.6 });
  M[HAIR].normalScale.set(1.2, 1.2);
  M[KNIT] = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.62, 0.44, 0.17), normalMap: texRep('knit_n', 9, 9), roughnessMap: texRep('knit_orm', 9, 9), aoMap: texRep('knit_orm', 9, 9), roughness: 1, sheen: 0.8, sheenRoughness: 0.9, sheenColor: new THREE.Color(0.9, 0.75, 0.5) });
  M[TIGHTS] = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.10, 0.12, 0.19), normalMap: texRep('knit_n', 20, 20), roughness: 0.85, sheen: 0.5, sheenColor: new THREE.Color(0.4, 0.42, 0.55) });
  M[SHOE] = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.16, 0.09, 0.06), roughness: 0.45, clearcoat: 0.3, normalMap: texRep('skin_n', 10, 10) });
  M[TIE] = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.55, 0.16, 0.16), roughness: 0.5, sheen: 0.5 });
  M[DENIM] = new THREE.MeshPhysicalMaterial({ map: texRep('denim_c', 14, 14), normalMap: texRep('denim_n', 14, 14), roughness: 0.9, sheen: 0.3 });
  M[FLANNEL] = new THREE.MeshPhysicalMaterial({ map: texRep('flannel_c', 5, 5), normalMap: texRep('flannel_n', 5, 5), roughness: 0.92, sheen: 0.7, sheenRoughness: 0.9, sheenColor: new THREE.Color(0.8, 0.7, 0.6) });
  M[MUG] = new THREE.MeshPhysicalMaterial({ map: tex('ceramic_c'), roughness: 0.2, clearcoat: 0.8, color: 0xe8e4dc });
  M[SKIRT] = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.30, 0.34, 0.30), normalMap: texRep('knit_n', 14, 14), roughness: 0.9, sheen: 0.4 });
  return M;
}

function buildSkinned(data, materials) {
  const bones = data.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.userData.axis = new THREE.Vector3(...b.axis); return o; });
  data.bones.forEach((b, i) => {
    const head = new THREE.Vector3(...b.head);
    if (b.parent >= 0) {
      const ph = new THREE.Vector3(...data.bones[b.parent].head);
      bones[i].position.copy(head.sub(ph));
      bones[b.parent].add(bones[i]);
    } else bones[i].position.copy(head);
  });
  const mesh = new THREE.SkinnedMesh(data.geometry, materials);
  const root = bones[data.bones.findIndex((b) => b.parent < 0)];
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const byName = {};
  bones.forEach((b) => { byName[b.name] = b; b.userData.rest = b.quaternion.clone(); });
  mesh.userData.bones = byName;
  return mesh;
}

const _q = new THREE.Quaternion();
function rot(bone, axis, ang) {
  bone.quaternion.copy(bone.userData.rest).multiply(_q.setFromAxisAngle(axis, ang));
}

// ---------------------------------------------------------------- foreground hand
export const POSES = {
  relax: { index: [12, 16, 10], middle: [16, 20, 12], ring: [20, 24, 14], pinky: [24, 26, 16], thumb: [6, 8, 8] },
  point: { index: [2, 4, 2], middle: [72, 92, 52], ring: [78, 95, 55], pinky: [80, 95, 55], thumb: [28, 30, 20] },
  grip: { index: [42, 58, 30], middle: [62, 78, 42], ring: [70, 82, 44], pinky: [74, 84, 46], thumb: [34, 18, 14] },
  pinch: { index: [38, 42, 20], middle: [44, 52, 28], ring: [58, 70, 40], pinky: [66, 76, 44], thumb: [34, 20, 18] },
  hold: { index: [50, 66, 40], middle: [66, 84, 50], ring: [72, 88, 52], pinky: [76, 88, 52], thumb: [40, 26, 18] },
};

export class Hand {
  constructor(data, sleeveData, scale = 1, skinTone = [1, 1, 1], sleeveMat = null) {
    this.group = new THREE.Group();
    const mats = peopleMaterials();
    mats[SKIN] = skinMaterial(30 / scale, skinTone);
    this.mesh = buildSkinned(data, mats);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    this.sleeve = new THREE.Mesh(sleeveData.geometry, sleeveMat || mats[COAT]);
    this.sleeve.castShadow = true; this.sleeve.receiveShadow = true;
    this.group.add(this.sleeve);
    this.group.scale.setScalar(scale);
    this.b = this.mesh.userData.bones;
    this.cur = JSON.parse(JSON.stringify(POSES.relax));
    this.target = POSES.relax;
    this.squeeze = 0; // extra index/thumb flex (trigger pull / bulb squeeze)
    this.apply();
  }
  setPose(name) { this.target = POSES[name] || POSES.relax; }
  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) for (let j = 0; j < 3; j++) this.cur[f][j] += (this.target[f][j] - this.cur[f][j]) * k;
    this.apply();
  }
  apply() {
    const D = Math.PI / 180;
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      for (let j = 0; j < 3; j++) {
        const bone = this.b[f + j];
        let a = this.cur[f][j];
        if (f === 'index') a += this.squeeze * (j === 0 ? 14 : 10);
        rot(bone, bone.userData.axis, -a * D);
      }
    }
    for (let j = 0; j < 3; j++) {
      const bone = this.b['thumb' + j];
      rot(bone, bone.userData.axis, -(this.cur.thumb[j] + this.squeeze * 8) * D);
    }
  }
}

// ---------------------------------------------------------------- full figures
export class Figure {
  constructor(data, mats, extra = []) {
    this.group = new THREE.Group();
    this.mesh = buildSkinned(data, mats);
    this.group.add(this.mesh);
    this.extra = [];
    for (const e of extra) this.addSkinnedLayer(e.data, e.mat);
    this.b = this.mesh.userData.bones;
    this.t = 0;
    this.hop = 0; this.clap = 0; this.nod = 0; this.tilt = 0; this.wave = 0;
  }
  addSkinnedLayer(data, mat) {
    const m = new THREE.SkinnedMesh(data.geometry, mat);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.bind(this.mesh.skeleton, this.mesh.bindMatrix);
    this.group.add(m);
    this.extra.push(m);
    return m;
  }
  update(dt) {
    this.t += dt;
    const b = this.b;
    // idle breathing / sway
    const br = Math.sin(this.t * 1.7) * 0.012;
    rot(b.spine, new THREE.Vector3(1, 0, 0), br + this.hop * 0.05);
    // head: nod (yes) and tilt (huh?)
    rot(b.head, new THREE.Vector3(1, 0, 0), Math.sin(this.t * 9) * 0.18 * this.nod - 0.05);
    if (this.tilt > 0) b.head.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.32 * this.tilt));
    // hop
    const hop = Math.max(0, Math.sin(this.t * 10)) * 0.045 * this.hop;
    this.mesh.position.y = hop;
    for (const m of this.extra) m.position.y = hop;
    // arms: clap above the table / raise
    const c = this.clap;
    const cl = Math.max(0, Math.sin(this.t * 14));
    if (b.upperL) {
      rot(b.upperL, new THREE.Vector3(1, 0, 0), c * 0.9);
      b.upperL.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -c * (0.25 + 0.25 * cl)));
      rot(b.upperR, new THREE.Vector3(1, 0, 0), c * 0.9);
      b.upperR.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c * (0.25 + 0.25 * cl)));
      rot(b.foreL, new THREE.Vector3(0, 0, 1), -c * 0.6);
      rot(b.foreR, new THREE.Vector3(0, 0, 1), c * 0.6);
    }
  }
}
