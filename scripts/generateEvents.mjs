#!/usr/bin/env node
/**
 * generateEvents.mjs — build the Events section of data/models.json.
 *
 * Events are large Live2D scenes shown on the event page (e.g. Surfing Splash
 * Karin). They are technically disc Live2Ds (disc_l2d_4057) but the game shows
 * them full-screen on the ActivityTheme panel, not as a disc card. The viewer
 * therefore surfaces them as a dedicated "Events" section above Discs.
 *
 * Source data:
 *  - existing disc L2D entries in models.json (kind "discl2d" or raw 4-digit disc
 *    entries with variants) — these are the large disc_l2d models
 *  - ActivityGroup.json (optional) to label events with their activity name
 *    and to filter which discs are event-tied. If not found, all disc L2Ds are
 *    surfaced as events (so the feature still works for old pipeline runs).
 *  - discNames (discid.json) for display names
 *
 * Output: models.json with kind "event" entries inserted between characters and
 * discs. By default it MOVES disc L2Ds into events (so they don't duplicate
 * under Discs) — use --keep to duplicate instead.
 *
 * Usage:
 *   node scripts/generateEvents.mjs --models data/models.json --parallax data/discparallax.json --disc-names data/discid.json [--activity ActivityGroup.json] [--keep]
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
    modelsFile: get('--models', path.resolve('data/models.json')),
    discNamesFile: get('--disc-names', path.resolve('data/discid.json')),
    activityFile: get('--activity', ''),
    datamine: get('--datamine', ''),
    keep: args.includes('--keep'),
  };
}

function resolveActivityFile(activityFile, datamine) {
  if (activityFile && fs.existsSync(activityFile)) return activityFile;
  const dm = datamine || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../StellaSoraData Makostar');
  const cand = path.join(dm, 'EN/bin/ActivityGroup.json');
  if (fs.existsSync(cand)) return cand;
  const cand2 = path.join(dm, 'EN/bin/ActivityGroup.json');
  return fs.existsSync(cand2) ? cand2 : '';
}

function loadActivityDiscIds(activityFile) {
  if (!activityFile || !fs.existsSync(activityFile)) return null;
  try {
    const ag = JSON.parse(fs.readFileSync(activityFile, 'utf8'));
    const ids = new Set();
    for (const v of Object.values(ag)) {
      if (Array.isArray(v.RewardsShow)) {
        for (const full of v.RewardsShow) {
          const short = String(full).slice(-4);
          if (/^\d{4}$/.test(short)) ids.add(short);
        }
      }
    }
    return ids;
  } catch { return null; }
}

function main() {
  const { modelsFile, discNamesFile, activityFile, datamine, keep } = parseArgs();
  const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  const discNames = fs.existsSync(discNamesFile) ? JSON.parse(fs.readFileSync(discNamesFile, 'utf8')) : {};

  const resolvedActivity = resolveActivityFile(activityFile, datamine);
  const eventDiscIds = loadActivityDiscIds(resolvedActivity);

  // Split models into characters, parallax, discl2d
  const characters = [];
  const parallax = [];
  const l2dDiscs = new Map(); // discId -> { name, variants, originalKind }

  for (const item of models) {
    if (item.kind === 'parallax') { parallax.push(item); continue; }
    if (item.kind === 'discl2d' || item.kind === 'event') {
      const discId = item.id.replace(/l2d$/, '').replace(/event$/, '');
      if (!item.variants || !item.variants.length) continue;
      // treat any existing event as l2d source as well for idempotency
      l2dDiscs.set(discId, { name: item.name.replace(/ l2d$/, '').replace(/ \(Event\)$/, ''), variants: item.variants });
      if (item.kind === 'event' && keep) { /* keep existing events */ }
      continue;
    }
    const isDisc = /^\d{4}$/.test(item.id);
    if (isDisc) {
      if (Array.isArray(item.variants) && item.variants.length) {
        l2dDiscs.set(item.id, { name: item.name, variants: item.variants });
      } else {
        // parallax-only disc shells without model — already handled as parallax rebuild elsewhere
      }
    } else {
      characters.push(item);
    }
  }

  // Build events: for now, every disc L2D is an event. If we have ActivityGroup
  // filter, we could restrict, but Surfing Splash's 4057 (Ride the Waves) is
  // not in RewardsShow (it's story CG), so it would be missed. Include all.
  // Optionally, if eventDiscIds exists and the disc is in it, we label it with
  // the activity name; otherwise we still surface it as generic event.
  let eventEntries = [];
  for (const [discId, src] of [...l2dDiscs.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const name = discNames[discId] || src.name || `Disc ${discId}`;
    // Optionally skip discs that are clearly not events? For now include all
    // where a model exists — the viewer already distinguishes them as large
    // disc L2Ds. If ActivityGroup is present, we could mark which are event
    // rewards, but still include all so old events remain visible.
    const label = eventDiscIds && eventDiscIds.has(discId) ? `${name} (Event)` : name;
    eventEntries.push({
      id: discId,
      name: label,
      kind: 'event',
      variants: src.variants,
    });
  }

  // If --keep, keep original discl2d entries under Discs as well (duplicate);
  // otherwise move them (Discs will be parallax-only).
  const discs = [...parallax];
  if (keep) {
    for (const [discId, src] of [...l2dDiscs.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const name = discNames[discId] || src.name || `Disc ${discId}`;
      discs.push({ id: `${discId}l2d`, name: `${name} l2d`, kind: 'discl2d', variants: src.variants });
    }
  }

  const result = [...characters, ...eventEntries, ...discs];
  fs.writeFileSync(modelsFile, JSON.stringify(result, null, 2));
  console.log(`Wrote ${characters.length} characters + ${eventEntries.length} events + ${parallax.length} parallax${keep ? ` + ${l2dDiscs.size} l2d` : ''} -> ${modelsFile}${resolvedActivity ? ` (ActivityGroup: ${path.basename(resolvedActivity)})` : ''}`);
}

main();
