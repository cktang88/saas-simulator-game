// Calibration round 2 remaining fixes (docs/review/calibration-2.md): SMB reply rates and small-deal paperwork,
// inbound lead fit by channel, app-store cold start, incident status-update overtime and free mistakes F3-F7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, spendHours, OutOfHoursError } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, balance } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, cancel } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import { replyProbability, isSaasIcp, personaFor } from '../public/apps/sales/replies.js';
import { getSegment, dealPaperwork } from '../public/apps/sales/segments.js';
import { ensureCrm, companyOf } from '../public/apps/sales/model.js';
import { addInboundLead } from '../public/apps/sales/crm-api.js';
import { setAsoListing, setReviewPrompt, ensureOrganic } from '../public/apps/growth/organicEngine.js';
import { ensureAso, applyListing, settledFunnel } from '../public/apps/growth/aso.js';
import { ensureAds, createAccount, createCampaign, createAdSet, editBudget } from '../public/apps/growth/adsEngine.js';
import { STATUS_UPDATE } from '../public/apps/helpdesk.js';
import { productSlice } from '../public/apps/product/store.js';
import { decideFeature, dayExtras } from '../public/apps/product/engine.js';
import { parseKeepPlan } from '../public/apps/product/decisions.js';
import { underpricingDay } from '../public/apps/channels/pricing-sim.js';
import { ensurePeople, prematureHireCheck } from '../public/apps/people/sim.js';

function fresh(model = 'smb', seed = 7, { icp, oneLiner } = {}) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 60000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = oneLiner ?? 'Online booking software for dental practices';
  s.company.icp = icp ?? 'Owners of independent dental practices with 2-6 chairs';
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  return s;
}
const mulberry = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mistakes = (s, id) => (s.mistakes ?? []).filter((m) => m.id === id);

// ---- 1a. SMB cold-email reply rates ----

test('SMB reply rates: our own "software" one-liner does not make the buyer a SaaS buyer; good targeted outreach lands at 4-6%', () => {
  const s = fresh('smb');
  assert.equal(isSaasIcp(s), false, 'dentists are not software buyers just because we sell software');
  s.company.icp = 'Engineering teams at B2B SaaS startups';
  assert.equal(isSaasIcp(s), true);
  const seq = (tier, quality, fit, steps = 4) => Array.from({ length: steps }, (_, i) => replyProbability({ tier, stepIndex: i, quality, fit })).reduce((a, b) => a + b, 0);
  const good = seq('researched', 0.6, 0.5), median = seq('basic', 0.6, 0.5), blast = seq('generic', 0.5, 0.5);
  assert.ok(good >= 0.04 && good <= 0.065, `researched, in-ICP ${good}`);
  assert.ok(median >= 0.02 && median <= 0.035, `median ${median}`);
  assert.ok(blast < 0.012 && good > 3 * blast, `blast ${blast}`);
});

// ---- 1b. Small-deal paperwork ----

test('small owner-run deals rarely demand vendor paperwork: W-9 only when invoiced, PCI almost never for a non-payments product', () => {
  const rate = (segId, acv, proc, id, oneLiner) => {
    const s = fresh('smb', 7, { oneLiner });
    const rand = mulberry(11);
    let n = 0;
    for (let i = 0; i < 1500; i++) if (dealPaperwork(s, getSegment(segId), acv, rand, [], proc).some((x) => x.id === id)) n++;
    return n / 1500;
  };
  for (const seg of ['restaurants', 'salons_fitness', 'trades', 'trucking', 'retail_shops']) {
    assert.ok(rate(seg, 2400, { cardPay: true }, 'w9', 'Shift scheduling') <= 0.03, `${seg} card-paid W-9`);
    assert.ok(rate(seg, 2400, { cardPay: true }, 'pci_attestation', 'Shift scheduling') <= 0.01, `${seg} PCI for a scheduling tool`);
  }
  assert.ok(rate('restaurants', 2400, { cardPay: false }, 'w9', 'Shift scheduling') <= 0.27, 'invoiced owner-run deals cap at ~25%');
  assert.ok(rate('restaurants', 2400, { cardPay: false }, 'w9', 'Shift scheduling') >= 0.15, 'but an invoiced deal still sometimes needs one');
  assert.ok(rate('restaurants', 2400, { cardPay: true }, 'pci_attestation', 'Card payments and POS for restaurants') >= 0.4, 'a payments product is asked for PCI');
  // Bigger deals are untouched.
  assert.ok(rate('enterprise', 60000, { cardPay: false }, 'w9', 'Shift scheduling') >= 0.95);
  assert.ok(rate('hotels', 20000, { cardPay: false }, 'pci_attestation', 'Shift scheduling') >= 0.4);
});

// ---- 1c. Inbound leads carry fit by channel ----

test('inbound lead fit follows the channel audience: Product Hunt and HN enterprise leads are mostly tire-kickers', () => {
  const stats = (source) => {
    const s = fresh('ent', 21, { oneLiner: 'Contract analytics', icp: 'General counsel at companies with 1000+ employees' });
    ensureCrm(s);
    let fit = 0, pain = 0, n = 150;
    for (let i = 0; i < n; i++) {
      const c = addInboundLead(s, { name: `Lead ${i}`, email: `lead${i}@corp${i}.example`, company: `Corp ${i}`, domain: `corp${i}.example`, source });
      const co = companyOf(s, c);
      fit += co.inboundFit;
      if (personaFor(s, c, co).hasPain) pain++;
    }
    return { fit: fit / n, pain: pain / n };
  };
  const ph = stats('product-hunt'), hn = stats('organic:hn'), seo = stats('organic:seo'), ref = stats('referral');
  assert.ok(ph.fit < 0.3 && hn.fit < 0.3, `ph ${ph.fit} hn ${hn.fit}`);
  assert.ok(seo.fit > 0.5 && ref.fit > 0.65, `seo ${seo.fit} ref ${ref.fit}`);
  assert.ok(ph.pain < 0.35 && ref.pain > 0.4, `pain ph ${ph.pain} ref ${ref.pain}`);
  assert.ok(ph.pain < seo.pain && seo.pain < ref.pain + 0.001);
});

// ---- 2. App-store cold start ----

test('app-store cold start: a name-only listing gets almost no search traffic; real metadata and ratings grow the stream', () => {
  const LISTING = { name: 'Ledgerly: Habit Tracker', subtitle: 'Build habits as a busy parent', keywords: 'routine,daily,goals,streak,kids,family,planner,journal,reminder,checklist', description: 'd', score: 0.7 };
  const day = ({ listing = null, reviews = 0, stars = null, velocity = 0 }) => {
    const s = fresh('b2c', 5, { oneLiner: 'Habit tracker for busy parents', icp: 'Parents of young children who want to build better habits' });
    s.market.flags = { fixedDemand: 1 };
    const S = ensureAso(ensureOrganic(s).appstore);
    if (listing) applyListing(s, S, 'ios', listing);
    S.reviews = reviews; S.starSum = (stars ?? 0) * reviews;
    return settledFunnel(s, S, 'ios', { velocity }).installs;
  };
  const none = day({});
  assert.ok(none < 0.5, `name-only listing, no ratings: ${none}/day`);
  assert.ok(day({ reviews: 40, stars: 4.6 }) < 2, 'ratings alone do not make an unoptimised listing findable');
  const listedCold = day({ listing: LISTING });
  assert.ok(listedCold >= 1 && listedCold <= 10, `listed, 0 ratings: ${listedCold}/day`);
  let prev = listedCold;
  for (const n of [5, 20, 100]) { const v = day({ listing: LISTING, reviews: n, stars: 4.5 }); assert.ok(v > prev, `${n} ratings ${v}`); prev = v; }
  const big = day({ listing: LISTING, reviews: 2000, stars: 4.7, velocity: 300 });
  assert.ok(big > 30, `no 30/day cap any more: ${big}/day with velocity and ratings`);
});

test('a launched B2C app with no ASO and no ratings gets very little over 4 months; a listing and a rating prompt fix it', () => {
  const run = (aso) => {
    const s = fresh('b2c', 5, { oneLiner: 'Habit tracker for busy parents', icp: 'Parents of young children who want to read more' });
    s.market.flags = { fixedDemand: 1 };
    if (aso) { setAsoListing(s, { title: 'Habit tracker', subtitle: 's', keywords: 'habit', description: 'd', score: 0.8, feedback: [] }); setReviewPrompt(s, 'after_aha'); }
    advance(s, 120, APPS);
    return s.apps.organic.stats['organic:appstore']?.visits ?? 0;
  };
  const bare = run(false), listed = run(true);
  assert.ok(bare < 40, `${bare} installs in 120 days without a listing`);
  assert.ok(listed > 3 * bare && listed > 100, `${listed} listed vs ${bare}`);
});

// ---- 3. Incident status update overtime ----

test('an incident status update gets 0.25 h of overtime even when the week is used; nothing else does', () => {
  const s = fresh();
  s.founder.hoursUsed = s.founder.hoursPerWeek;
  assert.throws(() => spendHours(s, 0.25, 'Incident status update'), OutOfHoursError);
  spendHours(s, STATUS_UPDATE.hours, 'Incident status update', { overtime: STATUS_UPDATE.overtime });
  assert.equal(s.founder.hoursUsed, s.founder.hoursPerWeek + 0.25, 'the overtime counts as hours used');
  assert.throws(() => spendHours(s, 0.5, 'Incident status update', { overtime: STATUS_UPDATE.overtime }), OutOfHoursError, 'only up to 0.25 h');
  assert.deepEqual(STATUS_UPDATE, { hours: 0.25, overtime: 0.25 });
});

// ---- F3. Keep on a missed feature ----

function missedFeature(s, id = 'mf1') {
  const sl = productSlice(s);
  const f = { id, title: 'Receipt chase', status: 'shipped', shippedDay: 0, effortHours: 20, problem: 'p', user: 'u', metric: 'Receipts matched → 75% within 30 days', baseline: '40%', check: { verdict: 'missed', text: 'Target 75%, got 44%.', got: 44, unit: '%' }, evidence: [] };
  sl.features.push(f);
  return { sl, f };
}

test('F3: an explicit keep on a missed feature needs a new target metric and a date, otherwise kept_missed_feature is logged once', () => {
  const s = fresh('smb', 9);
  const { sl, f } = missedFeature(s);
  decideFeature(s, sl, f, 'keep', 'It is fine, customers like it');
  assert.equal(mistakes(s, 'kept_missed_feature').length, 1);
  assert.ok(!f.keepPlan);
  decideFeature(s, sl, f, 'keep', 'Still fine');
  assert.equal(mistakes(s, 'kept_missed_feature').length, 1, 'key-deduped per feature');
  const { sl: sl2, f: g } = missedFeature(s, 'mf2');
  decideFeature(s, sl2, g, 'keep', 'Keep, but only with a metric: receipts matched 60% within 6 weeks');
  assert.equal(mistakes(s, 'kept_missed_feature').length, 1, 'the planned keep is free');
  assert.ok(g.keepPlan && g.keepPlan.dueDay === s.day + 42, JSON.stringify(g.keepPlan));
  // A hit needs no plan at all.
  const { sl: sl3, f: h } = missedFeature(s, 'mf3');
  h.check.verdict = 'hit';
  const before = mistakes(s, 'kept_missed_feature').length;
  decideFeature(s, sl3, h, 'keep', '');
  assert.equal(mistakes(s, 'kept_missed_feature').length, before);
  // A target without a date, or a date without a number, is not a plan.
  assert.equal(parseKeepPlan(s, 'Get activation to 50%'), null);
  assert.equal(parseKeepPlan(s, 'Revisit in 4 weeks'), null);
  assert.ok(parseKeepPlan(s, 'activation 50% by 2099-01-01'));
});

test('F3: a planned keep is measured again on its date; missing again reopens the decision', () => {
  const s = fresh('smb', 9);
  const { sl, f } = missedFeature(s);
  decideFeature(s, sl, f, 'keep', 'weekly users at 30 accounts within 2 weeks');
  s.day += 15;
  for (let i = 0; i < 3 && f.keepPlan; i++) dayExtras(s, sl);
  assert.ok(f.keepPlan == null || f.keepPlan.checked, 're-checked');
  if (f.decision == null) assert.ok(f.decisionDue > s.day, 'a miss reopens the decision');
  else assert.equal(f.decision, 'keep', 'a hit stays kept');
});

// ---- F4. Underpricing ----

test('F4: pricing below half of willingness to pay is logged once per price', () => {
  const s = fresh('smb', 3);
  s.market.fit.price.wtp = 100;
  s.plans[0].price = 60;
  underpricingDay(s);
  assert.equal(mistakes(s, 'underpriced').length, 0, '60% of WTP is fine');
  s.plans[0].price = 19;
  underpricingDay(s); underpricingDay(s);
  const first = mistakes(s, 'underpriced');
  assert.equal(first.length, 1, 'once per price');
  assert.ok(first[0].cost.usd > 0 && first[0].functionId === 'pricing_packaging');
  s.plans[0].price = 29;
  underpricingDay(s);
  assert.equal(mistakes(s, 'underpriced').length, 2, 'a new price is a new entry');
  s.plans[0].price = 79;
  underpricingDay(s);
  assert.equal(mistakes(s, 'underpriced').length, 2);
});

// ---- F5. Hiring ahead of revenue ----

test('F5: payroll above 60% of MRR without six months of it in cash, pre-PMF, is logged once per hire', () => {
  const s = fresh('smb', 4);
  const p = ensurePeople(s);
  const hire = (id, startDay) => p.members.push({ id, name: id, role: 'engineer', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay, hoursPerWeek: 40, salary: 120000, equityPct: 0, productivity: 1, morale: 70 });
  hire('m1', 0);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  assert.equal(prematureHireCheck(s, p), null, 'with six months of one salary in the bank the rule is met');
  post(s, { amount: -(balance(s) - 20000), counterparty: 'Rent', category: 'other' });
  const e = prematureHireCheck(s, p);
  assert.ok(e && e.id === 'premature_hire' && e.cost.usd > 0, JSON.stringify(e));
  assert.equal(prematureHireCheck(s, p), null, 'deduped for the same hire');
  hire('m2', 5);
  assert.ok(prematureHireCheck(s, p), 'the next hire made in the same state logs again');
  // Revenue covers it: no entry.
  const t = fresh('smb', 5);
  const q = ensurePeople(t);
  q.members.push({ id: 'm1', name: 'm1', role: 'engineer', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: 0, hoursPerWeek: 40, salary: 24000, equityPct: 0, productivity: 1, morale: 70 });
  for (let i = 0; i < 60; i++) { const c = createCustomer(t, { name: `C${i}`, email: `c${i}@x.io` }); subscribe(t, c.id, { id: 'p', price: 79, interval: 'month' }, { trial: false, source: 'network' }); }
  assert.equal(prematureHireCheck(t, q), null);
});

// ---- F6. Scaling ads while churn is above benchmark ----

function adsState(churned) {
  const s = fresh('smb', 6);
  const plan = { id: 'p', price: 49, interval: 'month' };
  const subs = [];
  for (let i = 0; i < 20; i++) { const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.io` }); subs.push(subscribe(s, c.id, plan, { trial: false, source: 'ads:meta' })); }
  for (let i = 0; i < churned; i++) cancel(s, subs[i].id, { atPeriodEnd: false });
  createAccount(s, 'meta');
  const c = createCampaign(s, { p: 'meta', name: 'T', objective: 'sales' });
  return { s, c };
}

test('F6: raising ad spend while 30-day churn is above benchmark is logged; healthy retention or small tests are not', () => {
  const { s, c } = adsState(6);
  const set = createAdSet(s, { campaignId: c.id, name: 'Broad', budget: 20 });
  assert.equal(mistakes(s, 'scaled_before_retention').length, 0, 'a $20 test is not scaling');
  editBudget(s, set.id, 100);
  const m = mistakes(s, 'scaled_before_retention');
  assert.equal(m.length, 1);
  assert.ok(m[0].cost.usd > 500 && m[0].functionId === 'paid_ads', JSON.stringify(m[0].cost));
  editBudget(s, set.id, 100);
  assert.equal(mistakes(s, 'scaled_before_retention').length, 1, 'deduped');
  const healthy = adsState(0);
  const set2 = createAdSet(healthy.s, { campaignId: healthy.c.id, name: 'Broad', budget: 100 });
  editBudget(healthy.s, set2.id, 300);
  assert.equal(mistakes(healthy.s, 'scaled_before_retention').length, 0);
  const opening = adsState(6);
  createAdSet(opening.s, { campaignId: opening.c.id, name: 'Big start', budget: 120 });
  assert.equal(mistakes(opening.s, 'scaled_before_retention').length, 1, 'starting at $50+/day with leaky retention counts');
});

// ---- F7. Broad ICP ----

test('F7: a broad "everyone" ICP is logged once when the first spec goes into the build; a specific one is not', () => {
  const s = fresh('smb', 8, { icp: 'Everyone who runs a business' });
  const sl = productSlice(s);
  sl.features.length = 0;
  dayExtras(s, sl);
  assert.equal(mistakes(s, 'broad_icp').length, 0, 'nothing is being built from it yet');
  sl.features.push({ id: 'q1', title: 'x', status: 'queued', effortHours: 10, progressHours: 0, evidence: [] });
  dayExtras(s, sl); dayExtras(s, sl);
  const m = mistakes(s, 'broad_icp');
  assert.equal(m.length, 1);
  assert.ok(m[0].cost.hours > 0 && m[0].cost.days > 0 && /0\.6/.test(m[0].detail));
  const t = fresh('smb', 8);
  productSlice(t).features.length = 0;
  productSlice(t).features.push({ id: 'q1', title: 'x', status: 'queued', effortHours: 10, progressHours: 0, evidence: [] });
  dayExtras(t, productSlice(t));
  assert.equal(mistakes(t, 'broad_icp').length, 0);
});
