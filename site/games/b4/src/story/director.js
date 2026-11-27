import * as THREE from '../../lib/three.module.js';
import {
  CANYON_ENTRY_Z,
  CANYON_EXIT_Z,
  LODGE_PIER_POS,
  LODGE_POS,
  PLANE_MOOR_POS,
  PLANE_MOOR_YAW,
  WATER_Y,
} from '../core/env.js';
import { clamp, damp, smoothstep, wrapAngle } from '../core/math.js';
import { channelCenterX, channelHalfWidth, getGroundGrad, getGroundY, getWalkSurfaceY } from '../world/terrain.js';
import { CameraRig, fitShot } from './camera.js';
import { WordlessUI } from '../core/ui.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Director {
  constructor(game) {
    this.g = game;
    this.girl = game.girl;
    this.plane = game.vehicle;
    this.collision = game.collision;
    this.rig = new CameraRig(game.camera);
    this.ray = new THREE.Raycaster();

    // Valid QA states: "garden" | "board" | "ride" | "walk" | "float" | "arrive"
    this.state = 'garden';
    this.phase = 'explore';
    this.t = 0;
    this.phaseT = 0;

    // 1-finger steering
    this.targetSteerX = 0;
    this.targetSteerY = 0;
    this.steerX = 0;
    this.steerY = 0;

    // Flight & watercraft physics
    this.flightYaw = PLANE_MOOR_YAW;
    this.flightPitch = 0;
    this.flightSpeed = 0;
    this.onWater = true;
    this.sprayIntensity = 0;

    // Walking & boarding
    this.walkTarget = null;
    this.boardStartGirl = new THREE.Vector3();
    this.boardStepTarget = new THREE.Vector3(1.6, 0.65, 17.0);
    this.boardMidAir = false;
    this.boardTimer = 0;
    this.callPlaneToShore = false;
    this.callPlaneTarget = new THREE.Vector3();
    this._lastGirlPos = new THREE.Vector3();
    this._lastPlanePos = new THREE.Vector3();

    // Aerial parasol descent
    this.floatVel = new THREE.Vector3();

    // Gentle 20s assistance toward Glacier Lake Lodge
    this.idleSeconds = 0;
    this.assistActive = false;
    this._holdActiveTime = 0;
    this.bestGoalDist = 9999;
    this.guideAlpha = 0;

    // UI button
    this.ui = new WordlessUI((mode) => {
      this.markActivity(true);
      if (mode === 'dismount') this.triggerDismount();
      else if (mode === 'board') this.triggerCallOrBoard();
    });

    this.g.input.onInteract = () => {
      this.g.audio.unlock();
      if (this.state !== 'ride') {
        this.markActivity(false);
      }
    };
    this.g.input.onTap = (ndcX, ndcY) => this._handleTap(ndcX, ndcY);

    this._installQA();
  }

  _installQA() {
    window.__qa = {
      getState: () => {
        const boarded = this.state === 'ride';
        const yaw = boarded ? this.flightYaw : this.girl.yaw;
        const speed = boarded ? this.flightSpeed : this.walkTarget ? 3.2 : 0;
        const alt = boarded ? this.plane.pos.y : this.girl.pos.y;
        return {
          ready: Boolean(window.__ready),
          moment: window.__moment || 'garden',
          state: this.state,
          boarded,
          girl: { x: this.girl.pos.x, y: this.girl.pos.y, z: this.girl.pos.z },
          vehicle: { x: this.plane.pos.x, y: this.plane.pos.y, z: this.plane.pos.z },
          goal: { x: LODGE_POS.x, y: LODGE_POS.y, z: LODGE_POS.z, name: 'glacier_lodge' },
          yaw,
          speed,
          alt,
          idleSeconds: this.idleSeconds,
        };
      },
    };
  }

  markActivity(clearAssist = false) {
    if (clearAssist) {
      this.idleSeconds = 0;
      this.assistActive = false;
    }
  }

  _screenDistPx(worldPos, ndcX, ndcY) {
    const p = worldPos.clone().project(this.g.camera);
    if (p.z > 1) return Infinity;
    const rect = this.g.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    return Math.hypot((ndcX - p.x) * 0.5 * w, (ndcY - p.y) * 0.5 * h);
  }

  go(nextState) {
    this.state = nextState;
    this.phaseT = 0;
    this.assistActive = false;

    if (nextState === 'garden') {
      window.__moment = 'garden';
      this.girl.pos.set(-1.2, getWalkSurfaceY(-1.2, -2.2), -2.2);
      this.girl.yaw = 0.28;
      this.girl.animate('idle', 0);
      this.plane.pos.copy(PLANE_MOOR_POS);
      this.plane.yaw = PLANE_MOOR_YAW;
      this.plane.pitch = 0;
      this.plane.roll = 0;
      this.flightYaw = PLANE_MOOR_YAW;
      this.flightPitch = 0;
      this.flightSpeed = 0;
      this.walkTarget = null;
      this.rig.roll = 0;
      this.rig.snap(this._computeShot());
      this.ui.setMode('none');
    } else if (nextState === 'board') {
      window.__moment = 'board';
      this.walkTarget = null;
      this.boardStartGirl.copy(this.girl.pos);
      if (this.girl.pos.distanceTo(V(1.6, 0.65, 17.0)) < 25) {
        this.boardStepTarget.set(1.6, getWalkSurfaceY(1.6, 17.0), 17.0);
      } else {
        const dx = this.girl.pos.x - this.plane.pos.x;
        const dz = this.girl.pos.z - this.plane.pos.z;
        const d = Math.max(0.1, Math.hypot(dx, dz));
        const sx = this.plane.pos.x + (dx / d) * Math.min(d * 0.5, 2.2);
        const sz = this.plane.pos.z + (dz / d) * Math.min(d * 0.5, 2.2);
        this.boardStepTarget.set(sx, Math.max(WATER_Y + 0.15, getWalkSurfaceY(sx, sz)), sz);
      }
      this.boardTimer = 0;
      this.idleSeconds = 0;
      this.ui.setMode('none');
    } else if (nextState === 'ride') {
      this.flightYaw = this.plane.yaw;
      this.flightPitch = Math.max(0, this.plane.pitch);
      this.flightSpeed = Math.max(11.5, this.flightSpeed);
      this.onWater = this.plane.pos.y <= WATER_Y + 0.35;
      this.bestGoalDist = Math.min(this.bestGoalDist, this.plane.pos.distanceTo(LODGE_PIER_POS));
      this.idleSeconds = 0;
      this._updateRideMoment();
      this.ui.setMode('dismount');
    } else if (nextState === 'float') {
      window.__moment = 'float';
      this.floatVel.set(0, -1.85, 0);
      this.rig.roll = 0;
      this.ui.setMode('board');
    } else if (nextState === 'walk') {
      window.__moment = 'land';
      this.walkTarget = null;
      this.callPlaneToShore = false;
      this.rig.roll = 0;
      this.ui.setMode('board');
    } else if (nextState === 'arrive') {
      window.__moment = 'lodge';
      this.walkTarget = null;
      this.flightSpeed = 0;
      this.rig.roll = 0;
      this.plane.pos.set(-4.6, WATER_Y, 526.8);
      this.plane.yaw = 0.28;
      this.plane.pitch = 0;
      this.plane.roll = 0;
      this.girl.pos.set(-0.9, getWalkSurfaceY(-0.9, 529.0), 529.0);
      this.girl.yaw = 0.72;
      this.g.audio.chime([523.25, 659.25, 783.99, 1046.5]);
      this.ui.setMode('none');
    }
    this.girl.syncTransform();
    this.plane.syncTransform();
    this._lastGirlPos.copy(this.girl.pos);
    this._lastPlanePos.copy(this.plane.pos);
  }

  _handleTap(ndcX, ndcY) {
    this.ray.setFromCamera({ x: ndcX, y: ndcY }, this.g.camera);

    if (this.state === 'garden' || this.state === 'walk') {
      const planeCenter = this.plane.pos.clone().add(V(0, 1.1, 0));
      const nearCenter = Math.abs(ndcX) < 0.84 && Math.abs(ndcY) < 0.84;

      // 1. Intentional tap on the seaplane (raycast or generous screen radius when not on far corners)
      const hitsPlane = this.ray.intersectObject(this.plane.group, true);
      if (hitsPlane.length > 0 || (nearCenter && this._screenDistPx(planeCenter, ndcX, ndcY) < 58)) {
        this.markActivity(true);
        this.triggerCallOrBoard();
        return;
      }

      // 2. Tap walkable ground or pier
      const hitsGround = this.ray.intersectObjects([this.g.terrain.group, this.g.props.group], true);
      if (hitsGround.length > 0) {
        const pt = hitsGround[0].point;
        if (Math.abs(ndcX) > 0.78 && Math.abs(ndcY) > 0.72) {
          return;
        }
        const surfY = getWalkSurfaceY(pt.x, pt.z);
        if (surfY >= WATER_Y - 0.04) {
          this.walkTarget = new THREE.Vector3(pt.x, surfY, pt.z);
        }
      }
    } else if (this.state === 'ride') {
      // Generous screen-space hit detection around girl & cockpit/plane so aerial dismount always succeeds
      const girlCenter = this.girl.pos.clone().add(V(0, 0.72, 0));
      const planeCenter = this.plane.pos.clone().add(V(0, 1.3, 0));
      const hitsGirl = this.ray.intersectObject(this.girl.group, true);
      const hitsPlane = this.ray.intersectObject(this.plane.group, true);
      if (
        this._screenDistPx(girlCenter, ndcX, ndcY) < 105 ||
        this._screenDistPx(planeCenter, ndcX, ndcY) < 90 ||
        hitsGirl.length > 0 ||
        hitsPlane.length > 0
      ) {
        this.markActivity(true);
        this.triggerDismount();
      }
    } else if (this.state === 'float') {
      const planeCenter = this.plane.pos.clone().add(V(0, 1.1, 0));
      const hitsPlane = this.ray.intersectObject(this.plane.group, true);
      if (hitsPlane.length > 0 || this._screenDistPx(planeCenter, ndcX, ndcY) < 96) {
        this.markActivity(true);
        this.triggerCallOrBoard();
      }
    }
  }

  triggerBoard() {
    if (this.state !== 'garden' && this.state !== 'walk') return;
    this.boardMidAir = false;
    this.go('board');
  }

  triggerCallOrBoard() {
    if (this.state === 'garden') {
      this.triggerBoard();
    } else if (this.state === 'walk') {
      const dist = Math.hypot(this.girl.pos.x - this.plane.pos.x, this.girl.pos.z - this.plane.pos.z);
      if (dist > 14) {
        this.callPlaneToShore = true;
        const cx = channelCenterX(this.girl.pos.z);
        const sideDir = Math.sign(cx - this.girl.pos.x) || 1;
        this.callPlaneTarget.set(this.girl.pos.x + sideDir * 7.5, WATER_Y, this.girl.pos.z);
      } else {
        this.triggerBoard();
      }
    } else if (this.state === 'float') {
      this.boardMidAir = true;
      this.go('board');
    }
  }

  triggerDismount() {
    if (this.state !== 'ride') return;
    const alt = this.plane.pos.y;
    if (alt > 0.85) {
      this.girl.pos.set(this.plane.pos.x, Math.max(2.6, alt - 0.1), this.plane.pos.z);
      this.girl.yaw = this.plane.yaw;
      // Gently glide plane forward/right away from the descending girl
      this.plane.pos.x += Math.cos(this.plane.yaw) * 1.4;
      this.plane.pos.z -= Math.sin(this.plane.yaw) * 1.4;
      this.go('float');
    } else {
      const spot = this._findNearestWalkableShore(this.plane.pos.x, this.plane.pos.z);
      if (spot.dist < 24) {
        this.girl.pos.set(spot.x, spot.y, spot.z);
        this.collision.resolveCircle(this.girl.pos, 0.42, 1.35);
        this.girl.pos.y = getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z);
        this.girl.yaw = this.plane.yaw;
        this.go('walk');
      } else {
        this.girl.pos.set(this.plane.pos.x, Math.max(3.2, alt + 2.8), this.plane.pos.z);
        this.girl.yaw = this.plane.yaw;
        this.go('float');
      }
    }
  }

  _findNearestWalkableShore(x, z) {
    const candidates = [
      { x: 0, z: 18.0 },
      { x: -34.0, z: 108.0 },
      { x: 38.0, z: 382.0 },
      { x: 0, z: 522.0 },
    ];
    let best = { x, y: WATER_Y, z, dist: 9999 };
    for (const c of candidates) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < best.dist) best = { x: c.x, y: getWalkSurfaceY(c.x, c.z), z: c.z, dist: d };
    }
    const cx = channelCenterX(z);
    const hw = channelHalfWidth(z);
    const bankX = cx + (x >= cx ? 1 : -1) * (hw + 2.6);
    const bankY = getWalkSurfaceY(bankX, z);
    if (bankY >= WATER_Y && bankY < 6.0) {
      const bd = Math.hypot(bankX - x, 0);
      if (bd < best.dist) best = { x: bankX, y: bankY, z, dist: bd };
    }
    return best;
  }

  _updateRideMoment() {
    if (this.state !== 'ride') return;
    const z = this.plane.pos.z;
    const alt = this.plane.pos.y;
    if (z >= 242 && z <= 312) {
      window.__moment = 'bridge';
    } else if (z >= CANYON_ENTRY_Z && z <= CANYON_EXIT_Z) {
      window.__moment = 'canyon';
    } else if (z > 140 && alt < 0.85 && this.flightSpeed < 13.5) {
      window.__moment = 'land';
    } else if (z < 145) {
      window.__moment = 'takeoff';
    } else {
      window.__moment = 'canyon';
    }
  }

  _resolveGirlGroundAndSolids() {
    this.girl.pos.y = Math.max(WATER_Y, getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z));
    this.collision.resolveCircle(this.girl.pos, 0.45, 1.35);
    this.girl.pos.y = Math.max(WATER_Y, getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z));
    this.collision.resolveCircle(this.girl.pos, 0.45, 1.35);
    this.girl.pos.y = Math.max(WATER_Y, getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z));
  }

  _maxGroundUnderPlane(x, z, yaw) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = fz;
    const rz = -fx;
    let maxGy = getGroundY(x, z);
    const samples = [
      [x + rx * 0.92, z + rz * 0.92],
      [x - rx * 0.92, z - rz * 0.92],
      [x + fx * 1.9, z + fz * 1.9],
      [x - fx * 1.9, z - fz * 1.9],
    ];
    for (const [sx, sz] of samples) {
      const g = getGroundY(sx, sz);
      if (g > maxGy) maxGy = g;
    }
    return maxGy;
  }

  _resolvePlaneGroundAndSolids(airborne = false) {
    const p = this.plane.pos;
    const gCenter = getGroundY(p.x, p.z);
    const gFloats = this._maxGroundUnderPlane(p.x, p.z, this.plane.yaw);
    const floorA = gCenter < WATER_Y ? WATER_Y : gCenter + (airborne ? 1.45 : 0.25);
    const floorB = gFloats < WATER_Y ? WATER_Y : gFloats + 0.25;
    p.y = Math.max(p.y, floorA, floorB);

    const colRes = this.collision.resolveVehicle(p, this.plane.yaw);

    const gCenter2 = getGroundY(p.x, p.z);
    const gFloats2 = this._maxGroundUnderPlane(p.x, p.z, this.plane.yaw);
    const floorA2 = gCenter2 < WATER_Y ? WATER_Y : gCenter2 + (airborne ? 1.45 : 0.25);
    const floorB2 = gFloats2 < WATER_Y ? WATER_Y : gFloats2 + 0.25;
    p.y = Math.max(p.y, floorA2, floorB2);
    return colRes;
  }

  update(dt) {
    this.t += dt;
    this.phaseT += dt;

    // Sync if external test harness moved group.position directly
    if (
      this.girl.group.position.distanceToSquared(this._lastGirlPos) > 1e-4 &&
      this.girl.pos.distanceToSquared(this._lastGirlPos) < 1e-4
    ) {
      this.girl.pos.copy(this.girl.group.position);
    }
    if (
      this.plane.group.position.distanceToSquared(this._lastPlanePos) > 1e-4 &&
      this.plane.pos.distanceToSquared(this._lastPlanePos) < 1e-4
    ) {
      this.plane.pos.copy(this.plane.group.position);
    }

    const inActive = this.g.input.active;
    if (inActive) {
      this.targetSteerX = this.g.input.steerX;
      this.targetSteerY = this.g.input.steerY;
      this._holdActiveTime += dt;
      if (this._holdActiveTime >= 0.25) {
        this.markActivity(true);
      }
    } else {
      this._holdActiveTime = 0;
      if (!this.g.autotest) {
        this.targetSteerX = 0;
        this.targetSteerY = 0;
      }
    }

    this.steerX = damp(this.steerX, this.targetSteerX, 7.5, dt);
    this.steerY = damp(this.steerY, this.targetSteerY, 7.5, dt);

    // 20-second idle / no-progress gentle assist tracking
    const goalDist = this.plane.pos.distanceTo(LODGE_PIER_POS);
    if (this.state === 'ride' && goalDist < this.bestGoalDist - 1.5) {
      this.bestGoalDist = goalDist;
      this.idleSeconds = Math.max(0, this.idleSeconds - dt * 3.0);
    } else if (!inActive && !this.walkTarget && this.state !== 'arrive' && this.state !== 'board') {
      if (this.assistActive) {
        this.idleSeconds = Math.max(0, this.idleSeconds - dt * 2.0);
      } else {
        this.idleSeconds += dt;
      }
    }

    if (this.idleSeconds >= 20.0) {
      this.assistActive = true;
    }

    const assistOn = this.assistActive;
    this.guideAlpha = damp(this.guideAlpha, assistOn && this.state === 'ride' ? 1 : 0, 2.0, dt);

    if (this.state === 'garden') this._stepGarden(dt, assistOn);
    else if (this.state === 'board') this._stepBoard(dt);
    else if (this.state === 'ride') this._stepRide(dt, assistOn);
    else if (this.state === 'float') this._stepFloat(dt, assistOn);
    else if (this.state === 'walk') this._stepWalk(dt, assistOn);
    else if (this.state === 'arrive') this._stepArrive(dt);

    this._lastGirlPos.copy(this.girl.pos);
    this._lastPlanePos.copy(this.plane.pos);

    // Subtle banking horizon feel during flight
    const targetCamRoll = this.state === 'ride' ? -this.plane.roll * 0.14 : 0;
    this.rig.roll = damp(this.rig.roll, targetCamRoll, 5.0, dt);

    const shot = this._computeShot();
    const stiff = this.state === 'ride' ? 3.5 : this.state === 'float' ? 4.2 : this.state === 'walk' ? 3.8 : 2.6;
    this.rig.update(dt, shot, stiff);

    const throttle =
      this.state === 'ride' ? clamp(this.flightSpeed / 24, 0.25, 1) : this.state === 'board' ? 0.35 : 0.08;
    this.g.audio.setFlight({
      throttle,
      speed: this.state === 'ride' ? this.flightSpeed : 0,
      spray: this.sprayIntensity,
      alt: this.plane.pos.y,
    });
    this.g.water.update(this.plane.pos, this.plane.yaw, this.sprayIntensity);
    this.g.fx.update(dt, this.t, {
      planePos: this.plane.pos,
      yaw: this.plane.yaw,
      speed: this.state === 'ride' ? this.flightSpeed : 0,
      spray: this.sprayIntensity,
      girlPos: this.girl.pos,
      isFloating: this.state === 'float',
      guideAlpha: this.guideAlpha,
    });
  }

  _moveGirlOnFoot(dt, target) {
    const dx = target.x - this.girl.pos.x;
    const dz = target.z - this.girl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.22) {
      this.walkTarget = null;
      this.girl.animate('idle', this.t);
      return;
    }
    const speed = 3.2;
    const step = Math.min(d, speed * dt);
    const nx = this.girl.pos.x + (dx / d) * step;
    const nz = this.girl.pos.z + (dz / d) * step;
    const ny = getWalkSurfaceY(nx, nz);

    if (ny >= WATER_Y - 0.04) {
      const candidate = new THREE.Vector3(nx, ny, nz);
      this.collision.resolveCircle(candidate, 0.4, 1.3);
      const finalY = getWalkSurfaceY(candidate.x, candidate.z);
      if (finalY >= WATER_Y - 0.04) {
        this.girl.pos.set(candidate.x, finalY, candidate.z);
      } else {
        this.walkTarget = null;
      }
    } else {
      this.walkTarget = null;
    }
    this.girl.yaw = Math.atan2(dx, dz);
    this.girl.animate('walk', this.t, speed);
  }

  _stepGarden(dt, assistOn) {
    this.sprayIntensity = 0;

    if (assistOn && !this.walkTarget) {
      this.triggerBoard();
      return;
    }

    if (this.walkTarget) {
      this._moveGirlOnFoot(dt, this.walkTarget);
    } else {
      this._resolveGirlGroundAndSolids();
      this.girl.animate('idle', this.t);
    }
    this._resolvePlaneGroundAndSolids(false);
    const bob = Math.sin(this.t * 1.8) * 0.035;
    this.plane.updateVisuals(dt, this.t, { throttle: 0.12, showRing: true, bob });
  }

  _stepBoard(dt) {
    this.boardTimer += dt;
    this.sprayIntensity = 0;

    if (this.boardMidAir) {
      const dur = 1.05;
      const u = clamp(this.boardTimer / dur, 0, 1);
      this.plane.pos.lerp(this.girl.pos.clone().add(V(0, -1.2, 0)), clamp(dt * 4.5, 0, 1));
      this._resolvePlaneGroundAndSolids(true);
      this.plane.pitch = damp(this.plane.pitch, 0, 4, dt);
      this.plane.roll = damp(this.plane.roll, 0, 4, dt);
      this.plane.updateVisuals(dt, this.t, { throttle: 0.65 });
      const seat = this.plane.getSeatWorldPos();
      this.girl.pos.lerp(seat, smoothstep(0, 1, u));
      this.girl.pos.y = Math.max(this.girl.pos.y, getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z));
      this.girl.yaw = this.plane.yaw;
      this.girl.animate(u > 0.5 ? 'sit' : 'float', this.t);
      if (u >= 1) {
        this.boardMidAir = false;
        this.flightSpeed = 16.5;
        this.go('ride');
      }
      return;
    }

    const stepPt = this.boardStepTarget;
    const seat = this.plane.getSeatWorldPos();
    const walkDur = 0.72;
    const climbDur = 0.62;
    if (this.boardTimer < walkDur) {
      const u = smoothstep(0, walkDur, this.boardTimer);
      this.girl.pos.lerpVectors(this.boardStartGirl, stepPt, u);
      this.girl.pos.y = Math.max(WATER_Y, getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z));
      this.girl.yaw = Math.atan2(seat.x - stepPt.x, seat.z - stepPt.z);
      this.girl.animate('walk', this.t, 3.2);
    } else {
      const u = smoothstep(walkDur, walkDur + climbDur, this.boardTimer);
      this.girl.pos.lerpVectors(stepPt, seat, u);
      this.girl.pos.y += Math.sin(u * Math.PI) * 0.45;
      this.girl.yaw = this.plane.yaw;
      this.girl.animate(u > 0.6 ? 'sit' : 'walk', this.t, 2.0);
    }
    this.plane.pitch = damp(this.plane.pitch, 0, 5, dt);
    this.plane.roll = damp(this.plane.roll, 0, 5, dt);
    this._resolvePlaneGroundAndSolids(false);
    this.plane.updateVisuals(dt, this.t, { throttle: 0.32, bob: Math.sin(this.t * 2) * 0.025 });
    if (this.boardTimer >= walkDur + climbDur) {
      this.go('ride');
    }
  }

  _stepRide(dt, assistOn) {
    const turnRate = 0.78;
    this.flightYaw = wrapAngle(this.flightYaw - this.steerX * turnRate * dt);
    this.plane.roll = damp(this.plane.roll, this.steerX * 0.5, 5.5, dt);

    const targetPitch = this.steerY * 0.48;
    this.flightPitch = damp(this.flightPitch, targetPitch, 4.2, dt);

    if (assistOn) {
      const toGoalX = LODGE_PIER_POS.x - this.plane.pos.x;
      const toGoalZ = LODGE_PIER_POS.z - this.plane.pos.z;
      const targetYaw = Math.atan2(toGoalX, toGoalZ);
      const dyaw = wrapAngle(targetYaw - this.flightYaw);
      this.flightYaw = wrapAngle(this.flightYaw + clamp(dyaw, -0.8, 0.8) * 1.15 * dt);
      const distGoal = Math.hypot(toGoalX, toGoalZ);
      const targetAlt = distGoal > 60 ? 15.0 : 3.2;
      const dAlt = clamp((targetAlt - this.plane.pos.y) * 0.045, -0.28, 0.3);
      this.flightPitch = damp(this.flightPitch, dAlt, 2.5, dt);
    }

    const onSurface = this.plane.pos.y <= WATER_Y + 0.35;
    let targetSpeed = 23.0 + (this.steerY > 0.1 ? 3.5 : 0);
    if (onSurface && this.steerY < -0.25) {
      targetSpeed = 5.5;
    } else if (onSurface) {
      targetSpeed = 18.0;
    }
    this.flightSpeed = damp(this.flightSpeed, targetSpeed, 2.2, dt);

    const cosP = Math.cos(this.flightPitch);
    const fx = Math.sin(this.flightYaw);
    const fz = Math.cos(this.flightYaw);
    const vx = fx * cosP * this.flightSpeed;
    const vz = fz * cosP * this.flightSpeed;
    const vy = Math.sin(this.flightPitch) * this.flightSpeed;

    this.plane.pos.x += vx * dt;
    this.plane.pos.z += vz * dt;
    this.plane.pos.y += vy * dt;

    // 1. Water & terrain clearance at center AND wingtips/nose/tail so wings never slice canyon cliffs
    const gy = getGroundY(this.plane.pos.x, this.plane.pos.z);
    const minFloor = gy < WATER_Y ? WATER_Y : gy + 1.45;
    if (this.plane.pos.y < minFloor) {
      this.plane.pos.y = minFloor;
      if (this.flightPitch < 0) this.flightPitch = damp(this.flightPitch, 0, 8, dt);
    }

    const rx = fz;
    const rz = -fx;
    const wingProbes = [
      { x: this.plane.pos.x - rx * 3.85, z: this.plane.pos.z - rz * 3.85, yOff: 1.85 },
      { x: this.plane.pos.x + rx * 3.85, z: this.plane.pos.z + rz * 3.85, yOff: 1.85 },
      { x: this.plane.pos.x + fx * 2.55, z: this.plane.pos.z + fz * 2.55, yOff: 0.5 },
      { x: this.plane.pos.x - fx * 2.85, z: this.plane.pos.z - fz * 2.85, yOff: 0.7 },
    ];
    for (const pr of wingProbes) {
      const pg = getGroundY(pr.x, pr.z);
      const clearanceY = this.plane.pos.y + pr.yOff;
      if (pg > clearanceY) {
        const pen = pg - clearanceY;
        const grad = getGroundGrad(pr.x, pr.z, 1.5);
        const gLen = Math.hypot(grad.gx, grad.gz);
        if (gLen > 0.05) {
          const nx = -grad.gx / gLen;
          const nz = -grad.gz / gLen;
          const push = Math.min(2.6, pen * 0.8 + 0.18);
          this.plane.pos.x += nx * push;
          this.plane.pos.z += nz * push;
          const dot = fx * nx + fz * nz;
          if (dot < 0.15) {
            const awayYaw = Math.atan2(nx, nz);
            this.flightYaw = wrapAngle(this.flightYaw + clamp(wrapAngle(awayYaw - this.flightYaw), -0.6, 0.6) * 2.6 * dt);
          }
        }
        this.plane.pos.y = Math.min(64, this.plane.pos.y + Math.min(1.6, pen * 0.45));
      }
    }

    this.plane.pos.y = clamp(this.plane.pos.y, WATER_Y, 64);

    // Soft world boundary
    if (this.plane.pos.x < -110 || this.plane.pos.x > 110 || this.plane.pos.z < -30 || this.plane.pos.z > 580) {
      this.plane.pos.x = clamp(this.plane.pos.x, -110, 110);
      this.plane.pos.z = clamp(this.plane.pos.z, -30, 580);
      const backYaw = Math.atan2(-this.plane.pos.x, 300 - this.plane.pos.z);
      this.flightYaw = wrapAngle(this.flightYaw + wrapAngle(backYaw - this.flightYaw) * 2.2 * dt);
    }

    // 2. Deflect smoothly around solid colliders using oriented 2-tier seaplane bounds
    this.plane.yaw = this.flightYaw;
    const colRes = this._resolvePlaneGroundAndSolids(true);
    if (colRes.hit) {
      const dot = fx * colRes.nx + fz * colRes.nz;
      if (dot < 0.25) {
        const awayYaw = Math.atan2(colRes.nx, colRes.nz);
        this.flightYaw = wrapAngle(this.flightYaw + clamp(wrapAngle(awayYaw - this.flightYaw), -0.75, 0.75) * 3.2 * dt);
      }
      this.plane.pos.y = Math.min(64, this.plane.pos.y + 1.2 * dt);
    }

    const overLake = gy < WATER_Y - 0.1;
    this.onWater = overLake && this.plane.pos.y <= WATER_Y + 0.55;
    this.sprayIntensity = this.onWater ? clamp((this.flightSpeed - 3) / 14, 0.15, 1.0) : 0;

    this.plane.yaw = this.flightYaw;
    this.plane.pitch = this.flightPitch;
    this.plane.speed = this.flightSpeed;

    const bob = this.onWater ? Math.sin(this.t * 9.0) * 0.02 : Math.sin(this.t * 2.2) * 0.04;
    this.plane.updateVisuals(dt, this.t, {
      throttle: clamp(this.flightSpeed / 22, 0.3, 1),
      steerX: this.steerX,
      bob,
    });

    this.girl.pos.copy(this.plane.getSeatWorldPos());
    this.girl.yaw = this.plane.yaw;
    this.girl.animate('sit', this.t);

    this._updateRideMoment();

    const distToLodge = Math.hypot(this.plane.pos.x - LODGE_PIER_POS.x, this.plane.pos.z - LODGE_PIER_POS.z);
    if (distToLodge < 24 && this.plane.pos.y < 16) {
      this.go('arrive');
    }
  }

  _stepFloat(dt, assistOn) {
    this.sprayIntensity = 0;

    const targetPlaneY = Math.max(WATER_Y, getGroundY(this.plane.pos.x, this.plane.pos.z) + 0.26);
    this.plane.pos.y = damp(this.plane.pos.y, targetPlaneY, 0.8, dt);
    this.plane.pos.x += Math.sin(this.plane.yaw) * 4.5 * dt;
    this.plane.pos.z += Math.cos(this.plane.yaw) * 4.5 * dt;
    this.plane.yaw = wrapAngle(this.plane.yaw + 0.35 * dt);
    this.plane.pitch = damp(this.plane.pitch, -0.02, 2.5, dt);
    this.plane.roll = damp(this.plane.roll, -0.14, 2.5, dt);
    this._resolvePlaneGroundAndSolids(false);
    this.plane.updateVisuals(dt, this.t, { throttle: 0.15 });

    const speedH = 4.2;
    const dirX = Math.sin(this.girl.yaw);
    const dirZ = Math.cos(this.girl.yaw);
    const rightX = dirZ;
    const rightZ = -dirX;

    let moveX = (-rightX * this.steerX + dirX * this.steerY) * speedH;
    let moveZ = (-rightZ * this.steerX + dirZ * this.steerY) * speedH;

    const curSurf = getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z);
    if (curSurf < WATER_Y - 0.04 || assistOn) {
      const shore = this._findNearestWalkableShore(this.girl.pos.x, this.girl.pos.z);
      const sx = shore.x - this.girl.pos.x;
      const sz = shore.z - this.girl.pos.z;
      const sd = Math.max(1, Math.hypot(sx, sz));
      moveX += (sx / sd) * 3.8;
      moveZ += (sz / sd) * 3.8;
    }

    this.girl.pos.x += moveX * dt;
    this.girl.pos.z += moveZ * dt;
    this.girl.pos.y -= 1.85 * dt;

    this.collision.resolveCircle(this.girl.pos, 0.44, 1.35);

    const floorY = Math.max(WATER_Y + 0.04, getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z));
    if (this.girl.pos.y <= floorY) {
      this.girl.pos.y = floorY;
      if (getWalkSurfaceY(this.girl.pos.x, this.girl.pos.z) < WATER_Y - 0.04) {
        const shore = this._findNearestWalkableShore(this.girl.pos.x, this.girl.pos.z);
        this.girl.pos.set(shore.x, shore.y, shore.z);
        this._resolveGirlGroundAndSolids();
      }
      this.go('walk');
      return;
    }

    this.girl.animate('float', this.t);
  }

  _stepWalk(dt, assistOn) {
    this.sprayIntensity = 0;

    if (this.callPlaneToShore) {
      const dx = this.callPlaneTarget.x - this.plane.pos.x;
      const dz = this.callPlaneTarget.z - this.plane.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.5) {
        this.callPlaneToShore = false;
        this.triggerBoard();
        return;
      }
      this.plane.yaw = Math.atan2(dx, dz);
      this.plane.pos.x += (dx / d) * 12 * dt;
      this.plane.pos.z += (dz / d) * 12 * dt;
      this.plane.pos.y = WATER_Y;
      this.plane.pitch = damp(this.plane.pitch, 0, 5, dt);
      this.plane.roll = damp(this.plane.roll, 0, 5, dt);
      this._resolvePlaneGroundAndSolids(false);
      this.sprayIntensity = 0.55;
      this.plane.updateVisuals(dt, this.t, { throttle: 0.45 });
    } else {
      // Smoothly level moored plane onto the water surface
      this.plane.pos.y = damp(this.plane.pos.y, WATER_Y, 4.0, dt);
      this.plane.pitch = damp(this.plane.pitch, 0, 4.0, dt);
      this.plane.roll = damp(this.plane.roll, 0, 4.0, dt);
      this._resolvePlaneGroundAndSolids(false);
      const bob = Math.sin(this.t * 1.8) * 0.03;
      this.plane.updateVisuals(dt, this.t, { throttle: 0.1, bob, showRing: true });
    }

    if (assistOn && !this.walkTarget) {
      this.triggerCallOrBoard();
      return;
    }

    if (this.walkTarget) {
      this._moveGirlOnFoot(dt, this.walkTarget);
    } else {
      this._resolveGirlGroundAndSolids();
      this.girl.animate('idle', this.t);
    }
  }

  _stepArrive(dt) {
    this.sprayIntensity = 0;
    this._resolveGirlGroundAndSolids();
    this._resolvePlaneGroundAndSolids(false);
    const bob = Math.sin(this.t * 1.6) * 0.025;
    this.plane.updateVisuals(dt, this.t, { throttle: 0.05, bob });
    this.girl.animate('wave', this.t);
  }

  _computeShot() {
    const aspect = this.g.camera.aspect || 1.33;

    if (this.state === 'garden') {
      const pts = [
        V(-7.6, 3.4, -3.0), // Girl's cabin front corner
        this.girl.pos.clone().add(V(0, 1.4, 0)),
        V(-3.2, 1.4, -2.8), // Postbox
        V(5.4, 0.8, -2.2), // Cedar canoe
        this.plane.pos.clone().add(V(3.6, 1.8, 1.6)),
      ];
      return {
        ...fitShot({
          points: pts,
          dir: V(0.24, 0.20, -0.95),
          fov: 46,
          aspect,
          margin: 0.14,
          target: V(-0.4, 1.7, 3.8),
          minDist: 16.5,
        }),
        anchorId: 'garden',
      };
    }

    if (this.state === 'board') {
      const pts = [
        this.girl.pos.clone().add(V(0, 1.3, 0)),
        this.plane.pos.clone().add(V(3.6, 2.2, 2.2)),
        this.plane.pos.clone().add(V(-3.6, 0.0, -2.8)),
      ];
      return {
        ...fitShot({
          points: pts,
          dir: V(-0.48, 0.26, -0.84),
          fov: 44,
          aspect,
          margin: 0.16,
          minDist: 8.0,
        }),
        anchorId: 'board',
      };
    }

    if (this.state === 'ride') {
      const fx = Math.sin(this.flightYaw);
      const fz = Math.cos(this.flightYaw);
      const rx = fz;
      const rz = -fx;
      const p = this.plane.pos;
      const pts = [
        p.clone().add(V(rx * 3.85, 2.25, rz * 3.85)),
        p.clone().add(V(-rx * 3.85, 2.25, -rz * 3.85)),
        p.clone().add(V(fx * 2.55, 0.0, fz * 2.55)),
        p.clone().add(V(-fx * 3.1, 2.25, -fz * 3.1)),
        p.clone().add(V(0, -0.25, 0)),
      ];
      const fov = 46 + clamp((this.flightSpeed - 12) / 14, 0, 1) * 6;
      const dir = V(-fx * 0.95 + rx * 0.06, 0.24, -fz * 0.95 + rz * 0.06).normalize();
      const tgt = p.clone().add(V(fx * 1.4, 1.25 + this.flightPitch * 1.6, fz * 1.4));
      const shot = fitShot({ points: pts, dir, fov, aspect, margin: 0.21, target: tgt, minDist: 12.2 });

      // Keep camera cleanly outside canyon cliff walls and above terrain slopes
      const chX = channelCenterX(shot.pos.z);
      for (let k = 0; k < 3; k++) {
        const camGy = getGroundY(shot.pos.x, shot.pos.z);
        const midX = (shot.pos.x + tgt.x) * 0.5;
        const midZ = (shot.pos.z + tgt.z) * 0.5;
        const midGy = getGroundY(midX, midZ);
        if (camGy + 2.6 > shot.pos.y || midGy + 2.0 > (shot.pos.y + tgt.y) * 0.5) {
          shot.pos.x += (chX - shot.pos.x) * 0.35;
          shot.pos.y = Math.max(shot.pos.y, camGy + 2.8, midGy + 2.2);
        } else {
          break;
        }
      }

      shot.anchorId = 'ride';
      shot.anchor = p;
      return shot;
    }

    if (this.state === 'float') {
      const p = this.girl.pos;
      const pts = [p.clone().add(V(-1.1, 2.45, -1.1)), p.clone().add(V(1.1, -0.1, 1.1))];
      const tgt = p.clone().add(V(0, 1.15, 0));
      const shot = fitShot({
        points: pts,
        dir: V(0.32, 0.16, -0.93),
        fov: 44,
        aspect,
        margin: 0.18,
        target: tgt,
        minDist: 6.2,
      });
      shot.anchorId = 'float';
      shot.anchor = p;
      return shot;
    }

    if (this.state === 'walk') {
      const p = this.girl.pos;
      const pts = [p.clone().add(V(-1.6, 1.6, -1.6)), p.clone().add(V(1.6, 0.0, 1.6))];
      const tgt = p.clone().add(V(0, 0.9, 0));
      const shot = fitShot({
        points: pts,
        dir: V(-0.28, 0.34, -0.9),
        fov: 45,
        aspect,
        margin: 0.16,
        target: tgt,
        minDist: 6.5,
      });
      shot.anchorId = 'walk';
      shot.anchor = p;
      return shot;
    }

    // arrive (lodge): Full seaplane + girl + lodge host + full ivory Lodge roof clearly framed
    const fx = Math.sin(this.plane.yaw);
    const fz = Math.cos(this.plane.yaw);
    const rx = fz;
    const rz = -fx;
    const p = this.plane.pos;
    const pts = [
      this.girl.pos.clone().add(V(0, 1.4, 0)),
      V(1.2, 1.7, 529.2), // Lodge host
      p.clone().add(V(rx * 3.7, 2.1, rz * 3.7)),
      p.clone().add(V(-rx * 3.7, 2.1, -rz * 3.7)),
      p.clone().add(V(-fx * 3.0, 2.2, -fz * 3.0)), // Full tail fin clearance
      p.clone().add(V(fx * 2.5, 0.0, fz * 2.5)),
      V(-7.8, 10.6, 547.5), // Lodge ivory roof peak left
      V(7.8, 10.6, 547.5), // Lodge ivory roof peak right
    ];
    const tgt = V(-1.4, 2.6, 529.5);
    return {
      ...fitShot({
        points: pts,
        dir: V(0.28, 0.11, -0.95),
        fov: 44,
        aspect,
        margin: 0.12,
        target: tgt,
        minDist: 9.8,
      }),
      anchorId: 'arrive',
    };
  }
}
