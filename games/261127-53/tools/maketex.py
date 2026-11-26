#!/usr/bin/env python3
"""Procedural photo-style PBR texture generator (tileable).
Outputs <name>_c.jpg (base color, sRGB), <name>_n.jpg (tangent normal),
<name>_orm.jpg (R=AO, G=roughness, B=metalness) into ../tex.
Everything is periodic (FFT spectral synthesis / wrapped distances), so it tiles.
Run:  python3 -I tools/maketex.py
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tex')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(53)

def fnoise(n, beta=2.0, lo=1.0, hi=None, seed=None, aniso=(1.0, 1.0)):
    """tileable fractal noise in [0,1] by spectral synthesis"""
    r = np.random.default_rng(seed) if seed is not None else rng
    w = r.standard_normal((n, n))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * n * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / np.power(f, beta / 2.0)
    amp[f < lo] = 0
    if hi is not None:
        amp *= np.exp(-(f / hi) ** 2)
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(F * amp))
    out -= out.min(); out /= (out.max() + 1e-9)
    return out

def norm01(a):
    a = a - a.min(); return a / (a.max() + 1e-9)

def blur(a, r):
    """periodic gaussian blur via FFT"""
    n = a.shape[0]
    fy = np.fft.fftfreq(n)[:, None]; fx = np.fft.fftfreq(a.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * r) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))

def voronoi(n, count, seed=1, jitter=1.0):
    """wrapped voronoi: returns F1, F2 distance (in px) and cell id"""
    r = np.random.default_rng(seed)
    pts = r.random((count, 2)) * n
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    F1 = np.full((n, n), 1e9, np.float32); F2 = np.full((n, n), 1e9, np.float32)
    ID = np.zeros((n, n), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px); dx = np.minimum(dx, n - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, n - dy)
        d = np.sqrt(dx * dx + dy * dy)
        m1 = d < F1
        F2 = np.where(m1, F1, np.minimum(F2, d))
        ID = np.where(m1, i, ID)
        F1 = np.where(m1, d, F1)
    return F1, F2, ID

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx = -dx * strength; ny = dy * strength; nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)

def ao_from_height(h, r=6, k=2.5):
    b = blur(h, r)
    ao = 1.0 - np.clip((b - h) * k, 0, 1)
    return np.clip(ao, 0, 1)

def save(name, col, h, nstr, rough, metal=None, ao=None, q=86):
    col = np.clip(col, 0, 1)
    Image.fromarray((col ** (1 / 2.2) * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_c.jpg'), quality=q)
    Image.fromarray(normal_from_height(h, nstr)).save(os.path.join(OUT, name + '_n.jpg'), quality=90)
    if ao is None: ao = ao_from_height(h)
    if metal is None: metal = np.zeros_like(h)
    orm = np.stack([ao, np.clip(rough, 0, 1), np.clip(metal, 0, 1)], -1)
    Image.fromarray((orm * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_orm.jpg'), quality=88)
    print('wrote', name)

def lin(c):  # sRGB hex-ish tuple 0..255 to linear
    return (np.array(c, np.float32) / 255.0) ** 2.2

def tint(a, c0, c1):
    c0 = lin(c0); c1 = lin(c1)
    return c0[None, None, :] * (1 - a[..., None]) + c1[None, None, :] * a[..., None]

def scratches(n, count, seed, maxlen=0.25, width=1.0):
    r = np.random.default_rng(seed)
    img = Image.new('L', (n * 3, n * 3), 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    for i in range(count):
        x = r.random() * n + n; y = r.random() * n + n
        a = r.random() * np.pi
        if r.random() < 0.6: a = r.normal(0.2, 0.25)  # mostly one direction like wiping
        L = r.random() ** 2 * maxlen * n + 4
        pts = []
        for t in np.linspace(0, 1, 6):
            pts.append((x + np.cos(a) * L * t + r.normal(0, 0.6), y + np.sin(a) * L * t + r.normal(0, 0.6)))
        d.line(pts, fill=int(80 + r.random() * 175), width=max(1, int(width * (0.5 + r.random()))))
    a = np.asarray(img, np.float32) / 255.0
    # fold the 3x3 canvas back to n x n so the scratches wrap
    out = np.zeros((n, n), np.float32)
    for iy in range(3):
        for ix in range(3):
            out = np.maximum(out, a[iy * n:(iy + 1) * n, ix * n:(ix + 1) * n])
    return out

# ---------------------------------------------------------------- steel paint (training house)
def steel(n=1024):
    base = fnoise(n, 2.2, 1, seed=11)
    mott = fnoise(n, 1.6, 4, seed=12)
    fine = fnoise(n, 0.6, 40, seed=13)
    rust_m = fnoise(n, 2.4, 2, seed=14)
    rust_d = fnoise(n, 1.2, 20, seed=15)
    rust = np.clip((rust_m * 0.7 + rust_d * 0.45 - 0.72) * 6, 0, 1)
    chips_f1, chips_f2, _ = voronoi(n, 260, seed=16)
    chipmask = np.clip(((fnoise(n, 2.0, 3, seed=17) - 0.66) * 8), 0, 1) * (chips_f2 - chips_f1 < 6)
    sc = scratches(n, 520, 18, 0.12, 1.2)
    # paint colour: dark slate grey with bluish/warm drift
    col = tint(base * 0.6 + mott * 0.4, (78, 82, 86), (104, 104, 100))
    col *= (0.86 + fine[..., None] * 0.22)
    # streaks running down (rain / soot)
    streak = fnoise(n, 2.0, 2, seed=19, aniso=(1.0, 0.08))
    col *= (0.82 + 0.25 * streak[..., None])
    rustc = tint(rust_d, (92, 46, 22), (150, 84, 40))
    col = col * (1 - rust[..., None]) + rustc * rust[..., None]
    metal_c = lin((150, 148, 144))
    col = col * (1 - sc[..., None] * 0.7) + metal_c * sc[..., None] * 0.7
    h = fine * 0.25 + mott * 0.2 - sc * 0.6 + rust * (rust_d * 0.9) - chipmask * 0.3
    rough = 0.58 + fine * 0.12 + rust * 0.28 - sc * 0.32 - streak * 0.06
    metal = sc * 0.85
    save('steel', col, h, 3.5, rough, metal)

# ---------------------------------------------------------------- concrete / ground
def concrete(n=1024):
    big = fnoise(n, 2.4, 1, seed=21)
    mid = fnoise(n, 1.8, 6, seed=22)
    grain = fnoise(n, 0.2, 80, seed=23)
    f1, f2, cid = voronoi(n, 5200, seed=24)
    cid_r = np.random.default_rng(25).random(cid.max() + 1)[cid]
    agg = np.clip(1 - f1 / 5.0, 0, 1) ** 0.8 * (cid_r > 0.55) * (0.4 + 0.6 * cid_r)
    pores = (fnoise(n, 0.0, 120, seed=26) > 0.86).astype(np.float32)
    pores = np.clip(blur(pores, 0.6) * 3, 0, 1)
    stains = np.clip((fnoise(n, 2.6, 1, seed=27) - 0.55) * 3, 0, 1)
    # hairline cracks along voronoi of a big scale
    c1, c2, _ = voronoi(n, 14, seed=28)
    crack = np.clip(1 - (c2 - c1) / 2.2, 0, 1) * (fnoise(n, 2.0, 2, seed=29) > 0.5)
    v = big * 0.35 + mid * 0.35 + grain * 0.3
    col = tint(v, (118, 114, 106), (168, 162, 150))
    stone = tint(cid_r, (120, 112, 100), (190, 182, 168))
    col = col * (1 - agg[..., None] * 0.14) + stone * agg[..., None] * 0.14
    col *= (1 - pores[..., None] * 0.45)
    col *= (1 - stains[..., None] * 0.25)
    col *= (1 - crack[..., None] * 0.5)
    h = grain * 0.45 + agg * 0.3 - pores * 0.6 - crack * 1.0 + mid * 0.3
    rough = 0.84 + grain * 0.1 - stains * 0.08 - agg * 0.08
    save('concrete', col, h, 4.0, rough)

# ---------------------------------------------------------------- coat canvas (turnout coat, aramid weave)
def canvas(n=512, name='coat', c0=(30, 38, 58), c1=(52, 62, 86)):
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    per = 8.0
    # twill weave: threads alternate over/under with a diagonal shift
    u = xx / per * 2 * np.pi; v = yy / per * 2 * np.pi
    warp = 0.5 + 0.5 * np.cos(u)  # vertical threads profile
    weft = 0.5 + 0.5 * np.cos(v)
    phase = (np.floor(xx / per) + np.floor(yy / per)) % 2
    jitter = fnoise(n, 1.0, 10, seed=31)
    h = np.where(phase > 0, warp * 0.9 + weft * 0.2, weft * 0.9 + warp * 0.2)
    h = h * (0.8 + jitter * 0.4)
    slub = fnoise(n, 2.0, 2, seed=32, aniso=(1.0, 0.15))
    soil = np.clip((fnoise(n, 2.4, 1, seed=33) - 0.5) * 2, 0, 1)
    col = tint(h * 0.6 + slub * 0.4, c0, c1)
    col *= (1 - soil[..., None] * 0.25)
    rough = 0.88 - h * 0.06
    save(name, col, h, 2.2, rough, ao=0.75 + 0.25 * h)

# ---------------------------------------------------------------- leather (gloves, boots)
def leather(n=512):
    pebble = fnoise(n, 0.3, 70, seed=41)
    pebble2 = fnoise(n, 0.6, 35, seed=45)
    big = fnoise(n, 2.4, 1, seed=42)
    crease = fnoise(n, 1.6, 3, seed=43, aniso=(1.0, 0.35))
    crease = np.clip(1 - np.abs(crease - 0.5) * 12, 0, 1)
    wear = np.clip((fnoise(n, 2.2, 2, seed=44) - 0.5) * 2.5, 0, 1)
    col = tint(big, (118, 80, 48), (150, 104, 62))
    col *= (0.96 + 0.08 * pebble2[..., None])
    col = col * (1 + wear[..., None] * 0.18)
    col *= (1 - crease[..., None] * 0.22)
    h = pebble * 0.35 + pebble2 * 0.25 - crease * 0.6 + big * 0.1
    rough = 0.55 + pebble * 0.12 - wear * 0.12
    save('leather', col, h, 1.6, rough, ao=0.85 + 0.15 * (1 - crease))

# ---------------------------------------------------------------- truck paint (red, clear coat)
def redpaint(n=512):
    peel = fnoise(n, 1.0, 30, seed=51)
    big = fnoise(n, 2.4, 1, seed=52)
    dirt = np.clip((fnoise(n, 2.0, 2, seed=53, aniso=(1.0, 0.2)) - 0.6) * 2.5, 0, 1)
    col = tint(big, (128, 14, 12), (150, 22, 16))
    col *= (1 - dirt[..., None] * 0.2)
    sc = scratches(n, 30, 54, 0.05, 1.0)
    col = col * (1 - sc[..., None] * 0.25) + lin((190, 160, 150)) * sc[..., None] * 0.25
    h = peel * 0.4 - sc * 0.3
    rough = 0.32 + dirt * 0.3 + peel * 0.05 + sc * 0.2
    save('redpaint', col, h, 1.2, rough, ao=np.ones_like(h))

# ---------------------------------------------------------------- wood
def wood(n=512):
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    warp = fnoise(n, 2.4, 1, seed=61, aniso=(0.12, 1)) * 5 + fnoise(n, 1.6, 4, seed=62, aniso=(0.2, 1)) * 1.2
    rings = np.sin((xx / n * 2 * np.pi * 22) + warp)
    rings = 0.5 + 0.5 * rings
    fiber = fnoise(n, 0.8, 30, seed=63, aniso=(1.0, 0.05))
    knot_f1, _, _ = voronoi(n, 3, seed=64)
    knot = np.clip(1 - knot_f1 / 18, 0, 1)
    col = tint(rings ** 1.5 * 0.7 + fiber * 0.3, (122, 84, 52), (176, 132, 88))
    col *= (1 - knot[..., None] * 0.5)
    h = rings * 0.3 + fiber * 0.5 - knot * 0.2
    rough = 0.6 + fiber * 0.15
    save('wood', col, h, 2.2, rough)

# ---------------------------------------------------------------- plush fur (teddy bear)
def fur(n=512):
    fine = fnoise(n, 0.2, 60, seed=71)
    tuft = fnoise(n, 1.4, 8, seed=72)
    dir_ = fnoise(n, 1.0, 20, seed=73, aniso=(0.3, 1.0))
    h = fine * 0.5 + tuft * 0.3 + dir_ * 0.4
    col = tint(tuft * 0.5 + fine * 0.5, (120, 78, 44), (186, 136, 86))
    rough = 0.95 * np.ones_like(h)
    save('fur', col, h, 5.0, rough, ao=0.6 + 0.4 * h)

# ---------------------------------------------------------------- hose jacket (woven polyester, off-white)
def hose(n=256):
    canvas(n, 'hose', (178, 170, 150), (222, 214, 192))

# ---------------------------------------------------------------- rubber
def rubber(n=256):
    fine = fnoise(n, 0.4, 40, seed=81)
    big = fnoise(n, 2.0, 2, seed=82)
    col = tint(big * 0.5 + fine * 0.5, (22, 22, 22), (40, 39, 37))
    h = fine
    rough = 0.72 + fine * 0.15
    save('rubber', col, h, 1.5, rough, ao=np.ones_like(h))

# ---------------------------------------------------------------- gravel / far ground
def gravel(n=512):
    f1, f2, cid = voronoi(n, 3200, seed=91)
    cr = np.random.default_rng(92).random(cid.max() + 1)[cid]
    stone = np.clip(1 - f1 / 11, 0, 1) ** 0.5
    edge = np.clip((f2 - f1) / 3, 0, 1)
    dirt = fnoise(n, 2.4, 1, seed=93)
    grass = np.clip((fnoise(n, 2.6, 1, seed=94) - 0.62) * 4, 0, 1)
    gfine = fnoise(n, 0.3, 90, seed=95)
    col = tint(cr, (96, 90, 82), (170, 162, 150)) * (0.6 + 0.4 * edge[..., None])
    col *= (0.85 + 0.3 * dirt[..., None])
    gc = tint(gfine, (52, 62, 30), (98, 108, 52))
    col = col * (1 - grass[..., None]) + gc * grass[..., None]
    h = stone * edge * (1 - grass) + gfine * grass * 0.6
    rough = 0.9 - edge * 0.1
    save('gravel', col, h, 5.0, rough)

# ---------------------------------------------------------------- grey painted wall (room)
def wallpaint(n=512):
    big = fnoise(n, 2.4, 1, seed=101)
    fine = fnoise(n, 0.5, 50, seed=102)
    soot = np.clip((fnoise(n, 2.2, 1, seed=103, aniso=(1, 0.3)) - 0.45) * 2.0, 0, 1)
    sc = scratches(n, 160, 104, 0.1, 1.0)
    col = tint(big * 0.5 + fine * 0.5, (120, 118, 112), (150, 148, 140))
    col *= (1 - soot[..., None] * 0.45)
    col = col * (1 - sc[..., None] * 0.4) + lin((160, 158, 150)) * sc[..., None] * 0.4
    h = fine * 0.35 - sc * 0.5 + big * 0.1
    rough = 0.7 + fine * 0.15 - sc * 0.25 + soot * 0.1
    save('wall', col, h, 2.5, rough, sc * 0.6)

# ---------------------------------------------------------------- sprite / mask textures (PNG with alpha)
def sprites():
    n = 256
    # 2x2 atlas of soft puffs for smoke / steam
    atlas = np.zeros((n * 2, n * 2), np.float32)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.sqrt((xx - n / 2) ** 2 + (yy - n / 2) ** 2) / (n / 2)
    for i in range(4):
        nz = fnoise(n, 2.0, 2, seed=110 + i)
        nz2 = fnoise(n, 1.2, 8, seed=120 + i)
        rr = r + (nz - 0.5) * 0.55 + (nz2 - 0.5) * 0.18
        a = np.clip(1 - rr, 0, 1) ** 1.6
        a *= 0.7 + 0.6 * nz2
        a = np.clip(a, 0, 1)
        oy, ox = (i // 2) * n, (i % 2) * n
        atlas[oy:oy + n, ox:ox + n] = a
    rgba = np.zeros((n * 2, n * 2, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (atlas * 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'puff.png'), optimize=True)
    # tileable noise for flame / smoke / clouds shaders (RGB = 3 octave bands)
    m = 256
    a = fnoise(m, 2.0, 2, seed=131); b = fnoise(m, 1.6, 6, seed=132); c = fnoise(m, 1.0, 16, seed=133)
    img = (np.stack([a, b, c], -1) * 255).astype(np.uint8)
    Image.fromarray(img).save(os.path.join(OUT, 'noise.png'), optimize=True)
    # clouds (tileable, large)
    k = 1024
    cl = fnoise(k, 2.2, 2, seed=141) * 0.65 + fnoise(k, 1.6, 8, seed=142) * 0.35
    cl = np.clip((cl - 0.42) * 2.4, 0, 1)
    det = fnoise(k, 1.2, 24, seed=143)
    img = (np.stack([cl, det, fnoise(k, 2.0, 3, seed=144)], -1) * 255).astype(np.uint8)
    Image.fromarray(img).save(os.path.join(OUT, 'clouds.jpg'), quality=78)
    # hair strands (for ponytail cards / hair cap): R=color variation, alpha via G
    h = 256
    st = fnoise(h, 0.6, 30, seed=151, aniso=(1.0, 0.02))
    st2 = fnoise(h, 1.2, 6, seed=152, aniso=(1.0, 0.05))
    hh = norm01(st * 0.7 + st2 * 0.3)
    col = tint(hh, (26, 16, 10), (92, 60, 36))
    Image.fromarray((np.clip(col, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(os.path.join(OUT, 'hair_c.jpg'), quality=88)
    Image.fromarray(normal_from_height(hh, 4.0)).save(os.path.join(OUT, 'hair_n.jpg'), quality=90)
    print('wrote sprites')

if __name__ == '__main__':
    which = sys.argv[1:] or ['steel', 'concrete', 'canvas', 'leather', 'redpaint', 'wood', 'fur', 'hose', 'rubber', 'gravel', 'wallpaint', 'sprites']
    for w in which:
        globals()[w]()
