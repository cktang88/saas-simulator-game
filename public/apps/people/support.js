// Support load model. Weekly tickets come from paying customers (and trials); the AI agent resolves a
// share of tier-1, human support staff handle what they can, the founder covers the rest up to a
// self-imposed cap, and anything left becomes backlog that raises churn.
// All volumes are game assumptions [A]: no sourced per-customer ticket benchmarks in the research.

import { clamp, round2 } from '../../core/util.js';
import { AI_AGENTS } from './catalog.js';

export const SUPPORT = {
  // tickets per active customer per week, tier-1 share, minutes per ticket [A]
  b2c: { perCustomer: 0.04, perTrial: 0.03, tier1: 0.8, minutes: 6, label: 'many small tickets' },
  smb: { perCustomer: 0.25, perTrial: 0.15, tier1: 0.65, minutes: 15, label: 'moderate, some setup help' },
  ent: { perCustomer: 1.2, perTrial: 0.5, tier1: 0.4, minutes: 40, label: 'few accounts, heavy tickets' },
  staffHoursPerWeek: 32, // productive support hours of a full-time specialist [A]
  backlogCarry: 0.5, // half of the unhandled tickets are still waiting next week; the rest give up [A]
  maxChurnMult: 1.5,
};

export const weeklyTickets = (model, customers, trials = 0) => (customers * SUPPORT[model].perCustomer) + trials * SUPPORT[model].perTrial;

// AI resolution rate of tier-1 tickets given help-center quality (0..1).
export function aiResolveRate(docsQuality) {
  const [lo, hi] = AI_AGENTS.support_ai.resolveRange;
  return lo + (hi - lo) * clamp(docsQuality, 0, 1);
}

// Tickets/week one human specialist can handle for this business model, at full ramp.
export const staffTicketsPerWeek = (model) => (SUPPORT.staffHoursPerWeek * 60) / SUPPORT[model].minutes;

/**
 * One week of support. Pure.
 * { model, newTickets, backlog, ai: { active, docsQuality } | null, staffCapacity, founderCapHours }
 * → { total, aiResolved, aiErrors, staffHandled, founderHandled, founderHours, unhandled, backlog, abandoned, churnMult, oversightHours }
 */
export function supportWeek({ model, newTickets, backlog = 0, ai = null, staffCapacity = 0, founderCapHours = 8 }) {
  const cfg = SUPPORT[model];
  const total = newTickets + backlog;
  let queue = total;
  let aiResolved = 0, aiErrors = 0, oversightHours = 0;
  if (ai?.active) {
    const tier1 = total * cfg.tier1;
    const handled = tier1 * aiResolveRate(ai.docsQuality ?? 0);
    aiErrors = handled * AI_AGENTS.support_ai.errorRate; // wrong answers bounce back to a human
    aiResolved = handled - aiErrors;
    queue -= aiResolved;
    oversightHours = clamp(1 + total / 200, 1, 3); // research: 1–3 h/wk oversight
  }
  const staffHandled = Math.min(queue, staffCapacity);
  queue -= staffHandled;
  const founderMax = (founderCapHours * 60) / cfg.minutes;
  const founderHandled = Math.min(queue, founderMax);
  queue -= founderHandled;
  const founderHours = (founderHandled * cfg.minutes) / 60;
  const carried = queue * SUPPORT.backlogCarry;
  const abandoned = queue - carried;
  return {
    total: round2(total), aiResolved: round2(aiResolved), aiErrors: round2(aiErrors), staffHandled: round2(staffHandled),
    founderHandled: round2(founderHandled), founderHours: round2(founderHours), unhandled: round2(queue),
    backlog: round2(carried), abandoned: round2(abandoned), oversightHours: round2(oversightHours),
    churnMult: churnMultiplier(queue, newTickets, aiErrors),
  };
}

// Unhandled backlog (and confidently wrong AI answers) push churn up, capped.
export function churnMultiplier(unhandled, weekly, aiErrors = 0) {
  if (weekly <= 0 && unhandled <= 0) return 1;
  const ratio = (unhandled + aiErrors * 0.5) / Math.max(1, weekly);
  return round2(clamp(1 + ratio * 0.35, 1, SUPPORT.maxChurnMult));
}
