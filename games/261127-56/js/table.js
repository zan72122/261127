// 場面3 後半：焼けた器を食卓へ。花を挿す・スープをよそう・みかんをのせる（好きなだけ）
import * as THREE from 'three';
import { POS, contactShadow, lathe } from './room.js';
import { tex, pbr } from './assets.js';
import { makePotMaterial } from './clay.js';

// 椿の枝（つやのある濃い緑の葉、赤い花、黄色いしべ）
function leafGeo() {
  const g = new THREE.PlaneGeometry(1, 1, 6, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.5;
    const w = Math.sin(Math.PI * Math.pow(y, 0.8)) * 0.5 * (1 - 0.15 * y);
    p.setXYZ(i, x * 2 * w, y, -Math.abs(x) * w * 0.5 + 0.08 * Math.sin(y * Math.PI));
  }
  g.computeVertexNormals();
  return g;
}
function petalGeo() {
  const g = new THREE.PlaneGeometry(1, 1, 6, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.5;
    const w = Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, y * 0.95 + 0.05)))) * 0.55;
    p.setXYZ(i, x * 2 * w, y, -(x * x) * 0.6 + y * y * 0.25);
  }
  g.computeVertexNormals();
  return g;
}
let LG = null, PG = null;
export function makeCamellia(seed = 1) {
  LG ||= leafGeo(); PG ||= petalGeo();
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.85, normalMap: tex('iron', 'n'), normalScale: new THREE.Vector2(0.5, 0.5) });
  const leafM = new THREE.MeshPhysicalMaterial({ color: 0x1f3a1c, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide, normalMap: tex('skin', 'n'), normalScale: new THREE.Vector2(0.3, 0.3) });
  const petalM = new THREE.MeshPhysicalMaterial({ color: 0xb01a24, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0.35, 0.05, 0.06), sheenRoughness: 0.4, side: THREE.DoubleSide });
  const stamenM = new THREE.MeshStandardMaterial({ color: 0xe8c040, roughness: 0.6, emissive: 0x2a1a00 });
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let b = 0; b < 3; b++) {
    const a = (b - 1) * 0.35 + (rnd() - 0.5) * 0.2;
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.sin(a) * 0.03, 0.08, Math.cos(a) * 0.01), new THREE.Vector3(Math.sin(a) * 0.07, 0.15 + rnd() * 0.04, 0.02 * (rnd() - 0.5))];
    const curve = new THREE.CatmullRomCurve3(pts);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0035, 6), bark);
    stem.castShadow = true; g.add(stem);
    for (let l = 0; l < 4; l++) {
      const t = 0.35 + l * 0.17;
      const p = curve.getPoint(t);
      const leaf = new THREE.Mesh(LG, leafM);
      leaf.scale.setScalar(0.05 + rnd() * 0.02);
      leaf.position.copy(p);
      leaf.rotation.set(-0.6 - rnd() * 0.5, l * 2.2 + rnd(), (rnd() - 0.5) * 0.8);
      leaf.castShadow = true; g.add(leaf);
    }
    // 花
    const top = curve.getPoint(1);
    const fl = new THREE.Group(); fl.position.copy(top); fl.rotation.set(-0.3 + rnd() * 0.3, rnd() * 6, (rnd() - 0.5) * 0.4);
    const n = 7;
    for (let k = 0; k < n; k++) {
      const pt = new THREE.Mesh(PG, petalM);
      pt.scale.setScalar(0.028 + rnd() * 0.006);
      pt.rotation.set(-1.0 + rnd() * 0.3, k / n * Math.PI * 2, 0, 'YXZ');
      pt.castShadow = true; fl.add(pt);
    }
    for (let k = 0; k < 5; k++) {
      const pt = new THREE.Mesh(PG, petalM); pt.scale.setScalar(0.02); pt.rotation.set(-0.45, k / 5 * Math.PI * 2 + 0.3, 0, 'YXZ'); fl.add(pt);
    }
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.014, 14), stamenM); st.position.y = 0.008; fl.add(st);
    g.add(fl);
  }
  return g;
}
function makeMikan() {
  const m = new THREE.Group();
  const peel = new THREE.MeshPhysicalMaterial({ color: 0xe0741a, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, normalMap: tex('grain', 'n', { repeat: [3, 3] }), normalScale: new THREE.Vector2(1.2, 1.2), sheen: 0.4, sheenColor: new THREE.Color(0.3, 0.15, 0.05) });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.032, 28, 20), peel); b.scale.set(1, 0.82, 1); b.castShadow = true; b.receiveShadow = true; m.add(b);
  const cal = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.004, 8), new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 0.7 })); cal.position.y = 0.026; m.add(cal);
  return m;
}

export class TableStage {
  constructor(ctx) { this.ctx = ctx; this.name = 'table'; this.built = false; this.made = []; }
  build() {
    const C = this.ctx;
    const T = POS.table, top = 0.74;
    this.top = top;
    const g = new THREE.Group(); g.position.set(T.x, 0, T.z); C.room.add(g); this.g = g;
    // 花の入った古い水差し
    const jugM = new THREE.MeshPhysicalMaterial({ color: 0x8e9a8c, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: tex('grain', 'n', { repeat: [2, 2] }), normalScale: new THREE.Vector2(0.2, 0.2) });
    this.jug = new THREE.Group(); this.jug.position.set(-0.26, top, -0.1); g.add(this.jug);
    lathe([[0, 0], [0.04, 0], [0.045, 0.01], [0.052, 0.07], [0.035, 0.13], [0.03, 0.15], [0.034, 0.16], [0.03, 0.162], [0.026, 0.14], [0.044, 0.07], [0.038, 0.012], [0, 0.014]], 36, jugM, this.jug);
    const fl = makeCamellia(3); fl.position.y = 0.08; this.jug.add(fl);
    contactShadow(g, -0.26, -0.1, 0.16, 0.16, 0.6, top + 0.001);
    // スープの鍋（ほうろう）
    const potM = new THREE.MeshPhysicalMaterial({ color: 0x9b2f22, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.soup = new THREE.Group(); this.soup.position.set(0.27, top, -0.1); g.add(this.soup);
    lathe([[0, 0], [0.1, 0], [0.11, 0.01], [0.112, 0.11], [0.118, 0.115], [0.114, 0.118], [0.104, 0.112], [0.102, 0.012], [0, 0.012]], 40, potM, this.soup);
    const soupM = new THREE.MeshStandardMaterial({ color: 0xa8480a, roughness: 0.78, normalMap: tex('plaster', 'n', { repeat: [3, 3] }), normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 0.3 });
    this.soupM = soupM;
    const ss = new THREE.Mesh(new THREE.CircleGeometry(0.102, 40), soupM); ss.rotation.x = -Math.PI / 2; ss.position.y = 0.085; this.soup.add(ss);
    for (const hx of [-1, 1]) { const hd = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 16, Math.PI), potM); hd.position.set(hx * 0.12, 0.1, 0); hd.rotation.set(0, hx > 0 ? 0 : Math.PI, Math.PI / 2); this.soup.add(hd); }
    // お玉
    const steel = new THREE.MeshPhysicalMaterial({ color: 0xc8c8c4, metalness: 1, roughness: 0.25, normalMap: tex('steel', 'n'), normalScale: new THREE.Vector2(0.3, 0.3) });
    this.ladle = new THREE.Group(); this.soup.add(this.ladle); this.ladle.position.set(0.03, 0.08, 0.02);
    const bowlL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel); bowlL.material.side = THREE.DoubleSide; this.ladle.add(bowlL);
    const hdl = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 8), steel); hdl.position.set(0.06, 0.1, 0); hdl.rotation.z = -0.5; this.ladle.add(hdl);
    contactShadow(g, 0.27, -0.1, 0.32, 0.32, 0.6, top + 0.001);
    // みかんのかご
    const basketM = pbr('linen', { color: 0xb08a50, repeat: [6, 2], ns: 2.5 });
    this.basket = new THREE.Group(); this.basket.position.set(-0.05, top, -0.27); g.add(this.basket);
    lathe([[0, 0], [0.08, 0], [0.095, 0.01], [0.11, 0.05], [0.104, 0.052], [0.088, 0.014], [0, 0.014]], 32, basketM, this.basket);
    for (let i = 0; i < 4; i++) { const m = makeMikan(); m.position.set(Math.cos(i * 1.7) * 0.04, 0.038 + (i === 3 ? 0.03 : 0), Math.sin(i * 1.7) * 0.04); m.rotation.y = i; this.basket.add(m); }
    contactShadow(g, -0.05, -0.27, 0.26, 0.26, 0.6, top + 0.001);
    // もういっかい用の土（ぬれた布の上）
    const clothM = pbr('linen', { color: 0xa79f94, repeat: [4, 4], side: THREE.DoubleSide });
    this.lump = new THREE.Group(); this.lump.position.set(0.17, top, -0.3); g.add(this.lump);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16, 8, 8), clothM); cl.rotation.x = -Math.PI / 2; cl.position.y = 0.002;
    const cp = cl.geometry.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, 0.004 * Math.sin(cp.getX(i) * 60) * Math.cos(cp.getY(i) * 40)); cl.geometry.computeVertexNormals();
    this.lump.add(cl);
    const lumpM = new THREE.MeshPhysicalMaterial({ color: 0x5c3c28, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.3, map: tex('grain', 'c', { repeat: [2, 2] }), normalMap: tex('grain', 'n', { repeat: [2, 2] }) });
    const lg = new THREE.SphereGeometry(0.045, 32, 20); const lp = lg.attributes.position;
    for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i); const d = 1 + 0.08 * Math.sin(x * 90 + y * 40) * Math.cos(z * 70) ; lp.setXYZ(i, x * d, Math.max(-0.01, y * 0.75 * d), z * d); }
    lg.computeVertexNormals();
    const lm = new THREE.Mesh(lg, lumpM); lm.position.y = 0.012; lm.castShadow = true; this.lump.add(lm);
    contactShadow(g, 0.17, -0.3, 0.16, 0.14, 0.6, top + 0.003);
    // 湯気
    const steamT = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    this.steam = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamT, transparent: true, depthWrite: false, opacity: 0, color: 0xf2efea }));
      s.userData = { ph: Math.random(), sz: 0.5 + Math.random(), src: i < 13 ? 0 : 1 };
      C.scene.add(s); this.steam.push(s);
    }
    this.contents = new THREE.Group(); this.built = true;
  }
  enter() {
    const C = this.ctx;
    if (!this.built) this.build();
    C.setBusy(true);
    C.cutTo('table', () => {
      const h = C.clayHolder;
      h.removeFromParent(); C.scene.add(h);
      h.position.set(POS.table.x, this.top + 0.001, POS.table.z + 0.12); h.rotation.set(0, 0, 0);
      C.clay.mesh.rotation.set(0, 0.6, 0);
      const U = C.clay.material.userData.U; U.uHot.value = 0; U.uFired.value = 1;
      h.add(this.contents);
      this.clearContents();
      this.shadow ||= contactShadow(C.scene, 0, 0, 0.1, 0.1, 0.7, 0);
      const st = C.clay.stats();
      this.shadow.position.set(h.position.x, this.top + 0.0015, h.position.z); this.shadow.scale.setScalar(st.maxR * 26);
      // 家族はテーブルの向こう
      const { papa, mama, girl } = C.people;
      if (girl) girl.root.visible = false;
      if (papa) { papa.root.visible = true; papa.root.position.set(POS.table.x + 0.36, 0, POS.table.z - 0.8); papa.root.rotation.set(0, 0.12, 0); papa.parts.armR.rotation.set(0, 0, 0.05); papa.parts.armL.rotation.set(0, 0, -0.05); }
      if (mama) { mama.root.visible = true; mama.root.position.set(POS.table.x - 0.36, 0, POS.table.z - 0.76); mama.root.rotation.set(0, -0.1, 0); }
      C.focusTarget.set(POS.table.x, this.top + 0.06, POS.table.z + 0.1);
      C.post.aperture = 0.0045; C.post.exposure = 0.95;
      C.setHint(() => this.hintTarget(), 0.25);
      C.setBusy(false);
      C.after(0.6, () => { if (papa) C.clap(papa); if (mama) C.hop(mama, 1); C.say('すてき!', 'mama'); C.sfx.clap(); });
      this.kind = st.kind;
      this.t = 0;
    });
  }
  hintTarget() {
    if (this.busyAnim) return null;
    const order = [this.jug, this.soup, this.basket, this.lump];
    const tgt = order[(this.uses || 0) % 4];
    return tgt.localToWorld(new THREE.Vector3(0, 0.09, 0));
  }
  clearContents() { while (this.contents.children.length) this.contents.remove(this.contents.children[0]); this.filled = null; }
  down(p) {
    const C = this.ctx;
    if (C.busy || this.busyAnim) return;
    const hit = (o) => C.hitObjFat(o, p.x, p.y, 16);
    if (hit(this.jug)) this.put('flower');
    else if (hit(this.soup)) this.put('soup');
    else if (hit(this.basket)) this.put('mikan');
    else if (hit(this.lump)) this.again();
    else if (C.hitObj(C.clay.mesh, p.x, p.y)) { if (this.filled) { this.clearContents(); C.sfx.pour(); } else C.sfx.ping(); }
    else if (C.people.papa && hit(C.people.papa.root)) { C.hop(C.people.papa, 1); C.say('はーい', 'papa'); }
    else if (C.people.mama && hit(C.people.mama.root)) { C.hop(C.people.mama, 1); C.say('うふふ', 'mama'); }
  }
  put(what) {
    const C = this.ctx, clay = C.clay, st = clay.stats();
    this.uses = (this.uses || 0) + 1;
    this.clearContents();
    this.busyAnim = true;
    const H = st.top, yF = st.innerFloor;
    // 合う・合わない
    const fits = what === 'flower' ? (st.kind === 'vase' || st.kind === 'jar') : what === 'soup' ? (st.kind === 'bowl' || st.kind === 'jar') : (st.kind === 'plate' || st.kind === 'bowl');
    if (what === 'flower') {
      C.sfx.rustle();
      const f = makeCamellia(this.uses + 7);
      if (st.kind === 'plate' || st.kind === 'bowl') {
        // 浅い器：花だけを浮かべる
        f.scale.setScalar(0.9); f.rotation.x = -1.35; f.position.set(0, yF + 0.012, 0.0);
      } else { f.position.set(0, yF + 0.005, 0); f.scale.setScalar(Math.max(0.7, H / 0.16)); }
      this.anim = { obj: f, from: this.jug.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0)), target: f.position.clone(), t: 0 };
      this.contents.add(f);
    } else if (what === 'soup') {
      C.sfx.pour();
      // お玉で注ぐ → 器の内側の高さまで
      const level = yF + Math.max(0.006, (H - yF) * 0.72);
      const r = Math.max(0.01, clay.innerRAt(level) - 0.0015);
      const s = new THREE.Mesh(new THREE.CircleGeometry(r, 48), this.soupM); s.rotation.x = -Math.PI / 2; s.position.y = yF + 0.001;
      s.userData.level = level;
      this.anim = { obj: s, soup: true, t: 0, level, yF };
      this.contents.add(s);
      this.ladleAnim = 0;
    } else {
      C.sfx.plop();
      const n = st.kind === 'plate' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const m = makeMikan();
        if (st.kind === 'plate' || st.kind === 'bowl') m.position.set((i - 1) * 0.04, yF + 0.026, (i % 2) * 0.03 - 0.01);
        else m.position.set(0, H + 0.024, 0);
        this.contents.add(m);
      }
      this.anim = { obj: this.contents.children[0], t: 0, drop: true };
    }
    this.filled = what;
    // 反応（ぴったり → 大喜び／ちがう → 「あれ？」→ でもにっこり）
    const { papa, mama } = C.people;
    C.after(1.3, () => {
      if (fits) {
        C.sfx.chime(); if (papa) C.clap(papa, 4); if (mama) C.hop(mama, 2);
        C.say(what === 'soup' ? 'おいしそう!' : what === 'flower' ? 'きれい!' : 'いいね!', 'mama');
      } else {
        if (papa) C.tilt(papa); if (mama) C.tilt(mama);
        C.say('あれ?', 'papa');
        C.after(1.4, () => { if (mama) C.clap(mama, 3); if (papa) C.nod(papa); C.say('それも いいね!', 'mama'); C.sfx.clap(); });
      }
    });
    C.after(2.2, () => { this.busyAnim = false; });
  }
  again() {
    const C = this.ctx;
    C.sfx.squish(); C.say('もういっかい!', 'girl');
    // できた器は棚へ
    const keep = new THREE.Mesh(C.clay.geo.clone(), snapshotMaterial(C));
    keep.castShadow = keep.receiveShadow = true;
    const shelf = C.anim.shelf;
    const n = this.made.length;
    keep.position.set(0.0, 1.35 + 0.016, -0.5 + (n % 5) * 0.24); keep.scale.setScalar(0.85);
    keep.position.x = -0.03;
    shelf.add(keep); this.made.push(keep);
    // 次は前の段に
    this.clearContents();
    const { papa, mama } = C.people;
    if (papa) papa.root.visible = false; if (mama) mama.root.visible = false;
    C.restart();
  }
  update(dt) {
    const C = this.ctx;
    this.t += dt;
    if (this.anim) {
      const a = this.anim; a.t += dt;
      const k = Math.min(1, a.t / 0.9);
      if (a.soup) {
        a.obj.position.y = a.yF + 0.001 + (a.level - a.yF) * C.ease(k);
        const r0 = C.clay.innerRAt(a.obj.position.y) - 0.0015;
        a.obj.scale.setScalar(Math.max(0.2, r0 / Math.max(0.01, C.clay.innerRAt(a.level) - 0.0015)));
      } else if (a.from) {
        const w = this.contents.worldToLocal(a.from.clone());
        a.obj.position.lerpVectors(w, a.target, C.ease(k));
      } else if (a.drop) {
        a.obj.position.y += Math.max(0, (1 - k)) * 0.0;
      }
      if (k >= 1) this.anim = null;
    }
    // 湯気（スープの鍋と、よそった器）
    const srcs = [this.soup.localToWorld(new THREE.Vector3(0, 0.09, 0)), this.filled === 'soup' ? C.clayHolder.localToWorld(new THREE.Vector3(0, C.clay.stats().top * 0.75, 0)) : null];
    for (const s of this.steam) {
      const src = srcs[s.userData.src];
      if (!src) { s.material.opacity = 0; continue; }
      const ph = (s.userData.ph + this.t * 0.22 * (0.7 + s.userData.sz * 0.3)) % 1;
      s.position.set(src.x + Math.sin(ph * 7 + s.userData.ph * 30) * 0.03 * ph, src.y + ph * 0.28, src.z + Math.cos(ph * 5 + s.userData.ph * 10) * 0.02 * ph);
      s.scale.setScalar((0.015 + ph * 0.06) * s.userData.sz);
      s.material.opacity = Math.sin(ph * Math.PI) * 0.08 * Math.min(1, ph * 4);
    }
  }
  exit() { for (const s of this.steam) s.material.opacity = 0; }
}

// 棚に残す器：今の溝・釉薬・貫入を写しとった素材
function snapshotMaterial(C) {
  const m = makePotMaterial(null);
  const U = m.userData.U, S = C.clay.material.userData.U;
  const copyCanvas = (t) => { const c = document.createElement('canvas'); c.width = t.image.width; c.height = t.image.height; c.getContext('2d').drawImage(t.image, 0, 0); const n = new THREE.CanvasTexture(c); n.flipY = false; n.wrapS = THREE.RepeatWrapping; n.colorSpace = THREE.NoColorSpace; return n; };
  U.tGroove.value = copyCanvas(S.tGroove.value);
  const black = document.createElement('canvas'); black.width = black.height = 4; black.getContext('2d').fillRect(0, 0, 4, 4);
  U.tWet.value = new THREE.CanvasTexture(black); U.tSlip.value = U.tWet.value;
  const gd = S.tGlaze.value; const d2 = new Uint8Array(gd.image.data); const nt = new THREE.DataTexture(d2, gd.image.width, gd.image.height, THREE.RGBAFormat); nt.wrapS = THREE.RepeatWrapping; nt.magFilter = nt.minFilter = THREE.LinearFilter; nt.needsUpdate = true;
  U.tGlaze.value = nt; U.tCrack.value = copyCanvas(S.tCrack.value);
  U.uGlazeOn.value = 1; U.uFired.value = 1; U.uDry.value = 1; U.uBisque.value = 1;
  return m;
}
