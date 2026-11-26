# Organic meshes (hands, girl, papa, puppy) built from signed distance fields,
# polygonised with marching cubes, decimated, and baked with per-vertex
# colour + SDF ambient occlusion.  Output: mesh/<name>.bin (see writer below).
# Usage: python3 gen_meshes.py <outdir>
import sys, os, json, struct
import numpy as np
from skimage.measure import marching_cubes
import fast_simplification
import trimesh

OUT = sys.argv[1] if len(sys.argv) > 1 else 'mesh'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(5)

# ------------------------------------------------------------------ SDF lib
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def sph(p, c, r, s=(1, 1, 1)):
    q = (p - np.asarray(c)) / np.asarray(s)
    return (np.linalg.norm(q, axis=-1) - r) * min(s)


def cap(p, a, b, ra, rb=None, s=(1, 1, 1)):
    """Tapered capsule (round cone approximation)."""
    if rb is None:
        rb = ra
    a = np.asarray(a, float); b = np.asarray(b, float)
    sc = np.asarray(s, float)
    q = (p - a) / sc
    ba = (b - a) / sc
    t = np.clip((q @ ba) / (ba @ ba), 0, 1)
    d = np.linalg.norm(q - t[..., None] * ba, axis=-1)
    return (d - (ra + (rb - ra) * t)) * sc.min()


def rbox(p, c, h, r):
    q = np.abs(p - np.asarray(c)) - np.asarray(h)
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(np.max(q, axis=-1), 0) - r


def rotx(v, a):
    c, s = np.cos(a), np.sin(a)
    x, y, z = v
    return np.array([x, y * c - z * s, y * s + z * c])


def rot_axis(v, axis, a):
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    v = np.asarray(v, float)
    return v * np.cos(a) + np.cross(axis, v) * np.sin(a) + axis * (axis @ v) * (1 - np.cos(a))


def finger_segments(base, d0, axis, lengths, angles, radii):
    segs = []
    p = np.asarray(base, float)
    acc = 0
    for L, a, (r0, r1) in zip(lengths, angles, radii):
        acc += a
        d = rot_axis(d0, axis, acc)
        q = p + d * L
        segs.append((p.copy(), q.copy(), r0, r1))
        p = q
    return segs


def vnoise3(p, freq, seed=0):
    """Cheap smooth 3D noise (sum of random plane waves)."""
    r = np.random.default_rng(seed)
    out = np.zeros(p.shape[:-1])
    for i in range(10):
        k = r.normal(size=3); k /= np.linalg.norm(k)
        out += np.sin(p @ k * freq * (0.7 + 0.6 * r.random()) * 2 * np.pi + r.random() * 6.28)
    return out / np.sqrt(10 / 2)


# ------------------------------------------------------------ mesh building
def polygonise(sdf, lo, hi, step, target=None):
    lo = np.asarray(lo, float); hi = np.asarray(hi, float)
    nx, ny, nz = (np.ceil((hi - lo) / step).astype(int) + 1)
    xs = lo[0] + np.arange(nx) * step
    ys = lo[1] + np.arange(ny) * step
    zs = lo[2] + np.arange(nz) * step
    P = np.stack(np.meshgrid(xs, ys, zs, indexing='ij'), -1)
    vals = np.empty((nx, ny, nz))
    for i in range(nx):
        vals[i] = sdf(P[i])
    v, f, _, _ = marching_cubes(vals, 0.0, spacing=(step, step, step))
    v = v + lo
    pass
    if target and len(f) > target:
        v, f = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), 1 - target / len(f))
    m = trimesh.Trimesh(v, f, process=True)
    # drop faces that drifted off the surface (decimation slivers) and tiny islands
    c = m.triangles_center
    good = np.abs(sdf(c)) < step * 1.5
    m.update_faces(good)
    m.remove_unreferenced_vertices()
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        big = max(len(p.faces) for p in parts)
        m = trimesh.util.concatenate([p for p in parts if len(p.faces) > big * 0.05])
    trimesh.smoothing.filter_taubin(m, iterations=6)
    return m


def bake_ao(m, sdf, scale):
    p = m.vertices
    n = m.vertex_normals
    ao = np.zeros(len(p))
    w = 1.0
    for h in (0.5, 1.0, 2.0, 3.5, 5.0):
        d = sdf(p + n * h * scale)
        ao += w * np.clip(h * scale - d, 0, None) / (h * scale)
        w *= 0.6
    return np.clip(1 - ao * 0.55, 0, 1)


class Pack:
    def __init__(self):
        self.parts = []

    def add(self, name, m, color, ao, extra=None, origin=(0, 0, 0)):
        v = np.asarray(m.vertices, np.float32) - np.asarray(origin, np.float32)
        nrm = np.asarray(m.vertex_normals, np.float32)
        f = np.asarray(m.faces, np.uint32)
        col = np.clip(np.asarray(color) * 255, 0, 255).astype(np.uint8)
        if extra is None:
            extra = np.zeros(len(v))
        e = np.stack([np.clip(ao, 0, 1), np.clip(extra, 0, 1)], -1)
        e = (e * 255).astype(np.uint8)
        self.parts.append(dict(name=name, v=v, n=nrm, f=f, c=col, e=e, origin=list(map(float, origin))))
        print(f'  {name}: {len(v)} verts {len(f)} tris')

    def write(self, fname):
        header = []
        blob = bytearray()
        for p in self.parts:
            lo = p['v'].min(0); hi = p['v'].max(0)
            q = np.round((p['v'] - lo) / np.maximum(hi - lo, 1e-6) * 65535).astype(np.uint16)
            nq = np.round(p['n'] * 32767).astype(np.int16)
            idx = p['f'].astype(np.uint16 if len(p['v']) < 65536 else np.uint32)
            entry = dict(name=p['name'], nv=len(p['v']), ni=int(p['f'].size), lo=lo.tolist(), hi=hi.tolist(),
                         origin=p['origin'], i32=bool(len(p['v']) >= 65536))
            for key, arr in (('pos', q), ('nrm', nq), ('col', p['c']), ('ext', p['e']), ('idx', idx)):
                while len(blob) % 4:
                    blob.append(0)
                entry[key] = len(blob)
                blob += arr.tobytes()
            header.append(entry)
        hj = json.dumps(header).encode()
        while (len(hj) + 4) % 4:
            hj += b' '
        with open(os.path.join(OUT, fname), 'wb') as fp:
            fp.write(struct.pack('<I', len(hj)))
            fp.write(hj)
            fp.write(blob)
        print('wrote', fname, os.path.getsize(os.path.join(OUT, fname)) // 1024, 'KB')


def skin_color(p, base='#e9b9a0'):
    b = np.array([int(base[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    n = vnoise3(p, 18, 3)[..., None]
    return np.clip(b * (1 + n * 0.025), 0, 1) * np.ones((len(p), 3))


# ===================================================================== hands
def hand_grip_sdf(scale=1.0):
    """Right hand of a ~5 year old in a power grip around a stick along +X
    (radius 1.2 cm) at the origin. Forearm runs down -Y."""
    rc = 0.012
    S = []  # capsules
    fingers = [  # x, mcp y, length scale, radius
        (0.0185, 0.000, 0.95, 0.0071),
        (0.0060, 0.003, 1.00, 0.0074),
        (-0.0065, 0.000, 0.94, 0.0069),
        (-0.0180, -0.007, 0.78, 0.0060),
    ]
    tips = []
    for x, y, ls, r in fingers:
        R = rc + r
        L = np.array([0.022, 0.0135, 0.0105]) * ls
        # place joints on circle radius R around X axis, start at beta=-90deg
        beta = -np.pi / 2 + 0.05
        pts = [np.array([x, R * np.sin(beta + np.pi / 2) * 0 + y, -R])]
        pts = [np.array([x, y, -R * 0.98])]
        for Li in L:
            cur = pts[-1]
            b0 = np.arctan2(cur[2], cur[1])
            rad = np.hypot(cur[1], cur[2])
            db = 2 * np.arcsin(min(Li / (2 * R), 0.99))
            b1 = b0 + db * 1.0
            pts.append(np.array([x, R * np.cos(b1), R * np.sin(b1)]))
        rads = [(r, r * 0.93), (r * 0.93, r * 0.86), (r * 0.86, r * 0.8)]
        for i in range(3):
            S.append((pts[i], pts[i + 1], rads[i][0], rads[i][1]))
        tips.append((pts[2], pts[3], r * 0.8))
    # thumb
    th = [np.array([0.020, -0.050, -0.016]), np.array([0.030, -0.026, -0.001]),
          np.array([0.026, -0.006, 0.016]), np.array([0.012, 0.004, 0.022])]
    trad = [(0.0105, 0.0088), (0.0088, 0.0080), (0.0080, 0.0070)]
    for i in range(3):
        S.append((th[i], th[i + 1], trad[i][0], trad[i][1]))
    tips.append((th[2], th[3], 0.0072))

    def sdf(p):
        d = rbox(p, (0, -0.030, -0.022), (0.019, 0.026, 0.004), 0.008)
        d = smin(d, sph(p, (0.016, -0.046, -0.013), 0.013, (1, 1.2, 0.8)), 0.01)
        d = smin(d, sph(p, (-0.017, -0.043, -0.019), 0.011, (0.9, 1.4, 0.8)), 0.008)
        # wrist + forearm (flattened)
        d = smin(d, cap(p, (0, -0.058, -0.022), (0, -0.20, -0.032), 0.019, 0.022, (1.25, 1, 0.8)), 0.012)
        for a, b, r0, r1 in S:
            d = smin(d, cap(p, a, b, r0, r1), 0.0035)
        # knuckle bumps on back of hand
        for x, y, ls, r in fingers:
            d = smin(d, sph(p, (x, y - 0.003, -0.026), 0.0068), 0.004)
        # carve the stick so palm/fingers press against it
        d = smax(d, -(np.linalg.norm(p[..., 1:], axis=-1) - rc), 0.003)
        return d
    return sdf, tips, S


def nail_mask(p, n, tips, outward_fn):
    m = np.zeros(len(p))
    for a, b, r in tips:
        ab = b - a
        t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
        q = a + t[:, None] * ab
        d = np.linalg.norm(p - q, axis=-1)
        out = outward_fn(q)
        dot = np.sum(n * out, -1)
        along = np.clip((t - 0.25) / 0.2, 0, 1) * np.clip((1.06 - t) / 0.1, 0, 1)
        mm = (d < r * 1.35) * np.clip((dot - 0.35) / 0.25, 0, 1) * along
        m = np.maximum(m, mm)
    return m


def build_hands():
    pk = Pack()
    sdf, tips, segs = hand_grip_sdf()
    m = polygonise(sdf, (-0.05, -0.20, -0.06), (0.05, 0.045, 0.045), 0.0011, target=26000)
    p = m.vertices; n = m.vertex_normals
    ao = bake_ao(m, sdf, 0.003)

    def outward(q):
        o = q.copy(); o[:, 0] = 0
        o /= np.linalg.norm(o, axis=-1, keepdims=True) + 1e-9
        return o
    nails = nail_mask(p, n, tips[:4], outward)
    # thumb nail outward = away from stick & toward +x
    a, b, r = tips[4]
    nails = np.maximum(nails, nail_mask(p, n, [tips[4]], lambda q: np.tile(np.array([0.55, 0.45, 0.7]) / 1.0, (len(q), 1))))
    col = skin_color(p)
    # redder fingertips / knuckles, paler palm
    tipd = np.min(np.stack([np.linalg.norm(p - t[1], axis=-1) for t in tips]), 0)
    col = col * (1 - np.clip(1 - tipd / 0.012, 0, 1)[:, None] * np.array([0.0, 0.10, 0.08]))
    knuck = np.min(np.stack([np.linalg.norm(p - s[0], axis=-1) for s in segs]), 0)
    col = col * (1 - np.clip(1 - knuck / 0.008, 0, 1)[:, None] * np.array([0.0, 0.06, 0.05]))
    nailc = np.array([0.94, 0.80, 0.76])
    col = col * (1 - nails[:, None]) + nailc * nails[:, None]
    pk.add('grip', m, col, ao, nails)

    # ---- flat hand (palm down, fingers forward +Z) for stamping
    S = []
    tipsF = []
    fx = [(-0.019, 0.84, 0.0068, -0.25), (-0.0065, 0.98, 0.0071, -0.08), (0.006, 1.0, 0.0073, 0.06), (0.0185, 0.95, 0.0071, 0.2)]
    for x, ls, r, spread in fx:
        base = np.array([x, 0.011, 0.030 if abs(x) < 0.015 else 0.026])
        d0 = np.array([np.sin(spread * 0.5), 0, np.cos(spread * 0.5)])
        L = np.array([0.022, 0.0135, 0.0105]) * ls
        sg = finger_segments(base, d0, (1, 0, 0), L, [0.08, 0.12, 0.1], [(r, r * .93), (r * .93, r * .86), (r * .86, r * .8)])
        S += sg
        tipsF.append((sg[2][0], sg[2][1], r * 0.8))
    tsg = finger_segments(np.array([0.020, 0.010, -0.012]), np.array([0.7, -0.05, 0.7]), (0, 1, 0), [0.022, 0.017, 0.014],
                          [0.0, -0.15, -0.15], [(0.0105, 0.009), (0.009, 0.008), (0.008, 0.007)])
    S += tsg
    tipsF.append((tsg[2][0], tsg[2][1], 0.0072))

    def sdfF(p):
        d = rbox(p, (0, 0.012, 0.0), (0.020, 0.004, 0.024), 0.007)
        d = smin(d, sph(p, (0.016, 0.009, -0.016), 0.013, (1, 0.7, 1.2)), 0.01)
        d = smin(d, cap(p, (0, 0.013, -0.025), (0, 0.02, -0.17), 0.019, 0.022, (1.25, 0.8, 1)), 0.012)
        for a, b, r0, r1 in S:
            d = smin(d, cap(p, a, b, r0, r1), 0.0035)
        return d
    mF = polygonise(sdfF, (-0.05, -0.01, -0.17), (0.06, 0.04, 0.085), 0.0011, target=22000)
    p = mF.vertices; n = mF.vertex_normals
    nails = nail_mask(p, n, tipsF, lambda q: np.tile(np.array([0, 1.0, 0]), (len(q), 1)))
    col = skin_color(p)
    tipd = np.min(np.stack([np.linalg.norm(p - t[1], axis=-1) for t in tipsF]), 0)
    col = col * (1 - np.clip(1 - tipd / 0.012, 0, 1)[:, None] * np.array([0.0, 0.10, 0.08]))
    col = col * (1 - nails[:, None]) + np.array([0.94, 0.80, 0.76]) * nails[:, None]
    pk.add('flat', mF, col, bake_ao(mF, sdfF, 0.003), nails)
    pk.write('hands.bin')


# ====================================================================== girl
def relaxed_hand(S, wrist, down, side, s=1.0, curl=0.5):
    """Append capsules of a small relaxed hand hanging along 'down'."""
    down = np.asarray(down, float); down /= np.linalg.norm(down)
    side = np.asarray(side, float); side /= np.linalg.norm(side)
    fwd = np.cross(side, down)
    palm_c = wrist + down * 0.03 * s
    S.append(('box', palm_c, s))
    for i, off in enumerate([-0.0165, -0.0055, 0.0055, 0.0165]):
        base = wrist + down * 0.056 * s + side * off * s
        L = np.array([0.021, 0.013, 0.010]) * s * (0.8 if i == 0 else 1.0)
        r = 0.0068 * s
        S.append(('seg', finger_segments(base, down, side, L, [curl * 0.4, curl * 0.6, curl * 0.4], [(r, r * .9), (r * .9, r * .85), (r * .85, r * .8)])))
    tb = wrist + down * 0.022 * s + side * 0.022 * s + fwd * 0.008 * s
    S.append(('seg', finger_segments(tb, down * 0.6 + side * 0.4 + fwd * 0.3, fwd, [0.02 * s, 0.016 * s], [0.0, 0.3], [(0.009 * s, 0.008 * s), (0.008 * s, 0.007 * s)])))


def hand_sdf_from(S, p, k=0.003):
    d = np.full(p.shape[:-1], 9.0)
    for item in S:
        if item[0] == 'box':
            _, c, s = item
            d = smin(d, sph(p, c, 0.024 * s, (1.0, 1.25, 0.45)), k * 2)
        else:
            for a, b, r0, r1 in item[1]:
                d = smin(d, cap(p, a, b, r0, r1), k)
    return d


def build_girl():
    pk = Pack()
    # --- coat + body (trench coat, A-line) ; girl height 1.10 m, faces +Z
    def coat(p):
        y = p[..., 1]
        ang = np.arctan2(p[..., 0], p[..., 2])
        d = cap(p, (0, 0.62, 0), (0, 0.84, 0), 0.105, 0.098, (1, 1, 0.72))
        skirt = cap(p, (0, 0.66, 0), (0, 0.47, 0), 0.11, 0.165, (1, 1, 0.78))
        d = smin(d, skirt, 0.05)
        # shoulders
        d = smin(d, cap(p, (-0.1, 0.835, 0), (0.1, 0.835, 0), 0.05, 0.05, (1, 1, 0.9)), 0.04)
        # cut hem flat
        d = smax(d, 0.468 - y, 0.01)
        # pleats/folds on skirt
        fold = np.sin(ang * 9 + vnoise3(p, 3, 1) * 0.8) * np.clip((0.64 - y) / 0.12, 0, 1)
        d = d - fold * 0.004 - vnoise3(p, 9, 2) * 0.0012
        # belt
        d = smin(d, cap(p, (0, 0.655, 0), (0, 0.67, 0), 0.112, 0.112, (1, 1, 0.75)) - 0.004, 0.006)
        # collar
        d = smin(d, cap(p, (0, 0.865, -0.01), (0, 0.885, -0.01), 0.055, 0.06, (1, 1, 0.85)), 0.02)
        return d
    m = polygonise(coat, (-0.22, 0.44, -0.18), (0.22, 0.92, 0.18), 0.0045, target=16000)
    p = m.vertices
    beige = np.array([0.66, 0.56, 0.42])
    col = beige * (1 + vnoise3(p, 6, 4)[:, None] * 0.03)
    belt = (np.abs(p[:, 1] - 0.662) < 0.014)
    col[belt] *= 0.86
    pk.add('coat', m, col, bake_ao(m, coat, 0.01), belt.astype(float) * 0.5)

    # --- legs (tights) + shoes
    def legs(p):
        d = 9
        for sx in (-1, 1):
            d = np.minimum(d, cap(p, (sx * 0.055, 0.54, 0), (sx * 0.05, 0.30, 0.005), 0.052, 0.040))
            d = smin(d, cap(p, (sx * 0.05, 0.30, 0.005), (sx * 0.048, 0.07, -0.004), 0.040, 0.029), 0.01)
        return d
    m = polygonise(legs, (-0.12, 0.05, -0.08), (0.12, 0.56, 0.08), 0.004, target=6000)
    p = m.vertices
    pk.add('legs', m, np.array([0.20, 0.20, 0.22]) * np.ones((len(p), 1)), bake_ao(m, legs, 0.01))

    def shoes(p):
        d = 9
        for sx in (-1, 1):
            s = rbox(p, (sx * 0.05, 0.03, 0.03), (0.026, 0.012, 0.058), 0.018)
            s = smin(s, sph(p, (sx * 0.05, 0.055, -0.005), 0.032), 0.02)
            d = np.minimum(d, s)
        d = smax(d, -p[..., 1], 0.004)
        return d
    m = polygonise(shoes, (-0.11, -0.01, -0.06), (0.11, 0.1, 0.12), 0.003, target=5000)
    p = m.vertices
    col = np.where((p[:, 1] < 0.012)[:, None], np.array([0.12, 0.11, 0.1]), np.array([0.36, 0.17, 0.12]))
    pk.add('shoes', m, col, bake_ao(m, shoes, 0.006), (p[:, 1] >= 0.012).astype(float))

    # --- head (neck, skull, face hints, ears)
    def head(p):
        d = cap(p, (0, 0.86, -0.005), (0, 0.93, 0.0), 0.034)
        d = smin(d, sph(p, (0, 0.995, 0.0), 0.088, (0.92, 1.0, 1.0)), 0.03)
        d = smin(d, sph(p, (0, 0.955, 0.04), 0.062, (1, 0.9, 1)), 0.03)  # cheeks/jaw
        d = smin(d, sph(p, (0, 0.975, 0.093), 0.012, (0.9, 1.0, 1.0)), 0.012)  # nose
        for sx in (-1, 1):
            d = smin(d, sph(p, (sx * 0.083, 0.985, -0.005), 0.016, (0.45, 1.0, 0.8)), 0.01)
        return d
    m = polygonise(head, (-0.12, 0.84, -0.11), (0.12, 1.1, 0.12), 0.0035, target=9000)
    p = m.vertices
    col = skin_color(p, '#ebbea4')
    cheek = np.exp(-((np.abs(p[:, 0]) - 0.045) ** 2 + (p[:, 1] - 0.96) ** 2 + (p[:, 2] - 0.07) ** 2) / 0.0006)
    col = col * (1 - cheek[:, None] * np.array([0, 0.12, 0.1]))
    pk.add('head', m, col, bake_ao(m, head, 0.008))

    # --- hair (bob, strands as grooves), sits under the hat
    def hair(p):
        y = p[..., 1]
        shell = sph(p, (0, 0.998, -0.006), 0.097, (0.95, 1.0, 1.02))
        inner = sph(p, (0, 0.995, 0.0), 0.086, (0.92, 1.0, 1.0))
        d = smax(shell, -inner + 0.0, 0.004)
        # long part down to jaw at back and sides
        back = cap(p, (0, 1.0, -0.02), (0, 0.905, -0.03), 0.094, 0.090, (1.0, 1, 0.95))
        d = smin(d, smax(back, -sph(p, (0, 0.97, 0.03), 0.09, (0.86, 1.1, 1.0)), 0.01), 0.01)
        # open the face
        face = sph(p, (0, 0.95, 0.10), 0.085, (0.75, 1.1, 1.0))
        d = smax(d, -face, 0.01)
        d = smax(d, 0.895 - y, 0.008)
        ang = np.arctan2(p[..., 0], p[..., 2])
        groove = np.abs(np.sin(ang * 46 + vnoise3(p, 14, 7) * 1.4))
        d = d + groove * 0.0024 + vnoise3(p, 30, 8) * 0.0006
        return d
    m = polygonise(hair, (-0.13, 0.88, -0.14), (0.13, 1.11, 0.13), 0.0028, target=14000)
    p = m.vertices
    col = np.array([0.20, 0.12, 0.075]) * (1 + vnoise3(p, 40, 9)[:, None] * 0.12)
    pk.add('hair', m, col, bake_ao(m, hair, 0.006))

    # --- arms: local frame, shoulder at origin, arm hangs -Y, slight forward bend
    for side, sx in (('armR', 1), ('armL', -1)):
        el = np.array([sx * 0.025, -0.15, 0.02])
        wr = np.array([sx * 0.03, -0.29, 0.05])
        HS = []
        relaxed_hand(HS, wr + np.array([0, -0.012, 0.004]), wr - el + np.array([0, 0, 0.01]), (sx, 0, 0), s=0.95, curl=0.6)

        def arm(p, el=el, wr=wr, HS=HS):
            d = cap(p, (0, 0, 0), el, 0.042, 0.037)
            d = smin(d, cap(p, el, wr, 0.037, 0.033), 0.015)
            # cuff
            d = smin(d, cap(p, wr * 0.92 + el * 0.08, wr, 0.036, 0.036) - 0.002, 0.004)
            # sleeve folds at elbow
            ang = np.arctan2(p[..., 2], p[..., 0])
            d = d - np.sin(p[..., 1] * 140 + ang * 2) * 0.0016 * np.exp(-((p[..., 1] + 0.15) / 0.05) ** 2)
            sk = hand_sdf_from(HS, p)
            sk = smin(sk, cap(p, wr, wr + (wr - el) * 0.15, 0.022, 0.021), 0.006)
            return np.minimum(d, sk), d, sk
        f = lambda p: arm(p)[0]
        m = polygonise(f, (-0.09, -0.40, -0.06), (0.09, 0.05, 0.12), 0.0028, target=10000)
        p = m.vertices
        _, dc, dk = arm(p)
        isskin = (dk < dc).astype(float)
        col = beige * (1 - isskin[:, None]) + np.array([0.91, 0.72, 0.62]) * isskin[:, None]
        pk.add(side, m, col, bake_ao(m, f, 0.006), isskin)
    pk.write('girl.bin')


# ====================================================================== papa
def build_papa():
    pk = Pack()
    knitc = np.array([0.36, 0.40, 0.45])

    def torso(p):
        y = p[..., 1]
        d = cap(p, (0, 0.95, 0), (0, 1.36, 0), 0.165, 0.17, (1, 1, 0.68))
        d = smin(d, cap(p, (-0.17, 1.40, 0), (0.17, 1.40, 0), 0.07, 0.07, (1, 1, 0.9)), 0.07)
        d = smin(d, sph(p, (0, 1.08, 0.03), 0.16, (1, 0.9, 0.8)), 0.06)  # belly
        d = smin(d, cap(p, (0, 1.42, 0), (0, 1.46, 0), 0.07, 0.065) - 0.006, 0.02)  # collar ribbing
        d = smax(d, 0.9 - y, 0.01)
        # knit wrinkles
        d = d - np.sin(y * 70 + vnoise3(p, 4, 11) * 2) * 0.002 * np.clip((1.12 - y) / 0.15, 0, 1) - vnoise3(p, 12, 12) * 0.002
        return d
    m = polygonise(torso, (-0.3, 0.86, -0.2), (0.3, 1.5, 0.22), 0.008, target=9000)
    p = m.vertices
    pk.add('torso', m, knitc * (1 + vnoise3(p, 5, 13)[:, None] * 0.03), bake_ao(m, torso, 0.02))

    def legs(p):
        d = rbox(p, (0, 0.94, 0), (0.14, 0.03, 0.08), 0.04)
        for sx in (-1, 1):
            d = smin(d, cap(p, (sx * 0.09, 0.93, 0), (sx * 0.095, 0.5, 0.01), 0.085, 0.064), 0.04)
            d = smin(d, cap(p, (sx * 0.095, 0.5, 0.01), (sx * 0.1, 0.1, -0.01), 0.064, 0.05), 0.02)
        ang = np.arctan2(p[..., 2], p[..., 0])
        y = p[..., 1]
        d = d - (np.sin(y * 60 + ang) * 0.003) * (np.exp(-((y - 0.5) / 0.06) ** 2) + np.exp(-((y - 0.15) / 0.06) ** 2)) - vnoise3(p, 14, 15) * 0.0015
        return d
    m = polygonise(legs, (-0.22, 0.06, -0.12), (0.22, 1.0, 0.13), 0.008, target=8000)
    p = m.vertices
    pk.add('legs', m, np.array([0.24, 0.31, 0.43]) * (1 + vnoise3(p, 7, 16)[:, None] * 0.06), bake_ao(m, legs, 0.02))

    def socks(p):
        d = 9
        for sx in (-1, 1):
            s = rbox(p, (sx * 0.1, 0.035, 0.06), (0.038, 0.015, 0.1), 0.025)
            s = smin(s, cap(p, (sx * 0.1, 0.03, -0.02), (sx * 0.1, 0.14, -0.01), 0.05), 0.04)
            d = np.minimum(d, s)
        return smax(d, -p[..., 1], 0.005)
    m = polygonise(socks, (-0.18, -0.01, -0.1), (0.18, 0.16, 0.2), 0.006, target=4000)
    pk.add('socks', m, np.array([0.55, 0.55, 0.53]) * np.ones((len(m.vertices), 1)), bake_ao(m, socks, 0.015))

    def head(p):
        d = cap(p, (0, 1.40, 0), (0, 1.56, 0.01), 0.058)
        d = smin(d, sph(p, (0, 1.64, 0.0), 0.10, (0.85, 1.12, 1.0)), 0.03)
        d = smin(d, sph(p, (0, 1.575, 0.045), 0.07, (0.95, 0.9, 1)), 0.03)  # jaw
        d = smin(d, cap(p, (0, 1.635, 0.1), (0, 1.60, 0.115), 0.014, 0.017), 0.012)  # nose
        for sx in (-1, 1):
            d = smin(d, sph(p, (sx * 0.087, 1.63, -0.005), 0.026, (0.4, 1, 0.7)), 0.01)
            d = smax(d, -sph(p, (sx * 0.034, 1.655, 0.096), 0.012), 0.008)  # eye sockets
        return d
    m = polygonise(head, (-0.14, 1.38, -0.13), (0.14, 1.8, 0.16), 0.004, target=9000)
    p = m.vertices
    pk.add('head', m, skin_color(p, '#d9a58a'), bake_ao(m, head, 0.01))

    def hair(p):
        sh = sph(p, (0, 1.655, -0.008), 0.108, (0.88, 1.12, 1.03))
        d = smax(sh, 1.62 - p[..., 1] + np.clip(p[..., 2], 0, None) * -0.3, 0.01)
        d = smax(d, -(sph(p, (0, 1.6, 0.12), 0.1)), 0.02)
        d = d + np.abs(np.sin(np.arctan2(p[..., 0], p[..., 2]) * 30 + vnoise3(p, 20, 17))) * 0.002 + vnoise3(p, 40, 18) * 0.001
        return d
    m = polygonise(hair, (-0.14, 1.55, -0.14), (0.14, 1.8, 0.14), 0.0035, target=7000)
    pk.add('hair', m, np.array([0.13, 0.10, 0.08]) * np.ones((len(m.vertices), 1)), bake_ao(m, hair, 0.008))

    for side, sx in (('armR', 1), ('armL', -1)):
        el = np.array([sx * 0.03, -0.30, 0.02])
        wr = np.array([sx * 0.035, -0.56, 0.06])
        HS = []
        relaxed_hand(HS, wr + np.array([0, -0.02, 0.005]), wr - el, (sx, 0, 0), s=1.75, curl=0.5)

        def arm(p, el=el, wr=wr, HS=HS):
            d = cap(p, (0, 0, 0), el, 0.065, 0.052)
            d = smin(d, cap(p, el, wr, 0.052, 0.042), 0.02)
            d = smin(d, cap(p, wr * 0.9 + el * 0.1, wr, 0.044, 0.044) - 0.003, 0.004)
            y = p[..., 1]
            d = d - np.sin(y * 90) * 0.0025 * np.exp(-((y + 0.3) / 0.07) ** 2) - vnoise3(p, 14, 19) * 0.0012
            sk = hand_sdf_from(HS, p, 0.005)
            sk = smin(sk, cap(p, wr, wr + (wr - el) * 0.15, 0.033, 0.031), 0.01)
            return np.minimum(d, sk), d, sk
        f = lambda p: arm(p)[0]
        m = polygonise(f, (-0.12, -0.8, -0.1), (0.12, 0.08, 0.2), 0.0045, target=8000)
        p = m.vertices
        _, dc, dk = arm(p)
        isskin = (dk < dc).astype(float)
        col = knitc * (1 - isskin[:, None]) + np.array([0.85, 0.64, 0.54]) * isskin[:, None]
        pk.add(side, m, col, bake_ao(m, f, 0.012), isskin)
    pk.write('papa.bin')


# ===================================================================== puppy
def build_dog():
    pk = Pack()
    gold = np.array([0.80, 0.62, 0.40])
    cream = np.array([0.93, 0.85, 0.72])

    def fur_col(p, belly_axis):
        n = vnoise3(p, 25, 21)[:, None]
        t = np.clip(belly_axis, 0, 1)[:, None]
        return (gold * (1 - t) + cream * t) * (1 + n * 0.02)

    def body(p):
        d = sph(p, (0, 0.17, 0.045), 0.078, (1, 1.1, 1))  # chest
        d = smin(d, sph(p, (0, 0.11, -0.05), 0.085, (1.0, 0.95, 1.2)), 0.05)  # belly
        for sx in (-1, 1):
            d = smin(d, sph(p, (sx * 0.058, 0.075, -0.07), 0.06, (0.8, 1.0, 1.15)), 0.03)  # haunch
            d = smin(d, cap(p, (sx * 0.038, 0.15, 0.075), (sx * 0.04, 0.025, 0.09), 0.022, 0.018), 0.025)  # front leg
            d = smin(d, sph(p, (sx * 0.04, 0.016, 0.105), 0.023, (1, 0.7, 1.35)), 0.012)  # front paw
            d = smin(d, sph(p, (sx * 0.072, 0.016, 0.0), 0.024, (1, 0.7, 1.5)), 0.015)  # hind paw
            # toe splits
            for tx in (-1, 0, 1):
                d = smax(d, -sph(p, (sx * 0.04 + tx * 0.009 + 0.0045, 0.012, 0.137), 0.003, (0.3, 1.5, 1.6)), 0.002)
        d = smin(d, cap(p, (0, 0.2, 0.06), (0, 0.27, 0.085), 0.05, 0.042), 0.03)  # neck
        d = smax(d, -p[..., 1], 0.004)
        return d - vnoise3(p, 30, 22) * 0.0004
    m = polygonise(body, (-0.14, -0.01, -0.17), (0.14, 0.32, 0.17), 0.003, target=12000)
    p = m.vertices
    bel = 1 - (p[:, 2] - p[:, 1] * 0.2 + 0.0) / 0.06
    bel = np.clip((p[:, 2] - 0.06) / 0.04, 0, 1) * np.clip(1 - np.abs(p[:, 0]) / 0.05, 0, 1)
    paws = np.clip((0.04 - p[:, 1]) / 0.02, 0, 1)
    col = fur_col(p, np.maximum(bel, paws))
    pk.add('body', m, col, bake_ao(m, body, 0.006))

    # head: origin at neck joint
    O = np.array([0, 0.27, 0.085])

    def head(p):
        q = p - O
        d = sph(q, (0, 0.055, 0.0), 0.058, (1.0, 0.95, 1.05))
        d = smin(d, cap(q, (0, 0.04, 0.03), (0, 0.028, 0.098), 0.032, 0.022, (1.1, 1, 1)), 0.025)  # muzzle
        for sx in (-1, 1):
            d = smin(d, sph(q, (sx * 0.027, 0.02, 0.06), 0.022), 0.02)  # cheeks
            d = smax(d, -sph(q, (sx * 0.026, 0.066, 0.052), 0.0125), 0.006)  # eye sockets
        d = smax(d, -cap(q, (-0.02, 0.008, 0.095), (0.02, 0.008, 0.095), 0.003), 0.003)  # mouth line
        d = smin(d, sph(q, (0, 0.0, 0.07), 0.018, (1.0, 0.6, 1.2)), 0.012)  # chin
        return d - vnoise3(q, 35, 23) * 0.001
    m = polygonise(head, O + (-0.08, -0.03, -0.07), O + (0.08, 0.13, 0.13), 0.0022, target=10000)
    q = m.vertices - O
    muz = np.clip((q[:, 2] - 0.05) / 0.03, 0, 1) * np.clip((0.05 - q[:, 1]) / 0.03, 0, 1)
    blaze = np.exp(-(q[:, 0] / 0.008) ** 2) * np.clip((q[:, 2] - 0.02) / 0.03, 0, 1)
    col = fur_col(q, np.maximum(muz, blaze * 0.8))
    pk.add('head', m, col, bake_ao(m, head, 0.005), muz, origin=O)

    # ears (origin at attachment, hanging -Y)
    for side, sx in (('earR', 1), ('earL', -1)):
        def ear(p, sx=sx):
            d = cap(p, (0, 0, 0), (sx * 0.006, -0.058, 0.004), 0.021, 0.027, (0.4, 1, 1.0))
            return d - vnoise3(p, 30, 24) * 0.0008
        m = polygonise(ear, (-0.05, -0.09, -0.02), (0.05, 0.03, 0.03), 0.0016, target=3000)
        col = gold * 0.92 * (1 + vnoise3(m.vertices, 25, 25)[:, None] * 0.03)
        pk.add(side, m, col, bake_ao(m, ear, 0.003))

    # tail (origin at root, extends -Z and up)
    def tail(p):
        pts = [np.array([0, 0, 0]), np.array([0, 0.03, -0.05]), np.array([0, 0.08, -0.08]), np.array([0, 0.13, -0.085])]
        d = 9
        r = [0.016, 0.013, 0.010, 0.006]
        for i in range(3):
            d = smin(d, cap(p, pts[i], pts[i + 1], r[i], r[i + 1]), 0.01)
        return d
    m = polygonise(tail, (-0.03, -0.03, -0.12), (0.03, 0.15, 0.03), 0.002, target=2500)
    pk.add('tail', m, gold * np.ones((len(m.vertices), 1)), bake_ao(m, tail, 0.004))
    pk.write('dog.bin')


if __name__ == '__main__':
    which = sys.argv[2:] or ['hands', 'girl', 'papa', 'dog']
    for w in which:
        print('==', w)
        globals()['build_' + w]()
