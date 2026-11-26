# -*- coding: utf-8 -*-
"""Procedural photo-like PBR textures for びんの中の小さな森.
All maps are tileable. Writes JPGs into ../tex/.
Each material: <name>_c.jpg (base color, sRGB), <name>_n.jpg (tangent normal, OpenGL +Y),
<name>_orm.jpg (R=AO, G=roughness, B=metalness).
"""
import os, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'tex')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(57)

# ---------------------------------------------------------------- helpers
def fftnoise(h, w, beta=2.0, seed=None, lo=0):
    r = np.random.default_rng(seed) if seed is not None else rng
    wn = r.standard_normal((h, w))
    F = np.fft.fft2(wn)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    filt = 1.0 / (f ** (beta / 2))
    if lo:
        filt *= (f > lo / max(h, w))
    filt[0, 0] = 0
    n = np.real(np.fft.ifft2(F * filt))
    n -= n.mean()
    n /= (n.std() + 1e-9)
    return n

def bandnoise(h, w, fmin, fmax, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    wn = r.standard_normal((h, w))
    F = np.fft.fft2(wn)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx * fx + fy * fy)
    m = np.exp(-((np.log(f + 1e-6) - np.log((fmin + fmax) / 2)) ** 2) / (2 * (np.log(fmax / fmin) / 2 + 0.2) ** 2))
    m[0, 0] = 0
    n = np.real(np.fft.ifft2(F * m))
    n -= n.mean(); n /= (n.std() + 1e-9)
    return n

def blur_wrap(a, sigma):
    """Gaussian blur with wrap-around via FFT."""
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * (sigma ** 2) * (fx * fx + fy * fy))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., i]) * g)) for i in range(a.shape[2])], -1)

def normal_from_height(hgt, strength):
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
    dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    nx = -dx * strength
    ny = dy * strength  # OpenGL convention (+Y up in texture = -row)
    nz = np.ones_like(hgt)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)

def ao_from_height(hgt, radius, power=1.0):
    b = blur_wrap(hgt, radius)
    cav = (hgt - b)
    cav = cav / (np.abs(cav).max() + 1e-9)
    ao = np.clip(1.0 + cav * 1.4, 0, 1) ** power
    b2 = blur_wrap(hgt, radius * 3)
    cav2 = (hgt - b2); cav2 /= (np.abs(cav2).max() + 1e-9)
    ao *= np.clip(1.0 + cav2 * 0.6, 0, 1)
    return ao

def save_rgb(a, name, q=86):
    a = np.asarray(a)
    if a.dtype != np.uint8:
        a = (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(a).save(os.path.join(OUT, name), quality=q, subsampling=0 if q >= 90 else 2)

def save_orm(ao, rough, metal, name, q=88):
    o = np.stack([ao, rough, metal if np.ndim(metal) else np.full_like(ao, metal)], -1)
    save_rgb(o, name, q)

def srgb(c):
    return np.array(c, dtype=np.float32) / 255.0

def lerp(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    return a + (b - a) * t

def resize(a, size):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)) if a.dtype != np.uint8 else Image.fromarray(a)
    return np.asarray(im.resize(size, Image.LANCZOS)).astype(np.float32) / 255.0

# ---------------------------------------------------------------- moss (hero)
def gen_moss(S=1024, SS=2):
    """Render a top-down cushion of moss shoots twice: dry (curled brown) and wet (open green).
    Same shoot layout so the shader blend looks like the same plant re-hydrating."""
    W = S * SS
    r = np.random.default_rng(101)
    n_shoots = 26000
    xs = r.random(n_shoots) * W
    ys = r.random(n_shoots) * W
    clump = (fftnoise(64, 64, 2.6, seed=7) * 0.5 + 0.5)
    hs = r.random(n_shoots)
    ci = clump[(ys / W * 64).astype(int) % 64, (xs / W * 64).astype(int) % 64]
    hs = np.clip(0.35 * hs + 0.65 * ci, 0, 1)
    order = np.argsort(hs)
    out = {}
    for state in ('dry', 'wet'):
        col = Image.new('RGB', (W, W), (40, 30, 18) if state == 'dry' else (22, 30, 10))
        hei = Image.new('L', (W, W), 0)
        dc = ImageDraw.Draw(col)
        dh = ImageDraw.Draw(hei)
        rr = np.random.default_rng(202)
        for i in order:
            x, y, hh = xs[i], ys[i], hs[i]
            base_r = (8 + 8 * rr.random()) * SS * (0.75 + 0.5 * hh)
            nleaf = 9 + int(rr.random() * 7)
            hue = rr.random()
            if state == 'dry':
                length = base_r * (0.75 + 0.3 * rr.random())
                twist = (rr.random() - 0.5) * 2.6
                c0 = np.array([110, 84, 52]) * (0.65 + 0.55 * hh) + np.array([18, 10, 0]) * hue
                c0 = c0 * (0.8 + 0.35 * rr.random())
                grey = rr.random() < 0.25
                if grey:
                    c0 = c0 * 0.6 + np.array([120, 112, 98]) * 0.4
                width = max(1, int(1.2 * SS))
            else:
                length = base_r * (1.0 + 0.35 * rr.random())
                twist = (rr.random() - 0.5) * 0.4
                c0 = np.array([62, 104, 30]) * (0.5 + 0.6 * hh) + np.array([22, 14, -6]) * hue
                c0 = c0 * (0.85 + 0.3 * rr.random())
                width = max(1, int(1.7 * SS))
            ang0 = rr.random() * math.tau
            for k in range(nleaf):
                # outer whorl first (lower), inner whorl later (higher)
                kk = k / nleaf
                a = ang0 + k * 2.39996 + twist * kk
                L = length * (1.0 - 0.55 * kk)
                if state == 'dry':
                    # curled: leaf bends sideways, short
                    pts = []
                    for t in np.linspace(0, 1, 5):
                        aa = a + twist * t * 1.5
                        rad = L * t * (1 - 0.3 * t)
                        pts.append((x + math.cos(aa) * rad, y + math.sin(aa) * rad))
                else:
                    pts = []
                    for t in np.linspace(0, 1, 5):
                        aa = a + 0.15 * math.sin(t * 3)
                        rad = L * t
                        pts.append((x + math.cos(aa) * rad, y + math.sin(aa) * rad))
                shade = 0.55 + 0.45 * kk
                tipc = c0 * shade
                if state == 'wet':
                    tipc = tipc + np.array([30, 38, 4]) * kk
                cc = tuple(int(v) for v in np.clip(tipc, 0, 255))
                hv = int(np.clip((hh * 0.6 + 0.4 * kk) * 235 + 10, 0, 255))
                for ox in (0, -W, W):
                    for oy in (0, -W, W):
                        if ox == 0 and oy == 0 or (x + ox > -L * 2 and x + ox < W + L * 2 and y + oy > -L * 2 and y + oy < W + L * 2):
                            p2 = [(px + ox, py + oy) for px, py in pts]
                            dc.line(p2, fill=cc, width=width)
                            dh.line(p2, fill=hv, width=width)
            # bright tip dot (apical bud)
            cc = tuple(int(v) for v in np.clip(c0 * (1.25 if state == 'wet' else 1.05) + (np.array([25, 30, 0]) if state == 'wet' else 0), 0, 255))
            rr2 = 1.6 * SS
            dc.ellipse([x - rr2, y - rr2, x + rr2, y + rr2], fill=cc)
            dh.ellipse([x - rr2, y - rr2, x + rr2, y + rr2], fill=int(min(255, hh * 235 + 20)))
        c = np.asarray(col.resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
        h = np.asarray(hei.resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
        out[state] = (c, h)
    # combine
    cd, hd = out['dry']
    cw, hw = out['wet']
    hgt = hd * 0.5 + hw * 0.5
    hgt = blur_wrap(hgt, 0.6)
    ao = ao_from_height(hgt, 6, 1.2)
    # gaps get darker; variations
    var = fftnoise(S, S, 2.2, seed=3)[..., None]
    cd = cd * (1 + 0.10 * var) * (0.55 + 0.45 * ao[..., None])
    cw = cw * (1 + 0.08 * var) * (0.5 + 0.5 * ao[..., None])
    # a few bits of soil / dead material in dry
    save_rgb(cd, 'moss_dry_c.jpg', 88)
    save_rgb(cw, 'moss_wet_c.jpg', 88)
    save_rgb(normal_from_height(hgt, 9.0), 'moss_n.jpg', 92)
    rough = 0.85 + 0.12 * (1 - hgt)
    save_orm(ao, rough, 0.0, 'moss_orm.jpg')
    # low-res previews
    for nm, a in (('moss_dry_c', cd), ('moss_wet_c', cw)):
        Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, nm + '_lo.jpg'), quality=80)
    print('moss done')

# ---------------------------------------------------------------- oak table (non-repeating 2048x1024)
def gen_oak(W=2048, H=1024):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    planks = 4
    ph = H / planks
    pid = (yy // ph).astype(int)
    py = (yy % ph) / ph
    col = np.zeros((H, W, 3), np.float32)
    hgt = np.zeros((H, W), np.float32)
    rough = np.zeros((H, W), np.float32)
    warp = fftnoise(H, W, 3.2, seed=11)
    warp2 = fftnoise(H, W, 2.4, seed=12)
    fine = fftnoise(H, W, 0.6, seed=13)
    for p in range(planks):
        r = np.random.default_rng(300 + p)
        m = pid == p
        offs = r.random() * 100
        tone = 0.9 + 0.16 * r.random()
        # anisotropic noise: smooth along x (grain direction), detailed across y
        def aniso(seed, nx, beta):
            a = fftnoise(H, nx, beta, seed=seed)
            return np.asarray(Image.fromarray(a.astype(np.float32)).resize((W, H), Image.BICUBIC))
        a1 = aniso(600 + p, 64, 2.0)
        a2 = aniso(700 + p, 256, 1.0)
        a3 = aniso(800 + p, 128, 2.8)
        v = py * (2.5 + 2 * r.random()) + 0.18 * a3 + 0.08 * np.sin(xx / W * (3 + 2 * r.random()) + offs)
        cath = 1.5 * np.abs(py - 0.4 - 0.2 * np.sin(xx / W * 2.2 + offs)) 
        rings = np.sin((v * 4 + cath * 6 + offs) * math.pi)
        late = np.clip(rings * 0.5 + 0.5, 0, 1) ** 3.0
        streak = np.clip(a2 * 0.5, 0, 1) ** 2
        base = srgb([172, 126, 84]) * tone
        dark = srgb([146, 100, 62]) * tone
        c = base[None, None, :] * (1 - late[..., None]) + dark[None, None, :] * late[..., None]
        c *= (1 - 0.10 * streak[..., None]) * (1 + 0.09 * a1[..., None])
        # pores: tiny dark dashes
        pn = bandnoise(H, W // 8, 40, 160, seed=400 + p)
        pn = np.asarray(Image.fromarray(pn.astype(np.float32)).resize((W, H), Image.BICUBIC))
        pores = np.clip(pn - 1.8, 0, 1)
        c *= (1 - 0.4 * pores[..., None])
        fl = np.clip(bandnoise(H, W, 50, 120, seed=500 + p) - 2.4, 0, 1)
        c += fl[..., None] * srgb([24, 18, 10])
        c *= (1 + 0.04 * fine[..., None])
        col[m] = c[m]
        hgt[m] = (0.4 * (1 - late) - 0.5 * pores - 0.1 * streak)[m]
        rough[m] = (0.40 + 0.10 * late + 0.25 * pores)[m]
    # plank seams
    seam = np.minimum(py, 1 - py) * ph
    sg = np.exp(-(seam / 1.6) ** 2)
    hgt -= sg * 1.5
    col *= (1 - 0.55 * sg[..., None])
    # stretch grain along x: blur in x
    col = np.stack([np.asarray(Image.fromarray(col[..., i]).filter(ImageFilter.BoxBlur(0))) for i in range(3)], -1)
    # micro scratches (varnish)
    sc = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(sc)
    r = np.random.default_rng(77)
    for _ in range(900):
        x0, y0 = r.random() * W, r.random() * H
        a = r.normal(0, 0.6)
        L = 20 + r.random() * 160
        d.line([(x0, y0), (x0 + math.cos(a) * L, y0 + math.sin(a) * L)], fill=int(40 + r.random() * 90), width=1)
    sc = np.asarray(sc).astype(np.float32) / 255
    rough = np.clip(rough + sc * 0.25, 0, 1)
    # wear: slightly lighter and rougher in center use area
    wear = np.clip(fftnoise(H, W, 3.0, seed=78) * 0.5 + 0.2, 0, 1)
    rough = np.clip(rough + wear * 0.08, 0, 1)
    ao = ao_from_height(blur_wrap(hgt, 1.0), 3, 1.0) * (1 - 0.4 * sg)
    save_rgb(col, 'oak_c.jpg', 82)
    nrm = normal_from_height(blur_wrap(hgt, 0.7) - sc * 0.15, 3.0)
    Image.fromarray(nrm).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(OUT, 'oak_n.jpg'), quality=86)
    orm = (np.stack([ao, rough, np.zeros_like(ao)], -1).clip(0, 1) * 255).astype(np.uint8)
    Image.fromarray(orm).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(OUT, 'oak_orm.jpg'), quality=84)
    print('oak done')

# ---------------------------------------------------------------- plaster wall
def gen_plaster(S=512):
    n1 = fftnoise(S, S, 2.0, seed=21)
    n2 = fftnoise(S, S, 1.2, seed=22)
    n3 = bandnoise(S, S, 60, 200, seed=23)
    hgt = 0.5 * n1 + 0.3 * n2 + 0.25 * np.clip(n3, -1, 3)
    trowel = np.clip(fftnoise(S, S, 3.5, seed=24), -0.5, 2)
    hgt += 0.5 * np.round(trowel * 2) / 2
    base = srgb([226, 214, 196])
    c = base[None, None, :] * (1 + 0.035 * n1[..., None] + 0.02 * n2[..., None])
    c -= 0.03 * np.clip(-n3, 0, 3)[..., None]
    ao = ao_from_height(hgt, 4, 0.8)
    save_rgb(c * (0.85 + 0.15 * ao[..., None]), 'plaster_c.jpg', 84)
    save_rgb(normal_from_height(hgt, 1.0), 'plaster_n.jpg', 86)
    save_orm(ao, 0.88 + 0.08 * n2.clip(-1, 1), 0.0, 'plaster_orm.jpg')
    print('plaster done')

# ---------------------------------------------------------------- painted wood (window frame)
def gen_paintwood(S=512):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    warp = fftnoise(S, S, 3.0, seed=31)
    grain = np.sin((yy / S * 40 + warp * 1.4) * math.pi)
    brush = bandnoise(S, S, 20, 120, seed=32)
    brush = blur_wrap(brush, 0.5)
    hgt = 0.25 * grain + 0.35 * np.array(Image.fromarray(brush).resize((S, S)))
    # chip
    chips = np.clip(fftnoise(S, S, 1.6, seed=33) - 2.6, 0, 1) > 0
    base = srgb([236, 232, 222])
    c = np.ones((S, S, 3), np.float32) * base
    c *= (1 + 0.02 * brush[..., None])
    wood = srgb([150, 120, 86])
    c[chips] = wood
    hgt[chips] -= 1.5
    ao = ao_from_height(hgt, 3)
    save_rgb(c * (0.9 + 0.1 * ao[..., None]), 'paint_c.jpg', 84)
    save_rgb(normal_from_height(hgt, 1.2), 'paint_n.jpg', 86)
    rough = np.where(chips, 0.8, 0.42 + 0.06 * brush)
    save_orm(ao, rough, 0.0, 'paint_orm.jpg')
    print('paint done')

# ---------------------------------------------------------------- soil strata band (jar side)
def gen_strata(W=1024, H=256):
    """Seen through the glass: gravel bottom, charcoal, dark soil with roots & perlite, moss on top."""
    img = Image.new('RGB', (W, H), (40, 30, 22))
    hi = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img); dh = ImageDraw.Draw(hi)
    r = np.random.default_rng(41)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / H  # 0 top .. 1 bottom ; band spans y=0.0..0.085 world (top=0.085)
    edge1 = 0.62 + 0.03 * fftnoise(1, W, 2, seed=1)[0]  # soil/charcoal boundary
    edge2 = 0.74 + 0.025 * fftnoise(1, W, 2, seed=2)[0]  # charcoal/gravel
    soil = fftnoise(H, W, 1.0, seed=42)
    base = np.zeros((H, W, 3), np.float32)
    soilc = srgb([58, 42, 30]) * (1 + 0.15 * soil[..., None])
    base[:] = soilc
    base = base.copy()
    # draw particles
    arr = (base * 255).astype(np.uint8)
    img = Image.fromarray(arr)
    d = ImageDraw.Draw(img)
    for _ in range(5000):  # soil grains & perlite
        x, y = r.random() * W, r.random() * H * 0.62
        rad = r.random() ** 3 * 4 + 0.6
        if r.random() < 0.06:
            c = (205, 200, 190)
        else:
            g = int(30 + r.random() * 50)
            c = (g + 12, g, int(g * 0.75))
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=c)
        dh.ellipse([x - rad, y - rad, x + rad, y + rad], fill=int(100 + rad * 30))
    for _ in range(40):  # fine roots
        x, y = r.random() * W, r.random() * H * 0.25
        pts = [(x, y)]
        for k in range(12):
            x += r.normal(0, 3); y += 3 + r.random() * 4
            pts.append((x, y))
        d.line(pts, fill=(150, 120, 80), width=1)
    arr = np.asarray(img).astype(np.float32) / 255
    # charcoal layer
    m1 = (v >= edge1[None, :]) & (v < edge2[None, :])
    m2 = v >= edge2[None, :]
    img = Image.fromarray((arr * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for _ in range(1400):
        x = r.random() * W
        e1 = edge1[int(x) % W] * H; e2 = edge2[int(x) % W] * H
        y = e1 + r.random() * (e2 - e1)
        rad = 2 + r.random() * 5
        g = int(18 + r.random() * 25)
        pts = [(x + math.cos(a) * rad * (0.6 + 0.5 * r.random()), y + math.sin(a) * rad * (0.6 + 0.5 * r.random())) for a in np.linspace(0, math.tau, 6)[:-1]]
        d.polygon(pts, fill=(g, g, g + 2))
        dh.polygon(pts, fill=150)
    for _ in range(1300):  # gravel
        x = r.random() * W
        e2 = edge2[int(x) % W] * H
        y = e2 + r.random() * (H - e2)
        rad = 3 + r.random() * 7
        t = r.random()
        base_c = np.array([150, 140, 125]) * (0.6 + 0.5 * t) + np.array([20, 5, -10]) * r.random()
        for k in range(4):
            cc = tuple(int(c) for c in np.clip(base_c * (0.7 + 0.1 * k), 0, 255))
            rk = rad * (1 - k * 0.22)
            d.ellipse([x - rad * 1.1 + k * 0.6, y - rk, x + rad * 1.1 - k * 0.6, y + rk * 0.9], fill=cc)
            dh.ellipse([x - rad * 1.1, y - rk, x + rad * 1.1, y + rk * 0.9], fill=int(120 + 30 * k))
    c = np.asarray(img).astype(np.float32) / 255
    h = np.asarray(hi).astype(np.float32) / 255
    h = blur_wrap(h, 1.0)
    ao = ao_from_height(h, 4, 1.4)
    c *= (0.6 + 0.4 * ao[..., None])
    save_rgb(c, 'strata_c.jpg', 85)
    save_rgb(normal_from_height(h, 4.0), 'strata_n.jpg', 85)
    print('strata done')

# ---------------------------------------------------------------- stone (pebbles)
def gen_stone(S=512):
    n1 = fftnoise(S, S, 2.4, seed=51)
    n2 = fftnoise(S, S, 0.8, seed=52)
    speck = bandnoise(S, S, 80, 220, seed=53)
    hgt = 0.3 * n1 + 0.12 * n2
    c = np.ones((S, S, 3), np.float32) * srgb([168, 160, 148])
    c *= (1 + 0.12 * n1[..., None])
    c[speck > 1.6] *= 0.55
    c[speck < -2.1] = c[speck < -2.1] * 0.5 + srgb([235, 230, 220]) * 0.5
    veins = np.abs(np.sin((fftnoise(S, S, 3, seed=54) * 2.5) * math.pi))
    vm = veins < 0.06
    c[vm] = c[vm] * 0.6 + srgb([230, 226, 214]) * 0.4
    ao = ao_from_height(hgt, 4, 0.7)
    save_rgb(c, 'stone_c.jpg', 85)
    save_rgb(normal_from_height(hgt + 0.08 * speck, 1.4), 'stone_n.jpg', 86)
    save_orm(ao, 0.55 + 0.15 * n2.clip(-1, 1), 0.0, 'stone_orm.jpg')
    print('stone done')

# ---------------------------------------------------------------- bark (twigs)
def gen_bark(W=256, H=512):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    n = fftnoise(H, W, 2.0, seed=61)
    ridge = bandnoise(H, W, 6, 30, seed=62)
    # stretch along v (length of twig)
    ridge = np.asarray(Image.fromarray(ridge).resize((W, H // 6)).resize((W, H), Image.BICUBIC))
    cracks = np.clip(np.abs(ridge) < 0.15, 0, 1).astype(np.float32)
    hgt = 0.6 * np.abs(ridge) + 0.2 * n - 0.6 * cracks
    c = np.ones((H, W, 3), np.float32) * srgb([110, 86, 64])
    c *= (1 + 0.18 * n[..., None])
    c = c * (1 - 0.5 * cracks[..., None])
    lich = np.clip(fftnoise(H, W, 2.2, seed=63) - 1.6, 0, 1)
    c = c * (1 - lich[..., None]) + srgb([150, 152, 120]) * lich[..., None]
    ao = ao_from_height(hgt, 3, 1.0)
    save_rgb(c * (0.7 + 0.3 * ao[..., None]), 'bark_c.jpg', 85)
    save_rgb(normal_from_height(hgt, 2.0), 'bark_n.jpg', 85)
    print('bark done')

# ---------------------------------------------------------------- cotton twill (lab coat) / linen (curtain)
def gen_cloth(S=512):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    # twill: diagonal ribs
    p = 6.0
    twill = np.sin((xx + yy) / p * math.pi) * 0.5 + 0.5
    warp = np.sin(xx / 3.0 * math.pi) * 0.5 + 0.5
    weft = np.sin(yy / 3.0 * math.pi) * 0.5 + 0.5
    slub = fftnoise(S, S, 1.5, seed=71)
    hgt = 0.55 * twill + 0.25 * warp * weft + 0.08 * slub
    c = np.ones((S, S, 3), np.float32) * srgb([236, 236, 232])
    c *= (0.95 + 0.05 * hgt[..., None]) * (1 + 0.012 * slub[..., None])
    ao = ao_from_height(hgt, 2, 0.6)
    save_rgb(c, 'twill_c.jpg', 85)
    save_rgb(normal_from_height(hgt, 1.6), 'twill_n.jpg', 86)
    # linen: irregular plain weave
    sl1 = np.asarray(Image.fromarray(fftnoise(S, 64, 1.5, seed=72)).resize((S, S), Image.BICUBIC))
    sl2 = np.asarray(Image.fromarray(fftnoise(64, S, 1.5, seed=73)).resize((S, S), Image.BICUBIC))
    a = np.sin(xx / 2.6 * math.pi + sl1 * 0.6)
    b = np.sin(yy / 2.6 * math.pi + sl2 * 0.6)
    over = (np.sign(np.sin(xx / 2.6 * math.pi / 2) * np.sin(yy / 2.6 * math.pi / 2)))
    hgt2 = np.where(over > 0, a * 0.5 + 0.5, b * 0.5 + 0.5) + 0.35 * (sl1 + sl2) * 0.3
    c2 = np.ones((S, S, 3), np.float32) * srgb([232, 224, 206])
    c2 *= (0.9 + 0.1 * hgt2[..., None]) * (1 + 0.04 * (sl1 + sl2)[..., None])
    save_rgb(c2, 'linen_c.jpg', 85)
    save_rgb(normal_from_height(hgt2, 1.3), 'linen_n.jpg', 86)
    print('cloth done')

# ---------------------------------------------------------------- knit (girl's sweater/leggings), flannel (dad), denim
def gen_knit(S=512):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cw, ch = 16.0, 12.0
    cx = (xx % cw) / cw
    cy = (yy % ch) / ch
    # V-shaped stitch: two legs
    leg = np.abs((cx - 0.5) * 2)
    v = np.abs(leg - (1 - cy) * 0.55 - 0.25)
    stitch = np.clip(1 - v * 3.2, 0, 1) ** 0.7
    fuzz = fftnoise(S, S, 0.5, seed=81)
    hgt = stitch + 0.08 * fuzz
    save_rgb(normal_from_height(blur_wrap(hgt, 0.8), 2.2), 'knit_n.jpg', 86)
    ao = ao_from_height(hgt, 2, 1.0)
    save_orm(ao, 0.92 + 0.0 * ao, 0.0, 'knit_orm.jpg')
    # flannel check
    sx = (xx % 128) / 128; sy = (yy % 128) / 128
    band = lambda t, a, b: ((t > a) & (t < b)).astype(np.float32)
    bx = band(sx, 0.0, 0.42) * 0.6 + band(sx, 0.55, 0.62) * 0.4
    by = band(sy, 0.0, 0.42) * 0.6 + band(sy, 0.55, 0.62) * 0.4
    base = srgb([62, 88, 118])
    red = srgb([142, 64, 52])
    cream = srgb([214, 206, 186])
    c = np.ones((S, S, 3), np.float32) * base
    c = lerp(c, red, np.clip(bx * 0.75 + by * 0.75, 0, 1))
    c = lerp(c, cream, band(sx, 0.7, 0.72) * 0.7 + band(sy, 0.7, 0.72) * 0.7)
    tw = np.sin((xx + yy) / 3.0 * math.pi) * 0.5 + 0.5
    fz = fftnoise(S, S, 0.7, seed=82)
    c *= (0.9 + 0.1 * tw[..., None]) * (1 + 0.05 * fz[..., None])
    save_rgb(c, 'flannel_c.jpg', 85)
    save_rgb(normal_from_height(tw * 0.5 + fz * 0.2, 1.0), 'flannel_n.jpg', 85)
    # denim
    tw2 = np.sin((xx * 1.0 - yy * 0.5) / 2.2 * math.pi) * 0.5 + 0.5
    sl = np.asarray(Image.fromarray(fftnoise(S, 32, 1.0, seed=83)).resize((S, S), Image.BICUBIC))
    c = srgb([46, 62, 92]) * (0.75 + 0.35 * tw2[..., None]) * (1 + 0.12 * sl[..., None])
    c = lerp(c, srgb([150, 160, 180]), np.clip((1 - tw2) * 0.15 + 0.05 * sl, 0, 0.3))
    save_rgb(c, 'denim_c.jpg', 85)
    save_rgb(normal_from_height(tw2 + 0.2 * sl, 1.2), 'denim_n.jpg', 85)
    print('knit/flannel/denim done')

# ---------------------------------------------------------------- skin & hair detail normals
def gen_skin(S=512):
    pores = bandnoise(S, S, 90, 200, seed=91)
    pores = np.clip(-pores - 1.2, 0, 3)
    cells = bandnoise(S, S, 20, 50, seed=92)
    lines = np.abs(np.sin(fftnoise(S, S, 2.6, seed=93) * 6))
    hgt = -0.4 * pores + 0.15 * cells - 0.25 * (lines < 0.1)
    save_rgb(normal_from_height(blur_wrap(hgt, 0.7), 1.2), 'skin_n.jpg', 86)
    # skin color variation map (subtle redness / freckle-free)
    var = fftnoise(S, S, 2.0, seed=94)
    c = np.ones((S, S, 3), np.float32) * srgb([232, 186, 160])
    c = lerp(c, srgb([222, 160, 140]), np.clip(var * 0.3 + 0.3, 0, 1))
    c *= (1 - 0.06 * pores[..., None])
    save_rgb(c, 'skin_c.jpg', 85)
    # hair: strands along v
    H, W = 512, 256
    st = np.asarray(Image.fromarray(fftnoise(8, W, 0.9, seed=95)).resize((W, H), Image.BICUBIC))
    st2 = np.asarray(Image.fromarray(fftnoise(32, W, 0.5, seed=96)).resize((W, H), Image.BICUBIC))
    hgt = st * 0.7 + 0.4 * st2
    save_rgb(normal_from_height(hgt, 2.5), 'hair_n.jpg', 86)
    c = np.ones((H, W, 3), np.float32) * srgb([60, 38, 24])
    c *= (0.8 + 0.25 * (st[..., None] * 0.5 + 0.5)) * (1 + 0.1 * st2[..., None])
    save_rgb(c, 'hair_c.jpg', 85)
    print('skin/hair done')

# ---------------------------------------------------------------- metal (brass / painted steel) scratches
def gen_metal(S=512):
    sc = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(sc)
    r = np.random.default_rng(111)
    for _ in range(1400):
        x0, y0 = r.random() * S, r.random() * S
        a = r.random() * math.pi
        L = 3 + r.random() ** 2 * 60
        d.line([(x0, y0), (x0 + math.cos(a) * L, y0 + math.sin(a) * L)], fill=int(60 + r.random() * 160), width=1)
    sc = np.asarray(sc).astype(np.float32) / 255
    brushed = np.asarray(Image.fromarray(fftnoise(S, 16, 0.8, seed=112)).resize((S, S), Image.BICUBIC))
    smudge = np.clip(fftnoise(S, S, 2.6, seed=113) * 0.5 + 0.5, 0, 1)
    rough = np.clip(0.22 + 0.25 * smudge + 0.35 * sc + 0.04 * brushed, 0, 1)
    ao = 1 - 0.25 * sc
    save_orm(ao, rough, 1.0, 'metal_orm.jpg')
    save_rgb(normal_from_height(-sc * 0.6 + 0.05 * brushed, 2.0), 'metal_n.jpg', 86)
    print('metal done')

# ---------------------------------------------------------------- ceramic dish, house wood, shingles, cork
def gen_misc():
    S = 256
    n = fftnoise(S, S, 2.0, seed=121)
    sp = bandnoise(S, S, 60, 120, seed=122)
    c = np.ones((S, S, 3), np.float32) * srgb([222, 214, 198]) * (1 + 0.03 * n[..., None])
    c[sp > 2.2] *= 0.55
    save_rgb(c, 'ceramic_c.jpg', 85)
    save_rgb(normal_from_height(0.2 * n + 0.1 * (sp > 2.2), 0.6), 'ceramic_n.jpg', 85)
    # clapboard siding (house) - horizontal boards with weathered paint
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    by = (yy % 32) / 32
    board = by * 0.8
    grain = fftnoise(S, S, 2.6, seed=123)
    gs = np.asarray(Image.fromarray(grain).resize((S, 16)).resize((S, S), Image.BICUBIC))
    hgt = board + 0.1 * gs - 0.6 * (by < 0.06)
    c = np.ones((S, S, 3), np.float32) * srgb([214, 196, 160]) * (1 + 0.08 * gs[..., None])
    c *= (1 - 0.45 * (by < 0.06))[..., None]
    save_rgb(c, 'siding_c.jpg', 85)
    save_rgb(normal_from_height(hgt, 3.0), 'siding_n.jpg', 85)
    # roof shingles
    row = (yy // 24).astype(int)
    off = (row % 2) * 16
    sx = ((xx + off) % 32) / 32
    sy = (yy % 24) / 24
    t = np.random.default_rng(124).random((S // 24 + 2, S // 32 + 2))
    tone = t[row, (((xx + off) // 32).astype(int)) % t.shape[1]]
    hgt = sy * 0.9 - 0.8 * ((sx < 0.06) | (sx > 0.96)) + 0.15 * grain
    c = np.ones((S, S, 3), np.float32) * srgb([118, 72, 56]) * (0.75 + 0.35 * tone[..., None]) * (1 + 0.08 * grain[..., None])
    c *= (0.6 + 0.4 * sy)[..., None]
    save_rgb(c, 'roof_c.jpg', 85)
    save_rgb(normal_from_height(hgt, 3.0), 'roof_n.jpg', 85)
    # cork
    ck = bandnoise(S, S, 25, 90, seed=125)
    c = np.ones((S, S, 3), np.float32) * srgb([176, 132, 88]) * (1 + 0.15 * ck[..., None])
    c[ck < -1.5] *= 0.55
    save_rgb(c, 'cork_c.jpg', 85)
    save_rgb(normal_from_height(ck * 0.4, 2.0), 'cork_n.jpg', 85)
    print('misc done')

# ---------------------------------------------------------------- outside window: out-of-focus morning garden
def gen_backdrop(W=1024, H=768):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / H; u = xx / W
    sky = lerp(srgb([170, 196, 220]), srgb([236, 226, 205]), np.clip(v * 1.6, 0, 1))
    img = sky.copy()
    # sun glow upper left
    sd = np.sqrt((u - 0.18) ** 2 + ((v - 0.12) * 0.8) ** 2)
    img += srgb([255, 220, 170]) * np.exp(-sd * 5.0)[..., None] * 0.9
    # trees: big soft blobs of greens
    tree = np.zeros((H, W), np.float32)
    n = fftnoise(H, W, 3.0, seed=131)
    canopy = (v > 0.18 + 0.12 * np.sin(u * 5 + 1) + 0.08 * n)
    tree = blur_wrap(canopy.astype(np.float32), 14)
    green = lerp(srgb([70, 92, 52]), srgb([128, 140, 80]), np.clip(n * 0.4 + 0.5, 0, 1))
    green = green * (0.75 + 0.5 * np.clip(1 - u, 0, 1))[..., None]
    img = lerp(img, green, tree * 0.9)
    # hedge lower
    hedge = blur_wrap((v > 0.62 + 0.03 * n).astype(np.float32), 10)
    img = lerp(img, srgb([62, 80, 44]) * (1 + 0.2 * n[..., None]), hedge * 0.85)
    # bokeh discs (sunlight through leaves)
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    over = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(over)
    r = np.random.default_rng(132)
    for _ in range(140):
        x, y = r.random() * W, (0.12 + r.random() * 0.55) * H
        rad = 8 + r.random() * 26
        b = int(40 + r.random() * 90)
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(b, int(b * 0.95), int(b * 0.75)))
    over = over.filter(ImageFilter.GaussianBlur(2.5))
    im = Image.fromarray(np.clip(np.asarray(im).astype(np.int32) + np.asarray(over).astype(np.int32) // 2, 0, 255).astype(np.uint8))
    im = im.filter(ImageFilter.GaussianBlur(3))
    im.save(os.path.join(OUT, 'garden_c.jpg'), quality=84)
    print('backdrop done')

if __name__ == '__main__':
    which = sys.argv[1:] or ['moss', 'oak', 'plaster', 'paint', 'strata', 'stone', 'bark', 'cloth', 'knit', 'skin', 'metal', 'misc', 'backdrop']
    fns = dict(moss=gen_moss, oak=gen_oak, plaster=gen_plaster, paint=gen_paintwood, strata=gen_strata, stone=gen_stone,
               bark=gen_bark, cloth=gen_cloth, knit=gen_knit, skin=gen_skin, metal=gen_metal, misc=gen_misc, backdrop=gen_backdrop)
    for w in which:
        fns[w]()
