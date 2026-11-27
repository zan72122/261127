// Wordless guidance: one soft invitation at a time, and a single hand demonstration.
import * as THREE from 'three';
import { L } from './layout.js';
import { P_SPARK } from './fx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export const Guide = {
  initGuide() {
    this.hint = null; this.hintCheck = 0; this.hintA = 0;
    this.handEl = document.getElementById('hand');
    this.demo = { phase: this.flags.demoDone ? 'done' : 'wait', t: 0, start: new THREE.Vector3() };
    this.demoAbort = () => {
      const D = this.demo; if (D.phase === 'done') return;
      const wasRun = D.phase === 'run'; D.phase = 'done'; this.flags.demoDone = true;
      if (this.handEl) this.handEl.classList.remove('show', 'pin');
      if (wasRun) { const d = this.doll.mimi; d.st = 'stand'; d.dropFrom.copy(d.root.position); d.dropTo.copy(D.start); d.dropT = 0; this.log('demoAbort', ''); }
    };
  },
  hintCandidate() {
    const f = this.flags, it = this.item, d = this.doll, t = this.time;
    const visible = x => !x.away;
    if (!f.picked) return { name: 'pickMain', obj: d.mimi, pos: () => d.mimi.chest.getWorldPosition(_v) };
    const porchDoll = this.dolls.find(x => !x.away && x.zone === 'porch' && !x.walk);
    if (porchDoll && this.doorState.a < 0.5) return { name: 'door', pos: () => this.room.doorKnob.getWorldPosition(_v) };
    if (porchDoll && !f.greet) return { name: 'porch', obj: porchDoll, pos: () => porchDoll.chest.getWorldPosition(_v) };
    if (!f.shelf) { const w = this.dolls.find(x => visible(x) && x.zone === 'in' && x.footSlots.some(s => s.occupant)); if (w) { const sh = w.footSlots.find(s => s.occupant).occupant; return { name: 'shoes', item: sh, pos: () => _v.copy(sh.pos).add(_v2.set(0, 0.01, 0)) }; } }
    if (!f.sat) { const c = L.chairs.findIndex((c, i) => !this.seatOccupant(i)); if (c >= 0) return { name: 'chair', pos: () => _v.set(L.chairs[c].x, L.seatH + 0.012, L.chairs[c].z) }; }
    if (!f.eat) { const s = this.items.find(x => x.kind === 'slice' && !x.hidden && x.slot && x.slot.type === 'cake'); if (s) return { name: 'cake', item: s, pos: () => _v.copy(s.pos).add(_v2.set(0, 0.03, 0)) }; }
    if (!f.pour) return { name: 'tea', item: it.pot, pos: () => _v.copy(it.pot.pos).add(_v2.set(0, 0.04, 0)) };
    if (!f.cheers && !f.give) { const c = this.items.find(x => x.kind === 'cup' && x.data.level > 0.3 && !x.held); if (c) return { name: 'cheers', item: c, pos: () => _v.copy(c.pos).add(_v2.set(0, 0.025, 0)) }; }
    if (!f.deco) return { name: 'deco', item: it.wreath, pos: () => _v.copy(it.wreath.pos).add(_v2.set(0, 0.01, 0)) };
    if (!it.gift.data.open && visible(d.hana)) return { name: 'gift', item: it.gift, pos: () => _v.copy(it.gift.pos).add(_v2.set(0, 0.045, 0)) };
    if (this.play > 300 && !f.slept) { const b = it.blanket; if (!(b.slot && b.slot.type === 'bed')) return { name: 'bed', item: b, pos: () => b.held ? _v.copy(b.pos) : _v.copy(b.pos).add(_v2.set(0, 0.03, 0)) }; return { name: 'bed', pos: () => _v.set(L.bed.headX + 0.03, L.bed.top + 0.03, L.bed.spots[1]) }; }
    return null;
  },
  updateGuide(dt) {
    this.updateDemo(dt);
    this.hintCheck -= dt;
    if (this.hintCheck <= 0) { this.hintCheck = 0.5; const c = this.hintCandidate(); if (!c || !this.hint || c.name !== this.hint.name) this.hint = c; if (this.hint) this.hint.lastHop = this.hint.lastHop || 0; }
    const show = this.hint && !this.drag && this.idle > 2.6 && this.demo.phase !== 'run';
    this.hintA += ((show ? 1 : 0) - this.hintA) * (1 - Math.exp(-dt * (show ? 2 : 8)));
    const g = this.hintGlow;
    if (this.hint && this.hintA > 0.01) {
      const p = this.hint.pos(); this.hint.posV = p.clone();
      g.position.copy(p); const pulse = 0.6 + 0.4 * Math.sin(this.time * 3.2);
      g.material.opacity = this.hintA * (0.45 + 0.35 * pulse);
      const sc = 0.06 + 0.02 * pulse; g.scale.set(sc, sc, 1);
      this.hint.pos2 = p;
      // a small hop / sparkle on the invited object, now and then
      if (show && this.time - this.hint.lastHop > 2.8) {
        this.hint.lastHop = this.time;
        if (this.hint.obj && this.hint.obj.st === 'stand') this.gesture(this.hint.obj, 'hop');
        if (this.hint.item) this.hint.item.hopT = 0;
        this.fx.emit({ pos: p.clone().add(_v2.set(0.012, 0.012, 0.01)), vel: _v2.set(0, 0.02, 0), cell: P_SPARK, size: 0.012, life: 0.9, col: '#fff8e0' });
      }
    } else g.material.opacity = 0;
    // expose a plain position for gaze
    if (this.hint && this.hint.posV) this.hint.posVec = this.hint.posV;
    // portrait: when the invitation is in the other room, the edge light breathes a little brighter
    const port = this.S.w / this.S.h < 1.2, hp = this.hint && this.hint.posV;
    const want = port && show && hp ? (this.S.viewName === 'living' && hp.x > L.divX ? 'R' : this.S.viewName === 'bed' && hp.x < L.divX ? 'L' : '') : '';
    if (want !== this.edgeHint) { this.edgeHint = want; for (const k of ['L', 'R']) { const el = document.getElementById('edge' + k); if (el) el.classList.toggle('hint', want === k); } }
  },

  updateDemo(dt) {
    const D = this.demo, d = this.doll.mimi;
    if (D.phase === 'wait') {
      if (this.flags.firstTouch || this.flags.picked) { D.phase = 'done'; this.flags.demoDone = true; return; }
      if (this.time > 4 && this.idle > 4 && d.st === 'stand' && d.dropT >= 1) {
        D.phase = 'run'; D.t = 0; D.start.copy(d.root.position);
        const c = L.chairs[0]; D.end = new THREE.Vector3(c.x - 0.004, 0.0, c.z + 0.02);
        this.log('demoStart', '');
      }
      return;
    }
    if (D.phase !== 'run') return;
    D.t += dt; const t = D.t;
    const el = this.handEl;
    // doll motion: lift -> carry -> hover over chair -> carry back -> set down where it was
    const lift = 0.03;
    let p = _v;
    if (t < 0.6) p.copy(D.start);
    else if (t < 0.85) { p.copy(D.start); p.y = lift * ((t - 0.6) / 0.25); }
    else if (t < 2.05) { const k = ease((t - 0.85) / 1.2); p.lerpVectors(D.start, D.end, k); p.y = lift + Math.sin(Math.PI * k) * 0.03; }
    else if (t < 2.55) { p.copy(D.end); p.y = lift + 0.02 * Math.sin(Math.PI * (t - 2.05) / 0.5); }
    else if (t < 3.6) { const k = ease((t - 2.55) / 1.05); p.lerpVectors(D.end, D.start, k); p.y = lift + Math.sin(Math.PI * k) * 0.025; }
    else if (t < 3.85) { p.copy(D.start); p.y = lift * (1 - (t - 3.6) / 0.25); }
    else { p.copy(D.start); }
    if (t >= 0.6 && t < 3.85) { d.st = 'held'; d.root.position.copy(p); d.yawT = 0.25; }
    if (t >= 3.85 && d.st === 'held') { d.st = 'stand'; d.dropFrom.copy(d.root.position); d.dropTo.copy(D.start); d.dropT = 0; }
    // hand overlay follows the doll's chest
    if (el) {
      const s = this.scr(d.chest.getWorldPosition(_v2));
      const appear = t < 0.6 ? t / 0.6 : 1;
      const ox = (1 - appear) * 60, oy = (1 - appear) * 50;
      el.style.transform = `translate(${(s.x + ox).toFixed(1)}px, ${(s.y + oy).toFixed(1)}px)`;
      if (t > 0.05) el.classList.add('show');
      if (t > 0.55 && t < 3.85) el.classList.add('pin'); else el.classList.remove('pin');
      if (t > 3.9) el.classList.remove('show');
    }
    if (t > 4.4) { D.phase = 'done'; this.flags.demoDone = true; this.log('demoDone', ''); this.saveSoon(); }
  },
};
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
