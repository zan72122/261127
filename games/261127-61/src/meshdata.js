// Decoder for the baked giraffe mesh (see tools/bake.mjs for the layout).
import * as THREE from 'three';

export function decodeGiraffe(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const hl = dv.getUint32(off, true); off += 4;
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(off, off + hl))); off += hl;
  const parts = [];
  for (let i = 0; i < 7; i++) {
    off = (off + 3) & ~3;
    const n = dv.getUint32(off, true); off += 4;
    parts.push(bytes.buffer.slice(bytes.byteOffset + off, bytes.byteOffset + off + n));
    off += n;
  }
  const { nv, bbox } = header;
  const q = new Uint16Array(parts[0]);
  const pos = new Float32Array(nv * 3);
  const ext = [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]];
  for (let i = 0; i < nv; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = bbox.min[c] + q[i * 3 + c] / 65535 * ext[c];
  const o = new Int8Array(parts[1]);
  const nrm = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    let x = o[i * 2] / 127, y = o[i * 2 + 1] / 127, z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); }
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(parts[2]), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(parts[3]), 4, true));
  g.setAttribute('coat', new THREE.BufferAttribute(new Uint8Array(parts[4]), 4, true));
  g.setAttribute('pale', new THREE.BufferAttribute(new Uint8Array(parts[5]), 1, true));
  const ind = nv < 65536 ? new Uint16Array(parts[6]) : new Uint32Array(parts[6]);
  g.setIndex(new THREE.BufferAttribute(ind, 1));
  g.computeBoundingSphere();
  return { geometry: g, header };
}
