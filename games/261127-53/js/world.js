// The training ground: sky, environment, ground, steel burn-house, ladder truck, sign, props.
import * as THREE from '../lib/three.module.min.js';
import { G, pbr, tex, wettable, contactShadow } from './gfx.js';
import { tube, limb, roundedBox, corrugated, wallPieces, merge, xf, boxUV } from './geo.js';
import { PaintMap } from './fx.js';

const V = THREE.Vector3;
export const SUN = new V(-0.55, 0.2, 0.83).normalize();

// ---------------------------------------------------------------- sky
const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 uSun; uniform sampler2D uClouds; uniform sampler2D uNoise; uniform float uTime; uniform float uBright;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float e = d.y;
  vec2 hz = normalize(d.xz + vec2(1e-5)); vec2 sz = normalize(uSun.xz);
  float sunSide = dot(hz, sz) * 0.5 + 0.5;
  float cosS = dot(d, uSun);
  float ep = max(e, 0.0);
  vec3 zenith = vec3(0.10, 0.17, 0.40);
  vec3 midSky = mix(vec3(0.34, 0.33, 0.55), vec3(0.70, 0.50, 0.45), pow(sunSide, 3.0));
  vec3 horizon = mix(vec3(0.66, 0.47, 0.55), vec3(2.1, 0.95, 0.40), pow(sunSide, 4.0));
  vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.2, ep));
  col = mix(col, zenith, smoothstep(0.15, 0.8, ep));
  float anti = pow(1.0 - sunSide, 2.0);
  col += vec3(0.42, 0.2, 0.25) * anti * exp(-pow((e - 0.11) / 0.065, 2.0));
  col = mix(col, vec3(0.34, 0.38, 0.56), anti * (1.0 - smoothstep(0.0, 0.07, e)) * 0.7);
  float g = max(cosS, 0.0);
  col += vec3(1.8, 0.8, 0.28) * pow(g, 6.0) * 0.9 + vec3(4.0, 1.8, 0.6) * pow(g, 90.0) * 1.6;
  if (e > 0.0) {
    vec2 cuv = d.xz / (e + 0.07) * 0.085 + vec2(uTime * 0.0015, 0.0);
    vec3 cl = texture2D(uClouds, cuv).rgb;
    float dens = smoothstep(0.06, 0.7, cl.r) * smoothstep(0.0, 0.14, e) * (0.55 + 0.45 * cl.b);
    float lit = pow(g * 0.5 + 0.5, 4.0);
    vec3 cdark = mix(vec3(0.30, 0.25, 0.36), vec3(0.50, 0.33, 0.33), sunSide);
    vec3 cbright = vec3(2.3, 1.1, 0.52) * (0.45 + 0.85 * pow(sunSide, 2.0));
    vec3 cc = mix(cdark, cbright, clamp(lit * (0.45 + 0.7 * cl.g) + (1.0 - cl.r) * 0.45 * sunSide, 0.0, 1.0));
    col = mix(col, cc, dens * 0.88);
  }
  col += vec3(60.0, 30.0, 10.0) * smoothstep(0.99965, 0.99985, cosS) * smoothstep(-0.01, 0.004, e);
  float a = atan(d.z, d.x) / 6.28318;
  float th = 0.012 + 0.03 * texture2D(uNoise, vec2(a * 3.0, 0.17)).r + 0.014 * texture2D(uNoise, vec2(a * 19.0, 0.6)).g;
  if (e < th) {
    vec3 haze = mix(vec3(0.27, 0.24, 0.31), vec3(0.75, 0.42, 0.26), pow(sunSide, 3.0));
    float k = 1.0 - smoothstep(th - 0.006, th, e);
    col = mix(col, haze * (0.6 + 0.25 * texture2D(uNoise, vec2(a * 60.0, e * 30.0)).b), k * 0.9);
  }
  if (e < 0.0) col = mix(col, vec3(0.30, 0.26, 0.24) * mix(0.6, 1.4, sunSide), 1.0 - smoothstep(-0.03, 0.0, e));
  gl_FragColor = vec4(col * uBright, 1.0);
}`;

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: SUN.clone() }, uClouds: { value: tex('clouds.jpg', false) }, uNoise: { value: tex('noise.png', false) }, uTime: { value: 0 }, uBright: { value: 1 } },
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

export function buildEnv(renderer, skyMesh, extra) {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  const s = skyMesh.clone(); s.material = skyMesh.material; s.position.set(0, 0, 0); sc.add(s);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.36, 0.3, 0.26) }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.3; sc.add(ground);
  if (extra) sc.add(extra);
  const rt = pm.fromScene(sc, 0.02, 0.1, 1000);
  pm.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------- world
export function buildWorld(scene) {
  const W = {};
  const sky = makeSky(); scene.add(sky); W.sky = sky;
  // lights
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.7, 0.46), 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  const sc = sun.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 90;
  scene.add(sun); scene.add(sun.target);
  W.sun = sun;
  W.setSunFocus = (p, r = 11) => {
    sun.target.position.copy(p); sun.position.copy(p).addScaledVector(SUN, 40);
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix();
  };
  W.setSunFocus(new V(0, 0, 4));
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.5, 0.55, 0.85), new THREE.Color(0.42, 0.32, 0.24), 0.45);
  scene.add(hemi); W.hemi = hemi;
  scene.fog = new THREE.FogExp2(new THREE.Color(0.58, 0.46, 0.47), 0.0045);

  // ground: concrete pad with paint map + gravel beyond
  const padW = 44, padD = 34, padX = 5, padZ = 5;
  const gpaint = new PaintMap(512, 400, padW, padD); gpaint.vertical = false;
  W.groundPaint = gpaint; W.pad = { x0: padX - padW / 2, z0: padZ - padD / 2, w: padW, d: padD };
  const padG = new THREE.PlaneGeometry(padW, padD, 8, 8);
  padG.rotateX(-Math.PI / 2); padG.translate(padX, 0, padZ);
  { const p = padG.attributes.position, uv = padG.attributes.uv; const puv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv.setXY(i, p.getX(i), -p.getZ(i)); puv[i * 2] = (p.getX(i) - W.pad.x0) / padW; puv[i * 2 + 1] = (p.getZ(i) - W.pad.z0) / padD; }
    padG.setAttribute('puv', new THREE.BufferAttribute(puv, 2)); }
  const padM = wettable(pbr('concrete', { tile: 2.2, metal0: true, normal: 1.4 }), { paint: gpaint.tex });
  const pad = new THREE.Mesh(padG, padM); pad.receiveShadow = true; scene.add(pad); W.padMesh = pad;
  // expansion joints (dark lines) for scale cues
  const jm = new THREE.MeshStandardMaterial({ color: 0x2c2926, roughness: 0.9 });
  for (let x = W.pad.x0 + 4; x < W.pad.x0 + padW; x += 4) { const j = new THREE.Mesh(new THREE.PlaneGeometry(0.02, padD), jm); j.rotation.x = -Math.PI / 2; j.position.set(x, 0.002, padZ); j.receiveShadow = true; scene.add(j); }
  for (let z = W.pad.z0 + 4; z < W.pad.z0 + padD; z += 4) { const j = new THREE.Mesh(new THREE.PlaneGeometry(padW, 0.02), jm); j.rotation.x = -Math.PI / 2; j.position.set(padX, 0.002, z); j.receiveShadow = true; scene.add(j); }
  const grav = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), pbr('gravel', { tile: 3, metal0: true, normal: 1.2 }));
  { const p = grav.geometry.attributes.position, uv = grav.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i)); }
  grav.position.y = -0.015; grav.receiveShadow = true; scene.add(grav);

  // ---------------- burn house (two stacked containers)
  W.house = buildHouse(scene);
  // ---------------- truck
  W.truck = buildTruck();
  W.truck.group.position.set(12.4, 0, 4.6);
  W.truck.group.rotation.y = Math.atan2(0.55, -0.83); // front faces away from the scene-3 camera
  scene.add(W.truck.group);
  const tsh = contactShadow(3.4, 11.0, 0.65); tsh.position.set(0, 0.006, 0.4); W.truck.group.add(tsh);
  // ---------------- sign with pictograms
  W.sign = buildSign(); W.sign.position.set(-4.6, 0, 3.2); W.sign.rotation.y = 0.35; scene.add(W.sign);
  // traffic cones row (scale cue) — muted orange rubber, no logos
  const coneM = new THREE.MeshStandardMaterial({ color: 0xb4542a, roughness: 0.6 });
  const coneW = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4, metalness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.17, 0.7, 24, 1, true), coneM); body.position.y = 0.37; c.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.098, 0.12, 24, 1, true), coneW); band.position.y = 0.44; c.add(band);
    const base = new THREE.Mesh(roundedBox(0.4, 0.04, 0.4, 0.015), new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.85 })); base.position.y = 0.02; c.add(base);
    c.position.set(-6.5 + i * 1.6, 0, 6.6 + i * 0.1);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(c);
  }
  // hydrant post + hose reel (scale cues)
  W.hydrant = buildHydrant(); W.hydrant.position.set(4.2, 0, 7.4); scene.add(W.hydrant);
  // distant shed
  const shed = new THREE.Group();
  const shM = pbr('steel', { tile: 2, color: 0x9aa0a0 });
  const shB = new THREE.Mesh(roundedBox(9, 4, 6, 0.05), shM); shB.position.y = 2; shed.add(shB);
  const shR = new THREE.Mesh(roundedBox(9.6, 0.25, 6.6, 0.05), pbr('steel', { tile: 2, color: 0x6a6e70 })); shR.position.y = 4.1; shed.add(shR);
  shed.position.set(-16, 0, -10); shed.rotation.y = 0.3; shadowAll(shed); scene.add(shed);
  return W;
}

function shadowAll(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

// ---------------------------------------------------------------- house
function buildHouse(scene) {
  const H = {};
  const g = new THREE.Group(); scene.add(g); H.group = g;
  const X0 = -3.03, X1 = 3.03, CH = 2.59, D = 2.44;
  // facade (z = 0): openings
  const holes = {
    w1: { x0: -2.25, x1: -1.25, y0: 0.9, y1: 1.85 },
    w2: { x0: -0.45, x1: 0.55, y0: 0.9, y1: 1.85 },
    door: { x0: 1.5, x1: 2.45, y0: 0.0, y1: 2.05 },
    u1: { x0: -2.15, x1: -1.05, y0: CH + 0.75, y1: CH + 1.75 },
    u2: { x0: 0.9, x1: 2.0, y0: CH + 0.75, y1: CH + 1.75 },
  };
  H.holes = holes;
  const paint = new PaintMap(512, 440, 6.06, 5.18);
  H.paint = paint; H.paintRect = { x0: X0, y0: 0, w: 6.06, h: 5.18 };
  const facM = wettable(pbr('steel', { tile: 1.6, normal: 1.3, color: 0x8fa2ae }), { paint: paint.tex, heatGain: 0.4 });
  H.facadeMat = facM;
  const pieces = wallPieces(X0, X1, 0, CH * 2, Object.values(holes));
  const geos = pieces.map(([a, b, c, d]) => corrugated(a, b, c, d, { X0, W: 6.06, Y0: 0, H: 5.18 }));
  const facade = new THREE.Mesh(merge(geos), facM);
  facade.castShadow = true; facade.receiveShadow = true; g.add(facade);
  H.facade = facade;
  // reveals (opening sides) so openings have thickness
  const revM = pbr('steel', { tile: 1, color: 0x5a5956 });
  Object.values(holes).forEach((h) => {
    const t = 0.12;
    const parts = [[h.x0 - 0.04, h.y0, h.x0, h.y1], [h.x1, h.y0, h.x1 + 0.04, h.y1], [h.x0 - 0.04, h.y1, h.x1 + 0.04, h.y1 + 0.04]];
    if (h.y0 > 0.01) parts.push([h.x0 - 0.04, h.y0 - 0.05, h.x1 + 0.04, h.y0]);
    parts.forEach(([a, b, c, d]) => {
      const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(c - a, d - b, t)), revM);
      m.position.set((a + c) / 2, (b + d) / 2, -t / 2 + 0.03); m.castShadow = m.receiveShadow = true; g.add(m);
    });
  });
  // container frame: corner posts, rails, corner castings
  const frM = pbr('steel', { tile: 1.2, color: 0x7a7a76 });
  const post = (x, y0, z) => { const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(0.16, CH, 0.16)), frM); m.position.set(x, y0 + CH / 2, z); g.add(m); };
  for (const lvl of [0, CH]) for (const x of [X0 - 0.02, X1 + 0.02]) for (const z of [0.04, -D - 0.04]) post(x, lvl, z);
  const rail = (y, z) => { const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(6.3, 0.16, 0.14)), frM); m.position.set(0, y, z); g.add(m); };
  for (const y of [0.08, CH - 0.08, CH + 0.08, 2 * CH - 0.08]) { rail(y, 0.05); rail(y, -D - 0.05); }
  const castM = pbr('steel', { tile: 0.5, color: 0x55534f });
  for (const y of [0.09, CH - 0.09, CH + 0.09, 2 * CH - 0.09]) for (const x of [X0 - 0.02, X1 + 0.02]) for (const z of [0.06, -D - 0.06]) {
    const m = new THREE.Mesh(roundedBox(0.19, 0.13, 0.19, 0.012), castM); m.position.set(x, y, z); g.add(m);
  }
  // side/back walls & roof: plain corrugated steel (no paint map)
  const sideM = pbr('steel', { tile: 1.6, normal: 1.3, color: 0x8a9ca8 });
  const back = new THREE.Mesh(corrugated(X0, X1, 0, CH * 2), sideM); back.position.z = -D; back.rotation.y = Math.PI; back.position.x = 0; g.add(back);
  // end walls: right end (x = X1) lower has the door to the room (scene 2)
  H.roomDoor = { z0: -1.75, z1: -0.7, y1: 2.0 };
  const rEnd = wallPieces(0, D, 0, CH * 2, [{ x0: 0.7, x1: 1.75, y0: 0, y1: 2.0 }]).map(([a, b, c, d]) => corrugated(a, b, c, d));
  const re = new THREE.Mesh(merge(rEnd), sideM); re.rotation.y = Math.PI / 2; re.position.x = X1; g.add(re);
  // left end (x = X0): back window of the room
  H.backWin = { z0: -1.7, z1: -0.75, y0: 0.95, y1: 1.8 };
  const lEnd = wallPieces(-D, 0, 0, CH * 2, [{ x0: -1.7, x1: -0.75, y0: 0.95, y1: 1.8 }]).map(([a, b, c, d]) => corrugated(a, b, c, d));
  const le = new THREE.Mesh(merge(lEnd), sideM); le.rotation.y = -Math.PI / 2; le.position.x = X0; g.add(le);
  const roofM = pbr('steel', { tile: 1.6, color: 0x8e8c86 });
  for (const y of [CH, 2 * CH]) { const r = new THREE.Mesh(corrugated(X0, X1, 0, D), roofM); r.rotation.x = -Math.PI / 2; r.position.y = y; g.add(r); }
  // ---------- interior of lower container (room for scene 2)
  const wallM = pbr('wall', { tile: 1.4, metal0: true, color: 0xd6d2c8 });
  H.wallMat = wallM;
  const inset = 0.06;
  const mkInner = (pieces, xf_) => { const m = new THREE.Mesh(merge(pieces.map(([a, b, c, d]) => corrugated(a, b, c, d, { depth: 0.02, period: 0.25 }))), wallM); xf_(m); m.receiveShadow = true; m.castShadow = true; g.add(m); return m; };
  // facade inner (looking from inside: normal -Z)
  mkInner(wallPieces(X0, X1, 0, CH, [holes.w1, holes.w2, holes.door]), (m) => { m.position.z = -inset; m.scale.z = -1; });
  mkInner(wallPieces(X0, X1, 0, CH, []), (m) => { m.position.z = -D + inset; });
  mkInner(wallPieces(-D, 0, 0, CH, [{ x0: -1.75, x1: -0.7, y0: 0, y1: 2.0 }]), (m) => { m.rotation.y = -Math.PI / 2; m.position.x = X1 - inset; });
  mkInner(wallPieces(0, D, 0, CH, [{ x0: 0.75, x1: 1.7, y0: 0.95, y1: 1.8 }]), (m) => { m.rotation.y = Math.PI / 2; m.position.x = X0 + inset; m.scale.x = 1; });
  // fix orientation of inner pieces by flipping normals where scale is negative
  // floor (plywood) + ceiling
  const floorM = pbr('wood', { tile: 1.2, metal0: true, color: 0x8a7a68 });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(6.0, D - 0.1).rotateX(-Math.PI / 2), floorM);
  { const p = fl.geometry.attributes.position, uv = fl.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.6, p.getZ(i) * 0.6); }
  fl.position.set(0, 0.012, -D / 2); fl.receiveShadow = true; g.add(fl);
  const ceil = new THREE.Mesh(corrugated(X0, X1, -D, 0, { depth: 0.03 }), wallM); ceil.rotation.x = Math.PI / 2; ceil.position.y = CH - 0.03; g.add(ceil);
  // ---------- shutters (steel roll shutters) for room windows
  H.shutters = [];
  const shutM = pbr('steel', { tile: 0.8, color: 0x9a9890 });
  const mkShutter = (w, h) => {
    const sg = new THREE.Group();
    const slats = [];
    const n = Math.round(h / 0.075);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(roundedBox(w, 0.072, 0.025, 0.01), shutM);
      s.position.y = -0.037 - i * 0.075; s.castShadow = s.receiveShadow = true; sg.add(s); slats.push(s);
    }
    const box = new THREE.Mesh(roundedBox(w + 0.1, 0.22, 0.22, 0.02), frM); box.position.set(0, 0.1, 0); box.castShadow = true; sg.add(box);
    sg.userData = { slats, h, open: 0 };
    return sg;
  };
  const addShutter = (key, pos, rotY, w, h, hole) => {
    const s = mkShutter(w + 0.04, h);
    s.position.copy(pos); s.rotation.y = rotY; g.add(s);
    H.shutters.push({ key, group: s, open: 0, target: 0, hole, rotY });
  };
  addShutter('w1', new V((holes.w1.x0 + holes.w1.x1) / 2, holes.w1.y1, -0.16), 0, holes.w1.x1 - holes.w1.x0, holes.w1.y1 - holes.w1.y0, holes.w1);
  addShutter('w2', new V((holes.w2.x0 + holes.w2.x1) / 2, holes.w2.y1, -0.16), 0, holes.w2.x1 - holes.w2.x0, holes.w2.y1 - holes.w2.y0, holes.w2);
  addShutter('back', new V(X0 + 0.16, H.backWin.y1, (H.backWin.z0 + H.backWin.z1) / 2), Math.PI / 2, H.backWin.z1 - H.backWin.z0, H.backWin.y1 - H.backWin.y0, H.backWin);
  H.setShutter = (sh, open) => {
    sh.open = open;
    const { slats, h } = sh.group.userData;
    // slats roll up into the box: each slat moves up, the top ones disappear into the box
    slats.forEach((s, i) => {
      const y = -0.037 - i * 0.075 + open * (h + 0.02);
      s.position.y = Math.min(0.05, y);
      s.visible = y < 0.02;
    });
  };
  // door leaf (facade door, closed) and room door frame
  const doorM = pbr('steel', { tile: 1.0, color: 0x8c8a84 });
  const door = new THREE.Mesh(roundedBox(0.93, 2.03, 0.05, 0.01), doorM);
  door.position.set((holes.door.x0 + holes.door.x1) / 2, 1.02, -0.05); door.castShadow = door.receiveShadow = true; g.add(door);
  const handle = new THREE.Mesh(roundedBox(0.03, 0.18, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0x777, metalness: 1, roughness: 0.35 })); handle.position.set(holes.door.x0 + 0.12, 1.05, 0.0); g.add(handle);
  // room-door leaf opened outward at the right end
  const rd = new THREE.Mesh(roundedBox(0.05, 2.0, 1.03, 0.01), doorM);
  rd.position.set(X1 + 0.55, 1.0, -0.2); rd.rotation.y = -1.2; rd.castShadow = rd.receiveShadow = true; g.add(rd);
  // ---------- upper windows: charred interior boxes
  const charM = wettable(pbr('steel', { tile: 1, color: 0x161412, side: THREE.BackSide }));
  for (const k of ['u1', 'u2']) {
    const h = holes[k];
    const box = new THREE.Mesh(boxUV(new THREE.BoxGeometry(h.x1 - h.x0 + 0.4, h.y1 - h.y0 + 0.4, 1.2)), charM);
    box.material = charM; box.geometry.scale(1, 1, 1);
    // inside-out box (we look into it)
    box.position.set((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2, -0.65); box.receiveShadow = true; g.add(box);
    // burner pipe at the sill
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h.x1 - h.x0 - 0.1, 12).rotateZ(Math.PI / 2), frM);
    pipe.position.set((h.x0 + h.x1) / 2, h.y0 + 0.05, -0.3); g.add(pipe);
  }
  // initial soot (scorch plumes above openings) and heat around fires
  const pr = H.paintRect;
  const toUV = (x, y) => [(x - pr.x0) / pr.w, (y - pr.y0) / pr.h];
  const sootPlume = (x, y, w, hgt, k) => {
    for (let i = 0; i < 26; i++) {
      const t = i / 25; const [u, v] = toUV(x + (Math.random() - 0.5) * w * (0.4 + t * 0.6), y + t * hgt);
      paint.splat('soot', u, v, w * (0.25 + t * 0.35), k * (1 - t * 0.7) * 0.35, 'add', 1.2);
    }
  };
  sootPlume((holes.u1.x0 + holes.u1.x1) / 2, holes.u1.y1 - 0.1, 0.9, 0.9, 1);
  sootPlume((holes.u2.x0 + holes.u2.x1) / 2, holes.u2.y1 - 0.1, 0.9, 0.9, 1);
  sootPlume((holes.w1.x0 + holes.w1.x1) / 2, holes.w1.y1, 0.8, 0.9, 0.5);
  sootPlume((holes.w2.x0 + holes.w2.x1) / 2, holes.w2.y1, 0.8, 0.9, 0.45);
  sootPlume((holes.door.x0 + holes.door.x1) / 2, holes.door.y1, 0.8, 0.7, 0.4);
  for (const k of ['u1', 'u2']) {
    const h = holes[k];
    for (let i = 0; i < 10; i++) { const [u, v] = toUV((h.x0 + h.x1) / 2 + (Math.random() - 0.5) * 1.0, h.y1 + 0.05 + Math.random() * 0.35); paint.splat('heat', u, v, 0.35, 0.25, 'add', 1.5); }
  }
  paint.dirty = true; paint.update(0);
  // ---------- exterior stair on the left end
  const stair = new THREE.Group();
  const stM = pbr('steel', { tile: 1, color: 0x6c6a64 });
  const L = Math.hypot(2.4, CH);
  for (const z of [0.1, 1.0]) { const s = new THREE.Mesh(boxUV(new THREE.BoxGeometry(0.06, 0.2, L)), stM); s.rotation.x = Math.atan2(CH, 2.4); s.position.set(0, CH / 2, 0); s.position.x = z === 0.1 ? -0.45 : 0.45; stair.add(s); }
  for (let i = 1; i < 12; i++) { const t = i / 12; const tr = new THREE.Mesh(boxUV(new THREE.BoxGeometry(0.9, 0.035, 0.24)), stM); tr.position.set(0, t * CH, (0.5 - t) * 2.4); stair.add(tr); }
  for (const sx of [-0.45, 0.45]) { const rl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, L, 8), stM); rl.rotation.x = Math.atan2(2.4, CH) * -1 + Math.PI / 2 - Math.PI / 2; rl.rotation.x = -Math.atan2(2.4, CH); rl.position.set(sx, CH / 2 + 0.9, 0); stair.add(rl); for (let i = 0; i <= 3; i++) { const t = i / 3; const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8), stM); pp.position.set(sx, t * CH + 0.45, (0.5 - t) * 2.4); stair.add(pp); } }
  stair.rotation.y = Math.PI / 2; stair.position.set(X0 - 0.6, 0, -1.2);
  g.add(stair);
  shadowAll(stair);
  g.traverse((o) => { if (o.isMesh && o.castShadow === false && o.material !== charM) { o.castShadow = true; o.receiveShadow = true; } });
  const hs = contactShadow(7.4, 3.6, 0.7); hs.position.set(0, 0.006, -1.2); scene.add(hs);
  return H;
}

// ---------------------------------------------------------------- burn pan + pallets
export function buildBurnPan() {
  const g = new THREE.Group();
  const m = wettable(pbr('steel', { tile: 0.8, color: 0x6a6660 }));
  const base = new THREE.Mesh(roundedBox(1.3, 0.04, 0.85, 0.01), m); base.position.y = 0.06; g.add(base);
  const sides = [[1.3, 0.16, 0.04, 0, 0.12, 0.425], [1.3, 0.16, 0.04, 0, 0.12, -0.425], [0.04, 0.16, 0.85, 0.65, 0.12, 0], [0.04, 0.16, 0.85, -0.65, 0.12, 0]];
  sides.forEach(([w, h, d, x, y, z]) => { const s = new THREE.Mesh(roundedBox(w, h, d, 0.008), m); s.position.set(x, y, z); g.add(s); });
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.33, 0.33]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.06, 10), m); l.position.set(sx, 0.02, sz); g.add(l); }
  const liquid = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.77).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x14100c, roughness: 0.06, metalness: 0.0, clearcoat: 1 }));
  liquid.position.y = 0.11; g.add(liquid);
  g.userData.mat = m;
  return shadowAll(g);
}

export function buildPallets(n = 3) {
  const g = new THREE.Group();
  const m = wettable(pbr('wood', { tile: 0.9, metal0: true, color: 0x8c8478 }));
  for (let k = 0; k < n; k++) {
    const p = new THREE.Group();
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(roundedBox(1.2, 0.022, 0.1, 0.004), m); b.position.set(0, 0.133, -0.5 + i * (1.0 / 6)); p.add(b); }
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(roundedBox(0.1, 0.1, 1.0, 0.006), m); b.position.set(-0.55 + i * 0.55, 0.072, 0); p.add(b); }
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(roundedBox(1.2, 0.022, 0.1, 0.004), m); b.position.set(0, 0.011, -0.45 + i * 0.45); p.add(b); }
    p.position.y = k * 0.145; p.rotation.y = (Math.random() - 0.5) * 0.12; g.add(p);
  }
  g.userData.mat = m;
  return shadowAll(g);
}

// ---------------------------------------------------------------- sign (pictograms only)
function buildSign() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  // enamel board
  x.fillStyle = '#e8e3d6'; x.fillRect(0, 0, 1024, 512);
  x.strokeStyle = '#2f4a78'; x.lineWidth = 22; x.strokeRect(14, 14, 996, 484);
  // panel 1: flame
  const flame = (cx, cy, s) => {
    x.save(); x.translate(cx, cy); x.scale(s, s);
    x.fillStyle = '#c8481f';
    x.beginPath(); x.moveTo(0, -110); x.bezierCurveTo(60, -40, 80, 10, 60, 60); x.bezierCurveTo(40, 100, -40, 100, -60, 60); x.bezierCurveTo(-80, 10, -40, -20, -20, -60); x.bezierCurveTo(-10, -30, 0, -40, 0, -110); x.fill();
    x.fillStyle = '#eba23a';
    x.beginPath(); x.moveTo(0, -30); x.bezierCurveTo(30, 0, 40, 30, 28, 60); x.bezierCurveTo(16, 84, -16, 84, -28, 60); x.bezierCurveTo(-36, 34, -16, 10, 0, -30); x.fill();
    x.restore();
  };
  flame(170, 270, 1.1);
  // arrow
  const arrow = (x0, y) => { x.fillStyle = '#3a3a3a'; x.beginPath(); x.moveTo(x0, y - 16); x.lineTo(x0 + 70, y - 16); x.lineTo(x0 + 70, y - 38); x.lineTo(x0 + 110, y); x.lineTo(x0 + 70, y + 38); x.lineTo(x0 + 70, y + 16); x.lineTo(x0, y + 16); x.closePath(); x.fill(); };
  arrow(290, 260);
  // panel 2: nozzle with water
  x.save(); x.translate(520, 280);
  x.fillStyle = '#3a3a3a'; x.beginPath(); x.moveTo(-90, 40); x.lineTo(-20, 10); x.lineTo(-20, 40); x.lineTo(-90, 70); x.closePath(); x.fill();
  x.fillStyle = '#4a7fb8';
  for (let i = 0; i < 18; i++) { const a = -0.35 + Math.random() * 0.25; const r = 30 + i * 6; x.beginPath(); x.arc(-10 + Math.cos(a) * r, 20 + Math.sin(a) * r - i * 4, 7 + Math.random() * 5, 0, 7); x.fill(); }
  x.restore();
  arrow(640, 260);
  // panel 3: steam cloud over a dark (cooled) block
  x.fillStyle = '#4b4b4b'; x.fillRect(800, 330, 150, 60);
  x.fillStyle = '#9fb3c6';
  [[875, 250, 50], [835, 270, 38], [915, 272, 38], [860, 200, 36], [900, 210, 30], [880, 160, 26]].forEach(([cx, cy, r]) => { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const bm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.05, normalMap: tex('steel_n.jpg', false, 0.5), normalScale: new THREE.Vector2(0.4, 0.4) });
  const board = new THREE.Mesh(roundedBox(1.6, 0.8, 0.03, 0.01), [bm]);
  // map uv for the front face to full canvas
  const p = board.geometry.attributes.position, uv = board.geometry.attributes.uv, n = board.geometry.attributes.normal;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 0.8) / 1.6, (p.getY(i) + 0.4) / 0.8);
  board.position.y = 1.55; g.add(board);
  const back = new THREE.Mesh(roundedBox(1.62, 0.82, 0.02, 0.008), pbr('steel', { tile: 1, color: 0x8a8a86 })); back.position.set(0, 1.55, -0.025); g.add(back);
  const postM = pbr('steel', { tile: 1, color: 0x8f918e });
  for (const sx of [-0.6, 0.6]) { const ps = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.95, 14), postM); ps.position.set(sx, 0.975, -0.05); g.add(ps); }
  return shadowAll(g);
}

function buildHydrant() {
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color: 0x9a2a1e, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, normalMap: tex('redpaint_n.jpg', false, 2), normalScale: new THREE.Vector2(0.6, 0.6) });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.75, 24), m); body.position.y = 0.375; g.add(body);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); top.position.y = 0.75; g.add(top);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 1, roughness: 0.3 });
  for (const s of [-1, 1]) { const o = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 16).rotateZ(Math.PI / 2), brass); o.position.set(s * 0.15, 0.55, 0); g.add(o); }
  return shadowAll(g);
}

// ---------------------------------------------------------------- ladder truck
export function buildTruck() {
  const T = {};
  const g = new THREE.Group(); T.group = g;
  const red = new THREE.MeshPhysicalMaterial({ map: tex('redpaint_c.jpg', true, 0.5), normalMap: tex('redpaint_n.jpg', false, 0.5), roughnessMap: tex('redpaint_orm.jpg', false, 0.5), roughness: 1, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, normalScale: new THREE.Vector2(0.5, 0.5) });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.12 });
  const alu = pbr('steel', { tile: 0.6, color: 0xd0d0cc, roughness: 0.7, metalness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.6, metalness: 0.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2028, roughness: 0.03, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.6 });
  const rub = pbr('rubber', { tile: 0.3, metal0: true });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xe8e6e0, roughness: 0.3, clearcoat: 0.8 });
  // the truck is modelled along +Z (front at +Z)
  const cab = new THREE.Mesh(roundedBox(2.45, 2.0, 2.3, 0.18), red); cab.position.set(0, 1.55, 4.0); g.add(cab);
  const cabTop = new THREE.Mesh(roundedBox(2.4, 0.55, 2.0, 0.2), red); cabTop.position.set(0, 2.75, 3.85); g.add(cabTop);
  const ws = new THREE.Mesh(roundedBox(2.2, 0.95, 0.05, 0.05), glass); ws.position.set(0, 2.2, 5.14); ws.rotation.x = -0.12; g.add(ws);
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(roundedBox(0.05, 0.8, 1.0, 0.05), glass); sw.position.set(s * 1.235, 2.2, 4.3); g.add(sw);
    const sw2 = new THREE.Mesh(roundedBox(0.05, 0.6, 0.7, 0.05), glass); sw2.position.set(s * 1.235, 2.3, 3.3); g.add(sw2);
    const mir = new THREE.Mesh(roundedBox(0.08, 0.35, 0.22, 0.03), dark); mir.position.set(s * 1.5, 2.25, 4.9); g.add(mir);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8).rotateZ(Math.PI / 2), chrome); arm.position.set(s * 1.36, 2.3, 4.9); g.add(arm);
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xfff0d0, emissiveIntensity: 0.6, roughness: 0.1 })); hl.position.set(s * 0.85, 0.95, 5.16); g.add(hl);
    const step = new THREE.Mesh(roundedBox(0.5, 0.05, 0.5, 0.01), alu); step.position.set(s * 1.25, 0.55, 4.2); g.add(step);
  }
  // white side stripe (no lettering)
  for (const s of [-1, 1]) { const st = new THREE.Mesh(roundedBox(0.012, 0.1, 9.2, 0.004), white); st.position.set(s * 1.258, 1.05, 0.4); g.add(st); }
  const grille = new THREE.Mesh(roundedBox(1.3, 0.45, 0.05, 0.02), dark); grille.position.set(0, 1.0, 5.14); g.add(grille);
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(roundedBox(1.25, 0.025, 0.02, 0.005), chrome); b.position.set(0, 0.82 + i * 0.07, 5.17); g.add(b); }
  const bumper = new THREE.Mesh(roundedBox(2.5, 0.25, 0.25, 0.06), chrome); bumper.position.set(0, 0.62, 5.2); g.add(bumper);
  // light bar
  const lbar = new THREE.Mesh(roundedBox(1.6, 0.14, 0.32, 0.06), new THREE.MeshPhysicalMaterial({ color: 0x8a1010, emissive: 0xff2010, emissiveIntensity: 0.4, roughness: 0.1, transmission: 0, clearcoat: 1 }));
  lbar.position.set(0, 3.1, 4.4); g.add(lbar); T.lightBar = lbar;
  // body with roll-up compartment doors
  const body = new THREE.Mesh(roundedBox(2.5, 1.7, 6.6, 0.06), red); body.position.set(0, 1.45, -0.6); g.add(body);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const dg = corrugated(-0.85, 0.85, 0, 1.25, { period: 0.06, depth: 0.012 });
    const d = new THREE.Mesh(dg, alu); d.rotation.y = s * Math.PI / 2; d.position.set(s * 1.262, 0.78, -2.8 + i * 1.95); g.add(d);
    const h = new THREE.Mesh(roundedBox(0.03, 0.04, 0.3, 0.01), chrome); h.position.set(s * 1.28, 0.85, -2.8 + i * 1.95); g.add(h);
  }
  // chassis + wheels
  const ch = new THREE.Mesh(roundedBox(1.9, 0.35, 9.4, 0.03), dark); ch.position.set(0, 0.6, 0.2); g.add(ch);
  const wheelZ = [3.6, -1.5, -2.9];
  T.wheels = [];
  wheelZ.forEach((z) => {
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.15, 16, 32), rub); w.add(tire);
      const tread = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.3, 32, 1, true).rotateX(Math.PI / 2), rub); w.add(tread);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 24).rotateX(Math.PI / 2), chrome); w.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 16).rotateX(Math.PI / 2), dark); w.add(hub);
      for (let k = 0; k < 8; k++) { const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6).rotateX(Math.PI / 2), chrome); nut.position.set(Math.cos(k * 0.785) * 0.19, Math.sin(k * 0.785) * 0.19, 0); w.add(nut); }
      w.rotation.y = Math.PI / 2; w.position.set(s * 1.05, 0.53, z); g.add(w);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 24, Math.PI), dark); arch.rotation.y = Math.PI / 2; arch.position.set(s * 1.26, 0.6, z); g.add(arch);
      T.wheels.push(w);
    }
  });
  // turntable + ladder (rear)
  const tt = new THREE.Group(); tt.position.set(0, 2.35, -3.0); g.add(tt); T.turntable = tt;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.3, 40), red); tt.add(ring);
  const ped = new THREE.Mesh(roundedBox(0.9, 0.7, 1.0, 0.08), red); ped.position.set(0, 0.45, 0); tt.add(ped);
  const pivot = new THREE.Group(); pivot.position.set(0, 0.7, 0.2); tt.add(pivot); T.pivot = pivot;
  // ladder sections (along +Z of pivot when elevation 0)
  T.sections = [];
  const secL = 7.2;
  const mkSection = (w, h) => {
    const s = new THREE.Group();
    for (const sx of [-1, 1]) {
      const rl = new THREE.Mesh(roundedBox(0.06, h, secL, 0.012), alu); rl.position.set(sx * w / 2, 0, secL / 2); s.add(rl);
      const top = new THREE.Mesh(roundedBox(0.05, 0.04, secL, 0.01), alu); top.position.set(sx * w / 2, h * 0.5 + 0.12, secL / 2); s.add(top);
      for (let i = 0; i < 12; i++) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), alu); tr.position.set(sx * w / 2, h * 0.5 + 0.06, 0.3 + i * 0.6); tr.rotation.x = 0.4; s.add(tr); }
    }
    for (let i = 0; i < 24; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, w, 10).rotateZ(Math.PI / 2), alu); r.position.set(0, -h * 0.25, 0.15 + i * 0.3); s.add(r); }
    return s;
  };
  let parent = pivot;
  const widths = [0.62, 0.54, 0.46];
  widths.forEach((w, i) => { const s = mkSection(w, 0.16 - i * 0.02); if (i > 0) s.position.set(0, 0.03, 0.3); parent.add(s); T.sections.push(s); parent = s; });
  // nozzle (monitor) at the tip of the last section
  const tip = new THREE.Group(); tip.position.set(0, 0.05, secL); T.sections[2].add(tip); T.tip = tip;
  const mon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 16).rotateX(Math.PI / 2), chrome); mon.position.z = 0.15; tip.add(mon);
  const monB = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), red); tip.add(monB);
  T.nozzle = new THREE.Object3D(); T.nozzle.position.set(0, 0, 0.34); tip.add(T.nozzle);
  // ladder hose along the side
  T.secL = secL;
  T.setLadder = (elev, ext, yaw) => {
    tt.rotation.y = yaw;
    pivot.rotation.x = -elev;
    T.sections[1].position.z = 0.3 + ext * (secL - 1.0);
    T.sections[2].position.z = 0.3 + ext * (secL - 1.0);
  };
  T.setLadder(0.04, 0, 0);
  // rear control panel (pump panel) with gauges
  const panel = new THREE.Mesh(roundedBox(1.2, 0.8, 0.06, 0.02), alu); panel.position.set(0, 1.5, -3.94); g.add(panel);
  for (let i = 0; i < 3; i++) { const gg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 24).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xf2efe6, roughness: 0.2, clearcoat: 1 })); gg.position.set(-0.35 + i * 0.35, 1.65, -3.98); g.add(gg); const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 24), chrome); ring2.position.copy(gg.position); g.add(ring2); }
  const levers = [];
  for (let i = 0; i < 2; i++) { const lv = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), chrome); lv.position.set(-0.2 + i * 0.4, 1.3, -4.02); lv.rotation.x = 0.5; g.add(lv); levers.push(lv); }
  T.levers = levers;
  // rear bumper / steps
  const rb = new THREE.Mesh(roundedBox(2.4, 0.18, 0.35, 0.04), alu); rb.position.set(0, 0.55, -3.95); g.add(rb);
  const outl = new THREE.Mesh(roundedBox(2.0, 0.08, 0.1, 0.03), new THREE.MeshStandardMaterial({ color: 0x3b0808, emissive: 0x500000, roughness: 0.2 })); outl.position.set(0, 1.0, -3.92); g.add(outl);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return T;
}

// ---------------------------------------------------------------- props for the room
export function buildBear() {
  const g = new THREE.Group();
  const fur = pbr('fur', { tile: 0.06, metal0: true, physical: true, sheen: 1, sheenColor: 0xd8b088, sheenRoughness: 0.55, normal: 1.4 });
  const furL = pbr('fur', { tile: 0.05, metal0: true, physical: true, sheen: 1, sheenColor: 0xf0d0a8, sheenRoughness: 0.5, color: 0xf2dcc0 });
  const eyeM = new THREE.MeshPhysicalMaterial({ color: 0x0c0a08, roughness: 0.05, clearcoat: 1 });
  const sph = (r, sx, sy, sz, x, y, z, m = fur) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), m); s.scale.set(sx, sy, sz); s.position.set(x, y, z); g.add(s); return s; };
  sph(0.1, 1, 1.15, 0.9, 0, 0.13, 0);                 // body
  sph(0.06, 1, 1.1, 0.5, 0, 0.12, 0.06, furL);        // belly
  sph(0.085, 1.05, 0.95, 0.95, 0, 0.3, 0.01);         // head
  sph(0.038, 1.1, 0.85, 0.9, 0, 0.28, 0.075, furL);   // muzzle
  sph(0.012, 1.3, 0.9, 0.8, 0, 0.295, 0.11, eyeM);    // nose
  for (const s of [-1, 1]) {
    sph(0.033, 1, 1, 0.55, s * 0.065, 0.375, -0.005);  // ears
    sph(0.018, 1, 1, 0.5, s * 0.065, 0.375, 0.008, furL);
    sph(0.011, 1, 1, 0.7, s * 0.032, 0.315, 0.078, eyeM); // eyes
    const arm = sph(0.034, 1, 1.9, 1, s * 0.1, 0.16, 0.03); arm.rotation.z = s * 0.5;  // arms
    const leg = sph(0.04, 1, 1, 1.7, s * 0.06, 0.04, 0.06); // legs (sitting)
    sph(0.026, 1, 1, 0.4, s * 0.06, 0.04, 0.125, furL);   // foot pads
  }
  // ribbon
  const rib = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 24), new THREE.MeshPhysicalMaterial({ color: 0x8e2430, roughness: 0.4, sheen: 1, sheenColor: 0xff9090 })); rib.rotation.x = Math.PI / 2; rib.position.y = 0.225; rib.scale.set(1, 0.8, 1); g.add(rib);
  return shadowAll(g);
}

export function buildChair() {
  const g = new THREE.Group();
  const m = pbr('wood', { tile: 0.6, metal0: true, color: 0xb09070 });
  const seat = new THREE.Mesh(roundedBox(0.42, 0.035, 0.4, 0.01), m); seat.position.y = 0.44; g.add(seat);
  for (const sx of [-0.18, 0.18]) for (const sz of [-0.17, 0.17]) { const l = new THREE.Mesh(roundedBox(0.035, 0.44, 0.035, 0.006), m); l.position.set(sx, 0.22, sz); g.add(l); }
  for (const sx of [-0.18, 0.18]) { const p = new THREE.Mesh(roundedBox(0.035, 0.45, 0.035, 0.006), m); p.position.set(sx, 0.68, -0.17); g.add(p); }
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(roundedBox(0.36, 0.05, 0.02, 0.006), m); b.position.set(0, 0.56 + i * 0.12, -0.17); g.add(b); }
  return shadowAll(g);
}

export function buildToyTruck() {
  const g = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ color: 0xa82418, roughness: 0.35, clearcoat: 0.7, normalMap: tex('wood_n.jpg', false, 4), normalScale: new THREE.Vector2(0.3, 0.3) });
  const wood = pbr('wood', { tile: 0.3, metal0: true, color: 0xd8c0a0 });
  const b = new THREE.Mesh(roundedBox(0.16, 0.1, 0.32, 0.02), red); b.position.y = 0.09; g.add(b);
  const c = new THREE.Mesh(roundedBox(0.15, 0.09, 0.1, 0.02), red); c.position.set(0, 0.17, 0.1); g.add(c);
  const lad = new THREE.Mesh(roundedBox(0.06, 0.02, 0.26, 0.005), wood); lad.position.set(0, 0.155, -0.04); lad.rotation.x = 0.12; g.add(lad);
  for (const sx of [-1, 1]) for (const sz of [-0.1, 0.1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20).rotateZ(Math.PI / 2), wood); w.position.set(sx * 0.085, 0.04, sz); g.add(w); }
  return shadowAll(g);
}

export function buildBall() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x3d6a8a, roughness: 0.5, clearcoat: 0.3, normalMap: tex('rubber_n.jpg', false, 2), normalScale: new THREE.Vector2(0.5, 0.5) });
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 20), m); s.position.y = 0.11;
  const g = new THREE.Group(); g.add(s);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.109, 0.012, 8, 40), new THREE.MeshPhysicalMaterial({ color: 0xd8c8a0, roughness: 0.5 })); band.position.y = 0.11; band.rotation.x = 0.4; g.add(band);
  return shadowAll(g);
}

export function buildFan() {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.45, metalness: 0.6 });
  const cage = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.3, metalness: 1 });
  const redM = new THREE.MeshPhysicalMaterial({ color: 0x8c1c14, roughness: 0.35, clearcoat: 0.8 });
  const head = new THREE.Group(); head.position.y = 0.42; g.add(head);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 40, 1, true).rotateX(Math.PI / 2), redM); head.add(shroud);
  const shroudIn = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.22, 40, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, side: THREE.BackSide, roughness: 0.8 })); head.add(shroudIn);
  for (const z of [-0.11, 0.11]) for (let r = 0.08; r < 0.37; r += 0.055) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 6, 48), cage); t.position.z = z; head.add(t); }
  for (let i = 0; i < 12; i++) for (const z of [-0.11, 0.11]) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.36, 4), cage); sp.position.set(Math.cos(i * 0.5236) * 0.18, Math.sin(i * 0.5236) * 0.18, z); sp.rotation.z = i * 0.5236 + Math.PI / 2; head.add(sp); }
  const rotor = new THREE.Group(); head.add(rotor);
  const bladeM = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const bg = new THREE.PlaneGeometry(0.13, 0.28, 4, 6); bg.translate(0, 0.17, 0);
    const p = bg.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k); p.setZ(k, x * 0.5 - (y - 0.17) * 0.05); }
    bg.computeVertexNormals();
    const b = new THREE.Mesh(bg, bladeM); b.rotation.z = i * Math.PI * 2 / 5; rotor.add(b);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), cage); rotor.add(hub);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 20).rotateX(Math.PI / 2), frame); motor.position.z = -0.17; head.add(motor);
  // frame legs + wheels
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), frame); l.position.set(sx * 0.3, 0.24, 0); l.rotation.z = sx * 0.15; g.add(l); }
  const base = new THREE.Mesh(roundedBox(0.7, 0.04, 0.4, 0.015), frame); base.position.y = 0.04; g.add(base);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 24, Math.PI), frame); handle.position.set(0, 0.8, -0.05); g.add(handle);
  g.userData = { rotor, head };
  return shadowAll(g);
}

export function buildWorkLight() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.5, metalness: 0.6 });
  for (let i = 0; i < 3; i++) { const a = i * 2.094; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 6), m); l.position.set(Math.cos(a) * 0.25, 0.75, Math.sin(a) * 0.25); l.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32); g.add(l); }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.6, 8), m); pole.position.y = 1.75; g.add(pole);
  const head = new THREE.Group(); head.position.y = 2.05; g.add(head);
  const box = new THREE.Mesh(roundedBox(0.36, 0.26, 0.08, 0.02), new THREE.MeshStandardMaterial({ color: 0x9a6a20, roughness: 0.45, metalness: 0.3 })); head.add(box);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dd, emissiveIntensity: 6 })); lens.position.z = 0.041; head.add(lens);
  g.userData.head = head;
  return shadowAll(g);
}

// coat hanging on a rack hook + helmet on a bench (intro)
export function buildRack() {
  const g = new THREE.Group();
  const m = pbr('steel', { tile: 1, color: 0x6c7478 });
  for (const sx of [-0.55, 0.55]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.7, 12), m); p.position.set(sx, 0.85, 0); g.add(p); const f = new THREE.Mesh(roundedBox(0.08, 0.03, 0.5, 0.01), m); f.position.set(sx, 0.015, 0); g.add(f); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.16, 12).rotateZ(Math.PI / 2), m); bar.position.y = 1.62; g.add(bar);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI * 1.3), m); hook.position.set(0, 1.58, 0.02); g.add(hook);
  const bench = new THREE.Group();
  const wood = pbr('wood', { tile: 0.8, metal0: true, color: 0xa08468 });
  const top = new THREE.Mesh(roundedBox(1.2, 0.05, 0.36, 0.012), wood); top.position.y = 0.42; bench.add(top);
  for (const sx of [-0.5, 0.5]) { const l = new THREE.Mesh(roundedBox(0.05, 0.4, 0.3, 0.008), m); l.position.set(sx, 0.2, 0); bench.add(l); }
  bench.position.set(0.95, 0, 0.15); g.add(bench);
  g.userData.bench = bench;
  return shadowAll(g);
}
