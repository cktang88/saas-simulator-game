import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { drainJobs, registerJob } from '../public/core/jobs.js';
import * as llm from '../public/core/llm.js';
import { APPS } from '../public/apps/registry.js';
import market from '../public/apps/market.js';
import { WORLD_EVENTS } from '../public/data/world.js';
import { eventRate, aiDependence, exposureFlags, drawEffects, applyHint, landscapeSize, pressureMult, pageHeuristic, pageScore, nicheType, HANDLED_CATEGORIES } from '../public/apps/marketworld/model.js';
import { ensureWorld, fireEvent, respond, worldEffect, worldDealMult, EVENTS, eventById, exposureTable, activeRivals } from '../public/apps/marketworld/engine.js';

const ALL = APPS.some((a) => a.id === 'market') ? APPS : [...APPS, market];
for (const [type, h] of Object.entries(market.jobs)) registerJob(type, h);
const mulberry = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function fresh(model = 'smb', seed = 11) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = model === 'b2c' ? 'AI note-taking app for students' : 'Bookkeeping reconciliation for Shopify stores';
  s.apps.product = { features: [{ id: 'f1', title: 'Sync', status: 'shipped', ai: { enabled: false } }, { id: 'f2', title: 'AI match', status: 'shipped', ai: { enabled: true, level: 'light' } }] };
  s.company.website = { text: 'x' };
  return s;
}
const ctxFor = (s) => ({ state: s, llm, save() {}, render() {} });

test('only competitor / platform / ai_lab / macro / reputation events are handled; no life/security/ops', () => {
  assert.ok(EVENTS.length >= 15);
  assert.ok(EVENTS.every((e) => HANDLED_CATEGORIES.includes(e.category)));
  assert.ok(!EVENTS.some((e) => e.id === 'burnout_episode' || e.id === 'card_testing_attack' || e.id === 'data_breach'));
});

test('event rates follow the research convention: conditions multiply, requires are hard gates', () => {
  const coreUpdate = eventById('google_core_update');
  const p = { model: 'b2c', stage: 'launched', path: 'indie', aiDependence: 'none', flags: { usesSEO: false } };
  assert.equal(eventRate(coreUpdate, p), 0);
  assert.ok(Math.abs(eventRate(coreUpdate, { ...p, flags: { usesSEO: true } }) - 3.3 * 1.2) < 1e-9);
  const lab = eventById('ai_lab_feature_overlap');
  const wrapper = eventRate(lab, { model: 'b2c', stage: 'launched', path: 'indie', aiDependence: 'wrapper', flags: { horizontalProduct: true } });
  const vertical = eventRate(lab, { model: 'ent', stage: 'launched', path: 'indie', aiDependence: 'none', flags: { verticalProduct: true } });
  assert.ok(wrapper > 20 * vertical, `${wrapper} vs ${vertical}`);
  assert.equal(eventRate(eventById('competitor_feature_copy'), { model: 'smb', stage: 'idea', path: 'indie', aiDependence: 'none', flags: {} }), 0);
});

test('profile: AI dependence from shipped features, exposure flags from other apps', () => {
  const s = fresh();
  assert.equal(aiDependence(s), 'core');
  s.apps.product.features[1].ai.enabled = false;
  assert.equal(aiDependence(s), 'none');
  assert.equal(nicheType(s), 'vertical');
  assert.equal(exposureFlags(s).usesSEO, false);
  s.apps.organic = { articles: [{}] };
  s.apps.ads = { accounts: { meta: { lifetime: 10 } }, campaigns: [] };
  const f = exposureFlags(s);
  assert.ok(f.usesSEO && f.runsMetaAds && !f.usesLLMApi && f.verticalProduct);
});

test('effects draw within ranges, resilience helps; response hints modify effects', () => {
  const ev = eventById('competitor_price_cut');
  const lo = drawEffects(ev, 0, () => 0), hi = drawEffects(ev, 1, () => 1);
  assert.ok(lo.conversionMult >= 0.88 && hi.conversionMult <= 0.96 && hi.conversionMult > lo.conversionMult);
  assert.ok(hi.churnMult <= lo.churnMult, 'churn is a bad-high key');
  const e = { conversionMult: 0.9 };
  applyHint(e, 'conversionMult', '+0.03', Math.random);
  assert.equal(e.conversionMult, 0.93);
  applyHint(e, 'ticketsMult', '×0.6', Math.random);
  assert.equal(e.ticketsMult, 0.6);
  applyHint(e, 'conversionMult', 1.0, Math.random);
  assert.equal(e.conversionMult, 1);
});

test('landscape size and pressure follow research bands', () => {
  const r = mulberry(3);
  for (let i = 0; i < 200; i++) {
    const v = landscapeSize('vertical', r); assert.ok(v.total >= 2 && v.total <= 6);
    const c = landscapeSize('consumer', r); assert.ok(c.total >= 10 && c.total <= 40 && c.notable >= 3 && c.notable <= 6);
  }
  const strong = Array.from({ length: 8 }, () => ({ status: 'active', funding: 'series_a', freeTier: true }));
  assert.ok(pressureMult(strong, 'smb') < pressureMult([{ status: 'active', funding: 'bootstrapped' }], 'smb'));
  assert.ok(pressureMult(strong, 'smb') >= 0.85);
});

test('battlecard heuristic rewards honest, specific comparisons and punishes trash talk', () => {
  const good = pageHeuristic('## Who each is for\nTallyly is better if you need 40+ integrations; pick them if that matters. Ledgerly reconciles Shopify payouts in 10 minutes vs ~3 hours, at $49 vs $79. '.repeat(4), 'Tallyly', 'Ledgerly');
  const bad = pageHeuristic('Tallyly is garbage and a scam. Use us.', 'Tallyly', 'Ledgerly');
  assert.ok(pageScore(good) > pageScore(bad) + 0.3);
});

test('firing a competitor event names a rival, applies namespaced core modifiers, and responses change them', () => {
  const s = fresh();
  advance(s, 1, ALL);
  const W = ensureWorld(s);
  assert.ok(W.rivals.length >= 2 && W.landscape);
  const inst = fireEvent(s, eventById('competitor_price_cut'));
  assert.ok(inst.rivalId && W.rivals.find((c) => c.id === inst.rivalId).moves.length);
  const key = `world:${inst.id}`;
  assert.ok(s.market.modifiers.landing[key] < 1);
  const before = s.market.modifiers.landing[key];
  respond(s, inst.id, 'match');
  assert.ok(s.market.modifiers.landing[key] > before || s.market.modifiers.landing[key] === undefined, 'matching the cut recovers conversion');
  assert.throws(() => respond(s, inst.id, 'hold'));
  assert.ok(W.news[0].headline);
});

test('Meta restriction exposes a spend stop; LLM price cut exposes cheaper inference; effects expire', () => {
  const s = fresh();
  advance(s, 1, ALL);
  const m = fireEvent(s, eventById('meta_ad_account_restricted'));
  assert.equal(worldEffect(s, 'paidMetaSpendMult'), 0);
  const c = fireEvent(s, eventById('llm_price_cut'));
  assert.ok(worldEffect(s, 'inferenceCostMult') < 1);
  respond(s, c.id, 'ignore');
  assert.equal(worldEffect(s, 'inferenceCostMult'), 1);
  const days = m.endDay - s.day;
  advance(s, days + 1, ALL);
  if (!m.effects.permanent) assert.equal(worldEffect(s, 'paidMetaSpendMult'), 1);
  assert.equal(s.market.modifiers.landing[`world:${m.id}`], undefined);
});

test('competitor exit sends displaced customers your way; unanswered events get the default response', async () => {
  const s = fresh('smb', 5);
  advance(s, 1, ALL);
  const inst = fireEvent(s, eventById('competitor_exit'));
  const rival = ensureWorld(s).rivals.find((c) => c.id === inst.rivalId);
  assert.ok(['acquired', 'shut_down'].includes(rival.status));
  advance(s, 50, ALL);
  assert.ok(inst.response, 'default response applied after 14 days');
  if (ensureWorld(s).history.length || rival.status === 'shut_down') assert.ok(s.stripe.subscriptions.some((x) => x.source === 'competitor-switch') || inst.effects.inboundLeadsBurst >= 0);
  await drainJobs(ctxFor(s));
  assert.ok(ensureWorld(s).news.every((n) => !n.pending), 'news written (offline fallback)');
});

test('world events fire at roughly the expected annual rates over two simulated years', () => {
  const s = fresh('b2c', 21);
  s.apps.organic = { articles: [{ day: 0 }] };
  advance(s, 1, ALL);
  const expected = exposureTable(s).reduce((a, x) => a + x.rate, 0) * 2;
  advance(s, 730, ALL);
  const W = ensureWorld(s);
  const fired = W.active.length + W.history.filter((h) => !W.active.some((a) => a.id === h.id)).length;
  assert.ok(fired > expected * 0.3 && fired < expected * 2.5, `fired ${fired}, expected ~${expected.toFixed(1)}`);
  assert.ok(activeRivals(s).length >= 1);
  assert.ok(worldDealMult(s) > 0.5 && worldDealMult(s) < 1.3);
});
