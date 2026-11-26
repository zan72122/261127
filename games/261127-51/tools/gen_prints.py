# Print masks (latent residue shapes), white = residue.  PNG, single channel.
#   finger.png  fingerprint whorl with ridge lines (about 15 x 20 mm)
#   paw.png     puppy paw print (4 toe pads + heel pad, skin texture)
#   hand.png    child hand print (palm creases, finger ridges)
#   sock.png    adult sock smudge (knit texture)
#   nose.png    dog nose smudge
import sys, os
import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'tex'
os.makedirs(OUT, exist_ok=True)


def noise(n, scale, seed):
    r = np.random.default_rng(seed)
    w = r.standard_normal((n, n))
    F = np.fft.fft2(w)
    f = np.sqrt(np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2) * n
    f[0, 0] = 1
    a = np.exp(-(f / scale) ** 2)
    o = np.real(np.fft.ifft2(F * a))
    return (o - o.mean()) / (o.std() + 1e-9)


def save(name, a):
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'L').save(f'{OUT}/{name}.png', optimize=True)
    print('wrote', name)


def ridges(x, y, n, seed, period=0.032, whorl=(0.0, 0.1)):
    """Ridge field: concentric loops around the core, flattening to arches at the base."""
    cx, cy = whorl
    dx, dy = x - cx, (y - cy) * 1.15
    r = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    warp = noise(n, 3, seed) * 0.012 + noise(n, 10, seed + 1) * 0.0015
    # blend from loops (r) to arches (y) far from the core
    t = np.clip((r - 0.42) / 0.5, 0, 1)
    t = t * t * (3 - 2 * t)
    field = r * (1 - t) + (0.42 + (y - cy) * 0.55 + 0.25 * x * x) * t + warp
    v = np.sin(field / period * 2 * np.pi)
    # minutiae: break ridges with sparse noise
    br = noise(n, 40, seed + 2)
    v = v - (br > 2.3) * 1.2
    return v


def finger():
    n = 512
    y, x = (np.mgrid[0:n, 0:n] / n * 2 - 1)
    shape = (x / 0.62) ** 2 + ((y + 0.05) / 0.88) ** 2
    edge = np.clip((1 - shape) / 0.25, 0, 1)
    v = ridges(x, y, n, 3)
    m = np.clip(v * 1.6 + 0.2, 0, 1) * edge
    m *= np.clip(0.75 + noise(n, 5, 9) * 0.25, 0, 1)  # uneven pressure
    save('finger', m)


def pad(x, y, cx, cy, rx, ry, rot=0):
    c, s = np.cos(rot), np.sin(rot)
    dx, dy = x - cx, y - cy
    u = dx * c + dy * s
    v = -dx * s + dy * c
    return (u / rx) ** 2 + (v / ry) ** 2


def paw():
    n = 256
    y, x = (np.mgrid[0:n, 0:n] / n * 2 - 1)
    d = np.full((n, n), 9.0)
    # heel pad (trilobed)
    heel = np.minimum(pad(x, y, 0, 0.35, 0.42, 0.32), np.minimum(pad(x, y, -0.22, 0.45, 0.22, 0.2), pad(x, y, 0.22, 0.45, 0.22, 0.2)))
    d = np.minimum(d, heel)
    for cx, cy, rot in ((-0.5, -0.12, 0.4), (-0.18, -0.48, 0.1), (0.18, -0.48, -0.1), (0.5, -0.12, -0.4)):
        d = np.minimum(d, pad(x, y, cx, cy, 0.17, 0.23, rot))
    m = np.clip((1 - d) / 0.35, 0, 1)
    tex = np.clip(0.65 + noise(n, 50, 4) * 0.35, 0, 1)  # pad skin papillae
    m = m * tex * np.clip(0.8 + noise(n, 6, 5) * 0.3, 0, 1)
    save('paw', m)


def hand():
    n = 512
    y, x = (np.mgrid[0:n, 0:n] / n * 2 - 1)
    # palm towards bottom, fingers up
    d = pad(x, y, 0.0, 0.38, 0.42, 0.42)
    fingers = [(-0.33, -0.22, 0.12, 0.30, 0.22), (-0.11, -0.40, 0.13, 0.40, 0.05), (0.13, -0.42, 0.13, 0.41, -0.04), (0.34, -0.30, 0.12, 0.36, -0.16)]
    for cx, cy, rx, ry, rot in fingers:
        d = np.minimum(d, pad(x, y, cx, cy, rx, ry, rot))
        # finger tip pads separated by joint creases
    d = np.minimum(d, pad(x, y, -0.52, 0.30, 0.14, 0.30, 0.9))  # thumb
    m = np.clip((1 - d) / 0.2, 0, 1)
    # creases
    crease = np.zeros((n, n))
    for cy, cx, w in ((0.15, 0.05, 0.4), (0.33, 0.0, 0.42), (0.55, -0.2, 0.25)):
        crease += np.exp(-((y - cy - 0.15 * x * x - 0.1 * x) / 0.012) ** 2) * (np.abs(x - cx) < w)
    for cx, cy, rx, ry, rot in fingers:
        for k in (0.35, -0.2):
            crease += np.exp(-((y - (cy + ry * k)) / 0.01) ** 2) * (np.abs(x - cx) < rx * 0.9)
    v = ridges(x * 0.7, y * 0.7, n, 11, period=0.018, whorl=(0.0, 0.3))
    m = m * np.clip(v * 0.5 + 0.7, 0, 1) * (1 - np.clip(crease, 0, 1) * 0.9)
    m *= np.clip(0.8 + noise(n, 5, 12) * 0.3, 0, 1)
    save('hand', m)


def sock():
    n = 256
    y, x = (np.mgrid[0:n, 0:n] / n * 2 - 1)
    d = np.minimum(pad(x, y, 0, -0.35, 0.36, 0.5), pad(x, y, 0, 0.5, 0.28, 0.38))
    m = np.clip((1 - d) / 0.5, 0, 1)
    knit = np.sin(x * 70) * np.sin(y * 40 + np.abs(np.sin(x * 35)) * 2)
    m = m * np.clip(0.6 + knit * 0.25 + noise(n, 30, 13) * 0.2, 0, 1)
    save('sock', m)


def nose():
    n = 128
    y, x = (np.mgrid[0:n, 0:n] / n * 2 - 1)
    d = pad(x, y, 0, 0.05, 0.75, 0.5)
    d = np.minimum(d, 9)
    nostrils = np.minimum(pad(x, y, -0.3, -0.05, 0.14, 0.1), pad(x, y, 0.3, -0.05, 0.14, 0.1))
    m = np.clip((1 - d) / 0.4, 0, 1) * (1 - np.clip((1 - nostrils) / 0.3, 0, 1))
    m *= np.clip(0.5 + noise(n, 30, 14) * 0.4, 0, 1)
    save('nose', m)


if __name__ == '__main__':
    finger(); paw(); hand(); sock(); nose()
