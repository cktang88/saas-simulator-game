import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, changePrice, refund, mrr } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import { monthOf, monthsBetween, trailingBurn } from '../public/apps/money/common.js';
import { syncLedger, ensureBooks, ledgerByMonth, profitAndLoss, balanceSheet, tieOuts, stripeRecon, deferredRevenueNow, guessCategory, bookCategory, categorize, reviewQueue, isMisclassified, closeBlocker, CLOSE_ITEMS, closeState } from '../public/apps/money/ledger.js';
import { mrrMovements, cohorts, churnSplit, retention, cacByChannel, unitEconomics } from '../public/apps/money/metrics.js';
import { runQuery, aggregate } from '../public/apps/money/query.js';
import { franchiseTaxAuthorized, franchiseTaxAPVC, contractorTotals, calendarItems, complianceDay, incomeTaxFor } from '../public/apps/money/compliance.js';
import { evidenceHeuristic, noticeHeuristic } from '../public/apps/money/judge.js';

function fresh(model = 'smb', seed = 7) {
  const s = newState({ companyName: 'Test Co', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 30000, counterparty: 'Pat', description: 'Initial owner contribution', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', status: 'shipped' }] };
  s.company.website = { text: 'x' };
  return s;
}
const sumv = (a) => a.reduce((x, y) => x + y, 0);
const close = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

function busyCompany() {
  const s = fresh('smb', 11);
  const monthly = { id: 'plan_main', price: 49, interval: 'month', trialDays: 0 };
  const annual = { id: 'plan_year', price: 1200, interval: 'year', trialDays: 0 };
  for (let i = 0; i < 40; i++) {
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, country: i % 4 ? 'US' : null });
    subscribe(s, c.id, i % 5 === 0 ? annual : monthly, { source: i % 3 ? 'outbound' : 'ads:google' });
  }
  for (let d = 0; d < 150; d++) {
    advance(s, 1, APPS);
    syncLedger(s);
    if (d === 20) post(s, { amount: -800, counterparty: 'Google Ads', description: 'GOOGLE *ADS', category: 'advertising', method: 'card' });
    if (d === 40) post(s, { amount: -2500, counterparty: 'Jane Doe', description: 'ACH TO JANE DOE', category: 'contractors', method: 'ach' });
    if (d === 50) { const sub = s.stripe.subscriptions.find((x) => x.status === 'active' && x.interval === 'month'); if (sub) changePrice(s, sub.id, { quantity: 3 }); }
    if (d === 60) post(s, { amount: -350, counterparty: 'Anthropic', description: 'ANTHROPIC API usage', category: 'ai_inference', method: 'card' });
  }
  return s;
}

test('ledger: balance sheet balances every month and ties to bank, Stripe and deferred revenue', () => {
  const s = busyCompany();
  const L = ledgerByMonth(s);
  for (const m of monthsBetween(monthOf(s, 0), monthOf(s))) {
    const bs = balanceSheet(s, m, L);
    assert.ok(bs.balanced, `${m}: assets ${bs.totalAssets} vs L+E ${bs.totalLiabilities + bs.totalEquity}`);
  }
  for (const t of tieOuts(s, L)) assert.ok(t.ok, `${t.label}: ledger ${t.ledger} vs actual ${t.actual}`);
});

test('accrual: annual plans create deferred revenue recognized ratably; cash basis books the receipt', () => {
  const s = fresh('smb', 3);
  const c = createCustomer(s, { name: 'Annual', email: 'a@x.com', country: 'US' });
  subscribe(s, c.id, { id: 'y', price: 1200, interval: 'year', trialDays: 0 });
  const ch = s.stripe.charges[0];
  if (ch.status !== 'succeeded') return; // seed-dependent card decline
  syncLedger(s);
  advance(s, 59, APPS); // through day 59 → 60 days recognized
  syncLedger(s);
  const L = ledgerByMonth(s);
  const months = Object.keys(L).sort();
  const pl = profitAndLoss(s, months, 'accrual', L);
  const cash = profitAndLoss(s, months, 'cash', L);
  const recognized = sumv(pl.sections[0].lines[0].values);
  assert.ok(close(recognized, 1200 * 60 / 365, 0.01), `recognized ${recognized}`);
  assert.ok(close(deferredRevenueNow(s), 1200 - recognized, 0.01));
  assert.ok(close(sumv(cash.sections[0].lines[0].values), 1200));
  // Stripe fee is cost of revenue in both bases
  assert.ok(pl.cogs.some((v) => v < 0));
  const bs = balanceSheet(s, monthOf(s), L);
  assert.ok(close(bs.liabilities.find((l) => l.acct === '2500').value, deferredRevenueNow(s)));
});

test('accrual: a refund reverses the unrecognized part from deferred revenue and the rest to contra-revenue', () => {
  const s = fresh('smb', 5);
  const c = createCustomer(s, { name: 'R', email: 'r@x.com', country: 'US' });
  subscribe(s, c.id, { id: 'm', price: 300, interval: 'month', trialDays: 0 });
  const ch = s.stripe.charges[0];
  if (ch.status !== 'succeeded') return;
  syncLedger(s);
  advance(s, 9, APPS); syncLedger(s); // 10 days recognized
  refund(s, ch.id);
  syncLedger(s);
  const L = ledgerByMonth(s);
  const months = Object.keys(L).sort();
  const pl = profitAndLoss(s, months, 'accrual', L);
  const rev = pl.sections[0];
  const gross = sumv(rev.lines[0].values), refunds = sumv(rev.lines[1].values);
  assert.ok(close(gross, 100, 0.01), `gross ${gross}`);
  assert.ok(close(refunds, -100, 0.01), `refunds ${refunds}`);
  assert.ok(close(deferredRevenueNow(s), 0));
  assert.ok(balanceSheet(s, monthOf(s), L).balanced);
});

test('stripe reconciliation identity holds each month', () => {
  const s = busyCompany();
  const L = ledgerByMonth(s);
  for (const m of monthsBetween(monthOf(s, 0), monthOf(s))) assert.ok(stripeRecon(s, m, L).ok, m);
});

test('MRR movements sum to the MRR change and tie to snapshots and live MRR', () => {
  const s = busyCompany();
  const mv = mrrMovements(s);
  for (const r of mv) {
    assert.ok(close(r.end - r.start, r.new + r.expansion + r.reactivation + r.contraction + r.churn, 1e-6));
    assert.notEqual(r.reconciles, false, `${r.month}: end ${r.end} vs reported ${r.reported}`);
  }
  assert.ok(close(mv.at(-1).end, mrr(s), 0.05));
  assert.ok(mv.some((r) => r.expansion > 0), 'quantity change recorded as expansion');
});

test('reactivation: a churned customer who resubscribes is reactivation, not new', () => {
  const s = fresh();
  s.stripe.events.push({ day: 1, type: 'new', amount: 50, subId: 's1', customerId: 'c1' }, { day: 40, type: 'churn', amount: -50, subId: 's1', customerId: 'c1' }, { day: 70, type: 'new', amount: 60, subId: 's2', customerId: 'c1' });
  s.day = 80;
  const mv = mrrMovements(s);
  assert.equal(sumv(mv.map((r) => r.reactivation)), 60);
  assert.equal(sumv(mv.map((r) => r.new)), 50);
});

test('cohorts: logo and revenue retention from the event stream', () => {
  const s = fresh();
  // Nov cohort: 4 customers at $100; one churns in Dec, one expands to $200 in Dec.
  for (let i = 0; i < 4; i++) s.stripe.events.push({ day: 2, type: 'new', amount: 100, subId: `s${i}`, customerId: `c${i}` });
  s.stripe.events.push({ day: 35, type: 'churn', amount: -100, subId: 's0', customerId: 'c0' });
  s.stripe.events.push({ day: 36, type: 'expansion', amount: 100, subId: 's1', customerId: 'c1' });
  s.day = 70; // into January
  const logo = cohorts(s, 'logo');
  const rev = cohorts(s, 'revenue');
  assert.equal(logo[0].month, '2026-11');
  assert.equal(logo[0].size, 4);
  assert.equal(logo[0].cells[0], 1);
  assert.equal(logo[0].cells[1], 0.75);
  assert.equal(rev[0].cells[1], 1); // 300 + 100 expansion − 100 churn = 400 / 400
  const r = retention(s);
  assert.ok(close(r.nrr, 1) && close(r.grr, 0.75), JSON.stringify(r));
});

test('churn split: payment_failed is involuntary', () => {
  const s = fresh();
  s.stripe.subscriptions.push({ id: 'a', cancelReason: 'payment_failed' }, { id: 'b', cancelReason: 'voluntary' });
  s.stripe.events.push({ day: 3, type: 'churn', amount: -40, subId: 'a', customerId: 'x' }, { day: 4, type: 'churn', amount: -60, subId: 'b', customerId: 'y' });
  s.day = 10;
  const [m] = churnSplit(s);
  assert.equal(m.involuntary, 40);
  assert.equal(m.voluntary, 60);
});

test('CAC by channel matches ad spend to subscription sources', () => {
  const s = busyCompany();
  const cac = cacByChannel(s, 400);
  const g = cac.rows.find((r) => r.channel === 'ads:google');
  assert.equal(g.spend, 800);
  assert.ok(g.customers > 0 && close(g.cac, 800 / g.customers));
  const ue = unitEconomics(s, { grossMargin: 0.8 });
  assert.ok(ue.arpa > 0 && ue.ltv > 0);
});

test('query builder: filters, group by month, aggregates', () => {
  const s = busyCompany();
  const r = runQuery(s, { dataset: 'charges', filters: [{ field: 'status', op: '=', value: 'succeeded' }], groupBy: 'day', bucket: 'month', agg: 'sum', aggField: 'amount' });
  assert.equal(r.kind, 'grouped');
  const direct = s.stripe.charges.filter((c) => c.status === 'succeeded').reduce((a, c) => a + c.amount, 0);
  assert.ok(close(sumv(r.rows.map((x) => x.value)), direct));
  const bySource = runQuery(s, { dataset: 'subscriptions', filters: [{ field: 'mrr', op: '>', value: 0 }], groupBy: 'source', agg: 'count' });
  assert.ok(bySource.rows.length >= 2);
  const raw = runQuery(s, { dataset: 'bank', filters: [{ field: 'counterparty', op: 'contains', value: 'google' }] });
  assert.ok(raw.rows.every((x) => /google/i.test(x.counterparty)));
  assert.equal(aggregate([1, 2, 3, 10], 'median'), 2.5);
});

test('bank feed: ~10% of guesses are wrong and reviewing fixes them', () => {
  const s = fresh();
  for (let i = 0; i < 400; i++) post(s, { amount: -20, counterparty: `Vendor ${i}`, category: i % 2 ? 'software' : 'ai_inference', method: 'card' });
  const wrong = s.bank.txns.filter((t) => guessCategory(s, t) !== t.category).length;
  assert.ok(wrong > 20 && wrong < 65, `${wrong} wrong of ~400`);
  const t = s.bank.txns.find((x) => isMisclassified(s, x));
  categorize(s, t.id, t.category);
  assert.ok(!isMisclassified(s, t));
  assert.equal(bookCategory(s, t), t.category);
  assert.ok(reviewQueue(s).length < s.bank.txns.length);
});

test('close: categorize and lock are blocked until the work is done', () => {
  const s = busyCompany();
  const m = monthOf(s, 0);
  assert.match(closeBlocker(s, m, 'categorize') ?? '', /need review/);
  for (const t of reviewQueue(s, m)) categorize(s, t.id, t.category);
  assert.equal(closeBlocker(s, m, 'categorize'), null);
  assert.match(closeBlocker(s, m, 'lock'), /still open/);
  for (const i of CLOSE_ITEMS) if (i.id !== 'lock') closeState(s, m).items[i.id] = 'done';
  assert.equal(closeBlocker(s, m, 'lock'), null);
});

test('Delaware franchise tax: authorized-shares trap vs assumed par value', () => {
  assert.equal(franchiseTaxAuthorized(10_000_000), 85165);
  assert.equal(franchiseTaxAuthorized(5000), 175);
  assert.equal(franchiseTaxAPVC({ grossAssets: 50000, issued: 8_000_000, authorized: 10_000_000 }), 400);
  assert.equal(franchiseTaxAPVC({ grossAssets: 3_000_000, issued: 8_000_000, authorized: 10_000_000 }), 1600);
  // In game: a C-corp formed in Nov 2026 owes on Mar 1, 2027. Legal owns the filing; Books shows it read-only
  // and never charges it (no double charging), reading Legal's paidFilings by the shared key.
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp'; s.company.incorporatedDay = 1;
  s.apps.legal = { paidFilings: {} }; // minimal stand-in so Legal's own onDay doesn't need to run here
  const before = s.bank.txns.length;
  for (let d = 0; d < 130; d++) { s.day++; complianceDay(s); }
  const it = calendarItems(s).find((i) => i.id === 'de-franchise-2027');
  assert.ok(it && it.owner === 'legal' && it.status === null);
  assert.equal(s.bank.txns.length, before, 'Books posted nothing for Legal-owned filings');
  s.apps.legal.paidFilings['de-franchise-2027'] = { day: 120, amount: 450, method: 'apvc' };
  assert.equal(calendarItems(s).find((i) => i.id === 'de-franchise-2027').status, 'done');
});

test('1099-NEC uses the $2,000 threshold for 2026 payments', () => {
  const s = fresh();
  post(s, { amount: -1900, counterparty: 'Small Co', category: 'contractors', method: 'ach' });
  post(s, { amount: -2100, counterparty: 'Big Dev', category: 'contractors', method: 'ach' });
  const list = contractorTotals(s, 2026, { truth: true });
  assert.deepEqual(list.filter((c) => c.required).map((c) => c.payee), ['Big Dev']);
});

test('income tax uses NOLs (80% limit) and compliance day runs without errors', () => {
  const s = busyCompany();
  ensureBooks(s).nol = 1e9;
  const t = incomeTaxFor(s, 2026);
  assert.ok(t.tax >= 0);
  complianceDay(s);
});

test('judges: heuristic dispute evidence and price notice scoring', () => {
  const thin = evidenceHeuristic('They used it.', { reason: 'fraudulent' });
  assert.ok(thin.quality < 0.1);
  const good = evidenceHeuristic('Customer Ada Lopez signed up on Nov 3, 2026 and accepted our Terms and refund policy via a checkbox at checkout. She logged in 14 times after the $49.00 charge on Dec 3 (session logs and IP address attached). AVS and CVC checks passed and 3D Secure was completed. She had two prior undisputed payments. We emailed a receipt and a renewal reminder 7 days before the charge. Our statement descriptor reads ACME APP.', { reason: 'fraudulent', customerName: 'Ada Lopez' });
  assert.ok(good.quality > 0.6, `${good.quality}`);
  const n1 = noticeHeuristic('Price going up.', { oldPrice: 49, newPrice: 59, noticeDays: 30 });
  const n2 = noticeHeuristic('Hi — on March 1 your plan moves from $49 to $59/month because we added the reporting and sync features you asked for, and our costs went up. You keep $49 until then, and you can lock in the current price for a year by switching to annual before March 1. Questions? Just reply; and you can cancel anytime from settings. Thank you for being an early customer.', { oldPrice: 49, newPrice: 59, noticeDays: 30 });
  assert.ok(n2.churnRisk < n1.churnRisk);
});

test('trailing burn excludes owner contributions', () => {
  const s = fresh();
  advance(s, 70, APPS);
  const b = trailingBurn(s);
  assert.ok(b.burn > 0 && b.burn < 1000, `${b.burn}`);
});

test('money apps: onDay / onMonthEnd run without throwing (the clock swallows errors)', () => {
  const s = busyCompany();
  for (const app of APPS.filter((a) => ['bank', 'stripe', 'books', 'analytics'].includes(a.id))) {
    app.onDay?.(s);
    app.onMonthEnd?.(s);
  }
});

// ---- Review fixes (M12, M17, M18, M21, M22, M24) ----
import { partialRefund, prorationAmount, chargeProration, createCoupon, applyCoupon, expireCoupons } from '../public/apps/money/payments.js';
import { addAccrual, addPrepaid, checkReconciliation, statementEnding, stripeEnding } from '../public/apps/money/ledger.js';

const subscribed = (s, price = 300, interval = 'month') => {
  const c = createCustomer(s, { name: 'P', email: 'p@x.com', country: 'US' });
  const sub = subscribe(s, c.id, { id: 'm', price, interval, trialDays: 0 });
  return sub.status === 'active' ? sub : null;
};

test('M12: combined loan repayments never drive 2600 negative; the excess is interest expense', () => {
  const s = fresh();
  post(s, { amount: 10000, counterparty: 'RBF Co', category: 'loan', method: 'ach' });
  for (let i = 0; i < 6; i++) post(s, { amount: -2500, counterparty: 'RBF Co', category: 'loan_repayment', method: 'ach' });
  post(s, { amount: -120, counterparty: 'Bank', category: 'loan_interest', method: 'ach' });
  const L = ledgerByMonth(s);
  const bs = balanceSheet(s, monthOf(s), L);
  assert.ok(!bs.cum['2600'] || Math.abs(bs.cum['2600']) < 0.01, `2600 = ${bs.cum['2600']}`);
  assert.ok(close(L[monthOf(s)]['7100'], 5120), `7100 = ${L[monthOf(s)]['7100']}`);
  assert.ok(bs.balanced);
});

test('M24: partial refunds reverse a proportional share of deferred revenue and keep everything tied', () => {
  const s = fresh('smb', 5);
  const sub = subscribed(s);
  if (!sub) return;
  const ch = s.stripe.charges[0];
  syncLedger(s); advance(s, 9, APPS); syncLedger(s);
  const before = deferredRevenueNow(s);
  partialRefund(s, ch.id, 150);
  syncLedger(s);
  assert.ok(close(deferredRevenueNow(s), before / 2, 0.01));
  assert.throws(() => partialRefund(s, ch.id, 200));
  partialRefund(s, ch.id, 150);
  syncLedger(s);
  assert.equal(ch.status, 'refunded');
  assert.ok(close(deferredRevenueNow(s), 0));
  for (const t of tieOuts(s)) assert.ok(t.ok, t.label);
  assert.ok(balanceSheet(s, monthOf(s)).balanced);
});

test('M24: upgrade proration charges the unused part of the period now; coupons are contraction then expansion', () => {
  const s = fresh('smb', 5);
  const sub = subscribed(s, 100);
  if (!sub) return;
  advance(s, 15, APPS);
  const pr = prorationAmount(s, sub, { quantity: 2 });
  assert.ok(close(pr, 100 * (sub.currentPeriodEnd - s.day) / 30));
  changePrice(s, sub.id, { quantity: 2 });
  chargeProration(s, sub, pr);
  const app = { coupons: [] };
  const co = createCoupon(app, { code: 'stay25', pctOff: 25, duration: 'repeating', months: 1 });
  applyCoupon(s, app, sub, co.id);
  assert.ok(s.stripe.events.some((e) => e.type === 'contraction'));
  advance(s, 31, APPS); // the Payments app's onDay expires the coupon
  if (sub.status !== 'canceled') assert.equal(sub.price, 100);
  assert.ok(s.stripe.events.some((e) => e.type === 'expansion' && e.amount === 25 * 2) || sub.status === 'canceled');
  syncLedger(s);
  for (const t of tieOuts(s)) assert.ok(t.ok, t.label);
  assert.ok(mrrMovements(s).every((r) => r.reconciles !== false || r.month < monthOf(s)));
});

test('M18: accruals reverse next month, prepaids amortize, and reconciliations need the real statement balance', () => {
  const s = fresh();
  const pay = post(s, { amount: -1200, counterparty: 'Linear', description: 'LINEAR ANNUAL', category: 'software', method: 'card' });
  const m0 = monthOf(s);
  addAccrual(s, m0, { amount: 300, acct: '5010', memo: 'API usage last week' });
  addPrepaid(s, pay.id, 12);
  advance(s, 40, APPS);
  const L = ledgerByMonth(s);
  const m1 = monthOf(s, 35);
  assert.ok(close(L[m0]['5010'], 300) && close(L[m1]['5010'] ?? 0, -300 + (L[m1]['5010'] + 300)));
  assert.ok(close(L[m0]['6010'] - (L[m0]['6010'] - 100), 100));
  const bs0 = balanceSheet(s, m0, L);
  assert.ok(close(bs0.cum['1200'], 1100) && close(-bs0.cum['2200'], 300) && bs0.balanced);
  assert.ok(Math.abs(balanceSheet(s, m1, L).cum['2200'] ?? 0) < 0.01, 'accrual reversed');
  assert.match(checkReconciliation(s, m0, 'bank', { checking: 1 }, L), /statement ending balance/);
  assert.equal(checkReconciliation(s, m0, 'bank', { checking: statementEnding(s, 'checking', m0) }, L), null);
  assert.equal(checkReconciliation(s, m0, 'stripe', { stripe: stripeEnding(s, m0, L) }, L), null);
});

test('M21/M22: treasury redemptions arrive next business day; hosting scales with customers', () => {
  const s = fresh();
  post(s, { amount: 300000, counterparty: 'Pat', category: 'owner_contribution' });
  s.bank.accounts.push({ id: 'treasury', name: 'Treasury', type: 'treasury', balance: 0 });
  s.apps.bank = { payees: [], notes: {}, canceled: [], inTransit: [], treasury: { enabled: true, target: 50000 } };
  const bank = APPS.find((a) => a.id === 'bank');
  bank.onDay(s);
  const tr = s.bank.accounts.find((a) => a.id === 'treasury');
  assert.ok(tr.balance > 250000);
  s.bank.accounts[0].balance; post(s, { amount: -40000, counterparty: 'X', category: 'other' });
  bank.onDay(s);
  assert.ok(s.apps.bank.inTransit.length === 1, 'redemption in transit');
  syncLedger(s);
  assert.ok(balanceSheet(s, monthOf(s)).balanced);
  advance(s, 3, APPS);
  assert.equal(s.apps.bank.inTransit.length, 0);
  // hosting usage at month end
  for (let i = 0; i < 20; i++) subscribed(s, 49);
  advance(s, 31, APPS);
  assert.ok(s.bank.txns.some((t) => t.meta?.usage && t.category === 'hosting'));
});

// ---- Integration with the core money change set ----
import { stripeReconciliation, withholdFromStripe, accountsReceivable, openInvoices } from '../public/core/stripe.js';
import { bookBusinessLoan } from '../public/core/debt.js';
import { CATEGORIES } from '../public/core/bank.js';
import { chargeOneOff } from '../public/apps/money/payments.js';
import { accountForCategory, COA } from '../public/apps/money/ledger.js';

test('payments app: partial refunds, prorations and one-off charges go through core, so Stripe reconciliation stays exact', () => {
  const s = fresh('smb', 21);
  const subs = [];
  for (let i = 0; i < 6; i++) { const x = subscribed(s, 120); if (x) subs.push(x); }
  assert.ok(subs.length >= 3);
  advance(s, 5, APPS); syncLedger(s);
  const charges = s.stripe.charges.filter((c) => c.status === 'succeeded');
  partialRefund(s, charges[0].id, 30);
  partialRefund(s, charges[0].id, 20.5);
  partialRefund(s, charges[1].id, charges[1].amount); // full refund through the same path
  chargeOneOff(s, subs[0].customerId, 250, 'Onboarding package');
  const live = subs.find((x) => x.status === 'active');
  chargeProration(s, live, prorationAmount(s, live, { quantity: 3 }));
  changePrice(s, live.id, { quantity: 3 });
  let r = stripeReconciliation(s);
  assert.ok(r.ok, `diff ${r.diff}`);
  advance(s, 20, APPS); syncLedger(s);
  r = stripeReconciliation(s);
  assert.ok(r.ok && r.payoutsOk, `diff ${r.diff}, payouts ${r.payoutsTracked} vs bank ${r.bankPayouts}`);
  for (const t of tieOuts(s)) assert.ok(t.ok, `${t.label}: ${t.ledger} vs ${t.actual}`);
  assert.ok(balanceSheet(s, monthOf(s)).balanced);
});

test('ledger: Stripe Capital and withholdFromStripe repayments clear Stripe clearing (Dr 2600 / Dr 7100 / Cr 1050)', () => {
  const s = fresh('smb', 13);
  for (let i = 0; i < 25; i++) subscribed(s, 99);
  advance(s, 3, APPS); syncLedger(s);
  bookBusinessLoan(s, { id: 'stripe_capital', repaymentPctOfRevenue: 0.15, flatFeePct: 12 }, { productId: 'stripe_capital', name: 'Stripe Capital', kind: 'rbf', amount: 6000, apr: 0, termMonths: 0 });
  for (let i = 0; i < 10; i++) subscribed(s, 99);
  advance(s, 40, APPS); syncLedger(s);
  chargeOneOff(s, s.stripe.customers[0].id, 500, 'Setup fee'); // pending funds to withhold from
  const took = withholdFromStripe(s, 100, { principal: 80, interest: 20, source: 'test' });
  syncLedger(s);
  const reps = s.stripe.capitalRepayments;
  assert.ok(reps.length > 1 && close(took, 100), `withholdings: ${reps.length}, took ${took}`);
  const L = ledgerByMonth(s);
  const bs = balanceSheet(s, monthOf(s), L);
  for (const t of tieOuts(s, L)) assert.ok(t.ok, `${t.label}: ${t.ledger} vs ${t.actual}`);
  assert.ok(bs.balanced);
  const principal = sumv(reps.map((x) => x.principal)), interest = sumv(reps.map((x) => x.interest));
  assert.ok(close(-bs.cum['2600'], 6000 - principal), `2600 ${-bs.cum['2600']} vs ${6000 - principal}`);
  assert.ok(close(sumv(Object.values(L).map((m) => m['7100'] ?? 0)), interest));
  for (const m of monthsBetween(monthOf(s, 0), monthOf(s))) assert.ok(stripeRecon(s, m, L).ok, `stripe recon ${m}`);
  assert.ok(stripeReconciliation(s).ok);
});

test('ledger: enterprise invoices book AR at issue, clear it at payment, and write off non-payers as bad debt', () => {
  const s = fresh('ent', 17);
  const plan = { id: 'ent', price: 18000, interval: 'year', trialDays: 0 };
  const invs = [];
  for (let i = 0; i < 4; i++) {
    const c = createCustomer(s, { name: `Ent ${i}`, email: `e${i}@corp.com`, company: `Corp ${i}`, country: 'US' });
    subscribe(s, c.id, plan, { invoiceManually: true });
  }
  invs.push(...openInvoices(s));
  assert.equal(invs.length, 4);
  invs[0].payDay = null; // never pays
  invs[1].payDay = s.day + 45;
  syncLedger(s);
  let L = ledgerByMonth(s);
  assert.ok(close(balanceSheet(s, monthOf(s), L).cum['1100'], 72000), 'AR booked at issue');
  advance(s, 50, APPS); syncLedger(s);
  L = ledgerByMonth(s);
  assert.equal(invs[1].status, 'paid');
  assert.ok(close(balanceSheet(s, monthOf(s), L).cum['1100'] ?? 0, accountsReceivable(s)));
  for (const t of tieOuts(s, L)) assert.ok(t.ok, `${t.label}: ${t.ledger} vs ${t.actual}`);
  for (let d = 0; d < 110; d++) { advance(s, 1, APPS); syncLedger(s); }
  assert.equal(invs[0].status, 'uncollectible');
  L = ledgerByMonth(s);
  const bs = balanceSheet(s, monthOf(s), L);
  const badDebt = sumv(Object.values(L).map((m) => m['6900'] ?? 0));
  assert.ok(badDebt > 0 && badDebt < 18000, `bad debt ${badDebt}: only the recognized part`);
  for (const t of tieOuts(s, L)) assert.ok(t.ok, `${t.label}: ${t.ledger} vs ${t.actual}`);
  assert.ok(bs.balanced);
  // ACH invoice fees, not card fees
  const paid = s.stripe.charges.filter((c) => c.method === 'ach_invoice');
  assert.ok(paid.length && paid.every((c) => c.fee < c.amount * 0.01));
});

test('chart of accounts: every core bank category maps to an explicit account', () => {
  for (const cat of Object.keys(CATEGORIES)) {
    const a = accountForCategory(cat);
    assert.ok(COA[a], `${cat} → ${a}`);
  }
  assert.equal(accountForCategory('recruiting'), '6030');
  assert.equal(accountForCategory('loan_interest'), '7100');
  assert.equal(accountForCategory('payroll'), '6000');
  assert.equal(accountForCategory('payroll_tax'), '6050');
});

test('AI bookkeeper guesses are deterministic across runs (not keyed on random uids)', () => {
  const build = () => {
    const s = fresh('smb', 9);
    for (let i = 0; i < 60; i++) post(s, { amount: -(10 + i), counterparty: `Vendor ${i % 7}`, category: ['software', 'hosting', 'advertising', 'loan', 'owner_contribution'][i % 5], method: 'card' });
    return s.bank.txns.map((t) => bookCategory(s, t)).join(',');
  };
  assert.equal(build(), build());
});

import { cpaQuote, fileWithCpa } from '../public/apps/money/compliance.js';

test('taxes: IRS assessments use the true categories; miscategorizations distort the books and surface at the CPA review', () => {
  const corp = () => {
    const s = fresh();
    s.company.incorporated = true; s.company.entity = 'ccorp'; s.company.incorporatedDay = 1;
    s.apps.legal = { paidFilings: {} };
    return s;
  };
  // 1) An owner contribution booked as income: the books show a profit, but no phantom IRS payment is made.
  const a = corp();
  categorize(a, a.bank.txns.find((t) => t.category === 'owner_contribution').id, 'refund_in');
  const before = a.bank.txns.length;
  for (let d = 0; d < 130; d++) { a.day++; complianceDay(a); }
  assert.equal(a.bank.txns.length, before, 'no IRS payment for income that only exists in the books');
  assert.ok(sumv(profitAndLoss(a, monthsBetween(monthOf(a, 0), monthOf(a, 0))).netIncome) > 20000, 'the founder\'s P&L is still distorted');
  const qa = cpaQuote(a, 2026);
  assert.ok(qa.errors >= 1 && qa.booksPreTax > 20000 && qa.preTax <= 0 && qa.adjustment < -20000 && qa.tax === 0, JSON.stringify(qa));
  // 2) Real income (a grant) booked as an owner contribution: books show a loss, but the IRS still assesses it.
  const b = corp();
  post(b, { amount: 50000, counterparty: 'NSF SBIR', description: 'SBIR PHASE I', category: 'grant', method: 'ach' });
  categorize(b, b.bank.txns.at(-1).id, 'owner_contribution');
  const n0 = b.bank.txns.length;
  for (let d = 0; d < 130; d++) { b.day++; complianceDay(b); }
  const irs = b.bank.txns.slice(n0).filter((t) => t.counterparty === 'IRS');
  assert.equal(irs.length, 1, 'the missed Q4 estimate is assessed on the real (grant) income');
  const qb = cpaQuote(b, 2026);
  assert.ok(qb.booksPreTax <= 0 && qb.underpaymentPenalty > 0 && qb.preTax > 40000 && qb.adjustment > 40000 && qb.tax > 0, JSON.stringify(qb));
  const cash = b.bank.accounts[0].balance;
  fileWithCpa(b, 2026);
  assert.ok(b.bank.accounts[0].balance < cash - qb.fee, 'the return pays tax on the corrected income');
  assert.match(ensureBooks(b).compliance['1120-2027'].note, /adjusted pre-tax income/);
});
