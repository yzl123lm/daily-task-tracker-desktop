"""Generate transparent desktop app icons from the whale brand image."""
from __future__ import annotations

import struct
import subprocess
import sys
import zlib
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
ICONS = ROOT / "assets" / "icons"
TARGET_SIDE = 1024
SAFE_MARGIN_RATIO = 0.07  # 7% transparent padding for PNG / macOS / splash
WINDOWS_SHELL_MARGIN_RATIO = 0.0  # Windows renders ICO transparency as white — fill canvas
ICO_SIZES = [16, 32, 48, 64, 128, 256]
ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]


def load_source() -> Image.Image:
    candidates = [
        ICONS / "icon-source.png",
        BUILD / "icon-source.png",
        ROOT / "assets" / "whale-icon-source.png",
        BUILD / "brand-reference.png",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        image = Image.open(path).convert("RGBA")
        if path.name == "brand-reference.png":
            side = min(image.size)
            image = image.crop((0, 0, side, side))
        return image
    raise FileNotFoundError(
        "icon source not found (expected assets/icons/icon-source.png or build/icon-source.png)"
    )


def is_outer_matte(r: int, g: int, b: int) -> bool:
    """Detect the outer white/light-gray canvas, not in-icon highlights."""
    spread = max(r, g, b) - min(r, g, b)
    return spread < 22 and min(r, g, b) >= 198


def remove_outer_matte(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    background = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int) -> None:
        if background[y][x]:
            return
        r, g, b, _a = pixels[x, y]
        if is_outer_matte(r, g, b):
            background[y][x] = True
            queue.append((x, y))

    for x in range(width):
        try_seed(x, 0)
        try_seed(x, height - 1)
    for y in range(height):
        try_seed(0, y)
        try_seed(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height or background[ny][nx]:
                continue
            r, g, b, _a = pixels[nx, ny]
            if is_outer_matte(r, g, b):
                background[ny][nx] = True
                queue.append((nx, ny))

    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    out_pixels = output.load()
    for y in range(height):
        for x in range(width):
            if not background[y][x]:
                out_pixels[x, y] = pixels[x, y]
    return output


def content_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    left = right = top = bottom = None
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] < 8:
                continue
            left = x if left is None else min(left, x)
            right = x if right is None else max(right, x)
            top = y if top is None else min(top, y)
            bottom = y if bottom is None else max(bottom, y)
    if left is None or right is None or top is None or bottom is None:
        side = min(width, height)
        return 0, 0, side - 1, side - 1
    return left, top, right, bottom


def compose_with_safe_margin(
    cropped: Image.Image,
    side: int = TARGET_SIDE,
    margin_ratio: float = SAFE_MARGIN_RATIO,
) -> Image.Image:
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    max_content = max(1, int(round(side * (1 - margin_ratio * 2))))
    src_w, src_h = cropped.size
    scale = min(max_content / src_w, max_content / src_h)
    target_w = max(1, int(round(src_w * scale)))
    target_h = max(1, int(round(src_h * scale)))
    resized = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
    offset_x = (side - target_w) // 2
    offset_y = (side - target_h) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)
    return canvas


def build_master_icon(source: Image.Image, margin_ratio: float = SAFE_MARGIN_RATIO) -> Image.Image:
    transparent = remove_outer_matte(source)
    left, top, right, bottom = content_bbox(transparent)
    cropped = transparent.crop((left, top, right + 1, bottom + 1))
    return compose_with_safe_margin(cropped, margin_ratio=margin_ratio)


def resize_icon(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def write_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False)


def write_ico(path: Path, master: Image.Image) -> None:
    """Write a multi-size Windows ICO with embedded PNG frames."""
    frames = [resize_icon(master, size) for size in ICO_SIZES]
    png_frames = [_write_png_bytes(frame) for frame in frames]

    count = len(png_frames)
    header_size = 6 + count * 16
    offset = header_size
    entries = bytearray()
    image_blob = bytearray()

    for size, png_bytes in zip(ICO_SIZES, png_frames):
        width_byte = 0 if size >= 256 else size
        height_byte = 0 if size >= 256 else size
        entries.extend(
            struct.pack(
                "<BBBBHHII",
                width_byte,
                height_byte,
                0,
                0,
                1,
                32,
                len(png_bytes),
                offset,
            )
        )
        image_blob.extend(png_bytes)
        offset += len(png_bytes)

    data = struct.pack("<HHH", 0, 1, count) + bytes(entries) + bytes(image_blob)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(data))


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _write_png_bytes(image: Image.Image) -> bytes:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    raw = bytearray()
    pixels = rgba.load()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r, g, b, a = pixels[x, y]
            raw.extend((r, g, b, a))
    compressed = zlib.compress(bytes(raw), level=9)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            _png_chunk(b"IHDR", ihdr),
            _png_chunk(b"IDAT", compressed),
            _png_chunk(b"IEND", b""),
        ]
    )


def _icns_type_for_size(size: int) -> bytes:
    mapping = {
        16: b"icp4",
        32: b"icp5",
        64: b"icp6",
        128: b"ic07",
        256: b"ic08",
        512: b"ic09",
        1024: b"ic10",
    }
    return mapping[size]


def write_icns(path: Path, master: Image.Image) -> None:
    entries: list[tuple[bytes, bytes]] = []
    for size in ICNS_SIZES:
        png_bytes = _write_png_bytes(resize_icon(master, size))
        entries.append((_icns_type_for_size(size), png_bytes))

    body = bytearray()
    for icon_type, data in entries:
        body.extend(icon_type)
        body.extend(struct.pack(">I", len(data)))
        body.extend(data)

    file_data = b"icns" + struct.pack(">I", 8 + len(body)) + bytes(body)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(file_data)


def try_write_icns_with_png2icons(path: Path, master_png: Path) -> bool:
    try:
        subprocess.run(
            [
                "npx",
                "--yes",
                "png2icons",
                str(master_png),
                str(path.with_suffix("")),
                "-icns",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        generated = path.with_suffix(".icns")
        if generated.is_file() and generated != path:
            generated.replace(path)
        return path.is_file()
    except (OSError, subprocess.CalledProcessError):
        return False


def verify_transparent_master(master: Image.Image) -> None:
    rgba = master.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size

    corners = [
        pixels[0, 0][3],
        pixels[width - 1, 0][3],
        pixels[0, height - 1][3],
        pixels[width - 1, height - 1][3],
    ]
    if any(alpha > 0 for alpha in corners):
        raise RuntimeError("corner pixels are not transparent")

    opaque_edge = 0
    for x in range(width):
        if pixels[x, 0][3] > 0 or pixels[x, height - 1][3] > 0:
            opaque_edge += 1
    if opaque_edge > width * 0.02:
        raise RuntimeError("detected opaque pixels along top/bottom edges (possible white border)")

    bbox = content_bbox(rgba)
    content_w = bbox[2] - bbox[0] + 1
    content_h = bbox[3] - bbox[1] + 1
    margin_x = min(bbox[0], width - 1 - bbox[2])
    margin_y = min(bbox[1], height - 1 - bbox[3])
    margin_ratio_x = margin_x / width
    margin_ratio_y = margin_y / height
    if margin_ratio_x < 0.05 or margin_ratio_y < 0.05:
        raise RuntimeError(f"safe margin too small: {margin_ratio_x:.3f} x {margin_ratio_y:.3f}")
    if margin_ratio_x > 0.1 or margin_ratio_y > 0.1:
        raise RuntimeError(f"safe margin too large: {margin_ratio_x:.3f} x {margin_ratio_y:.3f}")

    print(
        "verify ok:"
        f" corners transparent,"
        f" content {content_w}x{content_h},"
        f" margin {margin_ratio_x * 100:.1f}% x {margin_ratio_y * 100:.1f}%"
    )


def verify_windows_shell_master(master: Image.Image) -> None:
    rgba = master.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    bbox = content_bbox(rgba)
    margin_x = min(bbox[0], width - 1 - bbox[2])
    margin_y = min(bbox[1], height - 1 - bbox[3])
    margin_ratio_x = margin_x / width
    margin_ratio_y = margin_y / height
    if margin_ratio_x > 0.03 or margin_ratio_y > 0.03:
        raise RuntimeError(
            f"Windows shell icon margin too large (shows as white desktop halo): "
            f"{margin_ratio_x * 100:.1f}% x {margin_ratio_y * 100:.1f}%"
        )
    print(
        "verify windows shell ok:"
        f" margin {margin_ratio_x * 100:.1f}% x {margin_ratio_y * 100:.1f}%"
    )


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)

    source = load_source()
    master = build_master_icon(source, SAFE_MARGIN_RATIO)
    windows_master = build_master_icon(source, WINDOWS_SHELL_MARGIN_RATIO)
    verify_transparent_master(master)
    verify_windows_shell_master(windows_master)

    outputs = {
        "app-icon.png": ICONS / "app-icon.png",
        "icon.png": BUILD / "icon.png",
        "icon-master.png": BUILD / "icon-master.png",
        "icon.ico": BUILD / "icon.ico",
        "icon.icns": BUILD / "icon.icns",
        "assets-icon.ico": ICONS / "icon.ico",
        "assets-icon.icns": ICONS / "icon.icns",
    }

    write_png(outputs["app-icon.png"], master)
    write_png(outputs["icon.png"], master)
    write_png(outputs["icon-master.png"], master)
    write_ico(outputs["icon.ico"], windows_master)
    write_ico(outputs["assets-icon.ico"], windows_master)
    write_png(BUILD / "whale-mascot.png", master)

    if not try_write_icns_with_png2icons(outputs["icon.icns"], outputs["app-icon.png"]):
        write_icns(outputs["icon.icns"], master)
    if outputs["assets-icon.icns"] != outputs["icon.icns"]:
        outputs["assets-icon.icns"].write_bytes(outputs["icon.icns"].read_bytes())

    print(
        "Wrote transparent whale icons:"
        f" {TARGET_SIDE}x{TARGET_SIDE} PNG,"
        f" ICO {ICO_SIZES},"
        f" ICNS {ICNS_SIZES}"
    )
    for label, path in outputs.items():
        print(f"  - {label}: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
