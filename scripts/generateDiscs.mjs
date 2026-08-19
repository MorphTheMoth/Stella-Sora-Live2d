#!/usr/bin/env node
/**
 * generateDiscs.mjs — build the Discs section of data/models.json.
 *
 * A disc is represented twice when it has a Live2D:
 *   - a *parallax* entry  ({ kind: "parallax" })  — the layered static card
 *     scene (gyroscope overlays + main art / `_B` card), rendered with a
 *     mouse-drag parallax effect in the viewer;
 *   - a *[title] l2d* entry ({ kind: "discl2d" }) — the disc's Live2D model.
 *
 * The parallax layer data comes from extractDiscParallax.mjs
 * (data/discparallax.json); the L2D variant data comes from the existing
 * character/disc entries in models.json (which the Live2D dump pipeline
 * produces).  Any `overlays` field left over on variants is stripped.
 *
 * Usage:
 *   node scripts/generateDiscs.mjs \
 *     --models data/models.json \
 *     --parallax data/discparallax.json \
 *     --disc-names data/discid.json
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
    modelsFile: get('--models', path.resolve('data/models.json')),
    parallaxFile: get('--parallax', path.resolve('data/discparallax.json')),
    discNamesFile: get('--disc-names', path.resolve('data/discid.json')),
  };
}

function main() {
  const { modelsFile, parallaxFile, discNamesFile } = parseArgs();
  const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  const parallax = JSON.parse(fs.readFileSync(parallaxFile, 'utf8'));
  const discNames = JSON.parse(fs.readFileSync(discNamesFile, 'utf8'));

  // Split existing entries into characters and disc (L2D) entries; strip any
  // stale `overlays` field from variants.
  //
  // models.json may arrive here either as the raw dump (discs are plain
  // 4-digit-id entries with variants) or as this script's own output (kind
  // "parallax" / "discl2d" entries).  Both are handled so a re-run is
  // idempotent: parallax entries are rebuilt from discparallax.json below,
  // and discl2d entries are kept only when they carry real variants (the
  // accidental re-run that turned parallax entries into variant-less
  // discl2d entries is cleaned up here too).
  const characters = [];
  const l2dDiscs = new Map(); // discId -> { name, variants }
  for (const item of models) {
    for (const v of item.variants || []) delete v.overlays;
    if (item.kind === 'parallax') continue; // rebuilt from parallax below
    if (item.kind === 'discl2d') {
      if (Array.isArray(item.variants) && item.variants.length) {
        const discId = item.id.replace(/l2d$/, '');
        l2dDiscs.set(discId, { name: item.name.replace(/ l2d$/, ''), variants: item.variants });
      }
      continue;
    }
    const isDisc = /^\d{4}$/.test(item.id);
    if (isDisc) {
      l2dDiscs.set(item.id, { name: item.name, variants: item.variants });
    } else {
      characters.push(item);
    }
  }

  const discs = [];

  // Every disc gets a parallax entry (from discparallax.json).
  for (const [id, scene] of Object.entries(parallax)) {
    const name = discNames[id] || `Disc ${id}`;
    discs.push({ id, name, kind: 'parallax', parallax: scene });
  }

  // Discs that also have a Live2D get a separate "[title] l2d" entry.
  const l2dIds = [...l2dDiscs.keys()];
  for (const id of l2dIds.sort()) {
    const src = l2dDiscs.get(id);
    const name = discNames[id] || src.name || `Disc ${id}`;
    discs.push({ id: `${id}l2d`, name: `${name} l2d`, kind: 'discl2d', variants: src.variants });
  }

  const result = [...characters, ...discs];
  fs.writeFileSync(modelsFile, JSON.stringify(result, null, 2));
  console.log(`Wrote ${characters.length} characters + ${Object.keys(parallax).length} parallax + ${l2dIds.length} l2d disc entries -> ${modelsFile}`);
}

main();
