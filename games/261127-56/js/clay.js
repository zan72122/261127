// 粘土のシミュレーション：断面 (r, y) の密度の格子を指で押しのけ、回転体のメッシュにする。
// 指が触れた所に、回転に合わせて螺旋の指跡（溝）・水のつや・どろ（スリップ）が描き込まれる。
import * as THREE from 'three';
import { tex } from './assets.js';

const K = 84, DY = 0.0029;            // 高さ方向 84 段（約 24cm）
const TMIN = 0.0048;                 // 壁の最小の厚み
const RMAX = 0.152, HMAX = 0.235, FLOOR = 0.0085;
const M = 150, S = 96;               // 断面の点数・周方向の分割
export const SMAX = 0.6;             // UV の v は断面の弧長 / SMAX
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));

// 器の形＝外側の半径 Ro(y)・内側の半径 Ri(y)・高さ H・底の高さ yF。
// 指が当たった高さ・向き・長さ・動かし方で少しずつ変わり、体積（土の量）は保たれる。
export class Clay {
  constructor() {
    this.Ro = new Float32Array(K); this.Ri = new Float32Array(K);
    this.H = 0.088; this.open = false; this.yF = 0;
    this.prof = new Float32Array(M * 2);   // r, y
    this.profN = new Float32Array(M * 2);  // 法線
    this.profS = new Float32Array(M);      // 弧長
    this.profZ = new Uint8Array(M);        // 0 外 1 口縁 2 内 3 底 4 上（閉じた頭）
    this.lumpy = 1; this.offCenter = 0.005; this.slump = 0; this.slumpDir = 0;
    this.V0 = 0;
    this.buildGeometry();
    this.buildMaps();
    this.material = makePotMaterial(this);
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.resetLump(1);
  }
  yk(k) { return (k + 0.5) * DY; }
  domeR(y, R0, H0) { const t = Math.min(1, y / H0); return R0 * Math.sqrt(Math.max(0, 1 - t * t)) * (1.05 - 0.1 * t); }
  setDome(R0, H0) {
    for (let k = 0; k < K; k++) { this.Ro[k] = this.domeR(this.yk(k), R0, H0); this.Ri[k] = 0; }
    this.H = H0; this.open = false; this.yF = 0;
  }
  // 体積
  volume() {
    let v = 0;
    for (let k = 0; k < K; k++) {
      const y0 = k * DY; if (y0 >= this.H) break;
      const h = Math.min(DY, this.H - y0);
      const ri = this.open && this.yk(k) > this.yF ? this.Ri[k] : 0;
      v += Math.PI * (this.Ro[k] ** 2 - ri * ri) * h;
    }
    return v;
  }
  topK() { return Math.max(0, Math.min(K - 1, Math.floor(this.H / DY - 0.5))); }
  // 体積を元にもどす：開いていれば口縁が上がる（下がる）、閉じていれば縦に伸び縮み
  fixVolume() {
    const V = this.volume(); const d = this.V0 - V;
    if (Math.abs(d) < 1e-9) return;
    if (this.open) {
      for (let it = 0; it < 2; it++) {
        const dd = this.V0 - this.volume();
        const kt = this.topK();
        const area = Math.PI * Math.max(2e-5, this.Ro[kt] ** 2 - this.Ri[kt] ** 2);
        if (dd > 0) {
          // 半分は高さへ、半分は上ほど厚く（引き上げた土は口縁にたまる）
          this.H = Math.min(HMAX, this.H + dd * 0.7 / area);
          const d2 = this.V0 - this.volume();
          let den = 0;
          for (let k = 0; k < K; k++) { const y = this.yk(k); if (y > this.H) break; const w = 0.4 + 0.6 * (y / this.H); den += 2 * Math.PI * this.Ro[k] * w * DY; }
          const del = d2 / Math.max(1e-6, den);
          for (let k = 0; k < K; k++) { const y = this.yk(k); if (y > this.H + DY) break; this.Ro[k] = Math.min(RMAX, this.Ro[k] + del * (0.4 + 0.6 * (y / this.H))); }
        } else {
          this.H = Math.max(this.yF + 0.012, this.H + dd / area);
        }
      }
    } else {
      // 閉じたかたまり：高さを変え、輪郭を縦に伸ばす
      const sc = V / this.V0;
      const nh = Math.min(HMAX, this.H / sc);
      const old = this.Ro.slice();
      for (let k = 0; k < K; k++) {
        const y = this.yk(k) * this.H / nh;
        const f = y / DY - 0.5; const i = Math.max(0, Math.min(K - 2, Math.floor(f))); const t = Math.max(0, Math.min(1, f - i));
        this.Ro[k] = y >= this.H ? 0 : old[i] * (1 - t) + old[i + 1] * t;
      }
      this.H = nh;
      if (nh >= HMAX - 1e-4) { const sc2 = Math.sqrt(this.V0 / this.volume()); for (let k = 0; k < K; k++) this.Ro[k] = Math.min(RMAX, this.Ro[k] * sc2); }
    }
  }
  enforce() {
    const kt = this.topK();
    for (let k = 0; k < K; k++) {
      const y = this.yk(k);
      if (y > this.H) { this.Ro[k] = this.Ro[kt]; this.Ri[k] = this.Ri[kt]; continue; }
      if (this.Ro[k] > RMAX) this.Ro[k] = RMAX;
      if (this.open && y > this.yF) {
        if (this.Ri[k] < 0.004) this.Ri[k] = 0.004;
        if (this.Ro[k] < this.Ri[k] + TMIN) this.Ro[k] = this.Ri[k] + TMIN;
        if (this.Ri[k] > RMAX - TMIN) this.Ri[k] = RMAX - TMIN;
      }
      if (this.Ro[k] < 0.006 && (this.open || y < this.H - 0.01)) this.Ro[k] = 0.006;
    }
  }
  smoothArr(arr, kc, rad, a) {
    const k0 = Math.max(1, kc - rad), k1 = Math.min(K - 2, kc + rad);
    const t = arr.slice(k0 - 1, k1 + 2);
    for (let k = k0; k <= k1; k++) { const i = k - k0 + 1; arr[k] = t[i] * (1 - a) + (t[i - 1] + t[i + 1]) * 0.5 * a; }
  }

  // 手でこねた丸いかたまり
  resetLump(scale = 1, seed = Math.random()) {
    this.setDome(0.074 * scale, 0.088 * scale);
    this.V0 = this.volume();
    this.lumpy = 1; this.offCenter = 0.004 + Math.random() * 0.003; this.slump = 0;
    this.seed = seed;
    this.clearMaps();
    this.remesh();
  }
  // 崩れたかたまりを丸め直す（1 回ごとに少しずつ）
  reball(amount) {
    const R0 = 0.074, H0 = 0.088;
    for (let k = 0; k < K; k++) {
      const tgt = this.domeR(this.yk(k), R0, H0);
      this.Ro[k] += (tgt - this.Ro[k]) * amount;
      this.Ri[k] *= (1 - amount);
    }
    this.H += (H0 - this.H) * amount;
    if (this.open) { this.yF += (this.H - this.yF) * amount; if (this.H - this.yF < 0.01 || amount >= 1) { this.open = false; } }
    if (amount >= 1) this.setDome(R0, H0);
    this.slump *= (1 - amount);
    this.lumpy = Math.min(1, this.lumpy + amount * 0.6);
    this.remesh();
  }

  // ---- 指の操作 ----------------------------------------------------------
  // c = {zone, r, y, p(押す強さ 0..1), vy, vr(断面での動き m/s), dt}
  apply(c) {
    const dt = c.dt, p = c.p;
    const kc = Math.max(0, Math.min(K - 1, Math.round(c.y / DY - 0.5)));
    const sig = 0.0075 / DY;
    let zone = c.zone;
    if (!this.open && zone === 'top') {
      const rTop = this.Ro[Math.max(0, this.topK() - 3)];
      if (c.r < Math.max(0.018, rTop * 0.55)) zone = 'openHole'; else zone = 'rimDown';
    }
    if (this.open && zone === 'top') zone = 'floor';
    if (zone === 'openHole' || zone === 'floor') {
      // 真ん中を押す → 穴があき、深く・広くなる（長く押すほど、指を外へ動かすほど広がる）
      if (!this.open) {
        // 頭を平らにして（円柱っぽく）から穴をあける
        const k6 = Math.round(0.5 * this.H / DY - 0.5), rr = this.Ro[k6], y6 = this.yk(k6);
        for (let k = k6 + 1; k < K; k++) { const y = this.yk(k); if (y > this.H) break; const t = (y - y6) / (this.H - y6); this.Ro[k] = Math.max(this.Ro[k], rr * (1 - 0.12 * t * t)); }
        this.open = true; this.fixVolume();
        this.open = true; this.yF = this.H - 0.003; for (let k = 0; k < K; k++) this.Ri[k] = 0;
      }
      let base = 0; for (let k = 0; k < 12; k++) base += this.Ro[k] / 12;
      const lim = Math.max(0.012, base - 0.012);
      let rc = Math.max(0.0105, Math.min(lim, (c.r || 0) + 0.007));
      rc = Math.max(rc, Math.min(lim * 0.85, 0.0105 + (c.hold || 0) * 0.011));
      if (this.yF > FLOOR) this.yF = Math.max(FLOOR, this.yF - p * 0.032 * dt);
      for (let k = 0; k < K; k++) {
        const y = this.yk(k); if (y < this.yF) continue;
        const fil = Math.min(1, (y - this.yF) / 0.007);
        const want = rc * (0.6 + 0.4 * fil);
        if (this.Ri[k] < want) this.Ri[k] += (want - this.Ri[k]) * Math.min(1, dt * 4 * p);
        if (this.Ro[k] < this.Ri[k] + TMIN * 1.6) this.Ro[k] = this.Ri[k] + TMIN * 1.6;
      }
      this.smoothArr(this.Ri, Math.round(this.yF / DY), 4, 0.2);
    } else if (zone === 'outer') {
      // 外から押す：その高さが細くなり、上がる（引き上げると薄く高く）
      const up = Math.max(0, c.vy), down = Math.max(0, -c.vy);
      const amt = p * 0.02 * dt * (1 + up * 12);
      for (let k = 0; k < K; k++) {
        const y = this.yk(k); if (y > this.H + 0.004) break;
        const w = gauss(k - kc, sig);
        if (w < 0.01) continue;
        this.Ro[k] -= amt * w;
        // 引き上げるときは、下から上へ土を運ぶ（指の少し上が厚くなる前に伸びる）
      }
      if (down > 0) this.H -= down * 0.15 * dt * p;
      this.enforce();
      this.smoothArr(this.Ro, kc, 6, 0.25);
    } else if (zone === 'inner') {
      // 内から押す：壁ごと外へふくらむ（長く押すとお皿・鉢）
      const up = Math.max(0, c.vy);
      const amt = p * 0.016 * dt;
      for (let k = 0; k < K; k++) {
        const y = this.yk(k); if (y < this.yF || y > this.H + 0.004) continue;
        const w = gauss(k - kc, sig);
        if (w < 0.01) continue;
        const t0 = this.Ro[k] - this.Ri[k];
        this.Ri[k] += amt * w;
        // 引き上げながらだと薄くなる
        this.Ro[k] = this.Ri[k] + Math.max(TMIN, t0 * (1 - up * 2.5 * dt * w) - amt * w * 0.2);
      }
      this.smoothArr(this.Ri, kc, 6, 0.25); this.smoothArr(this.Ro, kc, 6, 0.25);
    } else if (zone === 'rim' || zone === 'rimDown') {
      // 口縁：押し下げると低く厚く／外へ動かすと開き、内へ動かすとすぼまる
      const kt = this.topK();
      if (Math.abs(c.vr) > 0.003) {
        const fl = c.vr * dt * 1.2;
        for (let k = 0; k < K; k++) {
          const y = this.yk(k); if (y < this.yF) continue;
          const w = Math.pow(Math.max(0, (y - this.yF) / Math.max(0.01, this.H - this.yF)), 1.6);
          this.Ro[k] += fl * w * 1.4; if (this.open) this.Ri[k] += fl * w * 1.4;
        }
        if (c.vr > 0) this.H -= c.vr * dt * 0.12; // 開くと少し低く
      } else {
        this.H -= p * 0.01 * dt;
        for (let k = Math.max(0, kt - 6); k <= kt; k++) { this.Ro[k] += p * 0.004 * dt; if (this.open) this.Ri[k] -= p * 0.002 * dt; }
      }
      // 内へすぼめる（口縁を外から内へ）
      if (c.vr < -0.003) { this.H += -c.vr * dt * 0.05; }
    }
    this.enforce();
    this.fixVolume();
    this.enforce();
    this.lumpy *= Math.exp(-dt * 0.9);
    this.offCenter *= Math.exp(-dt * 1.2);
  }

  // ---- 断面の折れ線（外側 → 口縁 → 内側 → 底 → 軸）
  buildChain() {
    const pts = [], zs = [];
    const P = (r, y, z) => { pts.push(r, y); zs.push(z); };
    const H = this.H, kt = this.topK();
    const Ro = (y) => { const f = Math.max(0, Math.min(K - 1.001, y / DY - 0.5)); const i = Math.floor(f), t = f - i; return this.Ro[i] * (1 - t) + this.Ro[Math.min(K - 1, i + 1)] * t; };
    const Ri = (y) => { const f = Math.max(0, Math.min(K - 1.001, y / DY - 0.5)); const i = Math.floor(f), t = f - i; return this.Ri[i] * (1 - t) + this.Ri[Math.min(K - 1, i + 1)] * t; };
    // 底面
    const r0 = Ro(0.0015);
    P(0, 0, 0); P(r0 * 0.5, 0, 0); P(Math.max(0, r0 - 0.003), 0, 0); P(r0 - 0.0008, 0.0012, 0);
    if (!this.open) {
      const n = 46;
      for (let i = 1; i <= n; i++) {
        const y = H * i / n;
        let r = i === n ? 0 : Ro(Math.min(y, H - 0.0005));
        if (y > H - 0.003) r = Math.min(r, Math.sqrt(Math.max(0, H - y)) * 0.06);
        P(r, y, i > n * 0.75 ? 4 : 0);
      }
      P(0, H, 4);
      return { pts, zs };
    }
    const lip = (Ro(H - 0.002) - Ri(H - 0.002)) * 0.5;
    const yTop = H - lip;
    const n = 40;
    for (let i = 1; i <= n; i++) { const y = 0.0012 + (yTop - 0.0012) * i / n; P(Ro(y), y, 0); }
    // 口縁（丸める）
    const ro = Ro(yTop), ri = Ri(yTop), cr = (ro + ri) / 2, rad = (ro - ri) / 2;
    for (let i = 1; i < 10; i++) { const a = Math.PI * i / 10; P(cr + Math.cos(a) * rad, yTop + Math.sin(a) * rad * 1.05, 1); }
    // 内側を下へ
    const fil = Math.min(0.006, (yTop - this.yF) * 0.4);
    for (let i = 0; i <= n; i++) { const y = yTop - (yTop - this.yF - fil) * i / n; P(Ri(y), y, 2); }
    // 底の丸み → 軸
    const rf = Ri(this.yF + fil);
    for (let i = 1; i <= 6; i++) { const a = Math.PI / 2 * i / 6; P(Math.max(0, rf - fil + Math.cos(a) * fil), this.yF + fil - Math.sin(a) * fil, 3); }
    P(Math.max(0, rf - fil) * 0.5, this.yF, 3); P(0, this.yF, 3);
    return { pts, zs };
  }

  remesh() {
    const { pts, zs } = this.buildChain();
    const L = pts.length / 2;
    const cum = new Float32Array(L);
    for (let k = 1; k < L; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
    const total = cum[L - 1];
    const pr = this.prof;
    let seg = 0;
    for (let m = 0; m < M; m++) {
      const s = total * m / (M - 1);
      while (seg < L - 2 && cum[seg + 1] < s) seg++;
      const t = (s - cum[seg]) / Math.max(1e-9, cum[seg + 1] - cum[seg]);
      pr[m * 2] = pts[seg * 2] + (pts[seg * 2 + 2] - pts[seg * 2]) * t;
      pr[m * 2 + 1] = pts[seg * 2 + 1] + (pts[seg * 2 + 3] - pts[seg * 2 + 1]) * t;
      this.profZ[m] = zs[t < 0.5 ? seg : seg + 1];
    }
    for (let it = 0; it < 2; it++) {
      const tmp = pr.slice();
      for (let m = 1; m < M - 1; m++) for (let c = 0; c < 2; c++) pr[m * 2 + c] = 0.25 * tmp[(m - 1) * 2 + c] + 0.5 * tmp[m * 2 + c] + 0.25 * tmp[(m + 1) * 2 + c];
    }
    pr[0] = 0; pr[(M - 1) * 2] = 0;
    let s = 0;
    for (let m = 0; m < M; m++) {
      const a = Math.max(0, m - 1), b = Math.min(M - 1, m + 1);
      let tx = pr[b * 2] - pr[a * 2], ty = pr[b * 2 + 1] - pr[a * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      // 外側から内側へ反時計回り → 外向きの法線は進む向きの右
      this.profN[m * 2] = ty; this.profN[m * 2 + 1] = -tx;
      if (m > 0) s += Math.hypot(pr[m * 2] - pr[m * 2 - 2], pr[m * 2 + 1] - pr[m * 2 - 1]);
      this.profS[m] = s;
    }
    this.updateGeometry();
  }
  // 断面上の点 (r, y) がどこか
  zoneAt(r, y) {
    const n = this.nearestS(r, y);
    const z = this.profZ[n.m];
    return ['outer', 'rim', 'inner', 'floor', 'top'][z] || 'outer';
  }

  buildGeometry() {
    const g = new THREE.BufferGeometry();
    const nv = M * (S + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tangent', new THREE.BufferAttribute(new Float32Array(nv * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRim', new THREE.BufferAttribute(new Float32Array(nv), 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let m = 0; m < M - 1; m++) for (let s = 0; s < S; s++) {
      const a = m * (S + 1) + s, b = a + 1, c = a + (S + 1), d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    this.geo = g;
    // 円周方向の三角関数
    this.cos = new Float32Array(S + 1); this.sin = new Float32Array(S + 1);
    for (let s = 0; s <= S; s++) { const a = s / S * Math.PI * 2; this.cos[s] = Math.cos(a); this.sin[s] = Math.sin(a); }
  }
  updateGeometry() {
    const g = this.geo, P = g.attributes.position.array, N = g.attributes.normal.array, T = g.attributes.tangent.array, U = g.attributes.uv.array, RIM = g.attributes.aRim.array;
    const pr = this.prof, pn = this.profN, ps = this.profS;
    const lump = this.lumpy * 0.005, seed = this.seed * 10;
    // 口縁（最も高い外側の点）からの距離 → 乾きやすさ
    let rimS = 0, top = -1;
    for (let m = 0; m < M; m++) if (pr[m * 2 + 1] > top) { top = pr[m * 2 + 1]; rimS = ps[m]; }
    for (let m = 0; m < M; m++) {
      const r = pr[m * 2], y = pr[m * 2 + 1], nr = pn[m * 2], ny = pn[m * 2 + 1];
      const v = ps[m] / SMAX;
      const rim = Math.max(0, 1 - Math.abs(ps[m] - rimS) / 0.12);
      for (let s = 0; s <= S; s++) {
        const k = m * (S + 1) + s;
        const c = this.cos[s], sn = this.sin[s];
        // こねたままの凸凹（回すと消えていく）
        let d = 0;
        if (lump > 1e-5 && r > 0.004) {
          const a = s / S * 6.2832;
          d = lump * (Math.sin(a * 2 + seed + y * 40) * 0.6 + Math.sin(a * 3 - seed * 1.7 + y * 70) * 0.4 + Math.sin(a * 5 + y * 120 + seed) * 0.25) * Math.min(1, r / 0.02);
        }
        const rr = r + nr * d, yy = y + ny * d;
        P[k * 3] = rr * c; P[k * 3 + 1] = yy; P[k * 3 + 2] = -rr * sn;
        N[k * 3] = nr * c; N[k * 3 + 1] = ny; N[k * 3 + 2] = -nr * sn;
        T[k * 4] = -sn; T[k * 4 + 1] = 0; T[k * 4 + 2] = -c; T[k * 4 + 3] = 1;
        U[k * 2] = s / S; U[k * 2 + 1] = v;
        RIM[k] = rim;
      }
    }
    // 崩れ（パパがまわしすぎた）：片側へ倒れてつぶれる
    if (this.slump > 0.001) {
      const sl = this.slump, dir = this.slumpDir;
      const dx = Math.cos(dir), dz = Math.sin(dir);
      for (let k = 0; k < M * (S + 1); k++) {
        const y = P[k * 3 + 1];
        const h = y / 0.12;
        const bend = sl * 0.09 * h * h;
        const fold = sl * 0.012 * Math.sin(y * 90 + P[k * 3] * 60) * h;
        P[k * 3] += dx * bend + fold * dz;
        P[k * 3 + 2] += dz * bend - fold * dx;
        P[k * 3 + 1] = y * (1 - sl * 0.45) + sl * 0.004 * Math.sin(P[k * 3] * 80);
      }
      g.computeVertexNormals();
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.attributes.tangent.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.attributes.aRim.needsUpdate = true;
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }
  // 断面上で一番近い点の弧長
  nearestS(r, y) {
    let best = 1e9, bs = 0, bm = 0;
    const pr = this.prof;
    for (let m = 0; m < M; m++) { const d = (pr[m * 2] - r) ** 2 + (pr[m * 2 + 1] - y) ** 2; if (d < best) { best = d; bs = this.profS[m]; bm = m; } }
    return { s: bs, m: bm, d: Math.sqrt(best) };
  }
  // 形の特徴（花びん・つぼ・お皿 の判定に使う）
  stats() {
    let maxR = 0; const kt = this.topK();
    for (let k = 0; k <= kt; k++) maxR = Math.max(maxR, this.Ro[k]);
    const top = this.H;
    const rimR = this.Ro[kt];
    let neckR = 1e9;
    for (let k = 0; k <= kt; k++) { const y = this.yk(k); if (y > top * 0.45 && y < top - 0.008) neckR = Math.min(neckR, this.open ? this.Ri[k] : this.Ro[k]); }
    const depth = this.open ? top - this.yF : 0;
    let kind = 'lump';
    if (this.open && depth > 0.012) {
      if (top < 0.05 || (rimR > 0.095 && top < 0.085)) kind = 'plate';
      else if (top > 0.12 && rimR < maxR * 0.8) kind = 'vase';
      else if (rimR < maxR * 0.75) kind = 'jar';
      else if (top > 0.115) kind = 'vase';
      else kind = 'bowl';
    }
    return { top, maxR, open: this.open, depth, rimR, neckR, kind, innerFloor: this.yF, innerR: this.open ? this.Ri[kt] : 0 };
  }
  innerRAt(y) { const k = Math.max(0, Math.min(K - 1, Math.round(y / DY - 0.5))); return this.Ri[k]; }
  outerRAt(y) { const k = Math.max(0, Math.min(K - 1, Math.round(y / DY - 0.5))); return this.Ro[k]; }

  // ---- 塗りマップ（溝・水・どろ）
  buildMaps() {
    const mk = (w, h, fill) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(0, 0, w, h); return { c, g }; };
    this.gv = mk(1024, 512, 'rgb(128,128,128)');
    this.wv = mk(256, 256, '#000');
    this.sv = mk(256, 256, '#000');
    this.tGroove = new THREE.CanvasTexture(this.gv.c); this.tGroove.wrapS = THREE.RepeatWrapping; this.tGroove.colorSpace = THREE.NoColorSpace;
    this.tWet = new THREE.CanvasTexture(this.wv.c); this.tWet.wrapS = THREE.RepeatWrapping; this.tWet.colorSpace = THREE.NoColorSpace;
    this.tSlip = new THREE.CanvasTexture(this.sv.c); this.tSlip.wrapS = THREE.RepeatWrapping; this.tSlip.colorSpace = THREE.NoColorSpace;
    this.tGroove.generateMipmaps = true;
    this.tGroove.flipY = this.tWet.flipY = this.tSlip.flipY = false;
  }
  clearMaps() {
    const g = this.gv.g; g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, 1024, 512);
    // こねた跡のかすかな凸凹
    for (let i = 0; i < 260; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(90,90,90,0.25)' : 'rgba(170,170,170,0.25)';
      g.beginPath(); g.ellipse(Math.random() * 1024, Math.random() * 300, 6 + Math.random() * 30, 3 + Math.random() * 10, Math.random() * 3, 0, 6.3); g.fill();
    }
    this.wv.g.fillStyle = '#000'; this.wv.g.fillRect(0, 0, 256, 256);
    this.sv.g.fillStyle = '#000'; this.sv.g.fillRect(0, 0, 256, 256);
    // 最初から少ししっとり
    this.wv.g.fillStyle = 'rgba(255,255,255,0.25)'; this.wv.g.fillRect(0, 0, 256, 256);
    this.tGroove.needsUpdate = this.tWet.needsUpdate = this.tSlip.needsUpdate = true;
  }
  // 回転にそって溝を描く（u0→u1 は回った分）
  drawGroove(u0, u1, s0, s1, depth, wet) {
    const g = this.gv.g;
    const W = 1024, H = 512;
    const y0 = s0 / SMAX * H, y1 = s1 / SMAX * H;
    const seg = (xa, xb) => {
      // 古い跡をならす
      g.globalAlpha = 0.18 + 0.2 * wet; g.strokeStyle = 'rgb(128,128,128)'; g.lineWidth = 11; g.lineCap = 'round';
      g.beginPath(); g.moveTo(xa, y0); g.lineTo(xb, y1); g.stroke();
      // 指の溝と、両わきの盛り上がり
      g.globalAlpha = 0.35 * depth; g.strokeStyle = 'rgb(40,40,40)'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(xa, y0); g.lineTo(xb, y1); g.stroke();
      g.globalAlpha = 0.22 * depth; g.strokeStyle = 'rgb(210,210,210)'; g.lineWidth = 1.8;
      for (const o of [-3.2, 3.4]) { g.beginPath(); g.moveTo(xa, y0 + o); g.lineTo(xb, y1 + o); g.stroke(); }
      // 砂粒が引きずる細い筋
      g.globalAlpha = 0.18 * depth; g.lineWidth = 0.8;
      for (let q = 0; q < 2; q++) {
        const o = (Math.random() - 0.5) * 9;
        g.strokeStyle = Math.random() < 0.5 ? 'rgb(70,70,70)' : 'rgb(190,190,190)';
        g.beginPath(); g.moveTo(xa, y0 + o); g.lineTo(xb, y1 + o); g.stroke();
      }
    };
    let xa = u0 * W, xb = u1 * W;
    // 折り返し
    for (const off of [-W, 0, W]) {
      const a = xa + off, b = xb + off;
      if (Math.max(a, b) < -10 || Math.min(a, b) > W + 10) continue;
      seg(a, b);
    }
    g.globalAlpha = 1;
    this.tGroove.needsUpdate = true;
  }
  paintWet(u0, u1, s0, s1, amount, slip) {
    const W = 256, H = 256;
    for (const [cv, a, col, wdt] of [[this.wv, amount, '#fff', 7], [this.sv, slip, '#fff', 5]]) {
      if (a <= 0.001) continue;
      const g = cv.g; g.globalAlpha = Math.min(1, a); g.strokeStyle = col; g.lineWidth = wdt; g.lineCap = 'round';
      const y0 = s0 / SMAX * H, y1 = s1 / SMAX * H;
      for (const off of [-W, 0, W]) { g.beginPath(); g.moveTo(u0 * W + off, y0); g.lineTo(u1 * W + off, y1); g.stroke(); }
      g.globalAlpha = 1;
    }
    this.tWet.needsUpdate = true; this.tSlip.needsUpdate = true;
  }
  // しずく：上から垂れる水の筋
  drip(u, s0, len) {
    const g = this.wv.g; const W = 256, H = 256;
    g.globalAlpha = 0.7; g.strokeStyle = '#fff'; g.lineWidth = 3 + Math.random() * 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(u * W, s0 / SMAX * H); g.lineTo(u * W + (Math.random() - 0.5) * 3, (s0 - len) / SMAX * H); g.stroke();
    g.globalAlpha = 1;
    this.tWet.needsUpdate = true;
  }
  dry(dt) {
    this._dt = (this._dt || 0) + dt;
    if (this._dt < 0.5) return;
    this._dt = 0;
    const g = this.wv.g; g.globalAlpha = 0.035; g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); g.globalAlpha = 1;
    this.tWet.needsUpdate = true;
  }
}

// ---- 器の素材：濡れた土 → 乾いた土 → 素焼き → 生の釉薬（粉っぽい） → 焼成（ガラス質・貫入）
export function makePotMaterial(clay) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.9, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
    normalMap: tex('grain', 'n'), envMapIntensity: 1,
  });
  const U = {
    tGrainC: { value: tex('grain', 'c') }, tGrainN: { value: tex('grain', 'n') },
    tGroove: { value: clay ? clay.tGroove : null }, tWet: { value: clay ? clay.tWet : null }, tSlip: { value: clay ? clay.tSlip : null },
    tGlaze: { value: null }, tCrack: { value: null },
    uBlur: { value: 0 }, uDry: { value: 0 }, uBisque: { value: 0 }, uGlazeOn: { value: 0 }, uFired: { value: 0 }, uHot: { value: 0 },
    uWetAll: { value: 0 }, uTanSign: { value: 1 }, uGlow: { value: 0 },
    uClay: { value: new THREE.Color(0.135, 0.078, 0.047) },
  };
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aRim; varying float vRim; varying vec2 vPUv; varying float vR; varying vec3 vObj;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRim = aRim; vPUv = uv; vR = length(position.xz); vObj = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vRim; varying vec2 vPUv; varying float vR; varying vec3 vObj;
        uniform sampler2D tGrainC, tGrainN, tGroove, tWet, tSlip, tGlaze, tCrack;
        uniform float uBlur, uDry, uBisque, uGlazeOn, uFired, uHot, uWetAll, uTanSign, uGlow;
        uniform vec3 uClay;
        vec3 hash3(vec3 p){ p = vec3(dot(p, vec3(127.1,311.7,74.7)), dot(p, vec3(269.5,183.3,246.1)), dot(p, vec3(113.5,271.9,124.6))); return fract(sin(p) * 43758.5453); }
        // 貫入：ボロノイの境界
        float crackle(vec3 p){
          vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
          for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
            vec3 g = vec3(float(x), float(y), float(z)); vec3 o = hash3(i + g); vec3 r = g + o - f; float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
          }
          return sqrt(d2) - sqrt(d1);
        }
        float blackbody(float t){ return t; }`)
      .replace('#include <map_fragment>', `
        // 実寸に合わせた粒のテクスチャ座標（回転中は円周方向にぶれる＝モーションブラー）
        vec2 gUv = vec2(vPUv.x * 6.2832 * max(vR, 0.012) / 0.045, vPUv.y * 0.6 / 0.045);
        float bl = uBlur * max(vR, 0.012) / 0.045;
        vec4 grainC = (texture2D(tGrainC, gUv) + texture2D(tGrainC, gUv + vec2(bl * 0.25, 0.0)) + texture2D(tGrainC, gUv + vec2(bl * 0.5, 0.0)) + texture2D(tGrainC, gUv + vec2(bl * 0.75, 0.0)) + texture2D(tGrainC, gUv + vec2(bl, 0.0))) * 0.2;
        float wet = clamp(texture2D(tWet, vPUv).r + uWetAll, 0.0, 1.0) * (1.0 - uDry);
        float slip = texture2D(tSlip, vPUv).r * (1.0 - uDry * 0.6);
        float gro = texture2D(tGroove, vPUv).r - 0.5;
        // 生の土
        // 大きなむら（こね残しの色の差）
        float mott = texture2D(tGrainC, gUv * 0.09 + vec2(0.31, 0.17)).r * 0.6 + texture2D(tGrainC, gUv * 0.031).g * 0.4;
        vec3 wetClay = uClay * grainC.rgb * (0.82 + 0.36 * mott);
        wetClay = mix(wetClay, uClay * vec3(1.25, 1.18, 1.1), slip * 0.55);
        wetClay *= mix(1.0, 0.68, wet);
        // 乾く：口縁から白っぽく
        float dryL = clamp(uDry * 1.7 - (1.0 - vRim) * 0.7, 0.0, 1.0);
        vec3 dryClay = vec3(0.5, 0.42, 0.34) * grainC.rgb;
        vec3 bisque = vec3(0.66, 0.53, 0.43) * grainC.rgb;
        vec3 body = mix(wetClay, dryClay, dryL);
        body = mix(body, bisque, uBisque);
        // 釉薬
        vec4 gl4 = texture2D(tGlaze, vPUv) * uGlazeOn;
        vec3 gth = gl4.rgb;
        // ろくろ目の山では薄く、谷では厚く
        gth *= clamp(1.0 - gro * 3.0 * uFired, 0.4, 1.8);
        float tot = gth.r + gth.g + gth.b;
        float cov = smoothstep(0.03, 0.22, tot);
        vec3 rawC = (gth.r * vec3(0.27, 0.29, 0.32) + gth.g * vec3(0.38, 0.25, 0.14) + gth.b * vec3(0.72, 0.69, 0.62)) / max(tot, 1e-4);
        rawC *= 0.92 + 0.16 * grainC.r;
        // 焼いた後の色（厚みで濃さが変わる）
        vec3 cBlue = mix(vec3(0.33, 0.5, 0.62), vec3(0.025, 0.09, 0.26), smoothstep(0.08, 0.9, gth.r));
        vec3 cAme = mix(vec3(0.62, 0.36, 0.1), vec3(0.09, 0.03, 0.012), smoothstep(0.1, 1.0, gth.g));
        vec3 cWhite = mix(vec3(0.7, 0.69, 0.64), vec3(0.83, 0.85, 0.86), smoothstep(0.15, 0.9, gth.b));
        vec3 firedC = (gth.r * cBlue + gth.g * cAme + gth.b * cWhite) / max(tot, 1e-4);
        // 重なり：青×飴 → 深い緑、青×白 → 水色の斑
        firedC = mix(firedC, vec3(0.05, 0.16, 0.12), clamp(min(gth.r, gth.g) * 2.5, 0.0, 0.75));
        firedC = mix(firedC, vec3(0.36, 0.55, 0.68), clamp(min(gth.r, gth.b) * 2.0, 0.0, 0.6) * (0.6 + 0.4 * grainC.r));
        vec3 firedBody = vec3(0.3, 0.16, 0.09) * grainC.rgb;
        float opq = clamp(smoothstep(0.02, 0.35, tot) * mix(0.75, 1.0, gth.b / max(tot, 1e-4)), 0.0, 1.0);
        vec3 fired = mix(firedBody, firedC, opq);
        // 貫入（タップで広がる）
        float crackMask = texture2D(tCrack, vPUv).r * uFired * smoothstep(0.12, 0.3, tot);
        float cr = crackle(vObj * 170.0);
        float crLine = (1.0 - smoothstep(0.015, 0.06, cr)) * crackMask;
        fired = mix(fired, fired * 0.55 + vec3(0.02, 0.018, 0.015), crLine * mix(0.5, 1.0, gth.b / max(tot, 1e-4)));
        vec3 unfired = mix(body, rawC, cov);
        diffuseColor.rgb = mix(unfired, fired, uFired);
        float glossy = mix(0.0, cov, uFired);
        `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = mix(0.9, 0.32, wet);
        roughnessFactor = mix(roughnessFactor, 0.55, slip * (1.0 - wet) * 0.6);
        roughnessFactor = mix(roughnessFactor, 0.93, max(uDry, uBisque));
        roughnessFactor = mix(roughnessFactor, 0.97, cov * uGlazeOn * (1.0 - uFired));
        roughnessFactor = mix(roughnessFactor, 0.07 + crLine * 0.2, glossy);
        roughnessFactor = mix(roughnessFactor, 0.85, uFired * (1.0 - cov));`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 gn = (texture2D(tGrainN, gUv).xyz + texture2D(tGrainN, gUv + vec2(bl * 0.5, 0.0)).xyz + texture2D(tGrainN, gUv + vec2(bl, 0.0)).xyz) / 3.0 * 2.0 - 1.0;
          float gs = mix(1.1, 0.45, slip) * mix(1.0, 0.6, wet);
          gs = mix(gs, 1.6, cov * uGlazeOn * (1.0 - uFired));
          gs = mix(gs, 0.08, glossy);
          gs *= smoothstep(0.002, 0.012, vR);
          gn.xy *= gs;
          // ろくろ目（溝のマップの傾き）
          float e = 1.0 / 512.0;
          float hU = texture2D(tGroove, vPUv + vec2(0.0, e)).r - texture2D(tGroove, vPUv - vec2(0.0, e)).r;
          float hR = texture2D(tGroove, vPUv + vec2(1.0/1024.0, 0.0)).r - texture2D(tGroove, vPUv - vec2(1.0/1024.0, 0.0)).r;
          float gk = mix(1.0, 0.35, uFired * cov) * smoothstep(0.002, 0.012, vR);
          gn.y += -hU * 6.0 * uTanSign * gk; gn.x += -hR * 1.5 * gk;
          normal = normalize(tbn * gn);
        }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.clearcoat = clamp(wet * 0.7 + glossy, 0.0, 1.0);
        material.clearcoatRoughness = mix(0.12, 0.03, glossy);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.33, 0.08) * uHot * uHot * 6.0 + vec3(1.0, 0.9, 0.7) * uGlow * 0.05;`);
  };
  m.customProgramCacheKey = () => 'pot';
  return m;
}
