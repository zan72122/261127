// Procedural textures drawn on canvases at startup (no external assets).
import * as THREE from 'three';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d') };
}

// deterministic PRNG
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// tileable value noise
function makeNoise(seed, period) {
  const r = rng(seed), p = period, g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = ((xi % p) + p) % p, b = ((yi % p) + p) % p, a1 = (a + 1) % p, b1 = (b + 1) % p;
    const v00 = g[b * p + a], v10 = g[b * p + a1], v01 = g[b1 * p + a], v11 = g[b1 * p + a1];
    return (v00 * (1 - xf) + v10 * xf) * (1 - yf) + (v01 * (1 - xf) + v11 * xf) * yf;
  };
}
export function fbm(seed, period, oct = 4) {
  const ns = [];
  for (let i = 0; i < oct; i++) ns.push(makeNoise(seed + i * 101, period << i));
  return (x, y) => { let v = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { v += a * ns[i](x * f, y * f); t += a; a *= 0.5; f *= 2; } return v / t; };
}

function tex(c, opt = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opt.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opt.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = opt.aniso || 4;
  if (opt.repeat) t.repeat.set(opt.repeat[0], opt.repeat[1]);
  t.needsUpdate = true;
  return t;
}

// height (Float32Array w*h, 0..1) -> normal map texture (tileable)
export function normalFromHeight(hgt, w, h, strength = 2, opt = {}) {
  const { c, g } = canvas(w, h);
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
    const dx = (hgt[y * w + xr] - hgt[y * w + xl]) * strength;
    const dy = (hgt[yd * w + x] - hgt[yu * w + x]) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, Object.assign({ linear: true }, opt));
}

function hex(c) { const v = new THREE.Color(c); return [v.r * 255, v.g * 255, v.b * 255]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ---------- wood floor ----------
export function woodFloor() {
  const W = 1024, H = 1024, { c, g } = canvas(W, H);
  const img = g.createImageData(W, H), d = img.data, hgt = new Float32Array((W / 2) * (H / 2));
  const n1 = fbm(7, 8, 4), n2 = fbm(19, 4, 3), r = rng(5);
  const planks = 8, pw = W / planks; // planks run along v (texture y)
  const offs = [], tones = [];
  for (let i = 0; i < planks; i++) { offs.push(r()); tones.push(r()); }
  const base = hex('#e6c8a2'), dark = hex('#c49c74'), light = hex('#f2dcbc');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = Math.floor(x / pw), lx = (x % pw) / pw;
    const seg = Math.floor((y / H + offs[p]) * 2) ; // two board lengths per tile
    const ly = ((y / H + offs[p]) * 2) % 1;
    const tone = (tones[p] * 0.6 + ((seg * 0.37 + p * 0.11) % 1) * 0.4);
    const grain = Math.sin((lx * 9 + n1(x / 128 + p * 3, y / 512) * 6) * Math.PI * 2) * 0.5 + 0.5;
    const fine = n2(x / 16, y / 256);
    let col = mix(base, tone > 0.5 ? light : dark, Math.abs(tone - 0.5) * 0.9);
    col = mix(col, dark, grain * 0.16 + fine * 0.1);
    let e = 1, hv = 0.6 + grain * 0.12 + fine * 0.08;
    const gapX = Math.min(lx, 1 - lx) * pw, gapY = Math.min(ly, 1 - ly) * H / 2;
    if (gapX < 1.6 || gapY < 1.4) { e = 0.55; hv = 0.15; } else if (gapX < 3.5 || gapY < 3) { e = 0.85; hv = 0.45; }
    const i = (y * W + x) * 4;
    d[i] = col[0] * e; d[i + 1] = col[1] * e; d[i + 2] = col[2] * e; d[i + 3] = 255;
    if ((x & 1) === 0 && (y & 1) === 0) hgt[(y >> 1) * (W / 2) + (x >> 1)] = hv;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c, { aniso: 8 }), normalMap: normalFromHeight(hgt, W / 2, H / 2, 3, { aniso: 8 }) };
}

// ---------- wallpaper: cream with tiny flower dots and soft stripes ----------
export function wallpaper() {
  const W = 512, H = 512, { c, g } = canvas(W, H);
  g.fillStyle = '#f7ecd6'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 64) { g.fillStyle = 'rgba(236,214,186,0.35)'; g.fillRect(x, 0, 22, H); }
  const n = fbm(3, 16, 3), img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = (n(x / 32, y / 32) - 0.5) * 10, i = (y * W + x) * 4; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
  g.putImageData(img, 0, 0);
  for (let y = 0; y < H; y += 64) for (let x = 0; x < W; x += 64) {
    const ox = x + 43 + ((y / 64) % 2) * 0, oy = y + 32;
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.fillStyle = 'rgba(240,180,186,0.55)'; g.beginPath(); g.arc(ox + Math.cos(a) * 3.2, oy + Math.sin(a) * 3.2, 2.6, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(244,214,120,0.8)'; g.beginPath(); g.arc(ox, oy, 1.8, 0, 7); g.fill();
  }
  return tex(c, { aniso: 4 });
}

// ---------- fabric weave normal (tileable) ----------
export function weaveNormal(size = 128, threads = 16, strength = 1.6) {
  const hgt = new Float32Array(size * size), t = size / threads;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = Math.floor(x / t), cy = Math.floor(y / t), fx = (x % t) / t, fy = (y % t) / t;
    const over = (cx + cy) % 2 === 0;
    const a = Math.sin(fx * Math.PI), b = Math.sin(fy * Math.PI);
    hgt[y * size + x] = over ? 0.5 + 0.5 * b * (0.6 + 0.4 * a) : 0.5 + 0.5 * a * (0.6 + 0.4 * b);
  }
  return normalFromHeight(hgt, size, size, strength);
}

// knit (socks): vertical V stitches
export function knitNormal() {
  const S = 128, hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const col = (x % 16) / 16, row = ((y + (col < 0.5 ? col : 1 - col) * 16) % 16) / 16;
    hgt[y * S + x] = Math.sin(col * Math.PI) * (0.6 + 0.4 * Math.sin(row * Math.PI));
  }
  return normalFromHeight(hgt, S, S, 2.2);
}

// hair strands: grooves along v
export function hairNormal() {
  const W = 128, H = 128, hgt = new Float32Array(W * H), n = fbm(11, 8, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    hgt[y * W + x] = 0.5 + 0.35 * Math.sin((x / W) * Math.PI * 2 * 10 + n(x / 16, y / 64) * 4) + 0.15 * n(x / 4, y / 32);
  }
  return normalFromHeight(hgt, W, H, 2.4);
}

// quilt: diamond stitch pattern on a soft fabric; returns map + normal
export function quilt(colA, colB) {
  const S = 256, { c, g } = canvas(S, S);
  g.fillStyle = colA; g.fillRect(0, 0, S, S);
  // small floral print
  const r = rng(9);
  for (let i = 0; i < 70; i++) { const x = r() * S, y = r() * S; g.fillStyle = colB; g.globalAlpha = 0.55; g.beginPath(); g.arc(x, y, 2 + r() * 2.5, 0, 7); g.fill(); g.globalAlpha = 0.8; g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(x, y, 1, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = ((x + y) % 64) / 64, v = ((x - y + 256 * 4) % 64) / 64;
    const pu = Math.sin(u * Math.PI), pv = Math.sin(v * Math.PI);
    hgt[y * S + x] = Math.pow(pu * pv, 0.6);
  }
  // stitches on the seams
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.4; g.setLineDash([4, 3]);
  for (let k = -S; k < S * 2; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke(); }
  g.setLineDash([]);
  return { map: tex(c), normalMap: normalFromHeight(hgt, S, S, 3.2) };
}

// gingham / polka for dresses (albedo)
export function gingham(a, b) {
  const S = 128, { c, g } = canvas(S, S);
  g.fillStyle = a; g.fillRect(0, 0, S, S);
  g.fillStyle = b; g.globalAlpha = 0.45; g.fillRect(0, 0, S / 2, S); g.fillRect(0, 0, S, S / 2); g.globalAlpha = 0.35; g.fillRect(0, 0, S / 2, S / 2);
  return tex(c);
}
export function polka(a, b) {
  const S = 128, { c, g } = canvas(S, S);
  g.fillStyle = a; g.fillRect(0, 0, S, S); g.fillStyle = b;
  [[32, 32], [96, 96]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); });
  return tex(c);
}
// plain fabric with seam stitches near the bottom (v small) for hems
export function fabricHem(base, stitch, v0 = 0.06) {
  const W = 64, H = 256, { c, g } = canvas(W, H);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const y = H * (1 - v0);
  g.strokeStyle = stitch; g.lineWidth = 2; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y + 4, W, H - y);
  const t = tex(c); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---------- tiles (genkan) & stone (porch) ----------
export function tiles() {
  const S = 256, { c, g } = canvas(S, S), hgt = new Float32Array(S * S), n = fbm(21, 8, 3);
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const tx = (x % 64), ty = (y % 64), gap = Math.min(tx, 64 - tx, ty, 64 - ty);
    const k = ((Math.floor(x / 64) + Math.floor(y / 64)) % 2);
    const nv = n(x / 32, y / 32);
    let col = k ? [236, 226, 212] : [222, 208, 192];
    col = col.map(v => v - 14 + nv * 26);
    let hv = 0.8 + nv * 0.05;
    if (gap < 2.2) { col = [170, 158, 146]; hv = 0.2; }
    const i = (y * S + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; hgt[y * S + x] = hv;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: normalFromHeight(hgt, S, S, 2) };
}
export function stone() {
  const S = 256, { c, g } = canvas(S, S), hgt = new Float32Array(S * S), n = fbm(33, 8, 4), r = rng(4);
  const cells = []; for (let i = 0; i < 18; i++) cells.push([r() * S, r() * S, r()]);
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let b1 = 1e9, b2 = 1e9, id = 0;
    for (const [cx, cy, t] of cells) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
      const dd = Math.hypot(x - cx - ox, y - cy - oy); if (dd < b1) { b2 = b1; b1 = dd; id = t; } else if (dd < b2) b2 = dd;
    }
    const edge = b2 - b1, nv = n(x / 24, y / 24);
    let v = 186 + id * 30 + nv * 30, hv = 0.7 + nv * 0.2;
    let col = [v, v - 6, v - 16];
    if (edge < 3) { col = [120, 128, 104]; hv = 0.1; }
    const i = (y * S + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; hgt[y * S + x] = hv;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: normalFromHeight(hgt, S, S, 3) };
}

// play-mat (outside the dollhouse): soft woven rug
export function rug() {
  const S = 256, { c, g } = canvas(S, S), n = fbm(41, 8, 4);
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = n(x / 16, y / 16), w = Math.sin(x / S * Math.PI * 2 * 32) * Math.sin(y / S * Math.PI * 2 * 32);
    const i = (y * S + x) * 4; d[i] = 214 + v * 22 + w * 5; d[i + 1] = 196 + v * 20 + w * 5; d[i + 2] = 186 + v * 18 + w * 5; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: [6, 6] });
}

// garden backdrop seen through door & windows
export function garden() {
  const W = 512, H = 256, { c, g } = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, 'rgba(191,226,244,0)'); sky.addColorStop(0.38, 'rgba(191,226,244,1)'); sky.addColorStop(0.55, '#e9f5f2'); sky.addColorStop(1, '#f4f0dc');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const r = rng(12);
  // distant trees
  for (let i = 0; i < 26; i++) { const x = r() * W, y = H * 0.48 + r() * 20, rr = 18 + r() * 26; g.fillStyle = `rgba(${120 + r() * 40},${170 + r() * 30},${120 + r() * 30},0.7)`; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
  // hedge
  for (let i = 0; i < 90; i++) { const x = r() * W, y = H * 0.66 + r() * 30, rr = 10 + r() * 16; g.fillStyle = `rgb(${86 + r() * 40},${142 + r() * 40},${84 + r() * 30})`; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
  g.fillStyle = '#7fb46c'; g.fillRect(0, H * 0.78, W, H * 0.22);
  // flowers
  for (let i = 0; i < 60; i++) { const x = r() * W, y = H * 0.7 + r() * H * 0.25; g.fillStyle = ['#ffd1dc', '#fff3b0', '#ffffff', '#f7a8b8'][i % 4]; g.beginPath(); g.arc(x, y, 2 + r() * 2.5, 0, 7); g.fill(); }
  return tex(c, { clamp: true });
}

// big soft background behind the dollhouse (a real room, out of focus)
export function backdrop() {
  const W = 256, H = 256, { c, g } = canvas(W, H);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#f4e9dd'); gr.addColorStop(0.6, '#ead8c6'); gr.addColorStop(1, '#d9c1ab');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W * 0.25, H * 0.25, 4, W * 0.25, H * 0.25, W * 0.5);
  rg.addColorStop(0, 'rgba(255,252,240,0.9)'); rg.addColorStop(1, 'rgba(255,252,240,0)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  const t = tex(c, { clamp: true }); return t;
}

// ---------- cake ----------
export function sponge() {
  const S = 128, { c, g } = canvas(S, S), n = fbm(51, 8, 4), r = rng(3);
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = n(x / 10, y / 10), i = (y * S + x) * 4; d[i] = 240 + v * 14; d[i + 1] = 204 + v * 18; d[i + 2] = 128 + v * 20; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(180,130,60,0.35)'; g.beginPath(); g.arc(r() * S, r() * S, 0.6 + r() * 1.6, 0, 7); g.fill(); }
  return tex(c);
}
// cross-section of a strawberry shortcake slice: v=0 bottom .. v=1 top
export function cakeSection() {
  const W = 256, H = 128, { c, g } = canvas(W, H), n = fbm(61, 8, 4), r = rng(8);
  const img = g.createImageData(W, H), d = img.data;
  // layers (from bottom in v): sponge 0-.32, cream .32-.42, sponge .42-.74, cream top .74-1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 1 - y / H, nv = n(x / 9, y / 9), i = (y * W + x) * 4;
    let col;
    if (v < 0.04) col = [214, 160, 92];
    else if (v < 0.32 || (v > 0.42 && v < 0.74)) col = [246 + nv * 8, 210 + nv * 18, 132 + nv * 22];
    else col = [255, 251 - nv * 6, 244 - nv * 8];
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // pores
  for (let i = 0; i < 260; i++) { const y = r() < 0.5 ? H * (1 - (0.06 + r() * 0.24)) : H * (1 - (0.44 + r() * 0.28)); g.fillStyle = 'rgba(190,140,70,0.35)'; g.beginPath(); g.arc(r() * W, y, 0.5 + r() * 1.3, 0, 7); g.fill(); }
  // strawberry slices in the middle cream
  for (let x = 16; x < W; x += 44) {
    const cy = H * (1 - 0.37); g.fillStyle = '#e8384a'; g.beginPath(); g.ellipse(x, cy, 13, 6.5, 0, 0, 7); g.fill();
    g.fillStyle = '#ff8a8f'; g.beginPath(); g.ellipse(x, cy, 8, 3.5, 0, 0, 7); g.fill();
    g.fillStyle = '#ffd6d6'; g.beginPath(); g.ellipse(x, cy, 3, 1.3, 0, 0, 7); g.fill();
  }
  return tex(c, { clamp: true });
}
export function strawberrySkin() {
  const S = 64, { c, g } = canvas(S, S); g.fillStyle = '#e2283c'; g.fillRect(0, 0, S, S);
  for (let y = 4; y < S; y += 8) for (let x = (y / 8 % 2) * 4; x < S; x += 8) { g.fillStyle = '#ffe58a'; g.beginPath(); g.ellipse(x, y, 1, 1.6, 0, 0, 7); g.fill(); }
  return tex(c);
}
export function cookie() {
  const S = 128, { c, g } = canvas(S, S), n = fbm(71, 8, 4), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = n(x / 8, y / 8), i = (y * S + x) * 4; d[i] = 214 + v * 30; d[i + 1] = 160 + v * 30; d[i + 2] = 92 + v * 26; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const r = rng(2); for (let i = 0; i < 14; i++) { g.fillStyle = '#5a3420'; g.beginPath(); g.arc(r() * S, r() * S, 3 + r() * 3, 0, 7); g.fill(); }
  return tex(c);
}

// ceramic decal: white glaze with pink rim band and flower sprigs (for lathe uv: u around, v along profile)
export function ceramic(rimColor = '#f08aa0', flower = true) {
  const W = 512, H = 128, { c, g } = canvas(W, H);
  g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H);
  g.fillStyle = rimColor; g.fillRect(0, H - 9, W, 9); g.fillRect(0, 0, W, 4);
  if (flower) for (let x = 32; x < W; x += 128) {
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.fillStyle = '#f7a3b5'; g.beginPath(); g.arc(x + Math.cos(a) * 7, H * 0.5 + Math.sin(a) * 7, 5.5, 0, 7); g.fill(); }
    g.fillStyle = '#ffd86b'; g.beginPath(); g.arc(x, H * 0.5, 4, 0, 7); g.fill();
    g.fillStyle = '#8cc79a'; g.beginPath(); g.ellipse(x + 16, H * 0.5 + 6, 7, 3, 0.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(x - 16, H * 0.5 + 6, 7, 3, -0.5, 0, 7); g.fill();
  }
  return tex(c);
}

// ceramic with bands/flowers placed by lathe v (v=1 is canvas top)
export function ceramicV(o) {
  const W = 512, H = 256, { c, g } = canvas(W, H);
  g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H);
  const Y = v => (1 - v) * H;
  for (const [v0, v1, col] of (o.bands || [])) { g.fillStyle = col; g.fillRect(0, Y(v1), W, Y(v0) - Y(v1)); }
  for (const fv of (o.flowers || [])) {
    const n = o.count || 4, sy = o.sy || 1;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n * W, y = Y(fv);
      g.save(); g.translate(x, y); g.scale(1, sy);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.fillStyle = '#f7a3b5'; g.beginPath(); g.arc(Math.cos(a) * 7, Math.sin(a) * 7, 5.5, 0, 7); g.fill(); }
      g.fillStyle = '#ffd86b'; g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill();
      g.fillStyle = '#8cc79a'; g.beginPath(); g.ellipse(16, 6, 7, 3, 0.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(-16, 6, 7, 3, -0.5, 0, 7); g.fill();
      g.restore();
    }
  }
  return tex(c);
}

// gift wrap
export function giftWrap() {
  const S = 128, { c, g } = canvas(S, S);
  g.fillStyle = '#fbe3a8'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(240,140,160,0.6)'; g.lineWidth = 6;
  for (let k = -S; k < S * 2; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); }
  return tex(c);
}

// straw (hat)
export function straw() {
  const S = 128, hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const a = Math.sin(x / S * Math.PI * 2 * 12), b = Math.sin(y / S * Math.PI * 2 * 12); hgt[y * S + x] = ((Math.floor(x / (S / 12)) + Math.floor(y / (S / 12))) % 2 ? a : b) * 0.5 + 0.5; }
  return normalFromHeight(hgt, S, S, 2.5);
}

// ---------- sprites ----------
export function radial(inner = 'rgba(0,0,0,1)', outer = 'rgba(0,0,0,0)', S = 128, stops) {
  const { c, g } = canvas(S, S), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (stops) stops.forEach(([o, col]) => gr.addColorStop(o, col)); else { gr.addColorStop(0, inner); gr.addColorStop(1, outer); }
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, { clamp: true });
}
export function shadowBlob() {
  return radial(null, null, 128, [[0, 'rgba(40,24,12,0.62)'], [0.35, 'rgba(40,24,12,0.42)'], [0.7, 'rgba(40,24,12,0.12)'], [1, 'rgba(40,24,12,0)']]);
}
export function sparkle() {
  const S = 64, { c, g } = canvas(S, S), m = S / 2;
  const gr = g.createRadialGradient(m, m, 0, m, m, m); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,250,220,0.7)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.moveTo(m, 2); g.quadraticCurveTo(m + 3, m - 3, S - 2, m); g.quadraticCurveTo(m + 3, m + 3, m, S - 2); g.quadraticCurveTo(m - 3, m + 3, 2, m); g.quadraticCurveTo(m - 3, m - 3, m, 2); g.fill();
  return tex(c, { clamp: true });
}
export function petal() {
  const S = 64, { c, g } = canvas(S, S);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(58, 18, 52, 50, 32, 60); g.bezierCurveTo(12, 50, 6, 18, 32, 4); g.fill();
  return tex(c, { clamp: true });
}
export function heart() {
  const S = 64, { c, g } = canvas(S, S);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(4, 36, 6, 8, 24, 10); g.bezierCurveTo(30, 11, 32, 18, 32, 20); g.bezierCurveTo(32, 18, 34, 11, 40, 10); g.bezierCurveTo(58, 8, 60, 36, 32, 56); g.fill();
  return tex(c, { clamp: true });
}
export function note() {
  const S = 64, { c, g } = canvas(S, S);
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(22, 46, 11, 8, -0.4, 0, 7); g.fill(); g.fillRect(29, 10, 5, 36);
  g.beginPath(); g.moveTo(34, 10); g.quadraticCurveTo(52, 16, 50, 32); g.quadraticCurveTo(46, 22, 34, 22); g.fill();
  return tex(c, { clamp: true });
}
export function bubble() {
  return radial(null, null, 64, [[0, 'rgba(255,255,255,0.05)'], [0.75, 'rgba(255,255,255,0.25)'], [0.9, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
}
export function ring() {
  return radial(null, null, 128, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0.9)'], [0.85, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
}

// iris texture for doll eyes (planar-mapped, center = pupil)
export function iris(color = '#6a3d22', ring2 = '#2a160c') {
  const S = 128, { c, g } = canvas(S, S), m = S / 2;
  g.fillStyle = '#fbf8f4'; g.fillRect(0, 0, S, S);
  const R = S * 0.36;
  const gr = g.createRadialGradient(m, m - 4, 2, m, m, R);
  const base = new THREE.Color(color);
  const lighter = base.clone().lerp(new THREE.Color('#e8b878'), 0.45).getStyle();
  gr.addColorStop(0, '#120806'); gr.addColorStop(0.32, '#1a0c08'); gr.addColorStop(0.38, color); gr.addColorStop(0.8, lighter); gr.addColorStop(0.94, color); gr.addColorStop(1, ring2);
  g.fillStyle = gr; g.beginPath(); g.arc(m, m, R, 0, 7); g.fill();
  // radial fibres
  g.globalAlpha = 0.25; g.strokeStyle = '#2a140a'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; g.beginPath(); g.moveTo(m + Math.cos(a) * R * 0.42, m + Math.sin(a) * R * 0.42); g.lineTo(m + Math.cos(a) * R * 0.95, m + Math.sin(a) * R * 0.95); g.stroke(); }
  g.globalAlpha = 1;
  // painted catch-lights (doll eyes)
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(m - R * 0.38, m - R * 0.42, R * 0.2, R * 0.16, -0.5, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(m + R * 0.36, m + R * 0.34, R * 0.08, 0, 7); g.fill();
  // upper shadow
  const sh = g.createLinearGradient(0, m - R, 0, m - R * 0.2); sh.addColorStop(0, 'rgba(30,15,10,0.45)'); sh.addColorStop(1, 'rgba(30,15,10,0)');
  g.fillStyle = sh; g.beginPath(); g.arc(m, m, R, 0, 7); g.fill();
  return tex(c, { clamp: true });
}
