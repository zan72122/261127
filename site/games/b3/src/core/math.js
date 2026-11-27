import * as THREE from '../../lib/three.module.js';

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
};

export function rng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function springStep(state, target, stiffness, dt) {
  const omega = stiffness * 2.2;
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const x = (f * state.x + dt * state.v + hhoo * target) * detInv;
  const v = (state.v + hoo * (target - state.x)) * detInv;
  state.x = x;
  state.v = v;
  return x;
}

export function springVec(cur, vel, target, stiffness, dt) {
  const omega = stiffness * 2.2;
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  cur.x = (f * cur.x + dt * vel.x + hhoo * target.x) * detInv;
  cur.y = (f * cur.y + dt * vel.y + hhoo * target.y) * detInv;
  cur.z = (f * cur.z + dt * vel.z + hhoo * target.z) * detInv;
  vel.x = (vel.x + hoo * (target.x - cur.x)) * detInv;
  vel.y = (vel.y + hoo * (target.y - cur.y)) * detInv;
  vel.z = (vel.z + hoo * (target.z - cur.z)) * detInv;
  return cur;
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
