import * as THREE from '../../lib/three.module.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

function makeMat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
  });
}

export class Post {
  constructor(renderer, { msaa = 2, bloom = true } = {}) {
    this.renderer = renderer;
    this.bloomOn = bloom;
    const isGL2 = renderer.capabilities.isWebGL2;

    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: isGL2 ? msaa : 0,
      depthBuffer: true,
    });

    this.levels = [];
    this.scratch = [];
    if (bloom) {
      for (let i = 0; i < 3; i++) {
        const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
        rt.texture.minFilter = THREE.LinearFilter;
        rt.texture.magFilter = THREE.LinearFilter;
        rt.texture.generateMipmaps = false;
        this.levels.push(rt);

        const sc = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
        sc.texture.minFilter = THREE.LinearFilter;
        sc.texture.magFilter = THREE.LinearFilter;
        sc.texture.generateMipmaps = false;
        this.scratch.push(sc);
      }
    }

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.prefilter = makeMat(
      /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uTexel;
      uniform float uThreshold;
      varying vec2 vUv;
      void main() {
        vec3 c = (
          texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb +
          texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb +
          texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb +
          texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb
        ) * 0.25;
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + 0.35, 0.0, 1.0);
        soft = soft * soft * 0.45;
        float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
        gl_FragColor = vec4(min(c * contrib, vec3(8.0)), 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.08 } }
    );

    this.down = makeMat(
      /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }
    );

    this.up = makeMat(
      /* glsl */ `
      uniform sampler2D tSrc;
      uniform sampler2D tBase;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec3 c = vec3(0.0);
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  0.0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  0.0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2( 0.0, -1.0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2( 0.0,  1.0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        gl_FragColor = vec4(texture2D(tBase, vUv).rgb + c / 12.0, 1.0);
      }`,
      { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } }
    );

    this.composite = makeMat(
      /* glsl */ `
      uniform sampler2D tScene;
      uniform sampler2D tBloom;
      uniform float uBloomStrength;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(tScene, vUv).rgb;
        if (uBloomStrength > 0.001) {
          col += texture2D(tBloom, vUv).rgb * uBloomStrength;
        }
        // Subtle vignette preserving center crispness
        vec2 q = vUv - 0.5;
        col *= 1.0 - dot(q, q) * 0.14;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      { tScene: { value: null }, tBloom: { value: null }, uBloomStrength: { value: bloom ? 0.24 : 0.0 } }
    );
  }

  setSize(w, h) {
    const rw = Math.max(4, w);
    const rh = Math.max(4, h);
    this.sceneRT.setSize(rw, rh);
    if (this.bloomOn) {
      let bw = Math.max(4, Math.floor(rw / 2));
      let bh = Math.max(4, Math.floor(rh / 2));
      for (let i = 0; i < this.levels.length; i++) {
        this.levels[i].setSize(bw, bh);
        this.scratch[i].setSize(bw, bh);
        bw = Math.max(4, Math.floor(bw / 2));
        bh = Math.max(4, Math.floor(bh / 2));
      }
    }
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    if (this.bloomOn) {
      // Prefilter into level 0
      this.quad.material = this.prefilter;
      this.prefilter.uniforms.tSrc.value = this.sceneRT.texture;
      this.prefilter.uniforms.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      r.setRenderTarget(this.levels[0]);
      r.render(this.scene, this.cam);

      // Downsample chain
      this.quad.material = this.down;
      for (let i = 1; i < this.levels.length; i++) {
        const prev = this.levels[i - 1];
        this.down.uniforms.tSrc.value = prev.texture;
        this.down.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
        r.setRenderTarget(this.levels[i]);
        r.render(this.scene, this.cam);
      }

      // Upsample chain into scratch
      this.quad.material = this.up;
      let srcTex = this.levels[this.levels.length - 1].texture;
      let srcW = this.levels[this.levels.length - 1].width;
      let srcH = this.levels[this.levels.length - 1].height;
      for (let i = this.levels.length - 2; i >= 0; i--) {
        const dst = this.scratch[i];
        this.up.uniforms.tSrc.value = srcTex;
        this.up.uniforms.tBase.value = this.levels[i].texture;
        this.up.uniforms.uTexel.value.set(1 / srcW, 1 / srcH);
        r.setRenderTarget(dst);
        r.render(this.scene, this.cam);
        srcTex = dst.texture;
        srcW = dst.width;
        srcH = dst.height;
      }
      this.composite.uniforms.tBloom.value = srcTex;
    }

    this.quad.material = this.composite;
    this.composite.uniforms.tScene.value = this.sceneRT.texture;
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
