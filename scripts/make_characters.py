"""Пиксельные правки персонажей v3 (dev-инструмент, игре не нужен).

Запуск: python3 scripts/make_characters.py   (нужны Pillow и numpy)

bykentiy-walk-v3.png — Быкентий по референсу: зализанные назад тёмно-русые волосы
                       с хвостиком, высокий лоб, лёгкая щетина, голубые глаза.
coworkers-v3.png     — Аймашын теперь казах в белой футболке: андеркат-фейд,
                       пучок с косичками сверху, щетина-эспаньолка, серьга.
extras-v1.png        — второй ряд: Асель (бывший спрайт Аймашын), стажёр Ержан,
                       Сиргей «на созвоне», Тигран в аквагриме тигра.
Исходники v2 не меняются.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / 'assets'


def load(name):
    return np.array(Image.open(A / name).convert('RGBA')).astype(int)


def save(arr, name):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA').save(A / name)


def ch(px):
    return px[..., 0], px[..., 1], px[..., 2], px[..., 3]


def lum(px):
    r, g, b, _ = ch(px)
    return 0.3 * r + 0.59 * g + 0.11 * b


def skin_mask(px):
    r, g, b, al = ch(px)
    return (al > 200) & (r > 190) & (g > 125) & (b > 80) & (r - b > 55)


def hair_mask(px):
    r, g, b, al = ch(px)
    return (al > 120) & (r >= g) & (g >= b - 4) & (lum(px) < 150) & ~skin_mask(px) & (r - b > 12)


def put(fr, x, y, col, a=255):
    h, w = fr.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        fr[y, x, :3] = col
        fr[y, x, 3] = a


def ell(cx, cy, rx, ry, shape):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1


def shift(m, dy, dx):
    out = np.zeros_like(m)
    h, w = m.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = m[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return out


def outline(fr, near, color=(34, 24, 18)):
    """Тёмный контур по краю непрозрачной области — только рядом с маской near."""
    al = fr[..., 3] > 100
    edge = np.zeros_like(al)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        edge |= shift(al, dy, dx) & ~al
    edge &= near
    fr[edge, :3] = color
    fr[edge, 3] = 255


def drop_specks(fr, min_px=12):
    from scipy import ndimage
    lab, n = ndimage.label(fr[..., 3] > 40)
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < min_px:
            fr[m, 3] = 0


def fill_from_below(fr, mask):
    """Закрашивает маску кожей, протягивая ближайший пиксель кожи снизу по столбцу."""
    skin = skin_mask(fr)
    ys, xs = np.nonzero(mask)
    for y, x in sorted(zip(ys, xs), key=lambda t: -t[0]):
        for yy in range(y + 1, min(fr.shape[0], y + 14)):
            if skin[yy, x] or (mask[yy, x] and fr[yy, x, 3] == 255 and skin_mask(fr[yy:yy + 1, x:x + 1])[0, 0]):
                fr[y, x, :3] = fr[yy, x, :3]
                fr[y, x, 3] = 255
                break


def recolor(fr, mask, target, keep_shade=True):
    """Перекраска с сохранением светотени исходника."""
    L = lum(fr)
    ref = np.median(L[mask]) if mask.any() else 128
    k = (L / max(ref, 1)).clip(0.45, 1.5) if keep_shade else 1
    for i in range(3):
        v = np.array(target[i]) * k
        fr[..., i] = np.where(mask, v, fr[..., i])


# ---------------- БЫКЕНТИЙ ----------------
def blend(fr, x, y, col, k):
    if 0 <= y < fr.shape[0] and 0 <= x < fr.shape[1] and fr[y, x, 3] > 200:
        fr[y, x, :3] = (fr[y, x, :3] * (1 - k) + np.array(col) * k).astype(int)


def paint_face(fr, cx, cy):
    skin = skin_mask(fr)
    ok = lambda x, y: 0 <= y < fr.shape[0] and 0 <= x < fr.shape[1] and fr[y, x, 3] > 200
    # лоб и щёки — ровный тон с лёгкой тенью под скулами
    for y in range(cy - 4, cy + 12):
        for x in range(cx - 4, cx + 12):
            if ok(x, y) and skin[y, x]:
                blend(fr, x, y, (236, 176, 130), 0.35)
    for y in range(cy + 9, cy + 13):
        for x in (cx - 3, cx - 2, cx + 9, cx + 10):
            blend(fr, x, y, (196, 132, 94), 0.45)
    # убрать тёмные точки-артефакты на лбу
    for y in range(cy - 4, cy + 4):
        for x in range(cx - 2, cx + 10):
            if ok(x, y) and lum(fr[y:y + 1, x:x + 1])[0, 0] < 90 and ok(x - 1, y) and ok(x + 1, y) \
                    and skin_mask(fr[y:y + 1, x - 1:x])[0, 0] and skin_mask(fr[y:y + 1, x + 1:x + 2])[0, 0]:
                fr[y, x, :3] = (236, 176, 130)
    # брови — прямые, тёмно-русые
    for x in range(cx - 3, cx + 1):
        blend(fr, x, cy + 5, (84, 62, 46), 0.9)
    for x in range(cx + 6, cx + 10):
        blend(fr, x, cy + 5, (84, 62, 46), 0.9)
    # веки и глаза (голубо-серые, чуть глубоко посаженные)
    for x in range(cx - 3, cx + 1):
        blend(fr, x, cy + 6, (180, 116, 84), 0.6)
    for x in range(cx + 6, cx + 10):
        blend(fr, x, cy + 6, (180, 116, 84), 0.6)
    for x, col in ((cx - 3, (226, 214, 204)), (cx - 2, (92, 130, 170)), (cx - 1, (36, 44, 56)), (cx, (214, 196, 186)),
                   (cx + 6, (214, 196, 186)), (cx + 7, (92, 130, 170)), (cx + 8, (36, 44, 56)), (cx + 9, (226, 214, 204))):
        blend(fr, x, cy + 7, col, 1)
    for x in (cx - 2, cx + 7):
        blend(fr, x, cy + 8, (200, 140, 104), 0.5)  # мешки под глазами — айтишник же
    # нос — длинный прямой: тень по боку и кончик
    for y in range(cy + 7, cy + 12):
        blend(fr, cx + 2, y, (200, 136, 98), 0.55)
    blend(fr, cx + 3, cy + 7, (250, 200, 160), 0.5)
    for x in (cx + 2, cx + 4):
        blend(fr, x, cy + 12, (170, 104, 76), 0.7)
    blend(fr, cx + 3, cy + 12, (214, 150, 110), 0.5)
    # усы, губы, эспаньолка
    for x in range(cx, cx + 7):
        blend(fr, x, cy + 13, (118, 88, 66), 0.55)
    for x in range(cx + 1, cx + 6):
        blend(fr, x, cy + 14, (160, 84, 70), 0.75)
    blend(fr, cx + 3, cy + 15, (200, 130, 100), 0.4)
    for y in range(cy + 16, cy + 19):
        for x in range(cx + 1, cx + 6):
            blend(fr, x, y, (110, 82, 62), 0.55 if (x + y) % 2 == 0 else 0.35)
    for y in range(cy + 13, cy + 18):
        for x in (cx - 2, cx - 1, cx + 8, cx + 9):
            if (x + y) % 2 == 0:
                blend(fr, x, y, (120, 92, 70), 0.3)



def bykentiy():
    src = load('bykentiy-walk-v2.png')
    out = src.copy()
    FW = 64
    for f in range(4):
        fr = out[:, f * FW:(f + 1) * FW]
        skin = skin_mask(fr)
        ys, xs = np.nonzero(skin[:40])
        dx, dy = xs.max() - 43, ys.min() - 16
        cx, cy = 33 + dx, 17 + dy
        yy, xx = np.mgrid[0:fr.shape[0], 0:FW]
        top = yy < 34 + dy
        hair = hair_mask(fr) & top
        skull = ell(cx, cy, 11.5, 12.5, fr.shape[:2])
        tail = ell(cx - 11, cy - 9, 4.5, 6, fr.shape[:2])
        # 1) пышная шевелюра → прилизано: всё вне черепа и хвоста убираем (с полупрозрачной бахромой)
        cut = top & ~skull & ~tail & ~skin_mask(fr) & (xx < cx + 16) & ((fr[..., 3] < 200) | hair)
        cut &= ~((yy > cy + 8) & (xx > cx - 4))
        fr[cut, 3] = 0
        # 2) высокий лоб: чёлка над лицом превращается в кожу (дуга линии роста волос)
        line = cy - 5 + (np.abs(xx - (cx + 4)) ** 2) // 18
        brow = hair & (xx >= cx - 4) & (xx <= cx + 11) & (yy >= line) & (yy <= cy + 4)
        brow |= (xx >= cx - 3) & (xx <= cx + 10) & (yy >= line) & (yy <= cy + 2) & (fr[..., 3] > 0) & (lum(fr) > 70)
        dark = (fr[..., 3] > 0) & (lum(fr) <= 70) & (yy >= line) & (yy <= cy + 1) & (xx >= cx - 2) & (xx <= cx + 9)
        brow |= dark & shift(brow, 0, 1) & shift(brow, 0, -1)
        fr[brow, 3] = 255
        fr[brow, :3] = (238, 178, 132)
        hi = brow & (xx > cx + 1) & (xx < cx + 8) & (yy < cy - 1)
        fr[hi, :3] = (246, 192, 148)
        sh = brow & ~shift(brow, 1, 0)  # тень под линией волос
        fr[sh, :3] = (212, 150, 108)
        # 3) цвет: тёмно-русый, гладкие пряди назад
        hair2 = hair_mask(fr) & top & (fr[..., 3] > 0)
        recolor(fr, hair2, (84, 66, 50))
        for s_ in range(4):
            for t in range(8):
                x, y = cx + 7 - t - s_ * 2, cy - 11 + s_ * 3 + t // 3
                if 0 <= y < fr.shape[0] and 0 <= x < FW and hair2[y, x]:
                    put(fr, x, y, (128, 104, 80))
        # 4) резинка хвоста
        put(fr, cx - 8, cy - 7, (20, 20, 24)); put(fr, cx - 9, cy - 7, (20, 20, 24))
        # 5) лицо по референсу: прямые брови, голубо-серые глаза с веком, длинный нос,
        #    скулы, усы и эспаньолка-щетина, тонкие губы
        paint_face(fr, cx, cy)
        grow = cut.copy()
        for dy2, dx2 in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            grow |= shift(cut, dy2, dx2)
        outline(fr, grow)
        drop_specks(fr)
    save(out, 'bykentiy-walk-v3.png')


# ---------------- АЙМАШЫН ----------------
def aimashyn(cw):
    """Из сидящего кадра Блеба: чёрные волосы с фейдом и пучком, щетина, серьга, белая футболка."""
    fr = cw[:, 240:320].copy()
    H, W = fr.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    r, g, b, al = ch(fr)
    L = lum(fr)
    # рубашка → футболка: всё светлое и холодное (белое/сиреневое/голубое) ниже подбородка
    shirt = (al > 150) & (yy > 26) & (b >= r - 6) & (L > 120)
    collar_blue = (al > 150) & (yy > 32) & (yy < 50) & (b > r + 25) & (xx > 26) & (xx < 52)
    recolor(fr, shirt & ~collar_blue, (236, 230, 216))
    # вырез футболки: синий воротник → шея и круглый рубчик
    skin_ref = np.array([214, 150, 104])
    for i in range(3):
        fr[..., i] = np.where(collar_blue, skin_ref[i], fr[..., i])
    cz = ell(39, 47, 15, 7, (H, W)) & (yy >= 42) & (al > 150) & ~skin_mask(fr) & ~collar_blue
    fr[cz, :3] = (232, 226, 212)
    neck = ell(39, 44, 9, 4, (H, W)) & ~ell(39, 42.5, 7.5, 3, (H, W)) & (yy >= 43)
    fr[neck & (al > 100), :3] = (206, 198, 182)
    # кожа чуть смуглее
    sk = skin_mask(fr) & (yy < 60)
    fr[sk, 0] = fr[sk, 0] * 0.93
    fr[sk, 1] = fr[sk, 1] * 0.88
    fr[sk, 2] = fr[sk, 2] * 0.82
    # волосы: чёрные, по бокам и на затылке — фейд
    hair = hair_mask(fr) & (yy < 30) & ~skin_mask(fr)
    hair |= (al > 150) & (yy < 12) & ~skin_mask(fr) & (xx > 18) & (xx < 56)
    top = hair & (yy < 13 + (np.abs(xx - 37) // 5))
    sides = hair & ~top
    recolor(fr, top, (44, 36, 34))
    for i in range(3):
        fade = np.array([150, 118, 96])[i]
        fr[..., i] = np.where(sides, fade * 0.55 + fr[..., i] * 0.2, fr[..., i])
    # косички на макушке: светлые диагональные штрихи назад
    for k in range(5):
        for t in range(10):
            x, y = 26 + k * 5 + t // 2, 3 + t
            if 0 <= y < H and 0 <= x < W and top[y, x] and t % 3 != 2:
                put(fr, x, y, (86, 74, 68))
    # пучок на затылке справа сверху
    bun = ell(49, 5, 4.5, 4, (H, W))
    fr[bun, :3] = (40, 32, 30)
    fr[bun, 3] = 255
    fr[bun & ell(48, 4, 2, 1.5, (H, W)), :3] = (78, 66, 60)
    ring = ell(49, 5, 5.5, 5, (H, W)) & ~bun & (fr[..., 3] < 100)
    fr[ring, :3] = (22, 18, 16)
    fr[ring, 3] = 255
    # глаза: уже и карие (белки прячем под веко)
    r, g, b, al = ch(fr)
    eyes = ell(35, 28, 4.5, 2.5, (H, W)) | ell(47, 24.5, 4, 2.5, (H, W))
    white = (al > 200) & eyes & (lum(fr) > 185) & (np.abs(r - b) < 40)
    fr[white, :3] = (190, 128, 90)
    iris = (al > 200) & eyes & (g > r - 30) & (lum(fr) < 150) & (lum(fr) > 50)
    fr[iris, :3] = (54, 36, 28)
    lid = (al > 200) & (yy >= 23) & (yy <= 24) & (xx > 32) & (xx < 49) & shift(iris, -1, 0)
    fr[lid, :3] = (60, 40, 30)
    # щетина: усы, эспаньолка, линия челюсти
    sk = skin_mask(fr) | ((fr[..., 0] > 150) & (fr[..., 3] > 200) & (yy > 30) & (yy < 46) & (fr[..., 0] - fr[..., 2] > 50))
    mous = sk & (yy == 36) & (xx >= 36) & (xx <= 45)
    goat = sk & (yy >= 40) & (yy <= 45) & (xx >= 35) & (xx <= 45)
    jaw = sk & (yy >= 37) & (yy <= 44) & ((xx + yy) % 2 == 0)
    for m, k in ((jaw, 0.2), (mous, 0.4), (goat, 0.45)):
        fr[m, :3] = (fr[m, :3] * (1 - k) + np.array([62, 46, 38]) * k).astype(int)
    # серьга-кольцо с чёрной подвеской «侍» в ухе (слева на кадре)
    for x, y, c in ((23, 31, (210, 214, 220)), (22, 32, (210, 214, 220)), (24, 32, (160, 164, 170)),
                    (22, 33, (20, 20, 22)), (23, 33, (20, 20, 22)), (22, 34, (20, 20, 22)), (23, 34, (230, 230, 230)),
                    (22, 35, (20, 20, 22)), (23, 35, (20, 20, 22))):
        put(fr, x, y, c)
    return fr[:, ::-1].copy()  # зеркалим, чтобы не выглядел близнецом Блеба


# ---------------- ВТОРОЙ РЯД ----------------
def hue_swap(fr, mask, target):
    recolor(fr, mask, target)


def asel(cw):
    """Асель из комплаенса: бывший спрайт Аймашын, блузка горчичная."""
    fr = cw[:, 0:80].copy()
    r, g, b, al = ch(fr)
    teal = (al > 150) & (g > r + 20) & (b > r + 10)
    hue_swap(fr, teal, (214, 160, 52))
    return fr


def yerzhan(cw):
    """Стажёр Ержан: из Хлада — без наушников, чёрные волосы, зелёное худи."""
    fr = cw[:, 80:160].copy()
    H, W = fr.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    r, g, b, al = ch(fr)
    red = (al > 120) & (r > 140) & (g < 90) & (b < 90) & (yy < 40)
    face = ell(42, 32, 11, 8, (H, W))
    hair = hair_mask(fr) & (yy < 36) & (lum(fr) < 100) & ~face
    hair_all = hair | red
    recolor(fr, hair_all, (40, 36, 40))
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    gray = (al > 150) & (yy > 30) & (mx - mn < 26) & (lum(fr) > 60) & (yy < 80)
    recolor(fr, gray, (70, 128, 84))
    return fr


def sirgey(cw):
    """Сиргей «на созвоне»: из Шурика — рыжий, в синей клетке."""
    fr = cw[:, 160:240].copy()
    H, W = fr.shape[:2]
    yy = np.mgrid[0:H, 0:W][0]
    r, g, b, al = ch(fr)
    hair = hair_mask(fr) & (yy < 22)
    recolor(fr, hair, (178, 92, 44))
    warm_skin = (r > 150) & (r - b > 40) & (r > g + 10)
    plaid = (al > 150) & (yy > 26) & (yy < 70) & (r >= b) & (lum(fr) > 95) & ~warm_skin
    L = lum(fr)
    for i, v in enumerate((120, 150, 200)):
        fr[..., i] = np.where(plaid, v * (L / 170).clip(0.5, 1.3), fr[..., i])
    return fr


def tigran(cw):
    """Тигран — дух офиса: человек в аквагриме тигра, чёрные волосы, тёмная футболка с ракетой."""
    fr = cw[:, 240:320].copy()
    H, W = fr.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    r, g, b, al = ch(fr)
    L = lum(fr)
    shirt = (al > 150) & (yy > 40) & (yy < 80) & (b >= r - 6) & (L > 110)
    recolor(fr, shirt, (44, 54, 92))
    for x, y, c in ((47, 56, (230, 230, 230)), (47, 57, (230, 230, 230)), (46, 58, (230, 230, 230)), (47, 58, (230, 230, 230)),
                    (48, 58, (230, 230, 230)), (47, 55, (220, 60, 50)), (46, 59, (250, 170, 40)), (48, 59, (250, 170, 40))):
        put(fr, x, y, c)
    hair = hair_mask(fr) & (yy < 24) & ~skin_mask(fr)
    recolor(fr, hair, (30, 26, 28))
    face = skin_mask(fr) & (yy < 44)
    recolor(fr, face, (238, 128, 36))
    face = face | ((al > 200) & (yy < 44) & ell(40, 28, 12, 15, (H, W)) & ~hair)
    muzzle = face & (ell(40, 37, 6, 4, (H, W)) | ell(34, 23, 3, 1.5, (H, W)) | ell(46, 22, 3, 1.5, (H, W)))
    fr[muzzle & (lum(fr) > 70), :3] = (246, 240, 228)
    black = (20, 16, 14)
    for x, y0, n in ((36, 12, 4), (40, 11, 5), (44, 12, 4)):
        for y in range(y0, y0 + n):
            if face[y, x]: put(fr, x, y, black)
    for y in (29, 32):
        for x in range(27, 32):
            if face[y, x + (y == 32)]: put(fr, x + (y == 32), y, black)
        for x in range(49, 54):
            if face[y, x - (y == 32)]: put(fr, x - (y == 32), y, black)
    for x in range(39, 42):
        put(fr, x, 33, (40, 26, 24))
    return fr


if __name__ == '__main__':
    bykentiy()
    cw = load('coworkers-v2.png')
    out = cw.copy()
    out[:, 0:80] = aimashyn(cw)
    save(out, 'coworkers-v3.png')
    ex = np.zeros((cw.shape[0], 320, 4), int)
    ex[:, 0:80] = asel(cw)
    ex[:, 80:160] = yerzhan(cw)
    ex[:, 160:240] = sirgey(cw)
    ex[:, 240:320] = tigran(cw)
    save(ex, 'extras-v1.png')
