// The moss bed: heightfield terrain + wetness/water simulation + instanced moss shoots whose
// leaves curl (dry) or open into stars (wet) + glittering droplets on the leaf tips.
import * as THREE from '../lib/three.module.min.js';
import { tex, texRep } from './assets.js';
import { SUN_DIR, SUN_COLOR } from './room.js';

export const R = 0.152;          // moss bed radius (jar inner radius 0.156)
export const BASE_Y = 0.083;     // moss surface height near the glass
const N = 128;                   // simulation grid
const CELL = (2 * R) / N;

// creek: a shallow winding channel across the front of the bed (bridge goes here)
export const CREEK = [
  new THREE.Vector2(-0.135, 0.062), new THREE.Vector2(-0.085, 0.088), new THREE.Vector2(-0.03, 0.094),
  new THREE.Vector2(0.025, 0.083), new THREE.Vector2(0.075, 0.093), new THREE.Vector2(0.132, 0.072),
];
// track loop (ellipse) and house spot
export const TRACK = { cx: 0.0, cz: -0.035, rx: 0.102, rz: 0.080 };
export const HOUSE = { x: 0.004, z: -0.048 };

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z) { return vnoise(x, z) * 0.5 + vnoise(x * 2.1 + 5, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3 + 9) * 0.2; }

export function creekDist(x, z) {
  let best = 1e9, bt = 0, bi = 0;
  for (let i = 0; i < CREEK.length - 1; i++) {
    const a = CREEK[i], b = CREEK[i + 1];
    const abx = b.x - a.x, abz = b.y - a.y;
    let t = ((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz);
    t = Math.max(0, Math.min(1, t));
    const dx = x - (a.x + abx * t), dz = z - (a.y + abz * t);
    const d = Math.hypot(dx, dz);
    if (d < best) { best = d; bt = t; bi = i; }
  }
  return best;
}
export function creekDir(x, z) {
  let best = 1e9, dir = new THREE.Vector2(1, 0);
  for (let i = 0; i < CREEK.length - 1; i++) {
    const a = CREEK[i], b = CREEK[i + 1];
    const abx = b.x - a.x, abz = b.y - a.y;
    let t = ((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz);
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t));
    if (d < best) { best = d; dir.set(abx, abz).normalize(); }
  }
  return dir;
}

export function trackPoint(u, out = new THREE.Vector3()) {
  const a = u * Math.PI * 2;
  out.set(TRACK.cx + Math.cos(a) * TRACK.rx, 0, TRACK.cz + Math.sin(a) * TRACK.rz);
  return out;
}
function trackDist(x, z) {
  // approximate distance to ellipse
  const dx = (x - TRACK.cx) / TRACK.rx, dz = (z - TRACK.cz) / TRACK.rz;
  const r = Math.hypot(dx, dz);
  return Math.abs(r - 1) * Math.min(TRACK.rx, TRACK.rz);
}

// static ground shape (without the wet swelling)
export function groundH(x, z) {
  const r = Math.hypot(x, z);
  let h = BASE_Y;
  h += 0.024 * Math.exp(-((x - HOUSE.x) ** 2 + (z - HOUSE.z - 0.004) ** 2) / (2 * 0.042 * 0.042));
  h += 0.012 * Math.exp(-((x + 0.085) ** 2 + (z + 0.075) ** 2) / (2 * 0.03 * 0.03));
  h += 0.008 * Math.exp(-((x - 0.095) ** 2 + (z + 0.06) ** 2) / (2 * 0.028 * 0.028));
  h += 0.004 * (fbm(x * 60, z * 60) - 0.5);
  // edge slopes down slightly toward the glass
  h -= 0.004 * Math.max(0, (r - 0.12) / 0.032);
  // creek channel
  const cd = creekDist(x, z);
  h -= 0.0085 * Math.exp(-((cd / 0.0085) ** 2));
  // flatten house pad
  const hd = Math.hypot(x - HOUSE.x, z - HOUSE.z);
  if (hd < 0.04) {
    const hh = BASE_Y + 0.024 * 0.98;
    const t = Math.min(1, Math.max(0, (0.04 - hd) / 0.012));
    h = h + (hh - h) * t * 0.85;
  }
  return h;
}

// ------------------------------------------------------------------ shaders
const COMMON = /* glsl */`
uniform sampler2D uSim;
uniform float uR;
vec2 simUV(vec2 xz){ return xz / (2.0*uR) + 0.5; }
`;

export class Moss {
  constructor(scene, opts = {}) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.wet = new Float32Array(N * N);
    this.water = new Float32Array(N * N);   // standing water depth (m)
    this.tmp = new Float32Array(N * N);
    this.ground = new Float32Array(N * N);
    this.inside = new Uint8Array(N * N);
    this.creek = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -R + (i + 0.5) * CELL, z = -R + (j + 0.5) * CELL;
      const k = j * N + i;
      this.ground[k] = groundH(x, z);
      this.inside[k] = Math.hypot(x, z) < R - CELL * 0.5 ? 1 : 0;
      this.creek[k] = Math.exp(-((creekDist(x, z) / 0.008) ** 2));
      // a few faintly-alive spots so the dry bed is not uniform
      this.wet[k] = Math.max(0, (fbm(x * 30 + 3, z * 30) - 0.62)) * 0.25;
    }
    this.simData = new Uint8Array(N * N * 4);
    this.simTex = new THREE.DataTexture(this.simData, N, N, THREE.RGBAFormat);
    this.simTex.magFilter = THREE.LinearFilter; this.simTex.minFilter = THREE.LinearFilter;
    this.simTex.needsUpdate = true;
    this.dirty = true;
    this.uniforms = {
      uSim: { value: this.simTex }, uR: { value: R }, uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() }, uSunCol: { value: SUN_COLOR.clone() },
    };
    this.lowCount = !!opts.low;
    this._buildTerrain();
    this._buildShoots();
    this._buildDroplets();
    this._buildWater();
    this.upload();
  }

  // ---------------------------------------------------------------- terrain
  _buildTerrain() {
    const S = 150;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      let x = -R + (i / S) * 2 * R, z = -R + (j / S) * 2 * R;
      const r = Math.hypot(x, z);
      if (r > R) { x *= R / r; z *= R / r; }
      pos.push(x, groundH(x, z), z);
      uv.push(x * 9, -z * 9);
    }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const wetTex = tex('moss_wet_c_lo');
    const mat = new THREE.MeshStandardMaterial({
      map: tex('moss_dry_c_lo'), normalMap: tex('moss_n'), roughnessMap: tex('moss_orm'), aoMap: tex('moss_orm'),
      roughness: 1, metalness: 0, aoMapIntensity: 1.0, envMapIntensity: 0.6,
    });
    mat.normalScale.set(1.3, 1.3);
    this.terrainUniforms = { uWetMap: { value: wetTex }, uSand: { value: texRep('stone_c', 1, 1) } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms, this.terrainUniforms);
      sh.vertexShader = COMMON + 'varying vec2 vXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vXZ = position.xz;
        vec4 S0 = texture2D(uSim, simUV(position.xz));
        transformed.y += S0.r * 0.0035 * (1.0 - S0.b);
      `);
      sh.fragmentShader = COMMON + 'uniform sampler2D uWetMap; uniform sampler2D uSand; varying vec2 vXZ;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec4 S = texture2D(uSim, simUV(vXZ));
          float w = S.r; float water = S.g; float creek = S.b;
          vec3 dry = texture2D(map, vMapUv).rgb;
          vec3 lush = texture2D(uWetMap, vMapUv).rgb;
          float nz = texture2D(map, vMapUv * 0.21 + 0.3).r;
          float wv = w + (nz - 0.25) * 0.35;
          vec3 dull = mix(dry, lush * vec3(0.95, 0.86, 0.55) + dry * 0.25, 0.75);
          vec3 col = mix(dry, dull, smoothstep(0.08, 0.36, wv));
          col = mix(col, lush, smoothstep(0.32, 0.72, wv));
          col *= mix(1.0, 0.82, smoothstep(0.75, 1.1, w));             // saturated dark when soaked
          col *= mix(1.0, 0.6, smoothstep(0.0, 0.25, water));          // under standing water
          vec3 sand = texture2D(uSand, vMapUv * 1.7).rgb * vec3(0.55, 0.47, 0.38);
          sand *= mix(1.0, 0.55, smoothstep(0.1, 0.6, w));
          col = mix(col, sand, smoothstep(0.35, 0.8, creek));
          diffuseColor.rgb *= col;
        `)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          roughnessFactor *= texelRoughness.g * mix(1.05, 0.78, smoothstep(0.45, 1.05, w));
          roughnessFactor = mix(roughnessFactor, 0.35, smoothstep(0.0, 0.2, water));
        `)
        .replace('#include <normal_fragment_maps>', `
          #include <normal_fragment_maps>
        `);
    };
    mat.customProgramCacheKey = () => 'mossTerrain';
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.terrain = m;
    this.terrainMat = mat;
    this.group.add(m);
  }

  setHiRes() {
    this.terrainMat.map = tex('moss_dry_c');
    this.terrainUniforms.uWetMap.value = tex('moss_wet_c');
    this.terrainMat.needsUpdate = true;
  }

  // ---------------------------------------------------------------- moss shoots
  _buildShoots() {
    const WH = 7, LV = 5; // whorls x leaves
    const attr = [], idx = [], pos = [];
    let v = 0;
    for (let h = 0; h < WH; h++) {
      for (let l = 0; l < LV; l++) {
        const az = l * (Math.PI * 2 / LV) + h * 2.39996;
        const h01 = h / (WH - 1);
        // base, left, right, tip
        const verts = [[0, 0], [0.42, -1], [0.42, 1], [1, 0]];
        for (const [t, s] of verts) { attr.push(h01, az, t, s); pos.push(0, h01 * 0.004, 0); }
        idx.push(v, v + 1, v + 3, v, v + 3, v + 2);
        v += 4;
      }
    }
    // stem: two crossed thin quads
    for (let q = 0; q < 2; q++) {
      const az = q * Math.PI / 2;
      for (const [t, s] of [[0, -1], [0, 1], [1, -1], [1, 1]]) { attr.push(t, az, -1, s); pos.push(0, t * 0.004, 0); }
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      v += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(attr, 4));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.3);

    const count = this.lowCount ? 5200 : 8500;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = COMMON + `
        attribute vec4 aLeaf;
        uniform float uTime; uniform vec3 uSunDir;
        varying vec3 vMoss; varying float vTrans;
        float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      ` + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          vec4 S = texture2D(uSim, simUV(ip.xz));
          float wet = S.r;
          float rnd = h1(ip.xz * 1000.0);
          float wo = smoothstep(0.06, 0.7, wet + (rnd - 0.5) * 0.12);
          float h01 = aLeaf.x; float az = aLeaf.y; float t = aLeaf.z; float s = aLeaf.w;
          float stemH = 0.0048 * mix(0.6, 1.0, wo);
          vec3 lp; vec3 nrm;
          if (t < -0.5) {
            // stem quad
            float tt = h01;
            vec3 side = vec3(cos(az), 0.0, sin(az));
            lp = vec3(0.0, tt * stemH, 0.0) + side * s * 0.00022;
            nrm = vec3(-sin(az), 0.2, cos(az));
          } else {
            float azz = az + (1.0 - wo) * 1.5 * t + rnd * 6.283;
            float open = mix(0.20, 1.12, wo) * (1.0 - 0.32 * h01);
            float curl = (1.0 - wo) * 1.5 * t * t;
            float ang = open - curl;
            float L = 0.0021 * (1.0 - 0.40 * h01) * mix(0.72, 1.0, wo);
            vec3 dir = vec3(sin(ang) * cos(azz), cos(ang), sin(ang) * sin(azz));
            vec3 side = normalize(vec3(-sin(azz), 0.0, cos(azz)));
            float wd = 0.00026 * mix(0.45, 1.0, wo);
            lp = vec3(0.0, h01 * stemH, 0.0) + dir * L * t + side * wd * s;
            // leaf droops slightly at the tip when wet & heavy
            lp.y -= wo * 0.0006 * t * t;
            nrm = normalize(cross(side, dir));
            if (nrm.y < 0.0) nrm = -nrm;
            nrm = normalize(nrm + vec3(0.0, 0.6, 0.0));
          }
          // waterlogged shoots lie down under standing water
          float drown = smoothstep(0.03, 0.3, S.g);
          lp *= vec3(mix(1.0, 0.8, drown), mix(1.0, 0.3, drown), mix(1.0, 0.8, drown));
          vec3 objectNormal = nrm;
          // colour: dry tan/brown -> olive -> fresh green, tips lighter
          vec3 dryC = mix(vec3(0.16, 0.10, 0.05), vec3(0.30, 0.21, 0.12), rnd);
          dryC = mix(dryC, vec3(0.28, 0.26, 0.22), step(0.8, rnd) * 0.6);
          vec3 oliveC = vec3(0.13, 0.15, 0.05);
          vec3 greenC = mix(vec3(0.05, 0.16, 0.018), vec3(0.11, 0.25, 0.03), rnd);
          vec3 c = mix(dryC, oliveC, smoothstep(0.08, 0.36, wet));
          c = mix(c, greenC, smoothstep(0.32, 0.72, wet));
          float tipL = max(t, 0.0) * (0.35 + 0.65 * h01);
          c *= 0.55 + 0.75 * tipL;
          c += vec3(0.05, 0.07, 0.0) * tipL * wo;
          vMoss = c;
          vTrans = wo;
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3(1.0, 0.0, 0.0);
          #endif
        `)
        .replace('#include <begin_vertex>', 'vec3 transformed = lp;');
      sh.fragmentShader = `
        uniform vec3 uSunDir; uniform vec3 uSunCol;
        varying vec3 vMoss; varying float vTrans;
      ` + sh.fragmentShader
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vMoss;')
        .replace('#include <emissivemap_fragment>', `
          // light transmitted through thin leaves when the low sun is behind them
          vec3 Vw = normalize(vViewPosition);
          float back = pow(clamp(dot(-Vw, (viewMatrix * vec4(uSunDir, 0.0)).xyz), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uSunCol * vMoss * (0.35 + 1.1 * vTrans) * back * 1.4;
        `);
    };
    mat.customProgramCacheKey = () => 'mossShoot';
    const im = new THREE.InstancedMesh(g, mat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0, tries = 0;
    this.shootPos = [];
    while (n < count && tries < count * 20) {
      tries++;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (R - 0.003);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (creekDist(x, z) < 0.0065) continue;
      if (Math.hypot(x - HOUSE.x, z - HOUSE.z) < 0.026) continue;
      if (trackDist(x, z) < 0.0045) continue;
      const clump = fbm(x * 70, z * 70);
      if (Math.random() > 0.35 + clump) continue;
      p.set(x, groundH(x, z) - 0.0012, z);
      q.setFromAxisAngle(up, Math.random() * 6.283);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), (Math.random() - 0.5) * 0.5);
      q.premultiply(tilt);
      const s = 0.75 + Math.random() * 0.6 + clump * 0.3;
      sc.set(s, s * (0.8 + Math.random() * 0.4), s);
      m4.compose(p, q, sc);
      im.setMatrixAt(n, m4);
      this.shootPos.push(x, z);
      n++;
    }
    im.count = n;
    im.frustumCulled = false;
    im.receiveShadow = true;
    this.shoots = im;
    this.group.add(im);
  }

  // ---------------------------------------------------------------- droplets (sphere impostors)
  _buildDroplets() {
    const count = this.lowCount ? 1600 : 2800;
    const pos = new Float32Array(count * 3), rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (R - 0.004);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos[i * 3] = x; pos[i * 3 + 1] = groundH(x, z) + 0.0012 + Math.random() * 0.0028; pos[i * 3 + 2] = z;
      rnd[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { ...this.uniforms, uScale: { value: 600 }, uExposure: { value: 1 } },
      vertexShader: COMMON + `
        attribute float aRnd; uniform float uScale; uniform float uTime;
        varying float vA; varying vec2 vSun; varying float vR;
        uniform vec3 uSunDir;
        void main(){
          vec4 S = texture2D(uSim, simUV(position.xz));
          float w = S.r;
          float show = smoothstep(0.72 + aRnd * 0.18, 0.98 + aRnd * 0.1, w) * (1.0 - smoothstep(0.05, 0.2, S.g)) * (1.0 - S.b);
          vec3 p = position; p.y += w * 0.0035;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float size = (0.0007 + aRnd * aRnd * 0.0011) * show;
          gl_PointSize = size * uScale / -mv.z;
          vA = show; vR = aRnd;
          vec3 sv = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
          vSun = normalize(sv.xy + 0.0001);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; varying vec2 vSun; varying float vR;
        uniform vec3 uSunCol; uniform float uTime;
        void main(){
          vec2 q = gl_PointCoord * 2.0 - 1.0; q.y = -q.y;
          float r2 = dot(q, q);
          if (r2 > 1.0 || vA < 0.01) discard;
          float z = sqrt(1.0 - r2);
          vec3 n = vec3(q, z);
          // environment: bright window behind/above, darker room
          float rim = pow(1.0 - z, 1.6);
          vec3 refl = mix(vec3(0.10, 0.12, 0.10), vec3(1.15, 1.18, 1.2), smoothstep(0.1, 0.9, n.y * 0.6 + 0.45));
          // refraction: inverted bright window at the bottom of the drop
          vec3 refr = vec3(0.55, 0.75, 0.45) * smoothstep(-0.2, -0.9, n.y) * 1.3 + vec3(0.07, 0.12, 0.04);
          vec3 col = mix(refr, refl, 0.25 + 0.75 * rim);
          // sun glint
          vec2 gp = vSun * 0.45;
          float tw = 0.75 + 0.25 * sin(uTime * 3.0 + vR * 40.0);
          float glint = exp(-dot(q - gp, q - gp) * 90.0) * 6.0 * tw;
          col += uSunCol * glint;
          col *= 1.0 - 0.55 * smoothstep(0.82, 1.0, sqrt(r2)) * (1.0 - n.y);
          float a = vA * (0.55 + 0.45 * rim + glint);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    this.droplets = pts;
    this.dropMat = mat;
    this.group.add(pts);
  }

  // ---------------------------------------------------------------- standing water surface
  _buildWater() {
    const S = 96;
    const pos = [], idx = [];
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      let x = -R + (i / S) * 2 * R, z = -R + (j / S) * 2 * R;
      const r = Math.hypot(x, z);
      if (r > R) { x *= R / r; z *= R / r; }
      pos.push(x, groundH(x, z), z);
    }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x1d2a1a, roughness: 0.03, metalness: 0, transparent: true, envMapIntensity: 2.6,
      specularIntensity: 1, ior: 1.33, depthWrite: false,
    });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = COMMON + 'varying float vDepth; varying vec2 vXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec4 S = texture2D(uSim, simUV(position.xz));
        vDepth = S.g; vXZ = position.xz;
        transformed.y += S.g * 0.006 + 0.0012 * smoothstep(0.0, 0.05, S.g) + S.r * 0.0022;
      `);
      sh.fragmentShader = 'uniform float uTime; varying float vDepth; varying vec2 vXZ;\n' + sh.fragmentShader
        .replace('#include <normal_fragment_begin>', `
          #include <normal_fragment_begin>
          vec2 rp = vXZ * 900.0;
          vec3 rip = vec3(sin(rp.x + uTime * 2.3) + sin(rp.y * 1.3 - uTime * 1.7), 0.0, cos(rp.y + uTime * 2.0) + sin(rp.x * 0.8 + rp.y * 0.6 + uTime));
          normal = normalize(normal + (viewMatrix * vec4(rip * 0.05, 0.0)).xyz);
        `)
        .replace('#include <opaque_fragment>', `
          float a = smoothstep(0.02, 0.12, vDepth);
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
          gl_FragColor = vec4(outgoingLight, a * (0.35 + 0.6 * fres));
        `);
    };
    mat.customProgramCacheKey = () => 'mossWater';
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 3;
    this.waterMesh = m;
    this.group.add(m);
  }

  // ---------------------------------------------------------------- simulation API
  idx(x, z) {
    const i = Math.floor((x + R) / CELL), j = Math.floor((z + R) / CELL);
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    return j * N + i;
  }
  wetAt(x, z) { const k = this.idx(x, z); return k < 0 ? 0 : this.wet[k]; }
  waterAt(x, z) { const k = this.idx(x, z); return k < 0 ? 0 : this.water[k]; }
  heightAt(x, z) {
    const k = this.idx(x, z);
    const w = k < 0 ? 0 : this.wet[k];
    return groundH(x, z) + Math.min(w, 1) * 0.0035;
  }
  surfaceAt(x, z) {
    const k = this.idx(x, z);
    return this.heightAt(x, z) + (k < 0 ? 0 : this.water[k]);
  }

  // add wetness with a soft gaussian footprint
  addWet(x, z, amount, rad) {
    const rc = Math.ceil(rad * 2 / CELL);
    const ci = Math.floor((x + R) / CELL), cj = Math.floor((z + R) / CELL);
    for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const k = j * N + i;
      if (!this.inside[k]) continue;
      const px = -R + (i + 0.5) * CELL, pz = -R + (j + 0.5) * CELL;
      const d2 = ((px - x) ** 2 + (pz - z) ** 2) / (rad * rad);
      if (d2 > 4) continue;
      const add = amount * Math.exp(-d2);
      const w = this.wet[k];
      // moss absorbs fast while dry, then saturates; extra becomes standing water
      const cap = 1.0;
      if (w < cap) this.wet[k] = Math.min(cap + 0.05, w + add * (1.15 - w * 0.6));
      else this.water[k] += add * 0.00012;
    }
    this.dirty = true;
  }
  addWater(x, z, depth, rad) {
    const rc = Math.ceil(rad * 2 / CELL);
    const ci = Math.floor((x + R) / CELL), cj = Math.floor((z + R) / CELL);
    for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const k = j * N + i;
      if (!this.inside[k]) continue;
      const px = -R + (i + 0.5) * CELL, pz = -R + (j + 0.5) * CELL;
      const d2 = ((px - x) ** 2 + (pz - z) ** 2) / (rad * rad);
      if (d2 > 4) continue;
      const a = Math.exp(-d2);
      this.water[k] += depth * a;
      this.wet[k] = Math.min(1.05, this.wet[k] + a * 0.5);
    }
    this.dirty = true;
  }
  // dropper: suck standing water around (x,z); returns volume-ish amount removed
  suck(x, z, rad, rate) {
    const rc = Math.ceil(rad * 1.5 / CELL);
    const ci = Math.floor((x + R) / CELL), cj = Math.floor((z + R) / CELL);
    let got = 0;
    for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const k = j * N + i;
      const px = -R + (i + 0.5) * CELL, pz = -R + (j + 0.5) * CELL;
      const d2 = ((px - x) ** 2 + (pz - z) ** 2) / (rad * rad);
      if (d2 > 2.25) continue;
      const keep = this.creek[k] > 0.5 ? 0.0012 : 0; // the creek keeps a little stream
      const take = Math.min(Math.max(0, this.water[k] - keep), rate * Math.exp(-d2 * 0.7));
      this.water[k] -= take;
      got += take;
    }
    if (got > 0) this.dirty = true;
    return got;
  }

  step(dt) {
    // shallow-water-ish flow: water moves toward lower free surface; soaks slowly into moss
    const W = this.water, G = this.ground, T = this.tmp;
    let any = false;
    for (let k = 0; k < N * N; k++) if (W[k] > 1e-6) { any = true; break; }
    if (any) {
      for (let it = 0; it < 2; it++) {
        T.set(W);
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
          const k = j * N + i;
          if (!this.inside[k] || W[k] <= 1e-7) continue;
          const s = G[k] + W[k];
          const nb = [k - 1, k + 1, k - N, k + N];
          let tot = 0; const fl = [0, 0, 0, 0];
          for (let q = 0; q < 4; q++) {
            const n = nb[q];
            if (!this.inside[n]) continue;
            const d = s - (G[n] + W[n]);
            if (d > 0) { fl[q] = d * 0.22; tot += fl[q]; }
          }
          if (tot <= 0) continue;
          const sc = Math.min(1, W[k] / tot);
          for (let q = 0; q < 4; q++) if (fl[q] > 0) { T[k] -= fl[q] * sc; T[nb[q]] += fl[q] * sc; }
        }
        W.set(T);
      }
      for (let k = 0; k < N * N; k++) {
        if (W[k] > 0) {
          if (this.wet[k] < 1.0) { const s = Math.min(W[k], dt * 0.0004); W[k] -= s; this.wet[k] += s * 400; }
          if (W[k] < 2e-6) W[k] = 0;
        }
      }
      this.dirty = true;
    }
    // gentle capillary spreading of wetness (keeps edges soft, never dries out)
    this._spreadT = (this._spreadT || 0) + dt;
    if (this._spreadT > 0.25) {
      this._spreadT = 0;
      const w = this.wet;
      T.set(w);
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        if (!this.inside[k]) continue;
        const avg = (w[k - 1] + w[k + 1] + w[k - N] + w[k + N]) * 0.25;
        if (avg > w[k]) T[k] = w[k] + (avg - w[k]) * 0.04;
      }
      w.set(T);
      this.dirty = true;
    }
    this.uniforms.uTime.value += dt;
    if (this.dirty) this.upload();
  }

  upload() {
    const d = this.simData;
    for (let k = 0; k < N * N; k++) {
      d[k * 4] = Math.min(255, this.wet[k] * 240);
      d[k * 4 + 1] = Math.min(255, this.water[k] / 0.006 * 255);
      d[k * 4 + 2] = this.creek[k] * 255;
      d[k * 4 + 3] = 255;
    }
    this.simTex.needsUpdate = true;
    this.dirty = false;
  }

  coverage(th = 0.4) {
    let c = 0, t = 0;
    for (let k = 0; k < N * N; k++) if (this.inside[k] && this.creek[k] < 0.5) { t++; if (this.wet[k] > th) c++; }
    return c / t;
  }
  flood() {
    let s = 0;
    for (let k = 0; k < N * N; k++) if (this.creek[k] < 0.4) s += Math.max(0, this.water[k] - 0.0002);
    return s;
  }
  floodCenter() {
    let sx = 0, sz = 0, s = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const w = this.creek[k] < 0.4 ? Math.max(0, this.water[k] - 0.0002) : 0;
      if (w > 0) { sx += (-R + (i + 0.5) * CELL) * w; sz += (-R + (j + 0.5) * CELL) * w; s += w; }
    }
    return s > 0 ? new THREE.Vector2(sx / s, sz / s) : null;
  }

  // ray vs moss heightfield (inside the jar)
  raycast(ray) {
    const o = ray.origin, d = ray.direction;
    // start where the ray is 0.06 above the bed
    let t = (BASE_Y + 0.07 - o.y) / d.y;
    if (!(t > 0)) t = 0;
    const p = new THREE.Vector3();
    let prevAbove = true;
    for (let k = 0; k < 400; k++) {
      p.copy(o).addScaledVector(d, t);
      if (p.y < BASE_Y - 0.03) return null;
      const r = Math.hypot(p.x, p.z);
      const h = r < R ? this.surfaceAt(p.x, p.z) : -1;
      if (r < R && p.y <= h) {
        // refine
        let a = t - 0.0015, b = t;
        for (let q = 0; q < 6; q++) {
          const m = (a + b) / 2;
          p.copy(o).addScaledVector(d, m);
          if (p.y <= this.surfaceAt(p.x, p.z)) b = m; else a = m;
        }
        p.copy(o).addScaledVector(d, b);
        return p.clone();
      }
      t += 0.0015;
    }
    return null;
  }
}
