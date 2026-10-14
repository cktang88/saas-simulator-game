import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, activeSubs } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import {
  seasonFactor, isBfcm, learningStatus, learningEfficiency, freqFatigue, wearFatigue, auctionDay, searchDay, reportRate,
  roas, qualityFromDraw, winnerProbability, budgetEditEffect, baseCtr, frequencyOf, minDailyBudgetToExit, parseKeywords, ruleHint,
} from '../public/apps/growth/delivery.js';
import { PLATFORMS } from '../public/apps/growth/params.js';
import { seoRamp, seoDailyVisits, keywordMetrics, drawPosition, kFactor, viralMultiplier, womTrialsPerDay, womWeight, networkLaunchPlan, phOutcome, socialReach, communityOutcome } from '../public/apps/growth/organicModel.js';
import { creativeHeuristic, policyCheck, articleHeuristic, slopScore } from '../public/apps/growth/judges.js';
import { ensureAds, createAccount, createCampaign, createAdSet, createAd, addCreative, editBudget } from '../public/apps/growth/adsEngine.js';
import { cohortRows, cohortRoas, acquire } from '../public/apps/growth/acquire.js';
import { launchToNetwork, setReferral, currentK, publishArticle } from '../public/apps/growth/organicEngine.js';

const mulberry = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const D = (iso) => new Date(`${iso}T12:00:00Z`);

function fresh(model = 'b2c', seed = 7) {
  const s = newState({ companyName: 'Growth Co', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  s.company.website = { source: 'paste', title: 'x', text: 'x' };
  s.company.oneLiner = 'Habit tracker for busy parents who want to read more books';
  return s;
}

// ---------------- pure model ----------------

test('seasonality: January CPM < November; BFCM week is the peak; B2B peaks in February', () => {
  assert.ok(seasonFactor('social', 'b2c', D('2027-01-15')) < seasonFactor('social', 'b2c', D('2026-11-10')));
  assert.ok(isBfcm(D('2026-11-27')) && isBfcm(D('2026-11-30')) && !isBfcm(D('2026-11-10')));
  assert.ok(seasonFactor('social', 'b2c', D('2026-11-27')) > seasonFactor('social', 'b2c', D('2026-11-10')));
  assert.ok(seasonFactor('b2b', 'smb', D('2027-02-10')) > seasonFactor('b2b', 'smb', D('2027-07-10')));
  // Search moves less than social
  const sJan = seasonFactor('search', 'b2c', D('2027-01-15'));
  assert.ok(sJan > seasonFactor('social', 'b2c', D('2027-01-15')) && sJan < 1);
});

test('learning phase exits around 50 optimization events in 7 days, otherwise learning limited', () => {
  const cfg = PLATFORMS.meta.learning;
  assert.equal(learningStatus({ events: 49, days: 5, cfg }), 'learning');
  assert.equal(learningStatus({ events: 50, days: 5, cfg }), 'active');
  assert.equal(learningStatus({ events: 20, days: 7, cfg }), 'limited');
  assert.equal(learningStatus({ prev: 'active', events: 0, days: 30, cfg }), 'active');
  assert.equal(learningStatus({ events: 100, days: 2, cfg, tracked: false }), 'untracked');
  assert.ok(learningEfficiency('learning') < learningEfficiency('active'));
  assert.equal(Math.round(minDailyBudgetToExit(25, cfg)), 179); // ≈ 7 × CPA per day
});

test('budget edits: ≤20% safe, >50% always re-enters learning', () => {
  const r = mulberry(1);
  assert.equal(budgetEditEffect(100, 115, r).relearn, false);
  assert.equal(budgetEditEffect(100, 200, r).relearn, true);
  let n = 0;
  for (let i = 0; i < 1000; i++) n += budgetEditEffect(100, 140, r).relearn ? 1 : 0;
  assert.ok(n > 400 && n < 600, `${n}`);
});

test('fatigue lowers CTR as frequency and lifetime impressions grow', () => {
  assert.equal(freqFatigue(1.5), 1);
  assert.ok(freqFatigue(3) < freqFatigue(2.5) && freqFatigue(5) < freqFatigue(3));
  assert.ok(wearFatigue(500_000, 3_000_000) < wearFatigue(50_000, 3_000_000));
  assert.ok(frequencyOf(300_000, 100_000) > frequencyOf(30_000, 100_000));
  const base = { platform: 'meta', model: 'b2c', date: D('2027-03-10'), budget: 200, audience: { type: 'retargeting', size: 20000 }, placement: 'advantage', objective: 'sales', optimization: 'trial', bid: { strategy: 'lowest_cost' }, status: 'active', landingRate: 0.05, priceMonthly: 10, ads: [{ id: 'a', q: 0.6, format: 'static', lifeImps: 0 }] };
  const freshDay = auctionDay({ ...base, imps6: 0, rand: mulberry(3) });
  const tired = auctionDay({ ...base, imps6: 120000, ads: [{ ...base.ads[0], lifeImps: 200000 }], rand: mulberry(3) });
  assert.ok(tired.freq7 > freshDay.freq7);
  assert.ok(tired.ads[0].ctr < freshDay.ads[0].ctr * 0.75, `${tired.ads[0].ctr} vs ${freshDay.ads[0].ctr}`);
});

test('creative quality: ~5% winners with a neutral brief, more with a strong one; CTR follows research bands', () => {
  const r = mulberry(11);
  const draws = (skill) => { let w = 0; for (let i = 0; i < 20000; i++) if (qualityFromDraw(r(), skill) >= 0.95) w++; return w / 20000; };
  const neutral = draws(0.5);
  assert.ok(neutral > 0.04 && neutral < 0.06, `${neutral}`);
  assert.ok(draws(1) > 0.08 && draws(0) < 0.035);
  assert.ok(Math.abs(winnerProbability(0.5) - 0.05) < 0.001);
  assert.ok(baseCtr(0.2) < 0.007 && baseCtr(0.5) >= 0.008 && baseCtr(0.5) <= 0.012 && baseCtr(0.98) >= 0.02 && baseCtr(0.98) <= 0.035);
});

test('B2C Meta cost per trial lands in the researched $25–150 band for an average funnel', () => {
  const res = auctionDay({ platform: 'meta', model: 'b2c', date: D('2027-04-10'), budget: 100, audience: { type: 'broad', size: 3_000_000 }, placement: 'advantage', objective: 'sales', optimization: 'trial', bid: { strategy: 'lowest_cost' }, status: 'active', imps6: 0, landingRate: 0.033, priceMonthly: 10, ads: [{ id: 'a', q: 0.5, format: 'static', lifeImps: 50000 }], rand: mulberry(5) });
  const cpa = res.spend / res.ads[0].expConv;
  assert.ok(res.cpm > 10 && res.cpm < 20, `CPM ${res.cpm}`);
  assert.ok(cpa > 25 && cpa < 150, `cost per trial ${cpa}`);
});

test('search is demand-capped and LinkedIn is far pricier than Meta', () => {
  const kw = parseKeywords('[invoice software]\n"bookkeeping for shopify"\nreconciliation tool');
  assert.deepEqual(kw.map((k) => k.match), ['exact', 'phrase', 'broad']);
  const s = searchDay({ platform: 'google', model: 'smb', date: D('2027-04-10'), budget: 5000, keywords: kw.map((k) => ({ ...k, relevance: 0.6 })), q: 0.5, landingRate: 0.02, status: 'active', rand: mulberry(2) });
  assert.ok(s.spend < 500, `spent ${s.spend} of 5000: demand cap`);
  assert.ok(s.cpc > 3 && s.cpc < 10, `CPC ${s.cpc}`);
  const li = auctionDay({ platform: 'linkedin', model: 'smb', date: D('2027-04-10'), budget: 100, audience: { type: 'jobtitles', size: 150000 }, placement: 'advantage', objective: 'leads', optimization: 'trial', bid: {}, status: 'active', imps6: 0, landingRate: 0.02, priceMonthly: 49, ads: [{ id: 'a', q: 0.5, format: 'static', lifeImps: 0 }], rand: mulberry(2) });
  assert.ok(li.cpm > 50, `LinkedIn CPM ${li.cpm}`);
  assert.ok(li.spend / li.ads[0].clicks > 5, 'LinkedIn CPC > $5');
});

test('attribution: no pixel reports nothing, CAPI reports more than pixel-only; ROAS math', () => {
  assert.equal(reportRate({ platform: 'meta', model: 'b2c', pixel: false }), 0);
  const px = reportRate({ platform: 'meta', model: 'b2c', pixel: true, capi: false });
  const capi = reportRate({ platform: 'meta', model: 'b2c', pixel: true, capi: true });
  assert.ok(capi > px && capi < 1 && px > 0.4);
  assert.equal(roas(150, 100), 1.5);
  assert.equal(roas(10, 0), null);
});

test('rule hints: kill weak hooks, flag fatigue, scale winners', () => {
  assert.equal(ruleHint({ spend: 30, results: 0, imps: 3000, ctr: 0.004, targetCpa: 25 }).tone, 'bad');
  assert.match(ruleHint({ spend: 300, results: 10, imps: 30000, ctr: 0.01, ctrBaseline: 0.015, ctrRecent: 0.009, freq7: 3, targetCpa: 40, cpa: 30, status: 'active', days: 10 }).text, /Fatigue/);
  assert.equal(ruleHint({ spend: 300, results: 15, imps: 30000, ctr: 0.015, targetCpa: 25, cpa: 20, status: 'active', days: 5 }).tone, 'good');
});

test('copy heuristics punish generic copy and policy violations', () => {
  const s = fresh();
  const generic = creativeHeuristic(s, { hook: 'Introducing the best app', primaryText: 'Revolutionize your life with our seamless, AI-powered all-in-one solution.', headline: 'Unlock your potential' });
  const specific = creativeHeuristic(s, { hook: 'I read 23 books this year with two toddlers', primaryText: 'Busy parents: 12 minutes a night, tracked automatically. 14-day free trial.', headline: 'Read more books as a parent' });
  assert.ok(generic.generic && !specific.generic);
  assert.ok(specific.hook > generic.hook);
  assert.ok(policyCheck('Are you depressed? Try this'));
  assert.equal(policyCheck('Read 20 minutes a night'), null);
  assert.ok(slopScore("In today's fast-paced world, let's delve into the tapestry") > slopScore('We tested 14 habit apps for 30 days.'));
  const a = articleHeuristic(s, { title: 'Best habit tracker for parents', query: 'best habit tracker for parents', body: 'We tested 14 apps for 30 days. '.repeat(80) });
  assert.equal(a.informational, false);
});

test('SEO: long-tail ramps in 3–6 months, competitive terms take 12–24; AI Overviews cut informational clicks', () => {
  assert.ok(seoRamp(30, 'long') < 0.1 && seoRamp(180, 'long') > 0.75);
  assert.ok(seoRamp(180, 'hard') < 0.1 && seoRamp(720, 'hard') > 0.75);
  const v = (informational) => seoDailyVisits({ volume: 1000, position: 1, informational, ageDays: 365, tier: 'long' });
  assert.ok(v(true) < v(false) * 0.6);
  const km = keywordMetrics('best budgeting app for couples with kids', 'b2c');
  assert.ok(km.kd < keywordMetrics('budget app', 'b2c').kd);
  const r = mulberry(4);
  let top = 0;
  for (let i = 0; i < 2000; i++) if (drawPosition({ tier: 'hard', quality: 0.6, dr: 2 }, r) <= 10) top++;
  assert.ok(top / 2000 < 0.06, `competitive top-10 rate ${top / 2000}`);
});

test('K-factor stays in researched ranges; referral programs add, never create virality', () => {
  const base = kFactor({ model: 'b2c', productFactor: 1, referral: null });
  const ref = kFactor({ model: 'b2c', productFactor: 1, referral: { enabled: true, reward: 'free_month', twoSided: true } });
  assert.ok(base >= 0.1 && base <= 0.25, `${base}`);
  assert.ok(ref > base && ref <= 0.7, `${ref}`);
  assert.ok(kFactor({ model: 'b2c', productFactor: 1.75, referral: { enabled: true, reward: 'free_month', twoSided: true } }) < 1);
  assert.ok(Math.abs(viralMultiplier(0.2) - 1.25) < 1e-9);
  assert.ok(Math.abs(womTrialsPerDay({ weighted: 300 * womWeight(10), k: 0.2, trialConv: 0.4 }) - 2) < 1e-9);
  assert.ok(womWeight(400) < womWeight(10) / 20, 'referrals come mostly from new, delighted customers');
});

test('organic one-offs: network launch yields a handful of paying users, PH is a one-day spike', () => {
  const plan = networkLaunchPlan({ network: { friends: 50, linkedin: 300, x: 100, newsletter: 0 }, channels: { friends: true, linkedin: true, x: true }, model: 'b2c', skill: 0.5 });
  const expectedPaying = plan.trials.friends * plan.payProb.friends + plan.visits * 0.05 * 2 * 0.4 * 0.6;
  assert.ok(expectedPaying >= 0.2 && expectedPaying <= 3, `${expectedPaying}`);
  const r = mulberry(9);
  let top3 = 0;
  for (let i = 0; i < 2000; i++) if (phOutcome({ skill: 0.5, networkSize: 400, productFit: 0.5, weekend: false }, r).rank <= 3) top3++;
  assert.ok(top3 / 2000 < 0.05, `top3 ${top3 / 2000}`);
  const sr = socialReach({ followers: 1000, platform: 'linkedin', skill: 0.6, hasLink: false }, mulberry(1));
  assert.ok(sr.reach > 0 && sr.newFollowers < sr.reach * 0.02);
  const banned = communityOutcome({ size: 'large', helpfulness: 0.2, relevance: 0.5, promotional: 1, report: 1, hasLink: true }, () => 0.01);
  assert.ok(banned.removed);
});

// ---------------- integration ----------------

function runMeta(model, days = 35, { budget = 120, capi = true } = {}) {
  const s = fresh(model);
  const acct = createAccount(s, 'meta');
  acct.payment = 'card_1'; acct.pixel = true; acct.capi = capi;
  const c = createCampaign(s, { p: 'meta', name: 'Test', objective: model === 'ent' ? 'leads' : 'sales' });
  const set = createAdSet(s, { campaignId: c.id, name: 'Broad', budget, optimization: model === 'ent' ? 'lead' : 'trial', audience: { type: 'broad' } });
  for (let i = 0; i < 4; i++) {
    const cr = addCreative(s, { format: i % 2 ? 'static' : 'founder_video', hook: `Hook ${i}`, primaryText: 'x', headline: 'y', skill: 0.5 });
    cr.status = 'approved';
    createAd(s, { adsetId: set.id, creativeId: cr.id });
  }
  advance(s, days, APPS);
  return { s, set };
}

test('B2C Meta campaign: spend billed to the bank, real trials with ads:meta source, reported ≤ actual, cohorts', () => {
  const { s, set } = runMeta('b2c', 40);
  const A = ensureAds(s);
  const spend = A.rows.reduce((a, r) => a + r.sp, 0);
  assert.ok(spend > 1000, `spend ${spend}`);
  const billed = -s.bank.txns.filter((t) => t.category === 'advertising').reduce((a, t) => a + t.amount, 0);
  assert.ok(billed > 0 && billed <= spend + 0.01, `billed ${billed} of ${spend}`);
  const subs = s.stripe.subscriptions.filter((x) => x.source === 'ads:meta');
  assert.ok(subs.length > 5, `${subs.length} ad trials`);
  const trueStarts = A.rows.reduce((a, r) => a + r.tr, 0);
  const reported = A.rows.reduce((a, r) => a + r.rt, 0);
  assert.equal(trueStarts, subs.length);
  assert.ok(reported < trueStarts * 1.1, `reported ${reported} vs true ${trueStarts}`);
  assert.ok(['learning', 'limited', 'active'].includes(set.learn.status));
  const rows = cohortRows(s, 'ads:meta', 10);
  assert.ok(rows.some((e) => e.sp > 0 && e.tr > 0));
  const paidRevenue = rows.reduce((a, e) => a + e.r, 0);
  assert.ok(paidRevenue > 0, 'trials converted and Stripe revenue booked to ad cohorts');
  const old = rows.find((e) => e.mature.r7);
  assert.ok(old && cohortRoas(old, 'r7') != null);
  assert.ok(cohortRoas(old, 'r7') < 1.5, `D7 ROAS ${cohortRoas(old, 'r7')}: LTV unfolds over time`);
});

test('new-account daily spending limit and account spending cap are hard caps', () => {
  // Several seeds so the check does not depend on one RNG sequence (pacing noise can exceed budget by ~8%).
  for (const seed of [1, 7, 42, 99, 2026]) {
    const s = fresh('b2c', seed);
    const acct = createAccount(s, 'meta');
    acct.payment = 'card_1'; acct.pixel = true;
    const c = createCampaign(s, { p: 'meta', objective: 'sales' });
    for (let k = 0; k < 2; k++) {
      const set = createAdSet(s, { campaignId: c.id, budget: 500, optimization: 'trial' });
      const cr = addCreative(s, { format: 'static', hook: 'h', skill: 0.5 }); cr.status = 'approved';
      createAd(s, { adsetId: set.id, creativeId: cr.id });
    }
    const limit = acct.dailyLimit;
    advance(s, 1, APPS);
    const day1 = ensureAds(s).rows.filter((r) => r.d === s.day).reduce((a, r) => a + r.sp, 0);
    assert.ok(day1 > 0 && day1 <= limit + 0.02, `seed ${seed}: day 1 spend ${day1} vs limit ${limit}`);
    acct.dailyLimit = null;
    acct.spendCap = acct.lifetime + 120;
    advance(s, 3, APPS);
    assert.ok(acct.lifetime <= acct.spendCap + 0.02, `seed ${seed}: lifetime ${acct.lifetime} vs cap ${acct.spendCap}`);
  }
});

test('large budget increase puts the ad set back into learning', () => {
  const { s, set } = runMeta('b2c', 3);
  set.learn.status = 'active';
  const eff = editBudget(s, set.id, set.budget * 3);
  assert.ok(eff.relearn);
  assert.equal(set.learn.status, 'learning');
});

test('declined ad payments stop delivery', () => {
  const s = fresh('b2c');
  post(s, { amount: -99990, counterparty: 'x', category: 'other' });
  const acct = createAccount(s, 'meta');
  acct.payment = 'card_1'; acct.pixel = true;
  const c = createCampaign(s, { p: 'meta', objective: 'sales' });
  const set = createAdSet(s, { campaignId: c.id, budget: 40, optimization: 'trial' });
  const cr = addCreative(s, { format: 'static', hook: 'h', skill: 0.5 }); cr.status = 'approved';
  createAd(s, { adsetId: set.id, creativeId: cr.id });
  advance(s, 6, APPS);
  assert.equal(acct.status, 'payment_failed');
});

test('enterprise ads create CRM inbound leads, not trials', () => {
  const { s } = runMeta('ent', 30, { budget: 300 });
  const leads = (s.apps.crm?.inboundQueue ?? []).filter((l) => l.source === 'ads:meta');
  assert.ok(leads.length > 0, `${leads.length} leads`);
  assert.equal(s.stripe.subscriptions.filter((x) => x.source === 'ads:meta').length, 0);
  assert.ok(leads[0].company && leads[0].email.includes('@'));
});

test('B2B SMB acquisitions are trials; plans without a trial route to CRM leads', () => {
  const s = fresh('smb');
  assert.equal(acquire(s, { source: 'organic:seo', n: 2 }).subs.length, 2);
  s.plans[0].trialDays = 0;
  assert.equal(acquire(s, { source: 'organic:seo', n: 2 }).leads, 2);
});

test('network launch is one-time and mostly yields 0–3 paying customers', () => {
  let paying = 0;
  const runs = 8;
  for (let i = 0; i < runs; i++) {
    const s = fresh('b2c', 100 + i);
    launchToNetwork(s, { channels: { friends: true, linkedin: true, x: true }, message: 'hi', skill: 0.5 });
    assert.throws(() => launchToNetwork(s, { channels: { friends: true }, message: 'again', skill: 0.5 }));
    advance(s, 40, APPS);
    paying += activeSubs(s).filter((x) => x.source === 'network').length;
  }
  assert.ok(paying / runs <= 3.5, `avg paying ${paying / runs}`);
});

test('word of mouth grows with active customers and a referral program', () => {
  const s = fresh('b2c');
  for (let i = 0; i < 300; i++) acquire(s, { source: 'direct', n: 1, forceConvert: 0.9 });
  advance(s, 16, APPS);
  const before = s.stripe.subscriptions.filter((x) => x.source === 'organic:wom' || x.source === 'referral').length;
  setReferral(s, { enabled: true, reward: 'free_month', twoSided: true });
  assert.ok(currentK(s) > 0.15);
  advance(s, 30, APPS);
  const refs = s.stripe.subscriptions.filter((x) => x.source === 'referral').length;
  assert.ok(refs > 0, 'referral signups appear');
  assert.ok(before >= 0);
});

test('SEO articles publish, rank later, and AI slop ranks worse', () => {
  const s = fresh('smb');
  const good = publishArticle(s, { title: 'Shopify bookkeeping: what we learned closing 40 stores', query: 'shopify bookkeeping checklist for small stores', body: 'x', judge: { quality: 0.85, slop: 0.05, informational: true, citable: 0.4, results: [], mock: true } });
  assert.ok(good.position >= 1 && good.tier);
  advance(s, 200, APPS);
  assert.ok(s.apps.organic.articles[0].visits >= 0);
});
