import * as THREE from '../../lib/three.module.js';
import { rng } from '../core/math.js';

// Subtle distant winter horizon cloud wisps (instanced for minimal draw calls)
export class WinterClouds {
  constructor({ count = 48 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'winterClouds';
    this.group.userData.nonsolid = true;

    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a4d78,
      emissive: 0x162244,
      emissiveIntensity: 0.45,
      roughness: 0.95,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.name = 'cloudWisps';
    mesh.userData.nonsolid = true;
    const rand = rng(904);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.2;
      const dist = 240 + rand() * 220;
      p.set(Math.cos(ang) * dist, 55 + rand() * 34, 150 + Math.sin(ang) * dist);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      s.set(22 + rand() * 26, 4.5 + rand() * 3.5, 11 + rand() * 12);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }
}
