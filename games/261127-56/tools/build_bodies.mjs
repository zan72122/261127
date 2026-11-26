// 人物と手のメッシュをビルド時に作る（node tools/build_bodies.mjs）
// 出力: mesh/*.bin（JSON ヘッダー + 量子化した頂点・法線・AO・インデックス）
import { roundCone, ellipsoid, roundBox, plane, compose, polygonize, writePack, rotM, apply3, add, sub, scl, nrm, len, lerpv, fbm, vnoise } from './sdf.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'mesh');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

// ======================================================================= 手
// 手の座標: 手首=原点, 指先 +z, 手の甲 +y, 右手は親指が -x 側
function fingerChain(base, yaw, flex, lens, r0, r1, roll = 0) {
  const pts = [base];
  let pitch = flex[0] * 0.25; // 付け根のわずかな角度
  let p = base;
  for (let s = 0; s < 3; s++) {
    pitch += flex[s];
    const d = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    p = add(p, scl(d, lens[s]));
    pts.push(p);
  }
  const rs = [r0, r0 * 0.93 + r1 * 0.07, (r0 + r1) / 2, r1];
  return { pts, rs, pitch, yaw };
}

function handPrims(o) {
  const S = o.scale || 1;
  const sv = (v) => scl(v, S);
  const skin = [], nails = [];
  const pose = o.pose;
  // 手首から前腕（楕円断面の筒を楕円体の連なりで）
  const fa = [[0.0, 0.0225, 0.0150], [-0.035, 0.0245, 0.0170], [-0.075, 0.0262, 0.0188], [-0.12, 0.0275, 0.0205], [-0.17, 0.029, 0.022], [-0.215, 0.0295, 0.0225]];
  for (const [z, rx, ry] of fa) skin.push({ p: ellipsoid(sv([0, 0.0015, z]), [rx * S, ry * S, 0.03 * S]), k: 0.03 * S });
  // 手のひら
  skin.push({ p: roundBox(sv([0, -0.001, 0.036]), [0.0255 * S, 0.0088 * S, 0.031 * S], 0.0085 * S, rotM(0.05, 0, 0)), k: 0.012 * S });
  // 母指球・小指球
  skin.push({ p: ellipsoid(sv([-0.016, -0.0075, 0.024]), [0.0125 * S, 0.0095 * S, 0.021 * S], rotM(0, -0.35, 0)), k: 0.01 * S });
  skin.push({ p: ellipsoid(sv([0.018, -0.006, 0.032]), [0.0095 * S, 0.008 * S, 0.023 * S]), k: 0.01 * S });
  // 指
  const F = [ // x, yaw, lens, r0, r1
    [-0.0185, -0.10, [0.0245, 0.0155, 0.0135], 0.0078, 0.0058],
    [-0.0060, -0.01, [0.0275, 0.0175, 0.0145], 0.0080, 0.0060],
    [0.0065, 0.07, [0.0255, 0.0165, 0.0135], 0.0075, 0.0056],
    [0.0180, 0.16, [0.0195, 0.0125, 0.0115], 0.0066, 0.0050],
  ];
  const mcpZ = [0.067, 0.069, 0.066, 0.060];
  for (let f = 0; f < 4; f++) {
    const [x, yaw0, lens, r0, r1] = F[f];
    const fl = pose.flex[f];
    const yaw = yaw0 * (pose.spread || 1);
    const base = [x, 0.0005, mcpZ[f]];
    const ch = fingerChain(base, yaw, fl, lens, r0, r1);
    for (let s = 0; s < 3; s++) {
      skin.push({ p: roundCone(sv(ch.pts[s]), sv(ch.pts[s + 1]), ch.rs[s] * S, ch.rs[s + 1] * S), k: (s === 0 ? 0.008 : 0.0025) * S });
    }
    // 指節の膨らみ（甲側）
    for (let s = 0; s < 3; s++) {
      const j = ch.pts[s];
      skin.push({ p: ellipsoid(sv(add(j, [0, ch.rs[s] * (s === 0 ? 0.55 : 0.35), 0])), [ch.rs[s] * 0.75 * S, ch.rs[s] * 0.55 * S, ch.rs[s] * 0.7 * S]), k: 0.003 * S });
    }
    // 中手骨の筋（甲）
    skin.push({ p: roundCone(sv([x * 0.55, 0.004, 0.015]), sv([x, 0.004, mcpZ[f] - 0.004]), 0.0045 * S, 0.0055 * S), k: 0.01 * S });
    // 爪（別メッシュ）
    const a = ch.pts[2], b = ch.pts[3];
    const dir = nrm(sub(b, a));
    const up = nrm([0, Math.cos(ch.pitch), Math.sin(ch.pitch)]);
    const nc = add(lerpv(a, b, 0.62), scl(up, ch.rs[3] * 0.78));
    const R = rotM(-ch.pitch, ch.yaw, 0);
    nails.push({ p: ellipsoid(sv(nc), [ch.rs[3] * 0.78 * S, ch.rs[3] * 0.22 * S, lens[2] * 0.40 * S], R), k: 0 });
    // 指先の腹
    skin.push({ p: ellipsoid(sv(add(lerpv(a, b, 0.6), scl(up, -ch.rs[3] * 0.25))), [ch.rs[3] * 0.95 * S, ch.rs[3] * 0.8 * S, lens[2] * 0.42 * S], R), k: 0.003 * S });
  }
  // 親指
  {
    const t = pose.thumb; // [yaw, pitch0, flex1, flex2]
    const cmc = [-0.016, -0.003, 0.010];
    const d0 = nrm([-Math.sin(t[0]), -Math.sin(t[1]), Math.cos(t[0])]);
    const m1 = add(cmc, scl(d0, 0.036));
    skin.push({ p: roundCone(sv(cmc), sv(m1), 0.0115 * S, 0.0088 * S), k: 0.012 * S });
    const rot = (v, ang) => { // 手のひら側へ曲げる（x 軸を中心に回転させてから内側へ）
      const c = Math.cos(ang), s = Math.sin(ang);
      return nrm([v[0] * c + 0.6 * s, v[1] * c - 0.5 * s, v[2] * c - 0.1 * s]);
    };
    const d1 = rot(d0, t[2]);
    const m2 = add(m1, scl(d1, 0.0215));
    skin.push({ p: roundCone(sv(m1), sv(m2), 0.0088 * S, 0.0080 * S), k: 0.003 * S });
    const d2 = rot(d1, t[3]);
    const m3 = add(m2, scl(d2, 0.019));
    skin.push({ p: roundCone(sv(m2), sv(m3), 0.0080 * S, 0.0066 * S), k: 0.003 * S });
    skin.push({ p: ellipsoid(sv(add(m1, [0, 0.003, 0])), [0.006 * S, 0.005 * S, 0.006 * S]), k: 0.003 * S });
    // 親指の爪：指の甲側（手の甲 +y と指の向きから）
    const side = nrm([d2[1] * 0 - d2[2] * 0, 0, 0]);
    let upv = nrm(sub([0, 1, 0], scl(d2, d2[1])));
    upv = nrm(add(upv, [-0.6, 0, 0]));
    const nc = add(lerpv(m2, m3, 0.6), scl(upv, 0.0058));
    const yaw = Math.atan2(d2[0], d2[2]), pitch = -Math.asin(Math.max(-1, Math.min(1, d2[1])));
    nails.push({ p: ellipsoid(sv(nc), [0.0058 * S, 0.0016 * S, 0.0085 * S], rotM(-pitch, yaw, 0.7)), k: 0 });
  }
  return { skin, nails };
}

// 袖口（セーターの折り返し / ネルシャツの腕まくり）
function sleevePrims(S, z0, z1, kind) {
  const outer = [], inner = [];
  const disp = (x, y, z) => {
    const a = Math.atan2(y, x);
    const zz = z / S;
    let d = 0.0016 * Math.sin(zz * 140 + a * 2 + 1.3 * Math.sin(a * 3)) + 0.0022 * fbm(x / S * 60, y / S * 60, zz * 60, 2);
    if (kind === 'roll') d += 0.0025 * Math.sin(a * 5 + zz * 40);
    return d * S;
  };
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const z = z0 + (z1 - z0) * i / n;
    const t = i / n;
    let rx = 0.036 + 0.014 * t, ry = 0.029 + 0.012 * t;
    if (i <= 1) { rx += 0.004; ry += 0.004; } // 折り返しの厚み
    outer.push({ p: ellipsoid([0, 0.0015 * S, z * S], [rx * S, ry * S, 0.035 * S], null, { disp }), k: 0.025 * S });
    if (i <= 1) inner.push({ p: ellipsoid([0, 0.0015 * S, (z + 0.012) * S], [(rx - 0.0042) * S, (ry - 0.0042) * S, 0.03 * S]), k: 0.01 * S });
  }
  const innerF = compose(inner);
  const items = [...outer];
  items.push({ p: plane([0, 0, 1], z0 * S), op: 'i', k: 0.003 * S });
  return items;
}

const POSES = {
  press: { flex: [[0.32, 0.42, 0.22], [0.3, 0.4, 0.2], [0.34, 0.45, 0.24], [0.42, 0.5, 0.28]], thumb: [0.55, 0.35, 0.2, 0.15], spread: 0.6 },
  cup: { flex: [[0.45, 0.55, 0.32], [0.42, 0.55, 0.32], [0.48, 0.6, 0.35], [0.55, 0.62, 0.38]], thumb: [0.4, 0.5, 0.35, 0.25], spread: 0.8 },
  hold: { flex: [[0.85, 0.9, 0.45], [0.85, 0.95, 0.45], [0.9, 0.95, 0.5], [0.95, 0.95, 0.5]], thumb: [0.3, 0.6, 0.45, 0.3], spread: 0.7 },
  relax: { flex: [[0.18, 0.3, 0.18], [0.16, 0.28, 0.16], [0.22, 0.34, 0.2], [0.3, 0.4, 0.24]], thumb: [0.65, 0.25, 0.12, 0.1], spread: 1.2 },
};

function buildHand(name, poseName, S, mirror, sleeveKind, h) {
  const { skin, nails } = handPrims({ pose: POSES[poseName], scale: S });
  skin.push({ p: plane([0, 0, -1], 0.08 * S), op: 'i', k: 0 }); // 袖の中は作らない
  const sl = sleevePrims(S, -0.05, -0.42, sleeveKind);
  const fSkin = compose(skin), fNail = compose(nails), fSl = compose(sl);
  const fAll = (x, y, z) => Math.min(fSkin(x, y, z), fNail(x, y, z), fSl(x, y, z));
  const mx = mirror ? -1 : 1;
  const wrap = (f) => (x, y, z) => f(x * mx, y, z);
  const bmin = [-0.06 * S, -0.06 * S, -0.085 * S], bmax = [0.06 * S, 0.045 * S, 0.15 * S];
  const t0 = Date.now();
  const gS = polygonize(wrap(fSkin), bmin, bmax, h, { aoField: wrap(fAll), aoStep: 0.003 * S, aoK: 0.75 });
  const gN = polygonize(wrap(fNail), bmin, bmax, h * 0.7, { aoField: wrap(fAll), aoStep: 0.002 * S });
  const gL = polygonize(wrap(fSl), [-0.075 * S, -0.065 * S, -0.44 * S], [0.075 * S, 0.065 * S, -0.04 * S], h * 2.4, { aoField: wrap(fAll), aoStep: 0.004 * S });
  if (mirror) for (const g of [gS, gN, gL]) flipWinding(g);
  const meshes = [
    { name: 'skin', part: 'hand', mat: 'skin', geo: gS },
    { name: 'nail', part: 'hand', mat: 'nail', geo: gN },
    { name: 'sleeve', part: 'hand', mat: sleeveKind === 'roll' ? 'flannel' : 'knit', geo: gL },
  ];
  const size = writePack(path.join(OUT, name + '.bin'), meshes);
  console.log(name, 'verts', gS.nv, gN.nv, gL.nv, 'bytes', size, (Date.now() - t0) + 'ms');
}
function flipWinding(g) { for (let t = 0; t < g.I.length; t += 3) { const b = g.I[t + 1]; g.I[t + 1] = g.I[t + 2]; g.I[t + 2] = b; } }

// ======================================================================= 人物（全身）
// 正面 +z、足元 y=0。パーツ: torso / head / armL / armR（回転の支点つき）
function folds(amp, freq) {
  return (x, y, z) => amp * (0.6 * fbm(x * freq, y * freq * 0.5, z * freq, 3) + 0.4 * Math.sin(y * freq * 2.1 + Math.sin(x * freq) * 1.5));
}
function personPrims(P) {
  const mats = { torso: {}, head: {}, armL: {}, armR: {} };
  const put = (part, mat, item) => { (mats[part][mat] ||= []).push(item); };
  const cf = folds(P.foldAmp, P.foldFreq);
  const top = P.top, bottom = P.bottom;
  // 首
  put('torso', 'skin', { p: roundCone(P.neck[0], P.neck[1], P.neckR, P.neckR * 0.95), k: 0 });
  // 胴（服）
  for (const e of P.torsoEll) put('torso', top, { p: ellipsoid(e[0], e[1], null, { disp: (x, y, z) => cf(x, y, z) }), k: P.k });
  put('torso', top, { p: roundCone(P.shoulder[0], P.shoulder[1], P.shoulderR, P.shoulderR, { disp: (x, y, z) => cf(x, y, z) * 0.5 }), k: P.k });
  if (P.collar) put('torso', top, { p: roundCone(add(P.neck[0], [0, 0.0, -0.005]), add(P.neck[0], [0, 0.025, 0.0]), P.neckR * 1.35, P.neckR * 1.15), k: P.k * 0.5 });
  // 脚 / スカート
  for (const s of [-1, 1]) {
    const hp = [P.hip[0] * s, P.hip[1], P.hip[2]], kn = [P.knee[0] * s, P.knee[1], P.knee[2]], an = [P.ankle[0] * s, P.ankle[1], P.ankle[2]];
    if (P.skirt) {
      put('torso', 'skin', { p: roundCone(kn, an, P.shinR[0] * 0.8, P.shinR[1] * 0.85), k: 0.01 });
    } else {
      put('torso', bottom, { p: roundCone(hp, kn, P.thighR[0], P.thighR[1], { disp: (x, y, z) => cf(x, y, z) * 0.8 }), k: P.k * 0.6 });
      put('torso', bottom, { p: roundCone(kn, an, P.shinR[0], P.shinR[1], { disp: (x, y, z) => cf(x * 1.3, y * 1.3, z) * 0.9 }), k: P.k * 0.4 });
    }
    // 靴
    put('torso', 'shoe', { p: ellipsoid([P.foot[0] * s, P.foot[1], P.foot[2]], P.footR), k: 0 });
    put('torso', 'shoe', { p: roundCone([P.ankle[0] * s, P.ankle[1] + 0.01, P.ankle[2]], [P.foot[0] * s, P.foot[1], P.foot[2] - 0.02], P.shinR[1] * 1.05, P.footR[0]), k: 0.02 });
  }
  if (P.skirt) {
    const sk = P.skirt;
    put('torso', bottom, { p: roundCone(sk.a, sk.b, sk.r1, sk.r2, { disp: (x, y, z) => 0.008 * Math.sin(Math.atan2(z, x) * 9 + y * 3) * (1 - (y - sk.b[1]) / (sk.a[1] - sk.b[1])) + cf(x, y, z) * 0.5 }), k: 0.06 });
  } else {
    put('torso', bottom, { p: ellipsoid(P.pelvis[0], P.pelvis[1]), k: P.k });
  }
  // 頭
  const H = 'head';
  put(H, 'skin', { p: ellipsoid(P.head[0], P.head[1]), k: 0 });
  put(H, 'skin', { p: ellipsoid(add(P.head[0], P.jaw[0]), P.jaw[1]), k: 0.03 });
  put(H, 'skin', { p: ellipsoid(add(P.head[0], P.nose[0]), P.nose[1]), k: 0.01 });
  for (const s of [-1, 1]) put(H, 'skin', { p: ellipsoid(add(P.head[0], [P.ear[0][0] * s, P.ear[0][1], P.ear[0][2]]), P.ear[1]), k: 0.004 });
  // 髪：頭を覆う殻 − 顔の領域
  const hd = (x, y, z) => 0.0025 * Math.sin(Math.atan2(x, z - P.head[0][2]) * 26 + fbm(x * 40, y * 10, z * 40, 2) * 3) + 0.003 * fbm(x * 25, y * 25, z * 25, 2);
  put(H, 'hair', { p: ellipsoid(add(P.head[0], P.hair[0]), P.hair[1], null, { disp: hd }), k: 0 });
  put(H, 'hair', { p: ellipsoid(add(P.head[0], P.faceCut[0]), P.faceCut[1]), op: 's', k: 0.012 });
  if (P.hairCutY != null) put(H, 'hair', { p: plane([0, -1, 0], -(P.head[0][1] + P.hairCutY)), op: 'i', k: 0.01 });
  for (const x of P.hairExtra || []) put(H, 'hair', { p: x.p, k: x.k || 0.01 });
  // 腕
  for (const s of [-1, 1]) {
    const part = s < 0 ? 'armL' : 'armR';
    const sh = [P.sh[0] * s, P.sh[1], P.sh[2]], el = [P.el[0] * s, P.el[1], P.el[2]], wr = [P.wr[0] * s, P.wr[1], P.wr[2]];
    put(part, top, { p: roundCone(sh, el, P.uaR[0], P.uaR[1], { disp: (x, y, z) => cf(x, y, z) }), k: 0.02 });
    put(part, top, { p: roundCone(el, add(wr, [0, 0.015, 0]), P.faR[0], P.faR[1], { disp: (x, y, z) => cf(x, y * 1.5, z) * 0.8 }), k: 0.015 });
    // 手（遠景用に簡略）
    const hs = P.handS;
    const hc = add(wr, [0.004 * s, -0.04 * hs, 0.008]);
    put(part, 'skin', { p: roundCone(add(wr, [0, 0.01, 0]), add(wr, [0, -0.03 * hs, 0.004]), 0.019 * hs, 0.02 * hs), k: 0.01 });
    put(part, 'skin', { p: roundBox(hc, [0.012 * hs, 0.033 * hs, 0.024 * hs], 0.01 * hs, rotM(0, 0, 0.1 * s)), k: 0.012 * hs });
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.0105 * hs;
      const a = add(hc, [0.006 * s * hs, -0.03 * hs, fx]);
      const b = add(a, [0.004 * s * hs, -0.042 * hs * (f === 1 ? 1.05 : f === 3 ? 0.8 : 0.95), 0.004 * hs]);
      put(part, 'skin', { p: roundCone(a, b, 0.0062 * hs, 0.0052 * hs), k: 0.005 * hs });
    }
    put(part, 'skin', { p: roundCone(add(hc, [-0.008 * s * hs, -0.005 * hs, 0.022 * hs]), add(hc, [-0.004 * s * hs, -0.035 * hs, 0.03 * hs]), 0.0075 * hs, 0.006 * hs), k: 0.006 * hs });
  }
  return mats;
}

function buildPerson(name, P, h) {
  const t0 = Date.now();
  const mats = personPrims(P);
  // AO 用の全身場
  const all = [];
  for (const part in mats) for (const m in mats[part]) {
    const f = compose(mats[part][m]);
    all.push(f);
  }
  const fAll = (x, y, z) => { let d = 1e9; for (const f of all) d = Math.min(d, f(x, y, z)); return d; };
  const meshes = [];
  for (const part in mats) for (const m in mats[part]) {
    const items = mats[part][m];
    const f = compose(items);
    // 外接範囲
    const bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
    for (const it of items) if ((it.op || 'u') === 'u' && it.p.R < 100) for (let c = 0; c < 3; c++) {
      bmin[c] = Math.min(bmin[c], it.p.c[c] - it.p.R); bmax[c] = Math.max(bmax[c], it.p.c[c] + it.p.R);
    }
    const hh = m === 'skin' && part === 'head' ? h * 0.7 : (m === 'skin' && part.startsWith('arm')) ? h * 0.6 : h;
    const g = polygonize(f, bmin, bmax, hh, { aoField: fAll, aoStep: P.aoStep, aoK: 0.8 });
    meshes.push({ name: part + '_' + m, part, mat: m, geo: g });
  }
  meshes.partsInfo = { head: { pivot: P.neck[1] }, armL: { pivot: [-P.sh[0], P.sh[1], P.sh[2]] }, armR: { pivot: P.sh }, torso: { pivot: [0, 0, 0] } };
  const size = writePack(path.join(OUT, name + '.bin'), meshes);
  console.log(name, meshes.map(m => m.name + ':' + m.geo.nv).join(' '), 'bytes', size, (Date.now() - t0) + 'ms');
}

// 5歳の女の子（110cm）
const GIRL = {
  top: 'knit', bottom: 'cord', foldAmp: 0.004, foldFreq: 18, k: 0.05, aoStep: 0.012,
  neck: [[0, 0.845, -0.005], [0, 0.905, 0.0]], neckR: 0.031,
  torsoEll: [[[0, 0.745, 0], [0.108, 0.125, 0.078]], [[0, 0.645, 0.008], [0.104, 0.1, 0.083]], [[0, 0.585, 0], [0.106, 0.06, 0.078]]],
  shoulder: [[-0.092, 0.82, -0.005], [0.092, 0.82, -0.005]], shoulderR: 0.045,
  hip: [0.054, 0.55, 0], knee: [0.058, 0.31, 0.012], ankle: [0.06, 0.075, 0], thighR: [0.056, 0.044], shinR: [0.043, 0.034],
  pelvis: [[0, 0.56, 0], [0.1, 0.065, 0.075]],
  foot: [0.06, 0.032, 0.035], footR: [0.037, 0.032, 0.078],
  head: [[0, 0.99, 0.005], [0.073, 0.087, 0.082]], jaw: [[0, -0.035, 0.018], [0.058, 0.055, 0.06]], nose: [[0, -0.018, 0.079], [0.011, 0.012, 0.01]],
  ear: [[0.072, -0.012, 0.0], [0.011, 0.02, 0.014]],
  hair: [[0, 0.012, -0.01], [0.081, 0.095, 0.09]], faceCut: [[0, -0.032, 0.075], [0.066, 0.068, 0.06]], hairCutY: null,
  sh: [0.115, 0.815, -0.005], el: [0.148, 0.63, -0.01], wr: [0.158, 0.47, 0.02], uaR: [0.037, 0.031], faR: [0.031, 0.027], handS: 0.82,
};
GIRL.hairExtra = [
  // 前髪
  { p: ellipsoid([0, 1.035, 0.058], [0.068, 0.03, 0.036], null, { disp: (x, y, z) => 0.002 * Math.sin(x * 260) }), k: 0.015 },
  // 二つ結び
  { p: roundCone([-0.07, 0.955, -0.045], [-0.088, 0.81, -0.055], 0.026, 0.011, { disp: (x, y, z) => 0.0025 * Math.sin(Math.atan2(z + 0.05, x + 0.08) * 14 + y * 30) }), k: 0.02 },
  { p: roundCone([0.07, 0.955, -0.045], [0.088, 0.81, -0.055], 0.026, 0.011, { disp: (x, y, z) => 0.0025 * Math.sin(Math.atan2(z + 0.05, x - 0.08) * 14 + y * 30) }), k: 0.02 },
];

// パパ（175cm）
const PAPA = {
  top: 'flannel', bottom: 'denim', foldAmp: 0.006, foldFreq: 11, k: 0.07, aoStep: 0.02, collar: true,
  neck: [[0, 1.47, -0.01], [0, 1.56, 0.0]], neckR: 0.05,
  torsoEll: [[[0, 1.3, 0], [0.175, 0.19, 0.115]], [[0, 1.13, 0.01], [0.165, 0.14, 0.115]], [[0, 1.0, 0], [0.17, 0.09, 0.105]]],
  shoulder: [[-0.17, 1.43, -0.01], [0.17, 1.43, -0.01]], shoulderR: 0.065,
  hip: [0.09, 0.95, 0], knee: [0.1, 0.52, 0.015], ankle: [0.105, 0.1, 0], thighR: [0.085, 0.064], shinR: [0.06, 0.048],
  pelvis: [[0, 0.97, 0], [0.165, 0.1, 0.105]],
  foot: [0.105, 0.042, 0.05], footR: [0.05, 0.042, 0.128],
  head: [[0, 1.655, 0.012], [0.08, 0.105, 0.097]], jaw: [[0, -0.045, 0.022], [0.066, 0.065, 0.075]], nose: [[0, -0.02, 0.097], [0.013, 0.02, 0.016]],
  ear: [[0.079, -0.012, 0.0], [0.011, 0.028, 0.018]],
  hair: [[0, 0.018, -0.008], [0.086, 0.108, 0.103]], faceCut: [[0, -0.05, 0.09], [0.076, 0.085, 0.075]], hairCutY: -0.04,
  sh: [0.2, 1.42, -0.01], el: [0.245, 1.12, -0.02], wr: [0.265, 0.87, 0.02], uaR: [0.058, 0.047], faR: [0.046, 0.035], handS: 1.3,
};
// ママ（160cm）
const MAMA = {
  top: 'knit2', bottom: 'skirt', foldAmp: 0.005, foldFreq: 12, k: 0.06, aoStep: 0.018,
  neck: [[0, 1.355, -0.01], [0, 1.43, 0.0]], neckR: 0.042,
  torsoEll: [[[0, 1.2, 0], [0.15, 0.17, 0.105]], [[0, 1.05, 0.008], [0.135, 0.12, 0.1]], [[0, 0.95, 0], [0.155, 0.09, 0.1]]],
  shoulder: [[-0.145, 1.315, -0.01], [0.145, 1.315, -0.01]], shoulderR: 0.056,
  hip: [0.08, 0.88, 0], knee: [0.085, 0.48, 0.015], ankle: [0.09, 0.09, 0], thighR: [0.075, 0.058], shinR: [0.052, 0.04],
  skirt: { a: [0, 0.98, 0], b: [0, 0.2, 0.01], r1: 0.15, r2: 0.25 },
  foot: [0.09, 0.038, 0.045], footR: [0.044, 0.038, 0.112],
  head: [[0, 1.52, 0.01], [0.074, 0.097, 0.09]], jaw: [[0, -0.042, 0.02], [0.058, 0.058, 0.068]], nose: [[0, -0.018, 0.09], [0.011, 0.017, 0.013]],
  ear: [[0.073, -0.012, 0.0], [0.01, 0.025, 0.016]],
  hair: [[0, 0.016, -0.01], [0.082, 0.102, 0.097]], faceCut: [[0, -0.045, 0.083], [0.07, 0.078, 0.07]], hairCutY: null,
  sh: [0.17, 1.31, -0.01], el: [0.205, 1.035, -0.02], wr: [0.22, 0.8, 0.03], uaR: [0.05, 0.04], faR: [0.04, 0.03], handS: 1.15,
};
MAMA.hairExtra = [
  { p: ellipsoid([0, 1.58, -0.1], [0.05, 0.048, 0.045], null, { disp: (x, y, z) => 0.003 * Math.sin(Math.atan2(y - 1.58, x) * 12 + z * 80) }), k: 0.02 },
  { p: roundCone([0, 1.5, -0.08], [0, 1.43, -0.07], 0.05, 0.035), k: 0.03 },
];

if (!only.length || only.includes('hands')) {
  buildHand('hand_girl_press', 'press', 1.0, false, 'knit', 0.00155);
  buildHand('hand_girl_cup', 'cup', 1.0, true, 'knit', 0.00155);
  buildHand('hand_girl_hold', 'hold', 1.0, false, 'knit', 0.00155);
  buildHand('hand_papa', 'relax', 1.45, false, 'roll', 0.0023);
}
if (!only.length || only.includes('people')) {
  buildPerson('girl', GIRL, 0.0045);
  buildPerson('papa', PAPA, 0.0095);
  buildPerson('mama', MAMA, 0.0095);
}
