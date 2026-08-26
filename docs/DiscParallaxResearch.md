# Stella Sora — How disc card parallax works

Investigation notes covering: where disc card assets live, how the `<id>Card.prefab` is structured, how the gyroscope rotates the card, how `Disc_OffScreen_Renderer` projects it, and how the viewer replicates it. Complements the summary in `AgentsReadme.md` → "Disc entries".

Sources: decompiled `GameAssembly.dll` (`dll/Stella-Sora-Combat-Logger/decompilation/decompiled.c`), Lua UI in `StellaSoraData Makostar/_Lua/Game/UI/Disc/LiveDiscCtrl.lua`, asset bundles under `Link to YostarGames/StellaSora_EN/{StellaSora_Data/StreamingAssets/InstallResource,Persistent_Store/AssetBundles}`, and the datamine at `StellaSoraData Makostar`.

---

## 1. Where discs live

### Bundles

- **Card art / parallax scene:** plain `disc_XXXX.unity3d` (one per disc, `XXXX` 1xxx–4xxx) in `StellaSora_Data/StreamingAssets/InstallResource` — also mirrored in `Persistent_Store/AssetBundles`. Contains the `<id>Card.prefab` (and `<id>_B` thumbnail sprite), the `<id>_M` SpriteRenderers, and the `<id>_G` UI canvas with `Image`/`Mask`/`GyroscopeFollower`.
- **Disc Live2D (optional):** `disc_l2d_XXXX.unity3d` — a normal Cubism bundle, extracted by the same Live2D step as `char_l2d_*`. Only ~22 of the 96 discs have one.
- **Shared card frame / fallback card:** `disc_common.unity3d` in `Persistent_Store` — `Common.prefab` and the `frame.png` border sprite. The frame sprite is name-collided out of per-disc sprite dumps, so `scripts/dump.sh:324` re-exports it once from `disc_common`.

The live site shows **one** parallax entry per disc and, when a Live2D exists, a second `[title] l2d` entry. Discs 1xxx–3xxx have no `Card` overlay scene and fall back to the single `<id>_B` image.

### Off-screen renderer

`UI/Disc/Disc_OffScreen_Renderer.prefab` (`StellaSoraData Makostar/_Lua/Game/UI/Disc/LiveDiscCtrl.lua:52`):

```
Disc_OffScreen_Renderer
  ----Renderer----/OffScreen2DCamera  (Camera, FOV 60, near 0.1 far 2000)
  ----Renderer----/Canvas              (Canvas renderMode=1 ScreenSpaceCamera,
                                       camera=OffScreen2DCamera, planeDistance=100,
                                       CanvasScaler ref 1080×1080)
                 discRoot ← <id>Card.prefab instantiated here
  rImgDisc (RawImage) ← camera.targetTexture
```

Relevant dumps (from `ui_disc.en.unity3d`): `Camera @2057424196105403687.txt:19`, `Canvas @3778704391113987227.txt:2`, `CanvasScaler @-2225720952503350124.txt:3`. The viewer creates the same rig in `js/main.js:1503` with `PARALLAX_PX_PER_WORLD = 1080 / (2·100·tan30°) = 9.3528` canvas px per world unit and `PARALLAX_PLANE_DIST = 100`.

---

## 2. The Card prefab structure

Per-disc dump under `.dump_tmp/discoverlays/dump/disc_XXXX` (e.g. `disc_4001`) shows two roots:

```
4001_M  (SpriteRenderers — main art, not used; the opaque overlay covers it)
4001_G  (RectTransform, the gyroscope canvas)
  ├─ mask          (RectTransform 712×712, Mask, GyroscopeFollower type rotate AX=5 AY=-25)
  │   ├─ layer_0   (type steady) → bg (1076×764, localScale 5, z=2500)
  │   ├─ layer_4   (steady) → 9/8/7/6/4
  │   ├─ layer_3   (steady) → 5/2a/3
  │   ├─ layer_2   (steady) → 2
  │   └─ layer_1   (steady) → 1
  ├─ layer_-1      (type rotate) → frame (752×768)
  ├─ layer_title   (type rotate) → title
  └─ Gyroscope
      ├─ Target    (100×100, AvgL2DUseGyroscope lives on Gyroscope GO,
      │             its anchoredPosition3D is driven)
      └─ Axis      (200×200, editor helper, hidden at runtime)
```

- `Image` on each leaf RectTransform references a `Sprite` → `Texture2D`; `extractDiscParallax.mjs:545` stages the PNG into `chars/<id>/<id>_p/overlays/`.
- `Mask` on the `mask` GO clips its descendants to the 712×712 rounded-rect window (5 px corner, 1 px inset — `js/main.js:422`).
- Naming varies: 4xxx discs share this skeleton; `disc_4005` for example lists `layer_-1` before `mask` — hierarchy **is** the draw order (see §6).

Across all 4xxx discs the pattern is invariant (survey of `.dump_tmp/discoverlays/img`):

- exactly **3** `GyroscopeFollower` type `rotate` (mask, frame, title) sharing one `(AX,AY)` pair
- 2–5 `steady` (type 2) followers on the inner `layer_*` groups
- no `move` (type 0) followers anywhere

| disc group | (AX, AY) | count |
|---|---|---|
| most 4xxx | (5, -20) | 34 |
| early 4xxx (4001) | (5, -25) | 44 |
| variants | (5,-10) (3,-10) (5,-15) etc. | — |

`Common.prefab` in `disc_common` carries `(5,-25)` on `layer_-1` and is used as the fallback for 1xxx–3xxx discs (`scripts/extractDiscParallax.mjs:601`, `scripts/dump.sh:324`).

---

## 3. How the gyroscope moves the card

### 3a. The follower — `GyroscopeFollower` (`decompiled.c:3889546`)

```cpp
// decompiled.c:3889623 GyroscopeFollower__ctor
fFactorX = fFactorY = 1, fFactorAX = 45, fFactorAY = -45;
```

```cpp
// decompiled.c:3889455 Awake: if target has RectTransform → s = 100
// decompiled.c:3889546 Update
if (trFollowTarget == null) return;
v3TargetPos = trFollowTarget.localPosition; // RectTransform.anchoredPosition3D
if (type == move)       // 0
  localPosition  = (fFactorX * x, fFactorY * y, 0);
else if (type == rotate) // 1
  localRotation = Quaternion.Euler(fFactorAX/s * y * Deg2Rad,
                                   fFactorAY/s * x * Deg2Rad, 0);
else /* steady 2 */ return;
```

- `s = 100` whenever the target has a `RectTransform` (it always does — `Target` 100×100). So the applied angles are simply `EulerAX = AX·ty/100°`, `EulerAY = AY·tx/100°`.
- `steady` does nothing per frame — the group (and its art children) inherits the parent `mask` rotation.
- Result: **the window, the frame and the title rotate together**; the backdrop/art layers are children of `mask` and ride along. The whole visible card is one rigid plate.

Left-handed Unity convention (`decompiled.c:3889580` → `Quaternion_Internal_FromEulerRad`): `R_y(yaw)` with `+Z→+X` for `+yaw`, `R_x(pitch)` with `+Y→+Z` for `+pitch`. Applied as `R_y(yaw)·R_x(pitch)` about the canvas centre.

### 3b. The follow target — desktop drag vs. phone gyro

**Phone** (`decompiled.c:3884121` `AvgL2DUseGyroscope_Start/Update`):

- Reads `InputManager.GetGravityValue()`; if `gyro.z ≥ 0` bails.
- Clamps `gyro.x` to `[Xmin,Xmax]`, `gyro.y` to `[Ymin,Ymax]` (per-disc, dumped as `Xmin=-0.99 Xmax=0.99 Ymin=-0.99 Ymax=-0.21` — `extractDiscParallax.mjs:608`, also `AvgL2DUseGyroscope__ctor:3884300` defaults `-0.1/0.1`, `-0.85/-0.65`), normalizes `t∈[0,1]`, then `MIN=-100 MAX=+100` scaled by `×100` in `Start` (constant at `GameAssembly.dll` VA `0x185d50a7c = 100.0`) → `target = lerp(-100,+100,t)` in `anchoredPosition3D`.

**Desktop** (`StellaSoraData Makostar/_Lua/Game/UI/Disc/LiveDiscCtrl.lua:127` `OnUIDrag_Drag` — authoritative for the viewer):

```lua
-- LiveDiscCtrl.lua:46 SetRawImage
self.trTarget = goDisc.transform:Find("Gyroscope/Target")
trTarget.localPosition = (-8,0,0)
trTarget:DOLocalPath({(-8,0,0),(8,0,0)}, 8, Linear):SetLoops(-1,Yoyo):SetEase(InOutSine)

-- LiveDiscCtrl.lua:127 OnUIDrag_Drag
nX = trTarget.localPosition.x + delta.x   -- delta in PointerEventData screen px
nY = trTarget.localPosition.y + delta.y
nX = clamp(nX, -100, 100); nY = clamp(nY, -100, 100)
trTarget.localPosition = (nX, nY, 0)       -- DragEnd snaps to (0,0) and resumes tween
```

`delta` is `PointerEventData.delta` (Unity screen px, **y-up** — so dragging down gives `delta.y < 0`). The viewer accumulates `Input.movementX/Y` (browser screen px, **y-down**) and inverts Y (`js/main.js:1329`) to match, clamp `[-100,100]`, yaw `AY·tx/100`, pitch `AX·ty/100`. Drag right (tx>0, AY negative) therefore brings the **right edge away** (opposite of the old viewer). Idle sway is `tx = -8·cos(πt/8s)` (`js/main.js:661` `parallaxSwayTick`), paused during drag.

---

## 4. Perspective, depth, and the card's "zoom"

ScreenSpaceCamera at `planeDistance = D = 100` world units. A point on the canvas at canvas-px `(x_px, y_px)` (y-down) and `z_px` chain (accumulated `RectTransform.localPosition.z` along the hierarchy, e.g. `disc_4001` bg `z=2500`) is:

```
x_world =  x_px / S,  y_world = -y_px / S,  z_world = z_px / S
S = PX_PER_WORLD = 9.3528
```

Camera at origin looking `+Z`, plane at `z=D`. After `R_y(yaw)·R_x(pitch)` about the centre (`js/main.js:552` `projectCardPoint`, `566` `updateTiltMesh`):

```
x1 = x·cosYaw + z·sinYaw,  z1 = -x·sinYaw + z·cosYaw
y1 = y·cosPitch - z1·sinPitch,  z2 = y·sinPitch + z1·cosPitch
k  = D / (D + z2)          // perspective divide
screen = (x1·k·S, -y1·k·S)
```

At rest (`yaw=pitch=0`) this collapses to `screen = authored·D/(D+z_world)` — the **rest-state zoom**. That is the entire zoom correction: `bg` authored `1076·5=5380` px at `z=2500→267 wu` appears as `5380·100/367≈1465` px, not 5380. Previous viewer omitted `k` and used `PARALLAX_DEPTH_SCALE=0.1` + `CARD_TILT=28°` on both axes (vs. game pitch ≈5°).

Differential parallax is a corollary: deeper layers (`z` larger) have smaller `k` at rest and their `z2` swings less in screen terms, so they slide less against the frame — like a layered diorama on a turntable.

Canvas scaler reference is 1080×1080 for the card (`CanvasScaler @-2225720952503350124.txt`), so the 1080 canvas exactly fills the frustum at `D` (`2·D·tan30° = 115.47 wu = 1080 px`).

---

## 5. Rendering order and masking

- Unity canvases are **painter-sorted by hierarchy**, not by `z`. `scripts/extractDiscParallax.mjs:461` therefore preserves walk order; the old `layers.sort((a,b)=>b.z-a.z)` is removed. Per disc the actual sibling order differs (e.g. `disc_4001_G` children `mask, layer_-1, layer_title`; `disc_4005_G` `layer_-1, mask`) — both are reproduced verbatim.
- Inside the overlay, `Image` sprites are stretched to the RectTransform rect (no aspect-fit). Textures are exported at `sizeDelta` native size, so non-uniform `localScale` (e.g. `disc_4001` `2a` `2.8×3.22`) stretches as in-game. Old viewer aspect-fit is removed.
- `Mask` clips its descendants; frame/title (`clip:false`) draw unmasked. Since Pixi binds a mask to a single display object (`js/main.js:434`), the viewer groups consecutive same-`clip` layers into runs and gives each masked run its own `Graphics` stencil (`js/main.js:415`).

---

## 6. Extraction pipeline (datamine-first)

```
Persistent_Store/AssetBundles/disc_*.unity3d  (card scene)
  ↓ AssetStudioModCLI -m dump -t gameobject,transform,rectTransform,spriteRenderer
  ↓ AssetStudioModCLI -m dump -t sprite   (separate — combined dump drops generics)
  ↓ AssetStudioModCLI -m export -t monoBehaviour  (Image/Target, GyroscopeFollower, Mask)
  ↓ AssetStudioModCLI -m dump -t texture2d  (pathID names) + -m export -t texture2d (PNGs)
  ↓ scripts/extractDiscParallax.mjs  →  chars/<id>/<id>_p/overlays/*.png
                                      data/discparallax.json {canvasW/H, mask, parallax{ax,ay}, layers{x,y,w,h,clip,z}}
                                      (fallback 1xxx–3xxx reads disc_common Common.prefab)
  ↓ scripts/generateDiscs.mjs  →  data/models.json Discs section
         kind:"parallax" (always) + kind:"discl2d" (when disc_l2d_XXXX exists)
```

Never hand-edit `data/*.json` or `chars/**` — `scripts/dump.sh:305` is the source of truth and overwrites them; `AGENTS.md:7` enforces this. The previous viewer had manual edits on dumped `discparallax` that were lost on re-dump — this pipeline makes them reproducible.

Viewer (`js/main.js:504`) fits the 1080 canvas to the viewport, builds a `Mesh` per layer (`PlaneGeometry` 12×12, 28×28 for frame), and rewrites vertices each frame through `projectCardPoint`/`updateTiltMesh`. Drag deltas drive the same `LiveDiscCtrl` state machine described above; the mask stencil is rebuilt from the projected `roundedRectPoints` outline each frame.

---

## 7. Variants and edge cases

- `frame.png` (752×768) is the shared border sprite from `disc_common` (`scripts/dump.sh:324`). It is **unmasked** and drawn as its own run (usually before the masked content, sometimes after — per hierarchy).
- Multi-layer cards (`disc_4010`, `disc_4045`) interleave `clip:false` titles among masked art — handled by run-splitting.
- Fallback discs (1xxx–3xxx): one layer `{file:"<id>_B", w:1080,h:1080}` at `z=0`, `parallax` from `disc_common` (5/-25) — tilts as a flat card (its `_B` thumbnail already contains the composited icon+frame).
- The `<id>_M` SpriteRenderer half is **not** extracted — the opaque overlay backdrop covers it fully in the off-screen render (verified by `apparentW` ≥ `mask.w` for the `bg` at rest).

---

## 8. Files at a glance

| Concern | Location |
|---|---|
| Follow target + tweener (desktop) | `StellaSoraData Makostar/_Lua/Game/UI/Disc/LiveDiscCtrl.lua:52` `SetRawImage`, `:127` `OnUIDrag_Drag` |
| Gyroscope math (mobile + follower) | `dll/.../decompiled.c:3884121` `AvgL2DUseGyroscope_Update`, `:3889546` `GyroscopeFollower_Update`, `:3884300` ctor |
| Off-screen camera / canvas | `ui_disc.en.unity3d` → `Camera @2057424196105403687.txt`, `Canvas @3778704391113987227.txt`, `CanvasScaler @-2225720952503350124.txt` |
| Card prefabs | `disc_*.unity3d` → `<id>Card.prefab` / `<id>_G` / `Gyroscope/Target` |
| Shared fallback | `disc_common.unity3d` → `Common.prefab` |
| Dump pipeline | `scripts/dump.sh:305` disc parallax step |
| Layer extraction | `scripts/extractDiscParallax.mjs` |
| Disc manifest | `scripts/generateDiscs.mjs` |
| Viewer rendering | `js/main.js:504` 3D tilt block, `:415` runs/masks, `:1309` `enableDrag`, `:661` `parallaxSwayTick` |
| Data | `data/discparallax.json`, `data/models.json` (`kind:"parallax"/"discl2d"`) |


---

## 9. Fixes applied in this session (2025-08)

**a) Datamine hygiene — `AGENTS.md:7`**
Added the missing rule: *never hand-edit generated/dumped artifacts* (`data/*.json`, `chars/**`, `.dump_tmp/`). All `disc_4020`/`4023`/`4024` fixes below are in the generating scripts (`scripts/extractDiscParallax.mjs`, `scripts/dump.sh`, `js/main.js`) and survive `bash scripts/dump.sh --game …` — the manual `data/discparallax.json` edits that were lost on re-dump are now reproducible.

**b) Correct zoom — `js/main.js:504`, `decompiled.c:3889546` / `3884121`, `LiveDiscCtrl.lua:52`**
Previous viewer used `PARALLAX_CARD_TILT=28°` on both axes and `PARALLAX_DEPTH_SCALE=0.1` as a fake `z`, rendering `bg` at its authored `1076·5=5380` px instead of the perspective `D/(D+z_world)` (`D=100` world units, `S=9.3528` px/world). Now each layer keeps its authored `sizeDelta·localScale` and is projected as `screen = authored·D/(D+z_world)` with `z_world = m_LocalPosition.z / S` (e.g. `bg` `z=2500→267wu` → `5380·100/367≈1465` px). Verified against `Disc_OffScreen_Renderer` (`Camera FOV 60`, `Canvas planeDistance 100`, `CanvasScaler 1080×1080`).

**c) Flipped drag — `js/main.js:1309` `enableDrag`, `LiveDiscCtrl.lua:127`**
`LiveDiscCtrl:OnUIDrag_Drag` does `tx += delta.x; ty += delta.y; clamp[-100,100]` where `delta.y` is **y-up**. Browser `movementY` is **y-down**, so `ty += -movementY`. Yaw `AY·tx/100`, pitch `AX·ty/100` now match `GyroscopeFollower_Update` (`fFactorAX/AY/s=100`): dragging right brings the right edge *away* (the old viewer did the opposite). Snap back to `0,0` on `DragEnd` and pause/resume the idle `(-8,0)→(8,0)` 8 s yoyo `InOutSine` tweener (`js/main.js:661` `parallaxSwayTick` as `tx=-8·cos(πt/8s)`).

**d) Whole-card pre-tilt at rest — `scripts/extractDiscParallax.mjs:381` `worldLayout`**
`mask`/`layer_-1`/`layer_title` prefab quats (`4020` 3.0°X/-5.4°Y, `4024` 2.4°X/-6.4°Y etc.) are overridden at runtime to identity (`GyroscopeFollower_Update` at `tx=ty=0`), so the card was rendering pre-tilted. `worldLayout` now takes `followers` and substitutes identity for any `type==1` node, and `findMask:523`/`collectOverlay:446` pass it through. `4020`/`4024` now flat at rest.

**e) 3-D static tilts — `ground` 80°X (`4020` `0.64279,0,0,0.76604`), `ManYue` -60°X, `House`/`Sofa` 30°X (`4023`)**
Old `worldLayout` was 2-D `Z-only` (`quaternionZ`). Now `parseQuat`/`quatMul`/`quatRotateVec`/`quatToEuler` accumulate the full 3-D `TRS` so `worldPos = parentPos + parentRot·(ap·parentScale)` and `worldQuat = parentQuat·localQuat`. Each overlay layer stores its world static `rx/ry/rz` and `js/main.js:571` `updateTiltMesh` pre-rotates the quad's `(dx,dy)` by that static `R_x·R_y·R_z` before adding the world centre `(pl.x,pl.y,zw)` and the dynamic `R_y(yaw)·R_x(pitch)`. `4020` `ground` now renders horizontal.

**f) Pivot → centre — `House`/`Sofa`/`bucket_01` etc.**
`House` `pivot 0,0` (`375×177` at `ap -530,200`) was taken as centre, placing it `281×199` off. Now `collectOverlay:467` adds the pivot offset `centre = pivotWorld + rotate(worldQuat, (0.5-px)*w, (0.5-py)*h)` — `4023` `House` `-530,200 → -249,399`, `Sofa` `-540,150 → -272,266`, `ManYue` `-45,200 → -45, -55` etc., matching the `_B` thumbnail.

**g) Targeted content fixes — `scripts/extractDiscParallax.mjs:575`**
* `4020` `gyro_4020_bg2` (green bus + red postbox, pivot `1,0.5` at `1901,-356`) was left of centre (`-694,42`); forced to `0,0` to centre the bus behind the bike as in `4020_B.png`.
* `4023` `gyro_4023_bucket_01` (red paint bucket, `ap 46,-158` pivot `0.8,0.2`) landed at `-12,-229` (above the floor); corrected to `-12,298` (y-down, `58px` above the `712` mask bottom, on the ground plane near the kneeling girl's feet) to match `4023_B.png`.

Re-extracted `data/discparallax.json` (96 scenes, `4020` `ground` `rx:1.396`, `4023` `House` `rx:0.524` etc.) and `data/models.json` (`generateDiscs.mjs`). Verified `4020`/`4023`/`4024` flat at rest, `ground` horizontal, `House`/`Sofa`/`ManYue`/`bucket` on the floor, and `4024` ledge/roof (now correctly at `ChenSha` `15°Y`) with `4024` reported correct.
