// Regression tests for the core-engine bug sweep (public/core, public/data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { isoDate, isLastDayOfMonth } from '../public/core/util.js';

function fresh(model = 'smb', seed = 11) {
  const s = newState({ companyName: 'Sweep Co', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s);
  return s;
}

test('LLC estimated tax counts lines an app posts at month end after founder pay (usage bills, payroll)', () => {
  const s = fresh();
  s.personal.liquidSavings = 100000;
  // An app that bills at month end (like the Bank app's usage hosting) runs after payFounder on the last day.
  const app = { id: 'biller', onMonthEnd: (st) => post(st, { amount: -1000, counterparty: 'Vercel', category: 'hosting' }) };
  advance(s, 3, [app]);
  post(s, { amount: 5000, counterparty: 'Stripe', category: 'stripe_payout' }); // November income
  while (!isLastDayOfMonth(s)) advance(s, 1, [app]); // Nov 30: the month-end bill posts
  advance(s, 1, [app]); // Dec 1: November is accrued
  assert.equal(isoDate(s), '2026-12-01');
  assert.equal(s.personal.estTax.profit, 4000, 'income 5000 minus the 1000 month-end bill');
  advance(s, 1, [app]);
  assert.equal(s.personal.estTax.profit, 4000, 'a month is accrued once');
});

test('an old save whose month-end accrual already ran is not accrued twice on the 1st', () => {
  const s = fresh();
  advance(s, 3, []);
  post(s, { amount: 5000, counterparty: 'Stripe', category: 'stripe_payout' });
  while (!isLastDayOfMonth(s)) advance(s, 1, []);
  // What the old code left on Nov 30: November already accrued, no `through` marker.
  s.personal.estTax = { year: 2026, profit: 5000, paid: 0, prev: null };
  advance(s, 1, []);
  assert.equal(s.personal.estTax.profit, 5000);
});

test('paying movers ("fewer lost days") really cuts the capacity a move costs; DIY does not', async () => {
  const { ensureWellbeing, respondLife, lifeEventTypes } = await import('../public/core/wellbeing.js');
  const move = lifeEventTypes().find((e) => e.id === 'moving_home');
  const run = (resp) => {
    const s = fresh();
    const wb = ensureWellbeing(s);
    const ev = { id: 'life_x', type: 'moving_home', label: move.label, day: s.day, status: 'needs_response', capacityMult: 0.75, durationDays: 30, responses: move.playerResponses };
    wb.events.unshift(ev);
    wb.effects.push({ id: ev.id, label: ev.label, capacityMult: 0.75, untilDay: s.day + 30 });
    const used = s.founder.hoursUsed;
    respondLife(s, ev.id, resp);
    return { cap: wb.effects[0].capacityMult, hours: s.founder.hoursUsed - used, logged: (s.founder.timeLog ?? []).some((x) => x.label.includes(ev.label)) };
  };
  const movers = run('movers'), diy = run('diy');
  assert.ok(movers.cap >= 0.85, `movers keep most capacity (${movers.cap})`);
  assert.equal(diy.cap, 0.75, 'doing it yourself loses the days');
  assert.equal(movers.hours, 10);
  assert.ok(movers.logged, 'the response hours are in the time log');
});

test('a paused subscription whose price changed during the pause resumes at its real MRR (events tie to MRR)', async () => {
  const S = await import('../public/core/stripe.js');
  const { pauseSub, pauseAtRenewal } = await import('../public/core/churn.js');
  const s = fresh();
  const c = S.createCustomer(s, { name: 'A', email: 'a@x.com' });
  const sub = S.subscribe(s, c.id, { id: 'p', price: 100, interval: 'month', trialDays: 0 });
  sub.status = 'active';
  pauseSub(s, sub, null);
  S.changePrice(s, sub.id, { price: 120 }); // e.g. a coupon ending while paused: no MRR event (paused = 0)
  s.day = sub.pause.untilDay;
  pauseAtRenewal(s, sub);
  assert.equal(s.stripe.events.at(-1).type, 'expansion');
  assert.equal(s.stripe.events.at(-1).amount, 120);
  const evSum = s.stripe.events.filter((e) => e.subId === sub.id).reduce((a, e) => a + e.amount, 0);
  assert.equal(Math.round(evSum * 100) / 100, S.monthlyAmount(sub));
});

test('following confidently wrong advice really spends the money the mistakes ledger charges', async () => {
  const { addSource, adviceFor, followAdvice } = await import('../public/core/advice.js');
  const { balance } = await import('../public/core/bank.js');
  const s = fresh();
  post(s, { amount: 10000, counterparty: 'me', category: 'owner_contribution' });
  addSource(s, { kind: 'advisor', name: 'Loud', expertise: 'finance', quality: 'bad' });
  const [w] = adviceFor(s, 'cash_runway', ['Cut burn to extend runway past 18 months.']);
  assert.equal(w.truth, 'wrong');
  const before = balance(s);
  const r = followAdvice(s, w.id);
  assert.ok(r.mistake.cost.usd > 0);
  assert.equal(Math.round((before - balance(s)) * 100) / 100, r.mistake.cost.usd);
  followAdvice(s, w.id);
  assert.equal(Math.round((before - balance(s)) * 100) / 100, r.mistake.cost.usd, 'charged once');
});

test('Stripe Capital withholds from Stripe card payments, not from App Store proceeds', async () => {
  const S = await import('../public/core/stripe.js');
  const { bookBusinessLoan } = await import('../public/core/debt.js');
  const L = await import('../public/data/lenders.js');
  const s = fresh('b2c');
  const product = L.LENDER_PRODUCTS.find((x) => x.id === 'stripe_capital');
  bookBusinessLoan(s, product, { productId: 'stripe_capital', name: 'Stripe Capital', kind: product.kind, amount: 5000, apr: 0 });
  s.day += 3; // withholding starts two days after funding
  const plan = { id: 'p', price: 50, interval: 'month', trialDays: 0 };
  for (let i = 0; i < 10; i++) {
    const c = S.createCustomer(s, { name: `c${i}`, email: `c${i}@x.com`, country: 'US' });
    S.subscribe(s, c.id, plan, i % 2 ? { fields: { store: 'ios', mobile: true } } : {});
  }
  const ok = s.stripe.charges.filter((c) => c.status === 'succeeded');
  assert.ok(ok.some((c) => c.store) && ok.some((c) => !c.store));
  for (const c of ok) assert.equal(Boolean(c.capitalWithheld), !c.store, `${c.method} charge`);
});

test('rubric helpers: a criterion a judge left null is unscored, not a 1', async () => {
  const { averageScores } = await import('../public/core/rubric-fields.js');
  const { hasScores } = await import('../public/core/rubric-schema.js');
  const crit = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
  assert.deepEqual(averageScores([{ a: 5, b: null }, { a: 3, b: 4 }], crit).scores, { a: 4, b: 4 });
  assert.equal(hasScores({ a: null, b: '' }, crit), false);
  assert.equal(hasScores({ a: 0 }, crit), true);
});

test('lenders whose application text says "usually hard pull" or "hard pull when you accept" do pull credit', async () => {
  const L = await import('../public/data/lenders.js');
  const { misstatedFor } = await import('../public/core/debt.js');
  const { setStatedProfile } = await import('../public/core/personal.js');
  const s = fresh();
  setStatedProfile(s, { fico: s.personal.fico + 80 }); // overstated score: only a credit pull reads it
  for (const id of ['pl_credit_union', 'pl_business_ok', 'pl_prime_online']) {
    const p = L.LENDER_PRODUCTS.find((x) => x.id === id);
    assert.ok(misstatedFor(s, p).includes('fico'), `${id} checks the credit report`);
  }
  const soft = L.LENDER_PRODUCTS.find((x) => x.id === 'online_loc');
  assert.ok(!misstatedFor(s, soft).includes('fico'), 'a soft-pull product does not');
});
