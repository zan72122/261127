import * as THREE from '../../lib/three.module.js';

export const SEA_LEVEL = 0.0;

// Sun low over the western lagoon horizon (early summer dusk)
export const SUN_DIR = new THREE.Vector3(-0.56, 0.24, 0.79).normalize();

// Key world landmarks (Z increases out to sea toward the lighthouse cove)
export const HOME_POS = new THREE.Vector3(-5.5, 0, -6.5);
export const GIRL_START_POS = new THREE.Vector3(0.4, 0, 2.2);
export const WHALE_START_POS = new THREE.Vector3(1.5, 0, 26.5);

export const PIER_HOME_POS = new THREE.Vector3(-10.5, 0.75, 22.0);
export const PIER_REEF_POS = new THREE.Vector3(-25.0, 0.75, 84.0);
export const PIER_ISLAND_POS = new THREE.Vector3(-19.5, 0.75, 195.0);
export const PIER_EAST_POS = new THREE.Vector3(56.5, 0.75, 118.0);
export const PIER_COVE_POS = new THREE.Vector3(0.0, 0.75, 290.0);

export const SANDBAR_MAIN_POS = new THREE.Vector3(24.0, 0, 150.0);
export const SANDBAR_WEST_POS = new THREE.Vector3(-56.0, 0, 118.0);
export const ISLAND_GREEN_POS = new THREE.Vector3(-42.0, 0, 195.0);
export const REEF_CENTER_POS = new THREE.Vector3(-4.0, 0, 92.0);
export const ROCK_ARCH_POS = new THREE.Vector3(38.0, 0, 226.0);

export const COVE_POS = new THREE.Vector3(11.0, 0, 304.0);
export const LIGHTHOUSE_POS = new THREE.Vector3(18.0, 0, 315.0);

// 70 : 25 : 5 Okinawan Dusk Palette (harmonized mid-tone band)
export const PALETTE = {
  // Base (~70%): Emerald shallow lagoon & white coral sand
  sandWhite: '#ebe3cf',
  sandWet: '#cfc6b0',
  lagoonShallow: '#41b0a1',
  lagoonMid: '#2c8e8c',
  plasterWall: '#dfd7c5',
  coralStone: '#c5bcab',
  // Main (~25%): Deep reef blue, fukugi evergreen foliage, muted Okinawan roof tiles
  reefDeep: '#1a4c68',
  fukugiLeaf: '#26573b',
  fukugiLeafAlt: '#316544',
  roofTile: '#754e41',
  roofSlate: '#445258',
  weatheredWood: '#6f5540',
  // Accent (~5%): Coral pink & sunset gold
  coralPink: '#e38379',
  coralRose: '#cf6d6b',
  sunsetGold: '#f2b75c',
  lanternWarm: '#ffd27d',
};

export const shared = {
  uTime: { value: 0 },
  uAlt: { value: 0 },
};
