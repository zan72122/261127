import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';

// Sculpted Finnish Lapphund torso profile along spine axis
function makePuppyTorsoGeo() {
  const pts = [
    new THREE.Vector2(0.01, -0.22),
    new THREE.Vector2(0.085, -0.19), // hindquarters
    new THREE.Vector2(0.095, -0.06), // waist
    new THREE.Vector2(0.115, 0.08),  // deep chest & ruff
    new THREE.Vector2(0.095, 0.18),
    new THREE.Vector2(0.01, 0.22),
  ];
  const geo = new THREE.LatheGeometry(pts, 12);
  geo.rotateX(Math.PI / 2);
  geo.scale(0.84, 1.02, 1.0);
  geo.computeVertexNormals();
  return geo;
}

// Expressive Finnish Lapphund puppy wearing a glowing amber-emerald mailbag
export class Puppy {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'puppyMessenger';
    this.pos = this.group.position;
    this.yaw = 0;

    const mCoat = new THREE.MeshStandardMaterial({ color: 0xb6895a, roughness: 0.84 });
    const mCoatDark = new THREE.MeshStandardMaterial({ color: 0x6f4d32, roughness: 0.84 });
    const mCream = new THREE.MeshStandardMaterial({ color: 0xe7decb, roughness: 0.82 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x1d1713, roughness: 0.35 });
    const mPink = new THREE.MeshStandardMaterial({ color: 0xd97d84, roughness: 0.55 });
    const mWhite = new THREE.MeshStandardMaterial({ color: 0xf7f9fc, roughness: 0.25 });
    const mLeather = new THREE.MeshStandardMaterial({ color: 0x623b22, roughness: 0.72 });
    const mGlowBag = new THREE.MeshStandardMaterial({
      color: PALETTE.amberGlow,
      emissive: PALETTE.amber,
      emissiveIntensity: 1.55,
      roughness: 0.35,
    });
    const mSeal = new THREE.MeshStandardMaterial({
      color: PALETTE.emeraldGlow,
      emissive: PALETTE.emerald,
      emissiveIntensity: 1.85,
      roughness: 0.28,
    });

    this.body = new THREE.Group();
    this.group.add(this.body);

    // Sculpted puppy torso + warm cream chest ruff
    const torso = new THREE.Mesh(makePuppyTorsoGeo(), mCoat);
    torso.position.y = 0.27;
    torso.castShadow = true;
    this.body.add(torso);

    const chest = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.22, 10), mCream);
    chest.rotation.x = Math.PI * 0.78;
    chest.position.set(0, 0.27, 0.14);
    this.body.add(chest);

    // 4 articulated legs with paws resting cleanly at y = 0
    const makeLeg = (sx, sz) => {
      const piv = new THREE.Group();
      piv.position.set(sx, 0.22, sz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.17, 7), mCream);
      leg.position.y = -0.085;
      leg.castShadow = true;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.028, 7, 6), mCream);
      paw.scale.set(1, 0.7, 1.25);
      paw.position.set(0, -0.20, 0.015);
      piv.add(leg, paw);
      return piv;
    };
    this.fl = makeLeg(-0.068, 0.12);
    this.fr = makeLeg(0.068, 0.12);
    this.bl = makeLeg(-0.068, -0.12);
    this.br = makeLeg(0.068, -0.12);
    this.body.add(this.fl, this.fr, this.bl, this.br);

    // Expressive head, brow spots, bright catchlight eyes, perked Spitz ears
    this.head = new THREE.Group();
    this.head.position.set(0, 0.37, 0.20);
    this.body.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.092, 12, 10), mCoat);
    skull.scale.set(0.96, 0.96, 1.04);
    skull.castShadow = true;
    this.head.add(skull);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.048, 0.09, 8), mCream);
    muzzle.rotation.x = Math.PI / 2 + 0.08;
    muzzle.position.set(0, -0.018, 0.088);
    this.head.add(muzzle);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), mDark);
    nose.scale.set(1.15, 0.85, 0.9);
    nose.position.set(0, -0.006, 0.135);
    this.head.add(nose);

    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), mPink);
    tongue.scale.set(0.9, 0.55, 1.3);
    tongue.position.set(0, -0.036, 0.118);
    this.head.add(tongue);

    for (const sx of [-0.045, 0.045]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), mCream);
      cheek.scale.set(1.1, 0.85, 0.9);
      cheek.position.set(sx * 1.15, -0.022, 0.055);
      this.head.add(cheek);
    }

    this.earL = null;
    this.earR = null;
    for (const sx of [-0.04, 0.04]) {
      const brow = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 6), mCream);
      brow.scale.set(1.25, 0.72, 0.6);
      brow.position.set(sx * 0.92, 0.050, 0.072);
      this.head.add(brow);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), mDark);
      eye.position.set(sx, 0.026, 0.080);
      this.head.add(eye);

      const catchlight = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), mWhite);
      catchlight.position.set(sx + 0.005, 0.032, 0.094);
      this.head.add(catchlight);

      const ear = new THREE.Group();
      ear.position.set(sx * 1.42, 0.075, -0.01);
      ear.rotation.z = sx > 0 ? -0.22 : 0.22;
      const earCone = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.082, 6), mCoat);
      earCone.scale.set(0.85, 1, 0.6);
      earCone.position.y = 0.02;
      const earTip = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.036, 6), mCoatDark);
      earTip.scale.set(0.85, 1, 0.6);
      earTip.position.y = 0.046;
      ear.add(earCone, earTip);
      this.head.add(ear);
      if (sx < 0) this.earL = ear;
      else this.earR = ear;
    }

    // Curled plumed Spitz tail arched gracefully over the back
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.32, -0.18);
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.09, -0.04),
      new THREE.Vector3(0, 0.15, 0.03),
      new THREE.Vector3(0, 0.13, 0.10),
    ]);
    const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 10, 0.026, 6, false), mCream);
    this.tail.add(tailMesh);
    this.body.add(this.tail);

    // Glowing mailbag worn on puppy's saddle strap (story focal anchor!)
    this.mailbag = new THREE.Group();
    this.mailbag.name = 'glowingMailbag';
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.015, 6, 14), mLeather);
    strap.rotation.y = Math.PI / 2;
    strap.position.set(0, 0.27, 0.01);
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.145, 0.165), mGlowBag);
    pouch.position.set(0.12, 0.26, 0.0);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.06, 0.17), mLeather);
    flap.position.set(0.12, 0.32, 0.0);
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.055), mSeal);
    seal.position.set(0.18, 0.27, 0.0);
    seal.rotation.x = Math.PI / 4;
    this.mailbag.add(strap, pouch, flap, seal);

    // Feathered glow halo around mailbag (nonsolid FX, compact radius so Box3 stays >= 0)
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 10, 8),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(PALETTE.amberGlow) } },
        vertexShader: `varying vec3 vN, vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN, vV; void main(){ float f = pow(max(0.0001, dot(vN, vV)), 3.0); gl_FragColor = vec4(uColor * f * 0.65, f * 0.5); }`,
      })
    );
    halo.position.set(0.12, 0.27, 0);
    halo.userData.nonsolid = true;
    halo.userData.fx = true;
    this.mailbag.add(halo);
    this.body.add(this.mailbag);
  }

  animate(dt, t, { moving = false, happy = false, sitting = false, offer = false } = {}) {
    const wagSpeed = happy ? 14 : 6.5;
    this.tail.rotation.y = Math.sin(t * wagSpeed) * (happy ? 0.58 : 0.32);

    if (moving) {
      const g = Math.sin(t * 14);
      this.fl.rotation.x = g * 0.55;
      this.fr.rotation.x = -g * 0.55;
      this.bl.rotation.x = -g * 0.55;
      this.br.rotation.x = g * 0.55;
      this.body.position.y = Math.abs(g) * 0.035;
      this.body.rotation.x = 0;
    } else if (offer) {
      // Eagerly lifts front paw and leans slightly forward to show/offer the mailbag
      this.fl.rotation.x = -0.35 + Math.sin(t * 7) * 0.18;
      this.fr.rotation.x = 0;
      this.bl.rotation.x = 0;
      this.br.rotation.x = 0;
      this.body.position.y = Math.abs(Math.sin(t * 4.5)) * 0.03;
      this.body.rotation.x = -0.06;
    } else if (sitting) {
      this.fl.rotation.x = 0;
      this.fr.rotation.x = 0;
      // Bend hind legs cleanly backward without dropping paws below y = 0
      this.bl.rotation.x = -0.45;
      this.br.rotation.x = -0.45;
      this.body.position.y = 0.03;
      this.body.rotation.x = -0.10;
    } else {
      this.fl.rotation.x = 0;
      this.fr.rotation.x = 0;
      this.bl.rotation.x = 0;
      this.br.rotation.x = 0;
      this.body.rotation.x = 0;
      this.body.position.y = happy ? Math.abs(Math.sin(t * 8)) * 0.065 : Math.sin(t * 3) * 0.008;
    }

    // Expressive head tilt & attentive ear perk
    this.head.rotation.z = Math.sin(t * 2.1) * (offer ? 0.16 : 0.10);
    this.head.rotation.x = offer ? -0.15 : Math.sin(t * 1.4) * 0.05;
    if (this.earL && this.earR) {
      this.earL.rotation.x = Math.sin(t * 3.1) * 0.08;
      this.earR.rotation.x = -Math.sin(t * 2.7) * 0.08;
    }
  }
}
