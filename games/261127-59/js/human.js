// Skinned people built from baked SDF meshes + procedural animation (walk, scoop, carry, trip, clap...)
import { T, scene, tex } from './core.js';
import { loadBin, clothMaterial } from './sdf.js';
import { BONE_PARENT } from './shapes.js';

export const humanMat = clothMaterial({ sheen: 0.25, sheenRoughness: 0.7, sheenColor: new T.Color(0.35, 0.33, 0.3) });

export class Person {
  constructor(name) {
    this.name = name;
    this.root = new T.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.action = 'idle'; this.t = 0; this.phase = 0; this.speed = 0;
    this.path = null; this.onArrive = null;
    this.extra = {};
    this.ready = false;
  }
  async load(binName) {
    const headName = binName.replace('_gloved', '') + '_head';
    const [geo, js, hgeo] = await Promise.all([loadBin('bin/' + binName + '.bin'), fetch('bin/' + binName + '.json').then((r) => r.json()), this.headGeo ? Promise.resolve(this.headGeo) : loadBin('bin/' + headName + '.bin')]);
    this.headGeo = hgeo;
    const rest = js.bones;
    const bones = rest.map(() => new T.Bone());
    rest.forEach((p, i) => {
      const par = BONE_PARENT[i];
      if (par < 0) bones[i].position.set(p[0], p[1], p[2]);
      else bones[i].position.set(p[0] - rest[par][0], p[1] - rest[par][1], p[2] - rest[par][2]);
      if (par >= 0) bones[par].add(bones[i]);
    });
    const mesh = new T.SkinnedMesh(geo, humanMat);
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(bones));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const head = new T.Mesh(hgeo, humanMat);
    head.castShadow = true; head.receiveShadow = true;
    bones[4].add(head);
    head.position.set(-js.head[0], -js.head[1], -js.head[2]);
    this.head = head;
    if (this.mesh) { this.root.remove(this.mesh); }
    this.mesh = mesh; this.bones = bones; this.rest = rest;
    this.root.add(mesh);
    this.ready = true;
    return this;
  }
  // attach an object to a bone (hat on head etc.)
  attach(obj, boneIndex, pos) { this.bones[boneIndex].add(obj); obj.position.copy(pos); }
  walkTo(points, speed, onArrive) { this.path = points.map((p) => p.clone()); this.speed = speed; this.onArrive = onArrive; if (this.action !== 'carry') this.action = 'walk'; }
  set(action) { this.action = action; this.t = 0; }
  update(dt) {
    if (!this.ready) return;
    this.t += dt;
    const B = this.bones;
    for (const b of B) b.rotation.set(0, 0, 0);
    B[0].position.set(this.rest[0][0], this.rest[0][1], this.rest[0][2]);
    const r = this.root;
    let moving = false;
    if (this.path && this.path.length) {
      const target = this.path[0];
      const dx = target.x - r.position.x, dz = target.z - r.position.z, d = Math.hypot(dx, dz);
      if (d < 0.05) {
        this.path.shift();
        if (!this.path.length) { this.path = null; if (this.action === 'walk') this.action = 'idle'; const cb = this.onArrive; this.onArrive = null; cb && cb(); }
      } else {
        const step = Math.min(d, this.speed * dt);
        r.position.x += (dx / d) * step; r.position.z += (dz / d) * step;
        const yaw = Math.atan2(dx, dz);
        let dy = yaw - r.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        r.rotation.y += dy * Math.min(1, dt * 6);
        moving = true;
      }
    }
    const H = this.rest[0][1]; // hip height for scaling motions
    const s = H / 0.97;
    // ---- legs / walk cycle
    if (moving) {
      this.phase += dt * this.speed / (0.62 * s) * Math.PI;
      const p = this.phase;
      for (const [th, sh, ft, ph] of [[11, 12, 13, 0], [14, 15, 16, Math.PI]]) {
        const a = Math.sin(p + ph);
        B[th].rotation.x = -a * 0.42;
        B[sh].rotation.x = Math.max(0, Math.sin(p + ph - 1.2)) * 0.75 + 0.05;
        B[ft].rotation.x = -Math.max(0, -Math.sin(p + ph)) * 0.25;
      }
      B[0].position.y = this.rest[0][1] - Math.abs(Math.cos(this.phase)) * 0.025 * s + 0.012 * s;
      B[0].rotation.y = Math.sin(this.phase) * 0.08;
      B[2].rotation.y = -Math.sin(this.phase) * 0.1;
      if (this.action !== 'carry') {
        B[5].rotation.x = Math.sin(this.phase) * 0.35; B[8].rotation.x = -Math.sin(this.phase) * 0.35;
        B[6].rotation.x = -0.25; B[9].rotation.x = -0.25;
      }
    }
    // arms hang naturally from the baked A-pose
    B[5].rotation.z += -0.26; B[8].rotation.z += 0.26;
    const t = this.t;
    switch (this.action) {
      case 'idle': {
        B[2].rotation.x = Math.sin(t * 1.6) * 0.012;
        B[4].rotation.y = Math.sin(t * 0.4) * 0.12;
        B[6].rotation.x = -0.12; B[9].rotation.x = -0.12;
        break;
      }
      case 'look': { B[4].rotation.x = 0.25; B[1].rotation.x = 0.1; break; }
      case 'scoop': { // squat down and gather with both arms
        const k = Math.min(1, t / 0.7);
        B[0].position.y = this.rest[0][1] - 0.32 * s * k;
        B[11].rotation.x = -1.2 * k; B[14].rotation.x = -1.2 * k;
        B[12].rotation.x = 1.9 * k; B[15].rotation.x = 1.9 * k;
        B[13].rotation.x = -0.6 * k; B[16].rotation.x = -0.6 * k;
        B[1].rotation.x = 0.45 * k; B[2].rotation.x = 0.25 * k;
        B[5].rotation.x = -1.0 * k; B[8].rotation.x = -1.0 * k;
        B[5].rotation.z += 0.25 * k; B[8].rotation.z -= 0.25 * k;
        B[6].rotation.x = -0.4 * k; B[9].rotation.x = -0.4 * k;
        break;
      }
      case 'carry': { // hugging a big armful
        B[5].rotation.x = -1.05; B[8].rotation.x = -1.05;
        B[5].rotation.z += 0.32; B[8].rotation.z -= 0.32;
        B[6].rotation.x = -0.9; B[9].rotation.x = -0.9;
        B[6].rotation.y = 0.9; B[9].rotation.y = -0.9;
        B[2].rotation.x = -0.12; B[4].rotation.x = -0.15;
        break;
      }
      case 'fall': { // trip forward onto the ground
        const k = Math.min(1, t / 0.55);
        const e = k * k;
        r.rotation.x = 0;
        B[0].rotation.x = 1.38 * e;
        B[0].position.y = this.rest[0][1] - (this.rest[0][1] - 0.16 * s) * e;
        B[0].position.z = 0.55 * s * e;
        B[5].rotation.x = -2.6 * e; B[8].rotation.x = -2.4 * e;
        B[11].rotation.x = 0.3 * e; B[14].rotation.x = -0.2 * e; B[12].rotation.x = 0.5 * e; B[15].rotation.x = 0.9 * e;
        B[4].rotation.x = -0.6 * e;
        if (t > 0.6) { B[16].rotation.x = Math.sin(t * 9) * 0.3; B[13].rotation.x = Math.cos(t * 7) * 0.2; }
        break;
      }
      case 'getup': {
        const k = Math.min(1, t / 1.1);
        const e = 1 - (1 - k) * (1 - k);
        const inv = 1 - e;
        B[0].rotation.x = 1.38 * inv;
        B[0].position.y = 0.16 * s + (this.rest[0][1] - 0.16 * s) * e;
        B[0].position.z = 0.55 * s * inv;
        B[5].rotation.x = -1.2 * inv; B[8].rotation.x = -1.2 * inv;
        B[11].rotation.x = -0.9 * Math.sin(e * Math.PI); B[12].rotation.x = 1.4 * Math.sin(e * Math.PI);
        break;
      }
      case 'scratch': { // embarrassed head scratch
        B[8].rotation.x = -2.5; B[8].rotation.z -= 0.3; B[9].rotation.x = -1.9;
        B[9].rotation.y = Math.sin(t * 14) * 0.15;
        B[4].rotation.z = 0.18; B[4].rotation.x = 0.12;
        B[2].rotation.x = 0.05;
        break;
      }
      case 'clap': {
        const c = Math.abs(Math.sin(t * 7));
        B[5].rotation.x = -1.1; B[8].rotation.x = -1.1;
        B[5].rotation.z += 0.15 + 0.25 * c; B[8].rotation.z -= 0.15 + 0.25 * c;
        B[6].rotation.x = -0.9; B[9].rotation.x = -0.9;
        B[6].rotation.y = 0.8; B[9].rotation.y = -0.8;
        B[4].rotation.x = Math.sin(t * 7) * 0.05;
        B[0].position.y += Math.abs(Math.sin(t * 7)) * 0.01;
        break;
      }
      case 'cheer': { // hop with both arms up
        const hop = Math.max(0, Math.sin(t * 6.5));
        B[0].position.y += hop * 0.09 * s;
        B[5].rotation.z += 2.3; B[8].rotation.z -= 2.3;
        B[6].rotation.z = 0.3; B[9].rotation.z = -0.3;
        B[11].rotation.x = -hop * 0.3; B[14].rotation.x = -hop * 0.3; B[12].rotation.x = hop * 0.6; B[15].rotation.x = hop * 0.6;
        break;
      }
      case 'nod': { B[4].rotation.x = Math.max(0, Math.sin(t * 6)) * 0.3; B[6].rotation.x = -0.15; B[9].rotation.x = -0.15; break; }
      case 'puzzled': { // "are?" : head tilt, hand to chin
        const k = Math.min(1, t / 0.4);
        B[4].rotation.z = 0.32 * k; B[4].rotation.x = 0.1 * k;
        B[8].rotation.x = -1.5 * k; B[9].rotation.x = -1.9 * k; B[9].rotation.y = -0.6 * k;
        B[1].rotation.z = -0.05 * k;
        break;
      }
      case 'wave': {
        B[8].rotation.z -= 2.4; B[9].rotation.z = -0.4 + Math.sin(t * 8) * 0.35;
        B[4].rotation.z = 0.08;
        break;
      }
      case 'thumb': {
        B[8].rotation.x = -1.3; B[9].rotation.x = -1.2; B[4].rotation.x = Math.max(0, Math.sin(t * 5)) * 0.2;
        break;
      }
      case 'sweepIdle': {
        B[8].rotation.x = -0.5; B[9].rotation.x = -0.8; B[5].rotation.x = -0.6; B[6].rotation.x = -0.9;
        B[1].rotation.x = 0.12 + Math.sin(t * 3) * 0.05; B[0].rotation.y = Math.sin(t * 3) * 0.2;
        break;
      }
      case 'sit': {
        B[0].position.y = 0.46 * s;
        B[11].rotation.x = -1.5; B[14].rotation.x = -1.5; B[12].rotation.x = 1.5; B[15].rotation.x = 1.5;
        B[6].rotation.x = -0.6; B[9].rotation.x = -0.6;
        break;
      }
    }
    if (this.extra.hopT > 0) { this.extra.hopT -= dt; B[0].position.y += Math.sin((1 - this.extra.hopT / 0.45) * Math.PI) * 0.08 * s; }
  }
  hop() { this.extra.hopT = 0.45; }
}

// pillbox bellhop cap (felt + gold braid + chin strap) for the girl
export function makeCap() {
  const g = new T.Group();
  const felt = new T.MeshStandardMaterial({ color: new T.Color(0.36, 0.05, 0.07), roughness: 0.92, normalMap: tex('twill_normal.jpg'), normalScale: new T.Vector2(0.6, 0.6) });
  const prof = [];
  const R = 0.062, H = 0.052;
  prof.push(new T.Vector2(0.0, H), new T.Vector2(R - 0.012, H), new T.Vector2(R - 0.003, H - 0.003), new T.Vector2(R, H - 0.012), new T.Vector2(R + 0.003, 0.004), new T.Vector2(R + 0.002, 0), new T.Vector2(R - 0.004, 0));
  const body = new T.Mesh(new T.LatheGeometry(prof, 40), felt);
  const gold = new T.MeshStandardMaterial({ color: new T.Color(0.78, 0.6, 0.3), metalness: 1, roughness: 0.38, normalMap: tex('knit_normal.jpg'), normalScale: new T.Vector2(0.8, 0.8) });
  const band = new T.Mesh(new T.CylinderGeometry(R + 0.0045, R + 0.0055, 0.012, 40, 1, true), gold);
  band.position.y = 0.01;
  const top = new T.Mesh(new T.TorusGeometry(R - 0.01, 0.0025, 6, 40), gold);
  top.rotation.x = Math.PI / 2; top.position.y = H - 0.001;
  const btn = new T.Mesh(new T.SphereGeometry(0.006, 10, 8), gold);
  btn.position.set(0, 0.012, R + 0.005);
  g.add(body, band, top, btn);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}
