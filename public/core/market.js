// The market: how real customers behave given what you've built, how you present it, and what you charge.
// "Fit" scores (0..1) come from LLM customer panels run in the tools (landing page review, product trials,
// customer calls). Baseline rates come from core/params.js. This module is pure.

import { MARKET, ONBOARDING } from './params.js';
import { clamp, pick, rng, hash } from './util.js';

export function ensureMarket(state) {
  state.market ??= {
    fit: {
      website: { score: null, notes: '', day: null, source: null }, // landing page clarity & persuasion
      product: { score: null, notes: '', day: null, source: null }, // do shipped features solve the ICP's problem
      price: { wtp: null, notes: '', day: null, source: null }, // panel's willingness to pay per month
    },
    onboarding: 'self', // 'self' | 'call' | 'concierge'
    cardRequired: true,
    brand: 0, // 0..100, grows with content, PR, word of mouth
    referrals: { enabled: false, reward: 0 },
    // Named multipliers apps can set without touching each other's code, e.g.
    // modifiers.churn['support-backlog'] = 1.3 (30% more churn) or modifiers.conversion['case-studies'] = 1.1.
    modifiers: { churn: {}, conversion: {}, landing: {} },
  };
  state.market.modifiers ??= { churn: {}, conversion: {}, landing: {} };
  return state.market;
}

export function setModifier(state, kind, key, value) {
  const m = ensureMarket(state).modifiers[kind];
  if (value == null || value === 1) delete m[key];
  else m[key] = value;
}
const modProduct = (state, kind) => Object.values(ensureMarket(state).modifiers[kind]).reduce((a, v) => a * v, 1);

export const cfg = (state) => MARKET[state.company.model];

// Hidden demand for THIS idea, drawn once per (game, idea): how many people actually have the problem badly
// enough to look for a fix. Log-normal (median 0.5, σ 1.2) [design], so most ideas have modest demand and a few
// have a lot: this is the main source of the outcome distribution's right tail (docs/review/calibration.md #1).
// Execution can't raise it; changing the idea (a pivot) re-draws it. Players never see the number directly.
export function marketDemand(state) {
  const m = ensureMarket(state);
  m.demandSeed ??= state.seed | 0;
  // Keyed on the idea's identity, not its wording: re-wording the one-liner or ICP keeps the same demand; only a
  // real pivot (state.company.pivots, bumped by Settings when the idea substantially changes) re-draws it.
  const key = `idea#${state.company.pivots ?? 0}`;
  if (m.demand == null || m.demandKey !== key) {
    // Two uniform draws from a hash of seed + idea → Box-Muller normal.
    const h1 = (parseInt(hash(`${m.demandSeed}:${key}:a`), 36) % 1e6 + 0.5) / 1e6;
    const h2 = (parseInt(hash(`${m.demandSeed}:${key}:b`), 36) % 1e6 + 0.5) / 1e6;
    const z = Math.sqrt(-2 * Math.log(h1)) * Math.cos(2 * Math.PI * h2);
    m.demand = clamp(Math.exp(Math.log(0.5) + 1.2 * z), 0.03, 12);
    m.demandKey = key;
  }
  // No idea stated yet (tests, setup in progress): neutral demand.
  if (!(state.company.oneLiner ?? '').trim()) return 1;
  return m.flags?.fixedDemand ?? m.demand;
}

// Price far below what buyers would pay is not free: B2B buyers read it as "not serious" and cheap customers
// are less committed (higher churn). Above-WTP pricing is already penalized by priceFactor.
function underpricing(state, plan = mainPlan(state)) {
  const c = cfg(state);
  const wtp = ensureMarket(state).fit.price.wtp ?? c.refPrice;
  const ratio = wtp / Math.max(0.5, monthlyPrice(plan));
  return ratio > 2 ? ratio / 2 : 1; // 1 = fine; 3 = priced at 1/6 of WTP
}

export function shippedFeatures(state) {
  return (state.apps.product?.features ?? []).filter((f) => f.status === 'shipped' && !f.system);
}
export const hasProduct = (state) => shippedFeatures(state).length > 0;

// Unjudged things default to mediocre; no website or product means nothing converts.
export function websiteFactor(state) {
  const m = ensureMarket(state);
  if (!state.company.website) return 0.15;
  const s = m.fit.website.score ?? 0.35;
  return 0.3 + 1.4 * s;
}
export function productFactor(state) {
  const m = ensureMarket(state);
  if (!hasProduct(state)) return 0;
  const s = m.fit.product.score ?? 0.3;
  return 0.4 + 1.0 * s; // 0.4 (poor fit) … 1.4 (excellent); unjudged = 0.7
}

export function mainPlan(state) {
  return state.plans.find((p) => p.active) ?? state.plans[0];
}
export function monthlyPrice(plan) {
  return plan.interval === 'year' ? plan.price / 12 : plan.price;
}

// Willingness to pay is stored per MONTH (refPrice and fit.price.wtp). An annual plan is compared with the
// annualized WTP net of the typical annual discount, so a $59.99/yr consumer plan is judged against
// ~$72/yr (12 × $9.99 × 0.6), not as a "$5/month" product.
export function annualWtp(state) {
  const c = cfg(state);
  const wtp = ensureMarket(state).fit.price.wtp ?? c.refPrice;
  return wtp * 12 * (1 - (c.annualDiscount ?? 0));
}

export function priceFactor(state, plan = mainPlan(state)) {
  const c = cfg(state);
  const wtp = ensureMarket(state).fit.price.wtp ?? c.refPrice;
  const ratio = plan.interval === 'year' ? annualWtp(state) / Math.max(6, plan.price) : wtp / Math.max(0.5, plan.price);
  return clamp(Math.pow(ratio, c.elasticity), 0.05, 2.5);
}

// Self-serve plan mix: when both a monthly and an annual plan are active, this share of new self-serve
// checkouts picks the annual plan (MARKET.*.annualShare, scaled by how the annual price compares).
export function annualPickShare(state, monthly, annual) {
  const c = cfg(state);
  const base = c.annualShare ?? 0.3;
  const rel = Math.pow(priceFactor(state, annual) / Math.max(0.05, priceFactor(state, monthly)), 1.5);
  return clamp(base * rel, 0.02, 0.95);
}

// Landing page visitor → trial/signup (or demo request for enterprise).
export function landingConversion(state, plan = mainPlan(state)) {
  const c = cfg(state);
  if (!hasProduct(state)) return 0;
  const m = ensureMarket(state);
  // Requiring a card up front cuts trial starts sharply (opt-out vs opt-in trials) [design ~0.45–0.5].
  const card = m.cardRequired && state.company.model !== 'ent' ? (state.company.model === 'smb' ? 0.45 : 0.5) : 1;
  const cheap = state.company.model === 'b2c' ? 1 : Math.pow(1 / underpricing(state, plan), 0.3);
  return clamp(c.trialStartRate * websiteFactor(state) * Math.sqrt(productFactor(state)) * Math.sqrt(priceFactor(state, plan)) * card * cheap * marketDemand(state) * modProduct(state, 'landing'), 0, 0.4);
}

// Probability a trial converts to paid.
export function trialConversion(state, plan = mainPlan(state)) {
  const c = cfg(state);
  const m = ensureMarket(state);
  const lengths = Object.keys(c.trialToPaid).map(Number).sort((a, b) => a - b);
  const len = lengths.reduce((best, l) => (Math.abs(l - plan.trialDays) < Math.abs(best - plan.trialDays) ? l : best), lengths[0]);
  let p = c.trialToPaid[len];
  if (state.company.model === 'b2c') p *= m.cardRequired ? 1 : c.noCardTrialFactor;
  if (state.company.model === 'smb' && m.cardRequired) p *= c.cardTrialFactor;
  p *= ONBOARDING[m.onboarding].conv * productFactor(state) * Math.pow(priceFactor(state, plan), 0.6) * Math.min(1.5, Math.sqrt(marketDemand(state))) * modProduct(state, 'conversion');
  // Real ceilings: card-required trials top out ~60% (best-in-class; SMB 50%), opt-in (no card) trials ~35%.
  const cap = state.company.model === 'ent' ? 0.9 : m.cardRequired ? (state.company.model === 'smb' ? 0.5 : 0.6) : 0.35;
  return clamp(p, 0, cap);
}

// Probability a subscriber cancels before a renewal. tenureMonths = completed paid months.
export function churnBeforeRenewal(state, sub) {
  const c = cfg(state);
  const subMult = (sub.churnMult ?? 1) * (sub.csChurnMult ?? 1) * (sub.gtmChurnMult ?? 1); // per-account: support replies (churnMult), account health/renewals (csChurnMult), poor-fit closes from a plan with no clawback (gtmChurnMult, people/comp.js)
  const pf = Math.max(0.2, productFactor(state));
  // U-shaped price effect: above WTP churns more; far below WTP also churns more (less committed buyers).
  const price = Math.pow(priceFactor(state), -0.3) * Math.pow(underpricing(state), 0.35) * modProduct(state, 'churn');
  if (sub.interval === 'year') return clamp((1 - c.annualRenewal) * Math.pow(1 / pf, 0.7) * price * subMult, 0.01, 0.95);
  const curve = c.monthlyChurn;
  // paidMonths is incremented just before the renewal check, so month 1's churn is curve[0].
  const base = curve[Math.min(curve.length - 1, Math.max(0, (sub.paidMonths ?? 1) - 1))];
  return clamp(base * Math.pow(1 / pf, 0.7) * price * subMult, 0.003, 0.8);
}

// ---- Synthetic people for self-serve customers (B2C or anonymous SMB signups). ----

const FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Zoe', 'Ethan', 'Priya', 'Mateo', 'Hana', 'Omar', 'Chloe', 'Lucas', 'Aisha', 'Kenji', 'Sofia', 'Diego', 'Grace', 'Arjun', 'Ines', 'Leo', 'Nora', 'Sam', 'Yara', 'Felix'];
const LAST = ['Patel', 'Kim', 'Garcia', 'Nguyen', 'Smith', 'Okafor', 'Rossi', 'Müller', 'Silva', 'Cohen', 'Tanaka', 'Haddad', 'Johnson', 'Larsen', 'Novak', 'Chen', 'Lopez', 'Brown', 'Ali', 'Dubois'];
const SMB = ['Studio', 'Dental', 'Bakery', 'Fitness', 'Agency', 'Plumbing', 'Clinic', 'Realty', 'Coffee', 'Salon', 'Law', 'Design', 'Logistics', 'Florist'];

export function syntheticPerson(state) {
  const first = pick(state, FIRST), last = pick(state, LAST);
  const n = Math.floor(rng(state) * 900 + 100);
  if (state.company.model === 'b2c') return { name: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}${n}@gmail.com` };
  const co = `${last} ${pick(state, SMB)}`;
  return { name: `${first} ${last}`, email: `${first.toLowerCase()}@${co.toLowerCase().replace(/[^a-z]/g, '')}.com`, company: co };
}

// A substantial idea change (pivot) vs a re-wording: word-set overlap below 40% [design].
export function isPivot(oldText, newText) {
  const ws = (t) => new Set(String(t ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const a = ws(oldText), b = ws(newText);
  if (!a.size) return false;
  const inter = [...a].filter((w) => b.has(w)).length;
  return inter / Math.max(1, new Set([...a, ...b]).size) < 0.4;
}
