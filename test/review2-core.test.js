// Regression tests for the second core review (public/core, public/main.js, server.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureWellbeing, wellbeingWeek, THERAPY_WEEKLY_USD } from '../public/core/wellbeing.js';
import { weighted } from '../public/core/rubric.js';
import { uid, getIdCounter } from '../public/core/util.js';
import { isPrivateIp } from '../server.js';

function fresh(model = 'smb', seed = 11) {
  const s = newState({ companyName: 'Review Co', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s);
  return s;
}

// Minimal in-memory IndexedDB + localStorage so core/store.js runs under Node.
function fakeBrowserStorage() {
  const stores = { state: new Map(), files: new Map(), niches: new Map() };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction(name) {
      const t = {};
      const s = {
        get: (k) => ({ result: structuredClone(stores[name].get(k)) }),
        put: (v, k) => { stores[name].set(k, structuredClone(v)); return {}; },
        delete: (k) => { stores[name].delete(k); return {}; },
        getAll: () => ({ result: [...stores[name].values()] }),
      };
      t.objectStore = () => s;
      setTimeout(() => t.oncomplete?.());
      return t;
    },
  };
  globalThis.indexedDB = { open: () => { const req = {}; setTimeout(() => { req.result = db; req.onsuccess(); }); return req; } };
  const ls = new Map();
  globalThis.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
  return { stores, ls };
}

test('restoring an unload backup keeps the save\'s id counter (no duplicate ids after reload)', async () => {
  const { stores, ls } = fakeBrowserStorage();
  const store = await import('../public/core/store.js');
  const saved = { v: 3, day: 40, idCounter: getIdCounter() + 5000, marker: 'backup' };
  ls.set('saas-founder-sim:unload-backup', JSON.stringify(saved));
  const st = await store.loadState();
  assert.equal(st.marker, 'backup');
  assert.ok(getIdCounter() >= saved.idCounter, `live counter ${getIdCounter()} must resume at the save's ${saved.idCounter}`);
  assert.ok(stores.state.get('current').idCounter >= saved.idCounter, 'the re-saved state keeps its counter');
  const id = uid('t');
  assert.ok(parseInt(id.split('_')[1], 36) >= saved.idCounter, 'new ids continue after the saved ones');
  delete globalThis.indexedDB; delete globalThis.localStorage;
});

test('an incomplete checkout that is retried leaves no invoice stuck open', () => {
  let recovered = 0;
  for (let seed = 1; seed < 40; seed++) {
    const s = fresh('smb', seed);
    post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
    for (let i = 0; i < 40; i++) { const c = createCustomer(s, { name: `c${i}`, email: `c${i}@x.com` }); subscribe(s, c.id, s.plans[0], { trial: false }); }
    advance(s, 3, []);
    for (const sub of s.stripe.subscriptions) {
      if (sub.incompleteDay == null) continue;
      const open = s.stripe.invoices.filter((i) => i.subId === sub.id && i.status === 'open');
      assert.equal(open.length, 0, `sub ${sub.id} (${sub.status}) has no open invoice after the incomplete window`);
      if (sub.status === 'active') recovered++;
    }
  }
  assert.ok(recovered > 0, 'some incomplete checkouts were recovered with a new card');
});

test('therapy costs ~$600 a month, not $600 a week', () => {
  const s = fresh();
  s.personal.liquidSavings = 10000;
  ensureWellbeing(s).therapy = true;
  for (let w = 0; w < 4; w++) wellbeingWeek(s);
  const spent = -s.personal.txns.filter((t) => /Therapist/.test(t.description)).reduce((a, t) => a + t.amount, 0);
  assert.ok(Math.abs(spent - 4 * THERAPY_WEEKLY_USD) < 0.01);
  assert.ok(spent > 500 && spent < 650, `4 weeks of therapy cost ${spent}`);
});

test('rubric weighted(): an unscored (null) criterion is skipped, not counted as a 1', () => {
  const criteria = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
  assert.equal(weighted({ a: 5, b: null }, criteria), 5);
  assert.equal(weighted({ a: 5, b: '' }, criteria), 5);
  assert.equal(weighted({ a: null, b: undefined }, criteria), null);
  assert.equal(weighted({ a: 5, b: 0 }, criteria), 3, 'a real 0 still clamps to 1');
});

test('negotiation: a live reply that lands after the player walked away is not applied', async () => {
  const N = await import('../public/core/negotiation.js');
  const s = fresh();
  const neg = N.startNegotiation(s, {
    key: 'rv2', kind: 'test', title: 'Test deal', stakes: 'mid', stakesUsd: 10000,
    cp: { name: 'Dana', role: 'buyer', style: 'hardball' }, cpOpens: true,
    issues: [
      { id: 'price', label: 'Price', type: 'num', fmt: 'usd', unit: '$', min: 50000, max: 100000, step: 500, pDir: 1, cDir: -1, wp: 0.6, wc: 0.5 },
      { id: 'term', label: 'Term', type: 'opt', wp: 0.4, wc: 0.5, options: [{ id: '1', label: '1 year', pu: 0, cu: 1 }, { id: '3', label: '3 years', pu: 1, cu: 0 }] },
    ],
  });
  const histBefore = neg.history.length;
  let release;
  const gate = new Promise((r) => { release = r; });
  const ask = async () => { await gate; return { mock: false, data: { message: 'Fine, here is my counter.', mood: 'neutral' } }; };
  const p = N.playRound(s, neg.id, { offer: { price: 95000, term: '1' }, message: 'How about 95k on a 1-year term?' }, { ask, live: true });
  N.walkAway(s, neg.id);
  const status = neg.status;
  const lastCp = neg.last.cp;
  const events = s.apps.negotiation.events.length;
  release();
  const r = await p;
  assert.equal(r.stale, true);
  assert.equal(neg.status, status);
  assert.equal(neg.last.cp, lastCp, 'last counteroffer unchanged');
  assert.equal(s.apps.negotiation.events.length, events, 'no counteroffer event after close');
  assert.equal(neg.history.at(-1).action, 'walk', `history ends with the walk (had ${histBefore})`);
});

test('niche research: a failed poll job left in the queue does not block scheduling a new poll', async () => {
  const N = await import('../public/core/niche.js');
  const { createNicheCache } = await import('../public/core/niche-cache.js');
  const { drainJobs } = await import('../public/core/jobs.js');
  const s = fresh();
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Practice software for dentists';
  const cache = createNicheCache({ adapter: { get: async () => undefined, put: async () => {} }, fetchImpl: async () => { throw new Error('no server'); }, base: '' });
  const saved = { live: N.nicheConfig.live, fetch: N.nicheConfig.fetch, cache: N.nicheConfig.cache };
  try {
    N.nicheConfig.cache = cache; N.nicheConfig.keyModel = 'm/test'; N.nicheConfig.live = () => true;
    N.nicheConfig.fetch = async (url, init) => ({ json: async () => (init?.method === 'POST' ? { status: 'queued' } : { status: 'running' }) });
    s.jobs.push({ id: 'old_poll', type: 'niche:poll', payload: {}, label: 'old', status: 'failed', createdDay: s.day, attempts: 2 });
    N.nicheFor(s, 'multi-location dental practices in Texas using Dentrix');
    assert.ok(s.jobs.some((j) => j.type === 'niche:research'));
    await drainJobs({ state: s });
    assert.ok(s.jobs.some((j) => j.type === 'niche:poll' && j.status === 'pending' && j.notBefore > s.day), 'a fresh poll is scheduled');
  } finally { Object.assign(N.nicheConfig, saved, { keyModel: null }); }
});

test('SSRF guard covers all of fe80::/10, site-local and multicast IPv6, without blocking public ranges', () => {
  for (const ip of ['fe80::1', 'fe90::1', 'febf::1', 'fec0::1', 'ff02::1', 'fd12:3456::1', 'fc00::1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['2606:4700::1111', '2001:4860:4860::8888', 'fe8::1', 'fc::1']) assert.equal(isPrivateIp(ip), false, ip);
});

test('main.js: the shutdown modal is shown once per company and resize ignores height-only changes', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../public/main.js', import.meta.url), 'utf8');
  assert.match(src, /state\.status === 'dead' && deadShownFor !== state/);
  assert.match(src, /window\.innerWidth === lastWidth\) return/);
});

test('churn: a discount save on an annual plan books the full year of margin it actually gives away', async () => {
  const { applySaveTactic } = await import('../public/core/churn.js');
  const s = fresh();
  const c = createCustomer(s, { name: 'Ann', email: 'ann@x.com' });
  const sub = subscribe(s, c.id, { id: 'plan_y', price: 1200, interval: 'year', trialDays: 0 }, { trial: false });
  sub.status = 'active';
  const r = applySaveTactic(s, sub.id, 'discount_offer'); // 20% for "3 months" = one discounted annual renewal
  assert.equal(sub.price, 960);
  assert.equal(r.marginUsd, 240, 'the whole year at 20% off ($100/mo x 20% x 12)');
});
