#!/usr/bin/env python3
"""List every local file referenced from index.html / js and verify it exists."""
import re, os, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
refs = set()
html = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
for m in re.finditer(r'(?:src|href)="([^"#:]+)"', html):
    refs.add(m.group(1))
for dp, dn, fn in os.walk(os.path.join(root, 'js')):
    for f in fn:
        if not f.endswith('.js'): continue
        src = open(os.path.join(dp, f), encoding='utf-8').read()
        for m in re.finditer(r"from '(\.[^']+)'", src):
            refs.add(os.path.normpath(os.path.join('js', m.group(1))))
        for m in re.finditer(r"tex\('([^']+)'", src):
            refs.add('tex/' + m.group(1))
        for m in re.finditer(r"pbr\('([^']+)'", src):
            for suf in ('_c.jpg', '_n.jpg', '_orm.jpg'):
                refs.add('tex/' + m.group(1) + suf)
        # dynamic: pbr(name ...) with variable -> flag
        for m in re.finditer(r"pbr\(([a-zA-Z_][^,')]*)[,)]", src):
            print('NOTE dynamic pbr() arg in', f, ':', m.group(1))
bad = 0
for r in sorted(refs):
    ok = os.path.isfile(os.path.join(root, r))
    print(('OK   ' if ok else 'MISSING ') + r)
    bad += not ok
print('total', len(refs), 'missing', bad)
sys.exit(1 if bad else 0)
