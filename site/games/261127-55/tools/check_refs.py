# -*- coding: utf-8 -*-
"""コード・HTML から参照しているローカルファイル（テクスチャ・スクリプト）を全部ひろい、
1 つずつ実在を確かめる。使い方: python3 tools/check_refs.py （games/261127-55/ で実行）"""
import os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
refs = {}

def add(path, where):
    refs.setdefault(os.path.normpath(path), set()).add(where)

for dp, _, fs in os.walk(ROOT):
    if '/tools' in dp: continue
    for f in fs:
        p = os.path.join(dp, f); rel = os.path.relpath(p, ROOT)
        if f.endswith('.html'):
            s = open(p, encoding='utf-8').read()
            for m in re.finditer(r'(?:src|href)="([^"#:]+)"', s):
                add(os.path.join(os.path.dirname(rel), m.group(1)), rel)
        if f.endswith('.js') and 'lib/' not in rel:
            s = open(p, encoding='utf-8').read()
            for m in re.finditer(r"""(?:import|from)\s*['"](\.{1,2}/[^'"]+)['"]""", s):
                add(os.path.join(os.path.dirname(rel), m.group(1)), rel)
            for m in re.finditer(r"""import\(\s*['"](\.{1,2}/[^'"]+)['"]""", s):
                add(os.path.join(os.path.dirname(rel), m.group(1)), rel)
            # tex('name.jpg', ...)
            for m in re.finditer(r"""\btex\(\s*['"]([^'"]+)['"]""", s):
                add(os.path.join('tex', m.group(1)), rel)
            # pbr('base', { ... orm: true ... })
            for m in re.finditer(r"""\bpbr\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?""", s):
                base, opt = m.group(1), m.group(2) or ''
                if 'col: false' not in opt: add(os.path.join('tex', base + '_col.jpg'), rel)
                if 'nrm: false' not in opt: add(os.path.join('tex', base + '_nrm.jpg'), rel)
                if 'orm: true' in opt: add(os.path.join('tex', base + '_orm.jpg'), rel)
            # 文字列で書かれたテクスチャ名（例：{ knit: 'knit_nrm.jpg' }）
            for m in re.finditer(r"""['"]([A-Za-z0-9][\w\-]*\.(?:jpg|png))['"]""", s):
                add(os.path.join('tex', m.group(1)), rel)

missing = 0
for r in sorted(refs):
    ok = os.path.isfile(os.path.join(ROOT, r))
    if not ok: missing += 1
    print(('OK   ' if ok else 'MISS ') + r + '   <- ' + ', '.join(sorted(refs[r])))
print('\n%d 件の参照、存在しないもの %d 件' % (len(refs), missing))
sys.exit(1 if missing else 0)
