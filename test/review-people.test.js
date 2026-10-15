// Regression tests for the People / Helpdesk / Success bug review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post, balance } from '../public/core/bank.js';
import { ensureStripe, mrr } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { dayOfMonth } from '../public/core/util.js';
import { ensurePeople, convertToEmployee, hireAgent, cancelAgent, offerContext } from '../public/apps/people/sim.js';
import { payrollLines } from '../public/apps/people/payroll.js';
import { supportBacklog } from '../public/apps/people/capacity.js';
import { langOf, NON_EN_SHARE } from '../public/apps/support/flow-lib.js';
import { ensureSuccess, syncAccounts, computeHealth, proposeRenewal, acceptCounter, subById } from '../public/apps/success/engine.js';
import { addContact, ensureDeal, closeWon, startProposal } from '../public/apps/sales/model.js';
import { ensureLegal } from '../public/apps/legal/sim.js';

function fresh(model = 'smb', seed = 7) {
  const s = newState({ companyName: 'Acme', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 300000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.hoursPerWeek = 70;
  return s;
}

test('converting a contractor pays the month-to-date invoice and salary starts on the conversion day', () => {
  const s = fresh();
  while (dayOfMonth(s) !== 20) s.day++;
  const p = ensurePeople(s);
  p.payrollSetup.gusto = true;
  const m = { id: 'mem_c1', name: 'Casey Contractor', role: 'engineer', jobRole: 'engineer', kind: 'contractor', engagement: 'contractor', region: 'us', status: 'active', startDay: s.day - 60, hourlyRate: 100, hoursPerWeek: 40, platformFeePct: 0, morale: 70 };
  p.members.push(m);
  const before = s.bank.txns.length;
  convertToEmployee(s, m.id, 150000);
  const inv = s.bank.txns.slice(before).filter((t) => t.category === 'contractors');
  assert.equal(inv.length, 1, 'final contractor invoice posted');
  assert.equal(Math.round(-inv[0].amount), Math.round(100 * 40 * (19 / 7)), 'days 1-19 of the month at the contractor rate');
  assert.ok(m.paidByYear && Object.values(m.paidByYear)[0] > 0, 'counts toward the 1099 total');
  // Pay period 16..end: salary only from the conversion day (day 20) on.
  const start = s.day - 4, end = s.day + 10;
  const [line] = payrollLines(s, p.members, { start, end });
  assert.ok(Math.abs(line.gross - (150000 / 24) * (11 / 15)) < 1, `gross ${line.gross}`);
});

test('cancelling the People support AI stops the Helpdesk agent it switched live and bills once', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const m = hireAgent(s, 'support_ai');
  s.apps.support = { active: true, ai: { status: 'live', viaPeople: true, monthResolutions: 80, flags: {} } };
  const before = s.bank.txns.length;
  cancelAgent(s, m.id);
  assert.equal(s.apps.support.ai.status, 'paused');
  assert.equal(s.apps.support.ai.monthResolutions, 0);
  const bills = s.bank.txns.slice(before).filter((t) => t.counterparty === 'Intercom');
  assert.equal(bills.length, 1);
  assert.ok(Math.abs(-bills[0].amount - 80 * 0.99) < 0.01, `${bills[0].amount}`);
  assert.equal(p.support.monthResolutions, 0);
  // Legacy save (no viaPeople flag) set live by People → paused; an agent the player set live in the Helpdesk stays live.
  const m2 = hireAgent(s, 'support_ai');
  s.apps.support.ai = { status: 'live', monthResolutions: 0, flags: {} };
  cancelAgent(s, m2.id);
  assert.equal(s.apps.support.ai.status, 'paused');
  const m3 = hireAgent(s, 'support_ai');
  s.apps.support.ai = { status: 'live', viaPeople: false, monthResolutions: 0, flags: { liveTested: true } };
  cancelAgent(s, m3.id);
  assert.equal(s.apps.support.ai.status, 'live');
});

test('support backlog counts the Helpdesk routine queue, not just written conversations', () => {
  const s = fresh();
  s.apps.support = { tickets: [{ status: 'open' }, { status: 'solved' }], queue: [{ day: 0, n: 5 }, { day: 1, n: 3 }] };
  assert.equal(supportBacklog(s), 9);
});

test('runway for offers does not count AI agents on recurring bills twice', () => {
  const s = fresh();
  ensurePeople(s); // adds the Claude Max seat as a member linked to its recurring bill
  const burn = s.recurring.filter((r) => r.active).reduce((a, r) => a + r.amount, 0) - mrr(s);
  assert.ok(Math.abs(offerContext(s).runwayMonths - balance(s) / burn) < 1e-6);
});

test('non-English customers spread across languages (unsigned hash)', () => {
  const s = fresh('b2c');
  const st = ensureStripe(s);
  for (let i = 0; i < 4000; i++) st.customers.push({ id: `cus_l${i}`, name: 'X', country: 'INTL' });
  const counts = {};
  for (let i = 0; i < 4000; i++) { const l = langOf(s, `cus_l${i}`); counts[l] = (counts[l] ?? 0) + 1; }
  const nonEn = 4000 - (counts.en ?? 0);
  assert.ok(Math.abs(nonEn / 4000 - NON_EN_SHARE.b2c * 1.6) < 0.05, `non-en ${nonEn}`);
  assert.ok(counts.es / nonEn < 0.4, `es share ${counts.es / nonEn}`); // weight 0.3; was ~0.65 with a signed shift
  for (const l of ['de', 'fr', 'pt', 'ja']) assert.ok(counts[l] / nonEn > 0.08, `${l} ${counts[l]}`);
});

function winCustomer(s) {
  const { contact } = addContact(s, { firstName: 'Ana', lastName: 'Lee', email: 'ana@buyer.com', title: 'VP Operations', company: 'Buyer', domain: 'buyer.com' });
  const d = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'qualified' });
  startProposal(s, d, { planId: s.plans[0].id, quantity: 2, annual: true });
  ensureLegal(s);
  d.contract = { sentDay: s.day, signDay: s.day, redlineId: null };
  closeWon(s, d);
  syncAccounts(s);
  return { sub: subById(s, d.subscriptionId), acct: ensureSuccess(s).accounts[d.subscriptionId] };
}
function freshCs(seed) {
  const s = fresh('ent', seed);
  s.apps.product = { features: [{ id: 'f1', title: 'Reconciliation', status: 'shipped' }], bugs: [] };
  s.market.fit.product.score = 0.6;
  s.plans[0].price = 24000;
  return s;
}

test('account health reads the Helpdesk first-response time once the Helpdesk owns support', () => {
  const s = freshCs(3);
  const { acct } = winCustomer(s);
  s.apps.people = { support: { lastWeek: { churnMult: 1 } } }; // People mirrors a flat 1 when the Helpdesk is active
  s.apps.support = { active: true, metrics: { firstResponseHours: 0.5 } };
  const fast = computeHealth(s, acct);
  s.apps.support.metrics.firstResponseHours = 100;
  const slow = computeHealth(s, acct);
  assert.ok(fast > slow, `${fast} vs ${slow}`);
});

test('a stale counter-offer cannot revive a lost renewal or override agreed terms', () => {
  let checked = 0;
  for (let seed = 1; seed <= 30 && checked < 2; seed++) {
    const s = freshCs(seed);
    const { sub, acct } = winCustomer(s);
    if (!sub) continue;
    acct.health = 15;
    acct.renewal = { id: 'rn_t', periodEnd: sub.currentPeriodEnd, status: 'open', window: 90, terms: null, offers: [{ upliftPct: 0.2, discountPct: 0, years: 1, decision: 'counter' }], counter: { upliftPct: 0, discountPct: 0.15, years: 1, text: 'flat renewal with a discount' }, createdDay: s.day };
    const r = proposeRenewal(s, acct, { upliftPct: 0.2 }); // holding firm: accept or walk, never a new counter
    assert.notEqual(r.decision, 'counter');
    assert.equal(acct.renewal.counter, null, 'old counter cleared');
    if (acct.renewal.status === 'lost') assert.throws(() => acceptCounter(s, acct));
    checked++;
  }
  assert.ok(checked >= 2);
});

test('option pool: a leaver frees only their unvested options', async () => {
  const { poolUsed } = await import('../public/apps/people/sim.js');
  const g = { pct: 1, vestStart: 0, cliffDay: 365, vestYears: 4, status: 'granted' };
  const p = { members: [
    { status: 'active', equityPct: 0.5, grant: { ...g, pct: 0.5 } },
    { status: 'gone', equityPct: 1, endDay: 730, grant: g }, // left after 2 years: ~half vested stays
    { status: 'gone', equityPct: 1, endDay: 200, grant: g }, // left before the cliff: all returns
  ] };
  const used = poolUsed(p);
  assert.ok(used > 0.95 && used < 1.05, `used ${used}`);
});
