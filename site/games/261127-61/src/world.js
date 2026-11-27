// Scene assembly: renderer-independent objects for the savanna meadow.
import * as THREE from 'three';
import { makeSky, dirFromElAz } from './sky.js';
import { makeGround, makePrints } from './ground.js';
import { makePressMap, makeBlades, MAX_TUFTS, shared } from './grass.js';
import { makeAcacia, makeHills } from './flora.js';
import { mulberry, LIGHT } from './giraffe.js';

export const R_CAM = 12;
export const STATIONS = [-72, -48, -24, 0, 24, 48, 72];
export const SITES = [[0, 0], [-1.5, -0.9], [1.4, -1.1], [0.5, 1.0]];
export const BROWSE = [[-4.0, -5.6], [4.6, -5.2]];
export const BG_SPOTS = [[-8, -22], [3.5, -23.5], [-11, -18.5], [7, -19], [-1, -26]];
export const ringPos = (psiDeg, r) => { const a = psiDeg * Math.PI / 180; return [-r * Math.sin(a), r * Math.cos(a)]; };

export function buildWorld(quality) {
  const scene = new THREE.Scene();
  const rnd = mulberry(20261127);
  // sky + fog
  const sky = makeSky(); scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0x9aa6b8, 0.0042);
  // lights
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.castShadow = true;
  const sm = quality.shadow;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  const sc = key.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 120;
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x5a4a34, 0.8);
  scene.add(hemi);
  // ground and traces
  const ground = makeGround(); scene.add(ground.mesh);
  const press = makePressMap();
  const prints = makePrints(); scene.add(prints.mesh);
  // meadow short grass (flat resting place) ------------------------------------------------------
  const meadow = [];
  const nMeadow = Math.round(9000 * quality.grass);
  for (let i = 0; i < nMeadow; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 5.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const edge = r / 5.4;
    meadow.push({ p: [x, 0, z], P: [0.05 + rnd() * 0.09 + edge * edge * 0.12, 0.010 + rnd() * 0.006, rnd() * 6.283, 0.1 + rnd() * 0.5], C: [0.25 + rnd() * 0.5 + edge * 0.3, rnd(), 0, 0] });
  }
  const meadowMesh = makeBlades(meadow, 3, 'meadow', false); scene.add(meadowMesh);
  // mid grass tussocks around the meadow and out on the plain ---------------------------------------------
  const mid = [];
  const nClumps = Math.round(1700 * quality.grass);
  for (let c = 0; c < nClumps; c++) {
    const a = rnd() * Math.PI * 2;
    const far = c > nClumps * 0.55;
    const r = far ? 16 + Math.pow(rnd(), 0.7) * 34 : 5.0 + rnd() * 11;
    const [cx, cz] = [Math.cos(a) * r, Math.sin(a) * r];
    // keep the ring band (tall tufts) and the camera path clear
    if (r > 8.0 && r < 10.4) continue;
    const psi = Math.atan2(-cx, cz) * 180 / Math.PI;
    const nearCam = r > 10.4 && r < 13.6 && Math.abs(psi) < 86;
    if (nearCam && Math.abs(r - 12) < 0.35 && rnd() < 0.5) continue;
    const nb = far ? 6 : (nearCam ? 11 : 9);
    const hS = far ? 1.25 : (nearCam ? 0.8 : 1.0);
    for (let k = 0; k < nb; k++) {
      const x = cx + (rnd() - 0.5) * 0.35, z = cz + (rnd() - 0.5) * 0.35;
      mid.push({ p: [x, 0, z], P: [(0.22 + rnd() * 0.38) * hS, 0.012 + rnd() * 0.008, rnd() * 6.283, 0.25 + rnd() * 0.7], C: [0.55 + rnd() * 0.45, rnd(), 0, 0] });
    }
  }
  for (let c = 0; c < Math.round(520 * quality.grass); c++) {
    const psi = (rnd() - 0.5) * 170, r = 10.5 + rnd() * 3.4;
    if (Math.abs(r - 12) < 0.3) continue;
    const a = psi * Math.PI / 180; const cx = -r * Math.sin(a), cz = r * Math.cos(a);
    for (let k = 0; k < 9; k++) mid.push({ p: [cx + (rnd() - 0.5) * 0.4, 0, cz + (rnd() - 0.5) * 0.4], P: [0.25 + rnd() * 0.35, 0.013 + rnd() * 0.008, rnd() * 6.283, 0.3 + rnd() * 0.8], C: [0.5 + rnd() * 0.5, rnd(), 0, 0] });
  }
  const midMesh = makeBlades(mid, 4, 'mid', false); scene.add(midMesh);
  // tall tufts in a ring between the observer path and the meadow, with gaps at the stations -------------
  const tufts = [];
  let ti = 1;
  const addTuft = (psi, r, h, peek) => {
    const [x, z] = ringPos(psi, r);
    const near = Math.abs(psi) < 96;
    const idx = near && ti < MAX_TUFTS ? ti++ : 0;
    tufts.push({ psi, r, x, z, h, idx, peek, bend: new THREE.Vector2(), vel: new THREE.Vector2(), hold: null, hi: 0, wid: 0.28 + rnd() * 0.12 });
  };
  for (let psi = -180; psi < 180; psi += 3.0 + rnd() * 1.4) {
    if (Math.abs(psi) <= 84) {
      let nearest = 99; for (const s of STATIONS) nearest = Math.min(nearest, Math.abs(psi - s));
      if (nearest < 6.2) continue;
    }
    addTuft(psi, 8.5 + rnd() * 1.6, 0.95 + rnd() * 0.45, false);
  }
  for (const s of STATIONS) addTuft(s + (rnd() < 0.5 ? -1 : 1) * (1.2 + rnd() * 1.6), 9.55 + rnd() * 0.35, 1.18 + rnd() * 0.2, true);
  // lower tussocks just inside each gap (in front of the observer after stepping through)
  for (const s of STATIONS) for (const k of [-1, 1]) { const t0 = tufts.length; addTuft(s + k * (3.8 + rnd() * 1.4), 5.5 + rnd() * 0.3, 0.46 + rnd() * 0.14, false); tufts[t0].inner = true; tufts[t0].wid = 0.34; }
  // near tufts (interactive, cast shadows) and far tufts (scenery only) are separate draws
  const nearBlades = [], farBlades = [];
  for (const t of tufts) {
    const arr = t.idx ? nearBlades : farBlades;
    t.start = arr.length; buildTuftBlades(t, arr, rnd); t.count = arr.length - t.start;
    t.off = arr.slice(t.start).map((b) => [b.p[0] - t.x, b.p[2] - t.z]);
  }
  const tuftMesh = makeBlades(nearBlades, 6, 'tuft', true); scene.add(tuftMesh);
  const farTuftMesh = makeBlades(farBlades, 4, 'tuftFar', false); scene.add(farTuftMesh);
  // move a tuft (used to vary which stems overlap the view each evening)
  const moveTuft = (t, x, z) => {
    const a = tuftMesh.geometry.attributes.iPos;
    for (let i = 0; i < t.count; i++) { a.setX(t.start + i, x + t.off[i][0]); a.setZ(t.start + i, z + t.off[i][1]); }
    a.needsUpdate = true; t.x = x; t.z = z;
  };
  // acacias -----------------------------------------------------------------------------------------
  const trees = [];
  const treeSpots = [[...BROWSE[0], 0.85, 3], [...BROWSE[1], 0.8, 4], [-18, -30, 1.1, 5], [22, -26, 1.2, 6], [-34, 6, 1.0, 7], [30, 14, 1.0, 8], [4, -48, 1.3, 9], [-42, -40, 1.2, 10]];
  for (const [x, z, s, seed] of treeSpots) { const t = makeAcacia(seed, s); t.position.set(x, 0, z); scene.add(t); trees.push(t); }
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = 80 + rnd() * 140;
    const t = makeAcacia(100 + i, 1.0 + rnd() * 0.5);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    t.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    scene.add(t);
  }
  const hills = makeHills(); scene.add(hills);
  return { scene, sky, key, hemi, ground, press, prints, meadowMesh, midMesh, tuftMesh, tufts, trees, hills, rnd, moveTuft };
}

function buildTuftBlades(t, out, rnd) {
  const n = Math.round(62 + rnd() * 26);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * t.wid * 0.5;
    const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
    const yaw = a + (rnd() - 0.5) * 1.0;
    // blades lean outward from the tuft centre
    const lean = 0.2 + rnd() * 0.55 * (rr / (t.wid * 0.5));
    const h = t.h * (0.55 + rnd() * 0.5);
    out.push({ p: [x, 0, z], P: [h, 0.013 + rnd() * 0.009, Math.atan2(-Math.cos(a), Math.sin(a)) * 0 + yaw, lean], C: [0.6 + rnd() * 0.4, rnd(), 0, t.idx] });
  }
  // seed heads: thin taller stems
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, rr = rnd() * t.wid * 0.3;
    out.push({ p: [t.x + Math.cos(a) * rr, 0, t.z + Math.sin(a) * rr], P: [t.h * (1.05 + rnd() * 0.25), 0.006, rnd() * 6.28, 0.25 + rnd() * 0.3], C: [0.95, rnd(), 0, t.idx] });
  }
}

// time-of-day lighting --------------------------------------------------------------------------------------
const cWarm = new THREE.Color(1.0, 0.55, 0.25), cDay = new THREE.Color(1.0, 0.95, 0.88), cMoon = new THREE.Color(0.62, 0.72, 1.0);
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
export function applyLighting(W, renderer, sunDir, moonDir, moonVis, focus) {
  const se = Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1)) * 180 / Math.PI;
  const day = THREE.MathUtils.smoothstep(se, -7, 8);
  const gold = THREE.MathUtils.clamp(1 - Math.abs(se - 2) / 19, 0, 1) * THREE.MathUtils.smoothstep(se, -9, -1);
  const sunI = THREE.MathUtils.smoothstep(se, -0.6, 3.5) * (1.1 + 1.9 * THREE.MathUtils.smoothstep(se, 2, 30));
  const night = 1 - THREE.MathUtils.smoothstep(se, -12, -3);
  const moonI = moonVis * night * 0.55;
  const sky = W.sky.uni;
  sky.uSun.value.copy(sunDir); sky.uMoon.value.copy(moonDir);
  sky.uDay.value = day; sky.uGold.value = gold; sky.uStars.value = night;
  sky.uSunVis.value = THREE.MathUtils.smoothstep(se, -1.5, 0.2);
  sky.uMoonVis.value = moonVis;
  // key light: sun when it is up, otherwise moon
  const useSun = sunI > moonI * 1.5 || se > -1;
  const key = W.key;
  let kdir, kcol;
  if (useSun) {
    kdir = sunDir.clone(); kdir.y = Math.max(kdir.y, 0.035); kdir.normalize();
    kcol = tmpC.copy(cWarm).lerp(cDay, THREE.MathUtils.smoothstep(se, 3, 35)).multiplyScalar(sunI);
  } else {
    // after sunset the bright western sky still lights the scene, then the moon takes over
    const tw = THREE.MathUtils.smoothstep(se, -11, -0.5) * (1 - moonVis * 0.6);
    const sd = sunDir.clone(); sd.y = 0.18; sd.normalize();
    const md = moonDir.clone(); md.y = Math.max(md.y, 0.12); md.normalize();
    kdir = md.multiplyScalar(moonI + 0.02).add(sd.multiplyScalar(tw * 0.5)).normalize();
    kcol = tmpC.copy(cMoon).multiplyScalar(moonI + 0.05).add(tmpC2.setRGB(0.75, 0.45, 0.42).multiplyScalar(tw * 0.55));
  }
  key.color.copy(kcol); key.intensity = 1;
  key.position.copy(focus).addScaledVector(kdir, 60);
  key.target.position.copy(focus);
  key.target.updateMatrixWorld();
  LIGHT.dir.value.copy(kdir); LIGHT.col.value.copy(kcol);
  // ambient: sky and bounce
  const hs = tmpC2.setRGB(0.07, 0.10, 0.20).lerp(new THREE.Color(0.55, 0.62, 0.80), day);
  hs.lerp(new THREE.Color(0.75, 0.55, 0.50), gold * 0.5);
  W.hemi.color.copy(hs);
  W.hemi.groundColor.setRGB(0.05, 0.045, 0.04).lerp(new THREE.Color(0.40, 0.31, 0.20), day);
  const twi = THREE.MathUtils.smoothstep(se, -12, -1) * (1 - THREE.MathUtils.smoothstep(se, -1, 4));
  W.hemi.intensity = 0.9 + 0.6 * night + 1.1 * twi;
  // fog colour ~ horizon
  const fogC = new THREE.Color(0.06, 0.08, 0.14).lerp(new THREE.Color(0.52, 0.58, 0.68), day).lerp(new THREE.Color(0.80, 0.52, 0.36), gold * 0.75);
  W.scene.fog.color.copy(fogC);
  W.hills.material.color.copy(fogC).multiplyScalar(0.7);
  // exposure: keep the night readable (legs and contact points visible)
  renderer.toneMappingExposure = 0.9 + 0.9 * night + 0.1 * gold + 0.5 * twi;
  // low raking light factor
  const low = useSun ? (1 - THREE.MathUtils.smoothstep(se, 6, 26)) * THREE.MathUtils.smoothstep(se, -0.5, 1.5) : 0.25;
  W.ground.uni.uLow.value = low;
  W.prints.mat.uniforms.uLow.value = low;
  shared.uWind.value = 0.18 + 0.12 * day;
  return { se, day, gold, night, low };
}
export { dirFromElAz };
