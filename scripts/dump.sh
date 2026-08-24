#!/usr/bin/env bash
#
# dump.sh — Stella Sora Live2D extraction pipeline
#
# Extracts Live2D models from the game's Unity .unity3d asset bundles
# using AssetStudioModCLI, then normalizes them into the site's
# `chars/<skinId>/<variant>/` folder layout.
#
# Usage:
#   bash scripts/dump.sh [--game DIR] [--all] [--skin CharacterSkin.json]
#
#   --game DIR   game install dir (default: resolved symlink of
#                "../Link to YostarGames/StellaSora_EN")
#   --datamine DIR
#                datamine root (default: "../StellaSoraData Makostar"); the
#                name tables below are auto-resolved from its
#                EN/language/en_US when not given explicitly
#   --all        also dump npc_l2d_* and disc_l2d_* bundles
#                (default: only char_l2d_* + the AVG actor bundles that
#                carry unreleased characters' Live2D)
#   --skin FILE  datamine CharacterSkin.json; if given, data/charbg.json is
#                regenerated and the CharBg main-menu backdrops are staged
#                into bg/charbg/ from the game's image-*.unity3d bundles
#   --board-npc FILE
#                datamine language/en_US/BoardNPC.json; fallback names for
#                NPCs that characterid.json doesn't cover
#                (default: auto-resolved from --datamine)
#   --skin-names FILE
#                datamine language/en_US/CharacterSkin.json; labels the extra
#                skin variants that don't match Default/Awakened/Talent/Memory
#                Snapshot (shown as "Unknown" otherwise)
#                (default: auto-resolved from --datamine)
#   --char-names FILE
#                datamine language/en_US/Character.json; authoritative
#                character names, rebuilt into data/characterid.json
#                (default: auto-resolved from --datamine)
#
# Prereqs:
#   - dotnet with .NET 9+ (uses DOTNET_ROLL_FORWARD=Major)
#   - AssetStudioModCLI dll path (--cli or $ASSETSTUDIO_CLI)
#
set -euo pipefail

GAME=""
CLI="${ASSETSTUDIO_CLI:-/home/morph/ssassets/assetStudioMod/AssetStudioModCLI.dll}"
ALL=0
SKIN=""
BOARD_NPC=""
SKIN_NAMES=""
CHAR_NAMES=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP="$ROOT/.dump_tmp"
DATAMINE="$ROOT/../StellaSoraData Makostar"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --game) GAME="$2"; shift 2 ;;
    --cli)  CLI="$2"; shift 2 ;;
    --all)  ALL=1; shift ;;
    --skin) SKIN="$2"; shift 2 ;;
    --board-npc) BOARD_NPC="$2"; shift 2 ;;
    --skin-names) SKIN_NAMES="$2"; shift 2 ;;
    --char-names) CHAR_NAMES="$2"; shift 2 ;;
    --datamine) DATAMINE="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$GAME" ]]; then
  LINK="$ROOT/../Link to YostarGames/StellaSora_EN"
  GAME="$(readlink -f "$LINK" 2>/dev/null || echo "$LINK")"
fi

# Name tables (BoardNPC / CharacterSkin / Character) auto-resolve from the
# datamine's EN language dir when not passed explicitly — the pipeline should
# pick up NPC/skin/character names on every run without hand-arguing files.
LANG_DIR="$DATAMINE/EN/language/en_US"
[[ -n "$BOARD_NPC" || ! -f "$LANG_DIR/BoardNPC.json" ]] || BOARD_NPC="$LANG_DIR/BoardNPC.json"
[[ -n "$SKIN_NAMES" || ! -f "$LANG_DIR/CharacterSkin.json" ]] || SKIN_NAMES="$LANG_DIR/CharacterSkin.json"
[[ -n "$CHAR_NAMES" || ! -f "$LANG_DIR/Character.json" ]] || CHAR_NAMES="$LANG_DIR/Character.json"

INSTALL_RESOURCE="$GAME/StellaSora_Data/StreamingAssets/InstallResource"
PERSISTENT="$GAME/Persistent_Store/AssetBundles"

if [[ ! -d "$INSTALL_RESOURCE" ]]; then
  echo "ERROR: InstallResource not found at $INSTALL_RESOURCE" >&2
  exit 1
fi

echo "Game: $GAME"
echo "AssetStudio CLI: $CLI"
echo "InstallResource: $INSTALL_RESOURCE"
echo "BoardNPC names: ${BOARD_NPC:-<none found>}"
echo "Skin names: ${SKIN_NAMES:-<none found>}"
echo "Char names: ${CHAR_NAMES:-<none found>}"

rm -rf "$TMP"
mkdir -p "$TMP/live2d" "$TMP/raw" "$ROOT/chars"

# Collect the bundle list
# char_avg_2d_avg1_* / char_avg_2d_avg3_10*: unreleased characters ship no
# char_l2d_<id> bundle at all — their Live2D is embedded as a Cubism prefab
# (CubismMoc + AnimationClips) inside these AVG actor bundles in
# Persistent_Store (the InstallResource copies are stripped and export
# nothing).  Sprite-only avg bundles come out empty and are skipped before
# normalize below.
PATTERNS=("char_l2d_" "char_avg_2d_avg1_" "char_avg_2d_avg3_10")
if [[ "$ALL" == "1" ]]; then
  PATTERNS+=("npc_l2d_" "disc_l2d_")
fi

BUNDLES=()
for dir in "$INSTALL_RESOURCE" "$PERSISTENT"; do
  [[ -d "$dir" ]] || continue
  for f in "$dir"/*.unity3d; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    for p in "${PATTERNS[@]}"; do
      if [[ "$base" == ${p}*.unity3d ]]; then
        BUNDLES+=("$f")
        break
      fi
    done
  done
done

# Dedupe, sort
BUNDLES=($(printf '%s\n' "${BUNDLES[@]}" | sort -u))
echo "Found ${#BUNDLES[@]} Live2D bundles"

FAILED=()
mkdir -p "$TMP/chars_avg"
for bundle in "${BUNDLES[@]}"; do
  base="$(basename "$bundle" .unity3d)"
  echo "=== $base ==="
  # avg-derived models are staged separately: they duplicate the _l/_lf
  # variants already extracted (richer) from char_l2d bundles for released
  # characters, and only the ids without a char_l2d source are merged below.
  stage="$ROOT/chars"
  if [[ "$base" == char_avg_2d_* ]]; then
    stage="$TMP/chars_avg"
  fi
  out_l2d="$TMP/live2d/$base"
  out_raw="$TMP/raw/$base"
  mkdir -p "$out_l2d" "$out_raw"

  # Live2D model export
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$bundle" -m live2d -o "$out_l2d" --image-format png \
    >/dev/null 2>&1 || { echo "  live2d export FAILED"; FAILED+=("$base"); continue; }

  # Raw textAsset export (motion clips for newer bundles)
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$bundle" -m export -t textAsset -o "$out_raw" \
    >/dev/null 2>&1 || echo "  textAsset export FAILED"

  # Sprite-only bundles (e.g. avg actors that ship no L2D yet) export no
  # model at all — skip normalize for them.
  if [[ -n "$(find "$out_l2d" -name '*.model3.json' -print -quit)" ]]; then
    python3 "$SCRIPT_DIR/normalize.py" \
      --live2d "$out_l2d" --raw "$out_raw" --out "$stage" \
      || echo "  normalize FAILED"
  fi
done

# Merge avg-staged models in: only characters that have no char_l2d-derived
# folder (unreleased ids like 13701).  Released characters keep the richer
# char_l2d extraction.
for d in "$TMP/chars_avg"/*/; do
  [[ -d "$d" ]] || continue
  id="$(basename "$d")"
  if [[ -e "$ROOT/chars/$id" ]]; then
    echo "avg duplicate skipped: $id (already covered by char_l2d)"
  else
    mv "$d" "$ROOT/chars/$id"
    echo "avg new character merged: $id"
  fi
done

echo ""
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed bundles: ${FAILED[*]}" >&2
fi

# Background layer composition: for every bundle, dump the scene graph
# (gameobject/transform/sprite/spriteRenderer) so extractBgLayers.mjs can
# reconstruct the layered `----bg----` / `----bg_effect----` /
# `----fg_effect----` / model-subtree sprite stack for each variant.
BGDIR="$TMP/bglayers"
TEXDIR="$TMP/bgtex"
mkdir -p "$BGDIR" "$TEXDIR"
BG_FAILED=()
for bundle in "${BUNDLES[@]}"; do
  base="$(basename "$bundle" .unity3d)"
  # avg prefabs are plain model rigs — no ----bg---- scene layers to compose
  [[ "$base" == char_avg_2d_* ]] && continue
  echo "=== $base (bg) ==="
  out_bg="$BGDIR/$base"
  out_tex="$TEXDIR/$base"
  mkdir -p "$out_bg" "$out_tex"

  # Scene-graph dump for the composition extractor.  rectTransform is a
  # distinct Unity class from transform; the prefab roots that host the
  # ----bg---- composition are RectTransforms in some bundles (e.g. Donna's
  # dual-model Memory Snapshot), so it must be in the type list or those
  # layers are silently dropped.
  if ! DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$bundle" -m dump \
      -t gameobject,transform,rectTransform,sprite,spriteRenderer \
      -f assetName_pathID --load-all -o "$out_bg" >/dev/null 2>&1; then
    echo "  bg dump FAILED"; BG_FAILED+=("$base"); continue
  fi

  # Composition: which sprites, at what world position/scale, in which order
  node "$SCRIPT_DIR/extractBgLayers.mjs" \
    --dump "$out_bg" \
    --out "$out_bg/compositions.json" || echo "  extract FAILED"

  # Export every texture as PNG so copyBgTextures.mjs can stage the layers
  if ! DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$bundle" -m export \
      -t texture2d -o "$out_tex" --image-format png >/dev/null 2>&1; then
    echo "  texture export FAILED"
  fi
done

if [[ ${#BG_FAILED[@]} -gt 0 ]]; then
  echo "Failed bg dumps: ${BG_FAILED[*]}" >&2
fi

# Generate a fresh manifest from the staged chars/ output.  The first pass
# runs before bg textures are copied in, so run it again at the end once the
# variant bg/ folders exist (see below) so the standalone `bg` list and the
# merged `bgLayers` both end up in data/models.json.
if [[ -n "$CHAR_NAMES" ]]; then
  node "$SCRIPT_DIR/generateCharNames.mjs" \
    --lang "$CHAR_NAMES" \
    --current "$ROOT/data/characterid.json" \
    --out "$ROOT/data/characterid.json" || true
fi
node "$SCRIPT_DIR/generateManifest.mjs" \
  --chars "$ROOT/chars" \
  --out "$ROOT/data/models.json" \
  --names "$ROOT/data/characterid.json" \
  --disc-names "$ROOT/data/discid.json" \
  --charbg "$ROOT/data/charbg.json" \
  --offset "$ROOT/data/offset.json" \
  --board-npc "$BOARD_NPC" \
  --skin-names "$SKIN_NAMES" || true

# Merge the per-bundle compositions into models.json as bgLayers
node "$SCRIPT_DIR/mergeBgLayers.mjs" \
  --models "$ROOT/data/models.json" \
  --layers "$BGDIR" || true

# Stage the referenced bg PNGs into each variant's bg/ folder
node "$SCRIPT_DIR/copyBgTextures.mjs" \
  --models "$ROOT/data/models.json" \
  --tex "$TEXDIR" \
  --chars "$ROOT/chars" || true

# Regenerate the manifest now that bg/ folders are populated (so each
# variant's standalone `bg` list is present), then re-merge bgLayers on top.
node "$SCRIPT_DIR/generateManifest.mjs" \
  --chars "$ROOT/chars" \
  --out "$ROOT/data/models.json" \
  --names "$ROOT/data/characterid.json" \
  --disc-names "$ROOT/data/discid.json" \
  --charbg "$ROOT/data/charbg.json" \
  --offset "$ROOT/data/offset.json" \
  --board-npc "$BOARD_NPC" \
  --skin-names "$SKIN_NAMES" || true

node "$SCRIPT_DIR/mergeBgLayers.mjs" \
  --models "$ROOT/data/models.json" \
  --layers "$BGDIR" || true

# --- Main-menu backdrops (Image/CharBg) -------------------------------------
# The game draws CharacterSkin.Bg (Image/CharBg/<name>.png) on the
# customized_bg SpriteRenderer behind the L2D in the main menu.  Those images
# live in the game's image-*.unity3d bundles.  Stage them into bg/charbg/ and,
# when a datamine CharacterSkin.json is supplied, rebuild data/charbg.json.
if [[ -n "$SKIN" ]]; then
  CHARBG_DIR="$ROOT/bg/charbg"
  mkdir -p "$CHARBG_DIR" "$TMP/charbg"
  echo "=== charbg (main-menu backdrops) ==="
  for f in "$INSTALL_RESOURCE"/image-*.unity3d; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f" .unity3d)"
    out="$TMP/charbg/$base"
    mkdir -p "$out"
    DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$f" -m export -t tex2d \
      --filter-by-container CharBg -o "$out" --image-format png >/dev/null 2>&1 || true
  done
  find "$TMP/charbg" -name "*.png" -exec cp {} "$CHARBG_DIR" \; 2>/dev/null || true
  node "$SCRIPT_DIR/generateCharBg.mjs" \
    --skin "$SKIN" \
    --bg "$CHARBG_DIR" \
    --out "$ROOT/data/charbg.json" || true
fi

# --- Disc parallax scenes (all disc_XXXX bundles) ----------------------------
# Every disc (1xxx/2xxx/3xxx/4xxx) has a static "parallax" card composition in
# its plain disc_XXXX bundle: the main SpriteRenderer art + the gyroscope Image
# overlays + the <id>_B full-card image.  These are the disc's non-L2D entries
# in the viewer (rendered with a mouse-drag parallax effect).  The disc's
# Live2D (disc_l2d_XXXX) is extracted separately by the Live2D step above.
DISC_OV="$TMP/discoverlays"
mkdir -p "$DISC_OV"/{dump,img,tex,texpng,common}
echo "=== disc parallax scenes ==="
# The card's outer border ("frame") is a shared sprite/texture in the
# disc_common bundle; export its PNG once so it can be added back to every
# disc's overlay (the per-disc sprite dump drops it due to a name collision).
# The shared Common.prefab gyroscope setup (GyroscopeFollower /
# AvgL2DUseGyroscope) is dumped alongside: discs without their own Card
# prefab inherit its parallax factors in extractDiscParallax.mjs.
if [[ -f "$PERSISTENT/disc_common.unity3d" ]]; then
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$PERSISTENT/disc_common.unity3d" -m export \
    -t texture2d -o "$DISC_OV/common" --image-format png >/dev/null 2>&1 || true
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$PERSISTENT/disc_common.unity3d" -m export \
    -t monoBehaviour -o "$DISC_OV/img/disc_common" >/dev/null 2>&1 || true
fi
for f in "$INSTALL_RESOURCE"/disc_[0-9][0-9][0-9][0-9].unity3d; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f" .unity3d)"   # e.g. disc_4004
  id="${base#disc_}"                 # 4004
  out_dump="$DISC_OV/dump/$base"
  out_img="$DISC_OV/img/$base"
  out_tex="$DISC_OV/tex/$base"
  out_png="$DISC_OV/texpng/$base"
  mkdir -p "$out_dump" "$out_img" "$out_tex" "$out_png"

  # Scene graph (GameObject/Transform/RectTransform/SpriteRenderer)
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$f" -m dump \
    -t gameobject,transform,rectTransform,spriteRenderer \
    -f assetName_pathID --load-all -o "$out_dump" >/dev/null 2>&1 || true

  # Sprite assets (rect/pivot/texture refs).  Dumped separately: the combined
  # dump above only exports the uniquely-named <id>_B sprite, but the overlay
  # and main-art pieces are named generically (e.g. "1", "2a") or collide with
  # GameObject names, so a combined dump drops them.
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$f" -m dump \
    -t sprite -f assetName_pathID --load-all -o "$DISC_OV/sprite/$base" >/dev/null 2>&1 || true

  # All monoBehaviour components: Image (which overlay GO uses which sprite),
  # plus the parallax setup itself — GyroscopeFollower (per-layer gyroscope
  # factors), Mask (the overlay clip window) and AvgL2DUseGyroscope (target
  # range) — which were missing from the old Image-only export.
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$f" -m export \
    -t monoBehaviour -o "$out_img" >/dev/null 2>&1 || true

  # Texture2D pathID -> name mapping
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$f" -m dump \
    -t texture2d -f assetName_pathID --load-all -o "$out_tex" >/dev/null 2>&1 || true

  # Texture PNGs
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$f" -m export \
    -t texture2d -o "$out_png" --image-format png >/dev/null 2>&1 || true
done
node "$SCRIPT_DIR/extractDiscParallax.mjs" \
  --dump "$DISC_OV/dump" \
  --sprite "$DISC_OV/sprite" \
  --img "$DISC_OV/img" \
  --tex "$DISC_OV/tex" \
  --texpng "$DISC_OV/texpng" \
  --frame "$DISC_OV/common" \
  --out "$ROOT/data/discparallax.json" \
  --chars "$ROOT/chars" || true
# Rebuild the Discs section: every disc as a parallax entry + a "[title] l2d"
# entry for the discs that have a Live2D.
node "$SCRIPT_DIR/generateDiscs.mjs" \
  --models "$ROOT/data/models.json" \
  --parallax "$ROOT/data/discparallax.json" \
  --disc-names "$ROOT/data/discid.json" || true

# --- MainView L2D offsets (Actor2DOffsetData) --------------------------------
# Each skin's CharacterSkin.Offset (Actor2D/Character/<skin>/<skin>.asset) lives
# in the char_2d_<skin>.unity3d bundles.  We keep the MainView (panel 10) Set 2
# offset (the Normal/half-body framing) per skin as data/offset.json.
OFFDIR="$TMP/offsets"
mkdir -p "$OFFDIR"
echo "=== offsets (MainView L2D) ==="
for dir in "$INSTALL_RESOURCE" "$PERSISTENT"; do
  [[ -d "$dir" ]] || continue
  for f in "$dir"/char_2d_*.unity3d; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f" .unity3d)"
    id="${base#char_2d_}"
    out="$OFFDIR/$id"
    mkdir -p "$out"
    DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$f" -m export -t monoBehaviour \
      --filter-by-name "$id" -o "$out" >/dev/null 2>&1 || true
  done
done
node "$SCRIPT_DIR/generateOffset.mjs" \
  --src "$OFFDIR" \
  --out "$ROOT/data/offset.json" || true

echo ""
echo "Done. Models written directly to:"
echo "  $ROOT/chars"
echo "Bg compositions in:"
echo "  $TMP/bglayers"
echo "Manifest written to:"
echo "  $ROOT/data/models.json"
echo "Overlays written to:"
echo "  $ROOT/chars/<id>/<id>_p/overlays"
echo "No manual copy needed — final files are already in place."
