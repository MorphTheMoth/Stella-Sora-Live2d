#!/usr/bin/env node
/**
 * generateEvents.mjs — build data/events.json and the Events section of
 * data/models.json from the extractEvents.mjs fragments.
 *
 * Idempotent section rebuild (same pattern as generateDiscs.mjs): strips
 * every kind:"event" entry from models.json and re-appends fresh ones, so
 * re-running generateManifest.mjs (which only knows chars/) never leaves
 * stale event rows behind — this script must run after it (and after
 * generateDiscs.mjs) everywhere: dump.sh (both passes) and
 * bruteForceOthers.mjs.
 *
 * Entry ids end in `event` (static: `<ref>event`, e.g. 510001event;
 * spine: `<ref>_<skel>event`, e.g. 510007_BOSS1event), matching the
 * `<id>event` link-id shape in js/main.js, index.html and 404.html.
 *
 * Names resolve from the datamine: ActivityGroup language notes
 * ("The [Name] event has begun!") for story events, a curated table for
 * JointDrill seasons and other Activity.json events (whose names are
 * CN-only upstream), CharacterSkin names for char_2dsp Spine skins.
 *
 * Usage:
 *   node scripts/generateEvents.mjs [--stage .dump_tmp/eventstage]
 *     [--events events] [--out data/events.json] [--models data/models.json]
 *     [--datamine DIR]
 */

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
    stageDir: path.resolve(get('--stage', path.join(ROOT, '.dump_tmp/eventstage'))),
    eventsDir: path.resolve(get('--events', path.join(ROOT, 'events'))),
    outFile: path.resolve(get('--out', path.join(ROOT, 'data/events.json'))),
    modelsFile: path.resolve(get('--models', path.join(ROOT, 'data/models.json'))),
    datamine: get('--datamine', path.join(ROOT, '../StellaSoraData Makostar')),
  };
}

// Curated EN names for Activity.json events (upstream names are CN-only;
// story events below resolve from ActivityGroup language notes instead).
const CURATED = {
  '301041': 'Summer Check-in',
  '301042': 'Main Story Ch.8 Login',
  '400013': 'Cool Supply Stand S1',
  '500001': 'BD Exchange',
  '510001': 'Joint Drill I \u2014 Eye of Ashes',
  '510005': 'Joint Drill V',
  '510006': 'Joint Drill VI',
  '510007': 'Joint Drill S7 \u2014 Coppelius & Olympia',
  '600003': 'Peak Showcase',
  'advertise': 'Ad Banner',
};

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function buildNames(datamine) {
  const groupLang = loadJson(path.join(datamine, 'EN/language/en_US/ActivityGroup.json')) || {};
  const activityBin = loadJson(path.join(datamine, 'EN/bin/Activity.json')) || {};
  const skinLang = loadJson(path.join(datamine, 'EN/language/en_US/CharacterSkin.json')) || {};
  const groupNames = {};
  for (const [k, v] of Object.entries(groupLang)) {
    const m = /^ActivityGroup\.(\d+)\.1$/.exec(k);
    if (!m || typeof v !== 'string') continue;
    const nm = /The \[(.+?)\] event has begun!|event: (.+?) has begun!/.exec(v);
    if (nm) groupNames[m[1]] = (nm[1] || nm[2]).trim();
  }
  const activityCn = {};
  const activityGroup = {};
  const vals = Array.isArray(activityBin) ? activityBin : Object.values(activityBin);
  for (const it of vals) {
    if (it && it.Id !== undefined && it.Name) activityCn[String(it.Id)] = it.Name;
    // Story-event fragments are keyed by Activity id (e.g. 400017) while the
    // EN group notes are keyed by group id (e.g. 10112 via MidGroupId) —
    // keep the bridge so nameFor can resolve the group title.
    if (it && it.Id !== undefined && it.MidGroupId !== undefined) activityGroup[String(it.Id)] = String(it.MidGroupId);
  }
  const skinNames = {};
  for (const [k, v] of Object.entries(skinLang)) {
    const m = /^CharacterSkin\.(\d+)\.1$/.exec(k);
    if (m && typeof v === 'string') skinNames[m[1]] = v;
  }
  return { groupNames, activityCn, activityGroup, skinNames };
}

function nameFor(ref, names) {
  if (CURATED[ref]) return CURATED[ref];
  const sp = /^sp(\d+)$/.exec(ref);
  if (sp) return (names.skinNames[sp[1]] || `Skin ${sp[1]}`) + ' (Spine)';
  if (names.groupNames[ref]) return names.groupNames[ref];
  const grp = names.activityGroup ? names.activityGroup[ref] : null;
  if (grp && names.groupNames[grp]) return names.groupNames[grp];
  if (names.activityCn[ref]) return `${names.activityCn[ref]} (${ref})`;
  return `Activity ${ref}`;
}

function main() {
  const o = parseArgs();
  const names = buildNames(o.datamine);
  const frags = fs.existsSync(o.stageDir)
    ? fs.readdirSync(o.stageDir).filter((f) => f.endsWith('.json')).sort()
    : [];

  const events = {};
  const section = [];
  for (const f of frags) {
    const frag = loadJson(path.join(o.stageDir, f));
    if (!frag) continue;
    const ref = frag.ref;
    const entry = { name: nameFor(ref, names), static: null, spines: [] };
    if (frag.static) {
      entry.static = frag.static;
      const bodies = [{ file: frag.static.body, w: frag.static.w, h: frag.static.h, frame: frag.static.frame || null },
        ...((frag.static.extra || []).map((e) => ({ file: e.body, w: e.w, h: e.h, frame: e.frame || null })))];
      entry.static.bodies = bodies;
      if (frag.static.scene) entry.static.scene = frag.static.scene;
      section.push({
        id: ref + 'event',
        name: entry.name,
        kind: 'event',
        sub: 'static',
        eventRef: ref,
        variants: bodies.map((b, i) => ({
          name: ref + 'event',
          label: bodies.length > 1 ? `Event Art ${i + 1}` : 'Event Art',
          path: `events/${ref}/${b.file}`,
        })),
      });
    }
    for (const s of frag.spines || []) {
      entry.spines.push(s);
      if (frag.combinedSpines) continue; // one combined row emitted below
      const id = `${ref}_${s.name}event`;
      section.push({
        id,
        name: `${entry.name} \u2014 ${s.name}`,
        kind: 'event',
        sub: 'spine',
        eventRef: ref,
        spine: s.name,
        variants: [{ name: id, label: 'Spine', path: `events/${ref}/spine/${s.skel}` }],
      });
    }
    // Combined scene (e.g. both JointDrill bosses in one page): one row that
    // renders every character Spine of the shared scene together.
    if (frag.combinedSpines && entry.spines.length) {
      const id = `${ref}event`;
      section.push({
        id,
        name: entry.name,
        kind: 'event',
        sub: 'spine',
        eventRef: ref,
        spine: entry.spines[0].name,
        spines: entry.spines.map((s) => s.name),
        variants: entry.spines.map((s) => ({
          name: id,
          label: s.name,
          path: `events/${ref}/spine/${s.skel}`,
        })),
      });
    }
    events[ref] = entry;
  }

  fs.mkdirSync(path.dirname(o.outFile), { recursive: true });
  writeTextIfChanged(o.outFile, JSON.stringify(events, null, 2));

  const models = loadJson(o.modelsFile) || [];
  const kept = models.filter((item) => item.kind !== 'event');
  writeTextIfChanged(o.modelsFile, JSON.stringify([...kept, ...section], null, 2));
  console.log(`Wrote ${Object.keys(events).length} events, ${section.length} entries -> ${o.modelsFile}`);
}

main();
