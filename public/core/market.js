// The market: how real customers behave given what you've built, how you present it, and what you charge.
// "Fit" scores (0..1) come from LLM customer panels run in the tools (landing page review, product trials,
// customer calls). Baseline rates come from core/params.js. This module is pure.

import { MARKET, ONBOARDING } from './params.js';
import { clamp, pick, rng, hash } from './util.js';
import { baseHazard, monthlyEquivalent } from './mobile.js';
import { icpFocus, trueWtp } from './truth.js';
import { pivotChurnMult } from './pivots.js';
import { customerMarketCfg, customerTypeOf, onboardingFit, subModel } from './customer-type.js';
import { personName, emailSlug } from './names.js';

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

// The model's baseline adjusted for who you sell to (core/customer-type.js; neutral without a customer type).
export const cfg = (state) => customerMarketCfg(MARKET[state.company.model], state.company.model, customerTypeOf(state));
// The baseline a subscription renews under: the customer type it was sold under (a company that moved upmarket keeps
// its SMB customers on SMB churn), else the company's.
const subCfg = (state, sub) => {
  if (!sub?.customerType) return cfg(state);
  const model = subModel(state, sub);
  return customerMarketCfg(MARKET[model], model, sub.customerType);
};

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

// Money the targeted segments would really pay per month. Priority: a number set directly on fit.price.wtp (legacy
// panels, tests), else the hidden truth of the segments the ICP targets (stated WTP from panels and interviews is
// inflated ~1.35x and never drives behaviour), else the model's reference price.
export function wtpOf(state) {
  return ensureMarket(state).fit.price.wtp ?? trueWtp(state) ?? cfg(state).refPrice;
}

// What the player is told: the panels' stated WTP (inflated), else the legacy value, else the reference price.
// Never the hidden truth.
export function statedWtp(state) {
  const p = ensureMarket(state).fit.price;
  return p.stated ?? p.wtp ?? cfg(state).refPrice;
}

// Record a panel's stated willingness to pay. With an idea stated, behaviour follows the hidden truth (wtpOf); the
// stated number is only what the player sees (about 1.35x the real figure on average, with a long tail).
export function recordStatedWtp(state, stated, { notes, source }) {
  const m = ensureMarket(state);
  m.fit.price = { wtp: trueWtp(state) != null ? null : stated, stated, notes: `${notes} (stated, expect people to overstate what they will pay)`, day: state.day, source };
}

// Segment-level demand and retention (core/truth.js): conversion and churn follow the segment you reach, so PMF can
// exist in one segment and not another. Both are 1 for a broad/unset ICP or before an idea is stated.
const demandMultOf = (state) => icpFocus(state).demandMult;
const churnMultOf = (state) => icpFocus(state).churnMult * pivotChurnMult(state);

// Price far below what buyers would pay is not free: B2B buyers read it as "not serious" and cheap customers
// are less committed (higher churn). Above-WTP pricing is already penalized by priceFactor.
function underpricing(state, plan = mainPlan(state)) {
  if (!plan) return 1;
  const c = cfg(state);
  const wtp = wtpOf(state);
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

// The plan new customers buy: the first active price, else the first price, else null. A new game starts with NO
// price: the founder sets it in the Pricing lab, and until then nobody can check out (B2B visitors can still ask
// "how much?" and become CRM leads; see growth/acquire.js).
export function mainPlan(state) {
  return state.plans?.find((p) => p.active) ?? state.plans?.[0] ?? null;
}
export const hasPrice = (state) => Boolean(mainPlan(state));
// For estimates only (ad CPA hints, readers, bid sizing): the real plan, else the market's reference price, flagged
// `reference` so nothing is ever sold at it.
export function planOrReference(state) {
  const p = mainPlan(state);
  if (p) return p;
  const c = cfg(state);
  const ent = state.company.model === 'ent';
  return { id: null, name: '(no price set)', price: ent ? Math.round(c.refPrice * 12) : c.refPrice, interval: ent ? 'year' : 'month', trialDays: 0, active: false, reference: true };
}
export function monthlyPrice(plan) {
  if (!plan) return 0;
  return monthlyEquivalent(plan.price, plan.interval);
}

// Willingness to pay is stored per MONTH (refPrice and fit.price.wtp). An annual plan is compared with the
// annualized WTP net of the typical annual discount, so a $59.99/yr consumer plan is judged against
// ~$72/yr (12 × $9.99 × 0.6), not as a "$5/month" product.
export function annualWtp(state) {
  const c = cfg(state);
  const wtp = wtpOf(state);
  return wtp * 12 * (1 - (c.annualDiscount ?? 0));
}

export function priceFactor(state, plan = mainPlan(state)) {
  if (!plan) return 1; // no price yet: neutral (nothing is sold; churn and readers stay neutral)
  const c = cfg(state);
  const wtp = wtpOf(state);
  const ratio = plan.interval === 'year' ? annualWtp(state) / Math.max(6, plan.price) : wtp / Math.max(0.5, monthlyEquivalent(plan.price, plan.interval));
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
// Pre-product waitlist page (smoke test): visitors can only join a list, so the rate is a few percent, not a trial
// start. Only apps/mvp asks for it, via landingConversion(state, plan, { preProduct: true }); every channel that calls
// landingConversion without the option still gets 0 until a feature ships [design: 2-5% weak waitlists, cold traffic
// 3-10%, docs/research/early-stage/mvp-first-customers.md].
export function waitlistConversion(state) {
  return clamp(0.05 * websiteFactor(state) * marketDemand(state) * demandMultOf(state), 0, 0.25);
}

export function landingConversion(state, plan = mainPlan(state), { preProduct = false } = {}) {
  const c = cfg(state);
  if (!hasProduct(state)) return preProduct ? waitlistConversion(state) : 0;
  // No price: consumers cannot buy at all; B2B visitors can only ask for pricing (fewer of them bother) [design x0.4].
  if (!plan && state.company.model === 'b2c') return 0;
  const noPrice = plan ? 1 : state.company.model === 'ent' ? 0.8 : 0.4;
  const m = ensureMarket(state);
  // Requiring a card up front cuts trial starts sharply (opt-out vs opt-in trials) [design ~0.45–0.5].
  const card = m.cardRequired && state.company.model !== 'ent' ? (state.company.model === 'smb' ? 0.45 : 0.5) : 1;
  const cheap = state.company.model === 'b2c' ? 1 : Math.pow(1 / underpricing(state, plan), 0.3);
  return clamp(c.trialStartRate * websiteFactor(state) * Math.sqrt(productFactor(state)) * Math.sqrt(priceFactor(state, plan)) * card * cheap * noPrice * marketDemand(state) * demandMultOf(state) * modProduct(state, 'landing'), 0, 0.4);
}

// Probability a trial converts to paid.
export function trialConversion(state, plan = mainPlan(state)) {
  if (!plan) return 0; // no price, no checkout
  const c = cfg(state);
  const m = ensureMarket(state);
  const lengths = Object.keys(c.trialToPaid).map(Number).sort((a, b) => a - b);
  const len = lengths.reduce((best, l) => (Math.abs(l - plan.trialDays) < Math.abs(best - plan.trialDays) ? l : best), lengths[0]);
  let p = c.trialToPaid[len];
  if (state.company.model === 'b2c') p *= m.cardRequired ? 1 : c.noCardTrialFactor;
  if (state.company.model === 'smb' && m.cardRequired) p *= c.cardTrialFactor;
  p *= ONBOARDING[m.onboarding].conv * onboardingFit(state, m.onboarding) * productFactor(state) * Math.pow(priceFactor(state, plan), 0.6) * Math.min(1.5, Math.sqrt(marketDemand(state))) * Math.sqrt(demandMultOf(state)) * modProduct(state, 'conversion');
  // Real ceilings: card-required trials top out ~60% (best-in-class; SMB 50%), opt-in (no card) trials ~35%.
  const cap = state.company.model === 'ent' ? 0.9 : m.cardRequired ? (state.company.model === 'smb' ? 0.5 : 0.6) : 0.35;
  return clamp(p, 0, cap);
}

// Probability a subscriber cancels before a renewal. tenureMonths = completed paid months.
export function churnBeforeRenewal(state, sub) {
  const c = subCfg(state, sub);
  const subMult = (sub.churnMult ?? 1) * (sub.csChurnMult ?? 1) * (sub.gtmChurnMult ?? 1) * (sub.ctChurnMult ?? 1); // per-account: support replies (churnMult), account health/renewals (csChurnMult), poor-fit closes from a plan with no clawback (gtmChurnMult, people/comp.js)
  const pf = Math.max(0.2, productFactor(state));
  // U-shaped price effect: above WTP churns more; far below WTP also churns more (less committed buyers).
  const price = Math.pow(priceFactor(state), -0.3) * Math.pow(underpricing(state), 0.35) * modProduct(state, 'churn') * churnMultOf(state);
  // Store subscriptions (apps/consumer): RevenueCat median retention by plan length, scaled by fit like the rest.
  if (sub.mobile) return clamp(baseHazard(sub.interval, sub.paidMonths ?? 1) * Math.pow(1 / pf, 0.7) * modProduct(state, 'churn') * churnMultOf(state) * subMult * (sub.mobileChurnMult ?? 1), 0.01, 0.95);
  if (sub.interval === 'year') return clamp((1 - c.annualRenewal) * Math.pow(1 / pf, 0.7) * price * subMult, 0.01, 0.95);
  const curve = c.monthlyChurn;
  // paidMonths is incremented just before the renewal check, so month 1's churn is curve[0].
  const base = curve[Math.min(curve.length - 1, Math.max(0, (sub.paidMonths ?? 1) - 1))];
  return clamp(base * Math.pow(1 / pf, 0.7) * price * subMult, 0.003, 0.8);
}

// ---- Synthetic people for self-serve customers (B2C or anonymous SMB signups). ----

// Names come from the shared bank (data/names.js) and are unique within a game (core/names.js).
const SMB = ['Studio', 'Dental', 'Bakery', 'Fitness', 'Agency', 'Plumbing', 'Clinic', 'Realty', 'Coffee', 'Salon', 'Law', 'Design', 'Logistics', 'Florist'];
// Company names that match who you sell to (customer type); the generic SMB list otherwise.
const CO_STYLE = {
  startups: { words: ['Labs', 'AI', 'HQ', 'Cloud', 'Stack', 'Data', 'Base', 'ly'], tld: ['io', 'ai', 'dev', 'com'] },
  ecommerce: { words: ['Goods', 'Supply Co', 'Apparel', 'Botanicals', 'Pet Co', 'Coffee Roasters', 'Skincare', 'Home'], tld: ['com', 'co', 'shop'] },
  local_smb: { words: SMB, tld: ['com'] },
};

export function syntheticPerson(state) {
  const { first, last, name } = personName(state); // two rng(state) draws, as the old first/last picks made
  const n = Math.floor(rng(state) * 900 + 100);
  if (state.company.model === 'b2c') return { name, email: `${emailSlug(first)}.${emailSlug(last)}${n}@gmail.com` };
  const style = CO_STYLE[customerTypeOf(state)];
  if (style) {
    const co = `${last} ${pick(state, style.words)}`.replace(' ly', 'ly');
    return { name, email: `${emailSlug(first)}@${emailSlug(co)}.${pick(state, style.tld)}`, company: co };
  }
  const co = `${last} ${pick(state, SMB)}`;
  return { name, email: `${emailSlug(first)}@${emailSlug(co)}.com`, company: co };
}

// A substantial idea change (pivot) vs a re-wording: word-set overlap below 40% [design].
export function isPivot(oldText, newText) {
  const ws = (t) => new Set(String(t ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const a = ws(oldText), b = ws(newText);
  if (!a.size) return false;
  const inter = [...a].filter((w) => b.has(w)).length;
  return inter / Math.max(1, new Set([...a, ...b]).size) < 0.4;
}
