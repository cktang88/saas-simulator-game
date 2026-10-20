// Operator reader for people_ops (data/operator-tiers.js): offer negotiation, onboarding, benefits and time off, workplace.
// Read from what the player DID (fairness of the offers they closed, how they answered counters, how complete each new hire's
// onboarding was, whether the benefits package is competitive and compliant, how they handled time-off requests and coverage,
// whether the workplace fits the team), never from volume. Unknown until the player has acted in at least one of the four.
// Weights and cut points are [design].

import { registerOperatorReader, tierFromScore, unknownRead, trapCoaching } from '../../core/operator.js';
import { clamp, round2 } from '../../core/util.js';
import { ONB, LEASE } from './ops-data.js';
import { humansOf } from './ops-state.js';
import { onboardingQuality } from './onboarding.js';
import { packageScore } from './ops-data.js';
import { headsFor } from './workplace.js';
import { roleCoverage, coverageMitigation } from './absence.js';
import { hrStackScore } from './stack.js';

const FN = 'people_ops';
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const W = { neg: 0.3, onb: 0.3, ben: 0.25, wp: 0.15, stack: 0.2 }; // stack: payroll / HR / EOR platform fit (people/stack.js)

function fairScore(r) {
  if (r == null) return 0.6;
  if (r < 0.85) return 0;
  if (r < 0.92) return 0.2;
  if (r < 0.95) return 0.6;
  if (r <= 1.08) return 1;
  if (r <= 1.15) return 0.7;
  return 0.3;
}

export function negotiationScore(state) {
  const p = state.apps.people;
  const hires = humansOf(p).filter((m) => m.ops?.askRatio != null && state.day - (m.hiredDay ?? 0) <= 400);
  const declines = (p.candidates ?? []).filter((c) => c.negotiation && c.stage === 'declined' && state.day - (c.offer?.sentDay ?? 0) <= 400);
  const log = p.ops?.neg?.log ?? [];
  if (!hires.length && !declines.length && !log.length) return null;
  const hs = hires.map((m) => 0.7 * fairScore(m.ops.askRatio) + 0.3 * (m.ops.overpaid ? 0.25 : 1));
  const miss = (state.mistakes ?? []).filter((x) => x.functionId === FN && ['negotiation_stalled', 'exploding_offer_lost_candidate', 'offer_reneged', 'no_salary_range_posted'].includes(x.id) && state.day - x.day <= 400);
  const base = hs.length ? mean(hs) : 0.55;
  const lostToProcess = declines.filter((c) => ['stalled', 'exploded'].includes(c.negotiation?.history?.at(-1)?.cause)).length;
  const score = clamp(base - Math.min(0.4, 0.12 * miss.length) - 0.1 * lostToProcess, 0, 1);
  return { score, hires, declines, miss, ratios: hires.map((m) => m.ops.askRatio) };
}

export function onboardingScore(state) {
  const p = state.apps.people;
  const hires = humansOf(p).filter((m) => m.onboarding && state.day - (m.hiredDay ?? 0) <= 400);
  if (!hires.length) return null;
  const qs = hires.map((m) => onboardingQuality(m) ?? 0);
  const miss = (state.mistakes ?? []).filter((x) => x.functionId === FN && ['missed_i9_deadline', 'access_not_revoked', 'no_onboarding_plan'].includes(x.id) && state.day - x.day <= 400);
  const exits = (p.ops?.offboard ?? []);
  const revoked = exits.filter((x) => x.revoked).length;
  const score = clamp(mean(qs) - Math.min(0.3, 0.07 * miss.length), 0, 1);
  return { score, hires, qs, miss, exits, revoked };
}

export function benefitsScore(state) {
  const p = state.apps.people;
  const o = p.ops;
  if (!o) return null;
  const b = o.benefits; // the policy as designed (a plan that cannot start yet still counts as a decision)
  const reqs = o.absences.filter((r) => r.kind === 'vacation');
  const staff = humansOf(p).filter((m) => m.status === 'active');
  if (!b.configured && !reqs.length) return null;
  const parts = [];
  if (b.configured) {
    const pk = packageScore(state, b);
    parts.push([0.4, clamp(pk.health, 0, 1)]);
    const gap = (state.mistakes ?? []).some((x) => x.id === 'state_sick_leave_gap');
    parts.push([0.2, gap ? 0.4 : 1]);
  } else parts.push([0.5, 0.35]); // answered requests on the default package, nothing designed
  const answered = reqs.filter((r) => r.status !== 'pending');
  if (answered.length || reqs.length) {
    const strikes = Math.max(0, ...staff.map((m) => (m.abs?.denied ?? []).filter((x) => !x.alt && state.day - x.day <= 180).length), 0);
    const auto = reqs.filter((r) => r.auto).length;
    const h = strikes === 0 ? 1 : strikes === 1 ? 0.7 : strikes === 2 ? 0.4 : 0.1;
    parts.push([0.25, clamp(h - Math.min(0.4, 0.1 * auto), 0, 1)]);
  }
  const single = roleCoverage(state, p).filter((c) => c.single);
  if (single.length) parts.push([0.15, coverageMitigation(state) >= 0.5 ? 1 : coverageMitigation(state) > 0 ? 0.7 : 0.25]);
  const tw = parts.reduce((a, [w]) => a + w, 0);
  const miss = (state.mistakes ?? []).filter((x) => x.functionId === FN && ['no_health_benefits_lost_candidate', 'denied_vacation_burnout', 'single_point_of_failure', 'state_sick_leave_gap'].includes(x.id) && state.day - x.day <= 400);
  return { score: clamp(parts.reduce((a, [w, v]) => a + w * v, 0) / tw - Math.min(0.3, 0.07 * miss.length), 0, 1), miss, b };
}

export function workplaceScore(state) {
  const w = state.apps.people?.ops?.workplace;
  if (!w?.mode) return null;
  const heads = headsFor(state) - 1; // team besides the founder
  let s;
  if (w.mode === 'remote') s = heads === 0 ? ((w.dayPasses ?? 0) >= 1 ? 0.85 : 0.55) : 0.8;
  else if (w.mode === 'cowork') s = w.cowork?.term === 'year' && heads < 4 ? 0.7 : 0.95;
  else if (w.mode === 'hybrid') s = heads >= 3 ? 0.9 : 0.6;
  else s = heads >= LEASE.minHeadcount ? (w.lease?.pg ? 0.75 : 0.9) : w.lease?.pg ? 0.1 : 0.25;
  const miss = (state.mistakes ?? []).filter((x) => x.functionId === FN && ['long_lease_too_early', 'personal_guarantee_called', 'office_required_shrinks_pool'].includes(x.id) && state.day - x.day <= 730);
  return { score: clamp(s - Math.min(0.45, 0.12 * miss.length), 0, 1), miss, mode: w.mode, heads };
}

export function peopleOpsRead(state) {
  const p = state.apps.people;
  if (!p?.ops) return unknownRead('Before the first offer: know the market rate for the role, post a salary range, and decide what you will concede. Before day 1: order the laptop, provision accounts and write the 30/60/90 plan.');
  const parts = { neg: negotiationScore(state), onb: onboardingScore(state), ben: benefitsScore(state), wp: workplaceScore(state), stack: hrStackScore(state) };
  const have = Object.entries(parts).filter(([, v]) => v);
  if (!have.length) return unknownRead('Configure benefits and time off, choose a workplace that fits the team, and run each hire through a checklist.');
  const tw = have.reduce((a, [k]) => a + W[k], 0);
  const score = clamp(have.reduce((a, [k, v]) => a + W[k] * v.score, 0) / tw, 0, 1);
  const n = parts.neg, ob = parts.onb, bn = parts.ben, wp = parts.wp, st = parts.stack;
  const evidence = [
    n ? `Offers: ${n.hires.length} closed${n.ratios.length ? ` at ${n.ratios.map((r) => `${Math.round(r * 100)}%`).join(', ')} of the ask` : ''}; ${n.miss.length ? `${n.miss.length} process mistake(s) (${[...new Set(n.miss.map((x) => x.id))].join(', ')})` : 'no stalled counters, exploding losses or missing salary ranges'}.` : null,
    ob ? `Onboarding: ${ob.hires.length} hire(s) at ${Math.round(mean(ob.qs) * 100)}% of the checklist; ${ob.exits.length ? `${ob.revoked} of ${ob.exits.length} exit(s) had access removed` : 'no exits to offboard yet'}${ob.miss.length ? `; ${ob.miss.length} paperwork or plan miss(es)` : ''}.` : null,
    bn ? `Benefits and time off: ${bn.b.configured ? `${bn.b.health.mode === 'none' ? 'no health plan' : bn.b.health.mode} health, ${bn.b.pto.mode} PTO` : 'default package, nothing designed'}${bn.miss.length ? `; ${bn.miss.length} issue(s): ${[...new Set(bn.miss.map((x) => x.id))].join(', ')}` : ''}.` : null,
    ...(st ? st.evidence.map((e) => `HR stack: ${e}`) : []),
    wp ? `Workplace: ${wp.mode} with ${wp.heads} on the team${wp.miss.length ? `; ${wp.miss.length} mistake(s): ${[...new Set(wp.miss.map((x) => x.id))].join(', ')}` : ''}.` : null,
  ];
  const coaching = [];
  const ids = new Set((state.mistakes ?? []).filter((x) => x.functionId === FN).map((x) => x.id));
  if (n && (n.ratios.some((r) => r < 0.92) || ids.has('lowball_offer_attrition'))) coaching.push(trapCoaching(FN, 'lowball_offer'));
  if (ids.has('exploding_offer_lost_candidate') || ids.has('negotiation_stalled')) coaching.push(trapCoaching(FN, 'exploding_offer'));
  if (ids.has('pay_inequity_team')) coaching.push(trapCoaching(FN, 'overpay_new_hire'));
  if (ids.has('no_salary_range_posted')) coaching.push(trapCoaching(FN, 'no_range'));
  if (ob && (ob.qs.some((q) => q < 0.6) || ids.has('no_onboarding_plan') || ids.has('missed_i9_deadline'))) coaching.push(trapCoaching(FN, 'here_is_slack'));
  if (ids.has('access_not_revoked')) coaching.push(trapCoaching(FN, 'access_left_on'));
  if (ids.has('no_health_benefits_lost_candidate') || (bn && bn.b.configured && bn.b.health.mode === 'none')) coaching.push(trapCoaching(FN, 'no_health_plan'));
  if (ids.has('denied_vacation_burnout') || ids.has('single_point_of_failure')) coaching.push(trapCoaching(FN, 'deny_and_hope'));
  if (ids.has('long_lease_too_early') || ids.has('personal_guarantee_called') || ids.has('office_required_shrinks_pool')) coaching.push(trapCoaching(FN, 'lease_before_team'));
  if (st) coaching.push(...st.coaching);
  const tier = tierFromScore(score, { cuts: { stellar: 0.8, good: 0.62, average: 0.38 } });
  if (tier !== 'stellar') coaching.push('What a stellar operator does: pays at the market midpoint with the range posted, answers counters within a day, hands every hire a laptop, access, a buddy and a 30/60/90 plan before day one, offers a real health plan and a PTO policy that meets the state mandates, approves time off with a handoff, and keeps the workplace flexible until the team is big enough to justify a lease.');
  return { tier, score: round2(score), n: have.length, evidence: evidence.filter(Boolean), coaching: [...new Set(coaching.filter(Boolean))] };
}

registerOperatorReader(FN, peopleOpsRead);
export { ONB };
