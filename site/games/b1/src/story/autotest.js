// Automated playthrough driver for ?autotest verification (Plan B)
// Exercises and logs: garden -> board -> village -> lake (detour + >=1.5s hold) -> aurora -> land (walk + reboard) -> float (>=1.8s slow descent + midair reboard) -> office (arrive >=1.8s hold)
import { BRIDGE_POS, FISHING_HUT_POS, OFFICE_POS, VILLAGE_POS } from '../core/env.js';
import { clamp, wrapAngle } from '../core/math.js';
import { getGroundY } from '../world/terrain.js';

export class AutoTest {
  constructor(game) {
    this.g = game;
    this.elapsed = 0;
    this.stageT = 0;
    this.logT = 0;
    this.stage = 'garden';

    this.didCornerTap = false;
    this.didPet = false;
    this.didBoard = false;
    this.didWalk = false;
    this.lakeHold = 0;

    window.__autolog = [];
    window.__autodone = false;
  }

  _setStage(s) {
    this.stage = s;
    this.stageT = 0;
  }

  _steerToward(tgt) {
    const D = this.g.director;
    const v = this.g.vehicle;
    const dx = tgt.x - v.pos.x;
    const dy = tgt.y - v.pos.y;
    const dh = Math.max(3, Math.hypot(dx, tgt.z - v.pos.z));
    const aimYaw = Math.atan2(dx, tgt.z - v.pos.z);
    const aimPitch = Math.atan2(dy, dh);
    const yawDiff = wrapAngle(aimYaw - D.yaw);
    D.targetSteerX = clamp(yawDiff * 1.9, -0.9, 0.9);
    D.targetSteerY = clamp((aimPitch - D.pitch) * 2.4, -0.85, 0.85);
  }

  frame(dt) {
    if (window.__autodone) return;
    this.elapsed += dt;
    this.stageT += dt;
    const D = this.g.director;
    const v = this.g.vehicle;
    const g = this.g.girl;

    // 1. GARDEN (hold >= 1.6s, verify corner walk doesn't board, then pet puppy & board)
    if (D.state === 'garden') {
      if (D.phase === 'meetPup') {
        if (!this.didCornerTap && D.phaseT >= 0.6) {
          this.didCornerTap = true;
          D.walkTarget = g.pos.clone().add({ x: -1.5, y: 0, z: 0.6 });
        } else if (!this.didPet && D.phaseT >= 1.8) {
          this.didPet = true;
          D.triggerGardenAction('puppy');
        }
      } else if (D.phase === 'waitBoard' && !this.didBoard && D.phaseT >= 1.2) {
        this.didBoard = true;
        D.triggerBoard();
        this._setStage('village');
      }
    }

    // 2. BOARD -> RIDE
    else if (D.state === 'board') {
      if (this.stage === 'garden') this._setStage('village');
    }

    // 3. RIDE STAGES
    else if (D.state === 'ride') {
      if (this.stage === 'garden') this._setStage('village');

      if (this.stage === 'village') {
        this._steerToward({ x: VILLAGE_POS.x, y: getGroundY(VILLAGE_POS.x, VILLAGE_POS.z) + 1.8, z: VILLAGE_POS.z + 18 });
        if (v.pos.z > 82 || this.stageT > 6.5) {
          this._setStage('lake');
        }
      } else if (this.stage === 'lake') {
        // Detour smoothly across bridgeIceDeck toward the ice-fishing hut on the frozen lake
        if (v.pos.z < BRIDGE_POS.z - 8) {
          this._steerToward({ x: BRIDGE_POS.x, y: getGroundY(BRIDGE_POS.x, BRIDGE_POS.z - 12) + 0.8, z: BRIDGE_POS.z - 6 });
        } else if (v.pos.z < BRIDGE_POS.z + 8) {
          this._steerToward({ x: BRIDGE_POS.x, y: 0.45, z: BRIDGE_POS.z + 10 });
        } else {
          this._steerToward({ x: FISHING_HUT_POS.x + 8, y: getGroundY(FISHING_HUT_POS.x, FISHING_HUT_POS.z) + 1.0, z: FISHING_HUT_POS.z - 6 });
        }
        if (window.__moment === 'lake') this.lakeHold += dt;
        if ((Math.hypot(v.pos.x - FISHING_HUT_POS.x, v.pos.z - FISHING_HUT_POS.z) < 22 && this.lakeHold >= 1.7) || this.stageT > 9.5) {
          this._setStage('land');
        }
      } else if (this.stage === 'land') {
        // Glide down onto snowy ground/lake edge and dismount on foot
        D.targetSteerX = 0.25;
        D.targetSteerY = -0.85;
        const gy = getGroundY(v.pos.x, v.pos.z);
        if (v.pos.y <= gy + 1.4 || this.stageT > 3.2) {
          v.pos.y = gy;
          D.triggerDismount();
        }
      } else if (this.stage === 'aurora_climb') {
        // Climb right onto the wide Aurora Sky-Road ribbon toward the northern ridge
        if (v.pos.z < 194) {
          this._steerToward({ x: -2, y: 17.2, z: 196 });
        } else {
          this._steerToward({ x: 2, y: 22.5, z: 235 });
        }
        if ((v.pos.y >= 17 && v.pos.z >= 198) || this.stageT > 6.5) {
          this._setStage('float_prep');
        }
      } else if (this.stage === 'float_prep') {
        D.targetSteerX = 0.0;
        D.targetSteerY = 0.55;
        if (v.pos.y >= 23 || this.stageT > 2.2) {
          this._setStage('float');
          D.triggerDismount();
        }
      } else if (this.stage === 'to_office') {
        this._steerToward({ x: OFFICE_POS.x, y: OFFICE_POS.y + 1.5, z: OFFICE_POS.z - 4 });
      }
    }

    // 4. WALK ON FOOT -> REBOARD
    else if (D.state === 'walk') {
      if (!this.didWalk && D.phaseT >= 0.8) {
        this.didWalk = true;
        D.walkTarget = g.pos.clone().add({ x: 2.2, y: 0, z: 2.2 });
      } else if (this.didWalk && D.phaseT >= 2.0 && !D.sleighRecall) {
        this._setStage('aurora_climb');
        D.triggerCallOrBoard();
      }
    }

    // 5. AERIAL FLOAT (>= 1.8s centered slow descent) -> MIDAIR REBOARD
    else if (D.state === 'float') {
      D.targetSteerX = 0.2;
      D.targetSteerY = 0.0;
      if (D.phaseT >= 2.0 && !D.reboardMidair) {
        this._setStage('to_office');
        D.triggerCallOrBoard();
      }
    }

    // 6. ARRIVE AT AURORA POST OFFICE (hold >= 2.4s so camera settles cleanly on final framing)
    else if (D.state === 'arrive') {
      if (D.arriveHold >= 2.4) {
        this._record();
        window.__autodone = true;
      }
    }

    // Safety ceiling well under 120s
    if (this.elapsed > 95 && !window.__autodone) {
      this._record();
      window.__autodone = true;
    }

    this.logT += dt;
    if (this.logT >= 0.25) {
      this.logT = 0;
      this._record();
    }
  }

  _record() {
    const D = this.g.director;
    const p = D.playerWorldPos();
    window.__autolog.push({
      t: +this.elapsed.toFixed(2),
      moment: window.__moment,
      state: D.state,
      phase: D.phase,
      stage: this.stage,
      speed: +D.speed.toFixed(2),
      yaw: +D.yaw.toFixed(3),
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
      z: +p.z.toFixed(2),
    });
  }
}
