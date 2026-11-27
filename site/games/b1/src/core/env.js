import * as THREE from '../../lib/three.module.js';

// Low winter Lapland twilight sun low in the southwest-west, casting long crisp snow shadows
export const SUN_DIR = new THREE.Vector3(-0.64, 0.24, -0.73).normalize();

// Frozen lake surface elevation
export const ICE_Y = -1.2;

// Key landmarks across the 1970s Finnish Lapland valley (+Z = north toward Aurora Post Office)
export const HOME_POS = new THREE.Vector3(-5.2, 0, -2.8);
export const VILLAGE_POS = new THREE.Vector3(0, 0.5, 62);
export const OVEN_POS = new THREE.Vector3(24.5, 0.65, 55);
export const CHAPEL_POS = new THREE.Vector3(-27, 0.55, 68);
export const BRIDGE_POS = new THREE.Vector3(-12, ICE_Y, 114);
export const PIER_POS = new THREE.Vector3(-24, ICE_Y, 132);
export const FISHING_HUT_POS = new THREE.Vector3(-52, ICE_Y, 162);
export const DETOUR_CABIN_POS = new THREE.Vector3(-76, 1.0, 146);
export const FEEDER_POS = new THREE.Vector3(56, 1.8, 108);
export const BARN_POS = new THREE.Vector3(24, 1.25, 212);
export const AURORA_GATE_POS = new THREE.Vector3(0, 21, 232);
export const OFFICE_POS = new THREE.Vector3(0, 20, 336);

// 70:25:5 Palette tokens (Base: Snow silver-white & deep indigo, Main: Spruce green & warm wood, Accent: Aurora emerald & lantern amber)
export const PALETTE = {
  snowLight: 0xe6eef7,
  snowShadow: 0x9cb4d6,
  indigoDeep: 0x152242,
  indigoMid: 0x253a6b,
  spruceDark: 0x203e30,
  spruceMid: 0x2d5440,
  woodWarm: 0x7c5032,
  woodLight: 0x9b6b45,
  woodDark: 0x4e321f,
  birchBark: 0xdce2e8,
  stoneGray: 0x626c7f,
  emerald: 0x3ee0a2,
  emeraldGlow: 0x76f7c2,
  amber: 0xf2ae48,
  amberGlow: 0xffd584,
};

export const shared = {
  uTime: { value: 0 },
  uNight: { value: 0.18 }, // 0.18 in winter twilight garden -> 1.0 in aurora sky & post office
  uAuroraOn: { value: 0.35 },
  uSpeed: { value: 0 },
  uSunDir: { value: SUN_DIR.clone() },
  uCameraPos: { value: new THREE.Vector3() },
};

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise2(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm2(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = p * 2.03 + vec2(13.7, 29.3);
    a *= 0.5;
  }
  return s;
}
`;
