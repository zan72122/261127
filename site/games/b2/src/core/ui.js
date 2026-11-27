export class WordlessUI {
  constructor() {
    this.btn = document.getElementById('action-btn');
    this.iconFloat = document.getElementById('icon-float');
    this.iconCall = document.getElementById('icon-call');
    this.mode = 'none';
    this.onTrigger = null;

    this.btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onTrigger) this.onTrigger(this.mode);
    });
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'float') {
      this.iconFloat.style.display = 'block';
      this.iconCall.style.display = 'none';
      this.btn.classList.add('visible');
    } else if (mode === 'call') {
      this.iconFloat.style.display = 'none';
      this.iconCall.style.display = 'block';
      this.btn.classList.add('visible');
    } else {
      this.btn.classList.remove('visible');
    }
  }
}
