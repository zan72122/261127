import * as THREE from '../../lib/three.module.js';
import {
  GIRL_START,
  GOAL_POS,
  HOME_POS,
  PLANE_LAND_YARD,
  shared,
} from '../core/env.js';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import { WordlessUI } from '../core/ui.js';
import {
  getGroundY,
  getSurfaceY,
  getWalkableY,
  getWaterY,
  isFlatLandable,
  resolveGirlCollisions,
  resolvePlaneCollisions,
} from '../world/terrain.js';
import { CameraRig, fitShot } from './camera.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const PLANE_CORNERS = [
  V(0, 0, 0),
  V(0, 0.38, 2.28),
  V(0, 0, -1.61),
  V(-1.89, 0.59, -1.36),
  V(1.89, 0.59, -1.36),
];
const _cornerEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _cornerOff = new THREE.Vector3();

function computePlaneClearance(pos, yaw, pitch, roll, pad = 0.22) {
  _cornerEuler.set(-pitch, yaw, -roll, 'YXZ');
  let maxNeedCenterY = getSurfaceY(pos.x, pos.z) + pad;
  let anyWater = getWaterY(pos.x, pos.z) !== null;
  let maxFloor = getSurfaceY(pos.x, pos.z);
  for (let i = 0; i < PLANE_CORNERS.length; i++) {
    _cornerOff.copy(PLANE_CORNERS[i]).applyEuler(_cornerEuler);
    const sx = pos.x + _cornerOff.x;
    const sz = pos.z + _cornerOff.z;
    const sg = getGroundY(sx, sz);
    const sw = getWaterY(sx, sz);
    if (sw !== null) anyWater = true;
    const sf = sw !== null ? Math.max(sg, sw) : sg;
    maxFloor = Math.max(maxFloor, sf);
    maxNeedCenterY = Math.max(maxNeedCenterY, sf + pad - _cornerOff.y);
  }
  return { maxNeedCenterY, maxFloor, anyWater };
}

export class Director {
  constructor(game) {
    this.g = game;
    this.girl = game.girl;
    this.plane = game.plane;
    this.lookout = game.landmarks;
    this.rig = new CameraRig(game.camera);
    this.ray = new THREE.Raycaster();
    this.ui = new WordlessUI();

    this.state = 'garden';
    this.phase = 'arriving';
    this.t = 0;
    this.phaseT = 0;

    // 1-finger input state
    this.ptr = null;
    this.steerX = 0;
    this.steerY = 0;
    this.targetSteerX = 0;
    this.targetSteerY = 0;

    // Flight & walk state
    this.flightYaw = 0.08;
    this.flightPitch = 0.14;
    this.flightRoll = 0;
    this.flightSpeed = 0;
    this.walkSpeed = 0;
    this.walkTarget = null;
    this.boardFromPos = new THREE.Vector3();
    this.thermalBoostT = 0;
    this.thermalMomentT = 0;

    // 20s gentle goal assist
    this.bestGoalDist = 9999;
    this.noProgressT = 0;
    this.idleSeconds = 0;
    this.assistActive = false;
    this.guideAlpha = 0;

    // Midair float & circling plane state
    this.circleAngle = 0;
    this.circleCenter = new THREE.Vector3();
    this.reboardMidair = false;
    this.reboardT = 0;

    this._bindInputs();
    this._registerQA();
  }

  _bindInputs() {
    const inp = this.g.input;
    inp.onDown = (p) => this._down(p);
    inp.onMove = (p) => this._move(p);
    inp.onUp = (p) => this._up(p);
    inp.onTap = (p) => this._tap(p);

    this.ui.onTrigger = (mode) => {
      if (mode === 'float' && this.state === 'ride') {
        this.triggerDismount();
      } else if (mode === 'call' && (this.state === 'float' || this.state === 'walk')) {
        this.triggerCallOrBoard();
      }
    };
  }

  _registerQA() {
    window.__qa = {
      getState: () => {
        const alt = this.state === 'ride' ? this.plane.pos.y : this.girl.pos.y;
        const speed = this.state === 'ride' ? this.flightSpeed : this.walkSpeed;
        return {
          ready: !!window.__ready,
          moment: window.__moment,
          state: this.state,
          boarded: this.state === 'ride',
          girl: { x: this.girl.pos.x, y: this.girl.pos.y, z: this.girl.pos.z },
          vehicle: { x: this.plane.pos.x, y: this.plane.pos.y, z: this.plane.pos.z },
          goal: { x: GOAL_POS.x, y: GOAL_POS.y, z: GOAL_POS.z, name: 'lookout' },
          yaw: this.flightYaw,
          speed,
          alt,
          idleSeconds: this.idleSeconds,
        };
      },
    };
  }

  aspect() {
    return this.g.vw / Math.max(1, this.g.vh);
  }

  ar(portraitVal, landscapeVal) {
    return this.aspect() < 1.0 ? portraitVal : landscapeVal;
  }

  screenPos(worldPos) {
    const v = worldPos.clone().project(this.g.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.g.vw,
      y: (-v.y * 0.5 + 0.5) * this.g.vh,
      z: v.z,
    };
  }

  playerWorldPos() {
    return this.state === 'ride' ? this.plane.pos : this.girl.pos;
  }

  go(nextState) {
    this.state = nextState;
    this.phaseT = 0;

    if (nextState === 'garden') {
      window.__moment = 'garden';
      this.phase = 'arriving';
      this.girl.group.position.copy(GIRL_START);
      this.girl.pos.copy(GIRL_START);
      this.girl.yaw = 0.65;
      this.girl.group.rotation.set(0, this.girl.yaw, 0);
      this.walkTarget = null;

      this.plane.group.position.set(8.5, HOME_POS.y + 3.2, 12.5);
      this.plane.group.rotation.set(0.08, -2.1, -0.15);
      this.plane.pos.copy(this.plane.group.position);
      this.ui.setMode('none');
      this.rig.snap(this._shotGarden());
    } else if (nextState === 'board') {
      window.__moment = 'board';
      this.phase = 'approach';
      this.boardFromPos.copy(this.girl.pos);
      this.walkTarget = null;
      this.ui.setMode('none');
    } else if (nextState === 'ride') {
      this.phase = 'gliding';
      this.flightSpeed = Math.max(13.5, this.flightSpeed);
      this.bestGoalDist = this.plane.pos.distanceTo(GOAL_POS);
      this.noProgressT = 0;
      this.idleSeconds = 0;
      this.assistActive = false;
      this.ui.setMode('float');
      this._updateMomentByPosition();
    } else if (nextState === 'float') {
      window.__moment = 'float';
      this.phase = 'descending';
      this.reboardMidair = false;
      this.circleCenter.copy(this.girl.pos);
      this.circleAngle = this.flightYaw;
      this.ui.setMode('call');
    } else if (nextState === 'walk') {
      window.__moment = this.girl.pos.z < 26 ? 'garden' : 'land';
      this.phase = 'grounded';
      this.walkTarget = null;
      this.walkSpeed = 0;
      this.ui.setMode('call');
    } else if (nextState === 'arrive') {
      window.__moment = 'lookout';
      this.phase = 'touchdown';
      this.ui.setMode('none');
      if (this.plane.pos.distanceTo(GOAL_POS) > 45) {
        const landSpot = this.lookout.planeLandSpot();
        this.plane.group.position.copy(landSpot).add(V(0, 0.04, 0));
        this.plane.group.rotation.set(0, -2.42, 0);
        this.plane.pos.copy(this.plane.group.position);
        const girlSpot = this.lookout.lookoutStandSpot();
        this.girl.group.position.copy(girlSpot);
        this.girl.pos.copy(girlSpot);
        this.phase = 'celebrate';
        this.rig.snap(this._shotArrive());
      }
      this.g.audio.arrivalChord();
    }
  }

  triggerBoard() {
    if (this.state === 'garden') {
      this.g.audio.paperRustle();
      this.go('board');
    }
  }

  triggerDismount() {
    if (this.state !== 'ride') return;
    const p = this.plane.pos;
    const groundY = getSurfaceY(p.x, p.z);
    if (p.y - groundY > 2.0) {
      this.girl.group.position.set(p.x, Math.max(groundY + 1.8, p.y - 0.5), p.z);
      this.girl.pos.copy(this.girl.group.position);
      this.go('float');
    } else {
      // Low over ground -> level plane cleanly & hop down to walk
      this.plane.group.rotation.order = 'YXZ';
      this.plane.group.rotation.set(0, this.flightYaw, 0);
      const planeFloor = Math.max(
        getSurfaceY(p.x, p.z),
        computePlaneClearance(p, this.flightYaw, 0, 0, 0.04).maxNeedCenterY - 0.04
      );
      this.plane.group.position.set(p.x, planeFloor + 0.04, p.z);
      this.plane.pos.copy(this.plane.group.position);

      const gy = getWalkableY(p.x - 1.6, p.z);
      this.girl.group.position.set(p.x - 1.6, gy, p.z);
      resolveGirlCollisions(this.girl.group.position);
      this.girl.group.position.y = getWalkableY(this.girl.group.position.x, this.girl.group.position.z);
      this.girl.pos.copy(this.girl.group.position);
      this.go('walk');
    }
  }

  triggerCallOrBoard() {
    if (this.state === 'float' && !this.reboardMidair) {
      this.reboardMidair = true;
      this.reboardT = 0;
      this.g.audio.paperRustle();
    } else if (this.state === 'walk') {
      this.g.audio.paperRustle();
      if (this.plane.pos.distanceTo(this.girl.pos) > 15) {
        const px = this.girl.pos.x + 1.8;
        const pz = this.girl.pos.z + 0.8;
        const pClear = computePlaneClearance(V(px, 0, pz), this.girl.yaw, 0, 0, 0.04).maxNeedCenterY;
        this.plane.group.position.set(px, Math.max(getSurfaceY(px, pz) + 0.04, pClear), pz);
        this.plane.group.rotation.order = 'YXZ';
        this.plane.group.rotation.set(0, this.girl.yaw, 0);
        this.plane.pos.copy(this.plane.group.position);
      }
      this.go('board');
    }
  }

  // ------------------------------------------------------------------ UPDATE
  update(dt) {
    this.t += dt;
    this.phaseT += dt;

    if (this.state === 'garden') this._updateGarden(dt);
    else if (this.state === 'board') this._updateBoard(dt);
    else if (this.state === 'ride') this._updateRide(dt);
    else if (this.state === 'float') this._updateFloat(dt);
    else if (this.state === 'walk') this._updateWalk(dt);
    else if (this.state === 'arrive') this._updateArrive(dt);

    shared.uSpeed.value = this.state === 'ride' ? this.flightSpeed : 0;
    shared.uAltitude.value = clamp((this.playerWorldPos().y - 12) / 55, 0, 1);
    shared.uCameraPos.value.copy(this.g.camera.position);

    const p = this.playerWorldPos();
    const streamProx = clamp(1 - Math.abs(p.z - 68) / 28, 0, 1) * clamp(1 - (p.y - 2) / 14, 0, 1);
    this.g.audio.setAmbience(this.state === 'ride' ? this.flightSpeed : 1.2, Math.max(0, p.y - 12), streamProx);

    this.g.floatCanopy.update(this.t, this.state === 'float', this.girl.pos);
    this.g.landingRing.update(
      this.t,
      (this.state === 'garden' && (this.phase === 'waiting' || this.phaseT > 0.55)) || this.state === 'walk',
      this.plane.pos
    );
  }

  _updateGarden(dt) {
    // Paper airplane glides gracefully down from valley breeze into the yard during first 0.95s
    if (this.phase === 'arriving') {
      const u = clamp(this.phaseT / 0.95, 0, 1);
      const ease = 1 - Math.pow(1 - u, 3);
      this.plane.group.position.set(
        lerp(7.5, PLANE_LAND_YARD.x, ease),
        lerp(HOME_POS.y + 2.8, PLANE_LAND_YARD.y + 0.03, ease) + Math.sin(u * Math.PI) * 0.4,
        lerp(11.5, PLANE_LAND_YARD.z, ease)
      );
      this.plane.group.rotation.set(
        lerp(0.08, 0, ease),
        lerp(-1.9, 0.28, ease),
        lerp(-0.14, 0, ease)
      );
      if (u >= 1) {
        this.phase = 'waiting';
        this.phaseT = 0;
      }
    } else {
      // Gentle breeze settle on grass
      this.plane.group.position.set(PLANE_LAND_YARD.x, PLANE_LAND_YARD.y + 0.03, PLANE_LAND_YARD.z);
      this.plane.group.rotation.set(0, 0.28 + Math.sin(this.t * 1.1) * 0.02, Math.sin(this.t * 1.4) * 0.015);
    }
    this.plane.update(this.t, this.phase === 'arriving' ? 6 : 0.4, 0);

    // Girl walks to tapped ground spots (never auto-boarding on random taps!)
    if (this.walkTarget) {
      const dx = this.walkTarget.x - this.girl.pos.x;
      const dz = this.walkTarget.z - this.girl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.25) {
        const spd = 2.6;
        this.walkSpeed = spd;
        this.girl.yaw = damp(this.girl.yaw, Math.atan2(dx, dz), 10, dt);
        this.girl.group.position.x += (dx / d) * spd * dt;
        this.girl.group.position.z += (dz / d) * spd * dt;
        resolveGirlCollisions(this.girl.group.position);
        this.girl.group.position.y = getWalkableY(this.girl.group.position.x, this.girl.group.position.z);
        this.girl.group.rotation.set(0, this.girl.yaw, 0);
        this.girl.setPose('walk', dt, this.t, spd);
      } else {
        this.walkTarget = null;
        this.walkSpeed = 0;
      }
    } else {
      this.walkSpeed = 0;
      const lookYaw = Math.atan2(this.plane.pos.x - this.girl.pos.x, this.plane.pos.z - this.girl.pos.z);
      this.girl.yaw = wrapAngle(this.girl.yaw + wrapAngle(lookYaw - this.girl.yaw) * Math.min(1, dt * 4));
      this.girl.group.rotation.set(0, this.girl.yaw, 0);
      this.girl.setPose('idle', dt, this.t, 0);
    }

    this.rig.update(dt, this._shotGarden(), 2.2);
  }

  _updateBoard(dt) {
    if (this.phase === 'approach') {
      const seat = this.plane.seatWorld();
      const targetApproach = seat.clone().add(V(-1.15, 0, -0.55));
      const u = clamp(this.phaseT / 0.72, 0, 1);
      this.girl.group.position.lerpVectors(this.boardFromPos, targetApproach, smoothstep(0, 1, u));
      resolveGirlCollisions(this.girl.group.position);
      this.girl.group.position.y = getWalkableY(this.girl.group.position.x, this.girl.group.position.z);
      const dx = seat.x - this.girl.group.position.x;
      const dz = seat.z - this.girl.group.position.z;
      this.girl.yaw = Math.atan2(dx, dz);
      this.girl.group.rotation.set(0, this.girl.yaw, 0);
      this.girl.setPose('walk', dt, this.t, 2.8);
      if (u >= 1) {
        this.phase = 'climb';
        this.phaseT = 0;
        this.boardFromPos.copy(this.girl.group.position);
      }
    } else if (this.phase === 'climb') {
      const seat = this.plane.seatWorld();
      const u = clamp(this.phaseT / 0.62, 0, 1);
      const s = smoothstep(0, 1, u);
      this.girl.group.position.lerpVectors(this.boardFromPos, seat, s);
      this.girl.group.position.y += Math.sin(u * Math.PI) * 0.68;
      this.girl.yaw = this.plane.group.rotation.y;
      this.girl.group.rotation.set(0, this.girl.yaw, 0);
      this.girl.setPose('ride', dt, this.t, 2, 0);
      if (u >= 1) {
        this.phase = 'takeoff';
        this.phaseT = 0;
        this.flightYaw = wrapAngle(this.plane.group.rotation.y);
        // Aim gently out into the open Satoyama valley
        if (Math.abs(this.flightYaw) > 1.15) this.flightYaw = 0.08;
        this.flightPitch = 0.24;
        this.flightSpeed = 12.5;
      }
    } else if (this.phase === 'takeoff') {
      const u = clamp(this.phaseT / 1.05, 0, 1);
      const fwd = V(Math.sin(this.flightYaw), 0, Math.cos(this.flightYaw));
      this.plane.group.position.addScaledVector(fwd, 11.5 * dt);
      this.plane.group.position.y += (5.0 + u * 2.2) * dt;
      resolvePlaneCollisions(this.plane.group.position, 1.8);
      const { maxNeedCenterY } = computePlaneClearance(
        this.plane.group.position,
        this.flightYaw,
        0.22 * u,
        0,
        0.24
      );
      if (this.plane.group.position.y < maxNeedCenterY) this.plane.group.position.y = maxNeedCenterY;
      this.plane.group.rotation.order = 'YXZ';
      this.plane.group.rotation.set(-0.22 * u, this.flightYaw, 0);
      this.plane.update(this.t, 12, 0);
      const seat = this.plane.seatWorld();
      this.girl.group.position.copy(seat);
      this.girl.group.rotation.copy(this.plane.group.rotation);
      this.girl.setPose('ride', dt, this.t, 12, 0);
      if (u >= 1) {
        this.go('ride');
      }
    }

    this.rig.update(dt, this._shotBoard(), 2.8);
  }

  _updateMomentByPosition() {
    if (this.thermalMomentT > 0) {
      window.__moment = 'thermal';
      return;
    }
    const p = this.plane.pos;
    if (p.distanceTo(GOAL_POS) < 40 && p.y >= GOAL_POS.y - 3.5) {
      window.__moment = 'lookout';
    } else if (p.z >= 112) {
      window.__moment = 'terrace';
    } else {
      window.__moment = 'valley';
    }
  }

  _updateRide(dt) {
    this.thermalBoostT = Math.max(0, this.thermalBoostT - dt);
    this.thermalMomentT = Math.max(0, this.thermalMomentT - dt);

    // Smooth 1-finger steering
    this.steerX = damp(this.steerX, this.targetSteerX, 9.5, dt);
    this.steerY = damp(this.steerY, this.targetSteerY, 9.5, dt);

    const playerSteering = Math.abs(this.targetSteerX) > 0.08 || Math.abs(this.targetSteerY) > 0.08;

    // Progress & 20s gentle goal assist tracking
    const goalDist = this.plane.pos.distanceTo(GOAL_POS);
    if (goalDist < this.bestGoalDist - 2.5) {
      this.bestGoalDist = goalDist;
      this.noProgressT = 0;
      this.idleSeconds = damp(this.idleSeconds, 0, 5.0, dt);
    } else {
      this.noProgressT += dt;
      if (!playerSteering) {
        this.idleSeconds += dt;
      } else {
        this.idleSeconds = damp(this.idleSeconds, 0, 3.5, dt);
      }
    }

    if (this.noProgressT >= 18.0) {
      this.assistActive = true;
    }
    if (playerSteering && Math.abs(this.targetSteerX) > 0.35) {
      // Strong intentional player steering temporarily suppresses assist
      this.assistActive = false;
      this.noProgressT = Math.min(this.noProgressT, 10.0);
    }

    this.guideAlpha = damp(this.guideAlpha, this.assistActive ? 0.78 : 0.0, 2.5, dt);

    // Yaw & pitch control
    let yawRate = -this.steerX * 1.05;
    let targetPitch = this.steerY * 0.62;

    if (this.assistActive && !playerSteering) {
      const toGoal = GOAL_POS.clone().sub(this.plane.pos);
      const horiz = Math.max(1, Math.hypot(toGoal.x, toGoal.z));
      const aimYaw = Math.atan2(toGoal.x, toGoal.z);
      const yawDiff = wrapAngle(aimYaw - this.flightYaw);
      yawRate += clamp(yawDiff * 1.4, -0.75, 0.75);

      let safeAlt = this.plane.pos.y;
      for (const distAhead of [14, 28, 42]) {
        const ax = this.plane.pos.x + Math.sin(this.flightYaw) * distAhead;
        const az = this.plane.pos.z + Math.cos(this.flightYaw) * distAhead;
        safeAlt = Math.max(safeAlt, getSurfaceY(ax, az) + 8.5);
      }
      const desiredY = horiz < 26 ? GOAL_POS.y + 1.8 : Math.max(GOAL_POS.y + 4.0, safeAlt);
      const aimPitch = clamp(Math.atan2(desiredY - this.plane.pos.y, horiz), -0.25, 0.38);
      targetPitch = aimPitch;
      // Assist actively moving toward goal brings idleSeconds down smoothly once engaged
      if (Math.abs(yawDiff) < 0.75) {
        this.idleSeconds = damp(this.idleSeconds, 0, 1.5, dt);
      }
    }

    this.flightYaw = wrapAngle(this.flightYaw + yawRate * dt);
    this.flightPitch = damp(this.flightPitch, clamp(targetPitch, -0.58, 0.64), 7.5, dt);

    // Check thermal updraft rings
    const rings = this.g.thermalRings.waypoints;
    for (let i = 0; i < rings.length; i++) {
      if (this.plane.pos.distanceTo(rings[i]) < 9.5) {
        if (!this.g.thermalRings.passed.has(i)) {
          this.g.thermalRings.triggerBurst(i);
          this.g.audio.thermalLift();
        }
        this.thermalBoostT = 1.6;
        this.thermalMomentT = 2.6;
      }
    }

    if (this.thermalBoostT > 0) {
      this.flightPitch = Math.max(this.flightPitch, 0.28);
    }

    // Smooth aerodynamic speed
    const targetSpeed = clamp(
      14.2 - this.flightPitch * 5.2 + (this.thermalBoostT > 0 ? 4.2 : 0),
      10.8,
      20.5
    );
    this.flightSpeed = damp(this.flightSpeed, targetSpeed, 2.8, dt);

    // Advance position
    const cp = Math.cos(this.flightPitch);
    const dir = V(
      Math.sin(this.flightYaw) * cp,
      Math.sin(this.flightPitch),
      Math.cos(this.flightYaw) * cp
    );
    const nextPos = this.plane.group.position.clone().addScaledVector(dir, this.flightSpeed * dt);

    // World perimeter soft turn-back (never hit invisible brick walls or leave valley)
    const distFromCenter = Math.hypot(nextPos.x, nextPos.z - 170);
    if (distFromCenter > 215) {
      const backYaw = Math.atan2(-nextPos.x, 170 - nextPos.z);
      this.flightYaw = wrapAngle(this.flightYaw + wrapAngle(backYaw - this.flightYaw) * 2.2 * dt);
      nextPos.x = clamp(nextPos.x, -170, 170);
      nextPos.z = clamp(nextPos.z, -35, 395);
    }
    nextPos.y = clamp(nextPos.y, 1.5, 98);

    // Rigid structure deflection
    resolvePlaneCollisions(nextPos, 1.85);

    // Multi-point rotated terrain & mirror water clearance (nose & wingtips never slice into slopes or paddies)
    const groundY = getGroundY(nextPos.x, nextPos.z);
    const { maxNeedCenterY, maxFloor, anyWater } = computePlaneClearance(
      nextPos,
      this.flightYaw,
      this.flightPitch,
      this.flightRoll,
      0.24
    );

    if (nextPos.y < maxNeedCenterY) {
      if (anyWater) {
        // Skim cleanly over mirror rice paddies & stream without ever sinking below water!
        nextPos.y = maxNeedCenterY + 0.06;
        this.flightPitch = Math.max(0.03, this.flightPitch);
      } else {
        // Gentle touch down onto dry ground (lookout arrival or scenic landing)
        const goalH = Math.hypot(nextPos.x - GOAL_POS.x, nextPos.z - GOAL_POS.z);
        if (goalH < 20) {
          this.plane.group.position.copy(nextPos);
          this.go('arrive');
          return;
        }
        // Only land to walk if intentionally descending onto genuinely flat dry terrain
        if (
          this.steerY < -0.22 &&
          nextPos.y <= maxNeedCenterY + 0.25 &&
          isFlatLandable(nextPos.x, nextPos.z) &&
          Math.abs(groundY - maxFloor) < 0.45
        ) {
          this.flightPitch = 0;
          this.flightRoll = 0;
          nextPos.y = groundY + 0.04;
          this.plane.group.position.copy(nextPos);
          this.plane.group.rotation.order = 'YXZ';
          this.plane.group.rotation.set(0, this.flightYaw, 0);
          this.plane.pos.copy(nextPos);
          this.girl.group.position.set(nextPos.x - 1.7, getWalkableY(nextPos.x - 1.7, nextPos.z), nextPos.z);
          resolveGirlCollisions(this.girl.group.position);
          this.girl.group.position.y = getWalkableY(this.girl.group.position.x, this.girl.group.position.z);
          this.girl.pos.copy(this.girl.group.position);
          this.go('walk');
          return;
        }
        // Otherwise skim smoothly over ridge/meadow
        nextPos.y = maxNeedCenterY + 0.08;
        this.flightPitch = Math.max(0.06, this.flightPitch);
      }
    }

    // Arrival check when gliding into hilltop lookout sanctuary
    if (Math.hypot(nextPos.x - GOAL_POS.x, nextPos.z - GOAL_POS.z) < 17.5 && Math.abs(nextPos.y - GOAL_POS.y) < 11.0) {
      this.plane.group.position.copy(nextPos);
      this.go('arrive');
      return;
    }

    this.flightRoll = damp(this.flightRoll, clamp(yawRate * 0.42, -0.45, 0.45), 6.0, dt);
    this.plane.group.position.copy(nextPos);
    this.plane.group.rotation.order = 'YXZ';
    this.plane.group.rotation.set(-this.flightPitch, this.flightYaw, -this.flightRoll);
    this.plane.update(this.t, this.flightSpeed, this.flightRoll);

    const seat = this.plane.seatWorld();
    this.girl.group.position.copy(seat);
    this.girl.group.rotation.copy(this.plane.group.rotation);
    this.girl.setPose('ride', dt, this.t, this.flightSpeed, this.flightRoll);

    this._updateMomentByPosition();
    this.rig.update(dt, this._shotRide(), 3.6);
  }

  _updateFloat(dt) {
    // Mid-air re-boarding: paper plane glides over to catch girl cleanly
    if (this.reboardMidair) {
      this.reboardT += dt;
      const u = clamp(this.reboardT / 0.85, 0, 1);
      const tgt = this.girl.pos.clone().add(V(0, -0.35, 0));
      this.plane.group.position.lerp(tgt, clamp(dt * 7.5, 0, 1));
      this.plane.group.lookAt(tgt.x + Math.sin(this.flightYaw), tgt.y, tgt.z + Math.cos(this.flightYaw));
      this.plane.update(this.t, 12, 0);
      this.girl.setPose('float', dt, this.t, 1.5, 0);
      if (u >= 1 || this.plane.group.position.distanceTo(tgt) < 0.75) {
        this.flightPitch = 0.08;
        this.go('ride');
        return;
      }
      this.rig.update(dt, this._shotFloat(), 3.2);
      return;
    }

    // Slow, luminous descent (~1.35 m/s downward — never fast fall!)
    this.steerX = damp(this.steerX, this.targetSteerX, 5.5, dt);
    this.steerY = damp(this.steerY, this.targetSteerY, 5.5, dt);

    const driftSpeed = 3.8;
    const vx = this.steerX * driftSpeed;
    const vz = this.steerY * driftSpeed + 0.6;
    const vy = -1.35;

    const gp = this.girl.group.position;
    gp.x += vx * dt;
    gp.y += vy * dt;
    gp.z += vz * dt;
    resolveGirlCollisions(gp);

    // Paper airplane circles gracefully nearby in the sky so she can re-board anytime
    this.circleAngle += dt * 0.62;
    const cx = gp.x + Math.cos(this.circleAngle) * 7.5;
    const cz = gp.z + Math.sin(this.circleAngle) * 7.5;
    const cy = Math.max(getSurfaceY(cx, cz) + 2.5, gp.y + 1.8);
    this.plane.group.position.lerp(V(cx, cy, cz), clamp(dt * 3.0, 0, 1));
    const tanYaw = Math.atan2(-Math.sin(this.circleAngle), Math.cos(this.circleAngle));
    this.plane.group.rotation.order = 'YXZ';
    this.plane.group.rotation.set(0, tanYaw, 0.22);
    this.plane.update(this.t, 8, 0.2);

    this.girl.yaw = damp(this.girl.yaw, Math.atan2(vx, vz + 0.01), 4, dt);
    this.girl.group.rotation.set(0, this.girl.yaw, 0);
    this.girl.setPose('float', dt, this.t, 1.4, 0);

    const surfY = getWalkableY(gp.x, gp.z);
    const waterY = getWaterY(gp.x, gp.z);
    if (gp.y <= surfY + 0.08) {
      if (waterY !== null && surfY < waterY - 0.05) {
        // Find nearest dry walkable terrace berm or meadow bank so she never stands in deep water
        let foundDry = false;
        for (let r = 1.5; r <= 14.0 && !foundDry; r += 1.5) {
          for (let a = 0; a < 12; a++) {
            const ang = (a / 12) * Math.PI * 2;
            const tx = gp.x + Math.cos(ang) * r;
            const tz = gp.z + Math.sin(ang) * r;
            if (getWaterY(tx, tz) === null) {
              gp.x = tx;
              gp.z = tz;
              gp.y = getWalkableY(tx, tz);
              foundDry = true;
              break;
            }
          }
        }
        if (!foundDry) gp.y = waterY + 0.05;
      } else {
        gp.y = surfY;
      }
      resolveGirlCollisions(gp);
      gp.y = getWalkableY(gp.x, gp.z);
      // Park plane smoothly on flat dry ground nearby so girl can walk & re-board
      let px = gp.x + 2.6;
      let pz = gp.z + 1.6;
      if (!isFlatLandable(px, pz)) {
        for (let r = 2.0; r <= 12.0; r += 1.5) {
          let found = false;
          for (let a = 0; a < 10; a++) {
            const ang = (a / 10) * Math.PI * 2;
            const tx = gp.x + Math.cos(ang) * r;
            const tz = gp.z + Math.sin(ang) * r;
            if (isFlatLandable(tx, tz)) {
              px = tx;
              pz = tz;
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
      const pClear = computePlaneClearance(V(px, 0, pz), this.girl.yaw, 0, 0, 0.04).maxNeedCenterY;
      this.plane.group.position.set(px, Math.max(getSurfaceY(px, pz) + 0.04, pClear), pz);
      this.plane.group.rotation.order = 'YXZ';
      this.plane.group.rotation.set(0, this.girl.yaw, 0);
      this.plane.pos.copy(this.plane.group.position);
      this.go('walk');
      return;
    }

    this.rig.update(dt, this._shotFloat(), 3.2);
  }

  _updateWalk(dt) {
    if (this.walkTarget) {
      const dx = this.walkTarget.x - this.girl.pos.x;
      const dz = this.walkTarget.z - this.girl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.25) {
        const spd = 2.9;
        this.walkSpeed = spd;
        this.girl.yaw = damp(this.girl.yaw, Math.atan2(dx, dz), 10, dt);
        this.girl.group.position.x += (dx / d) * spd * dt;
        this.girl.group.position.z += (dz / d) * spd * dt;
        resolveGirlCollisions(this.girl.group.position);
        this.girl.group.position.y = getWalkableY(this.girl.group.position.x, this.girl.group.position.z);
        this.girl.group.rotation.set(0, this.girl.yaw, 0);
        this.girl.setPose('walk', dt, this.t, spd);
      } else {
        this.walkTarget = null;
        this.walkSpeed = 0;
      }
    } else {
      this.walkSpeed = 0;
      this.girl.setPose('idle', dt, this.t, 0);
    }

    this.plane.update(this.t, 0.3, 0);
    this.rig.update(dt, this._shotWalk(), 2.6);
  }

  _updateArrive(dt) {
    const landSpot = this.lookout.planeLandSpot();
    const girlSpot = this.lookout.lookoutStandSpot();

    if (this.phase === 'touchdown') {
      const u = clamp(this.phaseT / 1.0, 0, 1);
      this.plane.group.position.lerp(landSpot.clone().add(V(0, 0.04, 0)), clamp(dt * 4.8, 0, 1));
      this.plane.group.rotation.order = 'YXZ';
      this.plane.group.rotation.x = damp(this.plane.group.rotation.x, 0, 6, dt);
      this.plane.group.rotation.y = damp(this.plane.group.rotation.y, -2.42, 5, dt);
      this.plane.group.rotation.z = damp(this.plane.group.rotation.z, 0, 6, dt);
      this.plane.update(this.t, 2, 0);

      const seat = this.plane.seatWorld();
      this.girl.group.position.copy(seat);
      this.girl.group.rotation.copy(this.plane.group.rotation);
      this.girl.setPose('ride', dt, this.t, 2, 0);

      if (u >= 1 && this.plane.group.position.distanceTo(landSpot) < 0.7) {
        this.phase = 'celebrate';
        this.phaseT = 0;
      }
    } else {
      this.plane.group.position.set(landSpot.x, landSpot.y + 0.04, landSpot.z);
      this.plane.group.rotation.order = 'YXZ';
      this.plane.group.rotation.set(0, -2.42, 0);
      this.plane.update(this.t, 0.2, 0);

      const u = clamp(this.phaseT / 0.68, 0, 1);
      if (u < 1) {
        this.girl.group.position.lerp(girlSpot, clamp(dt * 6.0, 0, 1));
        this.girl.yaw = damp(this.girl.yaw, Math.atan2(girlSpot.x - this.girl.pos.x, girlSpot.z - this.girl.pos.z), 7, dt);
        this.girl.group.rotation.set(0, this.girl.yaw, 0);
        this.girl.setPose('walk', dt, this.t, 2.4);
      } else {
        this.girl.group.position.copy(girlSpot);
        // Face 3/4 toward NE camera with the Satoyama valley behind her
        this.girl.yaw = damp(this.girl.yaw, 0.42, 6, dt);
        this.girl.group.rotation.set(0, this.girl.yaw, 0);
        this.girl.setPose('arrive', dt, this.t, 0);
      }
    }

    this.rig.update(dt, this._shotArrive(), 2.5);
  }

  // ------------------------------------------------------------------ SHOTS
  _shotGarden() {
    // Frame house engawa on right, girl & full paper plane (with full wingtip & ring margin) near center, and open valley ahead
    const pCenter = PLANE_LAND_YARD;
    const pts = [
      V(-5.2, HOME_POS.y + 3.0, 3.0),
      this.girl.pos.clone().add(V(0, 1.35, 0)),
      this.girl.pos.clone().add(V(0, -0.1, 0)),
      pCenter.clone().add(V(-2.6, 0.2, -2.0)),
      pCenter.clone().add(V(3.2, 0.8, 2.2)),
    ];
    return fitShot({
      points: pts,
      dir: this.ar(V(0.08, 0.16, -1.0), V(0.06, 0.15, -1.0)),
      fov: this.ar(54, 50),
      aspect: this.aspect(),
      margin: 0.16,
      lift: 0.25,
    });
  }

  _shotBoard() {
    const pp = this.plane.pos;
    const pts = [
      this.girl.pos.clone().add(V(0, 1.35, 0)),
      pp.clone().add(V(-1.9, 0.1, -1.6)),
      pp.clone().add(V(1.9, 0.8, 1.8)),
    ];
    return fitShot({
      points: pts,
      dir: this.ar(V(-0.35, 0.28, -1.0), V(-0.4, 0.24, -1.0)),
      fov: this.ar(48, 44),
      aspect: this.aspect(),
      margin: 0.2,
      anchor: pp,
      anchorId: 'board',
    });
  }

  _shotRide() {
    const pp = this.plane.pos;
    const camYOffset = clamp(0.22 - this.flightPitch * 0.55, 0.05, 0.30);
    const back = V(-Math.sin(this.flightYaw), camYOffset, -Math.cos(this.flightYaw)).normalize();
    const fwd = V(Math.sin(this.flightYaw), 0, Math.cos(this.flightYaw));
    const pts = [
      pp.clone().add(V(-1.95, -0.35, -1.75)),
      pp.clone().add(V(1.95, 1.25, 1.95)),
      this.girl.pos.clone().add(V(0, 1.05, 0)),
    ];
    const shot = fitShot({
      points: pts,
      dir: back,
      fov: this.ar(52, 48),
      aspect: this.aspect(),
      margin: 0.22,
      minDist: 7.4,
      lift: 0.45,
    });
    shot.tgt.addScaledVector(fwd, 1.4);
    shot.anchor = pp.clone();
    shot.anchorId = 'ride';
    return shot;
  }

  _shotFloat() {
    const gp = this.girl.pos;
    const pts = [
      gp.clone().add(V(-1.1, 2.05, -0.9)),
      gp.clone().add(V(1.1, -0.2, 0.9)),
    ];
    const shot = fitShot({
      points: pts,
      dir: this.ar(V(0.32, 0.12, -1.0), V(0.45, 0.1, -1.0)),
      fov: this.ar(48, 44),
      aspect: this.aspect(),
      margin: 0.24,
      minDist: 5.2,
      lift: 0.8,
    });
    shot.anchor = gp.clone();
    shot.anchorId = 'float';
    return shot;
  }

  _shotWalk() {
    const gp = this.girl.pos;
    const pp = this.plane.pos;
    const pts = [
      gp.clone().add(V(0, 1.35, 0)),
      gp.clone().add(V(0, -0.1, 0)),
    ];
    if (gp.distanceTo(pp) < 12) {
      pts.push(pp.clone().add(V(-1.8, 0.5, -1.5)), pp.clone().add(V(1.8, 0.5, 1.5)));
    }
    return fitShot({
      points: pts,
      dir: this.ar(V(-0.3, 0.28, -1.0), V(-0.38, 0.25, -1.0)),
      fov: this.ar(48, 44),
      aspect: this.aspect(),
      margin: 0.22,
      minDist: 5.5,
      lift: 0.35,
    });
  }

  _shotArrive() {
    // Hero celebratory framing from NE side: girl, full white paper plane, lookout deck, bell arbor & full yamabuki weathervane
    // elevated slightly so the Satoyama valley & gleaming mirror rice terraces unfold cleanly behind them!
    const landSpot = this.lookout.planeLandSpot();
    const girlSpot = this.lookout.lookoutStandSpot();
    const vaneTop = V(GOAL_POS.x + 5.4, GOAL_POS.y + 8.45, GOAL_POS.z + 1.8);
    const vaneBase = V(GOAL_POS.x + 5.4, GOAL_POS.y, GOAL_POS.z + 1.8);
    const arborTop = V(GOAL_POS.x - 7.4, GOAL_POS.y + 4.2, GOAL_POS.z + 1.2);
    const pts = [
      landSpot.clone().add(V(-2.2, 0.0, -2.0)),
      landSpot.clone().add(V(2.2, 0.8, 2.0)),
      girlSpot.clone().add(V(0, 1.45, 0)),
      girlSpot.clone().add(V(0, -0.1, 0)),
      arborTop,
      vaneBase,
      vaneTop,
    ];
    const shot = fitShot({
      points: pts,
      dir: this.ar(V(0.16, 0.25, 1.0), V(0.18, 0.23, 1.0)),
      fov: this.ar(52, 46),
      aspect: this.aspect(),
      margin: 0.15,
      lift: -0.35,
    });
    if (shot.pos.y < GOAL_POS.y + 6.0) shot.pos.y = GOAL_POS.y + 6.0;
    return shot;
  }

  // ------------------------------------------------------------------ INPUT
  _hitWalkableGround(p) {
    const ndc = new THREE.Vector2((p.x / this.g.vw) * 2 - 1, -(p.y / this.g.vh) * 2 + 1);
    this.ray.setFromCamera(ndc, this.g.camera);
    const ray = this.ray.ray;
    let prevT = 1.5;
    let prevD = ray.origin.y + ray.direction.y * prevT - getWalkableY(ray.origin.x + ray.direction.x * prevT, ray.origin.z + ray.direction.z * prevT);
    for (let t = 3.0; t <= 48; t += 1.2) {
      const qx = ray.origin.x + ray.direction.x * t;
      const qy = ray.origin.y + ray.direction.y * t;
      const qz = ray.origin.z + ray.direction.z * t;
      const d = qy - getWalkableY(qx, qz);
      if (d <= 0 && prevD > 0) {
        const u = prevD / (prevD - d);
        const tt = lerp(prevT, t, u);
        const x = ray.origin.x + ray.direction.x * tt;
        const z = ray.origin.z + ray.direction.z * tt;
        return V(x, getWalkableY(x, z), z);
      }
      prevT = t;
      prevD = d;
    }
    return null;
  }

  _tap(p) {
    const minDim = Math.min(this.g.vw, this.g.vh);

    if (this.state === 'garden') {
      // ONLY board when intentionally tapping near the paper airplane!
      const sc = this.screenPos(this.plane.seatWorld());
      if (sc.z < 1 && Math.hypot(p.x - sc.x, p.y - sc.y) < minDim * 0.21) {
        this.triggerBoard();
        return;
      }
      // Unrelated ground tap -> walk gently there; sky/corner tap -> no advance
      const hit = this._hitWalkableGround(p);
      if (hit && hit.z > -10 && hit.z < 22 && Math.abs(hit.x) < 16) {
        this.walkTarget = hit;
      }
      return;
    }

    if (this.state === 'ride') {
      const sc = this.screenPos(this.girl.pos.clone().add(V(0, 0.5, 0)));
      const psc = this.screenPos(this.plane.pos);
      if (
        (sc.z < 1 && Math.hypot(p.x - sc.x, p.y - sc.y) < minDim * 0.24) ||
        (psc.z < 1 && Math.hypot(p.x - psc.x, p.y - psc.y) < minDim * 0.20)
      ) {
        this.triggerDismount();
      }
      return;
    }

    if (this.state === 'float') {
      const bsc = this.screenPos(this.plane.pos);
      if ((bsc.z < 1 && Math.hypot(p.x - bsc.x, p.y - bsc.y) < minDim * 0.22) || p.y < this.g.vh * 0.28) {
        this.triggerCallOrBoard();
      }
      return;
    }

    if (this.state === 'walk') {
      const bsc = this.screenPos(this.plane.seatWorld());
      if (bsc.z < 1 && Math.hypot(p.x - bsc.x, p.y - bsc.y) < minDim * 0.22) {
        this.triggerCallOrBoard();
        return;
      }
      const hit = this._hitWalkableGround(p);
      if (hit) {
        this.walkTarget = hit;
      }
    }
  }

  _down(p) {
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
    const dragScale = Math.min(this.g.vw, this.g.vh) * 0.22;
    if (p.dist > 14) {
      this.targetSteerX = clamp(dx / dragScale, -1, 1);
      this.targetSteerY = clamp(-dy / dragScale, -1, 1);
    } else {
      const nx = (p.x / Math.max(1, this.g.vw)) * 2 - 1;
      const ny = -((p.y / Math.max(1, this.g.vh)) * 2 - 1);
      this.targetSteerX = clamp(nx * 1.15, -1, 1);
      this.targetSteerY = clamp(ny * 1.18, -1, 1);
    }
  }
}
