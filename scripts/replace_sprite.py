"""Удаляет пурпурный хромакей, вписывает картинку в ячейку листа спрайтов (nearest) и заменяет её.
Использование: python scripts/replace_sprite.py <src.png> [sheet=assets/extras-v1.png] [index=3] [cell_w=80] [cell_h=112]
Пример (Тигран): python scripts/replace_sprite.py assets/tigran-src.png assets/extras-v1.png 3"""
import sys
from PIL import Image

args = sys.argv[1:]
src_path = args[0]
sheet_path = args[1] if len(args) > 1 else 'assets/extras-v1.png'
index = int(args[2]) if len(args) > 2 else 3
cw = int(args[3]) if len(args) > 3 else 80
ch = int(args[4]) if len(args) > 4 else 112

src = Image.open(src_path).convert('RGBA')
px = src.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = px[x, y]
        if r > 180 and b > 180 and g < 110:
            px[x, y] = (0, 0, 0, 0)
src = src.crop(src.getbbox())
k = min(cw / src.width, ch / src.height)
w, h = max(1, round(src.width * k)), max(1, round(src.height * k))
small = src.resize((w, h), Image.NEAREST)
cell = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
cell.paste(small, ((cw - w) // 2, ch - h), small)
sheet = Image.open(sheet_path).convert('RGBA')
cols = sheet.width // cw
x0, y0 = (index % cols) * cw, (index // cols) * ch
sheet.paste(Image.new('RGBA', (cw, ch), (0, 0, 0, 0)), (x0, y0))
sheet.paste(cell, (x0, y0))
sheet.save(sheet_path)
print('ok', sheet_path, 'cell', index, 'size', w, h)
