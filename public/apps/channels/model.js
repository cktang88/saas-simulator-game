// Pure channel math: ramps, steady-state sampling, fees, affiliate / referral / PR / sponsorship / events /
// cold-call / direct-mail / LTD models. No state, no DOM: every function takes plain numbers (and an optional
// `rand` in [0,1)) so it can be unit-tested and reused.
//
// Numbers come from public/data/channels.js (CHANNELS, PRICING_RESEARCH) and
// docs/research/channels-partnerships-pricing.md. Anything tagged [design] is a game estimate bounded by that
// research, never a measured benchmark, and must not be shown to players as a real statistic.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const mid = (r, fallback = 0) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r ?? fallback);
export const lerpRange = (r, t) => (Array.isArray(r) ? r[0] + (r[1] - r[0]) * clamp(t, 0, 1) : r);

// ---------------------------------------------------------------------------------------------------------
// Generic always-on channel: ramp and steady state
// ---------------------------------------------------------------------------------------------------------

// Share of steady state reached `ageDays` after the channel went live. Nothing before the first result day
// (CHANNELS.daysToFirstResult), then a smoothstep from 10% to 100% at rampMonths (CHANNELS.rampMonths).
export function rampFactor(ageDays, firstResultDay, rampMonths) {
  if (!(ageDays >= firstResultDay)) return 0;
  const end = Math.max(firstResultDay + 1, rampMonths * 30);
  const t = clamp((ageDays - firstResultDay) / (end - firstResultDay), 0, 1);
  return 0.1 + 0.9 * t * t * (3 - 2 * t);
}

// Company-size factor for channels whose volume depends on brand/traction [design]: CHANNELS volumes are
// "scaled for a typical seed-stage company (~$5k–$50k MRR)". At $0 MRR you get ~40% of that, at $5k ~70%,
// at $50k+ 100%, capped at 1.3 for bigger companies.
export function tractionFactor(mrr) {
  const x = Math.log10(1 + Math.max(0, mrr) / 1000) / Math.log10(51);
  return clamp(0.4 + 0.6 * x, 0.4, 1.3);
}

/**
 * Steady-state monthly volume (signups / installs / qualified leads) for a CHANNELS entry once ramped.
 * quality 0..1 (from judged player work); most players land near the low end, so quality is squared.
 * fit is the channel's fit for the business model (CHANNELS.fit[model]); 0.8 fit = full range.
 */
export function steadyMonthly(range, { quality = 0.5, fit = 0.8 } = {}) {
  const [lo, hi] = Array.isArray(range) ? range : [range, range];
  const q = clamp(quality, 0, 1);
  return (lo + (hi - lo) * q * q) * clamp(fit / 0.8, 0, 1.2);
}

// Conversion to paid for a channel at a given quality (CHANNELS.steadyStateMonthly.conversionToPaid).
export const channelConversion = (range, quality = 0.5) => lerpRange(range, clamp(quality, 0, 1) * 0.8 + 0.1);

// Day-to-day noise: lognormal multiplier with median 1 (sigma ~0.35 [design]).
export function dayNoise(rand, sigma = 0.35) {
  const u = Math.max(1e-9, rand()), v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(sigma * z - (sigma * sigma) / 2);
}

export function poissonSample(rand, mean) {
  if (!(mean > 0)) return 0;
  if (mean > 40) {
    const u = Math.max(1e-9, rand()), v = rand();
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
  }
  const L = Math.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

export function binomialSample(rand, n, p) {
  if (n <= 0 || p <= 0) return 0;
  if (n > 200) return clamp(Math.round(n * p + Math.sqrt(n * p * (1 - p)) * (rand() + rand() + rand() - 1.5) * 2), 0, n);
  let k = 0;
  for (let i = 0; i < n; i++) if (rand() < p) k++;
  return k;
}

/**
 * Split an expected number of paying customers into self-serve trials given the core trial→paid rate.
 * If the channel converts better than core trials (marketplace installs with intent), every signup becomes a
 * trial with a forced conversion; if worse (free extension installs, tool users), only a share become trials.
 * → { trialShare, forceConvert|null }
 */
export function trialSplit(channelConv, coreTrialConv) {
  const tc = Math.max(0.005, coreTrialConv);
  if (channelConv <= tc) return { trialShare: clamp(channelConv / tc, 0, 1), forceConvert: null };
  return { trialShare: 1, forceConvert: clamp(channelConv, 0, 0.9) };
}

// ---------------------------------------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------------------------------------

/**
 * Marketplace revenue share on `amount` of new revenue, given lifetime marketplace revenue before it.
 * rule: { pct, thresholdUsd?, pctAfter? } e.g. Shopify { pct: 0, thresholdUsd: 1e6, pctAfter: 0.15 }.
 */
export function revShareFee(rule, amount, lifetimeBefore = 0) {
  if (!rule || !(amount > 0)) return 0;
  if (rule.thresholdUsd == null) return amount * (rule.pct ?? 0);
  const room = Math.max(0, rule.thresholdUsd - lifetimeBefore);
  const under = Math.min(amount, room), over = amount - under;
  return under * (rule.pct ?? 0) + over * (rule.pctAfter ?? rule.pct ?? 0);
}

// Commission owed on a referred subscription's charge. months: 0 = lifetime. paidMonthsBefore = completed
// paid months before this charge. Annual charges count 12 months at once (pro-rated if the cap cuts in).
export function commissionOn({ amount, rate, months = 12, paidMonthsBefore = 0, interval = 'month' }) {
  if (!(amount > 0) || !(rate > 0)) return 0;
  if (!months) return amount * rate;
  const span = interval === 'year' ? 12 : 1;
  const left = clamp(months - paidMonthsBefore, 0, span);
  return amount * rate * (left / span);
}

// ---------------------------------------------------------------------------------------------------------
// Affiliates
// Rewardful (vendor, 250 programs): ~22% average commission small programs, 24.5% for $1M+ programs.
// [design] 5–15% of recruited affiliates ever make a sale; top 10% → 70–90% of affiliate revenue.
// ---------------------------------------------------------------------------------------------------------

// How attractive the offer is to an affiliate (1 = typical 20–30% recurring for 12 months, 60-day cookie).
export function offerAttractiveness({ rate = 0.25, months = 12, cookieDays = 60 }) {
  const durEq = months === 0 ? 24 : months; // lifetime ≈ 24 months of value to an affiliate [design]
  const value = rate * Math.min(durEq, 24) / (0.25 * 12);
  const cookie = cookieDays >= 90 ? 1.1 : cookieDays >= 60 ? 1 : cookieDays >= 30 ? 0.9 : 0.75;
  return clamp(Math.sqrt(value) * cookie, 0.3, 1.8);
}

/**
 * Probability that one recruited prospect joins the program [design].
 * Personalized DMs to people already writing about your category: ~8–15% join at a typical offer;
 * templated mass DMs a third of that. PartnerStack's partner marketplace adds discovery (×1.5).
 */
export function affiliateJoinProb({ quality = 0.5, personalized = true, attractiveness = 1, marketplace = false, kind = 'blogger' }) {
  const base = personalized ? 0.1 : 0.035;
  const kindMult = { blogger: 1, youtuber: 0.6, consultant: 0.8, newsletter: 0.8, coupon: 2.5, self: 1 }[kind] ?? 1;
  return clamp(base * (0.35 + 1.3 * quality) * attractiveness * (marketplace ? 1.5 : 1) * kindMult, 0.002, 0.6);
}

// Share of affiliate kinds among people who join [design]: coupon/deal sites and self-referrers join eagerly.
export const AFFILIATE_KINDS = {
  blogger: { label: 'Blogger / SEO writer', share: 0.38, convMult: 1, variance: 1.2 },
  youtuber: { label: 'YouTuber / creator', share: 0.14, convMult: 0.8, variance: 1.8 },
  consultant: { label: 'Consultant / agency', share: 0.16, convMult: 1.5, variance: 1 },
  newsletter: { label: 'Newsletter writer', share: 0.14, convMult: 1, variance: 1.3 },
  coupon: { label: 'Coupon / deal site', share: 0.12, convMult: 1, variance: 0.8, fraud: 'non_incremental' },
  self: { label: 'Unknown (new account)', share: 0.06, convMult: 1, variance: 0.8, fraud: 'self_referral' },
};

export function pickAffiliateKind(rand, { termsWritten = false } = {}) {
  // Written prohibited-tactics terms deter some coupon sites and self-referrers from even applying [design].
  const w = Object.entries(AFFILIATE_KINDS).map(([k, v]) => [k, v.share * (termsWritten && v.fraud ? 0.6 : 1)]);
  const tot = w.reduce((a, [, x]) => a + x, 0);
  let r = rand() * tot;
  for (const [k, x] of w) { r -= x; if (r <= 0) return k; }
  return 'blogger';
}

/**
 * Hidden potency of a new affiliate: monthly referred signups once they promote.
 * P(ever produces) 5–15% at a typical brief, up to ~45% for affiliates you activate personally.
 * Producers draw from a lognormal so the top 10% drive most of the volume.
 */
export function affiliatePotency(rand, { briefQuality = 0.5, kind = 'blogger', activated = false }) {
  const k = AFFILIATE_KINDS[kind] ?? AFFILIATE_KINDS.blogger;
  if (k.fraud) return { producer: true, monthly: 0.5 + rand() * 2.5 };
  const pProduce = clamp(0.06 * (0.5 + 1.2 * briefQuality) * (activated ? 4 : 1), 0.02, 0.45);
  if (rand() >= pProduce) return { producer: false, monthly: 0 };
  const u = Math.max(1e-9, rand()), v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return { producer: true, monthly: clamp(1.2 * Math.exp(k.variance * z - 0.3), 0.1, 80) };
}

// Personally activating an affiliate (custom page, higher tier, co-created content) [design].
export function activateBoost(aff, rand) {
  if (aff.kindFraud) return aff;
  if (!aff.producer && rand() < 0.3) return { ...aff, producer: true, monthly: 0.6 + rand() * 2.5, activated: true };
  return { ...aff, monthly: aff.monthly * (1.5 + rand()), activated: true };
}

// Share of an affiliate's referred conversions the tracking actually credits, by cookie window [design].
export const cookieCredit = (days) => (days >= 90 ? 1 : days >= 60 ? 0.95 : days >= 30 ? 0.85 : 0.65);

// Affiliate tools (CostBench / FirstPromoter blog 2026, vendor list prices; PartnerStack is a third-party estimate).
export const AFFILIATE_TOOLS = {
  tolt: { label: 'Tolt', monthly: 29, note: '~$29/mo; sources disagree on a transaction fee', marketplace: false },
  firstpromoter: { label: 'FirstPromoter', monthly: 49, note: 'from ~$49/mo, no transaction fees (vendor claim)', marketplace: false },
  rewardful: { label: 'Rewardful', monthly: 99, note: '~$49–$149/mo by revenue tier; Stripe/Paddle native', marketplace: false },
  partnerstack: { label: 'PartnerStack', monthly: 1200, note: 'custom pricing, estimated ~$800–$5,000/mo; includes a partner marketplace', marketplace: true },
};

// ---------------------------------------------------------------------------------------------------------
// Customer referral program
// Participation 2–8% of active customers average, 10–15% in healthier B2B programs (vendor compilations);
// two-sided rewards and asking after an aha moment raise it; credits beat cash; 15–25% of first month/year.
// ---------------------------------------------------------------------------------------------------------

export const REFERRAL_PLACEMENTS = {
  aha: { label: 'In-product ask right after the aha moment (first result / export)', mult: 1.45 },
  transactional: { label: 'Footer of receipts and transactional emails', mult: 1.12 },
  onboarding: { label: 'Onboarding checklist step', mult: 1.1 },
  renewal: { label: 'After a successful renewal / NPS 9–10', mult: 1.15 },
  settings: { label: 'Only on a page in Settings', mult: 0.6 },
};

/**
 * Monthly participation rate (share of active customers who send at least one invite) [design within vendor
 * ranges]: base 4% (B2C 5%, ent 2%); reward type/size, two-sided, placement and product love move it to 1–15%.
 */
export function referralParticipation({ model = 'smb', reward = 'free_month', rewardPct = 0.2, twoSided = true, placements = [], productFactor = 0.7 }) {
  const base = { b2c: 0.05, smb: 0.04, ent: 0.02 }[model] ?? 0.04;
  const type = { free_month: 1.15, credit: 1.2, cash: 1, none: 0.35 }[reward] ?? 1;
  // Diminishing returns on reward size; 15–25% of first-period value is the typical sweet spot.
  const size = reward === 'none' ? 1 : clamp(0.55 + 2.2 * Math.sqrt(clamp(rewardPct, 0, 0.6)) - 0.6, 0.6, 1.35);
  const place = placements.length ? Math.max(...placements.map((p) => REFERRAL_PLACEMENTS[p]?.mult ?? 1)) * (1 + 0.05 * (placements.length - 1)) : 0.5;
  const love = clamp(Math.sqrt(Math.max(0, productFactor) / 0.7), 0.3, 1.5);
  return clamp(base * type * size * (twoSided ? 1.25 : 1) * place * love, 0.005, 0.15);
}

// Invites sent per participant and invite → signup rate [design]: 2–4 invites, 8–15% accept.
export const REFERRAL_FUNNEL = { invitesPerParticipant: 3, inviteToSignup: 0.12, referredConvMult: 1.25 };
export const referralSignupsPerMonth = (active, participation) => active * participation * REFERRAL_FUNNEL.invitesPerParticipant * REFERRAL_FUNNEL.inviteToSignup;

// ---------------------------------------------------------------------------------------------------------
// PR
// Journalists respond to ~2.5–3.5% of pitches (Propel 2024); <150 words 5.9% vs >500 words 1.5%.
// Coverage odds per campaign [design]: tier-1 with funding news + known lead 10–30%; product-only 1–5%;
// trade/niche 20–50% with a good angle. Spike lasts 1–3 days; 0–300 signups per piece.
// ---------------------------------------------------------------------------------------------------------

export function pitchLengthFactor(words) {
  if (words <= 150) return 5.9 / 3;
  if (words >= 500) return 1.5 / 3;
  return 5.9 / 3 + ((words - 150) / 350) * (1.5 / 3 - 5.9 / 3);
}

export const PR_HOOKS = {
  funding: { label: 'Funding announcement (with a named lead investor)', tier1: [0.1, 0.3], trade: [0.3, 0.5], needsFunding: true },
  data: { label: 'Original data study / report', tier1: [0.04, 0.12], trade: [0.25, 0.5] },
  customer: { label: 'Notable customer result / case study', tier1: [0.02, 0.06], trade: [0.2, 0.4] },
  contrarian: { label: 'Founder opinion / contrarian take on a trend', tier1: [0.02, 0.06], trade: [0.15, 0.35] },
  product: { label: 'Product launch / new feature', tier1: [0.01, 0.05], trade: [0.1, 0.3] },
};

export function pitchResponseProb({ words = 200, personalized = true, quality = 0.5, tier = 'trade' }) {
  return clamp(0.03 * pitchLengthFactor(words) * (personalized ? 1.25 : 0.45) * (0.4 + 1.2 * quality) * (tier === 'tier1' ? 0.6 : 1.2), 0.002, 0.3);
}

// Probability the campaign lands at least one piece. listSize saturates around 20 well-targeted reporters.
export function coverageProb({ hook = 'product', tier = 'trade', quality = 0.5, listSize = 20, hasFunding = false, personalized = true }) {
  const h = PR_HOOKS[hook] ?? PR_HOOKS.product;
  if (h.needsFunding && !hasFunding) return 0.005;
  const r = tier === 'tier1' ? h.tier1 : h.trade;
  const p = lerpRange(r, quality) * Math.sqrt(clamp(listSize / 20, 0, 1.5)) * (personalized ? 1 : 0.4);
  return clamp(p, 0, 0.6);
}

// Signups from one piece of coverage, split over the spike days [design].
export function coverageSignups(rand, { tier = 'trade', fit = 0.8 }) {
  const range = tier === 'tier1' ? [30, 300] : [3, 60];
  return Math.round(lerpRange(range, rand() * rand()) * clamp(fit / 0.8, 0.2, 1.2));
}
export const SPIKE_SHARES = [0.6, 0.25, 0.15];

// ---------------------------------------------------------------------------------------------------------
// Sponsorships
// Podcast host-read CPM ~$18–$40 (Libsyn/Acast); YouTube tech/B2B integration CPM $30–$60 ($50–$100 high
// intent), dedicated 2–3x. Visit rates below are [design] chosen so CAC lands inside CHANNELS.cacRange.
// ---------------------------------------------------------------------------------------------------------

export const SPONSOR_FORMATS = {
  podcast_midroll: { label: 'Podcast host-read mid-roll (60s)', kind: 'podcast', cpmMult: 1, visitRate: 0.005, tail: 45, lead: [14, 35] },
  podcast_preroll: { label: 'Podcast pre-roll (30s)', kind: 'podcast', cpmMult: 0.7, visitRate: 0.003, tail: 30, lead: [14, 35] },
  yt_integration: { label: 'YouTube integration (60–90s inside a video)', kind: 'youtube', cpmMult: 1, visitRate: 0.009, tail: 120, lead: [21, 45] },
  yt_dedicated: { label: 'YouTube dedicated video', kind: 'youtube', cpmMult: 2.5, visitRate: 0.025, tail: 180, lead: [30, 60] },
  yt_short: { label: 'YouTube Short', kind: 'youtube', cpmMult: 0.5, visitRate: 0.003, tail: 20, lead: [14, 30] },
};

export function sponsorshipPrice({ audience, cpm, format }) {
  const f = SPONSOR_FORMATS[format];
  return Math.round((audience / 1000) * cpm * (f?.cpmMult ?? 1) / 10) * 10;
}

// Expected visits from a placement. Only ~40% of them are attributable (promo code / vanity URL) [design]:
// most listeners type the URL later, so they show up as direct traffic.
export function sponsorshipVisits({ audience, format, fit = 0.6, quality = 0.5 }) {
  const f = SPONSOR_FORMATS[format];
  return audience * (f?.visitRate ?? 0.005) * clamp(fit, 0.05, 1) * (0.4 + 1.2 * clamp(quality, 0, 1));
}
export const SPONSOR_ATTRIBUTED = 0.4;

// Long-tail shape: share of total visits on day d after publish (exponential with the format's tail).
export function tailShare(d, tailDays) {
  const k = 3 / Math.max(1, tailDays);
  return (1 - Math.exp(-k)) * Math.exp(-k * d);
}

// ---------------------------------------------------------------------------------------------------------
// Events
// Booth $10k–$15k space, $15k–$50k all-in; CEIR CPL $96–$881; ~80% of leads never followed up; follow up
// within 48h. Speaking: CFPs close 3–9 months ahead [design]. Webinars: 40–60% attend; registrant→paid 2–8%.
// ---------------------------------------------------------------------------------------------------------

// Booth scans: size of show and booth quality; 30–50% junk (students, vendors, competitors) [design].
export function boothScans(rand, { attendees, quality = 0.5 }) {
  const base = clamp(attendees * 0.025, 40, 400);
  return Math.round(base * (0.5 + quality) * (0.8 + 0.4 * rand()));
}
export const BOOTH_JUNK = [0.3, 0.5];

// Value of a lead decays fast if not followed up [design]: full within 2 days, halves every ~4 days after.
export const followUpFactor = (daysLate) => (daysLate <= 2 ? 1 : Math.exp(-(daysLate - 2) / 5.8));

// CFP acceptance [design]: 10–35% per submission depending on abstract quality and event size.
export const cfpAcceptProb = ({ quality = 0.5, size = 'medium' }) => clamp((0.08 + 0.3 * quality) * ({ small: 1.4, medium: 1, large: 0.55 }[size] ?? 1), 0.02, 0.5);

export const WEBINAR = { attend: [0.4, 0.6], regToPaid: [0.02, 0.08] };
// Registrants for a webinar promoted to your own audience and (optionally) a partner's [design]:
// seed startups without a list get 20–100.
export function webinarRegistrants({ ownList = 0, followers = 0, partnerAudience = 0, overlap = 0.3, quality = 0.5 }) {
  const own = ownList * 0.04 + followers * 0.002;
  const partner = partnerAudience * clamp(overlap, 0, 1) * 0.015;
  return Math.round((8 + own + partner) * (0.5 + quality));
}

// ---------------------------------------------------------------------------------------------------------
// Cold calling (Belkins 2025: 9.9% of dials connect, ~370 dials per meeting; Cognism: conversation→meeting
// 2.3% (2025) → 2.7% (2026)). Dials per hour [design]: manual ~25, power dialer ~45, parallel dialer ~90.
// ---------------------------------------------------------------------------------------------------------

export const DIALERS = {
  manual: { label: 'Manual (phone + spreadsheet)', perHour: 25, monthly: 0 },
  power: { label: 'Power dialer (e.g. Aircall / JustCall)', perHour: 45, monthly: 60 },
  parallel: { label: 'Parallel dialer (e.g. Orum / Nooks)', perHour: 90, monthly: 150 },
};
export function coldCallBlock(rand, { hours, dialer = 'manual', scriptQuality = 0.5, listQuality = 0.5 }) {
  const d = DIALERS[dialer] ?? DIALERS.manual;
  const dials = Math.round(hours * d.perHour);
  const connectP = 0.099 * (0.6 + 0.8 * listQuality); // verified mobiles connect more
  const connects = binomialSample(rand, dials, connectP);
  const meetP = clamp(0.025 * (0.4 + 1.2 * scriptQuality), 0.005, 0.08);
  const meetings = binomialSample(rand, connects, meetP);
  return { dials, connects, meetings };
}

// ---------------------------------------------------------------------------------------------------------
// Direct mail (ANA/DMA via vendors): avg response ~4.4% (house list 5–9%, prospects 2–4%); postcard ~$0.58,
// letter ~$0.81, dimensional ABM $8–$50 per piece with 5–15% response.
// ---------------------------------------------------------------------------------------------------------

export const MAIL_PIECES = {
  postcard: { label: 'Postcard', cost: 0.58, response: [0.02, 0.04] },
  letter: { label: 'Personal letter', cost: 0.81, response: [0.02, 0.045] },
  dimensional: { label: 'Dimensional / gift box (ABM)', cost: 30, response: [0.05, 0.15] },
};
export function directMailResponse({ piece = 'postcard', quality = 0.5, followUp = true, houseList = false }) {
  const p = MAIL_PIECES[piece] ?? MAIL_PIECES.postcard;
  return clamp(lerpRange(p.response, quality) * (followUp ? 1 : 0.5) * (houseList ? 1.8 : 1), 0, 0.3);
}
// Share of responses that become a qualified meeting/lead [design].
export const MAIL_QUALIFY = 0.35;

// ---------------------------------------------------------------------------------------------------------
// AppSumo-style lifetime deal. Partner nets ~30–70% of gross (sources conflict); AppSumo revenue fell ~50%
// over 2024–2026. [design]: sales curve, 60-day refunds 8–15%, 1–3% of LTD users ever buy a subscription,
// ongoing support and compute for users who never pay again.
// ---------------------------------------------------------------------------------------------------------

export const LTD_DEALS = {
  select: { label: 'Featured "Select" deal (platform promotes, spends on ads)', partnerShare: 0.3, volumeMult: 1 },
  marketplace: { label: 'Self-serve marketplace listing', partnerShare: 0.7, volumeMult: 0.25 },
};
export function ltdBuyers({ quality = 0.5, fit = 0.6, deal = 'select' }) {
  return Math.round(steadyMonthly([100, 3000], { quality, fit }) * (LTD_DEALS[deal]?.volumeMult ?? 1));
}
// Share of total LTD sales on day d of a 60-day campaign: launch spike, then decay, last-call bump [design].
export function ltdDayShare(d, days = 60) {
  if (d < 0 || d >= days) return 0;
  const w = (x) => Math.exp(-x / 9) + (x >= days - 4 ? 0.35 : 0) + 0.06;
  let tot = 0;
  for (let i = 0; i < days; i++) tot += w(i);
  return w(d) / tot;
}
export const LTD = { refundRate: [0.08, 0.15], refundDays: 60, upgradeRate: [0.01, 0.03], supportMinPerUserWeek: 0.6, supportHalfLifeDays: 90, hostingPerUser: 0.05, aiPerUser: 0.6 };

// ---------------------------------------------------------------------------------------------------------
// AI search visibility. ThriveStack (vendor, 2026-08): 84% of AI citations come from third-party sources;
// top 5 brands take ~68% of citations; ~74% weekly citation turnover. [design] share-of-answers curve.
// ---------------------------------------------------------------------------------------------------------

// Share of buyer prompts whose AI answer names you, from third-party mentions + reviews.
export function aiAnswerShare({ mentions = 0, reviews = 0, comparisonPages = 0 }) {
  const signal = mentions + 0.3 * Math.min(reviews, 100) + 2 * comparisonPages;
  return clamp(0.32 * (1 - Math.exp(-signal / 60)), 0, 0.32); // top-5 incumbents keep ~68%
}

// Listicle / "best X" inclusion outreach [design]: authors add a newcomer 3–12% of the time.
export const listicleAcceptProb = (quality = 0.5, reviews = 0) => clamp((0.03 + 0.09 * quality) * (reviews >= 10 ? 1.6 : 1), 0.01, 0.25);

// ---------------------------------------------------------------------------------------------------------
// Review sites. Capterra PPC: second-price auction, $2 minimum, $20+ to rank in competitive categories;
// CPL $30–$100+. G2 profile converts once it has ~10+ reviews.
// ---------------------------------------------------------------------------------------------------------

export const reviewProfileFactor = (reviews) => clamp(0.08 + 0.92 * Math.min(1, reviews / 10) ** 1.5, 0.08, 1) * (reviews > 50 ? 1.2 : 1);
export function ppcClicksPerDay({ bid = 2, competitiveBid = 20, demandPerDay = 12, dailyCap = 50 }) {
  const share = clamp((bid / competitiveBid) ** 1.5, 0.03, 1);
  const clicks = demandPerDay * share;
  return Math.min(clicks, dailyCap / Math.max(0.01, bid));
}
export const PPC_CONV = 0.07; // review-site visitor → trial/lead [design] → CPL ≈ bid / 0.07

// Share of asked customers who leave a review [design]: 5–15%, more with a gift card.
export const reviewAskRate = (incentive = 0) => clamp(0.06 + (incentive > 0 ? 0.06 : 0) + Math.min(0.04, incentive / 1000), 0, 0.2);

// ---------------------------------------------------------------------------------------------------------
// Resellers / agency partners. Margins 20–40%; partner involvement +~12% win rate (Crossbeam, vendor);
// [design] first deal 3–9 months after signing; 1 in 3–5 partners ever closes; enablement 5–10 h/week.
// ---------------------------------------------------------------------------------------------------------

export const partnerSignProb = (quality = 0.5, kind = 'agency') => clamp((kind === 'reseller' ? 0.12 : 0.2) * (0.4 + 1.3 * quality), 0.02, 0.45);
export function partnerProductive(rand, enablement = 0.5) {
  return rand() < clamp(0.25 * (0.6 + 0.8 * enablement), 0.1, 0.45);
}
export const partnerFirstDealDay = (rand) => Math.round(90 + rand() * 180);
// Engagement decays without enablement; below STALL the partner goes quiet [design].
export const PARTNER = { decayPerWeek: 0.08, sessionBoost: 0.18, stall: 0.2, dealsPerMonth: [0.3, 1.5] };

// ---------------------------------------------------------------------------------------------------------
// Co-marketing
// Works between companies of similar audience size; large partners rarely reciprocate for seed startups.
// ---------------------------------------------------------------------------------------------------------

export function comarketingAcceptProb({ quality = 0.5, ourAudience = 500, theirAudience = 5000, overlap = 0.3 }) {
  const ratio = theirAudience / Math.max(50, ourAudience);
  const size = ratio <= 3 ? 1 : ratio <= 10 ? 0.5 : ratio <= 50 ? 0.15 : 0.04;
  return clamp((0.15 + 0.5 * quality) * size * (0.6 + overlap), 0.01, 0.8);
}

// ---------------------------------------------------------------------------------------------------------
// Marketplaces: cold start until ~10 reviews (0–2 organic installs/week), ramp 6–18 months.
// ---------------------------------------------------------------------------------------------------------

export function marketplaceInstallsPerDay({ steadyMonthly, ageDays, firstResultDay, rampMonths, reviews = 0, certified = false, nativeFeature = false }) {
  const cold = 1 / 7; // ~1 install/week organically with no reviews (Indie Hackers 2026 anecdote: 0–2)
  const ramp = rampFactor(ageDays, firstResultDay, rampMonths);
  const reviewF = clamp(Math.min(1, reviews / 10) ** 1.3, 0, 1);
  const steady = (steadyMonthly / 30) * ramp * reviewF * (certified ? 1.4 : 1);
  return Math.max(ageDays >= firstResultDay ? cold : 0, steady) * (nativeFeature ? 0.3 : 1);
}
// Reviews per install [design]: ~2% unprompted; asking the first installs personally gets 20–40%.
export const REVIEW_PER_INSTALL = 0.02;
