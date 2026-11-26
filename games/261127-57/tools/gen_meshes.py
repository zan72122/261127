# -*- coding: utf-8 -*-
"""Organic meshes (child hand + coat sleeve, girl, dad, hanging lab coat) built from
signed-distance-field primitives blended with smooth-min, polygonised with marching cubes,
decimated, then given cylindrical UVs, material ids and skin weights.
Output: ../mesh/people.bin + ../mesh/people.json
"""
import os, json, math, struct
import numpy as np
from skimage import measure
import fast_simplification as fs

OUT = os.path.join(os.path.dirname(__file__), '..', 'mesh')
os.makedirs(OUT, exist_ok=True)

def V(*a):
    return np.array(a, dtype=np.float64)

def norm(v):
    return v / (np.linalg.norm(v) + 1e-12)

# ---------------------------------------------------------------- SDF primitives
def sd_roundcone(p, a, b, r1, r2):
    ba = b - a
    l2 = ba @ ba
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = p - a
    y = pa @ ba
    z = y - l2
    q = pa * l2 - y[..., None] * ba
    x2 = np.einsum('...i,...i->...', q, q)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d1 = np.sqrt(x2 + z2) * il2 - r2
    d2 = np.sqrt(x2 + y2) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d1, np.where(np.sign(y) * a2 * y2 < k, d2, d3))

def sd_ellipsoid(p, c, r):
    q = (p - c)
    k0 = np.linalg.norm(q / r, axis=-1)
    k1 = np.linalg.norm(q / (r * r), axis=-1)
    return k0 * (k0 - 1.0) / (k1 + 1e-12)

def sd_box(p, c, h, rad):
    q = np.abs(p - c) - (h - rad)
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(np.max(q, axis=-1), 0) - rad

def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

class Prim:
    def __init__(self, kind, args, mat=0, chain=0, k=0.0, disp=None, sub=False, bias=0.0):
        self.kind, self.args, self.mat, self.chain, self.k, self.disp, self.sub, self.bias = kind, args, mat, chain, k, disp, sub, bias

    def bbox(self):
        a = self.args
        if self.kind == 'cone':
            A, B, r1, r2 = a
            r = max(r1, r2)
            return np.minimum(A, B) - r, np.maximum(A, B) + r
        if self.kind == 'ell':
            c, r = a
            return c - r, c + r
        if self.kind == 'box':
            c, h, rad = a
            return c - h, c + h
        if self.kind == 'torus':
            c, R_, r_ = a
            e = V(R_ + r_, r_, R_ + r_)
            return c - e, c + e

    def eval(self, p):
        a = self.args
        if self.kind == 'cone':
            d = sd_roundcone(p, a[0], a[1], a[2], a[3])
        elif self.kind == 'ell':
            d = sd_ellipsoid(p, a[0], a[1])
        elif self.kind == 'torus':
            q = (p - a[0]) / V(1.0, 1.0, 0.64)
            d = sd_torus_y(q, V(0, 0, 0), a[1], a[2]) * 0.8
        else:
            d = sd_box(p, a[0], a[1], a[2])
        if self.disp is not None:
            d = d + self.disp(p)
        return d

def sd_torus_y(p, c, R, r):
    q = p - c
    xz = np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2) - R
    return np.sqrt(xz * xz + q[..., 1] ** 2) - r

def cone(a, b, r1, r2, **kw):
    return Prim('cone', (V(*a), V(*b), r1, r2), **kw)

def ell(c, r, **kw):
    return Prim('ell', (V(*c), V(*r)), **kw)

def box(c, h, rad, **kw):
    return Prim('box', (V(*c), V(*h), rad), **kw)

def build(prims, vox, pad=0.02, shell=None):
    lo = np.min([p.bbox()[0] for p in prims if not p.sub], axis=0) - pad
    hi = np.max([p.bbox()[1] for p in prims if not p.sub], axis=0) + pad
    n = np.ceil((hi - lo) / vox).astype(int) + 1
    print('  grid', n, n.prod() / 1e6, 'M')
    D = np.full(tuple(n), 0.05, dtype=np.float32)
    for pr in prims:
        b0, b1 = pr.bbox()
        m = max(pr.k, 0.004) + 0.012
        i0 = np.clip(np.floor((b0 - m - lo) / vox).astype(int), 0, n - 1)
        i1 = np.clip(np.ceil((b1 + m - lo) / vox).astype(int) + 1, 0, n)
        xs = lo[0] + np.arange(i0[0], i1[0]) * vox
        ys = lo[1] + np.arange(i0[1], i1[1]) * vox
        zs = lo[2] + np.arange(i0[2], i1[2]) * vox
        P = np.stack(np.meshgrid(xs, ys, zs, indexing='ij'), -1)
        d = pr.eval(P).astype(np.float32)
        sl = (slice(i0[0], i1[0]), slice(i0[1], i1[1]), slice(i0[2], i1[2]))
        if pr.sub:
            D[sl] = np.maximum(D[sl], -d)
        else:
            D[sl] = smin(D[sl], d, pr.k)
    if shell is not None:
        D = np.abs(D) - shell
    verts, faces, _, _ = measure.marching_cubes(D, 0.0, spacing=(vox, vox, vox))
    verts = verts + lo
    return verts, faces

def decimate(v, f, target_tris):
    red = 1.0 - target_tris / max(len(f), 1)
    if red > 0.05:
        v, f = fs.simplify(v.astype(np.float32), f.astype(np.int32), target_reduction=red, agg=6)
    return v.astype(np.float64), f.astype(np.int64)

def vnormals(v, f):
    n = np.zeros_like(v)
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    for i in range(3):
        np.add.at(n, f[:, i], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)

def smooth(v, f, it=2, lam=0.5, mu=-0.53):
    """Taubin smoothing to remove marching-cube terracing."""
    nv = len(v)
    import scipy.sparse as sp
    rows = np.concatenate([f[:, 0], f[:, 1], f[:, 2], f[:, 1], f[:, 2], f[:, 0]])
    cols = np.concatenate([f[:, 1], f[:, 2], f[:, 0], f[:, 0], f[:, 1], f[:, 2]])
    A = sp.coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(nv, nv)).tocsr()
    A.data[:] = 1
    deg = np.asarray(A.sum(1)).ravel()
    deg[deg == 0] = 1
    for _ in range(it):
        for fac in (lam, mu):
            avg = (A @ v) / deg[:, None]
            v = v + fac * (avg - v)
    return v

def smooth_labels(lab, f, it=2):
    import scipy.sparse as sp
    nv = len(lab)
    rows = np.concatenate([f[:, 0], f[:, 1], f[:, 2], f[:, 1], f[:, 2], f[:, 0]])
    cols = np.concatenate([f[:, 1], f[:, 2], f[:, 0], f[:, 0], f[:, 1], f[:, 2]])
    A = sp.coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(nv, nv)).tocsr()
    A.data[:] = 1
    labs = np.unique(lab)
    for _ in range(it):
        votes = np.stack([A @ (lab == l).astype(np.float64) + 1.5 * (lab == l) for l in labs], 1)
        lab = labs[np.argmax(votes, 1)]
    return lab

def classify(v, prims):
    """material/chain per vertex = closest primitive (with bias)."""
    best = np.full(len(v), 1e9)
    mat = np.zeros(len(v), np.uint8)
    chain = np.zeros(len(v), np.int32)
    for pr in prims:
        if pr.sub:
            continue
        d = np.abs(pr.eval(v)) + pr.bias
        m = d < best
        best[m] = d[m]
        mat[m] = pr.mat
        chain[m] = pr.chain
    return mat, chain

# ---------------------------------------------------------------- bones / skinning
class Skel:
    def __init__(self):
        self.names, self.parent, self.head, self.axis = [], [], [], []

    def add(self, name, parent, head, axis=(1, 0, 0)):
        self.names.append(name)
        self.parent.append(self.names.index(parent) if parent else -1)
        self.head.append(V(*head))
        self.axis.append(norm(V(*axis)))
        return len(self.names) - 1

def seg_param(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    d = np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
    return t, d

def chain_weights(v, pts, bones, blend=0.25):
    """pts: joint points along a chain (len n+1), bones: bone index of each segment (len n).
    returns weights (N, n) over the chain's segments, blended near joints."""
    n = len(bones)
    best = np.full(len(v), 1e9); seg = np.zeros(len(v), int); tt = np.zeros(len(v))
    for i in range(n):
        t, d = seg_param(v, pts[i], pts[i + 1])
        m = d < best
        best[m] = d[m]; seg[m] = i; tt[m] = t[m]
    W = np.zeros((len(v), n))
    for i in range(n):
        m = seg == i
        W[m, i] = 1
        if i > 0:  # blend with previous near start
            mm = m & (tt < blend)
            w = 0.5 + 0.5 * tt[mm] / blend
            W[mm, i] = w; W[mm, i - 1] = 1 - w
        if i < n - 1:
            mm = m & (tt > 1 - blend)
            w = 0.5 + 0.5 * (1 - tt[mm]) / blend
            W[mm, i] = w; W[mm, i + 1] = 1 - w
    return W

def pack_weights(Wfull):
    """Wfull: (N, nbones) -> top4 idx(u8), weights(u8)"""
    idx = np.argsort(-Wfull, axis=1)[:, :4]
    w = np.take_along_axis(Wfull, idx, 1)
    w = w / (w.sum(1, keepdims=True) + 1e-12)
    wq = np.round(w * 255).astype(np.int32)
    wq[:, 0] += 255 - wq.sum(1)
    return idx.astype(np.uint8), np.clip(wq, 0, 255).astype(np.uint8)

def cyl_uv(v, a, b, front):
    """uv in meters: u = arc length around axis (seam at `front` direction), v = along axis."""
    ax = norm(b - a)
    ref = norm(front - ax * (front @ ax))
    side = np.cross(ax, ref)
    p = v - a
    along = p @ ax
    q = p - along[:, None] * ax
    ang = np.arctan2(q @ side, q @ ref)  # 0 at seam(front)
    ang = np.where(ang < 0, ang + 2 * math.pi, ang)
    r = np.linalg.norm(q, axis=1)
    return np.stack([ang * np.maximum(r.mean(), 0.01), along], 1)

# ---------------------------------------------------------------- export
meshes = {}

def add_mesh(name, v, f, n, uv, mat, skin=None, skel=None):
    meshes[name] = dict(v=v.astype(np.float32), f=f.astype(np.uint16 if len(v) < 65536 else np.uint32), n=n,
                        uv=uv.astype(np.float32), mat=mat.astype(np.uint8), skin=skin, skel=skel)
    print('  ', name, len(v), 'verts', len(f), 'tris')

def write_all():
    blob = bytearray()
    meta = {}
    def put(arr):
        nonlocal blob
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob += arr.tobytes()
        return off
    for name, m in meshes.items():
        e = {}
        e['count'] = len(m['v'])
        e['pos'] = put(m['v'].ravel())
        nq = np.round(m['n'] * 127).astype(np.int8)
        e['nrm'] = put(nq.ravel())
        e['uv'] = put(m['uv'].ravel())
        e['mat'] = put(m['mat'])
        e['index'] = put(m['f'].ravel())
        e['icount'] = int(m['f'].size)
        e['i32'] = m['f'].dtype == np.uint32
        if m['skin'] is not None:
            e['si'] = put(m['skin'][0].ravel())
            e['sw'] = put(m['skin'][1].ravel())
            sk = m['skel']
            e['bones'] = [dict(name=sk.names[i], parent=sk.parent[i], head=[round(float(x), 5) for x in sk.head[i]],
                               axis=[round(float(x), 4) for x in sk.axis[i]]) for i in range(len(sk.names))]
        meta[name] = e
    with open(os.path.join(OUT, 'people.bin'), 'wb') as fh:
        fh.write(bytes(blob))
    with open(os.path.join(OUT, 'people.json'), 'w') as fh:
        json.dump(meta, fh)
    print('wrote', len(blob) / 1e6, 'MB')

# ================================================================ CHILD HAND (right), palm -Z, fingers +Y, thumb -X
SKIN, NAIL, COAT, HAIR, KNIT, TIGHTS, SHOE, TIE, DENIM, FLANNEL, MUG, SKIRT = range(12)

def make_hand():
    print('hand')
    sk = Skel()
    sk.add('arm', None, (0, -0.15, 0))
    sk.add('wrist', 'arm', (0, 0, 0))
    fingers = {
        # name: (mcp xyz, lengths, base radius, tip radius, spread deg, rest curl deg)
        'index': ((-0.0185, 0.060, 0.0), (0.0235, 0.0150, 0.0125), 0.0079, 0.0063, -5, (8, 12, 8)),
        'middle': ((-0.0058, 0.063, 0.0), (0.0265, 0.0170, 0.0130), 0.0081, 0.0064, -1, (10, 14, 9)),
        'ring': ((0.0068, 0.061, 0.0), (0.0245, 0.0160, 0.0125), 0.0077, 0.0061, 4, (12, 16, 10)),
        'pinky': ((0.0185, 0.055, -0.001), (0.0190, 0.0120, 0.0110), 0.0068, 0.0054, 10, (14, 18, 10)),
    }
    prims = []
    chains = {}
    # palm
    prims.append(box((0.0, 0.031, 0.0), (0.0245, 0.032, 0.0105), 0.0095, mat=SKIN, chain=0, k=0.0))
    prims.append(ell((-0.012, 0.020, -0.0065), (0.016, 0.022, 0.0105), mat=SKIN, chain=0, k=0.008))  # thenar
    prims.append(ell((0.015, 0.024, -0.005), (0.011, 0.024, 0.0095), mat=SKIN, chain=0, k=0.008))   # hypothenar
    prims.append(ell((0.0, 0.054, -0.006), (0.024, 0.008, 0.007), mat=SKIN, chain=0, k=0.006))      # finger pads base
    # wrist & forearm (flattened)
    prims.append(cone((-0.006, 0.004, 0.0), (-0.008, -0.17, 0.0), 0.0150, 0.0185, mat=SKIN, chain=-1, k=0.012))
    prims.append(cone((0.006, 0.004, 0.0), (0.008, -0.17, 0.0), 0.0145, 0.0180, mat=SKIN, chain=-1, k=0.012))
    ci = 1
    for fname, (mcp, L, r0, r1, spread, curl) in fingers.items():
        a = V(*mcp)
        d = norm(V(math.sin(math.radians(spread)), math.cos(math.radians(spread)), 0))
        pts = [a]
        ang = 0
        rr = [r0, r0 * 0.93, (r0 + r1) / 2 * 0.95, r1]
        for j in range(3):
            ang += math.radians(curl[j])
            dj = norm(V(d[0] * math.cos(ang), d[1] * math.cos(ang), -math.sin(ang)))
            pts.append(pts[-1] + dj * L[j])
        for j in range(3):
            prims.append(cone(pts[j], pts[j + 1], rr[j], rr[j + 1], mat=SKIN, chain=ci, k=0.0025))
            # knuckle pad (fleshier palm side)
            mid = (pts[j] + pts[j + 1]) / 2 + V(0, 0, -rr[j] * 0.25)
        # dorsal knuckle bump at MCP
        prims.append(ell(a + V(0, -0.002, 0.004), (0.0062, 0.0055, 0.0045), mat=SKIN, chain=ci, k=0.004, bias=0.002))
        b = [sk.add(fname + str(j), 'wrist' if j == 0 else fname + str(j - 1), pts[j], (1, 0, 0)) for j in range(3)]
        chains[ci] = (pts, b, fname)
        ci += 1
    # thumb
    tp = [V(-0.016, 0.010, -0.004), V(-0.033, 0.030, -0.013), V(-0.041, 0.047, -0.021), V(-0.0445, 0.0605, -0.0265)]
    trad = [0.0115, 0.0092, 0.0084, 0.0072]
    for j in range(3):
        prims.append(cone(tp[j], tp[j + 1], trad[j], trad[j + 1], mat=SKIN, chain=ci, k=0.006 if j == 0 else 0.002))
    taxis = norm(np.cross(norm(tp[2] - tp[1]), V(-0.7, 0, 0.71)))
    b = [sk.add('thumb' + str(j), 'wrist' if j == 0 else 'thumb' + str(j - 1), tp[j], taxis) for j in range(3)]
    chains[ci] = (tp, b, 'thumb')
    v, f = build(prims, 0.0008, pad=0.01)
    v = smooth(v, f, 3)
    v, f = decimate(v, f, 16000)
    v = smooth(v, f, 1)
    n = vnormals(v, f)
    mat, chain = classify(v, prims)
    nb = len(sk.names)
    W = np.zeros((len(v), nb))
    for ci_, (pts, bidx, fname) in chains.items():
        m = chain == ci_
        if not m.any():
            continue
        # include a virtual segment from palm to MCP so knuckle area blends with wrist
        root = pts[0] - norm(pts[1] - pts[0]) * 0.012
        P = [root] + list(pts)
        Wc = chain_weights(v[m], P, [1] + bidx, blend=0.3)
        Wm = np.zeros((m.sum(), nb))
        for k_, bi in enumerate([1] + bidx):
            Wm[:, bi] += Wc[:, k_]
        W[m] = Wm
        # nails
        if True:
            a, bb = pts[2], pts[3]
            t, dd = seg_param(v, a, bb)
            ax = norm(bb - a)
            dors = V(0, 0, 1) if fname != 'thumb' else V(-0.7, 0, 0.71)
            dors = norm(dors - ax * (dors @ ax))
            q = v - (a + t[:, None] * (bb - a))
            qn = q / (np.linalg.norm(q, axis=1, keepdims=True) + 1e-12)
            # allow tip overhang: use unclamped param
            tu = ((v - a) @ (bb - a)) / ((bb - a) @ (bb - a))
            nail = (chain == ci_) & (tu > 0.28) & (tu < 1.12) & ((qn @ dors) > 0.62)
            mat[nail] = NAIL
    m = chain == 0
    W[m, 1] = 1
    m = chain == -1
    # forearm/wrist blend
    y = v[m, 1]
    w = np.clip((y + 0.025) / 0.03, 0, 1)
    Wm = np.zeros((m.sum(), nb)); Wm[:, 1] = w; Wm[:, 0] = 1 - w
    W[m] = Wm
    si, sw = pack_weights(W)
    uv = np.stack([v[:, 0] * 1.0, v[:, 1] * 1.0], 1)  # planar (skin detail is isotropic)
    uv = uv + np.stack([v[:, 2] * 0.7, v[:, 2] * 0.4], 1)
    add_mesh('hand', v, f, n, uv, mat, (si, sw), sk)

def make_sleeve(name='sleeve', r0=0.026, r1=0.042, L=0.42, cuff=0.022, folds=7):
    """Lab-coat sleeve over the forearm (open tube with rolled cuff and compression folds)."""
    print(name)
    a = V(0, -0.025, 0); b = V(0, -0.025 - L, 0)
    def disp(p):
        y = p[..., 1]
        ang = np.arctan2(p[..., 2], p[..., 0])
        t = np.clip((-0.025 - y) / L, 0, 1)
        f1 = 0.0012 * np.sin(y * 190 + 2.3 * np.sin(ang * 2 + y * 30)) * (0.3 + 0.7 * t)
        f2 = 0.0016 * np.sin(ang * 3 + y * 70 + 1.3 * np.sin(y * 45)) * (0.3 + 0.7 * t)
        f3 = 0.0011 * np.sin(ang * 5 - y * 110) * t
        return -(f1 + f2 + f3)
    prims = [cone(a, b, r0, r1, mat=COAT, k=0, disp=disp)]
    # rolled cuff ring
    prims.append(cone(a + V(0, 0.003, 0), a - V(0, cuff, 0), r0 + 0.004, r0 + 0.0045, mat=COAT, k=0.004))
    prims.append(Prim('cone', (a + V(0, 0.012, 0), a - V(0, 0.4, 0), r0 - 0.0035, r1 - 0.004), sub=True))
    v, f = build(prims, 0.0009, pad=0.006)
    v = smooth(v, f, 2)
    # cut away bottom end (keep open)
    v, f = decimate(v, f, 9000)
    n = vnormals(v, f)
    uv = cyl_uv(v, a, b, V(0, 0, -1))
    add_mesh(name, v, f, n, uv, np.full(len(v), COAT, np.uint8))

# ================================================================ GIRL (5y, 1.10m), facing -Z, back to camera (+Z)
def girl_parts(coat=False):
    P = []
    # head & hair
    P.append(ell((0, 0.985, 0.0), (0.074, 0.090, 0.084), mat=SKIN, chain=1))
    P.append(ell((0.071, 0.975, -0.004), (0.010, 0.022, 0.014), mat=SKIN, chain=1, k=0.006))   # ears
    P.append(ell((-0.071, 0.975, -0.004), (0.010, 0.022, 0.014), mat=SKIN, chain=1, k=0.006))
    def hairdisp(p):
        ang = np.arctan2(p[..., 0], p[..., 2])
        return -0.0018 * np.abs(np.sin(ang * 26 + p[..., 1] * 30)) - 0.001 * np.sin(ang * 61)
    P.append(ell((0, 1.002, 0.010), (0.081, 0.093, 0.088), mat=HAIR, chain=1, k=0.004, disp=hairdisp, bias=-0.002))
    P.append(ell((0, 0.955, 0.035), (0.071, 0.058, 0.060), mat=HAIR, chain=1, k=0.02, disp=hairdisp, bias=-0.002))
    # pigtails (bunches of strands)
    for s in (-1, 1):
        base = V(s * 0.062, 0.945, 0.045)
        P.append(ell(base, (0.016, 0.016, 0.016), mat=TIE, chain=1, k=0.0))
        for k in range(5):
            ang = k / 5 * math.tau
            off = V(math.cos(ang) * 0.007, 0, math.sin(ang) * 0.007)
            tip = base + V(s * 0.03, -0.13 - 0.012 * math.sin(ang * 2), 0.01) + off * 1.6
            P.append(cone(base + off, tip, 0.012, 0.004, mat=HAIR, chain=1, k=0.006))
    # neck
    P.append(cone((0, 0.88, 0.0), (0, 0.93, 0.0), 0.030, 0.030, mat=SKIN, chain=1, k=0.015))
    # torso (sweater)
    def knitdisp(p):
        return -0.0012 * np.sin(p[..., 1] * 300)
    P.append(ell((0, 0.785, 0.004), (0.104, 0.090, 0.070), mat=KNIT, chain=0, k=0.0))
    P.append(ell((0, 0.680, 0.006), (0.100, 0.110, 0.072), mat=KNIT, chain=0, k=0.03))
    P.append(cone((-0.095, 0.822, 0.005), (0.095, 0.822, 0.005), 0.042, 0.042, mat=KNIT, chain=0, k=0.03))
    # skirt (pleated)
    def pleat(p):
        ang = np.arctan2(p[..., 0], p[..., 2])
        return -0.004 * np.abs(np.sin(ang * 9))
    P.append(cone((0, 0.60, 0.005), (0, 0.40, 0.005), 0.098, 0.140, mat=SKIRT, chain=0, k=0.02, disp=pleat))
    P.append(Prim('box', (V(0, 0.33, 0.0), V(0.3, 0.1, 0.3), 0.0), sub=True, mat=SKIRT))
    P.append(cone((0, 0.603, 0.004), (0, 0.585, 0.004), 0.101, 0.103, mat=SKIRT, chain=0, k=0.004))  # waistband
    # legs & shoes
    for s in (-1, 1):
        P.append(cone((s * 0.050, 0.55, 0.0), (s * 0.052, 0.30, 0.004), 0.046, 0.034, mat=TIGHTS, chain=0, k=0.01))
        P.append(cone((s * 0.052, 0.30, 0.004), (s * 0.054, 0.065, 0.010), 0.034, 0.024, mat=TIGHTS, chain=0, k=0.006))
        P.append(box((s * 0.055, 0.030, -0.025), (0.034, 0.030, 0.080), 0.026, mat=SHOE, chain=0, k=0.008))
    # arms: reaching forward to the table edge (table top y=0.72 at z=-0.16)
    arms = {}
    for s, side in ((-1, 'L'), (1, 'R')):
        sh = V(s * 0.125, 0.815, 0.004)
        el = V(s * 0.165, 0.665, -0.040)
        wr = V(s * 0.115, 0.735, -0.190)
        hd = V(s * 0.090, 0.735, -0.245)
        sl = 0.040 if not coat else 0.030
        P.append(cone(sh, el, 0.034, 0.028, mat=KNIT, chain=2 if s < 0 else 4, k=0.02))
        P.append(cone(el, wr, 0.028, 0.022, mat=KNIT, chain=3 if s < 0 else 5, k=0.008))
        P.append(cone(wr - V(0, 0, 0.005), hd, 0.019, 0.017, mat=SKIN, chain=3 if s < 0 else 5, k=0.008, bias=-0.004))
        P.append(cone(wr - norm(wr - el) * 0.004, wr + norm(wr - el) * 0.006, 0.0215, 0.0215, mat=KNIT, chain=3 if s < 0 else 5, k=0.002))
        arms[side] = (sh, el, wr, hd)
    return P, arms

def coat_parts(arms, hanging=False):
    P = []
    def folds(p):
        ang = np.arctan2(p[..., 0], p[..., 2])
        y = p[..., 1]
        t = np.clip((0.70 - y) / 0.36, 0, 1)
        return -0.006 * t * np.abs(np.sin(ang * 4.5 + 0.8 * np.sin(y * 9))) - 0.0015 * np.sin(ang * 13 + y * 20)
    def vent(p):
        # back seam & vent groove (back is +Z)
        g = np.exp(-((p[..., 0]) / 0.004) ** 2) * (p[..., 2] > 0)
        return 0.002 * g
    P.append(ell((0, 0.790, 0.004), (0.122, 0.100, 0.086), mat=COAT, k=0.0, disp=vent))
    P.append(cone((0, 0.78, 0.004), (0, 0.33, 0.012), 0.112, 0.160, mat=COAT, k=0.04, disp=lambda p: folds(p) + vent(p)))
    P.append(Prim('box', (V(0, 0.25, 0.0), V(0.4, 0.1, 0.4), 0.0), sub=True))
    P.append(Prim('cone', (V(0, 0.60, 0.006), V(0, 0.30, 0.012), 0.085, 0.145), sub=True))
    P.append(cone((-0.11, 0.830, 0.004), (0.11, 0.830, 0.004), 0.052, 0.052, mat=COAT, k=0.03))
    # collar
    P.append(cone((-0.05, 0.900, 0.020), (0.0, 0.905, 0.045), 0.012, 0.012, mat=COAT, k=0.01))
    P.append(cone((0.05, 0.900, 0.020), (0.0, 0.905, 0.045), 0.012, 0.012, mat=COAT, k=0.01))
    for side, (sh, el, wr, hd) in arms.items():
        def sfold(p, a=sh, b=wr):
            ax = norm(b - a)
            t = (p - a) @ ax
            return -0.0025 * np.sin(t * 160) * np.clip(t / 0.2, 0, 1)
        P.append(cone(sh, el, 0.046, 0.040, mat=COAT, k=0.02, disp=sfold))
        P.append(cone(el, wr + norm(wr - el) * 0.01, 0.040, 0.036, mat=COAT, k=0.01, disp=sfold))
        P.append(cone(wr - norm(wr - el) * 0.012, wr + norm(wr - el) * 0.012, 0.040, 0.040, mat=COAT, k=0.004))  # cuff roll
    return P

def make_girl():
    print('girl')
    P, arms = girl_parts()
    sk = Skel()
    sk.add('root', None, (0, 0.0, 0))
    sk.add('spine', 'root', (0, 0.60, 0))
    sk.add('head', 'spine', (0, 0.90, 0))
    for side in ('L', 'R'):
        sh, el, wr, hd = arms[side]
        sk.add('upper' + side, 'spine', sh)
        sk.add('fore' + side, 'upper' + side, el)
        sk.add('hand' + side, 'fore' + side, wr)
    v, f = build(P, 0.0035, pad=0.02)
    v = smooth(v, f, 3)
    v, f = decimate(v, f, 26000)
    v = smooth(v, f, 1)
    n = vnormals(v, f)
    mat, chain = classify(v, P)
    mat = smooth_labels(mat, f, 3)
    W = girl_weights(v, chain, arms, sk)
    si, sw = pack_weights(W)
    uv = cyl_uv(v, V(0, 1.2, 0), V(0, 0, 0), V(0, 0, -1))
    add_mesh('girl', v, f, n, uv, mat, (si, sw), sk)
    # coat worn (separate mesh, same skeleton)
    print('coat')
    C = coat_parts(arms)
    v, f = build(C, 0.0035, pad=0.02)
    v = smooth(v, f, 3)
    v, f = decimate(v, f, 16000)
    v = smooth(v, f, 1)
    n = vnormals(v, f)
    # chain by nearest arm segment vs torso
    chain = np.zeros(len(v), np.int32)
    best = np.full(len(v), 1e9)
    for side, (sh, el, wr, hd) in arms.items():
        for ci, (a, b) in ((2 if side == 'L' else 4, (sh, el)), (3 if side == 'L' else 5, (el, wr))):
            t, d = seg_param(v, a, b)
            m = (d < best) & (d < 0.065)
            best[m] = d[m]; chain[m] = ci
    W = girl_weights(v, chain, arms, sk)
    si, sw = pack_weights(W)
    uv = cyl_uv(v, V(0, 1.2, 0), V(0, 0, 0), V(0, 0, -1))
    add_mesh('coat', v, f, n, uv, np.full(len(v), COAT, np.uint8), (si, sw), sk)

def girl_weights(v, chain, arms, sk):
    nb = len(sk.names)
    W = np.zeros((len(v), nb))
    bi = {n: i for i, n in enumerate(sk.names)}
    y = v[:, 1]
    # torso/legs
    m = (chain == 0)
    w = np.clip((y - 0.55) / 0.1, 0, 1)
    W[m, bi['spine']] = w[m]; W[m, bi['root']] = 1 - w[m]
    m = chain == 1
    w = np.clip((y - 0.86) / 0.05, 0, 1)
    W[m, bi['head']] = w[m]; W[m, bi['spine']] = 1 - w[m]
    for side, cu, cf in (('L', 2, 3), ('R', 4, 5)):
        sh, el, wr, hd = arms[side]
        m = (chain == cu) | (chain == cf)
        if not m.any():
            continue
        Wc = chain_weights(v[m], [sh - V(-1 if side == 'L' else 1, 0, 0) * 0.03 * -1, sh, el, wr, hd],
                           [bi['spine'], bi['upper' + side], bi['fore' + side], bi['hand' + side]], blend=0.3)
        Wm = np.zeros((m.sum(), nb))
        for k_, b_ in enumerate([bi['spine'], bi['upper' + side], bi['fore' + side], bi['hand' + side]]):
            Wm[:, b_] += Wc[:, k_]
        W[m] = Wm
    z = W.sum(1) == 0
    W[z, bi['spine']] = 1
    return W

def make_hanging_coat():
    print('coat_hang')
    arms = {}
    for s, side in ((-1, 'L'), (1, 'R')):
        sh = V(s * 0.125, 0.815, 0.004)
        el = V(s * 0.150, 0.640, 0.010)
        wr = V(s * 0.150, 0.470, 0.012)
        arms[side] = (sh, el, wr, wr)
    C = coat_parts(arms, hanging=True)
    v, f = build(C, 0.004, pad=0.02)
    v = smooth(v, f, 3)
    v, f = decimate(v, f, 12000)
    v = smooth(v, f, 1)
    n = vnormals(v, f)
    uv = cyl_uv(v, V(0, 1.2, 0), V(0, 0, 0), V(0, 0, -1))
    add_mesh('coathang', v, f, n, uv, np.full(len(v), COAT, np.uint8))

# ================================================================ DAD (1.78m), facing -Z, back to camera
def make_dad():
    print('dad')
    S = 1.0
    P = []
    def hairdisp(p):
        ang = np.arctan2(p[..., 0], p[..., 2])
        return -0.0012 * np.abs(np.sin(ang * 40 + p[..., 1] * 60))
    P.append(ell((0, 1.655, 0.0), (0.078, 0.105, 0.095), mat=SKIN, chain=1))
    P.append(ell((0.080, 1.645, 0.0), (0.010, 0.026, 0.016), mat=SKIN, chain=1, k=0.006))
    P.append(ell((-0.080, 1.645, 0.0), (0.010, 0.026, 0.016), mat=SKIN, chain=1, k=0.006))
    P.append(ell((0, 1.690, 0.012), (0.083, 0.085, 0.092), mat=HAIR, chain=1, k=0.003, disp=hairdisp, bias=-0.002))
    P.append(cone((0, 1.50, 0.0), (0, 1.58, 0.005), 0.055, 0.050, mat=SKIN, chain=1, k=0.02))
    def shirt(p):
        y = p[..., 1]
        ang = np.arctan2(p[..., 0], p[..., 2])
        return -0.004 * np.abs(np.sin(ang * 3 + y * 8)) * np.clip((1.3 - y) / 0.4, 0, 1)
    P.append(ell((0, 1.330, 0.0), (0.185, 0.165, 0.115), mat=FLANNEL, chain=0, k=0.0, disp=shirt))
    P.append(ell((0, 1.120, 0.0), (0.165, 0.160, 0.110), mat=FLANNEL, chain=0, k=0.05, disp=shirt))
    P.append(cone((-0.17, 1.44, 0.0), (0.17, 1.44, 0.0), 0.062, 0.062, mat=FLANNEL, chain=0, k=0.04))
    P.append(cone((-0.05, 1.50, 0.02), (0.0, 1.51, 0.06), 0.016, 0.016, mat=FLANNEL, chain=0, k=0.01))
    P.append(cone((0.05, 1.50, 0.02), (0.0, 1.51, 0.06), 0.016, 0.016, mat=FLANNEL, chain=0, k=0.01))
    def jeans(p):
        return -0.003 * np.abs(np.sin(p[..., 1] * 70)) * np.clip((0.5 - p[..., 1]) / 0.4, 0, 1)
    P.append(ell((0, 0.950, 0.0), (0.170, 0.110, 0.105), mat=DENIM, chain=0, k=0.03))
    P.append(Prim('torus', (V(0, 0.99, 0.0), 0.162, 0.014), mat=SHOE, chain=0, k=0.004))  # leather belt
    for s in (-1, 1):
        P.append(cone((s * 0.09, 0.90, 0.0), (s * 0.10, 0.50, 0.01), 0.078, 0.058, mat=DENIM, chain=0, k=0.02, disp=jeans))
        P.append(cone((s * 0.10, 0.50, 0.01), (s * 0.105, 0.09, 0.02), 0.058, 0.050, mat=DENIM, chain=0, k=0.01, disp=jeans))
        P.append(box((s * 0.105, 0.045, -0.035), (0.050, 0.045, 0.135), 0.035, mat=SHOE, chain=0, k=0.01))
    arms = {}
    # left arm hangs; right arm holds mug at chest
    arms['L'] = (V(-0.205, 1.43, 0.0), V(-0.235, 1.15, 0.02), V(-0.230, 0.90, 0.0), V(-0.225, 0.80, 0.0))
    arms['R'] = (V(0.205, 1.43, 0.0), V(0.235, 1.16, 0.0), V(0.12, 1.24, -0.16), V(0.07, 1.27, -0.20))
    for side, (sh, el, wr, hd) in arms.items():
        cu, cf = (2, 3) if side == 'L' else (4, 5)
        def sl(p, a=sh, b=wr):
            ax = norm(b - a)
            t = (p - a) @ ax
            return -0.003 * np.sin(t * 90)
        P.append(cone(sh, el, 0.058, 0.048, mat=FLANNEL, chain=cu, k=0.03, disp=sl))
        P.append(cone(el, wr, 0.046, 0.034, mat=FLANNEL, chain=cf, k=0.01, disp=sl))
        P.append(cone(wr, hd, 0.028, 0.030, mat=SKIN, chain=cf, k=0.01, bias=-0.004))
        P.append(cone(wr - norm(wr - el) * 0.012, wr + norm(wr - el) * 0.004, 0.037, 0.037, mat=FLANNEL, chain=cf, k=0.003))  # cuff
    # mug in right hand
    P.append(cone((0.05, 1.24, -0.235), (0.05, 1.33, -0.235), 0.040, 0.040, mat=MUG, chain=5, k=0.004))
    v, f = build(P, 0.0050, pad=0.03)
    v = smooth(v, f, 3)
    v, f = decimate(v, f, 26000)
    v = smooth(v, f, 1)
    n = vnormals(v, f)
    mat, chain = classify(v, P)
    mat = smooth_labels(mat, f, 3)
    sk = Skel()
    sk.add('root', None, (0, 0.0, 0))
    sk.add('spine', 'root', (0, 0.95, 0))
    sk.add('head', 'spine', (0, 1.52, 0))
    for side in ('L', 'R'):
        sh, el, wr, hd = arms[side]
        sk.add('upper' + side, 'spine', sh)
        sk.add('fore' + side, 'upper' + side, el)
        sk.add('hand' + side, 'fore' + side, wr)
    nb = len(sk.names)
    W = np.zeros((len(v), nb)); bi = {nm: i for i, nm in enumerate(sk.names)}
    y = v[:, 1]
    m = chain == 0
    w = np.clip((y - 0.9) / 0.15, 0, 1)
    W[m, bi['spine']] = w[m]; W[m, bi['root']] = 1 - w[m]
    m = chain == 1
    w = np.clip((y - 1.50) / 0.06, 0, 1)
    W[m, bi['head']] = w[m]; W[m, bi['spine']] = 1 - w[m]
    for side, cu, cf in (('L', 2, 3), ('R', 4, 5)):
        sh, el, wr, hd = arms[side]
        m = (chain == cu) | (chain == cf)
        Wc = chain_weights(v[m], [sh * V(0.7, 1, 1), sh, el, wr, hd], [bi['spine'], bi['upper' + side], bi['fore' + side], bi['hand' + side]], blend=0.3)
        Wm = np.zeros((m.sum(), nb))
        for k_, b_ in enumerate([bi['spine'], bi['upper' + side], bi['fore' + side], bi['hand' + side]]):
            Wm[:, b_] += Wc[:, k_]
        W[m] = Wm
    W[W.sum(1) == 0, bi['spine']] = 1
    si, sw = pack_weights(W)
    uv = cyl_uv(v, V(0, 1.9, 0), V(0, 0, 0), V(0, 0, -1))
    add_mesh('dad', v, f, n, uv, mat, (si, sw), sk)

if __name__ == '__main__':
    make_hand()
    make_sleeve()
    make_girl()
    make_hanging_coat()
    make_dad()
    write_all()
