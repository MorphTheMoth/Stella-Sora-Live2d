# Updating `data/` and `chars/` after a game update

This is the canonical procedure to re-extract everything after the game ships a new version. `scripts/dump.sh` is the single source of truth — every `data/*.json` and everything under `chars/`/`bg/` is overwritten by it. Never hand-edit those artifacts; fix the generating script (`scripts/generate*.mjs`, `scripts/extract*.mjs`, `scripts/normalize.py`, ...) and re-run the pipeline.

 Companion reference: `docs/AgentsReadme.md` → "Updating models when the game updates" + "How it works" + "Layout".

---

## 1. Prerequisites

- **Game install** — resolved via symlink `../Link to YostarGames/StellaSora_EN` or `--game DIR`. Must contain both `StellaSora_Data/StreamingAssets/InstallResource` and `Persistent_Store/AssetBundles`.
- **Datamine** — two clones next to this repo, because game 2.0 split the upstream repo:
  - `ss-data` (default `../ss-data`) — binary + language tables: `EN/bin/{Disc,Character,CharacterSkin,CharacterCG}.json` and `EN/language/en_US/{Character,CharacterSkin,BoardNPC,Item}.json`.
  - `StellaSoraData Makostar` (default `../StellaSoraData Makostar`, ss-lua) — decompiled `Lua/` tree only; supplies the AVG preset names (`Lua/Game/UI/Avg/_en/Preset/AvgCharacter.lua`).

  `scripts/datamine.mjs` probes `../ss-data` first and falls back to the old combined root, so older checkouts still work. Override with `--data DIR` / `--datamine DIR` or the explicit `--board-npc`/`--skin-names`/`--char-names`/`--skin` flags.
- **AssetStudioModCLI** — `dotnet` with .NET 9+ (`DOTNET_ROLL_FORWARD=Major`) and `AssetStudioModCLI.dll` (default `/home/morph/ssassets/assetStudioMod/AssetStudioModCLI.dll`, override with `--cli` / `$ASSETSTUDIO_CLI`).
- **UnityPy** — `python3 -m pip install UnityPy` (used only by `scripts/extractAvg.py`, the story-character sprite stage).
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
bash scripts/dump.sh --game "$GAME" --skin "/path/to/ss-data/EN/bin/CharacterSkin.json"

# force re-extract even if cache says unchanged
bash scripts/dump.sh --game "$GAME" --force

# fully explicit (game + both datamine clones, everything)
bash scripts/dump.sh \
  --game "/home/morph/stella sora meter/Link to YostarGames/StellaSora_EN" \
  --data "/home/morph/stella sora meter/ss-data" \
  --datamine "/home/morph/stella sora meter/StellaSoraData Makostar" \
  --skin "/home/morph/stella sora meter/ss-data/EN/bin/CharacterSkin.json" \
  --all
```

`--data` auto-resolves the three name tables (`BoardNPC.json`, `CharacterSkin.json`, `Character.json`) from `EN/language/en_US` (default `../ss-data`, falling back to `--datamine`); you only need to pass them by hand when the datamine is elsewhere.

The script is additive: existing `chars/`/`data/` entries that vanished from the game stay visible (never deleted, only overwritten/appended).

`dump.sh` caches per-bundle `mtime`+`size` in `.dump_tmp/dump.cache.json` (like `bruteForceOthers.mjs`) per-stage (`live2d`/`bg`/`disc`/`offset`/`avg`). Unchanged bundles skip `dotnet` exports; modified/new bundles are re-extracted. Use `--force`/`-f` to ignore the cache, or delete `.dump_tmp/dump.cache.json`. Stale entries are pruned automatically. Manifest/regeneration steps still run every time even on cache hits so `data/*.json` stays consistent.

All staging into `chars/`/`bg/`/`avg/`/`events/`/`data/` is content-stable (`scripts/io.mjs` + equivalent guards in `normalize.py`): files whose bytes didn't change keep their mtime, so `aws s3 sync` re-uploads only real changes after a game update instead of everything the update touched.

---

## 3. What `dump.sh` does (and what it rebuilds)

Order matters — `data/models.json` is rebuilt after bg staging and again at the very end:

1. **Bundle discovery** — collects `char_l2d_*`, `char_avg_2d_avg1_*` / `char_avg_2d_avg3_10*` (and with `--all`, `npc_l2d_*` / `disc_l2d_*`) from `InstallResource` + `Persistent_Store`.
2. **Live2D export** (`-m live2d` + `-m export -t textAsset`) + `scripts/normalize.py` → `chars/<skinId>/<variant>/` (e.g. `10301/10301_l`, `_lf`, `_lt`); AVG bundles staged to `.dump_tmp/chars_avg` and merged only for ids no `char_l2d` produced (unreleased chars like `13701`). When a prefab holds several Cubism models (character + scene/props, e.g. `10303_l` = `10303_L_a` girl + `10303_L_b` cat/lantern), `normalize.py` nests one folder per model so their textures/motions don't collide; the manifest lists them as `variants[].models[]` back-to-front.
3. **Bg-layer composition** (`-m dump` gameobject/transform/rectTransform/sprite/spriteRenderer/sortingGroup/meshRenderer + `scripts/extractBgLayers.mjs` + `-m export -t texture2d`) → `.dump_tmp/bglayers/` + `.dump_tmp/bgtex/`; merged into `data/models.json` as `bgLayers` by `scripts/mergeBgLayers.mjs` and staged as `chars/<skinId>/<variant>/bg/*.png` by `scripts/copyBgTextures.mjs`. The `sortingGroup` type is required: each `----*----` group node's SortingGroup order (`----bg----` 0 < `----bg_effect----` 1 < model 2 < `----fg_effect----` 3) is the primary back-to-front key; `meshRenderer` supplies each nested model's Cubism draw-order (`variants[].models[].order`).
4. **Name tables** — `scripts/generateDiscId.mjs` → `data/discid.json` (from `Disc.json` + `Item.json`); `scripts/generateCharNames.mjs` → `data/characterid.json`.
5. **Manifest** — `scripts/generateManifest.mjs` → `data/models.json` (groups skins by first 3 digits, NPCs by first 4, reads `characterid.json`/`discid.json`/`charbg.json`/`offset.json`/`BoardNPC.json`/`CharacterSkin.json`). Re-run after bg staging so both `bg` singles and `bgLayers` survive.
6. **CharBg backdrops** (only with `--skin`) — `image-*.unity3d` `--filter-by-container CharBg` → `bg/charbg/*.png` + `scripts/generateCharBg.mjs` → `data/charbg.json`.
7. **Event art + Spine** — every `ui_activity*.unity3d` (+ `char_2dsp_*.unity3d`) → `scripts/extractEvents.mjs` (scene-graph `-f pathID` dumps + monoBehaviour/sprite/texture exports, `.dump_tmp/eventdump/`, cached in `.dump_tmp/events.cache.json`) → stages `events/<ref>/` (`body.png`, `spine/*.skel|*.atlas|*.png`) + fragments (`.dump_tmp/eventstage/<ref>.json`) → `scripts/extractEventScenes.mjs` reuses the same dumps to stage each character's full page composition (`events/<ref>/scene/*.png`, merged into the fragments; per-ref host-panel config in the script's `SCENES` table) → `scripts/generateEvents.mjs` rebuilds `data/events.json` + the models.json Events section (`kind:"event"`, link id `<ref>event`).
8. **Disc parallax cards** — every `disc_XXXX.unity3d` (+ `disc_common.unity3d` + `ui_big_sprites.unity3d`) → `.dump_tmp/discoverlays/` → `scripts/extractDiscParallax.mjs` → `data/discparallax.json` + `chars/<id>/<id>_p/overlays/*.png`; then `scripts/generateDiscs.mjs` rebuilds the Discs section (`kind:"parallax"` + `kind:"discl2d"`).
9. **Offsets** — `char_2d_*.unity3d` `Actor2DOffsetData` → `.dump_tmp/offsets/` → `scripts/generateOffset.mjs` → `data/offset.json` (MainView panel 10 Set 2: `{s,x,y}`).
10. **Story character sprites (AVG)** — every `char_avg_2d_avg*.unity3d` (`avg1/2/3/4`, Persistent_Store copy preferred) → `scripts/extractAvg.py` (UnityPy: mesh-cropped sprite PNGs + mesh bbox centres + `Actor2DOffsetData` Set 2) → `.dump_tmp/avg/` + `.dump_tmp/avgmeta/` → `scripts/generateAvg.mjs` stages PNGs to `avg/<id>/` and writes `data/avg.json` (names from `--avg-names`, default `Lua/Game/UI/Avg/_en/Preset/AvgCharacter.lua`). See `docs/AgentsReadme.md` → "Story characters".
11. **Final manifest rebuild** — `generateManifest.mjs` + `generateDiscs.mjs` + `generateEvents.mjs` + `mergeBgLayers.mjs` run one last time so charbg/disc/event/offset data from the same update lands in `data/models.json` immediately (the earlier passes only see the previous run's tables).
12. **Version stamping** — `scripts/stampVersions.mjs` records `added`/`updated` on every `data/models.json` / `data/avg.json` entry (see below), then refreshes `data/entryhash.json`. Always the last step.

### Version stamping (`added` / `updated`)

The viewer badges entries added in the latest game version and offers a
**New** filter (see `docs/AgentsReadme.md` → "New / updated badges"). Data:

- `data/models.json` / `data/avg.json` entries carry `added` and `updated`
  (game version strings, e.g. `1.16.0`). Entries that predate stamping have
  neither until they change (then only `updated`). `models.json` **variants**
  carry their own `added`/`updated` too, so a new skin variant on an existing
  character badges both the variant and the character row as NEW; entries that
  were only edited get no badge and are not shown by the New filter.
- `data/entryhash.json` — `{version, models: {id: {hash, variants: {name:
  sha1}}}, avg: {id: sha1}}`; the per-variant hashes drive variant-level
  change detection (a v1 flat record migrates silently).

The version comes from the game install's **`prefs.dat`**
(`LOCAL_GAME_VERSION:1.16.0`; `game-launcher-config.json`/`manifest.json` only
hold the launcher version `1.13.0`). `--version` overrides it.

`stampVersions.mjs` marks an entry **updated** when either its manifest JSON
changed (deep-diff against the pre-dump snapshot `.dump_tmp/models.prev.json`
/ `.dump_tmp/avg.prev.json`, taken by `dump.sh` before rebuilding) or its
staged files' hash differs from `data/entryhash.json`. Variants are stamped the
same way against their own dirs, so a newly added skin variant gets
`added = updated`, while the character entry gets `updated`. New ids get
`added = updated = version`. A missing hash is seeded silently, so the first
run never mass-flags everything, and existing stamps are stripped from the
input first so re-runs are authoritative (idempotent). If the pre-dump
snapshot is incomplete (interrupted/stale build) but `data/entryhash.json`
already has a record for the id, the entry counts as pre-existing: no `added`
is written, and only changed files bump `updated` (this is what stops a stale
snapshot from marking every disc L2D as NEW). `bruteForceOthers.mjs`
stamps new Others the same way.

### What each `data/*.json` is for

| file | generator | contents |
|------|-----------|----------|
| `data/models.json` | `generateManifest.mjs` + `mergeBgLayers.mjs` + `generateDiscs.mjs` | site manifest: Trekkers / Events / Disc L2D / Discs / Others, per-variant `path`/`label`/`bg`/`bgLayers`/`charBg`/`offset` |
| `data/characterid.json` | `generateCharNames.mjs` (`Character.json`) | charId(3) → display name |
| `data/discid.json` | `generateDiscId.mjs` (`Disc.json` + `Item.json`) | discId(4) → title (last-4-digit mapping) |
| `data/charbg.json` | `generateCharBg.mjs` (`CharacterSkin.json`) | skinId → CharBg basename |
| `data/discparallax.json` | `extractDiscParallax.mjs` | per-disc `{canvasW/H, mask, parallax{ax,ay}, layers[]}` |
| `data/offset.json` | `generateOffset.mjs` (`Actor2DOffsetData`) | skinId → MainView Set 2 `{s,x,y}` |
| `data/events.json` | `extractEvents.mjs` + `extractEventScenes.mjs` + `generateEvents.mjs` (`ui_activity*` + `char_2dsp_*`) | event entries: `{name, static:{bodies[], faces[], scene?}, spines[{name, skel, atlas, textures[], scene?}]}`; a scene is `{w,h,behind[],front[],char{,chars[]}}` (slots carry `px/py` when `charOrigin`); art PNGs in `events/<ref>/`, page layers in `events/<ref>/scene/` |
| `data/avg.json` | `extractAvg.py` + `generateAvg.mjs` (`char_avg_2d_avg*` + `AvgCharacter.lua`) | story-character sprite entries: `{id, shortId, name, poses[{letter, body, black, faces[{file,x,y}], offset}]}`; sprite PNGs in `avg/<id>/` |
| `data/entryhash.json` | `stampVersions.mjs` | entryId → sha1 of the entry's staged files, for version stamping |

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
# open http://localhost:8000 — Trekkers / Story Characters / Discs / Disc L2D / Events counts at top
# open a Default variant with CharBg (dark bar should fill screen, character offset down)
# open a Memory Snapshot (bgLayers composite) and a parallax disc (drag → tilt, Enable Mask/Max Rotation toggles)
# open a Story Character: body renders; right panel → click expression thumbnails (face composites on the
#   face area), switch Pose letters, toggle Dark Silhouette on entries with a `_001x`
# click "New" next to the search box → only the latest version's additions (NEW)

# avg manifest sanity
jq 'length' data/avg.json
jq '[.[] | .name == .id] | map(select(.)) | length' data/avg.json   # unnamed entries (should be 0)

# version stamps: the new version's additions/edits (badges + New filter)
jq -r '[.[] | select(.added=="<version>") | .id] | length' data/models.json
jq -r '[.[] | select(.updated=="<version>") | .id]' data/models.json
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

`.dump_tmp/` and the caches (`.dump_tmp/dump.cache.json`, `.dump_tmp/brute_others.cache.json`, `.dump_tmp/events.cache.json`) are gitignored and not committed. `avg/` (story-character sprite PNGs) is gitignored like `chars/` — only `data/avg.json` is committed; host the PNGs from the same remote asset store as `chars/`/`bg/` when using the split hosting (`js/config.js` already redirects `avg/` paths). Same for `events/` (only `data/events.json` is committed).

---

## 7. Troubleshooting

- `InstallResource not found` → `--game` points at the wrong dir; it must contain `StellaSora_Data/StreamingAssets/InstallResource`.
- `normalize FAILED` or `0 models` for an AVG skin → expected for sprite-only AVG bundles; only `char_avg_2d_avg1_*` with a `CubismMoc` produce output (see `docs/AgentsReadme.md` → AVG bundles).
- `bgLayers` empty after hand-running `generateManifest.mjs` → normal: the manifest drops `bgLayers`; re-run `node scripts/mergeBgLayers.mjs --models data/models.json --layers .dump_tmp/bglayers` or just re-run `dump.sh`.
- Motion clips `SyntaxError: unexpected character` → UTF-8 BOM not stripped; `scripts/normalize.py` handles this; don't dump motions by hand without stripping the first 3 bytes.
- `discparallax.json` missing a disc → ensure both `InstallResource/disc_XXXX.unity3d` and `Persistent_Store/disc_XXXX.unity3d` were dumped; the script prefers the `Persistent_Store` copy when both exist.
- `avg.json` entries missing / faces misaligned → the mesh-centre extraction needs the bundle's type trees; re-run `python3 scripts/extractAvg.py --bundle <bundle> --out <dir> --meta <json>` on the failing bundle (needs `pip install UnityPy`). Misaligned faces after a game update usually mean the exporter changed sprite naming (`<id>_<pose>_<num>[x].png`); check `parseSpriteName` in `generateAvg.mjs`.
- Story Character thumbnails 404 → `avg/<id>/` not staged; re-run `node scripts/generateAvg.mjs --meta .dump_tmp/avgmeta --staging .dump_tmp/avg --avg avg --names <AvgCharacter.lua> --out data/avg.json`.
- Event entries list but render nothing → the new `events/<ref>/` files were never synced to the asset host (`aws s3 sync events s3://stella-assets/events ${EP:+--endpoint-url "$EP"}`); old events keep working while only the newly dumped ones 404. The viewer revalidates `data/*.json` (`cache: 'no-cache'`), so a stale manifest is no longer a cause — hard-reload first, then check the asset sync.
