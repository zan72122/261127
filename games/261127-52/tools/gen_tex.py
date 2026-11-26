"""Photo-style procedural PBR textures for 261127-52 (night aquarium).

Every texture is periodic (tiles seamlessly) because all noise is built in
Fourier space or with wrapped Voronoi seeds.  For each material we write
  <name>_c.jpg   base colour (sRGB)
  <name>_n.jpg   tangent-space normal (OpenGL, +Y up)
  <name>_orm.jpg R=ambient occlusion, G=roughness, B=metalness
Run:  python3 tools/gen_tex.py   (from games/261127-52)
"""
import os
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = os.path.join(os.path.dirname(__file__), '..', 'tex')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(52)


def fnoise(n, m=None, beta=2.0, lo=1.0, hi=None, aniso=(1.0, 1.0)):
    """Periodic fractal noise in [-1,1] with power-law spectrum."""
    m = m or n
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[0]
    fx = np.fft.fftfreq(m)[None, :] * m * aniso[1]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = f ** (-beta / 2)
    amp[f < lo] = 0
    if hi:
        amp *= np.exp(-(f / hi) ** 2)
    ph = rng.uniform(0, 2 * np.pi, (n, m))
    spec = amp * np.exp(1j * ph)
    r = np.real(np.fft.ifft2(spec))
    r -= r.mean()
    r /= (np.abs(r).max() + 1e-9)
    return r


def blur_wrap(a, s):
    return gaussian_filter(a, s, mode='wrap')


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx = -dx * strength
    ny = dy * strength   # image rows go down; OpenGL normal +Y up
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1)


def ao_from_height(h, s=6, k=2.0):
    lowpass = blur_wrap(h, s)
    ao = 1 - np.clip((lowpass - h) * k, 0, 1)
    return np.clip(ao, 0, 1)


def save(name, col, nrm, ao, rough, metal=None, q=82):
    col = np.clip(col, 0, 1)
    Image.fromarray((col * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name + '_c.jpg'), quality=q)
    if nrm is not None:
        Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name + '_n.jpg'), quality=q)
    if ao is not None:
        if metal is None:
            metal = np.zeros_like(ao)
        orm = np.stack([ao, rough, metal], -1)
        Image.fromarray((np.clip(orm, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name + '_orm.jpg'), quality=q)
    print('wrote', name)


def voronoi(n, count, jitter=1.0):
    pts = rng.uniform(0, n, (count, 2))
    tiles = [pts + np.array([dx, dy]) * n for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
    allp = np.concatenate(tiles)
    ids = np.tile(np.arange(count), 9)
    tree = cKDTree(allp)
    yy, xx = np.mgrid[0:n, 0:n]
    q = np.stack([xx.ravel() + 0.5, yy.ravel() + 0.5], -1)
    d, i = tree.query(q, k=2)
    cell = ids[i[:, 0]].reshape(n, n)
    d1 = d[:, 0].reshape(n, n)
    d2 = d[:, 1].reshape(n, n)
    return cell, d1, d2


def lerp(a, b, t):
    return a + (b - a) * t


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


# ---------------------------------------------------------------- sand
def sand(n=1024):
    count = 26000
    cell, d1, d2 = voronoi(n, count)
    # grain radius ~ distance to edge
    edge = (d2 - d1)
    r = rng.uniform(0.7, 1.3, count)[cell]
    dome = np.minimum(np.clip(edge / (2.4 * r), 0, 1), np.clip(1 - (d1 / (4.2 * r)) ** 2, 0, 1))
    dome = np.sqrt(dome)
    palette = np.array([hexrgb(c) for c in [
        '#cdb894', '#bfa37a', '#d9c7a4', '#a88a62', '#e6dcc6', '#8f7a5e',
        '#c6b08a', '#b49a73', '#efe8d8', '#6e6257', '#d2bc93', '#9c8466']])
    w = np.array([10, 9, 8, 5, 4, 3, 9, 8, 2, 1.2, 8, 4]); w /= w.sum()
    ci = rng.choice(len(palette), count, p=w)
    jitter = rng.normal(0, 0.05, (count, 1)) + rng.normal(0, 0.012, (count, 3))
    col = palette[ci] * (1 + jitter)
    c = col[cell]
    # grain shading: darker in gaps, a bit of per-grain gradient
    c *= (0.55 + 0.45 * dome)[..., None]
    big = fnoise(n, beta=3.0, hi=40)
    c *= (1 + 0.10 * big)[..., None]
    h = dome * r * 0.8 + 0.25 * big
    nrm = normal_from_height(h, 6.0)
    ao = ao_from_height(h, 3, 1.6) * (0.75 + 0.25 * dome)
    shiny = (ci == 8) | (ci == 4)
    rough = np.where(shiny[cell], 0.45, 0.88) - 0.1 * dome
    save('sand', c, nrm, ao, rough)


# ---------------------------------------------------------------- pebble (stone)
def stone(n=512):
    base = fnoise(n, beta=2.6, hi=120)
    fine = fnoise(n, beta=1.2, lo=40)
    cell, d1, d2 = voronoi(n, 9000)
    speck = rng.uniform(0, 1, 9000)[cell]
    t = 0.5 + 0.5 * base
    c = lerp(hexrgb('#7d7266'), hexrgb('#c9beaf'), t[..., None])
    c = lerp(c, hexrgb('#3d3833'), ((speck > 0.9) * 0.6)[..., None])
    c = lerp(c, hexrgb('#ece6dc'), ((speck < 0.08) * 0.5)[..., None])
    c *= (1 + 0.08 * fine)[..., None]
    h = base * 0.6 + fine * 0.15
    save('stone', c, normal_from_height(h, 3.0), ao_from_height(h, 6, 1.0), 0.55 + 0.2 * (fine * 0.5 + 0.5))


# ---------------------------------------------------------------- oak floor planks
def floor(n=1024):
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    rows = 5                      # planks across the texture (along y)
    pw = n / rows
    row = (yy // pw).astype(int)
    off = rng.uniform(0, n, rows)
    plen = n / 2
    u = (xx + off[row]) % n
    seg = (u // plen).astype(int)
    pid = row * 4 + seg
    tone = rng.uniform(-1, 1, rows * 4)
    # grain: distorted stripes running along x
    warp = fnoise(n, beta=3.2, hi=30) * 18
    wobble = fnoise(n, beta=2.0, aniso=(1.0, 6.0), hi=200)
    v = (yy % pw) / pw
    figure = fnoise(n, beta=1.8, aniso=(1.0, 20.0), lo=2) + 0.5 * fnoise(n, beta=2.6, aniso=(1.0, 5.0))
    shift = rng.integers(0, n, rows * 4)
    ring = figure[((yy + shift[pid]) % n).astype(int), xx.astype(int)]
    ring = np.clip(0.5 + ring, 0, 1)
    fiber = fnoise(n, beta=1.0, aniso=(1.0, 12.0), lo=6)
    t = 0.3 + 0.5 * ring + 0.14 * fiber + 0.1 * tone[pid]
    c = lerp(hexrgb('#4a3324'), hexrgb('#c4976a'), np.clip(t, 0, 1)[..., None])
    c *= (1 + 0.05 * fnoise(n, beta=3.0))[..., None]
    # grooves
    gy = np.minimum(yy % pw, pw - (yy % pw))
    gx = np.minimum(u % plen, plen - (u % plen))
    groove = np.clip(np.minimum(gy, gx) / 1.6, 0, 1) ** 0.7
    c *= (0.45 + 0.55 * groove)[..., None]
    h = groove * 1.0 + 0.04 * ring + 0.06 * fiber
    nrm = normal_from_height(h, 4.0)
    ao = 0.5 + 0.5 * groove
    rough = 0.42 + 0.18 * (fiber * 0.5 + 0.5) + 0.25 * (1 - groove) + 0.06 * fnoise(n, beta=3.0)
    save('floor', c, nrm, ao, rough)


# ---------------------------------------------------------------- walnut cabinet veneer
def walnut(n=1024):
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    warp = fnoise(n, beta=3.4, hi=20) * 40 + fnoise(n, beta=2.0, aniso=(1, 8)) * 6
    fig = fnoise(n, beta=1.9, aniso=(1.0, 24.0), lo=2)
    fig2 = fnoise(n, beta=2.6, aniso=(1.0, 6.0))
    cath = np.clip(0.5 + 0.9 * fig + 0.4 * fig2, 0, 1)
    fiber = fnoise(n, beta=0.9, aniso=(1.0, 14.0), lo=8)
    pores = (fnoise(n, beta=0.3, aniso=(1.0, 10.0), lo=60) > 0.55).astype(float)
    t = 0.35 + 0.3 * cath + 0.1 * fiber
    c = lerp(hexrgb('#2e1d14'), hexrgb('#8a5d3d'), np.clip(t, 0, 1)[..., None])
    c *= (1 - 0.25 * pores)[..., None]
    h = 0.08 * fiber - 0.3 * pores + 0.05 * cath
    save('walnut', c, normal_from_height(h, 3.0), 1 - 0.3 * pores, 0.38 + 0.12 * (fiber * .5 + .5) + 0.2 * pores)


# ---------------------------------------------------------------- warm plaster wall
def plaster(n=512):
    a = fnoise(n, beta=3.0, hi=30)
    b = fnoise(n, beta=1.6, lo=10)
    trow = blur_wrap(np.clip(fnoise(n, beta=2.4, aniso=(1, 1.3)) * 2, -1, 1), 2)
    t = 0.5 + 0.5 * a
    c = lerp(hexrgb('#cdbfab'), hexrgb('#e9e0d2'), t[..., None])
    c *= (1 + 0.02 * b + 0.012 * trow)[..., None]
    h = 0.3 * a + 0.15 * b + 0.12 * trow
    save('plaster', c, normal_from_height(h, 1.4), ao_from_height(h, 8, 0.6), 0.82 + 0.1 * b)


# ---------------------------------------------------------------- linen weave (sofa, sleeve shirt)
def weave(name, n, c0, c1, threads=96, rough=0.85, strength=5.0):
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    k = 2 * np.pi * threads / n
    slub_x = fnoise(n, beta=1.5, aniso=(1.0, 30.0), lo=4)   # thickness variation per thread
    slub_y = fnoise(n, beta=1.5, aniso=(30.0, 1.0), lo=4)
    warp = np.abs(np.sin(xx * k / 2 + 0.3 * slub_x)) ** 0.7 * (0.8 + 0.3 * slub_x)
    weft = np.abs(np.sin(yy * k / 2 + 0.3 * slub_y)) ** 0.7 * (0.8 + 0.3 * slub_y)
    over = np.sign(np.sin(xx * k / 2) * np.sin(yy * k / 2))
    h = np.where(over > 0, warp, weft) * 0.8 + 0.2 * np.maximum(warp, weft)
    fuzz = fnoise(n, beta=0.8, lo=60)
    col_t = 0.5 + 0.25 * slub_x + 0.25 * slub_y + 0.1 * fuzz
    c = lerp(hexrgb(c0), hexrgb(c1), np.clip(col_t, 0, 1)[..., None])
    c *= (0.72 + 0.28 * h)[..., None]
    save(name, c, normal_from_height(h, strength), 0.6 + 0.4 * h, rough + 0.08 * fuzz)


# ---------------------------------------------------------------- knit (sweater sleeve)
def knit(n=512, stitches=16):
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    sw = n / stitches
    sh = sw * 0.75
    lx = (xx % sw) / sw - 0.5
    ly = (yy % sh) / sh
    side = np.sign(lx)
    # each stitch = two leaning ellipses forming a V
    ex = (np.abs(lx) - 0.25) / 0.2
    ey = (ly - 0.5 + side * lx * 0.0) / 0.62
    lean = ex - (ly - 0.5) * 0.9 * 1
    d = np.sqrt((lean) ** 2 + ey ** 2)
    h = np.clip(1 - d, 0, 1) ** 0.6
    yarnf = fnoise(n, beta=0.7, lo=80)
    fib = np.sin((xx * side - yy) * 0.9 + yarnf * 3) * 0.08
    h = h + fib * h
    tone = fnoise(n, beta=2.5, hi=20)
    c = lerp(hexrgb('#a08b6c'), hexrgb('#e2d5bf'), np.clip(0.5 + 0.3 * tone + 0.2 * yarnf, 0, 1)[..., None])
    c *= (0.5 + 0.5 * h)[..., None]
    save('knit', c, normal_from_height(blur_wrap(h, 0.7), 7.0), 0.45 + 0.55 * h, 0.92 + 0 * h)


# ---------------------------------------------------------------- wool rug
def rug(n=512):
    cell, d1, d2 = voronoi(n, 5200)
    loop = np.clip((d2 - d1) / 4.5, 0, 1) ** 0.5
    pat = fnoise(n, beta=3.2, hi=12)
    hue = rng.uniform(-1, 1, 5200)[cell]
    t = np.clip(0.5 + 0.35 * pat + 0.08 * hue, 0, 1)
    c = lerp(hexrgb('#7c6a58'), hexrgb('#d4c6b0'), t[..., None])
    c *= (0.55 + 0.45 * loop)[..., None]
    save('rug', c, normal_from_height(loop + 0.3 * pat, 5.0), 0.5 + 0.5 * loop, 0.95 + 0 * loop)


def rug2(n=512):
    # chunky wool weave with soft stripes
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    k = 2 * np.pi * 48 / n
    slub = fnoise(n, beta=1.3, lo=4)
    warp = np.abs(np.sin(xx * k / 2 + 0.4 * slub)) ** 0.5
    weft = np.abs(np.sin(yy * k / 2 + 0.4 * fnoise(n, beta=1.3, lo=4))) ** 0.5
    over = np.sign(np.sin(xx * k / 2) * np.sin(yy * k / 4))
    h = np.where(over > 0, warp, weft)
    fuzz = fnoise(n, beta=0.6, lo=80)
    stripe = 0.5 + 0.5 * np.sin(yy / n * 2 * np.pi * 3)
    c = lerp(hexrgb('#8d7a66'), hexrgb('#d8ccb8'), np.clip(0.35 + 0.35 * stripe + 0.15 * slub + 0.1 * fuzz, 0, 1)[..., None])
    c *= (0.7 + 0.3 * h)[..., None]
    save('rug', c, normal_from_height(h + 0.3 * fuzz, 6.0), 0.55 + 0.45 * h, 0.97 + 0 * h)


# ---------------------------------------------------------------- driftwood (weathered)
def driftwood(n=512):
    fib = fnoise(n, beta=1.4, aniso=(1.0, 18.0), lo=3)   # long fibres along x (u)
    crack = blur_wrap((fnoise(n, beta=1.8, aniso=(1.0, 10.0)) > 0.62).astype(float), 0.8)
    big = fnoise(n, beta=3.0, hi=16)
    t = np.clip(0.5 + 0.25 * fib + 0.25 * big, 0, 1)
    c = lerp(hexrgb('#4a3626'), hexrgb('#9a7c5c'), t[..., None])
    c = lerp(c, hexrgb('#2a1c12'), (crack * 0.8)[..., None])
    h = 0.3 * fib - 0.8 * crack + 0.3 * big
    save('drift', c, normal_from_height(h, 6.0), 1 - 0.5 * crack, 0.75 + 0.15 * fib)


# ---------------------------------------------------------------- brushed galvanised metal (watering can)
def metal(n=512):
    brush = fnoise(n, beta=0.8, aniso=(1.0, 40.0), lo=10)
    spang = blur_wrap(rng.uniform(0, 1, 300)[voronoi(n, 300)[0]], 1.2)
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    sc = np.zeros((n, n))
    for _ in range(70):
        x0, y0 = rng.uniform(0, n, 2)
        ang = rng.uniform(0, np.pi)
        L = rng.uniform(20, 160)
        dist = np.abs((xx - x0) * np.sin(ang) - (yy - y0) * np.cos(ang))
        along = (xx - x0) * np.cos(ang) + (yy - y0) * np.sin(ang)
        sc = np.maximum(sc, np.exp(-dist ** 2 / 0.6) * (np.abs(along) < L))
    c = lerp(hexrgb('#8d9396'), hexrgb('#c6cacb'), (0.5 + 0.3 * spang + 0.1 * brush)[..., None])
    rough = 0.32 + 0.16 * spang + 0.06 * brush + 0.25 * sc
    h = 0.05 * brush - 0.4 * sc
    save('metal', c, normal_from_height(h, 2.0), 1 - 0.1 * sc, rough, metal=0.9 + 0 * rough)


# ---------------------------------------------------------------- terry towel
def terry(n=256):
    cell, d1, d2 = voronoi(n, 2600)
    loop = np.clip((d2 - d1) / 2.5, 0, 1) ** 0.4
    c = lerp(hexrgb('#b9c7c9'), hexrgb('#e8eeee'), (0.4 + 0.6 * loop)[..., None])
    save('terry', c, normal_from_height(loop, 4.0), 0.5 + 0.5 * loop, 0.97 + 0 * loop)


# ---------------------------------------------------------------- skin micro detail (pores, creases)
def skin(n=256):
    pores = fnoise(n, beta=0.4, lo=40)
    pores = -np.clip(pores - 0.45, 0, 1) * 2
    crease = fnoise(n, beta=1.6, aniso=(1.0, 5.0), lo=6) * 0.3
    h = blur_wrap(pores, 0.6) + crease
    tone = fnoise(n, beta=2.8, hi=16)
    c = lerp(hexrgb('#d9a088'), hexrgb('#f0c4ad'), np.clip(0.55 + 0.35 * tone, 0, 1)[..., None])
    save('skin', c, normal_from_height(h, 2.5), ao_from_height(h, 3, 0.8), 0.55 + 0.1 * tone)


# ---------------------------------------------------------------- hair strands (dark brown)
def hair(n=256):
    s = fnoise(n, beta=0.6, aniso=(40.0, 1.0), lo=4)   # strands run along y
    t = np.clip(0.5 + 0.5 * s, 0, 1)
    c = lerp(hexrgb('#1c120c'), hexrgb('#5b3d28'), t[..., None])
    save('hair', c, normal_from_height(s, 3.0), 0.7 + 0.3 * t, 0.45 + 0.1 * s)


# ---------------------------------------------------------------- rubber (boots)
def rubber(n=256):
    g = fnoise(n, beta=0.5, lo=50)
    big = fnoise(n, beta=3.0, hi=10)
    c = lerp(hexrgb('#7a5a2e'), hexrgb('#a07a3e'), (0.5 + 0.2 * g + 0.3 * big)[..., None])
    save('rubber', c, normal_from_height(g, 1.2), 0.9 + 0.1 * g, 0.42 + 0.08 * g)


# ---------------------------------------------------------------- plant leaves (alpha in a separate png)
def leaves():
    # ribbon (vallisneria-like): u across, v along
    w, hgt = 64, 512
    yy, xx = np.mgrid[0:hgt, 0:w].astype(float)
    u = xx / (w - 1) * 2 - 1
    vein = np.exp(-(u / 0.06) ** 2) * 0.5 + 0.15 * np.abs(np.sin(u * 9))
    streak = fnoise(512, 64, beta=1.0, aniso=(1.0, 30.0))[:hgt, :w] if False else fnoise(hgt, w, beta=1.0, aniso=(0.2, 8.0))
    t = np.clip(0.55 + 0.25 * streak - 0.25 * vein + 0.2 * (yy / hgt), 0, 1)
    c = lerp(hexrgb('#2f5a1e'), hexrgb('#8fbf4e'), t[..., None])
    tip = np.clip((1 - yy / hgt) * 1.0, 0, 1)
    edge = np.clip((1 - np.abs(u)) * 6, 0, 1) * np.clip(tip * 60, 0, 1)
    img = np.concatenate([c, edge[..., None]], -1)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'ribbon.png'))
    # oval leaf (stem plant): 128x128
    n = 128
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    u = xx / (n - 1) * 2 - 1
    v = yy / (n - 1)
    half = 0.9 * np.sin(np.clip(v, 0, 1) * np.pi) ** 0.8
    inside = np.clip((half - np.abs(u)) * 14, 0, 1)
    midr = np.exp(-(u / 0.05) ** 2)
    side = np.abs(np.sin((v * 7 - np.abs(u) * 3) * np.pi)) ** 8 * 0.4
    t = np.clip(0.6 - 0.3 * midr - 0.2 * side + 0.25 * (1 - v), 0, 1)
    c = lerp(hexrgb('#3e6a22'), hexrgb('#a3c95a'), t[..., None])
    img = np.concatenate([c, inside[..., None]], -1)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'leaf.png'))
    print('wrote leaves')


# ---------------------------------------------------------------- fish scale normal + iridescent colour noise
def scales(n=256):
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    s = n / 16
    row = (yy // (s * 0.6)).astype(int)
    lx = ((xx + (row % 2) * s / 2) % s) / s - 0.5
    ly = (yy % (s * 0.6)) / (s * 0.6)
    d = np.sqrt(lx ** 2 + (ly * 0.9) ** 2)
    h = np.clip(1 - d * 1.6, 0, 1) ** 0.5
    save('scale', np.stack([h, h, h], -1) * 0.3 + 0.7, normal_from_height(h, 3.0), None, None)


if __name__ == '__main__':
    sand(); stone(); floor(); walnut(); plaster()
    weave('linen', 512, '#6b6355', '#a99f8e', threads=110)
    weave('cotton', 512, '#8a9aa6', '#c9d3d8', threads=140, strength=4.0)   # girl's shirt
    weave('denim', 256, '#5d6f88', '#8e9fb5', threads=70, strength=5.0)    # mom's shirt
    knit(); rug2(); driftwood(); metal(); terry(); skin(); hair(); rubber(); leaves(); scales()
