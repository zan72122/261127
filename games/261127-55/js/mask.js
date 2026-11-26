// 「塗ったところだけ本物になる」マテリアル改造
// 部品の頂点 xy（設計座標＝地面の絵の座標）で塗りマップを引き、
// 塗っていない所は捨て、境目はチョークの粉っぽさ→本物の質感へ移る。
import * as THREE from '../lib/three.module.min.js';
import { tex } from './tex.js';

export function makeMaskUniforms(paint, orig) {
  return {
    tChalk: paint.uniforms.tChalk, tReal: paint.uniforms.tReal, uPR: paint.uniforms.uPR,
    tGrain: { value: tex('grain.jpg') },
    uOrig: { value: new THREE.Vector2(orig[0], orig[1]) },
    uMaskOn: { value: 1 },
  };
}

const HEAD = `uniform sampler2D tChalk,tReal,tGrain; uniform vec4 uPR; uniform vec2 uOrig; uniform float uMaskOn; uniform vec2 uOff; varying vec2 vDraw; float mDust; vec3 mChalk; float mChA;
  vec3 paintOf(vec3 c){ return pow(clamp(c,0.,1.),vec3(1.55))*1.04; }`;
const SAMPLE = `{
    vec2 dUV=vec2((uOrig.x+vDraw.x-uPR.x)/uPR.z,(uPR.y-(uOrig.y-vDraw.y))/uPR.w);
    vec4 mCh=texture2D(tChalk,dUV); float mRe=texture2D(tReal,dUV).r;
    float gn=texture2D(tGrain,vDraw*2.3).r*0.7+texture2D(tGrain,vDraw*7.1).g*0.3;
    float thr=0.32+(gn-0.5)*0.5;
    float realV=mix(1.,mRe,uMaskOn);
    if(realV<thr) discard;
    mDust=(1.-smoothstep(thr,thr+0.45,realV))*uMaskOn;
    mChA=mCh.a; mChalk=mCh.rgb/max(mCh.a,0.004);
  }`;

// mode: 'paint' 塗装色＝チョーク色 / 'tint' 素材にチョーク色を乗せる / 'keep' 素材のまま
export function maskMaterial(mat, U, mode, fallback, key) {
  const fb = fallback || new THREE.Color(0.8, 0.2, 0.2);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (!sh.uniforms.uOff) sh.uniforms.uOff = { value: mat.userData.off || new THREE.Vector2() };
    sh.uniforms.uFallback = { value: fb };
    mat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uOff; varying vec2 vDraw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDraw=position.xy+uOff;');
    let colorCode = '';
    if (mode === 'paint') colorCode = `vec3 pc=mChA>0.03?paintOf(mChalk):uFallback; diffuseColor.rgb=pc*mix(vec3(1.),diffuseColor.rgb,0.25);`;
    if (mode === 'tint') colorCode = `vec3 pc=mChA>0.03?paintOf(mChalk):uFallback; float wl=dot(diffuseColor.rgb,vec3(0.33)); diffuseColor.rgb=pc*(0.72+0.5*wl);`;
    if (mode === 'cloth') colorCode = `vec3 pc=mChA>0.03?mix(paintOf(mChalk),vec3(0.86,0.84,0.8),0.25):uFallback; diffuseColor.rgb*=pc*1.1;`;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HEAD + '\nuniform vec3 uFallback;')
      .replace('#include <map_fragment>', SAMPLE + '\n#include <map_fragment>\n' + colorCode + `
        diffuseColor.rgb=mix(diffuseColor.rgb, mChalk*0.86+0.06, clamp(mDust*1.15,0.,1.));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,1.,mDust);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor*=1.-mDust;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat*=1.-mDust;\n#endif\n#ifdef USE_TRANSMISSION\n#endif');
    if (mat.transparent) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a=mix(diffuseColor.a,1.,mDust);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'mask-' + mode + (key || '');
  return mat;
}

export function maskDepth(U, off) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uOff = { value: off || new THREE.Vector2() };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uOff; varying vec2 vDraw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDraw=position.xy+uOff;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HEAD)
      .replace('void main() {', 'void main() {\n' + SAMPLE);
  };
  m.customProgramCacheKey = () => 'maskdepth';
  return m;
}
