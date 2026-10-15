// Operator reader for global_hiring (data/operator-tiers.js): scores how the player placed, vetted and papered
// people hired abroad or part-time. Read from what the player DID on each hire (member.vetting, overlap, English
// level against what was assessed, contract type, IP paper, hours versus what the role demands), never from the
// number of hires. Unknown until a hire outside the US, a part-timer or a fractional exec exists. Weights are [design].

import { registerOperatorReader, tierFromScore, unknownRead, trapCoaching } from '../../core/operator.js';
import { clamp, round2 } from '../../core/util.js';
import { customerFacing, workMods, loadRatio, partTimeFit, FN } from './global.js';

const isGlobalHire = (m) => m.kind !== 'ai_agent' && m.kind !== 'cofounder' && m.tz != null && (m.region !== 'us' || (m.hoursPerWeek ?? 40) < 35 || m.fractional);
const W = { match: 0.24, english: 0.14, vetting: 0.26, planning: 0.1, hygiene: 0.14, partTime: 0.12 };

export function scoreHire(state, m) {
  const role = m.jobRole ?? m.role;
  const x = workMods(m);
  const cust = customerFacing(role);
  const v = m.vetting ?? {};
  const parts = {};
  // Role matched to region: customer-facing roles need buyers' hours; support is fine overnight with a planned handoff.
  if (cust && role !== 'support') parts.match = 1 - clamp(x.short / Math.max(1, x.need), 0, 1);
  else if (role === 'support') parts.match = x.short < 0.5 || v.overlapPlanned ? 1 : 1 - 0.7 * clamp(x.short / 2, 0, 1);
  else parts.match = 1 - 0.5 * clamp(x.short / Math.max(1, x.need), 0, 1);
  // English: customer-facing roles need professional; the level is hidden, so this rewards having checked and chosen well.
  const lvl = m.english ?? 5;
  parts.english = cust ? (lvl >= 4 ? 1 : lvl === 3 ? 0.4 : 0.1) : lvl >= 3 ? 1 : 0.6;
  if (cust && !v.englishRead?.assessed) parts.english *= 0.6; // a 20-minute screen is not an English assessment
  // Vetting of a remote hire: camera + ID, trial or work sample, references or backchannel, background check.
  parts.vetting = 0.25 * (v.camera ? 1 : 0) + 0.25 * ({ paidTrial: 1, workSample: 0.9, walkthrough: 0.7, takeHome: 0.3 }[v.trial] ?? 0) + 0.2 * ({ backchannel: 1, references: 0.5 }[v.refs] ?? 0) + 0.3 * ({ pro: 1, standard: 0.6, basic: 0.3 }[v.bg] ?? 0);
  // Overlap planning: required hours on the post or a handoff runbook, where nature does not already provide them.
  parts.planning = x.short < 0.5 ? 1 : v.overlapPlanned ? 1 : 0.2;
  // Paper: contractors abroad on an EOR/CoR when staff-like, with a local-law IP assignment.
  if (m.engagement === 'contractor') parts.hygiene = 1 - (m.ipGap ? 0.35 : 0) - (m.classificationFlag ? 0.35 : 0);
  if (m.partTime || m.fractional || (m.hoursPerWeek ?? 40) < 35) {
    const fit = partTimeFit(role).fit;
    parts.partTime = clamp((fit >= 0.6 ? 1 : fit * 1.6) * (loadRatio(m) > 1.25 ? 0.4 : 1), 0, 1);
  }
  let s = 0, t = 0;
  for (const [k, val] of Object.entries(parts)) { s += val * W[k]; t += W[k]; }
  return { score: s / t, parts };
}

export function globalHiringRead(state) {
  const p = state.apps.people;
  if (!p?.members) return unknownRead();
  const hires = p.members.filter((m) => isGlobalHire(m) && m.status !== 'offer' && state.day - m.startDay <= 730);
  if (!hires.length) return unknownRead('Before hiring abroad or part-time: set required overlap on the post, plan coverage for support, and decide how you will check identity and English.');
  const rows = hires.map((m) => ({ m, ...scoreHire(state, m) }));
  const mistakes = (state.mistakes ?? []).filter((x) => x.functionId === FN && state.day - x.day <= 730);
  const base = rows.reduce((a, r) => a + r.score, 0) / rows.length;
  const score = Math.max(0, base - Math.min(0.12, 0.02 * mistakes.length));
  const custRows = rows.filter((r) => customerFacing(r.m.jobRole ?? r.m.role));
  const remote = rows.filter((r) => r.m.region !== 'us');
  const vetted = remote.filter((r) => r.m.vetting?.camera && ['paidTrial', 'workSample'].includes(r.m.vetting?.trial) && r.m.vetting?.refs && r.m.vetting?.bg).length;
  const gaps = hires.filter((m) => m.engagement === 'contractor' && m.region !== 'us');
  const evidence = [
    `${hires.length} global or part-time hire(s): ${rows.filter((r) => r.parts.match >= 0.8).length} placed well for their role and time zone.`,
    custRows.length ? `${custRows.filter((r) => r.m.vetting?.englishRead?.assessed).length} of ${custRows.length} customer-facing hire(s) had English assessed before the offer; ${custRows.filter((r) => (r.m.english ?? 5) <= 3).length} turned out at working level or below.` : null,
    remote.length ? `${vetted} of ${remote.length} remote hire(s) had camera, trial, references and a background check; ${hires.filter((m) => m.fraud || m.moonlight).length} fake or second-job hire(s) reached payroll.` : null,
    gaps.length ? `${gaps.filter((m) => m.ipGap || m.classificationFlag).length} of ${gaps.length} foreign contractor(s) with an IP or classification gap.` : null,
    mistakes.length ? `${mistakes.length} logged mistake(s): ${[...new Set(mistakes.map((x) => x.id))].slice(0, 4).join(', ')}.` : null,
  ];
  const coaching = [];
  if (rows.some((r) => r.parts.match < 0.7)) coaching.push(trapCoaching('global_hiring', 'cheapest_region'));
  if (rows.some((r) => r.parts.vetting < 0.6)) coaching.push(trapCoaching('global_hiring', 'resume_english'));
  if (rows.some((r) => (r.parts.hygiene ?? 1) < 0.8)) coaching.push(trapCoaching('global_hiring', 'contractor_staff'));
  if (rows.some((r) => (r.parts.partTime ?? 1) < 0.6)) coaching.push(trapCoaching('global_hiring', 'part_time_full_job'));
  if (custRows.some((r) => !r.m.vetting?.englishRead?.assessed)) coaching.push('Make customer-facing candidates talk through a real case and write a short sample; a screen call alone reads English with wide error.');
  return { tier: tierFromScore(score, { cuts: { stellar: 0.8, good: 0.6, average: 0.34 } }), score: round2(score), n: hires.length, evidence: evidence.filter(Boolean), coaching: [...new Set(coaching.filter(Boolean))] };
}

registerOperatorReader('global_hiring', globalHiringRead);
