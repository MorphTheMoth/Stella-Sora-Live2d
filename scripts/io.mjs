#!/usr/bin/env node
/**
 * io.mjs — content-stable file writes for the dump pipeline.
 *
 * `aws s3 sync` reuploads any file whose mtime is newer than the remote
 * copy, even when the bytes are identical — and a game update rewrites
 * every bundle (new mtimes), so a naive re-extract touches thousands of
 * outputs.  Every script that stages into a synced dir (chars/, bg/,
 * avg/, events/) or a committed manifest (data/*.json) must write through
 * these helpers so unchanged bytes keep their mtime and neither S3 nor
 * git sees churn.
 *
 * Usage:
 *   import { copyIfChanged, writeTextIfChanged } from './io.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';

export function readBytes(p) {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

// Write `data` (Buffer or string) only when the bytes differ. Returns true
// when the file was written.
export function writeBytesIfChanged(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const cur = readBytes(file);
  if (cur && cur.equals(buf)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return true;
}

export function writeTextIfChanged(file, text) {
  return writeBytesIfChanged(file, Buffer.from(text, 'utf8'));
}

// Copy src -> dst only when the bytes differ (missing dst counts as
// different). Returns true when the file was copied.
export function copyIfChanged(src, dst) {
  let st;
  try {
    st = fs.statSync(src);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  try {
    const dt = fs.statSync(dst);
    if (dt.isFile() && dt.size === st.size) {
      const a = fs.readFileSync(src);
      const b = fs.readFileSync(dst);
      if (a.equals(b)) return false;
    }
  } catch {
    /* dst missing -> copy */
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}

// Recursive merge-copy of srcDir into dstDir (like `cp -r --merge`):
// only changed files are written, nothing is deleted. Returns the number
// of files copied.
export function copyDirIfChanged(srcDir, dstDir) {
  let n = 0;
  const walk = (s, d) => {
    fs.mkdirSync(d, { recursive: true });
    for (const e of fs.readdirSync(s, { withFileTypes: true })) {
      const sp = path.join(s, e.name);
      const dp = path.join(d, e.name);
      if (e.isDirectory()) walk(sp, dp);
      else if (e.isFile() && copyIfChanged(sp, dp)) n++;
    }
  };
  walk(srcDir, dstDir);
  return n;
}
