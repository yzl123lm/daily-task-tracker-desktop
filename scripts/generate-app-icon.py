"""Generate Windows .ico and PNG app icons from the whale brand image."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
SIZES = [16, 24, 32, 48, 64, 128, 256]
TARGET_SIDE = 1024
# Trim dark rounded-corner padding before upscale so blue fills the final square.
LOGO_INSET_RATIO = 0.1


def load_source() -> Image.Image:
    candidates = [
        BUILD / "icon-source.png",
        ROOT / "assets" / "whale-icon-source.png",
        BUILD / "brand-reference.png",
    ]
    for p in candidates:
        if not p.is_file():
            continue
        img = Image.open(p).convert("RGBA")
        if p.name == "brand-reference.png":
            side = min(img.size)
            img = img.crop((0, 0, side, side))
        return img
    raise FileNotFoundError("whale icon source not found (expected build/icon-source.png)")


def is_outer_matte(r: int, g: int, b: int) -> bool:
    if r < 12 and g < 12 and b < 12:
        return True
    return r < 20 and g < 50 and b < 85


def inner_logo_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    left = right = top = bottom = None
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16 or is_outer_matte(r, g, b):
                continue
            if left is None or x < left:
                left = x
            if right is None or x > right:
                right = x
            if top is None or y < top:
                top = y
            if bottom is None or y > bottom:
                bottom = y
    if left is None or right is None or top is None or bottom is None:
        side = min(rgba.size)
        return 0, 0, side - 1, side - 1
    return left, top, right, bottom


def expand_logo_to_square(img: Image.Image, side: int = TARGET_SIDE) -> Image.Image:
    """Crop the inner whale logo and upscale to fill the whole icon canvas."""
    left, top, right, bottom = inner_logo_bbox(img)
    crop_w = right - left + 1
    crop_h = bottom - top + 1
    inset_x = int(crop_w * LOGO_INSET_RATIO)
    inset_y = int(crop_h * LOGO_INSET_RATIO)
    cropped = img.crop(
        (
            left + inset_x,
            top + inset_y,
            right - inset_x + 1,
            bottom - inset_y + 1,
        )
    )
    return cropped.resize((side, side), Image.Resampling.LANCZOS).convert("RGB")


def resize_icon(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    master = expand_logo_to_square(load_source())
    master.save(BUILD / "icon-master.png", format="PNG")
    master.save(BUILD / "icon.png", format="PNG")

    frames = [resize_icon(master, s) for s in SIZES]
    frames[-1].save(
        BUILD / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in SIZES],
        append_images=frames[:-1],
    )
    print(f"Wrote whale icons from {master.size[0]}x{master.size[1]} master (expanded fill)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
