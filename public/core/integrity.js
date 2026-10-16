// Integrity: the real-world checks that stop people getting away with lying (docs/research/verification/*).
// A misstatement is not punished when it is told. It is RECORDED with the truth at that moment, can pass early
// (people mostly take numbers at face value), and is caught later by a verification event whose odds depend on how
// big the lie is and how strong the check is (pitch smell test < angel < confirmatory diligence < audit / QoE /
// lender data feeds). Getting caught costs the deal, reputation that spreads through that audience's network, and
// a traceable mistake; a lie that survives keeps a latent liability that later checks can still find.
//
// Pure-ish core module: no app imports. Callers pass the ground-truth metrics object (e.g. computeMetrics(state)).

import { rng, uid } from './util.js';
import { logMistake } from './operator.js';
import { notify } from './state.js';

// ---- Detection odds ----
// p(caught) = pMax · (1 − e^(−gap/k)), gap = relative overstatement (0.25 = 25% above the truth; booleans = 1).
// Anchors (money-deals.md §1–4, all [design] — nobody publishes "share of lies caught"): confirmatory diligence
// ≈30% at a 5–10% inflation, ≈80% at 25–50%, 95%+ at 2× or invented customers; pitch stage 3–35% by size; angels
// lower; audits, QoE and lender bank/Plaid feeds near-certain for material gaps.
export const CHECKS = {
  pitch: { pMax: 0.4, k: 0.5, label: 'pitch smell test' },
  angel: { pMax: 0.25, k: 0.6, label: 'angel check' },
  reference: { pMax: 0.7, k: 0.35, label: 'reference calls' },
  confirmatory: { pMax: 0.97, k: 0.2, label: 'confirmatory diligence (Stripe, bank and books access)' },
  audit: { pMax: 0.995, k: 0.08, label: 'audit / quality of earnings / lender data feed' },
};
// Rounding is not lying: within 5% (or a trivial absolute amount) of the truth counts as accurate [design].
export const TOLERANCE = { rel: 0.05, abs: { mrr: 500, customers: 2, growth: 0.02, nrr: 0.03, churn: 0.01, runway: 1 } };

export function detectP(gap, check) {
  const c = CHECKS[check] ?? CHECKS.pitch;
  if (!(gap > 0)) return 0;
  return c.pMax * (1 - Math.exp(-gap / c.k));
}

// ---- Claim extraction from free text ----
const NUM = '(\\d+(?:[.,]\\d+)?)\\s?(k|m|thousand|million)?';
const scale = (v, u) => parseFloat(String(v).replace(/,/g, '')) * (/^(k|thousand)$/i.test(u ?? '') ? 1e3 : /^(m|million)$/i.test(u ?? '') ? 1e6 : 1);
const GOAL_BEFORE = /\b(reach|reaches|reaching|will|would|could|target(ing)?|goal|plan(ning)?|forecast|projected|projecting|aim(ing)?|expect(ing)?|get(ting)? (us )?to|grow(ing)? to|path to|toward|towards|hit|by|next year|in \d+ months)\b[^.\n]{0,25}$/i;
const GOAL_AFTER = /^[^.\n]{0,12}\b(in|within|by)\s+(\d+\s+(months?|years?|quarters?)|q[1-4]|the next|next|20\d\d|end of)|^[^.\n]{0,6}\((goal|target|plan|projected)\)/i;
const PAST = /\b(previous|prior|former|last (company|startup|job|role)|at my|ex-|before (this|that|founding)|when i (was|led|ran))\b/i;

/** [{ metric, value, text }] — present-tense claims about this company. value units: mrr $/mo, customers count,
 *  growth/nrr/churn as fractions (0.15 = 15%), runway months. */
export function extractClaims(text) {
  const t = String(text ?? '');
  const out = [];
  const keep = (x) => {
    const before = t.slice(Math.max(0, x.index - 70), x.index), after = t.slice(x.index + x[0].length, x.index + x[0].length + 40);
    return !GOAL_BEFORE.test(before) && !GOAL_AFTER.test(after) && !PAST.test(before + x[0] + after);
  };
  const add = (metric, re, fn) => { for (const x of t.matchAll(re)) if (keep(x)) { const v = fn(x); if (Number.isFinite(v) && v >= 0) out.push({ metric, value: v, text: x[0].trim() }); } };
  // MRR / monthly revenue
  add('mrr', new RegExp(`\\$?\\s?${NUM}\\s*(?:in\\s+)?(?:mrr|monthly recurring revenue)\\b`, 'gi'), (x) => scale(x[1], x[2]));
  add('mrr', new RegExp(`\\bmrr\\b\\s*(?:of|is|at|:|=|—|-)?\\s*\\$?\\s?${NUM}`, 'gi'), (x) => scale(x[1], x[2]));
  add('mrr', new RegExp(`\\$\\s?${NUM}\\s*(?:/\\s?mo(?:nth)?\\b|per month|a month|monthly)(?:\\s+(?:in\\s+)?(?:recurring\\s+)?(?:revenue|rev))?`, 'gi'), (x) => scale(x[1], x[2]));
  add('mrr', new RegExp(`\\b(?:revenue|making|make|bring(?:ing)? in)\\s+(?:of\\s+)?\\$\\s?${NUM}\\s*(?:/\\s?mo|per month|a month|monthly)`, 'gi'), (x) => scale(x[1], x[2]));
  // ARR / annual run rate (→ monthly)
  add('mrr', new RegExp(`\\$?\\s?${NUM}\\s*(?:in\\s+)?(?:arr|annual(?:ized)? recurring revenue|(?:annual )?run[- ]rate)\\b`, 'gi'), (x) => scale(x[1], x[2]) / 12);
  add('mrr', new RegExp(`\\b(?:arr|annual run[- ]rate|run[- ]rate)\\b\\s*(?:of|is|at|:|=|—|-)?\\s*\\$?\\s?${NUM}`, 'gi'), (x) => scale(x[1], x[2]) / 12);
  // Customers
  add('customers', /(\d[\d,]*)\+?\s+(?:paying\s+|enterprise\s+|active\s+|b2b\s+)?(?:customers|clients|logos|accounts|teams|companies|businesses)\b(?!\s+(?:in|on) (?:our|the) (?:waitlist|pipeline))/gi, (x) => +x[1].replace(/,/g, ''));
  add('customers', /\b(?:customer base|customers?)\s+(?:of|:|=)\s*(\d[\d,]*)\+?/gi, (x) => +x[1].replace(/,/g, ''));
  // Growth (MoM), NRR, churn, runway
  add('growth', /(\d+(?:\.\d+)?)\s?%\s*(?:mom|m\/m|month[- ]over[- ]month|monthly growth|growth (?:per|a|each) month)/gi, (x) => +x[1] / 100);
  add('growth', /\bgrowing\s+(\d+(?:\.\d+)?)\s?%\s*(?:a|per|each|every)\s+month/gi, (x) => +x[1] / 100);
  add('nrr', /(\d+(?:\.\d+)?)\s?%\s*(?:nrr|ndr|net (?:revenue|dollar) retention)/gi, (x) => +x[1] / 100);
  add('nrr', /\b(?:nrr|ndr|net (?:revenue|dollar) retention)\b\s*(?:of|is|at|:)?\s*(\d+(?:\.\d+)?)\s?%/gi, (x) => +x[1] / 100);
  add('churn', /(\d+(?:\.\d+)?)\s?%\s*(?:monthly\s+)?(?:logo\s+|revenue\s+)?churn/gi, (x) => +x[1] / 100);
  add('churn', /\bchurn\b\s*(?:of|is|at|:|under|below)?\s*(\d+(?:\.\d+)?)\s?%/gi, (x) => +x[1] / 100);
  add('runway', /(\d+(?:\.\d+)?)\s*months?\s+(?:of\s+)?runway/gi, (x) => +x[1]);
  add('runway', /\brunway\b\s*(?:of|is|:)?\s*(\d+(?:\.\d+)?)\s*months?/gi, (x) => +x[1]);
  // Dedupe identical metric/value pairs
  const seen = new Set();
  return out.filter((c) => { const k = `${c.metric}:${Math.round(c.value * 1000)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Lies are in the flattering direction: more revenue, customers, growth, retention or runway; less churn.
const LOWER_IS_BETTER = new Set(['churn', 'burn']);
export function truthOf(m, metric) {
  if (!m) return null;
  switch (metric) {
    case 'mrr': return m.mrr ?? 0;
    case 'customers': return m.customers ?? 0;
    case 'growth': return m.momGrowth ?? 0;
    case 'nrr': return m.nrr ?? null; // claims like "120% NRR" are annual, as is computeMetrics().nrr
    case 'churn': return m.revenueChurn ?? null;
    case 'runway': return Number.isFinite(m.runwayMonths) ? m.runwayMonths : null;
    default: return null;
  }
}

/** Relative overstatement in the flattering direction; 0 when accurate within tolerance. */
export function claimGap(metric, claimed, truth) {
  if (truth == null || !Number.isFinite(claimed)) return 0;
  if (typeof claimed === 'boolean') return claimed && !truth ? 1 : 0;
  const abs = TOLERANCE.abs[metric] ?? 0;
  const diff = LOWER_IS_BETTER.has(metric) ? truth - claimed : claimed - truth;
  if (diff <= Math.max(abs, Math.abs(truth) * TOLERANCE.rel)) return 0;
  if (metric === 'nrr' || metric === 'growth' || metric === 'churn') return Math.min(3, diff / Math.max(0.05, Math.abs(truth) || 0.05));
  return Math.min(3, diff / Math.max(LOWER_IS_BETTER.has(metric) ? 0.01 : 1, Math.abs(truth) || (metric === 'mrr' ? 1000 : 1)));
}

// ---- Ledger ----
export function ensureIntegrity(state) {
  state.integrity ??= {};
  const I = state.integrity;
  I.claims ??= []; // { id, day, audience, recipientId, channel, metric, claimed, truth, gap, status: 'open'|'caught'|'survived', checks: [] }
  I.score ??= 1; // 1 = clean record; falls when lies are caught
  I.reputation ??= {}; // audience → 0..1 penalty spreading through that network (investors talk; buyers talk)
  I.incidents ??= [];
  return I;
}

/**
 * Record what a party was told. Returns the material misstatements (gap > 0). Accurate claims are recorded too,
 * so later checks can confirm them (and so a stale-but-true number is never treated as a lie).
 * audience: 'investor' | 'angel' | 'board' | 'lender' | 'acquirer' | 'customer' | 'candidate' | 'cofounder' | 'accelerator' | ...
 */
export function recordClaims(state, { audience, recipientId = null, channel = '', text = '', claims = null, truth }) {
  const I = ensureIntegrity(state);
  const list = claims ?? extractClaims(text);
  const out = [];
  for (const c of list) {
    const tv = typeof c.claimed === 'boolean' ? c.truth : truthOf(truth, c.metric);
    const claimed = c.claimed ?? c.value;
    const gap = c.gap ?? claimGap(c.metric, claimed, tv);
    const rec = { id: uid('clm'), day: state.day ?? 0, audience, recipientId, channel, metric: c.metric, claimed, truth: tv, gap: Math.round(gap * 1000) / 1000, text: c.text ?? '', status: gap > 0 ? 'open' : 'accurate', checks: [] };
    I.claims.push(rec);
    if (gap > 0) out.push(rec);
  }
  if (I.claims.length > 600) I.claims.splice(0, I.claims.length - 600);
  return out;
}

// metrics: optional list to restrict to (e.g. reference calls only test customer claims).
export const openLies = (state, { audience = null, recipientId = null, metrics = null } = {}) =>
  ensureIntegrity(state).claims.filter((c) => c.status === 'open' && (audience == null || c.audience === audience) && (recipientId == null || c.recipientId === recipientId) && (metrics == null || metrics.includes(c.metric)));

/**
 * A verification event. Rolls each open lie told to this audience/recipient against the check's strength.
 * Returns { caught: [...claims], survived: [...claims], maxGap }. Caught claims are marked; survivors stay open
 * (a later, stronger check can still find them) unless `final` (the last chance this party gets).
 */
export function verify(state, { audience = null, recipientId = null, metrics = null, check = 'confirmatory', final = false, roll = () => rng(state) } = {}) {
  const lies = openLies(state, { audience, recipientId, metrics });
  const caught = [], survived = [];
  for (const c of lies) {
    c.checks.push({ day: state.day ?? 0, check });
    if (roll() < detectP(c.gap, check)) { c.status = 'caught'; c.caughtDay = state.day ?? 0; c.caughtBy = check; caught.push(c); }
    else { if (final) c.status = 'survived'; survived.push(c); }
  }
  return { caught, survived, maxGap: caught.reduce((a, c) => Math.max(a, c.gap), 0) };
}

/**
 * Consequences of being caught: integrity score, reputation in that audience's network (other investors hear
 * about it), and a delayed, traceable mistake. Returns the severity 0..1.
 * weight (0..1, default 1) scales the score and reputation hit: a suspicion at a smell test (weight ~0.4) or an
 * honest definitional gap found and cured in diligence (~0.25) spreads less than proof of a lie [design].
 */
export function penalize(state, caught, { audience, functionId = 'general', id = 'misrepresentation', label = 'Misrepresented numbers', usd = 0, hours = 0, customers = 0, app = null, detail = '', weight = 1 } = {}) {
  if (!caught?.length) return 0;
  const I = ensureIntegrity(state);
  const sev = Math.min(1, caught.reduce((a, c) => Math.max(a, c.gap), 0) / 0.5); // a 50%+ overstatement is a full credibility failure [design]
  const w = Math.max(0, Math.min(1, weight));
  I.score = Math.max(0, I.score - (0.15 + 0.35 * sev) * w);
  I.reputation[audience] = Math.min(1, (I.reputation[audience] ?? 0) + (0.2 + 0.4 * sev) * w); // networks talk [design]
  I.incidents.push({ day: state.day ?? 0, audience, sev: Math.round(sev * 100) / 100, claims: caught.map((c) => c.id), id });
  const what = caught.map((c) => `${c.metric} ${fmtClaim(c.metric, c.claimed)} vs real ${fmtClaim(c.metric, c.truth)}`).join('; ');
  logMistake(state, { functionId, id, label, delayed: true, app, cost: { usd, hours, customers, reputation: Math.round((1 + 2 * sev) * w * 10) / 10 }, detail: `${detail ? `${detail} ` : ''}Caught: ${what}.` });
  notify(state, `${label}: ${what}.`, { type: 'bad', app });
  return sev;
}

/** 0..1 multiplier on how a fresh party in this audience treats you (1 = no stain). */
export const reputationMult = (state, audience) => 1 - 0.6 * (ensureIntegrity(state).reputation[audience] ?? 0);

export function fmtClaim(metric, v) {
  if (v == null) return 'unknown';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (metric === 'mrr') return `$${Math.round(v).toLocaleString('en-US')}/mo`;
  if (metric === 'growth' || metric === 'nrr' || metric === 'churn') return `${Math.round(v * 1000) / 10}%`;
  if (metric === 'runway') return `${Math.round(v * 10) / 10} months`;
  return String(Math.round(v * 100) / 100);
}
