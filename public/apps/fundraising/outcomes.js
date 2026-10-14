// Mapping evaluation + traction → investor funnel odds and round terms (docs/research/fundraising.md §7).
// Every formula here is a [D] game-design choice calibrated to the sourced ranges in that file. Pure.

import { clamp } from '../../core/util.js';
import { weightedScore, CRITERIA_KEYS } from './rubric.js';

// Stage medians (center of the valuation model). Review F2: centered on 2026 medians.
// Pre-seed: Carta Q2 2026 SAFE cap by round size (table below). Seed: PitchBook-NVCA Q3 2026 $3.0M at $18.3M pre
// (≈$21M post; Carta software $24.3M post). Series A: $17.4M at $60.3M pre (≈$78M post).
export const BASE_POST = {
  'pre-seed': [8e6, 12e6], // only used as a fallback; SAFE caps come from SAFE_CAP_BY_ROUND
  seed: [18e6, 25e6],
  'series-a': [65e6, 90e6],
};
export const MEDIAN_POST = { seed: 21e6, 'series-a': 78e6 };
export const ROUND_SIZE = { 'pre-seed': [250e3, 2.5e6], seed: [1.5e6, 6e6], 'series-a': [8e6, 25e6] };
export const DILUTION = { 'pre-seed': [0.06, 0.12], seed: [0.13, 0.2], 'series-a': [0.15, 0.22] };
export const POOL_TARGET = { seed: [0.1, 0.15], 'series-a': [0.1, 0.12] }; // Carta 2026: median seed pool 12.1%
// Valuation multiplier from panel score, centered on the median founder (S=3 → 1.0×; S=2 → 0.64×; S=4 → 1.57×).
export const scoreMultiplier = (S) => Math.exp(0.45 * (S - 3));
// Clamp to [p25/p50, p90/p50] of the stage (top decile ≈ 4× median per Carta).
const MULT_CLAMP = { 'pre-seed': [0.5, 3], seed: [0.6, 3.5], 'series-a': [0.65, 3] };
export const AI_PREMIUM = 1.07; // research: +0–45% across sources, PitchBook Q1'26 ≈ +4% at seed

// Stage medians for the "ask > 2x median" hard flag (Carta Q2 2026 avg pre-seed instrument $276K is per
// check; rounds ~$0.5–1M; PitchBook Q1 2026 seed $3.0M; Carta Jul 2026 Series A $14.4M).
export const STAGE_MEDIAN_ROUND = { 'pre-seed': 750e3, seed: 3.0e6, 'series-a': 14.4e6 };

// Median post-money SAFE cap by round size (Carta Q2 2026 via Kruze; docs/research/angels-and-landscape-2026.md §0).
export const SAFE_CAP_BY_ROUND = [
  { maxRound: 250_000, p25: 4.2e6, median: 8e6, p90: 22e6 },
  { maxRound: 1_000_000, p25: 6e6, median: 10e6, p90: 30e6 },
  { maxRound: 2_500_000, p25: 10e6, median: 15e6, p90: 40e6 },
  { maxRound: Infinity, p25: 20e6, median: 30e6, p90: 100e6 },
];
export function safeCapBand(roundSize, table = SAFE_CAP_BY_ROUND) {
  return (table ?? SAFE_CAP_BY_ROUND).find((b) => roundSize <= b.maxRound) ?? SAFE_CAP_BY_ROUND.at(-1);
}

// Pipeline stages (CRM).
export const PIPELINE = [
  ['researching', 'Researching'],
  ['intro_requested', 'Intro requested'],
  ['contacted', 'Contacted'],
  ['first_meeting', 'First meeting'],
  ['partner_meeting', 'Partner meeting'],
  ['diligence', 'Diligence'],
  ['term_sheet', 'Term sheet'],
  ['committed', 'Committed'],
  ['passed', 'Passed'],
];
export const STAGE_LABEL = Object.fromEntries(PIPELINE);

// Investor-specific score: an archetype weights the rubric criteria differently (founder/market/traction/
// defensibility/efficiency/deck). Blended 50/50 with the panel score.
export function investorScore(criteria, weights, S) {
  if (!weights || !criteria) return S;
  const c = (k) => criteria[k]?.avg ?? criteria[k] ?? 3;
  const map = {
    founder: (c('founder_market_fit') + c('execution')) / 2,
    market: c('market_why_now'),
    traction: c('traction'),
    defensibility: c('defensibility'),
    efficiency: c('business_model'),
    deck: c('narrative'),
  };
  let tot = 0, w = 0;
  for (const [k, v] of Object.entries(weights)) if (map[k] != null && v > 0) { tot += map[k] * v; w += v; }
  return w ? +(0.5 * S + 0.5 * (tot / w)).toFixed(2) : S;
}

// Thesis / stage / check-size fit, 0.2–1.3.
export function thesisFit(inv, { stage, oneLiner = '', icp = '', model = 'smb', isAI = false, defensibility = 3, roundSize = 0 }) {
  let f = 1;
  const st = String(inv.stage ?? '').toLowerCase();
  const stageOk = !st || st === 'any' || st.includes(stage) || (stage === 'pre-seed' && /angel|pre|scout|syndicate|accelerator/.test(st)) || (stage === 'seed' && /angel|syndicate|seed|micro/.test(st)) || (stage === 'series-a' && /(series[- ]?a|multistage|growth)/.test(st));
  if (!stageOk) f *= 0.25;
  if (inv.checkMin && roundSize && inv.checkMin > roundSize) f *= 0.3;
  const thesis = String(inv.thesis ?? '').toLowerCase();
  if (thesis) {
    const words = new Set(`${oneLiner} ${icp}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
    const hits = [...words].filter((w) => thesis.includes(w)).length;
    f *= 0.95 + Math.min(0.3, hits * 0.1);
    if (/\bb2b\b|enterprise|smb/.test(thesis) && model === 'b2c') f *= 0.5;
    if (/consumer|b2c/.test(thesis) && !/b2b/.test(thesis) && model !== 'b2c') f *= 0.6;
  }
  const stance = inv.aiStance ?? 'neutral';
  const st2 = String(stance).toLowerCase();
  if (isAI && /bull|ai[- ]?first|positive|pay up|ai-native|loves ai/.test(st2)) f *= 1.15;
  if (isAI && /skept|wary|negative|bear|wrapper|allergic/.test(st2) && defensibility < 3.5) f *= 0.7;
  return clamp(f, 0.2, 1.3);
}

// Traction multiplier on meeting odds (mild, S already contains traction). [D]
export const tractionMult = (tractionScore) => clamp(0.85 + 0.1 * ((tractionScore ?? 2) - 2), 0.8, 1.15);

// Cold vs warm base meeting rates: research §3 — cold → meeting <1–2% (0.02), warm intro → meeting 20–50% (0.35).
// Archetypes may override (cold reply rate × 0.5 reply→meeting [D]; warm meeting rate as given).
export function baseMeetingRate(inv, warm) {
  if (warm) return inv.warmMeetingRate ?? 0.4; // P(meeting | intro made)
  return inv.coldReplyRate != null ? inv.coldReplyRate * 0.6 : 0.025; // review F4: reply → meeting 0.6
}
// Follow-ups re-roll at a decaying share of the base rate (follow-ups roughly triple replies). Review F4.
export const FOLLOWUP_DECAY = [1, 0.5, 0.35, 0.25];
export const DEFAULT_INTRO_ODDS = 0.75; // connectors make most requested intros; 0.9 for portfolio-founder paths

// p(first meeting) per investor pitched, calibrated so 70 pitched (≈40% warm) → 15–25 first meetings for a median
// (S≈3.2) founder (DocSend: non-closers 15 meetings from 70 contacted). See test/fundraising.test.js.
export function pMeeting({ inv, S, warm, channel = 1, fit = 1, traction = 1, stale = false }) {
  const scoreMult = clamp(1 + 0.35 * (S - 3), 0.25, 1.7);
  return clamp(baseMeetingRate(inv, warm) * scoreMult * channel * fit * traction * (stale ? 0.7 : 1), 0.001, 0.85);
}

// Solo-founder modifier (research §7.2): ×0.6 on p_partner unless execution ≥ 4 and traction ≥ 3 → ×0.9.
// (The raw Carta-implied 0.38x includes selection effects; the game uses the softer 0.6–0.9.)
// prefersSolo: archetype preference −1 (wants co-founding teams) … +1 (likes solo founders).
export function soloModifier({ solo, execution, traction, prefersSolo = 0 }) {
  if (!solo) return 1;
  // Review F5: the penalty shrinks with real traction or visible velocity (angels-and-landscape-2026 §2.7).
  const m = traction >= 3.5 || execution >= 4 ? 0.9 : traction >= 3 || execution >= 3 ? 0.75 : 0.6;
  const p = typeof prefersSolo === 'number' ? prefersSolo : prefersSolo ? 0.5 : 0;
  return clamp(m + 0.15 * p, 0.45, 1);
}

// meeting performance factor from the judged pitch meeting (1–5 → 0.6–1.4)
export const meetingFactor = (perf) => clamp(0.6 + 0.2 * ((perf ?? 3) - 1), 0.5, 1.5);

export const pPartner = ({ S, solo = 1, meeting = 1 }) => clamp(clamp(0.10 + 0.12 * (S - 2.5), 0.03, 0.5) * solo * meeting, 0.01, 0.7);
export const pTermSheet = ({ S, heat = 1, meeting = 1, traction = 3 }) => clamp(clamp(0.15 + 0.15 * (S - 3) + 0.08 * (traction - 3), 0.02, 0.65) * heat * meeting, 0.01, 0.8);
// Angels/syndicates decide after one meeting, no partnership. [D]
export const pAngelCommit = ({ S, solo = 1, meeting = 1 }) => clamp(clamp(0.12 + 0.12 * (S - 2.5), 0.03, 0.45) * solo * meeting, 0.01, 0.6);

// Market heat 0.7–1.2: Carta finds Apr–Jun the best closing months; holidays are slow. [D]
export function marketHeat(month, landscapeHeat = null) {
  const seasonal = [3, 4, 5].includes(month) ? 1.1 : [7, 11].includes(month) ? 0.85 : 1.0;
  return clamp(seasonal * (Number.isFinite(landscapeHeat) ? landscapeHeat : 1), 0.7, 1.2);
}

// Hard gates (§7.4): no term sheet regardless of S.
export function hardGate(stage, m, { S, founderFit }) {
  if (stage === 'series-a') {
    if ((m.arr ?? 0) < 1e6) return 'Series A requires at least $1M ARR.';
    if ((m.yoyGrowth ?? 0) < 1) return 'Series A requires at least 2x year-over-year growth.';
  }
  if (stage === 'seed' && (m.mrr ?? 0) < 5000 && !(S >= 4 && founderFit >= 4)) return 'Seed requires $5K+ MRR (or an exceptional founder with S ≥ 4.0 and founder fit ≥ 4).';
  return null;
}

/**
 * Terms for a term sheet. rand: () => [0,1) (seeded). Returns { stage, instrument, postMoney, preMoney, amount,
 * dilution, poolTargetPost, multiplier }. Multiplier = exp(0.45·(S−3)) × 1.15 per competing term sheet (max ×1.6)
 * × AI premium, clamped to the stage's p25–p90 spread. Pre-seed caps use the Carta cap-by-round-size table.
 */
export function stageMultiplier(stage, S, { competing = 0, isAI = false } = {}) {
  const [lo, hi] = MULT_CLAMP[stage];
  return clamp(scoreMultiplier(S) * Math.min(1.6, Math.pow(1.15, competing)) * (isAI ? AI_PREMIUM : 1), lo, hi);
}
export function computeTerms({ stage, S, competing = 0, isAI = false, rand = () => 0.5, roundSize = null }) {
  const mult = stageMultiplier(stage, S, { competing, isAI });
  const [rlo, rhi] = ROUND_SIZE[stage];
  const step = (x, st) => Math.round(x / st) * st;
  const pool = POOL_TARGET[stage];
  if (stage === 'pre-seed') {
    let amount = clamp(roundSize ?? 600e3 * Math.pow(mult, 0.8) * (0.7 + 0.6 * rand()), rlo, rhi);
    const band = safeCapBand(amount);
    const post = clamp(band.median * mult * (0.9 + 0.2 * rand()), band.p25 * 0.8, band.p90);
    amount = step(amount, 25e3);
    return { stage, instrument: 'safe', postMoney: step(post, 250e3), preMoney: step(post, 250e3) - amount, amount, dilution: amount / post, poolTargetPost: 0, multiplier: +mult.toFixed(2) };
  }
  const [blo, bhi] = BASE_POST[stage];
  let post = (blo + (bhi - blo) * rand()) * (MEDIAN_POST[stage] / ((blo + bhi) / 2)) * mult;
  const [dlo, dhi] = DILUTION[stage];
  let d = dlo + (dhi - dlo) * rand();
  let amount = clamp(post * d, rlo, rhi);
  d = amount / post;
  if (d < 0.12 || d > 0.25) { d = clamp(d, 0.12, 0.25); post = amount / d; }
  post = step(post, 500e3);
  amount = step(amount, 100e3);
  return {
    stage, instrument: 'priced', postMoney: post, preMoney: post - amount, amount, dilution: amount / post,
    poolTargetPost: pool ? +(pool[0] + (pool[1] - pool[0]) * rand()).toFixed(3) : 0,
    multiplier: +mult.toFixed(2),
  };
}

// Display band for the evaluation screen.
export function suggestedBand(stage, S, isAI = false) {
  const mult = stageMultiplier(stage, S, { isAI });
  const [rlo, rhi] = ROUND_SIZE[stage], [dlo, dhi] = DILUTION[stage];
  if (stage === 'pre-seed') {
    const roundLo = clamp(400e3 * Math.pow(mult, 0.8), rlo, rhi), roundHi = clamp(900e3 * Math.pow(mult, 0.8), rlo, rhi);
    return { postLo: safeCapBand(roundLo).median * mult * 0.9, postHi: safeCapBand(roundHi).median * mult * 1.1, roundLo, roundHi, mult };
  }
  const [lo, hi] = BASE_POST[stage];
  const k = MEDIAN_POST[stage] / ((lo + hi) / 2);
  const postLo = lo * k * mult, postHi = hi * k * mult;
  return { postLo, postHi, roundLo: clamp(postLo * dlo, rlo, rhi), roundHi: clamp(postHi * dhi, rlo, rhi), mult };
}

// Recompute an evaluation's weighted score for another stage (criteria averages).
export const rescore = (criteria, stage) => weightedScore(Object.fromEntries(CRITERIA_KEYS.map((k) => [k, criteria[k]?.avg ?? 3])), stage);

// Decision delays in days. Archetype decisionDays when given; solo founders run slower (research: 6–12 months vs 3–6). [D]
export function delayDays(inv, kind, rand, solo = false) {
  const def = { reply: [2, 10], intro: [2, 7], afterFirst: [5, 14], afterPartner: [7, 21], diligence: [14, 35] }[kind] ?? [3, 10];
  let [a, b] = def;
  if (kind !== 'reply' && kind !== 'intro' && inv.decisionDaysMin != null) { a = inv.decisionDaysMin; b = Math.max(a, inv.decisionDaysMax ?? a + 7); if (kind === 'diligence') { a *= 1.5; b *= 1.5; } }
  return Math.round((a + (b - a) * rand()) * (solo && kind !== 'reply' ? 1.25 : 1));
}
