// Regression tests for the fixes from the live lifecycle/billing LLM review (docs/review/llm-e2e/lifecycle-billing.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { NOTICE_CRITERIA, EVIDENCE_CRITERIA, contradictsRecords, criteriaChurnRisk } from '../public/apps/money/rubric.js';
import { judgeDisputeEvidence, noticePersonas, judgePriceNotice } from '../public/apps/stripe.js';
import { buyCurveFromScore, maxPriceLevels } from '../public/apps/pricing.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { runPanel } from '../public/apps/customers.js';

test('dispute: a letter denying a cancellation the merchant logged is capped whatever the judges score', async () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed: 3 });
  const letter = 'Jordan did not cancel before the Sep 3 renewal; no cancellation request is on file. He logged in on Sep 5 and Sep 12 from the signup IP, accepted the Terms at checkout and paid 7 prior charges.';
  const perfect = { ...Object.fromEntries(EVIDENCE_CRITERIA.map((c) => [c.key, 5])), evidenceQuotes: '', quality: 0.9, likelyOutcome: 'win', strengths: [], weaknesses: [] };
  const ctx = { state: s, llm: { panel: async () => [{ model: 'm', mock: false, data: { ...perfect } }] } };
  const honest = await judgeDisputeEvidence(ctx, letter, { reason: 'subscription_canceled', cancelRequested: false });
  const lying = await judgeDisputeEvidence(ctx, letter, { reason: 'subscription_canceled', cancelRequested: true });
  assert.ok(honest.quality > 0.7 && !honest.contradicted, `${honest.quality}`);
  assert.ok(lying.contradicted && lying.quality <= 0.2, `${lying.quality}`);
  assert.equal(contradictsRecords('We refunded the prorated month.', { cancelRequested: true }), false);
});

test('price notice: a flawless notice leaves a small risk, a bad one most of the increase; readers are real subscribers', async () => {
  const best = Object.fromEntries(NOTICE_CRITERIA.map((c) => [c.key, 5]));
  const worst = Object.fromEntries(NOTICE_CRITERIA.map((c) => [c.key, 1]));
  assert.ok(criteriaChurnRisk(best, { increasePct: 0.26, noticeDays: 45 }) < 0.05);
  assert.ok(criteriaChurnRisk(worst, { increasePct: 0.26, noticeDays: 45 }) > 0.25);
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed: 4 });
  ensureStripe(s); ensureMarket(s);
  const subs = [];
  for (let i = 0; i < 6; i++) {
    s.day = 200 - i * 40;
    const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com`, company: `Shop ${i}`, country: 'US' });
    subs.push(subscribe(s, c.id, s.plans[0], { trial: false }));
  }
  s.day = 200;
  const ps = noticePersonas(s, subs);
  assert.ok(ps.length >= 2 && ps.length <= 3);
  assert.ok(ps.some((p) => p.months >= 6) && ps.some((p) => p.months < 1), 'longest-tenure and newest accounts both read it');
  assert.ok(ps.every((p) => /month/.test(p.who) && Number.isFinite(p.usage)));
  const seen = [];
  const ctx = { state: s, llm: { panel: async (o) => { seen.push(o.system + o.prompt); return [{ model: 'm', mock: true, data: o.fallback() }]; } } };
  const r = await judgePriceNotice(ctx, { email: 'Price going up soon.', oldPrice: 49, newPrice: 59, notice: 30, subs });
  assert.equal(seen.length, ps.length);
  assert.match(seen[0], /paid for it for/);
  assert.ok(r.risk > 0);
});

test('Gabor-Granger: Jev max-price scale gives a buy curve that never rises with price', () => {
  const prices = [20, 29, 39, 59, 78];
  assert.equal(maxPriceLevels(prices).length, prices.length + 1);
  const curve = buyCurveFromScore({ probabilities: { 0: 0.05, 1: 0.1, 2: 0.3, 3: 0.3, 4: 0.15, 5: 0.1 } }, prices);
  assert.deepEqual(curve.map((x) => Math.round(x * 100)), [95, 85, 55, 25, 10]);
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] <= curve[i - 1]);
  assert.equal(buyCurveFromScore(null, prices), null);
});

test('trial panel prompt carries the shipped features (the competition brief no longer shadows it)', async () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed: 5 });
  ensureStripe(s); ensureMarket(s);
  s.company.icp = 'Shopify sellers'; s.company.oneLiner = 'Shopify payout reconciliation';
  s.apps.product = { features: [{ id: 'f1', title: 'Payout reconciliation', solution: 'Matches every Shopify payout to the bank deposit', acceptance: [], status: 'shipped', shippedDay: 0 }], bugs: [], buildQueue: [] };
  const prompts = [];
  const ctx = { state: s, llm: { panel: async (o) => { prompts.push(o.prompt); return [{ model: 'm', mock: true, data: o.fallback() }]; } } };
  await runPanel(ctx);
  assert.ok(prompts.length >= 3);
  for (const p of prompts) assert.match(p, /WHAT THE PRODUCT ACTUALLY DOES[\s\S]*Payout reconciliation/);
});
