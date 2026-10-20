// MVP lab: smoke tests, concierge, Wizard of Oz, design partners, thresholds, mistakes and operator tiers. Short, targeted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket, landingConversion, waitlistConversion } from '../public/core/market.js';
import { truthOf, painStrength, segmentMatch } from '../public/core/truth.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { readOperator, TIER_RANK } from '../public/core/operator.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import { APPS } from '../public/apps/registry.js';
import { productSlice } from '../public/apps/product/store.js';
import '../public/apps/mvp/readers.js';
import * as M from '../public/apps/mvp/model.js';
import { traceFeatureOutcome, settleBets } from '../public/apps/research/consequences.js';

function mk(seed = 5, model = 'smb') {
  const s = newState({ companyName: 'X', model, path: 'indie', founderName: 'P', seed });
  ensureStripe(s); ensureMarket(s).flags = { fixedDemand: 1 }; seedDefaultStack(s);
  post(s, { amount: 5e5, counterparty: 'P', category: 'owner_contribution' });
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = '';
  return s;
}
const segs = (s) => { const t = truthOf(s); const best = t.segments.find((g) => g.id === t.bestSegmentId); const far = t.segments.filter((g) => g.baseId !== best.baseId && (M.audienceMix(s, g.keywords.join(' '), 'community').weights.find((x) => x.segmentId === best.id)?.w ?? 0) < 0.12).sort((a, b) => painStrength(a) - painStrength(b));
  return { best, weak: far[0] ?? t.segments.filter((g) => g.id !== best.id).sort((a, b) => painStrength(a) - painStrength(b))[0] }; };
const text = (g) => g.keywords.join(' ');
const PAGE = { headline: 'Stop chasing unpaid invoices: automatic reminders for contractors', offer: 'Reminders by text and email, payments matched automatically. Saves 5 hours a month.' };
const HYP = (metric = 'signupRate', threshold = 0.04) => ({ statement: 'Contractors will sign up or leave a deposit', metric, threshold });
const settle = (s) => { for (const e of s.apps.mvp.experiments) if (e.endDay && e.status === 'running') s.day = Math.max(s.day, e.endDay); M.mvpDay(s); };
const count = (s, id) => (s.mistakes ?? []).filter((m) => m.id === id).length;
const smoke = (s, o) => M.runSmoke(s, { ...PAGE, source: 'community', cta: 'deposit', hypothesis: HYP('paidRate', 0.01), ...o });
const totals = (exps) => exps.reduce((a, e) => ({ visits: a.visits + e.results.visits, signups: a.signups + e.results.signups, paid: a.paid + (e.results.paid ?? 0), polite: a.polite + e.hidden.politeSignups }), { visits: 0, signups: 0, paid: 0, polite: 0 });

function pooled(source, pick, o = {}) {
  const exps = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = mk(seed); const g = pick(segs(s));
    exps.push(smoke(s, { source, audience: text(g), price: Math.round(g.wtpMonthly.median * 0.8), budget: 400, ...o }));
    settle(s);
  }
  return totals(exps);
}

test('smoke test in the strong segment shows higher paid intent than a weak segment', () => {
  const strong = pooled('community', (x) => x.best), weak = pooled('community', (x) => x.weak);
  assert.ok(strong.paid / strong.visits > 2 * (weak.paid / weak.visits), `strong ${strong.paid}/${strong.visits} vs weak ${weak.paid}/${weak.visits}`);
  assert.ok(strong.paid >= 3);
});

test('network traffic inflates signups but not payments; email signup rate is not the payment rate', () => {
  const net = pooled('network', (x) => x.best), com = pooled('community', (x) => x.best);
  assert.ok(net.signups / net.visits > com.signups / com.visits, 'network signs up more per visit');
  assert.ok(net.polite / net.signups > com.polite / com.signups, 'a larger share of network signups are polite, not in pain');
  assert.ok(net.paid / net.visits <= com.paid / com.visits * 1.2, `network paid rate ${net.paid}/${net.visits} not inflated vs ${com.paid}/${com.visits}`);
  assert.ok(net.paid / Math.max(1, net.signups) < com.paid / Math.max(1, com.signups), 'fewer payers per signup from the network');
  assert.ok(com.signups > 2 * com.paid, `signup rate ${com.signups} differs from payment rate ${com.paid}`);
});

test('results come with ranges and caveats, and stay sealed until the week is over', () => {
  const s = mk(2); const g = segs(s).best;
  const e = smoke(s, { source: 'network', cta: 'email', audience: text(g) });
  assert.equal(e.results, null);
  settle(s);
  assert.equal(e.status, 'done');
  const r = e.results;
  assert.ok(r.signupRate.lo <= r.signupRate.rate && r.signupRate.rate <= r.signupRate.hi && r.signupRate.hi - r.signupRate.lo > 0.02);
  assert.equal(r.paid, null);
  assert.ok(r.caveats.some((c) => /polite/.test(c)) && r.caveats.some((c) => /not payment intent/.test(c)));
  assert.ok(s.apps.mvp.learning.length === 1 && s.apps.mvp.learning[0].quality === 'low');
});

test('pre-product landing hook: waitlist conversion only when asked, other callers still get 0', () => {
  const s = mk(1);
  assert.equal(landingConversion(s), 0);
  assert.ok(landingConversion(s, undefined, { preProduct: true }) > 0 && waitlistConversion(s) < 0.25);
});

test('concierge reveals retention and willingness to pay within a few weeks', () => {
  const run = (pick, seed) => {
    const s = mk(seed); const g = pick(segs(s));
    const e = M.startCohort(s, { type: 'concierge', audience: text(g), recruit: 'outreach', n: 12, hoursPerCustomer: 1.5, price: Math.round(g.wtpMonthly.median * 0.8), hypothesis: HYP('retention', 0.3) });
    for (let i = 0; i < 4 && M.activeMembers(e).length; i++) { if (e.weeks.length) s.day += 7; M.deliverWeek(s, e.id); }
    M.finishCohort(s, e.id);
    return { e, g, r: e.results };
  };
  const strong = [1, 2, 3, 4].map((x) => run((p) => p.best, x)), weak = [1, 2, 3, 4].map((x) => run((p) => p.weak, x));
  const mean = (rs, f) => rs.reduce((a, x) => a + f(x), 0) / rs.length;
  const ret = (x) => (x.r.retention ? x.r.retention.rate : 0);
  assert.ok(mean(strong, ret) > mean(weak, ret) + 0.15, `strong ${mean(strong, ret)} weak ${mean(weak, ret)}`);
  const withWtp = strong.filter((x) => x.r.wtp);
  assert.ok(withWtp.length >= 3);
  for (const x of withWtp) assert.ok(Math.abs(x.r.wtp.median - x.g.wtpMonthly.median) / x.g.wtpMonthly.median < 0.7, `revealed ${x.r.wtp.median} vs true ${x.g.wtpMonthly.median}`);
  assert.ok(mean(strong, (x) => x.r.payRate?.rate ?? 0) > mean(weak, (x) => x.r.payRate?.rate ?? 0));
  assert.ok(strong[0].r.caveats.some((c) => /flattered/.test(c)));
});

test('concierge forever is a mistake, and the cohort cap keeps it from scaling', () => {
  const s = mk(3); const g = segs(s).best;
  assert.throws(() => M.startCohort(s, { type: 'concierge', audience: text(g), n: 15, hoursPerCustomer: 3, price: 20, hypothesis: HYP('retention') }), /by hand/);
  const e = M.startCohort(s, { type: 'concierge', audience: text(g), recruit: 'outreach', n: 10, hoursPerCustomer: 0.5, price: 0, hypothesis: HYP('retention') });
  for (let i = 0; i < 10; i++) { e.cohort.members.forEach((m) => { m.active = true; }); if (e.weeks.length) s.day += 7; M.deliverWeek(s, e.id); }
  assert.equal(count(s, 'stayed_concierge_too_long'), 1);
  assert.ok(M.cohortResults(e).caveats.some((c) => /free pilot/i.test(c)));
});

test('Wizard of Oz reports activation; a thin UI activates fewer people', () => {
  const act = (ui) => { let k = 0, n = 0; for (const seed of [1, 2, 3, 4]) { const s = mk(seed); const g = segs(s).best; const e = M.startCohort(s, { type: 'wizard', audience: text(g), recruit: 'outreach', n: 12, hoursPerCustomer: 0.5, uiHours: ui, price: 30, hypothesis: HYP('activation', 0.3) }); M.deliverWeek(s, e.id); const r = M.cohortResults(e).activation; k += r.k; n += r.n; } return k / n; };
  assert.ok(act(60) > act(8));
});

test('design partners: friends and outsiders mislead; overfitting to one partner is logged when the feature misses', () => {
  const s = mk(4); const g = segs(s).best;
  const cands = [M.syntheticCandidate(s, 'friend'), M.syntheticCandidate(s, 'friend'), M.syntheticCandidate(s, 'outsider'), M.syntheticCandidate(s, 'friend')];
  const e = M.startPartners(s, { audience: text(g), price: 40, candidates: cands, hypothesis: HYP('payRate', 0.2) });
  assert.ok(e.partners.length + e.declined.length === 4);
  assert.throws(() => M.startPartners(s, { audience: '', candidates: cands.slice(0, 2) }), /between 3 and 10/);
  const p = e.partners[0] ?? (e.partners.push(e.declined.pop()), e.partners[0]);
  p.person.idiosyncraticAsk = 'a custom export for my accountant';
  let ask;
  for (let i = 0; i < 20 && !ask; i++) { M.holdSession(s, e.id); ask = e.feedback.find((f) => f.kind === 'ask' && f.partnerId === p.id); }
  assert.ok(ask, 'the partner voiced its own ask');
  const r = M.adoptRequest(s, e.id, ask.id);
  assert.equal(r.overfit, true);
  assert.equal(count(s, 'overfit_to_design_partner'), 0, 'adopting is a bet, not yet a cost');
  assert.ok(productSlice(s).features.some((f) => f.requestedBy === p.id));
  // It ships and only that partner uses it: logged then, with the build hours it took.
  Object.assign(r.feature, { status: 'shipped', effortHours: 18, shippedDay: s.day + 10, check: { verdict: 'missed', text: 'one account used it' } });
  assert.equal(traceFeatureOutcome(s, r.feature)?.cost.hours, 18);
  assert.equal(count(s, 'overfit_to_design_partner'), 1);
  const res = M.convertPartners(s, e.id);
  assert.ok(res.verbal >= res.paid && res.caveats.some((c) => /Friends/.test(c)));
});

test('a request that two partners share is not overfitting', () => {
  const s = mk(4); const g = segs(s).best;
  const e = M.startPartners(s, { audience: text(g), price: 40, candidates: [M.syntheticCandidate(s, 'friend'), M.syntheticCandidate(s, 'friend'), M.syntheticCandidate(s, 'friend')], hypothesis: HYP('payRate', 0.2) });
  const job = g.jobs[0];
  const [a, b] = [e.partners[0] ?? e.declined[0], e.partners[1] ?? e.declined[1]];
  for (const p of [a, b]) e.feedback.push({ id: `fb_${p.id}`, partnerId: p.id, kind: 'job', jobId: job.id, text: `${job.keywords.join(' ')} is where my week goes`, idio: false });
  if (!e.partners.includes(a)) e.partners.push(a);
  const r = M.adoptRequest(s, e.id, `fb_${a.id}`);
  assert.equal(r.overfit, false);
  assert.equal(count(s, 'overfit_to_design_partner'), 0);
});

test('thresholds are required: running without one logs a mistake, and the result cannot pass or fail', () => {
  const s = mk(2); const g = segs(s).best;
  const e = smoke(s, { audience: text(g), hypothesis: null });
  assert.equal(count(s, 'no_success_criteria'), 1);
  assert.equal(M.normalizeHypothesis('smoke', { statement: 'x', metric: 'paidRate', threshold: '' }), null);
  assert.equal(M.normalizeHypothesis('smoke', { statement: 'x', metric: 'bogus', threshold: 0.1 }), null);
  settle(s);
  assert.equal(M.verdictOf(e), 'unjudged');
  const ok = smoke(mk(2), { audience: text(g) });
  assert.equal(ok.noCriteria, false);
});

test('calling a winner on tiny n or after a failed test is logged; going ahead on an email list costs the build when the list does not pay', () => {
  const s = mk(3); const g = segs(s).best;
  const a = smoke(s, { audience: text(g), source: 'network', cta: 'email', hypothesis: HYP('signupRate', 0.99) });
  settle(s);
  assert.ok(a.n < M.MVP.tinyN.smoke);
  assert.equal(M.verdictOf(a), 'fail');
  M.callVerdict(s, a.id, 'go');
  assert.equal(count(s, 'called_on_tiny_n'), 1);
  assert.equal(count(s, 'ignored_failed_test'), 1);
  assert.equal(count(s, 'email_signup_as_demand'), 0, 'a bet on the list, not yet a cost');
  // Build on it, launch, and the list does not pay: logged then, with the build hours.
  productSlice(s).features.push({ id: 'f_list', title: 'Built for the list', status: 'shipped', shippedDay: s.day + 20, createdDay: s.day, effortHours: 35, progressHours: 35 });
  const d0 = s.day;
  s.day += 46; settleBets(s);
  assert.equal(count(s, 'email_signup_as_demand'), 1);
  assert.equal(s.mistakes.find((m) => m.id === 'email_signup_as_demand').cost.hours, 35);
  s.day = d0;
  const b = smoke(s, { audience: text(g), source: 'paid', budget: 600, hypothesis: HYP('paidRate', 0.05) });
  settle(s);
  M.callVerdict(s, b.id, 'iterate');
  assert.equal(count(s, 'called_on_tiny_n'), 1, 'iterate on a decent sample is fine');
  assert.ok(s.apps.mvp.learning.every((l) => l.called));
});

test('fake door: no apology within days costs reputation; an apology avoids it', () => {
  const run = (apologise) => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = mk(seed); const g = segs(s).best;
      const e = smoke(s, { audience: text(g), source: 'paid', budget: 800, price: Math.round(g.wtpMonthly.median * 0.7) });
      settle(s);
      if (!e.results.paid) continue;
      assert.equal(e.owesApology, true);
      if (apologise) M.sendApology(s, e.id);
      s.day += 10; M.mvpDay(s);
      return { n: count(s, 'fake_door_no_apology'), rep: s.apps.mvp.reputation };
    }
    throw new Error('no paid clicks in any seed');
  };
  assert.deepEqual(run(true), { n: 0, rep: 100 });
  const bad = run(false);
  assert.equal(bad.n, 1); assert.ok(bad.rep < 100);
});

test('building before any validation is logged; an experiment, interview or pre-sale ask clears it', () => {
  const s = mk(1);
  productSlice(s).features.push({ id: 'f1', title: 'x', status: 'building', progressHours: 55 });
  M.mvpDay(s);
  assert.equal(count(s, 'overbuilt_before_validation'), 1);
  const t = mk(1);
  productSlice(t).features.push({ id: 'f1', title: 'x', status: 'building', progressHours: 55 });
  smoke(t, { audience: text(segs(t).best) });
  M.mvpDay(t);
  assert.equal(count(t, 'overbuilt_before_validation'), 0);
});

// ---------------- Operator tiers ----------------

function archetype(tier, seed = 7) {
  const s = mk(seed); const { best, weak } = segs(s);
  const good = text(best), px = Math.round(best.wtpMonthly.median * 0.8);
  const smk = (o) => { const e = smoke(s, { audience: good, price: px, source: 'paid', budget: 500, ...o }); settle(s); return e; };
  const cc = (o) => { const e = M.startCohort(s, { type: 'concierge', audience: good, recruit: 'outreach', n: 10, hoursPerCustomer: 1, price: px, hypothesis: HYP('payRate', 0.1), ...o }); for (let i = 0; i < (o.weeks ?? 4); i++) { if (!M.activeMembers(e).length) break; if (e.weeks.length) s.day += 7; M.deliverWeek(s, e.id); } if (e.status === 'running') M.finishCohort(s, e.id); return e; };
  if (tier === 'stellar') {
    const a = smk({ hypothesis: HYP('paidRate', 0.01) });
    M.callVerdict(s, a.id, 'iterate');
    if (a.owesApology) M.sendApology(s, a.id);
    const b = cc({}); M.callVerdict(s, b.id, 'iterate');
  } else if (tier === 'good') {
    const a = smk({ cta: 'email', source: 'community', hypothesis: HYP('signupRate', 0.03) });
    M.callVerdict(s, a.id, 'iterate');
    const b = smk({ hypothesis: HYP('paidRate', 0.01) });
    M.callVerdict(s, b.id, 'iterate');
    if (b.owesApology) M.sendApology(s, b.id);
    cc({ hypothesis: null });
  } else if (tier === 'average') {
    const a = smk({ cta: 'email', source: 'community', audience: 'small businesses', hypothesis: HYP('signupRate', 0.03) });
    M.callVerdict(s, a.id, 'iterate');
    const b = smk({ cta: 'email', source: 'network', audience: 'small businesses', hypothesis: null });
    M.callVerdict(s, b.id, 'iterate');
    cc({ audience: 'small businesses', hypothesis: null, price: 0 });
  } else {
    productSlice(s).features.push({ id: 'f1', title: 'x', status: 'building', progressHours: 70 });
    const w = M.startCohort(s, { type: 'wizard', audience: text(weak), recruit: 'network', n: 4, hoursPerCustomer: 0.5, uiHours: 30, price: 0, hypothesis: null });
    for (let i = 0; i < 11; i++) { w.cohort.members.forEach((m) => { m.active = true; }); if (w.weeks.length) s.day += 7; M.deliverWeek(s, w.id); }
    M.finishCohort(s, w.id);
    const e = smk({ cta: 'email', source: 'network', audience: text(weak), hypothesis: null });
    M.callVerdict(s, e.id, 'go'); M.callVerdict(s, w.id, 'go');
    M.mvpDay(s);
  }
  return s;
}

test('operator tier mvp_experiments: the reader separates stellar, good, average and mediocre by what the player did', () => {
  assert.ok(OPERATOR_TIERS.mvp_experiments);
  assert.equal(readOperator(mk(1), 'mvp_experiments').tier, 'unknown');
  for (const seed of [7, 3, 11]) {
    const reads = ['stellar', 'good', 'average', 'mediocre'].map((tier) => ({ tier, r: readOperator(archetype(tier, seed), 'mvp_experiments') }));
    for (const { tier, r } of reads) assert.equal(r.tier, tier, `seed ${seed}: ${tier} reads ${r.tier} (score ${r.score}; ${r.evidence.join(' | ')})`);
    for (let i = 1; i < reads.length; i++) assert.ok(reads[i - 1].r.score > reads[i].r.score);
  }
  const med = readOperator(archetype('mediocre'), 'mvp_experiments');
  assert.ok(med.coaching.length > 0 && med.evidence.length > 0);
});

test('the MVP lab app is registered under Product and renders its contract', () => {
  const app = APPS.find((a) => a.id === 'mvp');
  assert.equal(app.group, 'Product');
  assert.equal(typeof app.render, 'function');
  const s = mk(1); app.onDay(s);
});
