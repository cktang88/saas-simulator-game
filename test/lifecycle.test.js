import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { TIER_RANK } from '../public/core/operator.js';
import { activationRate } from '../public/apps/insights/model.js';
import {
  ensureLifecycle, measureLift, lifecycleOperatorRead, lintEmail, nodeQuality, planTier, lifecycleDay, templateFlow,
  enrolContact, sendBroadcast, lifecycleEvents, eventRetentionAnalysis, liftMultipliers, reviewFlow, ESP,
} from '../public/apps/lifecycle/model.js';
import lifecycle from '../public/apps/lifecycle.js';
import insights, { currentActivation, activationLift } from '../public/apps/insights.js';
import {
  ensureLab, launchSurvey, closeSurvey, requiredSample, createExperiment, experimentDay, concludeExperiment, winProbability,
  analyticsOperatorRead, callPmf, surveyCaveats, toggleFlag, PMF_THRESHOLD,
} from '../public/apps/insights/lab.js';
import { runTier, world, setupTier, GOOD_COPY, GENERIC_COPY } from './helpers/lifecycle-tiers.js';

const SEEDS = [1, 2, 3, 4, 5];
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const rates = (s) => { const L = ensureLifecycle(s); const del = L.daily.reduce((a, d) => a + d.delivered, 0) || 1; return { comp: L.daily.reduce((a, d) => a + d.complaints, 0) / del, unsub: L.daily.reduce((a, d) => a + d.unsub, 0) / del }; };

test('lifecycle tiers separate on real activation lift (stellar 10-20 pts/quarter, mediocre <= 0)', () => {
  const out = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) {
    const runs = SEEDS.map((seed) => runTier(tier, { seed }));
    out[tier] = { lift: mean(runs.map((s) => measureLift(s).lift)), comp: mean(runs.map((s) => rates(s).comp)), unsub: mean(runs.map((s) => rates(s).unsub)), reads: runs.map((s) => lifecycleOperatorRead(s)) };
  }
  assert.ok(out.stellar.lift > out.good.lift && out.good.lift > out.average.lift && out.average.lift > out.mediocre.lift, JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.lift]))));
  assert.ok(out.stellar.lift >= 0.08 && out.stellar.lift <= 0.22, `stellar ${out.stellar.lift}`);
  assert.ok(out.good.lift >= 0.02 && out.good.lift <= 0.09, `good ${out.good.lift}`);
  assert.ok(out.average.lift >= -0.005 && out.average.lift <= 0.025, `average ${out.average.lift}`);
  assert.ok(out.mediocre.lift <= 0.002 && out.mediocre.lift >= -0.05, `mediocre ${out.mediocre.lift}`);
  // mistakes cost: blasts raise unsubscribes and complaints
  assert.ok(out.mediocre.comp > 3 * out.stellar.comp && out.mediocre.unsub > 2 * out.stellar.unsub);
  // operator reads order and coach
  const rank = (t) => mean(out[t].reads.map((r) => TIER_RANK[r.tier]));
  assert.ok(rank('stellar') > rank('good') && rank('good') > rank('mediocre'));
  assert.ok(out.mediocre.reads.every((r) => r.tier === 'mediocre' && r.coaching.length));
});

test('a vanity activation event looks fine but barely moves real activation', () => {
  const core = [], vanity = [], evRate = [];
  for (const seed of SEEDS) {
    core.push(measureLift(runTier('stellar', { seed })).lift);
    const s = world(seed);
    setupTier(s, 'stellar');
    ensureLifecycle(s).activationEvent = { id: 'logged_in', day: 0, validated: false };
    for (let d = 0; d < 90; d++) { s.day++; for (let i = 0; i < 12; i++) { const c = createCustomer(s, { name: 'u', email: `v${d}_${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 14 }); } lifecycleDay(s, { baseP: 0.375 }); }
    const m = measureLift(s);
    vanity.push(m.lift); evRate.push(m.eventRate);
  }
  assert.ok(mean(vanity) < mean(core) / 3, `${mean(vanity)} vs ${mean(core)}`);
  assert.ok(mean(evRate) > 0.75, 'the vanity event itself is reached by most signups');
});

test('retention comparison points at the core event', () => {
  const s = runTier('stellar', { seed: 3, days: 100 });
  const a = eventRetentionAnalysis(s);
  assert.ok(a.n > 300 && !a.lowSample);
  const r = Object.fromEntries(a.rows.map((x) => [x.id, x.ratio]));
  assert.ok(r.core_own_data > r.logged_in && r.core_own_data > r.profile_completed, JSON.stringify(r));
});

test('copy heuristics: one-action emails beat newsletters; stuffing and AI drafts cannot reach stellar offline', () => {
  const ev = { label: 'Used "Receipt requests by SMS" on their own data, 3 times in week 1' };
  const good = lintEmail(GOOD_COPY[0], { kind: 'welcome', event: ev });
  const generic = lintEmail(GENERIC_COPY, { kind: 'welcome', event: ev });
  const stuffed = lintEmail({ subject: 'receipt requests sms receipt', body: 'receipt requests receipt requests sms receipt requests https://a.co https://b.co https://c.co receipt requests' }, { kind: 'welcome', event: ev });
  assert.ok(good.score > generic.score + 0.25 && good.score > stuffed.score + 0.2);
  assert.ok(nodeQuality({ lint: { score: 1 } }) <= 0.8, 'offline judge is shrunk toward the median');
  assert.ok(nodeQuality({ lint: good, aiDraft: true, edited: false }) <= 0.42);
  assert.ok(lintEmail({ subject: 'Hi', body: 'Hi {{first_name}}, 30% off with coupon SAVE30 today https://x.co' }, { kind: 'nudge', event: ev }).issues.some((i) => /merge field/.test(i)));
});

test('flow review flags the classic structural mistakes', () => {
  const s = world(1);
  const L = ensureLifecycle(s);
  const w = templateFlow('welcome');
  w.nodes.forEach((n) => { if (n.type === 'email') n.body = 'x'; });
  assert.ok(reviewFlow(s, L, w).issues.some((i) => /goal exit/.test(i)));
  const wb = templateFlow('winback');
  wb.nodes.forEach((n) => { if (n.type === 'email') n.body = 'x'; });
  assert.ok(reviewFlow(s, L, wb).issues.some((i) => /never-activated/.test(i)));
});

test('plans bill like Loops and Customer.io', () => {
  const s = world(1);
  const L = ensureLifecycle(s);
  L.vendor = 'loops';
  const add = (n, unsub = false) => { for (let i = 0; i < n; i++) L.contacts.push({ unsub }); };
  add(900);
  assert.equal(planTier(s, L).price, 0);
  add(2100);
  assert.equal(planTier(s, L).price, 49);
  add(3000, true); // unsubscribed are not billed on Loops paid plans
  assert.equal(planTier(s, L).price, 49);
  L.vendor = 'customerio'; // every profile counts
  assert.equal(planTier(s, L).price, 145);
  assert.equal(ESP.customerio.tiers[0].price, 100);
});

test('Loops free quota is shared with transactional mail; blowing it blocks sends and logs a mistake', () => {
  const s = world(2);
  const L = ensureLifecycle(s);
  L.vendor = 'loops';
  L.domain = { spf: true, dkim: true, dmarc: true, reputation: 70 };
  for (let i = 0; i < 950; i++) { const c = createCustomer(s, { name: 'u', email: `q${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 14 }); }
  s.day++;
  lifecycleDay(s, { baseP: 0.375 });
  for (let k = 0; k < 4; k++) sendBroadcast(s, { subject: 'Product news', body: 'Hi {{firstName}}, we shipped bulk receipt requests: {{ctaUrl}}', segment: 'all', approved: true });
  s.day++;
  lifecycleDay(s, { baseP: 0.375, logMistake: (st, m) => (st.mistakes ??= []).push(m) });
  assert.ok(L.daily.some((d) => d.blocked > 0));
  assert.ok(s.mistakes.some((m) => m.id === 'quota_blocked'));
});

test('activation model takes the player lift additively; lifecycle feeds Product analytics and the market', () => {
  assert.equal(activationRate({ fit: 0.3 }), activationRate({ fit: 0.3, lift: 0 }));
  assert.ok(Math.abs(activationRate({ fit: 0.3, lift: 0.12 }) - activationRate({ fit: 0.3 }) - 0.12) < 1e-9);
  const m = liftMultipliers(0.375, 0.12);
  assert.ok(m.conversion > 1.15 && m.conversion < 1.3 && m.churn < 1 && m.churn > 0.8);
  const s = world(4);
  setupTier(s, 'stellar');
  ensureMarket(s);
  for (let d = 0; d < 70; d++) {
    s.day++;
    for (let i = 0; i < 12; i++) { const c = createCustomer(s, { name: 'u', email: `i${d}_${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 14 }); }
    lifecycle.onDay(s);
    insights.onDay(s);
  }
  const lift = activationLift(s);
  assert.ok(lift > 0.06, `lift ${lift}`);
  assert.ok(currentActivation(s) > activationRate({ fit: null }) + 0.05);
  assert.ok(s.market.modifiers.conversion['lifecycle-activation'] > 1.1);
  assert.ok(s.market.modifiers.churn['lifecycle-activation'] < 1);
  const recent = s.apps.insights.daily.slice(-20);
  assert.ok(mean(recent.map((d) => d.activationRate)) > 0.42);
});

test('automation exposure: events carry ids; actions return { ok, hoursCost, usdCost } and gate customer-facing sends', () => {
  const s = runTier('stellar', { seed: 2, days: 10 });
  const ev = lifecycleEvents(s, 0);
  assert.ok(ev.length && ev.every((e) => e.id && e.day != null) && ev.some((e) => e.type === 'contact_entered_flow'));
  const L = ensureLifecycle(s);
  const flow = L.flows[0];
  const c = L.contacts.find((x) => !x.enr[flow.id] && !x.done?.includes(flow.id) && !x.unsub);
  if (c) { const r = enrolContact(s, { contactId: c.id, flowId: flow.id, dryRun: true }); assert.equal(r.ok, true); assert.equal(r.hoursCost, 0); assert.ok(!c.enr[flow.id]); }
  assert.equal(sendBroadcast(s, { subject: 'x', body: 'y', segment: 'paid' }).ok, false);
  assert.equal(sendBroadcast(s, { subject: 'x', body: 'y', segment: 'paid', dryRun: true }).ok, true);
});

// ---- Insights lab ----

function labWorld(fit, { paying = 300, trials = 120, seed = 7 } = {}) {
  const s = world(seed);
  ensureMarket(s).fit.product.score = fit;
  for (let i = 0; i < paying; i++) { const c = createCustomer(s, { name: 'p', email: `p${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  s.day += 20;
  for (let i = 0; i < trials; i++) { const c = createCustomer(s, { name: 't', email: `t${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 14 }); }
  return s;
}

test('Sean Ellis survey: activated-only reads the truth; surveying everyone dilutes; small samples are flagged', () => {
  const act = [], all = [];
  for (const seed of SEEDS) {
    const s = labWorld(0.62, { seed });
    const a = launchSurvey(s, { kind: 'pmf', target: 'activated', activation: 0.4 });
    closeSurvey(s, a); act.push(a.result.share);
    s.day += 40;
    const b = launchSurvey(s, { kind: 'pmf', target: 'all', activation: 0.4 });
    closeSurvey(s, b); all.push(b.result.share);
  }
  assert.ok(mean(act) >= PMF_THRESHOLD - 0.03, `activated ${mean(act)}`);
  assert.ok(mean(all) < mean(act) - 0.05, `all ${mean(all)} vs ${mean(act)}`);
  const small = labWorld(0.62, { paying: 40, trials: 0 });
  const sv = closeSurvey(small, launchSurvey(small, { kind: 'pmf', target: 'all', activation: 0.4 }));
  assert.ok(surveyCaveats(sv).length >= 2);
});

test('experiments: sample size, stop rule; peeking ships false winners and logs the cost', () => {
  assert.equal(requiredSample(0.1, 0.2), 3600);
  let peekFalse = 0, patientFalse = 0, peekShips = 0, patientShips = 0;
  for (let seed = 1; seed <= 30; seed++) {
    for (const style of ['peek', 'patient']) {
      const s = labWorld(0.4, { paying: 30, trials: 0, seed: seed * 13 + (style === 'peek' ? 1 : 2) });
      const e = createExperiment(s, { name: 'Checklist', hypothesis: 'x y z a b c', surface: 'onboarding', baseline: 0.35, mde: 0.15, traffic: 60 });
      for (let d = 0; d < 400 && e.status === 'running'; d++) {
        s.day++;
        experimentDay(s, e, 60);
        if (style === 'peek' && d >= 3 && e.c.n > 30 && (winProbability(e) > 0.9 || winProbability(e) < 0.1)) break;
      }
      const ship = style === 'peek' ? winProbability(e) > 0.9 : winProbability(e) > 0.95;
      concludeExperiment(s, e, ship ? 'ship' : 'keep', { learning: 'x' });
      if (ship) { if (style === 'peek') { peekShips++; if (e.falseWinner) peekFalse++; } else { patientShips++; if (e.falseWinner) patientFalse++; } }
      if (style === 'peek' && e.early && e.falseWinner) assert.ok(s.mistakes.some((m) => m.id === 'peeking' && m.cost.hours > 0));
    }
  }
  assert.ok(peekShips > 0);
  const peekRate = peekFalse / peekShips, patientRate = patientShips ? patientFalse / patientShips : 0;
  assert.ok(peekRate > patientRate + 0.15, `peek ${peekRate} (${peekShips}) vs patient ${patientRate} (${patientShips})`);
});

test('analytics/PMF operator read separates disciplined and sloppy players', () => {
  const good = labWorld(0.65, { seed: 3 });
  const sv = closeSurvey(good, launchSurvey(good, { kind: 'pmf', target: 'activated', activation: 0.4 }));
  callPmf(good, { claim: sv.result.share >= PMF_THRESHOLD, surveyId: sv.id });
  const e = createExperiment(good, { name: 'Onboarding checklist', hypothesis: 'Because 60% drop off at step 2 in the funnel and replays show confusion, a checklist should increase activation rate', surface: 'onboarding', baseline: 0.35, mde: 0.2, traffic: 100 });
  for (let d = 0; d < 300 && e.status === 'running'; d++) { good.day++; experimentDay(good, e, 100); }
  concludeExperiment(good, e, winProbability(e) > 0.95 ? 'ship' : 'keep', { learning: 'Checklist did not change activation; step 2 copy is not the blocker.' });

  const bad = labWorld(0.3, { seed: 3 });
  const sb = closeSurvey(bad, launchSurvey(bad, { kind: 'nps', target: 'all', activation: 0.3 }));
  callPmf(bad, { claim: true, surveyId: sb.id });
  for (let k = 0; k < 3; k++) {
    const x = createExperiment(bad, { name: `t${k}`, hypothesis: 'make button green', surface: 'landing', baseline: 0.03, mde: 0.1, traffic: 200 });
    for (let d = 0; d < 3; d++) { bad.day++; experimentDay(bad, x, 200); }
    concludeExperiment(bad, x, 'ship');
  }
  const rg = analyticsOperatorRead(good), rb = analyticsOperatorRead(bad);
  assert.ok(TIER_RANK[rg.tier] >= TIER_RANK.good, JSON.stringify(rg));
  assert.equal(rb.tier, 'mediocre');
  assert.ok(rb.coaching.some((c) => /stop rule/.test(c)) && rb.coaching.some((c) => /NPS/.test(c)));
  assert.equal(toggleFlag(bad, ensureLab(bad).featureFlags[0].key, false).ok, true);
});

test('a PMF call that retention does not confirm costs the scaling spend 90 days later', () => {
  const s = labWorld(0.25, { seed: 9 });
  const sv = closeSurvey(s, launchSurvey(s, { kind: 'pmf', target: 'recent', activation: 0.3 }));
  callPmf(s, { claim: true, surveyId: sv.id });
  for (let d = 0; d < 95; d++) { s.day++; if (d % 30 === 0) s.bank.txns.push({ day: s.day, amount: -5000, category: 'advertising' }); insights.onDay(s); }
  const m = (s.mistakes ?? []).find((x) => x.functionId === 'analytics_pmf');
  assert.ok(m && m.id === 'spike_as_pmf' && m.cost.usd > 10000, JSON.stringify(m));
});
