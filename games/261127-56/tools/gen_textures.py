# -*- coding: utf-8 -*-
# 写真風 PBR テクスチャ生成（numpy のみ）。文字・人物・ロゴなし。
# 出力: ../tex/<name>_c.jpg (色, sRGB) / _n.jpg (法線, OpenGL +Y) / _m.jpg (R=AO, G=粗さ, B=金属)
import numpy as np, os, sys
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tex')
os.makedirs(OUT, exist_ok=True)
R = np.random.default_rng(56)

def fnoise(h, w, beta=2.0, sx=1.0, sy=1.0, seed=None):
    """周期的(=継ぎ目なし)スペクトルノイズ。sx,sy で異方性。"""
    rng = np.random.default_rng(seed) if seed is not None else R
    fy = np.fft.fftfreq(h)[:, None] * h * sy
    fx = np.fft.fftfreq(w)[None, :] * w * sx
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2.0)
    amp[0, 0] = 0
    ph = rng.standard_normal((h, w)) + 1j * rng.standard_normal((h, w))
    n = np.real(np.fft.ifft2(ph * amp))
    n -= n.mean(); n /= (n.std() + 1e-9)
    return n

def norm01(a):
    a = a - a.min(); return a / (a.max() + 1e-9)

def blur(a, r):
    """周期ガウスぼかし（FFT）"""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * (r ** 2) * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))

def normal_from_height(hgt, strength):
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
    dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    nx = -dx * strength; ny = dy * strength; nz = np.ones_like(hgt)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1)

def ao_from_height(hgt, r=6, k=1.0):
    d = hgt - blur(hgt, r)
    return np.clip(1.0 + d * k, 0.25, 1.0)

def save(name, col, hgt, nstr, rough, ao=None, metal=None, q=88):
    col = np.clip(col, 0, 1)
    Image.fromarray((col * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name + '_c.jpg'), quality=q)
    n = normal_from_height(hgt, nstr)
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name + '_n.jpg'), quality=92)
    if ao is None: ao = np.ones_like(hgt)
    if metal is None: metal = np.zeros_like(hgt)
    m = np.stack([np.clip(ao, 0, 1), np.clip(rough, 0, 1), np.clip(metal, 0, 1)], -1)
    Image.fromarray((m * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name + '_m.jpg'), quality=90)
    print('saved', name)

def lerp3(a, b, t):
    t = t[..., None]
    return np.array(a)[None, None, :] * (1 - t) + np.array(b)[None, None, :] * t

def srgb(c):  # 0-255 sRGB -> 0-1
    return [x / 255.0 for x in c]

# ---------------------------------------------------------------- 床板（オーク・オイル仕上げ・使い込み）
def wood_planks(name, N=1024, planks=7, vertical=False, base=(122, 86, 56), alt=(150, 108, 70),
                knots=3, gap=3, seed=1, wear=0.3, ring=38.0):
    rng = np.random.default_rng(seed)
    H = W = N
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ph = H / planks
    pid = np.floor(yy / ph).astype(int)
    loc = (yy - pid * ph) / ph  # 0..1 板の中
    col = np.zeros((H, W, 3)); hgt = np.zeros((H, W)); rough = np.zeros((H, W))
    # 板ごとの継ぎ目
    warp = fnoise(H, W, 4.0, sx=12, sy=1, seed=seed + 3) * 7
    warp2 = fnoise(H, W, 3.0, sx=3, sy=1, seed=seed + 13) * 2.5
    fine = fnoise(H, W, 1.2, sx=30, sy=1, seed=seed + 4)
    mid = fnoise(H, W, 2.2, sx=8, sy=1, seed=seed + 5)
    for p in range(planks):
        m = pid == p
        tone = rng.uniform(0, 1)
        c0 = np.array(srgb(base)) * (0.85 + 0.3 * tone)
        c1 = np.array(srgb(alt)) * (0.85 + 0.3 * tone)
        off = rng.uniform(0, 1000)
        rr = ring * rng.uniform(0.7, 1.4)
        # 年輪：板の中心からの距離 + 歪み
        cen = rng.uniform(-0.3, 1.3)
        x0 = rng.uniform(0, W); arch = rng.uniform(0.0, 0.0009)
        dxw = ((xx - x0 + W / 2) % W) - W / 2
        # 板目：中心からの距離 + 大聖堂型のアーチ（x 方向の放物線）
        d = np.sqrt((loc - cen) ** 2 * ph * ph + (dxw ** 2) * arch * ph) + warp + warp2
        d = d + 3.0 * np.sin(d / ph * 3.1 + off)  # 年輪幅の不揃い
        g = 0.5 + 0.5 * np.sin(d / ph * rr * np.pi)
        g = g ** 4.0
        t = np.clip(0.55 * g + 0.25 * (mid * 0.5 + 0.5) + 0.12 * fine, 0, 1)
        cc = c0[None, None, :] * (1 - t[..., None]) + c1[None, None, :] * t[..., None]
        col[m] = cc[m]
        hgt[m] = (0.25 * g + 0.15 * fine)[m]
        rough[m] = (0.48 + 0.18 * g + 0.06 * fine)[m]
        # 端の継ぎ目
        jx = rng.uniform(0, W)
        jm = m & (np.abs(((xx - jx) % W)) < gap)
        col[jm] *= 0.35; hgt[jm] -= 1.2; rough[jm] = 0.9
    # 節
    for k in range(knots):
        kx, ky = rng.uniform(0, W), rng.uniform(0, H)
        rx, ry = rng.uniform(10, 22), rng.uniform(6, 12)
        dx = ((xx - kx + W / 2) % W) - W / 2; dy = ((yy - ky + H / 2) % H) - H / 2
        e = np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
        km = np.exp(-e * e * 0.8)
        col *= (1 - 0.55 * km[..., None])
        hgt += 0.3 * np.sin(e * 5) * km
    # 板の隙間（溝）
    edge = np.minimum(loc, 1 - loc) * ph
    groove = np.clip(1 - edge / gap, 0, 1)
    col *= (1 - 0.65 * groove[..., None])
    hgt -= groove * 1.6
    rough = np.maximum(rough, groove * 0.95)
    # 擦り減り・汚れ・細かな傷
    wearn = norm01(blur(fnoise(H, W, 2.6, seed=seed + 9), 6))
    col = col * (1 - wear * 0.25 * (wearn[..., None] > 0.6)) + wear * 0.06 * (wearn[..., None])
    sc = np.zeros((H, W))
    for s in range(240):
        x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
        a = rng.uniform(-0.3, 0.3) + (np.pi / 2 if rng.uniform() < 0.3 else 0)
        L = rng.uniform(10, 70)
        for t in np.linspace(0, 1, int(L)):
            x = int(x0 + np.cos(a) * L * t) % W; y = int(y0 + np.sin(a) * L * t) % H
            sc[y, x] = 1
    sc = blur(sc, 0.7)
    hgt -= sc * 0.6; col += sc[..., None] * 0.04
    dirt = norm01(blur(fnoise(H, W, 3.0, seed=seed + 11), 3))
    col *= (0.88 + 0.12 * dirt[..., None])
    ao = ao_from_height(hgt, 5, 0.6)
    if vertical:
        col = np.transpose(col, (1, 0, 2)); hgt = hgt.T; rough = rough.T; ao = ao.T
    save(name, col, hgt, 2.2, rough, ao)

# ---------------------------------------------------------------- れんが
def bricks(name, N=1024, seed=2, soot=0.0):
    rng = np.random.default_rng(seed)
    H = W = N
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rows = 14; bh = H / rows; bw = W / 4.0; mort = 6
    row = np.floor(yy / bh).astype(int)
    xs = xx + (row % 2) * bw * 0.5
    bid = np.floor(xs / bw).astype(int) % 4
    lx = (xs % bw); ly = (yy % bh)
    edge = np.minimum(np.minimum(lx, bw - lx), np.minimum(ly, bh - ly))
    inb = np.clip((edge - mort * 0.5) / 3.0, 0, 1)
    col = np.zeros((H, W, 3))
    n1 = fnoise(H, W, 2.0, seed=seed + 1); n2 = fnoise(H, W, 1.0, seed=seed + 2)
    tones = rng.uniform(0, 1, (rows, 4))
    t = tones[row % rows, bid]
    c0 = np.array(srgb((128, 62, 42))); c1 = np.array(srgb((170, 96, 66))); c2 = np.array(srgb((92, 52, 40)))
    bc = c0[None, None] * (1 - t[..., None]) + c1[None, None] * t[..., None]
    dark = (rng.uniform(0, 1, (rows, 4)) < 0.15)[row % rows, bid]
    bc = np.where(dark[..., None], c2[None, None] * (0.9 + 0.2 * t[..., None]), bc)
    bc *= (0.85 + 0.1 * n1[..., None] + 0.05 * n2[..., None])
    mc = np.array(srgb((150, 142, 128)))[None, None] * (0.85 + 0.08 * n2[..., None])
    col = mc * (1 - inb[..., None]) + bc * inb[..., None]
    pits = (fnoise(H, W, 0.3, seed=seed + 5) > 2.3).astype(float)
    hgt = inb * 1.5 + 0.15 * n1 + 0.1 * n2 * inb - 0.5 * pits * inb + 0.3 * (1 - inb) * n2
    col *= (1 - 0.25 * pits[..., None] * inb[..., None])
    rough = 0.75 + 0.15 * (1 - inb) + 0.05 * n2
    if soot > 0:
        s = norm01(blur(fnoise(H, W, 2.5, seed=seed + 7), 20))
        col *= (1 - soot * s[..., None])
    ao = ao_from_height(hgt, 6, 0.35)
    save(name, col, hgt, 3.0, rough, ao)

# ---------------------------------------------------------------- 鋳鉄（ストーブ）
def cast_iron(name, N=512, seed=3):
    H = W = N
    n1 = fnoise(H, W, 1.6, seed=seed); n2 = fnoise(H, W, 0.6, seed=seed + 1)
    n3 = norm01(blur(fnoise(H, W, 2.8, seed=seed + 2), 6))
    pit = (n2 > 1.8).astype(float)
    base = np.array(srgb((40, 38, 36)))[None, None]
    col = base * (0.8 + 0.15 * n1[..., None]) * (1 - 0.3 * pit[..., None])
    rust = np.clip((n3 - 0.72) * 4, 0, 1)
    col = col * (1 - rust[..., None]) + np.array(srgb((92, 52, 30)))[None, None] * rust[..., None] * (0.8 + 0.2 * n1[..., None])
    hgt = 0.4 * n1 + 0.3 * n2 - 0.8 * pit
    rough = 0.62 + 0.15 * n1 * 0.3 + 0.25 * rust - 0.1 * (n3 < 0.3)
    metal = 0.75 * (1 - rust)
    save(name, col, hgt, 2.0, rough, ao_from_height(hgt, 3, 0.5), metal)

# ---------------------------------------------------------------- ヘアライン金属（窯の外装・ろくろの台）
def brushed(name, N=512, seed=4, tint=(170, 170, 168), grime=0.25, radial=False):
    H = W = N
    if radial:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        cx = cy = N / 2
        r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        a = np.arctan2(yy - cy, xx - cx)
        st = fnoise(H, W, 1.0, sx=1, sy=1, seed=seed)
        # 同心円の筋（半径方向に細かく変化、角度方向には一定）
        rings = np.zeros_like(r)
        rng = np.random.default_rng(seed)
        for k in range(60):
            f = rng.uniform(0.4, 4.0); p = rng.uniform(0, 6.28)
            rings += np.sin(r * f + p) * rng.uniform(0.2, 1.0) / (1 + f)
        rings = (rings - rings.mean()) / rings.std()
        hgt = 0.6 * rings + 0.1 * st
    else:
        st = fnoise(H, W, 1.0, sx=60, sy=1, seed=seed)
        hgt = 0.6 * st + 0.05 * fnoise(H, W, 0.5, seed=seed + 2)
    g = norm01(blur(fnoise(H, W, 2.6, seed=seed + 3), 8))
    col = np.array(srgb(tint))[None, None] * (0.92 + 0.05 * hgt[..., None])
    gm = np.clip((g - 0.55) * 3, 0, 1) * grime
    col = col * (1 - gm[..., None]) + np.array(srgb((110, 92, 76)))[None, None] * gm[..., None]
    rough = 0.32 + 0.06 * hgt + 0.4 * gm
    metal = 1 - gm
    # 細かな傷
    rng = np.random.default_rng(seed + 9); sc = np.zeros((H, W))
    for s in range(120):
        x0, y0 = rng.uniform(0, W), rng.uniform(0, H); a = rng.uniform(0, 6.28); L = rng.uniform(5, 40)
        for t in np.linspace(0, 1, int(L)):
            sc[int(y0 + np.sin(a) * L * t) % H, int(x0 + np.cos(a) * L * t) % W] = 1
    hgt -= blur(sc, 0.6) * 0.8; rough += blur(sc, 0.6) * 0.15
    save(name, col, hgt, 1.2, rough, ao_from_height(hgt, 3, 0.2), metal)

# ---------------------------------------------------------------- メリヤス編み（セーター）
def knit(name, N=512, cols=16, rows=22, seed=5, c=(235, 232, 226)):
    H = W = N
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    sw = W / cols; sh = H / rows
    lx = (xx % sw) / sw; ly = (yy % sh) / sh
    # V 字の左右の足（傾いた楕円）
    def leg(cx, ang):
        dx = lx - cx; dy = ly - 0.5
        ca, sa = np.cos(ang), np.sin(ang)
        u = dx * ca + dy * sa; v = -dx * sa + dy * ca
        return np.clip(1 - (u / 0.22) ** 2 - (v / 0.62) ** 2, 0, 1)
    h = np.maximum(leg(0.27, 0.45), leg(0.73, -0.45))
    h = np.sqrt(h)
    # 隣の段とのつながり
    ly2 = ((yy + sh * 0.5) % sh) / sh
    fuzz = fnoise(H, W, 0.4, seed=seed)
    yarn = fnoise(H, W, 1.0, sx=1, sy=4, seed=seed + 1)
    hgt = h * 1.0 + 0.08 * fuzz + 0.1 * yarn * h
    # 撚りの筋
    tw = 0.5 + 0.5 * np.sin((lx * 3 + ly * 9) * 6.28)
    hgt += 0.06 * tw * h
    col = np.array(srgb(c))[None, None] * (0.55 + 0.45 * h[..., None]) * (0.96 + 0.04 * fuzz[..., None])
    rough = 0.92 - 0.04 * h
    save(name, col, hgt, 4.0, rough, np.clip(0.45 + 0.55 * h, 0, 1))

# ---------------------------------------------------------------- 平織り（エプロンの帆布・麻）
def weave(name, N=512, threads=64, seed=6, c=(196, 182, 156), slub=0.35):
    H = W = N
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    p = W / threads
    rng = np.random.default_rng(seed)
    thx = rng.uniform(0.7, 1.15, threads); thy = rng.uniform(0.7, 1.15, threads)
    ix = np.floor(xx / p).astype(int) % threads; iy = np.floor(yy / p).astype(int) % threads
    lx = (xx % p) / p; ly = (yy % p) / p
    over = ((ix + iy) % 2 == 0)
    sl = fnoise(H, W, 2.0, sx=1, sy=12, seed=seed) * slub
    sl2 = fnoise(H, W, 2.0, sx=12, sy=1, seed=seed + 1) * slub
    warp = np.clip(1 - ((lx - 0.5) * 2 / (thx[ix] + sl)) ** 2, 0, 1) ** 0.5
    weft = np.clip(1 - ((ly - 0.5) * 2 / (thy[iy] + sl2)) ** 2, 0, 1) ** 0.5
    bw = np.sin(ly * np.pi); bf = np.sin(lx * np.pi)
    hw = warp * (0.6 + 0.4 * np.where(over, bw, 1 - bw))
    hf = weft * (0.6 + 0.4 * np.where(over, 1 - bf, bf))
    h = np.maximum(hw, hf)
    fuzz = fnoise(H, W, 0.5, seed=seed + 3)
    hgt = h + 0.05 * fuzz
    tone = (0.92 + 0.08 * fnoise(H, W, 1.5, sx=1, sy=20, seed=seed + 4))
    col = np.array(srgb(c))[None, None] * (0.6 + 0.4 * h[..., None]) * tone[..., None]
    stain = norm01(blur(fnoise(H, W, 2.8, seed=seed + 5), 10))
    col *= (1 - 0.12 * np.clip((stain - 0.6) * 3, 0, 1))[..., None]
    save(name, col, hgt, 3.0, 0.88 - 0.05 * h, np.clip(0.55 + 0.45 * h, 0, 1))

# ---------------------------------------------------------------- 綾織りのネルシャツ（くすんだチェック）
def flannel(name, N=512, seed=7):
    H = W = N
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    P = N / 2.0
    def band(v):
        v = v % P
        o = np.zeros_like(v)
        o += (v < P * 0.42) * 1.0
        o += ((v > P * 0.55) & (v < P * 0.6)) * 0.5
        return o
    bx = band(xx); by = band(yy)
    c_base = np.array(srgb((70, 82, 92))); c_a = np.array(srgb((122, 60, 52))); c_b = np.array(srgb((40, 44, 54)))
    mix = (bx + by) / 2
    col = c_base[None, None] * (1 - mix[..., None]) + c_a[None, None] * mix[..., None] * 0.9
    both = (bx * by)[..., None]
    col = col * (1 - both * 0.5) + c_b[None, None] * both * 0.5
    tw = ((xx + yy) % 6) / 6.0
    tw = 0.5 + 0.5 * np.sin(tw * 6.28)
    fuzz = fnoise(H, W, 0.6, seed=seed)
    hgt = 0.4 * tw + 0.25 * fuzz + 0.3 * blur(fnoise(H, W, 2.0, seed=seed + 1), 2)
    col *= (0.9 + 0.08 * tw[..., None] + 0.04 * fuzz[..., None])
    save(name, col, hgt, 2.5, 0.9 + 0.0 * tw, np.clip(0.75 + 0.25 * tw, 0, 1))

# ---------------------------------------------------------------- コーデュロイ
def cord(name, N=512, seed=8, c=(110, 74, 58)):
    H = W = N
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    wales = 40
    lx = (xx * wales / W) % 1.0
    h = np.sin(lx * np.pi) ** 0.7
    fuzz = fnoise(H, W, 0.5, seed=seed)
    hgt = h + 0.1 * fuzz + 0.1 * fnoise(H, W, 1.5, sx=1, sy=10, seed=seed + 1)
    col = np.array(srgb(c))[None, None] * (0.6 + 0.4 * h[..., None]) * (0.95 + 0.05 * fuzz[..., None])
    save(name, col, hgt, 3.0, 0.92 - 0.1 * h, np.clip(0.6 + 0.4 * h, 0, 1))

# ---------------------------------------------------------------- 肌（毛穴・しわ・赤み）
def skin(name, N=512, seed=9):
    H = W = N
    pores = fnoise(H, W, 0.2, seed=seed)
    pores = -np.clip(pores - 1.2, 0, 3)
    cre = fnoise(H, W, 1.2, sx=6, sy=1, seed=seed + 1)
    cre2 = fnoise(H, W, 1.2, sx=1, sy=5, seed=seed + 2)
    lines = -np.exp(-(cre * 2.2) ** 2) * 0.6 - np.exp(-(cre2 * 2.5) ** 2) * 0.35
    hgt = pores * 0.4 + lines * 0.6 + 0.15 * fnoise(H, W, 1.8, seed=seed + 3)
    red = norm01(blur(fnoise(H, W, 2.4, seed=seed + 4), 10))
    base = np.array(srgb((236, 188, 160)))
    col = base[None, None] * (0.95 + 0.05 * hgt[..., None])
    col = col * (1 - 0.12 * red[..., None]) + np.array(srgb((220, 140, 128)))[None, None] * 0.12 * red[..., None]
    freck = (fnoise(H, W, 0.8, seed=seed + 5) > 2.6) * 0.06
    col *= (1 - freck[..., None])
    rough = 0.52 + 0.12 * (lines < -0.2) + 0.05 * fnoise(H, W, 1.0, seed=seed + 6)
    save(name, col, hgt, 1.6, rough, np.clip(1 + lines * 0.25, 0.6, 1))

# ---------------------------------------------------------------- 髪の束
def hair(name, N=512, seed=10, c=(52, 34, 24)):
    H = W = N
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    st = fnoise(H, W, 1.4, sx=1, sy=80, seed=seed)       # 縦に流れる毛筋
    clumps = fnoise(H, W, 2.5, sx=1, sy=12, seed=seed + 1)
    hgt = 0.5 * st + 0.6 * clumps
    col = np.array(srgb(c))[None, None] * (0.75 + 0.25 * norm01(hgt)[..., None] + 0.0)
    hi = np.clip(st - 1.4, 0, 2) * 0.25
    col += np.array(srgb((120, 86, 60)))[None, None] * hi[..., None] * 0.6
    save(name, col, hgt, 3.5, 0.45 + 0.1 * st * 0.2, np.clip(0.55 + 0.45 * norm01(clumps), 0, 1))

# ---------------------------------------------------------------- 粘土の粒（シャモット）
def clay_grain(name, N=512, seed=11):
    H = W = N
    n1 = fnoise(H, W, 0.4, seed=seed); n2 = fnoise(H, W, 1.4, seed=seed + 1)
    big = (fnoise(H, W, 0.2, seed=seed + 2) > 2.4).astype(float)
    light = (fnoise(H, W, 0.2, seed=seed + 3) > 2.6).astype(float)
    dark = (fnoise(H, W, 0.2, seed=seed + 4) > 2.7).astype(float)
    hgt = 0.25 * n1 + 0.35 * n2 + 0.9 * blur(big, 0.8) - 0.5 * blur(dark, 0.6)
    # 色は「明るさの変化」だけ（白=1 付近）。素材の色はシェーダーで掛ける
    lum = 0.92 + 0.05 * n2 + 0.25 * blur(light, 0.7) - 0.3 * blur(dark, 0.7)
    col = np.stack([lum, lum * 0.99, lum * 0.97], -1)
    save(name, col, hgt, 2.2, 0.85 + 0.05 * n1, np.clip(1 - 0.3 * blur(dark, 1), 0, 1))

# ---------------------------------------------------------------- 漆喰（天井・壁）
def plaster(name, N=512, seed=12, c=(214, 206, 192)):
    H = W = N
    n = fnoise(H, W, 2.2, seed=seed); f = fnoise(H, W, 0.8, seed=seed + 1)
    trowel = fnoise(H, W, 2.6, sx=3, sy=1, seed=seed + 2)
    hgt = 0.3 * n + 0.15 * f + 0.25 * np.abs(trowel)
    col = np.array(srgb(c))[None, None] * (0.93 + 0.04 * n[..., None] + 0.02 * f[..., None])
    st = norm01(blur(fnoise(H, W, 2.8, seed=seed + 3), 12))
    col *= (1 - 0.08 * st[..., None])
    save(name, col, hgt, 1.5, 0.9 + 0.04 * f, ao_from_height(hgt, 4, 0.3))

# ---------------------------------------------------------------- 窓の外：雪の林（遠景なので少しぼかす）
def snow_view(name, W=1536, H=768, seed=13):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / H
    sky_top = np.array(srgb((168, 182, 202))); sky_hor = np.array(srgb((236, 224, 212)))
    t = np.clip(v / 0.62, 0, 1) ** 0.8
    img = sky_top[None, None] * (1 - t[..., None]) + sky_hor[None, None] * t[..., None]
    # 午後の低い太陽（右上）の明るみ
    sun = np.exp(-(((xx - W * 0.82) / (W * 0.25)) ** 2 + ((yy - H * 0.3) / (H * 0.3)) ** 2))
    img += np.array([0.12, 0.09, 0.05])[None, None] * sun[..., None]
    img += 0.015 * fnoise(H, W, 3.0, seed=seed)[..., None]
    jagN = fnoise(H, W, 1.0, sx=0.3, sy=1, seed=seed + 21)
    def tree(layer, x0, base, h, wdt, dark, snowk):
        nonlocal img
        top = base - h
        y0 = int(max(0, top)); y1 = int(min(H, base + 1))
        x0i = int(max(0, x0 - wdt)); x1i = int(min(W, x0 + wdt + 1))
        if y1 <= y0 or x1i <= x0i: return
        sy, sx = slice(y0, y1), slice(x0i, x1i)
        Y = yy[sy, sx]; X = xx[sy, sx]
        rel = (Y - top) / h
        tiers = 7 + int(h / 40)
        fr = (rel * tiers + (x0 % 1)) % 1.0
        half = wdt * 0.5 * (np.clip(rel, 0, 1) ** 0.85) * (0.62 + 0.38 * fr) * (1 + 0.35 * jagN[sy, sx])
        inside = np.abs(X - x0) < half
        trunk = (np.abs(X - x0) < max(1.5, wdt * 0.03)) & (rel > 0.85)
        snowy = inside & (fr < 0.22 + 0.3 * np.clip(jagN[sy, sx] + 0.5, 0, 1)) & (np.abs(X - x0) < half * 0.9)
        c = np.where(snowy[..., None], np.array(srgb((228, 232, 238)))[None, None] * snowk + np.array(dark)[None, None] * (1 - snowk),
                     np.array(dark)[None, None] * (0.9 + 0.2 * fr[..., None]))
        reg = img[sy, sx]
        reg = np.where((inside | trunk)[..., None], c, reg)
        img[sy, sx] = reg
    # 3層の林（奥ほど霞む）
    layers = [(0.50, 0.12, (150, 160, 170), 60, 0.35), (0.58, 0.20, (96, 108, 112), 36, 0.45), (0.72, 0.42, (46, 58, 56), 12, 0.6)]
    for (base, hh, dark, n, sk) in layers:
        for i in range(n):
            x0 = rng.uniform(-50, W + 50)
            h = H * hh * rng.uniform(0.6, 1.3)
            b = H * (base + rng.uniform(-0.02, 0.03))
            tree(0, x0, b, h, h * rng.uniform(0.35, 0.5), srgb(dark), sk)
        # 霞
        fog = np.clip((yy - H * (base - 0.25)) / (H * 0.3), 0, 1)[..., None] * 0.12
        img = img * (1 - fog) + sky_hor[None, None] * fog
    # 雪原
    gnd = np.clip((yy - H * 0.70) / 6, 0, 1)
    sn = np.array(srgb((238, 240, 244)))[None, None] * (0.94 + 0.03 * fnoise(H, W, 2.2, seed=seed + 5)[..., None])
    shade = np.clip((yy - H * 0.7) / (H * 0.3), 0, 1)[..., None]
    sn = sn * (1 - 0.12 * shade) + np.array(srgb((196, 206, 226)))[None, None] * 0.12 * shade
    img = img * (1 - gnd[..., None]) + sn * gnd[..., None]
    # 柵
    for i in range(14):
        x0 = 60 + i * 110 + rng.uniform(-6, 6)
        m = (np.abs(xx - x0) < 5) & (yy > H * 0.70) & (yy < H * 0.84)
        img = np.where(m[..., None], np.array(srgb((86, 70, 58)))[None, None], img)
    for yb in (0.74, 0.8):
        m = (np.abs(yy - H * yb) < 3) & (xx > 40) & (xx < W - 40)
        img = np.where(m[..., None], np.array(srgb((92, 76, 62)))[None, None], img)
    # 柵の上の雪
    pil = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3.2))
    pil.save(os.path.join(OUT, name + '.jpg'), quality=86)
    print('saved', name)

# ---------------------------------------------------------------- 木の桶（たが付き）は wood + iron を使う
# ---------------------------------------------------------------- 素焼きの器が並ぶ棚の板など wood_planks を流用

if __name__ == '__main__':
    only = sys.argv[1:]
    jobs = {
        'floor': lambda: wood_planks('floor', 1024, 7, False, (112, 78, 50), (150, 108, 72), 4, 3, 1, 0.35),
        'wall': lambda: wood_planks('wall', 1024, 6, True, (176, 136, 96), (204, 164, 118), 6, 2, 21, 0.1, 26.0),
        'board': lambda: wood_planks('board', 512, 3, False, (150, 112, 76), (186, 144, 100), 1, 2, 31, 0.2, 18.0),
        'brick': lambda: bricks('brick', 1024, 2, 0.25),
        'iron': lambda: cast_iron('iron', 512),
        'steel': lambda: brushed('steel', 512, 4, (176, 176, 172), 0.2),
        'alu': lambda: brushed('alu', 512, 14, (160, 160, 158), 0.45, True),
        'knit': lambda: knit('knit', 512),
        'linen': lambda: weave('linen', 512),
        'flannel': lambda: flannel('flannel', 512),
        'cord': lambda: cord('cord', 512),
        'skin': lambda: skin('skin', 512),
        'hair': lambda: hair('hair', 512),
        'grain': lambda: clay_grain('grain', 512),
        'plaster': lambda: plaster('plaster', 512),
        'snow': lambda: snow_view('snowview'),
    }
    for k, f in jobs.items():
        if not only or k in only:
            f()
