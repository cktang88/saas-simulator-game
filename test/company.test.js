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
import { acceptProbability, heuristicPostJudge, interviewSignal, rampFactor } from '../public/apps/people/hiring.js';
import { supportWeek, aiResolveRate, frtChurnMult, weeklyTickets } from '../public/apps/people/support.js';
import {
  ensurePeople, createJob, applyJudge, openJob, screenCandidate, scheduleInterview, startInterview, finishInterview, makeOffer,
  setupPayroll, hireAgent, cancelAgent, misclassRisk, get409A, createPool, terminate,
} from '../public/apps/people/sim.js';
import { replyCandidate } from '../public/apps/people/llm.js';
import { franchiseAuthorizedShares, franchiseAPVC, delawareLate, buildCalendar, dayFor, late1099 } from '../public/apps/legal/deadlines.js';
import { scoreRedlines, heuristicRedlineFeedback } from '../public/apps/legal/redlines.js';
import {
  ensureLegal, incorporate, signFounderDocs, file83b, payFranchiseTax, payFiling, trademarkFee, setupDpa, resolveRedline, legalIssues, convertToCcorp,
} from '../public/apps/legal/sim.js';
import { filingPaid } from '../public/apps/legal/api.js';

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
  assert.equal(full.employer, 1250); // indie burden 1.25×
  const half = payrollLines(s, [member({ startDay: period.start + 7 })], period)[0];
  assert.ok(half.gross > 2600 && half.gross < 2700, `prorated ${half.gross}`);
  p.members.push(member({ startDay: -30 }));
  p.payrollSetup.gusto = true;
  advance(s, day15, PEOPLE_APPS);
  const pay = s.bank.txns.filter((t) => t.category === 'payroll');
  const tax = s.bank.txns.filter((t) => t.category === 'payroll_tax');
  assert.equal(pay.length, 1);
  assert.equal(pay[0].amount, -5000);
  assert.equal(tax[0].amount, -1250);
  assert.ok(s.recurring.some((r) => r.vendor === 'Gusto' && r.active && r.amount === 55)); // $49 + $6
});

test('EOR adds statutory load + Deel fee; contractors are paid monthly and tracked for 1099s', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const eor = member({ engagement: 'eor', region: 'latam', salary: 80000 });
  const con = member({ engagement: 'contractor', kind: 'contractor', region: 'us', hourlyRate: 100, hoursPerWeek: 10, salary: null, startDay: -30 });
  p.members.push(eor, con);
  assert.equal(monthlyCostOf(s, eor), Math.round((80000 / 12) * 1.3 * 100 + 599 * 100) / 100);
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
  const weak = interviewSignal([{ from: 'me', text: 'Are you a team player?' }, { from: 'me', text: 'Do you like startups?' }]);
  const strong = interviewSignal([{ from: 'me', text: 'Walk me through the last system you shipped end to end.' }, { from: 'me', text: 'Tell me about a time a launch went wrong. What did you do?' }, { from: 'me', text: 'What trade-offs would you make designing our sync?' }]);
  assert.ok(strong > weak);
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
  openJob(s, job.id, ['linkedin', 'wellfound', 'network']);
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
  c.interview.messages.push({ from: 'me', text: 'Walk me through the last thing you shipped end to end.' }, { from: 'them', text: 'Sure…', interest: 7 });
  finishInterview(s, c.id);
  assert.equal(c.stage, 'interviewed');
  assert.ok(c.estimate.sd < 0.3);
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
  assert.equal(fs.price, 80);
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
  assert.throws(() => payFranchiseTax(s, 'de-franchise-2027', { method: 'apvc', grossAssets: 1, issuedShares: 8_000_000 }), /Gross assets/);
  const snap = [...s.metrics.daily].reverse().find((x) => x.day <= dayFor(s, '2026-12-31'));
  const paid = payFranchiseTax(s, 'de-franchise-2027', { method: 'apvc', grossAssets: snap.cash + snap.stripeBalance, issuedShares: 8_000_000 });
  assert.equal(paid.amount, 450);
  assert.ok(s.apps.legal.paidFilings['de-franchise-2027']);
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
  assert.ok(s.apps.people.runs.length >= 20);
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
