#!/usr/bin/env node
/**
 * extractBgLayers.mjs — parse an AssetStudioModCLI `-m dump` of the l2d
 * bundle types (gameobject, transform, sprite, spriteRenderer, sortingGroup,
 * meshRenderer) and emit the per-prefab `----bg----` / `----bg_effect----` /
 * `----fg_effect----` / model-subtree sprite composition plus the Cubism
 * model instances used to build `bgLayers` in models.json.
 *
 * Each dumped asset is a file named `<assetName> @<pathID>.txt` in the dump
 * root.  The dump command (see dump.sh):
 *
 *   dotnet AssetStudioModCLI.dll <bundle> -m dump \
 *     -t gameobject,transform,rectTransform,sprite,spriteRenderer,sortingGroup,meshRenderer \
 *     -f assetName_pathID --load-all -o <dumpDir>
 *
 * Output (written to --out):
 *   { bundle, compositions: [ { prefab, active,
 *     groups: { "----bg----": 0, ... },
 *     models: [ { name, posX, posY, scaleX, scaleY, sortLayer, order } ],
 *     layers: [ { goName, group, groupOrder, active, posX, posY, scaleX,
 *     scaleY, sortLayer, sortOrder, sizeX, sizeY, texture, texW, texH } ] } ] }
 *
 * `texture` is the Sprite's name (resolved to a PNG in the variant bg/ dir).
 * `group` is the enclosing `----*----` node (or the prefab root name when the
 * layer sits directly on the root).  `posX/posY` and `scaleX/scaleY` are the
 * accumulated world-space transform (Unity y-up), matching how the game
 * positions each layer.
 *
 * `models` lists the Cubism model instances parented under
 * `----live2d_modle----`.  The game's prefabs can hold several (a = character,
 * b/c = the scene/props it poses with, e.g. 10303_L_b is the cat + lantern
 * scene), each rendered by its own `CubismRenderController`.  `order` is the
 * model's lowest MeshRenderer sorting order: the serialized values put the
 * first model at 0 and every extra one 500 lower (b = -500, c = -1000), i.e.
 * the extras draw *behind* the character even though they come later in the
 * hierarchy.  The list is sorted back-to-front.
 *
 * `groupOrder` is the Unity `SortingGroup` "Order in Layer" of the enclosing
 * `----*----` node.  A SortingGroup renders its whole subtree as one unit on
 * the group's sublayer ("all the child GameObjects render on this sublayer,
 * but keep their order" — Unity manual, Sorting Group component reference), so
 * `groupOrder` is the primary sort key: it is what puts `----bg----` (0)
 * behind `----bg_effect----` (1), the model (2) behind `----fg_effect----` (3).
 * The `sortOrder` of each SpriteRenderer only orders layers *within* one group.
 * When the dump predates the `sortingGroup` type the order is derived from the
 * group name (the four group names are fixed), so the output is stable either
 * way; `null` means the group is neither a standard group nor a `*fg_effect*` /
 * `*bg_effect*` / `*live2d_modle*` root.
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
  const sgs = new Map(); // pathID -> { go, sortLayer, sortOrder }
  const mrs = new Map(); // pathID -> { go, sortLayer, sortOrder } (cubism drawables)

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
    } else if (first.startsWith('SortingGroup')) {
      const goF = byName.get('GameObject');
      const sortL = byName.get('SortingLayer');
      const sortO = byName.get('SortingOrder');
      const intVal = (b) => {
        const m = /SInt(?:16|32) \w+ = (-?\d+)/.exec(b.join('\n'));
        return m ? parseInt(m[1], 10) : 0;
      };
      sgs.set(pid, {
        go: goF ? singlePathID(goF.block) : null,
        sortLayer: sortL ? intVal(sortL.block) : 0,
        sortOrder: sortO ? intVal(sortO.block) : 0,
      });
    } else if (first.startsWith('MeshRenderer')) {
      // Cubism drawables: one MeshRenderer per ArtMesh.  Their serialized
      // sorting order is the model's base order + drawable index, so the
      // lowest one identifies where the whole model sorts inside its group.
      const goF = byName.get('GameObject');
      const sortL = byName.get('SortingLayer');
      const sortO = byName.get('SortingOrder');
      const intVal = (b) => {
        const m = /SInt16 \w+ = (-?\d+)/.exec(b.join('\n'));
        return m ? parseInt(m[1], 10) : 0;
      };
      mrs.set(pid, {
        go: goF ? singlePathID(goF.block) : null,
        sortLayer: sortL ? intVal(sortL.block) : 0,
        sortOrder: sortO ? intVal(sortO.block) : 0,
      });
    } else if (first.startsWith('Sprite')) {
      const rectF = byName.get('Rect');
      const rect = rectF ? floatXY(rectF.block, ['width', 'height']) : {};
      sprs.set(pid, { name: strVal(byName.get('Name') ? byName.get('Name').block : []), w: rect.width || 0, h: rect.height || 0 });
    }
  }
  return { gos, trs, srs, sprs, sgs, mrs };
}

// --- composition ------------------------------------------------------------

// SortingGroup "Order in Layer" of a `----*----` group node (or of a prefab
// root that acts as one, e.g. `fx_live2d_11101_bg_effect_01`).
//
// A SortingGroup renders its whole subtree as a single unit on the group's
// sublayer while the children keep their relative order, so this value decides
// where the group as a whole sits relative to the other groups (and relative to
// the Live2D model, which lives under `----live2d_modle----`).  The four
// standard group names always carry 0/1/2/3 in that order; older dumps that
// predate the `sortingGroup` type fall back to the name so the result does not
// depend on re-dumping.
function groupOrderFor(name, sgOrder) {
  if (typeof sgOrder === 'number') return sgOrder;
  const n = name || '';
  if (/fg_effect/i.test(n)) return 3;
  if (/bg_effect/i.test(n)) return 1;
  if (/live2d_modle/i.test(n)) return 2;
  if (n === '----bg----') return 0;
  return null;
}

function main() {
  const { dumpDir, outFile } = parseArgs();
  const { gos, trs, srs, sprs, sgs, mrs } = parseDump(dumpDir);

  const sgOfGo = new Map(); // gameobject pathID -> SortingGroup order
  for (const sg of sgs.values()) if (sg.go) sgOfGo.set(sg.go, sg.sortOrder);

  const goOfTr = new Map(); // transform pathID -> gameobject pathID
  const trOfGo = new Map(); // gameobject pathID -> transform pathID
  for (const [tid, t] of trs) {
    if (t.go) {
      goOfTr.set(tid, t.go);
      trOfGo.set(t.go, tid);
    }
  }

  // A Cubism model instance is a direct child of a `----live2d_modle----`
  // group whose name matches the model asset (`10303_L_a`, `11901_F_c`, …)
  // and whose subtree holds the model's drawable MeshRenderers.  Sprite props
  // parented under the same group (`zhiwu01`, `dianzi`, …) have no
  // MeshRenderers, so they are skipped.
  const MODEL_NAME_RE = /^\d+_[A-Za-z](_[a-z])?$/;
  const MODEL_GROUP_RE = /live2d_modle/i;

  // Sorting range of a model subtree: the lowest MeshRenderer order is the
  // model's base sorting order (drawables sit at base + drawable index).
  const modelSortInfo = (trId) => {
    let minOrder = null;
    let sortLayer = 0;
    let count = 0;
    const visited = new Set();
    (function rec(tid) {
      if (!tid || visited.has(tid)) return;
      visited.add(tid);
      const t = trs.get(tid);
      if (!t) return;
      const g = t.go ? gos.get(t.go) : null;
      if (g) {
        for (const comp of g.comps) {
          const mr = mrs.get(comp);
          if (!mr) continue;
          count++;
          if (minOrder === null || mr.sortOrder < minOrder) {
            minOrder = mr.sortOrder;
            sortLayer = mr.sortLayer;
          }
        }
      }
      for (const c of t.children) rec(c);
    })(trId);
    return { order: minOrder, sortLayer, count };
  };

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

  const walk = (tid, group, groupOrder, accX, accY, accSx, accSy, layers, groups, models, visited) => {
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
    let nodeOrder = groupOrder;
    if (go && /^----[^"]+----$/.test(go.name)) {
      nodeGroup = go.name;
      nodeOrder = groupOrderFor(go.name, sgOfGo.get(ctr.go));
      groups.set(nodeGroup, nodeOrder);
    }
    if (go) {
      if (group && MODEL_GROUP_RE.test(group) && MODEL_NAME_RE.test(go.name)) {
        const info = modelSortInfo(tid);
        if (info.count > 0) {
          models.push({
            name: go.name,
            posX: ax, posY: ay, scaleX: asx, scaleY: asy,
            sortLayer: info.sortLayer, order: info.order,
          });
        }
      }
      for (const comp of go.comps) {
        const csr = srs.get(comp);
        if (!csr) continue;
        const sprite = csr.sprite ? sprs.get(csr.sprite) : null;
        if (!sprite) continue;
        layers.push({
          goName: go.name,
          group: nodeGroup || 'model',
          groupOrder: nodeOrder,
          active: go.active || 'True',
          posX: ax, posY: ay, scaleX: asx, scaleY: asy,
          sortLayer: csr.sortLayer, sortOrder: csr.sortOrder,
          sizeX: csr.szX, sizeY: csr.szY,
          texture: sprite.name || null,
          texW: sprite.w, texH: sprite.h,
        });
      }
    }
    for (const c of ctr.children) walk(c, nodeGroup, nodeOrder, ax, ay, asx, asy, layers, groups, models, visited);
  };

  for (const gid of roots) {
    const g = gos.get(gid);
    if (!g || !g.name) continue;
    const tid = trOfGo.get(gid);
    const layers = [];
    const groups = new Map();
    const models = [];
    // Each prefab root gets its own visited set so duplicate roots (sub-model
    // instances) that share transforms don't suppress the real root's walk.
    const visited = new Set();
    const rootOrder = groupOrderFor(g.name, sgOfGo.get(gid));
    if (rootOrder !== null) groups.set(g.name, rootOrder);
    walk(tid, g.name, rootOrder, 0, 0, 1, 1, layers, groups, models, visited);
    // Back-to-front: the group (SortingGroup) order first, then the layer's own
    // sorting order inside the group.  Array sort is stable, so equal keys keep
    // prefab hierarchy order.
    layers.sort((a, b) =>
      (a.sortLayer - b.sortLayer) ||
      ((a.groupOrder ?? 1) - (b.groupOrder ?? 1)) ||
      (a.sortOrder - b.sortOrder));
    // Same for the models: base sorting order decides which one draws in front
    // (a = 0 in front, b = -500 behind it, c = -1000 behind that).
    models.sort((a, b) =>
      (a.sortLayer - b.sortLayer) || (a.order - b.order));
    // Some bundles carry duplicate prefab roots (sub-model instances) with
    // the same name; keep the one holding the most sprite layers.
    const existing = prefabMap.get(g.name);
    if (!existing || layers.length > existing.layers.length) {
      prefabMap.set(g.name, {
        prefab: g.name,
        active: g.active || 'True',
        groups: Object.fromEntries(groups),
        models,
        layers,
      });
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
