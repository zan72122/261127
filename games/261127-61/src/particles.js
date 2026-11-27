// Small grass bits and soil grains (capped), plus a soft sparkle for discoveries.
import * as THREE from 'three';

export function makeParticles(max = 72) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), kind = new Uint8Array(max);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec4 color; attribute float size; varying vec4 vC; uniform float uScale;
      void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord-0.5; float a = smoothstep(0.5, 0.15, length(d)); gl_FragColor = vec4(vC.rgb, vC.a*a); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5;
  let head = 0;
  function spawn(p, v, c, s, l, k) {
    const i = head; head = (head + 1) % max;
    pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3); col.set(c, i * 4); size[i] = s; life[i] = l; kind[i] = k;
  }
  return {
    points: pts, mat: m,
    burst(p, n, dir) {
      for (let k = 0; k < n; k++) {
        const soil = Math.random() < 0.4;
        const v = new THREE.Vector3((Math.random() - 0.5) * 0.6 + dir.x * 0.8, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6 + dir.z * 0.8);
        spawn(p, v, soil ? [0.35, 0.25, 0.16, 1] : [0.72, 0.62, 0.36, 1], soil ? 0.018 : 0.03, 0.9 + Math.random() * 0.6, soil ? 1 : 2);
      }
    },
    sparkle(p, n) {
      for (let k = 0; k < n; k++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.15 + Math.random() * 0.25, (Math.random() - 0.5) * 0.25);
        spawn(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4)), v, [1.0, 0.86, 0.55, 0.9], 0.05, 1.6 + Math.random(), 3);
      }
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) { col[i * 4 + 3] = 0; continue; }
        life[i] -= dt;
        const k = kind[i];
        if (k !== 3) vel[i * 3 + 1] -= 3.2 * dt; else vel[i * 3 + 1] *= 0.99;
        if (k === 2) { vel[i * 3] *= 0.97; vel[i * 3 + 2] *= 0.97; vel[i * 3 + 1] = Math.max(vel[i * 3 + 1], -0.35); }
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.01) { pos[i * 3 + 1] = 0.01; vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0; }
        col[i * 4 + 3] = Math.min(1, life[i] * 1.5) * (k === 3 ? 0.8 : 1);
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
    },
  };
}
