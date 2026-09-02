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
import { fileURLToPath } from 'node:url';

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

function resolveDatamineFile(explicitFile, datamineDir, langSubpath) {
  if (explicitFile && fs.existsSync(explicitFile)) return explicitFile;
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, '..');
  const dm = datamineDir || path.join(root, '../StellaSoraData Makostar');
  const cand = path.join(dm, langSubpath);
  if (fs.existsSync(cand)) return cand;
  return explicitFile;
}

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
        const files = fs.readdirSync(variantPath);
        // Prefer the variant-named model (fixes createplayer2_F/M sharing
        // the same source dir and previously being copied together)
        let modelFile = files.find((f) => f === `${variant}.model3.json`);
        if (!modelFile) modelFile = files.find((f) => f.endsWith('.model3.json'));
        if (!modelFile) continue;
        let label = getModelTypeLabel(modelFile);
        if (label === 'Unknown' && skinNames[variant]) label = skinNames[variant];
        if (label === 'Unknown') label = variant;
        characters.push({
          id: variant,
          name: variant,
          kind: 'other',
          variants: [{
            name: variant,
            label,
            path: `chars/${skinId}/${variant}/${modelFile}`,
            bg: getVariantBgs(variantPath),
            charBg: charBgOf(variant, label),
            offset: offsetOf(variant, label),
          }],
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

        const files = fs.readdirSync(variantPath);
        const modelFile = files.find((f) => f.endsWith('.model3.json'));
        if (!modelFile) continue;

        let label = getModelTypeLabel(modelFile);
        if (label === 'Unknown' && skinNames[skinId]) label = skinNames[skinId];
        entry.variants.push({
          name: variant,
          label,
          path: `chars/${skinId}/${variant}/${modelFile}`,
          bg: getVariantBgs(variantPath),
          charBg: charBgOf(skinId, label),
          offset: offsetOf(skinId, label),
        });
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

      const files = fs.readdirSync(variantPath);
      const modelFile = files.find((f) => f.endsWith('.model3.json'));
      if (!modelFile) continue;

      let label = getModelTypeLabel(modelFile);
      if (label === 'Unknown' && skinNames[skinId]) label = skinNames[skinId];
      entry.variants.push({
        name: variant,
        label,
        path: `chars/${skinId}/${variant}/${modelFile}`,
        bg: getVariantBgs(variantPath),
        charBg: charBgOf(skinId, label),
        offset: offsetOf(skinId, label),
      });
    }
  }

  const result = [...characters, ...discs];

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`Generated ${characters.length} characters + ${discs.length} discs, ${outFile}`);
}

main();
