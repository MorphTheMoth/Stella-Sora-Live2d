import { Application, Container, Sprite, Assets, extensions } from './pixi.min.mjs';
import { Live2DModel, Live2DPlugin, configureCubismSDK, CubismFramework } from './cubism.es.js';

extensions.add(Live2DPlugin);

// The default 16MB Cubism work buffer is too small for the biggest
// Memory Snapshot models (e.g. 16001_F_a is a 3MB moc3) and causes the
// Cubism Core to assert + drop the WebGL context on weaker GPUs.
configureCubismSDK({ memorySizeMB: 64 });

function resolveUrl(p) {
  return p.replace(/^\/+/, '');
}

const state = {
  app: null,
  camera: null,
  model: null,
  models: [],
  currentPath: null,
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
  // Where the rig canvas (the customized_bg backdrop / camera view) sits on
  // screen.  The character is placed relative to it via its MainView offset,
  // exactly like the game parents the L2D under actor_offset inside the rig.
  canvasX: 0,
  canvasY: 0,
  canvasScale: 1,
  options: {
    eyeBlink: true,
    angles: { x: 0, y: 0, z: 0 },
    bodyAngles: { x: 0, y: 0, z: 0 },
    overrides: new Map(),
  },
};

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
  if (!container || !layers || !layers.length) return;

  // Load all layer textures up-front, then attach in order so no frame ever
  // shows a partially-composed background.
  const loaded = [];
  for (const layer of layers) {
    if (seq !== bgLoadSeq) return;
    const p = resolveUrl(layer.path);
    try {
      const texture = await Assets.load(p);
      if (seq !== bgLoadSeq) return;
      loaded.push({ layer, texture });
    } catch (e) {
      console.error('Failed to load background layer', p, e);
    }
  }
  if (!loaded.length) return;

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
  state.parallaxLayers = [];
  state.parallaxActive = false;
  state.parallaxItem = null;
  state.parallaxScene = null;
  state.parallaxFit = 1;
}

// Render a parallax scene centred on the screen, fitted to the mask window.
async function loadParallax(item) {
  const seq = ++modelLoadSeq;
  resetCamera();
  state.currentPath = item.id + 'p';

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
  clearElement(els.optionsContent);
  els.status.textContent = 'Loading ' + item.name + ' ...';
  await new Promise((r) => requestAnimationFrame(r));
  if (seq !== modelLoadSeq) return;

  const scene = item.parallax || {};
  const layers = scene.layers || [];
  if (!layers.length) { els.status.textContent = ''; return; }
  state.parallaxItem = item;
  state.parallaxScene = scene;

  // Fit the mask window (or the whole canvas for discs without one) to the
  // screen; the mask window is centred on the canvas, so the screen edge
  // already clips the overlay spill-over exactly like the game's Mask.
  const canvasW = scene.canvasW || 1080;
  const canvasH = scene.canvasH || 1080;
  const mask = scene.mask || null;
  const fitW = mask ? mask.w : canvasW;
  const fitH = mask ? mask.h : canvasH;
  const screenW = state.app.renderer.width;
  const screenH = state.app.renderer.height;
  const fit = Math.min(screenW / fitW, screenH / fitH);

  const container = state.parallaxContainer;
  container.position.set(screenW / 2, screenH / 2);
  container.visible = true;
  state.parallaxFit = fit;

  const loaded = [];
  for (const l of layers) {
    if (seq !== modelLoadSeq) return;
    try {
      const texture = await Assets.load(resolveUrl(l.path));
      if (seq !== modelLoadSeq) return;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.eventMode = 'none';
      sprite.interactive = false;
      // Texture is stretched to the layer's display size (canvas px) * fit.
      sprite.scale.set((fit * l.w) / texture.width, (fit * l.h) / texture.height);
      sprite.x = l.x * fit;
      sprite.y = l.y * fit;
      container.addChild(sprite);
      loaded.push({ sprite, baseX: sprite.x, baseY: sprite.y, depth: l.depth || 0 });
    } catch (e) {
      console.error('Failed to load parallax layer', l.path, e);
    }
  }
  state.parallaxLayers = loaded;
  state.parallaxActive = true;
  els.status.textContent = '';
}

// Shift each parallax layer by its depth relative to a drag delta (in screen
// px), scaled by the scene's gyroscope factors so the overlay group slides as
// a unit.  depth 0 layers (the base) stay put.
function applyParallaxOffset(dx, dy) {
  if (!state.parallaxActive) return;
  const p = (state.parallaxScene && state.parallaxScene.parallax) || { ax: 5, ay: -25 };
  const ax = p.ax || 0;
  const ay = p.ay || 0;
  const screenW = state.app.renderer.width;
  const screenH = state.app.renderer.height;
  const fit = state.parallaxFit || 1;
  // Normalise the drag to the full screen; the game's gyroscope offset is tiny
  // (ax/ay canvas px), so amplify it ~3x for a visible tilt in the viewer.
  const nx = dx / Math.max(screenW, 1);
  const ny = dy / Math.max(screenH, 1);
  const amp = 3;
  for (const pl of state.parallaxLayers) {
    pl.sprite.x = pl.baseX + nx * ax * fit * amp * pl.depth;
    pl.sprite.y = pl.baseY + ny * ay * fit * amp * pl.depth;
  }
}

function resetParallax() {
  if (!state.parallaxActive) return;
  for (const pl of state.parallaxLayers) {
    pl.sprite.x = pl.baseX;
    pl.sprite.y = pl.baseY;
  }
}

function getVariantBgs(path) {
  const variant = getVariantInfo(path);
  if (!variant) return { layers: [], singles: [] };
  const skin = path.split('/')[1];
  const variantDir = path.split('/')[2];
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
  if (groups.includes('idle')) groupSel.value = 'idle';
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

  if (!state.model) {
    const section = addSection('Disc');
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.textContent = 'Parallax scene — drag to shift layers.';
    row.style.color = 'var(--text-faint)';
    row.style.fontSize = '11px';
    section.appendChild(row);
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

  if (state.model) {
    const currentModel = state.model;
    if (state._overrideHandler && currentModel.internalModel) {
      currentModel.internalModel.off('beforeModelUpdate', state._overrideHandler);
    }
    state._overrideHandler = null;
    clearBackground();
    camera.removeChild(currentModel);
    currentModel.destroy({ children: true, texture: true, baseTexture: true });
    state.model = null;
  }

  els.status.textContent = 'Loading ' + path.split('/').slice(-2).join('/') + ' ...';
  await new Promise((r) => requestAnimationFrame(r));

  try {
    const model = await Live2DModel.from(path);
    // A newer entry was clicked while this one was loading; drop it so stale
    // loads don't stack every previously clicked model on the scene.
    if (seq !== modelLoadSeq) {
      model.destroy({ children: true, texture: true, baseTexture: true });
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
    if (seq !== modelLoadSeq) return;
    els.status.textContent = 'Failed: ' + e.message;
    console.error(e);
  }
}

function setActiveButton(activeBtn) {
  document.querySelectorAll('.character-variation_button.active, .character-name.active').forEach((b) => b.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');
}

function addListSection(title) {
  const li = document.createElement('li');
  li.className = 'entity-section';
  li.textContent = title;
  els.list.appendChild(li);
}

function addListItem(item) {
  const li = document.createElement('li');
  li.className = 'entity-block';
  const isDisc = item.kind === 'parallax' || item.kind === 'discl2d';

  const name = document.createElement('span');
  name.className = 'character-name' + (isDisc ? ' is-disc' : '');
  const shownId = isDisc ? item.id.replace(/l2d$/, '') : item.id.slice(0, -2);
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
  } else if (item.kind === 'discl2d') {
    // The disc's Live2D, as a separate entry.
    const variant = item.variants[0];
    name.addEventListener('click', () => {
      setActiveButton(name);
      loadModel(resolveUrl(variant.path));
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
      // Keep the clicked name in place: record its position inside the
      // scrollable content before the DOM changes, then restore that same
      // visual position afterwards (content above shrinks as others fold).
      const scrollEl = li.closest('.panel-body');
      const contentPos = () =>
        name.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
      const posBefore = contentPos();
      const scrollTopBefore = scrollEl.scrollTop;
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
      scrollEl.scrollTop = scrollTopBefore + contentPos() - posBefore;
      // Opening a character loads its first L2D by default.
      if (firstBtn) {
        setActiveButton(firstBtn);
        loadModel(resolveUrl(firstBtn.title));
      }
    });
  }
  els.list.appendChild(li);
}

// Entries whose shown id (group id, last 2 digits cut for chars/NPCs) starts
// with any hide-token are filtered out of the list.
function getHideTokens() {
  return els.filter.value.trim().split(/[\s,]+/).filter(Boolean);
}

function isHidden(item, tokens) {
  if (!tokens.length) return false;
  const isDisc = item.kind === 'parallax' || item.kind === 'discl2d';
  const shownId = isDisc ? item.id.replace(/l2d$/, '') : item.id.slice(0, -2);
  return tokens.some((t) => shownId.startsWith(t));
}

function createCharactersList() {
  const list = els.list;
  list.innerHTML = '';
  const isDiscEntry = (item) => item.kind === 'parallax' || item.kind === 'discl2d';
  const tokens = getHideTokens();

  const chars = state.models.filter((item) => !isDiscEntry(item) && !isHidden(item, tokens));
  const discs = state.models.filter((item) => isDiscEntry(item) && !isHidden(item, tokens));

  addListSection('Trekkers (' + chars.length + ')');
  for (const item of chars) addListItem(item);

  if (discs.length) {
    addListSection('Discs (' + discs.length + ')');
    for (const item of discs) addListItem(item);
  }
}

function enableDrag() {
  const app = state.app;
  const camera = state.camera;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.renderer.screen;

  app.stage.on('pointerdown', (e) => {
    if (e.target !== app.stage) return;
    dragging = true;
    lastX = e.global.x;
    lastY = e.global.y;
    startX = e.global.x;
    startY = e.global.y;
  });
  app.stage.on('pointermove', (e) => {
    if (!dragging) return;
    if (state.parallaxActive) {
      // Parallax scene: shift each layer by its depth relative to drag start.
      applyParallaxOffset(e.global.x - startX, e.global.y - startY);
    } else {
      camera.x += e.global.x - lastX;
      camera.y += e.global.y - lastY;
      lastX = e.global.x;
      lastY = e.global.y;
    }
  });
  const stop = () => {
    dragging = false;
    resetParallax();
  };
  app.stage.on('pointerup', stop);
  app.stage.on('pointerupoutside', stop);
}

function enableZoom() {
  const app = state.app;
  const camera = state.camera;
  const MIN = 0.2;
  const MAX = 5;
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
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // The Cubism renderer needs fresh GL objects after a restore; simply
    // re-create the current model (or parallax scene) from scratch.
    if (state.currentPath) {
      const p = state.currentPath;
      state.currentPath = null;
      if (p.endsWith('p') && state.parallaxItem) {
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
  els.title.textContent = 'Stella Sora L2D (' + state.models.length + ' trekkers)';
  els.filter.addEventListener('input', createCharactersList);
  createCharactersList();

  handleResize();
  handleContextLost();
  enableDrag();
  enableZoom();
  handleMenuState();
  setupBackgroundPicker();

  if (state.models.length && state.models[0].variants.length) {
    loadModel(resolveUrl(state.models[0].variants[0].path));
  }
}

init();
