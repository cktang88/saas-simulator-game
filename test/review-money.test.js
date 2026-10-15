// Regression tests from the money/legal bug review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import { franchiseAuthorizedShares, delawareLate, buildCalendar } from '../public/apps/legal/deadlines.js';
import { DELAWARE } from '../public/apps/legal/catalog.js';
import { incorporate, signFounderDocs, payFranchiseTax, amendFranchiseTax, ensureLegal } from '../public/apps/legal/sim.js';
import { cpaQuote, payEstimatedTax, fileWithCpa } from '../public/apps/money/compliance.js';
import { ensureBooks } from '../public/apps/money/ledger.js';
import { yearOf } from '../public/apps/money/common.js';
import { createCoupon, applyCoupon } from '../public/apps/money/payments.js';

const LEGAL_APPS = APPS.filter((a) => a.id === 'legal');

function fresh() {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 3 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
}
// A C-corp whose franchise tax for the start year is already on the calendar (formed "last year", so overdue).
function ccorpWithFranchiseDue({ stock = true } = {}) {
  const s = fresh();
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  advance(s, 3, LEGAL_APPS);
  const L = ensureLegal(s);
  L.incorporation.effectiveDay = -400;
  if (stock) signFounderDocs(s, {});
  const key = `de-franchise-${yearOf(s, 0)}`;
  const item = buildCalendar(s).find((i) => i.key === key);
  assert.ok(item, 'franchise tax on the calendar');
  return { s, L, key, item };
}

test('APVC filing without issued shares is refused instead of charging only the $50 report fee', () => {
  const { s, key } = ccorpWithFranchiseDue({ stock: false });
  const cash = s.bank.accounts[0].balance;
  assert.throws(() => payFranchiseTax(s, key, { method: 'apvc', grossAssets: 0, issuedShares: 0 }), /issued shares/);
  assert.equal(s.bank.accounts[0].balance, cash);
});

test('amending without issued shares cannot refund the whole franchise tax', () => {
  const { s, key } = ccorpWithFranchiseDue({ stock: false });
  payFranchiseTax(s, key, { method: 'billed' });
  assert.throws(() => amendFranchiseTax(s, key, { grossAssets: 0, issuedShares: 0 }), /issued shares/);
});

test('franchise tax cannot be paid twice for the same year', () => {
  const { s, key } = ccorpWithFranchiseDue();
  payFranchiseTax(s, key, { method: 'billed' });
  const cash = s.bank.accounts[0].balance;
  assert.throws(() => payFranchiseTax(s, key, { method: 'billed' }), /Already/);
  assert.equal(s.bank.accounts[0].balance, cash);
});

test('amending a late Authorized Shares filing also refunds the late interest charged on the overpaid tax', () => {
  const { s, key, item } = ccorpWithFranchiseDue();
  const paid = payFranchiseTax(s, key, { method: 'billed' });
  const billed = franchiseAuthorizedShares(12_000_000);
  const daysLate = s.day - item.dueDay;
  assert.ok(daysLate > 0);
  const a = amendFranchiseTax(s, key, { grossAssets: 0, issuedShares: 10_000_000 });
  const owed = 400 + DELAWARE.annualReportFee + delawareLate(400, daysLate);
  assert.ok(Math.abs(a.refund - (paid.amount - owed)) < 0.02, `${a.refund} vs ${paid.amount - owed}`);
  assert.ok(a.refund > billed - 400);
});

test('a billed, unamended franchise filing stays on the Legal calendar so the Amend action is reachable', () => {
  const { s, L, key, item } = ccorpWithFranchiseDue();
  payFranchiseTax(s, key, { method: 'billed' });
  s.day = item.dueDay + 200;
  assert.ok(buildCalendar(s).some((i) => i.key === key), 'still listed while the overpayment is unrecovered');
  L.paidFilings[key].amended = { received: true };
  assert.ok(!buildCalendar(s).some((i) => i.key === key), 'drops off once refunded');
});

test('CPA return: an estimate penalty is not counted as tax paid (no refund of penalties)', () => {
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp';
  ensureBooks(s);
  const y = yearOf(s);
  post(s, { amount: -1050, counterparty: 'IRS', description: 'IRS USATAXPYMT EST TAX + PENALTY', category: 'taxes', method: 'ach', meta: { incomeTax: true, compliance: `cest-${y}-Q4`, penalty: 50 } });
  assert.equal(cpaQuote(s, y).estimatesPaid, 1000);
});

test('estimated tax the IRS already collected (missed) cannot be paid again; a filed return cannot be filed twice', () => {
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp';
  const b = ensureBooks(s);
  const y = yearOf(s);
  b.compliance[`cest-${y}-Q4`] = { status: 'missed' };
  assert.throws(() => payEstimatedTax(s, `cest-${y}-Q4`, 500), /already paid/);
  fileWithCpa(s, y - 1);
  const cash = s.bank.accounts[0].balance;
  assert.throws(() => fileWithCpa(s, y - 1), /already filed/);
  assert.equal(s.bank.accounts[0].balance, cash);
});

test('a 3-month coupon on an annual plan lasts months, not years', () => {
  const s = fresh();
  const app = { coupons: [] };
  const c = createCustomer(s, { name: 'A', email: 'a@x.com' });
  const sub = subscribe(s, c.id, { id: 'plan_y', price: 1200, interval: 'year', trialDays: 0 });
  createCoupon(app, { code: 'SAVE', pctOff: 20, duration: 'repeating', months: 3 });
  applyCoupon(s, app, sub, 'co_SAVE');
  assert.equal(sub.coupon.endDay, s.day + 90);
  const c2 = createCustomer(s, { name: 'B', email: 'b@x.com' });
  const sub2 = subscribe(s, c2.id, { id: 'plan_y', price: 1200, interval: 'year', trialDays: 0 });
  createCoupon(app, { code: 'ONCE', pctOff: 20, duration: 'once' });
  applyCoupon(s, app, sub2, 'co_ONCE');
  assert.equal(sub2.coupon.endDay, sub2.currentPeriodEnd + 1, "'once' covers the next (renewal) invoice");
});

test('money and legal apps do not use Date.now() or Math.random() for state', () => {
  for (const f of ['public/apps/bank.js', 'public/apps/stripe.js', 'public/apps/books.js', 'public/apps/legal.js', 'public/apps/pricing.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/Date\.now\(\)|Math\.random\(\)/.test(src), f);
  }
});

test('Books/forecast Delaware LLC tax matches what Legal actually charges', async () => {
  const { TAX } = await import('../public/apps/money/compliance.js');
  assert.equal(TAX.deLlcTax, DELAWARE.llcTax);
});
