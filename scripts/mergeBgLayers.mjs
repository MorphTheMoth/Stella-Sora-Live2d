#!/usr/bin/env node
/**
 * mergeBgLayers.mjs — merge per-bundle `----bg----` compositions into
 * data/models.json as a `bgLayers` array on each variant.
 *
 * For each variant we look up the prefab root (e.g. "16001_LF") and, when
 * the bundle only yields one active composition, attach its layers.  The
 * layer list is ordered back-to-front (Unity sortOrder ascending).
 *
 * Usage:
 *   node scripts/mergeBgLayers.mjs --models data/models.json
 *     --layers <dir with <bundle>/compositions.json>
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
    layersDir: get('--layers', path.resolve('.dump_tmp/bglayers')),
  };
}

// Map a variant path (chars/<skin>/<variant>/...) to the prefab root name.
// variant folder "_l"/"_lf"/"_lt" -> "_L"/"_LF"/"_LT".
function variantToPrefab(variantPath) {
  const parts = variantPath.split('/');
  const skin = parts[1];
  const variant = parts[2];
  if (!variant) return null;
  const suffix = variant.replace(skin, '');
  return skin.toUpperCase() + suffix.toUpperCase();
}

function main() {
  const { modelsFile, layersDir } = parseArgs();
  const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));

  // Load all compositions: bundle -> [ { prefab, active, layers } ]
  const compsByBundle = new Map();
  for (const bundle of fs.readdirSync(layersDir)) {
    const f = path.join(layersDir, bundle, 'compositions.json');
    if (!fs.existsSync(f)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j.compositions) compsByBundle.set(bundle, j.compositions);
    } catch (e) { /* ignore */ }
  }

  let added = 0;
  for (const item of models) {
    if (!item.variants) continue;
    for (const variant of item.variants) {
      // Find which bundle this variant belongs to.
      const parts = variant.path.split('/');
      const skin = parts[1];
      const skinDir = skin; // e.g. 16001
      const isDisc = /^\d{4}$/.test(skinDir);
      const bundle = isDisc ? `disc_l2d_${skinDir}` : `char_l2d_${skinDir}`;
      const comps = compsByBundle.get(bundle);
      if (!comps || !comps.length) continue;

      const prefab = variantToPrefab(variant.path);
      // Combine ----bg---- and ----bg_effect---- from the same prefab into
      // one composition (bg_effect holds foreground objects like houses).
      // Every prefab root is present in the dump (extractBgLayers.mjs keeps
      // 0-layer roots too), so an exact name match always resolves: a variant
      // whose own root has no sprite layers simply gets no background.
      const matching = comps.filter((c) => c.prefab && c.prefab === prefab);
      let comps2 = matching;
      if (!comps2.length) {
        // Fall back only when the variant's own prefab root is genuinely
        // absent from the dump and the bundle carries exactly one composed
        // scene (e.g. a bundle that was not fully exported).
        const withLayers = comps.filter((c) => (c.layers || []).some((l) => l.texture));
        if (withLayers.length === 1) comps2 = withLayers;
      }
      if (!comps2.length) continue;
      const allLayers = comps2.flatMap((c) => (c.layers || []).filter((l) => l.texture));
      if (!allLayers.length) continue;

      // The prefab may carry several alternative full-frame bgs, with only
      // the ones whose GameObject is active actually displayed (animations
      // toggle the rest).  Drop inactive layers; if every layer is marked
      // inactive (common when the idle anim turns them on), keep them all.
      const visible = allLayers.filter((l) => l.active !== 'False');
      const use = visible.length ? visible : allLayers;

      // Store ordered back-to-front layers (sortLayer, then sortOrder).
      use.sort((a, b) => (a.sortLayer - b.sortLayer) || (a.sortOrder - b.sortOrder));
      variant.bgLayers = use.map((l) => {
        const isDisc = /^\d{4}$/.test(skin);
        // Disc L2Ds use a different panel setup: the character's
        // CubismRenderer stays at sortingOrder 0 and the foreground
        // is defined by the prefab hierarchy (----fg_effect---- after
        // ----live2d_modle----), not just sortingOrder.  Keep the
        // strict sortOrder>=1 check for trekker (char) L2Ds where
        // many fg_effect layers at -100..-200 must stay behind.
        const fg = isDisc
          ? (l.group === '----fg_effect----' || l.group === '----live2d_modle----' || l.sortOrder >= 1)
          : l.sortOrder >= 1;
        return {
          file: l.texture, // texture name; resolved against the variant bg/ dir
          x: l.posX || 0,
          y: l.posY || 0,
          sx: l.scaleX || 1,
          sy: l.scaleY || 1,
          w: l.texW,
          h: l.texH,
          fg,
        };
      });
      added++;
    }
  }

  fs.writeFileSync(modelsFile, JSON.stringify(models, null, 2));
  console.log(`Merged bgLayers into ${added} variants -> ${modelsFile}`);
}

main();
