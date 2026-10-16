// Fake and incentivized reviews: ONE detection model for every place the player can buy or game reviews
// (App Store ratings in growth/aso.js, G2/Capterra/Trustpilot in the Helpdesk, the world event's "reputation agency"
// offer). Each source keeps its own visible effects (purged ratings, a warning label, a demoted listing); the odds,
// the FTC exposure and the traceable mistakes live here so the three can never disagree.
//
// Sources (docs/research/verification/market-people.md §1.8, §2.1, §2.7):
//  - Review sites verify reviewers and sweep for bursts: a purchased batch is ~60% removed within 90 days and the
//    vendor is penalised (badge removal / profile flag) in ~25% of detections [design].
//  - Apple/Google: manipulated ratings are found by pattern or report; Apple can remove the app or end the
//    developer membership (App Review Guidelines 5.6.1) [M]; hazard [design].
//  - FTC rule 16 CFR 465 (effective 2024-10-21): buying reviews and sentiment-conditioned incentives are banned; civil
//    penalties up to ~$51,744 per violation, courts decide the count [S]. Odds ~3%/yr for a few fakes, ~25%/yr for a
//    systematic scheme (50+ or repeat batches) [design]; investigation to action 6-24 months [M]; legal fees
//    $50-250k even when settled [design]; settlements a fraction of the maximum [design].
// A batch is recorded as a claim to the platform ("these reviews are genuine", core/integrity.js); detection is
// the verification event. The full cost lands at detection; buying logs only a small "you did this" entry.

import { rng, uid, round2, clamp } from './util.js';
import { post } from './bank.js';
import { notify } from './state.js';
import { logMistake } from './operator.js';
import { recordClaims, penalize, ensureIntegrity, sideRoll } from './integrity.js';
import { setModifier } from './market.js';

export const FAKE = {
  // Daily platform detection hazard per live batch. Review sites: 1-(1-0.6)^(1/90) ≈ 0.0101/day → 60% in 90 days.
  hazard: { review_site: 0.0101, appstore: 0.005, play: 0.004 },
  incentiveHazardMult: 0.6, // incentive schemes look more like real ratings than farm bursts [design]
  vendorPenaltyGivenDetected: 0.25,
  ftcPerYear: { small: 0.03, systematic: 0.25 }, systematicN: 50,
  ftcBoostAfterDetection: 3, // a platform detection is often what puts you on the FTC's radar (complaints, referrals) [design]
  exposureDays: 3 * 365, // how long a scheme stays actionable in the sim [design; FTC civil-penalty actions run 5 years]
  ftcResolveDays: [180, 720],
  perViolation: 51744,
  settlementShare: [0.02, 0.1],
  legalUsd: [50000, 250000],
  legalHours: 40,
};

export function ensureFake(state) {
  const I = ensureIntegrity(state);
  I.fakeReviews ??= { batches: [], ftc: null };
  return I.fakeReviews;
}

const platformClass = (platform) => (platform === 'appstore' || platform === 'ios' ? 'appstore' : platform === 'play' ? 'play' : 'review_site');

/**
 * Record a fake/incentivized review batch. source: 'aso' | 'helpdesk' | 'world'; platform: 'appstore' | 'play' |
 * 'g2' | 'capterra' | 'trustpilot' | ...; kind: 'buy' | 'incentive'. `usd` is what was paid (already posted by the
 * caller). Returns the batch.
 */
export function recordFakeReviews(state, { source, platform = 'review_site', n = 0, kind = 'buy', usd = 0, app = null, functionId = 'support' }) {
  const F = ensureFake(state);
  const b = { id: uid('fkr'), day: state.day, source, platform, n: Math.max(0, Math.round(n)), kind, status: 'live', detectedDay: null };
  F.batches.push(b);
  recordClaims(state, { audience: 'platform', recipientId: `${platform}:${b.id}`, channel: `${source} reviews`, claims: [{ metric: 'reviews_genuine', claimed: true, truth: false, gap: 1, text: `${b.n} ${kind === 'incentive' ? 'rating-conditioned incentivized' : 'purchased'} reviews` }] });
  // The small immediate entry: you did this, it cost this much. The reputation and legal cost come at detection.
  logMistake(state, { functionId, id: kind === 'incentive' ? 'incentivized_reviews' : 'fake_reviews', label: kind === 'incentive' ? 'Rewarded users for 5-star ratings' : `Bought ${b.n} fake reviews`, app, key: `fake:${b.id}`, cost: { usd: round2(usd), reputation: 0.5 }, detail: 'Banned by the FTC consumer-reviews rule (16 CFR 465) and by every review platform. Platforms sweep for bursts and reviewer patterns; detection can come months later, with the full cost then.' });
  return b;
}

/** Daily platform roll for one live batch. Returns true when the platform caught it (the caller applies its effects). */
export function rollPlatformDetection(state, b, { hazardMult = 1 } = {}) {
  if (b.status !== 'live') return false;
  const h = FAKE.hazard[platformClass(b.platform)] * (b.kind === 'incentive' ? FAKE.incentiveHazardMult : 1) * hazardMult;
  return sideRoll(state, `fake-detect|${b.id}`) < h;
}

/**
 * Consequences of a platform detection: claim caught, reputation with platforms, a delayed traceable mistake with
 * what the source lost, and higher FTC odds. `effects` describes what the source did (purged ratings, removal...).
 */
export function onDetected(state, b, { label, days = 0, reputation = 0, effects = '', app = null, functionId = 'support', logImpact = true } = {}) {
  if (b.status !== 'live') return;
  b.status = 'detected';
  b.detectedDay = state.day;
  const I = ensureIntegrity(state);
  const caught = I.claims.filter((c) => c.recipientId === `${b.platform}:${b.id}` && c.status === 'open');
  for (const c of caught) { c.status = 'caught'; c.caughtDay = state.day; c.caughtBy = 'platform review sweep'; }
  penalize(state, caught, { audience: 'platform', functionId, id: `fake_reviews_detected_${b.source}`, label, app, hours: 2, detail: `${effects} Detected ${state.day - b.day} days after the purchase.` });
  if (logImpact && (days || reputation)) logMistake(state, { functionId, id: `fake_reviews_${b.source}_impact`, label: `${label}: lost visibility`, app, key: `fakeimpact:${b.id}`, delayed: true, cost: { days, reputation }, detail: effects });
}

export const fakeExposure = (state) => {
  const F = ensureFake(state);
  const live = F.batches.filter((b) => state.day - b.day <= FAKE.exposureDays);
  return { n: live.reduce((a, b) => a + b.n, 0), batches: live.length, detected: live.some((b) => b.detectedDay != null), live };
};

// World-event batches have no source app to run their sweep, so it runs here: detection removes the bump and, in a
// quarter of cases, a penalty badge cuts landing conversion ~15% for 120 days [design, same as the old instant roll].
function worldBatchesDay(state, F) {
  for (const b of F.batches) {
    if (b.source === 'world' && b.status === 'live' && rollPlatformDetection(state, b)) {
      const badge = sideRoll(state, `fake-badge|${b.id}`) < FAKE.vendorPenaltyGivenDetected;
      const inst = (state.apps?.world?.active ?? []).find((i) => i.fakeBatchId === b.id && i.status === 'active');
      if (inst) inst.endDay = Math.min(inst.endDay ?? state.day, state.day + 1); // the rating bump is gone
      if (badge) { b.badgeUntil = state.day + 120; setModifier(state, 'landing', `fake_review_badge_${b.id}`, 0.85); }
      const effects = `A review platform removed the ${b.n} purchased reviews${badge ? ' and put a suspicious-activity badge on your profile for 120 days' : ''}.`;
      notify(state, effects, { type: 'bad', app: 'market' });
      onDetected(state, b, { label: 'Review platform caught the reviews you bought', effects, app: 'market', days: badge ? 120 : 0, reputation: badge ? 3 : 1 });
    }
    if (b.badgeUntil != null && state.day >= b.badgeUntil) { setModifier(state, 'landing', `fake_review_badge_${b.id}`, null); b.badgeUntil = null; }
  }
}

/** Daily: FTC hazard over all recent schemes, the investigation and its resolution. Called from the Legal day. */
export function fakeReviewsDay(state) {
  const F = ensureFake(state);
  if (!F.batches.length) return;
  worldBatchesDay(state, F);
  // A resolved inquiry does not immunise the company: schemes it did not cover can start a new one (history kept).
  const covered = new Set([...(F.ftcHistory ?? []), F.ftc].filter(Boolean).flatMap((x) => x.batchIds ?? []));
  const ex0 = fakeExposure(state);
  const fresh = ex0.live.filter((b) => !covered.has(b.id));
  const ex = { n: fresh.reduce((a, b) => a + b.n, 0), batches: fresh.length, detected: fresh.some((b) => b.detectedDay != null), live: fresh };
  if ((!F.ftc || F.ftc.status === 'resolved') && ex.batches) {
    const systematic = ex.n >= FAKE.systematicN || ex.batches >= 2;
    const perYear = (systematic ? FAKE.ftcPerYear.systematic : FAKE.ftcPerYear.small) * (ex.detected ? FAKE.ftcBoostAfterDetection : 1);
    if (sideRoll(state, 'ftc-reviews') < clamp(perYear, 0, 0.9) / 365) {
      const [lo, hi] = FAKE.ftcResolveDays;
      if (F.ftc) (F.ftcHistory ??= []).push(F.ftc);
      F.ftc = { openedDay: state.day, resolveDay: state.day + Math.round(lo + sideRoll(state, 'ftc-resolve') * (hi - lo)), n: ex.n, batchIds: ex.live.map((b) => b.id), systematic, status: 'open' };
      notify(state, `The FTC opened an inquiry into ${state.company.name}'s reviews (16 CFR 465): a civil investigative demand for your review sources and payments. Expect months of document production.`, { type: 'bad', app: 'legal' });
      logMistake(state, { functionId: 'legal_hygiene', id: 'ftc_review_inquiry', label: 'FTC inquiry over fake reviews', app: 'legal', key: `ftc:${state.day}`, delayed: true, charge: true, cost: { hours: FAKE.legalHours }, detail: `The inquiry covers ${ex.n} fake or incentivized reviews across ${ex.batches} scheme(s). Founder time goes into producing documents and working with counsel.` });
    }
  }
  const f = F.ftc;
  if (f?.status === 'open' && state.day >= f.resolveDay) {
    f.status = 'resolved';
    const [a, b] = FAKE.legalUsd, [s1, s2] = FAKE.settlementShare;
    const legal = Math.round(a + sideRoll(state, 'ftc-legal') * (b - a));
    const settlement = Math.round(f.n * FAKE.perViolation * (s1 + sideRoll(state, 'ftc-settle') * (s2 - s1)));
    post(state, { amount: -legal, counterparty: 'Outside counsel', description: 'FTC investigation: consumer reviews rule (16 CFR 465), legal fees', category: 'legal', method: 'ach' });
    post(state, { amount: -settlement, counterparty: 'FTC settlement', description: `Civil penalty: ${f.n} fake reviews (16 CFR 465), consent order with 20 years of compliance reporting`, category: 'legal', method: 'wire' });
    f.legal = legal; f.settlement = settlement;
    notify(state, `FTC settlement: ${(legal + settlement).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} in legal fees and civil penalty for ${f.n} fake reviews, plus a 20-year consent order.`, { type: 'bad', app: 'legal' });
    logMistake(state, { functionId: 'legal_hygiene', id: 'ftc_review_settlement', label: 'FTC civil penalty for fake reviews', app: 'legal', key: `ftcset:${f.openedDay}`, delayed: true, cost: { usd: legal + settlement, reputation: 4 }, detail: `Up to $${FAKE.perViolation.toLocaleString('en-US')} per violation under the rule; this settled at ${money0(settlement)} plus ${money0(legal)} of counsel. Asking every customer for a review (no gating, incentives disclosed) is the legal way to get the same rating lift.` });
  }
}
const money0 = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
