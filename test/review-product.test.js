// Regression tests for bugs found in the product / insights / market / outcomes review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, activeSubs } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { queueFeature } from '../public/apps/product.js';
import { productSlice } from '../public/apps/product/store.js';
import { decideFeature } from '../public/apps/product/engine.js';
import { PRODUCT_ACTIONS } from '../public/apps/product/api.js';
import { specKey, lintSpec } from '../public/apps/product/spec.js';
import { aggregatePanel } from '../public/apps/product/panel.js';
import { exposureFlags } from '../public/apps/marketworld/model.js';
import { fire, EVENTS } from '../public/apps/outcomes/engine.js';
import { launchSurvey, callPmf } from '../public/apps/insights/lab.js';

function fresh(seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.company.icp = 'Solo bookkeepers with 10–30 small-business clients in QuickBooks';
  return s;
}
const SPEC = {
  user: 'Solo bookkeepers managing 10–30 small-business clients in QuickBooks Online',
  problem: 'At month-end close bookkeepers spend 2–3 hours chasing missing receipts by email; today they track missing items in a spreadsheet and send reminders manually.',
  solution: 'Each client gets an SMS link to snap a photo of a receipt; the app attaches it to the matching QuickBooks bank transaction and flags unmatched receipts for the bookkeeper.',
  acceptance: ['Given a client uploads a photo, then it is attached to the matching transaction within 1 minute.'],
  metric: 'Receipts matched before close → 75% within 30 days', baseline: '40% across 3 pilot accounts', grade: { total: 15 },
};

test('market exposure flags read where Helpdesk, Insights and Channels actually store their data', () => {
  const s = fresh();
  s.day = 100;
  let f = exposureFlags(s);
  assert.equal(f.slowSupport, false); assert.equal(f.recentOutage, false); assert.equal(f.reviews20Recent, false); assert.equal(f.marketplaceDependent, false);
  s.apps.support = { metrics: { medianFrtHours: 30 }, reviews: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, day: 90, rating: 5 })) };
  s.apps.insights = { lastOutageDay: 95 };
  s.apps.channels = { stores: { shopify_app_store: { status: 'live' } } };
  f = exposureFlags(s);
  assert.equal(f.slowSupport, true, 'Helpdesk median FRT lives in apps.support.metrics');
  assert.equal(f.recentOutage, true, 'outages are stamped on apps.insights.lastOutageDay');
  assert.equal(f.reviews20Recent, true, 'reviews live in apps.support.reviews');
  assert.equal(f.marketplaceDependent, true, 'live app-store listings live in apps.channels.stores');
  s.apps.insights.lastOutageDay = 50;
  assert.equal(exposureFlags(s).recentOutage, false);
});

test('whale churn hits the biggest customer by MRR (annual plans per month), not one already leaving', () => {
  const s = fresh();
  const monthly = { id: 'p_m', name: 'Pro', price: 300, interval: 'month', active: true, trialDays: 0 };
  const annual = { id: 'p_y', name: 'Pro annual', price: 1200, interval: 'year', active: true, trialDays: 0 }; // $100/mo
  const mk = (plan, n) => subscribe(s, createCustomer(s, { name: n, email: `${n}@x.example`, country: 'US' }).id, plan, { trial: false });
  const big = mk(monthly, 'big');
  const yr = mk(annual, 'yr');
  mk({ ...monthly, price: 50 }, 'small');
  assert.equal(activeSubs(s).length, 3);
  const e = EVENTS.find((x) => x.id === 'whale_churn');
  fire(s, e, {}, 0.1);
  assert.equal(big.cancelAtPeriodEnd, true, 'the $300/mo account is the whale');
  assert.ok(!yr.cancelAtPeriodEnd, '$1,200/yr is $100/mo, not the biggest');
  // A second whale-churn event must not pick the account that is already leaving.
  fire(s, e, {}, 0.1);
  assert.equal(yr.cancelAtPeriodEnd, true);
});

test('pulling a rebuild from the queue and re-adding it does not escape the +25% rebuild tax', () => {
  const s = fresh();
  const sl = productSlice(s);
  const a = { ...SPEC, id: 'k1', title: 'Receipt chase by SMS', status: 'shipped', effortHours: 40, progressHours: 40, shippedDay: 0, evidence: [] };
  sl.features.push(a);
  decideFeature(s, sl, a, 'kill', 'Nobody used it after 30 days: 2 of 14 accounts tried it once');
  s.day = 20;
  const b = { ...SPEC, id: 'k2', title: 'Receipt chase by SMS v2', status: 'draft', grade: { pass: true, agentHours: 20 }, evidence: [], progressHours: 0 };
  sl.features.push(b);
  queueFeature(s, b);
  assert.equal(b.effortHours, 50);
  // "Pull from queue", then add it back.
  sl.buildQueue = sl.buildQueue.filter((x) => x !== b.id); b.status = 'draft';
  queueFeature(s, b);
  assert.equal(b.effortHours, 50, 'tax re-applied on re-queue');
  assert.equal(sl.decisions.filter((d) => d.kind === 'rebuild').length, 1, 'logged once');
});

test('automation queue_feature refuses a spec edited after it passed review', () => {
  const s = fresh();
  const sl = productSlice(s);
  const f = { ...SPEC, id: 'q1', title: 'Receipt chase', status: 'draft', grade: { pass: true, agentHours: 10 }, evidence: [], progressHours: 0 };
  f.gradeKey = specKey(f);
  sl.features.push(f);
  f.solution = 'Something completely different that the reviewer never saw.';
  const r = PRODUCT_ACTIONS.queue_feature(s, { featureId: f.id });
  assert.equal(r.ok, false);
  assert.equal(f.status, 'draft');
  f.gradeKey = specKey(f);
  assert.equal(PRODUCT_ACTIONS.queue_feature(s, { featureId: f.id }).ok, true);
});

test('spec lint flags WAU as a vanity metric like DAU/MAU', () => {
  const base = { ...SPEC, title: 'Receipt chase', acceptanceText: SPEC.acceptance.join('\n') };
  const dau = lintSpec({ ...base, metric: 'DAU → 40% within 30 days' });
  const wau = lintSpec({ ...base, metric: 'WAU → 40% within 30 days' });
  const msgs = (l) => [...l.blockers, ...l.warnings].map((x) => x.msg).join(' | ');
  assert.notEqual(msgs(dau), msgs(lintSpec(base)), 'DAU is flagged');
  assert.equal(msgs(wau), msgs(dau), 'WAU is flagged the same way');
});

test('panel aggregation keeps a churn risk of 0 instead of turning it into 0.5', () => {
  const r = { activated: true, wouldPay: true, willingnessToPayMonthly: 50, missingMustHaves: [], featureVerdicts: [{ feature: 'a', verdict: 'useful' }], churnRisk: 0 };
  assert.equal(aggregatePanel([r, r], 49).churnRisk, 0);
  assert.equal(aggregatePanel([{ ...r, churnRisk: undefined }], 49).churnRisk, 0.5);
});

test('calling PMF on a survey with no results yet counts as a small sample, not an activated read', () => {
  const s = fresh();
  const sv = launchSurvey(s, { kind: 'pmf', target: 'activated' });
  assert.equal(callPmf(s, { claim: true, surveyId: sv.id }).basis, 'pmf_small');
});
