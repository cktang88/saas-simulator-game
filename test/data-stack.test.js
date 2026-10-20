// Data stack (Product analytics → Data stack): vendor paradigms, tracking plan / data quality, recording bills,
// Segment, BI sources, metric questions, and operator tiers. Short targeted scenarios, a few seeds, no long sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import {
  ensureStack, chooseVendor, setTrackingPlan, setInstrumentation, setCdp, setBi, setDefinitions, setAdminPanel, dataQuality, measuredFunnel,
  hasFeature, missingFeatureHours, tracked, stackDay, stackMonthEnd, askQuestion, answerQuestion, answerHours, dataStackRead, ANALYTICS_VENDORS, segmentBill,
} from '../public/apps/insights/stack.js';
import { launchSurvey, createExperiment, experimentDay, concludeExperiment } from '../public/apps/insights/lab.js';

const fresh = (seed = 3, model = 'smb') => {
  const s = newState({ companyName: 'D', model, path: 'bootstrap', founderName: 'F', seed });
  ensureStripe(s); ensureMarket(s);
  s.day = 100;
  s.founder.hoursPerWeek = 1e6; // hours are asserted through the time log, not capped by the week
  return s;
};
const loggedHours = (s) => (s.founder.timeLog ?? []).reduce((a, x) => a + x.hours, 0);
const raise = (s, amount) => s.bank.txns.push({ id: 'inv', day: 1, amount, category: 'investment', counterparty: 'VC', description: 'Seed' });
const GOOD_PLAN = ['signup', 'activated', 'subscribed', 'aha', 'invited'];

// Tier archetypes built through the same actions the UI calls.
function stack(tier, seed = 3) {
  const s = fresh(seed);
  if (tier === 'stellar') {
    chooseVendor(s, 'posthog');
    setTrackingPlan(s, { events: GOOD_PLAN, props: true });
    setInstrumentation(s, { identify: true, proxy: true, recordings: 'sampled', cap: 50 });
    setBi(s, { tool: 'metabase_oss', source: 'replica' });
    setDefinitions(s, { mrr: 'normalized', active: 'paying', churn: 'start_base', activation: 'core_action' });
  } else if (tier === 'good') {
    chooseVendor(s, 'mixpanel');
    setTrackingPlan(s, { events: ['signup', 'activated', 'subscribed', 'onboarding_step'], props: false });
    setInstrumentation(s, { identify: true, proxy: false });
    setBi(s, { tool: 'metabase_starter', source: 'replica' });
  } else if (tier === 'average') {
    chooseVendor(s, 'posthog');
    setInstrumentation(s, { recordings: 'all' });
  } else {
    chooseVendor(s, 'amplitude');
    setTrackingPlan(s, { events: ['page_viewed', 'button_clicked', 'api_request', 'signup'] });
    setCdp(s, { segment: true, destinations: ['crm'] });
    setBi(s, { tool: 'metabase_oss', source: 'prod' });
    setDefinitions(s, { mrr: 'with_trials', churn: 'all_signups' });
  }
  return s;
}

test('fresh company reads unknown; data_stack is a function in operator-tiers', () => {
  assert.ok(OPERATOR_TIERS.data_stack?.traps.length >= 6);
  assert.equal(readOperator(fresh(), 'data_stack').tier, 'unknown');
});

test('operator tiers separate: stellar > good > average > mediocre, with evidence and coaching', () => {
  const order = ['stellar', 'good', 'average', 'mediocre'];
  const reads = order.map((t) => ({ t, r: dataStackRead(stack(t)) }));
  for (const { t, r } of reads) assert.equal(r.tier, t, `${t} read ${r.tier} (${r.score}): ${r.evidence.join(' | ')}`);
  for (let i = 1; i < reads.length; i++) assert.ok(reads[i - 1].r.score > reads[i].r.score);
  const med = reads[3].r;
  const trapLines = OPERATOR_TIERS.data_stack.traps.map((x) => x.coaching);
  assert.ok(med.coaching.some((c) => trapLines.includes(c)) && med.coaching.some((c) => /stellar operator/.test(c)));
  assert.ok(!reads[0].r.coaching.some((c) => /What a stellar operator does/.test(c)));
});

test('vendor paradigms: PostHog has everything, Mixpanel needs a plan and bolts on surveys, Heap and June are closed', () => {
  const ph = fresh(); chooseVendor(ph, 'posthog');
  const mp = fresh(); chooseVendor(mp, 'mixpanel');
  assert.ok(hasFeature(ph, 'surveys') && hasFeature(ph, 'experiments') && missingFeatureHours(ph, 'surveys') === 0);
  assert.ok(!hasFeature(mp, 'surveys') && missingFeatureHours(mp, 'experiments') > 0);
  // No plan: PostHog autocapture shows an inflated activation; Mixpanel shows nothing.
  const counts = { signups: 100, activated: 30, aha: 10 };
  assert.ok(measuredFunnel(ph, counts).activated > 30);
  assert.equal(measuredFunnel(mp, counts).activated, null);
  assert.ok(dataQuality(ph).q > dataQuality(mp).q);
  setTrackingPlan(mp, { events: GOOD_PLAN, props: true }); setInstrumentation(mp, { identify: true, proxy: true });
  assert.equal(measuredFunnel(mp, counts).activated, 30);
  assert.ok(dataQuality(mp).q >= 0.85);
  for (const id of ['heap', 'june']) assert.equal(chooseVendor(fresh(), id).ok, false);
  assert.ok(!ANALYTICS_VENDORS.june.available && /2025-08-08/.test(ANALYTICS_VENDORS.june.note));
});

test('a survey "to activated users" goes to everyone when activation is not tracked', () => {
  const s = fresh(); chooseVendor(s, 'mixpanel');
  assert.equal(tracked(s, 'activation'), false);
  const sv = launchSurvey(s, { kind: 'pmf', target: 'activated' });
  assert.equal(sv.target, 'all'); assert.ok(sv.untracked);
});

test('Amplitude before Series A costs setup and weekly governance hours; after Series A it is not a mistake', () => {
  const pre = fresh(); const amp = chooseVendor(pre, 'amplitude', { taxonomy: true });
  const ph = chooseVendor(fresh(), 'posthog');
  assert.ok(amp.hours > ph.hours * 3);
  assert.ok(pre.mistakes.some((m) => m.id === 'analytics_overkill'));
  const before = loggedHours(pre);
  for (let d = 0; d < 28; d++) { pre.day++; stackDay(pre, { sessions: 10 }); }
  assert.ok(loggedHours(pre) - before >= 1.9, 'four weeks of governance');
  const a = fresh(); raise(a, 5e6); chooseVendor(a, 'amplitude', { taxonomy: true });
  assert.ok(!(a.mistakes ?? []).some((m) => m.id === 'analytics_overkill'));
});

test('recording every session spikes the PostHog bill; sampling under a billing limit does not', () => {
  const run = (recordings, cap) => {
    const s = fresh(4, 'b2c'); chooseVendor(s, 'posthog'); setTrackingPlan(s, { events: GOOD_PLAN }); setInstrumentation(s, { recordings, cap });
    const start = s.bank.txns.length;
    for (let d = 0; d < 30; d++) { s.day++; stackDay(s, { sessions: 2000, visitors: 4000, accounts: 4000 }); }
    stackMonthEnd(s);
    const spent = s.bank.txns.slice(start).filter((t) => t.counterparty === 'PostHog').reduce((a, t) => a - t.amount, 0);
    return { spent, s };
  };
  const all = run('all', null), sampled = run('sampled', 50);
  assert.ok(all.spent > 500, `all ${all.spent}`);
  assert.ok(sampled.spent <= 50 && sampled.spent < all.spent / 10, `sampled ${sampled.spent}`);
  assert.ok(all.s.mistakes.some((m) => m.id === 'recording_bill_spike'));
});

test('Segment pays off only with several destinations; MTU bill tiers', () => {
  assert.equal(segmentBill(800), 0); assert.equal(segmentBill(5000), 120); assert.ok(segmentBill(30000) > 120);
  const one = fresh(); setCdp(one, { segment: true, destinations: ['crm'] });
  assert.ok(one.mistakes.some((m) => m.id === 'cdp_one_destination'));
  const many = fresh(); setCdp(many, { segment: true, destinations: ['crm', 'lifecycle', 'warehouse', 'ads'] });
  assert.ok(!(many.mistakes ?? []).some((m) => m.id === 'cdp_one_destination'));
  // Hand-wired: 4 x 2 h vs Segment 4 h + 4 x 0.5 h.
  assert.ok(setCdp(fresh(), { segment: false, destinations: ['crm', 'lifecycle', 'warehouse', 'ads'] }).hours > setCdp(fresh(), { segment: true, destinations: ['crm', 'lifecycle', 'warehouse', 'ads'] }).hours);
});

test('Hex needs a warehouse and is a mistake pre-Series A; Retool is not a BI tool', () => {
  const s = fresh();
  assert.equal(setBi(s, { tool: 'hex', source: 'replica' }).ok, false);
  assert.ok(setBi(s, { tool: 'hex', source: 'warehouse' }).hours >= 10);
  assert.ok(s.mistakes.some((m) => m.id === 'hex_too_early'));
  const r = fresh(); setBi(r, { tool: 'retool', source: 'replica' });
  assert.ok(r.mistakes.some((m) => m.id === 'retool_as_bi'));
  const q = askQuestion(r, { qid: 'nrr_cohort', from: 'board' });
  assert.equal(answerQuestion(r, q.id, { method: 'bi' }).ok, true);
  assert.equal(r.apps.insights.stack.questions[0].method, 'manual');
  // The admin panel is what Retool is for: support lookups shrink.
  const lookups = (panel) => { const t = fresh(); if (panel) setAdminPanel(t, 'retool'); t.day = 105; stackDay(t, { tickets7: 40 }); return loggedHours(t); };
  assert.ok(lookups(false) > 3 * lookups(true));
});

test('BI value: Metabase with definitions answers board questions faster and more correctly than by hand', () => {
  const tally = (setup) => {
    let hours = 0, wrong = 0;
    for (const seed of [1, 2, 3]) {
      const s = fresh(seed); setup(s);
      for (let i = 0; i < 12; i++) {
        const q = askQuestion(s, { qid: ['mrr_trend', 'logo_churn', 'nrr_cohort', 'cac_payback'][i % 4], from: 'board' });
        const method = s.apps.insights.stack.bi === 'none' ? 'manual' : 'bi';
        hours += answerHours(s, q, method, { reconcile: true });
        if (answerQuestion(s, q.id, { method, reconcile: true }).wrong) wrong++;
      }
    }
    return { hours, wrong };
  };
  const bi = tally((s) => { setBi(s, { tool: 'metabase_oss', source: 'replica' }); setDefinitions(s, { mrr: 'normalized', active: 'paying', churn: 'start_base', activation: 'core_action' }); });
  const manual = tally(() => {});
  const badDefs = tally((s) => { setBi(s, { tool: 'metabase_oss', source: 'replica' }); setDefinitions(s, { mrr: 'with_trials', churn: 'net' }); });
  assert.ok(bi.hours < manual.hours / 2.5, `bi ${bi.hours} h vs manual ${manual.hours} h`);
  assert.ok(bi.wrong <= manual.wrong && badDefs.wrong > bi.wrong + 4, `wrong: bi ${bi.wrong}, manual ${manual.wrong}, bad defs ${badDefs.wrong}`);
});

test('a live metric bug: reconciling catches it more often than sending numbers straight from the tool', () => {
  const caught = (reconcile) => {
    let n = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = fresh(seed); setBi(s, { tool: 'metabase_oss', source: 'replica' }); setDefinitions(s, { mrr: 'normalized' });
      s.apps.insights.stack.bug = { id: 'trials_in_mrr', metric: 'mrr', text: 'trialing subscriptions were counted in MRR', day: 90 };
      const q = askQuestion(s, { qid: 'mrr_trend', from: 'raising' });
      if (answerQuestion(s, q.id, { method: 'bi', reconcile }).caught) n++;
    }
    return n;
  };
  assert.ok(caught(true) > caught(false), `${caught(true)} vs ${caught(false)}`);
});

test('wrong answers surface later as a traceable mistake; unanswered questions expire with a cost', () => {
  const s = fresh(7); setDefinitions(s, { mrr: 'charges' });
  s.apps.insights.stack.bug = { id: 'annual_not_normalized', metric: 'mrr', text: 'annual plans', day: 90 };
  const q = askQuestion(s, { qid: 'mrr_trend', from: 'board' });
  const r = answerQuestion(s, q.id, { method: 'manual' });
  assert.ok(r.wrong || r.caught);
  const late = askQuestion(s, { qid: 'logo_churn', from: 'board' });
  for (let d = 0; d < 70; d++) { s.day++; stackDay(s, {}); }
  assert.equal(s.apps.insights.stack.questions.find((x) => x.id === late.id).status, 'expired');
  assert.ok(s.mistakes.some((m) => m.id === 'unanswered_metric_question'));
  if (r.wrong) assert.ok(s.apps.insights.stack.questions.find((x) => x.id === q.id).discovered);
});

test('bad tracking invents experiment winners that the stop rule cannot save', () => {
  const ship = (good) => {
    let false_ = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = fresh(seed); chooseVendor(s, 'mixpanel');
      if (good) { setTrackingPlan(s, { events: GOOD_PLAN, props: true }); setInstrumentation(s, { identify: true, proxy: true }); }
      for (let k = 0; k < 4; k++) {
        const e = createExperiment(s, { name: `t${k}`, hypothesis: 'x', surface: 'onboarding', baseline: 0.3, mde: 0.2, traffic: 200 });
        e.trueEffect = 0; // a null effect: any winner is invented
        while (e.status === 'running') { s.day++; experimentDay(s, e, 200); }
        const ctrl = e.c.x / e.c.n, varr = e.v.x / e.v.n;
        if (varr > ctrl * 1.05) { concludeExperiment(s, e, 'ship'); false_++; }
      }
    }
    return false_;
  };
  assert.ok(ship(false) > ship(true) + 3, `noisy ${ship(false)} vs clean ${ship(true)}`);
});

test('outcomes follow the tiers: two months of a mediocre stack cost more money, hours and mistakes than a stellar one', () => {
  const run = (tier) => {
    const s = stack(tier, 5);
    const h0 = loggedHours(s), b0 = s.bank.txns.length, m0 = (s.mistakes ?? []).length;
    for (let d = 0; d < 60; d++) {
      s.day++;
      stackDay(s, { sessions: 300, visitors: 900, accounts: 120, tickets7: 15 });
      if (d % 15 === 7) { const q = askQuestion(s, { qid: ['mrr_trend', 'logo_churn', 'nrr_cohort', 'active_customers'][d % 4], from: 'board' }); answerQuestion(s, q.id, { method: s.apps.insights.stack.bi === 'none' ? 'manual' : 'bi', reconcile: tier === 'stellar' }); }
      if (d === 29 || d === 59) stackMonthEnd(s);
    }
    const usd = s.bank.txns.slice(b0).reduce((a, t) => a - Math.min(0, t.amount), 0);
    const all = (s.mistakes ?? []).filter((m) => m.functionId === 'data_stack');
    return { usd, hours: loggedHours(s) - h0, n: all.length, later: all.length - m0 };
  };
  const st = run('stellar'), md = run('mediocre');
  assert.ok(md.usd > st.usd, `usd ${md.usd} vs ${st.usd}`);
  assert.ok(md.n > st.n + 2, `mistakes ${md.n} vs ${st.n}`);
  assert.ok(md.hours > st.hours, `hours ${md.hours} vs ${st.hours}`);
});

test('old saves keep working: analytics already running reads as legacy PostHog with everything on', () => {
  const s = fresh();
  s.apps.insights = { daily: [{ day: 1, signups: 1 }] };
  const st = ensureStack(s);
  assert.ok(st.legacy && st.vendor === 'posthog');
  assert.ok(hasFeature(s, 'surveys') && dataQuality(s) === null && tracked(s, 'activation'));
  assert.equal(measuredFunnel(s, { signups: 10, activated: 4, aha: 2 }).activated, 4);
  assert.equal(dataStackRead(s).tier, 'unknown');
});
