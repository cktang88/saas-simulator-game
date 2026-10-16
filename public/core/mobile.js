// Mobile subscription economics shared by core billing (stripe.js, market.js) and the consumer apps.
// Pure and deterministic: no randomness, no state writes. Sources: docs/research/consumer-apps/paywall-mobile-playbook.md.
// Numbers tagged [design] are simulator assumptions, never presented as statistics.

import { dateOf } from './util.js';

export const MOBILE = {
  // Apple Small Business Program: 15% while prior-year proceeds <= $1M, 30% above; crossing $1M moves you to 30% for
  // the rest of that year (developer.apple.com/app-store/small-business-program). Not enrolled = 30%.
  sbp: { threshold: 1_000_000, rate: 0.15, standard: 0.3 },
  // Google Play subscriptions: 15% from the first dollar (long-standing baseline). The June 2026 US/UK/EEA fee change
  // (~10% service + ~5% billing) is reported by conflicting secondary sources [unverified], so the net stays ~15%.
  play: { rate: 0.15 },
  // Epic v. Apple (US external links): commission on link-outs is unsettled in October 2026 [unverified]. The game
  // treats a court-set commission as a scheduled uncertain event, see apps/consumer/monetize.js.
  linkOutCommission: 0.12, // [design] placeholder for "costs genuinely and reasonably necessary"
  // Apple pays about 33-45 days after the end of the fiscal month [verify; secondary summaries]; Google ~15 days after month end.
  payoutLagDays: { ios: [33, 45], play: [15, 17] },
  // Vendor tooling on top of store fees: RevenueCat free to $2.5k tracked monthly revenue, then 1% [secondary];
  // Superwall free to $10k monthly attributed revenue on Indie, then 1% [secondary].
  tooling: {
    none: { label: 'Build it yourself (receipt validation, entitlements)', free: Infinity, pct: 0, monthly: 0, setupHours: 14, note: 'Free in cash, but a founder-built purchase flow breaks on edge cases (restores, refunds, grace periods).' },
    revenuecat: { label: 'RevenueCat', free: 2500, pct: 0.01, monthly: 0, setupHours: 3, note: 'Free to $2.5k tracked monthly revenue, then 1% [secondary; check the vendor page].' },
    superwall: { label: 'Superwall (paywall A/B tests) on top of RevenueCat', free: 10000, pct: 0.01, monthly: 0, setupHours: 5, paywallTests: true, note: 'Free to $10k attributed monthly revenue, then ~1% [secondary]; adds remote paywall experiments.' },
  },
  // Median one-year retention by plan length (RevenueCat, 10,000+ apps): weekly ~3%, monthly ~11%, annual ~28%.
  retention1y: { week: 0.03, month: 0.11, year: 0.28 },
  // Per-renewal cancel hazard (before fit scaling). Index = completed paid periods minus 1. Tuned so the product of
  // survivals over a year reproduces retention1y (test/consumer-playbook.test.js checks it).
  weeklyHazard: { first: 0.32, decay: 0.85, floor: 0.0385 }, // h_k = max(floor, first * decay^(k-1))
  monthlyHazard: [0.5, 0.27, 0.18, 0.15, 0.14, 0.13, 0.12, 0.11, 0.11, 0.11, 0.11],
  annualRenewal: 0.28,
  // First-charge refund share by plan length [design; sources only say weekly/aggressive paywalls refund more]: store
  // refunds go through Apple/Google and cost the commission back to the user's account.
  refundRate: { week: 0.06, month: 0.03, year: 0.07 },
  disputeRateIap: 0, // IAP chargebacks are handled by the store, not by a processor dispute
};

/** Store commission rate for a store ('ios' | 'play' | 'web'), given program enrolment and proceeds. */
export function commissionRate({ store = 'ios', enrolled = true, priorProceeds = 0, ytdProceeds = 0 } = {}) {
  if (store === 'web') return 0;
  if (store === 'play') return MOBILE.play.rate;
  if (!enrolled) return MOBILE.sbp.standard;
  return priorProceeds > MOBILE.sbp.threshold || ytdProceeds > MOBILE.sbp.threshold ? MOBILE.sbp.standard : MOBILE.sbp.rate;
}

/** Fee on a charge for a store subscription: commission plus vendor tooling share. Returns { commission, tooling, fee }. */
export function storeFee(amount, { rate = 0.15, toolingPct = 0 } = {}) {
  const commission = Math.round(amount * rate * 100) / 100;
  const tooling = Math.round(amount * toolingPct * 100) / 100;
  return { commission, tooling, fee: Math.round((commission + tooling) * 100) / 100 };
}

/** Day the proceeds of a charge reach the balance: end of the fiscal month plus the store's lag (Apple 33-45, Google ~15). */
export function storePayoutDay(state, chargeDay, store = 'ios', u = 0.5) {
  const d = dateOf(state, chargeDay);
  const endOfMonth = chargeDay + (Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86400000;
  const [lo, hi] = MOBILE.payoutLagDays[store] ?? MOBILE.payoutLagDays.ios;
  return Math.round(endOfMonth + lo + u * (hi - lo));
}

/** Base cancel probability at a renewal. interval 'week'|'month'|'year'; periods = completed paid periods (>= 1). */
export function baseHazard(interval, periods = 1) {
  const k = Math.max(1, periods);
  if (interval === 'week') return Math.max(MOBILE.weeklyHazard.floor, MOBILE.weeklyHazard.first * Math.pow(MOBILE.weeklyHazard.decay, k - 1));
  if (interval === 'year') return 1 - MOBILE.annualRenewal;
  const h = MOBILE.monthlyHazard;
  return h[Math.min(h.length - 1, k - 1)];
}

/** Fraction of paying starters still paying after n renewals (n = 51 weekly, 11 monthly, 1 annual) with the base hazards. */
export function survival(interval, renewals) {
  let s = 1;
  for (let k = 1; k <= renewals; k++) s *= 1 - baseHazard(interval, k);
  return s;
}

/** Monthly-equivalent price of a plan of any interval. */
export const monthlyEquivalent = (price, interval) => (interval === 'year' ? price / 12 : interval === 'week' ? (price * 52) / 12 : price);
