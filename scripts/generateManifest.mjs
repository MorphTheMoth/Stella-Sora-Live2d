#!/usr/bin/env node
/**
 * generateManifest.mjs — scan the `chars/` folder and produce `data/models.json`.
 *
 * Output format:
 *   [ { id, name, variants: [ { name, label, path } ] } ]
 *
 * Character names come from a name map file if provided
 * (data/characterid.json), else fall back to the numeric id.
 *
 * Usage:
 *   node scripts/generateManifest.mjs --chars <chars dir> --out <models.json>
 *     [--names <characterid.json>] [--charbg <charbg.json>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { writeTextIfChanged } from './io.mjs';
import { resolveDatamineFile } from './datamine.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    charsDir: get('--chars', path.resolve('chars')),
    outFile: get('--out', path.resolve('data/models.json')),
    namesFile: get('--names', path.resolve('data/characterid.json')),
    discNamesFile: get('--disc-names', path.resolve('data/discid.json')),
    charBgFile: get('--charbg', path.resolve('data/charbg.json')),
    offsetFile: get('--offset', path.resolve('data/offset.json')),
    boardNpcFile: get('--board-npc', ''),
    skinNamesFile: get('--skin-names', ''),
    datamineDir: get('--datamine', ''),
  };
}

// resolveDatamineFile (./datamine.mjs) probes the ss-data clone first, then
// the old combined datamine root (`StellaSoraData Makostar`).

// BoardNPC.json (datamine language table) names NPCs that characterid.json
// doesn't cover.  Each key is "BoardNPC.<id>.<n>", where n=1 holds the NPC
// name and n=2 a board/role label; <id> is the NPC's 4-digit id (or a
// skin-level id).  Build <id> -> name for the n=1 entries only.
function loadBoardNpcNames(file) {
  if (!file || !fs.existsSync(file)) return {};
  const names = {};
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of Object.keys(data)) {
    const m = key.match(/^BoardNPC\.(\d+)\.1$/);
    if (m) names[m[1]] = data[key];
  }
  return names;
}

// CharacterSkin.json (datamine language table) names each character skin
// ("CharacterSkin.<skinId>.1").  Used to label the extra skin variants that
// don't fit the Default/Awakened/Talent/Memory-Snapshot pattern (currently
// shown as "Unknown"), e.g. 14403 -> "When Morning Glories Bloom, Her Eyes Open".
function loadSkinNames(file) {
  if (!file || !fs.existsSync(file)) return {};
  const names = {};
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of Object.keys(data)) {
    const m = key.match(/^CharacterSkin\.(\d+)\.1$/);
    if (m) names[m[1]] = data[key];
  }
  return names;
}

// The game draws the per-character main-menu backdrop (Image/CharBg/<name>.png)
// on the customized_bg SpriteRenderer behind every non-FullScreen L2D.  Memory
// The game draws the per-character main-menu backdrop (Image/CharBg/<name>.png)
// on the customized_bg SpriteRenderer behind the half-body L2D (Normal type).
// Only the Default and Awakened variants are half-body displays; Memory
// Snapshot (FullScreen) ships its own ----bg---- scene and Talent has its own
// panel backdrop, so neither gets the CharBg.
const CHAR_BG_LABELS = new Set(['Default', 'Awakened']);
const CHAR_BG_PREFIX = 'bg/charbg/';

function getModelTypeLabel(modelFile) {
  // Label from chars [4,7)
  // e.g. "10301_L.model3.json" -> "1_L" -> Default
  //      "10301_F_a.model3.json" -> "1_F" -> Memory Snapshot
  //      "10301_T.model3.json" -> "1_T" -> Talent
  //      "10302_L.model3.json" -> "2_L" -> Awakened
  //      "4004_F.model3.json" -> Disc (4-digit id)
  if (/^\d{4}_/.test(modelFile)) return 'Disc';
  const key = modelFile.slice(4, 7);
  switch (key) {
    case '1_L':
      return 'Default';
    case '1_F':
      return 'Memory Snapshot';
    case '1_T':
      return 'Talent';
    case '2_L':
      return 'Awakened';
    default:
      return 'Unknown';
  }
}

// In-bundle l2d scene backgrounds were extracted into `bg/` inside each
// variant folder.  Sorted by name so the primary BG (usually *_BG_001)
// comes first.
function getVariantBgs(variantPath) {
  const bgDir = path.join(variantPath, 'bg');
  if (!fs.existsSync(bgDir)) return [];
  const skinId = path.basename(path.dirname(variantPath));
  const variant = path.basename(variantPath);
  return fs
    .readdirSync(bgDir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort()
    .map((f) => `chars/${skinId}/${variant}/bg/${f}`);
}

// A variant can hold more than one Cubism model: the game's L2D prefabs carry
// the character plus the scene/props it poses with under
// `----live2d_modle----` (10303_L_a = character, 10303_L_b = cat + lantern
// scene; 11901_F_a/_b/_c = character + cake + props).  normalize.py nests each
// of those in its own folder so their textures/motions don't collide, so look
// for model3.json files at any depth instead of only directly in the variant.
function findModelFiles(variantPath) {
  const out = [];
  const walk = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        // bg/ holds the composed sprite textures, never a model
        if (ent.name === 'bg') continue;
        walk(path.join(dir, ent.name), relPath);
      } else if (ent.name.endsWith('.model3.json')) {
        out.push(relPath);
      }
    }
  };
  walk(variantPath, '');
  // Shallowest first, then alphabetical: the flat single-model layout wins and
  // among nested models <id>_a comes before _b / _c (which is also the
  // character-first order the game uses).
  out.sort((a, b) => (a.split('/').length - b.split('/').length) || a.localeCompare(b));
  return out;
}

// Draw order fallback for a variant's extra models: the game's prefabs keep
// the character at sorting order 0 and put every additional model 500 lower
// (10303_L_b = -500, 11901_F_c = -1000), i.e. the scene models draw *behind*
// the character even though they come later in the hierarchy.  mergeBgLayers
// later replaces this with the serialized MeshRenderer order when the bundle
// dump is available.
function modelFallbackOrder(file) {
  const m = /_([a-z])\.model3\.json$/.exec(file);
  if (!m) return 0;
  return -500 * (m[1].charCodeAt(0) - 'a'.charCodeAt(0));
}

// Resolve a variant's primary model (the one the viewer opens, unmodified for
// single-model variants) and, when the variant has several, the full
// back-to-front model list.
function resolveModels(skinId, variant, variantPath, preferName) {
  const files = findModelFiles(variantPath);
  if (!files.length) return null;
  let primary = preferName
    ? files.find((f) => path.basename(f) === `${preferName}.model3.json`)
    : null;
  if (!primary) primary = files[0];
  const models = files
    .map((f) => ({
      path: `chars/${skinId}/${variant}/${f}`,
      x: 0,
      y: 0,
      sx: 1,
      sy: 1,
      order: modelFallbackOrder(f),
    }))
    .sort((a, b) => a.order - b.order);
  return { path: `chars/${skinId}/${variant}/${primary}`, models };
}

function main() {
  const { charsDir, outFile, namesFile, discNamesFile, charBgFile, offsetFile, boardNpcFile, skinNamesFile, datamineDir } = parseArgs();
  const resolvedBoardNpc = resolveDatamineFile(boardNpcFile, datamineDir, 'EN/language/en_US/BoardNPC.json');
  const resolvedSkinNames = resolveDatamineFile(skinNamesFile, datamineDir, 'EN/language/en_US/CharacterSkin.json');
  const names = {};
  if (fs.existsSync(namesFile)) {
    Object.assign(names, JSON.parse(fs.readFileSync(namesFile, 'utf8')));
  }
  const boardNpc = loadBoardNpcNames(resolvedBoardNpc);
  const skinNames = loadSkinNames(resolvedSkinNames);
  const discNames = {};
  if (fs.existsSync(discNamesFile)) {
    Object.assign(discNames, JSON.parse(fs.readFileSync(discNamesFile, 'utf8')));
  }
  const charBg = {};
  if (fs.existsSync(charBgFile)) {
    Object.assign(charBg, JSON.parse(fs.readFileSync(charBgFile, 'utf8')));
  }
  const charBgOf = (skinId, label) =>
    charBg[skinId] && CHAR_BG_LABELS.has(label)
      ? CHAR_BG_PREFIX + charBg[skinId] + '.png'
      : undefined;
  const offset = {};
  if (fs.existsSync(offsetFile)) {
    Object.assign(offset, JSON.parse(fs.readFileSync(offsetFile, 'utf8')));
  }
  const offsetOf = (skinId, label) =>
    offset[skinId] && CHAR_BG_LABELS.has(label) ? offset[skinId] : undefined;

  const characters = [];
  const seen = new Map(); // charId (3 digits) -> index in characters
  const discs = [];
  const seenDiscs = new Map(); // discId (4 digits) -> index in discs

  if (!fs.existsSync(charsDir)) {
    console.error(`chars dir not found: ${charsDir}`);
    process.exit(1);
  }

  for (const skinId of fs.readdirSync(charsDir).sort()) {
    const skinPath = path.join(charsDir, skinId);
    if (!fs.statSync(skinPath).isDirectory()) continue;
    // Ignore stray common assets folder (rare_outfit_*.png)
    if (skinId === 'common') continue;

    // Brute-forced bucket for Live2D not yet in site (e.g. avg3_100_a) - flat like Disc L2D: one entry per variant
    if (skinId === 'others') {
      for (const variant of fs.readdirSync(skinPath).sort()) {
        const variantPath = path.join(skinPath, variant);
        if (!fs.statSync(variantPath).isDirectory()) continue;
        // Prefer the variant-named model (fixes createplayer2_F/M sharing
        // the same source dir and previously being copied together)
        const resolved = resolveModels(skinId, variant, variantPath, variant);
        if (!resolved) continue;
        const modelFile = path.basename(resolved.path);
        let label = getModelTypeLabel(modelFile);
        if (label === 'Unknown' && skinNames[variant]) label = skinNames[variant];
        if (label === 'Unknown') label = variant;
        const v = {
          name: variant,
          label,
          path: resolved.path,
        };
        if (resolved.models.length > 1) v.models = resolved.models;
        v.bg = getVariantBgs(variantPath);
        v.charBg = charBgOf(variant, label);
        v.offset = offsetOf(variant, label);
        characters.push({
          id: variant,
          name: variant,
          kind: 'other',
          variants: [v],
        });
      }
      continue;
    }

    const isDisc = /^\d{4}$/.test(skinId);

    if (isDisc) {
      let idx = seenDiscs.get(skinId);
      if (idx === undefined) {
        const name = discNames[skinId] || `Disc ${skinId}`;
        idx = discs.length;
        seenDiscs.set(skinId, idx);
        discs.push({ id: skinId, name, variants: [] });
      }
      const entry = discs[idx];

      for (const variant of fs.readdirSync(skinPath).sort()) {
        const variantPath = path.join(skinPath, variant);
        if (!fs.statSync(variantPath).isDirectory()) continue;

        const resolved = resolveModels(skinId, variant, variantPath);
        if (!resolved) continue;
        const modelFile = path.basename(resolved.path);

        let label = getModelTypeLabel(modelFile);
        if (label === 'Unknown' && skinNames[skinId]) label = skinNames[skinId];
        const v = {
          name: variant,
          label,
          path: resolved.path,
        };
        if (resolved.models.length > 1) v.models = resolved.models;
        v.bg = getVariantBgs(variantPath);
        v.charBg = charBgOf(skinId, label);
        v.offset = offsetOf(skinId, label);
        entry.variants.push(v);
      }
      continue;
    }

    // 5-digit skin ids: char (3) + skin variant (2).  6-digit ids are NPC
    // skins: npc (4) + skin variant (2) — grouping by 3 digits would wrongly
    // merge distinct NPCs that share a 3-digit prefix (e.g. 813301/813401).
    const charId = skinId.length >= 6 ? skinId.slice(0, 4) : skinId.slice(0, 3);
    let idx = seen.get(charId);
    if (idx === undefined) {
      const name = names[charId] || boardNpc[skinId] || boardNpc[charId] || `#${charId}`;
      idx = characters.length;
      seen.set(charId, idx);
      characters.push({ id: skinId, name, variants: [] });
    }
    const entry = characters[idx];

    for (const variant of fs.readdirSync(skinPath).sort()) {
      const variantPath = path.join(skinPath, variant);
      if (!fs.statSync(variantPath).isDirectory()) continue;

      const resolved = resolveModels(skinId, variant, variantPath);
      if (!resolved) continue;
      const modelFile = path.basename(resolved.path);

      let label = getModelTypeLabel(modelFile);
      if (label === 'Unknown' && skinNames[skinId]) label = skinNames[skinId];
      const v = {
        name: variant,
        label,
        path: resolved.path,
      };
      if (resolved.models.length > 1) v.models = resolved.models;
      v.bg = getVariantBgs(variantPath);
      v.charBg = charBgOf(skinId, label);
      v.offset = offsetOf(skinId, label);
      entry.variants.push(v);
    }
  }

  const result = [...characters, ...discs];

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  writeTextIfChanged(outFile, JSON.stringify(result, null, 2));
  console.log(`Generated ${characters.length} characters + ${discs.length} discs, ${outFile}`);
}

main();
