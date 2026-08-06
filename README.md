# Stella Sora · Live2D Viewer

A static Live2D model viewer for the game **Stella Sora** (Yostar / Nebula). No
build step, no framework — plain HTML + a vendored Live2D engine, styled after
the Nebula Record Builder.

## Live site

Open `index.html` in a browser. Because the Live2D models are fetched at
runtime, it must be served over HTTP (not `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

Pick a character in the **Trekkers** panel (left side), choose a variant
(Default / Memory Snapshot / Talent / Awakened), drag to pan, scroll or pinch
to zoom. Use the toolbar to change the background, reset the view, or export a
screenshot. The **Options** panel (right side) exposes per-model controls:
motions (group + Start/Stop), expressions, head/body angle sliders, an
eye-blink toggle, and a full parameter list with per-parameter overrides.

## Layout

```
index.html                  # the viewer page (Nebula dark-monospace style)
js/
  live2dcubismcore.min.js   # Live2D Cubism Core 6.x runtime (proprietary, from Live2D SDK)
  pixi.min.mjs              # PixiJS v8 (vendored)
  cubism.es.js              # untitled-pixi-live2d-engine (vendored + render-order patch)
  main.js                   # viewer app
chars/<skinId>/<variant>/   # extracted Live2D models (gitignored, ~1.1GB full-res)
data/
  models.json               # manifest: characters + discs (generated)
  characterid.json          # charId(3) -> display name
  discid.json               # discId(4) -> display name (generated from datamine)
scripts/
  dump.sh                   # extraction pipeline
  normalize.py              # AssetStudio output -> chars/ layout
  downscale.py              # cap textures at 1024x1024
  generateManifest.mjs      # scans chars/ -> data/models.json
```

## Updating models when the game updates

The game ships Live2D models as Unity `.unity3d` asset bundles:

```
<game>/StellaSora_Data/StreamingAssets/InstallResource/char_l2d_*.unity3d
```

After a game update, point the pipeline at the game dir and re-run:

```bash
bash scripts/dump.sh --game "/path/to/StellaSora_EN"
```

This runs for every `char_l2d_*` bundle (add `--all` for `npc_l2d_*` and
`disc_l2d_*`), then re-generates `data/models.json`. The dump ends with a
summary of how to copy the freshly extracted models into `chars/`.
Textures are kept at original 2048x2048 resolution.

### Motion files and the UTF-8 BOM

Unity textAssets are exported with a UTF-8 BOM (`EF BB BF`) prefix, which makes
browser `JSON.parse` fail on every motion clip (`SyntaxError: unexpected
character at line 1 column 1`). `normalize.py` strips the BOM from every json
file it writes; if you ever dump manually, strip the first 3 bytes of all
`.motion3.json` files too.

### How it works

1. **`AssetStudioModCLI -m live2d`** decompresses each `.unity3d` bundle and
   exports complete Cubism models (`.moc3`, `.model3.json`, textures,
   `.physics3.json`, motions). AssetStudioModCLI lives at
   `/home/morph/ssassets/assetStudioMod/AssetStudioModCLI.dll` (`.NET 9`,
   uses `DOTNET_ROLL_FORWARD=Major`).
2. **`AssetStudioModCLI -m export -t textAsset`** additionally dumps the raw
   motion clips. Newer bundles ship default/talent motions in a sibling
   `mtn/` folder that the Live2D exporter doesn't wire up; `normalize.py`
   re-attaches them to the `model3.json`.
3. **`normalize.py`** maps the export tree to the site layout:
   - `live2d/`        -> `<id>_l`   (Default)
   - `live2d_full/`   -> `<id>_lf`  (Memory Snapshot; `_a`/`_b` dual models share the folder)
   - `live2d_talent/` -> `<id>_lt`  (Talent)
   - `l2d/`           -> `<id>_l`   (Discs, 4-digit ids)
   Shared `textures/` and `motions/` subfolders are merged across dual models
   instead of overwritten (the manifest only loads the primary `_a` model).
4. **`generateManifest.mjs`** scans `chars/` and builds `data/models.json`,
   grouping skins by character (first 3 digits), labelling variants, and
   appending discs (4-digit ids) as a separate section using `data/discid.json`
   names. Rebuild `data/discid.json` from the game datamine with:
   `StellaSoraData/EN/bin/Disc.json` + `language/en_US/Item.json` (name key
   `Item.<fullId>.1`, mapped by the last 4 digits).

### WebGL context loss on heavy models

The biggest Memory Snapshot models (e.g. `16001_F_a`, a 3MB moc3 with three
2048² textures) can push the Cubism Core's default 16MB work buffer and
lower-end GPUs over their texture memory limit, dropping the WebGL context.
Mitigations in place:
- `main.js` calls `configureCubismSDK({ memorySizeMB: 64 })` to raise the Core
  work buffer;
- the viewer re-creates the current model automatically after a context
  restore as a safety net;
- `scripts/downscale.py` still exists if a host/GPU can't handle the full-res
  textures and you want to cap them at 1024x1024 (~4x less GPU memory).

### Deploying the models

`chars/` is gitignored because it's ~1.1GB. To publish the viewer with models
(like the old tyrant-viewer did), track `chars/` with **git-lfs**:

```bash
git lfs track "chars/**"
git add chars/ .gitattributes data/models.json
git commit
```

## Vendored engine

`js/cubism.es.js` is `untitled-pixi-live2d-engine` v1.3.5 with the
render-order null-safety patch applied (same patch tyrant-viewer applied to
v1.0.2). `js/pixi.min.mjs` is PixiJS v8.19. To rebuild the vendor bundle from
npm:

```bash
npm install                       # fetches pixi.js + untitled-pixi-live2d-engine
cp node_modules/pixi.js/dist/pixi.min.mjs        js/pixi.min.mjs
cp node_modules/untitled-pixi-live2d-engine/dist/cubism.es.js js/cubism.es.js
# re-apply the render-order patch, then delete node_modules
```

The Cubism Core (`live2dcubismcore.min.js`) is the proprietary Live2D Cubism
SDK runtime and is redistributed under Live2D's license terms.

## Credits

- Game assets © Yostar / Stella Sora
- Live2D Cubism SDK © Live2D Inc.
- Engine: [untitled-pixi-live2d-engine](https://github.com/Untitled-Story/untitled-pixi-live2d-engine) © Untitled-Story
- Extraction tooling: AssetStudioMod CLI
- Reference viewers: [srpg-kr.github.io](https://github.com/srpg-kr/srpg-kr.github.io), [tyrant-viewer](https://github.com/usamora/tyrant-viewer)
