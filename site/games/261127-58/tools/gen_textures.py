#!/usr/bin/env python3
"""Procedural photo-like PBR textures for "あついガラス、つめたいガラス".

Every set is tileable and written as
  <name>_c.jpg  base colour (sRGB)
  <name>_n.jpg  tangent-space normal (OpenGL, +Y up)
  <name>_m.jpg  R = ambient occlusion, G = roughness, B = height
plus 128px "_s" previews so the first frame appears fast.
Run:  python3 tools/gen_textures.py   (from games/261127-58)
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tex')
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(58)

# ----------------------------------------------------------------- noise
def vnoise(n, cells, seed=None):
    """tileable value noise, n x n output, cells x cells lattice (int)."""
    r = np.random.default_rng(seed if seed is not None else RNG.integers(1 << 30))
    g = r.random((cells, cells))
    t = np.arange(n) * cells / n
    i0 = np.floor(t).astype(int); f = t - i0
    f = f * f * f * (f * (f * 6 - 15) + 10)
    i1 = (i0 + 1) % cells; i0 %= cells
    a = g[np.ix_(i0, i0)]; b = g[np.ix_(i0, i1)]
    c = g[np.ix_(i1, i0)]; d = g[np.ix_(i1, i1)]
    fy = f[:, None]; fx = f[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def vnoise2(n, cy, cx, seed=None):
    """anisotropic tileable value noise: cy rows-cells, cx col-cells."""
    r = np.random.default_rng(seed if seed is not None else RNG.integers(1 << 30))
    g = r.random((cy, cx))
    def axis(c):
        t = np.arange(n) * c / n
        i0 = np.floor(t).astype(int); f = t - i0
        f = f * f * f * (f * (f * 6 - 15) + 10)
        return i0 % c, (i0 + 1) % c, f
    y0, y1, fy = axis(cy); x0, x1, fx = axis(cx)
    a = g[np.ix_(y0, x0)]; b = g[np.ix_(y0, x1)]; c = g[np.ix_(y1, x0)]; d = g[np.ix_(y1, x1)]
    fy = fy[:, None]; fx = fx[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def streaks(n, cy, cx, octaves=4):
    acc = 0; amp = 1; tot = 0
    for o in range(octaves):
        acc = acc + amp * vnoise2(n, min(cy, n), min(cx, n)); tot += amp; amp *= 0.55; cy *= 2; cx *= 2
    return acc / tot

def fbm(n, base=4, octaves=6, gain=0.5, seed=None):
    r = np.random.default_rng(seed if seed is not None else RNG.integers(1 << 30))
    acc = np.zeros((n, n)); amp = 1.0; tot = 0
    c = base
    for o in range(octaves):
        if c > n: break
        acc += amp * vnoise(n, c, r.integers(1 << 30)); tot += amp
        amp *= gain; c *= 2
    return acc / tot

def ridged(n, base=4, octaves=5, seed=None):
    r = np.random.default_rng(seed if seed is not None else RNG.integers(1 << 30))
    acc = np.zeros((n, n)); amp = 1.0; tot = 0; c = base
    for o in range(octaves):
        if c > n: break
        v = 1 - np.abs(vnoise(n, c, r.integers(1 << 30)) * 2 - 1)
        acc += amp * v * v; tot += amp; amp *= 0.5; c *= 2
    return acc / tot

def worley(n, cells, seed=None):
    """tileable cellular noise -> (F1, F2, cell id)."""
    r = np.random.default_rng(seed if seed is not None else RNG.integers(1 << 30))
    pts = (np.arange(cells)[:, None, None] * 0 + 0.0)
    fp = r.random((cells, cells, 2))
    ids = r.random((cells, cells))
    y, x = np.mgrid[0:n, 0:n] / n * cells
    cy = np.floor(y).astype(int); cx = np.floor(x).astype(int)
    f1 = np.full((n, n), 9.0); f2 = np.full((n, n), 9.0); idm = np.zeros((n, n))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ny = cy + dy; nx = cx + dx
            p = fp[ny % cells, nx % cells]
            py = ny + p[..., 0]; px = nx + p[..., 1]
            d = np.sqrt((py - y) ** 2 + (px - x) ** 2)
            cid = ids[ny % cells, nx % cells]
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            idm = np.where(closer, cid, idm)
            f1 = np.where(closer, d, f1)
    return f1, f2, idm

def blur(a, r):
    if r <= 0: return a
    im = Image.fromarray(np.clip(a * 65535, 0, 65535).astype(np.uint16).astype(np.int32), mode='I')
    # PIL blur on mode I is unsupported; do a separable box-blur with wrap instead
    out = a.copy()
    for _ in range(3):
        k = int(max(1, r))
        acc = np.zeros_like(out)
        for s in range(-k, k + 1): acc += np.roll(out, s, 0)
        out = acc / (2 * k + 1)
        acc = np.zeros_like(out)
        for s in range(-k, k + 1): acc += np.roll(out, s, 1)
        out = acc / (2 * k + 1)
    return out

def norm01(a):
    lo, hi = np.percentile(a, 0.5), np.percentile(a, 99.5)
    return np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx = -dx * strength; ny = dy * strength; nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5

def cavity_ao(h, radius, amount):
    return np.clip(1 - np.maximum(blur(h, radius) - h, 0) * amount, 0, 1)

def save(name, col, h, rough, ao=None, nstrength=4.0, size=None, q=86):
    n = col.shape[0]
    if ao is None: ao = cavity_ao(h, max(2, n // 128), 6.0)
    nm = normal_from_height(h, nstrength * n / 512)
    def wr(arr, suffix, quality=q):
        im = Image.fromarray(np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8))
        im.save(os.path.join(OUT, f'{name}_{suffix}.jpg'), quality=quality, optimize=True)
        im.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, f'{name}_{suffix}_s.jpg'), quality=80)
    wr(np.clip(col, 0, 1), 'c')
    wr(nm, 'n', q + 4)
    rough = np.broadcast_to(np.asarray(rough, dtype=float), h.shape)
    wr(np.stack([ao, np.clip(rough, 0.02, 1), np.clip(h, 0, 1)], -1), "m")
    print('wrote', name, n)

def lerp(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) == 2 else t
    return a + (b - a) * t

def C(*rgb):  # sRGB 0-255 -> array
    return np.array(rgb, dtype=float) / 255.0

# ------------------------------------------------------------ materials
def concrete(n=1024):
    big = fbm(n, 3, 5); mid = fbm(n, 12, 5); fine = fbm(n, 64, 4)
    f1, f2, cid = worley(n, 90)
    agg = np.clip(1 - f1 * 2.2, 0, 1) ** 2 * (cid > 0.55)
    pits = (vnoise(n, 256) > 0.965) * (vnoise(n, 128) > 0.55)
    pits = blur(pits.astype(float), 1)
    crack_f1, crack_f2, _ = worley(n, 5)
    crack = np.clip(1 - (crack_f2 - crack_f1) * 140, 0, 1) * np.clip((fbm(n, 6, 3) - 0.62) * 5, 0, 1) * (0.4 + 0.6 * fbm(n, 64, 3))
    h = 0.5 + 0.12 * mid + 0.18 * fine + 0.04 * agg - 0.5 * pits - 0.35 * crack
    h = norm01(h)
    base = C(132, 130, 124)
    col = np.ones((n, n, 3)) * base
    col *= (0.78 + 0.32 * big)[..., None]
    col *= (0.92 + 0.12 * mid)[..., None]
    stains = np.clip((fbm(n, 5, 5) - 0.55) * 4, 0, 1)
    col = lerp(col, col * C(150, 132, 110) * 1.4, stains * 0.5)
    oil = np.clip((fbm(n, 4, 6) - 0.62) * 5, 0, 1)
    col = lerp(col, col * 0.55, oil * 0.6)
    col = lerp(col, C(150, 147, 140), agg * 0.12)
    col *= (1 - 0.45 * pits - 0.5 * crack)[..., None]
    rough = 0.78 + 0.14 * fine - 0.25 * oil + 0.1 * pits
    save('concrete', col, h, rough, ao=cavity_ao(h, 3, 2.0), nstrength=3.0)

def bricks(name, n, cols, rows, bw_mortar, base_cols, mortar_col, soot=0.0, chip=0.35):
    y, x = np.mgrid[0:n, 0:n] / n
    row = np.floor(y * rows).astype(int)
    xs = x * cols + (row % 2) * 0.5
    bx = np.floor(xs).astype(int) % cols
    fx = xs - np.floor(xs); fy = y * rows - row
    mw = bw_mortar
    ex = np.minimum(fx, 1 - fx) / (1.0 / cols) * (1.0 / cols)  # in tile units
    edge_x = np.minimum(fx, 1 - fx) * (1.0 / cols)
    edge_y = np.minimum(fy, 1 - fy) * (1.0 / rows)
    edge = np.minimum(edge_x, edge_y)
    wob = (fbm(n, 24, 4) - 0.5) * mw * 0.9
    m = np.clip((edge + wob - mw * 0.5) / (mw * 0.35), 0, 1)  # 0 mortar -> 1 brick
    rid = (row * 131 + bx * 71) % 997
    r = np.random.default_rng(7)
    rnd = r.random(1000)
    tone = rnd[rid]; tone2 = r.random(1000)[rid]
    fine = fbm(n, 96, 4); mid = fbm(n, 16, 4)
    pores = (vnoise(n, 320) > 0.86).astype(float)
    chips = np.clip((fbm(n, 20, 4) - (1 - chip * 0.5)) * 8, 0, 1) * np.clip(1 - edge / (mw * 3), 0, 1)
    c0 = np.array(base_cols[0]) / 255; c1 = np.array(base_cols[1]) / 255; c2 = np.array(base_cols[2]) / 255
    bc = lerp(lerp(np.ones((n, n, 3)) * c0, np.ones((n, n, 3)) * c1, tone), np.ones((n, n, 3)) * c2, (tone2 > 0.8) * 0.7)
    bc *= (0.85 + 0.25 * mid)[..., None] * (0.9 + 0.15 * fine)[..., None]
    bc *= (1 - 0.25 * pores)[..., None]
    mc = np.ones((n, n, 3)) * np.array(mortar_col) / 255 * (0.85 + 0.25 * fbm(n, 64, 4))[..., None]
    col = lerp(mc, bc, m)
    col *= (1 - 0.3 * chips)[..., None]
    if soot > 0:
        s = np.clip((fbm(n, 3, 6) - 0.35) * 2.0, 0, 1) * soot
        col = lerp(col, col * 0.25, s)
    h = 0.35 * m + 0.04 * fine * m + 0.05 * mid - 0.12 * pores * m - 0.25 * chips + 0.06 * fbm(n, 128, 3) * (1 - m)
    h = norm01(h)
    rough = 0.82 + 0.1 * fine - 0.05 * m
    ao = cavity_ao(h, n // 160, 5) * (0.55 + 0.45 * m)
    save(name, col, h, rough, ao=ao, nstrength=5.0)

def wood(name, n, c_light, c_dark, rings=14, worn=0.4, plank=0):
    y, x = np.mgrid[0:n, 0:n] / n
    warp = (streaks(n, 2, 6, 4) - 0.5) * 0.18 + (fbm(n, 2, 3) - 0.5) * 0.08
    t = (x + warp) * rings
    ring = t - np.floor(t)
    late = np.clip((ring - 0.62) / 0.25, 0, 1) ** 1.5
    pores_line = vnoise(n, 512) * vnoise(n, 256)
    fiber = norm01(streaks(n, 4, 160, 3))
    streak = streaks(n, 2, 40, 3)
    pores_line = streaks(n, 16, 400, 2)
    knots = np.zeros((n, n))
    col = lerp(np.ones((n, n, 3)) * np.array(c_light) / 255, np.ones((n, n, 3)) * np.array(c_dark) / 255, late * 0.42 + streak * 0.3)
    col *= (0.88 + 0.18 * fiber)[..., None]
    grime = np.clip((fbm(n, 4, 5) - 0.45) * 2.5, 0, 1) * worn
    col = lerp(col, col * 0.55, grime)
    if plank:
        seam = np.minimum((x * plank) % 1, 1 - (x * plank) % 1) / plank
        g = np.clip(seam * n / 3, 0, 1)
        col *= (0.55 + 0.45 * g)[..., None]
    else:
        g = 1
    h = 0.5 - 0.18 * late + 0.12 * fiber - 0.08 * (pores_line > 0.6)
    h = norm01(h * g)
    rough = 0.62 + 0.18 * late + 0.12 * grime - 0.1 * fiber
    save(name, col, h, rough, nstrength=2.2)

def metal(name, n, base, rust=0.0, scratches=1.0, heat=0.0, dark=False):
    y, x = np.mgrid[0:n, 0:n] / n
    brush = streaks(n, 256, 4, 2)
    sc = np.zeros((n, n))
    r = np.random.default_rng(3 + len(name))
    for i in range(int(260 * scratches)):
        x0, y0 = r.random(2) * n; ang = r.random() * np.pi
        if r.random() < 0.5: ang = r.normal(0, 0.15)
        L = r.random() * n * 0.25 + 10
        ts = np.linspace(0, 1, int(L))
        xs = (x0 + np.cos(ang) * L * ts + r.normal(0, 1) * ts * ts * 8).astype(int) % n
        ys = (y0 + np.sin(ang) * L * ts).astype(int) % n
        sc[ys, xs] = np.maximum(sc[ys, xs], r.random() * 0.8 + 0.2)
    sc = blur(sc, 0) if False else sc
    sc = np.maximum(sc, np.roll(sc, 1, 1) * 0.5)
    smudge = fbm(n, 6, 5)
    col = np.ones((n, n, 3)) * np.array(base) / 255
    col *= (0.86 + 0.14 * brush)[..., None] * (0.9 + 0.15 * smudge)[..., None]
    col = lerp(col, col * 1.18, sc * 0.6)
    rough = 0.32 + 0.18 * smudge + 0.08 * brush - 0.12 * sc
    h = norm01(0.5 + 0.08 * brush - 0.4 * sc + 0.05 * smudge)
    if heat > 0:  # temper colours (straw->purple->blue) near one edge
        tt = np.clip((fbm(n, 3, 4) * 0.6 + y * 0.7) - 0.3, 0, 1) * heat
        tint = lerp(np.ones((n, n, 3)) * C(185, 160, 110), np.ones((n, n, 3)) * C(90, 80, 130), tt)
        col = lerp(col, col * tint * 1.4, np.clip(tt * 1.4, 0, 1)[..., None] * 0.6 if False else np.clip(tt * 1.4, 0, 1) * 0.6)
    if rust > 0:
        rm = np.clip((fbm(n, 8, 6) - (1 - rust * 0.6)) * 6, 0, 1)
        rc = lerp(np.ones((n, n, 3)) * C(105, 58, 30), np.ones((n, n, 3)) * C(150, 90, 50), fbm(n, 64, 3))
        col = lerp(col, rc, rm)
        rough = rough * (1 - rm) + 0.85 * rm
        h = norm01(h + 0.2 * rm * fbm(n, 96, 3))
    save(name, col, h, rough, nstrength=1.6)

def suede(n=512):
    fib = fbm(n, 64, 4) * 0.5 + vnoise(n, 256) * 0.3 + vnoise(n, 512) * 0.2
    patches = fbm(n, 4, 5)
    wear = np.clip((fbm(n, 6, 5) - 0.5) * 3, 0, 1)
    col = np.ones((n, n, 3)) * C(176, 132, 78)
    col *= (0.8 + 0.3 * patches)[..., None] * (0.88 + 0.2 * fib)[..., None]
    soot = np.clip((fbm(n, 3, 6) - 0.55) * 3, 0, 1)
    col = lerp(col, col * C(120, 100, 80) * 1.2, soot * 0.6)
    col = lerp(col, col * 1.12, wear * 0.5)
    h = norm01(fib * 0.6 + 0.2 * patches + 0.2 * fbm(n, 24, 4))
    save('suede', col, h, 0.86 + 0.1 * fib, nstrength=2.5)

def knit(n=512, loops=64):
    y, x = np.mgrid[0:n, 0:n] / n
    u = x * loops; v = y * loops * 1.3
    fu = u - np.floor(u); fv = v - np.floor(v)
    # jersey: two leaning "V" legs per loop
    leg = np.minimum(np.abs((fu - 0.5) - (fv - 0.5) * 0.45), np.abs((fu - 0.5) + (fv - 0.5) * 0.45))
    st = np.clip(1 - np.abs(np.abs(fu - 0.5) - 0.25) * 6, 0, 1) * np.clip(1 - np.abs(fv - 0.5) * 1.6, 0, 1)
    h = 0.6 * st + 0.25 * fbm(n, 128, 3) + 0.15 * fbm(n, 8, 4)
    h = norm01(h)
    col = np.ones((n, n, 3)) * 0.92 * (0.9 + 0.1 * h)[..., None] * (0.94 + 0.08 * fbm(n, 6, 4))[..., None]
    fuzz = vnoise(n, 512)
    col *= (0.95 + 0.06 * fuzz)[..., None]
    save('knit', col, h, 0.9 + 0.08 * fuzz, nstrength=2.0)

def denim(n=512, threads=96):
    y, x = np.mgrid[0:n, 0:n] / n
    d = (x * threads + y * threads)  # twill diagonal
    tw = 0.5 + 0.5 * np.sin(d * 2 * np.pi)
    warp = streaks(n, 256, 8, 2)
    slub = streaks(n, 64, 3, 2)
    h = norm01(0.6 * tw + 0.25 * warp + 0.15 * fbm(n, 64, 3))
    col = lerp(np.ones((n, n, 3)) * C(62, 80, 112), np.ones((n, n, 3)) * C(160, 170, 190), np.clip(warp * 0.35 + slub * 0.3 - 0.2, 0, 1) * (1 - tw * 0.6))
    fade = np.clip((fbm(n, 4, 5) - 0.45) * 2, 0, 1)
    col = lerp(col, col * 1.3, fade * 0.4)
    save('denim', col, h, 0.88 + 0.08 * warp, nstrength=2.0)

def canvas(n=512, threads=80):
    y, x = np.mgrid[0:n, 0:n] / n
    a = np.sin(x * threads * 2 * np.pi) * 0.5 + 0.5
    b = np.sin(y * threads * 2 * np.pi) * 0.5 + 0.5
    chk = ((np.floor(x * threads) + np.floor(y * threads)) % 2)
    h = norm01(np.where(chk > 0, a * (1 - b * 0.3), b * (1 - a * 0.3)) + 0.3 * fbm(n, 64, 3))
    col = np.ones((n, n, 3)) * 0.9 * (0.9 + 0.12 * h)[..., None]
    dirt = np.clip((fbm(n, 4, 5) - 0.5) * 2.5, 0, 1)
    col = lerp(col, col * C(170, 150, 120) * 1.2, dirt * 0.5)
    save('canvas', col, h, 0.9, nstrength=2.0)

def leather(n=512):
    f1, f2, _ = worley(n, 48)
    grain = norm01(f2 - f1)
    crease = ridged(n, 6, 4)
    h = norm01(0.55 * grain + 0.3 * (1 - crease) + 0.15 * fbm(n, 32, 3))
    col = np.ones((n, n, 3)) * C(108, 70, 42)
    col *= (0.75 + 0.35 * fbm(n, 4, 5))[..., None] * (0.9 + 0.15 * grain)[..., None]
    scorch = np.clip((fbm(n, 5, 5) - 0.62) * 2.5, 0, 1)
    col = lerp(col, col * 0.7, scorch * 0.5)
    save('leather', col, h, 0.55 + 0.25 * grain + 0.1 * scorch, nstrength=2.5)

def terry(n=512, loops=90):
    f1, f2, cid = worley(n, loops)
    loop = np.clip(1 - f1 * 1.6, 0, 1)
    h = norm01(loop + 0.2 * fbm(n, 16, 4))
    col = np.ones((n, n, 3)) * C(236, 238, 240) * (0.82 + 0.2 * loop)[..., None]
    save('terry', col, h, 0.95, nstrength=3.0)

def plaster(n=1024):
    trowel = fbm(n, 3, 6); fine = fbm(n, 128, 3)
    sw = ridged(n, 5, 5)
    h = norm01(0.5 * trowel + 0.3 * sw + 0.2 * fine)
    col = np.ones((n, n, 3)) * C(214, 206, 192) * (0.9 + 0.12 * trowel)[..., None] * (0.97 + 0.05 * fine)[..., None]
    dirt = np.clip((fbm(n, 4, 6) - 0.55) * 2, 0, 1)
    col = lerp(col, col * 0.93, dirt * 0.5)
    save('plaster', col, h, 0.85 + 0.1 * fine, nstrength=1.2)

def frit(n=256):
    f1, f2, cid = worley(n, 46)
    edge = np.clip((f2 - f1) * 6, 0, 1)            # angular crushed grains
    gr = edge * (0.5 + 0.5 * cid)
    h = norm01(gr + 0.25 * fbm(n, 64, 2))
    col = np.ones((n, n, 3)) * (0.55 + 0.45 * cid)[..., None] * (0.5 + 0.5 * edge)[..., None]
    sparkle = (cid > 0.82).astype(float) * edge
    col = col + sparkle[..., None] * 0.35
    save('frit', col, h, 0.6 - 0.45 * sparkle, nstrength=5.0)

def skin(n=256):
    pores = (vnoise(n, 128) > 0.82).astype(float)
    h = norm01(0.6 * fbm(n, 32, 4) - 0.3 * blur(pores, 1))
    col = np.ones((n, n, 3)) * 0.95 * (0.95 + 0.08 * fbm(n, 8, 4))[..., None]
    save('skin', col, h, 0.55 + 0.15 * fbm(n, 16, 3), nstrength=1.0)

def crackle(n=512):
    # thin branching fracture lines for water-quenched glass
    f1, f2, _ = worley(n, 9)
    g1, g2, _ = worley(n, 23)
    l1 = np.clip(1 - (f2 - f1) * 26, 0, 1)
    l2 = np.clip(1 - (g2 - g1) * 40, 0, 1) * (fbm(n, 8, 3) > 0.45)
    lines = np.maximum(l1, l2 * 0.7)
    h = norm01(1 - lines)
    col = np.ones((n, n, 3)) * lines[..., None]
    save('crackle', col, h, 0.1 + 0.6 * lines, ao=np.ones((n, n)), nstrength=6.0)

def furnace_glow(n=256):
    a = fbm(n, 4, 6); b = ridged(n, 3, 5)
    v = norm01(a * 0.6 + b * 0.4)
    col = lerp(np.ones((n, n, 3)) * C(255, 120, 20), np.ones((n, n, 3)) * C(255, 236, 170), v)
    im = Image.fromarray((col * 255).astype(np.uint8)); im.save(os.path.join(OUT, 'glow_c.jpg'), quality=85)
    print('wrote glow')

def water(n=256):
    h = norm01(fbm(n, 4, 6) * 0.6 + fbm(n, 8, 5) * 0.4)
    nm = normal_from_height(h, 3.0)
    Image.fromarray((nm * 255).astype(np.uint8)).save(os.path.join(OUT, 'water_n.jpg'), quality=90)
    print('wrote water')

def puff(n=128):
    # 4 soft smoke/steam puffs in a 2x2 atlas (alpha in all channels)
    out = np.zeros((n * 2, n * 2))
    for k in range(4):
        y, x = np.mgrid[0:n, 0:n] / n - 0.5
        rr = np.sqrt(x * x + y * y)
        f = fbm(n, 4, 5, seed=100 + k) * 0.7 + fbm(n, 8, 4, seed=200 + k) * 0.3
        a = np.clip(1 - rr / (0.32 + 0.16 * f), 0, 1) ** 1.6 * (0.5 + 0.7 * f)
        a = np.clip(a, 0, 1)
        out[(k // 2) * n:(k // 2 + 1) * n, (k % 2) * n:(k % 2 + 1) * n] = a
    im = Image.fromarray((out * 255).astype(np.uint8)).convert('RGB')
    im.save(os.path.join(OUT, 'puff.png'))
    print('wrote puff')

def hair(n=256):
    # strand card texture: rows = strands along v, alpha falls off at tip
    w, hgt = 128, 512
    x = np.arange(w)
    r = np.random.default_rng(11)
    cols = np.zeros((hgt, w)); alpha = np.zeros((hgt, w))
    for s in range(70):
        cx = r.random() * w; wid = 0.6 + r.random() * 1.4
        tip = 0.75 + r.random() * 0.25
        wav = r.random() * 6
        yy = np.arange(hgt)[:, None] / hgt
        xx = x[None, :]
        cxx = cx + np.sin(yy * 9 + wav) * 2.5
        d = np.abs(((xx - cxx + w / 2) % w) - w / 2)
        m = np.clip(1 - d / wid, 0, 1) * (yy < tip) * np.clip((tip - yy) * 12, 0, 1)
        shade = 0.55 + r.random() * 0.45
        cols = np.maximum(cols, m * shade); alpha = np.maximum(alpha, m)
    alpha = np.clip(alpha * 1.4, 0, 1)
    rgba = np.stack([cols, cols, cols, alpha], -1)
    Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'hair.png'))
    print('wrote hair')

def sky(name, n=1024, morning=True):
    h = n // 2
    y, x = np.mgrid[0:h, 0:n] / np.array([h, n])[:, None, None] if False else np.mgrid[0:h, 0:n]
    yy = y / h; xx = x / n
    if morning:
        top = C(120, 165, 215); hor = C(250, 222, 180); sun = C(255, 240, 210)
        col = lerp(np.ones((h, n, 3)) * hor, np.ones((h, n, 3)) * top, np.clip(1 - yy * 1.3, 0, 1) ** 1.2)
        cl = np.clip((fbm(n, 4, 6)[:h] - 0.55) * 3, 0, 1) * np.clip(1.2 - yy * 1.1, 0, 1)
        col = lerp(col, np.ones((h, n, 3)) * C(255, 245, 235), cl * 0.6)
        d = np.sqrt((xx - 0.35) ** 2 * 4 + (yy - 0.62) ** 2)
        col += (np.exp(-d * 6) * 0.6)[..., None] * sun
        # distant trees / roofs silhouette in haze
        ridge = 0.72 + 0.08 * fbm(n, 8, 5)[0] + 0.05 * (vnoise(n, 64)[0] > 0.6)
        tree = yy > ridge[None, :]
        leaves = fbm(n, 64, 4)[:h]
        tc = lerp(np.ones((h, n, 3)) * C(98, 112, 92), np.ones((h, n, 3)) * C(176, 150, 96), leaves * 0.6)
        tc = lerp(tc, col, 0.35)
        col = np.where(tree[..., None], tc, col)
    else:
        top = C(18, 26, 52); hor = C(52, 58, 82)
        col = lerp(np.ones((h, n, 3)) * hor, np.ones((h, n, 3)) * top, np.clip(1 - yy * 1.2, 0, 1))
        ridge = 0.7 + 0.08 * fbm(n, 8, 5)[0]
        tree = yy > ridge[None, :]
        col = np.where(tree[..., None], C(20, 24, 30), col)
        r = np.random.default_rng(4)
        for i in range(26):
            cx, cy = r.random() * n, (0.72 + r.random() * 0.2) * h
            d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            col += (np.exp(-d / (3 + r.random() * 5)) * (0.6 + r.random()))[..., None] * C(255, 190, 120)
    im = Image.fromarray(np.clip(col * 255, 0, 255).astype(np.uint8))
    im.save(os.path.join(OUT, name + '.jpg'), quality=85)
    im.resize((256, 128), Image.LANCZOS).save(os.path.join(OUT, name + '_s.jpg'), quality=80)
    print('wrote', name)

if __name__ == '__main__':
    only = sys.argv[1:]
    jobs = {
        'concrete': lambda: concrete(1024),
        'brick': lambda: bricks('brick', 1024, 4, 13, 0.011, [(150, 72, 52), (124, 58, 42), (92, 54, 44)], (178, 168, 150), soot=0.25),
        'firebrick': lambda: bricks('firebrick', 512, 2, 4, 0.012, [(214, 186, 140), (196, 160, 112), (170, 120, 80)], (200, 190, 170), soot=0.7, chip=0.6),
        'oak': lambda: wood('oak', 1024, (178, 132, 86), (110, 70, 40), rings=11, worn=0.45),
        'pine': lambda: wood('pine', 512, (196, 156, 104), (140, 96, 58), rings=7, worn=0.3),
        'steel': lambda: metal('steel', 512, (168, 168, 166), scratches=1.0, heat=0.0),
        'iron': lambda: metal('iron', 512, (70, 68, 66), rust=0.5, scratches=0.6),
        'pipe': lambda: metal('pipe', 512, (150, 146, 140), scratches=0.7, heat=1.0),
        'suede': suede, 'knit': knit, 'denim': denim, 'canvas': canvas, 'leather': leather,
        'terry': terry, 'plaster': plaster, 'frit': frit, 'skin': skin, 'crackle': crackle,
        'glow': furnace_glow, 'water': water, 'puff': puff, 'hair': hair,
        'sky_morning': lambda: sky('sky_morning', 1024, True),
        'sky_night': lambda: sky('sky_night', 1024, False),
    }
    for k, f in jobs.items():
        if not only or k in only:
            f()

def hair_t(n=512):
    s = streaks(n, 3, 220, 3)
    h = norm01(s * 0.7 + 0.3 * streaks(n, 8, 400, 2))
    col = np.ones((n, n, 3)) * (0.7 + 0.45 * h)[..., None]
    save('hair_t', col, h, 0.55 + 0.3 * (1 - h), nstrength=3.0)

if __name__ == '__main__' and 'hair_t' in sys.argv[1:]:
    hair_t()
