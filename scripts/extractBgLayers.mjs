#!/usr/bin/env node
/**
 * extractBgLayers.mjs — parse an AssetStudioModCLI `-m dump` of the l2d
 * bundle types (gameobject, transform, sprite, spriteRenderer) and emit the
 * per-prefab `----bg----` / `----bg_effect----` / `----fg_effect----` /
 * model-subtree sprite composition used to build `bgLayers` in models.json.
 *
 * Each dumped asset is a file named `<assetName> @<pathID>.txt` in the dump
 * root.  The dump command (see dump.sh):
 *
 *   dotnet AssetStudioModCLI.dll <bundle> -m dump \
 *     -t gameobject,transform,rectTransform,sprite,spriteRenderer \
 *     -f assetName_pathID --load-all -o <dumpDir>
 *
 * Output (written to --out):
 *   { bundle, compositions: [ { prefab, active, layers: [ { goName, group,
 *     active, posX, posY, scaleX, scaleY, sortLayer, sortOrder, sizeX,
 *     sizeY, texture, texW, texH } ] } ] }
 *
 * `texture` is the Sprite's name (resolved to a PNG in the variant bg/ dir).
 * `group` is the enclosing `----*----` node (or "model" when the layer sits
 * directly on the prefab root).  `posX/posY` and `scaleX/scaleY` are the
 * accumulated world-space transform (Unity y-up), matching how the game
 * positions each layer.
 *
 * Usage:
 *   node scripts/extractBgLayers.mjs --dump <dumpDir> --out <compositions.json>
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
    dumpDir: get('--dump', path.resolve('.dump_tmp/bglayers')),
    outFile: get('--out', path.resolve('.dump_tmp/bglayers/compositions.json')),
  };
}

// --- dump file parsing ------------------------------------------------------

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

// Split a dump file into top-level fields: [{ name, block: [lines...] }].
// Top-level fields start with exactly one tab; nested lines have deeper tabs.
// The field's own header line (e.g. `string m_Name = "x"`) is included in the
// block so scalar values on the header line are parsed too.
function parseFields(text) {
  const fields = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const depth = line.match(/^\t*/)[0].length;
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
function singlePathID(block) {
  const m = PATHID_RE.exec(block.join('\n'));
  PATHID_RE.lastIndex = 0;
  return m ? m[1] : null;
}
function allPathIDs(block) {
  const s = block.join('\n');
  const out = [];
  let m;
  PATHID_RE.lastIndex = 0;
  while ((m = PATHID_RE.exec(s))) out.push(m[1]);
  return out;
}
function floatXY(block, keys) {
  const s = block.join('\n');
  const out = {};
  for (const k of keys) {
    // Note: in a template literal `\d` would be a literal "d"; escape it.
    const re = new RegExp('float ' + k + ' = ([-\\.0-9Ee+]+)');
    const m = re.exec(s);
    if (m) out[k] = parseFloat(m[1]);
  }
  return out;
}
function strVal(block) {
  const m = /string m_Name = "([^"]*)"/.exec(block.join('\n'));
  return m ? m[1] : null;
}
function boolVal(block) {
  const m = /bool m_([A-Za-z]+) = (\w+)/.exec(block.join('\n'));
  return m ? m[2] : null;
}

// --- asset type detection ---------------------------------------------------

function parseDump(dumpDir) {
  const files = listFiles(dumpDir);
  const gos = new Map(); // pathID -> { name, active, comps: [compPathIDs] }
  const trs = new Map(); // pathID -> { go, x, y, sx, sy, children, father }
  const srs = new Map(); // pathID -> { go, sortLayer, sortOrder, sprite, szX, szY }
  const sprs = new Map(); // pathID -> { name, w, h }

  for (const p of files) {
    const pidM = / @(-?\d+)\.txt$/.exec(p);
    if (!pidM) continue;
    const pid = pidM[1];
    const text = fs.readFileSync(p, 'utf8');
    const first = text.split('\n')[0];
    const fields = parseFields(text);
    const byName = new Map(fields.map((f) => [f.name, f]));

    if (first.startsWith('GameObject')) {
      const nameField = byName.get('Name');
      gos.set(pid, {
        name: strVal(nameField ? nameField.block : []),
        active: boolVal(byName.get('IsActive') ? byName.get('IsActive').block : []),
        comps: allPathIDs(byName.get('Component') ? byName.get('Component').block : []),
      });
    } else if (first.startsWith('Transform') || first.startsWith('RectTransform')) {
      const goF = byName.get('GameObject');
      const posF = byName.get('LocalPosition');
      const sclF = byName.get('LocalScale');
      const pos = posF ? floatXY(posF.block, ['x', 'y']) : {};
      const scl = sclF ? floatXY(sclF.block, ['x', 'y']) : {};
      trs.set(pid, {
        go: goF ? singlePathID(goF.block) : null,
        x: pos.x || 0, y: pos.y || 0,
        sx: scl.x || 1, sy: scl.y || 1,
        children: allPathIDs(byName.get('Children') ? byName.get('Children').block : []),
        father: byName.get('Father') ? singlePathID(byName.get('Father').block) : null,
      });
    } else if (first.startsWith('SpriteRenderer')) {
      const goF = byName.get('GameObject');
      const sprF = byName.get('Sprite');
      const sizeF = byName.get('Size');
      const size = sizeF ? floatXY(sizeF.block, ['x', 'y']) : {};
      const sortL = byName.get('SortingLayer');
      const sortO = byName.get('SortingOrder');
      const intVal = (b) => {
        const m = /SInt16 (\w+) = (-?\d+)/.exec(b.join('\n'));
        return m ? parseInt(m[2], 10) : 0;
      };
      srs.set(pid, {
        go: goF ? singlePathID(goF.block) : null,
        sprite: sprF ? singlePathID(sprF.block) : null,
        sortLayer: sortL ? intVal(sortL.block) : 0,
        sortOrder: sortO ? intVal(sortO.block) : 0,
        szX: size.x || 0, szY: size.y || 0,
      });
    } else if (first.startsWith('Sprite')) {
      const rectF = byName.get('Rect');
      const rect = rectF ? floatXY(rectF.block, ['width', 'height']) : {};
      sprs.set(pid, { name: strVal(byName.get('Name') ? byName.get('Name').block : []), w: rect.width || 0, h: rect.height || 0 });
    }
  }
  return { gos, trs, srs, sprs };
}

// --- composition ------------------------------------------------------------

function main() {
  const { dumpDir, outFile } = parseArgs();
  const { gos, trs, srs, sprs } = parseDump(dumpDir);

  const goOfTr = new Map(); // transform pathID -> gameobject pathID
  const trOfGo = new Map(); // gameobject pathID -> transform pathID
  for (const [tid, t] of trs) {
    if (t.go) {
      goOfTr.set(tid, t.go);
      trOfGo.set(t.go, tid);
    }
  }

  // Prefab roots: GameObjects whose transform has no father.  A bundle can
  // carry several prefab instances (one per variant, and duplicate roots for
  // sub-model instances); we walk each root's whole subtree.
  const roots = [];
  for (const [gid, g] of gos) {
    const tid = trOfGo.get(gid);
    if (!tid) continue;
    const t = trs.get(tid);
    if (t.father == null || t.father === '0') roots.push(gid);
  }

  const prefabMap = new Map(); // prefab name -> best composition (most layers)

  const walk = (tid, group, accX, accY, accSx, accSy, layers, visited) => {
    if (!tid || visited.has(tid)) return;
    visited.add(tid);
    const ctr = trs.get(tid);
    if (!ctr) return;
    const ax = accX + (ctr.x || 0) * accSx;
    const ay = accY + (ctr.y || 0) * accSy;
    const asx = accSx * (ctr.sx || 1);
    const asy = accSy * (ctr.sy || 1);
    const go = ctr.go ? gos.get(ctr.go) : null;
    let nodeGroup = group;
    if (go && /^----[^"]+----$/.test(go.name)) nodeGroup = go.name;
    if (go) {
      for (const comp of go.comps) {
        const csr = srs.get(comp);
        if (!csr) continue;
        const sprite = csr.sprite ? sprs.get(csr.sprite) : null;
        if (!sprite) continue;
        layers.push({
          goName: go.name,
          group: nodeGroup || 'model',
          active: go.active || 'True',
          posX: ax, posY: ay, scaleX: asx, scaleY: asy,
          sortLayer: csr.sortLayer, sortOrder: csr.sortOrder,
          sizeX: csr.szX, sizeY: csr.szY,
          texture: sprite.name || null,
          texW: sprite.w, texH: sprite.h,
        });
      }
    }
    for (const c of ctr.children) walk(c, nodeGroup, ax, ay, asx, asy, layers, visited);
  };

  for (const gid of roots) {
    const g = gos.get(gid);
    if (!g || !g.name) continue;
    const tid = trOfGo.get(gid);
    const layers = [];
    // Each prefab root gets its own visited set so duplicate roots (sub-model
    // instances) that share transforms don't suppress the real root's walk.
    const visited = new Set();
    walk(tid, g.name, 0, 0, 1, 1, layers, visited);
    layers.sort((a, b) => (a.sortLayer - b.sortLayer) || (a.sortOrder - b.sortOrder));
    // Some bundles carry duplicate prefab roots (sub-model instances) with
    // the same name; keep the one holding the most sprite layers.
    const existing = prefabMap.get(g.name);
    if (!existing || layers.length > existing.layers.length) {
      prefabMap.set(g.name, { prefab: g.name, active: g.active || 'True', layers });
    }
  }

  // Keep every prefab root, even ones with no sprite layers, so the merge
  // step can tell a variant that genuinely has no background apart from a
  // variant whose prefab root is absent from the dump.
  const compositions = [...prefabMap.values()];
  const bundle = path.basename(dumpDir);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ bundle, compositions }, null, 2));
  const withTex = compositions.filter((c) => c.layers.some((l) => l.texture)).length;
  console.log(`Wrote ${compositions.length} composition(s) (${withTex} with textures) -> ${outFile}`);
}

main();
