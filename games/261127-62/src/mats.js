// Shared materials
import * as THREE from 'three';
import * as T from './tex.js';

export const M = {};
export const TX = {};

export function initMaterials() {
  const wood = T.woodFloor();
  wood.map.repeat.set(2.2, 2.2); wood.normalMap.repeat.set(2.2, 2.2);
  TX.wood = wood;
  TX.weave = T.weaveNormal();
  TX.weaveFine = T.weaveNormal(128, 32, 1.2);
  TX.knit = T.knitNormal();
  TX.hair = T.hairNormal();
  TX.shadow = T.shadowBlob();
  TX.sparkle = T.sparkle();
  TX.petal = T.petal();
  TX.heart = T.heart();
  TX.note = T.note();
  TX.bubble = T.bubble();
  TX.ring = T.ring();
  TX.glow = T.radial(null, null, 128, [[0, 'rgba(255,248,225,0.9)'], [0.4, 'rgba(255,236,200,0.35)'], [1, 'rgba(255,230,190,0)']]);
  TX.sponge = T.sponge();
  TX.section = T.cakeSection();
  TX.berry = T.strawberrySkin();
  TX.cookie = T.cookie();
  TX.straw = T.straw();

  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  M.floor = P({ map: wood.map, normalMap: wood.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const wp = T.wallpaper(); wp.repeat.set(3, 1.4);
  M.wall = new THREE.MeshStandardMaterial({ map: wp, roughness: 0.92 });
  M.wallPlain = new THREE.MeshStandardMaterial({ color: '#f7ecd6', roughness: 0.92 });
  M.wainscot = P({ color: '#f2cfd3', roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 });
  M.trim = P({ color: '#fff7ee', roughness: 0.45, clearcoat: 0.3 });
  M.pink = P({ color: '#f3c2cb', roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.2, sheenColor: new THREE.Color('#fff0f0') });
  M.pinkDeep = P({ color: '#ee9fb0', roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  M.cream = P({ color: '#fbf2e2', roughness: 0.45, clearcoat: 0.4 });
  M.mint = P({ color: '#bfe5d5', roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 });
  M.mintDark = P({ color: '#9fd3be', roughness: 0.45, clearcoat: 0.3 });
  M.gold = P({ color: '#e6c06a', metalness: 1, roughness: 0.28 });
  M.silver = P({ color: '#e8e8ea', metalness: 1, roughness: 0.22 });
  M.silverDS = P({ color: '#e8e8ea', metalness: 1, roughness: 0.22, side: THREE.DoubleSide });
  M.glass = P({ color: '#eaf6ff', roughness: 0.05, transparent: true, opacity: 0.18, metalness: 0, clearcoat: 1, depthWrite: false });
  const tl = T.tiles(); tl.map.repeat.set(4, 1.6); tl.normalMap.repeat.set(4, 1.6);
  M.tile = P({ map: tl.map, normalMap: tl.normalMap, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const st = T.stone(); st.map.repeat.set(2, 1); st.normalMap.repeat.set(2, 1);
  M.stone = P({ map: st.map, normalMap: st.normalMap, roughness: 0.85 });
  M.garden = new THREE.MeshBasicMaterial({ map: T.garden(), toneMapped: false, color: '#f2f2f2', transparent: true, depthWrite: false });
  M.rug = new THREE.MeshStandardMaterial({ map: T.rug(), roughness: 1 });
  M.base = P({ color: '#d7b48a', map: wood.map, roughness: 0.55, clearcoat: 0.3 });
  M.leaf = P({ color: '#7dbb7a', roughness: 0.5, side: THREE.DoubleSide });
  M.potTerracotta = P({ color: '#d98c6a', roughness: 0.7 });

  // ceramics
  const cer = map => P({ map, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  M.cup = cer(T.ceramicV({ bands: [[0.5, 0.56, '#f08aa0'], [0.0, 0.06, '#f6c2cd']], flowers: [0.33], count: 4 }));
  M.plate = cer(T.ceramicV({ bands: [[0.6, 0.72, '#f08aa0']], flowers: [0.82], count: 6, sy: 0.7 }));
  M.potBody = cer(T.ceramicV({ bands: [[0.72, 0.8, '#f08aa0'], [0.08, 0.16, '#f6c2cd']], flowers: [0.45], count: 3 }));
  M.ceramic = M.cup; M.ceramicPlain = M.plate;
  M.ceramicWhite = P({ color: '#fffdf8', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  M.tea = P({ color: '#c8741f', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.88, transmission: 0 });
  M.stream = P({ color: '#d58a3a', roughness: 0.05, transparent: true, opacity: 0.7, emissive: '#3a1a00', emissiveIntensity: 0.2 });

  // cake
  M.sponge = P({ map: TX.sponge, roughness: 0.9 });
  M.section = P({ map: TX.section, roughness: 0.8 });
  M.creamTop = P({ color: '#fffaf2', roughness: 0.42, clearcoat: 0.3, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') });
  M.berry = P({ map: TX.berry, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
  M.berryLeaf = P({ color: '#5fa64f', roughness: 0.5 });
  M.cookie = P({ map: TX.cookie, roughness: 0.85 });
  M.icing = P({ color: '#ffd1dc', roughness: 0.3, clearcoat: 0.6 });

  // fabric
  M.lace = P({ color: '#ffffff', roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.5, normalMap: TX.weaveFine });
  M.sock = P({ color: '#fdfbf7', roughness: 0.9, normalMap: TX.knit, normalScale: new THREE.Vector2(0.8, 0.8), sheen: 0.6, sheenColor: new THREE.Color('#ffffff') });
  M.satin = P({ color: '#f58aa6', roughness: 0.3, sheen: 1, sheenColor: new THREE.Color('#ffd6e2'), sheenRoughness: 0.3, clearcoat: 0.2, side: THREE.DoubleSide });
  M.satinRed = P({ color: '#e5566f', roughness: 0.3, sheen: 1, sheenColor: new THREE.Color('#ffc4d0'), sheenRoughness: 0.3, side: THREE.DoubleSide });
  const q = T.quilt('#f8d7de', '#f2a6b8');
  M.quilt = P({ map: q.map, normalMap: q.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.85, sheen: 0.8, sheenColor: new THREE.Color('#fff4f6'), sheenRoughness: 0.6, side: THREE.DoubleSide });
  M.sheet = P({ color: '#fffaf6', roughness: 0.8, normalMap: TX.weaveFine, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') });
  M.pillow = P({ color: '#ffffff', roughness: 0.75, normalMap: TX.weaveFine, sheen: 0.7, sheenColor: new THREE.Color('#ffffff') });
  M.giftWrap = P({ map: T.giftWrap(), roughness: 0.55, clearcoat: 0.2 });
  M.boxInside = P({ color: '#f6e7d0', roughness: 0.8 });
  M.straw = P({ color: '#ecd29a', roughness: 0.75, normalMap: TX.straw, normalScale: new THREE.Vector2(1, 1) });

  M.shadow = new THREE.MeshBasicMaterial({ map: TX.shadow, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
