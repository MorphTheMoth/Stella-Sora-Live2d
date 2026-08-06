import { Application, Container, Sprite, Assets, extensions } from './pixi.min.mjs';
import { Live2DModel, Live2DPlugin, configureCubismSDK } from './cubism.es.js';

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
  bgTextures: [],
  currentBgKey: null,
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
  openBtn: document.getElementById('entity-list_open'),
  closeBtn: document.getElementById('entity-list_close'),
  wrapper: document.getElementById('entity-list_wrapper'),
  title: document.getElementById('page-title'),
  status: document.getElementById('status'),
  bgcolor: document.getElementById('bgcolor'),
  bginput: document.getElementById('bginput'),
  screenshot: document.getElementById('screenshot'),
  zoomreset: document.getElementById('zoomreset'),
  optionsOpen: document.getElementById('options_open'),
  optionsClose: document.getElementById('options_close'),
  optionsWrapper: document.getElementById('options_wrapper'),
  optionsContent: document.getElementById('options-content'),
};

const ANGLE_PARAMS = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ'];
const BODY_ANGLE_PARAMS = ['ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ'];

function fitModelToScreen() {
  const model = state.model;
  const app = state.app;
  const screenWidth = app.renderer.width;
  const screenHeight = app.renderer.height;
  const offset = 500;
  const bounds = model.getBounds();
  const modelWidth = Math.max(bounds.width, 1);
  const modelHeight = Math.max(bounds.height, 1) + offset;
  const scaleX = screenWidth / modelWidth;
  const scaleY = screenHeight / modelHeight;
  const scale = Math.min(scaleX, scaleY);
  model.scale.set(scale, scale);
  model.x = screenWidth / 2;
  model.y = screenHeight / 2;
  state.camera.x = 0;
  state.camera.y = 0;
  state.camera.scale.set(1);
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
  sprite.scale.set(
    model.scale.x * baseScale * (layer.sx || 1),
    model.scale.y * baseScale * (layer.sy || 1)
  );
  // Model-local offset from pivot (0,0 = canvas top-left, pivot = center).
  sprite.x = model.x + (layer.x || 0) * pxPerUnit * model.scale.x;
  sprite.y = model.y - (layer.y || 0) * pxPerUnit * model.scale.y;
}

// Re-apply transform of every bg layer after the model is fitted/rescaled.
function fitBackground() {
  const container = state.bgContainer;
  if (!container) return;
  for (const child of container.children) {
    if (child._bgLayer) fitBgLayer(child, child._bgLayer);
  }
}

function clearBackground() {
  const container = state.bgContainer;
  if (!container) return;
  // Detach all sprites first: destroying a texture still referenced by a
  // sprite makes the batch pipe flush a sprite whose _source is null.
  while (container.children.length) container.removeChildAt(0);
  for (const tex of state.bgTextures) {
    try {
      if (tex.key) Assets.cache.remove(tex.key);
    } catch (e) { /* ignore */ }
    try { tex.texture.destroy(true); } catch (e) { /* ignore */ }
  }
  state.bgTextures = [];
  state.currentBgKey = null;
}

// Render a background composed of one or more ordered layers (back-to-front).
async function setBackground(layers) {
  const container = state.bgContainer;
  clearBackground();
  if (!container || !layers || !layers.length) return;

  // Load all layer textures up-front, then attach in order so no frame ever
  // shows a partially-composed background.
  const loaded = [];
  for (const layer of layers) {
    const p = resolveUrl(layer.path);
    try {
      const texture = await Assets.load(p);
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
    container.addChild(sprite);
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
    core.setParameterValueById(id, value);
  } catch (e) {
    // parameter may not exist in this model; ignore
  }
}

function getParamValue(id) {
  const core = state.model.internalModel.coreModel;
  try {
    return core.getParameterValueById(id);
  } catch (e) {
    return 0;
  }
}

function clearOverride(id) {
  state.options.overrides.delete(id);
}

function getVariantInfo(path) {
  for (const item of state.models) {
    for (const variant of item.variants) {
      if (resolveUrl(variant.path) === resolveUrl(path)) return variant;
    }
  }
  return null;
}

function getVariantBgs(path) {
  const variant = getVariantInfo(path);
  if (!variant) return { layers: [], singles: [] };
  const skin = path.split('/')[1];
  const variantDir = path.split('/')[2];
  const bgPath = (f) => `chars/${skin}/${variantDir}/bg/${f}`;
  const layers = (variant.bgLayers || []).map((l) => ({ ...l, path: bgPath(l.file + '.png') }));
  const singles = (variant.bg || []).slice();
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
  for (const l of layers) addOption(l.file, l.file, l.path);
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

  groupSel.addEventListener('change', fillMotions);
  fillMotions();

  const btnRow = document.createElement('div');
  btnRow.className = 'opt-buttons';
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.textContent = 'Start';
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.textContent = 'Stop';

  startBtn.addEventListener('click', () => {
    const group = groupSel.value;
    const idx = parseInt(motionSel.value, 10);
    if (group == null || Number.isNaN(idx)) return;
    state.model.motion(group, idx, 3).then((ok) => {
      els.status.textContent = ok ? '' : 'Motion failed to start';
    });
  });
  stopBtn.addEventListener('click', () => {
    state.model.stopMotions();
  });

  btnRow.appendChild(startBtn);
  btnRow.appendChild(stopBtn);
  section.appendChild(btnRow);
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
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = state.options.overrides.has(p.id);
    const lab = document.createElement('label');
    lab.textContent = p.id;
    lab.title = p.id;
    head.appendChild(check);
    head.appendChild(lab);
    wrap.appendChild(head);

    const sliderRow = document.createElement('div');
    sliderRow.className = 'opt-param-slider';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = p.min;
    slider.max = p.max;
    slider.step = Math.max((p.max - p.min) / 1000, 0.01);
    slider.value = getParamValue(p.id);
    const value = document.createElement('span');
    value.className = 'opt-value';
    const initVal = getParamValue(p.id);
    slider.value = initVal;
    value.textContent = Number(initVal).toFixed(2);
    slider.disabled = !check.checked;

    const syncValue = () => {
      const v = parseFloat(slider.value);
      value.textContent = v.toFixed(2);
      if (check.checked) setParam(p.id, v);
    };
    slider.addEventListener('input', syncValue);
    check.addEventListener('change', () => {
      slider.disabled = !check.checked;
      if (check.checked) {
        setParam(p.id, parseFloat(slider.value));
      } else {
        clearOverride(p.id);
        slider.value = getParamValue(p.id);
        value.textContent = slider.value.toFixed(2);
      }
    });

    sliderRow.appendChild(slider);
    sliderRow.appendChild(value);
    wrap.appendChild(sliderRow);
    section.appendChild(wrap);
  }
}

function buildOptionsPanel() {
  clearElement(els.optionsContent);

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

  const exprSection = addSection('Expressions');
  addExpressionControls(exprSection);

  const blinkSection = addSection('Auto Blink');
  addEyeBlinkControl(blinkSection);

  const bgSection = addSection('Background');
  addBackgroundControls(bgSection);

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
        internal.coreModel.setParameterValueById(p.id, p.max);
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
    core.setParameterValueById('ParamAngleX', a.x * 30);
    core.setParameterValueById('ParamAngleY', a.y * 30);
    core.setParameterValueById('ParamAngleZ', a.z * 30);
    core.setParameterValueById('ParamBodyAngleX', b.x * 10);
    core.setParameterValueById('ParamBodyAngleY', b.y * 10);
    core.setParameterValueById('ParamBodyAngleZ', b.z * 10);
  } catch (e) {
    // some models lack body angle params; ignore
  }
  for (const [id, value] of o.overrides) {
    try {
      core.setParameterValueById(id, value);
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
  const currentModel = state.model;

  state.currentPath = path;
  const { layers } = getVariantBgs(path);
  state.currentBgList = layers;
  state.options.overrides.clear();
  state.options.angles = { x: 0, y: 0, z: 0 };
  state.options.bodyAngles = { x: 0, y: 0, z: 0 };

  if (currentModel) {
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
    camera.addChild(model);
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
    els.status.textContent = 'Failed: ' + e.message;
    console.error(e);
  }
}

function setActiveButton(activeBtn) {
  document.querySelectorAll('.character-variation_button.active').forEach((b) => b.classList.remove('active'));
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

  const name = document.createElement('span');
  name.className = 'character-name';
  name.textContent = item.name;
  name.addEventListener('click', () => {
    const variants = li.querySelector('.character-variation');
    const collapsed = variants.style.display === 'none';
    variants.style.display = collapsed ? '' : 'none';
    li.classList.toggle('collapsed', !collapsed);
  });
  li.appendChild(name);

  const variants = document.createElement('ul');
  variants.className = 'character-variation';

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
    li2.appendChild(btn);
    variants.appendChild(li2);
  }
  li.appendChild(variants);
  els.list.appendChild(li);
}

function createCharactersList() {
  const list = els.list;
  list.innerHTML = '';
  const isDisc = (item) => /^\d{4}$/.test(item.id);

  const chars = state.models.filter((item) => !isDisc(item));
  const discs = state.models.filter((item) => isDisc(item));

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

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.renderer.screen;

  app.stage.on('pointerdown', (e) => {
    if (e.target !== app.stage) return;
    dragging = true;
    lastX = e.global.x;
    lastY = e.global.y;
  });
  app.stage.on('pointermove', (e) => {
    if (!dragging) return;
    camera.x += e.global.x - lastX;
    camera.y += e.global.y - lastY;
    lastX = e.global.x;
    lastY = e.global.y;
  });
  const stop = () => { dragging = false; };
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
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // The Cubism renderer needs fresh GL objects after a restore; simply
    // re-create the current model from scratch.
    if (state.currentPath) {
      const p = state.currentPath;
      state.currentPath = null;
      setTimeout(() => loadModel(p), 100);
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
  // preset swatches
  document.querySelectorAll('.bg-swatch').forEach((s) => {
    s.addEventListener('click', () => apply(s.dataset.color));
  });
}

function setupScreenshot() {
  els.screenshot.addEventListener('click', () => {
    const canvas = state.app.canvas;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.download = 'stella-sora-live2d.png';
    a.href = url;
    a.click();
  });
}

function setupZoomReset() {
  els.zoomreset.addEventListener('click', () => {
    if (state.model) fitModelToScreen();
  });
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
  createCharactersList();

  handleResize();
  handleContextLost();
  enableDrag();
  enableZoom();
  handleMenuState();
  setupBackgroundPicker();
  setupScreenshot();
  setupZoomReset();

  if (state.models.length && state.models[0].variants.length) {
    loadModel(resolveUrl(state.models[0].variants[0].path));
  }
}

init();
