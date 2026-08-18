#!/usr/bin/env node
/**
 * generateCharBg.mjs — build `data/charbg.json` from the game datamine.
 *
 * Each character skin's main-menu backdrop is the image at
 * `Image/CharBg/<CharacterSkin.Bg>.png` (Actor2DManager.GetActor2DParams draws
 * it on the customized_bg SpriteRenderer behind the L2D when the panel has
 * PreferActorBg, e.g. MainView).  This script turns the datamine's Bg field
 * into `{ <skinId>: <basename> }`, keeping only skins whose image is actually
 * staged in the site's `bg/charbg/` folder.
 *
 * Usage:
 *   node scripts/generateCharBg.mjs --skin <CharacterSkin.json> \
 *     [--bg <bg/charbg dir>] [--out <data/charbg.json>]
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
    skinFile: get('--skin', ''),
    bgDir: get('--bg', path.resolve('bg/charbg')),
    outFile: get('--out', path.resolve('data/charbg.json')),
  };
}

function main() {
  const { skinFile, bgDir, outFile } = parseArgs();
  if (!skinFile || !fs.existsSync(skinFile)) {
    console.error('CharacterSkin.json not found: ' + skinFile);
    process.exit(1);
  }

  const skins = JSON.parse(fs.readFileSync(skinFile, 'utf8'));
  const staged = new Set(
    fs.existsSync(bgDir)
      ? fs.readdirSync(bgDir).filter((f) => /\.png$/i.test(f))
      : [],
  );

  const result = {};
  for (const [skinId, row] of Object.entries(skins)) {
    const bg = (row.Bg || '').trim();
    if (!bg) continue;
    const name = path.basename(bg); // "Image/CharBg/ttc_parkbase_daylight" -> "ttc_parkbase_daylight"
    if (staged.has(name + '.png')) result[skinId] = name;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`Mapped ${Object.keys(result).length} skins to CharBg images -> ${outFile}`);
}

main();
