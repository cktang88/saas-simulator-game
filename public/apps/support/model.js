// Helpdesk + reviews model. Pure functions; no DOM, no state mutation unless documented.
// Numbers: public/data/world.js SUPPORT / REVIEWS (docs/research/world-ops-support-life.md §2).
// Most volumes and multipliers there are [design] game estimates anchored on vendor benchmarks; the UI must
// not present them as measured statistics.

import { SUPPORT, REVIEWS } from '../../data/world.js';
import { clamp, lerp, words } from '../../core/util.js';
import { factHits, MAGIC } from './agent.js';

const mid = ([lo, hi]) => (lo + hi) / 2;

// Minutes of founder time per ticket by model [A] (same values as the People app's support model).
export const MINUTES_PER_TICKET = { b2c: 6, smb: 15, ent: 60 }; // ent tickets are heavier (review S3)
export const MACRO_SPEEDUP = 0.7; // [design] saved replies cut handling time ~30% once you have 3+
export const TRIAL_TICKET_FACTOR = 1.5; // [design] trial users ask setup questions (same as People's model)
// Enterprise volume per account: research §2.1 high-touch 0.5–1.0/account/month (world.js ent 1–4 is too high; review S3).
export const ENT_TICKETS = [0.4, 1.0];
export const AI_ERROR_RATE = 0.08; // [design] share of AI "resolutions" that were confidently wrong
export const CSAT_RESPONSE_RATE = 0.2; // [design] share of solved tickets that answer the CSAT survey
// SLA targets in hours by priority (research §2.2 B2B targets: good <12h, better <4h, best <1h) [design mapping].
export const SLA_HOURS = { urgent: 1, high: 4, normal: 12, low: 48 };

// Expected new tickets today. accounts: [{ ageDays }], trials: count.
export function expectedTickets({ model, accounts = [], trials = 0, docsQuality = 0, releaseWeek = false, outage = 0, statusPage = false }) {
  const base = mid(model === 'ent' ? ENT_TICKETS : SUPPORT.ticketsPerCustomerPerMonth[model] ?? SUPPORT.ticketsPerCustomerPerMonth.smb) / 30;
  const first = mid(SUPPORT.ticketsPerCustomerPerMonth.firstMonthMult);
  let n = accounts.reduce((a, c) => a + (c.ageDays < 30 ? first : 1), 0) * base + trials * base * TRIAL_TICKET_FACTOR;
  n *= 1 - (1 - SUPPORT.ticketsPerCustomerPerMonth.goodDocsMult) * clamp(docsQuality, 0, 1); // good docs ×0.7
  if (releaseWeek) n *= SUPPORT.ticketsPerCustomerPerMonth.releaseWeekMult;
  if (outage > 0) {
    const [lo, hi] = SUPPORT.ticketsPerCustomerPerMonth.outageMult;
    // outage: 0..1 severity; a status page with updates cuts the spike (×0.6, OPS.mttr.statusPageTicketMult).
    // statusPage may be a 0..1 update quality: a vague "we're looking into it" cuts less [design].
    const sq = statusPage === true ? 1 : clamp(Number(statusPage) || 0, 0, 1);
    n *= lerp(lo, hi, outage) * lerp(1, 0.6, sq);
  }
  return n;
}

// Help-center quality 0..1 from written articles (each has quality 0..1). ~6 solid articles cover a narrow product [design].
export function docsQuality(articles = []) {
  return clamp(articles.reduce((a, x) => a + (x.quality ?? 0), 0) / 6, 0, 1);
}

// AI agent resolution share of AI-eligible tickets. Year one 30–55%, mature (good docs + months live) 55–70%.
export function aiResolveShare(docsQ, monthsLive = 0) {
  const y1 = SUPPORT.aiResolution.gameYearOne, mature = SUPPORT.aiResolution.gameMature;
  const lo = lerp(y1[0], mature[0], clamp(monthsLive / 12, 0, 1)), hi = lerp(y1[1], mature[1], clamp(monthsLive / 12, 0, 1));
  return lerp(lo, hi, clamp(docsQ, 0, 1));
}
// The AI never resolves these (research §2.3).
export const AI_INELIGIBLE = new Set(['bug', 'billing', 'angry', 'outage', 'escalation']);

// First-response time in hours for a ticket answered `daysWaited` days after it arrived, at the founder's
// response cadence (checks the inbox ~3×/day when working = ~2–3h same-day median [design]).
export function frtHours(daysWaited, { ai = false } = {}) {
  if (ai) return 0.05;
  return daysWaited <= 0 ? 2.5 : daysWaited * 24 - 6;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// Churn multiplier by median first response (world.js SUPPORT.firstResponse.churnMultByMedianFRT, [design]).
export function frtChurnMult(medianHours) {
  if (medianHours == null) return 1;
  return SUPPORT.firstResponse.churnMultByMedianFRT.find((r) => medianHours <= r.maxHours).mult;
}

// CSAT expectation from response time: ~92% under 5 min, ~51% at 24 h [V]; log-interpolated, floor 0.3 [design].
export function csatFromFrt(hours) {
  const { under5min, at24h } = SUPPORT.firstResponse.csatByFRT;
  const h = Math.max(1 / 12, hours);
  const t = Math.log(h / (1 / 12)) / Math.log(24 / (1 / 12));
  return clamp(under5min + (at24h - under5min) * t, 0.3, 0.95);
}

// CSAT from response time AND outcome (review S2): ~0.8 at 2.5 h resolved, ~0.55 at 48 h; SaaS average ~78%.
export function csatP({ frt = 2.5, resolved = true, hard = 0, fit = 0.5 }) {
  return clamp(0.8 - 0.1 * Math.log10(Math.max(1, frt)) + 0.075 * (resolved ? 1 : -1) - 0.1 * hard + 0.1 * (fit - 0.5), 0.3, 0.95);
}

// ---- Reviews ----

export const PLATFORMS = {
  b2c: ['App Store', 'Google Play', 'Trustpilot'],
  smb: ['G2', 'Capterra', 'Trustpilot'],
  ent: ['G2', 'Capterra', 'TrustRadius'],
};

// Review-request channels with posting rates from REVIEWS.requestToReview ([design] for B2B SaaS).
export const REQUEST_CHANNELS = {
  email: { label: 'Email ask', rate: REVIEWS.requestToReview.b2bEmailAsk, minutesPerAsk: 1, costPerReview: 0, models: ['smb', 'ent'] },
  incentive: { label: 'Email ask + disclosed gift card (any rating)', rate: REVIEWS.requestToReview.b2bEmailWithCompliantIncentive, minutesPerAsk: 1, costPerReview: 25, models: ['smb', 'ent', 'b2c'] },
  personal: { label: 'Personal ask after a win', rate: REVIEWS.requestToReview.personalAskAfterWin, minutesPerAsk: 10, costPerReview: 0, models: ['smb', 'ent', 'b2c'] },
  inapp: { label: 'In-app rating prompt', rate: REVIEWS.requestToReview.b2cInAppPrompt, minutesPerAsk: 0, costPerReview: 0, models: ['b2c'] },
};

// Star rating a customer would give: happiness 0..1 (product fit, CSAT, bugs) plus noise u in [0,1).
export function starsFor(happiness, u) {
  return clamp(Math.round(1 + 4 * clamp(happiness + (u - 0.5) * 0.5, 0, 1)), 1, 5);
}

export function happiness({ productFit = 0.35, csat = 0.75, bugHours = 0, wonMoment = false }) {
  return clamp(0.45 * (0.3 + productFit) + 0.35 * csat + 0.2 * (1 - Math.min(1, bugHours / 80)) + (wonMoment ? 0.1 : 0) - 0.05, 0, 1);
}

// Conversion multiplier from recent visible reviews (REVIEWS.countThresholds, ratingToConversion).
export function reviewsMultiplier(reviews, model, day) {
  const recent = reviews.filter((r) => !r.removed && day - r.day <= 365);
  const b2c = model === 'b2c';
  const tier = REVIEWS.countThresholds.filter((t) => recent.length >= t.minReviews).at(-1);
  let mult = b2c ? tier.b2cMult : tier.b2bMult;
  const rating = recent.length ? recent.reduce((a, r) => a + r.rating, 0) / recent.length : null;
  if (rating != null && recent.length >= 3) {
    const [peakLo, peakHi] = REVIEWS.ratingToConversion.peakStars;
    if (rating < 4) mult *= b2c ? lerp(...REVIEWS.ratingToConversion.gameB2CBelow4Mult, clamp(rating - 3, 0, 1)) : REVIEWS.ratingToConversion.gameB2BBelow4Mult;
    else if (rating < peakLo) mult *= 0.97;
    else if (rating > 4.8) mult *= 0.98; // "too perfect" looks fake (peak 4.2–4.5 in consumer studies) [design]
    void peakHi;
  }
  return { mult: Math.round(mult * 1000) / 1000, rating, count: recent.length, aiMentions: recent.length >= 20 };
}

// FTC fake-review rule: civil penalty up to $51,744 per violation (2024, indexed). Settlements are usually a
// fraction of the maximum [design]: 5–20%.
export const FAKE_REVIEWS = {
  vendorPrice: 15, // $ per fake review from a "review service" [design]
  platformRemoval: 0.5, // [design] share removed within 60 days (platforms auto-remove most detected fakes)
  detectedPerYear: 0.6, // [design] chance per year the scheme is detected → platform warning label
  ftcGivenDetected: 0.15, // [design]
  penaltyPerViolation: REVIEWS.rules.maxCivilPenaltyPerViolationUSD2024,
  settlementShare: [0.05, 0.2],
  warningLandingMult: 0.7, warningDays: 90,
};

// ---- Help-center article heuristic (fallback for the LLM grader) ----
export function articleHeuristic(a, features = []) {
  const t = `${a.title} ${a.body}`.toLowerCase();
  const n = words(a.body);
  const steps = (a.body.match(/^\s*(\d+[.)]|-|\*)\s+/gm) ?? []).length;
  const featHit = features.some((f) => String(f.title).toLowerCase().split(/\W+/).filter((w) => w.length > 4).some((w) => t.includes(w)));
  const answers = /(how (do|to|can)|why|what|fix|set ?up|connect|cancel|refund|reset|export|invite|troubleshoot)/.test(t);
  const quality = clamp((n >= 80 ? 0.3 : n / 270) + Math.min(0.3, steps * 0.08) + (featHit ? 0.2 : 0) + (answers ? 0.15 : 0) + (n > 600 ? -0.1 : 0) + (/(seamless|easy|simply|just click)/.test(t) ? -0.05 : 0), 0, 1);
  const issues = [];
  if (n < 80) issues.push('Too short to actually answer a question.');
  if (!steps) issues.push('No numbered steps: customers skim for the next action.');
  if (!featHit) issues.push('Does not mention any feature you have shipped.');
  if (!answers) issues.push('Title should be the question a customer actually asks ("How do I…").');
  return { quality: Math.round(quality * 100) / 100, issues };
}

// ---- Reply quality heuristic for ticket replies (fallback judge) ----
// Hardened against keyword stuffing (operator-tiers audit item 13): the old version rewarded "fixed", "step",
// "today", "sorry" and a question mark on their own. Now every keyword bonus is scaled by grounding (how many
// facts from the ticket and the account the reply uses), keyword density and repetition are penalised, and an
// ungrounded reply is capped below the "solved" bar. The LLM judge stays primary; this is the offline fallback
// and shrinks toward the median.
// ctx: { ticketText, facts: [customer first name, plan, feature titles, amounts…] }. Without ctx the reply is
// judged as ungrounded.
export function replyQuality(body, category, ctx = {}) {
  const raw = String(body ?? '');
  const t = raw.toLowerCase();
  const n = words(t);
  let kw = 0;
  if (n >= 20) kw += 0.15;
  if (/\b(fixed|shipped|deployed|live now|patched|resolved|refunded|credited)\b/.test(t)) kw += 0.2;
  if (/\b(step|1\.|first,|go to|click|settings|here's how|here is how)\b/.test(t)) kw += 0.15;
  if (/\b(today|tomorrow|this week|within \d+|in \d+ (hours|days))\b/.test(t)) kw += 0.1;
  if (/\?/.test(t)) kw += 0.05;
  if (/\b(sorry|apolog|thanks for)\b/.test(t)) kw += 0.05;
  if (category === 'billing' && /\b(refund|credit|invoice|prorat)\b/.test(t)) kw += 0.15;
  const hits = factHits(raw, ctx);
  const grounding = clamp(hits / 3, 0, 1);
  let s = 0.2 + kw * (0.3 + 0.7 * grounding);
  if (n > 220) s -= 0.1;
  if (/\b(we value your feedback|we will consider|stay tuned|as per our policy)\b/.test(t) && n < 40) s -= 0.25;
  // Stuffing: a high share of "magic" words, or the same words over and over.
  const magic = (t.match(MAGIC) ?? []).length;
  if (n && magic / n > 0.25) s -= 0.25;
  if (echoesTicket(t, ctx.ticketText)) s = Math.min(s - 0.2, 0.4); // pasting the customer's own words back is not an answer
  const toks = t.match(/[a-z']+/g) ?? [];
  if (toks.length >= 10 && new Set(toks).size / toks.length < 0.55) s -= 0.15;
  if (hits === 0) s = Math.min(s, 0.4); // never "solved" without touching the customer's actual problem
  return clamp(s, 0, 1);
}

// True when the reply repeats 8+ consecutive words of the ticket.
function echoesTicket(reply, ticketText) {
  const tw = String(ticketText ?? '').toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (tw.length < 8) return false;
  const r = ` ${(reply.match(/[a-z0-9']+/g) ?? []).join(' ')} `;
  for (let i = 0; i + 8 <= tw.length; i++) if (r.includes(` ${tw.slice(i, i + 8).join(' ')} `)) return true;
  return false;
}
