// AI-coding workflow (Claude Code / Cursor / Codex): plan vs one-shot, permission mode, diff size, review
// depth, tests, PR-review bot, plan tiers with 5-hour windows and monthly allowances, overage, and the
// failure modes (agent-introduced bugs and security holes, leaked secrets, runaway cost, destructive
// actions against production). Pure functions; product.js applies them.
//
// Sources: docs/research/tools/deep/d07-ai-coding.md (D07) §1–5; docs/review/tool-gap-analysis.md item 4;
// public/data/operator-tiers.js ai_building.
//  - METR 2025 RCT: 16 experienced devs, AI-allowed tasks took 19% LONGER while devs believed they were ~20%
//    faster. METR Feb 2026 follow-up [secondary]: roughly −4…+18% with wide intervals → show uncertainty.
//  - DORA 2025: AI adoption ↔ higher throughput AND higher instability (change failures, rework, recovery).
//  - Faros Mar 2026 (vendor, secondary): incidents per PR +243%, bugs per PR +29%, review time +441% from low
//    to high AI adoption.
//  - Stack Overflow 2025: 66% cite "almost right, but not quite".
//  - Plan prices (vendor pages, 2026-10-14): Claude Pro $20, Max 5× $100, Max 20× $200; Cursor Plus $8,
//    Premium $30, Super $100, Ultra $200; Codex Plus $20, Pro $100/$200. A heavy month without caps can cost
//    3–10× the headline plan (D07 §4). Replit deleted a production DB in July 2025 (D07 §3.7).
// Every per-session coefficient below is a game assumption [design] inside those ranges.

import { clamp, round2 } from '../../core/util.js';

// ---- Plans ----
// agentHours = effective agent-assisted build hours per month the plan covers before you hit limits [design];
// window = agent hours per rolling 5-hour window before the agent stalls [design]; overage = $ per extra
// effective hour at API rates (null = no pay-as-you-go: you wait for the window/week to reset).
export const PLANS = {
  claude_pro: { tool: 'Claude Code', label: 'Claude Pro', monthly: 20, agentHours: 25, window: 1.5, overage: 9, boostKey: 'code_pro', note: 'Usage shares the chat pool; heavy weeks hit the 5-hour window.' },
  claude_max5: { tool: 'Claude Code', label: 'Claude Max 5×', monthly: 100, agentHours: 120, window: 5, overage: 9, boostKey: 'code_max', note: 'Limits reset on a rolling 5-hour window; no published token counts.' },
  claude_max20: { tool: 'Claude Code', label: 'Claude Max 20×', monthly: 200, agentHours: 400, window: 12, overage: 9, boostKey: 'code_ultra', note: 'The realistic plan for full-time agent building.' },
  cursor_plus: { tool: 'Cursor', label: 'Cursor Plus', monthly: 8, agentHours: 8, window: 99, overage: null, boostKey: 'code_pro', note: 'Grok models only; no Bugbot or cloud agents.', noBugbot: true },
  cursor_premium: { tool: 'Cursor', label: 'Cursor Premium', monthly: 30, agentHours: 32, window: 99, overage: 7, boostKey: 'code_pro', note: 'Third-party models at API list price beyond the pool; Bugbot included.' },
  cursor_super: { tool: 'Cursor', label: 'Cursor Super', monthly: 100, agentHours: 120, window: 99, overage: 7, boostKey: 'code_max', note: '15× Plus; pooled usage refreshes weekly.' },
  cursor_ultra: { tool: 'Cursor', label: 'Cursor Ultra', monthly: 200, agentHours: 400, window: 99, overage: 7, boostKey: 'code_ultra', note: '50× Plus.' },
  codex_plus: { tool: 'Codex', label: 'ChatGPT Plus (Codex)', monthly: 20, agentHours: 25, window: 1.5, overage: 8, boostKey: 'code_pro', note: 'Cloud tasks "may use more of your allowance"; credits extend it.' },
  codex_pro100: { tool: 'Codex', label: 'ChatGPT Pro $100 (Codex)', monthly: 100, agentHours: 120, window: 99, overage: 8, boostKey: 'code_max', note: 'No five-hour cap per the pricing page; weekly limits may apply.' },
  codex_pro200: { tool: 'Codex', label: 'ChatGPT Pro $200 (Codex)', monthly: 200, agentHours: 400, window: 99, overage: 8, boostKey: 'code_ultra', note: 'Fast mode uses 2.5× allowance.' },
};
export const DEFAULT_PLAN = 'claude_max5'; // the default stack's "Claude Max" bill ($100)

// ---- Session choices ----
export const CHOICES = {
  mode: { plan: 'Plan first (agent proposes, you edit and approve)', oneshot: 'One-shot ("build feature X")' },
  permissions: { ask: 'Ask before edits and commands', auto: 'Auto-accept (no prompts)' },
  diff: { small: 'Small PRs (≤200 lines, one task each)', medium: 'Medium PRs (~500 lines)', large: 'Whole feature in one PR (1,000+ lines)' },
  review: { every: 'Read every diff', skim: 'Skim, check the demo', none: 'Merge without reading' },
  tests: { tdd: 'Failing test first, then make it pass', agent: 'Let the agent write the tests', none: 'No tests' },
  prod: { none: 'Agent has no production access', staging: 'Agent works against staging only', prod: 'Agent can run commands against production' },
};
// What a typical founder does when they first install a coding agent (not the stellar choice; audit §5.4).
export const DEFAULT_WORKFLOW = { mode: 'oneshot', permissions: 'ask', diff: 'large', review: 'skim', tests: 'agent', prod: 'staging', bugbot: false, capUsd: 0 };

export const TIER_WORKFLOWS = {
  stellar: { mode: 'plan', permissions: 'ask', diff: 'small', review: 'every', tests: 'tdd', prod: 'none', bugbot: true, capUsd: 50 },
  good: { mode: 'plan', permissions: 'ask', diff: 'medium', review: 'every', tests: 'agent', prod: 'staging', bugbot: false, capUsd: 100 },
  average: { mode: 'oneshot', permissions: 'ask', diff: 'large', review: 'skim', tests: 'agent', prod: 'staging', bugbot: false, capUsd: 0 },
  mediocre: { mode: 'oneshot', permissions: 'auto', diff: 'large', review: 'none', tests: 'none', prod: 'prod', bugbot: false, capUsd: 0 },
};

// Review catches less on big diffs (Faros: review time +441% as PRs grow) [design].
const REVIEW_EFFECTIVENESS = { small: 1, medium: 0.8, large: 0.5 };

// Throughput per founder hour from the workflow (planning, reading diffs and writing tests take time:
// +20–40% founder hours per feature vs unreviewed; gap analysis item 4) [design].
export function throughputFactor(w, { agent = true } = {}) {
  let t = 1;
  if (agent) {
    t *= w.mode === 'plan' ? 0.93 : 1.05;
    t *= w.permissions === 'auto' ? 1.08 : 1;
    t *= { small: 0.97, medium: 1, large: 1.08 }[w.diff] ?? 1;
  }
  t *= { every: 0.9, skim: 0.97, none: 1 }[w.review] ?? 1;
  t *= { tdd: 0.9, agent: 0.97, none: 1 }[w.tests] ?? 1;
  return round2(t);
}

// Rework (bug-fix hours per shipped hour). Stellar ~0.15, good ~0.2–0.25, average ~0.3–0.35, mediocre 0.5
// rising toward 0.8 as unreviewed code piles up (GitClear duplication, Faros bugs/PR) [design].
export function reworkShare(w, { agent = true, unreviewedDebt = 0 } = {}) {
  let r = 0.15;
  if (agent) {
    if (w.mode === 'oneshot') r += 0.05;
    if (w.permissions === 'auto') r += 0.03;
    r += { small: 0, medium: 0.02, large: 0.05 }[w.diff] ?? 0;
  }
  const eff = REVIEW_EFFECTIVENESS[w.diff] ?? 0.8;
  r += { every: 0.15 * (1 - eff), skim: 0.08, none: 0.15 }[w.review] ?? 0.08;
  r += { tdd: 0, agent: 0.04, none: 0.12 }[w.tests] ?? 0.04;
  if (w.bugbot && w.review !== 'none') r -= 0.02; // advisory findings acted on
  if (agent) r += 0.25 * clamp(unreviewedDebt, 0, 1); // compounding duplication and silent debt
  return round2(clamp(r, 0.12, 0.85));
}

// Share of a feature's bugs that slip past QA and surface later from customers (tests that pass without
// covering behaviour: "almost right, but not quite").
export function latentShare(w) {
  return { tdd: 0.3, agent: 0.6, none: 0.8 }[w.tests] ?? 0.5;
}

// Probability a shipped feature carries a security hole (missing auth check, IDOR, injection) [design].
export function securityBugChance(w, { agent = true } = {}) {
  let p = { every: 0.03, skim: 0.08, none: 0.15 }[w.review] ?? 0.08;
  if (w.review === 'every') p += 0.05 * (1 - (REVIEW_EFFECTIVENESS[w.diff] ?? 0.8));
  if (!agent) p *= 0.6;
  if (w.bugbot) p *= 0.6; // an AI PR reviewer catches some missing auth checks
  if (w.tests === 'tdd') p *= 0.8;
  return round2(clamp(p, 0, 0.3) * 1000) / 1000;
}

// Change-failure rate of a deploy (DORA: elite ~5%, low performers far higher; AI adoption raises it) [design].
export function changeFailureRate(w, { agent = true, unreviewedDebt = 0 } = {}) {
  const r = reworkShare(w, { agent, unreviewedDebt });
  return round2(clamp(0.02 + 0.45 * (r - 0.12), 0.03, 0.4) * 1000) / 1000;
}

// Per-session hazard of leaking a secret (key pasted into a prompt, .env committed) [design]; the
// Insights Ops "secret scanning" flag catches most of them before abuse.
export function secretLeakChance(w, { agent = true, scanning = false } = {}) {
  if (!agent) return 0;
  let p = w.permissions === 'auto' ? 0.006 : 0.0008; // ~0.2/yr at 5 sessions a week with prompts on (Insights OPS baseline)
  if (w.review === 'none') p *= 2;
  if (scanning) p *= 0.25;
  return round2(p * 10000) / 10000;
}

// Per-session chance of a destructive command against production (DROP TABLE, rm -rf, migration reset).
// Rare: only with production access and auto-accept, or one-shot with prod access [design; Replit July 2025].
export function destructiveChance(w, { agent = true } = {}) {
  if (!agent || w.prod !== 'prod') return 0;
  return w.permissions === 'auto' ? 0.006 : 0.0015;
}

// Token intensity: one-shot and huge diffs burn context and retries; plan mode wastes less [design].
export function tokenIntensity(w) {
  let k = 1;
  if (w.mode === 'oneshot') k *= 1.25;
  k *= { small: 0.9, medium: 1, large: 1.3 }[w.diff] ?? 1;
  if (w.permissions === 'auto') k *= 1.1; // long unsupervised loops
  return round2(k);
}

// Perceived vs measured speed. METR 2025: believed +20% while measured −19%. Perceived = gross session speed
// × (1.2 + extra for workflows that feel fastest); measured = net of rework, with a ±band [design].
export function perceivedSpeed(gross, w) {
  const extra = (w.permissions === 'auto' ? 0.1 : 0) + (w.review === 'none' ? 0.1 : w.review === 'skim' ? 0.05 : 0) + (w.mode === 'oneshot' ? 0.05 : 0);
  return round2(gross * (1.2 + extra));
}
export function measuredSpeed(sessions, { window = 28, day = 0 } = {}) {
  const recent = sessions.filter((s) => s.day > day - window);
  const raw = recent.reduce((a, s) => a + s.hours, 0);
  if (raw < 2) return null;
  const gross = recent.reduce((a, s) => a + s.eff, 0);
  const rework = recent.reduce((a, s) => a + s.reworkHours, 0);
  const net = Math.max(0, gross - rework) / raw;
  // Wide interval: small samples and the METR 2026 follow-up's intervals spanning slowdown to speedup.
  const band = clamp(0.35 / Math.sqrt(raw / 10), 0.1, 0.5);
  return { net: round2(net), lo: round2(net * (1 - band)), hi: round2(net * (1 + band)), gross: round2(gross / raw), raw: round2(raw) };
}

// Lines of diff per effective build hour [design] and PR count under the cap.
const LINES_PER_EFF_HOUR = 60;
const PR_CAP = { small: 200, medium: 500, large: 1500 };
export function diffStats(eff, w) {
  const lines = Math.round(eff * LINES_PER_EFF_HOUR);
  const prs = Math.max(lines ? 1 : 0, Math.ceil(lines / (PR_CAP[w.diff] ?? 500)));
  return { lines, prs, avg: prs ? Math.round(lines / prs) : 0 };
}

// Usage accounting for one session. used: agent hours used this month so far. Returns { hoursAgent,
// hoursStalled, overageUsd, capped } where stalled hours run without the agent (window/allowance hit
// and no pay-as-you-go, or the spend cap hit).
export function usageFor(planId, w, { sessionHours, used = 0, overageSoFar = 0 }) {
  const p = PLANS[planId] ?? PLANS[DEFAULT_PLAN];
  const k = tokenIntensity(w);
  const want = sessionHours * k; // allowance-hours this session wants
  const windowCap = p.window * Math.max(1, Math.ceil(sessionHours / 5));
  const windowBlocked = Math.max(0, want - windowCap); // the 5-hour window stalls you whatever you pay
  const leftMonth = Math.max(0, p.agentHours - used);
  const covered = Math.min(want - windowBlocked, leftMonth);
  const monthlyExtra = want - windowBlocked - covered;
  let overageUsd = 0, capped = false, paidHours = 0;
  if (monthlyExtra > 1e-9) {
    if (p.overage != null) {
      const cap = w.capUsd > 0 ? Math.max(0, w.capUsd - overageSoFar) : Infinity;
      overageUsd = Math.min(cap, monthlyExtra * p.overage);
      paidHours = overageUsd / p.overage;
      capped = paidHours < monthlyExtra - 1e-9;
    } else capped = true;
  }
  const stalled = windowBlocked + (monthlyExtra - paidHours);
  return { allowanceUsed: round2(covered + paidHours), hoursStalled: round2(sessionHours * clamp(want > 0 ? stalled / want : 0, 0, 1)), overageUsd: round2(overageUsd), capped, windowHit: windowBlocked > 1e-9, monthHit: monthlyExtra > 1e-9 };
}

// Agent-tier read (for the operator reader and coaching).
export function workflowScore(w) {
  let s = 0;
  s += w.mode === 'plan' ? 1 : 0;
  s += w.permissions === 'ask' ? 1 : 0;
  s += { small: 1, medium: 0.5, large: 0 }[w.diff] ?? 0;
  s += { every: 1, skim: 0.4, none: 0 }[w.review] ?? 0;
  s += { tdd: 1, agent: 0.4, none: 0 }[w.tests] ?? 0;
  s += { none: 0.5, staging: 0.4, prod: 0 }[w.prod] ?? 0;
  s += w.bugbot ? 0.25 : 0;
  s += w.capUsd > 0 ? 0.25 : 0;
  return round2(s / 6);
}

export function coachingFor(w) {
  const out = [];
  if (w.mode !== 'plan') out.push('Start in plan mode: have the agent propose a plan you edit before any code changes. One-shot prompts produce the largest rework.');
  if (w.review !== 'every') out.push('Read every diff before merging. Stack Overflow 2025: 66% of developers say AI output is "almost right, but not quite".');
  if (w.diff === 'large') out.push('Keep each PR small enough to read in one sitting; review effectiveness collapses on 1,000-line diffs (Faros 2026: review time +441%).');
  if (w.tests !== 'tdd') out.push('Write the failing test first, then let the agent make it pass. Tests written by the same agent test the implementation, not the behaviour.');
  if (w.permissions === 'auto') out.push('Auto-accept is where most agent damage happens. Keep permission prompts on for commands.');
  if (w.prod === 'prod') out.push('Never give the agent production credentials. Replit\'s agent deleted a production database during a code freeze (July 2025).');
  if (!(w.capUsd > 0)) out.push('Set a monthly spend cap: a heavy month without one can cost 3–10× the plan price.');
  return out;
}
