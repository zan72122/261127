#!/usr/bin/env python3
"""Procedural photo-like PBR textures for 'おちばを はいて やまにしよう'.
Generates tileable albedo / normal / ORM (R=AO, G=roughness, B=metal) maps.
Run:  python3 tools/gen_textures.py   (writes into ../tex)
"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tex')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(59)


# ---------------------------------------------------------------- helpers
def spectral_noise(h, w, beta=2.0, seed=None, aniso=(1.0, 1.0)):
    """Tileable fBm-like noise via spectral synthesis. beta: 1/f^beta falloff."""
    r = np.random.default_rng(seed) if seed is not None else rng
    fy = np.fft.fftfreq(h)[:, None] * aniso[0]
    fx = np.fft.fftfreq(w)[None, :] * aniso[1]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    amp = 1.0 / (f ** (beta / 2.0))
    amp[0, 0] = 0
    ph = r.uniform(0, 2 * np.pi, (h, w))
    spec = amp * np.exp(1j * ph)
    n = np.real(np.fft.ifft2(spec))
    n = (n - n.mean()) / (n.std() + 1e-9)
    return n


def band_noise(h, w, lo, hi, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx * fx + fy * fy)
    mask = ((f >= lo) & (f <= hi)).astype(float)
    spec = mask * np.exp(1j * r.uniform(0, 2 * np.pi, (h, w)))
    n = np.real(np.fft.ifft2(spec))
    return (n - n.mean()) / (n.std() + 1e-9)


def blur_wrap(a, sigma):
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx * fx + fy * fy))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * g)) for c in range(a.shape[2])], -1)


def normal_from_height(hgt, strength, wrap=True):
    if wrap:
        dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
        dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    else:
        dx = np.gradient(hgt, axis=1)
        dy = np.gradient(hgt, axis=0)
    nx = -dx * strength
    ny = dy * strength  # OpenGL convention (green up)
    nz = np.ones_like(hgt)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)


def save_rgb(a, name, q=86):
    a = np.clip(a, 0, 1) if a.dtype != np.uint8 else a
    if a.dtype != np.uint8:
        a = (a * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(a)
    p = os.path.join(OUT, name)
    if name.endswith('.jpg'):
        im.save(p, quality=q, optimize=True, progressive=True)
    else:
        im.save(p, optimize=True)
    print('wrote', name, im.size)


def srgb(c):
    return np.array(c, dtype=float) / 255.0


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- cobblestone (granite setts)
def gen_cobble(N=1024):
    # tile = 1m x 1m ; rows of setts ~ 10cm high, running bond
    px = N / 1.0
    H = np.zeros((N, N))
    stone_id = -np.ones((N, N), int)
    tone = []
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    rows = 9
    # row boundaries: varying heights, wavy (tileable: wave periods divide N)
    hs = rng.uniform(0.85, 1.15, rows); hs = hs / hs.sum() * N
    bounds = np.concatenate([[0], np.cumsum(hs)])
    sid = 0
    edge_noise = spectral_noise(N, N, 2.6, seed=3) * 0.004 * px + band_noise(N, N, 40, 120, seed=33) * 0.0015 * px
    ripple = spectral_noise(N, N, 1.6, seed=4)
    dist_field = np.full((N, N), -1e9)
    wave = lambda x, r: (np.sin(x / N * 2 * np.pi * 2 + r * 1.7) * 0.012 + np.sin(x / N * 2 * np.pi * 3 + r) * 0.006) * px
    for r in range(rows):
        y0, y1 = bounds[r], bounds[r + 1]
        widths = []
        total = 0
        while total < N - 0.16 * px:
            wv = rng.uniform(0.085, 0.16) * px
            widths.append(wv); total += wv
        sc = N / sum(widths)
        widths = [w_ * sc for w_ in widths]
        x0 = rng.uniform(0, N)
        for wv in widths:
            cx = (x0 + wv / 2) % N
            cy = (y0 + y1) / 2 + (wave(cx, r) + wave(cx, r + 1)) * 0.5
            gap = rng.uniform(0.0025, 0.0055) * px
            hw = wv / 2 - gap
            hh = (y1 - y0) / 2 - gap * rng.uniform(0.8, 1.3)
            ang = rng.uniform(-0.06, 0.06)
            dx = (xx - cx + N / 2) % N - N / 2
            dy = (yy - cy + N / 2) % N - N / 2
            rx = dx * np.cos(ang) - dy * np.sin(ang)
            ry = dx * np.sin(ang) + dy * np.cos(ang)
            rad = rng.uniform(0.015, 0.03) * px
            qx = np.abs(rx) - (hw - rad)
            qy = np.abs(ry) - (hh - rad)
            ox = np.maximum(qx, 0); oy = np.maximum(qy, 0)
            sd = np.sqrt(ox * ox + oy * oy) + np.minimum(np.maximum(qx, qy), 0) - rad
            sd = sd + edge_noise
            inside = -sd
            m = inside > dist_field
            dist_field[m] = inside[m]
            stone_id[m & (inside > 0)] = sid
            tone.append((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
            sid += 1
            x0 += wv
    inside = np.clip(dist_field / px, -0.02, 0.05)
    # dome profile: rises quickly near edge, flat-ish top with wear
    prof = smoothstep(0.0, 0.035, inside) * 0.9 + smoothstep(0.0, 0.006, inside) * 0.1
    tilt = np.zeros((N, N))
    ids = stone_id.copy()
    ids[ids < 0] = 0
    t = np.array(tone)
    tilt_x = t[ids, 3]
    tilt_y = t[ids, 4]
    tilt = (tilt_x * ((xx % 100) / 100.0 - 0.5) + tilt_y * ((yy % 100) / 100.0 - 0.5)) * 0.15
    grain = spectral_noise(N, N, 1.2, seed=5)
    micro = spectral_noise(N, N, 0.6, seed=6)
    pits = (band_noise(N, N, 180, 400, seed=7) > 2.2).astype(float)
    pits = blur_wrap(pits, 0.8)
    H = prof * (1.0 + 0.06 * ripple + tilt) + 0.025 * grain * prof + 0.008 * micro - 0.15 * pits * prof
    joint = 1.0 - smoothstep(0.0, 0.004, inside)
    sand = spectral_noise(N, N, 0.8, seed=8)
    H = H + joint * (0.04 * sand)
    # albedo
    base = np.zeros((N, N, 3))
    granite_a = srgb((122, 116, 108))
    granite_b = srgb((146, 134, 118))
    granite_c = srgb((100, 98, 96))
    w1 = (t[ids, 0] * 0.5 + 0.5)[..., None]
    w2 = (t[ids, 1] * 0.5 + 0.5)[..., None]
    w3 = t[ids, 2][..., None]
    col = lerp(lerp(granite_a, granite_b, w1), granite_c, w2 * 0.7)
    # a few pinkish / bluish / rusty setts like a real old courtyard
    col = np.where(w3 > 0.85, col * srgb((255, 236, 226)) * 1.05, col)
    col = np.where((w3 < 0.12), col * srgb((214, 222, 236)) * 0.92, col)
    rust = smoothstep(1.2, 2.4, spectral_noise(N, N, 2.2, seed=15))[..., None]
    col = lerp(col, col * srgb((200, 150, 110)), rust * 0.5)
    # granite speckle: black mica, white quartz, pinkish feldspar
    sp = band_noise(N, N, 120, 380, seed=9)
    sp2 = band_noise(N, N, 90, 300, seed=10)
    sp3 = band_noise(N, N, 60, 200, seed=11)
    col = col * (1 + 0.05 * grain[..., None])
    col = np.where((sp > 1.7)[..., None], col * 0.6, col)
    col = np.where((sp2 > 1.9)[..., None], col * 0.75 + srgb((190, 184, 172)) * 0.25, col)
    col = np.where((sp3 > 1.8)[..., None], col * 0.6 + srgb((176, 140, 120)) * 0.4, col)
    col = blur_wrap(col, 0.6)
    # dirt in low areas near joints & worn top lighter
    edge_dirt = (1 - smoothstep(0.0, 0.009, inside))[..., None]
    dirt_col = srgb((78, 68, 56))
    col = lerp(col, dirt_col, edge_dirt * 0.3)
    jcol = lerp(srgb((92, 80, 64)), srgb((124, 110, 88)), (sand * 0.5 + 0.5).clip(0, 1)[..., None])
    bits = band_noise(N, N, 140, 320, seed=16)
    jcol = np.where((bits > 2.2)[..., None], srgb((170, 120, 40)), jcol)
    jcol = np.where((bits < -2.3)[..., None], srgb((130, 50, 30)), jcol)
    moss = (spectral_noise(N, N, 2.0, seed=12) > 1.1).astype(float) * (band_noise(N, N, 100, 300, seed=13) > 0.2)
    jcol = lerp(jcol, srgb((64, 74, 40)), (moss * 0.6)[..., None])
    col = lerp(col, jcol, joint[..., None])
    stain = spectral_noise(N, N, 2.4, seed=14)
    col = col * (1 + 0.06 * stain[..., None])
    # AO from cavity
    hb = blur_wrap(H, 6)
    cav = np.clip((hb - H) * 6, 0, 1)
    ao = np.clip(1 - cav * 0.6 - joint * 0.22, 0.35, 1)
    rough = np.clip(0.78 + 0.08 * micro - 0.12 * smoothstep(0.02, 0.05, inside) + 0.17 * joint, 0.4, 1.0)
    save_rgb(np.clip(col, 0, 1), 'cobble_albedo.jpg')
    save_rgb(normal_from_height(H * 255 / 255.0 * 60, 1.0), 'cobble_normal.jpg', 86)
    save_rgb(np.stack([ao, rough, np.zeros_like(ao)], -1), 'cobble_orm.jpg')
    # joint mask (for wet puddles in joints): store as single channel png
    jm = (np.clip(joint + edge_dirt[..., 0] * 0.4, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(jm).save(os.path.join(OUT, 'cobble_joint.png'), optimize=True)
    print('wrote cobble_joint.png')
    # low-res preview versions (fast first screen)
    for n in ['cobble_albedo.jpg', 'cobble_normal.jpg', 'cobble_orm.jpg']:
        im = Image.open(os.path.join(OUT, n)).resize((256, 256), Image.LANCZOS)
        im.save(os.path.join(OUT, n.replace('.jpg', '_s.jpg')), quality=85)


# ---------------------------------------------------------------- leaves
LS = 512  # per leaf cell


def poly_mask(points, size, ss=3):
    im = Image.new('L', (size * ss, size * ss), 0)
    d = ImageDraw.Draw(im)
    d.polygon([(x * ss, y * ss) for x, y in points], fill=255)
    return np.asarray(im.resize((size, size), Image.LANCZOS), dtype=float) / 255.0


def lines_mask(segs, size, ss=3):
    im = Image.new('L', (size * ss, size * ss), 0)
    d = ImageDraw.Draw(im)
    for (x0, y0, x1, y1, wdt) in segs:
        d.line([(x0 * ss, y0 * ss), (x1 * ss, y1 * ss)], fill=255, width=max(1, int(wdt * ss)))
    return np.asarray(im.resize((size, size), Image.LANCZOS), dtype=float) / 255.0


def ginkgo(seed, deep=False):
    r = np.random.default_rng(seed)
    S = LS
    cx, cy = S * 0.5, S * 0.86  # petiole junction
    pts = []
    R = S * 0.42
    a0, a1 = math.radians(-150), math.radians(-30)
    n = 220
    notch = 0.25 if deep else 0.12
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        t = i / n
        rr = R * (0.99 + 0.012 * math.sin(t * 23 + seed) + 0.006 * math.sin(t * 71))
        # central notch
        rr *= 1 - notch * math.exp(-((t - 0.5) ** 2) / 0.0015)
        # wavy outer edge
        rr *= 1 + 0.018 * math.sin(t * 9 * math.pi)
        if t < 0.08 or t > 0.92: rr *= 0.97 + 0.03 * math.cos((min(t, 1 - t) / 0.08) * math.pi / 2)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * 1.02))
    # wedge sides toward petiole
    pts = [(cx - S * 0.02, cy - S * 0.02)] + pts + [(cx + S * 0.02, cy - S * 0.02)]
    mask = poly_mask(pts, S)
    stem = lines_mask([(cx, cy - S * 0.03, cx + S * 0.01, S * 0.995, S * 0.018)], S)
    # radiating dichotomous veins
    segs = []
    for i in range(70):
        a = a0 + (a1 - a0) * (i + 0.5) / 70 + r.normal() * 0.004
        segs.append((cx, cy - S * 0.03, cx + R * 1.05 * math.cos(a), cy + R * 1.05 * math.sin(a), 1.6))
    veins = lines_mask(segs, S) * mask
    return mask, stem, veins


def maple(seed, lobes=7):
    r = np.random.default_rng(seed)
    S = LS
    cx, cy = S * 0.5, S * 0.60
    lobe_angles = [math.radians(a) for a in (-90, -130, -50, -168, -12, 150, 30)][:lobes]
    lens = [0.36, 0.34, 0.34, 0.27, 0.27, 0.16, 0.16][:lobes]
    pts = []
    n = 1200
    for i in range(n):
        a = math.radians(-270) + math.radians(360) * i / n
        best = 0.0
        for la, ln in zip(lobe_angles, lens):
            dd = abs((a - la + math.pi) % (2 * math.pi) - math.pi)
            w = max(0.0, math.cos(min(dd / 0.36, 1.0) * math.pi / 2))
            best = max(best, ln * (w ** 1.6))
        rr = S * (0.085 + best)
        # fine double serration on lobe edges
        rr *= 1 + (0.028 * (0.5 + 0.5 * math.sin(i * 1.1 + seed))) * (best > 0.03)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    mask = poly_mask(pts, S)
    stem = lines_mask([(cx, cy + S * 0.04, cx - S * 0.02, S * 0.99, S * 0.014)], S)
    segs = []
    for la, ln in zip(lobe_angles, lens):
        tx, ty = cx + S * (0.07 + ln) * math.cos(la), cy + S * (0.07 + ln) * math.sin(la)
        segs.append((cx, cy, tx, ty, 3.0))
        for k in range(1, 6):
            t = k / 6
            px_, py_ = cx + (tx - cx) * t, cy + (ty - cy) * t
            for sgn in (-1, 1):
                a2 = la + sgn * 0.85
                l2 = S * 0.09 * (1 - t * 0.7) * (ln / 0.36)
                segs.append((px_, py_, px_ + l2 * math.cos(a2), py_ + l2 * math.sin(a2), 1.2))
    veins = lines_mask(segs, S) * mask
    return mask, stem, veins


def zelkova(seed):
    r = np.random.default_rng(seed)
    S = LS
    cx = S * 0.5
    top, bot = S * 0.04, S * 0.86
    pts_l, pts_r = [], []
    n = 260
    for i in range(n + 1):
        t = i / n
        y = top + (bot - top) * t
        wdt = S * 0.24 * (math.sin(math.pi * (t ** 0.75)) ** 0.9)
        ser = 1 + 0.06 * (((i * 0.35) % 1.0))
        bend = S * 0.03 * math.sin(t * math.pi)
        pts_r.append((cx + wdt * ser + bend, y))
        pts_l.append((cx - wdt * ser + bend, y))
    pts = pts_r + pts_l[::-1]
    mask = poly_mask(pts, S)
    stem = lines_mask([(cx, bot - 4, cx + 3, S * 0.995, S * 0.016)], S)
    segs = [(cx + S * 0.03 * math.sin(math.pi * 0.0), bot, cx, top + 8, 3.0)]
    for k in range(1, 13):
        t = k / 13
        y = bot - (bot - top) * t
        bend = S * 0.03 * math.sin((1 - t) * math.pi)
        wdt = S * 0.24 * (math.sin(math.pi * ((1 - t) ** 0.75)) ** 0.9)
        for sgn in (-1, 1):
            segs.append((cx + bend, y, cx + bend + sgn * wdt * 1.05, y - S * 0.07, 1.6))
    veins = lines_mask(segs, S) * mask
    return mask, stem, veins


def color_leaf(mask, stem, veins, palette, seed):
    S = LS
    r = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:S, 0:S] / S
    n1 = spectral_noise(S, S, 2.8, seed=seed)
    n2 = spectral_noise(S, S, 1.4, seed=seed + 1)
    spots = band_noise(S, S, 20, 60, seed=seed + 2)
    c0, c1, c2, cvein, cedge = [srgb(c) for c in palette]
    t = (n1 * 0.25 + 0.5 + (yy - 0.5) * 0.4).clip(0, 1)[..., None]
    col = lerp(c0, c1, t)
    col = lerp(col, c2, (smoothstep(0.6, 1.6, n2) * 0.6)[..., None])
    # edge browning
    m_bl = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), float) / 255
    edge = np.clip((1 - m_bl) * 2.2, 0, 1) * mask
    col = lerp(col, cedge, (edge * 0.8)[..., None])
    # small dark spots
    sp = (spots > 2.3).astype(float)
    sp = np.asarray(Image.fromarray((sp * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), float) / 255
    col = col * (1 - 0.45 * sp[..., None])
    col = lerp(col, cvein, (veins * 0.55)[..., None])
    col = np.where(stem[..., None] > 0.01, lerp(col, cvein * 0.85, stem[..., None]), col)
    alpha = np.clip(mask + stem, 0, 1)
    # height: lamina undulation, veins raised slightly, midrib
    hgt = 0.6 * spectral_noise(S, S, 3.0, seed=seed + 3) + 0.6 * veins + 0.4 * stem
    hgt += 0.15 * spectral_noise(S, S, 1.0, seed=seed + 4)
    hgt = hgt * alpha
    nrm = normal_from_height(blur_wrap(hgt, 0.8), 2.2, wrap=False)
    # translucency: veins glow (brighter), spots block
    trans = np.clip((0.62 + 0.38 * veins + 0.08 * n2) * (1 - 0.6 * sp) * (1 - 0.35 * edge), 0, 1) * alpha
    rough = np.clip(0.62 + 0.12 * n2 - 0.1 * veins, 0.35, 0.95)
    return col, alpha, nrm, trans, rough


def gen_leaves():
    cells = []
    # 0: ginkgo yellow
    m, s, v = ginkgo(101)
    cells.append(color_leaf(m, s, v, [(236, 190, 40), (222, 168, 22), (196, 172, 50), (250, 222, 120), (160, 110, 30)], 201))
    # 1: maple red
    m, s, v = maple(102)
    cells.append(color_leaf(m, s, v, [(196, 36, 28), (170, 22, 22), (214, 84, 30), (226, 110, 70), (100, 24, 18)], 202))
    # 2: zelkova brown
    m, s, v = zelkova(103)
    cells.append(color_leaf(m, s, v, [(150, 96, 52), (122, 74, 40), (176, 122, 60), (186, 140, 90), (80, 50, 28)], 203))
    # 3: ginkgo deep gold (notched)
    m, s, v = ginkgo(104, deep=True)
    cells.append(color_leaf(m, s, v, [(230, 172, 28), (214, 150, 20), (232, 200, 70), (252, 220, 110), (150, 96, 26)], 204))
    # 4: maple crimson-orange
    m, s, v = maple(105)
    cells.append(color_leaf(m, s, v, [(212, 60, 26), (184, 30, 30), (226, 120, 36), (236, 140, 80), (110, 32, 20)], 205))
    # 5: brown oak-ish (zelkova variant, darker)
    m, s, v = zelkova(106)
    cells.append(color_leaf(m, s, v, [(124, 80, 44), (100, 64, 36), (150, 104, 56), (170, 122, 80), (64, 40, 22)], 206))
    # atlas: 4 x 2 grid of 512 -> 2048 x 1024 (last two cells: duplicates w/ variation)
    while len(cells) < 8:
        cells.append(cells[len(cells) - 6])
    A = np.zeros((LS * 2, LS * 4, 4))
    Nm = np.zeros((LS * 2, LS * 4, 3), np.uint8)
    T = np.zeros((LS * 2, LS * 4, 3))
    for i, (col, alpha, nrm, trans, rough) in enumerate(cells):
        cx, cy = (i % 4) * LS, (i // 4) * LS
        A[cy:cy + LS, cx:cx + LS, :3] = col
        A[cy:cy + LS, cx:cx + LS, 3] = alpha
        Nm[cy:cy + LS, cx:cx + LS] = nrm
        T[cy:cy + LS, cx:cx + LS, 0] = trans
        T[cy:cy + LS, cx:cx + LS, 1] = rough
        T[cy:cy + LS, cx:cx + LS, 2] = alpha
    # bleed colour into transparent area to avoid dark fringes
    rgb = A[..., :3]
    a = A[..., 3:4]
    bl = blur_wrap(rgb * a, 6) / (blur_wrap(a, 6) + 1e-4)
    A[..., :3] = np.where(a > 0.02, rgb, bl)
    img = (np.clip(A, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(os.path.join(OUT, 'leaf_atlas.png'), optimize=True)
    Image.fromarray(img, 'RGBA').resize((512, 256), Image.LANCZOS).save(os.path.join(OUT, 'leaf_atlas_s.png'), optimize=True)
    Image.fromarray(Nm).resize((1024, 512), Image.LANCZOS).save(os.path.join(OUT, 'leaf_normal.jpg'), quality=88)
    Image.fromarray((np.clip(T, 0, 1) * 255).astype(np.uint8)).resize((1024, 512), Image.LANCZOS).save(os.path.join(OUT, 'leaf_trans.jpg'), quality=88)
    print('wrote leaf atlas')
    return cells


def gen_litter(cells, N=1024):
    """Dense tile of flattened wet leaves (ground layer)."""
    col = np.zeros((N, N, 3))
    col[:] = srgb((58, 44, 30))
    hgt = np.zeros((N, N))
    soil = spectral_noise(N, N, 1.5, seed=70)
    col *= (1 + 0.15 * soil[..., None])
    imgs = []
    for (c, a, nrm, trans, rough) in cells[:6]:
        rgba = np.concatenate([c, a[..., None]], -1)
        imgs.append(Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA'))
    r = np.random.default_rng(71)
    canvas = Image.fromarray((col * 255).astype(np.uint8)).convert('RGBA')
    big = Image.new('RGBA', (N * 3, N * 3))
    for i in range(3):
        for j in range(3):
            big.paste(canvas, (i * N, j * N))
    hbig = Image.new('L', (N * 3, N * 3), 0)
    weights = [0.32, 0.26, 0.16, 0.12, 0.08, 0.06]
    for k in range(900):
        t = r.choice(6, p=weights)
        sz = int(r.uniform(0.07, 0.12) * N)
        im = imgs[t].resize((sz, sz), Image.LANCZOS).rotate(r.uniform(0, 360), resample=Image.BICUBIC, expand=True)
        # wet darkening & variation
        arr = np.asarray(im).astype(float)
        f = r.uniform(0.55, 1.0)
        arr[..., :3] *= f
        im = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA')
        x = int(r.uniform(0, N)) + N - im.size[0] // 2
        y = int(r.uniform(0, N)) + N - im.size[1] // 2
        # shadow
        sh = Image.new('RGBA', im.size, (20, 14, 8, 0))
        sha = im.split()[3].filter(ImageFilter.GaussianBlur(4)).point(lambda v: int(v * 0.6))
        sh.putalpha(sha)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                big.alpha_composite(sh, (x + ox + 3, y + oy + 4)) if 0 <= x + ox + 3 and 0 <= y + oy + 4 and x + ox + 3 + im.size[0] <= 3 * N and y + oy + 4 + im.size[1] <= 3 * N else None
                if 0 <= x + ox and 0 <= y + oy and x + ox + im.size[0] <= 3 * N and y + oy + im.size[1] <= 3 * N:
                    big.alpha_composite(im, (x + ox, y + oy))
                    hl = Image.new('L', im.size, int(40 + k * 0.23))
                    hbig.paste(hl, (x + ox, y + oy), im.split()[3])
    tile = np.asarray(big.crop((N, N, 2 * N, 2 * N)).convert('RGB'), float) / 255
    ht = np.asarray(hbig.crop((N, N, 2 * N, 2 * N)), float) / 255
    ht = blur_wrap(ht, 1.0) + 0.02 * spectral_noise(N, N, 2, seed=72)
    save_rgb(tile, 'litter_albedo.jpg')
    save_rgb(normal_from_height(ht, 40), 'litter_normal.jpg')
    Image.fromarray((tile * 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'litter_albedo_s.jpg'), quality=85)


# ---------------------------------------------------------------- brick facade
def gen_brick(N=1024):
    # tile = 1.0 m wide x 1.0 m high ; brick 21.5 x 6.5 cm + 1cm joint -> 13 courses @7.7cm
    px = N
    courses = 13
    ch = N / courses
    bw = N / 4.5  # 4.5 bricks per meter
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    H = np.zeros((N, N))
    col = np.zeros((N, N, 3))
    joint = np.zeros((N, N))
    edge_n = spectral_noise(N, N, 2.4, seed=80) * 2.0
    r = np.random.default_rng(81)
    row = (yy // ch).astype(int)
    off = np.where(row % 2 == 0, 0, bw / 2)
    bx = ((xx + off) // bw).astype(int)
    lx = (xx + off) % bw
    ly = yy % ch
    jw = 0.010 * px
    dj = np.minimum(np.minimum(lx, bw - lx), np.minimum(ly, ch - ly)) + edge_n
    inb = smoothstep(jw * 0.5, jw * 0.5 + 3, dj)
    ids = (row * 37 + (bx % 5) * 11) % 997
    tones = r.uniform(0, 1, (1000, 3))
    t0 = tones[ids]
    cA, cB, cC = srgb((150, 74, 52)), srgb((120, 58, 44)), srgb((170, 104, 74))
    bc = lerp(lerp(cA, cB, t0[..., 0:1]), cC, t0[..., 1:2] * 0.5)
    g = spectral_noise(N, N, 1.0, seed=82)
    sp = band_noise(N, N, 150, 400, seed=83)
    bc = bc * (1 + 0.08 * g[..., None]) * (1 - 0.25 * (sp > 1.8)[..., None])
    mortar = srgb((168, 160, 146)) * (1 + 0.08 * spectral_noise(N, N, 0.8, seed=84)[..., None])
    col = lerp(mortar, bc, inb[..., None])
    grime = smoothstep(0.5, 2.0, spectral_noise(N, N, 2.8, seed=85, aniso=(0.3, 2.0)))
    col = col * (1 - 0.18 * grime[..., None])
    H = inb * (1 + 0.05 * g) + 0.04 * spectral_noise(N, N, 0.7, seed=86) - 0.3 * (sp > 2.0) * inb
    ao = np.clip(1 - (1 - inb) * 0.45, 0, 1)
    rough = np.clip(0.85 + 0.05 * g, 0, 1)
    save_rgb(col, 'brick_albedo.jpg')
    save_rgb(normal_from_height(H, 30), 'brick_normal.jpg')
    save_rgb(np.stack([ao, rough, np.zeros_like(ao)], -1), 'brick_orm.jpg')


def gen_limestone(N=512):
    g = spectral_noise(N, N, 2.2, seed=90)
    f = spectral_noise(N, N, 0.9, seed=91)
    col = lerp(srgb((196, 186, 166)), srgb((176, 166, 146)), (g * 0.3 + 0.5).clip(0, 1)[..., None])
    col = col * (1 + 0.04 * f[..., None])
    pits = (band_noise(N, N, 80, 200, seed=92) > 2.2).astype(float)
    col = col * (1 - 0.25 * pits[..., None])
    H = 0.4 * g + 0.2 * f - pits
    save_rgb(col, 'stone_albedo.jpg')
    save_rgb(normal_from_height(H, 6), 'stone_normal.jpg')


def gen_wood(N=1024):
    # varnished oak, grain along v (y)
    yy, xx = np.mgrid[0:N, 0:N] / N
    warp = spectral_noise(N, N, 2.5, seed=100, aniso=(0.25, 1.0)) * 0.03
    rings = np.sin((xx + warp) * 2 * np.pi * 34 + spectral_noise(N, N, 2.0, seed=101) * 1.5)
    fibers = spectral_noise(N, N, 1.0, seed=102, aniso=(0.08, 1.0))
    t = (rings * 0.5 + 0.5) ** 2
    col = lerp(srgb((122, 74, 40)), srgb((84, 46, 22)), t[..., None])
    col = col * (1 + 0.08 * fibers[..., None])
    pores = (band_noise(N, N, 200, 480, seed=103) > 1.9) * (t > 0.4)
    col = col * (1 - 0.3 * pores[..., None])
    H = 0.3 * t + 0.3 * fibers - 0.6 * pores
    rough = np.clip(0.38 + 0.12 * t + 0.1 * pores, 0, 1)
    save_rgb(col, 'wood_albedo.jpg')
    save_rgb(normal_from_height(H, 8), 'wood_normal.jpg')
    save_rgb(np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1), 'wood_orm.jpg')


def gen_bamboo(N=512):
    # bamboo culm: u around, v along. nodes every ~ 0.5 of v
    yy, xx = np.mgrid[0:N, 0:N] / N
    fib = spectral_noise(N, N, 1.2, seed=110, aniso=(0.05, 1.0))
    col = lerp(srgb((196, 170, 112)), srgb((170, 140, 84)), (fib * 0.3 + 0.5).clip(0, 1)[..., None])
    node = np.exp(-((yy - 0.5) ** 2) / 0.00025)
    col = lerp(col, srgb((128, 100, 58)), (node * 0.8)[..., None])
    blotch = smoothstep(0.8, 2.0, spectral_noise(N, N, 2.6, seed=111))
    col = col * (1 - 0.25 * blotch[..., None])
    H = 0.3 * fib + 0.7 * node
    save_rgb(col, 'bamboo_albedo.jpg')
    save_rgb(normal_from_height(H, 10), 'bamboo_normal.jpg')


def gen_fabric():
    N = 512
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    # wool twill: diagonal ribs
    p = 8.0
    tw = np.sin((xx + yy) * 2 * np.pi / p)
    fuzz = spectral_noise(N, N, 0.5, seed=120)
    H = 0.6 * tw + 0.5 * fuzz + 0.3 * spectral_noise(N, N, 2.0, seed=121)
    save_rgb(normal_from_height(H, 1.4), 'twill_normal.jpg')
    # knit / glove cotton: interlock loops (v shapes)
    p = 10.0
    u = (xx % p) / p
    v = (yy % (p * 1.4)) / (p * 1.4)
    loop = np.cos((u - 0.5) * np.pi) * np.sin(v * np.pi)
    col_i = (xx // p).astype(int)
    loop = np.where(col_i % 2 == 0, loop, np.cos((u - 0.5) * np.pi) * np.sin(((v + 0.5) % 1) * np.pi))
    H = 0.8 * loop + 0.4 * spectral_noise(N, N, 0.4, seed=122)
    save_rgb(normal_from_height(H, 1.6), 'knit_normal.jpg')
    # burlap (jute mat) albedo + normal
    p = 12.0
    wx = np.sin(xx * 2 * np.pi / p) * np.sign(np.sin(yy * np.pi / p))
    wy = np.sin(yy * 2 * np.pi / p) * np.sign(np.sin(xx * np.pi / p))
    H = wx + wy + 0.6 * spectral_noise(N, N, 0.6, seed=123)
    save_rgb(normal_from_height(H, 1.2), 'burlap_normal.jpg')
    col = lerp(srgb((160, 128, 84)), srgb((120, 92, 56)), (0.5 + 0.25 * (wx + wy) + 0.2 * spectral_noise(N, N, 1.5, seed=124)).clip(0, 1)[..., None])
    save_rgb(col, 'burlap_albedo.jpg')


def gen_bark(N=512):
    yy, xx = np.mgrid[0:N, 0:N] / N
    ridges = spectral_noise(N, N, 2.2, seed=130, aniso=(0.15, 1.0))
    cracks = np.abs(band_noise(N, N, 6, 20, seed=131))
    H = ridges * 0.7 - smoothstep(0.0, 0.3, 0.3 - cracks) * 1.2 + 0.2 * spectral_noise(N, N, 0.8, seed=132)
    col = lerp(srgb((90, 80, 68)), srgb((56, 48, 40)), smoothstep(-1, 1, -H)[..., None])
    lichen = smoothstep(1.0, 2.2, spectral_noise(N, N, 2.0, seed=133))
    col = lerp(col, srgb((130, 138, 110)), (lichen * 0.5)[..., None])
    save_rgb(col, 'bark_albedo.jpg')
    save_rgb(normal_from_height(H, 8), 'bark_normal.jpg')


def gen_tread():
    N = 256
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    groove = (np.abs(((xx / N) * 6) % 1 - 0.5) < 0.06) | (np.abs((((yy + np.abs(xx - N / 2) * 0.6) / N) * 10) % 1 - 0.5) < 0.08)
    H = 1 - groove.astype(float)
    H = blur_wrap(H, 1.0)
    save_rgb(normal_from_height(H, 6), 'tread_normal.jpg')


if __name__ == '__main__':
    import sys
    which = sys.argv[1:] or ['cobble', 'leaves', 'brick', 'stone', 'wood', 'bamboo', 'fabric', 'bark', 'tread']
    cells = None
    if 'cobble' in which: gen_cobble()
    if 'leaves' in which:
        cells = gen_leaves()
        gen_litter(cells)
    if 'brick' in which: gen_brick()
    if 'stone' in which: gen_limestone()
    if 'wood' in which: gen_wood()
    if 'bamboo' in which: gen_bamboo()
    if 'fabric' in which: gen_fabric()
    if 'bark' in which: gen_bark()
    if 'tread' in which: gen_tread()
