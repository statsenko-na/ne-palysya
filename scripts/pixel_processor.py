"""
Pixel Art Processor for office_game
Utility for cropping, downscaling, palette-quantizing, and extracting alpha transparency for game sprites and tiles.
"""

import sys
import argparse
from pathlib import Path

PICO8_PALETTE = [
    (0, 0, 0),       # 0: Black
    (29, 43, 83),    # 1: Dark Blue
    (126, 37, 83),   # 2: Dark Purple
    (0, 135, 81),    # 3: Dark Green
    (171, 82, 54),   # 4: Brown
    (95, 87, 79),    # 5: Dark Gray
    (194, 195, 199), # 6: Light Gray
    (255, 241, 232), # 7: White
    (255, 0, 77),    # 8: Red
    (255, 163, 0),   # 9: Orange
    (255, 236, 39),  # 10: Yellow
    (0, 228, 54),    # 11: Green
    (41, 173, 255),  # 12: Blue
    (131, 118, 156), # 13: Lavender
    (255, 119, 168), # 14: Pink
    (255, 204, 170), # 15: Peach
]

def make_palette_image(colors):
    from PIL import Image
    pal_img = Image.new("P", (1, 1))
    flat_colors = []
    for c in colors:
        flat_colors.extend(c)
    while len(flat_colors) < 768:
        flat_colors.extend((0, 0, 0))
    pal_img.putpalette(flat_colors)
    return pal_img

def process_pixel_art(input_path: str, output_path: str, target_size: int = 32, remove_bg: bool = True, palette: str = "pico8"):
    from PIL import Image
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    aspect = w / h
    if aspect >= 1.0:
        new_w = target_size
        new_h = max(1, int(target_size / aspect))
    else:
        new_h = target_size
        new_w = max(1, int(target_size * aspect))
        
    downscaled = img.resize((new_w, new_h), Image.Resampling.NEAREST)
    
    if remove_bg:
        pixels = downscaled.load()
        corner_colors = [pixels[0, 0], pixels[new_w - 1, 0], pixels[0, new_h - 1], pixels[new_w - 1, new_h - 1]]
        bg_r, bg_g, bg_b, _ = corner_colors[0]
        
        for y in range(new_h):
            for x in range(new_w):
                r, g, b, a = pixels[x, y]
                dist = ((r - bg_r)**2 + (g - bg_g)**2 + (b - bg_b)**2)**0.5
                if dist < 28:
                    pixels[x, y] = (0, 0, 0, 0)
                    
    if palette == "pico8":
        pal_img = make_palette_image(PICO8_PALETTE)
        rgb = downscaled.convert("RGB")
        quantized = rgb.quantize(palette=pal_img, dither=Image.Dither.NONE)
        result = quantized.convert("RGBA")
        result.putalpha(downscaled.split()[-1])
    else:
        result = downscaled
        
    result.save(output_path, "PNG")
    print(f"[office_game] Processed pixel sprite: {output_path} ({new_w}x{new_h})")

def main():
    parser = argparse.ArgumentParser(description="Clean and downsample images into true pixel art for office_game.")
    parser.add_argument("input", help="Path to input image")
    parser.add_argument("-o", "--output", help="Path to output image (default: assets/<name>_pixel.png)")
    parser.add_argument("-s", "--size", type=int, default=32, help="Target pixel grid size (e.g. 16, 32, 64, 128)")
    parser.add_argument("--no-bg-remove", action="store_true", help="Do not remove background color")
    parser.add_argument("-p", "--palette", default="pico8", choices=["pico8", "none"], help="Target color palette")
    
    args = parser.parse_args()
    out = args.output or str(Path(args.input).with_name(Path(args.input).stem + "_pixel.png"))
    process_pixel_art(args.input, out, args.size, not args.no_bg_remove, args.palette)

if __name__ == "__main__":
    main()
