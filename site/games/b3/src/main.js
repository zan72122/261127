import { Game } from './game.js';

const params = new URLSearchParams(location.search);

async function boot(p) {
  const game = new Game(p);
  window.__game = game;
  await game.init();
}

function liftVeil() {
  const veil = document.getElementById('veil');
  if (!veil) return;
  veil.style.opacity = '0';
  setTimeout(() => { veil.style.display = 'none'; }, 600);
}

try {
  await boot(params);
} catch (err) {
  window.__errors = window.__errors || [];
  window.__errors.push(String((err && (err.stack || err.message)) || err));
  if (params.get('q') !== 'low') {
    params.set('q', 'low');
    try {
      await boot(params);
    } catch (err2) {
      window.__errors.push(String((err2 && (err2.stack || err2.message)) || err2));
      liftVeil();
    }
  } else {
    liftVeil();
  }
}
