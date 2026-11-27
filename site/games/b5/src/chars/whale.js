import * as THREE from '../../lib/three.module.js';
import { PALETTE } from '../core/env.js';
import { clamp, smoothstep } from '../core/math.js';

function buildWhaleBodyGeometry() {
  const slices = 40;
  const rings = 26;
  const positions = [];
  const colors = [];
  const indices = [];

  const cDorsal = new THREE.Color('#194966');
  const cFlank = new THREE.Color('#2c748a');
  const cBelly = new THREE.Color('#e2efe9');
  const cTmp = new THREE.Color();

  for (let i = 0; i <= slices; i++) {
    const t = i / slices;
    const z = 4.72 - t * 9.28;

    let rx;
    let ryTop;
    let ryBot;
    if (i === 0 || i === slices) {
      rx = 0;
      ryTop = 0;
      ryBot = 0;
    } else if (t < 0.22) {
      const k = t / 0.22;
      const s = Math.sin(k * Math.PI * 0.5);
      rx = s * 1.40;
      ryTop = s * 1.04;
      ryBot = s * 0.96;
    } else if (t < 0.52) {
      const k = (t - 0.22) / 0.3;
      rx = 1.40 - smoothstep(0, 1, k) * 0.32;
      ryTop = 1.04 - smoothstep(0, 1, k) * 0.14;
      ryBot = 0.96 - smoothstep(0, 1, k) * 0.22;
    } else {
      const k = (t - 0.52) / 0.48;
      const tap = 1 - smoothstep(0, 1, k);
      rx = 0.12 + tap * 0.96;
      ryTop = 0.14 + tap * 0.76;
      ryBot = 0.12 + tap * 0.62;
    }

    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = ca * rx;
      const y = sa >= 0 ? sa * ryTop : sa * ryBot;
      positions.push(x, y, z);

      const vNorm = clamp((sa + 1) * 0.5, 0, 1);
      if (vNorm < 0.42) {
        cTmp.lerpColors(cBelly, cFlank, smoothstep(0.18, 0.42, vNorm));
        // Subtle baleen throat pleats along ventral belly (t < 0.55)
        if (t < 0.55 && sa < -0.15) {
          const pleat = Math.sin(ca * 28.0) * 0.035 * (1 - smoothstep(0.18, 0.55, t));
          cTmp.offsetHSL(0, 0, pleat);
        }
      } else {
        cTmp.lerpColors(cFlank, cDorsal, smoothstep(0.42, 0.78, vNorm));
      }
      colors.push(cTmp.r, cTmp.g, cTmp.b);
    }
  }

  const stride = rings + 1;
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < rings; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildPectoralFinGeometry(side = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.42);
  shape.quadraticCurveTo(0.95 * side, 0.26, 2.25 * side, -0.78);
  shape.quadraticCurveTo(2.38 * side, -0.96, 1.98 * side, -1.04);
  shape.quadraticCurveTo(1.0 * side, -0.56, 0, -0.22);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.04, 0);
  return geo;
}

function buildFlukeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.55);
  shape.quadraticCurveTo(1.3, 0.25, 2.25, -0.55);
  shape.quadraticCurveTo(1.4, -0.52, 0.2, -0.22);
  shape.lineTo(0, -0.36);
  shape.lineTo(-0.2, -0.22);
  shape.quadraticCurveTo(-1.4, -0.52, -2.25, -0.55);
  shape.quadraticCurveTo(-1.3, 0.25, 0, 0.55);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.04, 0);
  return geo;
}

export class Whale {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'whaleVehicle';
    this.pos = this.group.position;

    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    const bodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.26,
      metalness: 0.04,
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: '#235e79',
      roughness: 0.30,
      metalness: 0.04,
    });
    this.glowMat = new THREE.MeshStandardMaterial({
      color: '#ffe0a6',
      emissive: PALETTE.sunsetGold,
      emissiveIntensity: 1.05,
      roughness: 0.3,
    });
    this.coralGlowMat = new THREE.MeshStandardMaterial({
      color: '#ffbdb3',
      emissive: PALETTE.coralPink,
      emissiveIntensity: 0.9,
      roughness: 0.35,
    });

    const hull = new THREE.Mesh(buildWhaleBodyGeometry(), bodyMat);
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.bodyPivot.add(hull);

    // Eyes tucked naturally along head contour
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#101c24', roughness: 0.2 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), eyeMat);
      eye.position.set(sx * 1.18, 0.14, 2.75);
      this.bodyPivot.add(eye);
    }

    // Curved dorsal fin behind saddle
    const dorsalShape = new THREE.Shape();
    dorsalShape.moveTo(0, 0);
    dorsalShape.quadraticCurveTo(0.24, 0.52, -0.38, 0.56);
    dorsalShape.quadraticCurveTo(-0.22, 0.24, -0.45, 0);
    const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 });
    dorsalGeo.rotateY(Math.PI / 2);
    const dorsal = new THREE.Mesh(dorsalGeo, finMat);
    dorsal.position.set(-0.04, 0.72, -1.25);
    this.bodyPivot.add(dorsal);

    // Flush bioluminescent pearl nodes hugging the dorsal/flank hull curve (zero protrusion)
    const flankSpots = [
      { z: 2.35, x: 1.24, y: 0.34, r: 0.09, mat: this.coralGlowMat },
      { z: 1.45, x: 1.32, y: 0.42, r: 0.085, mat: this.glowMat },
      { z: 0.45, x: 1.18, y: 0.46, r: 0.08, mat: this.coralGlowMat },
      { z: -0.65, x: 0.96, y: 0.44, r: 0.075, mat: this.glowMat },
      { z: -1.75, x: 0.68, y: 0.38, r: 0.07, mat: this.coralGlowMat },
    ];
    for (const sp of flankSpots) {
      for (const sx of [-1, 1]) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(sp.r, 8, 6), sp.mat);
        dot.scale.set(0.55, 0.7, 1.5);
        dot.position.set(sx * sp.x, sp.y, sp.z);
        this.bodyPivot.add(dot);
      }
    }

    // Swept pectoral fins (angled gracefully down & back)
    this.finL = new THREE.Mesh(buildPectoralFinGeometry(-1), finMat);
    this.finL.position.set(-1.12, -0.18, 1.45);
    this.finL.castShadow = true;
    this.bodyPivot.add(this.finL);

    this.finR = new THREE.Mesh(buildPectoralFinGeometry(1), finMat);
    this.finR.position.set(1.12, -0.18, 1.45);
    this.finR.castShadow = true;
    this.bodyPivot.add(this.finR);

    // Tail peduncle + horizontal flukes
    this.tailPivot = new THREE.Group();
    this.tailPivot.position.set(0, 0.06, -4.35);
    const fluke = new THREE.Mesh(buildFlukeGeometry(), finMat);
    fluke.position.z = -0.45;
    fluke.castShadow = true;
    this.tailPivot.add(fluke);
    this.bodyPivot.add(this.tailPivot);

    // Soft glowing saddle ring on whale's back
    this.saddleCue = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.76, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffe29e',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.saddleCue.rotation.x = -Math.PI / 2;
    this.saddleCue.position.set(0, 1.07, 1.12);
    this.saddleCue.userData.nonsolid = true;
    this.saddleCue.userData.fx = true;
    this.bodyPivot.add(this.saddleCue);

    this.saddleAnchor = new THREE.Object3D();
    this.saddleAnchor.position.set(0, 1.04, 1.12);
    this.bodyPivot.add(this.saddleAnchor);

    this._swimPhase = 0;
    this.speed = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
  }

  saddleWorld(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    return this.saddleAnchor.getWorldPosition(out);
  }

  forwardDir(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
  }

  update(dt, time, { showCue = false, leapGlow = 0 } = {}) {
    this._swimPhase += dt * (2.2 + this.speed * 0.24);
    this.tailPivot.rotation.x = Math.sin(this._swimPhase) * (0.18 + Math.min(0.18, this.speed * 0.012));
    this.finL.rotation.z = 0.22 + Math.sin(this._swimPhase * 0.7 + 0.5) * 0.12;
    this.finR.rotation.z = -0.22 - Math.sin(this._swimPhase * 0.7 + 0.5) * 0.12;
    this.bodyPivot.rotation.x = Math.sin(this._swimPhase) * 0.025;

    this.saddleCue.visible = showCue;
    if (showCue) {
      const pulse = 1.0 + Math.sin(time * 3.4) * 0.12;
      this.saddleCue.scale.setScalar(pulse);
    }

    this.glowMat.emissiveIntensity = 0.95 + leapGlow * 0.9 + Math.sin(time * 2.2) * 0.15;
    this.coralGlowMat.emissiveIntensity = 0.8 + leapGlow * 0.85;
  }
}
