// Interaction rules: greetings, handing over, eating, pouring, cheers, decorations, shoes, bed, arrivals, chatter.
import * as THREE from 'three';
import { L } from './layout.js';
import { DOLL } from './doll.js';
import { P_SPARK, P_PETAL, P_HEART, P_NOTE, P_BUBBLE, P_DOT, P_CRUMB } from './fx.js';
import { glowSprite } from './fx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PAIR = (a, b) => a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
const GIVE_PRI = { gift: 5, slice: 4, cookie: 4, cup: 3, bouquet: 3, plate: 2, wreath: 2, ribbon: 2, spoon: 1, pot: 1 };

export const Rules = {
  rulesInit() {
    if (this._rulesInit) return; this._rulesInit = true;
    this.pairs = {}; this.respawn = []; this.chatT = 4; this.giveCount = 0; this.giveT = -99; this.cheerCount = 0; this.cheerT = -99; this.pouring = null; this.lastDeco = null;
  },
  pairState(a, b) { const k = PAIR(a, b); return this.pairs[k] || (this.pairs[k] = { greet: false, give: false, cheer: false, chatT: 0, n: 0 }); },
  awake(d) { return !d.away && !d.sleeping && d.st !== 'lie' && !d.walk; },
  handPos(d, i, out) { return d.sockets[i].getWorldPosition(out); },
  freeHand(d) { if (!d.handSlots[1].occupant) return 1; if (!d.handSlots[0].occupant) return 0; return -1; },

  updateRules(dt) {
    this.rulesInit();
    const t = this.time;
    // respawning food
    for (let i = this.respawn.length - 1; i >= 0; i--) { const r = this.respawn[i]; if (t >= r.at) { if (this.refill(r.item)) this.respawn.splice(i, 1); else r.at = t + 1; } }
    const dragD = this.drag && this.drag.type === 'doll' ? this.drag.obj : null;
    const dragI = this.drag && this.drag.type === 'item' ? this.drag.obj : null;
    // --- door greetings
    this.ruleGreet(dt);
    // --- dragged doll meets others: hand over / cheers
    if (dragD) {
      for (const o of this.dolls) {
        if (o === dragD || !this.awake(o) || o.st === 'held') continue;
        const ps = this.pairState(dragD, o);
        const dist = dragD.root.position.distanceTo(o.root.position);
        if (dist > 0.34) { ps.give = false; ps.cheer = false; }
        this.ruleGive(dragD, o, ps);
        this.ruleCheers(dragD, o, ps);
      }
    }
    // --- carried item effects: eating / drinking / pouring
    const pourer = dragI && dragI.kind === 'pot' ? dragI : (dragD ? dragD.handSlots.map(s => s.occupant).find(x => x && x.kind === 'pot') : null);
    this.rulePour(pourer, dt);
    if (dragI) this.ruleFeed(dragI);
    if (dragD) for (const s of dragD.handSlots) if (s.occupant && s.occupant.kind === 'spoon') this.ruleScoop(s.occupant);
    if (dragI && dragI.kind === 'spoon') this.ruleScoop(dragI);
    // --- anticipation: free hands reach for nearby food
    this.ruleReach();
    // --- auto bites after receiving food
    for (const d of this.dolls) if (d.autoEat && t >= d.autoEat.at) { const a = d.autoEat; d.autoEat = null; const it = a.item; if (it.slot && it.slot.doll === d && !it.hidden && this.awake(d)) this.handToMouth(d, it); }
    // --- bed peeking
    this.rulePeek();
    // --- chatter between friends
    this.chatT -= dt; if (this.chatT <= 0) { this.chatT = 1.0; if (!this.drag) this.ruleChat(); }
    // --- arrivals
    this.ruleArrive(dt);
  },

  // ---------------------------------------------------------------- greeting at the door
  onDoorOpened(byTap) {
    for (const k in this.pairs) this.pairs[k].greet = false;
    const porch = this.dolls.filter(d => !d.away && d.zone === 'porch' && !d.walk);
    for (const p of porch) { if (!this.dolls.some(i => i.zone === 'in' && !i.away && i.root.position.distanceTo(p.root.position) < 0.34)) { this.gesture(p, 'wave', { side: 1, delay: 0.3 }); this.setMood(p, 'open', 0.6, 0.6, 1.4); this.sound.wave(p.id); } }
    if (byTap && !porch.length) this.tryEarlyArrival();
  },
  ruleGreet() {
    if (this.doorState.a < 0.95) return;
    const dc = _v4.set(L.door.x, 0, L.room.z0);
    const porch = this.dolls.filter(d => !d.away && d.zone === 'porch' && !d.walk);
    const inside = this.dolls.filter(d => !d.away && d.zone === 'in' && d.st !== 'lie' && d.st !== 'sit');
    for (const p of porch) for (const i of inside) {
      const ps = this.pairState(p, i);
      const di = Math.hypot(i.root.position.x - dc.x, i.root.position.z - dc.z), dp = Math.hypot(p.root.position.x - dc.x, p.root.position.z - dc.z);
      if (di > 0.3 || dp > 0.2) { if (di > 0.36) ps.greet = false; continue; }
      if (ps.greet) continue;
      if (p.st === 'held' && i.st === 'held') continue;
      ps.greet = true;
      // the host steps a little aside so both faces can be seen through the doorway
      if (i.st === 'stand' && !i.walk && Math.abs(i.root.position.x - L.door.x) < 0.075) {
        const to = V(L.door.x + 0.105, 0, Math.max(i.root.position.z, L.room.z0 + 0.07));
        i.walk = { from: i.root.position.clone(), to, t: 0, dur: 0.45, endYaw: Math.atan2(p.root.position.x - to.x, p.root.position.z - to.z) };
      }
      for (const [a, b] of [[p, i], [i, p]]) {
        if (a.st !== 'held') a.yawT = Math.atan2(b.root.position.x - a.root.position.x, b.root.position.z - a.root.position.z);
        a.focus = { doll: b, until: this.time + 2.6 };
        this.gesture(a, 'bow', { delay: a === p ? 0.15 : 0.35 });
        this.setMood(a, 'open', 0.7, 0.5, 2.2);
      }
      this.sound.greet(i.id, p.id);
      const mid = _v.addVectors(p.head.getWorldPosition(_v2), i.head.getWorldPosition(_v3)).multiplyScalar(0.5);
      this.fx.burst(mid, 5, { cell: P_SPARK, size: 0.01, col: '#fff3c4', speed: 0.06, up: 0.05, life: 0.9 });
      this.flags.greet = (this.flags.greet || 0) + 1;
      this.sound.bump(0.15);
      this.log('greet', i.id + '<>' + p.id);
    }
  },

  // ---------------------------------------------------------------- hand over (dragged doll gives to a friend)
  ruleGive(a, b, ps) {
    if (ps.give) return;
    const fh = this.freeHand(b); if (fh < 0) return;
    let best = null, bp = 0, bi = -1;
    for (let i = 0; i < 2; i++) { const it = a.handSlots[i].occupant; if (!it || it.kind === 'pot') continue; const pr = GIVE_PRI[it.kind] || 1; if (pr > bp) { bp = pr; best = it; bi = i; } }
    if (!best) return;
    const ip = _v.set(0, best.pickY, 0).add(best.pos);
    const reach = Math.min(ip.distanceTo(b.chest.getWorldPosition(_v2)), ip.distanceTo(this.handPos(b, 0, _v3)), ip.distanceTo(this.handPos(b, 1, _v3)), ip.distanceTo(b.head.getWorldPosition(_v3)) + 0.02);
    if (reach > (this.dropGive ? 0.15 : 0.13)) return;
    // both holding cups -> cheers instead
    if (best.kind === 'cup' && b.handSlots.some(s => s.occupant && s.occupant.kind === 'cup')) return;
    ps.give = true;
    this.giveTo(a, b, best, fh);
  },
  // a carried doll that is set down right next to a friend still hands over what it holds
  giveOnDrop(a) {
    if (!this.awake(a)) return;
    this.dropGive = true;
    try { for (const o of this.dolls) { if (o === a || !this.awake(o) || o.st === 'held') continue; const ps = this.pairState(a, o); if (a.root.position.distanceTo(o.root.position) < 0.2) this.ruleGive(a, o, ps); } }
    finally { this.dropGive = false; }
  },
  giveTo(a, b, it, hand) {
    const t = this.time;
    this.gesture(b, 'reach', { side: hand, target: () => it.pos, dur: 0.35 });
    this.attach(it, b.handSlots[hand]);
    a.focus = { doll: b, until: t + 2 }; b.focus = { doll: a, until: t + 2 };
    this.gesture(a, 'nod', { delay: 0.1 });
    this.gesture(b, 'hop', { delay: 0.25 });
    this.setMood(b, 'open', 0.9, 0.7, 2); this.setMood(a, 'smile', 0.6, 0.3, 1.5);
    if (t - this.giveT < 25) this.giveCount++; else this.giveCount = 0; this.giveT = t;
    this.sound.give(a.id, b.id, this.giveCount);
    const hp = b.head.getWorldPosition(V());
    for (let i = 0; i < 2 + Math.min(4, this.giveCount); i++) this.fx.emit({ pos: hp.clone().add(_v.set((Math.random() - 0.5) * 0.05, 0.05, 0.02)), vel: _v2.set((Math.random() - 0.5) * 0.04, 0.05 + Math.random() * 0.03, 0), cell: i % 2 ? P_NOTE : P_HEART, size: 0.012, life: 1.2, col: i % 2 ? a.spec.accent : b.spec.accent, drag: 1.5 });
    this.flags.give = (this.flags.give || 0) + 1;
    this.log('give', a.id + '>' + b.id + ':' + it.id);
    this.afterReceive(b, it, a);
  },
  afterReceive(d, it, from) {
    if (it.kind === 'gift' && !it.data.open && from) { this.openGiftLater = { item: it, doll: d, at: this.time + 0.7 }; }
    if ((it.data.food) || (it.kind === 'cup' && it.data.level > 0.1)) d.autoEat = { item: it, at: this.time + 1.3 };
    if (it.data.deco) { this.decoReact(it, d.head.getWorldPosition(V()), d); }
  },
  onItemTaken(d, it, slot) {
    if (slot.type === 'foot') { this.gesture(d, 'lookFoot', { side: slot.side }); this.setMood(d, 'o', 0.4, 0.5, 0.9); this.sound.shoe(false); this.flags.shoeOff = (this.flags.shoeOff || 0) + 1; this.log('shoeOff', d.id + ':' + slot.side); }
    else if (slot.type === 'hand') { d.focus = { item: it, until: this.time + 1.2 }; }
    else if (slot.type === 'head') { this.setMood(d, 'o', 0.3, 0.4, 0.8); }
  },

  // ---------------------------------------------------------------- cheers
  ruleCheers(a, b, ps) {
    if (ps.cheer) return;
    const ca = a.handSlots.map(s => s.occupant).findIndex(x => x && x.kind === 'cup');
    const cb = b.handSlots.map(s => s.occupant).findIndex(x => x && x.kind === 'cup');
    if (ca < 0 || cb < 0) return;
    if (this.time - (ps.cheerAt || -9) < 2.5) return;
    const A = a.handSlots[ca].occupant, B = b.handSlots[cb].occupant;
    if (A.pos.distanceTo(B.pos) > 0.11 && a.chest.getWorldPosition(_v).distanceTo(b.chest.getWorldPosition(_v2)) > 0.13) return;
    ps.cheer = true; ps.cheerAt = this.time;
    const t = this.time;
    const mid = V().addVectors(a.chest.getWorldPosition(_v), b.chest.getWorldPosition(_v2)).multiplyScalar(0.5); mid.y += 0.05;
    this.gesture(a, 'cheer', { side: ca, target: mid.clone(), dur: 0.9 });
    this.gesture(b, 'cheer', { side: cb, target: mid.clone(), dur: 0.9 });
    a.focus = { doll: b, until: t + 2 }; b.focus = { doll: a, until: t + 2 };
    this.setMood(a, 'open', 0.8, 0.6, 1.8); this.setMood(b, 'open', 0.8, 0.6, 1.8);
    if (t - this.cheerT < 25) this.cheerCount++; else this.cheerCount = 0; this.cheerT = t;
    this.pendingClink = { at: t + 0.32, a, b, mid };
    this.flags.cheers = (this.flags.cheers || 0) + 1;
    this.log('cheers', a.id + '&' + b.id);
  },

  // ---------------------------------------------------------------- eating & drinking
  mouthNear(it, maxPx = 1) {
    const ip = _v.set(0, it.pickY, 0).add(it.pos), is = this.scr(ip);
    let best = null, bd = 9;
    const D = this.drag, src = D && D.obj === it && D.from ? (D.from.doll || (D.from.owner && D.from.owner.slot && D.from.owner.slot.doll)) : null;
    for (const d of this.dolls) {
      if (!this.awake(d)) continue;
      if (d === src && this.time - D.t0 < 0.9) continue;
      const mp = d.mouth.getWorldPosition(_v2);
      const wd = mp.distanceTo(ip);
      const ms = this.scr(mp), px = Math.hypot(ms.x - is.x, ms.y - is.y), rp = Math.max(this.minPx() * 0.6, 0.024 * this.pxPerM(mp));
      // closer to the hands/chest than to the mouth means "hold it", not "eat it"
      let pxHold = 1e9;
      { const hs = this.scr(d.chest.getWorldPosition(_v3)); pxHold = Math.hypot(hs.x - is.x, hs.y - is.y); }
      if (px > pxHold * 0.8) continue;
      const sc = Math.min(px / rp, wd / 0.03);
      if (sc < bd && sc < maxPx) { bd = sc; best = d; }
    }
    return best;
  },
  ruleFeed(it) {
    const t = this.time;
    const canEat = (it.data.food && !it.hidden) || (it.kind === 'cup' && it.data.level > 0.1) || (it.kind === 'spoon' && it.data.loaded);
    if (!canEat) return;
    const d = this.mouthNear(it);
    if (!d) { it.mouthT = 0; it.mouthD = null; return; }
    if (it.mouthD !== d) { it.mouthD = d; it.mouthT = 0; }
    it.mouthT = (it.mouthT || 0) + this.dt;
    if (!d.focus || d.focus.item !== it) { d.focus = { item: it, until: t + 0.5 }; }
    if (d.moodT <= 0) this.setMood(d, 'o', 0.5, 0.5, 0.3);
    if (it.mouthT < 0.32) return;
    if (t - (d.lastFed || -9) < 1.0) return;
    it.mouthT = 0;
    this.feed(d, it);
  },
  feed(d, it) {
    const t = this.time; d.lastFed = t;
    const mp = d.mouth.getWorldPosition(V());
    if (it.kind === 'cup') {
      it.data.level = Math.max(0, it.data.level - 0.34); this.sound.sip(d.id); d.chewT = 0; d.happyEyes = 1.0; this.setMood(d, 'mm', 0.8, 0.2, 1.6);
      this.fx.burst(mp.clone().add(_v.set(0, 0.02, 0.01)), 3, { cell: P_BUBBLE, size: 0.007, col: '#ffffff', speed: 0.02, up: 0.05, life: 0.8 });
      this.flags.drink = (this.flags.drink || 0) + 1; this.log('sip', d.id);
    } else {
      d.chewT = 1.1; this.sound.chew(d.id); this.setMood(d, 'mm', 0.9, 0.5, 2.2); d.happyEyes = 0.3;
      this.fx.burst(mp, 5, { cell: P_CRUMB, size: 0.004, col: it.kind === 'cookie' ? '#c48a4a' : '#f6d28a', speed: 0.05, up: 0.02, grav: 0.6, life: 0.7 });
      this.fx.emit({ pos: mp.clone().add(_v.set(0.025, 0.03, 0.01)), vel: _v2.set(0.01, 0.04, 0), cell: P_HEART, size: 0.013, life: 1.2, col: d.spec.accent });
      if (it.kind === 'spoon') { it.data.loaded = false; it.bite.visible = false; }
      else this.bite(it);
      this.flags.eat = (this.flags.eat || 0) + 1; this.log('eat', d.id + ':' + it.id);
      // a friend nearby watches happily
      const n = this.nearestDoll(d, 0.3, o => this.awake(o)); if (n) { n.focus = { doll: d, until: t + 1.5 }; this.setMood(n, 'smile', 0.6, 0.4, 1.5); }
    }
    this.sound.bump(0.1);
  },
  bite(it) {
    it.data.bites = (it.data.bites || 0) + 1;
    const max = it.kind === 'cookie' ? 2 : 3;
    const s = 1 - it.data.bites / (max + 0.6); it.vis.scale.set(s, 1, s);
    if (it.data.bites >= max) this.consume(it);
  },
  consume(it) {
    const p = it.pos.clone();
    this.fx.burst(p, 6, { cell: P_SPARK, size: 0.008, col: '#fff3c4', speed: 0.05, up: 0.05, life: 0.6 });
    if (this.drag && this.drag.obj === it) { this.drag = null; }
    this.detach(it); it.held = false; it.hidden = true; it.root.visible = false;
    this.respawn.push({ item: it, at: this.time + 2.6 });
  },
  refill(it) {
    let slot = null;
    if (it.kind === 'slice') slot = this.slotById['cake:' + it.data.home];
    if (it.kind === 'cookie') { const g = this.item.gift; if (!g.data.open) return false; slot = g.slots.find(s => !s.occupant) || null; }
    if (!slot || slot.occupant) { if (it.kind === 'slice') slot = this.slots.find(s => s.type === 'cake' && !s.occupant); if (!slot) return false; }
    it.data.bites = 0; it.vis.scale.set(1, 1, 1); it.hidden = false; it.root.visible = true;
    this.attach(it, slot, true); it.vis.scale.set(0.01, 0.01, 0.01); it.popT = 0; it.lastMoved = this.time;
    this.fx.burst(it.pos.clone().add(_v.set(0, 0.02, 0)), 5, { cell: P_SPARK, size: 0.008, col: '#fff', speed: 0.05, up: 0.06, life: 0.6 });
    this.sound.pop();
    this.log('refill', it.id);
    return true;
  },
  handToMouth(d, it) {
    const side = d.handSlots.findIndex(s => s.occupant === it); if (side < 0) return;
    this.gesture(d, it.kind === 'cup' ? 'sip' : 'eat', { side, target: (o) => d.mouth.getWorldPosition(o).add(_v.set(0, -0.012, 0.012)), dur: 1.2 });
    this.pendingFeed = (this.pendingFeed || []); this.pendingFeed.push({ at: this.time + 0.45, d, it });
  },

  // ---------------------------------------------------------------- spoon scoop
  ruleScoop(sp) {
    if (sp.data.loaded) return;
    for (const it of this.items) {
      if (it.kind !== 'slice' || it.hidden || it.held) continue;
      if (it.slot && it.slot.type === 'cake') continue;
      const tp = _v.set(0, 0.02, 0).add(it.pos);
      if (tp.distanceTo(_v2.set(0, 0.004, 0).add(sp.pos)) < 0.035) {
        sp.data.loaded = true; sp.bite.visible = true; this.bite(it); this.sound.tapItem(88); this.fx.burst(tp, 3, { cell: P_CRUMB, size: 0.004, col: '#f6d28a', speed: 0.03, up: 0.03, grav: 0.5, life: 0.5 });
        this.log('scoop', it.id); break;
      }
    }
  },

  // ---------------------------------------------------------------- pour tea
  rulePour(pot, dt) {
    let target = null;
    if (pot && this.drag && this.time - this.drag.t0 > 0.25) {
      const ref = this.drag.obj === pot ? this.drag.pos : pot.pos;
      let bd = 0.07;
      for (const c of this.items) {
        if (c.kind !== 'cup' || c.hidden || c.held || c.data.level >= 0.999) continue;
        const dd = Math.hypot(c.pos.x - (ref.x + 0.03), c.pos.z - ref.z);
        if (dd < bd && ref.y > c.pos.y + 0.012) { bd = dd; target = c; }
      }
    }
    const was = this.pouring;
    if (target) {
      if (!was || was.cup !== target) { this.sound.startPour(); this.log('pourStart', target.id); }
      this.pouring = { cup: target, pot };
      pot.tilt += (0.62 - pot.tilt) * (1 - Math.exp(-dt * 10));
      // magnet the pot so the spout is above the cup
      if (this.drag && this.drag.obj === pot) { _v.set(target.pos.x - 0.036, target.pos.y + 0.03, target.pos.z); pot.pos.lerp(_v, 1 - Math.exp(-dt * 12)); }
      this.lastPourT = this.time;
      if (pot.tilt > 0.4) {
        target.data.level = Math.min(1, target.data.level + dt * 0.85);
        this.sound.pourLevel(target.data.level);
        pot.spout.getWorldPosition(_v);
        const top = _v2.set(target.pos.x, target.pos.y + 0.003 + target.data.level * 0.0135, target.pos.z);
        const len = _v.distanceTo(top);
        this.stream.visible = true; this.stream.position.addVectors(_v, top).multiplyScalar(0.5); this.stream.scale.set(1, len, 1);
        this.stream.quaternion.setFromUnitVectors(_v3.set(0, 1, 0), _v4.subVectors(_v, top).normalize());
        if (target.data.level >= 1) { this.sound.stopPour(true); this.fx.burst(top.clone(), 4, { cell: P_SPARK, size: 0.007, col: '#fff', speed: 0.03, up: 0.04, life: 0.5 }); this.flags.pour = (this.flags.pour || 0) + 1; this.log('poured', target.id); this.pouring = null; }
      }
    } else {
      if (was) { this.sound.stopPour(false); this.pouring = null; }
      if (pot) pot.tilt *= Math.exp(-dt * 8);
      this.stream.visible = false;
    }
    if (!target) this.stream.visible = false;
    const potItem = this.item.pot; if (!pot && potItem.tilt > 0) potItem.tilt *= Math.exp(-dt * 8);
    // tea surfaces
    for (const c of this.items) if (c.kind === 'cup') {
      const l = c.data.level; c.tea.visible = l > 0.02 && !c.hidden;
      if (c.tea.visible) { const r = 0.0086 + l * 0.0044; c.tea.scale.set(r, r, 1); c.tea.position.y = 0.0028 + l * 0.0135; c.tea.position.x = Math.sin(this.time * 9 + c.id.length) * 0.0003 * (c.wob || 0); }
      if (c.wob) c.wob *= Math.exp(-dt * 3);
    }
    // pending feeds & clinks
    if (this.pendingFeed) for (let i = this.pendingFeed.length - 1; i >= 0; i--) { const f = this.pendingFeed[i]; if (this.time >= f.at) { this.pendingFeed.splice(i, 1); if (f.it.slot && f.it.slot.doll === f.d && !f.it.hidden) this.feed(f.d, f.it); } }
    if (this.pendingClink && this.time >= this.pendingClink.at) {
      const c = this.pendingClink; this.pendingClink = null;
      this.sound.cheers(c.a.id, c.b.id, this.cheerCount);
      this.fx.burst(c.mid, 6 + Math.min(6, this.cheerCount * 2), { cell: P_SPARK, size: 0.01, col: '#fff1c0', speed: 0.08, up: 0.06, life: 0.8 });
      for (const d of [c.a, c.b]) for (const s of d.handSlots) if (s.occupant && s.occupant.kind === 'cup') s.occupant.wob = 6;
      this.gesture(c.a, 'giggle', { delay: 0.1 }); this.gesture(c.b, 'giggle', { delay: 0.25 });
    }
    if (this.pendingAnswer && this.time >= this.pendingAnswer.at) { const r = this.pendingAnswer.r; this.pendingAnswer = null; this.fx.emit({ pos: r.head.getWorldPosition(V()).add(_v.set(-0.03, 0.05, 0.01)), vel: _v2.set(-0.01, 0.03, 0), cell: P_NOTE, size: 0.012, life: 1.1, col: r.spec.accent }); }
    if (this.openGiftLater && this.time >= this.openGiftLater.at) { const o = this.openGiftLater; this.openGiftLater = null; this.openGift(o.item, o.doll); }
  },

  // ---------------------------------------------------------------- reaching for nearby food (anticipation)
  ruleReach() {
    const t = this.time;
    for (const d of this.dolls) { d.reachItem[0] = d.reachItem[1] = null; }
    for (const it of this.items) {
      if (!it.data.food || it.hidden) continue;
      const active = it.held || (it.slot && it.slot.doll && it.slot.doll.st === 'held') || (!it.slot && t - it.lastMoved < 3) || (it.slot && it.slot.type === 'plate' && t - it.lastMoved < 3);
      if (!active) continue;
      const ip = _v.set(0, it.pickY, 0).add(it.pos);
      for (const d of this.dolls) {
        if (!this.awake(d) || d.st === 'held' || (it.slot && it.slot.doll === d)) continue;
        const fh = this.freeHand(d); if (fh < 0) continue;
        const dist = ip.distanceTo(d.chest.getWorldPosition(_v2));
        if (dist > 0.19) continue;
        // which hand is closer
        const h0 = d.handSlots[0].occupant ? 9 : ip.distanceTo(this.handPos(d, 0, _v3)), h1 = d.handSlots[1].occupant ? 9 : ip.distanceTo(this.handPos(d, 1, _v3));
        const side = h0 < h1 ? 0 : 1;
        const w = Math.min(0.85, (0.19 - dist) / 0.1 + 0.25);
        if (!d.reachItem[side] || d.reachItem[side].w < w) d.reachItem[side] = { w, pos: ip.clone() };
        if (!d.focus) d.focus = { item: it, until: t + 0.4 };
        if (!d.moodT || d.moodT <= 0) this.setMood(d, 'small', 0.5, 0.5, 0.4);
        if (!it._reachLogged || t - it._reachLogged > 3) { it._reachLogged = t; this.log('reach', d.id + ':' + it.id); }
      }
    }
  },

  // ---------------------------------------------------------------- placing items
  onItemPlaced(it, slot, D) {
    const t = this.time;
    switch (slot.type) {
      case 'shelf': this.sound.shelf(); this.flags.shelf = (this.flags.shelf || 0) + 1; this.log('shelf', it.id);
        { const pair = this.slotById[`shelf:${slot.pair}:${1 - slot.side}`]; if (pair.occupant && pair.occupant.data.owner === it.data.owner) this.fx.burst(pair.node.getWorldPosition(V()).add(_v.set(slot.side ? 0.012 : -0.012, 0.01, 0.01)), 4, { cell: P_SPARK, size: 0.008, col: '#fff', speed: 0.04, up: 0.04, life: 0.6 }); }
        break;
      case 'foot': { const d = slot.doll; this.sound.shoe(true); this.gesture(d, 'hop', { delay: 0.1 }); this.setMood(d, 'open', 0.6, 0.5, 1.2); this.flags.shoeOn = (this.flags.shoeOn || 0) + 1; this.log('shoeOn', d.id + ':' + slot.side); break; }
      case 'hand': {
        const d = slot.doll; d.focus = { item: it, until: t + 1.2 };
        this.setMood(d, 'open', 0.7, 0.5, 1.4); this.gesture(d, 'hop', { delay: 0.15 }); this.sound.thanks(d.id);
        this.flags.handed = (this.flags.handed || 0) + 1; this.log('inHand', d.id + ':' + it.id);
        this.afterReceive(d, it, null);
        break;
      }
      case 'head': { const d = slot.doll; this.setMood(d, 'open', 1, 0.8, 2.4); this.gesture(d, 'giggle', { delay: 0.1 }); this.decoReact(it, d.head.getWorldPosition(V()).add(_v.set(0, 0.05, 0)), d); break; }
      case 'hook': this.decoReact(it, slot.node.getWorldPosition(V()).add(_v.set(0, -0.025, 0.01)), null); break;
      case 'plate': this.sound.tapItem(79); it.lastMoved = t; this.log('onPlate', it.id); break;
      case 'cake': this.sound.tapItem(84); break;
      case 'box': this.sound.tapItem(86); break;
      case 'bed': this.blanketCover(); break;
    }
  },
  onItemFree(it, s, D) {
    if (it.data.deco && (s.kind === 'table' || s.kind === 'trolley' || s.kind === 'night' || s.kind === 'shelf')) this.decoReact(it, it.rest.pos.clone().add(_v.set(0, 0.02, 0)), null, it);
    if (it.kind === 'blanket') this.log('blanketFree', s.kind);
  },
  tapItem(it) {
    it.hopT = 0;
    if (it.kind === 'gift' && !it.data.open) return;
    if (it.kind === 'cup' && it.data.level > 0.1) { this.fx.emit({ pos: it.pos.clone().add(_v.set(0, 0.03, 0)), vel: _v2.set(0, 0.03, 0), cell: P_BUBBLE, size: 0.01, life: 1.2, col: '#ffffff', alpha: 0.6 }); }
  },

  // ---------------------------------------------------------------- decorations
  decoReact(it, pos, wearer, follow) {
    const t = this.time;
    this.lastDeco = { t, pos: pos.clone(), item: it };
    this.sound.deco();
    const n = this.fx.count > 90 ? 4 : 10;
    for (let i = 0; i < n; i++) this.fx.emit({ pos: pos.clone().add(_v.set((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.04, 0.01)), vel: _v2.set((Math.random() - 0.5) * 0.08, 0.04 + Math.random() * 0.06, (Math.random()) * 0.04), cell: i % 3 === 0 ? P_SPARK : P_PETAL, size: i % 3 === 0 ? 0.01 : 0.008, spin: (Math.random() - 0.5) * 5, rot: Math.random() * 6, life: 1.4, grav: 0.05, drag: 1.2, col: i % 3 === 0 ? '#fff6d0' : (i % 2 ? '#f9b7c8' : '#ffffff') });
    // local glow that stays where the decoration is
    this.decoGlows = this.decoGlows.filter(g => { if (g.item === it) { this.scene.remove(g.s); return false; } return true; });
    const s = glowSprite('#ffe9c8', 0.12, 0); s.position.copy(pos); this.scene.add(s);
    this.decoGlows.push({ s, t: 0, item: (follow || wearer) ? it : null, ph: Math.random() * 6 });
    if (this.decoGlows.length > 4) { const g = this.decoGlows.shift(); this.scene.remove(g.s); }
    // friends look, clap, and look at each other
    const room = this.dolls.filter(d => this.awake(d) && d.st !== 'held' && d !== wearer && this.sameRoom(d.root.position, pos) && d.root.position.distanceTo(pos) < 0.9);
    room.forEach((d, i) => {
      d.focus = { pos: pos.clone(), until: t + 2.2 + i * 0.2 };
      this.gesture(d, 'clap', { delay: 0.25 + i * 0.18 });
      this.setMood(d, 'open', 0.8, 0.7, 2.4);
    });
    if (room.length >= 2) { const [a, b] = room; this.lookEachOther = { a, b, at: t + 2.4 }; }
    else if (room.length === 1 && wearer) { this.lookEachOther = { a: room[0], b: wearer, at: t + 2.2 }; }
    this.flags.deco = (this.flags.deco || 0) + 1;
    this.log('deco', it.id + '@' + pos.x.toFixed(2) + ',' + pos.y.toFixed(2) + (room.length ? ' claps:' + room.map(d => d.id).join('+') : ''));
  },

  // ---------------------------------------------------------------- blanket & bed
  blanketOn() { const b = this.item.blanket; return !!(b.slot && b.slot.type === 'bed'); },
  blanketCover() {
    this.sound.swish();
    const lying = this.dolls.filter(d => d.st === 'lie');
    lying.forEach((d, i) => { d.sleepAt = this.time + 0.6 + i * 0.3; });
    this.fx.burst(V((L.bed.x0 + L.bed.x1) / 2, L.bed.top + 0.04, (L.bed.z0 + L.bed.z1) / 2), 4, { cell: P_BUBBLE, size: 0.01, col: '#ffffff', speed: 0.05, up: 0.04, life: 1.2 });
    this.log('blanketOn', lying.map(d => d.id).join(','));
  },
  blanketLifted() {
    for (const d of this.dolls) if (d.st === 'lie') { d.sleepAt = 0; if (d.sleeping) this.wake(d, false); }
    this.sound.swish(); this.log('blanketOff', '');
  },
  rulePeek() {
    const sleepers = this.dolls.filter(d => d.sleeping);
    if (!sleepers.length) return;
    for (const d of this.dolls) {
      if (d.away || d.sleeping || d.st !== 'stand' || d.dropT < 1) continue;
      let near = null, nd = 0.27;
      for (const s of sleepers) { const hp = s.head.getWorldPosition(_v); const dd = Math.hypot(hp.x - d.root.position.x, hp.z - d.root.position.z); if (dd < nd) { nd = dd; near = s; } }
      const key = 'peek' + d.id;
      if (!near) { if (this[key]) this[key] = false; continue; }
      if (this[key]) continue;
      this[key] = true;
      const hp = near.head.getWorldPosition(V());
      d.yawT = Math.atan2(hp.x - d.root.position.x, hp.z - d.root.position.z);
      d.focus = { pos: hp, until: this.time + 2.8 };
      this.gesture(d, 'peek', { delay: 0.2 });
      this.gesture(d, 'smallWave', { side: 1, delay: 1.5 });
      this.setMood(d, 'small', 0.6, 0.6, 2.8);
      this.sound.wave(d.id);
      this.fx.emit({ pos: hp.clone().add(_v.set(0.0, 0.05, 0.02)), vel: _v2.set(0, 0.02, 0), cell: P_BUBBLE, size: 0.012, life: 1.8, col: '#fff', alpha: 0.7 });
      this.flags.peek = (this.flags.peek || 0) + 1;
      this.log('peek', d.id + '>' + near.id);
    }
  },

  // ---------------------------------------------------------------- gift box
  openGift(it, d) {
    if (it.data.open) return;
    it.data.open = true;
    this.sound.open();
    const p = it.pos.clone().add(_v.set(0, 0.04, 0));
    this.fx.burst(p, 10, { cell: P_SPARK, size: 0.01, col: '#fff3c4', speed: 0.08, up: 0.08, life: 0.9 });
    it.lid.userData.fly = 0;
    for (let i = 0; i < 4; i++) { const c = this.item['cookie' + i]; if (c.slot && c.slot.owner === it) { c.hidden = false; } }
    const near = this.dolls.filter(o => this.awake(o) && o.root.position.distanceTo(it.pos) < 0.35);
    near.forEach((o, i) => { this.gesture(o, 'surprise', { delay: i * 0.1 }); this.setMood(o, 'o', 0.7, 0.9, 0.9); o.focus = { item: it, until: this.time + 1.6 }; });
    this.afterGift = { at: this.time + 0.9, dolls: near };
    this.flags.gift = (this.flags.gift || 0) + 1;
    this.log('giftOpen', d ? d.id : '');
    this.saveSoon();
  },

  // ---------------------------------------------------------------- friends arriving
  ruleArrive(dt) {
    if (this.afterGift && this.time >= this.afterGift.at) { const a = this.afterGift; this.afterGift = null; a.dolls.forEach((o, i) => { this.setMood(o, 'open', 0.9, 0.7, 1.8); this.gesture(o, 'hop', { delay: i * 0.12 }); }); }
    if (this.lookEachOther && this.time >= this.lookEachOther.at) { const { a, b } = this.lookEachOther; this.lookEachOther = null; if (this.awake(a) && this.awake(b)) { a.focus = { doll: b, until: this.time + 1.6 }; b.focus = { doll: a, until: this.time + 1.6 }; this.setMood(a, 'open', 0.8, 0.6, 1.5); this.setMood(b, 'open', 0.8, 0.6, 1.5); this.gesture(a, 'giggle'); this.gesture(b, 'giggle', { delay: 0.2 }); this.log('lookEachOther', a.id + '&' + b.id); } }
    // lid flying off the gift
    const lid = this.item.gift.lid;
    if (lid.userData.fly !== undefined) { const f = lid.userData.fly += dt; const k = Math.min(1, f / 0.6); lid.position.set(-0.05 * k, 0.03 + Math.sin(Math.PI * k) * 0.035 - 0.026 * k, 0.014 * k); lid.rotation.z = 0.3 * k; lid.rotation.y = 0.4 * k; if (k >= 1) lid.userData.fly = undefined; }
    if (this.arrivalBusy) return;
    if (!this.arrivalQueue.length) return;
    if (this.play < this.nextArrival) return;
    if (this.dolls.some(d => !d.away && d.zone === 'porch')) return;
    this.arrive(this.arrivalQueue[0]);
  },
  tryEarlyArrival() {
    if (this.arrivalBusy || !this.arrivalQueue.length) return;
    if (this.play < this.nextArrival - 100) return;
    this.nextArrival = Math.min(this.nextArrival, this.play + 1.2);
  },
  arrive(id) {
    const d = this.doll[id]; this.arrivalBusy = true;
    this.arrivalQueue.shift();
    d.away = false; d.arrived = true; d.root.visible = true; d.zone = 'porch'; d.st = 'stand';
    const from = V(L.porch.x0 - 0.06, L.porch.y, -0.5), to = V(L.porchSpot.x + 0.01, L.porch.y, L.porchSpot.z);
    d.root.position.copy(from); d.prevPos.copy(from); d.dropT = 1; d.yaw = Math.PI / 2; d.yawT = Math.PI / 2;
    d.walk = { from, to, t: 0, dur: 1.6, endYaw: 0, done: () => {
      this.arrivalBusy = false;
      this.nextArrival = this.play + 170;
      if (this.doorState.a < 0.5) { this.gesture(d, 'knock', { side: 1, target: V(L.door.x + 0.03, 0.2, L.room.z0 - 0.012), dur: 0.9 }); this.sound.knock(); this.knockT = this.time; }
      else { this.gesture(d, 'wave', { side: 0 }); this.sound.wave(d.id); }
      this.setMood(d, 'open', 0.7, 0.6, 2);
      this.saveSoon();
    } };
    this.flags['arrived_' + id] = true;
    this.log('arrive', id);
  },

  // ---------------------------------------------------------------- chatter (call & response, depends on who is together)
  ruleChat() {
    const t = this.time;
    const act = this.dolls.filter(d => this.awake(d) && d.st !== 'held' && !d.gest.length);
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      const both = a.st === 'sit' && b.st === 'sit';
      const dist = a.root.position.distanceTo(b.root.position);
      if (!(both && dist < 0.45) && dist > 0.17) continue;
      const ps = this.pairState(a, b);
      if (t < ps.chatT) continue;
      ps.chatT = t + 7 + Math.random() * 5; ps.n++;
      const [c, r] = ps.n % 2 ? [a, b] : [b, a];
      this.chat(c, r, ps.n);
      return;
    }
  },
  chat(c, r, n) {
    const t = this.time;
    const ids = [c.id, r.id].sort().join('');
    const style = { kokomimi: 0, hanamimi: 1, hanakoko: 2, mimirara: 3, kokorara: 1, hanarara: 2 }[ids] ?? 0;
    c.focus = { doll: r, until: t + 2.6 }; r.focus = { doll: c, until: t + 2.6 };
    const cupsC = c.handSlots.some(s => s.occupant && s.occupant.kind === 'cup' && s.occupant.data.level > 0.1);
    const foodC = c.handSlots.find(s => s.occupant && s.occupant.data.food);
    let callG = ['nod', 'smallWave', 'clap1', 'tilt'][style], ansG = ['tilt', 'giggle', 'clap1', 'hop'][style];
    if (c.id === 'hana' && c.hat && n % 2) callG = 'hatTip';
    if (r.id === 'hana' && r.hat && n % 3 === 0) ansG = 'hatTip';
    if (foodC && this.freeHand(r) >= 0) { callG = 'offer'; }
    this.gesture(c, callG, { side: 1, dir: 1, target: callG === 'offer' ? r.chest.getWorldPosition(V()) : null });
    this.gesture(r, ansG, { side: 0, dir: -1, delay: 0.75 });
    this.setMood(c, 'small', 0.5, 0.4, 1.0); this.setMood(r, 'open', 0.6, 0.5, 1.8);
    this.sound.call(c.id, n % 3); this.sound.answer(r.id, n % 3, 0.75);
    this.fx.emit({ pos: c.head.getWorldPosition(V()).add(_v.set(0.03, 0.05, 0.01)), vel: _v2.set(0.01, 0.03, 0), cell: P_NOTE, size: 0.012, life: 1.1, col: c.spec.accent });
    this.pendingAnswer = { at: t + 0.8, r };
    this.flags.chat = (this.flags.chat || 0) + 1;
    this.log('chat', c.id + '->' + r.id + ':' + callG + '/' + ansG);
    if (cupsC) this.sound.bump(0.05);
  },
};
