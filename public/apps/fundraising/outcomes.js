// Mapping evaluation + traction → investor funnel odds and round terms (docs/research/fundraising.md §7).
// Every formula here is a [D] game-design choice calibrated to the sourced ranges in that file. Pure.

import { clamp } from '../../core/util.js';
import { weightedScore, CRITERIA_KEYS } from './rubric.js';

// Base post-money bands by stage (US, non-AI). §7.3 [D] from Carta/PitchBook medians in §1.
export const BASE_POST = {
  'pre-seed': [8e6, 12e6], // post-money SAFE cap
  seed: [16e6, 24e6],
  'series-a': [55e6, 80e6],
};
export const ROUND_SIZE = { 'pre-seed': [250e3, 2.5e6], seed: [2e6, 5e6], 'series-a': [8e6, 20e6] };
export const DILUTION = { 'pre-seed': [0.07, 0.12], seed: [0.15, 0.22], 'series-a': [0.15, 0.22] };
export const POOL_TARGET = { seed: [0.1, 0.15], 'series-a': [0.1, 0.12] }; // Carta 2026: median seed pool 12.1%

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
    f *= 0.85 + Math.min(0.35, hits * 0.12);
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
  if (warm) return inv.warmMeetingRate ?? 0.35;
  return inv.coldReplyRate != null ? inv.coldReplyRate * 0.5 : 0.02;
}

// p(first meeting) per investor pitched. Research formula uses (0.6 + 0.2·(S−3)); we use a slightly
// higher slope/intercept so the stated calibration target (median S≈3.2 founder, 60–80 pitched, mixed
// warm/cold → 15–25 first meetings) is actually met (see test/fundraising.test.js). channel = email/blurb quality 0.6–1.5.
export function pMeeting({ inv, S, warm, channel = 1, fit = 1, traction = 1, stale = false }) {
  const scoreMult = clamp(0.85 + 0.3 * (S - 3), 0.25, 1.6);
  return clamp(baseMeetingRate(inv, warm) * scoreMult * channel * fit * traction * (stale ? 0.7 : 1), 0.001, 0.8);
}

// Solo-founder modifier (research §7.2): ×0.6 on p_partner unless execution ≥ 4 and traction ≥ 3 → ×0.9.
// (The raw Carta-implied 0.38x includes selection effects; the game uses the softer 0.6–0.9.)
// prefersSolo: archetype preference −1 (wants co-founding teams) … +1 (likes solo founders).
export function soloModifier({ solo, execution, traction, prefersSolo = 0 }) {
  if (!solo) return 1;
  const m = execution >= 4 && traction >= 3 ? 0.9 : 0.6;
  const p = typeof prefersSolo === 'number' ? prefersSolo : prefersSolo ? 0.5 : 0;
  return clamp(m + 0.25 * p, 0.4, 1);
}

// meeting performance factor from the judged pitch meeting (1–5 → 0.6–1.4)
export const meetingFactor = (perf) => clamp(0.6 + 0.2 * ((perf ?? 3) - 1), 0.5, 1.5);

export const pPartner = ({ S, solo = 1, meeting = 1 }) => clamp(clamp(0.10 + 0.12 * (S - 2.5), 0.03, 0.5) * solo * meeting, 0.01, 0.7);
export const pTermSheet = ({ S, heat = 1, meeting = 1 }) => clamp(clamp(0.15 + 0.15 * (S - 3), 0.02, 0.6) * heat * meeting, 0.01, 0.75);
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
 * dilution, poolTargetPost, multiplier }. Multiplier = 0.6 + 0.35·(S−1); ×1.15 per competing term sheet
 * (max ×1.6); AI-native ×1.15; capped at 4× base (top decile ≈ 4× median).
 */
export function computeTerms({ stage, S, competing = 0, isAI = false, rand = () => 0.5 }) {
  const [lo, hi] = BASE_POST[stage];
  const base = lo + (hi - lo) * rand();
  const mult = Math.min(4, (0.6 + 0.35 * (S - 1)) * Math.min(1.6, Math.pow(1.15, competing)) * (isAI ? 1.15 : 1));
  let post = base * mult;
  const [dlo, dhi] = DILUTION[stage];
  const [rlo, rhi] = ROUND_SIZE[stage];
  let d = dlo + (dhi - dlo) * rand();
  let amount = clamp(post * d, rlo, rhi);
  d = amount / post;
  // Re-fit if dilution falls outside the band (§7.3: "re-roll if it falls outside").
  if (stage !== 'pre-seed' && (d < 0.15 || d > 0.25)) { d = clamp(d, 0.15, 0.25); post = amount / d; }
  const round = (x, step) => Math.round(x / step) * step;
  post = round(post, stage === 'pre-seed' ? 250e3 : 500e3);
  amount = round(amount, stage === 'pre-seed' ? 25e3 : 100e3);
  const pool = POOL_TARGET[stage];
  return {
    stage,
    instrument: stage === 'pre-seed' ? 'safe' : 'priced',
    postMoney: post,
    preMoney: post - amount,
    amount,
    dilution: amount / post,
    poolTargetPost: pool ? +(pool[0] + (pool[1] - pool[0]) * rand()).toFixed(3) : 0,
    multiplier: +mult.toFixed(2),
  };
}

// Display band for the evaluation screen.
export function suggestedBand(stage, S, isAI = false) {
  const mult = Math.min(4, (0.6 + 0.35 * (S - 1)) * (isAI ? 1.15 : 1));
  const [lo, hi] = BASE_POST[stage], [rlo, rhi] = ROUND_SIZE[stage], [dlo, dhi] = DILUTION[stage];
  const postLo = lo * mult, postHi = hi * mult;
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
