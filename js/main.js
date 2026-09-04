import { Application, Container, Sprite, Graphics, Assets, Texture, extensions, Mesh, PlaneGeometry } from './pixi.min.mjs';
import { Live2DModel, Live2DPlugin, configureCubismSDK, CubismFramework } from './cubism.es.js';
import { USE_REMOTE_ASSETS, REMOTE_ASSETS_URL } from './config.js';

extensions.add(Live2DPlugin);

// The default 16MB Cubism work buffer is too small for the biggest
// Memory Snapshot models (e.g. 16001_F_a is a 3MB moc3) and causes the
// Cubism Core to assert + drop the WebGL context on weaker GPUs.
configureCubismSDK({ memorySizeMB: 64 });

function resolveUrl(p) {
  let clean = p.replace(/^\/+/, '');
  // Already an absolute URL (e.g. already-prefixed by a prior call) — return as-is.
  if (/^https?:\/\//.test(clean)) return clean;
  // Tolerate a path double-prefixed as `chars/<absolute-url>` or `bg/<absolute-url>`.
  const m = clean.match(/^(?:chars|bg)\/(https?:\/\/.+)$/);
  if (m) return m[1];
  if (USE_REMOTE_ASSETS && REMOTE_ASSETS_URL) {
    // Only redirect heavy assets — keep data/*.json + js/ local for GitHub Pages split hosting
    if (clean.startsWith('chars/') || clean.startsWith('bg/') || clean.startsWith('avg/')) {
      const base = REMOTE_ASSETS_URL.replace(/\/+$/, '');
      return base + '/' + clean;
    }
  }
  return clean;
}

const state = {
  app: null,
  camera: null,
  model: null,
  models: [],
  currentPath: null,
  currentName: null,
  currentBgList: [],
  bgContainer: null,
  fgContainer: null,
  bgTextures: [],
  currentBgKey: null,
  // Disc parallax (image-only) scene state.
  parallaxContainer: null,
  parallaxLayers: [],
  parallaxActive: false,
  parallaxItem: null,
  parallaxScene: null,
  parallaxFit: 1,
  parallaxMask: true,
  // When false, the Gyroscope/Target drag clamp ([-100,+100]) is disabled so
  // the card can be rotated without limit.
  parallaxMaxRotation: true,
  parallaxFrame: true,
  // One Graphics per masked run of layers (a Pixi mask binds to a single
  // display object, so each clipped run needs its own).
  parallaxMaskGraphics: [],
  parallaxWindowPts: null,
  // Gyroscope follow-target state (the game's Gyroscope/Target node): the
  // accumulated drag position in canvas units, clamped to [-100,100], and
  // the idle-sway clock (LiveDiscCtrl tweens it between -8 and +8).
  parallaxTargetX: 0,
  parallaxTargetY: 0,
  parallaxDragAccX: 0,
  parallaxDragAccY: 0,
  parallaxDragging: false,
  parallaxSwayMs: 0,
  // Where the rig canvas (the customized_bg backdrop / camera view) sits on
  // screen.  The character is placed relative to it via its MainView offset,
  // exactly like the game parents the L2D under actor_offset inside the rig.
  canvasX: 0,
  canvasY: 0,
  canvasScale: 1,
  // Story characters (AVG dialogue sprites): body + face overlay viewer.
  avgModels: [],
  avgContainer: null,
  avgItem: null,
  avgTextures: [],
  avgBody: null,
  avgFaceSprite: null,
  avgPoseIdx: 0,
  avgFaceIdx: -1,
  avgDark: false,
  options: {
    eyeBlink: true,
    angles: { x: 0, y: 0, z: 0 },
    bodyAngles: { x: 0, y: 0, z: 0 },
    overrides: new Map(),
  },
};

// Shared disc-view options — persisted in localStorage so they apply to every
// disc (and survive reloads), not per-scene.
const DISC_OPTS_KEY = 'ssDiscOptions';
function loadDiscOpts() {
  try { return JSON.parse(localStorage.getItem(DISC_OPTS_KEY)) || {}; }
  catch { return {}; }
}
function isFrameLayer(l) {
  return l.file === 'frame' || l.file.startsWith('rare_outfit_');
}
function saveDiscOpts() {
  localStorage.setItem(DISC_OPTS_KEY, JSON.stringify({
    mask: state.parallaxMask,
    maxRotation: state.parallaxMaxRotation,
    frame: state.parallaxFrame,
  }));
}
{
  const discOpts = loadDiscOpts();
  state.parallaxMask = discOpts.mask !== false;
  state.parallaxMaxRotation = discOpts.maxRotation !== false;
  state.parallaxFrame = discOpts.frame !== false;
}

const els = {
  canvas: document.getElementById('main-canvas'),
  list: document.getElementById('entity-list'),
  filter: document.getElementById('entity-filter'),
  openBtn: document.getElementById('entity-list_open'),
  closeBtn: document.getElementById('entity-list_close'),
  wrapper: document.getElementById('entity-list_wrapper'),
  title: document.getElementById('page-title'),
  status: document.getElementById('status'),
  bgcolor: document.getElementById('bgcolor'),
  screenshot: document.getElementById('screenshot'),
  transparentShot: document.getElementById('transparent-shot'),
  bgstatus: document.getElementById('bg-status'),
  bginput: document.getElementById('bginput'),
  optionsOpen: document.getElementById('options_open'),
  optionsClose: document.getElementById('options_close'),
  optionsWrapper: document.getElementById('options_wrapper'),
  optionsContent: document.getElementById('options-content'),
};

const ANGLE_PARAMS = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ'];
const BODY_ANGLE_PARAMS = ['ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ'];

// The engine's parameter lookups compare against interned CubismId objects,
// so raw strings never match and writes go to a dead "not exist" buffer.
const getId = (id) => CubismFramework.getIdManager().getId(id);

function resetCamera() {
  state.camera.x = 0;
  state.camera.y = 0;
  state.camera.scale.set(1);
}

// The game renders the L2D rig with an ortho camera at CURRENT_CANVAS_FULL_RECT
// (2160x1080)/PPU 100 = a 21.6 x 10.8 world-unit view; customized_bg (the
// CharBg, 24 x 17 world units) sits in that same world and fills the view
// edge-to-edge.  Reproducing that framing keeps the character at the game's
// relative size instead of zooming it to fill the screen.
const GAME_CAMERA_VIEW_W = 21.6;
const GAME_CAMERA_VIEW_H = 10.8;

function fitModelToScreen() {
  const model = state.model;
  const app = state.app;
  const screenWidth = app.renderer.width;
  const screenHeight = app.renderer.height;
  const canvasX = screenWidth / 2;
  const canvasY = screenHeight / 2;
  const variant = getVariantInfo(state.currentPath);
  const pxPerUnit = model.internalModel.width / model.internalModel.coreModel.getCanvasWidth();

  if (variant && variant.charBg) {
    // Fit the rig camera view (21.6 x 10.8 world units) to the screen.
    state.canvasScale = Math.max(
      screenWidth / (GAME_CAMERA_VIEW_W * pxPerUnit),
      screenHeight / (GAME_CAMERA_VIEW_H * pxPerUnit)
    );
  } else {
    const offset = 500;
    const bounds = model.getBounds();
    const modelWidth = Math.max(bounds.width, 1);
    const modelHeight = Math.max(bounds.height, 1) + offset;
    const scaleX = screenWidth / modelWidth;
    const scaleY = screenHeight / modelHeight;
    state.canvasScale = Math.min(scaleX, scaleY);
  }
  state.canvasX = canvasX;
  state.canvasY = canvasY;

  // The canvas/backdrop stays at the screen center.  The L2D itself is
  // parented under the rig's actor_offset, which the game drives from the
  // skin's MainView offset (Actor2DOffsetData panel 10, Set 2): a downward
  // shift + slight scale that frames the half-body view.
  model.x = canvasX;
  model.y = canvasY;
  model.scale.set(state.canvasScale, state.canvasScale);
  if (variant && variant.offset) {
    const o = variant.offset;
    model.scale.set(state.canvasScale * o.s, state.canvasScale * o.s);
    model.x = canvasX + o.x * pxPerUnit * state.canvasScale;
    model.y = canvasY - o.y * pxPerUnit * state.canvasScale;
  }
  resetCamera();
}

/* ---------------- Background (in-bundle l2d scene image) ---------------- */

// The game parents the bg ("----bg----") to the L2D model root as a stack of
// SpriteRenderers.  World units == 1/100 of texture px (PPU 100), and the
// model canvas is 24x17 world units scaled to the model's internal size.
//
// pixi-cubism renders the model's cubism meshes via addRenderable() and then
// its own children (collectRenderables -> addRenderable; collectChildren), so
// any child of the model draws ON TOP of the character.  We therefore keep the
// bg as a sibling of the model inside the camera container (behind it) and
// mirror the model's transform manually so it still pans/zooms/fits together.
function createBackgroundContainer() {
  const container = new Container();
  container.eventMode = 'none';
  container.interactive = false;
  state.bgContainer = container;
  // Behind the model (which is added to the camera after this).
  state.camera.addChildAt(container, 0);

  // ----fg_effect---- layers draw in front of the character, so they get a
  // container added AFTER the model.
  const fg = new Container();
  fg.eventMode = 'none';
  fg.interactive = false;
  state.fgContainer = fg;
  state.camera.addChild(fg);

  // Disc parallax (image-only) scene container.
  const parallax = new Container();
  parallax.eventMode = 'none';
  parallax.interactive = false;
  parallax.visible = false;
  state.parallaxContainer = parallax;
  state.camera.addChild(parallax);
}

function bgTextureValid(tex) {
  return !!tex && !!tex._source;
}

// Position/scale a bg layer sprite in camera-local (screen) space so it
// matches the model canvas.  World units == 1/100 texture px (PPU 100);
// the canvas is 24x17 world units mapped to the model's internal size.
function fitBgLayer(sprite, layer) {
  const model = state.model;
  if (!model || !bgTextureValid(sprite.texture)) return;
  const internalW = model.internalModel.width;
  const cw = model.internalModel.coreModel.getCanvasWidth();
  const pxPerUnit = internalW / cw; // model-local px per world unit
  const baseScale = pxPerUnit / 100; // sprite scale at model scale 1
  sprite.anchor.set(0.5);
  if (layer.charBg) {
    // The game's customized_bg is a sibling of the L2D rig (not under
    // actor_offset), so it stays put at the canvas center and is never
    // affected by the character's MainView offset.
    const cs = state.canvasScale;
    sprite.scale.set(
      cs * baseScale * (layer.sx || 1),
      cs * baseScale * (layer.sy || 1)
    );
    sprite.x = state.canvasX + (layer.x || 0) * pxPerUnit * cs;
    sprite.y = state.canvasY - (layer.y || 0) * pxPerUnit * cs;
  } else {
    // In-model ----bg----/----fg_effect---- layers live inside the L2D prefab
    // (under actor_offset), so they transform with the character.
    sprite.scale.set(
      model.scale.x * baseScale * (layer.sx || 1),
      model.scale.y * baseScale * (layer.sy || 1)
    );
    // Model-local offset from pivot (0,0 = canvas top-left, pivot = center).
    sprite.x = model.x + (layer.x || 0) * pxPerUnit * model.scale.x;
    sprite.y = model.y - (layer.y || 0) * pxPerUnit * model.scale.y;
  }
}

// Re-apply transform of every bg/fg layer after the model is fitted/rescaled.
function fitBackground() {
  for (const container of [state.bgContainer, state.fgContainer]) {
    if (!container) continue;
    for (const child of container.children) {
      if (child._bgLayer) fitBgLayer(child, child._bgLayer);
    }
  }
}

function clearContainer(container) {
  if (!container) return;
  // Detach all sprites first: destroying a texture still referenced by a
  // sprite makes the batch pipe flush a sprite whose _source is null.
  while (container.children.length) container.removeChildAt(0);
}

function clearBackground() {
  clearContainer(state.bgContainer);
  clearContainer(state.fgContainer);
  for (const tex of state.bgTextures) {
    try {
      if (tex.key) Assets.cache.remove(tex.key);
    } catch (e) { /* ignore */ }
    try { tex.texture.destroy(true); } catch (e) { /* ignore */ }
  }
  state.bgTextures = [];
  state.currentBgKey = null;
}

// Incremented on every setBackground call; a request that finishes loading
// after a newer one was issued drops its textures instead of stacking them
// on the newest scene.
let bgLoadSeq = 0;
// Incremented on every loadModel call; a model that finishes loading after a
// newer entry was clicked is dropped so only the last-clicked model renders.
let modelLoadSeq = 0;

// Render a background composed of one or more ordered layers.  Layers with
// fg=true go in front of the model; all others go behind it.
async function setBackground(layers) {
  const container = state.bgContainer;
  const fgContainer = state.fgContainer;
  const seq = ++bgLoadSeq;
  clearBackground();
  if (!container || !layers || !layers.length) { hideBgLoading(); return; }

  showBgLoading();
  // Load all layer textures up-front, then attach in order so no frame ever
  // shows a partially-composed background.
  const loaded = [];
  for (const layer of layers) {
    if (seq !== bgLoadSeq) { hideBgLoading(); return; }
    const p = resolveUrl(layer.path);
    try {
      const texture = await Assets.load(p);
      if (seq !== bgLoadSeq) { hideBgLoading(); return; }
      loaded.push({ layer, texture });
    } catch (e) {
      console.error('Failed to load background layer', p, e);
    }
  }
  if (!loaded.length) { hideBgLoading(); return; }

  for (const { layer, texture } of loaded) {
    const sprite = new Sprite(texture);
    sprite.eventMode = 'none';
    sprite.interactive = false;
    sprite._bgLayer = layer;
    fitBgLayer(sprite, layer);
    (layer.fg ? fgContainer : container).addChild(sprite);
    state.bgTextures.push({ key: resolveUrl(layer.path), texture });
  }
  state.currentBgKey = loaded[0].layer.path;
  hideBgLoading();
}

// Tracks in-flight asset loads (model textures, bg layers, parallax layers)
// so the top-bar "loading…" indicator stays visible across any combination.
let pendingLoads = 0;
function showBgLoading() {
  pendingLoads++;
  if (els.bgstatus) els.bgstatus.style.display = 'inline';
}
function hideBgLoading() {
  pendingLoads = Math.max(0, pendingLoads - 1);
  if (pendingLoads === 0 && els.bgstatus) els.bgstatus.style.display = 'none';
}

function getParamInfo() {
  const model = state.model;
  const internal = model.internalModel;
  const core = internal.coreModel;
  const count = core.getParameterCount();
  const out = [];
  for (let i = 0; i < count; i++) {
    const id = core.getParameterId(i).getString().s;
    out.push({
      index: i,
      id,
      min: core.getParameterMinimumValue(i),
      max: core.getParameterMaximumValue(i),
      def: core.getParameterDefaultValue(i),
    });
  }
  return out;
}

function setParam(id, value) {
  state.options.overrides.set(id, value);
  const core = state.model.internalModel.coreModel;
  try {
    core.setParameterValueById(getId(id), value);
  } catch (e) {
    // parameter may not exist in this model; ignore
  }
}

function getParamValue(id) {
  const core = state.model.internalModel.coreModel;
  try {
    return core.getParameterValueById(getId(id));
  } catch (e) {
    return 0;
  }
}

// Disc-like entries (parallax cards + disc L2D, plus event/other discs).
function isDiscItem(item) {
  if (!item || !item.kind) return false;
  return item.kind === 'parallax' || item.kind === 'discl2d' ||
         item.kind === 'event' || item.kind === 'other';
}

// Resolve the currently displayed item (matches by variant path or, for
// parallax discs, by the `id+p` currentPath set in loadParallax).
function getCurrentItem() {
  const rel = stripAssetBase(state.currentPath);
  for (const item of state.models) {
    if (item.variants && item.variants.some((v) => stripAssetBase(v.path) === rel)) {
      return item;
    }
    if (item.id + 'p' === state.currentPath) return item;
  }
  return null;
}

function getVariantInfo(path) {
  for (const item of state.models) {
    if (!item.variants) continue;
    for (const variant of item.variants) {
      if (resolveUrl(variant.path) === resolveUrl(path)) return variant;
    }
  }
  return null;
}

/* ---------------- Disc parallax (image-only scene) ---------------- */

// A disc's non-L2D entry is a parallax scene replicating the game's card
// prefab: the gyroscope overlay group (opaque card backdrop + sparkle/glow
// layers + title) clipped to a Mask window, laid out in the 1080x1080 logical
// canvas.  The whole overlay group shifts together by (ax, ay) * normalized
// drag when the user drags with the left mouse button.  Layers with depth 0
// (the <id>_B fallback for discs without an overlay scene) stay put.

function clearParallax() {
  const c = state.parallaxContainer;
  if (!c) return;
  while (c.children.length) c.removeChildAt(0);
  c.scale.set(1, 1);
  state.parallaxLayers = [];
  state.parallaxActive = false;
  state.parallaxItem = null;
  state.parallaxScene = null;
  state.parallaxFit = 1;
  state.parallaxMaskGraphics = [];
  state.parallaxWindowPts = null;
  state.parallaxTargetX = 0;
  state.parallaxTargetY = 0;
  state.parallaxDragAccX = 0;
  state.parallaxDragAccY = 0;
  state.parallaxDragging = false;
  state.parallaxSwayMs = 0;
}

// Render a parallax scene centred on the screen, fitted to the mask window.
async function loadParallax(item) {
  const seq = ++modelLoadSeq;
  resetCamera();
  state.currentPath = item.id + 'p';
  showBgLoading();

  // Tear down any live model and parallax scene.
  if (state.model) {
    const currentModel = state.model;
    if (state._overrideHandler && currentModel.internalModel) {
      currentModel.internalModel.off('beforeModelUpdate', state._overrideHandler);
    }
    state._overrideHandler = null;
    clearBackground();
    state.camera.removeChild(currentModel);
    currentModel.destroy({ children: true, texture: true, baseTexture: true });
    state.model = null;
  }
  clearBackground();
  clearParallax();
  clearAvg();
  clearElement(els.optionsContent);
  els.status.textContent = 'Loading ' + item.name + ' ...';
  await new Promise((r) => requestAnimationFrame(r));
  if (seq !== modelLoadSeq) { hideBgLoading(); return; }

  const scene = item.parallax || {};
  let layers = scene.layers || [];
  if (!state.parallaxFrame) layers = layers.filter((l) => !isFrameLayer(l));
  if (!layers.length) { els.status.textContent = ''; hideBgLoading(); return; }
  state.parallaxItem = item;
  state.parallaxScene = scene;

  // Fit the full canvas to the screen (the card art + title fill the canvas;
  // the mask window only clips the inner parallax layers, so fitting just the
  // mask would crop the title/frame that overhang it).
  const canvasW = scene.canvasW || 1080;
  const canvasH = scene.canvasH || 1080;
  const mask = scene.mask || null;
  const screenW = state.app.renderer.width;
  const screenH = state.app.renderer.height;
  const fit = Math.min(screenW / canvasW, screenH / canvasH);

  const container = state.parallaxContainer;
  container.position.set(screenW / 2, screenH / 2);
  container.scale.set(1, 1);
  container.visible = true;
  state.parallaxFit = fit;

  // Layers are drawn in dump order — Unity canvases are painter-sorted by
  // hierarchy, not by z.  Consecutive layers sharing the Mask flag form runs;
  // each masked run gets its own Graphics stencil showing the projected window
  // outline (rebuilt every frame), since a Pixi mask binds to a single display
  // object.  Unmasked runs (frame border / title) draw without one.  The mask
  // can be toggled off via the options panel (state.parallaxMask).
  const corner = 5;
  let windowPts = null;
  if (mask && state.parallaxMask) {
    const mw = mask.w - 1; // 1px smaller
    const mh = mask.h - 1;
    const my = mask.y + 2; // 1px higher
    windowPts = roundedRectPoints(mask.x - mw / 2, my - mh / 2, mw, mh, corner, 8);
  }
  state.parallaxWindowPts = windowPts;

  // Load textures and split the layer list into maximal clip-runs.
  const runs = []; // { clip, entries: [layerData] }
  const loaded = [];
  for (const l of layers) {
    if (seq !== modelLoadSeq) { hideBgLoading(); return; }
    try {
      const texture = await Assets.load(resolveUrl(l.path));
      if (seq !== modelLoadSeq) { hideBgLoading(); return; }
      // Every layer is a perspective-projected Mesh rotating with the card
      // (the frame / title tilt as much as the card art does).  The frame
      // needs finer subdivision so its border stays smooth under perspective.
      // Each layer renders at its authored rect (sizeDelta x scale chain):
      // the game's UI Image stretches the sprite to that rect, and the
      // rest-state zoom comes from the projection itself.
      let run = runs[runs.length - 1];
      if (!run || run.clip !== !!l.clip) {
        run = { clip: !!l.clip, entries: [] };
        runs.push(run);
      }
      const entry = {
        texture,
        // Layer layout in 1080-canvas px (y-down, relative to the centre).
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        // True depth along the camera axis, world units: accumulated
        // RectTransform z (canvas px) divided by the world->canvas scale.
        zw: (l.z || 0) / PARALLAX_PX_PER_WORLD,
        // Static world-space tilt baked from the prefab hierarchy (radians).
        // Discs 4020/4023/4024 have pre-tilted layers (ground 80° X etc.).
        rx: l.rx || 0,
        ry: l.ry || 0,
        rz: l.rz || 0,
        // ImageWarp corner warp: [BL, TL, TR, BR] local canvas px (y-up, z
        // local depth) — the game fake-perspectives floors/walls through
        // these; the vertex grid is bilinearly mapped through them.
        corners: l.corners || null,
        // UIAdditiveEffect layers (e.g. disc 4038's sun glare) composite
        // additively in the game ("UI Extensions/UIAdditive" shader) — their
        // black areas must contribute nothing.
        blend: l.blend || null,
        sub: l.file === 'frame' ? 28 : 12,
      };
      run.entries.push(entry);
      loaded.push(entry);
    } catch (e) {
      console.error('Failed to load parallax layer', l.path, e);
    }
  }
  state.parallaxLayers = loaded;

  // Build the display tree in dump order: per run a Graphics stencil plus a
  // container holding that run's meshes.
  const meshOf = new Map();
  const runContainers = [];
  for (const run of runs) {
    const cont = new Container();
    cont.eventMode = 'none';
    if (run.clip && windowPts) {
      const graphic = new Graphics();
      graphic.eventMode = 'none';
      graphic.scale.set(fit, fit);
      container.addChild(graphic);
      cont.mask = graphic;
      state.parallaxMaskGraphics.push(graphic);
    }
    for (const entry of run.entries) {
      const mesh = createTiltMesh(entry.texture, entry.w, entry.h, entry.sub, entry.sub);
      mesh.scale.set(fit, fit);
      if (entry.blend === 'add') mesh.blendMode = 'add';
      cont.addChild(mesh);
      meshOf.set(entry, mesh);
    }
    container.addChild(cont);
    runContainers.push({ run, cont });
  }
  // Generic stencil fix: multiple masked runs each need their own Graphics.
  // Previous addChildAt(0) piled masks at 0, culling first run on Pixi v8.
  // Now each graphic is added immediately before its container (see above).
  for (const entry of loaded) {
    entry.mesh = meshOf.get(entry);
    entry.geometry = entry.mesh.geometry;
    entry.verticesX = entry.sub;
    entry.verticesY = entry.sub;
  }
  state.parallaxActive = true;
  // Start at the game's initial follow-target position: LiveDiscCtrl seeds
  // Gyroscope/Target at (-8, 0) before its idle sway tween begins.
  resetParallax();
  els.status.textContent = '';
  buildOptionsPanel();
  hideBgLoading();
}

// 3D tilt of the disc card — replicating the game's own pipeline.
//
// In-game (LiveDiscCtrl + GyroscopeFollower + Disc_OffScreen_Renderer):
//   - The card prefab's Canvas is Screen Space - Camera on the offscreen
//     camera: FOV 60, PlaneDistance 100, CanvasScaler reference 1080x1080.
//     One canvas px = 2*100*tan(30deg)/1080 world units.
//   - Drag deltas accumulate onto the Gyroscope/Target RectTransform,
//     clamped to [-100,+100] canvas px; released, it snaps back to 0; while
//     idle it tweens between (-8,0) and (+8,0) (8s yoyo, InOutSine).
//   - Each GyroscopeFollower (type rotate) applies
//         localRotation = Quaternion.Euler(fFactorAX*ty/100 deg,
//                                           fFactorAY*tx/100 deg, 0)
//     to its group.  The Mask window, the frame and the title carry those
//     followers and the backdrop/art layers are children of the Mask, so the
//     whole visible card rotates rigidly about the canvas centre.
//   - Layers keep their authored RectTransform z chain, so they sit at real
//     depths behind the canvas plane; the perspective camera then shrinks
//     deeper layers by D/(D+z) at rest — that IS the card's rest-state zoom —
//     and produces the differential parallax while tilting.
const PARALLAX_PX_PER_WORLD = 1080 / (2 * 100 * Math.tan(Math.PI / 6)); // 9.3528
const PARALLAX_PLANE_DIST = 100;   // OffScreen2DCamera PlaneDistance (world units)
const PARALLAX_TARGET_MAX = 100;   // drag clamp on Gyroscope/Target, canvas px
const PARALLAX_SWAY_RANGE = 8;     // idle sway amplitude, canvas px
const PARALLAX_SWAY_HALF_S = 8;    // seconds per sway leg (yoyo tween)
const DEG2RAD = Math.PI / 180;

// Build a Mesh that renders a texture as a plane grid of verticesX * verticesY
// points.  The mesh's own transform is identity (position 0, scale 1); every
// frame we overwrite the vertex positions with the perspective-projected card
// coordinates (relative to the card centre), and set mesh.scale = fit so the
// 1080-canvas px card coords map to screen px.  The plane geometry's UVs are
// fixed, so the texture maps across the grid, and with enough subdivision the
// projective distortion is approximated cleanly.
function createTiltMesh(texture, w, h, verticesX, verticesY) {
  const geometry = new PlaneGeometry({ width: w, height: h, verticesX, verticesY });
  const mesh = new Mesh({ geometry, texture });
  mesh.eventMode = 'none';
  mesh.interactive = false;
  return mesh;
}

// Rotate a world-space point (canvas-px x/y right/down converted to world
// x-right/y-up, plus depth zw in world units) by Unity's yaw/pitch (left-
// handed Euler XYZ) and project through the perspective camera sitting
// PARALLAX_PLANE_DIST in front of the canvas plane.  Returns canvas px
// relative to the card centre.  At zero tilt this is exactly the game's rest
// state: authored size scaled by D/(D+zw).
function projectCardPoint(px, py, zw, yaw, pitch) {
  const x = px / PARALLAX_PX_PER_WORLD;
  const y = -py / PARALLAX_PX_PER_WORLD;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cosX = Math.cos(pitch), sinX = Math.sin(pitch);
  // R_y(yaw): left-handed, +Z swings toward +X for positive angles.
  const x1 = x * cosY + zw * sinY;
  const z1 = -x * sinY + zw * cosY;
  // R_x(pitch): +Y swings toward +Z for positive angles.
  const y1 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;
  const k = PARALLAX_PLANE_DIST / (PARALLAX_PLANE_DIST + z2);
  return { x: x1 * k * PARALLAX_PX_PER_WORLD, y: -y1 * k * PARALLAX_PX_PER_WORLD };
}

// Update a layer mesh's vertices for the current tilt (same math as
// projectCardPoint, inlined over the vertex grid).  Handles per-layer static
// tilt (rx/ry/rz) for discs 4020/4023/4024 where ground planes etc. are
// pre-tilted in the prefab.
function updateTiltMesh(pl, yaw, pitch) {
  const pos = pl.geometry.buffers[0].data;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cosX = Math.cos(pitch), sinX = Math.sin(pitch);
  const hw = pl.w / 2, hh = pl.h / 2;
  const vx = pl.verticesX, vy = pl.verticesY;
  const S = PARALLAX_PX_PER_WORLD, D = PARALLAX_PLANE_DIST;
  const hasStatic = (pl.rx || pl.ry || pl.rz);
  const srX = pl.rx || 0, srY = pl.ry || 0, srZ = pl.rz || 0;
  const cSx = hasStatic ? Math.cos(srX) : 1, sSx = hasStatic ? Math.sin(srX) : 0;
  const cSy = hasStatic ? Math.cos(srY) : 1, sSy = hasStatic ? Math.sin(srY) : 0;
  const cSz = hasStatic ? Math.cos(srZ) : 1, sSz = hasStatic ? Math.sin(srZ) : 0;
  const cx = pl.x / S, cy = -pl.y / S;
  const corners = pl.corners || null; // [BL, TL, TR, BR] local canvas px, y-up
  let n = 0;
  for (let gy = 0; gy < vy; gy++) {
    const v = (gy / (vy - 1)) * pl.h;
    for (let gx = 0; gx < vx; gx++) {
      const u = (gx / (vx - 1)) * pl.w;
      let dx, dy, dz;
      if (corners) {
        // Bilinear map of the grid through the warped corners (Unity local
        // space: y-up, z = local depth).  gy=0 is the texture top row, which
        // corresponds to the TL/TR corners — hence vv = 1 - gy/(vy-1).
        const uu = gx / (vx - 1), vv = 1 - gy / (vy - 1);
        const tX = corners[1][0] + (corners[2][0] - corners[1][0]) * uu;
        const tY = corners[1][1] + (corners[2][1] - corners[1][1]) * uu;
        const tZ = (corners[1][2] || 0) + ((corners[2][2] || 0) - (corners[1][2] || 0)) * uu;
        const bX = corners[0][0] + (corners[3][0] - corners[0][0]) * uu;
        const bY = corners[0][1] + (corners[3][1] - corners[0][1]) * uu;
        const bZ = (corners[0][2] || 0) + ((corners[3][2] || 0) - (corners[0][2] || 0)) * uu;
        dx = (bX + (tX - bX) * vv) / S;
        dy = (bY + (tY - bY) * vv) / S;
        dz = (bZ + (tZ - bZ) * vv) / S;
      } else {
        dx = (u - hw) / S;
        dy = -(v - hh) / S;
        dz = 0;
      }
      if (hasStatic) {
        // static R_x
        let y1 = dy * cSx - dz * sSx;
        let z1 = dy * sSx + dz * cSx;
        dy = y1; dz = z1;
        // static R_y
        let x1 = dx * cSy + dz * sSy;
        z1 = -dx * sSy + dz * cSy;
        dx = x1; dz = z1;
        // static R_z
        let x2 = dx * cSz - dy * sSz;
        let y2 = dx * sSz + dy * cSz;
        dx = x2; dy = y2;
      }
      const xw = cx + dx;
      const yw = cy + dy;
      const zw = pl.zw + dz;
      const x1 = xw * cosY + zw * sinY;
      const z1 = -xw * sinY + zw * cosY;
      const y1 = yw * cosX - z1 * sinX;
      const z2 = yw * sinX + z1 * cosX;
      const k = D / (D + z2);
      pos[n] = x1 * k * S;
      pos[n + 1] = -y1 * k * S;
      n += 2;
    }
  }
  pl.geometry.buffers[0].update();
}

// Perimeter points of a rounded rectangle in card-local px (y-down), used to
// draw the mask window so it tilts with the card.  Enough points per corner to
// keep the rounded corners smooth under perspective.
function roundedRectPoints(x0, y0, w, h, radius, perCorner) {
  const pts = [];
  const r = Math.min(radius, w / 2, h / 2);
  const corners = [
    [x0 + w - r, y0 + r, 0],          // top-right (-90..0 deg)
    [x0 + w - r, y0 + h - r, 1],      // bottom-right (0..90 deg)
    [x0 + r, y0 + h - r, 2],          // bottom-left (90..180 deg)
    [x0 + r, y0 + r, 3],              // top-left (180..270 deg)
  ];
  const starts = [-90, 0, 90, 180];
  for (let c = 0; c < 4; c++) {
    const [cx, cy, qi] = corners[c];
    for (let i = 0; i < perCorner; i++) {
      const a = (starts[qi] + (i / perCorner) * 90) * DEG2RAD;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

// Redraw every masked run's stencil from the projected window outline.
function updateParallaxMasks(yaw, pitch) {
  const pts = state.parallaxWindowPts;
  if (!pts) return;
  for (const g of state.parallaxMaskGraphics) {
    g.clear();
    for (let i = 0; i < pts.length; i++) {
      const p = projectCardPoint(pts[i][0], pts[i][1], 0, yaw, pitch);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.fill(0xffffff);
  }
}

// Apply a Gyroscope/Target position (canvas px, y-down like Unity UI) to the
// whole card: yaw from target.x, pitch from target.y, both through the
// follower factors dumped per disc (fFactorAY / fFactorAX).
function applyParallaxTarget(tx, ty) {
  if (!state.parallaxActive || !state.parallaxScene) return;
  const p = state.parallaxScene.parallax;
  if (!p) return;
  state.parallaxTargetX = tx;
  state.parallaxTargetY = ty;
  const yaw = ((p.ay || 0) * tx / PARALLAX_TARGET_MAX) * DEG2RAD;
  const pitch = ((p.ax || 0) * ty / PARALLAX_TARGET_MAX) * DEG2RAD;
  for (const pl of state.parallaxLayers) updateTiltMesh(pl, yaw, pitch);
  updateParallaxMasks(yaw, pitch);
}

function resetParallax() {
  // The game seeds Gyroscope/Target at (-8, 0) before its idle sway begins.
  state.parallaxSwayMs = 0;
  applyParallaxTarget(-PARALLAX_SWAY_RANGE, 0);
}

function stripAssetBase(p) {
  let clean = p.replace(/^\/+/, '');
  if (USE_REMOTE_ASSETS && REMOTE_ASSETS_URL) {
    const base = REMOTE_ASSETS_URL.replace(/\/+$/, '');
    if (clean.startsWith(base + '/')) clean = clean.slice(base.length + 1);
  }
  return clean;
}

function getVariantBgs(path) {
  const variant = getVariantInfo(path);
  if (!variant) return { layers: [], singles: [] };
  // loadModel may receive an absolute (remote) URL; reduce to the relative
  // chars/<skin>/<variant>/ form before extracting skin/variantDir.
  const rel = stripAssetBase(path);
  const skin = rel.split('/')[1];
  const variantDir = rel.split('/')[2];
  const bgPath = (f) => `chars/${skin}/${variantDir}/bg/${f}`;
  const layers = (variant.bgLayers || []).map((l) => ({ ...l, path: bgPath(l.file + '.png') }));
  const singles = (variant.bg || []).slice();
  // The game draws each skin's main-menu backdrop (CharacterSkin.Bg ->
  // Image/CharBg/<name>.png) on the customized_bg SpriteRenderer BEHIND the
  // L2D (Actor2DManager.GetActor2DParams/SetL2D, panels with PreferActorBg
  // like MainView). Reproduce it as a full-frame layer at the back of the
  // stack; it also fills the whole canvas edge-to-edge in-game.
  if (variant.charBg) {
    layers.unshift({ x: 0, y: 0, sx: 1, sy: 1, file: 'CharBg', path: variant.charBg, charBg: true });
  }
  // Variants without a recorded composition fall back to their primary bg
  // file as a standalone full-frame layer centered on the canvas.
  if (!layers.length && singles.length) {
    const p = singles[0];
    layers.push({ x: 0, y: 0, sx: 1, sy: 1, file: p.split('/').pop().replace(/\.png$/, ''), path: p });
  }
  return { layers, singles };
}

function addBackgroundControls(section) {
  const { layers, singles } = getVariantBgs(state.currentPath);
  const row = document.createElement('div');
  row.className = 'opt-row';
  const lab = document.createElement('label');
  lab.textContent = 'Background';
  const sel = document.createElement('select');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'None';
  sel.appendChild(none);
  if (layers.length > 1) {
    const comp = document.createElement('option');
    comp.value = 'all';
    comp.textContent = 'Composition (' + layers.length + ' layers)';
    sel.appendChild(comp);
  }
  const seen = new Set();
  const addOption = (label, key, path) => {
    if (seen.has(key)) return;
    seen.add(key);
    const opt = document.createElement('option');
    opt.value = 'k:' + key;
    opt.textContent = label;
    opt.dataset.path = path;
    sel.appendChild(opt);
  };
  for (const l of layers) {
    addOption(l.charBg ? 'Main-menu BG' : l.file, l.file, l.path);
  }
  for (const p of singles) {
    const name = p.split('/').pop().replace(/\.png$/, '');
    addOption(name, name, p);
  }
  if (sel.querySelector('option[value="all"]')) sel.value = 'all';
  else if (seen.size) {
    const first = sel.querySelector('option[data-path]');
    if (first) sel.value = first.value;
  }
  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v === '') {
      setBackground(null);
    } else if (v === 'all') {
      setBackground(layers);
    } else if (v.startsWith('k:')) {
      const opt = sel.options[sel.selectedIndex];
      setBackground([{ path: opt.dataset.path }]);
    }
  });
  row.appendChild(lab);
  row.appendChild(sel);
  section.appendChild(row);
}

/* ---------------- Story characters (AVG dialogue sprites) ---------------- */

// Each AVG actor bundle (char_avg_2d_avg<N>_<id>.unity3d) holds one artwork
// pose per atlas letter: the faceless body (`<id>_<pose>_001`), its black
// silhouette (`_001x`) and the face/expression overlays (`_002..N`).  The
// game renders body + face on coincident nodes of a shared rig (AvgPanel
// prefab in ui_avg.unity3d — Avg_2_CharCtrl:_SetPortrait), so alignment is
// baked into each sprite's tight mesh: data/avg.json carries every face's
// mesh-centre delta from the body's (extractAvg.py + generateAvg.mjs).  The
// exported PNGs are mesh-cropped, so anchoring each sprite at its centre
// reproduces the game's composite exactly.

function avgAsset(item, file) {
  return 'avg/' + item.id + '/' + file;
}

function getAvgPose() {
  const item = state.avgItem;
  if (!item || !item.poses.length) return null;
  return item.poses[Math.min(state.avgPoseIdx, item.poses.length - 1)];
}

function clearAvg() {
  if (state.avgContainer) {
    state.camera.removeChild(state.avgContainer);
    // Detach sprites before destroying their textures (see clearBackground).
    while (state.avgContainer.children.length) state.avgContainer.removeChildAt(0);
    state.avgContainer.destroy({ children: true });
  }
  for (const t of state.avgTextures) {
    try {
      if (t.key) Assets.cache.remove(t.key);
    } catch (e) { /* ignore */ }
    try { t.texture.destroy(true); } catch (e) { /* ignore */ }
  }
  state.avgContainer = null;
  state.avgTextures = [];
  state.avgItem = null;
  state.avgBody = null;
  state.avgFaceSprite = null;
  state.avgPoseIdx = 0;
  state.avgFaceIdx = -1;
  state.avgDark = false;
}

function fitAvgToScreen() {
  const c = state.avgContainer;
  const pose = getAvgPose();
  if (!c || !pose) return;
  const sw = state.app.renderer.width;
  const sh = state.app.renderer.height;
  const fit = Math.min((sw * 0.85) / pose.w, (sh * 0.92) / pose.h);
  c.scale.set(fit, fit);
  // Container origin = the body's mesh/content centre (sprites are mesh-
  // cropped and centre-anchored), centred on the screen.
  c.position.set(sw / 2, sh / 2);
}

// Load (and cache) one AVG sprite texture.
async function loadAvgTexture(item, file) {
  const p = resolveUrl(avgAsset(item, file));
  const tex = await Assets.load(p);
  if (!state.avgTextures.some((t) => t.key === p)) {
    state.avgTextures.push({ key: p, texture: tex });
  }
  return tex;
}

async function loadAvg(item, poseIdx) {
  const seq = ++modelLoadSeq;
  resetCamera();
  state.currentPath = item.id + 'a';

  // Tear down any live model (same sequence as loadParallax).
  if (state.model) {
    const currentModel = state.model;
    if (state._overrideHandler && currentModel.internalModel) {
      currentModel.internalModel.off('beforeModelUpdate', state._overrideHandler);
    }
    state._overrideHandler = null;
    clearBackground();
    state.camera.removeChild(currentModel);
    currentModel.destroy({ children: true, texture: true, baseTexture: true });
    state.model = null;
  }
  clearBackground();
  clearParallax();
  clearAvg();
  clearElement(els.optionsContent);
  els.status.textContent = 'Loading ' + item.name + ' ...';
  showBgLoading();
  await new Promise((r) => requestAnimationFrame(r));
  if (seq !== modelLoadSeq) { hideBgLoading(); return; }

  state.avgItem = item;
  state.avgPoseIdx = Math.max(0, Math.min(poseIdx || 0, item.poses.length - 1));
  state.avgFaceIdx = -1;
  state.avgDark = false;
  const pose = getAvgPose();

  const container = new Container();
  container.eventMode = 'none';
  container.interactive = false;
  state.camera.addChild(container);
  state.avgContainer = container;

  try {
    const bodyTex = await loadAvgTexture(item, pose.body);
    if (seq !== modelLoadSeq) { hideBgLoading(); return; }
    const body = new Sprite(bodyTex);
    body.anchor.set(0.5);
    body.eventMode = 'none';
    body.interactive = false;
    container.addChild(body);
    state.avgBody = body;

    const face = new Sprite(Texture.EMPTY);
    face.anchor.set(0.5);
    face.eventMode = 'none';
    face.interactive = false;
    container.addChild(face);
    state.avgFaceSprite = face;

    fitAvgToScreen();
    // The first expression is selected by default (avgFaceIdx drives the
    // panel's active thumbnail).
    state.avgFaceIdx = 0;
    buildOptionsPanel();
    applyAvgFace(0);
    els.status.textContent = '';
  } catch (e) {
    if (seq !== modelLoadSeq) { hideBgLoading(); return; }
    els.status.textContent = 'Failed: ' + e.message;
    console.error(e);
  }
  hideBgLoading();
}

// Show expression overlay `idx` (index into the pose's face list; -1 = none).
async function applyAvgFace(idx) {
  const pose = getAvgPose();
  const face = state.avgFaceSprite;
  if (!pose || !face) return;
  if (idx < 0 || idx >= pose.faces.length) {
    state.avgFaceIdx = -1;
    face.texture = Texture.EMPTY;
    return;
  }
  const f = pose.faces[idx];
  state.avgFaceIdx = idx;
  try {
    const tex = await loadAvgTexture(state.avgItem, f.file);
    // A newer selection (or a reloaded scene / pose switch) superseded this
    // request — the captured sprite is the destroyed previous one.
    if (state.avgFaceSprite !== face || state.avgFaceIdx !== idx) return;
    face.texture = tex;
    // Face content centre relative to the body content centre (y-up data,
    // Pixi is y-down).
    face.x = f.x;
    face.y = -f.y;
  } catch (e) {
    console.error('Failed to load face', f.file, e);
  }
}

// Swap the body between its normal art and the black silhouette (<pose>_001x).
async function applyAvgDark(on) {
  const pose = getAvgPose();
  const body = state.avgBody;
  if (!pose || !body || !pose.black) return;
  state.avgDark = !!on;
  try {
    const tex = await loadAvgTexture(state.avgItem, on ? pose.black : pose.body);
    if (state.avgBody !== body || state.avgDark !== !!on) return;
    body.texture = tex;
  } catch (e) {
    console.error('Failed to load body', on ? pose.black : pose.body, e);
  }
}

function buildAvgOptionsPanel() {
  clearElement(els.optionsContent);
  const item = state.avgItem;
  const pose = getAvgPose();
  if (!item || !pose) return;

  const infoSection = addSection('Story Character');
  const info = document.createElement('div');
  info.className = 'opt-row';
  info.style.color = 'var(--text-faint)';
  info.style.fontSize = '11px';
  info.textContent = item.shortId + ' — ' + item.name;
  infoSection.appendChild(info);

  if (item.poses.length > 1) {
    const row = document.createElement('div');
    row.className = 'opt-row';
    const lab = document.createElement('label');
    lab.textContent = 'Pose';
    const sel = document.createElement('select');
    item.poses.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = p.letter.toUpperCase() + ' (' + (p.faces.length + 1) + ' sprites)';
      sel.appendChild(opt);
    });
    sel.value = state.avgPoseIdx;
    sel.addEventListener('change', () => {
      loadAvg(item, parseInt(sel.value, 10));
    });
    row.appendChild(lab);
    row.appendChild(sel);
    infoSection.appendChild(row);
  }

  if (pose.black) {
    const check = document.createElement('label');
    check.className = 'opt-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.avgDark;
    check.appendChild(input);
    check.appendChild(document.createTextNode('Dark Silhouette'));
    input.addEventListener('change', () => applyAvgDark(input.checked));
    infoSection.appendChild(check);
  }

  const exprSection = addSection('Expressions (' + pose.faces.length + ')');
  const grid = document.createElement('div');
  grid.className = 'emoji-grid';
  pose.faces.forEach((f, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-btn' + (state.avgFaceIdx === i ? ' active' : '');
    btn.title = f.file;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.draggable = false;
    img.src = resolveUrl(avgAsset(item, f.file));
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      const next = state.avgFaceIdx === i ? -1 : i;
      applyAvgFace(next);
      grid.querySelectorAll('.emoji-btn.active').forEach((b) => b.classList.remove('active'));
      if (next >= 0) btn.classList.add('active');
    });
    grid.appendChild(btn);
  });
  exprSection.appendChild(grid);
  const noneRow = document.createElement('div');
  noneRow.className = 'opt-buttons';
  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.textContent = 'No Expression';
  noneBtn.addEventListener('click', () => {
    applyAvgFace(-1);
    grid.querySelectorAll('.emoji-btn.active').forEach((b) => b.classList.remove('active'));
  });
  noneRow.appendChild(noneBtn);
  exprSection.appendChild(noneRow);
}

/* ---------------- Options panel ---------------- */

function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function addSection(title) {
  const section = document.createElement('div');
  section.className = 'opt-section';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  section.appendChild(h3);
  els.optionsContent.appendChild(section);
  return section;
}

function addAngleRow(section, label, angleKey, paramId, source) {
  const row = document.createElement('div');
  row.className = 'opt-row';

  const lab = document.createElement('label');
  lab.textContent = label;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = -1;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = source[angleKey];

  const value = document.createElement('span');
  value.className = 'opt-value';
  value.textContent = source[angleKey].toFixed(2);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'opt-reset';
  reset.textContent = 'R';

  const apply = (v) => {
    source[angleKey] = v;
    value.textContent = v.toFixed(2);
    const scaled = v * 30;
    setParam(paramId, scaled);
  };

  slider.addEventListener('input', () => {
    apply(parseFloat(slider.value));
  });
  reset.addEventListener('click', () => {
    slider.value = 0;
    apply(0);
  });

  row.appendChild(lab);
  row.appendChild(slider);
  row.appendChild(value);
  row.appendChild(reset);
  section.appendChild(row);
}

function addMotionControls(section) {
  const internal = state.model.internalModel;
  const motionManager = internal.motionManager;
  const definitions = motionManager.definitions || {};
  const groups = Object.keys(definitions).filter((g) => definitions[g] && definitions[g].length);

  const groupRow = document.createElement('div');
  groupRow.className = 'opt-row';
  const groupLab = document.createElement('label');
  groupLab.textContent = 'Group';
  const groupSel = document.createElement('select');
  for (const g of groups) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    groupSel.appendChild(opt);
  }
  const variant = getVariantInfo(state.currentPath);
  const defaultGroup =
    variant && variant.label === 'Talent' && groups.includes('idle_2')
      ? 'idle_2'
      : groups.includes('idle') ? 'idle' : groups[0];
  if (defaultGroup) groupSel.value = defaultGroup;
  groupRow.appendChild(groupLab);
  groupRow.appendChild(groupSel);
  section.appendChild(groupRow);

  const motionRow = document.createElement('div');
  motionRow.className = 'opt-row';
  const motionLab = document.createElement('label');
  motionLab.textContent = 'Motion';
  const motionSel = document.createElement('select');
  motionRow.appendChild(motionLab);
  motionRow.appendChild(motionSel);
  section.appendChild(motionRow);

  const fillMotions = () => {
    clearElement(motionSel);
    const group = groupSel.value;
    const defs = definitions[group] || [];
    defs.forEach((def, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = def.File || ('Motion ' + (idx + 1));
      motionSel.appendChild(opt);
    });
  };

  const startCurrent = () => {
    const group = groupSel.value;
    const idx = parseInt(motionSel.value, 10);
    if (group == null || Number.isNaN(idx)) return;
    state.model.motion(group, idx, 3).then((ok) => {
      els.status.textContent = ok ? '' : 'Motion failed to start';
    });
  };

  groupSel.addEventListener('change', () => {
    fillMotions();
    startCurrent();
  });
  fillMotions();

  const btnRow = document.createElement('div');
  btnRow.className = 'opt-buttons';
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.textContent = 'Start';
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.textContent = 'Stop';

  startBtn.addEventListener('click', startCurrent);
  stopBtn.addEventListener('click', () => {
    state.model.stopMotions();
  });

  btnRow.appendChild(startBtn);
  btnRow.appendChild(stopBtn);
  section.appendChild(btnRow);

  // Auto-start the preselected motion group once the panel is built.
  startCurrent();
}

function addExpressionControls(section) {
  const internal = state.model.internalModel;
  const expressionManager = internal.motionManager.expressionManager;
  const defs = expressionManager ? (expressionManager.definitions || []) : [];

  if (!defs.length) {
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.textContent = 'No expressions';
    row.style.color = 'var(--text-faint)';
    row.style.fontSize = '11px';
    section.appendChild(row);
    return;
  }

  const row = document.createElement('div');
  row.className = 'opt-row';
  const lab = document.createElement('label');
  lab.textContent = 'Expression';
  const sel = document.createElement('select');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '-- none --';
  sel.appendChild(none);
  defs.forEach((def, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = def.Name || def.File || ('Expression ' + (idx + 1));
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v === '') {
      state.model.expression(0);
      state.model.internalModel.motionManager.expressionManager.resetExpression();
    } else {
      state.model.expression(parseInt(v, 10));
    }
  });
  row.appendChild(lab);
  row.appendChild(sel);
  section.appendChild(row);
}

function addEyeBlinkControl(section) {
  const check = document.createElement('label');
  check.className = 'opt-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = state.options.eyeBlink;
  check.appendChild(input);
  check.appendChild(document.createTextNode('Eye Blink'));
  input.addEventListener('change', () => {
    state.options.eyeBlink = input.checked;
    applyEyeBlink();
  });
  section.appendChild(check);
}

function addParameterControls(section) {
  const params = getParamInfo();
  const reserved = new Set([...ANGLE_PARAMS, ...BODY_ANGLE_PARAMS]);
  const list = params.filter((p) => !reserved.has(p.id));

  for (const p of list) {
    const wrap = document.createElement('div');
    wrap.className = 'opt-param';

    const head = document.createElement('div');
    head.className = 'opt-param-head';
    const lab = document.createElement('label');
    lab.textContent = p.id;
    lab.title = p.id;
    head.appendChild(lab);
    wrap.appendChild(head);

    const sliderRow = document.createElement('div');
    sliderRow.className = 'opt-param-slider';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = p.min;
    slider.max = p.max;
    slider.step = Math.max((p.max - p.min) / 1000, 0.01);
    const initVal = getParamValue(p.id);
    slider.value = initVal;
    const value = document.createElement('span');
    value.className = 'opt-value';
    value.textContent = Number(initVal).toFixed(2);

    const syncValue = () => {
      const v = parseFloat(slider.value);
      value.textContent = v.toFixed(2);
      setParam(p.id, v);
    };
    slider.addEventListener('input', syncValue);

    sliderRow.appendChild(slider);
    sliderRow.appendChild(value);
    wrap.appendChild(sliderRow);
    section.appendChild(wrap);
  }
}

function buildOptionsPanel() {
  clearElement(els.optionsContent);

  // Story-character (AVG sprite) viewer panel.
  if (state.avgItem) {
    buildAvgOptionsPanel();
    return;
  }

  if (!state.model) {
    const section = addSection('Disc');
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.style.color = 'var(--text-faint)';
    row.style.fontSize = '11px';
    section.appendChild(row);

    // Shared disc options (persisted in localStorage, applied to every disc).
    // Max Rotation: the game clamps Gyroscope/Target to [-100,+100]; turning
    // this off removes the clamp so the card can be rotated without limit.
    const rotCheck = document.createElement('label');
    rotCheck.className = 'opt-check';
    const rotInput = document.createElement('input');
    rotInput.type = 'checkbox';
    rotInput.checked = state.parallaxMaxRotation;
    rotCheck.appendChild(rotInput);
    rotCheck.appendChild(document.createTextNode('Enable Max Rotation'));
    rotInput.addEventListener('change', () => {
      state.parallaxMaxRotation = rotInput.checked;
      saveDiscOpts();
      if (rotInput.checked) {
        // Re-clamp the accumulated drag target so the card returns in-range.
        state.parallaxDragAccX = clampParallaxTarget(state.parallaxDragAccX);
        state.parallaxDragAccY = clampParallaxTarget(state.parallaxDragAccY);
        applyParallaxTarget(state.parallaxDragAccX, state.parallaxDragAccY);
      }
    });
    section.appendChild(rotCheck);

    // Mask toggle: clip the parallax glints to the card window (the
    // game's Mask).  Turn off to show the full layers spilling over.
    const check = document.createElement('label');
    check.className = 'opt-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.parallaxMask;
    check.appendChild(input);
    check.appendChild(document.createTextNode('Enable Mask'));
    input.addEventListener('change', () => {
      state.parallaxMask = input.checked;
      saveDiscOpts();
      if (state.parallaxItem) loadParallax(state.parallaxItem);
    });
    section.appendChild(check);

    const frameCheck = document.createElement('label');
    frameCheck.className = 'opt-check';
    const frameInput = document.createElement('input');
    frameInput.type = 'checkbox';
    frameInput.checked = state.parallaxFrame;
    frameCheck.appendChild(frameInput);
    frameCheck.appendChild(document.createTextNode('Enable Disc Frame'));
    frameInput.addEventListener('change', () => {
      state.parallaxFrame = frameInput.checked;
      saveDiscOpts();
      if (state.parallaxItem) loadParallax(state.parallaxItem);
    });
    section.appendChild(frameCheck);
    return;
  }

  const angleSection = addSection('Angle');
  addAngleRow(angleSection, 'Angle X', 'x', 'ParamAngleX', state.options.angles);
  addAngleRow(angleSection, 'Angle Y', 'y', 'ParamAngleY', state.options.angles);
  addAngleRow(angleSection, 'Angle Z', 'z', 'ParamAngleZ', state.options.angles);

  const bodySection = addSection('Body Angle');
  addAngleRow(bodySection, 'Body X', 'x', 'ParamBodyAngleX', state.options.bodyAngles);
  addAngleRow(bodySection, 'Body Y', 'y', 'ParamBodyAngleY', state.options.bodyAngles);
  addAngleRow(bodySection, 'Body Z', 'z', 'ParamBodyAngleZ', state.options.bodyAngles);

  const motionSection = addSection('Motions');
  addMotionControls(motionSection);

  const expressionManager = state.model.internalModel.motionManager.expressionManager;
  if (expressionManager && (expressionManager.definitions || []).length) {
    const exprSection = addSection('Expressions');
    addExpressionControls(exprSection);
  }

  const blinkSection = addSection('Auto Blink');
  addEyeBlinkControl(blinkSection);

  const { layers, singles } = getVariantBgs(state.currentPath);
  if (layers.length || singles.length) {
    const bgSection = addSection('Background');
    addBackgroundControls(bgSection);
  }

  const paramsSection = addSection('Parameters');
  addParameterControls(paramsSection);

  // Global disc options — also shown here so they are discoverable while
  // viewing a trekker, but they only affect parallax discs.  Only surface
  // them when the current entry is actually a disc (L2D or card).
  if (isDiscItem(getCurrentItem())) {
    const section = addSection('Disc');
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.textContent = 'Applies to parallax discs.';
    row.style.color = 'var(--text-faint)';
    row.style.fontSize = '11px';
    section.appendChild(row);
    const rotCheck2 = document.createElement('label');
    rotCheck2.className = 'opt-check';
    const rotInput2 = document.createElement('input');
    rotInput2.type = 'checkbox';
    rotInput2.checked = state.parallaxMaxRotation;
    rotCheck2.appendChild(rotInput2);
    rotCheck2.appendChild(document.createTextNode('Enable Max Rotation'));
    rotInput2.addEventListener('change', () => {
      state.parallaxMaxRotation = rotInput2.checked;
      saveDiscOpts();
      if (rotInput2.checked) {
        state.parallaxDragAccX = clampParallaxTarget(state.parallaxDragAccX);
        state.parallaxDragAccY = clampParallaxTarget(state.parallaxDragAccY);
        applyParallaxTarget(state.parallaxDragAccX, state.parallaxDragAccY);
      }
    });
    section.appendChild(rotCheck2);
    const check2 = document.createElement('label');
    check2.className = 'opt-check';
    const input2 = document.createElement('input');
    input2.type = 'checkbox';
    input2.checked = state.parallaxMask;
    check2.appendChild(input2);
    check2.appendChild(document.createTextNode('Enable Mask'));
    input2.addEventListener('change', () => {
      state.parallaxMask = input2.checked;
      saveDiscOpts();
      if (state.parallaxItem) loadParallax(state.parallaxItem);
    });
    section.appendChild(check2);
    const frameCheck2 = document.createElement('label');
    frameCheck2.className = 'opt-check';
    const frameInput2 = document.createElement('input');
    frameInput2.type = 'checkbox';
    frameInput2.checked = state.parallaxFrame;
    frameCheck2.appendChild(frameInput2);
    frameCheck2.appendChild(document.createTextNode('Enable Disc Frame'));
    frameInput2.addEventListener('change', () => {
      state.parallaxFrame = frameInput2.checked;
      saveDiscOpts();
      if (state.parallaxItem) loadParallax(state.parallaxItem);
    });
    section.appendChild(frameCheck2);
  }
}

function applyEyeBlink() {
  const internal = state.model.internalModel;
  const mm = internal.motionManager;
  if (!state.options.eyeBlink) {
    if (mm.expressionManager) mm.expressionManager.resetExpression();
    // force-open the eye params so the model isn't stuck blinking
    const params = getParamInfo();
    for (const p of params) {
      if (/^ParamEye[LR]Open$/.test(p.id)) {
        internal.coreModel.setParameterValueById(getId(p.id), p.max);
      }
    }
  }
}

function applyAngleOverrides() {
  const internal = state.model.internalModel;
  const o = state.options;
  const core = internal.coreModel;
  const a = o.angles;
  const b = o.bodyAngles;
  try {
    core.setParameterValueById(getId('ParamAngleX'), a.x * 30);
    core.setParameterValueById(getId('ParamAngleY'), a.y * 30);
    core.setParameterValueById(getId('ParamAngleZ'), a.z * 30);
    core.setParameterValueById(getId('ParamBodyAngleX'), b.x * 10);
    core.setParameterValueById(getId('ParamBodyAngleY'), b.y * 10);
    core.setParameterValueById(getId('ParamBodyAngleZ'), b.z * 10);
  } catch (e) {
    // some models lack body angle params; ignore
  }
  for (const [id, value] of o.overrides) {
    try {
      core.setParameterValueById(typeof id === 'string' ? getId(id) : id, value);
    } catch (e) {
      // ignore
    }
  }
}

function hookOverrideApply() {
  const model = state.model;
  const internal = model.internalModel;
  const onBeforeUpdate = () => {
    if (state.model === model) applyAngleOverrides();
  };
  internal.on('beforeModelUpdate', onBeforeUpdate);
  state._overrideHandler = onBeforeUpdate;
}

export async function loadModel(path) {
  const app = state.app;
  const camera = state.camera;
  const seq = ++modelLoadSeq;

  // Always reset zoom/pan the moment an entry is picked, so the view never
  // carries the previous model's camera over (even if the load fails or a
  // newer entry supersedes it).
  resetCamera();

  state.currentPath = path;
  const { layers } = getVariantBgs(path);
  state.currentBgList = layers;
  state.options.overrides.clear();
  state.options.angles = { x: 0, y: 0, z: 0 };
  state.options.bodyAngles = { x: 0, y: 0, z: 0 };
  clearParallax();
  clearAvg();

  if (state.model) {
    const currentModel = state.model;
    if (state._overrideHandler && currentModel.internalModel) {
      currentModel.internalModel.off('beforeModelUpdate', state._overrideHandler);
    }
    state._overrideHandler = null;
    clearBackground();
    clearAvg();
    camera.removeChild(currentModel);
    currentModel.destroy({ children: true, texture: true, baseTexture: true });
    state.model = null;
  }

  els.status.textContent = 'Loading ' + stripAssetBase(path).split('/').slice(-2).join('/') + ' ...';
  showBgLoading();
  await new Promise((r) => requestAnimationFrame(r));

  try {
    const model = await Live2DModel.from(path);
    // A newer entry was clicked while this one was loading; drop it so stale
    // loads don't stack every previously clicked model on the scene.
    if (seq !== modelLoadSeq) {
      model.destroy({ children: true, texture: true, baseTexture: true });
      hideBgLoading();
      return;
    }
    camera.addChild(model);
    // Keep camera child order: bg (0), model, fg (last) so fg draws in front.
    if (state.bgContainer && state.fgContainer) {
      camera.removeChild(state.fgContainer);
      camera.addChild(state.fgContainer);
    }
    model.interactive = false;
    model.position.set(0, 0);
    model.anchor?.set?.(0.5);
    state.model = model;
    fitModelToScreen();
    setBackground(state.currentBgList);
    buildOptionsPanel();
    applyEyeBlink();
    hookOverrideApply();
    els.status.textContent = '';
  } catch (e) {
    if (seq !== modelLoadSeq) { hideBgLoading(); return; }
    els.status.textContent = 'Failed: ' + e.message;
    console.error(e);
  }
  hideBgLoading();
}

function setActiveButton(activeBtn) {
  document.querySelectorAll('.character-variation_button.active, .character-name.active').forEach((b) => b.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');
}

// Section fold state (module-level so createCharactersList rebuilds keep it).
// true = folded; missing = folded (all sections start folded). Persisted in
// localStorage so the layout survives reloads.
const sectionFoldState = new Map();
const sectionFoldHeaders = [];
try {
  const saved = JSON.parse(localStorage.getItem('entitySectionsFold') || '[]');
  for (const [key, folded] of saved) sectionFoldState.set(key, !!folded);
} catch (e) { /* corrupt or missing — defaults */ }

function addListSection(title, key) {
  const li = document.createElement('li');
  li.className = 'entity-section';
  li.dataset.sectionKey = key || title;
  const caret = document.createElement('span');
  caret.className = 'entity-section_caret';
  li.appendChild(caret);
  li.appendChild(document.createTextNode(title));
  li.addEventListener('click', () => {
    setSectionFold(li, !isSectionFoldedNow(li));
  });
  els.list.appendChild(li);
  sectionFoldHeaders.push(li);
}

// Section entries are flat <li>s after the header; collect them until the
// next section header.
function sectionFollowers(headerEl) {
  const out = [];
  for (let el = headerEl.nextElementSibling;
       el && !el.classList.contains('entity-section');
       el = el.nextElementSibling) {
    out.push(el);
  }
  return out;
}

function isSectionFoldedNow(headerEl) {
  return headerEl.classList.contains('folded');
}

function setSectionFold(headerEl, folded) {
  sectionFoldState.set(headerEl.dataset.sectionKey, folded);
  try {
    localStorage.setItem('entitySectionsFold', JSON.stringify([...sectionFoldState]));
  } catch (e) { /* storage unavailable */ }
  headerEl.querySelector('.entity-section_caret').textContent = '\u25B8';
  headerEl.classList.toggle('folded', folded);
  for (const el of sectionFollowers(headerEl)) {
    el.style.display = folded ? 'none' : '';
  }
}

function addListItem(item) {
  const li = document.createElement('li');
  li.className = 'entity-block';
  const isDisc = item.kind === 'parallax' || item.kind === 'discl2d' || item.kind === 'event' || item.kind === 'other';

  const name = document.createElement('span');
  name.className = 'character-name' + (isDisc ? ' is-disc' : '');
  // Skin ids end in a 2-digit variant number (10301 -> char 103); plain
  // character ids (unreleased chars, e.g. 106 from an avg bundle) show as-is.
  const shownId = shownIdOf(item);
  const idSpan = document.createElement('span');
  idSpan.className = 'character-id';
  idSpan.textContent = shownId + ' ';
  name.appendChild(idSpan);
  name.appendChild(document.createTextNode(item.name === '#' + shownId ? '' : item.name));
  li.appendChild(name);
  let firstBtn = null;
  if (item.kind === 'parallax') {
    // Image-only parallax scene.
    name.addEventListener('click', () => {
      setActiveButton(name);
      loadParallax(item);
    });
  } else if (item.kind === 'discl2d' || item.kind === 'event' || item.kind === 'other') {
    // The disc's Live2D, an event Live2D, or a brute-forced Other Live2D
    const variant = item.variants[0];
    name.addEventListener('click', () => {
      setActiveButton(name);
      loadModel(resolveUrl(variant.path));
    });
  } else if (item.kind === 'avg') {
    // Story character (AVG dialogue sprite) — opens the body + face viewer.
    name.addEventListener('click', () => {
      setActiveButton(name);
      loadAvg(item);
    });
  } else {
    const variants = document.createElement('ul');
    variants.className = 'character-variation';
    variants.style.display = 'none';
    li.classList.add('collapsed');

    for (const variant of item.variants) {
      const li2 = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'character-variation_button' + (variant.label === 'Disc' ? ' is-disc' : '');
      btn.textContent = variant.label;
      btn.title = variant.path;
      btn.addEventListener('click', (e) => {
        setActiveButton(e.target);
        loadModel(resolveUrl(variant.path));
      });
      if (!firstBtn) firstBtn = btn;
      li2.appendChild(btn);
      variants.appendChild(li2);
    }
    li.appendChild(variants);

    name.addEventListener('click', () => {
      const opening = variants.style.display === 'none';
      if (!opening) {
        variants.style.display = 'none';
        li.classList.add('collapsed');
        return;
      }
      document.querySelectorAll('.entity-block').forEach((other) => {
        if (other === li) return;
        const v = other.querySelector('.character-variation');
        if (v && v.style.display !== 'none') {
          v.style.display = 'none';
          other.classList.add('collapsed');
        }
      });
      variants.style.display = '';
      li.classList.remove('collapsed');
      // Opening a character loads its first L2D by default.
      if (firstBtn) {
        setActiveButton(firstBtn);
        loadModel(resolveUrl(firstBtn.title));
      }
    });
  }
  els.list.appendChild(li);
}

// Id shown in the list: skin ids end in a 2-digit variant number, so the
// character group is the id minus those (10301 -> 103, 910201 -> 9102).
// Discs/Events drop their l2d/event suffix. Plain 3-digit character ids
// (unreleased chars from avg bundles, e.g. 106) are shown as-is.
function shownIdOf(item) {
  if (item.kind === 'avg') return item.shortId;
  const isDisc = item.kind === 'parallax' || item.kind === 'discl2d' || item.kind === 'event';
  if (item.kind === 'other') return item.id;
  if (isDisc) return item.id.replace(/l2d$/, '').replace(/event$/, '');
  return item.id.length <= 4 ? item.id : item.id.slice(0, -2);
}

// Two ids are always hidden in the background (no UI toggle).
const HIDDEN_PREFIXES = ['8133', '8134'];

function isHidden(item) {
  const shownId = shownIdOf(item);
  return HIDDEN_PREFIXES.some((t) => shownId.startsWith(t) || item.id.startsWith(t));
}

function matchesSearch(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (shownIdOf(item).toLowerCase().includes(q)) return true;
  if (item.id.toLowerCase().includes(q)) return true;
  if (item.shortId && item.shortId.toLowerCase().includes(q)) return true;
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.variants) {
    for (const v of item.variants) {
      if (v.label && v.label.toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

function createCharactersList() {
  const list = els.list;
  list.innerHTML = '';
  sectionFoldHeaders.length = 0;
  const isEventEntry = (item) => item.kind === 'event';
  const isParallaxEntry = (item) => item.kind === 'parallax';
  const isDiscL2dEntry = (item) => item.kind === 'discl2d';
  const isOtherEntry = (item) => item.kind === 'other';
  const query = els.filter.value.trim().toLowerCase();
  const visible = (item) => !isHidden(item) && matchesSearch(item, query);

  const chars = state.models.filter((item) => !isParallaxEntry(item) && !isDiscL2dEntry(item) && !isEventEntry(item) && !isOtherEntry(item) && visible(item));
  const events = state.models.filter((item) => isEventEntry(item) && visible(item));
  const discL2ds = state.models.filter((item) => isDiscL2dEntry(item) && visible(item)).reverse();
  const discs = state.models.filter((item) => isParallaxEntry(item) && visible(item)).reverse();
  const others = state.models.filter((item) => isOtherEntry(item) && visible(item));
  const avgs = state.avgModels.filter((item) => !isHidden(item) && matchesSearch(item, query));

  // Sections with no matches (e.g. Events (0)) are skipped entirely.
  if (chars.length) {
    addListSection('Trekkers (' + chars.length + ')', 'trekkers');
    for (const item of chars) addListItem(item);
  }

  if (events.length) {
    addListSection('Events (' + events.length + ')', 'events');
    for (const item of events) addListItem(item);
  }

  if (discL2ds.length) {
    addListSection('Disc L2D (' + discL2ds.length + ')', 'discl2d');
    for (const item of discL2ds) addListItem(item);
  }

  if (discs.length) {
    addListSection('Discs (' + discs.length + ')', 'discs');
    for (const item of discs) addListItem(item);
  }

  if (avgs.length) {
    addListSection('Story Characters (' + avgs.length + ')', 'avg');
    for (const item of avgs) addListItem(item);
  }

  if (others.length) {
    addListSection('Others (' + others.length + ')', 'others');
    for (const item of others) addListItem(item);
  }

  // Apply folding. All sections start folded (state persists across rebuilds);
  // while a search query is active every section is expanded so matches are
  // visible.
  const searching = !!query;
  for (const header of sectionFoldHeaders) {
    const key = header.dataset.sectionKey;
    const folded = searching ? false : sectionFoldState.get(key) !== false;
    setSectionFold(header, folded);
  }
}

function enableDrag() {
  const app = state.app;
  const camera = state.camera;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.renderer.screen;

  app.stage.on('pointerdown', (e) => {
    if (e.target !== app.stage) return;
    dragging = true;
    lastX = e.global.x;
    lastY = e.global.y;
    if (state.parallaxActive) {
      // LiveDiscCtrl pauses the sway tween and accumulates deltas on top of
      // the target's current position.
      state.parallaxDragging = true;
      state.parallaxDragAccX = state.parallaxTargetX;
      state.parallaxDragAccY = state.parallaxTargetY;
    }
  });
  app.stage.on('pointermove', (e) => {
    if (!dragging) return;
    if (state.parallaxActive) {
      // Parallax scene: accumulate raw pointer deltas onto the gyroscope
      // follow target, clamped to [-100,+100] like the game's drag.  Unity
      // EventData delta.y is y-up, so invert before applying as pitch.
      const tx = clampParallaxTarget(state.parallaxDragAccX + (e.global.x - lastX));
      const ty = clampParallaxTarget(state.parallaxDragAccY - (e.global.y - lastY));
      state.parallaxDragAccX = tx;
      state.parallaxDragAccY = ty;
      applyParallaxTarget(tx, ty);
    } else {
      camera.x += e.global.x - lastX;
      camera.y += e.global.y - lastY;
    }
    lastX = e.global.x;
    lastY = e.global.y;
  });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    if (state.parallaxActive) {
      // DragEnd snaps the follow target back to zero; the sway tween resumes.
      state.parallaxDragging = false;
      applyParallaxTarget(0, 0);
    }
  };
  app.stage.on('pointerup', stop);
  app.stage.on('pointerupoutside', stop);
}

function clampParallaxTarget(v) {
  // 'Enable Max Rotation' off removes the game's [-100,+100] target clamp so
  // the gyroscope rotation is unbounded while dragging.
  if (!state.parallaxMaxRotation) return v;
  return Math.max(-PARALLAX_TARGET_MAX, Math.min(PARALLAX_TARGET_MAX, v));
}

// Idle sway: LiveDiscCtrl tweens Gyroscope/Target along (-8,0)..(8,0), 8s per
// leg, Yoyo + InOutSine — a raised cosine between the two endpoints.  Paused
// while dragging, like the game pausing its tweener.
function parallaxSwayTick() {
  const app = state.app;
  if (!app || !state.parallaxActive || !state.parallaxScene) return;
  const p = state.parallaxScene.parallax;
  if (!p) return;
  if (state.parallaxDragging) return;
  state.parallaxSwayMs += app.ticker.deltaMS;
  const tx = -PARALLAX_SWAY_RANGE *
    Math.cos((Math.PI * state.parallaxSwayMs) / (PARALLAX_SWAY_HALF_S * 1000));
  applyParallaxTarget(tx, 0);
}

function enableZoom() {
  const app = state.app;
  const camera = state.camera;
  const MIN = 0.2;
  const MAX = 2.5;
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = 1 - e.deltaY * 0.001;
    const old = camera.scale.x;
    const next = Math.min(MAX, Math.max(MIN, old * factor));
    const actual = next / old;
    const dx = e.offsetX - camera.x;
    const dy = e.offsetY - camera.y;
    camera.scale.set(next, next);
    camera.x -= dx * (actual - 1);
    camera.y -= dy * (actual - 1);
  }, { passive: false });

  let lastDist = null;
  app.canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2) { lastDist = null; return; }
    e.preventDefault();
    const [t1, t2] = e.touches;
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    if (lastDist === null) { lastDist = dist; return; }
    const factor = dist / lastDist;
    const old = camera.scale.x;
    const next = Math.min(MAX, Math.max(MIN, old * factor));
    const actual = next / old;
    const mid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    camera.scale.set(next, next);
    camera.x -= (mid.x - camera.x) * (actual - 1);
    camera.y -= (mid.y - camera.y) * (actual - 1);
    lastDist = dist;
  }, { passive: false });
  app.canvas.addEventListener('touchend', () => { lastDist = null; });
}

function handleMenuState() {
  const bind = (openBtn, closeBtn, wrapper) => {
    openBtn.addEventListener('click', () => {
      wrapper.classList.add('open');
      openBtn.style.display = 'none';
    });
    closeBtn.addEventListener('click', () => {
      wrapper.classList.remove('open');
      openBtn.style.display = 'block';
    });
  };
  bind(els.openBtn, els.closeBtn, els.wrapper);
  bind(els.optionsOpen, els.optionsClose, els.optionsWrapper);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      els.wrapper.classList.remove('open');
      els.optionsWrapper.classList.remove('open');
      els.openBtn.style.display = 'block';
      els.optionsOpen.style.display = 'block';
    }
  });
}

function handleResize() {
  const app = state.app;
  const onResize = () => {
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    if (!w || !h) return;
    app.renderer.resize(w, h);
    if (state.model) {
      fitModelToScreen();
      fitBackground();
    } else if (state.avgItem) {
      fitAvgToScreen();
    } else if (state.parallaxItem) {
      loadParallax(state.parallaxItem);
    }
  };
  new ResizeObserver(onResize).observe(els.canvas);
  window.addEventListener('resize', onResize);
}

function handleContextLost() {
  const canvas = state.app.canvas;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    els.status.textContent = 'WebGL context lost - reloading ...';
    if (state.model) {
      clearBackground();
      state.model.destroy({ children: true, texture: true, baseTexture: true });
      state.model = null;
    }
    clearParallax();
    clearAvg();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // The Cubism renderer needs fresh GL objects after a restore; simply
    // re-create the current model (or parallax scene) from scratch.
    if (state.currentPath) {
      const p = state.currentPath;
      state.currentPath = null;
      if (p.endsWith('a') && state.avgItem) {
        setTimeout(() => loadAvg(state.avgItem), 100);
      } else if (p.endsWith('p') && state.parallaxItem) {
        setTimeout(() => loadParallax(state.parallaxItem), 100);
      } else {
        setTimeout(() => loadModel(p), 100);
      }
    } else {
      els.status.textContent = '';
    }
  });
}

function setupBackgroundPicker() {
  const renderer = () => state.app.renderer;
  const apply = (c) => {
    const num = parseInt(c.replace('#', ''), 16);
    renderer().background.color = num;
    els.bgcolor.style.background = c;
    els.bginput.value = c;
  };
  els.bgcolor.addEventListener('click', () => els.bginput.click());
  els.bginput.addEventListener('input', () => apply(els.bginput.value));
  els.bginput.addEventListener('change', () => apply(els.bginput.value));
  // default
  apply('#161616');
}

/* ---------------- Transparent screenshot ---------------- */

function sanitizeFileName(s) {
  return (s || '').trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
}

// Name for the downloaded file.  Prefer the active list button (combined
// with its parent character name), e.g. "103_Amber" / "103_Amber_Memory
// Snapshot" / "avg1_103 Amber" / disc titles; fall back to the tracked name
// (programmatic loads) or the current path id.
function currentShotName() {
  const btn = document.querySelector('.character-name.active, .character-variation_button.active');
  if (btn) {
    let label = sanitizeFileName(btn.textContent);
    if (btn.classList.contains('character-variation_button')) {
      const parent = btn.closest('.entity-block');
      const parentName = parent ? sanitizeFileName(parent.querySelector('.character-name').textContent) : '';
      if (label && label !== 'Default') {
        return [parentName, label].filter(Boolean).join('_') || 'transparent';
      }
      return parentName || 'transparent';
    }
    return label || 'transparent';
  }
  return sanitizeFileName(state.currentName || state.currentPath || 'transparent') || 'transparent';
}

// Capture the current view to a PNG Blob.  With `transparent`, scene/backdrop
// layers (customized_bg, in-model bg/fg_effect, disc card backdrops) are
// hidden and the renderer clears to alpha 0, so only the character (L2D rig,
// AVG sprite, or parallax card) remains.  Parallax cards keep their layers —
// the card art is the content and can't be split from the character.  Without
// `transparent`, the view is captured as-is (opaque page background).
async function captureScreenshotBlob(transparent) {
  const app = state.app;
  if (!app) return null;
  const renderer = app.renderer;
  const hidden = [];
  if (transparent) {
    for (const c of [state.bgContainer, state.fgContainer]) {
      if (c && c.visible && c.children.length) {
        c.visible = false;
        hidden.push(c);
      }
    }
  }
  const prevAlpha = renderer.background.alpha;
  if (transparent) renderer.background.alpha = 0;
  try {
    // Wait two frames so the hidden containers and alpha-0 clear take effect
    // in the render loop.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = renderer.extract.canvas(app.stage);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png');
    });
  } finally {
    renderer.background.alpha = prevAlpha;
    for (const c of hidden) c.visible = true;
  }
}

async function downloadScreenshot(transparent) {
  const app = state.app;
  if (!app) return;
  try {
    const blob = await captureScreenshotBlob(transparent);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentShotName() + (transparent ? '-transparent.png' : '.png');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    els.status.textContent = 'Saved ' + a.download;
    setTimeout(() => { if (els.status.textContent.startsWith('Saved ')) els.status.textContent = ''; }, 4000);
  } catch (e) {
    console.error('Screenshot failed', e);
    els.status.textContent = 'Screenshot failed';
  }
}

async function init() {
  const app = new Application();
  await app.init({
    resizeTo: els.canvas,
    preference: 'webgl',
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    antialias: true,
    background: 0x161616,
  });
  els.canvas.appendChild(app.canvas);
  state.app = app;

  const camera = new Container();
  app.stage.addChild(camera);
  state.camera = camera;
  createBackgroundContainer();

  const res = await fetch(resolveUrl('data/models.json'));
  state.models = await res.json();
  els.title.textContent = 'Stella Sora L2D (' + state.models.length + ' models)';
  try {
    const resAvg = await fetch(resolveUrl('data/avg.json'));
    if (resAvg.ok) {
      state.avgModels = (await resAvg.json()).map((e) => ({ ...e, kind: 'avg' }));
    }
  } catch (e) {
    console.warn('data/avg.json unavailable', e);
  }
  els.filter.addEventListener('input', createCharactersList);
  createCharactersList();

  handleResize();
  handleContextLost();
  enableDrag();
  enableZoom();
  app.ticker.add(parallaxSwayTick);
  handleMenuState();
  setupBackgroundPicker();
  if (els.transparentShot) els.transparentShot.addEventListener('click', () => downloadScreenshot(true));
  if (els.screenshot) els.screenshot.addEventListener('click', () => downloadScreenshot(false));

  if (state.models.length && state.models[0].variants.length) {
    state.currentName = state.models[0].name;
    loadModel(resolveUrl(state.models[0].variants[0].path));
  }
}

init();

// Exposed for headless testing / debugging — harmless in production.
window.__state = state;
