// Offline baker: SDF shapes -> compact binary meshes in ../bin
// run: node tools/bake.mjs [names...]
import { surfaceNets } from '../js/sdfcore.js';
import { handShape, personShape, carShape } from '../js/shapes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin');
const jobs = {
  hand_grip: () => handShape(false), hand_open: () => handShape(true),
  girl: () => personShape('girl'), girl_gloved: () => personShape('girl', true),
  papa: () => personShape('papa'), grandma: () => personShape('grandma'),
  car: () => carShape(),
  girl_head: () => personShape('girl').head, papa_head: () => personShape('papa').head, grandma_head: () => personShape('grandma').head,
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(jobs);
for (const name of names) {
  const t0 = Date.now();
  const sh = jobs[name]();
  const r = surfaceNets(sh.sdf, sh.bmin, sh.bmax, sh.step, sh.attr);
  const N = r.pos.length / 3, NI = r.ind.length;
  const chunks = [];
  const pad = (b) => { const n = (4 - (b.byteLength % 4)) % 4; return n ? Buffer.concat([b, Buffer.alloc(n)]) : b; };
  // header: N, NI, flags(1 skin, 2 u16 index), pad, then bbox min[3], size[3] (float32)
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], r.pos[i * 3 + k]); mx[k] = Math.max(mx[k], r.pos[i * 3 + k]); }
  const sz = mx.map((v, k) => Math.max(1e-6, v - mn[k]));
  const u16 = N < 65536;
  chunks.push(Buffer.from(new Uint32Array([N, NI, (r.skinI ? 1 : 0) | (u16 ? 2 : 0), 0]).buffer));
  chunks.push(Buffer.from(new Float32Array([...mn, ...sz]).buffer));
  chunks.push(pad(Buffer.from(Uint16Array.from({ length: N * 3 }, (_, j) => Math.round((r.pos[j] - mn[j % 3]) / sz[j % 3] * 65535)).buffer)));
  chunks.push(pad(Buffer.from(Int8Array.from(r.nor, (v) => Math.round(v * 127)).buffer)));
  chunks.push(pad(Buffer.from(Uint8Array.from(r.col, (v) => Math.round(Math.pow(Math.max(0, Math.min(1, v)), 2.2) * 255)).buffer)));
  chunks.push(pad(Buffer.from(Uint8Array.from(r.mat).buffer)));
  chunks.push(pad(Buffer.from(Uint8Array.from(r.rough, (v) => Math.round(v * 255)).buffer)));
  if (r.skinI) {
    chunks.push(pad(Buffer.from(Uint8Array.from(r.skinI).buffer)));
    // quantise weights keeping sum 255
    const w = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = 0; k < 3; k++) { w[i * 4 + k] = Math.round(r.skinW[i * 4 + k] * 255); s += w[i * 4 + k]; } w[i * 4 + 3] = Math.max(0, 255 - s); }
    chunks.push(pad(Buffer.from(w.buffer)));
  }
  chunks.push(Buffer.from((u16 ? Uint16Array.from(r.ind) : r.ind).buffer));
  const buf = Buffer.concat(chunks);
  fs.writeFileSync(path.join(OUT, name + '.bin'), buf);
  if (sh.bones) fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ bones: sh.bones, head: sh.head.offset }));
  else if (0) fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ bones: sh.bones }));
  console.log(name, 'verts', N, 'tris', NI / 3, 'KB', (buf.length / 1024) | 0, 'ms', Date.now() - t0);
}
