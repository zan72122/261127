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


export class Post {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.bloom = !!opts.bloom;
    this.msaa = opts.msaa || 0;
    this.w = 1;
    this.h = 1;

    if (!this.bloom) {
      this.rt = null;
      return;
    }

    const rtType = pickRTType(renderer);
    const samples = (renderer.capabilities.isWebGL2 && rtType === THREE.HalfFloatType) ? this.msaa : 0;
    try {
      this.rt = new THREE.WebGLRenderTarget(2, 2, {
        type: rtType,
        samples,
      });
      this.postScene = new THREE.Scene();
      this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.mat = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: this.rt.texture },
          uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDiffuse;
          uniform vec2 uTexel;
          varying vec2 vUv;
          vec3 sampleBloom(vec2 uv){
            vec3 acc = vec3(0.0);
            vec2 off[4];
            off[0] = vec2( 2.0,  1.0) * uTexel;
            off[1] = vec2(-2.0,  1.0) * uTexel;
            off[2] = vec2( 1.0, -2.0) * uTexel;
            off[3] = vec2(-1.0, -2.0) * uTexel;
            for(int i = 0; i < 4; i++){
              vec3 c = texture2D(tDiffuse, clamp(uv + off[i], 0.001, 0.999)).rgb;
              float lum = dot(c, vec3(0.299, 0.587, 0.114));
              acc += max(c - vec3(0.88), vec3(0.0)) * smoothstep(0.82, 1.45, lum);
            }
            return acc * 0.25;
          }
          void main(){
            vec3 col = texture2D(tDiffuse, vUv).rgb;
            vec3 glow = sampleBloom(vUv) * 0.34;
            col += glow;
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
        depthTest: false,
        depthWrite: false,
      });
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
      this.postScene.add(this.quad);
    } catch {
      this.rt = null;
      this.bloom = false;
    }
  }

  setSize(w, h) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    if (this.rt) {
      this.rt.setSize(this.w, this.h);
      this.mat.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    }
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.rt) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}
