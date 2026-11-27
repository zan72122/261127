// Wordless corner action button (dismount canopy / call carpet).
export class WordlessUI {
  constructor(onClick) {
    this.btn = document.getElementById('action-btn');
    this.iconFloat = document.getElementById('icon-float');
    this.iconCall = document.getElementById('icon-call');
    this.mode = 'none';
    this.btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.mode !== 'none') onClick(this.mode);
    });
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'none') {
      this.btn.classList.remove('visible');
    } else {
      this.iconFloat.style.display = mode === 'dismount' ? 'block' : 'none';
      this.iconCall.style.display = mode === 'call' ? 'block' : 'none';
      this.btn.classList.add('visible');
    }
  }
}
