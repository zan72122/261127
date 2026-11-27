import * as THREE from '../../lib/three.module.js';
import { PALETTE } from './env.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Woven Moroccan kilim carpet texture (base terracotta/sand + saffron & turquoise geometric motifs). */
export function makeCarpetTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = PALETTE.terracotta;
  ctx.fillRect(0, 0, 512, 512);

  // Outer saffron & indigo border bands
  ctx.strokeStyle = PALETTE.saffron;
  ctx.lineWidth = 24;
  ctx.strokeRect(18, 18, 476, 476);

  ctx.strokeStyle = PALETTE.indigoNight;
  ctx.lineWidth = 10;
  ctx.strokeRect(38, 38, 436, 436);

  ctx.strokeStyle = PALETTE.turquoise;
  ctx.lineWidth = 8;
  ctx.strokeRect(54, 54, 404, 404);

  // Inner cream field
  ctx.fillStyle = '#c89b6e';
  ctx.fillRect(68, 68, 376, 376);

  // Geometric stepped lozenges along center
  const drawDiamond = (cx, cy, rx, ry, fill, stroke) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  };

  drawDiamond(256, 256, 128, 154, PALETTE.terracottaDark, PALETTE.saffron);
  drawDiamond(256, 256, 86, 108, PALETTE.turquoise, PALETTE.creamCloth);
  drawDiamond(256, 256, 42, 56, PALETTE.saffron, PALETTE.indigoNight);
  drawDiamond(256, 256, 16, 22, PALETTE.creamCloth, null);

  // Corner & border chevron motifs
  for (const [bx, by] of [[116, 116], [396, 116], [116, 396], [396, 396]]) {
    drawDiamond(bx, by, 26, 26, PALETTE.indigoNight, PALETTE.saffron);
    drawDiamond(bx, by, 11, 11, PALETTE.turquoise, null);
  }

  // Subtle woven thread grain
  ctx.fillStyle = 'rgba(28, 18, 12, 0.08)';
  for (let y = 0; y < 512; y += 4) {
    ctx.fillRect(0, y, 512, 1);
  }
  ctx.fillStyle = 'rgba(255, 240, 210, 0.06)';
  for (let x = 0; x < 512; x += 6) {
    ctx.fillRect(x, 0, 1, 512);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Subtle wind-rippled sand bump texture. */
export function makeSandBumpTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  const img = ctx.createImageData(256, 256);
  const d = img.data;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const u = (x / 256) * Math.PI * 2;
      const v = (y / 256) * Math.PI * 2;
      const ripple =
        Math.sin(v * 14 + Math.sin(u * 2) * 1.1) * 0.55 +
        Math.sin(v * 28 + u * 2) * 0.2 +
        Math.cos(u * 5 + v * 3) * 0.15;
      const grain = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 0.15;
      const val = Math.max(0, Math.min(255, Math.round((0.5 + ripple * 0.35 + grain * 0.12) * 255)));
      const i = (y * 256 + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  return tex;
}

/** Mudbrick / pise plaster subtle surface variation texture. */
export function makeAdobeTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#d4b48c';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = y % 32 === 0 ? 'rgba(130, 82, 54, 0.07)' : 'rgba(255, 240, 215, 0.06)';
    ctx.fillRect(0, y, 256, 12);
    for (let x = (y % 32 === 0 ? 0 : 16); x < 256; x += 32) {
      ctx.fillStyle = 'rgba(110, 68, 44, 0.06)';
      ctx.fillRect(x, y, 2, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/** Turquoise & saffron zellige mosaic tile pattern (wordless). */
export function makeZelligeTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = PALETTE.creamCloth;
  ctx.fillRect(0, 0, 256, 256);
  const step = 32;
  for (let y = 0; y < 256; y += step) {
    for (let x = 0; x < 256; x += step) {
      const cx = x + step * 0.5;
      const cy = y + step * 0.5;
      const odd = ((x / step + y / step) | 0) % 2 === 0;
      ctx.fillStyle = odd ? PALETTE.turquoise : PALETTE.indigoNight;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 13);
      ctx.lineTo(cx + 13, cy);
      ctx.lineTo(cx, cy + 13);
      ctx.lineTo(cx - 13, cy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = odd ? PALETTE.saffron : PALETTE.turquoiseGlow;
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/** Soft radial glow sprite for round stardust sparks & carpet aura (no hard squares). */
export function makeRadialGlowTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Geometric Moroccan courtyard & terrace floor tile texture (wordless). */
export function makeCourtyardTileTexture(repeatX = 4, repeatY = 4) {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#c89b70';
  ctx.fillRect(0, 0, 256, 256);

  const cell = 64;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      const cx = x + cell * 0.5;
      const cy = y + cell * 0.5;
      ctx.fillStyle = '#b47452';
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);

      ctx.fillStyle = '#d9be98';
      ctx.beginPath();
      ctx.moveTo(cx, y + 8);
      ctx.lineTo(x + cell - 8, cy);
      ctx.lineTo(cx, y + cell - 8);
      ctx.lineTo(x + 8, cy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = ((x / cell + y / cell) | 0) % 2 === 0 ? PALETTE.turquoise : PALETTE.saffron;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 11);
      ctx.lineTo(cx + 11, cy);
      ctx.lineTo(cx, cy + 11);
      ctx.lineTo(cx - 11, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/** Striped woven fabric canopy texture for Moroccan awnings (zero text). */
export function makeAwningStripeTexture(accentHex = PALETTE.saffron) {
  const [c, ctx] = makeCanvas(256, 128);
  const stripes = 8;
  const sw = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? accentHex : PALETTE.creamCloth;
    ctx.fillRect(i * sw, 0, sw, 128);
  }
  ctx.fillStyle = PALETTE.terracottaDark;
  ctx.fillRect(0, 114, 256, 14);
  ctx.fillStyle = 'rgba(30, 18, 12, 0.08)';
  for (let y = 0; y < 128; y += 4) ctx.fillRect(0, y, 256, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
