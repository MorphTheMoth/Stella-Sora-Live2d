# Updating `data/` and `chars/` after a game update

This is the canonical procedure to re-extract everything after the game ships a new version. `scripts/dump.sh` is the single source of truth — every `data/*.json` and everything under `chars/`/`bg/` is overwritten by it. Never hand-edit those artifacts; fix the generating script (`scripts/generate*.mjs`, `scripts/extract*.mjs`, `scripts/normalize.py`, ...) and re-run the pipeline.

 Companion reference: `docs/AgentsReadme.md` → "Updating models when the game updates" + "How it works" + "Layout".

---

## 1. Prerequisites

- **Game install** — resolved via symlink `../Link to YostarGames/StellaSora_EN` or `--game DIR`. Must contain both `StellaSora_Data/StreamingAssets/InstallResource` and `Persistent_Store/AssetBundles`.
- **Datamine** — clone of `StellaSoraData Makostar` next to this repo (default `../StellaSoraData Makostar`). Provides `EN/bin/{Disc,Character,CharacterSkin,CharacterCG}.json` and `EN/language/en_US/{Character,CharacterSkin,BoardNPC,Item}.json`. Override with `--datamine DIR` or the explicit `--board-npc`/`--skin-names`/`--char-names`/`--skin` flags.
- **AssetStudioModCLI** — `dotnet` with .NET 9+ (`DOTNET_ROLL_FORWARD=Major`) and `AssetStudioModCLI.dll` (default `/home/morph/ssassets/assetStudioMod/AssetStudioModCLI.dll`, override with `--cli` / `$ASSETSTUDIO_CLI`).
- **Site viewer** — no build step; `python3 -m http.server 8000` after the dump is enough to verify.

---

## 2. One command re-dump

From the repo root:

```bash
bash scripts/dump.sh --game "/path/to/StellaSora_EN"
```

Common additions:

```bash
# also dump npc_l2d_* + disc_l2d_* (default is char_l2d_* + AVG unreleased chars)
bash scripts/dump.sh --game "$GAME" --all

# also rebuild CharBg backdrops (bg/charbg/ + data/charbg.json) from CharacterSkin.Bg
bash scripts/dump.sh --game "$GAME" --skin "/path/to/datamine/EN/bin/CharacterSkin.json"

# fully explicit (game + datamine tables)
bash scripts/dump.sh \
  --game "/home/morph/stella sora meter/Link to YostarGames/StellaSora_EN" \
  --datamine "/home/morph/stella sora meter/StellaSoraData Makostar" \
  --skin "$DATAMINE/EN/bin/CharacterSkin.json"
```

`--datamine` auto-resolves the three name tables (`BoardNPC.json`, `CharacterSkin.json`, `Character.json`) from `EN/language/en_US`; you only need to pass them by hand when the datamine is elsewhere.

The script is additive: existing `chars/`/`data/` entries that vanished from the game stay visible (never deleted, only overwritten/appended).

---

## 3. What `dump.sh` does (and what it rebuilds)

Order matters — `data/models.json` is built twice (before and after bg staging):

1. **Bundle discovery** — collects `char_l2d_*`, `char_avg_2d_avg1_*` / `char_avg_2d_avg3_10*` (and with `--all`, `npc_l2d_*` / `disc_l2d_*`) from `InstallResource` + `Persistent_Store`.
2. **Live2D export** (`-m live2d` + `-m export -t textAsset`) + `scripts/normalize.py` → `chars/<skinId>/<variant>/` (e.g. `10301/10301_l`, `_lf`, `_lt`); AVG bundles staged to `.dump_tmp/chars_avg` and merged only for ids no `char_l2d` produced (unreleased chars like `13701`).
3. **Bg-layer composition** (`-m dump` gameobject/transform/rectTransform/sprite/spriteRenderer + `scripts/extractBgLayers.mjs` + `-m export -t texture2d`) → `.dump_tmp/bglayers/` + `.dump_tmp/bgtex/`; merged into `data/models.json` as `bgLayers` by `scripts/mergeBgLayers.mjs` and staged as `chars/<skinId>/<variant>/bg/*.png` by `scripts/copyBgTextures.mjs`.
4. **Name tables** — `scripts/generateDiscId.mjs` → `data/discid.json` (from `Disc.json` + `Item.json`); `scripts/generateCharNames.mjs` → `data/characterid.json`.
5. **Manifest** — `scripts/generateManifest.mjs` → `data/models.json` (groups skins by first 3 digits, NPCs by first 4, reads `characterid.json`/`discid.json`/`charbg.json`/`offset.json`/`BoardNPC.json`/`CharacterSkin.json`). Re-run after bg staging so both `bg` singles and `bgLayers` survive.
6. **CharBg backdrops** (only with `--skin`) — `image-*.unity3d` `--filter-by-container CharBg` → `bg/charbg/*.png` + `scripts/generateCharBg.mjs` → `data/charbg.json`.
7. **Disc parallax cards** — every `disc_XXXX.unity3d` (+ `disc_common.unity3d` + `ui_big_sprites.unity3d`) → `.dump_tmp/discoverlays/` → `scripts/extractDiscParallax.mjs` → `data/discparallax.json` + `chars/<id>/<id>_p/overlays/*.png`; then `scripts/generateDiscs.mjs` rebuilds the Discs section (`kind:"parallax"` + `kind:"discl2d"`).
8. **Offsets** — `char_2d_*.unity3d` `Actor2DOffsetData` → `.dump_tmp/offsets/` → `scripts/generateOffset.mjs` → `data/offset.json` (MainView panel 10 Set 2: `{s,x,y}`).

### What each `data/*.json` is for

| file | generator | contents |
|------|-----------|----------|
| `data/models.json` | `generateManifest.mjs` + `mergeBgLayers.mjs` + `generateDiscs.mjs` | site manifest: Trekkers / Events / Disc L2D / Discs / Others, per-variant `path`/`label`/`bg`/`bgLayers`/`charBg`/`offset` |
| `data/characterid.json` | `generateCharNames.mjs` (`Character.json`) | charId(3) → display name |
| `data/discid.json` | `generateDiscId.mjs` (`Disc.json` + `Item.json`) | discId(4) → title (last-4-digit mapping) |
| `data/charbg.json` | `generateCharBg.mjs` (`CharacterSkin.json`) | skinId → CharBg basename |
| `data/discparallax.json` | `extractDiscParallax.mjs` | per-disc `{canvasW/H, mask, parallax{ax,ay}, layers[]}` |
| `data/offset.json` | `generateOffset.mjs` (`Actor2DOffsetData`) | skinId → MainView Set 2 `{s,x,y}` |

---

## 4. Exhaustive "Others" scan (optional)

Brute-forces every `*.unity3d` for an embedded Cubism rig and stages unknowns into `chars/others/`:

```bash
node scripts/bruteForceOthers.mjs          # uses cached mtime+size in .dump_tmp/brute_others.cache.json
node scripts/bruteForceOthers.mjs --force  # ignore cache
```

The cache skips `rg` + `dotnet -m live2d` for unchanged files, so the first run is slow and re-runs are seconds unless the game changed. Stale entries are pruned automatically. Re-runs still regenerate `data/models.json` Discs section to keep `kind:"other"` entries.

---

## 5. Verify

```bash
# manifest present and counts look sane
jq '. | length' data/models.json
jq '[.[].kind] | group_by(.) | map({kind:.[0], n:length})' data/models.json

# spot-check a new skin / new disc is Listed in the viewer
python3 -m http.server 8000
# open http://localhost:8000 — Trekkers / Discs / Disc L2D / Events counts at top
# open a Default variant with CharBg (dark bar should fill screen, character offset down)
# open a Memory Snapshot (bgLayers composite) and a parallax disc (drag → tilt, Enable Mask/Max Rotation toggles)
```

If something looks wrong, fix the extractor/generator (never the dumped `data/`/`chars/` files) and re-run `bash scripts/dump.sh --game …` or the single `node scripts/*.mjs` that owns the artifact.

---

## 6. Commit

Textures + models are large — use Git LFS:

```bash
git lfs track "chars/**" "bg/charbg/**"
git add .gitattributes data/*.json bg/charbg/
git add chars/
git commit -m "data: re-dump for <game version> (<date>)"
```

`.dump_tmp/` and the brute-force cache (`.dump_tmp/brute_others.cache.json`) are gitignored and not committed.

---

## 7. Troubleshooting

- `InstallResource not found` → `--game` points at the wrong dir; it must contain `StellaSora_Data/StreamingAssets/InstallResource`.
- `normalize FAILED` or `0 models` for an AVG skin → expected for sprite-only AVG bundles; only `char_avg_2d_avg1_*` with a `CubismMoc` produce output (see `docs/AgentsReadme.md` → AVG bundles).
- `bgLayers` empty after hand-running `generateManifest.mjs` → normal: the manifest drops `bgLayers`; re-run `node scripts/mergeBgLayers.mjs --models data/models.json --layers .dump_tmp/bglayers` or just re-run `dump.sh`.
- Motion clips `SyntaxError: unexpected character` → UTF-8 BOM not stripped; `scripts/normalize.py` handles this; don't dump motions by hand without stripping the first 3 bytes.
- `discparallax.json` missing a disc → ensure both `InstallResource/disc_XXXX.unity3d` and `Persistent_Store/disc_XXXX.unity3d` were dumped; the script prefers the `Persistent_Store` copy when both exist.
