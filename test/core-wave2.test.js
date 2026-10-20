// Wave-2 core regressions: renewal churn at each subscription's own price, mail and time-log retention, calendar-month
// Stripe archive keys, moveEvent check order, integrity mistakes filed under a real operator function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, spendHours } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket, churnBeforeRenewal, subPlan } from '../public/core/market.js';
import { ensureMail, newThread, addMessage, pruneMail, MAIL_RETENTION } from '../public/core/mail.js';
import { scheduleEvent, moveEvent } from '../public/core/calendar.js';
import { penalize, functionForAudience } from '../public/core/integrity.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import { monthKey } from '../public/core/util.js';

function fresh(seed = 5) {
  const s = newState({ companyName: 'Wave Co', model: 'smb', path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 5e6, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Reminders', status: 'shipped', shippedDay: 0 }], bugs: [] };
  s.market.fit.product.score = 0.45;
  s.market.fit.price.wtp = 79;
  return s;
}
const plan = (price, id = 'p1') => ({ id, name: 'Pro', price, interval: 'month', trialDays: 0, active: true });

test('churn: a sub on the main plan at list price churns exactly as before (main-plan price factor)', () => {
  const s = fresh();
  s.plans = [plan(49)];
  for (const paidMonths of [1, 3, 12]) {
    const onMain = { interval: 'month', paidMonths, price: 49, quantity: 3, discountPct: 0.1 };
    // The no-price form is the pre-change formula (priceFactor/underpricing of the main plan).
    assert.equal(churnBeforeRenewal(s, onMain), churnBeforeRenewal(s, { interval: 'month', paidMonths }));
  }
  assert.equal(subPlan(s, { price: 49, interval: 'month' }).price, 49);
  // No list price yet: neutral, as before, even for an ad-hoc-priced sub.
  const t = fresh(); t.plans = [];
  assert.equal(churnBeforeRenewal(t, { interval: 'month', paidMonths: 1, price: 500 }), churnBeforeRenewal(t, { interval: 'month', paidMonths: 1 }));
});

test('churn: raising list price does not raise grandfathered customers\' churn; new-price customers churn more', () => {
  const s = fresh();
  s.plans = [plan(49)];
  const old = { interval: 'month', paidMonths: 4, price: 49 };
  const before = churnBeforeRenewal(s, old);
  s.plans = [plan(149, 'p2')];
  assert.equal(churnBeforeRenewal(s, old), before, 'grandfathered sub keeps its churn');
  assert.ok(churnBeforeRenewal(s, { interval: 'month', paidMonths: 4, price: 149 }) > before, 'above-WTP price churns more');
  // A price cut for new customers does not lower everyone's churn either.
  s.plans = [plan(29, 'p3')];
  assert.equal(churnBeforeRenewal(s, old), before);
});

test('mail: pruning keeps the inbox bounded and never drops referenced or unread threads', () => {
  const s = fresh();
  s.apps.crm = { contacts: [] };
  const keepRef = [], keepUnread = [];
  for (let d = 0; d < 720; d++) {
    s.day = d;
    for (let i = 0; i < 3; i++) {
      const t = newThread(s, { subject: `Inbound ${d}.${i}`, with: { name: 'X' }, kind: 'network', refId: `inb_${d}_${i}` });
      addMessage(s, t.id, { from: 'them', body: 'hi' });
      if (i === 0 && d % 100 === 0) { s.apps.crm.contacts.push({ id: `c${d}`, threadId: t.id }); keepRef.push(t.id); }
      else if (i === 1 && d % 150 === 0) keepUnread.push(t.id);
      else t.unread = false;
    }
    if (d % MAIL_RETENTION.everyDays === 0) pruneMail(s);
  }
  const ids = new Set(ensureMail(s).threads.map((t) => t.id));
  assert.ok(ensureMail(s).threads.length <= MAIL_RETENTION.cap + keepRef.length + keepUnread.length + 3 * MAIL_RETENTION.everyDays, `bounded: ${ensureMail(s).threads.length}`);
  for (const id of keepRef) assert.ok(ids.has(id), 'thread held by an app survives');
  for (const id of keepUnread) assert.ok(ids.has(id), 'unread thread survives');
  // A thread whose refId points at a live record survives too.
  s.day = 2000;
  const t = newThread(s, { subject: 'Deal', with: { name: 'Y' }, refId: 'deal_live' });
  t.lastDay = 0;
  s.apps.crm.deals = [{ id: 'deal_live' }];
  pruneMail(s);
  assert.ok(ensureMail(s).threads.includes(t));
});

test('mail: the clock prunes during a long idle run', () => {
  const s = fresh(9);
  for (let i = 0; i < 1500; i++) { const t = newThread(s, { subject: `Old ${i}`, with: { name: 'Z' } }); t.lastDay = -400; }
  advance(s, 31, []);
  assert.ok(ensureMail(s).threads.length < 1500 - 500, `pruned: ${ensureMail(s).threads.length}`);
});

test('timeLog: background appends are trimmed by the daily tick', () => {
  const s = fresh(3);
  s.founder.timeLog = Array.from({ length: 1500 }, (_, i) => ({ day: 0, hours: 0.1, label: `bg ${i}` }));
  advance(s, 1, []);
  assert.ok(s.founder.timeLog.length <= 1000, `len ${s.founder.timeLog.length}`);
  assert.equal(s.founder.timeLog.at(-1).label === 'bg 1499' || s.founder.timeLog.some((e) => e.label === 'bg 1499'), true, 'newest entries kept');
  spendHours(s, 0.5, 'x');
  assert.ok(s.founder.timeLog.length <= 1000);
});

test('stripe: archived charges and subs are keyed by calendar month', () => {
  const s = fresh(4);
  s.plans = [plan(49)];
  for (let i = 0; i < 5; i++) { const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, country: 'US' }); subscribe(s, c.id, s.plans[0], { trial: false }); }
  advance(s, 240, []);
  const keys = Object.keys(s.stripe.archive);
  assert.ok(keys.length > 0, 'something archived');
  for (const k of keys) assert.match(k, /^\d{4}-\d{2}$/);
  assert.ok(keys.includes(monthKey(s, 0)));
});

test('calendar: moving an event into the past says so, not "conflicts with"', () => {
  const s = fresh(6);
  s.day = 1;
  scheduleEvent(s, { title: 'Blocker', kind: 'meeting', day: 5, start: 600, duration: 60, allowConflict: true });
  s.day = 10;
  const e = scheduleEvent(s, { title: 'Call', kind: 'meeting', day: 12, start: 600, duration: 30 });
  assert.throws(() => moveEvent(s, e.id, 5, 600), /past/);
});

test('integrity: penalize files mistakes under a function that has operator tiers', () => {
  for (const a of ['investor', 'customer', 'candidate', 'lender', 'processor', 'platform', 'board', 'unknown_audience']) {
    assert.ok(OPERATOR_TIERS[functionForAudience(a)], `${a} -> ${functionForAudience(a)}`);
  }
  const s = fresh(8);
  penalize(s, [{ id: 'c1', metric: 'mrr', claimed: 2000, truth: 1000, gap: 0.5 }], { audience: 'investor', label: 'Test' });
  assert.equal(s.mistakes.at(-1).functionId, 'fundraising');
});
