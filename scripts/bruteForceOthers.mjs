#!/usr/bin/env node
// bruteForceOthers.mjs — exhaustive Live2D scan for Others section
// Scans every .unity3d in both stores, runs live2d export, and stages any
// model not already in chars/ into chars/others/<variant>/ with kind:"other"
// Caches per-file mtime+size so unchanged files are skipped on re-runs.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME_PERSIST = process.env.GAME_PERSIST || '/home/morph/stella sora meter/Link to YostarGames/StellaSora_EN/Persistent_Store/AssetBundles';
const GAME_STREAM = process.env.GAME_STREAM || '/home/morph/stella sora meter/StellaSora_EN/StellaSora_Data/StreamingAssets/InstallResource';
const CLI = process.env.ASSETSTUDIO_CLI || '/home/morph/ssassets/assetStudioMod/AssetStudioModCLI.dll';
const CHARS_DIR = path.join(ROOT, 'chars');
const OTHERS_DIR = path.join(CHARS_DIR, 'others');
const TMP_BASE = path.join(ROOT, '.dump_tmp', 'brute_others');
const MODELS_JSON = path.join(ROOT, 'data/models.json');
const CACHE_FILE = path.join(ROOT, '.dump_tmp', 'brute_others.cache.json');

const FORCE = process.argv.includes('--force') || process.argv.includes('-f');

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.entries || typeof parsed.entries !== 'object') return { version: 1, entries: {} };
    if (parsed.version !== 1) return { version: 1, entries: {} };
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

function saveCache(cache) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const tmp = CACHE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) {
    console.error('Failed to save cache', e.message);
  }
}

function getFileStat(file) {
  const st = fs.statSync(file);
  return { mtimeMs: st.mtimeMs, size: st.size };
}

function getAllUnityFiles() {
  // Exhaustive: every .unity3d (and .ab/.bundle if present) under the entire game install
  const roots = [
    '/home/morph/stella sora meter/Link to YostarGames/StellaSora_EN',
  ];
  const seen = new Set();
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const result = spawnSync('find', [root, '-type', 'f', '(', '-name', '*.unity3d', '-o', '-name', '*.ab', '-o', '-name', '*.bundle', ')', '-print0'], { maxBuffer: 20 * 1024 * 1024 });
    if (result.stdout) {
      const list = result.stdout.toString().split('\0').filter(Boolean);
      for (const f of list) {
        if (!seen.has(f)) { seen.add(f); files.push(f); }
      }
    }
  }
  return files.sort();
}

function hasLive2DMarker(file) {
  // Fast pre-filter: check for Live2D/Cubism strings via rg if available, else fallback to reading 1MB
  try {
    const result = spawnSync('rg', ['-a', '-q', 'Live2D|Cubism|CubismMoc', file], { timeout: 2000 });
    return result.status === 0;
  } catch {
    return true; // if rg fails, try anyway
  }
}

function runLive2D(file, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const env = { ...process.env, DOTNET_ROLL_FORWARD: 'Major' };
  const result = spawnSync('dotnet', [CLI, file, '-m', 'live2d', '-o', outDir, '--image-format', 'png'], {
    env,
    timeout: 25000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const out = (result.stdout?.toString() || '') + (result.stderr?.toString() || '');
  const m = out.match(/Found (\d+) model/);
  const cnt = m ? parseInt(m[1], 10) : 0;
  const names = [];
  for (const line of out.split('\n')) {
    const mm = line.match(/Model name: "([^"]+)"/);
    if (mm) names.push(mm[1]);
  }
  return { cnt, names, out };
}

function stageToOthers(live2dOutDir) {
  const liveOut = path.join(live2dOutDir, 'Live2DOutput');
  if (!fs.existsSync(liveOut)) return [];
  const staged = [];
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.model3.json')) {
        const modelName = path.basename(p, '.model3.json'); // e.g. createplayer2_F
        const variant = modelName; // one folder per model, fixes multi-model prefabs like createplayer_bg
        const modelDir = path.dirname(p);
        // Deduplicate by model file basename, not folder
        let already = false;
        for (const skin of fs.readdirSync(CHARS_DIR)) {
          if (skin === 'others') continue;
          const skinPath = path.join(CHARS_DIR, skin);
          if (!fs.statSync(skinPath).isDirectory()) continue;
          for (const v of fs.readdirSync(skinPath)) {
            if (fs.existsSync(path.join(skinPath, v, path.basename(p)))) { already = true; break; }
          }
          if (already) break;
        }
        if (fs.existsSync(path.join(OTHERS_DIR, variant, path.basename(p)))) already = true;
        if (already) continue;
        const dest = path.join(OTHERS_DIR, variant);
        fs.mkdirSync(dest, { recursive: true });
        // Copy model files + textures/motions relative to modelDir
        for (const f of fs.readdirSync(modelDir)) {
          const src = path.join(modelDir, f);
          const dst = path.join(dest, f);
          if (fs.statSync(src).isDirectory()) {
            fs.cpSync(src, dst, { recursive: true, force: true });
          } else {
            fs.copyFileSync(src, dst);
          }
        }
        console.log(`  staged ${variant} -> chars/others/${variant}/`);
        staged.push(variant);
      }
    }
  };
  walk(liveOut);
  return staged;
}

async function main() {
  if (FORCE) console.log('Force mode: ignoring cache');
  const cache = loadCache();
  let cacheEntriesOnLoad = Object.keys(cache.entries).length;
  if (cacheEntriesOnLoad) console.log(`Cache: ${cacheEntriesOnLoad} entries from ${CACHE_FILE}`);
  const allFiles = getAllUnityFiles();
  console.log(`Found ${allFiles.length} .unity3d files`);
  const allFilesSet = new Set(allFiles);
  let totalFound = 0;
  let totalStaged = 0;
  let cacheHits = 0;
  let cacheSkippedMarker = 0;
  let dirty = false;

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const base = path.basename(file);
    let stat;
    try { stat = getFileStat(file); } catch { continue; }

    const cached = cache.entries[file];
    const unchanged = !FORCE && cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size;
    if (unchanged) {
      // previously known to have no marker or no models -> skip rg and live2d entirely
      if (cached.marker === false || cached.cnt === 0) {
        cacheHits++;
        continue;
      }
      if (cached.cnt > 0) {
        // if it previously produced models, verify staged outputs still exist when applicable
        if (cached.staged && cached.staged.length > 0) {
          const allExist = cached.staged.every((v) => fs.existsSync(path.join(OTHERS_DIR, v)));
          if (allExist) {
            cacheHits++;
            totalFound++;
            continue;
          }
          // staged output missing -> re-extract despite unchanged file
        } else {
          // deduplicated (already existed elsewhere) -> skip
          cacheHits++;
          totalFound++;
          continue;
        }
      }
    }

    if (!hasLive2DMarker(file)) {
      cache.entries[file] = { mtimeMs: stat.mtimeMs, size: stat.size, marker: false, cnt: 0, names: [], staged: [] };
      dirty = true;
      cacheSkippedMarker++;
      continue;
    }

    const outDir = path.join(TMP_BASE, base.replace('.unity3d', `_${i}`));
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
    const { cnt, names } = runLive2D(file, outDir);
    let staged = [];
    if (cnt > 0) {
      console.log(`[${i + 1}/${allFiles.length}] ${base} -> ${cnt} models ${names.join(', ')}`);
      totalFound++;
      staged = stageToOthers(outDir);
      if (staged.length > 0) {
        totalStaged += staged.length;
        // Regenerate manifest to include new others
        // --board-npc / --skin-names auto-resolve from the datamine (EN/language/en_US)
        // via generateManifest.mjs — no need to hardcode absolute path.
        spawnSync('node', [path.join(ROOT, 'scripts/generateManifest.mjs'),
          '--chars', CHARS_DIR,
          '--out', MODELS_JSON,
          '--names', path.join(ROOT, 'data/characterid.json'),
          '--disc-names', path.join(ROOT, 'data/discid.json'),
          '--charbg', path.join(ROOT, 'data/charbg.json'),
          '--offset', path.join(ROOT, 'data/offset.json'),
        ], { stdio: 'inherit' });
        // Ensure kind is other (generateManifest now handles it)
        // Also re-apply parallax/disc generation to keep others
        spawnSync('node', [path.join(ROOT, 'scripts/generateDiscs.mjs'),
          '--models', MODELS_JSON,
          '--parallax', path.join(ROOT, 'data/discparallax.json'),
          '--disc-names', path.join(ROOT, 'data/discid.json')
        ], { stdio: 'inherit' });
      }
    }
    cache.entries[file] = { mtimeMs: stat.mtimeMs, size: stat.size, marker: true, cnt, names, staged };
    dirty = true;

    // Clean up to save disk
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });

    // Periodically flush cache and report
    if (dirty && (i + 1) % 20 === 0) {
      saveCache(cache);
      dirty = false;
    }
    if ((i + 1) % 100 === 0) console.log(`Progress ${i + 1}/${allFiles.length}, found ${totalFound}, staged ${totalStaged}, cache hits ${cacheHits}`);
  }

  // Prune stale entries for files that no longer exist
  let pruned = 0;
  for (const k of Object.keys(cache.entries)) {
    if (!allFilesSet.has(k)) { delete cache.entries[k]; pruned++; dirty = true; }
  }
  if (dirty) saveCache(cache);
  console.log(`Done. Found ${totalFound} bundles with Live2D, staged ${totalStaged} new variants into Others (cache hits: ${cacheHits}, pruned: ${pruned})`);
  if (cacheSkippedMarker) console.log(`  marker pre-filter skipped ${cacheSkippedMarker} files without Live2D strings (also cached)`);
}

main();
