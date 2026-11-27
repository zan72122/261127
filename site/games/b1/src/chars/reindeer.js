import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';
import { makeLogTexture } from '../core/textures.js';

// Anatomical Arctic reindeer torso profile along spine axis (rotated to +Z)
function makeReindeerTorsoGeo() {
  // Lathe points: x = radius, y = spine position (-0.64 rump -> +0.58 chest)
  const pts = [
    new THREE.Vector2(0.01, -0.64),
    new THREE.Vector2(0.18, -0.58),
    new THREE.Vector2(0.28, -0.44), // hindquarters / croup
    new THREE.Vector2(0.27, -0.22), // tucked flank / loin
    new THREE.Vector2(0.31, 0.04),  // ribcage
    new THREE.Vector2(0.35, 0.30),  // deep brisket & shoulder
    new THREE.Vector2(0.30, 0.48),  // chest front
    new THREE.Vector2(0.16, 0.57),
    new THREE.Vector2(0.01, 0.60),
  ];
  const geo = new THREE.LatheGeometry(pts, 14);
  geo.rotateX(Math.PI / 2);
  // Narrow laterally (real caribou are deep-chested, lean laterally, not spherical!)
  geo.scale(0.68, 1.06, 1.0);
  geo.computeVertexNormals();
  return geo;
}

// Graceful sweeping reindeer antler beam + brow shovel & crown tines
function makeAntlerBeam(sx, mat) {
  const g = new THREE.Group();
  const mainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(sx * 0.08, 0.16, -0.10),
    new THREE.Vector3(sx * 0.18, 0.34, -0.18),
    new THREE.Vector3(sx * 0.22, 0.52, -0.06),
    new THREE.Vector3(sx * 0.19, 0.66, 0.10),
  ]);
  const beam = new THREE.Mesh(new THREE.TubeGeometry(mainCurve, 14, 0.018, 6, false), mat);
  beam.castShadow = true;
  g.add(beam);

  // Forward brow tine (characteristic reindeer shovel tine)
  const browCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx * 0.05, 0.10, -0.05),
    new THREE.Vector3(sx * 0.04, 0.16, 0.12),
    new THREE.Vector3(sx * 0.02, 0.21, 0.24),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(browCurve, 6, 0.012, 5, false), mat));

  // Mid bez tine & upper crown forks
  const bezCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx * 0.13, 0.24, -0.14),
    new THREE.Vector3(sx * 0.18, 0.36, 0.04),
    new THREE.Vector3(sx * 0.16, 0.45, 0.14),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(bezCurve, 6, 0.011, 5, false), mat));

  const crownCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx * 0.21, 0.46, -0.11),
    new THREE.Vector3(sx * 0.26, 0.60, -0.15),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(crownCurve, 5, 0.010, 5, false), mat));

  return g;
}

// Realistic white adult reindeer pulling an authentic wooden Lapland sleigh
export class ReindeerSleigh {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'vehicleReindeerSleigh';
    this.pos = this.group.position;
    this.yaw = 0;
    this.speed = 0;
    this.stridePhase = 0;

    // Materials (70:25:5 winter coat, dark hooves, natural antler, warm Lapland timber, emerald/amber glow)
    const logTex = makeLogTexture();
    const mWhiteCoat = new THREE.MeshStandardMaterial({ color: 0xeef1f6, roughness: 0.72 });
    const mWhiteSilver = new THREE.MeshStandardMaterial({ color: 0xd6dfeb, roughness: 0.78 });
    const mHoof = new THREE.MeshStandardMaterial({ color: 0x242832, roughness: 0.58 });
    const mEye = new THREE.MeshStandardMaterial({ color: 0x161820, roughness: 0.25 });
    const mWhite = new THREE.MeshStandardMaterial({ color: 0xf7faff, roughness: 0.2 });
    const mAntler = new THREE.MeshStandardMaterial({ color: 0xc5b49b, roughness: 0.74 });
    const mLeather = new THREE.MeshStandardMaterial({ color: 0x5c3820, roughness: 0.74 });
    const mWood = new THREE.MeshStandardMaterial({ color: PALETTE.woodWarm, map: logTex, roughness: 0.78 });
    const mWoodLight = new THREE.MeshStandardMaterial({ color: PALETTE.woodLight, map: logTex, roughness: 0.74 });
    const mWoodDark = new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, roughness: 0.84 });
    const mRunner = new THREE.MeshStandardMaterial({ color: 0x3b4454, roughness: 0.42, metalness: 0.62 });
    const mBlanket = new THREE.MeshStandardMaterial({ color: 0x265445, roughness: 0.86 });
    const mAmber = new THREE.MeshStandardMaterial({
      color: PALETTE.amberGlow,
      emissive: PALETTE.amber,
      emissiveIntensity: 1.65,
      roughness: 0.3,
    });
    const mEmerald = new THREE.MeshStandardMaterial({
      color: PALETTE.emeraldGlow,
      emissive: PALETTE.emerald,
      emissiveIntensity: 1.5,
      roughness: 0.3,
    });

    // === 1. REALISTIC WHITE ARCTIC REINDEER (forward +Z, centered around z = +1.78) ===
    this.reindeer = new THREE.Group();
    this.reindeer.name = 'reindeerWhite';
    this.reindeer.position.set(0, 0, 1.78);
    this.group.add(this.reindeer);

    // Sculpted anatomical body (chest, withers, tucked loin, croup)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 1.14, 0);
    this.reindeer.add(this.torsoGroup);

    const torsoMesh = new THREE.Mesh(makeReindeerTorsoGeo(), mWhiteCoat);
    torsoMesh.castShadow = true;
    this.torsoGroup.add(torsoMesh);

    // Subtle shoulder withers ridge
    const withers = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mWhiteCoat);
    withers.scale.set(0.7, 0.85, 1.15);
    withers.position.set(0, 0.16, 0.30);
    this.torsoGroup.add(withers);

    // Thick Arctic winter chest ruff / dewlap mane
    const ruff = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.46, 10), mWhiteSilver);
    ruff.rotation.x = Math.PI * 0.78;
    ruff.scale.set(0.75, 1.0, 0.9);
    ruff.position.set(0, -0.06, 0.50);
    this.torsoGroup.add(ruff);

    // Arched neck + sculpted sloping reindeer head + sweeping curved antlers
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.14, 0.44);
    this.torsoGroup.add(this.neck);

    const neckLower = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.19, 0.40, 10), mWhiteCoat);
    neckLower.scale.set(0.74, 1, 1.05);
    neckLower.position.set(0, 0.16, 0.12);
    neckLower.rotation.x = 0.62;
    neckLower.castShadow = true;
    this.neck.add(neckLower);

    const neckUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.138, 0.32, 10), mWhiteCoat);
    neckUpper.scale.set(0.76, 1, 1.0);
    neckUpper.position.set(0, 0.36, 0.25);
    neckUpper.rotation.x = 0.34;
    neckUpper.castShadow = true;
    this.neck.add(neckUpper);

    const mane = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 8), mWhiteSilver);
    mane.position.set(0, 0.16, 0.24);
    mane.rotation.x = Math.PI * 0.82;
    this.neck.add(mane);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.49, 0.32);
    this.neck.add(this.head);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), mWhiteCoat);
    cranium.scale.set(0.80, 0.88, 1.15);
    cranium.castShadow = true;
    this.head.add(cranium);

    // Long tapering nasal bridge + broad velvety reindeer muzzle
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.102, 0.27, 8), mWhiteCoat);
    snout.rotation.x = Math.PI / 2 + 0.24;
    snout.position.set(0, -0.055, 0.17);
    snout.castShadow = true;
    this.head.add(snout);

    const muzzleTip = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), mWhiteSilver);
    muzzleTip.scale.set(0.95, 0.82, 0.85);
    muzzleTip.position.set(0, -0.09, 0.29);
    this.head.add(muzzleTip);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6), mHoof);
    nose.scale.set(1.1, 0.88, 0.9);
    nose.position.set(0, -0.075, 0.335);
    this.head.add(nose);

    this.earL = null;
    this.earR = null;
    for (const sx of [-0.072, 0.072]) {
      const brow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), mWhiteSilver);
      brow.scale.set(1.25, 0.65, 0.9);
      brow.position.set(sx * 0.96, 0.052, 0.095);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), mEye);
      eye.position.set(sx, 0.026, 0.105);

      const catchlight = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), mWhite);
      catchlight.position.set(sx + (sx > 0 ? 0.006 : -0.004), 0.034, 0.125);

      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.15, 6), mWhiteCoat);
      ear.scale.set(0.7, 1, 0.5);
      ear.position.set(sx * 1.38, 0.085, -0.055);
      ear.rotation.set(-0.18, 0, sx > 0 ? -0.82 : 0.82);
      this.head.add(brow, eye, catchlight, ear);
      if (sx < 0) this.earL = ear;
      else this.earR = ear;
    }

    // Sweeping curved caribou antlers
    for (const sx of [-1, 1]) {
      const ant = makeAntlerBeam(sx, mAntler);
      ant.position.set(sx * 0.058, 0.105, -0.02);
      this.head.add(ant);
    }

    // Leather harness collar & saddle strap with brass-amber sleigh bell
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.030, 6, 14), mLeather);
    collar.scale.set(0.82, 1.05, 1);
    collar.position.set(0, -0.02, 0.44);
    collar.rotation.x = 0.48;
    this.torsoGroup.add(collar);

    const girth = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.022, 6, 14), mLeather);
    girth.scale.set(0.78, 1.15, 1);
    girth.position.set(0, 0.02, 0.08);
    this.torsoGroup.add(girth);

    const saddlePad = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.24), mBlanket);
    saddlePad.position.set(0, 0.31, 0.08);
    this.torsoGroup.add(saddlePad);

    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), mAmber);
    bell.position.set(0, -0.22, 0.58);
    this.torsoGroup.add(bell);

    // 4 articulated 3-segment reindeer legs (front carpus / hind hock, hooves resting at local y = 0)
    const makeFrontLeg = (sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx, 1.02, 0.36);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.046, 0.50, 8), mWhiteCoat);
      upper.position.set(0, -0.24, -0.02);
      upper.rotation.x = 0.08;
      upper.castShadow = true;

      const knee = new THREE.Group();
      knee.position.set(0, -0.49, -0.04);

      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.028, 0.46, 8), mWhiteSilver);
      lower.position.y = -0.23;
      lower.castShadow = true;

      const fetlock = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), mWhiteSilver);
      fetlock.position.y = -0.45;

      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.056, 0.08, 8), mHoof);
      hoof.position.set(0, -0.49, 0.015);

      knee.add(lower, fetlock, hoof);
      hip.add(upper, knee);
      hip.knee = knee;
      return hip;
    };

    const makeHindLeg = (sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx, 1.04, -0.38);

      // Muscular femur angled slightly forward
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.056, 0.38, 8), mWhiteCoat);
      thigh.position.set(0, -0.17, 0.04);
      thigh.rotation.x = -0.24;
      thigh.castShadow = true;

      // Gaskin angled backward toward realistic hock joint
      const gaskin = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.036, 0.30, 8), mWhiteCoat);
      gaskin.position.set(0, -0.42, -0.02);
      gaskin.rotation.x = 0.42;
      gaskin.castShadow = true;

      const hock = new THREE.Group();
      hock.position.set(0, -0.54, -0.09);

      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.43, 8), mWhiteSilver);
      cannon.position.set(0, -0.215, 0.02);
      cannon.rotation.x = -0.08;
      cannon.castShadow = true;

      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.056, 0.08, 8), mHoof);
      hoof.position.set(0, -0.46, 0.045);

      hock.add(cannon, hoof);
      hip.add(thigh, gaskin, hock);
      hip.knee = hock;
      return hip;
    };

    this.legFL = makeFrontLeg(-0.16);
    this.legFR = makeFrontLeg(0.16);
    this.legBL = makeHindLeg(-0.16);
    this.legBR = makeHindLeg(0.16);
    this.reindeer.add(this.legFL, this.legFR, this.legBL, this.legBR);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 6), mWhiteCoat);
    tail.position.set(0, 0.06, -0.60);
    tail.rotation.x = -0.95;
    this.torsoGroup.add(tail);

    // === 2. WOODEN LAPLAND SLEIGH (centered around z = -0.95) ===
    this.sleigh = new THREE.Group();
    this.sleigh.name = 'woodenSleigh';
    this.sleigh.position.set(0, 0, -0.95);
    this.group.add(this.sleigh);

    // Steel-shod wooden runners sitting flush on snow at y = 0
    for (const sx of [-0.46, 0.46]) {
      const runner = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 2.24), mRunner);
      runner.position.set(sx, 0.0375, 0.05);
      runner.castShadow = true;
      this.sleigh.add(runner);

      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.032, 6, 12, Math.PI * 0.74), mRunner);
      curl.rotation.y = Math.PI / 2;
      curl.position.set(sx, 0.24, 1.15);
      this.sleigh.add(curl);

      for (const sz of [-0.72, 0.0, 0.68]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.28, 0.075), mWoodDark);
        strut.position.set(sx, 0.18, sz);
        this.sleigh.add(strut);
      }
    }

    // Slatted timber bed & beveled side boards
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.09, 1.92), mWood);
    bed.position.set(0, 0.34, -0.02);
    bed.castShadow = true;
    bed.receiveShadow = true;
    this.sleigh.add(bed);

    for (const sx of [-0.48, 0.48]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.42, 1.88), mWoodLight);
      side.position.set(sx, 0.57, -0.02);
      side.castShadow = true;
      this.sleigh.add(side);
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.055, 1.92), mWoodDark);
      railTop.position.set(sx, 0.79, -0.02);
      this.sleigh.add(railTop);
    }

    const back = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.68, 0.095), mWoodLight);
    back.position.set(0, 0.70, -0.94);
    back.rotation.x = -0.15;
    back.castShadow = true;
    this.sleigh.add(back);

    const frontDash = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.50, 0.095), mWoodLight);
    frontDash.position.set(0, 0.61, 0.88);
    frontDash.rotation.x = 0.22;
    this.sleigh.add(frontDash);

    // Wool lap blanket on seat
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 0.78), mBlanket);
    blanket.position.set(0, 0.44, -0.35);
    this.sleigh.add(blanket);

    // Sleigh front brass lantern + warm feathered glow halo
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.030, 0.42, 6), mHoof);
    lampPost.position.set(0.46, 0.96, 0.82);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.058, 0.16, 6), mAmber);
    lamp.position.set(0.46, 1.18, 0.82);
    const lampHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 8, 8),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(PALETTE.amberGlow) } },
        vertexShader: `varying vec3 vN, vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN, vV; void main(){ float f = pow(max(0.0001, dot(vN, vV)), 2.8); gl_FragColor = vec4(uColor * f * 0.65, f * 0.48); }`,
      })
    );
    lampHalo.position.set(0.46, 1.18, 0.82);
    lampHalo.userData.nonsolid = true;
    lampHalo.userData.fx = true;
    this.sleigh.add(lampPost, lamp, lampHalo);

    // Leather traces connecting reindeer harness to sleigh front
    for (const sx of [-0.36, 0.36]) {
      const trace = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.68, 5), mLeather);
      trace.rotation.x = Math.PI / 2;
      trace.position.set(sx * 0.84, 0.72, 0.78);
      trace.userData.nonsolid = true;
      this.group.add(trace);
    }

    // Stowed glowing mailbag slot on sleigh (visible once handed over & boarded)
    this.stowedBag = new THREE.Group();
    this.stowedBag.position.set(-0.24, 0.56, 0.25);
    this.stowedBag.visible = false;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.30), mAmber);
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), mEmerald);
    seal.position.set(0, 0.04, 0.16);
    seal.rotation.z = Math.PI / 4;
    this.stowedBag.add(bag, seal);
    this.sleigh.add(this.stowedBag);

    // Rider anchors inside sleigh
    this.girlSeat = new THREE.Object3D();
    this.girlSeat.position.set(0.08, 0.56, -0.35);
    this.sleigh.add(this.girlSeat);

    this.puppySeat = new THREE.Object3D();
    this.puppySeat.position.set(-0.22, 0.52, -0.22);
    this.sleigh.add(this.puppySeat);
  }

  animate(dt, t, { speed = 0, airborne = false, crouch = false } = {}) {
    if (crouch) {
      // Bow head/neck gently while keeping all 4 hooves planted at snow level (y >= 0!)
      this.reindeer.position.y = 0;
      this.torsoGroup.position.y = 1.06;
      this.neck.rotation.x = 0.22;
      this.head.rotation.x = 0.32 + Math.sin(t * 2.2) * 0.05;
      this.legFL.rotation.x = -0.14;
      this.legFR.rotation.x = -0.14;
      this.legBL.rotation.x = 0.14;
      this.legBR.rotation.x = 0.14;
      this.legFL.knee.rotation.x = 0.28;
      this.legFR.knee.rotation.x = 0.28;
      this.legBL.knee.rotation.x = -0.18;
      this.legBR.knee.rotation.x = -0.18;
      return;
    }

    this.torsoGroup.position.y = 1.14;
    const moving = speed > 0.4;
    if (moving) {
      this.stridePhase += dt * (airborne ? 7.5 : 5.2 + speed * 0.36);
      const p = this.stridePhase;
      const amp = airborne ? 0.55 : Math.min(0.64, 0.24 + speed * 0.03);
      const a1 = Math.sin(p) * amp;
      const a2 = Math.sin(p + 0.55) * amp;
      this.legFL.rotation.x = a1;
      this.legFR.rotation.x = a2;
      this.legBL.rotation.x = -a1 * 0.88;
      this.legBR.rotation.x = -a2 * 0.88;
      this.legFL.knee.rotation.x = Math.max(0, -a1 * 0.85);
      this.legFR.knee.rotation.x = Math.max(0, -a2 * 0.85);
      this.legBL.knee.rotation.x = Math.max(0, a1 * 0.55);
      this.legBR.knee.rotation.x = Math.max(0, a2 * 0.55);
      this.reindeer.position.y = Math.max(0, Math.sin(p * 2) * (airborne ? 0.05 : 0.035));
      this.head.rotation.x = Math.sin(p) * 0.08;
      this.neck.rotation.x = 0.04 + Math.sin(p) * 0.05;
    } else {
      this.reindeer.position.y = 0;
      this.legFL.rotation.x = 0;
      this.legFR.rotation.x = 0;
      this.legBL.rotation.x = 0;
      this.legBR.rotation.x = 0;
      this.legFL.knee.rotation.x = 0;
      this.legFR.knee.rotation.x = 0;
      this.legBL.knee.rotation.x = 0;
      this.legBR.knee.rotation.x = 0;
      this.head.rotation.x = Math.sin(t * 1.6) * 0.06;
      this.neck.rotation.x = Math.sin(t * 1.1) * 0.03;
    }
    if (this.earL && this.earR) {
      this.earL.rotation.x = -0.18 + Math.sin(t * 2.9) * 0.07;
      this.earR.rotation.x = -0.18 - Math.sin(t * 2.4) * 0.07;
    }
  }
}
