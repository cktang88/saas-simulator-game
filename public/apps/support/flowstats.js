// Pure reads over state.apps.support.flows for the support operator reader and the Ops tab. No imports from the
// flow engine (avoids a cycle with operator.js). Metrics follow docs/research/support/s4-support-ops.md §7:
// first-contact resolution, reopen rate, tag discipline, backlog age and contact rate.

import { clamp, round2 } from '../../core/util.js';

const RISKY = new Set(['account', 'privacy', 'security']);

export function flowSignals(state, days = 90) {
  const fl = state.apps.support?.flows;
  const out = { n: 0, avgScore: null, riskyN: 0, riskyChecked: null, tagRate: null, reopenRate: null, macroUses: 0, macroGood: null, disputeWinRate: null, disputesDecided: 0, byTier: { stellar: 0, good: 0, average: 0, mediocre: 0 }, langCsat: {}, takeovers: fl?.stats?.takeovers ?? 0, blocked: fl?.stats?.takeoversBlocked ?? 0, backlogAge: 0, openCases: 0 };
  if (!fl) return out;
  const day = state.day;
  const done = fl.cases.filter((c) => ['resolved', 'linked', 'notify'].includes(c.status) && c.result && c.resolvedDay > day - days);
  out.n = done.length;
  if (done.length) out.avgScore = round2(done.reduce((a, c) => a + c.result.score, 0) / done.length);
  for (const c of done) out.byTier[c.result.tier] = (out.byTier[c.result.tier] ?? 0) + 1;
  const risky = done.filter((c) => RISKY.has(c.family));
  out.riskyN = risky.length;
  if (risky.length) out.riskyChecked = round2(risky.reduce((a, c) => a + c.result.k, 0) / risky.length);
  if (done.length) {
    out.tagRate = round2(done.filter((c) => c.result.tagOk).length / done.length);
    out.reopenRate = round2(fl.cases.filter((c) => c.reopenOf && c.createdDay > day - days).length / Math.max(1, done.length));
  }
  const mac = done.filter((c) => c.result.macro);
  out.macroUses = mac.length;
  if (mac.length) out.macroGood = round2(mac.filter((c) => !c.result.macro.wrong && c.result.macro.quality >= 0.6).length / mac.length);
  const { disputesWon: w = 0, disputesLost: l = 0, disputesMissed: m = 0 } = fl.stats;
  out.disputesDecided = w + l + m;
  if (w + l + m) out.disputeWinRate = round2(w / (w + l + m));
  for (const [k, v] of Object.entries(fl.stats.langCsat ?? {})) if (v.n >= 3) out.langCsat[k] = round2(v.pos / v.n);
  const open = fl.cases.filter((c) => c.status === 'open');
  out.openCases = open.length;
  out.backlogAge = open.length ? Math.max(...open.map((c) => day - c.createdDay)) : 0;
  return out;
}

// Score 0..1 for the operator reader from flow handling (null when too little data).
export function flowScore(state) {
  const s = flowSignals(state);
  if (s.n < 3) return null;
  const parts = [{ w: 1, v: clamp((s.avgScore - 0.3) / 0.55, 0, 1) }];
  if (s.riskyChecked != null && s.riskyN >= 2) parts.push({ w: 0.75, v: s.riskyChecked });
  if (s.tagRate != null) parts.push({ w: 0.25, v: s.tagRate });
  if (s.reopenRate != null) parts.push({ w: 0.4, v: 1 - clamp(s.reopenRate / 0.25, 0, 1) });
  if (s.disputeWinRate != null && s.disputesDecided >= 2) parts.push({ w: 0.4, v: clamp(s.disputeWinRate / 0.5, 0, 1) });
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  return { score: round2(parts.reduce((a, p) => a + p.w * p.v, 0) / wsum), signals: s };
}
