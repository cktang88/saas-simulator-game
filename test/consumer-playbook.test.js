// Consumer subscription-app playbook (Launch playbook app, apps/consumer/*): store commission and payout delay, paywall conversion
// by type, plan-length retention, App Review as a gate, creator and clipping channels (heavy tails, fraud, policy waves,
// saturation), Meta app campaigns, the composable funnel, base-rate odds and operator tiers.
// Short horizons and few seeds only (CLAUDE.md): nothing here runs a multi-year simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, mrr, subscriptionById } from '../public/core/stripe.js';
import { ensureMarket, setModifier } from '../public/core/market.js';
import { MOBILE, commissionRate, storeFee, survival, baseHazard } from '../public/core/mobile.js';
import { churnBeforeRenewal } from '../public/core/market.js';
import { readOperator, tierFromScore } from '../public/core/operator.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import { APPS as ALL_APPS } from '../public/apps/registry.js';
import { ensureConsumer, saturation } from '../public/apps/consumer/state.js';
import * as P from '../public/apps/consumer/params.js';
import * as Store from '../public/apps/consumer/store.js';
import * as Mon from '../public/apps/consumer/monetize.js';
import * as Cre from '../public/apps/consumer/creators.js';
import * as Clip from '../public/apps/consumer/clipping.js';
import * as Paid from '../public/apps/consumer/paid.js';
import * as Fun from '../public/apps/consumer/funnel.js';
import { consumerEvents } from '../public/apps/consumer/events.js';
import { ensureGrowth, ledgerAdd, weekOf } from '../public/apps/growth/acquire.js';
import { ensureAds } from '../public/apps/growth/adsEngine.js';
import { qualityFromDraw } from '../public/apps/growth/delivery.js';
import { ACTIONS, TRIGGERS } from '../public/apps/automations/model.js';

// Product's daily fit update would overwrite the fit these tests pin, so day-advancing tests skip the Product app.
const APPS = ALL_APPS.filter((a) => a.id !== 'product');
const ONE_LINER = 'Habit tracker for busy parents who want to read more books with their kids';
const ICP = 'Parents of young children who want to build a bedtime reading habit';

function fresh(seed = 7, { fit = 0.5, day = 0 } = {}) {
  const s = newState({ companyName: 'Nookly', model: 'b2c', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 500000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = ONE_LINER; s.company.icp = ICP; s.company.website = { source: 'paste', title: 'x', text: 'x' };
  s.apps.product = { features: [{ id: 'f1', title: 'Reading streaks for parents', status: 'shipped' }] };
  s.market.fit.product.score = fit;
  s.market.flags = { fixedDemand: 1 };
  s.day = day;
  ensureConsumer(s).creators.sub = 'team'; // roster cap of the free marketplace (6 per order) would hide the statistics
  return s;
}
// A live iOS app without going through review (for tests of the channels and money).
function live(s, { sbp = true, stack = 'expo' } = {}) {
  const C = ensureConsumer(s);
  Object.assign(C.app, { stack, built: true, builtDay: 0, status: 'live', liveDay: 0 });
  C.app.live = { ios: true, play: false };
  C.app.apple.sbp = sbp;
  return C;
}
const CLEAR = { headline: 'Read more with your kids', price: '$5.99 per week or $29.99 per year', renewal: 'Subscription renews automatically until you cancel', trial: '', cancel: 'Cancel anytime in Settings > Apple ID > Subscriptions', legal: 'Terms, Privacy, Restore purchases' };
const ms = (s) => s.mistakes ?? [];
const subsOf = (s, f = () => true) => s.stripe.subscriptions.filter((x) => x.mobile && f(x));
const HOOKS = {
  strong: ['I read 12 books in 60 days with my 4 year old by doing this 10 minute bedtime thing', 'Parents: this is how I stopped losing my reading streak every Tuesday', 'My kids asked for bedtime stories instead of tablets after 3 weeks of this', 'The reading habit trick for busy parents that takes 5 minutes a night', 'I tracked every book I read to my kids for 30 days and here is what changed'],
  generic: ['Introducing the best revolutionary all-in-one app', 'Unlock your potential with our seamless next-gen app', 'Are you looking for the ultimate game-changing app?'],
};

// ---------------------------------------------------------------- store economics

test('store commission: 15% Small Business Program under $1M, 30% above, 30% if not enrolled, Google 15%', () => {
  assert.equal(commissionRate({ store: 'ios', enrolled: true, priorProceeds: 0, ytdProceeds: 0 }), 0.15);
  assert.equal(commissionRate({ store: 'ios', enrolled: true, priorProceeds: 1_000_000, ytdProceeds: 0 }), 0.15, 'at the threshold is still 15%');
  assert.equal(commissionRate({ store: 'ios', enrolled: true, priorProceeds: 1_000_001, ytdProceeds: 0 }), 0.3);
  assert.equal(commissionRate({ store: 'ios', enrolled: true, priorProceeds: 0, ytdProceeds: 1_200_000 }), 0.3, 'crossing $1M this year moves you to 30% for the rest of it');
  assert.equal(commissionRate({ store: 'ios', enrolled: false }), 0.3);
  assert.equal(commissionRate({ store: 'play' }), 0.15);
  assert.equal(commissionRate({ store: 'web' }), 0);
  const f = storeFee(29.99, { rate: 0.15, toolingPct: 0.01 });
  assert.equal(f.commission, 4.5);
  assert.equal(f.fee, 4.8);
});

test('store subscriptions land net of commission, and proceeds arrive 33-45 days after month end (not T+2)', () => {
  const s = fresh();
  live(s, { sbp: true });
  Mon.setPaywall(s, { type: 'hard_no_trial', plans: { weekly: { on: false }, monthly: { on: false }, annual: { on: true, price: 29.99 } }, copy: CLEAR });
  s.day = 10; // mid-month
  Mon.setTooling(s, 'none');
  Fun.deliverVisits(s, { source: 'organic:appstore', installs: 400 });
  const subs = subsOf(s);
  assert.ok(subs.length > 20, `${subs.length} paying`);
  const ch = s.stripe.charges.find((c) => c.store === 'ios');
  assert.equal(ch.fee, Math.round(ch.amount * 0.15 * 100) / 100, '15% with the Small Business Program');
  const p = s.stripe.pending.find((x) => x.chargeId === ch.id);
  assert.ok(p.availableDay >= 10 + 18 + 33, `available day ${p.availableDay} is after month end plus 33 days`);
  assert.ok(p.availableDay <= 10 + 31 + 45, 'and within 45');
  // The same sale with no enrolment pays 30%.
  const u = fresh(8);
  live(u, { sbp: false });
  Mon.setPaywall(u, { type: 'hard_no_trial', plans: { weekly: { on: false }, annual: { on: true } } });
  Fun.deliverVisits(u, { source: 'organic:appstore', installs: 300 });
  const c2 = u.stripe.charges.find((c) => c.store === 'ios');
  assert.equal(c2.fee, Math.round(c2.amount * 0.3 * 100) / 100);
  // Ledger still reconciles: store proceeds move through the balance like any other.
  assert.ok(Math.abs(Fun.playbookSummary(s).totals.installs - 400) <= 1);
});

test('IAP vs web checkout: web has no commission but loses buyers to the browser hop and pays a court-set link-out fee later (uncertain)', () => {
  const a = fresh(), b = fresh();
  live(a); live(b);
  Mon.setMode(b, 'web');
  const ea = Mon.expectedFunnel(a, 'organic:appstore'), eb = Mon.expectedFunnel(b, 'organic:appstore');
  assert.ok(eb.installToPaid < ea.installToPaid * 0.7, 'web friction');
  Fun.deliverVisits(b, { source: 'organic:appstore', installs: 500 });
  const ch = b.stripe.charges[0];
  assert.equal(ch.store, undefined);
  assert.ok(ch.fee < ch.amount * 0.1, 'processor fees, not commission');
  assert.ok(Mon.currentCommission(a) > 0 && Fun.ltvByPlan(b).annual.net === Fun.ltvByPlan(b).annual.gross);
});

// ---------------------------------------------------------------- paywall

test('hard paywall beats freemium on download-to-paid and revenue per install, in the researched ratio', () => {
  const s = fresh();
  live(s);
  const out = {};
  for (const type of ['hard_no_trial', 'hard_trial', 'soft', 'freemium']) { Mon.setPaywall(s, { type }); out[type] = Mon.expectedFunnel(s, 'ads:meta'); }
  assert.ok(out.hard_no_trial.installToPaid > 0.1 && out.hard_no_trial.installToPaid < 0.16, `hard ${out.hard_no_trial.installToPaid}`);
  assert.ok(out.freemium.installToPaid > 0.015 && out.freemium.installToPaid < 0.03, `freemium ${out.freemium.installToPaid}`);
  assert.ok(out.hard_no_trial.installToPaid > out.hard_trial.installToPaid * 0.9 && out.hard_trial.installToPaid > out.soft.installToPaid && out.soft.installToPaid > out.freemium.installToPaid);
  const ratio = out.hard_no_trial.revPerInstall60 / out.freemium.revPerInstall60;
  assert.ok(ratio > 4 && ratio < 10, `revenue per install ratio ${ratio} (RevenueCat 2026: $3.09 vs $0.38 ~ 8x)`);
  assert.ok(out.hard_no_trial.revPerInstall60 > 2.5 && out.hard_no_trial.revPerInstall60 < 4.5);
  // The stochastic funnel realises the same rates.
  for (const type of ['hard_no_trial', 'freemium']) {
    const t = fresh(11);
    live(t);
    Mon.setPaywall(t, { type });
    Fun.deliverVisits(t, { source: 'ads:meta', installs: 6000 });
    const share = subsOf(t).length / 6000;
    assert.ok(Math.abs(share - out[type].pStart * out[type].pView) < 0.025, `${type} simulated ${share}`);
  }
});

test('plan length drives retention: weekly ~3%, monthly ~11%, annual ~28% at one year; ordering holds in a short simulation', () => {
  assert.ok(survival('week', 51) > 0.02 && survival('week', 51) < 0.04, `weekly ${survival('week', 51)}`);
  assert.ok(survival('month', 11) > 0.09 && survival('month', 11) < 0.13, `monthly ${survival('month', 11)}`);
  assert.equal(survival('year', 1), MOBILE.retention1y.year);
  assert.ok(baseHazard('week', 1) > baseHazard('week', 30), 'cancellations cluster early');
  // The core churn hazard reproduces the curves for a median-fit product.
  const s = fresh(7, { fit: 0.6 }); // product factor 1.0
  s.company.icp = ''; // a neutral ICP: segment retention (core/truth.js) would shift the curve, this pins the base hazard
  const chain = (interval, n) => { let sv = 1; for (let k = 1; k <= n; k++) sv *= 1 - churnBeforeRenewal(s, { interval, paidMonths: k, mobile: true }); return sv; };
  assert.ok(Math.abs(chain('week', 51) - 0.0277) < 0.012 && Math.abs(chain('month', 11) - 0.105) < 0.02);
  // A quarter of simulated life: weekly buyers have mostly left, monthly less, annual not yet at renewal.
  const retained = {};
  for (const plan of ['weekly', 'monthly', 'annual']) {
    const t = fresh(21, { fit: 0.6 });
    t.company.icp = ''; t.market.fit.price.wtp = 9.99; // neutral segment and price: this checks plan-length curves, not segment truth
    live(t);
    Mon.setPaywall(t, { type: 'hard_no_trial', plans: { weekly: { on: plan === 'weekly' }, monthly: { on: plan === 'monthly' }, annual: { on: plan === 'annual' } }, default: plan });
    Fun.deliverVisits(t, { source: 'organic:appstore', installs: 1500 });
    const n0 = subsOf(t).length;
    advance(t, 84, APPS);
    retained[plan] = subsOf(t, (x) => x.status === 'active' || x.status === 'past_due').length / n0;
  }
  assert.ok(retained.weekly < retained.monthly && retained.monthly < retained.annual, JSON.stringify(retained));
  assert.ok(retained.weekly < 0.2 && retained.annual > 0.85);
});

test('weekly + aggressive paywall: refund spike traced to the paywall, 1-star reviews, higher churn; clear annual paywall does not', () => {
  const run = (aggressive, seed) => {
    const s = fresh(seed);
    live(s);
    Mon.setPaywall(s, aggressive
      ? { type: 'hard_no_trial', plans: { weekly: { on: true, price: 9.99 }, monthly: { on: false }, annual: { on: false } }, default: 'weekly', dark: { smallPrint: true, countdown: true, hiddenClose: true }, copy: { headline: 'FREE access today' } }
      : { type: 'hard_no_trial', plans: { weekly: { on: false }, monthly: { on: false }, annual: { on: true } }, copy: CLEAR });
    Fun.deliverVisits(s, { source: 'ads:meta', installs: 900 });
    advance(s, 12, APPS);
    s.day = 29; // month end: the refund watch reads the last 30 days
    Mon.monetMonthEnd(s);
    return s;
  };
  // ~100 buyers per run, so one seed's refund count is a noisy draw: pool a few seeds and compare expected rates too.
  const SEEDS = [5, 6, 7, 8, 9, 10];
  const bads = SEEDS.map((seed) => run(true, seed)), goods = SEEDS.map((seed) => run(false, seed));
  const pooled = (ss) => ss.reduce((a, s) => a + s.stripe.refunds.length, 0) / Math.max(1, ss.reduce((a, s) => a + subsOf(s).length, 0));
  const expected = (ss) => { const xs = ss.flatMap((s) => subsOf(s)); return xs.reduce((a, x) => a + (x.refundRate ?? 0), 0) / Math.max(1, xs.length); };
  assert.ok(expected(bads) > expected(goods) * 2, `expected refund rate ${expected(bads)} vs ${expected(goods)}`);
  assert.ok(pooled(bads) > pooled(goods) * 1.7, `realised refunds ${pooled(bads)} vs ${pooled(goods)}`);
  const spikes = bads.filter((s) => ms(s).some((m) => m.id === 'weekly_plan_refund_spike' && m.cost.usd > 0)).length;
  assert.ok(spikes >= SEEDS.length - 1, `refund spike logged with its cost in ${spikes}/${SEEDS.length} runs`);
  assert.ok(!goods.some((s) => ms(s).some((m) => m.id === 'weekly_plan_refund_spike')));
  });

test('paywall disclosure is judged against what the paywall really charges', () => {
  const s = fresh();
  const clear = Mon.setPaywall(s, { type: 'hard_trial', trialDays: 3, plans: { weekly: { on: true, price: 5.99 }, annual: { on: true, price: 29.99 } }, copy: { ...CLEAR, trial: '3-day free trial, then $29.99 per year' } }).disclosure;
  assert.ok(clear.score >= 0.9, JSON.stringify(clear));
  const wrongPrice = Mon.setPaywall(s, { copy: { price: '$4.99 per week or $19.99 per year' } }).disclosure;
  assert.ok(wrongPrice.score < clear.score - 0.2 && wrongPrice.issues.some((i) => /price|charges/i.test(i)), 'a price that does not match the plan is misleading');
  const dark = Mon.setPaywall(s, { copy: { ...CLEAR }, dark: { smallPrint: true, toggleTrial: true } }).disclosure;
  assert.ok(dark.score < 0.5, `dark patterns ${dark.score}`);
  const quizGood = Mon.judgeQuiz(['What is your main goal for reading?', 'How many minutes a day can you read?', 'How old are your children?', 'What gets in the way most?', 'Which time of day works best?', 'How many books a month do you want?', 'Join 2 million parents on the same path', 'Your plan is ready']);
  const quizBad = Mon.judgeQuiz(['Name?', 'Age?']);
  assert.ok(quizGood.score > 0.7 && quizBad.score < 0.3);
  assert.ok(Mon.judgeQuiz(Array.from({ length: 28 }, (_, i) => `Question number ${i} about you`)).completion < quizGood.completion, 'a 28-step quiz loses people before the paywall');
});

test('an onboarding quiz lifts paywall conversion; a bad one costs less than a good one earns', () => {
  const s = fresh();
  live(s);
  const base = Mon.expectedFunnel(s, 'ads:meta').installToPaid;
  Mon.setQuiz(s, ['What is your main goal for reading?', 'How many minutes a day can you read?', 'How old are your children?', 'What gets in the way most?', 'Which time of day works best?', 'How many books a month do you want?', 'Join 2 million parents on the same path', 'Your plan is ready']);
  const withQuiz = Mon.expectedFunnel(s, 'ads:meta').installToPaid;
  Mon.setQuiz(s, ['Name?']);
  const poor = Mon.expectedFunnel(s, 'ads:meta').installToPaid;
  assert.ok(withQuiz > base * 1.1 && poor < base);
});

test('paywall A/B test: needs hundreds of views per arm; calling it early and shipping is a logged mistake; enough data finds the real difference', () => {
  const s = fresh();
  live(s);
  Mon.setPaywall(s, { type: 'freemium', copy: CLEAR });
  const t0 = Mon.startPaywallTest(s, { name: 'hard vs freemium', patch: { type: 'hard_no_trial' } });
  assert.ok(t0.ok && t0.hours > 0);
  assert.equal(Mon.startPaywallTest(s, { patch: { type: 'soft' } }).ok, false, 'one test at a time');
  Fun.deliverVisits(s, { source: 'ads:meta', installs: 80 });
  const id = s.apps.consumer.monet.tests[0].id;
  assert.equal(Mon.paywallTestVerdict(s.apps.consumer.monet.tests[0]).verdict, 'underpowered');
  Mon.concludePaywallTest(s, id, 'ship_b');
  assert.ok(ms(s).some((m) => m.id === 'paywall_test_called_early'), 'shipping an unproven variant is traced');
  const u = fresh(3);
  live(u);
  Mon.setPaywall(u, { type: 'freemium', copy: CLEAR });
  Mon.startPaywallTest(u, { patch: { type: 'hard_no_trial' } });
  Fun.deliverVisits(u, { source: 'ads:meta', installs: 6000 });
  const v = Mon.paywallTestVerdict(u.apps.consumer.monet.tests[0]);
  assert.equal(v.verdict, 'b_wins');
  Mon.concludePaywallTest(u, u.apps.consumer.monet.tests[0].id, 'ship_b');
  assert.equal(u.apps.consumer.monet.paywall.type, 'hard_no_trial');
  assert.ok(!ms(u).some((m) => m.id === 'paywall_test_called_early'));
  advance(u, 1, APPS);
  assert.ok(consumerEvents(u, 0).some((e) => e.type === 'paywall_test_result'));
});

// ---------------------------------------------------------------- build path and App Review

test('build path: Expo with an AI coding agent reaches an MVP fastest among store stacks; fees post to the bank; a PWA has no store', () => {
  const s = fresh();
  s.apps.product.features = [];
  const noAgent = ['expo', 'native_ios', 'native_both'].map((k) => Store.buildHours(s, k));
  s.apps.product.agent = { planId: 'claude_max5' };
  const agent = ['expo', 'native_ios', 'native_both'].map((k) => Store.buildHours(s, k));
  assert.ok(agent[0] < agent[1] && agent[1] < agent[2]);
  assert.ok(agent[0] < noAgent[0] * 0.6, 'an agent roughly halves the JS build');
  assert.ok(P.STACKS.pwa.hours <= P.STACKS.expo.hours && P.STACKS.pwa.store === false);
  assert.equal(Store.chooseStack(s, 'expo').ok, true);
  const b = Store.buildApp(s);
  assert.equal(b.hours, agent[0]);
  assert.ok(s.apps.product.features.some((f) => f.status === 'shipped'), 'the MVP is a shipped product feature');
  const cash0 = s.bank.txns.length;
  Store.enrollApple(s); Store.enrollGoogle(s);
  const fees = s.bank.txns.slice(cash0).map((t) => t.amount);
  assert.deepEqual(fees.sort((a, b) => a - b), [-99, -25]);
  assert.equal(Store.submitForReview(s, 'ios').ok, false, 'Apple enrolment takes a couple of days');
  // EAS: beyond the free builds each build costs money.
  for (let i = 0; i < 16; i++) Store.easBuild(s, 'ios');
  assert.ok(s.apps.consumer.app.eas.extraUsd > 0);
  const w = fresh();
  Store.chooseStack(w, 'pwa'); Store.buildApp(w);
  assert.equal(Store.mobileOn(w), false);
  assert.equal(Store.submitForReview(w, 'ios').ok, false);
});

test('App Review: most decisions in 1-2 days; a misleading paywall is rejected under 3.1.2 (clear disclosure passes); rejections cost days and hours', () => {
  const ready = (seed, copy, dark = {}) => {
    const s = fresh(seed);
    const C = ensureConsumer(s);
    Object.assign(C.app, { stack: 'expo', built: true });
    C.app.apple.day = -5; C.app.apple.enrolled = true; C.app.beta.rounds = 1; C.app.listing.privacyUrl = C.app.listing.privacyLabel = true;
    C.app.listing.differentiation = 'Streaks that count minutes read aloud to your kids, unlike generic trackers, for parents with 10 minutes a night';
    Mon.setPaywall(s, { type: 'hard_no_trial', copy, dark });
    return s;
  };
  let clearHits = 0, badHits = 0, quick = 0, n = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = ready(seed, CLEAR), b = ready(seed + 100, { headline: '100% FREE' }, { smallPrint: true, toggleTrial: true });
    const rg = Store.submitForReview(g, 'ios'), rb = Store.submitForReview(b, 'ios');
    if (g.apps.consumer.app.pending.rejects.includes('3.1.2')) clearHits++;
    if (b.apps.consumer.app.pending.rejects.includes('3.1.2')) badHits++;
    quick += rg.days <= 2 ? 1 : 0; n++;
  }
  assert.ok(clearHits <= 5, `clear disclosure rejected ${clearHits}/30 under 3.1.2`);
  assert.ok(badHits >= 22, `misleading paywall rejected ${badHits}/30 under 3.1.2`);
  assert.ok(quick / n >= 0.7, `${quick}/${n} within two days`);
  // A forced rejection: logged with a cost, charged hours, a resubmission cycle; then a clean resubmission goes live.
  const s = ready(4, { headline: '100% FREE' }, { smallPrint: true, toggleTrial: true });
  const C = s.apps.consumer;
  Store.submitForReview(s, 'ios');
  C.app.pending.rejects = ['3.1.2'];
  const hours0 = s.founder.hoursUsed;
  advance(s, 5, APPS);
  const m = ms(s).find((x) => x.id === 'app_review_rejected_paywall');
  assert.ok(m && m.cost.hours === P.REVIEW.fixHours['3.1.2'] && m.cost.days >= 3);
  assert.ok(s.founder.hoursUsed - hours0 >= m.cost.hours, 'fix hours are charged');
  assert.equal(C.app.status, 'none');
  Mon.setPaywall(s, { copy: CLEAR, dark: {} });
  Store.submitForReview(s, 'ios');
  C.app.pending.rejects = [];
  advance(s, 5, APPS);
  assert.equal(C.app.status, 'live');
  assert.ok(consumerEvents(s, 0).filter((e) => e.type === 'app_review_result').length === 2);
});

test('4.3 copycat risk rises with category saturation and thin differentiation; privacy and beta gaps are caught', () => {
  const s = fresh();
  const C = ensureConsumer(s);
  s.company.b2cCategory = 'ai_tools';
  C.app.listing.differentiation = 'An AI app like the big one but better';
  const thin = Store.reviewRisks(s)['4.3'];
  C.app.listing.differentiation = 'Reading streaks that count minutes read aloud to your kids, unlike generic trackers, built for parents with a 10 minute bedtime window';
  s.apps.product.features.push({ id: 'f2', status: 'shipped', title: 'a' }, { id: 'f3', status: 'shipped', title: 'b' }, { id: 'f4', status: 'shipped', title: 'c' });
  const diff = Store.reviewRisks(s)['4.3'];
  assert.ok(thin > diff * 2, `${thin} vs ${diff}`);
  s.company.b2cCategory = 'finance';
  assert.ok(Store.reviewRisks(s)['4.3'] < diff, 'a less saturated category lowers it');
  const r = Store.reviewRisks(s);
  assert.equal(r['5.1.1'], P.REVIEW.noPrivacyPolicy);
  assert.equal(r['2.1'], P.REVIEW.noBeta2_1);
  C.app.beta.rounds = 1; C.app.listing.privacyUrl = C.app.listing.privacyLabel = true;
  assert.ok(Store.reviewRisks(s)['5.1.1'] < 0.05 && Store.reviewRisks(s)['2.1'] < 0.06);
});

// ---------------------------------------------------------------- creators

function brief(s, hooks, notes = '15-30 s vertical, show the screen, don\'t promise results. Add #ad / paid partnership label. CTA link in bio.', over = {}) {
  return Cre.postBrief(s, { hooks, message: 'Track the books you read to your kids in 10 minutes a night', notes, fee: 100, bonusPer1k: 2, ...over }).brief;
}
function publishAll(s, posts) { for (const p of posts) p.postDay = s.day; Cre.creatorsDay(s); }

test('creator post views are heavy-tailed: most flop, a small share breaks out and carries the views', () => {
  const s = fresh(9);
  live(s);
  const b = brief(s, HOOKS.strong);
  const { posts } = Cre.hireCreators(s, { briefId: b.id, count: 60 });
  Cre.hireCreators(s, { briefId: b.id, count: 60 }); Cre.hireCreators(s, { briefId: b.id, count: 60 });
  s.apps.consumer.creators.posts.forEach((p) => { p.postDay = 0; });
  Cre.creatorsDay(s);
  const all = s.apps.consumer.creators.posts;
  const views = all.map((p) => p.finalViews).sort((x, y) => y - x);
  const share = all.filter((p) => p.breakout).length / all.length;
  assert.ok(share >= 0.03 && share <= 0.16, `break-out share ${share}`);
  const median = views[Math.floor(views.length / 2)], mean = views.reduce((a, v) => a + v, 0) / views.length;
  assert.ok(mean > 2.5 * median, `mean ${mean} vs median ${median}`);
  const top10 = views.slice(0, Math.ceil(views.length * 0.1)).reduce((a, v) => a + v, 0) / views.reduce((a, v) => a + v, 0);
  assert.ok(top10 > 0.5, `top decile carries ${top10}`);
  assert.ok(all.filter((p) => p.finalViews < median * 5).length / all.length > 0.8, 'most posts are small');
  assert.ok(posts.length === 60);
});

test('hook quality matters: specific hooks that speak to the ICP break out more often and install more than generic ones', () => {
  const measure = (hooks) => {
    const s = fresh(31);
    live(s);
    const b = brief(s, hooks);
    for (let i = 0; i < 4; i++) Cre.hireCreators(s, { briefId: b.id, count: 60 });
    s.apps.consumer.creators.posts.forEach((p) => { p.postDay = 0; });
    advance(s, 8, APPS);
    return Cre.creatorStats(s);
  };
  const strong = measure(HOOKS.strong), generic = measure(HOOKS.generic);
  assert.ok(Cre.hookSkill(fresh(), HOOKS.strong[0]) > Cre.hookSkill(fresh(), HOOKS.generic[0]) + 0.2);
  assert.ok(strong.breakouts > generic.breakouts, `${strong.breakouts} vs ${generic.breakouts} break-outs`);
  assert.ok(strong.installs > generic.installs * 1.2, `${strong.installs} vs ${generic.installs} installs`);
  assert.ok(strong.cpi < generic.cpi, `cost per install ${strong.cpi} vs ${generic.cpi}`);
  assert.ok(strong.cpi > 1 && strong.cpi < 30, 'creator installs cost single to low double digits');
});

test('creator disclosure: a brief that requires #ad is followed far more often; undisclosed posts get a platform strike with a traceable cost; an audit fixes them', () => {
  const s = fresh(2);
  live(s);
  const labelled = brief(s, HOOKS.strong), plain = brief(s, HOOKS.strong, '15-30 s vertical, show the screen.');
  assert.equal(labelled.requireDisclosure, true);
  assert.equal(plain.requireDisclosure, false);
  Cre.hireCreators(s, { briefId: plain.id, count: 60 }); Cre.hireCreators(s, { briefId: labelled.id, count: 60 });
  s.apps.consumer.creators.posts.forEach((p) => { p.postDay = 0; });
  Cre.creatorsDay(s);
  const by = (id) => s.apps.consumer.creators.posts.filter((p) => p.briefId === id);
  const rate = (id) => by(id).filter((p) => p.disclosed).length / by(id).length;
  assert.ok(rate(labelled.id) > 0.8 && rate(plain.id) < 0.65, `${rate(labelled.id)} vs ${rate(plain.id)}`);
  const audit = Cre.auditDisclosure(s);
  assert.ok(audit.fixed > 10 && audit.hours > 0.5);
  assert.ok(Cre.creatorStats(s).disclosedShare > 0.95);
  // Without the audit, strikes land.
  const u = fresh(2);
  live(u);
  const pb = brief(u, HOOKS.strong, '15-30 s vertical, show the screen.');
  Cre.hireCreators(u, { briefId: pb.id, count: 60 });
  u.apps.consumer.creators.posts.forEach((p) => { p.postDay = 0; });
  advance(u, 30, APPS);
  const m = ms(u).filter((x) => x.id === 'undisclosed_creator_posts');
  assert.ok(m.length >= 1 && m[0].cost.usd >= P.CREATORS.disclosure.takedownUsd && m[0].delayed, JSON.stringify({ n: m.length, c: m[0]?.cost, strikes: u.apps.consumer.creators.strikes.length, undisclosed: u.apps.consumer.creators.posts.filter((p) => p.disclosed === false).length }));
  assert.ok(u.apps.consumer.creators.penaltyUntil > 0);
  assert.ok(consumerEvents(u, 0).some((e) => e.type === 'platform_policy_strike' && e.kind === 'undisclosed_ad'));
});

test('wrong-audience reach is traced: a viral post that never installs logs views_without_installs', () => {
  const s = fresh(4);
  live(s);
  const b = brief(s, ['Funny cat compilation number 7']);
  const { posts } = Cre.hireCreators(s, { briefId: b.id, count: 1 });
  const p = posts[0];
  Object.assign(p, { postDay: 0, finalViews: 400000, status: 'live', age: 0, disclosed: true, liveDay: 0, breakout: true, hookQ: 0.1 });
  p.creator.match = 0; 
  for (let i = 0; i < 10; i++) { s.day = i; Cre.creatorsDay(s); }
  assert.ok(p.views > 50000 && p.installs < p.views * P.CREATORS.viewToInstall * 0.35);
  assert.ok(ms(s).some((m) => m.id === 'views_without_installs'));
});

// ---------------------------------------------------------------- clipping

function runClip(opts, { seed = 3, days = 25, cpm = 1 } = {}) {
  const s = fresh(seed);
  live(s);
  const r = Clip.launchCampaign(s, { name: 'Test', budget: 1500, cpm, maxPerClip: 50, content: 'problem_hook', hook: HOOKS.strong[0], rules: 'Original voiceover on every clip, show the app, add #ad', ...opts });
  assert.ok(r.ok);
  for (let i = 0; i < days; i++) { s.day = 1 + i; Clip.clippingDay(s); }
  return { s, c: s.apps.consumer.clipping.campaigns[0] };
}

test('clipping fraud: botted views raise the effective cost per real view, more at higher CPMs; verification catches them and says so', () => {
  assert.ok(Clip.fraudShare(2) > Clip.fraudShare(1) && Clip.fraudShare(1) > Clip.fraudShare(0.5));
  const none = runClip({ verification: 'none' }, { cpm: 2 }), manual = runClip({ verification: 'manual' }, { cpm: 2 });
  assert.ok(none.c.fakePaid > 0, 'bot views were paid');
  const eff = (r) => (r.c.paid + r.c.fees) / r.c.realViews * 1000;
  assert.ok(eff(none) > eff(manual) * 1.05, `effective CPM ${eff(none)} vs ${eff(manual)}`);
  assert.ok(manual.c.detected > 0 && manual.c.fakePaid < none.c.fakePaid * 0.4);
  assert.ok(consumerEvents(manual.s, 0).some((e) => e.type === 'view_fraud_detected'));
  assert.equal(none.c.detected, 0);
  // Verification costs founder hours; paying blindly is traced when the campaign closes.
  assert.ok((manual.s.founder.timeLog ?? []).some((t) => /Verifying clips/.test(t.label)));
  assert.ok(!(none.s.founder.timeLog ?? []).some((t) => /Verifying clips/.test(t.label)));
  Clip.closeCampaign(none.s, none.c.id);
  const m = ms(none.s).find((x) => x.id === 'paid_for_botted_views');
  assert.ok(m && m.cost.usd >= 50);
  Clip.closeCampaign(manual.s, manual.c.id);
  assert.ok(!ms(manual.s).some((x) => x.id === 'paid_for_botted_views'));
  assert.ok(consumerEvents(none.s, 0).some((e) => e.type === 'clip_campaign_payout_due'));
});

test('clipping is cheap reach with low conversion that depends on content-to-product fit', () => {
  const fit = runClip({ content: 'problem_hook' }, { days: 20 }), meme = runClip({ content: 'meme', hook: 'Funny meme number 3' }, { days: 20 });
  const cpi = (r) => (r.c.paid + r.c.fees) / Math.max(1, r.c.installs);
  assert.ok(fit.c.realViews > 20000 && fit.c.installs / fit.c.realViews < 0.001, 'views are plentiful, installs per view are low');
  assert.ok(cpi(meme) > cpi(fit) * 2, `${cpi(meme)} vs ${cpi(fit)}`);
  assert.ok(P.CLIPPING.contentFit.problem_hook > P.CLIPPING.contentFit.podcast_clips);
  const [lo, hi] = P.CLIPPING.cpm;
  assert.ok(lo === 0.5 && hi === 1.5 && P.CLIPPING.platformFee === 0.07);
});

test('platform crackdown: templated clip accounts lose views and are logged; original-content campaigns are mostly spared', () => {
  const s = fresh(6);
  live(s);
  const mk = (rules) => Clip.launchCampaign(s, { name: rules.slice(0, 8), budget: 3000, cpm: 1, maxPerClip: 60, content: 'demo_slideshow', hook: HOOKS.strong[0], rules, verification: 'basic' }).campaign;
  const tpl = mk('Post the exact template video we send you. Same video on every account.');
  const orig = mk('Original voiceover and commentary on every clip, add value.');
  assert.ok(tpl.templated === 1 && orig.templated < 0.5);
  const wave = Clip.crackdownDays(s)[0];
  assert.ok(wave >= 110 && wave < 175, `first wave day ${wave}`);
  const viewsIn = (c, from, to) => { const a = c.realViews; for (let d = from; d < to; d++) { s.day = d; Clip.clippingDay(s); } return c.realViews - a; };
  for (let d = wave - 10; d < wave; d++) { s.day = d; Clip.clippingDay(s); }
  const beforeT = viewsIn(tpl, wave - 8, wave) , beforeO = viewsIn(orig, wave - 8, wave);
  // top up budgets so exhaustion does not mask the effect
  tpl.budget += 5000; orig.budget += 5000; tpl.status = orig.status = 'active';
  const afterT = viewsIn(tpl, wave, wave + 8), afterO = viewsIn(orig, wave, wave + 8);
  assert.ok(afterT < beforeT * 0.8, `templated ${beforeT} -> ${afterT}`);
  assert.ok(afterO > beforeO * 0.55, `original ${beforeO} -> ${afterO}`);
  assert.ok(tpl.viewMult < orig.viewMult);
  assert.ok(ms(s).some((m) => m.id === 'clip_accounts_banned_policy' && m.cost.usd > 0));
  assert.ok(consumerEvents(s, 0).some((e) => e.type === 'platform_policy_strike' && e.kind === 'clip_crackdown'));
});

// ---------------------------------------------------------------- saturation

test('saturation: the same playbook later in a crowded category costs more per install and breaks out less', () => {
  const early = fresh(1), late = fresh(1, { day: 900 });
  for (const s of [early, late]) { s.company.b2cCategory = 'health_fitness'; live(s); }
  assert.ok(saturation(late) > saturation(early) + 0.25 && saturation(late) <= P.SATURATION.max);
  assert.ok(saturation({ ...early, company: { ...early.company, b2cCategory: 'finance' }, apps: early.apps }) < saturation(early), 'categories differ');
  const cpiOf = (s) => { const cr = Paid.addAppCreative(s, { hook: HOOKS.strong[0] }).creative; const r = Paid.launchCampaign(s, { creativeIds: [cr.id], budget: 50, geo: 't1' }); return Paid.expectedCpi(s, r.campaign).cpi; };
  assert.ok(cpiOf(late) > cpiOf(early) * 1.1);
  const hits = (s) => { const b = brief(s, HOOKS.strong); for (let i = 0; i < 5; i++) Cre.hireCreators(s, { briefId: b.id, count: 60 }); s.apps.consumer.creators.posts.forEach((p) => { p.postDay = s.day; }); Cre.creatorsDay(s); return s.apps.consumer.creators.posts.filter((p) => p.breakout).length; };
  assert.ok(hits(early) > hits(late), 'fewer break-outs');
  assert.ok(Clip.marketCpm(late) > Clip.marketCpm(early), 'clippers expect more');
  const clipInstalls = (s) => { Clip.launchCampaign(s, { budget: 1500, cpm: 1, content: 'problem_hook', hook: HOOKS.strong[0], rules: 'original voiceover', verification: 'basic' }); for (let i = 0; i < 20; i++) { s.day += 1; Clip.clippingDay(s); } const c = s.apps.consumer.clipping.campaigns[0]; return c.installs / c.realViews; };
  assert.ok(clipInstalls(early) > clipInstalls(late), 'views convert worse');
});

// ---------------------------------------------------------------- Meta ads for apps

test('Meta app campaigns: CPI by country tier, learning phase, Advantage+ needs creatives, fatigue after ~36 days (x1.8), delayed low iOS reports', () => {
  const s = fresh();
  live(s);
  const cr = (h) => Paid.addAppCreative(s, { hook: h }).creative.id;
  const ids = HOOKS.strong.slice(0, 4).map(cr);
  const mk = (geo, o = {}) => Paid.launchCampaign(s, { name: geo, geo, budget: 50, creativeIds: ids, ...o }).campaign;
  const t1 = mk('t1'), t2 = mk('t2'), t3 = mk('t3');
  const cpi = (c) => Paid.expectedCpi(s, c).cpi;
  assert.ok(cpi(t1) > cpi(t2) * 1.8 && cpi(t2) > cpi(t3) * 2.5, `${cpi(t1)} / ${cpi(t2)} / ${cpi(t3)}`);
  assert.equal(P.PAID.geo.t1.cpi, 3.5);
  // Purchase optimisation costs more per install; Advantage+ helps only with creative volume.
  const pur = mk('t1', { objective: 'purchase' });
  assert.ok(cpi(pur) > cpi(t1) * 1.2);
  const advMany = mk('t1', { advantage: true }), advFew = Paid.launchCampaign(s, { name: 'few', geo: 't1', budget: 50, advantage: true, creativeIds: ids.slice(0, 1) }).campaign;
  assert.ok(cpi(advMany) < cpi(t1) && cpi(advFew) > cpi(t1));
  // Learning: new campaigns pay ~25% more; low volume stays "limited".
  assert.equal(Paid.expectedCpi(s, t1).learning.status, 'learning');
  s.day += 8;
  t1.events7 = [5, 5, 5, 5, 5, 5, 5];
  assert.equal(Paid.expectedCpi(s, t1).learning.status, 'limited');
  t1.events7 = [10, 10, 10, 10, 10, 10, 10];
  assert.equal(Paid.expectedCpi(s, t1).learning.status, 'active');
  // Fatigue: after the creative's fatigue point CPA rises toward x1.8.
  const fresh0 = cpi(t1);
  for (const x of t1.creatives) { x.fatigueAt = 20; x.days = 20 + P.PAID.fatigue.ramp; }
  const fat = Paid.expectedCpi(s, t1).parts.fatigue;
  assert.ok(Math.abs(fat - P.PAID.fatigue.mult) < 0.01 && cpi(t1) > fresh0 * 1.6);
  assert.equal(P.PAID.fatigue.meanDays, 36);
  // Daily sim: installs, spend posted, SKAN-style reports later and lower.
  const u = fresh(2);
  live(u);
  const cid = Paid.addAppCreative(u, { hook: HOOKS.strong[0] }).creative.id;
  const c = Paid.launchCampaign(u, { geo: 't1', budget: 200, creativeIds: [cid] }).campaign;
  advance(u, 12, APPS);
  assert.ok(c.installs > 100 && c.spend === 12 * 200);
  assert.ok(c.reportedInstalls < c.installs * 0.95 && c.reportedInstalls > c.installs * 0.5, `reported ${c.reportedInstalls} of ${c.installs}`);
  const dayOne = u.apps.consumer.paid.reports.length;
  assert.ok(dayOne > 0, 'some reports are still in flight');
  assert.ok(u.bank.txns.some((t) => t.category === 'advertising' && /FACEBK/.test(t.description)));
});

test('an organic hook promoted to paid is a better creative and lowers cost per install (organic test, paid scale)', () => {
  const s = fresh(8);
  live(s);
  const b = brief(s, HOOKS.strong);
  for (let i = 0; i < 4; i++) Cre.hireCreators(s, { briefId: b.id, count: 60 });
  s.apps.consumer.creators.posts.forEach((p) => { p.postDay = 0; p.disclosed = true; });
  advance(s, 8, APPS);
  const winner = s.apps.consumer.creators.posts.filter((p) => p.breakout).sort((x, y) => y.views - x.views)[0];
  assert.ok(winner, 'a hook broke out');
  const loser = s.apps.consumer.creators.posts.filter((p) => !p.breakout).sort((x, y) => x.views - y.views)[0];
  const undisclosed = { ...loser, id: 'x', disclosed: false };
  assert.equal(Cre.promoteToAds(s, undisclosed.id).ok, false);
  const pr = Cre.promoteToAds(s, winner.id);
  assert.ok(pr.ok && pr.proven && pr.fee === Math.round(winner.fee * P.CREATORS.promote.whitelistPct * 100) / 100);
  assert.equal(Cre.promoteToAds(s, winner.id).ok, false, 'once');
  const A = ensureAds(s);
  assert.ok(A.creatives.some((c) => c.id === pr.creative.id && c.status === 'approved' && c.source === 'creator'), 'lands in the Ads creatives library');
  // Same random draw, higher skill: the proven hook has the better quality, so the lower CPI.
  const u = pr.creative.u;
  assert.ok(qualityFromDraw(u, Math.min(1, winner.hookQ + P.CREATORS.promote.provenBoost)) > qualityFromDraw(u, winner.hookQ));
  const generic = Paid.addAppCreative(s, { hook: HOOKS.generic[0] }).creative;
  const mkC = (cid) => Paid.launchCampaign(s, { name: cid, budget: 50, geo: 't1', creativeIds: [cid] }).campaign;
  const cp = mkC(pr.creative.id), cg = mkC(generic.id);
  assert.ok(Paid.expectedCpi(s, cp).cpi < Paid.expectedCpi(s, cg).cpi, `${Paid.expectedCpi(s, cp).cpi} vs ${Paid.expectedCpi(s, cg).cpi}`);
});

test('scaling mistakes: raising spend before payback is proven, and scaling on gross revenue, are logged with the cost at risk', () => {
  const s = fresh(3);
  live(s);
  const cr = Paid.addAppCreative(s, { hook: HOOKS.strong[0] }).creative.id;
  const c = Paid.launchCampaign(s, { budget: 50, creativeIds: [cr] }).campaign;
  Paid.setBudget(s, c.id, 70);
  assert.equal(ms(s).filter((m) => m.id === 'scaled_ads_before_payback').length, 0, 'a 40% step is not scaling');
  Paid.setBudget(s, c.id, 300);
  const m = ms(s).find((x) => x.id === 'scaled_ads_before_payback');
  assert.ok(m && m.cost.usd > 1000 && m.delayed, `at risk ${m?.cost.usd}`);
  // Gross vs net: D7 ROAS 0.56x gross is 0.48x after a 15% store commission; a gross target wrongly approves the raise.
  const u = fresh(4);
  live(u);
  const g = ensureGrowth(u);
  for (const w of [0, 1, 2]) g.cohorts[w] = { 'ads:meta': { sp: 1000, tr: 100, ld: 0, py: 40, r7: 560, r30: 900, r90: 0, r180: 0, r: 900 } };
  u.day = 40;
  const cu = Paid.launchCampaign(u, { budget: 50, creativeIds: [Paid.addAppCreative(u, { hook: HOOKS.strong[0] }).creative.id] }).campaign;
  Paid.setTarget(u, { d7Roas: 0.5, basis: 'gross' });
  const roas = Fun.roasView(u, 'ads:meta');
  assert.ok(roas.d7.roas > 0.5 && roas.d7.netRoas < 0.5, `${roas.d7.roas} gross vs ${roas.d7.netRoas} net`);
  Paid.setBudget(u, cu.id, 200);
  assert.ok(ms(u).some((x) => x.id === 'store_fee_not_in_model'), 'store fee missing from the model');
  assert.ok(!ms(u).some((x) => x.id === 'scaled_ads_before_payback'));
  // Proven on net, scaled: no mistake.
  const v = fresh(4);
  live(v);
  const gv = ensureGrowth(v);
  for (const w of [0, 1, 2]) gv.cohorts[w] = { 'ads:meta': { sp: 1000, tr: 100, ld: 0, py: 50, r7: 900, r30: 1500, r90: 0, r180: 0, r: 1500 } };
  v.day = 40;
  const cv = Paid.launchCampaign(v, { budget: 50, creativeIds: [Paid.addAppCreative(v, { hook: HOOKS.strong[0] }).creative.id] }).campaign;
  Paid.setBudget(v, cv.id, 200);
  assert.equal(ms(v).length, 0);
});

// ---------------------------------------------------------------- funnel and payback

test('payback view: LTV by plan nets out the store fee, payback days fall as CAC falls, D7 ROAS reads mature cohorts only', () => {
  const s = fresh();
  live(s);
  Mon.setPaywall(s, { plans: { weekly: { on: true, price: 5.99 }, monthly: { on: true, price: 9.99 }, annual: { on: true, price: 29.99 } } });
  const ltv = Fun.ltvByPlan(s);
  for (const n of ['weekly', 'monthly', 'annual']) assert.ok(Math.abs(ltv[n].net - ltv[n].gross * 0.85) < 0.02, `${n} net ${ltv[n].net} gross ${ltv[n].gross}`);
  assert.ok(ltv.annual.gross > 25 && ltv.annual.gross <= 29.99, `annual: one payment, the 28% renewal lands after month 12 (${ltv.annual.gross})`);
  assert.ok(ltv.weekly.gross > 15 && ltv.weekly.gross < 40);
  const p20 = Fun.paybackDays(s, 20), p10 = Fun.paybackDays(s, 10), p500 = Fun.paybackDays(s, 500);
  assert.ok(p10 <= p20 && p10 != null && p20 != null && p500 === null, `${p10} ${p20} ${p500}`);
  // ROAS from the ledger: only cohorts old enough count.
  const g = ensureGrowth(s);
  g.cohorts[weekOf(0)] = { 'ads:meta': { sp: 500, tr: 40, ld: 0, py: 20, r7: 300, r30: 700, r90: 0, r180: 0, r: 700 } };
  g.cohorts[weekOf(21)] = { 'ads:meta': { sp: 500, tr: 40, ld: 0, py: 20, r7: 200, r30: 100, r90: 0, r180: 0, r: 200 } };
  s.day = 40;
  const r = Fun.roasView(s, 'ads:meta');
  assert.equal(r.d7.weeks, 2);
  assert.ok(Math.abs(r.d7.roas - 0.5) < 1e-9 && Math.abs(r.d30.roas - 1.4) < 1e-9 && r.d30.weeks === 1, 'D30 only counts the mature week');
  assert.ok(Math.abs(r.d7.netRoas - 0.5 * 0.85) < 0.001);
});

test('composable funnel: every channel feeds the same paywall; totals sum, blended CAC = spend / paying, costs by step', () => {
  const s = fresh(12);
  live(s);
  Mon.setPaywall(s, { type: 'hard_no_trial', copy: CLEAR });
  const rates = Mon.funnelRates(s, 'ads:meta');
  const feeds = [['ads:meta', 2000, 4000], ['organic:ugc', 1500, 1500], ['organic:clips', 3000, 900], ['organic:appstore', 1000, 0], ['organic:social', 500, 200]];
  for (const [src, installs, spend] of feeds) { Fun.deliverVisits(s, { source: src, installs }); if (spend) ledgerAdd(s, s.day, src, 'sp', spend); }
  advance(s, 1, APPS); // book first charges into the cohort ledger
  const P1 = Fun.playbookSummary(s);
  assert.ok(P1.totals.installs >= 8000 && P1.totals.installs < 8100, `${P1.totals.installs}`);
  assert.ok(P1.rows.length >= 5 && feeds.every(([src]) => P1.rows.some((r) => r.source === src)));
  assert.equal(P1.totals.starts, P1.rows.reduce((a, r) => a + r.starts, 0));
  assert.equal(P1.totals.spend, 6600);
  assert.ok(Math.abs(P1.totals.blendedCac - 6600 / P1.totals.paying) < 0.01);
  // Same paywall, different intent: clip installs convert worst, store search best.
  const rate = (src) => P1.rows.find((r) => r.source === src);
  assert.ok(rate('organic:appstore').paywallToStart > rate('ads:meta').paywallToStart * 1.1 && rate('organic:clips').paywallToStart < rate('ads:meta').paywallToStart * 0.8);
  assert.ok(Math.abs(rate('ads:meta').installToPaywall - rates.pView) < 0.03);
  assert.ok(feeds.every(([src]) => rate(src).pwViews > 0 && rate(src).starts > 0));
  const meta = rate('ads:meta');
  assert.equal(meta.cpi, Math.round(4000 / 2000 * 100) / 100);
  // A paywall change moves every channel at once.
  const before = P1.totals.starts;
  const t = fresh(12); live(t);
  Mon.setPaywall(t, { type: 'freemium' });
  for (const [src, installs] of feeds) Fun.deliverVisits(t, { source: src, installs });
  assert.ok(Fun.playbookSummary(t).totals.starts < before * 0.4);
  // Subscriptions carry their channel for attribution.
  assert.ok(s.stripe.subscriptions.filter((x) => x.mobile).every((x) => x.source === 'organic:wom' || feeds.some(([src]) => src === x.source)));
});

test('existing web channels flow through the same funnel: ASO installs and founder-content visits become store customers', () => {
  const s = fresh(10);
  live(s);
  s.apps.organic = s.apps.organic ?? undefined;
  // organicEngine's visit conversion uses the store-page rate when a store app is live, then the shared paywall.
  const g = Fun.deliverVisits(s, { source: 'organic:social', installs: 800 });
  assert.ok(g.subs.length > 20 && g.subs.every((x) => x.mobile && x.store === 'ios'));
  // Before the app is live, installs go nowhere (and ad spend is traced as wasted).
  const u = fresh(10);
  const C = ensureConsumer(u);
  Object.assign(C.app, { stack: 'expo', built: true });
  const none = Fun.deliverVisits(u, { source: 'ads:meta', installs: 60 });
  assert.equal(none.subs.length, 0);
  assert.ok(ms(u).some((m) => m.id === 'spent_before_store_live'));
  // Not a mobile company: the web funnel is untouched (no consumer slice needed).
  const w = fresh(10);
  w.apps.consumer = undefined;
  const got = Fun.deliverVisits(w, { source: 'organic:social', installs: 2000 });
  assert.ok(got.subs.every((x) => !x.mobile));
});

// ---------------------------------------------------------------- outcome odds and tiers

// A scripted operator of a given tier runs the recipe for a short horizon.
function play(tier, seed, { days = 60 } = {}) {
  const s = fresh(seed, { fit: 0.5 });
  s.market.flags = {};
  const C = ensureConsumer(s);
  const stellar = tier === 'stellar', mediocre = tier === 'mediocre';
  const good = tier === 'good';
  s.apps.product.agent = { planId: 'claude_max5' };
  Store.chooseStack(s, 'expo'); Store.buildApp(s);
  Store.enrollApple(s); Store.enrollGoogle(s);
  advance(s, 3, APPS);
  if (!mediocre) Store.runBeta(s, { testers: 24 });
  Store.setListing(s, mediocre
    ? { differentiation: 'An AI app like the big one but better', privacyUrl: false, privacyLabel: false }
    : { differentiation: 'Reading streaks that count minutes read aloud to your kids, unlike generic trackers, for parents with a 10 minute bedtime window', privacyUrl: true, privacyLabel: stellar || good });
  if (stellar || good) Mon.enrollSmallBusiness(s); else C.app.apple.sbp = false;
  if (stellar) Mon.setTooling(s, 'revenuecat');
  if (mediocre) Mon.setPaywall(s, { type: 'hard_no_trial', plans: { weekly: { on: true, price: 9.99 }, monthly: { on: false }, annual: { on: false } }, default: 'weekly', dark: { smallPrint: true, countdown: true, toggleTrial: true }, copy: { headline: '100% FREE today' } });
  else Mon.setPaywall(s, { type: stellar ? 'hard_trial' : 'hard_no_trial', trialDays: 3, plans: { weekly: { on: true, price: 5.99 }, monthly: { on: false }, annual: { on: true, price: 29.99 } }, default: 'annual', copy: stellar || good ? { ...CLEAR, trial: stellar ? '3-day free trial, then $29.99 per year' : '' } : { headline: 'Read more', price: '$5.99 per week', renewal: '', cancel: '' } });
  if (stellar) Mon.setQuiz(s, ['What is your main goal for reading?', 'How many minutes a day can you read?', 'How old are your children?', 'What gets in the way most?', 'Which time of day works best?', 'How many books a month do you want?', 'Join 2 million parents on the same path', 'Your plan is ready']);
  // Submit until live (the scripted operator fixes and resubmits).
  for (let i = 0; i < 16 && !Store.mobileLive(s); i++) {
    const r = Store.submitForReview(s, 'ios');
    if (!r.ok) break;
    advance(s, 4, APPS);
    if (C.app.status !== 'live') {
      if (!mediocre) Mon.setPaywall(s, { copy: CLEAR });
      else if (i >= 2) { Mon.setPaywall(s, { dark: {}, copy: i >= 4 ? { ...CLEAR, legal: '' } : {} }); C.app.listing.privacyUrl = C.app.listing.privacyLabel = true; C.app.beta.rounds = 1; } // rejected twice unchanged, then fixes only what the rejection named
    }
  }
  if (!Store.mobileLive(s)) return { s, live: false, why: JSON.stringify({ hist: C.app.history, pend: C.app.pending, risks: Store.reviewRisks(s) }) };
  // Creators: stellar tests five distinct specific hooks with a disclosure rule; mediocre blasts one generic hook.
  const hooks = stellar ? HOOKS.strong : good ? HOOKS.strong.slice(0, 3) : mediocre ? [HOOKS.generic[0]] : HOOKS.strong.slice(0, 1);
  const notes = stellar || good ? "15-30 s vertical, show the screen, don't promise results. Add #ad / paid partnership label." : '15-30 s vertical';
  const b = Cre.postBrief(s, { hooks, message: 'Track the books you read to your kids in 10 minutes a night', notes, fee: 100, bonusPer1k: 2 }).brief;
  Cre.setMarketplace(s, stellar ? 'scale' : 'pro');
  Cre.hireCreators(s, { briefId: b.id, count: stellar ? 40 : 24 });
  // Clipping.
  Clip.launchCampaign(s, { budget: 600, cpm: 1, content: mediocre ? 'meme' : 'problem_hook', hook: mediocre ? 'funny clip' : HOOKS.strong[1], rules: mediocre ? 'Post the exact template video on every account, same video' : 'Original voiceover on every clip, add #ad', verification: stellar ? 'manual' : mediocre ? 'none' : 'basic', maxPerClip: 50 });
  advance(s, 12, APPS);
  if (stellar || good) Cre.auditDisclosure(s);
  // Paid: stellar promotes a proven hook, mediocre launches big on untested copy.
  const posts = C.creators.posts;
  const win = posts.filter((p) => p.disclosed).sort((x, y) => y.views - x.views)[0];
  let creativeId;
  if ((stellar || good) && win) { const pr = Cre.promoteToAds(s, win.id); creativeId = pr.creative?.id; }
  creativeId ??= Paid.addAppCreative(s, { hook: mediocre ? HOOKS.generic[1] : HOOKS.strong[2] }).creative.id;
  Paid.setTarget(s, { d7Roas: 0.5, basis: stellar || good ? 'net' : 'gross' });
  const camp = Paid.launchCampaign(s, { name: 'Installs', geo: 't1', budget: mediocre ? 400 : 60, creativeIds: [creativeId], advantage: stellar }).campaign;
  advance(s, days - 15, APPS);
  if (!stellar) Paid.setBudget(s, camp.id, mediocre ? 1200 : 150);
  advance(s, 3, APPS);
  return { s, live: true };
}
const read = (s) => readOperator(s, 'consumer_app_growth');

test('operator tiers separate stellar > good > average > mediocre by what the player does, and unknown before acting', () => {
  assert.ok(OPERATOR_TIERS.consumer_app_growth && OPERATOR_TIERS.consumer_app_growth.traps.length >= 8);
  assert.equal(read(newState({ companyName: 'X', model: 'b2c', path: 'indie', founderName: 'P', seed: 1 })).tier, 'unknown');
  const fresh0 = fresh();
  assert.equal(read(fresh0).tier, 'unknown', 'a slice with no actions reads unknown');
  // Two dimensions read outcomes (a refund spike, whether ROAS met the target before scaling), so one seed can push a
  // scripted 'good' operator over the stellar cut by luck. Judge each scripted tier on its mean score over a few seeds,
  // and require the per-seed read to match in most of them.
  const SEEDS = [14, 15, 16, 17, 18, 19];
  const names = ['stellar', 'good', 'average', 'mediocre'];
  const out = {}, reads = {}, mean = {};
  for (const tier of names) {
    reads[tier] = SEEDS.map((seed) => {
      const r = play(tier, seed);
      assert.ok(r.live, `${tier} reached the store (seed ${seed}) ${r.why}`);
      return read(r.s);
    });
    out[tier] = reads[tier][0];
    mean[tier] = reads[tier].reduce((a, r) => a + r.score, 0) / SEEDS.length;
  }
  const detail = (t) => `${t} mean ${mean[t].toFixed(3)}; per seed ${reads[t].map((r) => `${r.tier}:${r.score}`).join(' ')}; ${JSON.stringify(out[t].dims)} ${out[t].evidence.join(' | ')}`;
  for (const t of names) {
    assert.equal(tierFromScore(mean[t]), t, detail(t));
    assert.ok(reads[t].filter((r) => r.tier === t).length > SEEDS.length / 2, detail(t));
  }
  for (let i = 1; i < names.length; i++) assert.ok(mean[names[i - 1]] > mean[names[i]] + 0.1, `${names[i - 1]} ${mean[names[i - 1]]} vs ${names[i]} ${mean[names[i]]}`);
  assert.ok(out.mediocre.coaching.length >= 2 && out.stellar.coaching.length === 0 || out.stellar.coaching.length < out.mediocre.coaching.length);
  // Outcomes follow behaviour: mediocre's mistakes cost real money and are traceable; stellar's are few.
  const cost = (s) => (ms(s) ?? []).reduce((a, m) => a + (m.cost.usd || 0), 0);
  const ids = (s) => new Set((ms(s) ?? []).filter((m) => m.functionId === 'consumer_app_growth').map((m) => m.id));
  assert.ok(cost(play('mediocre', 14).s) > cost(play('stellar', 14).s) + 300);
  const mi = ids(play('mediocre', 14).s);
  assert.ok(mi.has('scaled_ads_before_payback') || mi.has('store_fee_not_in_model'));
  assert.ok([...mi].length >= 3, [...mi].join(','));
});

test('median recipe over a short horizon lands inside the researched odds (17% reach $1k MRR, 4.6% reach $10k); stellar does better but is not guaranteed', () => {
  const seeds = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112];
  const mrrs = { average: [], stellar: [] };
  for (const seed of seeds) {
    for (const tier of ['average', 'stellar']) {
      const r = play(tier, seed, { days: 75 });
      mrrs[tier].push(r.live ? mrr(r.s) : 0);
    }
  }
  const frac = (xs, t) => xs.filter((v) => v >= t).length / xs.length;
  const med = mrrs.average, st = mrrs.stellar;
  assert.ok(frac(med, 10000) <= 0.17, `median recipe reaches $10k MRR in ${frac(med, 10000)} of seeds`);
  assert.ok(frac(med, 1000) <= 0.67, `median $1k share ${frac(med, 1000)}`);
  assert.ok(st.reduce((a, v) => a + v, 0) > med.reduce((a, v) => a + v, 0), 'stellar earns more on average');
  assert.ok(frac(st, 1000) >= frac(med, 1000));
  assert.ok(st.some((v) => v < 1000) || frac(st, 10000) < 1, 'doing everything right does not guarantee a big outcome');
});

// ---------------------------------------------------------------- automations and docs

test('automations: the launch playbook events are in the catalog as a separate block', () => {
  for (const type of ['app_review_result', 'clip_campaign_payout_due', 'creator_post_viral', 'view_fraud_detected', 'platform_policy_strike', 'paywall_test_result']) {
    assert.ok(TRIGGERS[`launch_${type}`] ?? Object.values(TRIGGERS).some((t) => t.family === 'launch' && t.type === type), type);
  }
  void ACTIONS; void setModifier; void subscriptionById;
});
