# Цикл ходьбы Д.Н. (boss-walk-v3.png): торс берётся из первого кадра boss-walk-v2.png (с папкой),
# ноги рисуются заново по кинематике шага — 8 кадров ходьбы, покачивание корпуса от длины шага,
# девятый кадр — стоит (ноги вместе).
# Запуск: python scripts/make_boss_walk.py
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'boss-walk-v2.png'
OUT = ROOT / 'assets' / 'boss-walk-v3.png'

FW, FH = 106, 134
FRAMES = 8
CUT = 96            # торс до этой строки (таз закрывает верх ног)
HIP_Y = 92
GROUND = 132        # низ подошвы
THIGH, SHIN = 19, 18
OUTLINE = (27, 1, 28, 255)
PANTS = {'near': ((24, 29, 43, 255), (37, 44, 61, 255), (12, 15, 22, 255)),
         'far': ((15, 18, 28, 255), (24, 29, 42, 255), (8, 10, 15, 255))}
SHOE = ((10, 10, 12, 255), (70, 74, 80, 255))


def leg_pose(p):
    """Фаза 0..1 → (угол бедра, сгиб колена) в радианах. Вперёд — положительный угол. None — стоит."""
    if p is None:
        return 0.04, 0.06
    s = math.sin(p * math.tau)
    thigh = 0.42 * s
    # колено сгибается в фазе переноса (нога идёт вперёд) — пик в середине переноса
    swing = max(0.0, math.cos(p * math.tau))
    knee = 0.12 + 0.75 * swing * swing
    return thigh, knee


def leg_points(hx, hy, p):
    thigh, knee = leg_pose(p)
    kx = hx + math.sin(thigh) * THIGH
    ky = hy + math.cos(thigh) * THIGH
    shin = thigh - knee
    ax = kx + math.sin(shin) * SHIN
    ay = ky + math.cos(shin) * SHIN
    return (kx, ky), (ax, ay), shin


def quad(a, b, wa, wb):
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1
    nx, ny = -dy / n, dx / n
    return [(a[0] + nx * wa, a[1] + ny * wa), (b[0] + nx * wb, b[1] + ny * wb),
            (b[0] - nx * wb, b[1] - ny * wb), (a[0] - nx * wa, a[1] - ny * wa)]


def draw_leg(d, hip, p, shade, dy):
    base, light, dark = PANTS[shade]
    knee, ankle, _ = leg_points(hip[0], hip[1], p)
    hip = (hip[0], hip[1] + dy); knee = (knee[0], knee[1] + dy); ankle = (ankle[0], ankle[1] + dy)
    # подошва: носок вперёд (вправо), чуть приподнят в переносе
    lift = 0.0 if p is None else max(0.0, math.cos(p * math.tau)) * 0.35
    toe = (ankle[0] + 10 * math.cos(lift), ankle[1] + 2 - 10 * math.sin(lift))
    heel = (ankle[0] - 3, ankle[1] + 2)
    for grow, col in ((1.4, OUTLINE), (0, None)):
        for a, b, wa, wb in ((hip, knee, 7.2, 6.2), (knee, ankle, 6.2, 5.0)):
            if col:
                d.polygon(quad(a, b, wa + grow, wb + grow), fill=col)
            else:
                d.polygon(quad(a, b, wa, wb), fill=base)
                # блик по переднему краю штанины и тень по заднему
                d.line([(a[0] + 3, a[1]), (b[0] + 2.5, b[1])], fill=light, width=2)
                d.line([(a[0] - 5, a[1]), (b[0] - 4, b[1])], fill=dark, width=2)
        r = 6.2 + grow
        d.ellipse([knee[0] - r, knee[1] - r, knee[0] + r, knee[1] + r], fill=col or base)
        # ботинок
        shoe = [(heel[0] - grow, heel[1] - 5 - grow), (ankle[0] + 4, ankle[1] - 3 - grow), (toe[0] + grow, toe[1] - 2 - grow),
                (toe[0] + grow, toe[1] + 1 + grow), (heel[0] - grow, heel[1] + 1 + grow)]
        d.polygon(shoe, fill=col or SHOE[0])
    d.line([(ankle[0] + 2, ankle[1] - 1), (toe[0] - 1, toe[1] - 1)], fill=SHOE[1], width=1)


def main():
    src = Image.open(SRC).convert('RGBA')
    torso = src.crop((0, 0, FW, CUT))
    sheet = Image.new('RGBA', (FW * (FRAMES + 1), FH), (0, 0, 0, 0))
    near_hip, far_hip = (58, HIP_Y), (47, HIP_Y)
    for i in range(FRAMES + 1):
        p = i / FRAMES if i < FRAMES else None
        q = None if p is None else (p + 0.5) % 1
        # опора — нижняя ступня; корпус опускается, когда ноги широко
        lows = [leg_points(*near_hip, p)[1][1], leg_points(*far_hip, q)[1][1]]
        dy = round(GROUND - 3 - max(lows))
        frame = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        d = ImageDraw.Draw(frame)
        draw_leg(d, far_hip, q, 'far', dy)
        draw_leg(d, near_hip, p, 'near', dy)
        frame.alpha_composite(torso, (0, dy))
        sheet.alpha_composite(frame, (i * FW, 0))
    sheet.save(OUT)
    print(f'{OUT.name}: {sheet.size}')


if __name__ == '__main__':
    main()
