import { T, scene, camera, renderer, resize, render, buildEnvironment, post, placeSun } from './core.js';
import * as FD from './field.js';
import { buildWorld } from './world.js';
const params = new URLSearchParams(location.search);
import { rig, buildRig, updateRig } from './tools.js';

resize();
window.addEventListener('resize', resize);
buildWorld(FD.leafMesh.material);
buildEnvironment();
FD.initLeaves();
const upgradeLeaves = FD.loadLeafTextures(() => {
  const img = FD.leafMesh.material.map.image; FD.paintStains(img);
});
camera.position.set(0, 1.55, 1.6);
camera.lookAt(0, 0.2, -2.6);
import('./human.js').then(async (H) => {
  if (!params.has('people')) return;
  const g = await new H.Person('girl').load('girl'); g.root.position.set(-0.5, 0, -1.2); g.root.rotation.y = 0.6; g.root.visible = true;
  const p = await new H.Person('papa').load('papa'); p.root.position.set(0.4, 0, -2.0); p.root.rotation.y = -0.4; p.root.visible = true;
  const m = await new H.Person('grandma').load('grandma'); m.root.position.set(1.2, 0, -2.6); m.root.rotation.y = -0.8; m.root.visible = true;
  const cap = H.makeCap(); g.attach(cap, 4, new T.Vector3(0, 0.085, -0.01)); cap.rotation.x = -0.15;
  window.__people = [g, p, m];
  const act = params.get('people'); if (act) { p.set(act); g.set(act === 'fall' ? 'cheer' : act); }
  camera.position.set(0.2, 1.3, 1.4); camera.lookAt(0.2, 0.75, -1.6); post.uFocus.value = 2.9;
});
const people = () => window.__people || [];
buildRig().then(() => { if (params.has('rig')) rig.visible = true; });
if (params.has('rig')) { rig.tool = params.get('rig') || 'broom'; camera.position.set(0, 1.2, 0.4); camera.lookAt(0, 0, -1.2); rig.P.set(0.0, 0, -0.95); post.uFocus.value = 1.3; } else post.uFocus.value = 3.5;
if (params.has('hand')) { setTimeout(() => { rig.visible = true; updateRig(0.016, 0); const h = rig.hands[0].grp; const p = h.position.clone(); camera.position.copy(p).add(new T.Vector3(0.12, 0.16, 0.22)); camera.lookAt(p); camera.userData.lock = true; post.uFocus.value = 0.3; }, 1500); }

// debug: pre-sweep a strip
if (params.has('sweep')) {
  setTimeout(() => {
    for (let k = 0; k < 6; k++) {
      const x = -0.6 + k * 0.24;
      for (let z = -4.2; z < -0.4; z += 0.04) { FD.eraseCoverage(x, z, x, z + 0.04, 0.17, 0.9, [x, z + 0.1]); FD.pushLeaves(x, z, x - 0.002 + (x < 0 ? -0.04 : 0.04), z + 0.04, 0.34); }
    }
    for (let z = -4.2; z < -0.4; z += 0.05) { FD.pushLeaves(-0.1, z, -1.6, z, 0.06); }
  }, 300);
}
let last = performance.now(), t = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  FD.step(dt, t);
  if (!camera.userData.lock) updateRig(dt, t);
  for (const p of people()) p.update(dt);
  render(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setTimeout(() => { document.getElementById('boot').classList.add('hide'); upgradeLeaves(); FD.groundMat.userData.upgrade(); }, 200);
window.__ready = true;
