#!/usr/bin/env node
/**
 * generateOffset.mjs — build `data/offset.json` from extracted Actor2DOffsetData
 * assets.
 *
 * The game positions each L2D in the main menu via CharacterSkin.Offset
 * (`Actor2D/Character/<skinId>/<skinId>.asset`, an Actor2DOffsetData
 * ScriptableObject shipped in the `char_2d_<skinId>.unity3d` bundles).  The
 * MainView row (nPanelId == 10) carries two offset sets: Set 1 (identity,
 * used by the FullScreen display) and Set 2 (the Normal/half-body framing: a
 * downward shift + slight scale).  We keep Set 2 as `{ s, x, y }` per skin.
 *
 * Usage:
 *   node scripts/generateOffset.mjs --src <dir of <skinId>/<skinId>.json>
 *     [--out data/offset.json]
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
    srcDir: get('--src', ''),
    outFile: get('--out', path.resolve('data/offset.json')),
  };
}

function findAssetFile(srcDir, skinId) {
  const dir = path.join(srcDir, skinId);
  if (!fs.statSync(dir).isDirectory()) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) stack.push(p);
      else if (name === skinId + '.json') return p;
    }
  }
  return null;
}

function main() {
  const { srcDir, outFile } = parseArgs();
  if (!srcDir || !fs.existsSync(srcDir)) {
    console.error('src dir not found: ' + srcDir);
    process.exit(1);
  }

  const result = {};
  for (const skinId of fs.readdirSync(srcDir)) {
    const f = findAssetFile(srcDir, skinId);
    if (!f) continue;
    let asset;
    try {
      asset = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      continue;
    }
    const row = (asset.arrData || []).find((r) => r.nPanelId === 10);
    if (!row) continue;
    // Set 2 = the Normal/half-body framing (downward shift + scale).
    result[skinId] = {
      s: row.fS2 || 1,
      x: row.fX2 || 0,
      y: row.fY2 || 0,
    };
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`Mapped ${Object.keys(result).length} skins to MainView offsets -> ${outFile}`);
}

main();
