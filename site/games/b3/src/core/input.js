// Unified 1-finger touch and mouse input handler.
export class Input {
  constructor(el) {
    this.el = el;
    this.handlers = new Map();
    this.active = null;
    this.firstFired = false;

    el.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  _emit(type, payload) {
    const list = this.handlers.get(type);
    if (!list) return;
    for (const fn of list) fn(payload);
  }

  _coords(e) {
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return {
      x,
      y,
      w: Math.max(1, r.width),
      h: Math.max(1, r.height),
      nx: (x / Math.max(1, r.width)) * 2 - 1,
      ny: -((y / Math.max(1, r.height)) * 2 - 1),
    };
  }

  _down(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    if (this.active && this.active.id !== e.pointerId) return;
    const c = this._coords(e);
    this.active = {
      id: e.pointerId,
      startX: c.x,
      startY: c.y,
      x: c.x,
      y: c.y,
      nx: c.nx,
      ny: c.ny,
      w: c.w,
      h: c.h,
      dx: 0,
      dy: 0,
      maxMove: 0,
      downTime: performance.now(),
    };
    if (!this.firstFired) {
      this.firstFired = true;
      this._emit('first', this.active);
    }
    this._emit('gesture', this.active);
    this._emit('down', this.active);
  }

  _move(e) {
    if (!this.active || this.active.id !== e.pointerId) return;
    const c = this._coords(e);
    this.active.x = c.x;
    this.active.y = c.y;
    this.active.nx = c.nx;
    this.active.ny = c.ny;
    this.active.w = c.w;
    this.active.h = c.h;
    this.active.dx = c.x - this.active.startX;
    this.active.dy = c.y - this.active.startY;
    this.active.maxMove = Math.max(this.active.maxMove, Math.hypot(this.active.dx, this.active.dy));
    this._emit('move', this.active);
  }

  _up(e) {
    if (!this.active || this.active.id !== e.pointerId) return;
    const c = this._coords(e);
    this.active.x = c.x;
    this.active.y = c.y;
    this.active.nx = c.nx;
    this.active.ny = c.ny;
    this.active.dx = c.x - this.active.startX;
    this.active.dy = c.y - this.active.startY;
    const heldMs = performance.now() - this.active.downTime;
    const ptr = this.active;
    this.active = null;
    this._emit('up', ptr);
    if (ptr.maxMove < 18 && heldMs < 550) {
      this._emit('tap', ptr);
    }
  }
}
