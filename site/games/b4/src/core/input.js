import { clamp } from './math.js';

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.active = false;
    this.pointerId = null;
    this.startX = 0;
    this.startY = 0;
    this.curX = 0;
    this.curY = 0;
    this.downTime = 0;
    this.steerX = 0;
    this.steerY = 0;
    this.onTap = null;
    this.onInteract = null;

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);

    dom.addEventListener('pointerdown', this._down, { passive: false });
    window.addEventListener('pointermove', this._move, { passive: false });
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
  }

  _down(e) {
    if (e.target !== this.dom) return;
    if (this.active && this.pointerId !== e.pointerId) return;
    if (e.cancelable) e.preventDefault();
    this.active = true;
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.curX = e.clientX;
    this.curY = e.clientY;
    this.downTime = performance.now();
    this._updateSteer();
    if (this.onInteract) this.onInteract();
  }

  _move(e) {
    if (!this.active || e.pointerId !== this.pointerId) return;
    if (e.cancelable) e.preventDefault();
    this.curX = e.clientX;
    this.curY = e.clientY;
    this._updateSteer();
    if (this.onInteract) this.onInteract();
  }

  _up(e) {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this.curX = e.clientX;
    this.curY = e.clientY;
    const elapsed = (performance.now() - this.downTime) / 1000;
    const dist = Math.hypot(this.curX - this.startX, this.curY - this.startY);
    this.active = false;
    this.pointerId = null;
    this.steerX = 0;
    this.steerY = 0;

    if (elapsed < 0.42 && dist < 20 && this.onTap) {
      const rect = this.dom.getBoundingClientRect();
      const ndcX = ((this.curX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ndcY = -(((this.curY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
      this.onTap(ndcX, ndcY, this.curX, this.curY);
    }
  }

  _updateSteer() {
    const rect = this.dom.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const minDim = Math.max(240, Math.min(w, h));

    const dx = this.curX - this.startX;
    const dy = this.curY - this.startY;
    const dragDist = Math.hypot(dx, dy);

    // Normalized screen position: left -1..+1 right, bottom -1..+1 top
    const zoneX = clamp(((this.curX - rect.left) / w) * 2 - 1, -1, 1);
    const zoneY = clamp(-(((this.curY - rect.top) / h) * 2 - 1), -1, 1);

    if (dragDist > 16) {
      // Responsive drag steering
      const dragX = clamp(dx / (minDim * 0.24), -1, 1);
      const dragY = clamp(-dy / (minDim * 0.24), -1, 1);
      this.steerX = dragX;
      this.steerY = dragY;
    } else {
      // Hold steering by screen zone with a gentle center deadzone
      const dead = 0.14;
      const sx = Math.abs(zoneX) > dead ? (zoneX - Math.sign(zoneX) * dead) / (1 - dead) : 0;
      const sy = Math.abs(zoneY) > dead ? (zoneY - Math.sign(zoneY) * dead) / (1 - dead) : 0;
      this.steerX = clamp(sx * 1.15, -1, 1);
      this.steerY = clamp(sy * 1.15, -1, 1);
    }
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
  }
}
