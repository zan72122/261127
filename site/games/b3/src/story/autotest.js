// Automated playthrough driver for ?autotest verification:
// Exercises all required moments & states within ~75s:
// 1. garden (>= 1.8s hold) -> tap goat/carpet -> board
// 2. village -> 3. oasis detour (>= 1.8s hold) -> 4. dunes low-altitude skim (>= 2.0s hold)
// 5. walk ground dismount & walking (>= 1.6s) -> reboard
// 6. stars high-altitude climb (>= 2.0s hold)
// 7. float aerial dismount & slow descent centered (>= 2.2s hold) -> mid-air reboard
// 8. observatory arrival beside Star Fountain (>= 2.2s hold) -> window.__autodone = true
import { OASIS_POS, OBSERVATORY_POS } from '../core/env.js';
import { clamp, wrapAngle } from '../core/math.js';
import { getSurfaceY } from '../world/terrain.js';

export class AutoTest {
  constructor(game) {
    this.g = game;
    this.elapsed = 0;
    this.logTimer = 0;
    this.stage = 'garden';
    this.stageT = 0;
    this.didBoard = false;
    this.didWalk = false;
    this.arriveHold = 0;
    this.oasisHold = 0;
    this.dunesHold = 0;
    this.starsHold = 0;

    window.__autolog = [];
    window.__autodone = false;
  }

  _setStage(next) {
    this.stage = next;
    this.stageT = 0;
  }

  _steerTo(tx, ty, tz) {
    const D = this.g.director;
    const c = this.g.carpet;
    const dx = tx - c.pos.x;
    const dy = ty - c.pos.y;
    const dz = tz - c.pos.z;
    const dh = Math.max(3, Math.hypot(dx, dz));
    const aimYaw = Math.atan2(dx, dz);
    const aimPitch = Math.atan2(dy, dh);
    const yawDiff = wrapAngle(aimYaw - D.flightYaw);
    D.targetSteerX = clamp(-yawDiff * 2.1, -0.95, 0.95);
    D.targetSteerY = clamp((aimPitch - D.flightPitch) * 2.2, -0.88, 0.88);
  }

  frame(dt) {
    if (window.__autodone) return;
    this.elapsed += dt;
    this.stageT += dt;

    const D = this.g.director;
    const c = this.g.carpet;

    if (D.state === 'garden') {
      if (!this.didBoard && D.phaseT >= 1.8) {
        this.didBoard = true;
        D.gardenBoarding = true;
        D.walkTarget = c.pos.clone().add({ x: -0.9, y: 0, z: -0.2 });
      }
    } else if (D.state === 'board') {
      if (this.stage === 'garden') this._setStage('village');
    } else if (D.state === 'ride') {
      if (this.stage === 'garden') this._setStage('village');

      if (this.stage === 'village') {
        this._steerTo(0, 8.8, 84);
        if (c.pos.z > 76 || this.stageT > 7.5) {
          this._setStage('oasis');
        }
      } else if (this.stage === 'oasis') {
        this._steerTo(OASIS_POS.x + 8, 8.2, OASIS_POS.z);
        if (window.__moment === 'oasis') this.oasisHold += dt;
        if ((this.oasisHold >= 1.9 && Math.hypot(c.pos.x - OASIS_POS.x, c.pos.z - OASIS_POS.z) < 28) || this.stageT > 9.5) {
          this._setStage('dunes');
        }
      } else if (this.stage === 'dunes') {
        const aheadX = clamp(c.pos.x + 12, -16, 16);
        const aheadZ = Math.min(315, c.pos.z + 32);
        const groundAhead = getSurfaceY(aheadX, aheadZ);
        this._steerTo(10, groundAhead + 1.8, Math.max(230, aheadZ));
        if (window.__moment === 'dunes') this.dunesHold += dt;
        if ((c.pos.z > 205 && this.dunesHold >= 2.2) || this.stageT > 11.5) {
          this._setStage('land_for_walk');
        }
      } else if (this.stage === 'land_for_walk') {
        const groundHere = getSurfaceY(c.pos.x, c.pos.z);
        this._steerTo(c.pos.x + 4, groundHere + 1.1, Math.min(310, c.pos.z + 24));
        const altAbove = c.pos.y - groundHere;
        if (altAbove <= 2.3 || this.stageT > 4.5) {
          this.didWalk = true;
          this._setStage('walk');
          if (altAbove > 2.4) c.pos.y = groundHere + 1.6;
          D.triggerDismount();
        }
      } else if (this.stage === 'stars') {
        this._steerTo(12, 58, Math.min(345, c.pos.z + 45));
        D.targetSteerY = 0.85;
        if (window.__moment === 'stars') this.starsHold += dt;
        if ((this.starsHold >= 2.1 && c.pos.y >= 49) || this.stageT > 9.5) {
          this._setStage('float');
          D.triggerDismount();
        }
      } else if (this.stage === 'to_observatory') {
        const land = this.g.observatory.landingSpot;
        const dH = Math.hypot(land.x - c.pos.x, land.z - c.pos.z);
        const aimZ = c.pos.z < land.z - 14 ? land.z - 5 : land.z;
        const aimY = dH > 32 ? OBSERVATORY_POS.y + 6.5 : OBSERVATORY_POS.y + 1.6;
        this._steerTo(land.x, aimY, aimZ);
      }
    } else if (D.state === 'walk') {
      D.targetSteerX = 0.25;
      D.targetSteerY = 0.45;
      if (D.phaseT >= 1.6 && !D.reboarding) {
        this._setStage('stars');
        D.triggerReboard();
      }
    } else if (D.state === 'float') {
      D.targetSteerX = 0.15;
      D.targetSteerY = 0;
      if (D.phaseT >= 2.2 && !D.reboarding) {
        this._setStage('to_observatory');
        D.triggerReboard();
      }
    } else if (D.state === 'arrive') {
      if (D.phaseT > 1.8) {
        this.arriveHold += dt;
        if (this.arriveHold >= 2.2) {
          this._record();
          window.__autodone = true;
        }
      }
    }

    if (this.elapsed > 105 && !window.__autodone) {
      this._record();
      window.__autodone = true;
    }

    this.logTimer += dt;
    if (this.logTimer >= 0.25) {
      this.logTimer = 0;
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
      stage: this.stage,
      speed: +this.g.carpet.speed.toFixed(2),
      yaw: +D.getQAState().yaw,
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
      z: +p.z.toFixed(2),
    });
  }
}
