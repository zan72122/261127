# Procedural photo-like PBR textures for "なぞの足あとさがし".
# Every texture is tileable (spectral synthesis with FFT) and written as
#   <name>_c.jpg  base color (sRGB)
#   <name>_n.jpg  tangent-space normal (OpenGL, +Y up)
#   <name>_m.jpg  packed: R=ambient occlusion, G=roughness, B=metalness
# plus a half-size "lo" copy of each for the first fast frame.
# Usage: python3 gen_textures.py <outdir>
import sys, os
import numpy as np
from PIL import Image, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'tex'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(51)


def spectral(n, beta=2.0, lo=1.0, hi=None, aniso=(1.0, 1.0), seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    w = r.standard_normal((n, n))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * n * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2)
    amp[f < lo] = 0
    if hi is not None:
        amp *= np.exp(-(f / hi) ** 2)
    out = np.real(np.fft.ifft2(F * amp))
    out -= out.mean()
    out /= (out.std() + 1e-9)
    return out


def blur(a, s):
    """Gaussian blur with wrap-around (FFT)."""
    n, m = a.shape
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(m)[None, :]
    g = np.exp(-2 * (np.pi * s) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx = -dx * strength
    ny = dy * strength  # image rows go down; OpenGL normal +Y up
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1)


def cavity_ao(h, s, k):
    c = h - blur(h, s)
    return np.clip(1.0 + c * k, 0.0, 1.0)


def save(name, color, height, nstrength, rough, metal=None, ao=None, lo=True, quality=88):
    n = color.shape[0]
    if ao is None:
        ao = np.ones((n, n))
    if metal is None:
        metal = np.zeros((n, n))
    rough = np.broadcast_to(rough, (n, n)).astype(float)
    nm = normal_from_height(height, nstrength)
    imgs = {
        'c': np.clip(color, 0, 1),
        'n': nm * 0.5 + 0.5,
        'm': np.stack([np.clip(ao, 0, 1), np.clip(rough, 0.02, 1), np.clip(metal, 0, 1)], -1),
    }
    for k, a in imgs.items():
        im = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
        im.save(f'{OUT}/{name}_{k}.jpg', quality={'c': 84, 'n': 80, 'm': 78}[k], subsampling=0 if k != 'c' else 2)
        if lo:
            im.resize((max(64, n // 4), max(64, n // 4)), Image.LANCZOS).save(f'{OUT}/{name}_{k}_lo.jpg', quality=80)
    print('wrote', name, n)


def lerp(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) == 2 else t
    return a + (b - a) * t


def rgb(hexs):
    h = hexs.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def grid(n):
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    return x / n, y / n


def crazing(n, cells, seed):
    """Glaze craquelure: thin random crack network (Voronoi edges)."""
    r = np.random.default_rng(seed)
    pts = r.random((cells, 2))
    x, y = grid(n)
    d1 = np.full((n, n), 9.0)
    d2 = np.full((n, n), 9.0)
    for px, py in pts:
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                dx = x - (px + ox)
                dy = y - (py + oy)
                d = dx * dx + dy * dy
                m = d < d1
                d2 = np.where(m, d1, np.minimum(d2, d))
                d1 = np.where(m, d, d1)
    e = np.sqrt(d2) - np.sqrt(d1)
    return np.exp(-(e * n / 1.2) ** 2)


# ---------------------------------------------------------------- floor tiles
def floor_tiles():
    n = 2048
    tiles = 8  # 8 x 8 tiles of 20 cm  -> texture spans 1.6 m
    x, y = grid(n)
    tx = np.floor(x * tiles).astype(int)
    ty = np.floor(y * tiles).astype(int)
    fx = x * tiles - tx
    fy = y * tiles - ty
    gw = 0.022  # grout half width (fraction of tile) ~ 4.4 mm grout
    ex = np.minimum(fx, 1 - fx)
    ey = np.minimum(fy, 1 - fy)
    e = np.minimum(ex, ey)
    # slightly rounded / chipped edges
    edge_noise = spectral(n, 2.2, 4, seed=1) * 0.006
    tile_mask = np.clip((e - gw + edge_noise) / 0.008, 0, 1)
    bevel = np.clip((e - gw) / 0.05, 0, 1) ** 0.6
    checker = ((tx + ty) % 2).astype(float)
    r = np.random.default_rng(7)
    per = r.random((tiles, tiles))
    pervar = per[ty, tx]
    light = rgb('#aaa59b')
    dark = rgb('#3a3936')
    base = lerp(light, dark, checker)
    # per-tile glaze tone variation and big soft mottling
    mott = spectral(n, 2.6, 2, seed=2)
    speck = spectral(n, 0.5, 60, seed=3)
    base = base * (1 + (pervar[..., None] - 0.5) * 0.10 + mott[..., None] * 0.035)
    base = base + (speck[..., None] > 2.3) * np.where(checker[..., None] > 0.5, 0.06, -0.08)
    # wear: traffic path is lighter / duller on dark tiles
    wear = np.clip(spectral(n, 3.0, 1, seed=4) * 0.5 + 0.3, 0, 1)
    base = base + (checker * wear * 0.05)[..., None]
    craz = crazing(n, 900, 5) * np.where(checker > 0.5, 0.0, 1.0)
    base = base * (1 - craz[..., None] * 0.18)
    grout = rgb('#5e5a53') * (1 + spectral(n, 1.5, 30, seed=6)[..., None] * 0.08)
    dirt = np.clip(spectral(n, 2.0, 8, seed=8), 0, 3)[..., None] * 0.04
    grout = grout - dirt
    color = lerp(grout, base, tile_mask)
    # grime collects near grout
    grime = np.exp(-((e - gw) / 0.03) ** 2) * tile_mask
    color = color * (1 - grime[..., None] * 0.10)
    # height
    h = tile_mask * (0.6 + bevel * 0.4)
    h = h + mott * 0.01 * tile_mask + spectral(n, 1.2, 80, seed=9) * 0.012 * tile_mask
    h = h - craz * 0.05
    h += (1 - tile_mask) * spectral(n, 0.8, 100, seed=10) * 0.05
    rough = np.where(tile_mask > 0.5, 0.32 + wear * 0.22 + (1 - checker) * 0.02, 0.92)
    rough = rough + spectral(n, 1.6, 20, seed=11) * 0.04 + craz * 0.2
    ao = cavity_ao(h, 6, 3.0) * (0.75 + 0.25 * tile_mask)
    save('floor', color, h * 6.0, 6.0, rough, ao=ao)


# ------------------------------------------------------------ wall subway tiles
def wall_tiles():
    n = 1024
    cols, rows = 4, 8  # 15 x 7.5 cm tiles, texture spans 60 x 60 cm
    x, y = grid(n)
    ry = np.floor(y * rows).astype(int)
    xs = x * cols + (ry % 2) * 0.5
    rx = np.floor(xs).astype(int)
    fx = xs - rx
    fy = y * rows - ry
    gx, gy = 0.012, 0.024
    ex = np.minimum(fx, 1 - fx) / gx
    ey = np.minimum(fy, 1 - fy) / gy
    e = np.minimum(ex, ey)
    tile_mask = np.clip((e - 1.0) / 0.35, 0, 1)
    # pillowed glaze: rounded edges
    px = np.clip(np.minimum(fx, 1 - fx) / 0.10, 0, 1)
    py = np.clip(np.minimum(fy, 1 - fy) / 0.20, 0, 1)
    pillow = np.sin(np.minimum(px, 1) * np.pi / 2) * np.sin(np.minimum(py, 1) * np.pi / 2)
    r = np.random.default_rng(12)
    per = r.random((rows + 1, cols + 2))
    pv = per[ry % rows, rx % (cols + 1)]
    white = rgb('#e4e1d8')
    base = white * (1 + (pv[..., None] - 0.5) * 0.04)
    wave = spectral(n, 3.0, 3, seed=13)
    craz = crazing(n, 700, 14)
    base = base * (1 - craz[..., None] * 0.06)
    # faint yellowing near grout
    base = base * (1 - np.exp(-(e - 1) / 3)[..., None] * np.array([0.02, 0.03, 0.06]))
    grout = rgb('#a7a399') * (1 + spectral(n, 1.2, 30, seed=15)[..., None] * 0.06)
    color = lerp(grout, base, tile_mask)
    h = tile_mask * (0.5 + 0.5 * pillow) + wave * 0.02 * tile_mask - craz * 0.02
    h += (1 - tile_mask) * spectral(n, 0.6, 90, seed=16) * 0.04
    rough = np.where(tile_mask > 0.5, 0.10 + craz * 0.3, 0.88) + np.abs(wave) * 0.03
    ao = cavity_ao(h, 4, 2.0) * (0.8 + 0.2 * tile_mask)
    save('walltile', color, h * 5.0, 5.0, rough, ao=ao)


# ------------------------------------------------------------- plaster / paint
def plaster():
    n = 1024
    h = spectral(n, 2.4, 2, seed=20) * 0.5 + spectral(n, 1.0, 50, seed=21) * 0.25
    trowel = blur(spectral(n, 2.0, 4, aniso=(1, 0.35), seed=22), 1.5)
    h += trowel * 0.4
    c = rgb('#d9d4c8') * (1 + spectral(n, 2.8, 1, seed=23)[..., None] * 0.025 + h[..., None] * 0.008)
    rough = 0.85 + h * 0.02
    save('plaster', c, h, 1.2, rough, ao=cavity_ao(h, 3, 0.12))


# ---------------------------------------------------------------------- woods
def blur_aniso(a, sx, sy):
    n, m = a.shape
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(m)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * ((sx * fx) ** 2 + (sy * fy) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def wood(name, c1, c2, rings, n=1024, seed=30, rough0=0.45, oiled=True, ret=False):
    """Plain-sawn boards running along x: long fibres, growth rings, pores, seams."""
    r = np.random.default_rng(seed)
    x, y = grid(n)
    planks = 4
    pid = np.floor(y * planks).astype(int)
    py = (y * planks) % 1
    # each plank: its own ring offset and slight colour
    poff = r.random(planks + 1)
    pcol = 1 + (r.random(planks + 1) - 0.5) * 0.12
    warp = blur_aniso(r.standard_normal((n, n)), 160, 14)
    warp = warp / warp.std()
    # growth rings: function of y within the plank + slow warp along x (cathedral grain)
    cath = np.sin(x * np.pi * 2 * (1 + poff[pid] * 2) + poff[pid] * 6) * 0.35
    v = py * rings + cath * (0.6 + 0.4 * np.abs(py - 0.5) * 2) + warp * 0.35 + poff[pid] * 10
    ring = np.abs(np.sin(v * np.pi)) ** 0.6
    late = 1 - ring  # dark latewood bands
    late = late ** 3
    fib = blur_aniso(r.standard_normal((n, n)), 60, 0.7)
    fib = fib / fib.std()
    fib2 = blur_aniso(r.standard_normal((n, n)), 200, 2.5)
    fib2 = fib2 / fib2.std()
    pores = blur_aniso((r.random((n, n)) > 0.985).astype(float), 6, 0.6)
    pores = np.clip(pores / (pores.max() + 1e-9) * 3, 0, 1)
    t = np.clip(0.35 + late * 0.55 + fib * 0.06 + fib2 * 0.08 + pores * 0.25, 0, 1)
    col = lerp(rgb(c1), rgb(c2), t) * pcol[pid][..., None]
    col = col * (1 + spectral(n, 2.6, 1, seed=seed + 5)[..., None] * 0.04)
    seam = np.exp(-((np.minimum(py, 1 - py)) * n / planks / 1.2) ** 2)
    col = col * (1 - seam[..., None] * 0.6)
    h = -late * 0.35 + fib * 0.06 - pores * 0.5 - seam * 1.5
    scratches = np.zeros((n, n))
    for _ in range(120):
        x0, y0 = r.random(2) * n
        ang = r.normal(0, 0.35) + (np.pi / 2 if r.random() < 0.15 else 0)
        L = r.random() * n * 0.12
        for s in np.linspace(0, L, int(L) + 1):
            xi = int(x0 + np.cos(ang) * s) % n
            yi = int(y0 + np.sin(ang) * s) % n
            scratches[yi, xi] = max(scratches[yi, xi], r.random() * 0.5 + 0.5)
    scratches = blur(scratches, 0.5)
    h -= scratches * 0.5
    col = col * (1 + scratches[..., None] * 0.12)
    rough = rough0 + late * 0.06 + scratches * 0.2 + pores * 0.2 + np.abs(fib2) * 0.03
    if ret:
        return col, h, rough
    save(name, col, h, 3.0, rough, ao=cavity_ao(h, 3, 0.8))


# --------------------------------------------------------------------- fabrics
def weave(name, color, n=1024, threads=160, slub=0.5, warp_col=None, twill=False, seed=40, rough0=0.85, fuzz=0.35, ret=False):
    x, y = grid(n)
    u = x * threads
    v = y * threads
    iu = np.floor(u).astype(int)
    iv = np.floor(v).astype(int)
    fu = u - iu
    fv = v - iv
    if twill:
        over = ((iu + iv) % 3 == 0)
    else:
        over = ((iu + iv) % 2 == 0)
    # thread profiles
    warp_p = np.sin(fu * np.pi)  # warp threads run along v
    weft_p = np.sin(fv * np.pi)
    slub_w = 1 + spectral(n, 1.0, 2, aniso=(1, 0.02), seed=seed) * 0.12 * slub
    slub_f = 1 + spectral(n, 1.0, 2, aniso=(0.02, 1), seed=seed + 1) * 0.12 * slub
    hw = warp_p * slub_w * (0.6 + 0.4 * np.sin(fv * np.pi))
    hf = weft_p * slub_f * (0.6 + 0.4 * np.sin(fu * np.pi))
    h = np.where(over, hw, hf)
    fz = spectral(n, 0.8, 60, seed=seed + 2)
    h = h + fz * 0.06 * fuzz
    base = rgb(color)
    wc = rgb(warp_col) if warp_col else base
    col = np.where(over[..., None], wc, base)
    col = col * (0.82 + 0.18 * h[..., None])
    col = col * (1 + spectral(n, 2.6, 1, seed=seed + 3)[..., None] * 0.03 + (slub_w - 1)[..., None] * 0.6)
    rough = rough0 + (1 - h) * 0.08
    if ret:
        return col, h, rough
    save(name, col, h, 1.6, rough, ao=0.75 + 0.25 * h)


def knit(name, color, n=1024, cols=48, seed=50):
    x, y = grid(n)
    u = x * cols
    v = y * cols * 1.4
    iu = np.floor(u)
    fu = u - iu
    fv = v - np.floor(v)
    # V-shaped knit stitches: each column two leaning loops
    lean = (fu - 0.5)
    vv = (fv + np.abs(lean) * 0.9) % 1
    loop = np.sin(np.clip(np.abs(lean) * 2, 0, 1) * np.pi) * (0.6 + 0.4 * np.sin(vv * np.pi))
    gap = np.exp(-(lean / 0.06) ** 2)
    h = loop * (1 - gap * 0.7)
    fuzz = spectral(n, 0.9, 50, seed=seed)
    h += fuzz * 0.07
    col = rgb(color) * (0.75 + 0.25 * h[..., None]) * (1 + spectral(n, 2.6, 1, seed=seed + 1)[..., None] * 0.03)
    save(name, col, h, 2.2, 0.9 + fuzz * 0.03, ao=0.65 + 0.35 * np.clip(h, 0, 1))


def boucle(name, color, n=1024, seed=60):
    h = spectral(n, 0.6, 70, seed=seed)
    loops = (blur((spectral(n, 0.2, 140, seed=seed + 1) > 1.2).astype(float), 1.0))
    h = h * 0.4 + loops * 1.2
    col = rgb(color) * (0.8 + 0.2 * np.clip(h[..., None], -1, 2)) * (1 + spectral(n, 2.5, 1, seed=seed + 2)[..., None] * 0.04)
    save(name, col, h, 1.8, 0.95, ao=cavity_ao(h, 2, 0.5))


# ---------------------------------------------------------------------- metal
def metal(name, color, n=512, seed=70, rough0=0.35, knurl=0, paint=False):
    x, y = grid(n)
    brushed = spectral(n, 0.5, 30, aniso=(0.01, 1), seed=seed)
    h = brushed * 0.05
    scr = np.zeros((n, n))
    r = np.random.default_rng(seed)
    for _ in range(220):
        x0, y0 = r.random(2) * n
        ang = r.random() * np.pi
        L = r.random() * n * 0.12
        for s in np.linspace(0, L, int(L) + 1):
            scr[int(y0 + np.sin(ang) * s) % n, int(x0 + np.cos(ang) * s) % n] = r.random() * 0.5 + 0.5
    scr = blur(scr, 0.45)
    h -= scr * 0.5
    if knurl:
        k1 = np.abs(((x + y) * knurl) % 1 - 0.5)
        k2 = np.abs(((x - y) * knurl) % 1 - 0.5)
        h += np.minimum(k1, k2) * 6
    col = rgb(color) * (1 + brushed[..., None] * 0.02) * (1 + scr[..., None] * (0.2 if paint else 0.1))
    rough = rough0 + scr * 0.25 + brushed * 0.02
    met = np.ones((n, n)) * (0.0 if paint else 1.0)
    if paint:
        met = np.clip(scr * 1.2, 0, 1)
        col = lerp(col, rgb('#9a9893'), np.clip(scr * 1.2, 0, 1))
    save(name, col, h, 3.0, rough, metal=met, ao=cavity_ao(h, 2, 0.5))


# -------------------------------------------------------------- skin detail
def skin():
    n = 512
    pores = blur((spectral(n, 0.2, 150, seed=80) > 2.0).astype(float), 0.7)
    lines = spectral(n, 1.0, 20, aniso=(0.08, 1), seed=81) * 0.5 + spectral(n, 1.0, 20, aniso=(1, 0.15), seed=82) * 0.3
    h = -pores * 0.6 + np.abs(lines) * -0.3 + spectral(n, 1.2, 30, seed=83) * 0.1
    mott = spectral(n, 2.6, 1, seed=84)
    col = np.ones((n, n, 3)) * np.array([1.0, 1.0, 1.0])
    col = col * (1 + np.stack([mott * 0.03, -mott * 0.02, -mott * 0.03], -1)) * (1 - pores[..., None] * 0.08)
    save('skin', col, h, 1.4, 0.55 + pores * 0.1 + mott * 0.03)


# ---------------------------------------------------------- outside / window
def outside():
    W, H = 1024, 768
    y, x = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]
    sky_top = rgb('#c7d3dc')
    sky_bot = rgb('#eef0ec')
    img = sky_top + (sky_bot - sky_top) * (y[..., None] ** 0.8)
    # soft clouds breaking up after rain
    cl = spectral(1024, 3.0, 2, seed=90)[:H, :W]
    img = img * (1 + cl[..., None] * 0.04)
    # sun glow upper left
    sg = np.exp(-(((x - 0.25) / 0.3) ** 2 + ((y - 0.15) / 0.25) ** 2))
    img = img + sg[..., None] * np.array([0.12, 0.10, 0.06])
    # trees: dark green masses
    tree_line = 0.42 + spectral(1024, 2.5, 2, seed=91)[0, :W] * 0.06
    trees = np.clip((y - tree_line[None, :]) / 0.02, 0, 1)
    leaf = spectral(1024, 1.4, 10, seed=92)[:H, :W]
    tc = rgb('#4b5e3e') * (1 + leaf[..., None] * 0.18) * (0.95 + 0.25 * np.clip(1 - (y[..., None] - 0.42) * 2, 0, 1))
    img = img * (1 - trees[..., None]) + tc * trees[..., None]
    # wooden fence + wet lawn bottom
    fence = ((y > 0.66) & (y < 0.86)).astype(float) * (np.sin(x * W / 9) > -0.85)
    fc = rgb('#7c6d5c') * (1 + spectral(1024, 1.0, 30, aniso=(1, 0.05), seed=93)[:H, :W][..., None] * 0.08)
    img = img * (1 - fence[..., None]) + fc * fence[..., None]
    lawn = np.clip((y - 0.86) / 0.01, 0, 1)
    lc = rgb('#5f7046') * (1 + spectral(1024, 1.0, 40, seed=94)[:H, :W][..., None] * 0.15)
    img = img * (1 - lawn[..., None]) + lc * lawn[..., None]
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    im.save(f'{OUT}/outside.jpg', quality=85)
    im.resize((256, 192)).save(f'{OUT}/outside_lo.jpg', quality=80)
    print('wrote outside')


def raindrops():
    """Normal + alpha for drops on window glass (RGB normal, A unused -> separate mask)."""
    n = 1024
    h = np.zeros((n, n))
    r = np.random.default_rng(95)
    yy, xx = np.mgrid[0:n, 0:n]
    for i in range(900):
        cx, cy = r.random(2) * n
        rad = r.lognormal(1.0, 0.5)
        rad = min(rad, 14)
        x0, x1 = int(cx - rad - 2), int(cx + rad + 3)
        y0, y1 = int(cy - rad * 1.2 - 2), int(cy + rad * 1.2 + 3)
        sub_y, sub_x = np.mgrid[y0:y1, x0:x1]
        d = ((sub_x - cx) / rad) ** 2 + ((sub_y - cy) / (rad * 1.15)) ** 2
        dome = np.sqrt(np.clip(1 - d, 0, 1)) * rad * 0.5
        hh = h[np.arange(y0, y1)[:, None] % n, np.arange(x0, x1)[None, :] % n]
        h[np.arange(y0, y1)[:, None] % n, np.arange(x0, x1)[None, :] % n] = np.maximum(hh, dome)
    # a few running streaks
    for i in range(25):
        cx = r.random() * n
        cy = r.random() * n
        L = r.random() * 300 + 80
        w = r.random() * 2 + 1.5
        for s in range(int(L)):
            xi = int(cx + np.sin(s * 0.03 + i) * 3) % n
            yi = int(cy + s) % n
            for k in range(-3, 4):
                v = np.sqrt(max(0, 1 - (k / w) ** 2)) * w * 0.35
                h[yi, (xi + k) % n] = max(h[yi, (xi + k) % n], v)
    h = blur(h, 0.7)
    mask = np.clip(h * 1.5, 0, 1)
    nm = normal_from_height(h, 1.0) * 0.5 + 0.5
    Image.fromarray((nm * 255).astype(np.uint8)).save(f'{OUT}/rain_n.jpg', quality=90)
    Image.fromarray((mask * 255).astype(np.uint8)).save(f'{OUT}/rain_m.jpg', quality=90)
    print('wrote rain')


if __name__ == '__main__':
    which = sys.argv[2:] or ['all']
    jobs = {
        'floor': floor_tiles,
        'walltile': wall_tiles,
        'plaster': plaster,
        'oak': lambda: wood('oak', '#a88b68', '#6a4c33', 9, seed=30, rough0=0.42),
        'darkwood': lambda: wood('darkwood', '#5e4330', '#2b1c12', 12, seed=33, rough0=0.38),
        'paintwood': lambda: painted_wood(),
        'linen': lambda: weave('linen', '#d9d3c6', threads=150, slub=1.4, seed=40, rough0=0.88),
        'sofa': lambda: boucle('sofa', '#6d7078', seed=60),
        'twill': lambda: weave('twill', '#a88f6c', threads=200, twill=True, slub=0.3, seed=42, rough0=0.8, fuzz=0.2),
        'tweed': lambda: tweed(),
        'knit': lambda: knit('knit', '#7d8794', seed=50),
        'denim': lambda: weave('denim', '#3d4f6e', threads=220, twill=True, warp_col='#c9c6bd', slub=0.8, seed=44, rough0=0.85),
        'alu': lambda: metal('alu', '#2b2c2f', seed=70, rough0=0.38, knurl=40, paint=True),
        'tin': lambda: metal('tin', '#b7b4ad', seed=72, rough0=0.3),
        'skin': skin,
        'outside': outside,
        'rain': raindrops,
        'rug': lambda: weave('rug', '#8e7f72', threads=90, twill=True, warp_col='#6f6359', slub=1.0, seed=46, rough0=0.95, fuzz=1.0),
    }

    def painted_wood():
        n = 1024
        _, wh, _ = wood('paintbase', '#777777', '#555555', 12, n=n, seed=36, ret=True)
        x, y = grid(n)
        strokes = spectral(n, 1.0, 20, aniso=(0.03, 1), seed=37)
        h = strokes * 0.15 + spectral(n, 2.8, 2, seed=38) * 0.1 + wh * 0.35
        col = rgb('#8f9a92') * (1 + strokes[..., None] * 0.02 + spectral(n, 2.6, 1, seed=39)[..., None] * 0.03)
        save('paintwood', col, h, 1.5, 0.55 + strokes * 0.03, ao=cavity_ao(h, 3, 0.4))

    def tweed():
        n = 512
        x, y = grid(n)
        c, h, rough = weave('tweed', '#8a7a62', n=n, threads=90, twill=True, warp_col='#5e5142', slub=1.6, seed=48, rough0=0.92, fuzz=1.0, ret=True)
        # houndstooth-like check overprint (deerstalker hat)
        chk = ((np.floor(x * 16) + np.floor(y * 16)) % 2)
        lines = (((x * 16) % 1) < 0.12) | (((y * 16) % 1) < 0.12)
        c = c * (1 - chk[..., None] * 0.12) * (1 - lines[..., None] * 0.2)
        save('tweed', c, h, 1.6, rough, ao=0.75 + 0.25 * h)

    for name, fn in jobs.items():
        if 'all' in which or name in which:
            fn()
