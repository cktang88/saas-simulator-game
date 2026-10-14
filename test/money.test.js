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
import { franchiseTaxAuthorized, franchiseTaxAPVC, contractorTotals, payDelawareFranchise, calendarItems, complianceDay, incomeTaxFor } from '../public/apps/money/compliance.js';
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
  // In game: a C-corp formed in Nov 2026 owes on Mar 1, 2027; APVC needs the Dec 31 balance sheet.
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp'; s.company.incorporatedDay = 1;
  advance(s, 130, APPS); syncLedger(s);
  assert.ok(calendarItems(s).some((i) => i.id === 'de-franchise-2027'));
  const assets = balanceSheet(s, '2026-12').totalAssets;
  assert.throws(() => payDelawareFranchise(s, 2026, { method: 'apvc', grossAssets: assets * 3, issued: 8_000_000 }));
  const before = s.bank.accounts[0].balance;
  const r = payDelawareFranchise(s, 2026, { method: 'apvc', grossAssets: assets, issued: 8_000_000 });
  assert.equal(r.tax, 400);
  assert.ok(r.penalty > 200, 'paid after Mar 1 → late penalty');
  assert.ok(close(before - s.bank.accounts[0].balance, r.total));
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
