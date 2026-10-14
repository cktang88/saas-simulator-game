// Pricing lab simulation: applies tier designs to state.plans, assigns new checkouts to tiers / billing
// intervals, runs price A/B tests on new signups, executes price increases on existing customers, runs
// customer price surveys and monthly expansion/contraction for usage/seat models.
// Synchronous and deterministic (core rng). Research: PRICING_RESEARCH (public/data/channels.js).

import { notify, log } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { changePrice, cancel, activeSubs } from '../../core/stripe.js';
import { mainPlan, trialConversion, setModifier, ensureMarket, shippedFeatures, cfg, hasProduct, monthlyPrice } from '../../core/market.js';
import { rng, chance, round2, uid, gaussian, hash } from '../../core/util.js';
import { pricingSlice, buildPlans, publishPlans, trialModeEffects, modelEffects, tierValues, monthlyOf, modeFromMarket } from './pricing-model.js';
import { tierShares, annualShare, twoProportionTest, normCdf, priceIncreaseChurn, sampleSizePerArm } from './stats.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hasAi = (state) => shippedFeatures(state).some((f) => f.ai?.enabled);

// ---- Model, trial mode, tiers ----

export function applyPricingModel(state, modelId, valueMetric) {
  const P = pricingSlice(state);
  P.model = modelId;
  P.valueMetric = String(valueMetric ?? '').slice(0, 80);
  syncModifiers(state);
  P.history.unshift({ day: state.day, what: `Pricing model → ${modelId}${P.valueMetric ? ` (${P.valueMetric})` : ''}` });
}

export function applyTrialMode(state, mode) {
  const P = pricingSlice(state);
  const m = ensureMarket(state);
  const eff = trialModeEffects(mode, state.company.model);
  P.trialMode = mode;
  m.cardRequired = eff.cardRequired;
  for (const p of state.plans) if (p.active) p.trialDays = eff.trialDays;
  if (mode === 'demo_only' && m.onboarding === 'self') m.onboarding = 'call';
  syncModifiers(state);
  P.history.unshift({ day: state.day, what: `Signup model → ${eff.label}` });
}

// Market modifiers owned by the Pricing lab (keys prefixed 'pricing-').
export function syncModifiers(state) {
  const P = pricingSlice(state);
  const eff = modelEffects(P.model, { bizModel: state.company.model, hasAi: hasAi(state) });
  const tm = P.trialMode ? trialModeEffects(P.trialMode, state.company.model) : null;
  setModifier(state, 'conversion', 'pricing-model', eff.conv);
  setModifier(state, 'churn', 'pricing-model', eff.churn);
  setModifier(state, 'landing', 'pricing-model', eff.landing);
  setModifier(state, 'landing', 'pricing-trial-model', tm ? tm.landing : 1);
  setModifier(state, 'conversion', 'pricing-trial-model', tm ? tm.conv : 1);
}

export function publishTiers(state, tiers, { annualDiscount = null } = {}) {
  const P = pricingSlice(state);
  if (!tiers.length) throw new Error('Add at least one tier.');
  if (tiers.some((t) => !(t.price > 0) || !String(t.name).trim())) throw new Error('Every tier needs a name and a price above $0.');
  if (!tiers.some((t) => t.highlight)) tiers[Math.min(1, tiers.length - 1)].highlight = true;
  const base = mainPlan(state);
  const interval = state.company.model === 'ent' ? base.interval : 'month';
  const trialDays = base.trialDays ?? 14;
  P.tiers = tiers.map((t) => ({ ...t, price: +(+t.price).toFixed(2), features: (t.features ?? []).filter(Boolean) }));
  P.annualDiscount = interval === 'month' ? annualDiscount : null;
  publishPlans(state, buildPlans(P.tiers, { interval, trialDays, annualDiscount: P.annualDiscount }));
  P.publishedDay = state.day;
  P.history.unshift({ day: state.day, what: `Published ${tiers.length} tier(s): ${tiers.map((t) => `${t.name} $${t.price}`).join(' / ')}${P.annualDiscount ? `, annual −${Math.round(P.annualDiscount * 100)}%` : ''}` });
  log(state, 'info', `New pricing published: ${tiers.map((t) => `${t.name} $${t.price}`).join(' / ')}.`, 'pricing');
}

// Predicted mix for the current published tiers.
export function predictedMix(state) {
  const P = pricingSlice(state);
  const tiers = (P.tiers ?? []).slice();
  if (!tiers.length) return null;
  const wtp = ensureMarket(state).fit.price.wtp ?? cfg(state).refPrice;
  const values = tierValues(tiers);
  const hi = tiers.findIndex((t) => t.highlight);
  const shares = tierShares(tiers.map((t, i) => ({ price: state.company.model === 'ent' && mainPlan(state).interval === 'year' ? t.price / 12 : t.price, value: values[i] })), { wtp, highlightIndex: hi });
  const annual = P.annualDiscount ? annualShare({ baseShare: cfg(state).annualShare, discount: P.annualDiscount }) : 0;
  return { tiers, shares, annual, wtp };
}

// ---- A/B price tests ----

export function startAbTest(state, { variantMult, label }) {
  const P = pricingSlice(state);
  if (P.abTests.some((t) => t.status === 'running')) throw new Error('A price test is already running.');
  if (!(variantMult > 0.2 && variantMult < 5) || variantMult === 1) throw new Error('Pick a different test price.');
  const plan = mainPlan(state);
  const t = { id: uid('ab'), status: 'running', startDay: state.day, planId: plan.id, controlPrice: plan.price, variantPrice: round2(plan.price * variantMult), variantMult, label: label || '', subs: [] };
  P.abTests.unshift(t);
  return t;
}

export function stopAbTest(state, testId, { adopt = false } = {}) {
  const P = pricingSlice(state);
  const t = P.abTests.find((x) => x.id === testId);
  if (!t || t.status !== 'running') throw new Error('No running test.');
  foldDecided(state, t);
  t.status = 'stopped';
  t.endDay = state.day;
  t.adopted = adopt;
  if (adopt) {
    const plan = state.plans.find((p) => p.id === t.planId);
    if (plan) plan.price = t.variantPrice;
    const tier = (P.tiers ?? []).find((x) => `tier_${x.key}` === t.planId);
    if (tier) tier.price = t.variantPrice;
    P.history.unshift({ day: state.day, what: `Adopted test price $${t.variantPrice} for ${plan?.name ?? 'plan'} (new customers)` });
  }
}

const subStatus = (sub) => {
  if (!sub) return 'lost';
  if (sub.status === 'trialing') return 'pending';
  if (sub.cancelReason === 'trial_not_converted') return 'lost';
  if ((sub.paidMonths ?? 0) > 0 || sub.status === 'active' || sub.status === 'past_due' || sub.status === 'canceled') return 'won';
  return 'pending';
};

// Decided trials are folded into per-arm aggregates (n, won, revenue sum and sum of squares of the first
// payment) so a long test doesn't keep thousands of ids in the save.
const emptyArm = () => ({ trials: 0, decided: 0, won: 0, rev: 0, rev2: 0 });
function foldDecided(state, t) {
  t.agg ??= { A: emptyArm(), B: emptyArm() };
  const subs = new Map((state.stripe?.subscriptions ?? []).map((s) => [s.id, s]));
  t.subs = t.subs.filter((x) => {
    const sub = subs.get(x.subId);
    const st = subStatus(sub);
    if (st === 'pending') return true;
    const a = t.agg[x.arm];
    a.decided++;
    if (st === 'won') { const r = sub.price * (sub.quantity ?? 1) * (1 - (sub.discountPct ?? 0)); a.won++; a.rev += r; a.rev2 += r * r; }
    return false;
  });
}

export function abResults(state, t) {
  foldDecided(state, t);
  const arm = (k) => ({ ...t.agg[k], trials: t.agg[k].decided + t.subs.filter((x) => x.arm === k).length });
  const A = arm('A'), B = arm('B');
  const test = twoProportionTest(A.won, A.decided, B.won, B.decided);
  // Welch test on first-payment value per decided trial, from aggregates.
  const mv = (a) => { const m = a.decided ? a.rev / a.decided : 0; const v = a.decided > 1 ? Math.max(0, (a.rev2 - a.decided * m * m) / (a.decided - 1)) : 0; return { m, v }; };
  const ma = mv(A), mb = mv(B);
  const se = Math.sqrt((A.decided ? ma.v / A.decided : 0) + (B.decided ? mb.v / B.decided : 0));
  const tStat = se > 0 ? (mb.m - ma.m) / se : 0;
  const revTest = { meanA: ma.m, meanB: mb.m, t: tStat, p: se > 0 ? 2 * (1 - normCdf(Math.abs(tStat))) : 1, enough: A.decided >= 30 && B.decided >= 30 };
  const p0 = A.decided ? A.won / A.decided : 0.1;
  const valueA = test.pA != null ? test.pA * t.controlPrice : null, valueB = test.pB != null ? test.pB * t.variantPrice : null;
  return { A, B, test, revTest, valueA, valueB, needed20: sampleSizePerArm(Math.max(0.01, p0), 0.2) };
}

function abDay(state, newSubs) {
  const P = pricingSlice(state);
  const t = P.abTests.find((x) => x.status === 'running');
  if (!t) return;
  const control = state.plans.find((p) => p.id === t.planId);
  if (!control) return;
  for (const sub of newSubs) {
    if (sub.planId !== t.planId || sub.status !== 'trialing') continue;
    const arm = rng(state) < 0.5 ? 'A' : 'B';
    t.subs.push({ subId: sub.id, arm });
    if (arm === 'B') {
      const ratio = trialConversion(state, { ...control, price: t.variantPrice }) / Math.max(1e-6, trialConversion(state, control));
      sub.price = round2(sub.price * t.variantMult);
      sub.forceConvert = clamp((sub.forceConvert ?? trialConversion(state, control)) * ratio, 0, 0.9);
    }
  }
  if (state.day % 7 === 0) foldDecided(state, t);
}

// ---- Tier / interval assignment for new self-serve checkouts ----

function tierDay(state, newSubs) {
  const P = pricingSlice(state);
  const mix = P.tiers?.length > 1 || P.annualDiscount ? predictedMix(state) : null;
  if (!mix) return;
  const main = mainPlan(state);
  for (const sub of newSubs) {
    if (sub.status !== 'trialing' || sub.planId !== main.id) continue;
    let r = rng(state), i = 0;
    while (i < mix.shares.length - 1 && r > mix.shares[i]) { r -= mix.shares[i]; i++; }
    const tier = mix.tiers[i];
    const annual = mix.annual > 0 && rng(state) < mix.annual;
    const plan = state.plans.find((p) => p.id === `tier_${tier.key}${annual ? '_annual' : ''}`) ?? state.plans.find((p) => p.id === `tier_${tier.key}`);
    if (!plan) continue;
    sub.planId = plan.id;
    sub.price = plan.price;
    sub.interval = plan.interval;
  }
}

// ---- Price increases on existing customers ----

/**
 * Schedule a price increase for existing subscribers of a plan.
 * grandfather: 0 (none) | months; noticeDays; lockIn: offer annual at the old price; comms: judged notice
 * email { quality, score, results }; alsoNewCustomers: raise the list price for new customers right away.
 */
export function scheduleIncrease(state, { planId, newPrice, noticeDays, grandfatherMonths, lockIn, valueAdded, comms, alsoNewCustomers }) {
  const P = pricingSlice(state);
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) throw new Error('Pick a plan.');
  if (!(newPrice > plan.price)) throw new Error('The new price must be higher than the current one.');
  if (P.increases.some((x) => x.planId === planId && ['scheduled', 'grandfathered'].includes(x.status))) throw new Error('An increase for this plan is already in progress.');
  const targets = (state.stripe?.subscriptions ?? []).filter((s) => s.planId === planId && ['active', 'past_due', 'trialing'].includes(s.status)).map((s) => s.id);
  const inc = {
    id: uid('pi'), planId, planName: plan.name, oldPrice: plan.price, newPrice: +newPrice, increasePct: newPrice / plan.price - 1, announcedDay: state.day,
    effectiveDay: state.day + noticeDays, noticeDays, grandfatherMonths: grandfatherMonths ?? 0, lockIn: Boolean(lockIn), valueAdded: Boolean(valueAdded),
    comms: comms?.quality ?? 0.4, commsScore: comms?.score ?? null, targets, migrated: 0, churned: 0, lockedIn: 0, status: 'scheduled',
  };
  P.increases.unshift(inc);
  if (alsoNewCustomers) {
    plan.price = +newPrice;
    const tier = (P.tiers ?? []).find((x) => `tier_${x.key}` === planId);
    if (tier) tier.price = +newPrice;
  }
  // Surprise + bad communication → public backlash for a month (Cursor 2025 pattern) [design].
  if (noticeDays < 14 && inc.comms < 0.4) {
    setModifier(state, 'landing', 'pricing-backlash', 0.9);
    inc.backlashUntil = state.day + 30;
  }
  P.history.unshift({ day: state.day, what: `Announced ${plan.name} $${plan.price} → $${newPrice} for ${targets.length} customers (effective in ${noticeDays} days${grandfatherMonths ? `, grandfathered ${grandfatherMonths} mo` : ''})` });
  return inc;
}

function migrate(state, inc, grandfathered) {
  const subs = new Map(state.stripe.subscriptions.map((s) => [s.id, s]));
  const pChurn = priceIncreaseChurn({ model: state.company.model, increasePct: inc.increasePct, comms: inc.comms, noticeDays: inc.noticeDays, grandfathered, lockInOffered: inc.lockIn, valueAdded: inc.valueAdded });
  for (const id of inc.targets) {
    const sub = subs.get(id);
    if (!sub || sub.status === 'canceled' || sub.priceLocked) continue;
    // Annual lock-in at the old price: some monthly customers take it [design 15%].
    if (inc.lockIn && sub.interval === 'month' && chance(state, 0.15)) { sub.priceLocked = inc.id; inc.lockedIn++; changePrice(state, id, { price: round2(inc.oldPrice) }); continue; }
    changePrice(state, id, { price: round2(sub.price * (inc.newPrice / inc.oldPrice)) });
    inc.migrated++;
    if (chance(state, pChurn)) { cancel(state, id, { atPeriodEnd: true, reason: 'price_increase' }); inc.churned++; }
  }
  inc.pChurn = pChurn;
}

function increasesDay(state) {
  const P = pricingSlice(state);
  for (const inc of P.increases) {
    if (inc.backlashUntil && state.day >= inc.backlashUntil) { setModifier(state, 'landing', 'pricing-backlash', null); inc.backlashUntil = null; }
    if (inc.status === 'scheduled' && state.day >= inc.effectiveDay) {
      if (inc.grandfatherMonths > 0) { inc.status = 'grandfathered'; inc.migrateDay = state.day + inc.grandfatherMonths * 30; notify(state, `New ${inc.planName} price is live for new customers; existing customers keep $${inc.oldPrice} until day ${inc.migrateDay}.`, { type: 'info', app: 'pricing' }); }
      else { migrate(state, inc, false); inc.status = 'done'; notify(state, `${inc.planName} price increase applied to ${inc.migrated} customers; ${inc.churned} will cancel at renewal.`, { type: inc.churned > inc.migrated * 0.1 ? 'warn' : 'info', app: 'pricing' }); }
    }
    if (inc.status === 'grandfathered' && state.day >= inc.migrateDay) {
      migrate(state, inc, true);
      inc.status = 'done';
      notify(state, `Grandfathering ended: ${inc.migrated} customers moved to $${inc.newPrice}; ${inc.churned} will cancel.`, { type: 'info', app: 'pricing' });
    }
  }
}

// ---- Customer price survey (real in-game customers) ----
// Response rate 10–20% [design]; answers come from the game's true willingness to pay with individual noise.
// Existing customers already accepted your price, so this sample skews above the market's WTP.

// Gabor-Granger price points: 0.5×–2× the current monthly price.
export const surveyPrices = (state) => { const p = monthlyOf(mainPlan(state)); return [0.5, 0.75, 1, 1.5, 2].map((m) => Math.max(1, Math.round(p * m))); };

export function sendCustomerSurvey(state, method) {
  const P = pricingSlice(state);
  const active = activeSubs(state).length;
  if (active < 5) throw new Error('You need at least 5 paying customers to survey.');
  const s = { id: uid('sv'), source: 'customers', method, day: state.day, readyDay: state.day + 7, status: 'collecting', invited: active, responses: null, prices: surveyPrices(state) };
  P.surveys.unshift(s);
  return s;
}

function customerSurveyResponses(state, s) {
  const wtp = ensureMarket(state).fit.price.wtp ?? cfg(state).refPrice;
  const price = monthlyOf(mainPlan(state));
  const n = Math.max(2, Math.round(s.invited * (0.1 + 0.1 * rng(state))));
  const out = [];
  for (let i = 0; i < n; i++) {
    // Customers' WTP is at least roughly what they pay (selection), lognormal around the market WTP.
    const w = Math.max(price * 0.8, wtp * Math.exp(0.45 * gaussian(state)));
    if (s.method === 'gg') {
      const r = {};
      for (const k of s.prices ?? surveyPrices(state)) r[k] = clamp(1 / (1 + Math.exp((k - w) / (0.25 * w))), 0, 1);
      out.push(r);
    } else out.push({ tooCheap: round2(w * 0.3), cheap: round2(w * 0.6), expensive: round2(w * 1.1), tooExpensive: round2(w * 1.6) });
  }
  return out;
}

// Deterministic heuristic respondents for an offline LLM panel (same shape). Stated WTP in AI panels tends to
// be anchored and inflated relative to real buyers [design ×1.2].
export function heuristicRespondents(state, { method, prices = [], count = 8, salt = '' }) {
  const wtp = (ensureMarket(state).fit.price.wtp ?? cfg(state).refPrice) * 1.2;
  let seed = parseInt(hash(`${state.company.name}|${salt}|${method}`), 36) | 0;
  const r = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const z = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  const out = [];
  for (let i = 0; i < count; i++) {
    const w = wtp * Math.exp(0.35 * z());
    if (method === 'gg') {
      const likelihoods = prices.map((p) => +clamp(1 / (1 + Math.exp((p - w) / (0.3 * w))), 0, 1).toFixed(2));
      out.push({ persona: `Respondent ${i + 1}`, likelihoods });
    } else out.push({ persona: `Respondent ${i + 1}`, tooCheap: Math.round(w * 0.3), cheap: Math.round(w * 0.6), expensive: Math.round(w * 1.15), tooExpensive: Math.round(w * 1.7) });
  }
  return out;
}

function surveysDay(state) {
  const P = pricingSlice(state);
  for (const s of P.surveys) {
    if (s.status !== 'collecting' || state.day < s.readyDay) continue;
    s.responses = customerSurveyResponses(state, s);
    s.status = 'done';
    notify(state, `Customer pricing survey closed: ${s.responses.length} of ${s.invited} customers answered.`, { type: 'info', app: 'pricing' });
  }
}

// ---- Expansion / contraction (seat, usage, hybrid models) ----

function expansionMonth(state) {
  const P = pricingSlice(state);
  const eff = modelEffects(P.model, { bizModel: state.company.model, hasAi: hasAi(state) });
  if (!eff.expansion && !eff.contraction) return;
  for (const sub of activeSubs(state)) {
    if (sub.interval !== 'month') continue;
    if (chance(state, eff.expansion)) changePrice(state, sub.id, { quantity: (sub.quantity ?? 1) + 1 });
    else if ((sub.quantity ?? 1) > 1 && chance(state, eff.contraction)) changePrice(state, sub.id, { quantity: sub.quantity - 1 });
  }
}

// ---- Daily ----

/**
 * F4: a price below half of what buyers would pay is a ledger entry, once per price (a new price is a new key).
 * Cost [design]: the monthly gap to a fair price (80% of WTP) over this month's customers (at least 5) for a
 * quarter, plus the customers lost to the extra churn of bargain buyers (core/market.js underpricing).
 */
export function underpricingDay(state) {
  if (!hasProduct(state) || !state.plans?.length) return null;
  const plan = mainPlan(state);
  const wtp = ensureMarket(state).fit.price.wtp ?? cfg(state).refPrice;
  const price = monthlyPrice(plan);
  if (!(price < 0.5 * wtp)) return null;
  const subs = activeSubs(state).length;
  const gap = Math.max(0, 0.8 * wtp - price);
  return logMistake(state, {
    functionId: 'pricing_packaging', id: 'underpriced', app: 'pricing', delayed: true, key: `underpriced:${plan.id}:${plan.interval}:${plan.price}`,
    label: `Priced at ${Math.round((price / wtp) * 100)}% of what buyers would pay`,
    cost: { usd: Math.round(gap * Math.max(5, subs) * 3), customers: Math.round(subs * 0.05), reputation: 0 },
    detail: `${plan.name} is $${round2(price)}/month against about $${round2(wtp)} willingness to pay. Cheap buyers are less committed (churn rises) and B2B buyers read it as "not serious"; you also leave about $${round2(gap)} per customer per month on the table.`,
  });
}

export function pricingDay(state) {
  underpricingDay(state);
  if (!state.apps.pricing) return;
  const P = pricingSlice(state);
  // Keep the signup model in sync if another app (Customers → onboarding) flips the card requirement.
  if (P.trialMode && ['trial_nocard', 'trial_card'].includes(P.trialMode)) {
    const now = modeFromMarket(ensureMarket(state), mainPlan(state));
    if (now !== P.trialMode && now !== 'demo_only') { P.trialMode = now; syncModifiers(state); }
  }
  // Only today's checkouts; the guard keeps a second tick on the same day from re-assigning them.
  if (P.seenDay !== state.day) { P.seenDay = state.day; P.seenSubs = {}; }
  const newSubs = (state.stripe?.subscriptions ?? []).filter((s) => s.startDay === state.day && !P.seenSubs[s.id]);
  tierDay(state, newSubs);
  abDay(state, newSubs);
  for (const s of newSubs) P.seenSubs[s.id] = 1;
  increasesDay(state);
  surveysDay(state);
}

export function pricingMonthEnd(state) {
  if (!state.apps.pricing) return;
  expansionMonth(state);
}
