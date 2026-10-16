// Review 2 regression tests for the consumer / growth-loop / email / audience / search apps. Short, targeted, few seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post, balance } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket, mainPlan } from '../public/core/market.js';
import * as ACC from '../public/apps/plg/access.js';
import { acquire, ensureGrowth } from '../public/apps/growth/acquire.js';
import * as TX from '../public/apps/emailops/model.js';
import * as AU from '../public/apps/audience/model.js';
import { ensureConsumer } from '../public/apps/consumer/state.js';
import * as Clip from '../public/apps/consumer/clipping.js';
import * as Paid from '../public/apps/consumer/paid.js';
import { ensureAds } from '../public/apps/growth/adsEngine.js';
import { syncSearchConsole } from '../public/apps/searchtools/tools.js';
import { ensureSearch } from '../public/apps/searchtools/geo.js';
import { ensureSeo } from '../public/apps/growth/seoDynamics.js';
import { ensureOrganic } from '../public/apps/growth/organicEngine.js';

function world({ seed = 3, model = 'smb' } = {}) {
  const s = newState({ companyName: 'Boardly', model, path: 'indie', founderName: 'Pat', seed });
  s.company.oneLiner = 'Shared boards where teams approve client work'; s.company.icp = 'Agency owners running client approvals';
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Client approvals', status: 'shipped', shippedDay: -30 }], buildQueue: [], bugs: [], changelog: [] };
  s.day = 100;
  return s;
}

// ---- PLG launch mode: the UI priced a release by running it, then ran it again ----
test('waitlist release dry run prices without admitting; the UI handler no longer releases twice', () => {
  const s = world();
  ACC.setLaunchMode(s, 'waitlist', { qualify: false, batch: 20 });
  acquire(s, { source: 'organic:seo', n: 60 });
  const waiting = s.apps.plg.access.waiting.n;
  const subs = s.stripe.subscriptions.length;
  const dry = ACC.releaseBatch(s, { n: 20, dryRun: true });
  assert.equal(dry.ok, true);
  assert.ok(dry.hoursCost > 0);
  assert.equal(s.apps.plg.access.waiting.n, waiting, 'dry run admits nobody');
  assert.equal(s.stripe.subscriptions.length, subs);
  assert.equal(s.apps.plg.access.cohorts.length, 0);
  const real = ACC.releaseBatch(s, { n: 20 });
  assert.equal(real.released, 20);
  assert.equal(s.apps.plg.access.cohorts.length, 1, 'one release = one cohort');
  // launchModeHours is pure
  const before = JSON.stringify(s.apps.plg.access);
  assert.equal(ACC.launchModeHours(s, 'invite'), 2);
  assert.equal(ACC.launchModeHours(s, 'waitlist'), 0.25);
  assert.equal(JSON.stringify(s.apps.plg.access), before);
  const src = readFileSync(new URL('../public/apps/plg.js', import.meta.url), 'utf8');
  assert.match(src, /releaseBatch\(ctx\.state, \{ n: f\.n, dryRun: true \}\)/);
  assert.doesNotMatch(src, /const r = setLaunchMode\(ctx\.state/);
});

// ---- Transactional email: renewal notices were never checked ----
test('annual renewal without a renewal notice is checked on the renewal charge, not on the first purchase', () => {
  const s = world();
  const T = TX.ensureTxn(s);
  T.provider = 'resend';
  const plan = { ...mainPlan(s), id: 'annual', price: 600, interval: 'year', trialDays: 0 };
  const subs = [];
  for (let i = 0; i < 400; i++) { const c = createCustomer(s, { name: `U${i}`, email: `u${i}@x${i}.com` }); subs.push(subscribe(s, c.id, plan, { trial: false, source: 'direct' })); }
  // First purchase today: no renewal notice is owed.
  TX.txnDay(s);
  assert.equal(T.stats.noticeMisses, 0, 'a first annual purchase is not a renewal');
  // A year later every sub renews today (charge on the renewal day).
  s.day += 365;
  for (const sub of subs) s.stripe.charges.push({ id: `ch_r_${sub.id}`, subId: sub.id, customerId: sub.customerId, day: s.day, amount: 600, status: 'succeeded' });
  TX.txnDay(s);
  const paidBefore = subs.filter((x) => x.firstPaidDay != null && x.firstPaidDay < s.day).length;
  assert.ok(paidBefore > 300);
  assert.equal(T.stats.noticeMisses, paidBefore, 'each renewal without a live notice is a surprise charge');
  assert.ok(T.stats.refunds + T.stats.disputes > 0, 'surprise renewals turn into refunds or disputes');
});

// ---- Owned audience: negative inputs paid the founder, failed sends ate the sponsor ----
test('subscriber ads and swaps reject negative inputs instead of posting money in', () => {
  const s = world();
  AU.setupList(s, 'beehiiv');
  const bal = balance(s);
  assert.equal(AU.buyAds(s, { budget: -5000 }).ok, false);
  assert.equal(AU.swap(s, { partnerSize: -50000, partnerFit: 0.1, paid: true }).ok, false);
  assert.equal(balance(s), bal, 'no money moved');
  const ok = AU.buyAds(s, { budget: '300' });
  assert.equal(ok.ok, true);
  assert.equal(balance(s), bal - 300);
});

test('a suspended list cannot launch; manual unsubscribes become violations only when mailed again', () => {
  const s = world();
  AU.setupList(s, 'kit');
  const A = AU.ensureAudience(s);
  AU.addSubscribers(s, 2000, { key: 'x', source: 'form', engaged: 0.5, fit: 0.5 });
  A.suspendedUntil = s.day + 10;
  const subs = s.stripe.subscriptions.length;
  assert.equal(AU.launchToList(s, { subject: 'We launched', body: 'x '.repeat(200) }).ok, false);
  assert.equal(s.stripe.subscriptions.length, subs, 'no signups from a launch the platform blocked');
  A.suspendedUntil = null;
  A.compliance.honor = 'manual';
  const body = 'Here is what we learned shipping 3 features in 14 days, with 42% fewer support tickets. '.repeat(12);
  AU.sendIssue(s, { subject: 'Issue one', body });
  assert.equal(A.violations, 0, 'the first send creates opt-outs, it does not mail them again');
  assert.ok(A.pendingUnsubs > 0);
  const pending = A.pendingUnsubs;
  s.day += 7;
  AU.sendIssue(s, { subject: 'Issue two', body });
  assert.ok(Math.abs(A.violations - pending) < 1e-9, 'the next send reaches the unprocessed opt-outs');
  const src = readFileSync(new URL('../public/apps/audience.js', import.meta.url), 'utf8');
  assert.match(src, /if \(r\.ok && sp\) queue\.shift\(\)/, 'the sponsor is consumed only by a successful send');
});

// ---- Clipping: closing a campaign stranded its reserved payouts ----
test('payouts held when a clipping campaign is closed still clear and count as spend', () => {
  const s = world({ model: 'b2c' });
  const C = ensureConsumer(s);
  const r = Clip.launchCampaign(s, { budget: 2000, cpm: 1, content: 'demo_slideshow', hook: 'test', verification: 'basic' });
  assert.ok(r.ok);
  const c = r.campaign;
  for (let i = 0; i < 3; i++) { s.day++; Clip.clippingDay(s); }
  assert.ok(c.reserved > 0, 'payouts are on hold');
  Clip.closeCampaign(s, c.id);
  const held = c.reserved;
  for (let i = 0; i < 20; i++) { s.day++; Clip.clippingDay(s); }
  assert.ok(c.payouts.every((p) => p.done), 'held payouts release after close');
  assert.equal(c.reserved, 0);
  const g = ensureGrowth(s);
  const sp = Object.values(g.cohorts).reduce((a, w) => a + (w['organic:clips']?.sp ?? 0), 0);
  assert.ok(Math.abs(sp - (c.paid + c.fees)) < 0.05, 'ledger spend = everything paid out');
  assert.ok(held > 0 && c.paid + c.fees >= held - 0.05);
  assert.ok(C.clipping.campaigns.length === 1);
});

// ---- Meta app ads: trials missing from the cohort ledger; web (PWA) clicks vanished ----
test('Meta app campaigns ledger their trials, and a PWA campaign delivers web visitors instead of nothing', () => {
  const s = world({ model: 'b2c', seed: 11 });
  s.company.website = { source: 'paste', title: 'x', text: 'x' };
  const C = ensureConsumer(s);
  C.app.stack = 'pwa'; C.app.built = true;
  const A = ensureAds(s);
  const cr = Paid.addAppCreative(s, { hook: 'Parents: read 12 books in 60 days with a 10 minute bedtime habit' });
  assert.ok(cr.ok && A.creatives.length);
  const r = Paid.launchCampaign(s, { budget: 200, creativeIds: [cr.creative.id] });
  assert.ok(r.ok);
  const subs0 = s.stripe.subscriptions.length;
  for (let i = 0; i < 5; i++) { s.day++; Paid.paidDay(s); }
  assert.ok(r.campaign.installs > 0);
  assert.ok(s.stripe.subscriptions.length > subs0, 'web clicks converted on the landing page');
  const tr = Object.values(ensureGrowth(s).cohorts).reduce((a, w) => a + (w['ads:meta']?.tr ?? 0), 0);
  assert.equal(tr, s.stripe.subscriptions.length - subs0, 'every trial is in the ads:meta cohort ledger');
  const src = readFileSync(new URL('../public/apps/consumer/paid.js', import.meta.url), 'utf8');
  assert.match(src, /ledgerAdd\(state, state\.day, 'ads:meta', 'tr', r\.subs\.length\)/, 'store path ledgers trials too');
});

// ---- Search Console verified in Organic had no verification day ----
test('Search Console verified from Organic records the verification day', () => {
  const s = world();
  ensureOrganic(s);
  ensureSeo(s).tech.gsc = true;
  syncSearchConsole(s);
  const T = ensureSearch(s);
  assert.ok(T.subs.gsc);
  assert.equal(T.gscVerifiedDay, s.day);
});
