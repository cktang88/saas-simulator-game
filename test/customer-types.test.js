// Customer types (startups, local SMBs, e-commerce, mid-market, enterprise) and moving upmarket.
// Short, targeted tests: one mechanic each, a few seeds, the shortest horizon that shows the effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, activeSubs } from '../public/core/stripe.js';
import { ensureMarket, cfg, trialConversion, churnBeforeRenewal, marketDemand } from '../public/core/market.js';
import { MARKET } from '../public/core/params.js';
import { truthOf } from '../public/core/truth.js';
import { setCustomerType, channelFit, supportStrictness, paymentFailMult, outboundEmailFit, customerTypeOf } from '../public/core/customer-type.js';
import { CUSTOMER_TYPES, TYPES_BY_MODEL } from '../public/data/customer-types.js';
import { acquire } from '../public/apps/growth/acquire.js';
import { readiness, moveUpmarket, upmarketDealMult, segmentDay, ensureSegment } from '../public/apps/segment/engine.js';
import { readCustomerFit } from '../public/apps/segment/readers.js';
import { TIER_RANK } from '../public/core/operator.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import { eventRate } from '../public/apps/marketworld/model.js';
import { WORLD_EVENTS } from '../public/data/world.js';
import { APPS } from '../public/apps/registry.js';

const IDEA = {
  startups: 'Incident on-call scheduling for engineering teams at startups',
  local_smb: 'Scheduling and invoicing for plumbing and HVAC contractors',
  ecommerce: 'Post-purchase upsells for Shopify stores',
};

function fresh(type = null, { seed = 7, model = 'smb' } = {}) {
  const s = newState({ companyName: 'Acme', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = IDEA[type] ?? IDEA.startups;
  s.company.website = { text: 'x' };
  s.apps.product = { features: [{ id: 'f1', title: 'Core workflow', status: 'shipped', shippedDay: 0 }] };
  if (type) setCustomerType(s, type);
  s.market.flags = { fixedDemand: 1 }; // same hidden demand for every script, so only the operator's choices differ
  marketDemand(s);
  return s;
}
const ship = (s, title) => s.apps.product.features.push({ id: `f${s.apps.product.features.length + 1}`, title, status: 'shipped', shippedDay: s.day });
function paying(s, n, { price = 99, months = 10, type = customerTypeOf(s) } = {}) {
  const plan = { id: 'plan_x', name: 'X', price, interval: 'month', trialDays: 0, active: true };
  for (let i = 0; i < n; i++) {
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com` });
    const sub = subscribe(s, c.id, plan, { trial: false, source: 'direct' });
    sub.customerType = type;
    sub.paidMonths = months; sub.firstPaidDay = s.day - months * 30; sub.startDay = s.day - months * 30;
  }
}

test('setup: a customer type must match the business model; no type keeps the old model baseline', () => {
  const s = fresh(null);
  assert.equal(cfg(s), MARKET.smb, 'no type: untouched baseline');
  assert.equal(setCustomerType(s, 'enterprise'), null, 'enterprise is not an SMB-model type');
  assert.equal(setCustomerType(s, 'startups'), 'startups');
  for (const [m, ids] of Object.entries(TYPES_BY_MODEL)) for (const id of ids) assert.equal(CUSTOMER_TYPES[id].model, m);
});

test('market baseline: stores churn fastest, startups slowest; enterprise pays the most', () => {
  const c = Object.fromEntries(['startups', 'local_smb', 'ecommerce'].map((t) => [t, cfg(fresh(t))]));
  assert.ok(c.ecommerce.monthlyChurn[3] > c.local_smb.monthlyChurn[3] && c.local_smb.monthlyChurn[3] > c.startups.monthlyChurn[3]);
  assert.ok(c.local_smb.trialStartRate < c.startups.trialStartRate && c.startups.trialStartRate < c.ecommerce.trialStartRate, 'owners rarely self-start a trial; merchants install from the app store');
  assert.ok(c.startups.refPrice > c.local_smb.refPrice);
  const mid = cfg(fresh('mid_market', { model: 'ent' })), ent = cfg(fresh('enterprise', { model: 'ent' }));
  assert.ok(ent.refPrice > mid.refPrice && ent.annualRenewal > mid.annualRenewal);
});

test('hidden market: the segments come from the customer type', () => {
  const st = truthOf(fresh('startups')).segments.map((x) => x.baseId);
  const lo = truthOf(fresh('local_smb')).segments.map((x) => x.baseId);
  const ec = truthOf(fresh('ecommerce')).segments.map((x) => x.baseId);
  assert.ok(st.includes('startup_smb') && st.every((id) => CUSTOMER_TYPES.startups.segmentIds.includes(id)), st.join());
  assert.ok(lo.every((id) => CUSTOMER_TYPES.local_smb.segmentIds.includes(id)) && !lo.includes('startup_smb'), lo.join());
  assert.ok(ec.includes('ecommerce'), ec.join());
});

test('channels: the same channel delivers very different signups by customer type', () => {
  const got = (type, source) => { const s = fresh(type, { seed: 3 }); s.plans[0].trialDays = 14; return acquire(s, { source, n: 200 }).subs.length; };
  assert.ok(got('startups', 'organic:community') > 8 * got('local_smb', 'ads:linkedin'), 'communities for startups vs LinkedIn ads for owners');
  assert.ok(got('ecommerce', 'organic:appstore') > 1.8 * got('startups', 'ads:meta'));
  assert.ok(got('local_smb', 'referral') > 300 && got('local_smb', 'outbound') < 60);
  assert.equal(got(null, 'ads:linkedin'), 200, 'no type: neutral');
  assert.equal(channelFit(fresh('startups'), 'network'), 1, 'your own network is not a channel fit question');
});

test('onboarding: owners need done-for-you setup, engineers want self-serve', () => {
  const tc = (type, mode) => { const s = fresh(type); s.market.onboarding = mode; s.market.cardRequired = false; return trialConversion(s); };
  assert.ok(tc('local_smb', 'concierge') > 1.8 * tc('local_smb', 'self'), `${tc('local_smb', 'concierge')} vs ${tc('local_smb', 'self')}`);
  assert.ok(tc('startups', 'concierge') / tc('startups', 'self') < tc('local_smb', 'concierge') / tc('local_smb', 'self'));
});

test('support, payments and cold email differ by customer type', () => {
  assert.ok(supportStrictness(fresh('ecommerce'), 10) > supportStrictness(fresh('ecommerce'), 4), 'Black Friday month is stricter');
  assert.ok(supportStrictness(fresh('startups')) > supportStrictness(fresh('local_smb')));
  const lo = fresh('local_smb'), st = fresh('startups');
  assert.ok(paymentFailMult(lo, {}) > 2 * paymentFailMult(st, {}));
  assert.ok(outboundEmailFit(lo, 'restaurants', 'owner_smb') < 0.5 * outboundEmailFit(lo, 'startup_smb', 'company'), 'owners do not answer cold email');
});

test('per-subscription churn follows the type it was sold under, not today\'s', () => {
  const s = fresh('ecommerce');
  paying(s, 1, { months: 4 });
  const sub = activeSubs(s)[0];
  const asStore = churnBeforeRenewal(s, sub);
  sub.customerType = 'startups';
  assert.ok(churnBeforeRenewal(s, sub) < 0.7 * asStore);
});

test('customer-type world events only hit that customer type', () => {
  const winter = WORLD_EVENTS.find((e) => e.id === 'startup_funding_winter');
  const p = (flags) => ({ model: 'smb', stage: 'launched', path: 'indie', aiDependence: 'none', flags });
  assert.ok(eventRate(winter, p({ sellsToStartups: true })) > 0);
  assert.equal(eventRate(winter, p({ sellsToLocalSmb: true })), 0);
});

test('graduation: long-tenured startup customers outgrow a product without SSO / audit logs / roles', () => {
  const run = (withSso) => {
    let gone = 0;
    for (const seed of [1, 2, 3]) {
      const s = fresh('startups', { seed });
      if (withSso) ship(s, 'SAML SSO with Okta');
      paying(s, 60, { months: 12 });
      for (let m = 0; m < 6; m++) { s.day = 29 + m * 30; segmentDay(s); } // the 1st of six months
      gone += activeSubs(s).filter((x) => x.cancelAtPeriodEnd && x.cancelReason === 'outgrew_product').length;
    }
    return gone;
  };
  assert.ok(run(false) >= 3, `outgrew ${run(false)}`);
  assert.equal(run(true), 0);
});

test('upmarket: an unready move is allowed but costs deals and conversion; a ready one does not', () => {
  const early = fresh('startups');
  paying(early, 5, { price: 49 });
  const r0 = readiness(early);
  assert.equal(r0.target, 'mid_market');
  assert.ok(!r0.ready);
  const res = moveUpmarket(early);
  assert.ok(res.ok && res.premature);
  assert.equal(early.company.model, 'ent', 'mid-market runs on enterprise-style sales');
  assert.ok(activeSubs(early).every((x) => x.customerType === 'startups'), 'existing customers keep their type');
  assert.ok(early.mistakes.some((m) => m.id === 'premature_upmarket'));
  assert.ok(upmarketDealMult(early, { amount: 30000 }) < 0.8);
  segmentDay(early);
  assert.ok(early.market.modifiers.conversion['customer-type:upmarket'] < 1);

  const ready = fresh('startups');
  paying(ready, 30, { price: 600 });
  ship(ready, 'SAML SSO'); ship(ready, 'Roles and permissions');
  ready.apps.legal = { soc2: 'type1' };
  ready.plans.push({ id: 'plan_ent', name: 'Business', price: 12000, interval: 'year', trialDays: 0, active: true });
  assert.ok(readiness(ready).ready, JSON.stringify(readiness(ready).checks.filter((c) => !c.ok)));
  const ok = moveUpmarket(ready);
  assert.ok(ok.ok && !ok.premature);
  assert.equal(upmarketDealMult(ready, { amount: 30000 }), 1);
  assert.ok(!ready.mistakes?.some((m) => m.id === 'premature_upmarket'));
});

test('upmarket: dropping the self-serve plan makes the old SMB base churn faster', () => {
  const s = fresh('startups');
  paying(s, 8, { price: 600 });
  moveUpmarket(s);
  s.plans = [{ id: 'plan_ent', name: 'Business', price: 24000, interval: 'year', trialDays: 0, active: true }];
  segmentDay(s);
  assert.ok(activeSubs(s).every((x) => x.ctChurnMult > 1));
  assert.ok(s.mistakes.some((m) => m.id === 'abandoned_smb_base'));
  s.plans.push({ id: 'plan_self', name: 'Team', price: 99, interval: 'month', trialDays: 14, active: true });
  segmentDay(s);
  assert.ok(activeSubs(s).every((x) => x.ctChurnMult === 1));
});

test('e-commerce: shipping during the Black Friday freeze is a logged mistake with a churn bump', () => {
  const s = fresh('ecommerce');
  paying(s, 20);
  s.day = 19; // Nov 21, 2026
  ship(s, 'New checkout widget');
  segmentDay(s);
  assert.ok(s.mistakes.some((m) => m.id === 'shipped_in_peak_freeze'));
  assert.equal(s.market.modifiers.churn['customer-type:freeze'], 1.2);
});

// ---- Operator tiers separate (CLAUDE.md principle 7) ----

const SCRIPTS = {
  startups: {
    stellar: { channels: ['organic:community', 'referral', 'organic:seo'], onboarding: 'self', ships: ['Slack and GitHub integration', 'Public API and docs'], frt: 1.5, price: 99 },
    good: { channels: ['organic:seo', 'organic:social', 'ads:google'], onboarding: 'self', ships: ['Slack integration'], frt: 3, price: 99 },
    average: { channels: ['organic:seo', 'ads:google', 'outbound'], onboarding: 'call', ships: ['GitHub integration'], frt: 6, price: 99 },
    mediocre: { channels: ['ads:meta', 'cold_call', 'ads:linkedin'], onboarding: 'concierge', ships: [], frt: 30, price: 15 },
  },
  local_smb: {
    stellar: { channels: ['referral', 'partner', 'organic:seo'], onboarding: 'concierge', ships: ['Mobile app with SMS reminders', 'QuickBooks sync'], frt: 2, price: 59 },
    good: { channels: ['ads:google', 'organic:community', 'ads:meta'], onboarding: 'call', ships: ['Mobile app'], frt: 5, price: 59 },
    average: { channels: ['ads:google', 'ads:meta', 'organic:social'], onboarding: 'self', ships: ['Mobile app'], frt: 8, price: 59 },
    mediocre: { channels: ['ads:linkedin', 'outbound', 'product-hunt'], onboarding: 'self', ships: [], frt: 40, price: 400 },
  },
  ecommerce: {
    stellar: { channels: ['organic:appstore', 'partner', 'organic:community'], onboarding: 'call', ships: ['Shopify app embed', 'Klaviyo sync'], frt: 1, price: 49 },
    good: { channels: ['organic:appstore', 'ads:meta', 'organic:seo'], onboarding: 'call', ships: ['Shopify app embed'], frt: 3, price: 49 },
    average: { channels: ['ads:google', 'outbound', 'organic:social'], onboarding: 'self', ships: ['Shopify app embed'], frt: 8, price: 49 },
    mediocre: { channels: ['ads:linkedin', 'cold_call', 'product-hunt'], onboarding: 'self', ships: [], frt: 30, price: 49 },
  },
};

function play(type, tier, seed) {
  const sc = SCRIPTS[type][tier];
  const s = fresh(type, { seed });
  s.plans[0] = { ...s.plans[0], price: sc.price, trialDays: 14 };
  s.market.onboarding = sc.onboarding;
  s.market.cardRequired = false;
  for (const t of sc.ships) ship(s, t);
  s.apps.support = { metrics: { medianFrtHours: sc.frt }, tickets: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}` })) };
  let signups = 0;
  for (const src of sc.channels) signups += acquire(s, { source: src, n: 60 }).subs.length;
  const expectedMrr = signups * trialConversion(s) * sc.price; // underpricing buys conversions, not revenue
  return { tier: readCustomerFit(s).tier, score: readCustomerFit(s).score, expectedMrr };
}

test('operator tiers separate for every customer type, in the read and in new MRR', () => {
  assert.ok(OPERATOR_TIERS.customer_fit);
  for (const type of Object.keys(SCRIPTS)) {
    const rows = ['stellar', 'good', 'average', 'mediocre'].map((tier) => {
      const runs = [1, 2, 3].map((seed) => play(type, tier, seed));
      return { tier, read: runs.map((r) => r.tier), score: runs.reduce((a, r) => a + r.score, 0) / 3, paid: runs.reduce((a, r) => a + r.expectedMrr, 0) / 3 };
    });
    for (const r of rows) assert.ok(r.read.every((t) => t === r.tier), `${type} ${r.tier}: read ${r.read.join(',')}`);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].score > rows[i].score, `${type}: ${rows[i - 1].tier} score above ${rows[i].tier}`);
      assert.ok(rows[i - 1].paid > rows[i].paid, `${type}: ${rows[i - 1].tier} $${rows[i - 1].paid.toFixed(0)} new MRR > ${rows[i].tier} $${rows[i].paid.toFixed(0)}`);
    }
    // Calibrated spread [design]: stellar gets several times the new MRR of mediocre from the same effort.
    assert.ok(rows[0].paid > 3 * rows[3].paid, `${type}: ${rows[0].paid.toFixed(1)} vs ${rows[3].paid.toFixed(1)}`);
  }
});

test('wrong channel for the customer is a traceable mistake', () => {
  const s = fresh('local_smb');
  s.plans[0].trialDays = 14;
  acquire(s, { source: 'ads:linkedin', n: 40 });
  s.day = 29; segmentDay(s); // Dec 1
  const m = s.mistakes.find((x) => x.id === 'wrong_channel_for_customer');
  assert.ok(m && m.cost.customers >= 30, JSON.stringify(m));
});

test('a short full-clock run with each customer type stays solvent and deterministic', () => {
  for (const type of ['startups', 'local_smb', 'ecommerce']) {
    const a = fresh(type, { seed: 5 }), b = fresh(type, { seed: 5 });
    advance(a, 20, APPS); advance(b, 20, APPS);
    assert.equal(a.day, 20);
    // Modifier keys carry instance ids from the shared uid counter (two games in one process differ); values must match.
    const norm = (m) => JSON.parse(JSON.stringify(m, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk.replace(/#.*$/, ''), vv])) : v)));
    assert.deepEqual(norm(a.market.modifiers), norm(b.market.modifiers));
    assert.ok(ensureSegment(a));
  }
});
