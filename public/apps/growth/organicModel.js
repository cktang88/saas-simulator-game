// Pure organic-growth model: SEO ranking ramp & AI Overview CTR, keyword metrics, GEO citations, social reach,
// community outcomes, personal-network launch, Product Hunt, word of mouth / K-factor. No state, no DOM.

import { ORGANIC } from './params.js';
import { lognormal } from './delivery.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function strHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 4294967296;
}

// ---- SEO ----

// Keyword-explorer style estimate (deterministic per query): longer queries → less volume, lower difficulty.
export function keywordMetrics(query, model = 'smb') {
  const q = String(query ?? '').trim().toLowerCase();
  const n = Math.max(1, q.split(/\s+/).filter(Boolean).length);
  const h = strHash(q), h2 = strHash(q + '#');
  const base = { b2c: 40000, smb: 12000, ent: 5000 }[model] ?? 12000;
  const volume = Math.max(10, Math.round((base / Math.pow(3, n - 1)) * (0.3 + 2.7 * h) / 10) * 10);
  const kd = Math.round(clamp(85 - 16 * (n - 1) + (h2 - 0.5) * 30, 0, 98));
  const tier = kd < 20 ? 'long' : kd < 50 ? 'mid' : 'hard';
  const commercial = /\b(best|vs|alternative|alternatives|pricing|price|review|software|tool|app for|template)\b/.test(q);
  return { volume, kd, tier, commercial };
}

// Logistic ramp from publish to final position: long-tail ~3–6 months, competitive 12–24 (Ahrefs; agencies).
export function seoRamp(ageDays, tier) {
  const mid = ORGANIC.seo.rampMonths[tier] * 30;
  return 1 / (1 + Math.exp(-(ageDays - mid) / (mid * 0.25)));
}

// Final ranking position drawn at publish. quality/slop from the article judge; dr = domain rating 0..100.
export function drawPosition({ tier, quality, slop = 0, dr = 0 }, rand) {
  const [base, bonus] = ORGANIC.seo.pTop10[tier];
  const q = quality * (slop > 0.5 ? ORGANIC.seo.slopPenalty : 1);
  const pTop10 = clamp((base + bonus * q) * (1 + dr / 30) * (q < 0.3 ? 0.3 : 1), 0, 0.95);
  if (rand() < pTop10) return 1 + Math.floor(Math.pow(rand(), 0.6 + q) * 10);
  return 11 + Math.floor(rand() * 40);
}

export function ctrAtPosition(pos) {
  if (pos <= 10) return ORGANIC.seo.ctrByPos[pos - 1];
  if (pos <= 20) return ORGANIC.seo.page2Ctr;
  return ORGANIC.seo.deepCtr;
}

// Expected organic visits per day for an article of the given age.
export function seoDailyVisits({ volume, position, informational, ageDays, tier }) {
  const aio = informational ? ORGANIC.seo.aioInformational : ORGANIC.seo.aioCommercial;
  // Before the ramp completes the page sits deep in the results.
  const r = seoRamp(ageDays, tier);
  const ctr = r * ctrAtPosition(position) + (1 - r) * ORGANIC.seo.deepCtr;
  return (volume / 30) * ctr * aio;
}

// LLM answer engines: tiny traffic that converts well (Ahrefs 2026, AirOps).
export const geoDailyVisits = (citations) => ORGANIC.geo.visitsPerCitation * Math.pow(Math.max(0, citations), ORGANIC.geo.exponent);

// ---- Social (build in public) ----

export function socialReach({ followers, platform, skill, hasLink }, rand) {
  const S = ORGANIC.social;
  let reach = Math.max(0, followers) * S.reach[platform] * (0.3 + 1.7 * skill * skill) * lognormal(rand, S.sigma);
  if (hasLink) reach *= S.linkPenalty[platform];
  let breakout = false;
  if (rand() < S.breakoutChance * (0.5 + skill)) {
    breakout = true;
    reach *= S.breakoutMult[0] + rand() * (S.breakoutMult[1] - S.breakoutMult[0]);
  }
  reach = Math.round(reach + 20 * rand()); // a few strangers always see it
  const engagements = Math.round(reach * (0.01 + 0.03 * skill));
  const visits = reach * S.clickRate * (hasLink ? 2.5 : 1) * (0.5 + skill);
  const newFollowers = Math.round(reach * S.followRate * skill * (breakout ? 1.5 : 1));
  return { reach, engagements, visits, newFollowers, breakout };
}

// ---- Communities ----

export function communityOutcome({ size, helpfulness, relevance, promotional, report, hasLink }, rand) {
  const C = ORGANIC.community;
  const members = C.sizes[size] ?? C.sizes.medium;
  const strict = C.strictness[size] ?? 0.8;
  const pRemove = clamp(strict * (promotional * promotional * (hasLink ? 0.9 : 0.45) + report * 0.3), 0, 0.95);
  const removed = rand() < pRemove;
  const banned = removed && rand() < clamp(promotional * 0.6, 0, 0.8);
  if (removed) return { removed, banned, reach: 0, visits: 0, tail: 0, citable: false };
  const rate = C.reachRate[0] + (C.reachRate[1] - C.reachRate[0]) * helpfulness * relevance;
  const reach = Math.round(members * rate * lognormal(rand, 0.6));
  const visits = reach * (hasLink ? C.clickLink : C.clickNoLink) * (0.4 + helpfulness);
  // Helpful threads keep getting found through Google and LLM answers.
  const tail = helpfulness >= 0.65 ? (0.2 + 1.8 * helpfulness * relevance) * (members >= 50000 ? 1.5 : 1) : 0;
  return { removed, banned, reach, visits, tail, citable: helpfulness >= 0.65 };
}
export const communityTail = (perDay, ageDays) => perDay * Math.exp(-ageDays / (ORGANIC.community.tailDays / 2));

// ---- Personal network launch ----

// Expected outcomes of a one-time launch to the founder's network (research §6 [design]: 0–3 paying from ~150).
export function networkLaunchPlan({ network, channels, model, skill = 0.5 }) {
  const N = ORGANIC.network;
  const out = { trials: {}, payProb: {}, visits: 0 };
  const q = 0.6 + 0.8 * skill;
  if (channels.friends) {
    const tryRate = clamp((N.tryRate[0] + (N.tryRate[1] - N.tryRate[0]) * skill), 0, 0.5);
    out.trials.friends = network.friends * tryRate;
    const icp = N.icpShare[model];
    out.payProb.friends = icp * N.payIcp + (1 - icp) * N.payOther;
  }
  if (channels.linkedin) out.visits += network.linkedin * N.linkedinReach * N.clickRate * q;
  if (channels.x) out.visits += network.x * N.xReach * N.clickRate * q;
  if (channels.newsletter) out.visits += network.newsletter * N.newsletterOpen * N.newsletterClick * q;
  return out;
}

// ---- Product Hunt ----

export function phOutcome({ skill, networkSize, productFit, weekend }, rand) {
  const P = ORGANIC.ph;
  const support = clamp(Math.log10(1 + networkSize) / 4.5, 0, 1);
  const score = 0.45 * skill + 0.3 * support + 0.25 * productFit + (rand() - 0.5) * 0.35 + (weekend ? 0.08 : 0);
  // Top 3 has a <5% base rate (LaunchList 2026); most launches land outside the top 10.
  const rank = score > 0.82 ? 1 + Math.floor(rand() * 3) : score > 0.62 ? 4 + Math.floor(rand() * 7) : score > 0.42 ? 11 + Math.floor(rand() * 20) : 31 + Math.floor(rand() * 60);
  const band = rank <= 10 ? P.top10 : rank <= 30 ? P.mid : P.low;
  const signups = Math.round((band[0] + rand() * (band[1] - band[0])) * (weekend ? 0.7 : 1));
  const paidConv = P.paidConv[0] + (P.paidConv[1] - P.paidConv[0]) * clamp(productFit, 0, 1);
  return { rank, signups, paidConv, upvotes: Math.round(signups * (0.6 + rand())), dr: rank <= 10 ? 8 : 3 };
}

// ---- Word of mouth & referrals ----

// K-factor: typical 0.1–0.25, good referral programs 0.4–0.7, >1 essentially never sustained.
export function kFactor({ model, productFactor, referral }) {
  const W = ORGANIC.wom;
  const fit = clamp(productFactor, 0.2, 1.75);
  let k = W.k0[model] * fit;
  if (referral?.enabled) {
    const r = ORGANIC.referral[referral.reward] ?? ORGANIC.referral.credit;
    k += r.boost * (referral.twoSided ? 1 : ORGANIC.referral.oneSidedFactor) * Math.sqrt(fit);
  }
  return clamp(k, 0, W.kCap);
}
// K is a lifetime quantity: each paying customer brings K new paying customers over their life, mostly in the
// first ~2 months (the moment of delight), with a small ongoing tail [design]. Weight per active customer per day:
export function womWeight(tenureDays) {
  const W = ORGANIC.wom;
  return tenureDays < W.earlyDays ? 1 / W.earlyDays : W.tailPerYear / 365;
}
// Expected new trials per day. weighted = Σ womWeight(tenure) over active customers; trials = paying / trialConv.
export function womTrialsPerDay({ weighted, k, trialConv }) {
  return (weighted * k) / Math.max(0.15, trialConv);
}
// Total customers per directly acquired customer once the loop runs out: 1 / (1 − K).
export const viralMultiplier = (k) => (k >= 1 ? Infinity : 1 / (1 - k));
