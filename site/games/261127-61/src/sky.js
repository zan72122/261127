// Sky dome with sun, moon, stars and twilight; lighting parameters derived from the sun/moon.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

export const SUN_DISC = 1.15 * Math.PI / 180;   // angular radius used for the drawn disc (a low sun looks large)
export const MOON_DISC = 0.95 * Math.PI / 180;

export function makeSky() {
  const uni = {
    uSun: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uMoon: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
    uSunVis: { value: 1 }, uMoonVis: { value: 0 },
    uDay: { value: 1 },        // 0 night .. 1 day
    uGold: { value: 0 },       // sunset intensity
    uStars: { value: 0 },
    uTime: { value: 0 },
    uGlow: { value: 0 },       // hint glow around the active sky object
    uGlowDir: { value: new THREE.Vector3(0, 0, -1) },
    uDisc: { value: new THREE.Vector2(SUN_DISC, MOON_DISC) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uSun, uMoon, uGlowDir; uniform float uSunVis, uMoonVis, uDay, uGold, uStars, uTime, uGlow; uniform vec2 uDisc;
      ${NOISE}
      vec3 skyCol(vec3 v){
        float h = max(v.y, 0.0);
        vec3 sunH = normalize(vec3(uSun.x, 0.0, uSun.z));
        vec3 vH = normalize(vec3(v.x, 0.0001, v.z));
        float az = dot(vH, sunH)*0.5+0.5;            // 1 toward the sun azimuth
        float se = uSun.y;
        // day
        vec3 dayZen = vec3(0.06,0.17,0.50), dayHor = vec3(0.48,0.58,0.72);
        vec3 day = mix(dayHor, dayZen, pow(h, 0.45));
        // sunset / sunrise
        vec3 goldHor = mix(vec3(0.42,0.36,0.46), vec3(1.15,0.52,0.16), pow(az, 1.8));
        vec3 goldMid = mix(vec3(0.20,0.24,0.46), vec3(0.78,0.48,0.30), pow(az, 2.4));
        vec3 goldZen = vec3(0.05,0.11,0.32);
        vec3 gold = mix(goldHor, goldMid, smoothstep(0.0, 0.18, h));
        gold = mix(gold, goldZen, smoothstep(0.10, 0.6, h));
        // night (moonlit blue, never black)
        vec3 nightZen = vec3(0.012,0.022,0.06), nightHor = vec3(0.04,0.06,0.12);
        vec3 night = mix(nightHor, nightZen, pow(h, 0.5));
        // twilight glow band where the sun is just below the horizon
        float tw = smoothstep(-0.2, -0.01, se) * (1.0 - smoothstep(0.0, 0.06, se));
        vec3 col = mix(night, day, uDay);
        col = mix(col, gold, uGold);
        col += tw * vec3(0.55,0.22,0.08) * pow(az, 3.0) * exp(-h*9.0);
        // sun glow (mie)
        float cs = dot(v, uSun);
        col += uSunVis * (vec3(1.0,0.62,0.30)*0.35*pow(max(cs,0.0), 12.0) + vec3(1.0,0.75,0.45)*0.9*pow(max(cs,0.0), 220.0)) * (0.5 + 0.5*uGold);
        // moon glow
        float cm = dot(v, uMoon);
        col += uMoonVis * vec3(0.35,0.42,0.6) * (0.08*pow(max(cm,0.0), 30.0) + 0.25*pow(max(cm,0.0), 600.0));
        return col;
      }
      void main(){
        vec3 v = normalize(vDir);
        vec3 col = skyCol(v);
        // stars
        if (uStars > 0.01 && v.y > 0.0) {
          vec3 sp = v * 420.0; vec3 id = floor(sp); vec3 f = fract(sp) - 0.5;
          float r = h31(id);
          if (r > 0.985) {
            vec3 o = (h33(id) - 0.5) * 0.6;
            float d = length(f - o);
            float tw = 0.75 + 0.25*sin(uTime*(1.0+r*3.0) + r*40.0);
            col += uStars * smoothstep(0.16, 0.0, d) * (r - 0.985) * 66.0 * tw * vec3(0.85,0.9,1.0) * smoothstep(0.0, 0.15, v.y);
          }
        }
        // sun disc with limb darkening, reddened near the horizon
        float ds = acos(clamp(dot(v, uSun), -1.0, 1.0));
        float disc = smoothstep(uDisc.x, uDisc.x*0.93, ds);
        vec3 sunCol = mix(vec3(1.6,0.55,0.18), vec3(2.2,1.7,1.2), smoothstep(0.02, 0.25, uSun.y));
        float limb = 1.0 - 0.35*pow(ds/uDisc.x, 2.0);
        col = mix(col, sunCol*limb*2.0, disc*uSunVis*step(0.0, v.y));
        // moon disc with maria
        float dm = acos(clamp(dot(v, uMoon), -1.0, 1.0));
        float mdisc = smoothstep(uDisc.y, uDisc.y*0.92, dm);
        vec3 mt = normalize(cross(uMoon, vec3(0.0,1.0,0.0)));
        vec3 mb = cross(mt, uMoon);
        vec2 mp = vec2(dot(v - uMoon, mt), dot(v - uMoon, mb)) / uDisc.y;
        float maria = smoothstep(0.45, 0.75, fbm2(mp*2.2 + 3.0));
        vec3 moonCol = vec3(1.05,1.05,1.0) * (1.0 - 0.28*maria) * (0.92 + 0.08*fbm2(mp*9.0));
        col = mix(col, moonCol*1.4, mdisc*uMoonVis*step(0.0, v.y));
        // hint glow (soft pulsing halo around the active object)
        float dg = acos(clamp(dot(v, uGlowDir), -1.0, 1.0));
        col += uGlow * vec3(1.0,0.85,0.55) * 0.35 * exp(-pow(dg/(uDisc.x*3.2), 2.0));
        // below the horizon: haze
        col = mix(col, skyCol(normalize(vec3(v.x, 0.0, v.z))) * 0.85, smoothstep(0.0, -0.05, v.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, uni };
}

// direction from (elevation, azimuth) in radians; azimuth 0 = -Z (north-ish), positive toward +X
export function dirFromElAz(el, az, out = new THREE.Vector3()) {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}
