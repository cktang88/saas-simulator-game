// Regression tests for bugs found in the niche engine, the niche research worker and the LLM client plumbing.
// Short and offline: no live requests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import * as N from '../public/core/niche.js';
import { normalizeDossier } from '../public/core/niche-research.js';
import { disguise, nicheHash } from '../public/core/niche-disguise.js';
import { parseJson, cachePut, CACHE_LIMITS } from '../public/core/llm.js';
import { NicheServer, defaults } from '../niche-server.js';

function mk(seed = 5) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Practice software for dentists'; s.company.icp = '';
  return s;
}

test('pruning never deletes the node nicheFor just created (it came back orphaned with no stats)', () => {
  const s = mk();
  const saved = N.nicheConfig.maxNodes;
  N.nicheConfig.maxNodes = 6;
  try {
    // Every leaf is touched the same day, so the brand-new leaf (0 hits) used to sort first for pruning.
    for (const st of ['Texas', 'Ohio', 'Utah', 'Iowa', 'Maine', 'Idaho', 'Nevada', 'Oregon']) {
      const n = N.nicheFor(s, `dental practices in ${st}`);
      assert.ok(N.getNode(s, n.id), `${st}: returned node is in the tree`);
      assert.ok(N.statsFor(s, n.id), `${st}: returned node has stats`);
    }
    assert.ok(Object.keys(s.market.niches.nodes).length <= 7, 'the tree is still bounded');
  } finally { N.nicheConfig.maxNodes = saved; }
});

test('normalizeDossier survives malformed model output (wrong types, null items) instead of throwing', () => {
  const bad = [null, 'text', [], { archetypes: { name: 'x' } }, { roles: [null, { title: 'Owner', cares: [{ a: 1 }, 'price'] }] }, { tools: 'QuickBooks' }, { citations: [null, { url: 'https://a.org', title: 't' }] }, { agencies: [7, { name: 'A', kind: 'pr' }] }];
  for (const raw of bad) {
    const d = normalizeDossier(raw);
    assert.ok(Array.isArray(d.archetypes) && Array.isArray(d.roles) && Array.isArray(d.tools), JSON.stringify(raw));
    assert.doesNotThrow(() => disguise(d, { seedKey: 'k' }));
  }
  const r = normalizeDossier({ roles: [null, { title: 'Owner', cares: [{ a: 1 }, 'price'] }] });
  assert.deepEqual(r.roles, [{ title: 'Owner', cares: ['price'] }], 'object items in string lists are dropped, not "[object Object]"');
  assert.equal(normalizeDossier({ citations: [null, { url: 'https://a.org', title: 't' }] }).citations.length, 1);
});

test('LLM parseJson only accepts JSON objects (null / numbers / arrays are retried, then fall back)', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Sure! {"a":1} hope that helps'), { a: 1 });
  for (const t of ['null', '42', '"hi"', '[1,2]', '', 'no json here']) assert.throws(() => parseJson(t), /JSON object/, t);
});

test('state.cache eviction for count does not also over-evict for size', () => {
  const saved = { ...CACHE_LIMITS };
  Object.assign(CACHE_LIMITS, { maxEntries: 4, maxTotalChars: 1000, checkEvery: 1 });
  try {
    const cache = {};
    cachePut(cache, 'big', { v: 'x'.repeat(500) }); // will be the one dropped for count
    for (const k of ['a', 'b', 'c']) cachePut(cache, k, { v: 'y'.repeat(150) });
    cachePut(cache, 'd', { v: 'y'.repeat(150) }); // 5 entries: drop 'big'; the rest (~4 x 160) is under the size cap
    assert.deepEqual(Object.keys(cache), ['a', 'b', 'c', 'd']);
  } finally { Object.assign(CACHE_LIMITS, saved); }
});

test('research worker: a model reply that is not a JSON object fails cleanly; wrong field types still produce a dossier', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'niche-h-'));
  let clock = 1_000_000;
  const cfg = defaults(); cfg.cacheDir = dir; cfg.now = () => clock; Object.assign(cfg.research, { tickMs: 3_600_000, backoffMs: 1000, maxAttempts: 1 });
  const reply = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
  const contents = { [nicheHash('h-null')]: 'null', [nicheHash('h-shape')]: JSON.stringify({ description: 'Dental offices', archetypes: { name: 'x' }, tools: 'Dentrix', citations: { url: 'x' } }) };
  const q = new NicheServer(cfg);
  // The key is not in the request body, so replies are routed by enqueue order (one call at a time).
  const order = [nicheHash('h-null'), nicheHash('h-shape')];
  let i = 0;
  cfg.fetch = async () => reply(contents[order[i++]]);
  cfg.research.maxConcurrent = 1;
  for (const k of order) await q.request({ key: k, nodePath: ['Dental'], depth: 1 }, 'sk-test');
  await q.tick(); await q.idle(); clock += 1; await q.tick(); await q.idle();
  assert.equal(q.queue.items[order[0]].status, 'failed');
  assert.match(q.queue.items[order[0]].error, /JSON object/);
  const done = await q.status(order[1]);
  assert.equal(done.status, 'done');
  assert.equal(done.dossier.description, 'Dental offices');
  assert.deepEqual(done.dossier.archetypes, []);
  q.stop();
});

test('server: malformed JSON bodies and bad URL escapes are 400s, not 500s', async () => {
  const { server, nicheConfig: serverConfig } = await import('../server.js');
  serverConfig.cacheDir = await mkdtemp(join(tmpdir(), 'niche-h-'));
  Object.assign(serverConfig.research, { tickMs: 3_600_000 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const post = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal((await post('/api/research', '{not json')).status, 400);
    assert.equal((await post('/api/research', 'null')).status, 400);
    assert.equal((await post('/api/site', '[1]')).status, 400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/%E0%A4%A`)).status, 400);
  } finally {
    const { niche } = await import('../server.js');
    niche.stop();
    await new Promise((r) => server.close(r));
  }
});
