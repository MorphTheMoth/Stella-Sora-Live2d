#!/usr/bin/env node
/**
 * datamine.mjs — resolve files from the datamine clones next to this repo.
 *
 * The datamine used to be a single clone (`StellaSoraData Makostar`).  With
 * game 2.0 it was split in two:
 *   - `ss-data`                    -> `EN/bin/*.json` + `EN/language/en_US/*.json`
 *                                     (binary tables, localised text)
 *   - `StellaSoraData Makostar`    -> `Lua/` only (ss-lua, decompiled UI code)
 *
 * Resolvers therefore probe `../ss-data` first and fall back to the old
 * combined root, so checkouts made before the split keep working.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DATAMINE_ROOTS = [
  path.join(REPO_ROOT, '../ss-data'),
  path.join(REPO_ROOT, '../StellaSoraData Makostar'),
];

function rootsFor(explicit) {
  return explicit ? [explicit, ...DATAMINE_ROOTS] : DATAMINE_ROOTS;
}

// Root dir that contains `probe` (e.g. "EN/bin/Disc.json"), the first match
// wins.  Falls back to the explicit dir (or the first candidate) when nothing
// matches, so callers keep their existing error messages.
export function resolveDatamineDir(explicit = '', probe = 'EN') {
  for (const root of rootsFor(explicit)) {
    if (!root) continue;
    if (fs.existsSync(path.join(root, probe))) return root;
  }
  return explicit || DATAMINE_ROOTS[0];
}

// Explicit file wins; otherwise probe every datamine root for `subpath`.
export function resolveDatamineFile(explicit = '', datamineDir = '', subpath = '') {
  if (explicit && fs.existsSync(explicit)) return explicit;
  for (const root of rootsFor(datamineDir)) {
    if (!root) continue;
    const cand = path.join(root, subpath);
    if (fs.existsSync(cand)) return cand;
  }
  return explicit;
}
