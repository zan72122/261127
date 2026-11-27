import * as THREE from '../../lib/three.module.js';
import {
  COVE_POS,
  GIRL_START_POS,
  LIGHTHOUSE_POS,
  SANDBAR_MAIN_POS,
  SANDBAR_WEST_POS,
  SEA_LEVEL,
  WHALE_START_POS,
  shared,
} from '../core/env.js';
import { clamp, damp, smoothstep, wrapAngle } from '../core/math.js';
import { WordlessUI } from '../core/ui.js';
import { getGroundY, getWalkSurfaceY } from '../world/terrain.js';
import { CameraRig, fitShot } from './camera.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _tmp = new THREE.Vector3();

export class Director {
  constructor(game) {
    this.g = game;
    this.girl = game.girl;
    this.whale = game.whale;
    this.colliders = game.colliders;
    this.rig = new CameraRig(game.camera);
    this.ray = new THREE.Raycaster();

    // State MUST strictly be one of: garden | board | ride | walk | float | arrive
    this.state = 'garden';
    this.phase = 'explore';
    this.t = 0;
    this.phaseT = 0;

    // 1-finger steering
    this.ptr = null;
    this.targetSteerX = 0;
    this.targetSteerY = 0;
    this.steerX = 0;
    this.steerY = 0;

    // Walk & Board state
    this.walkTarget = null;
    this.boardingAfterWalk = false;
    this.boardStartGirl = new THREE.Vector3();

    // Ride flight/swim state
    this.rideYaw = 0;
    this.ridePitch = 0;
    this.rideSpeed = 0;
    this.bestGoalDist = 9999;
    this.noProgressT = 0;
    this.guideAlpha = 0;
    this._splashCD = 0;
    this._prevAir = false;

    // Float & re-board state
    this.floatVelY = -1.7;
    this.callingWhale = false;
    this.callT = 0;
    this.callStartWhale = new THREE.Vector3();

    // Arrival state
    this.arriveGirlStart = new THREE.Vector3();
    this.arriveWhaleStart = new THREE.Vector3();

    this.ui = new WordlessUI((mode) => {
      if (mode === 'dismount') this.triggerDismount();
      else if (mode === 'call') this.triggerCallOrBoard();
    });

    this._pushVec = new THREE.Vector2();

    const inp = game.input;
    inp.onTap = (p) => this._tap(p);
    inp.onDown = (p) => this._down(p);
    inp.onMove = (p) => this._move(p);
    inp.onUp = (p) => this._up(p);

    window.__qa = {
      getState: () => ({
        ready: Boolean(window.__ready),
        moment: window.__moment,
        state: this.state,
        boarded: this.state === 'ride',
        girl: { x: this.girl.pos.x, y: this.girl.pos.y, z: this.girl.pos.z },
        vehicle: { x: this.whale.pos.x, y: this.whale.pos.y, z: this.whale.pos.z },
        goal: {
          x: LIGHTHOUSE_POS.x,
          y: getGroundY(LIGHTHOUSE_POS.x, LIGHTHOUSE_POS.z),
          z: LIGHTHOUSE_POS.z,
          name: 'lighthouse',
        },
        yaw: this.whale.yaw,
        speed: this.whale.speed,
        alt: this.state === 'ride' ? this.whale.pos.y : this.girl.pos.y,
        idleSeconds: this.noProgressT,
      }),
    };
  }

  _setMoment(m) {
    if (window.__moment !== m) window.__moment = m;
  }

  go(state) {
    this.state = state;
    this.t = 0;
    this.phaseT = 0;
    this.walkTarget = null;
    this.boardingAfterWalk = false;
    this.callingWhale = false;

    if (state === 'garden') {
      this._setMoment('garden');
      this.girl.pos.set(GIRL_START_POS.x, getWalkSurfaceY(GIRL_START_POS.x, GIRL_START_POS.z), GIRL_START_POS.z);
      this.girl.group.rotation.set(0, 0.08, 0);
      this.whale.pos.set(WHALE_START_POS.x, SEA_LEVEL + 0.05, WHALE_START_POS.z);
      this.whale.yaw = 0.08;
      this.whale.pitch = 0;
      this.whale.roll = 0;
      this.whale.group.rotation.set(0, this.whale.yaw, 0);
      this.ui.setMode(null);
      this.rig.snap(this._shotGarden());
    } else if (state === 'board') {
      this._setMoment('board');
      this.boardStartGirl.copy(this.girl.pos);
      this.ui.setMode(null);
    } else if (state === 'ride') {
      this._setMoment('reef');
      this.rideYaw = this.whale.yaw;
      this.ridePitch = 0;
      this.rideSpeed = 10.5;
      this.bestGoalDist = this._goalDist();
      this.noProgressT = 0;
      this.ui.setMode('dismount');
    } else if (state === 'walk') {
      this.ui.setMode('call');
    } else if (state === 'float') {
      this._setMoment('float');
      this.ui.setMode('call');
    } else if (state === 'arrive') {
      this._setMoment('lighthouse');
      if (this.whale.pos.distanceTo(COVE_POS) > 35) {
        this.whale.pos.set(5.5, 0.1, 278);
        this.girl.pos.set(6.5, 1.1, 279);
      }
      this.arriveGirlStart.copy(this.girl.pos);
      this.arriveWhaleStart.copy(this.whale.pos);
      this.ui.setMode(null);
      this.rig.snap(this._shotArrive());
    }
  }

  _goalDist() {
    const p = this.state === 'ride' ? this.whale.pos : this.girl.pos;
    return Math.hypot(p.x - COVE_POS.x, p.z - COVE_POS.z);
  }

  triggerBoard(quick = false) {
    if (this.state === 'garden' || this.state === 'walk') {
      this._reboardQuick = quick;
      this.go('board');
      this.g.audio.whaleTone(1.0, 0.25);
    }
  }

  triggerDismount() {
    if (this.state !== 'ride') return;
    const saddle = this.whale.saddleWorld();
    const gy = getWalkSurfaceY(saddle.x, saddle.z);
    this.girl.pos.copy(saddle);
    this.whale.speed = 0;

    if (saddle.y > Math.max(SEA_LEVEL, gy) + 2.4) {
      this.floatVelY = -1.7;
      this.go('float');
      this.g.audio.chime(587.33);
    } else {
      const landY = Math.max(SEA_LEVEL + 0.04, gy);
      this.girl.pos.y = landY;
      this.go('walk');
      this._updateWalkMoment();
      this.g.audio.splash(0.35);
    }
  }

  _findWaterSpotNear(origin) {
    // Search outward for a shallow-water spot so the whale stays afloat beside sandbars/shores
    const toCove = Math.atan2(COVE_POS.x - origin.x, COVE_POS.z - origin.z);
    for (const r of [4.2, 6.5, 9.2, 12.5, 16.0, 20.0, 24.0]) {
      for (let k = 0; k < 8; k++) {
        const ang = toCove + (k * Math.PI) / 4;
        const sx = clamp(origin.x + Math.sin(ang) * r, -120, 120);
        const sz = clamp(origin.z + Math.cos(ang) * r, 21, 322);
        if (getGroundY(sx, sz) < -0.42) {
          return V(sx, SEA_LEVEL + 0.08, sz);
        }
      }
    }
    return V(clamp(origin.x, -120, 120), Math.max(SEA_LEVEL + 0.08, getGroundY(origin.x, origin.z) + 0.95), clamp(origin.z + 5.0, 22, 320));
  }

  triggerCallOrBoard() {
    if (this.callingWhale) return;
    if (this.state === 'float') {
      // Mid-air re-board: whale arcs gracefully up to catch the girl
      this.callingWhale = true;
      this.callT = 0;
      this.callStartWhale.copy(this.whale.pos);
      this.g.audio.whaleTone(1.15, 0.28);
      return;
    }
    if (this.state === 'walk') {
      const d = this.girl.pos.distanceTo(this.whale.pos);
      if (d < 9.5 && getGroundY(this.whale.pos.x, this.whale.pos.z) < 0.05) {
        this.triggerBoard(true);
      } else {
        this.callingWhale = true;
        this.callT = 0;
        this.callStartWhale.copy(this.whale.pos);
        this.callTargetWhale = this._findWaterSpotNear(this.girl.pos);
        this.g.audio.whaleTone(1.05, 0.28);
      }
    }
  }

  _updateWalkMoment() {
    const onMainSand = Math.hypot(this.girl.pos.x - SANDBAR_MAIN_POS.x, this.girl.pos.z - SANDBAR_MAIN_POS.z) < 25;
    const onWestSand = Math.hypot(this.girl.pos.x - SANDBAR_WEST_POS.x, this.girl.pos.z - SANDBAR_WEST_POS.z) < 21;
    if (onMainSand || onWestSand) {
      this._setMoment('sandbar');
    } else if (this.girl.pos.z > 275) {
      this._setMoment('cove');
    } else {
      this._setMoment('reef');
    }
  }

  update(dt) {
    this.t += dt;
    this.phaseT += dt;
    const time = this.g.time;

    if (this.ptr && (this.state === 'ride' || this.state === 'float')) {
      this._steerFromPointer(this.ptr);
    }

    this.steerX = damp(this.steerX, this.targetSteerX, 7.5, dt);
    this.steerY = damp(this.steerY, this.targetSteerY, 7.5, dt);

    if (this.state === 'garden') {
      this._updateGarden(dt, time);
      this.rig.update(dt, this._shotGarden(), 1.9);
    } else if (this.state === 'board') {
      this._updateBoard(dt, time);
      this.rig.update(dt, this._shotBoard(), 2.1);
    } else if (this.state === 'ride') {
      this._updateRide(dt, time);
      this.rig.update(dt, this._shotRide(), 2.2);
    } else if (this.state === 'float') {
      this._updateFloat(dt, time);
      this.rig.update(dt, this._shotFloat(), 2.4);
    } else if (this.state === 'walk') {
      this._updateWalk(dt, time);
      this.rig.update(dt, this._shotWalk(), 2.0);
    } else if (this.state === 'arrive') {
      this._updateArrive(dt, time);
      this.rig.update(dt, this._shotArrive(), 1.5);
    }

    shared.uAlt.value = clamp((this.state === 'ride' ? this.whale.pos.y : this.girl.pos.y) / 14, 0, 1);
  }

  _stepGirlWalk(dt, maxSpeed = 3.8) {
    let spd = 0;
    if (this.walkTarget) {
      const dx = this.walkTarget.x - this.girl.pos.x;
      const dz = this.walkTarget.z - this.girl.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.28) {
        spd = Math.min(maxSpeed, dist * 3.2);
        this.girl.pos.x += (dx / dist) * spd * dt;
        this.girl.pos.z += (dz / dist) * spd * dt;
        const targetYaw = Math.atan2(dx, dz);
        this.girl.group.rotation.y = wrapAngle(this.girl.group.rotation.y + wrapAngle(targetYaw - this.girl.group.rotation.y) * Math.min(1, dt * 8));
      } else {
        this.walkTarget = null;
      }
    }

    this.girl.pos.x = clamp(this.girl.pos.x, -120, 120);
    this.girl.pos.z = clamp(this.girl.pos.z, -16, 326);
    this.colliders.resolveGirlWalk(this.girl.pos, 0.36);

    const surfY = getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z);
    // Buoyant light-ripple support over deeper water so girl never sinks
    const targetY = Math.max(SEA_LEVEL + 0.04, surfY);
    this.girl.pos.y = Math.max(targetY - 0.02, damp(this.girl.pos.y, targetY, 14, dt));

    return spd;
  }

  _updateGarden(dt, time) {
    this._setMoment('garden');
    if (this.boardingAfterWalk && this.girl.pos.z < -0.2 && Math.abs(this.girl.pos.x + 0.8) > 1.8) {
      // Route out through the garden gate before heading down to the bay
      this.walkTarget = V(-0.8, getWalkSurfaceY(-0.8, 0.4), 0.4);
    } else if (this.boardingAfterWalk) {
      this.walkTarget = V(this.whale.pos.x, SEA_LEVEL, this.whale.pos.z - 4.2);
    }

    const walkSpd = this.boardingAfterWalk ? 5.6 : 4.1;
    const spd = this._stepGirlWalk(dt, walkSpd);
    this.girl.updatePose({ mode: 'walk', speed: spd, time, dt });

    // Whale gently bobs in shallow emerald bay waiting
    this.whale.pos.x = WHALE_START_POS.x + Math.sin(time * 0.45) * 0.65;
    this.whale.pos.y = SEA_LEVEL + 0.05 + Math.sin(time * 1.2) * 0.08;
    this.whale.pos.z = WHALE_START_POS.z + Math.cos(time * 0.35) * 0.4;
    this.whale.speed = 0.8;
    this.whale.update(dt, time, { showCue: true });

    if (this.boardingAfterWalk && this.girl.pos.distanceTo(this.whale.pos) < 7.2) {
      this.boardingAfterWalk = false;
      this.triggerBoard();
    }
  }

  _updateBoard(dt, time) {
    this._setMoment('board');
    const dur = this._reboardQuick ? 1.25 : 1.65;
    const u = smoothstep(0, dur, this.phaseT);
    this.colliders.resolveWhale(this.whale.pos, this.whale.yaw, 0, getGroundY);
    const saddle = this.whale.saddleWorld();
    this.girl.pos.lerpVectors(this.boardStartGirl, saddle, u);
    this.girl.pos.y += Math.sin(u * Math.PI) * 1.15;
    this.girl.group.rotation.y = wrapAngle(this.whale.yaw);
    this.girl.updatePose({ mode: u > 0.72 ? 'ride' : 'walk', speed: 2.2, time, dt });
    this.whale.speed = 1.5;
    this.whale.update(dt, time, { showCue: false });

    if (this.phaseT >= dur) {
      this._reboardQuick = false;
      this.go('ride');
    }
  }

  _updateRide(dt, time) {
    // 1. Horizontal steering (left/right drag or hold)
    const turnRate = 1.02;
    this.rideYaw = wrapAngle(this.rideYaw - this.steerX * turnRate * dt);

    // 2. Vertical steering: UP climbs into sunset sky (leap), DOWN descends to surface, neutral glides cleanly at current altitude
    const wantAlt = Math.abs(this.steerY) > 0.10;
    if (this.steerY > 0.10) {
      const climb = (this.steerY - 0.10) / 0.90;
      this.ridePitch = damp(this.ridePitch, 0.62 * climb, 5.8, dt);
    } else if (this.steerY < -0.10) {
      const dive = (-this.steerY - 0.10) / 0.90;
      this.ridePitch = damp(this.ridePitch, -0.58 * dive, 5.8, dt);
    } else {
      // Hold altitude smoothly while circling horizontally
      this.ridePitch = damp(this.ridePitch, 0, 5.5, dt);
    }

    // 3. Gentle 20s assistance toward Lighthouse Cove if no progress & no active steering
    const dGoal = this._goalDist();
    if (dGoal < this.bestGoalDist - 0.45) {
      this.bestGoalDist = dGoal;
      this.noProgressT = 0;
    } else {
      this.noProgressT += dt;
    }

    const assistActive = this.noProgressT > 16.0;
    this.guideAlpha = damp(this.guideAlpha, assistActive ? 1.0 : 0.0, 2.2, dt);

    if (assistActive && Math.abs(this.steerX) < 0.12) {
      const aimYaw = Math.atan2(COVE_POS.x - this.whale.pos.x, COVE_POS.z - this.whale.pos.z);
      const diff = wrapAngle(aimYaw - this.rideYaw);
      this.rideYaw = wrapAngle(this.rideYaw + clamp(diff, -0.75, 0.75) * dt * 1.25);
    }

    // 4. Forward propulsion
    const baseSpeed = this.steerY < -0.15 ? 9.8 : this.steerY > 0.15 ? 15.6 : 12.8;
    this.rideSpeed = damp(this.rideSpeed, baseSpeed, 4.4, dt);

    const vx = Math.sin(this.rideYaw) * Math.cos(this.ridePitch) * this.rideSpeed;
    const vy = Math.sin(this.ridePitch) * this.rideSpeed * 0.95;
    const vz = Math.cos(this.rideYaw) * Math.cos(this.ridePitch) * this.rideSpeed;

    this.whale.pos.x += vx * dt;
    this.whale.pos.y += vy * dt;
    this.whale.pos.z += vz * dt;

    // Altitude ceiling & multi-probe collision resolution (no clipping piers, corals, rocks, or sandbars)
    this.whale.pos.y = Math.min(this.whale.pos.y, 15.5);
    this._pushVec.set(0, 0);
    this.colliders.resolveWhale(this.whale.pos, this.rideYaw, this.ridePitch, getGroundY, this._pushVec);

    // Gentle wall-slide yaw deflection if obstacle pushes whale sideways during assist or swim
    if (this._pushVec.lengthSq() > 1e-4) {
      const pushLen = this._pushVec.length();
      const nx = this._pushVec.x / pushLen;
      const nz = this._pushVec.z / pushLen;
      const fx = Math.sin(this.rideYaw);
      const fz = Math.cos(this.rideYaw);
      const dot = fx * nx + fz * nz;
      if (dot < -0.15) {
        const cross = fx * nz - fz * nx;
        const turnSign = cross >= 0 ? -1 : 1;
        this.rideYaw = wrapAngle(this.rideYaw + turnSign * dt * 1.1);
      }
    }

    if (!wantAlt && this.whale.pos.y < 0.35 && getGroundY(this.whale.pos.x, this.whale.pos.z) < -0.85) {
      this.whale.pos.y = damp(this.whale.pos.y, SEA_LEVEL + 0.05, 6.0, dt);
    }

    // Update whale orientation & pose
    this.whale.yaw = this.rideYaw;
    this.whale.pitch = this.ridePitch;
    this.whale.roll = damp(this.whale.roll, -this.steerX * 0.32, 6.0, dt);
    this.whale.speed = this.rideSpeed;
    this.whale.group.rotation.order = 'YXZ';
    this.whale.group.rotation.set(-this.whale.pitch, this.whale.yaw, this.whale.roll);

    const leapGlow = smoothstep(1.2, 6.0, this.whale.pos.y);
    this.whale.update(dt, time, { showCue: false, leapGlow });

    // Girl rides cleanly on whale's saddle
    const saddle = this.whale.saddleWorld();
    this.girl.pos.copy(saddle);
    this.girl.group.rotation.order = 'YXZ';
    this.girl.group.rotation.set(0, this.whale.yaw, 0);
    this.girl.updatePose({ mode: 'ride', speed: this.rideSpeed, time, dt, pitch: this.whale.pitch, roll: this.whale.roll });

    // Water splash & bioluminescent wake FX
    const inAir = this.whale.pos.y > 0.75;
    if (inAir !== this._prevAir) {
      this.g.fx.emit(this.whale.pos, { count: 22, spread: 2.4, speed: 4.5, up: 4.2, color: '#e8fbf7', life: 0.95 });
      this.g.audio.splash(0.75);
      if (inAir) this.g.audio.whaleTone(1.18, 0.22);
      this._prevAir = inAir;
    }
    this._splashCD -= dt;
    if (this._splashCD <= 0) {
      this._splashCD = inAir ? 0.08 : 0.12;
      this.g.fx.emit(this.whale.pos, {
        count: inAir ? 3 : 4,
        spread: 1.3,
        speed: 1.4,
        up: inAir ? 0.6 : 1.1,
        color: inAir ? '#ffda96' : '#c6f4ec',
        life: 0.9,
      });
    }

    // Moment updates
    if (this.whale.pos.y > 2.0) {
      this._setMoment('leap');
    } else if (this.whale.pos.z > 265) {
      this._setMoment('cove');
    } else if (Math.hypot(this.whale.pos.x - SANDBAR_MAIN_POS.x, this.whale.pos.z - SANDBAR_MAIN_POS.z) < 26) {
      this._setMoment('sandbar');
    } else {
      this._setMoment('reef');
    }

    // Check arrival at Star-Sand Lighthouse Cove
    if (dGoal < 23.0 && this.whale.pos.y < 3.5) {
      this.go('arrive');
      this.g.audio.chime(659.25);
      this.g.audio.whaleTone(0.95, 0.28);
    }
  }

  _updateFloat(dt, time) {
    this._setMoment('float');
    if (this.callingWhale) {
      this.callT += dt;
      const u = smoothstep(0, 1.05, this.callT);
      const minSafeY = Math.max(SEA_LEVEL + 0.08, getGroundY(this.girl.pos.x, this.girl.pos.z) + 1.05);
      const targetWhale = V(this.girl.pos.x, Math.max(minSafeY, this.girl.pos.y - 1.0), this.girl.pos.z);
      this.whale.pos.lerpVectors(this.callStartWhale, targetWhale, u);
      const dx = targetWhale.x - this.callStartWhale.x;
      const dz = targetWhale.z - this.callStartWhale.z;
      if (Math.hypot(dx, dz) > 0.5) {
        this.whale.yaw = Math.atan2(dx, dz);
      }
      this.colliders.resolveWhale(this.whale.pos, this.whale.yaw, 0, getGroundY);
      this.whale.group.rotation.set(0, this.whale.yaw, 0);
      this.whale.update(dt, time, { showCue: true, leapGlow: 0.6 });
      this.girl.updatePose({ mode: 'float', time, dt });
      if (u >= 1) {
        this.callingWhale = false;
        this.go('ride');
      }
      return;
    }

    // Unrealistically slow luminous descent, centered in camera frame
    this.girl.pos.x += this.steerX * 2.2 * dt;
    this.girl.pos.z += this.steerY * 2.2 * dt;
    this.girl.pos.y += this.floatVelY * dt;
    this.colliders.resolveGirlWalk(this.girl.pos, 0.36);

    this.girl.updatePose({ mode: 'float', time, dt });

    // Whale circles gently ahead & below the girl so it stays clearly visible and tappable
    const ang = time * 0.55;
    const wx = clamp(this.girl.pos.x + Math.cos(ang) * 5.2, -120, 120);
    const wz = clamp(this.girl.pos.z + 6.5 + Math.sin(ang) * 2.2, 22, 320);
    const wy = Math.max(SEA_LEVEL + 0.08, getGroundY(wx, wz) + 0.95);
    this.whale.pos.set(damp(this.whale.pos.x, wx, 2.6, dt), damp(this.whale.pos.y, wy, 3.0, dt), damp(this.whale.pos.z, wz, 2.6, dt));
    this.whale.yaw = Math.atan2(-Math.sin(ang) * 5.2, Math.cos(ang) * 2.2);
    this.colliders.resolveWhale(this.whale.pos, this.whale.yaw, 0, getGroundY);
    this.whale.group.rotation.set(0, this.whale.yaw, 0);
    this.whale.update(dt, time, { showCue: true });

    const landY = Math.max(SEA_LEVEL + 0.04, getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z));
    if (this.girl.pos.y <= landY + 0.05) {
      this.girl.pos.y = landY;
      this.go('walk');
      this._updateWalkMoment();
      this.g.audio.chime(523.25);
    }
  }

  _updateWalk(dt, time) {
    if (this.callingWhale) {
      this.callT += dt;
      const u = smoothstep(0, 1.15, this.callT);
      const spot = this.callTargetWhale || this._findWaterSpotNear(this.girl.pos);
      this.whale.pos.lerpVectors(this.callStartWhale, spot, u);
      const dx = spot.x - this.callStartWhale.x;
      const dz = spot.z - this.callStartWhale.z;
      if (Math.hypot(dx, dz) > 0.5) {
        this.whale.yaw = Math.atan2(dx, dz);
      }
      this.colliders.resolveWhale(this.whale.pos, this.whale.yaw, 0, getGroundY);
      this.whale.group.rotation.set(0, this.whale.yaw, 0);
      this.whale.update(dt, time, { showCue: true });
      this.girl.updatePose({ mode: 'walk', speed: 0, time, dt });
      if (u >= 1) {
        this.callingWhale = false;
        this.triggerBoard(true);
      }
      return;
    }

    const spd = this._stepGirlWalk(dt, 4.0);
    this.girl.updatePose({ mode: 'walk', speed: spd, time, dt });
    this.whale.pos.y = Math.max(SEA_LEVEL + 0.05, getGroundY(this.whale.pos.x, this.whale.pos.z) + 0.95) + Math.sin(time * 1.4) * 0.06;
    this.colliders.resolveWhale(this.whale.pos, this.whale.yaw, 0, getGroundY);
    this.whale.speed = 0.6;
    this.whale.update(dt, time, { showCue: true });
    this._updateWalkMoment();

    const dGoal = this._goalDist();
    if (dGoal < this.bestGoalDist - 0.45) {
      this.bestGoalDist = dGoal;
      this.noProgressT = 0;
    } else {
      this.noProgressT += dt;
    }
    this.guideAlpha = damp(this.guideAlpha, this.noProgressT > 16 ? 1.0 : 0.0, 2.0, dt);
    if (this.noProgressT > 24.0 && !this.walkTarget) {
      this.triggerCallOrBoard();
    }
  }

  _updateArrive(dt, time) {
    this._setMoment('lighthouse');
    const u = smoothstep(0, 2.2, this.phaseT);

    // Whale comes to gentle rest in the crystal-clear cove shallows (never buried in sand)
    const wx = 8.2;
    const wz = 296.5;
    const whaleRest = V(wx, Math.max(SEA_LEVEL + 0.08, getGroundY(wx, wz) + 0.95), wz);
    this.whale.pos.lerpVectors(this.arriveWhaleStart, whaleRest, u);
    this.whale.yaw = wrapAngle(this.whale.yaw + wrapAngle(0.45 - this.whale.yaw) * Math.min(1, dt * 3));
    this.whale.pitch = damp(this.whale.pitch, 0, 5, dt);
    this.whale.roll = damp(this.whale.roll, 0, 5, dt);
    this.colliders.resolveWhale(this.whale.pos, this.whale.yaw, 0, getGroundY);
    this.whale.group.rotation.set(0, this.whale.yaw, 0);
    this.whale.speed = 0.4;
    this.whale.update(dt, time, { showCue: false, leapGlow: 0.7 });

    // Girl steps gracefully onto the star-sand cove beach clearly beside the whale & lighthouse
    const bx = 13.8;
    const bz = 300.2;
    const beachSpot = V(bx, Math.max(SEA_LEVEL + 0.12, getWalkSurfaceY(bx, bz)), bz);
    this.girl.pos.lerpVectors(this.arriveGirlStart, beachSpot, u);
    this.girl.pos.y += Math.sin(u * Math.PI) * 0.65;
    this.girl.group.rotation.y = wrapAngle(Math.atan2(this.whale.pos.x - this.girl.pos.x, this.whale.pos.z - this.girl.pos.z));
    this.girl.updatePose({ mode: u > 0.8 ? 'arrive' : 'walk', speed: 1.5, time, dt });
  }

  // ---- Camera Shot Builders (centralized framing, unclipped) ----
  _shotGarden() {
    // Frame girl cleanly ahead of the gate, fukugi alley, postbox, whale, and distant lighthouse
    const tgt = V(this.girl.pos.x * 0.5 + 0.2, this.girl.pos.y + 0.95, this.girl.pos.z + 5.6);
    const dir = V(-0.16, 0.22, -0.96).normalize();
    return fitShot({
      points: [
        this.girl.pos.clone().add(V(0, 1.45, 0)),
        this.girl.pos.clone().add(V(-1.5, 0.0, -0.6)),
        V(this.girl.pos.x, this.girl.pos.y + 0.8, this.girl.pos.z + 4.5),
      ],
      dir,
      fov: 46,
      aspect: this.g.camera.aspect,
      margin: 0.18,
      target: tgt,
      minDist: 7.2,
    });
  }

  _shotBoard() {
    const c = this.whale.pos;
    const dir = V(-0.76, 0.34, -0.55).normalize();
    return fitShot({
      points: [
        c.clone().add(V(-2.2, 0.0, -4.8)),
        c.clone().add(V(2.2, 1.6, 4.8)),
        this.girl.pos.clone().add(V(0, 1.4, 0)),
      ],
      dir,
      fov: 44,
      aspect: this.g.camera.aspect,
      margin: 0.16,
      minDist: 10.5,
    });
  }

  _shotRide() {
    const f = this.whale.forwardDir(_tmp);
    const back = V(-f.x, 0, -f.z).normalize();
    const dir = V(back.x * 0.94 + 0.13, 0.25, back.z * 0.94 - 0.07).normalize();
    const c = this.whale.pos;
    const saddle = this.whale.saddleWorld();
    const pts = [
      c.clone().addScaledVector(f, 4.9),
      c.clone().addScaledVector(f, -4.9),
      c.clone().add(V(2.6, 0.2, 0)),
      c.clone().add(V(-2.6, 0.2, 0)),
      saddle.clone().add(V(0, 1.45, 0)),
      c.clone().add(V(0, -0.9, 0)),
    ];
    const shot = fitShot({
      points: pts,
      dir,
      fov: 46,
      aspect: this.g.camera.aspect,
      margin: 0.18,
      target: c.clone().add(V(0, 0.7, 0)),
      minDist: 12.2,
    });
    shot.anchorId = 'whale';
    shot.anchor = c.clone();
    return shot;
  }

  _shotFloat() {
    // Keep slowly descending girl & glowing canopy dead center!
    const g = this.girl.pos;
    const dir = V(-0.35, 0.18, -0.92).normalize();
    return fitShot({
      points: [
        g.clone().add(V(-1.0, 0.0, 0)),
        g.clone().add(V(1.0, 1.95, 0)),
      ],
      dir,
      fov: 44,
      aspect: this.g.camera.aspect,
      margin: 0.22,
      target: g.clone().add(V(0, 0.95, 0)),
      minDist: 6.4,
    });
  }

  _shotWalk() {
    const g = this.girl.pos;
    const w = this.whale.pos;
    const nearWhale = g.distanceTo(w) < 16;
    const dir = V(-0.32, 0.28, -0.9).normalize();
    const pts = [g.clone(), g.clone().add(V(0, 1.4, 0))];
    if (nearWhale) {
      pts.push(w.clone().add(V(0, 0.5, 2.5)), w.clone().add(V(0, 0.5, -2.5)));
    }
    return fitShot({
      points: pts,
      dir,
      fov: 45,
      aspect: this.g.camera.aspect,
      margin: 0.2,
      target: nearWhale ? g.clone().lerp(w, 0.35).add(V(0, 0.7, 0)) : g.clone().add(V(0, 0.85, 0)),
      minDist: nearWhale ? 9.5 : 7.0,
    });
  }

  _shotArrive() {
    // Frame girl and whale closer and larger in foreground while keeping the ENTIRE lighthouse unclipped
    const lhBase = V(LIGHTHOUSE_POS.x, getGroundY(LIGHTHOUSE_POS.x, LIGHTHOUSE_POS.z), LIGHTHOUSE_POS.z);
    const lhTop = lhBase.clone().add(V(0, 16.5, 0));
    const wf = this.whale.forwardDir(_tmp);
    const wRight = V(wf.z, 0, -wf.x).normalize();
    const pts = [
      this.girl.pos.clone().add(V(0, 1.5, 0)),
      this.girl.pos.clone().add(V(0, -0.1, 0)),
      this.whale.pos.clone().addScaledVector(wf, 4.9),
      this.whale.pos.clone().addScaledVector(wf, -4.9).add(V(0, -0.3, 0)),
      this.whale.pos.clone().addScaledVector(wRight, 2.5).add(V(0, 0.8, 0)),
      this.whale.pos.clone().addScaledVector(wRight, -2.5).add(V(0, 0.8, 0)),
      lhBase.clone().add(V(-2.4, 0, 0)),
      lhBase.clone().add(V(2.4, 0, 0)),
      lhTop.clone().add(V(-1.6, 0, 0)),
      lhTop.clone().add(V(1.6, 0, 0)),
    ];
    const midFG = this.girl.pos.clone().lerp(this.whale.pos, 0.45);
    const tgt = midFG.clone().lerp(lhBase.clone().add(V(0, 6.0, 0)), 0.33);
    const dir = V(-0.56, 0.10, -0.82).normalize();
    return fitShot({
      points: pts,
      dir,
      fov: 47,
      aspect: this.g.camera.aspect,
      margin: 0.09,
      target: tgt,
      minDist: 10.5,
    });
  }

  // ---- Input Handlers ----
  _ndc(p) {
    return new THREE.Vector2((p.x / Math.max(1, this.g.vw)) * 2 - 1, -((p.y / Math.max(1, this.g.vh)) * 2 - 1));
  }

  _screenPos(worldPos) {
    const v = worldPos.clone().project(this.g.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.g.vw,
      y: (-v.y * 0.5 + 0.5) * this.g.vh,
      z: v.z,
    };
  }

  _hitGround(p) {
    this.ray.setFromCamera(this._ndc(p), this.g.camera);
    const origin = this.ray.ray.origin;
    const dir = this.ray.ray.direction;
    if (Math.abs(dir.y) < 1e-4) return null;

    // March along ray to intersect exact walk surface height
    let best = null;
    for (let t = 1; t < 160; t += 0.6) {
      const rx = origin.x + dir.x * t;
      const ry = origin.y + dir.y * t;
      const rz = origin.z + dir.z * t;
      const sy = Math.max(SEA_LEVEL, getWalkSurfaceY(rx, rz));
      if (ry <= sy) {
        best = new THREE.Vector3(rx, sy, rz);
        break;
      }
    }
    return best;
  }

  _tappedWhale(p) {
    const minDim = Math.min(this.g.vw, this.g.vh);
    const rad = minDim * 0.28;
    const wf = this.whale.forwardDir(_tmp);
    const wr = V(wf.z, 0, -wf.x).normalize();
    const probes = [
      this.whale.pos,
      this.whale.saddleWorld(),
      this.whale.pos.clone().addScaledVector(wf, 3.5),
      this.whale.pos.clone().addScaledVector(wf, -3.6),
      this.whale.pos.clone().addScaledVector(wr, 2.0),
      this.whale.pos.clone().addScaledVector(wr, -2.0),
    ];
    for (let i = 0; i < probes.length; i++) {
      const sc = this._screenPos(probes[i]);
      if (sc.z > -1 && sc.z < 1 && Math.hypot(p.x - sc.x, p.y - sc.y) < rad) return true;
    }
    this.ray.setFromCamera(this._ndc(p), this.g.camera);
    const hits = this.ray.intersectObject(this.whale.group, true);
    return hits.length > 0;
  }

  _tap(p) {
    this.g.audio.unlock();
    const minDim = Math.min(this.g.vw, this.g.vh);

    if (this.state === 'garden') {
      // ONLY board when whale itself is intentionally tapped!
      if (this._tappedWhale(p)) {
        if (this.girl.pos.distanceTo(this.whale.pos) < 7.2) {
          this.triggerBoard();
        } else {
          this.walkTarget = V(this.whale.pos.x, SEA_LEVEL, this.whale.pos.z - 4.2);
          this.boardingAfterWalk = true;
        }
        return;
      }
      // Otherwise walk to tapped ground (never advance state on unrelated corner/sky taps)
      this.boardingAfterWalk = false;
      const hit = this._hitGround(p);
      if (hit && hit.z <= 22.5) {
        this.walkTarget = hit;
      }
      return;
    }

    if (this.state === 'ride') {
      const gsc = this._screenPos(this.girl.pos.clone().add(V(0, 0.7, 0)));
      const gTop = this._screenPos(this.girl.pos.clone().add(V(0, 1.3, 0)));
      const ssc = this._screenPos(this.whale.saddleWorld());
      if (
        (gsc.z > -1 && gsc.z < 1 && Math.hypot(p.x - gsc.x, p.y - gsc.y) < minDim * 0.28) ||
        (gTop.z > -1 && gTop.z < 1 && Math.hypot(p.x - gTop.x, p.y - gTop.y) < minDim * 0.26) ||
        (ssc.z > -1 && ssc.z < 1 && Math.hypot(p.x - ssc.x, p.y - ssc.y) < minDim * 0.25)
      ) {
        this.triggerDismount();
        return;
      }
      this.ray.setFromCamera(this._ndc(p), this.g.camera);
      if (this.ray.intersectObject(this.girl.group, true).length > 0) {
        this.triggerDismount();
      }
      return;
    }

    if (this.state === 'float') {
      if (this._tappedWhale(p)) {
        this.triggerCallOrBoard();
      }
      return;
    }

    if (this.state === 'walk') {
      if (this._tappedWhale(p)) {
        this.triggerCallOrBoard();
        return;
      }
      const hit = this._hitGround(p);
      if (hit) {
        this.walkTarget = hit;
      }
    }
  }

  _down(p) {
    this.g.audio.unlock();
    this.ptr = p;
    if (this.state === 'ride' || this.state === 'float') {
      this._steerFromPointer(p);
    }
  }

  _move(p) {
    if (this.ptr && this.ptr.id === p.id && (this.state === 'ride' || this.state === 'float')) {
      this._steerFromPointer(p);
    }
  }

  _up(p) {
    if (this.ptr && this.ptr.id === p.id) {
      this.ptr = null;
      this.targetSteerX = 0;
      this.targetSteerY = 0;
    }
  }

  _steerFromPointer(p) {
    const dx = p.x - p.sx;
    const dy = p.y - p.sy;
    const dragDist = Math.hypot(dx, dy);
    const scale = Math.min(this.g.vw, this.g.vh) * 0.15;
    if (dragDist > 20) {
      this.targetSteerX = clamp(dx / scale, -1, 1);
      this.targetSteerY = clamp(-dy / scale, -1, 1);
    } else {
      const nx = (p.x / Math.max(1, this.g.vw)) * 2 - 1;
      const ny = -((p.y / Math.max(1, this.g.vh)) * 2 - 1);
      const sx = Math.abs(nx) < 0.1 ? 0 : nx * 1.55;
      const sy = Math.abs(ny) < 0.1 ? 0 : ny * 1.6;
      this.targetSteerX = clamp(sx, -1, 1);
      this.targetSteerY = clamp(sy, -1, 1);
    }
  }
}
