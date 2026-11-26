#!/usr/bin/env python3
"""List every local file referenced from HTML/JS (textures, bins, modules) and verify each exists."""
import re, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
refs = set()
for dp, _, fs in os.walk(ROOT):
    if '/tools' in dp: continue
    for f in fs:
        if not f.endswith(('.js', '.html', '.css')) or f == 'three.module.min.js': continue
        src = open(os.path.join(dp, f), encoding='utf-8').read()
        base = os.path.relpath(dp, ROOT)
        # tex('name') -> tex/name ; loadBin('bin/x.bin') ; fetch('bin/x.json') ; import './x.js' ; src="..."
        for m in re.finditer(r"\btex\(\s*'([^']+\.(?:png|jpg))'", src): refs.add(('tex/' + m.group(1), f))
        for m in re.finditer(r"tex\('cobble_(albedo|normal|orm)' \+ suffix", src):
            for suf in ('', '_s'): refs.add((f'tex/cobble_{m.group(1)}{suf}.jpg', f))
        for m in re.finditer(r"['\"`]((?:tex|bin)/[A-Za-z0-9_./-]+\.(?:png|jpg|bin|json))['\"`]", src): refs.add((m.group(1), f))
        for m in re.finditer(r"loadBin\('bin/' \+ ([a-zA-Z]+) \+ '\.bin'\)", src): pass
        for m in re.finditer(r"(?:from|import)\s*\(?\s*['\"](\.{1,2}/[^'\"]+)['\"]", src): refs.add((os.path.normpath(os.path.join(base, m.group(1))), f))
        for m in re.finditer(r"src=\"([^\"]+)\"", src): refs.add((os.path.normpath(os.path.join(base, m.group(1))), f))
# dynamic bin names used by the game
for n in ['girl', 'girl_gloved', 'papa', 'grandma']:
    refs.add((f'bin/{n}.bin', 'human.js')); refs.add((f'bin/{n}.json', 'human.js'))
for n in ['girl_head', 'papa_head', 'grandma_head']:
    refs.add((f'bin/{n}.bin', 'human.js'))
missing = 0
for r, f in sorted(refs):
    ok = os.path.exists(os.path.join(ROOT, r))
    print(('OK  ' if ok else 'MISSING ') + r + '   (' + f + ')')
    missing += (not ok)
print('total', len(refs), 'missing', missing)
used = {r for r, _ in refs}
for d in ('tex', 'bin'):
    for fn in sorted(os.listdir(os.path.join(ROOT, d))):
        if f'{d}/{fn}' not in used: print('unreferenced:', f'{d}/{fn}')
sys.exit(1 if missing else 0)
