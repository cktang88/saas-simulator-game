// Regression tests from the third money/fundraising bug hunt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ledgerByMonth, trueLedger, ensureBooks, profitAndLoss, allMonths } from '../public/apps/money/ledger.js';
import { cpaQuote, fileWithCpa, fileExtension } from '../public/apps/money/compliance.js';
import { dayForIso } from '../public/apps/money/common.js';

function fresh(seed = 3) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
}
const sumAcct = (L, a) => Object.values(L).reduce((x, j) => x + (j[a] ?? 0), 0);

test('an RBF fee is interest expense even while a founder loan is outstanding', () => {
  const s = fresh();
  post(s, { amount: 50000, counterparty: 'Pat', description: 'Founder loan to company', category: 'loan' });
  post(s, { amount: 100000, counterparty: 'Lighter-style RBF', description: 'Revenue-based financing advance', category: 'loan' });
  // Repay the RBF cap (1.5x) in combined lines.
  for (let i = 0; i < 3; i++) post(s, { amount: -50000, counterparty: 'Lighter-style RBF', description: 'repay', category: 'loan_repayment' });
  const L = trueLedger(s);
  assert.ok(Math.abs(-sumAcct(L, '2600') - 50000) < 0.01, `founder loan still owed in full (2600 = ${-sumAcct(L, '2600')})`);
  assert.ok(Math.abs(sumAcct(L, '7100') - 50000) < 0.01, `RBF fee booked as financing cost (7100 = ${sumAcct(L, '7100')})`);
  assert.equal(Math.round(sumAcct(ledgerByMonth(s), '7100')), Math.round(sumAcct(L, '7100')));
});

test('a 7004 extension delays filing, not paying: tax paid after Apr 15 owes a late-payment penalty and interest', () => {
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp'; s.company.incorporatedDay = 0;
  ensureBooks(s);
  post(s, { amount: 300000, counterparty: 'NSF SBIR', description: 'SBIR PHASE I', category: 'grant', method: 'ach' });
  s.day = dayForIso(s, '2027-04-10');
  const onTime = cpaQuote(s, 2026);
  assert.ok(onTime.balanceDue > 10000 && onTime.latePayPenalty === 0 && onTime.latePenalty === 0, JSON.stringify(onTime));
  fileExtension(s, 2026);
  s.day = dayForIso(s, '2027-08-20');
  const q = cpaQuote(s, 2026);
  assert.equal(q.latePenalty, 0, 'filed within the extension: no failure-to-file penalty');
  assert.ok(q.latePayPenalty > q.balanceDue * 0.03, `late payment costs money (${q.latePayPenalty} on ${q.balanceDue})`);
  const cash = s.bank.accounts[0].balance;
  fileWithCpa(s, 2026);
  assert.ok(Math.abs(cash - s.bank.accounts[0].balance - (q.fee + q.balanceDue + q.latePayPenalty + q.underpaymentPenalty)) < 0.01, 'what the CPA modal quotes is what is paid');
});

test('investor metrics count cash swept to Treasury as cash (runway is not understated)', async () => {
  const { computeMetrics } = await import('../public/apps/fundraising/metrics.js');
  const s = fresh();
  s.bank.accounts.push({ id: 'treasury', name: 'Treasury', type: 'treasury', balance: 0 });
  post(s, { amount: -150000, counterparty: 'Mercury Treasury', description: 'TRANSFER TO TREASURY', category: 'transfer', method: 'internal', accountId: 'checking' });
  post(s, { amount: 150000, counterparty: 'Mercury Checking', description: 'TRANSFER FROM CHECKING', category: 'transfer', method: 'internal', accountId: 'treasury' });
  const m = computeMetrics(s);
  assert.equal(Math.round(m.cash), Math.round(s.bank.accounts.reduce((a, x) => a + x.balance, 0)));
});

test('sales-tax nexus: registering after New Year still owes last year\'s uncollected tax', async () => {
  const { registerNexus } = await import('../public/apps/money/compliance.js');
  const s = fresh();
  const b = ensureBooks(s);
  b.sales[2026] = { TX: 700000 };
  b.nexus.TX = { crossedDay: dayForIso(s, '2026-11-20'), registered: false };
  s.day = dayForIso(s, '2027-02-10');
  b.sales[2027] = { TX: 40000 };
  const back = registerNexus(s, 'TX');
  assert.equal(back, Math.round((200000 + 40000) * 0.065 * 1.1));
});

test('real investor check sizes parse thousands separators ("$50,000" is not $50)', async () => {
  const { parseCheck } = await import('../public/apps/fundraising/investors.js');
  assert.deepEqual(parseCheck('$50,000 - $250,000'), [50000, 250000]);
  assert.deepEqual(parseCheck('$1,000,000'), [1000000, 1000000]);
  assert.deepEqual(parseCheck('$25K-$100K'), [25000, 100000]);
});

test('services revenue (4200) is in the P&L on both bases, so it is taxed and shown', async () => {
  const { yearIncome } = await import('../public/apps/money/compliance.js');
  const s = fresh();
  const before = yearIncome(s, 2026).preTax;
  post(s, { amount: 12000, counterparty: 'Client Co', description: 'Consulting (fixed fee)', category: 'services_revenue' });
  const months = allMonths(s);
  for (const basis of ['accrual', 'cash']) {
    const pl = profitAndLoss(s, months, basis);
    assert.ok(pl.sections[0].lines.some((l) => l.acct === '4200'), `${basis}: 4200 listed`);
    assert.ok(Math.abs(pl.revenue.reduce((a, v) => a + v, 0) - 12000) < 0.01, `${basis}: revenue includes the fee`);
  }
  assert.ok(Math.abs(yearIncome(s, 2026).preTax - before - 12000) < 0.01, 'pre-tax income includes services revenue');
});

test('cap table option grants: same-name holders and re-grants get their own frozen share counts', async () => {
  const { fundraisingDay, ensureFr } = await import('../public/apps/fundraising/sim.js');
  const s = fresh();
  s.day = 10;
  const mk = (id, name, pct, vestStart) => ({ id, name, status: 'active', kind: 'human', startDay: 0, equityPct: pct, grant: { status: 'granted', vestStart, cliffDay: vestStart + 365, vestYears: 4, pct } });
  s.apps.people = { members: [mk('p1', 'Alex', 1, 0), mk('p2', 'Alex', 0.5, 5)] };
  const fr = ensureFr(s);
  fundraisingDay(s);
  const sh = fr.cap.grants.map((g) => g.shares);
  assert.equal(sh.length, 2);
  assert.ok(sh[0] > 0 && Math.abs(sh[0] - 2 * sh[1]) <= 1, `two Alexes keep their own grants (${sh})`);
  // A re-grant to the same person (new %, new vesting start) is not frozen at the old count.
  s.apps.people.members[1].equityPct = 2; s.apps.people.members[1].grant.vestStart = 8;
  fundraisingDay(s);
  assert.ok(fr.cap.grants[1].shares > 3 * sh[1], 'the bigger re-grant shows on the cap table');
  // Old saves keyed by name are adopted, not recomputed.
  const s2 = fresh();
  s2.apps.people = { members: [mk('p1', 'Sam', 1, 0)] };
  const fr2 = ensureFr(s2);
  fr2.grantShares = { Sam: 12345 };
  fundraisingDay(s2);
  assert.equal(fr2.cap.grants[0].shares, 12345);
});

test('a Form 1120 that is never filed is forced ~6 months later with penalties, interest and a charged mistake', async () => {
  const { complianceDay, fileWithCpa } = await import('../public/apps/money/compliance.js');
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp'; s.company.incorporatedDay = 0;
  const b = ensureBooks(s);
  post(s, { amount: 300000, counterparty: 'NSF SBIR', description: 'SBIR PHASE I', category: 'grant', method: 'ach' });
  s.day = dayForIso(s, '2027-04-20');
  complianceDay(s);
  assert.equal(b.compliance['1120-2027'].status, 'overdue');
  s.day = dayForIso(s, '2027-08-01');
  const n0 = s.bank.txns.length;
  complianceDay(s);
  assert.equal(s.bank.txns.length, n0, 'not yet assessed before ~180 days');
  s.day = dayForIso(s, '2027-10-20');
  const cash = s.bank.accounts[0].balance;
  complianceDay(s);
  assert.equal(b.compliance['1120-2027'].status, 'assessed');
  const paid = cash - s.bank.accounts[0].balance;
  const m = s.mistakes.find((x) => x.id === 'return_ignored');
  assert.ok(m && m.cost.usd > 10000, `charged mistake with penalties (${m?.cost.usd})`);
  const irs = s.bank.txns.filter((t) => t.counterparty === 'IRS' && t.meta?.compliance === '1120-2027');
  assert.ok(irs.length === 1 && -irs[0].amount > m.cost.usd - 750, 'tax balance plus penalties paid to the IRS');
  assert.ok(paid > m.cost.usd, `penalties left the bank (${paid})`);
  const n1 = s.bank.txns.length;
  complianceDay(s);
  assert.equal(s.bank.txns.length, n1, 'assessed once');
  assert.throws(() => fileWithCpa(s, 2026), /already filed/);
});

test('exit waterfall is cash-free, debt-free: company cash goes to the sellers', async () => {
  const { newCapTable, waterfall } = await import('../public/apps/fundraising/captable.js');
  const cap = newCapTable('Pat');
  const a = waterfall(cap, 1_000_000, { debt: 150_000, fees: 60_000 });
  const b = waterfall(cap, 1_000_000, { debt: 150_000, fees: 60_000, cash: 100_000 });
  assert.equal(Math.round(b.founderTake - a.founderTake), 100_000);
  assert.equal(Math.round(b.proceeds), 890_000);
});

test('grant share counts move from the terms key to the People id without recomputing', async () => {
  const { fundraisingDay, ensureFr, grantKey } = await import('../public/apps/fundraising/sim.js');
  const s = fresh();
  s.day = 10;
  s.apps.people = { members: [{ id: 'p9', name: 'Kim', status: 'active', kind: 'human', startDay: 0, equityPct: 1, grant: { status: 'granted', vestStart: 0, cliffDay: 365, vestYears: 4, pct: 1 } }] };
  const fr = ensureFr(s);
  fr.grantShares = { [grantKey({ name: 'Kim', vestingStartDay: 0, pct: 1 })]: 4242 };
  fundraisingDay(s);
  assert.equal(fr.cap.grants[0].shares, 4242);
  assert.equal(fr.grantShares['id:p9|0|1'], 4242);
});
