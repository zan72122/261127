// Ground: savanna soil and grass cover, flattened-grass trace from the press map, hoof prints.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { shared, PRESS } from './grass.js';
import { LIGHT } from './giraffe.js';

export function makeGround() {
  const g = new THREE.CircleGeometry(420, 96, 0, Math.PI * 2);
  // densify near the centre for nicer shadow / fog interpolation
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uni = { uMeadow: { value: 4.8 }, uLow: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW; uniform sampler2D uPress; uniform float uMeadow; uniform float uLow; uniform vec3 uKeyDir; uniform float uDew;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vW.xz;
        float r = length(p);
        float n1 = fbm2(p*0.35), n2 = fbm2(p*2.1+5.0), n3 = vnoise2(p*11.0), n4 = vnoise2(p*37.0);
        vec3 soil = mix(vec3(0.24,0.16,0.10), vec3(0.34,0.24,0.15), n2);
        vec3 dry = mix(vec3(0.30,0.25,0.14), vec3(0.44,0.36,0.21), n1);
        dry = mix(dry, vec3(0.22,0.18,0.10), smoothstep(0.5,0.9,vnoise2(p*5.0))*0.5);
        vec3 shortG = mix(vec3(0.27,0.27,0.13), vec3(0.40,0.37,0.19), n2*0.7+n3*0.3);
        float meadow = 1.0 - smoothstep(uMeadow-1.2, uMeadow+0.9, r + (n1-0.5)*2.2);
        float bare = smoothstep(0.55, 0.75, n2) * 0.55 * (1.0 - meadow*0.7);
        vec3 col = mix(dry, shortG, meadow);
        col = mix(col, soil, bare);
        col *= 0.86 + 0.18*n3 + 0.08*n4;
        // flattened grass: laid blades are smoother and catch the low light, with darker torn edges
        vec2 puv = p / ${PRESS.size.toFixed(1)} + 0.5;
        float pr = 0.0;
        if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
          pr = texture2D(uPress, puv).r;
          float e = 1.5 / ${PRESS.res.toFixed(1)};
          float prx = texture2D(uPress, puv+vec2(e,0.0)).r - texture2D(uPress, puv-vec2(e,0.0)).r;
          float prz = texture2D(uPress, puv+vec2(0.0,e)).r - texture2D(uPress, puv-vec2(0.0,e)).r;
          float edge = clamp(length(vec2(prx,prz))*3.0, 0.0, 1.0);
          float lowK = 0.45 + 1.1*uLow;
          col = mix(col, col*vec3(1.30,1.24,1.10) + vec3(0.07,0.06,0.03), pr*lowK*0.85);
          col *= 1.0 - edge*0.35*lowK;
          // sheen along the laid direction
          float pa = vnoise2(p*1.3)*6.2832;
          vec3 ld = vec3(cos(pa), 0.0, sin(pa));
          col += pr * uLow * 0.18 * pow(max(dot(normalize(reflect(-uKeyDir, ld)), normalize(cameraPosition - vW)), 0.0), 4.0);
        }
        // standing grass self-shadowing in low light makes the trace stand out
        col *= 1.0 - (1.0-pr) * uLow * 0.32 * meadow;
        // morning dew: grey-silver over the grass, dark where the body lay overnight
        float dewK = uDew * (0.4 + 0.6*meadow);
        col = mix(col, col*1.2 + vec3(0.09,0.10,0.12), dewK*(1.0-pr));
        col *= 1.0 - uDew*pr*0.45;
        diffuseColor.rgb = col;`);
  };
  m.customProgramCacheKey = () => 'ground';
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return { mesh, uni };
}

// --- hoof prints (cloven, two half-moons), multiplied onto the ground -----------------------------
export function makePrints(max = 260) {
  const g = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1); base.rotateX(-Math.PI / 2);
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
  const a = new Float32Array(max * 4), b = new Float32Array(max * 2);
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(a, 4)); // x, z, yaw, size
  g.setAttribute('iB', new THREE.InstancedBufferAttribute(b, 2)); // strength, seed
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uKeyDir: LIGHT.dir, uLow: { value: 0 }, uNight: { value: 0 } },
    transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.MultiplyBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute vec4 iA; attribute vec2 iB; varying vec2 vUv; varying vec2 vB; varying float vYaw;
      void main(){ vUv = uv; vB = iB; vYaw = iA.z; float c = cos(iA.z), s = sin(iA.z);
        vec3 p = position * iA.w; vec3 q = vec3(p.x*c - p.z*s, 0.004, p.x*s + p.z*c) + vec3(iA.x, 0.0, iA.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec2 vB; varying float vYaw; uniform vec3 uKeyDir; uniform float uLow;
      float claw(vec2 p, float side){
        // one digit: rounded half-moon
        p.x -= side*0.12;
        vec2 q = p / vec2(0.115, 0.36);
        float d = length(q) - 1.0;
        d = max(d, -(p.x*side) - 0.005);
        return d;
      }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(1.0, 1.0);
        p.y *= 1.0;
        float d = min(claw(p, 1.0), claw(p, -1.0));
        float inside = smoothstep(0.08, -0.04, d);
        float rim = smoothstep(0.25, 0.05, abs(d - 0.12));
        // light from the side: the wall facing away is shadowed
        vec2 ld = normalize(vec2(uKeyDir.x, uKeyDir.z) + 1e-4);
        float c = cos(-vYaw), s = sin(-vYaw);
        vec2 lp = vec2(ld.x*c - ld.y*s, ld.x*s + ld.y*c);
        float wall = clamp(dot(normalize(p + 1e-4), lp), -1.0, 1.0);
        float k = vB.x * (0.35 + 0.65*uLow);
        float dark = inside * (0.22 + 0.25*max(wall, 0.0)) + rim * 0.06 * max(-wall, 0.0);
        float m = 1.0 - dark * k;
        gl_FragColor = vec4(vec3(m), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1;
  let n = 0, head = 0;
  return {
    mesh, mat,
    add(x, z, yaw, size = 0.26, strength = 1) {
      const i = head; head = (head + 1) % max; n = Math.min(max, n + 1);
      a[i * 4] = x; a[i * 4 + 1] = z; a[i * 4 + 2] = yaw; a[i * 4 + 3] = size;
      b[i * 2] = strength; b[i * 2 + 1] = Math.random();
      g.attributes.iA.needsUpdate = true; g.attributes.iB.needsUpdate = true;
      g.instanceCount = n;
    },
    fade(k) { for (let i = 0; i < n; i++) b[i * 2] *= k; g.attributes.iB.needsUpdate = true; },
    count: () => n,
    list() { const out = []; for (let i = 0; i < n; i++) out.push([a[i * 4], a[i * 4 + 1], b[i * 2]]); return out; },
  };
}
