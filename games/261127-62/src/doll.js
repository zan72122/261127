// Vinyl toy doll: rig, face (painted canvas + 3D sleep eyes), resin hair, fabric dress.
import * as THREE from 'three';
import { M, TX } from './mats.js';
import { ell, xf, lathe, merge, taperTube, curve, cyl, planarUV } from './geo.js';
import * as T from './tex.js';
import { mergeGeometries as _mergeG } from 'three/addons/utils/BufferGeometryUtils.js';

export const SPECS = {
  mimi: { skin: '#ffe3d3', dress: '#f5a9bd', trim: '#ffffff', hair: '#8b5a3c', style: 'puffs', eye: '#6b3b22', shoe: '#f27f9c', note: 0, accent: '#f58aa6' },
  koko: { skin: '#ffe6d6', dress: '#f6ead2', trim: '#ffffff', hair: '#d9a25e', style: 'wavy', eye: '#5b6e3a', shoe: '#c98a4e', note: 2, accent: '#e7b45e' },
  hana: { skin: '#f9dcc8', dress: '#b9e0f0', trim: '#ffffff', hair: '#4a3024', style: 'braids', eye: '#3e2a1e', shoe: '#ffffff', note: 4, accent: '#7cc3a5', hat: true, gingham: true },
  rara: { skin: '#ffe0d0', dress: '#d9c6f0', trim: '#ffffff', hair: '#b4532e', style: 'pony', eye: '#3d5d7a', shoe: '#e2485f', note: 5, accent: '#e5566f', polka: true },
};

const HIP = 0.096;
export const DOLL = { HIP, chestY: HIP + 0.042, headY: HIP + 0.062 + 0.046, mouthY: HIP + 0.062 + 0.046 - 0.024, height: 0.262 };

// ---------- face painting ----------
const FS = 256, FPM = FS / 0.1; // pixels per meter on face canvas
function fx(x) { return FS / 2 + x * FPM; }
function fy(y) { return FS / 2 - y * FPM; }

function drawFace(g, spec, e) {
  g.fillStyle = spec.skin; g.fillRect(0, 0, FS, FS);
  // blush
  const bl = 0.32 + 0.5 * e.blush;
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(fx(s * 0.026), fy(-0.0145), 1, fx(s * 0.026), fy(-0.0145), 26);
    gr.addColorStop(0, `rgba(255,120,135,${bl})`); gr.addColorStop(1, 'rgba(255,120,135,0)');
    g.fillStyle = gr; g.fillRect(0, 0, FS, FS);
  }
  // eye sockets (soft crease) + lower lashes
  for (const s of [-1, 1]) {
    const cx = fx(s * 0.0165), cy = fy(-0.002);
    const gr = g.createRadialGradient(cx, cy, 20, cx, cy, 33);
    gr.addColorStop(0, 'rgba(170,90,80,0.22)'); gr.addColorStop(1, 'rgba(170,90,80,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 34, 0, 7); g.fill();
    if (!e.sleep) {
      g.strokeStyle = 'rgba(80,40,30,0.55)'; g.lineWidth = 1.6; g.lineCap = 'round';
      for (const a of [0.35, 0.65, 0.95]) { const ang = Math.PI / 2 + s * (a - 0.15) * 0.9; g.beginPath(); g.moveTo(cx + Math.cos(ang) * 25, cy + Math.sin(ang) * 25); g.lineTo(cx + Math.cos(ang) * 29, cy + Math.sin(ang) * 29.5); g.stroke(); }
    }
  }
  // brows
  const by = fy(0.0185) - e.brow * 4;
  g.strokeStyle = new THREE.Color(spec.hair).multiplyScalar(0.75).getStyle(); g.lineWidth = 3; g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(fx(s * 0.0095), by + 3 - e.brow * 1.5); g.quadraticCurveTo(fx(s * 0.017), by - 3 - e.brow * 2, fx(s * 0.0245), by + 1.5); g.stroke();
  }
  // nose
  g.fillStyle = 'rgba(220,140,120,0.35)'; g.beginPath(); g.ellipse(fx(0), fy(-0.0128), 4, 2.4, 0, 0, 7); g.fill();
  // mouth
  const mx = fx(0), my = fy(-0.0235);
  const lip = '#c84d68', dark = '#8e2c43';
  g.lineCap = 'round'; g.lineJoin = 'round';
  switch (e.mouth) {
    case 'open': {
      g.fillStyle = dark; g.beginPath(); g.moveTo(mx - 15, my - 3); g.quadraticCurveTo(mx, my + 2, mx + 15, my - 3); g.quadraticCurveTo(mx + 13, my + 15, mx, my + 16); g.quadraticCurveTo(mx - 13, my + 15, mx - 15, my - 3); g.fill();
      g.fillStyle = '#f08a9a'; g.beginPath(); g.ellipse(mx, my + 11, 8, 4.5, 0, 0, 7); g.fill();
      g.strokeStyle = lip; g.lineWidth = 2; g.beginPath(); g.moveTo(mx - 15, my - 3); g.quadraticCurveTo(mx, my + 2, mx + 15, my - 3); g.stroke();
      break;
    }
    case 'o': g.fillStyle = dark; g.beginPath(); g.ellipse(mx, my + 3, 6.5, 8, 0, 0, 7); g.fill(); g.strokeStyle = lip; g.lineWidth = 2; g.stroke(); break;
    case 'chewA': g.strokeStyle = lip; g.lineWidth = 3; g.beginPath(); g.moveTo(mx - 9, my + 1); g.quadraticCurveTo(mx - 4, my + 5, mx, my + 2); g.quadraticCurveTo(mx + 4, my + 5, mx + 9, my + 1); g.stroke(); break;
    case 'chewB': g.fillStyle = dark; g.beginPath(); g.ellipse(mx, my + 3, 7, 4, 0, 0, 7); g.fill(); g.strokeStyle = lip; g.lineWidth = 2; g.stroke(); break;
    case 'mm': g.strokeStyle = lip; g.lineWidth = 3.2; g.beginPath(); g.moveTo(mx - 11, my - 1); g.quadraticCurveTo(mx, my + 9, mx + 11, my - 1); g.stroke(); break;
    case 'sleep': g.strokeStyle = lip; g.lineWidth = 2.6; g.beginPath(); g.moveTo(mx - 6, my + 2); g.quadraticCurveTo(mx, my + 5, mx + 6, my + 2); g.stroke(); break;
    case 'small': g.fillStyle = dark; g.beginPath(); g.moveTo(mx - 8, my); g.quadraticCurveTo(mx, my + 2, mx + 8, my); g.quadraticCurveTo(mx, my + 9, mx - 8, my); g.fill(); break;
    default: g.strokeStyle = lip; g.lineWidth = 3; g.beginPath(); g.moveTo(mx - 12, my - 2); g.quadraticCurveTo(mx, my + 8, mx + 12, my - 2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(mx - 5, my + 6); g.quadraticCurveTo(mx, my + 7.5, mx + 5, my + 6); g.stroke();
  }
}

// ---------- head geometry ----------
const HR = [0.046, 0.044, 0.043];
function headGeo() {
  const g = new THREE.SphereGeometry(1, 48, 36), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // chubby cheeks, softer chin
    const cheek = Math.exp(-Math.pow((y + 0.35) / 0.3, 2)) * Math.max(0, z) * 0.07;
    const chin = y < -0.5 ? (1 - 0.12 * (-(y + 0.5) / 0.5)) : 1;
    x *= (1 + cheek) * chin; z *= (1 + cheek * 0.6);
    p.setXYZ(i, x * HR[0], y * HR[1], z * HR[2]);
  }
  g.computeVertexNormals();
  planarUV(g, 0, 0, 0.1, -0.004);
  return g;
}
function surfZ(x, y) { return HR[2] * Math.sqrt(Math.max(0, 1 - (x / HR[0]) ** 2 - (y / HR[1]) ** 2)); }

// hair cap: shell that dips under the skin over the face
function hairCapGeo(scale = 1.075) {
  const g = new THREE.SphereGeometry(1, 96, 72), p = g.attributes.position;
  const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ef = (x / 0.82) ** 2 + ((y + 0.22) / 0.6) ** 2;
    const face = (1 - ss(0.78, 1.06, ef)) * ss(-0.1, 0.3, z);
    const low = ss(-0.2, -0.5, y + 0.38 * Math.max(0, -z) - 0.12 * Math.max(0, z));
    const h = (1 - face) * (1 - low);
    const az = Math.atan2(x, z);
    const groove = 0.012 * h * Math.sin(az * 22 + y * 3) * ss(-0.6, 0.6, y);
    const r = 0.9 + (scale - 0.9) * h + groove;
    p.setXYZ(i, x * HR[0] * r, y * HR[1] * r + 0.0015 * h, z * HR[2] * r - 0.001 * h);
  }
  g.computeVertexNormals();
  return g;
}

// lock (strand bundle) following the head surface from (u0,v0) to (u1,v1) in normalized head coords
function lockGeo(a, b, width, lift = 1.09, curl = 0.0, thick = 0.0032, segs = 14) {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    const zz = Math.sqrt(Math.max(0.02, 1 - x * x - y * y)) * (a[2] !== undefined ? Math.sign(a[2]) || 1 : 1);
    const k = lift + (t > 0.75 ? curl * (t - 0.75) * 4 : 0);
    pts.push(new THREE.Vector3(x * HR[0] * k, y * HR[1] * k, zz * HR[2] * k));
  }
  const up = new THREE.Vector3();
  return taperTube(curve(pts), t => [width * (1 - 0.55 * Math.pow(t, 3)) * (0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * (t > 0.9 ? Math.sqrt(Math.max(0.05, (1 - t) / 0.1)) : 1), thick * (1 - 0.5 * t)], { segs, radial: 8, upFn: (t, P) => up.copy(P).normalize() });
}

// ribbon bow
function bowGeo(s = 1) {
  const loop = side => taperTube(curve([[0, 0, 0], [side * 0.012, 0.008, 0.002], [side * 0.022, 0.004, 0], [side * 0.02, -0.006, 0], [side * 0.008, -0.004, 0.001], [0, 0, 0]].map(v => v.map(c => c * s))), t => [0.0055 * s * Math.sin(Math.PI * t) + 0.0015 * s, 0.0012 * s], { segs: 20, radial: 6, up: new THREE.Vector3(0, 0, 1) });
  const tail = side => taperTube(curve([[0, 0, 0], [side * 0.006, -0.012, 0.001], [side * 0.01, -0.022, 0]].map(v => v.map(c => c * s))), t => [0.004 * s, 0.001 * s], { segs: 10, radial: 6, up: new THREE.Vector3(0, 0, 1) });
  return merge([loop(1), loop(-1), tail(1), tail(-1), ell(0.005 * s, 0.0045 * s, 0.004 * s, 12, 8)]);
}

function skinMat(spec, map) {
  return new THREE.MeshPhysicalMaterial({ color: map ? '#ffffff' : spec.skin, map: map || null, roughness: 0.5, sheen: 0.7, sheenColor: new THREE.Color('#ff9f90'), sheenRoughness: 0.55, clearcoat: 0.14, clearcoatRoughness: 0.45 });
}

export class Doll {
  constructor(id) {
    const spec = SPECS[id];
    this.id = id; this.spec = spec;
    this.meshes = [];
    const root = this.root = new THREE.Group();
    this.lay = new THREE.Group(); root.add(this.lay);
    this.body = new THREE.Group(); this.lay.add(this.body);
    this.pelvis = new THREE.Group(); this.pelvis.position.y = HIP; this.body.add(this.pelvis);
    this.spine = new THREE.Group(); this.pelvis.add(this.spine);
    this.neck = new THREE.Group(); this.neck.position.y = 0.062; this.spine.add(this.neck);
    this.head = new THREE.Group(); this.head.position.y = 0.046; this.neck.add(this.head);
    this.head.rotation.order = 'YXZ'; this.neck.rotation.order = 'YXZ';
    this.chest = new THREE.Object3D(); this.chest.position.set(0, 0.04, 0.0); this.spine.add(this.chest);
    this.mouth = new THREE.Object3D(); this.mouth.position.set(0, -0.024, 0.042); this.head.add(this.mouth);

    // materials
    const fc = T.canvas(FS, FS);
    this.faceCanvas = fc; this.faceTex = new THREE.CanvasTexture(fc.c); this.faceTex.colorSpace = THREE.SRGBColorSpace; this.faceTex.anisotropy = 4;
    this.faceMat = skinMat(spec, this.faceTex);
    this.skin = skinMat(spec);
    const wv = TX.weave.clone(); wv.repeat.set(9, 7); wv.needsUpdate = true;
    const dressOpt = { color: spec.dress, roughness: 0.82, normalMap: wv, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 1, sheenColor: new THREE.Color(spec.dress).lerp(new THREE.Color('#ffffff'), 0.6), sheenRoughness: 0.55 };
    if (spec.gingham) { dressOpt.map = T.gingham('#ffffff', spec.dress); dressOpt.map.repeat.set(4, 3); dressOpt.color = '#ffffff'; }
    if (spec.polka) { dressOpt.map = T.polka(spec.dress, '#ffffff'); dressOpt.map.repeat.set(5, 3); dressOpt.color = '#ffffff'; }
    this.dressMat = new THREE.MeshPhysicalMaterial(dressOpt);
    this.skirtMat = this.dressMat.clone(); this.skirtMat.side = THREE.DoubleSide;
    this.hairMat = new THREE.MeshPhysicalMaterial({ color: spec.hair, roughness: 0.36, normalMap: TX.hair, normalScale: new THREE.Vector2(0.55, 0.55), clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 0.5, sheenColor: new THREE.Color(spec.hair).lerp(new THREE.Color('#ffe2c4'), 0.5), sheenRoughness: 0.4 });
    this.accentMat = new THREE.MeshPhysicalMaterial({ color: spec.accent, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') });
    const add = (parent, geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); this.meshes.push(m); return m; };
    this._add = add;

    // ---------- head ----------
    add(this.head, headGeo(), this.faceMat);
    add(this.head, xf(ell(0.0042, 0.0034, 0.0035, 12, 8), [0, -0.0118, surfZ(0, -0.0118) - 0.0005]), this.skin, false);
    for (const s of [-1, 1]) add(this.head, xf(ell(0.0065, 0.010, 0.008, 12, 8), [s * 0.0445, -0.004, -0.002]), this.skin, false);
    // eyes
    const irisTex = T.iris(spec.eye);
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
    const lashMat = new THREE.MeshPhysicalMaterial({ color: '#2a1810', roughness: 0.5 });
    this.eyes = []; this.lids = [];
    const RE = 0.0118, RL = RE * 1.08;
    const eyeG = planarUV(new THREE.SphereGeometry(RE, 24, 18), 0, 0, RE * 2.05, -0.001, [0.02, 0.5]);
    const lidG = new THREE.SphereGeometry(RL, 24, 12, 0, Math.PI * 2, 0, 1.9);
    const th = 1.9, lashG = new THREE.TorusGeometry(RL * Math.sin(th), 0.00075, 5, 18, 2.4);
    lashG.rotateX(Math.PI / 2); lashG.rotateY(1.2 - Math.PI / 2); lashG.translate(0, RL * Math.cos(th), 0);
    for (const s of [-1, 1]) {
      const ex = s * 0.0165, ey = -0.002, ez = surfZ(ex, ey) + 0.0046 - RE;
      const socket = new THREE.Group(); socket.position.set(ex, ey, ez); socket.rotation.y = s * 0.08; this.head.add(socket);
      const eye = new THREE.Group(); eye.rotation.order = 'YXZ'; socket.add(eye); add(eye, eyeG, eyeMat, false);
      const lid = new THREE.Group(); socket.add(lid); add(lid, lidG, this.skin, false); add(lid, lashG, lashMat, false);
      this.eyes.push(eye); this.lids.push(lid);
    }

    // ---------- hair ----------
    this.hairPivots = [];
    add(this.head, hairCapGeo(), this.hairMat);
    this.buildHair();

    // ---------- torso ----------
    add(this.neck, xf(cyl(0.0105, 0.0115, 0.026, 14), [0, -0.004, 0]), this.skin);
    const bod = lathe([[0.0, -0.016], [0.027, -0.016], [0.029, 0.0], [0.031, 0.022], [0.03, 0.042], [0.024, 0.056], [0.014, 0.064], [0.0, 0.065]], 28);
    bod.scale(1, 1, 0.78);
    add(this.spine, bod, this.dressMat);
    // lace collar
    const collar = lathe([[0.0118, 0.0], [0.0118, 0.002], [0.016, 0.001]], 36);
    const cg = new THREE.RingGeometry(0.011, 0.024, 48, 2), cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x); const k = r > 0.02 ? 1 + 0.06 * Math.sin(a * 20) : 1; cp.setXY(i, x * k, y * k); }
    cg.rotateX(-Math.PI / 2); cg.scale(1, 1, 0.82); cg.rotateX(0.18); cg.translate(0, 0.0585, 0.002); cg.computeVertexNormals();
    const lc = M.lace.clone(); lc.side = THREE.DoubleSide;
    add(this.spine, cg, lc, false); add(this.spine, collar.translate(0, 0.057, 0), lc, false);
    // waist sash + bow at back
    add(this.spine, xf(new THREE.TorusGeometry(0.0272, 0.0028, 8, 36), [0, -0.012, 0], [Math.PI / 2, 0, 0], [1, 0.78, 1]), this.accentMat, false);
    const bw = add(this.spine, bowGeo(1.1), this.accentMat, false); bw.position.set(0, -0.008, -0.024); bw.rotation.y = Math.PI;
    // buttons on chest
    for (const by of [0.02, 0.034]) add(this.spine, xf(new THREE.SphereGeometry(0.0022, 8, 6), [0, by, 0.0235]), M.ceramicWhite, false);

    // ---------- skirt (with sitting morph) ----------
    this.skirt = new THREE.Group(); this.pelvis.add(this.skirt);
    const sk = this.skirtGeo();
    this.skirtMesh = add(this.skirt, sk, this.skirtMat);
    this.skirtMesh.morphTargetInfluences = [0, 0];

    // ---------- arms ----------
    this.shoulders = []; this.elbows = []; this.hands = []; this.sockets = [];
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.031, 0.05, 0); this.spine.add(sh);
      add(sh, xf(ell(0.0165, 0.0145, 0.0155, 16, 12), [s * 0.004, -0.004, 0]), this.dressMat);
      add(sh, xf(new THREE.TorusGeometry(0.0105, 0.0018, 6, 18), [s * 0.003, -0.015, 0], [Math.PI / 2, 0, 0]), M.lace, false);
      add(sh, xf(new THREE.CapsuleGeometry(0.0082, 0.022, 4, 10), [s * 0.002, -0.019, 0]), this.skin);
      const el = new THREE.Group(); el.position.set(s * 0.002, -0.034, 0); sh.add(el);
      add(el, xf(new THREE.CapsuleGeometry(0.0076, 0.018, 4, 10), [0, -0.012, 0]), this.skin);
      const hd = new THREE.Group(); hd.position.set(0, -0.027, 0); el.add(hd);
      add(hd, merge([xf(ell(0.0088, 0.0105, 0.0068, 14, 10), [0, -0.006, 0.001]), xf(ell(0.0036, 0.006, 0.0036, 8, 6), [-s * 0.0068, -0.003, 0.0045], [0.3, 0, s * 0.5])]), this.skin);
      const sock = new THREE.Object3D(); sock.position.set(0, -0.009, 0.009); hd.add(sock);
      this.shoulders.push(sh); this.elbows.push(el); this.hands.push(hd); this.sockets.push(sock);
    }

    // ---------- legs ----------
    this.hips = []; this.knees = []; this.ankles = []; this.feet = [];
    for (const s of [1, -1]) {
      const hp = new THREE.Group(); hp.position.set(s * 0.0155, -0.006, 0); this.pelvis.add(hp);
      add(hp, xf(new THREE.CapsuleGeometry(0.0118, 0.03, 4, 12), [0, -0.019, 0]), this.skin);
      const kn = new THREE.Group(); kn.position.set(0, -0.043, 0); hp.add(kn);
      add(kn, xf(new THREE.CapsuleGeometry(0.0098, 0.026, 4, 12), [0, -0.017, 0]), this.skin);
      // sock: lower shin + foot + frill
      add(kn, xf(cyl(0.0104, 0.0102, 0.016, 14, true), [0, -0.031, 0]), M.sock);
      const frill = lathe([[0.0105, 0], [0.0135, 0.0025], [0.0128, 0.0045], [0.0105, 0.003]], 24);
      add(kn, xf(frill, [0, -0.025, 0]), M.lace, false);
      const an = new THREE.Group(); an.position.set(0, -0.041, 0); kn.add(an);
      add(an, xf(ell(0.0097, 0.0078, 0.0168, 16, 10), [0, -0.0035, 0.0055]), M.sock);
      const foot = new THREE.Object3D(); foot.position.set(0, -0.0035, 0.0055); an.add(foot);
      this.hips.push(hp); this.knees.push(kn); this.ankles.push(an); this.feet.push(foot);
    }

    // pose state
    this.P = this.newPose(); this.C = this.newPose(); this.V = { hipL: 0, hipR: 0, hipZL: 0, hipZR: 0, hipLv: 0, hipRv: 0, hipZv: 0 };
    this.expr = { mouth: 'smile', blush: 0, brow: 0, sleep: false };
    this._exprKey = '';
    this.blinkT = 1 + Math.random() * 3; this.blink = 0;
    this.redrawFace(true);
    this.ik = [{ w: 0, tgt: new THREE.Vector3(), cw: 0 }, { w: 0, tgt: new THREE.Vector3(), cw: 0 }];
    this.lookTarget = new THREE.Vector3(0, 0.2, 2); this.lookW = 1;
    this.squash = 0; this.squashV = 0; this.hop = 0;
    this.bake();
  }

  newPose() { return { spineX: 0, spineZ: 0, spineY: 0, headX: 0, headY: 0, headZ: 0, eyeX: 0, eyeY: 0, lid: 0, pelvisY: HIP, armX: [0.05, 0.05], armZ: [0.14, -0.14], armY: [0, 0], elbow: [-0.3, -0.3], elbowZ: [0, 0], hipX: [0, 0], hipZ: [0, 0], knee: [0, 0], lay: 0, skirtSit: 0, bodyY: 0 }; }

  buildHair() {
    const st = this.spec.style, add = this._add, hm = this.hairMat;
    const pivot = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); this.head.add(g); const sp = { g, x: 0, z: 0, vx: 0, vz: 0, k: 60, d: 5, gain: 1 }; this.hairPivots.push(sp); return g; };
    // bangs
    const bangs = [];
    const n = st === 'wavy' ? 6 : 7;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      let x0 = t * 0.5, x1 = t * 1.05;
      if (st === 'wavy') { x0 = t * 0.4 - 0.1; x1 = t * 1.0 + 0.12; }
      bangs.push(lockGeo([x0, 0.84, 1], [x1, 0.36 - Math.abs(t) * 0.22, 1], 0.0078, 1.083, 0.03));
    }
    // temple locks
    for (const s of [-1, 1]) bangs.push(lockGeo([s * 0.7, 0.6, 1], [s * 0.86, -0.05, 1], 0.006, 1.08, 0.02));
    add(this.head, merge(bangs), hm);
    if (st === 'puffs') {
      for (const s of [-1, 1]) {
        const g = pivot(s * 0.038, 0.03, -0.01);
        const puff = new THREE.SphereGeometry(1, 28, 20), p = puff.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, y); const k = 1 + 0.06 * Math.sin(a * 12) * Math.sqrt(Math.max(0, 1 - x * x)); p.setXYZ(i, x * 0.024 * k, y * 0.021 * k, z * 0.021 * k); }
        puff.computeVertexNormals();
        add(g, xf(puff, [s * 0.02, -0.006, 0], [0, 0, s * -0.5]), hm);
        add(g, xf(new THREE.TorusGeometry(0.0085, 0.0035, 8, 18), [s * 0.002, 0, 0], [0, Math.PI / 2, s * -0.5]), this.accentMat, false);
        add(g, xf(new THREE.SphereGeometry(0.0045, 10, 8), [s * 0.002, 0.008, 0.004]), this.accentMat, false);
      }
      // little hair clip
      add(this.head, xf(bowGeo(0.7), [0.03, 0.03, 0.033], [0, 0.6, -0.3]), this.accentMat, false);
    } else if (st === 'wavy') {
      const g = pivot(0, 0.012, -0.008);
      const back = new THREE.LatheGeometry([[0.044, 0.0], [0.05, -0.02], [0.054, -0.045], [0.057, -0.07], [0.05, -0.088]].map(([r, y]) => new THREE.Vector2(r, y)), 40, Math.PI * 0.55, Math.PI * 0.9);
      const p = back.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), k = 1 + 0.06 * Math.sin(a * 14 + y * 60) * Math.min(1, -y / 0.03); p.setXYZ(i, x * k, y + Math.sin(a * 7) * 0.003 * Math.min(1, -y / 0.05), z * k * 0.92); }
      back.computeVertexNormals();
      const hb = hm.clone(); hb.side = THREE.DoubleSide; add(g, back, hb);
      for (const s of [-1, 1]) {
        const sg = pivot(s * 0.04, 0.0, 0.012);
        add(sg, taperTube(curve([[0, 0, 0], [s * 0.008, -0.025, 0.002], [s * 0.004, -0.05, 0.006], [s * 0.012, -0.072, 0.004]]), t => [0.009 * (1 - 0.5 * t), 0.0045], { segs: 16, radial: 8, up: new THREE.Vector3(s, 0, 0.3) }), hm);
      }
      // headband
      add(this.head, xf(new THREE.TorusGeometry(0.049, 0.0032, 8, 40, Math.PI), [0, 0.006, 0.004], [-0.35, 0, 0], [1, 1.02, 1]), M.cream, false);
      add(this.head, xf(bowGeo(0.75), [0.034, 0.04, 0.012], [0, 0.9, -0.5]), M.cream, false);
    } else if (st === 'braids') {
      for (const s of [-1, 1]) {
        const g = pivot(s * 0.04, -0.012, -0.01);
        const parts = [];
        for (let i = 0; i < 6; i++) { const r = 0.0085 - i * 0.0007; parts.push(xf(ell(r, r * 1.15, r * 0.9, 12, 8), [s * (0.004 + i * 0.0012), -0.01 - i * 0.0115, 0.006], [0, 0, s * (i % 2 ? 0.35 : -0.35)])); }
        add(g, merge(parts), hm);
        add(g, xf(new THREE.TorusGeometry(0.005, 0.0022, 6, 14), [s * 0.011, -0.075, 0.006], [Math.PI / 2, 0, 0]), this.accentMat, false);
      }
      // straw hat
      const hat = new THREE.Group(); hat.position.set(0, 0.031, -0.004); hat.rotation.x = -0.22; hat.scale.setScalar(0.86); this.head.add(hat);
      add(hat, lathe([[0.0, 0.0], [0.08, -0.004], [0.084, -0.002], [0.082, 0.001], [0.05, 0.004], [0.047, 0.014], [0.044, 0.03], [0.036, 0.04], [0.0, 0.042]], 48), M.straw);
      add(hat, lathe([[0.0475, 0.004], [0.0478, 0.004], [0.0462, 0.016], [0.0458, 0.016]], 48), this.accentMat, false);
      add(hat, xf(bowGeo(0.85), [0.03, 0.01, 0.034], [0, 0.7, 0]), this.accentMat, false);
      // little flower on hat
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; add(hat, xf(ell(0.004, 0.0015, 0.004, 8, 6), [-0.03 + Math.cos(a) * 0.004, 0.02, 0.032 + Math.sin(a) * 0.004]), M.ceramicWhite, false); }
      this.hat = hat;
    } else if (st === 'pony') {
      const g = pivot(0, 0.03, -0.042);
      const parts = [];
      const pts = [[0, 0, 0], [0, -0.004, -0.014], [0, -0.022, -0.024], [0, -0.046, -0.022], [0, -0.066, -0.014]];
      parts.push(taperTube(curve(pts), t => [0.012 * (1 - 0.55 * t) + 0.003, 0.01 * (1 - 0.5 * t)], { segs: 20, radial: 12 }));
      add(g, merge(parts), hm);
      add(g, xf(new THREE.TorusGeometry(0.008, 0.003, 8, 16), [0, 0, -0.004], [0, 0, 0]), this.accentMat, false);
      add(g, xf(bowGeo(1.25), [0, 0.006, 0.0], [0, Math.PI, 0]), M.satinRed, false);
    }
  }

  skirtGeo() {
    const segs = 48, rows = 10, pos = [], nor = [], uv = [], idx = [], sit = [], lie = [];
    const H = 0.05;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, y = -0.006 - t * H;
      const rad = 0.027 + (0.054 - 0.027) * Math.pow(t, 0.8);
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * Math.PI * 2;
        const fold = 1 + 0.055 * Math.sin(a * 14) * t;
        const x = Math.sin(a) * rad * fold, z = Math.cos(a) * rad * fold * 0.92;
        pos.push(x, y, z); uv.push(j / segs * 3, 1 - t * 0.9);
        // sitting morph: front part lies over the thighs
        const front = Math.max(0, Math.cos(a)), f2 = Math.pow(front, 1.4);
        const sy = y + (0.014 - 0.006 * t - y) * f2 * Math.min(1, t * 2.2);
        const sz = z + f2 * t * 0.034;
        const sx = x * (1 + 0.15 * f2 * t);
        sit.push(sx - x, sy - y, sz - z);
        // lying morph: skirt flattens against the body (front & back), spreads sideways a little
        lie.push(x * 0.12 * t, 0.004 * t, -z * (z > 0 ? 0.62 : 0.4) * Math.min(1, t * 1.5));
      }
    }
    for (let r = 0; r < rows; r++) for (let j = 0; j < segs; j++) { const a = r * (segs + 1) + j, b = a + segs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(sit, 3), new THREE.Float32BufferAttribute(lie, 3)];
    g.morphTargetsRelative = true;
    // hem roll
    return g;
  }

  setExpr(mouth, blush = 0, brow = 0) { this.expr.mouth = mouth; this.expr.blush = blush; this.expr.brow = brow; this.redrawFace(); }
  redrawFace(force) {
    const e = this.expr, key = e.mouth + '|' + e.blush.toFixed(2) + '|' + e.brow.toFixed(2) + '|' + (e.sleep ? 1 : 0);
    if (!force && key === this._exprKey) return;
    this._exprKey = key;
    drawFace(this.faceCanvas.g, this.spec, e);
    this.faceTex.needsUpdate = true;
  }
}

// ---------- pose application ----------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0), XAX = new THREE.Vector3(1, 0, 0);
const L1 = 0.034, L2 = 0.034;

Doll.prototype.applyPose = function () {
  const C = this.C;
  this.lay.rotation.x = -C.lay * Math.PI / 2;
  this.lay.position.y = C.lay * 0.026; this.lay.position.z = C.lay * 0.0;
  this.body.position.y = C.bodyY;
  const sq = this.squash;
  this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
  this.pelvis.position.y = C.pelvisY;
  this.spine.rotation.set(C.spineX, C.spineY, C.spineZ);
  this.neck.rotation.set(C.headX * 0.35, C.headY * 0.3, C.headZ * 0.3);
  this.head.rotation.set(C.headX * 0.65, C.headY * 0.7, C.headZ * 0.7);
  for (const e of this.eyes) e.rotation.set(C.eyeX, C.eyeY, 0);
  const lid = Math.min(1, C.lid + this.blink);
  for (const l of this.lids) l.rotation.x = -1.08 + lid * 1.6;
  for (let i = 0; i < 2; i++) {
    this.shoulders[i].quaternion.setFromEuler(_e.set(C.armX[i], C.armY[i], C.armZ[i]));
    this.elbows[i].rotation.set(C.elbow[i], 0, C.elbowZ[i]);
    const ik = this.ik[i];
    if (ik.cw > 0.001) this.solveIK(i, ik.tgt, ik.cw);
    this.hips[i].rotation.set(C.hipX[i], 0, C.hipZ[i]);
    this.knees[i].rotation.x = C.knee[i];
    this.ankles[i].rotation.x = -C.hipX[i] * 0.2 - C.knee[i] * 0.55;
  }
  this.skirtMesh.morphTargetInfluences[0] = C.skirtSit; this.skirtMesh.morphTargetInfluences[1] = C.lay;
  for (const h of this.hairPivots) h.g.rotation.set(h.x, 0, h.z);
};

// two-bone IK toward world target, blended by w
Doll.prototype.solveIK = function (i, target, w) {
  const sh = this.shoulders[i], el = this.elbows[i];
  this.spine.updateWorldMatrix(true, false);
  _m.copy(this.spine.matrixWorld).invert();
  _v.copy(target).applyMatrix4(_m).sub(sh.position);
  let d = _v.length();
  d = Math.min(Math.max(d, 0.02), L1 + L2 - 0.002);
  _v.normalize();
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const inner = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  _q.setFromUnitVectors(DOWN, _v);
  _q2.setFromAxisAngle(XAX, a);
  _q.multiply(_q2);
  sh.quaternion.slerp(_q, w);
  const bend = -(Math.PI - inner);
  el.rotation.x = el.rotation.x + (bend - el.rotation.x) * w;
  el.rotation.z *= (1 - w);
};

// Merge all rigid parts into a few skinned meshes (one per material) to keep draw calls low.
Doll.prototype.bake = function () {
  const root = this.root;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bones = [], idx = new Map();
  root.traverse(o => { if (o !== root && !o.isMesh) { idx.set(o, bones.length); bones.push(o); } });
  const skeleton = new THREE.Skeleton(bones);
  const groups = new Map();
  for (const m of this.meshes) {
    if (m === this.skirtMesh) continue;
    const key = m.material.uuid + (m.castShadow ? 'c' : 'n');
    if (!groups.has(key)) groups.set(key, { mat: m.material, cast: m.castShadow, list: [] });
    groups.get(key).list.push(m);
  }
  const keepMeshes = [this.skirtMesh];
  const mm = new THREE.Matrix4();
  for (const g of groups.values()) {
    const geos = g.list.map(m => {
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.applyMatrix4(mm.multiplyMatrices(inv, m.matrixWorld));
      const n = geo.attributes.position.count, bi = idx.get(m.parent);
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      return geo;
    });
    const merged = _mergeG(geos, false);
    const sm = new THREE.SkinnedMesh(merged, g.mat);
    sm.castShadow = g.cast; sm.receiveShadow = true; sm.frustumCulled = false;
    root.add(sm);
    sm.bind(skeleton);
    keepMeshes.push(sm);
    for (const m of g.list) m.parent.remove(m);
  }
  this.skirtMesh.frustumCulled = false;
  this.meshes = keepMeshes;
};
