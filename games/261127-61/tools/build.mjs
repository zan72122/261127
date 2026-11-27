// Builds the single-file game: bundles src/ with three.js and fflate, inlines the baked giraffe mesh.
// usage: node tools/build.mjs <node_modules dir> <giraffe.bin> [out]
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const [nm, bin, bin2, out = 'index.html'] = process.argv.slice(2);
const require = createRequire(path.join(nm, 'x.js'));
const esbuild = require('esbuild');
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const res = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, format: 'iife', minify: true, write: false, target: ['es2019', 'safari13'],
  alias: { three: path.join(nm, 'three/build/three.module.js'), fflate: path.join(nm, 'fflate/esm/browser.js') },
  legalComments: 'inline', logLevel: 'warning',
});
let js = res.outputFiles[0].text;
if (js.includes('</script')) js = js.replace(/<\/script/g, '<\\/script');
const enc = (f) => { const raw = fs.readFileSync(f); const gz = zlib.deflateRawSync(raw, { level: 9 }); return [raw.length, gz.length, gz.toString('base64').replace(/.{1,120}/g, '$&\n')]; };
const [rawLen, gzLen, b64] = enc(bin), [, gz2, b64b] = enc(bin2);
const gz = { length: gzLen + gz2 }, raw = { length: rawLen };
let html = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
html = html.replace('__GDATA__', b64).replace('__GDATA2__', b64b).replace('/*__JS__*/', () => js);
fs.writeFileSync(out, html);
console.log('js', js.length, 'mesh raw', raw.length, 'deflated', gz.length, 'html', html.length);
