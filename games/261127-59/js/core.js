// Core: renderer, camera, sky/environment, sun, post-processing (DOF + ACES + sRGB)
import * as THREE from './three.module.min.js';

export const T = THREE;
export const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // done in post pass (ACES)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 120);

// ------------------------------------------------------------ texture loading
const loader = new THREE.TextureLoader();
const texCache = {};
export function tex(name, { srgb = false, repeat = null, aniso = 8, onLoad = null } = {}) {
  const key = name + (srgb ? ':s' : '');
  if (texCache[key]) return texCache[key];
  const t = loader.load('tex/' + name, onLoad || undefined);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(aniso, renderer.capabilities.getMaxAnisotropy());
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  texCache[key] = t;
  return t;
}
// swap a low-res texture for its high-res version once loaded (fast first paint)
export function progressiveTex(small, big, opts, apply) {
  const s = tex(small, opts);
  apply(s);
  return () => {
    const b = tex(big, { ...opts, onLoad: () => apply(b) });
  };
}

// ------------------------------------------------------------ sun & sky
// Late-November morning, ~9:30. Sun low (24 deg) from front-left => backlit leaves.
export const SUN_DIR = new THREE.Vector3(-0.80, 0.44, -0.16).normalize(); // direction TO the sun
export const SUN_COLOR = new THREE.Color().setRGB(1.0, 0.84, 0.66); // ~4700K
export const sun = new THREE.DirectionalLight(SUN_COLOR, 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 3;
const sc = sun.shadow.camera;
sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 40;
scene.add(sun, sun.target);
export function placeSun(center) {
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(SUN_DIR, 20);
  sun.target.updateMatrixWorld();
}
placeSun(new THREE.Vector3(0, 0, -3));

export const hemi = new THREE.HemisphereLight(new THREE.Color(0.62, 0.74, 1.0), new THREE.Color(0.42, 0.34, 0.26), 0.45);
scene.add(hemi);

const skyVS = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,0.0)).xyz); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFS = `
uniform vec3 uSun; uniform float uEnvPass; varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=0.5;} return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  // clear late-autumn sky: deep blue zenith, pale warm horizon
  vec3 zen = vec3(0.13, 0.30, 0.78);
  vec3 hor = vec3(0.78, 0.82, 0.86);
  vec3 col = mix(hor, zen, pow(clamp(y,0.0,1.0), 0.55));
  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0,0.78,0.52) * (pow(sd, 8.0)*0.55 + pow(sd, 64.0)*1.2);
  // sun disc (HDR)
  col += vec3(1.0,0.9,0.75) * smoothstep(0.9993, 0.9997, sd) * 60.0 * uEnvPass;
  // soft cirrus / small cumulus
  if (y > 0.02) {
    vec2 cp = d.xz / (y + 0.15) * 1.6;
    float c = smoothstep(0.55, 0.85, fbm(cp + vec2(3.0, 1.0)));
    vec3 cc = mix(vec3(0.95,0.95,0.97), vec3(1.0,0.9,0.78), pow(sd,4.0));
    col = mix(col, cc * (0.9 + 0.5*pow(sd,6.0)), c * 0.7 * smoothstep(0.02, 0.25, y));
  }
  // ground hemisphere for env lighting: warm stone + leaves bounce
  if (y < 0.0) {
    vec3 gcol = mix(vec3(0.36,0.30,0.24), vec3(0.30,0.24,0.18), smoothstep(0.0,-0.4,y));
    col = mix(hor*0.7, gcol, smoothstep(0.0, -0.06, y));
  }
  gl_FragColor = vec4(col, 1.0);
}`;
export function makeSky(envPass) {
  const m = new THREE.ShaderMaterial({
    vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: SUN_DIR.clone() }, uEnvPass: { value: envPass ? 1 : 0 } },
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), m);
  s.frustumCulled = false;
  s.renderOrder = -10;
  return s;
}
export const skyMesh = makeSky(false);
scene.add(skyMesh);

// HDR-ish environment: sky + simple surroundings (facade, trees) baked into PMREM
export function buildEnvironment(extraObjects = []) {
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky(true));
  // warm brick facade block behind, autumn tree masses at sides, bright sunlit ground
  const add = (geo, color, pos, emissive = 0) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pos);
    envScene.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(30, 6, 1), new THREE.Color(0.16, 0.085, 0.06), new THREE.Vector3(0, 3, -9));
  add(new THREE.SphereGeometry(4, 16, 8), new THREE.Color(0.55, 0.36, 0.05), new THREE.Vector3(-8, 5, -4));
  add(new THREE.SphereGeometry(3.5, 16, 8), new THREE.Color(0.45, 0.08, 0.04), new THREE.Vector3(8, 4.5, -3));
  add(new THREE.CircleGeometry(20, 32).rotateX(-Math.PI / 2), new THREE.Color(0.42, 0.36, 0.30), new THREE.Vector3(0, -0.5, 0));
  extraObjects.forEach((o) => envScene.add(o));
  const rt = pm.fromScene(envScene, 0.02, 0.1, 100);
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.85;
  pm.dispose();
}

// ------------------------------------------------------------ post: DOF + ACES + grain
let rt = null;
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null }, tDepth: { value: null },
    uNear: { value: camera.near }, uFar: { value: camera.far },
    uFocus: { value: 3.0 }, uAperture: { value: 0.02 }, uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.25 }, uTime: { value: 0 }, uFade: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
  precision highp float;
  uniform sampler2D tColor; uniform sampler2D tDepth; uniform float uNear, uFar, uFocus, uAperture, uExposure, uTime, uFade; uniform vec2 uRes;
  varying vec2 vUv;
  float lin(float d){ float z = d*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); }
  float coc(float z){ return clamp(abs(1.0/uFocus - 1.0/z) * uAperture * uRes.y, 0.0, 6.0); }
  vec3 RRTAndODTFit(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }
  vec3 aces(vec3 c){
    const mat3 i=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
    const mat3 o=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
    c *= uExposure/0.6; c = i*c; c = RRTAndODTFit(c); c = o*c; return clamp(c,0.0,1.0);
  }
  vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
  void main(){
    float dr = texture2D(tDepth, vUv).r;
    float zc = lin(dr);
    float r = (dr <= 0.0 || dr >= 0.99999) ? 0.0 : coc(zc); // no depth (or sky): keep sharp
    vec3 col = texture2D(tColor, vUv).rgb;
    if (r > 0.6) {
      vec3 acc = col; float wsum = 1.0;
      vec2 px = 1.0/uRes;
      for (int i=0;i<12;i++){
        float a = float(i)*2.39996; float rr = sqrt((float(i)+0.5)/12.0) * r;
        vec2 o = vec2(cos(a), sin(a)) * rr * px;
        float zs = lin(texture2D(tDepth, vUv+o).r);
        float w = clamp(coc(zs)/max(r,0.001), 0.0, 1.0);
        acc += texture2D(tColor, vUv+o).rgb * w; wsum += w;
      }
      col = acc/wsum;
    }
    col = aces(col);
    // gentle vignette like a real lens
    vec2 q = vUv - 0.5; col *= 1.0 - dot(q,q)*0.35;
    col = toSRGB(col);
    col += (hash(vUv*uRes) - 0.5) * 0.012; // film grain
    col = mix(col, vec3(1.0, 0.98, 0.95), uFade);
    gl_FragColor = vec4(col, 1.0);
  }`,
  depthTest: false, depthWrite: false,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
export const post = postMat.uniforms;

export let viewW = 1, viewH = 1, pixelRatio = 1;
export function resize() {
  viewW = window.innerWidth; viewH = window.innerHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(viewW, viewH, false);
  canvas.style.width = viewW + 'px'; canvas.style.height = viewH + 'px';
  camera.aspect = viewW / viewH;
  camera.updateProjectionMatrix();
  const w = Math.floor(viewW * pixelRatio), h = Math.floor(viewH * pixelRatio);
  if (rt) rt.dispose();
  const dt = new THREE.DepthTexture(w, h);
  dt.type = THREE.UnsignedIntType;
  rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: quality.msaa, depthTexture: dt });
  postMat.uniforms.tColor.value = rt.texture;
  postMat.uniforms.tDepth.value = rt.depthTexture;
  postMat.uniforms.uRes.value.set(w, h);
}
export const quality = { maxDpr: 2, msaa: 4 };

export function render(time) {
  postMat.uniforms.uNear.value = camera.near;
  postMat.uniforms.uFar.value = camera.far;
  postMat.uniforms.uTime.value = time % 10;
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}
