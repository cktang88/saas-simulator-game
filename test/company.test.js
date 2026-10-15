import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureCalendar } from '../public/core/calendar.js';
import * as llm from '../public/core/llm.js';
import { APPS } from '../public/apps/registry.js';
import { dayOfMonth, isLastDayOfMonth } from '../public/core/util.js';

import { devHoursPerWeek, aiCodingMultiplier, supportCapacity, optionGrants, contractorPayments, computeAiCodingMultiplier, supportBacklog, firstResponseHours } from '../public/apps/people/capacity.js';
import { payPeriod, payrollLines, monthlyCostOf, vendorBills, severanceCost } from '../public/apps/people/payroll.js';
import { employerAnnual, burdenRate, AI_AGENTS } from '../public/apps/people/catalog.js';
import { acceptProbability, heuristicPostJudge, rampFactor } from '../public/apps/people/hiring.js';
import { gradeQuestion, interviewExecution, interviewEvidence, estimate, fallbackAnswer } from '../public/apps/people/interview.js';
import { sampleTraits, makeCandidate, roleComposite, isTalkerDoer } from '../public/apps/people/candidates.js';
import { AGENCY, recordOwnership, guaranteeRefund, conversionFee } from '../public/apps/people/sourcing.js';
import { productivityFor, outputFor } from '../public/apps/people/performance.js';
import { interviewTurn } from '../public/apps/people/llm.js';
import { memberOutput, salesCapacity, supportQuality, teamBugRateMult } from '../public/apps/people/capacity.js';
import { z as zOf } from '../public/data/roles.js';
import { supportWeek, aiResolveRate, frtChurnMult, weeklyTickets } from '../public/apps/people/support.js';
import {
  ensurePeople, createJob, applyJudge, openJob, screenCandidate, scheduleInterview, startInterview, finishInterview, makeOffer,
  setupPayroll, hireAgent, cancelAgent, misclassRisk, get409A, createPool, terminate, misclassAssessment, fullyDilutedShares, peopleMonthEnd,
  assessCandidate, disputeFee,
} from '../public/apps/people/sim.js';
import { replyCandidate } from '../public/apps/people/llm.js';
import { franchiseAuthorizedShares, franchiseAPVC, delawareLate, buildCalendar, dayFor, late1099 } from '../public/apps/legal/deadlines.js';
import { scoreRedlines, heuristicRedlineFeedback } from '../public/apps/legal/redlines.js';
import {
  ensureLegal, incorporate, signFounderDocs, file83b, payFranchiseTax, amendFranchiseTax, startSoc2, payFiling, trademarkFee, setupDpa, resolveRedline, legalIssues, convertToCcorp,
} from '../public/apps/legal/sim.js';
import { filingPaid, seedLegalFees } from '../public/apps/legal/api.js';

const PEOPLE_APPS = APPS.filter((a) => ['people', 'legal'].includes(a.id));

function fresh({ model = 'smb', path = 'indie', seed = 7 } = {}) {
  const s = newState({ companyName: 'Acme', model, path, founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
}

const member = (o) => ({ id: `m${Math.random()}`, name: 'X', role: 'engineer', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: 0, hoursPerWeek: 40, salary: 120000, equityPct: 0, productivity: 1, morale: 70, ...o });

function incorporateCcorp(s) {
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  advance(s, 3, PEOPLE_APPS);
  assert.equal(s.company.incorporated, true);
  assert.equal(s.company.entity, 'ccorp');
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

test('pay dates are the 15th and the last day of the month', () => {
  const s = fresh();
  const days = [];
  for (let d = 0; d < 62; d++) if (payPeriod(s, d)) days.push(d);
  for (const d of days) assert.ok(dayOfMonth(s, d) === 15 || isLastDayOfMonth(s, d));
  assert.equal(days.length, 4); // Nov 15, Nov 30, Dec 15, Dec 31
  assert.deepEqual(payPeriod(s, days[0]), { start: days[0] - 14, end: days[0] });
});

test('US payroll: gross = salary/24, employer burden posted as payroll_tax; prorated for a mid-period start', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const day15 = [...Array(40).keys()].find((d) => dayOfMonth(s, d) === 15);
  const period = payPeriod(s, day15);
  const full = payrollLines(s, [member({ startDay: -30 })], period)[0];
  assert.equal(full.gross, 5000);
  // Bottom-up burden: FICA 7.65% + $420 FUTA/SUTA + $8.5k health (indie standard) = $18,100/yr → $754.17 per run.
  assert.equal(full.employer, Math.round(employerAnnual(s, 120000) / 24 * 100) / 100);
  assert.equal(full.employer, 754.17);
  const half = payrollLines(s, [member({ startDay: period.start + 7 })], period)[0];
  assert.ok(half.gross > 2600 && half.gross < 2700, `prorated ${half.gross}`);
  p.members.push(member({ startDay: -30 }));
  p.payrollSetup.gusto = true;
  advance(s, day15, PEOPLE_APPS);
  const pay = s.bank.txns.filter((t) => t.category === 'payroll');
  const tax = s.bank.txns.filter((t) => t.category === 'payroll_tax');
  assert.equal(pay.length, 1);
  assert.equal(pay[0].amount, -5000);
  assert.equal(tax[0].amount, -754.17);
  assert.ok(s.recurring.some((r) => r.vendor === 'Gusto' && r.active && r.amount === 55)); // $49 + $6
});

test('EOR adds statutory load + Deel fee; contractors are paid monthly and tracked for 1099s', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const eor = member({ engagement: 'eor', region: 'latam', salary: 80000 });
  const con = member({ engagement: 'contractor', kind: 'contractor', region: 'us', hourlyRate: 100, hoursPerWeek: 10, salary: null, startDay: -30 });
  p.members.push(eor, con);
  assert.equal(monthlyCostOf(s, eor), Math.round(((80000 / 12) * 1.45 + 599) * 100) / 100);
  const b = vendorBills(p.members);
  assert.equal(b.deel, 599);
  assert.equal(b.gusto, 35 + 6); // contractor-only plan for the US contractor
  advance(s, 29, PEOPLE_APPS); // Nov 30 (last day)
  const conPay = s.bank.txns.filter((t) => t.category === 'contractors');
  assert.equal(conPay.length, 1);
  assert.ok(Math.abs(conPay[0].amount + 100 * 10 * (30 / 7)) < 1);
  assert.ok(contractorPayments(s, 2026)[0].amount > 4000);
  assert.ok(severanceCost(member({ salary: 104000 }), 4) > 8000);
});

// ---------------------------------------------------------------------------
// Capacity API
// ---------------------------------------------------------------------------

test('capacity: dev hours from engineers with ramp; AI coding multiplier from seats; option grants', () => {
  const s = fresh();
  const p = ensurePeople(s);
  // The default stack's Claude Max is the founder's seat.
  assert.ok(aiCodingMultiplier(s) > 1.5, `multiplier ${aiCodingMultiplier(s)}`);
  p.members.push(member({ startDay: 0, rampWeeks: 8 }));
  const early = devHoursPerWeek(s);
  s.day = 100;
  const later = devHoursPerWeek(s);
  assert.ok(early > 5 && later > early && later <= 42, `${early} → ${later}`);
  assert.equal(rampFactor(p.members.at(-1), 0), 0.25);
  // A second engineer without a seat dilutes per-person AI boost.
  const one = computeAiCodingMultiplier(s);
  p.members.push(member({ startDay: 0 }));
  assert.ok(computeAiCodingMultiplier(s) < one);
  hireAgent(s, 'code_max');
  assert.ok(computeAiCodingMultiplier(s) >= one - 0.01);
  p.members.push(member({ name: 'Eng', equityPct: 1, grant: { vestStart: 0, cliffDay: 365, vestYears: 4, strike: 0.01, status: 'granted' } }));
  assert.deepEqual(optionGrants(s).map((g) => [g.name, g.pct]), [['Eng', 1]]);
});

test('support capacity counts staff and the AI agent', () => {
  const s = fresh();
  const p = ensurePeople(s);
  assert.equal(supportCapacity(s), 0);
  p.members.push(member({ role: 'support', salary: 50000, startDay: -100 }));
  const staff = supportCapacity(s);
  assert.ok(staff > 100, `staff ${staff}`); // 32h × 60 / 15 min ≈ 128 tickets
  hireAgent(s, 'support_ai');
  p.support.lastWeek = { total: 100 };
  s.apps.support = { tickets: [{ status: 'open' }, { status: 'closed' }] };
  assert.equal(supportBacklog(s), 1); // reads the Helpdesk slice when it exists
  delete s.apps.support;
  s.day += 8;
  assert.ok(supportCapacity(s) > staff);
});

// ---------------------------------------------------------------------------
// Support load
// ---------------------------------------------------------------------------

test('support week: AI resolves 30–70%, founder capped, slow first response raises churn', () => {
  const noHelp = supportWeek({ model: 'smb', newTickets: 100, founderCapHours: 5 });
  assert.equal(noHelp.founderHours, 5);
  assert.ok(noHelp.unhandled > 70 && noHelp.firstResponseHours > 72 && noHelp.churnMult >= 1.4);
  const ai = supportWeek({ model: 'smb', newTickets: 100, ai: { active: true, docsQuality: 1 }, founderCapHours: 5 });
  assert.ok(ai.aiResolved > 45 && ai.unhandled < noHelp.unhandled);
  assert.ok(ai.oversightHours >= 1 && ai.oversightHours <= 3);
  const fast = supportWeek({ model: 'smb', newTickets: 10, ai: { active: true, docsQuality: 1, monthsLive: 24 }, staffCapacity: 100 });
  assert.equal(fast.unhandled, 0);
  assert.ok(fast.churnMult < 1, `fast support lowers churn: ${fast.churnMult}`);
  assert.equal(frtChurnMult(0.5), 0.95);
  assert.equal(frtChurnMult(100), 1.4);
  assert.equal(aiResolveRate(0, 0), 0.3);
  assert.equal(aiResolveRate(1, 0), 0.55);
  assert.equal(aiResolveRate(1, 24), 0.65); // capped at the SMB tier-1 share
  assert.ok(aiResolveRate(1, 24, 'b2c') === 0.7);
  // Calibrated volume: SMB ~0.43 tickets/customer/month, ×2.5 in month one; good docs cut ~30%.
  const v = weeklyTickets('smb', 100);
  assert.ok(v > 8 && v < 12, `smb weekly ${v}`);
  assert.ok(weeklyTickets('smb', 100, 0, { newCustomers: 100 }) > v * 2);
  assert.ok(weeklyTickets('smb', 100, 0, { docsQuality: 1 }) < v * 0.75);
});

test('weekly support load charges founder hours on Mondays (never past the weekly budget) and sets the churn modifier', () => {
  const s = fresh();
  for (let i = 0; i < 400; i++) {
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, country: 'US' });
    subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 });
  }
  advance(s, 7, PEOPLE_APPS); // next Monday
  const w = s.apps.people.support.lastWeek;
  assert.ok(w.total > 60, `tickets ${w.total}`); // 400 new SMB customers × ~0.43/mo × 2.5 first month
  assert.ok(firstResponseHours(s) > 0);
  assert.ok(supportBacklog(s) >= 0);
  assert.ok(s.founder.hoursUsed <= s.founder.hoursPerWeek);
  // Core wellbeing may already have eaten part of the week; support only charges what is left, never above the budget.
  const charged = (s.founder.timeLog ?? []).filter((t) => t.day === s.day && /Support/.test(t.label)).reduce((a, t) => a + t.hours, 0);
  assert.ok(charged > 0 || s.founder.hoursUsed >= s.founder.hoursPerWeek - 1e-9);
  assert.ok(Math.abs(charged - Math.min(w.founderHours + w.oversightHours, w.founderCharged)) < 1e-6);
  assert.ok(s.market.modifiers.churn['support-backlog'] > 1);
});

// ---------------------------------------------------------------------------
// Hiring
// ---------------------------------------------------------------------------

test('employer burden is regressive: FICA wage base + fixed health cost', () => {
  const s = fresh({ path: 'vc' });
  assert.ok(burdenRate(s, 55000) > burdenRate(s, 170000));
  assert.ok(burdenRate(s, 170000) > 1.12 && burdenRate(s, 170000) < 1.25);
  // Above the $184,500 Social Security wage base only 1.45% Medicare applies.
  const d = employerAnnual(s, 210000) - employerAnnual(s, 200000);
  assert.ok(Math.abs(d - (0.0145 * 10000 + 0.02 * 10000)) < 1e-6);
});

test('offer acceptance is ~80% at expectation (Ashby/Gem), ~50% at 10% below', () => {
  const ctx = { path: 'indie', incorporated: true, entity: 'llc', runwayMonths: 18, raised: false, hireIndex: 0 };
  const med = { engagement: 'employee', role: 'engineer', expectation: 150000, quality: 0.5, interest: 0.5, persona: { otherOffers: false } };
  const pAt = acceptProbability(med, { salary: 150000, equityPct: 0 }, ctx);
  const pLow = acceptProbability(med, { salary: 135000, equityPct: 0 }, ctx);
  assert.ok(pAt > 0.75 && pAt < 0.86, `at expectation ${pAt}`);
  assert.ok(pLow > 0.42 && pLow < 0.6, `10% below ${pLow}`);
  const top = { ...med, quality: 0.85, persona: { otherOffers: true } };
  const pTop = acceptProbability(top, { salary: 150000, equityPct: 0 }, ctx);
  assert.ok(pTop > 0.65 && pTop < pAt, `top with other offers ${pTop}`);
});

test('offer acceptance rises with pay and equity and falls when unincorporated or low on runway', () => {
  const cand = { engagement: 'employee', role: 'engineer', expectation: 170000, quality: 0.6, interest: 0.5, persona: { otherOffers: false } };
  const base = { path: 'vc', incorporated: true, entity: 'ccorp', runwayMonths: 18, raised: false, hireIndex: 0 };
  const lo = acceptProbability(cand, { salary: 150000, equityPct: 0 }, base);
  const mid = acceptProbability(cand, { salary: 170000, equityPct: 0 }, base);
  const hi = acceptProbability(cand, { salary: 185000, equityPct: 1 }, base);
  assert.ok(lo < mid && mid < hi, `${lo} ${mid} ${hi}`);
  assert.ok(acceptProbability(cand, { salary: 170000, equityPct: 0 }, { ...base, incorporated: false, entity: 'none' }) < mid);
  assert.ok(acceptProbability(cand, { salary: 170000, equityPct: 0 }, { ...base, runwayMonths: 3 }) < mid);
});

test('job post heuristic rewards specificity and pay ranges; interview signal rewards behavioral questions', () => {
  const bad = heuristicPostJudge({ role: 'engineer', text: 'Rockstar ninja wanted! Fast-paced family. Must be passionate.' });
  const good = heuristicPostJudge({ role: 'engineer', payLo: 150000, payHi: 180000, text: `We're a 2-person bootstrapped SaaS at $18k MRR serving 140 dental clinics. You will own our scheduling sync and billing integrations, build with Postgres and TypeScript, and ship weekly. In your first 30 days you'll ship the Stripe dunning rework; by month 3 you'll own on-call. You have 5+ years shipping production SaaS. Salary range $150k–$180k + 1% options. Interview process: 30-min call, paid take-home (4h), founder chat.` });
  assert.ok(good.clarity > bad.clarity && good.specificity > bad.specificity);
  assert.ok(bad.issues.length > good.issues.length);
  const weak = ['Are you a team player?', 'Do you like startups?', 'What is your biggest weakness?'].map((q) => gradeQuestion(q, 'engineer'));
  const strongQs = ['Walk me through the last system you shipped end to end.', 'What exactly did you do yourself?', 'Tell me about a time a launch went wrong. What did you do?', 'What was the result, in numbers?', 'How would you approach designing our sync if the spec is half-written?', 'How did you know it worked?'];
  const strong = []; for (const q of strongQs) strong.push(gradeQuestion(q, 'engineer', strong.at(-1)));
  assert.ok(interviewExecution(strong, { scorecard: true }).validity > interviewExecution(weak).validity + 0.15);
});

test('end to end: incorporate, payroll setup, post a job, interview on the calendar, offer, start, payroll', async () => {
  const s = fresh({ path: 'vc' });
  incorporateCcorp(s);
  assert.throws(() => setupPayroll(s, 'gusto'), /EIN/);
  advance(s, 7, PEOPLE_APPS);
  assert.equal(ensureLegal(s).ein.status, 'done');
  setupPayroll(s, 'gusto');
  ensureLegal(s).docs.ciiaa = true;
  const job = createJob(s, { role: 'engineer', title: 'Founding engineer', region: 'us', engagement: 'employee', payLo: 160000, payHi: 190000, text: 'x'.repeat(10) });
  applyJudge(job, { firstImpression: '', clarity: 8, specificity: 8, payTransparency: true, issues: [], rewriteHint: '' });
  openJob(s, job.id, ['linkedin_jobs', 'wellfound', 'employee_referral']);
  assert.ok(s.bank.txns.length > 0);
  for (let i = 0; i < 40 && !s.apps.people.candidates.length; i++) advance(s, 1, PEOPLE_APPS);
  const c = s.apps.people.candidates[0];
  assert.ok(c, 'candidates arrive');
  assert.ok(job.applications > job.shortlisted);
  screenCandidate(s, c.id, true);
  const day = s.day + 1;
  scheduleInterview(s, c.id, { day, start: 10 * 60 });
  assert.ok(ensureCalendar(s).events.some((e) => e.refId === c.id && e.kind === 'interview'));
  advance(s, day - s.day, PEOPLE_APPS);
  startInterview(s, c.id);
  for (const q of ['Walk me through the last thing you shipped end to end.', 'What exactly did you do yourself?', 'What was the result, in numbers?']) await interviewTurn({ state: s, llm }, c.id, q);
  assert.equal(c.interview.messages.filter((m) => m.from === 'them').length, 3);
  finishInterview(s, c.id);
  assert.equal(c.stage, 'interviewed');
  assert.ok(estimate(c.evidence, 'composite').sd < 0.95);
  assert.throws(() => makeOffer(s, c.id, { salary: 180000, equityPct: 1, startDay: s.day + 14 }), /pool/);
  createPool(s, 10);
  get409A(s);
  const o = makeOffer(s, c.id, { salary: c.expectation * 1.1, equityPct: 1, startDay: s.day + 14 });
  assert.ok(o.p > 0 && o.p < 1);
  c.offer.p = 1; c.persona.otherOffers = false; c.offerSentiment = 0.5; // force a deterministic acceptance for the rest of the test
  advance(s, 6, PEOPLE_APPS);
  assert.equal(c.stage, 'hired');
  const m = s.apps.people.members.find((x) => x.candidateId === c.id);
  assert.equal(m.status, 'offer');
  assert.equal(m.grant.status, 'granted');
  // The candidate replies to a follow-up email in character (offline fallback).
  const thread = s.mail.threads.find((t) => t.refId === c.id);
  await replyCandidate({ state: s, llm }, { threadId: thread.id, refId: c.id });
  assert.equal(thread.messages.at(-1).from, 'them');
  advance(s, 45, PEOPLE_APPS);
  assert.equal(m.status, 'active');
  assert.ok(s.bank.txns.some((t) => t.category === 'payroll' && t.counterparty === 'Gusto'));
  assert.ok(devHoursPerWeek(s) > 0);
  const sev = terminate(s, m.id, { severanceWeeks: 4 });
  assert.ok(sev > 10000);
});

test('AI agents: per-resolution support billing with a 50-resolution minimum; annual AI SDR contracts owe the remainder', () => {
  const s = fresh();
  hireAgent(s, 'support_ai');
  advance(s, 29, PEOPLE_APPS); // month end
  const fin = s.bank.txns.find((t) => t.counterparty === 'Intercom');
  assert.equal(fin.amount, -49.5); // 50 × $0.99 minimum
  const sdr = hireAgent(s, 'sdr_11x');
  const fee = cancelAgent(s, sdr.id);
  assert.equal(fee, 12 * 4000);
});

test('misclassification risk flags full-time, ongoing, US contractors', () => {
  const m = member({ engagement: 'contractor', kind: 'contractor', hoursPerWeek: 40, region: 'us', startDay: 0 });
  assert.equal(misclassRisk(m, 200).level, 'high');
  assert.equal(misclassRisk({ ...m, cor: true }, 200).score, 0);
  assert.equal(misclassRisk({ ...m, hoursPerWeek: 10, role: 'designer', region: 'eeu' }, 30).level, 'low');
  // Hazard while active is ~1%/yr per risk factor: a high-risk contractor over 3 years rarely gets caught mid-engagement.
  let caught = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = fresh({ seed });
    const c = member({ engagement: 'contractor', kind: 'contractor', hoursPerWeek: 40, region: 'us', startDay: -400, hourlyRate: 80, salary: null, paidByYear: { 2026: 50000 } });
    ensurePeople(s).members.push(c);
    for (let mth = 0; mth < 36; mth++) peopleMonthEnd(s);
    if (c.misclassified) caught++;
  }
  assert.ok(caught / 200 < 0.2, `caught ${caught}/200 over 3 years`);
  // The assessment: back FICA + withholding + 20% penalty.
  const s = fresh();
  const c = member({ engagement: 'contractor', kind: 'contractor', region: 'us', paidByYear: { 2026: 100000 }, salary: null });
  assert.equal(misclassAssessment(s, c), Math.round(100000 * 0.0915 * 1.2 * 100) / 100);
});

test('option pool is reserved via the shared optionPool field; 409A prices on fully diluted shares', () => {
  const s = fresh({ path: 'vc' });
  incorporateCcorp(s);
  signFounderDocs(s, {});
  createPool(s, 10);
  assert.deepEqual(s.apps.people.optionPool, { reservedPct: 10, day: s.day });
  assert.equal(fullyDilutedShares(s), Math.round(10_000_000 / 0.9));
  const v = get409A(s);
  assert.ok(Math.abs(v.fmv - Math.round((50000 / fullyDilutedShares(s)) * 10000) / 10000) < 1e-9 || v.fmv > 0);
});

test('SOC 2 internal effort: 8h/week for Type I plus a 20h sprint; seed legal fees helper', () => {
  const s = fresh({ model: 'ent' });
  startSoc2(s, 'type1');
  advance(s, 7, PEOPLE_APPS);
  const log = s.founder.timeLog.filter((t) => /SOC 2/.test(t.label));
  assert.ok(log.length && log[0].hours >= 8 && log[0].hours <= 18 + 1e-9, JSON.stringify(log));
  assert.deepEqual(seedLegalFees(0), { company: 12000, investorCounselCap: 15000, total: 27000 });
  assert.equal(seedLegalFees(2).company, 20000);
});

// ---------------------------------------------------------------------------
// Legal
// ---------------------------------------------------------------------------

test('Delaware franchise tax: authorized-shares trap vs assumed par value capital; late penalty', () => {
  assert.equal(franchiseAuthorizedShares(10_000_000), 85165);
  assert.equal(franchiseAuthorizedShares(5000), 175);
  assert.equal(franchiseAPVC({ grossAssets: 50000, issuedShares: 8_000_000, authorized: 10_000_000 }), 400);
  assert.equal(franchiseAPVC({ grossAssets: 5_000_000, issuedShares: 8_000_000, authorized: 10_000_000 }), 2800);
  assert.equal(delawareLate(400, 0), 0);
  assert.equal(delawareLate(400, 45), 200 + 400 * 0.015 * 2);
  assert.equal(late1099(2, 10), 120);
});

test('incorporation via Atlas, founder stock, and the 83(b) deadline', () => {
  const s = fresh({ path: 'vc' });
  const before = s.bank.txns.length;
  incorporateCcorp(s);
  assert.ok(s.bank.txns.slice(before).some((t) => t.amount === -500 && t.category === 'legal'));
  signFounderDocs(s, {});
  const fs = ensureLegal(s).founderStock;
  assert.equal(fs.price, 100); // 10M shares at $0.00001 par
  assert.ok(buildCalendar(s).some((i) => i.key === '83b'));
  advance(s, 31, PEOPLE_APPS);
  assert.equal(fs.missed, true);
  assert.throws(() => file83b(s, 'online'), /30-day/);
  assert.ok(legalIssues(s).some((x) => /83\(b\)/.test(x)));
  // A second company files in time.
  const t = fresh({ path: 'vc', seed: 9 });
  incorporateCcorp(t);
  signFounderDocs(t, {});
  advance(t, 10, PEOPLE_APPS);
  file83b(t, 'service');
  assert.equal(ensureLegal(t).founderStock.filed83b, true);
});

test('compliance calendar: Delaware franchise tax due 2027-03-01; Books payment prevents double charging; APVC filing checks your numbers', () => {
  const s = fresh({ path: 'vc' });
  incorporateCcorp(s);
  signFounderDocs(s, {});
  const item = buildCalendar(s).find((i) => i.key === 'de-franchise-2027');
  assert.ok(item);
  assert.equal(item.dueDay, dayFor(s, '2027-03-01'));
  s.apps.books = { paidFilings: { 'de-franchise-2027': { day: 1 } } };
  assert.ok(filingPaid(s, 'de-franchise-2027'));
  assert.equal(buildCalendar(s).find((i) => i.key === 'de-franchise-2027').status, 'done');
  delete s.apps.books;
  advance(s, dayFor(s, '2027-01-05') - s.day, PEOPLE_APPS);
  assert.throws(() => payFranchiseTax(s, 'de-franchise-2027', { method: 'apvc', grossAssets: 1, issuedShares: 10_000_000 }), /Gross assets/);
  const snap = [...s.metrics.daily].reverse().find((x) => x.day <= dayFor(s, '2026-12-31'));
  const paid = payFranchiseTax(s, 'de-franchise-2027', { method: 'apvc', grossAssets: snap.cash + snap.stripeBalance, issuedShares: 10_000_000 });
  assert.equal(paid.amount, 450);
  assert.ok(s.apps.legal.paidFilings['de-franchise-2027']);
});

test('Delaware franchise tax: paying the Authorized Shares notice is a logged mistake; amending to APVC refunds the overpayment later', () => {
  const s = fresh({ path: 'vc' });
  incorporateCcorp(s);
  signFounderDocs(s, {});
  advance(s, dayFor(s, '2027-01-05') - s.day, PEOPLE_APPS);
  const paid = payFranchiseTax(s, 'de-franchise-2027', { method: 'billed' });
  assert.equal(paid.tax, franchiseAuthorizedShares(12_000_000)); // $102,165
  assert.ok(s.mistakes.some((m) => m.id === 'franchise_authorized_shares'));
  const snap = [...s.metrics.daily].reverse().find((x) => x.day <= dayFor(s, '2026-12-31'));
  assert.throws(() => amendFranchiseTax(s, 'de-franchise-2027', { grossAssets: 1, issuedShares: 10_000_000 }), /Gross assets/);
  const a = amendFranchiseTax(s, 'de-franchise-2027', { grossAssets: snap.cash + snap.stripeBalance, issuedShares: 10_000_000 });
  assert.equal(a.refund, paid.tax - 400);
  assert.throws(() => amendFranchiseTax(s, 'de-franchise-2027', { grossAssets: snap.cash + snap.stripeBalance, issuedShares: 10_000_000 }), /Already/);
  const t = s.bank.txns.length;
  advance(s, a.refundDay - s.day + 1, PEOPLE_APPS);
  assert.ok(s.bank.txns.slice(t).some((x) => x.amount === a.refund && x.category === 'taxes'));
  assert.equal(a.received, true);
});

test('1099-NEC deadline appears for US contractors paid ≥ $2,000 in 2026', () => {
  const s = fresh();
  ensurePeople(s).members.push(member({ engagement: 'contractor', kind: 'contractor', region: 'us', hourlyRate: 100, hoursPerWeek: 20, salary: null, name: 'Dana' }));
  advance(s, 60, PEOPLE_APPS);
  const it = buildCalendar(s).find((i) => i.key === '1099-2027');
  assert.ok(it, 'calendar has 1099s');
  assert.equal(it.dueDay, dayFor(s, '2027-01-31'));
  payFiling(s, '1099-2027');
  assert.ok(s.apps.legal.paidFilings['1099-2027']);
});

test('LLC conversion to C-corp costs money and time and restarts founder paperwork', () => {
  const s = fresh();
  incorporate(s, { provider: 'doola', operatingState: 'DE' });
  advance(s, 7, PEOPLE_APPS);
  assert.equal(s.company.entity, 'llc');
  assert.ok(legalIssues({ ...s, company: { ...s.company, path: 'vc' } }).some((x) => /LLC/.test(x)));
  convertToCcorp(s);
  advance(s, 30, PEOPLE_APPS);
  assert.equal(s.company.entity, 'ccorp');
  assert.equal(ensureLegal(s).founderStock, null);
  assert.ok(s.bank.txns.some((t) => t.amount === -3500));
});

test('trademark fees and redline scoring', () => {
  assert.equal(trademarkFee({ classes: ['009', '042'], freeform: false }), 700);
  assert.equal(trademarkFee({ classes: ['009', '042'], freeform: true, description: 'x'.repeat(1500) }), 700 + 400 + 200);
  const clauses = ['liability', 'indemnity', 'residency'];
  const sensible = scoreRedlines(clauses, { liability: 'supercap', indemnity: 'ip_only', residency: 'scc_dpf' }, 'This is market standard because our cyber insurance covers a super-cap; subprocessor list attached.', { model: 'ent' });
  const stonewall = scoreRedlines(clauses, { liability: 'reject', indemnity: 'reject', residency: 'reject' }, 'No.', { model: 'ent' });
  const caveIn = scoreRedlines(clauses, { liability: 'accept', indemnity: 'accept_broad', residency: 'accept_eu_only' }, 'ok', { model: 'ent' });
  assert.ok(sensible.dealProbability > stonewall.dealProbability);
  assert.ok(caveIn.risk > sensible.risk + 3);
  const fb = heuristicRedlineFeedback(clauses, { liability: 'supercap' }, '', {});
  assert.equal(fb.clauseFeedback.length, 3);
});

test('enterprise deals trigger redlines; resolving one signs or loses the deal; DPA flag is set', () => {
  const s = fresh({ model: 'ent' });
  incorporateCcorp(s);
  setupDpa(s, 'template');
  assert.equal(s.apps.legal.dpaReady, true);
  for (let i = 0; i < 6; i++) {
    const c = createCustomer(s, { name: `Buyer ${i}`, email: `b${i}@corp.com`, company: `Corp ${i}`, country: 'US' });
    subscribe(s, c.id, { id: 'p', price: 18000, interval: 'year', trialDays: 0 }, { invoiceManually: true });
  }
  advance(s, 1, PEOPLE_APPS);
  const open = s.apps.legal.redlines.filter((r) => r.status === 'open');
  assert.ok(open.length >= 1, 'some redlines arrive');
  const r = open[0];
  const choices = Object.fromEntries(r.clauses.map((k) => [k, { liability: 'supercap', indemnity: 'ip_only', autorenew: 'keep_notice', residency: 'eu_region' }[k]]));
  const out = resolveRedline(s, r.id, choices, 'Market standard terms because…', { dealProbability: 0.8 });
  assert.ok(['signed', 'lost'].includes(out.status));
});

test('people and legal apps survive a year of daily ticks with a team', () => {
  const s = fresh({ path: 'vc' });
  incorporateCcorp(s);
  advance(s, 7, PEOPLE_APPS);
  setupPayroll(s, 'gusto');
  setupPayroll(s, 'deel');
  const p = ensurePeople(s);
  p.members.push(member({ startDay: s.day }), member({ role: 'support', salary: 50000, startDay: s.day, engagement: 'eor', region: 'india' }));
  hireAgent(s, 'support_ai');
  advance(s, 365, APPS);
  assert.ok(s.apps.people.runs.length >= 20, `runs ${s.apps.people.runs.length} status ${s.status} day ${s.day} members ${JSON.stringify(s.apps.people.members.map((m) => [m.role, m.status, m.exitReason]))}`);
  assert.ok(s.apps.people.members.some((m) => m.role === 'support' && m.kind !== 'ai_agent'));
});

test('when the Helpdesk is active, People leaves ticket generation and hours to it', () => {
  const s = fresh();
  s.apps.support = { active: true, tickets: [] };
  for (let i = 0; i < 300; i++) {
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, country: 'US' });
    subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 });
  }
  advance(s, 7, PEOPLE_APPS);
  assert.equal(s.apps.support.tickets.filter((t) => t.source === 'people:volume').length, 0);
  assert.ok(!(s.founder.timeLog ?? []).some((t) => /Support tickets & AI/.test(t.label)));
});


// ---------------------------------------------------------------------------
// Hiring rebuild: hidden traits, graded interviews, assessments, agencies, performance
// ---------------------------------------------------------------------------

test('question grading: behavioural, probes, leading, clichés, brainteasers and illegal topics', () => {
  const b = gradeQuestion('Tell me about the hardest production bug you debugged in the last year. Walk me through it step by step.', 'engineer');
  assert.equal(b.type, 'behavioral');
  assert.ok(b.traits.includes('craft') && b.quality > 0.8);
  const pr = gradeQuestion('What exactly did you do, and what was the result?', 'engineer', b);
  assert.equal(pr.type, 'probe');
  assert.deepEqual(pr.traits.slice(0, 3), b.traits.slice(0, 3));
  assert.equal(gradeQuestion('Are you good with deadlines?', 'engineer').type, 'leading');
  assert.equal(gradeQuestion('What is your biggest weakness?', 'engineer').type, 'fluffy');
  assert.equal(gradeQuestion('How many golf balls fit in a plane?', 'engineer').type, 'brainteaser');
  for (const [q, topic] of [['How old are you?', 'age'], ['Do you have kids?', 'marital_family_status'], ['What are you making at your current job?', 'salary_history'], ['Where are you originally from?', 'national_origin_citizenship']]) {
    const g = gradeQuestion(q, 'account_executive');
    assert.equal(g.type, 'illegal', q);
    assert.equal(g.illegal.topic, topic);
  }
  // Allowed alternatives are not flagged.
  assert.notEqual(gradeQuestion('What are your salary expectations for this role?', 'engineer').type, 'illegal');
  assert.notEqual(gradeQuestion('Are you legally authorized to work in the US?', 'engineer').type, 'illegal');
});

test('candidate pools: talker-doers exist at roughly the research share; asks track craft and polish', () => {
  const s = fresh({ seed: 3 });
  let td = 0;
  const N = 600;
  for (let i = 0; i < N; i++) if (isTalkerDoer('account_executive', sampleTraits(s, 'account_executive').traits)) td++;
  assert.ok(td / N > 0.1 && td / N < 0.32, `AE talker-doer share ${td / N}`);
  const job = { id: 'j', role: 'engineer', region: 'us', engagement: 'employee', quality: 0.6 };
  const cs = Array.from({ length: 200 }, () => makeCandidate(s, job, AGENCY.contingency_recruiter, (p) => `${p}_${Math.random()}`));
  const polished = cs.filter((c) => zOf(c.traits.polish) > 1), plain = cs.filter((c) => zOf(c.traits.polish) < -1);
  const avg = (a) => a.reduce((x, c) => x + c.expectation, 0) / a.length;
  assert.ok(avg(polished) > avg(plain), 'polish raises the salary ask');
});

test('a high-polish, low-craft candidate interviews well in an unstructured chat but performs poorly', () => {
  const unstructured = ['Tell me about yourself.', 'Are you a team player?', 'What is your biggest weakness?', 'Do you like fast-paced startups?', 'Why should we hire you?', 'Where do you see yourself in five years?'];
  const structured = ['Tell me about the hardest production bug you debugged last year. Walk me through it.', 'What exactly did you do yourself?', 'What was the result, in numbers?', 'Tell me about something you shipped end to end that nobody asked you to build.', 'Which part was yours, specifically?', 'How do you use AI coding agents? Show me a time the AI was confidently wrong and how you caught it.', 'How did you know it was wrong?'];
  const grade = (qs) => { const out = []; for (const q of qs) out.push(gradeQuestion(q, 'engineer', out.at(-1))); return out; };
  const gu = grade(unstructured), gs = grade(structured);
  let errU = 0, errS = 0, inflU = 0;
  const N = 300;
  const s = fresh({ seed: 11 });
  for (let i = 0; i < N; i++) {
    const { traits } = sampleTraits(s, 'engineer', { talkerDoer: true });
    const c = { id: `c${i}`, role: 'engineer', traits };
    const truth = roleComposite('engineer', traits);
    const eu = estimate(interviewEvidence(s, c, gu).evidence, 'composite').z;
    const es = estimate(interviewEvidence(s, c, gs, { scorecard: true }).evidence, 'composite').z;
    errU += Math.abs(eu - truth); errS += Math.abs(es - truth); inflU += eu - truth;
  }
  assert.ok(inflU / N > 0.3, `unstructured reads inflate talkers: +${(inflU / N).toFixed(2)} SD`);
  assert.ok(errS < errU, `structured probing is more accurate (${(errS / N).toFixed(2)} vs ${(errU / N).toFixed(2)})`);
  // On the job they underperform a median engineer.
  const { traits } = sampleTraits(s, 'engineer', { talkerDoer: true });
  const m = { role: 'engineer', jobRole: 'engineer', traits };
  assert.ok(productivityFor(m) < 1 && outputFor(m, 'bugRateMult') > 1, `velocity ${productivityFor(m)} bugs ${outputFor(m, 'bugRateMult')}`);
  // Their offline answers sound fine at first and collapse under a third-level probe.
  const cand = { id: 'tk', role: 'engineer', traits: { ...traits, polish: 85 }, interest: 0.5, persona: { concern: 'equity upside' }, engagement: 'employee', expectation: 170000 };
  const g = gradeQuestion('Tell me about the hardest bug you debugged.', 'engineer');
  assert.match(fallbackAnswer(cand, 'q1', g, 0).reply, /structured|aligned|stakeholders/i);
  assert.match(fallbackAnswer(cand, 'q3', { ...g, type: 'probe' }, 2).reply, /team effort|wouldn.t want to take credit/i);
  const strong = { ...cand, id: 'st', traits: Object.fromEntries(Object.keys(traits).map((k) => [k, 85])) };
  assert.match(fallbackAnswer(strong, 'q1', g, 1).reply, /\d+%/);
});

test('illegal interview questions: flagged, logged as legal risk, can end the interview', async () => {
  let ended = 0, flagged = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = fresh({ seed });
    const p = ensurePeople(s);
    const job = createJob(s, { role: 'support', region: 'us', engagement: 'contractor', text: 'x' });
    const c = makeCandidate(s, job, null, (x) => `${x}_${seed}`);
    p.candidates.push(c);
    c.stage = 'screened';
    scheduleInterview(s, c.id, { day: s.day, start: 10 * 60 });
    startInterview(s, c.id);
    const r = await interviewTurn({ state: s, llm }, c.id, 'How old are you, and do you have kids?');
    if (r.grade.illegal) flagged++;
    if (r.ended) ended++;
    assert.ok(p.legalRisk.length >= 1);
  }
  assert.equal(flagged, 40);
  assert.ok(ended > 1 && ended < 20, `candidate walked ${ended}/40`);
});

test('assessments: take-home AI cheating inflates craft until a live walkthrough exposes it', () => {
  const s = fresh({ seed: 5 });
  const p = ensurePeople(s);
  const job = createJob(s, { role: 'engineer', region: 'eeu', engagement: 'contractor', text: 'x' });
  let exposed = 0, tried = 0;
  for (let i = 0; i < 80; i++) {
    const c = makeCandidate(s, job, null, (x) => `${x}_${i}`);
    c.aiCheat = true;
    c.traits.craft = 30;
    c.persona.otherOffers = false;
    c.stage = 'screened';
    p.candidates.push(c);
    const r1 = assessCandidate(s, c.id, 'takeHome');
    if (!r1.ok) continue;
    const r2 = assessCandidate(s, c.id, 'walkthrough');
    if (!r2.ok) continue;
    tried++;
    if (r2.redFlags.length) exposed++;
  }
  assert.ok(tried > 20 && exposed === tried, `${exposed}/${tried} exposed`);
});

test('agencies: placement fee on acceptance, pro-rated guarantee refund, ownership fee disputes, conversion fees', () => {
  const s = fresh({ path: 'vc' });
  incorporateCcorp(s);
  advance(s, 7, PEOPLE_APPS);
  setupPayroll(s, 'gusto');
  const p = ensurePeople(s);
  const job = createJob(s, { role: 'engineer', region: 'us', engagement: 'employee', payLo: 160000, payHi: 190000, text: 'x' });
  applyJudge(job, { firstImpression: '', clarity: 8, specificity: 8, payTransparency: true, issues: [], rewriteHint: '' });
  openJob(s, job.id, ['contingency_recruiter']);
  // A candidate the agency submitted earlier...
  const viaAgency = makeCandidate(s, job, AGENCY.contingency_recruiter, (x) => `${x}_a`);
  recordOwnership(p, viaAgency, 'contingency_recruiter', s.day);
  // ...applies directly later and you hire them → the agency claims its fee.
  const direct = { ...makeCandidate(s, job, AGENCY.wellfound, (x) => `${x}_d`), personKey: viaAgency.personKey, stage: 'interviewed', interest: 0.9 };
  p.candidates.push(direct);
  makeOffer(s, direct.id, { salary: direct.expectation * 1.2, startDay: s.day + 14 });
  direct.offerSentiment = 0.5;
  advance(s, 6, PEOPLE_APPS);
  assert.equal(direct.stage, 'hired');
  const d = p.disputes.find((x) => x.name === direct.name);
  assert.ok(d && d.amount > 20000, 'agency claims ~20% of base');
  const bal = s.bank.accounts[0].balance;
  disputeFee(s, d.id, 'pay');
  assert.ok(s.bank.accounts[0].balance < bal - 20000);
  // Placement through the agency itself: fee on acceptance and a pro-rated refund inside the 90-day guarantee.
  assert.equal(guaranteeRefund(AGENCY.contingency_recruiter, 36000, 45), 18000);
  assert.equal(guaranteeRefund(AGENCY.contingency_recruiter, 36000, 120), 0);
  assert.ok(conversionFee(AGENCY.contract_to_hire, 120000, 0) === 21000 && conversionFee(AGENCY.contract_to_hire, 120000, 640) === 0);
});

test('job boards bring floods of (partly AI-written) applications; referrals bring few, better candidates', () => {
  const s = fresh({ seed: 21 });
  const p = ensurePeople(s);
  const mk = (ch) => { const j = createJob(s, { role: 'engineer', region: 'us', engagement: 'contractor', text: 'x' }); applyJudge(j, { firstImpression: '', clarity: 7, specificity: 7, payTransparency: true, issues: [], rewriteHint: '' }); openJob(s, j.id, [ch]); return j; };
  const board = mk('we_work_remotely');
  const ref = mk('employee_referral');
  advance(s, 42, PEOPLE_APPS);
  assert.ok(board.applications > 60 && board.aiApplications > 10, `${board.applications} apps`);
  assert.ok(board.shortlisted < board.applications / 5);
  const q = (j) => { const cs = p.candidates.filter((c) => c.jobId === j.id); return cs.reduce((a, c) => a + roleComposite('engineer', c.traits), 0) / Math.max(1, cs.length); };
  assert.ok(p.candidates.some((c) => c.jobId === ref.id));
  assert.ok(q(ref) > q(board) - 0.05, `referral quality ${q(ref).toFixed(2)} vs board ${q(board).toFixed(2)}`);
});

test('on-the-job outputs: capacity API exposes per-member outputs, sales capacity and support quality', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const hi = Object.fromEntries(Object.keys(sampleTraits(s, 'engineer').traits).map((k) => [k, 80]));
  const lo = Object.fromEntries(Object.keys(hi).map((k) => [k, 25]));
  p.members.push(member({ id: 'e1', jobRole: 'engineer', traits: hi, startDay: -200 }), member({ id: 'e2', jobRole: 'engineer', traits: lo, startDay: -200 }));
  p.members.push(member({ id: 'a1', role: 'ae', jobRole: 'account_executive', traits: hi, startDay: -400, salary: 100000 }));
  p.members.push(member({ id: 's1', role: 'support', jobRole: 'support', traits: lo, startDay: -100, salary: 50000 }));
  assert.ok(memberOutput(s, 'e1', 'velocityMult') > 1.4 && memberOutput(s, 'e2', 'velocityMult') < 0.75);
  assert.ok(memberOutput(s, 'e1', 'bugRateMult') < 1 && memberOutput(s, 'e2', 'bugRateMult') > 1.3);
  assert.ok(teamBugRateMult(s) > 0.8);
  const sc = salesCapacity(s);
  assert.equal(sc.aes.length, 1);
  assert.ok(sc.aes[0].attainment > 1 && sc.quotaArr > 900000);
  const sq = supportQuality(s);
  assert.ok(sq.csat < 0.82 && sq.firstResponseMult > 1);
});

test('mis-hires are detected late: performance reads start noisy and sharpen over months', () => {
  const s = fresh({ seed: 8 });
  const p = ensurePeople(s);
  const lo = Object.fromEntries(Object.keys(sampleTraits(s, 'engineer').traits).map((k) => [k, 28]));
  const m = member({ id: 'bad', jobRole: 'engineer', traits: lo, startDay: s.day, rampWeeks: 12 });
  p.members.push(m);
  advance(s, 35, PEOPLE_APPS);
  const early = m.perf.sd;
  advance(s, 180, PEOPLE_APPS);
  assert.ok(m.perf.sd < early, `${m.perf.sd} < ${early}`);
  assert.ok(m.perf.estimate < -0.3, `estimate ${m.perf.estimate}`);
});

test('co-founders: salaried ones run through payroll with employer taxes; unpaid ones cost nothing and never resign via attrition', () => {
  const s = fresh({ path: 'vc' });
  const p = ensurePeople(s);
  p.payrollSetup.gusto = true;
  const paid = member({ id: 'cf1', name: 'Paid CF', kind: 'cofounder', engagement: 'employee', role: 'sdr', salary: 60000, startDay: -30, morale: 0 });
  const unpaid = member({ id: 'cf2', name: 'Unpaid CF', kind: 'cofounder', engagement: 'cofounder', role: 'ae', salary: 0, startDay: -30, morale: 0 });
  p.members.push(paid, unpaid);
  assert.equal(monthlyCostOf(s, unpaid), 0);
  const day15 = [...Array(40).keys()].find((d) => dayOfMonth(s, d) === 15);
  const lines = payrollLines(s, p.members, payPeriod(s, day15));
  assert.deepEqual(lines.map((l) => l.memberId), ['cf1']);
  assert.equal(lines[0].gross, 2500); // no SDR variable pay for a co-founder
  assert.ok(lines[0].employer > 0);
  for (let i = 0; i < 24; i++) peopleMonthEnd(s);
  assert.ok(paid.leavingDay == null && unpaid.leavingDay == null);
});

test('after a priced round the post-round pool % flows back to People; AI support error rate matches the Helpdesk', () => {
  const s = fresh({ path: 'vc' });
  const p = ensurePeople(s);
  s.apps.fundraising = { cap: { founders: [{ name: 'Pat', shares: 9_000_000 }], common: [], pool: 1_500_000, grants: [], preferred: [{ shares: 2_500_000 }], safes: [] } };
  advance(s, 1, PEOPLE_APPS);
  assert.equal(p.equity.poolPct, 11.54);
  assert.equal(p.optionPool.reservedPct, 11.54);
  assert.equal(AI_AGENTS.support_ai.errorRate, 0.08);
});

test('diligence flags a co-founder who missed their 83(b)', () => {
  const s = fresh({ path: 'vc' });
  s.apps.cofounder = { candidates: [{ name: 'Sam', signed: { missed83b: true } }] };
  assert.ok(legalIssues(s).some((x) => /Sam missed the 83\(b\)/.test(x)));
});
