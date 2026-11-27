import * as THREE from '../../lib/three.module.js';
import { OASIS_POS, OASIS_WATER_Y, OBSERVATORY_POS, PALETTE, shared } from '../core/env.js';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import { WordlessUI } from '../core/ui.js';
import { getGroundY, getSurfaceY, isOnOasisDock, isOverOasisWater } from '../world/terrain.js';
import { CameraRig, fitShot } from './camera.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v1 = new THREE.Vector3();

export class Director {
  constructor(game) {
    this.g = game;
    this.girl = game.girl;
    this.goat = game.goat;
    this.carpet = game.carpet;
    this.obs = game.observatory;
    this.colliders = game.colliders;
    this.rig = new CameraRig(game.camera);
    this.ray = new THREE.Raycaster();

    // State MUST always be one of: "garden" | "board" | "ride" | "walk" | "float" | "arrive"
    this.state = 'garden';
    this.t = 0;
    this.phaseT = 0;

    // 1-finger input & steering
    this.ptr = null;
    this.steerX = 0;
    this.steerY = 0;
    this.targetSteerX = 0;
    this.targetSteerY = 0;

    // Carpet flight physics
    this.flightYaw = 0;
    this.flightPitch = 0.08;
    this.flightSpeed = 0;
    this.skimFactor = 0;

    // Gentle 20s goal assist
    this.bestGoalDist = 9999;
    this.idleSeconds = 0;
    this.assistLatched = false;
    this.guideAlpha = 0;

    // Walk & Float helpers
    this.walkTarget = null;
    this.gardenBoarding = false;
    this.reboarding = false;
    this.reboardT = 0;
    this._trailTimer = 0;
    this._arriveAudioDone = false;

    this.ui = new WordlessUI((mode) => {
      if (mode === 'dismount') this.triggerDismount();
      else if (mode === 'call') this.triggerReboard();
    });

    const inp = game.input;
    inp.on('down', (p) => this._onDown(p));
    inp.on('move', (p) => this._onMove(p));
    inp.on('up', (p) => this._onUp(p));
    inp.on('tap', (p) => this._onTap(p));
    inp.on('first', () => game.audio.unlock());
    inp.on('gesture', () => {
      if (!game.audio.ctx || game.audio.ctx.state !== 'running') game.audio.unlock();
    });
  }

  aspect() {
    return this.g.vw / Math.max(1, this.g.vh);
  }

  setMoment(m) {
    window.__moment = m;
  }

  playerWorldPos() {
    return this.state === 'ride' ? this.carpet.pos : this.girl.pos;
  }

  getQAState() {
    const g = this.girl.pos;
    const v = this.carpet.pos;
    const isRide = this.state === 'ride';
    return {
      ready: Boolean(window.__ready),
      moment: window.__moment || 'garden',
      state: this.state,
      boarded: isRide,
      girl: { x: +g.x.toFixed(3), y: +g.y.toFixed(3), z: +g.z.toFixed(3) },
      vehicle: { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) },
      goal: {
        x: OBSERVATORY_POS.x,
        y: OBSERVATORY_POS.y,
        z: OBSERVATORY_POS.z,
        name: 'observatory',
      },
      yaw: +(isRide ? this.carpet.yaw : this.girl.yaw).toFixed(4),
      speed: +(isRide ? this.carpet.speed : this.girl.walkSpeed).toFixed(3),
      alt: +(isRide ? v.y : g.y).toFixed(3),
      idleSeconds: +this.idleSeconds.toFixed(2),
    };
  }

  _screenPos(worldVec) {
    const p = worldVec.clone().project(this.g.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.g.vw,
      y: (-p.y * 0.5 + 0.5) * this.g.vh,
      z: p.z,
    };
  }

  _carpetBounds(pos, yaw) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return [
      pos.clone().add(V(0, 1.32, 0)),
      pos.clone().add(V(0, -0.35, 0)),
      pos.clone().add(V(fx * 1.35, 0.1, fz * 1.35)),
      pos.clone().add(V(-fx * 1.45, 0.1, -fz * 1.45)),
      pos.clone().add(V(rx * 0.92, 0.1, rz * 0.92)),
      pos.clone().add(V(-rx * 0.92, 0.1, -rz * 0.92)),
    ];
  }

  go(name) {
    this.state = name;
    this.t = 0;
    this.phaseT = 0;
    this.ptr = null;
    this.steerX = 0;
    this.steerY = 0;
    this.targetSteerX = 0;
    this.targetSteerY = 0;

    if (name === 'garden') this._enterGarden();
    else if (name === 'board') this._enterBoard();
    else if (name === 'ride') this._enterRide();
    else if (name === 'float') this._enterFloat();
    else if (name === 'walk') this._enterWalk();
    else if (name === 'arrive') this._enterArrive();
  }

  // ------------------------------------------------------------------ GARDEN
  _enterGarden() {
    this.setMoment('garden');
    this.ui.setMode('none');
    this.gardenBoarding = false;
    this.walkTarget = null;
    this.idleSeconds = 0;
    this.assistLatched = false;
    this.guideAlpha = 0;
    shared.uAltitude.value = 0;
    shared.uNightMix.value = 0;

    const gx = -0.8, gz = 0.2;
    this.girl.pos.set(gx, getGroundY(gx, gz), gz);
    this.girl.yaw = 0.55;
    this.girl.pose = 'stand';
    this.girl.walkSpeed = 0;

    const cx = 1.45, cz = 3.2;
    this.carpet.pos.set(cx, getGroundY(cx, cz) + 0.08, cz);
    this.carpet.yaw = 0.05;
    this.carpet.pitch = 0;
    this.carpet.roll = 0;
    this.carpet.speed = 0;
    this.carpet.flightWave = 0;
    this.carpet.setInviteAlpha(1.0);

    const qx = 0.35, qz = 2.05;
    this.goat.pos.set(qx, getGroundY(qx, qz), qz);
    this.goat.yaw = -2.2;
    this.goat.mood = 'guide';
    this.goat.trotSpeed = 0;
    this.goat.setInviteAlpha(1.0);

    this.girl.lookTarget = this.goat.pos;
    this.rig.snap(this._shotGarden());
    this.g.audio.setAmbience({ wind: 0.08, skim: 0, star: 0 });
  }

  _shotGarden() {
    const pts = [
      this.girl.pos.clone().add(V(0, 1.38, 0)),
      this.girl.pos.clone().add(V(0, 0.0, 0)),
      this.goat.pos.clone().add(V(0, 0.65, 0)),
      this.carpet.pos.clone().add(V(0.8, 0.1, 1.1)),
      this.carpet.pos.clone().add(V(-0.8, 0.1, -1.1)),
    ];
    const tgt = V(0.55, 2.85, 3.0);
    const dir = V(-0.28, 0.13, -0.95).normalize();
    return fitShot({
      points: pts,
      target: tgt,
      dir,
      fov: 45,
      aspect: this.aspect(),
      margin: 0.16,
      minDist: 4.8,
    });
  }

  // ------------------------------------------------------------------ BOARD
  _enterBoard() {
    this.setMoment('board');
    this.ui.setMode('none');
    this.gardenBoarding = false;
    this.carpet.setInviteAlpha(0);
    this.goat.setInviteAlpha(0);
    this._boardGirlStart = this.girl.pos.clone();
    this._boardGoatStart = this.goat.pos.clone();
    this._boardCarpetStart = this.carpet.pos.clone();
    this.g.audio.bell(0);
  }

  // ------------------------------------------------------------------ RIDE
  _enterRide() {
    this.ui.setMode('dismount');
    this.reboarding = false;
    this.carpet.setInviteAlpha(0);
    this.goat.setInviteAlpha(0);
    this.carpet.flightWave = 1;
    this.flightYaw = this.carpet.yaw;
    this.flightPitch = clamp(this.carpet.pitch, -0.15, 0.28);
    this.flightSpeed = Math.max(12.2, this.carpet.speed);
    this.girl.pose = 'ride';
    this.girl.lookTarget = null;
    this.goat.mood = 'ride';
    this.bestGoalDist = Math.hypot(
      this.obs.landingSpot.x - this.carpet.pos.x,
      this.obs.landingSpot.z - this.carpet.pos.z
    );
    this.g.audio.launch();
  }

  _shotRide() {
    const c = this.carpet;
    const f = c.forwardDir(_v1);
    const skim = this.skimFactor || 0;
    const dir = V(-f.x * 0.94, 0.27 - skim * 0.08 - f.y * 0.15, -f.z * 0.94).normalize();
    const tgt = c.pos.clone().addScaledVector(f, 1.85).add(V(0, 0.62 - skim * 0.12, 0));
    const fov = 46 + clamp((c.speed - 11.5) * 0.72, 0, 10) + skim * 2.5;
    return {
      ...fitShot({
        points: this._carpetBounds(c.pos, c.yaw),
        target: tgt,
        dir,
        fov,
        aspect: this.aspect(),
        margin: 0.18,
        minDist: 4.5,
      }),
      anchor: c.pos.clone(),
      anchorId: 'carpetRide',
    };
  }

  // ------------------------------------------------------------------ FLOAT
  _enterFloat() {
    this.setMoment('float');
    this.ui.setMode('call');
    this.reboarding = false;
    this.girl.pose = 'float';
    this.girl.lookTarget = null;
    this.girl.walkSpeed = 0;
    this.girl.windSpeed = 2.0;
    this.carpet.flightWave = 0.55;
    this.g.audio.bell(0.1);
  }

  _shotFloat() {
    const g = this.girl.pos;
    const c = this.carpet.pos;
    const pts = [
      g.clone().add(V(0, 1.95, 0)),
      g.clone().add(V(0, -0.05, 0)),
      g.clone().add(V(-0.9, 1.35, 0)),
      g.clone().add(V(0.9, 1.35, 0)),
    ];
    if (g.distanceTo(c) < 8.5) {
      pts.push(c.clone().add(V(0.85, 0.2, 0.95)), c.clone().add(V(-0.85, -0.2, -0.95)));
    }
    const tgt = g.clone().add(V(0, 0.98, 0));
    const dir = V(0.30, 0.15, -0.94).normalize();
    return {
      ...fitShot({
        points: pts,
        target: tgt,
        dir,
        fov: 45,
        aspect: this.aspect(),
        margin: 0.18,
        minDist: 5.2,
      }),
      anchor: g.clone(),
      anchorId: 'girlFloat',
    };
  }

  // ------------------------------------------------------------------ WALK
  _enterWalk() {
    this.ui.setMode('call');
    this.reboarding = false;
    this.walkTarget = null;
    this.girl.pose = 'stand';
    this.girl.walkSpeed = 0;
    this.girl.windSpeed = 0.5;
    this.carpet.flightWave = 0.15;
    this.carpet.setInviteAlpha(0.7);
    this.goat.mood = 'guide';
  }

  _shotWalk() {
    const g = this.girl.pos;
    const c = this.carpet.pos;
    const pts = [
      g.clone().add(V(0, 1.4, 0)),
      g.clone(),
      c.clone().add(V(0.8, 0.2, 0.8)),
      c.clone().add(V(-0.8, 0.2, -0.8)),
    ];
    const distGC = g.distanceTo(c);
    const tgt = distGC < 12 ? g.clone().lerp(c, 0.35).add(V(0, 0.75, 0)) : g.clone().add(V(0, 0.8, 0));
    const usePts = distGC < 12 ? pts : [g.clone().add(V(0, 1.45, 0)), g.clone().add(V(0, -0.1, 0))];
    const f = V(Math.sin(this.girl.yaw), 0, Math.cos(this.girl.yaw));
    const dir = V(-f.x * 0.75 - 0.3, 0.32, -f.z * 0.75 - 0.3).normalize();
    return {
      ...fitShot({
        points: usePts,
        target: tgt,
        dir,
        fov: 45,
        aspect: this.aspect(),
        margin: 0.18,
        minDist: 4.8,
      }),
      anchor: g.clone(),
      anchorId: 'girlWalk',
    };
  }

  // ------------------------------------------------------------------ ARRIVE
  _enterArrive() {
    this.setMoment('observatory');
    this.ui.setMode('none');
    this.carpet.setInviteAlpha(0);
    this.goat.setInviteAlpha(0);
    this.guideAlpha = 0;
    this._arriveAudioDone = false;
    this._arriveCarpetStart = this.carpet.pos.clone();

    // Collision-free curved Bezier midpoint around Observatory Dome & Star Fountain toward landingSpot
    const landSpot = this.obs.landingSpot;
    const mid = this._arriveCarpetStart.clone().lerp(V(landSpot.x, landSpot.y + 1.4, landSpot.z), 0.5);
    const dome = this.obs.domePos;
    const dxD = mid.x - dome.x;
    const dzD = mid.z - dome.z;
    const distD = Math.hypot(dxD, dzD);
    if (distD < 8.6) {
      const ang = distD > 0.1 ? Math.atan2(dxD, dzD) : 0.45;
      mid.x = dome.x + Math.sin(ang) * 9.0;
      mid.z = dome.z + Math.cos(ang) * 9.0;
    }
    const fPos = this.obs.fountainPos;
    const dxF = mid.x - fPos.x;
    const dzF = mid.z - fPos.z;
    const distF = Math.hypot(dxF, dzF);
    if (distF < 4.6) {
      const ang = distF > 0.1 ? Math.atan2(dxF, dzF) : 1.0;
      mid.x = fPos.x + Math.sin(ang) * 4.8;
      mid.z = fPos.z + Math.cos(ang) * 4.8;
    }
    mid.y = Math.max(mid.y, landSpot.y + 2.2);
    this._arriveMid = mid;
  }

  _shotArrive() {
    const fPos = this.obs.fountainPos;
    const cPos = this.obs.landingSpot;
    const gPos = this.girl.pos;
    const qPos = this.goat.pos;
    const dPos = this.obs.domePos;

    // Frame Girl, Goat, Carpet & Star Fountain large in center-foreground, with entire Observatory Dome & beacon clean behind
    const pts = [
      gPos.clone().add(V(0, 1.65, 0)),
      gPos.clone(),
      qPos.clone().add(V(0, 0.75, 0)),
      cPos.clone().add(V(1.15, 0.3, 1.15)),
      cPos.clone().add(V(-1.15, 0.3, -1.15)),
      fPos.clone().add(V(-2.2, 2.75, 0)),
      fPos.clone().add(V(1.8, 0.2, -1.8)),
      dPos.clone().add(V(0, 9.2, 0)),
    ];
    const tgt = gPos.clone().lerp(fPos, 0.28).add(V(0.65, 1.35, 0.4));
    const dir = V(0.36, 0.14, -0.92).normalize();
    return fitShot({
      points: pts,
      target: tgt,
      dir,
      fov: 48,
      aspect: this.aspect(),
      margin: 0.14,
      minDist: 7.8,
    });
  }

  // ------------------------------------------------------------------ INPUT
  _onDown(p) {
    this.ptr = p;
  }

  _onMove(p) {
    this.ptr = p;
  }

  _onUp() {
    this.ptr = null;
    this.targetSteerX = 0;
    this.targetSteerY = 0;
  }

  _onTap(p) {
    const tapRadius = Math.max(60, Math.min(this.g.vw, this.g.vh) * 0.12);
    if (this.state === 'garden') {
      this._handleGardenTap(p);
    } else if (this.state === 'ride') {
      // Generous dismount tap detection on girl hitbox OR screen-space radius around girl/carpet center
      const ndc = new THREE.Vector2(p.nx, p.ny);
      this.ray.setFromCamera(ndc, this.g.camera);
      const hits = this.ray.intersectObject(this.girl.hitbox, false);
      if (hits.length > 0) {
        this.triggerDismount();
      } else {
        const sp = this._screenPos(this.girl.pos.clone().add(V(0, 0.65, 0)));
        if (sp.z < 1 && Math.hypot(sp.x - p.x, sp.y - p.y) < tapRadius) {
          this.triggerDismount();
        }
      }
    } else if (this.state === 'walk' || this.state === 'float') {
      const ndc = new THREE.Vector2(p.nx, p.ny);
      this.ray.setFromCamera(ndc, this.g.camera);
      const cHits = this.ray.intersectObject(this.carpet.hitbox, false);
      const sc = this._screenPos(this.carpet.pos);
      if (cHits.length > 0 || (sc.z < 1 && Math.hypot(sc.x - p.x, sc.y - p.y) < tapRadius)) {
        this.triggerReboard();
        return;
      }
      if (this.state === 'walk') {
        const gHits = this.ray.intersectObject(this.g.terrain.group, true);
        if (gHits.length > 0) {
          const pt = gHits[0].point;
          if (!isOverOasisWater(pt.x, pt.z)) {
            this.walkTarget = V(clamp(pt.x, -120, 120), pt.y, clamp(pt.z, -20, 410));
          }
        }
      }
    }
  }

  _handleGardenTap(p) {
    if (this.gardenBoarding) return;
    const ndc = new THREE.Vector2(p.nx, p.ny);
    this.ray.setFromCamera(ndc, this.g.camera);

    // 1. Intentional tap on goat or carpet triggers boarding walk
    const targets = [this.carpet.hitbox, this.goat.hitbox];
    const hits = this.ray.intersectObjects(targets, false);
    if (hits.length > 0) {
      this.gardenBoarding = true;
      this.walkTarget = this.carpet.pos.clone().add(V(-0.9, 0, -0.2));
      this.g.audio.bell(0);
      return;
    }

    // Screen-space hit on goat or carpet (well away from screen corners)
    const inviteRadius = Math.max(46, Math.min(this.g.vw, this.g.vh) * 0.08);
    for (const objPos of [this.goat.pos.clone().add(V(0, 0.35, 0)), this.carpet.pos]) {
      const sp = this._screenPos(objPos);
      if (sp.z < 1 && Math.hypot(sp.x - p.x, sp.y - p.y) < inviteRadius) {
        this.gardenBoarding = true;
        this.walkTarget = this.carpet.pos.clone().add(V(-0.9, 0, -0.2));
        this.g.audio.bell(0);
        return;
      }
    }

    // 2. Irrelevant corner / ground / sky tap: walk inside courtyard or short reaction only
    const gHits = this.ray.intersectObject(this.g.terrain.group, true);
    if (gHits.length > 0) {
      const pt = gHits[0].point;
      const wx = clamp(pt.x, -7.2, 6.2);
      const wz = clamp(pt.z, -4.5, 8.8);
      this.walkTarget = V(wx, getGroundY(wx, wz), wz);
    } else {
      const stepX = clamp(this.girl.pos.x + p.nx * 1.4, -6.5, 5.5);
      const stepZ = clamp(this.girl.pos.z + 1.2, -4.0, 8.2);
      this.walkTarget = V(stepX, getGroundY(stepX, stepZ), stepZ);
    }
  }

  triggerDismount() {
    if (this.state !== 'ride') return;
    const altAbove = this.carpet.pos.y - getSurfaceY(this.carpet.pos.x, this.carpet.pos.z);
    if (altAbove > 2.6) {
      // Mid-air slow canopy descent
      this.girl.pos.copy(this.carpet.pos).add(V(0, 0.35, 0));
      this.colliders.deflectAboveObstacles(this.girl.pos, 0.72, 2.2, 1.4);
      this.colliders.resolveCircle(this.girl.pos, 0.45, this.girl.pos.y, 1.48);
      this.girl.yaw = this.carpet.yaw;

      // Park carpet gracefully ahead-right inside frame, well clear of obstacles
      this.carpet.pos.x = clamp(this.carpet.pos.x - Math.cos(this.carpet.yaw) * 2.4 + Math.sin(this.carpet.yaw) * 1.1, -140, 140);
      this.carpet.pos.z = clamp(this.carpet.pos.z + Math.sin(this.carpet.yaw) * 2.4 + Math.cos(this.carpet.yaw) * 1.1, -20, 425);
      this.colliders.deflectAboveObstacles(this.carpet.pos, 1.56, 2.2, 1.6);
      this.colliders.resolveCircle(this.carpet.pos, 1.54, this.carpet.pos.y - 0.30, 1.45);
      this.carpet.speed = 0;
      this.go('float');
    } else {
      // Low altitude hop onto ground or dock
      let gx = clamp(this.carpet.pos.x - Math.cos(this.carpet.yaw) * 1.6, -135, 135);
      let gz = clamp(this.carpet.pos.z + Math.sin(this.carpet.yaw) * 1.6, -20, 420);
      this.girl.pos.set(gx, getGroundY(gx, gz), gz);
      this.colliders.resolveCircle(this.girl.pos, 0.44, this.girl.pos.y, 1.45);
      this.colliders.resolveOasisShore(this.girl.pos, 0.44);
      this.colliders.resolveCircle(this.girl.pos, 0.44, getGroundY(this.girl.pos.x, this.girl.pos.z), 1.45);
      this.girl.pos.y = isOnOasisDock(this.girl.pos.x, this.girl.pos.z)
        ? Math.max(getGroundY(this.girl.pos.x, this.girl.pos.z), OASIS_WATER_Y + 0.42)
        : getGroundY(this.girl.pos.x, this.girl.pos.z);
      this.girl.yaw = this.carpet.yaw;

      this.colliders.resolveCircle(this.carpet.pos, 1.54, getSurfaceY(this.carpet.pos.x, this.carpet.pos.z), 1.2);
      this.carpet.pos.y = getSurfaceY(this.carpet.pos.x, this.carpet.pos.z) + 0.42;
      this.carpet.pitch = 0;
      this.carpet.roll = 0;
      this.carpet.speed = 0;
      this.go('walk');
    }
  }

  triggerReboard() {
    if (this.state !== 'float' && this.state !== 'walk') return;
    if (this.reboarding) return;
    this.reboarding = true;
    this.reboardT = 0;
    this._reboardCarpetStart = this.carpet.pos.clone();
    this.g.audio.bell(0);
  }

  // ------------------------------------------------------------------ UPDATE
  update(dt) {
    this.t += dt;
    this.phaseT += dt;

    // Update 1-finger steering vector from drag OR held screen position
    if (this.ptr) {
      if (this.ptr.maxMove > 14) {
        this.targetSteerX = clamp(this.ptr.dx / 85, -1, 1);
        this.targetSteerY = clamp(-this.ptr.dy / 85, -1, 1);
      } else {
        const ax = Math.abs(this.ptr.nx);
        const ay = Math.abs(this.ptr.ny);
        this.targetSteerX = ax > 0.14 ? clamp((this.ptr.nx - Math.sign(this.ptr.nx) * 0.14) / 0.68, -1, 1) : 0;
        this.targetSteerY = ay > 0.14 ? clamp((this.ptr.ny - Math.sign(this.ptr.ny) * 0.14) / 0.68, -1, 1) : 0;
      }
    }
    this.steerX = damp(this.steerX, this.targetSteerX, 9, dt);
    this.steerY = damp(this.steerY, this.targetSteerY, 9, dt);

    if (this.state === 'garden') this._updateGarden(dt);
    else if (this.state === 'board') this._updateBoard(dt);
    else if (this.state === 'ride') this._updateRide(dt);
    else if (this.state === 'float') this._updateFloat(dt);
    else if (this.state === 'walk') this._updateWalk(dt);
    else if (this.state === 'arrive') this._updateArrive(dt);

    // Dusk -> starry night transition with altitude and forward desert progression
    const activeY = this.playerWorldPos().y;
    const activeZ = this.playerWorldPos().z;
    const altMix = smoothstep(24, 54, activeY);
    const progMix = smoothstep(140, 350, activeZ) * 0.94;
    shared.uAltitude.value = damp(shared.uAltitude.value, altMix, 2.5, dt);
    shared.uNightMix.value = damp(shared.uNightMix.value, clamp(Math.max(altMix, progMix), 0, 1), 2.0, dt);

    this.girl.update(dt);
    this.goat.update(dt);
    this.carpet.update(dt);
    this.g.audio.update(dt);
  }

  _updateGarden(dt) {
    this.setMoment('garden');
    const swayX = 0.35 + Math.sin(this.t * 1.4) * 0.28;
    const swayZ = 2.05 + Math.cos(this.t * 1.4) * 0.18;
    const dxG = swayX - this.goat.pos.x;
    const dzG = swayZ - this.goat.pos.z;
    this.goat.pos.set(swayX, getGroundY(swayX, swayZ), swayZ);
    this.goat.trotSpeed = Math.hypot(dxG, dzG) / Math.max(0.001, dt);
    const lookC = this.carpet.pos;
    this.goat.yaw = Math.atan2(lookC.x - swayX, lookC.z - swayZ);

    if (this.walkTarget) {
      const dx = this.walkTarget.x - this.girl.pos.x;
      const dz = this.walkTarget.z - this.girl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.25) {
        const sp = 2.8;
        this.girl.pos.x += (dx / d) * sp * dt;
        this.girl.pos.z += (dz / d) * sp * dt;
        this.colliders.resolveCircle(this.girl.pos, 0.42, this.girl.pos.y, 1.4);
        this.girl.pos.y = getGroundY(this.girl.pos.x, this.girl.pos.z);
        this.girl.yaw = damp(this.girl.yaw, Math.atan2(dx, dz), 10, dt);
        this.girl.pose = 'walk';
        this.girl.walkSpeed = sp;
      } else {
        this.walkTarget = null;
        this.girl.pose = 'stand';
        this.girl.walkSpeed = 0;
        if (this.gardenBoarding) {
          this.go('board');
          return;
        }
      }
    } else {
      this.girl.pose = 'stand';
      this.girl.walkSpeed = 0;
    }

    this.rig.update(dt, this._shotGarden(), 2.2);
  }

  _updateBoard(dt) {
    this.setMoment('board');
    const p = clamp(this.phaseT / 1.15, 0, 1);
    const e = p * p * (3 - 2 * p);

    const cLift = this._boardCarpetStart.clone().add(V(0, 1.45 * e, 1.2 * e));
    this.carpet.pos.copy(cLift);
    this.carpet.flightWave = e;
    this.carpet.yaw = damp(this.carpet.yaw, 0.04, 5, dt);

    const riderWorld = this.carpet.riderOffset.clone().applyEuler(this.carpet.group.rotation).add(this.carpet.pos);
    this.girl.pos.lerpVectors(this._boardGirlStart, riderWorld, e);
    this.girl.pos.y += Math.sin(e * Math.PI) * 0.45;
    this.girl.yaw = damp(this.girl.yaw, this.carpet.yaw, 8, dt);
    this.girl.pose = e > 0.55 ? 'ride' : 'walk';
    this.girl.walkSpeed = e > 0.55 ? 0 : 2.2;

    const goatWorld = this.carpet.goatOffset.clone().applyEuler(this.carpet.group.rotation).add(this.carpet.pos);
    this.goat.pos.lerpVectors(this._boardGoatStart, goatWorld, e);
    this.goat.pos.y += Math.sin(e * Math.PI) * 0.55;
    this.goat.yaw = this.carpet.yaw;
    this.goat.mood = e > 0.6 ? 'ride' : 'guide';

    this.rig.update(dt, this._shotRide(), 2.4);
    if (p >= 1) this.go('ride');
  }

  _updateRide(dt) {
    const c = this.carpet;
    const landTarget = this.obs.landingSpot;
    const gx = landTarget.x - c.pos.x;
    const gz = landTarget.z - c.pos.z;
    const goalDist = Math.hypot(gx, gz);
    const goalYaw = Math.atan2(gx, gz);

    // Track progress & gentle ~20s assist for a 5-year-old tapping aimlessly or idle
    if (goalDist < this.bestGoalDist - 0.6) {
      this.bestGoalDist = goalDist;
      this.idleSeconds = Math.max(0, this.idleSeconds - dt * 4.0);
    } else {
      const manualActive = Math.hypot(this.steerX, this.steerY) > 0.18;
      this.idleSeconds += dt * (manualActive ? 0.72 : 1.0);
    }
    if (this.idleSeconds >= 19.0) {
      this.assistLatched = true;
    }
    if (Math.hypot(this.steerX, this.steerY) > 0.45) {
      this.assistLatched = false;
    }

    const assistStrength = this.assistLatched || this.idleSeconds >= 19.0
      ? smoothstep(18.5, 22.0, Math.max(this.idleSeconds, this.assistLatched ? 22.0 : 0))
      : 0;
    this.guideAlpha = damp(this.guideAlpha, assistStrength, 3, dt);

    // Yaw & Pitch control (rate tuned for wide left/right turns and smooth constant-altitude circling)
    const manualYawRate = -this.steerX * 0.74;
    const yawDiffToGoal = wrapAngle(goalYaw - this.flightYaw);
    const assistYawRate = assistStrength * clamp(yawDiffToGoal * 1.25, -0.78, 0.78);
    this.flightYaw = wrapAngle(this.flightYaw + (manualYawRate * (1 - assistStrength * 0.65) + assistYawRate) * dt);

    const surfY = getSurfaceY(c.pos.x, c.pos.z);
    const altAbove = c.pos.y - surfY;

    let targetPitch = this.steerY * 0.54;
    if (Math.abs(this.steerY) < 0.08) {
      targetPitch = 0;
      if (assistStrength > 0.1) {
        const idealY = goalDist > 30
          ? Math.max(surfY + 7.5, OBSERVATORY_POS.y + 4.5)
          : OBSERVATORY_POS.y + 2.8;
        targetPitch = clamp((idealY - c.pos.y) * 0.05, -0.28, 0.36) * assistStrength;
      }
    }
    this.flightPitch = damp(this.flightPitch, targetPitch, 5.5, dt);

    // Smooth dune-skimming speed surge when gliding low over sweeping dunes
    const duneProgress = c.pos.z > 95 ? smoothstep(95, 118, c.pos.z) : 0;
    const skimFactor = duneProgress * (1 - smoothstep(2.2, 6.8, altAbove));
    this.skimFactor = damp(this.skimFactor, skimFactor, 5, dt);
    const baseAirSpeed = 13.0 + clamp((c.pos.y - 12) * 0.06, 0, 2.8);
    const targetSpeed = lerp(baseAirSpeed, 22.0, this.skimFactor);
    this.flightSpeed = damp(this.flightSpeed, targetSpeed, 3.0, dt);

    // Advance position
    const cp = Math.cos(this.flightPitch);
    const vx = Math.sin(this.flightYaw) * cp * this.flightSpeed;
    const vy = Math.sin(this.flightPitch) * this.flightSpeed;
    const vz = Math.cos(this.flightYaw) * cp * this.flightSpeed;

    c.pos.x = clamp(c.pos.x + vx * dt, -145, 145);
    c.pos.z = clamp(c.pos.z + vz * dt, -22, 435);
    c.pos.y = clamp(c.pos.y + vy * dt, 1.0, 92.0);

    // Rigid collider, roof-deflection & terrain/water clearance guard (zero solid-clip & zero fuzz)
    const minYPre = getSurfaceY(c.pos.x, c.pos.z) + 0.98;
    if (c.pos.y < minYPre) {
      c.pos.y = minYPre;
      if (this.flightPitch < 0) this.flightPitch = damp(this.flightPitch, 0.02, 8, dt);
    }

    this.colliders.deflectAboveObstacles(c.pos, 1.56, 2.2, 0.42);
    const hit = this.colliders.resolveCircle(c.pos, 1.54, c.pos.y - 0.30, 1.45);
    if (hit.pushed && Math.abs(this.steerX) < 0.25) {
      const tx1 = -hit.nz, tz1 = hit.nx;
      const fx = Math.sin(this.flightYaw), fz = Math.cos(this.flightYaw);
      const sign = fx * tx1 + fz * tz1 >= 0 ? 1 : -1;
      const slideYaw = Math.atan2(tx1 * sign, tz1 * sign);
      this.flightYaw = wrapAngle(this.flightYaw + wrapAngle(slideYaw - this.flightYaw) * Math.min(1, dt * 3.5));
    }

    const minYPost = getSurfaceY(c.pos.x, c.pos.z) + 0.98;
    if (c.pos.y < minYPost) {
      c.pos.y = minYPost;
      this.colliders.resolveCircle(c.pos, 1.54, c.pos.y - 0.30, 1.45);
      if (this.flightPitch < 0) this.flightPitch = damp(this.flightPitch, 0.02, 8, dt);
    }

    c.yaw = this.flightYaw;
    c.pitch = this.flightPitch;
    c.roll = damp(c.roll, this.steerX * 0.34, 7, dt);
    c.speed = this.flightSpeed;

    // Seat girl & goat cleanly on carpet
    this.girl.pos.copy(c.riderOffset).applyEuler(c.group.rotation).add(c.pos);
    this.girl.yaw = c.yaw;
    this.girl.pose = 'ride';
    this.girl.windSpeed = c.speed;

    this.goat.pos.copy(c.goatOffset).applyEuler(c.group.rotation).add(c.pos);
    this.goat.yaw = c.yaw;
    this.goat.mood = 'ride';

    // Update window.__moment dynamically
    const od = Math.hypot(c.pos.x - OASIS_POS.x, c.pos.z - OASIS_POS.z);
    if (c.pos.y > 46 || altAbove > 30) {
      this.setMoment('stars');
    } else if (od < 42) {
      this.setMoment('oasis');
    } else if (c.pos.z < 88) {
      this.setMoment('village');
    } else if (c.pos.z < 355) {
      this.setMoment('dunes');
    } else {
      this.setMoment('observatory');
    }

    // Emit stardust & dual low-dune golden sand wake
    this._trailTimer += dt;
    if (this._trailTimer > 0.03) {
      this._trailTimer = 0;
      const f = c.forwardDir(_v1);
      const tail = c.pos.clone().addScaledVector(f, -1.05);
      const col = this.skimFactor > 0.35 ? '#f4cf82' : (c.pos.y > 40 ? PALETTE.turquoiseGlow : PALETTE.saffron);
      this.g.trail.emit(tail, -f.x * 1.6, this.skimFactor > 0.35 ? 0.55 : 0.1, -f.z * 1.6, col, this.skimFactor > 0.35 ? 0.95 : 1.35);
      if (this.skimFactor > 0.25) {
        const rx = Math.cos(c.yaw) * 0.55;
        const rz = -Math.sin(c.yaw) * 0.55;
        for (const s of [-1, 1]) {
          const sandPos = V(tail.x + rx * s, getSurfaceY(tail.x + rx * s, tail.z + rz * s) + 0.16, tail.z + rz * s);
          this.g.trail.emit(sandPos, -f.x * 2.2 + rx * s * 1.4, 1.3 + Math.random() * 0.8, -f.z * 2.2 + rz * s * 1.4, '#e5c188', 0.82);
        }
      }
    }

    this.g.audio.setAmbience({
      wind: 0.14 + clamp(c.speed / 22, 0, 0.28),
      skim: this.skimFactor * 0.45,
      star: smoothstep(30, 52, c.pos.y),
    });

    this.rig.update(dt, this._shotRide(), 2.6);

    // Arrival check at hilltop observatory courtyard beside Star Fountain (never on top of dome)
    const dLanding = Math.hypot(landTarget.x - c.pos.x, landTarget.z - c.pos.z);
    const dDome = Math.hypot(this.obs.domePos.x - c.pos.x, this.obs.domePos.z - c.pos.z);
    const dPlaza = Math.hypot(OBSERVATORY_POS.x - c.pos.x, OBSERVATORY_POS.z - c.pos.z);
    if (dPlaza < 22 && c.pos.y > OBSERVATORY_POS.y + 8.5 && Math.abs(this.steerY) < 0.25) {
      this.flightPitch = damp(this.flightPitch, -0.30, 3.0, dt);
    }
    if (
      c.pos.y <= OBSERVATORY_POS.y + 8.5 &&
      dDome > 7.4 &&
      ((dLanding < 10.2 && c.pos.z <= landTarget.z + 3.2) || dLanding < 6.4)
    ) {
      this.go('arrive');
    }
  }

  _updateFloat(dt) {
    this.setMoment('float');
    const g = this.girl;

    if (this.reboarding) {
      this.reboardT += dt / 0.85;
      const p = clamp(this.reboardT, 0, 1);
      const target = g.pos.clone().add(V(0, -0.35, 0));
      target.y = Math.max(target.y, getSurfaceY(g.pos.x, g.pos.z) + 0.98);
      this.carpet.pos.lerpVectors(this._reboardCarpetStart, target, p * p * (3 - 2 * p));
      this.colliders.resolveCircle(this.carpet.pos, 1.54, this.carpet.pos.y - 0.30, 1.45);
      this.carpet.yaw = damp(this.carpet.yaw, g.yaw, 8, dt);
      if (p >= 1) {
        this.go('ride');
        return;
      }
    } else {
      const driftSpeed = 4.2;
      if (Math.hypot(this.steerX, this.steerY) > 0.12) {
        g.yaw = wrapAngle(g.yaw - this.steerX * 1.4 * dt);
        g.pos.x = clamp(g.pos.x + Math.sin(g.yaw) * driftSpeed * dt, -140, 140);
        g.pos.z = clamp(g.pos.z + Math.cos(g.yaw) * driftSpeed * dt, -20, 420);
      }
      g.pos.y -= 1.55 * dt;
      this.colliders.deflectAboveObstacles(g.pos, 0.72, 2.2, 0.40);
      this.colliders.resolveCircle(g.pos, 0.45, g.pos.y, 1.48);

      const deckY = isOnOasisDock(g.pos.x, g.pos.z)
        ? Math.max(getGroundY(g.pos.x, g.pos.z), OASIS_WATER_Y + 0.42)
        : getGroundY(g.pos.x, g.pos.z);
      if (g.pos.y <= deckY + 0.16) {
        this.colliders.resolveOasisShore(g.pos, 0.48);
        this.colliders.resolveCircle(g.pos, 0.45, getGroundY(g.pos.x, g.pos.z), 1.48);
        this.colliders.resolveOasisShore(g.pos, 0.48);
        g.pos.y = isOnOasisDock(g.pos.x, g.pos.z)
          ? Math.max(getGroundY(g.pos.x, g.pos.z), OASIS_WATER_Y + 0.42)
          : getGroundY(g.pos.x, g.pos.z);

        this.carpet.pos.set(
          clamp(g.pos.x + 2.2, -135, 135),
          getSurfaceY(g.pos.x + 2.2, g.pos.z + 1.2) + 0.42,
          clamp(g.pos.z + 1.2, -20, 420)
        );
        this.colliders.resolveCircle(this.carpet.pos, 1.54, getSurfaceY(this.carpet.pos.x, this.carpet.pos.z), 1.2);
        this.carpet.pos.y = getSurfaceY(this.carpet.pos.x, this.carpet.pos.z) + 0.42;
        this.carpet.pitch = 0;
        this.carpet.roll = 0;
        this.go('walk');
        return;
      }

      this.carpet.pos.y = damp(this.carpet.pos.y, g.pos.y + 0.45 + Math.sin(this.t * 2) * 0.25, 2.5, dt);
      this.colliders.deflectAboveObstacles(this.carpet.pos, 1.56, 2.2, 0.38);
      this.colliders.resolveCircle(this.carpet.pos, 1.54, this.carpet.pos.y - 0.30, 1.45);
      this.goat.pos.copy(this.carpet.goatOffset).applyEuler(this.carpet.group.rotation).add(this.carpet.pos);
      this.goat.yaw = this.carpet.yaw;

      this._trailTimer += dt;
      if (this._trailTimer > 0.08) {
        this._trailTimer = 0;
        this.g.trail.emit(g.pos.clone().add(V(0, 1.5, 0)), (Math.random() - 0.5) * 0.5, 0.25, (Math.random() - 0.5) * 0.5, PALETTE.saffron, 1.0);
      }
    }

    this.g.audio.setAmbience({ wind: 0.10, skim: 0, star: 0.35 });
    this.rig.update(dt, this._shotFloat(), 2.8);
  }

  _updateWalk(dt) {
    const g = this.girl;
    const od = Math.hypot(g.pos.x - OASIS_POS.x, g.pos.z - OASIS_POS.z);
    const md = Math.hypot(g.pos.x - OBSERVATORY_POS.x, g.pos.z - OBSERVATORY_POS.z);
    this.setMoment(md < 38 ? 'observatory' : od < 42 ? 'oasis' : g.pos.z < 88 ? 'village' : 'dunes');

    if (this.reboarding) {
      this.reboardT += dt / 0.85;
      const p = clamp(this.reboardT, 0, 1);
      const target = g.pos.clone().add(V(0, 1.05, 0));
      this.carpet.pos.lerpVectors(this._reboardCarpetStart, target, p * p * (3 - 2 * p));
      this.colliders.resolveCircle(this.carpet.pos, 1.54, this.carpet.pos.y - 0.30, 1.45);
      this.carpet.yaw = damp(this.carpet.yaw, g.yaw, 8, dt);
      g.pos.y = lerp(getGroundY(g.pos.x, g.pos.z), target.y, p);
      if (p >= 1) {
        this.go('ride');
        return;
      }
    } else {
      let vx = 0, vz = 0;
      const sp = 3.4;
      if (Math.hypot(this.steerX, this.steerY) > 0.2) {
        this.walkTarget = null;
        g.yaw = wrapAngle(g.yaw - this.steerX * 1.6 * dt);
        const fwd = clamp(this.steerY + 0.5, 0, 1);
        vx = Math.sin(g.yaw) * sp * fwd;
        vz = Math.cos(g.yaw) * sp * fwd;
      } else if (this.walkTarget) {
        const dx = this.walkTarget.x - g.pos.x;
        const dz = this.walkTarget.z - g.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          vx = (dx / d) * sp;
          vz = (dz / d) * sp;
          g.yaw = damp(g.yaw, Math.atan2(dx, dz), 10, dt);
        } else {
          this.walkTarget = null;
        }
      }

      const speed = Math.hypot(vx, vz);
      if (speed > 0.1) {
        g.pos.x = clamp(g.pos.x + vx * dt, -135, 135);
        g.pos.z = clamp(g.pos.z + vz * dt, -20, 420);
        this.colliders.resolveCircle(g.pos, 0.44, g.pos.y, 1.45);
        this.colliders.resolveOasisShore(g.pos, 0.44);
        this.colliders.resolveCircle(g.pos, 0.44, getGroundY(g.pos.x, g.pos.z), 1.45);
        g.pos.y = isOnOasisDock(g.pos.x, g.pos.z)
          ? Math.max(getGroundY(g.pos.x, g.pos.z), OASIS_WATER_Y + 0.42)
          : getGroundY(g.pos.x, g.pos.z);
        g.pose = 'walk';
        g.walkSpeed = speed;
      } else {
        g.pose = 'stand';
        g.walkSpeed = 0;
      }

      this.carpet.pos.y = getSurfaceY(this.carpet.pos.x, this.carpet.pos.z) + 0.42 + Math.sin(this.t * 2.2) * 0.06;
      this.colliders.resolveCircle(this.carpet.pos, 1.54, getSurfaceY(this.carpet.pos.x, this.carpet.pos.z), 1.2);
      this.goat.pos.copy(this.carpet.goatOffset).applyEuler(this.carpet.group.rotation).add(this.carpet.pos);
      this.goat.yaw = this.carpet.yaw;
      this.goat.mood = 'ride';
    }

    this.g.audio.setAmbience({ wind: 0.08, skim: 0, star: 0.15 });
    this.rig.update(dt, this._shotWalk(), 2.4);
  }

  _updateArrive(dt) {
    this.setMoment('observatory');
    const p = clamp(this.phaseT / 1.8, 0, 1);
    const e = p * p * (3 - 2 * p);

    // Quadratic Bezier glide to landingSpot beside Star Fountain (with collider guard)
    const landSpot = this.obs.landingSpot;
    const endPos = V(landSpot.x, landSpot.y + 0.22, landSpot.z);
    const inv = 1 - e;
    this.carpet.pos.set(
      inv * inv * this._arriveCarpetStart.x + 2 * inv * e * this._arriveMid.x + e * e * endPos.x,
      inv * inv * this._arriveCarpetStart.y + 2 * inv * e * this._arriveMid.y + e * e * endPos.y,
      inv * inv * this._arriveCarpetStart.z + 2 * inv * e * this._arriveMid.z + e * e * endPos.z
    );
    this.colliders.resolveCircle(this.carpet.pos, 1.54, this.carpet.pos.y - 0.30, 1.45);
    this.carpet.pos.y = Math.max(this.carpet.pos.y, getSurfaceY(this.carpet.pos.x, this.carpet.pos.z) + 0.22);
    this.carpet.yaw = damp(this.carpet.yaw, -0.58, 5, dt);
    this.carpet.pitch = damp(this.carpet.pitch, 0, 6, dt);
    this.carpet.roll = damp(this.carpet.roll, 0, 6, dt);
    this.carpet.flightWave = 1 - e * 0.85;
    this.carpet.speed = lerp(this.flightSpeed, 0, e);

    if (p < 0.65) {
      this.girl.pos.copy(this.carpet.riderOffset).applyEuler(this.carpet.group.rotation).add(this.carpet.pos);
      this.girl.yaw = this.carpet.yaw;
      this.girl.pose = 'ride';
      this.goat.pos.copy(this.carpet.goatOffset).applyEuler(this.carpet.group.rotation).add(this.carpet.pos);
      this.goat.yaw = this.carpet.yaw;
      this.goat.mood = 'ride';
    } else {
      if (!this._arriveAudioDone) {
        this._arriveAudioDone = true;
        this.g.audio.arrival();
      }
      // Step off right beside the Star Fountain, goat beside her (strictly outside fountain collider r=2.55)
      const fPos = this.obs.fountainPos;
      const gTarget = V(fPos.x + 3.05, landSpot.y, fPos.z + 0.72);
      const qTarget = V(fPos.x + 3.85, landSpot.y, fPos.z + 1.55);
      this.girl.pos.lerp(gTarget, Math.min(1, dt * 4.8));
      this.colliders.resolveCircle(this.girl.pos, 0.44, this.girl.pos.y, 1.45);
      this.girl.pos.y = getGroundY(this.girl.pos.x, this.girl.pos.z);
      this.girl.yaw = damp(this.girl.yaw, Math.atan2(fPos.x - this.girl.pos.x, fPos.z - this.girl.pos.z), 6, dt);
      this.girl.pose = 'arrive';
      this.girl.lookTarget = fPos;

      this.goat.pos.lerp(qTarget, Math.min(1, dt * 4.8));
      this.colliders.resolveCircle(this.goat.pos, 0.34, this.goat.pos.y, 0.8);
      this.goat.pos.y = getGroundY(this.goat.pos.x, this.goat.pos.z);
      this.goat.yaw = damp(this.goat.yaw, Math.atan2(fPos.x - this.goat.pos.x, fPos.z - this.goat.pos.z), 6, dt);
      this.goat.mood = 'guide';
    }

    this.g.audio.setAmbience({ wind: 0.06, skim: 0, star: 0.55 });
    this.rig.update(dt, this._shotArrive(), 2.2);
  }
}
