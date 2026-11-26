# -*- coding: utf-8 -*-
"""写真風 PBR テクスチャを数値的に生成する（文字・人物・ロゴなし）。
python3 tools/gen_tex.py で ../tex/ に出力。周期ノイズ（FFT）でタイル可能。
出力: *_c.jpg(ベースカラー sRGB) *_n.jpg(法線 OpenGL) *_m.jpg(R=AO G=粗さ B=金属)
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tex')
os.makedirs(OUT, exist_ok=True)
R = np.random.default_rng(54)

def spec_noise(h, w, beta=2.0, ax=1.0, ay=1.0, seed=None, lo=0.0):
    rng = np.random.default_rng(seed) if seed is not None else R
    wn = rng.standard_normal((h, w))
    F = np.fft.fft2(wn)
    ky = np.fft.fftfreq(h)[:, None] * h
    kx = np.fft.fftfreq(w)[None, :] * w
    k = np.sqrt((kx * ax) ** 2 + (ky * ay) ** 2)
    k[0, 0] = 1
    amp = 1.0 / np.power(k + lo, beta / 2 * 2 / 2)
    amp = 1.0 / (1.0 + k) ** beta
    amp[0, 0] = 0
    n = np.real(np.fft.ifft2(F * amp))
    n -= n.mean(); n /= (n.std() + 1e-9)
    return n

def band_noise(h, w, kmin, kmax, ax=1.0, ay=1.0, seed=None):
    rng = np.random.default_rng(seed) if seed is not None else R
    F = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None] * h
    kx = np.fft.fftfreq(w)[None, :] * w
    k = np.sqrt((kx * ax) ** 2 + (ky * ay) ** 2)
    m = np.exp(-((np.log(k + 1e-6) - np.log(np.sqrt(kmin * kmax))) ** 2) / (2 * (np.log(kmax / kmin) / 2.5 + 1e-3) ** 2))
    m[0, 0] = 0
    n = np.real(np.fft.ifft2(F * m)); n -= n.mean(); n /= (n.std() + 1e-9)
    return n

def norm01(a):
    a = a - a.min(); return a / (a.max() + 1e-9)

def normal_map(hgt, strength, wrap=True):
    if wrap:
        dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
        dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    else:
        dy, dx = np.gradient(hgt)
    nx = -dx * strength; ny = dy * strength; nz = np.ones_like(hgt)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)

def ao_from_height(hgt, rad=6):
    im = Image.fromarray((norm01(hgt) * 255).astype(np.uint8))
    bl = np.asarray(im.filter(ImageFilter.GaussianBlur(rad)), dtype=np.float32) / 255
    a = 1.0 - np.clip((bl - norm01(hgt)) * 2.2, 0, 1)
    return a

def srgb(c):
    return (np.clip(c, 0, 1) * 255).astype(np.uint8)

def save(name, col=None, nrm=None, ao=None, rough=None, metal=None, q=88):
    if col is not None:
        Image.fromarray(srgb(col)).save(os.path.join(OUT, name + '_c.jpg'), quality=q)
    if nrm is not None:
        Image.fromarray(nrm).save(os.path.join(OUT, name + '_n.jpg'), quality=92)
    if rough is not None:
        h, w = rough.shape
        a = ao if ao is not None else np.ones((h, w))
        m = metal if metal is not None else np.zeros((h, w))
        Image.fromarray(srgb(np.stack([a, rough, m], -1))).save(os.path.join(OUT, name + '_m.jpg'), quality=90)
    print('saved', name)

def lerp(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) == 2 else t
    return np.asarray(a) * (1 - t) + np.asarray(b) * t

def hexc(s):
    s = s.lstrip('#'); return np.array([int(s[i:i + 2], 16) / 255 for i in (0, 2, 4)])

# ---------------------------------------------------------------- 木（まな板：メープル）
def wood(name, W, H, base_a, base_b, ring_freq, warp_amp, plank_n=0, plank_vert=False, knots=0, weather=0.0, scratches=0, rough_base=0.62, seed=0):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    u = x / W; v = y / H
    warp = spec_noise(H, W, 3.0, 8.0, 1.0, seed=seed + 1) * warp_amp
    warp2 = spec_noise(H, W, 2.2, 12.0, 1.0, seed=seed + 2) * warp_amp * 0.25
    t = (v + warp * 0.05 + warp2 * 0.02)
    if plank_n:
        pid = np.floor(v * plank_n)
        t = t + pid * 0.37
    ring = np.sin(t * ring_freq * 2 * np.pi)
    ring = 0.5 + 0.5 * np.sign(ring) * np.abs(ring) ** 0.6
    late = ring ** 3
    fib = spec_noise(H, W, 1.2, 40.0, 1.0, seed=seed + 3)  # 細い繊維（横方向に伸びる）
    fib2 = band_noise(H, W, 60, 400, 30.0, 1.0, seed=seed + 4)
    low = spec_noise(H, W, 2.5, 1.0, 1.0, seed=seed + 5)
    tone = 0.55 * late + 0.12 * fib + 0.08 * fib2 + 0.18 * low
    # 節
    knot_h = np.zeros((H, W), np.float32)
    for k in range(knots):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        rx, ry = rng.uniform(10, 26) * W / 1024, rng.uniform(6, 14) * W / 1024
        d = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
        knot_h += np.exp(-d * d * 0.8) * (0.6 + 0.4 * np.sin(d * 6))
        tone += np.exp(-d * d * 0.5) * 0.9
    col = lerp(base_a, base_b, np.clip(tone * 0.5 + 0.35, 0, 1))
    hgt = -late * 0.4 + fib2 * 0.25 + fib * 0.15 - knot_h * 0.3
    rough = rough_base + 0.08 * late + 0.05 * fib
    if plank_n:
        frac = (v * plank_n) % 1.0
        gap = np.exp(-((np.minimum(frac, 1 - frac)) * H / plank_n / 2.2) ** 2)
        hgt -= gap * 3.0
        col = col * (1 - gap[..., None] * 0.65)
        per = np.floor(v * plank_n)
        shade = (np.sin(per * 12.9898) * 43758.5453) % 1.0
        col = col * (0.88 + 0.2 * shade[..., None])
    if weather > 0:
        gr = np.clip(spec_noise(H, W, 2.0, 1.0, 1.0, seed=seed + 7) * 0.5 + 0.4, 0, 1)
        grey = np.array([0.55, 0.52, 0.47])
        col = lerp(col, grey * col.mean(-1, keepdims=True) * 1.6, gr * weather)
        rough = rough + gr * weather * 0.15
        hgt += band_noise(H, W, 200, 500, 10.0, 1.0, seed=seed + 8) * 0.25 * weather
    # 包丁の傷
    sc = np.zeros((H, W), np.float32)
    for i in range(scratches):
        x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
        ang = rng.uniform(0, np.pi); L = rng.uniform(30, 180) * W / 1024
        dxv, dyv = np.cos(ang), np.sin(ang)
        px, py = x - x0, y - y0
        along = px * dxv + py * dyv
        perp = -px * dyv + py * dxv
        m = (np.abs(along) < L) * np.exp(-(perp / 0.7) ** 2) * (1 - (np.abs(along) / L) ** 4)
        sc = np.maximum(sc, m * rng.uniform(0.3, 1.0))
    hgt -= sc * 1.5
    col = col * (1 - sc[..., None] * 0.12)
    rough = rough + sc * 0.12
    nrm = normal_map(hgt, 2.0)
    ao = np.clip(ao_from_height(hgt, 4) * 0.5 + 0.5, 0, 1)
    save(name, col, nrm, ao, np.clip(rough, 0, 1))

# ---------------------------------------------------------------- 布（麻袋・ふきん・服）
def weave(name, S, cells, col_a, col_b, yarn_noise=0.35, waffle=False, rough=0.9, slub=0.4, seed=10, fuzz=0.3):
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    u = x / S * cells; v = y / S * cells
    jitx = spec_noise(S, S, 2.5, 1, 1, seed=seed) * 0.08
    jity = spec_noise(S, S, 2.5, 1, 1, seed=seed + 1) * 0.08
    uu = u + jitx * cells / 8; vv = v + jity * cells / 8
    fu = uu % 1.0; fv = vv % 1.0
    iu = np.floor(uu); iv = np.floor(vv)
    over = ((iu + iv) % 2 == 0)
    warp_y = np.sin(fu * np.pi) ** 0.7   # 縦糸の断面
    weft_y = np.sin(fv * np.pi) ** 0.7
    wv = np.cos((fv - 0.5) * np.pi) ** 2
    wu = np.cos((fu - 0.5) * np.pi) ** 2
    hw = np.where(over, warp_y * (0.6 + 0.4 * wv), weft_y * (0.6 + 0.4 * wu))
    # 糸の太さむら
    slubn = spec_noise(S, S, 1.5, 0.05, 1.0, seed=seed + 2) * slub
    slubm = spec_noise(S, S, 1.5, 1.0, 0.05, seed=seed + 3) * slub
    hgt = hw + np.where(over, slubn, slubm) * 0.3
    if waffle:
        g = 6
        wu2 = (x / S * g) % 1.0; wv2 = (y / S * g) % 1.0
        cellh = np.minimum(np.minimum(wu2, 1 - wu2), np.minimum(wv2, 1 - wv2))
        hgt = hgt * 0.4 + np.clip(cellh * 8, 0, 1) * -1.0 + 1.0
    fz = band_noise(S, S, 120, 400, seed=seed + 4) * fuzz
    hgt = hgt + fz * 0.2
    t = np.clip(0.5 + 0.35 * np.where(over, slubn, slubm) + 0.25 * spec_noise(S, S, 2.0, 1, 1, seed=seed + 5) * yarn_noise, 0, 1)
    col = lerp(col_a, col_b, t)
    col = col * (0.72 + 0.28 * norm01(hgt))[..., None]
    nrm = normal_map(hgt, 3.0 if not waffle else 2.2)
    ao = np.clip(0.55 + 0.45 * norm01(hgt), 0, 1)
    save(name, col, nrm, ao, np.clip(rough - 0.05 * norm01(hgt), 0, 1))

# ---------------------------------------------------------------- 果物の皮（経緯度 UV：u=経度, v=緯度 0=上極）
def skin_grid(W, H):
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    return x / W, y / (H - 1)

def watermelon(W=1024, H=512):
    u, v = skin_grid(W, H)
    base = hexc('#7aa64a'); dark = hexc('#1f4a1d'); mid = hexc('#4f7f35')
    n1 = spec_noise(H, W, 2.2, 1.0, 0.5, seed=21)
    n2 = band_noise(H, W, 30, 160, 1.0, 1.0, seed=22)
    n3 = band_noise(H, W, 100, 400, seed=23)
    # 経線にそって波打つ縞
    s = np.sin((u * 16 + n1 * 0.18 + n2 * 0.04) * 2 * np.pi)
    stripe = np.clip((s - 0.05 + n3 * 0.25) * 2.2, 0, 1)
    col = lerp(base, dark, stripe)
    col = lerp(col, mid, np.clip(n2 * 0.25 + 0.2, 0, 0.5))
    # 細かいまだら
    col = col * (0.92 + 0.1 * n3[..., None])
    # 畑で地面に接した黄色い跡
    d = np.sqrt(((u - 0.3) * 2.2) ** 2 + ((v - 0.62) * 2.0) ** 2) + n1 * 0.05
    spot = np.clip(1 - d * 4.0, 0, 1) ** 1.5
    col = lerp(col, hexc('#c9b766'), spot * 0.85)
    # 極
    pole = np.exp(-((v) * 30) ** 2) + np.exp(-((1 - v) * 40) ** 2)
    col = lerp(col, hexc('#8b8a4a'), np.clip(pole, 0, 1) * 0.6)
    hgt = n3 * 0.3 + band_noise(H, W, 200, 500, seed=24) * 0.2 + stripe * 0.1
    rough = 0.38 + 0.08 * n3 * 0.5 + spot * 0.2
    save('skin_watermelon', col, normal_map(hgt, 1.2), None, np.clip(rough, 0, 1))

def orange(W=1024, H=512):
    u, v = skin_grid(W, H)
    rng = np.random.default_rng(31)
    col0 = hexc('#e07a12'); col1 = hexc('#f0a030')
    n1 = spec_noise(H, W, 2.0, 1, 1, seed=31)
    # 油胞のくぼみ（ランダム点群）
    hgt = np.zeros((H, W), np.float32)
    img = Image.new('L', (W, H), 0)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(img)
    for i in range(14000):
        xx = rng.uniform(0, W); yy = rng.uniform(0, H)
        lat = np.sin(np.pi * yy / H) + 0.05
        r = rng.uniform(1.2, 2.6)
        dr.ellipse([xx - r / lat, yy - r, xx + r / lat, yy + r], fill=int(rng.uniform(120, 255)))
    pores = np.asarray(img.filter(ImageFilter.GaussianBlur(1.1)), np.float32) / 255
    hgt = -pores * 1.0 + band_noise(H, W, 40, 120, seed=32) * 0.15
    col = lerp(col0, col1, np.clip(0.5 + 0.25 * n1, 0, 1))
    col = col * (1 - pores[..., None] * 0.08)
    # へた
    top = np.exp(-(v * 26) ** 2)
    col = lerp(col, hexc('#6f7a2a'), np.clip(top * 1.3, 0, 1))
    bot = np.exp(-((1 - v) * 40) ** 2)
    col = lerp(col, hexc('#b8651a'), bot * 0.7)
    rough = 0.42 + pores * 0.15
    save('skin_orange', col, normal_map(hgt, 2.4), np.clip(1 - pores * 0.3, 0, 1), rough)

def kiwi(W=1024, H=512):
    u, v = skin_grid(W, H)
    n1 = spec_noise(H, W, 2.0, 1, 1, seed=41)
    fz = band_noise(H, W, 200, 512, 0.6, 1.0, seed=42)
    fz2 = band_noise(H, W, 80, 250, seed=43)
    col = lerp(hexc('#6b4a26'), hexc('#9a7444'), np.clip(0.5 + 0.2 * n1 + 0.25 * fz, 0, 1))
    col = col * (0.9 + 0.1 * fz2[..., None])
    top = np.exp(-(v * 30) ** 2) + np.exp(-((1 - v) * 30) ** 2)
    col = lerp(col, hexc('#4a3218'), np.clip(top, 0, 1) * 0.8)
    hgt = fz * 0.5 + fz2 * 0.3
    save('skin_kiwi', col, normal_map(hgt, 1.8), None, np.clip(0.85 + fz * 0.05, 0, 1))

def pomegranate(W=1024, H=512):
    u, v = skin_grid(W, H)
    n1 = spec_noise(H, W, 2.3, 1, 1, seed=51)
    n2 = band_noise(H, W, 20, 80, seed=52)
    n3 = band_noise(H, W, 150, 500, seed=53)
    col = lerp(hexc('#7e1a1c'), hexc('#b23a2a'), np.clip(0.5 + 0.3 * n1, 0, 1))
    col = lerp(col, hexc('#c08a4a'), np.clip(n2 * 0.4 - 0.3, 0, 1) * 0.6)
    col = col * (0.93 + 0.07 * n3[..., None])
    top = np.exp(-(v * 18) ** 2)
    col = lerp(col, hexc('#8a4a2a'), top * 0.7)
    hgt = n3 * 0.25 + n2 * 0.4
    save('skin_pomegranate', col, normal_map(hgt, 1.3), None, np.clip(0.48 + 0.1 * n3, 0, 1))

def dragonfruit(W=1024, H=512):
    u, v = skin_grid(W, H)
    n1 = spec_noise(H, W, 2.0, 1, 1, seed=61)
    n3 = band_noise(H, W, 120, 400, seed=63)
    col = lerp(hexc('#b8245e'), hexc('#d9558a'), np.clip(0.5 + 0.3 * n1, 0, 1))
    col = col * (0.94 + 0.06 * n3[..., None])
    hgt = n3 * 0.3 + n1 * 0.2
    save('skin_dragon', col, normal_map(hgt, 1.0), None, np.clip(0.4 + 0.06 * n3, 0, 1))

def pineapple(W=1024, H=1024):
    u, v = skin_grid(W, H)
    N = 8; M = 6
    wu = spec_noise(H, W, 3.0, 1, 1, seed=74) * 0.012
    wv = spec_noise(H, W, 3.0, 1, 1, seed=75) * 0.012
    a = (u + wu) * N + (v + wv) * M; b = (u + wu) * N - (v + wv) * M
    fa = a % 1.0 - 0.5; fb = b % 1.0 - 0.5
    d = np.maximum(np.abs(fa), np.abs(fb))
    dome = np.clip(1 - (d * 2) ** 2.4, 0, 1)
    n3 = band_noise(H, W, 150, 500, seed=73)
    n1 = spec_noise(H, W, 2.0, 1, 1, seed=71)
    cid = np.floor(a) * 7.1 + np.floor(b) * 3.3
    cr = (np.sin(cid * 12.9898) * 43758.5453) % 1.0
    # 目の中心の棘（上向きの小さなとげ）とへこみ
    c = np.sqrt(fa * fa * 1.4 + (fb - 0.2) ** 2)
    eye = np.exp(-(c * 7) ** 2)
    lobes = np.clip(1 - np.sqrt((fa * 1.2) ** 2 + (fb + 0.12) ** 2) * 3.2, 0, 1)
    hgt = dome * 1.0 - eye * 0.7 + lobes * 0.25 + n3 * 0.08
    rim = np.clip((d - 0.36) * 8, 0, 1)
    gold = lerp(hexc('#9a6a24'), hexc('#c8913a'), np.clip(dome * 0.8 + n1 * 0.25 + cr[..., None][..., 0] * 0.3 - 0.1, 0, 1))
    green = hexc('#5f6a30')
    col = lerp(gold, green, np.clip(rim * 0.8 + (1 - dome) * 0.2 + np.clip(n1 * 0.3, 0, 0.3) * (1 - v), 0, 1) * 0.8)
    col = lerp(col, hexc('#3e2a16'), eye * 0.9)
    col = lerp(col, hexc('#d8b060'), np.clip(lobes - 0.4, 0, 1) * 0.5)
    col = col * (0.9 + 0.1 * n3[..., None])
    ao = np.clip(0.4 + 0.6 * dome, 0, 1)
    save('skin_pineapple', col, normal_map(hgt * 7, 1.8), ao, np.clip(0.6 + rim * 0.15 + eye * 0.2, 0, 1))

def starfruit(W=1024, H=512):
    u, v = skin_grid(W, H)
    n1 = spec_noise(H, W, 2.0, 1, 1, seed=81)
    n3 = band_noise(H, W, 120, 400, seed=83)
    col = lerp(hexc('#c9b23a'), hexc('#dcc552'), np.clip(0.5 + 0.3 * n1, 0, 1))
    # 稜線（5本）は茶色く
    rid = np.cos(u * 5 * 2 * np.pi)
    edge = np.clip((rid - 0.93) * 18, 0, 1)
    col = lerp(col, hexc('#8a6a2a'), edge * 0.7)
    gr = np.clip(n1 * 0.4, 0, 1) * 0.5
    col = lerp(col, hexc('#9aa23a'), gr)
    hgt = n3 * 0.2
    save('skin_star', col, normal_map(hgt, 0.8), None, np.clip(0.34 + 0.06 * n3, 0, 1))

def leaf(W=512, H=256):
    # パイナップルの冠芽・ザクロのがく用（u=葉の幅方向, v=根元→先）
    u, v = skin_grid(W, H)
    n1 = spec_noise(H, W, 2.0, 1, 8.0, seed=91)
    fib = band_noise(H, W, 40, 200, 1.0, 20.0, seed=92)
    col = lerp(hexc('#4c6a3a'), hexc('#7d9a5a'), np.clip(0.5 + 0.3 * n1 + 0.2 * fib, 0, 1))
    col = lerp(col, hexc('#9a8a5a'), np.clip((v - 0.85) * 6, 0, 1) * 0.6)
    hgt = fib * 0.4
    save('leaf', col, normal_map(hgt, 1.5), None, np.clip(0.5 + 0.1 * fib, 0, 1))

def metal(S=512):
    rng = np.random.default_rng(101)
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    br = band_noise(S, S, 60, 500, 40.0, 1.0, seed=102)  # ヘアライン
    sc = np.zeros((S, S), np.float32)
    for i in range(160):
        x0, y0 = rng.uniform(0, S), rng.uniform(0, S)
        ang = rng.uniform(0, np.pi); L = rng.uniform(5, 60)
        px, py = x - x0, y - y0
        along = px * np.cos(ang) + py * np.sin(ang)
        perp = -px * np.sin(ang) + py * np.cos(ang)
        sc = np.maximum(sc, (np.abs(along) < L) * np.exp(-(perp / 0.6) ** 2) * rng.uniform(0.2, 1))
    col = np.ones((S, S, 3)) * hexc('#c8cacb')[None, None, :] * (0.96 + 0.04 * br[..., None])
    hgt = br * 0.3 - sc * 0.8
    rough = np.clip(0.22 + 0.05 * br + sc * 0.25, 0, 1)
    save('metal', col, normal_map(hgt, 1.2), None, rough, np.ones((S, S)))

def ceramic(S=512):
    rng = np.random.default_rng(111)
    n1 = spec_noise(S, S, 2.0, 1, 1, seed=112)
    n3 = band_noise(S, S, 150, 400, seed=113)
    col = lerp(hexc('#ece6da'), hexc('#f6f2ea'), np.clip(0.5 + 0.3 * n1, 0, 1))
    sp = (rng.random((S, S)) > 0.9985).astype(np.float32)
    sp = np.asarray(Image.fromarray((sp * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
    col = col * (1 - sp[..., None] * 1.5).clip(0.3, 1)
    hgt = n1 * 0.15 + n3 * 0.05
    save('ceramic', col, normal_map(hgt, 0.6), None, np.clip(0.12 + 0.04 * n3, 0, 1))

def cotton(name, S, a, b, cells=64, seed=120):
    weave(name, S, cells, a, b, yarn_noise=0.3, rough=0.92, slub=0.25, seed=seed, fuzz=0.4)

def backdrop(W=2048, H=1024):
    """強くぼけた夏の朝市（遠景）。人物・文字なし。"""
    rng = np.random.default_rng(131)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    u = x / W; v = y / H
    sky = lerp(hexc('#cfe0ee'), hexc('#f3ead8'), np.clip(v / 0.45, 0, 1))
    img = sky.copy()
    # 木々の樹冠
    canopy_h = 0.34 + 0.08 * np.sin(u * 7.1) + 0.05 * spec_noise(H, W, 2.5, 1, 1, seed=132)[0:1, :] * 1.0
    tree = (v < canopy_h + 0.05 * spec_noise(H, W, 2.2, 1, 1, seed=133)).astype(np.float32)
    leafc = lerp(hexc('#56703f'), hexc('#a3b267'), np.clip(0.5 + 0.4 * spec_noise(H, W, 1.8, 1, 1, seed=134), 0, 1))
    img = lerp(img, leafc, tree * (v > 0.02) * 0.92)
    # 屋台（テント）の帯
    nst = 7
    for i in range(nst):
        x0 = (i + rng.uniform(-0.2, 0.2)) / nst; w = rng.uniform(0.09, 0.14)
        top = rng.uniform(0.36, 0.44); bot = top + rng.uniform(0.07, 0.1)
        c = [hexc('#e8e1cf'), hexc('#b7c4a6'), hexc('#d9b48a'), hexc('#c9d3da'), hexc('#e3cfb2')][i % 5]
        m = ((u > x0) & (u < x0 + w) & (v > top) & (v < bot)).astype(np.float32)
        stripes = 0.85 + 0.15 * np.sign(np.sin((u - x0) * 160))
        if i % 2 == 0:
            img = lerp(img, c * stripes[..., None], m)
        else:
            img = lerp(img, c, m)
        # 屋台の影と台
        m2 = ((u > x0 + 0.005) & (u < x0 + w - 0.005) & (v > bot) & (v < bot + 0.22)).astype(np.float32)
        stallc = lerp(hexc('#5a4632'), hexc('#8a6a48'), np.clip(0.5 + 0.4 * spec_noise(H, W, 1.5, 1, 1, seed=140 + i), 0, 1))
        img = lerp(img, stallc, m2 * 0.9)
        # 並んだ果物・野菜の色の点
        for k in range(60):
            px = rng.uniform(x0 + 0.01, x0 + w - 0.01); py = rng.uniform(bot + 0.05, bot + 0.14)
            cc = [hexc('#c8452e'), hexc('#e08a2a'), hexc('#d8c04a'), hexc('#6a9a3a'), hexc('#8a3a5a'), hexc('#e8d8b8')][rng.integers(0, 6)]
            d = ((u - px) * W) ** 2 + ((v - py) * H) ** 2
            img = lerp(img, cc, np.exp(-d / 90.0) * 0.9)
    # 地面（石畳と日なた）
    g = np.clip((v - 0.66) / 0.1, 0, 1)
    ground = lerp(hexc('#a89a86'), hexc('#d6c8ae'), np.clip(0.5 + 0.3 * spec_noise(H, W, 2.0, 0.3, 1, seed=150), 0, 1))
    img = lerp(img, ground, g)
    # 木漏れ日と柱
    for i in range(12):
        px = rng.uniform(0, 1)
        m = (np.abs(u - px) < 0.004) & (v > 0.3) & (v < 0.8)
        img = lerp(img, hexc('#4a3a2a'), m.astype(np.float32) * 0.8)
    im = Image.fromarray(srgb(img))
    im = im.filter(ImageFilter.GaussianBlur(22))
    arr = np.asarray(im, np.float32) / 255
    # 玉ボケ（六角形でなく丸）
    bok = np.zeros((H, W), np.float32)
    for i in range(260):
        px = rng.uniform(0, W); py = rng.uniform(0, H * 0.55)
        r = rng.uniform(10, 34)
        d = np.sqrt((x - px) ** 2 + (y - py) ** 2)
        disc = np.clip((r - d) / 2.5, 0, 1) * (0.7 + 0.3 * np.clip(d / r, 0, 1))
        bok = np.maximum(bok, disc * rng.uniform(0.15, 0.55))
    bokc = hexc('#fff6e0')
    arr = arr + bok[..., None] * (bokc - arr) * 0.6
    arr = arr * (0.96 + 0.04 * spec_noise(H, W, 0.5, 1, 1, seed=160)[..., None] * 0.5)
    Image.fromarray(srgb(arr)).save(os.path.join(OUT, 'backdrop.jpg'), quality=85)
    print('saved backdrop')

def pavers(S=1024):
    rng = np.random.default_rng(171)
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    rows = 9
    rh = S / rows
    hgt = np.zeros((S, S), np.float32); col = np.zeros((S, S, 3), np.float32)
    n1 = spec_noise(S, S, 2.2, 1, 1, seed=172); n2 = band_noise(S, S, 150, 500, seed=173); n3 = spec_noise(S, S, 1.6, 1, 1, seed=174)
    for r in range(rows):
        off = rng.uniform(0, 1)
        y0 = r * rh
        cx = 0.0
        while cx < S + rh:
            w = rh * rng.uniform(0.9, 1.6)
            x0 = (cx + off * rh) % S
            # 石の矩形（周期的）
            dx = (x - x0) % S; inx = dx < w
            dy = y - y0; iny = (dy >= 0) & (dy < rh)
            m = inx & iny
            ex = np.minimum(dx, w - dx); ey = np.minimum(dy, rh - dy)
            e = np.minimum(ex, ey)
            dome = np.clip(e / 10.0, 0, 1) ** 0.6
            base = np.array([0.50, 0.47, 0.42]) * rng.uniform(0.82, 1.12)
            hgt = np.where(m, dome * (1 + 0.15 * n1) + n2 * 0.05, hgt)
            col = np.where(m[..., None], base * (0.9 + 0.12 * n1[..., None] + 0.06 * n2[..., None]), col)
            cx += w
    gap = hgt < 0.2
    dirt = np.array([0.36, 0.30, 0.24]) * (0.85 + 0.2 * n3[..., None])
    col = np.where(gap[..., None], dirt, col)
    col = col * (0.75 + 0.25 * np.clip(hgt, 0, 1))[..., None]
    rough = np.clip(0.75 + 0.15 * (1 - np.clip(hgt, 0, 1)) + 0.05 * n2, 0, 1)
    save('pavers', col, normal_map(hgt * 4, 2.0), np.clip(0.45 + 0.55 * np.clip(hgt * 1.5, 0, 1), 0, 1), rough)

if __name__ == '__main__':
    which = sys.argv[1:] or ['all']
    def want(n): return 'all' in which or n in which
    if want('board'):
        wood('board', 1024, 768, hexc('#d6ae7c'), hexc('#a9773f'), 30, 1.0, knots=0, scratches=70, rough_base=0.55, seed=1)
    if want('counter'):
        wood('counter', 1024, 1024, hexc('#a98458'), hexc('#6e4e30'), 22, 1.6, plank_n=5, knots=4, weather=0.6, scratches=60, rough_base=0.7, seed=2)
    if want('crate'):
        wood('crate', 512, 512, hexc('#d8bf96'), hexc('#a8865c'), 12, 2.0, plank_n=0, knots=1, weather=0.25, scratches=10, rough_base=0.85, seed=3)
    if want('burlap'):
        weave('burlap', 512, 22, hexc('#8a6c44'), hexc('#c5a476'), yarn_noise=0.7, rough=0.95, slub=0.7, seed=11, fuzz=0.6)
    if want('towel'):
        weave('towel', 512, 70, hexc('#e9e4da'), hexc('#fbf8f2'), yarn_noise=0.2, waffle=True, rough=0.95, slub=0.25, seed=12)
    if want('cotton'):
        cotton('cotton', 256, hexc('#d8d8d8'), hexc('#f4f4f4'), 48)
    if want('fruit'):
        watermelon(); orange(); kiwi(); pomegranate(); dragonfruit(); pineapple(); starfruit(); leaf()
    if want('pine'):
        pineapple()
    if want('leaf'):
        leaf()
    if want('metal'):
        metal()
    if want('ceramic'):
        ceramic()
    if want('pavers'):
        pavers()
    if want('backdrop'):
        backdrop()
