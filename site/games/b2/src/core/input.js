export class Input {
  constructor(dom) {
    this.dom = dom;
    this.active = null;
    this.onDown = null;
    this.onMove = null;
    this.onUp = null;
    this.onTap = null;

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);

    dom.addEventListener('pointerdown', this._down, { passive: false });
    window.addEventListener('pointermove', this._move, { passive: false });
    window.addEventListener('pointerup', this._up, { passive: false });
    window.addEventListener('pointercancel', this._up, { passive: false });
  }

  _pack(e) {
    return {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      dist: 0,
      t0: performance.now(),
    };
  }

  _down(e) {
    if (this.active && this.active.id !== e.pointerId) return;
    e.preventDefault();
    const p = this._pack(e);
    this.active = p;
    if (this.onDown) this.onDown(p);
  }

  _move(e) {
    if (!this.active || this.active.id !== e.pointerId) return;
    e.preventDefault();
    const p = this.active;
    p.x = e.clientX;
    p.y = e.clientY;
    p.dist = Math.max(p.dist, Math.hypot(p.x - p.sx, p.y - p.sy));
    if (this.onMove) this.onMove(p);
  }

  _up(e) {
    if (!this.active || this.active.id !== e.pointerId) return;
    const p = this.active;
    p.x = e.clientX;
    p.y = e.clientY;
    p.dist = Math.max(p.dist, Math.hypot(p.x - p.sx, p.y - p.sy));
    const dt = (performance.now() - p.t0) / 1000;
    this.active = null;
    if (this.onUp) this.onUp(p);
    if (p.dist < 22 && dt < 0.55 && this.onTap) {
      this.onTap(p);
    }
  }
}
