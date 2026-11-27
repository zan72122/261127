import * as THREE from '../../lib/three.module.js';

function pickRTType(renderer) {
  const gl = renderer.getContext();
  try {
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    renderer.setRenderTarget(rt);
    const ok = gl && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(null);
    rt.dispose();
    if (ok) return THREE.HalfFloatType;
  } catch (e) {
    try { renderer.setRenderTarget(null); } catch (e2) { /* ignore */ }
  }
  return THREE.UnsignedByteType;
}


const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

function quadMat(frag, uniforms) {
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
    const gl2 = renderer.capabilities.isWebGL2;
    const rtType = pickRTType(renderer);
    const samples = (gl2 && rtType === THREE.HalfFloatType) ? msaa : 0;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
      type: rtType,
      samples,
      depthBuffer: true,
    });
    this.bloomRTs = [];
    this.scratchRTs = [];
    if (bloom) {
      for (let i = 0; i < 3; i++) {
        const a = new THREE.WebGLRenderTarget(4, 4, { type: rtType, depthBuffer: false });
        const b = new THREE.WebGLRenderTarget(4, 4, { type: rtType, depthBuffer: false });
        a.texture.minFilter = b.texture.minFilter = THREE.LinearFilter;
        a.texture.magFilter = b.texture.magFilter = THREE.LinearFilter;
        this.bloomRTs.push(a);
        this.scratchRTs.push(b);
      }
    }

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.quad);
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.prefilterMat = quadMat(/* glsl */ `
      uniform sampler2D tSrc;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float w = smoothstep(1.05, 1.85, lum);
        gl_FragColor = vec4(c * w, 1.0);
      }`, { tSrc: { value: null } });

    this.blurMat = quadMat(/* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uDir;
      varying vec2 vUv;
      void main() {
        vec3 s = texture2D(tSrc, vUv).rgb * 0.28;
        s += texture2D(tSrc, vUv + uDir * 1.38).rgb * 0.22;
        s += texture2D(tSrc, vUv - uDir * 1.38).rgb * 0.22;
        s += texture2D(tSrc, vUv + uDir * 3.10).rgb * 0.14;
        s += texture2D(tSrc, vUv - uDir * 3.10).rgb * 0.14;
        gl_FragColor = vec4(s, 1.0);
      }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });

    this.compMat = quadMat(/* glsl */ `
      uniform sampler2D tScene;
      uniform sampler2D tBloom0;
      uniform sampler2D tBloom1;
      uniform sampler2D tBloom2;
      uniform float uBloomOn;
      varying vec2 vUv;
      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      void main() {
        vec3 col = texture2D(tScene, vUv).rgb;
        if (uBloomOn > 0.5) {
          vec3 b = texture2D(tBloom0, vUv).rgb * 0.20
                 + texture2D(tBloom1, vUv).rgb * 0.18
                 + texture2D(tBloom2, vUv).rgb * 0.14;
          col += b * 0.55;
        }
        col = aces(col * 1.02);
        col = pow(col, vec3(1.0 / 2.2));
        gl_FragColor = vec4(col, 1.0);
      }`, {
      tScene: { value: this.sceneRT.texture },
      tBloom0: { value: null },
      tBloom1: { value: null },
      tBloom2: { value: null },
      uBloomOn: { value: bloom ? 1 : 0 },
    });
  }

  setSize(w, h) {
    const pw = Math.max(4, w);
    const ph = Math.max(4, h);
    this.sceneRT.setSize(pw, ph);
    if (this.bloomOn) {
      for (let i = 0; i < this.bloomRTs.length; i++) {
        const div = 2 << i;
        const bw = Math.max(4, Math.floor(pw / div));
        const bh = Math.max(4, Math.floor(ph / div));
        this.bloomRTs[i].setSize(bw, bh);
        this.scratchRTs[i].setSize(bw, bh);
      }
    }
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    if (this.bloomOn) {
      this.quad.material = this.prefilterMat;
      this.prefilterMat.uniforms.tSrc.value = this.sceneRT.texture;
      r.setRenderTarget(this.bloomRTs[0]);
      r.render(this.fsScene, this.fsCam);

      for (let i = 0; i < this.bloomRTs.length; i++) {
        const src = i === 0 ? this.bloomRTs[0] : this.bloomRTs[i - 1];
        const rt = this.bloomRTs[i];
        const sc = this.scratchRTs[i];
        this.quad.material = this.blurMat;

        this.blurMat.uniforms.tSrc.value = src.texture;
        this.blurMat.uniforms.uDir.value.set(1 / rt.width, 0);
        r.setRenderTarget(sc);
        r.render(this.fsScene, this.fsCam);

        this.blurMat.uniforms.tSrc.value = sc.texture;
        this.blurMat.uniforms.uDir.value.set(0, 1 / rt.height);
        r.setRenderTarget(rt);
        r.render(this.fsScene, this.fsCam);
      }
      this.compMat.uniforms.tBloom0.value = this.bloomRTs[0].texture;
      this.compMat.uniforms.tBloom1.value = this.bloomRTs[1].texture;
      this.compMat.uniforms.tBloom2.value = this.bloomRTs[2].texture;
    }

    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    r.render(this.fsScene, this.fsCam);
  }
}
