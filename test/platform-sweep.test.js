// Platform regressions (server, proxy guard, research worker, transport, site reader, storage). All offline and fast.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProxyGuard, guardConfig } from '../proxy-guard.js';
import { NicheServer, defaults } from '../niche-server.js';
import { nicheHash } from '../public/core/niche-disguise.js';
import * as T from '../public/core/transport.js';
import * as llm from '../public/core/llm.js';
import { fetchSite } from '../public/core/site.js';
import { createResearchClient } from '../public/core/niche-client.js';

const realFetch = globalThis.fetch;
let dir, mod, base;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'platform-'));
  process.env.NICHE_CACHE_DIR = dir;
  mod = await import('../server.js'); // local mode (no PUBLIC_PROXY)
  await new Promise((r) => mod.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${mod.server.address().port}`;
});
after(async () => { mod.server.close(); delete process.env.NICHE_CACHE_DIR; globalThis.fetch = realFetch; await rm(dir, { recursive: true, force: true }); });

const fakeRes = () => ({ setHeader() {} });
const req = (origin, host = 'localhost:3000') => ({ headers: { ...(origin ? { origin } : {}), host } });

test('CORS: a local server refuses other sites (CSRF on the env key) but serves its own page; public proxies too', () => {
  const local = new ProxyGuard(guardConfig({}));
  assert.equal(local.cors(req(null), fakeRes()), true, 'curl / no Origin');
  assert.equal(local.cors(req('http://localhost:3000'), fakeRes()), true, 'same origin');
  assert.equal(local.cors(req('https://evil.example'), fakeRes()), false, 'another site cannot spend the local key');
  assert.equal(local.cors(req('null'), fakeRes()), false);
  const pub = new ProxyGuard(guardConfig({ PUBLIC_PROXY: '1', ALLOWED_ORIGINS: 'https://player.github.io' }));
  assert.equal(pub.cors(req('https://sim.fly.dev', 'sim.fly.dev'), fakeRes()), true, 'the page the proxy serves itself');
  assert.equal(pub.cors(req('https://player.github.io', 'sim.fly.dev'), fakeRes()), true);
  assert.equal(pub.cors(req('https://evil.example', 'sim.fly.dev'), fakeRes()), false);
});

test('local server: a cross-site text/plain POST to /api/llm is refused before any upstream call', async () => {
  const r = await realFetch(`${base}/api/llm`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' }, body: '{"model":"x","messages":[]}' });
  assert.equal(r.status, 403);
});

test('/api/site: a malformed URL is a 400, a page with a junk numeric entity is still read', async () => {
  const r = await realFetch(`${base}/api/site`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'http://[bad' }) });
  assert.equal(r.status, 400);
  const p = mod.extractPage('<title>A &#99999999; B &#x41;&#66;</title><p>x</p>');
  assert.equal(p.title, 'A   B AB');
});

const RAW = { description: 'Dental practices.', archetypes: [], citations: { not: 'an array' } };
const orReply = (content, annotations = []) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(content), annotations } }], usage: { cost: 0.02 } }) });

test('research worker: budgets are checked when an item starts, spend is charged to the asking IP, own-key items never fall back to the operator key on a public proxy', async () => {
  let clock = 1_000_000;
  const mk = () => { const c = defaults(); c.cacheDir = dir; c.now = () => clock; c.research.tickMs = 3_600_000; c.fetch = async () => orReply(RAW); return c; };
  process.env.OPENROUTER_API_KEY = 'sk-operator';
  try {
    // budget exhausted after queueing: the item waits instead of spending
    const charged = [];
    let room = true;
    const cfg = mk(); cfg.canSpend = () => room; cfg.onSpend = (usd, ip) => charged.push([usd, ip]);
    const q = new NicheServer(cfg);
    const k = nicheHash('budget-1');
    await q.request({ key: k, depth: 1 }, null, { payer: '203.0.113.9' });
    room = false;
    assert.deepEqual(await q.tick(), [], 'over budget: not started');
    room = true;
    assert.deepEqual(await q.tick(), [k]); await q.idle();
    assert.equal(q.queue.items[k].status, 'done', 'a citations object from the model does not fail the item');
    assert.deepEqual(charged, [[0.02, '203.0.113.9']]);
    // own key on a public proxy, then a restart: no fallback to the operator's key
    const cfg2 = mk(); cfg2.cacheDir = await mkdtemp(join(tmpdir(), 'platform-')); cfg2.strictByok = true;
    const q2 = new NicheServer(cfg2); const k2 = nicheHash('byok-1');
    await q2.request({ key: k2, depth: 1, model: 'expensive/model' }, 'sk-player-bad');
    const q3 = new NicheServer(cfg2); await q3.load();
    assert.equal(q3.keyFor(k2), null);
    assert.deepEqual(await q3.tick(), [], 'waits for the player key');
    q3.keys.set(k2, 'sk-player'); assert.equal(q3.keyFor(k2), 'sk-player');
    await rm(cfg2.cacheDir, { recursive: true, force: true });
  } finally { delete process.env.OPENROUTER_API_KEY; }
});

test('transport: the hosted proxy serving this page is not "your own server" (the key is never sent to it); a hanging probe times out', async () => {
  llm.setSettings({ apiKey: '', connection: 'auto', enabled: true, proxyUrl: '', serverUrl: '' });
  const status = { ok: true, status: 200, json: async () => ({ serverKey: true, public: true }) };
  let info = await T.resolveConnection({ choice: 'auto', defaultProxy: 'https://other.example', search: '', fetchImpl: async () => status });
  assert.equal(info.connection, 'proxy'); assert.equal(info.base, '', 'same origin');
  info = await T.resolveConnection({ choice: 'selfhost', search: '', fetchImpl: async () => status });
  assert.equal(info.reachable, true);
  assert.equal(T.serverHeaders('sk-mine')['X-OpenRouter-Key'], undefined, 'a public server never gets the key');
  const hang = (u, init) => new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
  const t0 = performance.now();
  info = await T.resolveConnection({ choice: 'proxy', defaultProxy: 'https://p.example', search: '', fetchImpl: hang, timeoutMs: 50 });
  assert.equal(info.reachable, false);
  assert.ok(performance.now() - t0 < 2000);
  T.setMode('server');
});

test('fetchSite offline: never posts to ./api/site (no server behind an offline page); answers offline JSON', async () => {
  const calls = [];
  globalThis.fetch = async (u) => { calls.push(String(u)); throw new Error('no network'); };
  try {
    T.setMode('offline');
    const r = await fetchSite('example.com');
    const j = await r.json();
    assert.equal(j.offline, true);
    assert.ok(!calls.some((u) => u.includes('api/site')));
  } finally { globalThis.fetch = realFetch; T.setMode('server'); }
});

test('browser research: a model reply that is an array or has a non-array citations field fails cleanly or succeeds', async () => {
  const store = new Map();
  const cache = { get: async (k) => (store.has(k) ? { dossier: store.get(k) } : null), put: async (k, v) => { store.set(k, v); return true; } };
  let content = RAW;
  const c = createResearchClient({ cache, key: () => 'sk', fetchImpl: async () => orReply(content) });
  const k1 = nicheHash('client-1');
  await c.request({ key: k1, nodePath: ['Dental'], depth: 1 }); await c.idle();
  assert.equal((await c.status(k1)).status, 'done');
  content = [1, 2];
  const k2 = nicheHash('client-2');
  await c.request({ key: k2, nodePath: ['Dental'], depth: 1 }); await c.idle();
  const s = await c.status(k2);
  assert.equal(s.status, 'failed'); assert.match(s.error, /JSON object/);
});

test('store: an aborted IndexedDB transaction rejects instead of hanging; a versionchange closes the connection', async () => {
  const conns = [];
  globalThis.indexedDB = {
    open() {
      const r = {};
      setTimeout(() => {
        const d = { objectStoreNames: { contains: () => true }, closed: false, close() { this.closed = true; },
          transaction() { const t = { objectStore: () => ({ put: () => ({}) }) }; setTimeout(() => { t.error = { name: 'QuotaExceededError' }; t.onabort?.(); }, 0); return t; } };
        conns.push(d); r.result = d; r.onsuccess();
      }, 0);
      return r;
    },
  };
  try {
    const { putKv } = await import('../public/core/store.js');
    await assert.rejects(putKv('a', 1), (e) => e.name === 'QuotaExceededError');
    conns[0].onversionchange();
    assert.equal(conns[0].closed, true);
    await assert.rejects(putKv('b', 1));
    assert.equal(conns.length, 2, 'reopened after the versionchange');
  } finally { delete globalThis.indexedDB; }
});
