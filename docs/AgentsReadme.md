# Stella Sora · Live2D Viewer

A static Live2D model viewer for the game **Stella Sora** (Yostar / Nebula). No
build step, no framework — plain HTML + a vendored Live2D engine, styled after
the Nebula Record Builder.

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
bg/charbg/                  # per-character main-menu backdrops (Image/CharBg)
data/
  models.json               # manifest: characters + events + discs (generated)
  characterid.json          # charId(3) -> display name
  discid.json               # discId(4) -> display name (generated from datamine)
  charbg.json               # skinId -> CharBg image basename (generated)
scripts/
  dump.sh                   # extraction pipeline
  normalize.py              # AssetStudio output -> chars/ layout
  generateManifest.mjs      # scans chars/ -> data/models.json
  generateCharBg.mjs        # datamine CharacterSkin.Bg -> data/charbg.json
  extractDiscParallax.mjs   # disc parallax scenes -> data/discparallax.json
  generateDiscs.mjs         # rebuild the Discs section (parallax + l2d)
  generateDiscId.mjs        # rebuild discid.json from Disc.json + Item.json
```

## Main-menu backdrops (CharBg)

Each character skin has a main-menu background the game draws behind the L2D
(`CharacterSkin.Bg` -> `Image/CharBg/<name>.png`, applied to the
`customized_bg` SpriteRenderer by `Actor2DManager.SetActor2D` in panels with
`PreferActorBg`, e.g. MainView). The viewer reproduces it:

- the PNGs live in `bg/charbg/` and are extracted from the game's
  `image-*.unity3d` bundles;
- `data/charbg.json` maps `skinId -> basename`, generated from the datamine
  `CharacterSkin.json` by `scripts/generateCharBg.mjs`;
- `generateManifest.mjs` stamps each **Default** variant with a `charBg`
  field only (the game draws the main-menu backdrop behind the Default L2D
  alone; Awakened / Memory Snapshot / Talent variants get no backdrop — Memory
  Snapshot ships its own `----bg----` scene, Talent has its own panel backdrop,
  and Awakened shows the character with its own composed effect layers);
- `main.js` renders it as a full-frame layer in the **same world space as the
  L2D** (like the game's `customized_bg` SpriteRenderer inside the off-screen
  rig), so it keeps the model's relative size/position and pans/zooms with it.
  It's listed as "Main-menu BG" in the Background picker.
- For these variants the viewer reproduces the game's framing: the off-screen
  rig camera is ortho `CURRENT_CANVAS_FULL_RECT(2160x1080)/PPU 100` = a
  `21.6 x 10.8` world-unit view, and `customized_bg` (24x17 world units) fills
  it edge-to-edge. `fitModelToScreen()` therefore scales charBg variants to
  that camera view (instead of fitting the character to the screen), so the
  backdrop fills the screen.
- The character itself is then placed with the skin's **MainView offset**
  (`Actor2DOffsetData` panel 10 Set 2, extracted from the `char_2d_*.unity3d`
  bundles into `data/offset.json`): a downward shift (~-4..-5.7 world units)
  + slight scale that frames the half-body view with the head in frame. The
  backdrop stays put at the canvas center while the L2D moves under it, exactly
  like the game parents the L2D under `actor_offset` inside the rig.

`dump.sh --skin <CharacterSkin.json>` re-extracts the images and rebuilds
`data/charbg.json` + `data/models.json` on game updates.

> **RectTransform:** the bg scene-graph dump must include `rectTransform`
> alongside `transform` (`-t gameobject,transform,rectTransform,sprite,
> spriteRenderer`). `RectTransform` is a distinct Unity class, and some
> bundles' `----bg----` compositions hang off a RectTransform root (e.g.
> Donna's dual-model Memory Snapshot), so the composition extractor silently
> drops those layers without it.

> **Note:** `data/models.json` is the product of the **full** pipeline —
> `generateManifest.mjs`, then `mergeBgLayers.mjs` (adds the in-model
> `bgLayers`), then `copyBgTextures.mjs`, then a second `generateManifest` +
> `mergeBgLayers` pass. Running `generateManifest.mjs` on its own (e.g. to
> re-stamp `charBg` after a manual edit) **drops the `bgLayers` field**, which
> breaks the composite `----bg----` backgrounds. Re-run `mergeBgLayers.mjs`
> afterwards, or just re-run `dump.sh`.

> **Foreground layers:** a composed `bgLayers` entry is treated as foreground
> (drawn in front of the character) only when its Unity `sortingOrder >= 1`
> (the L2D renders at sorting order 1 — `Actor2DManager` sets
> `CubismRenderController.SortingOrder = 1`). The `----fg_effect----` /
> `----bg_effect----` group names do **not** decide front/behind on their own:
> many `fg_effect` objects sit at negative sorting orders and render *behind*
> the character in-game (e.g. Shia's Memory Snapshot rocks at order -100..-200).
> `mergeBgLayers.mjs` therefore sets each layer's `fg` from `sortOrder >= 1`.

## Disc L2D entries (large Live2Ds for the gacha) / Disc entries (parallax)

The gacha discs that have a Live2D (`disc_l2d_4XXX`: `4004` `Wisteria Dream`,
`4057` `Ride the Waves With Me` (Karin surf, `Persistent_Store` `disc_4057`/
`disc_l2d_4057`), etc) were previously all under Discs. They are now surfaced
as a dedicated **Disc L2D** section above the card parallax (both still `kind:
"discl2d"` / `kind: "parallax"`), so the full-screen models are not buried
behind 100+ card entries. Example: `4057 Ride the Waves With Me` (Karin, beach
+ seagulls + watersplash `bgLayers`) lives under Disc L2D, while `4057`/`4058`
`Summer March` cards live under Discs with their parallax overlays
(`disc_4057`/`disc_4058` from `Persistent_Store`, now also dumped — previously
only `InstallResource` discs were extracted, so `4057`/`4058` were missing).

`dump.sh` builds Disc L2D + Discs via `generateDiscs.mjs`: one parallax entry
per disc (`discparallax.json` → `Persistent_Store` + `InstallResource`
`disc_XXXX.unity3d` dumped, `extractDiscParallax.mjs` staged to
`chars/<id>/<id>_p/overlays/`) and one `[title] l2d` per disc that has a Live2D
(reusing the L2D variant data). Disc names resolve through `discid.json`
(rebuilt by `generateDiscId.mjs` from `Disc.json` + `Item.<fullId>.1` mapped by
last 4 digits — needed for new discs like `4057`/`4058` `Summer March`).

## Events entries (true event-page Live2Ds - not disc gacha)

Separate from Disc/Disc L2D, some events show a full-screen Live2D directly on
the event page itself (e.g. *Surfing Splash: A Sparkling Holiday Adventure!*
Karin on `SummerAdvPanel:508` / `ActivityGroup 10110`). These are **not**
`disc_l2d` models — the event Live2Ds live elsewhere (e.g. `char_2d`/
`char_2dsp` spine or a dedicated `ui_activity` prefab) and have not been
located yet. Currently Events is empty (placeholder).

## Disc entries (parallax scenes)

The game renders the disc card with `Disc_OffScreen_Renderer.prefab`: a
perspective camera (FOV 60) shooting the card prefab, whose `Canvas` sits at
PlaneDistance 100 (`Screen Space - Camera`, `CanvasScaler` ref 1080x1080).  The
prefab has two halves — the `<id>_M` main art (SpriteRenderers) and the
`<id>_G` gyroscope overlay (a UI canvas).  The opaque overlay backdrop fully
covers the main art in the rendered result, so the visible parallax scene is
exactly the overlay group: the card backdrop + sparkle/glow layers + the title,
clipped to a `Mask` window.  Every trio of overlay content (the window itself,
the border `frame`, the `title`) carries a `GyroscopeFollower` (type `rotate`)
with `(fFactorAX, fFactorAY)` — the **entire card rotates rigidly** by
`EulerAX = fFactorAX*ty/100°` about X and `EulerAY = fFactorAY*tx/100°` about Y,
where `tx, ty` are the `Gyroscope/Target` coordinates (see below).  The
inner art groups have `steady` (type 2) followers and are parented under the
rotating window, so they inherit the same rotation.  Layers also sit at real
depths (`RectTransform` `z` chain): a layer with `z = 2500` canvas px is
`2500/9.3528 ≈ 267` world units behind the canvas plane, so the camera shrinks
it by `100/(100+z)` at rest — that **rest-state perspective is the card's
zoom**.  Deeper layers therefore look smaller and slide less under tilt, giving
the differential parallax.  The `<id>_B` full-card image is *not* part of the
scene — it is only the thumbnail/collection image.  The shared
`disc_common.unity3d` bundle holds `Common.prefab` (5/-25°) for the fallback
`_B`-only discs (1xxx/2xxx/3xxx); discs with their own `Common`/`Card` prefab
use their own factors (usually 5/-20, some -10°, -15°, …).

`LiveDiscCtrl.lua` drives the target: on desktop it accumulates raw
`PointerEventData.delta` onto `Gyroscope/Target.localPosition` (clamped to
`[-100,+100]` canvas px) and snaps it back to `0` on release; while idle it
tweens the target between `(-8,0)` and `(8,0)` (8 s yoyo, `InOutSine`).

The parallax layers live in the plain **`disc_XXXX.unity3d` bundles** (all
discs, 1xxx/2xxx/3xxx/4xxx), separate from the Live2D bundles.  `dump.sh`
extracts them:

- for every `disc_XXXX` bundle it dumps the scene graph
  (`gameobject,transform,rectTransform,spriteRenderer`), the `sprite` assets
  (dumped separately — the combined dump drops the generically-named pieces),
  all `monoBehaviour` components (Image, GyroscopeFollower, Mask,
  AvgL2DUseGyroscope), the `texture2d` pathID dump, and the `texture2d` PNG
  export under `.dump_tmp/discoverlays/`; it also dumps the shared
  `disc_common.unity3d` behaviours (`GyroscopeFollower`/`AvgL2DUseGyroscope`)
  and scene graph (the `Common.prefab` icon/frame rects) for the fallback
  `_B` discs, plus `ui_big_sprites.unity3d` (the rarity frames);
- `extractDiscParallax.mjs` walks each bundle, resolves every overlay `Image`
  through `Sprite -> Texture2D` to its exported PNG, stages the PNGs into
  `chars/<id>/<id>_p/overlays/`, and writes the layout in 1080x1080 canvas
  pixels (anchored position, `sizeDelta`×`localScale` size, `clip` flag, and
  `z` — the RectTransform z-chain in canvas px) to `data/discparallax.json`.
  Draw order is copied verbatim from Unity's hierarchy (painter's algorithm),
  not re-sorted by z.  Discs with no overlay scene (1xxx/2xxx/3xxx) fall back
  to the game's own fallback path (LiveDiscCtrl.SetRawImage ->
  Disc/Common/Common.prefab): the `<id>_B` art as `layer_-1/icon`
  (1700×1700 rect at 0.43 scale = 731×731 canvas px) with the rarity-coloured
  frame `layer_-1/frame` on top (752×770, y −1).  The frame png is the shared
  `UI/big_sprites/rare_outfit_<R>.png` (BaseCtrl.SetSprite_FrameColor +
  AllEnum.FrameColor_New: R 3-star → 3, SR 4-star → 4, SSR → 5); disc ids
  1xxx/2xxx are 3-star and 3xxx are 4-star, so the extractor stages
  `chars/common/rare_outfit_3.png` / `rare_outfit_4.png` and emits one frame
  layer per fallback disc.  Both fallback layers inherit the shared
  `disc_common` gyroscope factors.  Each layer keeps its natural rect size at
  the canvas plane; the viewer multiplies it by `100/(100+z)` like the game's
  offscreen camera, which brings e.g. the 5× backdrop (`w ≈ 5380`) down to
  `≈1465` apparent — the screen-correct zoom;
- `generateDiscs.mjs` rebuilds the Discs section of `data/models.json`: one
  parallax entry per disc (from `discparallax.json`) + one `[title] l2d` entry
  per disc that has a Live2D (reusing the L2D variant data already produced by
  the Live2D pipeline).

Each parallax scene:

```
{ canvasW, canvasH, mask: {w,h,x,y} | null, parallax: {ax, ay, ...} | null, layers: [...] }
```

- `canvasW`/`canvasH` — the 1080x1080 logical canvas the prefab is laid out on
- `mask` — the overlay Mask window (square, centred); the viewer fits the full
  1080 canvas to the screen so the screen edge clips the spill-over like the
  game's Mask
- `parallax` — the gyroscope factors: the card rotates by `EulerAY = ay*tx/100°`
  yaw + `EulerAX = ax*ty/100°` pitch (tex/target 0..100; `null` means static)
- each layer: `{ file, path, x, y, w, h, clip, z, depth }` — x/y offset from
  the canvas centre in canvas pixels, w/h authored rect stretched to fit, `clip`
  true when under the Mask, `z` the canvas-px depth (world `z = z/9.3528`).
  Layers with an `ImageWarp` component (the game's fake-perspective floors and
  pillars, e.g. disc 4012) additionally carry `corners: [BL, TL, TR, BR]` and
  optional static `rx/ry/rz`; for those, x/y is the rect **pivot** (not centre)
  and `z` is the **pivot's** depth — the game's warp mesh is pivot-anchored in
  all three axes, and using the centre's depth shifted rotated off-centre
  layers (4012's tilted pillars) dozens of px too deep, breaking their alignment
  with the floor.  The corners are rebuilt the way the game does at runtime
  (`ImageWarp.OnPopulateMesh` → `WarpManager.PopulateMesh`): live rect corners
  plus the component's `m_cornerOffset*` — the serialized
  `m_warpManager.m_cornerPosition*` in the bundle is stale editor data and must
  not be used (disc 4021's `bg2` backdrop and 4012's pillars were resized after
  warping).  Layers with a `UIAdditiveEffect` component carry
  `blend: "add"` — the game swaps their material to the
  "UI Extensions/UIAdditive" shader (additive blending), so their texture's
  black areas must contribute nothing; alpha-blending them (the old default)
  painted e.g. disc 4038's sun-glare `gyro_4038_Light` as a solid black sheet
  over the scene.  The viewer renders these with Pixi's `add` blend mode.

The viewer (`js/main.js`) renders a parallax scene in its own container,
fitted to the full 1080 canvas.  It projects every vertex through the real
perspective pipeline — `y-up` world rotate `R_y(ay*tx/100°)` then `R_x(ax*ty/100°)`
at that layer's `z/9.3528` depth, then `D/(D+z)` — reproducing exactly the game's
rest-state zoom and the subtle differential parallax.  Consecutive layers sharing
`clip` form runs, each with its own Graphics stencil so the tilted Mask window
clips them together; runs are drawn in game order (frame then masked content
then title).  The viewer accumulates raw pointer deltas like
`LiveDiscCtrl:OnUIDrag_Drag` (clamped to `[-100,+100]`), inverted in Y for the
screen-vs-Unity delta convention — so **drag right brings the right edge away**,
the opposite of the previous viewer — and snaps back on release; an idle
`8..-8 cos(πt/8s)` sway matches the game's tweener pause/resume.

Two shared disc options (persisted in `localStorage` key `ssDiscOptions`, so
they apply to every disc and survive reloads) live in the right sidebar:

- **Enable Max Rotation** — the game clamps Gyroscope/Target to `[-100,+100]`;
  turning this off removes the clamp so the drag rotates the card without
  limit (re-enabling re-clamps the accumulated target back into range).
- **Enable Mask** — turns the Mask window stencil off so all layers overflow
  the card frame freely (the scene re-renders without any clip run).

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

### Unreleased characters (char_avg_2d AVG bundles)

Characters that have no `char_l2d_<id>.unity3d` bundle yet ship their Live2D
inside the story-mode actor bundles instead:

```
Persistent_Store/AssetBundles/char_avg_2d_avg1_<charId>.unity3d
```

These hold a complete Cubism prefab (`CubismMoc` + MeshRenderers + Unity
AnimationClips) that AssetStudioModCLI `-m live2d` exports fine — motions
included. Notes:

- only the **Persistent_Store** copy carries the model data; the
  InstallResource copies are stripped and export nothing;
- numbered models carry their skin id in the name (`avg1_137` ->
  `13701_L` -> groups under charId `137`);
- pre-release characters have codename models instead (`jiguang`,
  `qingye`); these are filed under the character id from the bundle name
  (`avg1_106` -> `106`) and show an "Unknown" variant label until the game
  assigns real ids;
- `<name>_CG` rigs and other avg series (`avg3_*` story NPCs like
  `avg3_100_a`, all `avg2_*`/`avg4_*`) are skipped;
- most released characters also appear in avg bundles with duplicate `_l`
  /`_lf` models, but **poorer** copies of what `char_l2d_*` already
  provides. `dump.sh` therefore normalizes avg bundles into a separate
  staging dir and merges only the character ids that no `char_l2d` bundle
  produced ("avg new character merged" in the log);
- avg bundles are excluded from the bg-layer composition pass (plain model
  prefabs, no `----bg----` scene layers).

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
    - `l2d/`           -> `<id>_l`   (Discs/Events, 4-digit ids)
    Shared `textures/` and `motions/` subfolders are merged across dual models
    instead of overwritten (the manifest only loads the primary `_a` model).
 4. **`generateCharNames.mjs`** rebuilds `data/characterid.json` (charId -> name)
    from the datamine `EN/language/en_US/Character.json` (`--char-names`); ids
    missing there keep their existing name.
 5. **`generateDiscId.mjs`** rebuilds `data/discid.json` from
    `StellaSoraData/EN/bin/Disc.json` + `language/en_US/Item.json` (name key
    `Item.<fullId>.1`, mapped by the last 4 digits). Run before the manifest
    so new discs like `4057`/`4058` resolve to *Ride the Waves With Me* /
    *Summer March*.
 6. **`generateManifest.mjs`** scans `chars/` and builds `data/models.json`,
    grouping skins by character (first 3 digits), labelling variants, and
    appending discs (4-digit ids) as a separate section using `data/discid.json`
    names. NPC skins use 6-digit ids and are grouped by their first 4 digits
    (grouping by 3 would merge distinct NPCs like `813301`/`813401`); their
    names fall back to the datamine `EN/language/en_US/BoardNPC.json`
    (`--board-npc`), which characterid.json doesn't cover. Extra skin variants
    that don't match Default/Awakened/Talent/Memory Snapshot are labelled from
    `EN/language/en_US/CharacterSkin.json` (`--skin-names`, e.g. `14403` ->
    "When Morning Glories Bloom, Her Eyes Open") instead of "Unknown".
 7. **`generateDiscs.mjs`** rebuilds the Discs side: one parallax entry per disc
     (`discparallax.json` → `Persistent_Store` + `InstallResource`
     `disc_XXXX.unity3d` dumped) and one `[title] l2d` per disc that has a
     Live2D (`kind: "discl2d"` under **Disc L2D** above Discs, e.g. `4057 Ride
     the Waves With Me`).

   The three name tables (`--board-npc`, `--skin-names`, `--char-names`)
   auto-resolve from the datamine next to this repo
   (`../StellaSoraData Makostar/EN/language/en_US`, override the root with
   `--datamine DIR`) — no need to pass them by hand; explicit flags still win.
   Only `--skin` stays manual: it additionally re-extracts CharBg images from
   the game's image bundles.

### Deploying the models

```bash
git lfs track "chars/**"
git add chars/ .gitattributes data/models.json
git commit
```

## Vendored engine

`js/cubism.es.js` is `untitled-pixi-live2d-engine` v1.3.5 with the
render-order null-safety patch applied. `js/pixi.min.mjs` is PixiJS v8.19.
