// End-to-end early-stage scenario: two founders, same idea and market, different operating quality. Drives the apps'
// public functions (no UI) over ~90-120 simulated days and a few seeds. Short on purpose (rules: no long sims).
// Asserts the tiers separate on what the player did, and the asymmetry rule: good process cannot create pain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket, recordStatedWtp, wtpOf } from '../public/core/market.js';
import { ensureStripe } from '../public/core/stripe.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import * as llm from '../public/core/llm.js';
import { truthOf, pmfTruth } from '../public/core/truth.js';
import { readOperator } from '../public/core/operator.js';
import { recruitBatch } from '../public/apps/research/recruit.js';
import { startSim, sendSimTurn, finishSim } from '../public/apps/research/sim.js';
import { addClaim, enrichInsights } from '../public/apps/research/synthesis.js';
import { addHypothesis, evaluateHypothesis, decideHypothesis } from '../public/apps/research/hypotheses.js';
import { flushPending, adoptRequest } from '../public/apps/research/debrief.js';
import { disc } from '../public/apps/research/store.js';
import { launchSurvey, closeSurvey, callPmf, recordCut, recordRetentionView } from '../public/apps/insights/lab.js';
import { publishTiers } from '../public/apps/channels/pricing-sim.js';
import { trueFit, shipFactors } from '../public/apps/product/fit.js';
import { newFeature, researchSlice, productSlice } from '../public/apps/product/store.js';
import * as M from '../public/apps/mvp/model.js';
import '../public/apps/outcomes/readers.js';
import '../public/apps/mvp/readers.js';
import '../public/apps/insights.js';
import { renderScript } from './helpers/founder-scripts.js';

const SCREENER = 'When did you last hit this problem, and how many times in the last month?\nWhat tool or workaround do you use today?\nHow many locations and employees does your company have?';
const SEEDS = [3, 5, 8];
const text = (g) => g.keywords.join(' ');
const ctxOf = (s) => ({ state: s, llm });

function mk(seed, demand = 1) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureStripe(s); ensureMarket(s).flags = { fixedDemand: demand }; seedDefaultStack(s);
  post(s, { amount: 5e5, counterparty: 'P', category: 'owner_contribution' });
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = '';
  s.founder.network.friends = 600;
  s.day = 1;
  return s;
}
const bestSeg = (s) => { const t = truthOf(s); return t.segments.find((g) => g.id === t.bestSegmentId); };

async function hold(s, iv, steps) {
  s.day = Math.max(s.day, iv.day);
  iv.confirmedDay = iv.day - 1;
  startSim(s, iv.id);
  if (iv.status !== 'live') return iv;
  for (const st of steps) await sendSimTurn(ctxOf(s), iv, st.q);
  return finishSim(ctxOf(s), iv);
}
const settle = (s) => { for (const e of s.apps.mvp.experiments) if (e.endDay && e.status === 'running') s.day = Math.max(s.day, e.endDay); M.mvpDay(s); };
const shipFeature = (s, f, insights) => {
  Object.assign(f, { status: 'shipped', shippedDay: s.day });
  f.ship = shipFactors(f, { insights, realInterviewsRecent: 4, rand: () => 0.5, state: s });
  productSlice(s).features.push(f);
};
const commitments = (s) => disc(s).insights.filter((i) => i.real && i.type === 'commitment').length
  + s.apps.mvp.experiments.reduce((a, e) => a + (e.results?.paid ?? 0) + (e.results?.payRate?.k ?? 0), 0);
const mistakeCount = (s) => (s.mistakes ?? []).length;
const has = (s, id) => (s.mistakes ?? []).some((m) => m.id === id);

async function stellar(seed, demand = 1) {
  const s = mk(seed, demand), g = bestSeg(s);
  s.company.icp = text(g); // sharp target
  const h = addHypothesis(s, { customer: text(g), problem: 'the task is done by hand today and costs real time', criteria: { minDescribing: 3, outOf: 6, minCommits: 1, commitLevel: 'intro' } });
  const pool = recruitBatch(s, { channel: 'panel', sends: 40, target: text(g), screener: SCREENER, incentive: 100 }).booked;
  for (const iv of pool.slice(0, 7)) await hold(s, iv, renderScript('stellar'));
  enrichInsights(s);
  const cite = disc(s).insights.filter((i) => i.real && i.segmentId === g.id).map((i) => i.id);
  if (cite.length) addClaim(s, { text: 'Owners in this segment described doing the task by hand in the last two weeks', segmentId: g.id, kind: 'pain', insightIds: cite });
  s.day += 10;
  const smoke = M.runSmoke(s, { headline: 'Stop doing it by hand: automatic reminders', offer: 'Reminders and matching done for you. Saves 5 hours a month.', source: 'community', cta: 'deposit', audience: text(g), price: Math.round(g.wtpMonthly.median * 0.8), budget: 400, hypothesis: { statement: 'Strong-segment visitors will leave a deposit', metric: 'paidRate', threshold: 0.01 } });
  settle(s); if (smoke.status === 'done') M.callVerdict(s, smoke.id, M.verdictOf(smoke) === 'fail' ? 'kill' : 'go');
  const c = M.startCohort(s, { type: 'concierge', audience: text(g), recruit: 'outreach', n: 10, hoursPerCustomer: 1.5, price: Math.round(g.wtpMonthly.median * 0.8), hypothesis: { statement: 'They keep it and pay', metric: 'payRate', threshold: 0.1 } });
  for (let i = 0; i < 4 && M.activeMembers(c).length; i++) { if (c.weeks.length) s.day += 7; M.deliverWeek(s, c.id); }
  if (c.status === 'running') M.finishCohort(s, c.id);
  if (c.status === 'done') M.callVerdict(s, c.id, M.verdictOf(c) === 'fail' ? 'iterate' : 'go');
  s.day += 25;
  // Disciplined: a test still collecting evidence gets more interviews before any verdict, never an early call.
  for (let k = 7; evaluateHypothesis(s, h).status === 'collecting' && k < pool.length; k++) await hold(s, pool[k], renderScript('stellar'));
  const hs = evaluateHypothesis(s, h).status;
  decideHypothesis(s, h.id, hs === 'pass' ? 'validated' : hs === 'fail' ? 'killed' : 'continue');
  // Build what the strong segment's jobs ask for; price from what concierge customers really paid.
  const ins = researchSlice(s).insights;
  for (const j of g.jobs.filter((x) => !x.decoy).slice(0, 2)) {
    const f = Object.assign(newFeature(s), { title: j.label, user: text(g), problem: `${j.label}, done by hand today: ${j.keywords.join(' ')}`, solution: `Sends, matches and reminds automatically so ${j.keywords.join(' ')} no longer needs a spreadsheet`, evidence: cite.slice(0, 4), grade: { total: 16 } });
    shipFeature(s, f, ins);
  }
  const revealed = c.results?.wtp?.median;
  publishTiers(s, [{ key: 't1', name: 'Pro', price: Math.round(revealed ?? g.wtpMonthly.median * 0.8), highlight: true, features: [] }]);
  s.day += 20;
  ensureMarket(s).fit.product.score = trueFit(productSlice(s).features, { icp: s.company.icp, insights: ins, state: s });
  const sv = closeSurvey(s, launchSurvey(s, { kind: 'pmf', target: 'activated' }));
  recordCut(s, 'segment', { surveyId: sv.id }); recordRetentionView(s, 'segment');
  callPmf(s, { claim: pmfTruth(s, g.id).veryDisappointed >= 0.4, surveyId: sv.id, segmentId: g.id });
  s.day += 15; flushPending(s);
  return s;
}

async function mediocre(seed, demand = 1) {
  const s = mk(seed, demand), g = bestSeg(s);
  s.company.icp = 'small businesses'; // broad
  const friends = recruitBatch(s, { channel: 'friends', sends: 30, target: '', screener: '' }).booked.slice(0, 7);
  for (const iv of friends) await hold(s, iv, renderScript('mediocre'));
  enrichInsights(s);
  // Build the loudest idiosyncratic ask, and what friends suggested.
  const ask = disc(s).insights.find((i) => i.evidenceType === 'feature_wish');
  if (ask) adoptRequest(s, ask.id);
  else {
    const ivd = friends.find((i) => i.status === 'done');
    if (ivd) { ivd.hidden.idiosyncraticAsk = 'a custom export with our own cost-centre codes'; }
  }
  s.day += 10;
  const smoke = M.runSmoke(s, { headline: 'Something new for your business', offer: 'Sign up to hear first', source: 'network', cta: 'email', audience: 'everyone', budget: 0 });
  settle(s); if (smoke.status === 'done') M.callVerdict(s, smoke.id, 'go');
  const ins = researchSlice(s).insights;
  for (const t of ['a custom export with our own cost-centre codes', 'a dark mode and a mobile widget a friend suggested']) {
    const f = Object.assign(newFeature(s), { title: t, user: 'everyone', problem: `${t} would be nice`, solution: 'Shows a page with the data', requestedBy: 'friend', custom: true, grade: { total: 8 } });
    shipFeature(s, f, ins);
  }
  recordStatedWtp(s, Math.round(wtpOf(s) * 1.5), { notes: 'what friends said they would pay', source: 'interviews' });
  publishTiers(s, [{ key: 't1', name: 'Pro', price: Math.round(wtpOf(s) * 1.5), highlight: true, features: [] }]);
  s.day += 40;
  ensureMarket(s).fit.product.score = trueFit(productSlice(s).features, { icp: s.company.icp, insights: ins, state: s });
  const sv = closeSurvey(s, launchSurvey(s, { kind: 'pmf', target: 'all' }));
  callPmf(s, { claim: true, surveyId: sv.id });
  s.day += 15; flushPending(s);
  return s;
}

test('a stellar and a mediocre founder on the same idea: tiers separate on every seed', async () => {
  for (const seed of SEEDS) {
    const a = await stellar(seed), b = await mediocre(seed);
    const g = bestSeg(a);
    const fa = a.market.fit.product.score, fb = b.market.fit.product.score;
    const rep = (s) => ({ fit: s.market.fit.product.score, se: pmfTruth(s).veryDisappointed, commits: commitments(s), mistakes: mistakeCount(s), cd: readOperator(s, 'customer_discovery').tier, mvp: readOperator(s, 'mvp_experiments').tier, pmf: readOperator(s, 'analytics_pmf').tier });
    if (process.env.DBG) console.log(seed, JSON.stringify({ a: rep(a), b: rep(b) }), (a.mistakes ?? []).map((m) => m.id).join(), '|', (b.mistakes ?? []).map((m) => m.id).join());
    assert.ok(fa > fb + 0.05 && fa > 3 * fb, `seed ${seed}: true fit ${fa} vs ${fb}`);
    assert.ok(pmfTruth(a, g.id).veryDisappointed > pmfTruth(b).veryDisappointed, `seed ${seed}: segment Sean Ellis truth`);
    assert.ok(commitments(a) > commitments(b), `seed ${seed}: real commitments ${commitments(a)} vs ${commitments(b)}`);
    assert.ok(mistakeCount(a) < mistakeCount(b), `seed ${seed}: mistakes ${mistakeCount(a)} vs ${mistakeCount(b)}`);
    const rank = { unknown: -1, mediocre: 0, average: 1, good: 2, stellar: 3 };
    for (const fn of ['customer_discovery', 'mvp_experiments', 'analytics_pmf']) {
      const ta = readOperator(a, fn).tier, tb = readOperator(b, fn).tier;
      assert.ok(rank[ta] > rank[tb], `seed ${seed} ${fn}: ${ta} vs ${tb}`);
    }
    // The mediocre founder's expected mistakes are logged and traceable.
    assert.ok(has(b, 'email_signup_as_demand'), `seed ${seed}: email signup as demand`);
    assert.ok(has(b, 'hypothetical_wtp_as_pricing'), `seed ${seed}: priced from stated WTP`);
    assert.ok(has(b, 'no_success_criteria'), `seed ${seed}: no success criteria`);
    assert.ok(!has(a, 'email_signup_as_demand') && !has(a, 'hypothetical_wtp_as_pricing'));
  }
});

test('asymmetry: a weak idea has no strong segment, so a stellar process still cannot reach PMF', async () => {
  for (const seed of SEEDS) {
    const s = await stellar(seed, 0.15);
    const t = truthOf(s);
    assert.ok(t.segments.every((g) => g.painPrevalence < 0.5), `seed ${seed}: weak idea has a strong segment`);
    assert.equal(s.apps.insights.pmf.calls[0].claim, false, `seed ${seed}: the segment call was honest`);
    s.market.fit.product.score = 0.95; // even a perfect product
    assert.ok(t.segments.every((g) => pmfTruth(s, g.id).veryDisappointed < 0.4), `seed ${seed}: PMF reachable on a weak idea`);
    const strong = await stellar(seed, 1);
    assert.ok(strong.apps.mvp.experiments.reduce((a, e) => a + (e.results?.paid ?? 0), 0) >= s.apps.mvp.experiments.reduce((a, e) => a + (e.results?.paid ?? 0), 0));
  }
});
