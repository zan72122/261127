import * as THREE from '../../lib/three.module.js';
import { COVE_POS, REEF_CENTER_POS, SANDBAR_MAIN_POS, WHALE_START_POS } from '../core/env.js';
import { clamp, wrapAngle } from '../core/math.js';

export class AutoTest {
  constructor(game) {
    this.g = game;
    this.elapsed = 0;
    this.stage = 'garden';
    this.stageT = 0;
    this.logTimer = 0;
    this.didWalk = false;
    this.didBoard = false;
    this.didSandWalk = false;
    this.didReboardSand = false;
    this.didReboardFloat = false;
    this.leapPeakReached = false;
    this.leapHoldT = 0;
    this.arriveHold = 0;
    window.__autolog = [];
    window.__autodone = false;
  }

  _next(s) {
    this.stage = s;
    this.stageT = 0;
  }

  _steerToward(tgt, pitchBias = 0) {
    const D = this.g.director;
    const w = this.g.whale;
    const dx = tgt.x - w.pos.x;
    const dz = tgt.z - w.pos.z;
    const aimYaw = Math.atan2(dx, dz);
    const diff = wrapAngle(D.rideYaw - aimYaw);
    D.targetSteerX = clamp(diff * 2.2, -0.95, 0.95);
    D.targetSteerY = pitchBias;
  }

  frame(dt) {
    if (window.__autodone) return;
    this.elapsed += dt;
    this.stageT += dt;
    const D = this.g.director;

    if (D.state === 'garden') {
      if (!this.didWalk && this.stageT >= 1.6) {
        this.didWalk = true;
        D.walkTarget = new THREE.Vector3(WHALE_START_POS.x, 0, 18.0);
      }
      if (!this.didBoard && this.stageT >= 3.4) {
        this.didBoard = true;
        D.triggerBoard();
        this._next('reef');
      }
    } else if (D.state === 'board') {
      // Wait for boarding transition
    } else if (D.state === 'ride') {
      if (this.stage === 'reef') {
        this._steerToward(REEF_CENTER_POS, 0);
        if (this.stageT >= 2.8) this._next('sandbar_approach');
      } else if (this.stage === 'sandbar_approach') {
        const edgeTarget = new THREE.Vector3(SANDBAR_MAIN_POS.x - 4.0, 0, SANDBAR_MAIN_POS.z - 14.0);
        this._steerToward(edgeTarget, -0.45);
        const dist = Math.hypot(this.g.whale.pos.x - SANDBAR_MAIN_POS.x, this.g.whale.pos.z - SANDBAR_MAIN_POS.z);
        if ((dist < 18.0 && this.g.whale.pos.y < 1.5) || this.stageT >= 12.0) {
          this.g.whale.pos.y = Math.min(this.g.whale.pos.y, 0.85);
          D.triggerDismount();
          this._next('sandbar_walk');
        }
      } else if (this.stage === 'leap') {
        if (!this.leapPeakReached) {
          D.targetSteerX = 0.15;
          D.targetSteerY = 0.96;
          if (this.g.whale.pos.y >= 4.4) {
            this.leapPeakReached = true;
            this.leapHoldT = 0;
          }
        } else {
          this.leapHoldT += dt;
          D.targetSteerX = 0.72;
          D.targetSteerY = 0.0;
          if (this.leapHoldT >= 1.4) {
            D.targetSteerX = 0;
            D.targetSteerY = 0;
            D.triggerDismount();
            this._next('float');
          }
        }
      } else if (this.stage === 'cove') {
        this._steerToward(COVE_POS, -0.4);
      }
    } else if (D.state === 'walk') {
      if (this.stage === 'sandbar_walk') {
        if (!this.didSandWalk && this.stageT >= 0.25) {
          this.didSandWalk = true;
          D.walkTarget = new THREE.Vector3(SANDBAR_MAIN_POS.x, 0, SANDBAR_MAIN_POS.z);
        }
        if (!this.didReboardSand && this.stageT >= 2.2) {
          this.didReboardSand = true;
          D.triggerCallOrBoard();
          this._next('leap');
        }
      }
    } else if (D.state === 'float') {
      if (!this.didReboardFloat && this.stageT >= 2.0) {
        this.didReboardFloat = true;
        D.triggerCallOrBoard();
        this._next('cove');
      }
    } else if (D.state === 'arrive') {
      this.arriveHold += dt;
      if (this.arriveHold >= 3.8) {
        window.__autodone = true;
      }
    }

    if (this.elapsed > 108 && !window.__autodone) {
      D.go('arrive');
      if (this.elapsed > 111) window.__autodone = true;
    }

    this.logTimer += dt;
    if (this.logTimer >= 0.5) {
      this.logTimer = 0;
      window.__autolog.push({
        t: Number(this.elapsed.toFixed(2)),
        moment: window.__moment,
        state: D.state,
        x: Number(this.g.girl.pos.x.toFixed(1)),
        y: Number(this.g.girl.pos.y.toFixed(1)),
        z: Number(this.g.girl.pos.z.toFixed(1)),
      });
    }
  }
}
