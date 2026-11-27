import * as THREE from '../../lib/three.module.js';

function makeCanvas(size = 128) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}

// Horizontal Lapland log-cabin timber texture (zero external assets)
export function makeLogTexture() {
  if (typeof document === 'undefined') return null;
  const [c, ctx] = makeCanvas(256);
  ctx.fillStyle = '#c8bfb4';
  ctx.fillRect(0, 0, 256, 256);
  const rows = 8;
  const rh = 256 / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * rh;
    const g = ctx.createLinearGradient(0, y, 0, y + rh);
    g.addColorStop(0.0, '#78726c');
    g.addColorStop(0.14, '#c4bdb5');
    g.addColorStop(0.5, '#e8e2da');
    g.addColorStop(0.86, '#b8b0a6');
    g.addColorStop(1.0, '#625c56');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 256, rh);

    ctx.strokeStyle = 'rgba(70, 56, 44, 0.16)';
    ctx.lineWidth = 1;
    for (let s = 0; s < 5; s++) {
      ctx.beginPath();
      const sy = y + 6 + s * 5;
      ctx.moveTo(0, sy);
      ctx.bezierCurveTo(85, sy + ((i + s) % 3 - 1) * 2, 170, sy - ((i + s) % 2) * 2, 256, sy);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Nordic granite masonry cobble texture for cabin plinths, oven, and cairns
export function makeStoneTexture() {
  if (typeof document === 'undefined') return null;
  const [c, ctx] = makeCanvas(128);
  ctx.fillStyle = '#8b929e';
  ctx.fillRect(0, 0, 128, 128);
  const rows = 4;
  const rh = 128 / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4;
    const cw = 128 / cols;
    const off = (r % 2) * (cw * 0.5);
    for (let k = -1; k <= cols; k++) {
      const shade = 158 + ((r * 19 + k * 31) % 44);
      ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 12})`;
      ctx.fillRect(k * cw + off + 2, r * rh + 2, cw - 4, rh - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Steep Nordic slate/shingle roof texture
export function makeRoofTexture() {
  if (typeof document === 'undefined') return null;
  const [c, ctx] = makeCanvas(128);
  ctx.fillStyle = '#c4cbd4';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    const g = ctx.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, '#9aa4b2');
    g.addColorStop(0.85, '#d8dee6');
    g.addColorStop(1, '#7a8391');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 128, 16);
    ctx.fillStyle = 'rgba(40, 48, 62, 0.25)';
    for (let x = ((y / 16) % 2) * 16; x < 128; x += 32) {
      ctx.fillRect(x, y, 1.5, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft circular particle sprite (replaces hard square GL points)
export function makeSpriteTexture() {
  if (typeof document === 'undefined') return null;
  const [c, ctx] = makeCanvas(64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.45, 'rgba(245, 252, 255, 0.72)');
  g.addColorStop(1.0, 'rgba(220, 240, 255, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Warm radial light-pool texture projected onto snow under lanterns & windows
export function makePoolTexture(rgb = '255, 200, 110') {
  if (typeof document === 'undefined') return null;
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0.0, `rgba(${rgb}, 0.62)`);
  g.addColorStop(0.45, `rgba(${rgb}, 0.24)`);
  g.addColorStop(1.0, `rgba(${rgb}, 0.0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
