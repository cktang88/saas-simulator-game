// Regression tests for shell/home/market/outcomes bugs found in the adversarial bug hunt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { nextSteps } from '../public/apps/home.js';

const base = ({ model = 'smb', path = 'vc', day = 200 } = {}) => {
  const s = newState({ companyName: 'Ledgerly', model, path, founderName: 'F', seed: 7 });
  s.day = day;
  s.company.icp = 'Finance leads at 20-200 person Shopify brands';
  return s;
};
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('Home: trials canceled before their trial ended count as not converted, not as paid', () => {
  const s = base();
  // 20 trials: 1 converted, 19 canceled mid-trial (e.g. a helpdesk cancel on a trialing sub) with a non-trial reason.
  ensureStripe(s).subscriptions = range(20, (i) => (i === 0
    ? { id: `s${i}`, status: 'active', startDay: 150, trialEndDay: 164, cancelReason: null, canceledDay: null }
    : { id: `s${i}`, status: 'canceled', startDay: 150 + i, trialEndDay: 164 + i, cancelReason: 'felt_ignored', canceledDay: 155 + i }));
  const steps = nextSteps(s).map(([t]) => t);
  assert.ok(steps.some((t) => /Trial-to-paid is 5%/.test(t)), steps.join(' / '));
  // Those trials never paid, so they are not "paying customers who cancelled".
  assert.ok(!steps.some((t) => /paying customers cancelled/.test(t)), steps.join(' / '));
});

import { normalizeDiscovery } from '../public/apps/marketworld/competitors.js';
test('Market: web-search competitor numbers given as strings are coerced, never concatenated', () => {
  const n = normalizeDiscovery({ statusQuoShare: 0.2, competitors: [{ name: 'Acme', url: 'acme.com', priceMonthlyUSD: '29', fundingTotalUSD: '$12M', founded: '2019', awareness: '0.2', marketShare: 0.1 }] });
  const c = n.list[0];
  assert.equal(c.priceMonthlyUSD, 29);
  assert.equal(c.fundingTotalUSD, null); // unparseable: unknown, not NaN
  assert.equal(c.founded, 2019);
  assert.equal(typeof ((c.fundingTotalUSD ?? 0) + 2e6), 'number');
});

import { APPS } from '../public/apps/registry.js';
import analytics from '../public/apps/analytics.js';
import { advanceOneDay } from '../public/core/clock.js';
import { createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { mrrMovements } from '../public/apps/money/metrics.js';
import { isLastDayOfMonth, monthKey } from '../public/core/util.js';
test('Analytics records the month-end MRR event count after every other app ran (movements tie to the snapshot)', () => {
  // Registry order is also clock order: analytics must be last so other apps' same-day MRR changes are counted.
  assert.equal(APPS.at(-1).id, 'analytics');
  assert.equal(typeof analytics.onMonthEnd, 'function');
  const s = base({ model: 'smb', day: 0 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'F', description: 'seed', category: 'owner_contribution', method: 'internal' });
  while (!isLastDayOfMonth(s, s.day + 1)) s.day++;
  // Another app adds a paying customer in its own month-end hook (it runs before analytics, the last app).
  const lateApp = { id: 'late', onMonthEnd(st) { { const c = createCustomer(st, { name: 'A', email: 'a@x.com' }); subscribe(st, c.id, { ...st.plans[0], trialDays: 0 }, { trial: false }); } } };
  advanceOneDay(s, [lateApp, analytics]);
  const m = monthKey(s);
  advanceOneDay(s, [analytics]); // into the next month, so the past month is checked against its snapshot
  const row = mrrMovements(s).find((r) => r.month === m);
  assert.ok(row.new > 0);
  assert.equal(row.reconciles, true, JSON.stringify(row));
});
