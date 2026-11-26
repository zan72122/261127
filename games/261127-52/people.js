// People: the girl's (player's) arm and hand, mom's arm, and the girl's full
// body for wide shots.  All built from smooth SDF unions + cloth tubes with
// folds so nothing reads as capsules / cylinders.
import * as THREE from './lib/three.module.min.js';
import { surfaceNets, buildHandGeometry, handSDF, cone, ellip, sphere, smin, smax, rbox } from './sdf.js';

const TAU = Math.PI * 2;
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

// Cloth tube along -x from x0 (cuff) to x1, elliptical section ry/rz, with
// folds.  roll > 0 adds a rolled-up cuff (thick bunched ring) at x0.
export function sleeveGeometry({ x0 = -0.12, x1 = -0.8, ry = 0.03, rz = 0.036, roll = 1, seed = 1, segX = 46, segA = 40, flare = 0.25 }) {
  const pos = [], uv = [], ind = [];
  const rows = [];
  // profile samples: rolled cuff (inner turn + outer bulge) then the tube
  const prof = [];
  if (roll > 0) {
    const rw = 0.035 * roll; // cuff width
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N; // over the roll: starts inside, curls out and back
      const a = t * Math.PI;
      prof.push({ x: x0 + 0.004 - Math.sin(a) * 0.006 + t * rw * 0, r: 0.92 + 0.0 * t, k: 0, roll: 1 });
    }
    prof.length = 0;
    // inner lip -> outer band -> back into the sleeve
    const pts = [[x0 + 0.002, 0.93], [x0 - 0.002, 1.12], [x0 - rw * 0.25, 1.26], [x0 - rw * 0.55, 1.3], [x0 - rw * 0.85, 1.25], [x0 - rw, 1.1], [x0 - rw - 0.006, 1.03]];
    for (const [x, r] of pts) prof.push({ x, r, k: 1 });
    for (let i = 1; i <= segX; i++) { const t = i / segX; prof.push({ x: x0 - rw - 0.006 + (x1 - (x0 - rw - 0.006)) * t, r: 1.03 + flare * t, k: 0.5 + 0.5 * (1 - t) }); }
  } else {
    for (let i = 0; i <= segX; i++) { const t = i / segX; prof.push({ x: x0 + (x1 - x0) * t, r: 1.02 + flare * t, k: 0.6 }); }
  }
  // folds: random diagonal wrinkles
  const folds = [];
  for (let i = 0; i < 9; i++) folds.push({ f: 2 + Math.floor(hash(seed + i) * 5), ph: hash(seed * 3 + i) * TAU, sx: 30 + hash(seed * 7 + i) * 50, a: 0.03 + hash(seed * 11 + i) * 0.05 });
  let acc = 0;
  for (let i = 0; i < prof.length; i++) {
    const p = prof[i];
    if (i > 0) acc += Math.hypot(p.x - prof[i - 1].x, (p.r - prof[i - 1].r) * ry);
    for (let j = 0; j <= segA; j++) {
      const a = j / segA * TAU;
      let w = 0;
      for (const F of folds) w += Math.sin(a * F.f + p.x * F.sx + F.ph) * F.a;
      if (p.k === 1) w = w * 0.6 + Math.sin(a * 7 + seed) * 0.03;
      const r = p.r * (1 + w * (p.k === 1 ? 1 : p.k));
      pos.push(p.x, Math.cos(a) * ry * r, Math.sin(a) * rz * r);
      uv.push(a / TAU * 3, acc * 14);
    }
    rows.push(i);
  }
  for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < segA; j++) {
    const a = i * (segA + 1) + j, b = a + segA + 1;
    ind.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ first-person arm
export class Arm {
  constructor({ scale = 1, tone, skinMat, sleeveMat, rollX = -0.12, sleeveR = [0.031, 0.037], name = 'arm' }) {
    this.s = scale; this.tone = tone; this.skinMat = skinMat;
    this.group = new THREE.Group(); this.group.name = name;
    this.hands = {}; this.tips = {};
    this.pose = null;
    const sl = sleeveGeometry({ x0: rollX * scale, x1: -1.3, ry: sleeveR[0] * scale, rz: sleeveR[1] * scale, seed: scale * 13, flare: 0.1, segX: 60 });
    this.sleeve = new THREE.Mesh(sl, sleeveMat);
    this.sleeve.castShadow = true;
    this.group.add(this.sleeve);
    this.holder = new THREE.Group(); // tools attach here (hand-local)
    this.group.add(this.holder);
    this.group.visible = false;
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.shoulder = new THREE.Vector3();
    this.roll = 0; this.pitch = 0; this.yaw = 0;
    this.show = 0; // 0 hidden .. 1 in place
  }
  build(pose) {
    if (this.hands[pose]) return;
    const { geo, tips } = buildHandGeometry(pose, this.s, this.tone, 0.0026);
    const m = new THREE.Mesh(geo, this.skinMat);
    m.castShadow = true; m.visible = false;
    this.group.add(m);
    this.hands[pose] = m; this.tips[pose] = tips;
  }
  setPose(pose) {
    this.build(pose);
    if (this.pose === pose) return;
    for (const k in this.hands) this.hands[k].visible = k === pose;
    this.pose = pose;
  }
  // place so that hand-local point `local` lands on world point T, forearm aimed from shoulder S
  place(T, S, local, roll = 0, pitch = 0, yaw = 0) {
    const g = this.group;
    const W = T.clone();
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qr = new THREE.Quaternion();
    for (let it = 0; it < 3; it++) {
      X.subVectors(W, S).normalize();
      Z.crossVectors(X, up).normalize();
      Y.crossVectors(Z, X);
      m.makeBasis(X, Y, Z);
      q.setFromRotationMatrix(m);
      qr.setFromEuler(new THREE.Euler(roll, yaw, pitch, 'XYZ'));
      q.multiply(qr);
      const off = local.clone().applyQuaternion(q);
      W.copy(T).sub(off);
    }
    g.position.copy(W); g.quaternion.copy(q);
  }
}

// ------------------------------------------------------------------ the girl (wide shots)
// Local frame: feet on y=0, facing +z, her right side at -x.
export function buildGirl(M) {
  const root = new THREE.Group(); root.name = 'girl';
  const body = new THREE.Group(); root.add(body);
  const step = 0.0075;
  const mk = (f, lo, hi, mat, opts = {}, st = step) => {
    const geo = surfaceNets(f, lo, hi, st, opts);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  const cyl = (x, y, z, out, k = 9) => { out[0] = Math.atan2(x, z) / TAU * k; out[1] = y * k; };
  // head + neck (skin)
  const headF = (x, y, z) => {
    let d = ellip(x, y, z, [0, 0.985, 0.0], [0.073, 0.086, 0.08]);
    d = smin(d, ellip(x, y, z, [0, 0.935, 0.022], [0.055, 0.045, 0.052]), 0.03);
    d = smin(d, ellip(x, y, z, [0, 0.968, 0.079], [0.011, 0.013, 0.012]), 0.01);
    d = smin(d, ellip(x, y, z, [-0.071, 0.972, -0.004], [0.011, 0.02, 0.014]), 0.006);
    d = smin(d, ellip(x, y, z, [0.071, 0.972, -0.004], [0.011, 0.02, 0.014]), 0.006);
    d = smin(d, cone(x, y, z, [0, 0.83, -0.005], [0, 0.93, -0.01], 0.031, 0.029), 0.02);
    return d;
  };
  const head = mk(headF, [-0.1, 0.8, -0.1], [0.1, 1.09, 0.11], M.skinBody, {
    color: (x, y, z, o) => { const ch = Math.max(0, 1 - Math.hypot(Math.abs(x) - 0.045, y - 0.95, z - 0.06) / 0.03); o[0] = 0.56 + 0.08 * ch; o[1] = 0.365 - 0.02 * ch; o[2] = 0.27 - 0.01 * ch; },
    uv: (x, y, z, nx, ny, nz, o) => cyl(x, y, z, o, 20),
  });
  body.add(head);
  // hair: cap + bob + two low tails
  const hairF = (x, y, z) => {
    // cap hugging the skull
    let d = ellip(x, y, z, [0, 0.997, -0.01], [0.079, 0.093, 0.086]);
    d = smin(d, ellip(x, y, z, [0, 0.955, -0.035], [0.08, 0.06, 0.062]), 0.03);
    // fringe
    d = smin(d, ellip(x, y, z, [0, 1.04, 0.048], [0.068, 0.03, 0.04]), 0.02);
    // open the face and the nape
    const face = ellip(x, y, z, [0, 0.95, 0.078], [0.064, 0.072, 0.062]);
    d = smax(d, -face, 0.012);
    d = smax(d, -(y - 0.915 + Math.max(0, z) * 0.6), 0.012);
    // low ponytail gathered at the back, hanging down
    const w = Math.sin(y * 60) * 0.003;
    d = smin(d, cone(x + w, y, z, [0, 0.95, -0.09], [0.006, 0.86, -0.1], 0.026, 0.02), 0.02);
    d = smin(d, cone(x + w, y, z, [0.006, 0.86, -0.1], [0.0, 0.76, -0.085], 0.02, 0.006), 0.02);
    // strand grooves
    d += Math.sin(Math.atan2(x, z) * 70 + y * 8) * 0.0006;
    return d;
  };
  const hair = mk(hairF, [-0.12, 0.84, -0.12], [0.12, 1.1, 0.11], M.hair, {
    uv: (x, y, z, nx, ny, nz, o) => { o[0] = Math.atan2(x, z) / TAU * 6; o[1] = y * 4; },
  }, 0.0055);
  body.add(hair);
  // hair ties (small fabric bands)
  {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0065, 10, 24), M.tie);
    tie.position.set(0.002, 0.925, -0.095); tie.rotation.set(1.35, 0, 0.1);
    body.add(tie);
  }
  // sweater torso
  const torsoF = (x, y, z) => {
    let d = ellip(x, y, z, [0, 0.755, 0.0], [0.108, 0.1, 0.074]);
    d = smin(d, ellip(x, y, z, [0, 0.64, 0.008], [0.104, 0.1, 0.076]), 0.05);
    d = smin(d, cone(x, y, z, [-0.11, 0.825, -0.004], [0.11, 0.825, -0.004], 0.038, 0.038), 0.05);
    d = smin(d, cone(x, y, z, [0, 0.83, -0.004], [0, 0.86, -0.004], 0.048, 0.04), 0.02); // collar
    d = smax(d, -(y - 0.535), 0.01);
    // ribbing / gentle drape wrinkles
    d += Math.sin(Math.atan2(x, z) * 7 + y * 25) * 0.0012 + Math.sin(y * 70 + x * 20) * 0.0007;
    return d;
  };
  const torso = mk(torsoF, [-0.17, 0.5, -0.1], [0.17, 0.9, 0.11], M.sweater, { uv: (x, y, z, nx, ny, nz, o) => cyl(x, y, z, o, 9) });
  body.add(torso);
  // denim skirt
  const skirtF = (x, y, z) => {
    let d = cone(x, y, z, [0, 0.565, 0.006], [0, 0.4, 0.006], 0.098, 0.132);
    d = ellip(x * 1.0, y, z * 1.32, [0, 0.49, 0.006], [0.14, 0.12, 0.14]) > d ? d : d;
    d = smax(d, -(y - 0.405), 0.006);
    d = smax(d, y - 0.585, 0.006);
    d = smin(d, cone(x, y, z, [0, 0.565, 0.006], [0, 0.585, 0.006], 0.104, 0.104), 0.004);
    d += Math.sin(Math.atan2(x, z) * 9) * 0.004 * Math.max(0, (0.52 - y) / 0.1);
    return d;
  };
  const skirt = mk(skirtF, [-0.16, 0.38, -0.14], [0.16, 0.6, 0.15], M.denim, { uv: (x, y, z, nx, ny, nz, o) => cyl(x, y, z, o, 7) });
  body.add(skirt);
  // legs in tights + socks
  const legF = (x, y, z) => {
    let d = 1;
    for (const sx of [-1, 1]) {
      let e = cone(x, y, z, [sx * 0.052, 0.5, 0], [sx * 0.056, 0.285, 0.012], 0.044, 0.032);
      e = smin(e, cone(x, y, z, [sx * 0.056, 0.285, 0.012], [sx * 0.057, 0.065, -0.004], 0.032, 0.021), 0.02);
      e = smin(e, ellip(x, y, z, [sx * 0.058, 0.215, -0.014], [0.03, 0.06, 0.03]), 0.03); // calf
      e = smin(e, ellip(x, y, z, [sx * 0.06, 0.03, 0.035], [0.03, 0.026, 0.07]), 0.02); // foot
      d = Math.min(d, e);
    }
    return Math.max(d, -y);
  };
  const legs = mk(legF, [-0.11, -0.01, -0.06], [0.11, 0.52, 0.12], M.tights, { uv: (x, y, z, nx, ny, nz, o) => cyl(x, y, z, o, 8) });
  body.add(legs);
  // rain boots (hidden until put on); also used for the pair on the floor
  const bootF = (x, y, z) => {
    let d = cone(x, y, z, [0, 0.03, -0.002], [0, 0.205, -0.004], 0.041, 0.047);
    d = smin(d, ellip(x, y, z, [0, 0.04, 0.04], [0.042, 0.042, 0.084]), 0.03);
    d = smin(d, cone(x, y, z, [0, 0.2, -0.004], [0, 0.215, -0.004], 0.052, 0.052), 0.006); // top lip
    d = smax(d, -y, 0.004);
    d = smax(d, -sphere(x, y, z, [0, 0.27, -0.004], 0.058), 0.004); // opening
    return d;
  };
  const bootGeo = surfaceNets(bootF, [-0.06, -0.01, -0.06], [0.06, 0.23, 0.14], 0.005, {
    uv: (x, y, z, nx, ny, nz, o) => cyl(x, y, z, o, 6),
    color: (x, y, z, o) => { const sole = y < 0.018 ? 1 : 0; o[0] = sole ? 0.25 : 1; o[1] = sole ? 0.22 : 1; o[2] = sole ? 0.2 : 1; },
  });
  const boots = [];
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(bootGeo, M.boot); b.castShadow = true; b.receiveShadow = true;
    b.position.set(sx * 0.06, 0, 0.004);
    body.add(b); b.visible = false; boots.push(b);
  }
  // arms: hanging, pivot at the shoulder.  Built as the right arm; left = mirrored
  const armF = (() => {
    const h = handSDF('relax', 0.95, 0.15).f;
    const wy = -0.315, wz = 0.02;
    return (x, y, z) => {
      // map to hand-local: x_h = -(y - wy), y_h = -x, z_h = -(z - wz)  (palm faces +x = inward)
      let d = h(-(y - wy), -x, -(z - wz));
      d = smin(d, cone(x, y, z, [0, -0.05, 0], [0, -0.17, 0.006], 0.03, 0.028), 0.03);
      return d;
    };
  })();
  const armSkin = surfaceNets(armF, [-0.06, -0.45, -0.07], [0.06, 0.04, 0.08], 0.0042, {
    color: (x, y, z, o) => { o[0] = 0.56; o[1] = 0.365; o[2] = 0.27; },
    uv: (x, y, z, nx, ny, nz, o) => { o[0] = y * 18; o[1] = Math.atan2(x, z) / TAU * 3; },
  });
  // sleeve along the arm: generated along -x, then rotated to hang along -y
  const sleeveLong = sleeveGeometry({ x0: 0.035, x1: -0.31, ry: 0.036, rz: 0.038, roll: 0, seed: 4, segX: 30, segA: 28, flare: 0.12 });
  const sleeveShort = sleeveGeometry({ x0: 0.035, x1: -0.17, ry: 0.038, rz: 0.04, roll: 1, seed: 7, segX: 22, segA: 28, flare: 0.04 });
  for (const g of [sleeveLong, sleeveShort]) g.rotateZ(Math.PI / 2);
  // after rotation, local x=-L maps to y=-L (pointing down)
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.122, 0.815, -0.004);
    const inner = new THREE.Group(); inner.scale.x = -sx; pivot.add(inner); // right arm (sx=-1) unmirrored
    const sk = new THREE.Mesh(armSkin, M.skinBody); sk.castShadow = true; inner.add(sk);
    const sl = new THREE.Mesh(sleeveLong, M.sweater); sl.castShadow = true; inner.add(sl);
    const ss = new THREE.Mesh(sleeveShort, M.sweater); ss.castShadow = true; ss.visible = false; inner.add(ss);
    pivot.rotation.z = sx * 0.08;
    body.add(pivot);
    arms.push({ pivot, sl, ss, sx });
  }
  // shoulder cap so the arm joins the sweater
  root.userData = { body, arms, boots, head, hair };
  root.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return root;
}

// pair of boots standing on the floor (shares the boot geometry)
export function bootPair(girl, M) {
  const g = new THREE.Group();
  const geo = girl.userData.boots[0].geometry;
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(geo, M.boot); b.castShadow = true; b.receiveShadow = true;
    b.position.set(sx * 0.055, 0, 0); b.rotation.y = sx * 0.12;
    g.add(b);
  }
  return g;
}
