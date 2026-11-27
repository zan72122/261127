// On-device persistence (localStorage). Survives first run, restore, corrupted data and storage refusal.
import { L } from './layout.js';
import { DOLL } from './doll.js';

const KEY = 'gf261127-62.house.v1';
const fin = (v, a, b) => typeof v === 'number' && isFinite(v) && v >= a && v <= b;

export class Store {
  constructor() { this.ok = true; this.status = 'init'; this.fails = 0; this.lastError = ''; }
  storage() { try { return window.localStorage || null; } catch (e) { this.status = 'refused'; this.ok = false; return null; } }
  load() {
    const ls = this.storage(); if (!ls) { this.status = 'refused'; return null; }
    let raw = null;
    try { raw = ls.getItem(KEY); } catch (e) { this.status = 'refused'; this.ok = false; return null; }
    if (raw == null) { this.status = 'first'; return null; }
    try {
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || o.v !== 1 || typeof o.dolls !== 'object' || typeof o.items !== 'object') throw new Error('shape');
      this.status = 'restored'; return o;
    } catch (e) {
      this.status = 'corrupt';
      try { ls.removeItem(KEY); } catch (e2) {}
      return null;
    }
  }
  save(o) {
    if (!this.ok) return false;
    const ls = this.storage(); if (!ls) return false;
    try { ls.setItem(KEY, JSON.stringify(o)); this.fails = 0; return true; }
    catch (e) { this.fails++; this.lastError = e && e.name || 'error'; if (this.fails >= 3) this.ok = false; return false; }
  }
}

export const Persist = {
  saveSoon() { this.saveAt = this.time + 0.6; },
  saveTick(dt) {
    this.saveClock = (this.saveClock || 0) + dt;
    if ((this.saveAt && this.time >= this.saveAt) || this.saveClock > 12) { if (!this.drag) { this.saveNow(); } }
  },
  saveNow() {
    this.saveAt = 0; this.saveClock = 0;
    try { const o = this.serialize(); this.store.save(o); } catch (e) { /* keep playing */ }
  },
  serialize() {
    const dolls = {}, items = {};
    for (const d of this.dolls) {
      let st = d.st, x = d.root.position.x, y = d.root.position.y, z = d.root.position.z, zone = d.zone;
      if (d.walk) { st = 'stand'; x = d.walk.to.x; y = d.walk.to.y; z = d.walk.to.z; }
      if (st === 'held' || (d.dropT < 1 && st === 'stand')) { st = 'stand'; if (d.dropT < 1) { x = d.dropTo.x; y = d.dropTo.y; z = d.dropTo.z; } }
      dolls[d.id] = { a: d.arrived ? 1 : 0, w: d.away ? 1 : 0, st, seat: d.seat, spot: d.spot, x: +x.toFixed(4), y: +y.toFixed(4), z: +z.toFixed(4), yaw: +d.yawT.toFixed(3), zone, sl: d.sleeping ? 1 : 0 };
    }
    for (const it of this.items) {
      const r = { s: it.slot ? it.slot.id : null };
      if (!it.slot) { const p = it.held ? it.pos : it.rest.pos; r.x = +p.x.toFixed(4); r.y = +(it.held ? Math.max(0, this.surfaceAt(p.x, p.z, false, this.zoneOf(p)).y) : p.y).toFixed(4); r.z = +p.z.toFixed(4); r.yaw = +(it.rest.yaw || 0).toFixed(3); r.f = it.rest.flat ? 1 : 0; }
      const dd = {};
      if (it.kind === 'cup') dd.level = +it.data.level.toFixed(3);
      if (it.kind === 'gift') dd.open = !!it.data.open;
      if (it.data.food) dd.bites = it.data.bites || 0;
      if (it.kind === 'spoon') dd.loaded = !!it.data.loaded;
      if (it.hidden) r.h = 1;
      r.d = dd; items[it.id] = r;
    }
    return { v: 1, t: Date.now(), play: Math.round(this.play), door: this.doorState.open ? 1 : 0, flags: this.flags, dolls, items, queue: this.arrivalQueue.slice(), next: Math.round(this.nextArrival), view: this.S.viewName };
  },
  restore() {
    const o = this.store.load();
    this.restoreStatus = this.store.status;
    if (!o) return false;
    try { this.applySave(o); this.restored = true; this.log('restore', 'ok'); return true; }
    catch (e) {
      // anything odd: fall back to a clean house, keep playing
      this.restoreStatus = 'corrupt';
      this.resetToDefaults();
      this.log('restore', 'fallback');
      return false;
    }
  },
  resetToDefaults() {
    for (const s of this.slots) s.occupant = null;
    for (const it of this.items) { it.slot = null; it.hidden = false; it.held = false; it.vis.scale.set(1, 1, 1); }
    for (const d of this.dolls) { d.away = false; d.arrived = true; d.sleeping = false; d.walk = null; }
    this.flags = {}; this.play = 0;
    this.initDefaults();
  },
  applySave(o) {
    if (o.flags && typeof o.flags === 'object') for (const k in o.flags) { const v = o.flags[k]; if (typeof v === 'number' || typeof v === 'boolean') this.flags[k] = v; }
    if (fin(o.play, 0, 1e7)) this.play = o.play;
    if (Array.isArray(o.queue)) this.arrivalQueue = o.queue.filter(id => id === 'hana' || id === 'rara');
    if (fin(o.next, 0, 1e7)) this.nextArrival = o.next;
    if (o.door) { this.doorState.open = true; this.doorState.target = this.doorState.a = 1.62; }
    // dolls
    const usedSeat = {}, usedSpot = {};
    for (const d of this.dolls) {
      const s = o.dolls[d.id]; if (!s || typeof s !== 'object') continue;
      const arrived = s.a === 1 || d.id === 'mimi' || d.id === 'koko';
      if (!arrived) { d.away = true; d.arrived = false; d.root.visible = false; if (!this.arrivalQueue.includes(d.id)) this.arrivalQueue.push(d.id); continue; }
      d.away = false; d.arrived = true; this.arrivalQueue = this.arrivalQueue.filter(x => x !== d.id);
      const zone = s.zone === 'porch' ? 'porch' : 'in';
      const R = L.room;
      if (s.st === 'sit' && Number.isInteger(s.seat) && s.seat >= 0 && s.seat < L.chairs.length && !usedSeat[s.seat]) {
        usedSeat[s.seat] = 1; const c = L.chairs[s.seat];
        d.st = 'sit'; d.seat = s.seat; d.zone = 'in'; d.root.position.set(c.x - Math.sin(c.yaw) * 0.006, 0, c.z - Math.cos(c.yaw) * 0.006); d.yaw = d.yawT = c.yaw;
      } else if (s.st === 'lie' && Number.isInteger(s.spot) && s.spot >= 0 && s.spot < 2 && !usedSpot[s.spot]) {
        usedSpot[s.spot] = 1; d.st = 'lie'; d.spot = s.spot; d.zone = 'in'; d.root.position.set(L.bed.headX + DOLL.headY - 0.002, L.bed.top, L.bed.spots[s.spot]); d.yaw = d.yawT = Math.PI / 2;
        d.C.lay = 1; d.sleeping = false;
      } else if (fin(s.x, R.x0 - 0.2, R.x1 + 0.2) && fin(s.z, -0.7, R.z1 + 0.1) && fin(s.y, -0.05, 0.2)) {
        this.placeDoll(d, s.x, s.z, fin(s.yaw, -10, 10) ? s.yaw : 0, zone);
        d.root.position.y = s.y;
        const p = d.root.position; this.clampZone(p, zone, 0.03);
      }
      d.prevPos.copy(d.root.position); d.dropT = 1;
    }
    // items: clear all slot links, then re-place
    const defaults = {}; for (const it of this.items) defaults[it.id] = { slot: it.slot, pos: it.rest.pos.clone(), yaw: it.rest.yaw, flat: it.rest.flat };
    for (const s of this.slots) s.occupant = null;
    for (const it of this.items) it.slot = null;
    const later = [];
    for (const it of this.items) {
      const s = o.items[it.id];
      const dd = s && s.d && typeof s.d === 'object' ? s.d : {};
      if (it.kind === 'cup' && fin(dd.level, 0, 1)) it.data.level = dd.level;
      if (it.kind === 'gift' && dd.open) { it.data.open = true; it.lid.position.set(-0.05, 0.004, 0.014); it.lid.rotation.set(0, 0.4, 0.3); }
      if (it.kind === 'spoon' && dd.loaded) { it.data.loaded = true; it.bite.visible = true; }
      if (it.data.food && Number.isInteger(dd.bites) && dd.bites > 0 && dd.bites < 3) { it.data.bites = dd.bites; const max = it.kind === 'cookie' ? 2 : 3; const sc = 1 - dd.bites / (max + 0.6); it.vis.scale.set(sc, 1, sc); }
      later.push([it, s, defaults[it.id]]);
    }
    // slots owned by items (plates, gift box) must have their owners placed first
    later.sort((a, b) => (a[0].slots.length ? 0 : 1) - (b[0].slots.length ? 0 : 1));
    for (const [it, s, def] of later) {
      let done = false;
      if (s && s.h && it.data.food) { it.hidden = false; it.data.bites = 0; it.vis.scale.set(1, 1, 1); }
      if (s && typeof s.s === 'string') {
        const slot = this.slotById[s.s];
        if (slot && slot.accepts(it) && !(slot.doll && slot.doll.away && !(it.kind === 'gift' || it.kind === 'bouquet' || it.kind === 'shoe')) && !(slot.owner === it)) { this.attach(it, slot, true); done = true; }
      } else if (s && fin(s.x, -1, 1.3) && fin(s.y, -0.05, 0.4) && fin(s.z, -0.75, 0.5)) {
        this.setFree(it, s.x, s.y, s.z, fin(s.yaw, -10, 10) ? s.yaw : 0, s.f === 0 ? false : !!it.data.deco); done = true;
      }
      if (!done) {
        if (def.slot && def.slot.accepts(it)) this.attach(it, def.slot, true);
        else if (it.data.food && it.kind === 'slice') { const cs = this.slots.find(x => x.type === 'cake' && !x.occupant); if (cs) this.attach(it, cs, true); else this.setFree(it, def.pos.x, def.pos.y, def.pos.z, def.yaw, def.flat); }
        else this.setFree(it, def.pos.x, def.pos.y, def.pos.z, def.yaw, def.flat);
      }
    }
    for (let i = 0; i < 4; i++) { const c = this.item['cookie' + i]; c.hidden = !this.item.gift.data.open && !!(c.slot && c.slot.type === 'box'); }
    // sleeping dolls under the blanket
    if (this.blanketOn()) for (const d of this.dolls) if (d.st === 'lie') { d.sleeping = true; }
    if (o.view === 'bed' || o.view === 'living') this.S.viewName = o.view;
    this.flags.demoDone = this.flags.demoDone || this.play > 5 || !!this.flags.picked;
    for (const it of this.items) this.itemTransform(it, 0);
  },
};
