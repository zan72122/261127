// Unified single-finger touch & mouse pointer tracker
export class Input {
  constructor(el) {
    this.el = el;
    this.pointers = new Map();
    this.handlers = { down: [], move: [], up: [], tap: [], first: [] };
    this.firstDone = false;
    this.lastActivity = performance.now();
    const opts = { passive: false };

    el.addEventListener('pointerdown', (e) => this._down(e), opts);
    window.addEventListener('pointermove', (e) => this._move(e), opts);
    window.addEventListener('pointerup', (e) => this._up(e), opts);
    window.addEventListener('pointercancel', (e) => this._up(e), opts);

    const block = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchstart', block, opts);
    el.addEventListener('touchmove', block, opts);
    el.addEventListener('touchend', (e) => {
      block(e);
      this._first();
    }, opts);
    document.addEventListener('gesturestart', block, opts);
    document.addEventListener('gesturechange', block, opts);
    document.addEventListener('dblclick', block, opts);
    el.addEventListener('contextmenu', block, opts);
    el.addEventListener('click', () => this._first());
  }

  on(ev, fn) {
    this.handlers[ev].push(fn);
  }

  _first() {
    if (this.firstDone) return;
    this.firstDone = true;
    for (const f of this.handlers.first) f();
  }

  _down(e) {
    if (e.cancelable) e.preventDefault();
    this._first();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch (_) {}
    const now = performance.now();
    const p = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t0: now,
      t: now,
      dist: 0,
    };
    this.pointers.set(e.pointerId, p);
    this.lastActivity = now;
    for (const f of this.handlers.down) f(p);
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (e.cancelable) e.preventDefault();
    const now = performance.now();
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.dist += Math.hypot(dx, dy);
    p.x = e.clientX;
    p.y = e.clientY;
    p.t = now;
    this.lastActivity = now;
    for (const f of this.handlers.move) f(p);
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    p.up = true;
    for (const f of this.handlers.up) f(p);
    if (p.dist < 22 && performance.now() - p.t0 < 650) {
      for (const f of this.handlers.tap) f(p);
    }
  }
}
