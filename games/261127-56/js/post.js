// HDR で描いた画面に、ほんの少しの被写界深度 → ACES フィルミック → sRGB をかける最終パス
import * as THREE from 'three';

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.rt = null;
    this.focus = 0.7; this.aperture = 0.0035; this.exposure = 1.0;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
        uFocus: { value: 0.7 }, uAperture: { value: 0.0035 }, uNear: { value: 0.05 }, uFar: { value: 40 },
        uExposure: { value: 1 }, uTime: { value: 0 }, uMaxR: { value: 7 }, uFade: { value: 0 }, uWarm: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes;
        uniform float uFocus, uAperture, uNear, uFar, uExposure, uTime, uMaxR, uFade, uWarm;
        float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
        float coc(float z){ return min(uMaxR, uAperture * abs(1.0 / uFocus - 1.0 / z) * uRes.y); }
        vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c){
          const mat3 IM = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
          const mat3 OM = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
          c *= uExposure / 0.6; c = IM * c; c = RRTAndODTFit(c); c = OM * c; return clamp(c, 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
        void main(){
          float zc = linZ(texture2D(tDepth, vUv).x);
          float rc = coc(zc);
          vec3 col = texture2D(tColor, vUv).rgb;
          if (rc > 0.6) {
            vec3 acc = col; float wsum = 1.0;
            const float GA = 2.39996323;
            for (int i = 1; i < 17; i++) {
              float fi = float(i);
              float rr = sqrt(fi / 16.0) * rc;
              vec2 o = vec2(cos(fi * GA), sin(fi * GA)) * rr / uRes;
              vec2 uv = vUv + o;
              float zs = linZ(texture2D(tDepth, uv).x);
              float rs = coc(zs);
              // 手前のボケは広がり、奥のボケは手前の物ににじまない
              float w = clamp(rs - rr + 1.0, 0.0, 1.0);
              if (zs > zc + 0.05) w *= clamp(rc - rr + 1.0, 0.0, 1.0);
              acc += texture2D(tColor, uv).rgb * w; wsum += w;
            }
            col = acc / wsum;
          }
          // 周辺減光（ごく弱く）
          vec2 q = vUv - 0.5; float vig = 1.0 - dot(q, q) * 0.45;
          col *= vig;
          col = aces(col);
          col = mix(col, col * vec3(1.04, 0.99, 0.93), uWarm);
          col = toSRGB(col);
          col += (hash(vUv * uRes) - 0.5) * (1.6 / 255.0);
          col = mix(col, vec3(0.12, 0.1, 0.09), uFade);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene.add(this.quad);
  }
  setSize(w, h, samples) {
    if (this.rt) { this.rt.dispose(); this.rt.depthTexture.dispose(); }
    const dt = new THREE.DepthTexture(w, h);
    dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: samples, depthTexture: dt, depthBuffer: true });
    this.mat.uniforms.tColor.value = this.rt.texture;
    this.mat.uniforms.tDepth.value = dt;
    this.mat.uniforms.uRes.value.set(w, h);
  }
  render(scene, camera, t) {
    const u = this.mat.uniforms;
    u.uFocus.value = this.focus; u.uAperture.value = this.aperture; u.uExposure.value = this.exposure;
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uTime.value = t % 10;
    this.r.setRenderTarget(this.rt);
    this.r.render(scene, camera);
    this.r.setRenderTarget(null);
    this.r.render(this.scene, this.cam);
  }
}
