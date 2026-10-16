// GTM compensation plans, the CSM / AM / SE roles and land-and-expand. Short, targeted tests (one mechanic, a few
// seeds, the shortest horizon that shows it): no multi-year runs. Design assumptions are [design] in
// public/data/gtm-comp.js; research in docs/research/gtm-comp/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, cancel, mrr } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { hazard } from '../public/core/churn.js';
import { readOperator } from '../public/core/operator.js';
import { uid } from '../public/core/util.js';
import { ensurePeople, peopleDay, peopleMonthEnd, attritionProbability } from '../public/apps/people/sim.js';
import { JOB_ROLES } from '../public/apps/people/catalog.js';
import { ROLES as DATA_ROLES } from '../public/data/roles.js';
import { acceptProbability } from '../public/apps/people/hiring.js';
import { salesCapacity } from '../public/apps/people/capacity.js';
import { payrollLines, monthlyCostOf } from '../public/apps/people/payroll.js';
import { makeCandidate } from '../public/apps/people/candidates.js';
import {
  payoutFor, settleDraw, clawbackFor, defaultPlan, planFor, setPlan, templatePatch, rateOf, autoRate, targetVariable, ensureComp, compDay, compMonthEnd,
  sandbagHold, repMods, complexity, effectiveOfferSalary, planKeyOf, discountFor, noteJunkMeeting, junkDrag, periodBounds, csmAttainment,
} from '../public/apps/people/comp.js';
import { assignOwners, coverageReport, seEffect, overloadEffect } from '../public/apps/people/gtm-team.js';
import { PLAN_TEMPLATES, COMP_ROLES, LAND_STRATEGIES, NRR_BANDS, COVERAGE } from '../public/data/gtm-comp.js';
import { PEOPLE_TRIGGERS, peopleEvents } from '../public/apps/people/readers.js';
import { compDesignRead } from '../public/apps/people/comp-readers.js';
import { SALES_NEW_TRIGGERS } from '../public/apps/sales/automation.js';
import { TRIGGERS } from '../public/apps/automations/model.js';
import { salesEvents } from '../public/apps/sales/events.js';
import { ensureSuccess, subById, acvOf, proposeRenewal, scheduleQbr, runQbr } from '../public/apps/success/engine.js';
import { initMap, mapAccount, meetStakeholders, pursueWhitespace, contractAccount, expandDay, setLandStrategy, retentionByBand, trueUp } from '../public/apps/sales/expand.js';
import { championRisk, gtmChurn, anchorMult } from '../public/apps/sales/expand-model.js';
import { expansionRead } from '../public/apps/sales/expand-readers.js';
import { ensureDeal, startProposal, addContact, closeWon } from '../public/apps/sales/model.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { APPS, freshState, winAccount, runCohort } from './helpers/gtm-cohort.js';

const DAY0 = 600; // reps hired long ago are fully ramped on day 600

function base({ model = 'smb', seed = 7, day = 0 } = {}) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'vc', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 900000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Reconciliation', status: 'shipped' }], bugs: [] };
  s.market.fit.product.score = 0.6;
  s.apps.support = { flows: { off: true } };
  s.day = day;
  return s;
}

const MEDIAN = Object.fromEntries(['gma', 'conscientiousness', 'agency', 'adaptability', 'grit', 'coachability', 'communication', 'empathy', 'craft', 'domain', 'ai_fluency', 'integrity', 'ambiguity_tolerance', 'polish'].map((k) => [k, 50]));
function addRep(s, jobRole, { salary = null, startDay = -400, traits = {}, morale = 72, equityPct = 0 } = {}) {
  const p = ensurePeople(s);
  const jr = JOB_ROLES[jobRole];
  const m = {
    id: uid('mem'), name: `Rep ${p.members.length}`, role: jr.memberRole, jobRole, kind: 'employee', engagement: 'employee', region: 'us', status: 'active',
    startDay, hoursPerWeek: 40, salary: salary ?? Math.round(((jr.salary.us[0] + jr.salary.us[1]) / 2)), equityPct, traits: { ...MEDIAN, ...traits }, morale, rampWeeks: 4, hiredDay: startDay,
  };
  p.members.push(m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// B. Commission math
// ---------------------------------------------------------------------------------------------

test('commission math: auto rate = variable / quota; override; accelerator above 100%; decelerator below the threshold; cap', () => {
  const p = { ...defaultPlan('ae'), accelMult: 2, decelBelow: 0.7, decelMult: 0.5, cap: null };
  assert.equal(Math.round(targetVariable(p)), 100000, 'OTE $200K at 50:50 = $100K variable');
  assert.ok(Math.abs(autoRate(p) - 100000 / 960000) < 1e-9);
  assert.ok(Math.abs(rateOf({ ...p, rate: 0.08 }) - 0.08) < 1e-9, 'a player rate overrides the derived one');
  const tv = 100000;
  assert.equal(payoutFor(p, { attainment: 1, tv }).pay, 65000, '0.7 x 0.5 + 0.3 x 1 = 65% of target variable');
  assert.equal(payoutFor(p, { attainment: 0.5, tv }).pay, 25000, '50% attainment pays half rate');
  assert.equal(payoutFor(p, { attainment: 1.5, tv }).pay, 65000 + 0.5 * 2 * tv, 'above 100% pays the accelerator');
  const flat = { ...p, decelBelow: 0, accelMult: 1 };
  assert.equal(payoutFor(flat, { attainment: 1.2, tv }).pay, 120000);
  const capped = { ...flat, cap: 1.5 };
  const hit = payoutFor(capped, { attainment: 2.4, tv });
  assert.equal(hit.pay, 150000); assert.ok(hit.capped && hit.uncapped > hit.pay);
  assert.ok(!payoutFor(capped, { attainment: 1.1, tv }).capped);
});

test('draw: non-recoverable guarantees the shortfall; recoverable becomes a balance repaid from later commission', () => {
  const nonrec = { ...defaultPlan('ae'), drawMonths: 3, drawPct: 0.75, drawRecoverable: false };
  const tvP = 25000;
  const m1 = settleDraw(nonrec, { monthsIntoJob: 1, earned: 0, balance: 0, tvPeriod: tvP });
  assert.equal(m1.pay, 18750); assert.equal(m1.balance, 0); assert.equal(m1.drawn, 18750);
  assert.equal(settleDraw(nonrec, { monthsIntoJob: 1, earned: 30000, balance: 0, tvPeriod: tvP }).pay, 30000, 'earning above the draw pays the earning');
  assert.equal(settleDraw(nonrec, { monthsIntoJob: 5, earned: 0, balance: 0, tvPeriod: tvP }).pay, 0, 'after the draw window nothing is guaranteed');
  const rec = { ...nonrec, drawRecoverable: true };
  const a = settleDraw(rec, { monthsIntoJob: 1, earned: 5000, balance: 0, tvPeriod: tvP });
  assert.equal(a.pay, 18750); assert.equal(a.balance, 13750);
  const b = settleDraw(rec, { monthsIntoJob: 4, earned: 20000, balance: a.balance, tvPeriod: tvP });
  assert.equal(b.pay, 6250, 'later commission repays the balance first'); assert.equal(b.balance, 0);
});

test('clawback: inside the window the commission paid comes back; outside, or with no clawback, nothing', () => {
  const p = { ...defaultPlan('ae'), clawbackDays: 90, clawbackPct: 1 };
  assert.equal(clawbackFor(p, { commissionPaid: 10000, bookDay: 100, endDay: 150 }), 10000);
  assert.equal(clawbackFor(p, { commissionPaid: 10000, bookDay: 100, endDay: 200 }), 0);
  assert.equal(clawbackFor({ ...p, clawbackDays: 0 }, { commissionPaid: 10000, bookDay: 100, endDay: 110 }), 0);
  assert.equal(clawbackFor({ ...p, clawbackPct: 0.5 }, { commissionPaid: 10000, bookDay: 100, endDay: 110 }), 5000);
});

test('templates change the plan and the dropdown covers the researched designs', () => {
  const ids = Object.keys(PLAN_TEMPLATES);
  for (const id of ['bridge_default', 'uncapped_accelerators', 'capped_flat', 'cash_basis', 'per_meeting_sdr', 'founding_equity', 'no_guardrails', 'retention_first']) assert.ok(ids.includes(id), id);
  const s = base();
  const r = setPlan(s, 'ae', {}, { templateId: 'capped_flat' });
  assert.equal(r.plan.cap, 1.5); assert.equal(r.plan.accelMult, 1);
  const sdr = setPlan(s, 'sdr', {}, { templateId: 'per_meeting_sdr' });
  assert.equal(sdr.plan.metric, 'meetings_held'); assert.equal(sdr.plan.clawbackDays, 0);
  assert.equal(templatePatch('founding_ae', 'founding_equity').ote, Math.round(COMP_ROLES.founding_ae.ote * 0.8));
  assert.ok(COMP_ROLES.sdr.src.includes('[verified]') && COMP_ROLES.am.src.includes('[design]'), 'sources are tagged');
});

// ---------------------------------------------------------------------------------------------
// B. Payroll: variable pay is computed from what the rep produced and posted as commission
// ---------------------------------------------------------------------------------------------

test('payroll: an AE is paid base only until a period settles; commission then goes to the bank as a separate payroll line', () => {
  const s = base({ day: DAY0 });
  const ae = addRep(s, 'account_executive', { salary: 100000 });
  const p = ensurePeople(s);
  p.payrollSetup.gusto = true;
  const [line0] = payrollLines(s, p.members, { start: s.day - 14, end: s.day });
  assert.ok(Math.abs(line0.gross - 100000 / 24) < 1, 'base only, no flat variable');
  assert.ok(monthlyCostOf(s, ae) > 100000 / 12 + 5000, 'forecast cost carries expected variable pay');
  // the AE closes two deals this quarter
  for (let i = 0; i < 2; i++) {
    const { deal } = winAccount(s, i, { band: 'mid' });
    deal.ownerAeId = ae.id; deal.amount = 150000; deal.source = 'outbound';
  }
  compDay(s);
  const comp = ensureComp(s);
  assert.equal(comp.credits.filter((c) => c.memberId === ae.id).length, 2);
  // settle at a quarter-end month
  while (!([2, 5, 8, 11].includes(new Date(Date.parse(s.startDate) + s.day * 86400000).getUTCMonth()))) s.day++;
  for (const c of comp.credits) c.day = s.day - 5;
  compMonthEnd(s);
  assert.ok(ae.commissionDue > 0, 'commission earned');
  const pay = comp.payouts[0];
  assert.equal(pay.role, 'ae'); assert.ok(pay.attainment > 0.9 && pay.attainment < 1.6);
  const before = s.bank.txns.length;
  // run the next payroll date
  const D = s.day;
  for (let d = D; d < D + 32; d++) { s.day = d; peopleDay(s); if (s.bank.txns.length > before) break; }
  const comm = s.bank.txns.filter((t) => /COMMISSIONS/.test(t.description));
  assert.equal(comm.length, 1); assert.equal(comm[0].category, 'payroll'); assert.ok(comm[0].amount < 0);
  assert.equal(ae.commissionDue, 0, 'paid out');
  const ev = peopleEvents(s, 'comp_paid', 0);
  assert.ok(ev.length >= 1 && ev[0].ref, 'comp_paid event emitted');
});

// ---------------------------------------------------------------------------------------------
// C. Behavioural consequences
// ---------------------------------------------------------------------------------------------

test('SDR paid per meeting held books more meetings but fewer qualify, and wastes AE time; qualified-opportunity pay does the opposite', () => {
  const run = (templateId) => {
    const s = base({ day: DAY0 });
    addRep(s, 'sdr');
    setPlan(s, 'sdr', {}, { templateId });
    return salesCapacity(s).sdrs[0];
  };
  const perMeeting = run('per_meeting_sdr'), qualified = run('bridge_default');
  assert.ok(perMeeting.meetingsPerMonth > qualified.meetingsPerMonth * 1.15, `more meetings: ${perMeeting.meetingsPerMonth} vs ${qualified.meetingsPerMonth}`);
  assert.ok(perMeeting.qualifiedRatio < qualified.qualifiedRatio * 0.8, `lower qualified ratio: ${perMeeting.qualifiedRatio} vs ${qualified.qualifiedRatio}`);
  assert.ok(perMeeting.meetingsPerMonth * perMeeting.qualifiedRatio < qualified.meetingsPerMonth * qualified.qualifiedRatio * 1.05, 'qualified output is no better');
  assert.ok(perMeeting.junkMeetings && !qualified.junkMeetings);
  // the AE running junk meetings sells less
  const s = base({ day: DAY0 });
  const ae = addRep(s, 'account_executive');
  assert.equal(junkDrag(s, ae.id), 1);
  for (let i = 0; i < 6; i++) noteJunkMeeting(s, { ownerAeId: ae.id });
  assert.ok(junkDrag(s, ae.id) < 0.95, 'junk meetings eat AE selling time');
});

test('per-meeting SDR plan logs comp_pays_for_junk_meetings with a traceable cost when most held meetings do not qualify', () => {
  const s = base({ day: DAY0 });
  const sdr = addRep(s, 'sdr', { startDay: DAY0 - 400 });
  setPlan(s, 'sdr', {}, { templateId: 'per_meeting_sdr' });
  const crm = (s.apps.crm ??= { deals: [], contacts: [], companies: [] });
  // 10 held meetings last month, 2 qualified
  for (let i = 0; i < 10; i++) crm.deals.push({ id: `d${i}`, sdrId: sdr.id, history: i < 2 ? [{ stage: 'meeting_held', day: s.day - 10 }, { stage: 'qualified', day: s.day - 8 }] : [{ stage: 'meeting_held', day: s.day - 10 }], amount: 10000 });
  sdr.junkHeld = 8;
  compMonthEnd(s);
  const m = (s.mistakes ?? []).find((x) => x.id === 'comp_pays_for_junk_meetings');
  assert.ok(m, 'junk-meeting mistake logged'); assert.equal(m.functionId, 'gtm_comp_design'); assert.ok(m.cost.hours > 0 && m.cost.usd > 0);
});

function creditDeals(s, ae, n, { arr = 60000 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = winAccount(s, 100 + i + (s.apps.crm?.deals?.length ?? 0), { band: 'mid' });
    w.deal.ownerAeId = ae.id; w.deal.amount = arr; w.deal.source = 'outbound';
    out.push(w);
  }
  compDay(s);
  return out;
}

test('no clawback closes more poor-fit customers with higher early churn; a 90-day clawback removes the incentive', () => {
  const poorFit = (clawbackDays) => {
    const s = base({ day: DAY0, seed: 11 });
    const ae = addRep(s, 'account_executive');
    setPlan(s, 'ae', { clawbackDays });
    const won = creditDeals(s, ae, 40);
    const subs = won.map((w) => w.sub);
    return { share: subs.filter((x) => x.poorFit).length / subs.length, churnMult: subs.reduce((a, x) => a + (x.gtmChurnMult ?? 1), 0) / subs.length, mods: repMods(s, ae), haz: subs.reduce((a, x) => a + hazard(s, x), 0) / subs.length };
  };
  const none = poorFit(0), strong = poorFit(90);
  assert.ok(none.share > 0.15 && strong.share === 0, `poor-fit share ${none.share} vs ${strong.share}`);
  assert.ok(none.churnMult > 1.2, 'poor-fit closes carry a higher churn multiplier');
  assert.ok(none.haz > strong.haz * 1.2, `renewal hazard ${none.haz} vs ${strong.haz}`);
  assert.ok(none.mods.winMult > strong.mods.winMult, 'they also close a bit more');
});

test('clawback takes the paid commission back from the next payout; with no clawback the same churn is logged as a mistake', () => {
  const run = (clawbackDays) => {
    const s = base({ day: DAY0, seed: 5 });
    const ae = addRep(s, 'account_executive');
    setPlan(s, 'ae', { clawbackDays, period: 'monthly' });
    const [w] = creditDeals(s, ae, 1, { arr: 120000 });
    w.sub.poorFit = true;
    const comp = ensureComp(s);
    const cr = comp.credits[0];
    cr.paid = 9000; // commission already paid on this deal
    cancel(s, w.sub.id, { atPeriodEnd: false, reason: 'voluntary' });
    s.day += 40;
    compDay(s);
    return { s, ae, comp, cr };
  };
  const a = run(90);
  assert.equal(a.cr.clawed, 9000); assert.equal(a.comp.debt[a.ae.id], 9000); assert.equal(a.comp.stats.clawbacks, 1);
  assert.ok(peopleEvents(a.s, 'clawback_triggered', 0).length === 1);
  const b = run(0);
  assert.equal(b.cr.clawed, 0);
  const m = (b.s.mistakes ?? []).find((x) => x.id === 'no_clawback_bad_fit_churn');
  assert.ok(m && m.cost.usd >= 9000 && m.cost.customers === 1, 'cost traceable to the missing clawback');
});

test('a cap makes a rep who has hit it hold deals for the next period and raises attrition; uncapped plans do not', () => {
  const run = (cap) => {
    const s = base({ day: DAY0, seed: 9 });
    const ae = addRep(s, 'account_executive', { traits: { craft: 70, conscientiousness: 70 } });
    setPlan(s, 'ae', { cap, period: 'quarterly' });
    // credit well over quota this period
    const comp = ensureComp(s);
    const b = periodBounds(s, planFor(s, 'ae'));
    comp.credits.push({ id: 'c1', memberId: ae.id, key: 'ae', kind: 'deal', dealId: 'dx', day: Math.max(b.start, s.day - 1), cashDay: null, units: 900000, arr: 900000, paid: 0, clawed: 0, status: 'open' });
    s.apps.crm = { deals: [], contacts: [], companies: [] };
    compDay(s);
    const deal = { id: 'd9', ownerAeId: ae.id, amount: 80000, stage: 'proposal', decisionDay: s.day };
    const held = sandbagHold(s, deal);
    return { s, ae, held, deal, b };
  };
  const capped = run(1.2), open = run(null);
  assert.ok(capped.held && capped.deal.decisionDay > capped.s.day, 'capped rep holds the deal');
  assert.ok(!open.held && open.deal.decisionDay === open.s.day, 'uncapped rep does not');
  assert.ok(capped.s.mistakes.some((m) => m.id === 'capped_plan_sandbagging'));
  assert.ok(peopleEvents(capped.s, 'rep_hit_cap', 0).length === 1);
  // attrition: the capped plan, after a capped period settles, raises the monthly resignation probability
  const settle = (r) => { r.ae.comp = { capCount: 1 }; compMonthEnd(r.s); return attritionProbability(r.ae); };
  assert.ok(settle(capped) > settle(open) * 1.5, 'capped top performers leave more often');
});

test('wide discount authority and period-end pressure make a below-quota AE discount and pull the deal forward', () => {
  const s = base({ day: DAY0 });
  const ae = addRep(s, 'account_executive');
  setPlan(s, 'ae', { discountAuthority: 0.1 });
  const tight = discountFor(s, ae, 0.12);
  assert.equal(tight.discount, 0.1, 'authority limits the discount');
  setPlan(s, 'ae', { discountAuthority: 0.3 });
  s.day = periodBounds(s, planFor(s, 'ae')).start + 20; // early in the period: no pressure yet
  const wide = discountFor(s, ae, 0.12);
  assert.ok(wide.discount > 0.17, `wide authority discounts more: ${wide.discount}`);
  // find a day inside the last two weeks of a quarter
  const b = periodBounds(s, planFor(s, 'ae'));
  s.day = b.end - 5;
  const qe = discountFor(s, ae, 0.12);
  assert.ok(qe.pressure && qe.discount > wide.discount, 'period-end pressure while below quota adds more');
});

test('paying on bookings makes invoiced deals slower to pay and likelier never to pay; cash-basis plans do the opposite', () => {
  const run = (payTiming) => {
    const s = base({ day: DAY0, model: 'ent', seed: 21 });
    const ae = addRep(s, 'account_executive');
    setPlan(s, 'ae', { payTiming });
    const won = creditDeals(s, ae, 30, { arr: 60000 });
    const subs = won.map((w) => w.sub).filter((x) => x.invoiceManually);
    return { n: subs.length, slow: subs.filter((x) => x.slowPayBooked).length, mult: subs.reduce((a, x) => a + (x.nonPayMult ?? 1), 0) / Math.max(1, subs.length) };
  };
  const booking = run('booking'), cash = run('cash');
  assert.ok(booking.n > 5);
  assert.ok(booking.slow > 0 && cash.slow === 0);
  assert.ok(booking.mult > 1.2 && cash.mult < 1, `non-payment multiplier ${booking.mult} vs ${cash.mult}`);
});

test('changing a plan in the middle of a period costs morale and attrition and is logged; a clean boundary or no reps costs nothing', () => {
  const s = base({ day: DAY0 });
  const ae = addRep(s, 'account_executive');
  // a day that is mid-quarter
  while (new Date(Date.parse(s.startDate) + s.day * 86400000).getUTCMonth() % 3 !== 1) s.day++;
  const r = setPlan(s, 'ae', { accelMult: 3, cap: 1.25 });
  assert.ok(r.penalties.includes('midyear_plan_change'));
  assert.ok(ae.morale < 72 && ae.compShock);
  assert.ok(s.mistakes.some((m) => m.id === 'midyear_plan_change'));
  compMonthEnd(s);
  assert.ok(ae.compAttr > 1.5, `attrition multiplier ${ae.compAttr}`);
  const t = base({ day: DAY0 });
  assert.deepEqual(setPlan(t, 'ae', { accelMult: 3 }).penalties, [], 'nobody on the plan: free to design');
  // a plan nobody can explain
  const c = base({ day: DAY0 });
  addRep(c, 'sdr');
  const messy = setPlan(c, 'sdr', { accelMult: 3, decelBelow: 0.8, decelMult: 0.3, cap: 1.3, clawbackDays: 120, spiffPerUnit: 40, payTiming: 'cash', founderCredit: 'none', rate: 0.2 });
  assert.ok(complexity(messy.plan) >= 8 || messy.penalties.includes('confusing_plan'));
});

test('OTE below market logs a mistake and cuts offer acceptance; far above market is logged as burn', () => {
  const s = base({ day: DAY0 });
  const cand = { role: 'account_executive', expectation: 100000, engagement: 'employee', traits: MEDIAN, interest: 0.5, persona: {} };
  const offer = { salary: 100000, equityPct: 0 };
  const ctx = { path: 'vc', incorporated: true, entity: 'ccorp', runwayMonths: 12, raised: true, hireIndex: 1 };
  const pOk = acceptProbability(cand, { ...offer, salary: effectiveOfferSalary(s, cand, offer) }, ctx);
  setPlan(s, 'ae', { ote: 140000 }); // OTE 70% of market
  const pLow = acceptProbability(cand, { ...offer, salary: effectiveOfferSalary(s, cand, offer) }, ctx);
  assert.ok(pLow < pOk - 0.08, `candidates decline a thin plan more: ${pOk} -> ${pLow}`);
  const low = addRep(s, 'account_executive', { salary: 80000 });
  compMonthEnd(s);
  assert.ok(low.compUnderpaid && s.mistakes.some((m) => m.id === 'ote_below_market'));
  assert.ok(low.compAttr > 1.8, 'underpaid reps leave more');
  const t = base({ day: DAY0 });
  setPlan(t, 'ae', { ote: 380000 });
  const rich = addRep(t, 'account_executive', { salary: 190000 });
  compMonthEnd(t);
  assert.ok(rich.compOverpaid && t.mistakes.some((m) => m.id === 'ote_above_market'));
  assert.ok(monthlyCostOf(t, rich) > monthlyCostOf(base({ day: DAY0 }), { ...rich, salary: 100000 }) , 'overpaying shows up as burn');
});

// ---------------------------------------------------------------------------------------------
// A. New roles: CSM, AM, SE, founding AE
// ---------------------------------------------------------------------------------------------

test('new roles exist end to end: job roles, interview traits, candidate pool and plans', () => {
  for (const r of ['csm', 'am', 'se', 'founding_ae']) {
    assert.ok(JOB_ROLES[r] && DATA_ROLES[r], r);
    assert.ok(DATA_ROLES[r].sampleQuestions.length >= 2 && DATA_ROLES[r].workSample, `${r} interview material`);
    assert.ok(planKeyOf(r), `${r} has a plan key`);
    const s = base();
    const job = { id: 'job1', role: r, region: 'us', engagement: 'employee' };
    let n = 0;
    const c = makeCandidate(s, job, null, (p) => `${p}_${n++}`);
    assert.ok(c.expectation > 30000 && c.signals.length, `${r} candidate generated`);
  }
  assert.equal(JOB_ROLES.founding_ae.memberRole, 'ae'); assert.equal(JOB_ROLES.csm.memberRole, 'csm');
  assert.ok(COMP_ROLES.founding_ae.ote < COMP_ROLES.ae.ote && COMP_ROLES.founding_ae.equityOtePerPct > 0);
});

function accountsFor(s, n, { band = 'mid' } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) { const w = winAccount(s, 300 + i, { band }); initMap(s, w.acct); w.acct.adoption = 0.8; out.push(w); }
  return out;
}

test('a CSM lowers churn and raises health on covered accounts; an overloaded CSM loses the effect', () => {
  const s = freshState('ent', 7, 24000);
  const accts = accountsFor(s, 4, { band: 'ent' });
  const csm = addRep(s, 'csm', { traits: { empathy: 60, agency: 60, conscientiousness: 60, domain: 60 } });
  assignOwners(s);
  const a = accts[0].acct;
  assert.equal(a.gtm.csmId, csm.id);
  assert.ok(a.gtm.ownerChurn < 0.95 && a.gtm.healthBonus > 4 && gtmChurn(a) < 0.95, `covered: churn x${a.gtm.ownerChurn}`);
  const cov = coverageReport(s);
  assert.ok(cov.coverage === 1 && !cov.overloaded);
  // 40 accounts on one enterprise CSM (about 10 per CSM) is a heavy overload
  const s2 = freshState('ent', 7, 24000);
  const many = accountsFor(s2, 24, { band: 'ent' });
  const csm2 = addRep(s2, 'csm');
  assignOwners(s2);
  assert.ok(coverageReport(s2).overloaded);
  assert.ok(many[0].acct.gtm.ownerChurn > a.gtm.ownerChurn + 0.04, `overloaded effect is weaker: ${many[0].acct.gtm.ownerChurn} vs ${a.gtm.ownerChurn}`);
  assert.ok(overloadEffect(2, 1) < overloadEffect(1.2, 1) && overloadEffect(1, 1) === 1);
  void csm2;
  // a better CSM (trait) lowers churn more than a weak one
  const weak = freshState('ent', 7, 24000);
  const wAcc = accountsFor(weak, 2, { band: 'ent' });
  addRep(weak, 'csm', { traits: { empathy: 25, agency: 25, conscientiousness: 25, domain: 25 } });
  assignOwners(weak);
  assert.ok(wAcc[0].acct.gtm.ownerChurn > a.gtm.ownerChurn, 'a weak CSM is worth less');
});

test('an account manager drives expansion on owned accounts; accounts with no owner expand less', () => {
  const run = (withAm) => {
    const s = freshState('ent', 13, 24000);
    const accts = accountsFor(s, 10, { band: 'ent' });
    if (withAm) addRep(s, 'am', { traits: { craft: 65, communication: 65, grit: 65, domain: 65 } });
    assignOwners(s);
    for (const w of accts) { mapAccount(s, w.acct); for (const it of w.acct.map.whitespace.slice(0, 1)) { it.status = 'open'; it.signalDay = s.day; } w.acct.health = 80; }
    const before = mrr(s);
    for (let i = 0; i < 90; i++) { s.day++; for (const w of accts) { w.acct.health = 80; for (const it of w.acct.map.whitespace) if (it.status === 'open') it.signalDay = s.day; } expandDay(s); }
    return { won: accts.reduce((n, w) => n + (w.acct.expansions ?? 0), 0), gain: mrr(s) - before };
  };
  const am = run(true), none = run(false);
  assert.ok(am.won >= 3 && none.won === 0, `AM-driven expansions ${am.won} vs ${none.won}`);
  assert.ok(am.gain > 0);
});

test('a sales engineer raises technical win odds and shortens enterprise cycles on big deals; none, no effect', () => {
  const s = base({ day: DAY0 });
  assert.equal(seEffect(s).winMult, 1);
  addRep(s, 'account_executive'); addRep(s, 'account_executive');
  addRep(s, 'se', { traits: { craft: 65, domain: 65, communication: 65, empathy: 60 } });
  const e = seEffect(s);
  assert.ok(e.winMult > 1.05 && e.cycleMult < 0.95 && e.coverage > 0.9, JSON.stringify(e));
  addRep(s, 'account_executive'); addRep(s, 'account_executive'); addRep(s, 'account_executive'); addRep(s, 'account_executive');
  assert.ok(seEffect(s).coverage < e.coverage, 'one SE covers about three AEs: spread thin, the effect fades');
  assert.ok(salesCapacity(s).se.winMult === seEffect(s).winMult);
});

test('an unowned renewal churns more and is logged; an AM or CSM who owns the account runs the renewal', () => {
  const s = freshState('ent', 17, 12000);
  const [w] = accountsFor(s, 1, { band: 'mid' });
  const { sub, acct } = w;
  sub.currentPeriodStart = s.day - 335; sub.currentPeriodEnd = s.day + 20;
  s.day += 0;
  acct.renewal = { id: 'rn1', periodEnd: sub.currentPeriodEnd, status: 'open', window: 30, terms: null, offers: [], counter: null, createdDay: s.day - 70 };
  assignOwners(s);
  expandDay(s);
  assert.ok(acct.gtm.ignored > 1.3);
  assert.ok(s.mistakes.some((m) => m.id === 'no_account_owner' && m.functionId === 'account_expansion'));
  assert.ok(gtmChurn(acct) >= 1.3);
  // with an AM on the account the owner runs the renewal
  const s2 = freshState('ent', 17, 12000);
  const [w2] = accountsFor(s2, 1, { band: 'mid' });
  w2.sub.currentPeriodEnd = s2.day + 40; w2.sub.currentPeriodStart = s2.day - 325;
  w2.acct.renewal = { id: 'rn2', periodEnd: w2.sub.currentPeriodEnd, status: 'open', window: 60, terms: null, offers: [], counter: null, createdDay: s2.day - 50 };
  addRep(s2, 'am');
  assignOwners(s2);
  expandDay(s2);
  assert.ok(w2.acct.renewal.ownerRun || w2.acct.renewal.offers.length, 'the AM ran the renewal');
  assert.ok(!(s2.mistakes ?? []).some((m) => m.id === 'no_account_owner'));
});

// ---------------------------------------------------------------------------------------------
// D. Land and expand
// ---------------------------------------------------------------------------------------------

function landDeal(s, strategy, i, { discountPct = 0, ramp = false, employees = 120 } = {}) {
  const { contact } = addContact(s, { firstName: `Lee${i}`, lastName: 'Ng', email: `lee${i}@land${i}.com`, title: 'VP Ops', company: `Land ${i}`, domain: `land${i}.com` });
  s.apps.crm.companies.find((c) => c.id === contact.companyId).employees = employees;
  const d = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'qualified' });
  d.hasPain = true;
  setLandStrategy(s, d, strategy, { ramp });
  startProposal(s, d, { planId: s.plans[0].id, quantity: 1, annual: true, discountPct });
  return d;
}

test('land strategy sets deal size, cycle length, win rate and expansion potential', () => {
  const s = freshState('ent', 3, 6000);
  const by = {};
  for (const [i, id] of Object.keys(LAND_STRATEGIES).entries()) {
    const d = landDeal(s, id, i);
    by[id] = d;
  }
  assert.ok(by.top_down.quantity > by.departmental.quantity && by.departmental.quantity > by.single_team.quantity && by.single_team.quantity > by.freemium_team.quantity, 'seats landed by strategy');
  assert.ok(by.top_down.amount > by.single_team.amount * 3, 'top-down lands several times bigger');
  const cycle = (d) => d.decisionDay - s.day;
  assert.ok(cycle(by.top_down) > cycle(by.single_team) * 1.5, `top-down is slower: ${cycle(by.top_down)} vs ${cycle(by.single_team)}`);
  assert.ok(LAND_STRATEGIES.top_down.winMult < 1 && LAND_STRATEGIES.freemium_team.winMult > 1, 'win rate effect');
  assert.equal(by.top_down.oversized, false, 'the strategy replaces the generic oversized flag');
  assert.throws(() => setLandStrategy(s, by.top_down, 'single_team'), /before the proposal/);
  // expansion potential: a small land has far more whitespace than an enterprise-wide one
  const small = winAccount(s, 50, { band: 'mid', land: 'single_team', quantity: 2, employees: 200 });
  const big = winAccount(s, 51, { band: 'mid', land: 'top_down', quantity: 140, employees: 200 });
  initMap(s, small.acct); initMap(s, big.acct);
  const ws = (a) => a.map.whitespace.reduce((n, x) => n + x.seats, 0);
  assert.ok(ws(small.acct) / small.sub.quantity > 2 && ws(big.acct) / big.sub.quantity < 0.5, 'whitespace relative to the land');
  // ramped contract starts smaller and steps up to the contracted seats
  const r = landDeal(s, 'departmental', 80, { ramp: true });
  assert.ok(r.rampTo > r.quantity && r.quantity === Math.max(1, Math.round(r.rampTo * 0.6)));
});

test('shelfware: an oversized top-down land is cut at renewal through a real Stripe contraction', () => {
  const s = freshState('ent', 4, 6000);
  const { sub, acct } = winAccount(s, 60, { band: 'mid', land: 'top_down', quantity: 40, employees: 60 });
  initMap(s, acct);
  sub.currentPeriodStart = s.day - 363; sub.currentPeriodEnd = s.day + 2;
  acct.adoption = 0.4;
  const beforeMrr = mrr(s);
  const evBefore = s.stripe.events.length;
  assert.equal(sub.currentPeriodEnd - s.day, 2);
  expandDay(s); // T-2: the buyer cuts the seats they do not use
  assert.ok(sub.quantity < 40, 'seats cut at renewal');
  assert.ok(mrr(s) < beforeMrr);
  assert.ok(s.stripe.events.slice(evBefore).some((e) => e.type === 'contraction' && e.amount < 0), 'MRR movement shows contraction');
  assert.ok(s.mistakes.some((m) => m.id === 'oversized_land_shelfware'));
  assert.equal(salesEvents(s, { types: ['account_contracted'] }).length, 1);
});

test('expansion goes through a real Stripe change (MRR expansion event); upselling before the account saw value is logged and raises churn', () => {
  const s = freshState('ent', 6, 6000);
  const { sub, acct } = winAccount(s, 70, { band: 'mid', employees: 400 });
  initMap(s, acct); mapAccount(s, acct);
  acct.health = 80; acct.adoption = 0.8;
  const it = acct.map.whitespace[0]; it.status = 'open';
  const ev0 = s.stripe.events.length, q0 = sub.quantity, m0 = mrr(s);
  let r;
  for (let i = 0; i < 20 && !r?.ok; i++) { it.status = 'open'; r = pursueWhitespace(s, acct, it.id); }
  assert.ok(r.ok && sub.quantity > q0 && mrr(s) > m0);
  assert.ok(s.stripe.events.slice(ev0).some((e) => e.type === 'expansion' && e.amount > 0));
  // premature
  const t = freshState('ent', 6, 6000);
  const w = winAccount(t, 71, { band: 'mid', employees: 400 });
  initMap(t, w.acct); w.acct.adoption = 0.2; w.acct.health = 80;
  const item = w.acct.map.whitespace[0]; item.status = 'open';
  pursueWhitespace(t, w.acct, item.id);
  assert.ok(t.mistakes.some((m) => m.id === 'upsell_before_value' && m.functionId === 'account_expansion'));
  assert.ok(w.acct.gtm.upsell >= 1.5 && gtmChurn(w.acct) >= 1.5);
  // true-up
  const u = trueUp(s, acct);
  assert.ok(u.ok === false || u.amount > 0);
});

test('an over-discounted land anchors the price: expansion sells at the low price, uplifts are refused, and it is logged', () => {
  const run = (discountPct) => {
    const s = freshState('ent', 8, 6000);
    const { sub, acct } = winAccount(s, 90, { band: 'mid', employees: 600, discountPct });
    initMap(s, acct); mapAccount(s, acct);
    acct.health = 85; acct.adoption = 0.85;
    const list = sub.price;
    const q0 = sub.quantity, arr0 = acvOf(sub);
    const it = acct.map.whitespace[0];
    let r; for (let i = 0; i < 30 && !r?.ok; i++) { it.status = 'open'; r = pursueWhitespace(s, acct, it.id); }
    const perSeat = (acvOf(sub) - arr0) / (sub.quantity - q0);
    return { s, perSeat, list, acct };
  };
  const clean = run(0.05), deep = run(0.4);
  assert.ok(deep.perSeat < clean.perSeat * 0.7, `expansion seats sell at the anchored price: ${deep.perSeat} vs ${clean.perSeat}`);
  assert.ok(deep.s.mistakes.some((m) => m.id === 'anchored_low_price'));
  assert.ok(anchorMult(0.4, 0.07) < 0.7 && anchorMult(0.05, 0.07) === 1, 'uplift acceptance falls for an anchored account');
  // the renewal acceptance really is lower
  const probe = (ctx) => { const { s, acct } = ctx; acct.renewal = { id: 'r', periodEnd: 0, status: 'open', window: 60, terms: null, offers: [], counter: null, createdDay: s.day }; const sub = subById(s, acct.subId); sub.currentPeriodEnd = s.day + 40; return proposeRenewal(s, acct, { upliftPct: 0.08, viaCall: true }).p; };
  assert.ok(probe(deep) < probe(clean) - 0.1, 'renewal uplift is refused far more often');
});

test('QBRs and multi-threading reduce the churn risk when the champion leaves', () => {
  const make = ({ qbr, thread }) => {
    const s = freshState('ent', 10, 12000);
    const { sub, acct } = winAccount(s, 95, { band: 'mid' });
    initMap(s, acct);
    sub.currentPeriodStart = s.day - 300; sub.currentPeriodEnd = s.day + 65;
    if (thread) { meetStakeholders(s, acct); acct.map.threads = 3; acct.map.execSponsor = true; }
    if (qbr) { const q = scheduleQbr(s, acct); q.prepped = true; runQbr(s, q, { roi: true, roadmap: true, expansion: false, exec: false }); }
    acct.champion = 'left'; acct.championLeftDay = s.day + 1; // the day the Success engine would record it
    advance(s, 1, APPS);
    return { s, sub, acct };
  };
  const none = make({ qbr: false, thread: false }), both = make({ qbr: true, thread: true });
  assert.ok(championRisk(none.acct, none.s.day) >= 1.7);
  assert.ok(championRisk(both.acct, both.s.day) < 1.1, `soft landing: ${championRisk(both.acct, both.s.day)}`);
  assert.ok(gtmChurn(none.acct) > gtmChurn(both.acct) * 1.4);
  assert.ok(hazard(none.s, none.sub) > hazard(both.s, both.sub) * 1.1, 'renewal hazard is higher for the single-threaded account');
  assert.ok(salesEvents(none.s, { types: ['champion_left'] }).length >= 1, 'champion_left event emitted for Automations');
  assert.ok(none.s.mistakes.some((m) => m.id === 'single_threaded_account'), 'single-threaded loss is traceable');
  assert.ok(!both.s.mistakes.some((m) => m.id === 'single_threaded_account'));
});

test('signals open whitespace: usage near limit, new team invited, champion promoted; events reach Automations', () => {
  const s = freshState('ent', 12, 12000);
  const { acct } = winAccount(s, 99, { band: 'ent' });
  initMap(s, acct);
  acct.health = 90; acct.adoption = 0.9; acct.champion = 'active';
  let opened = null;
  for (let i = 0; i < 4000 && !opened; i++) { s.day++; expandDay(s); opened = acct.map.whitespace.find((x) => x.status === 'open'); }
  assert.ok(opened && ['usage_near_limit', 'new_team_invited', 'champion_promoted'].includes(opened.signal), 'a signal fired');
  assert.ok(salesEvents(s, { types: ['expansion_signal'] }).length >= 1);
});

// ---------------------------------------------------------------------------------------------
// Calibration: NRR for a median operator lands in the researched band (one year, 4 seeds, ~22 accounts each)
// ---------------------------------------------------------------------------------------------

test('median-operator NRR lands in the researched band for SMB, mid-market and enterprise (+-4 points sampling tolerance)', () => {
  const tol = 0.04;
  for (const band of ['smb', 'mid', 'ent']) {
    const r = runCohort({ band, tier: 'median', seeds: [3, 4, 5, 6, 7, 8, 9, 10], accounts: 18 });
    const [lo, hi] = NRR_BANDS[band].nrr;
    assert.ok(r.nrr >= lo - tol && r.nrr <= hi + tol, `${band} NRR ${r.nrr.toFixed(3)} outside ${lo}-${hi}`);
    assert.ok(r.grr >= 0.8 && r.grr <= 0.97, `${band} GRR ${r.grr.toFixed(3)}`);
  }
});

test('NRR separates operators by what they did: mediocre < median < stellar play on the same accounts', () => {
  const t = ['mediocre', 'median', 'stellar'].map((tier) => runCohort({ band: 'mid', tier, seeds: [3, 4, 5, 6, 7, 8] }));
  assert.ok(t[0].nrr + 0.05 < t[1].nrr && t[1].nrr + 0.03 < t[2].nrr, t.map((x) => x.nrr.toFixed(3)).join(' < '));
  assert.ok(t[0].nrr < 0.95 && t[2].nrr > 1.05);
});

// ---------------------------------------------------------------------------------------------
// E. Operator tiers
// ---------------------------------------------------------------------------------------------

function compArchetype(tier) {
  const s = base({ day: DAY0 });
  const reps = { sdr: addRep(s, 'sdr', { salary: 54000 }), ae: addRep(s, 'account_executive', { salary: 100000 }), csm: addRep(s, 'csm', { salary: 84000 }) };
  const P = {
    stellar: { sdr: { metric: 'qualified_opps', quota: 72 }, ae: { clawbackDays: 90, cap: null, discountAuthority: 0.1, payTiming: 'cash' }, csm: { metric: 'grr', quota: 0.9 } },
    good: { sdr: { metric: 'qualified_opps', quota: 72 }, ae: { clawbackDays: 60, cap: 2, discountAuthority: 0.15, payTiming: 'booking' }, csm: { metric: 'renewals_bonus', quota: 0.9 } },
    average: { sdr: { metric: 'meetings_held', quota: 120 }, ae: { clawbackDays: 30, cap: 1.5, discountAuthority: 0.2, payTiming: 'booking' }, csm: { metric: 'nrr', quota: 1.02 } },
    mediocre: { sdr: { metric: 'meetings_held', quota: 120 }, ae: { clawbackDays: 0, cap: 1.25, discountAuthority: 0.3, payTiming: 'booking', ote: 140000 }, csm: { metric: 'nrr', quota: 1.02, drawMonths: 0 } },
  }[tier];
  for (const k of ['sdr', 'ae', 'csm']) setPlan(s, k, P[k]);
  if (tier === 'mediocre') { s.day += 3; setPlan(s, 'ae', { accelMult: 3, spiffPerUnit: 20, rate: 0.2 }); compMonthEnd(s); }
  for (const k of ['ae']) { reps[k].salary = tier === 'mediocre' ? 70000 : 100000; }
  compMonthEnd(s);
  return s;
}

test('gtm_comp_design reader: stellar > good > average > mediocre, from the plan the player saved, unknown before any hire', () => {
  assert.equal(readOperator(base(), 'gtm_comp_design').tier, 'unknown');
  const reads = ['stellar', 'good', 'average', 'mediocre'].map((tier) => ({ tier, r: compDesignRead(compArchetype(tier)) }));
  if (process.env.SCORES) console.log(reads.map((x) => x.tier + ':' + x.r.score).join(' '));
  for (const { tier, r } of reads) assert.equal(r.tier, tier, `${tier} reads ${r.tier} (score ${r.score}: ${r.evidence.join(' | ')})`);
  for (let i = 1; i < reads.length; i++) assert.ok(reads[i - 1].r.score > reads[i].r.score);
  assert.ok(reads[3].r.coaching.length >= 3 && reads[3].r.coaching.some((c) => /qualified/i.test(c)), 'mediocre is told what a stellar operator does');
  assert.ok(reads.every((x) => x.r.evidence.length > 0));
  // volume is not skill: ten reps on the mediocre plan do not improve the read
  const many = compArchetype('mediocre');
  for (let i = 0; i < 6; i++) addRep(many, 'sdr');
  assert.ok(compDesignRead(many).score <= reads[3].r.score + 0.02);
});

function expArchetype(tier) {
  const s = freshState('ent', 20, 12000);
  const P = {
    stellar: { land: 'departmental', disc: 0.03, map: 1, thread: 1, qbr: 1, exp: 4 },
    good: { land: 'single_team', disc: 0.1, map: 0.6, thread: 0.5, qbr: 0.6, exp: 2 },
    average: { land: null, disc: 0.2, map: 0.2, thread: 0.2, qbr: 0.2, exp: 1 },
    mediocre: { land: 'top_down', disc: 0.35, map: 0, thread: 0, qbr: 0, exp: 0 },
  }[tier];
  const accts = [];
  for (let i = 0; i < 10; i++) {
    const w = winAccount(s, 200 + i, { band: 'mid', land: P.land, discountPct: P.disc, quantity: P.land === 'top_down' ? 80 : 3, employees: 120 });
    initMap(s, w.acct);
    accts.push(w);
  }
  s.day += 200;
  accts.forEach((w, i) => {
    const f = (x) => i < Math.round(x * 10);
    if (f(P.map)) w.acct.map.mapped = true;
    if (f(P.thread)) { w.acct.map.threads = 2; w.acct.map.execSponsor = true; }
    if (f(P.qbr)) w.acct.lastQbrDay = s.day - 40;
    w.acct.createdDay = s.day - 200;
    // expansion and contraction as real subscription changes
    if (i < P.exp * 2) w.sub.quantity += Math.max(1, Math.round(w.sub.quantity * 0.5));
    s.stripe.events.push(...(i < P.exp * 2 ? [{ day: s.day - 60, type: 'expansion', amount: acvOf(w.sub) / 12 * 0.3, subId: w.sub.id, source: 'outbound' }] : []));
  });
  if (tier === 'mediocre') for (const w of accts.slice(0, 5)) s.stripe.events.push({ day: s.day - 30, type: 'churn', amount: -acvOf(w.sub) / 12, subId: w.sub.id, source: 'outbound' });
  return s;
}

test('account_expansion reader: stellar > good > average > mediocre from land choices, discounts, maps, threading and QBRs', () => {
  assert.equal(readOperator(base(), 'account_expansion').tier, 'unknown');
  const reads = ['stellar', 'good', 'average', 'mediocre'].map((tier) => ({ tier, r: expansionRead(expArchetype(tier)) }));
  for (const { tier, r } of reads) assert.equal(r.tier, tier, `${tier} reads ${r.tier} (score ${r.score}; ${r.evidence.join(' | ')})`);
  for (let i = 1; i < reads.length; i++) assert.ok(reads[i - 1].r.score > reads[i].r.score);
  assert.ok(reads[3].r.coaching.some((c) => /stellar operator/.test(c)) && reads[3].r.coaching.length >= 3);
});

// ---------------------------------------------------------------------------------------------
// F. Automations
// ---------------------------------------------------------------------------------------------

test('every exported people and sales trigger added here is in the Automations catalog', () => {
  for (const t of ['comp_paid', 'rep_hit_cap', 'clawback_triggered']) { assert.ok(PEOPLE_TRIGGERS.includes(t), t); assert.ok(TRIGGERS[`people_${t}`], `catalog people_${t}`); }
  for (const t of ['expansion_signal', 'renewal_due', 'champion_left', 'account_contracted']) { assert.ok(SALES_NEW_TRIGGERS[t], t); assert.ok(TRIGGERS[`sales_${t}`], `catalog sales_${t}`); }
  for (const t of PEOPLE_TRIGGERS) assert.ok(TRIGGERS[`people_${t}`], t);
  for (const t of Object.keys(SALES_NEW_TRIGGERS)) assert.ok(TRIGGERS[`sales_${t}`], t);
});

test('payout, cap and clawback events reach the people event feed with stable refs', () => {
  const s = base({ day: DAY0 });
  const ae = addRep(s, 'account_executive');
  setPlan(s, 'ae', { period: 'monthly', drawMonths: 0 });
  const comp = ensureComp(s);
  const b = periodBounds(s, planFor(s, 'ae'));
  comp.credits.push({ id: 'c1', memberId: ae.id, key: 'ae', kind: 'deal', dealId: 'x', day: b.start, cashDay: null, units: 100000, arr: 100000, paid: 0, clawed: 0, status: 'open' });
  while (!(new Date(Date.parse(s.startDate) + (s.day + 1) * 86400000).getUTCDate() === 1)) s.day++;
  compMonthEnd(s);
  const ev = peopleEvents(s, 'comp_paid', 0);
  assert.equal(ev.length, 1); assert.match(ev[0].ref, /^comp_paid:/);
  void csmAttainment;
});

// ---------------------------------------------------------------------------------------------
// More land-and-expand mechanics and plan details
// ---------------------------------------------------------------------------------------------

test('a ramped contract steps up on the contracted day as a real Stripe expansion; renewal_due reaches Automations', () => {
  const s = freshState('ent', 14, 6000);
  const { sub, acct, deal } = winAccount(s, 110, { band: 'mid', land: { strategy: 'departmental', ramp: true }, employees: 100 });
  initMap(s, acct);
  assert.ok(deal.rampTo > sub.quantity, 'starts below the contracted seats');
  const step = acct.contract.steps[0];
  const ev0 = s.stripe.events.length;
  s.day = step.day;
  expandDay(s);
  assert.equal(sub.quantity, deal.rampTo);
  assert.ok(s.stripe.events.slice(ev0).some((e) => e.type === 'expansion' && e.amount > 0));
  // renewal opening is announced
  sub.currentPeriodStart = s.day - 280; sub.currentPeriodEnd = s.day + 60;
  acct.renewal = { id: 'rn-x', periodEnd: sub.currentPeriodEnd, status: 'open', window: 60, terms: null, offers: [], counter: null, createdDay: s.day };
  expandDay(s);
  assert.equal(salesEvents(s, { types: ['renewal_due'] }).length, 1);
});

test('a paid pilot converts to the full land when it reached production and mostly ends when it did not', () => {
  const s = freshState('ent', 15, 6000);
  const out = { high: 0, low: 0 };
  for (let i = 0; i < 14; i++) {
    for (const [k, adoption] of [['high', 0.92], ['low', 0.1]]) {
      const w = winAccount(s, 500 + i * 2 + (k === 'low' ? 1 : 0), { band: 'mid', land: 'paid_pilot', employees: 100 });
      initMap(s, w.acct);
      assert.equal(w.acct.pilot.status, 'active');
      w.acct.adoption = adoption; w.acct.health = k === 'high' ? 85 : 50; w.acct.pilot.endDay = s.day;
      expandDay(s);
      if (w.acct.pilot.converted) out[k]++;
    }
  }
  assert.ok(out.high >= 9 && out.low <= 6 && out.high > out.low + 4, `conversions ${JSON.stringify(out)}`);
});

test('landing too small to matter never expands and is logged at the first renewal', () => {
  const s = freshState('ent', 16, 6000);
  const { sub, acct } = winAccount(s, 120, { band: 'mid', land: 'freemium_team', quantity: 1, employees: 300 });
  initMap(s, acct);
  assert.ok(acct.gtm.landSmall > 1, 'a tiny land churns more');
  sub.currentPeriodStart = s.day - 363; sub.currentPeriodEnd = s.day + 2;
  expandDay(s);
  assert.ok(s.mistakes.some((m) => m.id === 'land_too_small' && m.functionId === 'account_expansion'));
});

test('a SPIFF pays a flat bonus per closed deal while it runs, on top of commission', () => {
  const run = (spiffPerUnit) => {
    const s = base({ day: DAY0, seed: 3 });
    const ae = addRep(s, 'account_executive');
    setPlan(s, 'ae', { period: 'monthly', drawMonths: 0, spiffPerUnit, spiffUntilDay: s.day + 90 });
    const comp = ensureComp(s);
    const b = periodBounds(s, planFor(s, 'ae'));
    for (let i = 0; i < 2; i++) comp.credits.push({ id: `c${i}`, memberId: ae.id, key: 'ae', kind: 'deal', dealId: `x${i}`, day: b.start + 2, cashDay: null, units: 40000, arr: 40000, paid: 0, clawed: 0, status: 'open' });
    while (new Date(Date.parse(s.startDate) + (s.day + 1) * 86400000).getUTCDate() !== 1) s.day++;
    compMonthEnd(s);
    return comp.payouts[0];
  };
  const withSpiff = run(500), without = run(0);
  assert.equal(withSpiff.spiff, 1000); assert.equal(without.spiff, 0);
  assert.equal(withSpiff.paid - without.paid, 1000);
});

test('a CSM paid on net retention pushes upsells before value and the account churns more; a GRR plan does not', () => {
  const run = (metric) => {
    const s = freshState('ent', 18, 12000);
    const accts = accountsFor(s, 6, { band: 'mid' });
    for (const w of accts) { w.acct.adoption = 0.3; w.acct.health = 70; }
    addRep(s, 'csm');
    setPlan(s, 'csm', { metric, quota: metric === 'nrr' ? 1.02 : 0.9 });
    assignOwners(s);
    for (let i = 0; i < 6; i++) { s.day = s.day - (s.day % 30) + 30; for (const w of accts) { w.acct.adoption = 0.3; w.acct.health = 70; } expandDay(s); }
    return { s, up: accts.filter((w) => (w.acct.gtm.upsell ?? 1) > 1).length };
  };
  const nrr = run('nrr'), grr = run('grr');
  assert.ok(nrr.up >= 2 && grr.up === 0, `upsell pushes ${nrr.up} vs ${grr.up}`);
  assert.ok(nrr.s.mistakes.some((m) => m.id === 'upsell_before_value'));
  assert.ok(!(grr.s.mistakes ?? []).some((m) => m.id === 'upsell_before_value'));
});
