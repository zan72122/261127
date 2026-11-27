export class WordlessUI {
  constructor(onAction) {
    this.btn = document.getElementById('action-btn');
    this.iconFloat = document.getElementById('icon-float');
    this.iconWhale = document.getElementById('icon-whale');
    this.mode = null;

    this.btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    this.btn.addEventListener('pointermove', (e) => {
      e.stopPropagation();
    });
    this.btn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
    });
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.mode && onAction) onAction(this.mode);
    });
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (!mode) {
      this.btn.classList.remove('visible');
      return;
    }
    this.iconFloat.style.display = mode === 'dismount' ? 'block' : 'none';
    this.iconWhale.style.display = mode === 'call' ? 'block' : 'none';
    this.btn.classList.add('visible');
  }
}
