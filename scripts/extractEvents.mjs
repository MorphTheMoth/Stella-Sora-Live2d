#!/usr/bin/env node
/**
 * extractEvents.mjs — extract event-page character art (static PNG rigs) and
 * Spine skeletons from the game's ui_activity__* / ui_activity_* bundles, plus
 * the char_2dsp_* Spine variants of released trekkers/NPCs.
 *
 * Two rig flavors exist (see docs/AgentsReadme.md -> "Events entries"):
 *   - static: a `----Actor2D_PNG----` node (panel_offset -> actor_offset ->
 *     img_body + img_face UI Images).  The body is one full-frame sprite;
 *     the face overlay is assigned at runtime (C#), so only full-frame
 *     overlay sprites found in the bundle become `faces` (510001 has none).
 *   - spine:  binary .skel + .atlas (+ page PNGs) under a spine/ container,
 *     hosted at e.g. BOSS1Root/BOSS2Root.  All game Spine is 4.2.x, rendered
 *     by the vendored js/spine-pixi/ runtime.
 *
 * dotnet export flavors per bundle (into .dump_tmp/eventdump/<ref>/):
 *   go:     gameobject,transform,rectTransform dump  (-f pathID, keeps every
 *           asset: the assetName dump drops same-named sprites)
 *   mb:     monoBehaviour export (Image -> GO/sprite refs)
 *   sprite: sprite dump (-f pathID, same reason)
 *   tex:    texture2d dump (pathID -> texture name)
 *   texpng: texture2d PNG export
 *   raw:    textAsset export (.skel / .atlas)
 *
 * Staged art goes to events/<ref>/ (body PNGs, face overlays, spine/ dir);
 * per-event fragments go to .dump_tmp/eventstage/<ref>.json, merged by
 * generateEvents.mjs into data/events.json + the models.json Events section.
 *
 * Incremental: per-bundle mtime+size cache in .dump_tmp/events.cache.json.
 * Unchanged bundles are skipped; --force re-extracts everything.
 *
 * Usage:
 *   node scripts/extractEvents.mjs [--game DIR] [--force]
 *     [--out events] [--stage .dump_tmp/eventstage] [--tmp .dump_tmp/eventdump]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copyIfChanged } from './io.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const CLI = process.env.ASSETSTUDIO_CLI || '/home/morph/ssassets/assetStudioMod/AssetStudioModCLI.dll';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  let game = get('--game', '');
  if (!game) {
    const link = path.join(ROOT, '../Link to YostarGames/StellaSora_EN');
    try { game = fs.readlinkSync(link); } catch { game = link; }
    if (!path.isAbsolute(game)) game = path.resolve(ROOT, game);
  }
  return {
    game,
    force: args.includes('--force') || args.includes('-f'),
    outDir: path.resolve(get('--out', path.join(ROOT, 'events'))),
    stageDir: path.resolve(get('--stage', path.join(ROOT, '.dump_tmp/eventstage'))),
    tmpDir: path.resolve(get('--tmp', path.join(ROOT, '.dump_tmp/eventdump'))),
    cacheFile: path.resolve(get('--cache', path.join(ROOT, '.dump_tmp/events.cache.json'))),
  };
}

// --- tiny dump parsers (same conventions as extractDiscParallax.mjs) --------

function listFiles(root) {
  const out = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else out.push(p);
    }
  })(root);
  return out;
}

function parseFields(text) {
  const fields = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const depth = (line.match(/^\t*/) || [''])[0].length;
    if (depth === 1) {
      const m = line.match(/\bm_([A-Za-z0-9_]+)\b/);
      cur = { name: m ? m[1] : line.trim(), block: [] };
      fields.push(cur);
    }
    if (cur) cur.block.push(line);
  }
  return fields;
}

const PATHID_RE = /SInt64 m_PathID = (-?\d+)/g;
function allPathIDs(block) {
  const s = Array.isArray(block) ? block.join('\n') : String(block);
  const out = [];
  let m;
  PATHID_RE.lastIndex = 0;
  while ((m = PATHID_RE.exec(s))) out.push(m[1]);
  return out;
}
function strVal(block) {
  const s = Array.isArray(block) ? block.join('\n') : String(block);
  const m = /string m_Name = "([^"]*)"/.exec(s);
  return m ? m[1] : null;
}
function fieldOf(fields, name) {
  const f = fields.find((x) => x.name === name);
  return f ? f.block : [];
}
function vec2(block, key) {
  const s = Array.isArray(block) ? block.join('\n') : String(block);
  const m = new RegExp(key + '\\s*\\n\\s*float x = ([-\\.0-9Ee+]+)\\s*\\n\\s*float y = ([-\\.0-9Ee+]+)').exec(s);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}

// PNG dimensions from the IHDR chunk (no image lib needed).
function pngSize(p) {
  const b = Buffer.alloc(32);
  const fd = fs.openSync(p, 'r');
  try {
    if (fs.readSync(fd, b, 0, 32, 0) < 24) return null;
  } finally { fs.closeSync(fd); }
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function runDotnet(args) {
  const env = { ...process.env, DOTNET_ROLL_FORWARD: 'Major' };
  return spawnSync('dotnet', [CLI, ...args], { env, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
}

function loadCache(f) {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (d && typeof d.entries === 'object') return d;
  } catch { /* fresh */ }
  return { version: 1, entries: {} };
}
function saveCache(f, c) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, f);
}

// --- bundle discovery -------------------------------------------------------

function discoverBundles(game) {
  const dirs = [
    path.join(game, 'Persistent_Store/AssetBundles'),
    path.join(game, 'StellaSora_Data/StreamingAssets/InstallResource'),
  ];
  const byBase = new Map(); // basename -> path (Persistent_Store wins)
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.unity3d')) continue;
      if (!/^ui_activity/.test(f) && !/^char_2dsp_/.test(f)) continue;
      const full = path.join(dir, f);
      const cur = byBase.get(f);
      if (!cur) { byBase.set(f, full); continue; }
      if (full.includes('Persistent_Store') && !cur.includes('Persistent_Store')) byBase.set(f, full);
    }
  }
  return [...byBase.values()].sort();
}

function refOfBundle(bundlePath) {
  const base = path.basename(bundlePath, '.unity3d');
  let m = /^ui_activity__?(.+?)(?:\.en)?$/.exec(base);
  if (m) return { ref: m[1], en: base.endsWith('.en'), activity: m[1] };
  m = /^char_2dsp_(.+)$/.exec(base);
  if (m) return { ref: 'sp' + m[1], en: false, spineSkin: m[1] };
  return null;
}

// --- per-bundle extraction --------------------------------------------------

function parseGoDump(goDir) {
  const gos = new Map(); // goPathID -> {name, comps[]}
  const trGo = new Map(); // transformPathID -> goPathID
  const trFather = new Map(); // transformPathID -> fatherTransformPathID
  const trKids = new Map(); // transformPathID -> [childTransformPathID]
  for (const p of listFiles(goDir)) {
    const pidM = /[\\/](?:[^\\/]*?@)?(-?\d+)\.txt$/.exec(p);
    if (!pidM) continue;
    const pid = pidM[1];
    const text = fs.readFileSync(p, 'utf8');
    const first = text.split('\n')[0];
    const fields = parseFields(text);
    if (first.startsWith('GameObject')) {
      gos.set(pid, {
        name: strVal(fieldOf(fields, 'Name')),
        comps: allPathIDs(fieldOf(fields, 'Component')),
      });
    } else if (first.startsWith('Transform') || first.startsWith('RectTransform')) {
      const goIds = allPathIDs(fieldOf(fields, 'GameObject'));
      const fatherIds = allPathIDs(fieldOf(fields, 'Father'));
      const kidIds = allPathIDs(fieldOf(fields, 'Children'));
      if (goIds.length) trGo.set(pid, goIds[0]);
      if (fatherIds.length) trFather.set(pid, fatherIds[0]);
      trKids.set(pid, kidIds);
    }
  }
  return { gos, trGo, trFather, trKids };
}

// Walk from a GO up through transforms to the scene root.
function ancestors(goPid, gos, trGo, trFather) {
  const chain = [];
  const goTr = new Map([...trGo.entries()].map(([t, g]) => [g, t]));
  let tr = goTr.get(goPid);
  const seen = new Set();
  while (tr && !seen.has(tr)) {
    seen.add(tr);
    const father = trFather.get(tr);
    if (!father || father === '0') break;
    const fgo = trGo.get(father);
    if (!fgo) break;
    const g = gos.get(fgo);
    chain.push({ go: fgo, name: g ? g.name : null });
    tr = goTr.get(fgo);
  }
  return chain;
}

function parseImages(mbDir) {
  const images = new Map(); // goPathID -> spritePathID (null when unset)
  // NOTE: pathIDs exceed 2^53 — JSON.parse would corrupt them into floats,
  // so extract them as raw strings with a regex instead.
  const goRe = /"m_GameObject"\s*:\s*\{\s*"m_FileID"\s*:\s*\d+\s*,\s*"m_PathID"\s*:\s*(-?\d+)/;
  const sprRe = /"m_Sprite"\s*:\s*\{\s*"m_FileID"\s*:\s*\d+\s*,\s*"m_PathID"\s*:\s*(-?\d+)/;
  for (const p of listFiles(mbDir)) {
    if (!/(^|[\\/])Image_#\d+\.json$/.test(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const go = goRe.exec(text);
    const spr = sprRe.exec(text);
    if (!go || !spr) continue;
    images.set(go[1], spr[1] === '0' ? null : spr[1]);
  }
  return images;
}

function parseSprites(spriteDir) {
  const sprites = new Map(); // spritePathID -> {name, rect, tex}
  for (const p of listFiles(spriteDir)) {
    const pidM = /[\\/\\\\](-?\d+)\.txt$/.exec(p);
    if (!pidM) continue;
    const text = fs.readFileSync(p, 'utf8');
    if (!text.startsWith('Sprite')) continue;
    const name = strVal(text);
    const rm = /Rectf m_Rect\s*\n\s*float x = ([-\.\dEe+]+)\s*\n\s*float y = ([-\.\dEe+]+)\s*\n\s*float width = ([-\.\dEe+]+)\s*\n\s*float height = ([-\.\dEe+]+)/.exec(text);
    const rect = rm ? { x: +rm[1], y: +rm[2], w: +rm[3], h: +rm[4] } : null;
    const texM = /PPtr<Texture2D> texture\s*\n\s*int m_FileID = \d+\s*\n\s*SInt64 m_PathID = (-?\d+)/.exec(text);
    sprites.set(pidM[1], { name, rect, tex: texM ? texM[1] : null });
  }
  return sprites;
}

function parseTextures(texDir) {
  const names = new Map(); // texturePathID -> texture name
  for (const p of listFiles(texDir)) {
    const m = /^(.*?) @(-?\d+)\.txt$/.exec(path.basename(p));
    if (m) names.set(m[2], m[1]);
  }
  return names;
}

function findPng(texPngDir, texName) {
  if (!texName) return null;
  const hits = listFiles(texPngDir).filter((p) => path.basename(p) === texName + '.png');
  return hits.length ? hits[0] : null;
}

function processBundle(bundle, dirs, ref, fresh) {
  const { goDir, mbDir, spriteDir, texDir, texPngDir, rawDir } = dirs;
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
  // Reuse on-disk exports when they came from this exact bundle version
  // (cache hit without a fragment, e.g. after a parser fix): only run the
  // dotnet flavors whose output dir is empty.
  const runFlavor = (dir, args, label) => {
    if (!fresh && fs.readdirSync(dir).length) return;
    const r = runDotnet(args);
    if (r.status !== 0) console.error(`  ${label} FAILED for ${path.basename(bundle)}`);
  };

  let r = runFlavor(goDir, [bundle, '-m', 'dump', '-t', 'gameobject,transform,rectTransform', '-f', 'pathID', '--load-all', '-o', goDir], 'go dump');
  r = runFlavor(mbDir, [bundle, '-m', 'export', '-t', 'monoBehaviour', '-o', mbDir], 'monoBehaviour export');
  r = runFlavor(spriteDir, [bundle, '-m', 'dump', '-t', 'sprite', '-f', 'pathID', '--load-all', '-o', spriteDir], 'sprite dump');
  r = runFlavor(texDir, [bundle, '-m', 'dump', '-t', 'texture2d', '-f', 'assetName_pathID', '--load-all', '-o', texDir], 'texture dump');
  r = runFlavor(texPngDir, [bundle, '-m', 'export', '-t', 'texture2d', '-o', texPngDir, '--image-format', 'png'], 'texture export');
  r = runFlavor(rawDir, [bundle, '-m', 'export', '-t', 'textAsset', '-o', rawDir], 'textAsset export');

  const { gos, trGo, trFather } = parseGoDump(goDir);
  const images = parseImages(mbDir);
  const sprites = parseSprites(spriteDir);
  const texNames = parseTextures(texDir);

  // --- static rigs: ----Actor2D_PNG---- nodes, else lone img_body/img_face --
  const rigGos = [...gos.entries()].filter(([, g]) => g.name === '----Actor2D_PNG----').map(([pid]) => pid);
  const bodyGos = [...gos.entries()].filter(([, g]) => g.name === 'img_body').map(([pid]) => pid);
  const faceGos = [...gos.entries()].filter(([, g]) => g.name === 'img_face').map(([pid]) => pid);

  const rigs = [];
  const underRig = (goPid) => {
    if (!rigGos.length) return true; // no named rig: take every img_body/face
    const chain = ancestors(goPid, gos, trGo, trFather).map((a) => a.go);
    return rigGos.some((r) => r === goPid || chain.includes(r));
  };
  const usedBodies = new Set();
  for (const rig of rigGos.length ? rigGos : [null]) {
    const bodies = bodyGos.filter((b) => (rig === null || underRig(b)) && !usedBodies.has(b));
    if (!bodies.length) continue;
    for (const b of bodies) {
      usedBodies.add(b);
      const sprPid = images.get(b);
      if (!sprPid) { console.log(`  rig ${gos.get(rig)?.name || 'root'}: img_body has no sprite, skipped`); continue; }
      const spr = sprites.get(sprPid);
      if (!spr) { console.log(`  img_body sprite @${sprPid} missing from dump, skipped`); continue; }
      const texName = texNames.get(spr.tex);
      const png = findPng(texPngDir, texName || spr.name);
      if (!png) { console.log(`  texture PNG for '${texName || spr.name}' not exported, skipped`); continue; }
      const size = pngSize(png);
      rigs.push({ rigGo: rig, bodyGo: b, body: { sprPid, sprName: spr.name, tex: texName, png, w: size?.w || 0, h: size?.h || 0, rect: spr.rect } });
    }
  }
  // faces: face-GO sprite when it is a full-frame overlay of the body
  const faces = [];
  for (const f of faceGos.filter(underRig)) {
    const sprPid = images.get(f);
    if (!sprPid || !rigs.length) continue;
    const spr = sprites.get(sprPid);
    if (!spr) continue;
    const body = rigs[0].body;
    if (spr.rect && body.w && spr.rect.w === body.w && spr.rect.h === body.h) {
      const texName = texNames.get(spr.tex);
      const png = findPng(texPngDir, texName || spr.name);
      if (png) faces.push({ sprName: spr.name, tex: texName, png, w: body.w, h: body.h, x: 0, y: 0 });
    } else {
      console.log(`  img_face sprite '${spr.name}' is not a full-frame overlay, ignored`);
    }
  }

  // --- spine: .skel + same-name .atlas pairs --------------------------------
  const spines = [];
  const rawFiles = listFiles(rawDir);
  const byName = new Map(rawFiles.map((p) => [path.basename(p), p]));
  for (const p of rawFiles) {
    if (!p.endsWith('.skel')) continue;
    const base = path.basename(p, '.skel');
    const atlasHit = [...byName.entries()].find(([n]) => n === base + '.atlas');
    if (!atlasHit) { console.log(`  ${base}.skel has no .atlas, skipped`); continue; }
    const atlasText = fs.readFileSync(atlasHit[1], 'utf8').replace(/^\uFEFF/, '');
    const pages = [...new Set(atlasText.split('\n').map((l) => l.trim()).filter((l) => /\.png$/i.test(l)))];
    const textures = [];
    for (const pg of pages) {
      const png = findPng(texPngDir, pg.replace(/\.png$/i, '')) || [...listFiles(texPngDir)].find((q) => path.basename(q).toLowerCase() === pg.toLowerCase());
      if (!png) { console.log(`  spine ${base}: page '${pg}' not exported, skipped`); continue; }
      const size = pngSize(png);
      textures.push({ file: path.basename(png), png, w: size?.w || 0, h: size?.h || 0 });
    }
    if (!textures.length) continue;
    const maxDim = Math.max(...textures.map((t) => Math.max(t.w, t.h)));
    spines.push({ name: base, skelFile: path.basename(p), atlasFile: path.basename(atlasHit[1]), skelSrc: p, atlasSrc: atlasHit[1], textures, maxDim });
  }

  // Static-body override for bundles whose img_body is runtime-assigned.
  if (!rigs.length && STATIC_BODY[ref]) {
    for (const texName of STATIC_BODY[ref]) {
      const pid = [...texNames.entries()].find(([, n]) => n === texName)?.[0];
      const spr = [...sprites.values()].find((s) => s.name === texName);
      const png = findPng(texPngDir, texName);
      if (!png) { console.log(`  override texture '${texName}' not exported, skipped`); continue; }
      const size = pngSize(png);
      rigs.push({
        rigGo: null, bodyGo: null,
        body: { sprPid: spr ? null : pid, sprName: texName, tex: texName, png, w: size?.w || 0, h: size?.h || 0, rect: spr?.rect || null },
      });
    }
  }

  return { rigs, faces, spines, goCount: gos.size };
}

// --- staging ----------------------------------------------------------------

const MIN_SPINE_TEX = 768; // smaller skeletons are UI decorations, not entries

// Bundles whose img_body sprite is assigned at runtime (C#), so the prefab
// carries no sprite: texture names (verified character art) to stage as the
// static body instead.
const STATIC_BODY = {
  '301041': ['LoginNpc_7160'],
  '600003': ['TravelerDuel_002'],
};

function stage(bundle, ref, found, outDir) {
  const dest = path.join(outDir, ref);
  const frag = { ref, bundle: path.basename(bundle), static: null, spines: [] };
  let n = 0;
  for (const [i, rig] of found.rigs.entries()) {
    const bodyFile = found.rigs.length > 1 ? `body${i + 1}.png` : 'body.png';
    fs.mkdirSync(dest, { recursive: true });
    copyIfChanged(rig.body.png, path.join(dest, bodyFile));
    if (i === 0) {
      frag.static = { body: bodyFile, w: rig.body.w, h: rig.body.h, faces: [] };
      if (rig.body.rect && (rig.body.rect.w !== rig.body.w || rig.body.rect.h !== rig.body.h || rig.body.rect.x !== 0 || rig.body.rect.y !== 0)) {
        frag.static.frame = rig.body.rect; // packed sprite: viewer crops at runtime
      }
    } else {
      frag.static.extra = frag.static.extra || [];
      frag.static.extra.push({ body: bodyFile, w: rig.body.w, h: rig.body.h });
    }
    n++;
  }
  if (frag.static) {
    for (const f of found.faces) {
      const faceFile = `face_${f.sprName}.png`;
      copyIfChanged(f.png, path.join(dest, faceFile));
      frag.static.faces.push({ name: f.sprName, file: faceFile, w: f.w, h: f.h, x: f.x, y: f.y });
      n++;
    }
  }
  for (const s of found.spines) {
    if (s.maxDim < MIN_SPINE_TEX) { console.log(`  spine ${s.name}: max texture ${s.maxDim}px < ${MIN_SPINE_TEX}, skipped as decoration`); continue; }
    const sdir = path.join(dest, 'spine');
    fs.mkdirSync(sdir, { recursive: true });
    copyIfChanged(s.skelSrc, path.join(sdir, s.skelFile));
    copyIfChanged(s.atlasSrc, path.join(sdir, s.atlasFile));
    const tex = [];
    for (const t of s.textures) {
      copyIfChanged(t.png, path.join(sdir, t.file));
      tex.push({ file: t.file, w: t.w, h: t.h });
    }
    frag.spines.push({ name: s.name, skel: s.skelFile, atlas: s.atlasFile, textures: tex });
    n++;
  }
  return { frag, n };
}

// --- main -------------------------------------------------------------------

function main() {
  const o = parseArgs();
  if (!fs.existsSync(path.join(o.game, 'Persistent_Store/AssetBundles')) &&
      !fs.existsSync(path.join(o.game, 'StellaSora_Data/StreamingAssets/InstallResource'))) {
    console.error(`game dir has no asset stores: ${o.game}`);
    process.exit(1);
  }
  const cache = loadCache(o.cacheFile);
  if (o.force) console.log('Force mode: ignoring cache');
  fs.mkdirSync(o.stageDir, { recursive: true });

  const bundles = discoverBundles(o.game);
  console.log(`Found ${bundles.length} event/spine bundles`);
  let hits = 0, staged = 0;
  for (let bundle of bundles) {
    const info = refOfBundle(bundle);
    if (!info || info.en) continue; // .en twins handled as fallback below
    const { ref } = info;
    const st = fs.statSync(bundle);
    const c = cache.entries[bundle];
    const fragPath = path.join(o.stageDir, ref + '.json');
    if (!o.force && c && c.mtimeMs === st.mtimeMs && c.size === st.size && c.ok && fs.existsSync(fragPath)) {
      hits++;
      continue;
    }
    // Bundle changed (or first run): drop previous dumps so runFlavor
    // re-exports instead of reusing stale output.
    const fresh = o.force || !c || c.mtimeMs !== st.mtimeMs || c.size !== st.size;
    const refTmp = path.join(o.tmpDir, ref);
    if (fresh && fs.existsSync(refTmp)) fs.rmSync(refTmp, { recursive: true, force: true });
    console.log(`=== ${path.basename(bundle)} -> events/${ref}/ ===`);
    const dirs = {
      goDir: path.join(o.tmpDir, ref, 'go'),
      mbDir: path.join(o.tmpDir, ref, 'mb'),
      spriteDir: path.join(o.tmpDir, ref, 'sprite'),
      texDir: path.join(o.tmpDir, ref, 'tex'),
      texPngDir: path.join(o.tmpDir, ref, 'texpng'),
      rawDir: path.join(o.tmpDir, ref, 'raw'),
    };
    let found = processBundle(bundle, dirs, ref, fresh);
    // .en fallback: main bundle with no rig and no spine may keep its art
    // in the localized twin (e.g. text-bearing event art).
    if (!found.rigs.length && !found.spines.length) {
      const enTwin = bundle.replace(/\.unity3d$/, '.en.unity3d');
      if (fs.existsSync(enTwin)) {
        console.log(`  no rig/spine in main, trying ${path.basename(enTwin)}`);
        const enDirs = Object.fromEntries(Object.entries(dirs).map(([k, v]) => [k, v + '_en']));
        found = processBundle(enTwin, enDirs, ref, fresh);
        if (found.rigs.length || found.spines.length) {
          console.log(`  using .en twin for ${ref}`);
          bundle = enTwin;
        }
      }
    }
    console.log(`  gos: ${found.goCount}, rigs: ${found.rigs.length}, faces: ${found.faces.length}, spines: ${found.spines.map((s) => s.name).join(', ') || 0}`);
    const { frag, n } = stage(bundle, ref, found, o.outDir);
    if (n > 0) {
      fs.writeFileSync(fragPath, JSON.stringify(frag, null, 2));
      staged++;
    } else {
      try { fs.unlinkSync(fragPath); } catch { /* no entry */ }
    }
    cache.entries[bundle] = { mtimeMs: st.mtimeMs, size: st.size, ok: true, ref };
    saveCache(o.cacheFile, cache);
  }
  // prune stale cache entries + fragments of vanished bundles
  for (const k of Object.keys(cache.entries)) {
    if (!fs.existsSync(k)) {
      const r = cache.entries[k].ref;
      try { fs.unlinkSync(path.join(o.stageDir, r + '.json')); } catch { /* gone */ }
      delete cache.entries[k];
    }
  }
  saveCache(o.cacheFile, cache);
  console.log(`Done. ${staged} event refs staged into ${o.outDir} (cache hits: ${hits})`);
}

main();
