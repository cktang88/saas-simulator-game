// Support load model. Weekly tickets come from paying customers (more in their first month) and trials;
// the AI agent resolves a share, human support staff handle what they can, the founder covers the rest up
// to a self-imposed cap, and anything left becomes backlog. Slow first responses raise churn.
// Calibration: docs/research/world-ops-support-life.md §2 via public/data/world.js SUPPORT ([design]
// ranges anchored on vendor-blog benchmarks; the evidence is thin and correlational).

import { clamp, round2, lerp } from '../../core/util.js';
import { SUPPORT as WORLD_SUPPORT } from '../../data/world.js';
import { AI_AGENTS } from './catalog.js';

const TPM = WORLD_SUPPORT.ticketsPerCustomerPerMonth;
const mid = ([a, b]) => (a + b) / 2;
const WEEKS_PER_MONTH = 4.33;

export const SUPPORT = {
  // tickets per paying customer per MONTH (midpoint of the research range), tier-1 share, minutes per ticket [design]
  b2c: { perCustomerMonth: mid(TPM.b2c), tier1: 0.8, minutes: 6, label: 'many small tickets' },
  smb: { perCustomerMonth: mid(TPM.smb), tier1: 0.65, minutes: 15, label: 'moderate, some setup help' },
  ent: { perCustomerMonth: 0.7, tier1: 0.4, minutes: 60, label: 'few accounts, heavy tickets (per account)' }, // research §2.1: high-touch 0.5–1.0/account/month (review S3)
  firstMonthMult: mid(TPM.firstMonthMult), // ×2–3 in a customer's first month
  trialMult: 1.5, // trial users ask setup questions [design]
  goodDocsMult: TPM.goodDocsMult, // great help docs cut volume ~30% [design]
  staffHoursPerWeek: 32, // productive hours of a full-time specialist [design]
  backlogCarry: 0.5, // half of unanswered tickets still wait next week; the rest give up [design]
  frt: WORLD_SUPPORT.firstResponse.churnMultByMedianFRT,
  aiYearOne: WORLD_SUPPORT.aiResolution.gameYearOne, // 30–55%
  aiMature: WORLD_SUPPORT.aiResolution.gameMature, // 55–70%
};

// Expected tickets this week. newCustomers = customers in their first month (subset of customers).
export function weeklyTickets(model, customers, trials = 0, { newCustomers = 0, docsQuality = 0 } = {}) {
  const base = SUPPORT[model].perCustomerMonth / WEEKS_PER_MONTH;
  const vol = (customers + newCustomers * (SUPPORT.firstMonthMult - 1) + trials * SUPPORT.trialMult) * base;
  return vol * lerp(1, SUPPORT.goodDocsMult, docsQuality);
}

// AI resolution rate of ALL tickets: 30–55% in year one depending on docs, up to 55–70% when mature
// (≥ 12 months live with good docs). Never above the tier-1 share (billing disputes, bugs, angry customers stay human).
export function aiResolveRate(docsQuality, monthsLive = 0, model = 'smb') {
  const dq = clamp(docsQuality, 0, 1);
  const y1 = lerp(SUPPORT.aiYearOne[0], SUPPORT.aiYearOne[1], dq);
  const mature = lerp(SUPPORT.aiMature[0], SUPPORT.aiMature[1], dq);
  const r = lerp(y1, mature, clamp((monthsLive - 6) / 12, 0, 1) * dq);
  return round2(Math.min(r, SUPPORT[model]?.tier1 ?? 0.8));
}

// Tickets/week one human specialist can handle for this business model, at full ramp.
export const staffTicketsPerWeek = (model) => (SUPPORT.staffHoursPerWeek * 60) / SUPPORT[model].minutes;

// Churn multiplier from the median first-response time (hours) [design].
export function frtChurnMult(hours) {
  return SUPPORT.frt.find((t) => hours <= t.maxHours).mult;
}

// Median first-response hours from who answered: AI in minutes, staff ~4h, founder ~8h (or ~24h when the
// founder is at their cap), backlog > 72h [design].
export function medianFirstResponse({ aiResolved = 0, staffHandled = 0, founderHandled = 0, unhandled = 0, founderSaturated = false }) {
  const groups = [[0.05, aiResolved], [4, staffHandled], [founderSaturated ? 24 : 8, founderHandled], [96, unhandled]];
  const total = groups.reduce((a, [, n]) => a + n, 0);
  if (total <= 0) return 0;
  let acc = 0;
  for (const [h, n] of groups) { acc += n; if (acc >= total / 2) return h; }
  return 96;
}

/**
 * One week of support. Pure.
 * { model, newTickets, backlog, ai: { active, docsQuality, monthsLive } | null, staffCapacity, founderCapHours }
 */
export function supportWeek({ model, newTickets, backlog = 0, ai = null, staffCapacity = 0, founderCapHours = 8 }) {
  const cfg = SUPPORT[model];
  const total = newTickets + backlog;
  let queue = total;
  let aiResolved = 0, aiErrors = 0, oversightHours = 0;
  if (ai?.active) {
    const handled = total * aiResolveRate(ai.docsQuality ?? 0, ai.monthsLive ?? 0, model);
    aiErrors = handled * AI_AGENTS.support_ai.errorRate; // confidently wrong answers bounce back angrier [design]
    aiResolved = handled - aiErrors;
    queue -= aiResolved;
    oversightHours = clamp(1 + total / 200, 1, 3); // 1–3 h/wk oversight (hr-legal research §5)
  }
  const staffHandled = Math.min(queue, staffCapacity);
  queue -= staffHandled;
  const founderMax = (founderCapHours * 60) / cfg.minutes;
  const founderHandled = Math.min(queue, founderMax);
  queue -= founderHandled;
  const founderHours = (founderHandled * cfg.minutes) / 60;
  const carried = queue * SUPPORT.backlogCarry;
  const frtHours = medianFirstResponse({ aiResolved, staffHandled, founderHandled, unhandled: queue, founderSaturated: founderHandled >= founderMax * 0.8 && founderHandled > 0 });
  return {
    total: round2(total), aiResolved: round2(aiResolved), aiErrors: round2(aiErrors), staffHandled: round2(staffHandled),
    founderHandled: round2(founderHandled), founderHours: round2(founderHours), unhandled: round2(queue),
    backlog: round2(carried), abandoned: round2(queue - carried), oversightHours: round2(oversightHours),
    firstResponseHours: frtHours,
    churnMult: total >= 1 ? churnMultiplier(frtHours, queue, newTickets, aiErrors) : 1,
  };
}

// First-response-time multiplier, nudged up by an unanswered backlog and wrong AI answers; capped at 1.5.
export function churnMultiplier(frtHours, unhandled = 0, weekly = 0, aiErrors = 0) {
  const base = frtChurnMult(frtHours);
  const extra = weekly > 0 ? clamp((unhandled * 0.1 + aiErrors * 0.5) / weekly, 0, 0.1) : 0;
  return round2(clamp(base + extra, 0.9, 1.5));
}
