// Shared deterministic layout for terrain pads and solid structures (zero overlaps, zero pinches).
import { OASIS_POS, OBSERVATORY_POS } from '../core/env.js';

export const VILLAGE_HOUSES = [
  // Home courtyard & immediate neighbors (all on courtyard pad y = 2.0)
  { id: 'homeHouse', x: -7.5, z: -7.2, w: 6.2, d: 5.0, h: 4.3, rot: 0.06, tier: 2, y: 2.0, color: 'terracotta', awning: 'saffron', veranda: true },
  { id: 'neighborEast', x: 9.8, z: -6.0, w: 5.6, d: 4.8, h: 3.9, rot: -0.14, tier: 1, y: 2.0, color: 'adobe', pergola: true },
  { id: 'neighborWest', x: -12.4, z: 2.8, w: 5.0, d: 4.4, h: 3.7, rot: 0.10, tier: 2, y: 2.0, color: 'terracottaWarm', awning: 'turquoise' },

  // Village approach houses (z = 21 .. 80), varied forms, tiers, awnings & rooftop terraces
  { id: 'vHouse1', x: -13.6, z: 22.0, w: 6.2, d: 5.4, h: 4.6, rot: 0.14, tier: 2, color: 'terracotta', awning: 'saffron', steps: true },
  { id: 'vHouse2', x: 13.8, z: 24.5, w: 5.8, d: 5.2, h: 4.1, rot: -0.16, tier: 1, color: 'adobeLight', pergola: true, awning: 'turquoise' },
  { id: 'vHouse3', x: -24.0, z: 34.0, w: 6.6, d: 5.6, h: 5.0, rot: 0.28, tier: 2, color: 'terracottaWarm', veranda: true },
  { id: 'vHouse4', x: 14.8, z: 42.0, w: 6.4, d: 5.4, h: 4.8, rot: -0.22, tier: 2, color: 'terracotta', awning: 'saffron' },
  { id: 'vHouse5', x: -14.2, z: 46.5, w: 5.8, d: 5.0, h: 4.2, rot: 0.10, tier: 1, color: 'adobe', pergola: true, steps: true },
  { id: 'vHouse6', x: 25.5, z: 54.0, w: 6.2, d: 5.2, h: 4.9, rot: -0.32, tier: 2, color: 'terracottaDark', awning: 'turquoise' },
  { id: 'vHouse7', x: -22.0, z: 64.0, w: 6.8, d: 5.8, h: 5.2, rot: 0.22, tier: 2, color: 'terracottaWarm', veranda: true },
  { id: 'vHouse8', x: 14.2, z: 68.0, w: 6.0, d: 5.0, h: 4.3, rot: -0.14, tier: 1, color: 'adobeLight', pergola: true, awning: 'saffron' },
  { id: 'vHouse9', x: -12.6, z: 78.5, w: 5.6, d: 4.8, h: 4.0, rot: 0.26, tier: 1, color: 'terracotta', awning: 'turquoise' },
  { id: 'vHouse10', x: 23.5, z: 79.0, w: 6.2, d: 5.4, h: 4.7, rot: -0.22, tier: 2, color: 'adobe', steps: true },
];

export const VILLAGE_STALLS = [
  { id: 'stall1', x: -8.0, z: 33.5, rot: 1.48, stripe: 'saffron', kind: 'spice' },
  { id: 'stall2', x: 8.2, z: 21.0, rot: -1.50, stripe: 'turquoise', kind: 'pottery' },
  { id: 'stall3', x: -8.0, z: 48.0, rot: 1.52, stripe: 'saffron', kind: 'rugs' },
  { id: 'stall4', x: 8.2, z: 55.0, rot: -1.52, stripe: 'turquoise', kind: 'spice' },
  { id: 'stall5', x: -8.0, z: 61.5, rot: 1.55, stripe: 'saffron', kind: 'pottery' },
];

export const VILLAGE_WELL = { id: 'well1', x: 7.4, z: 36.0, r: 1.45 };

// Street lantern colonnade piers flanking the village lane (with high non-solid overhead striped banners)
export const VILLAGE_COLONNADE = [
  { z: 16.5, stripe: 'saffron' },
  { z: 28.5, stripe: 'turquoise' },
  { z: 40.5, stripe: 'saffron' },
  { z: 52.5, stripe: 'turquoise' },
  { z: 64.5, stripe: 'saffron' },
  { z: 76.5, stripe: 'turquoise' },
];

// Side tiled courtyard patios & shaded pergolas along the village lane (spaced clear of colonnade & stalls)
export const VILLAGE_COURTYARDS = [
  { id: 'vc1', x: -8.4, z: 22.0, wallLen: 3.4, wallRot: 0.08, tileW: 4.2, tileD: 3.8, pergola: true },
  { id: 'vc2', x: 8.4, z: 28.5, wallLen: 3.2, wallRot: -0.10, tileW: 4.0, tileD: 3.6, pergola: false },
  { id: 'vc3', x: 8.6, z: 46.5, wallLen: 3.4, wallRot: -0.06, tileW: 4.2, tileD: 4.0, pergola: true },
  { id: 'vc4', x: -8.4, z: 70.5, wallLen: 3.2, wallRot: 0.12, tileW: 4.0, tileD: 3.6, pergola: true },
  { id: 'vc5', x: 8.6, z: 76.0, wallLen: 3.4, wallRot: -0.10, tileW: 4.2, tileD: 3.8, pergola: false },
];

// Radial wooden dock from sandy shore (r ~ 18.4) onto oasis spring edge (r ~ 13.4)
export const OASIS_DOCK = {
  x: OASIS_POS.x + 15.0,
  z: OASIS_POS.z - 5.5,
  rot: Math.atan2(15.0, -5.5) + Math.PI * 0.5,
  length: 5.2,
  width: 2.1,
};

// Sandstone outcrops & milestone cairns on flattened terrain pads so bases sit flush
export const DESERT_ROCKS = [
  { x: -28, z: 98, s: 1.5 },
  { x: 28, z: 108, s: 1.7 },
  { x: -64, z: 175, s: 2.0 },
  { x: 44, z: 165, s: 1.9 },
  { x: -32, z: 228, s: 1.8 },
  { x: 52, z: 236, s: 2.2 },
  { x: -48, z: 290, s: 2.0 },
  { x: 36, z: 305, s: 1.7 },
  { x: -22, z: 342, s: 1.6 },
  { x: 46, z: 355, s: 2.1 },
  { x: OASIS_POS.x - 25.5, z: OASIS_POS.z + 10.5, s: 1.45 },
  { x: OASIS_POS.x + 26.5, z: OASIS_POS.z + 15.5, s: 1.35 },
];

export const DESERT_CAIRNS = [
  { x: -11.5, z: 196 },
  { x: 16.5, z: 266 },
  { x: -6.5, z: 328 },
];

export function collectTerrainPads(getBaseTerrainY) {
  const pads = [
    // Home courtyard terrace
    { x: 0, z: 0, r: 16.5, blend: 6.5, y: 2.0 },
    // Observatory hilltop plaza (wide enough for fountain + plaza + dome at obsZ=+8.5)
    { x: OBSERVATORY_POS.x, z: OBSERVATORY_POS.z, r: 22.5, blend: 16.0, y: OBSERVATORY_POS.y },
  ];
  for (const h of VILLAGE_HOUSES) {
    if (h.y !== undefined) continue;
    const y = getBaseTerrainY(h.x, h.z);
    const rad = Math.max(5.2, Math.hypot(h.w, h.d) * 0.55 + 1.0);
    pads.push({ x: h.x, z: h.z, r: rad, blend: 3.6, y });
  }
  for (const s of VILLAGE_STALLS) {
    pads.push({ x: s.x, z: s.z, r: 3.0, blend: 2.4, y: getBaseTerrainY(s.x, s.z) });
  }
  for (const col of VILLAGE_COLONNADE) {
    for (const sx of [-5.3, 5.3]) {
      pads.push({ x: sx, z: col.z, r: 1.6, blend: 1.8, y: getBaseTerrainY(sx, col.z) });
    }
  }
  for (const vc of VILLAGE_COURTYARDS) {
    pads.push({ x: vc.x, z: vc.z, r: 3.1, blend: 2.4, y: getBaseTerrainY(vc.x, vc.z) });
  }
  pads.push({
    x: VILLAGE_WELL.x,
    z: VILLAGE_WELL.z,
    r: 2.9,
    blend: 2.2,
    y: getBaseTerrainY(VILLAGE_WELL.x, VILLAGE_WELL.z),
  });
  for (const r of DESERT_ROCKS) {
    pads.push({ x: r.x, z: r.z, r: r.s * 1.5, blend: 2.2, y: getBaseTerrainY(r.x, r.z) });
  }
  for (const c of DESERT_CAIRNS) {
    pads.push({ x: c.x, z: c.z, r: 1.8, blend: 2.0, y: getBaseTerrainY(c.x, c.z) });
  }
  return pads;
}
