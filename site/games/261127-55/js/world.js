// 春の昼下がりの公園：空・太陽・環境光・舗道・芝生・桜・ベンチ・黒板の看板・花びら
import * as THREE from '../lib/three.module.min.js';
import { tex, pbr } from './tex.js';
import { rng, merge, patch, deform } from './util.js';

export const SUN_DIR = new THREE.Vector3(-0.52, 0.74, 0.42).normalize();
const SKY_TOP = new THREE.Color(0.13, 0.28, 0.66);
const SKY_HOR = new THREE.Color(0.58, 0.68, 0.80);

// ---------- 空 ----------
function skyMaterial(sunI) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: SKY_TOP }, uHor: { value: SKY_HOR }, uSun: { value: SUN_DIR }, uSunI: { value: sunI } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `uniform vec3 uTop,uHor,uSun; uniform float uSunI; varying vec3 vD;
      void main(){ float h=max(vD.y,0.); vec3 c=mix(uHor,uTop,pow(h,0.55));
        c=mix(c, vec3(0.55,0.56,0.52), smoothstep(0.0,-0.08,vD.y));
        float s=max(dot(vD,uSun),0.); c+=vec3(1.,0.93,0.82)*(pow(s,8.)*0.35+pow(s,60.)*0.8);
        c+=vec3(1.,0.95,0.85)*smoothstep(0.9995,0.9998,s)*uSunI;
        // 薄い雲
        float cl=sin(vD.x*9.+sin(vD.z*7.))*sin(vD.z*11.+vD.x*3.); cl=smoothstep(0.35,0.9,cl)*smoothstep(0.05,0.3,h)*0.18;
        c=mix(c,vec3(0.95,0.96,0.97),cl);
        gl_FragColor=vec4(c*1.05,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function makeEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(60));
  envScene.add(sky);
  // 地面（舗道・芝）と遠景の木々（緑・桜色）の帯
  const gnd = new THREE.Mesh(new THREE.CircleGeometry(49, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.14, 0.15, 0.12) }));
  gnd.rotation.x = -Math.PI / 2; gnd.position.y = -1.6; envScene.add(gnd);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.32, 0.31) }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = -1.55; envScene.add(plaza);
  const R = rng(7);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + R() * 0.1;
    const pink = R() < 0.55;
    const c = pink ? new THREE.Color(0.78, 0.64, 0.68).multiplyScalar(0.85 + R() * 0.2) : new THREE.Color(0.07, 0.10, 0.06).multiplyScalar(0.8 + R() * 0.4);
    const m = new THREE.Mesh(new THREE.SphereGeometry(4 + R() * 4, 12, 8), new THREE.MeshBasicMaterial({ color: c }));
    const d = 28 + R() * 10;
    m.position.set(Math.cos(a) * d, 2 + R() * 3, Math.sin(a) * d); m.scale.y = 0.7;
    envScene.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene, 0.015);
  pm.dispose();
  return rt.texture;
}

export function makeSky() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMaterial(30));
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

export function makeSun() {
  // 春の 14 時ごろ：やや暖かい白（約 5500K）
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.94, 0.86), 3.1);
  sun.position.copy(SUN_DIR).multiplyScalar(12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3.5; sun.shadow.blurSamples = 12;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015;
  const c = sun.shadow.camera; c.near = 0.5; c.far = 30; c.left = -4; c.right = 4; c.top = 4; c.bottom = -4;
  return sun;
}
export function aimSun(sun, target, size) {
  sun.target.position.copy(target);
  sun.position.copy(target).addScaledVector(SUN_DIR, 12);
  const c = sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
}

// ---------- 舗道（チョークと水たまりを描く地面） ----------
export const PLAZA = { minX: -7, maxX: 7, minZ: -6, maxZ: 4 };

export function makeGround(paint) {
  const w = PLAZA.maxX - PLAZA.minX, h = PLAZA.maxZ - PLAZA.minZ;
  const g = new THREE.PlaneGeometry(w, h, 1, 1); g.rotateX(-Math.PI / 2);
  g.translate((PLAZA.minX + PLAZA.maxX) / 2, 0, (PLAZA.minZ + PLAZA.maxZ) / 2);
  const t = pbr('asphalt', { rep: [w / 1.1, h / 1.1], orm: true });
  const mat = new THREE.MeshStandardMaterial({ ...t, color: 0xffffff, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.1, 1.1) });
  mat.envMapIntensity = 0.9;
  const U = {
    ...paint.uniforms,
    tVar: { value: tex('ground_var.jpg') },
    tGrain: { value: tex('grain.jpg') },
    tWN: { value: tex('paint_nrm.jpg') },
    uPond: { value: new THREE.Vector4(3.0, -1.1, 0.0, 0) },
    uPuddle: { value: new THREE.Vector4(3.05, -1.3, 0.3, 0) },
    uRip: { value: new THREE.Vector4(0, 0, -100, 0) },
    uTime: { value: 0 },
    uHi: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  mat.userData.U = U;
  patch(mat, (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; uniform sampler2D tChalk,tReal,tVar,tGrain,tWN; uniform vec4 uPR,uPond,uPuddle,uRip,uHi; uniform float uTime;
      float blob(vec2 p, vec4 b){ vec2 d=p-b.xy; float a=atan(d.y,d.x); float r=b.z*(1.+0.13*sin(3.*a+1.3)+0.08*sin(5.*a+0.4)+0.05*sin(9.*a+2.)); return r-length(d); }
      float cAmt; float wetA; float waterA; vec3 waterN;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 pUV=vec2((vWPos.x-uPR.x)/uPR.z,(uPR.y-vWPos.z)/uPR.w);
        float inR=step(0.,pUV.x)*step(pUV.x,1.)*step(0.,pUV.y)*step(pUV.y,1.);
        vec4 ch=texture2D(tChalk,pUV)*inR; vec4 rl=texture2D(tReal,pUV)*inR;
        vec3 var=texture2D(tVar,vWPos.xz*0.045).rgb; vec3 var2=texture2D(tVar,vWPos.xz*0.21+0.3).rgb;
        diffuseColor.rgb*=0.80+0.30*var.r+0.12*(var2.b-0.5);
        diffuseColor.rgb=mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.92,0.9,0.86), var.g*0.6);
        float hgt=texture2D(aoMap,vAoMapUv).r;
        float gr=texture2D(tGrain,vWPos.xz*2.7).r; float gr2=texture2D(tGrain,vWPos.xz*0.83+0.5).g;
        float lift=rl.g;
        float fillA=ch.a*(1.-lift*0.86);
        float lineA=rl.b*(1.-lift*0.7);
        float cF=smoothstep(0.22,0.6,fillA*1.3-(1.-hgt)*0.8+(gr-0.5)*0.5);
        float cL=smoothstep(0.22,0.6,lineA*1.35-(1.-hgt)*0.75+(gr2-0.5)*0.45+(gr-0.5)*0.35);
        vec3 fillC=ch.rgb/max(ch.a,0.002);
        vec3 lineC=vec3(0.9,0.9,0.87);
        // ヒント：塗る場所のふちがかすかに光る
        float hi=uHi.w*(0.5+0.5*sin(uTime*4.))*smoothstep(uHi.z,uHi.z*0.6,length(vWPos.xz-uHi.xy));
        lineC*=1.+hi*0.9;
        cAmt=max(cF,cL);
        vec3 cc=mix(lineC,fillC,cF/(cF+cL+0.0001)*step(0.001,cF)+0.);
        cc=mix(lineC, fillC, clamp(cF*1.2-cL*0.2,0.,1.));
        diffuseColor.rgb=mix(diffuseColor.rgb, cc*(0.88+0.12*gr), cAmt);
        // 水：水たまり→池
        float dw=max(blob(vWPos.xz,uPuddle), blob(vWPos.xz,uPond));
        float edgeN=(texture2D(tGrain,vWPos.xz*1.3).b-0.5)*0.08;
        waterA=smoothstep(-0.005,0.03,dw+edgeN);
        wetA=smoothstep(-0.16,0.0,dw+edgeN*2.)*(1.-waterA);
        float deep=smoothstep(0.02,0.35,dw);
        diffuseColor.rgb*=1.-wetA*0.45;
        vec3 under=diffuseColor.rgb*0.45;
        diffuseColor.rgb=mix(diffuseColor.rgb, mix(under, vec3(0.012,0.018,0.02), deep), waterA);
        cAmt*=1.-waterA;
        vec2 wuv=vWPos.xz*0.55;
        vec3 n1=texture2D(tWN,wuv+vec2(uTime*0.020,uTime*0.013)).xyz*2.-1.;
        vec3 n2=texture2D(tWN,wuv*1.7-vec2(uTime*0.017,-uTime*0.022)).xyz*2.-1.;
        vec2 gxy=(n1.xy+n2.xy)*0.18;
        float rd=length(vWPos.xz-uRip.xy); float rt=uTime-uRip.z;
        float ring=sin(rd*28.-rt*7.)*exp(-rt*0.9)*exp(-abs(rd-rt*0.25)*6.)*step(0.,rt);
        gxy+=normalize(vWPos.xz-uRip.xy+0.0001)*ring*0.35*uRip.w;
        waterN=normalize(vec3(-gxy.x,1.,-gxy.y));
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,0.97,cAmt); roughnessFactor=mix(roughnessFactor,0.32,wetA); roughnessFactor=mix(roughnessFactor,0.03,waterA);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal=normalize(mix(normal,nonPerturbedNormal,cAmt*0.55));
        normal=normalize(mix(normal,normalize((viewMatrix*vec4(waterN,0.)).xyz),waterA));`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if defined( RE_IndirectSpecular )
        { float fw=0.18+0.82*pow(1.-saturate(dot(geometryNormal,geometryViewDir)),4.); reflectedLight.indirectSpecular+=radiance*waterA*fw*0.9; }
        #endif`)
      .replace('#include <aomap_fragment>', THREE.ShaderChunk.aomap_fragment.replace('* aoMapIntensity + 1.0;', '* aoMapIntensity + 1.0; ambientOcclusion=mix(ambientOcclusion,1.,max(cAmt*0.75,waterA));'));
  }, 'ground');
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

export function makeGrass() {
  const grp = new THREE.Group();
  const g = new THREE.PlaneGeometry(120, 120, 1, 1); g.rotateX(-Math.PI / 2);
  const t = pbr('grass', { rep: [80, 80] });
  const mat = new THREE.MeshStandardMaterial({ ...t, roughness: 0.92, color: 0xd8e0c8 });
  const U = { tVar: { value: tex('ground_var.jpg') } };
  patch(mat, (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform sampler2D tVar;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 v=texture2D(tVar,vWPos.xz*0.03).rgb; diffuseColor.rgb*=0.75+0.45*v.r; diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.15,1.05,0.7),v.b*0.5);`);
  }, 'grass');
  const m = new THREE.Mesh(g, mat); m.position.y = -0.03; m.receiveShadow = true;
  grp.add(m);
  // 縁石（御影石風のブロック）
  const curbT = pbr('asphalt', { rep: [0.6, 0.15], orm: true });
  const curbM = new THREE.MeshStandardMaterial({ ...curbT, color: 0xe6e1d8, roughness: 1 });
  const bg = new THREE.BoxGeometry(0.6, 0.1, 0.14);
  deform(bg, (v) => { v.y += (v.y > 0 ? -0.004 : 0); });
  const blocks = [];
  const R = rng(5);
  const addRun = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.round(L / 0.605);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; blocks.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, Math.atan2(-(z1 - z0), x1 - x0), R()]); }
  };
  const { minX, maxX, minZ, maxZ } = PLAZA;
  addRun(minX, minZ, maxX, minZ); addRun(minX, maxZ, maxX, maxZ); addRun(minX, minZ, minX, maxZ); addRun(maxX, minZ, maxX, maxZ);
  const im = new THREE.InstancedMesh(bg, curbM, blocks.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  blocks.forEach((b, i) => { E.set((b[3] - 0.5) * 0.01, b[2], (R() - 0.5) * 0.01); Q.setFromEuler(E); M.compose(new THREE.Vector3(b[0], 0.02 + (b[3] - 0.5) * 0.006, b[1]), Q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, M); });
  im.castShadow = true; im.receiveShadow = true;
  grp.add(im);
  // 草の束（風でゆれる）
  const card = tex('grass_card.png', { clamp: true, srgb: true });
  const gm = new THREE.MeshStandardMaterial({ map: card, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0x7d8c62 });
  const GU = { uTime: { value: 0 } }; gm.userData.U = GU;
  patch(gm, (sh) => {
    Object.assign(sh.uniforms, GU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip=instanceMatrix*vec4(0.,0.,0.,1.);
        float sw=sin(uTime*1.7+ip.x*0.8+ip.z*0.5)*0.05+sin(uTime*3.1+ip.x*2.)*0.015; transformed.x+=sw*uv.y*uv.y; transformed.z+=sw*0.6*uv.y*uv.y;`);
  }, 'gcard');
  // 法線は上向きにして柔らかく
  const cg = new THREE.PlaneGeometry(0.34, 0.2); cg.translate(0, 0.1, 0);
  const cg2 = cg.clone().rotateY(Math.PI / 2);
  const tuft = merge([cg, cg2]);
  const nn = tuft.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
  const pts = [];
  for (let i = 0; i < 2600; i++) {
    let x = (R() - 0.5) * 30, z = -6 - R() * 12;
    if (R() < 0.5) { x = (R() < 0.5 ? -1 : 1) * (7.15 + R() * 5); z = (R() - 0.5) * 20 - 2; }
    if (R() < 0.25) { x = (R() - 0.5) * 22; z = 4.15 + R() * 3; }
    if (x > PLAZA.minX - 0.1 && x < PLAZA.maxX + 0.1 && z > PLAZA.minZ - 0.1 && z < PLAZA.maxZ + 0.1) continue;
    pts.push([x, z, R()]);
  }
  const gi = new THREE.InstancedMesh(tuft, gm, pts.length);
  pts.forEach((p, i) => { E.set(0, p[2] * 6.28, 0); Q.setFromEuler(E); const s = 0.6 + p[2] * 0.9; M.compose(new THREE.Vector3(p[0], -0.03, p[1]), Q, new THREE.Vector3(s, s * (0.7 + R() * 0.6), s)); gi.setMatrixAt(i, M); });
  gi.receiveShadow = true;
  grp.add(gi);
  grp.userData.U = GU;
  return grp;
}

// ---------- 桜の木 ----------
export function makeCherryTree(seed, scale = 1, detail = 1) {
  const R = rng(seed);
  const barkT = pbr('bark', { rep: [1, 2] });
  const barkM = new THREE.MeshStandardMaterial({ ...barkT, roughness: 0.95, color: 0xffffff });
  const blossomM = new THREE.MeshStandardMaterial({ map: tex('blossom.png', { srgb: true, clamp: true }), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, emissive: new THREE.Color(0.20, 0.12, 0.14), color: 0xffffff });
  blossomM.map.colorSpace = THREE.SRGBColorSpace;
  const tubes = []; const tips = [];
  function branch(p0, dir, len, rad, depth) {
    const pts = [p0.clone()];
    const d = dir.clone(); let p = p0.clone();
    const n = 4;
    for (let i = 1; i <= n; i++) {
      d.x += (R() - 0.5) * 0.35; d.z += (R() - 0.5) * 0.35; d.y += (R() - 0.5) * 0.15 - 0.02 * depth; d.normalize();
      p = p.clone().addScaledVector(d, len / n); pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tg = new THREE.TubeGeometry(curve, depth < 2 ? 10 : 5, rad, depth < 2 ? 10 : 6, false);
    // 先細り
    const pos = tg.attributes.position; const segs = tg.parameters.tubularSegments; const rs = tg.parameters.radialSegments;
    for (let i = 0; i <= segs; i++) {
      const c = curve.getPointAt(i / segs); const k = 1 - (i / segs) * 0.55;
      for (let j = 0; j <= rs; j++) { const id = i * (rs + 1) + j; const v = new THREE.Vector3().fromBufferAttribute(pos, id).sub(c).multiplyScalar(k).add(c); pos.setXYZ(id, v.x, v.y, v.z); }
    }
    tg.computeVertexNormals();
    const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 0.8, uv.getY(i) * Math.max(1, rad * 12));
    tubes.push(tg);
    if (depth >= 3 || rad < 0.025) { tips.push(p); return; }
    const kids = depth === 0 ? 4 : 2 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const a = (k / kids) * Math.PI * 2 + R() * 1.2;
      const nd = d.clone().multiplyScalar(0.6).add(new THREE.Vector3(Math.cos(a), 0.35 + R() * 0.4, Math.sin(a))).normalize();
      if (depth === 0) nd.y = 0.3 + R() * 0.35;
      branch(p, nd.normalize(), len * (0.62 + R() * 0.2), rad * 0.58, depth + 1);
      if (depth > 0) tips.push(p.clone().lerp(p0, 0.4));
    }
  }
  branch(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.05, 1, 0.02).normalize(), 2.2 * scale, 0.2 * scale, 0);
  const trunk = new THREE.Mesh(merge(tubes), barkM); trunk.castShadow = true; trunk.receiveShadow = true;
  // 花の房
  const quads = [];
  const center = new THREE.Vector3(); tips.forEach((t) => center.add(t)); center.divideScalar(tips.length);
  const per = Math.round(10 * detail);
  for (const t of tips) {
    for (let k = 0; k < per; k++) {
      const s = (0.45 + R() * 0.5) * scale;
      const q = new THREE.PlaneGeometry(s, s);
      q.rotateX(R() * 6.28); q.rotateY(R() * 6.28); q.rotateZ(R() * 6.28);
      const off = new THREE.Vector3(R() - 0.5, (R() - 0.3) * 0.8, R() - 0.5).multiplyScalar(0.9 * scale);
      q.translate(t.x + off.x, t.y + off.y, t.z + off.z);
      const n = q.attributes.normal;
      const pp = new THREE.Vector3(t.x + off.x, t.y + off.y, t.z + off.z).sub(center).normalize();
      for (let i = 0; i < n.count; i++) n.setXYZ(i, pp.x, pp.y + 0.3, pp.z);
      quads.push(q);
    }
  }
  const bl = new THREE.Mesh(merge(quads), blossomM); bl.castShadow = true; bl.receiveShadow = true;
  const g = new THREE.Group(); g.add(trunk, bl);
  return g;
}

// ---------- ベンチ ----------
export function makeBench() {
  const g = new THREE.Group();
  const wt = pbr('wood', { rep: [1, 0.25], orm: true });
  const wood = new THREE.MeshStandardMaterial({ ...wt, color: 0xc9a27c, roughness: 1 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x1d1f1e, roughness: 0.55, metalness: 0.6, normalMap: tex('metal_nrm.jpg'), roughnessMap: tex('metal_orm.jpg') });
  const L = 1.7;
  const slat = (w, h, d) => {
    const s = new THREE.Shape(); const r = 0.008;
    s.moveTo(-d / 2 + r, -h / 2); s.lineTo(d / 2 - r, -h / 2); s.quadraticCurveTo(d / 2, -h / 2, d / 2, -h / 2 + r); s.lineTo(d / 2, h / 2 - r); s.quadraticCurveTo(d / 2, h / 2, d / 2 - r, h / 2);
    s.lineTo(-d / 2 + r, h / 2); s.quadraticCurveTo(-d / 2, h / 2, -d / 2, h / 2 - r); s.lineTo(-d / 2, -h / 2 + r); s.quadraticCurveTo(-d / 2, -h / 2, -d / 2 + r, -h / 2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 3 });
    geo.translate(0, 0, -w / 2); geo.rotateY(Math.PI / 2);
    // uv を木目方向に
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 1.1 + Math.random() * 0, (p.getY(i) + p.getZ(i)) * 3);
    return geo;
  };
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(slat(L, 0.03, 0.085), wood);
    m.position.set(0, 0.44, -0.2 + i * 0.1 + 0.05); m.castShadow = m.receiveShadow = true; g.add(m);
  }
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(slat(L, 0.025, 0.09), wood);
    m.position.set(0, 0.58 + i * 0.11, -0.24 - i * 0.025); m.rotation.x = -0.22; m.castShadow = m.receiveShadow = true; g.add(m);
  }
  // 鋳物の脚（側面の形を押し出し）
  const s = new THREE.Shape();
  s.moveTo(0.22, 0); s.lineTo(0.26, 0); s.quadraticCurveTo(0.2, 0.2, 0.2, 0.42); s.lineTo(-0.2, 0.42); s.quadraticCurveTo(-0.24, 0.6, -0.27, 0.9);
  s.lineTo(-0.31, 0.9); s.quadraticCurveTo(-0.28, 0.6, -0.26, 0.42); s.quadraticCurveTo(-0.26, 0.2, -0.3, 0); s.lineTo(-0.25, 0); s.quadraticCurveTo(-0.2, 0.2, -0.2, 0.38);
  s.lineTo(0.16, 0.38); s.quadraticCurveTo(0.16, 0.2, 0.22, 0);
  const lg = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 8 });
  lg.rotateY(Math.PI / 2);
  for (const x of [-L / 2 + 0.12, L / 2 - 0.16]) { const m = new THREE.Mesh(lg, iron); m.position.set(x, 0, 0.0); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

// ---------- 黒板の看板（ルールを絵で） ----------
export function makeSignBoard() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 384;
  const x = c.getContext('2d');
  const R = rng(99);
  x.fillStyle = '#1f2b26'; x.fillRect(0, 0, 512, 384);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(255,255,255,${R() * 0.035})`; x.fillRect(R() * 512, R() * 384, 2 + R() * 30, 1 + R() * 2); }
  const chalkLine = (pts, col, w) => {
    for (let pass = 0; pass < 3; pass++) {
      x.strokeStyle = col; x.globalAlpha = 0.35 + pass * 0.15; x.lineWidth = w * (1 - pass * 0.2); x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); pts.forEach((p, i) => { const jx = (R() - 0.5) * 2.5, jy = (R() - 0.5) * 2.5; i ? x.lineTo(p[0] + jx, p[1] + jy) : x.moveTo(p[0] + jx, p[1] + jy); }); x.stroke();
    }
    x.globalAlpha = 1;
  };
  const carPts = (ox, oy, s) => [[0, 0], [10, -6], [22, -6], [30, -18], [52, -18], [60, -6], [70, -4], [70, 6], [0, 6], [0, 0]].map((p) => [ox + p[0] * s, oy + p[1] * s]);
  const circ = (cx, cy, r) => { const a = []; for (let i = 0; i <= 24; i++) a.push([cx + Math.cos(i / 24 * 6.283) * r, cy + Math.sin(i / 24 * 6.283) * r]); return a; };
  // 左：チョークの線画の車
  chalkLine(carPts(30, 200, 2.2), '#f4f4ee', 5);
  chalkLine(circ(30 + 14 * 2.2, 214, 13), '#f4f4ee', 5); chalkLine(circ(30 + 56 * 2.2, 214, 13), '#f4f4ee', 5);
  // 指（塗る）
  chalkLine([[200, 250], [214, 228], [226, 214], [236, 222], [228, 246], [222, 262]], '#f6e6c8', 6);
  for (let i = 0; i < 6; i++) chalkLine([[180 + i * 12, 180 + (i % 2) * 14], [190 + i * 12, 196 - (i % 2) * 10]], '#f2b4b4', 6);
  // 矢印
  chalkLine([[268, 200], [318, 200]], '#fff6a8', 6); chalkLine([[304, 188], [320, 200], [304, 212]], '#fff6a8', 6);
  // 右：塗った本物の車（赤く塗りつぶし＋光）
  const cp = carPts(340, 200, 2.2);
  x.fillStyle = '#d8494a'; x.globalAlpha = 0.85; x.beginPath(); cp.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.fill(); x.globalAlpha = 1;
  x.fillStyle = '#bfe4f2'; x.beginPath(); x.moveTo(340 + 32 * 2.2, 200 - 16 * 2.2); x.lineTo(340 + 50 * 2.2, 200 - 16 * 2.2); x.lineTo(340 + 57 * 2.2, 200 - 6 * 2.2); x.lineTo(340 + 27 * 2.2, 200 - 6 * 2.2); x.fill();
  x.fillStyle = '#222'; [[340 + 14 * 2.2, 214], [340 + 56 * 2.2, 214]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 13, 0, 6.283); x.fill(); x.fillStyle = '#bbb'; x.beginPath(); x.arc(a, b, 5, 0, 6.283); x.fill(); x.fillStyle = '#222'; });
  const star = (sx, sy, r) => chalkLine([[sx - r, sy], [sx + r, sy]], '#fff6a8', 4) || chalkLine([[sx, sy - r], [sx, sy + r]], '#fff6a8', 4);
  star(350, 140, 12); star(480, 150, 9); star(420, 120, 7);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const g = new THREE.Group();
  const wt = pbr('wood', { rep: [0.6, 0.3], orm: true });
  const wood = new THREE.MeshStandardMaterial({ ...wt, color: 0xb08a66, roughness: 1 });
  const board = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, normalMap: tex('chalk_nrm.jpg'), normalScale: new THREE.Vector2(0.3, 0.3) });
  const W = 0.62, H = 0.46;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), board);
  const frame = (w, h) => new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), wood);
  const panel = new THREE.Group();
  face.position.z = 0.014; panel.add(face);
  const back = frame(W, H); back.position.z = 0; panel.add(back);
  [[0, H / 2 + 0.02, W + 0.08, 0.04], [0, -H / 2 - 0.02, W + 0.08, 0.04], [-W / 2 - 0.02, 0, 0.04, H], [W / 2 + 0.02, 0, 0.04, H]].forEach(([px, py, w, h]) => { const f = frame(w, h); f.scale.z = 1.6; f.position.set(px, py, 0.008); panel.add(f); });
  panel.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  panel.position.set(0, 0.58, 0.12); panel.rotation.x = -0.26;
  g.add(panel);
  const back2 = panel.clone(); back2.position.z = -0.12; back2.rotation.x = 0.26; back2.rotation.y = Math.PI; g.add(back2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = frame(0.035, 0.9); leg.scale.z = 1.4; leg.position.set(sx * (W / 2 + 0.06), 0.44, sz * 0.12); leg.rotation.x = sz * -0.26; leg.castShadow = true; g.add(leg);
  }
  return g;
}

// ---------- 花びら（地面に散ったもの・舞い落ちるもの） ----------
export class Petals {
  constructor(scene) {
    const pt = tex('petal.png', { srgb: true, clamp: true }); pt.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: pt, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, emissive: new THREE.Color(0.18, 0.12, 0.13) });
    const g = new THREE.PlaneGeometry(0.014, 0.017);
    const gb = g.clone(); deform(gb, (v) => { v.z += (v.x * v.x) * 4; });
    const R = rng(33);
    // 地面
    const N = 2600; const ground = new THREE.InstancedMesh(gb.clone().rotateX(-Math.PI / 2), mat, N);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      let x = (R() - 0.5) * 16, z = -7 + R() * 11;
      // 木の下や縁に多め
      if (R() < 0.4) { x = (R() < 0.5 ? -6.6 : 6.6) + (R() - 0.5) * 1.2; }
      E.set((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4); Q.setFromEuler(E); const s = 0.8 + R() * 0.5; S.set(s, s, s);
      M.compose(new THREE.Vector3(x, 0.002 + R() * 0.002, z), Q, S); ground.setMatrixAt(i, M);
    }
    ground.receiveShadow = true;
    scene.add(ground);
    this.ground = ground;
    // 舞い落ちる
    this.n = 140; this.fall = new THREE.InstancedMesh(gb, mat, this.n); this.fall.frustumCulled = false;
    this.fall.castShadow = false;
    this.p = []; for (let i = 0; i < this.n; i++) this.p.push(this.spawn(R, true));
    scene.add(this.fall);
    this.R = R; this.M = M; this.Q = Q; this.E = E;
    this.center = new THREE.Vector3(0, 0, 0);
  }
  spawn(R, init) {
    const c = this.center || new THREE.Vector3();
    return { x: c.x + (R() - 0.5) * 8, y: init ? R() * 4 : 3.5 + R() * 1.5, z: c.z - 1 + (R() - 0.7) * 6, vx: 0.15 + R() * 0.2, vy: -(0.25 + R() * 0.25), ph: R() * 6.28, sp: 1.5 + R() * 3, rx: R() * 6, ry: R() * 6, s: 0.8 + R() * 0.5 };
  }
  update(dt, t) {
    const S = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      p.x += (p.vx + Math.sin(t * 0.7 + p.ph) * 0.15) * dt; p.y += (p.vy + Math.sin(t * p.sp + p.ph) * 0.12) * dt; p.z += Math.cos(t * 0.9 + p.ph) * 0.1 * dt;
      p.rx += dt * p.sp; p.ry += dt * p.sp * 0.7;
      if (p.y < 0.003) { this.p[i] = this.spawn(this.R, false); continue; }
      this.E.set(p.rx, p.ry, Math.sin(p.rx) * 0.5); this.Q.setFromEuler(this.E); S.set(p.s, p.s, p.s);
      this.M.compose(new THREE.Vector3(p.x, p.y, p.z), this.Q, S); this.fall.setMatrixAt(i, this.M);
    }
    this.fall.instanceMatrix.needsUpdate = true;
  }
}

// ---------- 光の粒（キラッ・チョークの粉・しぶき） ----------
export class Particles {
  constructor(scene, texName, max, blending, opts = {}) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max); this.life = new Float32Array(max); this.age = new Float32Array(max); this.seed = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.g = g;
    const t = tex(texName, { clamp: true });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: t }, uScale: { value: 600 } },
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aSize*uScale/max(-mv.z,0.05); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D tMap; varying vec4 vC; void main(){ vec4 t=texture2D(tMap,gl_PointCoord); gl_FragColor=vec4(vC.rgb, t.a*vC.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      transparent: true, depthWrite: false, blending: blending || THREE.AdditiveBlending,
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5;
    scene.add(this.pts);
    this.i = 0; this.grav = opts.grav ?? 0; this.drag = opts.drag ?? 1; this.fade = opts.fade || 'out';
  }
  emit(x, y, z, vx, vy, vz, size, life, r, g, b, a) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([r, g, b, a], i * 4);
    this.size[i] = size; this.life[i] = life; this.age[i] = 0; this.seed[i] = Math.random() * 6.28;
    this.baseA = this.baseA || new Float32Array(this.max); this.baseA[i] = a; this.baseS = this.baseS || new Float32Array(this.max); this.baseS[i] = size;
  }
  update(dt, t) {
    const dr = Math.pow(this.drag, dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.age[i] += dt; const k = this.age[i] / this.life[i];
      if (k >= 1) { this.life[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      this.vel[i * 3 + 1] -= this.grav * dt;
      for (let c = 0; c < 3; c++) { this.vel[i * 3 + c] *= dr; this.pos[i * 3 + c] += this.vel[i * 3 + c] * dt; }
      if (this.pos[i * 3 + 1] < 0.002 && this.grav > 0) { this.pos[i * 3 + 1] = 0.002; this.vel[i * 3] *= 0.3; this.vel[i * 3 + 1] = 0; this.vel[i * 3 + 2] *= 0.3; }
      const tw = this.fade === 'twinkle' ? (0.55 + 0.45 * Math.sin(t * 25 + this.seed[i])) : 1;
      this.col[i * 4 + 3] = this.baseA[i] * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * tw;
      this.size[i] = this.baseS[i] * (this.fade === 'twinkle' ? (0.6 + 0.6 * Math.sin(k * Math.PI)) : (1 + k * 0.8));
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.aCol.needsUpdate = true; this.g.attributes.aSize.needsUpdate = true;
  }
}

// ---------- 遠景の木立（カード） ----------
export function makeFarTrees() {
  const g = new THREE.Group();
  const R = rng(404);
  for (const [name, n, tint] of [['tree_pink.png', 46, 0xffffff], ['tree_green.png', 60, 0xffffff]]) {
    const t = tex(name, { srgb: true, clamp: true });
    const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, roughness: 0.95, color: tint, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
    const nn = geo.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 0.55, 0.85);
    const im = new THREE.InstancedMesh(geo, m, n);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      // 後ろ側（-Z）と左右に多く
      let a = -Math.PI / 2 + (R() - 0.5) * Math.PI * 1.7;
      const d = 19 + R() * 22;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 2;
      const s = 6 + R() * 5;
      E.set(0, Math.atan2(-x, -z) + Math.PI, 0); Q.setFromEuler(E);
      M.compose(new THREE.Vector3(x, -0.2, z), Q, new THREE.Vector3(s * (0.9 + R() * 0.4), s, 1)); im.setMatrixAt(i, M);
    }
    g.add(im);
  }
  return g;
}
