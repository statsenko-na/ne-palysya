"""Pixel edits on generated character frames (dev only, used by normalize_sprites.py).

remove_glasses   — everything inside the face hull within the eye band that is
                   neither skin, eye nor hair is repainted with nearby skin.
remove_moustache — same idea for the band under the nose, then a mouth is drawn.
Works on full-resolution source frames before downscaling.
"""
import numpy as np
from scipy import ndimage


def channels(px):
    return px[..., 0].astype(int), px[..., 1].astype(int), px[..., 2].astype(int)


def lum(px):
    r, g, b = channels(px)
    return 0.3 * r + 0.59 * g + 0.11 * b


def skin_mask(px):
    r, g, b = channels(px)
    sat = (r - b) / np.maximum(r, 1)
    return (px[..., 3] > 200) & (r > g) & (g > b) & (r - b > 38) & (lum(px) > 125) & (r > 170) & (sat > 0.24)


def hair_mask(px):
    r, g, b = channels(px)
    sat = (r - b) / np.maximum(r, 1)
    return (px[..., 3] > 200) & (r > g) & (g >= b) & (r - b > 30) & (sat > 0.38) & (lum(px) < 135) & (lum(px) > 30)


def eye_mask(px):
    """Радужка + зрачок + белок рядом с радужкой; блики на линзах сюда не входят."""
    r, g, b = channels(px)
    L = lum(px)
    iris = (b > r + 2) & (L > 55) & (L < 200) & (px[..., 3] > 200)
    lab, n = ndimage.label(iris)
    core = np.zeros_like(iris)
    for i in range(1, n + 1):
        comp = lab == i
        if 8 <= comp.sum() <= 400:
            core |= comp
    near = ndimage.binary_dilation(core, structure=np.ones((1, 7)))  # белок — слева/справа от радужки
    white = (L > 195) & (abs(r - b) < 45)
    dark = L < 100
    return core | (near & white & (L > 225)) | (ndimage.binary_dilation(core, iterations=3) & dark)


def inpaint(arr, mask, known, sigma=5):
    """Гладкая заливка: нормализованная гауссова свёртка по пикселям кожи."""
    known = known & ~mask
    w = ndimage.gaussian_filter(known.astype(float), sigma)
    res = arr.copy()
    for ch in range(3):
        v = ndimage.gaussian_filter(arr[..., ch].astype(float) * known, sigma)
        fill = v / np.maximum(w, 1e-6)
        res[..., ch] = np.where(mask & (w > 1e-4), fill.clip(0, 255), arr[..., ch]).astype(np.uint8)
    return res


def top_of(arr):
    ys, _ = np.nonzero(arr[..., 3] > 40)
    return ys.min()


def face_hull(skin, shrink):
    hull = np.zeros_like(skin)
    for y in range(skin.shape[0]):
        xs = np.nonzero(skin[y])[0]
        if len(xs) > 4:
            hull[y, xs.min() + shrink:xs.max() - shrink + 1] = True
    return hull


def head_center(arr, t):
    ys, xs = np.nonzero(arr[t:t + 100, :, 3] > 40)
    return int(np.median(xs))


def _repaint(arr, band, halfw, keep_hair, reach, shift=0):
    t = top_of(arr)
    cx = head_center(arr, t) + shift
    y0, y1 = t + band[0], t + band[1]
    x0, x1 = max(0, cx - halfw), cx + halfw
    sub = arr[y0:y1, x0:x1]
    r, g, b = channels(sub)
    skin = skin_mask(sub)
    inside = ndimage.binary_erosion(arr[..., 3] > 10, iterations=4)[y0:y1, x0:x1]
    near_skin = ndimage.binary_dilation(skin, iterations=reach)
    keep = skin | eye_mask(sub) | ((b > r + 10) & (lum(sub) > 120))  # рубашку не трогаем
    if keep_hair:
        keep |= hair_mask(sub) & (lum(sub) >= 55)
    kill = inside & near_skin & ~keep
    mask = np.zeros(arr.shape[:2], bool)
    mask[y0:y1, x0:x1] = kill
    known = np.zeros(arr.shape[:2], bool)
    ky0 = max(0, y0 - 20)
    known[ky0:y1 + 20, x0:x1] = skin_mask(arr[ky0:y1 + 20, x0:x1])
    out = inpaint(arr, mask, known)
    out[..., 3] = np.where(mask, 255, out[..., 3])
    return out, mask


def remove_glasses(arr, boxes=None):
    """Геометрически: вокруг каждой радужки — прямоугольник линзы (верх ниже бровей).
    Внутри стирается всё, кроме кожи и самого глаза; плюс перемычка между линзами."""
    t = top_of(arr)
    y_off = t + 40
    head = arr[y_off:t + 115]
    r, g, b = channels(head)
    L = lum(head)
    iris = (b > r + 2) & (L > 55) & (L < 200) & (head[..., 3] > 200)
    if boxes:  # заданы вручную (ya, yb, xa, xb) в координатах кадра
        boxes = [(ya - y_off, yb - y_off, xa, xb) for (ya, yb, xa, xb) in boxes]
    else:
        lab, n = ndimage.label(iris)
        boxes = []
        for i in range(1, n + 1):
            ys, xs = np.nonzero(lab == i)
            if 8 <= len(ys) <= 400:
                boxes.append((ys.min(), ys.max(), xs.min(), xs.max()))
    if not boxes:
        return arr
    # глаза: радужка + зрачок внутри неё + белок вплотную по горизонтали
    eye = np.zeros_like(iris)
    for (ya, yb, xa, xb) in boxes:
        eye[ya:yb + 1, max(0, xa - 5):xb + 6] |= (L[ya:yb + 1, max(0, xa - 5):xb + 6] > 200) | iris[ya:yb + 1, max(0, xa - 5):xb + 6]
        eye[ya:yb + 1, xa:xb + 1] = True
    zone = np.zeros_like(iris)
    for (ya, yb, xa, xb) in boxes:
        zone[max(0, ya - 8):yb + 18, max(0, xa - 20):xb + 21] = True
    if len(boxes) >= 2:
        bs = sorted(boxes, key=lambda bx: bx[2])
        ya = min(bx[0] for bx in bs[:2])
        zone[max(0, ya - 8):ya + 4, bs[0][3]:bs[1][2] + 1] = True  # перемычка
    skin = skin_mask(head)
    inside = ndimage.binary_erosion(head[..., 3] > 10, iterations=4)
    kill = zone & inside & ~skin & ~eye
    kill = ndimage.binary_dilation(kill, iterations=1) & zone & inside & ~eye
    mask = np.zeros(arr.shape[:2], bool)
    mask[y_off:t + 115] = kill
    known = np.zeros(arr.shape[:2], bool)
    known[y_off - 10:t + 125] = skin_mask(arr[y_off - 10:t + 125])
    return inpaint(arr, mask, known, sigma=3)


def remove_moustache(arr, band=(76, 110)):
    out, mask = _repaint(arr, band, 50, keep_hair=False, reach=14)
    ys, xs = np.nonzero(mask)
    if len(xs) < 20:
        return out
    # рот: короткая сжатая линия (Директор недоволен) + лёгкая тень под носом
    cy = int(np.percentile(ys, 72))
    cx = int(np.median(xs))
    half = max(6, int((np.percentile(xs, 90) - np.percentile(xs, 10)) * 0.2))
    out[cy:cy + 3, cx - half:cx + half, :3] = (104, 48, 40)
    out[cy + 3:cy + 5, cx - half + 2:cx + half - 2, :3] = (out[cy + 3:cy + 5, cx - half + 2:cx + half - 2, :3] * 0.9).astype(np.uint8)
    return out
