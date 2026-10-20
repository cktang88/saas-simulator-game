// Regression tests from the money / fundraising / legal bug sweep. Short, offline, deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ledgerByMonth } from '../public/apps/money/ledger.js';
import { ensureBooks } from '../public/apps/money/ledger.js';
import { complianceDay, registerNexus, contractorTotals, NEXUS_ASSESS, TAX } from '../public/apps/money/compliance.js';
import { forms1099 } from '../public/apps/legal/deadlines.js';
import { postRbfRepayment } from '../public/apps/fundraising/sim.js';
import { savePlan } from '../public/apps/stripe.js';

function fresh(seed = 7) {
  const s = newState({ companyName: 'Test Co', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 300000, counterparty: 'Pat', description: 'Initial owner contribution', category: 'owner_contribution' });
  return s;
}
const sumAcct = (L, a) => Object.values(L).reduce((x, m) => x + (m[a] ?? 0), 0);

test('RBF repayments book the financing fee as it is paid, not all at the end', () => {
  const s = fresh();
  const loan = { label: 'Lighter-style RBF', advance: 100000, total: 150000, remaining: 150000 };
  post(s, { amount: 100000, counterparty: loan.label, description: 'Revenue-based financing advance', category: 'loan' });
  postRbfRepayment(s, loan, 30000, '5% of revenue'); // first fifth of the cap
  const L = ledgerByMonth(s);
  // One fifth paid: one fifth of the $50K fee is expensed now (a combined line booked all of it as principal).
  assert.ok(Math.abs(sumAcct(L, '7100') - 10000) < 0.01, `fee expensed pro rata (7100 = ${sumAcct(L, '7100')})`);
  assert.ok(Math.abs(-sumAcct(L, '2600') - 80000) < 0.01, `principal outstanding 80K (2600 = ${sumAcct(L, '2600')})`);
  const paid = s.bank.txns.filter((t) => t.counterparty === loan.label && t.amount < 0).reduce((a, t) => a - t.amount, 0);
  assert.equal(paid, 30000, 'cash out equals the payment');
});

test('ignored sales-tax nexus is assessed with penalties; registering on time costs less', () => {
  const run = (register) => {
    const s = fresh(3);
    const b = ensureBooks(s);
    b.sales[2026] = { TX: 900000 }; // crossed TX's $500K threshold
    complianceDay(s); // records the crossing
    assert.ok(b.nexus.TX && !b.nexus.TX.registered);
    const cash0 = s.bank.txns.reduce((a, t) => a + t.amount, 0);
    let paid = 0;
    if (register) { s.day += 61; paid = registerNexus(s, 'TX'); }
    for (let i = 0; i < NEXUS_ASSESS.afterDays + 2; i++) { s.day++; complianceDay(s); }
    const cash1 = s.bank.txns.reduce((a, t) => a + t.amount, 0);
    return { s, b, spent: cash0 - cash1, paid };
  };
  const ignored = run(false);
  assert.ok(ignored.b.nexus.TX.registered && ignored.b.nexus.TX.assessedDay != null, 'the state assessed it');
  const owed = 400000 * TAX.salesTaxRate;
  assert.ok(ignored.spent > owed * 1.2, `assessment includes penalty + interest (${ignored.spent})`);
  assert.ok(JSON.stringify(ignored.s).includes('nexus_ignored'), 'traceable mistake logged');
  const registered = run(true);
  assert.ok(registered.paid > 0 && registered.spent < ignored.spent, `voluntary ${registered.spent} < assessed ${ignored.spent}`);
  assert.equal(registered.b.nexus.TX.assessedDay, undefined, 'no assessment after registering');
});

test('1099-NEC covers contractors paid by ACH from the Bank, not card payments or platforms', () => {
  const s = fresh();
  post(s, { amount: -2500, counterparty: 'Jane Doe', description: 'ACH TO JANE DOE', category: 'contractors', method: 'ach' });
  post(s, { amount: -3000, counterparty: 'Screenshot designer (freelance)', description: 'App Store screenshots', category: 'contractors', method: 'card' });
  post(s, { amount: -5000, counterparty: 'Upwork', description: 'UPWORK', category: 'contractors', method: 'ach' });
  post(s, { amount: -1500, counterparty: 'Small Co', description: 'ACH', category: 'contractors', method: 'ach' });
  const forms = forms1099(s, 2026);
  assert.deepEqual(forms.map((f) => f.name), ['Jane Doe']);
  // Books' list follows the same rules, so the two calendars agree.
  assert.deepEqual(contractorTotals(s, 2026, { truth: true }).filter((c) => c.required).map((c) => c.payee), ['Jane Doe']);
});

test('deactivating the only active price is refused without changing state', () => {
  const s = fresh();
  s.plans = [{ id: 'p1', name: 'Pro', price: 49, interval: 'month', trialDays: 0, active: true }];
  assert.throws(() => savePlan(s, 'p1', { name: 'Pro', price: 59, interval: 'month', trialDays: 0, active: false }), /at least one active/);
  assert.equal(s.plans[0].active, true);
  assert.equal(s.plans[0].price, 49, 'nothing was written before the error');
  savePlan(s, null, { name: 'Draft', price: 10, interval: 'month', active: false }); // an inactive extra price is fine
  assert.throws(() => savePlan(s, 'p1', { name: 'Pro', price: 49, interval: 'month', active: false }), /at least one active/);
  const r = savePlan(s, 'p1', { name: 'Pro', price: 59, interval: 'month', trialDays: 7, active: true });
  assert.ok(r.changed && s.plans[0].price === 59);
});

test('the registered agent keeps renewing after year two', async () => {
  const { buildCalendar } = await import('../public/apps/legal/deadlines.js');
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp';
  s.apps.legal = { incorporation: { status: 'done', provider: 'clerky', effectiveDay: 0, operatingState: 'CA', jurisdiction: 'DE' }, paidFilings: {}, done: {} };
  const { PROVIDERS } = await import('../public/apps/legal/catalog.js');
  if (!(PROVIDERS.clerky?.agentAnnual > 0)) return; // provider without a paid agent: nothing to renew
  s.day = 365 * 3 + 10;
  const keys = buildCalendar(s).map((i) => i.key);
  assert.ok(keys.includes('agent-4'), `year-4 renewal listed (${keys.filter((k) => k.startsWith('agent')).join(',')})`);
});

test('redline counsel saying 0% is not read as a 50% coin flip', async () => {
  const { withRubric } = await import('../public/apps/legal/llm.js');
  const { CLAUSES } = await import('../public/apps/legal/redlines.js');
  const clauses = Object.keys(CLAUSES).slice(0, 2);
  const r = { clauses };
  const choices = Object.fromEntries(clauses.map((k) => [k, Object.keys(CLAUSES[k].options)[0]]));
  const rc = { hasMsa: false, dpaReady: false, soc2: 'none' };
  const no = withRubric({ data: { dealProbability: 0 }, mock: true }, r, choices, '', rc);
  const yes = withRubric({ data: { dealProbability: 0.9 }, mock: true }, r, choices, '', rc);
  const missing = withRubric({ data: {}, mock: true }, r, choices, '', rc);
  assert.ok(no.dealProbability <= 0.05 + 1e-9, `0% stays low (${no.dealProbability})`);
  assert.ok(yes.dealProbability > 0.8);
  assert.equal(missing.dealProbability, 0.5);
});
