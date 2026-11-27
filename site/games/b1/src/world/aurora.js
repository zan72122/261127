import * as THREE from '../../lib/three.module.js';
import { OFFICE_POS, shared } from '../core/env.js';

// Living Aurora Sky-Road (wide flowing luminous sky-path + side light-curtains) & northern sky curtains
export class AuroraSky {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'auroraCurtains';
    this.group.userData.nonsolid = true;
    this.group.userData.fx = true;

    // 1. Curved upper-sky aurora curtains framing the northern ridge & post office (soft bottom & top fade)
    const curtainShader = (hueShift = 0) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: shared.uTime,
        uAuroraOn: shared.uAuroraOn,
        uShift: { value: hueShift },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uShift;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec3 p = position;
          float wave = sin(uv.x * 8.0 + uTime * 0.42 + uShift) * 9.0 + cos(uv.x * 15.0 - uTime * 0.31) * 4.0;
          p.z += wave;
          p.y += sin(uv.x * 5.0 + uTime * 0.25) * 2.4;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAuroraOn, uShift;
        varying vec2 vUv;
        void main(){
          float edgeX = smoothstep(0.0, 0.20, vUv.x) * smoothstep(1.0, 0.80, vUv.x);
          float bot = smoothstep(0.0, 0.42, vUv.y);
          float top = pow(clamp(1.0 - vUv.y, 0.0001, 1.0), 1.5) * smoothstep(1.0, 0.80, vUv.y);
          float rays = max(0.0, 0.42 + 0.58 * sin(vUv.x * 30.0 + uTime * 0.45 + uShift) * cos(vUv.x * 13.0 - uTime * 0.3 + vUv.y * 2.2));
          float shimmer = 0.72 + 0.28 * sin(vUv.x * 42.0 - uTime * 0.9 + uShift);
          float a = edgeX * bot * top * rays * shimmer * (0.36 + 0.58 * uAuroraOn);
          vec3 emerald = vec3(0.22, 0.95, 0.65);
          vec3 teal = vec3(0.22, 0.72, 0.92);
          vec3 col = mix(emerald, teal, smoothstep(0.35, 0.92, vUv.y));
          gl_FragColor = vec4(col * a * 0.85, a);
        }`,
    });

    const buildArcCurtain = (radius, height, yBase, zCenter, arcSpan, shift) => {
      const segX = 48;
      const segY = 8;
      const geo = new THREE.PlaneGeometry(1, height, segX, segY);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) + 0.5;
        const ang = (u - 0.5) * arcSpan;
        pos.setX(i, Math.sin(ang) * radius);
        pos.setZ(i, zCenter - Math.cos(ang) * radius);
        pos.setY(i, pos.getY(i) + yBase);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, curtainShader(shift));
      mesh.userData.nonsolid = true;
      mesh.userData.fx = true;
      return mesh;
    };

    this.group.add(buildArcCurtain(220, 62, 68, 575, 1.45, 0));
    this.group.add(buildArcCurtain(260, 66, 78, 625, 1.35, 2.2));

    // 2. Wide, multi-layered Aurora Sky-Road rising from the snow approach up into the northern sky toward the Post Office
    const roadCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-6, 11.5, 158),
      new THREE.Vector3(-2, 16.5, 194),
      new THREE.Vector3(2, 21.5, 232),
      new THREE.Vector3(0, 24.5, 272),
      new THREE.Vector3(0, 24.2, 310),
    ]);
    this.roadCurve = roadCurve;

    const segs = 64;
    const pts = roadCurve.getSpacedPoints(segs);
    const up = new THREE.Vector3(0, 1, 0);

    // Wide glowing sky-road surface ribbon (width 8.8m)
    const ribbonPos = [];
    const ribbonUv = [];
    const ribbonIdx = [];
    const halfW = 4.4;

    // Twin luminous rising edge-curtains flanking the road so riding inside it feels unmistakable
    const wallPos = [];
    const wallUv = [];
    const wallIdx = [];
    const wallH = 4.8;

    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const p = pts[i];
      const tan = roadCurve.getTangent(u).normalize();
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      const bank = Math.sin(u * Math.PI * 2) * 0.12;

      for (let j = 0; j <= 4; j++) {
        const v = j / 4; // 0..1 across width
        const lat = (v - 0.5) * 2 * halfW;
        const dip = -Math.cos((v - 0.5) * Math.PI) * 0.28 + Math.abs(v - 0.5) * bank;
        ribbonPos.push(p.x + side.x * lat, p.y + dip, p.z + side.z * lat);
        ribbonUv.push(u, v);
      }

      if (i < segs) {
        const row = 5;
        for (let j = 0; j < 4; j++) {
          const a = i * row + j;
          const b = a + 1;
          const c = (i + 1) * row + j;
          const d = c + 1;
          ribbonIdx.push(a, c, b, b, c, d);
        }
      }

      // Left & right rising light-veils
      for (const sgn of [-1, 1]) {
        const bx = p.x + side.x * (sgn * halfW * 0.94);
        const bz = p.z + side.z * (sgn * halfW * 0.94);
        wallPos.push(bx, p.y - 0.1, bz);
        wallUv.push(u, 0);
        wallPos.push(bx + side.x * (sgn * 0.55), p.y + wallH, bz + side.z * (sgn * 0.55));
        wallUv.push(u, 1);
      }
    }

    for (let i = 0; i < segs; i++) {
      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        const base = i * 4 + sideIdx * 2;
        const next = (i + 1) * 4 + sideIdx * 2;
        wallIdx.push(base, next, base + 1, base + 1, next, next + 1);
      }
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonPos, 3));
    ribbonGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ribbonUv, 2));
    ribbonGeo.setIndex(ribbonIdx);
    ribbonGeo.computeVertexNormals();

    const ribbonMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: shared.uTime, uAuroraOn: shared.uAuroraOn },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec3 p = position;
          p.y += sin(uv.x * 22.0 - uTime * 1.8 + uv.y * 3.0) * 0.22;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAuroraOn;
        varying vec2 vUv;
        void main(){
          float ends = smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
          float across = sin(vUv.y * 3.14159265);
          float edgeGlow = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
          float lane = 0.5 + 0.5 * sin((vUv.y - 0.5) * 18.0 + sin(vUv.x * 16.0 - uTime * 2.0) * 1.5);
          float stream = 0.62 + 0.38 * sin(vUv.x * 48.0 - uTime * 3.6 + vUv.y * 4.0);
          float rim = pow(clamp(1.0 - abs(vUv.y - 0.5) * 2.0, 0.0, 1.0), 0.6);
          float edgeBand = smoothstep(0.32, 0.48, abs(vUv.y - 0.5)) * edgeGlow;
          vec3 emerald = vec3(0.22, 0.98, 0.68);
          vec3 teal = vec3(0.24, 0.80, 0.96);
          vec3 amber = vec3(0.98, 0.82, 0.46);
          vec3 col = mix(teal, emerald, across * 0.7 + lane * 0.3);
          col = mix(col, amber, edgeBand * 0.62);
          float a = ends * (0.34 * rim + 0.44 * across * stream + 0.38 * edgeBand) * (0.65 + 0.35 * uAuroraOn);
          gl_FragColor = vec4(col * a * 1.65, a);
        }`,
    });

    const roadMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    roadMesh.name = 'auroraSkyRoad';
    roadMesh.userData.nonsolid = true;
    roadMesh.userData.fx = true;
    this.group.add(roadMesh);

    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
    wallGeo.setIndex(wallIdx);

    const wallMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: shared.uTime, uAuroraOn: shared.uAuroraOn },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec3 p = position;
          p.x += sin(uv.x * 18.0 - uTime * 1.6) * 0.38 * uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAuroraOn;
        varying vec2 vUv;
        void main(){
          float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          float vert = smoothstep(0.0, 0.18, vUv.y) * pow(clamp(1.0 - vUv.y, 0.0001, 1.0), 1.6);
          float rays = 0.52 + 0.48 * sin(vUv.x * 65.0 - uTime * 2.8);
          vec3 col = mix(vec3(0.20, 0.96, 0.68), vec3(0.30, 0.76, 0.96), vUv.y);
          float a = ends * vert * rays * (0.40 + 0.42 * uAuroraOn);
          gl_FragColor = vec4(col * a * 1.45, a);
        }`,
    });

    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.name = 'auroraRoadCurtains';
    wallMesh.userData.nonsolid = true;
    wallMesh.userData.fx = true;
    this.group.add(wallMesh);
  }
}
