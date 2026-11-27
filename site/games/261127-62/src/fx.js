// Particles (instanced billboards), contact shadows (instanced), glows.
import * as THREE from 'three';
import { TX } from './mats.js';
import { canvas } from './tex.js';

export const P_SPARK = 0, P_PETAL = 1, P_HEART = 2, P_NOTE = 3, P_BUBBLE = 4, P_DOT = 5, P_CRUMB = 6;

function atlas() {
  const S = 64, { c, g } = canvas(S * 4, S * 2);
  const list = [TX.sparkle, TX.petal, TX.heart, TX.note, TX.bubble];
  list.forEach((t, i) => g.drawImage(t.image, (i % 4) * S, Math.floor(i / 4) * S, S, S));
  // dot
  const gr = g.createRadialGradient(S * 1.5, S * 1.5, 0, S * 1.5, S * 1.5, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(S, S, S, S);
  // crumb
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(S * 2 + 20, S + 18); g.lineTo(S * 2 + 46, S + 24); g.lineTo(S * 2 + 40, S + 46); g.lineTo(S * 2 + 16, S + 40); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Particles {
  constructor(scene, max = 140) {
    this.max = max; this.list = [];
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aMisc.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas() } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iMisc; varying vec2 vUv; varying vec4 vCol;
        void main(){ vec4 mv = modelViewMatrix * vec4(iPos,1.0); float c=cos(iMisc.y), s=sin(iMisc.y);
        vec2 q = vec2(position.x*c - position.y*s, position.x*s + position.y*c) * iMisc.x; mv.xy += q; gl_Position = projectionMatrix * mv;
        float cell = iMisc.z; vUv = vec2((uv.x + mod(cell,4.0)) / 4.0, (uv.y + 1.0 - floor(cell/4.0)) / 2.0); vCol = iCol; }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
        void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, t.a * vCol.a); if (gl_FragColor.a < 0.01) discard;
        #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
    this.geo = g; scene.add(this.mesh);
  }
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    const p = Object.assign({ t: 0, life: 1, size: 0.012, grow: 0, rot: 0, spin: 0, cell: 0, col: new THREE.Color('#fff'), alpha: 1, drag: 1.5, grav: 0, vel: new THREE.Vector3(), pos: new THREE.Vector3() }, o);
    if (!(p.col instanceof THREE.Color)) p.col = new THREE.Color(p.col);
    p.pos = p.pos.clone(); p.vel = p.vel.clone();
    this.list.push(p); return p;
  }
  burst(pos, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.8 + 0.2, sp = (o.speed || 0.12) * (0.5 + Math.random());
      this.emit(Object.assign({}, o, { pos, vel: new THREE.Vector3(Math.cos(a) * sp * e, (o.up || 0.08) * (0.5 + Math.random()), Math.sin(a) * sp * e), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 6, life: (o.life || 0.9) * (0.7 + Math.random() * 0.6) }));
    }
  }
  update(dt) {
    const L = this.list; let n = 0;
    for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.t += dt; if (p.t >= p.life) L.splice(i, 1); }
    for (const p of L) {
      p.vel.y -= p.grav * dt; p.vel.multiplyScalar(Math.exp(-p.drag * dt)); p.pos.addScaledVector(p.vel, dt); p.rot += p.spin * dt;
      const k = p.t / p.life, fade = Math.min(1, p.t * 8) * (1 - Math.pow(k, 2));
      this.aPos.setXYZ(n, p.pos.x, p.pos.y, p.pos.z);
      this.aCol.setXYZW(n, p.col.r, p.col.g, p.col.b, p.alpha * fade);
      this.aMisc.setXYZ(n, p.size * (1 + p.grow * k), p.rot, p.cell);
      n++;
    }
    this.geo.instanceCount = n;
    if (n) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true; }
  }
  get count() { return this.list.length; }
}

export class Shadows {
  constructor(scene, max = 64) {
    this.max = max; this.n = 0;
    const quad = new THREE.PlaneGeometry(1, 1); quad.rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.a.setUsage(THREE.DynamicDrawUsage);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.b.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.a); g.setAttribute('iB', this.b);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TX.shadow } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      vertexShader: `attribute vec4 iA; attribute vec3 iB; varying vec2 vUv; varying float vA;
        void main(){ float c=cos(iB.z), s=sin(iB.z); vec3 p = position; p.x *= iA.w * iB.y; p.z *= iA.w; p.xz = vec2(p.x*c - p.z*s, p.x*s + p.z*c);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p + iA.xyz, 1.0); vUv = uv; vA = iB.x; }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vA; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(0.16,0.09,0.05, t.a * vA); }`,
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.geo = g; scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, y, z, size, alpha, aspect = 1, rot = 0) {
    if (this.n >= this.max || alpha <= 0.003) return;
    this.a.setXYZW(this.n, x, y + 0.0012, z, size); this.b.setXYZ(this.n, alpha, aspect, rot); this.n++;
  }
  end() { this.geo.instanceCount = this.n; this.a.needsUpdate = true; this.b.needsUpdate = true; }
}

export function glowSprite(color = '#fff6d8', size = 0.08, opacity = 0.8) {
  const m = new THREE.SpriteMaterial({ map: TX.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, toneMapped: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); s.renderOrder = 9; return s;
}
export function ringDecal(color = '#ffffff') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TX.ring, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 8; return m;
}
