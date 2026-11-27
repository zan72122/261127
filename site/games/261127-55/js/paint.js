// 地面のチョーク塗りマップ（GPU レンダーターゲット）
// tChalk: RGB=チョークの色(乗算済み) A=量
// tReal : R=本物になった量  G=持ち上がった（絵が抜けた）印  B=白い下絵の線
import * as THREE from '../lib/three.module.min.js';
import { tex } from './tex.js';

const MAXI = 1024;

export class Paint {
  constructor(renderer, rect, res) {
    this.r = renderer;
    this.minX = rect.minX; this.maxX = rect.maxX; this.minZ = rect.minZ; this.maxZ = rect.maxZ;
    this.W = this.maxX - this.minX; this.H = this.maxZ - this.minZ;
    const opt = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
    this.rtChalk = new THREE.WebGLRenderTarget(res[0], res[1], opt);
    this.rtReal = new THREE.WebGLRenderTarget(res[0], res[1], opt);
    this.uniforms = {
      tChalk: { value: this.rtChalk.texture },
      tReal: { value: this.rtReal.texture },
      uPR: { value: new THREE.Vector4(this.minX, this.maxZ, this.W, this.H) },
    };
    const cx = (this.minX + this.maxX) / 2, cz = (this.minZ + this.maxZ) / 2;
    this.cam = new THREE.OrthographicCamera(-this.W / 2, this.W / 2, this.H / 2, -this.H / 2, 0.1, 20);
    this.cam.up.set(0, 0, -1);
    this.cam.position.set(cx, 5, cz);
    this.cam.lookAt(cx, 0, cz);
    this.cam.updateMatrixWorld();
    this.scene = new THREE.Scene();
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 4), 4);
    this.aCol.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aCol', this.aCol);
    const brush = tex('brush.png', { clamp: true });
    const vs = `attribute vec4 aCol; varying vec4 vCol; varying vec2 vUv;
      void main(){ vCol=aCol; vUv=uv; gl_Position=projectionMatrix*viewMatrix*instanceMatrix*vec4(position,1.); }`;
    const mk = (frag, blend) => {
      const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: frag, uniforms: { tB: { value: brush } }, depthTest: false, depthWrite: false, transparent: true });
      if (blend === 'normal') {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
        m.blendEquationAlpha = THREE.AddEquation; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      } else {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.MaxEquation; m.blendEquationAlpha = THREE.MaxEquation;
        m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneFactor;
      }
      return m;
    };
    this.matChalk = mk(`uniform sampler2D tB; varying vec4 vCol; varying vec2 vUv;
      void main(){ float a=texture2D(tB,vUv).a*vCol.a; gl_FragColor=vec4(vCol.rgb,a); }`, 'normal');
    this.matReal = mk(`uniform sampler2D tB; varying vec4 vCol; varying vec2 vUv;
      void main(){ vec2 d=vUv-.5; float a=smoothstep(.5,.22,length(d)); a=max(a, texture2D(tB,vUv).a); gl_FragColor=vec4(a*vCol.a,0.,0.,0.); }`, 'max');
    this.matLine = mk(`uniform sampler2D tB; varying vec4 vCol; varying vec2 vUv;
      void main(){ float a=texture2D(tB,vUv).a*vCol.a; gl_FragColor=vec4(0.,0.,a,0.); }`, 'max');
    this.matLift = mk(`varying vec4 vCol; varying vec2 vUv; void main(){ gl_FragColor=vec4(0.,vCol.a,0.,0.); }`, 'max');
    this.mesh = new THREE.InstancedMesh(g, this.matChalk, MAXI);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);
    this.q = { chalk: [], real: [], line: [], lift: [] };
    this.pending = []; // 遅れて本物になる
    this.time = 0;
    this.onReal = null; // (x,z,r) 本物化した点
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._e = new THREE.Euler();
    this.clear();
  }
  clear() {
    const r = this.r; const prev = r.getRenderTarget(); const cc = new THREE.Color(); r.getClearColor(cc); const ca = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.rtChalk); r.clear(true, false, false);
    r.setRenderTarget(this.rtReal); r.clear(true, false, false);
    r.setRenderTarget(prev); r.setClearColor(cc, ca);
  }
  // チョーク（色）を置く
  chalk(x, z, rad, col, a = 0.7, rot = Math.random() * 6.283) { this.q.chalk.push([x, z, rad, rot, col.r, col.g, col.b, a]); }
  real(x, z, rad, a = 1, delay = 0) {
    if (delay > 0) this.pending.push([this.time + delay, x, z, rad, a]);
    else { this.q.real.push([x, z, rad, Math.random() * 6.283, 0, 0, 0, a]); if (this.onReal) this.onReal(x, z, rad); }
  }
  line(x, z, rad, a = 1) { this.q.line.push([x, z, rad, Math.random() * 6.283, 0, 0, 0, a]); }
  lift(x0, z0, x1, z1, a = 1) { this.q.lift.push([(x0 + x1) / 2, (z0 + z1) / 2, [Math.abs(x1 - x0), Math.abs(z1 - z0)], 0, 0, 0, 0, a]); }
  // 線を描く（白い下絵）
  strokeLine(pts, rad, jitter, seedR) {
    const R = seedR || Math.random;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const d = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.ceil(d / (rad * 0.35)));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const pres = 0.75 + 0.25 * Math.sin((i + t) * 1.7) + (R() - 0.5) * 0.2;
        this.line(x0 + (x1 - x0) * t + (R() - 0.5) * jitter, z0 + (z1 - z0) * t + (R() - 0.5) * jitter, rad * (0.8 + R() * 0.4), Math.min(1, pres));
      }
    }
  }
  update(dt) {
    this.time += dt;
    if (this.pending.length) {
      const keep = [];
      for (const p of this.pending) { if (p[0] <= this.time) this.real(p[1], p[2], p[3], p[4]); else keep.push(p); }
      this.pending = keep;
    }
    const r = this.r; const prevT = r.getRenderTarget(); const ac = r.autoClear;
    r.autoClear = false;
    const run = (list, mat, rt) => {
      while (list.length) {
        const n = Math.min(MAXI, list.length);
        const part = list.splice(0, n);
        for (let i = 0; i < n; i++) {
          const d = part[i];
          this._p.set(d[0], 0, d[1]);
          this._e.set(0, d[3], 0); this._q.setFromEuler(this._e);
          if (Array.isArray(d[2])) this._s.set(d[2][0], 1, d[2][1]); else this._s.set(d[2] * 2, 1, d[2] * 2);
          this._m.compose(this._p, this._q, this._s);
          this.mesh.setMatrixAt(i, this._m);
          this.aCol.setXYZW(i, d[4], d[5], d[6], d[7]);
        }
        this.mesh.count = n; this.mesh.material = mat;
        this.mesh.instanceMatrix.needsUpdate = true; this.aCol.needsUpdate = true;
        r.setRenderTarget(rt); r.render(this.scene, this.cam);
      }
    };
    run(this.q.chalk, this.matChalk, this.rtChalk);
    run(this.q.line, this.matLine, this.rtReal);
    run(this.q.real, this.matReal, this.rtReal);
    run(this.q.lift, this.matLift, this.rtReal);
    r.setRenderTarget(prevT); r.autoClear = ac;
  }
}

// 部品ごとの塗り具合（CPU 格子）
export class Coverage {
  constructor(inside, x0, z0, x1, z1, cell) {
    this.x0 = x0; this.z0 = z0; this.cell = cell;
    this.nx = Math.max(1, Math.ceil((x1 - x0) / cell)); this.nz = Math.max(1, Math.ceil((z1 - z0) / cell));
    this.mask = new Uint8Array(this.nx * this.nz); this.paint = new Uint8Array(this.nx * this.nz);
    this.total = 0; this.count = 0;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
      if (inside(x, z)) { this.mask[j * this.nx + i] = 1; this.total++; }
    }
  }
  hit(x, z, rad) {
    let added = 0;
    const i0 = Math.floor((x - rad - this.x0) / this.cell), i1 = Math.floor((x + rad - this.x0) / this.cell);
    const j0 = Math.floor((z - rad - this.z0) / this.cell), j1 = Math.floor((z + rad - this.z0) / this.cell);
    for (let j = Math.max(0, j0); j <= Math.min(this.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) {
      const k = j * this.nx + i; if (!this.mask[k] || this.paint[k]) continue;
      const cx = this.x0 + (i + 0.5) * this.cell, cz = this.z0 + (j + 0.5) * this.cell;
      if ((cx - x) ** 2 + (cz - z) ** 2 <= rad * rad) { this.paint[k] = 1; this.count++; added++; }
    }
    return added;
  }
  contains(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false; return !!this.mask[j * this.nx + i];
  }
  get frac() { return this.total ? this.count / this.total : 0; }
  unpainted() {
    const out = [];
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) { const k = j * this.nx + i; if (this.mask[k] && !this.paint[k]) out.push([this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell]); }
    return out;
  }
  centroidUnpainted() {
    const u = this.unpainted(); if (!u.length) return null;
    let sx = 0, sz = 0; for (const p of u) { sx += p[0]; sz += p[1]; }
    // 重心に一番近い未塗りセル
    sx /= u.length; sz /= u.length; let best = u[0], bd = 1e9;
    for (const p of u) { const d = (p[0] - sx) ** 2 + (p[1] - sz) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }
}
