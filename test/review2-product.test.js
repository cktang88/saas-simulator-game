// Regression tests for the second product / insights / market / outcomes bug review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { releasesSlice, deploy, rollback } from '../public/apps/product/releases.js';
import { ensureLab, createExperiment, concludeExperiment, experimentEffects, toggleFlag } from '../public/apps/insights/lab.js';
import { signals } from '../public/apps/outcomes/engine.js';
import { productSlice } from '../public/apps/product/store.js';
import { templateCompetitors } from '../public/apps/marketworld/model.js';
import { normalizeDiscovery } from '../public/apps/marketworld/competitors.js';

const fresh = (seed = 11) => {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s);
  return s;
};

test('a rollback that failed on a migration cannot be retried into a success, nor double the fix again', () => {
  const rel = releasesSlice({});
  const f = { id: 'f1', title: 'Import history' };
  const { error: e } = deploy(rel, f, { day: 5, cfr: 1, rand: () => 0.1, migration: true }); // bad deploy, crash
  const before = e.fixHours;
  const r1 = rollback(rel, e.id, { rand: () => 0.1 }); // < 0.25: the migration makes the rollback fail
  assert.equal(r1.ok, false);
  assert.equal(e.fixHours, before * 2);
  const r2 = rollback(rel, e.id, { rand: () => 0.9 }); // would have "succeeded" before the fix
  assert.equal(r2.ok, false, 'a migration cannot be rolled back on the second try');
  assert.equal(e.status, 'unresolved');
  assert.equal(e.fixHours, before * 2, 'fix effort doubles once, not on every retry');
});

test('killing a shipped experiment flag removes the variant effect', () => {
  const s = fresh();
  ensureLab(s);
  const e = createExperiment(s, { name: 'Shorter signup', hypothesis: 'Because 40% drop off at step 2 in replays, removing it should increase signup rate', surface: 'landing', baseline: 0.05, traffic: 100 });
  e.trueEffect = 0.2;
  concludeExperiment(s, e, 'ship');
  assert.ok(Math.abs(experimentEffects(s).landing - 1.2) < 1e-9);
  assert.equal(toggleFlag(s, e.flagKey, false).ok, true);
  assert.equal(experimentEffects(s).landing, 1, 'kill switch turns the variant off');
  toggleFlag(s, e.flagKey, true);
  assert.ok(Math.abs(experimentEffects(s).landing - 1.2) < 1e-9);
});

test('declined, duplicate and won\'t-fix bugs do not count as releases for the ship-fast habit', () => {
  const s = fresh();
  s.day = 100;
  const sl = productSlice(s);
  sl.bugs.push(...Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, hours: 1, fixedDay: 60 + i * 5, wontFix: i % 2 === 0, duplicate: i % 2 === 1 })));
  const h = signals(s).habits.find((x) => x.id === 'ship_fast');
  assert.ok(h);
  assert.equal(h.met, false);
  assert.match(h.detail, /^0\.0 releases/);
  sl.bugs.push({ id: 'real', hours: 1, fixedDay: 90 });
  assert.match(signals(s).habits.find((x) => x.id === 'ship_fast').detail, /^0\.1 releases/);
});

test('template competitor prices normalise annual pricing from the active plan, not plans[0]', () => {
  const s = fresh();
  s.plans = [{ id: 'old', price: 50, interval: 'month', active: false }, { id: 'yr', price: 1200, interval: 'year', active: true }];
  let i = 0;
  const rand = () => ((i++ * 0.37) % 1);
  const list = templateCompetitors(s, rand, 6, 'horizontal');
  for (const c of list) assert.ok(c.priceMonthly <= 200, `${c.name} at $${c.priceMonthly}/mo from a $100/mo plan`);
});

test('competitor discovery output with missing fields is normalised instead of crashing later', () => {
  const n = normalizeDiscovery({ statusQuoShare: 0.2, competitors: [{ name: 'Acme', awareness: 0.2, marketShare: 0.1 }, { name: null }] });
  assert.equal(n.list.length, 1);
  const c = n.list[0];
  assert.equal(typeof c.url, 'string');
  assert.equal(c.kind.replace(/_/g, '-'), 'direct');
  assert.equal(typeof c.fundingStage.replace(/_/g, ' '), 'string');
  assert.deepEqual(c.sources, []);
  assert.equal(c.momentum, 'flat');
});

test('UI guards: cancelling "Won\'t build" declines nothing; awaiting-approval features cannot be pulled from the queue', () => {
  const views = readFileSync(new URL('../public/apps/product/views.js', import.meta.url), 'utf8');
  assert.match(views, /const reason = prompt\('Why not[^\n]*'\);\s*if \(reason == null\) return;/);
  const product = readFileSync(new URL('../public/apps/product.js', import.meta.url), 'utf8');
  assert.match(product, /f\.status === 'building' && !f\.awaiting\) \? html`<button id="unqueue">/);
  assert.match(product, /'#unqueue', \(\) => ctx\.act\(\(st\) => \{ if \(f\.awaiting/);
});
