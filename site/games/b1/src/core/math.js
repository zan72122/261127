export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
}

export function springVec(pos, vel, target, omega, dt) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const dx = f * pos.x + dt * vel.x + hhoo * target.x;
  const dy = f * pos.y + dt * vel.y + hhoo * target.y;
  const dz = f * pos.z + dt * vel.z + hhoo * target.z;
  vel.x = (vel.x + hoo * (target.x - pos.x)) * detInv;
  vel.y = (vel.y + hoo * (target.y - pos.y)) * detInv;
  vel.z = (vel.z + hoo * (target.z - pos.z)) * detInv;
  pos.x = dx * detInv;
  pos.y = dy * detInv;
  pos.z = dz * detInv;
}
