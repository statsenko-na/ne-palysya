"""Cut the Almaty mountain view out of office-background-pixel-v1.png.

Produces assets/almaty-view-v1.png: four 224x132 window panes followed by a
304x132 balcony view (all at 2x game scale). Pane seams sit under the window
pillars drawn in js/art.js, so the source mullions never show.
Usage: python scripts/make_panorama.py
"""
from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "assets"
src = Image.open(ASSETS / "office-background-pixel-v1.png").convert("RGBA")
OX, OY = 380, 10  # window strip origin inside the source art
# pane x-ranges between source mullions (strip coordinates)
panes = [(112, 308), (320, 470), (482, 643), (655, 808)]
PW, PH = 224, 132
out = Image.new("RGBA", (PW * 4 + 304, PH))


def fit(box_x0, box_x1, tw, th, bottom=150):
    w = box_x1 - box_x0
    h = round(w * th / tw)
    y1 = min(bottom, 148)
    y0 = max(0, y1 - h)
    return src.crop((OX + box_x0, OY + y0, OX + box_x1, OY + y1)).resize((tw, th), Image.LANCZOS)


for i, (a, b) in enumerate(panes):
    out.paste(fit(a, b, PW, PH, bottom=146), (i * PW, 0))
# balcony: pane 4 + Kok-Tobe tower pane glued (skipping the mullion and plant)
left = src.crop((OX + 655, OY + 38, OX + 806, OY + 148))
right = src.crop((OX + 822, OY + 38, OX + 922, OY + 148))
glued = Image.new("RGBA", (left.width + right.width, left.height))
glued.paste(left, (0, 0))
glued.paste(right, (left.width, 0))
out.paste(glued.resize((304, PH), Image.LANCZOS), (PW * 4, 0))
out.save(ASSETS / "almaty-view-v1.png", optimize=True)
print("almaty-view-v1.png", out.size)
