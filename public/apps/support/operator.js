// Customer-support operator reader and mistake log (ARCHITECTURE principle 7; operator-tiers audit §5.1/5.2).
// Pure: reads state.apps.support; never mutates except logSupportMistake.
//
// The reader separates tiers from what the player actually did (not from settings or volume):
//  - speed: median first response (tiers from data/operator-tiers.js support.outcomes.firstResponseHoursEmail)
//  - knowledge base written from ticket themes (share of the top question themes covered by a solid article)
//  - AI agent setup: tested on sample questions before/while live, human handoff kept, reviewed recently,
//    repeat contact within 72h (the honest metric) instead of the vendor's resolution rate
//  - backlog and abandoned tickets, CSAT
// Registered with core/operator.js; mistakes go to its shared ledger (state.mistakes) and to a local copy
// (state.apps.support.mistakeLog) that the Helpdesk shows next to the tickets that caused them.

import { OPERATOR_TIERS } from '../../data/operator-tiers.js';
import { clamp, round2 } from '../../core/util.js';
import { registerOperatorReader, logMistake, tierFromScore } from '../../core/operator.js';
import { shippedFeatures } from '../../core/market.js';
import { INTENTS, INTENT_IDS, agentMetrics, coverage, hasHumanHandoff, isTested } from './agent.js';
import { flowScore } from './flowstats.js';

const FN = 'support';
export const MISTAKE_LABELS = {
  ai_live_untested: 'AI agent live without a batch test',
  no_handoff: 'AI agent with no human handoff',
  ai_unreviewed: 'AI conversations never reviewed',
  ai_wrong_answer: 'Wrong AI answer cost a customer',
  deflection_as_resolution: 'Dead-end AI conversation counted as resolved',
  procedure_over_refund: 'AI refund outside policy',
  founder_view_kb: 'AI agent live with no help content',
  ignored_backlog: 'Ignored a support backlog',
  ticket_abandoned: 'Abandoned ticket, customer cancelled',
  slack_ignored: 'Ignored a Slack Connect thread',
  silent_outage: 'Incident with no status update',
  fast_and_wrong: 'Closed a ticket without answering',
  customer_went_quiet: 'Customer went quiet after a vague reply',
  followup_ignored: 'Left a customer reply unanswered',
  // Ticket-type flows (support/flows.js; docs/research/support/*)
  unverified_handover: 'Handed over an account without verification',
  unverified_reset: 'Reset 2FA or password without verification',
  dsr_missed: 'Missed a data-subject request deadline',
  dsr_partial: 'Incomplete data-subject request (deletion or export)',
  dsr_impostor: 'Released personal data to the wrong person',
  dsr_token: 'Closed a data-subject request without doing the work',
  beg_bounty_paid: 'Paid a beg bounty',
  real_vuln_ignored: 'Ignored a real vulnerability report',
  researcher_threatened: 'Threatened a security researcher',
  dispute_missed: 'Let a card dispute lapse',
  dispute_wrong_fight: 'Contested a dispute that was our error',
  dispute_conceded: 'Conceded a dispute that was winnable',
  dispute_ratio: 'Dispute ratio crossed a card-network line',
  refund_leak: 'Refunded without checking policy or cause',
  refund_unkept_promise: 'Promised a store refund you cannot issue',
  refund_wrongly_denied: 'Denied a refund the policy owed',
  cancel_blocked: 'Blocked or pressured a cancellation',
  cancel_failure_unfixed: 'Cancel-path failure left open (ROSCA exposure)',
  card_by_email: 'Asked for card details by email',
  vat_invoice_wrong: 'Wrong or refused VAT invoice',
  wrong_macro: 'Sent a macro that answered a different question',
  mistranslation: 'Machine translation garbled money or legal terms',
  unverified_legal_request: 'Complied with an unverified legal request',
  legal_request_ignored: 'Ignored a valid legal request',
  sla_missed: 'Missed an enterprise SLA',
  sla_credit_ignored: 'Ignored a contractual SLA credit',
  data_restore_blind: 'Restored customer data without a snapshot',
  integration_replay: 'Replayed webhook events without idempotency checks',
  broken_promise: 'Promised a feature date and missed it',
  loop_not_closed: 'Fixed bug, never told the customer',
  kept_toxic_customer: 'Kept an abusive customer draining the week',
  fired_badly: 'Fired a customer without notice or the refund owed',
  public_complaint_mishandled: 'Public complaint mishandled',
  viral_complaint: 'A complaint went viral',
  astroturf: 'Replied as a fake customer',
  case_reopened: 'Reopened a case: going in circles',
  ai_flow_wrong: 'AI agent got a high-stakes case wrong',
  ai_flow_scope: 'AI agent allowed to decide refunds, transfers or data requests',
  vip_skipped: 'VIP skipped after an incident',
  pager_burnout: 'After-hours pager wore you down',
};

// mistake: { trap, text, estCost? (usd), customers?, hours?, delayed?, key? } — key dedupes (one entry per key).
export function logSupportMistake(state, { trap, text, estCost = null, customers = 0, hours = 0, delayed = false, key = null, reputation = 0, days = 0, circles = false, charge = false }) {
  const sup = state.apps.support;
  if (!sup) return null;
  sup.mistakeKeys ??= {};
  if (key && sup.mistakeKeys[key] != null) return null;
  if (key) sup.mistakeKeys[key] = state.day;
  const m = { day: state.day, fn: FN, trap, estCost: estCost == null ? null : round2(estCost), text, app: 'helpdesk' };
  (sup.mistakeLog ??= []).unshift(m);
  if (sup.mistakeLog.length > 200) sup.mistakeLog.length = 200;
  logMistake(state, { functionId: FN, id: trap, label: MISTAKE_LABELS[trap] ?? trap, cost: { usd: estCost ?? 0, customers, hours, reputation, days }, detail: text, delayed, circles, charge, app: 'helpdesk' });
  return m;
}

// Ticket volume by intent over the last `days` (themes for the KB-gap queue).
export function themeCounts(sup, day, days = 30) {
  const out = {};
  for (const r of sup.themeLog ?? []) if (r.day > day - days) for (const [k, n] of Object.entries(r.k)) out[k] = (out[k] ?? 0) + n;
  return out;
}

// Mistake ids from the flows that map to a coaching trap in data/operator-tiers.js.
const FLOW_TRAP_GROUP = { unverified_reset: 'unverified_handover', dsr_partial: 'dsr_missed', dsr_token: 'dsr_missed', dsr_impostor: 'dsr_missed', dispute_wrong_fight: 'dispute_missed', dispute_conceded: 'dispute_missed', refund_unkept_promise: 'refund_leak', refund_wrongly_denied: 'refund_leak', public_complaint_mishandled: 'viral_complaint', astroturf: 'viral_complaint', ai_flow_wrong: 'ai_flow_scope', researcher_threatened: 'real_vuln_ignored', unverified_legal_request: 'unverified_handover' };
const FLOW_TRAPS = ['unverified_handover', 'unverified_reset', 'beg_bounty_paid', 'real_vuln_ignored', 'researcher_threatened', 'dsr_missed', 'dsr_partial', 'dsr_token', 'dsr_impostor', 'dispute_missed', 'dispute_wrong_fight', 'dispute_conceded', 'refund_leak', 'refund_unkept_promise', 'refund_wrongly_denied', 'cancel_blocked', 'viral_complaint', 'public_complaint_mishandled', 'astroturf', 'ai_flow_scope', 'ai_flow_wrong', 'unverified_legal_request'];

const band = (v, cuts) => { // cuts ascending: ≤cuts[0] → 1, ≤cuts[1] → 0.75, ≤cuts[2] → 0.5, ≤cuts[3] → 0.25, else 0
  for (let i = 0; i < cuts.length; i++) if (v <= cuts[i]) return 1 - i * 0.25;
  return 0;
};

export function supportOperatorReader(state) {
  const T = OPERATOR_TIERS[FN];
  const sup = state.apps.support;
  const base = { id: FN, label: T.label, tier: 'unknown', score: null, n: 0, evidence: [], signals: [], coaching: [], costs: [], traps: [] };
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
      base.signals.push({ metric: 'aiResolutionSharePct', value: round2((m.trueRate ?? 0) * 100), tierThresholds: [50, 40, 30, 20], source: 'sourced' });
      if (m.repeatRate > 0.2 || !reviewed) traps.add('deflection_as_resolution');
    }
    if (!handoff) traps.add('no_handoff');
  }

  const ml = sup.mistakeLog ?? [];
  const recent = ml.filter((x) => x.day > day - 90);
  const backlogHits = recent.filter((x) => ['ignored_backlog', 'ticket_abandoned', 'followup_ignored'].includes(x.trap)).length + 0.5 * recent.filter((x) => x.trap === 'customer_went_quiet').length;
  parts.push({ w: 0.75, s: clamp(1 - backlogHits / 4, 0, 1) });
  if (recent.some((x) => x.trap === 'fast_and_wrong')) traps.add('fast_and_wrong');

  // Ticket-type flows (support/flows.js): verification discipline, decisions vs the facts, record discipline.
  const fs = flowScore(state);
  if (fs) {
    parts.push({ w: 1.5, s: fs.score });
    const g = fs.signals;
    base.signals.push({ metric: 'caseHandlingScore', value: round2(g.avgScore * 100), tierThresholds: [80, 60, 40], source: 'design' });
    base.evidence.push(`${g.n} typed cases handled in 90 days: ${g.byTier.stellar} stellar, ${g.byTier.good} good, ${g.byTier.average} average, ${g.byTier.mediocre} mediocre`);
    if (g.riskyChecked != null && g.riskyN >= 2) base.evidence.push(`${Math.round(g.riskyChecked * 100)}% of the verification checks run on identity-risky cases (ownership, 2FA, data requests, security reports)`);
    if (g.reopenRate != null) base.evidence.push(`Reopen rate ${Math.round(g.reopenRate * 100)}% (aim under 10%)`);
    if (g.tagRate != null) base.evidence.push(`${Math.round(g.tagRate * 100)}% of cases tagged correctly`);
    if (g.disputeWinRate != null && g.disputesDecided >= 2) base.evidence.push(`Dispute win rate ${Math.round(g.disputeWinRate * 100)}% of ${g.disputesDecided}`);
  }
  for (const t of FLOW_TRAPS) if (recent.some((x) => x.trap === t)) traps.add(FLOW_TRAP_GROUP[t] ?? t);

  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const score = wsum ? parts.reduce((a, p) => a + p.w * p.s, 0) / wsum : null;
  base.score = score == null ? null : round2(score);
  base.n = total30;
  base.tier = tierFromScore(score);
  const label = { firstResponseHoursEmail: (v) => `Median first response ${v}h`, csat: (v) => `CSAT ${Math.round(v * 100)}% (30d)`, kbThemeCoverage: (v) => `${Math.round(v * 100)}% of top question themes have a solid, current article`, repeatContactPct: (v) => `${v}% of AI "resolutions" came back within 72h`, aiResolutionSharePct: (v) => `${v}% of AI conversations truly resolved (game estimate)` };
  base.evidence = base.signals.map((x) => label[x.metric]?.(x.value) ?? `${x.metric}: ${x.value}`);
  if (ai?.liveDay != null) base.evidence.push(`AI agent: ${(ai.flags?.liveTested || isTested(ai)) ? 'tested' : 'never tested'}, ${hasHumanHandoff(ai) ? 'human handoff on' : 'no human handoff'}, last review ${ai.lastReviewDay == null ? 'never' : `${day - ai.lastReviewDay} days ago`}`);
  if (backlogHits) base.evidence.push(`${backlogHits} ignored-backlog or abandoned-ticket event(s) in 90 days`);
  for (const t of T.traps) if (traps.has(t.id)) base.coaching.push(t.coaching);
  if (backlogHits) base.coaching.push('A backlog you ignore turns into abandoned tickets and cancellations. Raise the support block or fix the top question themes.');
  if (base.tier !== 'stellar') base.coaching.push(`A stellar operator: ${T.tiers.stellar.behaviours.join('; ')}.`);
  base.costs = recent.map((x) => ({ mistake: x.text, trap: x.trap, estimatedCost: x.estCost, since: x.day }));
  base.traps = [...traps];
  return base;
}

registerOperatorReader(FN, supportOperatorReader);
