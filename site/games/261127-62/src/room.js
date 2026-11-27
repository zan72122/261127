// The dollhouse: floor, walls, door, windows, furniture, bedroom.
import * as THREE from 'three';
import { M, TX } from './mats.js';
import { L } from './layout.js';
import { rbox, lathe, cyl, ell, xf, merge, taperTube, curve, disc } from './geo.js';
import * as T from './tex.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function mesh(geo, mat, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m;
}

// wall with rectangular / arched holes; spans x0..x1 at given z (thickness along z)
function wallXY(x0, x1, h, holes, mat, t = L.wallT) {
  const s = new THREE.Shape(); s.moveTo(x0, -0.03); s.lineTo(x1, -0.03); s.lineTo(x1, h); s.lineTo(x0, h); s.lineTo(x0, -0.03);
  for (const hl of holes) {
    const p = new THREE.Path();
    if (hl.arch) {
      const r = (hl.x1 - hl.x0) / 2, cx = (hl.x0 + hl.x1) / 2, yt = hl.y1 - r;
      p.moveTo(hl.x0, hl.y0); p.lineTo(hl.x1, hl.y0); p.lineTo(hl.x1, yt); p.absarc(cx, yt, r, 0, Math.PI, false); p.lineTo(hl.x0, hl.y0);
    } else { p.moveTo(hl.x0, hl.y0); p.lineTo(hl.x1, hl.y0); p.lineTo(hl.x1, hl.y1); p.lineTo(hl.x0, hl.y1); p.lineTo(hl.x0, hl.y0); }
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 12 });
  // uv in meters -> wallpaper scale
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * 1.6);
  return mesh(g, mat, true, true);
}

// soft AO strip along a wall base / static contact shadow
function aoDecal(group, x, z, w, d, op = 0.5, rot = 0, y = 0.0012) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: TX.shadow, transparent: true, opacity: op, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, y, z); m.renderOrder = 1;
  group.add(m); return m;
}
function edgeAO(group, x0, x1, z, dir = 1, op = 0.35) {
  const { c, g } = T.canvas(4, 64); const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(60,35,20,0.55)'); gr.addColorStop(1, 'rgba(60,35,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 0.06), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.0011, z + dir * 0.03); if (dir < 0) m.rotation.z = Math.PI;
  m.renderOrder = 1; group.add(m); return m;
}

export function buildRoom(scene) {
  const R = new THREE.Group(); scene.add(R);
  const out = { group: R };
  const { room } = L;

  // ---------- base & floor ----------
  const base = mesh(rbox(room.x1 - room.x0 + 0.06, 0.045, room.z1 - room.z0 + 0.08, 0.008), M.base, false, true);
  base.position.set((room.x0 + room.x1) / 2, -0.0235, (room.z0 + room.z1) / 2 + 0.005); R.add(base);
  const floor = mesh(new THREE.PlaneGeometry(room.x1 - room.x0, room.z1 - room.z0 + 0.02), M.floor, false, true);
  floor.rotation.x = -Math.PI / 2; floor.position.set((room.x0 + room.x1) / 2, 0, (room.z0 + room.z1) / 2 + 0.01);
  const fuv = floor.geometry.attributes.uv; for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 1.7, fuv.getY(i) * 0.8);
  R.add(floor);
  // play mat around the house
  const mat = mesh(new THREE.PlaneGeometry(8, 8), M.rug, false, true); mat.rotation.x = -Math.PI / 2; mat.position.set(0.3, -0.046, 0.6); R.add(mat);

  // genkan tiles + step edge
  const gk = L.genkan;
  const tile = mesh(new THREE.PlaneGeometry(gk.x1 - gk.x0, gk.z1 - gk.z0), M.tile, false, true);
  tile.rotation.x = -Math.PI / 2; tile.position.set((gk.x0 + gk.x1) / 2, 0.0008, (gk.z0 + gk.z1) / 2); R.add(tile);
  const step = mesh(rbox(gk.x1 - gk.x0, 0.006, 0.012, 0.002), M.base, false, true); step.position.set((gk.x0 + gk.x1) / 2, 0.003, gk.z1 + 0.004); R.add(step);
  const step2 = mesh(rbox(0.012, 0.006, gk.z1 - gk.z0, 0.002), M.base, false, true); step2.position.set(gk.x1 + 0.004, 0.003, (gk.z0 + gk.z1) / 2); R.add(step2);

  // ---------- walls ----------
  const d = L.door, H = L.wallH, z0 = L.room.z0, wz = z0 - L.wallT;
  const back = wallXY(room.x0 - 0.02, room.x1 + 0.02, H, [
    { x0: d.hingeX, x1: d.hingeX + d.w, y0: -0.01, y1: d.h },
    { x0: L.win.x0, x1: L.win.x1, y0: L.win.y0, y1: L.win.y1, arch: true },
    { x0: L.win2.x0, x1: L.win2.x1, y0: L.win2.y0, y1: L.win2.y1, arch: true },
  ], M.wall);
  back.position.z = wz; R.add(back);
  // left wall
  const lw = mesh(new THREE.BoxGeometry(L.wallT, H, room.z1 - room.z0 + 0.03), M.wall, true, true);
  lw.position.set(room.x0 - 0.01, H / 2, (room.z0 + room.z1) / 2 - 0.01);
  const luv = lw.geometry.attributes.uv; for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * 1.3, luv.getY(i) * 0.8);
  R.add(lw);
  // right wall
  const rw = lw.clone(); rw.position.x = room.x1 + 0.01; R.add(rw);
  // divider (partial wall) between living and bedroom
  const dvLen = L.divZ1 - wz;
  const dv = mesh(rbox(0.024, H, dvLen, 0.008), M.wall, true, true); dv.position.set(L.divX, H / 2, wz + dvLen / 2); R.add(dv);
  // wall top caps (show the dollhouse cut)
  const capMat = M.trim;
  const cap = mesh(rbox(room.x1 - room.x0 + 0.06, 0.012, 0.03, 0.004), capMat, false, false); cap.position.set((room.x0 + room.x1) / 2, H + 0.004, wz + 0.01); R.add(cap);
  const capL = mesh(rbox(0.03, 0.012, room.z1 - room.z0 + 0.05, 0.004), capMat, false, false); capL.position.set(room.x0 - 0.01, H + 0.004, (room.z0 + room.z1) / 2); R.add(capL);
  const capR = capL.clone(); capR.position.x = room.x1 + 0.01; R.add(capR);
  const capD = mesh(rbox(0.032, 0.012, dvLen + 0.01, 0.004), capMat, false, false); capD.position.set(L.divX, H + 0.004, wz + dvLen / 2); R.add(capD);

  // gables above the back wall (dollhouse roof line)
  for (const [x0, x1, hp] of [[room.x0 - 0.03, L.divX + 0.015, 0.2], [L.divX - 0.015, room.x1 + 0.03, 0.15]]) {
    const cx = (x0 + x1) / 2, sh = new THREE.Shape(); sh.moveTo(x0, H - 0.01); sh.lineTo(x1, H - 0.01); sh.lineTo(cx, H + hp); sh.lineTo(x0, H - 0.01);
    const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.024, bevelEnabled: false }); gg.translate(0, 0, wz - 0.004);
    const guv = gg.attributes.uv; for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 1.6, guv.getY(i) * 1.6);
    R.add(mesh(gg, M.wall, true, true));
    const len = Math.hypot(cx - x0, hp + 0.01), ang = Math.atan2(hp + 0.01, cx - x0);
    for (const sgn of [1, -1]) {
      const r = mesh(rbox(len + 0.05, 0.022, 0.06, 0.006), M.pinkDeep, true, true);
      r.position.set((sgn > 0 ? (x0 + cx) / 2 : (cx + x1) / 2), H + hp / 2 + 0.012, wz + 0.01); r.rotation.z = sgn * ang; R.add(r);
    }
    const win = mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 28), M.mint, false, true); win.position.set(cx, H + hp * 0.42, wz + 0.022); R.add(win);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), new THREE.MeshPhysicalMaterial({ color: '#cfe8f2', roughness: 0.1, clearcoat: 1, emissive: '#9cc6da', emissiveIntensity: 0.25 })); gl.position.set(cx, H + hp * 0.42, wz + 0.02); R.add(gl);
  }
  // wainscot (milky pink lower wall) + rail, with gap for the door
  const wy = 0.115;
  const wsc = (x0, x1) => { if (x1 - x0 < 0.005) return; const m = mesh(rbox(x1 - x0, wy, 0.006, 0.002), M.wainscot, false, true); m.position.set((x0 + x1) / 2, wy / 2, z0 + 0.003); R.add(m);
    const rail = mesh(rbox(x1 - x0, 0.01, 0.012, 0.003), M.trim, true, true); rail.position.set((x0 + x1) / 2, wy + 0.004, z0 + 0.006); R.add(rail);
    const bb = mesh(rbox(x1 - x0, 0.018, 0.01, 0.003), M.trim, false, true); bb.position.set((x0 + x1) / 2, 0.009, z0 + 0.005); R.add(bb); };
  wsc(room.x0, d.hingeX - 0.012); wsc(d.hingeX + d.w + 0.012, L.divX - 0.012); wsc(L.divX + 0.012, room.x1);
  // left wall wainscot
  { const m = mesh(rbox(0.006, wy, room.z1 - room.z0, 0.002), M.wainscot, false, true); m.position.set(room.x0 + 0.003, wy / 2, (room.z0 + room.z1) / 2); R.add(m);
    const rail = mesh(rbox(0.012, 0.01, room.z1 - room.z0, 0.003), M.trim, true, true); rail.position.set(room.x0 + 0.005, wy + 0.004, (room.z0 + room.z1) / 2); R.add(rail);
    const m2 = m.clone(); m2.position.x = room.x1 - 0.003; R.add(m2); const r2 = rail.clone(); r2.position.x = room.x1 - 0.005; R.add(r2); }
  // wall-floor contact AO
  edgeAO(R, room.x0, room.x1, z0, 1, 0.45);
  { const e = edgeAO(R, room.z0, room.z1, 0, 1, 0.4); e.rotation.z = -Math.PI / 2; e.position.set(room.x0 + 0.03, 0.0011, (room.z0 + room.z1) / 2); }
  { const e = edgeAO(R, room.z0, room.z1, 0, 1, 0.4); e.rotation.z = Math.PI / 2; e.position.set(room.x1 - 0.03, 0.0011, (room.z0 + room.z1) / 2); }

  // ---------- outside: porch & garden ----------
  const pc = L.porch;
  const porch = mesh(new THREE.PlaneGeometry(pc.x1 - pc.x0 + 0.1, pc.z1 - pc.z0 + 0.1), M.stone, false, true);
  porch.rotation.x = -Math.PI / 2; porch.position.set((pc.x0 + pc.x1) / 2, pc.y, (pc.z0 + pc.z1) / 2 - 0.03); R.add(porch);
  const lawn = mesh(new THREE.PlaneGeometry(1.4, 0.4), new THREE.MeshStandardMaterial({ color: '#8fbf6e', roughness: 1 }), false, true);
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0.25, pc.y - 0.002, -0.62); R.add(lawn);
  const gardenPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.46), M.garden); gardenPlane.position.set(0.25, 0.16, -0.70); gardenPlane.renderOrder = -1; R.add(gardenPlane);
  // doormat outside
  const dm = mesh(rbox(0.13, 0.004, 0.06, 0.002), new THREE.MeshStandardMaterial({ color: '#b98d5c', roughness: 1, normalMap: TX.weave }), false, true);
  dm.position.set(d.x, pc.y + 0.002, -0.47); R.add(dm);
  // potted plants on the porch
  for (const px of [pc.x0 + 0.04, pc.x1 - 0.03]) {
    const pot = mesh(lathe([[0, 0], [0.018, 0], [0.024, 0.035], [0.026, 0.038], [0, 0.038]], 18), M.potTerracotta); pot.position.set(px, pc.y, -0.5); R.add(pot);
    const bush = mesh(merge([ell(0.028, 0.03, 0.028, 14, 10), xf(ell(0.02, 0.022, 0.02, 12, 8), [0.016, 0.018, 0]), xf(ell(0.018, 0.02, 0.018, 12, 8), [-0.014, 0.02, 0.006])]), M.leaf); bush.position.set(px, pc.y + 0.058, -0.5); R.add(bush);
  }
  // outside light through door: a soft bright panel on the porch floor (sunny)
  aoDecal(R, d.x, -0.51, 0.2, 0.12, 0.25, 0, pc.y + 0.001);

  // ---------- door ----------
  const doorG = new THREE.Group(); doorG.position.set(d.hingeX, 0, d.z); R.add(doorG);
  {
    const s = new THREE.Shape(); const w = d.w - 0.004, h = d.h - 0.003;
    s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, h); s.lineTo(0, h); s.lineTo(0, 0);
    const wx0 = w / 2 - 0.042, wx1 = w / 2 + 0.042, wy0 = 0.18, wy1 = 0.292, r = 0.042, cx = w / 2;
    const hole = new THREE.Path(); hole.moveTo(wx0, wy0); hole.lineTo(wx1, wy0); hole.lineTo(wx1, wy1 - r); hole.absarc(cx, wy1 - r, r, 0, Math.PI, false); hole.lineTo(wx0, wy0);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 16 });
    g.translate(0.002, 0, -0.006);
    const panel = mesh(g, M.mint); doorG.add(panel);
    // raised panels both sides
    for (const zs of [1, -1]) {
      for (const [px, py, pw, ph] of [[w / 2, 0.062, 0.1, 0.075], [w / 2, 0.142, 0.1, 0.05]]) {
        const p = mesh(rbox(pw, ph, 0.004, 0.003), M.mintDark, false, true); p.position.set(px + 0.002, py, zs * 0.007); doorG.add(p);
      }
      const frame = mesh(taperTube(curve([[wx0 + 0.002, wy0, 0], [wx0 + 0.002, wy1 - r, 0], [cx + 0.002 - r * 0.7, wy1 - r * 0.3, 0], [cx + 0.002, wy1, 0], [cx + 0.002 + r * 0.7, wy1 - r * 0.3, 0], [wx1 + 0.002, wy1 - r, 0], [wx1 + 0.002, wy0, 0]]), () => [0.0035, 0.0035], { segs: 40, radial: 6 }), M.cream, false, true);
      frame.position.z = zs * 0.0075; doorG.add(frame);
      const sill = mesh(rbox(0.088, 0.006, 0.006, 0.002), M.cream, false, true); sill.position.set(cx + 0.002, wy0, zs * 0.0075); doorG.add(sill);
      const knob = mesh(new THREE.SphereGeometry(0.0075, 16, 12), M.gold); knob.position.set(w - 0.018, 0.152, zs * 0.0125); doorG.add(knob);
      const rose = mesh(cyl(0.008, 0.008, 0.003, 16), M.gold); rose.rotation.x = Math.PI / 2; rose.position.set(w - 0.018, 0.152, zs * 0.0075); doorG.add(rose);
    }
    const glass = new THREE.Mesh(new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); sh.moveTo(wx0, wy0); sh.lineTo(wx1, wy0); sh.lineTo(wx1, wy1 - r); sh.absarc(cx, wy1 - r, r, 0, Math.PI, false); sh.lineTo(wx0, wy0); return sh; })(), 16), M.glass);
    glass.position.set(0.002, 0, 0); glass.renderOrder = 3; doorG.add(glass);
    // hinges
    for (const hy of [0.05, 0.27]) { const hn = mesh(cyl(0.004, 0.004, 0.028, 10), M.gold); hn.position.set(0.0, hy, 0.0); doorG.add(hn); }
    // hook point for a wreath (below the window)
    const dh = new THREE.Object3D(); dh.position.set(cx + 0.002, 0.118, 0.012); doorG.add(dh); out.doorHook = dh;
    out.doorKnob = new THREE.Object3D(); out.doorKnob.position.set(w - 0.018, 0.152, 0.0125); doorG.add(out.doorKnob);
  }
  out.door = doorG;
  // door frame trim on the wall (inside)
  {
    const f = M.trim, x0 = d.hingeX - 0.006, x1 = d.hingeX + d.w + 0.006;
    for (const x of [x0, x1]) { const m = mesh(rbox(0.014, d.h + 0.01, 0.01, 0.003), f, true, true); m.position.set(x, (d.h + 0.01) / 2, z0 + 0.004); R.add(m); }
    const top = mesh(rbox(d.w + 0.03, 0.016, 0.012, 0.004), f, true, true); top.position.set(d.x, d.h + 0.008, z0 + 0.004); R.add(top);
    const sill = mesh(rbox(d.w, 0.004, 0.024, 0.0015), M.base, false, true); sill.position.set(d.x, 0.002, z0 - 0.01); R.add(sill);
  }

  // ---------- windows ----------
  for (const wn of [L.win, L.win2]) {
    const cx = (wn.x0 + wn.x1) / 2, w = wn.x1 - wn.x0, r = w / 2, yt = wn.y1 - r;
    const fr = [[wn.x0, wn.y0, 0], [wn.x0, yt, 0], [cx - r * 0.7, yt + r * 0.7, 0], [cx, wn.y1, 0], [cx + r * 0.7, yt + r * 0.7, 0], [wn.x1, yt, 0], [wn.x1, wn.y0, 0]];
    const frame = mesh(taperTube(curve(fr), () => [0.006, 0.006], { segs: 48, radial: 6 }), M.mint, true, true); frame.position.z = z0 - 0.008; R.add(frame);
    const sill = mesh(rbox(w + 0.03, 0.01, 0.03, 0.003), M.trim, true, true); sill.position.set(cx, wn.y0 - 0.003, z0 - 0.003); R.add(sill);
    const mv = mesh(rbox(0.005, wn.y1 - wn.y0 - 0.004, 0.005, 0.0015), M.mint, false, false); mv.position.set(cx, (wn.y0 + wn.y1) / 2 - 0.002, z0 - 0.011); R.add(mv);
    const mh = mesh(rbox(w - 0.004, 0.005, 0.005, 0.0015), M.mint, false, false); mh.position.set(cx, wn.y0 + (yt - wn.y0) * 0.62, z0 - 0.011); R.add(mh);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, wn.y1 - wn.y0), M.glass); gl.position.set(cx, (wn.y0 + wn.y1) / 2, z0 - 0.012); gl.renderOrder = 3; R.add(gl);
    // curtains (pink fabric with folds), tied back
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.05, wn.y1 - wn.y0 + 0.05, 10, 12), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), t = (y + (wn.y1 - wn.y0) / 2) / (wn.y1 - wn.y0); const pinch = 1 - 0.55 * Math.exp(-Math.pow((t - 0.35) * 5, 2)); p.setX(i, x * pinch + side * (1 - pinch) * 0.012); p.setZ(i, Math.sin(x * 260) * 0.0035 * pinch + 0.004); }
      g.computeVertexNormals();
      const cu = mesh(g, M.satin, true, true); cu.position.set(side < 0 ? wn.x0 - 0.008 : wn.x1 + 0.008, (wn.y0 + wn.y1) / 2 + 0.01, z0 + 0.001); R.add(cu);
    }
    const rod = mesh(cyl(0.003, 0.003, w + 0.11, 10), M.gold); rod.rotation.z = Math.PI / 2; rod.position.set(cx, wn.y1 + 0.03, z0 + 0.005); R.add(rod);
  }
  // sunlight patch on floor below the living window
  {
    const { c, g } = T.canvas(128, 128); const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.55 }));
    sun.rotation.x = -Math.PI / 2; sun.rotation.z = 0.25; sun.position.set((L.win.x0 + L.win.x1) / 2 + 0.02, 0.0015, z0 + 0.09); sun.renderOrder = 2; R.add(sun);
  }

  // ---------- wall hooks (留め具) ----------
  out.hooks = L.hooks.map(h => {
    const g = new THREE.Group(); g.position.set(h.x, h.y, h.z);
    const plate = mesh(cyl(0.007, 0.007, 0.003, 18), M.gold); plate.rotation.x = Math.PI / 2; g.add(plate);
    const peg = mesh(taperTube(curve([[0, 0, 0], [0, 0, 0.008], [0, 0.004, 0.011]]), () => [0.0018, 0.0018], { segs: 8, radial: 6 }), M.gold); g.add(peg);
    R.add(g); return g;
  });

  // ---------- shoe shelf ----------
  {
    const s = L.shelf, w = s.x1 - s.x0, dd = s.z1 - s.z0, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const parts = [];
    parts.push(xf(rbox(0.008, s.top, dd, 0.002), [s.x0 + 0.004, s.top / 2, cz]));
    parts.push(xf(rbox(0.008, s.top, dd, 0.002), [s.x1 - 0.004, s.top / 2, cz]));
    parts.push(xf(rbox(w, 0.008, dd, 0.002), [cx, s.top - 0.004, cz]));
    parts.push(xf(rbox(w - 0.012, 0.007, dd - 0.004, 0.002), [cx, s.tiers[0] - 0.0035, cz]));
    parts.push(xf(rbox(w - 0.012, 0.007, dd - 0.004, 0.002), [cx, s.tiers[1] - 0.0035, cz]));
    parts.push(xf(rbox(w - 0.012, s.top - 0.01, 0.004, 0.001), [cx, s.top / 2, s.z0 + 0.003]));
    const sh = mesh(merge(parts), M.pink); R.add(sh);
    aoDecal(R, cx, cz + 0.005, w + 0.05, dd + 0.05, 0.45);
    // little plant on top
    const pot = mesh(lathe([[0, 0], [0.012, 0], [0.015, 0.022], [0, 0.022]], 16), M.ceramicWhite); pot.position.set(s.x1 - 0.024, s.top, cz); R.add(pot);
    const pl = mesh(merge([ell(0.016, 0.014, 0.014, 12, 8), xf(ell(0.01, 0.012, 0.01, 10, 8), [0.01, 0.008, 0])]), M.leaf); pl.position.set(s.x1 - 0.024, s.top + 0.03, cz); R.add(pl);
  }

  // ---------- table ----------
  {
    const t = L.table;
    const top = mesh(lathe([[0, -0.012], [t.r - 0.004, -0.012], [t.r, -0.008], [t.r + 0.001, -0.004], [t.r - 0.002, 0], [0, 0]], 48), M.pink); top.position.set(t.x, t.top - 0.003, t.z); R.add(top);
    const col = mesh(lathe([[0.014, 0], [0.034, 0], [0.036, 0.006], [0.018, 0.012], [0.011, 0.03], [0.009, 0.06], [0.012, 0.085], [0.03, 0.093], [0, 0.093]], 32), M.pink); col.position.set(t.x, 0, t.z); R.add(col);
    // lace doily
    const { c, g } = T.canvas(256, 256); g.translate(128, 128);
    g.fillStyle = '#ffffff'; g.beginPath();
    for (let i = 0; i <= 360; i++) { const a = i / 360 * Math.PI * 2, rr = 120 + Math.sin(a * 24) * 6; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let ring = 0; ring < 3; ring++) { const rr = 104 - ring * 26, n = 24 - ring * 4; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, 5 - ring, 0, 7); g.fill(); } }
    const dt = new THREE.CanvasTexture(c); dt.colorSpace = THREE.SRGBColorSpace;
    const doily = mesh(new THREE.CircleGeometry(t.r * 0.82, 48), new THREE.MeshPhysicalMaterial({ map: dt, transparent: true, alphaTest: 0.5, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#ffffff'), normalMap: TX.weaveFine }), false, true);
    doily.rotation.x = -Math.PI / 2; doily.position.set(t.x, t.top + 0.0006, t.z); R.add(doily);
    aoDecal(R, t.x, t.z, 0.16, 0.16, 0.55);
    aoDecal(R, t.x + 0.03, t.z - 0.03, 0.3, 0.3, 0.22);
  }

  // ---------- chairs ----------
  out.chairs = L.chairs.map((c, i) => {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = c.yaw;
    if (i === 3) {
      const pouf = mesh(lathe([[0, 0], [0.03, 0], [0.036, 0.008], [0.038, 0.03], [0.035, 0.05], [0.028, 0.056], [0, 0.057]], 28), new THREE.MeshPhysicalMaterial({ color: '#c9e8dc', roughness: 0.85, normalMap: TX.weave, sheen: 1, sheenColor: new THREE.Color('#f2fff9') }));
      g.add(pouf);
      const btn = mesh(new THREE.SphereGeometry(0.004, 10, 8), M.pinkDeep); btn.position.y = 0.057; g.add(btn);
    } else {
      const parts = [];
      parts.push(xf(rbox(0.062, 0.01, 0.058, 0.004), [0, 0.046, 0]));
      for (const [lx, lz] of [[-0.024, -0.022], [0.024, -0.022], [-0.024, 0.022], [0.024, 0.022]]) parts.push(xf(cyl(0.004, 0.0035, 0.044, 10), [lx, 0.022, lz]));
      // back rest (behind the sitter: -z local)
      parts.push(xf(cyl(0.004, 0.004, 0.07, 10), [-0.024, 0.085, -0.026]));
      parts.push(xf(cyl(0.004, 0.004, 0.07, 10), [0.024, 0.085, -0.026]));
      const heart = new THREE.Shape(); heart.moveTo(0, -0.022); heart.bezierCurveTo(-0.04, 0.0, -0.03, 0.03, -0.012, 0.028); heart.bezierCurveTo(-0.004, 0.027, 0, 0.02, 0, 0.016); heart.bezierCurveTo(0, 0.02, 0.004, 0.027, 0.012, 0.028); heart.bezierCurveTo(0.03, 0.03, 0.04, 0.0, 0, -0.022);
      const hg = new THREE.ExtrudeGeometry(heart, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 12 });
      parts.push(xf(hg, [0, 0.112, -0.03]));
      const ch = mesh(merge(parts), M.pink); g.add(ch);
      const cushion = mesh(rbox(0.054, 0.007, 0.05, 0.0035), new THREE.MeshPhysicalMaterial({ color: '#fff3f5', roughness: 0.85, normalMap: TX.weave, sheen: 1, sheenColor: new THREE.Color('#ffffff') }), true, true);
      cushion.position.y = 0.0545; g.add(cushion);
    }
    R.add(g);
    aoDecal(R, c.x, c.z, 0.085, 0.085, 0.45);
    return g;
  });

  // ---------- tea trolley ----------
  {
    const t = L.trolley, w = t.x1 - t.x0, dd = t.z1 - t.z0, cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
    const parts = [xf(rbox(w, 0.008, dd, 0.003), [cx, t.top - 0.004, cz]), xf(rbox(w - 0.01, 0.006, dd - 0.01, 0.003), [cx, 0.045, cz])];
    for (const [lx, lz] of [[t.x0 + 0.006, t.z0 + 0.006], [t.x1 - 0.006, t.z0 + 0.006], [t.x0 + 0.006, t.z1 - 0.006], [t.x1 - 0.006, t.z1 - 0.006]]) parts.push(xf(cyl(0.003, 0.003, t.top - 0.012, 8), [lx, (t.top - 0.012) / 2 + 0.008, lz]));
    parts.push(xf(new THREE.TorusGeometry(0.02, 0.0025, 6, 16, Math.PI), [t.x1 + 0.002, t.top + 0.002, cz], [0, Math.PI / 2, 0]));
    R.add(mesh(merge(parts), M.cream));
    for (const [lx, lz] of [[t.x0 + 0.006, t.z0 + 0.006], [t.x1 - 0.006, t.z0 + 0.006], [t.x0 + 0.006, t.z1 - 0.006], [t.x1 - 0.006, t.z1 - 0.006]]) { const wh = mesh(cyl(0.007, 0.007, 0.004, 14), M.pinkDeep); wh.rotation.z = Math.PI / 2; wh.position.set(lx, 0.007, lz); R.add(wh); }
    aoDecal(R, cx, cz, w + 0.05, dd + 0.05, 0.4);
  }

  // ---------- toy basket for decorations ----------
  {
    const b = L.basket;
    const bk = mesh(lathe([[0, 0], [0.04, 0], [0.046, 0.004], [0.05, 0.03], [0.052, 0.032], [0.048, 0.032], [0.044, 0.006], [0, 0.006]], 32), new THREE.MeshPhysicalMaterial({ color: '#e7c793', roughness: 0.8, normalMap: TX.straw, normalScale: new THREE.Vector2(1.2, 1.2) }));
    bk.position.set(b.x, 0, b.z); R.add(bk);
    aoDecal(R, b.x, b.z, 0.13, 0.13, 0.5);
  }

  // ---------- bedroom ----------
  {
    const b = L.bed, w = b.x1 - b.x0, dd = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const frame = [];
    frame.push(xf(rbox(w, 0.02, dd, 0.004), [cx, 0.03, cz]));
    for (const [lx, lz] of [[b.x0 + 0.01, b.z0 + 0.01], [b.x1 - 0.01, b.z0 + 0.01], [b.x0 + 0.01, b.z1 - 0.01], [b.x1 - 0.01, b.z1 - 0.01]]) frame.push(xf(cyl(0.006, 0.005, 0.03, 10), [lx, 0.012, lz]));
    // headboard (left end) with arch, footboard (right end)
    const hb = new THREE.Shape(); hb.moveTo(-dd / 2, 0); hb.lineTo(dd / 2, 0); hb.lineTo(dd / 2, 0.12); hb.quadraticCurveTo(dd / 2, 0.165, 0, 0.17); hb.quadraticCurveTo(-dd / 2, 0.165, -dd / 2, 0.12); hb.lineTo(-dd / 2, 0);
    const hbg = new THREE.ExtrudeGeometry(hb, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 16 });
    frame.push(xf(hbg.clone(), [b.x0 + 0.006, 0.0, cz], [0, Math.PI / 2, 0]));
    const fb = new THREE.Shape(); fb.moveTo(-dd / 2, 0); fb.lineTo(dd / 2, 0); fb.lineTo(dd / 2, 0.075); fb.quadraticCurveTo(0, 0.1, -dd / 2, 0.075); fb.lineTo(-dd / 2, 0);
    frame.push(xf(new THREE.ExtrudeGeometry(fb, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 12 }), [b.x1 - 0.016, 0.0, cz], [0, Math.PI / 2, 0]));
    R.add(mesh(merge(frame), M.pink));
    const heartG = new THREE.Shape(); heartG.moveTo(0, -0.014); heartG.bezierCurveTo(-0.026, 0.0, -0.02, 0.02, -0.008, 0.019); heartG.bezierCurveTo(-0.002, 0.018, 0, 0.013, 0, 0.011); heartG.bezierCurveTo(0, 0.013, 0.002, 0.018, 0.008, 0.019); heartG.bezierCurveTo(0.02, 0.02, 0.026, 0.0, 0, -0.014);
    const hm = mesh(new THREE.ExtrudeGeometry(heartG, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2 }), M.mint); hm.rotation.y = Math.PI / 2; hm.position.set(b.x0 + 0.021, 0.125, cz); R.add(hm);
    const mattress = mesh(rbox(w - 0.03, 0.022, dd - 0.006, 0.008), M.sheet); mattress.position.set(cx + 0.002, b.top - 0.011, cz); R.add(mattress);
    out.pillows = b.spots.map(z => { const p = mesh(rbox(0.05, 0.016, 0.07, 0.008, 4), M.pillow); p.position.set(b.x0 + 0.045, b.top + 0.006, z); R.add(p); return p; });
    aoDecal(R, cx, cz + 0.01, w + 0.08, dd + 0.08, 0.5);
    // nightstand + lamp
    const n = L.night, nw = n.x1 - n.x0, nd = n.z1 - n.z0, ncx = (n.x0 + n.x1) / 2, ncz = (n.z0 + n.z1) / 2;
    R.add(mesh(merge([xf(rbox(nw, n.top, nd, 0.005), [ncx, n.top / 2, ncz])]), M.cream));
    const knob = mesh(new THREE.SphereGeometry(0.004, 10, 8), M.gold); knob.position.set(ncx, n.top * 0.55, n.z1 + 0.001); R.add(knob);
    const lampBase = mesh(lathe([[0, 0], [0.012, 0], [0.008, 0.008], [0.003, 0.012], [0.003, 0.04], [0, 0.04]], 16), M.gold); lampBase.position.set(ncx, n.top, ncz); R.add(lampBase);
    const shade = mesh(lathe([[0.022, 0], [0.014, 0.03], [0, 0.03]], 20), new THREE.MeshPhysicalMaterial({ color: '#fff1e0', emissive: '#ffcf8a', emissiveIntensity: 0.6, roughness: 0.7, side: THREE.DoubleSide, sheen: 0.5 }), true, false);
    shade.position.set(ncx, n.top + 0.032, ncz); R.add(shade); out.lampShade = shade;
    aoDecal(R, ncx, ncz, 0.12, 0.1, 0.45);
    // round rug
    const rugM = new THREE.MeshPhysicalMaterial({ color: '#f6d9e0', roughness: 0.95, normalMap: TX.weave, normalScale: new THREE.Vector2(1.5, 1.5), sheen: 1, sheenColor: new THREE.Color('#fff') });
    const rugB = mesh(disc(0.12, 0.003, 48, 0.4), rugM, false, true); rugB.scale.set(1, 1, 0.75); rugB.position.set(0.72, 0, 0.04); R.add(rugB);
    // living room rug under the table
    const rugL = mesh(disc(0.19, 0.0025, 48, 0.4), new THREE.MeshPhysicalMaterial({ color: '#d8efe5', roughness: 0.95, normalMap: TX.weave, normalScale: new THREE.Vector2(1.5, 1.5), sheen: 1, sheenColor: new THREE.Color('#fff') }), false, true);
    rugL.scale.set(1.2, 1, 0.8); rugL.position.set(L.table.x, 0, L.table.z + 0.02); R.add(rugL);
  }

  // wall picture frames (decor)
  {
    const pf = mesh(rbox(0.07, 0.055, 0.006, 0.002), M.gold); pf.position.set(room.x0 + 0.07, 0.30, z0 - 0.001); R.add(pf);
    const { c, g } = T.canvas(64, 48); g.fillStyle = '#cfe9f5'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#8fcf8a'; g.beginPath(); g.arc(20, 50, 26, 0, 7); g.fill(); g.beginPath(); g.arc(50, 52, 22, 0, 7); g.fill(); g.fillStyle = '#ffe28a'; g.beginPath(); g.arc(48, 12, 7, 0, 7); g.fill();
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.043), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6 })); pic.position.set(room.x0 + 0.07, 0.30, z0 + 0.0025); R.add(pic);
  }
  // wall lamp glow in bedroom (static soft light on the wall)
  {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.22), new THREE.MeshBasicMaterial({ map: TX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, toneMapped: false }));
    s.position.set((L.night.x0 + L.night.x1) / 2, 0.16, z0 + 0.004); R.add(s); out.lampGlow = s;
  }
  mergeStatic(R, [doorG]);
  return out;
}

// merge static opaque meshes by material to cut draw calls
function mergeStatic(R, exclude) {
  R.updateMatrixWorld(true);
  const skip = new Set();
  for (const e of exclude) e.traverse(o => skip.add(o));
  const groups = new Map(), victims = [];
  R.traverse(o => {
    if (!o.isMesh || skip.has(o) || Array.isArray(o.material)) return;
    const m = o.material; if (m.transparent || m.blending !== THREE.NormalBlending || o.renderOrder) return;
    const key = m.uuid + '|' + o.castShadow + '|' + o.receiveShadow;
    if (!groups.has(key)) groups.set(key, { m, cast: o.castShadow, recv: o.receiveShadow, list: [] });
    groups.get(key).list.push(o);
  });
  for (const g of groups.values()) {
    if (g.list.length < 2) continue;
    const geos = g.list.map(o => { let q = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') q.deleteAttribute(k); if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2)); q.applyMatrix4(o.matrixWorld); return q; });
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    const mesh = new THREE.Mesh(merged, g.m); mesh.castShadow = g.cast; mesh.receiveShadow = g.recv; R.add(mesh);
    for (const o of g.list) o.parent.remove(o);
  }
}
