// Finger demonstration overlay (shown once after ~4 s without touching; disappears on touch).
import * as THREE from 'three';

export function makeHand(root) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:0;top:0;width:76px;height:76px;pointer-events:none;opacity:0;z-index:3;will-change:transform,opacity;';
  el.innerHTML = `<svg viewBox="0 0 76 76" width="76" height="76" aria-hidden="true">
    <defs><filter id="hs" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.45"/></filter></defs>
    <circle id="rip" cx="24" cy="10" r="10" fill="none" stroke="#fff" stroke-width="3" opacity="0"/>
    <path filter="url(#hs)" d="M20 10c0-4 6-4 6 0v22l2-1c0-4 6-4 6 0l1 1c0-4 6-4 6 0v2c0-4 6-4 6 0v14c0 10-6 18-16 18h-3c-6 0-10-3-13-8L8 44c-2-3 1-6 4-5l8 6V10z" fill="#fffaf0" fill-opacity="0.94" stroke="#6b5a45" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
  root.appendChild(el);
  const rip = el.querySelector('#rip');
  let cur = null, t = 0;
  const api = {
    demo(inv, game) { cur = { inv }; t = 0; },
    hide() { cur = null; el.style.opacity = '0'; },
    update(dt, game) {
      if (!cur) return;
      t += dt;
      const inv = cur.inv;
      let p0, p1, press = 0.5, dur = 2.6;
      const W = game.dom.w, H = game.dom.h;
      if (inv.kind === 'sun' || inv.kind === 'moon') {
        const s = inv.kind === 'sun' ? game.skyScreen(game.sunEl, game.sunAz) : game.skyScreen(game.moonEl, game.moonAz);
        p0 = { x: s.x, y: s.y }; p1 = { x: s.x, y: s.y + H * 0.2 };
      } else {
        const tf = inv.tuft;
        if (!tf) { api.hide(); return; }
        const b = game.screenOf(new THREE.Vector3(tf.x, tf.h * 0.55, tf.z));
        const dx = inv.short ? W * 0.12 : W * 0.34 * (inv.dir || 1);
        p0 = { x: b.x - dx * 0.35, y: b.y }; p1 = { x: b.x + dx * 0.65, y: b.y + 4 };
        press = 0.35;
      }
      // keep inside the safe area
      const sa = game.dom.safe || { l: 0, r: 0, t: 0, b: 0 };
      const cl = (p) => ({ x: Math.min(W - sa.r - 30, Math.max(sa.l + 10, p.x)), y: Math.min(H - sa.b - 40, Math.max(sa.t + 10, p.y)) });
      p0 = cl(p0); p1 = cl(p1);
      // timeline: fade in at p0, press, drag to p1, lift, fade out
      let x, y, op, ripA = 0, sc = 1;
      if (t < 0.4) { x = p0.x; y = p0.y - 30 * (1 - t / 0.4); op = t / 0.4; }
      else if (t < 0.4 + press) { x = p0.x; y = p0.y; op = 1; const k = (t - 0.4) / press; sc = 1 - 0.12 * Math.sin(k * Math.PI * 0.5); ripA = 1 - k; }
      else if (t < dur - 0.6) { const k = (t - 0.4 - press) / (dur - 1.0 - press); const e = k * k * (3 - 2 * k); x = p0.x + (p1.x - p0.x) * e; y = p0.y + (p1.y - p0.y) * e; op = 1; sc = 0.88; }
      else if (t < dur) { x = p1.x; y = p1.y; op = 1 - (t - (dur - 0.6)) / 0.6; sc = 1; }
      else { api.hide(); return; }
      el.style.opacity = String(op * 0.95);
      el.style.transform = `translate(${x - 24}px, ${y - 10}px) scale(${sc})`;
      rip.setAttribute('opacity', String(ripA * 0.8));
      rip.setAttribute('r', String(10 + (1 - ripA) * 12));
    },
    get visible() { return !!cur; },
  };
  return api;
}
