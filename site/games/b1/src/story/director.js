import * as THREE from '../../lib/three.module.js';
import {
  BRIDGE_POS,
  DETOUR_CABIN_POS,
  FISHING_HUT_POS,
  HOME_POS,
  ICE_Y,
  OFFICE_POS,
  PIER_POS,
  shared,
} from '../core/env.js';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import { WordlessUI } from '../core/ui.js';
import { getGroundY, isOverLake } from '../world/terrain.js';
import { CameraRig, fitShot } from './camera.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _proj = new THREE.Vector3();

// Open-world director for 1970s Finnish Lapland Reindeer Sleigh & Aurora Post Office
// States strictly match Gate 3 spec: "garden" | "board" | "ride" | "walk" | "float" | "arrive"
export class Director {
  constructor(game) {
    this.g = game;
    this.girl = game.girl;
    this.puppy = game.puppy;
    this.vehicle = game.vehicle;
    this.rig = new CameraRig(game.camera);
    this.ray = new THREE.Raycaster();

    this.state = 'garden';
    this.phase = 'meetPup'; // meetPup | petPup | sleighLand | waitBoard | boardAnim | free | grounded | descending | officeGreet
    this.t = 0;
    this.phaseT = 0;

    // 1-finger steering
    this.ptr = null;
    this.steerX = 0;
    this.steerY = 0;
    this.targetSteerX = 0;
    this.targetSteerY = 0;

    // Sleigh flight/ride state
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 0;
    this.idleSeconds = 0;
    this.bestGoalDist = 9999;
    this.assistLatched = false;
    this.guideAlpha = 0;
    this.tapAssistTimer = 0;

    // Garden / walk / float state
    this.walkTarget = null;
    this.sleighParked = false;
    this.sleighLandStart = V(16, 13, 22);
    this.sleighLandTarget = V(2.1, 0, 8.0);
    this.sleighLandYaw = -0.38;
    this.boardStartGirl = new THREE.Vector3();
    this.floatVel = new THREE.Vector3();
    this.reboardMidair = false;
    this.reboardT = 0;
    this.reboardStartVeh = new THREE.Vector3();
    this.sleighRecall = false;
    this.sleighRecallT = 0;
    this.sleighRecallStart = new THREE.Vector3();
    this.sleighRecallEnd = new THREE.Vector3();
    this.arriveHold = 0;

    this.ui = new WordlessUI((mode) => {
      if (mode === 'dismount') this.triggerDismount();
      else if (mode === 'call') this.triggerCallOrBoard();
    });

    this._bindInput();
    this._installQA();
  }

  _installQA() {
    window.__qa = {
      getState: () => ({
        ready: Boolean(window.__ready),
        moment: window.__moment,
        state: this.state,
        boarded: this.state === 'ride',
        girl: {
          x: +this.girl.pos.x.toFixed(3),
          y: +this.girl.pos.y.toFixed(3),
          z: +this.girl.pos.z.toFixed(3),
        },
        vehicle: {
          x: +this.vehicle.pos.x.toFixed(3),
          y: +this.vehicle.pos.y.toFixed(3),
          z: +this.vehicle.pos.z.toFixed(3),
        },
        goal: {
          x: OFFICE_POS.x,
          y: OFFICE_POS.y,
          z: OFFICE_POS.z,
          name: 'Aurora Post Office',
        },
        yaw: +this.yaw.toFixed(4),
        speed: +this.speed.toFixed(3),
        alt: +(this.state === 'ride' || this.state === 'board' ? this.vehicle.pos.y : this.girl.pos.y).toFixed(3),
        idleSeconds: +this.idleSeconds.toFixed(3),
      }),
    };
  }

  _bindInput() {
    const inp = this.g.input;
    inp.on('first', () => this.g.audio.unlock());

    inp.on('down', (p) => {
      this.ptr = p;
      this._updateSteerFromPointer(p);
    });

    inp.on('move', (p) => {
      if (this.ptr && this.ptr.id === p.id) {
        this._updateSteerFromPointer(p);
      }
    });

    inp.on('up', (p) => {
      if (this.ptr && this.ptr.id === p.id) {
        this.ptr = null;
        this.targetSteerX = 0;
        this.targetSteerY = 0;
      }
    });

    inp.on('tap', (p) => {
      this._handleTap(p);
    });
  }

  _updateSteerFromPointer(p) {
    if (this.state !== 'ride' && this.state !== 'float') return;
    const vw = Math.max(1, this.g.vw);
    const vh = Math.max(1, this.g.vh);
    const scale = Math.min(vw, vh) * 0.16;
    const dx = p.x - p.sx;
    const dy = p.y - p.sy;

    if (p.dist >= 10) {
      this.targetSteerX = clamp(-dx / scale, -1, 1);
      this.targetSteerY = clamp(-dy / scale, -1, 1);
    } else {
      const ox = (p.x - vw * 0.5) / (vw * 0.3);
      const oy = (p.y - vh * 0.5) / (vh * 0.3);
      this.targetSteerX = Math.abs(ox) > 0.22 ? clamp(-ox, -1, 1) : 0;
      this.targetSteerY = Math.abs(oy) > 0.22 ? clamp(-oy, -1, 1) : 0;
    }

    // Only intentional sustained steering resets idleSeconds (casual quick taps still allow 20s assistance)
    const heldMs = performance.now() - p.t0;
    if (Math.hypot(this.targetSteerX, this.targetSteerY) > 0.15 && (p.dist >= 12 || heldMs > 380)) {
      this.idleSeconds = 0;
    }
  }

  _screenDist(worldPos, px, py) {
    _proj.copy(worldPos).project(this.g.camera);
    if (_proj.z > 1) return 9999;
    const sx = (_proj.x * 0.5 + 0.5) * this.g.vw;
    const sy = (-_proj.y * 0.5 + 0.5) * this.g.vh;
    return Math.hypot(sx - px, sy - py);
  }

  _raycastGround(px, py) {
    const ndc = new THREE.Vector2((px / this.g.vw) * 2 - 1, -(py / this.g.vh) * 2 + 1);
    this.ray.setFromCamera(ndc, this.g.camera);
    const hits = this.ray.intersectObject(this.g.terrain.group, true);
    if (hits.length > 0) return hits[0].point.clone();
    return null;
  }

  _hitsObject(px, py, rootObj) {
    const ndc = new THREE.Vector2((px / this.g.vw) * 2 - 1, -(py / this.g.vh) * 2 + 1);
    this.ray.setFromCamera(ndc, this.g.camera);
    return this.ray.intersectObject(rootObj, true).length > 0;
  }

  _handleTap(p) {
    if (this.state === 'garden') {
      // Strict intentional target check: four-corner taps must ONLY walk or pause, never advance!
      const hitPup =
        this._hitsObject(p.x, p.y, this.puppy.group) ||
        this._screenDist(this.puppy.pos.clone().add(V(0, 0.28, 0)), p.x, p.y) < 58;
      const hitSleigh =
        this.sleighParked &&
        (this._hitsObject(p.x, p.y, this.vehicle.group) ||
          this._screenDist(this.vehicle.pos.clone().add(V(0, 0.75, 0.4)), p.x, p.y) < 76);

      if (this.phase === 'meetPup' && hitPup) {
        this.triggerGardenAction('puppy');
        return;
      }
      if (this.phase === 'waitBoard' && hitSleigh) {
        this.triggerBoard();
        return;
      }

      // Unrelated tap on snow: girl walks toward tapped point inside the yard; sky tap keeps her put
      const pt = this._raycastGround(p.x, p.y);
      if (pt) {
        pt.x = clamp(pt.x, -9.5, 9.5);
        pt.z = clamp(pt.z, -4.5, 11.5);
        pt.y = getGroundY(pt.x, pt.z);
        this.walkTarget = pt;
      }
      return;
    }

    if (this.state === 'ride') {
      const hitGirl =
        this._hitsObject(p.x, p.y, this.girl.group) ||
        this._screenDist(this.girl.pos.clone().add(V(0, 0.65, 0)), p.x, p.y) < 120;
      if (hitGirl) {
        this.triggerDismount();
      } else {
        // Gentle assistance pulse for casual taps during ride
        this.tapAssistTimer = 0.85;
      }
      return;
    }

    if (this.state === 'walk') {
      const hitVeh =
        this._hitsObject(p.x, p.y, this.vehicle.group) ||
        this._screenDist(this.vehicle.pos.clone().add(V(0, 0.8, 0.3)), p.x, p.y) < 125;
      if (hitVeh) {
        this.triggerCallOrBoard();
        return;
      }
      const pt = this._raycastGround(p.x, p.y);
      if (pt) {
        pt.x = clamp(pt.x, -98, 98);
        pt.z = clamp(pt.z, -18, 355);
        pt.y = getGroundY(pt.x, pt.z);
        this.walkTarget = pt;
      }
      return;
    }

    if (this.state === 'float') {
      const hitVeh =
        this._hitsObject(p.x, p.y, this.vehicle.group) ||
        this._screenDist(this.vehicle.pos.clone().add(V(0, 0.8, 0.3)), p.x, p.y) < 125;
      if (hitVeh) this.triggerCallOrBoard();
    }
  }

  triggerGardenAction(kind) {
    if (this.state !== 'garden') return;
    if (kind === 'puppy' && this.phase === 'meetPup') {
      this.phase = 'petPup';
      this.phaseT = 0;
      this.walkTarget = null;
      this.g.audio.puppyYip();
    }
  }

  triggerBoard() {
    if (this.state !== 'garden' && this.state !== 'walk') return;
    this.state = 'board';
    this.phase = 'boardAnim';
    this.phaseT = 0;
    this.walkTarget = null;
    this.boardStartGirl.copy(this.girl.pos);
    this.g.audio.sleighBell(0.8);
  }

  triggerDismount() {
    if (this.state !== 'ride') return;
    this.ptr = null;
    this.targetSteerX = 0;
    this.targetSteerY = 0;
    this.vehicle.stowedBag.visible = false;
    this.puppy.mailbag.visible = true;

    const groundY = getGroundY(this.vehicle.pos.x, this.vehicle.pos.z);
    const altAbove = this.vehicle.pos.y - groundY;
    const seatWorld = new THREE.Vector3();
    this.vehicle.girlSeat.getWorldPosition(seatWorld);
    this.girl.pos.copy(seatWorld);

    if (altAbove > 1.8) {
      // Aerial dismount -> unrealistically slow luminous canopy descent
      this.state = 'float';
      this.phase = 'descending';
      this.phaseT = 0;
      this.reboardMidair = false;
      this.floatVel.set(Math.sin(this.yaw) * 2.2, -2.0, Math.cos(this.yaw) * 2.2);
      this.g.audio.chime(1.1);
    } else {
      // Ground dismount -> walk on foot
      this.state = 'walk';
      this.phase = 'grounded';
      this.phaseT = 0;
      const gx = this.vehicle.pos.x - Math.cos(this.yaw) * 1.6;
      const gz = this.vehicle.pos.z + Math.sin(this.yaw) * 1.6;
      this.girl.pos.set(gx, getGroundY(gx, gz), gz);
      this.g.props.colliders.resolveXZ(this.girl.pos, 0.38);
      this.girl.pos.y = getGroundY(this.girl.pos.x, this.girl.pos.z);
      this.puppy.pos.set(this.girl.pos.x + 0.7, this.girl.pos.y, this.girl.pos.z + 0.4);
      this.walkTarget = null;
      this.sleighRecall = false;
    }
  }

  triggerCallOrBoard() {
    if (this.state === 'float' && !this.reboardMidair) {
      this.reboardMidair = true;
      this.reboardT = 0;
      this.reboardStartVeh.copy(this.vehicle.pos);
      this.g.audio.sleighBell(0.9);
      return;
    }
    if (this.state === 'walk' && !this.sleighRecall) {
      this.sleighRecall = true;
      this.sleighRecallT = 0;
      this.sleighRecallStart.copy(this.vehicle.pos);
      const tx = this.girl.pos.x + Math.cos(this.girl.yaw) * 1.8;
      const tz = this.girl.pos.z - Math.sin(this.girl.yaw) * 1.8;
      this.sleighRecallEnd.set(tx, getGroundY(tx, tz), tz);
      this.g.audio.sleighBell(0.85);
    }
  }

  go(stateName) {
    this.t = 0;
    this.phaseT = 0;
    this.idleSeconds = 0;
    this.assistLatched = false;
    if (stateName === 'garden') {
      this.state = 'garden';
      this.phase = 'meetPup';
      this.sleighParked = false;
      this.girl.pos.set(-1.0, getGroundY(-1.0, 2.2), 2.2);
      this.girl.yaw = 0.52;
      this.puppy.pos.set(1.3, getGroundY(1.3, 4.8), 4.8);
      this.puppy.yaw = -2.55;
      this.puppy.mailbag.visible = true;
      this.vehicle.stowedBag.visible = false;
      this.vehicle.pos.copy(this.sleighLandStart);
      this.vehicle.group.visible = false;
      this.yaw = 0;
      this.pitch = 0;
      this.speed = 0;
      this.rig.snap(this._gardenShot());
    } else if (stateName === 'ride') {
      this.state = 'ride';
      this.phase = 'free';
      this.sleighParked = true;
      this.vehicle.group.visible = true;
      this.vehicle.stowedBag.visible = true;
      this.puppy.mailbag.visible = false;
      this.vehicle.pos.set(0, getGroundY(0, 12), 12);
      this.yaw = 0;
      this.pitch = 0.05;
      this.speed = 14;
      this.bestGoalDist = this.vehicle.pos.distanceTo(OFFICE_POS);
      this.rig.snap(this._rideShot());
    }
  }

  _resolvePlayerWalk(pos) {
    this.g.props.colliders.resolveXZ(pos, 0.38);
    if (this.sleighParked) {
      // Keep walking girl outside parked reindeer+sleigh footprint
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      for (const off of [-0.95, 0.4, 1.75]) {
        const sx = this.vehicle.pos.x + fwdX * off;
        const sz = this.vehicle.pos.z + fwdZ * off;
        const dx = pos.x - sx;
        const dz = pos.z - sz;
        const d = Math.hypot(dx, dz);
        const minR = 1.05;
        if (d < minR) {
          const nx = d > 1e-4 ? dx / d : 1;
          const nz = d > 1e-4 ? dz / d : 0;
          pos.x = sx + nx * minR;
          pos.z = sz + nz * minR;
        }
      }
    }
    pos.y = getGroundY(pos.x, pos.z);
  }

  _resolveSleighCollisions() {
    const coll = this.g.props.colliders;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    let totalDx = 0;
    let totalDz = 0;

    // 5 full-coverage probes from reindeer nose (+2.45) to sleigh rear (-1.55) so no part clips obstacles
    const probes = [
      { off: 2.45, r: 0.62 },
      { off: 1.45, r: 0.66 },
      { off: 0.35, r: 0.68 },
      { off: -0.65, r: 0.68 },
      { off: -1.55, r: 0.66 },
    ];

    const probe = new THREE.Vector3();
    for (let iter = 0; iter < 4; iter++) {
      for (const pr of probes) {
        probe.set(
          this.vehicle.pos.x + fwdX * pr.off,
          this.vehicle.pos.y,
          this.vehicle.pos.z + fwdZ * pr.off
        );
        const ox = probe.x;
        const oz = probe.z;
        if (coll.resolveXZ(probe, pr.r)) {
          const dx = probe.x - ox;
          const dz = probe.z - oz;
          this.vehicle.pos.x += dx;
          this.vehicle.pos.z += dz;
          totalDx += dx;
          totalDz += dz;
        }
      }
    }

    // Gently deflect heading tangent along obstacle when grazing
    const pushLen = Math.hypot(totalDx, totalDz);
    if (pushLen > 0.01) {
      const nx = totalDx / pushLen;
      const nz = totalDz / pushLen;
      const dot = fwdX * nx + fwdZ * nz;
      if (dot < -0.15) {
        const cross = fwdX * nz - fwdZ * nx;
        this.yaw = wrapAngle(this.yaw + (cross >= 0 ? -0.05 : 0.05));
      }
    }
  }

  _surfaceAt(x, z, curY) {
    let fy = getGroundY(x, z);
    if (Math.abs(x - BRIDGE_POS.x) < 2.2 && Math.abs(z - BRIDGE_POS.z) < 6.6 && curY >= ICE_Y + 0.85) {
      fy = Math.max(fy, ICE_Y + 1.63);
    }
    return fy;
  }

  _rideFloorInfo(x, z, curY) {
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const yC = this._surfaceAt(x, z, curY);
    const yF = this._surfaceAt(x + fwdX * 1.85, z + fwdZ * 1.85, curY);
    const yB = this._surfaceAt(x - fwdX * 1.35, z - fwdZ * 1.35, curY);
    const slopePitch = clamp(Math.atan2(yF - yB, 3.2), -0.35, 0.35);
    const floorY = Math.max(yC, yF - 1.85 * Math.sin(slopePitch), yB + 1.35 * Math.sin(slopePitch)) + 0.02;
    return { floorY, slopePitch };
  }

  _gardenShot() {
    const pts = [
      this.girl.pos.clone().add(V(0, 0.75, 0)),
      this.puppy.pos.clone().add(V(0, 0.35, 0)),
      HOME_POS.clone().add(V(1.6, 2.1, 1.8)), // keeps home cabin porch & glowing window in frame
    ];
    if (this.sleighParked) {
      pts.push(this.vehicle.pos.clone().add(V(0, 1.1, 1.2)));
      pts.push(this.vehicle.pos.clone().add(V(0, 0.8, -1.2)));
    }
    // Look north (+Z) so home cabin, yard, village, and glowing Hilltop Aurora Post Office are all visible
    const dir = V(0.42, 0.22, -0.88).normalize();
    return {
      ...fitShot({
        points: pts,
        dir,
        fov: 46,
        aspect: this.g.camera.aspect,
        margin: 0.16,
        minDist: 6.4,
        lift: 0.35,
      }),
      anchorId: 'garden',
      anchor: V(0, 0, 0),
    };
  }

  _rideShot() {
    const fwd = V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = V(fwd.z, 0, -fwd.x);
    const vPos = this.vehicle.pos;
    // Frame entire reindeer + wooden sleigh + girl cleanly in screen center, never cropped
    const dir = fwd.clone().multiplyScalar(-0.92).addScaledVector(V(0, 1, 0), 0.34).addScaledVector(right, 0.12).normalize();
    const pts = [
      vPos.clone().addScaledVector(fwd, 2.7).add(V(0, 1.75, 0)),
      vPos.clone().addScaledVector(fwd, -2.1).add(V(0, 1.1, 0)),
      vPos.clone().addScaledVector(right, 1.1).add(V(0, 0.5, 0)),
      vPos.clone().addScaledVector(right, -1.1).add(V(0, 0.5, 0)),
    ];
    const shot = fitShot({
      points: pts,
      dir,
      fov: 46 + clamp(this.speed / 22, 0, 1) * 5,
      aspect: this.g.camera.aspect,
      margin: 0.2,
      minDist: 7.6,
      lift: 0.35,
    });
    return { ...shot, anchorId: 'ride', anchor: vPos.clone() };
  }

  _walkShot() {
    const gp = this.girl.pos;
    const pts = [gp.clone().add(V(0, 0.9, 0)), gp.clone().add(V(0, 0.1, 0))];
    if (gp.distanceTo(this.vehicle.pos) < 12) {
      pts.push(this.vehicle.pos.clone().add(V(0, 0.9, 0.5)));
    }
    const dir = V(0.35, 0.34, -0.87).normalize();
    return {
      ...fitShot({
        points: pts,
        dir,
        fov: 44,
        aspect: this.g.camera.aspect,
        margin: 0.22,
        minDist: 5.4,
        lift: 0.25,
      }),
      anchorId: 'walk',
      anchor: gp.clone(),
    };
  }

  _floatShot() {
    const gp = this.girl.pos;
    const pts = [
      gp.clone().add(V(0, 2.25, 0)),
      gp.clone().add(V(0, -0.1, 0)),
      gp.clone().add(V(1.15, 1.0, 0)),
      gp.clone().add(V(-1.15, 1.0, 0)),
    ];
    const dir = V(0.45, 0.20, -0.87).normalize();
    return {
      ...fitShot({
        points: pts,
        dir,
        fov: 44,
        aspect: this.g.camera.aspect,
        margin: 0.2,
        minDist: 6.4,
        lift: 0.25,
      }),
      anchorId: 'float',
      anchor: gp.clone(),
    };
  }

  _arriveShot() {
    const pts = [
      this.girl.pos.clone().add(V(0, 1.25, 0)),
      this.vehicle.pos.clone().add(V(0, 1.4, 2.2)),
      this.vehicle.pos.clone().add(V(0, 0.9, -1.9)),
      this.g.companions.keeper.position.clone().add(V(0, 1.6, 0)),
      OFFICE_POS.clone().add(V(-4.9, 5.2, -3.5)),
      OFFICE_POS.clone().add(V(4.9, 5.2, -3.5)),
      OFFICE_POS.clone().add(V(0, 12.1, -1.2)),
    ];
    const dir = V(0.36, 0.12, -0.92).normalize();
    return {
      ...fitShot({
        points: pts,
        dir,
        fov: 46,
        aspect: this.g.camera.aspect,
        margin: 0.14,
        minDist: 12.2,
        lift: 0.55,
      }),
      anchorId: 'arrive',
      anchor: V(0, 0, 0),
    };
  }

  playerWorldPos() {
    return this.state === 'ride' || this.state === 'board' ? this.vehicle.pos : this.girl.pos;
  }

  update(dt) {
    this.t += dt;
    this.phaseT += dt;
    const t = this.t;

    this.steerX = damp(this.steerX, this.targetSteerX, 7.5, dt);
    this.steerY = damp(this.steerY, this.targetSteerY, 7.5, dt);

    if (this.state === 'ride') this.ui.setMode('dismount');
    else if (this.state === 'walk' || this.state === 'float') this.ui.setMode('call');
    else this.ui.setMode(null);

    let shot = null;
    let stiff = 2.6;

    // === 1. GARDEN ===
    if (this.state === 'garden') {
      window.__moment = 'garden';
      this.speed = 0;

      if (this.phase === 'meetPup') {
        this.g.fx.setCue(true, this.puppy.pos.x, this.puppy.pos.y, this.puppy.pos.z, 0.85, t, false);
        if (this.walkTarget) {
          const dx = this.walkTarget.x - this.girl.pos.x;
          const dz = this.walkTarget.z - this.girl.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.18) {
            const step = Math.min(dist, 2.8 * dt);
            this.girl.pos.x += (dx / dist) * step;
            this.girl.pos.z += (dz / dist) * step;
            this._resolvePlayerWalk(this.girl.pos);
            this.girl.yaw = wrapAngle(Math.atan2(dx, dz));
            this.girl.setPose('walk', dt, 2.8, t);
          } else {
            this.walkTarget = null;
            this.girl.setPose('idle', dt, 0, t);
          }
        } else {
          this.girl.setPose('idle', dt, 0, t);
        }
        this.puppy.animate(dt, t, { happy: true, sitting: true });
      } else if (this.phase === 'petPup') {
        const targetPos = this.puppy.pos.clone().add(V(-0.72, 0, -0.32));
        const dx = targetPos.x - this.girl.pos.x;
        const dz = targetPos.z - this.girl.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.18 && this.phaseT < 1.1) {
          const step = Math.min(dist, 3.2 * dt);
          this.girl.pos.x += (dx / dist) * step;
          this.girl.pos.z += (dz / dist) * step;
          this._resolvePlayerWalk(this.girl.pos);
          this.girl.yaw = Math.atan2(this.puppy.pos.x - this.girl.pos.x, this.puppy.pos.z - this.girl.pos.z);
          this.girl.setPose('walk', dt, 3.2, t);
        } else {
          this.girl.yaw = Math.atan2(this.puppy.pos.x - this.girl.pos.x, this.puppy.pos.z - this.girl.pos.z);
          this.girl.setPose('pet', dt, 0, t);
          if (this.phaseT >= 1.55) {
            this.phase = 'sleighLand';
            this.phaseT = 0;
            this.sleighParked = true;
            this.vehicle.group.visible = true;
            this.vehicle.pos.copy(this.sleighLandStart);
            this.g.audio.sleighBell(0.75);
          }
        }
        this.puppy.animate(dt, t, { happy: true });
        this.g.fx.setCue(false);
      } else if (this.phase === 'sleighLand') {
        const u = clamp(this.phaseT / 1.45, 0, 1);
        const e = smoothstep(0, 1, u);
        this.vehicle.pos.lerpVectors(this.sleighLandStart, this.sleighLandTarget, e);
        this.vehicle.pos.y = Math.max(getGroundY(this.vehicle.pos.x, this.vehicle.pos.z), this.vehicle.pos.y);
        this.yaw = wrapAngle(lerp(-2.1, this.sleighLandYaw, e));
        this.vehicle.group.rotation.set(0, this.yaw, 0);
        this.vehicle.animate(dt, t, { speed: u < 0.88 ? 8 : 0, airborne: u < 0.72 });
        this.girl.yaw = Math.atan2(this.vehicle.pos.x - this.girl.pos.x, this.vehicle.pos.z - this.girl.pos.z);
        this.girl.setPose('idle', dt, 0, t);

        // Puppy trots eagerly beside sleigh to offer the glowing mailbag
        const offerSpot = V(1.05, getGroundY(1.05, 7.25), 7.25);
        const pdx = offerSpot.x - this.puppy.pos.x;
        const pdz = offerSpot.z - this.puppy.pos.z;
        if (Math.hypot(pdx, pdz) > 0.2) {
          this.puppy.pos.lerp(offerSpot, Math.min(1, dt * 3.2));
          this.puppy.pos.y = getGroundY(this.puppy.pos.x, this.puppy.pos.z);
          this.puppy.yaw = Math.atan2(pdx, pdz);
          this.puppy.animate(dt, t, { moving: true, happy: true });
        } else {
          this.puppy.yaw = Math.atan2(this.girl.pos.x - this.puppy.pos.x, this.girl.pos.z - this.puppy.pos.z);
          this.puppy.animate(dt, t, { offer: true, happy: true });
        }

        if (u >= 1) {
          this.phase = 'waitBoard';
          this.phaseT = 0;
        }
      } else if (this.phase === 'waitBoard') {
        this.vehicle.pos.copy(this.sleighLandTarget);
        this.vehicle.pos.y = getGroundY(this.vehicle.pos.x, this.vehicle.pos.z);
        this.yaw = this.sleighLandYaw;
        this.vehicle.group.rotation.set(0, this.yaw, 0);
        this.vehicle.animate(dt, t, { crouch: true });
        this.g.fx.setCue(true, this.vehicle.pos.x, this.vehicle.pos.y, this.vehicle.pos.z - 0.4, 1.55, t, true);

        const offerSpot = V(1.05, getGroundY(1.05, 7.25), 7.25);
        if (this.puppy.pos.distanceTo(offerSpot) > 0.25) {
          this.puppy.pos.lerp(offerSpot, Math.min(1, dt * 4));
          this.puppy.pos.y = getGroundY(this.puppy.pos.x, this.puppy.pos.z);
        }
        this.puppy.yaw = Math.atan2(this.girl.pos.x - this.puppy.pos.x, this.girl.pos.z - this.puppy.pos.z);
        this.puppy.animate(dt, t, { offer: true, happy: true });

        if (this.walkTarget) {
          const dx = this.walkTarget.x - this.girl.pos.x;
          const dz = this.walkTarget.z - this.girl.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.18) {
            const step = Math.min(dist, 2.8 * dt);
            this.girl.pos.x += (dx / dist) * step;
            this.girl.pos.z += (dz / dist) * step;
            this._resolvePlayerWalk(this.girl.pos);
            this.girl.yaw = Math.atan2(dx, dz);
            this.girl.setPose('walk', dt, 2.8, t);
          } else {
            this.walkTarget = null;
            this.girl.setPose('idle', dt, 0, t);
          }
        } else {
          this.girl.setPose('idle', dt, 0, t);
        }
      }

      this.girl.group.rotation.set(0, this.girl.yaw, 0);
      this.puppy.group.rotation.set(0, this.puppy.yaw, 0);
      shot = this._gardenShot();
    }

    // === 2. BOARD (Receive glowing mailbag from puppy -> stow in sleigh -> board) ===
    else if (this.state === 'board') {
      window.__moment = 'board';
      this.g.fx.setCue(false);
      const u = clamp(this.phaseT / 1.5, 0, 1);
      const seatW = new THREE.Vector3();
      const pupSeatW = new THREE.Vector3();
      this.vehicle.girlSeat.getWorldPosition(seatW);
      this.vehicle.puppySeat.getWorldPosition(pupSeatW);

      const stowSpot = new THREE.Vector3();
      this.vehicle.stowedBag.getWorldPosition(stowSpot);
      const meetSpot = this.puppy.pos.clone().lerp(stowSpot, 0.4);
      meetSpot.y = getGroundY(meetSpot.x, meetSpot.z);

      if (u < 0.42) {
        const sub = smoothstep(0, 1, u / 0.42);
        this.girl.pos.lerpVectors(this.boardStartGirl, meetSpot, sub);
        this.girl.yaw = wrapAngle(Math.atan2(this.puppy.pos.x - this.girl.pos.x, this.puppy.pos.z - this.girl.pos.z));
        this.girl.setPose(sub < 0.7 ? 'walk' : 'pet', dt, 2.6, t);
        this.puppy.animate(dt, t, { offer: true, happy: true });
      } else {
        const sub = smoothstep(0, 1, (u - 0.42) / 0.58);
        this.vehicle.stowedBag.visible = true;
        this.puppy.mailbag.visible = false;
        this.girl.pos.lerpVectors(meetSpot, seatW, sub);
        this.girl.pos.y += Math.sin(sub * Math.PI) * 0.46;
        this.girl.yaw = wrapAngle(lerp(this.girl.yaw, this.yaw, sub));
        this.girl.setPose(sub < 0.72 ? 'walk' : 'sit', dt, 3, t);

        this.puppy.pos.lerp(pupSeatW, Math.min(1, dt * 7));
        this.puppy.yaw = this.yaw;
        this.puppy.animate(dt, t, { happy: true, sitting: true });
      }

      this.girl.group.rotation.set(0, this.girl.yaw, 0);
      this.puppy.group.rotation.set(0, this.puppy.yaw, 0);
      this.vehicle.animate(dt, t, { crouch: u < 0.8 });

      if (u >= 1) {
        this.state = 'ride';
        this.phase = 'free';
        this.phaseT = 0;
        this.speed = 13.5;
        this.pitch = 0.04;
        this.bestGoalDist = this.vehicle.pos.distanceTo(OFFICE_POS);
        this.g.audio.chime(1.0);
      }
      shot = this._rideShot();
      stiff = 2.8;
    }

    // === 3. RIDE (Active 3D steering over Lapland village, lake, aurora sky) ===
    else if (this.state === 'ride') {
      this.g.fx.setCue(false);
      const activeInput = Math.hypot(this.targetSteerX, this.targetSteerY) > 0.1;
      const intentionalHold = activeInput && this.ptr && (this.ptr.dist >= 12 || performance.now() - this.ptr.t0 > 380);
      const distToGoal = this.vehicle.pos.distanceTo(OFFICE_POS);
      if (intentionalHold) {
        this.idleSeconds = 0;
        this.assistLatched = false;
      } else if (distToGoal < this.bestGoalDist - 1.5) {
        this.bestGoalDist = distToGoal;
        this.idleSeconds = 0;
      } else {
        this.idleSeconds += dt;
      }
      if (this.idleSeconds >= 19) this.assistLatched = true;

      // Gentle 20s assistance toward Aurora Post Office (latches once active until player steers or arrives)
      const assistWeight = intentionalHold ? 0 : Math.max(smoothstep(18, 24, this.idleSeconds), this.assistLatched ? 0.85 : 0);
      this.guideAlpha = damp(this.guideAlpha, assistWeight, 2.5, dt);
      if (this.tapAssistTimer > 0) this.tapAssistTimer = Math.max(0, this.tapAssistTimer - dt);

      let turnRate = this.steerX * 0.92;
      let targetPitch = Math.abs(this.steerY) > 0.06 ? this.steerY * 0.56 : 0;

      const totalAssist = Math.max(assistWeight, this.tapAssistTimer > 0 && !activeInput ? 0.45 : 0);
      if (totalAssist > 0.01) {
        const dx = OFFICE_POS.x - this.vehicle.pos.x;
        const dz = OFFICE_POS.z - this.vehicle.pos.z;
        const aimYaw = Math.atan2(dx, dz);
        const yawDiff = wrapAngle(aimYaw - this.yaw);
        turnRate += clamp(yawDiff * 1.4, -0.75, 0.75) * totalAssist;

        if (assistWeight > 0.01) {
          const targetY = Math.hypot(dx, dz) > 45 ? Math.max(getGroundY(this.vehicle.pos.x, this.vehicle.pos.z) + 5, OFFICE_POS.y + 4) : OFFICE_POS.y + 1.2;
          const aimPitch = clamp((targetY - this.vehicle.pos.y) * 0.08, -0.35, 0.42);
          targetPitch = lerp(targetPitch, aimPitch, assistWeight);
        }
      }

      this.yaw = wrapAngle(this.yaw + turnRate * dt);
      this.pitch = damp(this.pitch, targetPitch, 4.2, dt);

      const onAuroraRoad = this.vehicle.pos.y > 10 && this.vehicle.pos.z > 155 && this.vehicle.pos.z < 318;
      const targetSpeed = onAuroraRoad ? 17.5 : 14.5;
      this.speed = damp(this.speed, targetSpeed, 2.5, dt);

      const horizSpeed = Math.cos(this.pitch) * this.speed;
      const vy = Math.sin(this.pitch) * this.speed;
      this.vehicle.pos.x += Math.sin(this.yaw) * horizSpeed * dt;
      this.vehicle.pos.z += Math.cos(this.yaw) * horizSpeed * dt;
      this.vehicle.pos.y += vy * dt;

      // Soft outer valley boundary (applied before collider push-out so borders never push into trees)
      this.vehicle.pos.x = clamp(this.vehicle.pos.x, -104, 104);
      this.vehicle.pos.z = clamp(this.vehicle.pos.z, -20, 360);

      // 5-probe collision deflection around buildings, lanterns, postboxes, and trees
      this._resolveSleighCollisions();

      // Multi-point floor contact & terrain slope pitch (prevents runners/hooves from dipping into snow on climbs)
      const { floorY, slopePitch } = this._rideFloorInfo(this.vehicle.pos.x, this.vehicle.pos.z, this.vehicle.pos.y);
      if (this.vehicle.pos.y <= floorY) {
        this.vehicle.pos.y = floorY;
        if (this.pitch < 0) this.pitch = damp(this.pitch, 0, 12, dt);
      }
      this.vehicle.pos.y = Math.min(this.vehicle.pos.y, 72);

      const airborne = this.vehicle.pos.y > floorY + 0.55;
      const groundClear = clamp((this.vehicle.pos.y - floorY) / 0.65, 0, 1);
      const visPitch = airborne ? -this.pitch * 0.65 : -slopePitch;
      const visRoll = -this.steerX * (0.04 + 0.18 * groundClear);
      this.vehicle.group.rotation.set(visPitch, this.yaw, visRoll);
      this.vehicle.animate(dt, t, { speed: this.speed, airborne });

      // Seat girl & puppy cleanly on sleigh
      this.vehicle.girlSeat.getWorldPosition(this.girl.pos);
      this.vehicle.puppySeat.getWorldPosition(this.puppy.pos);
      this.girl.yaw = this.yaw;
      this.puppy.yaw = this.yaw;
      this.girl.group.rotation.copy(this.vehicle.group.rotation);
      this.puppy.group.rotation.copy(this.vehicle.group.rotation);
      this.girl.setPose('sit', dt, this.speed, t);
      this.puppy.animate(dt, t, { happy: true, sitting: true });

      if (Math.floor(t * 2.2) !== Math.floor((t - dt) * 2.2)) {
        this.g.audio.sleighBell(airborne ? 0.35 : 0.22);
      }

      const overLakeArea =
        isOverLake(this.vehicle.pos.x, this.vehicle.pos.z) ||
        Math.hypot(this.vehicle.pos.x - BRIDGE_POS.x, this.vehicle.pos.z - BRIDGE_POS.z) < 26 ||
        Math.hypot(this.vehicle.pos.x - PIER_POS.x, this.vehicle.pos.z - PIER_POS.z) < 26 ||
        Math.hypot(this.vehicle.pos.x - FISHING_HUT_POS.x, this.vehicle.pos.z - FISHING_HUT_POS.z) < 32 ||
        Math.hypot(this.vehicle.pos.x - DETOUR_CABIN_POS.x, this.vehicle.pos.z - DETOUR_CABIN_POS.z) < 28;
      if (onAuroraRoad) window.__moment = 'aurora';
      else if (overLakeArea) window.__moment = 'lake';
      else window.__moment = 'village';

      const dOfficeH = Math.hypot(this.vehicle.pos.x - OFFICE_POS.x, this.vehicle.pos.z - OFFICE_POS.z);
      if (dOfficeH < 15.5 && Math.abs(this.vehicle.pos.y - OFFICE_POS.y) < 12) {
        this.state = 'arrive';
        this.phase = 'officeGreet';
        this.phaseT = 0;
        this.arriveHold = 0;
        this.g.audio.chime(1.0);
      }

      shot = this._rideShot();
      stiff = 3.6;
    }

    // === 4. FLOAT (Slow luminous canopy descent from sky, centered) ===
    else if (this.state === 'float') {
      window.__moment = 'float';
      this.g.fx.setCue(false);
      this.guideAlpha = 0;

      if (this.reboardMidair) {
        this.reboardT += dt * 1.1;
        const u = clamp(this.reboardT, 0, 1);
        const e = smoothstep(0, 1, u);
        this.vehicle.pos.lerpVectors(this.reboardStartVeh, this.girl.pos.clone().add(V(0, -0.45, 0)), e);
        this.yaw = Math.atan2(this.girl.pos.x - this.vehicle.pos.x, this.girl.pos.z - this.vehicle.pos.z);
        this.vehicle.group.rotation.set(0, this.yaw, 0);
        this.vehicle.animate(dt, t, { speed: 12, airborne: true });
        this.girl.setPose('float', dt, 2, t);
        this.puppy.pos.copy(this.girl.pos).add(V(0.14, 0.56, 0.2));
        if (u >= 1) {
          this.state = 'ride';
          this.phase = 'free';
          this.phaseT = 0;
          this.reboardMidair = false;
          this.vehicle.stowedBag.visible = true;
          this.puppy.mailbag.visible = false;
          this.speed = 14;
        }
      } else {
        const moveYaw = this.yaw;
        const targetVx = (-this.steerX * Math.cos(moveYaw) + this.steerY * Math.sin(moveYaw)) * 3.8;
        const targetVz = (this.steerX * Math.sin(moveYaw) + this.steerY * Math.cos(moveYaw)) * 3.8;
        this.floatVel.x = damp(this.floatVel.x, targetVx, 3.0, dt);
        this.floatVel.z = damp(this.floatVel.z, targetVz, 3.0, dt);
        this.floatVel.y = -2.0;

        this.girl.pos.addScaledVector(this.floatVel, dt);
        this.girl.pos.x = clamp(this.girl.pos.x, -98, 98);
        this.girl.pos.z = clamp(this.girl.pos.z, -18, 355);
        this.g.props.colliders.resolveXZ(this.girl.pos, 0.45);

        const gy = getGroundY(this.girl.pos.x, this.girl.pos.z);
        this.girl.setPose('float', dt, Math.hypot(this.floatVel.x, this.floatVel.z), t);
        this.girl.group.rotation.set(0, this.girl.yaw, 0);

        this.puppy.pos.set(this.girl.pos.x - Math.cos(this.girl.yaw) * 0.12, this.girl.pos.y + 0.54, this.girl.pos.z + Math.sin(this.girl.yaw) * 0.12 + 0.16);
        this.puppy.group.rotation.set(0, this.girl.yaw, 0);
        this.puppy.animate(dt, t, { happy: true, sitting: true });

        const waitX = this.girl.pos.x + 5.5;
        const waitZ = this.girl.pos.z + 3.5;
        const waitY = Math.max(getGroundY(waitX, waitZ), this.girl.pos.y - 2.5);
        this.vehicle.pos.x = damp(this.vehicle.pos.x, waitX, 1.4, dt);
        this.vehicle.pos.z = damp(this.vehicle.pos.z, waitZ, 1.4, dt);
        this.vehicle.pos.y = damp(this.vehicle.pos.y, waitY, 1.8, dt);
        this.vehicle.animate(dt, t, { speed: 6, airborne: this.vehicle.pos.y > getGroundY(this.vehicle.pos.x, this.vehicle.pos.z) + 0.4 });

        if (this.girl.pos.y <= gy + 0.06) {
          this.girl.pos.y = gy;
          this.state = 'walk';
          this.phase = 'grounded';
          this.phaseT = 0;
          this.walkTarget = null;
          this.sleighRecall = false;
          this.puppy.pos.set(this.girl.pos.x + 0.7, gy, this.girl.pos.z + 0.4);
          this.vehicle.pos.y = getGroundY(this.vehicle.pos.x, this.vehicle.pos.z);
        }
      }
      shot = this._floatShot();
      stiff = 3.2;
    }

    // === 5. WALK (On foot anywhere on snow or frozen lake; call sleigh to re-board) ===
    else if (this.state === 'walk') {
      window.__moment = 'land';
      this.guideAlpha = 0;
      this.speed = 0;

      if (this.sleighRecall) {
        this.sleighRecallT += dt * 1.1;
        const u = clamp(this.sleighRecallT, 0, 1);
        const e = smoothstep(0, 1, u);
        this.vehicle.pos.lerpVectors(this.sleighRecallStart, this.sleighRecallEnd, e);
        this.vehicle.pos.y = getGroundY(this.vehicle.pos.x, this.vehicle.pos.z);
        this.yaw = Math.atan2(this.sleighRecallEnd.x - this.sleighRecallStart.x, this.sleighRecallEnd.z - this.sleighRecallStart.z);
        this.vehicle.group.rotation.set(0, this.yaw, 0);
        this.vehicle.animate(dt, t, { speed: 9 });
        this.girl.setPose('idle', dt, 0, t);
        if (u >= 1) {
          this.sleighRecall = false;
          this.triggerBoard();
        }
      } else {
        this.vehicle.pos.y = getGroundY(this.vehicle.pos.x, this.vehicle.pos.z);
        this.vehicle.animate(dt, t, { crouch: true });
        this.g.fx.setCue(true, this.vehicle.pos.x, this.vehicle.pos.y, this.vehicle.pos.z, 1.4, t, true);

        if (this.walkTarget) {
          const dx = this.walkTarget.x - this.girl.pos.x;
          const dz = this.walkTarget.z - this.girl.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.2) {
            const step = Math.min(dist, 3.2 * dt);
            this.girl.pos.x += (dx / dist) * step;
            this.girl.pos.z += (dz / dist) * step;
            this._resolvePlayerWalk(this.girl.pos);
            this.girl.yaw = Math.atan2(dx, dz);
            this.girl.setPose('walk', dt, 3.2, t);
          } else {
            this.walkTarget = null;
            this.girl.setPose('idle', dt, 0, t);
          }
        } else {
          this.girl.setPose('idle', dt, 0, t);
        }

        const pupGoalX = this.girl.pos.x + 0.75;
        const pupGoalZ = this.girl.pos.z + 0.45;
        const pdx = pupGoalX - this.puppy.pos.x;
        const pdz = pupGoalZ - this.puppy.pos.z;
        const pdist = Math.hypot(pdx, pdz);
        if (pdist > 0.25) {
          const pstep = Math.min(pdist, 3.6 * dt);
          this.puppy.pos.x += (pdx / pdist) * pstep;
          this.puppy.pos.z += (pdz / pdist) * pstep;
          this.puppy.pos.y = getGroundY(this.puppy.pos.x, this.puppy.pos.z);
          this.puppy.yaw = Math.atan2(pdx, pdz);
          this.puppy.animate(dt, t, { moving: true, happy: true });
        } else {
          this.puppy.animate(dt, t, { happy: true, sitting: true });
        }
      }

      this.girl.group.rotation.set(0, this.girl.yaw, 0);
      this.puppy.group.rotation.set(0, this.puppy.yaw, 0);

      if (Math.hypot(this.girl.pos.x - OFFICE_POS.x, this.girl.pos.z - OFFICE_POS.z) < 12) {
        this.state = 'arrive';
        this.phase = 'officeGreet';
        this.phaseT = 0;
        this.arriveHold = 0;
        this.g.audio.chime(1.0);
      }
      shot = this._walkShot();
      stiff = 2.8;
    }

    // === 6. ARRIVE (Aurora Post Office reunion, framed large & clear with zero upper crop) ===
    else if (this.state === 'arrive') {
      window.__moment = 'office';
      this.g.fx.setCue(false);
      this.guideAlpha = 0;
      this.speed = 0;
      this.arriveHold += dt;

      const parkPos = V(OFFICE_POS.x - 2.35, getGroundY(OFFICE_POS.x - 2.35, OFFICE_POS.z - 9.4), OFFICE_POS.z - 9.4);
      this.vehicle.pos.lerp(parkPos, Math.min(1, dt * 3.0));
      this.vehicle.pos.y = getGroundY(this.vehicle.pos.x, this.vehicle.pos.z);
      this.yaw = wrapAngle(lerp(this.yaw, 0.58, Math.min(1, dt * 3.0)));
      this.vehicle.group.rotation.set(0, this.yaw, 0);
      this.vehicle.animate(dt, t, { speed: 0 });
      this.vehicle.stowedBag.visible = true;
      this.puppy.mailbag.visible = false;

      const standPos = V(OFFICE_POS.x + 0.65, getGroundY(OFFICE_POS.x + 0.65, OFFICE_POS.z - 7.1), OFFICE_POS.z - 7.1);
      this.girl.pos.lerp(standPos, Math.min(1, dt * 3.2));
      this.girl.pos.y = getGroundY(this.girl.pos.x, this.girl.pos.z);
      this.girl.yaw = Math.atan2(this.g.companions.keeper.position.x - this.girl.pos.x, this.g.companions.keeper.position.z - this.girl.pos.z);
      this.girl.group.rotation.set(0, this.girl.yaw, 0);
      this.girl.setPose('idle', dt, 0, t);

      const pupSpot = V(OFFICE_POS.x - 0.15, getGroundY(OFFICE_POS.x - 0.15, OFFICE_POS.z - 6.7), OFFICE_POS.z - 6.7);
      this.puppy.pos.lerp(pupSpot, Math.min(1, dt * 3.4));
      this.puppy.pos.y = getGroundY(this.puppy.pos.x, this.puppy.pos.z);
      this.puppy.yaw = this.girl.yaw;
      this.puppy.group.rotation.set(0, this.puppy.yaw, 0);
      this.puppy.animate(dt, t, { happy: true });

      this.g.companions.update(t, 1);
      shot = this._arriveShot();
      stiff = 3.4;
    }

    if (this.state !== 'arrive') {
      this.g.companions.update(t, 0);
    }

    // Atmosphere progression: winter twilight in village -> deep aurora night on ridge & post office
    const pPos = this.playerWorldPos();
    const northFactor = smoothstep(80, 260, pPos.z);
    const altFactor = smoothstep(10, 32, pPos.y);
    shared.uNight.value = damp(shared.uNight.value, clamp(0.18 + northFactor * 0.55 + altFactor * 0.35, 0.18, 1.0), 1.8, dt);
    shared.uAuroraOn.value = damp(shared.uAuroraOn.value, clamp(0.38 + northFactor * 0.45 + altFactor * 0.25, 0.35, 1.0), 1.8, dt);
    shared.uSpeed.value = this.speed;

    this.rig.update(dt, shot, stiff);
    shared.uCameraPos.value.copy(this.g.camera.position);
  }
}
