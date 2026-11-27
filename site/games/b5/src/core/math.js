export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}

export function wrapAngle(a) {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function springStep(state, target, freq, dt) {
  const omega = freq * Math.PI * 2;
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

export function springVec(pos, vel, target, freq, dt) {
  const omega = freq * Math.PI * 2;
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  pos.x = (f * pos.x + dt * vel.x + hhoo * target.x) * detInv;
  pos.y = (f * pos.y + dt * vel.y + hhoo * target.y) * detInv;
  pos.z = (f * pos.z + dt * vel.z + hhoo * target.z) * detInv;
  vel.x = (vel.x + hoo * (target.x - pos.x)) * detInv;
  vel.y = (vel.y + hoo * (target.y - pos.y)) * detInv;
  vel.z = (vel.z + hoo * (target.z - pos.z)) * detInv;
}

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function noise2D(x, z) {
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

export function fbm2D(x, z, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, z * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return sum;
}
