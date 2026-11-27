import * as THREE from '../../lib/three.module.js';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function springStep(state, target, stiff, dt) {
  const f = stiff * 2 * Math.PI;
  const g = 1 + 2 * f * dt;
  const oo = f * f;
  const dtOo = dt * oo;
  const dt2Oo = dt * dtOo;
  const detInv = 1 / (g + dt2Oo);
  const nextX = (g * state.x + dt * state.v + dt2Oo * target) * detInv;
  const nextV = (state.v + dtOo * (target - state.x)) * detInv;
  state.x = nextX;
  state.v = nextV;
  return nextX;
}

const _tmp = new THREE.Vector3();
export function springVec(pos, vel, target, stiff, dt) {
  const f = stiff * 2 * Math.PI;
  const g = 1 + 2 * f * dt;
  const oo = f * f;
  const dtOo = dt * oo;
  const dt2Oo = dt * dtOo;
  const detInv = 1 / (g + dt2Oo);

  _tmp.copy(pos).multiplyScalar(g).addScaledVector(vel, dt).addScaledVector(target, dt2Oo).multiplyScalar(detInv);
  vel.x = (vel.x + dtOo * (target.x - pos.x)) * detInv;
  vel.y = (vel.y + dtOo * (target.y - pos.y)) * detInv;
  vel.z = (vel.z + dtOo * (target.z - pos.z)) * detInv;
  pos.copy(_tmp);
  return pos;
}
