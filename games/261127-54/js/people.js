// 人：手と腕（いちばん大きく映るので写実を優先）・後ろ姿の全身
import * as THREE from '../lib/three.module.min.js';
import { roundCone, ellipsoid, roundBox, mesh } from './sdf.js';
import { COMMON } from './glsl.js';

const L = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // sRGB→線形（Color は線形で保持）

// 材質番号 0肌 1布 2爪 3髪 4靴 5布(エプロン/デニム)
let personMat = null;
export function getPersonMaterial() {
  if (personMat) return personMat;
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(1, 1, 1), clearcoat: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMat; attribute float aAO; varying float vMat; varying float vAO; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vAO = aAO; vObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMat; varying float vAO; varying vec3 vObj;\n' + COMMON)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float mt = floor(vMat + 0.5);
        float hgt = 0.0; float rgh = 0.55;
        if (mt < 0.5) { // 肌
          float mot = vn(vObj*260.0); float por = vn(vObj*2600.0);
          diffuseColor.rgb *= 0.95 + 0.08*mot;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.05,0.93,0.92), vn(vObj*90.0)*0.5);
          hgt = por*0.00003 + vn(vObj*vec3(900.0,3000.0,900.0))*0.00002;
          rgh = 0.47 + por*0.12;
        } else if (mt < 1.5 || (mt > 4.5 && mt < 5.5)) { // 布
          vec3 a = vObj*2600.0;
          float wv = sin(a.x+a.z*0.3)*sin(a.y*1.02+a.z*0.7);
          float sl = vn(vObj*vec3(60.0,900.0,60.0));
          hgt = (wv*0.5+0.5)*0.00006 + sl*0.00004;
          diffuseColor.rgb *= 0.92 + 0.08*(wv*0.5+0.5) + (sl-0.5)*0.06;
          rgh = 0.9;
        } else if (mt < 2.5) { // 爪
          rgh = 0.22; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95,0.86,0.82), 0.3);
        } else if (mt < 3.5) { // 髪
          float st = vn(vObj*vec3(1500.0,40.0,1500.0)); float st2 = vn(vObj*vec3(5000.0,120.0,5000.0));
          diffuseColor.rgb *= 0.75 + 0.35*st + 0.15*st2;
          hgt = (st*0.6+st2*0.4)*0.0004;
          rgh = 0.38;
        } else { rgh = 0.6; hgt = vn(vObj*1200.0)*0.00005; }
        diffuseColor.rgb *= mix(0.35, 1.0, vAO);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rgh;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = bumpN(normal, hgt, -vViewPosition, faceDirection);')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.sheenColor = mt < 0.5 ? vec3(0.42,0.16,0.10) : ((mt < 1.5 || (mt > 4.5 && mt < 5.5)) ? vec3(0.22) : (mt > 2.5 && mt < 3.5 ? vec3(0.10,0.07,0.05) : vec3(0.0)));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (mt < 0.5) totalEmissiveRadiance += diffuseColor.rgb * vec3(0.10,0.035,0.025) * vAO;`);
  };
  m.customProgramCacheKey = () => 'person';
  personMat = m;
  return m;
}

// 基底つき楕円体
function ellB(c, r, ex, ey, ez, m, col, k = 0.003) {
  const f = (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const a = (px * ex[0] + py * ex[1] + pz * ex[2]) / r[0], b = (px * ey[0] + py * ey[1] + pz * ey[2]) / r[1], cc = (px * ez[0] + py * ez[1] + pz * ez[2]) / r[2];
    const k0 = Math.hypot(a, b, cc);
    const k1 = Math.hypot(a / r[0], b / r[1], cc / r[2]);
    return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(...r);
  };
  const R = Math.max(...r) + 0.01;
  return { f, m, c: col, k, bb: [c[0] - R, c[1] - R, c[2] - R, c[0] + R, c[1] + R, c[2] + R] };
}
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

// ---- 手のポーズ（各指 [開き, 付け根, 第2, 第1], 親指 {abd, f:[3]}）
export const POSES = {
  open: { f: [[0.10, 0.18, 0.22, 0.12], [0.02, 0.2, 0.26, 0.14], [-0.07, 0.24, 0.3, 0.16], [-0.16, 0.3, 0.36, 0.2]], t: { abd: 0.35, f: [0.1, 0.2, 0.15] } },
  flat: { f: [[0.14, 0.04, 0.06, 0.04], [0.03, 0.04, 0.06, 0.04], [-0.08, 0.05, 0.07, 0.05], [-0.2, 0.06, 0.08, 0.05]], t: { abd: 0.18, f: [0.05, 0.08, 0.06] } },
  grip: { f: [[0.05, 1.05, 1.35, 0.55], [0.0, 1.25, 1.45, 0.6], [-0.05, 1.3, 1.45, 0.6], [-0.1, 1.35, 1.4, 0.6]], t: { abd: 0.95, f: [0.3, 0.45, 0.35] } },
  pinch: { f: [[0.06, 0.62, 0.75, 0.35], [0.0, 0.95, 1.1, 0.5], [-0.05, 1.15, 1.25, 0.6], [-0.1, 1.25, 1.3, 0.65]], t: { abd: 0.8, f: [0.2, 0.3, 0.25] } },
  point: { f: [[0.06, 0.05, 0.06, 0.03], [0.0, 1.35, 1.5, 0.8], [-0.05, 1.4, 1.5, 0.8], [-0.1, 1.45, 1.45, 0.75]], t: { abd: 0.85, f: [0.35, 0.55, 0.3] } },
  fist: { f: [[0.04, 1.4, 1.6, 0.9], [0.0, 1.45, 1.6, 0.9], [-0.04, 1.5, 1.6, 0.9], [-0.08, 1.5, 1.55, 0.85]], t: { abd: 0.9, f: [0.3, 0.6, 0.45] } },
  reach: { f: [[0.16, 0.35, 0.45, 0.25], [0.04, 0.4, 0.5, 0.28], [-0.09, 0.45, 0.55, 0.3], [-0.22, 0.5, 0.6, 0.32]], t: { abd: 0.4, f: [0.1, 0.2, 0.15] } },
  cup: { f: [[0.08, 0.3, 0.35, 0.2], [0.02, 0.32, 0.38, 0.2], [-0.05, 0.35, 0.4, 0.22], [-0.12, 0.4, 0.45, 0.25]], t: { abd: 0.3, f: [0.15, 0.2, 0.15] } },
};

// spec: { s:大きさ, skin, tip, nail, side:'R'|'L', sleeve:{type,col,at}, arm:[x,y,z] 手座標での前腕の向き, upper:[..] 上腕の向き, fore:長さ, upLen }
export function handPrims(spec, poseName) {
  const P = POSES[poseName];
  const s = spec.s, ts = spec.side === 'L' ? 1 : -1; // 親指側の z の符号
  const skin = spec.skin, tip = spec.tip || skin, nail = spec.nail || L('#e9c4b4');
  const out = [];
  const kF = 0.006 * s;
  // 手のひら
  out.push(roundBox([0.047 * s, 0.0, 0.0], [0.045 * s, 0.0125 * s, 0.039 * s], 0.011 * s, 0, skin, kF, [0, 0, 0]));
  out.push(ellipsoid([0.03 * s, -0.006 * s, ts * 0.024 * s], [0.032 * s, 0.013 * s, 0.019 * s], 0, skin, 0.012 * s, [0, ts * 0.5, 0]));
  out.push(ellipsoid([0.042 * s, -0.005 * s, -ts * 0.029 * s], [0.036 * s, 0.011 * s, 0.013 * s], 0, skin, 0.012 * s));
  out.push(ellipsoid([0.075 * s, 0.001 * s, 0.0], [0.03 * s, 0.013 * s, 0.04 * s], 0, skin, 0.01 * s));
  // 指
  const base = [[0.088, 0.002, ts * 0.027], [0.093, 0.003, ts * 0.008], [0.090, 0.002, -ts * 0.011], [0.082, 0.0, -ts * 0.028]];
  const lens = [[0.041, 0.025, 0.020], [0.045, 0.028, 0.021], [0.042, 0.027, 0.021], [0.033, 0.019, 0.018]];
  const rad = [[0.0094, 0.0085, 0.0077, 0.0069], [0.0097, 0.0088, 0.0079, 0.007], [0.0091, 0.0083, 0.0075, 0.0067], [0.0080, 0.0071, 0.0064, 0.0058]];
  const fr = spec.fr || 1; // 指の太さ係数（子どもは少しふっくら）
  const tips = [];
  for (let i = 0; i < 4; i++) {
    const [sp, c1, c2, c3] = P.f[i];
    let d = V.norm([Math.cos(sp * ts * -1 * -1), 0, Math.sin(sp) * ts]);
    let u = [0, 1, 0];
    let p = V.mul(base[i], s); p = [p[0], p[1], p[2]];
    const curls = [c1, c2, c3];
    // 付け根の関節のふくらみ
    out.push(ellipsoid(V.add(p, [0, 0.004 * s, 0]), [0.009 * s * fr, 0.008 * s * fr, 0.0085 * s * fr], 0, skin, 0.008 * s));
    for (let j = 0; j < 3; j++) {
      const a = curls[j];
      const nd = V.add(V.mul(d, Math.cos(a)), V.mul(u, -Math.sin(a)));
      const nu = V.add(V.mul(u, Math.cos(a)), V.mul(d, Math.sin(a)));
      d = V.norm(nd); u = V.norm(nu);
      const q = V.add(p, V.mul(d, lens[i][j] * s));
      const col = j === 2 ? tip : skin;
      out.push(roundCone(j === 0 ? V.sub(p, V.mul(d, 0.008 * s)) : p, q, rad[i][j] * s * fr, rad[i][j + 1] * s * fr, 0, col, j === 0 ? 0.008 * s : 0.0025 * s));
      if (j === 2) {
        // 爪
        const side = V.norm(V.cross(d, u));
        const nc = V.add(V.sub(q, V.mul(d, 0.0058 * s)), V.mul(u, rad[i][3] * s * fr * 0.72));
        out.push(ellB(nc, [0.0062 * s, 0.0016 * s, rad[i][3] * s * fr * 0.78], d, u, side, 2, nail, 0.0012 * s));
        tips.push(q);
      } else {
        // 関節のしわのふくらみ（背側）
        out.push(ellipsoid(V.add(q, V.mul(u, 0.002 * s)), [0.006 * s * fr, 0.006 * s * fr, 0.0065 * s * fr], 0, skin, 0.004 * s));
      }
      p = q;
    }
  }
  // 親指
  {
    const T = P.t;
    const th = 0.85;
    let d = V.norm([Math.cos(th), -Math.sin(T.abd) * 0.9, ts * Math.sin(th) * Math.cos(T.abd)]);
    let u = V.norm([-0.3, 0.6, ts * 0.75]);
    u = V.norm(V.sub(u, V.mul(d, V.dot(u, d))));
    // 内側へ回す（爪がやや外を向く）
    let p = V.mul([0.012, -0.005, ts * 0.02], s);
    const L3 = [0.036, 0.031, 0.026], R4 = [0.0125, 0.0105, 0.0094, 0.0085];
    for (let j = 0; j < 3; j++) {
      const a = T.f[j];
      const nd = V.add(V.mul(d, Math.cos(a)), V.mul(u, -Math.sin(a)));
      const nu = V.add(V.mul(u, Math.cos(a)), V.mul(d, Math.sin(a)));
      d = V.norm(nd); u = V.norm(nu);
      // 親指は手のひら側へも曲がる
      const toward = V.norm([0.2, -0.4, -ts * 0.9]);
      d = V.norm(V.add(d, V.mul(toward, T.abd * 0.12 * (j + 1))));
      u = V.norm(V.sub(u, V.mul(d, V.dot(u, d))));
      const q = V.add(p, V.mul(d, L3[j] * s));
      out.push(roundCone(p, q, R4[j] * s * fr, R4[j + 1] * s * fr, 0, j === 2 ? tip : skin, j === 0 ? 0.014 * s : 0.003 * s));
      if (j === 2) {
        const side = V.norm(V.cross(d, u));
        const nc = V.add(V.sub(q, V.mul(d, 0.0065 * s)), V.mul(u, R4[3] * s * fr * 0.72));
        out.push(ellB(nc, [0.0072 * s, 0.0017 * s, R4[3] * s * fr * 0.8], d, u, side, 2, nail, 0.0013 * s));
        tips.push(q);
      }
      p = q;
    }
  }
  // 手首と前腕・上腕
  const ad = V.norm(spec.arm || [-1, 0, 0]);
  const fore = (spec.fore || 0.24) * s;
  const wr = [0, 0, 0];
  const el = V.add(wr, V.mul(ad, fore));
  out.push(roundCone(V.add(wr, [0.012 * s, 0, ts * 0.007 * s]), V.add(el, [0, 0, ts * 0.006 * s]), 0.019 * s, 0.027 * s, 0, skin, 0.018 * s));
  out.push(roundCone(V.add(wr, [0.012 * s, 0, -ts * 0.008 * s]), V.add(el, [0, 0, -ts * 0.006 * s]), 0.018 * s, 0.028 * s, 0, skin, 0.018 * s));
  out.push(ellipsoid(V.add(wr, [0.004 * s, 0.0, -ts * 0.021 * s]), [0.008 * s, 0.008 * s, 0.007 * s], 0, skin, 0.01 * s)); // 尺骨の出っぱり
  const ud = V.norm(spec.upper || ad);
  const sh = V.add(el, V.mul(ud, (spec.upLen || 0.26) * s));
  out.push(roundCone(el, sh, 0.034 * s, 0.042 * s, 0, skin, 0.02 * s));
  // 袖
  const sl = spec.sleeve;
  if (sl && sl.type !== 'none') {
    const col = sl.col;
    const along = (a, b, t) => V.add(a, V.mul(V.sub(b, a), t));
    if (sl.type === 'long' || sl.type === 'rolled') {
      const c0 = along(wr, el, sl.at ?? 0.25);
      const fold = (x, y, z, t) => 0.0022 * s * Math.sin(t * 40 + Math.sin(x * 300) * 1.5) * Math.min(1, t * 6) + 0.0012 * s * Math.sin(y * 900 + z * 700);
      out.push(roundCone(c0, el, 0.033 * s, 0.043 * s, 1, col, 0.004 * s, fold));
      out.push(roundCone(el, sh, 0.044 * s, 0.05 * s, 1, col, 0.01 * s, fold));
      if (sl.type === 'rolled') {
        const r0 = along(c0, el, 0.02), r1 = along(c0, el, 0.2);
        out.push(roundCone(r0, r1, 0.038 * s, 0.040 * s, 1, sl.col2 || col, 0.004 * s, (x, y, z, t) => 0.002 * s * Math.sin(t * 25)));
      } else {
        out.push(roundCone(c0, along(c0, el, 0.05), 0.035 * s, 0.035 * s, 1, sl.col2 || col, 0.002 * s));
      }
    } else if (sl.type === 'short') {
      const c0 = along(el, sh, sl.at ?? 0.35);
      const fold = (x, y, z, t) => 0.002 * s * Math.sin(t * 30 + x * 200);
      out.push(roundCone(c0, sh, 0.047 * s, 0.055 * s, 1, col, 0.004 * s, fold));
      out.push(roundCone(c0, along(c0, sh, 0.07), 0.049 * s, 0.049 * s, 1, sl.col2 || col, 0.002 * s));
    }
  }
  return { prims: out, tips, shoulder: sh, elbow: el };
}

// ---- 後ろ姿の全身（足元が原点、+z が体の前、カメラは後ろ -z 側からではなく +z から見る想定で背中は -z）
export function bodyPrims(b) {
  const H = b.h; // 身長
  const s = H / 1.1;
  const out = [];
  const sk = b.skin, cl = b.top, bt = b.bottom, hair = b.hair, shoe = b.shoe;
  const kid = b.kid;
  const hipY = (kid ? 0.53 : 0.52) * H, kneeY = 0.28 * H, ankY = 0.05 * H;
  const legX = (kid ? 0.052 : 0.09) * s * (kid ? 1 : 0.62);
  // 脚
  for (const sx of [-1, 1]) {
    const lx = sx * (kid ? 0.055 : 0.095);
    const legR = kid ? [0.05, 0.036, 0.028] : [0.085, 0.06, 0.045];
    const legC = b.pants ? bt : sk;
    out.push(roundCone([lx, hipY, 0], [lx * 0.95, kneeY, 0.005], legR[0], legR[1], b.pants ? 5 : 0, legC, 0.02));
    out.push(roundCone([lx * 0.95, kneeY, 0.005], [lx * 0.92, ankY + 0.02, -0.005], legR[1], legR[2], b.pants ? 5 : 0, legC, 0.01));
    if (b.socks) out.push(roundCone([lx * 0.92, ankY + 0.05, -0.005], [lx * 0.92, ankY, 0.0], legR[2] + 0.003, legR[2] + 0.004, 1, b.socks, 0.005));
    // 靴
    out.push(ellipsoid([lx * 0.95, ankY * 0.55, 0.03 * s], [0.04 * s, 0.032 * s, 0.085 * s], 4, shoe, 0.012));
  }
  // 胴
  const waistY = (kid ? 0.6 : 0.6) * H, chestY = (kid ? 0.71 : 0.72) * H, shY = (kid ? 0.79 : 0.81) * H;
  const tw = kid ? 0.105 : 0.17, td = kid ? 0.075 : 0.11;
  out.push(ellipsoid([0, chestY, 0], [tw, (shY - waistY) * 0.62, td], 1, cl, 0.04, null, (x, y, z) => 0.0015 * Math.sin(y * 160 + x * 40) * (kid ? 1 : 1.3)));
  out.push(ellipsoid([0, waistY, 0], [tw * 0.92, 0.08 * s, td * 0.95], b.dress ? 1 : (b.pants ? 5 : 1), b.dress ? cl : bt, 0.04));
  if (b.dress) {
    // スカート（A ライン、すそのひだ）
    const pleat = (x, y, z) => 0.006 * Math.sin(Math.atan2(z, x) * 14) * Math.min(1, (waistY - y) / 0.15);
    out.push(roundCone([0, waistY, 0], [0, hipY - 0.17 * s, 0], 0.11 * s, 0.185 * s, 1, cl, 0.03, pleat));
  } else if (b.pants) {
    out.push(ellipsoid([0, hipY + 0.02, 0], [tw * 0.95, 0.1 * s, td], 5, bt, 0.04));
    // ベルトと裾から出たシャツ
    out.push(roundCone([0, waistY - 0.01, 0], [0, waistY + 0.02, 0], tw * 0.98, tw * 0.98, 1, cl, 0.01));
  }
  // 首・頭は別メッシュ（うなずき用）
  // 腕
  const pose = b.arms || 'down';
  for (const sx of [-1, 1]) {
    const shp = [sx * (tw + 0.01), shY - 0.02, 0];
    let el, wr;
    if (pose === 'up') { el = [sx * (tw + 0.08), shY + 0.15 * s, 0.02]; wr = [sx * (tw + 0.1), shY + 0.32 * s, 0.05]; }
    else if (pose === 'front') { el = [sx * (tw + 0.025), shY - 0.17 * s, 0.05]; wr = [sx * (tw - 0.03), shY - 0.2 * s, 0.22 * s]; }
    else { el = [sx * (tw + 0.035), shY - 0.18 * s, -0.01]; wr = [sx * (tw + 0.045), shY - 0.35 * s, 0.02]; }
    const ar = kid ? [0.034, 0.028, 0.022] : [0.05, 0.042, 0.03];
    out.push(roundCone(shp, el, ar[0], ar[1], b.longSleeve ? 1 : 0, b.longSleeve ? cl : sk, 0.02));
    out.push(roundCone(el, wr, ar[1], ar[2], b.longSleeve && !b.rolled ? 1 : 0, b.longSleeve && !b.rolled ? cl : sk, 0.01));
    // 袖
    const sl0 = shp, sl1 = [shp[0] + (el[0] - shp[0]) * 0.45, shp[1] + (el[1] - shp[1]) * 0.45, shp[2] + (el[2] - shp[2]) * 0.45];
    out.push(roundCone(sl0, sl1, ar[0] + 0.014, ar[0] + 0.012, 1, cl, 0.02, (x, y, z) => 0.002 * Math.sin(y * 200 + x * 80)));
    if (b.rolled) out.push(roundCone([el[0] * 0.98, el[1], el[2]], [el[0] + (wr[0] - el[0]) * 0.15, el[1] + (wr[1] - el[1]) * 0.15, el[2]], ar[1] + 0.012, ar[1] + 0.01, 1, cl, 0.004));
    // 手（後ろ姿なので簡略）
    const hd = V.norm(V.sub(wr, el));
    const hc = V.add(wr, V.mul(hd, 0.045 * s));
    out.push(ellipsoid(hc, [0.022 * s, 0.045 * s, 0.03 * s], 0, sk, 0.015, null));
  }
  // エプロン（後ろ：肩ひも・腰ひもとリボン、横から見える前身ごろ）
  if (b.apron) {
    const ac = b.apron;
    out.push(roundBox([0, waistY + 0.005, 0], [tw + 0.006, 0.014, td + 0.006], 0.012, 5, ac, 0.006));
    for (const sx of [-1, 1]) {
      out.push(roundCone([sx * 0.04, shY + 0.03, -td * 0.5], [sx * tw * 0.8, waistY + 0.02, -td - 0.004], 0.011, 0.011, 5, ac, 0.006));
    }
    // リボン
    const by = waistY + 0.005, bz = -td - 0.014;
    out.push(ellB([-0.03, by + 0.006, bz], [0.03, 0.017, 0.008], V.norm([1, 0.25, 0]), V.norm([-0.25, 1, 0]), [0, 0, 1], 5, ac, 0.004));
    out.push(ellB([0.03, by + 0.006, bz], [0.03, 0.017, 0.008], V.norm([1, -0.25, 0]), V.norm([0.25, 1, 0]), [0, 0, 1], 5, ac, 0.004));
    out.push(ellipsoid([0, by, bz - 0.002], [0.012, 0.012, 0.01], 5, ac, 0.004));
    out.push(roundCone([0.004, by - 0.005, bz], [0.02, by - 0.1, bz + 0.004], 0.008, 0.007, 5, ac, 0.004));
    out.push(roundCone([-0.004, by - 0.005, bz], [-0.026, by - 0.09, bz + 0.004], 0.008, 0.007, 5, ac, 0.004));
    // 前身ごろ（横からのぞく）
    out.push(roundBox([0, waistY - 0.12 * s, td + 0.012], [tw * 1.08, 0.15 * s, 0.006], 0.005, 5, ac, 0.004));
  }
  return { prims: out, neck: [0, shY + 0.02, 0], tw, td };
}

export function headPrims(b) {
  const H = b.h, kid = b.kid;
  const out = [];
  const hr = kid ? [0.082, 0.095, 0.09] : [0.078, 0.1, 0.092];
  const hc = [0, hr[1] + 0.06, 0.0];
  out.push(roundCone([0, -0.02, -0.005], [0, 0.07, 0.005], kid ? 0.03 : 0.045, kid ? 0.03 : 0.042, 0, b.skin, 0.02)); // 首
  out.push(ellipsoid(hc, hr, 0, b.skin, 0.02));
  // 耳
  for (const sx of [-1, 1]) out.push(ellipsoid([sx * hr[0] * 0.98, hc[1] - 0.005, 0.0], [0.01, 0.024, 0.016], 0, b.skin, 0.006));
  // 髪
  const strands = (x, y, z) => 0.0016 * Math.sin(Math.atan2(x, -z) * 70 + y * 20) + 0.0008 * Math.sin(Math.atan2(x, -z) * 190);
  out.push(ellipsoid([0, hc[1] + 0.012, -0.012], [hr[0] + 0.012, hr[1] + 0.01, hr[2] + 0.01], 3, b.hair, 0.01, null, strands));
  if (kid) {
    // 後頭部を覆う髪と、ふたつ結び
    out.push(ellipsoid([0, hc[1] - 0.04, -0.035], [hr[0] + 0.008, 0.07, 0.07], 3, b.hair, 0.02, null, strands));
    for (const sx of [-1, 1]) {
      const a = [sx * 0.07, hc[1] - 0.01, -0.06];
      out.push(ellipsoid(a, [0.012, 0.012, 0.012], 1, b.tie || L('#c8705a'), 0.004));
      out.push(roundCone([sx * 0.075, hc[1] - 0.015, -0.065], [sx * 0.1, hc[1] - 0.11, -0.07], 0.016, 0.006, 3, b.hair, 0.008, (x, y, z, t) => 0.0018 * Math.sin(Math.atan2(z + 0.065, x - sx * 0.08) * 12 + t * 3)));
    }
  } else if (b.longHair) {
    out.push(roundCone([0, hc[1], -0.05], [0, hc[1] - 0.2, -0.06], 0.07, 0.05, 3, b.hair, 0.04, strands));
  } else {
    out.push(ellipsoid([0, hc[1] - 0.04, -0.03], [hr[0] + 0.005, 0.06, 0.07], 3, b.hair, 0.02, null, strands));
  }
  return out;
}

// ---- 腕と手のまとまり ---------------------------------------------------
export class Arm {
  constructor(people, spec, poses) {
    this.people = people; this.spec = spec;
    this.root = new THREE.Group();
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), getPersonMaterial());
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.root.add(this.mesh);
    this.root.visible = false;
    this.geoms = {}; this.info = {};
    this.pose = null;
    for (const p of poses) this.ensure(p);
  }
  ensure(p) {
    if (this.geoms[p]) return;
    const r = handPrims(this.spec, p);
    const h = (this.spec.res || 0.0022) * this.spec.s / 0.64;
    this.geoms[p] = mesh(r.prims, Math.max(0.0016, h), { aoScale: 0.014 * this.spec.s });
    this.info[p] = r;
  }
  setPose(p) { this.ensure(p); if (this.pose !== p) { this.mesh.geometry = this.geoms[p]; this.pose = p; } }
  tip(p, i) { return new THREE.Vector3(...this.info[p].tips[i]); }
}

export class Body {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group();
    this.bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), getPersonMaterial());
    this.headMesh = new THREE.Mesh(new THREE.BufferGeometry(), getPersonMaterial());
    for (const m of [this.bodyMesh, this.headMesh]) { m.castShadow = true; m.receiveShadow = true; }
    this.root.add(this.bodyMesh);
    this.headPivot = new THREE.Group(); this.root.add(this.headPivot); this.headPivot.add(this.headMesh);
    this.variants = {};
    this.cur = null;
  }
  variant(name, over) {
    if (!this.variants[name]) {
      const b = Object.assign({}, this.spec, over);
      const r = bodyPrims(b);
      const res = b.kid ? 0.007 : 0.009;
      this.variants[name] = { geo: mesh(r.prims, res, { aoScale: 0.03 }), neck: r.neck };
      if (!this.headGeo) { this.headGeo = mesh(headPrims(b), b.kid ? 0.004 : 0.005, { aoScale: 0.02 }); this.headMesh.geometry = this.headGeo; }
    }
    return this.variants[name];
  }
  use(name, over = {}) {
    const v = this.variant(name, over);
    this.bodyMesh.geometry = v.geo;
    this.headPivot.position.set(...v.neck);
    this.cur = name;
  }
}

// ---- 人の管理 ------------------------------------------------------------
export const SKIN = { girl: L('#e8c0a0'), girlTip: L('#e7ad98'), papa: L('#cf9f7c'), papaTip: L('#c98c74'), mama: L('#eec7aa'), mamaTip: L('#e8b3a0'), kid2: L('#d8a882'), kid2Tip: L('#d0937c') };
export class People {
  constructor(world) {
    this.world = world;
    this.list = [];
  }
  makeArm(spec, poses = []) { const a = new Arm(this, spec, poses); this.world.scene.add(a.root); this.list.push(a); return a; }
  update(dt) { }
}
export { L as lin };
