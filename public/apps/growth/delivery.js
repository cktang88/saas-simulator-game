// Pure paid-media delivery model: seasonality, CPM/CPC, reach & frequency, creative fatigue, learning phase,
// budget-edit resets, attribution/reporting and ROAS. No state mutation, no DOM: randomness comes in as `rand`.
// Numbers: ./params.js (sources in docs/research/marketing-and-ads.md).

import {
  PLATFORMS, SEASON, CTR_CURVE, FREQ_CURVE, AUDIENCES, POCKET_SHARE, WEAR_K, PLACEMENTS, OBJECTIVES, FORMATS, AI_UGC,
  LEARNING_EFF, DIMINISHING, PURCHASE_OPT, COST_CAP_EXP, IOS_SHARE, NO_CAPI_FACTOR, BUDGET_EDIT, UGC,
} from './params.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Piecewise-linear interpolation over [[x, y], …] sorted by x.
export function interp(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve.at(-1)[1];
}

// Log-normal noise with median 1.
export const lognormal = (rand, sigma) => {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
};

// ---- Seasonality ----

// Black Friday / Cyber Monday week: Monday before Thanksgiving (4th Thursday of Nov) through Cyber Monday.
export function isBfcm(date) {
  if (date.getUTCMonth() !== 10 && date.getUTCMonth() !== 11) return false;
  const y = date.getUTCFullYear();
  const nov1 = new Date(Date.UTC(y, 10, 1));
  const thanksgiving = 1 + ((4 - nov1.getUTCDay() + 7) % 7) + 21;
  const start = Date.UTC(y, 10, thanksgiving - 3);
  const end = Date.UTC(y, 10, thanksgiving + 4, 23);
  return date.getTime() >= start && date.getTime() <= end;
}

// CPM/CPC multiplier for a platform's season kind ('social' | 'search' | 'b2b'), business model and date.
export function seasonFactor(kind, model, date) {
  const m = date.getUTCMonth();
  const b2b = kind === 'b2b' || model !== 'b2c';
  let f = (b2b ? SEASON.b2b : SEASON.b2c)[m];
  if (!b2b && isBfcm(date)) f = SEASON.bfcm;
  if (kind === 'search') f = 1 + (f - 1) * SEASON.searchDamping;
  return f;
}

// ---- Creative quality ----

// Hidden "true" quality: q = u^γ, γ = exp(-(skill - 0.5)·1.4). Neutral skill → ~5% of creatives are winners
// (q ≥ 0.95, Motion 2026); excellent briefs/hooks → ~10%; generic copy → ~2.5%.
export function qualityFromDraw(u, skill = 0.5) {
  const gamma = Math.exp(-(clamp(skill, 0, 1) - 0.5) * 1.4);
  return clamp(Math.pow(clamp(u, 0, 1), gamma), 0, 1);
}
export const winnerProbability = (skill) => 1 - Math.pow(0.95, 1 / Math.exp(-(clamp(skill, 0, 1) - 0.5) * 1.4));

export const baseCtr = (q) => interp(CTR_CURVE, clamp(q, 0, 1));
export const hookRate = (q, format) => (FORMATS[format]?.video ? 0.16 + 0.29 * clamp(q, 0, 1) : null); // 3s views / impr: weak <20%, top 35–45%

// ---- Reach, frequency & fatigue ----

// Unique reach of n impressions served into a pool of size A (Poisson approximation).
export const reachOf = (imps, A) => (A > 0 ? A * (1 - Math.exp(-imps / A)) : 0);
export const frequencyOf = (imps, A) => {
  const r = reachOf(imps, A);
  return r > 0 ? imps / r : 0;
};
export const freqFatigue = (freq7) => interp(FREQ_CURVE, freq7);
// Lifetime wear of a creative in its responsive pocket of the audience.
export function wearFatigue(lifeImps, audienceSize, { q = 0.5, speed = 1 } = {}) {
  const pocket = Math.max(1000, audienceSize * POCKET_SHARE * (q >= 0.95 ? 2 : 1));
  const lf = (lifeImps / pocket) * speed;
  return 1 / (1 + WEAR_K * Math.max(0, lf - 0.3));
}
// As CTR decays, the auction charges more per impression (+10–20% CPM, research §6).
export const fatigueCpmUplift = (fatigue) => 1 + 0.4 * (1 - clamp(fatigue, 0, 1));

// ---- Learning phase ----

// prev: previous status; events: optimization events since the last significant edit within the window;
// days: days since the last significant edit. cfg: { threshold, window, learnDays } or null (no learning phase).
export function learningStatus({ prev = 'learning', events = 0, days = 0, cfg, tracked = true }) {
  if (!tracked) return 'untracked';
  if (!cfg) return 'active';
  if (prev === 'active') return 'active';
  if (events >= cfg.threshold) return 'active';
  return days >= cfg.learnDays ? 'limited' : 'learning';
}
export const learningEfficiency = (status) => LEARNING_EFF[status] ?? 1;
export const minDailyBudgetToExit = (cpa, cfg) => (cfg ? (cfg.threshold / cfg.window) * cpa : 0); // ≈ 7 × CPA on Meta

// Budget edit → does it re-enter learning? (research §6 [design])
export function budgetEditEffect(oldBudget, newBudget, rand) {
  if (!(oldBudget > 0)) return { relearn: false, change: 0 };
  const change = Math.abs(newBudget - oldBudget) / oldBudget;
  if (change <= BUDGET_EDIT.safe) return { relearn: false, change };
  if (change <= BUDGET_EDIT.coinFlip) return { relearn: rand() < 0.5, change };
  return { relearn: true, change };
}

// ---- Attribution ----

// Share of true conversions the platform reports under 7-day click + 1-day view.
export function reportRate({ platform, model, pixel = true, capi = false }) {
  const p = PLATFORMS[platform];
  if (!pixel) return 0;
  const ios = IOS_SHARE[model] ?? 0.3;
  const r = (1 - ios) * p.report.web + ios * p.report.ios;
  return clamp(capi || p.kind === 'search' ? r : r * NO_CAPI_FACTOR, 0, 1);
}
// iOS conversions arrive 1–3 days late (SKAN/AEM); web+CAPI same day.
export function reportDelay(rand, { model, capi }) {
  if (rand() < (IOS_SHARE[model] ?? 0.3)) return 1 + Math.floor(rand() * 3);
  return capi ? 0 : rand() < 0.2 ? 1 : 0;
}

export const roas = (revenue, spend) => (spend > 0 ? revenue / spend : null);
export const cpa = (spend, results) => (results > 0 ? spend / results : null);

// ---- Daily delivery ----

function formatCtr(format, platform) {
  const f = FORMATS[format] ?? FORMATS.static;
  if (platform === 'linkedin' && f.linkedinCtr) return f.linkedinCtr;
  return f.ctr;
}
export function formatCvr(format, priceMonthly) {
  const f = FORMATS[format] ?? FORMATS.static;
  if (format === 'ai_ugc' && priceMonthly > AI_UGC.highPriceMonthly) return f.cvrHighPrice;
  return f.cvr;
}

// Diminishing returns: each extra dollar reaches less responsive people (CPA ∝ spend^0.2 above ref).
export const diminishing = (budget, model) => Math.pow(Math.max(1, budget / DIMINISHING.ref[model]), -DIMINISHING.exponent);

/**
 * One day of auction delivery (Meta, TikTok, LinkedIn) for an ad set.
 * p: { platform, model, date, budget, audience: { type, size }, placement, objective, optimization,
 *      bid: { strategy, cap }, status (learning status), imps6 (ad-set impressions in the previous 6 days),
 *      ads: [{ id, q, format, lifeImps, glitch, whitelisted }], landingRate, priceMonthly, rand }
 * → { spend, cpm, imps, reach7, freq7, ads: [{ id, spend, imps, clicks, lpv, expConv, ctr, cpm, fatigue }] }
 * expConv is the expected number of optimization-event conversions (trials / purchases / leads) before sampling.
 */
export function auctionDay(p) {
  const P = PLATFORMS[p.platform];
  const aud = AUDIENCES[p.audience.type] ?? AUDIENCES.broad;
  const plc = PLACEMENTS[p.placement] ?? PLACEMENTS.advantage;
  const obj = OBJECTIVES[p.objective] ?? OBJECTIVES.sales;
  const A = Math.max(1, p.audience.size);
  const out = { spend: 0, cpm: 0, imps: 0, reach7: 0, freq7: 0, ads: [] };
  if (!p.ads.length || p.budget <= 0) return out;

  // Pacing: Meta spends around the daily budget (±10%), never more than the audience can absorb (~1.5 impr/person/day).
  let spend = p.budget * (0.92 + 0.16 * p.rand());
  let cpm = P.cpm[p.model] * seasonFactor(P.season, p.model, p.date) * aud.cpm * plc.cpm * obj.cpm
    * (p.optimization === 'purchase' ? PURCHASE_OPT.cpm : 1) * lognormal(p.rand, 0.08);
  const maxImps = A * 1.5;
  if ((spend / cpm) * 1000 > maxImps) spend = (maxImps * cpm) / 1000;

  const imps7 = p.imps6 + (spend / cpm) * 1000;
  const reach7 = reachOf(imps7, A);
  const freq7 = imps7 / Math.max(1, reach7);
  const ff = freqFatigue(freq7);
  const dim = diminishing(spend, p.model);
  const learn = learningEfficiency(p.status);
  const scale = (P.ctrScale[p.model] ?? 1);

  // Per-ad predicted performance; the delivery system concentrates spend on predicted winners
  // (≈6% of ads take most spend, Motion 2026), with some exploration of new ads.
  const preds = p.ads.map((ad) => {
    const plcCtr = FORMATS[ad.format]?.video ? plc.ctr : plc.staticCtr;
    const wear = wearFatigue(ad.lifeImps, A, { q: ad.q, speed: P.fatigueSpeed ?? 1 });
    const fatigue = ff * wear;
    const ctr = baseCtr(ad.q) * scale * formatCtr(ad.format, p.platform) * aud.ctr * plcCtr * obj.ctr * fatigue * dim
      * (ad.glitch ? AI_UGC.glitchCtr : 1) * (ad.whitelisted ? UGC.whitelistCtr : 1);
    const cvr = p.landingRate * P.intent * aud.cvr * obj.cvr * formatCvr(ad.format, p.priceMonthly) * (0.8 + 0.4 * ad.q) * learn;
    const explore = ad.lifeImps < 3000 ? 1.5 : 1;
    return { ad, ctr, cvr, fatigue, weight: Math.pow(ctr * cvr + 1e-9, 2) * explore };
  });
  const wsum = preds.reduce((a, x) => a + x.weight, 0);

  // Cost / bid cap: the system only spends where it expects to hit the cap.
  const expCvrBlend = preds.reduce((a, x) => a + (x.weight / wsum) * x.ctr * x.cvr * P.lpvRate, 0);
  const estCpa = expCvrBlend > 0 ? (cpm / 1000) / expCvrBlend : Infinity;
  let capEff = 1;
  if ((p.bid?.strategy === 'cost_cap' || p.bid?.strategy === 'bid_cap') && p.bid.cap > 0 && estCpa > p.bid.cap) {
    spend *= clamp(Math.pow(p.bid.cap / estCpa, COST_CAP_EXP), 0.03, 1);
    capEff = 1.05;
  }

  for (const x of preds) {
    const share = x.weight / wsum;
    const adSpend = spend * share;
    const adCpm = cpm * fatigueCpmUplift(x.fatigue);
    const imps = (adSpend / adCpm) * 1000;
    const clicks = imps * x.ctr;
    const lpv = clicks * P.lpvRate;
    out.ads.push({ id: x.ad.id, spend: adSpend, imps, clicks, lpv, expConv: lpv * x.cvr * capEff, ctr: x.ctr, cpm: adCpm, fatigue: x.fatigue });
    out.imps += imps;
  }
  out.spend = spend;
  out.cpm = out.imps ? (spend / out.imps) * 1000 : cpm;
  out.reach7 = reach7;
  out.freq7 = freq7;
  return out;
}

// Keyword list parsing: "phrase" → phrase match, [exact] → exact, plain → broad.
export function parseKeywords(text) {
  return String(text ?? '').split(/\n|,/).map((l) => l.trim()).filter(Boolean).slice(0, 50).map((l) => {
    if (/^\[.*\]$/.test(l)) return { text: l.slice(1, -1).trim(), match: 'exact' };
    if (/^".*"$/.test(l)) return { text: l.slice(1, -1).trim(), match: 'phrase' };
    return { text: l, match: 'broad' };
  });
}
// Match type: volume share, CPC and post-click CVR multipliers [design].
export const MATCH = { exact: { vol: 0.4, cpc: 1.2, cvr: 1.2 }, phrase: { vol: 0.7, cpc: 1, cvr: 1 }, broad: { vol: 1.6, cpc: 0.85, cvr: 0.7 } };

/**
 * One day of search delivery (Google Search, Apple Search Ads) for an ad group.
 * p: { platform, model, date, budget, keywords: [{ text, match, relevance }], q (best ad copy quality, Apple uses
 *      landing fit), landingRate, status, bid: { strategy, cap }, rand }
 * Demand-capped: you can't buy clicks nobody searches for.
 */
export function searchDay(p) {
  const P = PLATFORMS[p.platform];
  const out = { spend: 0, imps: 0, clicks: 0, lpv: 0, expConv: 0, cpc: 0, ctr: 0, lostToBudget: 0, lostToDemand: 0 };
  if (!p.keywords.length || p.budget <= 0) return out;
  const season = seasonFactor('search', p.model, p.date);
  const q = clamp(p.q ?? 0.5, 0, 1);
  const qs = 1.3 - 0.5 * q; // Quality Score: better ads pay less per click [design]
  let demand = 0, cpcW = 0, cvrW = 0;
  for (const k of p.keywords) {
    const m = MATCH[k.match] ?? MATCH.broad;
    const d = (P.demandPerKeyword[p.model] ?? 2) * m.vol * clamp(k.relevance ?? 0.5, 0.05, 1);
    demand += d;
    cpcW += d * m.cpc;
    cvrW += d * m.cvr * (0.5 + k.relevance);
  }
  if (demand <= 0) return out;
  const cpc = P.cpc[p.model] * season * qs * (cpcW / demand) * lognormal(p.rand, 0.1);
  const ctr = P.searchCtr * (0.6 + 0.8 * q);
  const learn = learningEfficiency(p.status);
  const avail = demand * lognormal(p.rand, 0.15);
  let clicks = Math.min(p.budget / cpc, avail);
  out.lostToBudget = Math.max(0, 1 - (p.budget / cpc) / avail);
  out.lostToDemand = p.budget / cpc > avail ? 1 - avail / (p.budget / cpc) : 0;
  const cvr = p.landingRate * P.intent * (cvrW / demand) * learn;
  if ((p.bid?.strategy === 'cost_cap') && p.bid.cap > 0) {
    const est = cpc / (P.lpvRate * cvr || 1e-9);
    if (est > p.bid.cap) clicks *= clamp(Math.pow(p.bid.cap / est, COST_CAP_EXP), 0.03, 1);
  }
  out.clicks = clicks;
  out.spend = clicks * cpc;
  out.imps = clicks / ctr;
  out.lpv = clicks * P.lpvRate;
  out.expConv = out.lpv * cvr;
  out.cpc = cpc;
  out.ctr = ctr;
  return out;
}

// Kill / scale rule hints (practitioner rules from research §1.1, §1.8; thresholds [design]).
// m: { spend, results, imps, ctr, ctrBaseline, ctrRecent, freq7, cpa, targetCpa, status, days }
export function ruleHint(m) {
  const t = m.targetCpa;
  if (m.imps >= 2000 && m.ctr < 0.006) return { tone: 'bad', text: 'Weak hook: CTR under 0.6% after 2k impressions. Kill it and test a new angle.' };
  if (t && m.results === 0 && m.spend >= 2.5 * t) return { tone: 'bad', text: `Spent ${(m.spend / t).toFixed(1)}× target CPA with no results. Kill.` };
  if (t && m.cpa && m.cpa > 2 * t && m.spend >= 3 * t) return { tone: 'bad', text: 'CPA is over 2× target after a fair test. Kill or rework.' };
  if (m.ctrBaseline && m.ctrRecent && m.ctrRecent < m.ctrBaseline * 0.75 && m.freq7 > 2.5) return { tone: 'warn', text: 'Fatigue: CTR down >25% from its own baseline at frequency >2.5. Refresh the creative.' };
  if (m.ctrBaseline && m.ctrRecent && m.ctrRecent < m.ctrBaseline * 0.75 && m.days > 14) return { tone: 'warn', text: 'Creative wearing out: CTR down >25% from its first days. Line up a replacement.' };
  if (t && m.cpa && m.cpa <= t && m.status === 'active' && m.days >= 3) return { tone: 'good', text: 'Beating target CPA out of learning. Scale ≤20% every 2–3 days, or duplicate into a scaling campaign.' };
  if (m.status === 'limited') return { tone: 'warn', text: 'Learning limited: not enough events. Consolidate ad sets, raise budget toward 7× CPA/day, or optimize a shallower event.' };
  return null;
}
