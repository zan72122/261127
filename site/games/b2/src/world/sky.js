import * as THREE from '../../lib/three.module.js';
import { GLSL_NOISE, LAYER_MAIN, LAYER_REFLECT, shared } from '../core/env.js';

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: shared.uSunDir,
      uZenith: shared.uSkyZenith,
      uHorizon: shared.uSkyHorizon,
      uGround: shared.uSkyGround,
      uTime: shared.uTime,
      uCloudCover: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uZenith, uHorizon, uGround;
      uniform float uTime, uCloudCover;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        float h = clamp(y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.58));

        // Afternoon oblique sun warmth & clean solar disk
        float sd = dot(d, uSunDir);
        float sunSide = 0.5 + 0.5 * sd;
        col = mix(col, vec3(1.0, 0.93, 0.80) * 1.12, pow(sunSide, 5.0) * (1.0 - h) * 0.65);
        col += vec3(1.0, 0.88, 0.68) * pow(max(sd, 0.0), 22.0) * 0.72;
        col += vec3(1.0, 0.95, 0.84) * pow(max(sd, 0.0), 260.0) * 3.8;
        col += vec3(1.0, 0.98, 0.92) * smoothstep(0.9995, 0.99975, sd) * 12.0;

        // Delicate high-altitude summer cirrus wisps
        vec2 cp = d.xz / (max(y, 0.02) + 0.14);
        float cir = fbm2(cp * 1.35 + vec2(uTime * 0.004, 0.0));
        cir = smoothstep(0.54, 0.86, cir) * smoothstep(0.03, 0.28, y) * uCloudCover;
        vec3 cirCol = mix(vec3(0.98, 0.98, 0.96), vec3(1.0, 0.93, 0.82), pow(sunSide, 3.0));
        col = mix(col, cirCol * 1.06, cir * 0.34);

        // Below horizon haze
        col = mix(col, uGround, smoothstep(0.0, -0.09, y));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
}

export class Sky {
  constructor() {
    this.material = makeSkyMaterial();
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 44, 24), this.material);
    this.mesh.name = 'skyDome';
    this.mesh.userData.nonsolid = true;
    this.mesh.scale.setScalar(4800);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.layers.enable(LAYER_MAIN);
    this.mesh.layers.enable(LAYER_REFLECT);
    this.mesh.onBeforeRender = (_r, _s, cam) => {
      this.mesh.position.copy(cam.position);
      this.mesh.updateMatrixWorld();
    };
  }

  makeEnvironment(renderer) {
    try {
      const scene = new THREE.Scene();
      const m = makeSkyMaterial();
      m.uniforms.uCloudCover = { value: 0.4 };
      const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), m);
      scene.add(sky);

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(90, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a8646') })
      );
      ground.position.y = -2;
      scene.add(ground);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const rt = pmrem.fromScene(scene, 0.02);
      pmrem.dispose();
      return rt.texture;
      } catch (e) {
      (window.__errors || (window.__errors = [])).push('pmrem:' + (e && (e.message || e)));
      return null;
    }
  }
}
