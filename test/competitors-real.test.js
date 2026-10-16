// Real competitor landscape: offline placeholders are labelled, a (mocked) web search becomes the landscape with
// signal-derived tiers, player-added competitors feed every consumer (prospects, world events, investors) and can be removed.
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
import { ensureWorld, fireEvent, eventById, activeRivals } from '../public/apps/marketworld/engine.js';
import { competitorsFor, discoverCompetitors, isReal, marketOverview, addPlayerCompetitor, removePlayerCompetitor, fetchCompetitorSite, signalTier, deriveSignals, shouldDiscover } from '../public/apps/marketworld/competitors.js';
import { competitionFor } from '../public/apps/sales/competition.js';
import { landscape as investorLandscape } from '../public/apps/fundraising/world.js';

const ALL = APPS.some((a) => a.id === 'market') ? APPS : [...APPS, market];
for (const [type, h] of Object.entries(market.jobs)) registerJob(type, h);

function fresh(seed = 21) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Bookkeeping reconciliation for Shopify stores';
  s.company.icp = 'Shopify merchants doing $1-10M GMV';
  return s;
}
const ctxFor = (s, over = {}) => ({ state: s, llm, save() {}, render() {}, ...over });
const stubRoot = (child = null) => ({ innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return child; }, querySelectorAll() { return []; }, closest() { return null; } });
const renderCompetitors = (s) => { const body = stubRoot(); market.render(stubRoot(body), { state: s, params: 'competitors', save() {}, act() {}, render() {}, navigate() {}, toast() {}, llm }); return body.innerHTML; };

// A web-search result in the schema the discovery prompt asks for (funding only when "found").
const webComp = (name, o = {}) => ({ name, url: `https://${name.toLowerCase().replace(/\W/g, '')}.com`, description: `${name} does reconciliation`, positioning: `${name} for merchants`, segment: 'SMB', pricingText: 'unknown', priceMonthlyUSD: null, freeTier: null, fundingStage: 'unknown', fundingTotalUSD: null, founded: null, employeesEstimate: null, customersEstimate: null, awareness: null, marketShare: null, momentum: 'flat', kind: 'direct', strengths: [], weaknesses: [], sources: [`https://g2.com/${name}`], confidence: 'medium', ...o });
const WEB = {
  category: 'E-commerce accounting', marketMaturity: 'mature', crowdedness: 'high', statusQuo: 'spreadsheets + a bookkeeper', statusQuoShare: 0.4, reasoning: 'Searched G2 and Shopify App Store.',
  competitors: [
    webComp('QuickBooks Online', { kind: 'incumbent', fundingStage: 'public', awareness: 0.9, marketShare: 0.3, pricingText: '$35/mo', priceMonthlyUSD: 35 }),
    webComp('A2X', { fundingStage: 'series_a', fundingTotalUSD: 12e6, awareness: 0.9, marketShare: 0.6 }), // over the band: clamped
    webComp('TinyRecon', { fundingStage: 'bootstrapped', awareness: null, marketShare: null }), // no estimate: band default
  ],
};
const fakeLlm = { ...llm, ask: async (o) => ({ mock: false, model: o.model, usd: 0.03, citations: [{ url: 'https://g2.com/x', title: 'G2' }], data: structuredClone(WEB), cached: false }) };

test('offline: the placeholder landscape is fictional and labelled, with a search action', async () => {
  const s = fresh();
  advance(s, 1, ALL);
  await drainJobs(ctxFor(s));
  assert.equal(isReal(s), false);
  assert.equal(ensureWorld(s).competitors.offline, true);
  assert.ok(competitorsFor(s).length > 0 && competitorsFor(s).every((c) => c.fictional && c.source === 'placeholder'));
  assert.equal(marketOverview(s).placeholder, true);
  const out = renderCompetitors(s);
  assert.match(out, /Offline: fictional stand-ins until web search runs/);
  assert.match(out, /Search the web for real competitors \(1\.5h\)/);
  assert.match(out, /Add your own competitor/);
});

test('a (mocked) web search becomes the landscape; tiers come from funding/size signals; unknown funding stays unknown', async () => {
  const s = fresh();
  advance(s, 1, ALL);
  const r = await discoverCompetitors(ctxFor(s, { llm: fakeLlm }), { reason: 'test' });
  assert.equal(r.offline, false);
  assert.ok(isReal(s));
  const by = Object.fromEntries(competitorsFor(s).map((c) => [c.name, c]));
  assert.deepEqual(Object.keys(by).sort(), ['A2X', 'QuickBooks Online', 'TinyRecon']);
  assert.equal(by['QuickBooks Online'].tier, 'big_player');
  assert.equal(by.A2X.tier, 'well_funded');
  assert.equal(by.TinyRecon.tier, 'small_tool');
  assert.ok(by.A2X.awareness <= 0.6, 'web estimate clamped into the well-funded band');
  assert.ok(by['QuickBooks Online'].awareness > by.A2X.awareness && by.A2X.awareness > by.TinyRecon.awareness, 'big > funded > small');
  assert.equal(by.TinyRecon.fundingTotalUSD, null, 'never fabricate funding');
  assert.equal(by.TinyRecon.estimate, 'signals');
  assert.ok(competitorsFor(s).every((c) => c.source === 'web'));
  assert.ok(competitorsFor(s).reduce((a, c) => a + c.marketShare, 0) + ensureWorld(s).competitors.statusQuoShare <= 1.0001);
  const W = ensureWorld(s);
  assert.equal(W.rivals.filter((x) => x.real).length, 3, 'real rivals replace the placeholders for world events');
  assert.equal(W.competitors.customerType, null);
  assert.match(renderCompetitors(s), /Your real competitive set/);
  assert.doesNotMatch(renderCompetitors(s), /fictional stand-ins until/);
  // Customer type change → re-run; unchanged → no re-run.
  W.discovery.day = s.day - 1;
  assert.equal(shouldDiscover(s), false);
  s.company.customerType = 'ecommerce';
  assert.equal(shouldDiscover(s), true);
  // A failed re-run keeps the real landscape (stale) instead of reverting to placeholders.
  await discoverCompetitors(ctxFor(s), { reason: 'idea_changed' });
  assert.ok(isReal(s) && W.competitors.stale);
});

test('signal tiers: deterministic and ordered big > well-funded > small', () => {
  const big = deriveSignals({ fundingStage: 'public' }), mid = deriveSignals({ fundingStage: 'series_a' }), small = deriveSignals({ fundingStage: 'unknown' });
  assert.ok(big.awareness > mid.awareness && mid.awareness > small.awareness);
  assert.ok(big.marketShare > mid.marketShare && mid.marketShare > small.marketShare);
  assert.equal(signalTier({ employeesEstimate: 800 }), 'big_player');
  assert.equal(signalTier({ fundingTotalUSD: 15e6 }), 'well_funded');
  assert.deepEqual(deriveSignals({ fundingStage: 'seed', founded: 2025 }), deriveSignals({ fundingStage: 'seed', founded: 2025 }));
  assert.equal(deriveSignals({ fundingStage: 'seed', founded: 2025 }).momentum, 'rising');
});

test('player-added competitor: used by prospects (competitionFor), investors, and picked by competitor world events; removable', async () => {
  const s = fresh(5);
  advance(s, 1, ALL);
  await discoverCompetitors(ctxFor(s, { llm: fakeLlm }), { reason: 'test' });
  const c = addPlayerCompetitor(s, { name: 'MegaBooks', url: 'megabooks.io', description: 'All-in-one accounting suite', segment: 'SMBs', price: '$79/mo', fundingStage: 'public', raised: '' });
  assert.equal(c.source, 'player');
  assert.equal(c.tier, 'big_player');
  assert.equal(c.priceMonthlyUSD, 79);
  assert.equal(c.fundingTotalUSD, null, 'blank raised stays unknown');
  assert.equal(c.url, 'https://megabooks.io');
  assert.ok(competitorsFor(s).some((x) => x.id === c.id));
  assert.ok(competitorsFor(s).reduce((a, x) => a + x.marketShare, 0) + ensureWorld(s).competitors.statusQuoShare <= 1.0001, 'shares rescaled');
  // Prospects: some use it today or know it.
  let seen = 0, uses = 0;
  for (let i = 0; i < 300; i++) {
    const comp = competitionFor(s, { audience: 'prospect', seed: `p${i}` });
    if (comp.names.includes('MegaBooks')) seen++;
    if (comp.uses?.name === 'MegaBooks') uses++;
  }
  assert.ok(seen > 30, `prospects know it: ${seen}`);
  assert.ok(uses > 0, 'some prospects use it today');
  assert.ok(investorLandscape(s).competitors.some((x) => x.name === 'MegaBooks'), 'investor landscape includes it');
  // World events: it is an active rival and can be picked.
  const W = ensureWorld(s);
  const rival = activeRivals(s).find((r) => r.player && r.name === 'MegaBooks');
  assert.ok(rival);
  const inst = fireEvent(s, eventById('competitor_price_cut'), { rival });
  assert.equal(inst.rivalId, rival.id);
  let picked = false;
  for (let i = 0; i < 60 && !picked; i++) { const x = fireEvent(s, eventById('competitor_feature_copy')); picked = x && W.rivals.find((r) => r.id === x.rivalId)?.player; }
  assert.ok(picked, 'the random picker can choose the player-added rival');
  // Rediscovery keeps it.
  await discoverCompetitors(ctxFor(s, { llm: fakeLlm }), { reason: 'manual' });
  assert.ok(W.rivals.some((r) => r.player && r.name === 'MegaBooks'));
  assert.ok(competitorsFor(s).some((x) => x.name === 'MegaBooks'));
  assert.match(renderCompetitors(s), /MegaBooks/);
  // Remove.
  assert.equal(removePlayerCompetitor(s, c.id), true);
  assert.ok(!competitorsFor(s).some((x) => x.name === 'MegaBooks'));
  assert.ok(!W.rivals.some((r) => r.name === 'MegaBooks'));
  for (let i = 0; i < 100; i++) assert.ok(!competitionFor(s, { audience: 'prospect', seed: `p${i}` }).names.includes('MegaBooks'));
});

test('offline: a player-added competitor sits next to the placeholders and feeds the same consumers', () => {
  const s = fresh(9);
  advance(s, 1, ALL);
  const c = addPlayerCompetitor(s, { name: 'Shopkeep Ledger', fundingStage: 'seed', price: '29' });
  const list = competitorsFor(s);
  assert.ok(list.some((x) => x.fictional) && list.some((x) => x.id === c.id));
  assert.equal(list.filter((x) => x.name === 'Shopkeep Ledger').length, 1, 'no duplicate via the rival mirror');
  assert.equal(c.pricingText, '$29/mo');
  assert.ok(activeRivals(s).some((r) => r.player));
});

test('adding by URL fills blanks from /api/site (stubbed fetch); a failed fetch returns null', async () => {
  const fetchImpl = async (u, opts) => ({ ok: true, json: async () => ({ url: JSON.parse(opts.body).url, title: 'Recko', description: 'Automated payout reconciliation for Shopify', headings: ['Pricing'], text: 'Starter $39/month. Free plan for tiny stores.' }) });
  const site = await fetchCompetitorSite('recko.app', { fetchImpl });
  assert.equal(site.url, 'https://recko.app');
  assert.equal(site.priceMonthlyUSD, 39);
  const s = fresh(3);
  const c = addPlayerCompetitor(s, { name: 'Recko', url: 'recko.app' }, site);
  assert.equal(c.description, 'Automated payout reconciliation for Shopify');
  assert.equal(c.priceMonthlyUSD, 39);
  assert.equal(c.confidence, 'medium');
  assert.equal(await fetchCompetitorSite('x.com', { fetchImpl: async () => { throw new Error('offline'); } }), null);
});
