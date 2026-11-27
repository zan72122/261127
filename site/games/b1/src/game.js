import * as THREE from '../lib/three.module.js';
import { OFFICE_POS, SUN_DIR, shared } from './core/env.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Post } from './core/post.js';
import { Sky } from './world/sky.js';
import { SnowTerrain } from './world/terrain.js';
import { AuroraSky } from './world/aurora.js';
import { WinterClouds } from './world/clouds.js';
import { WorldProps } from './world/props.js';
import { Girl } from './chars/girl.js';
import { Puppy } from './chars/puppy.js';
import { ReindeerSleigh } from './chars/reindeer.js';
import { CompanionChars } from './chars/postkeeper.js';
import { ParticleFX } from './fx/particles.js';
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
    high: { shadow: 1024, msaa: 4, bloom: true, maxDpr: 2, terrainSegs: 192, snow: 260, clouds: 48, low: false },
    mid: { shadow: 1024, msaa: 2, bloom: true, maxDpr: 1.75, terrainSegs: 160, snow: 180, clouds: 36, low: false },
    low: { shadow: 512, msaa: 0, bloom: false, maxDpr: 1.0, terrainSegs: 96, snow: 100, clouds: 20, low: true },
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
      antialias: !this.q.bloom,
      powerPreference: this.q.constrained ? 'default' : 'high-performance',
      stencil: false,
      failIfMajorPerformanceCaveat: false,
    }));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
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

    // Sky & IBL (skip expensive PMREM on low tier for fast startup & high FPS)
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    try {
      if (!this.q.low) this.scene.environment = this.sky.makeEnvironment(r);
    } catch (e) {
      this.scene.environment = null;
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
    }

    // Subtle atmospheric horizon fog matching twilight indigo
    this.scene.fog = new THREE.FogExp2(0x1f2e52, 0.0022);

    // Winter twilight key light + deep indigo sky / snow-bounce hemisphere light
    this.sun = new THREE.DirectionalLight(0xffcb8c, 2.25);
    this.sun.position.copy(SUN_DIR).multiplyScalar(55);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    const sc = 22;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x7aa0d8, 0x38496a, 1.15);
    this.scene.add(this.hemi);

    // World
    this.terrain = new SnowTerrain({ segs: this.q.terrainSegs });
    this.scene.add(this.terrain.group);

    this.props = new WorldProps({ low: this.q.low });
    this.scene.add(this.props.group);

    this.aurora = new AuroraSky();
    this.scene.add(this.aurora.group);

    this.clouds = new WinterClouds({ count: this.q.clouds });
    this.scene.add(this.clouds.group);

    // Characters & Vehicle (Gate 2 API: game.girl & game.vehicle with { group, pos })
    this.girl = new Girl();
    this.scene.add(this.girl.group);

    this.puppy = new Puppy();
    this.scene.add(this.puppy.group);

    this.vehicle = new ReindeerSleigh();
    this.sleigh = this.vehicle;
    this.scene.add(this.vehicle.group);

    this.companions = new CompanionChars();
    this.companions.registerColliders(this.props.colliders);
    this.scene.add(this.companions.group);

    this.fx = new ParticleFX({ snowCount: this.q.snow });
    this.scene.add(this.fx.group);

    // Director & optional AutoTest
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
    let dt = Math.min(0.08, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    if (this.params.has('fixed')) dt = 1 / 60;

    this._adapt(dt);
    this.time += dt;
    shared.uTime.value = this.time;

    if (this.autotest) this.autotest.frame(dt);
    this.director.update(dt);
    this.audio.update(this.director.speed, this.director.playerWorldPos().y);

    const playerPos = this.director.playerWorldPos();
    this.fx.update(dt, this.time, playerPos, OFFICE_POS, this.director.guideAlpha);

    // Keep shadow frustum anchored around player or post office
    const shadowCenter = this.director.state === 'arrive' ? OFFICE_POS : playerPos;
    this.sun.position.copy(shadowCenter).addScaledVector(SUN_DIR, 48);
    this.sun.target.position.copy(shadowCenter);

    const night = shared.uNight.value;
    this.sun.intensity = 2.25 - night * 1.1;
    this.hemi.intensity = 1.15 - night * 0.25;
    this.scene.fog.color.setRGB(0.14 - night * 0.06, 0.20 - night * 0.06, 0.34 - night * 0.12);

    this.post.render(this.scene, this.camera);
  }

  _adapt(dt) {
    const ft = this.frameTimes;
    ft.push(dt);
    if (ft.length > 60) ft.shift();
    if (this.debug && ft.length % 10 === 0) {
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      const p = this.director.playerWorldPos();
      document.getElementById('fps').textContent =
        `${(1 / avg).toFixed(0)} fps  dpr ${this.dpr.toFixed(2)}  ${this.q.tier}\n${window.__moment}:${this.director.state}/${this.director.phase} v=${this.director.speed.toFixed(1)} (${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)})`;
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
