// Fractal niche engine: tree, stats, dossiers, disguise, caches, server research worker and the client research job.
// Short and offline: the OpenRouter call is mocked, no live requests.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import { truthOf, icpFocus, drawPerson } from '../public/core/truth.js';
import * as N from '../public/core/niche.js';
import { disguise, looksLikePII, FUDGE_MIN, FUDGE_MAX, nicheHash } from '../public/core/niche-disguise.js';
import { normalizeDossier } from '../public/core/niche-research.js';
import { createNicheCache, LRU } from '../public/core/niche-cache.js';
import { drainJobs } from '../public/core/jobs.js';
import * as llm from '../public/core/llm.js';
import { server, niche as appNiche, nicheConfig as serverConfig } from '../server.js';
import { NicheServer, defaults } from '../niche-server.js';

function mk(seed = 5, model = 'smb', oneLiner = 'Practice software for dentists') {
  const s = newState({ companyName: 'X', model, path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = oneLiner; s.company.icp = '';
  return s;
}
const TEXT = 'multi-location dental practices in Texas using Dentrix';
const clone = (x) => JSON.parse(JSON.stringify(x));

// ------------------------------------------------------------------ tree

test('nicheFor is deterministic, nests qualifiers in a fixed order and ignores word order', () => {
  const a = mk(), b = mk();
  const na = N.nicheFor(a, TEXT, { source: 'icp' }), nb = N.nicheFor(b, TEXT, { source: 'icp' });
  assert.equal(na.id, nb.id);
  const chain = N.pathOf(a, na.id);
  assert.deepEqual(chain.map((n) => n.dim), [null, 'sub', 'size', 'geo', 'tool']);
  assert.deepEqual(chain.map((n) => n.level), [1, 2, 3, 4, 5]);
  assert.equal(na.id.split(':sub-')[0], chain[0].id, 'ids are recursive base:sub:child');
  const c = mk();
  assert.equal(N.nicheFor(c, 'Dentrix using Texas practices dental multi-location').id, na.id);
  assert.ok(chain.some((n) => n.id === N.nicheFor(a, 'multi-location dental practices').id), 'a broader text lands on an ancestor');
  assert.notEqual(N.nicheFor(a, 'dental practices in Texas').id, na.id, 'a different qualifier set is a different node');
  assert.equal(N.nicheFor(mk(), 'quantum yoga llamas'), null, 'no segment, no node');
  assert.deepEqual(N.nicheFor(a, TEXT).id, na.id, 'repeat calls reuse nodes');
  assert.ok(N.getNode(a, na.id).hits >= 2);
  const parent = N.nicheFor(a, 'dental practices', { source: 'ads' });
  assert.equal(N.nicheFor(a, 'in Ohio', { parentId: parent.id }).dim, 'geo', 'parentId continues below an existing node');
});

test('existing truth is untouched by niches (ids, sig, segments, seed stream) and focus is identical with no nodes', () => {
  const base = mk(), s = mk();
  const t0 = clone(truthOf(base));
  const seed0 = s.seed;
  N.nicheFor(s, TEXT); N.nicheFor(s, 'dental practices in Ohio');
  assert.equal(s.seed, seed0, 'nicheFor never touches rng(state)');
  assert.deepEqual(clone(truthOf(s)), t0);
  assert.equal(truthOf(s).sig, truthOf(base).sig);
  // an ICP resolves identically until a deeper node exists for it
  base.company.icp = s.company.icp = 'dental practices';
  const f0 = clone(icpFocus(base));
  const s2 = mk(); s2.company.icp = 'dental practices';
  assert.deepEqual(clone(icpFocus(s2)), f0);
});

test('children inherit with bounded jitter and weighted-average back to the parent', () => {
  const s = mk();
  const root = N.nicheFor(s, 'dental practices');
  const parent = N.statsFor(s, root.id).stats;
  for (const dim of ['geo', 'size', 'tool', 'role', 'sub']) {
    const sp = N.splitStats(s, root.id, dim);
    const sum = sp.cells.reduce((a, c) => a + c.share, 0);
    assert.ok(Math.abs(sum - 1) < 0.001, `${dim} shares sum to 1`);
    assert.ok(Math.abs(sp.average.painPrevalence - parent.painPrevalence) < 0.003, `${dim} pain averages back`);
    assert.ok(Math.abs(sp.average.intensity - parent.intensity) < 0.003, `${dim} intensity averages back`);
    assert.ok(Math.abs(sp.average.retentionMult - parent.retentionMult) < 0.003, `${dim} retention averages back`);
    assert.ok(Math.abs(sp.average.wtp / parent.wtpMonthly.median - 1) < 0.005, `${dim} wtp averages back`);
    for (const c of sp.cells) {
      const ratio = c.stats.painPrevalence / parent.painPrevalence;
      assert.ok(ratio >= 0.74 && ratio <= 1.26, `${dim} pain jitter bounded (${ratio})`);
      if (dim !== 'size') assert.ok(c.stats.wtpMonthly.median / parent.wtpMonthly.median <= 1.3 && c.stats.wtpMonthly.median / parent.wtpMonthly.median >= 0.7);
    }
  }
  // a created child is exactly one cell of that split
  const child = N.nicheFor(s, 'dental practices in Texas');
  const geo = N.splitStats(s, root.id, 'geo').cells.find((c) => c.id === 'texas');
  assert.equal(N.statsFor(s, child.id).stats.painPrevalence, geo.stats.painPrevalence);
  // some splits contain a materially better and worse pocket across seeds
  let spread = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) { const x = mk(seed); const r = N.nicheFor(x, 'dental practices'); const cs = N.splitStats(x, r.id, 'geo').cells.map((c) => c.stats.painPrevalence); spread = Math.max(spread, Math.max(...cs) / Math.min(...cs)); }
  assert.ok(spread > 1.3, 'a well-chosen niche can be a real pocket');
});

test('operator tiers separate: narrowing into the best pocket beats the broad ICP beats the worst pocket', () => {
  const s = mk();
  const root = N.nicheFor(s, 'dental practices');
  const cells = N.splitStats(s, root.id, 'geo').cells.filter((c) => c.share > 0.02);
  const strength = (c) => c.stats.painPrevalence * c.stats.intensity;
  const best = cells.reduce((a, c) => (strength(c) > strength(a) ? c : a)), worst = cells.reduce((a, c) => (strength(c) < strength(a) ? c : a));
  const focus = (icp) => { s.company.icp = icp; N.nicheFor(s, icp); return icpFocus(s); };
  const broad = focus('dental practices');
  const up = focus(`dental practices in ${best.id}`), down = focus(`dental practices in ${worst.id}`);
  assert.ok(up.strength > broad.strength && broad.strength > down.strength, `${up.strength} > ${broad.strength} > ${down.strength}`);
  // mistake cost: a narrow pick also shrinks the reachable share of the market
  assert.ok(down.breadth < broad.breadth && up.breadth < broad.breadth);
});

test('drawPerson with a nicheId uses the niche stats; without it nothing changes', () => {
  const s = mk(); const t = truthOf(s);
  const root = N.nicheFor(s, 'dental practices');
  const plain = drawPerson(s, { segmentId: root.id, channel: 'cold', seedKey: 'k1' });
  assert.equal(plain.nicheId, undefined);
  assert.deepEqual(plain, drawPerson(mk(), { segmentId: root.id, channel: 'cold', seedKey: 'k1' }));
  const deep = N.nicheFor(s, TEXT);
  const p = drawPerson(s, { nicheId: deep.id, channel: 'cold', seedKey: 'k1' });
  assert.equal(p.nicheId, deep.id);
  assert.equal(p.segmentId, deep.rootId);
  assert.ok(t.segments.some((g) => g.id === p.segmentId));
  let withPain = 0, tries = 0, inc = null;
  for (let i = 0; i < 400 && !inc; i++) { const x = drawPerson(s, { nicheId: root.id, channel: 'cold', seedKey: `p${i}`, screened: true }); tries++; if (x.hasPain) { withPain++; inc = x.lastIncident; } }
  assert.ok(withPain > 0 && /:/.test(inc) === true, 'niche people speak dossier incidents');
});

// ------------------------------------------------------------------ dossiers

test('an offline dossier exists instantly for any node and is deterministic', () => {
  const s = mk();
  const deep = N.nicheFor(s, TEXT);
  const d = N.dossierOf(s, deep.id);
  for (const k of ['description', 'archetypes', 'roles', 'workflows', 'tools', 'vocabulary', 'painTriggers', 'incidents', 'spend', 'buying', 'communities', 'objections', 'seasonality', 'agencies', 'citations', 'fudge']) assert.ok(k in d, k);
  assert.ok(d.archetypes.length === 3 && d.roles.length && d.tools.some((t) => t.name === 'Dentrix') && d.agencies.length === 5);
  assert.ok(d.archetypes.every((a) => a.employees.lo <= a.employees.hi));
  assert.equal(d.source, 'offline');
  assert.deepEqual(N.dossierOf(s, deep.id), d);
  assert.ok(JSON.stringify(d).length < 30_000);
  // every segment of every model has one, including a plain segment id and consumer personas
  for (const seg of truthOf(s).segments) assert.ok(N.dossierOf(s, seg.id).description);
  const c = mk(3, 'b2c', 'Meal planning app for busy families');
  const cn = N.nicheFor(c, 'busy parents in Ohio');
  assert.ok(cn && N.dossierOf(c, cn.id).roles[0].title === 'Consumer');
  // the cache key is hex, independent of the save, and differs per niche and category
  const k1 = N.nicheKey(s, deep.id);
  assert.match(k1, /^[0-9a-f]{16}$/);
  const s9 = mk(9); assert.equal(N.nicheKey(s9, N.nicheFor(s9, TEXT).id), k1);
  assert.notEqual(k1, N.nicheKey(s, N.nicheFor(s, 'dental practices').id));
});

const RAW = {
  description: 'Dental group practices in Texas run on Dentrix. Contact john.smith@acmedental.com or 512-555-0142.',
  archetypes: [{ name: 'Group practice', sizeBand: '20-60 staff', employees: { lo: 20, hi: 60 }, revenueUsd: { lo: 2000000, hi: 6000000 }, countInRegion: { lo: 400, hi: 900 }, note: 'Acme Dental Partners LLC is the biggest local group.' }],
  exampleCompanies: [{ name: 'Acme Dental Partners', note: 'Founded by Dr. Jane Doe; Acme Dental Partners has 40 sites.' }],
  roles: [{ title: 'Office manager', cares: ['scheduling'] }],
  workflows: ['Morning huddle with Sarah Johnson'], tools: [{ name: 'Dentrix', category: 'practice management' }],
  vocabulary: ['production'], painTriggers: ['Insurance claim backlog'], incidents: ['Acme Dental Partners lost a week of claims; Mike Brown fixed it.'],
  spend: { problemUsdPerMonth: { lo: 500, hi: 1500 }, softwareUsdPerMonth: { lo: 800, hi: 2400 }, budgetNorm: 'Owner approves above $1,000' },
  buying: { process: 'Practice owner signs after the office manager trials it', signers: ['Owner dentist'], cycleDays: { lo: 20, hi: 60 } },
  communities: [{ name: 'American Dental Association', kind: 'association', url: 'https://www.ada.org' }],
  objections: ['Switching costs'], seasonality: 'Busy in Q4 before benefits reset',
  agencies: [{ name: 'Smile Growth Agency', kind: 'marketing', pricing: '$3,500 per month retainer', priceUsd: { lo: 3000, hi: 6000 }, unit: 'per month' }],
  citations: [{ url: 'https://www.ada.org/resources/research', title: 'ADA HPI' }],
};

test('disguise renames companies, keeps vendors and communities, fudges numbers within bounds, strips people', () => {
  const raw = normalizeDossier(RAW);
  const d = disguise(raw, { seedKey: 'abcd1234abcd1234' });
  const txt = JSON.stringify(d);
  assert.ok(!/Acme/.test(txt) && !/Smile Growth/.test(txt), 'real company and agency names are gone');
  assert.ok(!looksLikePII(txt) && !/john\.smith|512-555|Jane Doe|Sarah Johnson|Mike Brown/.test(txt), 'no emails, phones or person names');
  assert.ok(d.tools.some((t) => t.name === 'Dentrix') && d.communities[0].name === 'American Dental Association', 'vendors and communities stay');
  assert.deepEqual(d.citations, raw.citations);
  const a = d.archetypes[0], r = raw.archetypes[0];
  for (const [x, y] of [[a.employees.lo, r.employees.lo], [a.revenueUsd.hi, r.revenueUsd.hi], [a.countInRegion.lo, r.countInRegion.lo], [d.spend.problemUsdPerMonth.hi, 1500], [d.agencies[0].priceUsd.lo, 3000], [d.buying.cycleDays.hi, 60]]) {
    assert.ok(x / y >= FUDGE_MIN * 0.97 && x / y <= FUDGE_MAX * 1.03, `${x} vs ${y}`);
  }
  assert.ok(a.employees.lo <= a.employees.hi && a.revenueUsd.lo <= a.revenueUsd.hi);
  assert.notDeepEqual(a.revenueUsd, r.revenueUsd);
  assert.deepEqual(disguise(raw, { seedKey: 'abcd1234abcd1234' }), d, 'deterministic');
  assert.notDeepEqual(disguise(raw, { seedKey: 'ffff1234abcd1234' }).agencies[0].name, undefined);
  assert.deepEqual(disguise(d, { seedKey: 'other' }), d, 'idempotent once disguised');
  assert.ok(d.disguised && /multiplied/.test(d.fudge));
  assert.ok(d.archetypes[0].note.startsWith(d.exampleCompanies[0].name) && d.incidents[0].startsWith(d.exampleCompanies[0].name), 'same alias everywhere in the dossier');
});

// ------------------------------------------------------------------ client caches

test('cache layers: memory LRU -> IndexedDB adapter -> server, with promotion and bounds', async () => {
  const idb = new Map(); const srv = new Map(); const calls = [];
  const adapter = { get: async (k) => idb.get(k), put: async (k, v) => { idb.set(k, v); }, delete: async (k) => { idb.delete(k); } };
  const fetchImpl = async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const key = url.split('/').pop();
    if (init?.method === 'PUT') { srv.set(key, JSON.parse(init.body)); return { ok: true, json: async () => ({ ok: true }) }; }
    return srv.has(key) ? { ok: true, json: async () => srv.get(key) } : { ok: false, status: 404, json: async () => ({}) };
  };
  const cache = createNicheCache({ adapter, fetchImpl, base: '' });
  assert.equal(await cache.get('aaaa1111'), null);
  await cache.put('aaaa1111', { v: 1 });
  assert.deepEqual([...idb.keys(), ...srv.keys()], ['aaaa1111', 'aaaa1111']);
  cache.lru.clear(); assert.equal((await cache.get('aaaa1111')).tier, 'idb');
  assert.equal((await cache.get('aaaa1111')).tier, 'memory');
  cache.lru.clear(); idb.clear(); assert.equal((await cache.get('aaaa1111')).tier, 'server');
  assert.ok(idb.has('aaaa1111'), 'a server hit is promoted into IndexedDB');
  const lru = new LRU({ maxEntries: 3, maxChars: 1e6 }); for (let i = 0; i < 6; i++) lru.set(`k${i}`, { i });
  assert.equal(lru.size, 3); assert.ok(lru.has('k5') && !lru.has('k0'));
  const small = new LRU({ maxEntries: 50, maxChars: 100 }); for (let i = 0; i < 20; i++) small.set(`k${i}`, { pad: 'x'.repeat(30) });
  assert.ok(small.chars <= 100 + 50 && small.size < 20, 'size-bounded');
  const broken = createNicheCache({ adapter: { get: async () => { throw new Error('no idb'); }, put: async () => { throw new Error('no idb'); } }, fetchImpl: async () => { throw new Error('offline'); }, base: '' });
  assert.equal(await broken.get('bbbb2222'), null); await broken.put('bbbb2222', { v: 2 }); assert.equal((await broken.get('bbbb2222')).tier, 'memory');
});

test('state.cache is capped and recency-ordered; oversize entries are not kept; diskCache avoids repeat grounded calls', async () => {
  const cache = {};
  for (let i = 0; i < 520; i++) llm.cachePut(cache, `k${i}`, { data: { i } });
  assert.ok(Object.keys(cache).length <= llm.CACHE_LIMITS.maxEntries);
  assert.ok(cache.k519 && !cache.k0);
  llm.cacheGet(cache, 'k150'); llm.cachePut(cache, 'new', { data: 1 }); // k150 was refreshed, so k150 outlives older keys
  assert.ok(Object.keys(cache).at(-2) === 'k150');
  assert.equal(llm.cachePut(cache, 'big', { data: 'x'.repeat(50_000) }), false);
  assert.ok(!('big' in cache));

  // diskCache on a game server: the client asks the server to cache the reply (X-Disk-Cache) and never writes the
  // shared cache itself (a public proxy refuses client writes); the server side is covered in proxy-guard.test.js.
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"n":1}' }, finish_reason: 'stop' }], usage: { cost: 0.02 } }) };
  };
  try {
    llm.setSettings({ apiKey: 'sk-test', models: ['m/test'], enabled: true });
    const opts = { task: 'grounded', prompt: 'p', schema: { type: 'object' }, web: true, diskCache: true, fallback: () => ({ n: 0 }) };
    const a = await llm.ask({ ...opts, cache: {} });
    assert.deepEqual(a.data, { n: 1 });
    assert.equal(seen.length, 1, 'no client GET/PUT to /api/cache');
    assert.equal(seen[0].url, './api/llm'); assert.equal(seen[0].init.headers['X-Disk-Cache'], '1');
  } finally { globalThis.fetch = realFetch; llm.setSettings({ apiKey: '', enabled: true }); }
});

// ------------------------------------------------------------------ server: cache endpoint + research worker

let dir, port, clock = 1_000_000;
const orKey = process.env.OPENROUTER_API_KEY;
async function boot() {
  dir = await mkdtemp(join(tmpdir(), 'niche-'));
  delete process.env.OPENROUTER_API_KEY;
  serverConfig.cacheDir = dir; serverConfig.now = () => clock;
  Object.assign(serverConfig.research, { tickMs: 3_600_000, backoffMs: 1000, maxConcurrent: 2, maxPerHour: 30, maxAttempts: 3 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
}
const api = (path, init = {}) => fetch(`http://127.0.0.1:${port}${path}`, init);
const orReply = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(content), annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.org/trade-press', title: 'Trade press' } }] } }], usage: { cost: 0.02 } }) });

test('server cache endpoint round-trips JSON and rejects bad keys, traversal and oversize entries', async () => {
  await boot();
  const put = await api('/api/cache/abcdef0123456789', { method: 'PUT', body: JSON.stringify({ hello: 'world' }) });
  assert.equal(put.status, 200);
  assert.deepEqual(await (await api('/api/cache/abcdef0123456789')).json(), { hello: 'world' });
  assert.equal((await api('/api/cache/0000000000000000')).status, 404);
  for (const bad of ['ZZZZZZZZ', 'abc', '..%2F..%2Fserver', 'ABCDEF0123456789', 'queue']) assert.equal((await api(`/api/cache/${bad}`, { method: 'PUT', body: '{}' })).status, 400, bad);
  assert.equal((await api('/api/cache/abcdef0123456780', { method: 'PUT', body: JSON.stringify({ pad: 'x'.repeat(300_000) }) })).status, 413);
  assert.equal((await api('/api/cache/abcdef0123456781', { method: 'PUT', body: 'not json' })).status, 400);
  const files = await readdir(dir);
  assert.ok(files.includes('abcdef0123456789.json') && !files.some((f) => f.includes('server')) && !files.includes('abcdef0123456780.json'));
});

test('research: POST is idempotent, the worker disguises the answer into the disk cache, GET polls to done', async () => {
  const key = nicheHash('worker-test-1');
  const reqs = [];
  serverConfig.fetch = async (url, init) => { reqs.push(JSON.parse(init.body)); return orReply(RAW); };
  const body = JSON.stringify({ key, nodePath: ['Dental practices', 'Texas'], depth: 2, seedFacts: { roles: ['Owner'] } });
  const h = { 'Content-Type': 'application/json', 'X-OpenRouter-Key': 'sk-client-test' };
  const r1 = await (await api('/api/research', { method: 'POST', headers: h, body })).json();
  const r2 = await (await api('/api/research', { method: 'POST', headers: h, body })).json();
  assert.equal(r1.status, 'queued'); assert.equal(r2.status, 'queued');
  assert.equal(appNiche.queue.items[key].nodePath.length, 2);
  assert.deepEqual(await appNiche.tick(), [key]);
  await appNiche.idle();
  assert.equal(reqs.length, 1, 'one model call');
  assert.equal(reqs[0].plugins[0].id, 'web'); assert.equal(reqs[0].response_format.type, 'json_object');
  assert.match(reqs[0].messages[1].content, /Texas/);
  const done = await (await api(`/api/research/${key}`)).json();
  assert.equal(done.status, 'done');
  const txt = JSON.stringify(done.dossier);
  assert.ok(!/Acme|Smile Growth|john\.smith|Jane Doe/.test(txt) && done.dossier.disguised && done.dossier.researchedLevel === 2 && done.dossier.source === 'research');
  assert.ok(done.dossier.citations.some((c) => c.url === 'https://example.org/trade-press'), 'annotation citations are kept');
  assert.deepEqual(await (await api(`/api/cache/${key}`)).json(), done.dossier, 'the dossier is in the disk cache');
  assert.equal((await (await api('/api/research', { method: 'POST', headers: h, body })).json()).status, 'done', 'a cached niche is never researched again');
  assert.ok(!(await readFile(join(dir, 'queue.json'), 'utf8')).includes('sk-client-test'), 'API keys are never persisted');
  assert.equal((await api('/api/research/ZZ')).status, 400);
  assert.equal((await (await api(`/api/research/${nicheHash('nothing')}`)).json()).status, 'unknown');
});

test('research: retries with backoff, hourly and concurrency budgets, no key means no run, queue survives a restart', async () => {
  const mkCfg = (over = {}) => { const c = defaults(); c.cacheDir = dir; c.now = () => clock; Object.assign(c.research, { tickMs: 3_600_000, backoffMs: 1000, ...over }); return c; };
  // retry with backoff
  let n = 0;
  const cfg = mkCfg(); cfg.fetch = async () => (++n === 1 ? { ok: false, status: 500, json: async () => ({ error: 'boom' }) } : orReply(RAW));
  const q = new NicheServer(cfg);
  const k1 = nicheHash('retry-1');
  await q.request({ key: k1, nodePath: ['x'], depth: 1 }, 'sk-a');
  await q.tick(); await q.idle();
  assert.equal(q.queue.items[k1].status, 'queued'); assert.equal(q.queue.items[k1].attempts, 1);
  assert.deepEqual(await q.tick(), [], 'not before the backoff elapsed');
  clock += 1500; assert.deepEqual(await q.tick(), [k1]); await q.idle();
  assert.equal(q.queue.items[k1].status, 'done');
  // permanent failure after maxAttempts
  const cfg2 = mkCfg({ maxAttempts: 2 }); cfg2.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'bad' }) });
  const q2 = new NicheServer(cfg2); const k2 = nicheHash('fail-1');
  await q2.request({ key: k2, depth: 1 }, 'sk-a');
  for (let i = 0; i < 2; i++) { clock += 5000; await q2.tick(); await q2.idle(); }
  assert.equal(q2.queue.items[k2].status, 'failed'); assert.match(q2.queue.items[k2].error, /bad/);
  assert.equal((await q2.request({ key: k2, depth: 1 }, 'sk-a')).status, 'failed', 'failed stays failed unless retry is asked');
  // budgets: concurrency 1 and 2 per hour
  const cfg3 = mkCfg({ maxConcurrent: 1, maxPerHour: 2 }); cfg3.cacheDir = await mkdtemp(join(tmpdir(), 'niche-')); let release; const gate = new Promise((r) => { release = r; });
  cfg3.fetch = async () => { await gate; return orReply(RAW); };
  const q3 = new NicheServer(cfg3); const ks = [nicheHash('b1'), nicheHash('b2'), nicheHash('b3')];
  for (const k of ks) await q3.request({ key: k, depth: 1 }, 'sk-a');
  assert.equal((await q3.tick()).length, 1, 'max one in flight');
  assert.equal((await q3.tick()).length, 0);
  release(); await q3.idle();
  assert.equal((await q3.tick()).length, 1); await q3.idle();
  assert.equal((await q3.tick()).length, 0, 'hourly cap reached');
  clock += 3_700_000; assert.equal((await q3.tick()).length, 1, 'a new hour frees the budget'); await q3.idle();
  // no key: the request is refused; a queued item with no key waits; a restart resumes it once a key exists
  const cfg4 = mkCfg(); cfg4.cacheDir = await mkdtemp(join(tmpdir(), 'niche-')); cfg4.fetch = async () => orReply(RAW);
  const q4 = new NicheServer(cfg4); const k4 = nicheHash('resume-1');
  assert.deepEqual(await q4.request({ key: k4, depth: 1 }), { key: k4, status: 'failed', error: 'no-key' });
  await q4.request({ key: k4, depth: 1 }, 'sk-a');
  const q5 = new NicheServer(cfg4); // simulated restart: the key is gone with the process
  await q5.load();
  assert.equal(q5.queue.items[k4].status, 'queued');
  assert.deepEqual(await q5.tick(), [], 'skipped while there is no key');
  assert.equal((await q5.status(k4)).waiting, 'no-key');
  process.env.OPENROUTER_API_KEY = 'sk-env';
  try { assert.deepEqual(await q5.tick(), [k4]); await q5.idle(); assert.equal((await q5.status(k4)).status, 'done'); } finally { delete process.env.OPENROUTER_API_KEY; }
});

// ------------------------------------------------------------------ client research job

test('research job: never queued offline; online queued once per node, depth-gated; the poll pulls the dossier into the cache', async () => {
  const s = mk();
  const idb = new Map();
  const cache = createNicheCache({ adapter: { get: async (k) => idb.get(k), put: async (k, v) => { idb.set(k, v); } }, fetchImpl: async () => { throw new Error('no server'); }, base: '' });
  const saved = { live: N.nicheConfig.live, fetch: N.nicheConfig.fetch, cache: N.nicheConfig.cache };
  N.nicheConfig.cache = cache; N.nicheConfig.keyModel = 'm/test';
  try {
    N.nicheConfig.live = () => false;
    N.nicheFor(s, TEXT);
    assert.equal(s.jobs.length, 0, 'offline: no research jobs');
    assert.equal(N.dossierOf(s, N.nicheFor(s, TEXT).id).source, 'offline');

    N.nicheConfig.live = () => true;
    const posts = []; let serverState = 'running';
    const dossier = { ...normalizeDossier(RAW), source: 'research', researchedLevel: 1, disguised: true };
    N.nicheConfig.fetch = async (url, init) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(init.body)); return { json: async () => ({ status: 'queued' }) }; }
      return { json: async () => (serverState === 'done' ? { status: 'done', dossier } : { status: serverState }) };
    };
    const deep = N.nicheFor(s, TEXT);
    const root = N.pathOf(s, deep.id)[0];
    assert.equal(s.jobs.filter((j) => j.type === 'niche:research').length, 1, 'only the segment is researched first (parent dossier gate)');
    N.nicheFor(s, TEXT); N.nicheFor(s, TEXT);
    assert.equal(s.jobs.filter((j) => j.type === 'niche:research').length, 1, 'once per node');
    await drainJobs({ state: s });
    assert.equal(posts.length, 1); assert.equal(posts[0].depth, 1); assert.equal(posts[0].key, N.nicheKey(s, root.id));
    assert.equal(root.research.status, 'running');
    assert.ok(s.jobs.some((j) => j.type === 'niche:poll' && j.notBefore > s.day), 'a poll is scheduled for tomorrow');
    s.day++; serverState = 'done';
    await drainJobs({ state: s });
    assert.equal(root.research.status, 'done');
    assert.ok(idb.has(N.nicheKey(s, root.id)), 'pulled into the IndexedDB store');
    assert.equal(N.dossierOf(s, root.id).source, 'research');
    assert.ok(N.dossierOf(s, root.id).agencies.length, 'research is merged over the offline dossier');
    assert.equal(posts.length, 2, 'the child is researched once its parent is done');
    assert.equal(posts[1].depth, 2); assert.equal(posts[1].nodePath.length, 2);
    assert.ok(JSON.stringify(s).length < 20_000, 'dossier bodies stay out of the save');
    assert.ok(!JSON.stringify(s).includes('Smile Growth') && !JSON.stringify(s.market.niches).includes('"incidents"'));
    // daily budget
    const many = mk(); for (const st of ['ohio', 'utah', 'iowa', 'maine', 'texas']) N.nicheFor(many, `dental practices in ${st}`);
    const before = many.jobs.length; N.pumpResearch(many); assert.ok(before <= N.nicheConfig.research.maxPerDay);
  } finally { Object.assign(N.nicheConfig, saved, { keyModel: null }); }
});

after(async () => {
  appNiche.stop();
  await new Promise((r) => (server.listening ? server.close(r) : r()));
  if (orKey) process.env.OPENROUTER_API_KEY = orKey;
});
