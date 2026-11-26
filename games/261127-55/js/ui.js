// 画面の手前に置くチョーク箱（3D）・白い手のヒント・パパの吹き出し
import * as THREE from '../lib/three.module.min.js';
import { tex } from './tex.js';
import { chalkStick } from './human.js';
import { SUN_DIR } from './world.js';

export const CHALKS = [0xe4675f, 0xf2f0ea, 0x8fb8e6, 0xf3d98a, 0xa6d296];

export class ChalkTray {
  constructor(env) {
    this.scene = new THREE.Scene();
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.9;
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.6); sun.position.copy(SUN_DIR).multiplyScalar(2); sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512); sun.shadow.radius = 4; const c = sun.shadow.camera; c.left = -0.15; c.right = 0.15; c.top = 0.15; c.bottom = -0.15; c.near = 0.5; c.far = 4;
    this.scene.add(sun);
    this.cam = new THREE.PerspectiveCamera(26, 2, 0.05, 5);
    this.cam.position.set(0, 0.37, 0.15); this.cam.lookAt(0, 0, 0.0);
    // 段ボールのトレー
    const cb = new THREE.MeshStandardMaterial({ map: tex('cardboard_col.jpg', { srgb: true }), normalMap: tex('cardboard_nrm.jpg'), roughness: 0.9 });
    const W = 0.2, D = 0.105, H = 0.022, t = 0.003;
    const tray = new THREE.Group();
    const box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cb); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; tray.add(m); };
    box(W, t, D, 0, 0, 0); box(W, H, t, 0, H / 2, D / 2); box(W, H, t, 0, H / 2, -D / 2); box(t, H, D, W / 2, H / 2, 0); box(t, H, D, -W / 2, H / 2, 0);
    // チョークの粉の汚れ
    const dust = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.95, D * 0.9), new THREE.MeshStandardMaterial({ map: tex('soft.png'), transparent: true, opacity: 0.35, color: 0xffffff, depthWrite: false }));
    dust.rotation.x = -Math.PI / 2; dust.position.y = t / 2 + 0.0005; tray.add(dust);
    this.scene.add(tray);
    this.sticks = [];
    CHALKS.forEach((hex, i) => {
      const s = chalkStick(new THREE.Color(hex));
      s.scale.set(1.25, 1.1, 1.25);
      const g = new THREE.Group(); g.add(s);
      s.rotation.x = Math.PI / 2; s.position.z = -0.042;
      g.position.set(-W / 2 + 0.028 + i * 0.036, 0.012, 0.0);
      g.rotation.y = (Math.random() - 0.5) * 0.12;
      g.userData.i = i; s.userData.i = i;
      this.scene.add(g); this.sticks.push(g);
    });
    this.sel = 0; this.visible = false; this.rect = { x: 0, y: 0, w: 0, h: 0 }; this.t = 0; this.pulse = 0;
    this.ray = new THREE.Raycaster();
  }
  get color() { return new THREE.Color(CHALKS[this.sel]); }
  layout(W, H) {
    const w = Math.min(W * 0.6, 360, H * 0.55), h = w * 0.55;
    this.rect = { x: 10, y: H - h - 6, w, h };
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  hit(x, y) {
    const r = this.rect; if (!this.visible) return -1;
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return -1;
    const nx = ((x - r.x) / r.w) * 2 - 1, ny = -(((y - r.y) / r.h) * 2 - 1);
    // いちばん近いチョーク（指が太くても選べるように）
    let best = -1, bd = 1e9;
    this.sticks.forEach((s, i) => {
      const p = s.position.clone(); p.z -= 0.0; p.project(this.cam);
      const d = Math.abs(p.x - nx) * 1.0 + Math.abs(p.y - ny) * 0.3;
      if (d < bd) { bd = d; best = i; }
    });
    return bd < 0.5 ? best : -2;
  }
  update(dt) {
    this.t += dt;
    this.sticks.forEach((s, i) => {
      const on = i === this.sel;
      s.position.y += ((on ? 0.03 : 0.012) - s.position.y) * (1 - Math.exp(-dt * 10));
      s.rotation.z += ((on ? 0.25 : 0) - s.rotation.z) * (1 - Math.exp(-dt * 10));
      s.position.x += ((-0.1 + 0.028 + i * 0.036) - s.position.x) * 0.2;
    });
    if (this.pulse > 0) { this.pulse -= dt; const s = this.sticks[this.sel]; s.rotation.x = Math.sin(this.pulse * 30) * 0.08 * this.pulse; }
  }
  render(renderer, W, H) {
    if (!this.visible) return;
    const r = this.rect;
    renderer.setScissorTest(true);
    renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h); renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
  }
}

// 白い手（指さし）— SVG 図形
export function makeHintHand() {
  const d = document.createElement('div');
  d.id = 'hint';
  d.innerHTML = `<svg viewBox="0 0 100 120" width="74" height="88" aria-hidden="true">
    <defs><filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.35"/></filter></defs>
    <g filter="url(#sh)" fill="#ffffff" stroke="#b9b9b9" stroke-width="2.5" stroke-linejoin="round">
      <path d="M40 8 c0-6 12-6 12 0 v44 c2-5 11-5 12 1 v4 c2-5 11-4 11 2 v5 c2-5 11-4 11 2 v22 c0 18-10 30-28 30 h-6 c-12 0-20-6-26-16 l-14-24 c-3-6 4-11 9-6 l9 10 z"/>
    </g></svg>`;
  document.body.appendChild(d);
  return d;
}

// 吹き出し（絵だけ）
export function makeBubble() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sp.scale.set(0.42, 0.42, 1); sp.renderOrder = 6;
  sp.userData.draw = (kind) => {
    const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.strokeStyle = 'rgba(120,120,120,0.6)'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(128, 110, 108, 92, 0, 0, 6.283); g.fill(); g.stroke();
    g.beginPath(); g.arc(70, 214, 14, 0, 6.283); g.fill(); g.stroke(); g.beginPath(); g.arc(44, 240, 8, 0, 6.283); g.fill(); g.stroke();
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'ball') {
      const gr = g.createRadialGradient(108, 90, 8, 128, 110, 56); gr.addColorStop(0, '#ff9d8a'); gr.addColorStop(1, '#c23a2e');
      g.fillStyle = gr; g.beginPath(); g.arc(128, 110, 52, 0, 6.283); g.fill(); g.strokeStyle = '#5a1a15'; g.lineWidth = 3; g.beginPath(); g.ellipse(128, 110, 52, 14, 0, 0, 6.283); g.stroke();
    } else if (kind === 'box') {
      g.fillStyle = '#b8895a'; g.beginPath(); g.moveTo(70, 90); g.lineTo(150, 90); g.lineTo(150, 160); g.lineTo(70, 160); g.fill();
      g.fillStyle = '#a07448'; g.beginPath(); g.moveTo(150, 90); g.lineTo(186, 70); g.lineTo(186, 138); g.lineTo(150, 160); g.fill();
      g.fillStyle = '#d0a273'; g.beginPath(); g.moveTo(70, 90); g.lineTo(106, 70); g.lineTo(186, 70); g.lineTo(150, 90); g.fill();
    } else {
      g.strokeStyle = '#a77a4a'; g.lineWidth = 10; g.beginPath(); g.moveTo(96, 50); g.lineTo(96, 175); g.moveTo(160, 50); g.lineTo(160, 175); g.stroke();
      g.lineWidth = 7; for (let y = 66; y < 175; y += 26) { g.beginPath(); g.moveTo(96, y); g.lineTo(160, y); g.stroke(); }
    }
    t.needsUpdate = true;
  };
  return sp;
}
