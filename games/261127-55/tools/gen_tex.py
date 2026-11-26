# -*- coding: utf-8 -*-
"""ちょーくのくるま 用の写真風テクスチャを numpy だけで生成する。
すべてタイル可能（FFT ノイズ／周期座標）で、文字・人物・ロゴは含まない。
使い方: python3 tools/gen_tex.py   （games/261127-55/ で実行）
"""
import numpy as np, os, math
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'tex')
os.makedirs(OUT, exist_ok=True)
R = np.random.default_rng(261127)

# ---------- 基本道具 ----------
def fnoise(h, w, beta=2.0, fmin=1.0, fmax=None, seed=None):
    rng = np.random.default_rng(seed) if seed is not None else R
    wn = rng.standard_normal((h, w))
    F = np.fft.fft2(wn)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    filt = 1.0 / f ** (beta / 2)
    filt[f < fmin] = 0
    if fmax is not None:
        filt *= np.exp(-(f / fmax) ** 2)
    n = np.real(np.fft.ifft2(F * filt))
    n -= n.min(); n /= (n.max() + 1e-9)
    return n

def norm01(a):
    a = a - a.min(); return a / (a.max() + 1e-9)

def blur(a, s):
    """周期ガウスぼかし（FFT）"""
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * (s ** 2) * (fx * fx + fy * fy))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., i]) * g)) for i in range(a.shape[2])], -1)

def normal_from_height(hm, strength):
    dx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) * 0.5
    dy = (np.roll(hm, -1, 0) - np.roll(hm, 1, 0)) * 0.5
    nx = -dx * strength; ny = dy * strength; nz = np.ones_like(hm)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return n * 0.5 + 0.5

def cavity_ao(hm, s=6, k=2.5):
    b = blur(hm, s)
    ao = 1 - np.clip((b - hm) * k, 0, 1)
    return np.clip(ao, 0, 1)

def save(name, arr, q=88):
    arr = np.clip(arr, 0, 1)
    if arr.ndim == 2:
        im = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'L')
    elif arr.shape[2] == 4:
        im = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGBA')
    else:
        im = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGB')
    p = os.path.join(OUT, name)
    if name.endswith('.png'):
        im.save(p, optimize=True)
    else:
        im.convert('RGB').save(p, quality=q, optimize=True)
    print('wrote', name, im.size)

def orm(ao, rough, metal):
    return np.stack([ao, rough, metal * np.ones_like(ao)], -1)

def srgb(c):
    return np.array(c, dtype=np.float64)

def splat_periodic(field, cx, cy, kernel, mode='max'):
    h, w = field.shape
    kh, kw = kernel.shape
    ys = (np.arange(kh) + int(cy) - kh // 2) % h
    xs = (np.arange(kw) + int(cx) - kw // 2) % w
    sub = field[np.ix_(ys, xs)]
    if mode == 'max':
        field[np.ix_(ys, xs)] = np.maximum(sub, kernel)
    else:
        field[np.ix_(ys, xs)] = sub + kernel

# ---------- 1. アスファルト舗道（1m タイル, 1024） ----------
def asphalt():
    N = 1024
    h = np.zeros((N, N)); idm = np.zeros((N, N)); tint = np.zeros((N, N, 3))
    rng = np.random.default_rng(1)
    n_st = 9000
    for i in range(n_st):
        r = rng.uniform(1.6, 6.5) if rng.random() < 0.85 else rng.uniform(6, 10)
        cx, cy = rng.uniform(0, N), rng.uniform(0, N)
        k = int(r * 2 + 3) | 1
        yy, xx = np.mgrid[0:k, 0:k] - k // 2
        ang = rng.uniform(0, math.pi)
        ex = rng.uniform(0.6, 1.0)
        xr = xx * math.cos(ang) + yy * math.sin(ang)
        yr = (-xx * math.sin(ang) + yy * math.cos(ang)) / ex
        d = np.sqrt(xr * xr + yr * yr) / r
        dome = np.clip(1 - d * d, 0, 1) ** 0.6 * (0.6 + 0.4 * r / 10)
        ys = (np.arange(k) + int(cy) - k // 2) % N
        xs = (np.arange(k) + int(cx) - k // 2) % N
        sub = h[np.ix_(ys, xs)]
        m = dome > sub
        sub2 = np.where(m, dome, sub)
        h[np.ix_(ys, xs)] = sub2
        g = rng.uniform(0.30, 0.62)
        warm = rng.uniform(-0.04, 0.05)
        col = np.array([g + warm, g + warm * 0.4, g - warm * 0.6])
        if rng.random() < 0.06: col = np.array([0.72, 0.70, 0.66])  # 白い石英
        if rng.random() < 0.05: col = np.array([0.42, 0.33, 0.28])  # 赤茶の石
        t = tint[np.ix_(ys, xs)]
        t[m] = col
        tint[np.ix_(ys, xs)] = t
        idm[np.ix_(ys, xs)] = np.where(m, 1.0, idm[np.ix_(ys, xs)])
    binder_n = fnoise(N, N, 2.2, seed=2)
    pits = fnoise(N, N, 1.0, fmin=80, seed=3)
    pit = np.clip((pits - 0.72) * 6, 0, 1)
    hm = h * 1.0 + binder_n * 0.15 - pit * 0.35
    # 石の表面のざらつき
    hm += fnoise(N, N, 0.8, fmin=150, seed=4) * 0.08
    binder_col = np.array([0.20, 0.20, 0.205])
    col = np.where(idm[..., None] > 0, tint, binder_col[None, None, :])
    col = col * (0.85 + 0.3 * fnoise(N, N, 1.2, fmin=40, seed=5))[..., None]
    # 風化：全体を明るい灰色へ（歩道の色）、低周波ムラ
    low = fnoise(N, N, 3.0, seed=6)
    col = col * 0.75 + 0.18 + (low[..., None] - 0.5) * 0.08
    col = col * (1 - pit[..., None] * 0.5)
    ao = cavity_ao(hm, 4, 3.0) * 0.6 + cavity_ao(hm, 12, 1.5) * 0.4
    col = col * (0.7 + 0.3 * ao[..., None])
    rough = np.clip(0.93 - idm * 0.12 + (fnoise(N, N, 1.0, fmin=60, seed=7) - 0.5) * 0.1, 0, 1)
    save('asphalt_col.jpg', col)
    save('asphalt_nrm.jpg', normal_from_height(hm, 3.2))
    save('asphalt_orm.jpg', orm(ao, rough, 0))
    # 低周波ムラ用（大きなタイル）
    big = fnoise(512, 512, 3.2, seed=8)
    stain = np.clip((fnoise(512, 512, 2.6, seed=9) - 0.62) * 3, 0, 1)
    save('ground_var.jpg', np.stack([big, stain, fnoise(512, 512, 2.0, seed=10)], -1))

# ---------- 2. 芝生 ----------
def grass():
    N = 1024
    rng = np.random.default_rng(11)
    col = np.zeros((N, N, 3)); hm = np.zeros((N, N))
    base = fnoise(N, N, 2.4, seed=12)
    soil = np.array([0.24, 0.20, 0.13])
    col[:] = soil * (0.7 + 0.5 * base[..., None])
    for i in range(26000):
        L = rng.uniform(10, 34); a = rng.uniform(-0.6, 0.6) + (math.pi / 2 if rng.random() < 0.5 else -math.pi / 2)
        x0, y0 = rng.uniform(0, N), rng.uniform(0, N)
        g = rng.uniform(0.35, 1.0)
        c = np.array([0.16 + 0.12 * g, 0.30 + 0.22 * g, 0.06 + 0.06 * g])
        if rng.random() < 0.15: c = c * np.array([1.3, 1.1, 0.8])  # 黄緑
        if rng.random() < 0.05: c = np.array([0.42, 0.40, 0.22])  # 枯れ草
        steps = int(L)
        for s in range(steps):
            t = s / steps
            x = int(x0 + math.cos(a) * s) % N; y = int(y0 + math.sin(a) * s) % N
            hh = t
            if hh >= hm[y, x]:
                hm[y, x] = hh * (0.5 + 0.5 * g)
                col[y, x] = c * (0.55 + 0.45 * t)
                x1 = (x + 1) % N
                hm[y, x1] = max(hm[y, x1], hh * 0.9 * (0.5 + 0.5 * g)); col[y, x1] = c * (0.5 + 0.45 * t)
    col = blur(col, 0.6)
    hm = blur(hm, 0.8)
    ao = cavity_ao(hm, 5, 2.5)
    col = col * (0.55 + 0.45 * ao[..., None])
    save('grass_col.jpg', col)
    save('grass_nrm.jpg', normal_from_height(hm, 5.0))
    # 3D の草の束カード（アルファ）
    W, H = 256, 256
    card = np.zeros((H, W, 4))
    for i in range(70):
        x0 = rng.uniform(10, W - 10); lean = rng.uniform(-0.5, 0.5); L = rng.uniform(H * 0.45, H * 0.98)
        wid = rng.uniform(2.0, 4.5); g = rng.uniform(0.3, 1)
        c = np.array([0.14 + 0.13 * g, 0.28 + 0.24 * g, 0.05 + 0.05 * g])
        for s in range(int(L)):
            t = s / L
            x = x0 + lean * s * t * 0.8
            y = H - 1 - s
            ww = wid * (1 - t) + 0.4
            xa = int(x - ww); xb = int(x + ww) + 1
            for xx in range(max(0, xa), min(W, xb)):
                card[y, xx, :3] = c * (0.45 + 0.6 * t)
                card[y, xx, 3] = 1
    save('grass_card.png', card)

# ---------- 3. 桜の樹皮 ----------
def bark():
    H, W = 1024, 512
    rng = np.random.default_rng(21)
    n1 = fnoise(H, W, 2.0, seed=22)
    # 横長の皮目（レンチセル）
    lent = np.zeros((H, W))
    for i in range(1400):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        L = rng.uniform(6, 26); th = rng.uniform(1.0, 2.6)
        k_w = int(L * 2 + 3) | 1; k_h = int(th * 4 + 3) | 1
        yy, xx = np.mgrid[0:k_h, 0:k_w]
        yy = yy - k_h // 2; xx = xx - k_w // 2
        d = (xx / L) ** 2 + (yy / th) ** 2
        k = np.clip(1 - d, 0, 1)
        ys = (np.arange(k_h) + int(cy)) % H; xs = (np.arange(k_w) + int(cx)) % W
        lent[np.ix_(ys, xs)] = np.maximum(lent[np.ix_(ys, xs)], k)
    # 横方向の皮のはがれ・縞
    strip = fnoise(H, W, 2.0, seed=23)
    yy = np.arange(H)[:, None] * np.ones((1, W))
    bands = 0.5 + 0.5 * np.sin(yy * 0.09 + strip * 9)
    hm = n1 * 0.6 + bands * 0.2 - lent * 0.5 + fnoise(H, W, 1.0, fmin=80, seed=24) * 0.2
    col = np.array([0.30, 0.22, 0.20])[None, None] * (0.7 + 0.5 * n1[..., None])
    col = col * (0.85 + 0.3 * bands[..., None])
    gray = np.array([0.42, 0.40, 0.38])
    moss = np.clip((fnoise(H, W, 2.8, seed=25) - 0.6) * 3, 0, 1)
    col = col * (1 - moss[..., None] * 0.5) + gray * moss[..., None] * 0.5
    col = col * (1 - lent[..., None] * 0.45) + np.array([0.48, 0.40, 0.34]) * lent[..., None] * 0.25
    ao = cavity_ao(hm, 4, 2.5)
    col *= (0.6 + 0.4 * ao[..., None])
    save('bark_col.jpg', col)
    save('bark_nrm.jpg', normal_from_height(hm, 6.0))

# ---------- 4. 桜の花カード / 花びら ----------
def petal_shape(s, rng):
    yy, xx = np.mgrid[0:s, 0:s] / (s - 1) * 2 - 1
    # 花びら：ハート形の先（切れ込み）
    r = np.sqrt(xx ** 2 * 1.9 + (yy * 0.92 + 0.05) ** 2)
    a = r < (0.95 - 0.22 * np.exp(-((xx) / 0.18) ** 2) * (yy < -0.55))
    return a

def blossoms():
    S = 512
    rng = np.random.default_rng(31)
    img = np.zeros((S, S, 4))
    # 小枝
    for b in range(5):
        x0, y0 = rng.uniform(80, 430), rng.uniform(80, 430)
        a = rng.uniform(0, math.pi * 2)
        for s in range(rng.integers(60, 160)):
            a += rng.normal(0, 0.05)
            x0 += math.cos(a); y0 += math.sin(a)
            xi, yi = int(x0), int(y0)
            if 2 < xi < S - 3 and 2 < yi < S - 3:
                img[yi - 1:yi + 2, xi - 1:xi + 2, :3] = [0.22, 0.14, 0.12]
                img[yi - 1:yi + 2, xi - 1:xi + 2, 3] = 1
    # 花
    centers = []
    for i in range(120):
        ang = rng.uniform(0, 2 * math.pi); rad = S * 0.42 * math.sqrt(rng.uniform(0, 1))
        cx, cy = S / 2 + math.cos(ang) * rad, S / 2 + math.sin(ang) * rad
        centers.append((cx, cy, rng.uniform(15, 26)))
    centers.sort(key=lambda c: c[1])
    for (cx, cy, fr) in centers:
        rot = rng.uniform(0, 2 * math.pi)
        tilt = rng.uniform(0.55, 1.0)
        shade = rng.uniform(0.85, 1.05)
        k = int(fr * 2.4) | 1
        yy, xx = np.mgrid[0:k, 0:k] - k // 2
        xx = xx.astype(float); yy = yy.astype(float) / tilt
        th = np.arctan2(yy, xx) - rot
        r = np.sqrt(xx * xx + yy * yy) / fr
        # 5枚の花びら
        pet = np.cos(th * 5) * 0.5 + 0.5
        edge = 0.62 + 0.38 * pet ** 0.5
        notch = 1 - 0.18 * np.exp(-((((th * 5 / (2 * math.pi)) % 1) - 0.5) ** 2) / 0.002)
        a = (r < edge * notch).astype(float)
        a *= (r > 0.0)
        # 色：先端ほぼ白、中心ほどピンク、中心の紅
        pink = np.array([0.98, 0.80, 0.86]); white = np.array([1.0, 0.95, 0.96]); deep = np.array([0.85, 0.35, 0.48])
        t = np.clip(r / edge, 0, 1)
        c = white[None, None] * t[..., None] + pink[None, None] * (1 - t[..., None])
        c = c * (1 - np.exp(-(r / 0.22) ** 2)[..., None]) + deep * np.exp(-(r / 0.22) ** 2)[..., None]
        # 花びらの筋
        c *= (0.94 + 0.06 * np.cos(th * 5 * 6))[..., None]
        # しべ
        stam = (np.abs(np.sin(th * 9)) > 0.93) & (r < 0.48) & (r > 0.2)
        c[stam] = [0.75, 0.42, 0.32]
        dots = (r > 0.42) & (r < 0.5) & (np.abs(np.sin(th * 9)) > 0.9)
        c[dots] = [0.92, 0.80, 0.45]
        c *= shade
        ys = np.arange(k) + int(cy) - k // 2; xs = np.arange(k) + int(cx) - k // 2
        if ys.min() < 0 or xs.min() < 0 or ys.max() >= S or xs.max() >= S: continue
        sub = img[np.ix_(ys, xs)]
        m = a > 0.5
        sub[m, :3] = c[m]; sub[m, 3] = 1
        img[np.ix_(ys, xs)] = sub
    # ふち AA
    al = blur(img[..., 3], 0.6)
    img[..., 3] = np.clip(al * 1.3, 0, 1)
    save('blossom.png', img)
    # 単体の花びら（落ちる・地面）
    P = 64
    yy, xx = np.mgrid[0:P, 0:P] / (P - 1) * 2 - 1
    r = np.sqrt((xx * 1.45) ** 2 + ((yy + 0.1) * 0.95) ** 2)
    notch = np.exp(-(xx / 0.16) ** 2) * (yy < -0.6) * 0.5
    a = np.clip((0.92 - notch - r) * 18, 0, 1)
    t = np.clip((yy + 1) / 2, 0, 1)
    c = np.stack([0.99 - 0.02 * t, 0.86 - 0.08 * t, 0.90 - 0.06 * t], -1)
    c *= (0.95 + 0.05 * np.cos(xx * 30))[..., None]
    save('petal.png', np.concatenate([c, a[..., None]], -1))
    # 遠景の葉・花の塊（ぼけ用）
    img2 = np.zeros((256, 256, 4))
    for i in range(500):
        cx, cy = rng.normal(128, 50), rng.normal(128, 50)
        rr = rng.uniform(4, 10)
        yy, xx = np.mgrid[0:256, 0:256]
        m = (xx - cx) ** 2 + (yy - cy) ** 2 < rr * rr
        g = rng.uniform(0.8, 1.05)
        img2[m, :3] = np.array([0.97, 0.82, 0.87]) * g
        img2[m, 3] = 1
    img2[..., 3] = blur(img2[..., 3], 1.2)
    save('blossom_far.png', img2)

# ---------- 5. 木材（板） ----------
def wood():
    H, W = 512, 1024
    rng = np.random.default_rng(41)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    warp = fnoise(H, W, 3.0, seed=42) * 30 + fnoise(H, W, 2.0, seed=43) * 6
    rings = np.sin((yy + warp) * 0.42) * 0.5 + 0.5
    rings = rings ** 3
    fine = fnoise(H, W, 1.0, fmin=60, seed=44)
    # 繊維方向に伸ばしたノイズ
    fib = blur(R.standard_normal((H, W)), 0.7)
    fib = np.real(np.fft.ifft2(np.fft.fft2(fib) * np.exp(-(np.fft.fftfreq(W)[None, :] * 180) ** 2)))
    fib = norm01(fib)
    hm = rings * 0.35 + fib * 0.4 + fine * 0.1
    # 節
    for k in range(3):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        d = np.sqrt(((xx - cx) / 2.2) ** 2 + (yy - cy) ** 2)
        hm -= np.exp(-(d / 9) ** 2) * 0.4
    base = np.array([0.55, 0.38, 0.22])
    col = base[None, None] * (0.75 + 0.35 * fib[..., None]) * (1 - 0.28 * rings[..., None])
    col *= (0.9 + 0.2 * fnoise(H, W, 3.0, seed=45))[..., None]
    ao = cavity_ao(hm, 3, 2)
    rough = 0.62 + 0.2 * rings + (fine - 0.5) * 0.1
    save('wood_col.jpg', col)
    save('wood_nrm.jpg', normal_from_height(hm, 2.5))
    save('wood_orm.jpg', orm(ao, rough, 0))

# ---------- 6. 車の塗装（ゆず肌＋細かい傷） ----------
def carpaint():
    N = 512
    rng = np.random.default_rng(51)
    peel = fnoise(N, N, 2.0, fmin=10, fmax=60, seed=52)
    hm = peel * 0.25
    scratch = np.zeros((N, N))
    for i in range(260):
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        a = rng.uniform(0, math.pi); L = rng.uniform(10, 90)
        for s in range(int(L)):
            xi = int(x + math.cos(a) * s) % N; yi = int(y + math.sin(a) * s) % N
            scratch[yi, xi] = max(scratch[yi, xi], rng.uniform(0.3, 1))
    hm = hm - scratch * 0.06
    save('paint_nrm.jpg', normal_from_height(hm, 1.6))
    # 粗さ：傷・小さな汚れ
    dirt = np.clip((fnoise(N, N, 2.0, seed=53) - 0.55) * 2, 0, 1)
    rough = np.clip(0.04 + scratch * 0.35 + dirt * 0.25, 0, 1)
    flakes = (rng.random((N, N)) > 0.985).astype(float) * rng.random((N, N))
    save('paint_orm.jpg', orm(1 - dirt * 0.15, rough, 0.25 + flakes * 0.7))

# ---------- 7. タイヤ ----------
def tire():
    H, W = 256, 1024  # u: 周方向(W), v: 幅方向(H)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    v = yy / H
    hm = np.zeros((H, W))
    # ブロック溝
    period = W / 40
    ph = (xx + np.where(v < 0.5, 0, period / 2)) % period / period
    groove_x = (ph < 0.16).astype(float)
    groove_v = (np.abs(v - 0.5) < 0.035).astype(float)
    side = (np.abs(v - 0.5) > 0.42).astype(float)
    hm = 1 - np.clip(groove_x + groove_v, 0, 1) * (1 - side)
    hm = blur(hm, 1.2)
    hm += fnoise(H, W, 1.0, fmin=40, seed=61) * 0.06
    col = np.ones((H, W, 3)) * 0.055 * (0.8 + 0.4 * fnoise(H, W, 1.8, seed=62))[..., None]
    col = col * (0.6 + 0.4 * hm[..., None])
    # 土ぼこり
    dust = np.clip((fnoise(H, W, 2.0, seed=63) - 0.55) * 2, 0, 1) * 0.08
    col += dust[..., None] * np.array([0.6, 0.55, 0.5])
    ao = cavity_ao(hm, 3, 3)
    save('tire_col.jpg', col)
    save('tire_nrm.jpg', normal_from_height(hm, 6))
    save('tire_orm.jpg', orm(ao, 0.82 - hm * 0.1, 0))

# ---------- 8. 金属（へアライン＋傷） ----------
def metal():
    N = 512
    rng = np.random.default_rng(71)
    w = R.standard_normal((N, N))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(N)[:, None]; fx = np.fft.fftfreq(N)[None, :]
    brushed = norm01(np.real(np.fft.ifft2(F * np.exp(-(fx * 300) ** 2) * np.exp(-(fy * 2) ** 2 * 0))))
    scratch = np.zeros((N, N))
    for i in range(140):
        x, y = rng.uniform(0, N), rng.uniform(0, N); a = rng.uniform(0, math.pi); L = rng.uniform(8, 60)
        for s in range(int(L)):
            scratch[int(y + math.sin(a) * s) % N, int(x + math.cos(a) * s) % N] = 1
    hm = brushed * 0.3 - scratch * 0.2
    save('metal_nrm.jpg', normal_from_height(hm, 1.2))
    smudge = fnoise(N, N, 2.5, seed=72)
    save('metal_orm.jpg', orm(np.ones((N, N)), np.clip(0.12 + brushed * 0.1 + scratch * 0.2 + smudge * 0.12, 0, 1), 1.0))

# ---------- 9. 布：ニット / デニム / 綿 / 帆布 ----------
def knit():
    N = 512
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    cw, ch = N / 16, N / 24  # 編み目
    u = (xx % cw) / cw; v = (yy % ch) / ch
    # V 字のループ：左右 2 本のうね
    left = np.exp(-((u - 0.27 - (v - 0.5) * 0.25) / 0.17) ** 2)
    right = np.exp(-((u - 0.73 + (v - 0.5) * 0.25) / 0.17) ** 2)
    loop = np.maximum(left, right) * (0.6 + 0.4 * np.sin(v * math.pi))
    fuzz = fnoise(N, N, 0.6, fmin=120, seed=81)
    hm = loop + fuzz * 0.25
    ao = cavity_ao(hm, 3, 2)
    alb = 0.75 + 0.25 * loop + (fuzz - 0.5) * 0.15
    save('knit_nrm.jpg', normal_from_height(hm, 5))
    save('knit_col.jpg', np.stack([alb * ao] * 3, -1))

def denim():
    N = 512
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    tw = np.sin((xx + yy) * (2 * math.pi / 6.4)) * 0.5 + 0.5
    thr = fnoise(N, N, 1.0, fmin=60, seed=91)
    slub = blur(R.standard_normal((N, N)), 1)
    slub = norm01(np.real(np.fft.ifft2(np.fft.fft2(slub) * np.exp(-(np.fft.fftfreq(N)[:, None] * 120) ** 2))))
    hm = tw * 0.6 + thr * 0.3
    blue = np.array([0.14, 0.22, 0.38]); white = np.array([0.75, 0.76, 0.80])
    t = (tw * 0.35 + slub * 0.45 + thr * 0.2)
    col = blue * (0.6 + 0.6 * t[..., None]) + white * (0.18 * (1 - tw[..., None]) * (0.6 + thr[..., None] * 0.6))
    col *= (0.85 + 0.3 * fnoise(N, N, 3.0, seed=92))[..., None]
    save('denim_col.jpg', col)
    save('denim_nrm.jpg', normal_from_height(hm, 3))

def cotton():
    N = 512
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    p = 4.0
    warp = np.sin(xx * 2 * math.pi / p) * 0.5 + 0.5
    weft = np.sin(yy * 2 * math.pi / p) * 0.5 + 0.5
    chk = ((np.floor(xx / p) + np.floor(yy / p)) % 2)
    hm = np.where(chk > 0, warp, weft) * 0.6 + fnoise(N, N, 1.2, fmin=40, seed=101) * 0.4
    alb = 0.8 + 0.2 * hm
    save('cotton_nrm.jpg', normal_from_height(hm, 2.2))
    save('cotton_col.jpg', np.stack([alb] * 3, -1))

# ---------- 10. 肌 ----------
def skin():
    N = 512
    rng = np.random.default_rng(111)
    pores = np.zeros((N, N))
    for i in range(5000):
        x, y = int(rng.uniform(0, N)), int(rng.uniform(0, N))
        pores[y, x] = rng.uniform(0.5, 1)
    pores = blur(pores, 0.9)
    wr = fnoise(N, N, 1.6, fmin=8, seed=112)
    lines = np.abs(np.sin((wr) * 40)) ** 8
    hm = -pores * 1.5 + fnoise(N, N, 1.0, fmin=60, seed=113) * 0.25 - lines * 0.1
    save('skin_nrm.jpg', normal_from_height(norm01(hm), 2.5))
    mott = fnoise(N, N, 2.5, seed=114)
    red = fnoise(N, N, 2.0, seed=115)
    alb = np.stack([0.98 + 0.04 * red, 0.92 - 0.04 * red, 0.88 - 0.03 * red], -1) * (0.92 + 0.1 * mott[..., None])
    save('skin_col.jpg', np.clip(alb, 0, 1))

# ---------- 11. 髪の束（アルファ） ----------
def hair():
    H, W = 512, 256
    rng = np.random.default_rng(121)
    img = np.zeros((H, W, 4))
    for i in range(900):
        x = rng.uniform(0, W); w = rng.uniform(0.5, 1.4); L = rng.uniform(0.6, 1.0) * H
        curve = rng.uniform(-6, 6)
        sh = rng.uniform(0.6, 1.2)
        c = np.array([0.075, 0.050, 0.036]) * sh
        for y in range(int(L)):
            t = y / H
            xx = x + curve * t * t
            xi = int(xx) % W
            a = 1 - (y / L) ** 3
            hl = 1 + 0.9 * math.exp(-((t - 0.3) / 0.06) ** 2)
            img[y, xi, :3] = np.maximum(img[y, xi, :3], c * hl)
            img[y, xi, 3] = max(img[y, xi, 3], a * 0.9)
    img[..., 3] = np.clip(blur(img[..., 3], 0.5) * 1.6, 0, 1)
    img[..., :3] = np.maximum(blur(img[..., :3], 0.5), 0.02)
    save('hair.png', img)

# ---------- 12. 麦わら帽子の編み目 ----------
def straw():
    N = 512
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    s = N / 16
    u = xx / s; v = yy / s
    row = np.floor(v)
    off = (row % 2) * 0.5
    uu = (u + off) % 1
    vv = v % 1
    # 横に走る麦の帯、ところどころ上下に交差
    band = np.exp(-((vv - 0.5) / 0.32) ** 2)
    ridge = 0.5 + 0.5 * np.cos(uu * 2 * math.pi)
    fib = blur(R.standard_normal((N, N)), 0.8)
    fib = norm01(np.real(np.fft.ifft2(np.fft.fft2(fib) * np.exp(-(np.fft.fftfreq(N)[None, :] * 90) ** 2))))
    hm = band * (0.6 + 0.4 * ridge) + fib * 0.25
    col = np.array([0.80, 0.66, 0.42])[None, None] * (0.7 + 0.35 * fib[..., None]) * (0.6 + 0.4 * band[..., None])
    col *= (0.92 + 0.12 * fnoise(N, N, 2.0, seed=131))[..., None]
    ao = cavity_ao(hm, 3, 2)
    save('straw_col.jpg', col * (0.6 + 0.4 * ao[..., None]))
    save('straw_nrm.jpg', normal_from_height(hm, 5))

# ---------- 13. 段ボール ----------
def cardboard():
    N = 512
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    corr = np.sin(xx * 2 * math.pi / 14) * 0.5 + 0.5
    fibers = fnoise(N, N, 1.4, fmin=30, seed=141)
    hm = corr * 0.18 + fibers * 0.3
    col = np.array([0.62, 0.46, 0.30])[None, None] * (0.8 + 0.3 * fibers[..., None]) * (0.95 + 0.05 * corr[..., None])
    stains = np.clip((fnoise(N, N, 2.6, seed=142) - 0.65) * 2, 0, 1)
    col *= (1 - stains[..., None] * 0.18)
    save('cardboard_col.jpg', col)
    save('cardboard_nrm.jpg', normal_from_height(hm, 2))

# ---------- 14. ゴムボールの粒 ----------
def pebble():
    N = 512
    rng = np.random.default_rng(151)
    hm = np.zeros((N, N))
    for i in range(7000):
        cx, cy = rng.uniform(0, N), rng.uniform(0, N); r = rng.uniform(2, 4.5)
        k = int(r * 2 + 3) | 1
        yy, xx = np.mgrid[0:k, 0:k] - k // 2
        d = np.clip(1 - (xx * xx + yy * yy) / (r * r), 0, 1) ** 0.7
        splat_periodic(hm, cx, cy, d)
    save('pebble_nrm.jpg', normal_from_height(hm, 1.6))

# ---------- 15. チョーク（棒・粉） ----------
def chalk():
    N = 256
    n = fnoise(N, N, 0.8, fmin=20, seed=161)
    pits = np.clip((fnoise(N, N, 1.0, fmin=30, seed=162) - 0.7) * 4, 0, 1)
    hm = n * 0.5 - pits * 0.5
    save('chalk_nrm.jpg', normal_from_height(hm, 3))
    # 塗り用ブラシ（ざらざらの円）
    S = 128
    yy, xx = np.mgrid[0:S, 0:S] / (S - 1) * 2 - 1
    r = np.sqrt(xx * xx + yy * yy)
    g = fnoise(S, S, 0.6, fmin=8, seed=163)
    a = np.clip((1 - r) * 2.2, 0, 1) * np.clip(g * 1.6 - 0.15, 0, 1)
    a = np.clip(a * 1.4, 0, 1)
    save('brush.png', np.stack([np.ones_like(a), np.ones_like(a), np.ones_like(a), a], -1))
    # 細粒（ノイズ）タイル
    save('grain.jpg', np.stack([fnoise(256, 256, 0.3, fmin=40, seed=164), fnoise(256, 256, 1.0, fmin=10, seed=165), fnoise(256, 256, 2.0, seed=166)], -1))

# ---------- 16. キラッ ----------
def sparkle():
    S = 64
    yy, xx = np.mgrid[0:S, 0:S] / (S - 1) * 2 - 1
    r = np.sqrt(xx * xx + yy * yy)
    star = np.exp(-np.abs(xx) * 30) * np.exp(-np.abs(yy) * 3) + np.exp(-np.abs(yy) * 30) * np.exp(-np.abs(xx) * 3)
    core = np.exp(-(r / 0.15) ** 2)
    a = np.clip(star * 0.8 + core, 0, 1) * np.clip(1 - r, 0, 1)
    save('spark.png', np.stack([a, a, a, a], -1))
    # やわらかい丸（煙・ぼけ・接地影）
    soft = np.clip(1 - r, 0, 1) ** 2
    save('soft.png', np.stack([soft, soft, soft, soft], -1))

if __name__ == '__main__':
    import sys
    todo = sys.argv[1:] or ['asphalt', 'grass', 'bark', 'blossoms', 'wood', 'carpaint', 'tire', 'metal', 'knit', 'denim', 'cotton', 'skin', 'hair', 'straw', 'cardboard', 'pebble', 'chalk', 'sparkle']
    for t in todo:
        globals()[t]()
