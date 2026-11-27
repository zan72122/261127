import * as THREE from '../lib/three.module.js';
import { SUN_DIR, shared } from './core/env.js';
import { clamp } from './core/math.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Post } from './core/post.js';
import { Sky } from './world/sky.js';
import { ColliderWorld, DesertTerrain } from './world/terrain.js';
import { VillageWorld } from './world/village.js';
import { ObservatorySanctuary } from './world/observatory.js';
import { Girl } from './chars/girl.js';
import { Goat } from './chars/goat.js';
import { Carpet } from './chars/carpet.js';
import { DesertClouds, GuideStream, MagicTrail, WindStreaks } from './fx/particles.js';
import { Director } from './story/director.js';

function isConstrainedClient() {
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  const touches = navigator.maxTouchPoints || 0;
  const appleTouch = /iPhone|iPad|iPod/i.test(ua)
    || ((/Mac/i.test(ua) || /Mac/i.test(plat)) && touches > 1);
  const android = /Android/i.test(ua);
  let coarse = false;
  try {
    coarse = !!(window.matchMedia
      && (window.matchMedia('(pointer: coarse)').matches
        || window.matchMedia('(hover: none)').matches));
  } catch (e) { /* ignore */ }
  const safari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|Firefox|Android/i.test(ua);
  const small = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 1366;
  return appleTouch || android || coarse || (safari && (touches > 0 || small));
}

function detectQuality(params) {
  const constrained = isConstrainedClient();
  const cores = navigator.hardwareConcurrency || 4;
  let tier = constrained ? (cores >= 8 ? 'mid' : 'low') : 'high';
  if (params.get('q')) tier = params.get('q');

  const Q = {
    high: { shadow: 1024, msaa: 4, bloom: true, maxDpr: 2.0, segs: 128, streaks: 150, trails: 240, clouds: 26, low: false },
    mid: { shadow: 1024, msaa: 2, bloom: true, maxDpr: 1.6, segs: 96, streaks: 100, trails: 180, clouds: 18, low: false },
    low: { shadow: 512, msaa: 0, bloom: false, maxDpr: 1.0, segs: 64, streaks: 56, trails: 100, clouds: 10, low: true },
  };
  const preset = { ...(Q[tier] || Q.mid) };
  if (constrained && 'msaa' in preset) preset.msaa = 0;
  return { tier, constrained, ...preset };
}

export class Game {
  constructor(params) {
    this.params = params;
    this.debug = params.has('debug');
    this.q = detectQuality(params);

    const canvas = document.getElementById('c');
    const renderer = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: this.q.constrained ? 'default' : 'high-performance',
      stencil: false,
      failIfMajorPerformanceCaveat: false,
    }));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    this.dprScale = 1;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.dpr = 1;
    this.time = 0;
    this.frameTimes = [];

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3200);
    this.scene = new THREE.Scene();
  }

  async init() {
    const r = this.renderer;
    this.input = new Input(r.domElement);
    this.audio = new Audio();
    this.post = new Post(r, { msaa: this.q.msaa, bloom: this.q.bloom });

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    try {
      this.scene.environment = this.sky.makeEnvironment(r);
    } catch (e) {
      this.scene.environment = null;
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
    }

    // Warm desert sunset directional key + sky/sand hemisphere fill
    this.sun = new THREE.DirectionalLight('#f7c08a', 2.4);
    this.sun.position.copy(SUN_DIR).multiplyScalar(60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    const sc = 18;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight('#6f85b8', '#a67b56', 1.15);
    this.scene.add(this.hemi);

    // Terrain, Colliders, Village, Oasis, Observatory
    this.colliders = new ColliderWorld();
    this.terrain = new DesertTerrain({ segs: this.q.segs, low: this.q.low });
    this.scene.add(this.terrain.group);

    this.village = new VillageWorld(this.colliders, { low: this.q.low });
    this.scene.add(this.village.group);

    this.observatory = new ObservatorySanctuary(this.colliders, { low: this.q.low });
    this.scene.add(this.observatory.group);

    this.clouds = new DesertClouds(this.q.clouds);
    this.scene.add(this.clouds.group);

    // Protagonist, Goat Guide, Flying Carpet Vehicle
    this.girl = new Girl();
    this.scene.add(this.girl.group);

    this.goat = new Goat();
    this.scene.add(this.goat.group);

    this.carpet = new Carpet();
    this.vehicle = this.carpet;
    this.scene.add(this.carpet.group);

    // Non-solid FX layers
    this.trail = new MagicTrail(this.q.trails);
    this.scene.add(this.trail.points);

    this.streaks = new WindStreaks(this.q.streaks);
    this.scene.add(this.streaks.points);

    this.guideStream = new GuideStream(this.q.low ? 22 : 40);
    this.scene.add(this.guideStream.points);

    // Director & QA Hooks
    this.director = new Director(this);
    window.__qa = {
      getState: () => this.director.getQAState(),
    };

    if (this.params.has('autotest')) {
      const { AutoTest } = await import('./story/autotest.js');
      this.autotest = new AutoTest(this);
    }

    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));

    if (this.debug) document.getElementById('fps').style.display = 'block';

    const startState = this.params.get('scene') || 'garden';
    this.director.go(startState);
    this.director.update(1 / 60);

    try {
      r.compile(this.scene, this.camera);
    } catch (e) {
      (window.__errors || (window.__errors = [])).push('compile:' + (e && (e.message || e)));
    }
    this.last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    const veil = document.getElementById('veil');
    if (this.params.has('noveil')) {
      veil.style.display = 'none';
    } else {
      setTimeout(() => {
        veil.style.opacity = 0;
        setTimeout(() => {
          veil.style.display = 'none';
        }, 1400);
      }, 100);
    }

    window.__ready = true;
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.maxDpr) * this.dprScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.post.setSize(Math.round(w * dpr), Math.round(h * dpr));
    this.vw = w;
    this.vh = h;
    this.dpr = dpr;
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    let dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    if (this.params.has('fixed')) dt = 1 / 60;

    this._adapt(dt);
    this.time += dt;
    shared.uTime.value = this.time;

    if (this.autotest) this.autotest.frame(dt);
    this.director.update(dt);
    this.sky.update(shared.uNightMix.value, shared.uAltitude.value, this.time);
    this.village.update(this.time);
    this.observatory.update(this.time);
    this.clouds.update(shared.uNightMix.value);

    const pPos = this.director.playerWorldPos();
    this.trail.update(dt, this.dpr);
    this.streaks.update(dt, this.camera.position, this.carpet.forwardDir(), this.carpet.speed, this.dpr);
    this.guideStream.update(dt, pPos, this.observatory.landingSpot, this.director.guideAlpha, this.dpr);

    // Keep shadow frustum centered near active actor
    this.sun.position.copy(pPos).addScaledVector(SUN_DIR, 48);
    this.sun.target.position.copy(pPos);

    // Shift sun key smoothly from warm dusk gold toward cool starlit moonlight (keeps dunes sculptural)
    const nm = clamp(shared.uNightMix.value, 0, 1);
    this.sun.intensity = 2.45 - nm * 1.05;
    this.sun.color.setRGB(1.0 - nm * 0.36, 0.77 - nm * 0.02, 0.54 + nm * 0.44);
    this.hemi.intensity = 1.15 - nm * 0.25;
    this.hemi.color.setRGB(0.44 - nm * 0.14, 0.52 - nm * 0.08, 0.72 + nm * 0.18);

    this.post.render(this.scene, this.camera);
  }

  _adapt(dt) {
    const ft = this.frameTimes;
    ft.push(dt);
    if (ft.length > 60) ft.shift();
    if (this.debug && ft.length % 10 === 0) {
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      const qa = this.director.getQAState();
      document.getElementById('fps').textContent =
        `${(1 / avg).toFixed(0)} fps  dpr ${this.dpr.toFixed(2)}  ${this.q.tier}\n${qa.moment}:${qa.state}  v=${qa.speed.toFixed(1)}  (${qa.girl.x.toFixed(0)},${qa.alt.toFixed(1)},${qa.girl.z.toFixed(0)}) idle=${qa.idleSeconds.toFixed(1)}`;
    }
    if (ft.length < 60 || this.params.has('fixed')) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    if (avg > 1 / 40 && this.dprScale > 0.65) {
      this.dprScale *= 0.88;
      this._resize();
      ft.length = 0;
    } else if (avg < 1 / 58 && this.dprScale < 1) {
      this.dprScale = Math.min(1, this.dprScale * 1.05);
      this._resize();
      ft.length = 0;
    }
  }
}
