#!/usr/bin/env node
/**
 * generateDiscId.mjs — rebuild data/discid.json (discId(4) -> display name)
 * from the datamine Disc.json + language/en_US/Item.json.
 *
 * Disc.json holds full IDs (e.g. 214057); the viewer uses the last 4 digits
 * (4057). Name key is Item.<fullId>.1 (e.g. Item.214057.1) — mapped by last 4
 * digits. This mirrors AgentsReadme instructions.
 *
 * Usage:
 *   node scripts/generateDiscId.mjs --datamine DIR --out data/discid.json
 *   node scripts/generateDiscId.mjs --disc EN/bin/Disc.json --item EN/language/en_US/Item.json --out data/discid.json
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
    discFile: get('--disc', ''),
    itemFile: get('--item', ''),
    datamine: get('--datamine', ''),
    outFile: get('--out', path.resolve('data/discid.json')),
  };
}

function resolveFromDatamine(datamine, discFile, itemFile) {
  const dm = datamine || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../StellaSoraData Makostar');
  if (!discFile) {
    const cand = path.join(dm, 'EN/bin/Disc.json');
    if (fs.existsSync(cand)) discFile = cand;
  }
  if (!itemFile) {
    const cand = path.join(dm, 'EN/language/en_US/Item.json');
    if (fs.existsSync(cand)) itemFile = cand;
  }
  return { discFile, itemFile };
}

function main() {
  let { discFile, itemFile, datamine, outFile } = parseArgs();
  ({ discFile, itemFile } = resolveFromDatamine(datamine, discFile, itemFile));

  if (!discFile || !fs.existsSync(discFile)) {
    console.error(`Disc.json not found: ${discFile}`);
    process.exit(1);
  }
  if (!itemFile || !fs.existsSync(itemFile)) {
    console.error(`Item.json not found: ${itemFile}`);
    process.exit(1);
  }

  const disc = JSON.parse(fs.readFileSync(discFile, 'utf8'));
  const itemLang = JSON.parse(fs.readFileSync(itemFile, 'utf8'));

  const result = {};
  // existing file keeps manual overrides? Load and merge
  let existing = {};
  if (fs.existsSync(outFile)) {
    try { existing = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch {}
  }

  for (const [fullId, cfg] of Object.entries(disc)) {
    const id = String(cfg.Id ?? fullId);
    const shortId = id.slice(-4);
    // Name key per AgentsReadme: Item.<fullId>.1
    const key = `Item.${id}.1`;
    const name = itemLang[key];
    if (name && typeof name === 'string' && name.trim()) {
      result[shortId] = name.trim();
    }
  }

  // Merge: generated takes precedence, but keep existing entries that have no
  // datamine source (hand-added or future patches) to avoid drops.
  for (const [k, v] of Object.entries(existing)) {
    if (!(k in result) && v) result[k] = v;
  }

  const sorted = {};
  for (const k of Object.keys(result).sort((a, b) => Number(a) - Number(b))) sorted[k] = result[k];

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Generated ${Object.keys(sorted).length} disc names -> ${outFile} (from ${discFile} + ${itemFile})`);
}

main();
