import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, activeSubs } from '../public/core/stripe.js';
import { ensureMarket, mainPlan } from '../public/core/market.js';
import * as llm from '../public/core/llm.js';
import { APPS } from '../public/apps/registry.js';
import channels from '../public/apps/channels.js';
import pricing from '../public/apps/pricing.js';
import * as M from '../public/apps/channels/model.js';
import * as ST from '../public/apps/channels/stats.js';
import { maxDiscount, discountCheck, buildPlans, publishPlans, trialModeEffects, pricingSlice } from '../public/apps/channels/pricing-model.js';
import * as S from '../public/apps/channels/sim.js';
import * as PS from '../public/apps/channels/pricing-sim.js';
import { heuristicJudge, judgeArtifact } from '../public/apps/channels/judge.js';
import { STORES } from '../public/apps/channels/catalog.js';
import { productSlice } from '../public/apps/product/store.js';
import { CHANNELS } from '../public/data/channels.js';

const mulberry = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ALL = [...APPS.filter((a) => a.id !== 'channels' && a.id !== 'pricing'), channels, pricing];

function fresh(model = 'smb', seed = 11) {
  const s = newState({ companyName: 'Chan Co', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', description: 'seed', category: 'owner_contribution' });
  s.company.website = { source: 'paste', title: 'Chan', text: 'Bookkeeping for small agencies. $49/mo. Start free trial.' };
  s.company.oneLiner = 'Bookkeeping reconciliation for small agencies';
  s.company.icp = 'owners of 5-30 person marketing agencies';
  productSlice(s).features.push({ id: 'f_core', title: 'Core reconciliation', status: 'shipped', effortHours: 40, progressHours: 40, shippedDay: 0 });
  s.market.fit.product = { score: 0.6, notes: '', day: 0, source: 'test' };
  s.founder.hoursPerWeek = 200;
  return s;
}
const judged = (q = 0.6) => ({ quality: q, score: q * 10, results: [], mock: true, words: 120 });
function addCustomers(s, n, source = 'direct') {
  for (let i = 0; i < n; i++) {
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x${i}.com`, source });
    subscribe(s, c.id, mainPlan(s), { trial: false, source });
  }
}

// ---------------- model ----------------

test('ramp: nothing before first result, smooth to 100% at rampMonths', () => {
  assert.equal(M.rampFactor(10, 30, 9), 0);
  assert.ok(Math.abs(M.rampFactor(30, 30, 9) - 0.1) < 1e-9);
  assert.equal(M.rampFactor(270, 30, 9), 1);
  assert.ok(M.rampFactor(150, 30, 9) > 0.3 && M.rampFactor(150, 30, 9) < 0.9);
});

test('steady state uses CHANNELS ranges, quality and fit', () => {
  const ch = CHANNELS.find((c) => c.id === 'affiliate_program');
  const lo = M.steadyMonthly(ch.steadyStateMonthly.leadsOrSignups, { quality: 0, fit: 0.8 });
  const hi = M.steadyMonthly(ch.steadyStateMonthly.leadsOrSignups, { quality: 1, fit: 0.8 });
  assert.equal(lo, 10);
  assert.equal(hi, 150);
  assert.equal(M.steadyMonthly([10, 150], { quality: 1, fit: 0 }), 0);
});

test('marketplace revenue share respects the $1M lifetime threshold (Shopify)', () => {
  const rule = STORES.shopify.fee;
  assert.equal(M.revShareFee(rule, 1000, 0), 0);
  assert.equal(M.revShareFee(rule, 1000, 2_000_000), 150);
  assert.equal(M.revShareFee(rule, 1000, 999_500), 75); // half under, half over
  assert.equal(M.revShareFee(STORES.microsoft.fee, 1000, 0), 30);
});

test('affiliate commission: capped months, annual pro-rating, lifetime', () => {
  assert.equal(M.commissionOn({ amount: 100, rate: 0.25, months: 12, paidMonthsBefore: 3 }), 25);
  assert.equal(M.commissionOn({ amount: 100, rate: 0.25, months: 12, paidMonthsBefore: 12 }), 0);
  assert.equal(M.commissionOn({ amount: 1200, rate: 0.2, months: 6, paidMonthsBefore: 0, interval: 'year' }), 120);
  assert.equal(M.commissionOn({ amount: 100, rate: 0.3, months: 0, paidMonthsBefore: 40 }), 30);
});

test('affiliates: 5–15% produce at a typical brief; top 10% drive most volume', () => {
  const r = mulberry(5);
  const affs = Array.from({ length: 4000 }, () => M.affiliatePotency(r, { briefQuality: 0.5, kind: 'blogger' }));
  const producers = affs.filter((a) => a.producer).length / affs.length;
  assert.ok(producers > 0.05 && producers < 0.15, `producers ${producers}`);
  const vols = affs.map((a) => a.monthly).sort((a, b) => b - a);
  const top = vols.slice(0, vols.length / 10).reduce((a, b) => a + b, 0) / vols.reduce((a, b) => a + b, 0);
  assert.ok(top > 0.7, `top-10% share ${top}`);
});

test('referral participation stays within 1–15% and rewards design', () => {
  const weak = M.referralParticipation({ model: 'smb', reward: 'cash', twoSided: false, placements: ['settings'], productFactor: 0.5 });
  const strong = M.referralParticipation({ model: 'smb', reward: 'credit', rewardPct: 0.2, twoSided: true, placements: ['aha', 'transactional'], productFactor: 1.2 });
  assert.ok(weak >= 0.005 && weak < 0.03, `weak ${weak}`);
  assert.ok(strong > 0.06 && strong <= 0.15, `strong ${strong}`);
});

test('PR: ~3% reply rate at typical quality; short pitches beat long; funding hook needs funding', () => {
  const typical = M.pitchResponseProb({ words: 300, personalized: true, quality: 0.5, tier: 'tier1' });
  assert.ok(typical > 0.01 && typical < 0.05, `typical ${typical}`);
  assert.ok(M.pitchResponseProb({ words: 120, quality: 0.5 }) > M.pitchResponseProb({ words: 600, quality: 0.5 }) * 3);
  assert.ok(M.coverageProb({ hook: 'funding', tier: 'tier1', hasFunding: false }) < 0.01);
  const f = M.coverageProb({ hook: 'funding', tier: 'tier1', hasFunding: true, quality: 0.5 });
  assert.ok(f >= 0.1 && f <= 0.3);
});

test('cold calling lands near ~370 dials per meeting at an average script', () => {
  const r = mulberry(9);
  let dials = 0, meetings = 0;
  for (let i = 0; i < 400; i++) { const b = M.coldCallBlock(r, { hours: 3, dialer: 'parallel', scriptQuality: 0.5, listQuality: 0.5 }); dials += b.dials; meetings += b.meetings; }
  const perMeeting = dials / meetings;
  assert.ok(perMeeting > 250 && perMeeting < 550, `dials/meeting ${perMeeting}`);
});

test('LTD sales curve sums to 1; marketplace cold start ~1 install/week', () => {
  let tot = 0;
  for (let d = 0; d < 60; d++) tot += M.ltdDayShare(d);
  assert.ok(Math.abs(tot - 1) < 1e-9);
  const cold = M.marketplaceInstallsPerDay({ steadyMonthly: 200, ageDays: 40, firstResultDay: 14, rampMonths: 12, reviews: 0 });
  assert.ok(cold * 7 >= 0.9 && cold * 7 <= 2.1, `cold ${cold * 7}/week`);
  const warm = M.marketplaceInstallsPerDay({ steadyMonthly: 200, ageDays: 360, firstResultDay: 14, rampMonths: 12, reviews: 30 });
  assert.ok(warm > 5);
});

test('direct mail response within research ranges', () => {
  const p = M.directMailResponse({ piece: 'postcard', quality: 0.5, followUp: true });
  assert.ok(p >= 0.02 && p <= 0.04);
  const d = M.directMailResponse({ piece: 'dimensional', quality: 0.8, followUp: true });
  assert.ok(d >= 0.05 && d <= 0.15);
});

// ---------------- stats ----------------

test('normal helpers', () => {
  assert.ok(Math.abs(ST.normCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(ST.normInv(0.975) - 1.96) < 1e-3);
});

test('two-proportion test: small samples are not significant, large ones are', () => {
  const small = ST.twoProportionTest(3, 20, 6, 20);
  assert.equal(small.significant, false);
  const big = ST.twoProportionTest(200, 2000, 280, 2000);
  assert.equal(big.significant, true);
  assert.ok(big.p < 0.001);
  assert.ok(big.ci95[0] > 0);
});

test('sample size to detect a 20% lift at 10% baseline is in the thousands', () => {
  const n = ST.sampleSizePerArm(0.1, 0.2);
  assert.ok(n > 3000 && n < 5000, `n ${n}`);
  assert.ok(ST.sampleSizePerArm(0.3, 0.2) < n);
});

test('Van Westendorp intersections are ordered and sensible', () => {
  const r = mulberry(3);
  const resp = Array.from({ length: 300 }, () => { const w = 50 * Math.exp((r() - 0.5) * 0.8); return { tooCheap: w * 0.3, cheap: w * 0.6, expensive: w * 1.1, tooExpensive: w * 1.6 }; });
  const vw = ST.vanWestendorp(resp);
  assert.ok(vw.pmc < vw.opp + 1e-6 || vw.pmc < vw.ipp);
  assert.ok(vw.pmc < vw.pme);
  assert.ok(vw.opp > 15 && vw.opp < 60, `opp ${vw.opp}`);
  assert.ok(vw.pme > 40 && vw.pme < 100, `pme ${vw.pme}`);
});

test('Gabor-Granger finds the revenue-maximizing price with a monotone curve', () => {
  const prices = [10, 20, 40, 80];
  const resp = Array.from({ length: 50 }, () => ({ 10: 0.9, 20: 0.8, 40: 0.5, 80: 0.1 }));
  const gg = ST.gaborGranger(resp, prices);
  assert.equal(gg.best.price, 40);
  for (let i = 1; i < gg.points.length; i++) assert.ok(gg.points[i].demand <= gg.points[i - 1].demand);
});

test('price increase churn: k × increase, grandfathering and comms matter', () => {
  const base = ST.priceIncreaseChurn({ model: 'smb', increasePct: 0.2, comms: 0.8, noticeDays: 30 });
  assert.ok(base >= 0.01 && base <= 0.03, `smb +20% ${base}`);
  const bad = ST.priceIncreaseChurn({ model: 'smb', increasePct: 0.2, comms: 0.1, noticeDays: 0 });
  assert.ok(bad > base * 2);
  const gf = ST.priceIncreaseChurn({ model: 'smb', increasePct: 0.2, comms: 0.8, noticeDays: 30, grandfathered: true });
  assert.ok(gf < base * 0.5 && gf > base * 0.2);
  // McKelvey anecdote: +61% with grandfathering → ~3% churn
  const mck = ST.priceIncreaseChurn({ model: 'smb', increasePct: 0.61, comms: 0.7, noticeDays: 30, grandfathered: true });
  assert.ok(mck > 0.01 && mck < 0.06, `mck ${mck}`);
});

test('tier choice: compromise effect favors the middle tier', () => {
  const sh = ST.tierShares([{ price: 25, value: 0.4 }, { price: 49, value: 0.7 }, { price: 120, value: 1 }], { wtp: 60, highlightIndex: 1 });
  assert.ok(Math.abs(sh.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(sh[1] > sh[0] && sh[1] > sh[2]);
  const a = ST.annualShare({ baseShare: 0.25, discount: 0.167 });
  assert.ok(Math.abs(a - 0.25) < 0.03);
});

// ---------------- pricing model ----------------

test('maxDiscount follows ACV bands and founder overrides', () => {
  const s = fresh('ent');
  s.day = 10; // November: not end of quarter
  assert.equal(maxDiscount(s, 3000), 0.05);
  assert.equal(maxDiscount(s, 10000), 0.15);
  assert.equal(maxDiscount(s, 50000), 0.25);
  assert.equal(maxDiscount(s, 250000), 0.35);
  pricingSlice(s).discountPolicy.overrides.smb = 0.1;
  assert.equal(maxDiscount(s, 10000), 0.1);
  assert.equal(discountCheck(s, 10000, 0.2).ok, false);
  s.day = 50; // Dec 22: last two weeks of Q4
  assert.ok(Math.abs(maxDiscount(s, 10000) - 0.15) < 1e-9);
  assert.equal(maxDiscount(null, 50000), 0.25);
});

test('buildPlans keeps the core plan shape and publishPlans archives plans in use', () => {
  const s = fresh();
  addCustomers(s, 2);
  const plans = buildPlans([{ key: 'a', name: 'Starter', price: 19, features: ['x'] }, { key: 'b', name: 'Pro', price: 49, highlight: true }], { annualDiscount: 0.167 });
  for (const p of plans) for (const k of ['id', 'name', 'price', 'interval', 'trialDays', 'active']) assert.ok(k in p, k);
  assert.equal(plans[0].id, 'tier_b'); // most popular first → default checkout
  assert.equal(plans.find((p) => p.id === 'tier_b_annual').price, Math.round(49 * 12 * (1 - 0.167)));
  publishPlans(s, plans);
  const old = s.plans.find((p) => p.id === 'plan_main');
  assert.ok(old && old.active === false);
  assert.equal(mainPlan(s).id, 'tier_b');
  assert.equal(trialModeEffects('trial_card', 'smb').cardRequired, true);
});

// ---------------- judges ----------------

test('heuristic judge prefers specific, personalized outreach over buzzwords', () => {
  const s = fresh();
  const good = heuristicJudge(s, 'affiliate_outreach', 'Hi {first_name} — your post on agency bookkeeping (the 3-hour month-end close) was spot on. We pay 30% recurring commission for 12 months with a 60-day cookie; your audience of agency owners is exactly who we serve. Would you be open to a demo account and a custom link?');
  const bad = heuristicJudge(s, 'affiliate_outreach', 'Revolutionize your audience with our seamless, cutting-edge, best-in-class all-in-one solution. Unlock synergy!');
  assert.ok(good.score > bad.score + 3, `${good.score} vs ${bad.score}`);
});

test('judgeArtifact works offline with a deterministic fallback', async () => {
  const s = fresh();
  llm.setSettings({ enabled: false });
  const ctx = { state: s, llm };
  const j = await judgeArtifact(ctx, 'pr_pitch', 'Hi Sam — we analysed 1,200 agency invoices and found 18% are paid late because of reconciliation errors. Exclusive data for your readers, happy to share the full dataset. Interested?');
  assert.equal(j.mock, true);
  assert.ok(j.quality > 0 && j.quality <= 1);
  assert.equal(j.results.length, llm.getSettings().models.length);
});

// ---------------- simulation ----------------

test('affiliate program: tool fee, joins over weeks, referred signups and commissions as marketing spend', () => {
  const s = fresh('smb', 21);
  addCustomers(s, 30);
  S.launchAffiliates(s, { tool: 'rewardful', rate: 0.3, months: 12, cookieDays: 60, payoutDelay: 30, terms: true });
  S.ensureChannels(s).affiliates.brief = judged(0.8);
  const joins = S.recruitAffiliates(s, { count: 150, personalized: true, judged: judged(0.8) });
  assert.ok(joins > 3, `joins ${joins}`);
  assert.equal(S.ensureChannels(s).affiliates.list.length, 0); // nobody joins on day 0
  advance(s, 200, ALL);
  const C = S.ensureChannels(s);
  assert.ok(C.affiliates.list.length >= joins * 0.8);
  const toolTx = s.bank.txns.filter((t) => t.meta?.channel === 'affiliate' && /Rewardful/.test(t.counterparty));
  assert.ok(toolTx.length >= 6, 'monthly tool fee');
  const signups = C.affiliates.list.reduce((a, x) => a + x.signups, 0);
  assert.ok(signups > 0, 'some affiliates produced');
  const producing = C.affiliates.list.filter((a) => a.signups > 0 && !a.kindFraud).length / C.affiliates.list.length;
  assert.ok(producing < 0.5, `producing share ${producing}`);
  if (C.payables.some((p) => p.status === 'paid')) assert.ok(s.bank.txns.some((t) => t.category === 'marketing' && t.meta?.source === 'affiliate' && /payouts/i.test(t.counterparty)));
  const perf = S.performance(s, null).find((r) => r.key === 'affiliate');
  assert.ok(perf && perf.sp > 0 && perf.ld > 0);
});

test('marketplace: build goes through the Product queue, review queue, cold start, rev share after threshold', () => {
  const s = fresh('smb', 33);
  const r = S.startStoreBuild(s, 'atlassian');
  const pq = productSlice(s);
  assert.ok(pq.buildQueue.includes(r.feature.id));
  assert.ok(r.feature.effortHours > 0);
  assert.throws(() => S.submitStore(s, 'atlassian'), /not shipped/);
  r.feature.status = 'shipped';
  S.storeState(s, 'atlassian').listing = judged(0.9);
  advance(s, 1, ALL);
  assert.equal(S.storeState(s, 'atlassian').status, 'built');
  S.submitStore(s, 'atlassian');
  advance(s, 120, ALL);
  const st = S.storeState(s, 'atlassian');
  if (st.status === 'rejected') { S.submitStore(s, 'atlassian'); advance(s, 60, ALL); }
  assert.equal(S.storeState(s, 'atlassian').status, 'live');
  assert.ok(st.installs >= 1);
  // Revenue share: Forge 0% on the first $1M lifetime, 17% after.
  st.lifetimeRev = 2_000_000;
  const sub = activeSubs(s)[0] ?? (() => { addCustomers(s, 1); return activeSubs(s)[0]; })();
  sub.source = 'marketplace:atlassian';
  s.stripe.charges.push({ id: 'ch_t', subId: sub.id, customerId: sub.customerId, day: s.day + 1, amount: 100, fee: 3, status: 'succeeded' });
  const before = st.feeAccrued;
  advance(s, 1, ALL);
  assert.ok(Math.abs(st.feeAccrued - before - 17) < 0.01 || st.feeAccrued === 0, `fee ${st.feeAccrued - before}`);
});

test('PR campaign: coverage needs an interview within 5 days; publishing records a public event', () => {
  const s = fresh('smb', 44);
  let camp = null;
  for (let i = 0; i < 40 && !camp?.coverage; i++) camp = S.launchPitchCampaign(s, { tier: 'trade', hook: 'data', listSize: 40, personalized: true, judged: judged(1) });
  assert.ok(camp.coverage, 'some campaign landed coverage');
  advance(s, 6, ALL);
  assert.equal(camp.status, 'interview');
  S.doPressInterview(s, camp.id);
  advance(s, 12, ALL);
  assert.equal(camp.status, 'published');
  assert.ok((s.network?.publicEvents ?? []).some((e) => e.type === 'press_coverage'));
  assert.ok(s.mail.threads.some((t) => t.app === 'channels'));
});

test('events: leads not followed up go cold', () => {
  const s = fresh('ent', 55);
  assert.ok(M.followUpFactor(1) === 1 && M.followUpFactor(10) < 0.3);
  const conf = S.conferenceDates(s)[0];
  const e = S.bookConference(s, conf.id, 'booth');
  assert.ok(s.bank.txns.some((t) => t.meta?.channel === 'events' && /deposit/i.test(t.description)));
  advance(s, conf.day - s.day + 3, ALL);
  assert.ok(['done', 'missed'].includes(e.status));
  if (e.status === 'done') {
    assert.ok(e.leads.total > 0);
    const r = S.followUpEventLeads(s, e.id, { personalized: true, judged: judged(0.7) });
    assert.ok(r.late >= 1);
  }
});

test('referral program shares the Organic referral setting and books credit rewards', () => {
  const s = fresh('smb', 66);
  addCustomers(s, 60);
  S.configureReferral(s, { enabled: true, reward: 'free_month', twoSided: true, cashAmount: 20, rewardPct: 0.2, placements: ['aha'], tool: 'inhouse' });
  assert.equal(s.apps.organic.referral.enabled, true);
  assert.equal(s.market.referrals.enabled, true);
  const p = S.referralParticipation(s);
  assert.ok(p > 0.02 && p < 0.15);
  S.launchReferralEmail(s, judged(0.8));
  assert.throws(() => S.launchReferralEmail(s, judged(0.8)), /60 days/);
  advance(s, 90, ALL);
  assert.ok((S.ensureChannels(s).stats.referral?.ld ?? 0) > 0);
});

test('lifetime deal: payout cash later, support hours and compute cost for users who never pay', () => {
  const s = fresh('smb', 77);
  const L = S.applyLtd(s, { deal: 'select', price: 69, cap: 2000, limits: false, judged: judged(0.9) });
  L.accept = true;
  advance(s, 140, ALL);
  assert.ok(['live', 'ended'].includes(L.status));
  assert.ok(L.sold > 0);
  assert.ok(s.bank.txns.some((t) => t.counterparty === 'AppSumo' && t.amount > 0));
  assert.ok(s.bank.txns.some((t) => t.meta?.source === 'ltd' && t.amount < 0));
  assert.ok(s.founder.timeLog.some((x) => /lifetime-deal/.test(x.label)));
});

test('simulation is deterministic for a seed', () => {
  const run = () => {
    const s = fresh('smb', 99);
    addCustomers(s, 20);
    S.launchAffiliates(s, { tool: 'tolt', rate: 0.25, months: 12, cookieDays: 60, payoutDelay: 30, terms: false });
    S.recruitAffiliates(s, { count: 80, personalized: true, judged: judged(0.6) });
    S.setReviewsPaid(s, { g2Paid: false, ppc: { bid: 6, cap: 40 } });
    S.ensureChannels(s).reviews.claimed = true;
    S.ensureChannels(s).reviews.claimedDay = 0;
    advance(s, 90, ALL);
    return JSON.stringify(S.performance(s, null).map((r) => [r.key, Math.round(r.sp), r.ld, r.tr, r.customers]));
  };
  assert.equal(run(), run());
});

// ---------------- pricing simulation ----------------

test('published tiers: new trial checkouts spread across tiers and annual plans', () => {
  const s = fresh('smb', 101);
  PS.publishTiers(s, [{ key: 's', name: 'Starter', price: 25, features: ['a'] }, { key: 'p', name: 'Pro', price: 59, features: ['a', 'b'], highlight: true }, { key: 'b', name: 'Business', price: 149, features: ['a', 'b', 'c'] }], { annualDiscount: 0.167 });
  for (let i = 0; i < 200; i++) { const c = createCustomer(s, { name: `T${i}`, email: `t${i}@x.com`, source: 'direct' }); subscribe(s, c.id, mainPlan(s), { trial: true, source: 'direct' }); }
  PS.pricingDay(s);
  const subs = s.stripe.subscriptions.filter((x) => x.status === 'trialing');
  const byPlan = {};
  for (const x of subs) byPlan[x.planId] = (byPlan[x.planId] ?? 0) + 1;
  assert.ok(Object.keys(byPlan).length >= 4, JSON.stringify(byPlan));
  assert.ok((byPlan.tier_p ?? 0) + (byPlan.tier_p_annual ?? 0) > (byPlan.tier_s ?? 0) + (byPlan.tier_s_annual ?? 0));
  assert.ok(subs.some((x) => x.interval === 'year' && x.price === Math.round(59 * 12 * 0.833)));
});

test('A/B test splits new trials and reports a (non-)significant result', () => {
  const s = fresh('smb', 111);
  pricingSlice(s);
  const t = PS.startAbTest(s, { variantMult: 1.5 });
  for (let i = 0; i < 60; i++) { const c = createCustomer(s, { name: `T${i}`, email: `t${i}@x.com`, source: 'direct' }); subscribe(s, c.id, mainPlan(s), { trial: true, source: 'direct' }); }
  PS.pricingDay(s);
  const arms = t.subs.reduce((a, x) => ({ ...a, [x.arm]: (a[x.arm] ?? 0) + 1 }), {});
  assert.ok(arms.A > 15 && arms.B > 15);
  const bSub = s.stripe.subscriptions.find((x) => x.id === t.subs.find((y) => y.arm === 'B').subId);
  assert.equal(bSub.price, Math.round(t.controlPrice * 1.5 * 100) / 100);
  advance(s, 20, ALL);
  const r = PS.abResults(s, t);
  assert.ok(r.A.decided + r.B.decided > 0);
  assert.equal(r.test.significant, false); // 60 trials can't show a difference
  PS.stopAbTest(s, t.id, { adopt: true });
  assert.equal(mainPlan(s).price, t.variantPrice);
});

test('price increase migrates existing subscriptions via changePrice and causes some churn', () => {
  const s = fresh('smb', 121);
  addCustomers(s, 120);
  const plan = mainPlan(s);
  const inc = PS.scheduleIncrease(s, { planId: plan.id, newPrice: plan.price * 1.5, noticeDays: 0, grandfatherMonths: 0, lockIn: false, valueAdded: false, comms: { quality: 0.1 }, alsoNewCustomers: true });
  assert.equal(mainPlan(s).price, plan.price);
  assert.ok(s.market.modifiers.landing['pricing-backlash'] < 1); // surprise + bad comms
  advance(s, 1, ALL);
  assert.equal(inc.status, 'done');
  assert.ok(inc.migrated > 100);
  assert.ok(inc.churned > 3, `churned ${inc.churned}`);
  assert.ok(s.stripe.events.some((e) => e.type === 'expansion'));
  assert.ok(s.stripe.subscriptions.some((x) => x.cancelReason === 'price_increase'));
});

test('grandfathered increases migrate later with a smaller spike', () => {
  const s = fresh('smb', 131);
  addCustomers(s, 150);
  const plan = mainPlan(s);
  const inc = PS.scheduleIncrease(s, { planId: plan.id, newPrice: plan.price * 1.5, noticeDays: 30, grandfatherMonths: 6, lockIn: true, valueAdded: true, comms: { quality: 0.8 }, alsoNewCustomers: true });
  advance(s, 40, ALL);
  assert.equal(inc.status, 'grandfathered');
  assert.equal(inc.migrated, 0);
  advance(s, 185, ALL);
  assert.equal(inc.status, 'done');
  assert.ok(inc.pChurn < 0.05);
});

test('customer price survey returns answers after a week', () => {
  const s = fresh('smb', 141);
  addCustomers(s, 60);
  const sv = PS.sendCustomerSurvey(s, 'vw');
  advance(s, 8, ALL);
  assert.equal(sv.status, 'done');
  assert.ok(sv.responses.length >= 2);
  assert.ok(ST.vanWestendorp(sv.responses));
});
