// 果物の定義：外形（星形関数）・皮・中身（立体テクスチャ）・付属物（へた・冠芽・りん片）
import * as THREE from '../lib/three.module.min.js';
import { PieceData } from './slice.js';
import { COMMON } from './glsl.js';
import { tex } from './tex.js';

const TAU = Math.PI * 2;
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// --- 形（同次1次の関数 N(p)=1 が表面） ---------------------------------
const SHAPES = {
  ellip: (R) => (x, y, z) => Math.hypot(x / R[0], y / R[1], z / R[2]),
  barrel: (R, k) => (x, y, z) => { const r = Math.hypot(x / R[0], z / R[2]); return Math.pow(Math.pow(r, k) + Math.pow(Math.abs(y / R[1]), k), 1 / k); },
  star: (a, b, k) => (x, y, z) => {
    const r = Math.hypot(x, z), ph = Math.atan2(z, x);
    const s = starS(ph);
    return Math.pow(Math.pow(r / (a * s), k) + Math.pow(Math.abs(y / b), k), 1 / k);
  },
};
function starS(ph) { const c = 0.5 + 0.5 * Math.cos(5 * ph); return 0.6 + 0.4 * Math.pow(c, 1.4); }
const STAR_GLSL = `float starS(float ph){ float c = 0.5+0.5*cos(5.0*ph); return 0.6 + 0.4*pow(c,1.4); }`;

// --- 中身（断面）GLSL ---------------------------------------------------
// 入力 p: 果物座標（m） 出力: col(線形), rough, h(高さ m), coat(つや 0-1)
const FLESH = {
  watermelon: `
    vec3 q = p / uR; float r = length(q); float dp = 1.0 - r;
    vec3 wc; vec4 w = worley(p*400.0, wc);
    float n1 = fbm3(p*60.0); float n2 = vn(p*2200.0);
    float cell = clamp(1.0 - w.x*1.1, 0.0, 1.0);
    vec3 red = mix(s2l(vec3(0.74,0.06,0.09)), s2l(vec3(0.92,0.24,0.24)), clamp(w.z*0.5 + cell*0.4 + n1*0.4 - 0.25, 0.0, 1.0));
    red *= mix(0.86, 1.0, smoothstep(0.0, 0.12, w.y - w.x));
    red = mix(red, s2l(vec3(0.96,0.46,0.42)), smoothstep(0.55,0.84,r)*0.4);
    col = red; rough = 0.1 + (1.0-cell)*0.3; h = cell*cell*0.00035 + n2*0.00008; coat = 0.55; glow = 0.08 + 0.12*cell;
    float tr = smoothstep(0.085, 0.13, dp + n1*0.012);
    vec3 rind = mix(s2l(vec3(0.62,0.78,0.45)), s2l(vec3(0.93,0.95,0.80)), smoothstep(0.018,0.07,dp));
    col = mix(rind, col, tr); rough = mix(0.45, rough, tr); h = mix(fbm3(p*300.0)*0.0002, h, tr); coat *= tr; glow *= tr;
    col = mix(col, s2l(vec3(0.97,0.70,0.62)), smoothstep(0.08,0.11,dp)*(1.0-smoothstep(0.11,0.14,dp))*0.6);
    col = mix(s2l(vec3(0.16,0.32,0.13)), col, smoothstep(0.006,0.016,dp));
    // 種：ふたつの殻にならぶ黒い涙形
    for(int k=0;k<2;k++){
      float ph = atan(q.z, q.x); float th = acos(clamp(q.y/max(r,1e-4),-1.0,1.0));
      float NP = 36.0 - float(k)*8.0, NT = 16.0 - float(k)*4.0;
      float ip = floor(ph/6.2832*NP + float(k)*0.5), it = floor(th/3.1416*NT);
      vec3 hs = h33(vec3(ip, it, 5.0+float(k)*9.0));
      if(hs.x > 0.08 && it > 0.0 && it < NT-1.0){
        float pc = (ip - float(k)*0.5 + 0.5 + (hs.y-0.5)*0.4)/NP*6.2832, tc = (it + 0.5 + (hs.z-0.5)*0.4)/NT*3.1416;
        float rs = (k==0 ? 0.66 : 0.46) + hs.x*0.08;
        vec3 er = vec3(sin(tc)*cos(pc), cos(tc), sin(tc)*sin(pc));
        vec3 c = er * rs * uR;
        vec3 ep = normalize(vec3(-sin(pc), 0.0, cos(pc)));
        vec3 et = cross(ep, er);
        vec3 d = p - c;
        float lx = dot(d, er)/0.0046, ly = dot(d, ep)/0.0029, lz = dot(d, et)/0.0022;
        ly /= (1.0 - 0.35*clamp(lx,-1.0,1.0));
        float sd = length(vec3(lx,ly,lz));
        float white = step(0.85, hs.y);
        float m = 1.0 - smoothstep(0.82, 1.0, sd);
        vec3 sc = white > 0.5 ? s2l(vec3(0.92,0.86,0.74)) : mix(s2l(vec3(0.06,0.04,0.03)), s2l(vec3(0.32,0.20,0.12)), smoothstep(0.55,0.95,sd));
        col = mix(col, sc, m); rough = mix(rough, 0.2, m); h += m*sqrt(max(0.0,1.0-sd*sd))*0.0008; glow *= 1.0-m;
      }
    }`,
  kiwi: `
    vec3 q = p / uR; float r = length(q); float dp = 1.0 - r;
    float rho = length(q.xz); float y = q.y; float ph = atan(q.z, q.x);
    float n1 = fbm3(p*400.0);
    vec3 g1 = s2l(vec3(0.32,0.54,0.06)), g2 = s2l(vec3(0.50,0.70,0.16));
    vec3 col0 = mix(g1, g2, clamp(n1*0.8 + (1.0-rho)*0.3, 0.0, 1.0));
    // 放射状の筋
    float st = abs(fract(ph/6.2832*34.0 + fbm3(p*120.0)*0.8) - 0.5);
    float streak = smoothstep(0.08, 0.0, st) * smoothstep(0.32, 0.6, rho);
    col0 = mix(col0, s2l(vec3(0.76,0.86,0.50)), streak*0.5);
    float coreR = 0.17*(1.0 - y*y*0.5) + fbm3(p*200.0)*0.025;
    float core = smoothstep(coreR+0.02, coreR-0.02, rho);
    vec3 coreC = mix(s2l(vec3(0.84,0.86,0.58)), s2l(vec3(0.93,0.92,0.72)), vn(vec3(ph*8.0, y*60.0, rho*20.0)));
    col = mix(col0, coreC, core);
    // 種の輪をとりまく明るい部分
    float ring = smoothstep(0.06, 0.0, abs(rho - (coreR+0.1)));
    col = mix(col, s2l(vec3(0.62,0.80,0.28)), ring*0.6*(1.0-core));
    rough = 0.2 + core*0.25; coat = 1.0 - core*0.5; h = n1*0.00012 + streak*0.00008;
    // 種：二重の輪
    for(int k=0;k<2;k++){
      float NP = 80.0 + float(k)*12.0, NY = 30.0;
      float off = float(k)*0.5;
      float ip = floor(ph/6.2832*NP + off), iy = floor((y*0.5+0.5)*NY);
      vec3 hs = h33(vec3(ip, iy, 11.0+float(k)));
      if(hs.x > 0.25){
        float pc = (ip + 0.5 - off + (hs.y-0.5)*0.5)/NP*6.2832;
        float yc = ((iy + 0.5 + (hs.z-0.5)*0.5)/NY)*2.0-1.0;
        float cr = 0.17*(1.0-yc*yc*0.5) + 0.07 + hs.x*0.06 + float(k)*0.035;
        vec3 c = vec3(cos(pc)*cr, yc, sin(pc)*cr) * uR;
        vec3 er = normalize(vec3(cos(pc),0.0,sin(pc)));
        vec3 ep = vec3(-er.z, 0.0, er.x);
        vec3 d = p - c;
        float sd = length(vec3(dot(d,er)/0.0012, dot(d,ep)/0.0008, d.y/0.0008));
        float m = 1.0 - smoothstep(0.75, 1.0, sd);
        col = mix(col, s2l(vec3(0.06,0.05,0.04)), m); rough = mix(rough, 0.2, m); h += m*0.0003;
      }
    }
    col = mix(s2l(vec3(0.42,0.30,0.16)), col, smoothstep(0.012, 0.03, dp));
    col = mix(col, s2l(vec3(0.50,0.68,0.20)), smoothstep(0.08,0.03,dp)*smoothstep(0.02,0.03,dp)*0.5);`,
  orange: `
    vec3 q = p / uR; float r = length(q); float dp = 1.0 - r;
    float rho = length(q.xz); float y = q.y; float ph = atan(q.z, q.x);
    float NS = 10.0;
    float sa = ph/6.2832*NS + 0.05*sin(y*5.0+ph*2.0) + 0.03*sin(rho*9.0);
    float sf = fract(sa); float dB = min(sf, 1.0-sf) * (6.2832/NS) * max(rho, 0.02);
    float rm = max(rho*uR.x, 0.0005);
    vec3 lp = vec3(rm/0.0058, (ph*rm)/0.0019, p.y/0.0027);
    vec3 wc; vec4 w = worley(lp, wc);
    float cell = clamp(1.0 - w.x*1.3, 0.0, 1.0);
    float edge = smoothstep(0.0, 0.2, w.y - w.x);
    vec3 o1 = s2l(vec3(0.90,0.40,0.03)), o2 = s2l(vec3(1.0,0.64,0.16));
    col = mix(o1, o2, clamp(cell*0.85 + w.z*0.25, 0.0, 1.0)) * mix(0.62, 1.0, edge);
    rough = 0.06 + (1.0-cell)*0.3; coat = 1.0; h = cell*cell*0.0006; glow = 0.06 + 0.22*cell;
    float mem = smoothstep(0.013, 0.004, dB);
    col = mix(col, s2l(vec3(0.99,0.84,0.58)), mem*0.8); h += mem*0.0002; rough = mix(rough, 0.4, mem); glow *= 1.0 - mem*0.6;
    float core = smoothstep(0.1, 0.055, rho + vn(p*900.0)*0.02);
    vec3 pith = mix(s2l(vec3(0.95,0.89,0.74)), s2l(vec3(0.99,0.95,0.86)), vn(p*1500.0));
    col = mix(col, pith, core); rough = mix(rough, 0.7, core); coat *= 1.0-core; glow *= 1.0-core;
    float pz = smoothstep(0.075, 0.09, dp + vn(p*800.0)*0.01);
    col = mix(pith, col, pz); rough = mix(0.75, rough, pz); coat *= pz; h = mix(vn(p*2500.0)*0.00015, h, pz); glow *= pz;
    col = mix(s2l(vec3(0.86,0.42,0.05)), col, smoothstep(0.018, 0.03, dp));`,
  dragon: `
    vec3 q = p / uR; float r = length(q); float dp = 1.0 - r;
    float n1 = fbm3(p*220.0); float n2 = vn(p*1400.0);
    vec3 wc0; vec4 jw = worley(p*850.0, wc0);
    col = mix(s2l(vec3(0.86,0.85,0.82)), s2l(vec3(0.97,0.96,0.93)), clamp(n1*0.9 + 0.1, 0.0, 1.0));
    col *= mix(0.9, 1.0, smoothstep(0.0, 0.25, jw.y - jw.x));
    rough = 0.16 + n2*0.15; coat = 0.9; h = (1.0 - jw.x)*0.00012 + n2*0.00005; glow = 0.05;
    vec3 wc; vec4 w = worley(p*360.0, wc);
    float has = step(0.12, w.z);
    float seedR = 0.13 + w.z*0.07;
    float m = (1.0 - smoothstep(seedR*0.7, seedR, w.x)) * has;
    float halo = (1.0 - smoothstep(seedR, seedR*2.6, w.x)) * has;
    col = mix(col, s2l(vec3(0.70,0.70,0.68)), halo*0.35);
    col = mix(col, s2l(vec3(0.04,0.035,0.03)), m); rough = mix(rough, 0.12, m); h += m*0.0002;
    float sk = smoothstep(0.045, 0.012, dp);
    col = mix(col, mix(s2l(vec3(0.94,0.62,0.74)), s2l(vec3(0.70,0.08,0.32)), smoothstep(0.03,0.006,dp)), sk);
    rough = mix(rough, 0.45, sk); coat *= 1.0-sk;`,
  pomegranate: `
    vec3 q = p / uR; float r = length(q); float dp = 1.0 - r;
    vec3 wc; vec4 w = worley(p*155.0, wc);
    float edge = w.y - w.x;
    float dome = clamp(1.0 - w.x*w.x*1.4, 0.0, 1.0);
    vec3 a1 = s2l(vec3(0.36,0.0,0.04)), a2 = s2l(vec3(0.82,0.08,0.16));
    col = mix(a1, a2, clamp(dome*0.9 + w.z*0.25 - 0.15, 0.0, 1.0));
    col = mix(s2l(vec3(0.16,0.0,0.03)), col, smoothstep(0.0, 0.06, edge));
    float sd = length(p*155.0 - wc);
    col = mix(col, s2l(vec3(0.92,0.70,0.70)), (1.0-smoothstep(0.1,0.2,sd))*0.35*step(0.3,w.z));
    rough = 0.05 + (1.0-dome)*0.25; coat = 1.0; h = dome*0.0014; glow = 0.32*dome;
    float memb = 1.0;
    for(int i=0;i<2;i++){
      vec3 nn = normalize(h33(vec3(float(i),2.0,7.0))-0.5);
      float dd = abs(dot(q, nn) + (vn(p*80.0+float(i))-0.5)*0.15);
      memb = min(memb, dd);
    }
    float mb = smoothstep(0.011, 0.004, memb);
    vec3 mc = mix(s2l(vec3(0.90,0.78,0.50)), s2l(vec3(0.97,0.90,0.68)), vn(p*1200.0));
    col = mix(col, mc, mb); rough = mix(rough, 0.6, mb); h = mix(h, vn(p*1500.0)*0.0002, mb); coat *= 1.0-mb; glow *= 1.0-mb;
    float pz = smoothstep(0.09, 0.12, dp + vn(p*500.0)*0.02);
    col = mix(mc, col, pz); rough = mix(0.7, rough, pz); coat *= pz; h = mix(vn(p*1500.0)*0.0002, h, pz); glow *= pz;
    col = mix(s2l(vec3(0.50,0.08,0.08)), col, smoothstep(0.02,0.035,dp));`,
  pineapple: `
    vec3 q = p / uR; float rho = length(q.xz); float y = q.y; float ph = atan(q.z, q.x);
    float nn = pow(pow(rho,3.0)+pow(abs(y),3.0), 1.0/3.0); float dp = 1.0 - nn;
    float fib = vn(vec3(ph*34.0, y*90.0, rho*3.0)); fib = fib*fib*(3.0-2.0*fib);
    float fib2 = vn(vec3(ph*120.0, y*260.0, rho*6.0));
    vec3 wc0; vec4 jw = worley(p*500.0, wc0);
    float cell = clamp(1.0 - jw.x*1.2, 0.0, 1.0);
    col = mix(s2l(vec3(0.90,0.60,0.08)), s2l(vec3(1.0,0.84,0.34)), clamp(fib*0.8 + fib2*0.3 + cell*0.25 - 0.15, 0.0, 1.0));
    rough = 0.12 + (1.0-cell)*0.2; coat = 0.6; h = (fib*0.4+fib2*0.3)*0.00025 + cell*0.0002;
    float core = smoothstep(0.2, 0.15, rho + fib*0.02);
    vec3 cc = mix(s2l(vec3(0.94,0.80,0.40)), s2l(vec3(0.98,0.88,0.55)), vn(vec3(ph*20.0, y*200.0, rho*40.0)));
    col = mix(col, cc, core*0.85); rough = mix(rough, 0.35, core); coat *= 1.0 - core*0.5; glow *= 1.0 - core*0.5;
    vec3 wc; vec4 w = worley(vec3(ph*5.5, y*13.0, 0.0), wc);
    float pit = (1.0 - smoothstep(0.18, 0.32, w.x)) * smoothstep(0.13, 0.06, dp) * smoothstep(0.03, 0.05, dp);
    col = mix(col, s2l(vec3(0.55,0.38,0.15)), pit*0.9); h -= pit*0.0005;
    col = mix(col, s2l(vec3(0.88,0.72,0.30)), smoothstep(0.10, 0.04, dp)*0.4);
    col = mix(s2l(vec3(0.50,0.36,0.14)), col, smoothstep(0.03, 0.045, dp));`,
  star: `
    float rho = length(p.xz); float ph = atan(p.z, p.x); float y = p.y;
    float s = starS(ph);
    float nn = pow(pow(rho/(uR.x*s),2.5)+pow(abs(y/uR.y),2.5), 1.0/2.5); float dp = 1.0 - nn;
    float n1 = fbm3(p*300.0);
    col = mix(s2l(vec3(0.90,0.76,0.22)), s2l(vec3(0.98,0.88,0.42)), clamp(n1 + (1.0-nn)*0.3, 0.0, 1.0));
    rough = 0.16; coat = 1.0; h = n1*0.0002;
    // 稜へのびる筋（星の芯）
    float la = ph/6.2832*5.0; float fl = abs(fract(la+0.5)-0.5);
    float line = smoothstep(0.03, 0.0, fl*rho/uR.x) * smoothstep(0.85, 0.3, rho/(uR.x*s));
    col = mix(col, s2l(vec3(0.99,0.93,0.66)), line*0.7); h += line*0.0002;
    float core = smoothstep(0.12, 0.07, rho/uR.x);
    col = mix(col, s2l(vec3(0.97,0.93,0.72)), core*0.7);
    // 種
    float ip = floor(la+0.5);
    vec3 hs = h33(vec3(ip, 3.0, 1.0));
    float pc = ip/5.0*6.2832;
    vec3 er = vec3(cos(pc),0.0,sin(pc));
    vec3 c = er * uR.x * 0.36 + vec3(0.0, (hs.y-0.5)*0.02, 0.0);
    vec3 d = p - c; vec3 ep = vec3(-er.z,0.0,er.x);
    float sd = length(vec3(dot(d,er)/0.0035, d.y/0.006, dot(d,ep)/0.0016));
    float m = (1.0 - smoothstep(0.8, 1.0, sd)) * step(0.3, hs.x);
    col = mix(col, s2l(vec3(0.55,0.40,0.20)), m); h += m*0.0004;
    col = mix(col, s2l(vec3(0.80,0.78,0.30)), smoothstep(0.08, 0.03, dp)*0.35);
    col = mix(s2l(vec3(0.78,0.68,0.20)), col, smoothstep(0.01, 0.025, dp));`,
};

const GLOW = { watermelon: 0.16, kiwi: 0.13, pineapple: 0.2, star: 0.24 };
// --- 果物の表 ---------------------------------------------------------
// cat: 断面の色（風船の色） 0赤 1橙 2黄 3緑 4白
export const FRUITS = {
  watermelon: { R: [0.105, 0.098, 0.105], shape: 'ellip', skin: 'skin_watermelon', rough: 0.42, cat: 0, juice: [0.78, 0.12, 0.16], seg: [72, 48], bumpAmp: 0.008, lie: true },
  orange: { R: [0.040, 0.037, 0.040], shape: 'ellip', skin: 'skin_orange', rough: 0.45, cat: 1, juice: [0.98, 0.55, 0.08], seg: [56, 36], bumpAmp: 0.008, lie: true },
  kiwi: { R: [0.027, 0.036, 0.025], shape: 'ellip', skin: 'skin_kiwi', rough: 0.9, sheen: 1, cat: 3, juice: [0.48, 0.65, 0.15], seg: [48, 32], bumpAmp: 0.006, lie: true },
  dragon: { R: [0.046, 0.058, 0.044], shape: 'ellip', skin: 'skin_dragon', rough: 0.42, cat: 4, juice: [0.92, 0.88, 0.86], seg: [56, 36], bumpAmp: 0.01, lie: true },
  pomegranate: { R: [0.046, 0.042, 0.046], shape: 'ellip', skin: 'skin_pomegranate', rough: 0.5, cat: 0, juice: [0.55, 0.03, 0.10], seg: [56, 36], bumpAmp: 0.015, lie: false },
  pineapple: { R: [0.063, 0.098, 0.063], shape: 'barrel', k: 3, skin: 'skin_pineapple', rough: 0.6, cat: 2, juice: [0.95, 0.78, 0.20], seg: [64, 48], bumpAmp: 0.008, lie: true },
  star: { R: [0.034, 0.055, 0.034], shape: 'star', k: 2.5, skin: 'skin_star', rough: 0.36, cat: 2, juice: [0.92, 0.85, 0.35], seg: [80, 40], bumpAmp: 0.004, lie: true },
};
export const FRUIT_KEYS = ['watermelon', 'orange', 'kiwi', 'dragon', 'pomegranate', 'pineapple', 'star'];
export const CAT_COLORS = [[0.80, 0.13, 0.15], [0.96, 0.55, 0.12], [0.96, 0.80, 0.25], [0.45, 0.66, 0.15], [0.95, 0.94, 0.90]];

function shapeFn(f) {
  if (f.shape === 'ellip') return SHAPES.ellip(f.R);
  if (f.shape === 'barrel') return SHAPES.barrel(f.R, f.k);
  return SHAPES.star(f.R[0], f.R[1], f.k);
}

// 丸ごとの形を三角形の羅列で作る
export function buildWhole(key, seed) {
  const f = FRUITS[key];
  const N0 = shapeFn(f);
  const r = rnd(seed * 7919 + 13);
  const waves = [];
  for (let i = 0; i < 5; i++) waves.push([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * TAU, 1 + r() * 2.5]);
  const N = (x, y, z) => {
    const l = Math.hypot(x, y, z) || 1;
    let w = 0; for (const v of waves) w += Math.sin((x * v[0] + y * v[1] + z * v[2]) / l * v[4] + v[3]);
    return N0(x, y, z) * (1 + f.bumpAmp * w / 5 * 2);
  };
  const [nu, nv] = f.seg;
  const P = [], NN = [], UV = [];
  const grid = [];
  for (let j = 0; j <= nv; j++) {
    const th = j / nv * Math.PI;
    for (let i = 0; i <= nu; i++) {
      const ph = i / nu * TAU;
      const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      const rr = 1 / N(d[0], d[1], d[2]);
      const p = [d[0] * rr, d[1] * rr, d[2] * rr];
      const e = 1e-4;
      let g = [N(p[0] + e, p[1], p[2]) - N(p[0] - e, p[1], p[2]), N(p[0], p[1] + e, p[2]) - N(p[0], p[1] - e, p[2]), N(p[0], p[1], p[2] + e) - N(p[0], p[1], p[2] - e)];
      const gl = Math.hypot(g[0], g[1], g[2]) || 1; g = g.map(x => x / gl);
      grid.push({ p, n: g, t: [i / nu, 1 - j / nv] });
    }
  }
  const at = (i, j) => grid[j * (nu + 1) + i];
  const tri = (a, b, c) => { for (const v of [a, b, c]) { P.push(...v.p); NN.push(...v.n); UV.push(...v.t); } };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    if (j !== 0) tri(a, b, c);
    if (j !== nv - 1) tri(b, d, c);
  }
  const data = new PieceData(new Float32Array(P), new Float32Array(NN), new Float32Array(UV), new Uint8Array(P.length / 9));
  if (data.massProps().volume && signedVol(data) < 0) flip(data);
  return data;
}
function signedVol(d) { const p = d.pos; let V = 0; for (let i = 0; i < p.length; i += 9) V += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]); return V; }
function flip(d) {
  for (let t = 0; t < d.mat.length; t++) {
    for (const [arr, s] of [[d.pos, 3], [d.nrm, 3], [d.uv, 2]]) {
      const o = t * 3 * s;
      for (let k = 0; k < s; k++) { const a = arr[o + s + k]; arr[o + s + k] = arr[o + 2 * s + k]; arr[o + 2 * s + k] = a; }
    }
  }
}

// --- 材質 ---------------------------------------------------------------
const matCache = {};
export function fruitMaterials(key) {
  if (matCache[key]) return matCache[key];
  const f = FRUITS[key];
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  skin.roughness = 1;
  tex(f.skin + '_c', true, (t) => { skin.map = t; skin.needsUpdate = true; }, { color: avgSkin(key) });
  tex(f.skin + '_n', false, (t) => { skin.normalMap = t; skin.normalScale.set(1, 1); skin.needsUpdate = true; });
  tex(f.skin + '_m', false, (t) => { skin.roughnessMap = t; skin.aoMap = null; skin.needsUpdate = true; });
  skin.roughness = f.rough / 0.5; // ORM の G が0.4〜0.9程度なので補正
  skin.roughness = 1.0;
  if (f.sheen) { skin.sheen = 1; skin.sheenRoughness = 0.6; skin.sheenColor = new THREE.Color(0.55, 0.42, 0.28); }
  if (key === 'watermelon' || key === 'star' || key === 'dragon') { skin.clearcoat = 0.35; skin.clearcoatRoughness = 0.35; }
  if (key === 'orange') { skin.clearcoat = 0.25; skin.clearcoatRoughness = 0.3; }
  skin.side = THREE.FrontSide;

  const flesh = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.05, sheen: 0.25, sheenRoughness: 0.4 });
  flesh.sheenColor = new THREE.Color(...f.juice).multiplyScalar(0.6);
  flesh.userData.uR = { value: new THREE.Vector3(...f.R) };
  flesh.userData.uWet = { value: 1 };
  flesh.onBeforeCompile = (sh) => {
    sh.uniforms.uR = flesh.userData.uR;
    sh.uniforms.uWet = flesh.userData.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform vec3 uR;\nuniform float uWet;\n' + COMMON + STAR_GLSL +
        '\nvoid fleshF(vec3 p, out vec3 col, out float rough, out float h, out float coat, out float glow){\nglow = ' + (GLOW[key] || 0.12).toFixed(3) + ';\n' + FLESH[key] + '\n}\n')
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec3 fCol; float fR; float fH; float fC; float fG; fleshF(vObj, fCol, fR, fH, fC, fG); diffuseColor.rgb = fCol;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fR;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = bumpN(normal, fH, -vViewPosition, faceDirection);')
      .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\nclearcoatNormal = normal;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= fC * uWet;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fCol * fG;');
  };
  flesh.customProgramCacheKey = () => 'flesh-' + key;
  matCache[key] = { skin, flesh, acc: accMaterial(key) };
  return matCache[key];
}
function avgSkin(key) {
  return { watermelon: '#3f6a2c', orange: '#e48420', kiwi: '#7a5530', dragon: '#c33a70', pomegranate: '#962a24', pineapple: '#a87a2c', star: '#cfb444' }[key];
}

// 付属物（冠芽・がく・りん片）の材質
const accMats = {};
function accMaterial(key) {
  if (key === 'pineapple') {
    if (!accMats.leaf) {
      const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, sheen: 0.3, sheenColor: new THREE.Color(0.6, 0.7, 0.6) });
      tex('leaf_c', true, t => { m.map = t; m.needsUpdate = true; }, { color: '#5e7a44' });
      tex('leaf_n', false, t => { m.normalMap = t; m.needsUpdate = true; });
      tex('leaf_m', false, t => { m.roughnessMap = t; m.needsUpdate = true; });
      accMats.leaf = m;
    }
    return accMats.leaf;
  }
  if (key === 'dragon') {
    if (!accMats.bract) accMats.bract = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    return accMats.bract;
  }
  if (!accMats.stem) accMats.stem = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  return accMats.stem;
}

// 葉：根元→先 に細くなる帯。V字に折れ、反る
function leafGeom(len, wid, bend, fold, colA, colB, segL = 8) {
  const P = [], C = [], U = [], I = [];
  for (let j = 0; j <= segL; j++) {
    const t = j / segL;
    const w = wid * Math.pow(1 - t, 0.9) * (t < 0.08 ? 0.6 + t * 5 : 1);
    const ang = bend * t * t;
    const y = Math.sin(ang) * len * t * 0 + len * t * Math.cos(ang * 0.5);
    const z = -len * t * Math.sin(ang * 0.5) * 1.0;
    for (let i = 0; i <= 2; i++) {
      const s = i - 1;
      P.push(s * w, y, z + Math.abs(s) * w * fold);
      const c = new THREE.Color().copy(colA).lerp(colB, Math.pow(t, 1.6));
      C.push(c.r, c.g, c.b);
      U.push(i / 2, t);
    }
  }
  for (let j = 0; j < segL; j++) for (let i = 0; i < 2; i++) {
    const a = j * 3 + i, b = a + 1, c = a + 3, d = a + 4;
    I.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

// 付属物を作る：[{mesh, anchor:[x,y,z]}]（果物座標）
export function buildAccessories(key, seed) {
  const f = FRUITS[key];
  const r = rnd(seed * 31 + 7);
  const mat = accMaterial(key);
  const out = [];
  const N = shapeFn(f);
  const surf = (th, ph) => { const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; const rr = 1 / N(...d); return new THREE.Vector3(d[0] * rr, d[1] * rr, d[2] * rr); };
  if (key === 'pineapple') {
    const top = surf(0, 0);
    const n = 34;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const len = 0.05 + (1 - t) * 0.0 + Math.sin(t * Math.PI) * 0.09 + r() * 0.02;
      const g = leafGeom(len, 0.014 + r() * 0.005, 0.6 + (1 - t) * 1.6 + r() * 0.4, 0.5, new THREE.Color('#7a9670'), new THREE.Color('#a8a884'));
      const m = new THREE.Mesh(g, mat);
      const ph = i * 2.39996 + r() * 0.2;
      m.position.set(top.x + Math.cos(ph) * 0.006 * (1 - t), top.y - 0.012 + t * 0.012, top.z + Math.sin(ph) * 0.006 * (1 - t));
      m.rotation.set(0, -ph + Math.PI / 2, 0, 'YXZ');
      m.rotateX(-(0.15 + (1 - t) * 0.9));
      m.castShadow = true;
      out.push({ mesh: m, anchor: [0, top.y * 0.9, 0] });
    }
  } else if (key === 'dragon') {
    for (let i = 0; i < 26; i++) {
      const th = 0.25 + (i / 26) * 2.4 + r() * 0.1;
      const ph = i * 2.39996;
      const p = surf(th, ph);
      const g = leafGeom(0.022 + r() * 0.012, 0.009 + r() * 0.003, 0.9 + r() * 0.5, 0.25, new THREE.Color('#c23a72'), new THREE.Color('#9aa84a'));
      const m = new THREE.Mesh(g, mat);
      m.position.copy(p).multiplyScalar(0.97);
      // 表面にそって上向きに寝かせる
      const nrm = p.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const tang = up.clone().sub(nrm.clone().multiplyScalar(up.dot(nrm))).normalize();
      if (tang.lengthSq() < 0.1) tang.set(1, 0, 0);
      const side = new THREE.Vector3().crossVectors(tang, nrm);
      const mtx = new THREE.Matrix4().makeBasis(side, tang, nrm.clone().negate());
      m.quaternion.setFromRotationMatrix(mtx);
      m.rotateX(-0.25 - r() * 0.2);
      m.castShadow = true;
      out.push({ mesh: m, anchor: [p.x * 0.9, p.y * 0.9, p.z * 0.9] });
    }
    const top = surf(0, 0);
    const g = leafGeom(0.012, 0.006, 1.2, 0.3, new THREE.Color('#9a4a3a'), new THREE.Color('#5a6a2a'));
    const m = new THREE.Mesh(g, mat); m.position.copy(top).multiplyScalar(0.98); out.push({ mesh: m, anchor: [0, top.y * 0.9, 0] });
  } else if (key === 'pomegranate') {
    const top = surf(0, 0);
    const grp = new THREE.Group();
    const tube = new THREE.CylinderGeometry(0.009, 0.012, 0.014, 18, 1, true);
    const cc = []; for (let i = 0; i < tube.attributes.position.count; i++) { cc.push(0.55, 0.16, 0.12); }
    tube.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    const tm = new THREE.Mesh(tube, mat); tm.position.y = 0.006; grp.add(tm);
    for (let i = 0; i < 6; i++) {
      const g = leafGeom(0.011, 0.005, -1.4, 0.2, new THREE.Color('#8e2a20'), new THREE.Color('#c08a5a'), 5);
      const m = new THREE.Mesh(g, mat);
      const ph = i / 6 * TAU;
      m.position.set(Math.cos(ph) * 0.009, 0.012, Math.sin(ph) * 0.009);
      m.rotation.set(0, -ph + Math.PI / 2, 0, 'YXZ'); m.rotateX(-0.5);
      grp.add(m);
    }
    grp.position.copy(top).multiplyScalar(0.96);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    out.push({ mesh: grp, anchor: [0, top.y * 0.9, 0] });
  } else if (key === 'orange' || key === 'watermelon' || key === 'kiwi' || key === 'star') {
    const top = surf(0, 0);
    const grp = new THREE.Group();
    const col = key === 'kiwi' ? [0.32, 0.22, 0.12] : key === 'star' ? [0.45, 0.35, 0.15] : [0.36, 0.42, 0.16];
    const rad = key === 'watermelon' ? 0.004 : 0.0022;
    const st = new THREE.CylinderGeometry(rad * 0.8, rad, key === 'watermelon' ? 0.018 : 0.006, 10);
    const cc = []; for (let i = 0; i < st.attributes.position.count; i++) cc.push(...col);
    st.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    const sm = new THREE.Mesh(st, mat); sm.position.y = key === 'watermelon' ? 0.007 : 0.002;
    if (key === 'watermelon') sm.rotation.z = 0.4;
    grp.add(sm);
    if (key === 'orange') {
      for (let i = 0; i < 5; i++) {
        const g = leafGeom(0.006, 0.0035, -1.5, 0.1, new THREE.Color('#5a6a24'), new THREE.Color('#7a8a34'), 3);
        const m = new THREE.Mesh(g, mat); const ph = i / 5 * TAU;
        m.rotation.set(0, -ph + Math.PI / 2, 0, 'YXZ'); m.rotateX(-1.3); grp.add(m);
      }
    }
    grp.position.copy(top).multiplyScalar(0.995);
    out.push({ mesh: grp, anchor: [0, top.y * 0.9, 0] });
  }
  return out;
}
