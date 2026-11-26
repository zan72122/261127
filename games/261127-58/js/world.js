// world.js — the glass workshop at night and in the early-autumn morning.
// Real-world scale (metres). Everything is PBR with colour/normal/rough/AO maps.
import * as THREE from './three.module.min.js';
import { RoundedBoxGeometry } from './RoundedBoxGeometry.js';
import { pbr, loadTex, texSet, organic } from './core.js';

// planar UVs in metres / tile, chosen per vertex by dominant normal axis
export function worldUV(geo, tile = 1, offset = [0, 0], long = null) {
  // long: 'x' | 'y' | 'z' — the axis wood grain should follow (texture grain runs along v)
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  if (long === 'auto') {  // the longest box dimension
    geo.computeBoundingBox(); const b = geo.boundingBox, sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
    long = sx >= sy && sx >= sz ? 'x' : sy >= sz ? 'y' : 'z';
  }
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let a, b, an, bn;
    if (ax >= ay && ax >= az) { a = p.getZ(i); b = p.getY(i); an = 'z'; bn = 'y'; }
    else if (ay >= az) { a = p.getX(i); b = p.getZ(i); an = 'x'; bn = 'z'; }
    else { a = p.getX(i); b = p.getY(i); an = 'x'; bn = 'y'; }
    let u = a, v = b;
    if (an === long) { u = b; v = a; }
    uv.setXY(i, u / tile + offset[0], v / tile + offset[1]);
  }
  uv.needsUpdate = true;
  return geo;
}
export function rbox(w, h, d, r = 0.01, tile = 1, seg = 2, grain = false) {
  return worldUV(new RoundedBoxGeometry(w, h, d, seg, r), tile, [0, 0], grain ? 'auto' : null);
}
function lathe(points, segs, tileU, tileV) {
  const g = new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), segs);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tileU, uv.getY(i) * tileV);
  return g;
}
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
// soft contact shadow (ground AO) decal
let blobTex = null;
function blob(w, d, strength = 0.55) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: strength, depthWrite: false, color: 0x000000 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1;
  return m;
}

export class World {
  constructor(renderer) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.time = 0;
    this.mats = {};
    this.buildMaterials();
    this.buildRoom();
    this.buildFurnace();
    this.buildBench();
    this.buildCooling();
    this.buildWindow();
    this.buildProps();
    this.buildLights();
  }
  buildMaterials() {
    const M = this.mats;
    M.concrete = pbr('concrete', { repeat: [1, 1], roughness: 1, normalScale: 0.9 });
    M.brick = pbr('brick', { roughness: 1, normalScale: 1.2 });
    M.fire = pbr('firebrick', { roughness: 1, normalScale: 1.1 });
    M.oak = pbr('oak', { roughness: 0.95, normalScale: 0.7 });
    M.oakDark = pbr('oak', { color: 0x8a7a6a, roughness: 1, normalScale: 0.8 });
    M.pine = pbr('pine', { roughness: 0.9, normalScale: 0.7 });
    M.steel = pbr('steel', { metalness: 1, roughness: 0.85, normalScale: 0.5 });
    M.iron = pbr('iron', { metalness: 0.85, roughness: 1, normalScale: 0.8 });
    M.pipe = pbr('pipe', { color: 0x8a8682, metalness: 1, roughness: 0.75, normalScale: 0.4 });
    M.plaster = pbr('plaster', { roughness: 1, normalScale: 0.8 });
    M.paintWin = pbr('plaster', { color: 0x4a5a52, roughness: 0.7, normalScale: 0.4 });
    M.leather = pbr('leather', { roughness: 1, normalScale: 1 });
    M.terry = pbr('terry', { roughness: 1, normalScale: 1.4 });
    M.canvas = pbr('canvas', { color: 0xb8ae98, roughness: 1 });
    M.ceramic = pbr('plaster', { color: 0xf4efe6, roughness: 1, normalScale: 1.6 });
    M.brass = pbr('steel', { color: 0xd8b070, metalness: 1, roughness: 0.6 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.75 });
    texSet('steel').bind(M.rubber, [2, 2], { normalMap: 'n', roughnessMap: 'm' });
    M.enamel = pbr('steel', { color: 0x2e4a3c, metalness: 0.2, roughness: 0.55, normalScale: 0.3 });
    M.enamelIn = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.4, side: THREE.BackSide });
  }
  // --------------------------------------------------------------- room
  buildRoom() {
    const M = this.mats, R = this.root;
    const W = 8, D = 6.4, H = 3.4;
    const floor = mesh(worldUV(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), 2.2), M.concrete, { cast: false });
    R.add(floor); this.floor = floor;
    // back & left brick walls
    R.add(mesh(worldUV(new THREE.BoxGeometry(W, H, 0.2), 0.92), M.brick, { y: H / 2, z: -D / 2 - 0.1 }));
    R.add(mesh(worldUV(new THREE.BoxGeometry(0.2, H, D), 0.92), M.brick, { x: -W / 2 - 0.1, y: H / 2 }));
    R.add(mesh(worldUV(new THREE.BoxGeometry(W, H, 0.2), 1.8), M.plaster, { y: H / 2, z: D / 2 + 0.1 }));
    // ceiling with timber beams
    R.add(mesh(worldUV(new THREE.BoxGeometry(W, 0.1, D), 2), M.plaster, { y: H + 0.05, cast: false }));
    for (let i = -3; i <= 3; i++) R.add(mesh(rbox(0.16, 0.24, D, 0.01, 1.2,2, true), M.oakDark, { x: i * 1.15, y: H - 0.12, cast: false }));
    // skirting / floor drain strip detail
    R.add(mesh(rbox(W, 0.12, 0.03, 0.005, 1), M.iron, { y: 0.06, z: -D / 2 + 0.015 }));
  }
  // --------------------------------------------------------------- furnace + glory hole
  buildFurnace() {
    const M = this.mats, g = new THREE.Group();
    g.position.set(-2.35, 0, -2.25); g.rotation.y = 0.35;
    const w = 1.25, h = 1.55, d = 1.1;
    // body in firebrick with a steel angle frame
    const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h); shape.lineTo(-w / 2, h); shape.lineTo(-w / 2, 0);
    const hole = new THREE.Path(); hole.absarc(0, 1.0, 0.2, 0, Math.PI * 2, true); shape.holes.push(hole);
    const front = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 40 });
    front.computeVertexNormals(); worldUV(front, 0.46);
    g.add(mesh(front, M.fire, { z: d / 2 - 0.12 }));
    g.add(mesh(worldUV(new THREE.BoxGeometry(w, h, d - 0.12), 0.46), M.fire, { y: h / 2, z: -0.06 }));
    // tunnel + glowing chamber
    const glowTex = loadTex('glow_c.jpg', true, [2, 1]);
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(5.5, 3.2, 1.6), side: THREE.BackSide });
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 40, 1, true), this.glowMat);
    tunnel.rotation.x = Math.PI / 2; tunnel.position.set(0, 1.0, d / 2 - 0.25); g.add(tunnel);
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.21, 40), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(9, 5.4, 2.6) }));
    back.position.set(0, 1.0, d / 2 - 0.48); g.add(back);
    this.glowBack = back;
    // iron frame
    for (const sx of [-1, 1]) {
      g.add(mesh(rbox(0.06, h + 0.04, 0.06, 0.006, 0.6), M.iron, { x: sx * (w / 2 + 0.01), y: h / 2, z: d / 2 + 0.01 }));
      g.add(mesh(rbox(0.06, h + 0.04, 0.06, 0.006, 0.6), M.iron, { x: sx * (w / 2 + 0.01), y: h / 2, z: -d / 2 + 0.03 }));
    }
    g.add(mesh(rbox(w + 0.1, 0.06, d + 0.06, 0.006, 0.6), M.iron, { y: h + 0.02 }));
    // steel ring around the mouth
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.022, 14, 48), M.iron);
    ring.position.set(0, 1.0, d / 2 + 0.012); g.add(ring);
    // burner pipe & valve
    const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 16), M.iron);
    bp.rotation.z = Math.PI / 2; bp.position.set(0.75, 1.35, -0.2); bp.scale.y = 0.55; g.add(bp);

    // stand legs + floor shadow
    const b = blob(1.8, 1.6, 0.7); b.position.y = 0.003; g.add(b);
    this.root.add(g);
    this.furnace = g;
    this.mouth = new THREE.Vector3(0, 1.0, d / 2 + 0.05).applyMatrix4(g.matrix.compose(g.position, g.quaternion, g.scale));
    // second furnace (crucible) in the corner, partly seen
    const g2 = new THREE.Group(); g2.position.set(-3.3, 0, -0.9); g2.rotation.y = 1.2;
    g2.add(mesh(worldUV(new THREE.BoxGeometry(1.0, 1.25, 1.0), 0.46), M.fire, { y: 0.625 }));
    g2.add(mesh(rbox(0.6, 0.45, 0.06, 0.01, 0.5), M.iron, { y: 0.95, z: 0.53 }));
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.5, 0.8) }));
    slit.position.set(0, 0.72, 0.505); g2.add(slit);
    const b2 = blob(1.5, 1.5, 0.6); b2.position.y = 0.003; g2.add(b2);
    this.root.add(g2);
  }
  // --------------------------------------------------------------- glassblower's bench, pipe, marver, frit
  buildBench() {
    const M = this.mats, g = new THREE.Group(); this.bench = g;
    // seat plank + legs
    g.add(mesh(rbox(1.25, 0.05, 0.36, 0.012, 1.0,2, true), M.oak, { y: 0.56, z: 0.35 }));
    for (const sx of [-0.55, 0.55]) for (const sz of [0.22, 0.48]) g.add(mesh(rbox(0.05, 0.54, 0.05, 0.006, 0.5), M.steel, { x: sx, y: 0.27, z: sz }));
    // rails (the pipe rolls on these)
    for (const sx of [-0.32, 0.32]) {
      g.add(mesh(rbox(0.04, 0.04, 1.0, 0.004, 0.5), M.steel, { x: sx, y: 0.82, z: 0.1 }));
      g.add(mesh(rbox(0.035, 0.27, 0.035, 0.004, 0.5), M.steel, { x: sx, y: 0.69, z: -0.32 }));
      g.add(mesh(rbox(0.035, 0.27, 0.035, 0.004, 0.5), M.steel, { x: sx, y: 0.69, z: 0.52 }));
    }
    const b = blob(2.2, 1.3, 0.5); b.position.set(0, 0.003, 0.25); g.add(b);
    this.root.add(g);
    // marver (polished steel table) with the frit dishes
    const mv = new THREE.Group(); mv.position.set(0.86, 0, 0.3); this.marver = mv;
    mv.add(mesh(rbox(0.46, 0.04, 0.36, 0.008, 0.5), M.steel, { y: 0.77 }));
    for (const sx of [-0.2, 0.2]) for (const sz of [-0.15, 0.15]) mv.add(mesh(rbox(0.04, 0.75, 0.04, 0.006, 0.5), M.iron, { x: sx, y: 0.375, z: sz }));
    mv.add(mesh(rbox(0.42, 0.025, 0.32, 0.006, 0.5), M.iron, { y: 0.16 }));
    const b2 = blob(0.8, 0.7, 0.55); b2.position.y = 0.003; mv.add(b2);
    this.root.add(mv);
    // frit dishes: shallow steel pans filled with coloured crushed glass
    this.frits = [];
    const cols = [[38, 66, 160], [40, 118, 74], [196, 128, 40]];
    const fritT = texSet('frit');
    cols.forEach((c, i) => {
      const dish = new THREE.Group();
      const pan = new THREE.Mesh(lathe([[0, 0], [0.07, 0], [0.078, 0.004], [0.082, 0.022], [0.086, 0.024], [0.079, 0.0045], [0.0, 0.004]], 40, 3, 1), M.steel);
      pan.castShadow = true; pan.receiveShadow = true; dish.add(pan);
      // crushed coloured glass: glinting grains, uneven heap
      const pm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(`rgb(${c[0]},${c[1]},${c[2]})`).multiplyScalar(0.8), roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.3, envMapIntensity: 0.7 });
      pm.normalScale = new THREE.Vector2(2.2, 2.2);
      fritT.bind(pm, [1.3, 1.3]);
            const pg2 = new THREE.RingGeometry(0.0, 0.077, 64, 10).rotateX(-Math.PI / 2);
      const powder = new THREE.Mesh(pg2, pm);
      const pp = powder.geometry.attributes.position;
      for (let k = 0; k < pp.count; k++) {
        const x = pp.getX(k), z = pp.getZ(k), r = Math.hypot(x, z);
        const bump = Math.sin(x * 160 + i) * Math.cos(z * 140 - i) * 0.0012 + Math.sin(x * 420 + z * 380) * 0.0004;
        pp.setY(k, 0.012 + 0.009 * Math.pow(Math.max(0, 1 - r / 0.077), 0.7) + bump * (1 - r / 0.08));
      }
      powder.geometry.computeVertexNormals(); powder.receiveShadow = true;
      dish.add(powder);
      const x = [-0.15, -0.02, -0.09][i], z = [-0.08, -0.08, 0.05][i];
      dish.position.set(x, 0.79, z); dish.scale.setScalar(0.72);
      dish.userData = { col: c, home: dish.position.clone(), i };
      mv.add(dish);
      this.frits.push(dish);
    });
    // blowpipe on the rails
    this.pipe = new THREE.Group(); this.pipe.position.set(-0.2, 0.855, 0.1);
    const tubeMat = M.pipe;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.3, 20, 1, false).rotateZ(Math.PI / 2), tubeMat);
    tube.castShadow = true; this.pipe.add(tube);
    // wooden grip sleeve & brass mouthpiece
    this.pipe.add(mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.34, 24).rotateZ(Math.PI / 2), M.oak, { x: -0.38 }));
    this.pipe.add(mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.05, 20).rotateZ(Math.PI / 2), M.brass, { x: -0.67 }));
    // the end where the glass sits: heat-tinted, slightly flared
    this.pipeTip = mesh(new THREE.CylinderGeometry(0.0125, 0.011, 0.08, 20).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a3a40, metalness: 0.9, roughness: 0.45, emissive: 0x000000 }), { x: 0.62 });
    this.pipe.add(this.pipeTip);
    this.spin = new THREE.Group(); this.spin.position.x = 0.66; this.pipe.add(this.spin); // glass mounts here
    this.root.add(this.pipe);
    // blow hose (rubber) from the mouthpiece towards the girl
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.89, 0.855, 0.1), new THREE.Vector3(-1.0, 0.86, 0.25), new THREE.Vector3(-0.8, 0.95, 0.7), new THREE.Vector3(-0.35, 1.05, 1.2)]);
    this.hoseCurve = curve;
    const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.0085, 12), this.mats.rubber);
    hose.castShadow = true; this.hose = hose; this.root.add(hose);
    // towel bucket (for the eyebrow moment)
    const tb = new THREE.Group(); tb.position.set(1.0, 0.79, 0.38); tb.scale.setScalar(0.52); this.towelBucket = tb;
    const bk = new THREE.Mesh(lathe([[0, 0], [0.14, 0], [0.145, 0.01], [0.17, 0.3], [0.175, 0.305], [0.168, 0.3], [0.138, 0.012], [0, 0.012]], 40, 4, 1), M.steel);
    bk.castShadow = true; bk.receiveShadow = true; tb.add(bk);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.165, 32).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x3a4a48, roughness: 0.05, metalness: 0, transmission: 0.3, normalMap: loadTex('water_n.jpg', false, [2, 2]) }));
    water.position.y = 0.26; tb.add(water);
    this.towel = this.makeTowel(); this.towel.position.set(0, 0.29, 0.02); tb.add(this.towel);
    const bb = blob(0.5, 0.5, 0.5); bb.position.y = 0.003; tb.add(bb);
    this.root.add(tb);
  }
  makeTowel() {
    // folded wet terry towel draped over the bucket rim
    const g = new THREE.PlaneGeometry(0.34, 0.5, 30, 40);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const drape = y > 0.05 ? (y - 0.05) : 0;
      const z = Math.sin(x * 40 + y * 9) * 0.006 + Math.sin(y * 31) * 0.004;
      // fold over the rim: upper part hangs down the outside
      const t = Math.min(1, drape / 0.18);
      p.setXYZ(i, x, (y > 0.05 ? 0.05 - drape * 0.9 : y * 0.15) + z * 0.4, (y > 0.05 ? 0.17 + Math.sin(t * Math.PI * 0.5) * 0.02 : 0.17 * (y + 0.25) / 0.3) + z);
    }
    g.rotateY(Math.PI); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.mats.terry); m.castShadow = true; m.receiveShadow = true;
    this.mats.terry.side = THREE.DoubleSide;
    const grp = new THREE.Group(); grp.add(m);
    return grp;
  }
  // --------------------------------------------------------------- cooling corner: hot tray, water tub, annealing shelf
  buildCooling() {
    const M = this.mats, g = new THREE.Group(); this.cool = g;
    g.position.set(2.3, 0, -1.75);
    // steel work table holding the hot tray (on the left)
    g.add(mesh(rbox(0.7, 0.05, 0.6, 0.008, 0.5), M.steel, { x: -0.85, y: 0.79 }));
    for (const sx of [-0.3, 0.3]) for (const sz of [-0.25, 0.25]) g.add(mesh(rbox(0.045, 0.77, 0.045, 0.006, 0.5), M.iron, { x: -0.85 + sx, y: 0.385, z: sz }));
    const tray = mesh(rbox(0.5, 0.025, 0.32, 0.006, 0.4), M.iron, { x: -0.85, y: 0.83 });
    g.add(tray); this.hotTray = new THREE.Vector3(-0.85, 0.845, 0);
    // fire bricks on the tray (pieces rest on these)
    g.add(mesh(rbox(0.46, 0.012, 0.28, 0.004, 0.46), M.fire, { x: -0.85, y: 0.848 }));
    let bl = blob(1.1, 0.9, 0.55); bl.position.set(-0.85, 0.003, 0); g.add(bl);
    // wooden water tub on a block
    const tub = new THREE.Group(); tub.position.set(0.05, 0, 0.05); this.tub = tub;
    const R0 = 0.27, R1 = 0.31, Ht = 0.62;
    const staves = lathe([[0, 0.14], [R0, 0.14], [R1, 0.14 + Ht], [R1 - 0.025, 0.14 + Ht], [R0 - 0.025, 0.165], [0, 0.165]], 48, 6, 1);
    tub.add(mesh(staves, M.oak));
    for (const yy of [0.22, 0.6]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(R0 + (R1 - R0) * ((yy - 0.14) / Ht) + 0.004, 0.006, 8, 64), M.iron);
      band.rotation.x = Math.PI / 2; band.position.y = yy; band.scale.z = 3; tub.add(band);
    }
    tub.add(mesh(rbox(0.7, 0.14, 0.7, 0.01, 0.5,2, true), M.oakDark, { y: 0.07 }));
    this.waterY = 0.14 + Ht - 0.07;
    const wm = new THREE.MeshPhysicalMaterial({ color: 0x5a6a68, roughness: 0.04, transmission: 0.55, thickness: 0.3, ior: 1.33, normalMap: loadTex('water_n.jpg', false, [1.5, 1.5]), normalScale: new THREE.Vector2(0.4, 0.4), attenuationColor: new THREE.Color(0.5, 0.62, 0.58), attenuationDistance: 0.3 });
    this.waterMat = wm;
    const water = new THREE.Mesh(new THREE.CircleGeometry(R1 - 0.03, 48).rotateX(-Math.PI / 2), wm);
    water.position.y = this.waterY; tub.add(water); this.water = water;
    bl = blob(0.95, 0.95, 0.6); bl.position.y = 0.003; tub.add(bl);
    g.add(tub);
    this.tubCenter = new THREE.Vector3(); this.tubR = R1 - 0.04;
    // annealing / cooling shelf: steel rack with ceramic-fibre boards (on the right)
    const sh = new THREE.Group(); sh.position.set(0.95, 0, 0); this.shelf = sh;
    for (const sx of [-0.34, 0.34]) for (const sz of [-0.2, 0.2]) sh.add(mesh(rbox(0.035, 1.5, 0.035, 0.005, 0.5), M.iron, { x: sx, y: 0.75, z: sz }));
    this.shelfYs = [0.83, 1.22];
    for (const y of [0.3, ...this.shelfYs]) {
      sh.add(mesh(rbox(0.72, 0.03, 0.44, 0.005, 0.5), M.iron, { y: y - 0.025 }));
      sh.add(mesh(rbox(0.66, 0.025, 0.4, 0.006, 0.6), M.ceramic, { y: y - 0.004 }));
    }
    bl = blob(1.0, 0.8, 0.55); bl.position.y = 0.003; sh.add(bl);
    g.add(sh);
    this.root.add(g);
    g.updateMatrixWorld(true);
    tub.getWorldPosition(this.tubCenter);
    this.shelfSlots = [];
    for (const y of this.shelfYs) for (const x of [-0.2, 0, 0.2]) this.shelfSlots.push(sh.localToWorld(new THREE.Vector3(x, y + 0.009, 0.02)));
    this.traySlots = [-0.15, 0, 0.15].map(x => g.localToWorld(new THREE.Vector3(-0.85 + x, 0.855, 0)));
  }
  // --------------------------------------------------------------- east window wall with sill
  buildWindow() {
    const M = this.mats, g = new THREE.Group(); this.win = g;
    const X = 4.0, H = 3.4, D = 6.4;
    this.sillY = 0.86;
    const winZ = [-1.55, 0, 1.55], ww = 1.1, wy0 = 0.9, wy1 = 2.55;
    // wall pieces around openings
    const wall = (z0, z1, y0, y1) => { const w = z1 - z0, h = y1 - y0; if (w <= 0 || h <= 0) return; g.add(mesh(worldUV(new THREE.BoxGeometry(0.24, h, w), 1.8), M.plaster, { x: X + 0.12, y: (y0 + y1) / 2, z: (z0 + z1) / 2 })); };
    wall(-D / 2, D / 2, 0, wy0); wall(-D / 2, D / 2, wy1, H);
    let z = -D / 2;
    for (const c of winZ) { wall(z, c - ww / 2, wy0, wy1); z = c + ww / 2; }
    wall(z, D / 2, wy0, wy1);
    // frames, mullions, glass
    this.paneMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 0.004, ior: 1.5, transparent: false });
    for (const c of winZ) {
      const f = new THREE.Group(); f.position.set(X + 0.05, 0, c);
      const fw = 0.06;
      f.add(mesh(rbox(0.1, fw, ww, 0.008, 0.8), M.paintWin, { y: wy0 + fw / 2 }));
      f.add(mesh(rbox(0.1, fw, ww, 0.008, 0.8), M.paintWin, { y: wy1 - fw / 2 }));
      f.add(mesh(rbox(0.1, wy1 - wy0, fw, 0.008, 0.8), M.paintWin, { y: (wy0 + wy1) / 2, z: -ww / 2 + fw / 2 }));
      f.add(mesh(rbox(0.1, wy1 - wy0, fw, 0.008, 0.8), M.paintWin, { y: (wy0 + wy1) / 2, z: ww / 2 - fw / 2 }));
      f.add(mesh(rbox(0.07, wy1 - wy0, 0.035, 0.006, 0.8), M.paintWin, { y: (wy0 + wy1) / 2 }));
      for (const yy of [1.45, 2.0]) f.add(mesh(rbox(0.07, 0.035, ww, 0.006, 0.8), M.paintWin, { y: yy }));
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wy1 - wy0).rotateY(-Math.PI / 2), this.paneMat);
      pane.position.set(0.0, (wy0 + wy1) / 2, 0); pane.castShadow = false; f.add(pane);
      g.add(f);
    }
    // deep oak sill along the wall
    g.add(mesh(rbox(0.36, 0.045, D - 0.4, 0.01, 1.0,2, true), M.oak, { x: X - 0.1, y: this.sillY - 0.0225 }));
    g.add(mesh(rbox(0.04, 0.08, D - 0.4, 0.006, 1.0,2, true), M.oak, { x: X - 0.25, y: this.sillY - 0.08 }));
    this.sillX = X - 0.12;
    // outside view (sky + trees), rendered as an emissive backdrop
    this.skyNight = loadTex('sky_night.jpg'); this.skyMorning = loadTex('sky_morning.jpg');
    this.skyMat = new THREE.MeshBasicMaterial({ map: this.skyNight, color: new THREE.Color(0.6, 0.6, 0.6), fog: false });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(16, 8).rotateY(-Math.PI / 2), this.skyMat);
    sky.position.set(X + 6, 2.6, 0); g.add(sky);
    // outside ground strip (so the low sun has something to light)
    this.root.add(g);
  }
  // --------------------------------------------------------------- background richness
  buildProps() {
    const M = this.mats, R = this.root;
    // tool board on the back wall with hooks (gloves & goggles hang here at the start)
    const board = new THREE.Group(); board.position.set(0.62, 0, -3.15); this.board = board;
    board.add(mesh(rbox(0.95, 0.55, 0.03, 0.006, 1.0,2, true), M.oak, { y: 1.15 }));
    for (const hx of [-0.2, -0.1, 0.17, 0.36]) board.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 10).rotateX(Math.PI / 2), M.iron, { x: hx, y: 1.3, z: 0.05 }));
    // tongs and jacks hanging
    for (const [hx, L] of [[0.34, 0.42], [0.38, 0.36]]) board.add(mesh(rbox(0.012, L, 0.006, 0.002, 0.3), M.steel, { x: hx, y: 1.3 - L / 2, z: 0.04, rz: 0.04 * (hx - 0.36) * 20 }));
    R.add(board);
    // the rule sign (pictures only): gloves+goggles -> glowing ball -> water/shelf -> window sun
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#e9e1cf'; x.fillRect(0, 0, 1024, 512);
    // aged paint speckle
    for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},${50},${Math.random() * 0.08})`; x.fillRect(Math.random() * 1024, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 6); }
    x.strokeStyle = '#2b2b2b'; x.lineWidth = 14; x.strokeRect(14, 14, 996, 484);
    const panel = (cx, draw) => { x.save(); x.translate(cx, 256); draw(); x.restore(); };
    const arrow = (cx) => { x.fillStyle = '#3a3a3a'; x.beginPath(); x.moveTo(cx - 18, -24 + 256); x.lineTo(cx + 18, 256); x.lineTo(cx - 18, 24 + 256); x.fill(); };
    panel(130, () => { // glove + goggles
      x.fillStyle = '#c49a5a'; x.beginPath(); x.ellipse(-20, 30, 48, 70, 0, 0, Math.PI * 2); x.fill();
      for (let k = 0; k < 4; k++) { x.beginPath(); x.ellipse(-52 + k * 22, -50, 10, 30, 0, 0, Math.PI * 2); x.fill(); }
      x.beginPath(); x.ellipse(-78, 10, 12, 30, -0.7, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#333'; x.fillRect(-10, -150, 90, 16);
      x.fillStyle = '#4a5f6a'; x.beginPath(); x.ellipse(10, -142, 30, 22, 0, 0, Math.PI * 2); x.ellipse(70, -142, 30, 22, 0, 0, Math.PI * 2); x.fill();
    });
    arrow(255);
    panel(380, () => { // glowing ball on a pipe
      x.strokeStyle = '#555'; x.lineWidth = 12; x.beginPath(); x.moveTo(-110, 0); x.lineTo(0, 0); x.stroke();
      const gr = x.createRadialGradient(40, 0, 6, 40, 0, 62); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(0.5, '#ff9a20'); gr.addColorStop(1, '#c03a10');
      x.fillStyle = gr; x.beginPath(); x.arc(40, 0, 60, 0, Math.PI * 2); x.fill();
    });
    arrow(505);
    panel(630, () => { // tub with water + steam, then blue cup
      x.fillStyle = '#8a6440'; x.fillRect(-80, 10, 120, 90); x.fillStyle = '#5a8aa0'; x.fillRect(-74, 10, 108, 14);
      x.strokeStyle = 'rgba(120,120,120,0.8)'; x.lineWidth = 8;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(-50 + k * 30, 0); x.bezierCurveTo(-60 + k * 30, -30, -40 + k * 30, -50, -50 + k * 30, -80); x.stroke(); }
      x.fillStyle = 'rgba(70,140,190,0.85)'; x.beginPath(); x.moveTo(60, -60); x.lineTo(110, -60); x.lineTo(102, 40); x.lineTo(68, 40); x.fill();
    });
    arrow(755);
    panel(880, () => { // window + sun + coloured light on floor
      x.fillStyle = '#ffd35a'; x.beginPath(); x.arc(40, -120, 34, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#555'; x.lineWidth = 10; x.strokeRect(-70, -90, 120, 120); x.beginPath(); x.moveTo(-10, -90); x.lineTo(-10, 30); x.stroke();
      x.fillStyle = 'rgba(60,120,220,0.7)'; x.beginPath(); x.ellipse(-60, 110, 40, 16, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(40,170,90,0.7)'; x.beginPath(); x.ellipse(10, 120, 40, 16, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(230,150,40,0.7)'; x.beginPath(); x.ellipse(70, 104, 30, 13, 0, 0, Math.PI * 2); x.fill();
    });
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace; st.anisotropy = 8;
    const sm = new THREE.MeshStandardMaterial({ map: st, roughness: 0.55, metalness: 0.15 });
    texSet('steel').bind(sm, [2, 1], { normalMap: 'n', roughnessMap: 'm' });
    const sign = mesh(rbox(0.8, 0.4, 0.012, 0.004, 1), [M.iron, M.iron, M.iron, M.iron, sm, M.iron], { x: -0.55, y: 1.62, z: -3.18 });
    // put the picture on the front (+z) face only
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.38), sm); sg.position.set(-0.55, 1.62, -3.172); sg.castShadow = false; sg.receiveShadow = true;
    R.add(mesh(rbox(0.8, 0.4, 0.012, 0.004, 1), M.iron, { x: -0.55, y: 1.62, z: -3.18 })); R.add(sg);
    this.sign = sg;
    // shelving with batch jars and buckets along the back wall right
    const shelf = new THREE.Group(); shelf.position.set(-1.0, 0, -3.0);
    for (const y of [0.4, 0.9, 1.4, 1.9]) shelf.add(mesh(rbox(1.2, 0.03, 0.35, 0.006, 1,2, true), M.pine, { y }));
    for (const sx of [-0.58, 0.58]) shelf.add(mesh(rbox(0.035, 2.0, 0.35, 0.006, 1,2, true), M.pine, { x: sx, y: 1.0 }));
    const jarMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f0ea, roughness: 0.08, transmission: 0.9, thickness: 0.01, ior: 1.5 });
    const contents = [0xd8d0c0, 0x8090b0, 0x709878, 0xc0a070];
    for (let k = 0; k < 8; k++) {
      const jx = -0.45 + (k % 4) * 0.3, jy = [0.415, 0.915][Math.floor(k / 4)];
      shelf.add(mesh(lathe([[0, 0], [0.07, 0], [0.075, 0.01], [0.075, 0.18], [0.05, 0.2], [0.05, 0.22], [0, 0.22]], 32, 1, 1), jarMat, { x: jx, y: jy }));
      const cm = pbr('frit', { color: contents[k % 4], roughness: 0.9 });
      shelf.add(mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.09 + (k * 37 % 5) * 0.015, 24), cm, { x: jx, y: jy + 0.06 }));
    }
    for (let k = 0; k < 3; k++) {
      const bk = new THREE.Mesh(lathe([[0, 0], [0.12, 0], [0.14, 0.26], [0.13, 0.26], [0.11, 0.01], [0, 0.01]], 32, 3, 1), M.steel);
      bk.position.set(-0.35 + k * 0.33, 1.415, 0); bk.castShadow = true; shelf.add(bk);
    }
    R.add(shelf);
    // broom & sand bucket near the furnace (fire safety corner)
    const sb = new THREE.Mesh(lathe([[0, 0], [0.15, 0], [0.17, 0.32], [0.16, 0.32], [0.14, 0.01], [0, 0.01]], 32, 3, 1), pbr('steel', { color: 0x8a2a22, metalness: 0.4, roughness: 0.6 }));
    sb.position.set(-3.4, 0, -2.75); sb.castShadow = true; R.add(sb);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(0.155, 24).rotateX(-Math.PI / 2), pbr('concrete', { color: 0xd8c6a0 }));
    sand.position.set(-3.4, 0.29, -2.75); R.add(sand);
  }
  // --------------------------------------------------------------- lights
  buildLights() {
    const S = this.scene;
    S.fog = null;
    this.envNight = null; this.envMorning = null;
    // pendant work lamps (enamel shades with warm bulbs)
    this.lamps = [];
    const mkLamp = (x, z, y = 2.05, shadow = false, I = 30) => {
      const g = new THREE.Group(); g.position.set(x, y, z);
      const shade = new THREE.Mesh(new THREE.LatheGeometry([[0.03, 0.18], [0.05, 0.16], [0.17, 0.02], [0.19, 0.0]].map(p => new THREE.Vector2(p[0], p[1])), 40), this.mats.enamel);
      shade.castShadow = true; g.add(shade);
      const inner = new THREE.Mesh(shade.geometry, this.mats.enamelIn); g.add(inner);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 9, 6) }));
      bulb.position.y = 0.05; g.add(bulb);
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 3.4 - y - 0.18, 6), this.mats.rubber, { y: 0.18 + (3.4 - y - 0.18) / 2, cast: false }));
      const L = new THREE.SpotLight(0xffd6a8, I, 0, 1.05, 0.75, 2);
      L.position.set(x, y + 0.02, z); L.target.position.set(x, 0, z);
      if (shadow) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.0004; L.shadow.normalBias = 0.02; L.shadow.radius = 6; L.shadow.camera.near = 0.2; L.shadow.camera.far = 6; }
      S.add(L, L.target); this.root.add(g);
      this.lamps.push({ g, L, bulb, I });
      return L;
    };
    this.keyLamp = mkLamp(0.55, 0.15, 2.0, true, 16);
    mkLamp(2.4, -1.3, 2.15, true, 14);
    mkLamp(-1.4, -1.2, 2.2, false, 14);
    // furnace glow light (flickering) and bounce
    this.furnL = new THREE.PointLight(0xff8a3a, 9, 0, 2);
    this.furnL.position.copy(this.mouth).add(new THREE.Vector3(0.1, 0, 0.35));
    S.add(this.furnL);
    // big soft fill from the plaster wall / ceiling (keeps the play area bright)
    this.hemi = new THREE.HemisphereLight(0xffe2c4, 0x5a4a3a, 0.55);
    S.add(this.hemi);
    // sun for the morning
    this.sun = new THREE.DirectionalLight(0xffdcb4, 0);
    this.sunDir = new THREE.Vector3(-0.74, -0.62, 0.26).normalize();
    this.sun.position.set(3.7, 0.86, 0.2).addScaledVector(this.sunDir, -8);
    this.sun.target.position.set(2.6, 0.4, 0.3);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -3.5; sc.right = 3.5; sc.top = 3.5; sc.bottom = -3.5; sc.near = 1; sc.far = 16; sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.02; this.sun.shadow.radius = 4;
    S.add(this.sun, this.sun.target);
    // hot-glass light (moves with the gather)
    this.glassL = new THREE.PointLight(0xff7a2a, 0, 0, 2); S.add(this.glassL);
    this.coolL = new THREE.PointLight(0xff7a2a, 0, 0, 2); S.add(this.coolL);
  }
  setMode(mode, k = 1) {
    // mode: 'night' | 'morning'; k = blend 0..1 towards it (used for the sunrise)
    if (!this.envNight) { this.envNight = makeEnvWrap(this.r, 'night'); this.envMorning = makeEnvWrap(this.r, 'morning'); }
    this.mode = mode; this.modeK = k;
  }
  update(dt, t, morningK) {
    this.time = t;
    const mk = morningK;
    // furnace flicker
    const fl = 1 + 0.08 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 7.3 + 1) + 0.05 * Math.sin(t * 23.7);
    this.furnL.intensity = 9 * fl * (1 - mk * 0.7);
    this.glowMat.color.setRGB(5.5 * fl, 3.2 * fl, 1.6 * fl);
    if (this.glowMat.map) this.glowMat.map.offset.set(t * 0.05, Math.sin(t * 0.7) * 0.05);
    for (const l of this.lamps) { l.L.intensity = l.I * (1 - mk * 0.85); l.bulb.material.color.setRGB(12 * (1 - mk * 0.8), 9 * (1 - mk * 0.8), 6 * (1 - mk * 0.8)); }
    this.sun.intensity = 7.5 * mk;
    // only re-render the shadow maps that matter right now
    this.sun.shadow.autoUpdate = mk > 0.01;
    for (const l of this.lamps) if (l.L.castShadow) l.L.shadow.autoUpdate = mk < 0.95;
    this.hemi.intensity = 0.55 + mk * 0.5;
    this.hemi.color.setRGB(1, 0.88 + mk * 0.08, 0.77 + mk * 0.2);
    this.skyMat.map = mk > 0.5 ? this.skyMorning : this.skyNight;
    const sk = mk > 0.5 ? 0.9 + (mk - 0.5) * 3.2 : 0.55 * (1 - mk * 1.6) + 0.12;
    this.skyMat.color.setRGB(sk, sk, sk);
    this.scene.environment = mk > 0.5 ? this.envMorning : this.envNight;
    this.scene.environmentIntensity = mk > 0.5 ? 0.75 : 0.55;
    if (this.waterMat.normalMap) this.waterMat.normalMap.offset.set(t * 0.01, t * 0.007);
  }
}

import { makeEnv } from './core.js';
function makeEnvWrap(r, m) { return makeEnv(r, m); }
