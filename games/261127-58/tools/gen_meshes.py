#!/usr/bin/env python3
"""Organic skinned meshes for the girl, papa and the heat-proof glove.

Each figure is described as signed-distance fields (smooth unions of round
cones / ellipsoids + cloth wrinkles + seams), meshed with marching cubes, then
given smooth SDF normals, baked cavity AO, region colours and bone weights.

Output: mesh/<name>.bin  =  u32 headerLength | JSON header | binary blocks
Run:  python3 tools/gen_meshes.py   (needs numpy + scikit-image)
"""
import os, json, struct, sys
import numpy as np
from skimage.measure import marching_cubes
import fast_simplification

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mesh')
os.makedirs(OUT, exist_ok=True)

# ------------------------------------------------------------ 3D noise
_rng = np.random.default_rng(5858)
_perm = _rng.permutation(256); _perm = np.concatenate([_perm, _perm])
_val = _rng.random(256)

def noise3(P):
    p = np.asarray(P)
    i = np.floor(p).astype(int); f = p - i
    f = f * f * (3 - 2 * f)
    i &= 255
    def h(dx, dy, dz):
        return _val[_perm[_perm[_perm[(i[:, 0] + dx) & 255] + ((i[:, 1] + dy) & 255)] + ((i[:, 2] + dz) & 255)]]
    x, y, z = f[:, 0], f[:, 1], f[:, 2]
    c000 = h(0, 0, 0); c100 = h(1, 0, 0); c010 = h(0, 1, 0); c110 = h(1, 1, 0)
    c001 = h(0, 0, 1); c101 = h(1, 0, 1); c011 = h(0, 1, 1); c111 = h(1, 1, 1)
    l = lambda a, b, t: a + (b - a) * t
    return l(l(l(c000, c100, x), l(c010, c110, x), y), l(l(c001, c101, x), l(c011, c111, x), y), z) * 2 - 1

def fbm3(P, oct=3):
    a = 0; amp = 1; tot = 0; q = P
    for o in range(oct):
        a = a + amp * noise3(q); tot += amp; amp *= 0.5; q = q * 2.03 + 17.1
    return a / tot

# ------------------------------------------------------------ SDF prims
def V(*a): return np.array(a, dtype=float)

def sd_rcone(P, a, b, ra, rb):
    a = np.asarray(a, float); b = np.asarray(b, float)
    ba = b - a; pa = P - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    r = ra + (rb - ra) * h
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - r, h

def sd_cap(P, a, b, ra, rb=None):
    return sd_rcone(P, a, b, ra, ra if rb is None else rb)[0]

def sd_ell(P, c, r, R=None):
    q = P - np.asarray(c, float)
    if R is not None: q = q @ R
    r = np.asarray(r, float)
    k0 = np.linalg.norm(q / r, axis=1); k1 = np.linalg.norm(q / (r * r), axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)

def sd_rbox(P, c, half, rad, R=None):
    q = P - np.asarray(c, float)
    if R is not None: q = q @ R
    q = np.abs(q) - (np.asarray(half, float) - rad)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(np.max(q, axis=1), 0) - rad

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

def smax(a, b, k): return -smin(-a, -b, k)

def rotx(t):
    c, s = np.cos(t), np.sin(t); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def roty(t):
    c, s = np.cos(t), np.sin(t); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def rotz(t):
    c, s = np.cos(t), np.sin(t); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def seg_dist(P, a, b):
    a = np.asarray(a, float); b = np.asarray(b, float)
    ba = b - a; pa = P - a
    h = np.clip((pa @ ba) / max(ba @ ba, 1e-12), 0, 1)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1), h

# ------------------------------------------------------------ meshing
def mesh_sdf(f, lo, hi, step, target=None):
    lo = np.asarray(lo, float); hi = np.asarray(hi, float)
    n = np.ceil((hi - lo) / step).astype(int) + 1
    xs = [lo[i] + np.arange(n[i]) * step for i in range(3)]
    G = np.stack(np.meshgrid(*xs, indexing='ij'), -1).reshape(-1, 3)
    vals = np.empty(len(G))
    B = 400000
    for s in range(0, len(G), B): vals[s:s + B] = f(G[s:s + B])
    vol = vals.reshape(n)
    v, faces, _, _ = marching_cubes(vol, 0.0, spacing=(step, step, step), allow_degenerate=False)
    v = v + lo
    if target and len(faces) > target:
        v, faces = fast_simplification.simplify(v.astype(np.float32), faces.astype(np.int32), 1 - target / len(faces), agg=6)
        v = v.astype(float)
        # snap back onto the iso-surface (one Newton step) so detail stays crisp
        for _ in range(2):
            e0 = step * 0.25; g = np.zeros_like(v)
            for k in range(3):
                d = np.zeros(3); d[k] = e0; g[:, k] = (f(v + d) - f(v - d)) / (2 * e0)
            gl = np.maximum(np.sum(g * g, 1, keepdims=True), 1e-9)
            v = v - g * f(v)[:, None] / gl
    # SDF-gradient normals (smooth)
    e = step * 0.5
    nrm = np.zeros_like(v)
    for k in range(3):
        d = np.zeros(3); d[k] = e
        nrm[:, k] = f(v + d) - f(v - d)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
    # skimage gives faces wound for the gradient direction; make them face outward
    tri = v[faces]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    if np.sum(np.einsum('ij,ij->i', fn, nrm[faces[:, 0]])) < 0:
        faces = faces[:, ::-1]
    return v, nrm, faces.astype(np.int64)

def bake_ao(fall, v, n, delta, strength=1.0):
    occ = np.zeros(len(v))
    for i in range(1, 6):
        d = delta * i
        occ += (d - np.minimum(fall(v + n * d), d)) / (2 ** i)
    return np.clip(1 - strength * occ / delta, 0.25, 1)

def skin_weights(v, segs, sigma):
    D = np.stack([seg_dist(v, a, b)[0] - r for (a, b, r) in segs], 1)
    D = np.maximum(D, 0)
    W = np.exp(-(D - D.min(1, keepdims=True)) / sigma)
    idx = np.argsort(-W, 1)[:, :4]
    w = np.take_along_axis(W, idx, 1)
    w[w < 0.02 * w[:, :1]] = 0
    w /= w.sum(1, keepdims=True)
    return idx.astype(np.uint8), w

# ------------------------------------------------------------ export
def export(name, bones, meshes):
    allv = np.concatenate([m['v'] for m in meshes])
    lo = allv.min(0) - 1e-4; hi = allv.max(0) + 1e-4
    blobs = []; header = {'bones': bones, 'bbox': [lo.tolist(), hi.tolist()], 'meshes': []}
    off = 0
    def add(arr):
        nonlocal off
        b = arr.tobytes(); pad = (-len(b)) % 4
        blobs.append(b + b'\0' * pad); o = off; off += len(b) + pad; return o
    for m in meshes:
        v, n, f = m['v'], m['n'], m['f']
        q = np.round((v - lo) / (hi - lo) * 65535).astype(np.uint16)
        nn = np.round(np.concatenate([n, np.zeros((len(n), 1))], 1) * 127).astype(np.int8)
        col = np.concatenate([m['col'], m['ao'][:, None]], 1)
        col = np.round(np.clip(col, 0, 1) * 255).astype(np.uint8)
        w8 = np.round(m['w'] * 255).astype(np.int32)
        w8[:, 0] += 255 - w8.sum(1)
        idx16 = len(v) < 65536
        ent = {'name': m['name'], 'count': int(len(v)), 'icount': int(f.size), 'i16': idx16,
               'pos': add(q), 'nrm': add(nn), 'col': add(col), 'si': add(m['si']), 'sw': add(w8.astype(np.uint8)),
               'idx': add(f.astype(np.uint16 if idx16 else np.uint32).ravel())}
        header['meshes'].append(ent)
        print(f"  {name}/{m['name']}: {len(v)} verts {len(f)} tris")
    hj = json.dumps(header).encode(); hj += b' ' * ((-len(hj)) % 4)
    with open(os.path.join(OUT, name + '.bin'), 'wb') as fo:
        fo.write(struct.pack('<I', len(hj))); fo.write(hj)
        for b in blobs: fo.write(b)
    print('wrote', name, os.path.getsize(os.path.join(OUT, name + '.bin')) // 1024, 'KB')

# ============================================================== FIGURES
class Figure:
    """skeleton (bones with head positions) + layered SDFs"""
    def __init__(self, s):
        self.s = s
    def bone_list(self):
        return [{'name': b[0], 'parent': b[1], 'pos': list(map(float, b[2]))} for b in self.bones]

def build_person(kind):
    if kind == 'girl':
        S = 1.0
        H = dict(hips=V(0, .600, 0), spine=V(0, .690, 0), chest=V(0, .800, -.004), neck=V(0, .895, -.008),
                 head=V(0, .945, -.004), headTop=V(0, 1.10, 0),
                 clav=V(.025, .865, -.01), sho=V(.112, .868, -.012), elb=V(.142, .705, -.03), wri=V(.158, .555, -.008),
                 hnd=V(.162, .475, .004), hip=V(.058, .585, 0), kne=V(.064, .335, .012), ank=V(.064, .068, -.012),
                 toe=V(.066, .022, .095))
        headC = V(0, 1.012, .006); headR = V(.078, .092, .088)
        thick = 1.0
    else:
        H = dict(hips=V(0, .985, 0), spine=V(0, 1.12, 0), chest=V(0, 1.32, -.01), neck=V(0, 1.50, -.02),
                 head=V(0, 1.57, -.012), headTop=V(0, 1.765, 0),
                 clav=V(.035, 1.45, -.02), sho=V(.195, 1.445, -.03), elb=V(.235, 1.165, -.05), wri=V(.255, .915, -.02),
                 hnd=V(.262, .80, .0), hip=V(.098, .955, 0), kne=V(.104, .525, .02), ank=V(.104, .092, -.02),
                 toe=V(.108, .03, .17))
        headC = V(0, 1.655, .012); headR = V(.079, .112, .1)
    def L(k): return H[k]
    def R(k): v = H[k].copy(); v[0] = -v[0]; return v
    bones = [
        ('hips', -1, H['hips']), ('spine', 0, H['spine']), ('chest', 1, H['chest']), ('neck', 2, H['neck']), ('head', 3, H['head']),
        ('clavL', 2, L('clav')), ('upperArmL', 5, L('sho')), ('forearmL', 6, L('elb')), ('handL', 7, L('wri')),
        ('clavR', 2, R('clav')), ('upperArmR', 9, R('sho')), ('forearmR', 10, R('elb')), ('handR', 11, R('wri')),
        ('thighL', 0, L('hip')), ('shinL', 13, L('kne')), ('footL', 14, L('ank')),
        ('thighR', 0, R('hip')), ('shinR', 16, R('kne')), ('footR', 17, R('ank')),
    ]
    segs = [
        (H['hips'], H['spine'], 0.05), (H['spine'], H['chest'], 0.05), (H['chest'], H['neck'], 0.05), (H['neck'], H['head'], 0.03),
        (H['head'], H['headTop'], 0.07),
        (L('clav'), L('sho'), 0.03), (L('sho'), L('elb'), 0.03), (L('elb'), L('wri'), 0.025), (L('wri'), L('hnd'), 0.02),
        (R('clav'), R('sho'), 0.03), (R('sho'), R('elb'), 0.03), (R('elb'), R('wri'), 0.025), (R('wri'), R('hnd'), 0.02),
        (L('hip'), L('kne'), 0.04), (L('kne'), L('ank'), 0.03), (L('ank'), L('toe'), 0.02),
        (R('hip'), R('kne'), 0.04), (R('kne'), R('ank'), 0.03), (R('ank'), R('toe'), 0.02),
    ]
    girl = kind == 'girl'
    sc = 1.0 if girl else 1.6   # body thickness scale (adult wider)
    def mirror_min(fn, P):
        a = fn(P); Q = P.copy(); Q[:, 0] = -Q[:, 0]; return np.minimum(a, fn(Q))

    # ---------------- skin
    def f_head(P):
        d = sd_ell(P, headC, headR)
        if girl:
            d = smin(d, sd_ell(P, headC + V(0, -.058, .022), V(.06, .045, .062)), .03)     # cheeks/jaw
            d = smin(d, sd_ell(P, headC + V(0, -.018, .086), V(.011, .014, .012)), .012)   # nose
            ears = lambda Q: sd_ell(Q, headC + V(.077, -.008, -.006), V(.011, .024, .017), rotz(.1))
        else:
            d = smin(d, sd_ell(P, headC + V(0, -.07, .03), V(.068, .06, .072)), .04)       # jaw
            d = smin(d, sd_ell(P, headC + V(0, -.072, .068), V(.03, .028, .03)), .02)      # chin
            d = smin(d, sd_cap(P, headC + V(0, .002, .098), headC + V(0, -.034, .112), .011, .016), .015)  # nose
            d = smin(d, sd_ell(P, headC + V(0, .03, .082), V(.06, .016, .02)), .02)        # brow ridge
            ears = lambda Q: sd_ell(Q, headC + V(.079, -.01, -.01), V(.012, .032, .02), rotz(.1))
        d = smin(d, mirror_min(ears, P), .006)
        # eye sockets
        eye = lambda Q: sd_ell(Q, headC + (V(.03, .003, .083) if girl else V(.034, .012, .085)), V(.017, .011, .01))
        d = smax(d, -mirror_min(eye, P) + 0.002, .008)
        d = smin(d, sd_cap(P, H['neck'] + V(0, -.02, 0), H['head'] + V(0, .03, .01), .036 if girl else .062), .02)
        return d
    def hand(P, side):
        w = H['wri'].copy(); e = H['hnd'].copy()
        if side < 0: w[0] = -w[0]; e[0] = -e[0]
        d = sd_ell(P, (w + e) / 2 + V(0, 0, 0), V(.016, .042, .03) * (1 if girl else 1.45))
        tdir = V(-.6 * side, -.5, .6); tdir /= np.linalg.norm(tdir)
        tb = w + V(0, -.02, .02) * (1 if girl else 1.4)
        d = smin(d, sd_cap(P, tb, tb + tdir * (.035 if girl else .055), .009 if girl else .013, .007 if girl else .011), .01)
        return d
    def f_hands(P): return np.minimum(hand(P, 1), hand(P, -1))
    def f_forearms(P):  # papa's bare forearms (short sleeves)
        d = smin(sd_cap(P, L('sho') + V(-.01, -.02, 0), L('elb'), .05, .043), sd_cap(P, L('elb'), L('wri'), .043, .031), .02)
        d = np.minimum(d, smin(sd_cap(P, R('sho') + V(.01, -.02, 0), R('elb'), .05, .043), sd_cap(P, R('elb'), R('wri'), .043, .031), .02))
        return d
    def f_skin(P):
        d = np.minimum(f_head(P), f_hands(P))
        if not girl: d = smin(d, f_forearms(P), .02)
        return d

    # ---------------- shirt
    def wrinkles(P, amp):
        return amp * fbm3(P * (55 if girl else 38), 3)
    def joint_folds(P, j, axis_a, axis_b, rad, amp, freq):
        dist, h = seg_dist(P, axis_a, axis_b)
        t = (P - j) @ ((axis_b - axis_a) / np.linalg.norm(axis_b - axis_a))
        m = np.exp(-(t / rad) ** 2)
        return amp * m * np.sin(t * freq + 2.0 * noise3(P * 40))
    def f_shirt(P):
        d = sd_ell(P, H['chest'] + V(0, .0, .006 * sc), V(.1, .105, .072) * V(sc * .98, sc * 1.25 if not girl else 1, sc * .9))
        d = smin(d, sd_ell(P, H['spine'] + V(0, -.01 * sc, .006), V(.098, .1, .074) * V(sc * .95, sc * 1.15 if not girl else 1, sc * .92)), .05 * sc)
        d = smin(d, sd_cap(P, L('sho') + V(-.01, -.01, 0), R('sho') + V(.01, -.01, 0), .05 * sc * (.9 if not girl else 1)), .05 * sc)
        d = smin(d, sd_ell(P, H['hips'] + V(0, .02, 0), V(.1, .07, .074) * V(sc * .92, sc, sc * .9)), .04 * sc)
        if girl:
            sl_end = L('wri') + (L('elb') - L('wri')) * 0.06
            sleeve = lambda Q, s: smin(sd_cap(Q, s('sho'), s('elb'), .041, .036), sd_cap(Q, s('elb'), s('wri') + (s('elb') - s('wri')) * .06, .036, .032), .015)
        else:
            sleeve = lambda Q, s: sd_cap(Q, s('sho'), s('sho') + (s('elb') - s('sho')) * .55, .062, .056)
        d = smin(d, np.minimum(sleeve(P, L), sleeve(P, R)), .03 * sc)
        d = d + wrinkles(P, .0022 * sc)
        if girl:
            d = d + joint_folds(P, L('elb'), L('sho'), L('wri'), .05, .0028, 160) + joint_folds(P, R('elb'), R('sho'), R('wri'), .05, .0028, 160)
        # neck opening & hem
        d = smax(d, -(sd_cap(P, H['neck'] + V(0, -.012, .012 * sc), H['neck'] + V(0, .2, .0), .04 * (1 if girl else 1.5))), .01)
        hem = H['hips'][1] - (.04 if girl else .03)
        d = smax(d, hem - P[:, 1] + .004 * noise3(P * 30), .008)
        if not girl:  # short sleeve ends
            for s in (L, R):
                end = s('sho') + (s('elb') - s('sho')) * .55
                ax = (s('elb') - s('sho')); ax /= np.linalg.norm(ax)
                armzone = (np.abs(P[:, 0]) > .175) & (P[:, 1] > H['spine'][1])
                d = np.where(((P - end) @ ax > 0) & armzone, np.maximum(d, (P - end) @ ax), d)
        return d

    # ---------------- trousers
    def f_pants(P):
        d = sd_ell(P, H['hips'] + V(0, -.005, 0), V(.098, .085, .078) * V(sc * .95, sc * .95, sc * .9))
        leg = lambda Q, s: smin(sd_cap(Q, s('hip'), s('kne'), .058 * sc * (.95 if not girl else 1), .045 * sc * .9 if not girl else .045),
                                sd_cap(Q, s('kne'), s('ank') + V(0, .012, 0), (.044 if girl else .062), (.037 if girl else .058)), .02 * sc)
        d = smin(d, np.minimum(leg(P, L), leg(P, R)), .03 * sc)
        d = d + wrinkles(P, .002 * sc)
        for s in (L, R):
            d = d + joint_folds(P, s('kne'), s('hip'), s('ank'), .06 * sc, .0025 * sc, 120 / sc)
            d = d + joint_folds(P, s('ank') + V(0, .05 * sc, 0), s('kne'), s('ank'), .05 * sc, .003 * sc, 140 / sc)
        d = smax(d, P[:, 1] - (H['hips'][1] + .05 * sc), .01)   # waist
        d = smax(d, (H['ank'][1] + .006 * sc) - P[:, 1], .004)  # cuff
        return d

    # ---------------- shoes
    def shoe(P, s):
        a = s('ank') + V(0, -.032 * sc, -.03 * sc); t = s('toe') + V(0, .0, .005)
        d = sd_cap(P, a, t, .032 * (1 if girl else 1.25), .028 * (1 if girl else 1.25))
        d = smin(d, sd_cap(P, s('ank') + V(0, -.01, -.004), s('ank') + V(0, .03 * sc, 0), .034 * (1 if girl else 1.45)), .02 * sc)
        d = smax(d, -P[:, 1], .004)
        d = d + .0008 * fbm3(P * 90, 2)
        return d
    def f_shoes(P): return np.minimum(shoe(P, L), shoe(P, R))

    # ---------------- hair
    def f_hair(P):
        cap = sd_ell(P, headC + V(0, .006, -.004), headR + V(.008, .009, .006) * (1 if girl else .7))
        q = P - headC
        if girl:
            line = .045 - .5 * np.maximum(q[:, 2], 0) ** 1 * 0 + 0.0
            front = q[:, 1] - (.022 + 0.2 * np.maximum(q[:, 2] - .02, 0) * 0)  # hairline above forehead
            cut = np.where(q[:, 2] > .02, .03 - q[:, 1] + 0.35 * np.abs(q[:, 0]) ** 2 * 10, -.055 - q[:, 1])
            cap = smax(cap, cut, .012)
            # side strands over ears + ponytail
            pt = sd_rcone(P, headC + V(0, .02, -.088), headC + V(0, -.07, -.122), .032, .022)[0]
            pt = smin(pt, sd_rcone(P, headC + V(0, -.07, -.122), headC + V(0, -.19, -.105), .022, .008)[0], .02)
            cap = smin(cap, pt, .02)
            ang = np.arctan2(q[:, 0], -q[:, 2])
            cap = cap + .0016 * np.sin(ang * 55 + 6 * noise3(P * 30)) + .0012 * fbm3(P * 80, 2)
        else:
            cut = np.where(q[:, 2] > .03, .045 - q[:, 1], np.where(np.abs(q[:, 0]) > .06, -.01 - q[:, 1], -.06 - q[:, 1]))
            cap = smax(cap, cut + .004 * noise3(P * 60), .012)
            cap = cap + .0012 * fbm3(P * 120, 2)
        return cap

    # ---------------- papa's leather apron
    def f_apron(P):
        body = np.minimum(f_shirt(P), f_pants(P))
        off = body - .016
        shell = np.maximum(off, -(off + .009))
        q = P - H['spine']
        front = .035 - q[:, 2]
        width = np.abs(q[:, 0]) - np.where(P[:, 1] > H['chest'][1] + .02, .12, .2)
        top = P[:, 1] - (H['chest'][1] + .12); bot = (H['kne'][1] + .08) - P[:, 1]
        d = np.maximum.reduce([shell, front, width, top, bot])
        straps = np.minimum(sd_cap(P, H['chest'] + V(.1, .12, .1), H['neck'] + V(.06, .02, -.03), .012),
                            sd_cap(P, H['chest'] + V(-.1, .12, .1), H['neck'] + V(-.06, .02, -.03), .012))
        d = np.minimum(d, straps)
        return d + .001 * fbm3(P * 60, 2)

    layers = [('skin', f_skin), ('shirt', f_shirt), ('pants', f_pants), ('shoes', f_shoes), ('hair', f_hair)]
    if not girl: layers.append(('apron', f_apron))
    return H, headC, bones, segs, layers

def make_person(kind, step):
    H, headC, bones, segs, layers = build_person(kind)
    girl = kind == 'girl'
    def fall(P):
        return np.minimum.reduce([f(P) for _, f in layers])
    meshes = []
    top = 1.15 if girl else 1.82
    for name, f in layers:
        st = step * (0.6 if name in ('skin',) else 1.0)
        tgt = {'skin': 14000, 'shirt': 9000, 'pants': 7000, 'shoes': 3000, 'hair': 7000, 'apron': 5000}[name]
        v, n, faces = mesh_sdf(f, (-.28 if girl else -.4, -0.01, -.2 if girl else -.26), (.28 if girl else .4, top, .2 if girl else .28), st, tgt)
        # drop tiny floating islands: keep everything (layers are well-formed)
        ao = bake_ao(fall, v + n * 0.0005, n, .012 if girl else .018, 1.1)
        col = np.ones((len(v), 3))
        if name == 'skin':
            q = v - headC
            blush = np.exp(-((np.abs(q[:, 0]) - .045) ** 2 + (q[:, 1] + .03) ** 2 + (q[:, 2] - .07) ** 2 * .3) / .0006)
            nose = np.exp(-(q[:, 0] ** 2 + (q[:, 1] + .02) ** 2 + (q[:, 2] - .095) ** 2) / .0003)
            col = col * (1 - .12 * blush[:, None] * V(0, 1, 1)) * (1 - .08 * nose[:, None] * V(0, 1, 1))
            if not girl:
                stub = np.clip((-(q[:, 1]) - .035) * 25, 0, 1) * (q[:, 2] > -.02) * np.clip((.075 - np.abs(q[:, 0])) * 40, 0, 1) * (v[:, 1] > H['neck'][1] + .03)
                col = col * (1 - .32 * stub[:, None])
        if name == 'shoes':
            sole = np.clip((.02 - v[:, 1]) / .006, 0, 1) if girl else np.clip((.028 - v[:, 1]) / .006, 0, 1)
            toe = np.zeros(len(v))
            col = col * (1 - sole[:, None]) + sole[:, None] * (V(1.6, 1.6, 1.55) if girl else V(.35, .33, .3))
        if name == 'pants' and girl:
            pass
        si, sw = skin_weights(v, segs, .014 if girl else .022)
        # hair / head / apron straps ride the head/chest rigidly
        if name == 'hair':
            si[:] = 0; si[:, 0] = 4; sw[:] = 0; sw[:, 0] = 1
            low = v[:, 1] < headC[1] - .09
        meshes.append({'name': name, 'v': v, 'n': n, 'f': faces, 'col': np.clip(col / 1.6, 0, 1) if True else col, 'ao': ao, 'si': si, 'w': sw})
    meta = [{'name': b[0], 'parent': b[1], 'pos': list(map(float, b[2]))} for b in bones]
    export(kind, {'list': meta, 'headC': headC.tolist()}, meshes)

# ============================================================== GLOVE
def make_glove(step=0.0013):
    # right glove, wrist at origin, fingers +Y, back of hand +Z, thumb -X
    fing = {  # base, direction (unit-ish), lengths, radius
        'index': (V(-.0285, .09, .001), V(-.13, 1, 0), (.031, .022, .019), .0098),
        'middle': (V(-.0093, .094, .002), V(-.03, 1, 0), (.034, .024, .02), .0101),
        'ring': (V(.0098, .091, .001), V(.08, 1, 0), (.032, .022, .019), .0097),
        'pinky': (V(.028, .083, 0), V(.22, 1, 0), (.025, .018, .016), .0087),
    }
    thumb = (V(-.03, .024, -.006), V(-.62, .72, -.32), (.03, .026, .022), .0128)
    bones = [('hand', -1, V(0, 0, 0))]
    segs = [(V(0, -.12, 0), V(0, .075, 0), .03)]
    chains = {}
    def chain(name, base, dirv, lens, rad, curl=0.0):
        dirv = dirv / np.linalg.norm(dirv)
        pts = [base]
        for i, l in enumerate(lens):
            pts.append(pts[-1] + dirv * l)
        chains[name] = (pts, rad)
        par = 0
        for i in range(3):
            bones.append((f'{name}{i+1}', par if i == 0 else len(bones) - 1, pts[i]))
            segs.append((pts[i], pts[i + 1], rad * .6))
    for k, (b, d, l, r) in fing.items(): chain(k, b, d, l, r)
    chain('thumb', *thumb)

    def f_glove(P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        palm = sd_rbox(P, V(.0, .046, .0), V(.044, .05, .0165), .0145)
        palm = smin(palm, sd_ell(P, V(-.024, .036, -.009), V(.02, .03, .013)), .012)  # thenar
        palm = smin(palm, sd_ell(P, V(.02, .03, -.008), V(.018, .034, .011)), .012)   # hypothenar
        d = palm
        for k, (pts, r) in chains.items():
            fd = np.full(len(P), 9.0)
            for i in range(3):
                ri = r * (1 - .05 * i); ro = r * (1 - .05 * (i + 1))
                a = pts[i]; b = pts[i + 1]
                fd = smin(fd, sd_rcone(P, a, b, ri, ro)[0], .004)
            # knuckle creases (crosswise ridges near joints), glove fabric bunching
            for i in (1, 2):
                dist, h = seg_dist(P, pts[i] - (pts[i] - pts[i - 1]) * .25, pts[i] + (pts[i + 1] - pts[i]) * .25)
                ax = (pts[i + 1] - pts[i - 1]); ax /= np.linalg.norm(ax)
                t = (P - pts[i]) @ ax
                fd = fd - .0009 * np.exp(-(t / .006) ** 2) * (np.sin(t * 900 + 3 * noise3(P * 200)) * .5 + .5) * (z > -0.003)
            k_bl = .0075 if k != 'thumb' else .012
            d = smin(d, fd, k_bl)
        # gauntlet cuff, open tube, slightly flared, elliptical
        q = P.copy(); q[:, 2] = q[:, 2] / .78
        cuffo = sd_rcone(q, V(0, .012, 0), V(0, -.105, 0), .046, .061)[0]
        cuffi = sd_rcone(q, V(0, .02, 0), V(0, -.13, 0), .041, .056)[0]
        cuff = smax(cuffo, -cuffi, .002)
        cuff = smax(cuff, -.104 - y, .002)
        hem = sd_rcone(q, V(0, -.099, 0), V(0, -.103, 0), .061, .062)[0] - .0024
        hem = smax(hem, -cuffi + .0005, .001)
        cuff = smin(cuff, hem, .003)
        cuff = cuff + .0009 * fbm3(P * 70, 3) + .0005 * np.sin(y * 260 + 4 * noise3(P * 50)) * (y < -.02)
        d = smin(d, cuff, .016)
        # wrist gather (elastic)
        d = d - .0018 * np.exp(-((y - .004) / .006) ** 2) * (np.sin(np.arctan2(x, z) * 34) * .5 + .5)
        # side seams on the mid-plane (fourchettes) with stitch dimples
        seam = np.exp(-(z / .0009) ** 2)
        d = d + .00085 * seam
        stitch = np.exp(-((np.abs(z) - .0026) / .0006) ** 2) * (np.sin((y + x) * 1800) > .3)
        d = d + .00035 * stitch * (y > -.1)
        # cuff vertical seam
        d = d + .0007 * np.exp(-((x - .0) ** 2 / .0012 ** 2)) * (z < 0) * (y < .0)
        d = d + .0006 * fbm3(P * 260, 2)
        return d

    def f_sleeve(P):
        q = P.copy(); q[:, 2] /= .82
        d = sd_rcone(q, V(0, -.07, 0), V(0, -.42, 0), .036, .043)[0]
        y = P[:, 1]
        d = d - .0025 * np.exp(-((y + .118) / .016) ** 2) * (np.sin(np.arctan2(P[:, 0], P[:, 2]) * 7 + 5 * noise3(P * 30)) * .5 + .5)
        d = d + .0018 * np.sin(y * 140 + 3 * noise3(P * 25)) * np.exp(-((y + .16) / .05) ** 2)
        d = d + .0009 * fbm3(P * 90, 3)
        return d
    v, n, f = mesh_sdf(f_glove, (-.105, -.112, -.07), (.075, .2, .07), step, 36000)
    fall = lambda P: np.minimum(f_glove(P), f_sleeve(P))
    ao = bake_ao(fall, v + n * 0.0003, n, .005, 1.2)
    si, sw = skin_weights(v, segs, .004)
    col = np.ones((len(v), 3))
    # darker reinforcement patch on palm between thumb & index, stitched outline
    pm = np.clip((.004 - sd_ell(v, V(-.02, .06, -.016), V(.03, .04, .02))) / .002, 0, 1) * (v[:, 2] < -.008)
    col = col * (1 - .22 * pm[:, None] * V(1, 1.1, 1.3))
    cuffm = np.clip((-.004 - v[:, 1]) / .004, 0, 1)
    col = col * (1 - cuffm[:, None] * V(-.05, .02, .12))
    stitch = np.exp(-((np.abs(v[:, 2]) - .0026) / .0006) ** 2) * (np.sin((v[:, 1] + v[:, 0]) * 1800) > .3)
    col = col * (1 - .35 * stitch[:, None])
    col = np.clip(col / 1.15, 0, 1)
    sv, sn, sf = mesh_sdf(f_sleeve, (-.07, -.42, -.07), (.07, -.06, .07), step * 2, 5000)
    sao = bake_ao(fall, sv + sn * 0.0003, sn, .008, 1.0)
    ssi = np.zeros((len(sv), 4), np.uint8); ssw = np.zeros((len(sv), 4)); ssw[:, 0] = 1
    meta = [{'name': b[0], 'parent': b[1], 'pos': list(map(float, b[2]))} for b in bones]
    export('glove', {'list': meta}, [
        {'name': 'glove', 'v': v, 'n': n, 'f': f, 'col': col, 'ao': ao, 'si': si, 'w': sw},
        {'name': 'sleeve', 'v': sv, 'n': sn, 'f': sf, 'col': np.ones((len(sv), 3)) * .85, 'ao': sao, 'si': ssi, 'w': ssw},
    ])

if __name__ == '__main__':
    what = sys.argv[1:] or ['glove', 'girl', 'papa']
    if 'glove' in what: make_glove()
    if 'girl' in what: make_person('girl', .0065)
    if 'papa' in what: make_person('papa', .0095)
