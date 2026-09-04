#!/usr/bin/env python3
"""extractAvg.py — extract story-character (AVG) sprites from one bundle.

The game's AVG dialogues draw every story character as a pair of Unity
Sprites on coincident nodes of a shared rig (body_a/body_b + face_a/face_b
all sit at localPosition (0,0,0) scale (1,1,1) inside the AvgPanel prefab in
ui_avg.unity3d — see Avg_2_CharCtrl:_SetPortrait).  Alignment between a
character's body and its faces is therefore baked into the sprite MESHES:
each sprite's tight mesh vertices (Unity units, PPU 100, pivot-relative)
place the visible content at its authored offset from the rig node.

AssetStudio-style rect crops lose that offset (the packed rect is larger
than the tight mesh and the content is off-centre inside it), so this script
exports the sprite PNG from the mesh (same as the game draws it) and records
the mesh bbox centre per sprite.  data/avg.json (generateAvg.mjs) then
positions each face relative to its body by mesh-centre deltas.

It also dumps the Actor2DOffsetData MonoBehaviour ("<id>.asset") whose
arrData carries the per-panel/per-pose placement of the whole rig in the
dialogue canvas (Set 2 = what Avg_2_CharCtrl applies to rtRawImage), plus
the shared AnimEmoji sticker offsets (arrEmojiData, keyed by the global
emoji index from AvgPreset.CharEmoji — the stickers themselves live in
UI/Avg/AnimEmoji prefabs, not in these bundles).

Usage (per bundle, driven by scripts/dump.sh):
  python3 extractAvg.py --bundle <path.unity3d> --out <dir> --meta <file.json>

Writes <dir>/<sprite name>.png for every Sprite and <meta> with:
  { id, sprites: [{file,w,h,cx,cy}], offsets: [{panel,pose,x,y,s}] }
  cx/cy = mesh bbox centre relative to the sprite pivot, px, y-up.
Requires UnityPy (pip install UnityPy); the bundle's own type trees are used,
no external dump needed.
"""

import argparse
import json
import os
import re
import struct
import sys
import types


def _import_unitypy():
    try:
        import UnityPy  # noqa: F401
        return UnityPy
    except ImportError:
        raise SystemExit("UnityPy is required: python3 -m pip install UnityPy")


def _stub_fmod(UnityPy):
    # UnityPy's export/__init__ imports AudioClipConverter -> fmod_toolkit;
    # we only need SpriteHelper, so stub the missing FMOD native binding out.
    try:
        import UnityPy.export.SpriteHelper  # noqa: F401
        return
    except Exception:
        pass
    fm = types.ModuleType("fmod_toolkit")
    sys.modules.setdefault("fmod_toolkit", fm)
    for sub in ("fmod", "raw_to_wav", "sound_to_wav", "subsound_to_wav"):
        m = types.ModuleType("fmod_toolkit." + sub)
        sys.modules.setdefault("fmod_toolkit." + sub, m)
        setattr(fm, sub, m)


def mesh_bbox(unitypy, sprite):
    """Tight mesh bbox of a sprite, px relative to pivot (y-up).

    The vertex stream layout mirrors what UnityPy's SpriteHelper uses:
    stream 0 holds float32 positions (dimension 3), other streams (uv) are
    skipped; the per-vertex stride comes from the channel table.
    """
    rd = sprite.m_RD
    mesh = rd.m_VertexData
    n = mesh.m_VertexCount
    stride = 0
    for c in mesh.m_Channels:
        if c.stream == 0 and c.dimension > 0:
            stride += (4 if c.format == 0 else 1) * c.dimension
    data = mesh.m_DataSize
    if stride == 0 or n == 0:
        return None
    xs = []
    ys = []
    for i in range(n):
        x, y, _ = struct.unpack_from("<fff", data, i * stride)
        xs.append(x * 100.0)  # m_PixelsToUnits == 100 for these bundles
        ys.append(y * 100.0)
    return min(xs), max(xs), min(ys), max(ys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", required=True)
    ap.add_argument("--out", required=True, help="sprite PNG output dir")
    ap.add_argument("--meta", required=True, help="per-bundle metadata json")
    args = ap.parse_args()

    UnityPy = _import_unitypy()
    _stub_fmod(UnityPy)
    from UnityPy.export import SpriteHelper

    env = UnityPy.load(args.bundle)

    bid = os.path.basename(args.bundle).removesuffix(".unity3d")
    bid = re.sub(r"^InstallResource_", "", bid)
    bid = re.sub(r"^Persistent_Store_AssetBundles_", "", bid)

    os.makedirs(args.out, exist_ok=True)

    sprites = []
    for obj in env.objects:
        if obj.type.name != "Sprite":
            continue
        sp = obj.read()
        name = sp.m_Name
        bbox = mesh_bbox(UnityPy, sp)
        cx = cy = 0.0
        w = h = 0
        if bbox:
            x0, x1, y0, y1 = bbox
            w = int(round(x1 - x0))
            h = int(round(y1 - y0))
            cx = round((x0 + x1) / 2.0, 2)
            cy = round((y0 + y1) / 2.0, 2)
        img = SpriteHelper.get_image_from_sprite(sp)
        if img is not None:
            img = img.convert("RGBA")
            w, h = img.size
            img.save(os.path.join(args.out, name + ".png"))
        sprites.append({"file": name + ".png", "w": w, "h": h, "cx": cx, "cy": cy})
    sprites.sort(key=lambda s: s["file"])

    # Actor2DOffsetData: the MonoBehaviour whose arrData entries carry
    # fX1/fY1/fS1 (Set 1) and fX2/fY2/fS2 (Set 2) + arrEmojiData.
    offsets = []
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tt = obj.read_typetree()
        except Exception:
            continue
        if not isinstance(tt, dict):
            continue
        arr = tt.get("arrData")
        if not isinstance(arr, list) or not arr or "fX1" not in arr[0]:
            continue
        for p in arr:
            offsets.append({
                "panel": p.get("nPanelId", 0),
                "pose": p.get("nPoseIndex", 0),
                "x": round(p.get("fX2", 0.0), 4),
                "y": round(p.get("fY2", 0.0), 4),
                "s": round(p.get("fS2", 1.0), 4),
            })

    meta = {
        "id": bid,
        "source": os.path.basename(args.bundle),
        "sprites": sprites,
        "offsets": offsets,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.meta)), exist_ok=True)
    with open(args.meta, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    print(f"  {bid}: {len(sprites)} sprites, {len(offsets)} offsets")


if __name__ == "__main__":
    main()
