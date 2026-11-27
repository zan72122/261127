import { clamp } from './math.js';

export class ColliderRegistry {
  constructor() {
    this.items = [];
    this.pierDecks = [];
  }

  addBox(name, x, z, hx, hz, minY, maxY, opts = {}) {
    this.items.push({
      name,
      kind: 'box',
      x,
      z,
      hx,
      hz,
      minY,
      maxY,
      walkableTop: !!opts.walkableTop,
      whaleSolid: opts.whaleSolid !== false,
      girlSolid: opts.girlSolid !== false,
    });
  }

  addCyl(name, x, z, r, minY, maxY, opts = {}) {
    this.items.push({
      name,
      kind: 'cyl',
      x,
      z,
      r,
      minY,
      maxY,
      whaleSolid: opts.whaleSolid !== false,
      girlSolid: opts.girlSolid !== false,
    });
  }

  addPierDeck(name, x, z, hx, hz, deckY) {
    this.pierDecks.push({ name, x, z, hx, hz, deckY });
  }

  pierDeckAt(x, z) {
    for (let i = 0; i < this.pierDecks.length; i++) {
      const d = this.pierDecks[i];
      if (Math.abs(x - d.x) <= d.hx && Math.abs(z - d.z) <= d.hz) {
        return d.deckY;
      }
    }
    return null;
  }

  resolveGirlWalk(pos, radius = 0.36) {
    const footY = pos.y;
    const headY = pos.y + 1.3;
    const onPier = this.pierDeckAt(pos.x, pos.z) !== null;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i];
      if (!c.girlSolid) continue;
      if (headY < c.minY || footY > c.maxY - 0.08) continue;
      // Allow stepping cleanly onto pier decks from the beach or water edge
      if (c.walkableTop && (onPier || footY >= c.maxY - 0.95)) continue;

      if (c.kind === 'cyl') {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const dist = Math.hypot(dx, dz);
        const minD = c.r + radius;
        if (dist < minD) {
          const nx = dist > 1e-4 ? dx / dist : 1;
          const nz = dist > 1e-4 ? dz / dist : 0;
          pos.x = c.x + nx * minD;
          pos.z = c.z + nz * minD;
        }
      } else {
        const ex = c.hx + radius;
        const ez = c.hz + radius;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
          const ox = ex - Math.abs(dx);
          const oz = ez - Math.abs(dz);
          if (ox < oz) {
            pos.x += dx >= 0 ? ox : -ox;
          } else {
            pos.z += dz >= 0 ? oz : -oz;
          }
        }
      }
    }
  }

  resolveWhale(pos, yaw, pitch, getGroundY, pushOut = null) {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const fx = sy * cp;
    const fy = sp;
    const fz = cy * cp;
    const rx = cy;
    const rz = -sy;

    // Multi-sphere hull along whale spine + pectoral fins + tail flukes so nose, flanks, and tail never clip
    const probes = [
      { ox: fx * 3.75, oy: fy * 3.75, oz: fz * 3.75, r: 1.05, bot: 0.48 },
      { ox: fx * 1.65, oy: fy * 1.65, oz: fz * 1.65, r: 1.55, bot: 0.98 },
      { ox: 0, oy: 0, oz: 0, r: 1.45, bot: 0.95 },
      { ox: -fx * 1.85, oy: -fy * 1.85, oz: -fz * 1.85, r: 1.22, bot: 0.72 },
      { ox: -fx * 3.85, oy: -fy * 3.85, oz: -fz * 3.85, r: 1.15, bot: 0.48 },
      { ox: -fx * 4.55 + rx * 1.65, oy: -fy * 4.55, oz: -fz * 4.55 + rz * 1.65, r: 0.72, bot: 0.42 },
      { ox: -fx * 4.55 - rx * 1.65, oy: -fy * 4.55, oz: -fz * 4.55 - rz * 1.65, r: 0.72, bot: 0.42 },
      { ox: fx * 0.9 + rx * 1.95, oy: fy * 0.9 - 0.15, oz: fz * 0.9 + rz * 1.95, r: 0.68, bot: 0.35 },
      { ox: fx * 0.9 - rx * 1.95, oy: fy * 0.9 - 0.15, oz: fz * 0.9 - rz * 1.95, r: 0.68, bot: 0.35 },
    ];

    let totalPushX = 0;
    let totalPushZ = 0;

    const pushSolids = () => {
      for (let pIdx = 0; pIdx < probes.length; pIdx++) {
        const pr = probes[pIdx];
        const px = pos.x + pr.ox;
        const py = pos.y + pr.oy;
        const pz = pos.z + pr.oz;
        const bellyY = py - pr.bot;
        const topY = py + 1.25;

        for (let i = 0; i < this.items.length; i++) {
          const c = this.items[i];
          if (!c.whaleSolid) continue;
          if (topY < c.minY || bellyY > c.maxY) continue;

          if (c.kind === 'cyl') {
            const dx = px - c.x;
            const dz = pz - c.z;
            const dist = Math.hypot(dx, dz);
            const minD = c.r + pr.r;
            if (dist < minD) {
              const nx = dist > 1e-4 ? dx / dist : 0;
              const nz = dist > 1e-4 ? dz / dist : 1;
              const push = minD - dist;
              pos.x += nx * push;
              pos.z += nz * push;
              totalPushX += nx * push;
              totalPushZ += nz * push;
            }
          } else {
            const ex = c.hx + pr.r;
            const ez = c.hz + pr.r;
            const dx = px - c.x;
            const dz = pz - c.z;
            if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
              const ox = ex - Math.abs(dx);
              const oz = ez - Math.abs(dz);
              if (ox < oz) {
                const s = dx >= 0 ? ox : -ox;
                pos.x += s;
                totalPushX += s;
              } else {
                const s = dz >= 0 ? oz : -oz;
                pos.z += s;
                totalPushZ += s;
              }
            }
          }
        }
      }
    };

    pushSolids();
    pushSolids();

    // Terrain clearance across the full whale footprint (prevents belly/nose/tail clipping into sandbars or shores)
    for (let pIdx = 0; pIdx < probes.length; pIdx++) {
      const pr = probes[pIdx];
      const sx = pos.x + pr.ox;
      const sz = pos.z + pr.oz;
      const gy = getGroundY(sx, sz);

      // If swimming low near rising shore or dry sandbar, gently deflect horizontally toward deeper water
      if (gy > -0.32 && pos.y + pr.oy < gy + pr.bot - 0.08) {
        const eps = 1.2;
        const gx = (getGroundY(sx + eps, sz) - getGroundY(sx - eps, sz)) / (2 * eps);
        const gz = (getGroundY(sx, sz + eps) - getGroundY(sx, sz - eps)) / (2 * eps);
        const glen = Math.hypot(gx, gz);
        if (glen > 0.02) {
          const depth = clamp((gy + 0.32) * 0.85, 0.05, 0.9);
          const pxPush = -(gx / glen) * depth;
          const pzPush = -(gz / glen) * depth;
          pos.x += pxPush;
          pos.z += pzPush;
          totalPushX += pxPush;
          totalPushZ += pzPush;
        }
      }
    }

    // Re-run solid push-out after terrain deflection so sandbar slide never pushes into coral or pier
    pushSolids();

    let requiredMinY = 0.0;
    for (let pIdx = 0; pIdx < probes.length; pIdx++) {
      const pr = probes[pIdx];
      const gyAfter = getGroundY(pos.x + pr.ox, pos.z + pr.oz);
      const minForProbe = gyAfter + pr.bot + 0.12 - pr.oy;
      if (minForProbe > requiredMinY) {
        requiredMinY = minForProbe;
      }
    }

    if (pos.y < requiredMinY) {
      pos.y = requiredMinY;
    }

    pos.x = clamp(pos.x, -126, 126);
    pos.z = clamp(pos.z, 19, 326);
    if (pushOut) {
      pushOut.x = totalPushX;
      pushOut.z = totalPushZ;
    }
  }
}
