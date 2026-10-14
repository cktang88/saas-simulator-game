// Pricing model helpers shared by the Pricing lab and other apps (the CRM can import maxDiscount).
// Research: PRICING_RESEARCH in public/data/channels.js and docs/research/channels-partnerships-pricing.md §3.
// Effects tagged [design] are game estimates bounded by that research, not measured statistics.

import { PRICING_RESEARCH } from '../../data/channels.js';
import { discountBand, DISCOUNT_BANDS } from './stats.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const pricingSlice = (state) => {
  state.apps.pricing ??= {};
  const p = state.apps.pricing;
  p.model ??= 'flat';
  p.valueMetric ??= '';
  p.tiers ??= null; // designer draft: [{ key, name, price, features[], seats, limit, highlight }]
  p.annualDiscount ??= null; // null = no annual plans published by the lab
  p.trialMode ??= null; // null = untouched (core defaults)
  p.surveys ??= [];
  p.abTests ??= [];
  p.increases ??= [];
  p.discountPolicy ??= { overrides: {}, approvalAbove: null, endOfQuarter: true };
  p.seenSubs ??= {};
  p.history ??= [];
  return p;
};

// ---- Sales discount guardrails ----

// Last two weeks of a calendar quarter add 5–10 pp discount pressure for sales-led deals [design].
export function isEndOfQuarter(state, day = state.day) {
  const d = new Date(Date.parse(state.startDate + 'T12:00:00Z') + day * 86400000);
  const m = d.getUTCMonth(), next = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 1));
  return [2, 5, 8, 11].includes(m) && (next - d) / 86400000 <= 14;
}

/**
 * Maximum discount (fraction of list) a deal with this ACV should get under the founder's policy.
 * Defaults to the top of the research band by ACV: self-serve 5%, SMB 15%, mid-market 25%, enterprise 35%
 * ([design] interpolated from Vendr ~10% average and Vertice ~34% off list). The Pricing lab can tighten each
 * band; end of quarter adds 5 pp when the policy allows it.
 */
export function maxDiscount(state, acv) {
  const band = discountBand(Math.max(0, acv || 0));
  const policy = state?.apps?.pricing?.discountPolicy;
  let max = policy?.overrides?.[band.id] ?? band.range[1];
  if (policy?.endOfQuarter !== false && state && isEndOfQuarter(state)) max += 0.05;
  return clamp(max, 0, 0.5);
}

// Full guardrail check for a proposed discount (for the CRM proposal form or the Pricing lab).
export function discountCheck(state, acv, discountPct) {
  const band = discountBand(acv);
  const max = maxDiscount(state, acv);
  const typical = band.range;
  const approvalAbove = state?.apps?.pricing?.discountPolicy?.approvalAbove;
  return {
    band: band.id, bandLabel: band.label, typical, max,
    ok: discountPct <= max + 1e-9,
    needsApproval: approvalAbove != null && discountPct > approvalAbove,
    note: discountPct > max ? `Above your ${Math.round(max * 100)}% guardrail for ${band.label}.` : discountPct > typical[1] ? 'Above the typical band; tie it to a multi-year term or prepayment.' : 'Within the typical band.',
  };
}
export { DISCOUNT_BANDS };

// ---- Pricing models ----

// [design] effects of the pricing model on the simulation. expansion/contraction = monthly share of monthly
// subscriptions that add/remove a unit; churn/conv/landing are multipliers applied via market modifiers.
export const MODEL_EFFECTS = {
  flat: { expansion: 0, contraction: 0, churn: 1, conv: 1, landing: 1 },
  per_seat: { expansion: 0.02, contraction: 0.008, churn: 1, conv: 1, landing: 1 },
  usage: { expansion: 0.035, contraction: 0.025, churn: 1.08, conv: 1, landing: 1.05 },
  hybrid: { expansion: 0.025, contraction: 0.01, churn: 1, conv: 1, landing: 1 },
  ai_credits: { expansion: 0.02, contraction: 0.01, churn: 1, conv: 1, landing: 1 },
  outcome: { expansion: 0.03, contraction: 0.03, churn: 1.05, conv: 1, landing: 1.03 },
};

export const PRICING_MODELS = PRICING_RESEARCH.models.filter((m) => MODEL_EFFECTS[m.id]);

/**
 * Model effects adjusted for the business: per-seat hurts B2C, credits/outcome pricing without AI features
 * confuses buyers, flat pricing with AI features invites unprofitable power users (shown as a warning).
 */
export function modelEffects(modelId, { bizModel = 'smb', hasAi = false } = {}) {
  const e = { ...(MODEL_EFFECTS[modelId] ?? MODEL_EFFECTS.flat) };
  const warnings = [];
  if (modelId === 'per_seat' && bizModel === 'b2c') { e.conv *= 0.85; e.expansion = 0.002; warnings.push('Consumers buy for themselves: per-seat pricing mostly adds friction.'); }
  if ((modelId === 'ai_credits' || modelId === 'outcome') && !hasAi) { e.conv *= 0.88; warnings.push('Credits/outcome pricing without an AI feature that consumes them reads as confusing.'); }
  if (modelId === 'flat' && hasAi) warnings.push('Flat pricing with AI features: heavy users can cost more in inference than they pay (Cursor 2025 shows the fix can backfire if communicated badly).');
  if (modelId === 'usage' && bizModel !== 'ent') warnings.push('Pure usage pricing: revenue volatility and bill shock (churn ×1.08 [design]).');
  if (modelId === 'per_seat' && hasAi) warnings.push('AI automation shrinks seat counts; seat-based primary models fell 21% → 15% (Growth Unhinged 2025).');
  return { ...e, warnings };
}

export const VALUE_METRICS = {
  b2c: ['per account', 'per family / household', 'per device', 'AI credits per month', 'projects / exports'],
  smb: ['per seat', 'contacts / customers managed', 'locations', 'monthly active users', 'AI credits / tasks', 'documents / invoices processed'],
  ent: ['per seat', 'tracked users / employees', 'API calls', 'AI resolutions / outcomes', 'workspaces / business units', 'data volume (GB)'],
};

// ---- Trial / freemium modes ----
// Free→paid (ChartMogul × Poyar 2026-01): freemium 3–5% good; no-card trial 4–6% good; reverse trial 4–6%;
// card-required trial 25–35% "but far fewer signups"; median 8%; gap disappears once signup volume is counted.
// Landing multipliers below are [design] so total paid per visitor stays in the same ballpark across modes.

export const TRIAL_MODES = {
  trial_nocard: { label: 'Free trial, no card', cardRequired: false, trialDays: 14, landing: 1, conv: 1, research: 'free→paid 4–6% good, 10–15% great' },
  trial_card: { label: 'Free trial, card required (opt-out)', cardRequired: true, trialDays: 14, landing: 0.45, conv: 1, research: 'free→paid 25–35% good, 50–60% great, far fewer signups' },
  reverse_trial: { label: 'Reverse trial (full features, then drops to free)', cardRequired: false, trialDays: 14, landing: 1.2, conv: 0.9, research: 'free→paid 4–6% good, 8–12% great' },
  freemium: { label: 'Freemium (free plan forever, upgrade to pay)', cardRequired: false, trialDays: 30, landing: 1.6, conv: 0.5, research: 'free→paid 3–5% good, 8–12% great; free AI usage costs real money' },
  demo_only: { label: 'No trial: demo / sales-led', cardRequired: false, trialDays: 0, landing: 1, conv: 1, research: 'enterprise default; ACV > $5k mostly hides prices' },
};
// B2C apps: a hard paywall with trial converts download→paid far better than freemium (RevenueCat via
// marketing-and-ads.md); core already models card vs no-card for B2C, so B2C card-required costs fewer signups.
export function trialModeEffects(mode, bizModel = 'smb') {
  const m = TRIAL_MODES[mode] ?? TRIAL_MODES.trial_nocard;
  const landing = bizModel === 'b2c' && mode === 'trial_card' ? 0.6 : m.landing;
  return { ...m, landing };
}
export const modeFromMarket = (market, plan) => (plan?.trialDays === 0 ? 'demo_only' : market?.cardRequired ? 'trial_card' : 'trial_nocard');

// ---- Plans ----

export const DEFAULT_TIERS = {
  b2c: [
    { key: 'basic', name: 'Basic', mult: 0.6, features: ['Core features', '1 device'], highlight: false },
    { key: 'plus', name: 'Plus', mult: 1, features: ['Everything in Basic', 'All devices', 'Sync & backups'], highlight: true },
    { key: 'family', name: 'Family', mult: 1.8, features: ['Everything in Plus', 'Up to 6 people'], highlight: false },
  ],
  smb: [
    { key: 'starter', name: 'Starter', mult: 0.5, features: ['1 user', 'Core workflow', 'Email support'], highlight: false },
    { key: 'pro', name: 'Pro', mult: 1, features: ['5 users', 'Integrations', 'Automations'], highlight: true },
    { key: 'business', name: 'Business', mult: 2.5, features: ['20 users', 'SSO', 'Priority support'], highlight: false },
  ],
  ent: [
    { key: 'team', name: 'Team', mult: 0.5, features: ['Up to 50 seats', 'Standard support'], highlight: false },
    { key: 'business', name: 'Business', mult: 1, features: ['Up to 500 seats', 'SSO/SAML', 'Admin controls'], highlight: true },
    { key: 'enterprise', name: 'Enterprise', mult: 3, features: ['Unlimited seats', 'SOC 2 report, DPA', 'Dedicated CSM'], highlight: false },
  ],
};

export function defaultTiers(state) {
  const base = state.plans.find((p) => p.active) ?? state.plans[0];
  const round = (x) => (x >= 100 ? Math.round(x / 10) * 10 - (state.company.model === 'smb' ? 1 : 0) : Math.round(x) - 0.01);
  return DEFAULT_TIERS[state.company.model].map((t) => ({ key: t.key, name: t.name, price: Math.max(1, +round(base.price * t.mult).toFixed(2)), features: t.features.slice(), seats: null, limit: '', highlight: t.highlight }));
}

// Relative feature value of each tier for the choice model: rank-based with a bump per listed feature.
export function tierValues(tiers) {
  const n = tiers.length;
  const feats = tiers.map((t) => (t.features ?? []).filter(Boolean).length);
  const maxF = Math.max(1, ...feats);
  return tiers.map((t, i) => clamp(0.25 + 0.55 * (n > 1 ? i / (n - 1) : 1) + 0.2 * (feats[i] / maxF), 0, 1.2));
}

/**
 * Build Stripe-style plan objects from tiers. Keeps the core plan shape { id, name, price, interval, trialDays,
 * active } and adds optional fields (tier, features, seats, limit, highlight, annualOf, lab).
 * Highlighted tier first so core mainPlan() (the default checkout plan) is the "most popular" one.
 */
export function buildPlans(tiers, { interval = 'month', trialDays = 14, annualDiscount = null } = {}) {
  const ordered = tiers.slice().sort((a, b) => (b.highlight ? 1 : 0) - (a.highlight ? 1 : 0));
  const out = ordered.map((t) => ({ id: `tier_${t.key}`, name: t.name, price: +t.price, interval, trialDays, active: true, tier: t.key, features: (t.features ?? []).filter(Boolean), seats: t.seats ?? null, limit: t.limit ?? '', highlight: Boolean(t.highlight), lab: true }));
  if (interval === 'month' && annualDiscount != null && annualDiscount > 0) {
    for (const t of ordered) out.push({ id: `tier_${t.key}_annual`, name: `${t.name} (annual)`, price: Math.round(t.price * 12 * (1 - annualDiscount)), interval: 'year', trialDays, active: true, tier: t.key, features: (t.features ?? []).filter(Boolean), seats: t.seats ?? null, limit: t.limit ?? '', highlight: Boolean(t.highlight), annualOf: `tier_${t.key}`, lab: true });
  }
  return out;
}

// Replace the published plans: plans that existing subscriptions use are archived (active: false), never
// deleted (Stripe archives prices; existing subscribers keep theirs).
export function publishPlans(state, plans) {
  const used = new Set((state.stripe?.subscriptions ?? []).filter((s) => s.status !== 'canceled').map((s) => s.planId));
  const keep = state.plans.filter((p) => !plans.some((n) => n.id === p.id) && used.has(p.id)).map((p) => ({ ...p, active: false }));
  state.plans = [...plans, ...keep];
  return state.plans;
}

export const monthlyOf = (plan) => (plan.interval === 'year' ? plan.price / 12 : plan.price);
