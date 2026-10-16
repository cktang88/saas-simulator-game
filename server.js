// Local server: static files + two small APIs.
//   POST /api/llm   → proxies chat completions to OpenRouter (key from env or the X-OpenRouter-Key header)
//   POST /api/decide → proxies Jev typed decisions (choice / yes-no / score with probabilities) to OpenRouter
//   GET/PUT /api/cache/:key       → JSON disk cache (hex keys, 256 KB cap) under data/cache/niches/
//   POST /api/research, GET /api/research/:key → niche research queue + background web-grounded worker
//   POST /api/site  → fetches a public web page and returns its readable text (for prospect research
//                     and judging your landing page)
// Run locally only: if you deploy this publicly with OPENROUTER_API_KEY set, anyone can spend your credits.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { NicheServer, defaults as nicheDefaults, MAX_ENTRY_BYTES, isHexKey } from './niche-server.js';

const here = fileURLToPath(new URL('.', import.meta.url));
// Load .env next to this file if present (Node 20.12+). Variables already set in the shell win.
try { process.loadEnvFile(join(here, '.env')); } catch {}

const root = join(here, 'public');
const port = Number(process.env.PORT) || 3000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'; // Jev typed decisions (choice / noul / score)
const MAX_BODY = 20 * 1024 * 1024; // PDFs are sent base64-encoded
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8',
};

// Niche cache + research worker (niche-server.js). Tests can point cacheDir at a temp dir and inject a mock fetch.
const nicheConfig = nicheDefaults();
Object.defineProperty(nicheConfig, 'cacheDir', { get() { return nicheConfig._dir ?? process.env.NICHE_CACHE_DIR ?? join(here, 'data', 'cache', 'niches'); }, set(v) { nicheConfig._dir = v; }, enumerable: true });
const niche = new NicheServer(nicheConfig);

async function readBody(req, max) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleNiche(req, res, path) {
  const m = path.match(/^\/api\/(cache|research)(?:\/([^/]*))?$/);
  if (!m) return false;
  const [, kind, key] = m;
  if (kind === 'cache') {
    if (!isHexKey(key)) return send(res, 400, { error: 'Cache key must be 8-64 lowercase hex characters' }), true;
    if (req.method === 'GET') { const v = await niche.cacheGet(key); return v ? send(res, 200, v) : send(res, 404, { error: 'Not cached' }), true; }
    if (req.method === 'PUT') {
      let v;
      try { v = JSON.parse(await readBody(req, MAX_ENTRY_BYTES + 1024) || 'null'); } catch (e) { if (e.status) throw e; return send(res, 400, { error: 'Body must be JSON' }), true; }
      await niche.cachePut(key, v);
      return send(res, 200, { ok: true }), true;
    }
    return send(res, 405, { error: 'GET or PUT' }), true;
  }
  niche.start();
  if (req.method === 'POST' && !key) {
    const body = JSON.parse(await readBody(req, 16 * 1024) || '{}');
    return send(res, 200, await niche.request(body, process.env.OPENROUTER_API_KEY ? null : req.headers['x-openrouter-key'] || null)), true;
  }
  if (req.method === 'GET' && key) {
    const k = req.headers['x-openrouter-key'];
    if (k && !process.env.OPENROUTER_API_KEY && niche.queue.items[key]) niche.keys.set(key, k); // a resumed item gets its key back from the polling client (memory only)
    return send(res, 200, await niche.status(key)), true;
  }
  return send(res, 405, { error: 'POST /api/research or GET /api/research/:key' }), true;
}

const send = (res, status, obj) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// ---------------------------------------------------------------------------
// LLM proxy
// ---------------------------------------------------------------------------

async function handleLlm(req, res, { url = OPENROUTER_URL, allowed = ['model', 'messages', 'response_format', 'max_tokens', 'temperature', 'plugins', 'reasoning', 'seed'], usage = true } = {}) {
  const key = process.env.OPENROUTER_API_KEY || req.headers['x-openrouter-key'];
  if (!key) return send(res, 401, { error: 'No OpenRouter API key. Set OPENROUTER_API_KEY or add a key in Settings.' });
  const body = await readJson(req);
  const payload = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (usage) payload.usage = { include: true };
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost',
      'X-Title': 'SaaS Founder Simulator',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await r.text();
  res.writeHead(r.status, { 'Content-Type': 'application/json' }).end(text);
}

// ---------------------------------------------------------------------------
// Website fetcher (with SSRF protection: public http(s) hosts only)
// ---------------------------------------------------------------------------

function isPrivateIp(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) and deprecated IPv4-compatible (::a.b.c.d) addresses. The URL parser rewrites
    // [::ffff:127.0.0.1] to the hex form ::ffff:7f00:1, so convert that back to dotted IPv4 before checking.
    const m = v.match(/^::(?:ffff:)?(?:([0-9a-f]{1,4}):([0-9a-f]{1,4})|(\d+\.\d+\.\d+\.\d+))$/);
    if (m) {
      if (m[3]) return isPrivateIp(m[3]);
      const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // ULA fc00::/7, link-local fe80::/10 (fe80-febf, not just "fe80"), deprecated site-local fec0::/10, multicast ff00::/8.
    return v === '::1' || v === '::' || /^f[cd][0-9a-f]{2}:/.test(v) || /^fe[89a-f][0-9a-f]:/.test(v) || /^ff[0-9a-f]{2}:/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicUrl(raw) {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('Only http(s) URLs'), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((x) => x.address);
  if (!ips.length || ips.some(isPrivateIp)) throw Object.assign(new Error('Host is not a public address'), { status: 400 });
  return u;
}

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

export function extractPage(html) {
  const pick = (re) => decode((html.match(re)?.[1] ?? '').trim());
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, '').trim())).filter(Boolean).slice(0, 25);
  const emails = [...new Set([...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decode(m[1])))].slice(0, 10);
  const text = decode(html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|section|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 20000);
  return { title, description, headings, emails, text };
}

async function handleSite(req, res) {
  const { url } = await readJson(req);
  let target = await assertPublicUrl(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  let r;
  for (let hop = 0; hop < 4; hop++) {
    r = await fetch(target, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SaaSFounderSim/1.0; +local research tool)', Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(12_000),
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      target = await assertPublicUrl(new URL(r.headers.get('location'), target).href);
      continue;
    }
    break;
  }
  if (!r.ok) return send(res, 502, { error: `Site returned HTTP ${r.status}` });
  const reader = r.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < 2_000_000) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  send(res, 200, { url: target.href, ...extractPage(html) });
}

// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'POST' && path === '/api/llm') return await handleLlm(req, res);
    if (req.method === 'POST' && path === '/api/decide') return await handleLlm(req, res, { url: DECISIONS_URL, allowed: ['model', 'state', 'questions'], usage: false });
    if (req.method === 'POST' && path === '/api/site') return await handleSite(req, res);
    if (path.startsWith('/api/cache') || path.startsWith('/api/research')) { if (await handleNiche(req, res, path)) return; }
    if (path === '/api/status') return send(res, 200, { serverKey: Boolean(process.env.OPENROUTER_API_KEY) });

    const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (file.endsWith('/')) file = join(file, 'index.html');
    const body = await readFile(file).catch(() => null) ?? await readFile(join(file, 'index.html')).catch(() => null);
    if (!body) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, () => { console.log(`SaaS Founder Simulator running at http://localhost:${port}`); niche.load().then(() => { if (Object.values(niche.queue.items).some((i) => i.status === 'queued')) niche.start(); }); });
}
export { server, isPrivateIp, niche, nicheConfig };
