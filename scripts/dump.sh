#!/usr/bin/env bash
#
# dump.sh — Stella Sora Live2D extraction pipeline
#
# Extracts Live2D models from the game's Unity .unity3d asset bundles
# using AssetStudioModCLI, then normalizes them into the site's
# `chars/<skinId>/<variant>/` folder layout.
#
# Usage:
#   bash scripts/dump.sh [--game DIR] [--all]
#
#   --game DIR   game install dir (default: resolved symlink of
#                "../Link to YostarGames/StellaSora_EN")
#   --all        also dump npc_l2d_* and disc_l2d_* bundles
#                (default: only char_l2d_*)
#
# Prereqs:
#   - dotnet with .NET 9+ (uses DOTNET_ROLL_FORWARD=Major)
#   - AssetStudioModCLI dll path (--cli or $ASSETSTUDIO_CLI)
#
set -euo pipefail

GAME=""
CLI="${ASSETSTUDIO_CLI:-/home/morph/ssassets/assetStudioMod/AssetStudioModCLI.dll}"
ALL=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP="$ROOT/.dump_tmp"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --game) GAME="$2"; shift 2 ;;
    --cli)  CLI="$2"; shift 2 ;;
    --all)  ALL=1; shift ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$GAME" ]]; then
  LINK="$ROOT/../Link to YostarGames/StellaSora_EN"
  GAME="$(readlink -f "$LINK" 2>/dev/null || echo "$LINK")"
fi

INSTALL_RESOURCE="$GAME/StellaSora_Data/StreamingAssets/InstallResource"
PERSISTENT="$GAME/Persistent_Store/AssetBundles"

if [[ ! -d "$INSTALL_RESOURCE" ]]; then
  echo "ERROR: InstallResource not found at $INSTALL_RESOURCE" >&2
  exit 1
fi

echo "Game: $GAME"
echo "AssetStudio CLI: $CLI"
echo "InstallResource: $INSTALL_RESOURCE"

rm -rf "$TMP"
mkdir -p "$TMP/live2d" "$TMP/raw" "$TMP/chars"

# Collect the bundle list
PATTERNS=("char_l2d_")
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
for bundle in "${BUNDLES[@]}"; do
  base="$(basename "$bundle" .unity3d)"
  echo "=== $base ==="
  out_l2d="$TMP/live2d/$base"
  out_raw="$TMP/raw/$base"
  mkdir -p "$out_l2d" "$out_raw"

  # Live2D model export
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$bundle" -m live2d -o "$out_l2d" --image-format png \
    >/dev/null 2>&1 || { echo "  live2d export FAILED"; FAILED+=("$base"); continue; }

  # Raw textAsset export (motion clips for newer bundles)
  DOTNET_ROLL_FORWARD=Major dotnet "$CLI" "$bundle" -m export -t textAsset -o "$out_raw" \
    >/dev/null 2>&1 || echo "  textAsset export FAILED"

  python3 "$SCRIPT_DIR/normalize.py" \
    --live2d "$out_l2d" --raw "$out_raw" --out "$TMP/chars" \
    || echo "  normalize FAILED"
done

echo ""
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed bundles: ${FAILED[*]}" >&2
fi

# Generate manifest
node "$SCRIPT_DIR/generateManifest.mjs" \
  --chars "$TMP/chars" \
  --out "$ROOT/data/models.json" \
  --names "$ROOT/data/characterid.json" \
  --disc-names "$ROOT/data/discid.json" || true

echo ""
echo "Done. Normalized models in:"
echo "  $TMP/chars"
echo "Manifest written to:"
echo "  $ROOT/data/models.json"
echo ""
echo "To deploy, copy $TMP/chars into the site's 'chars/' directory:"
echo "  cp -r $TMP/chars/. $ROOT/chars/"
