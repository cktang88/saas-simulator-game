// On-the-job performance from hidden traits (public/data/roles.js ROLES[*].outputs via outputValue).
// Performance is revealed gradually and noisily, so mis-hires are detected late — as in reality
// (obvious failures 2–6 weeks, mediocrity 8–16 weeks, AEs 4–7 months; research §4.2 [design]).

import { ROLES as DATA_ROLES, outputValue, z } from '../../data/roles.js';
import { gaussian, chance, round2, clamp, fmtDate } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { jobRoleOf } from './catalog.js';
import { roleComposite } from './candidates.js';
import { applyOutputMods, coordHours } from './global.js';

const outputsOf = (m) => DATA_ROLES[jobRoleOf(m)]?.outputs ?? {};

// Output value for a member (median when the member predates the trait model or has no such output).
export function outputFor(m, key) {
  const jr = jobRoleOf(m);
  const o = DATA_ROLES[jr]?.outputs?.[key];
  if (!o) return null;
  let v = m.traits ? outputValue(jr, key, m.traits) : o.median;
  if (m.fraud === 'stand_in' && /velocity|throughput|Mult$/.test(key) && !/bug|cost|firstResponse/.test(key)) v *= 0.3;
  if (key === 'bugRateMult' && m.traits && z(m.traits.conscientiousness) < 0 && z(m.traits.ai_fluency) > 0.5) v *= 1.15; // unverified AI output [design]
  // Time-zone overlap, English, part-time hours, holidays and moonlighting (people/global.js): one place for all of it.
  v = applyOutputMods(m, key, v);
  return round2(v);
}

// Productivity multiplier used for dev hours (engineers) and throughput elsewhere.
export function productivityFor(m) {
  const outs = outputsOf(m);
  const key = outs.velocityMult ? 'velocityMult' : outs.throughputMult ? 'throughputMult' : outs.ticketsPerDayMult ? 'ticketsPerDayMult' : outs.piecesPerWeekMult ? 'piecesPerWeekMult' : null;
  if (!key) return m.traits ? round2(clamp(1 + 0.3 * roleComposite(jobRoleOf(m), m.traits), 0.4, 1.8)) : 1;
  return outputFor(m, key);
}

// Weekly founder management hours this member needs [design: role outputs, else 1h].
export function managementHours(m) {
  const extra = coordHours(m); // async handoffs, odd-hour calls, part-time catch-up (people/global.js)
  if (m.engagement === 'contractor' && m.traits) {
    const coord = outputValue('contractor', 'coordinationHoursPerWeek', m.traits);
    return round2(coord + extra);
  }
  const f = outputFor(m, 'founderHoursPerWeek');
  if (f != null) return round2(f + extra);
  if (!m.traits) return 1;
  return round2(clamp(1.5 - 0.5 * z(m.traits.agency), 0.5, 3) + extra);
}

// The role's headline metric for the performance read.
export function headlineMetric(m) {
  const jr = jobRoleOf(m);
  const pd = DATA_ROLES[jr]?.performanceDistribution;
  const outs = outputsOf(m);
  if (outs.quotaAttainment) return { key: 'quotaAttainment', label: 'quota attainment', fmt: (v) => `${Math.round(v * 100)}%` };
  if (outs.meetingsPerMonth) return { key: 'meetingsPerMonth', label: 'held meetings/month', fmt: (v) => v.toFixed(1) };
  if (outs.csat) return { key: 'csat', label: 'CSAT', fmt: (v) => `${Math.round(v * 100)}%` };
  if (outs.contentQuality) return { key: 'contentQuality', label: 'content quality', fmt: (v) => `${Math.round(v)}/100` };
  if (outs.designQuality) return { key: 'designQuality', label: 'design quality', fmt: (v) => `${Math.round(v)}/100` };
  if (outs.velocityMult) return { key: 'velocityMult', label: 'output vs a median engineer', fmt: (v) => `${v.toFixed(2)}×` };
  if (outs.churnMult) return { key: 'churnMult', label: 'churn on their accounts', fmt: (v) => `${v.toFixed(2)}×` };
  if (outs.technicalWinMult) return { key: 'technicalWinMult', label: 'technical-win effect', fmt: (v) => `${v.toFixed(2)}×` };
  if (outs.expansionMult) return { key: 'expansionMult', label: 'expansion they open', fmt: (v) => `${v.toFixed(2)}×` };
  if (outs.founderHoursSavedPerWeek) return { key: 'founderHoursSavedPerWeek', label: 'founder hours saved/week', fmt: (v) => `${v.toFixed(1)}h` };
  return { key: null, label: pd?.metric ?? 'output', fmt: (v) => String(v) };
}

// Monthly noisy read of true performance (z = role composite). Noise is large early and during ramp.
export function monthlyRead(state, m) {
  if (!m.traits || m.kind === 'ai_agent' || m.status !== 'active') return null;
  const months = (state.day - m.startDay) / 30.4;
  if (months < 0.9) return null;
  const rampMonths = (m.rampWeeks ?? 8) / 4.33;
  const sd = (months < rampMonths ? 1.6 : 1.0); // ramp masks performance (AEs especially)
  const truth = m.fraud === 'stand_in' ? -2 : roleComposite(jobRoleOf(m), m.traits);
  const obs = round2(truth + gaussian(state) * sd);
  m.perf ??= { reads: [] };
  m.perf.reads.push({ day: state.day, obs, sd });
  // Posterior with a N(0,1) prior.
  let num = 0, prec = 1;
  for (const r of m.perf.reads) { num += r.obs / (r.sd * r.sd); prec += 1 / (r.sd * r.sd); }
  m.perf.estimate = round2(num / prec);
  m.perf.sd = round2(1 / Math.sqrt(prec));
  const metric = headlineMetric(m);
  if (metric.key) {
    const v = outputFor(m, metric.key);
    m.perf.metric = { label: metric.label, value: metric.fmt(Math.max(0, v * (1 + gaussian(state) * 0.15 * sd))) };
  }
  return m.perf;
}

export function perfLabel(m) {
  const p = m.perf;
  if (!p?.reads?.length) return { text: 'too early to tell', tone: '' };
  const conf = p.sd < 0.45 ? 'fairly sure' : p.sd < 0.65 ? 'early read' : 'very early';
  if (p.estimate > 0.45) return { text: `strong (${conf})`, tone: 'good' };
  if (p.estimate < -0.45) return { text: `concerning (${conf})`, tone: 'bad' };
  return { text: `solid (${conf})`, tone: '' };
}

// Incidents from very low integrity, and discovery of stand-in fraud. Called monthly.
export function monthlyIncidents(state, m) {
  if (!m.traits || m.status !== 'active') return;
  if (m.fraud === 'stand_in' && !m.fraudFound && state.day - m.startDay >= 14 && chance(state, 0.6)) {
    m.fraudFound = true;
    notify(state, `${m.name} isn't the person you interviewed: the work, the voice on calls and the GitHub history don't match. Identity fraud in remote hiring (Gartner: 6% admit it). Let them go and tighten identity checks.`, { type: 'bad', app: 'people' });
  }
  if (z(m.traits.integrity) < -1.2 && chance(state, 0.03)) {
    const what = { ae: 'inflated pipeline in the CRM to hit commit', sdr: 'logged meetings that never happened', support: 'promised a refund outside policy and hid it', engineer: 'shipped untested code and marked it reviewed' }[m.role] ?? 'cut a corner and covered it up';
    notify(state, `Integrity incident: ${m.name} ${what}.`, { type: 'bad', app: 'people' });
    m.incidents = (m.incidents ?? 0) + 1;
    m.morale = clamp((m.morale ?? 70) - 5, 0, 100);
  }
}

// Performance improvement plan: 6 weeks, ~2 founder hours/week; outcome from hidden traits [design].
export function startPip(state, m) {
  if (m.pip?.status === 'active') throw new Error('Already on a plan.');
  m.pip = { startDay: state.day, endDay: state.day + 42, status: 'active' };
}
export function resolvePip(state, m) {
  if (m.pip?.status !== 'active' || state.day < m.pip.endDay) return null;
  const ok = !m.fraud && roleComposite(jobRoleOf(m), m.traits ?? {}) > -0.7 && z(m.traits?.coachability ?? 50) > -0.3;
  m.pip.status = ok ? 'met' : 'not_met';
  if (ok) m.productivity = round2((m.productivity ?? 1) * 1.1);
  notify(state, ok ? `${m.name} met their improvement plan (${fmtDate(state, m.pip.endDay)}). Output is up.` : `${m.name} did not meet their improvement plan. Most founders wait 1–3 months too long here.`, { type: ok ? 'good' : 'bad', app: 'people' });
  return m.pip.status;
}
