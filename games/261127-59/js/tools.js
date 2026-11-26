// First-person rig: the girl's white-gloved hands, uniform sleeves, bamboo broom and bamboo rake.
import { T, scene, camera, tex } from './core.js';
import { clothMaterial, noise3, loadBin } from './sdf.js';
import { mergeGeometries } from './BufferGeometryUtils.js';

const GLOVE = [0.74, 0.73, 0.70];
const WOOL = [0.34, 0.055, 0.07];
const GOLD = [0.78, 0.6, 0.3];
const R = 0.0145;
export const sharedCloth = clothMaterial({ sheen: 0.35, sheenRoughness: 0.8, sheenColor: new T.Color().setRGB(0.6, 0.6, 0.58, T.SRGBColorSpace) });
export const woolCloth = clothMaterial({ sheen: 0.5, sheenColor: new T.Color().setRGB(0.42, 0.14, 0.13, T.SRGBColorSpace), sheenRoughness: 0.7 });

export const rig = {
  group: new T.Group(),
  hands: [], // {grip, open, group}
  sleeves: [],
  broom: null, rake: null,
  tool: 'none', // 'broom' | 'rake' | 'none'
  P: new T.Vector3(0, 0, -2), // contact point
  vel: new T.Vector3(),
  press: 0, bend: 0,
  pose: 'tool', // 'tool' | 'clap' | 'cheer' | 'oops' | 'poke' | 'rest'
  poseT: 0, poke: new T.Vector3(), pokeT: 0,
  visible: false,
};
scene.add(rig.group);

// ------------------------------------------------------------ sleeves (dynamic tube)
const SLV_SEG = 22, SLV_RAD = 18;
function makeSleeve() {
  const n = (SLV_SEG + 1) * (SLV_RAD + 1);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new T.BufferAttribute(new Float32Array(n * 3), 3));
  const col = new Float32Array(n * 3), mat = new Float32Array(n), rough = new Float32Array(n), rest = new Float32Array(n * 3);
  for (let i = 0; i <= SLV_SEG; i++) for (let j = 0; j <= SLV_RAD; j++) {
    const k = i * (SLV_RAD + 1) + j;
    const s = i / SLV_SEG;
    const a = (j / SLV_RAD) * Math.PI * 2;
    // gold braid band near the wrist, brass button
    const braid = s > 0.03 && s < 0.042;
    const c = (braid ? GOLD : WOOL).map((v) => Math.pow(v, 2.2));
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    mat[k] = braid ? 7 : 2; rough[k] = braid ? 0.38 : 0.86;
    rest[k * 3] = Math.cos(a) * 0.04; rest[k * 3 + 1] = s * 0.55; rest[k * 3 + 2] = Math.sin(a) * 0.04;
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.setAttribute('aMat', new T.BufferAttribute(mat, 1));
  g.setAttribute('aRough', new T.BufferAttribute(rough, 1));
  g.setAttribute('aRest', new T.BufferAttribute(rest, 3));
  const ind = [];
  for (let i = 0; i < SLV_SEG; i++) for (let j = 0; j < SLV_RAD; j++) {
    const a = i * (SLV_RAD + 1) + j, b = a + SLV_RAD + 1;
    ind.push(a, b, a + 1, b, b + 1, a + 1);
  }
  g.setIndex(ind);
  const m = new T.Mesh(g, woolCloth);
  m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
  return m;
}
const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _t = new T.Vector3(), _n = new T.Vector3(), _bn = new T.Vector3();
// update sleeve along quadratic bezier wrist->elbow->shoulder with radius profile and folds
function updateSleeve(m, wrist, elbow, shoulder, wristDir, phase) {
  const p = m.geometry.attributes.position.array;
  const curve = new T.QuadraticBezierCurve3(wrist, elbow, shoulder);
  const pts = curve.getPoints(SLV_SEG);
  let ref = new T.Vector3().subVectors(shoulder, wrist).cross(new T.Vector3(0, 1, 0)).normalize();
  if (ref.lengthSq() < 0.1) ref.set(1, 0, 0);
  for (let i = 0; i <= SLV_SEG; i++) {
    const s = i / SLV_SEG;
    curve.getTangent(Math.min(0.999, Math.max(0.001, s)), _t);
    _n.copy(ref).sub(_c.copy(_t).multiplyScalar(ref.dot(_t))).normalize();
    _bn.crossVectors(_t, _n);
    // radius: cuff opening ~3.3cm, widening up the arm, bunching folds near wrist/elbow
    const r0 = 0.034 + 0.018 * Math.min(1, s * 1.6);
    for (let j = 0; j <= SLV_RAD; j++) {
      const a = (j / SLV_RAD) * Math.PI * 2;
      const fold = 0.004 * Math.sin(s * 46 + Math.sin(a * 2) * 1.2 + phase) * Math.exp(-Math.pow((s - 0.15) / 0.12, 2))
        + 0.005 * Math.sin(a * 3 + s * 20) * Math.exp(-Math.pow((s - 0.5) / 0.1, 2))
        + 0.0025 * noise3(s * 9, Math.cos(a) * 2, Math.sin(a) * 2);
      const cuffLip = s < 0.03 ? -0.002 : 0;
      const r = r0 + fold + cuffLip;
      const k = (i * (SLV_RAD + 1) + j) * 3;
      p[k] = pts[i].x + (_n.x * Math.cos(a) + _bn.x * Math.sin(a)) * r;
      p[k + 1] = pts[i].y + (_n.y * Math.cos(a) + _bn.y * Math.sin(a)) * r;
      p[k + 2] = pts[i].z + (_n.z * Math.cos(a) + _bn.z * Math.sin(a)) * r;
    }
  }
  m.geometry.attributes.position.needsUpdate = true;
  m.geometry.computeVertexNormals();
}

// ------------------------------------------------------------ broom (bamboo, twig head)
function bambooMat() {
  return new T.MeshStandardMaterial({ map: tex('bamboo_albedo.jpg', { srgb: true }), normalMap: tex('bamboo_normal.jpg'), roughness: 0.45 });
}
function handleGeo(len) {
  const g = new T.CylinderGeometry(R, R * 1.05, len, 16, 12);
  g.translate(0, len / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * len / 0.42);
  return g;
}
export const broomUniforms = { uBend: { value: new T.Vector3() } };
export function buildBroom() {
  const grp = new T.Group();
  const h = new T.Mesh(handleGeo(1.28), bambooMat());
  h.position.y = 0.3; h.castShadow = true;
  grp.add(h);
  // twigs: thin tubes from the binding (y 0.3..0.42) fanning to tips at y ~ 0
  const parts = [];
  const rnd = (() => { let s = 77; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 170; i++) {
    const u = (rnd() - 0.5) * 2;
    const tipX = u * 0.2 + (rnd() - 0.5) * 0.03, tipZ = (rnd() - 0.5) * 0.06;
    const root = new T.Vector3((rnd() - 0.5) * 0.02, 0.42 + rnd() * 0.04, (rnd() - 0.5) * 0.02);
    const mid = new T.Vector3(tipX * 0.45 + (rnd() - 0.5) * 0.03, 0.2, tipZ * 0.5 + (rnd() - 0.5) * 0.02);
    const tip = new T.Vector3(tipX, rnd() * 0.03, tipZ);
    const c = new T.QuadraticBezierCurve3(root, mid, tip);
    const tg = new T.TubeGeometry(c, 7, 0.0016 + rnd() * 0.0014, 4, false);
    // side twiglets
    parts.push(tg);
    if (rnd() < 0.5) {
      const s0 = c.getPoint(0.6), s1 = s0.clone().add(new T.Vector3((rnd() - 0.5) * 0.06, -0.06 - rnd() * 0.05, (rnd() - 0.5) * 0.03));
      parts.push(new T.TubeGeometry(new T.LineCurve3(s0, s1), 2, 0.0008, 3, false));
    }
  }
  const tg = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
  const col = new Float32Array(tg.attributes.position.count * 3);
  for (let i = 0; i < tg.attributes.position.count; i++) {
    const v = 0.75 + Math.random() * 0.45, yy = tg.attributes.position.getY(i);
    col[i * 3] = Math.pow(0.5 * v, 2.2); col[i * 3 + 1] = Math.pow(0.38 * v * (0.9 + yy * 0.3), 2.2); col[i * 3 + 2] = Math.pow(0.22 * v, 2.2);
  }
  tg.setAttribute('color', new T.BufferAttribute(col, 3));
  const twigMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
  twigMat.onBeforeCompile = (sh) => {
    sh.uniforms.uBend = broomUniforms.uBend;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uBend;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bw = pow(clamp(1.0 - transformed.y / 0.42, 0.0, 1.0), 2.0);
        transformed.xz += uBend.xz * bw * 0.09;
        transformed.y += abs(uBend.y) * bw * 0.03;
        transformed.x *= 1.0 + abs(uBend.y) * bw * 0.25;`);
  };
  const tw = new T.Mesh(tg, twigMat);
  tw.castShadow = true;
  grp.add(tw);
  // wire bindings
  for (const y of [0.33, 0.41]) {
    const w = new T.Mesh(new T.TorusGeometry(0.019, 0.0018, 6, 20), new T.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.8, roughness: 0.5 }));
    w.rotation.x = Math.PI / 2; w.position.y = y; grp.add(w);
  }
  return grp;
}
export function buildRake() {
  const grp = new T.Group();
  const h = new T.Mesh(handleGeo(1.25), bambooMat());
  h.position.y = 0.34; h.castShadow = true;
  grp.add(h);
  const parts = [];
  const N = 17;
  for (let i = 0; i < N; i++) {
    const u = (i / (N - 1)) * 2 - 1;
    const tipX = u * 0.24;
    const pts = [new T.Vector3(u * 0.01, 0.42, 0), new T.Vector3(tipX * 0.55, 0.2, 0.0), new T.Vector3(tipX * 0.95, 0.05, 0.0), new T.Vector3(tipX, 0.012, -0.03), new T.Vector3(tipX, 0.0, -0.05)];
    const c = new T.CatmullRomCurve3(pts);
    const g = new T.TubeGeometry(c, 16, 0.0035, 4, false);
    g.scale(1, 1, 0.6);
    parts.push(g);
  }
  const cross = new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(-0.15, 0.17, 0.006), new T.Vector3(0, 0.185, 0.008), new T.Vector3(0.15, 0.17, 0.006)]), 12, 0.004, 5, false);
  parts.push(cross);
  const g = mergeGeometries(parts);
  const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: tex('bamboo_albedo.jpg', { srgb: true }), normalMap: tex('bamboo_normal.jpg'), roughness: 0.5, color: new T.Color().setRGB(1.0, 0.95, 0.85, T.SRGBColorSpace) }));
  m.castShadow = true;
  grp.add(m);
  return grp;
}

export async function buildRig() {
  const [gg, go] = await Promise.all([loadBin('bin/hand_grip.bin'), loadBin('bin/hand_open.bin')]);
  for (let side = 0; side < 2; side++) {
    const grp = new T.Group();
    const grip = new T.Mesh(gg, sharedCloth);
    const open = new T.Mesh(go, sharedCloth);
    for (const m of [grip, open]) { m.castShadow = true; m.receiveShadow = true; if (side === 1) m.scale.z = -1; }
    open.visible = false;
    grp.add(grip, open);
    rig.group.add(grp);
    rig.hands.push({ grp, grip, open });
    const s = makeSleeve();
    rig.group.add(s);
    rig.sleeves.push(s);
  }
  rig.broom = buildBroom();
  rig.rake = buildRake();
  rig.group.add(rig.broom, rig.rake);
  rig.rake.visible = false;
  rig.group.visible = false;
}

// ------------------------------------------------------------ per-frame posing
const up = new T.Vector3(0, 1, 0);
const _D = new T.Vector3(), _W = new T.Vector3(), _F = new T.Vector3(), _m = new T.Matrix4(), _q = new T.Quaternion();
const camR = new T.Vector3(), camU = new T.Vector3(), camF = new T.Vector3();
const shoulders = [new T.Vector3(), new T.Vector3()];
function setHandFrame(h, pos, axisY, toArm) {
  // local Y = handle axis, local X = toward forearm (perpendicular), Z = X x Y
  const X = _c.copy(toArm).sub(_t.copy(axisY).multiplyScalar(toArm.dot(axisY))).normalize();
  const Z = _n.crossVectors(X, axisY).normalize();
  _m.makeBasis(X, axisY, Z);
  h.grp.quaternion.setFromRotationMatrix(_m);
  h.grp.position.copy(pos);
}
const wristLocal = new T.Vector3(0.078, -0.022, 0.0);
export function updateRig(dt, t) {
  rig.group.visible = rig.visible;
  if (!rig.visible) return;
  camera.updateMatrixWorld();
  camR.setFromMatrixColumn(camera.matrixWorld, 0);
  camU.setFromMatrixColumn(camera.matrixWorld, 1);
  camF.setFromMatrixColumn(camera.matrixWorld, 2).negate();
  const flatF = _F.set(camF.x, 0, camF.z).normalize();
  const flatR = _W.set(camR.x, 0, camR.z).normalize();
  for (let s = 0; s < 2; s++) {
    const sx = s === 0 ? 0.17 : -0.17;
    shoulders[s].copy(camera.position).addScaledVector(flatR, sx).addScaledVector(up, -0.27).addScaledVector(flatF, -0.05);
  }
  const tool = rig.tool === 'broom' ? rig.broom : rig.tool === 'rake' ? rig.rake : null;
  rig.broom.visible = rig.tool === 'broom';
  rig.rake.visible = rig.tool === 'rake';
  const useTool = tool && rig.pose === 'tool';
  for (const h of rig.hands) { h.grip.visible = useTool; h.open.visible = !useTool; }
  if (useTool) {
    // lower hand at a child's natural reach; the handle runs from the broom head on the ground through it
    const H1 = new T.Vector3().copy(camera.position).addScaledVector(flatF, 0.5).addScaledVector(up, -0.37).addScaledVector(flatR, 0.09);
    const D = _D.copy(H1).sub(rig.P);
    const dist = D.length();
    D.normalize();
    const Wd = _b.crossVectors(D, up).normalize().negate();
    const Z = _c.crossVectors(Wd, D).normalize();
    _m.makeBasis(Wd, D, Z);
    tool.quaternion.setFromRotationMatrix(_m);
    tool.position.copy(rig.P).addScaledVector(D, -0.005);
    // the tool's handle is long enough to reach past the hands
    const base = tool === rig.broom ? 0.3 : 0.34;
    const hl = Math.max(1.0, dist + 0.42 - base);
    tool.children[0].scale.y = hl / (tool === rig.broom ? 1.28 : 1.25);
    // bend twigs opposite to motion
    const vloc = new T.Vector3(rig.vel.dot(Wd), rig.press, rig.vel.dot(Z));
    broomUniforms.uBend.value.lerp(new T.Vector3(-Math.max(-1, Math.min(1, vloc.x * 0.6)), rig.press, -Math.max(-1, Math.min(1, vloc.z * 0.6))), 1 - Math.exp(-dt * 12));
    const grips = [dist, dist + 0.27];
    for (let s = 0; s < 2; s++) {
      const h = rig.hands[s];
      const gp = new T.Vector3().copy(rig.P).addScaledVector(D, grips[s]);
      const toArm = new T.Vector3().copy(shoulders[s]).sub(gp);
      setHandFrame(h, gp, D, toArm);
    }
  } else {
    // free-hand poses (open gloves)
    const k = rig.poseT;
    for (let s = 0; s < 2; s++) {
      const h = rig.hands[s];
      const sgn = s === 0 ? 1 : -1;
      const base = new T.Vector3().copy(camera.position).addScaledVector(flatF, 0.38).addScaledVector(up, -0.36).addScaledVector(flatR, 0.14 * sgn);
      const axis = new T.Vector3(0, 1, 0);
      let toArm = new T.Vector3().copy(shoulders[s]).sub(base);
      if (rig.pose === 'clap') {
        const c = Math.abs(Math.sin(k * 9));
        base.addScaledVector(flatR, -0.11 * sgn * (1 - c)).addScaledVector(up, 0.1);
        axis.copy(flatF).multiplyScalar(0.4).add(up).normalize();
        toArm = new T.Vector3().copy(flatR).multiplyScalar(sgn).add(new T.Vector3(0, -0.6, 0));
      } else if (rig.pose === 'cheer') {
        const b = Math.sin(k * 6) * 0.03;
        base.addScaledVector(up, 0.3 + b).addScaledVector(flatR, 0.08 * sgn).addScaledVector(flatF, 0.05);
        axis.copy(up);
        toArm = new T.Vector3().copy(flatF).multiplyScalar(-1).add(new T.Vector3(0, -1, 0));
      } else if (rig.pose === 'oops') {
        base.addScaledVector(up, 0.34).addScaledVector(flatR, 0.05 * sgn).addScaledVector(flatF, -0.15);
        axis.copy(flatR).multiplyScalar(-sgn).add(up.clone().multiplyScalar(0.4)).normalize();
        toArm = new T.Vector3().copy(flatF).multiplyScalar(-1).add(new T.Vector3(0, -1, 0));
      } else if (rig.pose === 'poke' && s === 0) {
        const e = Math.sin(Math.min(1, rig.pokeT * 3.5) * Math.PI);
        const dir = new T.Vector3().copy(rig.poke).sub(base).normalize();
        base.addScaledVector(dir, 0.22 * e);
        axis.copy(flatR).multiplyScalar(-1);
        toArm = new T.Vector3().copy(shoulders[s]).sub(base);
      } else {
        // resting: hands low, mostly below the frame
        base.addScaledVector(up, -0.16 + Math.sin(t * 1.3 + s) * 0.006).addScaledVector(flatF, -0.05).addScaledVector(flatR, 0.05 * sgn);
        axis.copy(flatF).add(up.clone().multiplyScalar(0.3)).normalize();
      }
      setHandFrame(h, base, axis, toArm);
    }
  }
  // sleeves from wrist to shoulder with an elbow bend
  for (let s = 0; s < 2; s++) {
    const h = rig.hands[s];
    h.grp.updateMatrixWorld();
    const wl = wristLocal.clone();
    if (s === 1) wl.z *= -1;
    const wrist = wl.applyMatrix4(h.grp.matrixWorld);
    const sh = shoulders[s];
    const elbow = new T.Vector3().lerpVectors(wrist, sh, 0.5).addScaledVector(up, -0.08).addScaledVector(flatR, (s === 0 ? 1 : -1) * 0.06);
    updateSleeve(rig.sleeves[s], wrist, elbow, sh, null, t * 0.0);
  }
}
