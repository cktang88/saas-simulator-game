// AI cost + perks: shared state slices, a dedicated seeded stream (so the main rng(state) sequence, and every existing
// seeded test, is untouched), small statistics helpers and the mistake adapter. Imports no UI.

import { ensure, addDayHours } from '../../core/state.js';
import { hash, round2 } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';

// ---- statistics ----
export function erf(x) { // Abramowitz-Stegun 7.1.26
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
/** Inverse normal CDF (Acklam-style rational approximation, adequate for sampling). */
export function PhiInv(p) {
  p = Math.min(1 - 1e-9, Math.max(1e-9, p));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  let q, r;
  if (p < lo) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** Stable uniform in (0,1) from a string. */
export function hashU(str) {
  let h = parseInt(hash(String(str)), 36) | 0; // FNV-1a then a murmur3 finaliser so near-identical ids spread evenly
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return ((h >>> 0) + 0.5) / 4294967297;
}
/** Stable standard normal from a string (per engineer, per customer...). */
export const zOf = (str) => PhiInv(hashU(str));

// Mean-1 log-normal usage multiplier X (mu = -sigma^2/2). E[min(X, c)] and the share of users above c.
export const meanCapped = (sigma, c) => {
  if (c == null || !Number.isFinite(c)) return 1;
  if (c <= 0) return 0;
  const mu = -(sigma * sigma) / 2;
  return Phi((Math.log(c) - mu - sigma * sigma) / sigma) + c * (1 - Phi((Math.log(c) - mu) / sigma));
};
export const shareAbove = (sigma, c) => (c == null ? 0 : 1 - Phi((Math.log(Math.max(1e-9, c)) + (sigma * sigma) / 2) / sigma));
/** E[(c*X - r)+] for mean-1 log-normal X: the average monthly loss per user whose cost c*X exceeds revenue r. */
export function underwater(sigma, c, r) {
  if (c <= 0) return 0;
  if (r <= 0) return c;
  const K = r / c;
  const d2 = (-Math.log(K) - (sigma * sigma) / 2) / sigma;
  const d1 = d2 + sigma;
  return c * (Phi(d1) - K * Phi(d2));
}

// ---- dedicated deterministic stream ----
export function aiRng(state, slice = aiSlice(state)) {
  let t = (slice.rs = (slice.rs + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const aiChance = (state, p) => aiRng(state) < p;

// ---- slices ----
export function aiSlice(state) {
  const s = ensure(state, 'aicost', () => ({ rs: (hash(`aicost|${state.seed ?? 0}|${state.company?.name ?? ''}`).split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)) }));
  s.rs ??= 1;
  s.coding ??= {};
  const c = s.coding;
  c.policy ??= 'shadow'; c.seats ??= {}; c.overage ??= 'api'; c.capUsd ??= null; c.alerts ??= false; c.keyMode ??= 'shared';
  c.hardLimit ??= false; c.provider ??= 'anthropic'; c.audits ??= 0; c.limited ??= 0; c.hist ??= []; c.incidents ??= []; c.month ??= null;
  s.inf ??= {};
  const i = s.inf;
  i.provider ??= 'anthropic'; i.features ??= {}; i.routing ??= { enabled: false, tuned: false, share: 0.6 };
  i.freeTier ??= { enabled: false, capReqs: null, abuseGuard: false, model: 'same' };
  i.limits ??= { perUserMult: null, agentTokenCap: false };
  i.pricing ??= { mode: 'absorb', includedUsd: 5, addonPrice: 15, markup: 1.4 };
  i.budget ??= { usd: null, alerts: false };
  i.evals ??= []; i.swaps ??= []; i.deprecations ??= []; i.hist ??= []; i.mtd ??= { month: null, usd: 0, byFeature: {}, byModel: {}, extra: 0, free: 0 };
  i.quality ??= 1; i.providerSince ??= null; i.providerMoves ??= 0; i.usd30 ??= [];
  s.events ??= []; s.eventSeq ??= 0;
  s.stats ??= { mistakes: 0, runawayCaught: 0, leaks: 0 };
  return s;
}

export function perksSlice(state) {
  const s = ensure(state, 'perks', () => ({}));
  s.applications ??= []; s.credits ??= []; s.hist ??= []; s.usage ??= {}; s.flags ??= {}; s.cloud ??= {};
  s.appSeq ??= 0; s.events ??= []; s.eventSeq ??= 0;
  s.rseed ??= (hash(`perks|${state.seed ?? 0}|${state.company?.name ?? ''}`).split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 11));
  const c = s.cloud;
  c.provider ??= 'default'; c.footprint ??= 'standard'; c.sinceDay ??= null; c.moves ??= 0; c.lastBill ??= 0; c.oversizedSince ??= null;
  return s;
}

/** Push an automation event with a stable id. Capped. */
export function pushEvent(slice, state, type, data = {}) {
  slice.events.push({ id: `${type}:${++slice.eventSeq}`, type, day: state.day, ...data });
  if (slice.events.length > 300) slice.events.splice(0, slice.events.length - 300);
}

/** Log a mistake on the shared ledger with a local trace count. */
export function aiMistake(state, m) {
  const e = logMistake(state, { app: 'product', ...m });
  if (e) aiSlice(state).stats.mistakes++;
  return e;
}
/** Unplanned founder work an incident forces (key rotation, an emergency migration): charged in full, on today's hours
 *  and in the time log so the Scorecard can trace it (a bare hoursUsed bump was invisible). */
export function forceHours(state, hours, label) {
  const f = state.founder;
  f.hoursUsed = (f.hoursUsed ?? 0) + hours;
  addDayHours(state, hours);
  (f.timeLog ??= []).push({ day: state.day, hours, label });
}
export const usd0 = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
export { round2 };
