// Go-to-market compensation plans: the plan designer's model, commission math, settlement into payroll, and the
// way reps react to what the plan pays for. Research: docs/research/gtm-comp/comp-plans.md. Numbers and tags in
// public/data/gtm-comp.js; every behavioural effect below is a [design] assumption, never a statistic.
//
// Flow: the player sets a plan per role (setPlan). Deals the hired team closes create credits (compDay). At each
// period end (month or quarter) compMonthEnd turns each rep's credit into attainment, applies decelerators,
// accelerators, the cap, draws and clawback debt, and adds the result to member.commissionDue, which the existing
// payroll run pays through Gusto/Deel (bank category 'payroll', a separate COMMISSIONS line).
// Pure math (payoutFor, settleDraw, clawbackFor, complexity) has no state and is unit-tested directly.

import { COMP_ROLES, PLAN_DEFAULTS, PLAN_TEMPLATES, BEHAVIOR, OTE_MARKET } from '../../data/gtm-comp.js';
import { clamp, round2, rng, chance, uid, dateOf, dayOfMonth } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { jobRoleOf } from './catalog.js';
import { outputFor } from './performance.js';
import { rampFactor } from './hiring.js';

// ---------------------------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------------------------

const KEY_OF_JOB_ROLE = Object.fromEntries(Object.entries(COMP_ROLES).map(([k, r]) => [r.jobRole, k]));
/** Plan key ('sdr'|'ae'|'founding_ae'|'am'|'csm'|'se') for a team member or job role id; null for roles without a plan. */
export const planKeyOf = (m) => KEY_OF_JOB_ROLE[typeof m === 'string' ? m : jobRoleOf(m)] ?? null;

const ROLE_PLAN_OVERRIDES = {
  sdr: { period: 'monthly', clawbackDays: 0, drawMonths: 3, drawPct: 1, decelBelow: 0, accelMult: 1.25, discountAuthority: 0 },
  ae: { period: 'quarterly' },
  founding_ae: { period: 'quarterly', clawbackDays: 120, drawMonths: 4, drawRecoverable: true, accelMult: 2, founderCredit: 'full' },
  am: { period: 'quarterly', clawbackDays: 90, drawMonths: 2, discountAuthority: 0.1 },
  csm: { period: 'quarterly', clawbackDays: 0, drawMonths: 2, accelMult: 1.25, decelBelow: 0.8, cap: 1.5, payTiming: 'booking', discountAuthority: 0 },
  se: { period: 'quarterly', clawbackDays: 0, drawMonths: 2, accelMult: 1.25, decelBelow: 0.6, cap: null, discountAuthority: 0 },
};

export function defaultPlan(key) {
  const r = COMP_ROLES[key];
  if (!r) throw new Error(`No comp plan for ${key}`);
  return {
    role: key, template: 'bridge_default', version: 1, setDay: null, changedDay: null,
    ote: r.ote, basePct: r.basePct, metric: r.metric, quota: r.quotas[r.metric], rate: null,
    ...PLAN_DEFAULTS, ...ROLE_PLAN_OVERRIDES[key],
  };
}

export function ensureComp(state) {
  const p = (state.apps.people ??= { members: [] });
  p.comp ??= { plans: {}, changes: [], credits: [], payouts: [], events: [], debt: {}, stats: { capHits: 0, sandbagged: 0, clawbacks: 0, clawedUsd: 0, paidUsd: 0, midyear: 0 } };
  const c = p.comp;
  c.plans ??= {}; c.credits ??= []; c.payouts ??= []; c.events ??= []; c.changes ??= []; c.debt ??= {};
  c.stats ??= { capHits: 0, sandbagged: 0, clawbacks: 0, clawedUsd: 0, paidUsd: 0, midyear: 0 };
  return c;
}

/** The live plan for a role (created from researched defaults on first read). */
export function planFor(state, key) {
  const c = ensureComp(state);
  return (c.plans[key] ??= defaultPlan(key));
}

export const targetVariable = (plan) => round2(plan.ote * (1 - plan.basePct));
export const baseOf = (plan) => Math.round(plan.ote * plan.basePct);
/** Commission per unit of credit: variable at target / quota, unless the player overrides it. */
export const rateOf = (plan) => (plan.rate != null && plan.rate > 0 ? plan.rate : targetVariable(plan) / Math.max(1e-9, plan.quota));
export const autoRate = (plan) => targetVariable(plan) / Math.max(1e-9, plan.quota);
export const marketOte = (key) => COMP_ROLES[key]?.marketOte ?? COMP_ROLES[key]?.ote ?? 0;

/** How hard the plan is to understand (tiers, decelerators, caps, SPIFFs, clawbacks, draws...). */
export function complexity(plan) {
  const w = BEHAVIOR.complexityWeights;
  let c = 0;
  if (plan.accelMult > 1) c += w.accelTier;
  if (plan.decelBelow > 0 && plan.decelMult < 1) c += w.decel;
  if (plan.cap != null) c += w.cap;
  if (plan.spiffPerUnit > 0) c += w.spiff;
  if (plan.clawbackDays > 0) c += w.clawback;
  if (plan.drawMonths > 0) c += w.draw;
  if (plan.payTiming === 'cash') c += w.cashBasis;
  if (plan.founderCredit !== 'full') c += w.founderCredit;
  if (plan.rate != null && plan.rate > 0 && Math.abs(plan.rate / autoRate(plan) - 1) > 0.02) c += 1;
  return round2(c);
}

function normalize(key, plan) {
  const r = COMP_ROLES[key];
  const p = { ...plan };
  p.ote = clamp(Math.round(Number(p.ote) || r.ote), 20000, 600000);
  p.basePct = clamp(Number(p.basePct) || r.basePct, 0.2, 1);
  if (!r.metrics.includes(p.metric)) p.metric = r.metric;
  p.quota = Number(p.quota) > 0 ? Number(p.quota) : r.quotas[p.metric];
  p.rate = p.rate != null && Number(p.rate) > 0 ? Number(p.rate) : null;
  p.accelAt = clamp(Number(p.accelAt) || 1, 0.5, 2);
  p.accelMult = clamp(Number(p.accelMult) || 1, 1, 4);
  p.decelBelow = clamp(Number(p.decelBelow) || 0, 0, 0.95);
  p.decelMult = clamp(p.decelMult == null ? 0.5 : Number(p.decelMult), 0, 1);
  p.cap = p.cap == null || p.cap === '' || Number(p.cap) <= 0 ? null : clamp(Number(p.cap), 1, 6);
  p.clawbackDays = clamp(Math.round(Number(p.clawbackDays) || 0), 0, 730);
  p.clawbackPct = clamp(p.clawbackPct == null ? 1 : Number(p.clawbackPct), 0, 1);
  p.drawMonths = clamp(Math.round(Number(p.drawMonths) || 0), 0, 9);
  p.drawPct = clamp(p.drawPct == null ? 0.75 : Number(p.drawPct), 0, 1);
  p.drawRecoverable = Boolean(p.drawRecoverable);
  p.payTiming = p.payTiming === 'cash' ? 'cash' : 'booking';
  p.founderCredit = ['full', 'reduced', 'none'].includes(p.founderCredit) ? p.founderCredit : 'reduced';
  p.period = p.period === 'monthly' ? 'monthly' : 'quarterly';
  p.discountAuthority = clamp(Number(p.discountAuthority) || 0, 0, 0.5);
  p.spiffPerUnit = Math.max(0, Number(p.spiffPerUnit) || 0);
  p.spiffUntilDay = p.spiffUntilDay != null ? Number(p.spiffUntilDay) : null;
  return p;
}

/** Template as a plan patch for one role. */
export function templatePatch(key, templateId) {
  const t = PLAN_TEMPLATES[templateId];
  if (!t) throw new Error('Unknown template');
  const r = COMP_ROLES[key];
  const patch = { ...t.apply, template: templateId };
  if (key === 'sdr' && t.sdrMetric) patch.metric = t.sdrMetric;
  if (key === 'csm' && t.csmMetric) patch.metric = t.csmMetric;
  if (t.oteScale) patch.ote = Math.round(r.ote * t.oteScale);
  if (key === 'sdr') { patch.decelBelow = 0; patch.discountAuthority = 0; patch.period = 'monthly'; }
  if (key === 'csm' || key === 'se') { patch.discountAuthority = 0; patch.clawbackDays = 0; }
  if (patch.metric) patch.quota = r.quotas[patch.metric];
  return patch;
}

// Quarter boundaries in game-calendar months (Jan/Apr/Jul/Oct).
const monthOf = (state, day) => dateOf(state, day).getUTCMonth();
const cleanBoundary = (state, day) => monthOf(state, day) % 3 === 0 && dayOfMonth(state, day) <= 14;

/**
 * Set or change a role's plan. Returns { plan, penalties[] }. The first plan for a role with nobody on it is free.
 * Changing a plan outside the first two weeks of a quarter while reps are on it, or redesigning twice in a year,
 * costs morale and raises attrition (BEHAVIOR.midyearChange) and is logged as a mistake. Confusing plans cost morale.
 */
export function setPlan(state, key, patch, { templateId = null } = {}) {
  const c = ensureComp(state);
  const old = planFor(state, key);
  const merged = normalize(key, { ...old, ...(templateId ? templatePatch(key, templateId) : {}), ...patch });
  merged.version = old.version + 1;
  merged.setDay = state.day;
  const changedFields = Object.keys(merged).filter((k) => !['version', 'setDay', 'changedDay'].includes(k) && JSON.stringify(merged[k]) !== JSON.stringify(old[k]));
  const penalties = [];
  if (!changedFields.length) return { plan: old, penalties };
  const reps = reppedMembers(state, key);
  const materially = changedFields.some((k) => !['template', 'discountAuthority'].includes(k));
  merged.changedDay = state.day;
  c.plans[key] = merged;
  c.changes.push({ day: state.day, role: key, fields: changedFields, reps: reps.length });
  if (c.changes.length > 60) c.changes.shift();
  if (reps.length && materially) {
    const recent = c.changes.filter((x) => x.role === key && state.day - x.day <= 365 && x.reps > 0).length;
    const clean = cleanBoundary(state, state.day);
    if (!clean || recent >= 3) {
      const B = BEHAVIOR.midyearChange;
      for (const m of reps) {
        m.morale = clamp((m.morale ?? 70) - B.moraleHit, 0, 100);
        m.compShock = { until: state.day + B.days, day: state.day };
        m.compMoraleDrag = Math.max(m.compMoraleDrag ?? 0, B.moraleHit);
      }
      c.stats.midyear++;
      penalties.push('midyear_plan_change');
      logMistake(state, {
        functionId: 'gtm_comp_design', id: 'midyear_plan_change', label: 'Changed a comp plan in the middle of the period', app: 'people', delayed: true,
        key: `midyear:${key}:${state.day}`, cost: { hours: 3, usd: Math.round(targetVariable(merged) * 0.1 * reps.length), days: 14 }, charge: true,
        detail: `${reps.length} ${COMP_ROLES[key].label} rep(s) were told their rules changed ${clean ? 'for the third time in a year' : 'mid-quarter'} (fields: ${changedFields.join(', ')}). Pay plans should change at a quarter or year start with notice; morale dropped ${B.moraleHit} points and attrition risk runs about ${B.attritionMult}x for ${B.days} days.`,
      });
      notify(state, `Changing the ${COMP_ROLES[key].label} plan mid-period unsettled the team: expect resignations and slower selling for a few months.`, { type: 'warn', app: 'people' });
    }
    if (complexity(merged) >= BEHAVIOR.confusing.complexity) {
      for (const m of reps) m.morale = clamp((m.morale ?? 70) - BEHAVIOR.confusing.moraleHit, 0, 100);
      penalties.push('confusing_plan');
      logMistake(state, {
        functionId: 'gtm_comp_design', id: 'confusing_plan', label: 'Comp plan too complicated to explain', app: 'people', delayed: true, key: `confusing:${key}:${merged.version}`,
        cost: { hours: 2, usd: Math.round(targetVariable(merged) * 0.05 * reps.length) }, charge: true,
        detail: `Complexity ${complexity(merged)} (tiers, decelerators, caps, SPIFFs, clawbacks, draws). Reps cannot predict their pay, disengage, or game the parts they understand; simple plans fit on one page.`,
      });
    }
  }
  return { plan: merged, penalties };
}

function reppedMembers(state, key) {
  return (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.status === 'active' && planKeyOf(m) === key);
}

// ---------------------------------------------------------------------------------------------
// Pure commission math
// ---------------------------------------------------------------------------------------------

/**
 * Payout for one period. attainment = credit / period quota (1 = at quota). The target variable for the period is
 * `tv`. Marginal tiers on the attainment axis: below decelBelow pay decelMult; up to accelAt pay 1x; above pay
 * accelMult. The cap (multiple of the period's target variable, null = uncapped) limits total pay.
 * Returns { pay, uncapped, capped, attainment }.
 */
export function payoutFor(plan, { attainment, tv }) {
  const a = Math.max(0, attainment);
  const d = plan.decelBelow > 0 && plan.decelMult < 1 ? Math.min(a, plan.decelBelow) : 0;
  const mid = Math.min(a, plan.accelAt) - d;
  const hi = Math.max(0, a - plan.accelAt);
  const mult = d * plan.decelMult + Math.max(0, mid) + hi * plan.accelMult;
  const uncapped = round2(tv * mult);
  const capAmount = plan.cap != null ? tv * plan.cap : Infinity;
  const pay = round2(Math.min(uncapped, capAmount));
  return { pay, uncapped, capped: uncapped > capAmount + 0.005, attainment: a };
}

/**
 * Draw during ramp. `earned` is the period's computed commission; the draw is a guaranteed minimum of
 * drawPct x tvPeriod while the rep is inside drawMonths. Non-recoverable: the company eats any shortfall.
 * Recoverable: the shortfall becomes a balance repaid out of later commission above the draw.
 * Returns { pay, balance, drawn }.
 */
export function settleDraw(plan, { monthsIntoJob, earned, balance = 0, tvPeriod }) {
  const inDraw = monthsIntoJob < plan.drawMonths;
  const draw = inDraw ? plan.drawPct * tvPeriod : 0;
  let pay = earned, bal = balance, drawn = 0;
  if (inDraw && earned < draw) {
    pay = draw; drawn = round2(draw - earned);
    if (plan.drawRecoverable) bal += draw - earned;
  } else if (plan.drawRecoverable && bal > 0) {
    const room = inDraw ? earned - draw : earned;
    const rep = Math.min(bal, Math.max(0, room));
    bal -= rep; pay = earned - rep;
  }
  return { pay: round2(pay), balance: round2(bal), drawn };
}

/** Commission to take back when a customer credited to a rep churns or never pays inside the plan's window. */
export function clawbackFor(plan, { commissionPaid, bookDay, endDay }) {
  if (!plan.clawbackDays || commissionPaid <= 0) return 0;
  if (endDay - bookDay > plan.clawbackDays) return 0;
  return round2(commissionPaid * plan.clawbackPct);
}

/** Relative value of a plan to a candidate: expected variable pay as a share of target variable. [design] */
export function planPayoutQuality(plan) {
  let q = 0.88;
  q += (plan.accelMult - 1) * 0.1;
  if (plan.cap != null) q -= Math.max(0, 0.18 - (plan.cap - 1) * 0.08);
  if (plan.decelBelow > 0 && plan.decelMult < 1) q -= 0.04 * (1 - plan.decelMult);
  if (plan.clawbackDays > 0) q -= 0.03 * plan.clawbackPct;
  if (plan.payTiming === 'cash') q -= 0.04;
  if (plan.drawMonths > 0) q += 0.03 * (plan.drawRecoverable ? 0.5 : 1);
  if (plan.rate != null && plan.rate > 0) q *= clamp((plan.rate * plan.quota) / Math.max(1, targetVariable(plan)), 0.5, 1.5);
  return clamp(q, 0.4, 1.3);
}
export const expectedVariable = (plan) => round2(targetVariable(plan) * planPayoutQuality(plan));

// ---------------------------------------------------------------------------------------------
// Hiring: what the plan is worth to a candidate, and OTE vs market
// ---------------------------------------------------------------------------------------------

/**
 * The base-salary equivalent a candidate perceives for an offer, so acceptProbability(cand, offer) sees the plan.
 * Half on the base-vs-ask ratio, half on (base + expected variable + equity) against the market's OTE.
 */
export function effectiveOfferSalary(state, cand, offer) {
  const key = planKeyOf(cand.role);
  if (!key || !(offer.salary > 0)) return offer.salary;
  const plan = planFor(state, key);
  const r = COMP_ROLES[key];
  const marketVar = r.ote * (1 - r.basePct) * planPayoutQuality(defaultPlan(key));
  const equity = (r.equityOtePerPct ?? 0) * (offer.equityPct ?? 0);
  const oteRatio = (offer.salary + expectedVariable(plan) + equity) / (cand.expectation + marketVar);
  const baseRatio = offer.salary / cand.expectation;
  return Math.round(cand.expectation * (0.5 * baseRatio + 0.5 * oteRatio));
}

/** A member's cash OTE at the plan today: contracted base + target variable (+ equity credit, founding AE). */
export function memberOte(state, m) {
  const key = planKeyOf(m);
  if (!key) return null;
  const plan = planFor(state, key);
  const eq = (COMP_ROLES[key].equityOtePerPct ?? 0) * (m.equityPct ?? 0);
  return Math.round((m.salary ?? baseOf(plan)) + targetVariable(plan) + eq);
}
export const oteRatio = (state, m) => { const o = memberOte(state, m); return o == null ? null : o / marketOte(planKeyOf(m)); };

/** Check pay against the market for a member: underpay raises attrition, overpay burns cash. Once per member and direction. */
export function checkOteMarket(state, m) {
  const key = planKeyOf(m);
  if (!key || m.engagement === 'contractor') return null;
  const ratio = oteRatio(state, m);
  const ote = memberOte(state, m);
  m.compOteRatio = round2(ratio);
  if (ratio < OTE_MARKET.underpaid) {
    m.compUnderpaid = true;
    logMistake(state, {
      functionId: 'gtm_comp_design', id: 'ote_below_market', label: 'OTE below the market for the role', app: 'people', delayed: true, key: `ote_low:${m.id}`,
      cost: { usd: Math.round(ote * 0.25), days: 30 }, detail: `${m.name}'s on-target earnings are ${Math.round(ratio * 100)}% of the ${COMP_ROLES[key].label} market (~$${marketOte(key).toLocaleString('en-US')}, ${COMP_ROLES[key].src.includes('[verified]') ? 'benchmark' : 'game assumption'}). Underpaid reps leave 1.6x as often; a replacement costs recruiting fees plus a ${COMP_ROLES[key].rampMonths}-month ramp.`,
    });
  } else m.compUnderpaid = false;
  if (ratio > OTE_MARKET.overpaid) {
    m.compOverpaid = true;
    logMistake(state, {
      functionId: 'gtm_comp_design', id: 'ote_above_market', label: 'OTE far above the market for the role', app: 'people', delayed: true, key: `ote_high:${m.id}`,
      cost: { usd: Math.round(Math.max(0, ote - 1.1 * marketOte(key))) }, detail: `${m.name}'s OTE is ${Math.round(ratio * 100)}% of market: a year of the premium is burn that buys no extra output (payroll is cash you cannot get back).`,
    });
  } else m.compOverpaid = false;
  return ratio;
}

// ---------------------------------------------------------------------------------------------
// How reps behave under the plan
// ---------------------------------------------------------------------------------------------

const NEUTRAL = { winMult: 1, discountAdd: 0, qualMult: 1, meetingsMult: 1, dealSizeMult: 1, quota: null, plan: null };

export function periodBounds(state, plan, day = state.day) {
  const monthly = plan.period === 'monthly';
  let s = day;
  for (let i = 0; i < 400; i++) { if (dayOfMonth(state, s) === 1 && (monthly || monthOf(state, s) % 3 === 0)) break; s--; }
  let e = day;
  for (let i = 0; i < 400; i++) { const n = e + 1; if (dayOfMonth(state, n) === 1 && (monthly || monthOf(state, n) % 3 === 0)) break; e++; }
  return { start: s, end: e, months: monthly ? 1 : 3 };
}

/** Performance modifiers a member's plan implies (read by salesCapacity and the sales engine). */
export function repMods(state, m) {
  const key = planKeyOf(m);
  if (!key || !state.apps.people) return NEUTRAL;
  const plan = planFor(state, key);
  const out = { ...NEUTRAL, plan, quota: plan.quota };
  const defVar = 1 - COMP_ROLES[key].basePct;
  const scale = clamp((1 - plan.basePct) / defVar, 0.5, 1.6);
  if (key === 'sdr') {
    const b = BEHAVIOR.sdr[plan.metric] ?? {};
    out.meetingsMult = 1 + ((b.meetingsMult ?? 1) - 1) * scale;
    out.qualMult = 1 + ((b.qualifiedMult ?? 1) - 1) * scale;
    out.dealSizeMult = b.dealSizeMult ?? 1;
    if (b.lagMonths && m.status === 'active') out.meetingsMult *= 0.97; // paid months after the work: effort drifts
  } else if (key === 'ae' || key === 'founding_ae') {
    const B = plan.clawbackDays === 0 ? BEHAVIOR.noClawback : plan.clawbackDays < 60 ? BEHAVIOR.weakClawback : null;
    if (B) out.winMult *= B.winMult;
    if (plan.payTiming === 'cash') out.winMult *= BEHAVIOR.cashPlan.winMult;
    if (plan.discountAuthority >= BEHAVIOR.discountPressure.authorityAt) out.discountAdd = BEHAVIOR.discountPressure.add * clamp(plan.discountAuthority / 0.3, 0.5, 1.4);
  }
  if (m.compShock && state.day <= m.compShock.until) { out.meetingsMult *= 0.93; out.winMult *= 0.95; }
  if (m.quietQuitting) { out.meetingsMult *= 0.9; }
  return out;
}

/** Quarter-end (period-end) pressure: last 14 days of the period while below quota. */
export function periodEndPressure(state, m) {
  const key = planKeyOf(m);
  if (!key) return false;
  const plan = planFor(state, key);
  const b = periodBounds(state, plan);
  if (b.end - state.day > 14) return false;
  return runningAttainment(state, m, plan) < 1;
}

/** Discount a rep gives on a new proposal: their trait, plus pressure, limited by the plan's discount authority. */
export function discountFor(state, m, traitDiscount) {
  const key = planKeyOf(m);
  if (!key) return { discount: traitDiscount, pressure: false, extra: 0 };
  const plan = planFor(state, key);
  const mods = repMods(state, m);
  const qe = plan.discountAuthority >= BEHAVIOR.discountPressure.authorityAt && periodEndPressure(state, m) ? BEHAVIOR.discountPressure.quarterEndAdd : 0;
  const d = Math.min(plan.discountAuthority > 0 ? plan.discountAuthority : 0.5, traitDiscount + mods.discountAdd + qe);
  return { discount: round2(clamp(d, 0, 0.5)), pressure: qe > 0, extra: round2(Math.max(0, mods.discountAdd + qe)) };
}

// ---------------------------------------------------------------------------------------------
// Credits: what each rep produced
// ---------------------------------------------------------------------------------------------

const FOUNDER_SOURCED = new Set(['network', 'referral', 'founder']);
const founderFactor = (plan, deal) => (FOUNDER_SOURCED.has(deal.source) ? { full: 1, reduced: 0.5, none: 0 }[plan.founderCredit] : 1);

function memberById(state, id) { return (state.apps.people?.members ?? []).find((m) => m.id === id); }

function addCredit(state, c) {
  const comp = ensureComp(state);
  const cr = { id: uid('cr'), day: state.day, cashDay: null, status: 'open', paid: 0, clawed: 0, ...c };
  comp.credits.push(cr);
  if (comp.credits.length > 600) comp.credits.splice(0, comp.credits.length - 600);
  return cr;
}

const dealYears = (deal) => Math.max(1, Math.round(deal.termYears ?? deal.contract?.years ?? 1));

/** Daily: turn won deals into credits, mark cash receipts, apply clawbacks, hold capped reps' deals. */
export function compDay(state) {
  const p = state.apps.people;
  if (!p || !p.members.some((m) => m.kind !== 'ai_agent' && planKeyOf(m))) return;
  const comp = ensureComp(state);
  const deals = state.apps.crm?.deals ?? [];
  const subs = state.stripe?.subscriptions ?? [];
  const subOf = (id) => subs.find((s) => s.id === id);
  // 1. credit newly won deals
  for (const deal of deals) {
    if (deal.stage !== 'won' || deal.compCredited) continue;
    deal.compCredited = true;
    const sub = deal.subscriptionId ? subOf(deal.subscriptionId) : null;
    const ae = deal.ownerAeId ? memberById(state, deal.ownerAeId) : null;
    if (ae && (planKeyOf(ae) === 'ae' || planKeyOf(ae) === 'founding_ae')) {
      const key = planKeyOf(ae), plan = planFor(state, key), mods = repMods(state, ae);
      const years = plan.metric === 'tcv' ? dealYears(deal) : 1;
      const units = round2((deal.amount ?? 0) * years * founderFactor(plan, deal));
      addCredit(state, { memberId: ae.id, key, kind: 'deal', dealId: deal.id, subId: sub?.id ?? null, arr: deal.amount ?? 0, units, founderSourced: FOUNDER_SOURCED.has(deal.source) });
      applyDealBehaviour(state, ae, plan, mods, deal, sub);
    }
    const sdr = deal.sdrId ? memberById(state, deal.sdrId) : null;
    if (sdr && planKeyOf(sdr) === 'sdr') addCredit(state, { memberId: sdr.id, key: 'sdr', kind: 'sdr_won', dealId: deal.id, subId: sub?.id ?? null, arr: deal.amount ?? 0, units: deal.amount ?? 0 });
  }
  // 2. cash receipts for cash-basis credits; 3. clawback on churn / non-payment
  for (const cr of comp.credits) {
    const sub = cr.subId ? subOf(cr.subId) : null;
    if (cr.cashDay == null && sub?.firstPaidDay != null) cr.cashDay = sub.firstPaidDay;
    if (cr.status === 'open' && sub && (sub.status === 'canceled' || sub.status === 'unpaid') && !cr.churnSeen) {
      cr.churnSeen = true;
      cr.churnDay = sub.canceledDay ?? state.day;
      onCreditChurn(state, cr, sub);
    }
  }
  // 4. running cap state (for sandbagging)
  for (const m of p.members) {
    if (m.status !== 'active' || m.kind === 'ai_agent') continue;
    const key = planKeyOf(m);
    if (key !== 'ae' && key !== 'founding_ae') continue;
    const plan = planFor(state, key);
    if (plan.cap == null) { m.cappedOut = null; continue; }
    const b = periodBounds(state, plan);
    const run = runningPay(state, m, plan, b);
    if (run.capped) {
      if (!m.cappedOut || m.cappedOut.end !== b.end) {
        m.cappedOut = { end: b.end, day: state.day };
        comp.stats.capHits++;
        emit(state, 'rep_hit_cap', { memberId: m.id, name: m.name, role: key, label: `${m.name} hit the plan cap`, periodEnd: b.end });
        notify(state, `${m.name} has hit the cap on their ${COMP_ROLES[key].label} plan. Every dollar sold from here earns them nothing this period.`, { type: 'info', app: 'people' });
      }
    } else if (m.cappedOut && m.cappedOut.end !== b.end) m.cappedOut = null;
  }
}

function applyDealBehaviour(state, ae, plan, mods, deal, sub) {
  if (!sub) return;
  // Poor-fit closes when nothing claws the commission back.
  const B = plan.clawbackDays === 0 ? BEHAVIOR.noClawback : plan.clawbackDays < 60 ? BEHAVIOR.weakClawback : null;
  if (B && chance(state, B.poorFitShare)) {
    sub.poorFit = true;
    sub.gtmChurnMult = round2((sub.gtmChurnMult ?? 1) * B.poorFitChurnMult);
    deal.poorFit = true;
  }
  // Booking-paid reps do not care whether the customer pays.
  if (plan.payTiming === 'booking' && sub.invoiceManually && chance(state, BEHAVIOR.bookingsPlan.slowPayShare)) {
    sub.paymentTermsDays = Math.max(sub.paymentTermsDays ?? 30, BEHAVIOR.bookingsPlan.termsDays);
    sub.nonPayMult = BEHAVIOR.bookingsPlan.nonPayMult;
    sub.slowPayBooked = true;
  } else if (plan.payTiming === 'cash') sub.nonPayMult = BEHAVIOR.cashPlan.collectionsMult;
}

function onCreditChurn(state, cr, sub) {
  const comp = ensureComp(state);
  const m = memberById(state, cr.memberId);
  const plan = m ? planFor(state, cr.key) : null;
  const deal = (state.apps.crm?.deals ?? []).find((d) => d.id === cr.dealId);
  if (!plan) return;
  const claw = clawbackFor(plan, { commissionPaid: cr.paid, bookDay: cr.day, endDay: cr.churnDay });
  if (claw > 0) {
    cr.clawed = claw;
    comp.debt[m.id] = round2((comp.debt[m.id] ?? 0) + claw);
    comp.stats.clawbacks++; comp.stats.clawedUsd = round2(comp.stats.clawedUsd + claw);
    emit(state, 'clawback_triggered', { memberId: m.id, name: m.name, subId: sub.id, amount: claw, label: `Clawback $${Math.round(claw).toLocaleString('en-US')} from ${m.name}` });
    notify(state, `Clawback: ${m.name}'s commission on a customer that left inside ${plan.clawbackDays} days ($${Math.round(claw).toLocaleString('en-US')}) comes out of their next payout.`, { type: 'info', app: 'people' });
  } else if ((sub.poorFit || deal?.poorFit) && cr.paid > 0 && cr.churnDay - cr.day <= 270) {
    logMistake(state, {
      functionId: 'gtm_comp_design', id: 'no_clawback_bad_fit_churn', label: 'Paid commission on a poor-fit customer who left', app: 'people', delayed: true, key: `badfit:${cr.id}`,
      cost: { usd: Math.round(cr.paid + (cr.arr || 0) * 0.15), customers: 1, hours: 1 }, charge: true,
      detail: `${m.name} was paid $${Math.round(cr.paid).toLocaleString('en-US')} on a deal that churned ${cr.churnDay - cr.day} days after booking. The plan has ${plan.clawbackDays ? `a ${plan.clawbackDays}-day clawback that this missed` : 'no clawback'}, so closing a customer who was never going to stay cost the rep nothing and cost you the commission, onboarding time and the logo.`,
    });
  }
}

// Running (in-period) credit and pay, used for cap state and period-end pressure.
function creditUnitsIn(state, m, key, plan, start, end) {
  const comp = ensureComp(state);
  let u = 0;
  for (const cr of comp.credits) {
    if (cr.memberId !== m.id) continue;
    if (key === 'sdr' && cr.kind !== 'sdr_won') continue;
    if (key !== 'sdr' && cr.kind !== 'deal') continue;
    const d = plan.payTiming === 'cash' ? cr.cashDay : cr.day;
    if (d != null && d >= start && d <= end) u += cr.units;
  }
  return u;
}

function quotaFor(state, m, plan, months, day = state.day) {
  const relief = clamp(rampFactor(m, day), 0.25, 1);
  return plan.quota * (months / 12) * relief;
}

function runningPay(state, m, plan, b) {
  const key = planKeyOf(m);
  const units = creditUnitsIn(state, m, key, plan, b.start, state.day);
  const q = quotaFor(state, m, plan, b.months);
  const tv = (plan.rate != null && plan.rate > 0 ? plan.rate * plan.quota : targetVariable(plan)) * (b.months / 12);
  return { ...payoutFor(plan, { attainment: units / Math.max(1e-9, q), tv }), units, quota: q, tv };
}
function runningAttainment(state, m, plan) {
  const key = planKeyOf(m);
  if (key !== 'ae' && key !== 'founding_ae') return 1;
  const b = periodBounds(state, plan);
  return creditUnitsIn(state, m, key, plan, b.start, state.day) / Math.max(1e-9, quotaFor(state, m, plan, b.months));
}

/** True when a capped rep has already maxed out this period and a deal of theirs is about to close: they hold it. */
export function sandbagHold(state, deal) {
  if (!deal.ownerAeId || deal.sandbagHeld) return false;
  const m = memberById(state, deal.ownerAeId);
  if (!m || !m.cappedOut || m.cappedOut.end < state.day) return false;
  const comp = ensureComp(state);
  deal.sandbagHeld = true;
  const next = m.cappedOut.end + 1 + Math.floor(rng(state) * 5);
  deal.decisionDay = next;
  comp.stats.sandbagged++;
  m.sandbagCount = (m.sandbagCount ?? 0) + 1;
  logMistake(state, {
    functionId: 'gtm_comp_design', id: 'capped_plan_sandbagging', label: 'A capped rep held a deal for the next period', app: 'people', key: `sandbag:${deal.id}`,
    cost: { usd: Math.round((deal.amount ?? 0) * 0.04), days: Math.max(1, next - state.day) },
    detail: `${m.name} already hit the ${planFor(state, planKeyOf(m)).cap}x cap this period, so a ${'$' + Math.round(deal.amount ?? 0).toLocaleString('en-US')} deal slid ${next - state.day} days into the next period. Top performers sandbag, or leave, when extra effort pays nothing.`,
  });
  return true;
}


/** A held meeting that did not qualify: the AE who ran it loses selling time (1.5h each with prep) [design]. */
export function noteJunkMeeting(state, deal) {
  const comp = ensureComp(state);
  comp.stats.junk = (comp.stats.junk ?? 0) + 1;
  const ae = deal.ownerAeId ? memberById(state, deal.ownerAeId) : null;
  if (ae) { ae.junkThisMonth = (ae.junkThisMonth ?? 0) + 1; ae.junkHours = round2((ae.junkHours ?? 0) + 1.5); }
  const sdr = deal.sdrId ? memberById(state, deal.sdrId) : null;
  if (sdr) { sdr.junkHeld = (sdr.junkHeld ?? 0) + 1; }
}
/** Multiplier on an AE's self-sourced pipeline from time lost to unqualified SDR meetings (1 = none). */
export function junkDrag(state, aeId) {
  const ae = memberById(state, aeId);
  return ae ? 1 - Math.min(0.4, ((ae.junkThisMonth ?? 0) * 1.5) / 100) : 1;
}

// ---------------------------------------------------------------------------------------------
// Events (read by Automations through people/readers.js peopleEvents)
// ---------------------------------------------------------------------------------------------

function emit(state, type, data) {
  const comp = ensureComp(state);
  const ev = { ref: `${type}:${data.memberId ?? data.subId ?? ''}:${state.day}:${comp.events.length}`, type, day: state.day, ...data };
  comp.events.push(ev);
  if (comp.events.length > 200) comp.events.shift();
  return ev;
}
export const compEvents = (state, type, since) => (state.apps.people?.comp?.events ?? []).filter((e) => e.type === type && e.day >= since);

// ---------------------------------------------------------------------------------------------
// Period settlement
// ---------------------------------------------------------------------------------------------

function unitsFor(state, m, key, plan, start, end, hooks) {
  const crm = state.apps.crm;
  if (key === 'ae' || key === 'founding_ae' ) return creditUnitsIn(state, m, key, plan, start, end);
  if (key === 'sdr') {
    const deals = (crm?.deals ?? []).filter((d) => d.sdrId === m.id);
    const at = (d, stage) => (d.history ?? []).find((h) => h.stage === stage)?.day;
    const inWin = (x) => x != null && x >= start && x <= end;
    if (plan.metric === 'meetings_held') return deals.filter((d) => inWin(at(d, 'meeting_held'))).length;
    if (plan.metric === 'qualified_opps') return deals.filter((d) => inWin(at(d, 'qualified'))).length;
    if (plan.metric === 'pipeline_usd') return deals.filter((d) => inWin(at(d, 'proposal'))).reduce((a, d) => a + (d.amount ?? 0), 0);
    return creditUnitsIn(state, m, 'sdr', plan, start, end);
  }
  if (key === 'am') return hooks?.amUnits ? hooks.amUnits(state, m, start, end) : 0;
  if (key === 'se') return hooks?.seUnits ? hooks.seUnits(state, m, start, end) : 0;
  return 0;
}

// Number of countable events (credited deals, held meetings, qualified opportunities) in a window: what a SPIFF pays per.
function countFor(state, m, key, plan, start, end) {
  const comp = ensureComp(state);
  if (key === 'ae' || key === 'founding_ae') return comp.credits.filter((c) => c.memberId === m.id && c.kind === 'deal' && (plan.payTiming === 'cash' ? c.cashDay : c.day) >= start && (plan.payTiming === 'cash' ? c.cashDay : c.day) <= end).length;
  if (key === 'sdr') {
    const at = (d, stage) => (d.history ?? []).find((h) => h.stage === stage)?.day;
    const stage = plan.metric === 'meetings_held' ? 'meeting_held' : plan.metric === 'sourced_closed_won' ? 'won' : 'qualified';
    return (state.apps.crm?.deals ?? []).filter((d) => d.sdrId === m.id && at(d, stage) >= start && at(d, stage) <= end).length;
  }
  return 0;
}

/** Attainment (1 = at target) for the retention-metric CSM plan from the book's measured retention. */
export function csmAttainment(plan, { grr = null, nrr = null, renewalRate = null }) {
  const slope = COMP_ROLES.csm.slopes[plan.metric] ?? 4;
  const v = plan.metric === 'grr' ? grr : plan.metric === 'nrr' ? nrr : renewalRate;
  if (v == null) return null;
  return Math.max(0, 1 + (v - plan.quota) * slope);
}

// Hooks set by gtm-team.js (CSM/AM/SE books) so comp.js has no dependency on the customer apps.
const hooks = { amUnits: null, seUnits: null, csmStats: null };
export function setCompHooks(h) { Object.assign(hooks, h); }

export function isSettlementMonth(state, plan, day = state.day) {
  return plan.period === 'monthly' || monthOf(state, day) % 3 === 2;
}

/** Month-end: settle every rep whose period just ended, update attrition drivers. Called from peopleMonthEnd. */
export function compMonthEnd(state) {
  const p = state.apps.people;
  if (!p) return;
  const comp = ensureComp(state);
  for (const m of p.members) {
    if (m.kind === 'ai_agent' || m.kind === 'cofounder' || m.status !== 'active') continue;
    const key = planKeyOf(m);
    if (!key) continue;
    const plan = planFor(state, key);
    checkOteMarket(state, m);
    if (m.junkThisMonth) m.junkThisMonth = 0;
    if (isSettlementMonth(state, plan)) settleMember(state, comp, m, key, plan);
    updateAttrition(state, comp, m, key, plan);
  }
}

function settleMember(state, comp, m, key, plan) {
  const b = periodBounds(state, plan);
  const start = Math.max(b.start, m.startDay);
  const monthsActive = Math.max(0.1, (b.end - start + 1) / 30.4);
  const months = Math.min(b.months, monthsActive);
  const tvPeriod = (plan.rate != null && plan.rate > 0 ? plan.rate * plan.quota : targetVariable(plan)) * (months / 12);
  let attainment, units = null, quota = null;
  if (key === 'csm') {
    const st = hooks.csmStats ? hooks.csmStats(state, m) : null;
    attainment = st ? csmAttainment(plan, st) : null;
    if (attainment == null) attainment = null;
  } else {
    units = unitsFor(state, m, key, plan, start, b.end, hooks);
    quota = quotaFor(state, m, plan, months, b.end);
    attainment = units / Math.max(1e-9, quota);
  }
  // A rep with no measurable book yet (new CSM) earns only the draw.
  const pay0 = attainment == null ? { pay: 0, uncapped: 0, capped: false, attainment: 0 } : payoutFor(plan, { attainment, tv: tvPeriod });
  let spiff = 0;
  if (plan.spiffPerUnit > 0 && (plan.spiffUntilDay == null || state.day <= plan.spiffUntilDay)) spiff = round2(plan.spiffPerUnit * countFor(state, m, key, plan, start, b.end)); // a flat bonus per closed deal or counted meeting/opportunity while the SPIFF runs
  const monthsIntoJob = (b.start - m.startDay) / 30.4;
  const dr = settleDraw(plan, { monthsIntoJob: Math.max(0, monthsIntoJob), earned: pay0.pay, balance: m.drawBalance ?? 0, tvPeriod });
  m.drawBalance = dr.balance;
  let gross = round2(dr.pay + spiff);
  const debt = comp.debt[m.id] ?? 0;
  const takeBack = Math.min(debt, gross);
  gross = round2(gross - takeBack);
  comp.debt[m.id] = round2(debt - takeBack);
  if (gross > 0) {
    m.commissionDue = round2((m.commissionDue ?? 0) + gross);
    comp.stats.paidUsd = round2(comp.stats.paidUsd + gross);
  }
  // Allocate the commission to credits (pro rata) so clawbacks can take back exactly what was paid on a deal.
  const earnedBase = Math.max(0, dr.pay);
  if (key === 'ae' || key === 'founding_ae' || key === 'sdr') {
    const inP = comp.credits.filter((c) => c.memberId === m.id && (key === 'sdr' ? c.kind === 'sdr_won' : c.kind === 'deal') && (plan.payTiming === 'cash' ? c.cashDay : c.day) != null && (plan.payTiming === 'cash' ? c.cashDay : c.day) >= start && (plan.payTiming === 'cash' ? c.cashDay : c.day) <= b.end);
    const tot = inP.reduce((a, c) => a + c.units, 0);
    for (const c of inP) c.paid = round2(c.paid + (tot > 0 ? earnedBase * (c.units / tot) : 0));
  }
  const rec = {
    day: state.day, memberId: m.id, name: m.name, role: key, period: `${b.months === 1 ? 'month' : 'quarter'} ending ${b.end}`,
    units: units == null ? null : round2(units), quota: quota == null ? null : round2(quota), attainment: round2(attainment ?? 0),
    earned: pay0.pay, accelerated: attainment != null && attainment > plan.accelAt && plan.accelMult > 1, decelerated: attainment != null && plan.decelBelow > 0 && attainment < plan.decelBelow && plan.decelMult < 1,
    capped: pay0.capped, uncapped: pay0.uncapped, draw: dr.drawn, spiff, clawback: round2(takeBack), paid: gross,
  };
  if (key === 'sdr' && plan.metric === 'meetings_held' && (m.junkHeld ?? 0) >= 3) {
    const held = Math.max(1, units ?? 1), junk = Math.min(held, m.junkHeld);
    if (junk / held >= 0.4) {
      logMistake(state, {
        functionId: 'gtm_comp_design', id: 'comp_pays_for_junk_meetings', label: 'Paying an SDR for meetings that do not qualify', app: 'people', key: `junk:${m.id}:${b.end}`,
        cost: { hours: round2(junk * 1.5), usd: Math.round(gross * (junk / held)) }, delayed: true,
        detail: `${m.name} was paid per meeting held: ${junk} of ${held} meetings (${Math.round((100 * junk) / held)}%) were not qualified, costing the AE team ~${round2(junk * 1.5)}h and about $${Math.round(gross * (junk / held)).toLocaleString('en-US')} of commission for nothing. Pay on qualified opportunities (Stage-1 conversions) instead.`,
      });
    }
    m.junkHeld = 0;
  }
  comp.payouts.unshift(rec);
  if (comp.payouts.length > 120) comp.payouts.length = 120;
  m.comp = { ...(m.comp ?? {}), last: rec, history: [...(m.comp?.history ?? []), { day: state.day, att: rec.attainment, paid: gross, tv: round2(tvPeriod) }].slice(-8) };
  emit(state, 'comp_paid', { memberId: m.id, name: m.name, amount: gross, attainment: rec.attainment, label: `Commission $${Math.round(gross).toLocaleString('en-US')} for ${m.name} (${Math.round((attainment ?? 0) * 100)}% of quota)` });
  // Morale follows pay: a rep paid well below target stays unhappy; a capped one resents it.
  const earnedShare = tvPeriod > 0 ? gross / tvPeriod : 1;
  const prevLow = m.comp.lowStreak ?? 0;
  m.comp.lowStreak = earnedShare < 0.5 && attainment != null ? prevLow + 1 : 0;
  if (earnedShare >= 1.2) m.morale = clamp((m.morale ?? 70) + 2, 0, 100);
  else if (earnedShare < 0.5) m.morale = clamp((m.morale ?? 70) - 3, 0, 100);
  if (pay0.capped) {
    m.comp.capCount = (m.comp.capCount ?? 0) + 1;
    m.morale = clamp((m.morale ?? 70) - 2, 0, 100);
  }
}

function updateAttrition(state, comp, m, key, plan) {
  const r = COMP_ROLES[key];
  let mult = clamp(Math.sqrt(r.attrition / 0.13), 1, 1.8); // role market attrition vs the generic 13% base [design]
  const parts = [];
  if (m.compUnderpaid) { mult *= 1.6; parts.push('underpaid'); }
  if (m.compShock && state.day <= m.compShock.until) { mult *= BEHAVIOR.midyearChange.attritionMult; parts.push('plan change'); }
  if (plan.cap != null && (m.comp?.capCount ?? 0) + (m.sandbagCount ?? 0) > 0 && (m.comp?.capCount ?? 0) >= 1) { mult *= BEHAVIOR.sandbag.attritionMult; parts.push('capped'); }
  if (complexity(plan) >= BEHAVIOR.confusing.complexity) { mult *= BEHAVIOR.confusing.attritionMult; parts.push('confusing plan'); }
  if ((m.comp?.lowStreak ?? 0) >= 2) { mult *= 1.4; parts.push('paid well below target'); }
  m.compAttr = round2(mult);
  m.compAttrParts = parts;
  m.compMoraleDrag = (m.compShock && state.day <= m.compShock.until ? BEHAVIOR.midyearChange.moraleHit : 0) + (m.compUnderpaid ? 6 : 0) + (plan.cap != null && (m.comp?.capCount ?? 0) >= 1 ? 4 : 0)
    + ((m.comp?.lowStreak ?? 0) >= 2 ? 5 : 0) + (complexity(plan) >= BEHAVIOR.confusing.complexity ? BEHAVIOR.confusing.moraleHit : 0);
}

/** Share-of-plan stats for the readers and the UI. */
export function compStats(state) {
  const c = ensureComp(state);
  const members = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && planKeyOf(m) && m.status !== 'gone');
  return { members: members.length, ...c.stats, payouts: c.payouts.length, changes: c.changes.length };
}
