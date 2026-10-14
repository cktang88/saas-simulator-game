// Build engine: velocity with 2026 AI coding agents, the build queue, bugs/tech debt, shipping,
// and AI inference cost. Pure functions on the product slice (and read-only state helpers).
//
// Sources: docs/research/hr-legal-product.md §3.1–3.2, §3.5 and §5.
//  - AI dev velocity multiplier [A]: greenfield/prototype 1.5–3×, mature codebase 0.8–1.3×;
//    bug rate +10–30% if unreviewed (METR 2025/2026, YC W25).
//  - Inference cost per active user per month [A, computed from Anthropic list prices 2026-10-06]:
//    light $0.01–0.25, moderate $1–5, heavy agentic $20–100+.
// Every value below is a game assumption inside those ranges, not a measured statistic.

import { clamp } from '../../core/util.js';

export const VELOCITY = {
  // Agent-assisted estimates assume the default 2026 stack at greenfield: one Claude Max seat, which the
  // People app's aiCodingMultiplier() rates 2.0× on a young codebase (decaying toward ~1.2× as it matures).
  estimateRef: 2.0,
  reworkShare: 0.15, // [A] rework/bug hours per shipped hour with reviewed AI code (+aiBugRate if unreviewed)
  debtSlowdownHours: 120, // [A] open bug hours at which velocity halves
  churnPerBugHour: 1 / 300, // [A] churn multiplier slope from an ignored bug backlog
  maxBugChurn: 0.3,
};

// Agent-assisted estimate (young codebase) <-> human-equivalent effort (no AI). feature.effortHours is
// human-equivalent so velocity changes (maturing codebase, more/fewer agent seats) apply automatically.
export const toEffortHours = (agentHours) => Math.round(agentHours * VELOCITY.estimateRef);

export const shippedEffort = (slice) => slice.features.filter((f) => f.status === 'shipped').reduce((a, f) => a + (f.effortHours ?? 0), 0);
export const openBugHours = (slice) => (slice.bugs ?? []).filter((b) => !b.fixedDay).reduce((a, b) => a + Math.max(0, b.hours - (b.progress ?? 0)), 0);
export const debtFactor = (slice) => 1 / (1 + openBugHours(slice) / VELOCITY.debtSlowdownHours);

// Effective multiplier on a raw hour of coding. aiMult = People's aiCodingMultiplier (1 = no agents;
// it already includes codebase maturity: greenfield 1.5–3×, mature 0.8–1.3× per research §5 [A]).
export function speedMultiplier({ aiMult = 1, debt = 1, energy = 100 }) {
  const tired = energy < 30 ? 0.8 : 1; // core clock: <30 energy = "slower and sloppier"
  return Math.max(0.5, aiMult) * debt * tired;
}

// Apply effective (already multiplied) hours. Bugs first for bugShare of the hours, then the queue in order.
// Returns { shipped: [feature], fixed: [bug], used }. Mutates slice.
export function applyBuildHours(slice, effHours, { bugShare = 0, day = 0 } = {}) {
  const shipped = [], fixed = [];
  let bugBudget = effHours * clamp(bugShare, 0, 1);
  let budget = effHours - bugBudget;
  const open = () => (slice.bugs ?? []).filter((b) => !b.fixedDay).sort((a, b) => sev(b) - sev(a) || a.foundDay - b.foundDay);
  for (const b of open()) {
    if (bugBudget <= 1e-9) break;
    const need = b.hours - (b.progress ?? 0);
    const use = Math.min(need, bugBudget);
    b.progress = (b.progress ?? 0) + use;
    bugBudget -= use;
    if (b.progress >= b.hours - 1e-9) { b.fixedDay = day; fixed.push(b); }
  }
  budget += bugBudget; // unused bug time flows to features
  const queue = () => slice.buildQueue.map((id) => slice.features.find((f) => f.id === id)).filter((f) => f && (f.status === 'queued' || f.status === 'building'));
  for (const f of queue()) {
    if (budget <= 1e-9) break;
    const need = Math.max(0, f.effortHours - (f.progressHours ?? 0));
    const use = Math.min(need, budget);
    f.progressHours = (f.progressHours ?? 0) + use;
    budget -= use;
    if (f.status === 'queued' && f.progressHours > 0) { f.status = 'building'; f.startedDay ??= day; }
    if (f.progressHours >= f.effortHours - 1e-9) {
      f.status = 'shipped';
      f.shippedDay = day;
      f.progressHours = f.effortHours;
      shipped.push(f);
    }
  }
  slice.buildQueue = slice.buildQueue.filter((id) => slice.features.some((f) => f.id === id && (f.status === 'queued' || f.status === 'building')));
  // Leftover with no queue goes into open bugs.
  if (budget > 1e-9) for (const b of open()) {
    if (budget <= 1e-9) break;
    const use = Math.min(b.hours - (b.progress ?? 0), budget);
    b.progress = (b.progress ?? 0) + use;
    budget -= use;
    if (b.progress >= b.hours - 1e-9) { b.fixedDay = day; fixed.push(b); }
  }
  return { shipped, fixed, used: effHours - budget };
}
const sev = (b) => ({ high: 3, medium: 2, low: 1 }[b.severity] ?? 1);

// Rework from a shipped feature: bugs found in QA and by first users. rand: () => [0,1).
const BUG_TEMPLATES = ['Edge case in "%s" breaks on empty data', '"%s" fails silently when the integration token expires', 'Timezone bug in "%s"', '"%s" is slow with large accounts', 'Mobile layout broken in "%s"', 'Duplicate records created by "%s"', 'Wrong totals in "%s" after an edit', 'Permissions leak in "%s"'];
export function makeBugs(rand, feature, { day = 0, reworkShare = VELOCITY.reworkShare } = {}) {
  let hours = feature.effortHours * reworkShare * (0.6 + 0.8 * rand());
  const bugs = [];
  while (hours > 0.5 && bugs.length < 6) {
    const h = Math.min(hours, 1 + Math.round(rand() * 7));
    const r = rand();
    bugs.push({
      id: `bug_${feature.id}_${bugs.length}`,
      featureId: feature.id,
      title: BUG_TEMPLATES[Math.floor(rand() * BUG_TEMPLATES.length)].replace('%s', String(feature.title).slice(0, 40)),
      hours: Math.round(h * 10) / 10,
      progress: 0,
      severity: r < 0.15 ? 'high' : r < 0.55 ? 'medium' : 'low',
      foundDay: day,
      fixedDay: null,
    });
    hours -= h;
  }
  return bugs;
}

export const bugChurnMultiplier = (slice) => 1 + Math.min(VELOCITY.maxBugChurn, openBugHours(slice) * VELOCITY.churnPerBugHour);

// ---- AI inference cost ----
export const AI_LEVELS = {
  light: { usd: 0.15, range: '$0.01–0.25', label: 'Light: ~30 calls/user/mo, small model' },
  moderate: { usd: 3, range: '$1–5', label: 'Moderate assistant: ~200 calls/user/mo, mid model, cached' },
  heavy: { usd: 40, range: '$20–100+', label: 'Heavy agentic: ~1,000 agent steps/user/mo' },
};
// Active users per paying account [A design]: B2B accounts have several seats.
export const USERS_PER_ACCOUNT = { b2c: 1, smb: 3, ent: 25 };

export function inferencePerAccount(features, model) {
  return features.filter((f) => f.status === 'shipped' && f.ai?.enabled).reduce((a, f) => a + (AI_LEVELS[f.ai.level]?.usd ?? 0), 0) * (USERS_PER_ACCOUNT[model] ?? 1);
}
export function monthlyInference(features, model, accounts) {
  return inferencePerAccount(features, model) * Math.max(0, accounts);
}

// Days to finish the queue at a steady daily rate (effective hours/day). Returns per-feature ETAs.
export function queueEta(slice, effPerDay, bugShare = 0) {
  const rate = effPerDay * (1 - bugShare);
  let acc = 0;
  return slice.buildQueue.map((id) => {
    const f = slice.features.find((x) => x.id === id);
    if (!f) return null;
    acc += Math.max(0, f.effortHours - (f.progressHours ?? 0));
    return { id, days: rate > 0 ? Math.ceil(acc / rate) : null };
  }).filter(Boolean);
}
