import * as THREE from '../../lib/three.module.js';
import { LAYER_MAIN, LAYER_REFLECT, PALETTE } from '../core/env.js';

function makeWashiTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8f5ec';
  ctx.fillRect(0, 0, 256, 256);

  // Delicate natural paper fibers & fold crease grain
  ctx.strokeStyle = 'rgba(218, 210, 192, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 240; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const ang = (i * 1.7) % Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * 14, y + Math.sin(ang) * 14);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PaperPlane {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'paperAirplane';
    this.pos = new THREE.Vector3();
    this.speed = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;

    const washiTex = makeWashiTexture();
    const whitePaper = new THREE.MeshStandardMaterial({
      color: PALETTE.paperWhite,
      map: washiTex,
      roughness: 0.74,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const innerCrease = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#eae5d7'),
      map: washiTex,
      roughness: 0.82,
      side: THREE.DoubleSide,
    });
    const indigoTrim = new THREE.MeshStandardMaterial({
      color: PALETTE.indigo,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const yamabukiTrim = new THREE.MeshStandardMaterial({
      color: PALETTE.yamabuki,
      roughness: 0.65,
      side: THREE.DoubleSide,
    });

    this.bodyPivot = new THREE.Group();
    this.bodyPivot.scale.setScalar(1.06);
    this.group.add(this.bodyPivot);

    // Origami dimensions: nose at z = +2.15, tail at z = -1.55, wingspan = 3.5m (x: -1.75..+1.75)
    // Central keel bottom sits cleanly at y = 0.0 when resting flat on grass!
    const buildTri = (a, b, c) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      geo.computeVertexNormals();
      return geo;
    };

    const nose = [0, 0.36, 2.15];
    const keelTail = [0, 0.0, -1.35];
    const spineTail = [0, 0.42, -1.52];
    const spineMid = [0, 0.40, 0.15];

    // Central folded keel (two angled fuselage walls from keel bottom up to spine folds)
    for (const s of [-1, 1]) {
      const topSide = [s * 0.24, 0.38, -1.45];
      const midSide = [s * 0.16, 0.38, 0.15];

      const k1 = new THREE.Mesh(buildTri(nose, keelTail, topSide), innerCrease);
      const k2 = new THREE.Mesh(buildTri(nose, topSide, midSide), innerCrease);
      k1.castShadow = true;
      k2.castShadow = true;
      this.bodyPivot.add(k1, k2);
    }

    // Left & Right broad swept wings (built as separate groups for subtle wind flex)
    this.wingL = new THREE.Group();
    this.wingR = new THREE.Group();
    this.bodyPivot.add(this.wingL, this.wingR);

    for (const s of [-1, 1]) {
      const wg = s < 0 ? this.wingL : this.wingR;
      const innerTail = [s * 0.24, 0.38, -1.45];
      const wingTip = [s * 1.75, 0.56, -1.28];
      const wingFoldTip = [s * 1.78, 0.72, -1.34];
      const wingElbow = [s * 1.48, 0.48, -0.32];

      // Main upper wing surface
      const wMain = new THREE.Mesh(buildTri(nose, innerTail, wingTip), whitePaper);
      const wFront = new THREE.Mesh(buildTri(nose, wingTip, wingElbow), whitePaper);
      // Folded upward winglet (classic folded paper plane tip)
      const wFin = new THREE.Mesh(buildTri(wingElbow, wingTip, wingFoldTip), whitePaper);

      // Subtle indigo & yamabuki origami edge accents along outer winglet & inner fold
      const trimLine = new THREE.Mesh(buildTri(
        [s * 1.52, 0.53, -0.42],
        [s * 1.755, 0.62, -1.29],
        [s * 1.78, 0.73, -1.34]
      ), indigoTrim);
      const spineStripe = new THREE.Mesh(buildTri(
        [s * 0.02, 0.39, 1.85],
        [s * 0.19, 0.39, -1.42],
        [s * 0.24, 0.39, -1.42]
      ), yamabukiTrim);

      [wMain, wFront, wFin].forEach((m) => {
        m.castShadow = true;
        m.receiveShadow = true;
      });
      wg.add(wMain, wFront, wFin, trimLine, spineStripe);
    }

    // Inner deck floor crease where girl sits safely
    const deck = new THREE.Mesh(buildTri(nose, [-0.2, 0.37, -1.42], [0.2, 0.37, -1.42]), innerCrease);
    deck.receiveShadow = true;
    this.bodyPivot.add(deck);

    this.seatAnchor = new THREE.Object3D();
    this.seatAnchor.position.set(0, 0.36, 0.12);
    this.bodyPivot.add(this.seatAnchor);

    // Enable reflection layer so white wings reflect in the rice paddies!
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.layers.enable(LAYER_MAIN);
        o.layers.enable(LAYER_REFLECT);
      }
    });
  }

  seatWorld(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    return this.seatAnchor.getWorldPosition(out);
  }

  forwardDir(out = new THREE.Vector3()) {
    return out.set(0, 0, 1).applyEuler(this.group.rotation).normalize();
  }

  update(t, speed = 0, bank = 0) {
    // Subtle paper wing-tip aerodynamic flex in gusts
    const flex = Math.sin(t * 5.2) * (0.015 + Math.min(0.05, speed * 0.0025)) + bank * 0.03;
    this.wingL.rotation.z = -flex;
    this.wingR.rotation.z = flex;
    this.pos.copy(this.group.position);
  }
}
