# Main-menu background ↔ L2D framing

How the game positions the main-menu backdrop (`customized_bg`, the per-character
CharBg image) **relative to the L2D character**, and how that was reconstructed
in the Live2D viewer.

The short version: the background is a fixed 24×17-world-unit sprite inside the
off-screen rig, the camera shows a 21.6×10.8 view of it, and the character is a
node *inside the same rig* that is pushed down by a per-character offset so its
upper body / head sits in the camera view. The viewer had two bugs: it zoomed
the *character* to fill the screen (instead of fitting the camera view), and it
never applied the per-character offset.

---

## 1. The rig (the "stage" everything lives on)

The game renders every Actor2D panel through an off-screen camera rig defined in
`----Actor2D_Node----.prefab` (`ui_commonex.unity3d`) and driven by
`_Lua/Game/Actor2D/Actor2DManager.lua`:

```
renderer (----Actor2D_Node----)
├── OffScreen3DCamera     position (0,0,-11), orthographic size 5.4
├── customized_bg         position (0,0,9), scale 1  <- the CharBg (Image/CharBg/*.png)
└── animator
    └── panel_offset      <- per-panel offset from Actor2DInPanel.asset
        └── free_drag
            └── actor_offset            <- per-character offset (the "position")
                └── L2D
                    └── <L2D instance>
                        └── root        <- GetL2DData scale (fL2DS)
                            └── ----live2d_modle----
```

### The camera → how big the stage is

`Actor2DManager.lua` `Init_RT`:

```lua
tbRenderer._cam.orthographicSize = Settings.CURRENT_CANVAS_FULL_RECT_HEIGHT / 200
```

`Settings.lua`:

```lua
Settings.CURRENT_CANVAS_FULL_RECT_WIDTH  = 2160
Settings.CURRENT_CANVAS_FULL_RECT_HEIGHT = 1080
```

So `orthographicSize = 1080 / 200 = 5.4`, i.e. the camera sees a world region
**21.6 wide × 10.8 tall** (2:1). The off-screen render texture is also 2160×1080,
which is what the panel's `RawImage` displays.

### The backdrop (`customized_bg`)

`SetL2D` draws the skin background onto the `customized_bg` SpriteRenderer:

```lua
NovaAPI.SetSpriteRendererSprite(tbRenderer.spr_bg, GetBg(sBg))
tbRenderer.spr_bg.transform.localScale = Vector3.one
```

The CharBg sprites (e.g. `ttc_parkbase_daylight`) are 2400×1700 with
`m_PixelsToUnits = 100` (confirmed from the Sprite asset in `image-1c.unity3d`),
so at scale 1 they are **24×17 world units**. That is slightly larger than the
camera view (21.6×10.8), so the backdrop fills the screen edge-to-edge and is
cropped by the camera — you only see the centre ~90% × ~63% of the image.

### The character node

The L2D prefab's `root` and `----live2d_modle----` transforms are **identity**
(scale 1), and `SetRelativeL2DPoseScale` applies `GetL2DData` = `fL2DS` (1.0 for
10301). So the model renders at its raw moc3 size in world units.

The moc3 canvas info (read from the running model / `Cubism Core`):

```
CanvasWidth = 6144, CanvasHeight = 6144, PixelsPerUnit = 300
getCanvasWidth() = 6144 / 300 = 20.48 view units
```

So the character's canvas is 20.48×20.48 world units — 1.17× narrower than the
24-wide backdrop (24 / 20.48), and the character mesh fills ~97% of that canvas
height. The character is genuinely *bigger than the backdrop's height*; the game
doesn't shrink it, it **repositions** it.

## 2. The per-character offset (the part that was missing)

Every skin's `CharacterSkin.Offset` points at an `Actor2DOffsetData` ScriptableObject,
`Actor2D/Character/<skin>/<skin>.asset`, shipped in the `char_2d_<skin>.unity3d`
bundles. It has one row per panel, each with **two** position/scale sets:

```json
// 10301.asset, MainView row (nPanelId == 10)
{
  "nPanelId": 10, "nPoseIndex": 1,
  "fX1": 0.0,            "fY1": 0.0,            "fS1": 1.0,           // Set 1
  "fX2": 0.0049987896,   "fY2": -5.3952394,     "fS2": 0.96653855     // Set 2
}
```

- **Set 1 is identity for every character** — used by the FullScreen (`_lf`)
  display.
- **Set 2 is the Normal / half-body framing** — a slight scale (0.87–1.05) and
  a **downward shift**:

| skin | s   | x        | y        |
|------|-----|----------|----------|
| 10301| 0.97| +0.005   | -5.40    |
| 10701| 1.0 | -0.326   | -4.51    |
| 11001| 1.0 | -0.061   | -5.73    |
| 13001| 0.87| +0.268   | -4.06    |
| 16001| 0.99| -0.205   | -4.35    |

`GetOffsetData(panelId, pose, half=true, ...)` returns these, and `SetL2D`
applies them to `actor_offset`. Shifting the character **down** by ~4–5.7 world
units moves its head into the camera view (which is only 10.8 tall while the
character is ~20 tall) — that's what turns a full-height model into the framed
half-body you see in the lobby.

> Why two sets? The main menu defaults to the FullScreen CG (`Actor2DInPanel.asset`
> for `PanelId == 10`: `PreferL2DType = 2`, `HistoryType = 1`), which is the `_lf`
> model at Set 1 (identity, centred). The Normal display (the Default `_l`) uses
> Set 2. The viewer shows the Normal variant, so Set 2 is the one that matters.

## 3. Why the character looked too big in the viewer

The viewer's old `fitModelToScreen()` fitted the **character's bounding box** to
the screen — i.e. it zoomed the character until it filled the viewport, and drew
the CharBg scaled to the same model transform. The game never does this: the
camera view is fixed (21.6×10.8 world), the backdrop fills it, and the character
sits at its own data-defined size/position. So the viewer showed the character
zoomed way in with its head cropped off, and the backdrop smaller than the screen.

## 4. Reconstructing it in the viewer

Two coordinate systems meet:

| system | unit | notes |
|--------|------|-------|
| game world | 1 world unit = 100 texture px (PPU 100) | sprite sizes, offsets |
| viewer (pixi-cubism) | `pxPerUnit = internalModel.width / getCanvasWidth() = 6144 / 20.48 = 300` | 1 world unit = 300 pixi |

So in the viewer a 2400px CharBg = 24 world units = `24 * 300 = 7200` pixi.

### Step 1 — fit the camera view, not the character

```js
// charBg variants: scale the model so the game's 21.6 x 10.8 world camera view
// fills the screen (cover).
state.canvasScale = Math.max(
  screenWidth  / (21.6 * pxPerUnit),
  screenHeight / (10.8 * pxPerUnit)
);
```

The backdrop (`fitBgLayer`) uses this canvas scale and the screen centre, so it
fills the screen edge-to-edge exactly like `customized_bg` fills the camera.

### Step 2 — apply the character's MainView offset

```js
const o = variant.offset;                  // { s, x, y } from data/offset.json
model.scale.set(canvasScale * o.s, canvasScale * o.s);
model.x = canvasX + o.x * pxPerUnit * canvasScale;       // +x world = right
model.y = canvasY - o.y * pxPerUnit * canvasScale;       // +y world = up  -> screen up is minus
```

For 10301 (`s=0.9665, y=-5.395`) on a 1600×857 canvas this shifts the model
**down ~428 px** — exactly enough to bring the head into frame.

### Step 3 — keep the backdrop independent of the character

In the game `customized_bg` is a *sibling* of the L2D rig, not a child of
`actor_offset`, so it never moves with the character. `fitBgLayer` therefore
positions the CharBg from `state.canvasX/Y/Scale`, while the in-model
`----bg----`/`----fg_effect----` layers (which *are* inside the prefab) still
transform with the model.

## 5. The data

- `bg/charbg/*.png` — the `Image/CharBg/<name>.png` backdrops, extracted from
  the `image-*.unity3d` bundles (`--filter-by-container CharBg`).
- `data/charbg.json` — `skinId -> backdrop basename`, from the datamine
  `CharacterSkin.json` (`scripts/generateCharBg.mjs`).
- `data/offset.json` — `skinId -> { s, x, y }` (MainView Set 2), extracted from
  the `char_2d_*.unity3d` bundles (`scripts/generateOffset.mjs`).
- `data/models.json` — each Default / Awakened variant carries `charBg` and
  `offset` (`scripts/generateManifest.mjs`).
- `js/main.js` — `fitModelToScreen` (camera-view fit + offset) and `fitBgLayer`
  (backdrop at the canvas, in-model layers with the model).

## 6. Files referenced

| file | what it told us |
|------|-----------------|
| `_Lua/Game/Actor2D/Actor2DManager.lua` | rig structure, camera ortho size, `customized_bg` scale=1, `SetRelativeL2DPoseScale` |
| `_Lua/GameCore/Common/Settings.lua` | `CURRENT_CANVAS_FULL_RECT = 2160x1080` |
| `ui_commonex.unity3d` → `Actor2DInPanel.asset` | panel 10 = MainView, `PreferL2DType=2`, `PreferActorBg=1` |
| `ui_commonex.unity3d` → `----Actor2D_Node----.prefab` | camera at (0,0,-11) ortho 5.4; `customized_bg` at (0,0,9) |
| `image-*.unity3d` → CharBg `Sprite` | `m_PixelsToUnits = 100` → 24×17 world units |
| `char_2d_<skin>.unity3d` → `<skin>.asset` (`Actor2DOffsetData`) | Set 2 = the downward-shift half-body framing |
| moc3 `CanvasInfo` | 6144×6144, PPU 300 → 20.48 view units; `pxPerUnit = 300` in the viewer |
