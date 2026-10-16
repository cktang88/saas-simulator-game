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

// ------------------------------------------------------------------ follow-up fixes

test('isPrivateIp blocks benchmarking, IETF-protocol, NAT64 and 6to4 ranges; publicLookup refuses private answers at connect time', async () => {
  const { isPrivateIp, publicLookup } = await import('../server.js');
  for (const ip of ['198.18.0.1', '198.19.255.255', '192.0.0.8', '64:ff9b::7f00:1', '2002:7f00:1::1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['198.20.0.1', '192.0.1.1', '8.8.8.8', '2606:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
  const err = await new Promise((r) => publicLookup('localhost', {}, (e) => r(e)));
  assert.ok(err && /not a public address/.test(err.message), 'a host resolving to loopback is refused by the connect-time lookup');
});

test('niche server: keys are held only for items that will run; a corrupt queue.json neither wedges nor caches a failed load', async () => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'niche-h-'));
  const saved = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  try {
    const cfg = defaults(); cfg.cacheDir = dir; cfg.now = () => 1_000_000; Object.assign(cfg.research, { tickMs: 3_600_000, maxQueue: 1, maxAttempts: 1 });
    cfg.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'bad' }) });
    const q = new NicheServer(cfg);
    const [a, b] = [nicheHash('k-a'), nicheHash('k-b')];
    assert.equal((await q.request({ key: a }, 'sk-a')).status, 'queued');
    assert.equal((await q.request({ key: b }, 'sk-b')).error, 'queue full');
    assert.ok(!q.keys.has(b), 'a refused request leaves no key behind');
    await q.tick(); await q.idle();
    assert.equal(q.queue.items[a].status, 'failed');
    assert.ok(!q.keys.has(a), 'a failed item drops its key');
    q.stop();
    // corrupt queue file
    const dir2 = await mkdtemp(join(tmpdir(), 'niche-h-')); await mkdir(dir2, { recursive: true });
    await writeFile(join(dir2, 'queue.json'), JSON.stringify({ items: null, calls: 'x' }));
    const cfg2 = defaults(); cfg2.cacheDir = dir2; cfg2.now = () => 1_000_000;
    const q2 = new NicheServer(cfg2);
    await q2.load();
    assert.deepEqual(q2.queue, { items: {}, calls: [] });
    await writeFile(join(dir2, 'queue.json'), JSON.stringify({ items: [1, 2], calls: [] }));
    const q3 = new NicheServer(cfg2); await q3.load();
    assert.deepEqual(q3.queue.items, {});
    q2.stop(); q3.stop();
  } finally { if (saved != null) process.env.OPENROUTER_API_KEY = saved; }
});

test('niche research: a node waiting on a keyless server item stops counting as in flight', async () => {
  const s = mk();
  const saved = { live: N.nicheConfig.live, fetch: N.nicheConfig.fetch, cache: N.nicheConfig.cache };
  const store = new Map();
  N.nicheConfig.cache = { peek: () => null, get: async () => null, put: async (k, v) => { store.set(k, v); return true; } };
  N.nicheConfig.live = () => true;
  N.nicheConfig.fetch = async () => ({ json: async () => ({ status: 'queued', waiting: 'no-key' }) });
  try {
    const n = N.nicheFor(s, 'dental practices in Texas');
    const root = N.pathOf(s, n.id)[0];
    root.hits = 5; root.research = { status: 'running', day: s.day, attempts: 1 };
    await N.nicheJobs['niche:poll']({ state: s });
    assert.equal(root.research.status, 'failed');
    assert.equal(root.research.error, 'no-key');
    // and a node stuck 'running' because the server is unreachable times out
    N.nicheConfig.fetch = async () => { throw new Error('down'); };
    root.research = { status: 'running', day: s.day - N.nicheConfig.research.maxRunningDays, attempts: 1 };
    await N.nicheJobs['niche:poll']({ state: s });
    assert.equal(root.research.status, 'failed');
  } finally { Object.assign(N.nicheConfig, saved); }
});

test('stripe: a fully refunded charge is not disputed again; a partly refunded one only for what is left', async () => {
  const { ensureStripe, createCustomer, subscribe, refund, stripeDay } = await import('../public/core/stripe.js');
  const { seedDefaultStack, post } = await import('../public/core/bank.js');
  const s = newState({ companyName: 'T', model: 'smb', path: 'indie', founderName: 'P', seed: 42 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 30000, counterparty: 'P', category: 'owner_contribution' });
  const ids = [];
  for (let i = 0; i < 6 && ids.length < 2; i++) {
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, country: 'US' });
    subscribe(s, c.id, { id: 'p', price: 100, interval: 'month', trialDays: 0 });
    const ch = s.stripe.charges.find((x) => x.customerId === c.id && x.status === 'succeeded');
    if (ch) ids.push(ch);
  }
  const [full, part] = ids;
  for (const sub of s.stripe.subscriptions) sub.pendingRefund = null;
  s.stripe.disputes = [];
  refund(s, full.id); refund(s, part.id, { amount: 40 });
  s.stripe.disputes.push({ id: 'dp_f', chargeId: full.id, customerId: full.customerId, day: s.day, amount: full.amount, status: 'scheduled', reason: 'fraudulent' });
  s.stripe.disputes.push({ id: 'dp_p', chargeId: part.id, customerId: part.customerId, day: s.day, amount: part.amount, status: 'scheduled', reason: 'fraudulent' });
  const avail = s.stripe.available;
  stripeDay(s);
  assert.ok(!s.stripe.disputes.some((d) => d.id === 'dp_f'), 'the fully refunded charge is not disputed');
  const dp = s.stripe.disputes.find((d) => d.id === 'dp_p');
  assert.equal(dp.status, 'needs_response'); assert.equal(dp.amount, 60);
  assert.ok(Math.abs(avail - s.stripe.available - (60 + 15)) < 50, 'only the unrefunded part (plus the fee) leaves the balance');
});

test('negotiation: a late LLM reply after the player walked leaves trust, flags and the stream untouched; fixed issues snap safely', async () => {
  const Neg = await import('../public/core/negotiation.js');
  const s = newState({ companyName: 'L', model: 'ent', path: 'vc', founderName: 'P', seed: 5 });
  ensureMarket(s);
  const issues = [
    { id: 'price', label: 'Price', type: 'num', fmt: 'usd', unit: '$', min: 50000, max: 100000, step: 500, pDir: 1, cDir: -1, wp: 0.5, wc: 0.4 },
    { id: 'term', label: 'Term', type: 'opt', wp: 0.5, wc: 0.6, options: [{ id: '1', label: '1 year', pu: 0, cu: 1 }, { id: '3', label: '3 years', pu: 1, cu: 0 }] },
  ];
  const neg = Neg.startNegotiation(s, { key: 'stale', kind: 'synth', title: 'S', stakes: 'mid', stakesUsd: 1e5, usdPerUtil: 1e5, cp: { name: 'B', role: 'procurement', style: 'hardball' }, issues, jitter: 0, batnaStrength: 0.5 });
  const before = JSON.stringify({ cp: neg.cp, flags: neg.flags, hidden: neg.hidden, rs: neg.rs, round: neg.round });
  let release; const gate = new Promise((r) => { release = r; });
  const ask = async () => { await gate; return { mock: false, data: { message: 'Fine.' } }; };
  const p = Neg.playRound(s, neg.id, { offer: { price: 100000, term: '3' }, message: 'Take it or leave it, we have another offer.' }, { ask, live: true });
  Neg.walkAway(s, neg.id);
  const scoredFlags = JSON.stringify(neg.result.freeGives);
  release();
  const rep = await p;
  assert.equal(rep.stale, true);
  assert.equal(JSON.stringify({ cp: { ...neg.cp }, flags: neg.flags, hidden: neg.hidden, rs: neg.rs, round: neg.round }), before);
  assert.equal(JSON.stringify(neg.result.freeGives), scoredFlags);
  // numStep: a fixed numeric issue (min === max) no longer turns into NaN
  assert.equal(Neg.snapValue({ type: 'num', min: 7, max: 7 }, 9), 7);
});
