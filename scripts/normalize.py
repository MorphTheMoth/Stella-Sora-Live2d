#!/usr/bin/env python3
"""
normalize.py — Convert AssetStudioModCLI -m live2d export into the
site's `chars/<skinId>/<variant>/` folder convention.

Variant mapping (matches tyrant-viewer / srpg-kr naming):
  live2d        -> <id>_l   (Default)           model <id>_L
  live2d_full   -> <id>_lf  (Memory Snapshot)   model <id>_F / <id>_F_a / <id>_F_b
  live2d_talent -> <id>_lt  (Talent)            model <id>_T

Newer bundles sometimes come out with empty Motions in the model3.json
while the actual motion clips live in a sibling `mtn/` folder. This
script re-attaches those motions by reading the raw textAsset export
(`-m export -t textAsset`).

Usage:
  normalize.py --live2d <live2d export root> --raw <raw export root> --out <chars dir>
"""

import argparse
import json
import os
import re
import shutil
import sys

VARIANT_SUFFIX = {
    "live2d": "l",
    "live2d_full": "lf",
    "live2d_talent": "lt",
}

# Unity textAssets are exported with a UTF-8 BOM (EF BB BF), which breaks
# JSON.parse in the browser. Strip it from any json file we write.
def strip_bom(src_path, dst_path):
    with open(src_path, "rb") as f:
        data = f.read()
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    with open(dst_path, "wb") as f:
        f.write(data)


def copy_no_bom(src_path, dst_path):
    if dst_path.endswith(".json"):
        strip_bom(src_path, dst_path)
    else:
        shutil.copy2(src_path, dst_path)


def find_model3_roots(root):
    """Return list of dicts describing each exported model."""
    models = []
    for dirpath, dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith(".model3.json"):
                models.append({"dir": dirpath, "file": fn})
    return models


def guess_skin_and_variant(model_dir, model_file):
    """Map an AssetStudio export path to (skinId, variantSuffix, modelName).

    Handles:
      .../character/10301/live2d/moc/10301_l/10301_L.model3.json
      .../character/11001/live2d_full/a/moc_a/11001_f_a/11001_F_a.model3.json
      .../npc/910201/live2d/moc/910201_l/910201_L.model3.json
      .../disc_l2d/noncen/4004/l2d/moc/4004_f/4004_F.model3.json
      .../characteravg/avg1_137/avg1_137/13701_L.model3.json

    The AVG actor bundles (unreleased characters) have no <id>/<kind> path
    components, so both the skin id and the variant come from the model file
    name itself (13701_L -> skin 13701, Default).
    """
    path = model_dir.replace("\\", "/")
    # .../character/<id>/<kind>/   |  .../npc/<id>/<kind>/
    # .../disc_l2d/noncen/<id>/<kind>/
    m = re.search(r"/(?:character|npc|disc_l2d/noncen)/(\d+)/([^/]+)/", path)
    if m:
        skin_id = m.group(1)
        kind = m.group(2)  # live2d | live2d_full | live2d_talent | l2d
        suffix = VARIANT_SUFFIX.get(kind)
        if suffix is None and kind == "l2d":
            suffix = "l"
        if suffix is None:
            return None
        model_name = model_file[: -len(".model3.json")]
        return skin_id, suffix, model_name

    # .../characteravg/<bundle>/<model-or-moc-dir>/<name>.model3.json
    if "/characteravg/" in path:
        model_name = model_file[: -len(".model3.json")]
        # numbered models carry their 5-digit skin id (13701_L)
        m = re.match(r"^(\d+)_([A-Za-z])", model_name)
        if m:
            suffix = {"L": "l", "F": "lf", "T": "t"}.get(m.group(2).upper(), "l")
            return m.group(1), suffix, model_name
        # unnumbered codename models (jiguang, qingye) — file them under the
        # character id embedded in the avg1 bundle name (avg1_106 -> 106).
        # Story-CG scene rigs (<name>_CG) and models from other avg series
        # (e.g. avg3_100_a, story NPCs with no character entry) are skipped.
        if model_name.endswith("_CG"):
            return None
        fm = re.search(r"/characteravg/avg1_(\d+)", path)
        if not fm:
            return None
        return fm.group(1), "l", model_name

    return None


def find_mtn_folder(model_dir, raw_root):
    """Find the sibling mtn folder in the raw textAsset export.

    AssetStudio live2d export path:
        <live2d_root>/Live2DOutput/assets/.../character/<id>/<kind>[/<a|b>]/moc[_a|_b]/<model>/
    raw textAsset export path:
        <raw_root>/assets/.../character/<id>/<kind>[/<a|b>]/mtn[_a|_b]/

    We take the model dir's parent and swap a leading "moc" component
    for "mtn" (handles both plain "moc" and suffixed "moc_a"/"moc_b").
    """
    # re-root the export-relative path under raw_root
    marker = "Live2DOutput/"
    if marker in model_dir:
        rel = model_dir.split(marker, 1)[1]
        base = os.path.join(raw_root, rel)
    else:
        base = model_dir
    parent = os.path.dirname(base)  # .../moc_a
    comp = os.path.basename(parent)  # "moc_a"
    if not comp.startswith("moc"):
        return None
    mtn_comp = "mtn" + comp[len("moc"):]  # "moc_a" -> "mtn_a"
    raw_mtn = os.path.join(os.path.dirname(parent), mtn_comp)
    if os.path.isdir(raw_mtn):
        return raw_mtn
    # fallback: plain mtn in same parent
    raw_mtn2 = os.path.join(os.path.dirname(parent), "mtn")
    if os.path.isdir(raw_mtn2):
        return raw_mtn2
    return None


def attach_motions(model_dir, model_json, raw_root, dest):
    """Fill empty Motions in model3.json from the raw mtn folder.

    Copies the raw `.motion3` clips (valid motion3.json content) into
    the destination variant folder as `motions/<name>.motion3.json` and
    adds corresponding entries to the model3.json FileReferences.
    """
    fr = model_json.get("FileReferences", {})
    if fr.get("Motions"):
        return model_json
    mtn = find_mtn_folder(model_dir, raw_root)
    if not mtn:
        return model_json
    motions = {}
    motions_dir = os.path.join(dest, "motions")
    os.makedirs(motions_dir, exist_ok=True)
    for fn in sorted(os.listdir(mtn)):
        if not fn.endswith(".motion3"):
            continue
        name = fn[: -len(".motion3")]
        copy_no_bom(os.path.join(mtn, fn), os.path.join(motions_dir, f"{name}.motion3.json"))
        motions[name] = [{"File": f"motions/{name}.motion3.json"}]
    if not motions:
        return model_json
    fr["Motions"] = motions
    model_json["FileReferences"] = fr
    return model_json


def merge_copy(src_dir, dst_dir):
    """Copy src_dir into dst_dir without clobbering existing files.

    Shared subfolders (textures/, motions/) across multiple models in one
    variant folder (e.g. 11001_lf contains 11001_F_a and 11001_F_b) must be
    merged, keeping files from whichever model is copied first.
    """
    os.makedirs(dst_dir, exist_ok=True)
    for entry in os.listdir(src_dir):
        src = os.path.join(src_dir, entry)
        dst = os.path.join(dst_dir, entry)
        if os.path.isdir(src):
            merge_copy(src, dst)
        elif not os.path.exists(dst):
            copy_no_bom(src, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live2d", required=True, help="AssetStudio -m live2d export root")
    ap.add_argument("--raw", required=True, help="AssetStudio -m export -t textAsset root")
    ap.add_argument("--out", required=True, help="destination chars/ dir")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    models = find_model3_roots(args.live2d)
    if not models:
        print("No .model3.json found under", args.live2d)
        sys.exit(1)

    # process primary models first so their shared files win
    models.sort(key=lambda m: m["file"])

    for m in models:
        info = guess_skin_and_variant(m["dir"], m["file"])
        if not info:
            print("SKIP (no numeric skin id or unrecognized path):", os.path.join(m["dir"], m["file"]))
            continue
        skin_id, suffix, model_name = info

        variant_dir = f"{skin_id}_{suffix}"
        dest = os.path.join(args.out, skin_id, variant_dir)
        os.makedirs(dest, exist_ok=True)

        # copy model files; merge shared subfolders (textures, motions)
        for entry in os.listdir(m["dir"]):
            src = os.path.join(m["dir"], entry)
            if os.path.isdir(src):
                merge_copy(src, os.path.join(dest, entry))
            else:
                copy_no_bom(src, os.path.join(dest, entry))

        # attach missing motions for newer bundles
        model3_path = os.path.join(dest, m["file"])
        try:
            with open(model3_path, "r", encoding="utf-8-sig") as f:
                model_json = json.load(f)
            model_json = attach_motions(m["dir"], model_json, args.raw, dest)
            with open(model3_path, "w", encoding="utf-8") as f:
                json.dump(model_json, f, indent=2, ensure_ascii=False)
        except (OSError, json.JSONDecodeError) as e:
            print("WARN: could not post-process", model3_path, e)

        print(f"  {skin_id}/{variant_dir}/{m['file']}")

    print(f"Done. {len(models)} model(s) -> {args.out}")


if __name__ == "__main__":
    main()
