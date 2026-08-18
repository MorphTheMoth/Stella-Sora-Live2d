#!/usr/bin/env node
/**
 * generateCharNames.mjs — rebuild `data/characterid.json` (charId(3) -> name)
 * from the datamine language table `language/en_US/Character.json`.
 *
 * Character.json holds "Character.<charId>.1" entries and is the authoritative
 * name source (more complete than the hand-maintained map — e.g. 158/159/160
 * resolve to "Snowish Laru"/"Springseek Coronis"/"Suntide Willow" there).
 * Entries missing from Character.json keep their existing name so ids with no
 * L2D yet aren't dropped.
 *
 * Usage:
 *   node scripts/generateCharNames.mjs --lang <Character.json> \
 *     --current <data/characterid.json> --out <data/characterid.json>
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
    langFile: get('--lang', path.resolve('data/characterid.json')),
    currentFile: get('--current', ''),
    outFile: get('--out', path.resolve('data/characterid.json')),
  };
}

function main() {
  const { langFile, currentFile, outFile } = parseArgs();
  if (!fs.existsSync(langFile)) {
    console.error(`lang file not found: ${langFile}`);
    process.exit(1);
  }

  const lang = {};
  const data = JSON.parse(fs.readFileSync(langFile, 'utf8'));
  for (const key of Object.keys(data)) {
    const m = key.match(/^Character\.(\d+)\.1$/);
    if (m && data[key]) lang[m[1]] = data[key];
  }

  const names = {};
  if (currentFile && fs.existsSync(currentFile)) {
    Object.assign(names, JSON.parse(fs.readFileSync(currentFile, 'utf8')));
  }
  Object.assign(names, lang);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(names, null, 2) + '\n');
  console.log(`Generated ${Object.keys(names).length} character names -> ${outFile}`);
}

main();
