// Pose library. Targets are in the animal's own ground frame: +x forward, +y up, +z right, ground at y=0.
// Sequences follow observed giraffe behaviour: lying down = hind legs spread, neck lowered toward the ground,
// fore legs placed, drop onto the front knees (carpal joints), then the hindquarters fold and the chest settles
// on the sternum with one hind leg out to the side. Rising = neck swung back, hindquarters up first while
// still kneeling in front, then neck swung forward and the fore legs straightened one at a time.

const mirrorZ = (p, s) => [p[0], p[1], p[2] * s];

export function buildPoses(g) {
  const P = {};
  P.stand = g.solve({});
  // standing, attentive: neck a little more upright, head level
  P.alert = g.solve({ neck: [[0, 0, 0], [0.98, 2.75, 0], [1.40, 3.95, 0], [1.66, 4.15, 0]], head: { f: [0.95, -0.28, 0], u: [0.28, 0.95, 0] } });
  // standing doze: neck slightly lowered and forward, head drooping
  P.doze = g.solve({ neck: [[0, 0, 0], [1.00, 2.62, 0], [1.55, 3.45, 0], [1.88, 3.62, 0]], head: { f: [0.78, -0.62, 0], u: [0.62, 0.78, 0] } });
  // looking down at the resting place (lowered neck, sniffing)
  P.lookDown = g.solve({
    body: { pitch: -2 },
    neck: [[0, 0, 0], [1.10, 2.45, 0], [1.75, 2.75, 0], [2.10, 2.35, 0]], head: { f: [0.35, -0.94, 0], u: [0.94, 0.35, 0] },
    legs: hindSpread(0.06),
  });
  // L1: prepare: hind legs spread, neck near horizontal, looking at the ground, fore legs placed carefully
  P.prep = g.solve({
    body: { pitch: -4, y: -0.03 },
    neck: [[0, 0, 0], [1.15, 2.35, 0], [1.95, 2.45, 0], [2.35, 2.05, 0]], head: { f: [0.45, -0.89, 0], u: [0.89, 0.45, 0] },
    legs: hindSpread(0.09),
  });
  // L2: kneel on the carpal joints, hindquarters still standing
  P.kneel = g.solve({
    body: { pitch: -24, y: -0.62, x: -0.06 },
    neck: [[0, 0, 0], [1.05, 1.75, 0], [1.85, 2.05, 0], [2.15, 1.85, 0]], head: { f: [0.75, -0.66, 0], u: [0.66, 0.75, 0] },
    legs: [
      ...foreKneel(1), ...foreKneel(-1),
      ...hindStand(1, 0.08), ...hindStand(-1, 0.08),
    ],
  });
  // L3 / rising helper: everything folded, body low and level, neck forward
  P.lieLow = (side) => g.solve({
    body: { y: -1.40, roll: 0 },
    neck: [[0, 0, 0], [1.15, 1.25, 0], [1.65, 1.75, 0], [1.95, 1.75, 0]], head: { f: [0.8, -0.6, 0], u: [0.6, 0.8, 0] },
    legs: [...foreFold(1), ...foreFold(-1), ...hindTuck(-side), ...hindOut(side, 0.6)],
  });
  // L4: lying on the sternum, leaning onto one hip; neck upright (resting, often ruminating)
  // side = +1: out-leg on the right, lean onto the left hip, pillow on the left haunch
  const lie = (side, neck, head, extra = {}) => g.solve(Object.assign({
    body: { y: -1.43, roll: 8 * side, pitch: 1.5 },
    neck, head,
    legs: [...foreFold(1), ...foreFold(-1), ...hindTuck(-side), ...hindOut(side, 1)],
    tail: lieTail(side),
  }, extra));
  P.lie = (side) => lie(side, [[0, 0, 0], [0.98, 1.45, 0], [1.10, 2.35, 0], [1.08, 2.62, 0]], { f: [0.92, -0.40, 0], u: [0.40, 0.92, 0] });
  // lying, alert: head high, looking around
  P.lieAlert = (side) => lie(side, [[0, 0, 0], [0.95, 1.5, 0], [1.02, 2.55, 0], [1.02, 2.88, 0]], { f: [0.97, -0.22, 0], u: [0.22, 0.97, 0] });
  // lying, neck swung back (start of rising, or turning to the pillow)
  P.lieBack = (side) => lie(side, [[0, 0, 0], [0.80, 1.55, -0.15 * side], [0.62, 2.35, -0.3 * side], [0.70, 2.55, -0.32 * side]], { f: [0.85, -0.35, -0.38 * side], u: [0.35, 0.93, 0] });
  // REM-like sleep: neck curved back along the side, head resting on the haunch / hind leg on the low side
  P.rem = (side) => {
    const s = -side; // pillow side (the low side)
    return lie(side,
      [[0, 0, 0], [0.95, 1.38, 0.14 * s], [0.30, 1.42, 0.72 * s], mirrorZ([-0.40, 0.99, 0.43], s)],
      { f: [-0.80, -0.52, 0.12 * s], u: [-0.36, 0.62, 0.70 * s] },
      { tail: lieTail(side) });
  };
  // rising R2: hindquarters up first while kneeling in front, neck swung forward-down for balance
  P.riseHind = g.solve({
    body: { pitch: -26, y: -0.66, x: -0.02 },
    neck: [[0, 0, 0], [1.10, 1.70, 0], [1.95, 1.85, 0], [2.30, 1.55, 0]], head: { f: [0.7, -0.71, 0], u: [0.71, 0.7, 0] },
    legs: [...foreKneel(1), ...foreKneel(-1), ...hindStand(1, 0.06), ...hindStand(-1, 0.06)],
  });
  // rising R3: one fore leg brought forward and planted, the other still kneeling; neck thrown up/forward
  P.riseFore = (side) => g.solve({
    body: { pitch: -11, y: -0.30 },
    neck: [[0, 0, 0], [1.1, 2.4, 0], [1.6, 3.3, 0], [1.85, 3.55, 0]], head: { f: [0.85, -0.52, 0], u: [0.52, 0.85, 0] },
    legs: [...foreStep(side), ...foreKneelHigh(-side), ...hindStand(1, 0.06), ...hindStand(-1, 0.06)],
  });
  return P;
}

// tail lying on the ground, curving toward the low side
function lieTail(side) {
  const s = -side;
  return { tail0: [0, 4 * s, -12], tail1: [0, 6 * s, -8], tail2: [0, 18 * s, -62], tail3: [0, 14 * s, -14] };
}
// ---- limb target helpers ------------------------------------------------------------------------
function hindSpread(w) {
  const out = [];
  for (const s of [1, -1]) {
    const S = s > 0 ? 'R' : 'L';
    out.push([
      ['fem' + S, [-0.40, 1.40, (0.225 + w) * s]],
      ['tib' + S, [-0.86, 0.905, (0.18 + w) * s]],
      ['tars' + S, [-0.855, 0.80, (0.18 + w) * s]],
      ['mtt' + S, [-0.79, 0.195, (0.17 + w) * s]],
      ['hpas' + S, [-0.68, 0.0, (0.17 + w) * s]],
    ]);
  }
  return out;
}
function hindStand(s, w) {
  const S = s > 0 ? 'R' : 'L';
  return [[
    ['fem' + S, [-0.32, 1.30, (0.23 + w * 0.5) * s]],
    ['tib' + S, [-0.80, 0.86, (0.18 + w) * s]],
    ['tars' + S, [-0.80, 0.75, (0.18 + w) * s]],
    ['mtt' + S, [-0.76, 0.195, (0.17 + w) * s]],
    ['hpas' + S, [-0.65, 0.0, (0.17 + w) * s]],
  ]];
}
function foreKneel(s) {
  const S = s > 0 ? 'R' : 'L';
  return [[
    ['hum' + S, [0.74, 0.86, 0.20 * s]],
    ['rad' + S, [0.98, 0.10, 0.19 * s]],
    ['carp' + S, [0.94, 0.03, 0.19 * s]],
    ['mcp' + S, [0.34, 0.045, 0.18 * s]],
    ['fpas' + S, [0.16, 0.10, 0.18 * s]],
  ]];
}
function foreKneelHigh(s) {
  const S = s > 0 ? 'R' : 'L';
  return [[
    ['hum' + S, [0.80, 1.12, 0.20 * s]],
    ['rad' + S, [1.02, 0.10, 0.19 * s]],
    ['carp' + S, [0.98, 0.03, 0.19 * s]],
    ['mcp' + S, [0.38, 0.045, 0.18 * s]],
    ['fpas' + S, [0.20, 0.10, 0.18 * s]],
  ]];
}
function foreStep(s) {
  const S = s > 0 ? 'R' : 'L';
  return [[
    ['hum' + S, [0.82, 1.20, 0.20 * s]],
    ['rad' + S, [1.25, 0.62, 0.19 * s]],
    ['carp' + S, [1.27, 0.55, 0.19 * s]],
    ['mcp' + S, [1.36, 0.14, 0.18 * s]],
    ['fpas' + S, [1.50, 0.0, 0.18 * s]],
  ]];
}
function foreFold(s) {
  const S = s > 0 ? 'R' : 'L';
  return [[
    ['hum' + S, [0.47, 0.27, 0.205 * s]],
    ['rad' + S, [1.10, 0.125, 0.18 * s]],
    ['carp' + S, [1.075, 0.05, 0.175 * s]],
    ['mcp' + S, [0.48, 0.05, 0.155 * s]],
    ['fpas' + S, [0.32, 0.085, 0.14 * s]],
  ]];
}
function hindTuck(s) {
  const S = s > 0 ? 'R' : 'L';
  return [[
    ['fem' + S, [-0.16, 0.15, 0.27 * s]],
    ['tib' + S, [-0.82, 0.10, 0.25 * s]],
    ['tars' + S, [-0.80, 0.03, 0.22 * s]],
    ['mtt' + S, [-0.20, 0.05, 0.07 * s]],
    ['hpas' + S, [-0.02, 0.06, 0.04 * s]],
  ]];
}
function hindOut(s, k) {
  const S = s > 0 ? 'R' : 'L';
  const lerp = (a, b) => a + (b - a) * k;
  return [[
    ['fem' + S, [-0.18, 0.22, lerp(0.28, 0.38) * s]],
    ['tib' + S, [-0.80, 0.12, lerp(0.30, 0.46) * s]],
    ['tars' + S, [-0.80, 0.05, lerp(0.30, 0.49) * s]],
    ['mtt' + S, [-0.17, 0.05, lerp(0.30, 0.53) * s]],
    ['hpas' + S, [0.0, 0.03, lerp(0.30, 0.53) * s]],
  ]];
}
