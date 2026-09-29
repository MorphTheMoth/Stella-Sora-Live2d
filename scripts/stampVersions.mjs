#!/usr/bin/env node
/**
 * stampVersions.mjs — record the game version in which each viewer entry
 * was added or last edited.
 *
 * Every `data/models.json` / `data/avg.json` entry carries:
 *   { ..., "added": "1.13.0", "updated": "1.13.0" }
 * The site computes the highest version across entries and offers a "New"
 * filter + NEW/UPD badges for it.
 *
 * Change detection is two-fold per entry id:
 *   1. manifest-level: deep-compare of the entry JSON (minus the stamps)
 *      against the pre-dump snapshot (--old-models/--old-avg);
 *   2. asset-level: sha1 over the entry's staged files, compared with the
 *      committed sidecar (--hashes, data/entryhash.json).  This catches
 *      art-only edits (same-name texture bytes changed) that leave the
 *      manifest untouched.  A missing sidecar is seeded silently (no mass
 *      flagging on first run).
 *
 * New ids get added = updated = version.  Existing ids keep `added` and
 * get `updated` bumped only on real change.  Entries that predate stamping
 * keep undefined fields until they change (then only `updated` is set).
 *
 * Usage:
 *   node scripts/stampVersions.mjs --game DIR [--version X.Y.Z]
 *     [--root .] [--models data/models.json] [--avg data/avg.json]
 *     [--old-models .dump_tmp/models.prev.json]
 *     [--old-avg .dump_tmp/avg.prev.json]
 *     [--hashes data/entryhash.json]
 *
 * The version auto-resolves from the game install's prefs.dat
 * (LOCAL_GAME_VERSION, e.g. 1.16.0), falling back to
 * game-launcher-config.json/manifest.json (launcher version).  Without a
 * version the script warns and exits 0 so dump.sh never breaks on it.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeTextIfChanged } from './io.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    game: get('--game', ''),
    version: get('--version', ''),
    root: path.resolve(get('--root', ROOT)),
    modelsFile: get('--models', ''),
    avgFile: get('--avg', ''),
    oldModelsFile: get('--old-models', ''),
    oldAvgFile: get('--old-avg', ''),
    hashesFile: get('--hashes', path.join(ROOT, 'data/entryhash.json')),
  };
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function defaultGameDir() {
  const link = path.join(ROOT, '../Link to YostarGames/StellaSora_EN');
  try {
    const t = fs.readlinkSync(link);
    return path.isAbsolute(t) ? t : path.resolve(ROOT, t);
  } catch {
    return link;
  }
}

function resolveVersion(game, override) {
  if (override) return override;
  const dir = game || defaultGameDir();
  // prefs.dat (plain KEY:VALUE lines) carries the content version the client
  // runs — LOCAL_GAME_VERSION (e.g. 1.16.0).  game-launcher-config.json /
  // manifest.json only hold the launcher/client version (1.13.0), so they
  // are a last resort.
  try {
    const prefs = fs.readFileSync(path.join(dir, 'prefs.dat'), 'utf8');
    const m = /LOCAL_GAME_VERSION:([0-9][0-9.]*)/.exec(prefs);
    if (m) return m[1];
  } catch {
    /* missing prefs.dat */
  }
  for (const f of ['game-launcher-config.json', 'manifest.json']) {
    const j = loadJson(path.join(dir, f));
    if (j && typeof j.version === 'string' && j.version.trim()) return j.version.trim();
  }
  return '';
}

// Key-order-independent deep equal (arrays stay order-sensitive).
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => deepEqual(v, b[i]));
    }
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

// Strip added/updated from an entry AND its variants (deep) so stamp
// changes never count as content changes.
function stripStamps(entry) {
  const c = { ...entry };
  delete c.added;
  delete c.updated;
  if (Array.isArray(c.variants)) {
    c.variants = c.variants.map((v) => {
      if (!v || typeof v !== 'object') return v;
      const d = { ...v };
      delete d.added;
      delete d.updated;
      return d;
    });
  }
  return c;
}

function listFilesRecursive(dir) {
  const out = [];
  const walk = (d) => {
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

// Files backing an avg.json entry: the whole avg/<id>/ dir.
function avgEntryFiles(entry, root) {
  const d = path.join(root, 'avg', entry.id);
  return listFilesRecursive(d).map((f) => path.relative(root, f));
}

// Per-variant file lists for a models.json entry: each variant's own dir
// (recursive). Variant dirs never overlap, so entry-level change is just
// "any variant changed".
function modelEntryVariants(entry, root) {
  const out = [];
  for (const v of entry.variants || []) {
    if (typeof v.name !== 'string' || typeof v.path !== 'string') continue;
    const dir = path.join(root, path.dirname(v.path));
    out.push({
      name: v.name,
      files: listFilesRecursive(dir).map((f) => path.relative(root, f)).sort(),
    });
  }
  return out;
}

function hashFiles(root, relpaths) {
  const h = crypto.createHash('sha1');
  for (const r of relpaths) {
    h.update(r);
    h.update('\0');
    try {
      h.update(fs.readFileSync(path.join(root, r)));
    } catch {
      h.update('<missing>');
    }
    h.update('\0');
  }
  return h.digest('hex');
}

// Previous hash record for one models entry.  v1 stored a flat string per
// entry; v2 stores { hash, variants: {name: hash} }.  A v1 record has no
// variant hashes, so variant file-changes are seeded silently on migration.
function prevModelHashes(prev) {
  if (!prev) return { entry: null, variants: null };
  if (typeof prev === 'string') return { entry: prev, variants: null };
  return { entry: prev.hash || null, variants: prev.variants || null };
}

// Stamp one models.json entry and its variants in place. Returns the hash
// record stored in data/entryhash.json.
function stampModelEntry(entry, old, prevHashes, version, root) {
  const variantInfos = modelEntryVariants(entry, root);
  const variantHashes = {};
  let anyFilesChanged = false;

  const oldVariants = new Map((old && Array.isArray(old.variants) ? old.variants : [])
    .filter((v) => v && v.name !== undefined)
    .map((v) => [String(v.name), v]));

  for (const vv of entry.variants || []) {
    if (typeof vv.name !== 'string') continue;
    const info = variantInfos.find((x) => x.name === vv.name);
    const fh = hashFiles(root, info ? info.files : []);
    variantHashes[vv.name] = fh;
    const prev = prevHashes.variants ? prevHashes.variants[vv.name] : null;
    const filesChanged = prev ? prev !== fh : false;
    anyFilesChanged = anyFilesChanged || filesChanged;
    const oldV = oldVariants.get(vv.name);
    if (!oldV) {
      // New skin variant on an existing character (e.g. a new event outfit).
      vv.added = version;
      vv.updated = version;
    } else {
      if (vv.added === undefined && oldV.added !== undefined) vv.added = oldV.added;
      const jsonChanged = !deepEqual(stripStamps(oldV), stripStamps(vv));
      if (jsonChanged || filesChanged) vv.updated = version;
      else if (vv.updated === undefined && oldV.updated !== undefined) vv.updated = oldV.updated;
    }
  }

  // Entry hash over the variant hashes (variant dirs cover all entry files).
  const h = crypto.createHash('sha1');
  for (const name of Object.keys(variantHashes).sort()) {
    h.update(name + '\0' + variantHashes[name] + '\0');
  }
  const entryHash = h.digest('hex');

  if (!old) {
    entry.added = version;
    entry.updated = version;
  } else {
    if (entry.added === undefined && old.added !== undefined) entry.added = old.added;
    const jsonChanged = !deepEqual(stripStamps(old), stripStamps(entry));
    if (jsonChanged || anyFilesChanged) entry.updated = version;
    else if (entry.updated === undefined && old.updated !== undefined) entry.updated = old.updated;
  }
  return { hash: entryHash, variants: variantHashes };
}

function stampList({ list, oldById, hashes, version, fileLister, root, label }) {
  let added = 0;
  let updated = 0;
  for (const entry of list) {
    const id = entry.id;
    if (id === undefined) continue;
    const old = oldById.get(String(id));
    const files = fileLister(entry, root);
    const fh = hashFiles(root, files);
    const prevHash = typeof hashes[String(id)] === 'string' ? hashes[String(id)] : null;
    const filesChanged = prevHash ? prevHash !== fh : false; // missing hash: seed silently
    hashes[String(id)] = fh;
    if (!old) {
      entry.added = version;
      entry.updated = version;
      added++;
    } else {
      if (entry.added === undefined && old.added !== undefined) entry.added = old.added; // pre-stamp entries stay undefined
      const jsonChanged = !deepEqual(stripStamps(old), stripStamps(entry));
      if (jsonChanged || filesChanged) {
        entry.updated = version;
        updated++;
        if (label && process.env.VERBOSE) console.log(`  ${label} ${id}: updated (${jsonChanged ? 'entry' : ''}${jsonChanged && filesChanged ? '+' : ''}${filesChanged ? 'files' : ''})`);
      } else if (entry.updated === undefined && old.updated !== undefined) {
        entry.updated = old.updated;
      }    }
  }
  return { added, updated };
}

function main() {
  const o = parseArgs();
  const version = resolveVersion(o.game, o.version);
  if (!version) {
    console.warn('stampVersions: no game version found (game-launcher-config.json/manifest.json); skipping.');
    return;
  }
  const hashesAll = loadJson(o.hashesFile) || {};
  if (typeof hashesAll.models !== 'object' || !hashesAll.models) hashesAll.models = {};
  if (typeof hashesAll.avg !== 'object' || !hashesAll.avg) hashesAll.avg = {};

  if (o.modelsFile) {
    // Strip any existing stamps first: the input normally comes straight
    // from generateManifest.mjs (no stamps), but this makes re-runs on an
    // already-stamped file authoritative instead of preserving stale marks.
    let list = loadJson(o.modelsFile);
    if (!Array.isArray(list)) {
      console.error(`stampVersions: not an array: ${o.modelsFile}`);
      process.exit(1);
    }
    list = list.map(stripStamps);
    const old = o.oldModelsFile ? loadJson(o.oldModelsFile) : null;
    const oldById = new Map((Array.isArray(old) ? old : []).map((e) => [String(e.id), e]));
    let added = 0;
    let updated = 0;
    for (const entry of list) {
      if (entry.id === undefined) continue;
      const id = String(entry.id);
      const oldEntry = oldById.get(id);
      const prev = prevModelHashes(hashesAll.models[id]);
      hashesAll.models[id] = stampModelEntry(entry, oldEntry, prev, version, o.root);
      if (!oldEntry) added++;
      // Only report entries newly stamped this run (re-runs on an already
      // stamped manifest must not re-count them).
      else if (entry.updated === version && oldEntry.updated !== version) updated++;
    }
    writeTextIfChanged(o.modelsFile, JSON.stringify(list, null, 2));
    console.log(`stampVersions: models @${version}: ${added} added, ${updated} updated`);
  }

  if (o.avgFile) {
    let list = loadJson(o.avgFile);
    if (!Array.isArray(list)) {
      console.error(`stampVersions: not an array: ${o.avgFile}`);
      process.exit(1);
    }
    list = list.map(stripStamps);
    const old = o.oldAvgFile ? loadJson(o.oldAvgFile) : null;
    const oldById = new Map((Array.isArray(old) ? old : []).map((e) => [String(e.id), e]));
    const { added, updated } = stampList({
      list, oldById, hashes: hashesAll.avg, version,
      fileLister: avgEntryFiles, root: o.root, label: 'avg',
    });
    const outText = JSON.stringify(list, null, 1) + '\n'; // keep generateAvg.mjs formatting
    writeTextIfChanged(o.avgFile, outText);
    console.log(`stampVersions: avg @${version}: ${added} added, ${updated} updated`);
  }

  writeTextIfChanged(o.hashesFile, JSON.stringify({ version: 2, ...hashesAll }, null, 2) + '\n');
}

main();
