// Shared layout constants (meters, y up, camera looks toward -z)
export const L = {
  room: { x0: -0.45, x1: 0.95, z0: -0.40, z1: 0.30 },
  living: { x0: -0.45, x1: 0.45 },
  bedroom: { x0: 0.45, x1: 0.95 },
  divX: 0.45, divZ1: -0.15,
  wallH: 0.48, wallT: 0.02, wallZ: -0.425,
  door: { x: -0.26, w: 0.15, h: 0.32, z: -0.405, hingeX: -0.335 },
  porch: { x0: -0.42, x1: -0.10, z0: -0.60, z1: -0.425, y: -0.004 },
  porchSpot: { x: -0.26, z: -0.455 },
  genkan: { x0: -0.45, x1: -0.02, z0: -0.40, z1: -0.27 },
  shelf: { x0: -0.165, x1: -0.03, z0: -0.40, z1: -0.352, tiers: [0.016, 0.066], top: 0.113, pairs: [-0.131, -0.064] },
  win: { x0: 0.06, x1: 0.24, y0: 0.13, y1: 0.34 },
  win2: { x0: 0.66, x1: 0.84, y0: 0.18, y1: 0.35 },
  table: { x: 0.10, z: -0.065, r: 0.105, top: 0.108 },
  chairs: [
    { x: -0.064, z: -0.065, yaw: Math.PI / 2 },       // left, faces +x
    { x: 0.264, z: -0.065, yaw: -Math.PI / 2 },       // right, faces -x
    { x: 0.10, z: -0.232, yaw: 0 },                   // back, faces camera
    { x: -0.15, z: 0.12, yaw: Math.PI * 0.78 },       // pouf, faces table (back-right)
  ],
  seatH: 0.058,
  trolley: { x0: 0.305, x1: 0.425, z0: -0.385, z1: -0.295, top: 0.10 },
  hooks: [
    { x: 0.016, y: 0.285, z: -0.395 },
    { x: 0.335, y: 0.285, z: -0.395 },
    { x: 0.75, y: 0.415, z: -0.395 },
  ],
  bed: { x0: 0.585, x1: 0.925, z0: -0.40, z1: -0.18, top: 0.062, spots: [-0.335, -0.245], headX: 0.636 },
  night: { x0: 0.478, x1: 0.56, z0: -0.40, z1: -0.33, top: 0.09 },
  basket: { x: -0.31, z: 0.15 },
};

export const VIEW = {
  living: { x0: -0.35, x1: 0.435, z0: -0.40, z1: 0.22, y1: 0.36 },
  bed: { x0: 0.47, x1: 0.94, z0: -0.40, z1: 0.24, y1: 0.36 },
  all: { x0: -0.43, x1: 0.93, z0: -0.40, z1: 0.24, y1: 0.36, top: 0.66 },
};
