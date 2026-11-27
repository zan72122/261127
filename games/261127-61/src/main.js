// Entry: renderer, loop, input wiring, resize/rotation, visibility, adaptive quality.
import * as THREE from 'three';
import { inflateSync } from 'fflate';
import { decodeGiraffe } from './meshdata.js';
import { Giraffe } from './giraffe.js';
import { buildPoses } from './poses.js';
import { Actor } from './actor.js';
import { buildWorld } from './world.js';
import { Game } from './game.js';
import { Sound } from './audio.js';
import { makeHand } from './hand.js';
import { makeParticles } from './particles.js';
import { makeStore } from './store.js';

function b64(s) { const bin = atob(s.replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

function boot() {
  const canvas = document.getElementById('c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (e) { document.body.style.background = '#c98a4a'; return; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const weak = cores <= 2 || mem <= 2;
  const quality = { shadow: weak ? 1024 : 2048, grass: weak ? 0.55 : 1, dprMax: 2, dprScale: 1 };

  const data = decodeGiraffe(inflateSync(b64(document.getElementById('gdata').textContent)));
  const W = buildWorld(quality);
  const gMain = new Giraffe(data, { seed: new THREE.Vector3(1.3, 2.1, 0.7), tint: new THREE.Vector3(1, 1, 1), hairSeed: 7 });
  const data2 = decodeGiraffe(inflateSync(b64(document.getElementById('gdata2').textContent)));
  const gBg = new Giraffe(data2, { seed: new THREE.Vector3(4.7, 0.3, 2.9), tint: new THREE.Vector3(0.9, 0.93, 1.0), hairSeed: 13 });
  const poses = buildPoses(gMain);
  const main = new Actor(gMain, poses), bg = new Actor(gBg, poses);
  W.scene.add(gMain.group, gBg.group);
  const particles = makeParticles(); W.scene.add(particles.points);
  main.onPrint = (x, z, h, fore) => { W.prints.add(x, z, Math.atan2(-Math.sin(h), Math.cos(h)), fore ? 0.27 : 0.25, 1); W.press.stamp(x, z, 0.1, 0.5); };
  bg.onPrint = (x, z, h) => { W.prints.add(x, z, Math.atan2(-Math.sin(h), Math.cos(h)), 0.26, 0.8); };
  const sound = new Sound();
  main.onStep = (fore) => sound.hoof(fore);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 1500);
  const dom = { w: 1, h: 1, safe: { l: 0, r: 0, t: 0, b: 0 }, safeTop: 0 };
  const hand = makeHand(document.body);
  const store = makeStore();
  const game = new Game({ renderer, camera, W, main, bg, sound, store, hand, dom, particles });

  // --- resize / rotation -------------------------------------------------------------------------
  const sa = document.getElementById('sa');
  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    dom.w = w; dom.h = h;
    const dpr = Math.min(quality.dprMax, window.devicePixelRatio || 1) * quality.dprScale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h;
    game.baseFov = THREE.MathUtils.clamp(2 * Math.atan(Math.tan(19 * Math.PI / 180) / camera.aspect) * 180 / Math.PI, 50, 72);
    camera.fov = game.baseFov;
    camera.updateProjectionMatrix();
    try {
      const cs = getComputedStyle(sa);
      dom.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
      dom.safeTop = dom.safe.t;
    } catch (e) { /* ignore */ }
    particles.mat.uniforms.uScale.value = h * dpr * 0.9;
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  // --- input (one finger; extra fingers are ignored) ------------------------------------------------
  const opt = { passive: false };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } game.pointerDown(e.pointerId, e.clientX, e.clientY); }, opt);
  canvas.addEventListener('pointermove', (e) => { e.preventDefault(); game.pointerMove(e.pointerId, e.clientX, e.clientY); }, opt);
  const up = (e) => { game.pointerUp(e.pointerId); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, opt);

  // --- loop -------------------------------------------------------------------------------------------
  let raf = 0, last = performance.now(), frames = 0, acc = 0, slowSecs = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
    const steps = Math.max(1, Math.round(game.timeScale || 1));
    for (let i = 0; i < steps; i++) game.update(dt);
    renderer.render(W.scene, camera);
    // adaptive quality: lower resolution then grass density when frames are slow
    frames++; acc += dt;
    if (acc > 1.2) {
      const avg = acc / frames; frames = 0; acc = 0;
      if (avg > 0.024) slowSecs++; else slowSecs = 0;
      if (slowSecs >= 2) {
        slowSecs = 0;
        if (quality.dprScale > 0.7) { quality.dprScale -= 0.15; resize(); }
        else if (W.midMesh.geometry.instanceCount > W.midMesh.userData.full * 0.4) { W.midMesh.geometry.instanceCount = Math.floor(W.midMesh.geometry.instanceCount * 0.7); W.meadowMesh.geometry.instanceCount = Math.floor(W.meadowMesh.geometry.instanceCount * 0.75); }
      }
      game.perf = { avgMs: +(avg * 1000).toFixed(1), dprScale: quality.dprScale };
    }
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); sound.suspend(); game.pointerUp(game.drag ? game.drag.id : -1); }
    else { start(); sound.resume(); }
  });
  window.addEventListener('pagehide', () => { stop(); sound.suspend(); });
  window.addEventListener('pageshow', () => { if (!document.hidden) start(); });
  // first frame immediately (no menu)
  game.update(0.016); renderer.render(W.scene, camera);
  start();
  document.getElementById('boot').style.opacity = '0';
  setTimeout(() => { const b = document.getElementById('boot'); if (b) b.remove(); }, 700);

  // test hook (read-only state for automated checks)
  window.__gf61 = {
    state: () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, cam: [+game.camYaw.toFixed(1), +game.camPitch.toFixed(1), +camera.fov.toFixed(1)], look: game.lookPt.toArray().map(v=>+v.toFixed(2)), mpos: main.pos.toArray().map(v=>+v.toFixed(2)), phase: game.phase, sunEl: game.sunEl, sunAz: game.sunAz, moonEl: game.moonEl, phi: game.phi, main: game.mainState, posture: main.posture, bg: game.bgState, invite: game.invite && game.invite.kind, disc: { ...game.disc }, store: store.status, saved: store.saved, perf: game.perf, cycle: game.cycle }),
    sunScreen: () => { const s = game.skyScreen(game.sunEl, game.sunAz); return { x: s.x, y: s.y }; },
    moonScreen: () => { const s = game.skyScreen(game.moonEl, game.moonAz); return { x: s.x, y: s.y }; },
    tuftScreen: (which) => { const t = which === 'invite' && game.invite && game.invite.tuft ? game.invite.tuft : game.peekTuft(game.station()); if (!t) return null; const s = game.screenOf(new THREE.Vector3(t.x, t.h * 0.55, t.z)); return { x: s.x, y: s.y }; },
    shadowProbe: () => { const k = W.key; return { dir: k.position.clone().sub(k.target.position).normalize().toArray() }; },
    log: () => game.log.slice(),
    speed: (k) => { game.timeScale = k; },
    // test helper: jump straight to a moment of the cycle (used only by automated checks)
    jump: (name) => game.debugJump(name),
    phi: (p) => game.setPhi(p),
    pressStats: () => { const d = W.press.cx.getImageData(0, 0, W.press.cv.width, W.press.cv.height).data; let n = 0, mx = 0, sum = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 20) n++; mx = Math.max(mx, d[i]); sum += d[i]; } return { n, mx, sum, prints: W.prints.count() }; },
    inviteInfo: () => { const v = game.invite; if (!v) return null; let p = null; if (v.tuft) { const s = game.screenOf(new THREE.Vector3(v.tuft.x, v.tuft.h * 0.55, v.tuft.z)); p = { x: s.x, y: s.y }; } return { kind: v.kind, dir: v.dir || 0, short: !!v.short, peek: !!(v.tuft && v.tuft.peek), p }; },
    ears: () => ({ main: [main.earL.ty, main.earR.ty, main.look.tw], mainState: game.mainState }),
    hint: () => ({ invite: game.invite && game.invite.kind, hand: hand.visible, handOpacity: +(document.querySelector('div[style*="z-index:3"]') || { style: { opacity: 0 } }).style.opacity, glow: +W.sky.uni.uGlow.value.toFixed(2) }),
    audio: () => ({ ok: sound.ok, state: sound.ctx ? sound.ctx.state : 'none' }),
    t: () => game.t,
    canvas: () => ({ w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight }),
    freeze: (on) => { game.frozen = !!on; return game.frozen; },
    step: (n, dt) => { for (let i = 0; i < n; i++) game.update(dt || 1 / 30); return game.phase; },
  };
}

try { boot(); } catch (e) { console.warn('boot failed', e); }
