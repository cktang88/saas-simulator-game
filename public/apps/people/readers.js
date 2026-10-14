// Operator readers for hiring and people management (core/operator.js registry), plus the People triggers and
// actions exposed to the Automations app (docs/review/tool-gap-analysis.md section 4). Pure reads of state.

import { registerOperatorReader, tierFromScore, unknownRead } from '../../core/operator.js';
import { OPERATOR_TIERS } from '../../data/operator-tiers.js';
import { round2 } from '../../core/util.js';
import { AGENCY } from './sourcing.js';
import { ensureMgmt, missingInputs, tierOfScore } from './manage.js';

const trapCoach = (fn, id) => OPERATOR_TIERS[fn]?.traps?.find((t) => t.id === id)?.coaching;
const stellarLine = (fn) => `Stellar: ${OPERATOR_TIERS[fn]?.tiers?.stellar?.behaviours?.[0] ?? ''}`;
const humansOf = (state) => (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.kind !== 'cofounder');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

export function hiringRead(state) {
  const p = state.apps.people;
  if (!p) return unknownRead();
  const hires = humansOf(state).filter((m) => m.provenance && state.day - m.provenance.day <= 365);
  if (!hires.length) return unknownRead('Write the role scorecard (3–5 outcomes) and design the work sample before the first interview.');
  const pv = hires.map((m) => m.provenance);
  const mistakes = (state.mistakes ?? []).filter((x) => x.functionId === 'hiring' && state.day - x.day <= 365);
  const compliance = mistakes.filter((x) => ['fcra_skipped', 'bg_pre_offer', 'eeo_proxy_criteria', 'ai_auto_reject'].includes(x.id)).length;
  const score = Math.max(0, pv.reduce((a, x) => a + x.score, 0) / pv.length - 0.08 * compliance);
  const year = humansOf(state).filter((m) => m.provenance && state.day - m.startDay >= 365);
  const replaced = year.filter((m) => m.status === 'gone' && m.endDay - m.startDay <= 365).length;
  const days = pv.map((x) => x.daysToOffer).filter((x) => x != null);
  const evidence = [
    `${hires.length} hire(s) in the last year: ${pv.filter((x) => x.scorecardBefore).length} with a scorecard first, ${pv.filter((x) => x.interview === 'structured').length} structured interview(s), ${pv.filter((x) => x.workSample && x.workSample !== 'unsupervised take-home').length} work sample(s), ${pv.filter((x) => x.references || x.backchannel).length} with references or backchannel.`,
    days.length ? `Median ${median(days)} days from final step to offer (stellar: 1–2).` : null,
    year.length ? `${replaced} of ${year.length} hires older than a year were replaced within 12 months (stellar 5–10%, mediocre 40–60%, game estimate).` : null,
    compliance ? `${compliance} screening compliance mistake(s) (FCRA, fair-chance, EEO).` : null,
  ];
  const coaching = [];
  const count = (f) => pv.filter(f).length;
  if (count((x) => !x.scorecardBefore)) coaching.push(trapCoach('hiring', 'role_undefined'), trapCoach('hiring', 'culture_fit'));
  if (count((x) => x.interview !== 'structured')) coaching.push('Ask every candidate the same job-related questions and probe 2–3 levels ("what exactly did you do?").');
  if (count((x) => !x.workSample)) coaching.push('Add a short live work sample: it is the hardest evidence to fake.');
  if (count((x) => !x.references && !x.backchannel)) coaching.push('Call two references and ask what would make them not hire this person again.');
  if (days.some((d) => d > 7)) coaching.push(trapCoach('hiring', 'verbal_offers'));
  if (pv.some((x) => ['contingency_recruiter', 'retained_search'].includes(x.channel) || AGENCY[x.channel]?.kind === 'retained')) coaching.push(trapCoach('hiring', 'recruiter_first'));
  if (compliance) coaching.push('Background checks only after a conditional offer, with consent; a "consider" report needs the pre-adverse notice and a wait before you decide.');
  coaching.push(stellarLine('hiring'));
  return { tier: tierFromScore(score, { cuts: { stellar: 0.75, good: 0.5, average: 0.28 } }), score: round2(score), n: hires.length, evidence: evidence.filter(Boolean), coaching: [...new Set(coaching.filter(Boolean))] };
}

export function peopleManagementRead(state) {
  const team = humansOf(state).filter((m) => m.status === 'active' && state.day - m.startDay >= 30);
  if (!team.length) return unknownRead('Before a hire starts: write a 30/60/90 plan with three measurable outcomes.');
  const scores = team.map((m) => ensureMgmt(m).score ?? 0.3);
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  const g = team.map((m) => ensureMgmt(m));
  const gaps = team.filter((m) => m.concernSince != null && !m.mgmt.talks.some((t) => t.day >= m.concernSince - 14));
  const evidence = [
    `${team.length} person team: ${g.filter((x) => x.cadence === 'weekly').length} weekly 1:1(s), ${g.filter((x) => x.plan).length} 30/60/90 plan(s), ${g.filter((x) => x.feedback.some((f) => state.day - f.day <= 90)).length} with written feedback in the last 90 days.`,
    gaps.length ? `${gaps.length} performance gap(s) unaddressed (longest ${Math.max(...gaps.map((m) => state.day - m.concernSince))} days; stellar addresses within 14).` : null,
    team.some((m) => m.quietQuitting) ? `${team.filter((m) => m.quietQuitting).length} quietly quitting.` : null,
  ];
  const coaching = [];
  const miss = team.flatMap((m) => missingInputs(state, m));
  if (miss.some((x) => /unaddressed/.test(x))) coaching.push(trapCoach('people_management', 'avoid_hard_conversation'));
  if (miss.some((x) => /feedback/.test(x))) coaching.push(trapCoach('people_management', 'positive_only'));
  if (miss.some((x) => /1:1/.test(x))) coaching.push('Hold a weekly 30-minute 1:1 with a fixed agenda: what is blocked, what you need from me, what you are learning.');
  if (miss.some((x) => /30\/60\/90/.test(x))) coaching.push('Write a 30/60/90 plan with three measurable outcomes before day 1.');
  if (team.some((m) => m.engagement === 'contractor' && m.hoursPerWeek >= 30 && !m.cor)) coaching.push(trapCoach('people_management', 'disguised_employee'));
  if ((state.mistakes ?? []).some((x) => x.id === 'fire_without_notes')) coaching.push(trapCoach('people_management', 'fire_without_notes'));
  coaching.push(stellarLine('people_management'));
  return { tier: tierOfScore(score), score: round2(score), n: team.length, evidence: evidence.filter(Boolean), coaching: [...new Set(coaching.filter(Boolean))] };
}

registerOperatorReader('hiring', hiringRead);
registerOperatorReader('people_management', peopleManagementRead);

// ---------------------------------------------------------------------------
// Automations exposure: triggers (events since a day) and actions. Read-only for triggers.
// ---------------------------------------------------------------------------

export function peopleEvents(state, trigger, since = state.day - 1) {
  const p = state.apps.people;
  if (!p) return [];
  const out = [];
  switch (trigger) {
    case 'candidate_applied':
      for (const c of p.candidates) if (c.appliedDay >= since) out.push({ ref: `cand:${c.id}`, candidateId: c.id, name: c.name, email: c.email, role: c.role, channel: c.channel, label: `New applicant: ${c.name}` });
      break;
    case 'offer_accepted':
      for (const m of p.members) if (m.provenance && m.hiredDay >= since) out.push({ ref: `hire:${m.id}`, memberId: m.id, name: m.name, startDay: m.startDay, label: `${m.name} accepted the offer` });
      break;
    case 'member_left':
      for (const m of p.members) if (m.status === 'gone' && m.endDay >= since && m.kind !== 'ai_agent') out.push({ ref: `left:${m.id}`, memberId: m.id, name: m.name, reason: m.exitReason, label: `${m.name} left (${m.exitReason ?? 'ended'})` });
      break;
    case 'background_check_ready':
      for (const c of p.candidates) if (c.backgroundCheck?.reportDay >= since) out.push({ ref: `bg:${c.id}`, candidateId: c.id, name: c.name, status: c.backgroundCheck.status, label: `Background check ${c.backgroundCheck.status}: ${c.name}` });
      break;
    case 'performance_concern':
      for (const m of p.members) if (m.concernSince != null && m.concernSince >= since) out.push({ ref: `concern:${m.id}:${m.concernSince}`, memberId: m.id, name: m.name, label: `Performance concern: ${m.name}` });
      break;
    case 'payroll_due':
      for (const r of p.runs ?? []) if (r.day >= since) out.push({ ref: `payroll:${r.day}`, day: r.day, label: `Payroll ran: ${r.lines?.length ?? 0} people` });
      break;
    default:
  }
  return out;
}

export const PEOPLE_TRIGGERS = ['candidate_applied', 'offer_accepted', 'member_left', 'background_check_ready', 'performance_concern', 'payroll_due'];
