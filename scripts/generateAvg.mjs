#!/usr/bin/env node
/**
 * generateAvg.mjs — build `data/avg.json` from the per-bundle AVG sprite
 * metadata dumped by scripts/extractAvg.py, and stage the sprite PNGs into
 * `avg/<id>/`.
 *
 * Every story character (the game's AVG dialogue actors) is a set of Unity
 * Sprites in a `char_avg_2d_avg<N>_<id>.unity3d` bundle:
 *
 *   <id>_<pose>_001(.png)   body  — full-body art, face area left blank
 *   <id>_<pose>_001x.png    black silhouette of the body (dark variant)
 *   <id>_<pose>_002..N.png  faces — eye/mouth overlays drawn on top
 *
 * `<pose>` is an atlas letter (a/b/c) = one artwork pose per character.
 * The game renders body and face on coincident rig nodes (AvgPanel prefab,
 * ui_avg.unity3d) — alignment is baked into each sprite's tight mesh, so
 * extractAvg.py records every sprite's mesh bbox centre (cx/cy, px,
 * pivot-relative, y-up).  Here we emit, per pose, the face positions as
 * deltas from the body content centre (y-up, like the rest of the repo's
 * offset data):
 *
 *   { id, shortId, name, poses: [ { letter, body, black, faces: [{file, x, y}],
 *                          offset: {x, y, s} } ] }
 * (`id` = bundle id `char_avg_2d_avg1_131`; `shortId` = the game's own
 * `avg1_131` form used by Actor2D/CharacterAvg paths and the name preset.)
 *
 * `offset` is the rig's Set 2 canvas placement from Actor2DOffsetData
 * (panel 99 = AvgST; applied to rtRawImage by Avg_2_CharCtrl:_SetPortrait)
 * — kept for reference/reconstruction, unused by the viewer fit.
 *
 * Names come from the datamine's localised AVG preset
 * (`_Lua/Game/UI/Avg/_en/Preset/AvgCharacter.lua`, id -> name; entries with
 * a `reuse` id share another actor's bundle and are skipped).
 *
 * Usage:
 *   node scripts/generateAvg.mjs --meta <dir of <id>.json> \
 *     [--staging <dir of <id>/*.png>] [--avg <root>/avg] \
 *     [--names <AvgCharacter.lua>] [--out data/avg.json]
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
    metaDir: get('--meta', ''),
    stagingDir: get('--staging', ''),
    avgRoot: get('--avg', path.resolve('avg')),
    namesFile: get('--names', ''),
    outFile: get('--out', path.resolve('data/avg.json')),
  };
}

// Minimal Lua table parser for the AvgCharacter preset:
//   return { { id = "avg1_103", name = "Amber", name_bg_color = "#..", ver = ".." }, ... }
// Entries are flat string-field records; `reuse = "<id>"` entries borrow
// another actor's bundle and never appear in the viewer.
function parseAvgNames(file) {
  const out = new Map();
  if (!file || !fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  const re = /\{\s*([\s\S]*?)\s*\}/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[1];
    const id = body.match(/\bid\s*=\s*"([^"]+)"/);
    const name = body.match(/\bname\s*=\s*"([^"]*)"/);
    const reuse = body.match(/\breuse\s*=\s*"([^"]+)"/);
    if (!id || !name || reuse) continue;
    out.set(id[1], name[1]);
  }
  return out;
}

// Sprite file names are `<id>_<pose>_<num>[x].png` (num zero-padded, `x` =
// the black silhouette of the body).  Returns null for anything else.
function parseSpriteName(file) {
  const m = file.match(/^(.*)_([a-z])_(\d{3})(x?)\.png$/);
  if (!m) return null;
  return { base: m[1], letter: m[2], num: parseInt(m[3], 10), black: m[4] === 'x' };
}

function main() {
  const { metaDir, stagingDir, avgRoot, namesFile, outFile } = parseArgs();
  if (!metaDir || !fs.existsSync(metaDir)) {
    console.error('meta dir not found: ' + metaDir);
    process.exit(1);
  }
  const names = parseAvgNames(namesFile);

  const entries = [];
  for (const id of fs.readdirSync(metaDir).sort()) {
    if (!id.endsWith('.json')) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(metaDir, id), 'utf8'));

    // Group sprites by pose letter.
    const groups = new Map(); // letter -> { body, black, faces[] }
    for (const sp of meta.sprites) {
      const p = parseSpriteName(sp.file);
      if (!p) continue;
      let g = groups.get(p.letter);
      if (!g) {
        g = { body: null, black: null, faces: [] };
        groups.set(p.letter, g);
      }
      if (p.num === 1) {
        if (p.black) g.black = sp;
        else g.body = sp;
      } else {
        g.faces.push(sp);
      }
    }

    const poses = [];
    for (const letter of [...groups.keys()].sort()) {
      const g = groups.get(letter);
      if (!g.body) continue; // a pose without a body sprite is unusable
      g.faces.sort((a, b) => a.file.localeCompare(b.file));
      // Face position = mesh-centre delta from the body content centre
      // (px, y-up).  The viewer anchors the body at its content centre and
      // draws each face at (-dx, +dy) in its y-down screen space.
      const faces = g.faces.map((sp) => ({
        file: sp.file,
        x: Math.round((sp.cx - g.body.cx) * 100) / 100,
        y: Math.round((sp.cy - g.body.cy) * 100) / 100,
      }));
      // Set 2 rig placement for this pose: panel 99 (AvgST) preferred.
      const off = meta.offsets.find((o) => o.panel === 99 && o.pose === poses.length + 1) ||
        meta.offsets.find((o) => o.pose === poses.length + 1) || null;
      poses.push({
        letter,
        body: g.body.file,
        black: g.black ? g.black.file : null,
        bodyCx: g.body.cx,
        bodyCy: g.body.cy,
        w: g.body.w,
        h: g.body.h,
        faces,
        offset: off ? { x: off.x, y: off.y, s: off.s } : null,
      });
    }
    if (!poses.length) continue;

    // Bundle ids are `char_avg_2d_avg1_131`; the AvgCharacter preset (and the
    // in-game paths) use the short `avg1_131` form.
    const shortId = meta.id.replace(/^char_avg_2d_/, '');
    entries.push({
      id: meta.id,
      shortId,
      name: names.get(shortId) || meta.id,
      poses,
    });
  }

  // Stage the sprite PNGs into avg/<id>/ (idempotent copy from staging).
  if (stagingDir && fs.existsSync(stagingDir)) {
    for (const entry of entries) {
      const srcDir = path.join(stagingDir, entry.id);
      const dstDir = path.join(avgRoot, entry.id);
      if (!fs.existsSync(srcDir)) continue;
      fs.mkdirSync(dstDir, { recursive: true });
      const keep = new Set();
      for (const pose of entry.poses) {
        for (const f of [pose.body, pose.black, ...pose.faces.map((f) => f.file)]) {
          if (!f) continue;
          keep.add(f);
          const src = path.join(srcDir, f);
          const dst = path.join(dstDir, f);
          if (fs.existsSync(src)) fs.copyFileSync(src, dst);
        }
      }
      // Drop stale files from earlier dumps.
      for (const f of fs.readdirSync(dstDir)) {
        if (!keep.has(f)) fs.rmSync(path.join(dstDir, f));
      }
    }
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(entries, null, 1) + '\n');
  const nFaces = entries.reduce((n, e) => n + e.poses.reduce((m, p) => m + p.faces.length, 0), 0);
  console.log(`avg.json: ${entries.length} characters, ${nFaces} faces -> ${outFile}`);
}

main();
