// Entry: renderer, camera framing, loop
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initMaterials, M, TX } from './mats.js';
import * as T from './tex.js';
import { buildRoom } from './room.js';
import { VIEW } from './layout.js';
import { Game } from './game.js';

function boot() {
  const cv = document.getElementById('c');
  let gl2 = null;
  try { gl2 = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); } catch (e) { gl2 = null; }
  if (!gl2) { fallback(); return; }
  const renderer = new THREE.WebGLRenderer({ canvas: cv, context: gl2, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  initMaterials();
  // background: warm out-of-focus room
  scene.background = T.backdrop();
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pm.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.55;
  envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  pm.dispose();

  const hemi = new THREE.HemisphereLight('#fff7ee', '#b48a66', 0.75); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff0dc', 2.3);
  key.position.set(-0.55, 1.5, 1.15); key.target.position.set(0.3, 0, -0.15);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera; sc.left = -1.05; sc.right = 1.05; sc.top = 0.85; sc.bottom = -0.85; sc.near = 0.5; sc.far = 3.4;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.012; key.shadow.radius = 3;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#e3f1ff', 0.55); rim.position.set(0.4, 0.9, -1.4); scene.add(rim);

  const room = buildRoom(scene);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 20);

  const S = { w: 1, h: 1, dpr: 1, viewName: 'living', camPos: new THREE.Vector3(), camTgt: new THREE.Vector3(), wantPos: new THREE.Vector3(), wantTgt: new THREE.Vector3(), first: true };
  try { const m = /[?&]cam=([-0-9.,]+)/.exec(location.search); if (m) { const v = m[1].split(',').map(Number); if (v.length === 6) S.debugCam = v; } } catch (e) {}
  const game = new Game({ renderer, scene, camera, room, key, S, setView });

  function regionFor(name, aspect) {
    if (aspect >= 1.2) return VIEW.all;
    return name === 'bed' ? VIEW.bed : VIEW.living;
  }
  const tmpV = new THREE.Vector3();
  function fit(region, aspect, outPos, outTgt) {
    const pitch = aspect < 0.75 ? 0.8 : aspect < 1.2 ? 0.62 : 0.47;
    camera.fov = aspect < 0.75 ? 38 : aspect < 1.2 ? 34 : 30;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const corners = [];
    for (const x of [region.x0, region.x1]) for (const y of [0, region.y1]) for (const z of [region.z0, region.z1]) corners.push(new THREE.Vector3(x, y, z));
    if (region.top) corners.push(new THREE.Vector3((region.x0 + region.x1) / 2 - 0.25, region.top, region.z0));
    const tgt = new THREE.Vector3((region.x0 + region.x1) / 2, region.y1 * 0.3, (region.z0 + region.z1) / 2);
    const sa = safeInsets();
    const mx = 0.96 - 2 * Math.max(sa.l, sa.r) / Math.max(1, S.w), myT = 0.9 - 2 * sa.t / Math.max(1, S.h), myB = 0.94 - 2 * sa.b / Math.max(1, S.h);
    let dist = 1.5;
    for (let it = 0; it < 4; it++) {
      let lo = 0.2, hi = 12;
      for (let k = 0; k < 34; k++) {
        const d = (lo + hi) / 2; camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateMatrixWorld();
        let ok = true;
        for (const c of corners) { tmpV.copy(c).project(camera); if (tmpV.z > 1 || Math.abs(tmpV.x) > mx || tmpV.y > myT || tmpV.y < -myB) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      dist = hi;
      camera.position.copy(tgt).addScaledVector(dir, dist); camera.lookAt(tgt); camera.updateMatrixWorld();
      let minx = 9, maxx = -9, miny = 9, maxy = -9;
      for (const c of corners) { tmpV.copy(c).project(camera); minx = Math.min(minx, tmpV.x); maxx = Math.max(maxx, tmpV.x); miny = Math.min(miny, tmpV.y); maxy = Math.max(maxy, tmpV.y); }
      const cxN = (minx + maxx) / 2, cyN = (miny + maxy) / 2 + (myB - myT) / 2;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
      tgt.addScaledVector(right, cxN * hh * aspect).addScaledVector(up, cyN * hh);
    }
    outTgt.copy(tgt); outPos.copy(tgt).addScaledVector(dir, dist);
  }
  function safeInsets() {
    try { const el = document.getElementById('safe'); if (!el) return { l: 0, r: 0, t: 0, b: 0 }; const cs = getComputedStyle(el); return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; } catch (e) { return { l: 0, r: 0, t: 0, b: 0 }; }
  }
  function setView(name) {
    S.viewName = name;
    fit(regionFor(name, S.w / S.h), S.w / S.h, S.wantPos, S.wantTgt);
    const port = S.w / S.h < 1.2, eL = document.getElementById('edgeL'), eR = document.getElementById('edgeR');
    if (eL) eL.className = port && name === 'bed' ? 'on' : ''; if (eR) eR.className = port && name === 'living' ? 'on' : '';
  }
  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    S.w = w; S.h = h;
    S.dpr = Math.min(2, window.devicePixelRatio || 1) * game.quality.dprScale;
    renderer.setPixelRatio(S.dpr); renderer.setSize(w, h, false);
    setView(S.viewName);
    if (S.first) { S.camPos.copy(S.wantPos); S.camTgt.copy(S.wantTgt); S.first = false; }
    game.onResize();
    const port = w / h < 1.2, eL = document.getElementById('edgeL'), eR = document.getElementById('edgeR');
    if (eL) eL.className = port && S.viewName === 'bed' ? 'on' : ''; if (eR) eR.className = port && S.viewName === 'living' ? 'on' : '';
  }
  game.resize = resize;
  try { if (/[?&]hq/.test(location.search)) game.quality.locked = true; } catch (e) {}
  try { if (/[?&]lq/.test(location.search)) { game.quality.dprScale = 0.35; game.quality.shadows = false; key.castShadow = false; renderer.shadowMap.enabled = false; game.quality.locked = true; } } catch (e) {}
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => { resize(); });
  resize();

  let last = performance.now(), raf = 0, running = false;
  function frame(now) {
    raf = 0;
    if (document.hidden) { running = false; return; }
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
    S.camPos.lerp(S.wantPos, 1 - Math.exp(-dt * 4.5)); S.camTgt.lerp(S.wantTgt, 1 - Math.exp(-dt * 4.5));
    if (S.debugCam) { S.camPos.set(S.debugCam[0], S.debugCam[1], S.debugCam[2]); S.camTgt.set(S.debugCam[3], S.debugCam[4], S.debugCam[5]); }
    camera.position.copy(S.camPos); camera.lookAt(S.camTgt); camera.updateMatrixWorld();
    try { game.update(dt, now / 1000); } catch (e) { if (!S.errLogged) { S.errLogged = true; try { console.warn('update', e); } catch (_) {} } }
    try { renderer.render(scene, camera); game.afterRender(dt); } catch (e) { if (!S.errLogged2) { S.errLogged2 = true; try { console.warn('render', e); } catch (_) {} } }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { game.onHide(); } else { game.onShow(); start(); } });
  window.addEventListener('pageshow', () => { if (!document.hidden) start(); });
  start();
  setTimeout(() => { const b = document.getElementById('boot'); if (b) { b.classList.add('hide'); setTimeout(() => b.remove(), 900); } }, 60);
}

function fallback() {
  const b = document.getElementById('boot'); if (b) b.style.pointerEvents = 'none';
  const cv = document.getElementById('c'); if (cv) cv.style.display = 'none';
}

try { boot(); } catch (e) { try { console.warn(e); } catch (_) {} fallback(); }
