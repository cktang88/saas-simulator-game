// Back-office vendor paradigms (Q4 2026): banking (envelopes, AP), spend (Ramp vs Brex), ledgers, startup tax and the
// R&D credit, billing platforms and merchants of record, cap-table vendors (Pulley shutdown), formation, contract
// counsel (Crosby vs a law firm vs CLM), the virtual mailroom, and the operator-tier separation (principle 7).
// Short, targeted sims only: a few seeds, <= 160 days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, totalCash } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, feeFor } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import * as BO from '../public/apps/money/backoffice.js';
import { setPlan, receiptFactor } from '../public/apps/money/spend.js';
import { ensureBooks } from '../public/apps/money/ledger.js';
import { BOOKKEEPING, bookkeepingPrice } from '../public/apps/money/catalog.js';
import { fileWithCpa } from '../public/apps/money/compliance.js';
import { incorporate, ensureLegal, setCounsel, setClm, legalDay, legalMonthEnd } from '../public/apps/legal/sim.js';
import { counselPositions, scoreRedlines, noteReasons } from '../public/apps/legal/redlines.js';
import { PROVIDERS } from '../public/apps/legal/catalog.js';
import { newCapTable } from '../public/apps/fundraising/captable.js';
import { get409A } from '../public/apps/people/sim.js';
import * as CAPVIEW from '../public/apps/fundraising/view-cap.js';

const SUB = APPS.filter((a) => ['bank', 'books', 'stripe', 'legal'].includes(a.id));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const mistakes = (s, id) => (s.mistakes ?? []).filter((m) => !id || m.id === id);

function corp(seed, { cash = 60000, model = 'smb', operatingState = 'DE', name = `Co${seed}` } = {}) {
  const s = newState({ companyName: name, model, path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: cash, counterparty: 'Pat', category: 'owner_contribution' });
  incorporate(s, { provider: 'atlas', operatingState });
  advance(s, 3, SUB);
  s.bank.accounts[0].personal = false; s.bank.accounts[0].name = 'Mercury Checking';
  s.apps.product = { features: [{ id: 'f1', status: 'shipped' }] };
  s.company.website = { text: 'x' };
  return s;
}
const addSubs = (s, n, price = 79, interval = 'month') => { for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, country: 'US' }); subscribe(s, c.id, { id: `p${interval}`, price, interval, trialDays: 0 }); } };

// ---------------------------------------------------------------------------------------------------------
// Banking
// ---------------------------------------------------------------------------------------------------------

test('Relay envelopes split every payout into the tax reserve; a tax bill draws on it, no bounce', () => {
  const s = corp(1, { cash: 3000 });
  BO.switchBank(s, 'relay');
  BO.setReserve(s, 0.2);
  post(s, { amount: 10000, counterparty: 'Stripe', category: 'stripe_payout', method: 'ach' });
  BO.backofficeDay(s);
  assert.equal(BO.reserveAcct(s).balance, 2000, '20% of the payout moved by rule');
  post(s, { amount: -11500, counterparty: 'IRS', description: 'Estimated tax', category: 'taxes', method: 'ach' });
  BO.backofficeDay(s);
  assert.equal(BO.reserveAcct(s).balance, 0);
  assert.equal(mistakes(s, 'tax_payment_bounced').length, 0, 'the reserve covered the shortfall');
  // Same world on Mercury with no reserve: the payment bounces and the §6657 penalty (2%) is charged.
  const m = corp(1, { cash: 3000 });
  post(m, { amount: 10000, counterparty: 'Stripe', category: 'stripe_payout', method: 'ach' });
  BO.backofficeDay(m);
  post(m, { amount: -14000, counterparty: 'IRS', description: 'Estimated tax', category: 'taxes', method: 'ach' });
  BO.backofficeDay(m);
  const b = mistakes(m, 'tax_payment_bounced');
  assert.equal(b.length, 1);
  assert.equal(b[0].cost.usd, 280);
});

test('AP: automated bill pay (Rho) costs a fifth of the hours of typing bills in, and fewer late fees', () => {
  const run = (bank) => {
    const s = corp(4);
    if (bank !== 'mercury') BO.switchBank(s, bank);
    const h0 = BO.ensureBackoffice(s).pendingHours;
    for (let i = 0; i < 400; i++) post(s, { amount: -900, counterparty: `Vendor ${i}`, category: 'contractors', method: 'ach' });
    BO.backofficeDay(s);
    const b = BO.ensureBackoffice(s);
    return { hours: b.pendingHours - h0, late: b.stats.lateBills };
  };
  const manual = run('mercury'), rho = run('rho');
  assert.ok(Math.abs(manual.hours - 400 * 0.15) < 1 && Math.abs(rho.hours - 400 * 0.03) < 1, JSON.stringify({ manual, rho }));
  assert.ok(manual.late > rho.late * 3, JSON.stringify({ manual, rho }));
});

test('a bank without Treasury closes it on the move; Brex as a bank has no sub-account for a reserve', () => {
  const s = corp(5);
  s.bank.accounts.push({ id: 'treasury', name: 'Treasury', type: 'treasury', balance: 0 });
  post(s, { amount: 5000, counterparty: 'x', category: 'transfer', method: 'internal', accountId: 'treasury' });
  BO.switchBank(s, 'relay');
  assert.equal(s.bank.accounts.find((a) => a.id === 'treasury').balance, 0);
  BO.switchBank(s, 'brex');
  assert.throws(() => BO.setReserve(s, 0.1), /single account/);
  assert.equal(mistakes(s, 'bank_hopping').length, 1, 'two moves in six months: going in circles');
});

// ---------------------------------------------------------------------------------------------------------
// Spend: Ramp vs Brex
// ---------------------------------------------------------------------------------------------------------

test('Ramp vs Brex: rewards rate, Ramp Plus codes card charges at the swipe, Brex integration notices', () => {
  const rewards = (vendor) => {
    const s = corp(6);
    setPlan(s, 'free', vendor);
    for (let i = 0; i < 10; i++) post(s, { amount: -1000, counterparty: 'AWS', category: 'hosting', method: 'card' });
    BO.backofficeDay(s);
    advance(s, 35, SUB);
    return BO.ensureBackoffice(s).stats.cashback;
  };
  const ramp = rewards('ramp'), brex = rewards('brex');
  assert.ok(ramp >= 150 && brex >= 100 && ramp > brex, `${ramp} vs ${brex}`);
  const s = corp(7);
  setPlan(s, 'plus', 'ramp');
  const t = post(s, { amount: -50, counterparty: 'Figma', category: 'software', method: 'card' });
  assert.ok(receiptFactor(s, t) < 0.5, 'Accounting Agent lowers the miscategorization multiplier');
  setPlan(s, 'plus', 'brex');
  assert.equal(receiptFactor(s, t), 1);
  // Over a year across a few seeds, Brex customers get Capital One integration notices.
  let events = 0;
  for (const seed of [11, 12, 13]) { const b = corp(seed); setPlan(b, 'free', 'brex'); advance(b, 300, SUB); events += BO.ensureBackoffice(b).integration.events; }
  assert.ok(events >= 1, 'integration notices happen');
});

// ---------------------------------------------------------------------------------------------------------
// Books: ledger paradigms, migration cleanup, Bench, prices
// ---------------------------------------------------------------------------------------------------------

test('ledgers: QBO→Xero needs a history conversion, moving to Pilot bills a cleanup, Bench is dead, hopping is circles', () => {
  const s = corp(8);
  for (let i = 0; i < 40; i++) post(s, { amount: -120, counterparty: `Tool ${i % 7}`, category: 'software', method: 'card' });
  advance(s, 70, SUB);
  assert.throws(() => BO.booksSwitchQuote(s, 'bench'), /Bench shut down/);
  const toQbo = BO.switchBooks(s, 'qbo');
  assert.ok(toQbo.months >= 2 && toQbo.hours > 2, JSON.stringify(toQbo));
  const toXero = BO.booksSwitchQuote(s, 'xero');
  assert.equal(toXero.conversion, 300);
  const toPilot = BO.booksSwitchQuote(s, 'full');
  assert.ok(toPilot.same, 'Pilot works inside QuickBooks: no ledger migration');
  BO.switchBooks(s, 'xero');
  assert.equal(mistakes(s, 'ledger_hopping').length, 1);
  assert.equal(bookkeepingPrice('full', { monthlyExpenses: 8000 }), 349 + 38);
  assert.equal(bookkeepingPrice('full', { monthlyExpenses: 120000 }), 849 + 38);
  assert.equal(bookkeepingPrice('kick', { txnsPerYear: 100 }), 0);
  assert.ok(BOOKKEEPING.puzzle.accrual && BOOKKEEPING.puzzle.metrics && !BOOKKEEPING.diy.accrual);
});

// ---------------------------------------------------------------------------------------------------------
// Tax: startup tax service claims the R&D credit, a generic CPA leaves it on the table
// ---------------------------------------------------------------------------------------------------------

test('R&D credit: Fondo claims 6% of qualified spend against payroll tax; the generic CPA logs a missed credit', () => {
  const run = (tax) => {
    const s = corp(9, { cash: 200000 });
    BO.setTaxService(s, tax);
    for (let m = 0; m < 2; m++) {
      post(s, { amount: -20000, counterparty: 'Gusto', category: 'payroll', method: 'payroll' });
      post(s, { amount: -2000, counterparty: 'Gusto', category: 'payroll_tax', method: 'payroll' });
      post(s, { amount: -8000, counterparty: 'Dev shop', category: 'contractors', method: 'ach' });
      s.day += 25;
    }
    const before = totalCash(s);
    fileWithCpa(s, 2026);
    return { s, delta: totalCash(s) - before };
  };
  const f = run('fondo'), c = run('cpa');
  const rd = BO.rdCredit(f.s, 2026);
  assert.ok(Math.abs(rd.qre - 0.6 * (40000 + 16000 * 0.65)) < 1 && Math.abs(rd.usable - 0.06 * rd.qre) < 1, JSON.stringify(rd));
  assert.ok(f.delta > c.delta + 1500, `Fondo ${f.delta} vs CPA ${c.delta}`); // ~$1,450 net credit + a lower base fee
  assert.equal(mistakes(c.s, 'missed_rd_credit').length, 1);
  assert.equal(mistakes(f.s, 'missed_rd_credit').length, 0);
});

// ---------------------------------------------------------------------------------------------------------
// Billing platforms and merchants of record
// ---------------------------------------------------------------------------------------------------------

test('merchants of record differ in fee shape; Stripe Managed Payments sits on top of Stripe fees', () => {
  const s = corp(10);
  const st = ensureStripe(s);
  const us = { country: 'US' }, de = { country: 'DE' };
  st.settings.merchantOfRecord = true;
  const fee = (p, c) => { st.settings.morProvider = p; return feeFor(s, 100, c); };
  assert.equal(fee('paddle', de), 5.5);
  assert.equal(fee('polar', us), 4.9);
  assert.ok(fee('lemon', de) > fee('paddle', de), 'Lemon Squeezy surcharges international + subscriptions');
  assert.ok(Math.abs(fee('stripe_mp', us) - (2.9 + 0.7 + 3.5 + 0.3)) < 0.01);
  st.settings.merchantOfRecord = false;
  const withBilling = feeFor(s, 100, us);
  st.settings.billingPlatform = 'orb';
  assert.ok(Math.abs(withBilling - feeFor(s, 100, us) - 0.7) < 0.01, 'Stripe Billing 0.7% replaced when Orb bills');
});

test('usage billing tools pay off only on usage pricing: basic meters bill usage wrong, Orb on flat pricing is overkill', () => {
  const run = (platform, model) => {
    const s = corp(14, { cash: 50000 });
    s.apps.pricing = { model };
    addSubs(s, 60, 99);
    if (platform !== 'stripe_billing') BO.setBillingPlatform(s, platform);
    advance(s, 95, SUB);
    return s;
  };
  const basic = run('stripe_billing', 'usage');
  const orb = run('orb', 'usage');
  const orbFlat = run('orb', 'flat');
  const b = BO.ensureBackoffice(basic).billing, o = BO.ensureBackoffice(orb).billing;
  assert.ok(b.errors > o.errors && b.credits > 0, JSON.stringify({ b, o })); // credits vary with uid order (hash per sub id)
  assert.ok(mistakes(basic, 'usage_invoice_errors').length >= 1);
  assert.equal(mistakes(orb, 'billing_tool_overkill').length, 0);
  assert.equal(mistakes(orbFlat, 'billing_tool_overkill').length, 1);
});

// ---------------------------------------------------------------------------------------------------------
// Cap table: Pulley shutdown event, closed and paid vendors, 409A, spreadsheet errors at the round
// ---------------------------------------------------------------------------------------------------------

function onPulley(seed) {
  const s = corp(seed);
  s.apps.fundraising = { cap: newCapTable('Pat') };
  const b = BO.ensureBackoffice(s);
  b.cap.vendor = 'pulley'; b.cap.price = 1200; b.cap.nextBill = s.day + 200; // paid annually, ~6.5 months unused
  return s;
}

test('Pulley shutdown: assisted Carta migration before Nov 30 is cheap; staying past Dec 8 forces a costly rebuild', () => {
  const a = onPulley(15);
  advance(a, 2, SUB);
  assert.ok(a.mail.threads?.some?.((t) => /Pulley is shutting down/.test(t.subject)) || a.notifications.some((n) => /Pulley is shutting down/.test(n.text)));
  assert.throws(() => BO.chooseCapVendor(corp(16), 'pulley'), /shutting down/);
  const r = BO.migrateOffPulley(a, 'carta');
  assert.equal(r.assisted, true);
  assert.equal(r.hours, 2);
  assert.ok(r.price < 1200, `price matched and unused months credited: ${r.price}`);
  const late = onPulley(17);
  advance(late, 40, SUB); // past Dec 8, 2026 (game starts Nov 2)
  const m = mistakes(late, 'pulley_missed_migration');
  assert.equal(m.length, 1);
  assert.ok(m[0].cost.usd >= 4000 && m[0].cost.hours >= 10);
  assert.equal(BO.ensureBackoffice(late).cap.vendor, 'spreadsheet');
  assert.throws(() => BO.chooseCapVendor(corp(18), 'angellist'), /closed/);
});

test('409A follows the cap-table vendor; Carta is free to 25 holders; spreadsheet errors are billed at the priced round', () => {
  const s = corp(19);
  s.apps.fundraising = { cap: newCapTable('Pat') };
  assert.equal(BO.capPrice(s, 'carta'), 0);
  for (let i = 0; i < 30; i++) s.apps.fundraising.cap.safes.push({ id: `s${i}`, holder: `Angel ${i}`, amount: 25000, cap: 10e6, status: 'outstanding' });
  assert.equal(BO.capPrice(s, 'carta'), 5988);
  BO.chooseCapVendor(s, 'carta');
  assert.equal(BO.valuation409A(s).cost, 0, 'included in Carta Build');
  const c = corp(20);
  BO.chooseCapVendor(c, 'cake');
  assert.equal(BO.valuation409A(c).cost, 1500);
  c.company.entity = 'ccorp';
  const cash = totalCash(c);
  get409A(c);
  assert.equal(cash - totalCash(c), 1500);
  // Spreadsheet: entries made with errors surface when the priced round closes.
  let found = 0;
  for (const seed of [21, 22, 23]) {
    const x = corp(seed);
    x.apps.fundraising = { cap: newCapTable('Pat') };
    for (let i = 0; i < 25; i++) x.apps.fundraising.cap.safes.push({ id: `s${i}`, holder: `A${i}`, amount: 10000, cap: 8e6, status: 'outstanding' });
    BO.backofficeDay(x);
    x.apps.fundraising.cap.preferred.push({ id: 'p1', series: 'Seed', holder: 'Lead', shares: 1e6, invested: 2e6 });
    BO.backofficeDay(x);
    found += mistakes(x, 'cap_table_spreadsheet').length;
  }
  assert.ok(found >= 1, 'a spreadsheet with 25 entries has errors at the round in most worlds');
});

// ---------------------------------------------------------------------------------------------------------
// Formation, contracts, mailroom
// ---------------------------------------------------------------------------------------------------------

test('formation providers: Atlas $500 + $100/yr in ~2 days; doola adds the Delaware LLC fee and bundles an address', () => {
  assert.equal(PROVIDERS.atlas.fee, 500);
  assert.equal(PROVIDERS.atlas.agentAnnual, 100);
  assert.ok(PROVIDERS.atlas.days <= 2);
  assert.equal(PROVIDERS.firstbase.agentAnnual, 299);
  const s = newState({ companyName: 'D', model: 'smb', path: 'indie', founderName: 'F', seed: 3 });
  ensureStripe(s); post(s, { amount: 5000, counterparty: 'F', category: 'owner_contribution' });
  incorporate(s, { provider: 'doola', operatingState: 'nonus' });
  assert.ok(s.bank.txns.some((t) => t.amount === -110 && /Delaware LLC/.test(t.description)));
  advance(s, 8, SUB);
  assert.equal(BO.mailroom(s), 'bundled');
});

test('contracts: Crosby returns a reasoned, capped redline within the hour; a law firm takes days; CLM is overkill', () => {
  const { choices, note } = counselPositions(['liability', 'indemnity', 'autorenew', 'residency']);
  assert.equal(noteReasons(note, ['liability', 'indemnity', 'autorenew', 'residency']).share, 1, 'each clause gets a reason');
  const sc = scoreRedlines(['liability', 'indemnity', 'autorenew', 'residency'], choices, note, { model: 'ent' });
  assert.ok(sc.risk < 2 && sc.dealProbability > 0.75, JSON.stringify(sc));
  const run = (counsel) => {
    const s = corp(24, { model: 'ent', cash: 80000 });
    setCounsel(s, counsel);
    addSubs(s, 6, 1500);
    advance(s, 20, SUB);
    return ensureLegal(s).redlines;
  };
  const cr = run('crosby'), lw = run('lawyer');
  assert.ok(cr.length >= 1 && lw.length >= 1);
  assert.ok(cr.every((r) => r.status !== 'with_counsel' && r.respondedDay - r.receivedDay <= 1), JSON.stringify(cr.map((r) => [r.receivedDay, r.respondedDay])));
  assert.ok(mean(lw.filter((r) => r.respondedDay != null).map((r) => r.respondedDay - r.receivedDay)) >= 2);
  const s = corp(25, { model: 'ent' });
  setClm(s, 'ironclad');
  s.day += 100; legalMonthEnd(s);
  assert.equal(mistakes(s, 'clm_overkill').length, 1);
});

test('mailroom: a non-US founder with no address misses official notices and pays for it; Stable scans them', () => {
  let none = 0, stable = 0;
  for (const seed of [26, 27, 28]) {
    const a = corp(seed, { operatingState: 'nonus' });
    advance(a, 330, SUB);
    none += mistakes(a, 'missed_state_notice').length;
    const b = corp(seed, { operatingState: 'nonus' });
    BO.setMailroom(b, 'stable');
    advance(b, 330, SUB);
    stable += mistakes(b, 'missed_state_notice').length;
  }
  assert.ok(none >= 1 && stable === 0, `${none} vs ${stable}`);
});

// ---------------------------------------------------------------------------------------------------------
// Views render headless, show the vendors, and keep expert advice behind the advice gate
// ---------------------------------------------------------------------------------------------------------

test('Back office, Books service, Stripe settings and cap-table views render without leaking coaching', () => {
  const LEAK = /stellar operator|Stellar:|What a stellar|Tip:|you should(?! have)/i;
  const stubRoot = () => ({ innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; } });
  const s = onPulley(40);
  const draw = (id, params) => { const root = stubRoot(); APPS.find((a) => a.id === id).render(root, { state: s, params, save() {}, act() {}, render() {}, navigate() {}, enqueue() {}, toast() {}, llm: null }); return root.innerHTML; };
  const bo = draw('bank', 'backoffice');
  for (const name of ['Relay', 'Rho', 'Capital One', 'Fondo', 'Carta', 'Pulley', 'Stable', 'Crosby', 'Ironclad', 'Bench', 'First Republic']) assert.match(bo, new RegExp(name), name);
  const books = draw('books', 'service');
  for (const name of ['Puzzle', 'Digits', 'Kick', 'Pilot Essentials', 'Xero', 'Bench']) assert.match(books, new RegExp(name), name);
  const stripe = draw('stripe', 'settings');
  for (const name of ['Paddle', 'Lemon Squeezy', 'Polar', 'Stripe Managed Payments', 'Metronome', 'Orb', 'Chargebee']) assert.match(stripe, new RegExp(name), name);
  const { renderCap } = CAPVIEW;
  const cap = String(renderCap({ state: s, params: 'cap' }));
  assert.match(cap, /System of record: Pulley/);
  assert.match(cap, /shuts down/);
  for (const page of [bo, books, stripe, cap]) assert.doesNotMatch(page, LEAK);
});

// ---------------------------------------------------------------------------------------------------------
// Operator tiers: the same company, four operators. Grades separate and so does what it costs.
// ---------------------------------------------------------------------------------------------------------

const TIERS = {
  stellar: (s) => { BO.switchBank(s, 'rho'); BO.setReserve(s, 0.15); BO.switchBooks(s, 'puzzle'); BO.setTaxService(s, 'fondo'); BO.setBillingPlatform(s, 'metronome'); BO.chooseCapVendor(s, 'carta'); setCounsel(s, 'crosby'); BO.setMailroom(s, 'stable'); },
  good: (s) => { BO.setReserve(s, 0.15); BO.switchBooks(s, 'qbo'); BO.setTaxService(s, 'fondo'); BO.chooseCapVendor(s, 'carta'); setCounsel(s, 'lawyer'); },
  average: () => {},
  mediocre: (s) => { BO.switchBank(s, 'brex'); BO.switchBooks(s, 'qbo'); BO.switchBooks(s, 'xero'); setClm(s, 'ironclad'); },
};

// The traceable back-office consequences this change adds (other systems' mistakes, e.g. dunning, are left out).
const BACK_OFFICE_MISTAKES = new Set(['bank_hopping', 'tax_payment_bounced', 'late_vendor_bill', 'missed_rd_credit', 'usage_invoice_errors', 'billing_tool_overkill', 'cap_table_spreadsheet', 'pulley_missed_migration', 'pulley_late_migration', 'missed_state_notice', 'ledger_hopping', 'cash_books_restated', 'slow_counsel_lost_deal', 'clm_overkill']);

function tierWorld(seed, tier) {
  const s = corp(seed, { cash: 90000, operatingState: tier === 'mediocre' ? 'nonus' : 'DE' });
  s.apps.pricing = { model: 'usage' };
  s.apps.fundraising = { cap: newCapTable('Pat') };
  post(s, { amount: 150000, counterparty: 'Angels', category: 'investment', method: 'wire' });
  addSubs(s, 40, 99);
  TIERS[tier](s);
  for (let d = 0; d < 150; d++) {
    if (d % 7 === 0) for (let k = 0; k < 3; k++) post(s, { amount: -1500, counterparty: `Contractor ${k}`, category: 'contractors', method: 'ach' });
    if (d % 30 === 0) { post(s, { amount: -9000, counterparty: 'Gusto', category: 'payroll', method: 'payroll' }); post(s, { amount: -800, counterparty: 'Gusto', category: 'payroll_tax', method: 'payroll' }); }
    if (d % 15 === 0 && d <= 120) s.apps.fundraising.cap.safes.push({ id: `s${d}`, holder: `Angel ${d}`, amount: 25000, cap: 10e6, status: 'outstanding' });
    if (d === 135) s.apps.fundraising.cap.preferred.push({ id: 'p1', series: 'Seed', holder: 'Lead', shares: 1e6, invested: 2e6 });
    advance(s, 1, SUB);
  }
  try { fileWithCpa(s, 2026); } catch { /* not due */ }
  const g = BO.gradeBackOffice(s);
  const ms = mistakes(s).filter((m) => BACK_OFFICE_MISTAKES.has(m.id));
  const hours = BO.opsHours(s, 12) + ms.reduce((a, m) => a + m.cost.hours, 0);
  return { score: g.score, tier: g.tier, cash: totalCash(s), hours, mistakeUsd: ms.reduce((a, m) => a + m.cost.usd, 0), value: totalCash(s) - 100 * hours };
}

test('operator tiers separate: stack fit and what the back office costs (cash minus founder hours at $100/h)', () => {
  const seeds = [31, 32, 33];
  const res = Object.fromEntries(Object.keys(TIERS).map((t) => [t, seeds.map((seed) => tierWorld(seed, t))]));
  for (let i = 0; i < seeds.length; i++) {
    assert.ok(res.stellar[i].score > res.good[i].score && res.good[i].score > res.average[i].score && res.average[i].score > res.mediocre[i].score, JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v[i].score]))));
  }
  assert.equal(res.stellar[0].tier, 'stellar');
  assert.equal(res.mediocre[0].tier, 'mediocre');
  const v = Object.fromEntries(Object.entries(res).map(([k, x]) => [k, Math.round(mean(x.map((r) => r.value)))]));
  const h = Object.fromEntries(Object.entries(res).map(([k, x]) => [k, Math.round(mean(x.map((r) => r.hours)))]));
  const u = Object.fromEntries(Object.entries(res).map(([k, x]) => [k, Math.round(mean(x.map((r) => r.mistakeUsd)))]));
  console.log('# value', JSON.stringify(v), 'hours', JSON.stringify(h), 'mistake $', JSON.stringify(u));
  assert.ok(v.stellar > v.average && v.good > v.average && v.average > v.mediocre, JSON.stringify(v));
  assert.ok(h.stellar < h.average && h.average < h.mediocre, JSON.stringify(h));
  assert.ok(u.mediocre > u.average && u.average > u.stellar, JSON.stringify(u));
});
