import * as THREE from '../lib/three.module.js';
import { LODGE_POS, SUN_DIR, shared } from './core/env.js';
import { Audio } from './core/audio.js';
import { Input } from './core/input.js';
import { Post } from './core/post.js';
import { CollisionWorld, FjordTerrain } from './world/terrain.js';
import { FjordWater } from './world/water.js';
import { AutumnSky } from './world/sky.js';
import { FjordProps } from './world/props.js';
import { Girl } from './chars/girl.js';
import { Seaplane } from './chars/seaplane.js';
import { AutumnAtmosphere } from './fx/atmosphere.js';
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
  // iPadOS desktop UA can omit "iPad"; some WebViews also omit maxTouchPoints.
  const safari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|Firefox|Android/i.test(ua);
  const small = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 1366;
  return appleTouch || android || coarse || (safari && (touches > 0 || small));
}

function detectQuality(params) {
  const constrained = isConstrainedClient();
  const cores = navigator.hardwareConcurrency || 4;
  // Prefer opening reliably on iPad/Safari; desktop Chrome stays high.
  let tier = constrained ? (cores >= 8 ? 'mid' : 'low') : 'high';
  if (params.get('q')) tier = params.get('q');
  const presets = {
    high: { shadow: 1024, msaa: 2, bloom: true, maxDpr: 1.5, low: false, constrained: false },
    mid: { shadow: 1024, msaa: 0, bloom: true, maxDpr: 1.25, low: false, constrained: true },
    low: { shadow: 512, msaa: 0, bloom: false, maxDpr: 1.0, low: true, constrained: true },
  };
  const preset = presets[tier] || presets.mid;
  if (constrained) preset.msaa = 0;
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
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    this.dprScale = 1.0;
    this.dpr = 1.0;
    this.time = 0;
    this.frameTimes = [];

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.15, 3200);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(shared.uFogColor.value.getHex(), shared.uFogDensity.value);
  }

  async init() {
    const r = this.renderer;
    this.input = new Input(r.domElement);
    this.audio = new Audio();
    this.post = new Post(r, { msaa: this.q.msaa, bloom: this.q.bloom });

    // Sky & procedural IBL environment
    this.sky = new AutumnSky();
    this.scene.add(this.sky.group);
    try {
      this.scene.environment = this.sky.makeEnvironment(r);
    } catch (e) {
      this.scene.environment = null;
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
    }

    // Clear autumn afternoon directional sun + sky/ground fill + soft warm bounce
    this.sun = new THREE.DirectionalLight('#ffd8a8', 2.85);
    this.sun.position.copy(SUN_DIR).multiplyScalar(75);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 180;
    const sc = 26;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fillSun = new THREE.DirectionalLight('#ffe2bd', 1.38);
    this.fillSun.position.set(32, 34, -52);
    this.scene.add(this.fillSun);

    this.hemi = new THREE.HemisphereLight('#a4c9ec', '#7a694b', 1.55);
    this.scene.add(this.hemi);

    // Terrain, collision registry, fjord water, and 1950s BC shore/canyon props
    this.collision = new CollisionWorld();
    this.terrain = new FjordTerrain({ low: this.q.low });
    this.scene.add(this.terrain.group);

    this.water = new FjordWater({ low: this.q.low });
    this.scene.add(this.water.group);

    this.props = new FjordProps(this.collision, { low: this.q.low });
    this.scene.add(this.props.group);

    // Protagonist girl & 1950s twin-float seaplane
    this.girl = new Girl();
    this.scene.add(this.girl.group);

    this.vehicle = new Seaplane();
    this.floatplane = this.vehicle;
    this.scene.add(this.vehicle.group);

    // Autumn sun shafts, water spray, speed streaks, parasol motes, guide stream
    this.fx = new AutumnAtmosphere({ low: this.q.low });
    this.scene.add(this.fx.group);

    // Director & optional ?autotest driver
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
    if (this.params.has('noveil') || this.params.has('autotest')) {
      veil.style.display = 'none';
    } else {
      setTimeout(() => {
        veil.style.opacity = '0';
        setTimeout(() => {
          veil.style.display = 'none';
        }, 600);
      }, 60);
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
    this.props.update(this.time);
    this.audio.update();
    this.sky.update(this.camera.position);

    const shadowFocus = this.director.state === 'arrive' ? LODGE_POS : this.girl.pos;
    this.sun.position.copy(shadowFocus).addScaledVector(SUN_DIR, 60);
    this.sun.target.position.copy(shadowFocus);

    this.post.render(this.scene, this.camera);
  }

  _adapt(dt) {
    const ft = this.frameTimes;
    ft.push(dt);
    if (ft.length > 60) ft.shift();
    if (this.debug && ft.length % 10 === 0) {
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      const p = this.vehicle.pos;
      document.getElementById('fps').textContent =
        `${(1 / avg).toFixed(0)} fps  dpr ${this.dpr.toFixed(2)}  ${this.q.tier}\n` +
        `${window.__moment}:${this.director.state}  v=${this.director.flightSpeed.toFixed(1)}  ` +
        `(${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)})`;
    }
    if (ft.length < 60 || this.params.has('fixed')) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    if (avg > 1 / 38 && this.dprScale > 0.65) {
      this.dprScale *= 0.88;
      this._resize();
      ft.length = 0;
    } else if (avg < 1 / 56 && this.dprScale < 1.0) {
      this.dprScale = Math.min(1.0, this.dprScale * 1.05);
      this._resize();
      ft.length = 0;
    }
  }
}
