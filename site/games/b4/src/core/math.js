import * as THREE from '../../lib/three.module.js';

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function springStep(state, target, omega, dt) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const detX = f * state.x + dt * state.v + hhoo * target;
  const detV = state.v + hoo * (target - state.x);
  state.x = detX * detInv;
  state.v = detV * detInv;
  return state.x;
}

export function springVec(pos, vel, target, omega, dt) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);

  const tx = (f * pos.x + dt * vel.x + hhoo * target.x) * detInv;
  const ty = (f * pos.y + dt * vel.y + hhoo * target.y) * detInv;
  const tz = (f * pos.z + dt * vel.z + hhoo * target.z) * detInv;

  vel.x = (vel.x + hoo * (target.x - pos.x)) * detInv;
  vel.y = (vel.y + hoo * (target.y - pos.y)) * detInv;
  vel.z = (vel.z + hoo * (target.z - pos.z)) * detInv;

  pos.set(tx, ty, tz);
  return pos;
}

// Deterministic seeded PRNG (Mulberry32)
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function valueNoise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbm2(x, z, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, z * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

export function distXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function v3(x = 0, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}
