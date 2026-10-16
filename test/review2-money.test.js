// Regression tests from the second money/legal bug review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, addRecurring } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensurePersonal } from '../public/core/personal.js';
import { isWeekend } from '../public/core/util.js';
import { APPS } from '../public/apps/registry.js';
import { incorporate, signFounderDocs, ensureLegal, legalDay, setupDpa, setupContracts, setPolicies } from '../public/apps/legal/sim.js';
import { ensureBooks } from '../public/apps/money/ledger.js';
import { registerNexus } from '../public/apps/money/compliance.js';
import { cancelBill } from '../public/apps/bank.js';
import services, { servicesSlice, SERVICES } from '../public/apps/services.js';

const LEGAL_APPS = APPS.filter((a) => a.id === 'legal');

function fresh(seed = 3) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
}
const cash = (s) => s.bank.accounts[0].balance;

test('a missed 83(b) election actually takes the vesting tax out of personal savings', () => {
  const s = fresh();
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  advance(s, 3, LEGAL_APPS);
  signFounderDocs(s, {});
  const L = ensureLegal(s);
  Object.assign(L.founderStock, { grantDay: s.day - 390, missed: true }); // past the cliff, on a monthly vesting day
  s.apps.fundraising = { lastPostMoney: 12_000_000 }; // $1/share FMV
  const p = ensurePersonal(s);
  p.liquidSavings = 50000;
  legalDay(s);
  const t = L.personalTax.at(-1);
  assert.ok(t.tax > 1000, 'vesting income taxed');
  assert.ok(Math.abs(p.liquidSavings - (50000 - t.tax)) < 0.01, `savings ${p.liquidSavings} should drop by ${t.tax}`);
});

test('canceling a vendor-suspended health plan moves the premium back into personal living costs', () => {
  const s = fresh();
  const p = ensurePersonal(s);
  const living0 = p.monthlyLivingCosts;
  const r = addRecurring(s, { vendor: 'Health insurance (marketplace plan)', amount: 600, category: 'other' });
  r.personalOffset = 600;
  p.monthlyLivingCosts -= 600; // what subscribing does (bank.js healthOffset)
  Object.assign(r, { active: false, suspended: true }); // vendor suspended it after declines; offset never removed
  cancelBill(s, r.id);
  assert.equal(p.monthlyLivingCosts, living0);
  assert.ok(!s.recurring.includes(r));
});

test('registering for sales-tax nexus twice does not charge the back tax twice', () => {
  const s = fresh();
  const b = ensureBooks(s);
  const y = new Date(`${s.startDate}T12:00:00Z`).getUTCFullYear();
  b.sales[y] = { TX: 700000 };
  b.nexus.TX = { crossedDay: s.day - 90, registered: false };
  const c0 = cash(s);
  const back = registerNexus(s, 'TX');
  assert.ok(back > 0);
  assert.throws(() => registerNexus(s, 'TX'), /Already registered/);
  assert.ok(Math.abs(cash(s) - (c0 - back)) < 0.01);
});

test('paid legal setup actions cannot be bought twice (DPA, MSA, same policy option)', () => {
  const s = fresh();
  setupDpa(s, 'lawyer');
  const c1 = cash(s);
  assert.throws(() => setupDpa(s, 'lawyer'), /already/);
  setupContracts(s, 'lawyer');
  const c2 = cash(s);
  assert.ok(c2 < c1);
  assert.throws(() => setupContracts(s, 'lawyer'), /already/);
  setPolicies(s, 'lawyer');
  const c3 = cash(s);
  assert.throws(() => setPolicies(s, 'lawyer'), /already/);
  assert.equal(cash(s), c3);
});

// Run the services app day by day (no full clock) until `until` returns true.
function runServices(s, until, max = 120) {
  for (let i = 0; i < max && !until(); i++) { s.day++; services.onDay(s); }
}
function project(s, { deposit }) {
  const sl = servicesSlice(s);
  sl.offers = [];
  while (isWeekend(s)) s.day++;
  const p = { id: `svp_${deposit}`, client: 'Kestrel Realty', label: 'Custom build / integration', kind: 'build', fixed: true, weeks: 1, hoursPerWeek: 10, totalHours: 10, fee: 4000, rate: 150, status: 'active', startDay: s.day - 7, endDay: s.day + 1, hoursDone: 10, paid: deposit ? 2000 : 0, deposit, scopeCreep: 0 };
  sl.projects.push(p);
  return p;
}

test('services: delivered without a deposit, the invoice is paid net-30 (not on handover)', () => {
  const s = fresh();
  const p = project(s, { deposit: false });
  const save = SERVICES.noDepositBadDebtP;
  SERVICES.noDepositBadDebtP = 0;
  try {
    runServices(s, () => p.status === 'done');
    assert.equal(p.paid, 0, 'nothing collected at delivery');
    assert.equal(p.receivable, 4000);
    runServices(s, () => p.paid > 0);
    assert.equal(p.paid, 4000);
    assert.ok(s.day >= p.doneDay + SERVICES.noDepositPayDays);
  } finally { SERVICES.noDepositBadDebtP = save; }
});

test('services: a client who walks on a no-deposit invoice is a written-off, logged mistake; a deposit project is paid on delivery', () => {
  const s = fresh();
  const p = project(s, { deposit: false });
  const save = SERVICES.noDepositBadDebtP;
  SERVICES.noDepositBadDebtP = 1;
  try {
    runServices(s, () => p.status === 'done' && !(p.receivable > 0));
    assert.equal(p.paid, 0);
    assert.equal(p.writtenOff, 4000);
    assert.ok(s.mistakes.some((m) => m.id === 'services_no_deposit_unpaid'));
  } finally { SERVICES.noDepositBadDebtP = save; }
  const s2 = fresh(4);
  const q = project(s2, { deposit: true });
  runServices(s2, () => q.status === 'done');
  assert.equal(q.paid, 4000);
});
