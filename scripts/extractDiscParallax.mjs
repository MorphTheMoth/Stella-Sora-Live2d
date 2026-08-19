#!/usr/bin/env node
/**
 * extractDiscParallax.mjs — extract each disc's parallax card composition from
 * the plain disc_XXXX.unity3d bundle, replicating the game's own card prefab.
 *
 * In the game, a disc's detail view renders the <id>Card.prefab through an
 * offscreen 2D camera (Disc_OffScreen_Renderer).  The prefab has two halves:
 *   - <id>_M : the main card art, SpriteRenderers placed in world space;
 *   - <id>_G : the gyroscope overlay, a UI canvas whose layers (the opaque
 *              card backdrop + sparkle/glow layers + the title) are clipped to
 *              a Mask window and all shift together when the user drags the
 *              Gyroscope/Target (GyroscopeFollower component, factor (AX, AY)).
 *
 * The two halves live on the same plane in front of the camera, so the whole
 * scene maps to the 1080x1080 logical canvas (CanvasScaler reference) with a
 * constant world->canvas scale.  The opaque overlay backdrop fully covers the
 * main art in the rendered result, so the visible parallax scene is exactly the
 * overlay group: every layer moves together by (AX, AY) * normalized drag, and
 * the <id>_B full-card image is *not* part of the scene at all (it is only the
 * collection/thumbnail image used elsewhere in the UI).
 *
 * Inputs are produced by dump.sh (see the "Disc parallax scenes" step).
 *
 * Usage:
 *   node scripts/extractDiscParallax.mjs \
 *     --dump <scene-graph dump dir> \
 *     --sprite <sprite asset dump dir> \
 *     --img <monoBehaviour json dir> \
 *     --tex <texture2D dump dir> \
 *     --texpng <texture2D png dir> \
 *     --out data/discparallax.json --chars chars/
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
    dumpDir: get('--dump', path.resolve('.dump_tmp/discdump')),
    spriteDir: get('--sprite', path.resolve('.dump_tmp/disctex/sprite')),
    imgDir: get('--img', path.resolve('.dump_tmp/discimg')),
    texDir: get('--tex', path.resolve('.dump_tmp/disctex')),
    texPngDir: get('--texpng', path.resolve('.dump_tmp/disctexpng')),
    frameDir: get('--frame', path.resolve('.dump_tmp/disccommon')),
    outFile: get('--out', path.resolve('data/discparallax.json')),
    charsDir: get('--chars', path.resolve('chars')),
  };
}

// --- dump file parsing (scene graph) ---------------------------------------

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
    const m = new RegExp('float ' + k + ' = ([-\\.0-9Ee+]+)').exec(s);
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
// Extract a Vector2/Vector3 field (e.g. AnchoredPosition, SizeDelta, Pivot,
// LocalScale, LocalPosition) by name, returning {x,y[,z]}.
function vecField(block, key, n) {
  const s = block.join('\n');
  const re = new RegExp(
    key + '\\s*\\n\\s*' +
    Array.from({ length: n }, (_, i) => 'float ' + 'xyz'[i] + ' = ([-\\.0-9Ee+]+)').join('\\s*\\n\\s*')
  );
  const m = re.exec(s);
  if (!m) return null;
  const out = {};
  for (let i = 0; i < n; i++) out['xyz'[i]] = parseFloat(m[i + 1]);
  return out;
}

// Parse the scene-graph dump into GameObjects, Transforms/RectTransforms,
// SpriteRenderers and CanvasRenderers.
function parseDump(dumpDir) {
  const gos = new Map();
  const trs = new Map();
  const srs = new Map();
  const crs = new Set();
  for (const p of listFiles(dumpDir)) {
    const pidM = / @(-?\d+)\.txt$/.exec(p);
    if (!pidM) continue;
    const pid = pidM[1];
    const text = fs.readFileSync(p, 'utf8');
    const first = text.split('\n')[0];
    const fields = parseFields(text);
    const byName = new Map(fields.map((f) => [f.name, f]));
    if (first.startsWith('GameObject')) {
      gos.set(pid, {
        name: strVal(byName.get('Name') ? byName.get('Name').block : []),
        active: boolVal(byName.get('IsActive') ? byName.get('IsActive').block : []),
        comps: allPathIDs(byName.get('Component') ? byName.get('Component').block : []),
      });
    } else if (first.startsWith('Transform') || first.startsWith('RectTransform')) {
      const goF = byName.get('GameObject');
      const pos = vecField(byName.get('LocalPosition') ? byName.get('LocalPosition').block : [], 'm_LocalPosition', 3) || { x: 0, y: 0, z: 0 };
      const scale = vecField(byName.get('LocalScale') ? byName.get('LocalScale').block : [], 'm_LocalScale', 3) || { x: 1, y: 1, z: 1 };
      const ap = vecField(byName.get('AnchoredPosition') ? byName.get('AnchoredPosition').block : [], 'm_AnchoredPosition', 2) || { x: 0, y: 0 };
      const sd = vecField(byName.get('SizeDelta') ? byName.get('SizeDelta').block : [], 'm_SizeDelta', 2) || { x: 0, y: 0 };
      trs.set(pid, {
        go: goF ? singlePathID(goF.block) : null,
        x: pos.x, y: pos.y, z: pos.z,
        sx: scale.x, sy: scale.y,
        apx: ap.x, apy: ap.y,
        sdx: sd.x, sdy: sd.y,
        children: allPathIDs(byName.get('Children') ? byName.get('Children').block : []),
        father: byName.get('Father') ? singlePathID(byName.get('Father').block) : null,
      });
    } else if (first.startsWith('SpriteRenderer')) {
      const goF = byName.get('GameObject');
      const sprF = byName.get('Sprite');
      const sizeF = byName.get('Size');
      const size = sizeF ? floatXY(sizeF.block, ['x', 'y']) : {};
      const sortO = byName.get('SortingOrder');
      const intVal = (b) => {
        const m = /SInt16 (\w+) = (-?\d+)/.exec(b.join('\n'));
        return m ? parseInt(m[2], 10) : 0;
      };
      srs.set(pid, {
        go: goF ? singlePathID(goF.block) : null,
        sprite: sprF ? singlePathID(sprF.block) : null,
        sortOrder: sortO ? intVal(sortO.block) : 0,
        szX: size.x || 0, szY: size.y || 0,
      });
    } else if (first.startsWith('CanvasRenderer')) {
      crs.add(pid);
    }
  }
  return { gos, trs, srs, crs };
}

// Parse the sprite asset dumps (rect size + referenced texture pathID).
function parseSprites(spriteDir) {
  const sprs = new Map();
  for (const p of listFiles(spriteDir)) {
    const m = / @(-?\d+)\.txt$/.exec(p);
    if (!m) continue;
    const pid = m[1];
    const text = fs.readFileSync(p, 'utf8');
    if (!text.startsWith('Sprite')) continue;
    const fields = parseFields(text);
    const byName = new Map(fields.map((f) => [f.name, f]));
    const rect = byName.get('Rect') ? floatXY(byName.get('Rect').block, ['width', 'height']) : {};
    // texture ref lives under m_RD -> texture -> m_PathID
    const rd = byName.get('RD') ? byName.get('RD').block : [];
    const texM = /PPtr<Texture2D> texture\s*\n\s*int m_FileID = \d+\s*\n\s*SInt64 m_PathID = (-?\d+)/.exec(rd.join('\n'));
    sprs.set(pid, {
      name: strVal(byName.get('Name') ? byName.get('Name').block : []),
      texture: texM ? texM[1] : null,
      w: rect.width || 0,
      h: rect.height || 0,
    });
  }
  return sprs;
}

function parseTextures(texDir) {
  const tex = new Map();
  for (const p of listFiles(texDir)) {
    const m = / @(-?\d+)\.txt$/.exec(p);
    if (!m) continue;
    const rel = path.relative(texDir, p).replace(/\.txt$/, '');
    const name = rel
      .replace(/ @-?\d+$/, '')
      .replace(/^.*?assets\/assetbundles\//, '')
      .replace(/^[^/]+\/\d+\//, '');
    tex.set(m[1], name);
  }
  return tex;
}

// Parse Image, GyroscopeFollower, Mask and AvgL2DUseGyroscope monoBehaviours.
function parseBehaviours(imgDir) {
  const images = new Map();      // goId -> spriteId
  const followers = new Map();   // goId -> { type, fx, fy, ax, ay }
  const masks = new Set();       // goId of Mask components
  const avg = {};                // target range
  for (const p of listFiles(imgDir)) {
    if (!/\.json$/.test(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const goM = /"m_GameObject"\s*:\s*\{[^}]*"m_PathID"\s*:\s*(-?\d+)/.exec(text);
    if (!goM) continue;
    const goId = goM[1];
    const name = path.basename(p).replace(/_#?\d*\.json$/, '').replace(/\.json$/, '');
    if (name === 'Image') {
      const sprM = /"m_Sprite"\s*:\s*\{[^}]*"m_PathID"\s*:\s*(-?\d+)/.exec(text);
      if (sprM && sprM[1] !== '0') images.set(goId, sprM[1]);
    } else if (name === 'GyroscopeFollower') {
      const getF = (k) => {
        const m = new RegExp('"' + k + '"\\s*:\\s*([-\\.0-9eE+]+)').exec(text);
        return m ? parseFloat(m[1]) : 0;
      };
      const typeM = /"type"\s*:\s*(\d+)/.exec(text);
      followers.set(goId, {
        type: typeM ? parseInt(typeM[1], 10) : 0,
        fx: getF('fFactorX'), fy: getF('fFactorY'),
        ax: getF('fFactorAX'), ay: getF('fFactorAY'),
      });
    } else if (name === 'Mask') {
      masks.add(goId);
    } else if (name === 'AvgL2DUseGyroscope') {
      const getF = (k) => {
        const m = new RegExp('"' + k + '"\\s*:\\s*([-\\.0-9eE+]+)').exec(text);
        return m ? parseFloat(m[1]) : 0;
      };
      avg.xmin = getF('Xmin'); avg.xmax = getF('Xmax');
      avg.ymin = getF('Ymin'); avg.ymax = getF('Ymax');
    }
  }
  return { images, followers, masks, avg };
}

// The offscreen renderer (Disc_OffScreen_Renderer.prefab) renders the card with
// a perspective camera (FOV 60) whose Canvas sits at PlaneDistance 100.  The
// CanvasScaler reference resolution is 1080x1080, so one canvas pixel covers
// 2*100*tan(30deg)/1080 world units.  This factor is identical for every disc.
const CANVAS = 1080;
const PX_PER_WORLD = CANVAS / (2 * 100 * Math.tan(Math.PI / 6)); // 9.3528

// The disc card's outer border ("frame") is a shared sprite in the disc_common
// bundle; this is its constant pathID across all discs.
const FRAME_SPRITE_ID = '-8539956293099782948';

// Map a world position/size to canvas pixels (y-up world -> y-down canvas).
function worldToCanvas(wx, wy, ww, wh) {
  return {
    x: wx * PX_PER_WORLD,
    y: -wy * PX_PER_WORLD,
    w: ww * PX_PER_WORLD,
    h: wh * PX_PER_WORLD,
  };
}

// Accumulate a node's world transform (position + scale) from the root.
function worldTransform(tid, trs) {
  const path = [];
  let cur = tid;
  const seen = new Set();
  while (cur && cur !== '0' && !seen.has(cur)) {
    seen.add(cur);
    path.push(cur);
    const t = trs.get(cur);
    cur = t ? t.father : null;
  }
  let x = 0, y = 0, sx = 1, sy = 1;
  for (const pid of path.reverse()) {
    const t = trs.get(pid);
    x += t.x * sx;
    y += t.y * sy;
    sx *= t.sx;
    sy *= t.sy;
  }
  return { x, y, sx, sy };
}

// Accumulate a RectTransform's anchored position from the canvas root.  All
// anchors are centre (0.5,0.5), so children stack additively.  The layers'
// local `scale` is NOT applied here: it is a gyroscope parallax "depth" scale
// (e.g. the card backdrop is 5x, the title 0.57x) that the game overrides at
// runtime so every layer sits at its natural sizeDelta on the card.  Applying
// it to the layout makes the backgrounds enormous and the watermarks tiny.
function anchoredPosition(tid, trs) {
  const path = [];
  let cur = tid;
  const seen = new Set();
  while (cur && cur !== '0' && !seen.has(cur)) {
    seen.add(cur);
    path.push(cur);
    const t = trs.get(cur);
    cur = t ? t.father : null;
  }
  let x = 0, y = 0;
  for (const pid of path.reverse()) {
    const t = trs.get(pid);
    x += t.apx;
    y += t.apy;
  }
  return { x, y };
}

// Collect the overlay (UI Image) layers of the <id>_G root, in Unity's render
// order (back to front = descending z, ties broken by hierarchy order).
function collectOverlay(gos, trs, srs, crs, images, followers, masks) {
  const trOfGo = new Map();
  for (const [tid, t] of trs) if (t.go) trOfGo.set(t.go, tid);

  const roots = [];
  for (const [gid, g] of gos) {
    const tid = trOfGo.get(gid);
    if (!tid) continue;
    const t = trs.get(tid);
    if (t.father == null || t.father === '0') roots.push(gid);
  }

  const layers = [];
  const walk = (gid, vis) => {
    if (vis.has(gid)) return;
    vis.add(gid);
    const tid = trOfGo.get(gid);
    const t = trs.get(tid);
    if (!t) return;
    const go = gos.get(gid);
    if (!go) return;
    const active = go.active !== 'False';
    // Only layers that actually draw something: an Image with a real sprite.
    const spriteId = images.get(gid);
    if (active && spriteId) {
      const at = anchoredPosition(tid, trs);
      // Determine whether this node is under a Mask (its ancestors are clipped).
      let underMask = false;
      let cur = t.father;
      const seenF = new Set();
      while (cur && cur !== '0' && !seenF.has(cur)) {
        seenF.add(cur);
        const pt = trs.get(cur);
        const pgo = pt ? pt.go : null;
        if (pgo && masks.has(pgo)) { underMask = true; break; }
        cur = pt ? pt.father : null;
      }
      layers.push({
        goId: gid,
        name: go.name,
        z: t.z,
        x: at.x, y: at.y,
        w: t.sdx, h: t.sdy,
        clip: underMask,
        follower: followers.get(gid),
        sprite: spriteId,
      });
    }
    for (const c of t.children) {
      const cgo = trs.get(c) ? trs.get(c).go : null;
      if (cgo) walk(cgo, vis);
    }
  };

  for (const root of roots) {
    const g = gos.get(root);
    if (!g) continue;
    if (g.name.endsWith('_G')) {
      const rt = trs.get(trOfGo.get(root));
      for (const c of rt.children) {
        const cgo = trs.get(c) ? trs.get(c).go : null;
        if (cgo) {
          const cg = gos.get(cgo);
          // The Gyroscope node itself contains no drawable layers; skip it.
          if (cg && cg.name === 'Gyroscope') continue;
          walk(cgo, new Set());
        }
      }
    }
  }

  // Sort back-to-front: higher z = farther from the camera = drawn first.
  layers.sort((a, b) => (b.z - a.z) || 0);
  // The frame (card border) is drawn at the very back (unmasked) so the card
  // content drawn on top covers its opaque centre, leaving only its outer ring.
  const frameIdx = layers.findIndex((l) => l.sprite === FRAME_SPRITE_ID);
  if (frameIdx > 0) layers.unshift(layers.splice(frameIdx, 1)[0]);
  return layers;
}

// Compute the mask window (size of the Mask component's rect) for a disc.
function findMask(gos, trs, masks) {
  const trOfGo = new Map();
  for (const [tid, t] of trs) if (t.go) trOfGo.set(t.go, tid);
  for (const gid of masks) {
    const tid = trOfGo.get(gid);
    if (!tid) continue;
    const t = trs.get(tid);
    if (!t) continue;
    const sdw = t.sdx * Math.abs(t.sx || 1);
    const sdh = t.sdy * Math.abs(t.sy || 1);
    if (sdw > 0 && sdh > 0) return { w: sdw, h: sdh, x: 0, y: 0 };
  }
  return null;
}

function main() {
  const { dumpDir, spriteDir, imgDir, texDir, texPngDir, frameDir, outFile, charsDir } = parseArgs();
  const result = {};

  // The disc card's outer border ("frame") is a shared sprite/texture in the
  // disc_common bundle, so its sprite never appears in a disc's own sprite dump
  // (AssetStudio drops the name-colliding "frame" sprite there).  Recover it
  // from the shared frame.png so it can be added back to every disc's overlay.
  const framePng = listFiles(frameDir).find((f) => f.split(/[\\/]/).pop() === 'frame.png');

  const bundles = fs.existsSync(dumpDir) ? fs.readdirSync(dumpDir) : [];
  for (const bundle of bundles) {
    const m = /^disc_(\d{4})$/.exec(bundle);
    if (!m) continue;
    const id = m[1];

    const { gos, trs, srs, crs } = parseDump(path.join(dumpDir, bundle));
    const sprs = parseSprites(path.join(spriteDir, bundle));
    const { images, followers, masks, avg } = parseBehaviours(path.join(imgDir, bundle));
    const textures = parseTextures(path.join(texDir, bundle));

    const overlay = collectOverlay(gos, trs, srs, crs, images, followers, masks);
    const mask = findMask(gos, trs, masks);

    // Stage each overlay layer's texture PNG and resolve its display geometry.
    const texPngBundle = path.join(texPngDir, bundle);
    const ovDir = path.join(`${charsDir}/${id}/${id}_p`, 'overlays');
    fs.mkdirSync(ovDir, { recursive: true });

    const layers = [];
    for (const l of overlay) {
      // The frame sprite lives in the shared common bundle; fall back to the
      // shared frame.png so the border isn't dropped from every disc.
      if (l.sprite === FRAME_SPRITE_ID) {
        if (!framePng) continue;
        const dest = path.join(ovDir, 'frame.png');
        fs.copyFileSync(framePng, dest);
        layers.push({
          file: 'frame',
          path: `chars/${id}/${id}_p/overlays/frame.png`,
          x: Math.round(l.x * 100) / 100,
          y: Math.round(-l.y * 100) / 100,
          w: Math.round(l.w * 100) / 100,
          h: Math.round(l.h * 100) / 100,
          // The frame is the card's outer border: a fully-opaque 752x768 image
          // slightly larger than the mask window.  It is placed at the BACK of
          // the stack (unmasked) so the opaque card content drawn on top covers
          // its centre, leaving only the outer ring (the border around the card)
          // visible.  It is re-ordered to the back after the z-sort below.
          clip: false,
          depth: 1,
        });
        continue;
      }
      const spr = sprs.get(l.sprite);
      const texName = spr && spr.texture ? textures.get(spr.texture) : null;
      if (!texName) continue;
      const src = listFiles(texPngBundle).find((f) => f.split(/[\\/]/).pop() === texName.split('/').pop() + '.png');
      if (!src) continue;
      const file = texName.replace(/\//g, '_');
      const dest = path.join(ovDir, file + '.png');
      fs.copyFileSync(src, dest);
      layers.push({
        file,
        path: `chars/${id}/${id}_p/overlays/${file}.png`,
        x: Math.round(l.x * 100) / 100,
        y: Math.round(-l.y * 100) / 100, // canvas y-down
        w: Math.round(l.w * 100) / 100,
        h: Math.round(l.h * 100) / 100,
        clip: l.clip,
        // The whole overlay group follows the gyroscope target together
        // (type 1 followers use AX/AY; the factor is identical for every
        // layer that draws, so a single per-scene factor is enough).
        depth: 1,
      });
    }

    if (!layers.length) {
      // No overlay scene (e.g. 1xxx/2xxx/3xxx discs): fall back to the <id>_B
      // full-card image as a single static layer.
      const baseName = `${id}_B`;
      const spr = [...sprs.values()].find((s) => s.texture && textures.get(s.texture) === baseName);
      if (spr) {
        const src = listFiles(texPngBundle).find((f) => f.split(/[\\/]/).pop() === baseName + '.png');
        if (src) {
          const dest = path.join(ovDir, baseName + '.png');
          fs.copyFileSync(src, dest);
          layers.push({
            file: baseName,
            path: `chars/${id}/${id}_p/overlays/${baseName}.png`,
            x: 0, y: 0,
            w: CANVAS, h: CANVAS,
            clip: false,
            depth: 0,
          });
        }
      }
    }

    if (!layers.length) continue;

    // Parallax factors: the overlay group shifts by (ax, ay) * normalized drag.
    const fb = [...followers.values()].find((f) => f.type === 1);
    const parallax = {
      ax: (fb && fb.ax) || 5,
      ay: (fb && fb.ay) || -25,
      xmin: avg.xmin ?? -0.99, xmax: avg.xmax ?? 0.99,
      ymin: avg.ymin ?? -0.99, ymax: avg.ymax ?? -0.21,
    };

    result[id] = {
      canvasW: CANVAS,
      canvasH: CANVAS,
      mask: mask ? { w: mask.w, h: mask.h, x: 0, y: 0 } : null,
      parallax,
      layers,
    };
    console.log(`disc_${id}: ${layers.length} parallax layer(s), mask=${mask ? mask.w + 'x' + mask.h : 'none'}`);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`Done. Wrote ${Object.keys(result).length} disc parallax scene(s) -> ${outFile}`);
}

main();