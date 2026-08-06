#!/usr/bin/env node
/**
 * generateManifest.mjs — scan the `chars/` folder and produce `data/models.json`.
 *
 * Output format (matches tyrant-viewer):
 *   [ { id, name, variants: [ { name, label, path } ] } ]
 *
 * Character names come from a name map file if provided
 * (data/characterid.json), else fall back to the numeric id.
 *
 * Usage:
 *   node scripts/generateManifest.mjs --chars <chars dir> --out <models.json>
 *     [--names <characterid.json>]
 */

import fs from 'node:fs';
import path from 'node:path';

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
  };
}

function getModelTypeLabel(modelFile) {
  // Mirrors tyrant-viewer generateModels.ts: label from chars [4,7)
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
      return 'Unknow';
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
  const { charsDir, outFile, namesFile, discNamesFile } = parseArgs();
  const names = {};
  if (fs.existsSync(namesFile)) {
    Object.assign(names, JSON.parse(fs.readFileSync(namesFile, 'utf8')));
  }
  const discNames = {};
  if (fs.existsSync(discNamesFile)) {
    Object.assign(discNames, JSON.parse(fs.readFileSync(discNamesFile, 'utf8')));
  }

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

        entry.variants.push({
          name: variant,
          label: getModelTypeLabel(modelFile),
          path: `chars/${skinId}/${variant}/${modelFile}`,
          bg: getVariantBgs(variantPath),
        });
      }
      continue;
    }

    const charId = skinId.slice(0, 3);
    let idx = seen.get(charId);
    if (idx === undefined) {
      const name = names[charId] || `#${charId}`;
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

      entry.variants.push({
        name: variant,
        label: getModelTypeLabel(modelFile),
        path: `chars/${skinId}/${variant}/${modelFile}`,
        bg: getVariantBgs(variantPath),
      });
    }
  }

  const result = [...characters, ...discs];

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`Generated ${characters.length} characters + ${discs.length} discs, ${outFile}`);
}

main();
