// Public People API for other apps (owned by the People app). Signatures are a stable contract;
// new exports may be added, existing ones never change shape.

import { shippedFeatures } from '../../core/market.js';
import { clamp, round2 } from '../../core/util.js';
import { AI_AGENTS } from './catalog.js';
import { rampFactor } from './hiring.js';
import { staffTicketsPerWeek, aiResolveRate } from './support.js';
import { monthlyCostOf } from './payroll.js';

const members = (state) => state.apps.people?.members ?? [];
const active = (state) => members(state).filter((m) => m.status === 'active' && m.startDay <= state.day);
const humans = (state) => active(state).filter((m) => m.kind !== 'ai_agent');
const agents = (state, group) => active(state).filter((m) => m.kind === 'ai_agent' && AI_AGENTS[m.agentType]?.group === group && state.day >= (m.readyDay ?? m.startDay));

export const moraleFactor = (m) => 0.8 + 0.25 * clamp((m.morale ?? 70) / 100, 0, 1);

// Engineering hours per week from employees and contractors (excludes the founder and AI agents),
// adjusted for skill, ramp-up and morale. AI speed-up is separate: aiCodingMultiplier().
export function devHoursPerWeek(state) {
  return round2(humans(state).filter((m) => m.role === 'engineer')
    .reduce((a, m) => a + (m.hoursPerWeek ?? 40) * (m.productivity ?? 1) * rampFactor(m, state.day) * moraleFactor(m), 0));
}

// Codebase maturity dampens AI speed-ups: greenfield 1.5–3×, mature codebases ~0.8–1.3× (METR 2025/2026 [P] → [A]).
export function codebaseMaturity(state) {
  return clamp(1 - shippedFeatures(state).length / 25, 0.2, 1);
}

// Pure computation behind aiCodingMultiplier: seats' boosts averaged over (founder + human engineers).
export function computeAiCodingMultiplier(state) {
  let boosts = agents(state, 'coding').map((m) => AI_AGENTS[m.agentType].boost);
  if (!state.apps.people && (state.recurring ?? []).some((r) => r.active && /claude max/i.test(r.vendor))) boosts = [AI_AGENTS.code_max.boost];
  if (!boosts.length) return 1;
  const slots = 1 + humans(state).filter((m) => m.role === 'engineer').length;
  const top = boosts.sort((a, b) => b - a).slice(0, slots);
  const avg = top.reduce((a, b) => a + b, 0) / slots;
  const review = state.apps.people?.aiReview === false ? 1.15 : 1; // skipping review is faster… and buggier
  return round2((1 + avg * codebaseMaturity(state)) * review);
}

// Multiplier on founder + team coding speed from AI coding agents (1 = none).
export function aiCodingMultiplier(state) {
  return state.apps.people?.aiCodingMultiplier ?? computeAiCodingMultiplier(state);
}

// Extra bug rate from unreviewed AI code (+10–30% per research §5 [A]); 0 when reviewing.
export function aiBugRate(state) {
  const p = state.apps.people;
  if (!p || p.aiReview !== false || !agents(state, 'coding').length) return 0;
  return 0.2;
}

// Support tickets per week the team (people + AI agents) can handle.
export function supportCapacity(state) {
  const model = state.company.model;
  const staff = humans(state).filter((m) => m.role === 'support')
    .reduce((a, m) => a + staffTicketsPerWeek(model) * ((m.hoursPerWeek ?? 40) / 40) * rampFactor(m, state.day) * moraleFactor(m), 0);
  let ai = 0;
  if (agents(state, 'support').length) {
    const last = state.apps.people?.support?.lastWeek?.total ?? 0;
    const agent = agents(state, 'support')[0];
    ai = last * aiResolveRate(state.apps.people?.support?.docsQuality ?? 0, (state.day - (agent.readyDay ?? agent.startDay)) / 30.4, model);
  }
  return Math.round(staff + ai);
}

// Option grants for the cap table: [{ name, pct, vestingStartDay }] (+ cliffDay, vestYears, strike when known).
export function optionGrants(state) {
  return active(state).filter((m) => m.equityPct > 0 && m.grant?.status !== 'pending')
    .map((m) => ({ name: m.name, pct: m.equityPct, vestingStartDay: m.grant?.vestStart ?? m.startDay, cliffDay: m.grant?.cliffDay, vestYears: m.grant?.vestYears ?? 4, strike: m.grant?.strike ?? null }));
}

// Contractor payments in a calendar year (for 1099-NEC: US contractors paid ≥ $2,000 in 2026+).
export function contractorPayments(state, year) {
  return members(state).filter((m) => m.engagement === 'contractor' && (m.paidByYear?.[year] ?? 0) > 0)
    .map((m) => ({ id: m.id, name: m.name, region: m.region, amount: m.paidByYear[year], cor: Boolean(m.cor) }));
}

// Active AI SDR (for the Outreach app): { vendor, quality 0..1 vs a good human SDR, monthly } or null.
export function aiSdr(state) {
  const m = agents(state, 'sdr')[0];
  if (!m) return null;
  const a = AI_AGENTS[m.agentType];
  return { id: m.id, vendor: a.label, quality: a.quality, monthly: a.monthly };
}

// Active AI bookkeeping agent (for the Books app): { vendor, errorRate } or null.
export function bookkeepingAgent(state) {
  const m = agents(state, 'books')[0];
  return m ? { id: m.id, vendor: AI_AGENTS[m.agentType].label, errorRate: AI_AGENTS[m.agentType].errorRate } : null;
}

// Headcount summary and fully loaded monthly people cost.
export function headcount(state) {
  const h = humans(state);
  return { employees: h.filter((m) => m.engagement === 'employee' || m.engagement === 'eor').length, contractors: h.filter((m) => m.engagement === 'contractor').length, agents: active(state).filter((m) => m.kind === 'ai_agent').length };
}
export function monthlyPeopleCost(state) {
  return round2(members(state).filter((m) => m.status === 'active' || m.status === 'offer').reduce((a, m) => a + monthlyCostOf(state, m), 0));
}

// Unanswered support tickets waiting (Helpdesk slice if present, else the People aggregate model).
export function supportBacklog(state) {
  const t = state.apps.support?.tickets;
  if (Array.isArray(t)) return t.filter((x) => ['open', 'pending', 'new'].includes(x.status)).length;
  return Math.round(state.apps.people?.support?.backlog ?? 0);
}

// Median first-response time in hours over the last week (null when unknown).
export function firstResponseHours(state) {
  const hd = state.apps.support;
  if (Array.isArray(hd?.tickets)) return hd.metrics?.firstResponseHours ?? null;
  return state.apps.people?.support?.lastWeek?.firstResponseHours ?? null;
}

// Founder-written help-center quality 0..1 (cuts ticket volume and raises AI resolution).
export const helpDocsQuality = (state) => state.apps.people?.support?.docsQuality ?? 0;
