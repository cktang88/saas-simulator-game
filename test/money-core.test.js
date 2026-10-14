// Core money realism fixes (docs/review/money.md M1–M23, docs/review/growth.md G3/G10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, balance, CATEGORIES, account } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, mrr, feeFor, achInvoiceFee, isBusinessDay, isBankHoliday, sendInvoiceReminder, instantPayout } from '../public/core/stripe.js';
import { ensureMarket, priceFactor, mainPlan } from '../public/core/market.js';
import { ensurePersonal, personalMonth, chargeFounderCard, cashAdvance, openPersonalCard, cardMinimum, startJobSearch, payFounder, hardPull } from '../public/core/personal.js';
import { applyForFinancing, ensureDebt, bookBusinessLoan, monthlyDebtService, capitalWithhold, lenderProfile } from '../public/core/debt.js';
import * as L from '../public/data/lenders.js';
import { PAYMENTS } from '../public/core/params.js';
import { dateOf, isoDate } from '../public/core/util.js';

function fresh(model = 'smb', seed = 42) {
  const s = newState({ companyName: 'Test Co', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 30000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', status: 'shipped' }] };
  s.company.website = { text: 'x' };
  return s;
}
const product = (id) => L.LENDER_PRODUCTS.find((p) => p.id === id);
const addPayers = (s, n, price = 100, opts = {}) => {
  for (let i = 0; i < n; i++) {
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, country: 'US' });
    subscribe(s, c.id, { id: 'p', price, interval: 'month', trialDays: 0 }, opts);
  }
};

test('M1: Stripe Capital funds the company bank and is repaid by withholding from Stripe payments, not upfront', () => {
  const s = fresh();
  const loan = bookBusinessLoan(s, product('stripe_capital'), { productId: 'stripe_capital', name: 'Stripe Capital', kind: 'rbf', amount: 10000, apr: 30, feePct: 12, termMonths: 12 });
  const proceeds = s.bank.txns.filter((t) => t.category === 'loan');
  assert.equal(proceeds.length, 1);
  assert.equal(proceeds[0].amount, 10000, 'full amount, no fee deducted upfront');
  assert.equal(ensurePersonal(s).liquidSavings, 0, 'nothing lands in the personal account');
  assert.equal(loan.totalRepay, 11200);
  s.day += 3; // withholding starts 1–2 business days after funding
  const w = capitalWithhold(s, 100, 'ch_x');
  assert.equal(w, 15);
  assert.equal(s.stripe.capitalRepayments.length, 1);
  const r = s.stripe.capitalRepayments[0];
  assert.ok(Math.abs(r.principal + r.interest - 15) < 0.011 && r.interest > 0);
  // Real charges are withheld before they reach pending.
  addPayers(s, 30);
  const withheld = s.stripe.charges.filter((c) => c.capitalWithheld > 0);
  assert.ok(withheld.length > 20);
  for (const c of withheld) {
    const pend = s.stripe.pending.find((p) => p.chargeId === c.id);
    assert.ok(Math.abs(pend.amount - (c.amount - c.fee - c.capitalWithheld)) < 0.011);
  }
  // Runway helper counts it.
  assert.ok(monthlyDebtService(s) > 0);
});

test('M1: Stripe Capital minimum: a 60-day shortfall below 1/18 of the total is debited from the bank with principal/interest split', () => {
  const s = fresh();
  bookBusinessLoan(s, product('stripe_capital'), { productId: 'stripe_capital', name: 'Stripe Capital', kind: 'rbf', amount: 18000, apr: 30, feePct: 12, termMonths: 12 });
  advance(s, 61, []);
  const prin = s.bank.txns.filter((t) => t.category === 'loan_repayment');
  const int = s.bank.txns.filter((t) => t.category === 'loan_interest');
  assert.equal(prin.length, 1);
  assert.equal(int.length, 1);
  assert.ok(Math.abs(-(prin[0].amount + int[0].amount) - 18000 * 1.12 / 18) < 0.02);
  assert.equal(CATEGORIES.loan_interest.kind, 'expense');
});

test('M1: RBF repays 8% of last month\'s gross monthly from the company bank; SBA amortizes with an upfront fee and interest split', () => {
  const s = fresh();
  addPayers(s, 50); // ~$5k/month gross
  const rbf = bookBusinessLoan(s, product('rbf_saas'), { productId: 'rbf_saas', name: 'RBF', kind: 'rbf', amount: 50000, apr: 30, feePct: 50, termMonths: 24 });
  assert.equal(rbf.totalRepay, 75000);
  assert.equal(s.bank.txns.filter((t) => t.category === 'loan_interest').length, 0, 'no upfront RBF fee');
  advance(s, 31, []);
  const pays = s.bank.txns.filter((t) => t.meta?.loanId === rbf.id && t.amount < 0);
  const paid = -pays.reduce((a, t) => a + t.amount, 0);
  const gross = s.stripe.charges.filter((c) => c.status !== 'failed' && c.day > s.day - 30).reduce((a, c) => a + c.amount, 0);
  assert.ok(paid > 0 && paid <= 0.08 * gross + 0.05 + 0.08 * 5000, `paid ${paid}`);
  const s2 = fresh();
  const sba = bookBusinessLoan(s2, product('sba_7a_small'), { productId: 'sba_7a_small', name: 'SBA 7(a)', kind: 'sba_7a', amount: 100000, apr: 10, feePct: 1.7, termMonths: 120 });
  const fee = s2.bank.txns.find((t) => t.category === 'loan_interest');
  assert.equal(fee.amount, -1700);
  advance(s2, 31, []);
  const prin = s2.bank.txns.filter((t) => t.meta?.loanId === sba.id && t.category === 'loan_repayment');
  const int = s2.bank.txns.filter((t) => t.meta?.loanId === sba.id && t.category === 'loan_interest' && !/upfront/.test(t.description));
  assert.equal(prin.length, 1);
  assert.ok(Math.abs(-int[0].amount - 100000 * 0.10 / 12) < 0.02);
  assert.ok(Math.abs(-(prin[0].amount + int[0].amount) - sba.payment) < 0.02);
});

test('M2: approval odds are probabilities and some applications are declined', () => {
  assert.equal(L.approvalProbability({ approvalOdds: 'high' }), 0.85);
  assert.equal(L.approvalProbability({ approvalOdds: 'low' }), 0.2);
  assert.equal(L.approvalLabel({ approvalOdds: 'medium' }), 'Medium odds');
  let declined = 0, funded = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = fresh('smb', seed);
    Object.assign(ensurePersonal(s), { fico: 690, job: 'full_time', incomeType: 'w2', annualIncome: 90000 });
    const p = product('pl_business_ok');
    const r = L.underwrite(lenderProfile(s), p);
    if (!r.approved) continue;
    applyForFinancing(s, p, r, 5000);
    advance(s, p.fundingDays + 1, []);
    const a = ensureDebt(s).applications[0];
    if (a.status === 'declined') declined++; else if (a.status === 'funded') funded++;
  }
  assert.ok(declined > 0 && funded > 0, `declined ${declined}, funded ${funded}`);
});

test('M3: a personal card is a payment method: no cash, founder-loan booking, capped cash advances, utilization hits FICO, minimum in DTI', () => {
  const s = fresh();
  const p = ensurePersonal(s);
  p.liquidSavings = 20000;
  p.existingCardLimit = 0; // isolate the new card's utilization
  const card = openPersonalCard(s, { productId: 'cc_personal_0apr', name: 'Reflect', amount: 10000, apr: 22, introAprMonths: 21 });
  assert.equal(p.liquidSavings, 20000, 'opening a card adds no cash');
  const before = balance(s);
  chargeFounderCard(s, 1200, 'Meta ads', { category: 'advertising' });
  assert.equal(balance(s), before, 'company cash unchanged: expense paid by the founder');
  const loanIn = s.bank.txns.filter((t) => t.category === 'loan' && t.description === 'Founder loan to company');
  assert.equal(loanIn.at(-1).amount, 1200);
  assert.equal(s.bank.txns.at(-1).category, 'advertising');
  assert.equal(card.balance, 1200);
  assert.throws(() => cashAdvance(s, card.id, 3000), /Cash advance limit/);
  const { fee } = cashAdvance(s, card.id, 1000);
  assert.equal(fee, 50);
  assert.equal(p.liquidSavings, 21000);
  chargeFounderCard(s, 5000, 'Vercel', { category: 'hosting' }); // utilization 72.5%
  assert.ok(cardMinimum(s, card) > 0.01 * 7250 + 20, 'cash advance accrues 29.99% from day one (purchases are at 0%)');
  const fico = p.fico;
  while (dateOf(s, s.day + 1).getUTCDate() !== 1) s.day++;
  s.day++;
  personalMonth(s);
  assert.ok(p.fico <= fico - 40, `utilization hit ${fico} → ${p.fico}`);
  assert.ok(cardMinimum(s, card) >= 35);
  assert.ok(p.monthlyDebtPayments >= p.otherDebtPayments + cardMinimum(s, card) - 0.01);
});

test('M4: missed payments cost realistic points, floor at 500 until charge-off, recover after clean months; job search takes 60–120 days', () => {
  const s = fresh();
  const p = ensurePersonal(s);
  Object.assign(p, { fico: 720, liquidSavings: -5000, monthlyLivingCosts: 3500, otherDebtPayments: 300, job: 'quit', existingCardLimit: 0 });
  const toFirst = () => { while (dateOf(s, s.day).getUTCDate() !== 1) s.day++; personalMonth(s); s.day++; };
  toFirst();
  assert.equal(p.fico, 640, '720 → first 30-day late −80');
  toFirst();
  assert.equal(p.fico, 625);
  assert.ok(p.jobSearch, 'forced job search started');
  const days = p.jobSearch.offerDay - p.jobSearch.startDay;
  assert.ok(days >= 60 && days <= 120, `${days}`);
  assert.equal(p.job, 'quit', 'no instant job');
  for (let i = 0; i < 2; i++) toFirst();
  assert.ok(p.fico >= 500);
  p.liquidSavings = 1e6; // recovered
  const low = p.fico;
  for (let i = 0; i < 6; i++) toFirst();
  assert.equal(p.fico, low, 'no recovery before 6 clean months');
  for (let i = 0; i < 4; i++) toFirst();
  assert.ok(p.fico > low && p.fico < 720, `recovery ${low} → ${p.fico}`);
  // Job arrives eventually.
  const s2 = fresh();
  const js = startJobSearch(s2, 'full_time');
  advance(s2, js.offerDay - s2.day, []);
  assert.equal(ensurePersonal(s2).job, 'full_time');
});

test('M5: a C-corp founder is paid through payroll with employer taxes; an LLC takes a draw and pays 1040-ES estimates', () => {
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp';
  s.founder.salary = 4000;
  const before = ensurePersonal(s).liquidSavings;
  payFounder(s);
  const pay = s.bank.txns.filter((t) => t.meta?.founderPayroll);
  assert.equal(pay.find((t) => t.category === 'payroll').amount, -4000);
  const tax = pay.find((t) => t.category === 'payroll_tax').amount;
  assert.ok(Math.abs(-tax - (4000 * 0.0765 + 4000 * 0.006 + 4000 * 0.027)) < 0.02);
  assert.ok(pay.some((t) => t.counterparty === 'Gusto' && t.category === 'software'));
  assert.ok(!s.bank.txns.some((t) => t.category === 'owner_draw'));
  assert.ok(Math.abs(ensurePersonal(s).liquidSavings - before - 4000 * (1 - 0.0765 - 0.12)) < 0.02);

  const l = fresh();
  l.company.incorporated = true; l.company.entity = 'llc';
  l.founder.salary = 3000;
  l.personal.liquidSavings = 50000;
  post(l, { amount: 20000, counterparty: 'Stripe', category: 'stripe_payout' });
  advance(l, 200, []);
  assert.ok(l.bank.txns.some((t) => t.category === 'owner_draw'));
  assert.ok(l.personal.txns.some((t) => /1040-ES/.test(t.description)), 'quarterly estimates paid personally');
});

test('M6: enterprise invoices are net-30 with ACH fees and pay late', () => {
  const s = fresh('ent');
  for (let i = 0; i < 40; i++) {
    const c = createCustomer(s, { name: `E${i}`, email: `e${i}@x.com`, country: 'US' });
    subscribe(s, c.id, { id: 'p', price: 18000, interval: 'year', trialDays: 0 }, { invoiceManually: true });
  }
  assert.equal(s.stripe.charges.length, 0, 'no same-day charge');
  assert.ok(Math.abs(mrr(s) - 40 * 1500) < 1);
  assert.ok(achInvoiceFee(s, 18000) < 18000 * 0.0075 + 0.01);
  sendInvoiceReminder(s, s.stripe.invoices[0].id);
  advance(s, 115, []);
  const paid = s.stripe.invoices.filter((i) => i.status === 'paid');
  assert.ok(paid.length >= 30, `${paid.length} paid`);
  const days = paid.map((i) => i.paidDay - i.issuedDay).sort((a, b) => a - b);
  const median = days[Math.floor(days.length / 2)];
  assert.ok(median >= 30 && median <= 60, `median DSO ${median}`);
  for (const ch of s.stripe.charges) assert.ok(ch.fee / ch.amount < 0.0075);
});

test('M7/M8: the card updater refreshes most expired cards; FX is only charged on non-USD charges', () => {
  const s = fresh();
  assert.equal(feeFor(s, 100, { country: 'INTL' }), +(100 * (0.029 + 0.007 + 0.015) + 0.3).toFixed(2));
  assert.ok(feeFor(s, 100, { country: 'INTL' }, 'eur') > feeFor(s, 100, { country: 'INTL' }));
  addPayers(s, 300, 49);
  for (const c of s.stripe.customers) c.card.expiresDay = s.day + 5; // all expire before renewal
  advance(s, 31, []);
  const renewals = s.stripe.charges.filter((c) => c.day > 0);
  const expiredFails = renewals.filter((c) => c.failureCode === 'expired_card').length;
  assert.ok(expiredFails / renewals.length < 0.35, `${expiredFails}/${renewals.length}`);
});

test('M9: payouts land on business days (no weekends or Fed holidays); first payout ≈ 7 days after the first charge; instant payout fee', () => {
  const s = fresh();
  assert.ok(isBankHoliday(s, Math.round((Date.parse('2026-11-26') - Date.parse('2026-11-02')) / 864e5)), 'Thanksgiving 2026');
  assert.ok(isBankHoliday(s, Math.round((Date.parse('2026-12-25') - Date.parse('2026-11-02')) / 864e5)));
  advance(s, 1, []); // Tue Nov 3
  addPayers(s, 5);
  for (let i = 0; i < 60; i++) { advance(s, 1, []); if (i % 3 === 0) addPayers(s, 2); }
  const payouts = s.bank.txns.filter((t) => t.category === 'stripe_payout');
  assert.ok(payouts.length > 10);
  for (const t of payouts) assert.ok(isBusinessDay(s, t.day), `payout on ${isoDate(s, t.day)}`);
  assert.ok(payouts[0].day - 1 >= 7 && payouts[0].day - 1 <= 9, `first payout after ${payouts[0].day - 1} days`);
  s.stripe.available = 1000;
  instantPayout(s, 1000);
  assert.equal(s.bank.txns.at(-1).amount, -15);
});

test('M10/M11: a dispute cancels the subscription and blocks the card; a failed first payment is incomplete, not MRR', () => {
  const s = fresh('b2c');
  addPayers(s, 1, 10);
  const sub = s.stripe.subscriptions[0];
  const ch = s.stripe.charges.find((c) => c.status === 'succeeded');
  if (ch) {
    s.stripe.disputes.push({ id: 'dp_1', chargeId: ch.id, customerId: ch.customerId, day: 1, amount: ch.amount, status: 'scheduled', reason: 'fraudulent' });
    advance(s, 1, []);
    assert.equal(sub.status, 'canceled');
    assert.equal(sub.cancelReason, 'disputed');
    assert.ok(s.stripe.customers[0].card.blocked);
  }
  const s2 = fresh('b2c');
  for (const c of [0]) void c;
  const cust = createCustomer(s2, { name: 'X', email: 'x@x.com', country: 'US' });
  cust.card.blocked = true; // forces the first payment to fail
  const sub2 = subscribe(s2, cust.id, { id: 'p', price: 10, interval: 'month', trialDays: 0 });
  assert.equal(sub2.status, 'incomplete');
  assert.equal(mrr(s2), 0);
  assert.ok(!s2.stripe.events.some((e) => e.subId === sub2.id));
});

test('M13/M23: personal-loan APR centers on Credible averages; hard pulls stop counting after 12 months', () => {
  const prof = { fico: 760, annualIncome: 120000, incomeType: 'w2', monthlyDebtPayments: 300, liquidSavings: 20000 };
  const r = L.underwrite(prof, product('pl_prime_online'));
  assert.ok(r.apr >= 10 && r.apr <= 15, `APR ${r.apr}`);
  const s = fresh();
  const p = ensurePersonal(s);
  p.liquidSavings = 1e6;
  const f0 = p.fico;
  hardPull(s, 'x');
  assert.equal(p.fico, f0 - 5);
  advance(s, 366, []);
  assert.ok(p.fico >= f0, `${p.fico} vs ${f0}`);
});

test('M14: applications stay pending until the product funds (SBA weeks, cards ~10 days)', () => {
  const s = fresh();
  const p = ensurePersonal(s);
  Object.assign(p, { fico: 780, job: 'full_time', incomeType: 'w2', annualIncome: 150000, liquidSavings: 1e5 });
  const prod = product('cc_personal_0apr');
  const r = L.underwrite(lenderProfile(s), prod);
  const app = applyForFinancing(s, prod, r, Math.min(r.maxAmount, 10000));
  assert.equal(app.status, 'pending');
  assert.equal(app.fundDay - s.day, 10);
  advance(s, 9, []);
  assert.equal(app.status, 'pending');
  assert.equal(p.cards.length, 0);
  advance(s, 2, []);
  assert.notEqual(app.status, 'pending');
  if (app.status === 'funded') assert.equal(p.cards.length, 1);
});

test('M15: before incorporation the business uses personal checking; Mercury opens 1–3 business days after incorporation', () => {
  const s = fresh();
  const acct = account(s, 'checking');
  assert.ok(acct.personal);
  assert.match(acct.name, /Personal checking/);
  advance(s, 5, []);
  s.company.incorporated = true; s.company.entity = 'ccorp';
  const day0 = s.day;
  advance(s, 8, []);
  assert.ok(!acct.personal);
  assert.match(acct.name, /Mercury/);
  assert.ok(acct.openedDay - day0 >= 1 && acct.openedDay - day0 <= 6);
  assert.equal(s.bank.txns.filter((t) => t.category === 'transfer').length, 2);
  assert.equal(s.bank.accounts[0].id, 'checking');
});

test('M16: recurring bills decline when checking cannot cover them; hosting gets suspended after 3 declines', () => {
  const s = fresh();
  post(s, { amount: -balance(s) + 10, counterparty: 'x', category: 'other' });
  advance(s, 40, []);
  assert.ok(balance(s) >= 0, 'bills did not overdraw the account');
  assert.ok((s.bank.declines ?? []).length >= 3);
  const vercel = s.recurring.find((r) => r.vendor === 'Vercel');
  advance(s, 10, []);
  assert.equal(vercel.suspended, true);
  assert.equal(s.market.modifiers.churn['hosting-suspended'], 1.5);
});

test('M19/G10/G3: enterprise default plan is ~$15k/yr at a neutral price factor; annual plans compare with annualized WTP', () => {
  const e = fresh('ent');
  assert.equal(mainPlan(e).price, 15000);
  assert.ok(Math.abs(priceFactor(e) - 1) < 0.01);
  const b = fresh('b2c');
  const monthly = priceFactor(b, { price: 9.99, interval: 'month' });
  const annual = priceFactor(b, { price: 59.99, interval: 'year' });
  assert.ok(annual < 1.3 && annual > 1, `annual pf ${annual}`);
  assert.ok(Math.abs(monthly - 1) < 0.01);
  // Plan mix: with a monthly + annual plan active, some self-serve trials land on annual.
  b.plans.push({ id: 'plan_annual', name: 'Pro annual', price: 59.99, interval: 'year', trialDays: 14, active: true });
  for (let i = 0; i < 200; i++) { const c = createCustomer(b, { name: 'u', email: 'u@x' }); subscribe(b, c.id, mainPlan(b), { trial: true }); }
  advance(b, 1, []);
  const ann = b.stripe.subscriptions.filter((x) => x.planId === 'plan_annual').length;
  assert.ok(ann > 40 && ann < 160, `${ann}/200 annual`);
});

test('M20: annual plans refund more often than monthly', () => {
  assert.ok(PAYMENTS.refundRateAnnual.b2c >= 0.04 && PAYMENTS.refundRateAnnual.b2c <= 0.076);
  assert.ok(PAYMENTS.refundRateAnnual.b2c > PAYMENTS.refundRate.b2c * 2);
});

import { refund as coreRefund, charge as coreCharge } from '../public/core/stripe.js';

test('core refund supports partial refunds; core charge books a one-off payment with the normal settlement', () => {
  const s = fresh();
  const c = createCustomer(s, { name: 'A', email: 'a@x.com', country: 'US' });
  const ch = coreCharge(s, c.id, { amount: 100, description: 'Proration' });
  assert.equal(ch.status, 'succeeded');
  assert.equal(ch.fee, +(100 * 0.036 + 0.3).toFixed(2));
  assert.ok(s.stripe.pending.some((p) => p.chargeId === ch.id && p.availableDay >= s.day + 2));
  assert.equal(coreCharge(s, c.id, { amount: 0.2 }), null);
  const r1 = coreRefund(s, ch.id, { amount: 30 });
  assert.ok(r1.partial && !r1.final);
  assert.equal(ch.status, 'succeeded');
  assert.throws(() => coreRefund(s, ch.id, { amount: 80 }), /up to 70/);
  const r2 = coreRefund(s, ch.id);
  assert.equal(r2.amount, 70);
  assert.ok(r2.final);
  assert.equal(ch.status, 'refunded');
  assert.equal(coreRefund(s, ch.id), null);
});

import { withholdFromStripe, subscriptionById } from '../public/core/stripe.js';
import { trialConversion } from '../public/core/market.js';

test('E2E: an overdrawn founder puts living costs on cards first, then looks for a job; recovers and returns to the startup', () => {
  const s = fresh();
  const p = ensurePersonal(s);
  Object.assign(p, { fico: 720, liquidSavings: 1000, monthlyLivingCosts: 3500, otherDebtPayments: 0, job: 'part_time', incomeType: 'w2', annualIncome: 30000, priorW2Income: 100000 });
  advance(s, 40, []);
  assert.ok(p.creditCardDebt > 0, 'shortfall carried on the everyday cards');
  assert.ok(p.liquidSavings >= -0.5, 'no indefinite negative cash while cards have room');
  assert.equal(p.missedMonths ?? 0, 0);
  advance(s, 260, []);
  assert.ok(p.jobSearch || p.job === 'full_time', 'part-time founder whose income does not cover costs is pushed to a full-time job');
  // Forced job, then recovery: the founder goes back full-time.
  const s2 = fresh();
  const p2 = ensurePersonal(s2);
  Object.assign(p2, { liquidSavings: -100, existingCardLimit: 0, otherDebtPayments: 200, priorW2Income: 120000 });
  advance(s2, 30, []);
  advance(s2, 130, []);
  assert.equal(p2.job, 'full_time');
  assert.equal(s2.founder.hoursPerWeek, 25);
  advance(s2, 365, []);
  assert.equal(p2.job, 'quit', 'back to the startup once runway recovered');
  assert.ok(s2.founder.hoursPerWeek >= 55);
});

test('E2E: trial→paid is capped at realistic ceilings', () => {
  const s = fresh('b2c');
  s.market.fit.product.score = 1;
  s.market.onboarding = 'concierge';
  s.market.cardRequired = true;
  assert.ok(trialConversion(s) <= 0.6);
  s.market.cardRequired = false;
  assert.ok(trialConversion(s) <= 0.35);
});

test('E2E: withholdFromStripe takes from the Stripe balance and records it; old canceled subscriptions are archived', () => {
  const s = fresh();
  s.stripe.available = 50;
  s.stripe.pending.push({ amount: 100, availableDay: s.day + 2, chargeId: 'x' });
  assert.equal(withholdFromStripe(s, 120, { loanId: 'l1', interest: 20 }), 120);
  assert.equal(s.stripe.available, 0);
  assert.equal(s.stripe.pending[0].amount, 30);
  assert.deepEqual([s.stripe.capitalRepayments[0].principal, s.stripe.capitalRepayments[0].interest], [100, 20]);
  addPayers(s, 5, 10);
  const sub = s.stripe.subscriptions[0];
  assert.equal(subscriptionById(s, sub.id), sub);
  sub.status = 'canceled'; sub.canceledDay = 0;
  s.day = 420; // next compaction
  advance(s, 30, []);
  assert.ok(!s.stripe.subscriptions.includes(sub));
  assert.equal(subscriptionById(s, sub.id), undefined);
  assert.ok(Object.values(s.stripe.subArchive).reduce((a, x) => a + x.canceled, 0) >= 1);
});

import { requestQuit } from '../public/core/personal.js';
import { stripeReconciliation, refund as rf } from '../public/core/stripe.js';

test('E2E: quitting takes two weeks of notice; quitting a brand-new job slows the next search', () => {
  const s = fresh();
  const p = ensurePersonal(s);
  Object.assign(p, { job: 'full_time', incomeType: 'w2', annualIncome: 100000, liquidSavings: 1e5 });
  s.founder.hoursPerWeek = 25;
  p.jobStartDay = s.day;
  requestQuit(s);
  advance(s, 13, []);
  assert.equal(p.job, 'full_time');
  advance(s, 2, []);
  assert.equal(p.job, 'quit');
  assert.ok(s.founder.hoursPerWeek >= 55);
  assert.equal(p.shortTenureQuits, 1);
  const js = startJobSearch(s, 'full_time');
  assert.ok(js.offerDay - js.startDay >= 90, 'slower search after a short stint');
});

test('E2E: Stripe balance movements reconcile to payouts posted to the bank', () => {
  const s = fresh('b2c', 7);
  for (let d = 0; d < 120; d++) { if (d % 2 === 0) addPayers(s, 3, 15); advance(s, 1, []); }
  const ch = s.stripe.charges.find((c) => c.status === 'succeeded');
  rf(s, ch.id, { amount: 5 });
  s.stripe.available += 0; // no-op
  const r = stripeReconciliation(s);
  assert.ok(r.ok, `diff ${r.diff}`);
  assert.ok(r.payoutsOk, `${r.payoutsTracked} vs ${r.bankPayouts}`);
  assert.ok(r.flows.payouts > 0 && r.flows.disputes >= 0);
});
