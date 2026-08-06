#!/usr/bin/env python3
"""
downscale.py — Cap Live2D texture resolution to keep file sizes and GPU
memory manageable.

The game ships 2048x2048 textures (2-3.5MB PNG each). On some devices /
static hosts this causes:
  - truncated downloads ("Content-Length header of network response
    exceeds response Body") from simple HTTP servers
  - WebGL context loss when several large textures + big moc3 load at once

Live2D uses normalized UVs, so geometry is unaffected; only texture detail
is reduced. 1024x1024 is a good default for a web viewer.

Usage:
  python3 scripts/downscale.py [--chars chars] [--max 1024]
"""

import argparse
import os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def downscale_dir(chars_dir, max_dim):
    changed = 0
    skipped = 0
    for root, dirs, files in os.walk(chars_dir):
        for fn in files:
            if not fn.lower().endswith(('.png', '.jpg', '.jpeg')):
                continue
            p = os.path.join(root, fn)
            try:
                with Image.open(p) as im:
                    if im.width <= max_dim and im.height <= max_dim:
                        skipped += 1
                        continue
                    # keep aspect ratio, both dims <= max_dim
                    ratio = max_dim / max(im.width, im.height)
                    new_size = (round(im.width * ratio), round(im.height * ratio))
                    im2 = im.convert('RGBA').resize(new_size, Image.LANCZOS)
                    im2.save(p, format='PNG', optimize=True)
                    im2.close()
                    changed += 1
                    print(f'  {os.path.relpath(p, chars_dir)}: '
                          f'{im.width}x{im.height} -> {new_size[0]}x{new_size[1]}')
            except Exception as e:
                print(f'WARN: {p}: {e}')
    print(f'Downscaled {changed} textures, skipped {skipped}.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--chars', default='chars')
    ap.add_argument('--max', type=int, default=1024,
                    help='max texture dimension (default 1024)')
    args = ap.parse_args()
    downscale_dir(args.chars, args.max)


if __name__ == '__main__':
    main()
