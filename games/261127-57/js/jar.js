// Glass jar: physically-plausible thin glass (reflection-only additive + slight absorption),
// soil strata seen through the wall, glass lid with cork knob, and a condensation layer on the
// inner wall (fog + droplet beads) that the finger can wipe clear.
import * as THREE from '../lib/three.module.min.js';
import { tex, texRep } from './assets.js';
import { SUN_DIR, SUN_COLOR, contactShadow } from './room.js';
import { BASE_Y } from './moss.js';

export const JAR = { r: 0.160, ri: 0.1555, h: 0.272 };

function glassMaterial(side, strength = 1) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.025, metalness: 0, ior: 1.5, specularIntensity: 1,
    envMapIntensity: 1.15 * strength, transparent: true, side, depthWrite: false,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
      vec3 tint = vec3(0.004, 0.010, 0.009) * (0.3 + 2.0 * fres);
      gl_FragColor = vec4(outgoingLight + tint, clamp(0.02 + fres * 0.28, 0.0, 1.0));
    `);
  };
  m.customProgramCacheKey = () => 'glass' + side;
  return m;
}

export class Jar {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const { r, ri, h } = JAR;
    // glass walls
    const wallG = new THREE.CylinderGeometry(r, r, h - 0.01, 96, 1, true);
    wallG.translate(0, 0.005 + (h - 0.01) / 2, 0);
    const back = new THREE.Mesh(wallG, glassMaterial(THREE.BackSide, 0.8));
    back.renderOrder = 1;
    const front = new THREE.Mesh(wallG, glassMaterial(THREE.FrontSide));
    front.renderOrder = 8;
    this.group.add(back, front);
    // lip (rounded rim)
    const lip = new THREE.Mesh(new THREE.TorusGeometry((r + ri) / 2, (r - ri) / 2 + 0.0008, 10, 96), glassMaterial(THREE.FrontSide, 1.3));
    lip.rotation.x = Math.PI / 2; lip.position.y = h - 0.004; lip.renderOrder = 8;
    this.group.add(lip);
    // thick bottom ring (visible at the base)
    const baseG = new THREE.CylinderGeometry(r, r - 0.002, 0.008, 96, 1, true);
    baseG.translate(0, 0.004, 0);
    const base = new THREE.Mesh(baseG, glassMaterial(THREE.FrontSide, 1.5));
    base.renderOrder = 8;
    this.group.add(base);
    // soil strata just inside the glass
    const sg = new THREE.CylinderGeometry(ri - 0.0006, ri - 0.0006, BASE_Y - 0.004, 96, 1, true);
    sg.translate(0, 0.004 + (BASE_Y - 0.008) / 2, 0);
    const smat = new THREE.MeshStandardMaterial({ map: texRep('strata_c', 3, 1), normalMap: texRep('strata_n', 3, 1), roughness: 0.92 });
    const strata = new THREE.Mesh(sg, smat);
    strata.receiveShadow = true;
    this.group.add(strata);
    // dark interior cap under the moss (prevents seeing through below the bed)
    const cap = new THREE.Mesh(new THREE.CircleGeometry(ri - 0.001, 64), new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 }));
    cap.rotation.x = -Math.PI / 2; cap.position.y = BASE_Y - 0.012;
    this.group.add(cap);
    // shadow catcher: the jar casts a soft shadow + caustic-ish brighter centre is skipped; contact AO
    const ao = contactShadow(0.42, 0.42, 0.5);
    this.group.add(ao);
    // invisible shadow caster for the soil & glass (glass casts faint shadow)
    const caster = new THREE.Mesh(new THREE.CylinderGeometry(r, r, BASE_Y, 48), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    caster.position.y = BASE_Y / 2; caster.castShadow = true;
    this.group.add(caster);

    this._buildFog();
    this._buildLid();
  }

  // ---------------------------------------------------------------- condensation
  _buildFog() {
    const FW = 512, FH = 128, BW = 1024, BH = 256;
    this.fogC = document.createElement('canvas'); this.fogC.width = FW; this.fogC.height = FH;
    this.beadC = document.createElement('canvas'); this.beadC.width = BW; this.beadC.height = BH;
    this.fx = this.fogC.getContext('2d');
    this.bx = this.beadC.getContext('2d');
    this.fogT = new THREE.CanvasTexture(this.fogC);
    this.beadT = new THREE.CanvasTexture(this.beadC);
    for (const t of [this.fogT, this.beadT]) { t.wrapS = THREE.RepeatWrapping; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }
    this.fogAmt = 0; // global target
    const y0 = BASE_Y - 0.004, y1 = JAR.h - 0.006;
    this.fogY = [y0, y1];
    const g = new THREE.CylinderGeometry(JAR.ri, JAR.ri, y1 - y0, 96, 1, true);
    g.translate(0, (y0 + y1) / 2, 0);
    // CylinderGeometry u: starts at +z? we compute u from position in shader instead
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uFog: { value: this.fogT }, uBead: { value: this.beadT }, uSunDir: { value: SUN_DIR }, uSunCol: { value: SUN_COLOR },
        uY: { value: new THREE.Vector2(y0, y1) }, uTexel: { value: new THREE.Vector2(1 / BW, 1 / BH) }, uGlobal: { value: 0 },
      },
      vertexShader: `
        varying vec3 vW; varying vec3 vN;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(vec3(position.x,0.0,position.z));
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform sampler2D uFog; uniform sampler2D uBead; uniform vec3 uSunDir; uniform vec3 uSunCol;
        uniform vec2 uY; uniform vec2 uTexel; uniform float uGlobal;
        varying vec3 vW; varying vec3 vN;
        void main(){
          vec2 uv = vec2(atan(vW.z, vW.x) / 6.2831853 + 0.5, (vW.y - uY.x) / (uY.y - uY.x));
          float fog = texture2D(uFog, uv).a;
          float b = texture2D(uBead, uv).a;
          float bx = texture2D(uBead, uv + vec2(uTexel.x, 0.0)).a - texture2D(uBead, uv - vec2(uTexel.x, 0.0)).a;
          float by = texture2D(uBead, uv + vec2(0.0, uTexel.y)).a - texture2D(uBead, uv - vec2(0.0, uTexel.y)).a;
          vec3 V = normalize(cameraPosition - vW);
          vec3 N = normalize(vN);
          if (dot(N, V) < 0.0) N = -N;
          vec3 T = normalize(vec3(-vN.z, 0.0, vN.x));
          vec3 Nb = normalize(N + (T * bx + vec3(0.0, 1.0, 0.0) * by) * 6.0);
          // micro-droplet fog: forward scattering of the low sun + room light
          float fwd = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 4.0);
          vec3 fogCol = vec3(0.86, 0.88, 0.88) + uSunCol * fwd * 1.3;
          // beads: reflection of the bright window + sun glint
          vec3 Rf = reflect(-V, Nb);
          float win = smoothstep(0.6, 0.95, dot(Rf, normalize(vec3(-0.1, 0.35, -1.0))));
          float glint = pow(clamp(dot(Rf, uSunDir), 0.0, 1.0), 120.0) * 8.0;
          float edge = clamp(length(vec2(bx, by)) * 8.0, 0.0, 1.0);
          vec3 beadCol = vec3(0.10, 0.12, 0.11) * edge + vec3(1.2, 1.2, 1.15) * win * 0.8 + uSunCol * glint;
          float fa = fog * 0.88;
          float ba = smoothstep(0.05, 0.4, b) * (0.18 + 0.6 * edge + win * 0.5 + glint);
          vec3 col = mix(fogCol, beadCol, clamp(ba, 0.0, 1.0));
          float a = clamp(fa * (1.0 - 0.6 * smoothstep(0.05, 0.4, b)) + ba, 0.0, 0.95);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 6;
    m.frustumCulled = false;
    this.fogMesh = m;
    this.fogMat = mat;
    this.group.add(m);
    this.fogDirty = false;
    this.wiped = 0;
  }

  // fog gradually forms (called while lid closed)
  formFog(dt) {
    const fx = this.fx, bx = this.bx;
    const FW = this.fogC.width, FH = this.fogC.height, BW = this.beadC.width, BH = this.beadC.height;
    this.fogAmt = Math.min(1, this.fogAmt + dt * 0.3);
    // fog grows from the top (warmer air condenses on cooler glass), patchy
    fx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * FW, y = Math.random() * FH * (0.3 + 0.7 * this.fogAmt);
      const r = 6 + Math.random() * 18;
      const g = fx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      fx.fillStyle = g;
      fx.fillRect(x - r, y - r, r * 2, r * 2);
      if (x < r) fx.fillRect(x - r + FW, y - r, r * 2, r * 2);
    }
    // beads grow
    bx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40 * this.fogAmt; i++) this._bead(Math.random() * BW, Math.random() * BH * (0.2 + 0.8 * this.fogAmt), 0.6 + Math.random() ** 3 * 2.4);
    // occasional drip running down, leaving a clear trail
    if (this.fogAmt > 0.6 && Math.random() < dt * 0.8) this._drip(Math.random() * BW);
    this.fogDirty = true;
  }

  _bead(x, y, r) {
    const bx = this.bx;
    const g = bx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    bx.fillStyle = g;
    bx.beginPath(); bx.ellipse(x, y, r, r * 1.05, 0, 0, Math.PI * 2); bx.fill();
  }

  _drip(xb) {
    const BW = this.beadC.width, BH = this.beadC.height, FW = this.fogC.width, FH = this.fogC.height;
    const y0 = Math.random() * BH * 0.3;
    const len = BH * (0.3 + Math.random() * 0.5);
    const xf = xb / BW * FW;
    this.fx.globalCompositeOperation = 'destination-out';
    this.fx.strokeStyle = 'rgba(0,0,0,0.85)'; this.fx.lineWidth = 2.2;
    this.fx.beginPath();
    let x = xf; this.fx.moveTo(x, y0 / BH * FH);
    for (let y = y0; y < y0 + len; y += 6) { x += (Math.random() - 0.5) * 0.8; this.fx.lineTo(x, y / BH * FH); }
    this.fx.stroke();
    this.bx.globalCompositeOperation = 'destination-out';
    this.bx.strokeStyle = 'rgba(0,0,0,1)'; this.bx.lineWidth = 3;
    this.bx.beginPath(); this.bx.moveTo(xb, y0); this.bx.lineTo(xb, y0 + len); this.bx.stroke();
    this.bx.globalCompositeOperation = 'source-over';
    this._bead(xb, y0 + len, 3.2);
    for (let y = y0; y < y0 + len; y += 9 + Math.random() * 10) this._bead(xb + (Math.random() - 0.5) * 2, y, 0.9 + Math.random());
  }

  // finger wipe from uv a to uv b (u 0..1 around, v 0..1 up)
  wipe(a, b) {
    const FW = this.fogC.width, FH = this.fogC.height, BW = this.beadC.width, BH = this.beadC.height;
    const fx = this.fx, bx = this.bx;
    let du = b.x - a.x; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
    const ax = a.x * FW, ay = a.y * FH, bxp = (a.x + du) * FW, by = b.y * FH;
    fx.globalCompositeOperation = 'destination-out';
    fx.lineCap = 'round';
    fx.strokeStyle = 'rgba(0,0,0,0.95)'; fx.lineWidth = 7;
    fx.beginPath(); fx.moveTo(ax, ay); fx.lineTo(bxp, by); fx.stroke();
    fx.strokeStyle = 'rgba(0,0,0,0.5)'; fx.lineWidth = 10;
    fx.beginPath(); fx.moveTo(ax, ay); fx.lineTo(bxp, by); fx.stroke();
    // beads swept away inside the stroke, pushed into a rim of bigger beads along both edges
    const s = BW / FW;
    bx.globalCompositeOperation = 'destination-out';
    bx.lineCap = 'round'; bx.strokeStyle = 'rgba(0,0,0,1)'; bx.lineWidth = 9 * s;
    bx.beginPath(); bx.moveTo(ax * s, ay * s); bx.lineTo(bxp * s, by * s); bx.stroke();
    bx.globalCompositeOperation = 'source-over';
    const len = Math.hypot(bxp - ax, by - ay) * s;
    const nx = -(by - ay) * s / (len + 1e-6), ny = (bxp - ax) * s / (len + 1e-6);
    for (let d = 0; d < len; d += 2.5 + Math.random() * 2) {
      const t = d / len;
      const px = (ax + (bxp - ax) * t) * s, py = (ay + (by - ay) * t) * s;
      for (const sd of [-1, 1]) {
        const off = 5.2 * s + Math.random() * 1.5;
        if (Math.random() < 0.75) this._bead(px + nx * off * sd, py + ny * off * sd, 0.9 + Math.random() * 1.6);
      }
    }
    if (Math.random() < 0.15) {
      // a heavy bead at the stroke end runs down
      this._drip(bxp * s);
    }
    this.wiped += Math.hypot(du, b.y - a.y);
    this.fogDirty = true;
  }

  clearFog(dt) {
    // fog slowly evaporates (lid open, sun warms), beads mostly remain as tiny droplets
    this.fx.globalCompositeOperation = 'destination-out';
    this.fx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.5)})`;
    this.fx.fillRect(0, 0, this.fogC.width, this.fogC.height);
    this.bx.globalCompositeOperation = 'destination-out';
    this.bx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.12)})`;
    this.bx.fillRect(0, 0, this.beadC.width, this.beadC.height);
    this.fogAmt = Math.max(0, this.fogAmt - dt * 0.5);
    this.fogDirty = true;
  }

  // a mist particle hit the glass
  mistHit(p) {
    const u = Math.atan2(p.z, p.x) / (Math.PI * 2) + 0.5;
    const v = (p.y - this.fogY[0]) / (this.fogY[1] - this.fogY[0]);
    if (v < 0 || v > 1) return;
    this._bead(u * this.beadC.width, (1 - v) * this.beadC.height, 0.5 + Math.random() * 1.0);
    this.fogDirty = true;
  }

  update() {
    if (this.fogDirty) { this.fogT.needsUpdate = true; this.beadT.needsUpdate = true; this.fogDirty = false; }
  }

  // ray vs outer cylinder (front-most hit within the fog band) -> uv
  raycastGlass(ray) {
    const o = ray.origin, d = ray.direction, r = JAR.r;
    const a = d.x * d.x + d.z * d.z, b = 2 * (o.x * d.x + o.z * d.z), c = o.x * o.x + o.z * o.z - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0) return null;
    const p = o.clone().addScaledVector(d, t);
    if (p.y < this.fogY[0] || p.y > this.fogY[1]) return null;
    return { point: p, uv: new THREE.Vector2(Math.atan2(p.z, p.x) / (Math.PI * 2) + 0.5, 1 - (p.y - this.fogY[0]) / (this.fogY[1] - this.fogY[0])) };
  }

  // ---------------------------------------------------------------- lid
  _buildLid() {
    const lid = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(JAR.r + 0.006, JAR.r + 0.006, 0.009, 96), glassMaterial(THREE.FrontSide, 1.2));
    disc.renderOrder = 9;
    lid.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(JAR.r + 0.006, 0.0045, 8, 96), glassMaterial(THREE.FrontSide, 1.4));
    ring.rotation.x = Math.PI / 2; ring.renderOrder = 9;
    lid.add(ring);
    const corkMat = new THREE.MeshStandardMaterial({ map: tex('cork_c'), normalMap: tex('cork_n'), roughness: 0.9 });
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.026, 32), corkMat);
    knob.position.y = 0.017; knob.castShadow = true;
    lid.add(knob);
    const knobTop = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), corkMat);
    knobTop.scale.y = 0.25; knobTop.position.y = 0.030;
    lid.add(knobTop);
    this.lid = lid;
    this.lidHome = new THREE.Vector3(-0.36, 0.0045, -0.20);
    lid.position.copy(this.lidHome);
    this.lidShadow = contactShadow(0.40, 0.40, 0.35);
    this.lidShadow.position.set(this.lidHome.x, 0.0006, this.lidHome.z);
    this.group.parent.add(this.lidShadow);
    this.group.parent.add(lid);
    this.lidState = 0; // 0 table,1 closed
    this.lidAnim = null;
  }

  closeLid(onDone) {
    this.lidAnim = { t: 0, from: this.lid.position.clone(), to: new THREE.Vector3(0, JAR.h + 0.0045, 0), dur: 1.3, onDone, close: true };
  }
  openLid(onDone) {
    this.lidAnim = { t: 0, from: this.lid.position.clone(), to: this.lidHome.clone(), dur: 1.3, onDone, close: false };
  }
  animate(dt) {
    const a = this.lidAnim;
    if (!a) return;
    a.t += dt / a.dur;
    const t = Math.min(1, a.t);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    this.lid.position.lerpVectors(a.from, a.to, e);
    this.lid.position.y += Math.sin(t * Math.PI) * 0.12;
    this.lid.rotation.z = Math.sin(t * Math.PI) * (a.close ? 0.25 : -0.25);
    this.lidShadow.material.opacity = 0.35 * (a.close ? 1 - e : e);
    if (t >= 1) { this.lidAnim = null; this.lidState = a.close ? 1 : 0; a.onDone && a.onDone(); }
  }
}
