// Launch playbook state slice (state.apps.consumer) and its dedicated seeded random stream, so the main rng(state)
// sequence (and every existing seeded test) is untouched until the player starts a mobile app.

import { ensure } from '../../core/state.js';
import { hash, clamp, uid, round2 } from '../../core/util.js';
import { b2cCategoryOf } from '../../core/churn.js';
import { SATURATION, PAYWALL } from './params.js';

export function ensureConsumer(state) {
  const C = ensure(state, 'consumer', () => ({}));
  C.rs ??= parseInt(hash(`${state.seed}|consumer|${state.company?.name ?? ''}`), 36) | 0;
  C.app ??= {
    stack: null, stackDay: null, hoursDone: 0, built: false, builtDay: null, withAgent: false,
    apple: { enrolled: false, day: null, yearDay: null, sbp: false }, google: { enrolled: false },
    eas: { plan: 'free', recId: null, month: null, ios: 0, android: 0, extraUsd: 0 },
    beta: { rounds: 0, day: null, fixed: 0 },
    listing: { differentiation: '', category: null, privacyUrl: false, privacyLabel: false, competitors: '' },
    pending: null, status: 'none', live: { ios: false, play: false }, liveDay: null, history: [],
    stats: { submissions: 0, rejections: 0, byGuideline: {} },
  };
  C.monet ??= {
    mode: 'iap', tooling: 'none', toolingId: null, enrolledSbp: false,
    paywall: {
      type: 'hard_no_trial', trialDays: 3, plans: { weekly: { on: true, price: PAYWALL.defaultPrices.weekly }, monthly: { on: false, price: PAYWALL.defaultPrices.monthly }, annual: { on: true, price: PAYWALL.defaultPrices.annual } },
      default: 'annual', dark: {}, copy: { headline: '', price: '', renewal: '', trial: '', cancel: '', legal: '' }, disclosure: null, quiz: null,
    },
    tests: [], proceeds: { year: null, prior: 0, ytd: 0 }, webRevenueMonth: 0, ruling: null, rosca: { checkedMonth: null },
    stats: { refunds: 0, firstCharges: 0, revenue: 0, fees: 0 }, refundWatch: { month: null, charges: 0, refunds: 0 },
  };
  C.creators ??= { sub: 'none', subId: null, briefs: [], posts: [], roster: [], strikes: [], penaltyUntil: -1, audits: 0, promoted: [], hooksTested: [], seq: 0, ftc: 0 };
  C.clipping ??= { campaigns: [], strikes: [], schedule: null, seq: 0 };
  C.paid ??= { campaigns: [], reports: [], target: { d7Roas: 0.5, basis: 'net' }, seq: 0, daily: [] };
  C.funnel ??= { sources: {}, daily: [] };
  C.events ??= [];
  C.flags ??= {};
  return C;
}
export const peekConsumer = (state) => state?.apps?.consumer ?? null;

// ---- dedicated random stream ----
export function crand(state) {
  const C = ensureConsumer(state);
  let t = (C.rs = (C.rs + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const cchance = (state, p) => crand(state) < p;
export function cnormal(state) {
  const u = Math.max(1e-9, crand(state)), v = crand(state);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export const lognormal = (state, median, sigma) => median * Math.exp(sigma * cnormal(state));
export const cpick = (state, arr) => arr[Math.floor(crand(state) * arr.length) % arr.length];
/** Binomial draw: exact for small n, normal approximation for large n. */
export function binomial(state, n, p) {
  n = Math.max(0, Math.floor(n)); p = clamp(p, 0, 1);
  if (!n || p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 40) { let k = 0; for (let i = 0; i < n; i++) if (crand(state) < p) k++; return k; }
  const mean = n * p, sd = Math.sqrt(n * p * (1 - p));
  return clamp(Math.round(mean + sd * cnormal(state)), 0, n);
}
export function samplePoisson(state, mean) {
  if (!(mean > 0)) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * cnormal(state)));
  const L = Math.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= crand(state); } while (p > L);
  return k - 1;
}

// ---- saturation: many apps run the same playbook ----
export function saturation(state, day = state.day) {
  const cat = b2cCategoryOf(state);
  const base = SATURATION.base[cat] ?? SATURATION.base.default;
  return clamp(base + SATURATION.driftPerDay * Math.max(0, day), 0, SATURATION.max);
}

export function pushEvent(state, type, payload = {}) {
  const C = ensureConsumer(state);
  const e = { id: `${type}:${uid('ce')}`, type, day: state.day, ...payload };
  C.events.push(e);
  if (C.events.length > 300) C.events.splice(0, C.events.length - 300);
  return e;
}

export const usd = (n) => `$${Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : round2(n).toFixed(2)}`;
