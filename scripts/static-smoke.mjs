// Smoke test for the GitHub Pages build: serve public/ as plain static files under a sub-path (like
// https://user.github.io/<repo>/), with no /api, then crawl index.html and every ES-module import from main.js and
// check each resolves (200). Also checks ./api/status is a 404 there, which is what flips the game into static mode.
// Usage: node scripts/static-smoke.mjs   (exit code 1 on any failure)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PREFIX = '/saas-simulator-game/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(PREFIX)) { res.writeHead(404); return res.end('not found'); }
  let rel = normalize(path.slice(PREFIX.length)); if (rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
  if (rel.startsWith('..')) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(join(PUBLIC, rel)); res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>404</h1>'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}${PREFIX}`;
const failures = [];
const get = async (url) => { const r = await fetch(url); if (!r.ok) failures.push(`${r.status} ${url.slice(base.length - PREFIX.length)}`); return r.ok ? r.text() : ''; };

const index = await get(base);
for (const m of index.matchAll(/(?:href|src)="([^"#]+)"/g)) if (!/^https?:/.test(m[1])) await get(new URL(m[1], base).href);
const seen = new Set();
async function crawl(url) {
  if (seen.has(url)) return; seen.add(url);
  const src = await get(url);
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) await crawl(new URL(m[1] ?? m[2] ?? m[3], url).href);
}
await crawl(new URL('main.js', base).href);
const status = await fetch(new URL('./api/status', base));
if (status.status !== 404) failures.push(`expected ./api/status to 404 on a static host, got ${status.status}`);
server.close();
console.log(`static smoke: ${seen.size} modules crawled under ${PREFIX}, ${failures.length} failures`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
