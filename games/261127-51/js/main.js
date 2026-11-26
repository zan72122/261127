import { T, scene, camera, renderer, resize, render, loadHiTextures, setQuality, getQuality } from './core.js';
import { buildLights, buildEnv, buildRoom } from './world.js';
import { loadActors } from './actors.js';
import { initGame, updateGame, debugGo, debugCam, GAME, P0 } from './game.js';

buildLights();
buildRoom();
resize();
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

await loadActors();
buildEnv();
initGame();
const q = new URLSearchParams(location.search);
const FF = q.get('ff') === '1';
if (q.get('go')) debugGo(q.get('go'));
if (q.get('cam')) debugCam(q.get('cam').split(',').map(Number));
window.__G = GAME; window.__P0 = P0; window.__A = (await import('./actors.js')).A;
window.__proj = (x, y, z) => { const v = new T.Vector3(x, y, z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };

renderer.compile(scene, camera);
let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsT = 0, started = false;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = FF ? 0.1 : Math.min(0.05, (now - last) / 1000);
  last = now;
  updateGame(dt);
  render(now / 1000);
  if (!started) {
    started = true;
    setTimeout(() => document.getElementById('cover').classList.add('off'), 200);
    setTimeout(loadHiTextures, 600);
  }
  // adaptive resolution: keep the phone at 30fps or better
  fpsT += dt; fpsAcc += dt; fpsN++;
  if (fpsT > 2.5) {
    const avg = fpsAcc / fpsN;
    if (avg > 1 / 32 && getQuality() > 0.55) setQuality(Math.max(0.55, getQuality() - 0.15));
    else if (avg < 1 / 55 && getQuality() < 1) setQuality(Math.min(1, getQuality() + 0.1));
    fpsT = 0; fpsAcc = 0; fpsN = 0;
  }
});
