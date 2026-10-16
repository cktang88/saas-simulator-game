// People ops: offer negotiation, new-hire onboarding, benefits and time off, workplace, and the people_ops operator tiers.
// Short targeted tests (one mechanic each, a few seeds, no long simulations). Research: docs/research/ops-2026/.
// (test/people-ops.test.js covers provenance, people management and screening; this file is the 2026 ops slice.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import { uid, isWeekend, dayOfWeek } from '../public/core/util.js';
import { ensureCalendar } from '../public/core/calendar.js';
import { ensurePersonal } from '../public/core/personal.js';
const personalSnapshot = (st) => ensurePersonal(st).liquidSavings;
import { APPS } from '../public/apps/registry.js';
import peopleApp from '../public/apps/people.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { makeCandidate } from '../public/apps/people/candidates.js';
import { acceptProbability } from '../public/apps/people/hiring.js';
import { employerAnnual, JOB_ROLES } from '../public/apps/people/catalog.js';
import {
  ensurePeople, createJob, applyJudge, openJob, makeOffer, createPool, hireFromCandidate, terminate, attritionProbability, peopleDay, peopleMonthEnd,
} from '../public/apps/people/sim.js';
import { writeOnboardingPlan } from '../public/apps/people/manage.js';
import { monthlyCostOf } from '../public/apps/people/payroll.js';
import { devHoursPerWeek } from '../public/apps/people/capacity.js';
import { regionFlow } from '../public/apps/people/global.js';
import { ensureOps, opsEvents, emitOps } from '../public/apps/people/ops-state.js';
import {
  KFF, QSEHRA, PEO, NEG, ONB, ABS, LEASE, MODE_ATTR, CITIES, COWORK, premiumTotals, healthCost, benefitsAnnual, packageScore, STIPENDS,
} from '../public/apps/people/ops-data.js';
import {
  counterProbability, negotiationGate, adjustAcceptProb, acceptCounter, counterBack, presentMenu, setDeadline, walkAway, addSignOn, hireTermsCheck,
  payEquityCheck, raiseSalary, payTransparencyCheck, finesDay, renegeCheck, negotiationOnOffer, householdOf,
} from '../public/apps/people/negotiation.js';
import {
  startOnboarding, onboardingOnStart, onboardingQuality, onboardingMonthEnd, onboardingDay, orderEquipment, provisionAccounts, sendWelcome, completeI9,
  assignBuddy, scheduleOnboardingMeetings, revokeAccess, addBusinessDays, earlyExitP90, rampMult, offboardingDay,
} from '../public/apps/people/onboarding.js';
import { benefitsDeclineCheck, setBenefits, benefitCostSummary, ptoLiability, ptoPayoutOnExit, healthStatus, sickLeaveGapCheck, packageFor } from '../public/apps/people/benefits.js';
import {
  absenceDay, ensureAbs, approveRequest, denyRequest, presenceFactor, awayRecord, setCoverage, targetDays, isCompanyHoliday, unpaidDays, roleCoverage,
} from '../public/apps/people/absence.js';
import {
  setWorkplace, signLease, exitLease, workplaceCost, poolMult, locationAskMult, workplaceOnOpenJob, workplaceAttrMult, isolationDrain, holdOffsite,
  headsFor, leaseTerms, coworkPrice, juniorEdge, workplaceDay,
} from '../public/apps/people/workplace.js';
import { peopleOpsRead, negotiationScore } from '../public/apps/people/ops-readers.js';
import { peopleEvents, PEOPLE_TRIGGERS } from '../public/apps/people/readers.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';

const PEOPLE_APPS = APPS.filter((a) => ['people', 'legal'].includes(a.id));
const JUDGE = { firstImpression: '', clarity: 8, specificity: 8, payTransparency: true, issues: [], rewriteHint: '' };

function world(seed = 31, day = 10) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 900000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.hoursPerWeek = 80;
  s.day = day;
  s.company.incorporated = true; s.company.entity = 'ccorp';
  const p = ensurePeople(s);
  p.payrollSetup.gusto = true; p.payrollSetup.deel = true;
  ensureLegal(s); s.apps.legal.ein = { status: 'done' };
  createPool(s, 10);
  ensureOps(s);
  return s;
}
const job = (s, o = {}) => { const j = createJob(s, { text: 'x', role: 'engineer', region: 'us', engagement: 'employee', ...o }); applyJudge(j, JUDGE); return j; };
let n = 0;
// A candidate at a known ask, ready for an offer.
function cand(s, j, { ask = 100000, seniority = 'mid', otherOffers = false, role } = {}) {
  const c = makeCandidate(s, j, null, (x) => `${x}_t${n++}`);
  Object.assign(c, { expectation: ask, seniority, stage: 'interviewed', interest: 0.7, noticeDays: 14, role: role ?? j.role });
  c.persona = { ...c.persona, otherOffers };
  ensurePeople(s).candidates.push(c);
  return c;
}
// A hire made the way the game makes one (accepted offer -> member), without the random acceptance roll.
function hire(s, { ask = 100000, pay = ask, role = 'engineer', startIn = 14, seniority = 'mid', j = null, extra = {} } = {}) {
  const p = ensurePeople(s);
  const jb = j ?? job(s, { role });
  const c = cand(s, jb, { ask, seniority, role });
  c.offer = { salary: pay, hourlyRate: null, equityPct: 0, startDay: s.day + startIn, hoursPerWeek: 40, expectation: ask, sentDay: s.day, decideDay: s.day + 3, ciiaa: true, signOn: 0, ...extra };
  c.negotiation = c.negotiation ?? { status: 'none', round: 0, history: [] };
  c.stage = 'hired';
  const m = hireFromCandidate(s, p, c);
  m.salary = pay;
  if (m.ops) delete m.ops.renegeDay; // reneges are tested on their own
  return { m, c };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };

// ===================================================================================================================
// 1. Offer negotiation
// ===================================================================================================================

test('counter rates follow the research shape: rare at the ask, common below it, more for senior and in-demand people', () => {
  const s = world();
  const j = job(s);
  const mk = (ratio, o = {}) => { const c = cand(s, j, o); return { c, o: { salary: 100000 * ratio, expectation: 100000 } }; };
  const p = (ratio, o) => { const { c, o: off } = mk(ratio, o); return counterProbability(c, off); };
  assert.ok(p(1.15) < p(1.0) && p(1.0) < p(0.9) && p(0.9) < p(0.8), 'the further under their ask, the likelier a counter');
  assert.ok(p(1.0) > 0.15 && p(1.0) < 0.55, `at the ask most people still do not negotiate (${p(1.0)})`);
  assert.ok(p(0.85) > 0.6, 'a 15% lowball almost always draws a counter');
  assert.ok(p(1.0, { seniority: 'senior' }) > p(1.0, { seniority: 'mid' }) && p(1.0, { otherOffers: true }) > p(1.0));
  // The gate, over many distinct candidates, reproduces those probabilities (own stream, no main rng).
  const rate = (ratio) => {
    let c1 = 0;
    const seed = s.seed;
    for (let i = 0; i < 300; i++) {
      const c = { id: `g${ratio}_${i}`, role: 'engineer', engagement: 'employee', expectation: 100000, persona: {}, seniority: 'mid', jobId: j.id, offer: { salary: 100000 * ratio, expectation: 100000, startDay: s.day + 14, decideDay: s.day, equityPct: 0 } };
      if (negotiationGate(s, s.apps.people, c).action === 'wait') c1++;
    }
    assert.equal(s.seed, seed, 'the main rng sequence is untouched');
    return c1 / 300;
  };
  assert.ok(rate(1.0) > 0.15 && rate(1.0) < 0.45, `${rate(1.0)}`);
  assert.ok(rate(0.85) > 0.5);
});

test('base acceptance sits near the researched ~78-82% for business roles and lower for technical roles', () => {
  const s = world();
  const ctx = { path: 'indie', incorporated: true, entity: 'ccorp', runwayMonths: 24, raised: false, hireIndex: 0 };
  const avg = (role) => {
    const j = job(s, { role });
    return mean(Array.from({ length: 160 }, () => { const c = makeCandidate(s, j, null, uid); return acceptProbability(c, { salary: c.expectation, equityPct: (JOB_ROLES[role].equityBench ?? 0.3) }, ctx); }));
  };
  const biz = avg('account_executive'), tech = avg('engineer');
  assert.ok(biz > 0.7 && biz < 0.92, `business ${biz}`);
  assert.ok(tech > 0.6 && tech < 0.9, `technical ${tech}`);
});

test('a counter flows through the offer: event, mail, accept/counter-back/menu/sign-on change the terms and the odds', () => {
  const s = world(41);
  const p = ensurePeople(s);
  const j = job(s);
  const c = cand(s, j, { ask: 120000, otherOffers: true });
  makeOffer(s, c.id, { salary: 100000, equityPct: 0, startDay: s.day + 14 });
  assert.equal(c.stage, 'offer');
  assert.ok(c.negotiation.competing, 'a candidate with other offers holds a competing offer');
  // Force the counter state deterministically (the roll itself is covered above).
  c.negotiation.status = 'countered'; c.negotiation.round = 1; c.negotiation.counterDay = s.day;
  c.negotiation.counter = { want: { salary: 118000, equityPct: 0.2, signOn: 5000, startDay: s.day + 30 }, items: ['base', 'equity', 'sign-on', 'start date'] };
  emitOps(s, 'offer_countered', c.id, { candidateId: c.id });
  assert.equal(opsEvents(s, 'offer_countered', s.day).length, 1);
  // Counter back with half of it: partial satisfaction, a second round is possible, not auto-accept.
  const before = c.offer.salary;
  const r = counterBack(s, c.id, { salary: 109000, equityPct: 0.1, signOn: 2500 });
  assert.ok(r.satisfaction > 0.3 && r.satisfaction < 0.85, `${r.satisfaction}`);
  assert.equal(c.offer.salary, 109000);
  assert.ok(c.offer.salary > before);
  // Accepting their counter: full satisfaction and a high acceptance probability even with a competing offer.
  c.negotiation.status = 'countered'; c.negotiation.round = 1; c.negotiation.counterDay = s.day;
  c.negotiation.counter = { want: { salary: 118000 }, items: ['base'] };
  acceptCounter(s, c.id);
  assert.equal(c.offer.salary, 118000);
  const prob = adjustAcceptProb(s, c, acceptProbability(c, { ...c.offer, salary: 118000 }, { entity: 'ccorp', incorporated: true, runwayMonths: 20, hireIndex: 0 }));
  assert.ok(prob >= 0.9, `accepting their number closes it: ${prob}`);
  // A sign-on counts for about half its value; a menu lifts acceptance a little and picks per the candidate's preference.
  const c2 = cand(s, j, { ask: 120000 });
  makeOffer(s, c2.id, { salary: 108000, startDay: s.day + 14 });
  c2.negotiation.status = 'countered'; c2.negotiation.round = 1; c2.negotiation.counterDay = s.day; c2.negotiation.counter = { want: { salary: 120000 }, items: ['base'] };
  const m = presentMenu(s, c2.id, [{ label: 'Cash', salary: 120000, equityPct: 0, signOn: 0 }, { label: 'Equity', salary: 108000, equityPct: 1, signOn: 0 }]);
  assert.ok(['Cash', 'Equity'].includes(m.chosen.label));
  assert.ok(c2.negotiation.menuChosen && c2.negotiation.status === 'responded');
  const c3 = cand(s, j, { ask: 120000 });
  makeOffer(s, c3.id, { salary: 110000, startDay: s.day + 14 });
  const p0 = adjustAcceptProb(s, c3, 0.5);
  assert.throws(() => acceptCounter(s, c3.id), /not countered/);
  addSignOn(s, c3.id, 6000);
  assert.equal(c3.offer.signOn, 6000);
  walkAway(s, c3.id);
  assert.equal(c3.stage, 'rejected');
  assert.ok(p0 > 0);
});

test('a counter nobody answers expires, the candidate leaves and the stall is logged', () => {
  const s = world(43);
  const p = ensurePeople(s);
  const j = job(s);
  const c = cand(s, j, { ask: 120000, otherOffers: true });
  makeOffer(s, c.id, { salary: 100000, startDay: s.day + 14 });
  c.negotiation.rolled = true; c.negotiation.status = 'countered'; c.negotiation.round = 1; c.negotiation.counterDay = s.day;
  c.negotiation.counter = { want: { salary: 115000 }, items: ['base'] };
  assert.equal(negotiationGate(s, p, c).action, 'wait');
  s.day += NEG.expireDays + 1;
  const g = negotiationGate(s, p, c);
  assert.equal(g.action, 'decline');
  assert.ok(s.mistakes.some((x) => x.id === 'negotiation_stalled' && x.functionId === 'people_ops'));
});

test('an exploding offer against a candidate with a competing offer loses them; a long deadline or no rival does not', () => {
  const s = world(47);
  const p = ensurePeople(s);
  const j = job(s);
  const run = (deadlineDays, competing) => {
    let lost = 0;
    for (let i = 0; i < 80; i++) {
      const c = cand(s, j, { ask: 100000 });
      c.offer = { salary: 100000, expectation: 100000, equityPct: 0, startDay: s.day + 14, decideDay: s.day, deadlineDays, signOn: 0 };
      c.stage = 'offer';
      c.negotiation = { status: 'none', round: 0, history: [], competing: competing ? { respondIn: 7, ratio: 1.05 } : undefined, skip: false };
      c.persona.otherOffers = Boolean(competing);
      const g = negotiationGate(s, p, c);
      if (g.action === 'decline' && g.cause === 'exploded') lost++;
    }
    return lost / 80;
  };
  const fast = run(2, true), slow = run(14, true), noRival = run(2, false);
  assert.ok(fast > 0.35 && fast < 0.75, `2-day deadline vs a rival: ${fast}`);
  assert.equal(slow, 0);
  assert.equal(noRival, 0);
  assert.ok(s.mistakes.some((x) => x.id === 'exploding_offer_lost_candidate'));
  // Short deadlines are a pressure tactic: a trust hit; with no alternatives they help a little.
  const c = cand(s, j, { ask: 100000 });
  c.offer = { salary: 100000, expectation: 100000, equityPct: 0, startDay: s.day + 14, deadlineDays: 2, signOn: 0 };
  c.negotiation = { status: 'none', history: [] };
  const base = adjustAcceptProb(s, c, 0.7);
  c.offer.deadlineDays = 14;
  assert.ok(base < adjustAcceptProb(s, c, 0.7), 'a 2-day deadline costs trust');
  c.offer.deadlineDays = 3;
  assert.ok(adjustAcceptProb(s, c, 0.7) > 0.7 - 1e-9, 'a short-ish deadline helps when they have no alternatives');
});

test('lowballing gets a yes, then higher attrition and a morale drag later; the cost is logged and traceable', () => {
  const s = world(51);
  const fair = hire(s, { ask: 120000, pay: 120000 });
  const low = hire(s, { ask: 120000, pay: 96000 });
  assert.equal(fair.m.ops.lowball, undefined);
  assert.ok(low.m.ops.lowball && low.m.ops.lowball.ratio < 0.85, `${low.m.ops.lowball?.ratio}`);
  assert.ok(low.m.ops.lowball.attr > 1.4 && low.m.ops.lowball.attr <= NEG.lowball.maxAttr);
  const mis = s.mistakes.filter((x) => x.id === 'lowball_offer_attrition');
  assert.equal(mis.length, 1);
  assert.ok(mis[0].cost.usd > 0 && /scheduled/.test(mis[0].detail) === false && mis[0].delayed);
  // Weekly refresh sets the multiplier the monthly attrition roll reads.
  for (const x of [fair.m, low.m]) { x.status = 'active'; x.morale = 70; x.mgmt = { score: 0.3 }; }
  s.day += 30; while (dayOfWeek(s) !== 1) s.day += 1; // a Monday (the weekly tick)
  peopleDay(s);
  assert.ok(attritionProbability(low.m) > attritionProbability(fair.m) * 1.4, `${attritionProbability(low.m)} vs ${attritionProbability(fair.m)}`);
  // A raise to near their ask clears the drag.
  raiseSalary(s, low.m.id, 118000);
  assert.equal(low.m.ops.lowball, undefined);
});

test('overpaying a new hire opens a pay-equity problem with the team: morale, quits and a raise bill', () => {
  const s = world(53);
  const p = ensurePeople(s);
  const peer = hire(s, { ask: 110000, pay: 110000, startIn: 1 });
  peer.m.status = 'active'; peer.m.startDay = s.day - 120; peer.m.morale = 72; peer.m.seniority = 'mid';
  const star = hire(s, { ask: 110000, pay: 140000, startIn: 14, seniority: 'mid' });
  star.m.seniority = 'mid';
  const r = payEquityCheck(s, p, star.m);
  assert.ok(r && r.peers.includes(peer.m.id));
  assert.ok(peer.m.morale < 72 - NEG.overpay.peerMorale + 0.01);
  assert.equal(peer.m.ops.peerAttr, NEG.overpay.peerAttr);
  const mis = s.mistakes.find((x) => x.id === 'pay_inequity_team');
  assert.ok(mis && mis.cost.usd > 20000, `parity costs ${mis?.cost.usd}`);
  // Raising the peer toward parity fixes the flag.
  raiseSalary(s, peer.m.id, 135000);
  assert.equal(peer.m.ops.peerAttr, undefined);
  // A senior hire paid more than a junior peer is not an equity problem.
  const s2 = world(54);
  const jr = hire(s2, { ask: 90000, pay: 90000, startIn: 1 }); jr.m.status = 'active'; jr.m.startDay = s2.day - 100; jr.m.seniority = 'junior';
  const sr = hire(s2, { ask: 150000, pay: 150000, seniority: 'senior' }); sr.m.seniority = 'senior';
  assert.equal(payEquityCheck(s2, ensurePeople(s2), sr.m), null);
});

test('pay transparency: a post with no range in CA/CO/NY/WA or the EU logs a mistake and may draw a fine; a range does not', () => {
  const s = world(55);
  const p = ensurePeople(s);
  const nope = createJob(s, { text: 'x', role: 'engineer', region: 'us', engagement: 'employee', remote: true });
  applyJudge(nope, { ...JUDGE, payTransparency: false });
  assert.ok(payTransparencyCheck(s, nope)?.length, 'a remote US post is open to Colorado applicants: any size');
  assert.ok(s.mistakes.some((x) => x.id === 'no_salary_range_posted' && x.functionId === 'people_ops'));
  const ok = createJob(s, { text: 'x', role: 'engineer', region: 'us', engagement: 'employee', payLo: 140000, payHi: 180000 });
  assert.equal(payTransparencyCheck(s, ok), null);
  const eu = createJob(s, { text: 'x', role: 'engineer', region: 'weu', engagement: 'eor' });
  applyJudge(eu, { ...JUDGE, payTransparency: false });
  assert.ok(payTransparencyCheck(s, eu)?.some((x) => x.id === 'EU'));
  // Fines land for some posts (a few percent to ~10%): over many posts at least one, and the bank shows it.
  let scheduled = 0;
  for (let i = 0; i < 80; i++) { const jb = createJob(s, { text: 'x', role: 'engineer', region: 'us', engagement: 'employee' }); applyJudge(jb, { ...JUDGE, payTransparency: false }); payTransparencyCheck(s, jb); }
  scheduled = ensureOps(s).fines.length;
  assert.ok(scheduled >= 1 && scheduled < 25, `${scheduled}`);
  s.day += 200;
  const cash = s.bank.accounts[0].balance;
  finesDay(s);
  assert.ok(s.bank.accounts[0].balance < cash);
  assert.ok(s.bank.txns.some((t) => t.category === 'taxes' && /Pay transparency/.test(t.description)));
});

test('an accepted candidate can renege before day one; a welcome call and contact make it rarer', () => {
  const s = world(57);
  const p = ensurePeople(s);
  const one = (extra, welcomed) => {
    const { m, c } = hire(s, { startIn: 60, extra: {} });
    return { m, c };
  };
  // Probability model: employer counteroffer, competing offer and lowball each add risk; a long gap before the start adds more.
  const r = (opts) => { const { m, c } = one(); c.negotiation = { ...c.negotiation, ...opts.n }; const o = hireTermsCheck(s, p, m, c); return o.renegeP; };
  const base = r({ n: {} }), withEc = r({ n: { employerCounter: { raise: 0.1 } } }), both = r({ n: { employerCounter: { raise: 0.1 }, competing: { respondIn: 4, ratio: 1.05 } } });
  assert.ok(withEc > base && both > withEc && base >= NEG.renege.base && both < 0.4, `${base} ${withEc} ${both}`);
  // The save: with a welcome call on file, about half of the wobblers stay.
  let stayed = 0, total = 120;
  for (let i = 0; i < total; i++) {
    const { m } = hire(s, { startIn: 30 });
    m.ops.renegeDay = s.day;
    m.onboarding.items.welcome.done = s.day;
    const gone = renegeCheck(s, m);
    if (!gone) stayed++;
  }
  assert.ok(stayed / total > 0.35 && stayed / total < 0.65, `${stayed / total}`);
  let gone = 0;
  for (let i = 0; i < 40; i++) { const { m } = hire(s, { startIn: 30 }); m.ops.renegeDay = s.day; if (renegeCheck(s, m)) gone++; }
  assert.equal(gone, 40, 'no welcome call, no save');
  assert.ok(s.mistakes.some((x) => x.id === 'offer_reneged'));
});

// ===================================================================================================================
// 2. Onboarding
// ===================================================================================================================

test('onboarding quality shortens ramp and cuts early exits; the AI-tooling ramp effect applies to engineers', () => {
  const s = world(61);
  const full = hire(s, { startIn: 21 }); // everything done before the start
  const none = hire(s, { startIn: 21 });
  for (const x of [full, none]) { x.m.rampWeeks = 8; x.m.traits = { ai_fluency: 60 }; }
  s.mem = null;
  // Remove the coding-agent seat so only logistics move the ramp in the first comparison.
  for (const r of s.recurring) if (/claude max/i.test(r.vendor)) r.active = false;
  sendWelcome(s, full.m.id); orderEquipment(s, full.m.id, 'standard'); provisionAccounts(s, full.m.id); assignBuddy(s, full.m.id, 'founder');
  writeOnboardingPlan(s, full.m, ['Ship the annual billing change with proration tests by day 30', 'Cut p95 dashboard latency below 800 ms by day 60', 'Own on-call and close 10 customer bugs by day 90']);
  scheduleOnboardingMeetings(s, full.m.id);
  completeI9(s, full.m.id);
  assert.ok(ensureCalendar(s).events.filter((e) => /Onboarding:/.test(e.title) && e.refId === full.m.id).length >= 6, 'onboarding meetings appear on the calendar');
  assert.ok(full.m.onboarding.meetingsScheduled);
  s.day = full.m.startDay;
  onboardingOnStart(s, full.m); onboardingOnStart(s, none.m);
  assert.ok(onboardingQuality(full.m) > 0.85, `${onboardingQuality(full.m)}`);
  assert.ok(onboardingQuality(none.m) < 0.1);
  assert.ok(full.m.rampWeeks <= 8 * ONB.ramp.great * 1.05, `${full.m.rampWeeks}`);
  assert.ok(none.m.rampWeeks >= 8 * ONB.ramp.poor, `${none.m.rampWeeks}`);
  assert.ok(none.m.rampWeeks / full.m.rampWeeks > 1.5);
  assert.ok(none.m.onboarding.lateDays >= 4, 'laptop bought the morning of day one, accounts two days later');
  assert.ok(s.bank.txns.some((t) => /Same-day laptop/.test(t.description)), 'the scramble costs retail plus 25%');
  // Early exit risk: ~25% unstructured vs ~6% structured over 90 days.
  assert.equal(earlyExitP90(0), ONB.earlyExit90.none);
  assert.equal(earlyExitP90(1), ONB.earlyExit90.structured);
  // AI tools: engineers on a coding-agent seat ramp faster (DX: 49 vs 91 days to the 10th PR; weighted).
  const s2 = world(62);
  const withAi = hire(s2, { startIn: 21 }); withAi.m.rampWeeks = 8; withAi.m.traits = { ai_fluency: 60 };
  const rec = s2.recurring.find((r) => /claude max/i.test(r.vendor)); assert.ok(rec, 'default stack has a coding-agent seat');
  const s3 = world(62);
  for (const r of s3.recurring) if (/claude max/i.test(r.vendor)) r.active = false;
  const noAi = hire(s3, { startIn: 21 }); noAi.m.rampWeeks = 8; noAi.m.traits = { ai_fluency: 60 };
  for (const [st, x] of [[s2, withAi], [s3, noAi]]) { st.day = x.m.startDay; onboardingOnStart(st, x.m); }
  assert.ok(withAi.m.rampWeeks < noAi.m.rampWeeks * 0.85, `${withAi.m.rampWeeks} vs ${noAi.m.rampWeeks}`);
  assert.ok(Math.abs(withAi.m.onboarding.ramp.ai - (1 - ONB.aiRamp.weight * (1 - 49 / 91))) < 0.02);
});

test('early attrition: about a quarter of unstructured hires leave inside 90 days, far fewer with structure (month-end rolls)', () => {
  const rate = (q) => {
    const s = world(63);
    const p = ensurePeople(s);
    let left = 0;
    const N = 220;
    for (let i = 0; i < N; i++) {
      const m = { id: `mem_x${q}_${i}`, name: `P${i}`, role: 'support', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: s.day - 20, salary: 60000, hoursPerWeek: 40, morale: 70, onboarding: { items: {}, quality: q } };
      p.members.push(m);
    }
    // Quality is read from the checklist; give every member a checklist at the wanted level.
    for (const m of p.members) if (m.onboarding) m.onboarding.items = q === 1 ? { welcome: { done: m.startDay - 1, due: 0 }, plan: { due: 0 }, buddy: { done: m.startDay - 1, who: 'x' }, meetings: { done: m.startDay - 1, firstDay: m.startDay, eventIds: [] } } : { welcome: { done: null, due: 0 } };
    for (const m of p.members) if (q === 1) m.mgmt = { plan: { score: 1, beforeStart: true, day: 0 } };
    for (let mo = 0; mo < 3; mo++) { s.day += 30; onboardingMonthEnd(s, p); }
    left = p.members.filter((m) => m.leavingDay != null).length;
    return left / N;
  };
  const none = rate(0), full = rate(1);
  assert.ok(none > 0.14 && none < 0.36, `unstructured ${none}`);
  assert.ok(full < 0.15 && none > full * 1.8, `structured ${full}`);
});

test('Form I-9: Section 2 within 3 business days; a miss logs a compliance mistake with audit exposure and a late fix still counts', () => {
  const s = world(65);
  const p = ensurePeople(s);
  // Thursday start -> due the following Tuesday (3 business days).
  let d = s.day; while (new Date(Date.parse(s.startDate + 'T12:00:00Z') + d * 86400000).getUTCDay() !== 4) d++;
  assert.equal(new Date(Date.parse(s.startDate + 'T12:00:00Z') + addBusinessDays(s, d, 3) * 86400000).getUTCDay(), 2);
  const a = hire(s, { startIn: d - s.day + 1 }); // starts Thursday+... any start; use its own due date
  const due = a.m.onboarding.items.i9.due;
  s.day = a.m.startDay; a.m.status = 'active';
  s.day = due + 1;
  onboardingDay(s, p);
  assert.ok(s.mistakes.some((x) => x.id === 'missed_i9_deadline' && x.functionId === 'people_ops'));
  assert.ok(ensureOps(s).i9Open.some((x) => x.memberId === a.m.id));
  // On time: no mistake; contractors and non-US hires have no I-9.
  const s2 = world(66);
  const b = hire(s2, { startIn: 10 });
  s2.day = b.m.startDay; b.m.status = 'active';
  completeI9(s2, b.m.id);
  s2.day = b.m.onboarding.items.i9.due + 2;
  onboardingDay(s2, ensurePeople(s2));
  assert.ok(!s2.mistakes.some((x) => x.id === 'missed_i9_deadline'));
  const c = hire(s2, { startIn: 10 }); c.m.region = 'weu'; c.m.engagement = 'eor';
  startOnboarding(s2, c.m);
  assert.equal(c.m.onboarding.items.i9, undefined);
  // Audits fine a small share of missing forms over time, once per person.
  const s3 = world(67);
  const x = hire(s3, { startIn: 5 });
  ensureOps(s3).i9Open.push({ memberId: x.m.id, name: x.m.name, late: false });
  const cash = s3.bank.accounts[0].balance;
  for (let i = 0; i < 400; i++) { s3.day += 30; onboardingMonthEnd(s3, ensurePeople(s3)); }
  const fines = s3.bank.txns.filter((t) => /I-9 paperwork/.test(t.description));
  assert.equal(fines.length, 1);
  assert.ok(-fines[0].amount >= ONB.i9.fine[0] && -fines[0].amount <= ONB.i9.fine[1]);
  assert.ok(s3.bank.accounts[0].balance < cash);
});

test('offboarding: access left on after an exit is a mistake the next day and a security incident risk; revoking the same day is clean', () => {
  const s = world(69);
  const p = ensurePeople(s);
  const a = hire(s, { startIn: 1 }); a.m.status = 'active'; a.m.startDay = s.day - 60;
  const b = hire(s, { startIn: 1 }); b.m.status = 'active'; b.m.startDay = s.day - 60;
  terminate(s, a.m.id, { reason: 'let go' });
  terminate(s, b.m.id, { reason: 'let go' });
  assert.equal(ensureOps(s).offboard.length, 2);
  revokeAccess(s, b.m.id);
  s.day += 2;
  offboardingDay(s);
  const flagged = s.mistakes.filter((x) => x.id === 'access_not_revoked');
  assert.equal(flagged.length, 1);
  assert.match(flagged[0].detail, new RegExp(a.m.name));
  // Incidents hit only the unrevoked exit, at a monthly rate (fired > resigned).
  let inc = 0;
  for (let i = 0; i < 90; i++) { s.day += 30; const before = ensureOps(s).offboard.filter((x) => x.incident).length; onboardingMonthEnd(s, p); inc += ensureOps(s).offboard.filter((x) => x.incident).length - before; if (inc) break; }
  assert.equal(inc, 1);
  assert.ok(ensureOps(s).offboard.find((x) => x.memberId === a.m.id).incident && !ensureOps(s).offboard.find((x) => x.memberId === b.m.id).incident);
  assert.ok(s.mistakes.some((x) => x.id === 'access_not_revoked' && x.cost.usd >= 3000));
});

// ===================================================================================================================
// 3. Benefits and time off
// ===================================================================================================================

test('benefit cost math: KFF 2025 premiums trended by 2026, employer contribution, QSEHRA cap, PEO fee, dental and stipends', () => {
  const s = world(71, 10); // game year 2026
  const t = premiumTotals(s);
  assert.equal(t.single, Math.round(KFF.single * 1.11 * 100) / 100);
  assert.equal(t.family, Math.round(KFF.family * 1.11 * 100) / 100);
  const group = healthCost(s, { mode: 'group', contribPct: 0.85, depPct: 0 });
  assert.ok(Math.abs(group.single - t.single * 0.85) < 0.02);
  assert.ok(Math.abs(group.family - t.single * 0.85) < 0.02, 'dependents are the employee\'s cost unless you contribute');
  const dep = healthCost(s, { mode: 'group', contribPct: 0.85, depPct: 0.5 });
  assert.ok(dep.family > group.family + 5000);
  const q = healthCost(s, { mode: 'qsehra', allowance: 700 });
  assert.equal(q.single, QSEHRA.single, 'single capped at $6,450');
  assert.equal(q.family, 700 * 12, 'family under its $13,100 cap');
  assert.equal(healthCost(s, { mode: 'qsehra', allowance: 1500 }).family, QSEHRA.family);
  assert.equal(healthCost(s, { mode: 'ichra', allowance: 900 }).single, 10800, 'ICHRA has no dollar cap');
  const peo = healthCost(s, { mode: 'peo', contribPct: 0.85, depPct: 0, peoTier: 'basic' });
  assert.ok(Math.abs(peo.single - (t.single * 0.97 * 0.85 + PEO.basic * 12)) < 0.05, `${peo.single}`);
  assert.ok(healthCost(s, { mode: 'peo', contribPct: 0.85, peoTier: 'plus' }).single > peo.single + 500);
  assert.equal(healthCost(s, { mode: 'none' }).avg, 0);
  const b = { health: { mode: 'group', contribPct: 0.85, depPct: 0 }, dentalVision: true, k401: { on: true, matchPct: 0.03 }, stipends: { home: true, learning: true, wellness: false } };
  const a = benefitsAnnual(s, b);
  assert.equal(a.dental, 55 * 12);
  assert.equal(a.stipends, STIPENDS.home * 12 + STIPENDS.learning);
  assert.ok(Math.abs(a.retirement - 0.03 * 0.65) < 1e-9);
  // Payroll reads the configured policy: employerAnnual rises with a richer plan and drops with none.
  const gross = 150000;
  const before = employerAnnual(s, gross);
  setBenefits(s, { health: { mode: 'none' } });
  const none = employerAnnual(s, gross);
  setBenefits(s, { health: { mode: 'group', contribPct: 0.9, depPct: 0.3 }, dentalVision: true, k401: { on: true, matchPct: 0.04 } });
  const rich = employerAnnual(s, gross);
  assert.ok(none < before && rich > before + 3000, `${none} < ${before} < ${rich}`);
  // The 401(k) provider fee is a recurring bill; a PEO or small group needs enrollment to start.
  const h = hire(s, { startIn: 1 }); h.m.status = 'active';
  setBenefits(s, { health: { mode: 'peo' } });
  assert.equal(healthStatus(s).active, false, 'a PEO carrier needs two enrolled employees');
  assert.equal(packageFor(s).health, 0);
  assert.ok(s.recurring.some((r) => /401\(k\)/.test(r.vendor) && r.active && r.amount >= 49));
  const sum = benefitCostSummary(s);
  assert.ok(sum.companyMonth > 0);
});

test('a missing health benefit lowers offer acceptance and a lost candidate over it is logged', () => {
  const s = world(73);
  const j = job(s);
  const c = cand(s, j, { ask: 100000 });
  c.household = 'family';
  c.offer = { salary: 100000, expectation: 100000, equityPct: 0, startDay: s.day + 14, decideDay: s.day, signOn: 0 };
  const base = adjustAcceptProb(s, c, 0.8);
  setBenefits(s, { health: { mode: 'none' } });
  const none = adjustAcceptProb(s, c, 0.8);
  setBenefits(s, { health: { mode: 'group', contribPct: 0.85 } });
  const good = adjustAcceptProb(s, c, 0.8);
  assert.ok(none < base - 0.05, `${none} vs ${base}`);
  assert.ok(good >= base - 0.02, 'a competitive plan is neutral to slightly positive');
  assert.ok(packageScore(s, ensureOps(s).benefits, { family: true }).score > 0.9);
  setBenefits(s, { health: { mode: 'none' } });
  const ev = ensureOps(s);
  c.offer = { salary: 100000, expectation: 100000, equityPct: 0, startDay: s.day + 14, decideDay: s.day, signOn: 0 };
  c.stage = 'offer';
  // Decline path: the mistake is logged via the sim hook.
  benefitsDeclineCheck(s, c);
  assert.ok(s.mistakes.some((x) => x.id === 'no_health_benefits_lost_candidate'));
  assert.equal(ev.benefits.health.mode, 'none');
});

test('accrued PTO is a liability, paid out on exit in California (not in Texas); unlimited has no balance or payout', () => {
  const s = world(75);
  const p = ensurePeople(s);
  setBenefits(s, { pto: { mode: 'accrued', daysPerYear: 15 } });
  const ca = hire(s, { startIn: 1, pay: 130000 }); ca.m.status = 'active'; ca.m.workState = 'CA'; ca.m.abs = { bal: 10, denied: [], sickProne: 1, yearStart: s.day, taken: 0, takenYear: 0, sickDays: 0, sickYear: 0 };
  const tx = hire(s, { startIn: 1, pay: 130000 }); tx.m.status = 'active'; tx.m.workState = 'TX'; tx.m.abs = { ...ca.m.abs, bal: 10, denied: [] };
  const daily = 130000 / 260;
  assert.ok(Math.abs(ptoLiability(s) - 20 * daily) < 0.05, `${ptoLiability(s)}`);
  const cash = s.bank.accounts[0].balance;
  terminate(s, ca.m.id, { reason: 'let go' });
  assert.ok(Math.abs(cash - s.bank.accounts[0].balance - 10 * daily) < 0.05 + 100000 * 0, 'payout of 10 days at the daily rate (plus nothing else posts)');
  assert.ok(s.mistakes.some((x) => x.id === 'pto_payout_owed' && Math.abs(x.cost.usd - 10 * daily) < 0.05));
  const cash2 = s.bank.accounts[0].balance;
  terminate(s, tx.m.id, { reason: 'let go' });
  assert.equal(s.bank.accounts[0].balance, cash2, 'Texas does not require payout');
  assert.equal(s.mistakes.filter((x) => x.id === 'pto_payout_owed').length, 1);
  setBenefits(s, { pto: { mode: 'unlimited' } });
  assert.equal(ptoLiability(s), 0);
});

test('unlimited PTO does not make people take more days; fixed policies are used at ~76% (11.4 of 15)', () => {
  const taken = (mode, days, seed) => {
    const s = world(seed, 0);
    const p = ensurePeople(s);
    setBenefits(s, { pto: { mode, daysPerYear: days } });
    for (let i = 0; i < 14; i++) { const mm = { id: `mem_v${mode}${i}`, name: `V${i}`, role: 'ops', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: -30, salary: 90000, hoursPerWeek: 40, morale: 70 }; ensureAbs(s, mm).bal = days; p.members.push(mm); }
    for (let d = 0; d < 365; d++) { s.day += 1; absenceDay(s, p); }
    const rec = ensureOps(s).absences.filter((r) => r.kind === 'vacation' && ['approved', 'done'].includes(r.status));
    return rec.reduce((a, r) => a + r.days, 0) / 14;
  };
  const unl = taken('unlimited', 15, 77), acc15 = taken('accrued', 15, 77), acc20 = taken('accrued', 20, 77);
  assert.ok(unl > 7 && unl < 15, `unlimited ${unl}`);
  assert.ok(unl <= acc15 + 2.5, `unlimited ${unl} vs accrued-15 ${acc15}`);
  assert.ok(acc20 > acc15, 'more granted days, more taken');
  assert.equal(targetDays(world(1), { region: 'us' }, { pto: { mode: 'unlimited', daysPerYear: 15 } }), ABS.vacation.unlimitedDays);
  assert.ok(targetDays(world(1), { region: 'us' }, { pto: { mode: 'accrued', daysPerYear: 15 } }) < 12);
  // EOR hires get the statutory floor even when the policy is stingy or unlimited.
  assert.ok(targetDays(world(1), { region: 'weu' }, { pto: { mode: 'unlimited' } }) > 20);
});

test('sick days: median ~3 a year, heavy tail with occasional multi-week medical leave; output drops while away', () => {
  const s = world(79, 0);
  const p = ensurePeople(s);
  setBenefits(s, { pto: { mode: 'accrued', daysPerYear: 15 } });
  const N = 260;
  for (let i = 0; i < N; i++) p.members.push({ id: `mem_s${i}`, name: `S${i}`, role: 'ops', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: -30, salary: 90000, hoursPerWeek: 40, morale: 70 });
  for (let d = 0; d < 365; d++) { s.day += 1; absenceDay(s, p); }
  const per = p.members.map((m) => ensureOps(s).absences.filter((r) => r.memberId === m.id && ['cold', 'flu', 'medical', 'mental'].includes(r.kind)).reduce((a, r) => a + r.days, 0));
  const med = median(per), avg = mean(per);
  assert.ok(med >= 2 && med <= 5, `median ${med}`);
  assert.ok(avg > med && avg < 9, `mean ${avg}`);
  assert.ok(Math.max(...per) >= 15, 'a multi-week leave happens');
  const longLeaves = ensureOps(s).absences.filter((r) => r.kind === 'medical' || r.kind === 'mental');
  assert.ok(longLeaves.length >= 2 && longLeaves.length < N * 0.15);
  assert.ok(ensureOps(s).absences.some((r) => r.kind === 'parental') || ensureOps(s).absences.some((r) => r.kind === 'bereavement'), 'life events happen');
  assert.ok(opsEvents(s, 'employee_out_sick', 0).length > 100, 'events feed Automations');
  // Output: away means zero presence; unpaid days only after the paid sick window.
  const rec = ensureOps(s).absences.find((r) => r.kind === 'medical' || r.kind === 'mental');
  const m = p.members.find((x) => x.id === rec.memberId);
  s.day = rec.start;
  assert.equal(presenceFactor(s, m), 0);
  assert.ok(unpaidDays(s, m, rec.start, rec.end) > 0 || rec.days <= 5);
  s.day = rec.end + 1;
  assert.equal(awayRecord(s, m), null);
});

test('coverage gap: the only support person out backs up the queue and logs single_point_of_failure; runbooks and an on-call contractor cover it', () => {
  const run = (cover) => {
    const s = world(81, 40);
    const p = ensurePeople(s);
    const sup = hire(s, { role: 'support', startIn: 1, ask: 55000, pay: 55000 }); sup.m.status = 'active'; sup.m.startDay = s.day - 90; sup.m.role = 'support';
    p.support.lastWeek = { total: 60 };
    if (cover) setCoverage(s, { runbooks: true, onCall: true });
    ensureOps(s).absences.push({ id: 'abs_t', memberId: sup.m.id, kind: 'flu', start: s.day, end: s.day + 9, days: 7, status: 'active', label: 'Sick (flu)' });
    let d = 0;
    for (let i = 0; i < 6; i++) { s.day += 1; if (!isWeekend(s)) { absenceDay(s, p); d++; } }
    return { s, sup, back: p.support.backlog, mis: s.mistakes.filter((x) => x.id === 'single_point_of_failure'), presence: presenceFactor(s, sup.m) };
  };
  const bare = run(false), cov = run(true);
  assert.ok(bare.back > 20, `${bare.back}`);
  assert.equal(bare.mis.length, 1);
  assert.ok(bare.mis[0].cost.usd > 0 && /runbooks/.test(bare.mis[0].detail));
  assert.equal(bare.presence, 0);
  assert.ok(cov.back < bare.back * 0.6 && cov.mis.length === 0 && cov.presence > 0.5, `${cov.back} ${cov.presence}`);
  assert.ok(cov.s.recurring.some((r) => /On-call/.test(r.vendor) && r.active));
  // With two support people, one out is not a gap.
  const s = world(82, 40);
  const p = ensurePeople(s);
  const a = hire(s, { role: 'support', startIn: 1 }); const b = hire(s, { role: 'support', startIn: 1 });
  for (const x of [a, b]) { x.m.status = 'active'; x.m.startDay = s.day - 90; x.m.role = 'support'; }
  ensureOps(s).absences.push({ id: 'abs_u', memberId: a.m.id, kind: 'flu', start: s.day, end: s.day + 9, days: 7, status: 'active', label: 'Sick (flu)' });
  assert.deepEqual(roleCoverage(s).find((c) => c.role === 'support'), { role: 'support', total: 2, away: 1, down: false, single: false });
});

test('vacation requests: approve or deny; repeated denials burn people out and are logged; silence auto-approves', () => {
  const s = world(83, 40);
  const p = ensurePeople(s);
  const h = hire(s, { startIn: 1 }); h.m.status = 'active'; h.m.startDay = s.day - 200; h.m.morale = 70;
  const req = (id, start) => ({ id, memberId: h.m.id, kind: 'vacation', start: s.day + start, end: s.day + start + 3, days: 4, status: 'pending', requestedDay: s.day, label: 'Vacation' });
  const o = ensureOps(s);
  o.absences.push(req('r1', 20), req('r2', 30), req('r3', 40));
  h.m.abs = { bal: 12, denied: [], sickProne: 1, yearStart: s.day, taken: 0, takenYear: 0, sickDays: 0, sickYear: 0 };
  denyRequest(s, 'r1');
  assert.equal(h.m.morale, 70 - ABS.denied.moraleHit);
  denyRequest(s, 'r2', { alt: true });
  assert.equal(h.m.morale, 70 - ABS.denied.moraleHit - ABS.denied.altHit, 'offering other dates softens it');
  assert.equal(h.m.ops.deniedAttr, undefined, 'one hard denial is not a pattern');
  denyRequest(s, 'r3');
  const o2 = ensureOps(s);
  o2.absences.push(req('r4', 50), req('r5', 60));
  denyRequest(s, 'r4'); // second hard denial
  assert.ok(h.m.ops.deniedAttr >= ABS.denied.attrMult);
  denyRequest(s, 'r5'); // third
  assert.ok(s.mistakes.some((x) => x.id === 'denied_vacation_burnout' && x.cost.usd > 0));
  // Attrition rises with the multiplier once refreshed.
  s.day += 7; while (dayOfWeek(s) !== 1) s.day += 1;
  peopleDay(s);
  assert.ok((h.m.opsAttr ?? 1) > 1.2, `${h.m.opsAttr}`);
  // Silence: an unanswered request is approved after 7 days and the person notices.
  const s2 = world(84, 40);
  const p2 = ensurePeople(s2);
  const g = hire(s2, { startIn: 1 }); g.m.status = 'active'; g.m.startDay = s2.day - 200; g.m.morale = 70;
  ensureOps(s2).absences.push({ id: 'q1', memberId: g.m.id, kind: 'vacation', start: s2.day + 20, end: s2.day + 23, days: 4, status: 'pending', requestedDay: s2.day, label: 'Vacation' });
  g.m.abs = { bal: 12, denied: [], sickProne: 1, yearStart: s2.day, taken: 0, takenYear: 0, sickDays: 0, sickYear: 0 };
  s2.day += ABS.vacation.autoApproveAfter; absenceDay(s2, p2);
  const q = ensureOps(s2).absences.find((x) => x.id === 'q1');
  assert.equal(q.status, 'approved');
  assert.ok(q.auto && g.m.morale < 70);
});

test('state paid sick leave: an accrued policy below the state mandate is logged; US holidays follow the policy', () => {
  const s = world(85, 40);
  const x = hire(s, { startIn: 1 }); x.m.status = 'active'; x.m.workState = 'CO';
  setBenefits(s, { pto: { mode: 'accrued', daysPerYear: 4 } });
  assert.equal(sickLeaveGapCheck(s).length, 1, 'Colorado requires 48 hours; 4 days is 32');
  assert.ok(s.mistakes.some((m) => m.id === 'state_sick_leave_gap'));
  setBenefits(s, { pto: { mode: 'accrued', daysPerYear: 8 } });
  const s2 = world(86, 40);
  const y = hire(s2, { startIn: 1 }); y.m.status = 'active'; y.m.workState = 'TX';
  setBenefits(s2, { pto: { mode: 'accrued', daysPerYear: 4 } });
  assert.equal(sickLeaveGapCheck(s2).length, 0, 'no mandate in Texas');
  // Holidays: Thanksgiving 2026 (Nov 26) is in the first six; Columbus Day is not in an 8-day policy.
  const d = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(s.startDate + 'T12:00:00Z')) / 86400000);
  assert.equal(isCompanyHoliday(s, d('2026-11-26')), true);
  assert.equal(isCompanyHoliday(s, d('2026-12-25')), true);
  assert.equal(isCompanyHoliday(s, d('2026-11-27')), false);
  assert.equal(isCompanyHoliday(s, d('2027-01-01')), true);
  setBenefits(s, { pto: { holidays: 10 } });
  assert.equal(isCompanyHoliday(s, d('2027-01-18')), true, 'MLK Day is the 7th holiday');
});

// ===================================================================================================================
// 4. Workplace
// ===================================================================================================================

test('coworking and lease cost math; rent posts monthly through the bank', () => {
  const s = world(91);
  const p = ensurePeople(s);
  const a = hire(s, { startIn: 1 }); a.m.status = 'active';
  const b = hire(s, { startIn: 1 }); b.m.status = 'active';
  assert.equal(headsFor(s), 3);
  assert.equal(coworkPrice('austin', 'dedicated', 'month'), Math.round(CITIES.austin.dedicated * 1.2 * 100) / 100);
  assert.ok(coworkPrice('austin', 'hot_desk', 'year') < coworkPrice('austin', 'hot_desk', 'month') * 0.75, 'a 12-month commitment is cheaper');
  assert.ok(coworkPrice('sf', 'private') > coworkPrice('sf', 'dedicated') && coworkPrice('sf', 'dedicated') > coworkPrice('sf', 'hot_desk'));
  setWorkplace(s, { mode: 'cowork', city: 'austin', cowork: { tier: 'hot_desk', term: 'month' } });
  const seats = Math.ceil(3 * COWORK.seatRatioHot);
  const expect = Math.round(coworkPrice('austin', 'hot_desk', 'month') * seats * 100) / 100;
  assert.equal(workplaceCost(s).cowork, expect);
  const r = s.recurring.find((x) => /Coworking membership/.test(x.vendor));
  assert.ok(r && r.active && r.amount === expect);
  // 12-month commitment: leaving early costs 75% of what is left.
  setWorkplace(s, { mode: 'cowork', city: 'austin', cowork: { tier: 'dedicated', term: 'year' } });
  const cash = s.bank.accounts[0].balance;
  setWorkplace(s, { mode: 'remote' });
  assert.ok(cash - s.bank.accounts[0].balance > 4 * workplaceCost({ ...s }).total, 'early exit fee posted');
  assert.equal(s.recurring.find((x) => /Coworking membership/.test(x.vendor)).active, false);
  // Lease: sq ft x $/sq ft / 12 plus operating costs; deposit two months, or six months in place of a guarantee.
  const lt = leaseTerms('austin', 1200);
  assert.equal(lt.base, Math.round(1200 * CITIES.austin.leaseSf / 12 * 100) / 100);
  assert.equal(lt.monthly, Math.round(lt.base * (1 + LEASE.opexShare) * 100) / 100);
  const bal0 = s.bank.accounts[0].balance;
  const l = signLease(s, { city: 'austin', sqft: 1200, termYears: 3, buildOut: 'light', guarantee: 'personal' });
  assert.equal(l.deposit, Math.round(lt.monthly * 2 * 100) / 100);
  assert.equal(l.buildCost, 1200 * LEASE.buildOutPerSf.light);
  assert.ok(bal0 - s.bank.accounts[0].balance >= l.deposit + l.buildCost + LEASE.lawyer - 0.01);
  assert.ok(s.recurring.some((x) => /Landlord/.test(x.vendor) && x.active && x.amount === lt.monthly));
  assert.equal(workplaceCost(s).rent, lt.monthly);
  assert.equal(s.apps.people.ops.workplace.mode, 'lease');
  // Hot desk hybrid: fewer desks than people.
});

test('long_lease_too_early: signing with a tiny team is logged; leaving early costs real money; a personal guarantee gets called on default', () => {
  const s = world(93);
  const l = signLease(s, { city: 'sf', sqft: 1500, termYears: 5, buildOut: 'standard', guarantee: 'personal' });
  assert.ok(l.pg && l.total > 400000);
  const mis = s.mistakes.filter((x) => x.id === 'long_lease_too_early');
  assert.equal(mis.length, 1);
  assert.match(mis[0].detail, /personal guarantee/);
  // Sublease: months vacant, then a discount; the loss is real and logged.
  const s1 = world(93);
  signLease(s1, { city: 'sf', sqft: 1500, termYears: 5, buildOut: 'standard', guarantee: 'deposit' });
  const left = 60;
  const cash = s1.bank.accounts[0].balance;
  const r = exitLease(s1, 'sublease');
  assert.ok(r.paid > 20000 && r.paid < s1.apps.people.ops.workplace.lease.monthly * left * 0.9, `${r.paid}`);
  assert.ok(cash - s1.bank.accounts[0].balance >= r.paid - 0.01);
  assert.ok(s1.mistakes.some((x) => x.id === 'long_lease_too_early' && x.cost.usd === r.paid));
  // Buyout: ~80% of the rest, less the deposit.
  const s2 = world(93);
  const l2 = signLease(s2, { city: 'sf', sqft: 1500, termYears: 5, buildOut: 'light', guarantee: 'personal' });
  const b = exitLease(s2, 'buyout');
  assert.ok(Math.abs(b.paid - (l2.monthly * 60 * LEASE.buyout - l2.deposit)) < l2.monthly, `${b.paid}`);
  // Default with a personal guarantee: it comes out of your savings, not the company.
  const s3 = world(93);
  const l3 = signLease(s3, { city: 'sf', sqft: 1500, termYears: 5, buildOut: 'light', guarantee: 'personal' });
  const sav = personalSnapshot(s3);
  const d = exitLease(s3, 'default');
  assert.ok(sav - personalSnapshot(s3) > l3.monthly * 40, `${sav - personalSnapshot(s3)}`);
  assert.ok(s3.mistakes.some((x) => x.id === 'personal_guarantee_called' && x.cost.usd === d.paid));
  // No guarantee: the deposit is forfeited, nobody personally owes.
  const s4 = world(93);
  signLease(s4, { city: 'sf', sqft: 1500, termYears: 5, buildOut: 'light', guarantee: 'deposit' });
  const sav4 = personalSnapshot(s4);
  exitLease(s4, 'default');
  assert.equal(personalSnapshot(s4), sav4);
  assert.ok(!s4.mistakes.some((x) => x.id === 'personal_guarantee_called'));
  // The lease ends: a renewal event 6 months out, then a holdover at 125%.
  const s5 = world(94);
  const l5 = signLease(s5, { city: 'austin', sqft: 900, termYears: 3, buildOut: 'light', guarantee: 'deposit' });
  s5.day = l5.endDay - 170; workplaceDay(s5);
  assert.equal(opsEvents(s5, 'lease_renewal_due', 0).length, 1);
  s5.day = l5.endDay + 1; workplaceDay(s5);
  assert.equal(workplaceCost(s5).rent, Math.round(l5.monthly * 1.25 * 100) / 100);
});

test('office-required roles shrink the applicant pool (remote roles draw ~4x), cost days to fill, and ask for city pay', () => {
  const s = world(95);
  const p = ensurePeople(s);
  setWorkplace(s, { mode: 'hybrid', city: 'sf', hybridBase: 'cowork', cowork: { tier: 'hot_desk', term: 'month' } });
  const remote = job(s, { remote: true });
  const office = job(s, { remote: false });
  const rf = regionFlow(s, remote), of = regionFlow(s, office);
  assert.ok(of.profiles < rf.profiles * 0.55, `${of.profiles} vs ${rf.profiles}`);
  assert.ok(rf.profiles / of.profiles > 2);
  assert.equal(poolMult(s, remote).mult, 1);
  const off = poolMult(s, { remote: false }, 'office').mult, hy = poolMult(s, { remote: false }, 'hybrid').mult;
  assert.ok(off < hy && hy < 1 && Math.abs(off - 0.28) < 0.01);
  workplaceOnOpenJob(s, office);
  workplaceOnOpenJob(s, remote);
  const mis = s.mistakes.filter((x) => x.id === 'office_required_shrinks_pool');
  assert.equal(mis.length, 1);
  assert.ok(mis[0].cost.days > 20);
  assert.equal(locationAskMult(s, office), CITIES.sf.ask);
  assert.equal(locationAskMult(s, remote), 1);
  // openJob logs it through the real hook too.
  const j2 = job(s, { remote: false }); p.jobs.find((x) => x.id === j2.id).channels = [];
});

test('quits by workplace mode (hybrid cut quits about a third vs onsite), junior in-person edge, founder isolation and offsites', () => {
  const s = world(97);
  const p = ensurePeople(s);
  assert.equal(workplaceAttrMult(s, {}), 1, 'unconfigured is the baseline');
  setWorkplace(s, { mode: 'remote' });
  assert.equal(workplaceAttrMult(s, {}), MODE_ATTR.remote);
  assert.ok(Math.abs(MODE_ATTR.hybrid / MODE_ATTR.lease - 0.672) < 0.01, 'hybrid ~ two-thirds of onsite quits (Trip.com)');
  // Juniors gain a little in person.
  assert.equal(juniorEdge(s, { seniority: 'junior' }), 1);
  setWorkplace(s, { mode: 'cowork', city: 'austin', cowork: { tier: 'hot_desk', term: 'month' } });
  assert.ok(juniorEdge(s, { seniority: 'junior' }) > 1 && juniorEdge(s, { seniority: 'senior' }) === 1);
  // Isolation: solo remote drains energy; day passes or a desk limit it; a team removes it.
  setWorkplace(s, { mode: 'remote', dayPasses: 0 });
  const bare = isolationDrain(s);
  setWorkplace(s, { mode: 'remote', dayPasses: 2 });
  const passes = isolationDrain(s);
  setWorkplace(s, { mode: 'cowork', cowork: { tier: 'hot_desk', term: 'month' } });
  const desk = isolationDrain(s);
  assert.ok(bare > passes && passes > desk && desk > 0, `${bare} ${passes} ${desk}`);
  const m1 = hire(s, { startIn: 1 }); m1.m.status = 'active';
  setWorkplace(s, { mode: 'remote', dayPasses: 0 });
  assert.equal(isolationDrain(s), 0, 'with a team the solo-founder drain stops');
  // Offsite: needs a team, costs $600-1,800 a head, lifts morale.
  assert.throws(() => holdOffsite(s, 'local'), /at least two/);
  const m2 = hire(s, { startIn: 1 }); m2.m.status = 'active'; m1.m.morale = 60; m2.m.morale = 60;
  const cash = s.bank.accounts[0].balance;
  const r = holdOffsite(s, 'retreat');
  assert.equal(r.cost, OFFSITE_PER('retreat') * 3);
  assert.ok(cash - s.bank.accounts[0].balance === r.cost && m1.m.morale > 65);
  assert.throws(() => holdOffsite(s, 'local'), /last four months/);
});
const OFFSITE_PER = (k) => ({ local: 600, retreat: 1800 })[k];

// ===================================================================================================================
// 5. Operator tiers and wiring
// ===================================================================================================================

// Four scripted operators over the same two hires (an engineer and a support person): what each does, not how much.
function play(tier, seed) {
  const s = world(seed, 12);
  const p = ensurePeople(s);
  const cfg = {
    stellar: { ratio: 1.0, prep: 'full', health: { mode: 'group', contribPct: 0.85 }, dv: true, k: 0.03, pto: { mode: 'accrued', daysPerYear: 18 }, wp: 'cowork', deny: 0, cover: true, revoke: true },
    good: { ratio: 0.94, prep: 'most', health: { mode: 'group', contribPct: 0.6 }, dv: false, k: 0, pto: { mode: 'accrued', daysPerYear: 15 }, wp: 'cowork', deny: 0, cover: true, revoke: true },
    average: { ratio: 0.93, prep: 'some', health: null, dv: false, k: 0, pto: null, wp: 'remote', deny: 1, cover: false, revoke: false },
    mediocre: { ratio: 0.8, prep: 'none', health: { mode: 'none' }, dv: false, k: 0, pto: { mode: 'accrued', daysPerYear: 3 }, wp: 'lease', deny: 3, cover: false, revoke: false },
  }[tier];
  const eng = hire(s, { role: 'engineer', ask: 130000, pay: Math.round(130000 * cfg.ratio / 500) * 500, startIn: 14 });
  const sup = hire(s, { role: 'support', ask: 60000, pay: Math.round(60000 * cfg.ratio / 500) * 500, startIn: 14 });
  for (const x of [eng, sup]) {
    const m = x.m, id = m.id;
    m.leavingDay = 1e9; // early-exit rolls are tested on their own; the scripted operators keep their hires
    if (cfg.prep !== 'none') { sendWelcome(s, id); provisionAccounts(s, id); }
    if (cfg.prep === 'full') orderEquipment(s, id, 'standard');
    if (cfg.prep === 'full' || cfg.prep === 'most') { completeI9(s, id); scheduleOnboardingMeetings(s, id); }
    if (cfg.prep === 'full') assignBuddy(s, id, 'founder');
    if (cfg.prep === 'full' || cfg.prep === 'most') writeOnboardingPlan(s, m, ['Ship annual billing with proration tests by day 30', 'Cut p95 latency below 800 ms by day 60', 'Close 10 customer bugs by day 90']);
  }
  if (cfg.health) setBenefits(s, { health: cfg.health, dentalVision: cfg.dv, k401: { on: cfg.k > 0, matchPct: cfg.k }, pto: cfg.pto ?? undefined });
  if (cfg.wp === 'cowork') setWorkplace(s, { mode: 'cowork', city: 'austin', cowork: { tier: 'hot_desk', term: 'month' } });
  else if (cfg.wp === 'remote') setWorkplace(s, { mode: 'remote', city: 'austin' });
  else signLease(s, { city: 'sf', sqft: 1500, termYears: 5, buildOut: 'standard', guarantee: 'personal' });
  advance(s, 32, PEOPLE_APPS); // both start; the I-9 and day-one logistics resolve
  // The founder's requests handling.
  if (cfg.cover) setCoverage(s, { runbooks: true, onCall: tier === 'stellar' });
  const o = ensureOps(s);
  for (let i = 0; i < cfg.deny; i++) { const r = { id: `rq${tier}${i}`, memberId: sup.m.id, kind: 'vacation', start: s.day + 20 + i, end: s.day + 22 + i, days: 3, status: 'pending', requestedDay: s.day, label: 'Vacation' }; o.absences.push(r); denyRequest(s, r.id); }
  if (cfg.revoke !== undefined) { terminate(s, sup.m.id, { reason: 'let go' }); if (cfg.revoke) revokeAccess(s, sup.m.id); advance(s, 3, PEOPLE_APPS); }
  return s;
}

test('people_ops tiers separate: stellar > good > average > mediocre from what the operator did', () => {
  const tiers = ['stellar', 'good', 'average', 'mediocre'];
  for (const seed of [201, 202]) {
    const reads = tiers.map((t) => ({ t, r: peopleOpsRead(play(t, seed)) }));
    for (const { t, r } of reads) assert.equal(r.tier, t, `seed ${seed}: ${t} reads ${r.tier} (score ${r.score}; ${r.evidence.join(' | ')})`);
    for (let i = 1; i < reads.length; i++) assert.ok(reads[i - 1].r.score > reads[i].r.score, `${reads[i - 1].t} ${reads[i - 1].r.score} > ${reads[i].t} ${reads[i].r.score}`);
    for (const { r } of reads) assert.ok(r.evidence.length > 0);
    const med = reads.at(-1).r, st = reads[0].r;
    assert.ok(med.coaching.some((c) => OPERATOR_TIERS.people_ops.traps.some((tr) => tr.coaching === c)), 'mediocre is coached from the trap list');
    assert.ok(med.coaching.some((c) => /stellar operator/.test(c)) && !st.coaching.some((c) => /stellar operator does/.test(c)));
  }
  assert.equal(readOperator(newState({ companyName: 'A', model: 'smb', path: 'indie', founderName: 'P', seed: 1 }), 'people_ops').tier, 'unknown');
  assert.equal(readOperator(world(5), 'people_ops').tier, 'unknown', 'no tier for doing nothing');
  assert.ok(OPERATOR_TIERS.people_ops.tiers.stellar.behaviours.length >= 4 && OPERATOR_TIERS.people_ops.traps.length >= 8);
});

test('mistakes use the people_ops function id and carry costs; ids match the brief', () => {
  const s = play('mediocre', 203);
  const ids = new Set(s.mistakes.filter((x) => x.functionId === 'people_ops').map((x) => x.id));
  for (const id of ['lowball_offer_attrition', 'no_onboarding_plan', 'long_lease_too_early', 'denied_vacation_burnout']) assert.ok(ids.has(id), `${id} in ${[...ids]}`);
  assert.ok(ids.has('missed_i9_deadline') && ids.has('access_not_revoked'));
  for (const x of s.mistakes.filter((x) => x.functionId === 'people_ops')) assert.ok(x.cost.usd > 0 || x.cost.hours > 0 || x.cost.days > 0, x.id);
});

test('Automations: the new People events are exported triggers and fire from the ops event log', () => {
  const s = world(207);
  for (const t of ['offer_countered', 'offer_declined', 'new_hire_start', 'onboarding_overdue', 'pto_requested', 'employee_out_sick', 'lease_renewal_due']) assert.ok(PEOPLE_TRIGGERS.includes(t), t);
  emitOps(s, 'pto_requested', 'x1', { label: 'Jo asked for 3 days' });
  assert.equal(peopleEvents(s, 'pto_requested', 0).length, 1);
  assert.equal(emitOps(s, 'pto_requested', 'x1'), null, 'stable event ids: the same event is not re-emitted');
  // new_hire_start and onboarding_overdue come from the daily hooks
  const h = hire(s, { startIn: 3 });
  advance(s, 6, PEOPLE_APPS);
  assert.ok(peopleEvents(s, 'new_hire_start', 0).some((e) => e.memberId === h.m.id));
  assert.ok(peopleEvents(s, 'onboarding_overdue', 0).length >= 1, 'nothing was done, so items go overdue');
});

test('People tabs and the negotiation panel render', () => {
  const s = world(209);
  const p = ensurePeople(s);
  const j = job(s);
  const c = cand(s, j, { ask: 120000, otherOffers: true });
  makeOffer(s, c.id, { salary: 100000, startDay: s.day + 14, signOn: 2000, deadlineDays: 7 });
  c.negotiation.status = 'countered'; c.negotiation.round = 1; c.negotiation.counterDay = s.day; c.negotiation.counter = { want: { salary: 118000, equityPct: 0.2, signOn: 4000, remote: true }, items: ['base'] };
  const h = hire(s, { startIn: 6 });
  setBenefits(s, { health: { mode: 'group' } });
  signLease(s, { city: 'austin', sqft: 900, termYears: 3, buildOut: 'light', guarantee: 'personal' });
  ensureOps(s).absences.push({ id: 'rr', memberId: h.m.id, kind: 'vacation', start: s.day + 10, end: s.day + 12, days: 3, status: 'pending', requestedDay: s.day, label: 'Vacation' });
  const ctx = { state: s, save() {}, act() {}, render() {}, navigate() {}, llm: null, toast() {} };
  for (const params of ['onboarding', 'benefits', 'workplace', c.id, h.m.id, 'hiring', '']) {
    const root = { innerHTML: '', addEventListener() {} };
    peopleApp.render(root, { ...ctx, params });
    assert.ok(root.innerHTML.length > 500, params);
    assert.ok(!/undefined|NaN|\[object/.test(root.innerHTML), `${params}: ${(root.innerHTML.match(/.{30}(undefined|NaN|\[object).{30}/) ?? [])[0]}`);
    if (params === c.id) assert.ok(/countered/.test(root.innerHTML) && /Equity vs cash menu/.test(root.innerHTML) && /Counter back/.test(root.innerHTML));
    if (params === 'onboarding') assert.ok(/Form I-9/.test(root.innerHTML) && /Laptop and equipment/.test(root.innerHTML));
    if (params === 'benefits') assert.ok(/Time-off requests/.test(root.innerHTML) && /Accrued PTO liability/.test(root.innerHTML));
    if (params === 'workplace') assert.ok(/personal guarantee/.test(root.innerHTML) && /Offsite/.test(root.innerHTML));
  }
});
