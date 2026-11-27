import * as THREE from '../../lib/three.module.js';

export const HOME_POS = new THREE.Vector3(0, 2.0, 0);
export const VILLAGE_END_Z = 78;
export const OASIS_POS = new THREE.Vector3(-48, 2.2, 136);
export const OASIS_WATER_Y = 2.25;
export const OASIS_RADIUS = 17.5;
export const DUNES_START_Z = 115;
export const OBSERVATORY_POS = new THREE.Vector3(12, 36.0, 392);

export const SUN_DIR = new THREE.Vector3(-0.62, 0.24, 0.75).normalize();

// 70 : 25 : 5 cohesive tonal palette (1960s Moroccan Atlas dusk)
export const PALETTE = {
  // Base (~70%): warm sand, earthen courtyard wall, deep indigo sky
  sandWarm: '#c8a074',
  sandShadow: '#9e7550',
  adobeWall: '#c89b70',
  adobeLight: '#d6ae84',
  indigoNight: '#15203f',
  // Main (~25%): terracotta mudbrick & date palm green
  terracotta: '#a6583e',
  terracottaDark: '#874430',
  terracottaWarm: '#b86a4a',
  palmGreen: '#4f6e42',
  oliveGreen: '#638050',
  // Accent (~5%): saffron yellow & turquoise
  saffron: '#e2a832',
  brass: '#c9933b',
  turquoise: '#2b9c95',
  turquoiseGlow: '#43cfc6',
  creamCloth: '#e6d7be',
};

export const shared = {
  uTime: { value: 0 },
  uAltitude: { value: 0 },   // 0 (ground) .. 1 (high starry sky)
  uNightMix: { value: 0 },   // 0 (warm sunset dusk) .. 1 (deep starry night)
  uSunDir: { value: SUN_DIR.clone() },
};

/** Mark decorative / atmospheric meshes so physics gate treats them as non-solid. */
export function markNonSolid(obj, flag = 'nonsolid') {
  if (!obj) return obj;
  obj.userData[flag] = true;
  obj.traverse((child) => {
    child.userData[flag] = true;
  });
  return obj;
}
