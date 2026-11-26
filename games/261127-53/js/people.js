// People: real-proportion figures in turnout gear, built from profiled tubes, posed with 2-bone IK.
import * as THREE from '../lib/three.module.min.js';
import { tube, limb, roundedBox, updateTube } from './geo.js';
import { pbr, wettable } from './gfx.js';

const V = THREE.Vector3;
const UP = new V(0, 1, 0);

// ---------------------------------------------------------------- shared materials
let MAT = null;
export function peopleMaterials() {
  if (MAT) return MAT;
  const coat = wettable(pbr('coat', { tile: 0.09, metal0: true, physical: true, sheen: 0.5, sheenColor: 0x8090b0, sheenRoughness: 0.7, normal: 1.2 }));
  const pants = wettable(pbr('coat', { tile: 0.09, metal0: true, physical: true, sheen: 0.5, sheenColor: 0x8090b0, sheenRoughness: 0.7, color: 0xd8dce6 }));
  const reflect = new THREE.MeshStandardMaterial({ color: 0xc9c8c0, roughness: 0.32, metalness: 0.75, normalMap: null });
  const reflectY = new THREE.MeshStandardMaterial({ color: 0xb59a52, roughness: 0.45, metalness: 0.3 });
  const leather = wettable(pbr('leather', { tile: 0.06, metal0: true, normal: 1.3 }));
  const leatherDark = pbr('leather', { tile: 0.06, metal0: true, color: 0x6a5a4a });
  const rubber = pbr('rubber', { tile: 0.1, metal0: true });
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xe0b394, roughness: 0.55, sheen: 0.4, sheenColor: 0xffd0b0, sheenRoughness: 0.5, normalMap: null });
  const hair = new THREE.MeshPhysicalMaterial({ map: null, color: 0x3a2618, roughness: 0.42, metalness: 0, sheen: 0.6, sheenColor: 0x8a6040, sheenRoughness: 0.35 });
  const helmet = new THREE.MeshPhysicalMaterial({ color: 0xe4e0d6, roughness: 0.28, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.12 });
  const helmetRidge = new THREE.MeshPhysicalMaterial({ color: 0x8c8a84, roughness: 0.3, metalness: 0.8 });
  const shield = new THREE.MeshPhysicalMaterial({ color: 0xd8c890, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false, clearcoat: 1 });
  const knit = wettable(pbr('hose', { tile: 0.05, metal0: true, physical: true, sheen: 0.8, sheenColor: 0xffe0b0, sheenRoughness: 0.8, color: 0xc8a060, normal: 1.6 }));
  MAT = { coat, pants, reflect, reflectY, leather, leatherDark, rubber, skin, hair, helmet, helmetRidge, shield, knit };
  return MAT;
}

function smoothKeys(keys, t) {
  // keys: [[t, v], ...] sorted; smoothstep interpolation
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) { let u = (t - a[0]) / (b[0] - a[0]); u = u * u * (3 - 2 * u); return a[1] + (b[1] - a[1]) * u; }
  }
  return keys[keys.length - 1][1];
}

function hashf(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ---------------------------------------------------------------- glove (very detailed: fingers with 3 phalanges, gauntlet cuff, palm patch)
export function makeGlove(s, side, M) {
  const g = new THREE.Group();
  const mirror = side === 'L' ? -1 : 1;
  // gauntlet cuff (flared, with folds)
  const cuff = new THREE.Mesh(tube({
    path: [new V(0, -0.1 * s, 0), new V(0, -0.05 * s, 0), new V(0, 0.012 * s, 0)], radial: 20, segs: 8, up: new V(0, 0, 1),
    radius: (t, a) => { const r = (0.058 - 0.016 * t) * s; return [r * 1.08, r * 0.82]; },
    disp: (t, a) => (1 - t) * 0.003 * s * Math.sin(a * 6 + 1.3) + 0.0015 * s * Math.sin(a * 13),
  }), M.leather);
  g.add(cuff);
  // wrist strap
  const strap = new THREE.Mesh(tube({ path: [new V(0, -0.022 * s, 0), new V(0, -0.006 * s, 0)], radial: 20, segs: 2, up: new V(0, 0, 1), radius: [0.047 * s * 1.1, 0.047 * s * 0.85] }), M.leatherDark);
  g.add(strap);
  // palm / back of hand
  const palm = new THREE.Mesh(roundedBox(0.084 * s, 0.092 * s, 0.036 * s, 0.015 * s), M.leather);
  palm.position.set(0, 0.046 * s, 0);
  g.add(palm);
  // knuckle reinforcement on the back (-Z side)
  const pad = new THREE.Mesh(roundedBox(0.074 * s, 0.03 * s, 0.01 * s, 0.004 * s), M.leatherDark);
  pad.position.set(0, 0.076 * s, -0.017 * s);
  g.add(pad);
  const refl = new THREE.Mesh(roundedBox(0.05 * s, 0.012 * s, 0.004 * s, 0.0018 * s), M.reflect);
  refl.position.set(0, 0.045 * s, -0.019 * s);
  g.add(refl);
  // fingers
  const fingers = [];
  const fx = [-0.03, -0.01, 0.01, 0.03];
  const fl = [[0.034, 0.024, 0.02], [0.038, 0.027, 0.022], [0.036, 0.026, 0.021], [0.028, 0.02, 0.018]];
  const fr = [0.0108, 0.0112, 0.011, 0.0098];
  for (let f = 0; f < 4; f++) {
    let parent = g;
    const chain = [];
    const base = new THREE.Group();
    base.position.set(fx[f] * s * mirror, 0.09 * s - Math.abs(f - 1.5) * 0.004 * s, 0);
    base.rotation.z = (f - 1.5) * -0.05 * mirror;
    g.add(base); parent = base;
    for (let k = 0; k < 3; k++) {
      const L = fl[f][k] * s, r = fr[f] * s * (1 - k * 0.07);
      const seg = new THREE.Group();
      if (k > 0) seg.position.y = fl[f][k - 1] * s;
      parent.add(seg);
      const m = new THREE.Mesh(limb(L, r, r * 0.95, { radial: 10, segs: 4, flat: 0.86, bulge: 0.04, capBulge: 0.9 }), M.leather);
      seg.add(m);
      chain.push(seg); parent = seg;
    }
    fingers.push(chain);
  }
  // thumb (2 segments + metacarpal)
  const tb = new THREE.Group();
  tb.position.set(0.04 * s * mirror, 0.022 * s, 0.006 * s);
  tb.rotation.set(0.35, 0, -0.75 * mirror);
  g.add(tb);
  const thumb = [];
  let par = tb;
  const tl = [0.04, 0.03, 0.024];
  for (let k = 0; k < 3; k++) {
    const seg = new THREE.Group();
    if (k > 0) seg.position.y = tl[k - 1] * s;
    par.add(seg);
    const r = (0.0135 - k * 0.0012) * s;
    seg.add(new THREE.Mesh(limb(tl[k] * s, r, r * 0.95, { radial: 10, segs: 4, flat: 0.85, capBulge: 0.9 }), M.leather));
    thumb.push(seg); par = seg;
  }
  g.userData = { fingers, thumb, s };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function setGrip(glove, grip, spread = 0) {
  const { fingers, thumb } = glove.userData;
  fingers.forEach((ch, f) => {
    const g = grip * (1 + (f - 1.5) * 0.06);
    ch[0].rotation.x = 0.15 + g * 1.35;
    ch[1].rotation.x = 0.12 + g * 1.5;
    ch[2].rotation.x = 0.08 + g * 1.0;
    ch[0].parent.rotation.x = 0;
  });
  thumb[0].rotation.x = 0.35 + grip * 0.3;
  thumb[1].rotation.x = 0.1 + grip * 0.6;
  thumb[2].rotation.x = 0.1 + grip * 0.5;
}

// ---------------------------------------------------------------- person
const DIMS = {
  girl: { H: 1.1, hipY: 0.53, shY: 0.855, neckY: 0.9, headY: 0.993, headR: [0.074, 0.088, 0.085], shW: 0.128, hipW: 0.058, ua: 0.175, fa: 0.15, th: 0.245, sh: 0.225, ank: 0.07, hem: 0.37, cw: 0.13, cd: 0.098, armR: 0.042, legR: 0.058, glove: 0.8, helmetR: 0.122 },
  dad: { H: 1.78, hipY: 0.95, shY: 1.47, neckY: 1.55, headY: 1.665, headR: [0.083, 0.11, 0.1], shW: 0.2, hipW: 0.1, ua: 0.3, fa: 0.27, th: 0.445, sh: 0.43, ank: 0.09, hem: 0.74, cw: 0.205, cd: 0.145, armR: 0.06, legR: 0.085, glove: 1.12, helmetR: 0.148 },
};

export class Person {
  constructor(kind) {
    const M = peopleMaterials();
    this.kind = kind;
    const D = this.D = DIMS[kind];
    this.M = M;
    // per-person clones of wettable materials so dad can get soaked independently
    this.mCoat = M.coat.clone(); wettable(this.mCoat);
    this.mPants = M.pants.clone(); wettable(this.mPants);
    this.mGlove = M.leather.clone(); wettable(this.mGlove);
    this.root = new THREE.Group();
    this.dressed = { coat: true, helmet: true };
    this.build();
    this.p = { lean: 0, yaw: 0, roll: 0, headPitch: 0, headYaw: 0, headRoll: 0, bounce: 0, crouch: 0 };
    this.handT = { R: new V(), L: new V() };
    this.palm = { R: new V(0, 0, 1), L: new V(0, 0, 1) };
    this.handDir = { R: null, L: null };
    this.grip = { R: 0.2, L: 0.2 };
    this.mode = 'idle';
    this.act = null; this.actT = 0;
    this.t = Math.random() * 10;
    this.hold = null; // function returning {R:{p,dir,palm}, L:{...}} in world
    this.setDressed(true, true);
    this.update(0);
  }

  build() {
    const D = this.D, M = this.M, root = this.root;
    const k = D.H / 1.78;
    // --- coat torso
    const span = D.neckY - D.hem;
    const prof = (t) => {
      const rx = smoothKeys([[0, 1.04], [0.3, 0.93], [0.55, 0.97], [0.78, 1.04], [0.9, 0.98], [0.97, 0.62], [1, 0.42]], t) * D.cw;
      const rz = smoothKeys([[0, 1.08], [0.3, 0.92], [0.55, 1.0], [0.78, 1.02], [0.9, 0.9], [0.97, 0.68], [1, 0.5]], t) * D.cd;
      return [rx, rz];
    };
    this.coatProf = prof;
    const seed = this.kind === 'girl' ? 3.1 : 7.7;
    const coatDisp = (t, a) => {
      const hemF = Math.pow(1 - t, 2);
      let d = hemF * 0.007 * k * (Math.sin(a * 7 + seed) + 0.5 * Math.sin(a * 13 + seed * 2));
      // horizontal waist wrinkles
      d += Math.exp(-Math.pow((t - 0.32) / 0.08, 2)) * 0.0035 * k * Math.sin(t * 90 + a * 2);
      // front placket groove (front is +Z => a = PI/2 in our frame where binormal ~ z)
      const fa = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
      d -= Math.exp(-fa * fa / 0.004) * 0.004 * k;
      d += Math.exp(-Math.pow((Math.abs(fa) - 0.1) / 0.03, 2)) * 0.003 * k * (t < 0.95 ? 1 : 0);
      return d;
    };
    const coatPath = []; for (let i = 0; i <= 6; i++) coatPath.push(new V(0, D.hem + span * i / 6, 0));
    this.chest = new THREE.Group(); root.add(this.chest);
    const coatGeo = tube({ path: coatPath, radial: 40, segs: 30, up: new V(1, 0, 0), radius: (t) => prof(t), disp: coatDisp, caps: false });
    // translate so chest group origin is at hip
    coatGeo.translate(0, -D.hipY, 0);
    this.coat = new THREE.Mesh(coatGeo, this.mCoat); this.chest.add(this.coat);
    // inner dark (inside of hem) so we never see through
    const inner = new THREE.Mesh(coatGeo, new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.9, side: THREE.BackSide }));
    this.chest.add(inner); this.coatInner = inner;
    // reflective bands
    const band = (t0, t1, mat) => {
      const pts = []; for (let i = 0; i <= 2; i++) pts.push(new V(0, D.hem + span * (t0 + (t1 - t0) * i / 2), 0));
      const g = tube({ path: pts, radial: 40, segs: 2, up: new V(1, 0, 0), radius: (t) => { const r = prof(t0 + (t1 - t0) * t); return [r[0] + 0.0035 * k, r[1] + 0.0035 * k]; }, disp: (t, a) => coatDisp(t0 + (t1 - t0) * t, a) });
      g.translate(0, -D.hipY, 0);
      const m = new THREE.Mesh(g, mat); this.chest.add(m); return m;
    };
    this.bands = [band(0.06, 0.06 + 0.05 / span * k * 1.1, M.reflect), band(0.62, 0.62 + 0.045 / span * k * 1.1, M.reflect)];
    // collar
    const colPts = [new V(0, D.neckY - 0.03 * k, 0), new V(0, D.neckY + 0.045 * k, 0)];
    const collar = new THREE.Mesh(tube({ path: colPts, radial: 28, segs: 3, up: new V(1, 0, 0), radius: (t) => [D.cw * (0.5 - 0.06 * t), D.cd * (0.62 - 0.06 * t)], disp: (t, a) => 0.002 * Math.sin(a * 5) }), this.mCoat);
    collar.geometry.translate(0, -D.hipY, 0);
    this.chest.add(collar);
    // casual knit top (girl, before dressing)
    if (this.kind === 'girl') {
      const kp = (t) => { const r = prof(t); return [r[0] * 0.8, r[1] * 0.82]; };
      const kpath = []; for (let i = 0; i <= 6; i++) kpath.push(new V(0, D.hem + 0.08 + (span - 0.08) * i / 6, 0));
      const kg = tube({ path: kpath, radial: 36, segs: 24, up: new V(1, 0, 0), radius: (t) => kp(t), disp: (t, a) => 0.002 * Math.sin(a * 9 + t * 20) + (t < 0.08 ? 0.003 : 0) });
      kg.translate(0, -D.hipY, 0);
      this.knit = new THREE.Mesh(kg, M.knit); this.chest.add(this.knit);
    }
    // --- head
    this.head = new THREE.Group(); root.add(this.head);
    const hr = D.headR;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), M.skin);
    skull.scale.set(hr[0], hr[1], hr[2]); this.head.add(skull);
    // jaw/cheek mass (front-lower)
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), M.skin);
    jaw.scale.set(hr[0] * 0.82, hr[1] * 0.6, hr[2] * 0.78); jaw.position.set(0, -hr[1] * 0.36, hr[2] * 0.18); this.head.add(jaw);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), M.skin);
    nose.scale.set(hr[0] * 0.13, hr[1] * 0.14, hr[2] * 0.16); nose.position.set(0, -hr[1] * 0.12, hr[2] * 0.98); this.head.add(nose);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), M.skin);
      ear.scale.set(hr[0] * 0.12, hr[1] * 0.26, hr[2] * 0.2); ear.position.set(sx * hr[0] * 0.98, -hr[1] * 0.06, -hr[2] * 0.08); this.head.add(ear);
    }
    const neck = new THREE.Mesh(limb(D.headY - D.neckY, hr[0] * 0.5, hr[0] * 0.48, { caps: false }), M.skin);
    neck.position.y = -(D.headY - D.neckY) - 0.01; this.head.add(neck);
    // hair (girl): cap + ponytail of strands; dad: short hair cap
    this.hairGroup = new THREE.Group(); this.head.add(this.hairGroup);
    const capG = new THREE.SphereGeometry(1, 36, 20, 0, Math.PI * 2, 0, Math.PI * (this.kind === 'girl' ? 0.62 : 0.55));
    const hp = capG.attributes.position;
    for (let i = 0; i < hp.count; i++) { // strand ripples
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      const a = Math.atan2(z, x); const f = 1 + 0.012 * Math.sin(a * 40) * (1 - y);
      hp.setXYZ(i, x * f, y, z * f);
    }
    capG.computeVertexNormals();
    const cap = new THREE.Mesh(capG, M.hair);
    cap.scale.set(hr[0] * 1.07, hr[1] * 1.06, hr[2] * 1.07); cap.rotation.x = -0.25; cap.position.set(0, hr[1] * 0.02, -hr[2] * 0.03);
    this.hairGroup.add(cap);
    if (this.kind === 'girl') {
      const pt = new V(0, hr[1] * 0.38, -hr[2] * 0.92);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.006, 8, 16), new THREE.MeshStandardMaterial({ color: 0x8a2f2a, roughness: 0.6 }));
      tie.position.copy(pt); tie.rotation.x = 1.1; this.hairGroup.add(tie);
      const strands = [];
      const core = [pt.clone(), pt.clone().add(new V(0, -0.025, -0.04)), pt.clone().add(new V(0.005, -0.1, -0.05)), pt.clone().add(new V(0.01, -0.17, -0.03))];
      strands.push(new THREE.Mesh(tube({ path: core, radial: 10, segs: 12, radius: (t) => 0.017 * (1 - t * 0.75) + 0.004, caps: true, capBulge: 0.6 }), M.hair));
      for (let i = 0; i < 40; i++) {
        const a = hashf(i) * Math.PI * 2, rr = Math.sqrt(hashf(i + 50)) * 0.012;
        const off = new V(Math.cos(a) * rr, Math.sin(a) * rr * 0.6, 0);
        const len = 0.17 + hashf(i + 9) * 0.05;
        const pts = [pt.clone().add(off), pt.clone().add(new V(off.x * 1.4, -0.02 + off.y, -0.035)), pt.clone().add(new V(off.x * 2.2 + 0.01 * Math.sin(i), -len * 0.55, -0.045 + off.y * 0.5)), pt.clone().add(new V(off.x * 2.5 + 0.015 * Math.sin(i * 3), -len, -0.02 + 0.02 * hashf(i + 3)))];
        const g = tube({ path: pts, radial: 5, segs: 10, radius: (t) => (0.0055 - 0.0042 * t) * (0.8 + hashf(i + 20) * 0.5), caps: false });
        strands.push(new THREE.Mesh(g, M.hair));
      }
      strands.forEach((m) => this.hairGroup.add(m));
      this.tail = strands;
    }
    // helmet
    this.helmet = this.makeHelmet();
    this.head.add(this.helmet);
    // --- arms & legs: single continuous tubes through shoulder-elbow-wrist / hip-knee-ankle (rebuilt every frame)
    const sleeveDisp = (t, a) => 0.0022 * k * Math.sin(a * 5 + t * 40) + 0.003 * k * Math.exp(-Math.pow((t - 0.5) / 0.06, 2)) * Math.sin(a * 3 + 1) + (t > 0.94 ? 0.003 * k : 0) + (t > 0.62 && t < 0.7 ? 0.0025 * k : 0);
    const dummy = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(new V(0, -i * 0.1, 0.001 * i)); return a; };
    this.arms = {};
    for (const s of ['R', 'L']) {
      const ag = tube({ path: dummy(5), radial: 18, segs: 22, caps: true, capBulge: 0.95, bands: [[0.62, 0.7]],
        radius: (t) => D.armR * smoothKeys([[0, 1.18], [0.25, 1.1], [0.5, 0.97], [0.8, 0.95], [1, 1.02]], t), disp: sleeveDisp });
      const arm = new THREE.Mesh(ag, [this.mCoat, M.reflect]);
      let karm = null;
      if (this.kind === 'girl') {
        const kg = tube({ path: dummy(5), radial: 14, segs: 18, caps: true, capBulge: 0.95, radius: (t) => D.armR * smoothKeys([[0, 0.8], [0.5, 0.66], [1, 0.6]], t), disp: (t, a) => 0.0015 * Math.sin(a * 7 + t * 30) + (t > 0.93 ? 0.004 : 0) });
        karm = new THREE.Mesh(kg, M.knit);
        root.add(karm);
      }
      const glove = makeGlove(D.glove, s, { ...M, leather: this.mGlove });
      const bare = this.kind === 'girl' ? this.makeBareHand(s) : null;
      root.add(arm, glove);
      if (bare) root.add(bare);
      this.arms[s] = { arm, karm, glove, bare, pts: dummy(5) };
    }
    this.legs = {};
    const pantsDisp = (t, a) => 0.0028 * k * Math.sin(a * 4 + t * 30) + 0.004 * k * Math.exp(-Math.pow((t - 0.5) / 0.08, 2)) * Math.sin(a * 2 + 1) + 0.002 * k * Math.sin(a * 9 + t * 60) * t;
    for (const s of ['R', 'L']) {
      const lg = tube({ path: dummy(5), radial: 20, segs: 22, caps: true, capBulge: 0.5, bands: [[0.6, 0.66]],
        radius: (t) => D.legR * smoothKeys([[0, 1.15], [0.3, 1.05], [0.5, 0.96], [0.8, 0.93], [1, 0.98]], t), disp: pantsDisp });
      const leg = new THREE.Mesh(lg, [this.mPants, M.reflect]);
      const boot = this.makeBoot(s);
      root.add(leg, boot);
      this.legs[s] = { leg, boot, pts: dummy(5) };
    }
    // contact shadow handled by world
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (this.coatInner) this.coatInner.castShadow = false;
  }

  makeHelmet() {
    const D = this.D, M = this.M, R = D.helmetR;
    const g = new THREE.Group();
    const domeG = new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const dome = new THREE.Mesh(domeG, M.helmet);
    dome.scale.set(0.93, 0.86, 1.08); g.add(dome);
    // rim
    const rimG = new THREE.TorusGeometry(R, R * 0.06, 10, 48);
    const rim = new THREE.Mesh(rimG, M.helmet); rim.rotation.x = Math.PI / 2; rim.scale.set(0.95, 1.1, 1); g.add(rim);
    // short front visor
    const visG = new THREE.SphereGeometry(R * 1.12, 32, 6, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.47, Math.PI * 0.07);
    const vis = new THREE.Mesh(visG, M.helmet); vis.scale.set(0.95, 0.5, 1.2); vis.rotation.y = 0; g.add(vis);
    vis.rotation.y = Math.PI; vis.rotation.y = -Math.PI / 2 + Math.PI / 2; // front is +Z
    vis.geometry.rotateY(Math.PI / 2);
    // center ridge
    const ridgePts = []; for (let i = 0; i <= 8; i++) { const a = -0.85 + 1.7 * i / 8; ridgePts.push(new V(0, Math.cos(a) * R * 0.86 + 0.004, Math.sin(a) * R * 1.08)); }
    g.add(new THREE.Mesh(tube({ path: ridgePts, radial: 8, segs: 24, radius: [R * 0.045, R * 0.03], up: new V(1, 0, 0) }), M.helmetRidge));
    // side ribs
    for (const sx of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 6; i++) { const a = -0.6 + 1.2 * i / 6; pts.push(new V(sx * Math.sin(0.55) * R * 0.93, Math.cos(0.55) * Math.cos(a) * R * 0.86, Math.sin(a) * R * 1.05)); }
      g.add(new THREE.Mesh(tube({ path: pts, radial: 6, segs: 12, radius: R * 0.018 }), M.helmet));
    }
    // face shield (raised)
    const shG = new THREE.CylinderGeometry(R * 1.12, R * 1.18, R * 0.55, 32, 1, true, -Math.PI * 0.32, Math.PI * 0.64);
    const sh = new THREE.Mesh(shG, M.shield); sh.position.set(0, R * 0.42, R * 0.06); sh.rotation.x = -0.25; g.add(sh);
    // shikoro neck curtain
    const cuG = new THREE.CylinderGeometry(R * 0.98, R * 1.2, R * 0.95, 40, 6, true, Math.PI * 0.62, Math.PI * 1.76);
    const p = cuG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(x, z);
      const lowness = 0.5 - y / (R * 0.95);
      const f = 1 + 0.035 * lowness * Math.sin(a * 9);
      p.setXYZ(i, x * f, y, z * f);
    }
    cuG.computeVertexNormals();
    const cuMat = this.mCoat.clone(); cuMat.side = THREE.DoubleSide; wettable(cuMat);
    this.mCurtain = cuMat;
    const cu = new THREE.Mesh(cuG, cuMat); cu.position.y = -R * 0.42; g.add(cu);
    const stG = new THREE.CylinderGeometry(R * 1.165, R * 1.19, R * 0.1, 40, 1, true, Math.PI * 0.62, Math.PI * 1.76);
    const st = new THREE.Mesh(stG, M.reflect); st.position.y = -R * 0.8; g.add(st);
    g.position.set(0, D.headR[1] * 0.42, -D.headR[2] * 0.05);
    g.rotation.x = -0.06;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  makeBoot(s) {
    const D = this.D, M = this.M; const k = D.H / 1.78;
    const g = new THREE.Group();
    const shaftH = D.sh * 0.55;
    const shaft = new THREE.Mesh(limb(shaftH, D.legR * 0.86, D.legR * 0.98, { flat: 0.92, bulge: 0.0, radial: 18, segs: 6, disp: (t, a) => 0.002 * k * Math.sin(a * 3 + t * 12) }), M.rubber);
    g.add(shaft);
    const foot = new THREE.Mesh(roundedBox(D.legR * 1.75, D.legR * 1.15, D.legR * 3.6, D.legR * 0.5), M.rubber);
    foot.position.set(0, -D.ank * 0.15 + D.legR * 0.3, D.legR * 0.85); g.add(foot);
    const sole = new THREE.Mesh(roundedBox(D.legR * 1.85, D.legR * 0.32, D.legR * 3.75, D.legR * 0.14), M.leatherDark);
    sole.position.set(0, -D.ank * 0.15 - D.legR * 0.2, D.legR * 0.85); g.add(sole);
    const ring = new THREE.Mesh(limb(0.025 * k, D.legR * 0.97, D.legR * 0.98, { caps: false, radial: 18, segs: 1, bulge: 0 }), M.reflectY);
    ring.position.y = shaftH * 0.7; g.add(ring);
    g.userData.shaftH = shaftH;
    return g;
  }

  makeBareHand(s) {
    const M = this.M, g = new THREE.Group();
    const palm = new THREE.Mesh(roundedBox(0.05, 0.055, 0.022, 0.01), M.skin); palm.position.y = 0.028; g.add(palm);
    const mirror = s === 'L' ? -1 : 1;
    for (let f = 0; f < 4; f++) {
      const m = new THREE.Mesh(limb(0.04 - Math.abs(f - 1.5) * 0.004, 0.0065, 0.0055, { radial: 8, segs: 3, flat: 0.85 }), M.skin);
      m.position.set((f - 1.5) * 0.012 * mirror, 0.054, 0.002); m.rotation.x = 0.35; g.add(m);
    }
    const th = new THREE.Mesh(limb(0.035, 0.0075, 0.006, { radial: 8, segs: 3 }), M.skin);
    th.position.set(0.022 * mirror, 0.012, 0.006); th.rotation.set(0.4, 0, -0.8 * mirror); g.add(th);
    return g;
  }

  setDressed(coat, helmet) {
    this.dressed.coat = coat; this.dressed.helmet = helmet;
    const girl = this.kind === 'girl';
    this.coat.visible = coat; this.coatInner.visible = coat; this.bands.forEach((b) => (b.visible = coat));
    this.chest.children.forEach((c) => { if (c !== this.knit) c.visible = coat; });
    if (this.knit) this.knit.visible = !coat;
    for (const s of ['R', 'L']) {
      const A = this.arms[s];
      A.arm.visible = coat; A.glove.visible = coat;
      if (A.karm) { A.karm.visible = !coat; A.bare.visible = !coat; }
    }
    this.helmet.visible = helmet;
    // hair cap hidden under helmet; ponytail remains
    if (this.hairGroup.children[0]) this.hairGroup.children[0].visible = !helmet || !girl ? !helmet : false;
    if (!girl) this.hairGroup.visible = !helmet;
  }

  // ---------------------------------------------------------------- actions
  action(name, dur = 1.2) { this.act = name; this.actT = 0; this.actDur = dur; }

  _ik(A, T, L1, L2, pole, outE, outT) {
    const d = _v1.copy(T).sub(A);
    let dist = d.length();
    const dir = d.normalize();
    dist = Math.min(Math.max(dist, Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.002);
    const cosA = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pp = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    outE.copy(A).addScaledVector(dir, cosA * L1).addScaledVector(pp, sinA * L1);
    outT.copy(A).addScaledVector(dir, dist);
  }

  _orient(mesh, A, B) {
    mesh.position.copy(A);
    _v3.copy(B).sub(A).normalize();
    mesh.quaternion.setFromUnitVectors(UP, _v3);
  }

  // world -> local helpers
  toLocal(v) { return this.root.worldToLocal(v.clone()); }

  update(dt) {
    this.t += dt;
    const D = this.D, p = this.p, t = this.t, k = D.H / 1.78;
    let bounce = 0, armsUp = 0, clap = 0, tilt = 0, nod = 0, shake = 0, shrug = 0;
    if (this.act) {
      this.actT += dt;
      const u = this.actT / this.actDur;
      if (u >= 1) this.act = null;
      else {
        const env = Math.sin(Math.PI * Math.min(1, u));
        if (this.act === 'jump') { bounce = Math.abs(Math.sin(u * Math.PI * 3)) * 0.07 * k * (1 - u * 0.3); armsUp = env; }
        if (this.act === 'cheer') { bounce = Math.abs(Math.sin(u * Math.PI * 2)) * 0.05 * k; armsUp = env; }
        if (this.act === 'clap') { clap = env; nod = Math.sin(u * Math.PI * 6) * 0.08 * env; }
        if (this.act === 'tilt') { tilt = env; shrug = env; }
        if (this.act === 'nod') { nod = Math.sin(u * Math.PI * 4) * 0.22 * env; }
        if (this.act === 'shake') { shake = env; }
      }
    }
    const breathe = Math.sin(t * 1.6) * 0.004 * k;
    const sway = Math.sin(t * 0.7) * 0.012;
    const hipY = D.hipY - p.crouch * 0.12 * k + bounce;
    // chest
    this.chest.position.set(Math.sin(t * 0.7) * 0.004 * k, hipY, 0);
    this.chest.rotation.set(p.lean + 0.02, p.yaw + sway * 0.3 + Math.sin(t * 40) * 0.03 * shake, p.roll + Math.sin(t * 28) * 0.06 * shake + tilt * 0.06);
    this.chest.scale.set(1, 1 + breathe, 1 + breathe * 2);
    this.chest.updateMatrix();
    const cm = this.chest.matrix;
    // head
    const neck = _v4.set(0, D.neckY - D.hipY, 0).applyMatrix4(cm);
    this.head.position.copy(neck).add(_v5.set(0, D.headY - D.neckY, 0).applyQuaternion(this.chest.quaternion));
    this.head.rotation.set(p.headPitch + nod + p.lean * -0.4, p.headYaw + Math.sin(t * 36) * 0.15 * shake, p.headRoll + tilt * 0.32);
    if (this.tail) { const sw = Math.sin(t * 2.3) * 0.06 + bounce * 2; this.tail.forEach((m, i) => { m.rotation.x = sw * 0.4; m.rotation.z = Math.sin(t * 2 + i) * 0.02 + Math.sin(t * 30) * 0.1 * shake; }); }
    // shoulders (local)
    for (const s of ['R', 'L']) {
      const sx = s === 'R' ? -1 : 1;
      const shoulder = _v6.set(sx * D.shW * (this.dressed.coat ? 0.92 : 0.8), D.shY - D.hipY - 0.025 * k + shrug * 0.025 * k, -0.005).applyMatrix4(cm);
      let T, pole = _v7.set(sx * 0.6, -0.6, -0.5).normalize();
      if (this.hold && this.hold[s]) {
        T = this.toLocal(this.hold[s].p);
        if (this.hold[s].pole) pole.copy(this.hold[s].pole);
      } else {
        // relaxed by the side, swinging slightly
        T = _v8.set(sx * (D.shW + 0.03 * k), D.hipY - 0.05 * k + bounce, 0.04 * k + Math.sin(t * 0.9 + sx) * 0.01).clone();
      }
      if (armsUp > 0) T.lerp(_v9.set(sx * (D.shW + 0.12 * k), D.H + 0.12 * k + bounce, 0.08 * k), armsUp);
      if (clap > 0) { const c = Math.abs(Math.sin(this.actT * 14)); T.lerp(_v9.set(sx * (0.03 + c * 0.06) * k, D.shY - 0.12 * k, 0.3 * k), clap); }
      if (shrug > 0 && !(this.hold && this.hold[s])) T.lerp(_v9.set(sx * (D.shW + 0.16 * k), D.hipY + 0.06 * k, 0.18 * k), shrug);
      const A = this.arms[s];
      const E = new V(), W = new V();
      this._ik(shoulder, T, D.ua, D.fa, pole, E, W);
      const P = A.pts;
      P[0].copy(shoulder).addScaledVector(_v3.copy(shoulder).sub(E).normalize(), 0.015 * k); P[1].lerpVectors(shoulder, E, 0.5); P[2].copy(E); P[3].lerpVectors(E, W, 0.5); P[4].copy(W);
      updateTube((this.dressed.coat || !A.karm ? A.arm : A.karm).geometry, P);
      // hand orientation
      const hd = (this.hold && this.hold[s] && this.hold[s].dir) ? this.toLocalDir(this.hold[s].dir) : _v10.copy(W).sub(E).normalize();
      let palm = (this.hold && this.hold[s] && this.hold[s].palm) ? this.toLocalDir(this.hold[s].palm) : _v11.set(-sx, 0, 0.3).normalize();
      if (armsUp > 0.3 && !(this.hold && this.hold[s])) palm = _v11.set(0, 0, 1);
      if (clap > 0.3) palm = _v11.set(-sx, 0, 0);
      const Y = hd.clone().normalize();
      const Z = palm.clone().addScaledVector(Y, -palm.dot(Y)).normalize();
      const X = new V().crossVectors(Y, Z);
      const m = new THREE.Matrix4().makeBasis(X, Y, Z);
      const gl = A.glove;
      gl.position.copy(W).addScaledVector(Y, 0.0 * k);
      gl.quaternion.setFromRotationMatrix(m);
      setGrip(gl, this.grip[s] ?? 0.2);
      if (A.bare) { A.bare.position.copy(W); A.bare.quaternion.copy(gl.quaternion); }
      // forearm sleeve should end over the glove cuff: pull fa a bit forward
    }
    // legs (IK hips -> feet on ground)
    for (const s of ['R', 'L']) {
      const sx = s === 'R' ? -1 : 1;
      const hip = _v6.set(sx * D.hipW, -0.02 * k, 0).applyMatrix4(cm);
      const foot = _v8.set(sx * (D.hipW + 0.01 * k), D.ank + (bounce > 0.01 ? bounce * 0.6 : 0), 0.01 * k);
      const E = new V(), W = new V();
      this._ik(hip, foot, D.th, D.sh, _v7.set(0, 0, 1), E, W);
      const L = this.legs[s];
      const P = L.pts;
      P[0].copy(hip).add(_v3.set(0, 0.03 * k, 0)); P[1].lerpVectors(hip, E, 0.5); P[2].copy(E); P[3].lerpVectors(E, W, 0.5); P[4].copy(W).add(_v3.set(0, -0.02 * k, 0.005));
      updateTube(L.leg.geometry, P);
      L.boot.position.copy(W).addScaledVector(UP, -L.boot.userData.shaftH * 0.0);
      L.boot.position.y = W.y - D.ank * 0.85;
      L.boot.rotation.set(0, 0, 0);
      L.boot.position.y = Math.max(L.boot.position.y, D.ank * 0.15);
      // the boot group has its origin at the shaft bottom; shaft goes up
      L.boot.position.y = W.y - D.ank + D.ank * 0.15 + 0.0;
      L.boot.position.y = (bounce > 0.01 ? bounce * 0.6 : 0) + D.ank * 0.55;
    }
  }

  toLocalDir(d) {
    const q = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    return d.clone().applyQuaternion(q);
  }

  setWet(v) {
    this.mCoat.userData.wet.value = v; this.mPants.userData.wet.value = v * 0.9; this.mGlove.userData.wet.value = v;
    if (this.mCurtain) this.mCurtain.userData.wet.value = v;
  }
}

const _v1 = new V(), _v2 = new V(), _v3 = new V(), _v4 = new V(), _v5 = new V(), _v6 = new V(), _v7 = new V(), _v8 = new V(), _v9 = new V(), _v10 = new V(), _v11 = new V();
