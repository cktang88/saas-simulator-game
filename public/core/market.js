// The market: how real customers behave given what you've built, how you present it, and what you charge.
// "Fit" scores (0..1) come from LLM customer panels run in the tools (landing page review, product trials,
// customer calls). Baseline rates come from core/params.js. This module is pure.

import { MARKET, ONBOARDING } from './params.js';
import { clamp, pick, rng } from './util.js';

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

export function shippedFeatures(state) {
  return (state.apps.product?.features ?? []).filter((f) => f.status === 'shipped');
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
  return 0.25 + 1.5 * s;
}

export function mainPlan(state) {
  return state.plans.find((p) => p.active) ?? state.plans[0];
}
export function monthlyPrice(plan) {
  return plan.interval === 'year' ? plan.price / 12 : plan.price;
}

export function priceFactor(state, plan = mainPlan(state)) {
  const c = cfg(state);
  const wtp = ensureMarket(state).fit.price.wtp ?? c.refPrice;
  return clamp(Math.pow(wtp / Math.max(0.5, monthlyPrice(plan)), c.elasticity), 0.05, 2.5);
}

// Landing page visitor → trial/signup (or demo request for enterprise).
export function landingConversion(state, plan = mainPlan(state)) {
  const c = cfg(state);
  if (!hasProduct(state)) return 0;
  return clamp(c.trialStartRate * websiteFactor(state) * Math.sqrt(productFactor(state)) * Math.sqrt(priceFactor(state, plan)) * modProduct(state, 'landing'), 0, 0.4);
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
  p *= ONBOARDING[m.onboarding].conv * productFactor(state) * Math.pow(priceFactor(state, plan), 0.6) * modProduct(state, 'conversion');
  return clamp(p, 0, 0.9);
}

// Probability a subscriber cancels before a renewal. tenureMonths = completed paid months.
export function churnBeforeRenewal(state, sub) {
  const c = cfg(state);
  const pf = Math.max(0.2, productFactor(state));
  const price = Math.pow(priceFactor(state), -0.3) * modProduct(state, 'churn');
  if (sub.interval === 'year') return clamp((1 - c.annualRenewal) * Math.pow(1 / pf, 0.7) * price, 0.01, 0.95);
  const curve = c.monthlyChurn;
  const base = curve[Math.min(curve.length - 1, sub.paidMonths ?? 0)];
  return clamp(base * Math.pow(1 / pf, 0.7) * price, 0.003, 0.8);
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
