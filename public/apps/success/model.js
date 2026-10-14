// Customer success: pure logic for account health, renewal acceptance, expansion and enterprise procurement
// asks. Numbers: docs/research/world-ops-support-life.md §7 + §8 and public/data/world.js OTHER_SYSTEMS.
import { clamp, hash } from '../../core/util.js';
import { OTHER_SYSTEMS } from '../../data/world.js';

const R = OTHER_SYSTEMS.renewals;
const SEC = OTHER_SYSTEMS.securityReviews;
const A11Y = OTHER_SYSTEMS.accessibility;
const L10N = OTHER_SYSTEMS.localization;

export const CS = {
  renewalWindows: [90, 60, 30], // renewal pipeline checkpoints before an annual renewal (R.noticeDays = 90)
  upliftTypical: R.upliftTypical, // 5–10% uplifts common
  negotiatedDiscount: R.negotiatedDiscount, // 15–20% average negotiated discounts (CostBench, vendor data)
  acceptLow: R.acceptanceAtUpTo7pct, // 70–90% accept ≤7% uplift
  acceptHigh: R.acceptanceAt15pctPlus, // 50–70% accept ≥15%
  qbrAboveAcv: R.qbrAboveACV, // QBR every quarter above $10k ACV
  qbrPrepHours: R.qbrPrepHours, // 2–4 h prep
  questionnaireFirst: SEC.firstTimeHours, // 20–40 h first manual questionnaire
  questionnaireLibrary: SEC.withLibraryHours, // 2–8 h with an answer library
  acceptStandardShare: SEC.acceptStandardShare, // 74% accept a pre-completed standard (SOC 2 / CAIQ)
  a11yRequestsPerYear: A11Y.requestsPerYearUpmarket, // 0.5–2 a year once selling up-market
  a11yRemediationHours: A11Y.remediationHours, // 20–80 h
  eaaDate: A11Y.eaaApplies, // European Accessibility Act service obligations from 2025-06-28
  translationHours: L10N.translationHoursPerLanguage, // 10–40 h per language
  // [design] game estimates (no reliable public benchmark):
  championTurnoverPerYear: 0.2, // champion changes job / role
  residencyRequestsPerYear: 0.4, // EU data-residency asks per international enterprise account
  localizationRequestsPerYear: 0.3, // per international account
  expansionChancePerMonth: { smb: 0.03, ent: 0.06 }, // a healthy account surfaces an expansion need
  questionnaireAtRenewal: 0.5, // enterprise customers re-assess vendors at renewal
  euRegionMonthly: 150, // extra hosting for an EU region
  euRegionHours: 40,
  vpatAuditCost: 4000, // third-party ACR/VPAT audit
};

const u01 = (s) => (parseInt(hash(s), 36) % 100000) / 100000;

/** Hours for a security questionnaire given what you already have. */
export function questionnaireHours({ soc2 = false, library = false, seed = '' }) {
  const r = u01(`q${seed}`);
  if (soc2) return library ? 1 : 2; // SOC 2 + trust center: most buyers accept the report (74% accept a standard)
  const [lo, hi] = library ? CS.questionnaireLibrary : CS.questionnaireFirst;
  return Math.round(lo + (hi - lo) * r);
}

/**
 * Account health 0..100 (Gainsight/Vitally-style). Inputs 0..1 unless noted.
 * usage: product usage proxy; champion: 'active'|'weak'|'left'|'none'; qbrDaysAgo: days since last QBR (null = never);
 * needsQbr: ACV above the QBR threshold; support: churn multiplier from the support desk (1 = fine);
 * openAsks: overdue procurement requests; touchDaysAgo: days since you last talked to them;
 * plan: success plan status 'on_track' | 'achieved' | 'missed' | 'none' (a written metric + target + date).
 */
export function healthScore({ usage = 0.5, champion = 'active', qbrDaysAgo = null, needsQbr = false, support = 1, openAsks = 0, touchDaysAgo = 30, plan = 'none' }) {
  const champ = { active: 1, weak: 0.6, none: 0.35, left: 0.1 }[champion] ?? 0.5;
  const qbr = !needsQbr ? 0.8 : qbrDaysAgo == null ? 0.35 : qbrDaysAgo <= 100 ? 1 : qbrDaysAgo <= 200 ? 0.6 : 0.3;
  const sup = clamp(1.6 - support, 0, 1); // churnMult 0.95 → ~0.65+, 1.4 → 0.2
  const touch = touchDaysAgo <= 45 ? 1 : touchDaysAgo <= 120 ? 0.7 : 0.4;
  const asks = clamp(1 - 0.35 * openAsks, 0, 1);
  const pl = { on_track: 1, achieved: 1, missed: 0.35, none: 0.5 }[plan] ?? 0.5; // [design] operator-tiers audit item 12
  return Math.round(100 * clamp(0.36 * usage + 0.19 * champ + 0.11 * qbr + 0.11 * sup + 0.07 * touch + 0.07 * asks + 0.09 * pl, 0, 1));
}

export const healthBand = (h) => (h >= 70 ? 'healthy' : h >= 45 ? 'watch' : 'at risk');

/**
 * Churn multiplier fed to core (sub.csChurnMult): health 60 = baseline, 85 ≈ 0.6x, 35 ≈ 1.6x, capped 0.6-1.8x.
 * Trimmed from 0.4-2.5x (operator-tiers audit 3.2): a 3x spread on ~10% annual churn gives GRR ~94% vs ~82%,
 * in line with top- vs bottom-quartile retention (SaaS Capital 2025 NRR 111 vs 97 at $25-50k ACV) [design].
 */
export const churnMultFromHealth = (h) => clamp(Math.pow(2, (60 - h) / 35), 0.6, 1.8);

/** Early-start bonus on renewal acceptance by how many days before the renewal date YOU started it [design]. */
export function renewalTimingBonus(startedLeft) {
  if (startedLeft == null) return 0;
  return startedLeft >= 90 ? 0.06 : startedLeft >= 60 ? 0.03 : startedLeft >= 30 ? 0 : -0.04;
}

const GENERIC_METRIC = /^(value|success|adoption|engagement|happiness|roi|usage|results?|growth|efficiency)$/i;
/**
 * A success plan must be a specific outcome the customer cares about with a number and a date (stellar: agreed in
 * writing in the first 30 days). Returns { valid, issues }.
 */
export function validateSuccessPlan({ metric = '', target = '', dueDays = 0 }) {
  const issues = [];
  const m = String(metric).trim();
  if (m.split(/\s+/).filter(Boolean).length < 3 || GENERIC_METRIC.test(m)) issues.push('Name the outcome in their words (e.g. "month-end close time for the finance team"), not "value" or "adoption".');
  if (!/\d/.test(String(target))) issues.push('Give a number (from what to what).');
  if (!(dueDays >= 14 && dueDays <= 200)) issues.push('Give a date 2 weeks to 6 months out.');
  return { valid: issues.length === 0, issues };
}

/** Tier read from gross / net revenue retention (data/operator-tiers.js customer_success grrPct bands). */
export function retentionTier(grr) {
  if (grr == null) return 'unknown';
  return grr >= 0.92 ? 'stellar' : grr >= 0.88 ? 'good' : grr >= 0.84 ? 'average' : 'mediocre';
}

/** Usage proxy for an account: product fit, open bugs, a stable per-account offset and seats bought. */
export function usageProxy({ productFit = 0.3, bugHours = 0, seed = '', drift = 0 }) {
  const noise = (u01(`use${seed}`) - 0.5) * 0.3;
  const bugPenalty = Math.min(0.3, bugHours / 200);
  return clamp(0.25 + 0.7 * (productFit ?? 0.3) + noise + drift - bugPenalty, 0, 1);
}

/**
 * Probability the customer accepts renewal terms (uplift and discount as fractions, years 1–3).
 * Calibrated so typical accounts land near SaaS Capital 2025 medians (GRR ~91%, NRR ~101%): health scales
 * 0.7–1.2× and acceptance is capped at 92%. callScore (−0.05…+0.08) comes from what you said on the call.
 */
export function renewalAcceptance({ upliftPct = 0, discountPct = 0, years = 1, health = 60, switchingCost = 0.5, callScore = 0 }) {
  const net = upliftPct - discountPct;
  const lo = (CS.acceptLow[0] + CS.acceptLow[1]) / 2; // ~0.8 at ≤7%
  const hi = (CS.acceptHigh[0] + CS.acceptHigh[1]) / 2; // ~0.6 at ≥15%
  let p = net <= 0 ? 0.9 : net <= 0.07 ? lerp(0.9, lo, net / 0.07) : net <= 0.15 ? lerp(lo, hi, (net - 0.07) / 0.08) : hi - (net - 0.15) * 2;
  p *= 0.7 + 0.5 * (health / 100);
  p *= 0.9 + 0.2 * switchingCost;
  if (years > 1) p *= discountPct >= 0.03 ? 1.03 : 0.85; // multi-year needs a sweetener
  return clamp(p + callScore, 0.03, 0.92);
}

const VALUE_RE = /\b(saved|save|hours?|results?|roi|usage|used|adoption|reduced|cut|faster|errors?|since you started|last (quarter|year))\b/i;
const NUM_RE = /\d/;
const MULTI_RE = /\b(two|three|2|3)[- ]?year|multi[- ]?year|lock (in|the price)\b/i;
/** Renewal-call content: value recap, real usage numbers, a multi-year ask, asking about their plans. */
export function renewalCallScore(transcript = []) {
  const me = transcript.filter((t) => t.from === 'me');
  if (me.length < 2) return -0.05; // joined and said nothing
  let s = 0;
  if (me.some((t) => VALUE_RE.test(t.text))) s += 0.03;
  if (me.some((t) => VALUE_RE.test(t.text) && NUM_RE.test(t.text))) s += 0.02;
  if (me.some((t) => MULTI_RE.test(t.text))) s += 0.015;
  if (me.some((t) => /\?/.test(t.text) && /\b(next year|plans?|priorit|team|grow)\b/i.test(t.text))) s += 0.015;
  return clamp(s, -0.05, 0.08);
}
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

/** What a customer asks for before signing: procurement typically pushes for a 15–20% discount. */
export function counterAsk({ upliftPct, health, seed = '' }) {
  const r = u01(`ask${seed}`);
  if (upliftPct <= 0.03 && health >= 70) return { discountPct: 0, upliftPct, text: 'fine as proposed' };
  const disc = CS.negotiatedDiscount[0] + (CS.negotiatedDiscount[1] - CS.negotiatedDiscount[0]) * r;
  if (upliftPct > 0.07) return { discountPct: 0, upliftPct: Math.min(0.05, upliftPct), text: 'cap the increase at 5%' };
  return { discountPct: +(health < 50 ? disc : disc / 2).toFixed(2), upliftPct: 0, text: 'flat renewal with a discount' };
}

/** Expansion: will a pitched seat increase land? */
export function expansionAcceptance({ health = 60, hasOpportunity = false, seatsAdded = 1, seats = 1, employees = Infinity }) {
  if (seats + seatsAdded > employees) return 0; // nobody buys seats for people they don't have
  const ratio = seatsAdded / Math.max(1, seats);
  return clamp((hasOpportunity ? 0.35 : 0.05) * (0.4 + health / 80) * (ratio > 0.5 ? 0.6 : 1), 0.01, 0.6);
}

/** Effect of an unresolved procurement ask on win/renewal odds. */
export const ASK_EFFECT = { security_questionnaire: 0.6, vpat: 0.8, data_residency: 0.75, localization: 0.85 };

export const ASK_LABEL = {
  security_questionnaire: 'Security questionnaire (SIG Lite / CAIQ)',
  vpat: 'Accessibility conformance report (VPAT/ACR, WCAG 2.1 AA)',
  data_residency: 'EU data residency',
  localization: 'Localized UI and invoices',
};
