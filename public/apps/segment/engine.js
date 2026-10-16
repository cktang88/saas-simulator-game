// Who you sell to: the daily simulation of the customer type (core/customer-type.js profile) and moving upmarket.
//
// Reads Product (shipped features), Stripe (subscriptions), Legal (SOC 2), Helpdesk (first response), Growth/Channels
// (acquisition by channel, via core fitCount) and Market & competitors (world events). Writes only market modifiers
// prefixed `customer-type:`, per-subscription `sub.ctChurnMult`, cancellations for customers who outgrew the product,
// and its own slice state.apps.segment. Randomness: rng(state), only when a customer type is set.
// Research: docs/research/customer-types/. Every threshold and multiplier here is [design] unless the data file
// cites it.

import { notify, log } from '../../core/state.js';
import { rng, clamp, monthIndex, dayOfMonth, money, round2 } from '../../core/util.js';
import { setModifier, ensureMarket, shippedFeatures, hasProduct } from '../../core/market.js';
import { activeSubs, mrr, monthlyAmount, cancel } from '../../core/stripe.js';
import { logMistake } from '../../core/operator.js';
import { profileOf, customerTypeOf, isSmbType, channelOf, CUSTOMER_TYPES } from '../../core/customer-type.js';
import { UPMARKET, FEATURE_KEYWORDS, CHANNELS } from '../../data/customer-types.js';

export const FUNCTION_ID = 'customer_fit';

export function ensureSegment(state) {
  const S = (state.apps.segment ??= {});
  S.acq ??= {};
  S.history ??= [];
  S.logged ??= {};
  S.transition ??= null;
  return S;
}

// ---- Features ---------------------------------------------------------------------------------------------------

const featureText = (f) => `${f.title ?? ''} ${f.problem ?? ''} ${f.spec ?? ''} ${f.acceptance ?? ''} ${f.solution ?? ''}`.toLowerCase();
const matches = (text, kws) => kws.some((k) => text.includes(k));

/** True when a shipped feature mentions any keyword (keywords from FEATURE_KEYWORDS or a table-stake). */
export function hasFeature(state, keywords) {
  const kws = Array.isArray(keywords) ? keywords : FEATURE_KEYWORDS[keywords] ?? [];
  return shippedFeatures(state).some((f) => matches(featureText(f), kws));
}

/** Table stakes for the current type: [{ id, label, shipped }]. */
export function tableStakes(state, type = customerTypeOf(state)) {
  const p = profileOf(state, type);
  return (p?.tableStakes ?? []).map((t) => ({ id: t.id, label: t.label, shipped: hasFeature(state, t.keywords) }));
}

// ---- Upmarket readiness -----------------------------------------------------------------------------------------

const soc2Status = (state) => {
  const s = state.apps.legal?.soc2;
  if (s === true) return 'report';
  if (typeof s !== 'string' || s === 'none') return s && typeof s === 'object' ? 'started' : 'none';
  if (s === 'type1' || s === 'type2') return 'report';
  if (s === 'type2_in_progress') return 'report'; // the Type I report stays on hand during the Type II window
  return 'started';
};
const refCustomers = (state, minMrr) => activeSubs(state).filter((s) => monthlyAmount(s) >= minMrr && state.day - (s.firstPaidDay ?? s.startDay) >= 180).length;
const bestAnnualPlan = (state) => Math.max(0, ...state.plans.filter((p) => p.active).map((p) => (p.interval === 'year' ? p.price : p.price * 12)));

/** Where the company stands on the move to `target` ('mid_market' | 'enterprise'): weighted checks and a 0..1 score. */
export function readiness(state, target = UPMARKET.ladder[customerTypeOf(state)]) {
  const checks = UPMARKET.checks[target];
  if (!checks) return { target: null, score: 0, checks: [], ready: false };
  const out = checks.map((c) => {
    let ok = false, have = '';
    if (c.mrr) { const v = mrr(state); ok = v >= c.mrr; have = money(v); }
    else if (c.refs) { const v = refCustomers(state, c.refMrr); ok = v >= c.refs; have = String(v); }
    else if (c.feature) { ok = hasFeature(state, c.feature); have = ok ? 'shipped' : 'not shipped'; }
    else if (c.soc2) { const st = soc2Status(state); ok = c.soc2 === 'started' ? st !== 'none' : st === 'report'; have = st; }
    else if (c.planAnnual) { const v = bestAnnualPlan(state); ok = v >= c.planAnnual; have = `${money(v)}/yr`; }
    return { id: c.id, label: c.label, weight: c.weight, ok, have };
  });
  const tot = out.reduce((a, c) => a + c.weight, 0);
  const score = round2(out.reduce((a, c) => a + (c.ok ? c.weight : 0), 0) / Math.max(1e-9, tot));
  return { target, score, checks: out, ready: score >= UPMARKET.readyAt };
}

/**
 * Move to the next customer type up the ladder. The company's business model switches to enterprise-style sales when
 * the target runs on it. Existing customers keep the type they were sold under. Not ready: allowed (the player owns the
 * call) but logged as a mistake with its costs, and deals and conversion carry a penalty until the gaps are closed.
 * Returns { ok, error?, hoursCost, readiness, premature }. dryRun returns the plan without changing anything.
 */
export function moveUpmarket(state, { target = null, dryRun = false } = {}) {
  const from = customerTypeOf(state);
  const to = target ?? UPMARKET.ladder[from];
  if (!from || !to || UPMARKET.ladder[from] !== to) return { ok: false, error: from ? 'Already at the top of the ladder.' : 'Pick who you sell to first.', hoursCost: 0 };
  const r = readiness(state, to);
  const hoursCost = UPMARKET.hours[to] ?? 24;
  const premature = !r.ready;
  if (dryRun) return { ok: true, hoursCost, usdCost: 0, readiness: r, premature, from, to };
  const S = ensureSegment(state);
  const prevModel = state.company.model;
  state.company.customerType = to;
  const model = CUSTOMER_TYPES[to].model;
  if (model !== prevModel) { state.company.model = model; (state.company.modelHistory ??= []).push({ day: state.day, from: prevModel, to: model, why: 'moved upmarket' }); }
  S.transition = { day: state.day, from, to, readiness: r.score, premature, missing: r.checks.filter((c) => !c.ok).map((c) => c.label), smbBase: activeSubs(state).filter((s) => isSmbType(s.customerType)).length };
  S.history.push({ day: state.day, from, to, readiness: r.score, premature });
  log(state, 'info', `Moved upmarket: now selling to ${CUSTOMER_TYPES[to].label.toLowerCase()} (readiness ${Math.round(r.score * 100)}%).`, 'segment');
  if (premature) {
    const gap = (UPMARKET.readyAt - r.score) / UPMARKET.readyAt;
    logMistake(state, {
      functionId: FUNCTION_ID, id: 'premature_upmarket', label: `Moved to ${CUSTOMER_TYPES[to].short.toLowerCase()} before the basics were in place`,
      cost: { hours: Math.round(60 + 200 * gap), days: Math.round(UPMARKET.premature.maxCycleDays * gap), usd: 0 },
      detail: `Readiness ${Math.round(r.score * 100)}% (ready at ${Math.round(UPMARKET.readyAt * 100)}%). Missing: ${S.transition.missing.join('; ')}. Upmarket buyers stall or drop deals at security review, reference calls and procurement until these exist; expect longer cycles and fewer wins.`,
      app: 'segment', circles: false,
    });
  }
  return { ok: true, hoursCost, readiness: r, premature, from, to };
}

/** Close-probability multiplier for a deal while an unready upmarket move is in force (fades as the gaps close). */
export function upmarketDealMult(state, deal) {
  const T = state.apps.segment?.transition;
  if (!T?.premature || state.day - T.day > UPMARKET.premature.days) return 1;
  if (deal && (deal.amount ?? 0) < 5000) return 1; // small deals do not hit security review or references
  const r = readiness(state, T.to);
  if (r.ready) return 1;
  const gap = (UPMARKET.readyAt - r.score) / UPMARKET.readyAt;
  return round2(1 - UPMARKET.premature.maxDealWinPenalty * clamp(gap, 0, 1));
}

// ---- Daily ------------------------------------------------------------------------------------------------------

const MOD_KEYS = ['customer-type:stakes', 'customer-type:season', 'customer-type:macro', 'customer-type:upmarket', 'customer-type:freeze'];
const clearMods = (state) => { for (const k of MOD_KEYS) for (const kind of ['churn', 'conversion', 'landing']) setModifier(state, kind, k, null); };

const once = (S, key) => { if (S.logged[key]) return false; S.logged[key] = true; return true; };

/** Generic macro world events (not the type-specific ones) amplified by how sensitive this type is to the economy. */
function macroAmp(state, p) {
  const W = state.apps.world;
  const mods = ensureMarket(state).modifiers.churn;
  let w = 1;
  for (const i of W?.active ?? []) {
    if (i.status !== 'active' || i.category !== 'macro' || ['startup_funding_winter', 'main_street_slowdown', 'dtc_cost_squeeze'].includes(i.eventId)) continue;
    w *= mods[`world:${i.id}`] ?? 1;
  }
  return w > 1 ? Math.pow(w, (p.macro?.churnSensitivity ?? 1) - 1) : 1;
}

export function segmentDay(state) {
  const p = profileOf(state);
  if (!p) { if (state.apps.segment) clearMods(state); return; }
  const S = ensureSegment(state);
  const month = monthIndex(state);
  const live = hasProduct(state);

  // Table stakes: each missing one costs trial conversion and adds "missing feature" churn [design ×0.85 / ×1.08].
  const stakes = tableStakes(state);
  const missing = stakes.filter((t) => !t.shipped).length;
  setModifier(state, 'conversion', 'customer-type:stakes', live && missing ? round2(Math.pow(0.85, missing)) : null);
  setModifier(state, 'churn', 'customer-type:stakes', live && missing ? round2(Math.pow(1.08, missing)) : null);

  // Seasonality (January churn wave for stores and shops) and macro sensitivity.
  setModifier(state, 'churn', 'customer-type:season', p.seasonality?.churn?.[month + 1] ?? null);
  const amp = macroAmp(state, p);
  setModifier(state, 'churn', 'customer-type:macro', amp !== 1 ? round2(amp) : null);

  // Unready upmarket move: conversion penalty that fades as the gaps close.
  const T = S.transition;
  let upConv = null;
  if (T?.premature && state.day - T.day <= UPMARKET.premature.days) {
    const r = readiness(state, T.to);
    if (!r.ready) upConv = round2(1 - UPMARKET.premature.maxConversionPenalty * clamp((UPMARKET.readyAt - r.score) / UPMARKET.readyAt, 0, 1));
  }
  setModifier(state, 'conversion', 'customer-type:upmarket', upConv);

  // The SMB base after moving upmarket: without a self-serve plan they feel abandoned and churn faster.
  if (T && isSmbType(T.from)) {
    const selfServe = state.plans.some((pl) => pl.active && pl.interval === 'month' && pl.price <= UPMARKET.selfServeMaxMonthly);
    let n = 0;
    for (const sub of activeSubs(state)) {
      if (!isSmbType(sub.customerType)) continue;
      sub.ctChurnMult = selfServe ? 1 : UPMARKET.smbNeglectChurnMult;
      if (!selfServe) n++;
    }
    if (!selfServe && n >= 5 && once(S, `smb_neglect:${T.day}`)) {
      const at = activeSubs(state).filter((s) => isSmbType(s.customerType));
      const lost = at.reduce((a, s) => a + monthlyAmount(s), 0) * 12 * 0.15;
      logMistake(state, { functionId: FUNCTION_ID, id: 'abandoned_smb_base', label: 'Dropped the self-serve plan your existing customers were on', cost: { usd: Math.round(lost), customers: Math.round(n * 0.15) }, detail: `${n} customers from before the move have no self-serve plan to stay on and churn faster. Keep a self-serve tier running next to the enterprise motion. Game estimate: ~${money(lost)} of annual revenue at risk.`, app: 'segment' });
    }
  }

  peakFreezeDay(state, S, p, month);
  if (dayOfMonth(state) === 1) monthly(state, S, p);
}

// E-commerce: shipping a feature in the Black Friday window breaks stores at the worst moment.
function peakFreezeDay(state, S, p, month) {
  if (customerTypeOf(state) !== 'ecommerce') return;
  const dom = dayOfMonth(state);
  const inFreeze = (month === 10 && dom >= 15) || (month === 11 && dom <= 5);
  const shipped = inFreeze ? shippedFeatures(state).filter((f) => f.shippedDay === state.day) : [];
  if (shipped.length) {
    S.freezeUntil = state.day + 30;
    if (once(S, `freeze:${state.day}`)) {
      const n = activeSubs(state).length;
      logMistake(state, { functionId: FUNCTION_ID, id: 'shipped_in_peak_freeze', label: 'Shipped a change during the Black Friday freeze', cost: { customers: Math.max(1, Math.round(n * 0.02)), reputation: 3 }, detail: `"${shipped[0].title}" went live while merchants were in their busiest week. Stores that broke uninstall and leave one-star reviews; churn is higher for a month. Merchants expect a code freeze from mid-November to early December.`, app: 'segment' });
    }
  }
  setModifier(state, 'churn', 'customer-type:freeze', S.freezeUntil != null && state.day <= S.freezeUntil ? 1.2 : null);
}

function monthly(state, S, p) {
  // Graduation: long-tenured customers grow past what the product does and leave for enterprise tools.
  const needs = p.graduation?.needs ?? [];
  const rate = p.graduation?.outgrowMonthly ?? 0;
  if (rate > 0 && needs.length && !needs.some((k) => hasFeature(state, k))) {
    for (const sub of activeSubs(state)) {
      if (sub.cancelAtPeriodEnd || (sub.paidMonths ?? 0) < 9 || sub.customerType !== customerTypeOf(state)) continue;
      if (rng(state) < rate) {
        sub.churnReason ??= 'outgrew_product';
        cancel(state, sub.id, { atPeriodEnd: true, reason: 'outgrew_product' });
        S.outgrew = (S.outgrew ?? 0) + 1;
        S.outgrewMrr = round2((S.outgrewMrr ?? 0) + monthlyAmount(sub));
      }
    }
    if ((S.outgrew ?? 0) >= 3 && once(S, 'outgrew')) {
      logMistake(state, { functionId: FUNCTION_ID, id: 'customers_outgrew_product', label: 'Your best customers outgrew the product', cost: { customers: S.outgrew, usd: Math.round(S.outgrewMrr * 12) }, detail: `${S.outgrew} customers who had been with you 9+ months left after growing past it (${p.graduation.note}). Shipping ${needs.join(' / ').replace(/_/g, ' ')} keeps them and is the first step upmarket.`, app: 'segment' });
    }
  }

  // Wrong channels: effort and money on channels that do not reach this customer type.
  const acq = S.acq ?? {};
  for (const [c, a] of Object.entries(acq)) {
    const fit = p.channels?.[c] ?? 1;
    if (fit >= 0.5 || a.n < 15) continue;
    const lost = a.n - a.kept;
    if (lost >= 10 && once(S, `channel:${c}`)) {
      const spent = spendOn(state, c);
      logMistake(state, { functionId: FUNCTION_ID, id: 'wrong_channel_for_customer', label: `${CHANNELS[c] ?? c} for ${p.short.toLowerCase()}`, cost: { customers: lost, usd: Math.round(spent * (1 - fit)) }, detail: `${CHANNELS[c] ?? c} reaches few ${p.label.toLowerCase()}: of ${a.n} signups the channel would bring a typical B2B company, ${a.kept} were your buyers. ${p.playbook[0] ?? ''}`, app: 'segment' });
    }
  }

  const subs = activeSubs(state);
  // Missing table stakes once there are customers to lose.
  if (subs.length >= 10) {
    for (const t of tableStakes(state)) {
      if (t.shipped || !once(S, `stake:${t.id}`)) continue;
      logMistake(state, { functionId: FUNCTION_ID, id: 'missing_table_stakes', label: `No ${t.label.toLowerCase()}`, cost: { customers: Math.max(1, Math.round(subs.length * 0.04)) }, detail: `${p.label} expect ${t.label.toLowerCase()} before they buy and stay. Without it fewer trials convert and more customers leave.`, app: 'segment' });
    }
  }

  // Onboarding that does not match the customer (self-serve-only for owners, forced calls for engineers).
  const ob = ensureMarket(state).onboarding ?? 'self';
  const fitOb = (p.onboarding?.[ob] ?? 1) / Math.max(0.01, p.onboarding?.[p.onboarding.best] ?? 1);
  const trials = (state.stripe?.subscriptions ?? []).filter((s) => s.trialEndDay != null && s.customerType === customerTypeOf(state)).length;
  if (fitOb < 0.7 && trials >= 15 && once(S, `onboarding:${ob}`)) {
    logMistake(state, { functionId: FUNCTION_ID, id: 'onboarding_mismatch', label: `"${ob}" onboarding for ${p.short.toLowerCase()}`, cost: { customers: Math.round(trials * 0.1 * (1 - fitOb)) }, detail: `${p.label} convert best with "${p.onboarding.best}" onboarding; "${ob}" converts noticeably fewer trials. ${p.playbook[1] ?? ''}`, app: 'segment' });
  }

  // Support slower than this customer expects (3x their tolerance), checked monthly.
  const med = state.apps.support?.metrics?.medianFrtHours;
  const tol = p.support?.frtToleranceHours ?? 4;
  if (med != null && subs.length >= 5 && med > 3 * tol && once(S, `support:${Math.floor(state.day / 90)}`)) {
    logMistake(state, { functionId: FUNCTION_ID, id: 'slow_support_for_segment', label: `Support too slow for ${p.short.toLowerCase()}`, cost: { customers: Math.max(1, Math.round(subs.length * 0.03)) }, detail: `Median first response ${Math.round(med)} h; ${p.label.toLowerCase()} expect about ${tol} h (${p.support.expects}).`, app: 'segment' });
  }
}

// Ad spend on a channel over the game so far (growth ledger, by source).
function spendOn(state, channel) {
  let sp = 0;
  for (const w of Object.values(state.apps.growth?.cohorts ?? {})) for (const [src, e] of Object.entries(w)) if (channelOf(src) === channel) sp += e.sp ?? 0;
  return sp;
}
