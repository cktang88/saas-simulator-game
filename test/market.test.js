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
import { acquire } from '../public/apps/growth/acquire.js';

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

test('world effects reach the ads and organic engines', async () => {
  const { createAccount, createCampaign, createAdSet, createAd, addCreative, ensureAds, deliveryState } = await import('../public/apps/growth/adsEngine.js');
  const { auctionDay, searchDay } = await import('../public/apps/growth/delivery.js');
  const s = fresh('b2c', 31);
  s.apps.product.features.forEach((f) => (f.ai.enabled = false));
  const acct = createAccount(s, 'meta');
  acct.payment = 'card_1'; acct.pixel = true;
  const c = createCampaign(s, { p: 'meta', objective: 'sales' });
  const set = createAdSet(s, { campaignId: c.id, budget: 40, optimization: 'trial' });
  const cr = addCreative(s, { format: 'static', hook: 'h', skill: 0.5 }); cr.status = 'approved';
  createAd(s, { adsetId: set.id, creativeId: cr.id });
  advance(s, 2, ALL);
  const inst = fireEvent(s, eventById('meta_ad_account_restricted'));
  assert.equal(deliveryState(s, set).why, 'Account restricted');
  const before = ensureAds(s).rows.length;
  advance(s, 2, ALL);
  assert.equal(ensureAds(s).rows.filter((r) => r.d > s.day - 2).reduce((a, r) => a + r.sp, 0), 0, 'no Meta spend while restricted');
  assert.ok(ensureAds(s).rows.length >= before);
  respond(s, inst.id, 'appeal');
  // CPM/CPC scale with paidCpcMult
  const base = { platform: 'meta', model: 'b2c', date: new Date('2027-04-10T12:00:00Z'), budget: 100, audience: { type: 'broad', size: 3e6 }, placement: 'advantage', objective: 'sales', optimization: 'trial', bid: {}, status: 'active', imps6: 0, landingRate: 0.03, priceMonthly: 10, ads: [{ id: 'a', q: 0.5, format: 'static', lifeImps: 0 }] };
  const r1 = auctionDay({ ...base, rand: mulberry(1) }), r2 = auctionDay({ ...base, costMult: 1.2, rand: mulberry(1) });
  assert.ok(Math.abs(r2.cpm / r1.cpm - 1.2) < 0.01);
  const kw = [{ text: 'x', match: 'exact', relevance: 0.8 }];
  const g1 = searchDay({ platform: 'google', model: 'b2c', date: base.date, budget: 50, keywords: kw, q: 0.5, landingRate: 0.03, status: 'active', rand: mulberry(2) });
  const g2 = searchDay({ platform: 'google', model: 'b2c', date: base.date, budget: 50, keywords: kw, q: 0.5, landingRate: 0.03, status: 'active', costMult: 1.25, rand: mulberry(2) });
  assert.ok(Math.abs(g2.cpc / g1.cpc - 1.25) < 0.01);
  // A core update multiplies SEO visits in the Organic engine and is no longer double-counted on landing.
  const { publishArticle } = await import('../public/apps/growth/organicEngine.js');
  const s2 = fresh('smb', 41);
  publishArticle(s2, { title: 't', query: 'shopify payout reconciliation guide', body: 'x', judge: { quality: 0.9, slop: 0, informational: false, citable: 0, results: [], mock: true } });
  s2.apps.organic.articles[0].day = -400; s2.apps.organic.articles[0].position = 1;
  advance(s2, 1, ALL);
  const ev = fireEvent(s2, eventById('google_core_update'));
  ev.effects.organicTrafficMult = 0.5;
  assert.equal(s2.market.modifiers.landing[`world:${ev.id}`], undefined, 'organic shock not on landing');
  const v0 = s2.apps.organic.articles[0].visits;
  advance(s2, 1, ALL);
  const shocked = s2.apps.organic.articles[0].visits - v0;
  ev.effects.organicTrafficMult = 1;
  const v1 = s2.apps.organic.articles[0].visits;
  advance(s2, 1, ALL);
  const normal = s2.apps.organic.articles[0].visits - v1;
  assert.ok(Math.abs(shocked / normal - 0.5) < 0.05, `${shocked} vs ${normal}`);
});

// ---------------- real competitors ----------------
import { knownCompetitors, competitionBrief, competitorsFor, competitivePressure, discoverCompetitors, ideaHash, normalizeDiscovery, isReal } from '../public/apps/marketworld/competitors.js';

const realComp = (name, o = {}) => ({ id: `rc_${name}`, name, url: `https://${name.toLowerCase()}.com`, description: '', positioning: `${name} for teams`, segment: 'SMB', pricingText: '$49/mo', priceMonthlyUSD: 49, freeTier: false, fundingStage: 'seed', fundingTotalUSD: null, founded: 2020, employeesEstimate: null, customersEstimate: null, awareness: 0.02, marketShare: 0.005, momentum: 'flat', kind: 'direct', strengths: ['fast'], weaknesses: ['pricey'], sources: [], confidence: 'medium', ...o });
function withReal(s, list, extra = {}) {
  const W = ensureWorld(s);
  W.competitors = { offline: false, mock: false, ideaHash: ideaHash(s), discoveredDay: s.day, citations: [], ...normalizeDiscovery({ category: 'X', marketMaturity: 'growing', crowdedness: 'medium', statusQuo: 'spreadsheets', statusQuoShare: 0, reasoning: '', competitors: list, ...extra }) };
  return W;
}

test('knownCompetitors: obscure markets → almost nobody mentions anyone; deterministic per seed', () => {
  const s = fresh();
  withReal(s, ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff'].map((n) => realComp(n)));
  let mentions = 0;
  for (let i = 0; i < 400; i++) mentions += knownCompetitors(s, { audience: 'prospect', seed: `p${i}` }).length;
  assert.ok(mentions / 400 < 0.2, `avg ${mentions / 400}`);
  for (let i = 0; i < 400; i++) mentions += knownCompetitors(s, { audience: 'investor', seed: `i${i}` }).length;
  assert.ok(mentions / 800 < 0.25);
  const a = knownCompetitors(s, { audience: 'prospect', seed: 'persona-7' }), b = knownCompetitors(s, { audience: 'prospect', seed: 'persona-7' });
  assert.deepEqual(a.map((x) => [x.competitor.name, x.relation]), b.map((x) => [x.competitor.name, x.relation]));
  const seedBefore = s.seed;
  knownCompetitors(s, { audience: 'customer', seed: 'c1' });
  assert.equal(s.seed, seedBefore, 'sampling never touches the simulation RNG');
});

test('knownCompetitors: a dominant, well-funded leader is used or known by most prospects and investors', () => {
  const s = fresh();
  withReal(s, [realComp('BigCo', { awareness: 0.85, marketShare: 0.55, fundingStage: 'series_b_plus', fundingTotalUSD: 120e6 }), realComp('Tiny')], { statusQuoShare: 0.3 });
  let uses = 0, knows = 0, inv = 0, sq = 0;
  for (let i = 0; i < 500; i++) {
    const k = knownCompetitors(s, { audience: 'prospect', seed: `p${i}` });
    const big = k.find((x) => x.competitor.name === 'BigCo');
    if (big?.relation === 'uses') uses++;
    if (big) knows++;
    if (k.some((x) => x.competitor.statusQuo)) sq++;
    if (knownCompetitors(s, { audience: 'investor', seed: `i${i}` }).some((x) => x.competitor.name === 'BigCo')) inv++;
  }
  assert.ok(uses / 500 > 0.45 && uses / 500 < 0.65, `uses ${uses / 500}`);
  assert.ok(knows / 500 > 0.8, `knows ${knows / 500}`);
  assert.ok(inv / 500 > 0.8, `investors ${inv / 500}`);
  assert.ok(sq / 500 > 0.2 && sq / 500 < 0.4, `status quo ${sq / 500}`);
  const brief = competitionBrief(s, knownCompetitors(s, { audience: 'prospect', seed: 'p1' }));
  assert.equal(typeof brief, 'string');
  assert.ok(competitivePressure(s) < 1, 'a dominant funded leader makes switching harder');
});

test('discovery normalizes shares to ≤ 1 and dedupes', () => {
  const n = normalizeDiscovery({ statusQuoShare: 0.6, competitors: [realComp('A', { marketShare: 0.5 }), realComp('A', { marketShare: 0.5 }), realComp('B', { marketShare: 0.4 })] });
  assert.equal(n.list.length, 2);
  assert.ok(n.list.reduce((a, c) => a + c.marketShare, 0) + n.statusQuoShare <= 1.0001);
});

test('offline discovery keeps the fictional landscape, flagged, and never invents real companies', async () => {
  const s = fresh();
  advance(s, 1, ALL);
  const W = ensureWorld(s);
  assert.ok(W.discovery?.pending || W.competitors, 'idea change enqueued a discovery job');
  assert.ok(s.jobs.some((j) => j.type === 'world:competitors') || W.competitors);
  await drainJobs(ctxFor(s));
  assert.equal(W.competitors.offline, true);
  assert.equal(isReal(s), false);
  assert.ok(competitorsFor(s).every((c) => c.fictional));
  // Debounce: same idea → no new job; changed idea → one new job.
  advance(s, 1, ALL);
  assert.ok(!s.jobs.some((j) => j.type === 'world:competitors' && j.status === 'pending'));
  s.company.oneLiner = 'Payroll for dental clinics';
  advance(s, 1, ALL);
  assert.equal(s.jobs.filter((j) => j.type === 'world:competitors' && j.status === 'pending').length, 1);
});

test('live discovery (mocked web model) replaces the landscape; world events pin to real rivals as simulated', async () => {
  const s = fresh();
  advance(s, 1, ALL);
  const fake = { ...llm, ask: async (o) => ({ mock: false, model: o.model, usd: 0.03, citations: [{ url: 'https://g2.com/x', title: 'G2' }], data: { category: 'Shopify accounting', marketMaturity: 'mature', crowdedness: 'high', statusQuo: 'spreadsheets + bookkeeper', statusQuoShare: 0.5, reasoning: 'r', competitors: [realComp('A2X', { awareness: 0.5, marketShare: 0.2, fundingStage: 'bootstrapped' }), realComp('Synder', { awareness: 0.2, marketShare: 0.05 })] } }) };
  const r = await discoverCompetitors({ state: s, llm: fake }, { reason: 'test' });
  assert.equal(r.offline, false);
  assert.ok(isReal(s));
  const W = ensureWorld(s);
  assert.ok(W.rivals.filter((x) => x.real).length === 2);
  const inst = fireEvent(s, eventById('competitor_price_cut'));
  assert.ok(W.rivals.find((x) => x.id === inst.rivalId).real);
  assert.ok(W.news[0].simulated);
  await drainJobs(ctxFor(s));
  assert.match(W.news.find((n) => n.instId === inst.id).headline, /^Simulated: /);
});

// ---------------- realism review fixes (G7, G15) ----------------
import { effectiveRate, decayFactor } from '../public/apps/marketworld/engine.js';

test('G7: one AI feature is not a "wrapper"; horizontal all-AI without integrations is', () => {
  const s = fresh('b2c');
  s.apps.product.features = [{ id: 'a', title: 'AI summaries', status: 'shipped', ai: { enabled: true } }];
  s.company.oneLiner = 'AI note-taking app for students';
  assert.equal(aiDependence(s), 'wrapper');
  s.apps.product.features.push({ id: 'b', title: 'Google Drive sync', status: 'shipped', ai: { enabled: true } });
  assert.equal(aiDependence(s), 'core', 'integrations are a moat');
  s.company.oneLiner = 'AI bookkeeping for dental clinics';
  s.apps.product.features = [{ id: 'a', title: 'AI categorization', status: 'shipped', ai: { enabled: true } }];
  assert.notEqual(aiDependence(s), 'wrapper');
});

test('G7: sherlocking capped, entrants slow in crowded niches, effects fade, world landing floor ≥ 0.75', () => {
  const s = fresh('b2c', 3);
  s.company.oneLiner = 'AI note-taking app for students';
  s.apps.product.features = [{ id: 'a', title: 'AI summaries', status: 'shipped', ai: { enabled: true } }];
  advance(s, 1, ALL);
  const p = { model: 'b2c', stage: 'traction', path: 'indie', aiDependence: 'wrapper', flags: { horizontalProduct: true } };
  assert.ok(effectiveRate(s, eventById('ai_lab_feature_overlap'), p, 5) <= 0.3);
  const entr = eventById('competitor_new_entrant');
  assert.ok(effectiveRate(s, entr, p, 30) < effectiveRate(s, entr, p, 4) * 0.5);
  const inst = { startDay: 0, endDay: 100, effects: {} };
  assert.equal(decayFactor(inst, 0), 1);
  assert.equal(decayFactor(inst, 50), 0.5);
  for (let i = 0; i < 6; i++) fireEvent(s, eventById(['competitor_price_cut', 'ai_lab_feature_overlap', 'competitor_feature_copy', 'negative_public_review', 'competitor_new_entrant', 'competitor_raise'][i]));
  advance(s, 1, ALL);
  const world = Object.entries(s.market.modifiers.landing).filter(([k]) => k.startsWith('world:')).reduce((a, [, v]) => a * v, 1);
  assert.ok(world >= 0.749, `world landing ${world}`);
});

test('G15: Meta restriction risk is concentrated in new accounts and spend ramps', () => {
  const s = fresh('b2c', 4);
  s.apps.ads = { accounts: { meta: { createdDay: 0, lifetime: 100 } }, campaigns: [], rows: [] };
  const ev = eventById('meta_ad_account_restricted');
  const p = { model: 'b2c', stage: 'launched', path: 'indie', aiDependence: 'none', flags: { runsMetaAds: true, verifiedBusiness: true } };
  const young = effectiveRate(s, ev, p, 5);
  s.day = 400;
  const seasoned = effectiveRate(s, ev, p, 5);
  assert.ok(young >= seasoned * 5, `${young} vs ${seasoned}`);
});

test('competitor exit burst scales with the rival\'s share and your visibility', async () => {
  const { exitBurstSize } = await import('../public/apps/marketworld/engine.js');
  const s = fresh('smb', 8);
  s.founder.network = { friends: 10, linkedin: 50, x: 0, newsletter: 0 };
  const W = ensureWorld(s);
  W.competitors = { offline: false, list: [{ id: 'rc_obscure', marketShare: 0.003 }, { id: 'rc_big', marketShare: 0.2 }] };
  const tinyVsObscure = exitBurstSize(s, { realId: 'rc_obscure' }, 60);
  assert.ok(tinyVsObscure < 2, `${tinyVsObscure}`);
  s.founder.network = { friends: 200, linkedin: 20000, x: 30000, newsletter: 10000 };
  for (let i = 0; i < 300; i++) acquire(s, { source: 'direct', n: 1, forceConvert: 0.9 });
  s.stripe.subscriptions.forEach((x) => (x.status = 'active'));
  const visibleVsBig = exitBurstSize(s, { realId: 'rc_big' }, 60);
  assert.ok(visibleVsBig > 20 * tinyVsObscure, `${visibleVsBig} vs ${tinyVsObscure}`);
});
