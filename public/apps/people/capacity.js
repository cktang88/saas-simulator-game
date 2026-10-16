// Public People API for other apps (owned by the People app). Signatures are a stable contract;
// new exports may be added, existing ones never change shape.

import { shippedFeatures } from '../../core/market.js';
import { clamp, round2 } from '../../core/util.js';
import { AI_AGENTS } from './catalog.js';
import { rampFactor } from './hiring.js';
import { staffTicketsPerWeek, aiResolveRate } from './support.js';
import { monthlyCostOf, monthlyFxOf } from './payroll.js';
import { outputFor } from './performance.js';
import { repMods } from './comp.js';
import { seEffect } from './gtm-team.js';
import { outageFactor, coverageFrtMult } from './global.js';
import { presenceFactor } from './absence.js';
import { juniorEdge } from './workplace.js';

const members = (state) => state.apps.people?.members ?? [];
const active = (state) => members(state).filter((m) => m.status === 'active' && m.startDay <= state.day);
const humans = (state) => active(state).filter((m) => m.kind !== 'ai_agent');
// An agent billed through a recurring bill only works while that bill is active (cancelled in Bank/Stripe → seat gone).
const billed = (state, m) => !m.recurringId || (state.recurring ?? []).some((r) => r.id === m.recurringId && r.active);
const agents = (state, group) => active(state).filter((m) => m.kind === 'ai_agent' && AI_AGENTS[m.agentType]?.group === group && state.day >= (m.readyDay ?? m.startDay) && billed(state, m));

// Morale and engagement: quiet quitting (people/manage.js, months without 1:1s or feedback) costs ~15% output [design].
export const moraleFactor = (m) => (0.8 + 0.25 * clamp((m.morale ?? 70) / 100, 0, 1)) * (m.quietQuitting ? 0.85 : 1);

// Engineering hours per week from employees and contractors (excludes the founder and AI agents),
// adjusted for skill, ramp-up and morale. AI speed-up is separate: aiCodingMultiplier().
export function devHoursPerWeek(state) {
  return round2(humans(state).filter((m) => m.role === 'engineer')
    .reduce((a, m) => a + (m.hoursPerWeek ?? 40) * (m.productivity ?? 1) * rampFactor(m, state.day) * moraleFactor(m) * outageFactor(m, state.day) * presenceFactor(state, m) * juniorEdge(state, m), 0));
}

// Codebase maturity dampens AI speed-ups: greenfield 1.5–3×, mature codebases ~0.8–1.3× (METR 2025/2026 [P] → [A]).
export function codebaseMaturity(state) {
  return clamp(1 - shippedFeatures(state).length / 25, 0.2, 1);
}

// Pure computation behind aiCodingMultiplier: seats' boosts averaged over (founder + human engineers).
export function computeAiCodingMultiplier(state) {
  let boosts = agents(state, 'coding').map((m) => AI_AGENTS[m.agentType].boost);
  // A coding-agent subscription in the recurring bills that no People member tracks still counts as the founder's seat.
  const linked = new Set(members(state).map((m) => m.recurringId).filter(Boolean));
  // Product's plan picker tags its subscription with r.codingAgent (an AI_AGENTS key) so any vendor counts.
  for (const r of state.recurring ?? []) if (r.active && (r.codingAgent || /claude max/i.test(r.vendor)) && !linked.has(r.id)) boosts.push((AI_AGENTS[r.codingAgent] ?? AI_AGENTS.code_max).boost);
  if (!boosts.length) return 1;
  const slots = 1 + humans(state).filter((m) => m.role === 'engineer').length;
  const top = boosts.sort((a, b) => b - a).slice(0, slots);
  const avg = top.reduce((a, b) => a + b, 0) / slots;
  // Review/tests/diff choices now live per build session in Product (state.apps.product.agent); the old toggle
  // applies only to saves that never opened Product.
  const review = !state.apps.product?.agent && state.apps.people?.aiReview === false ? 1.15 : 1;
  return round2((1 + avg * codebaseMaturity(state)) * review);
}

// Multiplier on founder + team coding speed from AI coding agents (1 = none).
// Always computed fresh (cheap); the value is mirrored to state.apps.people.aiCodingMultiplier for readers.
export function aiCodingMultiplier(state) {
  const v = computeAiCodingMultiplier(state);
  if (state.apps.people) state.apps.people.aiCodingMultiplier = v;
  return v;
}

// Extra bug rate from unreviewed AI code (+10–30% per research §5 [A]); 0 when reviewing.
export function aiBugRate(state) {
  const p = state.apps.people;
  if (!p || p.aiReview !== false || !agents(state, 'coding').length || state.apps.product?.agent) return 0;
  return 0.2;
}

// Support tickets per week the team (people + AI agents) can handle.
export function supportCapacity(state) {
  const model = state.company.model;
  const staff = humans(state).filter((m) => m.role === 'support')
    .reduce((a, m) => a + staffTicketsPerWeek(model) * ((m.hoursPerWeek ?? 40) / 40) * (m.productivity ?? 1) * rampFactor(m, state.day) * moraleFactor(m) * outageFactor(m, state.day) * presenceFactor(state, m) * juniorEdge(state, m), 0);
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
  return round2(members(state).filter((m) => m.status === 'active' || m.status === 'offer').reduce((a, m) => a + monthlyCostOf(state, m) + monthlyFxOf(state, m), 0));
}

// Unanswered support tickets waiting (Helpdesk slice if present, else the People aggregate model).
export function supportBacklog(state) {
  const t = state.apps.support?.tickets;
  // Written conversations plus the aggregate routine queue (where most Helpdesk tickets wait).
  if (Array.isArray(t)) return t.filter((x) => ['open', 'pending', 'new'].includes(x.status)).length + (state.apps.support.queue ?? []).reduce((a, q) => a + (q.n ?? 0), 0);
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

// ---------------------------------------------------------------------------
// On-the-job outputs from hidden traits (public/data/roles.js ROLES[*].outputs). Other apps read these.
// ---------------------------------------------------------------------------

// One output of one member, e.g. memberOutput(state, id, 'bugRateMult'|'velocityMult'|'quotaAttainment'|'csat'|
// 'contentQuality'|'cacMult'|'winRateMult'|'meetingsPerMonth'|…). Null if the member or output doesn't exist.
export function memberOutput(state, memberId, key) {
  const m = members(state).find((x) => x.id === memberId);
  return m ? outputFor(m, key) : null;
}

// Bug-rate multiplier of the engineering team (dev-hour weighted; 1 = median engineer).
export function teamBugRateMult(state) {
  const eng = humans(state).filter((m) => m.role === 'engineer');
  let w = 0, s = 0;
  for (const m of eng) { const h = (m.hoursPerWeek ?? 40) * rampFactor(m, state.day); w += h; s += h * (outputFor(m, 'bugRateMult') ?? 1); }
  return w ? round2(s / w) : 1;
}

// Sales capacity for the Sales apps: per-AE attainment (ramp-adjusted) and win-rate multipliers, SDR meetings.
// quotaArr = Σ quota × attainment × ramp (expected new ARR per year from AEs at current ramp).
export function salesCapacity(state) {
  const aes = humans(state).filter((m) => m.role === 'ae').map((m) => {
    const ramp = rampFactor(m, state.day);
    const mods = repMods(state, m); // what the comp plan changes about how this rep sells (people/comp.js)
    return { id: m.id, name: m.name, attainment: outputFor(m, 'quotaAttainment') ?? 0.92, winRateMult: round2((outputFor(m, 'winRateMult') ?? 1) * mods.winMult), discountDepth: outputFor(m, 'discountDepth') ?? 0.12, forecastAccuracy: outputFor(m, 'forecastAccuracy') ?? 0.72, ramp: round2(ramp), quota: mods.quota ?? 960000 };
  });
  const sdrs = humans(state).filter((m) => m.role === 'sdr').map((m) => {
    const mods = repMods(state, m);
    return { id: m.id, name: m.name, meetingsPerMonth: round2((outputFor(m, 'meetingsPerMonth') ?? 9) * rampFactor(m, state.day) * mods.meetingsMult), replyRateMult: outputFor(m, 'replyRateMult') ?? 1, qualifiedRatio: round2(clamp((outputFor(m, 'qualifiedRatio') ?? 0.58) * mods.qualMult, 0.15, 0.9)), junkMeetings: mods.qualMult < 0.95, dealSizeMult: mods.dealSizeMult };
  });
  const quotaArr = round2(aes.reduce((a, x) => a + x.quota * x.attainment * x.ramp, 0));
  const winRateMult = aes.length ? round2(aes.reduce((a, x) => a + x.winRateMult * x.ramp, 0) / Math.max(0.01, aes.reduce((a, x) => a + x.ramp, 0))) : 1;
  return { aes, sdrs, quotaArr, winRateMult, meetingsPerMonth: round2(sdrs.reduce((a, x) => a + x.meetingsPerMonth, 0)), se: seEffect(state) };
}

// Support quality for the Helpdesk: staff CSAT, first-response multiplier and escalation rate (staff-weighted).
export function supportQuality(state) {
  const staff = humans(state).filter((m) => m.role === 'support');
  if (!staff.length) return { staff: 0, csat: null, firstResponseMult: 1, escalationRate: null, ticketsPerWeek: supportCapacity(state) };
  const avg = (k, d) => round2(staff.reduce((a, m) => a + (outputFor(m, k) ?? d), 0) / staff.length);
  // Coverage across time zones: staff working while your customers are asleep, with no handoff plan, answer slower in
  // your business hours; planned follow-the-sun coverage answers faster around the clock (people/global.js).
  const coverage = coverageFrtMult(state);
  return { staff: staff.length, csat: avg('csat', 0.85), firstResponseMult: round2(avg('firstResponseMult', 1) * coverage), escalationRate: avg('escalationRate', 0.18), ticketsPerWeek: supportCapacity(state), coverageMult: coverage };
}

// Marketing quality: content quality 0–100 and blended CAC multiplier from marketers/writers.
export function marketingQuality(state) {
  const mk = humans(state).filter((m) => m.role === 'marketer');
  if (!mk.length) return { people: 0, contentQuality: null, cacMult: 1, experimentsPerMonth: 0 };
  const vals = (k) => mk.map((m) => outputFor(m, k)).filter((v) => v != null);
  const mean = (a, d) => (a.length ? round2(a.reduce((x, y) => x + y, 0) / a.length) : d);
  return { people: mk.length, contentQuality: mean(vals('contentQuality'), 60), cacMult: mean(vals('cacMult'), 1), experimentsPerMonth: round2(vals('experimentsPerMonth').reduce((a, b) => a + b, 0)) };
}
