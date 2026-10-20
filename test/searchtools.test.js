// Search & AI visibility: tools reveal information (Search Console truth with lag, third-party estimate error),
// subscriptions are real bills, and GEO is share of voice across prompts/engines driven by earned mentions, with
// volatility, backfiring shortcuts, a null llms.txt and separated operator tiers. Short horizons, few seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import { keywordMetrics } from '../public/apps/growth/organicModel.js';
import { ensureOrganic, publishArticle } from '../public/apps/growth/organicEngine.js';
import { stackRows } from '../public/apps/money/spend.js';
import * as G from '../public/apps/searchtools/geo.js';
import * as TL from '../public/apps/searchtools/tools.js';
import { SEO_DYN, ensureSeo } from '../public/apps/growth/seoDynamics.js';

const ORG_APPS = APPS.filter((a) => ['organic', 'searchtools'].includes(a.id));
const GEO_APP = APPS.filter((a) => a.id === 'searchtools');

function fresh(seed = 7, model = 'smb') {
  const s = newState({ companyName: 'Ledgerbird', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  s.company.website = { source: 'paste', title: 'x', text: 'x' };
  s.company.oneLiner = 'Bookkeeping automation that reconciles Shopify payouts into QuickBooks';
  s.company.icp = 'Shopify store owners doing their own books';
  s.market.flags = { fixedDemand: 1 };
  G.ensureSearch(s).robots.blocked = Object.fromEntries(Object.keys(G.ensureSearch(s).robots.blocked).map((b) => [b, false]));
  return s;
}
const article = (s, title, query, q = 0.85) => publishArticle(s, { title, query, body: 'x', judge: { quality: q, slop: 0, citable: 0, informational: !/vs|alternative|best/.test(query) } });

// ---------------- Search Console ----------------

test('Search Console shows the true per-page clicks, ~3 days behind, only after verification', () => {
  const s = fresh();
  ensureOrganic(s);
  const a = article(s, 'A2X vs Synder for Shopify payouts', 'a2x vs synder for small shopify stores');
  // A page that ranks (indexed, lucky draws so the monthly drift keeps it near the top) earns impressions once ramped.
  Object.assign(a, { stuck: false, indexLag: 0, luck: [0, 0], position: 2 });
  const noindexRate = SEO_DYN.noindex.perYear; SEO_DYN.noindex.perYear = 0; // a deploy accident is tested in seo-dynamics.test.js
  assert.equal(TL.gscReport(s).verified, false, 'no data without verifying');
  TL.subscribe(s, 'gsc');
  const truth = [];
  for (let i = 0; i < 160; i++) {
    const before = a.visits;
    advance(s, 1, ORG_APPS);
    truth.push({ d: G.ensureSearch(s).gscHist.at(-1).d, clicks: a.visits - before });
  }
  const r = TL.gscReport(s, { days: 28 });
  assert.equal(r.through, s.day - 3, 'data ends 3 days ago');
  const row = r.rows.find((x) => x.id === a.id);
  assert.ok(row, 'the ranking page has impressions');
  const expected = truth.filter((t) => t.d >= r.from && t.d <= r.through).reduce((x, t) => x + t.clicks, 0);
  assert.ok(Math.abs(row.clicks - expected) < 0.05 * Math.max(1, expected) + 0.05, `GSC clicks ${row.clicks} = true clicks ${expected}`);
  const recent = truth.filter((t) => t.d > r.through).reduce((x, t) => x + t.clicks, 0);
  assert.ok(recent > 0, 'the last 3 days happened but are not reported yet');
  assert.ok(row.position >= 1 && row.position < 20 && row.ctr > 0 && row.ctr < 0.5);
  // A page that isn't ranking yet shows no impressions-based keyword insight beyond "no data".
  const k = TL.keywordInsight(s, 'a2x vs synder for small shopify stores');
  assert.equal(k.source, 'gsc');
  assert.equal(k.volume, undefined, 'GSC never shows market volume');
  assert.equal(ensureSeo(s).tech.gsc, true, 'the core SEO model sees the Search Console subscription');
  SEO_DYN.noindex.perYear = noindexRate;
});

// ---------------- Keyword tools ----------------

test('no keyword tool = no volume or difficulty; Planner = ranges only; Ahrefs/Semrush = estimates', () => {
  const s = fresh();
  const q = 'reconcile shopify payouts quickbooks';
  const none = TL.keywordInsight(s, q);
  assert.equal(none.source, null);
  assert.equal(none.volume, undefined); assert.equal(none.kd, undefined);
  TL.subscribe(s, 'planner');
  const pl = TL.keywordInsight(s, q);
  assert.equal(pl.source, 'planner'); assert.match(pl.range, /\d/); assert.equal(pl.kd, undefined);
  TL.subscribe(s, 'ahrefs_lite');
  const ah = TL.keywordInsight(s, q);
  assert.equal(ah.source, 'ahrefs'); assert.ok(Number.isFinite(ah.volume) && Number.isFinite(ah.kd));
  assert.match(TL.keywordLabel(s, q), /Ahrefs/);
});

test('third-party estimates deviate from the truth within the research band (median ~50% Ahrefs, ~68% Semrush), fixed per seed', () => {
  const s = fresh(11);
  const qs = Array.from({ length: 300 }, (_, i) => `shopify bookkeeping tool ${i} payouts`);
  const med = (eng) => {
    const errs = qs.map((q) => { const t = keywordMetrics(q, 'smb').volume; const e = TL.estimateKeyword(s, eng, q); return e.zero ? null : Math.abs(e.volume / t - 1); }).filter((x) => x != null).sort((a, b) => a - b);
    return errs[Math.floor(errs.length / 2)];
  };
  const ah = med('ahrefs'), se = med('semrush');
  assert.ok(ah > 0.35 && ah < 0.65, `Ahrefs median error ${ah}`);
  assert.ok(se > 0.5 && se < 0.85, `Semrush median error ${se}`);
  assert.ok(se > ah, 'Semrush misses more than Ahrefs');
  assert.deepEqual(TL.estimateKeyword(s, 'ahrefs', qs[0]), TL.estimateKeyword(s, 'ahrefs', qs[0]), 'deterministic');
  const other = fresh(12);
  assert.notEqual(TL.estimateKeyword(other, 'ahrefs', qs[0]).volume, TL.estimateKeyword(s, 'ahrefs', qs[0]).volume, 'different company seed, different estimate');
  // Small sites are overestimated several-fold.
  const small = [...Array(60)].map((_, i) => TL.estimateTraffic(s, 'semrush', `site${i}`, 200) / 200).sort((a, b) => a - b)[30];
  assert.ok(small > 2, `small-site overestimate median ${small}x`);
});

// ---------------- Subscriptions ----------------

test('a paid tool is a real recurring bank charge and shows in the spend audit; cancelling stops it', () => {
  const s = fresh();
  const n0 = s.bank.txns.length;
  const r = TL.subscribe(s, 'ahrefs_lite');
  assert.ok(r.ok && r.hoursCost > 0);
  assert.equal(s.bank.txns.at(-1).amount, -129);
  assert.equal(s.bank.txns.at(-1).category, 'software');
  const rec = s.recurring.find((x) => x.vendor === 'Ahrefs' && x.active);
  assert.ok(rec && rec.amount === 129);
  assert.ok(stackRows(s).some((x) => x.vendor === 'Ahrefs'), 'listed in the stack audit');
  advance(s, 32, []);
  assert.equal(s.bank.txns.slice(n0).filter((t) => t.counterparty === 'Ahrefs').length, 2, 'billed again a month later');
  TL.unsubscribe(s, 'ahrefs_lite');
  assert.equal(rec.active, false);
  const free = TL.subscribe(s, 'gsc');
  assert.equal(free.usdCost, 0);
  assert.equal(TL.subscribe(s, 'brand_radar').ok, false, 'Brand Radar needs an Ahrefs plan');
});

// ---------------- GEO ----------------

function addListicles(s, n) { for (let i = 0; i < n; i++) G.ensureSearch(s).mentions.push({ id: `l${i}`, kind: 'listicle', day: s.day, w: 1 }); }

test('share of voice rises with third-party mentions and comparison pages; llms.txt does nothing; blocking OAI-SearchBot hurts ChatGPT', () => {
  const s = fresh();
  ensureOrganic(s);
  const v0 = G.trueVisibility(s).v;
  addListicles(s, 5);
  const v1 = G.trueVisibility(s).v;
  article(s, 'Ledgerbird vs A2X: pricing and limits', 'a2x alternative', 0.9);
  article(s, 'Best Synder alternatives', 'synder alternatives', 0.9);
  const v2 = G.trueVisibility(s).v;
  assert.ok(v1 > v0 + 0.05 && v2 > v1, `${v0} → ${v1} → ${v2}`);
  G.addLlmsTxt(s);
  assert.equal(G.trueVisibility(s).v, v2, 'llms.txt: no effect');
  const chat = G.trueVisibility(s).byEngine.chatgpt;
  G.setRobots(s, 'OAI-SearchBot', false);
  assert.ok(G.trueVisibility(s).byEngine.chatgpt < chat * 0.5, 'retrieval-based ChatGPT answers lose you');
});

test('answers are volatile run to run; visibility % over many runs is the stable metric; training engines lag', () => {
  const s = fresh();
  addListicles(s, 6);
  const pr = { text: 'best tool to reconcile shopify payouts in quickbooks', kind: 'generic' };
  const lists = new Set(); let you = 0;
  for (let i = 0; i < 200; i++) { const x = G.runPrompt(s, 'perplexity', pr); lists.add(`${x.you}|${x.rivals.join(',')}`); you += x.you; }
  assert.ok(lists.size >= 8, `${lists.size} distinct answer lists in 200 runs`);
  const p = G.mentionProb(s, 'perplexity', 'generic');
  assert.ok(Math.abs(you / 200 - p) < 0.2, `visibility ${you / 200} ≈ p ${p} (± prompt fit)`);
  // ChatGPT's generic prompts mostly answer from training data: a brand-new brand is missing until the model catches up.
  assert.ok(G.mentionProb(s, 'chatgpt', 'generic') < G.mentionProb(s, 'perplexity', 'generic') * 0.5, 'training lag');
  assert.ok(G.mentionProb(s, 'chatgpt', 'comparison') > G.mentionProb(s, 'chatgpt', 'generic'), 'comparison prompts trigger retrieval');
});

test('vanity prompts always name you and measure nothing; the prompt set is graded on buyer intent', () => {
  const s = fresh();
  addListicles(s, 1);
  const vanity = G.savePromptSet(s, { texts: ['what is Ledgerbird', 'is Ledgerbird good', 'Ledgerbird reviews', 'tell me about Ledgerbird'] });
  const buyer = G.savePromptSet(fresh(), { texts: ['best tool to reconcile shopify payouts in quickbooks', 'a2x vs synder for a small shopify store', 'cheapest bookkeeping app for shopify sellers', 'synder alternatives for shopify payouts', 'how do i automate shopify bookkeeping in quickbooks', 'which software syncs shopify payouts to quickbooks', 'best quickbooks integration for shopify stores', 'a2x alternatives for a solo shopify founder', 'what is the best way to reconcile shopify fees in quickbooks', 'top bookkeeping tools for shopify stores 2026'] });
  assert.ok(vanity.quality < 0.15 && buyer.quality > 0.6, `vanity ${vanity.quality} vs buyer ${buyer.quality}`);
  const smp = G.manualTest(s, { runs: 5, engines: ['perplexity', 'claude'] }).sample;
  const sv = G.shareOfVoice(smp.names, smp.rows);
  assert.ok(sv.visibility > 0.6, `vanity "visibility" ${sv.visibility}`);
  assert.ok(G.trueVisibility(s).v < 0.15, 'while real buyer visibility is tiny');
});

test('astroturfing Reddit backfires: caught, banned, negative mentions, traceable cost', () => {
  for (const seed of [1, 2, 3]) {
    const s = fresh(seed);
    s.apps.channels = { reviews: { count: 20 }, aiSearch: { mentions: 0, pitches: [] } }; // deterministic signal (no list churn)
    const clean = structuredClone(s);
    for (let i = 0; i < 4; i++) G.astroturf(s);
    assert.ok(G.trueVisibility(s).v > G.trueVisibility(clean).v, 'it looks like it works at first');
    advance(s, 182, GEO_APP);
    advance(clean, 182, GEO_APP);
    const T = G.ensureSearch(s);
    assert.ok(T.community.fakes.every((f) => !f.live) && T.community.bannedDay != null, `seed ${seed}: caught within 6 months`);
    assert.ok(G.trueVisibility(s).v < G.trueVisibility(clean).v, `seed ${seed}: worse off than not doing it`);
    assert.ok(s.mistakes.some((m) => m.id === 'reddit_astroturf' && m.cost.reputation > 0));
    assert.equal(G.astroturf(s).ok, false, 'banned');
  }
});

test('undisclosed paid placement can trigger a legal bill; wrong facts after a price change cost conversion until fixed at the source', () => {
  let caught = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = fresh(seed);
    G.buyPlacement(s, { site: 'Top 10 Shopify bookkeeping apps', disclosed: false });
    advance(s, 365, GEO_APP);
    if ((s.mistakes ?? []).some((m) => m.id === 'paid_listicle_undisclosed')) { caught++; assert.ok(s.bank.txns.some((t) => t.category === 'legal' && t.amount <= -6000)); }
  }
  assert.ok(caught >= 1, `${caught}/6 caught within a year`);
  // Wrong facts
  const s = fresh(4);
  addListicles(s, 4);
  s.apps.channels = { reviews: { count: 5 }, aiSearch: { mentions: 0, pitches: [] } };
  advance(s, 1, GEO_APP);
  s.plans[0].price += 10;
  let n = 0;
  while (!G.ensureSearch(s).facts.wrong.length && n++ < 10) { s.plans[0].price += 1; advance(s, 1, GEO_APP); }
  const f = G.ensureSearch(s).facts.wrong[0];
  assert.ok(f, 'stale pricing appears');
  const conv = G.aiConvMult(s);
  assert.ok(conv < 3.5, 'AI visitors convert worse while answers quote the old price');
  advance(s, 50, GEO_APP);
  assert.ok(s.mistakes.some((m) => m.id === 'ai_wrong_facts'), 'unfixed for weeks: traceable cost');
  for (const src of [...f.open]) G.fixFactSource(s, f.id, src);
  G.fixFactSource(s, f.id, 'facts_page');
  advance(s, 40, GEO_APP);
  assert.ok(G.wrongFactShare(s) < 0.8 && G.wrongFactShare(s) > 0, 'search engines corrected, training-data answers still wrong');
  assert.ok(G.aiConvMult(s) > conv);
});

test('content optimizer: a brief followed blindly reads samey and ranks lower; used as a checklist it helps a little', () => {
  const s = fresh();
  ensureOrganic(s);
  assert.equal(TL.makeBrief(s, 'shopify payouts quickbooks').ok, false, 'needs a tool');
  TL.subscribe(s, 'surfer');
  advance(s, 1, GEO_APP);
  const b = TL.makeBrief(s, 'shopify payouts quickbooks').brief;
  const stuffed = Array(Math.round(b.targetWords / 20)).fill(b.terms.join(' ') + ' and more words here').join(' ');
  assert.equal(TL.scoreDraft(s, 'shopify payouts quickbooks', stuffed).samey, true);
  const a = article(s, 'Shopify payouts in QuickBooks', 'shopify payouts quickbooks');
  const pos = a.position;
  advance(s, 1, GEO_APP);
  assert.ok(a.samey && a.position > pos);
  assert.ok(s.mistakes.some((m) => m.id === 'over_optimized_brief'));
});

// ---------------- Operator tiers ----------------

const BUYER = ['best tool to reconcile shopify payouts in quickbooks', 'a2x vs synder for a small shopify store', 'cheapest bookkeeping app for shopify sellers', 'synder alternatives for shopify payouts', 'how do i automate shopify bookkeeping in quickbooks', 'which software syncs shopify payouts to quickbooks', 'best quickbooks integration for shopify stores', 'a2x alternatives for a solo shopify founder', 'what is the best way to reconcile shopify fees in quickbooks', 'top bookkeeping tools for shopify stores 2026', 'best app to track shopify fees and refunds for taxes', 'how can i stop doing shopify bookkeeping by hand'];

function play(tier, seed) {
  const s = fresh(seed);
  const T = G.ensureSearch(s);
  ensureOrganic(s);
  s.apps.channels = { reviews: { count: { stellar: 25, good: 12, average: 4, mediocre: 1 }[tier] }, aiSearch: { mentions: 0, pitches: [] } };
  if (tier === 'mediocre') { T.robots.blocked['OAI-SearchBot'] = true; T.robots.blocked.PerplexityBot = true; T.robots.cdnDefault = true; }
  const lists = { stellar: 8, good: 4, average: 1, mediocre: 0 }[tier];
  if (tier === 'stellar') { G.geoAudit(s); G.savePromptSet(s, { texts: BUYER }); for (const t of ['Ledgerbird vs A2X: real pricing', 'Synder alternatives compared', 'Ledgerbird vs Synder for small stores']) article(s, t, t.toLowerCase(), 0.9); s.apps.organic.community.posts.push({ day: 0, removed: false, judge: { helpfulness: 0.85 } }); }
  if (tier === 'good') { G.geoAudit(s); G.savePromptSet(s, { texts: BUYER.slice(0, 10) }); article(s, 'Ledgerbird vs A2X', 'a2x alternative', 0.75); }
  if (tier === 'average') { G.runGrader(s); G.savePromptSet(s, { texts: ['best shopify bookkeeping tool for small stores', 'a2x vs synder', 'best app for shopify payouts', 'Ledgerbird pricing', 'quickbooks shopify sync tool for stores', 'shopify'] }); article(s, 'Our product vs others', 'vs others', 0.4); }
  if (tier === 'mediocre') { G.addLlmsTxt(s); G.savePromptSet(s, { texts: ['what is Ledgerbird', 'is Ledgerbird good', 'Ledgerbird'] }); G.manualTest(s, { runs: 1, engines: ['chatgpt'] }); G.astroturf(s); G.astroturf(s); G.buyPlacement(s, { disclosed: false }); }
  for (let w = 0; w < 17; w++) {
    if (w % 2 === 0 && w / 2 < lists) addListicles(s, 1);
    if (tier === 'stellar' || (tier === 'good' && w % 3 === 0)) G.communityWeek(s);
    if (tier === 'stellar' && w % 4 === 1) G.manualTest(s, { runs: 5, engines: ['chatgpt', 'claude', 'perplexity', 'gemini'] });
    if (tier === 'good' && w === 8) G.manualTest(s, { runs: 3, engines: ['chatgpt', 'perplexity'] });
    if (tier === 'average' && w === 8) G.manualTest(s, { runs: 1, engines: ['chatgpt'] });
    advance(s, 7, GEO_APP);
    // Stellar and good operators fix wrong facts at the source once they see them (stellar tests often enough to see them).
    if (tier === 'stellar' || tier === 'good') for (const f of G.activeWrongFacts(s)) if (f.noticed) { for (const src of [...f.open]) G.fixFactSource(s, f.id, src); if (tier === 'stellar') G.fixFactSource(s, f.id, 'facts_page'); }
  }
  return s;
}

test('GEO operator tiers separate: stellar > good > average > mediocre in read, true visibility and AI visits (120 days, 3 seeds)', () => {
  for (const seed of [3, 5, 8]) {
    const reads = ['stellar', 'good', 'average', 'mediocre'].map((tier) => { const s = play(tier, seed); return { tier, r: G.geoOperatorRead(s), v: G.trueVisibility(s).v, visits: G.aiDailyVisits(s) }; });
    for (const x of reads) assert.equal(x.r.tier, x.tier, `seed ${seed}: ${x.tier} reads ${x.r.tier} (${x.r.score}; ${x.r.evidence.join(' | ')})`);
    for (let i = 1; i < reads.length; i++) {
      assert.ok(reads[i - 1].r.score > reads[i].r.score, `seed ${seed}: score ${reads[i - 1].tier} > ${reads[i].tier}`);
      assert.ok(reads[i - 1].v > reads[i].v, `seed ${seed}: visibility ${reads[i - 1].tier} ${reads[i - 1].v} > ${reads[i].tier} ${reads[i].v}`);
    }
    assert.ok(reads[0].v > 4 * reads[3].v && reads[0].visits > 4 * reads[3].visits, `seed ${seed}: stellar ${reads[0].v} vs mediocre ${reads[3].v}`);
    assert.ok(reads[3].r.coaching.some((c) => /stellar operator/.test(c)), 'mediocre is told what stellar looks like');
  }
});

test('offline judges: Jev prompt classification and the answer checker fall back deterministically', async () => {
  const llm = await import('../public/core/llm.js');
  const { judgePromptSet, classifyAnswer } = await import('../public/apps/searchtools/judge.js');
  const s = fresh();
  const ctx = { state: s, llm };
  const j = await judgePromptSet(ctx, ['what is Ledgerbird', 'best tool to reconcile shopify payouts in quickbooks', 'a2x vs synder for small stores']);
  assert.deepEqual(j.kinds, ['vanity', 'generic', 'comparison']);
  assert.ok(j.mock && j.rubric > 0 && j.rubric < 1);
  const a = await classifyAnswer(ctx, { prompt: 'best shopify bookkeeping app', answer: `For small Shopify stores I recommend Ledgerbird ($${s.plans[0].price + 20}/mo) or A2X. Both sync payouts to QuickBooks.` });
  assert.equal(a.mentioned, true); assert.equal(a.stance, 'recommended'); assert.equal(a.wrongFact, true);
});

test('cancelling Search Console sticks: the SEO model loses it and sync does not re-add it', () => {
  const s = fresh();
  assert.ok(TL.subscribe(s, 'gsc').ok);
  assert.equal(ensureSeo(s).tech.gsc, true);
  assert.ok(TL.unsubscribe(s, 'gsc').ok);
  TL.syncSearchConsole(s);
  assert.equal(TL.hasTool(s, 'gsc'), false);
  assert.equal(ensureSeo(s).tech.gsc, false);
});
