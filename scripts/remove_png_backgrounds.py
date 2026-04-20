#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
from collections import Counter, deque
from pathlib import Path
from typing import Iterable

from PIL import Image


RGB = tuple[int, int, int]


def quantize(color: RGB, step: int) -> RGB:
    return tuple((channel // step) * step for channel in color)  # type: ignore[return-value]


def color_distance_sq(a: RGB, b: RGB) -> int:
    return sum((ax - bx) ** 2 for ax, bx in zip(a, b))


def border_coordinates(width: int, height: int) -> Iterable[tuple[int, int]]:
    for x in range(width):
        yield x, 0
        if height > 1:
            yield x, height - 1
    for y in range(1, height - 1):
        yield 0, y
        if width > 1:
            yield width - 1, y


def collect_palette(pixels, width: int, height: int, quantize_step: int, top_k: int) -> list[RGB]:
    border_pixels = [pixels[x, y][:3] for x, y in border_coordinates(width, height)]
    counts = Counter(quantize(color, quantize_step) for color in border_pixels)

    palette = [color for color, _count in counts.most_common(top_k)]
    corners = {
        quantize(pixels[0, 0][:3], quantize_step),
        quantize(pixels[width - 1, 0][:3], quantize_step),
        quantize(pixels[0, height - 1][:3], quantize_step),
        quantize(pixels[width - 1, height - 1][:3], quantize_step),
    }
    for corner in corners:
        if corner not in palette:
            palette.append(corner)
    return palette


def matches_palette(color: RGB, palette: list[RGB], tolerance_sq: int) -> bool:
    return any(color_distance_sq(color, swatch) <= tolerance_sq for swatch in palette)


def build_background_mask(
    image: Image.Image,
    palette: list[RGB],
    seed_tolerance: int,
    grow_tolerance: int,
    neighbor_tolerance: int,
) -> list[list[bool]]:
    width, height = image.size
    pixels = image.load()
    visited = [[False] * width for _ in range(height)]
    is_background = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    seed_tolerance_sq = seed_tolerance * seed_tolerance
    grow_tolerance_sq = grow_tolerance * grow_tolerance
    neighbor_tolerance_sq = neighbor_tolerance * neighbor_tolerance

    for x, y in border_coordinates(width, height):
        color = pixels[x, y][:3]
        if matches_palette(color, palette, grow_tolerance_sq):
            visited[y][x] = True
            is_background[y][x] = True
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        current = pixels[x, y][:3]
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height or visited[ny][nx]:
                continue

            visited[ny][nx] = True
            color = pixels[nx, ny][:3]
            if matches_palette(color, palette, grow_tolerance_sq) or (
                matches_palette(color, palette, grow_tolerance_sq)
                and color_distance_sq(color, current) <= neighbor_tolerance_sq
            ):
                is_background[ny][nx] = True
                queue.append((nx, ny))

    return is_background


def apply_mask(image: Image.Image, mask: list[list[bool]]) -> tuple[Image.Image, int]:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    changed = 0

    for y in range(height):
        for x in range(width):
            if not mask[y][x]:
                continue
            r, g, b, a = pixels[x, y]
            if a != 0:
                pixels[x, y] = (r, g, b, 0)
                changed += 1

    return rgba, changed


def process_file(path: Path, args: argparse.Namespace) -> tuple[bool, int]:
    original = Image.open(path).convert("RGBA")
    width, height = original.size
    pixels = original.load()

    palette = collect_palette(
        pixels,
        width,
        height,
        quantize_step=args.quantize_step,
        top_k=args.top_k,
    )
    mask = build_background_mask(
        original,
        palette=palette,
        seed_tolerance=args.seed_tolerance,
        grow_tolerance=args.grow_tolerance,
        neighbor_tolerance=args.neighbor_tolerance,
    )
    output, changed = apply_mask(original, mask)

    if changed == 0:
        return False, 0

    if not args.dry_run:
        output.save(path)

    return True, changed


def collect_pngs(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for raw_path in paths:
        path = Path(raw_path)
        if path.is_dir():
            files.extend(sorted(path.glob("*.png")))
        elif path.suffix.lower() == ".png":
            files.append(path)
    return files


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove edge-connected PNG backgrounds by making them transparent."
    )
    parser.add_argument("paths", nargs="+", help="PNG files or directories to process.")
    parser.add_argument("--dry-run", action="store_true", help="Report changes without writing files.")
    parser.add_argument("--quantize-step", type=int, default=16)
    parser.add_argument("--top-k", type=int, default=8)
    parser.add_argument("--seed-tolerance", type=int, default=42)
    parser.add_argument("--grow-tolerance", type=int, default=52)
    parser.add_argument("--neighbor-tolerance", type=int, default=24)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = collect_pngs(args.paths)
    if not files:
        print("No PNG files found.")
        return 1

    changed_files = 0
    changed_pixels = 0
    for path in files:
        changed, pixel_count = process_file(path, args)
        status = "updated" if changed else "skipped"
        print(f"{status}: {path} ({pixel_count} pixels)")
        if changed:
            changed_files += 1
            changed_pixels += pixel_count

    print(
        f"Processed {len(files)} file(s); changed {changed_files} file(s); "
        f"removed {changed_pixels} background pixel(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
