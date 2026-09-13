#!/usr/bin/env node
// scripts/devserver.mjs — local dev server that behaves like GitHub Pages.
//
// `python -m http.server` cannot serve the viewer for deep-link URLs
// (/10301_l, /4060p, /avg1_103): a fresh load of such a path just 404s.
// GitHub Pages solves this by serving the repo's 404.html for unknown
// paths, which redirects to index.html?l=<id>.  This server does the same
// (serves 404.html for unknown paths, or index.html directly with
// --spa), so path-style links and refreshes work locally exactly like
// they will on GitHub Pages.
//
// Usage:
//   node scripts/devserver.mjs [port]        # GitHub Pages behaviour (404.html fallback)
//   node scripts/devserver.mjs [port] --spa  # serve index.html for any unknown path
//
// Then open http://localhost:8000/ and deep links like /10301_l work.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SPA = process.argv.includes('--spa');
const PORT = Number(process.argv.find((a, i) => i > 1 && /^\d+$/.test(a))) || 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.moc3': 'application/octet-stream', '.csv': 'text/csv',
};

http.createServer(async (req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  let file = normalize(join(ROOT, p));
  if (p.endsWith('/')) file = join(file, 'index.html');
  let data;
  try {
    data = await readFile(file);
  } catch {
    if (SPA) {
      try { data = await readFile(join(ROOT, 'index.html')); } catch { data = null; }
      if (data) {
        res.writeHead(200, { 'content-type': MIME['.html'] });
        return res.end(data);
      }
    }
    try { data = await readFile(join(ROOT, '404.html')); } catch { data = '<h1>404</h1>'; }
    res.writeHead(404, { 'content-type': MIME['.html'] });
    return res.end(data);
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(data);
}).listen(PORT, () => {
  console.log(`L2D viewer dev server (GitHub Pages behaviour) on http://localhost:${PORT}/`);
});
