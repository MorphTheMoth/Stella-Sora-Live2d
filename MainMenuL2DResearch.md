# Stella Sora — How the main-menu L2D and its background work

Investigation notes covering: what the "Default" L2D is, how the game picks
the main-menu character, where the main-menu background image comes from, and
how mouse/touch interaction with the L2D is wired up.

Sources: the decompiled game scripts in `StellaSoraData Makostar/_Lua`, the
datamine tables in `StellaSoraData Makostar/EN/bin`, and Unity assets extracted
from the installed game with `AssetStudioModCLI`.

---

## 1. The "Default" L2D

The Default L2D is just the character skin's `L2D` prefab.

`CharacterSkin.json` (datamine) — every skin row carries:

```
L2D:       Actor2D/Character/10301/10301_L.prefab   <- Default
GachaL2D:  Actor2D/Character/10301/10301_LF.prefab  <- Memory Snapshot / FullScreen
Portrait:  Actor2D/Character/10301/10301_a.spriteatlas   <- PNG fallback
Bg:        Image/CharBg/ttc_parkbase_daylight       <- main-menu bg image
Offset:    Actor2D/Character/10301/10301.asset      <- per-panel position/scale
CharacterCG: 10301                                 <- links to CharacterCG.json
```

The viewer's `chars/<skinId>/<skinId>_l/` (Default), `_lf` (Memory Snapshot)
and `_lt` (Talent) map 1:1 onto `_L`, `_LF`, `_LT` prefab names. The Default
variant the user sees in the viewer **is** the `L2D` prefab.

## 2. Choosing the main-menu character

The main-menu character is the player's **Board**: a server-saved list of up to
5 handbook entries (char skins / outfits / main-screen CG). The game remembers
the current index in local data key `MainBoardIndex`.

- `GameCore/Data/DataClass/PlayerBoardData.lua` — `GetCurBoardData()`,
  `ChangeNextBoard()` / `ChangeLastBoard()` cycle the index; the list itself is
  synced to the server with `player_board_set_req` (`SendBoardSet`).
- `Game/UI/MainViewEx/MainViewCtrl.lua:500` `RefreshActor2D()` reads the current
  board and, for a `SKIN` entry, calls
  `Actor2DManager.SetActor2D(PanelId.MainView, rawImgActor2D, charId, skinId)`.
- The in-game picker is `PanelId.ChooseHomePageRolePanel`
  (`Game/UI/MainViewBoard/ChooseHomePageRoleCtrl.lua`), opened by
  `MainViewCtrl:OnBtnClick_SwitchActor2D` (`MainViewCtrl.lua:1455`).

## 3. How the L2D is actually rendered

`Game/Actor2D/Actor2DManager.lua` is the whole Live2D engine glue.

- `Init()` (line 608) wires up the off-screen renderer:
  `==== UI ROOT ====/----Actor2D_OffScreen_Renderer----` with
  `----CachedInstance----` (pooled prefab instances) and `----Renderer----`
  (3 camera rigs). Each rig (`GetL2DRendererStructure`, line 339) is a camera
  + `customized_bg` SpriteRenderer + `animator/panel_offset/free_drag/
  actor_offset/L2D` parent node. Each rig renders into a RenderTexture that a
  panel RawImage (`----Actor2D----`) displays.
- `SetActor2D` (line 712) → `GetActor2DParams` (line 497) decides which prefab:
  `GetAssetPath` (line 138) returns `mapSkinData.L2D` for the **Normal** actor
  type (`AllEnum.Actor2DType = {Normal=1, FullScreen=2}`) and
  `CharacterCG.FullScreenL2D` (`_LF`) for **FullScreen**.
- `SetL2D` (line 446) instantiates the prefab, parents it under the rig's
  `L2D` node, and positions it.
- Positioning comes from the skin's `Offset` asset: `GetTargetPosScale` →
  `Actor2DOffsetData:GetOffsetData(panelId, pose, half, ...)` (per-panel
  position/scale), plus the panel's `v3PanelOffset` for shared layouts
  (`SetPanelOffset`, line 197).
- The panel config that decides "how to show the actor" is the Unity
  ScriptableObject `Assets/AssetBundles/UI/CommonEx/Preference/Actor2DInPanel.asset`
  (loaded in `CacheActor2DInPanelConfig`, line 25).

### The per-panel config — extracted

`Actor2DInPanel.asset` lives in `ui_commonex.unity3d`. Extracted it becomes
`assets/assetbundles/ui/commonex/preference/Actor2DInPanel.json`. The MainView
row (`PanelId == 10`) is:

```json
{
  "PanelId": 10, "ReusePanelId": 0, "Offset": {0,0,0},
  "PreferL2D": 1, "PreferHalf": 1,
  "PreferL2DType": 2,        // 2 = FullScreen, the default show type
  "AutoAdjust": 1,           // fall back to Normal if no favor-CG unlocked
  "PreferActorBg": 1,        // <-- draw CharacterSkin.Bg behind the actor
  "HistoryType": 1,          // remember the user's Normal/FullScreen choice
  "UIBgName": "bg_shop_01",
  "NoExSkin": 0
}
```

So the main menu **defaults** to the FullScreen (`_lf`, Memory Snapshot) CG
when the character has one unlocked, and falls back to the Default (`_l`)
half-body. The user's per-character choice (Normal vs FullScreen) is stored in
local data key `CharActor2DType` (`GetActor2DType`/`SaveActor2DType`, line 64).

## 4. The background — the part you want to add

There are **two** background layers in the game, and they are separate:

### a) The `customized_bg` SpriteRenderer (per-panel / per-skin image)

`GetActor2DParams` (line 497) computes `sBg`:

```lua
local sBg = GetUIDefaultBgName(tbConfig.sBg)          -- "Image/UIBG/<name>.png"
if tbConfig.bSpBg == true then sBg = mapSkinData.Bg .. ".png" end  -- PreferActorBg
if nT == TF then sBg = nil end                        -- FullScreen: model bg only
```

- Default = `Image/UIBG/<UIBgName>.png` (a shared UI backdrop).
- **MainView has `PreferActorBg = 1`, so it uses the character skin's `Bg`**:
  `Image/CharBg/<CharacterSkin.Bg>.png`.
- FullScreen type overrides it to `nil` — then only the model's own `----bg----`
  scene shows.

`SetL2D` (line 446) applies it to the rig's `customized_bg` SpriteRenderer,
which is drawn **behind** the L2D inside the off-screen camera:

```lua
NovaAPI.SetSpriteRendererSprite(tbRenderer.spr_bg, GetBg(sBg))
tbRenderer.spr_bg.transform.localScale = Vector3.one
```

The images are large full-frame sprites. Examples from `CharacterSkin.json`:

| Skin | Char | `CharacterSkin.Bg`            | Resolution |
|------|------|-------------------------------|------------|
| 10301 | 103 | `Image/CharBg/ttc_parkbase_daylight` | 2400×1700 |
| 10701 | 107 | `Image/CharBg/guard_outside_daylight` | — |
| 13001 | 130 | `Image/CharBg/posthouse`             | 2400×1700 |
| 16001 | 160 | `Image/CharBg/beach_daylight`        | — |

These PNGs ship in the game's `image-XX.unity3d` bundles under container
`image/charbg/` and extract with:

```bash
AssetStudioModCLI <game>/StellaSora_Data/StreamingAssets/InstallResource/image-XX.unity3d \
  -m export -t tex2d --filter-by-container CharBg --image-format png
```

### b) The in-model `----bg----` scene (inside the L2D prefab)

Separate from `customized_bg`, each L2D prefab can contain a layered background
scene under `root/----bg----` (plus `----bg_effect----` / `----fg_effect----`),
a stack of SpriteRenderers at world position/scale (PPU 100; the canvas is
24×17 world units). The game toggles/hides these nodes from Lua
(`ResetRenderer` line 400, `SetBoardNPC2D` line 1270).

- **Memory Snapshot (`_lf`) models always carry `----bg----`** — e.g. 10301_LF
  has `BG` (`10301_live2d_BG_001.png`, 2400×1700, size 24×17.004) at
  sortLayer 2 / sortOrder 0.
- **Default (`_l`) models often have an empty bg** (10301_L → `layers: []`), but
  several do ship their own layers (10302, 10303, 10304, 11002, 11103, ...).

The viewer already handles (b): `data/models.json` records per-variant
`bgLayers` (from `mergeBgLayers.mjs` / `compositions.json`) and `bg` singles,
and `main.js` (`setBackground`, `fitBgLayer`) draws them as sibling containers
behind/in front of the model.

**What the viewer is missing is (a)** — the per-character `Image/CharBg/*.png`
that the game draws on `customized_bg` in the main menu for the Normal/Default
display. To add it: extract the CharBg textures from the `image-XX` bundles and
map each skin → its `CharacterSkin.Bg` value, then show that image behind the
`_l` model (e.g. as an extra background option in the Background picker).

> **Implemented:** the viewer now does exactly this. `bg/charbg/` holds the
> extracted images, `data/charbg.json` maps `skinId -> basename`, each Default /
> Awakened manifest variant carries a `charBg` field, and `main.js` renders it
> as a full-frame layer in the same world space as the L2D (via the same
> `fitBgLayer` transform the `----bg----` layers use) — mirroring the game's
> `customized_bg` SpriteRenderer. The fit is also corrected: instead of zooming
> the character to fill the screen, charBg variants are scaled to the rig
> camera view (ortho `2160x1080`/PPU 100 = 21.6x10.8 world units), so the
> backdrop fills the screen. The character is then framed by the skin's
> MainView offset (`Actor2DOffsetData` panel 10 Set 2 in `data/offset.json`) —
> a downward shift + slight scale that puts the head in frame (the half-body
> view); the backdrop stays at the canvas center while the L2D moves under it.
> See `AgentsReadme.md` → "Main-menu backdrops (CharBg)".

## 5. Mouse / touch interaction with the L2D

The L2D renders into a `RawImage` (`----Actor2D----` node). A full-canvas UI
`Button` named `btnActor` sits directly on top of it in `MainViewPanel.prefab`
— the L2D itself never receives pointer events, the button does.

`MainViewCtrl` (`MainViewCtrl.lua`):

- **Click** — `btnActor` (Button) → `OnBtnClick_Actor` (line 1341):
  - plays the board click voice (`PlayerVoiceData:PlayBoardClickVoice()`);
  - if the view is in full-screen mode, exits it.
- **Horizontal swipe** — `eventActorDrag` (UIDrag on `btnActor`) →
  `OnDragStart_Actor` (line 1807): on drag-end, if the X delta exceeds
  `ConfigNumber("MainViewDragThreshold")`, swipe right → `ChangeLastBoard()`,
  swipe left → `ChangeNextBoard()`, then `RefreshActor2D()`.
- `btnBoardNext` (line 1493) — cycles to the next board entry.
- `btnSwitchActor2D` (line 1455) — opens the character picker
  (`ChooseHomePageRolePanel`).
- `btnSkipCGAnim` (line 1347) — skips the FullScreen CG intro
  (`Actor2DManager.SkipCGAnim`, line 990).

Separately, the **free-drag / pinch-zoom on the L2D itself** (`Actor2DManager.
SwitchActor2DDragOffset` / `SyncLocalPos` / `SyncLocalScale`, lines 1102–1210,
clamped to ±8 / ±9 units) is used by the character preview panels — e.g.
`CharacterSkinCtrl` (`OnUIDrag_Drag`, `OnUIZoom_Skin`), `MallSkinPreviewCtrl`,
`SkinPreviewCtrl` — **not** by the main menu.

## 6. Files at a glance

| Concern | Location |
|---------|----------|
| Default L2D prefab | `CharacterSkin.L2D` = `Actor2D/Character/<skin>/<skin>_L.prefab` |
| Board / main-menu char | `_Lua/GameCore/Data/DataClass/PlayerBoardData.lua` |
| Main view actor setup | `_Lua/Game/UI/MainViewEx/MainViewCtrl.lua:500` `RefreshActor2D` |
| L2D engine glue | `_Lua/Game/Actor2D/Actor2DManager.lua` |
| MainView panel config | `ui_commonex.unity3d` → `Actor2DInPanel.asset` (PanelId 10) |
| Main-menu bg image | `Image/CharBg/<CharacterSkin.Bg>.png` in `image-XX.unity3d` |
| In-model bg scene | `root/----bg----` in each L2D prefab (viewer `bg/`, `bgLayers`) |
| Char picker | `_Lua/Game/UI/MainViewBoard/ChooseHomePageRoleCtrl.lua` |
| Click/swipe handlers | `MainViewCtrl.lua:1341` / `1807` |
