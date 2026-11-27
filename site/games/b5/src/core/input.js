export class Input {
  constructor(el) {
    this.el = el;
    this.active = null;
    this.onTap = null;
    this.onDown = null;
    this.onMove = null;
    this.onUp = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    el.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    window.addEventListener('pointermove', this._onPointerMove, { passive: false });
    window.addEventListener('pointerup', this._onPointerUp, { passive: false });
    window.addEventListener('pointercancel', this._onPointerUp, { passive: false });
  }

  _pos(e) {
    const rect = this.el.getBoundingClientRect();
    return {
      id: e.pointerId != null ? e.pointerId : 1,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: performance.now(),
    };
  }

  _onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (this.active) return;
    e.preventDefault();
    const p = this._pos(e);
    this.active = {
      id: p.id,
      sx: p.x,
      sy: p.y,
      x: p.x,
      y: p.y,
      st: p.t,
      dist: 0,
    };
    if (this.onDown) this.onDown(this.active);
  }

  _onPointerMove(e) {
    if (!this.active) return;
    const pid = e.pointerId != null ? e.pointerId : 1;
    if (pid !== this.active.id) return;
    e.preventDefault();
    const p = this._pos(e);
    const dx = p.x - this.active.x;
    const dy = p.y - this.active.y;
    this.active.dist += Math.hypot(dx, dy);
    this.active.x = p.x;
    this.active.y = p.y;
    if (this.onMove) this.onMove(this.active);
  }

  _onPointerUp(e) {
    if (!this.active) return;
    const pid = e.pointerId != null ? e.pointerId : 1;
    if (pid !== this.active.id) return;
    const p = this._pos(e);
    this.active.x = p.x;
    this.active.y = p.y;
    const dt = p.t - this.active.st;
    const wasTap = this.active.dist < 28 && dt < 650;
    const finished = { ...this.active };
    this.active = null;
    if (this.onUp) this.onUp(finished);
    if (wasTap && this.onTap) this.onTap(finished);
  }
}
