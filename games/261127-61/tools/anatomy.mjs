// Anatomy of an adult female reticulated giraffe (Giraffa reticulata) in a relaxed standing bind pose.
// Units: metres. Axes: +x forward (toward the head), +y up, +z to the animal's right side.
// Used only by bake.mjs (offline). Every primitive is bound to one bone (or blended between two along its axis),
// which gives smooth skin weights where neighbouring primitives meet.

const V = (x, y, z = 0) => [x, y, z];

// ---- joints (bind pose) -------------------------------------------------------------------------
// right-side limbs are defined, the left side is mirrored (z -> -z).
export const J = {
  root: V(0, 0, 0),
  body: V(0, 1.95, 0),
  chest: V(0.42, 2.05, 0),
  hips: V(-0.52, 1.98, 0),
  // neck: straight line from base to poll, 5 bones
  n0: V(0.74, 2.30), n1: V(0.94, 2.62), n2: V(1.14, 2.94), n3: V(1.34, 3.26), n4: V(1.54, 3.58),
  head: V(1.74, 3.90),
  jaw: V(1.76, 3.79),
  ear: V(1.71, 3.97, 0.075),
  tail0: V(-1.03, 2.04), tail1: V(-1.10, 1.78), tail2: V(-1.125, 1.48), tail3: V(-1.135, 1.18), tailEnd: V(-1.14, 0.93),
  // fore limb (right)
  scap: V(0.50, 2.42, 0.17),
  shoulder: V(0.86, 1.95, 0.205),
  elbow: V(0.62, 1.58, 0.195),
  carpus: V(0.665, 0.895, 0.18),
  carpus2: V(0.668, 0.835, 0.18),
  ffet: V(0.69, 0.195, 0.175),
  fhoof: V(0.80, 0.0, 0.175),
  // hind limb (right)
  hip: V(-0.62, 1.88, 0.19),
  stifle: V(-0.38, 1.40, 0.225),
  hock: V(-0.84, 0.905, 0.18),
  hock2: V(-0.835, 0.845, 0.18),
  hfet: V(-0.775, 0.195, 0.17),
  hhoof: V(-0.665, 0.0, 0.17),
};

// head frame: forward is 32 degrees below horizontal
const HA = -32 * Math.PI / 180;
const HF = [Math.cos(HA), Math.sin(HA), 0];
const HU = [-Math.sin(HA), Math.cos(HA), 0];
export function headPt(f, u, z = 0) {
  const p = J.head;
  return [p[0] + HF[0] * f + HU[0] * u, p[1] + HF[1] * f + HU[1] * u, z];
}
export const HEAD_FRAME = { f: HF, u: HU };

// ---- bones -----------------------------------------------------------------------------------
// [name, parent, jointKey, mirrored]
export const BONES = [
  ['root', null, 'root'],
  ['body', 'root', 'body'],
  ['chest', 'body', 'chest'],
  ['hips', 'body', 'hips'],
  ['neck0', 'chest', 'n0'], ['neck1', 'neck0', 'n1'], ['neck2', 'neck1', 'n2'], ['neck3', 'neck2', 'n3'], ['neck4', 'neck3', 'n4'],
  ['head', 'neck4', 'head'],
  ['jaw', 'head', 'jaw'],
  ['earR', 'head', 'ear', 'R'], ['earL', 'head', 'ear', 'L'],
  ['tail0', 'hips', 'tail0'], ['tail1', 'tail0', 'tail1'], ['tail2', 'tail1', 'tail2'], ['tail3', 'tail2', 'tail3'],
];
for (const s of ['R', 'L']) {
  BONES.push(
    ['scap' + s, 'chest', 'scap', s],
    ['hum' + s, 'scap' + s, 'shoulder', s],
    ['rad' + s, 'hum' + s, 'elbow', s],
    ['carp' + s, 'rad' + s, 'carpus', s],
    ['mcp' + s, 'carp' + s, 'carpus2', s],
    ['fpas' + s, 'mcp' + s, 'ffet', s],
    ['fem' + s, 'hips', 'hip', s],
    ['tib' + s, 'fem' + s, 'stifle', s],
    ['tars' + s, 'tib' + s, 'hock', s],
    ['mtt' + s, 'tars' + s, 'hock2', s],
    ['hpas' + s, 'mtt' + s, 'hfet', s],
  );
}
export function bonePos(b) {
  const p = J[b[2]].slice();
  if (b[3] === 'L') p[2] = -p[2];
  return p;
}

// ---- primitives --------------------------------------------------------------------------------
// type 'rc'  : round cone a->b radii ra, rb; optional sq = lateral squash (<1 = narrower in local side axis)
// type 'el'  : ellipsoid centre c, radii r, optional fwd (unit x-axis of the ellipsoid), up hint
// k          : smooth-union radius with what was there before (negative = smooth subtraction)
// bone       : bone name, or [boneA, boneB] blended along the axis (rc) / along world x (el, with range)
// m          : material masks {patch, dark, scale, pale}
// side       : 'S' = mirrored pair, otherwise centre-line
export const PRIMS = [];
function P(o) { PRIMS.push(o); }

const BODY = { patch: 1, scale: 1.0 };
// trunk ----------------------------------------------------------------------------------------
P({ t: 'el', c: V(-0.05, 1.96), r: [0.86, 0.42, 0.325], fwd: [0.985, 0.17, 0], bone: ['hips', 'chest'], range: [-0.55, 0.45], k: 0, m: BODY });
P({ t: 'el', c: V(0.38, 2.24), r: [0.52, 0.41, 0.25], fwd: [0.91, 0.42, 0], bone: 'chest', k: 0.16, m: BODY });     // withers & shoulders
P({ t: 'el', c: V(0.68, 1.87), r: [0.31, 0.36, 0.235], bone: 'chest', k: 0.14, m: BODY });                          // chest / brisket
P({ t: 'el', c: V(-0.63, 1.96), r: [0.37, 0.25, 0.25], fwd: [0.97, 0.24, 0], bone: 'hips', k: 0.14, m: BODY });                           // croup / rump
P({ t: 'el', c: V(-0.08, 1.85), r: [0.56, 0.36, 0.33], bone: ['hips', 'chest'], range: [-0.6, 0.4], k: 0.16, m: { patch: 0.85, scale: 1.0 } }); // belly
// neck -----------------------------------------------------------------------------------------
const NK = ['n0', 'n1', 'n2', 'n3', 'n4', 'head'];
const NR = [0.30, 0.235, 0.195, 0.168, 0.145, 0.125];
for (let i = 0; i < 5; i++) {
  P({ t: 'rc', a: J[NK[i]], b: J[NK[i + 1]], ra: NR[i], rb: NR[i + 1], sq: 0.6 - i * 0.012, bone: i < 4 ? ['neck' + i, 'neck' + (i + 1)] : ['neck4', 'head'], tb: i < 4 ? [0.5, 1.5] : [0.6, 1.2], k: i === 0 ? 0.18 : 0.05, m: { patch: 1, scale: 1.05 } });
}
// neck base fills into withers/chest
P({ t: 'el', c: V(0.86, 2.30), r: [0.30, 0.38, 0.215], fwd: [0.53, 0.85, 0], bone: ['chest', 'neck0'], range: [0.6, 1.0], k: 0.14, m: BODY });
// dorsal neck ridge (mane base), thin
P({ t: 'rc', a: V(0.56, 2.56), b: V(1.62, 4.00), ra: 0.07, rb: 0.035, sq: 0.55, bone: ['neck0', 'neck4'], tb: [0.1, 0.95], k: 0.08, m: { patch: 1, scale: 1.0 } });

// head (in head frame) -------------------------------------------------------------------------
const FACE = { patch: 1, scale: 0.42 };
P({ t: 'el', c: headPt(0.07, 0.02), r: [0.15, 0.115, 0.098], fwd: HF, bone: 'head', k: 0.06, m: FACE });            // cranium
P({ t: 'rc', a: headPt(0.12, 0.0), b: headPt(0.46, -0.025), ra: 0.092, rb: 0.060, sq: 0.86, bone: 'head', k: 0.05, m: { patch: 0.95, scale: 0.4 } }); // face
P({ t: 'el', c: headPt(0.495, -0.04), r: [0.088, 0.076, 0.066], fwd: HF, bone: 'head', k: 0.04, m: { patch: 0.35, scale: 0.28, pale: 0.6 } }); // muzzle
P({ t: 'el', c: headPt(0.535, -0.085), r: [0.062, 0.04, 0.058], fwd: HF, bone: 'head', k: 0.025, m: { patch: 0.0, scale: 0.25, pale: 0.7 } }); // upper lip
P({ t: 'el', c: headPt(0.13, -0.075, 0.056), r: [0.12, 0.085, 0.05], fwd: HF, bone: ['head', 'jaw'], range: [0.5, 0.5], side: 'S', k: 0.05, m: FACE }); // cheek / masseter
P({ t: 'rc', a: headPt(0.08, -0.125), b: headPt(0.47, -0.118), ra: 0.052, rb: 0.034, sq: 0.95, bone: 'jaw', k: 0.035, m: { patch: 0.8, scale: 0.32 } }); // lower jaw
P({ t: 'el', c: headPt(0.50, -0.125), r: [0.05, 0.035, 0.042], fwd: HF, bone: 'jaw', k: 0.03, m: { patch: 0.1, scale: 0.25, pale: 0.6 } }); // chin
P({ t: 'el', c: headPt(-0.02, -0.08), r: [0.11, 0.12, 0.085], fwd: HF, bone: ['neck4', 'head'], range: [0.5, 0.5], k: 0.06, m: FACE }); // throat latch
P({ t: 'el', c: headPt(0.165, 0.040, 0.078), r: [0.040, 0.034, 0.026], fwd: HF, bone: 'head', side: 'S', k: 0.025, m: { patch: 1, scale: 0.28, dark: 0.25 } }); // eye bulge
P({ t: 'el', c: headPt(0.215, 0.095), r: [0.055, 0.03, 0.035], fwd: HF, bone: 'head', k: 0.03, m: FACE });                          // median boss
// ossicones: point up-back in world (about 45 deg back in head frame)
P({ t: 'rc', a: headPt(0.05, 0.08, 0.05), b: headPt(-0.05, 0.215, 0.068), ra: 0.040, rb: 0.03, bone: 'head', side: 'S', k: 0.03, m: { patch: 0.95, scale: 0.26 } });
P({ t: 'el', c: headPt(-0.058, 0.228, 0.07), r: [0.037, 0.033, 0.036], bone: 'head', side: 'S', k: 0.012, m: { patch: 0, scale: 0.22, dark: 1 } });
// eye socket for the eyeball (subtraction so the ball sits in it)
P({ t: 'el', c: headPt(0.168, 0.046, 0.104), r: [0.026, 0.022, 0.016], fwd: HF, bone: 'head', side: 'S', k: -0.006, m: FACE });
// nostrils (slits)
P({ t: 'el', c: headPt(0.555, 0.005, 0.036), r: [0.026, 0.008, 0.012], fwd: [HF[0] * 0.8 + HU[0] * 0.6, HF[1] * 0.8 + HU[1] * 0.6, 0.0], bone: 'head', side: 'S', k: -0.01, m: { patch: 0, scale: 0.25, dark: 0.7, pale: 1 } });

// fore limbs -----------------------------------------------------------------------------------
const LEG = { patch: 1, scale: 0.62 };
const LOW = { patch: 0.0, scale: 0.4, pale: 1 };
function fore(s) {
  const z = (v) => V(v[0], v[1], v[2]);
  P({ t: 'el', c: V(0.68, 2.18, 0.17), r: [0.34, 0.15, 0.075], fwd: [0.52, -0.85, 0], bone: 'scap' + s, side: s, k: 0.12, m: BODY });          // scapula
  P({ t: 'rc', a: J.shoulder, b: V(0.64, 1.62, 0.195), ra: 0.145, rb: 0.095, sq: 0.7, bone: 'hum' + s, side: s, k: 0.12, m: BODY });                     // upper arm
  P({ t: 'el', c: V(0.60, 1.80, 0.16), r: [0.14, 0.18, 0.085], bone: 'hum' + s, side: s, k: 0.12, m: BODY });                                 // triceps
  P({ t: 'rc', a: V(0.625, 1.62, 0.192), b: V(0.665, 0.96, 0.18), ra: 0.105, rb: 0.047, sq: 0.68, bone: 'rad' + s, side: s, k: 0.10, m: LEG });               // forearm
  P({ t: 'el', c: V(0.64, 1.36, 0.18), r: [0.25, 0.092, 0.064], fwd: [0.07, -1, 0], bone: 'rad' + s, side: s, k: 0.09, m: LEG });           // forearm muscles
  P({ t: 'el', c: J.carpus, r: [0.062, 0.07, 0.058], bone: 'carp' + s, side: s, k: 0.04, m: { patch: 0.35, scale: 0.42 } });                  // carpus (knee)
  P({ t: 'rc', a: J.carpus2, b: V(0.688, 0.24, 0.175), ra: 0.045, rb: 0.038, sq: 0.9, bone: 'mcp' + s, side: s, k: 0.03, m: LOW });           // cannon
  P({ t: 'el', c: V(0.693, 0.19, 0.175), r: [0.058, 0.052, 0.05], bone: ['mcp' + s, 'fpas' + s], range: [0.5, 0.5], side: s, k: 0.03, m: LOW }); // fetlock
  P({ t: 'rc', a: V(0.70, 0.17, 0.175), b: V(0.75, 0.095, 0.175), ra: 0.046, rb: 0.052, bone: 'fpas' + s, side: s, k: 0.025, m: LOW });      // pastern
  hoof(V(0.775, 0.0, 0.175), 'fpas' + s, s);
}
function hoof(toeBase, bone, s) {
  // hoof: wedge-shaped, flat sole on y=0, cloven at the front
  P({ t: 'hoof', c: toeBase, bone, side: s, k: 0.02, m: { patch: 0, scale: 0.4, dark: 1 } });
}
// hind limbs -----------------------------------------------------------------------------------
function hind(s) {
  P({ t: 'el', c: V(-0.62, 1.72, 0.17), r: [0.33, 0.27, 0.145], fwd: [0.35, -0.94, 0], bone: ['hips', 'fem' + s], range: [2.0, 1.55], side: s, k: 0.16, m: BODY }); // thigh
  P({ t: 'el', c: V(-0.83, 1.71, 0.125), r: [0.30, 0.19, 0.125], fwd: [0.2, -0.98, 0], bone: 'fem' + s, side: s, k: 0.12, m: BODY });        // buttock
  P({ t: 'rc', a: V(-0.45, 1.42, 0.2), b: J.hock, ra: 0.105, rb: 0.05, sq: 0.62, bone: 'tib' + s, side: s, k: 0.13, m: LEG });             // gaskin
  P({ t: 'el', c: V(-0.60, 1.22, 0.185), r: [0.21, 0.105, 0.064], fwd: [-0.62, -0.78, 0], bone: 'tib' + s, side: s, k: 0.10, m: LEG });       // gaskin muscle
  P({ t: 'el', c: J.hock, r: [0.066, 0.07, 0.055], bone: 'tars' + s, side: s, k: 0.04, m: { patch: 0.35, scale: 0.42 } });                    // hock
  P({ t: 'el', c: V(-0.905, 0.95, 0.18), r: [0.045, 0.05, 0.04], bone: 'tars' + s, side: s, k: 0.03, m: { patch: 0.35, scale: 0.42 } });    // point of hock
  P({ t: 'rc', a: J.hock2, b: V(-0.78, 0.24, 0.17), ra: 0.046, rb: 0.038, sq: 0.9, bone: 'mtt' + s, side: s, k: 0.03, m: LOW });            // hind cannon
  P({ t: 'el', c: V(-0.772, 0.19, 0.17), r: [0.058, 0.052, 0.05], bone: ['mtt' + s, 'hpas' + s], range: [0.5, 0.5], side: s, k: 0.03, m: LOW });
  P({ t: 'rc', a: V(-0.765, 0.17, 0.17), b: V(-0.715, 0.095, 0.17), ra: 0.046, rb: 0.052, bone: 'hpas' + s, side: s, k: 0.025, m: LOW });
  hoof(V(-0.69, 0.0, 0.17), 'hpas' + s, s);
}
fore('S'); hind('S');
// tail -----------------------------------------------------------------------------------------
const TK = ['tail0', 'tail1', 'tail2', 'tail3', 'tailEnd'];
const TR = [0.068, 0.042, 0.03, 0.023, 0.019];
for (let i = 0; i < 4; i++) {
  P({ t: 'rc', a: J[TK[i]], b: J[TK[i + 1]], ra: TR[i], rb: TR[i + 1], bone: 'tail' + i, k: i === 0 ? 0.07 : 0.01, m: { patch: i < 2 ? 1 : 0.4, scale: 0.5, dark: i === 3 ? 0.6 : 0 } });
}

export const BBOX = { min: [-1.30, -0.02, -0.52], max: [2.42, 4.20, 0.52] };
