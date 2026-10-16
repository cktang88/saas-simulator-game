// Regression tests for the second growth-area bug review (ads billing, referral rewards, ASO subscriptions,
// co-marketing reply timing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket, mainPlan } from '../public/core/market.js';
import { dayOfMonth } from '../public/core/util.js';
import { createAccount, createCampaign, createAdSet, createAd, addCreative, adsDay, editBudget, platformAccount } from '../public/apps/growth/adsEngine.js';
import { rebuildAccount, ensurePolicy } from '../public/apps/growth/adpolicy.js';
import { ensureAds } from '../public/apps/growth/adsEngine.js';
import { ensureOrganic, setReferral, organicDay } from '../public/apps/growth/organicEngine.js';
import * as S from '../public/apps/channels/sim.js';
import { coPartners } from '../public/apps/channels/catalog.js';
import { ensureAso, setIncentive, incentiveActive, setTool, setHelp } from '../public/apps/growth/aso.js';
import { ASO } from '../public/apps/growth/asoParams.js';

function fresh(model = 'b2c', seed = 7) {
  const s = newState({ companyName: 'Growth Co', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  s.company.website = { source: 'paste', title: 'x', text: 'x' };
  s.market.flags = { fixedDemand: 1 };
  return s;
}
const toDayOfMonth = (s, dom) => { while (dayOfMonth(s) !== dom) s.day++; };
const txns = (s, re) => s.bank.txns.filter((t) => re.test(`${t.counterparty} ${t.description}`));

function metaAccount(s) {
  const acct = createAccount(s, 'meta');
  acct.payment = 'card_1'; acct.pixel = true; acct.dailyLimit = null;
  const c = createCampaign(s, { p: 'meta', objective: 'sales' });
  const set = createAdSet(s, { campaignId: c.id, budget: 20 });
  const cr = addCreative(s, { format: 'static', hook: 'h', skill: 0.6 }); cr.status = 'approved';
  createAd(s, { adsetId: set.id, creativeId: cr.id });
  return { acct, c, set };
}

test('ads: spend left unbilled is invoiced on the 1st even when every campaign is paused', () => {
  const s = fresh();
  toDayOfMonth(s, 2);
  const { acct, c } = metaAccount(s);
  adsDay(s);
  assert.ok(acct.unbilled > 0 && acct.unbilled < 100, 'spent below the first threshold');
  const owed = acct.unbilled;
  c.status = 'paused';
  for (let i = 0; i < 40 && acct.unbilled > 0; i++) { s.day++; adsDay(s); }
  assert.equal(acct.unbilled, 0, 'the monthly invoice was charged');
  assert.equal(acct.bills.at(-1).reason, 'monthly');
  assert.ok(Math.abs(acct.bills.at(-1).amount - owed) < 0.01);
});

test('ads: a declined account is retried by the platform and resumes once cash is back', () => {
  const s = fresh();
  const { acct } = metaAccount(s);
  acct.unbilled = 500;
  const cash = s.bank.accounts[0].balance;
  s.bank.accounts[0].balance = 0;
  s.day++; adsDay(s);
  assert.equal(acct.status, 'payment_failed');
  s.bank.accounts[0].balance = cash;
  s.day++; adsDay(s);
  assert.equal(acct.status, 'active', 'the daily retry paid the balance');
  assert.equal(acct.unbilled >= 0 && acct.bills.some((b) => b.status === 'paid' && b.amount >= 500), true);
});

test('ads: rebuilding a banned account keeps its unpaid balance owed', () => {
  const s = fresh();
  const A = ensureAds(s);
  const acct = createAccount(s, 'meta');
  acct.unbilled = 321;
  acct.policyBan = { day: s.day, strikes: 3, appeal: { status: 'lost' }, permanent: true };
  ensurePolicy(A);
  const fresh2 = rebuildAccount(s, A, 'meta', createAccount);
  assert.equal(fresh2.unbilled, 321);
});

test('ads: an empty or zero budget edit is rejected instead of silently setting $1 and restarting learning', () => {
  const s = fresh();
  const { set } = metaAccount(s);
  set.learn.status = 'active';
  assert.throws(() => editBudget(s, set.id, null), /at least \$1/);
  assert.throws(() => editBudget(s, set.id, 0), /at least \$1/);
  assert.equal(set.budget, 20);
  assert.equal(set.learn.status, 'active');
});

function referralPayer(s) {
  const c = createCustomer(s, { name: 'Ref', email: 'ref@x.com', source: 'referral' });
  return subscribe(s, c.id, mainPlan(s), { trial: false, source: 'referral' });
}

test('referrals: cash rewards are paid once per referred payer, also when the Organic engine is running', () => {
  const s = fresh('smb');
  setReferral(s, { enabled: true, reward: 'cash', twoSided: true, cashAmount: 25 });
  ensureOrganic(s).lastK = 0.2; // the Organic word-of-mouth engine is active
  S.ensureChannels(s);
  referralPayer(s);
  S.channelsDay(s);
  const paid = txns(s, /Cash referral reward/);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].amount, -50);
});

test('referrals: the Organic engine no longer books its own expected cash payouts at signup', () => {
  const s = fresh('smb');
  setReferral(s, { enabled: true, reward: 'cash', twoSided: true, cashAmount: 25 });
  for (let i = 0; i < 200; i++) { const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com` }); subscribe(s, c.id, mainPlan(s), { trial: false }); }
  for (let i = 0; i < 30; i++) { s.day++; organicDay(s); }
  assert.ok((s.apps.organic.stats.referral?.signups ?? 0) > 0, 'the engine produced referral signups');
  assert.equal(txns(s, /Referral payouts/).length, 0);
});

test('referrals: rewards are paid even if the Channels app was never opened', () => {
  const s = fresh('smb');
  setReferral(s, { enabled: true, reward: 'cash', twoSided: false, cashAmount: 30 });
  assert.equal(s.apps.channels, undefined);
  referralPayer(s);
  S.channelsDay(s);
  assert.equal(txns(s, /Cash referral reward/).length, 1);
});

test('referrals: switching the program off and on again resubscribes the referral tool', () => {
  const s = fresh('smb');
  const cfg = { reward: 'free_month', twoSided: true, cashAmount: 20, rewardPct: 0.2, placements: [], tool: 'growsurf' };
  S.configureReferral(s, { ...cfg, enabled: true });
  assert.ok(S.ensureChannels(s).monthlyFees.ref_tool);
  S.configureReferral(s, { ...cfg, enabled: true }); // re-save: no second first-month charge
  assert.equal(txns(s, /Referral program software/).length, 1);
  S.configureReferral(s, { ...cfg, enabled: false });
  assert.equal(S.ensureChannels(s).monthlyFees.ref_tool, undefined);
  S.configureReferral(s, { ...cfg, enabled: true });
  assert.ok(S.ensureChannels(s).monthlyFees.ref_tool, 'billing resumes with the same tool');
  // Switching it off from the Organic tab cancels the tool too.
  setReferral(s, { enabled: false });
  S.syncReferralTool(s);
  assert.equal(S.ensureChannels(s).monthlyFees.ref_tool, undefined);
});

test('co-marketing: a sharp pitch gets answered sooner than a vague one (quality is 0..1)', () => {
  let faster = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const base = fresh('smb', seed);
    S.ensureChannels(base);
    const partner = coPartners(base)[0];
    const a = structuredClone(base), b = structuredClone(base);
    const good = S.proposeComarketing(a, { partnerId: partner.id, type: 'swap', judged: { quality: 0.95 } });
    const bad = S.proposeComarketing(b, { partnerId: partner.id, type: 'swap', judged: { quality: 0.05 } });
    assert.ok(good.replyDay <= bad.replyDay);
    if (good.replyDay < bad.replyDay) faster++;
  }
  assert.ok(faster >= 3, `quality moved the reply time in ${faster}/6 seeds`);
});

test('ASO: a stopped 5-star reward can be restarted, and stopping twice keeps the original end date', () => {
  const s = fresh();
  const A = ensureAso(ensureOrganic(s).appstore);
  setIncentive(s, A, true);
  assert.ok(incentiveActive(A));
  s.day = 10;
  setIncentive(s, A, false);
  assert.equal(A.fake.incentive.until, 10);
  s.day = 40;
  setIncentive(s, A, false);
  assert.equal(A.fake.incentive.until, 10, 'a second stop does not extend the detection window');
  setIncentive(s, A, true);
  assert.ok(incentiveActive(A), 'restarted');
});

test('ASO: a tool or retainer bought mid-month bills monthly from that day, and re-picking the same help is free', () => {
  const s = fresh();
  toDayOfMonth(s, 20);
  const A = ensureAso(ensureOrganic(s).appstore);
  const toolId = Object.keys(ASO.tools).find((k) => ASO.tools[k].usd > 0);
  setTool(s, A, toolId);
  assert.equal(s.recurring.find((r) => r.id === A.toolRecurringId).dayOfMonth, 20);
  const kind = Object.keys(ASO.help)[0];
  setHelp(s, A, kind);
  const n = s.bank.txns.length;
  const rid = A.help.recurringId;
  setHelp(s, A, kind);
  assert.equal(s.bank.txns.length, n, 'no second first-month charge');
  assert.equal(A.help.recurringId, rid);
  assert.equal(s.recurring.find((r) => r.id === rid).dayOfMonth, 20);
});
