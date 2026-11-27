import { BRIDGE_POS, COVE_POS, LODGE_PIER_POS } from '../core/env.js';
import { clamp, wrapAngle } from '../core/math.js';
import { channelCenterX } from '../world/terrain.js';

export class AutoTest {
  constructor(game) {
    this.g = game;
    this.elapsed = 0;
    this.stage = 'garden';
    this.stageT = 0;
    this.logTimer = 0;

    this.didWalkPier = false;
    this.didBoard = false;
    this.didCoveWalk = false;
    this.lodgeHold = 0;

    window.__autolog = [];
    window.__autodone = false;
  }

  _setStage(next) {
    this.stage = next;
    this.stageT = 0;
  }

  _steerToward(tgt) {
    const D = this.g.director;
    const p = this.g.vehicle.pos;
    const dx = tgt.x - p.x;
    const dy = tgt.y - p.y;
    const dz = tgt.z - p.z;
    const dh = Math.max(3, Math.hypot(dx, dz));
    const aimYaw = Math.atan2(dx, dz);
    const aimPitch = Math.atan2(dy, dh);
    const yawDiff = wrapAngle(D.flightYaw - aimYaw);
    D.targetSteerX = clamp(yawDiff * 1.8, -0.9, 0.9);
    D.targetSteerY = clamp((aimPitch - D.flightPitch) * 2.1, -0.85, 0.85);
  }

  frame(dt) {
    if (window.__autodone) return;
    this.elapsed += dt;
    this.stageT += dt;
    const D = this.g.director;
    const p = this.g.vehicle.pos;

    // 1. GARDEN (hold >= 1.6s on initial yard/pier view, walk onto pier, then board)
    if (D.state === 'garden') {
      if (!this.didWalkPier && D.phaseT >= 1.6) {
        this.didWalkPier = true;
        D.walkTarget = { x: 0.2, y: 0.65, z: 7.5 };
      } else if (this.didWalkPier && !this.didBoard && D.phaseT >= 2.8) {
        this.didBoard = true;
        D.triggerBoard();
      }
    }

    // 2. BOARD -> TAKEOFF
    else if (D.state === 'board') {
      if (this.stage === 'garden') this._setStage('takeoff');
    }

    // 3..6. RIDE (Takeoff -> Canyon -> Bridge -> Cove Land -> Float -> Lodge)
    else if (D.state === 'ride') {
      if (this.stage === 'garden') this._setStage('takeoff');

      if (this.stage === 'takeoff') {
        // Plane skims water with spray & lifts off cleanly into autumn air
        D.targetSteerX = 0.04;
        D.targetSteerY = this.stageT < 1.1 ? 0.04 : 0.65;
        if (p.y >= 11 && p.z >= 90 && this.stageT >= 2.8) {
          this._setStage('canyon_circle');
        }
      } else if (this.stage === 'canyon_circle') {
        // Brief level circle over wide home cove, then line up cleanly with canyon centerline
        if (this.stageT < 0.9) {
          D.targetSteerX = 0.62;
          D.targetSteerY = 0.0;
        } else {
          this._steerToward({ x: channelCenterX(175), y: 14.5, z: 175 });
        }
        if (this.stageT >= 2.2 || p.z >= 158) {
          this._setStage('canyon');
        }
      } else if (this.stage === 'canyon') {
        // Fly cleanly down canyon centerline through autumn sunbeams toward bridge
        const aimZ = Math.min(BRIDGE_POS.z - 8, p.z + 36);
        this._steerToward({ x: channelCenterX(aimZ), y: 14.5, z: aimZ });
        if (p.z >= 244 || this.stageT >= 6.0) {
          this._setStage('bridge');
        }
      } else if (this.stage === 'bridge') {
        // Pass cleanly underneath the suspension bridge & past the waterfall
        this._steerToward({ x: channelCenterX(318), y: 12.0, z: 318 });
        if (p.z >= 312 || this.stageT >= 4.2) {
          this._setStage('cove_approach');
        }
      } else if (this.stage === 'cove_approach') {
        // Detour into the East Cove & touch down smoothly on water clear of pierCove before dismounting to walk
        this._steerToward({ x: 21.0, y: 0.0, z: 373.0 });
        if (this.stageT > 2.4 && p.y > 1.0) {
          D.targetSteerY = -0.68;
        }
        if (p.y < 0.8 && (Math.hypot(p.x - 21.0, p.z - 373.0) < 16 || this.stageT >= 3.4)) {
          this._setStage('land_cove');
          D.triggerDismount();
        } else if (this.stageT >= 5.5) {
          p.y = 0.1;
          this._setStage('land_cove');
          D.triggerDismount();
        }
      } else if (this.stage === 'climb_for_float') {
        this._steerToward({ x: 8, y: 24, z: 432 });
        D.targetSteerY = 0.78;
        if (p.y >= 20 || this.stageT >= 2.6) {
          this._setStage('float');
          D.triggerDismount();
        }
      } else if (this.stage === 'to_lodge') {
        const dH = Math.hypot(LODGE_PIER_POS.x - p.x, LODGE_PIER_POS.z - p.z);
        const aimY = dH > 50 ? 11.0 : 1.5;
        this._steerToward({ x: LODGE_PIER_POS.x, y: aimY, z: LODGE_PIER_POS.z });
      }
    }

    // 4. WALK ON COVE SHORE/PIER -> RE-BOARD
    else if (D.state === 'walk') {
      if (!this.didCoveWalk && this.stageT >= 0.8) {
        this.didCoveWalk = true;
        D.walkTarget = { x: this.g.girl.pos.x + 1.8, y: this.g.girl.pos.y, z: this.g.girl.pos.z + 1.4 };
      } else if (this.didCoveWalk && this.stageT >= 2.0) {
        this._setStage('climb_for_float');
        D.triggerCallOrBoard();
      }
    }

    // 5. SLOW LUMINOUS PARASOL DESCENT (hold >= 2.2s centered) -> MID-AIR RE-BOARD
    else if (D.state === 'float') {
      D.targetSteerX = 0.12;
      D.targetSteerY = 0.18;
      if (this.stageT >= 2.2) {
        this._setStage('to_lodge');
        D.triggerCallOrBoard();
      }
    }

    // 6. ARRIVE AT GLACIER LAKE LODGE (hold >= 2.8s so settled frame is held >= 1.5s)
    else if (D.state === 'arrive') {
      this.lodgeHold += dt;
      if (this.lodgeHold >= 2.8) {
        window.__autodone = true;
      }
    }

    // Safety finish cap well inside 120s
    if (this.elapsed >= 95 && D.state !== 'arrive') {
      D.go('arrive');
    }

    this.logTimer += dt;
    if (this.logTimer >= 1.0) {
      this.logTimer = 0;
      window.__autolog.push({
        t: Number(this.elapsed.toFixed(2)),
        stage: this.stage,
        moment: window.__moment,
        state: D.state,
        pos: [Number(p.x.toFixed(1)), Number(p.y.toFixed(1)), Number(p.z.toFixed(1))],
      });
    }
  }
}
