// Hiring provenance, people-management inputs, background checks and AI screening criteria (audit fixes 2 and 3,
// gap item 25) and the hiring / people_management operator readers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import peopleApp from '../public/apps/people.js';
import legalApp from '../public/apps/legal.js';
import { ensurePeople, createJob, applyJudge, terminate, rejectCandidate } from '../public/apps/people/sim.js';
import { makeCandidate, sampleTraits } from '../public/apps/people/candidates.js';
import { exitPostMortem, replacementP12, misfitP12, MISFIT } from '../public/apps/people/provenance.js';
import { attritionMult, feedbackScore, planScore, outcomeScore, writeOnboardingPlan, setOneOnOne, giveFeedback, performanceConversation, ensureMgmt } from '../public/apps/people/manage.js';
import { orderBackgroundCheck, backgroundDay, adverseAction, validateCriterion, setCriteria, enableAshby, evaluateCandidates, autoReject, triageHours, BG_PACKAGES } from '../public/apps/people/screening.js';
import { finalists, runLoop } from './helpers/hiring-loops.js';

const APPS = [peopleApp, legalApp];
const TIERS = ['stellar', 'good', 'average', 'mediocre'];

function fresh(seed = 11) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 500000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.hoursPerWeek = 70;
  return s;
}
const flat = (v) => Object.fromEntries(Object.keys(sampleTraits(fresh(), 'engineer').traits).map((k) => [k, v]));
let n = 0;
const member = (o) => ({ id: `mem_t${n++}`, name: `Person ${n}`, role: 'engineer', jobRole: 'engineer', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: 0, hoursPerWeek: 40, salary: 140000, equityPct: 0, productivity: 1, morale: 70, rampWeeks: 8, traits: flat(50), ...o });

test('hiring tiers separate: the same finalist pools, four selection loops, 12-month replacement ordering', () => {
  const N = 40;
  const sum = Object.fromEntries(TIERS.map((t) => [t, { p12: 0, score: 0, days: 0 }]));
  for (let seed = 1; seed <= N; seed++) {
    const pool = finalists(seed);
    for (const t of TIERS) { const r = runLoop(t, seed, pool); sum[t].p12 += r.p12 / N; sum[t].score += r.pv.score / N; sum[t].days += r.pv.daysToOffer / N; }
  }
  const p = Object.fromEntries(TIERS.map((t) => [t, sum[t].p12]));
  assert.ok(p.stellar < p.good && p.good < p.average && p.average <= p.mediocre + 0.03, JSON.stringify(p));
  assert.ok(p.stellar <= 0.21 && p.mediocre >= 0.36 && p.mediocre / p.stellar >= 2.2, JSON.stringify(p));
  // Provenance score orders the same way (it is what the player did, not the outcome).
  assert.ok(sum.stellar.score > sum.good.score && sum.good.score > sum.average.score && sum.average.score >= sum.mediocre.score);
  // With the matching management routine (onboarding plan, 1:1s and feedback vs none) the full operator lands in
  // the operator-tiers bands: stellar ~5-10%, mediocre 40-60% (design targets).
  const full = (tier, fits) => fits.reduce((a, f) => a + replacementP12(f.fit, { fraud: f.fraud, clarity: f.clarity, onboarding: tier === 'stellar' ? 0.8 : 1.15, attrition: attritionMult(tier === 'stellar' ? 0.9 : 0.05) }), 0) / fits.length;
  const fits = { stellar: [], mediocre: [] };
  for (let seed = 1; seed <= N; seed++) for (const t of ['stellar', 'mediocre']) { const r = runLoop(t, seed); fits[t].push({ fit: r.fit, fraud: r.chosen.fraud, clarity: r.pv.scorecardBefore ? MISFIT.clarity.scorecard : MISFIT.clarity.none }); }
  const fs = full('stellar', fits.stellar), fm = full('mediocre', fits.mediocre);
  assert.ok(fs <= 0.13 && fm >= 0.4 && fm <= 0.65, `stellar ${fs.toFixed(3)} mediocre ${fm.toFixed(3)}`);
});

test('provenance names the skipped steps; a mis-hire post-mortem traces back to them and is logged', () => {
  const r = runLoop('mediocre', 3);
  assert.ok(r.pv.skipped.some((x) => /scorecard/.test(x)) && r.pv.skipped.some((x) => /work sample/.test(x)) && r.pv.skipped.some((x) => /reference/.test(x)), r.pv.skipped.join('; '));
  assert.ok(r.pv.skipped.some((x) => /offer sent 20 days/.test(x)));
  const st = runLoop('stellar', 3).pv;
  assert.ok(st.scorecardBefore && st.interview === 'structured' && st.workSample && st.daysToOffer <= 2);
  const s = fresh();
  const m = member({ traits: flat(25), provenance: r.pv, startDay: 0, endDay: 150, status: 'gone', exitReason: 'role mismatch' });
  s.day = 150;
  const pm = exitPostMortem(s, m);
  assert.ok(pm.misHire && /no role scorecard/.test(pm.text), pm.text);
  const logged = s.mistakes.find((x) => x.functionId === 'hiring');
  assert.ok(logged && logged.cost.usd > 10000 && logged.delayed && logged.circles, JSON.stringify(logged));
  // Misfit hazard: an undefined role multiplies the mismatch risk; a strong fit with a scorecard is low.
  assert.ok(misfitP12(-0.3, { clarity: MISFIT.clarity.none }) > 0.5 && misfitP12(0.5, { clarity: 1 }) < 0.02);
});

test('in the sim a hire carries provenance, and low-fit pipeline hires leave far more often than strong ones', () => {
  let leftWeak = 0, leftStrong = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = fresh(seed);
    const p = ensurePeople(s);
    const pvNone = { scorecardBefore: false, postQuality: 0.3, skipped: ['no role scorecard'], score: 0.1, tier: 'mediocre' };
    const pvGood = { scorecardBefore: true, postQuality: 0.8, skipped: [], score: 0.9, tier: 'stellar' };
    const weak = member({ traits: flat(36), provenance: pvNone, startDay: 0 });
    const strong = member({ traits: flat(62), provenance: pvGood, startDay: 0 });
    p.members.push(weak, strong);
    advance(s, 365, APPS);
    if (weak.status === 'gone' || weak.leavingDay != null) leftWeak++;
    if (strong.status === 'gone' || strong.leavingDay != null) leftStrong++;
  }
  assert.ok(leftWeak >= 7 && leftStrong <= 4 && leftWeak > leftStrong + 3, `weak ${leftWeak}/12 strong ${leftStrong}/12`);
});

function routine(tier, s, m) {
  const fb = {
    stellar: 'In Tuesday\'s release review you caught the proration bug before it shipped, which meant no customer was double-charged. Keep doing that: add the test to the checklist by Friday.',
    good: 'Good catch on the proration bug in the release review; it saved us from refunds. Keep it up.',
    average: 'Great job!',
  }[tier];
  if (tier === 'stellar') { writeOnboardingPlan(s, m, ['Ship the CSV import with tests and docs by day 30', 'Cut p95 dashboard latency from 2.1s to under 800ms by day 60', 'Own billing: annual plans with proration live by day 90']); setOneOnOne(s, m, { cadence: 'weekly', agenda: 'What is blocking you? What do you need from me? What are you learning? Progress against the 30/60/90 outcomes.' }); }
  if (tier === 'good') { writeOnboardingPlan(s, m, ['Get familiar with the codebase', 'Ship a feature by day 60', 'Own billing work by day 90']); setOneOnOne(s, m, { cadence: 'weekly', agenda: 'Priorities and blockers' }); }
  if (tier === 'mediocre') setOneOnOne(s, m, { cadence: 'none' });
  return fb;
}

function runTeam(tier, seed = 5) {
  const s = fresh(seed);
  const p = ensurePeople(s);
  const team = Array.from({ length: 6 }, (_, i) => member({ startDay: 1, salary: 130000 + i * 5000 }));
  p.members.push(...team);
  p.payrollSetup.gusto = true;
  const fbText = team.map((m) => routine(tier, s, m))[0];
  const every = { stellar: 21, good: 60, average: 75 }[tier];
  for (let d = 0; d < 365; d += 7) {
    advance(s, 7, APPS);
    if (every && d % every < 7) for (const m of team) if (m.status === 'active') giveFeedback(s, m, fbText);
  }
  const hist = team.flatMap((m) => m.attrHist ?? []);
  return { s, team, attr: hist.reduce((a, b) => a + b, 0) / hist.length, scores: team.map((m) => ensureMgmt(m).score) };
}

test('people-management tiers separate: same 6-person team, four routines, 12 months (attrition ~0.6x/0.85x/1x/2x)', () => {
  const r = Object.fromEntries(TIERS.map((t) => [t, runTeam(t)]));
  const rel = Object.fromEntries(TIERS.map((t) => [t, r[t].attr / r.average.attr]));
  assert.ok(rel.stellar >= 0.4 && rel.stellar <= 0.75, JSON.stringify(rel));
  assert.ok(rel.good >= 0.65 && rel.good <= 1, JSON.stringify(rel));
  assert.ok(rel.mediocre >= 1.6 && rel.mediocre <= 2.8, JSON.stringify(rel));
  // Neglect has delayed costs: quiet quitting and ledger entries for the hands-off manager only.
  assert.ok(r.mediocre.team.some((m) => m.quietQuitting) && r.mediocre.s.mistakes.some((x) => x.functionId === 'people_management'));
  assert.ok(!r.stellar.team.some((m) => m.quietQuitting));
  // 1:1s cost real founder time; ramp moves with the onboarding plan.
  assert.ok(r.stellar.s.founder.timeLog.some((t) => t.label === 'Team: 1:1s'));
  assert.ok(r.stellar.team[0].rampWeeks < r.average.team[0].rampWeeks);
  // The operator reader agrees with the routine.
  const tiers = Object.fromEntries(TIERS.map((t) => [t, readOperator(r[t].s, 'people_management')]));
  assert.equal(tiers.stellar.tier, 'stellar');
  assert.equal(tiers.mediocre.tier, 'mediocre');
  assert.ok(tiers.mediocre.coaching.length >= 2);
});

test('management judges: specific feedback and measurable plans beat generic text; stuffing does not beat honest', () => {
  const honest = feedbackScore('In Tuesday\'s demo you skipped the pricing question, so the buyer left unsure and the deal slipped a week. Next time, answer it directly and offer the annual option.');
  const generic = feedbackScore('Great job!');
  const stuffed = feedbackScore('yesterday which meant next time impact team');
  assert.ok(honest.score >= 0.75 && generic.score <= 0.25 && stuffed.score <= honest.score, `${honest.score} ${generic.score} ${stuffed.score}`);
  assert.equal(honest.kind, 'redirect');
  assert.ok(outcomeScore('Get up to speed and meet the team') < 0.3 && outcomeScore('Resolve 80% of tier-1 tickets without escalation by day 60') >= 0.8);
  const dup = planScore(['Ship the import by day 30 with 3 tests', 'Ship the import by day 30 with 3 tests', 'Ship the import by day 30 with 3 tests']);
  assert.ok(dup.score < 0.5);
});

test('performance gaps: unaddressed concern costs money and morale monthly; firing without notes risks a claim', () => {
  const s = fresh(9);
  const p = ensurePeople(s);
  const bad = member({ traits: flat(28), startDay: 0, salary: 210000 });
  const peer = member({ startDay: 0, salary: 210000 });
  p.members.push(bad, peer);
  advance(s, 240, APPS);
  assert.ok(bad.concernSince != null, 'concern detected');
  assert.ok(bad.status === 'active' && (s.mistakes ?? []).some((x) => x.id === 'avoid_hard_conversation'), `kept too long is logged (${bad.status})`);
  const s2 = fresh(9);
  const p2 = ensurePeople(s2);
  const b2 = member({ traits: flat(28), startDay: 0, salary: 210000 });
  p2.members.push(b2);
  advance(s2, 100, APPS);
  performanceConversation(s2, b2, { example: 'On Monday you merged the billing change without tests and 14 customers were double-charged.', expectation: 'Every billing change ships with tests and a reviewer, 100% of PRs, by day 30.', byDay: s2.day + 28 });
  advance(s2, 60, APPS);
  assert.ok(!(s2.mistakes ?? []).some((x) => x.id === 'avoid_hard_conversation' && x.day > 100));
  // Undocumented firing is logged and the claim probability is higher.
  terminate(s, bad.id, { severanceWeeks: 2 });
  assert.ok(s.mistakes.some((x) => x.id === 'fire_without_notes'));
  assert.ok(bad.postMortem && /Selection:/.test(bad.postMortem.text));
});

function candAtOffer(s, { fraud = null } = {}) {
  const p = ensurePeople(s);
  const job = createJob(s, { role: 'engineer', region: 'us', engagement: 'contractor', text: 'x' });
  const c = makeCandidate(s, job, null, (x) => `${x}_${n++}`);
  Object.assign(c, { stage: 'offer', fraud, offer: { sentDay: s.day, decideDay: s.day + 99 } });
  p.candidates.push(c);
  return c;
}

test('background checks: pre-offer is a fair-chance mistake; FCRA adverse action enforces the wait; pro catches identity fraud', () => {
  const s = fresh(4);
  const p = ensurePeople(s);
  const early = candAtOffer(s); early.stage = 'interviewed';
  orderBackgroundCheck(s, p, early, 'basic');
  assert.ok(s.mistakes.some((x) => x.id === 'bg_pre_offer'));
  const bal = s.bank.accounts[0].balance;
  const c = candAtOffer(s);
  orderBackgroundCheck(s, p, c, 'pro');
  assert.equal(s.bank.accounts[0].balance, bal - BG_PACKAGES.pro.usd);
  c.backgroundCheck.status = 'pending'; c.backgroundCheck.readyDay = s.day;
  c.fraud = 'stand_in';
  backgroundDay(s, p);
  if (c.backgroundCheck.status === 'consider') {
    adverseAction(s, p, c, 'pre');
    assert.throws(() => adverseAction(s, p, c, 'final'), /Wait/);
    s.day += 8;
    adverseAction(s, p, c, 'final');
    assert.equal(c.backgroundCheck.adverse, true);
  }
  // Rejecting on a "consider" report without the notices is logged as an FCRA mistake.
  const d = candAtOffer(s);
  d.backgroundCheck = { pkg: 'standard', status: 'consider', relevant: true, orderedDay: s.day };
  rejectCandidate(s, d.id);
  assert.ok(s.mistakes.some((x) => x.id === 'fcra_skipped'));
  // Identity catch rate by package over many stand-ins.
  const rate = (pkg) => { let hit = 0; for (let i = 0; i < 200; i++) { const x = candAtOffer(s, { fraud: 'stand_in' }); x.backgroundCheck = { pkg, status: 'pending', readyDay: s.day }; backgroundDay(s, p); if (x.backgroundCheck.status === 'consider') hit++; } return hit / 200; };
  assert.ok(rate('pro') > rate('basic') + 0.25);
});

test('AI application criteria: EEO validator, credits, human review vs auto-reject, triage hours', () => {
  const s = fresh(6);
  const p = ensurePeople(s);
  assert.ok(validateCriterion('Recent grad, native English speaker').warn.length >= 2);
  assert.ok(validateCriterion('Has shipped production code at an early-stage startup').trait);
  const job = createJob(s, { role: 'engineer', region: 'us', engagement: 'contractor', text: 'x' });
  applyJudge(job, { firstImpression: '', clarity: 7, specificity: 7, payTransparency: true, issues: [], rewriteHint: '' });
  for (let i = 0; i < 40; i++) p.candidates.push(makeCandidate(s, job, null, (x) => `${x}_ai${i}`));
  assert.throws(() => setCriteria(s, job, ['Young and energetic, culture fit']), /EEO/);
  enableAshby(s, p);
  setCriteria(s, job, ['Has shipped production code end-to-end', 'Has worked at an early-stage startup', 'Writes tests and owned on-call']);
  const r = evaluateCandidates(s, p, job);
  assert.ok(r.evaluated >= 30 && r.credits === 1500 - r.evaluated);
  assert.ok(p.candidates.filter((c) => c.aiEval && !c.aiEval.optedOut).every((c) => c.aiEval.results.every((x) => ['meets', 'does_not_meet', 'undecided'].includes(x.status))));
  const out = autoReject(s, p, job, 0.5);
  assert.ok(out.rejected > 0);
  if (out.missed) assert.ok(s.mistakes.some((x) => x.id === 'ai_auto_reject'));
  assert.ok(triageHours({ aiCriteria: null }, 200) >= 3 && triageHours({ aiCriteria: {}, aiEvaluated: 10 }, 200) <= 0.75);
  assert.ok(s.recurring.some((x) => x.vendor === 'Ashby' && x.amount === 400));
});

test('hiring operator reader: unknown before any hire; stellar provenance reads better than mediocre', () => {
  const s = fresh();
  assert.equal(readOperator(s, 'hiring').tier, 'unknown');
  const p = ensurePeople(s);
  p.members.push(member({ provenance: runLoop('stellar', 2).pv }));
  const good = readOperator(s, 'hiring');
  const s2 = fresh();
  ensurePeople(s2).members.push(member({ provenance: runLoop('mediocre', 2).pv }));
  const bad = readOperator(s2, 'hiring');
  assert.ok(['stellar', 'good'].includes(good.tier) && bad.tier === 'mediocre', `${good.tier} ${bad.tier}`);
  assert.ok(bad.coaching.some((x) => /outcomes|references|same job-related/i.test(x)));
});

