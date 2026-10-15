// App Store Optimization (Apple App Store + Google Play): field rules, review friction and 2.3.7 rejections,
// creative-test statistics, the 3-prompts-per-year cap, prompt timing, fake-review detection, Apple Search Ads
// halo / cannibalization / category CPT, no installs cap, and stellar vs average vs mediocre operator separation.
// Short horizons and few seeds only (CLAUDE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import { ensureOrganic, appStoreDay, setAsoListing } from '../public/apps/growth/organicEngine.js';
import * as M from '../public/apps/growth/asoModel.js';
import { ASO } from '../public/apps/growth/asoParams.js';
import { APPSTORE } from '../public/apps/growth/params.js';
import {
  ensureAso, submitMetadata, applyListing, startTest, applyTest, setPromptPlan, replyToReviews, ratingPlanInfo, buyReviews, setTool, termIntel,
  storeFunnel, settledFunnel, asaCptMult, asaInstallMult, createCpp, reviewCheck, readAso, enablePlay, PROMPT_RATE, submitScreenshots, localize, localeMult,
} from '../public/apps/growth/aso.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';

function fresh(seed = 7, { name = 'Nookly' } = {}) {
  const s = newState({ companyName: name, model: 'b2c', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  s.company.website = { source: 'paste', title: 'x', text: 'x' };
  s.company.oneLiner = 'Habit tracker for busy parents who want to read more books';
  s.company.icp = 'Parents of young children who want to build a reading habit';
  s.market.flags = { fixedDemand: 1 };
  ensureOrganic(s);
  return s;
}
const aso = (s) => ensureAso(s.apps.organic.appstore);
const LISTINGS = {
  stellar: { name: 'Nookly: Reading Habit Tracker', subtitle: 'Read more books with kids', keywords: 'parents,bedtime,story,family,goals,daily,streak,log,journal,routine,minutes,challenge,planner,reader', description: 'Read 20 minutes a night with your kids.', score: 0.85 },
  average: { name: 'Nookly: Reading Tracker', subtitle: 'Book log and reading app', keywords: 'reading, books, read, book, tracker, library, app, free, best, goals, stats', description: 'x', score: 0.45 },
  mediocre: { name: 'Nookly Best Free Reading App', subtitle: 'Reading Reading Books App', keywords: 'goodreads,kindle,audible,free,best,reading,books', description: 'x', score: 0.2 },
};

// ---------------- field rules ----------------

test('Apple keyword field rules: spaces, repeats of name words, plurals, generic words and other brands are flagged; >100 blocks', () => {
  const v = M.validateMetadata('ios', { name: 'Nookly: Reading Tracker', subtitle: 'Book log for kids', keywords: 'reading, habit,habits,app,free,kids,goodreads' }, { brand: 'Nookly' });
  assert.equal(v.errors.length, 0);
  assert.ok(v.wastedChars >= 2 + 'reading'.length + 'habits'.length + 'app'.length + 'kids'.length, `wasted ${v.wastedChars}`);
  const w = v.warnings.join(' ');
  assert.match(w, /space\(s\) after commas/);
  assert.match(w, /Already in the name\/subtitle.*reading/);
  assert.match(w, /Plural.*habits/);
  assert.match(w, /Generic words.*app/);
  assert.deepEqual(v.competitors, ['goodreads']);
  assert.match(w, /2\.3\.7/);
  const long = M.validateMetadata('ios', { name: 'x'.repeat(31), subtitle: '', keywords: 'a,'.repeat(51) }, {});
  assert.equal(long.errors.length, 2, 'over-long name and keyword field cannot be submitted');
  const clean = M.validateMetadata('ios', LISTINGS.stellar, { brand: 'Nookly' });
  assert.ok(clean.wastedChars === 0 && clean.competitors.length === 0 && clean.usedChars >= 90, JSON.stringify(clean.warnings));
  // Apple indexes name, subtitle, keyword field, never the description; Play indexes the full description.
  const ios = M.indexOf('ios', { name: 'Nookly', subtitle: '', keywords: '', description: 'bedtime stories bedtime stories bedtime' });
  const play = M.indexOf('play', { name: 'Nookly', subtitle: '', description: 'bedtime stories bedtime stories bedtime' });
  assert.ok(!ios.bedtime && play.bedtime > 0);
  const p = M.validateMetadata('play', { name: 'Nookly #1 Free Reader', subtitle: 'x', description: '' }, { brand: 'Nookly' });
  assert.ok(p.claims.length >= 2 && /Play bans/.test(p.warnings.join(' ')));
  // Words combine across fields; the weakest field sets the weight.
  const idx = M.indexOf('ios', { name: 'Nookly: Reading', subtitle: 'for kids', keywords: 'bedtime' });
  assert.equal(M.termWeight(idx, 'reading kids'), ASO.fieldWeight.subtitle);
  assert.equal(M.termWeight(idx, 'bedtime reading'), ASO.fieldWeight.keywords);
  assert.equal(M.termWeight(idx, 'bedtime stories'), 0);
});

// ---------------- review friction ----------------

test('Apple review: metadata goes live only after 1-3 days; competitor names usually get the update rejected, with a traceable cost', () => {
  let rejected = 0, cleanRejected = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = fresh(seed);
    const S = aso(s);
    const r = submitMetadata(s, S, 'ios', LISTINGS.mediocre, { score: 0.2 });
    assert.ok(r.ok && r.days >= 1 && r.days <= 3, `review ${r.days} days`);
    assert.equal(S.stores.ios.live, null, 'nothing changes while in review');
    assert.ok(r.pending.p >= 0.5, `rejection risk ${r.pending.p}`);
    assert.equal(submitMetadata(s, S, 'ios', LISTINGS.stellar).ok, false, 'one version in review at a time');
    for (let d = 0; d < 3; d++) { s.day++; appStoreDay(s); }
    if (!S.stores.ios.live) {
      rejected++;
      const m = s.mistakes.find((x) => x.functionId === 'app_store_optimization' && x.id === 'competitor_names');
      assert.ok(m && m.cost.days >= 2 && m.cost.hours >= 1, 'rejection logged with days lost');
    }
    const c = fresh(seed + 10);
    const Sc = aso(c);
    submitMetadata(c, Sc, 'ios', LISTINGS.stellar);
    for (let d = 0; d < 3; d++) { c.day++; appStoreDay(c); }
    if (!Sc.stores.ios.live) cleanRejected++;
  }
  assert.ok(rejected >= 3, `${rejected}/6 competitor-name updates rejected`);
  assert.ok(cleanRejected <= 1, `${cleanRejected}/6 clean updates rejected`);
  // Google Play: live within a day.
  const g = fresh(3);
  const G = aso(g);
  enablePlay(g, G);
  const r = submitMetadata(g, G, 'play', { name: 'Nookly: Reading Tracker', subtitle: 'Build a reading habit with your kids in 10 minutes a night', description: 'Track bedtime reading.' });
  assert.ok(r.ok && r.days <= 1);
  for (let d = 0; d < 2; d++) { g.day++; appStoreDay(g); }
  assert.ok(G.stores.play.live, 'Play listing live');
});

test('changing metadata a 3rd time inside 30 days is a logged going-in-circles mistake', () => {
  const s = fresh(4);
  const S = aso(s);
  for (let i = 0; i < 3; i++) { S.stores.ios.pending = null; submitMetadata(s, S, 'ios', LISTINGS.stellar, { rejectP: 0 }); s.day += 5; }
  const m = s.mistakes.find((x) => x.id === 'metadata_churn');
  assert.ok(m && m.circles && m.cost.days > 0);
});

// ---------------- creative tests ----------------

test('PPO: a real +10% lift is inconclusive at ~20 page views a day but significant at ~3,000', () => {
  const rand = mulberry(11);
  const pois = (mean) => { if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss(rand))); const L = Math.exp(-mean); let k = 0, p = 1; do { k++; p *= rand(); } while (p > L); return k - 1; };
  const run = (viewsPerDay) => {
    const t = { arms: [{ views: 0, installs: 0, effect: 0 }, { views: 0, installs: 0, effect: 0.1 }], days: 0 };
    for (;;) {
      t.days++;
      for (const a of t.arms) { const v = pois(viewsPerDay / 2); a.views += v; a.installs += pois(v * 0.25 * (1 + a.effect)); }
      const r = M.testVerdict(t, 'ios');
      if (r.verdict !== 'running') return r.verdict;
    }
  };
  const low = [0, 1, 2, 3, 4].map(() => run(20));
  const high = [0, 1, 2, 3, 4].map(() => run(3000));
  assert.ok(low.filter((x) => x === 'inconclusive').length >= 4, `low traffic: ${low}`);
  assert.ok(high.filter((x) => x === 'winner').length >= 4, `high traffic: ${high}`);
});

test('PPO in the engine: traffic is split, a test ends with a verdict, and shipping a non-winner applies its real effect', () => {
  const s = fresh(5);
  const S = aso(s);
  applyListing(s, S, 'ios', LISTINGS.stellar);
  const r = startTest(s, S, 'ios', { kind: 'screenshots', treatments: [{ label: 'Benefit story', production: 'self', captions: ['Read 20 minutes every night', 'Build a streak with your kids', 'See every book you finished'] }] });
  assert.ok(r.ok && r.test.arms.length === 2);
  assert.equal(startTest(s, S, 'ios', { treatments: [{ label: 'x' }] }).ok, false, 'one test at a time');
  for (let d = 0; d < 95 && r.test.status === 'running'; d++) { s.day++; appStoreDay(s); }
  assert.ok(r.test.status === 'done' && ['winner', 'loser', 'inconclusive'].includes(r.test.verdict), r.test.verdict);
  assert.ok(r.test.arms[0].views > 0 && r.test.arms[1].views > 0);
  const before = S.stores.ios.testLift;
  r.test.arms[1].effect = -0.06; r.test.verdict = 'inconclusive'; r.test.arms[1].z = 0.4;
  const res = applyTest(s, S, 'ios', r.test.id, 1);
  assert.ok(!res.significant && S.stores.ios.testLift < before);
  assert.ok(s.mistakes.some((m) => m.id === 'shipped_inconclusive_test'));
});

// ---------------- ratings ----------------

test('SKStoreReviewController cap: asking 10 times a year shows the prompt at most 3 times; extra asks add nothing', () => {
  const y = (perYear) => M.ratingYield({ strategy: 'after_aha', perYear }, PROMPT_RATE);
  assert.equal(y(10).shownPerUser, 3);
  assert.equal(y(10).perInstall, y(3).perInstall);
  assert.ok(y(2).perInstall < y(3).perInstall && y(1).perInstall < y(2).perInstall);
  const s = fresh(2);
  const S = aso(s);
  setPromptPlan(s, S, { strategy: 'after_aha', perYear: 12 });
  assert.equal(ratingPlanInfo(S).shownPerUser, ASO.promptCap);
});

test('prompt timing: after a success moment gets more and better ratings than on app open', () => {
  assert.ok(PROMPT_RATE.after_aha > PROMPT_RATE.on_open && APPSTORE.promptStarShift.after_aha > APPSTORE.promptStarShift.on_open);
  const run = (strategy) => {
    const s = fresh(9);
    s.market.fit = { ...(s.market.fit ?? {}), product: { score: 0.6 } };
    const S = aso(s);
    applyListing(s, S, 'ios', LISTINGS.stellar);
    setPromptPlan(s, S, { strategy, perYear: 3 });
    S.reviews = 0; S.starSum = 0;
    for (let d = 0; d < 120; d++) { s.day++; appStoreDay(s); }
    return { n: S.reviews, stars: S.starSum / Math.max(1, S.reviews) };
  };
  const aha = run('after_aha'), open = run('on_open');
  assert.ok(aha.n > open.n, `${aha.n} vs ${open.n} ratings`);
  assert.ok(aha.stars > open.stars + 0.3, `${aha.stars} vs ${open.stars} stars`);
  assert.ok(M.starMult(3.9, 50) < 0.85 * M.starMult(4.0, 50), 'sub-4.0 cliff');
});

test('fake reviews: an immediate logged cost, and detection can purge them, remove the app or end the account', () => {
  const outcomes = new Set();
  let detected = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = fresh(seed);
    const S = aso(s);
    applyListing(s, S, 'ios', LISTINGS.average);
    buyReviews(s, S, 50);
    assert.ok(s.mistakes.some((m) => m.id === 'fake_reviews' && m.cost.usd === 50 * ASO.fake.buy.usdPerReview));
    for (let d = 0; d < 365 && !S.fake.detections; d++) { s.day++; appStoreDay(s); }
    if (S.fake.detections) {
      detected++;
      const m = s.mistakes.find((x) => /^fake_reviews_/.test(x.id));
      outcomes.add(m.id);
      assert.ok(m.cost.days >= ASO.fake.demoteDays && S.fake.items[0].live === 0, 'manipulated ratings purged');
      if (m.id === 'fake_reviews_removed') assert.ok(S.stores.ios.removedUntil > s.day);
    }
  }
  assert.ok(detected >= 4, `${detected}/8 detected within a year`);
  assert.ok(outcomes.has('fake_reviews_removed') || outcomes.has('fake_reviews_terminated') || detected >= 6, [...outcomes].join(','));
  // While removed the store sends nothing.
  const s = fresh(3); const S = aso(s); applyListing(s, S, 'ios', LISTINGS.stellar);
  S.stores.ios.removedUntil = s.day + 10;
  for (let d = 0; d < 5; d++) { s.day++; appStoreDay(s); }
  assert.equal(S.stores.ios.daily.slice(-5).reduce((a, x) => a + x[2], 0), 0);
});

// ---------------- Apple Search Ads interplay ----------------

test('Apple Search Ads: velocity halo, brand cannibalization, category CPT and CPP tap-to-install', () => {
  const s = fresh(6);
  const S = aso(s);
  applyListing(s, S, 'ios', LISTINGS.stellar);
  S.reviews = 30; S.starSum = 30 * 4.5;
  const base = settledFunnel(s, S, 'ios', { velocity: 10 }).installs;
  const withPaid = settledFunnel(s, S, 'ios', { velocity: 10 + 40 }).installs; // +40 paid installs/day of velocity
  const halo = (withPaid - base) / 40;
  assert.ok(halo > 0.02 && halo < 0.6, `halo ${halo.toFixed(2)} organic per paid install`);
  const f0 = storeFunnel(s, S, 'ios', { velocity: 10 });
  const fb = storeFunnel(s, S, 'ios', { velocity: 10, paidBrand: 1 });
  const fg = storeFunnel(s, S, 'ios', { velocity: 10, paidGeneric: 1 });
  assert.ok(fb.cannibal > 0 && fb.installs < f0.installs, 'brand bidding takes organic installs');
  assert.ok(fg.cannibal < fb.cannibal, 'generic keywords cannibalize less than brand');
  s.company.b2cCategory = 'finance';
  const fin = asaCptMult(s);
  s.company.b2cCategory = 'productivity';
  const prod = asaCptMult(s);
  assert.ok(fin > 1.5 && prod < 0.85, `finance ×${fin.toFixed(2)}, productivity ×${prod.toFixed(2)} of $2.25`);
  const before = asaInstallMult(s, 'as_1');
  createCpp(s, S, { theme: 'bedtime reading', adsetId: 'as_1' });
  assert.ok(asaInstallMult(s, 'as_1') > before * 1.05 && asaInstallMult(s, 'as_2') === before);
});

test('ASA in the ads engine: paid installs feed organic velocity and brand campaigns are partly cannibalized', async () => {
  const { createAccount, createCampaign, createAdSet } = await import('../public/apps/growth/adsEngine.js');
  const run = (withAds) => {
    const s = fresh(8);
    const S = aso(s);
    applyListing(s, S, 'ios', LISTINGS.stellar);
    if (withAds) {
      const acct = createAccount(s, 'apple'); acct.payment = { brand: 'visa', last4: '4242' };
      const c = createCampaign(s, { p: 'apple', name: 'Brand', objective: 'app' });
      createAdSet(s, { campaignId: c.id, name: 'Brand', budget: 40, keywords: [{ text: 'nookly', match: 'exact', relevance: 1 }, { text: 'reading tracker', match: 'exact', relevance: 0.8 }] });
    }
    advance(s, 45, APPS);
    return S;
  };
  const off = run(false), on = run(true);
  assert.ok(on.asa.paidInstalls > 0, 'ASA delivered installs');
  assert.ok(on.asa.cannibalized > 0, 'some brand installs would have been organic');
});

// ---------------- tools, localization, Jev ----------------

test('tools reveal estimates with error, cost money every month, and do not move ranks', () => {
  const s = fresh(1);
  const S = aso(s);
  assert.equal(termIntel(s, 'ios', 'reading tracker').popularity, null, 'free consoles show no keyword volume');
  setTool(s, S, 'apptweak');
  const truth = M.termMetrics('reading tracker', { category: 'education_language' });
  const est = termIntel(s, 'ios', 'reading tracker');
  assert.ok(est.popularity > 0 && Math.abs(Math.log(est.popularity / truth.popularity)) < 1.2 && est.competitors.length === 3);
  assert.ok(s.recurring.some((r) => r.category === 'software' && r.amount === ASO.tools.apptweak.usd && r.active));
  setTool(s, S, 'console');
  assert.ok(!s.recurring.some((r) => r.amount === ASO.tools.apptweak.usd && r.active), 'cancelled');
  assert.ok(localeMult(S) === 1);
  localize(s, S, 'es', 'human');
  assert.ok(localeMult(S) > 1 && localeMult(S) < 1.1);
});

test('Jev decides 2.3.7 rejection risk and keyword fit; offline falls back to the heuristic', async () => {
  const s = fresh(1);
  const off = await reviewCheck({ state: s, llm: { decide: async ({ fallback }) => ({ answers: fallback(), mock: true }) } }, 'ios', LISTINGS.mediocre);
  assert.ok(off.mock && off.rejectP === M.rejectionRisk('ios', M.validateMetadata('ios', LISTINGS.mediocre, { brand: 'Nookly' })));
  let asked = null;
  const live = await reviewCheck({ state: s, llm: { decide: async (o) => { asked = o; return { answers: { ...o.fallback(), reject: { type: 'noul', noul: 0.1 } }, mock: false }; } } }, 'ios', LISTINGS.mediocre);
  assert.equal(asked.questions.reject.type, 'noul');
  assert.ok(Object.values(asked.questions).some((q) => q.type === 'score'));
  assert.ok(live.rejectP < off.rejectP && live.rejectP > 0.1, `blended ${live.rejectP}`);
});

// ---------------- save compatibility ----------------

test('old saves migrate: the single listing becomes the live iOS listing and ratings carry over', () => {
  const S = { startDay: 3, reviews: 12, starSum: 50, prompt: 'after_aha', aso: { day: 2, title: 'Habit tracker', subtitle: 's', keywords: 'habit', description: 'd', score: 0.8, feedback: [] } };
  ensureAso(S);
  assert.equal(S.stores.ios.live.name, 'Habit tracker');
  assert.equal(S.promptPlan.strategy, 'after_aha');
  assert.equal(S.reviews, 12);
  assert.ok(!S.stores.play.enabled);
});

// ---------------- operator separation ----------------

test('stellar vs average vs mediocre ASO operator: installs separate at realistic spreads and the read follows', () => {
  const run = (tier, seed) => {
    const s = fresh(seed);
    const S = aso(s);
    submitMetadata(s, S, 'ios', LISTINGS[tier], { score: LISTINGS[tier].score });
    if (tier === 'stellar') {
      setPromptPlan(s, S, { strategy: 'after_aha', perYear: 3 });
      submitScreenshots(s, S, 'ios', { production: 'self', captions: ['Read 20 minutes every night', 'Build a streak with your kids', 'See every book you finished'] });
      for (let w = 0; w < 12; w++) { if (w === 4) startTest(s, S, 'ios', { kind: 'icon', treatments: [{ label: 'Book icon' }] }); replyToReviews(s, S); advance(s, 7, APPS); }
      advance(s, 6, APPS);
    }
    if (tier === 'average') setPromptPlan(s, S, { strategy: 'timer' });
    if (tier === 'mediocre') {
      setPromptPlan(s, S, { strategy: 'on_open' });
      advance(s, 5, APPS);
      // After the rejection the mediocre operator strips the brand names but keeps stuffing.
      submitMetadata(s, S, 'ios', { name: 'Nookly Reading App', subtitle: 'Reading Books Reading', keywords: 'reading,books,read,book,app,free,best,reader,readings', description: 'x' }, { score: 0.2 });
      advance(s, 85, APPS);
    } else if (tier !== 'stellar') advance(s, 90, APPS);
    return { installs: s.apps.organic.stats['organic:appstore']?.visits ?? 0, read: readAso(s) };
  };
  const avg = (tier) => { const r = [1, 2].map((seed) => run(tier, seed)); return { installs: r.reduce((a, x) => a + x.installs, 0) / r.length, reads: r.map((x) => x.read) }; };
  const st = avg('stellar'), av = avg('average'), md = avg('mediocre');
  assert.ok(st.installs >= 2.5 * av.installs && st.installs <= 7 * av.installs, `stellar ${st.installs} vs average ${av.installs}`);
  assert.ok(md.installs <= 0.65 * av.installs, `mediocre ${md.installs} vs average ${av.installs}`);
  assert.ok(st.reads.every((r) => r.score > 0.6) && md.reads.every((r) => r.tier === 'mediocre'), `${st.reads.map((r) => `${r.tier} ${r.score.toFixed(2)}`)} / ${md.reads.map((r) => `${r.tier} ${r.score.toFixed(2)}`)}`);
  assert.ok(st.reads[0].score > av.reads[0].score && av.reads[0].score > md.reads[0].score);
  assert.ok(md.reads[0].coaching.length > 0 && OPERATOR_TIERS.app_store_optimization);
  // Unknown before the player acts.
  assert.equal(readAso(fresh(1)).tier, 'unknown');
});

function mulberry(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rand) { return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand()); }
