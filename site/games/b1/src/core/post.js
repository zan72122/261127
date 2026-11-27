// Lightweight self-contained MSAA + subtle selective bloom pass using only three.module.js
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
  constructor(renderer, { msaa = 2, bloom = true } = {}) {
    this.renderer = renderer;
    this.bloom = bloom;
    this.msaa = msaa;
    if (!bloom) return;

    const rtType = pickRTType(renderer);
    const samples = (renderer.capabilities.isWebGL2 && rtType === THREE.HalfFloatType) ? msaa : 0;
    this.rtMain = new THREE.WebGLRenderTarget(1, 1, {
      type: rtType,
      samples,
    });
    this.rtBright = new THREE.WebGLRenderTarget(1, 1, { type: rtType });
    this.rtBlurH = new THREE.WebGLRenderTarget(1, 1, { type: rtType });
    this.rtBlurV = new THREE.WebGLRenderTarget(1, 1, { type: rtType });

    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThresh: { value: 0.92 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uThresh; varying vec2 vUv;
        void main(){
          vec3 c = max(texture2D(tDiffuse, vUv).rgb, vec3(0.0));
          float l = max(c.r, max(c.g, c.b));
          float w = smoothstep(uThresh, uThresh + 0.45, l);
          gl_FragColor = vec4(c * w, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
          sum += texture2D(tDiffuse, vUv + uDir * 1.384615).rgb * 0.316216;
          sum += texture2D(tDiffuse, vUv - uDir * 1.384615).rgb * 0.316216;
          sum += texture2D(tDiffuse, vUv + uDir * 3.230769).rgb * 0.070270;
          sum += texture2D(tDiffuse, vUv - uDir * 3.230769).rgb * 0.070270;
          gl_FragColor = vec4(sum, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tBase: { value: null }, tBloom: { value: null }, uBloomStr: { value: 0.34 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tBase, tBloom; uniform float uBloomStr; varying vec2 vUv;
        void main(){
          vec3 base = texture2D(tBase, vUv).rgb;
          vec3 blm = texture2D(tBloom, vUv).rgb;
          vec3 c = base + blm * uBloomStr;
          // Gentle vignette
          vec2 d = vUv - 0.5;
          c *= 1.0 - dot(d, d) * 0.22;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });

    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(this.quadGeo, this.brightMat);
    this.quadScene.add(this.quadMesh);
  }

  setSize(w, h) {
    if (!this.bloom) return;
    w = Math.max(2, w);
    h = Math.max(2, h);
    this.rtMain.setSize(w, h);
    const bw = Math.max(2, Math.floor(w / 4));
    const bh = Math.max(2, Math.floor(h / 4));
    this.rtBright.setSize(bw, bh);
    this.rtBlurH.setSize(bw, bh);
    this.rtBlurV.setSize(bw, bh);
    this.bw = bw;
    this.bh = bh;
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.bloom) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    const oldTM = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.rtMain);
    r.clear();
    r.render(scene, camera);

    this.quadMesh.material = this.brightMat;
    this.brightMat.uniforms.tDiffuse.value = this.rtMain.texture;
    r.setRenderTarget(this.rtBright);
    r.render(this.quadScene, this.quadCam);

    this.quadMesh.material = this.blurMat;
    this.blurMat.uniforms.tDiffuse.value = this.rtBright.texture;
    this.blurMat.uniforms.uDir.value.set(1 / Math.max(1, this.bw), 0);
    r.setRenderTarget(this.rtBlurH);
    r.render(this.quadScene, this.quadCam);

    this.blurMat.uniforms.tDiffuse.value = this.rtBlurH.texture;
    this.blurMat.uniforms.uDir.value.set(0, 1 / Math.max(1, this.bh));
    r.setRenderTarget(this.rtBlurV);
    r.render(this.quadScene, this.quadCam);

    r.toneMapping = oldTM;
    this.quadMesh.material = this.compMat;
    this.compMat.uniforms.tBase.value = this.rtMain.texture;
    this.compMat.uniforms.tBloom.value = this.rtBlurV.texture;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
