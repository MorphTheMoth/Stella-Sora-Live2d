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
    bigSpritesDir: get('--bigsprites', path.resolve('.dump_tmp/discbigsprites')),
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

function parseQuat(block) {
  const s = block.join('\n');
  const m = /m_LocalRotation[\s\S]*?float x = ([-\.0-9Ee+]+)[\s\S]*?float y = ([-\.0-9Ee+]+)[\s\S]*?float z = ([-\.0-9Ee+]+)[\s\S]*?float w = ([-\.0-9Ee+]+)/.exec(s);
  if (!m) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]), w: parseFloat(m[4]) };
}
function quatMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function quatRotateVec(q, v) {
  // q * v * q^-1, v as pure quat
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const vx = v.x, vy = v.y, vz = v.z;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  // v' = v + qw*t + cross(q.xyz, t)
  return {
    x: vx + qw * tx + qy * tz - qz * ty,
    y: vy + qw * ty + qz * tx - qx * tz,
    z: vz + qw * tz + qx * ty - qy * tx,
  };
}
function quatToEuler(q) {
  // Unity intrinsic ZXY order? Use standard XYZ extraction for viewer (matches Unity Euler)
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const sinX = 2 * (w * x - y * z);
  const cosX = 1 - 2 * (x * x + y * y);
  const ex = Math.atan2(sinX, cosX);
  const sinY = 2 * (w * y + x * z);
  let ey;
  if (Math.abs(sinY) >= 1) ey = Math.sign(sinY) * Math.PI / 2;
  else ey = Math.asin(sinY);
  const sinZ = 2 * (w * z - x * y);
  const cosZ = 1 - 2 * (z * z + y * y);
  const ez = Math.atan2(sinZ, cosZ);
  return { x: ex, y: ey, z: ez };
}
function quaternionZ(block) {
  const s = block.join('\n');
  const m = /m_LocalRotation[\s\S]*?float x = ([-\.0-9Ee+]+)[\s\S]*?float y = ([-\.0-9Ee+]+)[\s\S]*?float z = ([-\.0-9Ee+]+)[\s\S]*?float w = ([-\.0-9Ee+]+)/.exec(s);
  if (!m) return 0;
  const x = parseFloat(m[1]), y = parseFloat(m[2]);
  const z = parseFloat(m[3]), w = parseFloat(m[4]);
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
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
      const apBlock = byName.get('AnchoredPosition') ? byName.get('AnchoredPosition').block : [];
      const ap = vecField(apBlock, 'm_AnchoredPosition', 2);
      const sd = vecField(byName.get('SizeDelta') ? byName.get('SizeDelta').block : [], 'm_SizeDelta', 2) || { x: 0, y: 0 };
      const pv = vecField(byName.get('Pivot') ? byName.get('Pivot').block : [], 'm_Pivot', 2) || { x: 0.5, y: 0.5 };
      const amn = vecField(byName.get('AnchorMin') ? byName.get('AnchorMin').block : [], 'm_AnchorMin', 2) || { x: 0.5, y: 0.5 };
      const amx = vecField(byName.get('AnchorMax') ? byName.get('AnchorMax').block : [], 'm_AnchorMax', 2) || { x: 0.5, y: 0.5 };
      const ancx = (amn.x + amx.x) / 2;
      const ancy = (amn.y + amx.y) / 2;
      const quat = parseQuat(byName.get('LocalRotation') ? byName.get('LocalRotation').block : []);
      trs.set(pid, {
        go: goF ? singlePathID(goF.block) : null,
        x: pos.x, y: pos.y, z: pos.z,
        sx: scale.x, sy: scale.y, sz: scale.z,
        apx: ap ? ap.x : pos.x, apy: ap ? ap.y : pos.y,
        hasAp: Boolean(ap),
        sdx: sd.x, sdy: sd.y,
        pvx: pv.x, pvy: pv.y,
        ancx, ancy,
        quat,
        rot: quaternionZ(byName.get('LocalRotation') ? byName.get('LocalRotation').block : []),
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
    const ppuM = /float m_PixelsToUnits = ([\d\.]+)/.exec(text);
    sprs.set(pid, {
      name: strVal(byName.get('Name') ? byName.get('Name').block : []),
      texture: texM ? texM[1] : null,
      w: rect.width || 0,
      h: rect.height || 0,
      ppu: ppuM ? parseFloat(ppuM[1]) : 100,
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
  const warps = new Map();       // goId -> [BL,TL,TR,BR] warped corner [x,y,z] (local px)
  const additives = new Set();   // goId of UIAdditiveEffect components (additive blend)
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
    } else if (name === 'ImageWarp') {
      // ImageWarp is an Image variant: register its sprite like an Image, and
      // additionally record its corner offsets (see below).
      const sprM = /"m_Sprite"\s*:\s*\{[^}]*"m_PathID"\s*:\s*(-?\d+)/.exec(text);
      if (sprM && sprM[1] !== '0') images.set(goId, sprM[1]);
      // ImageWarp bends the quad through 4 corner positions (a static fake-
      // perspective warp the game uses for floors/walls, e.g. disc 4012's
      // bg_ground).  At runtime (ImageWarp.OnPopulateMesh -> WarpManager
      // .PopulateMesh, confirmed in the GameAssembly decompilation) the mesh
      // corners are rebuilt from the LIVE rect quad and only the component's
      // own m_cornerOffsetBL/TL/TR/BR are added on top of them — the serialised
      // m_warpManager.m_cornerPosition* in the bundle is stale editor data
      // (disc 4012 bg05's rect was resized after warping, so the two no longer
      // agree).  We therefore store the offsets and rebuild the corners from
      // the live RectTransform in collectOverlay.
      try {
        const j = JSON.parse(text);
        const grab = (k) => {
          const v = j[k];
          return v ? [v.x, v.y, v.z || 0] : [0, 0, 0];
        };
        warps.set(goId, {
          bl: grab('m_cornerOffsetBL'),
          tl: grab('m_cornerOffsetTL'),
          tr: grab('m_cornerOffsetTR'),
          br: grab('m_cornerOffsetBR'),
        });
      } catch {}
    } else if (name === 'UIAdditiveEffect') {
      // UIAdditiveEffect.SetMaterial (decompiled) swaps the graphic's material
      // to the "UI Extensions/UIAdditive" shader — additive blending, so the
      // texture's black areas contribute nothing and only the bright parts
      // (e.g. disc 4038's sun-glare Light layer) show over the scene.  The
      // viewer must composite these layers additively, not alpha-blended.
      additives.add(goId);
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
  return { images, followers, masks, warps, additives, avg };
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

// Resolve a RectTransform into the card root's coordinate space.  Unity's
// anchoredPosition is local to the parent; local scale and rotation still
// affect both the displayed size and the child's final position.  Ignoring
// those transforms loses objects on compositions whose Canvas uses a scale
// chain (notably discs 4012 and 4020).  This version accumulates the full
// 3D transform (position/rotation/scale) so that cards with pre-tilted layers
// (ground planes at 80° X — discs 4020/4023/4024) place correctly; the old
// 2D Z-only version left those layers visibly offset.
//
// Nodes carrying a GyroscopeFollower type=rotate have their prefab rotation
// overridden at runtime (Update sets it to Euler(ax·ty/100, ay·tx/100), so at
// rest it is identity).  For rest-pose extraction we must therefore ignore the
// prefab quat on those GOs, otherwise the whole card appears pre-tilted.
function worldLayout(tid, trs, followers = null, seen = new Set()) {
  if (!tid || tid === '0' || seen.has(tid)) {
    return { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rot: 0, quat: { x: 0, y: 0, z: 0, w: 1 } };
  }
  seen.add(tid);
  const t = trs.get(tid);
  if (!t) return { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rot: 0, quat: { x: 0, y: 0, z: 0, w: 1 } };
  const parent = worldLayout(t.father, trs, followers, seen);
  // Child's anchoredPosition is relative to the parent's *anchor* (RectTransform anchor point),
  // not its pivot.  Parent's anchor world = parent pivot + (anc - pv)*sizeWorld.
  let anchorOff = { x: 0, y: 0, z: 0 };
  const pTr = t.father ? trs.get(t.father) : null;
  if (pTr) {
    const pw = pTr.sdx * parent.sx;
    const ph = pTr.sdy * parent.sy;
    const ax = (pTr.ancx ?? 0.5) - (pTr.pvx ?? 0.5);
    const ay = (pTr.ancy ?? 0.5) - (pTr.pvy ?? 0.5);
    const localAnchor = { x: ax * pw, y: ay * ph, z: 0 };
    anchorOff = quatRotateVec(parent.quat, localAnchor);
  }
  const parentAnchorX = parent.x + anchorOff.x;
  const parentAnchorY = parent.y + anchorOff.y;
  const parentAnchorZ = parent.z + anchorOff.z;
  const lx = t.apx, ly = t.apy, lz = t.z;
  const scaled = { x: lx * parent.sx, y: ly * parent.sy, z: lz * (parent.sz || 1) };
  const rotated = quatRotateVec(parent.quat, scaled);
  let localQuat = t.quat || { x: 0, y: 0, z: 0, w: 1 };
  if (followers && t.go && followers.get(t.go)?.type === 1) {
    localQuat = { x: 0, y: 0, z: 0, w: 1 };
  }
  const quat = quatMul(parent.quat, localQuat);
  const e = quatToEuler(quat);
  return {
    x: parentAnchorX + rotated.x,
    y: parentAnchorY + rotated.y,
    z: parentAnchorZ + rotated.z,
    sx: parent.sx * t.sx,
    sy: parent.sy * t.sy,
    sz: (parent.sz || 1) * (t.sz || 1),
    rot: e.z,
    quat,
  };
}

// Accumulate a node's world-space depth (world Z after full hierarchy).  Used
// at rest for the perspective zoom D/(D+z); also drives the differential
// parallax when the whole card tilts.
function worldDepth(tid, trs, followers = null) {
  return worldLayout(tid, trs, followers).z;
}

// Collect the overlay (UI Image) layers of the <id>_G root, in Unity's render
// order (back to front = descending z, ties broken by hierarchy order).
function collectOverlay(gos, trs, srs, crs, images, followers, masks, warps, additives) {
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
  // A GyroscopeFollower usually lives on a container node (e.g. layer_1) and
  // drives every sprite beneath it: the container's localPosition is what the
  // follower moves, so its children inherit that motion through the hierarchy.
  // We therefore propagate the nearest ancestor's follower down to each drawable
  // layer so the viewer can apply the same 2D translation to the whole group.
  const walk = (gid, vis, inheritedFollower) => {
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
      const at = worldLayout(tid, trs, followers);
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
      // RectTransform positions/sizes are authored in the layer's local canvas
      // space and then multiplied by the full scale chain (this node's
      // localScale * every ancestor's scale) to reach world canvas px.  Each
      // layer's scale is independent, so we must carry BOTH the scale into the
      // size (sdx*at.sx) AND leave the position as the true world centre
      // (at.x, not at.x/at.sx) — otherwise layers with non-unit scale render
      // too small and drifted toward the card centre.  at.sx already includes
      // this node's own localScale, so sdx*at.sx is the displayed world width.
      // Pivot handling: at is the pivot's world position; the rect's centre is
      // pivot + rotate(worldQuat, ((0.5-px)*w, (0.5-py)*h)).
      let w = t.sdx * (at.sx || 1), h = t.sdy * (at.sy || 1);
      const pvx = t.pvx ?? 0.5, pvy = t.pvy ?? 0.5;
      const offLocalX = (0.5 - pvx) * w;
      const offLocalY = (0.5 - pvy) * h;
      const offWorld = quatRotateVec(at.quat, { x: offLocalX, y: offLocalY, z: 0 });

      const cx = at.x + offWorld.x;
      const cy = at.y + offWorld.y;
      const cz = at.z + offWorld.z;
      // Depth frame: the game's mesh vertices are pivot-relative in ALL axes
      // (ImageWarp_OnPopulateMesh rebuilds the warp from the live rect quad and
      // the CanvasRenderer transforms it by the pivot-anchored localToWorld), so
      // a warped layer's base depth is the PIVOT's z.  Storing the centre's z
      // (cz) here shifted rotated off-centre layers (disc 4012's pillars:
      // pivot at the left/right edge + a static ry) several dozen canvas px
      // too deep, which shrank/drifted them relative to the floor and made
      // adjacent pillars overlap.  Unwarped layers are centred (the viewer
      // rotates their offsets around the centre), so they keep cz.
      const e = quatToEuler(at.quat);
      // ImageWarp corner warp: rebuild the runtime mesh corners the way
      // WarpManager.PopulateMesh does — live rect corners (pivot-relative,
      // local px) plus the component's m_cornerOffset* — then scale them into
      // canvas px by the accumulated hierarchy scale.  The viewer bilinearly
      // maps its vertex grid through these before static rotation + camera
      // projection.  Layers whose offsets leave the rect unchanged render as
      // plain quads.
      const warpOff = warps && warps.get(gid);
      let warp = null;
      if (warpOff) {
        const lx0 = -(t.pvx ?? 0.5) * t.sdx, ly0 = -(t.pvy ?? 0.5) * t.sdy;
        const rect = [
          [lx0, ly0, 0], [lx0, ly0 + t.sdy, 0],
          [lx0 + t.sdx, ly0 + t.sdy, 0], [lx0 + t.sdx, ly0, 0],
        ]; // [BL, TL, TR, BR]
        const cur = [warpOff.bl, warpOff.tl, warpOff.tr, warpOff.br].map(
          (o, i) => [rect[i][0] + o[0], rect[i][1] + o[1], rect[i][2] + o[2]]
        );
        const differs = cur.some((c, i) =>
          Math.abs(c[0] - rect[i][0]) > 0.01 || Math.abs(c[1] - rect[i][1]) > 0.01 || Math.abs(c[2] - rect[i][2]) > 0.01
        );
        if (differs) warp = cur;
      }
      // For ImageWarp the corners define the actual mesh size — use that
      // for w/h, not the RectTransform's sizeDelta, so the pillar joints
      // line up exactly as the game does.
      if (warp) {
        const xs = warp.map(c => c[0]), ys = warp.map(c => c[1]);
        w = (Math.max(...xs) - Math.min(...xs)) * (at.sx || 1);
        h = (Math.max(...ys) - Math.min(...ys)) * (at.sy || 1);
      }
      // For ImageWarp the corners are pivot-relative, not centre-relative.
      const isWarp = !!warp;
      layers.push({
        goId: gid,
        name: go.name,
        z: isWarp ? at.z : cz,
        x: isWarp ? at.x : cx, y: isWarp ? at.y : cy,
        w, h,
        sx: t.sx, sy: t.sy,
        clip: underMask,
        follower: followers.get(gid) || inheritedFollower,
        sprite: spriteId,
        // World-space static rotation (radians) — discs 4020/4023/4024 have
        // pre-tilted layers (ground 80° X, etc.) that must be baked before the
        // dynamic gyroscope tilt.
        rx: e.x, ry: e.y, rz: e.z,
        ...(warp ? { corners: warp.map((c) => [c[0] * (at.sx || 1), c[1] * (at.sy || 1), (c[2] || 0) * (at.sz || 1)]) } : {}),
        ...(additives && additives.has(gid) ? { blend: 'add' } : {}),
      });
    }
    const childFollower = followers.get(gid) || inheritedFollower;
    for (const c of t.children) {
      const cgo = trs.get(c) ? trs.get(c).go : null;
      if (cgo) walk(cgo, vis, childFollower);
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
          walk(cgo, new Set(), null);
        }
      }
    }
  }

  // Unity renders a Canvas strictly in hierarchy order (painter's algorithm) —
  // localPosition.z does NOT sort UI.  The walk above visits children in
  // sibling order, so `layers` is already the game's exact draw order; do not
  // re-sort it here.
  return layers;
}

// Compute the mask window (size of the Mask component's rect) for a disc.
function findMask(gos, trs, masks, followers = null) {
  const trOfGo = new Map();
  for (const [tid, t] of trs) if (t.go) trOfGo.set(t.go, tid);
  for (const gid of masks) {
    const tid = trOfGo.get(gid);
    if (!tid) continue;
    const t = trs.get(tid);
    if (!t) continue;
    const layout = worldLayout(tid, trs, followers);
    const sdw = t.sdx * Math.abs(layout.sx || 1);
    const sdh = t.sdy * Math.abs(layout.sy || 1);
    if (sdw > 0 && sdh > 0) return { w: sdw, h: sdh, x: 0, y: 0 };
  }
  return null;
}

function main() {
  const { dumpDir, spriteDir, imgDir, texDir, texPngDir, frameDir, bigSpritesDir, outFile, charsDir } = parseArgs();
  const result = {};

  // The disc card's outer border ("frame") is a shared sprite/texture in the
  // disc_common bundle, so its sprite never appears in a disc's own sprite dump
  // (AssetStudio drops the name-colliding "frame" sprite there).  Recover it
  // from the shared frame.png so it can be added back to every disc's overlay.
  const framePng = listFiles(frameDir).find((f) => f.split(/[\\/]/).pop() === 'frame.png');

  // Discs without their own Card prefab (all 1xxx/2xxx/3xxx discs) are
  // rendered by the game through Disc/Common/Common.prefab
  // (LiveDiscCtrl.SetRawImage): the <id>_B art goes into `layer_-1/icon` and
  // a rarity-coloured frame into `layer_-1/frame` (BaseCtrl.SetSprite_FrameColor
  // loads "UI/big_sprites/rare_outfit_<R>.png", with FrameColor_New mapping
  // SSR->5, SR->4, R->3).  Parse the prefab's icon/frame rects from the
  // disc_common scene-graph dump instead of hardcoding them.
  let commonLayout = null;
  {
    const cmnDump = path.join(dumpDir, 'disc_common');
    if (fs.existsSync(cmnDump)) {
      const { gos, trs } = parseDump(cmnDump);
      const trOfGo = new Map();
      for (const [tid, t] of trs) if (t.go) trOfGo.set(t.go, tid);
      const rectOf = (name) => {
        for (const [gid, g] of gos) {
          if (g.name !== name) continue;
          const t = trs.get(trOfGo.get(gid));
          if (t) return {
            w: Math.round(t.sdx * t.sx * 100) / 100,
            h: Math.round(t.sdy * t.sy * 100) / 100,
            x: t.apx, y: t.apy,
          };
        }
        return null;
      };
      const icon = rectOf('icon');
      const frame = rectOf('frame');
      if (icon && frame) commonLayout = { icon, frame };
    }
  }

  const bundles = fs.existsSync(dumpDir) ? fs.readdirSync(dumpDir) : [];
  for (const bundle of bundles) {
    const m = /^disc_(\d{4})$/.exec(bundle);
    if (!m) continue;
    const id = m[1];

    const { gos, trs, srs, crs } = parseDump(path.join(dumpDir, bundle));
    const sprs = parseSprites(path.join(spriteDir, bundle));
    const { images, followers, masks, warps, additives, avg } = parseBehaviours(path.join(imgDir, bundle));
    const textures = parseTextures(path.join(texDir, bundle));

    const overlay = collectOverlay(gos, trs, srs, crs, images, followers, masks, warps, additives);
    const mask = findMask(gos, trs, masks, followers);

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
        const hasFrameRot = Math.abs(l.rx) > 0.001 || Math.abs(l.ry) > 0.001 || Math.abs(l.rz) > 0.001;
        layers.push({
          file: 'frame',
          path: `chars/${id}/${id}_p/overlays/frame.png`,
          x: Math.round(l.x * 100) / 100,
          y: Math.round(-l.y * 100) / 100,
          w: Math.round(l.w * 100) / 100,
          h: Math.round(l.h * 100) / 100,
          // The frame sprite is the card's outer border ring; it stays
          // unmasked and keeps its hierarchy draw position (some discs list
          // its group before the Mask content, some after — the game draws
          // both ways).
          clip: false,
          z: Math.round(l.z * 100) / 100,
          depth: Math.round(l.z * 100) / 100,
          ...(hasFrameRot ? { rx: Math.round(l.rx * 1000) / 1000, ry: Math.round(l.ry * 1000) / 1000, rz: Math.round(l.rz * 1000) / 1000 } : {}),
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
      if (id === '4023' && file.includes('bucket_01')) {
        l.x = -12; l.y = -298;
      }

      const hasStaticRot = Math.abs(l.rx) > 0.001 || Math.abs(l.ry) > 0.001 || Math.abs(l.rz) > 0.001;
      layers.push({
        file,
        path: `chars/${id}/${id}_p/overlays/${file}.png`,
        x: Math.round(l.x * 100) / 100,
        y: Math.round(-l.y * 100) / 100, // canvas y-down
        w: Math.round(l.w * 100) / 100,
        h: Math.round(l.h * 100) / 100,
        clip: l.clip,
        // Per-layer gyroscope follower.  In the game the disc is rendered by an
        // orthographic OffScreen2DCamera and the parallax is a plain 2D
        // translation: each layer follows the Gyroscope/Target object, shifting
        // by (targetOffset * fFactorAX/AY) for `move` type (rotation for
        // `rotate` type).  We surface the factors so the viewer can reproduce
        // that exactly instead of faking it with a perspective projection.
        follower: l.follower
          ? { type: l.follower.type, ax: l.follower.ax, ay: l.follower.ay }
          : null,
        // World-space depth of the layer along the camera view axis, kept for
        // reference / sorting.  (The actual parallax driver is the follower
        // factors above, not a perspective projection.)
        z: Math.round(l.z * 100) / 100,
        depth: Math.round(l.z * 100) / 100,
        ...(l.corners ? { corners: l.corners.map((c) => [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100, Math.round((c[2] || 0) * 100) / 100]) } : {}),
        ...(l.blend ? { blend: l.blend } : {}),
        ...(hasStaticRot ? { rx: Math.round(l.rx * 1000) / 1000, ry: Math.round(l.ry * 1000) / 1000, rz: Math.round(l.rz * 1000) / 1000 } : {}),
      });
    }

    if (!layers.length) {
      // No overlay scene (1xxx/2xxx/3xxx discs): the game falls back to
      // Disc/Common/Common.prefab — the <id>_B art in `layer_-1/icon` plus a
      // rarity-coloured frame in `layer_-1/frame`, drawn in sibling order
      // (icon first, frame on top).  Frame rarity per AllEnum.FrameColor_New:
      // R (3-star) -> rare_outfit_3, SR (4-star) -> rare_outfit_4; disc ids
      // 1xxx/2xxx are 3-star, 3xxx are 4-star (4xxx are SSR but all have
      // Card prefabs, so they never take this path — map them to 5 anyway).
      const baseName = `${id}_B`;
      const spr = [...sprs.values()].find((s) => s.texture && textures.get(s.texture) === baseName);
      if (spr) {
        const src = listFiles(texPngBundle).find((f) => f.split(/[\\/]/).pop() === baseName + '.png');
        if (src) {
          const dest = path.join(ovDir, baseName + '.png');
          fs.copyFileSync(src, dest);
          const rarity = id[0] === '3' ? 4 : id[0] === '4' ? 5 : 3;
          // The rarity frame is shared — stage it once under chars/common/.
          let frameLayer = null;
          const layout = commonLayout || { icon: { w: CANVAS, h: CANVAS, x: 0, y: 0 }, frame: null };
          if (commonLayout) {
            const frameSrc = listFiles(bigSpritesDir).find((f) => f.split(/[\\/]/).pop() === `rare_outfit_${rarity}.png`);
            if (frameSrc) {
              const commonDir = path.join(`${charsDir}/common`);
              fs.mkdirSync(commonDir, { recursive: true });
              const frameDest = path.join(commonDir, `rare_outfit_${rarity}.png`);
              if (!fs.existsSync(frameDest)) fs.copyFileSync(frameSrc, frameDest);
              frameLayer = {
                file: `rare_outfit_${rarity}`,
                path: `chars/common/rare_outfit_${rarity}.png`,
                x: commonLayout.frame.x, y: commonLayout.frame.y,
                w: commonLayout.frame.w, h: commonLayout.frame.h,
              };
            }
          }
          layers.push({
            file: baseName,
            path: `chars/${id}/${id}_p/overlays/${baseName}.png`,
            x: layout.icon.x, y: layout.icon.y,
            w: layout.icon.w, h: layout.icon.h,
            clip: false,
            z: 0,
            depth: 0,
          });
          if (frameLayer) {
            layers.push({ ...frameLayer, clip: false, z: 0, depth: 0 });
          }
        }
      }
    }

    // 4012/4043 have no bg in the overlay (only characters/grass) — their
    // painterly background lives in the _M half (SpriteRenderers under
    // <id>_M, not Images under <id>_G).  Temporarily disabled: user reports
    // hall image is wrong (likely _M bg is thumbnail composite, not live
    // parallax bg). Revert to gradient until correct bg identified.
    if (false && layers.length && (id === '4012' || id === '4043') && !layers.some(l => /bg/i.test(l.file) || l.file === `${id}_B`)) {
      // Build a reverse map: goId -> tid, and tid -> tr
      const trOfGo = new Map();
      for (const [tid, t] of trs) if (t.go) trOfGo.set(t.go, tid);
      const mEntry = [...gos.entries()].find(([, g]) => g.name === `${id}_M`);
      const mLayers = [];
      if (mEntry) {
        const [mGid] = mEntry;
        const mTid = trOfGo.get(mGid);
        const mTr = mTid ? trs.get(mTid) : null;
        const walkM = (gid) => {
          const tid = trOfGo.get(gid);
          if (!tid) return;
          const t = trs.get(tid);
          if (!t) return;
          // Any SpriteRenderer on this GO is a candidate background piece.
          for (const [srPid, sr] of srs) {
            if (sr.go !== gid) continue;
            const spr = sprs.get(sr.sprite);
            const texName = spr && spr.texture ? textures.get(spr.texture) : null;
            if (!texName || !spr) continue;
            const src = listFiles(texPngBundle).find((f) => f.split(/[\\/]/).pop() === texName.split('/').pop() + '.png');
            if (!src) continue;
            const file = texName.replace(/\//g, '_');
            const dest = path.join(ovDir, file + '.png');
            try { fs.copyFileSync(src, dest); } catch {}
            const at = worldLayout(tid, trs, followers);
            const w = (t.sdx ? t.sdx : spr.w) * (at.sx || 1);
            const h = (t.sdy ? t.sdy : spr.h) * (at.sy || 1);
            const pvx = t.pvx ?? 0.5, pvy = t.pvy ?? 0.5;
            const offLocalX = (0.5 - pvx) * w;
            const offLocalY = (0.5 - pvy) * h;
            const offWorld = quatRotateVec(at.quat, { x: offLocalX, y: offLocalY, z: 0 });
            const cx = at.x + offWorld.x;
            const cy = at.y + offWorld.y;
            const cz = at.z + offWorld.z;
            const e = quatToEuler(at.quat);
            const hasRot = Math.abs(e.x) > 0.001 || Math.abs(e.y) > 0.001 || Math.abs(e.z) > 0.001;
            mLayers.push({
              file,
              path: `chars/${id}/${id}_p/overlays/${file}.png`,
              x: Math.round(cx * 100) / 100,
              y: Math.round(-cy * 100) / 100,
              w: Math.round(w * 100) / 100,
              h: Math.round(h * 100) / 100,
              clip: true,
              z: Math.round(cz * 100) / 100,
              depth: Math.round(cz * 100) / 100,
              ...(hasRot ? { rx: Math.round(e.x*1000)/1000, ry: Math.round(e.y*1000)/1000, rz: Math.round(e.z*1000)/1000 } : {}),
            });
          }
          for (const c of t.children) {
            const cgo = trs.get(c)?.go;
            if (cgo) walkM(cgo);
          }
        };
        if (mTr) for (const c of mTr.children) {
          const cgo = trs.get(c)?.go;
          if (cgo) walkM(cgo);
        }
      }
      if (mLayers.length) {
        // _M layers are behind _G; prepend them in hierarchy order.
        layers.unshift(...mLayers);
      } else {
        const baseName = `${id}_B`;
        const spr = [...sprs.values()].find((s) => s.texture && textures.get(s.texture) === baseName);
        if (spr) {
          const src = listFiles(texPngBundle).find((f) => f.split(/[\\/]/).pop() === baseName + '.png');
          if (src) {
            const dest = path.join(ovDir, baseName + '.png');
            if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
            layers.unshift({
              file: baseName,
              path: `chars/${id}/${id}_p/overlays/${baseName}.png`,
              x: 0, y: 0,
              w: CANVAS, h: CANVAS,
              clip: false,
              z: 0,
              depth: 0,
            });
          }
        }
      }
    }

    if (!layers.length) continue;

    // Parallax factors: every rotate-follower group in a card prefab shares
    // one (fFactorAX, fFactorAY) pair; the overlay shifts by
    // (ax * dragX, ay * dragY) in game units.  Discs without their own Card
    // prefab fall back to the shared Common.prefab gyroscope (disc_common).
    const fb = [...followers.values()].find((f) => f.type === 1);
    let commonFb = null;
    if (!fb) {
      const commonDir = path.join(imgDir, 'disc_common');
      if (fs.existsSync(commonDir)) {
        const cmn = parseBehaviours(commonDir);
        commonFb = [...cmn.followers.values()].find((f) => f.type === 1) || null;
      }
    }
    const eff = fb || commonFb;
    const parallax = eff
      ? {
          ax: eff.ax,
          ay: eff.ay,
          xmin: avg.xmin ?? -0.99, xmax: avg.xmax ?? 0.99,
          ymin: avg.ymin ?? -0.99, ymax: avg.ymax ?? -0.21,
        }
      : null;

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
