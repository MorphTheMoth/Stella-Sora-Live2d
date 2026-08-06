#!/usr/bin/env python3
"""
extract_bg.py — copy the in-bundle l2d background textures from an
AssetStudio tex2d export into the site's `chars/<skinId>/<variant>/bg/`
folder convention.

The backgrounds ship inside the l2d bundles under
`.../character/<id>/<kind>/fx/textures/*_BG_*.png` (and `*_bg_*`),
`.../disc_l2d/noncen/<id>/l2d/fx/textures/*.png`.  Kind maps to the
same variant suffix as normalize.py:

  live2d        -> <id>_l   (Default)
  live2d_full   -> <id>_lf  (Memory Snapshot)
  live2d_talent -> <id>_lt  (Talent)
  l2d           -> <id>_l   (Disc)

Only scene-scale textures (width >= 1000) are kept; the many small
fx/particle textures whose names merely contain "bg" are skipped.

Usage:
  extract_bg.py --root <tex2d export root> --out <chars dir>
"""

import argparse
import os
import re
import shutil

KIND_SUFFIX = {
    "live2d": "l",
    "live2d_full": "lf",
    "live2d_talent": "lt",
    "l2d": "l",
}

# Minimum pixel size for a texture to count as a background.  The l2d
# scene backgrounds are ~2400px wide; fx particles and strip textures are
# much smaller, so a width floor removes them cleanly.
MIN_WIDTH = 1000
MIN_HEIGHT = 500


def parse_path(rel):
    """Extract (skin_id, variant_suffix) from an export-relative path.

    Handles:
      assets/assetbundles/actor2d_l2d/noncen/character/10301/live2d_full/fx/textures/x.png
      assets/assetbundles/disc_l2d/noncen/4004/l2d/fx/textures/x.png
    """
    rel = rel.replace("\\", "/")
    m = re.search(r"/(?:character|npc|disc_l2d/noncen)/(\d+)/([^/]+)/fx/textures/", rel)
    if not m:
        return None
    skin_id = m.group(1)
    kind = m.group(2)
    suffix = KIND_SUFFIX.get(kind)
    if not suffix:
        return None
    return skin_id, suffix


def is_background(rel):
    """Keep only scene-scale textures whose name signals a background.

    Names like `13501_live2d_BG_001`, `huochuiBG_A`, `tiliya_bg_cloud`,
    `live2d_11301_0037_background`, `fx_11001_live2d_bg_001` qualify.
    Excludes `*_mask*` masks and short strip textures (effect layers);
    the caller additionally enforces a minimum pixel size.
    """
    name = os.path.basename(rel).lower()
    stem = os.path.splitext(name)[0]
    if not re.search(r"bg|background", stem):
        return False
    if "_mask" in stem:
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="AssetStudio -m export -t tex2d root")
    ap.add_argument("--out", required=True, help="destination chars/ dir")
    args = ap.parse_args()

    # lazily import PIL only when needed for size checks
    try:
        from PIL import Image
    except ImportError:
        print("Pillow required for size checks: pip install Pillow")
        return

    copied = 0
    skipped_small = 0
    for dirpath, dirnames, filenames in os.walk(args.root):
        for fn in filenames:
            if not fn.lower().endswith((".png", ".jpg")):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, args.root)
            info = parse_path(rel)
            if not info:
                continue
            if not is_background(rel):
                continue
            try:
                w, h = Image.open(full).size
            except Exception:
                continue
            if w < MIN_WIDTH or h < MIN_HEIGHT:
                skipped_small += 1
                continue
            skin_id, suffix = info
            variant_dir = f"{skin_id}_{suffix}"
            dest_dir = os.path.join(args.out, skin_id, variant_dir, "bg")
            os.makedirs(dest_dir, exist_ok=True)
            dst = os.path.join(dest_dir, fn)
            if os.path.exists(dst):
                continue
            shutil.copy2(full, dst)
            copied += 1
            print(f"  {skin_id}/{variant_dir}/bg/{fn}")

    print(f"Done. Copied {copied} background image(s), skipped {skipped_small} small fx texture(s).")


if __name__ == "__main__":
    main()
