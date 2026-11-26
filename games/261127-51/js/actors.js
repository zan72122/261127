// Characters (girl, papa, puppy) and the first-person hand with tools.
import { contactShadow } from './world.js';
import { T, scene, camera, tex, pbr, triMat, meshFrom, loadMeshPack, roundedBox, boxUV, clamp, lerp, damp, smooth, rand, V3, canvasTex } from './core.js';

export const A = {};

// ------------------------------------------------------------ materials
function clothMat(name, scale, rough, extra = {}) {
  return triMat({ A: name, B: 'skin', sA: scale, sB: 40, nA: 1.0, nB: 0.5, rA: rough, rB: 0.55, key: name + 'Cloth', ...extra });
}

// powder coating (papa after the sneeze): attribute aPowder 0..1 per vertex
const powderPatch = {
  vertexPars: 'attribute float aPowder; varying float vPowder;',
  vertexMain: 'vPowder = aPowder;',
  fragPars: 'varying float vPowder; float ph(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }',
  fragColor: `
    float gn = ph(floor(vObjPos * 900.0));
    float pw = clamp(vPowder * (0.75 + 0.5 * gn), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.072, 0.07), pw * 0.9);`,
  fragRough: 'roughnessFactor = mix(roughnessFactor, 0.95, clamp(vPowder, 0.0, 1.0));',
};

function withPowder(geo) {
  geo.setAttribute('aPowder', new T.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
  return geo;
}

// --------------------------------------------------------------- hat etc.
function makeHat() {
  const g = new T.Group();
  const tw = triMat({ A: 'tweed', sA: 14, nA: 1.4, rA: 0.95, key: 'hat' });
  const crownG = new T.SphereGeometry(0.1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  crownG.scale(0.98, 0.78, 1.06);
  // six panel seams
  const p = crownG.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const s = 1 - 0.012 * Math.pow(Math.abs(Math.cos(a * 3)), 40);
    p.setXYZ(i, p.getX(i) * s, p.getY(i), p.getZ(i) * s);
  }
  crownG.computeVertexNormals();
  const withExt = (geo, ao = 1) => {
    const n = geo.attributes.position.count;
    const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = 0.16; c[i * 3 + 1] = 0.115; c[i * 3 + 2] = 0.075; }
    const e = new Uint8Array(n * 2); for (let i = 0; i < n; i++) e[i * 2] = 255 * ao;
    geo.setAttribute('color', new T.BufferAttribute(c, 3));
    geo.setAttribute('aExt', new T.BufferAttribute(e, 2, true));
    return geo;
  };
  const crown = meshFrom(withExt(crownG), tw);
  g.add(crown);
  // front and back peaks
  for (const s of [1, -1]) {
    const bg = new T.CylinderGeometry(0.1, 0.1, 0.006, 40, 1, false, 0, Math.PI);
    bg.scale(1.0, 1, 0.62);
    const b = meshFrom(withExt(bg, 0.8), tw);
    b.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    b.rotation.order = 'YXZ';
    b.position.set(0, 0.004, s * 0.035);
    b.rotation.x = s * 0.18;
    g.add(b);
  }
  // ear flaps tied up on top
  for (const s of [1, -1]) {
    const fg = roundedBox(0.012, 0.06, 0.07, 0.005, 2);
    const f = meshFrom(withExt(fg, 0.85), tw);
    f.position.set(s * 0.075, 0.05, 0); f.rotation.z = s * 0.6;
    g.add(f);
  }
  const bow = meshFrom(new T.TorusGeometry(0.012, 0.003, 8, 16), new T.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 0.9 }));
  bow.position.set(0, 0.082, 0); bow.rotation.x = Math.PI / 2;
  g.add(bow);
  const btn = meshFrom(new T.SphereGeometry(0.008, 12, 8), new T.MeshStandardMaterial({ color: 0x5a4a38, roughness: 0.9 }));
  btn.position.set(0, 0.078, 0); g.add(btn);
  return g;
}

function makeMagnifier() {
  const g = new T.Group();
  const brass = new T.MeshStandardMaterial({ color: 0xb08a4c, metalness: 1, roughness: 0.28 });
  const ring = meshFrom(new T.TorusGeometry(0.04, 0.0045, 16, 64), brass);
  g.add(ring);
  const lens = new T.Mesh(new T.CircleGeometry(0.04, 48), new T.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.02, transparent: true, opacity: 0.12, envMapIntensity: 2, side: T.DoubleSide, depthWrite: false }));
  g.add(lens);
  const handleG = new T.LatheGeometry([[0.0, 0], [0.007, 0.0], [0.009, 0.02], [0.0085, 0.08], [0.0065, 0.09], [0, 0.092]].map(([r, y]) => new T.Vector2(r, y)), 24);
  const handle = meshFrom(handleG, pbr('darkwood', { ns: 0.6 }));
  handle.position.y = -0.044 - 0.092; g.add(handle);
  const neck = meshFrom(new T.CylinderGeometry(0.005, 0.006, 0.012, 16), brass);
  neck.position.y = -0.048; g.add(neck);
  return g;
}

// ------------------------------------------------------------------ girl
export class Girl {
  constructor(parts) {
    this.root = new T.Group();
    this.body = new T.Group();
    this.root.add(this.body);
    const coatM = clothMat('twill', 12, 0.85);
    const tights = clothMat('knit', 30, 0.95);
    const shoeM = triMat({ A: 'skin', sA: 30, nA: 0.4, rA: 0.45, rB: 0.32, key: 'shoe' });
    const skinM = triMat({ A: 'skin', sA: 40, nA: 0.5, rA: 0.55, key: 'skin', physical: { sheen: 0.4, sheenColor: new T.Color(1.0, 0.45, 0.35), sheenRoughness: 0.5 } });
    const hairM = triMat({ A: 'linen', sA: 60, nA: 0.6, rA: 0.42, key: 'hair', physical: { sheen: 0.6, sheenColor: new T.Color(0.45, 0.3, 0.2), sheenRoughness: 0.35 } });
    const armM = clothMat('twill', 12, 0.85, { key: 'girlArm' });
    this.lower = new T.Group(); this.body.add(this.lower);
    this.lower.add(meshFrom(parts.coat, coatM), meshFrom(parts.legs, tights), meshFrom(parts.shoes, shoeM));
    // upper body pivot at the waist (coat is one mesh; we bend the head + arms)
    this.neck = new T.Group(); this.neck.position.set(0, 0.86, 0); this.body.add(this.neck);
    const head = meshFrom(parts.head, skinM); head.position.y = -0.86;
    const hair = meshFrom(parts.hair, hairM); hair.position.y = -0.86;
    this.neck.add(head, hair);
    this.hat = makeHat(); this.hat.position.set(0, 0.155, -0.006); this.hat.rotation.x = -0.12; this.hat.visible = false;
    this.neck.add(this.hat);
    this.arms = [];
    for (const [k, sx] of [['armR', 1], ['armL', -1]]) {
      const piv = new T.Group(); piv.position.set(sx * 0.122, 0.835, 0);
      piv.add(meshFrom(parts[k], armM));
      this.body.add(piv);
      this.arms.push(piv);
    }
    this.magnifier = makeMagnifier(); this.magnifier.scale.setScalar(0.9); this.magnifier.visible = false;
    this.magnifier.position.set(0.035, -0.34, 0.07); this.magnifier.rotation.set(-0.4, 0, -0.2);
    this.arms[0].add(this.magnifier);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(this.root);
    this.t = 0;
    this.act = null; this.actT = 0;
    this.headYaw = 0; this.headPitch = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.slump = 0; this.slumpT = 0;
  }
  do(name, dur = 1.2) { this.act = name; this.actT = 0; this.actDur = dur; }
  update(dt) {
    this.t += dt; this.actT += dt;
    const k = this.act ? clamp(this.actT / this.actDur, 0, 1) : 1;
    if (k >= 1) this.act = null;
    const env = Math.sin(k * Math.PI);
    let jump = 0, armR = [0.08, 0, 0.06], armL = [0.08, 0, -0.06], nod = 0, tilt = 0;
    const breath = Math.sin(this.t * 1.7) * 0.004;
    switch (this.act) {
      case 'jump': {
        const hop = Math.abs(Math.sin(k * Math.PI * 2)) * env;
        jump = hop * 0.09; armR = [-2.4 * env, 0, 0.3 * env]; armL = [-2.4 * env, 0, -0.3 * env]; break;
      }
      case 'clap': {
        const c = Math.abs(Math.sin(k * Math.PI * 6)) * env;
        armR = [-1.1 * env, 0, -0.35 * env * (0.4 + 0.6 * c)]; armL = [-1.1 * env, 0, 0.35 * env * (0.4 + 0.6 * c)];
        jump = Math.abs(Math.sin(k * Math.PI * 3)) * 0.02 * env; break;
      }
      case 'nod': nod = Math.sin(k * Math.PI * 4) * 0.22 * env; break;
      case 'sad': nod = 0.35 * env; armR = [0.1, 0, 0.02]; armL = [0.1, 0, -0.02]; break;
      case 'huh': tilt = 0.3 * env; armR = [-0.5 * env, 0, 0.5 * env]; armL = [-0.5 * env, 0, -0.5 * env]; break;
      case 'point': armR = [-1.4 * env, 0.2 * env, 0.1]; break;
      case 'kneel': jump = -0.32 * env; nod = 0.4 * env; armR = [-0.9 * env, 0, 0.1]; armL = [-0.9 * env, 0, -0.1]; break;
      case 'lookup': nod = -0.3 * env; break;
    }
    if (this.holdMag) armR = [-0.9, 0, 0.1];
    this.body.position.y = jump + breath;
    const a0 = this.arms[0].rotation, a1 = this.arms[1].rotation;
    a0.x = damp(a0.x, armR[0], 12, dt); a0.y = damp(a0.y, armR[1], 12, dt); a0.z = damp(a0.z, armR[2], 12, dt);
    a1.x = damp(a1.x, armL[0], 12, dt); a1.y = damp(a1.y, armL[1], 12, dt); a1.z = damp(a1.z, armL[2], 12, dt);
    this.neck.rotation.x = damp(this.neck.rotation.x, nod + this.lookPitch, 8, dt);
    this.neck.rotation.y = damp(this.neck.rotation.y, this.lookYaw, 6, dt);
    this.neck.rotation.z = damp(this.neck.rotation.z, tilt, 8, dt);
  }
}

// ------------------------------------------------------------------ papa
export class Papa {
  constructor(parts) {
    this.root = new T.Group();
    this.body = new T.Group(); this.root.add(this.body);
    const P = (name, scale, rough, key, extra = {}) => triMat({ A: name, B: 'skin', sA: scale, sB: 30, nA: 1.0, nB: 0.5, rA: rough, rB: 0.55, key, ...powderPatch, ...extra });
    const knitM = P('knit', 9, 0.95, 'papaKnit');
    const denimM = P('denim', 10, 0.85, 'papaDenim');
    const sockM = P('knit', 18, 0.95, 'papaSock');
    const skinM = P('skin', 30, 0.55, 'papaSkin', { A: 'skin', B: 'skin', physical: { sheen: 0.3, sheenColor: new T.Color(1, 0.5, 0.4) } });
    const hairM = P('linen', 50, 0.5, 'papaHair', { A: 'linen', B: 'linen' });
    this.meshes = [];
    const add = (g, m, parent) => { withPowder(g); const mm = meshFrom(g, m); parent.add(mm); this.meshes.push(mm); return mm; };
    add(parts.torso, knitM, this.body); add(parts.legs, denimM, this.body); add(parts.socks, sockM, this.body);
    this.neck = new T.Group(); this.neck.position.set(0, 1.45, 0); this.body.add(this.neck);
    const h = add(parts.head, skinM, this.neck); h.position.y = -1.45;
    const hr = add(parts.hair, hairM, this.neck); hr.position.y = -1.45;
    this.arms = [];
    for (const [k, sx] of [['armR', 1], ['armL', -1]]) {
      const piv = new T.Group(); piv.position.set(sx * 0.205, 1.4, 0);
      add(parts[k], P('knit', 9, 0.95, 'papaArm'), piv);
      this.body.add(piv); this.arms.push(piv);
    }
    scene.add(this.root);
    this.t = 0; this.act = null; this.actT = 0;
    this.walk = 0; this.speed = 0;
    this.target = null; this.lookYaw = 0;
  }
  do(name, dur = 1.2) { this.act = name; this.actT = 0; this.actDur = dur; }
  // brush powder off: world point p, radius r, amount
  brush(p, r, amt) {
    let removed = 0;
    const lp = V3();
    for (const m of this.meshes) {
      lp.copy(p); m.worldToLocal(lp);
      const pos = m.geometry.attributes.position, pw = m.geometry.attributes.aPowder;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - lp.x, dy = pos.getY(i) - lp.y, dz = pos.getZ(i) - lp.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r && pw.array[i] > 0) {
          const f = (1 - Math.sqrt(d2) / r) * amt;
          const v = Math.max(0, pw.array[i] - f);
          removed += pw.array[i] - v; pw.array[i] = v;
        }
      }
      pw.needsUpdate = true;
    }
    return removed;
  }
  powderAll(level) {
    for (const m of this.meshes) {
      const pos = m.geometry.attributes.position, pw = m.geometry.attributes.aPowder;
      const wp = V3();
      for (let i = 0; i < pos.count; i++) {
        wp.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        // more on the front and on top surfaces
        const n = Math.sin(wp.x * 40) * Math.sin(wp.y * 33) * Math.sin(wp.z * 47);
        pw.array[i] = clamp(level * (0.75 + 0.35 * n), 0, 1);
      }
      pw.needsUpdate = true;
    }
  }
  powderLeft() {
    let s = 0, n = 0;
    for (const m of this.meshes) { const a = m.geometry.attributes.aPowder.array; for (let i = 0; i < a.length; i += 7) { s += a[i]; n++; } }
    return n ? s / n : 0;
  }
  update(dt) {
    this.t += dt; this.actT += dt;
    const k = this.act ? clamp(this.actT / this.actDur, 0, 1) : 1;
    if (k >= 1 && this.act) this.act = null;
    const env = Math.sin(k * Math.PI);
    // walking toward target
    if (this.target) {
      const d = V3(this.target.x - this.root.position.x, 0, this.target.z - this.root.position.z);
      const L = d.length();
      if (L > 0.04) {
        const sp = Math.min(0.9, L * 2.5);
        d.normalize();
        this.root.position.addScaledVector(d, sp * dt);
        const ry = Math.atan2(d.x, d.z);
        let dr = ry - this.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        this.root.rotation.y += dr * Math.min(1, dt * 6);
        this.walk += dt * sp * 7; this.speed = sp;
      } else { this.speed = damp(this.speed, 0, 8, dt); if (this.target.ry !== undefined) { let dr = this.target.ry - this.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); this.root.rotation.y += dr * Math.min(1, dt * 4); } }
    }
    const sw = Math.sin(this.walk) * Math.min(1, this.speed * 2);
    let armR = [sw * 0.4, 0, 0.08], armL = [-sw * 0.4, 0, -0.08], bend = 0, nod = 0, tilt = 0, bob = Math.abs(Math.cos(this.walk)) * 0.02 * Math.min(1, this.speed * 2);
    switch (this.act) {
      case 'reach': armR = [-2.6 * env, 0, 0.2]; break;
      case 'sneeze': {
        // ha.. ha.. (lean back) CHOO (jerk forward)
        const a = k < 0.6 ? -smooth(k / 0.6) * 0.25 : 0.45 * Math.exp(-(k - 0.6) * 10) - 0.0;
        bend = a; nod = a * 1.4; armR = [-0.6 * env, 0, 0.3]; armL = [-0.6 * env, 0, -0.3]; break;
      }
      case 'oops': tilt = 0.25 * env; armR = [-0.4 * env, 0, 0.9 * env]; armL = [-0.4 * env, 0, -0.9 * env]; break;
      case 'shrug': armR = [-0.3 * env, 0, 0.5 * env]; armL = [-0.3 * env, 0, -0.5 * env]; tilt = 0.15 * env; break;
      case 'clap': {
        const c = Math.abs(Math.sin(k * Math.PI * 6));
        armR = [-1.0 * env, 0, -0.3 * env * c]; armL = [-1.0 * env, 0, 0.3 * env * c]; break;
      }
      case 'laugh': bend = Math.sin(k * Math.PI * 8) * 0.04 * env + 0.05 * env; nod = -0.15 * env; armR = [-0.2, 0, 0.2]; break;
      case 'wobble': tilt = Math.sin(k * Math.PI * 6) * 0.1 * env; armR = [-0.8 * env, 0, 0.8 * env]; armL = [-0.8 * env, 0, -0.8 * env]; break;
      case 'thumbs': armR = [-1.3 * env, 0.3, 0.2]; nod = Math.sin(k * Math.PI * 3) * 0.1 * env; break;
    }
    this.body.position.y = bob;
    this.body.rotation.x = damp(this.body.rotation.x, bend * 0.5, 10, dt);
    const a0 = this.arms[0].rotation, a1 = this.arms[1].rotation;
    a0.x = damp(a0.x, armR[0], 10, dt); a0.z = damp(a0.z, armR[2], 10, dt);
    a1.x = damp(a1.x, armL[0], 10, dt); a1.z = damp(a1.z, armL[2], 10, dt);
    this.neck.rotation.x = damp(this.neck.rotation.x, nod, 10, dt);
    this.neck.rotation.z = damp(this.neck.rotation.z, tilt, 8, dt);
    this.neck.rotation.y = damp(this.neck.rotation.y, this.lookYaw, 5, dt);
  }
}

// ------------------------------------------------------------------ puppy
function furNoiseTex() {
  const n = 256, d = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { const v = Math.random() * 255; d[i * 4] = v; d[i * 4 + 1] = Math.random() * 255; d[i * 4 + 2] = Math.random() * 255; d[i * 4 + 3] = 255; }
  const t = new T.DataTexture(d, n, n);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
const FUR_NOISE = furNoiseTex();

function furShells(geo, layers, len, density, key, opts = {}) {
  const shell = new T.InstancedMesh(geo, null, layers);
  const L = new Float32Array(layers);
  for (let i = 0; i < layers; i++) { L[i] = (i + 1) / layers; shell.setMatrixAt(i, new T.Matrix4()); }
  geo = geo.clone();
  geo.setAttribute('aLayer', new T.InstancedBufferAttribute(L, 1));
  shell.geometry = geo;
  const m = triMat({
    A: 'skin', sA: 30, nA: 0.0, rA: 0.75, key: 'fur' + key, env: 0.8,
    uniforms: { tFur: { value: FUR_NOISE }, uLen: { value: len }, uDen: { value: density }, uGrav: { value: opts.grav ?? 0.3 }, uWind: { value: new T.Vector3() } },
    vertexPars: 'attribute float aLayer; varying float vLayer; uniform float uLen; uniform float uGrav; uniform vec3 uWind;',
    vertexMain: `vLayer = aLayer;
      transformed += normal * uLen * aLayer;
      transformed.y -= uGrav * uLen * aLayer * aLayer;
      transformed += uWind * aLayer * aLayer;`,
    fragPars: 'varying float vLayer; uniform sampler2D tFur; uniform float uDen;',
    fragColor: `
      vec3 fp = vObjPos * uDen;
      float s = tri(tFur, fp, tw).r;
      float hairLen = 0.25 + s * 0.85;
      if (hairLen < vLayer * 1.05) discard;
      diffuseColor.rgb *= mix(0.7, 1.1, vLayer) * (0.94 + 0.12 * s);`,
    fragRough: 'roughnessFactor = mix(0.9, 0.62, vLayer);',
    fragAO: 'reflectedLight.indirectDiffuse /= max(vao, 0.05); reflectedLight.indirectDiffuse *= mix(vao, 1.0, 0.6); reflectedLight.directDiffuse *= 1.0;',
  });
  m.side = T.FrontSide;
  shell.material = m;
  shell.castShadow = false; shell.receiveShadow = true;
  shell.frustumCulled = false;
  return shell;
}

export class Dog {
  constructor(parts) {
    this.root = new T.Group();
    this.body = new T.Group(); this.root.add(this.body);
    const base = triMat({ A: 'skin', sA: 30, nA: 0.0, rA: 0.95, key: 'dogBase' });
    const mk = (g, len, den, layers, parent, key, grav) => {
      const m = meshFrom(g, base); parent.add(m);
      const sh = furShells(g, layers, len, den, key, { grav });
      parent.add(sh);
      return [m, sh];
    };
    mk(parts.body, 0.008, 12, 14, this.body, 'b', 0.4);
    this.head = new T.Group();
    const o = parts.head.userData.origin;
    this.head.position.set(o[0], o[1], o[2]);
    this.body.add(this.head);
    mk(parts.head, 0.005, 15, 12, this.head, 'h', 0.2);
    this.ears = [];
    for (const [k, sx] of [['earR', 1], ['earL', -1]]) {
      const piv = new T.Group(); piv.position.set(sx * 0.052, 0.092, -0.005);
      mk(parts[k], 0.006, 15, 10, piv, 'e', 0.8);
      this.head.add(piv); this.ears.push(piv);
    }
    this.tail = new T.Group(); this.tail.position.set(0, 0.05, -0.14); this.body.add(this.tail);
    mk(parts.tail, 0.012, 12, 10, this.tail, 't', 0.6);
    // eyes, nose
    const eyeM = new T.MeshPhysicalMaterial({ color: 0x1c120b, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
    for (const sx of [-1, 1]) {
      const e = meshFrom(new T.SphereGeometry(0.0115, 24, 16), eyeM);
      e.position.set(sx * 0.0255, 0.066, 0.049); this.head.add(e);
      const hl = new T.Mesh(new T.SphereGeometry(0.0026, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(sx * 0.0255 - 0.003, 0.0705, 0.0595); this.head.add(hl);
    }
    const noseG = new T.SphereGeometry(0.0145, 24, 16); noseG.scale(1.25, 0.85, 0.9);
    const np = noseG.attributes.position;
    for (let i = 0; i < np.count; i++) { const x = np.getX(i), y = np.getY(i), z = np.getZ(i); const b = 1 + 0.06 * Math.sin(x * 900) * Math.sin(y * 800) * Math.sin(z * 700); np.setXYZ(i, x * b, y * b, z * b); }
    noseG.computeVertexNormals();
    this.nose = meshFrom(noseG, new T.MeshPhysicalMaterial({ color: 0x1a1614, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
    this.nose.position.set(0, 0.034, 0.118); this.head.add(this.nose);
    // cookie crumbs on the nose / muzzle
    this.crumbs = new T.Group();
    const crumbM = new T.MeshStandardMaterial({ color: 0xb98a52, roughness: 0.85 });
    for (let i = 0; i < 9; i++) {
      const cg = new T.IcosahedronGeometry(rand(0.002, 0.0045), 0);
      const cp = cg.attributes.position;
      for (let j = 0; j < cp.count; j++) cp.setXYZ(j, cp.getX(j) * rand(0.7, 1.3), cp.getY(j) * rand(0.7, 1.3), cp.getZ(j) * rand(0.7, 1.3));
      cg.computeVertexNormals();
      const c = meshFrom(cg, crumbM);
      const a = rand(-1, 1);
      c.position.set(a * 0.02, 0.045 + rand(-0.006, 0.01), 0.112 - Math.abs(a) * 0.01 + rand(0, 0.008));
      if (i < 3) c.position.set(rand(-0.008, 0.008), 0.048, 0.125);
      c.rotation.set(rand(0, 6), rand(0, 6), 0);
      this.crumbs.add(c);
    }
    this.head.add(this.crumbs);
    this.root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(this.root);
    this.t = 0; this.act = null; this.actT = 0;
    this.wag = 0.3; this.earUp = 0; this.target = null; this.hop = 0; this.walkPh = 0; this.onStep = null;
    this.lookYaw = 0; this.lookPitch = 0;
  }
  do(name, dur = 1.0) { this.act = name; this.actT = 0; this.actDur = dur; }
  update(dt) {
    this.t += dt; this.actT += dt;
    const k = this.act ? clamp(this.actT / this.actDur, 0, 1) : 1;
    if (k >= 1 && this.act) this.act = null;
    const env = Math.sin(k * Math.PI);
    let tilt = 0, pitch = this.lookPitch, earUp = 0, jump = 0, wagAmp = this.wag, bodyTilt = 0;
    switch (this.act) {
      case 'huh': tilt = 0.45 * env; earUp = 0.4 * env; wagAmp = 0.05; break;
      case 'happy': jump = Math.abs(Math.sin(k * Math.PI * 3)) * 0.06 * env; wagAmp = 1; earUp = 0.3 * env; pitch -= 0.2 * env; break;
      case 'sheepish': pitch += 0.25 * env; earUp = -0.3 * env; wagAmp = 0.4; break;
      case 'sniff': pitch += 0.35 * env + Math.sin(k * 40) * 0.03; break;
      case 'eat': pitch += 0.4 * Math.abs(Math.sin(k * Math.PI * 3)) * env; wagAmp = 0.9; break;
      case 'yip': pitch -= 0.25 * env; earUp = 0.2 * env; break;
    }
    // trotting to a target
    if (this.target) {
      const d = V3(this.target.x - this.root.position.x, 0, this.target.z - this.root.position.z);
      const L = d.length();
      if (L > 0.03) {
        d.normalize();
        const sp = Math.min(0.8, L * 3);
        this.root.position.addScaledVector(d, sp * dt);
        const ry = Math.atan2(d.x, d.z);
        let dr = ry - this.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        this.root.rotation.y += dr * Math.min(1, dt * 8);
        const prev = this.walkPh;
        this.walkPh += dt * 14;
        jump = Math.max(jump, Math.abs(Math.sin(this.walkPh)) * 0.025);
        bodyTilt = 0.15;
        wagAmp = 0.8;
        if (this.onStep && Math.floor(prev / Math.PI) !== Math.floor(this.walkPh / Math.PI)) this.onStep(Math.floor(this.walkPh / Math.PI) % 4);
      } else if (this.target.done) { this.target.done(); this.target.done = null; }
    }
    this.body.position.y = jump;
    this.body.rotation.x = damp(this.body.rotation.x, bodyTilt, 6, dt);
    this.head.rotation.z = damp(this.head.rotation.z, tilt, 8, dt);
    this.head.rotation.x = damp(this.head.rotation.x, pitch + Math.sin(this.t * 1.3) * 0.03, 8, dt);
    this.head.rotation.y = damp(this.head.rotation.y, this.lookYaw, 6, dt);
    this.wagPh = (this.wagPh || 0) + dt * (8 + wagAmp * 10);
    this.tail.rotation.y = Math.sin(this.wagPh) * 0.6 * wagAmp;
    this.tail.rotation.x = -0.2 - wagAmp * 0.2;
    for (const [i, e] of this.ears.entries()) {
      const s = i ? -1 : 1;
      e.rotation.z = damp(e.rotation.z, s * (-0.06 + earUp * 0.6) + Math.sin(this.t * 3 + i) * 0.03, 10, dt);
      e.rotation.x = damp(e.rotation.x, -earUp * 0.4 + jump * 6, 10, dt);
    }
  }
}

// ----------------------------------------------- first-person hand + tools
function makeBrush() {
  const g = new T.Group();
  // handle along +X
  const hG = new T.LatheGeometry([[0, -0.075], [0.006, -0.074], [0.0085, -0.06], [0.0095, 0.0], [0.0085, 0.05], [0.0075, 0.06], [0, 0.061]].map(([r, y]) => new T.Vector2(r, y)), 32);
  boxUV(hG, 0.08);
  const handle = meshFrom(hG, pbr('darkwood', { ns: 0.7 }));
  handle.rotation.z = -Math.PI / 2; g.add(handle);
  const fG = new T.CylinderGeometry(0.0085, 0.0078, 0.024, 32, 1);
  const ferrule = meshFrom(fG, new T.MeshStandardMaterial({ color: 0xb9b6ae, metalness: 1, roughness: 0.25 }));
  ferrule.rotation.z = -Math.PI / 2; ferrule.position.x = 0.07; g.add(ferrule);
  // bristles: thin ribbons fanning out
  const N = 220, SEG = 6;
  const pos = [], tt = [], seed = [], idx = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r0 = Math.sqrt(Math.random()) * 0.0072;
    const spread = 1.6 + Math.random() * 1.2;
    const len = 0.05 + Math.random() * 0.012;
    const w = 0.00045;
    const tA = a + Math.PI / 2;
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const r = r0 * (1 + (spread - 1) * t * t) + t * 0.002;
      const x = 0.08 + len * t;
      const y = Math.cos(a) * r, z = Math.sin(a) * r;
      const ww = w * (1 - t * 0.6);
      pos.push(x, y + Math.cos(tA) * ww, z + Math.sin(tA) * ww, x, y - Math.cos(tA) * ww, z - Math.sin(tA) * ww);
      tt.push(t, t); seed.push(Math.random(), Math.random());
      if (s < SEG) { const b = base + s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  const bg = new T.BufferGeometry();
  bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  bg.setAttribute('aT', new T.Float32BufferAttribute(tt, 1));
  bg.setAttribute('aSeed', new T.Float32BufferAttribute(seed, 1));
  bg.setIndex(idx);
  bg.computeVertexNormals();
  const bm = new T.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.55, side: T.DoubleSide });
  const U = { uBend: { value: new T.Vector3() }, uLoad: { value: 0 }, uPowder: { value: new T.Color(0.05, 0.05, 0.05) } };
  bm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aT; attribute float aSeed; varying float vT; varying float vSeed; uniform vec3 uBend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = aT; vSeed = aSeed; transformed += uBend * aT * aT * (0.8 + 0.4 * aSeed);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vT; varying float vSeed; uniform float uLoad; uniform vec3 uPowder;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.85 + 0.15 * vSeed; diffuseColor.rgb = mix(diffuseColor.rgb, uPowder, clamp(uLoad * (0.3 + vT) * (0.7 + 0.5 * vSeed), 0.0, 0.92));');
  };
  const bristles = new T.Mesh(bg, bm);
  bristles.castShadow = true;
  g.add(bristles);
  g.userData = { U, tip: 0.128, kind: 'brush' };
  return g;
}

function makeFlashlight() {
  const g = new T.Group();
  const alu = pbr('alu', { metal: true, ns: 1.0, env: 1.1 });
  const body = new T.LatheGeometry([[0, -0.06], [0.0105, -0.06], [0.0115, -0.055], [0.0115, 0.05], [0.0135, 0.065], [0.0145, 0.09], [0.0135, 0.095], [0, 0.095]].map(([r, y]) => new T.Vector2(r, y)), 40);
  const uv = body.attributes.uv, p = body.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, Math.atan2(p.getZ(i), p.getX(i)) * 0.03, p.getY(i) * 3);
  const m = meshFrom(body, alu); m.rotation.z = -Math.PI / 2; g.add(m);
  const lensM = new T.MeshStandardMaterial({ color: 0x1a1020, emissive: new T.Color(0.55, 0.25, 1.0), emissiveIntensity: 0.0, roughness: 0.1 });
  const lens = new T.Mesh(new T.CircleGeometry(0.012, 32), lensM);
  lens.rotation.y = Math.PI / 2; lens.position.x = 0.0955; g.add(lens);
  // LED dots
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, r = i ? 0.0065 : 0;
    const d = new T.Mesh(new T.CircleGeometry(0.0018, 12), new T.MeshBasicMaterial({ color: 0x000000 }));
    d.rotation.y = Math.PI / 2; d.position.set(0.0958, Math.cos(a) * r, Math.sin(a) * r); g.add(d);
    d.userData.led = true;
  }
  const btn = meshFrom(new T.CylinderGeometry(0.004, 0.004, 0.003, 16), new T.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
  btn.position.set(-0.02, 0.0118, 0); g.add(btn);
  // beam: soft additive cone
  const beamG = new T.ConeGeometry(0.16, 0.7, 40, 1, true);
  beamG.translate(0, -0.35, 0); beamG.rotateZ(Math.PI / 2);
  const beamM = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { uOn: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOn; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ float along = clamp(vP.x / 0.7, 0.0, 1.0); float edge = pow(abs(dot(vN, vV)), 1.5); float f = (1.0 - along) * edge * uOn; gl_FragColor = vec4(vec3(0.35, 0.18, 0.8) * f * 0.12, 1.0); }',
  });
  const beam = new T.Mesh(beamG, beamM);
  beam.position.x = 0.096; g.add(beam);
  const light = new T.SpotLight(0x8a5cff, 0, 4, 0.36, 0.65, 1.2);
  light.position.set(0.096, 0, 0);
  const tgt = new T.Object3D(); tgt.position.set(1, 0, 0); g.add(tgt); light.target = tgt;
  g.add(light);
  g.userData = { tip: 0.096, kind: 'flash', lensM, beamM, light };
  return g;
}

export class HandRig {
  constructor(hands) {
    this.root = new T.Group();
    scene.add(this.root);
    this.grip = new T.Group(); this.root.add(this.grip);
    const handM = triMat({ A: 'skin', B: 'skin', sA: 45, sB: 45, nA: 0.7, nB: 0.25, rA: 0.52, rB: 0.22, key: 'hand', physical: { sheen: 0.5, sheenColor: new T.Color(1.0, 0.42, 0.32), sheenRoughness: 0.45 } });
    this.gripMesh = meshFrom(hands.grip, handM); this.grip.add(this.gripMesh);
    // sleeve (trench coat, beige twill) continuing the forearm
    const sl = new T.CylinderGeometry(0.036, 0.05, 0.42, 40, 30, true);
    sl.translate(0, -0.21, 0);
    const sp = sl.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const a = Math.atan2(z, x);
      const fold = Math.sin(y * 70 + Math.sin(a * 3) * 2.0) * 0.0035 * (0.6 + 0.4 * Math.sin(a * 2 + y * 9)) + Math.sin(a * 5 + y * 20) * 0.0015;
      const r = Math.hypot(x, z) + fold;
      sp.setXYZ(i, Math.cos(a) * r * 1.12, y, Math.sin(a) * r * 0.86);
    }
    sl.computeVertexNormals();
    const su = sl.attributes.uv;
    for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * 0.26 / 0.12, su.getY(i) * 0.42 / 0.12);
    const sleeveM = pbr('twill', { ns: 1.2, color: 0xffffff, side: T.DoubleSide, physical: { sheen: 0.4, sheenColor: new T.Color(0.6, 0.55, 0.45) } });
    this.sleeve = meshFrom(sl, sleeveM);
    this.sleeve.position.set(0, -0.13, -0.028);
    const cuff = meshFrom(new T.TorusGeometry(0.039, 0.005, 12, 48), sleeveM);
    cuff.rotation.x = Math.PI / 2; cuff.scale.set(1.12, 0.86, 1); cuff.position.set(0, 0.0, 0);
    this.sleeve.add(cuff);
    this.grip.add(this.sleeve);
    // flat hand for stamping (palm down, fingers +Z)
    this.flat = new T.Group(); this.root.add(this.flat);
    this.flatMesh = meshFrom(hands.flat, handM); this.flat.add(this.flatMesh);
    const s2 = meshFrom(sl.clone(), sleeveM); s2.rotation.x = Math.PI / 2; s2.position.set(0, 0.02, -0.12);
    this.flat.add(s2);
    this.flat.visible = false;
    // powder on the palm after stamping
    this.tools = { brush: makeBrush(), flash: makeFlashlight() };
    for (const t of Object.values(this.tools)) { t.visible = false; this.grip.add(t); }
    this.tool = null;
    this.setTool('brush');
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.pos = V3(); this.quat = new T.Quaternion();
    this.tipTarget = V3(); this.normal = V3(0, 0, 1);
    this.active = false; this.visible = true;
    this.vel = V3(); this.prevTip = V3();
    this.mode = 'grip';
    this.stamp = 0;
  }
  setTool(name) {
    for (const [k, t] of Object.entries(this.tools)) t.visible = k === name;
    this.tool = this.tools[name];
    this.toolName = name;
    // brush handle sits in the fist, flashlight body too: offset along X
    this.tool.position.x = name === 'brush' ? -0.005 : -0.01;
  }
  // compute pose: tip at point p with surface normal n
  aim(p, n, dt, opts = {}) {
    const camR = V3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camU = V3().setFromMatrixColumn(camera.matrixWorld, 1);
    const camB = V3().setFromMatrixColumn(camera.matrixWorld, 2);
    let X, origin;
    if (this.toolName === 'flash') {
      const anchor = camera.position.clone().addScaledVector(camB, -0.42).addScaledVector(camR, 0.15).addScaledVector(camU, -0.17);
      // drift slightly toward the target
      anchor.lerp(p, 0.08);
      X = p.clone().sub(anchor).normalize();
      origin = anchor;
    } else {
      const shoulder = camera.position.clone().addScaledVector(camR, 0.3).addScaledVector(camU, -0.18).addScaledVector(camB, 0.05);
      X = p.clone().sub(shoulder).normalize();
      // lay the bristles against the surface a little
      X.addScaledVector(n, -0.35 * (opts.press ?? 1)).normalize();
      origin = p.clone().addScaledVector(X, -(this.tool.userData.tip + this.tool.position.x)).addScaledVector(n, 0.012);
    }
    let F = camR.clone().multiplyScalar(0.75).addScaledVector(camU, -0.55).addScaledVector(camB, 0.45).normalize();
    F.addScaledVector(X, -F.dot(X)).normalize();
    const Y = F.clone().negate();
    const Z = V3().crossVectors(X, Y);
    const m = new T.Matrix4().makeBasis(X, Y, Z);
    const q = new T.Quaternion().setFromRotationMatrix(m);
    const k = opts.snap ? 1 : 1 - Math.exp(-dt * (opts.k ?? 18));
    this.pos.lerp(origin, k);
    this.quat.slerp(q, k);
    this.grip.position.copy(this.pos);
    this.grip.quaternion.copy(this.quat);
  }
  // flat hand stamping pose: palm centre at p on a surface with normal n
  aimFlat(p, n, lift, dt) {
    const camR = V3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camB = V3().setFromMatrixColumn(camera.matrixWorld, 2);
    const up = n.clone();
    let fwd = camB.clone().negate(); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    fwd.applyAxisAngle(up, 0.35);
    const side = V3().crossVectors(up, fwd);
    const m = new T.Matrix4().makeBasis(side, up, fwd);
    const q = new T.Quaternion().setFromRotationMatrix(m);
    const target = p.clone().addScaledVector(up, 0.002 + lift).addScaledVector(fwd, -0.035);
    const k = 1 - Math.exp(-dt * 16);
    this.flat.position.lerp(target, k);
    this.flat.quaternion.slerp(q, k);
  }
  rest(dt) {
    // idle: hold the tool low at the bottom right of the view
    const camR = V3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camU = V3().setFromMatrixColumn(camera.matrixWorld, 1);
    const camB = V3().setFromMatrixColumn(camera.matrixWorld, 2);
    const p = camera.position.clone().addScaledVector(camB, -0.42).addScaledVector(camR, 0.09).addScaledVector(camU, -0.1);
    this.aim(p, camB, dt, { k: 5, press: 0 });
  }
  useFlat(on) {
    this.mode = on ? 'flat' : 'grip';
    this.flat.visible = on && this.visible; this.grip.visible = !on && this.visible;
  }
  show(v) { this.visible = v; this.root.visible = v; }
}

export async function loadActors() {
  const [hands, girl, papa, dog] = await Promise.all([loadMeshPack('hands'), loadMeshPack('girl'), loadMeshPack('papa'), loadMeshPack('dog')]);
  A.girl = new Girl(girl);
  A.papa = new Papa(papa);
  A.dog = new Dog(dog);
  A.hand = new HandRig(hands);
  // soft contact shadows that travel with each character
  contactShadow(0, 0, 0, 0.42, 0.34, 0.75, A.girl.root);
  contactShadow(0, 0, 0, 0.7, 0.5, 0.75, A.papa.root);
  contactShadow(0, 0, -0.03, 0.34, 0.42, 0.85, A.dog.root);
  return A;
}
