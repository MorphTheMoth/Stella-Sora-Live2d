#!/usr/bin/env node
/**
 * copyBgTextures.mjs — copy the PNG files referenced by `bgLayers` in
 * data/models.json from the AssetStudio texture exports into each variant's
 * `bg/` folder.
 *
 * Every background layer's `file` is a texture name (e.g.
 * `live2d_15802_ex_bg_005`); the actual PNG is exported from the bundle's
 * texture2d export (`-m export -t texture2d`, see dump.sh) into
 * `<texRoot>/<bundle>/assets/.../fx/<subdir>/<file>.png`.  We search that
 * export tree by filename and copy the first hit into
 * `chars/<skin>/<variant>/bg/<file>.png`, skipping files that already exist.
 *
 * Each variant's `bg/` folder is kept in sync with its `bgLayers` (and its
 * `bg` list): any PNG there that is not referenced by either is removed, so a
 * variant whose composition no longer has a background (e.g. the default
 * variant of a character whose background belongs to the memory-snapshot
 * variant) does not fall back to a stale file.
 *
 * Usage:
 *   node scripts/copyBgTextures.mjs --models data/models.json \
 *     --tex <texture export root> --chars <chars dir>
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
    texRoot: get('--tex', path.resolve('.dump_tmp/bgtex')),
    charsDir: get('--chars', path.resolve('chars')),
  };
}

function listFiles(root) {
  const out = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else out.push(p);
    }
  })(root);
  return out;
}

function main() {
  const { modelsFile, texRoot, charsDir } = parseArgs();
  if (!fs.existsSync(texRoot)) {
    console.error(`texture export root not found: ${texRoot}`);
    process.exit(1);
  }

  // Index all exported PNGs by filename -> first path.
  const byName = new Map();
  for (const p of listFiles(texRoot)) {
    if (!/\.png$/i.test(p)) continue;
    const name = path.basename(p);
    if (!byName.has(name)) byName.set(name, p);
  }

  const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  let copied = 0;
  let missing = 0;
  let removed = 0;
  const missingFiles = new Set();

  for (const item of models) {
    for (const variant of item.variants) {
      const parts = variant.path.split('/');
      const skin = parts[1];
      const variantDir = parts[2];
      const bgDir = path.join(charsDir, skin, variantDir, 'bg');
      // Protect both the composed `bgLayers` textures and the files the
      // manifest advertises in `bg` (a variant can list `bg` files that
      // predate its `bgLayers` composition, e.g. disc models).
      const referenced = new Set([
        ...(variant.bgLayers || []).map((l) => l.file + '.png'),
        ...(variant.bg || []).map((b) => path.basename(b)),
      ]);

      // Remove stale files: anything in bg/ that is no longer part of this
      // variant's composition.  A variant with no bgLayers gets an empty bg/.
      if (fs.existsSync(bgDir)) {
        for (const f of fs.readdirSync(bgDir)) {
          if (!/\.png$/i.test(f)) continue;
          if (!referenced.has(f)) {
            fs.unlinkSync(path.join(bgDir, f));
            removed++;
          }
        }
      }

      if (!variant.bgLayers || !variant.bgLayers.length) continue;
      for (const layer of variant.bgLayers) {
        const fn = layer.file + '.png';
        const dst = path.join(bgDir, fn);
        if (fs.existsSync(dst)) continue;
        const src = byName.get(fn);
        if (!src) {
          missing++;
          missingFiles.add(fn);
          continue;
        }
        fs.mkdirSync(bgDir, { recursive: true });
        fs.copyFileSync(src, dst);
        copied++;
      }
    }
  }

  console.log(`Copied ${copied} bg texture(s) into ${charsDir}`);
  if (removed) console.log(`Removed ${removed} stale bg texture(s)`);
  if (missing) {
    console.log(`MISSING ${missing} texture(s): ${[...missingFiles].join(', ')}`);
  }
}

main();
