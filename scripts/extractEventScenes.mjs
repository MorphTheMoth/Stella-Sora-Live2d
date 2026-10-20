#!/usr/bin/env node
/**
 * extractEventScenes.mjs — extract full event-page scene compositions.
 *
 * Spine/static event entries (20103_Summer, 10109GunStorm, JointDrill bosses,
 * ...) are not standalone art: in-game they render inside a page prefab
 * (SummerCheckinPanel, GunStormPanel, JointDrillLevelSelect, ...) together
 * with background layers (----Bg---/---Bg--- subtree), foreground decor
 * (leaves, lines, chains, smoke) and UI chrome (buttons, bars — skipped).
 * Showing only the character drops all of that (e.g. 20103 showed the girl
 * with no beach).
 *
 * For each configured ref this script walks the host panel's scenic subtree(s)
 * in hierarchy (painter's) order, resolves every UI Image through
 * Sprite -> Texture2D to its exported PNG, stages them to
 * events/<ref>/scene/, and records canvas-space rects (2160x1080 CanvasScaler
 * reference) plus the character slot (charRect + its position in draw order)
 * into the existing .dump_tmp/eventstage/<ref>.json fragment (merge — the
 * static/spine fields from extractEvents.mjs are kept). generateEvents.mjs
 * passes scenes through to data/events.json; main.js renders
 * behind[] -> character -> front[].
 *
 * Per-scene config knobs (see SCENES below):
 *   - walkRoots/behindRoots/frontRoots: which subtrees are scenic art.
 *   - charGO (name or [names]) + combine: one character, or a combined scene
 *     with one slot per name (scene.chars[], single entry `<ref>event`).
 *   - charSpine: map a character GO name to its staged Spine name when they
 *     differ (e.g. `sp_mw_L` -> `20104_mw_Female`).
 *   - interleaved: build `scene.draw`, the hierarchy's exact painter order
 *     with `{spine}` placeholders between image layers (characters nested in
 *     different scenic groups, e.g. 20104).  Without it the viewer uses the
 *     behind[] -> characters -> front[] split.
 *   - charOrigin: place the Spine at the RectTransform pivot (the game's
 *     SkeletonGraphic layout) instead of centring it in the slot; only used
 *     where a painted underlay confirms the alignment.
 *   - excludeTextures: texture basenames to drop.
 *   - extras: stills for things we can't simulate (particle systems), with
 *     explicit canvas rects; `scroll: [x,y]` tiles/second animates a
 *     scrolling texture (the material's auto-panner), `alpha` softens it.
 *   - skipMaskSubtrees: skip `imgMask*` subtrees (full-screen decorations the
 *     game clips with runtime-assigned mask graphics; unmasked they'd cover
 *     the scene).
 * Exact duplicate layers (same sprite/rect laid twice) are collapsed.
 *
 * Layout math: scenic nodes all use 0.5/0.5 anchors, so a node's canvas
 * centre = sum of anchoredPositions up the chain (times accumulated scale,
 * prefab-root scale 0 treated as 1) + (0.5 - pivot) * size. Size =
 * sizeDelta * accumulated scale. Rotation is expected to be identity
 * (warned + ignored otherwise).
 *
 * Chrome skipped by construction: only the configured scenic roots are
 * walked (SafeAreaRoot button bars, TopBarPanel, LevelInfo, BossSkill,
 * AVGWindow, UIParticle* (no Image anyway), TextMeshProUGUI (not Images)
 * are never entered). Layers whose sprite/texture/PNG can't be resolved are
 * skipped with a log line.
 *
 * Usage:
 *   node scripts/extractEventScenes.mjs [--force]
 *     [--stage .dump_tmp/eventstage] [--tmp .dump_tmp/eventdump]
 *     [--out events] [--refs 20103,10109,510007,510001,510005,510006,301041]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyIfChanged, writeTextIfChanged } from './io.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

const CANVAS_W = 2160;
const CANVAS_H = 1080;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    force: args.includes('--force') || args.includes('-f'),
    stageDir: path.resolve(get('--stage', path.join(ROOT, '.dump_tmp/eventstage'))),
    tmpDir: path.resolve(get('--tmp', path.join(ROOT, '.dump_tmp/eventdump'))),
    outDir: path.resolve(get('--out', path.join(ROOT, 'events'))),
    refs: (get('--refs', '') || '').split(',').filter(Boolean),
  };
}

// ref -> scene config. panel: host page prefab GO name. Walk model:
// - walkRoots: ordered GO names walked depth-first; the character host GO
//   encountered mid-walk splits behind/front at that point.
// - behindRoots/frontRoots + charGO: scenic image subtrees around a character
//   that is NOT walked (static rigs); charRect taken from charGO's TR.
// skipRoots: subtrees to skip when encountered (e.g. the sibling boss).
const SCENES = {
  // SummerCheckinPanel: ---Bg--- holds Back/Middle(sp_Role)/Front + Leaves +
  // Water; imgWind/lineGroup/xiaoguotu are panel-level foreground.  ---Deco---
  // is the task-list UI ornament (progress stars), not scene art.
  //
  // `bg_summercheckin_main` (Bg) is the panel's base illustration and already
  // includes the girl; the Spine `sp_Role` is laid out by the game on top of
  // her (pivot placement, see `layoutOf`), so the painted girl is the underlay
  // the Spine animates over — not a duplicate to drop.  The waterfall is both
  // painted in that illustration and animated by the `pubu01` particle
  // (material fx_20103_pubu_01 -> fx_20103_bowen_04); we add a semi-transparent
  // scrolling still over the painted one for the motion.
  '20103': {
    panel: 'SummerCheckinPanel', sub: '20103',
    // ---Bg--- is the illustrated scene; lineGroup/xiaoguotu are UI ornaments
    // (thin ribbons/lines), not part of it.
    walkRoots: ['---Bg---'],
    charGO: 'sp_Role', forSpine: '20103_Summer',
    // The painted girl is the underlay the Spine animates over, and aligns
    // iff the Spine is placed at the RectTransform pivot (SkeletonGraphic
    // layout) instead of centred in the rect.
    charOrigin: true,
    extras: [
      // x/y/w/h derived from the waterfall column in bg_summercheckin_main
      // mapped through the Bg layer's layout (centre 0,0; 2282.96x1665.6).
      // The texture scrolls vertically (material fx_20103_pubu_01
      // `_BaseAutoPannerSpeed`/`_BaseVerticalSpeed`), scroll in tiles/second;
      // alpha < 1 matches the game's particle over the painted water.
      { name: 'pubu01', texture: 'fx_20103_bowen_04', x: -211.3, y: -375.4, w: 318.8, h: 914.9, front: true, scroll: [0, -0.1], alpha: 0.45 },
    ],
  },
  // DustDawnPanel (Wholeness at Reunion's Dawn): one wide event page holding
  // the whole cast — Downdust + Iris in the midground scene groups and the two
  // chibi mascots in the foreground groups.  Each is a SkeletonGraphic nested
  // inside its own scenic layer, so the page must be drawn in hierarchy order
  // with the characters interleaved between the image layers (`interleaved`).
  // The chibi skeletons are char_2dsp-style files whose names (mw_Female/
  // mw_Male) don't match their GO names (sp_mw_L/sp_mw_R), hence `charSpine`.
  '20104': {
    panel: 'DustDawnPanel', sub: '_20104',
    walkRoots: ['---Bg---', 'imgBlack_Glow', 'imgBlack_R', 'imgBlack_L',
      'imgStarLine', 'imgStarLine2', 'imgStarLine3'],
    charGO: ['sp_Downdust', 'sp_Iris', 'sp_mw_L', 'sp_mw_R'],
    charSpine: {
      sp_Downdust: '20104_Downdust', sp_Iris: '20104_Iris',
      sp_mw_L: '20104_mw_Female', sp_mw_R: '20104_mw_Male',
    },
    // bg_dustdawn_main_1 is the fully painted composite of this same page
    // (characters included); the game fades it out once the live Spines are
    // in, so overlaying it here just doubles the still art over the animated
    // scene.
    excludeTextures: ['bg_dustdawn_main_1'],
    combine: true, charOrigin: true, interleaved: true,
  },
  // GunStormPanel: ---Bg--- behind; ---Fg--- holds masks/lines + the
  // character (BodyConstraintBG/imgBody/SpBody) in hierarchy order.  The
  // imgMask*/imgPattern nodes are full-screen lattices clipped in-game by
  // runtime-assigned mask graphics — unmasked they cover the whole saloon.
  '10109': {
    panel: 'GunStormPanel', sub: '10109',
    walkRoots: ['---Bg---', '---Fg---'],
    charGO: 'SpBody', forSpine: '10109GunStorm',
    skipMaskSubtrees: true,
  },
  // JointDrillLevelSelect: ----Bg---- (mountains/buildings/smoke) + chains
  // behind; BOSS1Root/BOSS2Root host the two season bosses.  Both are shown
  // together in one scene (a single background with two character slots).
  '510007': {
    panel: 'JointDrillLevelSelect', sub: '_510007',
    walkRoots: ['----Bg----', 'imgChain1', 'imgChain2', 'imgChain3', 'BOSS1Root', 'BOSS2Root', 'goSmoke'],
    charGO: ['BOSS1', 'BOSS2'], combine: true,
    skipMaskSubtrees: true,
  },
  // Same page, static boss art in ----Actor2D_PNG----/img_body (prefab sprite).
  '510001': {
    panel: 'JointDrillLevelSelect', sub: '_510001',
    behindRoots: ['----Bg----', 'imgChain1', 'imgChain2', 'imgChain3'],
    frontRoots: ['goSmoke'],
    charGO: 'img_body', charAncestor: '----Actor2D_PNG----', forStatic: true,
  },
  '510005': {
    panel: 'JointDrillLevelSelect', sub: '_510005',
    behindRoots: ['----Bg----', 'imgChain1', 'imgChain2', 'imgChain3'],
    frontRoots: ['goSmoke'],
    charGO: 'img_body', charAncestor: '----Actor2D_PNG----', forStatic: true,
  },
  '510006': {
    panel: 'JointDrillLevelSelect', sub: '_510006',
    behindRoots: ['----Bg----', 'imgChain1', 'imgChain2', 'imgChain3'],
    frontRoots: ['goSmoke'],
    charGO: 'img_body', charAncestor: '----Actor2D_PNG----', forStatic: true,
  },
  // LoginSpReward_01: imgActivity backdrop + rtActor bust (runtime/override
  // art staged as body.png).
  '301041': {
    panel: 'LoginSpReward_01', sub: '_301041',
    behindRoots: ['imgActivity'],
    frontRoots: [],
    charGO: 'imgActor1', forStatic: true,
  },
};

// --- dump parsing (same conventions as extractEvents.mjs) -------------------

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

function fieldStr(fields, name, key) {
  const f = fields.find((x) => x.name === name);
  if (!f) return null;
  const m = new RegExp(key + ' = "([^"]*)"').exec(f.block.join('\n'));
  return m ? m[1] : null;
}
function fieldVec(fields, name, key, n) {
  const f = fields.find((x) => x.name === name);
  if (!f) return null;
  const s = f.block.join('\n');
  const m = new RegExp(key + '\\s*\\n\\s*' +
    Array.from({ length: n }, (_, i) => 'float ' + 'xyz'[i] + ' = ([-\\.0-9Ee+]+)').join('\\s*\\n\\s*')).exec(s);
  return m ? Array.from({ length: n }, (_, i) => parseFloat(m[i + 1])) : null;
}
function fieldPathIDs(fields, name) {
  const f = fields.find((x) => x.name === name);
  if (!f) return [];
  const s = f.block.join('\n');
  const out = [];
  const re = /SInt64 m_PathID = (-?\d+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

// Scene-graph store for one bundle: gos, trs (go/father/children/ap/sd/pv/scale/rotZ).
function loadGraph(goDir) {
  const gos = new Map(); // goPid -> {name}
  const trs = new Map(); // trPid -> {go,father,children,ap,sd,pv,sc,rz}
  for (const p of listFiles(goDir)) {
    const pidM = /[\\/](?:[^\\/]*?@)?(-?\d+)\.txt$/.exec(p);
    if (!pidM) continue;
    const pid = pidM[1];
    const text = fs.readFileSync(p, 'utf8');
    const first = text.split('\n')[0];
    const fields = parseFields(text);
    if (first.startsWith('GameObject')) {
      gos.set(pid, { name: fieldStr(fields, 'Name', 'string m_Name') });
    } else if (first.startsWith('Transform') || first.startsWith('RectTransform')) {
      const go = fieldPathIDs(fields, 'GameObject')[0] || null;
      const father = fieldPathIDs(fields, 'Father')[0] || null;
      const kids = fieldPathIDs(fields, 'Children');
      const ap = fieldVec(fields, 'AnchoredPosition', 'm_AnchoredPosition', 2) ||
        fieldVec(fields, 'LocalPosition', 'm_LocalPosition', 2) || [0, 0];
      const sd = fieldVec(fields, 'SizeDelta', 'm_SizeDelta', 2) || [0, 0];
      const pv = fieldVec(fields, 'Pivot', 'm_Pivot', 2) || [0.5, 0.5];
      const sc = fieldVec(fields, 'LocalScale', 'm_LocalScale', 3) || [1, 1, 1];
      const rot = fieldVec(fields, 'LocalRotation', 'm_LocalRotation', 4) || [0, 0, 0, 1];
      // z-rotation from quaternion (scenic nodes are unrotated; warn if not)
      const rz = Math.atan2(2 * (rot[3] * rot[2] + rot[0] * rot[1]), 1 - 2 * (rot[1] * rot[1] + rot[2] * rot[2]));
      trs.set(pid, { go, father, children: kids, ap, sd, pv, sc, rz });
    }
  }
  return { gos, trs };
}

function parseImages(mbDir) {
  const images = new Map(); // goPid -> {sprite, color:[r,g,b,a]}
  const goRe = /"m_GameObject"\s*:\s*\{\s*"m_FileID"\s*:\s*\d+\s*,\s*"m_PathID"\s*:\s*(-?\d+)/;
  const sprRe = /"m_Sprite"\s*:\s*\{\s*"m_FileID"\s*:\s*\d+\s*,\s*"m_PathID"\s*:\s*(-?\d+)/;
  const colRe = /"m_Color"\s*:\s*\{\s*"r"\s*:\s*([-\\.0-9Ee+]+)\s*,\s*"g"\s*:\s*([-\\.0-9Ee+]+)\s*,\s*"b"\s*:\s*([-\\.0-9Ee+]+)\s*,\s*"a"\s*:\s*([-\\.0-9Ee+]+)/;
  const typeRe = /"m_Type"\s*:\s*(\d+)/;
  for (const p of listFiles(mbDir)) {
    if (!/(^|[\\/])Image_#\d+\.json$/.test(p) && !/(^|[\\/])Image\.json$/.test(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const go = goRe.exec(text);
    const spr = sprRe.exec(text);
    if (!go || !spr) continue;
    if (spr[1] === '0') continue;
    const col = colRe.exec(text);
    const color = col ? [parseFloat(col[1]), parseFloat(col[2]), parseFloat(col[3]), parseFloat(col[4])] : [1, 1, 1, 1];
    const ty = typeRe.exec(text);
    // m_Type: 0 Simple, 1 Sliced, 2 Tiled, 3 Filled.
    images.set(go[1], { sprite: spr[1], color, type: ty ? parseInt(ty[1], 10) : 0 });
  }
  return images;
}

// SkeletonGraphic components: the mesh is generated at skeleton origin +
// pivotOffset (canvas units, Unity y-up), so a non-zero pivotOffset shifts a
// character relative to its RectTransform pivot — e.g. 20104 mw_Female has
// (62.23, 98.12) and would otherwise sit ~98px too low.  layoutScaleMode
// None (0) uses pivotOffset directly; other modes scale it by layoutScale.
function parseSkeletonGraphicOffsets(mbDir) {
  const out = new Map(); // goPathID -> {x, y}
  const goRe = /"m_GameObject"\s*:\s*\{\s*"m_FileID"\s*:\s*\d+\s*,\s*"m_PathID"\s*:\s*(-?\d+)/;
  const offRe = /"pivotOffset"\s*:\s*\{\s*"x"\s*:\s*([-.0-9Ee+]+)\s*,\s*"y"\s*:\s*([-.0-9Ee+]+)/;
  const modeRe = /"layoutScaleMode"\s*:\s*(-?\d+)/;
  const scaleRe = /"layoutScale"\s*:\s*([-.0-9Ee+]+)/;
  for (const p of listFiles(mbDir)) {
    if (!/(^|[\\/])SkeletonGraphic[^\\/]*\.json$/.test(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const go = goRe.exec(text);
    const off = offRe.exec(text);
    if (!go || !off) continue;
    const mode = modeRe.exec(text);
    const ls = scaleRe.exec(text);
    const k = (mode && mode[1] !== '0' && ls) ? parseFloat(ls[1]) : 1;
    out.set(go[1], { x: parseFloat(off[1]) * k, y: parseFloat(off[2]) * k });
  }
  return out;
}

function parseSprites(spriteDir) {
  const sprites = new Map(); // spritePathID -> {name, rect, tex}
  for (const p of listFiles(spriteDir)) {
    const pidM = /[\\/\\\\](-?\d+)\.txt$/.exec(p);
    if (!pidM) continue;
    const text = fs.readFileSync(p, 'utf8');
    if (!text.startsWith('Sprite')) continue;
    const fields = parseFields(text);
    const name = fieldStr(fields, 'Name', 'string m_Name');
    // Packed-atlas sprites share one texture: the sprite's rect (texture px,
    // y-up) selects its cell. Full-frame sprites cover the whole texture.
    const rm = /Rectf m_Rect\s*\n\s*float x = ([-\.\dEe+]+)\s*\n\s*float y = ([-\.\dEe+]+)\s*\n\s*float width = ([-\.\dEe+]+)\s*\n\s*float height = ([-\.\dEe+]+)/.exec(text);
    const texM = /PPtr<Texture2D> texture\s*\n\s*int m_FileID = \d+\s*\n\s*SInt64 m_PathID = (-?\d+)/.exec(text);
    sprites.set(pidM[1], {
      name, tex: texM ? texM[1] : null,
      rect: rm ? { x: +rm[1], y: +rm[2], w: +rm[3], h: +rm[4] } : null,
    });
  }
  return sprites;
}

function parseTextures(texDir) {
  const names = new Map();
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

// Canvas-space layout of a TR: accumulate anchoredPosition (times ancestor
// scale) down from the panel root; prefab-root scale 0 counts as 1.
function layoutOf(trPid, trs, panelRootTr) {
  const chain = [];
  let cur = trPid;
  const seen = new Set();
  while (cur && cur !== '0' && !seen.has(cur)) {
    seen.add(cur);
    chain.unshift(cur);
    if (cur === panelRootTr) break;
    const t = trs.get(cur);
    cur = t ? t.father : null;
  }
  let ax = 0, ay = 0, sx = 1, sy = 1;
  let node = null;
  for (const pid of chain) {
    const t = trs.get(pid);
    if (!t) continue;
    const isRoot = pid === panelRootTr;
    const lsx = (t.sc[0] === 0 && isRoot) ? 1 : t.sc[0];
    const lsy = (t.sc[1] === 0 && isRoot) ? 1 : t.sc[1];
    ax += t.ap[0] * sx;
    ay += t.ap[1] * sy;
    sx *= lsx;
    sy *= lsy;
    node = t;
  }
  if (!node) return null;
  const w = node.sd[0] * sx;
  const h = node.sd[1] * sy;
  // TR position refers to the pivot; centre = pivot + (0.5 - pivot) * size.
  const cx = ax + (0.5 - node.pv[0]) * w;
  const cy = ay + (0.5 - node.pv[1]) * h;
  // SkeletonGraphic lays its skeleton out with the origin at the RectTransform
  // pivot, not centred in the rect; expose the pivot position (y-up, canvas)
  // so the viewer can reproduce that placement.
  return { x: cx, y: cy, w, h, rz: node.rz, px: ax, py: ay };
}

function main() {
  const o = parseArgs();
  const wanted = o.refs.length ? o.refs : Object.keys(SCENES);
  const cfgs = wanted;

  for (const cfgKey of cfgs) {
    const cfg = SCENES[cfgKey];
    if (!cfg) { console.error(`no scene config for ${cfgKey}`); continue; }
    const ref = cfgKey.split('-')[0]; // fragment + events dir key
    const goDir = path.join(o.tmpDir, ref, 'go');
    if (!fs.existsSync(goDir)) { console.error(`${ref}: no go dump at ${goDir}, skipping`); continue; }
    console.log(`=== scene ${cfgKey} ===`);

    const { gos, trs } = loadGraph(goDir);
    const trOfGo = new Map([...trs.entries()].map(([tid, t]) => [t.go, tid]));
    const goName = (pid) => gos.get(pid)?.name || '?';

    // Host panel root TR (father 0, GO named cfg.panel).
    let panelRootTr = null;
    for (const [tid, t] of trs) {
      if ((t.father === null || t.father === '0') && goName(t.go) === cfg.panel) {
        panelRootTr = tid;
        break;
      }
    }
    if (!panelRootTr) { console.error(`  panel '${cfg.panel}' not found`); continue; }

    const under = (goPid, ancName) => {
      // GO pid whose ancestor chain (up to panel root) includes ancName.
      let tr = trOfGo.get(goPid);
      const seen = new Set();
      while (tr && !seen.has(tr)) {
        seen.add(tr);
        const t = trs.get(tr);
        if (!t || !t.father || t.father === '0' || tr === panelRootTr) break;
        const fgo = trs.get(t.father)?.go;
        if (fgo && goName(fgo) === ancName) return true;
        tr = t.father;
      }
      return false;
    };

    // Character GO pid(s) with the configured name under the panel root.
    // Several panels host two live copies (10109 renders SpBody both in the
    // backdrop and in the foreground group) — prefer the LAST one in walk
    // order (foreground beats backdrop).
    const inPanel = (goPid) => {
      let tr = trOfGo.get(goPid);
      const seen = new Set();
      while (tr && !seen.has(tr)) {
        if (tr === panelRootTr) return true;
        seen.add(tr);
        const t = trs.get(tr);
        tr = t ? t.father : null;
      }
      return false;
    };
    const panelGo = trs.get(panelRootTr)?.go;
    const walkOrderRoots = [];
    {
      // Hierarchy walk order of the panel (painter's algorithm) for ranking.
      const dfs = (goPid) => {
        walkOrderRoots.push(goPid);
        const t = trs.get(trOfGo.get(goPid));
        if (!t) return;
        for (const c of t.children) {
          const cgo = trs.get(c)?.go;
          if (cgo) dfs(cgo);
        }
      };
      dfs(panelGo);
    }
    const rankOf = (goPid) => walkOrderRoots.indexOf(goPid);
    // Character GO pid(s): cfg.charGO is one name, or a list for a combined
    // scene (both JointDrill bosses).  Several panels host two live copies of
    // a name (10109 renders SpBody both in the backdrop and foreground group)
    // — prefer the LAST one in walk order (foreground beats backdrop).
    const charNames = Array.isArray(cfg.charGO) ? cfg.charGO : [cfg.charGO];
    const charGos = [];
    let charGosFail = false;
    for (const nm of charNames) {
      let cand = [...gos.entries()]
        .filter(([pid, g]) => g.name === nm && inPanel(pid))
        .map(([pid]) => pid)
        .sort((a, b) => rankOf(a) - rankOf(b));
      if (cfg.charAncestor) cand = cand.filter((pid) => under(pid, cfg.charAncestor));
      if (!cand.length) { console.error(`  char GO '${nm}' not found under panel`); charGosFail = true; break; }
      if (cand.length > 1) console.log(`  note: ${cand.length} '${nm}' GOs under panel, using last (foreground-most)`);
      charGos.push(cand[cand.length - 1]);
    }
    if (charGosFail || !charGos.length) continue;
    const charSet = new Set(charGos);
    // Some hosts name the GO differently from the staged skeleton (e.g. the
    // 20104 mascots: sp_mw_L -> 20104_mw_Female); scene slots and the
    // combinedSpines list must use the skeleton names.
    const spineNameOf = (goNameStr) => (cfg.charSpine && cfg.charSpine[goNameStr]) || goNameStr;
    const spineByGo = new Map(charGos.map((g) => [g, spineNameOf(goName(g))]));
    const charSlots = charGos.map((g) => {
      const l = layoutOf(trOfGo.get(g), trs, panelRootTr);
      if (l) {
        if (Math.abs(l.rz) > 0.001) console.log(`  warn: char ${goName(g)} rotated rz=${l.rz}`);
        console.log(`  char ${goName(g)} -> ${spineByGo.get(g)} rect: x=${l.x.toFixed(1)} y=${l.y.toFixed(1)} w=${l.w.toFixed(1)} h=${l.h.toFixed(1)}`);
      }
      return { name: spineNameOf(goName(g)), layout: l, go: g };
    });
    if (charSlots.some((s) => !s.layout)) { console.error('  char layout failed'); continue; }
    const charLayout = charSlots[0].layout;

    const mbDir = path.join(o.tmpDir, ref, 'mb');
    const spriteDir = path.join(o.tmpDir, ref, 'sprite');
    const texDir = path.join(o.tmpDir, ref, 'tex');
    const texPngDir = path.join(o.tmpDir, ref, 'texpng');
    const images = parseImages(mbDir);
    const sprites = parseSprites(spriteDir);
    const texNames = parseTextures(texDir);
    // SkeletonGraphic mesh offset (see parseSkeletonGraphicOffsets): store it
    // in scene coords (y-down) on each character slot.
    const sgOffsets = parseSkeletonGraphicOffsets(mbDir);
    for (const s of charSlots) {
      const off = sgOffsets.get(s.go);
      s.off = off ? { x: off.x, y: -off.y } : { x: 0, y: 0 };
      if (off && (off.x || off.y)) {
        console.log(`  char ${goName(s.go)} pivotOffset: x=${off.x.toFixed(1)} y=${off.y.toFixed(1)}`);
      }
    }

    const sceneDir = path.join(o.outDir, ref, 'scene');
    // Stale layers from previous runs are pruned after staging (below), so
    // identical files keep their mtime instead of being wiped + rewritten.
    const stagedByTex = new Map(); // texName -> staged file (packed textures shared)
    const behind = [];
    const front = [];
    // Full painter's-order stream for interleaved scenes: the same image
    // layers as behind[]/front[] plus {spine} placeholders where each
    // character sits between them.
    const draw = [];
    let charSeen = false;
    let nImg = 0, nSkip = 0;
    const skipRoots = new Set(cfg.skipRoots || []);

    const emitImage = (goPid, arr) => {
      const img = images.get(goPid);
      if (!img) return; // no Image sprite (mask container, particle, runtime art)
      // Fully transparent in the prefab (toggled/faded at runtime) — not
      // part of the static composite.
      if (img.color[3] < 0.01) return;
      const sprPid = img.sprite;
      const spr = sprites.get(sprPid);
      if (!spr) { console.log(`  skip ${goName(goPid)}: sprite @${sprPid} missing`); nSkip++; return; }
      const texName = texNames.get(spr.tex);
      if (texName && (cfg.excludeTextures || []).includes(texName)) {
        console.log(`  drop ${goName(goPid)}: texture '${texName}' excluded by config`);
        nSkip++;
        return;
      }
      const png = findPng(texPngDir, texName || spr.name);
      if (!png) { console.log(`  skip ${goName(goPid)}: PNG for '${texName || spr.name}' missing`); nSkip++; return; }
      const tr = trOfGo.get(goPid);
      const l = layoutOf(tr, trs, panelRootTr);
      if (!l || l.w <= 0 || l.h <= 0) { console.log(`  skip ${goName(goPid)}: degenerate rect`); nSkip++; return; }
      if (Math.abs(l.rz) > 0.001) console.log(`  warn: ${goName(goPid)} rotated rz=${l.rz.toFixed(3)}, ignored`);
      // Drop layers fully outside the 2160x1080 canvas (scrolled-list
      // content, offscreen spares — they can never show in a static scene).
      // l.x/l.y are y-up Unity canvas coords here (negated only when stored).
      if (l.x - l.w / 2 >= CANVAS_W / 2 || l.x + l.w / 2 <= -CANVAS_W / 2 ||
          l.y - l.h / 2 >= CANVAS_H / 2 || l.y + l.h / 2 <= -CANVAS_H / 2) {
        nSkip++;
        return;
      }
      const base = (texName || spr.name).replace(/\//g, '_');
      // Packed-atlas texture shared by several sprites: stage once, each
      // layer crops its own sprite rect (Unity texture px, y-up).
      let file = stagedByTex.get(texName || spr.name);
      if (!file) {
        file = `scene_${base}.png`;
        fs.mkdirSync(sceneDir, { recursive: true });
        copyIfChanged(png, path.join(sceneDir, file));
        stagedByTex.set(texName || spr.name, file);
      }
      const pngSizeVal = pngSize(png);
      const [cr, cg, cb, ca] = img.color;
      const layer = {
        file, name: goName(goPid),
        x: Math.round(l.x * 100) / 100, y: Math.round(-l.y * 100) / 100,
        w: Math.round(l.w * 100) / 100, h: Math.round(l.h * 100) / 100,
      };
      if (spr.rect && pngSizeVal &&
          (spr.rect.x !== 0 || spr.rect.y !== 0 ||
           spr.rect.w !== pngSizeVal.w || spr.rect.h !== pngSizeVal.h)) {
        layer.frame = {
          x: Math.round(spr.rect.x), y: Math.round(spr.rect.y),
          w: Math.round(spr.rect.w), h: Math.round(spr.rect.h),
        };
      }
      // Unity Image tint (multiplied over the texture); white is the default.
      if (Math.abs(cr - 1) > 0.005 || Math.abs(cg - 1) > 0.005 || Math.abs(cb - 1) > 0.005) {
        layer.tint = [Math.round(cr * 1000) / 1000, Math.round(cg * 1000) / 1000, Math.round(cb * 1000) / 1000];
      }
      if (ca < 0.999) layer.alpha = Math.round(ca * 1000) / 1000;
      // Tiled images repeat the texture across the rect (no stretching).
      if (img.type === 2 && !layer.frame) layer.tiled = true;
      arr.push(layer);
      draw.push(layer);
      nImg++;
    };

    const walk = (goPid) => {
      if (charSet.has(goPid)) {
        charSeen = true;
        draw.push({ spine: spineByGo.get(goPid) });
        return;
      }
      emitImage(goPid, charSeen ? front : behind);
      const tr = trOfGo.get(goPid);
      const t = tr ? trs.get(tr) : null;
      if (!t) return;
      for (const c of t.children) {
        const cgo = trs.get(c)?.go;
        if (!cgo) continue;
        if (skipRoots.has(goName(cgo))) continue;
        // Mask-clipped decoration (imgMask*): the mask graphic is assigned at
        // runtime, so we cannot reproduce the clip — skip the whole subtree
        // rather than splash an unmasked full-screen pattern.
        if (cfg.skipMaskSubtrees && /^imgMask/i.test(goName(cgo))) { nSkip++; continue; }
        walk(cgo);
      }
    };

    const findRoot = (name) => {
      // Panel-descendant GO with this name (first match in hierarchy order).
      const order = [];
      const panelGo = trs.get(panelRootTr)?.go;
      const dfs = (goPid) => {
        order.push(goPid);
        const t = trs.get(trOfGo.get(goPid));
        if (!t) return;
        for (const c of t.children) {
          const cgo = trs.get(c)?.go;
          if (cgo) dfs(cgo);
        }
      };
      dfs(panelGo);
      return order.find((pid) => goName(pid) === name) || null;
    };

    if (cfg.walkRoots) {
      for (const r of cfg.walkRoots) {
        if (skipRoots.has(r)) continue;
        const rootGo = findRoot(r);
        if (!rootGo) { console.log(`  walk root '${r}' not found, skipped`); continue; }
        walk(rootGo);
      }
    } else {
      for (const r of cfg.behindRoots || []) {
        const rootGo = findRoot(r);
        if (!rootGo) { console.log(`  behind root '${r}' not found, skipped`); continue; }
        walk(rootGo);
      }
      charSeen = true; // character slots between behind and front
      for (const r of cfg.frontRoots || []) {
        const rootGo = findRoot(r);
        if (!rootGo) { console.log(`  front root '${r}' not found, skipped`); continue; }
        walk(rootGo);
      }
    }

    // Static stills for particle systems we cannot simulate (e.g. the Summer
    // Check-in waterfall): staged like any Image layer, with explicit canvas
    // rects from the config.
    for (const ex of cfg.extras || []) {
      const png = findPng(texPngDir, ex.texture);
      if (!png) { console.log(`  extra ${ex.name}: texture '${ex.texture}' not exported, skipped`); nSkip++; continue; }
      let file = stagedByTex.get(ex.texture);
      if (!file) {
        file = `scene_${ex.texture.replace(/\//g, '_')}.png`;
        fs.mkdirSync(sceneDir, { recursive: true });
        copyIfChanged(png, path.join(sceneDir, file));
        stagedByTex.set(ex.texture, file);
      }
      let layer = {
        file, name: ex.name,
        x: ex.x, y: ex.y, w: ex.w, h: ex.h,
      };
      if (ex.tiled) layer.tiled = true;
      // Texture scroll in tiles/second (x,y) — reproduces the game's material
      // auto-panner (fx_20103_pubu_01 `_BaseVerticalSpeed`) for still-staged
      // particle art.
      if (ex.scroll) layer.scroll = ex.scroll;
      if (ex.alpha !== undefined) layer.alpha = ex.alpha;
      (ex.front ? front : behind).push(layer);
      nImg++;
    }

    // Drop staged layers no longer referenced (replaces the old wipe +
    // re-stage, which touched every mtime on every run).
    if (fs.existsSync(sceneDir)) {
      const keep = new Set(stagedByTex.values());
      for (const f of fs.readdirSync(sceneDir)) {
        if (!keep.has(f)) fs.rmSync(path.join(sceneDir, f), { force: true });
      }
    }

    // Drop exact duplicate layers (the prefabs layer some decorations twice,
    // e.g. imgBg02/shuiwen in 20103 share sprite + rect).  Keeps painter order.
    const seenLayers = new Set();
    const dedupe = (arr) => arr.filter((l) => {
      const k = JSON.stringify([l.file, l.frame || null, l.x, l.y, l.w, l.h, l.tint || null, l.alpha ?? null, !!l.tiled, l.scroll || null]);
      if (seenLayers.has(k)) { nSkip++; return false; }
      seenLayers.add(k);
      return true;
    });

    const scene = {
      w: CANVAS_W, h: CANVAS_H,
      behind: dedupe(behind), front: dedupe(front),
      char: {
        x: Math.round(charLayout.x * 100) / 100, y: Math.round(-charLayout.y * 100) / 100,
        w: Math.round(charLayout.w * 100) / 100, h: Math.round(charLayout.h * 100) / 100,
      },
    };
    // Pivot-position placement (game SkeletonGraphic layout) only where an
    // underlay confirms it (charOrigin); otherwise the viewer centre-fits.
    if (cfg.charOrigin) {
      scene.char.px = Math.round(charLayout.px * 100) / 100;
      scene.char.py = Math.round(-charLayout.py * 100) / 100;
    }
    const off0 = charSlots[0].off || { x: 0, y: 0 };
    if (off0.x || off0.y) {
      scene.char.ox = Math.round(off0.x * 100) / 100;
      scene.char.oy = Math.round(off0.y * 100) / 100;
    }
    if (charSlots.length > 1) {
      // Combined scene: one slot per character (viewer places each Spine in
      // its own slot).
      scene.chars = charSlots.map((s) => {
        const slot = {
          name: s.name,
          x: Math.round(s.layout.x * 100) / 100, y: Math.round(-s.layout.y * 100) / 100,
          w: Math.round(s.layout.w * 100) / 100, h: Math.round(s.layout.h * 100) / 100,
        };
        if (cfg.charOrigin) {
          slot.px = Math.round(s.layout.px * 100) / 100;
          slot.py = Math.round(-s.layout.py * 100) / 100;
        }
        const off = s.off || { x: 0, y: 0 };
        if (off.x || off.y) {
          slot.ox = Math.round(off.x * 100) / 100;
          slot.oy = Math.round(off.y * 100) / 100;
        }
        return slot;
      });
    }
    if (cfg.interleaved) {
      // Preserve the hierarchy's painter order exactly: backgrounds, the
      // midground characters, foreground scenery, chibis, then the topmost
      // overlays.  Duplicate image layers are collapsed like behind/front.
      const seenDraw = new Set();
      scene.draw = draw.filter((l) => {
        if (l.spine) return true;
        const k = JSON.stringify([l.file, l.frame || null, l.x, l.y, l.w, l.h, l.tint || null, l.alpha ?? null, !!l.tiled, l.scroll || null]);
        if (seenDraw.has(k)) { nSkip++; return false; }
        seenDraw.add(k);
        return true;
      });
    }
    console.log(`  layers: ${scene.behind.length} behind, ${scene.front.length} front, skipped ${nSkip}`);

    // Merge into the extractEvents fragment.
    const fragPath = path.join(o.stageDir, ref + '.json');
    if (!fs.existsSync(fragPath)) { console.error(`  fragment ${fragPath} missing, skipping`); continue; }
    const frag = JSON.parse(fs.readFileSync(fragPath, 'utf8'));
    if (charSlots.length > 1) {
      // One combined entry: attach the shared scene to every character spine.
      const spines = charGos.map((g) => spineByGo.get(g));
      for (const nm of spines) {
        const sp = (frag.spines || []).find((s) => s.name === nm);
        if (!sp) { console.error(`  spine '${nm}' not in fragment`); continue; }
        sp.scene = scene;
      }
      frag.combinedSpines = spines;
    } else if (cfg.forStatic) {
      if (!frag.static) { console.error('  fragment has no static entry'); continue; }
      frag.static.scene = scene;
    } else {
      const sp = (frag.spines || []).find((s) => s.name === cfg.forSpine);
      if (!sp) { console.error(`  spine '${cfg.forSpine}' not in fragment`); continue; }
      sp.scene = scene;
    }
    fs.writeFileSync(fragPath, JSON.stringify(frag, null, 2));
  }
  console.log('Done. Re-run generateEvents.mjs to rebuild data/events.json.');
}

main();
