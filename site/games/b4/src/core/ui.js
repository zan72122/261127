export class WordlessUI {
  constructor(onAction) {
    this.btn = document.getElementById('action-btn');
    this.iconParasol = document.getElementById('icon-parasol');
    this.iconPlane = document.getElementById('icon-plane');
    this.mode = 'none';

    this.btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.mode !== 'none' && onAction) onAction(this.mode);
    });
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'dismount') {
      this.btn.classList.add('visible');
      this.iconParasol.style.display = 'block';
      this.iconPlane.style.display = 'none';
    } else if (mode === 'board') {
      this.btn.classList.add('visible');
      this.iconParasol.style.display = 'none';
      this.iconPlane.style.display = 'block';
    } else {
      this.btn.classList.remove('visible');
    }
  }
}
