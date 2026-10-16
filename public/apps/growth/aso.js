// App Store Optimization engine (Apple App Store + Google Play), B2C only. State lives in
// state.apps.organic.appstore (owned by the Organic app); this module adds the per-store slices with ??= migrations.
//
// Funnel per store and day: search terms (from the live metadata) × searches/day × tap at the term's rank → page
// views, plus brand and browse views; page views × product-page conversion → installs → trials (core conversion).
// Rank settles toward a target set by field relevance, term fit, install velocity (organic + Apple Search Ads) and
// ratings. Metadata changes go through review (Apple 1-3 days, rejection risk for competitor names / stuffing /
// claims under 2.3.7); creative tests split real traffic and need it to reach significance; rating prompts are
// capped at 3 per user per 365 days; fake or incentivized reviews can get the app removed. Every mistake is logged
// with its cost (core/operator.js). Numbers: ./asoParams.js (docs/research/seo/aso.md).

import { ASO, STAGES } from './asoParams.js';
import { APPSTORE } from './params.js';
import * as M from './asoModel.js';
import { reviewStars } from './organicModel.js';
import { acquire, sampleCount } from './acquire.js';
import { landingConversion, hasProduct, marketDemand } from '../../core/market.js';
import { b2cCategoryOf } from '../../core/churn.js';
import { post, addRecurring } from '../../core/bank.js';
import { mrr } from '../../core/stripe.js';
import { notify } from '../../core/state.js';
import { logMistake, registerOperatorReader, hasOperatorReader, tierFromScore, shrink, trapCoaching } from '../../core/operator.js';
import { rng, uid } from '../../core/util.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const FN = 'app_store_optimization';
export const STORES = { ios: 'App Store', play: 'Google Play' };
// Prompt strategies: per-installer response to the first prompt and star shift. after_aha / on_open / none from
// APPSTORE (game calibration); 'timer' (after N days regardless of success) [design].
export const PROMPT_RATE = { ...APPSTORE.promptRate, timer: 0.01 };
export const PROMPT_SHIFT = { ...APPSTORE.promptStarShift, timer: -0.1 };

const newStore = (enabled) => ({
  enabled, live: null, pending: null, shotsPending: null, ranks: {}, shots: { q: 0.3, production: 'plain', captions: [], video: false },
  testLift: 0, tests: [], removedUntil: null, terminated: false, demoteUntil: null, submissions: [], daily: [],
});

/** Migrate / initialise the app-store slice (save compatible: only ??=). S = state.apps.organic.appstore. */
export function ensureAso(S) {
  S.startDay ??= null; S.reviews ??= 0; S.starSum ??= 0; S.prompt ??= 'none'; S.aso ??= null;
  S.stores ??= {};
  S.stores.ios ??= newStore(true);
  S.stores.play ??= newStore(false);
  if (S.aso && !S.stores.ios.live) S.stores.ios.live = { name: S.aso.title ?? '', subtitle: S.aso.subtitle ?? '', keywords: S.aso.keywords ?? '', description: S.aso.description ?? '', score: S.aso.score ?? null, feedback: S.aso.feedback ?? '', day: S.aso.day ?? 0 };
  S.promptPlan ??= { strategy: S.prompt ?? 'none', perYear: 1 };
  S.writeReviewLink ??= false;
  S.replies ??= { until: -1, weeks: 0 };
  S.fake ??= { bought: 0, incentive: null, items: [], detections: 0 };
  S.tool ??= 'console';
  S.toolRecurringId ??= null;
  S.help ??= null;
  S.tracked ??= [];
  S.locales ??= {};
  S.cpps ??= [];
  S.category ??= null;
  S.stats ??= { submissions: 0, rejections: 0, testsRun: 0, testsWon: 0, testsApplied: 0, badApplies: 0, resets: 0, replyWeeks: 0, promptChanges: 0 };
  S.fees ??= { appleYearDay: null, play: false };
  S.asa ??= { cannibalized: 0, paidInstalls: 0 };
  return S;
}
// Read-only access that never creates the slice (for readers and the ads engine).
const peek = (state) => state?.apps?.organic?.appstore ?? null;

export const categoryOf = (state) => peek(state)?.category ?? b2cCategoryOf(state);
export const fitCtx = (state) => ({ appWords: M.appWordsOf(state), category: categoryOf(state), brand: M.brandTokens(state.company?.name ?? '') });
export const defaultListing = (state) => ({ name: state.company?.name ?? '', subtitle: '', keywords: '', description: '', score: null, default: true });
export const currentListing = (state, store) => peek(state)?.stores?.[store]?.live ?? defaultListing(state);
export const starsOf = (S) => (S.reviews ? S.starSum / S.reviews : null);

// ---------------- metadata submission (review friction) ----------------

const recentSubs = (st, day, window) => st.submissions.filter((d) => d > day - window).length;

/**
 * Submit metadata for review. listing { name, subtitle, keywords, description }; judged extras: score, feedback
 * (aso_listing_review), rejectP and termFit (Jev decide or heuristic). Returns { ok, errors?, pending }.
 */
export function submitMetadata(state, S, store, listing, { score = null, feedback = '', rejectP = null, termFit = null } = {}) {
  ensureAso(S);
  const st = S.stores[store];
  if (!st.enabled) return { ok: false, errors: [`${STORES[store]} is not set up yet.`] };
  if (st.terminated) return { ok: false, errors: ['The developer account was terminated.'] };
  if (st.pending) return { ok: false, errors: ['A version is already in review.'] };
  const v = M.validateMetadata(store, listing, { brand: state.company.name, category: categoryOf(state) });
  if (v.errors.length) return { ok: false, errors: v.errors, validation: v };
  chargeAppleFee(state, S, store);
  const [lo, hi] = ASO.review[store];
  const days = lo + Math.floor(rng(state) * (hi - lo + 1));
  const p = rejectP ?? M.rejectionRisk(store, v);
  // A 3rd metadata change inside 30 days throws away the ranks that were still settling: going in circles.
  if (recentSubs(st, state.day, ASO.churnWindow) >= ASO.churnMax) {
    logMistake(state, { functionId: FN, id: 'metadata_churn', label: `Changed ${STORES[store]} metadata again before ranks settled`, cost: { days: ASO.settleDays[store], hours: 0 }, circles: true, app: 'organic', detail: `${recentSubs(st, state.day, ASO.churnWindow) + 1} submissions in ${ASO.churnWindow} days. Keyword ranks need 1-4 weeks to settle after each change, so nothing you changed could be measured.` });
  }
  st.submissions.push(state.day);
  S.stats.submissions++;
  st.pending = { listing: { name: listing.name ?? '', subtitle: listing.subtitle ?? '', keywords: store === 'ios' ? listing.keywords ?? '' : '', description: listing.description ?? '', score, feedback, termFit }, submitDay: state.day, decideDay: state.day + days, p, warnings: v.warnings, competitors: v.competitors, claims: v.claims, stuffing: v.stuffing };
  return { ok: true, pending: st.pending, validation: v, days };
}
function chargeAppleFee(state, S, store) {
  if (store === 'ios' && (S.fees.appleYearDay == null || state.day - S.fees.appleYearDay >= 365)) {
    post(state, { amount: -ASO.fees.appleYear, counterparty: 'Apple Developer Program', description: 'Annual membership', category: 'software', method: 'card' });
    S.fees.appleYearDay = state.day;
  }
}
// Approve the listing directly (an already-approved listing, used for saves/tests that predate the review flow).
export function applyListing(state, S, store, listing) {
  ensureAso(S);
  const st = S.stores[store];
  st.live = { ...listing, day: state.day };
  if (store === 'ios') S.aso = { day: state.day, title: listing.name, subtitle: listing.subtitle, keywords: listing.keywords, description: listing.description, score: listing.score ?? null, feedback: listing.feedback ?? '' };
  return st.live;
}
function resolvePending(state, S, store) {
  const st = S.stores[store];
  const pd = st.pending;
  if (!pd || state.day < pd.decideDay) return;
  st.pending = null;
  if (rng(state) < pd.p) {
    S.stats.rejections++;
    const why = pd.competitors.length ? `other apps' names in the metadata (${pd.competitors.join(', ')}), guideline 2.3.7` : pd.claims.length ? `pricing or ranking claims (${pd.claims.join(', ')})` : pd.stuffing ? 'keyword stuffing / repeated terms' : 'a metadata issue the reviewer flagged';
    const repeat = S.stats.rejections > 1;
    if (repeat && store === 'ios' && (pd.competitors.length || pd.stuffing)) st.demoteUntil = state.day + ASO.fake.demoteDays;
    notify(state, `${STORES[store]} rejected your update: ${why}. Your previous listing stays live; fix it and resubmit.`, { type: 'bad', app: 'organic' });
    logMistake(state, { functionId: FN, id: pd.competitors.length ? 'competitor_names' : pd.claims.length ? 'pricing_claims' : 'metadata_rejected', label: `${STORES[store]} update rejected (${pd.competitors.length ? 'competitor names' : pd.claims.length ? 'claims' : 'stuffing'})`, cost: { hours: 1, days: pd.decideDay - pd.submitDay + ASO.review[store][1] }, circles: repeat, charge: true, app: 'organic', detail: `Rejected for ${why}. The days in review are lost and the fix needs another review cycle${repeat ? '; a repeat offence also pushes your keyword ranks down for 30 days' : ''}.` });
    return;
  }
  applyListing(state, S, store, pd.listing);
  notify(state, `${STORES[store]} approved your listing update. Keyword ranks will take ${store === 'ios' ? '1-4 weeks' : 'about a week'} to settle.`, { type: 'good', app: 'organic' });
}

// ---------------- screenshots, video, CPPs, localization ----------------

export function submitScreenshots(state, S, store, { production = 'self', captions = [], video = false }) {
  ensureAso(S);
  const st = S.stores[store];
  const c = ASO.screenshotCost[production] ?? ASO.screenshotCost.self;
  if (c.usd) post(state, { amount: -c.usd, counterparty: production === 'agency' ? 'ASO creative agency' : 'Screenshot designer (freelance)', description: `App Store screenshot set (${STORES[store]})`, category: 'contractors', method: 'card' });
  if (video && !st.shots.video) post(state, { amount: -ASO.videoCost.usd, counterparty: 'App preview video (freelance)', description: '30-second app preview', category: 'contractors', method: 'card' });
  const q = M.screenshotQuality(production, captions, M.appWordsOf(state));
  const [lo, hi] = ASO.review[store];
  st.shotsPending = { shots: { q, production, captions: captions.slice(0, 10), video: video || st.shots.video }, day: state.day + lo + Math.floor(rng(state) * (hi - lo + 1)) };
  return st.shotsPending;
}
export function createCpp(state, S, { theme, adsetId = null }) {
  ensureAso(S);
  if (S.cpps.length >= ASO.cpp.max) return { ok: false, error: `Up to ${ASO.cpp.max} custom product pages.` };
  const c = { id: uid('cpp'), theme: String(theme ?? '').slice(0, 60), adsetId, day: state.day };
  S.cpps.push(c);
  return { ok: true, cpp: c };
}
export function localize(state, S, code, quality) {
  ensureAso(S);
  const L = ASO.locales[code], Q = ASO.localeQuality[quality];
  if (!L || !Q) return { ok: false };
  if (Q.usd) post(state, { amount: -Q.usd, counterparty: quality === 'adapted' ? 'Localization agency' : 'Freelance translator', description: `Store listing localization: ${L.label}`, category: 'contractors', method: 'card' });
  S.locales[code] = quality;
  return { ok: true };
}
export const localeMult = (S) => 1 + Object.entries(S.locales ?? {}).reduce((a, [code, q]) => a + (ASO.locales[code]?.share ?? 0) * ((ASO.localeQuality[q]?.q ?? ASO.englishOnly) - ASO.englishOnly), 0);
export function enablePlay(state, S) {
  ensureAso(S);
  if (S.stores.play.enabled) return;
  S.stores.play.enabled = true;
  if (!S.fees.play) { post(state, { amount: -ASO.fees.playOnce, counterparty: 'Google Play Console', description: 'Developer registration (one time)', category: 'software', method: 'card' }); S.fees.play = true; }
}

// ---------------- ratings ----------------

export function setPromptPlan(state, S, { strategy, perYear = 1 }) {
  ensureAso(S);
  S.promptPlan = { strategy, perYear: Math.max(1, Math.round(+perYear || 1)) };
  S.prompt = strategy;
  S.stats.promptChanges++;
  if (strategy === 'on_open') logMistake(state, { functionId: FN, id: 'review_prompt_on_open', label: 'Asking for a rating on app open', cost: { reputation: 2 }, delayed: true, detail: 'Interrupting people before they got value pulls ratings down; your star average and store conversion will show it.', app: 'organic' });
  return ratingPlanInfo(S);
}
export const ratingPlanInfo = (S) => M.ratingYield(S.promptPlan, PROMPT_RATE, { writeReviewLink: S.writeReviewLink });
export function replyToReviews(state, S) {
  ensureAso(S);
  S.replies.until = state.day + 7;
  S.replies.weeks++;
  S.stats.replyWeeks++;
}
export function resetRatings(state, S) {
  ensureAso(S);
  const stars = starsOf(S), n = S.reviews;
  if (stars != null && stars >= 4 && n >= 20) logMistake(state, { functionId: FN, id: 'reset_good_rating', label: 'Reset a good App Store rating', cost: { reputation: 1 }, delayed: true, app: 'organic', detail: `Threw away ${n} ratings averaging ${stars.toFixed(1)}★: the page shows no stars until new ratings come in, and search rank loses its ratings signal. Reset only to escape a bad rating after a real fix.` });
  S.reviews = 0; S.starSum = 0; S.fake.items.forEach((x) => { x.live = 0; }); S.resetDay = state.day; S.stats.resets++;
}
/** Buy reviews from a review farm. Logged as a mistake immediately (money + exposure); detection may come later. */
export function buyReviews(state, S, n) {
  ensureAso(S);
  const usd = Math.round(n * ASO.fake.buy.usdPerReview);
  post(state, { amount: -usd, counterparty: 'App review service', description: `${n} app store reviews`, category: 'marketing', method: 'card' });
  S.fake.items.push({ id: uid('fk'), day: state.day, n, delivered: 0, live: 0, kind: 'buy', detected: false });
  S.fake.bought += n;
  logMistake(state, { functionId: FN, id: 'fake_reviews', label: 'Bought app store reviews', cost: { usd, reputation: 3 }, app: 'organic', detail: 'Apple can remove the app or end your developer membership for paid or fake reviews, and the FTC rule (16 CFR 465) bans buying them. Detection can come months later.' });
}
export function setIncentive(state, S, on) {
  ensureAso(S);
  if (on && !S.fake.incentive) {
    S.fake.incentive = { since: state.day, ratings: 0, sum: 0 };
    logMistake(state, { functionId: FN, id: 'incentivized_reviews', label: 'Rewarded users for 5-star ratings', cost: { reputation: 3 }, app: 'organic', detail: 'Incentives conditioned on a rating violate App Review Guidelines and the FTC review rule; a reviewer report or a pattern in the ratings can trigger removal.' });
  } else if (!on && S.fake.incentive) S.fake.incentive.until = state.day;
}

// ---------------- tools & people ----------------

export function setTool(state, S, id) {
  ensureAso(S);
  const T = ASO.tools[id];
  if (!T || S.tool === id) return;
  const old = state.recurring?.find((r) => r.id === S.toolRecurringId);
  if (old) old.active = false;
  S.toolRecurringId = null;
  S.tool = id;
  if (T.usd > 0) {
    post(state, { amount: -T.usd, counterparty: T.label, description: 'ASO tool, first month', category: 'software', method: 'card' });
    S.toolRecurringId = addRecurring(state, { vendor: T.label, amount: T.usd, category: 'software', note: 'ASO tool' }).id;
  }
}
export function setHelp(state, S, kind) {
  ensureAso(S);
  if (S.help) { const r = state.recurring?.find((x) => x.id === S.help.recurringId); if (r) r.active = false; }
  if (!kind) { S.help = null; return; }
  const H = ASO.help[kind];
  post(state, { amount: -H.usd, counterparty: H.label, description: 'ASO retainer, first month', category: 'contractors', method: 'ach' });
  S.help = { kind, since: state.day, lastRun: state.day, recurringId: addRecurring(state, { vendor: H.label, amount: H.usd, category: 'contractors', note: 'ASO retainer' }).id, paid: H.usd };
}

// What the player can SEE about a term: truth with tool error (fixed per term and tool), or coarse Apple Ads
// popularity with an Apple Ads account, or nothing.
export function termIntel(state, store, term) {
  const S = peek(state);
  const T = ASO.tools[S?.tool ?? 'console'];
  const m = M.termMetrics(term, { category: categoryOf(state), store });
  const out = { term: m.term, popularity: null, difficulty: null, bucket: null, competitors: [] };
  if (T?.err != null) {
    const z = (M.strHash(`${m.term}|${S.tool}`) + M.strHash(`${m.term}|${S.tool}|2`) - 1) * 2.45;
    out.popularity = Math.round(clamp(m.popularity * Math.exp(T.err * z), 5, 100));
    out.difficulty = T.competitors ? Math.round(clamp(m.difficulty * Math.exp(T.err * z * 0.8), 1, 100)) : null;
    if (T.competitors) out.competitors = competitorsFor(m);
  }
  if (store === 'ios' && state.apps?.ads?.accounts?.apple) out.bucket = m.popularity < 25 ? 'low' : m.popularity < 50 ? 'medium' : 'high';
  return out;
}
function competitorsFor(m) {
  const w = m.term.split(' ').map((x) => x[0].toUpperCase() + x.slice(1));
  const names = [`${w[0]}ly`, `${w.join('')} Pro`, `Daily ${w[0]}`, `${w.at(-1)} Mate`, `My ${w[0]}`];
  return names.slice(0, 3).map((n, i) => ({ name: n, rank: i + 1, ratings: Math.round(50 * Math.pow(10, m.difficulty / 30) * (1 - i * 0.25)), stars: Math.round((4.3 + 0.5 * M.strHash(n)) * 10) / 10 }));
}
// A manual search for one term in the store (personalised, noisy).
export function manualRank(state, store, term) {
  const r = peek(state)?.stores?.[store]?.ranks?.[M.tokensOf(term).join(' ')]?.r;
  if (r == null || r >= ASO.unranked - 1) return null;
  return Math.max(1, Math.round(r * (0.8 + 0.4 * rng(state))));
}

// ---------------- creative tests (PPO / Play store listing experiments) ----------------

/** treatments: [{ label, captions?, production? }]; kind 'screenshots'|'icon'|'video'. Hidden true effect per treatment. */
export function startTest(state, S, store, { kind = 'screenshots', treatments = [], by = 'founder' }) {
  ensureAso(S);
  const st = S.stores[store];
  if (st.tests.some((t) => t.status === 'running')) return { ok: false, error: 'One test at a time on the default page.' };
  const tr = treatments.slice(0, ASO.test.maxTreatments);
  if (!tr.length) return { ok: false, error: 'Add at least one treatment.' };
  const appWords = M.appWordsOf(state);
  const arms = [{ label: 'Current page', effect: 0, views: 0, installs: 0 }];
  for (const t of tr) {
    const h = kind === 'screenshots' ? M.screenshotQuality(t.production ?? 'self', t.captions ?? [], appWords) - st.shots.q : kind === 'video' ? 0.05 : 0;
    const quality = by === 'founder' ? h : Math.max(h, (ASO.help[by]?.q ?? 0.5) - st.shots.q);
    arms.push({ label: t.label || `Treatment ${arms.length}`, effect: M.drawTestEffect(rng(state), quality), views: 0, installs: 0, captions: t.captions ?? [] });
  }
  const test = { id: uid('ppo'), kind, store, startDay: state.day, days: 0, status: 'running', verdict: null, arms, by };
  st.tests.unshift(test);
  if (st.tests.length > 20) st.tests.length = 20;
  S.stats.testsRun++;
  return { ok: true, test };
}
export function stopTest(state, S, store, testId) {
  const t = S.stores[store].tests.find((x) => x.id === testId);
  if (t && t.status === 'running') { t.status = 'done'; t.verdict = M.testVerdict(t, store).verdict === 'winner' ? 'winner' : 'stopped'; }
}
/** Ship a treatment as the default page. Its TRUE effect applies, whatever the dashboard said. */
export function applyTest(state, S, store, testId, armIdx) {
  const st = S.stores[store];
  const t = st.tests.find((x) => x.id === testId);
  const arm = t?.arms[armIdx];
  if (!arm || armIdx === 0 || t.applied != null) return null;
  t.applied = armIdx;
  st.testLift = clamp((1 + st.testLift) * (1 + arm.effect) - 1, -0.3, ASO.maxTestLift);
  S.stats.testsApplied++;
  const significant = t.verdict === 'winner' && (arm.z ?? 0) >= ASO.test.z;
  if (!significant) {
    S.stats.badApplies++;
    if (arm.effect < 0) logMistake(state, { functionId: FN, id: 'shipped_inconclusive_test', label: 'Shipped a creative test that had not won', cost: { reputation: 0, hours: 0 }, delayed: true, app: 'organic', detail: `"${arm.label}" was never significantly better (z ${(arm.z ?? 0).toFixed(2)} after ${t.days} days); its real effect on conversion is ${Math.round(arm.effect * 100)}%.` });
  }
  return { effect: arm.effect, significant };
}

// ---------------- daily ----------------

function asaPaid(state) {
  const out = { paid7: 0, yday: 0, brandYday: 0, genericYday: 0 };
  const A = state.apps?.ads;
  if (!A?.rows?.length) return out;
  const brand = M.brandTokens(state.company.name);
  const share = new Map();
  const brandShare = (sid) => {
    if (!share.has(sid)) {
      const s = A.adsets.find((x) => x.id === sid);
      const kws = s?.keywords ?? [];
      share.set(sid, kws.length ? kws.filter((k) => M.tokensOf(k.text).some((t) => brand.includes(t))).length / kws.length : 0);
    }
    return share.get(sid);
  };
  for (let i = A.rows.length - 1; i >= 0; i--) {
    const r = A.rows[i];
    if (r.d < state.day - 7) break;
    if (r.p !== 'apple' || r.d >= state.day) continue;
    out.paid7 += r.lp;
    if (r.d === state.day - 1) { out.yday += r.lp; const b = brandShare(r.s); out.brandYday += r.lp * b; out.genericYday += r.lp * (1 - b); }
  }
  return out;
}
const recent = (st, day, n = 7) => st.daily.filter((x) => x[0] >= day - n).reduce((a, x) => a + x[2], 0);
const acquired30 = (state) => (state.stripe?.subscriptions ?? []).filter((x) => x.startDay > state.day - 30 && x.source !== 'organic:appstore').length;

/** Expected funnel for one store today (no sampling). Also settles ranks when settle = true. */
export function storeFunnel(state, S, store, { velocity = 0, settle = false, paidBrand = 0, paidGeneric = 0 } = {}) {
  const st = S.stores[store];
  const L = st.live ?? defaultListing(state);
  const ctx = fitCtx(state);
  const stars = starsOf(S);
  const A = M.authority({ velocity, ratings: S.reviews, stars });
  const idx = M.indexOf(store, L);
  const universe = M.searchUniverse(store, L, { tracked: S.tracked, category: ctx.category, appWords: ctx.appWords, brand: ctx.brand });
  const vol = marketDemand(state) * localeMult(S) * (st.demoteUntil != null && state.day < st.demoteUntil ? ASO.fake.demoteMult : 1);
  const seen = new Set();
  const rows = [];
  for (const term of universe) {
    const w = M.termWeight(idx, term);
    if (!w) continue;
    seen.add(term);
    const m = M.termMetrics(term, { category: ctx.category, store });
    const fit = L.termFit?.[term] ?? M.termFit(term, ctx);
    const tgt = M.targetRank({ difficulty: m.difficulty, weight: w, fit, authority: A });
    const prev = st.ranks[term]?.r;
    const r = settle ? M.settleRank(prev, tgt, store) : (prev ?? ASO.unranked);
    if (settle) st.ranks[term] = { r, pop: m.popularity };
    const v = m.searches * vol * M.tapAt(r);
    rows.push({ v, imp: m.searches * vol * (r <= 10 ? 1 : r <= 25 ? 0.5 : r <= 100 ? 0.1 : 0), fit });
  }
  // Overlapping searchers: the same people type several of your long-tail variants, so each extra term adds less.
  const { imps, views, convViews } = M.overlapSum(rows);
  if (settle) for (const k of Object.keys(st.ranks)) if (!seen.has(k)) delete st.ranks[k];
  const B = ASO.brand;
  const hasBrand = M.brandTokens(state.company.name).some((t) => M.tokensOf(L.name).includes(t));
  const brandViews = (B.base + B.perAcquired * acquired30(state)) * Math.sqrt(marketDemand(state)) * B.tap * (hasBrand ? 1 : B.missingName);
  const browseViews = ASO.browse.perVelocity * velocity * (stars != null && stars < 4 ? ASO.browse.lowStars : 1);
  const cvr = M.pageCvr(store, { shotsQ: st.shots.q, video: st.shots.video, copyScore: L.score, stars, ratings: S.reviews, replies: state.day <= S.replies.until, testLift: st.testLift });
  const searchInstalls = convViews * cvr;
  const brandInstalls = brandViews * cvr * B.conv;
  // Apple Search Ads on your own brand takes installs you would have had organically [design].
  const cannibal = store === 'ios' ? Math.min(brandInstalls * 0.7, paidBrand * ASO.asa.brandCannibal) + Math.min(searchInstalls * 0.2, paidGeneric * ASO.asa.genericCannibal) : 0;
  const installs = Math.max(0, searchInstalls + brandInstalls + browseViews * cvr - cannibal);
  return { imps: imps + brandViews / B.tap, views: views + brandViews + browseViews, installs, cvr, authority: A, searchViews: views, brandViews, browseViews, cannibal, terms: seen.size };
}

/** One day of app-store discovery for every enabled store. helpers come from organicEngine (visit tracking). */
export function asoDay(state, { O, trackVisits, stat }) {
  if (state.company.model !== 'b2c' || !hasProduct(state)) return;
  const S = ensureAso(O.appstore);
  S.startDay ??= state.day;
  const asa = asaPaid(state);
  S.asa.paidInstalls += asa.yday;
  let organic = 0;
  for (const store of Object.keys(STORES)) {
    const st = S.stores[store];
    if (!st.enabled) continue;
    resolvePending(state, S, store);
    if (st.shotsPending && state.day >= st.shotsPending.day) { st.shots = st.shotsPending.shots; st.shotsPending = null; }
    if (st.terminated || (st.removedUntil != null && state.day < st.removedUntil)) { st.daily.push([state.day, 0, 0, 0]); trim(st); continue; }
    const velocity = recent(st, state.day) / 7 + (store === 'ios' ? asa.paid7 / 7 : 0);
    const f = storeFunnel(state, S, store, { velocity, settle: true, paidBrand: asa.brandYday, paidGeneric: asa.genericYday });
    S.asa.cannibalized += f.cannibal;
    let expected = f.installs;
    // A running test splits today's page views across arms; treatment arms convert at their true effect.
    const t = st.tests.find((x) => x.status === 'running');
    if (t) {
      t.days++;
      const share = 1 / t.arms.length;
      let delta = 0;
      for (const arm of t.arms) {
        const v = sampleCount(state, f.views * share);
        arm.views += v;
        arm.installs += Math.min(v, sampleCount(state, v * f.cvr * (1 + arm.effect)));
        delta += f.installs * share * arm.effect;
      }
      expected += delta;
      const res = M.testVerdict(t, store);
      if (res.verdict !== 'running') {
        t.status = 'done'; t.verdict = res.verdict;
        if (res.verdict === 'winner') S.stats.testsWon++;
        notify(state, `${store === 'ios' ? 'Product Page Optimization' : 'Store listing experiment'} finished: ${res.verdict === 'winner' ? `"${res.arm.label}" won at 90% confidence` : res.verdict === 'loser' ? 'every treatment lost' : `inconclusive after ${t.days} days (not enough traffic to tell)`}.`, { type: res.verdict === 'winner' ? 'good' : 'info', app: 'organic' });
        if (t.by !== 'founder' && res.verdict === 'winner') applyTest(state, S, store, t.id, t.arms.indexOf(res.arm));
      }
    }
    const n = sampleCount(state, expected);
    st.daily.push([state.day, Math.round(f.views), n, Math.round(f.imps)]);
    trim(st);
    if (!n) continue;
    organic += n;
    trackVisits(state, 'organic:appstore', n);
    const trials = Math.min(n, sampleCount(state, n * landingConversion(state) * APPSTORE.installIntent));
    if (trials) { const got = acquire(state, { source: 'organic:appstore', n: trials }); stat(O, 'organic:appstore', 'signups', got.subs.length); }
  }
  ratingsDay(state, S, organic + asa.yday);
  fakeDay(state, S);
  helpDay(state, S);
}
const trim = (st) => { if (st.daily.length > 120) st.daily.splice(0, st.daily.length - 120); };

function ratingsDay(state, S, installs) {
  if (!(installs > 0)) return;
  const y = ratingPlanInfo(S);
  const fit = state.market?.fit?.product?.score ?? 0.3;
  const inc = S.fake.incentive && S.fake.incentive.until == null ? S.fake.incentive : null;
  const k = sampleCount(state, installs * y.perInstall * (inc ? ASO.fake.incentive.yieldMult : 1));
  if (!k) return;
  const strategy = S.promptPlan.strategy;
  const promptedShare = y.perInstall > 0 ? y.prompted / y.perInstall : 0;
  const replying = state.day <= S.replies.until;
  for (let i = 0; i < k; i++) {
    let mean;
    if (inc && i >= k / ASO.fake.incentive.yieldMult) mean = ASO.fake.incentive.starsTo;
    else mean = rng(state) < promptedShare ? reviewStars(fit, strategy) : reviewStars(fit, 'none') + ASO.volunteerShift;
    let s = Math.min(5, Math.max(1, Math.round(mean + (rng(state) - 0.5) * 2.4)));
    if (s <= 3 && replying && rng(state) < ASO.replyRevise.share) s = Math.min(5, s + ASO.replyRevise.plus);
    S.starSum += s; S.reviews++;
    if (inc && i >= k / ASO.fake.incentive.yieldMult) { inc.ratings++; inc.sum += s; }
  }
}

function fakeDay(state, S) {
  const F = S.fake;
  for (const x of F.items) {
    if (x.detected || x.delivered >= x.n) continue;
    const d = Math.min(x.n - x.delivered, Math.ceil(x.n / 10));
    x.delivered += d; x.live += d; S.reviews += d; S.starSum += 5 * d;
  }
  const exposed = F.items.filter((x) => !x.detected && state.day - x.day <= 365);
  let hazard = exposed.length ? ASO.fake.buy.hazard : 0;
  const inc = F.incentive && (F.incentive.until == null || state.day - F.incentive.until <= 180) ? F.incentive : null;
  if (inc) hazard = 1 - (1 - hazard) * (1 - ASO.fake.incentive.hazard);
  if (!hazard || rng(state) >= hazard) return;
  // Detected: purge the manipulated ratings, then a severity draw.
  F.detections++;
  let purged = 0;
  for (const x of exposed) { purged += x.live; S.reviews -= x.live; S.starSum -= 5 * x.live; x.live = 0; x.detected = true; x.n = x.delivered; }
  if (inc) { purged += inc.ratings; S.reviews -= inc.ratings; S.starSum -= inc.sum; inc.ratings = 0; inc.sum = 0; inc.until = state.day; F.incentive = null; }
  S.reviews = Math.max(0, S.reviews); S.starSum = Math.max(0, S.starSum);
  const u = rng(state);
  let acc = 0, outcome = 'purge';
  for (const [p, o] of ASO.fake.outcomes) { acc += p; if (u < acc) { outcome = o; break; } }
  const st = S.stores.ios;
  st.demoteUntil = state.day + ASO.fake.demoteDays;
  if (outcome === 'removed') st.removedUntil = state.day + ASO.fake.removedDays;
  if (outcome === 'terminated') { st.terminated = true; st.pending = null; }
  const label = { purge: 'Apple removed manipulated ratings and demoted the app', removed: 'Apple removed the app from the App Store', terminated: 'Apple terminated the developer account' }[outcome];
  notify(state, `${label}. ${purged} ratings deleted.`, { type: 'bad', app: 'organic' });
  logMistake(state, { functionId: FN, id: `fake_reviews_${outcome}`, label, cost: { days: outcome === 'removed' ? ASO.fake.removedDays : outcome === 'terminated' ? 365 : ASO.fake.demoteDays, reputation: outcome === 'terminated' ? 15 : 6 }, delayed: true, app: 'organic', detail: `Detection of bought or incentivized reviews: ${purged} ratings purged, search visibility cut for ${ASO.fake.demoteDays} days${outcome === 'removed' ? `, the app is off the store for ${ASO.fake.removedDays} days` : ''}${outcome === 'terminated' ? ', and the account is gone: a new account starts over with no ratings, ranks or reviews' : ''}.` });
  if (rng(state) < ASO.fake.ftcChance) {
    post(state, { amount: -ASO.fake.ftcLegalUsd, counterparty: 'Outside counsel', description: 'FTC inquiry: consumer reviews rule (16 CFR 465)', category: 'legal', method: 'ach' });
    logMistake(state, { functionId: FN, id: 'ftc_review_rule', label: 'FTC inquiry over fake reviews', cost: { usd: ASO.fake.ftcLegalUsd, hours: 10 }, delayed: true, charge: true, app: 'organic', detail: 'Legal fees and a settlement. Civil penalties under the rule can reach about $51,744 per violation (confirm the current figure).' });
  }
}

function helpDay(state, S) {
  const H = S.help;
  if (!H || state.day - H.lastRun < 30) return;
  H.lastRun = state.day;
  H.paid += ASO.help[H.kind].usd;
  const st = S.stores.ios;
  const per = ASO.help[H.kind].testsPerMonth;
  for (let i = 0; i < per; i++) startTest(state, S, 'ios', { kind: 'screenshots', by: H.kind, treatments: [{ label: `${ASO.help[H.kind].label} variant`, production: H.kind === 'agency' ? 'agency' : 'freelancer', captions: [] }] });
  const views30 = st.daily.filter((x) => x[0] > state.day - 30).reduce((a, x) => a + x[1], 0) / 30;
  if (views30 < ASO.agencyMinViews) logMistake(state, { functionId: FN, id: 'premature_aso_help', label: `Paid an ${ASO.help[H.kind].label.toLowerCase()} with too little store traffic`, cost: { usd: ASO.help[H.kind].usd }, delayed: true, app: 'organic', key: `aso_help:${H.kind}:${Math.floor(state.day / 30)}`, detail: `About ${Math.round(views30)} product page views a day: tests can't reach significance and the retainer can't pay back. Specialists pay off from roughly 1,000+ installs a day; below that, founder time plus a $79 tool wins.` });
}

// ---------------- Apple Search Ads hooks (read by the ads engine) ----------------

/** Category CPT relative to the flat $2.25 (AppTweak 2025 US medians [V]). */
export function asaCptMult(state) {
  const c = categoryOf(state);
  return (ASO.asa.cpt[c] ?? ASO.asa.defaultCpt) / ASO.asa.defaultCpt;
}
/** Tap-to-install multiplier for an ASA ad group: category rate, your product page, and a CPP for the ad group. */
export function asaInstallMult(state, adsetId) {
  const c = categoryOf(state);
  const S = peek(state);
  let m = (ASO.asa.tapInstall[c] ?? ASO.asa.defaultTapInstall) / ASO.asa.defaultTapInstall;
  if (S?.stores?.ios?.live) {
    const st = S.stores.ios;
    const cur = M.pageCvr('ios', { shotsQ: st.shots.q, video: st.shots.video, copyScore: st.live.score, stars: starsOf(S), ratings: S.reviews, testLift: st.testLift });
    const ref = M.pageCvr('ios', { shotsQ: 0.3, copyScore: 0.4, stars: 4.5, ratings: 20 });
    m *= clamp(cur / ref, 0.7, 1.3);
  } else m *= 0.9;
  if (S?.cpps?.some((x) => x.adsetId === adsetId)) m *= 1 + ASO.cpp.tapInstallPts / ASO.cpp.base;
  return m;
}

// ---------------- Jev typed decision: 2.3.7 rejection and keyword fit ----------------

/** Ask Jev (noul + score questions) whether App Review would reject this metadata and how well each term fits. */
export async function reviewCheck(ctx, store, listing) {
  const state = ctx.state;
  const v = M.validateMetadata(store, listing, { brand: state.company.name, category: categoryOf(state) });
  const fctx = fitCtx(state);
  const heurP = M.rejectionRisk(store, v);
  const terms = [...new Set(store === 'ios' ? v.keywordTerms.map((t) => M.tokensOf(t).join(' ')).filter(Boolean) : M.tokensOf(listing.subtitle))].slice(0, 8);
  const qid = (t) => `fit_${t.replace(/\W+/g, '_')}`;
  const fallback = () => ({
    reject: { type: 'noul', noul: heurP },
    ...Object.fromEntries(terms.map((t) => [qid(t), { type: 'score', score: Math.round(M.termFit(t, fctx) * 4), confidence: 0.5 }])),
  });
  const d = await ctx.llm.decide({
    task: 'aso_metadata_review', cache: state.cache,
    state: { store: STORES[store], app: state.company.oneLiner, name: listing.name, subtitle: listing.subtitle, keywordField: store === 'ios' ? listing.keywords : undefined, description: String(listing.description ?? '').slice(0, 800), detectedOtherBrands: v.competitors, detectedClaims: v.claims },
    questions: {
      // Anchored on what actually gets rejected: an unanchored "would it be rejected?" put clean listings near 0.6.
      reject: { type: 'noul', instructions: `${store === 'ios' ? 'Would Apple App Review reject this metadata update under guideline 2.3.7 or 2.3.1?' : 'Would Google Play policy review reject or suspend this listing?'} Most metadata updates pass. Rejections come from: other apps' or brands' names, prices in the name/subtitle/keywords, ranking claims (#1, best), stuffed or repeated keywords, or terms unrelated to the app. A plain, accurate listing passes even if it is not well optimized.`, criteria: { true: 'Contains another app\'s or brand\'s name, a price, a #1/best claim, stuffed or repeated keywords, or misleading terms', false: 'Accurate, plain metadata with none of those problems' } },
      ...Object.fromEntries(terms.map((t) => [qid(t), { type: 'score', instructions: `How well does the search term "${t}" describe what this app does, for someone typing it into the store?`, criteria: ['unrelated: the searcher wants something else', 'loosely related', 'same category', 'describes the app', 'exactly what the app does'] }])),
    },
    fallback,
  });
  const a = d.answers ?? fallback();
  const jevP = Number.isFinite(a.reject?.noul) ? a.reject.noul : heurP;
  const rejectP = d.mock ? heurP : clamp(0.5 * heurP + 0.5 * jevP, 0, 0.95);
  const termFit = {};
  for (const t of terms) { const sc = a[qid(t)]?.score; if (Number.isFinite(sc)) termFit[t] = d.mock ? M.termFit(t, fctx) : clamp(0.5 * (sc / 4) + 0.5 * M.termFit(t, fctx), 0, 1); }
  return { rejectP, termFit, mock: d.mock, validation: v };
}

// ---------------- operator read ----------------

export function stageOf(state) {
  const arr = (state.stripe ? mrr(state) : 0) * 12;
  return arr >= 3_000_000 ? STAGES[2] : arr >= 500_000 ? STAGES[1] : STAGES[0];
}

export function readAso(state) {
  const S = peek(state);
  if (!S || state.company?.model !== 'b2c' || !S.stats || !(S.stats.submissions > 0 || S.stores?.ios?.live)) return { tier: 'unknown', evidence: [], coaching: ['Write a real store listing: name with your one search term, a benefit subtitle and a 100-character keyword field.'] };
  const ios = S.stores.ios;
  const L = ios.pending?.listing ?? ios.live ?? defaultListing(state);
  const v = M.validateMetadata('ios', L, { brand: state.company.name, category: categoryOf(state) });
  const fctx = fitCtx(state);
  const toks = Object.keys(M.indexOf('ios', L)).filter((t) => !fctx.brand.includes(t));
  const fit = toks.length ? toks.reduce((a, t) => a + M.tokenFit(t, fctx), 0) / toks.length : 0;
  const kw = clamp(Math.min(1, v.usedChars / 90) * (1 - Math.min(1, v.wastedChars / 30)) * (0.5 + 0.5 * fit) - (v.competitors.length ? 0.5 : 0) - (v.claims.length ? 0.3 : 0), 0, 1);
  const conv = clamp(0.5 * ios.shots.q + 0.25 * Math.min(1, S.stats.testsWon / 2) + 0.15 * (ios.testLift > 0 ? 1 : 0) + 0.1 * (S.cpps.length ? 1 : 0) - 0.1 * S.stats.badApplies, 0, 1);
  const stars = starsOf(S);
  const strat = { after_aha: 1, timer: 0.55, none: 0.35, on_open: 0.05 }[S.promptPlan.strategy] ?? 0.35;
  const ratings = clamp(0.6 * strat + 0.2 * Math.min(1, S.stats.replyWeeks / 4) + 0.2 * (stars == null ? 0.5 : clamp((stars - 3.8) / 0.8, 0, 1)), 0, 1);
  const fake = S.fake.bought > 0 || S.fake.incentive || S.fake.items.length > 0 || (S.fake.detections ?? 0) > 0;
  const policy = clamp(1 - 0.35 * S.stats.rejections - (fake ? 1 : 0), 0, 1);
  const extra = clamp(0.5 * Math.min(1, Object.keys(S.locales).length / 2) + 0.5 * (S.stats.submissions >= 1 ? 1 : 0), 0, 1);
  let raw = 0.32 * kw + 0.2 * conv + 0.23 * ratings + 0.15 * policy + 0.1 * extra;
  if (fake) raw = Math.min(raw, 0.3);
  const n = S.stats.submissions + S.stats.testsRun + S.stats.promptChanges + Math.min(4, S.stats.replyWeeks);
  const score = shrink(raw, n, 0.5, 2);
  const coaching = [];
  if (v.competitors.length) coaching.push(trapCoaching(FN, 'competitor_names', 'Never use other apps\' names: Apple rejects the update and may strip keywords.'));
  if (v.wastedChars > 8) coaching.push(trapCoaching(FN, 'wasted_keyword_field', 'Every character in the keyword field should be a distinct relevant word not already in the name or subtitle, no spaces after commas.'));
  if (S.promptPlan.strategy === 'on_open' || S.promptPlan.strategy === 'none') coaching.push(trapCoaching(FN, 'prompt_on_open', 'Ask for a rating right after a success moment; the OS caps it at 3 prompts a year anyway.'));
  if (!S.stats.testsRun) coaching.push(trapCoaching(FN, 'never_test', 'Test screenshots once you have the traffic: about 90% of top apps never test their icon.'));
  if (fake) coaching.push(trapCoaching(FN, 'fake_reviews', 'Never buy or reward reviews: removal and FTC exposure.'));
  if (S.help && (ios.daily.slice(-30).reduce((a, x) => a + x[1], 0) / 30) < ASO.agencyMinViews) coaching.push(trapCoaching(FN, 'premature_agency', 'Hire ASO help after the traffic exists.'));
  return {
    tier: tierFromScore(score), score, raw, n,
    evidence: [
      `keyword field ${v.usedChars}/100, ${v.wastedChars} characters wasted, word fit ${Math.round(fit * 100)}%${v.competitors.length ? `, other brands: ${v.competitors.join(', ')}` : ''}`,
      `screenshots ${Math.round(ios.shots.q * 100)}/100 (${ios.shots.production}), ${S.stats.testsRun} tests run, ${S.stats.testsWon} won`,
      `rating prompt: ${S.promptPlan.strategy}${stars != null ? `, ${stars.toFixed(1)}★ from ${S.reviews}` : ''}, ${S.stats.replyWeeks} weeks of review replies`,
      `${S.stats.submissions} submissions, ${S.stats.rejections} rejected${fake ? ', manipulated reviews' : ''}`,
    ],
    coaching,
  };
}
if (!hasOperatorReader(FN)) registerOperatorReader(FN, readAso);

/** Funnel after ranks have settled for `days` days at a fixed velocity (tests, planning views). Mutates ranks. */
export function settledFunnel(state, S, store, { velocity = 0, days = 60, ...rest } = {}) {
  ensureAso(S);
  let f = null;
  for (let i = 0; i < days; i++) f = storeFunnel(state, S, store, { velocity, settle: true, ...rest });
  return f;
}
