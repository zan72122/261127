import * as THREE from '../../lib/three.module.js';

let _cache = null;

function makeCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function getWorldTextures({ low = false } = {}) {
  if (_cache) return _cache;
  const sz = low ? 128 : 256;

  // 1. Ryukyu coral-limestone masonry (coursed stone blocks + porous pitting)
  const limestone = makeCanvas(sz, (ctx, s) => {
    ctx.fillStyle = '#bcb3a2';
    ctx.fillRect(0, 0, s, s);
    const rows = 6;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const cols = 4;
      const cw = s / cols;
      const offset = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const bx = c * cw + offset;
        const by = r * rh;
        const shade = 205 + (((r * 13 + c * 29) & 15) - 8);
        ctx.fillStyle = `rgb(${shade}, ${shade - 8}, ${shade - 22})`;
        ctx.fillRect(bx + 2, by + 2, cw - 4, rh - 4);
      }
    }
    ctx.fillStyle = 'rgba(110, 102, 88, 0.16)';
    for (let i = 0; i < (low ? 90 : 220); i++) {
      const px = ((i * 73) % s);
      const py = ((i * 137) % s);
      ctx.fillRect(px, py, 2, 2);
    }
  });
  limestone.colorSpace = THREE.SRGBColorSpace;
  limestone.repeat.set(2, 1);

  // 2. Okinawan kawara roof-tile vertical rib pattern
  const roofTile = makeCanvas(sz, (ctx, s) => {
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(0, 0, s, s);
    const cols = 12;
    const cw = s / cols;
    for (let i = 0; i < cols; i++) {
      const x = i * cw;
      const g = ctx.createLinearGradient(x, 0, x + cw, 0);
      g.addColorStop(0.0, '#b5b5b5');
      g.addColorStop(0.45, '#f2f2f2');
      g.addColorStop(0.85, '#c6c6c6');
      g.addColorStop(1.0, '#9e9e9e');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, cw, s);
    }
    const rows = 8;
    const rh = s / rows;
    ctx.fillStyle = 'rgba(80, 70, 65, 0.18)';
    for (let r = 0; r < rows; r++) {
      ctx.fillRect(0, r * rh, s, 2);
    }
  });
  roofTile.colorSpace = THREE.SRGBColorSpace;
  roofTile.repeat.set(2, 2);

  // 3. Weathered timber planks (piers, engawa, sabani)
  const woodPlank = makeCanvas(sz, (ctx, s) => {
    ctx.fillStyle = '#d4cbbd';
    ctx.fillRect(0, 0, s, s);
    const planks = 6;
    const pw = s / planks;
    for (let i = 0; i < planks; i++) {
      const x = i * pw;
      const tone = 212 + (((i * 19) % 16) - 8);
      ctx.fillStyle = `rgb(${tone}, ${tone - 10}, ${tone - 22})`;
      ctx.fillRect(x + 1, 0, pw - 2, s);
      ctx.fillStyle = 'rgba(70, 52, 38, 0.25)';
      ctx.fillRect(x, 0, 2, s);
      for (let g = 0; g < 6; g++) {
        ctx.fillStyle = 'rgba(95, 72, 52, 0.08)';
        ctx.fillRect(x + 3 + ((g * 7) % Math.max(4, pw - 6)), 0, 1, s);
      }
    }
  });
  woodPlank.colorSpace = THREE.SRGBColorSpace;
  woodPlank.repeat.set(1, 2);

  // 4. Fine sand & seabed ripple bump map
  const sandRipple = makeCanvas(sz, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = (x / s) * Math.PI * 2;
        const v = (y / s) * Math.PI * 2;
        const r1 = Math.sin(v * 6 + Math.sin(u * 2) * 0.7) * 0.5 + 0.5;
        const grain = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const val = Math.max(0, Math.min(255, Math.round((r1 * 0.68 + Math.abs(grain) * 0.32) * 255)));
        const idx = (y * s + x) * 4;
        d[idx] = val;
        d[idx + 1] = val;
        d[idx + 2] = val;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  sandRipple.repeat.set(34, 46);

  _cache = { limestone, roofTile, woodPlank, sandRipple };
  return _cache;
}
