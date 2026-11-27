import * as THREE from '../lib/three.module.js';
import { GOAL_POS, SUN_DIR, shared } from './core/env.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Post } from './core/post.js';
import { Sky } from './world/sky.js';
import { SatoyamaTerrain } from './world/terrain.js';
import { MirrorWater } from './world/water.js';
import { HomeGarden } from './world/home.js';
import { ValleyLandmarks } from './world/landmarks.js';
import { SummerClouds } from './world/clouds.js';
import { Girl } from './chars/girl.js';
import { PaperPlane } from './chars/paperPlane.js';
import {
  FloatCanopy,
  GuideStream,
  LandingRing,
  ThermalRings,
  WindStreaks,
  createThermalWaypoints,
} from './fx/wind.js';
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
    high: { shadow: 1024, msaa: 4, bloom: true, maxDpr: 2, streaks: 140, puffs: 320, puffScale: 1.05, terrainSegs: 132, grass: 1100, low: false, highWater: true },
    mid: { shadow: 1024, msaa: 2, bloom: true, maxDpr: 1.5, streaks: 100, puffs: 240, puffScale: 0.9, terrainSegs: 108, grass: 800, low: false, highWater: false },
    low: { shadow: 512, msaa: 0, bloom: false, maxDpr: 1.0, streaks: 60, puffs: 150, puffScale: 0.62, terrainSegs: 76, grass: 420, low: true, highWater: false },
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
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    this.dprScale = 1;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.dpr = 1;
    this.time = 0;
    this.frameTimes = [];

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.15, 4800);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#c9e0ef', 0.0014);
  }

  async init() {
    const r = this.renderer;
    this.input = new Input(r.domElement);
    this.audio = new Audio();
    this.post = new Post(r, { msaa: this.q.msaa, bloom: this.q.bloom });

    // Sky & environment lighting
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    try {
      this.scene.environment = this.sky.makeEnvironment(r);
    } catch (e) {
      this.scene.environment = null;
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
    }

    // Late-afternoon oblique sun + clear sky/meadow fill
    this.sun = new THREE.DirectionalLight('#fff0d2', 2.75);
    this.sun.position.copy(SUN_DIR).multiplyScalar(65);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 150;
    const sc = 19;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight('#8ec2ea', '#5c8442', 1.15);
    this.scene.add(this.hemi);

    // World: Satoyama valley, mirror water, home garden, landmarks, towering summer clouds
    this.terrain = new SatoyamaTerrain({ segs: this.q.terrainSegs, low: this.q.low });
    this.scene.add(this.terrain.group);

    this.water = new MirrorWater({ low: this.q.low, high: this.q.highWater });
    this.scene.add(this.water.group);

    this.home = new HomeGarden({ grassCount: this.q.grass });
    this.scene.add(this.home.group);

    this.landmarks = new ValleyLandmarks({ low: this.q.low });
    this.scene.add(this.landmarks.group);

    this.clouds = new SummerClouds({ maxPuffs: this.q.puffs, puffScale: this.q.puffScale });
    this.scene.add(this.clouds.group);

    // Characters & hero vehicle
    this.girl = new Girl();
    this.scene.add(this.girl.group);

    this.plane = new PaperPlane();
    this.vehicle = this.plane;
    this.scene.add(this.plane.group);

    // Atmospheric & thermal FX
    this.thermalRings = new ThermalRings(createThermalWaypoints());
    this.scene.add(this.thermalRings.group);

    this.windStreaks = new WindStreaks(this.q.streaks);
    this.scene.add(this.windStreaks.lines);

    this.guideStream = new GuideStream(this.q.low ? 24 : 44);
    this.scene.add(this.guideStream.points);

    this.floatCanopy = new FloatCanopy();
    this.scene.add(this.floatCanopy.group);

    this.landingRing = new LandingRing();
    this.scene.add(this.landingRing.mesh);

    // Director & AutoTest
    this.director = new Director(this);
    if (this.params.has('autotest')) {
      const { AutoTest } = await import('./story/autotest.js');
      this.autotest = new AutoTest(this);
    }

    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));

    if (this.debug) document.getElementById('fps').style.display = 'block';

    this.director.go(this.params.get('scene') || 'garden');
    this.director.update(1 / 60);
    this.clouds.update(this.camera);

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
    const maxDt = this.autotest ? 0.08 : 0.05;
    let dt = Math.min(maxDt, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    if (this.params.has('fixed')) dt = 1 / 60;

    this._adapt(dt);
    this.time += dt;
    shared.uTime.value = this.time;

    if (this.autotest) this.autotest.frame(dt);
    this.director.update(dt);
    this.audio.update();

    this.home.update(this.time);
    this.landmarks.update(dt, this.time);
    this.thermalRings.update(dt, this.time);

    const pPos = this.director.playerWorldPos();
    this.guideStream.update(dt, pPos, GOAL_POS, this.director.guideAlpha);
    this.windStreaks.update(
      dt,
      this.camera.position,
      this.plane.forwardDir(),
      this.director.state === 'ride' ? this.director.flightSpeed : 0
    );
    this.clouds.update(this.camera);

    const shadowFocus = this.director.state === 'arrive' ? GOAL_POS : this.girl.pos;
    this.sun.position.copy(shadowFocus).addScaledVector(SUN_DIR, 48);
    this.sun.target.position.copy(shadowFocus);

    // Render mirror reflection onto flooded rice paddies when high/mid tier
    this.water.renderReflection(this.renderer, this.scene, this.camera, pPos);
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
        `${(1 / avg).toFixed(0)} fps  dpr ${this.dpr.toFixed(2)}  ${this.q.tier}\n${window.__moment}:${this.director.state}  v=${this.director.flightSpeed.toFixed(1)}  (${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)})`;
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
