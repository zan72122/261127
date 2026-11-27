import { BRIDGE_POS, GOAL_POS, MEADOW_LAND_POS, MILL_POS } from '../core/env.js';
import { clamp, wrapAngle } from '../core/math.js';
import { getGroundY, isFlatLandable } from '../world/terrain.js';

export class AutoTest {
  constructor(game) {
    this.g = game;
    this.elapsed = 0;
    this.stage = 'garden';
    this.stageT = 0;
    this.holdT = 0;

    this.didBoard = false;
    this.didWalk = false;
    this.didFloatReboard = false;
    this.thermalIdx = 0;
    this.wanderLeg = 0;

    window.__autolog = [];
    window.__autodone = false;
  }

  _setStage(next) {
    this.stage = next;
    this.stageT = 0;
    window.__autolog.push({ t: +this.elapsed.toFixed(2), stage: next, moment: window.__moment });
  }

  _steerToward(tgt) {
    const D = this.g.director;
    const p = this.g.plane.pos;
    const dx = tgt.x - p.x;
    const dy = tgt.y - p.y;
    const dh = Math.max(3, Math.hypot(dx, tgt.z - p.z));
    const aimYaw = Math.atan2(dx, tgt.z - p.z);
    const aimPitch = Math.atan2(dy, dh);
    const yawDiff = wrapAngle(aimYaw - D.flightYaw);
    D.targetSteerX = clamp(-yawDiff * 1.85, -0.92, 0.92);
    D.targetSteerY = clamp((aimPitch - D.flightPitch) * 2.2, -0.88, 0.88);
  }

  frame(dt) {
    if (window.__autodone) return;
    this.elapsed += dt;
    this.stageT += dt;

    const D = this.g.director;
    const p = this.g.plane.pos;

    // 1. Garden: hold >= 1.5s so landing paper plane & yard settle cleanly, then board
    if (D.state === 'garden') {
      if (D.phase === 'waiting' && !this.didBoard && D.phaseT >= 1.5) {
        this.didBoard = true;
        D.triggerBoard();
        this._setStage('board');
      }
      return;
    }

    if (D.state === 'board') {
      return;
    }

    // 2..6. Flight milestones
    if (D.state === 'ride') {
      if (this.stage === 'board') this._setStage('valley');

      if (this.stage === 'valley') {
        // Glide across stone bridge & circle gently past watermill
        if (this.wanderLeg === 0) {
          this._steerToward({ x: BRIDGE_POS.x, y: 12.0, z: BRIDGE_POS.z });
          if (this.stageT >= 2.6 || Math.hypot(p.x - BRIDGE_POS.x, p.z - BRIDGE_POS.z) < 16) {
            this.wanderLeg = 1;
          }
        } else {
          this._steerToward({ x: MILL_POS.x + 8, y: 14.5, z: MILL_POS.z + 6 });
          if (this.stageT >= 5.2 || Math.hypot(p.x - MILL_POS.x, p.z - MILL_POS.z) < 20) {
            this._setStage('thermal');
            this.thermalIdx = 0;
          }
        }
      } else if (this.stage === 'thermal') {
        // Pass through rising thermal rings up toward cumulus clouds and hold >= 1.8s
        const rings = this.g.thermalRings.waypoints;
        const tgt = rings[Math.min(this.thermalIdx, rings.length - 1)];
        this._steerToward(tgt);
        if (p.distanceTo(tgt) < 11.5 || this.stageT > 4.2 + this.thermalIdx * 3.5) {
          this.thermalIdx++;
          if (this.thermalIdx >= 4 && this.stageT >= 7.0) {
            this._setStage('terrace');
          }
        }
      } else if (this.stage === 'terrace') {
        // Sweep low over the mirror-like flooded rice terraces, hold >= 1.8s
        this._steerToward({ x: -12, y: 16.5, z: 186 });
        if (this.stageT >= 3.2) {
          this._setStage('land');
        }
      } else if (this.stage === 'land') {
        // Detour toward flat dry meadow near east footbridge & bamboo lane and descend gently to walk
        const landTgt = { x: MEADOW_LAND_POS.x, y: MEADOW_LAND_POS.y + 0.1, z: MEADOW_LAND_POS.z };
        this._steerToward(landTgt);
        D.targetSteerY = -0.55;
        if (this.stageT >= 3.5 && !this.didWalk) {
          // Ensure clean touchdown onto flat dry meadow
          const gy = getGroundY(p.x, p.z);
          const flat = isFlatLandable(p.x, p.z);
          if ((flat && p.y < gy + 3.0) || this.stageT >= 7.5) {
            this.didWalk = true;
            if (!flat) {
              p.x = MEADOW_LAND_POS.x;
              p.z = MEADOW_LAND_POS.z;
            }
            const dryY = getGroundY(p.x, p.z);
            this.g.plane.group.rotation.order = 'YXZ';
            this.g.plane.group.rotation.set(0, D.flightYaw, 0);
            this.g.plane.group.position.set(p.x, dryY + 0.04, p.z);
            this.g.plane.pos.copy(this.g.plane.group.position);
            D.triggerDismount();
          }
        }
      } else if (this.stage === 'climbForFloat') {
        D.targetSteerX = 0.0;
        D.targetSteerY = 0.72;
        if (this.stageT >= 2.4 && p.y > getGroundY(p.x, p.z) + 12.0) {
          this._setStage('float');
          D.triggerDismount();
        }
      } else if (this.stage === 'lookout') {
        // Climb cleanly above ridge crest first so approach looks down onto lookout sanctuary & clouds
        if (p.z < GOAL_POS.z - 26 && p.y < GOAL_POS.y + 6.5) {
          this._steerToward({ x: GOAL_POS.x, y: GOAL_POS.y + 10.0, z: GOAL_POS.z - 22 });
        } else {
          this._steerToward({ x: GOAL_POS.x, y: GOAL_POS.y + 1.5, z: GOAL_POS.z - 2 });
        }
      }
      return;
    }

    if (D.state === 'walk') {
      if (this.stage === 'land') {
        if (this.stageT < 0.8) {
          D.walkTarget = { x: this.g.girl.pos.x + 2.2, y: this.g.girl.pos.y, z: this.g.girl.pos.z + 2.2 };
        } else if (this.stageT >= 1.6) {
          D.triggerCallOrBoard();
          this._setStage('climbForFloat');
        }
      }
      return;
    }

    if (D.state === 'float') {
      // Hold slow luminous aerial descent >= 1.8s centered before mid-air re-board
      D.targetSteerX = 0.2;
      D.targetSteerY = 0.2;
      if (this.stageT >= 1.9 && !this.didFloatReboard) {
        this.didFloatReboard = true;
        D.triggerCallOrBoard();
        this._setStage('lookout');
      }
      return;
    }

    if (D.state === 'arrive') {
      if (this.stage !== 'arrive') this._setStage('arrive');
      this.holdT += dt;
      if (this.holdT >= 2.8) {
        window.__autodone = true;
        window.__autolog.push({ t: +this.elapsed.toFixed(2), stage: 'done', moment: window.__moment });
      }
    }
  }
}
