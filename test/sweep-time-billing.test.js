// Billing periods follow the calendar like Stripe's billing anchor: monthly plans renew on the same day of the month
// (clamped in short months), yearly plans on the same date next year. A flat 30-day period billed ~12.2 times a year.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe, periodDays } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { isoDate } from '../public/core/util.js';
import { dayForIso } from '../public/apps/money/common.js';
import { syncLedger, ensureBooks } from '../public/apps/money/ledger.js';

const mk = () => {
  const s = newState({ companyName: 'Cal Co', model: 'smb', path: 'indie', founderName: 'F', seed: 5 });
  ensureStripe(s); ensureMarket(s);
  return s;
};

test('monthly anchor: Jan 31 renews Feb 28, then Mar 31; twelve periods make one calendar year', () => {
  const s = mk();
  const sub = { interval: 'month' };
  let day = dayForIso(s, '2027-01-31');
  const ends = [];
  for (let i = 0; i < 12; i++) { day += periodDays(s, sub, day); ends.push(isoDate(s, day)); }
  assert.deepEqual(ends.slice(0, 3), ['2027-02-28', '2027-03-31', '2027-04-30']);
  assert.equal(ends.at(-1), '2028-01-31', '12 monthly renewals per year, not 12.2');
});

test('yearly anchor handles leap years; weekly stays 7 days; an off-anchor start re-anchors', () => {
  const s = mk();
  const y = { interval: 'year' };
  const d = dayForIso(s, '2028-02-29');
  assert.equal(isoDate(s, d + periodDays(s, y, d)), '2029-02-28');
  assert.equal(periodDays(s, { interval: 'year' }, dayForIso(s, '2027-03-01')), 366); // spans Feb 29 2028
  assert.equal(periodDays(s, { interval: 'week' }), 7);
  // Anchor 1 but the period starts on the 31st (a pause ending): never a 1-day period.
  const sub = { interval: 'month', billingAnchor: 1 };
  assert.equal(isoDate(s, dayForIso(s, '2027-01-31') + periodDays(s, sub, dayForIso(s, '2027-01-31'))), '2027-02-28');
});

test('a new subscription ends its first period on the same date next month, and the books defer over that period', () => {
  const s = mk();
  s.day = dayForIso(s, '2027-01-15');
  ensureBooks(s);
  const c = createCustomer(s, { name: 'A', email: 'a@x.com' });
  const sub = subscribe(s, c.id, { id: 'p', price: 31, interval: 'month', trialDays: 0 });
  assert.equal(isoDate(s, sub.currentPeriodEnd), '2027-02-15');
  syncLedger(s);
  const ch = s.stripe.charges.find((x) => x.subId === sub.id && x.status !== 'failed');
  assert.ok(ch, 'first charge succeeded');
  const sched = s.apps.books.schedules.find((x) => x.id === ch.id);
  assert.equal(sched.len, 31, 'recognized over the 31 days Jan 15 → Feb 15');
});
