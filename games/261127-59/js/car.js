// Guest car: baked SDF body with clearcoat paint, glass, chrome; lathe tyres with tread, alloy wheels.
import { T, scene, tex } from './core.js';
import { loadBin, clothMaterial } from './sdf.js';

export const car = { group: new T.Group(), wheels: [], speed: 0, ready: false, target: null, onStop: null, dist: 0 };
car.group.visible = false;
scene.add(car.group);

function tyre() {
  const g = new T.Group();
  const prof = [];
  const R = 0.31, w = 0.1, r0 = 0.2;
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI / 2 + (i / 16) * Math.PI;
    prof.push(new T.Vector2(R - 0.035 + Math.cos(a) * 0.035, Math.sin(a) * w));
  }
  prof.unshift(new T.Vector2(r0, -w * 0.9)); prof.push(new T.Vector2(r0, w * 0.9));
  const tg = new T.LatheGeometry(prof, 48);
  const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 12, uv.getY(i));
  const rubber = new T.MeshStandardMaterial({ color: 0x161616, roughness: 0.88, normalMap: tex('tread_normal.jpg'), normalScale: new T.Vector2(1.2, 1.2) });
  const t = new T.Mesh(tg, rubber);
  t.rotation.z = Math.PI / 2;
  const rimMat = new T.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 1, roughness: 0.22, normalMap: tex('stone_normal.jpg'), normalScale: new T.Vector2(0.05, 0.05) });
  const rim = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.17, 32), rimMat);
  rim.rotation.z = Math.PI / 2;
  const hub = new T.Mesh(new T.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), rimMat);
  hub.rotation.z = -Math.PI / 2; hub.position.x = 0.085;
  // spokes
  for (let k = 0; k < 6; k++) {
    const s = new T.Mesh(new T.BoxGeometry(0.02, 0.16, 0.035), rimMat);
    s.position.x = 0.08; s.rotation.x = (k / 6) * Math.PI * 2; s.translateY(0.09);
    g.add(s);
  }
  g.add(t, rim, hub);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export async function loadCar() {
  const geo = await loadBin('bin/car.bin');
  const mat = clothMaterial({ clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0, envMapIntensity: 1.2 });
  const body = new T.Mesh(geo, mat);
  body.castShadow = true; body.receiveShadow = true;
  car.group.add(body);
  for (const [x, y, z] of [[0.74, 0.31, 1.3], [-0.74, 0.31, 1.3], [0.74, 0.31, -1.32], [-0.74, 0.31, -1.32]]) {
    const w = tyre();
    w.position.set(x, y, z);
    if (x < 0) w.scale.x = -1;
    car.group.add(w);
    car.wheels.push(w);
  }
  // soft contact shadow under the car (ambient occlusion)
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const ao = new T.Mesh(new T.PlaneGeometry(2.2, 4.6), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
  ao.rotation.x = -Math.PI / 2; ao.position.y = 0.012;
  car.group.add(ao);
  car.ready = true;
}

export function driveTo(z, onStop) { car.target = z; car.onStop = onStop; car.speed = 3.2; }
export function updateCar(dt) {
  if (!car.ready || !car.group.visible) return 0;
  let v = 0;
  if (car.target !== null) {
    const d = car.target - car.group.position.x;
    const want = Math.min(3.2, Math.max(0.0, d * 0.9));
    car.speed += (want - car.speed) * Math.min(1, dt * 2.5);
    if (d < 0.02 || car.speed < 0.02 && d < 0.3) { car.speed = 0; car.target = null; const cb = car.onStop; car.onStop = null; cb && cb(); }
    v = car.speed;
    car.group.position.x += v * dt;
    for (const w of car.wheels) w.rotation.x -= (v * dt) / 0.31;
    // gentle body pitch while braking
    car.group.children[0].rotation.x = -Math.min(0.02, Math.max(-0.02, (want - car.speed) * 0.01));
  }
  return v;
}
