// Cards & spend (receipts, locks, policy agent, stack audit), Mercury Treasury rules and the 13-week cash
// forecast (scenarios, triggers, forecast-vs-actual), with operator-tier separation tests (principle 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, addRecurring } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import { APPS } from '../public/apps/registry.js';
import * as SP from '../public/apps/money/spend.js';
import * as FC from '../public/apps/money/forecast.js';
import * as TR from '../public/apps/money/treasury.js';
import { isMisclassified, guessCategory } from '../public/apps/money/ledger.js';
import { cpaQuote } from '../public/apps/money/compliance.js';

const SUB = APPS.filter((a) => ['bank', 'books', 'stripe'].includes(a.id));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function company(seed, { cash = 80000, customers = 20, name = `Co${seed}` } = {}) {
  const s = newState({ companyName: name, model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  s.bank.accounts[0].personal = false; s.bank.accounts[0].name = 'Mercury Checking';
  s.apps.product = { features: [{ id: 'f1', status: 'shipped' }] };
  s.company.website = { text: 'x' };
  post(s, { amount: cash, counterparty: 'Pat', category: 'owner_contribution' });
  for (let i = 0; i < customers; i++) { const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, country: 'US' }); subscribe(s, c.id, { id: 'p', price: 79, interval: 'month', trialDays: 0 }); }
  return s;
}

// ---------------------------------------------------------------------------------------------------------
// Receipts, policy and stack: four operator profiles in the same worlds
// ---------------------------------------------------------------------------------------------------------

const POLICY = 'Receipts and a one-line memo are due within 3 days of every charge. Any purchase over $500 needs founder approval before it is made. New software or free trials need an owner and approval before the trial starts. Travel: economy flights only, hotels up to $250 per night, meals up to $60 per person. Gift cards, cash advances and personal subscriptions are never allowed on company cards. Do not split a purchase into smaller charges to stay under the approval limit.';
const CARD_VENDORS = [['OpenAI API', 'ai_inference'], ['Google Ads', 'advertising'], ['Upwork', 'contractors'], ['AWS', 'hosting'], ['Figma', 'software'], ['Delta', 'travel']];

function spendWorld(seed, tier, days = 200) {
  const s = company(seed);
  s.apps.people = { members: [{ id: 'm1', name: 'Alex', kind: 'employee', status: 'active', startDay: 0 }, { id: 'm2', name: 'Sam', kind: 'contractor', status: 'active', startDay: 0 }] };
  if (tier !== 'mediocre') SP.setPlan(s, tier === 'stellar' ? 'plus' : 'free');
  if (tier === 'stellar' || tier === 'good') SP.connectInbox(s);
  if (tier === 'stellar') {
    SP.issueCard(s, { name: 'Hosting', limit: 500, category: 'hosting' });
    SP.issueCard(s, { name: 'Ads', limit: 3000, category: 'advertising' });
    SP.savePolicy(s, { text: POLICY, approvalOver: 500, blocked: ['gift_cards', 'personal', 'luxury'], softwareNeedsApproval: true, agent: true });
  } else if (tier === 'good') SP.savePolicy(s, { text: 'Receipts within 7 days. Purchases over $1000 need approval.', approvalOver: 1000, blocked: ['gift_cards'] });
  let hours = 0;
  const cadence = { stellar: 2, good: 7, average: 30, mediocre: 0 }[tier];
  const audit = { stellar: 30, good: 90 }[tier];
  for (let d = 1; d <= days; d++) {
    advance(s, 1, SUB);
    if (d % 4 === 0) { const v = CARD_VENDORS[(d / 4) % CARD_VENDORS.length]; post(s, { amount: -(40 + ((d * 37) % 400)), counterparty: v[0], description: v[0].toUpperCase(), category: v[1], method: 'card' }); }
    if (cadence && d % cadence === 0) {
      for (const r of SP.missingReceipts(s)) {
        const memo = tier === 'average' ? '' : `${r.vendor} charge for the product`;
        const x = SP.attachReceipt(s, r.id, memo);
        hours += x.hours;
        if (!x.ok) { SP.fileAffidavit(s, r.id, `${r.vendor} business purchase for product`); hours += SP.SPEND.affidavitHours; }
      }
    }
    if (tier === 'stellar' || tier === 'good') for (const q of SP.pendingRequests(s)) { SP.decideRequest(s, q.id, !(q.agentFlag === 'decline' || (tier === 'stellar' && q.bad))); hours += 0.05; }
    if (tier === 'average') for (const q of SP.pendingRequests(s)) { SP.decideRequest(s, q.id, true, { bulk: true }); hours += 0.02; }
    if (tier === 'stellar' && d % 7 === 0) for (const t of SP.openTrials(s)) { SP.cancelTrial(s, t.id); hours += 0.1; }
    if (audit && d % audit === 0) { SP.runAudit(s); hours += 0.5; for (const r of SP.stackRows(s)) { if (r.unused) SP.cancelTool(s, r.id); else if (r.zombie) SP.removeSeats(s, r.id); } }
    if (d === 100) s.apps.people.members[1].status = 'gone';
  }
  const sp = s.apps.bank.spend;
  const cs = Object.values(sp.closeStats);
  const card = s.bank.txns.filter((t) => t.method === 'card' && t.amount < 0);
  const usd = (s.mistakes ?? []).filter((m) => ['bookkeeping_close_tax', 'automation_ai', 'cash_runway'].includes(m.functionId)).reduce((a, m) => a + m.cost.usd, 0);
  return {
    s,
    missShare: cs.reduce((a, c) => a + c.missing, 0) / Math.max(1, cs.reduce((a, c) => a + c.n, 0)),
    err: card.filter((t) => isMisclassified(s, t)).length / card.length,
    waste: SP.stackWaste(s), leak: sp.stats.leak, usd, hours,
    cost: usd + hours * 50 + SP.stackWaste(s) * 6, // [design] $50/founder hour; waste carried 6 more months
    bookScore: readOperator(s, 'bookkeeping_close_tax').score,
  };
}

test('spend tiers: receipts, policy and stack audit separate stellar > good > average > mediocre', () => {
  const tiers = ['stellar', 'good', 'average', 'mediocre'];
  const R = Object.fromEntries(tiers.map((t) => [t, []]));
  for (let seed = 1; seed <= 4; seed++) for (const t of tiers) R[t].push(spendWorld(seed, t));
  const m = (t, k) => mean(R[t].map((r) => r[k]));
  // Missing receipts at close: stellar ~0, mediocre most of them (gap analysis: ~40%+ for a mediocre operator).
  assert.ok(m('stellar', 'missShare') < 0.05, `stellar missing ${m('stellar', 'missShare')}`);
  assert.ok(m('mediocre', 'missShare') > 0.4, `mediocre missing ${m('mediocre', 'missShare')}`);
  // Books error: receipts + memos make the books better than no receipts at all.
  assert.ok(m('stellar', 'err') < m('mediocre', 'err') && m('good', 'err') < m('mediocre', 'err'), `err ${m('stellar', 'err')} / ${m('good', 'err')} / ${m('mediocre', 'err')}`);
  // Unused tools and seats: audits remove waste.
  assert.ok(m('stellar', 'waste') <= m('good', 'waste') && m('good', 'waste') < m('average', 'waste'), `waste ${m('stellar', 'waste')} ${m('good', 'waste')} ${m('average', 'waste')}`);
  assert.ok(m('mediocre', 'waste') >= m('average', 'waste') - 1);
  // Out-of-policy spend: a full written policy + agent + review stops it; no program lets it all through.
  assert.ok(m('stellar', 'leak') < m('good', 'leak') && m('good', 'leak') <= m('mediocre', 'leak') + 1, `leak ${m('stellar', 'leak')} ${m('good', 'leak')} ${m('mediocre', 'leak')}`);
  // Total traceable cost (mistake ledger $ + founder hours + ongoing waste) orders the tiers.
  const c = tiers.map((t) => m(t, 'cost'));
  assert.ok(c[0] < c[1] && c[1] < c[2] && c[2] < c[3], `costs ${c.map((x) => Math.round(x)).join(' < ')}`);
  // Mediocre play is traceable: the mistakes ledger names it.
  const med = R.mediocre[0].s;
  assert.ok(med.mistakes.some((x) => x.id === 'missing_receipts_at_close'), 'missing receipts at close logged');
  // The books read sees the receipts.
  assert.ok(m('stellar', 'bookScore') > m('mediocre', 'bookScore'));
});

test('receipts: a memo lowers the categorization error, a long-missing receipt raises it', () => {
  const s = company(5);
  SP.ensureSpend(s);
  for (let i = 0; i < 600; i++) post(s, { amount: -25, counterparty: `Vendor ${i}`, category: i % 2 ? 'software' : 'ai_inference', method: 'card' });
  SP.spendDay(s);
  const before = s.bank.txns.filter((t) => t.method === 'card' && guessCategory(s, t) !== t.category).length;
  s.day += 20; // receipts now missing for 20 days
  const missing = s.bank.txns.filter((t) => t.method === 'card' && guessCategory(s, t) !== t.category).length;
  for (const r of SP.missingReceipts(s)) { const x = SP.attachReceipt(s, r.id, 'monthly API usage for production'); if (!x.ok) SP.fileAffidavit(s, r.id, 'monthly API usage for production'); }
  const memo = s.bank.txns.filter((t) => t.method === 'card' && guessCategory(s, t) !== t.category).length;
  assert.ok(missing > before, `${missing} > ${before}`);
  assert.ok(memo < before * 0.5, `${memo} < ${before} / 2`);
});

test('card lock: overdue receipts lock the shared card and its vendors decline; a vendor card isolates hosting', () => {
  const run = (vendorCard) => {
    const s = company(9, { name: 'Lock' });
    SP.setPlan(s, 'free');
    if (vendorCard) SP.issueCard(s, { name: 'Hosting', limit: 1000, category: 'hosting' });
    for (let d = 0; d < 110; d++) {
      advance(s, 1, SUB);
      if (d % 5 === 0) post(s, { amount: -60, counterparty: 'Google Ads', category: 'advertising', method: 'card' });
      // Pay attention to the hosting card only (receipts there are auto-cleared), ignore the rest.
      if (vendorCard) for (const r of SP.missingReceipts(s)) if (r.cardId !== 'card_1') SP.attachReceipt(s, r.id, 'hosting for production');
    }
    return s;
  };
  const shared = run(false);
  const card = shared.apps.bank.spend.cards[0];
  assert.ok(card.locked, 'shared card locked');
  assert.ok(shared.recurring.some((r) => r.category === 'hosting' && (r.suspended || r.cardHold)), 'hosting declined on the locked card');
  assert.ok(shared.mistakes.some((m) => m.id === 'ignored_receipts'));
  const isolated = run(true);
  assert.ok(isolated.apps.bank.spend.cards[0].locked, 'shared card still locks');
  assert.ok(isolated.recurring.filter((r) => r.category === 'hosting').every((r) => r.active && !r.suspended), 'hosting on its own card keeps running');
  // Clearing the receipts unlocks the card.
  for (const r of SP.missingReceipts(shared)) { const x = SP.attachReceipt(shared, r.id, 'ads spend for growth'); if (!x.ok) SP.fileAffidavit(shared, r.id, 'ads spend for growth'); }
  assert.ok(!shared.apps.bank.spend.cards[0].locked, 'unlocked after clearing');
});

test('policy: coverage needs specifics; keyword stuffing does not count', () => {
  const full = SP.policyHeuristic(POLICY);
  assert.equal(full.coverage, 1);
  const stuffed = SP.policyHeuristic('receipt approval software travel gift card personal split approval receipt policy $ days owner');
  assert.ok(stuffed.coverage <= 2 / 6, `stuffed ${stuffed.coverage}`);
  const vague = SP.policyHeuristic('Please be careful with company money and use good judgment when you buy things for work.');
  assert.equal(vague.coverage, 0);
});

test('stack: trials convert unless cancelled; leavers leave zombie seats; audit finds them; annual prepay renews', () => {
  const s = company(12, { name: 'Stack' });
  SP.setPlan(s, 'free');
  s.apps.people = { members: [{ id: 'a', name: 'A', kind: 'employee', status: 'active', startDay: 0 }, { id: 'b', name: 'B', kind: 'employee', status: 'active', startDay: 0 }] };
  advance(s, 2, SUB);
  const ws = s.recurring.find((r) => /google workspace/i.test(r.vendor));
  assert.equal(ws.seats, 3, 'a seat per person');
  s.apps.people.members[1].status = 'gone';
  advance(s, 1, SUB);
  const row = SP.stackRows(s).find((r) => r.id === ws.id);
  assert.equal(row.zombie, 1, 'seat stays after the leaver');
  const saved = SP.removeSeats(s, ws.id);
  assert.ok(saved > 0 && ws.seats === 2);
  // A trial converts on day 14 unless cancelled.
  const sp = SP.ensureSpend(s);
  sp.trials.push({ id: 'trial_x', vendor: 'Motion', plan: 'Pro AI', amount: 29, cls: 'planner', category: 'software', startDay: s.day, convertDay: s.day + 14, by: 'you', status: 'trial' });
  sp.trials.push({ id: 'trial_y', vendor: 'Otter.ai', plan: 'Pro', amount: 16.99, cls: 'notetaker', category: 'software', startDay: s.day, convertDay: s.day + 14, by: 'you', status: 'trial' });
  SP.cancelTrial(s, 'trial_y');
  advance(s, 15, SUB);
  assert.ok(s.recurring.some((r) => r.vendor === 'Motion' && r.creep), 'uncancelled trial converted');
  assert.ok(!s.recurring.some((r) => r.vendor === 'Otter.ai'), 'cancelled trial did not');
  // Annual prepay: charged now at a discount, renews in a year, not billed monthly.
  const claude = s.recurring.find((r) => /claude max/i.test(r.vendor));
  const amt = SP.moveToAnnual(s, claude.id);
  assert.ok(Math.abs(amt - 100 * 12 * (1 - SP.SPEND.annualDiscount)) < 0.01);
  const n0 = s.bank.txns.filter((t) => t.counterparty === claude.vendor).length;
  advance(s, 60, SUB);
  assert.equal(s.bank.txns.filter((t) => t.counterparty === claude.vendor).length, n0, 'no monthly charges on an annual plan');
});

test('CPA quote bills for card charges with no receipt', () => {
  const s = company(14, { name: 'Cpa' });
  s.company.incorporated = true; s.company.entity = 'ccorp';
  advance(s, 70, SUB);
  for (let i = 0; i < 10; i++) post(s, { amount: -50, counterparty: `Shop ${i}`, category: 'other', method: 'card' });
  SP.spendDay(s);
  const y = Number(s.startDate.slice(0, 4));
  const q = cpaQuote(s, y);
  assert.ok(q.noReceipt >= 10 && q.receipts === q.noReceipt * 12, `${q.noReceipt} missing, $${q.receipts}`);
  assert.ok(q.fee >= q.base + q.receipts);
});

// ---------------------------------------------------------------------------------------------------------
// Treasury auto-transfer rules
// ---------------------------------------------------------------------------------------------------------

test('treasury rule: two transfers out per month, 7 days apart, skipped (not partial) when underfunded', () => {
  const s = company(21, { cash: 400000, customers: 0, name: 'Treas' });
  s.bank.accounts.push({ id: 'treasury', name: 'Treasury', type: 'treasury', balance: 0 });
  const t = TR.ensureTreasury(s);
  Object.assign(t, { enabled: true, min: 40000, max: 60000 });
  const bank = APPS.find((a) => a.id === 'bank');
  bank.onDay(s);
  const chk = () => s.bank.accounts.find((a) => a.id === 'checking').balance;
  assert.ok(Math.abs(chk() - 60000) < 1, 'swept down to the max');
  post(s, { amount: -30000, counterparty: 'X', category: 'other' }); // checking 30k < 40k
  bank.onDay(s);
  assert.equal(t.redemptions.length, 1);
  advance(s, 2, SUB);
  post(s, { amount: -30000, counterparty: 'X', category: 'other' });
  bank.onDay(s); // only 2 days later: too soon
  assert.equal(t.redemptions.length, 1, 'seven-day spacing');
  assert.ok(t.skips.length >= 1);
  assert.throws(() => TR.transferTreasury(s, 1000, false), /days apart/);
  // Underfunded: the rule needs more than Treasury holds → skipped entirely, with an email.
  const s2 = company(22, { cash: 300000, customers: 0, name: 'Treas2' });
  s2.bank.accounts.push({ id: 'treasury', name: 'Treasury', type: 'treasury', balance: 0 });
  Object.assign(TR.ensureTreasury(s2), { enabled: true, min: 50000, max: 280000 });
  TR.transferTreasury(s2, 20000, true); // Treasury 20k
  post(s2, { amount: -260000, counterparty: 'Y', category: 'other' }); // checking 20k, needs 30k
  TR.treasuryRuleDay(s2);
  assert.equal(TR.ensureTreasury(s2).redemptions.length, 0, 'no partial refill');
  assert.equal(TR.ensureTreasury(s2).skips.at(-1).why, 'underfunded');
  assert.ok(s2.mail.threads.some((th) => /Auto-transfer rule skipped/.test(th.subject)));
});

// ---------------------------------------------------------------------------------------------------------
// 13-week forecast
// ---------------------------------------------------------------------------------------------------------

function forecastWorld(seed) {
  const s = company(seed, { cash: 150000, customers: 0, name: `Fc${seed}` });
  s.founder.salary = 6000;
  for (let i = 0; i < 40; i++) { const c = createCustomer(s, { name: `A${i}`, email: `a${i}@x.com`, country: 'US' }); subscribe(s, c.id, i % 4 === 0 ? { id: 'y', price: 1500, interval: 'year', trialDays: 0 } : { id: 'p', price: 99, interval: 'month', trialDays: 0 }); }
  const ads = () => post(s, { amount: -900, counterparty: 'Google Ads', description: 'GOOGLE *ADS', category: 'advertising', method: 'card' });
  for (let d = 1; d <= 290; d++) { advance(s, 1, SUB); if (d % 7 === 0) ads(); }
  return { s, ads };
}

test('forecast tiers: line items with known hires and renewal lumps beat extending last month, which beats the traps', () => {
  const tiers = ['stellar', 'good', 'average', 'mediocre'];
  const err = Object.fromEntries(tiers.map((t) => [t, []]));
  for (let seed = 1; seed <= 4; seed++) {
    const { s, ads } = forecastWorld(seed);
    const f = FC.ensureForecast(s);
    const hire = [{ label: 'Engineer', monthlyCost: 12000, startWeek: 3 }];
    const sets = {
      stellar: ['line_items', { hires: hire }],
      good: ['line_items', { hires: hire, includeAnnual: false, includePayroll: false }],
      average: ['quick', null],
      mediocre: ['line_items', { receivablesAsCash: true, includeAnnual: false, newMrr: FC.defaultAssumptions(s).newMrr * 3 + 1500 }],
    };
    const ids = {};
    for (const [t, [method, a]] of Object.entries(sets)) { f.assumptions = a; ids[t] = FC.saveSnapshot(s, method).id; }
    f.assumptions = null;
    for (let d = 1; d <= 91; d++) {
      advance(s, 1, SUB);
      if (d % 7 === 0) ads();
      // The planned hire really starts in week 3 and is paid on the 15th and the last day.
      const dom = (k) => new Date(Date.parse(`${s.startDate}T12:00:00Z`) + k * 864e5).getUTCDate();
      if (d >= 21 && (dom(s.day) === 15 || dom(s.day + 1) === 1)) post(s, { amount: -6000, counterparty: 'Gusto', category: 'payroll', method: 'payroll' });
    }
    for (const t of tiers) err[t].push(f.snapshots.find((x) => x.id === ids[t]).err13);
  }
  const e = tiers.map((t) => mean(err[t]));
  assert.ok(e[0] < e[1] && e[1] < e[2] && e[2] < e[3], `13-week error ${e.map((x) => x.toFixed(1)).join(' < ')}`);
  assert.ok(e[0] <= 12, `stellar within ~10% (${e[0].toFixed(1)})`);
  assert.ok(e[3] >= 40, `mediocre 40%+ (${e[3].toFixed(1)})`);
});

test('forecast: scenarios order sensibly; runwayMonthsForecast is readable and cached; triggers fire and are checked', () => {
  const s = company(31, { cash: 90000, customers: 10, name: 'Scen' });
  s.founder.salary = 12000;
  advance(s, 95, SUB);
  const sc = FC.scenarios(s);
  const r = (k) => (Number.isFinite(sc[k].runwayMonths) ? sc[k].runwayMonths : 99);
  assert.ok(r('hire') < r('base'), 'a hire shortens runway');
  assert.ok(r('lose_top') <= r('base'), 'losing the top customer cannot lengthen runway');
  assert.ok(r('slow_sales') <= r('base'));
  const m = FC.runwayMonthsForecast(s);
  assert.ok(Number.isFinite(m) && m > 0, `runway ${m}`);
  assert.equal(FC.runwayMonthsForecast(s), m);
  // Trigger: start the raise when runway < 99 months fires on the next weekly check; nobody raises → ignored + mistake.
  FC.addTrigger(s, { kind: 'start_raise', threshold: 99 });
  advance(s, 7, SUB);
  const t = FC.ensureForecast(s).triggers[0];
  assert.equal(t.status, 'fired');
  advance(s, 35, SUB);
  assert.equal(t.status, 'ignored');
  assert.ok(s.mistakes.some((x) => x.functionId === 'cash_runway' && x.id === 'wait_for_round'));
  // Raise start records runway for the fundraising leverage read.
  s.apps.fundraising = { raise: { id: 'r1', stage: 'pre-seed', startDay: s.day, status: 'active' }, rounds: [] };
  APPS.find((a) => a.id === 'bank').onDay(s);
  assert.ok(FC.ensureForecast(s).raiseStarts.r1.runway > 0);
});

test('running down to <4 months with no plan is logged; the cash reader separates a forecaster from a non-forecaster', () => {
  const play = (forecaster) => {
    const s = company(41, { cash: 30000, customers: 5, name: 'Low' });
    s.founder.salary = 6000;
    if (forecaster) FC.addTrigger(s, { kind: 'cut_plan', threshold: 6 });
    for (let d = 1; d <= 120; d++) {
      advance(s, 1, SUB);
      if (forecaster && d % 7 === 0) { FC.saveSnapshot(s, 'line_items'); if (FC.ensureForecast(s).triggers[0]?.status === 'fired') s.founder.salary = 0; }
    }
    return s;
  };
  const blind = play(false);
  const careful = play(true);
  assert.ok(blind.mistakes?.some((m) => m.id === 'wait_for_round'), 'unplanned low runway logged');
  assert.ok(!careful.mistakes?.some((m) => m.id === 'wait_for_round' && m.label.startsWith('Ran down')), 'not for the forecaster');
  const a = readOperator(careful, 'cash_runway'), b = readOperator(blind, 'cash_runway');
  assert.notEqual(b.tier, 'unknown');
  assert.ok(a.score > b.score, `${a.tier} ${a.score} vs ${b.tier} ${b.score}`);
  assert.ok(b.coaching.length > 0);
});

test('bank views render (cards, receipts, stack, forecast, treasury) without a DOM', async () => {
  const { cardsView, receiptsView, stackView } = await import('../public/apps/money/view-spend.js');
  const { forecastView } = await import('../public/apps/money/view-forecast.js');
  const s = company(51, { name: 'Views' });
  SP.setPlan(s, 'plus'); SP.connectInbox(s);
  SP.issueCard(s, { name: 'Ads', limit: 500, category: 'advertising' });
  s.apps.people = { members: [{ id: 'm1', name: 'Alex', kind: 'employee', status: 'active', startDay: 0 }] };
  SP.savePolicy(s, { text: POLICY, agent: true });
  advance(s, 40, SUB);
  post(s, { amount: -120, counterparty: 'Google Ads', category: 'advertising', method: 'card' });
  SP.spendDay(s);
  SP.runAudit(s);
  FC.saveSnapshot(s, 'line_items');
  FC.addTrigger(s, { kind: 'start_raise', threshold: 9 });
  for (const v of [cardsView(s), receiptsView(s), stackView(s), forecastView(s)]) {
    const out = String(v);
    assert.ok(out.length > 500 && !/undefined|NaN/.test(out.replace(/data-[a-z]+="[^"]*"/g, '')), out.match(/.{60}(undefined|NaN).{60}/)?.[0]);
  }
});
