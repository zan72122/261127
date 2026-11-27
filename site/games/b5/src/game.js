import * as THREE from '../lib/three.module.js';
import { COVE_POS, SUN_DIR, shared } from './core/env.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { ColliderRegistry } from './core/colliders.js';
import { Sky } from './world/sky.js';
import { LagoonTerrain } from './world/terrain.js';
import { Village } from './world/village.js';
import { ReefAndCove } from './world/reef.js';
import { Girl } from './chars/girl.js';
import { Whale } from './chars/whale.js';
import { GuideStream, ParticleFX } from './fx/particles.js';
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
    high: { shadow: 1024, maxDpr: 2, terrainSegs: 160, particles: 180, low: false },
    mid: { shadow: 1024, maxDpr: 1.5, terrainSegs: 120, particles: 130, low: false },
    low: { shadow: 512, maxDpr: 1.0, terrainSegs: 72, particles: 72, low: true },
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
      antialias: !this.q.low,
      powerPreference: this.q.constrained ? 'default' : 'high-performance',
      stencil: false,
      failIfMajorPerformanceCaveat: false,
    }));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = !this.q.low;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    this.dprScale = 1;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.dpr = 1;
    this.time = 0;
    this.frameTimes = [];

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.15, 2800);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#e4c0a3', 0.0019);
  }

  async init() {
    const r = this.renderer;
    this.input = new Input(r.domElement);
    this.audio = new Audio();
    this.colliders = new ColliderRegistry();

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    try {
      this.scene.environment = this.sky.makeEnvironment(r);
    } catch (e) {
      this.scene.environment = null;
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
    }

    // Warm early-summer dusk sun & cool emerald-sky hemisphere fill
    this.sun = new THREE.DirectionalLight('#ffcf96', 2.55);
    this.sun.position.copy(SUN_DIR).multiplyScalar(70);
    this.sun.castShadow = !this.q.low;
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    const sc = 22;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight('#8cb8c4', '#4b6647', 1.15);
    this.scene.add(this.hemi);

    this.terrain = new LagoonTerrain({ segs: this.q.terrainSegs, low: this.q.low });
    this.scene.add(this.terrain.group);

    this.village = new Village(this.colliders, { low: this.q.low });
    this.scene.add(this.village.group);

    this.reef = new ReefAndCove(this.colliders, { low: this.q.low });
    this.scene.add(this.reef.group);

    this.girl = new Girl();
    this.scene.add(this.girl.group);

    this.whale = new Whale();
    this.vehicle = this.whale;
    this.scene.add(this.whale.group);

    this.fx = new ParticleFX(this.q.particles);
    this.scene.add(this.fx.points);

    this.guideStream = new GuideStream(this.q.low ? 22 : 36);
    this.scene.add(this.guideStream.points);

    this.director = new Director(this);
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
      }, 120);
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
    this.village.update(this.time);
    this.reef.update(this.time);
    this.fx.update(dt);

    const p = this.director.state === 'ride' ? this.whale.pos : this.girl.pos;
    this.guideStream.update(dt, p, COVE_POS, this.director.guideAlpha);
    this.audio.update(this.whale.speed, p.y);

    if (!this.q.low) {
      this.sun.position.copy(p).addScaledVector(SUN_DIR, 55);
      this.sun.target.position.copy(p);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _adapt(dt) {
    const ft = this.frameTimes;
    ft.push(dt);
    if (ft.length > 60) ft.shift();
    if (this.debug && ft.length % 10 === 0) {
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      const p = this.girl.pos;
      document.getElementById('fps').textContent =
        `${(1 / avg).toFixed(0)} fps  dpr ${this.dpr.toFixed(2)}  ${this.q.tier}\n${window.__moment}:${this.director.state}  v=${this.whale.speed.toFixed(1)}  (${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)})`;
    }
    if (ft.length < 60 || this.params.has('fixed')) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    if (avg > 1 / 42 && this.dprScale > 0.6) {
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
