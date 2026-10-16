// "How to run your first ads" guide (public/apps/ads/guide.js): step order, deep-link targets, budget math and the
// per-ad-set "What to do now" read. Short horizons only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import { ensureAds, createAccount, createCampaign, createAdSet, createAd, addCreative } from '../public/apps/growth/adsEngine.js';
import { minDailyBudgetToExit } from '../public/apps/growth/delivery.js';
import { PLATFORMS } from '../public/apps/growth/params.js';
import { firstAdsSteps, currentStep, prerequisites, budgetAdvice, nextActions, createBlocker, defaultDailyBudget } from '../public/apps/ads/guide.js';

function fresh(model = 'b2c', { product = true } = {}) {
  const s = newState({ companyName: 'Guide Co', model, path: 'indie', founderName: 'Pat', seed: 11 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  if (product) {
    s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
    s.company.website = { source: 'paste', title: 'x', text: 'x' };
  }
  s.company.oneLiner = 'Habit tracker for busy parents who want to read more books';
  s.market.flags = { fixedDemand: 1 };
  return s;
}
const cur = (s, p = 'meta') => { const st = firstAdsSteps(s, p); const i = currentStep(st); return i < 0 ? 'done' : st[i].id; };

test('guide: prerequisites block first, then account → payment → tracking → creatives → launch → wait → decide', () => {
  const pre = fresh('b2c', { product: false });
  assert.equal(cur(pre), 'prereq');
  const missing = prerequisites(pre, 'meta').filter((x) => x.required && !x.done).map((x) => x.id);
  assert.deepEqual(missing, ['product', 'website']);
  assert.equal(firstAdsSteps(pre, 'meta')[0].go, 'app:product/build');

  const s = fresh('b2c');
  assert.equal(cur(s), 'account');
  const acct = createAccount(s, 'meta');
  assert.equal(cur(s), 'payment');
  acct.payment = 'card_1';
  assert.equal(cur(s), 'tracking');
  acct.pixel = true;
  assert.equal(cur(s), 'creatives');
  assert.match(createBlocker(s, 'meta'), /creative/);
  const cr = addCreative(s, { format: 'static', hook: 'Sunday night reading guilt', skill: 0.5 });
  cr.status = 'approved';
  assert.equal(createBlocker(s, 'meta'), null);
  assert.equal(cur(s), 'launch');
  const c = createCampaign(s, { p: 'meta', name: 'T', objective: 'sales' });
  const set = createAdSet(s, { campaignId: c.id, name: 'Broad', budget: 50, optimization: 'trial', audience: { type: 'broad' } });
  const ad = createAd(s, { adsetId: set.id, creativeId: cr.id });
  assert.equal(cur(s), 'wait');
  // Same day: nothing has spent yet, and the guide says so instead of leaving the player guessing.
  assert.match(nextActions(s, 'meta')[0].text, /next day's auction/);
  advance(s, PLATFORMS.meta.learning.learnDays, APPS);
  assert.equal(cur(s), 'decide');
  ensureAds(s).ads.find((a) => a.id === ad.id).status = 'paused';
  assert.equal(cur(s), 'done');
});

test('guide: Apple Search Ads needs no creative; other platforms do', () => {
  const s = fresh('b2c');
  assert.equal(createBlocker(s, 'apple'), null);
  assert.ok(createBlocker(s, 'meta'));
});

test('guide budget math: fair test is 2-3x target CPA per ad; learning exit ≈ 7x CPA/day; start capped at the new-account limit', () => {
  const s = fresh('smb');
  const acct = createAccount(s, 'meta');
  acct.targetCpa = 100;
  const adv = budgetAdvice(s, 'meta');
  assert.deepEqual(adv.perAd, [200, 300]);
  assert.equal(adv.testTotal, 600);
  assert.equal(adv.exitPerDay, minDailyBudgetToExit(100, PLATFORMS.meta.learning));
  assert.equal(defaultDailyBudget(s, 'meta'), Math.min(100, PLATFORMS.meta.newDailyLimit));
  assert.equal(adv.testDays, Math.ceil(600 / defaultDailyBudget(s, 'meta')));
  assert.equal(adv.canExitLearning, false);
  // Once an ad set is live, the advice uses its real budget.
  const c = createCampaign(s, { p: 'meta', name: 'T', objective: 'leads' });
  createAdSet(s, { campaignId: c.id, name: 'Broad', budget: 300, optimization: 'trial', audience: { type: 'broad' } });
  assert.equal(budgetAdvice(s, 'meta').budget, 300);
  // Cash prerequisite reflects the fair-test total.
  assert.equal(prerequisites(s, 'meta').find((x) => x.id === 'cash').done, true);
});

test('guide "What to do now": explains non-delivery with a fix link; kill a weak hook, keep an on-target ad, wait on an early one', () => {
  const s = fresh('b2c');
  const acct = createAccount(s, 'meta');
  acct.payment = 'card_1'; acct.pixel = true; acct.capi = true;
  acct.targetCpa = 100;
  const c = createCampaign(s, { p: 'meta', name: 'T', objective: 'sales' });
  const empty = createAdSet(s, { campaignId: c.id, name: 'Empty', budget: 60, optimization: 'trial', audience: { type: 'broad' } });
  const line = nextActions(s, 'meta').find((x) => x.id === empty.id);
  assert.equal(line.tone, 'bad');
  assert.match(line.text, /No active ads/);
  assert.equal(line.go, 'creatives');
  empty.status = 'paused';

  // Three ad sets with hand-made delivery so the read is exact (the auction itself is tested in growth.test.js).
  const mk = (name, row) => {
    const set = createAdSet(s, { campaignId: c.id, name, budget: 80, optimization: 'trial', audience: { type: 'broad' } });
    const cr = addCreative(s, { format: 'static', hook: `${name} hook`, skill: 0.5 });
    cr.status = 'approved';
    const ad = createAd(s, { adsetId: set.id, creativeId: cr.id });
    ensureAds(s).rows.push({ d: s.day, p: 'meta', c: c.id, s: set.id, a: ad.id, sp: 0, im: 0, cl: 0, lp: 0, tr: 0, pu: 0, rt: 0, rpp: 0, rv: 0, ...row });
    return set;
  };
  const weak = mk('Weak', { sp: 90, im: 3000, cl: 9, lp: 7 }); // CTR 0.3%
  const good = mk('Good', { sp: 300, im: 9000, cl: 120, lp: 100, tr: 4, rt: 4 }); // CPA $75 vs $100 target
  const early = mk('Early', { sp: 60, im: 1500, cl: 20, lp: 16 }); // well under a fair test
  const acts = nextActions(s, 'meta');
  const at = (set) => acts.find((x) => x.id === set.id);
  assert.equal(at(weak).tone, 'bad');
  assert.match(at(weak).text, /Weak hook/);
  assert.ok(at(weak).adId, 'weak line offers turning the ad off');
  assert.notEqual(at(good).tone, 'bad', at(good).text);
  assert.match(at(early).text, /Too early to judge/);
  assert.equal(at(early).tone, '');
});
