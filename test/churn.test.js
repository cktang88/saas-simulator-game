// Churn reasons, signals, saves, cancel flow, dunning and customer-success timing (core/churn.js, core/stripe.js,
// apps/retention/*, apps/success/*). Principle 7: actions shift WHY customers leave and how many you keep;
// mistakes cost, traceably; overall churn stays on the calibrated curve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, mrr, dunningStepQuality } from '../public/core/stripe.js';
import { ensureMarket, setModifier, churnBeforeRenewal } from '../public/core/market.js';
import { MARKET } from '../public/core/params.js';
import { conditionedMix, ensureChurn, applySaveTactic, renewalDecision, timingMult, inferB2cCategory, b2cCategoryOf, churnSegment, tacticsFor, visibleSignals, trueReasonFor, statedReason } from '../public/core/churn.js';
import { CHURN_REASONS, SEGMENT_CHURN, surveyAnswer } from '../public/data/churn-reasons.js';
import { BUYER_SEGMENTS } from '../public/data/buyer-segments.js';
import { exitInterviewQuality, revealChance } from '../public/apps/retention/interview.js';
import { requestExitInterview, holdExitInterview } from '../public/apps/customers.js';
import * as llm from '../public/core/llm.js';
import { churnMultFromHealth, renewalTimingBonus, validateSuccessPlan, retentionTier } from '../public/apps/success/model.js';

function fresh(model = 'smb', seed = 11, { icp = 'Scheduling and reminders for independent dental practices' } = {}) {
  const s = newState({ companyName: 'Chairside', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 5e6, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = icp;
  s.company.icp = icp;
  s.apps.product = { features: [{ id: 'f1', title: 'Reminders', status: 'shipped', shippedDay: 0 }], bugs: [] };
  s.market.fit.product.score = 0.45;
  s.market.fit.price.wtp = model === 'b2c' ? 9.99 : 79;
  return s;
}
function addSubs(s, n, price = 49, interval = 'month') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x${i}.com`, country: 'US' });
    out.push(subscribe(s, c.id, { id: 'p', price, interval, trialDays: 0 }, { source: 'network' }));
  }
  return out;
}
const live = (x) => x.status === 'active' || x.status === 'past_due';

test('segment mixes: B2B uses the ICP segment, B2C the company category (set or inferred), with fallbacks', () => {
  const s = fresh();
  const [sub] = addSubs(s, 1);
  assert.equal(churnSegment(s, sub).id, 'health_practices');
  assert.equal(inferB2cCategory('Guided meditation and sleep stories'), 'meditation_wellness');
  assert.equal(inferB2cCategory('Learn Spanish in 10 minutes a day'), 'education_language');
  const b = fresh('b2c', 3, { icp: 'Workout plans for busy parents' });
  assert.equal(b2cCategoryOf(b), 'health_fitness');
  b.company.b2cCategory = 'finance';
  assert.equal(b2cCategoryOf(b), 'finance');
  const none = fresh('b2c', 3, { icp: 'zzz' });
  const [bs] = addSubs(none, 1, 9.99);
  const mix = conditionedMix(none, bs);
  assert.ok(Math.abs(Object.values(mix).reduce((a, v) => a + v, 0) - 1) < 1e-9);
  assert.ok(!('payment_failed' in mix), 'voluntary mix excludes involuntary churn');
});

test('fixed churnAnnual values sit inside the new segment ranges', () => {
  for (const seg of BUYER_SEGMENTS) {
    const r = SEGMENT_CHURN[seg.id]?.annualLogoChurn;
    if (!r) continue;
    assert.ok(seg.churnAnnual >= r[0] - 1e-9 && seg.churnAnnual <= r[1] + 1e-9, `${seg.id} ${seg.churnAnnual} vs ${r}`);
  }
});

test('reason mix is conditioned on what the player did; uncontrollable reasons stay base rates', () => {
  const good = fresh(); const bad = fresh();
  const [gs] = addSubs(good, 1); const [bs] = addSubs(bad, 1);
  good.market.fit.product.score = 0.8; good.market.onboarding = 'concierge'; gs.onboarded = 'held';
  bad.market.fit.product.score = 0.15; bad.market.onboarding = 'self'; bs.onboarded = 'no_show';
  const g = conditionedMix(good, gs), b = conditionedMix(bad, bs);
  const act = (m) => (m.never_activated ?? 0) + (m.not_using ?? 0);
  assert.ok(act(b) > 1.8 * act(g), `bad onboarding not_using+never_activated ${act(b).toFixed(3)} vs ${act(g).toFixed(3)}`);
  // Slow support, bugs, price above WTP and competition each raise their own reason.
  const base = conditionedMix(fresh(), addSubs(fresh(), 1)[0]);
  const t = fresh(); const [ts] = addSubs(t, 1);
  setModifier(t, 'churn', 'support-frt', 1.35);
  setModifier(t, 'churn', 'product-bugs', 1.3);
  setModifier(t, 'churn', 'world:rival', 1.25);
  t.market.fit.price.wtp = 25; // price $49 vs WTP $25
  const m = conditionedMix(t, ts);
  for (const k of ['poor_support', 'bugs_reliability', 'price_too_high', 'switched_competitor']) assert.ok(m[k] > 1.3 * base[k], `${k} ${m[k]} vs ${base[k]}`);
  // business_closed is not something the player can move: its RELATIVE weight vs another base-rate reason is unchanged.
  assert.ok(Math.abs(m.business_closed / m.owner_retired_or_sold - base.business_closed / base.owner_retired_or_sold) < 1e-9);
  // Mapping of existing game reasons.
  assert.equal(trueReasonFor(t, ts, 'felt_ignored'), 'poor_support');
  assert.equal(trueReasonFor(t, ts, 'price_increase'), 'price_too_high');
  assert.equal(trueReasonFor(t, ts, 'payment_failed'), 'payment_failed');
});

test('timing: seasonal shaping is mean-preserving; peaks land in the segment months', () => {
  const s = fresh('smb', 5, { icp: 'Job scheduling for roofing and HVAC contractors' });
  const [sub] = addSubs(s, 1);
  assert.equal(churnSegment(s, sub).id, 'trades');
  let sum = 0;
  const f = [];
  for (let m = 0; m < 12; m++) { const day = Math.round(m * 30.44) + 15 - 1; f.push(timingMult(s, sub, day)); sum += f.at(-1); }
  assert.ok(Math.abs(sum / 12 - 1) < 0.08, `mean ${sum / 12}`);
  assert.ok(Math.max(...f) > 1.3 && Math.min(...f) < 0.8);
});

test('overall churn stays on the calibrated curve (no double counting): realised voluntary rate ≈ hazard', () => {
  const s = fresh('smb', 21, { icp: '' });
  s.company.oneLiner = '';
  const subs = addSubs(s, 3000);
  advance(s, 185, []);
  const factor = churnBeforeRenewal(s, { interval: 'month', paidMonths: 1 }) / MARKET.smb.monthlyChurn[0];
  let vol = 0, exp = 0;
  for (let m = 1; m <= 6; m++) {
    const decisions = subs.filter((x) => (x.paidMonths ?? 0) >= m).length;
    vol += subs.filter((x) => x.cancelReason === 'voluntary' && x.paidMonths === m).length;
    exp += decisions * MARKET.smb.monthlyChurn[m - 1] * factor;
  }
  assert.ok(Math.abs(vol / exp - 1) < 0.12, `voluntary ${vol} vs expected ${exp.toFixed(0)}`);
  // Every voluntary churn has a hidden true reason; none of them is a payment failure.
  const v = subs.filter((x) => x.cancelReason === 'voluntary');
  assert.ok(v.every((x) => x.churnReason && x.churnReason !== 'payment_failed'));
  // Leading signals fired before churn for a meaningful share of leavers, with false positives on stayers.
  const sig = visibleSignals(s, { days: 400 });
  const leavers = new Set(v.map((x) => x.id));
  const tp = sig.filter((g) => leavers.has(g.subId)).length, fp = sig.filter((g) => g.fp).length;
  assert.ok(tp > 0 && fp > 0, `true ${tp} false ${fp}`);
});

test('exit surveys sometimes mislead; failed-payment churners rarely answer', () => {
  let mis = 0, n = 0, none = 0;
  let r = 1;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2000; i++) {
    const a = surveyAnswer('not_using', rand); n++; if (a.misleading) mis++;
    const b = surveyAnswer('payment_failed', rand); if (!b.category) none++;
  }
  assert.ok(mis / n > 0.3 && mis / n < 0.8, `not_using misleading ${mis / n}`);
  assert.ok(none / 2000 > 0.6);
  // A closed business often says "too expensive".
  const s = fresh();
  const [sub] = addSubs(s, 1);
  sub.churnReason = 'business_closed';
  let exp = 0;
  for (let i = 0; i < 300; i++) if (statedReason(s, sub).category === 'too_expensive') exp++;
  assert.ok(exp > 40, `business_closed stated too_expensive ${exp}/300`);
});

test('exit interviews: good questions reveal the true reason far more often than leading or pitching ones', async () => {
  const goodQ = 'Walk me through the week you decided to cancel. What happened?\nWho else was involved in the decision?\nWhat are you using now, and how did you first notice it was not working?';
  const badQ = 'Was it the price? We just shipped a new dashboard, did you know?\nWould you come back if we gave you a discount?';
  assert.ok(exitInterviewQuality(goodQ) > exitInterviewQuality(badQ) + 0.4);
  assert.ok(exitInterviewQuality('What happened?\nWhat happened?\nWhat happened?\nWhat happened?\nWhat happened?') < exitInterviewQuality(goodQ), 'repeating one question is not stuffable');
  const run = async (questions) => {
    const s = fresh('smb', 9);
    s.apps.customers = { panels: [], onboarding: [], seenSubs: [], feedback: [], surveys: [], interviews: [] };
    const subs = addSubs(s, 120);
    let revealed = 0, held = 0;
    for (const sub of subs) {
      sub.status = 'canceled'; sub.canceledDay = s.day; sub.paidMonths = 3; sub.churnReason = 'never_activated'; sub.cancelReason = 'voluntary';
      const iv = requestExitInterview(s, sub.id);
      if (iv.status !== 'accepted') continue;
      const done = await holdExitInterview({ state: s, llm }, sub.id, questions);
      held++;
      if (done.revealed === 'never_activated') revealed++;
    }
    return { held, rate: revealed / Math.max(1, held) };
  };
  const g = await run(goodQ), b = await run(badQ);
  assert.ok(g.held >= 15 && b.held >= 15, `held ${g.held} / ${b.held}`);
  assert.ok(g.rate > b.rate + 0.25, `reveal good ${g.rate.toFixed(2)} vs bad ${b.rate.toFixed(2)}`);
  assert.ok(revealChance(0.9, null, true) < 0.85, 'offline heuristic is shrunk');
});

function withIntent(s, sub, reason) {
  sub.churnEval = { periodEnd: sub.currentPeriodEnd, p: 1e-4, day: s.day, intent: { reason, decidedDay: s.day, maxRate: 0, tried: [], saved: false } };
}

test('save tactics work only on matching reasons; a wrong tactic costs margin and is logged', () => {
  const s = fresh();
  const subs = addSubs(s, 400).filter(live).slice(0, 360);
  let savedPrice = 0, savedClosed = 0;
  subs.forEach((sub, i) => withIntent(s, sub, i % 2 ? 'price_too_high' : 'business_closed'));
  const mrr0 = mrr(s);
  for (const [i, sub] of subs.entries()) {
    const r = applySaveTactic(s, sub.id, 'discount_offer');
    if (r.saved) { if (i % 2) savedPrice++; else savedClosed++; }
    assert.ok(r.marginUsd > 0, 'the discount always costs margin');
  }
  assert.equal(savedClosed, 0, 'a discount never saves a business that closed');
  assert.ok(savedPrice > 10 && savedPrice < 55, `price saves ${savedPrice}/180 (rate ~15%)`);
  assert.ok(mrr(s) < mrr0 * 0.85, 'discounts cut MRR');
  advance(s, 31, []);
  const closed = subs.filter((x, i) => i % 2 === 0);
  assert.ok(closed.filter(live).length < 0.15 * closed.length, 'closed businesses still leave');
  const wasted = (s.mistakes ?? []).filter((m) => m.id === 'wrong_save_tactic');
  assert.ok(wasted.length >= 130, `wasted tactics logged: ${wasted.length}`);
  assert.ok(wasted.every((m) => m.cost.usd > 0 || m.cost.hours > 0));
  // Matching tactics: onboarding rescue saves never-activated accounts, not budget cuts.
  const t = fresh();
  const ts = addSubs(t, 300).filter(live);
  let a = 0, b = 0;
  ts.forEach((sub, i) => { withIntent(t, sub, i % 2 ? 'never_activated' : 'budget_cut'); const r = applySaveTactic(t, sub.id, 'onboarding_rescue'); if (r.saved) i % 2 ? a++ : b++; });
  assert.ok(a > 20 && b === 0, `rescue saves never_activated ${a}, budget_cut ${b}`);
  assert.ok(tacticsFor(t, ts[0]).every((x) => x.hours > 0));
});

test('cancel flow: reason-specific acceptance; over-discounting trains customers to threaten cancellation', () => {
  const s = fresh('b2c', 4, { icp: 'Home workouts for busy parents' });
  const subs = addSubs(s, 600, 9.99);
  const f = ensureChurn(s).flow;
  Object.assign(f, { enabled: true, setup: true, survey: true, offers: { pause: true, downgrade: true, discount: false }, sinceDay: 0 });
  let savedSeasonal = 0, savedClosed = 0, savedNotUsing = 0;
  for (const [i, sub] of subs.entries()) {
    const reason = ['seasonal_pause', 'business_closed', 'not_using'][i % 3];
    withIntent(s, sub, reason);
    sub.churnEval.p = 0.0001; // keep: min(1, pNow/pThen) = 1
    const d = renewalDecision(s, sub);
    if (!d.churn) { if (reason === 'seasonal_pause') savedSeasonal++; else if (reason === 'business_closed') savedClosed++; else savedNotUsing++; }
  }
  assert.ok(savedSeasonal > savedNotUsing && savedNotUsing > savedClosed, `seasonal ${savedSeasonal} not_using ${savedNotUsing} closed ${savedClosed}`);
  assert.ok(savedClosed <= 10);
  const st = ensureChurn(s).flowStats;
  assert.ok(st.started === 600 && st.saved > 60 && st.saved < 300, `flow saved ${st.saved}/600`);
  // A deep, untargeted discount: after a few months, happy customers start "cancelling" to collect it.
  const deep = fresh('b2c', 6, { icp: 'Home workouts for busy parents' });
  addSubs(deep, 800, 9.99);
  Object.assign(ensureChurn(deep).flow, { enabled: true, setup: true, survey: false, offers: { pause: false, downgrade: false, discount: true }, discountPct: 50, discountMonths: 3, sinceDay: 0 });
  advance(deep, 200, []);
  const fs = ensureChurn(deep).flowStats;
  assert.ok(fs.threatDiscounts > 5, `threat discounts ${fs.threatDiscounts}`);
  assert.ok((deep.mistakes ?? []).some((m) => m.id === 'renewal_discount' && m.cost.usd > 0));
});

// One company's failed payments (~150) leave the none-vs-default gap inside the noise on some seeds: pool two.
function dunningCohort(setup) {
  const runs = [31, 32].map((seed) => dunningRun(setup, seed));
  const d = { recovered: 0, lost: 0, byCode: {} };
  for (const r of runs) {
    d.recovered += r.d.recovered; d.lost += r.d.lost;
    for (const [k, v] of Object.entries(r.d.byCode ?? {})) { const b = (d.byCode[k] ??= { recovered: 0, lost: 0 }); b.recovered += v.recovered ?? 0; b.lost += v.lost ?? 0; }
  }
  return { rate: d.recovered / Math.max(1, d.recovered + d.lost), d, s: runs[0].s };
}
function dunningRun(setup, seed) {
  const s = fresh('smb', seed);
  const st = s.stripe.settings;
  if (setup === 'none') st.dunningEmails = false;
  if (setup === 'smart') st.smartRetries = true;
  if (setup === 'designed') {
    st.smartRetries = true; st.cardUpdater = true; st.preExpiryEmails = true; st.dunning.fromPerson = true;
    st.dunning.steps = [0, 3, 7, 12].map((day, i) => ({ day, channel: i === 2 ? 'in_app' : 'email', subject: 'Quick heads-up about your card', body: 'Hi {{first_name}}, your {{amount}} payment for {{plan}} did not go through. Update your card here: {{update_link}} or just reply if you would rather pause. Thanks, Sam' }));
  }
  addSubs(s, 1200);
  advance(s, 240, []);
  const d = s.stripe.dunningStats;
  return { rate: d.recovered / Math.max(1, d.recovered + d.lost), d, s };
}

test('dunning: ordinary defaults recover ~35-45%; a designed sequence with smart retries and the updater 65-85%', () => {
  const none = dunningCohort('none'), def = dunningCohort('default'), smart = dunningCohort('smart'), des = dunningCohort('designed');
  // Enough failed payments (two companies of 1,200 subs over 8 months) to measure recovery rates on.
  assert.ok(def.d.recovered + def.d.lost > 250, `failed payments ${def.d.recovered + def.d.lost}`);
  assert.ok(none.rate < def.rate && def.rate < smart.rate && smart.rate < des.rate, `none ${none.rate.toFixed(2)} default ${def.rate.toFixed(2)} smart ${smart.rate.toFixed(2)} designed ${des.rate.toFixed(2)}`);
  assert.ok(def.rate > 0.3 && def.rate < 0.48, `default ${def.rate}`);
  assert.ok(des.rate > 0.62 && des.rate < 0.88, `designed ${des.rate}`);
  // Hard declines only come back through a new card: messages matter.
  const hard = (x) => Object.entries(x.d.byCode).filter(([k]) => ['transaction_not_allowed', 'highest_risk_level', 'incorrect_number', 'lost_card', 'expired_card'].includes(k)).reduce((a, [, v]) => ({ r: a.r + v.recovered, l: a.l + v.lost }), { r: 0, l: 0 });
  assert.equal(hard(none).r, 0);
  assert.ok(hard(des).r > 0);
  assert.ok((def.s.mistakes ?? []).some((m) => m.functionId === 'payments_dunning' && m.id === 'one_email'));
  // Copy is judged: a link, specifics and a human beat a vague threat.
  assert.ok(dunningStepQuality({ subject: 'Your card', body: 'Hi Ana, your $49 payment failed. Update it here: {{update_link}}. Thanks, Sam' }) > dunningStepQuality({ subject: 'FINAL WARNING', body: 'Failure to pay will result in termination and collections.' }) + 0.4);
});

test('a careful retention operator keeps clearly more revenue than a sloppy one', () => {
  // Careful: designed dunning, a targeted cancel flow (pause + downgrade, survey first), and acts on strong signals
  // with the tactic that fits the signal. Sloppy: defaults, a deep discount for anyone who threatens, and a
  // discount on every signal.
  const SIGNAL_TACTIC = { never_activated_7d: 'onboarding_rescue', login_decay: 'onboarding_rescue', usage_drop: 'onboarding_rescue', support_ticket_spike: 'fix_and_credit', support_silence: 'fix_and_credit', outage_incident: 'fix_and_credit', season_end: 'pause_plan', business_volume_decline: 'pause_plan', competitor_pitch: 'discount_offer', plan_downgrade: 'downgrade_offer', layoffs_or_freeze: 'downgrade_offer' };
  const play = (careful, seed) => {
    const s = fresh('smb', seed);
    addSubs(s, 500);
    const st = s.stripe.settings;
    const flow = ensureChurn(s).flow;
    if (careful) {
      st.smartRetries = true; st.cardUpdater = true; st.dunning.fromPerson = true;
      st.dunning.steps = [0, 3, 7, 12].map((day) => ({ day, channel: 'email', subject: 'About your card', body: 'Hi {{first_name}}, your {{amount}} payment for {{plan}} failed. Update it here: {{update_link}} or reply to pause. Thanks, Sam' }));
      Object.assign(flow, { enabled: true, setup: true, survey: true, offers: { pause: true, downgrade: true, discount: false }, sinceDay: 0 });
    } else Object.assign(flow, { enabled: true, setup: true, survey: false, offers: { pause: false, downgrade: false, discount: true }, discountPct: 50, discountMonths: 6, sinceDay: 0 });
    const acted = new Set();
    let hours = 0;
    for (let d = 0; d < 300; d += 3) {
      advance(s, 3, []);
      for (const g of visibleSignals(s, { days: 4 })) {
        if (acted.has(`${g.subId}:${g.renewalDay}`)) continue;
        const sub = s.stripe.subscriptions.find((x) => x.id === g.subId);
        if (!sub || !live(sub)) continue;
        const tactic = careful ? (g.strength >= 0.5 ? SIGNAL_TACTIC[g.signal] : null) : 'discount_offer';
        if (!tactic || !tacticsFor(s, sub).some((t) => t.id === tactic)) continue;
        acted.add(`${g.subId}:${g.renewalDay}`);
        hours += applySaveTactic(s, sub.id, tactic).hours;
      }
    }
    return { mrr: mrr(s), hours, mistakes: (s.mistakes ?? []).length };
  };
  let careful = 0, sloppy = 0;
  for (const seed of [41, 42, 43]) { careful += play(true, seed).mrr; sloppy += play(false, seed).mrr; }
  assert.ok(careful > sloppy * 1.12, `retained MRR careful ${careful.toFixed(0)} vs sloppy ${sloppy.toFixed(0)}`);
});

test('customer success: trimmed health multiplier, early renewal bonus, success plans, GRR tiers', () => {
  assert.ok(Math.abs(churnMultFromHealth(60) - 1) < 1e-9);
  assert.ok(churnMultFromHealth(100) >= 0.6 && churnMultFromHealth(0) <= 1.8);
  assert.ok(renewalTimingBonus(110) - renewalTimingBonus(10) >= 0.09);
  assert.equal(renewalTimingBonus(null), 0);
  assert.equal(validateSuccessPlan({ metric: 'value', target: 'more', dueDays: 90 }).valid, false);
  assert.equal(validateSuccessPlan({ metric: 'month-end close time for finance', target: 'from 8 days to 3', dueDays: 90 }).valid, true);
  assert.deepEqual([0.95, 0.9, 0.85, 0.7].map(retentionTier), ['stellar', 'good', 'average', 'mediocre']);
  // Reason labels exist for every reason the engine can emit.
  for (const k of Object.keys(CHURN_REASONS)) assert.ok(CHURN_REASONS[k].label);
});
