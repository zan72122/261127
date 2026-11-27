import * as THREE from '../../lib/three.module.js';

export const WATER_Y = 0.0;

// Key coordinates along the fjord lake (+Z runs from home cove through autumn canyon to glacier lodge)
export const HOME_CABIN_POS = new THREE.Vector3(-8.5, 0, -9.0);
export const PIER_POS = new THREE.Vector3(0, 0.65, 11.5);
export const PLANE_MOOR_POS = new THREE.Vector3(6.45, WATER_Y, 17.0);
export const PLANE_MOOR_YAW = 0.16;

export const VILLAGE_POS = new THREE.Vector3(-48, 0, 108);
export const CANYON_ENTRY_Z = 165;
export const CANYON_EXIT_Z = 330;
export const BRIDGE_POS = new THREE.Vector3(0, 22.0, 268);
export const WATERFALL_POS = new THREE.Vector3(31, 0, 286);
export const COVE_POS = new THREE.Vector3(46, 0, 385);
export const COVE_PIER_POS = new THREE.Vector3(36, 0.65, 382);

// Goal: Glacier Lake Lodge on a lakeside rock point, clear ivory roof visible from start
export const LODGE_POS = new THREE.Vector3(0, 2.2, 545);
export const LODGE_PIER_POS = new THREE.Vector3(0, 0.72, 524);
export const LODGE_APPROACH_POS = new THREE.Vector3(0, 1.5, 524);

// Clear autumn afternoon sun angled from left-front to illuminate canyon maples, lodge facade, and lake glints
export const SUN_DIR = new THREE.Vector3(-0.78, 0.54, 0.22).normalize();

// 70 : 25 : 5 Color Harmony Palette (1950s BC Autumn Fjord)
export const PALETTE = {
  // Base (~70%): deep fjord navy lake & clear autumn sky
  lakeDeep: '#153257',
  lakeMid: '#1f4673',
  lakeGlacial: '#235982',
  skyZenith: '#376ba2',
  skyMid: '#6496c7',
  skyHorizon: '#b6cfe0',

  // Main (~25%): autumn maple orange & Douglas fir / pine green
  mapleBright: '#d46a28',
  mapleDeep: '#b44d1f',
  mapleGold: '#d89238',
  pineDark: '#234532',
  pineMid: '#2f583f',
  mossGrass: '#4a5f39',
  graniteRock: '#4b5563',
  graniteWarm: '#635c57',

  // Accent (~5%): ivory, cream, burnt sienna
  ivory: '#f3ebd8',
  cream: '#e8dcc2',
  burntSienna: '#9e4724',
  cedarWood: '#6f482e',
  darkTimber: '#473022',
  lanternAmber: '#f6b85c',
};

export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DIR.clone() },
  uFogColor: { value: new THREE.Color('#9ab7cd') },
  uFogDensity: { value: 0.00145 },
};
