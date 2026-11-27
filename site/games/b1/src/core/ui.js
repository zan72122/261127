// Wordless corner action button (canopy dismount during ride; sleigh summon while walking/floating)
export class WordlessUI {
  constructor(onAction) {
    this.btn = document.getElementById('action-btn');
    this.iconFloat = document.getElementById('icon-float');
    this.iconCall = document.getElementById('icon-call');
    this.mode = null;

    const trigger = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.mode && onAction) onAction(this.mode);
    };
    this.btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.btn.addEventListener('click', trigger);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!mode) {
      this.btn.classList.remove('visible');
      return;
    }
    this.iconFloat.style.display = mode === 'dismount' ? 'block' : 'none';
    this.iconCall.style.display = mode === 'call' ? 'block' : 'none';
    this.btn.classList.add('visible');
  }
}
