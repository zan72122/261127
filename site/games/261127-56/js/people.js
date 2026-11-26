// 人物・手のメッシュを読み込み、素材（布・肌・髪）を付ける
import * as THREE from 'three';
import { loadPack, triplanar, pbr } from './assets.js';

let MATS = null;
export function peopleMaterials() {
  if (MATS) return MATS;
  const skinPhys = (tint) => triplanar('skin', { physical: true, phys: { sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0.300, 0.186, 0.156) }, tint, scale: 38, ns: 0.55, roughness: 1, clay: true });
  MATS = {
    skin: skinPhys(0xfff1ea),
    skinAdult: triplanar('skin', { physical: true, phys: { sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.300, 0.180, 0.150) }, tint: 0xe9bea2, scale: 30, ns: 0.6, roughness: 1 }),
    skinPapa: skinPhys(0xe9c8b4),
    nail: new THREE.MeshPhysicalMaterial({ color: 0xf4d6cc, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, vertexColors: false, sheen: 0.2, sheenColor: new THREE.Color(0.300, 0.270, 0.270) }),
    knit: triplanar('knit', { physical: true, phys: { sheen: 1.0, sheenRoughness: 0.75, sheenColor: new THREE.Color(0.28, 0.22, 0.14) }, tint: 0xd9b47e, scale: 15, ns: 1.3 }),
    knit2: triplanar('knit', { physical: true, phys: { sheen: 1.0, sheenRoughness: 0.75, sheenColor: new THREE.Color(0.225, 0.240, 0.210) }, tint: 0x7f8d70, scale: 13, ns: 1.3 }),
    cord: triplanar('cord', { physical: true, phys: { sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.240, 0.180, 0.150) }, tint: 0xe0c8b4, scale: 22, ns: 1.4 }),
    flannel: triplanar('flannel', { physical: true, phys: { sheen: 0.7, sheenRoughness: 0.8, sheenColor: new THREE.Color(0.210, 0.195, 0.195) }, tint: 0xffffff, scale: 5.5, ns: 1.2 }),
    denim: triplanar('linen', { physical: true, phys: { sheen: 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color(0.150, 0.180, 0.240) }, tint: 0x55708f, scale: 26, ns: 1.6 }),
    skirt: triplanar('linen', { physical: true, phys: { sheen: 0.8, sheenRoughness: 0.8, sheenColor: new THREE.Color(0.180, 0.150, 0.165) }, tint: 0x6e5a62, scale: 14, ns: 1.0 }),
    hair: triplanar('hair', { physical: true, phys: { sheen: 0.5, sheenRoughness: 0.35, sheenColor: new THREE.Color(0.180, 0.135, 0.096) }, tint: 0xffffff, scale: 24, ns: 1.6, roughness: 1 }),
    hairPapa: triplanar('hair', { physical: true, phys: { sheen: 0.4, sheenRoughness: 0.4, sheenColor: new THREE.Color(0.120, 0.108, 0.096) }, tint: 0x6a625c, scale: 30, ns: 1.4, roughness: 1 }),
    shoe: triplanar('linen', { physical: true, phys: { sheen: 1, sheenRoughness: 0.9, sheenColor: new THREE.Color(0.240, 0.120, 0.105) }, tint: 0x8a4235, scale: 30, ns: 2 }),
    shoeAdult: triplanar('linen', { tint: 0x4a3a30, scale: 30, ns: 1.5 }),
  };
  return MATS;
}

function matFor(mat, who) {
  const M = peopleMaterials();
  if (mat === 'skin') return who === 'girl' ? M.skin : who === 'papa' ? M.skinPapa : M.skinAdult;
  if (mat === 'hair') return who === 'papa' ? M.hairPapa : M.hair;
  if (mat === 'shoe') return who === 'girl' ? M.shoe : M.shoeAdult;
  return M[mat] || M.knit;
}

export async function loadPerson(name) {
  const pack = await loadPack('./mesh/' + name + '.bin');
  const root = new THREE.Group();
  const parts = {};
  for (const pn of ['torso', 'head', 'armL', 'armR']) {
    const g = new THREE.Group();
    const pv = (pack.parts[pn] && pack.parts[pn].pivot) || [0, 0, 0];
    g.position.set(pv[0], pv[1], pv[2]);
    g.userData.pivot = new THREE.Vector3(pv[0], pv[1], pv[2]);
    g.userData.rest = g.quaternion.clone();
    parts[pn] = g;
    (pn === 'torso' ? root : parts.torso).add(g);
  }
  // 頭と腕は胴の子にするため、胴の支点（原点）基準に戻す
  for (const m of pack.meshes) {
    const me = new THREE.Mesh(m.geo, matFor(m.mat, name));
    me.castShadow = true; me.receiveShadow = true;
    const pv = parts[m.part].userData.pivot;
    me.position.set(-pv.x, -pv.y, -pv.z);
    parts[m.part].add(me);
  }
  return { root, parts };
}

export async function loadHand(name, who = 'girl') {
  const pack = await loadPack('./mesh/' + name + '.bin');
  const g = new THREE.Group();
  const M = peopleMaterials();
  for (const m of pack.meshes) {
    let mat = m.mat === 'skin' ? (who === 'papa' ? M.skinPapa : M.skin) : m.mat === 'nail' ? M.nail : matFor(m.mat, who);
    const me = new THREE.Mesh(m.geo, mat);
    me.castShadow = true; me.receiveShadow = true;
    me.frustumCulled = false;
    g.add(me);
  }
  return g;
}

// エプロン：掛けてある形と、着た形を同じ頂点数で作り、間をなめらかにつなぐ
export function makeApron() {
  const NU = 18, NV = 30;
  const geo = new THREE.PlaneGeometry(1, 1, NU, NV);
  const n = geo.attributes.position.count;
  const worn = new Float32Array(n * 3), hang = new Float32Array(n * 3);
  const uv = geo.attributes.uv;
  for (let k = 0; k < n; k++) {
    const u = uv.getX(k), v = uv.getY(k);
    // 着た形（女の子の体の前面、胸当て〜ひざ）
    const y = 0.36 + v * 0.5;
    const bib = THREE.MathUtils.smoothstep(y, 0.6, 0.66);
    const hw = THREE.MathUtils.lerp(0.15, 0.082, bib);
    const x = (u - 0.5) * 2 * hw;
    const chest = 0.087 + 0.012 * Math.exp(-(((y - 0.68) / 0.06) ** 2)) - 0.012 * Math.max(0, y - 0.78) / 0.08;
    const skirtZ = 0.092 + Math.max(0, 0.6 - y) * 0.2;
    let zf = y > 0.6 ? chest : skirtZ;
    const wrap = y > 0.6 ? 0.11 : 0.17;
    let z = zf * Math.sqrt(Math.max(0.05, 1 - (x / wrap) ** 2));
    // すそのひだ
    const fold = (1 - v) * 0.006 * Math.sin(u * 22 + 1.3) * (y < 0.6 ? 1 : 0);
    worn[k * 3] = x; worn[k * 3 + 1] = y; worn[k * 3 + 2] = z + fold;
    // 掛けた形（ペグから垂れる。平ら・ひだあり）
    const hx = (u - 0.5) * 2 * THREE.MathUtils.lerp(0.15, 0.09, bib);
    const hy = -0.55 + v * 0.5;
    hang[k * 3] = hx + 0.004 * Math.sin(v * 9); hang[k * 3 + 1] = hy; hang[k * 3 + 2] = 0.03 + 0.012 * Math.sin(u * 17 + v * 3) * (1 - v) + 0.02 * (1 - v);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(hang.slice(), 3));
  geo.computeVertexNormals();
  const mat = pbr('linen', { color: 0xc4ab84, repeat: [10, 14], side: THREE.DoubleSide, physical: true, phys: { sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(0.270, 0.240, 0.195) }, ns: 1.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  // ひも（首と腰）
  const strapM = pbr('linen', { color: 0xa88c64, repeat: [1, 20], physical: true });
  const neck = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.075, 0.86, 0.06), new THREE.Vector3(-0.06, 0.93, 0.02), new THREE.Vector3(0, 0.95, -0.05), new THREE.Vector3(0.06, 0.93, 0.02), new THREE.Vector3(0.075, 0.86, 0.06)]), 20, 0.005, 6), strapM);
  const waist = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.14, 0.62, 0.05), new THREE.Vector3(-0.115, 0.62, -0.04), new THREE.Vector3(-0.02, 0.615, -0.085), new THREE.Vector3(0.02, 0.6, -0.09), new THREE.Vector3(0.0, 0.56, -0.1), new THREE.Vector3(0.03, 0.54, -0.095)]), 24, 0.006, 6), strapM);
  neck.castShadow = waist.castShadow = true;
  neck.visible = waist.visible = false;
  return { mesh, worn, hang, neck, waist };
}
