// Pure SDF definitions of the gloved hands and the people (girl, dad, guest grandma).
// Baked offline by tools/bake.mjs into bin/*.bin (positions, normals, colours, fabric ids, skin weights).
import { roundCone, roundBox, ellipsoid, smin, smax, noise3 } from './sdfcore.js';

// ------------------------------------------------------------ gloved hand (white cotton, gripping a 29mm handle)
const R = 0.0145;
const GLOVE = [0.6, 0.585, 0.55];
function fingerPts(y, scale, open) {
  if (open) return [[0.024, y, 0.022], [0.022, y, 0.05 * scale], [0.018, y, 0.074 * scale], [0.012, y, 0.092 * scale]];
  const angs = [42, 98, 168, 232];
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const a = (angs[i] * Math.PI) / 180;
    const r = i === 0 ? 0.033 : R + 0.0074 * scale;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  if (scale < 0.9) pts[3] = [pts[2][0] * 0.45 + pts[3][0] * 0.55, y, pts[2][2] * 0.45 + pts[3][2] * 0.55];
  return pts;
}
export function handShape(open) {
  const ys = [0.0215, 0.0072, -0.0072, -0.0212];
  const sc = [1.0, 1.04, 0.97, 0.84];
  const fingers = ys.map((y, i) => fingerPts(y, sc[i], open));
  const thumb = open
    ? [[0.032, 0.028, -0.012], [0.03, 0.048, 0.002], [0.024, 0.064, 0.016]]
    : [[0.032, 0.022, -0.02], [0.018, 0.033, -0.03], [0.0, 0.034, -0.027], [-0.014, 0.03, -0.017]];
  const sdf = (x, y, z) => {
    let d = roundBox(x, y, z, [0.03, 0.0, -0.002], [0.011, 0.03, 0.027], 0.009);
    for (let f = 0; f < 4; f++) {
      const p = fingers[f];
      const rr = 0.0071 * (f === 3 ? 0.9 : 1);
      let fd = roundCone(x, y, z, p[0], p[1], rr * 1.05, rr);
      fd = smin(fd, roundCone(x, y, z, p[1], p[2], rr, rr * 0.95), 0.003);
      fd = smin(fd, roundCone(x, y, z, p[2], p[3], rr * 0.95, rr * 0.86), 0.003);
      d = f === 0 ? smin(d, fd, 0.005) : smin(d, fd, 0.0015);
    }
    let td = roundCone(x, y, z, thumb[0], thumb[1], 0.011, 0.0095);
    for (let i = 1; i < thumb.length - 1; i++) td = smin(td, roundCone(x, y, z, thumb[i], thumb[i + 1], 0.0095, 0.0085), 0.003);
    d = smin(d, td, 0.009);
    const wr = roundCone(x, y, z, [0.036, -0.004, -0.002], [0.105, -0.03, -0.002], 0.021, 0.0245);
    d = smin(d, wr, 0.012);
    const t = Math.max(0, Math.min(1, (x - 0.072) / 0.03));
    if (t > 0) { const ang = Math.atan2(z + 0.002, y + 0.03 * ((x - 0.036) / 0.069)); d += -0.0011 * Math.sin(ang * 22) * t; }
    d += 0.0008 * noise3(x * 170, y * 170, z * 170);
    // seams along finger backs
    d += 0.0005 * Math.sin(x * 1100 + noise3(x * 60, y * 60, z * 60) * 3) * Math.max(0, 1 - Math.abs(x - 0.05) / 0.02);
    return d;
  };
  const attr = (x) => ({ color: x > 0.074 ? [GLOVE[0] * 0.95, GLOVE[1] * 0.94, GLOVE[2] * 0.9] : GLOVE, mat: 1, rough: 0.92 });
  return { sdf, attr, bmin: [-0.04, -0.06, -0.06], bmax: [0.125, 0.09, open ? 0.12 : 0.06], step: 0.0019 };
}

// ------------------------------------------------------------ people
// bones: 0 hips,1 spine,2 chest,3 neck,4 head,5 Lupper,6 Lfore,7 Lhand,8 Rupper,9 Rfore,10 Rhand,11 Lthigh,12 Lshin,13 Lfoot,14 Rthigh,15 Rshin,16 Rfoot
export const BONE_PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];
const mirror = (p) => [-p[0], p[1], p[2]];
function jointsAdult(H) {
  const s = H / 1.76;
  const J = {
    hip: [0, 0.97, 0], spine: [0, 1.12, 0.005], chest: [0, 1.30, 0.0], neck: [0, 1.49, -0.015], headC: [0, 1.635, 0.005], neckTop: [0, 1.555, -0.01],
    Lsh: [0.185, 1.445, -0.025], Lel: [0.33, 1.19, -0.05], Lwr: [0.44, 0.975, -0.005], Lhe: [0.495, 0.83, 0.015],
    Lhip: [0.095, 0.925, 0], Lkn: [0.105, 0.51, 0.02], Lan: [0.11, 0.085, -0.015], Lto: [0.115, 0.028, 0.155],
  };
  for (const k in J) J[k] = J[k].map((v) => v * s);
  return J;
}
function jointsChild() {
  return {
    hip: [0, 0.585, 0], spine: [0, 0.68, 0.005], chest: [0, 0.80, 0.0], neck: [0, 0.885, -0.01], headC: [0, 0.985, 0.008], neckTop: [0, 0.92, -0.008],
    Lsh: [0.118, 0.858, -0.015], Lel: [0.205, 0.705, -0.03], Lwr: [0.27, 0.565, -0.005], Lhe: [0.3, 0.475, 0.01],
    Lhip: [0.064, 0.555, 0], Lkn: [0.07, 0.315, 0.015], Lan: [0.072, 0.06, -0.01], Lto: [0.075, 0.022, 0.11],
  };
}
// part: {bone, d:(x,y,z)=>dist, m: material descriptor, cloth:bool}
export function personShape(kind, gloved = false) {
  const child = kind === 'girl';
  const J = child ? jointsChild() : jointsAdult(kind === 'grandma' ? 1.56 : 1.77);
  const k = child ? 0.6 : 1.0; // radius scale
  const C = {
    girl: { top: [0.70, 0.63, 0.52], topMat: 1, bottom: [0.10, 0.12, 0.20], bottomMat: 2, legs: [0.16, 0.13, 0.13], legMat: 5, shoe: [0.30, 0.17, 0.10], hair: [0.14, 0.085, 0.05], skin: [0.84, 0.64, 0.53] },
    papa: { top: [0.17, 0.21, 0.17], topMat: 1, bottom: [0.38, 0.32, 0.23], bottomMat: 5, legs: [0.38, 0.32, 0.23], legMat: 5, shoe: [0.26, 0.15, 0.08], hair: [0.12, 0.08, 0.06], skin: [0.76, 0.56, 0.44], apron: [0.30, 0.20, 0.12] },
    grandma: { top: [0.50, 0.36, 0.22], topMat: 2, bottom: [0.50, 0.36, 0.22], bottomMat: 2, legs: [0.15, 0.15, 0.17], legMat: 5, shoe: [0.10, 0.08, 0.07], hair: [0.66, 0.65, 0.63], skin: [0.84, 0.66, 0.57], scarf: [0.42, 0.07, 0.11] },
  }[kind];
  const parts = [];
  const add = (bone, d, m) => parts.push({ bone, d, m });
  const addH = (bone, d, m) => parts.push({ bone, d, m, head: true });
  const M = (color, mat, rough) => ({ color, mat, rough });
  const skin = M(C.skin, 0, 0.55), top = M(C.top, C.topMat, 0.88), bottom = M(C.bottom, C.bottomMat, 0.85), legs = M(C.legs, C.legMat, 0.8), shoe = M(C.shoe, 4, 0.45), hair = M(C.hair, 3, 0.5);
  // head & neck
  const hc = J.headC;
  const hr = child ? [0.083, 0.098, 0.09] : kind === 'grandma' ? [0.075, 0.1, 0.088] : [0.078, 0.108, 0.094];
  addH(4, (x, y, z) => {
    let d = ellipsoid(x, y, z, hc, hr);
    d = smin(d, ellipsoid(x, y, z, [hc[0], hc[1] - hr[1] * 0.55, hc[2] + hr[2] * 0.25], [hr[0] * 0.72, hr[1] * 0.45, hr[2] * 0.62]), 0.03 * k); // jaw
    d = smin(d, ellipsoid(x, y, z, [hc[0], hc[1] - hr[1] * 0.12, hc[2] + hr[2] * 0.98], [0.011 * (child ? 0.8 : 1), 0.02 * (child ? 0.7 : 1), 0.014]), 0.008); // nose
    for (const sx of [-1, 1]) d = smin(d, ellipsoid(x, y, z, [hc[0] + sx * hr[0] * 0.98, hc[1] - hr[1] * 0.08, hc[2] - 0.005], [0.01, 0.026 * (child ? 0.8 : 1), 0.018]), 0.006); // ears
    for (const sx of [-1, 1]) d = smin(d, ellipsoid(x, y, z, [hc[0] + sx * hr[0] * 0.48, hc[1] - hr[1] * 0.22, hc[2] + hr[2] * 0.7], [0.026, 0.022, 0.02]), 0.02); // cheeks
    d = smin(d, ellipsoid(x, y, z, [hc[0], hc[1] + hr[1] * 0.2, hc[2] + hr[2] * 0.78], [hr[0] * 0.75, 0.014, 0.02]), 0.02); // brow ridge
    d = smin(d, ellipsoid(x, y, z, [hc[0], hc[1] - hr[1] * 0.86, hc[2] + hr[2] * 0.62], [0.018, 0.014, 0.014]), 0.015); // chin
    for (const sx of [-1, 1]) d = smin(d, ellipsoid(x, y, z, [hc[0] + sx * 0.011, hc[1] - hr[1] * 0.3, hc[2] + hr[2] * 0.93], [0.008, 0.007, 0.008]), 0.006); // nostril wings
    // eye sockets
    for (const sx of [-1, 1]) d = smax(d, -ellipsoid(x, y, z, [hc[0] + sx * hr[0] * 0.38, hc[1] + hr[1] * 0.06, hc[2] + hr[2] * 0.95], [0.017, 0.0105, 0.012]), 0.005);
    return d;
  }, skin);
  // eyes (dark, glossy) + brows
  // eyeballs (white with brown iris, glossy)
  const eyeR = child ? 0.0115 : 0.0118;
  const eyeC = (sx) => [hc[0] + sx * hr[0] * 0.38, hc[1] + hr[1] * 0.06, hc[2] + hr[2] * 0.93 - eyeR * 0.55];
  addH(4, (x, y, z) => Math.min(Math.hypot(x - eyeC(1)[0], y - eyeC(1)[1], z - eyeC(1)[2]), Math.hypot(x - eyeC(-1)[0], y - eyeC(-1)[1], z - eyeC(-1)[2])) - eyeR, { eye: true, color: [0.8, 0.77, 0.73], mat: 4, rough: 0.08 });
  // brows
  addH(4, (x, y, z) => { let d = 9; for (const sx of [-1, 1]) d = Math.min(d, roundCone(x, y, z, [hc[0] + sx * hr[0] * 0.2, hc[1] + hr[1] * 0.25, hc[2] + hr[2] * 0.95], [hc[0] + sx * hr[0] * 0.6, hc[1] + hr[1] * 0.23, hc[2] + hr[2] * 0.82], 0.0045, 0.003)); return d; }, M(C.hair, 3, 0.6));
  // lips
  addH(4, (x, y, z) => Math.min(ellipsoid(x, y, z, [hc[0], hc[1] - hr[1] * 0.5, hc[2] + hr[2] * 0.93], [0.019 * (child ? 0.8 : 1), 0.0055, 0.008]), ellipsoid(x, y, z, [hc[0], hc[1] - hr[1] * 0.58, hc[2] + hr[2] * 0.9], [0.016 * (child ? 0.8 : 1), 0.0065, 0.008])), M([C.skin[0] * 0.85, C.skin[1] * 0.55, C.skin[2] * 0.55], 0, 0.4));
  add(3, (x, y, z) => roundCone(x, y, z, J.neck, J.neckTop, 0.05 * k + (child ? 0.012 : 0), 0.048 * k + (child ? 0.01 : 0)), skin);
  // hair
  if (kind === 'girl') {
    addH(4, (x, y, z) => {
      let d = ellipsoid(x, y, z, [hc[0], hc[1] + 0.012, hc[2] - 0.008], [hr[0] + 0.014, hr[1] + 0.012, hr[2] + 0.014]);
      d = smax(d, (z - (hc[2] + 0.06)) - (y - (hc[1] + 0.02)) * 0.6, 0.012); // fringe line
      d = smax(d, -(y - (hc[1] - 0.045)) - Math.max(0, -(z - hc[2])) * 2.0, 0.02);
      // long hair down the back
      const back = roundCone(x, y, z, [hc[0], hc[1] - 0.02, hc[2] - 0.055], [hc[0], hc[1] - 0.2, hc[2] - 0.075], 0.075, 0.055);
      d = smin(d, smax(back, (z - (hc[2] - 0.02)), 0.02), 0.03);
      d += 0.004 * Math.abs(noise3(x * 90, y * 7, z * 90)) + 0.0015 * noise3(x * 300, y * 30, z * 300) - 0.002;
      return d;
    }, hair);
  } else {
    const thick = kind === 'grandma' ? 0.018 : 0.01;
    addH(4, (x, y, z) => {
      let d = ellipsoid(x, y, z, [hc[0], hc[1] + 0.012, hc[2] - 0.01], [hr[0] + thick, hr[1] + 0.006 + thick * 0.4, hr[2] + thick]);
      d = smax(d, (z - (hc[2] + 0.055)) - (y - (hc[1] + 0.045)) * 0.9, 0.01);
      d = smax(d, -(y - (hc[1] - 0.02)) - Math.max(0, -(z - hc[2] + 0.02)) * 1.5, 0.015);
      if (kind === 'grandma') d = smin(d, ellipsoid(x, y, z, [hc[0], hc[1] + 0.02, hc[2] - hr[2] - 0.02], [0.04, 0.035, 0.03]), 0.015); // bun
      d += 0.0018 * noise3(x * 150, y * 20, z * 150);
      return d;
    }, hair);
    if (kind === 'papa') addH(4, (x, y, z) => { // short beard
      let d = ellipsoid(x, y, z, [hc[0], hc[1] - hr[1] * 0.58, hc[2] + hr[2] * 0.32], [hr[0] * 0.78, hr[1] * 0.42, hr[2] * 0.66]);
      d = smax(d, (y - (hc[1] - hr[1] * 0.22)), 0.01);
      d += 0.002 * noise3(x * 200, y * 200, z * 200);
      return d;
    }, M([0.20, 0.14, 0.10], 3, 0.6));
  }
  // torso
  const tw = child ? 1 : 1;
  const torso = (x, y, z) => {
    const s = child ? 0.62 : 1;
    let d = ellipsoid(x, y, z, J.chest, [0.165 * s * (child ? 1.05 : 1), 0.17 * s, 0.11 * s * (child ? 1.1 : 1)]);
    d = smin(d, ellipsoid(x, y, z, J.spine, [0.15 * s, 0.14 * s, 0.105 * s * (child ? 1.15 : 1)]), 0.06 * s);
    d = smin(d, roundCone(x, y, z, [J.Lsh[0] * 0.9, J.Lsh[1] - 0.012 * s, J.Lsh[2]], [0, J.Lsh[1] + 0.015 * s, J.Lsh[2]], 0.055 * s, 0.06 * s), 0.07 * s);
    d = smin(d, roundCone(x, y, z, [-J.Lsh[0] * 0.9, J.Lsh[1] - 0.012 * s, J.Lsh[2]], [0, J.Lsh[1] + 0.015 * s, J.Lsh[2]], 0.055 * s, 0.06 * s), 0.07 * s);
    return d;
  };
  const pelvis = (x, y, z) => { const s = child ? 0.62 : 1; return ellipsoid(x, y, z, [J.hip[0], J.hip[1] - 0.02 * s, J.hip[2]], [0.165 * s, 0.12 * s, 0.11 * s]); };
  add(2, (x, y, z) => torso(x, y, z), top);
  add(0, (x, y, z) => pelvis(x, y, z), kind === 'girl' ? bottom : kind === 'grandma' ? top : bottom);
  // dress / coat skirt
  if (kind === 'girl') add(0, (x, y, z) => { // pinafore skirt flare
    let d = roundCone(x, y, z, [0, J.hip[1] + 0.02, 0], [0, J.hip[1] - 0.2, 0.0], 0.1, 0.16);
    d += 0.004 * Math.sin(Math.atan2(z, x) * 9 + noise3(x * 10, 0, z * 10) * 2) * Math.max(0, J.hip[1] - y) * 6;
    return smax(d, Math.max(J.hip[1] - 0.22 - y, y - (J.hip[1] + 0.1)), 0.01);
  }, bottom);
  if (kind === 'grandma') add(0, (x, y, z) => { // coat skirt to knees
    let d = roundCone(x, y, z, [0, J.hip[1] + 0.05, 0], [0, J.hip[1] - 0.38, 0.0], 0.17, 0.22);
    d += 0.005 * Math.sin(Math.atan2(z, x) * 7 + noise3(x * 8, 0, z * 8) * 2) * Math.max(0, J.hip[1] - y) * 3;
    return smax(d, Math.max(J.hip[1] - 0.42 - y, y - (J.hip[1] + 0.1)), 0.01);
  }, top);
  if (kind === 'papa') add(1, (x, y, z) => { // canvas bib apron draped over the front
    const yTop = J.chest[1] + 0.1, yBot = J.Lkn[1] + 0.06;
    if (y > yTop + 0.03 || y < yBot - 0.03 || z < 0) return 0.05;
    const body = smin(smin(torso(x, y, z), pelvis(x, y, z), 0.08), Math.min(roundCone(x, y, z, J.Lhip, J.Lkn, 0.1, 0.07), roundCone(x, y, z, mirror(J.Lhip), mirror(J.Lkn), 0.1, 0.07)), 0.12);
    const hang = Math.max(0, (J.hip[1] - y)) * 0.15; // falls straight below the belly
    let d = body - 0.018 - hang;
    const half = y > J.chest[1] - 0.05 ? 0.12 : 0.17 + (J.hip[1] - y) * 0.06;
    d = smax(d, Math.abs(x) - half, 0.006);
    d = smax(d, Math.max(y - yTop, yBot - y), 0.006);
    d = smax(d, -z + 0.02, 0.01);
    d += 0.0025 * noise3(x * 12, y * 4, z * 12) + 0.0012 * Math.sin(x * 70 + noise3(x * 8, y * 3, z * 8) * 3) * Math.max(0, J.hip[1] - y) * 4;
    return d;
  }, M(C.apron, 5, 0.75));
  if (kind === 'grandma') add(3, (x, y, z) => { // scarf
    const d = roundCone(x, y, z, [0, J.neck[1] - 0.03, 0], [0, J.neckTop[1] - 0.02, 0], 0.075, 0.062);
    return d + 0.003 * Math.sin(y * 160 + Math.atan2(z, x) * 3);
  }, M(C.scarf, 1, 0.9));
  // arms
  for (const side of [1, -1]) {
    const f = side > 0 ? (p) => p : mirror;
    const b0 = side > 0 ? 5 : 8;
    const s = child ? 0.62 : 1;
    const sh = f(J.Lsh), el = f(J.Lel), wr = f(J.Lwr), he = f(J.Lhe);
    add(b0, (x, y, z) => roundCone(x, y, z, sh, el, 0.058 * s, 0.047 * s), top);
    add(b0 + 1, (x, y, z) => {
      let d = roundCone(x, y, z, el, wr, 0.047 * s, 0.038 * s);
      return d;
    }, top);
    add(b0 + 2, (x, y, z) => { // hand: palm + mitten-ish fingers relaxed
      const dir = [he[0] - wr[0], he[1] - wr[1], he[2] - wr[2]];
      const mid = [wr[0] + dir[0] * 0.45, wr[1] + dir[1] * 0.45, wr[2] + dir[2] * 0.45];
      let d = roundCone(x, y, z, [wr[0] + dir[0] * 0.08, wr[1] + dir[1] * 0.08, wr[2] + dir[2] * 0.08], mid, 0.03 * s, 0.033 * s);
      d = smin(d, roundCone(x, y, z, mid, he, 0.03 * s, 0.017 * s), 0.02 * s);
      // flatten palm
      d = smax(d, Math.abs((z - mid[2])) - 0.022 * s, 0.01 * s);
      // thumb
      d = smin(d, roundCone(x, y, z, [wr[0] + dir[0] * 0.25, wr[1] + dir[1] * 0.25, wr[2] + 0.02 * s], [wr[0] + dir[0] * 0.6, wr[1] + dir[1] * 0.6, wr[2] + 0.04 * s], 0.013 * s, 0.01 * s), 0.01 * s);
      return d;
    }, gloved ? M([0.8, 0.79, 0.75], 1, 0.92) : skin);
  }
  // legs
  for (const side of [1, -1]) {
    const f = side > 0 ? (p) => p : mirror;
    const b0 = side > 0 ? 11 : 14;
    const s = child ? 0.6 : 1;
    const hp = f(J.Lhip), kn = f(J.Lkn), an = f(J.Lan), to = f(J.Lto);
    add(b0, (x, y, z) => roundCone(x, y, z, hp, kn, 0.088 * s, 0.06 * s), kind === 'girl' ? legs : kind === 'grandma' ? legs : bottom);
    add(b0 + 1, (x, y, z) => roundCone(x, y, z, kn, [an[0], an[1] + 0.03 * s, an[2]], 0.06 * s, 0.043 * s), kind === 'papa' ? bottom : legs);
    add(b0 + 2, (x, y, z) => { // shoe / boot
      let d = roundCone(x, y, z, [an[0], an[1] + 0.02, an[2] - 0.02 * s], [to[0], to[1] + 0.005, to[2] - 0.015 * s], 0.05 * s, 0.035 * s);
      d = smax(d, -(y - 0.0), 0.004);
      if (kind !== 'grandma') d = smin(d, roundCone(x, y, z, [an[0], an[1], an[2]], [an[0], an[1] + 0.1 * s, an[2]], 0.052 * s, 0.05 * s), 0.02 * s);
      return d;
    }, shoe);
  }
  const kk = child ? 0.014 : 0.022;
  const clothNoise = (x, y, z) => 0.0028 * noise3(x * 16, y * 16, z * 16) + 0.0012 * noise3(x * 45, y * 45, z * 45);
  // fold rings at elbows/knees/waist
  const folds = (x, y, z) => {
    let f = 0;
    for (const p of [J.Lel, mirror(J.Lel), J.Lkn, mirror(J.Lkn)]) {
      const dd = Math.hypot(x - p[0], y - p[1], z - p[2]);
      if (dd < 0.08) f += 0.0025 * Math.sin(dd * 140 + noise3(x * 30, y * 30, z * 30) * 4) * (1 - dd / 0.08);
    }
    return f;
  };
  const all = parts.slice();
  const makeSdf = (parts) => (x, y, z) => {
    let d = 9;
    for (let i = 0; i < parts.length; i++) {
      const pi = parts[i].d(x, y, z);
      d = i < 1 ? pi : smin(d, pi, parts[i].m.mat === 0 && parts[i].bone >= 5 ? kk * 0.6 : parts[i].m.mat === 3 ? 0.004 : kk);
    }
    if (d < 0.03 && d > -0.03) {
      // garments wrinkle, skin does not
      let near = 0, best = 9;
      for (let i = 0; i < parts.length; i++) { const pi = parts[i].d(x, y, z); if (pi < best) { best = pi; near = i; } }
      const mm = parts[near].m.mat;
      if (mm !== 0 && mm !== 4 && mm !== 3) d += clothNoise(x, y, z) + folds(x, y, z);
    }
    return d;
  };
  const makeAttr = (parts) => (x, y, z) => {
    const ds = parts.map((p) => p.d(x, y, z));
    let best = 0;
    for (let i = 1; i < ds.length; i++) if (ds[i] < ds[best]) best = i;
    const m = parts[best].m;
    // skinning: soft weights over nearby parts' bones
    const wb = {};
    const dmin = ds[best];
    for (let i = 0; i < ds.length; i++) {
      const w = Math.exp(-(ds[i] - dmin) / (child ? 0.008 : 0.012));
      if (w < 0.02) continue;
      const b = parts[i].bone;
      wb[b] = (wb[b] || 0) + w;
    }
    // hair & face follow head rigidly
    if (parts[best].bone === 4) { for (const b in wb) if (+b !== 4 && +b !== 3) delete wb[b]; }
    const arr = Object.entries(wb).map(([b, w]) => [+b, w]).sort((a, c) => c[1] - a[1]).slice(0, 4);
    const sum = arr.reduce((s, a) => s + a[1], 0);
    arr.forEach((a) => (a[1] /= sum));
    // subtle colour variation (fabric dye, skin blush)
    const n = 1 + 0.05 * noise3(x * 20, y * 20, z * 20);
    let col = m.color.map((c) => Math.min(1, c * n));
    if (m.mat === 0 && parts[best].bone === 4) { // cheeks/nose a touch warmer
      const cz = z - hc[2];
      if (cz > hr[2] * 0.5) { const bl = Math.max(0, 1 - Math.hypot(Math.abs(x - hc[0]) - hr[0] * 0.45, y - (hc[1] - hr[1] * 0.2)) / 0.03); col = [col[0] * (1 + 0.04 * bl), col[1] * (1 - 0.07 * bl), col[2] * (1 - 0.06 * bl)]; }
    }
    if (m.eye) { // iris + pupil facing forward
      for (const sx of [-1, 1]) {
        const e = eyeC(sx);
        const dx = x - e[0], dy = y - e[1], dz = z - e[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        const c = dz / l;
        if (c > 0.82) col = c > 0.95 ? [0.03, 0.02, 0.02] : [0.26, 0.15, 0.08];
      }
    }
    // ribbed hem on knits, AO darkening in creases
    return { color: col, mat: m.mat, rough: m.rough, bones: arr, handRegion: parts[best].bone === 7 || parts[best].bone === 10 };
  };
  const bodyParts = all.filter((p) => !p.head);
  const headParts = all.filter((p) => p.head || p.bone === 3);
  const sdf = makeSdf(bodyParts), attr = makeAttr(bodyParts);
  const bones = [J.hip, J.spine, J.chest, J.neck, J.neckTop, J.Lsh, J.Lel, J.Lwr, mirror(J.Lsh), mirror(J.Lel), mirror(J.Lwr), J.Lhip, J.Lkn, J.Lan, mirror(J.Lhip), mirror(J.Lkn), mirror(J.Lan)];
  const Hh = child ? 1.12 : J.headC[1] + 0.15;
  const wspan = Math.abs(J.Lhe[0]) + 0.08;
  const headAttr = makeAttr(headParts);
  const head = { sdf: makeSdf(headParts), attr: (x, y, z) => { const a = headAttr(x, y, z); delete a.bones; return a; },
    bmin: [hc[0] - 0.13, J.neck[1] - 0.02, hc[2] - 0.2], bmax: [hc[0] + 0.13, hc[1] + 0.14, hc[2] + 0.13], step: 0.0032, offset: J.neckTop };
  return { sdf, attr, bmin: [-wspan, -0.01, -0.2 * (child ? 0.7 : 1)], bmax: [wspan, Hh, 0.22 * (child ? 0.75 : 1)], step: child ? 0.0085 : 0.011, bones, head };
}

// ------------------------------------------------------------ guest car (compact classic saloon), faces +Z
// mat ids: 9 paint, 10 glass, 11 chrome, 12 rubber/black trim, 13 lamp lens
export function carShape() {
  const L = 2.0, W = 0.84;
  const wheels = [[0.74, 0.31, 1.3], [-0.74, 0.31, 1.3], [0.74, 0.31, -1.32], [-0.74, 0.31, -1.32]];
  const body = (x, y, z) => {
    let d = roundBox(x, y, z, [0, 0.6, 0], [W, 0.3, L], 0.16);
    // tapered nose/tail: round off top front & rear
    d = smax(d, (y - 0.86) + (Math.abs(z) - 1.55) * 0.35, 0.12);
    // cabin with sloped windscreen & rear window
    let c = roundBox(x, y, z, [0, 1.12, -0.18], [W - 0.1 - (y - 0.85) * 0.25, 0.33, 1.05], 0.14);
    c = smax(c, (z - 0.55) * 0.82 + (y - 0.85) * 0.7, 0.06); // windscreen rake
    c = smax(c, -(z + 1.05) * 0.9 + (y - 0.85) * 0.55, 0.06); // rear window
    d = smin(d, c, 0.06);
    // wheel arches
    for (const w of wheels) d = smax(d, -(Math.hypot(y - w[1], z - w[2]) - 0.38), 0.03);
    // bumpers
    d = smin(d, roundBox(x, y, z, [0, 0.42, L + 0.02], [W - 0.02, 0.07, 0.06], 0.05), 0.01);
    d = smin(d, roundBox(x, y, z, [0, 0.42, -L - 0.02], [W - 0.02, 0.07, 0.06], 0.05), 0.01);
    // side mirrors
    for (const s of [-1, 1]) d = smin(d, ellipsoid(x, y, z, [s * (W + 0.07), 0.98, 0.42], [0.07, 0.05, 0.04]), 0.02);
    return d;
  };
  const sdf = (x, y, z) => body(x, y, z);
  const attr = (x, y, z) => {
    let color = [0.05, 0.08, 0.16], mat = 9, rough = 0.32;
    const ax = Math.abs(x);
    // glass greenhouse above beltline
    if (y > 0.9 && y < 1.4 && !(y > 1.36 && ax < W - 0.18)) {
      const pillarA = Math.abs(z - 0.4 + (y - 0.9) * 0.9) < 0.05 && ax > W - 0.3;
      const pillarB = Math.abs(z + 0.3) < 0.05 && ax > W - 0.3;
      const pillarC = Math.abs(z + 1.0 - (y - 0.9) * 0.6) < 0.07 && ax > W - 0.3;
      if (!pillarA && !pillarB && !pillarC) { color = [0.02, 0.025, 0.03]; mat = 10; rough = 0.04; }
    }
    if (y > 0.3 && y < 0.52 && Math.abs(z) > L - 0.04) { color = [0.75, 0.75, 0.76]; mat = 11; rough = 0.15; }
    // grille & lamps
    if (z > L - 0.12 && y > 0.52 && y < 0.72) {
      if (ax > 0.5 && ax < 0.74) { color = [0.95, 0.93, 0.85]; mat = 13; rough = 0.05; }
      else if (ax < 0.4) { color = [0.15, 0.15, 0.16]; mat = 11; rough = 0.3; }
    }
    if (z < -L + 0.12 && y > 0.55 && y < 0.72 && ax > 0.5 && ax < 0.76) { color = [0.5, 0.05, 0.04]; mat = 13; rough = 0.1; }
    // door shut lines & handles
    if (ax > W - 0.05 && y > 0.4 && y < 0.88 && (Math.abs(z - 0.42) < 0.006 || Math.abs(z + 0.42) < 0.006 || Math.abs(z + 1.2) < 0.006)) { color = [0.01, 0.01, 0.015]; mat = 12; rough = 0.8; }
    if (ax > W - 0.05 && Math.abs(y - 0.78) < 0.015 && (Math.abs(z - 0.2) < 0.06 || Math.abs(z + 0.65) < 0.06)) { color = [0.75, 0.75, 0.76]; mat = 11; rough = 0.15; }
    if (y < 0.3) { color = [0.03, 0.03, 0.03]; mat = 12; rough = 0.8; }
    return { color, mat, rough };
  };
  return { sdf, attr, bmin: [-1.0, 0.12, -2.15], bmax: [1.0, 1.55, 2.15], step: 0.02, wheels };
}
