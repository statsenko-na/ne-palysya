"""Normalize generated sprite sheets for the game.

- Walk strips (4 frames, uneven baselines) -> fixed-size frames, feet on the
  bottom edge, horizontally centred, Lanczos-downscaled to 2x game size.
- Coworker atlas (2x2) -> horizontal strip of 4 cells, same treatment.

Usage: python scripts/normalize_sprites.py
Requires Pillow + numpy (dev only; the game itself needs nothing).
"""
from pathlib import Path
import numpy as np
from PIL import Image
from face_edit import remove_glasses, remove_moustache

ASSETS = Path(__file__).resolve().parent.parent / "assets"


def frames_from_strip(img, count):
    w = img.width // count
    return [img.crop((i * w, 0, (i + 1) * w, img.height)) for i in range(count)]


def frames_from_atlas(img, cols, rows):
    cw, ch = img.width // cols, img.height // rows
    return [img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)) for r in range(rows) for c in range(cols)]


def trim(frame):
    a = np.array(frame)[:, :, 3]
    # drop faint halo / stray pixels
    mask = a > 40
    ys, xs = np.nonzero(mask)
    return frame.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def edit_frames(frames, fn, per_frame=None):
    per_frame = per_frame or [{}] * len(frames)
    return [Image.fromarray(fn(np.array(f), **kw)) for f, kw in zip(frames, per_frame)]


def normalize(frames, out_h, name):
    trimmed = [trim(f) for f in frames]
    # every frame is scaled to the same height: generated frames drift in size
    out_w = int(max(t.width * out_h / t.height for t in trimmed)) + 4
    sheet = Image.new("RGBA", (out_w * len(trimmed), out_h), (0, 0, 0, 0))
    for i, t in enumerate(trimmed):
        scale = out_h / t.height
        tw, th = max(1, round(t.width * scale)), out_h
        small = t.resize((tw, th), Image.LANCZOS)
        sheet.alpha_composite(small, (i * out_w + (out_w - tw) // 2, out_h - th))
    sheet.save(ASSETS / name, optimize=True)
    print(name, sheet.size, "frame", out_w, "x", out_h)


if __name__ == "__main__":
    # Быкентий без очков (он ближе к рокеру), Директор Начальникович — без усов
    vik = edit_frames(frames_from_strip(Image.open(ASSETS / "bykentiy-walk-v1.png").convert("RGBA"), 4), remove_glasses,
                       # в кадрах 3–4 глаза тёмные и не распознаются — радужки заданы вручную
                       [{}, {}, {"boxes": [(100, 108, 314, 326), (99, 107, 339, 348)]},
                        {"boxes": [(93, 101, 186, 198), (92, 100, 216, 226)]}])
    normalize(vik, 120, "bykentiy-walk-v2.png")
    boss = edit_frames(frames_from_strip(Image.open(ASSETS / "boss-walk-v1.png").convert("RGBA"), 4), remove_moustache)
    normalize(boss, 134, "boss-walk-v2.png")
    normalize(frames_from_atlas(Image.open(ASSETS / "coworkers-atlas-v1.png").convert("RGBA"), 2, 2), 112, "coworkers-v2.png")
