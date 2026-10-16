// Operator reader for gtm_comp_design (data/operator-tiers.js): scores what the saved comp plans actually pay for and
// how they behaved, never how many plans or how many reps. Unknown until a quota-carrying hire exists or a plan was
// designed. Numbers are [design] (docs/research/gtm-comp/comp-plans.md).

import { registerOperatorReader, tierFromScore, unknownRead, trapCoaching } from '../../core/operator.js';
import { COMP_ROLES, OTE_MARKET } from '../../data/gtm-comp.js';
import { clamp, round2 } from '../../core/util.js';
import { planFor, planKeyOf, ensureComp, complexity, oteRatio } from './comp.js';

const ALIGN = {
  sdr: { qualified_opps: 1, sourced_closed_won: 0.8, pipeline_usd: 0.6, meetings_held: 0.1 },
  ae: { new_acv: 1, tcv: 0.8 }, founding_ae: { new_acv: 1, tcv: 0.8 },
  am: { expansion_renewals: 1 }, csm: { grr: 1, renewals_bonus: 0.9, nrr: 0.45 }, se: { team_quota: 1 },
};

function planScore(plan, key, ratio) {
  const parts = {};
  parts.alignment = ALIGN[key]?.[plan.metric] ?? 0.5;
  const sellers = key === 'ae' || key === 'founding_ae';
  if (sellers || key === 'am') {
    parts.clawback = plan.clawbackDays >= 60 ? 1 : plan.clawbackDays > 0 ? 0.5 : 0;
    parts.timing = plan.payTiming === 'cash' ? 1 : 0.6;
    parts.discount = plan.discountAuthority <= 0.15 ? 1 : plan.discountAuthority <= 0.2 ? 0.7 : plan.discountAuthority <= 0.25 ? 0.4 : 0.15;
  }
  parts.cap = plan.cap == null ? 1 : plan.cap >= 2 ? 0.8 : plan.cap >= 1.5 ? 0.35 : 0.2;
  if (key !== 'se' && key !== 'csm') parts.draw = plan.drawMonths > 0 ? 1 : 0.5;
  parts.ote = ratio == null ? 0.6 : ratio >= 0.9 && ratio <= 1.15 ? 1 : ratio >= OTE_MARKET.underpaid ? 0.7 : ratio > 1.3 ? 0.4 : ratio > 1.15 ? 0.75 : 0.15;
  parts.simple = complexity(plan) <= 6 ? 1 : complexity(plan) <= 8 ? 0.6 : 0.25;
  const w = { alignment: 3, clawback: 2.2, timing: 0.8, discount: 1.4, cap: 1.6, draw: 0.5, ote: 1.6, simple: 0.8 };
  let s = 0, t = 0;
  for (const [k, v] of Object.entries(parts)) { s += v * w[k]; t += w[k]; }
  return { score: s / t, parts };
}

export function compDesignRead(state) {
  const p = state.apps.people;
  if (!p?.members) return unknownRead();
  const comp = ensureComp(state);
  const reps = p.members.filter((m) => m.kind !== 'ai_agent' && planKeyOf(m) && (m.status === 'active' || m.status === 'gone') && state.day - m.startDay >= 45);
  const keys = [...new Set(reps.map(planKeyOf))];
  if (!keys.length) return unknownRead('Before the first quota-carrying hire, design the plan: pay SDRs on qualified opportunities, AEs on cash with a clawback, and keep OTE near the role market.');
  const per = keys.map((k) => {
    const mem = reps.filter((m) => planKeyOf(m) === k);
    const ratios = mem.map((m) => oteRatio(state, m)).filter((x) => x != null);
    const r = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
    return { key: k, ...planScore(planFor(state, k), k, r), n: mem.length };
  });
  const design = per.reduce((a, x) => a + x.score, 0) / per.length; // each plan counts once: more reps on a plan is not a better plan
  // Stability and consequences.
  const year = comp.changes.filter((c) => state.day - c.day <= 365 && c.reps > 0);
  const midyear = (state.mistakes ?? []).filter((x) => x.functionId === 'gtm_comp_design' && x.id === 'midyear_plan_change' && state.day - x.day <= 365).length;
  const stability = clamp(1 - 0.3 * midyear - 0.1 * Math.max(0, year.length - 1), 0, 1);
  const consequences = (state.mistakes ?? []).filter((x) => x.functionId === 'gtm_comp_design' && ['capped_plan_sandbagging', 'comp_pays_for_junk_meetings', 'no_clawback_bad_fit_churn', 'quarter_end_discounting'].includes(x.id) && state.day - x.day <= 365).length;
  const score = clamp(0.72 * design + 0.18 * stability + 0.1 * (1 - clamp(consequences / 4, 0, 1)), 0, 1);
  const worst = [...per].sort((a, b) => a.score - b.score)[0];
  const gaps = [];
  const sdr = per.find((x) => x.key === 'sdr');
  if (sdr && sdr.parts.alignment < 0.5) gaps.push('pays_for_meetings');
  if (per.some((x) => x.parts.clawback === 0)) gaps.push('no_clawback');
  if (per.some((x) => x.parts.cap != null && x.parts.cap < 0.5)) gaps.push('hard_cap');
  if (per.some((x) => x.parts.discount != null && x.parts.discount < 0.5)) gaps.push('wide_discount_authority');
  if (midyear) gaps.push('midyear_change');
  if (per.some((x) => x.parts.ote < 0.5)) gaps.push('under_market_ote');
  const evidence = [
    `${reps.length} quota-carrying hire(s) on ${keys.length} plan(s); plan design score ${Math.round(design * 100)}/100.`,
    ...per.map((x) => `${COMP_ROLES[x.key].label}: pays on ${planFor(state, x.key).metric.replace(/_/g, ' ')}, clawback ${planFor(state, x.key).clawbackDays ? planFor(state, x.key).clawbackDays + ' days' : 'none'}, ${planFor(state, x.key).cap ? 'capped at ' + planFor(state, x.key).cap + 'x' : 'uncapped'}, ${planFor(state, x.key).payTiming} basis.`),
    midyear ? `${midyear} mid-period plan change(s) in the last year (stellar: at most one, at a boundary).` : null,
    consequences ? `${consequences} traceable plan-driven mistake(s): junk meetings, poor-fit churn, sandbagging or period-end discounting.` : null,
  ];
  const coaching = gaps.map((id) => trapCoaching('gtm_comp_design', id)).filter(Boolean);
  if (worst && worst.score < 0.8) coaching.push(`Weakest plan: ${COMP_ROLES[worst.key].label}. A stellar operator pays on outcomes that survive (qualified opportunities, cash collected, retained revenue), clawbacks churn inside 60-120 days and keeps OTE within ~15% of market.`);
  return { tier: tierFromScore(score, { cuts: { stellar: 0.85, good: 0.68, average: 0.54 } }), score: round2(score), n: reps.length, evidence: evidence.filter(Boolean), coaching: [...new Set(coaching)] };
}

registerOperatorReader('gtm_comp_design', compDesignRead);
