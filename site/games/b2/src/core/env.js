import * as THREE from '../../lib/three.module.js';

export const LAYER_MAIN = 0;
export const LAYER_REFLECT = 1;

// Key landmarks across the Satoyama valley (1980s early summer afternoon)
export const HOME_POS = new THREE.Vector3(0, 14.0, 0);
export const GIRL_START = new THREE.Vector3(-2.3, 14.0, 2.0);
export const PLANE_LAND_YARD = new THREE.Vector3(1.4, 14.0, 5.2);
export const BRIDGE_POS = new THREE.Vector3(0, 2.0, 68);
export const MILL_POS = new THREE.Vector3(-24, 2.8, 91.2);
export const WELL_POS = new THREE.Vector3(12, 3.0, 45);
export const BAMBOO_POS = new THREE.Vector3(58, 7.2, 132);
export const MEADOW_LAND_POS = new THREE.Vector3(38, 3.1, 92);
export const GOAL_POS = new THREE.Vector3(0, 44.0, 344);

// Oblique afternoon sun from front-left/west to cast long clear shadows & paddy glint
export const SUN_DIR = new THREE.Vector3(-0.54, 0.38, 0.75).normalize();

// 70 : 25 : 5 Color palette (Color Coordinator tuned for unified early-summer clarity)
export const PALETTE = {
  // Base (~70%): Sky cyan-blue & silver water reflection
  skyZenith: new THREE.Color('#5a9fd4'),
  skyHorizon: new THREE.Color('#d2e6f4'),
  skyGround: new THREE.Color('#b6cce0'),
  cloudWhite: new THREE.Color('#f7f4eb'),
  waterSilver: new THREE.Color('#a7cbe0'),

  // Main (~25%): Early-summer rice green, kawara slate, aged cedar wood, granite stone
  riceGreen: new THREE.Color('#649646'),
  meadowGreen: new THREE.Color('#5c8942'),
  bambooGreen: new THREE.Color('#4c7c41'),
  kawaraSlate: new THREE.Color('#484e57'),
  cedarWood: new THREE.Color('#74563b'),
  plasterWhite: new THREE.Color('#ece7da'),
  graniteStone: new THREE.Color('#7f827c'),

  // Accent (~5%): Yamabuki gold & indigo dye
  yamabuki: new THREE.Color('#e6aa24'),
  indigo: new THREE.Color('#243e6b'),
  paperWhite: new THREE.Color('#f7f5ee'),
};

export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: new THREE.Color('#fff0d2') },
  uSkyZenith: { value: PALETTE.skyZenith.clone() },
  uSkyHorizon: { value: PALETTE.skyHorizon.clone() },
  uSkyGround: { value: PALETTE.skyGround.clone() },
  uAltitude: { value: 0 },
  uCameraPos: { value: new THREE.Vector3() },
  uSpeed: { value: 0 },
  uReflectTex: { value: null },
  uHasReflect: { value: 0 },
};

export const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for(int i = 0; i < 4; i++){
    v += a * vnoise2(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}
`;
