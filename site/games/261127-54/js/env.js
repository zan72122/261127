// 夏の朝の光：空の環境マップ（HDR 風）＋太陽＋屋台の日よけからの照り返し
import * as THREE from '../lib/three.module.min.js';

export function makeEnvironment(renderer, opts = {}) {
  const sc = new THREE.Scene();
  const sunDir = opts.sunDir.clone().normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: sunDir }, uWarm: { value: opts.warm ?? 1 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vD; uniform vec3 uSun; uniform float uWarm;
      void main(){
        vec3 d = normalize(vD);
        float y = d.y;
        vec3 zen = vec3(0.30,0.52,0.95)*1.2;
        vec3 hor = vec3(1.05,0.98,0.88)*1.6;
        vec3 grd = vec3(0.42,0.34,0.25)*0.7;
        vec3 c = y > 0.0 ? mix(hor, zen, pow(y, 0.55)) : mix(hor*0.7, grd, pow(-y, 0.4));
        // 太陽のまわりのにじみ
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0,0.85,0.62) * (pow(s, 8.0)*2.0 + pow(s, 64.0)*10.0) * uWarm;
        c += vec3(1.0,0.92,0.75) * smoothstep(0.9993, 0.9997, s) * 400.0;
        // 日よけの布（真上〜後ろ）：あたたかい拡散光
        float aw = smoothstep(0.55, 0.85, y) * smoothstep(-0.2, 0.4, -d.z);
        c = mix(c, vec3(1.0,0.92,0.78)*1.1, aw*0.55);
        // 遠くの木々（地平線の少し上の緑）
        float tr = smoothstep(0.0, 0.05, y) * smoothstep(0.32, 0.12, y);
        c = mix(c, vec3(0.32,0.42,0.22)*1.1, tr*0.55);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.0, 0.1, 100);
  pm.dispose();
  mat.dispose();
  return rt.texture;
}

export function makeSun(scene, dir, opts = {}) {
  const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1.0, 0.90, 0.78), opts.intensity ?? 3.2);
  sun.position.copy(dir).normalize().multiplyScalar(4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.size ?? 2048, opts.size ?? 2048);
  const s = sun.shadow.camera;
  s.left = -0.7; s.right = 0.7; s.top = 0.7; s.bottom = -0.7; s.near = 1; s.far = 8;
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.004;
  sun.shadow.radius = 5; sun.shadow.blurSamples = 12;
  scene.add(sun); scene.add(sun.target);
  return sun;
}
