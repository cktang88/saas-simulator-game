// Customer-support operator reader and mistake log (ARCHITECTURE principle 7; operator-tiers audit §5.1/5.2).
// Pure: reads state.apps.support; never mutates except logSupportMistake.
//
// The reader separates tiers from what the player actually did (not from settings or volume):
//  - speed: median first response (tiers from data/operator-tiers.js support.outcomes.firstResponseHoursEmail)
//  - knowledge base written from ticket themes (share of the top question themes covered by a solid article)
//  - AI agent setup: tested on sample questions before/while live, human handoff kept, reviewed recently,
//    repeat contact within 72h (the honest metric) instead of the vendor's resolution rate
//  - backlog and abandoned tickets, CSAT
// Registered with core/operator.js (being built by another agent) when that module exists.

import { OPERATOR_TIERS } from '../../data/operator-tiers.js';
import { clamp, round2 } from '../../core/util.js';
import { shippedFeatures } from '../../core/market.js';
import { INTENTS, INTENT_IDS, agentMetrics, coverage, hasHumanHandoff, isTested } from './agent.js';

const FN = 'support';
let operatorCore = null;
// Lazy, optional: core/operator.js may not exist yet; a failed import is ignored.
import('../../core/operator.js').then((m) => { operatorCore = m; m.registerOperatorReader?.(FN, supportOperatorReader); }).catch(() => {});

// mistake: { trap, text, estCost?, key? } — key dedupes (one entry per key).
export function logSupportMistake(state, { trap, text, estCost = null, key = null }) {
  const sup = state.apps.support;
  if (!sup) return null;
  sup.mistakeKeys ??= {};
  if (key && sup.mistakeKeys[key] != null) return null;
  if (key) sup.mistakeKeys[key] = state.day;
  const m = { day: state.day, fn: FN, trap, estCost: estCost == null ? null : round2(estCost), text, app: 'helpdesk' };
  (sup.mistakeLog ??= []).unshift(m);
  if (sup.mistakeLog.length > 200) sup.mistakeLog.length = 200;
  let logged = false;
  if (operatorCore?.logMistake) { try { operatorCore.logMistake(state, { ...m }); logged = true; } catch { /* fall through */ } }
  if (!logged) (state.mistakes ??= []).push({ ...m });
  return m;
}

// Ticket volume by intent over the last `days` (themes for the KB-gap queue).
export function themeCounts(sup, day, days = 30) {
  const out = {};
  for (const r of sup.themeLog ?? []) if (r.day > day - days) for (const [k, n] of Object.entries(r.k)) out[k] = (out[k] ?? 0) + n;
  return out;
}

const band = (v, cuts) => { // cuts ascending: ≤cuts[0] → 1, ≤cuts[1] → 0.75, ≤cuts[2] → 0.5, ≤cuts[3] → 0.25, else 0
  for (let i = 0; i < cuts.length; i++) if (v <= cuts[i]) return 1 - i * 0.25;
  return 0;
};

export function supportOperatorReader(state) {
  const T = OPERATOR_TIERS[FN];
  const sup = state.apps.support;
  const base = { id: FN, label: T.label, tier: 'unknown', score: null, signals: [], coaching: [], costs: [] };
  if (!sup?.active || (sup.daily?.length ?? 0) < 14) return base;
  const day = state.day;
  const total30 = (sup.daily ?? []).filter((d) => d.day > day - 30).reduce((a, d) => a + d.new, 0);
  if (total30 < 5) return base; // not enough tickets to judge
  const parts = [], traps = new Set();

  const frt = sup.metrics?.medianFrtHours;
  if (frt != null) {
    parts.push({ w: 1, s: band(frt, [1, 4, 12, 48]) });
    base.signals.push({ metric: 'firstResponseHoursEmail', value: round2(frt), tierThresholds: [1, 4, 12, 48], source: 'sourced' });
  }
  const rows = (sup.csatLog ?? []).filter((x) => x.day > day - 30);
  const resp = rows.reduce((a, x) => a + x.responses, 0);
  if (resp >= 5) {
    const csat = rows.reduce((a, x) => a + x.positive, 0) / resp;
    parts.push({ w: 0.75, s: clamp((csat - 0.6) / 0.25, 0, 1) });
    base.signals.push({ metric: 'csat', value: round2(csat), tierThresholds: [0.85, 0.78, 0.7, 0.6], source: 'design' });
  }

  // Knowledge base from ticket themes: top 5 non-human intents by volume, covered by a solid, current article.
  const themes = themeCounts(sup, day, 60);
  const top = INTENT_IDS.filter((k) => INTENTS[k].kind === 'docs' && themes[k] > 0).sort((a, b) => themes[b] - themes[a]).slice(0, 5);
  if (top.length >= 3) {
    const all = { ...sup.ai, sourceIds: null, procedures: sup.ai?.procedures ?? [] };
    const feats = shippedFeatures(state);
    const covered = top.filter((k) => coverage(all, k, { articles: sup.articles ?? [], feats }) >= 0.5).length / top.length;
    parts.push({ w: 1, s: covered });
    base.signals.push({ metric: 'kbThemeCoverage', value: round2(covered), tierThresholds: [0.8, 0.6, 0.4, 0.2], source: 'design' });
    if (covered < 0.4) traps.add('founder_view_kb');
  }

  // AI agent setup and honest outcomes.
  const ai = sup.ai;
  if (ai && ai.liveDay != null) {
    const m = agentMetrics(ai.log, day, 30);
    const tested = Boolean(ai.flags?.liveTested) || isTested(ai);
    const handoff = hasHumanHandoff(ai);
    const reviewed = ai.lastReviewDay != null && day - ai.lastReviewDay <= 14;
    parts.push({ w: 0.5, s: tested ? 1 : 0 }, { w: 0.75, s: handoff ? 1 : 0 }, { w: 0.5, s: reviewed ? 1 : 0 });
    if (m.repeatRate != null && m.claimed >= 10) {
      parts.push({ w: 1, s: 1 - clamp((m.repeatRate - 0.08) / 0.3, 0, 1) });
      base.signals.push({ metric: 'repeatContactPct', value: round2(m.repeatRate * 100), tierThresholds: [10, 15, 25, 40], source: 'design' });
      base.signals.push({ metric: 'aiResolutionSharePct', value: round2((m.honestRate ?? 0) * 100), tierThresholds: [50, 40, 30, 20], source: 'sourced' });
      if (m.repeatRate > 0.2 || !reviewed) traps.add('deflection_as_resolution');
    }
    if (!handoff) traps.add('no_handoff');
  }

  const ml = sup.mistakeLog ?? [];
  const recent = ml.filter((x) => x.day > day - 90);
  const backlogHits = recent.filter((x) => x.trap === 'ignored_backlog' || x.trap === 'ticket_abandoned').length;
  parts.push({ w: 0.75, s: clamp(1 - backlogHits / 4, 0, 1) });
  if (recent.some((x) => x.trap === 'fast_and_wrong')) traps.add('fast_and_wrong');

  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const score = wsum ? parts.reduce((a, p) => a + p.w * p.s, 0) / wsum : null;
  base.score = score == null ? null : round2(score);
  base.tier = score == null ? 'unknown' : score >= 0.8 ? 'stellar' : score >= 0.62 ? 'good' : score >= 0.42 ? 'average' : 'mediocre';
  for (const t of T.traps) if (traps.has(t.id)) base.coaching.push(t.coaching);
  if (backlogHits) base.coaching.push('A backlog you ignore turns into abandoned tickets and cancellations. Raise the support block or fix the top question themes.');
  if (base.tier !== 'stellar') base.coaching.push(`A stellar operator: ${T.tiers.stellar.behaviours.join('; ')}.`);
  base.costs = recent.map((x) => ({ mistake: x.text, trap: x.trap, estimatedCost: x.estCost, since: x.day }));
  base.traps = [...traps];
  return base;
}
