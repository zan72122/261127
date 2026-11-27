// Build: bundle src/main.js (with three.js, tree-shaken) into a single self-contained index.html.
// Usage: cd tools && npm install && node build.mjs
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dev = process.argv.includes('--dev');

const res = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: !dev,
  format: 'iife',
  target: ['es2020', 'safari15'],
  write: false,
  legalComments: 'none',
  nodePaths: [path.join(here, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
let js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
const license = '/* three.js r187 (c) 2010-2026 three.js authors, MIT License. Game code (c) 2026. */\n';
const out = tpl.replace('/*__GAME__*/', () => license + js);
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('index.html', (out.length / 1024).toFixed(1) + ' KB');
