// Static mode (GitHub Pages, ?static=1): no server, the browser calls openrouter.ai directly with the player's key.
// Covers mode detection, the direct transport (URLs, headers, whitelisted fields), key checks, the static site fetcher,
// the in-browser niche research queue, and that the deployable public/ tree has no root-absolute paths. All offline.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as llm from '../public/core/llm.js';
import * as T from '../public/core/transport.js';
import { fetchSite } from '../public/core/site.js';
import { assertPublicUrlStatic } from '../public/core/netguard.js';
import { createResearchClient } from '../public/core/niche-client.js';

const RAW = { description: 'Independent dental practices with 2-10 chairs.', archetypes: [{ name: 'Solo practice', sizeBand: '2-10', employees: { lo: 3, hi: 12 } }], roles: [{ title: 'Office manager', cares: ['no-shows'] }], tools: [{ name: 'Dentrix', category: 'PMS' }], citations: [] };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const reply = (content, extra = {}) => json(200, { choices: [{ message: { content, ...extra }, finish_reason: 'stop' }], usage: { cost: 0.001 } });
function stub(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null }); return handler(String(url), init); };
  return calls;
}
const live = (apiKey = 'sk-or-test') => llm.setSettings({ apiKey, models: ['m/chat'], decisionModel: 'jev/test', enabled: true });
afterEach(() => { globalThis.fetch = realFetch; T.setMode('server'); llm.setSettings({ apiKey: '', enabled: true }); });

test('detectMode: ?static=1 forces static; a JSON /api/status means server; a 404 page or a network error means static', async () => {
  assert.equal((await T.detectMode({ search: '?static=1', fetchImpl: async () => { throw new Error('must not be called'); } })).mode, 'static');
  const seen = [];
  const r = await T.detectMode({ search: '', fetchImpl: async (u) => { seen.push(u); return json(200, { serverKey: true }); } });
  assert.deepEqual(r, { mode: 'server', serverKey: true });
  assert.equal(seen[0], './api/status', 'relative, so the game works under a sub-path');
  assert.equal((await T.detectMode({ search: '', fetchImpl: async () => ({ ok: false, status: 404, json: async () => { throw new Error('html'); } }) })).mode, 'static');
  assert.equal((await T.detectMode({ search: '', fetchImpl: async () => { throw new Error('offline'); } })).mode, 'static');
  // llm.checkServerKey goes through the same detection; static never claims a server key
  assert.equal(await llm.checkServerKey({ search: '?static=1' }), false);
  assert.equal(llm.isStatic(), true);
});

test('static transport: chat and decisions go straight to openrouter.ai with Bearer auth and only whitelisted fields', async () => {
  T.setMode('static'); live();
  const calls = stub((url) => (url === T.DECISIONS_URL ? json(500, { error: 'x' }) : reply('{"n": 3}')));
  const r = await llm.ask({ task: 't', prompt: 'p', schema: { type: 'object' }, fallback: () => ({ n: -1 }) });
  assert.equal(r.mock, false); assert.equal(r.data.n, 3);
  const c = calls[0];
  assert.equal(c.url, T.OPENROUTER_URL);
  assert.equal(c.init.headers.Authorization, 'Bearer sk-or-test');
  assert.equal(c.init.headers['X-Title'], T.APP_TITLE);
  assert.ok(!('X-OpenRouter-Key' in c.init.headers), 'the proxy header is never sent to openrouter.ai');
  assert.deepEqual(c.body.usage, { include: true });
  assert.ok(Object.keys(c.body).every((k) => [...T.LLM_FIELDS, 'usage'].includes(k)), Object.keys(c.body).join(','));
  await llm.decide({ task: 'd', state: { a: 1 }, questions: [{ id: 'q', type: 'noul', text: 'ok?' }], fallback: () => ({ q: 0.5 }) });
  const d = calls.find((x) => x.url === T.DECISIONS_URL);
  assert.ok(d, 'decisions endpoint called directly');
  assert.deepEqual(Object.keys(d.body).sort(), ['model', 'questions', 'state']);
  assert.ok(calls.every((x) => x.url.startsWith('https://openrouter.ai/')), 'nothing goes anywhere but openrouter.ai');
});

test('static mode without a key stays offline (no network at all); server mode still uses the relative proxy', async () => {
  T.setMode('static'); live('');
  let calls = stub(() => reply('{"n": 1}'));
  const r = await llm.ask({ task: 't', prompt: 'p-off', schema: { type: 'object' }, fallback: () => ({ n: -1 }) });
  assert.equal(r.mock, true); assert.equal(calls.length, 0);
  T.setMode('server'); live();
  calls = stub(() => reply('{"n": 2}'));
  await llm.ask({ task: 't', prompt: 'p-srv', schema: { type: 'object' }, fallback: () => ({ n: -1 }) });
  assert.equal(calls[0].url, './api/llm');
  assert.equal(calls[0].init.headers['X-OpenRouter-Key'], 'sk-or-test');
});

test('testKey: static checks the free key endpoint (valid / invalid / unreachable); empty key is "none"', async () => {
  T.setMode('static');
  assert.equal((await T.testKey('')).status, 'none');
  let calls = stub(() => json(200, { data: { limit: 5, limit_remaining: 4.5 } }));
  const ok = await T.testKey('sk-or-good');
  assert.equal(ok.status, 'valid'); assert.match(ok.detail, /\$4\.50/);
  assert.equal(calls[0].url, T.OPENROUTER_KEY_URL); assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-or-good');
  stub(() => json(401, { error: { message: 'No auth credentials found' } }));
  assert.equal((await T.testKey('sk-or-bad')).status, 'invalid');
  stub(() => { throw new Error('ENOTFOUND'); });
  assert.equal((await T.testKey('sk-or-x')).status, 'error');
});

test('static URL guard: public hosts pass; localhost, internal names and private IPs are refused', () => {
  for (const ok of ['acme.com', 'https://www.example.org/pricing', 'http://8.8.8.8/']) assert.ok(assertPublicUrlStatic(ok));
  for (const bad of ['localhost', 'http://127.0.0.1', 'http://[::1]/', 'http://192.168.1.4', 'intranet', 'printer.local', 'app.internal', 'ftp://acme.com', 'http://169.254.169.254/latest']) {
    assert.throws(() => assertPublicUrlStatic(bad), /public|http|valid/, bad);
  }
});

test('fetchSite: static mode refuses private hosts, says offline without a key, and reads a page via the web plugin with one', async () => {
  T.setMode('static'); live('');
  const calls = stub(() => reply(JSON.stringify({ found: true, title: 'Acme', description: 'Payroll for bakeries', headings: ['Pricing'], emails: ['hi@acme.com', 'nope'], text: 'Acme runs payroll.' })));
  assert.equal((await fetchSite('http://10.0.0.1')).status, 400);
  const off = await fetchSite('acme.com');
  assert.equal(off.status, 503); assert.equal((await off.json()).offline, true);
  assert.equal(calls.length, 0, 'nothing is fetched without a key');
  live();
  const cache = {};
  const r = await fetchSite('acme.com', { cache });
  const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.title, 'Acme'); assert.deepEqual(j.emails, ['hi@acme.com']); assert.equal(j.url, 'https://acme.com/');
  assert.deepEqual(calls[0].body.plugins.find((p) => p.id === 'web')?.id, 'web');
  await fetchSite('acme.com', { cache });
  assert.equal(calls.length, 1, 'the second read is served from state.cache');
  stub(() => reply(JSON.stringify({ found: false, title: '', description: '', headings: [], emails: [], text: '' })));
  assert.equal((await fetchSite('nothing-here.example')).status, 502);
});

test('browser niche research: queued, run with the web plugin, disguised into the cache; budgets and no-key respected', async () => {
  const store = new Map();
  const cache = { get: async (k) => (store.has(k) ? { dossier: store.get(k) } : null), put: async (k, v) => { store.set(k, v); return true; } };
  const reqs = []; let release; const gate = new Promise((r) => { release = r; });
  const fetchImpl = async (body, key) => { reqs.push({ body, key }); await gate; return reply(JSON.stringify(RAW), { annotations: [{ type: 'url_citation', url_citation: { url: 'https://x.org', title: 'X' } }] }); };
  let t = 0;
  const client = createResearchClient({ cache, fetchImpl, key: () => 'sk-or-test', config: { maxConcurrent: 2, maxPerHour: 3, maxTokens: 6000, webResults: 8, now: () => t } });
  const keys = ['aaaaaaaa00000001', 'aaaaaaaa00000002', 'aaaaaaaa00000003', 'aaaaaaaa00000004'];
  const first = await client.request({ key: keys[0], nodePath: ['Dental practices'], depth: 1 });
  assert.equal(first.status, 'running');
  assert.equal((await client.request({ key: keys[0], nodePath: ['Dental practices'], depth: 1 })).status, 'running', 'idempotent');
  for (const k of keys.slice(1)) await client.request({ key: k, nodePath: ['Dental practices', k], depth: 2 });
  assert.equal(reqs.length, 2, 'two at a time');
  assert.deepEqual(reqs[0].body.plugins, [{ id: 'web', max_results: 8 }]);
  assert.equal(reqs[0].key, 'sk-or-test');
  release(); await new Promise((r) => setTimeout(r, 20));
  assert.equal(reqs.length, 3, 'the hourly cap (3) holds the fourth');
  const done = await client.status(keys[0]);
  assert.equal(done.status, 'done'); assert.equal(done.dossier.source, 'research'); assert.equal(done.dossier.key, keys[0]);
  assert.ok(done.dossier.citations.some((c) => c.url === 'https://x.org'));
  assert.equal((await client.status(keys[3])).status, 'queued');
  assert.equal((await client.status('ffffffff00000000')).status, 'unknown', 'a reload loses in-flight items; the game re-queues them');
  const nokey = createResearchClient({ cache, fetchImpl, key: () => '' });
  assert.equal((await nokey.request({ key: 'bbbbbbbb00000001', nodePath: ['x'], depth: 1 })).error, 'no-key');
  const bad = createResearchClient({ cache, fetchImpl: async () => json(402, { error: { message: 'Insufficient credits' } }), key: () => 'k' });
  await bad.request({ key: 'cccccccc00000001', nodePath: ['x'], depth: 1 }); await bad.idle();
  const f = await bad.status('cccccccc00000001');
  assert.equal(f.status, 'failed'); assert.match(f.error, /credits/);
});

async function walk(dir, out = []) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) await walk(p, out); else if (/\.(js|html|css)$/.test(name)) out.push(p);
  }
  return out;
}

test('deployable tree: no root-absolute URLs in public/, .nojekyll present, Pages workflow deploys public/', async () => {
  const offenders = [];
  // Root-absolute references break under https://user.github.io/<repo>/: hrefs/srcs, fetches and CSS url()s.
  const re = /(?:\b(?:href|src)=["']|fetch\(\s*["'`]|url\(\s*["']?|import\(\s*["'`])\/(?!\/)/g;
  for (const f of await walk(join(ROOT, 'public'))) {
    const text = await readFile(f, 'utf8');
    if (re.test(text)) offenders.push(f.slice(ROOT.length + 1));
    re.lastIndex = 0;
  }
  assert.deepEqual(offenders, []);
  await stat(join(ROOT, 'public', '.nojekyll'));
  const wf = await readFile(join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8');
  for (const s of ['actions/configure-pages', 'enablement: true', 'actions/upload-pages-artifact', 'path: public', 'actions/deploy-pages', 'branches: [main]']) assert.ok(wf.includes(s), s);
});
