// The shared negotiation engine wired into hiring offers (People candidate page) and vendor contracts (Money stack audit).
// Short and targeted: one mechanic per test, a few seeds, no long simulations. Scripted negotiators (helpers/negotiators.js)
// play the four operator tiers through the same public engine API a player uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, addRecurring, balance } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import { APPS } from '../public/apps/registry.js';
import * as N from '../public/apps/negotiate/index.js';
import { makeCandidate } from '../public/apps/people/candidates.js';
import { ensurePeople, createJob, applyJudge, makeOffer, createPool, peopleDay, hireFromCandidate } from '../public/apps/people/sim.js';
import { ensureOps } from '../public/apps/people/ops-state.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { candidateReservation } from '../public/apps/people/negotiation.js';
import { stackRows, spendDay, cancelTool, removeSeats, renewalQuote, ensureSpend, vendorEligibility } from '../public/apps/money/spend.js';
import { VENDOR_NEG } from '../public/data/negotiation.js';
import { runNegotiator, offerAt } from './helpers/negotiators.js';
import { addYearsDay } from '../public/apps/money/common.js';

const PEOPLE_APPS = APPS.filter((a) => ['people', 'legal'].includes(a.id));
const mis = (s, id) => (s.mistakes ?? []).filter((x) => x.id === id);
const JUDGE = { firstImpression: '', clarity: 8, specificity: 8, payTransparency: true, issues: [], rewriteHint: '' };

// ---------------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------------
function peopleWorld(seed = 31, day = 10) {
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
let n = 0;
/** A candidate with an outstanding offer at a known ask. */
function offered(s, { ask = 120000, pay = 108000, otherOffers = false, countered = false, seniority = 'mid' } = {}) {
  const j = createJob(s, { text: 'x', role: 'engineer', region: 'us', engagement: 'employee' });
  applyJudge(j, JUDGE);
  const c = makeCandidate(s, j, null, (x) => `${x}_w${n++}`);
  Object.assign(c, { expectation: ask, seniority, stage: 'interviewed', interest: 0.7, noticeDays: 14 });
  c.persona = { ...c.persona, otherOffers };
  ensurePeople(s).candidates.push(c);
  makeOffer(s, c.id, { salary: pay, equityPct: 0, startDay: s.day + 14 });
  c.negotiation.rolled = true; // the one-shot "will they counter" roll is covered by people-ops2; here the player starts the talks
  if (countered) {
    Object.assign(c.negotiation, { status: 'countered', round: 1, counterDay: s.day, counter: { want: { salary: Math.round(ask * 1.06 / 500) * 500, equityPct: 0.2, signOn: 3000 }, items: ['base', 'equity', 'sign-on'] } });
  }
  return c;
}

function vendorWorld(seed = 3, { vendor = 'Attio', amount = 600, seats = null, day = 40, cash = 400000 } = {}) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: cash, counterparty: 'Pat', category: 'owner_contribution' });
  const r = addRecurring(s, { vendor, amount, category: 'software', dayOfMonth: 10 });
  if (seats) { r.seats = seats; r.seatPrice = amount / seats; }
  s.day = day;
  return { s, r };
}
const close = (s, id, pkg) => {
  const neg = N.getNegotiation(s, id);
  N.playRoundSync(s, id, { offer: pkg });
  if (neg.status === 'open') N.acceptCounter(s, id);
  return neg;
};

// ---------------------------------------------------------------------------------------------------------------
// Hiring
// ---------------------------------------------------------------------------------------------------------------

test('hiring: the spec is built from candidateReservation (hidden floor, equity appetite, competing offer, deadline)', () => {
  const s = peopleWorld(31);
  const c = offered(s, { ask: 120000, pay: 108000, otherOffers: true, countered: true });
  const res = candidateReservation(s, c);
  const neg = N.startHiringCandidateNegotiation(s, c.id);
  assert.equal(neg.kind, 'hiring');
  assert.equal(c.negotiation.engineId, neg.id);
  assert.equal(N.startHiringCandidateNegotiation(s, c.id).id, neg.id, 'idempotent');
  // their counter is their opening position; the hidden base floor is at or above the reservation read from People
  assert.equal(neg.cpOpen.salary, Math.round(120000 * 1.06 / 500) * 500);
  const salary = neg.issues.find((i) => i.id === 'salary');
  const floorSalary = salary.min + neg.hidden.floors.salary * (salary.max - salary.min);
  assert.ok(floorSalary >= res.minBase - 600, `${floorSalary} vs ${res.minBase}`);
  assert.ok(neg.expiresDay != null && neg.expiresDay >= s.day + 2);
  assert.equal(neg.player.batna.real, false, 'no other candidate and plenty of runway: no real alternative to claim');
  assert.throws(() => N.startHiringCandidateNegotiation(s, 'nope'), /no outstanding offer/);
});

test('hiring: while a multi-round negotiation is open the offer is frozen; closing it applies the package and the usual acceptance runs', () => {
  const s = peopleWorld(31);
  const c = offered(s, { ask: 120000, pay: 114000, countered: true });
  const neg = N.startHiringCandidateNegotiation(s, c.id);
  c.offer.decideDay = s.day; // the sim would decide today
  peopleDay(s);
  assert.equal(c.stage, 'offer', 'the gate waits while the engine negotiation is open');
  runNegotiator(s, neg.id, 'good', { anchor: { salary: 112000 } });
  assert.equal(neg.status, 'agreed');
  const agreed = neg.final;
  assert.equal(c.offer.salary, Math.round(agreed.salary), 'base lands on the open offer');
  assert.equal(c.offer.signOn, Math.round(agreed.signOn ?? 0));
  assert.ok(c.negotiation.satisfaction === 1 && c.negotiation.status === 'responded');
  assert.ok(c.offer.decideDay <= s.day + 1);
  // acceptance runs through the existing path (deterministic by seed; p >= 0.9 after an agreement)
  advance(s, 3, PEOPLE_APPS);
  assert.equal(c.stage, 'hired', 'after an agreement acceptance is very likely (p >= 0.9)');
  const m = ensurePeople(s).members.find((x) => x.name === c.name);
  assert.ok(m, 'a member exists');
  assert.equal(m.salary, Math.round(agreed.salary));
  assert.ok(m.ops && m.ops.askRatio > 0, 'the hire-time terms check ran');
});

test('hiring: a package settled at the floor still reaches hire-time consequences (lowball attrition is logged, traceable)', () => {
  // A candidate with no rival and no counter can be pushed a few points under the number where acceptance falls under half.
  const s = peopleWorld(33);
  const c = offered(s, { ask: 120000, pay: 100000 });
  const neg = N.startHiringCandidateNegotiation(s, c.id);
  const salary = neg.issues.find((i) => i.id === 'salary');
  const low = Math.ceil((salary.min + neg.hidden.floors.salary * (salary.max - salary.min)) / 500) * 500;
  assert.ok(low < 120000 * 0.92, `floor ${low} is under the lowball line`);
  N.closeNegotiation(s, neg, 'agreed', { ...offerAt(s, neg.id, 0.4), salary: low, signOn: 0, equity: 0, start: 'now', remote: 'office' });
  assert.equal(c.offer.salary, low);
  const m = hireFromCandidate(s, ensurePeople(s), Object.assign(c, { stage: 'hired' }));
  assert.ok(m.ops.lowball && m.ops.askRatio < 0.92, JSON.stringify(m.ops));
  assert.equal(mis(s, 'lowball_offer_attrition').length, 1, 'the existing lowball consequence fires and is traceable');
});

test('hiring: a candidate walk, an impasse or an expired window means they decline; the founder walking withdraws the offer', () => {
  const s = peopleWorld(35);
  const c1 = offered(s, { ask: 120000, pay: 100000, otherOffers: true, countered: true });
  const n1 = N.startHiringCandidateNegotiation(s, c1.id);
  s.day = n1.expiresDay + 1;
  N.negotiationDay(s);
  assert.equal(n1.status, 'expired');
  assert.equal(c1.stage, 'declined', 'an expired window is a decline');
  assert.equal(mis(s, 'negotiation_stalled').length, 1);
  const c2 = offered(s, { ask: 120000, pay: 110000 });
  const n2 = N.startHiringCandidateNegotiation(s, c2.id);
  // an extreme lowball repeated until they end the talks
  for (let i = 0; i < 6 && n2.status === 'open'; i++) N.playRoundSync(s, n2.id, { offer: offerAt(s, n2.id, 1), message: 'Take it or leave it, this is ridiculous money for you.' });
  if (n2.status === 'open') N.walkAway(s, n2.id);
  if (n2.status === 'walked_player') assert.equal(c2.stage, 'rejected', 'we withdrew');
  else assert.equal(c2.stage, 'declined', n2.status);
});

test('hiring: bluffing a competing candidate or a budget ceiling that does not exist is detectable; a real ceiling is leverage', () => {
  let called = 0;
  for (let seed = 40; seed < 46; seed++) {
    const s = peopleWorld(seed);
    const c = offered(s, { ask: 120000, pay: 110000 });
    const neg = N.startHiringCandidateNegotiation(s, c.id);
    assert.equal(neg.player.batna.real, false, 'no other candidates, plenty of runway');
    N.playRoundSync(s, neg.id, { offer: offerAt(s, neg.id, 0.6), message: 'My budget is capped, I really cannot go higher.' });
    if (neg.flags.bluff) called += neg.flags.bluffDiscovered ? 1 : 0;
    assert.ok(neg.flags.bluff, 'recorded as a bluff');
  }
  assert.ok(called >= 1, 'with a hardball-free persona the bluff is still caught sometimes');
  // A real ceiling: low runway makes the claim true.
  const s = peopleWorld(41);
  s.bank.accounts.forEach((a) => { a.balance = a.id === 'checking' ? 30000 : 0; });
  addRecurring(s, { vendor: 'Contract dev', amount: 6000, category: 'contractors', dayOfMonth: 20 });
  const c = offered(s, { ask: 120000, pay: 110000 });
  const neg = N.startHiringCandidateNegotiation(s, c.id);
  assert.ok(neg.player.batna.sources.some((x) => x.kind === 'budget'), JSON.stringify(neg.player.batna));
  assert.equal(neg.player.batna.real, true, 'a real ceiling can be mentioned');
  N.playRoundSync(s, neg.id, { offer: offerAt(s, neg.id, 0.6), message: 'My budget is capped, I really cannot go higher.' });
  assert.equal(neg.flags.bluff, null, 'not a bluff when the runway really limits the budget');
});

// ---------------------------------------------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------------------------------------------

test('vendor: only recurring bills of $100/mo or more can be negotiated; annual plans only near renewal', () => {
  const { s, r } = vendorWorld(3);
  const small = s.recurring.find((x) => x.vendor === 'Vercel');
  assert.equal(vendorEligibility(s, small.id).ok, false);
  assert.throws(() => N.startRecurringNegotiation(s, small.id), /not worth/);
  assert.equal(vendorEligibility(s, r.id).ok, true);
  r.annual = { amount: 7200, renewDay: s.day + 200, startDay: s.day - 165 }; r.variable = true;
  assert.match(vendorEligibility(s, r.id).reason, /Renewal talks open/);
  r.annual.renewDay = s.day + 60;
  assert.equal(vendorEligibility(s, r.id).ok, true);
});

test('vendor: a negotiated contract lowers the recurring bill inside the researched band and stores the uplift cap', () => {
  const { s, r } = vendorWorld(3);
  const neg = N.startRecurringNegotiation(s, r.id);
  const before = r.amount * 12;
  runNegotiator(s, neg.id, 'good', { claim: 'alternative', anchor: { price: Math.round(before * 0.8) } });
  assert.equal(neg.status, 'agreed');
  const disc = 1 - (neg.final.prepay === 'annual' ? r.annual.amount : r.amount * 12) / before;
  assert.ok(disc > 0.04 && disc <= VENDOR_NEG.maxDiscount + 0.01, `discount ${disc}`);
  assert.ok(r.contract && r.contract.negId === neg.id && r.contract.day === s.day);
  const cap = { none: null, cap7: 0.07, cap5: 0.05, lock: 0 }[neg.final.renewCap];
  assert.equal(r.annual ? r.annual.cap : r.contract.cap, cap);
  assert.ok(neg.context.outcome.monthlyAfter < neg.context.outcome.monthlyBefore);
  assert.throws(() => N.startRecurringNegotiation(s, r.id), /agreed this contract/, 'the rep will not reopen a price it just agreed');
});

test('vendor: annual prepay posts the cash now and sets the renewal; monthly keeps the bill and a term end', () => {
  const { s, r } = vendorWorld(3);
  const neg = N.startRecurringNegotiation(s, r.id);
  const cash0 = balance(s);
  N.closeNegotiation(s, neg, 'agreed', { ...offerAt(s, neg.id, 0.5), price: 6480, prepay: 'annual', term: '1', renewCap: 'cap5', payment: 'upfront' });
  assert.ok(r.annual, 'annual flag set');
  assert.equal(r.annual.amount, 6480);
  assert.equal(balance(s), Math.round((cash0 - 6480) * 100) / 100, 'the full year is paid today');
  assert.equal(r.annual.renewDay, s.day + 365);
  assert.equal(r.annual.cap, 0.05, 'uplift cap stored for the next renewal');
  assert.ok(s.bank.txns.some((t) => t.meta?.annualPrepay && t.meta?.negotiated && t.amount === -6480));
  const row = stackRows(s).find((x) => x.id === r.id);
  assert.ok(row.annual && Math.abs(row.monthly - 540) < 0.01);
  assert.equal(neg.context.outcome.cashNow, 6480);
  // monthly with a two-year term: no cash now, the bill drops, the term end is stored
  const w = vendorWorld(3);
  const n2 = N.startRecurringNegotiation(w.s, w.r.id);
  const cash1 = balance(w.s);
  N.closeNegotiation(w.s, n2, 'agreed', { ...offerAt(w.s, n2.id, 0.5), price: 6840, prepay: 'monthly', term: '2', renewCap: 'cap7', payment: 'upfront' });
  assert.ok(!w.r.annual && w.r.amount === 570 && balance(w.s) === cash1);
  assert.equal(w.r.contract.termEndDay, addYearsDay(w.s, w.s.day, 2), 'two calendar years (731 days across Feb 29)');
  assert.equal(w.r.contract.cap, 0.07);
});

test('vendor: a prepay checking cannot fund stays monthly at the un-prepaid price (the discount is not free)', () => {
  const { s, r } = vendorWorld(3, { cash: 3000 });
  s.bank.accounts.forEach((a) => { a.balance = a.id === 'checking' ? 3000 : 0; });
  const neg = N.startRecurringNegotiation(s, r.id);
  N.closeNegotiation(s, neg, 'agreed', { ...offerAt(s, neg.id, 0.5), price: 6480, prepay: 'annual', term: '1', renewCap: 'cap5', payment: 'upfront' });
  assert.ok(!r.annual && neg.context.outcome.prepayFailed);
  assert.ok(r.amount * 12 > 6480, `monthly price ${r.amount * 12} is higher than the prepay price`);
  assert.ok(r.amount * 12 <= 7200);
  assert.equal(balance(s), 3000, 'nothing was paid');
});

test('vendor: prepaying with a short runway is a logged mistake (cash now vs savings later)', () => {
  const { s, r } = vendorWorld(4, { cash: 9000 });
  s.bank.accounts.forEach((a) => { a.balance = a.id === 'checking' ? 9000 : 0; });
  addRecurring(s, { vendor: 'Contract dev', amount: 3500, category: 'contractors', dayOfMonth: 20 });
  const neg = N.startRecurringNegotiation(s, r.id);
  N.closeNegotiation(s, neg, 'agreed', { ...offerAt(s, neg.id, 0.5), price: 6480, prepay: 'annual', term: '1', renewCap: 'cap5', payment: 'upfront' });
  assert.ok(r.annual, 'prepaid');
  assert.equal(mis(s, 'prepay_squeezed_runway').length, 1, 'prepaid a year with months of runway left');
});

test('vendor: an annual renewal nobody negotiated renews at list plus an uplift and logs auto_renewed_without_negotiating', () => {
  const { s, r } = vendorWorld(3, { vendor: 'Attio', amount: 600 });
  r.annual = { amount: 7200, renewDay: s.day + 5, startDay: s.day - 360 }; r.variable = true;
  const quote = renewalQuote(s, r);
  assert.ok(quote > 7200 * 1.04 && quote <= 7200 * 1.13, `quote ${quote}`);
  const cash0 = balance(s);
  s.day += 6; spendDay(s);
  assert.equal(r.annual.amount, quote);
  assert.equal(balance(s), Math.round((cash0 - quote) * 100) / 100);
  const m = mis(s, 'auto_renewed_without_negotiating')[0];
  assert.ok(m && m.delayed && m.functionId === 'negotiation' && m.cost.usd > quote - 7200, JSON.stringify(m));
  // small annual plans are below the threshold and do not log
  const { s: s2, r: r2 } = vendorWorld(3, { vendor: 'Plausible', amount: 40 });
  r2.annual = { amount: 480, renewDay: s2.day + 2, startDay: s2.day - 363 }; r2.variable = true;
  s2.day += 3; spendDay(s2);
  assert.equal(mis(s2, 'auto_renewed_without_negotiating').length, 0);
});

test('vendor: negotiating the renewal sets the price charged at renewal, a cap for the next one, and avoids the mistake', () => {
  const { s, r } = vendorWorld(3);
  r.annual = { amount: 7200, renewDay: s.day + 40, startDay: s.day - 325 }; r.variable = true;
  const neg = N.startRecurringNegotiation(s, r.id);
  assert.ok(neg.issues.find((i) => i.id === 'prepay').options.length === 1, 'an annual plan renews annually');
  runNegotiator(s, neg.id, 'good', { claim: 'alternative', anchor: { price: Math.round(neg.context.listAnnual * 0.8) } });
  assert.equal(neg.status, 'agreed');
  assert.equal(r.annual.amount, 7200, 'nothing is charged until the renewal');
  assert.ok(r.annual.priced);
  const agreed = r.annual.nextAmount;
  assert.ok(agreed < neg.context.listAnnual, 'below the vendor quote');
  const cash0 = balance(s);
  s.day += 41; spendDay(s);
  assert.equal(balance(s), Math.round((cash0 - agreed) * 100) / 100);
  assert.equal(mis(s, 'auto_renewed_without_negotiating').length, 0);
  assert.equal(r.annual.cap, { cap7: 0.07, cap5: 0.05, lock: 0, none: null }[neg.final.renewCap]);
});

test('vendor: a prepaid annual plan for a tool you stop using (or cancel) logs prepaid_annual_then_churned_tool once', () => {
  // by activity: nobody has touched it for months, 4 months into the term
  const { s, r } = vendorWorld(3);
  r.annual = { amount: 7200, renewDay: s.day + 245, startDay: s.day - 120 }; r.variable = true;
  const sp = ensureSpend(s);
  stackRows(s); // creates the tool meta
  const key = Object.keys(sp.tools).find((k) => k.startsWith('Attio'));
  sp.tools[key].lastUsedDay = s.day - 90;
  spendDay(s);
  const m = mis(s, 'prepaid_annual_then_churned_tool');
  assert.equal(m.length, 1);
  assert.ok(m[0].cost.usd > 3000 && m[0].cost.usd < 7200 * 0.7, JSON.stringify(m[0].cost));
  spendDay(s);
  assert.equal(mis(s, 'prepaid_annual_then_churned_tool').length, 1, 'once per term');
  // by cancelling within the term
  const w = vendorWorld(5);
  w.r.annual = { amount: 6000, renewDay: w.s.day + 250, startDay: w.s.day - 115 }; w.r.variable = true;
  cancelTool(w.s, w.r.id);
  assert.equal(mis(w.s, 'prepaid_annual_then_churned_tool').length, 1);
  // cancelling right before the renewal is not a mistake
  const z = vendorWorld(6);
  z.r.annual = { amount: 6000, renewDay: z.s.day + 20, startDay: z.s.day - 345 }; z.r.variable = true;
  cancelTool(z.s, z.r.id);
  assert.equal(mis(z.s, 'prepaid_annual_then_churned_tool').length, 0);
});

test('vendor: a seat commitment above usage is a delayed mistake and the committed seats cannot be removed until the term ends', () => {
  const { s, r } = vendorWorld(3, { vendor: 'Notion', amount: 400, seats: 10 });
  const neg = N.startRecurringNegotiation(s, r.id);
  assert.ok(neg.issues.some((i) => i.id === 'seats'), 'team tools have a seat issue');
  const one = vendorWorld(3);
  assert.ok(!N.startRecurringNegotiation(one.s, one.r.id).issues.some((i) => i.id === 'seats'), 'single-seat tools do not');
  N.closeNegotiation(s, neg, 'agreed', { ...offerAt(s, neg.id, 0.5), price: 4200, prepay: 'monthly', term: '2', seats: 'over', renewCap: 'cap5', payment: 'upfront' });
  assert.ok(r.seats >= 13, `seats ${r.seats}`);
  const m = mis(s, 'overcommitted_seats');
  assert.equal(m.length, 1);
  assert.ok(m[0].delayed && m[0].cost.usd > 0);
  assert.throws(() => removeSeats(s, r.id), /committed/);
  // right-sizing to usage is the opposite move: fewer seats, a smaller bill, no mistake
  const w = vendorWorld(3, { vendor: 'Notion', amount: 400, seats: 10 });
  const n2 = N.startRecurringNegotiation(w.s, w.r.id);
  const usage = n2.context.usage;
  N.closeNegotiation(w.s, n2, 'agreed', { ...offerAt(w.s, n2.id, 0.5), price: 4200, prepay: 'monthly', term: '1', seats: 'right', renewCap: 'cap5', payment: 'upfront' });
  assert.equal(w.r.seats, Math.max(1, usage));
  assert.ok(w.r.amount < 350);
  assert.equal(mis(w.s, 'overcommitted_seats').length, 0);
});

test('vendor: a rep that walked away stays cold for a month; walking yourself does not burn the relationship', () => {
  const { s, r } = vendorWorld(3);
  const neg = N.startRecurringNegotiation(s, r.id);
  N.closeNegotiation(s, neg, 'walked_cp', null);
  assert.ok(r.noTalkUntil === s.day + 30);
  assert.match(vendorEligibility(s, r.id).reason, /went cold/);
  s.day += 31;
  assert.equal(vendorEligibility(s, r.id).ok, true);
  const w = vendorWorld(3);
  const n2 = N.startRecurringNegotiation(w.s, w.r.id);
  N.walkAway(w.s, n2.id);
  assert.equal(vendorEligibility(w.s, w.r.id).ok, true);
});

// ---------------------------------------------------------------------------------------------------------------
// Operator tiers (vendor and hiring negotiations count in the 'negotiation' reader) and UI
// ---------------------------------------------------------------------------------------------------------------

test('operator tiers separate on vendor and hiring negotiations by behaviour, and the reader counts them', () => {
  const run = (tier) => {
    const s0 = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed: 1 });
    s0.apps.negotiation = { items: [], events: [] };
    let score = 0, k = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const { s, r } = vendorWorld(seed);
      const neg = N.startRecurringNegotiation(s, r.id);
      runNegotiator(s, neg.id, tier, { claim: 'alternative', anchor: { price: Math.round(r.amount * 12 * 0.8) }, anchorAvg: { price: Math.round(r.amount * 12 * 0.85) } });
      s0.apps.negotiation.items.push(neg); score += neg.result.score; k++;
      const w = peopleWorld(60 + seed);
      const c = offered(w, { ask: 120000, pay: 108000, otherOffers: seed % 2 === 0 });
      const hn = N.startHiringCandidateNegotiation(w, c.id);
      runNegotiator(w, hn.id, tier, { anchor: { salary: 110000 }, anchorAvg: { salary: 114000 } });
      s0.apps.negotiation.items.push(hn); score += hn.result.score; k++;
    }
    return { score: score / k, read: readOperator(s0, 'negotiation') };
  };
  const r = Object.fromEntries(['mediocre', 'average', 'good', 'stellar'].map((t) => [t, run(t)]));
  const sc = Object.fromEntries(Object.entries(r).map(([t, v]) => [t, +v.score.toFixed(2)]));
  assert.ok(r.stellar.score >= r.good.score - 0.02 && r.good.score > r.average.score && r.average.score > r.mediocre.score, JSON.stringify(sc));
  assert.ok(r.stellar.read.score > r.average.read.score && r.average.read.score > r.mediocre.read.score, JSON.stringify(Object.fromEntries(Object.entries(r).map(([t, v]) => [t, v.read.score]))));
  assert.ok(r.mediocre.read.coaching.length >= 1);
  assert.match(r.stellar.read.evidence[0], /8 negotiations/);
});

test('UI: the stack audit offers Negotiate on bills of $100/mo or more and the candidate page offers Negotiate (multi-round)', async () => {
  const { stackView } = await import('../public/apps/money/view-spend.js');
  const { negotiationPanel } = await import('../public/apps/people/views-ops.js');
  const { s, r } = vendorWorld(3);
  const html = String(stackView(s));
  assert.match(html, new RegExp(`data-neg-start="vendor:${r.id}"`));
  assert.ok(!html.includes(`data-neg-start="vendor:${s.recurring.find((x) => x.vendor === 'Vercel').id}"`), 'small bills have no Negotiate button');
  const neg = N.startRecurringNegotiation(s, r.id);
  assert.match(String(stackView(s)), /data-neg-send/, 'the open negotiation renders in the stack audit');
  N.walkAway(s, neg.id);
  const w = peopleWorld(31);
  const c = offered(w, { ask: 120000, pay: 110000, countered: true });
  const page = String(negotiationPanel(w, ensurePeople(w), c));
  assert.match(page, /data-neg-start="hiring:/);
  assert.match(page, /Negotiate \(multi-round\)/);
  assert.match(page, /data-neg-signon/, 'the quick path is still there');
  const hn = N.startHiringCandidateNegotiation(w, c.id);
  const open = String(negotiationPanel(w, ensurePeople(w), c));
  assert.match(open, /data-neg-send/);
  assert.ok(!/data-neg-signon/.test(open), 'quick path is hidden while the multi-round talks run');
});
