// Operator readers for founder time management, automation / AI leverage (shared with the Automations app) and
// founder sustainability (core/operator.js; tiers and traps in data/operator-tiers.js). Each read comes from what
// the player DID (plans vs logged hours, sources checked, write scopes, decisions on dated criteria), never from
// volume, and is 'unknown' until there is something to read.

import { registerOperatorReader, tierFromScore, trapCoaching, unknownRead } from '../../core/operator.js';
import { assistantSignals, assistantCoaching } from './engine.js';
import { inboxSignals, inboxCoaching } from './triage.js';
import { planningSignals, sustainabilitySignals } from './planner.js';

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const round1 = (x) => Math.round((x ?? 0) * 10) / 10;

// Automations app (another owner): read its slice directly so this reader works whether or not that module is
// loaded. Fields per public/apps/automations/engine.js ensureAutomations/summary.
function automationSignals(state) {
  const A = state.apps.automations;
  if (!A?.automations?.length) return null;
  const saved = Object.values(A.stats?.saved ?? {}).reduce((a, b) => a + b, 0);
  const st = A.stats ?? {};
  const spent = (st.setupHours ?? 0) + (st.testHours ?? 0) + (st.reviewHours ?? 0) + (st.debugHours ?? 0) + (st.monitorHours ?? 0);
  const since = state.day - 90;
  const harmKinds = ['complaint', 'cancel', 'missed_lead', 'lost_note', 'wrong_data', 'misrouted', 'runaway'];
  const harm = (A.incidents ?? []).filter((x) => x.day > since && harmKinds.includes(x.kind)).length;
  const on = A.automations.filter((a) => a.status === 'on');
  const untested = on.filter((a) => !a.tested).length;
  return { n: A.automations.length, on: on.length, net: saved - spent, harm, untested };
}

export function automationRead(state) {
  const a = assistantSignals(state);
  const i = inboxSignals(state);
  const z = automationSignals(state);
  const acted = (a && (a.runs || a.chats || a.projects)) || i.agentOn || z;
  if (!acted) return unknownRead(trapCoaching('automation_ai', 'replace_human_loop'));
  let score = 0.7;
  const evidence = [];
  const coaching = [];
  const traps = [];
  if (a && (a.used || a.runs)) {
    if (a.verifyRate != null) { score += (a.verifyRate - 0.25) * 0.5; evidence.push(`Checked ${a.verified} of ${a.facts} sourced numbers (${pct(a.verifyRate)})`); }
    if (a.wrongShare != null) { score -= a.wrongShare * 1.2; evidence.push(`${a.usedWrong} of ${a.used} used outputs carried a wrong number`); }
    if (a.goodProjects) score += 0.05;
    if (a.writeRisk) { score -= 0.25; traps.push('replace_human_loop'); }
    if (a.autoInvestor) { score -= 0.2; traps.push('replace_human_loop'); }
    if (a.failedUnseen) score -= 0.08;
    if (a.paidUnused) { score -= 0.1; traps.push('tool_stacking'); }
    evidence.push(`Assistant: ${a.runs} runs, ${a.incidents} incident${a.incidents === 1 ? '' : 's'} in 90 days, ~${round1(a.savedHours)}h saved on paper`);
    score -= Math.min(0.4, a.incidents * 0.15);
    coaching.push(...assistantCoaching(state).filter((n) => n.tone !== 'good').map((n) => n.advice ?? n.text));
  }
  if (i.agentOn) {
    if (!i.audited) score -= 0.08;
    if (i.autoSend) { score -= 0.2; traps.push('replace_human_loop'); }
    if (i.autoArchive && !i.reviews30) score -= 0.08;
    score -= Math.min(0.3, i.lostValuable * 0.1 + i.draftErrorsSent * 0.1);
    evidence.push(`Inbox triage: ${i.audited ? 'audited' : 'not audited'}, ${i.lostValuable} valuable lost, ${i.draftErrorsSent} bad drafts sent`);
    coaching.push(...inboxCoaching(state).filter((n) => /triage|auto|draft/i.test(n.text)).map((n) => n.advice ?? n.text));
  }
  if (z) {
    score += z.net > 0 && z.harm === 0 ? 0.05 : 0;
    score -= Math.min(0.3, z.harm * 0.05) + (z.untested ? 0.05 : 0);
    evidence.push(`Automations: ${z.on} on, net ${round1(z.net)}h, ${z.harm} harmful incidents in 90 days`);
  }
  for (const t of new Set(traps)) coaching.push(trapCoaching('automation_ai', t));
  return { tier: tierFromScore(Math.max(0, Math.min(1, score))), score: Math.max(0, Math.min(1, score)), evidence, coaching: [...new Set(coaching)].slice(0, 5) };
}

export function founderTimeRead(state) {
  const p = planningSignals(state);
  const i = inboxSignals(state);
  // Everyone spends time, so two played weeks (10h+ logged each) are enough to read where it went.
  if (p.weeks < 2) return unknownRead(trapCoaching('founder_time', 'busy_work'));
  // Share of hours on stated priorities is the primary separation metric; unplanned weeks count as 0.
  let score = (p.effShare ?? 0) + Math.min(1, p.focusPerWeek / 15) * 0.25 + p.tiedShare * 0.1 + (p.plannedWeeks / p.weeks) * 0.1 - Math.min(0.3, p.fragmentedPerWeek * 0.08) - (p.tooMany ? 0.1 : 0);
  if (p.reviews) score += 0.05;
  if (i.missed30 >= 2) score -= 0.1;
  if (i.paidScams) score -= 0.15;
  score = Math.max(0, Math.min(1, score));
  const coaching = [];
  if (p.plannedWeeks < p.weeks) coaching.push(trapCoaching('founder_time', 'busy_work'));
  if (p.tooMany) coaching.push('Your Monday plan has more than three items. Pick the top three.');
  if (p.fragmentedPerWeek >= 2) coaching.push(trapCoaching('founder_time', 'bad_batching'));
  if (p.focusPerWeek < 5) coaching.push('Block maker time in half-day chunks and do the build or writing work inside them: focus hours count for more.');
  if (i.declinedShare != null && i.declinedShare < 0.3) coaching.push(trapCoaching('founder_time', 'every_intro_call'));
  if (p.plannedWeeks && !p.reviews) coaching.push(trapCoaching('founder_time', 'same_review'));
  if (i.paidScams) coaching.push('Legitimate investors, podcasts and conferences do not charge founders a fee.');
  return {
    tier: tierFromScore(score, { cuts: { stellar: 0.7, good: 0.5, average: 0.3 } }), score,
    evidence: [`${pct(p.avgShare)} of hours on stated priorities (last ${p.weeks} weeks, ${p.plannedWeeks} planned)`, `${round1(p.focusPerWeek)}h deep work in focus blocks per week`, `${round1(p.fragmentedPerWeek)} fragmented days per week`, ...(i.vip ? [`VIP replies: ${i.vip.avgDays} days on average`] : [])],
    coaching: [...new Set(coaching)].slice(0, 4),
  };
}

export function sustainabilityRead(state) {
  const s = sustainabilitySignals(state);
  if (!s.criteria && state.day < 60) return unknownRead(trapCoaching('founder_sustainability', 'persistence_as_inaction'));
  let score = 0.45;
  const coaching = [];
  if (s.criteria) score += s.beforeBet ? 0.3 : 0.15; else coaching.push('Write a dated kill criterion before your next bet: "if MRR is under $X by <date>, we pivot or stop".');
  if (s.daysPast != null) {
    score -= s.daysPast <= 14 ? 0 : s.daysPast <= 90 ? 0.15 : 0.35;
    if (s.missedOpen) coaching.push(trapCoaching('founder_sustainability', 'persistence_as_inaction'));
  } else if (s.criteria) score += 0.1;
  score -= Math.min(0.3, s.weeksOver60 * 0.04);
  if (s.weeksOver60 >= 5) coaching.push(trapCoaching('founder_sustainability', 'ignore_health'));
  if (s.fastPivots) { score -= 0.15 * s.fastPivots; coaching.push(trapCoaching('founder_sustainability', 'pivot_every_90')); }
  score = Math.max(0, Math.min(1, score));
  return {
    tier: tierFromScore(score), score,
    evidence: [s.criteria ? `${s.criteria} kill criteri${s.criteria === 1 ? 'on' : 'a'}${s.beforeBet ? ', set before the bet' : ''}` : 'No kill criteria written', ...(s.daysPast != null ? [`${s.daysPast} days between a missed criterion and a decision`] : []), `${s.weeksOver60} weeks over 60h last quarter`, `${s.pivots} pivots`],
    coaching: coaching.slice(0, 4),
  };
}

registerOperatorReader('automation_ai', automationRead);
registerOperatorReader('founder_time', founderTimeRead);
registerOperatorReader('founder_sustainability', sustainabilityRead);
