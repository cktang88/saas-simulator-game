// "How to run your first ads": pure helpers behind the Ads Manager guide (apps/ads.js).
// Reads state only; never mutates it. Every number shown comes from growth/params.js or the
// kill/scale rules in growth/delivery.js (sourced in docs/research/marketing-and-ads.md).

import { PLATFORMS } from '../growth/params.js';
import { minDailyBudgetToExit } from '../growth/delivery.js';
import { ensureAds, defaultTargetCpa, deliveryState, creativeFor } from '../growth/adsEngine.js';
import { rowsInRange, aggregate, derive, hintFor, EMPTY } from '../growth/report.js';
import { hasProduct, mainPlan, landingConversion } from '../../core/market.js';
import { totalCash } from '../../core/bank.js';

export const SETUP = {
  meta: { pixel: 'Meta Pixel', capi: 'Conversions API (server-side)' },
  tiktok: { pixel: 'TikTok Pixel', capi: 'Events API (server-side)' },
  google: { pixel: 'Google tag + conversion action', capi: 'Enhanced conversions / offline import' },
  apple: { pixel: 'AdServices attribution (in-app SDK)', capi: 'MMP / server-side receipt validation' },
  linkedin: { pixel: 'LinkedIn Insight Tag', capi: 'LinkedIn Conversions API' },
};

// Kill rule from growth/delivery.js ruleHint: an ad gets ~2–3x target CPA of spend before it is judged on results.
export const FAIR_TEST_MULT = [2, 3];
export const CREATIVES_TO_TEST = 3; // playbook: 3–5 genuinely different hooks per week

const money0 = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

export function defaultDailyBudget(state, p) {
  const base = state.company.model === 'b2c' ? 50 : 100;
  const lim = dailyLimitOf(state, p);
  return lim ? Math.min(base, lim) : base;
}
const liveBudget = (state, p) => ensureAds(state).adsets.filter((x) => x.p === p && x.status === 'active').reduce((a, x) => a + (x.budget || 0), 0);
const dailyLimitOf = (state, p) => {
  const a = ensureAds(state).accounts[p];
  return a ? a.dailyLimit ?? null : PLATFORMS[p].newDailyLimit ?? null;
};

// Starting budget and timing advice for one platform.
// Uses the live daily budget of active ad sets once there are any, else the suggested starting budget.
export function budgetAdvice(state, p, budget = liveBudget(state, p) || defaultDailyBudget(state, p)) {
  const P = PLATFORMS[p];
  const acct = ensureAds(state).accounts[p];
  const target = acct?.targetCpa ?? defaultTargetCpa(state);
  const exitPerDay = P.learning ? minDailyBudgetToExit(target, P.learning) : null;
  const perAd = FAIR_TEST_MULT.map((m) => m * target);
  const testTotal = CREATIVES_TO_TEST * perAd[0];
  const b = Math.max(1, budget);
  return {
    target, exitPerDay, dailyLimit: dailyLimitOf(state, p), perAd, testTotal, budget: b,
    testDays: Math.ceil(testTotal / b),
    learnDays: P.learning?.learnDays ?? 7,
    canExitLearning: exitPerDay != null && b >= exitPerDay,
  };
}

// What must be true before ad money can turn into signups. `required` items block results; the rest cost money if skipped.
export function prerequisites(state, p) {
  const adv = budgetAdvice(state, p);
  const site = state.company.website;
  return [
    { id: 'product', label: 'A shipped product', done: hasProduct(state), required: true, go: 'app:product/build',
      why: 'Ad clicks need something to sign up for. With nothing shipped, every click is wasted.' },
    { id: 'website', label: 'A landing page', done: Boolean(site), required: true, go: 'app:website',
      why: 'Ads send people to your site. No page, no signups.' },
    { id: 'judged', label: 'Landing page judged by the customer panel', done: Boolean(site?.eval || state.market?.fit?.website?.score != null), required: false, go: 'app:website',
      why: 'Clicks × your page\'s visitor→signup rate = results. Fix a weak page before paying for traffic to it.' },
    { id: 'price', label: 'A price / plan', done: Boolean(mainPlan(state)), required: false, go: 'app:pricing',
      why: 'Your target cost per result comes from your price. Until you set one, Ads uses a market reference price.' },
    { id: 'cash', label: `Cash for a fair test (~${money0(adv.testTotal)})`, done: totalCash(state) >= adv.testTotal, required: false, go: 'app:bank',
      why: `${CREATIVES_TO_TEST} creatives × ~${FAIR_TEST_MULT[0]}× your ${money0(adv.target)} target CPA each. Less than that and you stop before you can tell a winner from bad luck.` },
  ];
}

const usable = (state, p) => {
  const allowed = PLATFORMS[p].formats;
  return ensureAds(state).creatives.filter((c) => allowed.includes(c.format) && !c.archived && c.status !== 'rejected');
};
export function creativeCounts(state, p) {
  const list = usable(state, p);
  return { approved: list.filter((c) => c.status === 'approved').length, inReview: list.filter((c) => c.status === 'in_review').length, total: list.length };
}
// Whether "+ Create" can work, and why not.
export function createBlocker(state, p) {
  if (p === 'apple') return null;
  if (creativeCounts(state, p).total) return null;
  return 'You need at least one creative first (Creatives tab). A campaign without ads can\'t deliver.';
}

const adsetsOn = (state, p) => ensureAds(state).adsets.filter((x) => x.p === p);

// The numbered path. Each step: { id, title, done, detail, go } where go is a tab ('setup'), an action ('create',
// 'newcr') or another app ('app:website').
export function firstAdsSteps(state, p) {
  const A = ensureAds(state);
  const P = PLATFORMS[p];
  const acct = A.accounts[p];
  const sets = adsetsOn(state, p);
  const withAds = sets.filter((x) => p === 'apple' || A.ads.some((a) => a.adsetId === x.id));
  const pre = prerequisites(state, p).filter((x) => x.required);
  const cc = creativeCounts(state, p);
  const adv = budgetAdvice(state, p);
  const spent = rowsInRange(state, { p, from: 0 }).reduce((a, r) => a + r.sp, 0);
  const firstDay = withAds.length ? Math.min(...withAds.map((x) => x.createdDay)) : null;
  const daysLive = firstDay == null ? 0 : state.day - firstDay;
  const decided = sets.some((x) => x.status === 'paused' || (x.edits ?? []).length) || A.ads.some((a) => a.p === p && a.status === 'paused');
  const steps = [
    { id: 'prereq', title: 'Check the prerequisites', done: pre.every((x) => x.done), go: pre.find((x) => !x.done)?.go ?? null,
      detail: pre.every((x) => x.done) ? 'Product shipped and landing page live.' : `Missing: ${pre.filter((x) => !x.done).map((x) => x.label.toLowerCase()).join(', ')}.` },
    { id: 'account', title: `Create a ${P.label} ad account`, done: Boolean(acct), go: 'setup', detail: 'Accounts & billing tab. 30 minutes.' },
    { id: 'payment', title: 'Add a payment method', done: Boolean(acct?.payment), go: 'setup', detail: 'Pick a company card. The platform bills at thresholds and on the 1st.' },
    { id: 'tracking', title: `Install the ${SETUP[p].pixel}`, done: Boolean(acct?.pixel), go: 'setup',
      detail: 'Without it the platform can\'t see signups, can\'t optimize and never exits learning. ~1 hour.' },
    p === 'apple'
      ? { id: 'creatives', title: 'Your App Store page is the ad', done: true, go: null, detail: 'Screenshots and rating drive tap→install.' }
      : { id: 'creatives', title: `Make creatives: ${CREATIVES_TO_TEST}+ different hooks (1 is enough to launch)`, done: cc.total >= 1, go: 'newcr',
        detail: cc.total ? `${cc.approved} approved, ${cc.inReview} in review. ${cc.total < CREATIVES_TO_TEST ? `Add ${CREATIVES_TO_TEST - cc.total} more: ~1 in 20 creatives becomes a winner, so one ad is a coin toss.` : 'Enough to start a test.'}`
          : 'Creatives tab. One specific hook for one specific person beats a feature list.' },
    { id: 'launch', title: 'Launch one campaign with one ad set', done: withAds.length > 0, go: 'create',
      detail: `Conversion objective, broad audience, ${money0(adv.budget)}/day to start${adv.dailyLimit ? ` (new accounts are capped at ${money0(adv.dailyLimit)}/day)` : ''}, all your creatives in one ad set.` },
    { id: 'wait', title: `Let it run ~${adv.learnDays} days without touching it`, done: withAds.length > 0 && (daysLive >= adv.learnDays || spent >= adv.perAd[0] * Math.max(1, cc.total)), go: 'campaigns',
      detail: !withAds.length ? 'Edits restart learning. Judge ads only after ~2–3× target CPA each.'
        : spent ? `Day ${daysLive} of ~${adv.learnDays}, ${money0(spent)} spent. Skip ahead with End day / +1 week; "What to do now" flags anything urgent.`
          : 'Delivery starts with the next day\'s auction. Press End day (or +1 week) to let it run.' },
    { id: 'decide', title: 'Read results: kill losers, scale winners', done: decided, go: 'campaigns',
      detail: 'Follow "What to do now" below the stats. Kill at ~2–3× target CPA with no result; scale winners ≤20% at a time.' },
  ];
  return steps;
}
export const currentStep = (steps) => steps.findIndex((s) => !s.done);

const FIX = {
  'No ad account': ['Create the ad account in Accounts & billing.', 'setup'],
  'No payment method': ['Add a card in Accounts & billing.', 'setup'],
  'Payment failed': ['Pay the outstanding bill (Accounts & billing). Ads are stopped until you do.', 'setup'],
  'Account spending limit reached': ['Raise or clear the account spending limit in Accounts & billing.', 'setup'],
  'No active ads': ['Add an approved creative to this ad set (drill in → + Ad).', 'creatives'],
  'In review': ['Its creatives are in review. Wait for approval (Creatives tab shows the decision).', 'creatives'],
  'No keywords': ['Add keywords to this ad group.', null],
};

// One line per ad set on this platform: what is going on and what a good operator does next.
export function nextActions(state, p) {
  const A = ensureAds(state);
  const acct = A.accounts[p];
  if (!acct) return [];
  const target = acct.targetCpa;
  const out = [];
  for (const s of adsetsOn(state, p)) {
    if (s.status !== 'active' || A.campaigns.find((c) => c.id === s.campaignId)?.status !== 'active') continue;
    const ds = deliveryState(state, s);
    if (!ds.ok) {
      const [fix, go] = FIX[ds.why] ?? [`${ds.why}. Switch to a broad audience or fix the targeting.`, null];
      out.push({ id: s.id, name: s.name, tone: 'bad', text: `Not delivering: ${ds.why}. ${fix}`, go });
      continue;
    }
    const rows = rowsInRange(state, { p, from: s.createdDay }).filter((r) => r.s === s.id);
    const g = derive(aggregate(state, rows, () => 1).get(1) ?? EMPTY());
    if (!g.sp) {
      out.push({ id: s.id, name: s.name, tone: '', text: 'Published. Delivery starts with the next day\'s auction: end the day to see spend.' });
      continue;
    }
    // Worst ad first: an ad-level kill is the most common right call.
    const adHints = A.ads.filter((a) => a.adsetId === s.id && a.status === 'active').map((a) => ({ a, h: hintFor(state, { kind: 'ad', entity: a, rows: rows.filter((r) => r.a === a.id), targetCpa: target }) })).filter((x) => x.h);
    const setHint = hintFor(state, { kind: 'adset', entity: s, rows, targetCpa: target });
    const badAd = adHints.find((x) => x.h.tone === 'bad');
    if (badAd) { out.push({ id: s.id, adId: badAd.a.id, name: `${s.name} › ${creativeFor(state, badAd.a)?.name ?? badAd.a.name}`, tone: 'bad', text: badAd.h.text }); continue; }
    if (setHint) { out.push({ id: s.id, name: s.name, tone: setHint.tone, text: setHint.text }); continue; }
    const fair = FAIR_TEST_MULT[0] * target * Math.max(1, A.ads.filter((a) => a.adsetId === s.id && a.status === 'active').length);
    if (!g.res && g.sp < fair) {
      const lp = landingConversion(state);
      out.push({ id: s.id, name: s.name, tone: '', text: `Too early to judge: ${money0(g.sp)} of the ~${money0(fair)} a fair test needs. ${g.cl} link clicks so far; your landing page turns ~${(lp * 100).toFixed(1)}% of visitors into signups. Keep it running.` });
      continue;
    }
    out.push({ id: s.id, name: s.name, tone: '', text: g.cpr && g.cpr <= target ? 'On target. Leave it alone until it exits learning, then scale ≤20% every 2–3 days.' : 'No clear signal yet. Keep it running; add new hooks rather than editing this ad set.' });
  }
  return out;
}
