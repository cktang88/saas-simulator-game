// Time off and absence. Each employee plans vacation per the PTO policy (the founder approves or denies), takes random sick
// days (about 3 a year typical, heavy-tailed: the occasional multi-week medical or burnout leave), and parental leave and
// bereavement happen. Output drops while someone is away (capacity.js reads presenceFactor); on a tiny team the only support
// person or the only engineer being out is a coverage gap.
//
// Denying vacations repeatedly burns people out (morale, quits, a burnout leave). Unlimited PTO does not make people take more
// days (Namely: ~12 vs ~11; the model keeps unlimited at about 11.5 days a year). EOR hires get their country's statutory leave.
// Numbers: ABS in ops-data.js; research docs/research/ops-2026/benefits-time-off.md.
//
// Mistakes (functionId people_ops): denied_vacation_burnout, single_point_of_failure.
// Randomness: per-member, per-day streams (streamFor), never the main rng.

import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { addRecurring } from '../../core/bank.js';
import { setModifier } from '../../core/market.js';
import { clamp, round2, isWeekend, dateOf, fmtDate, rng, gaussian, uid } from '../../core/util.js';
import { streamFor } from './global.js';
import { ABS, EOR_LEAVE } from './ops-data.js';
import { ensureOps, emitOps, humansOf } from './ops-state.js';
import { benefitsOf, annualDays, ptoApplies } from './benefits.js';

// ---------------------------------------------------------------------------
// US holidays (observed count comes from the PTO policy: BLS average is 8 paid holidays)
// ---------------------------------------------------------------------------
const HOLIDAY_ORDER = ['newyear', 'memorial', 'july4', 'labor', 'thanksgiving', 'christmas', 'mlk', 'juneteenth', 'presidents', 'blackfriday', 'columbus', 'veterans', 'christmaseve'];
const nth = (y, mo, wd, n) => { // nth weekday (0=Sun) of month; n = -1 for last
  if (n > 0) { const first = new Date(Date.UTC(y, mo, 1)).getUTCDay(); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; }
  const last = new Date(Date.UTC(y, mo + 1, 0)); return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7);
};
const holidayDate = (y, id) => ({
  newyear: [0, 1], mlk: [0, nth(y, 0, 1, 3)], presidents: [1, nth(y, 1, 1, 3)], memorial: [4, nth(y, 4, 1, -1)], juneteenth: [5, 19], july4: [6, 4],
  labor: [8, nth(y, 8, 1, 1)], columbus: [9, nth(y, 9, 1, 2)], veterans: [10, 11], thanksgiving: [10, nth(y, 10, 4, 4)], blackfriday: [10, nth(y, 10, 4, 4) + 1],
  christmaseve: [11, 24], christmas: [11, 25],
})[id];

/** Is `day` a company holiday under the policy (observed on the weekday itself; weekend holidays are not shifted [design])? */
export function isCompanyHoliday(state, day = state.day) {
  const d = dateOf(state, day);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth(), dd = d.getUTCDate();
  const n = benefitsOf(state).pto.holidays ?? 8;
  return HOLIDAY_ORDER.slice(0, n).some((id) => { const h = holidayDate(y, id); return h[0] === mo && h[1] === dd; });
}

// ---------------------------------------------------------------------------
// Per-member state: m.abs = { bal (days), taken, takenYear, denied: [days], sickProne, yearStart }
// ---------------------------------------------------------------------------
export function ensureAbs(state, m) {
  if (!m.abs) {
    const S = streamFor(state, `abs|prone|${m.id}`);
    const g = gaussian(S);
    m.abs = { bal: 0, taken: 0, takenYear: 0, denied: [], sickProne: round2(clamp(Math.exp(0.35 * g), 0.5, 2.2)), yearStart: state.day, sickDays: 0, sickYear: 0 };
  }
  return m.abs;
}

const eligible = (m) => ptoApplies(m) && m.status === 'active';
const records = (state) => ensureOps(state).absences;

/** The absence (if any) that has this person away on `day` (approved vacation or an active episode). */
export function awayRecord(state, m, day = state.day) {
  for (const a of records(state)) if (a.memberId === m.id && (a.status === 'approved' || a.status === 'active') && day >= a.start && day <= a.end) return a;
  return null;
}
export const isAway = (state, m, day = state.day) => Boolean(awayRecord(state, m, day));

/** Calendar days of unpaid leave inside [start, end] for payroll. */
export function unpaidDays(state, m, start, end) {
  let n = 0;
  for (const a of records(state)) {
    if (a.memberId !== m.id || a.unpaidFrom == null || !['approved', 'active', 'done'].includes(a.status)) continue;
    const s = Math.max(a.unpaidFrom, start), e = Math.min(a.end, end);
    if (e >= s) n += e - s + 1;
  }
  return n;
}

// Coverage mitigation for a role with one person: runbooks and an on-call contractor keep part of the work moving.
export function coverageMitigation(state) {
  const c = ensureOps(state).coverage;
  return Math.min(0.7, (c.runbooks ? 0.3 : 0) + (c.onCall ? 0.5 : 0));
}

/**
 * Share of a person's output present today: 0 when away or on a company holiday, otherwise 1. A role with a single person gets
 * partial cover when runbooks or an on-call contractor exist.
 */
export function presenceFactor(state, m) {
  if (!m.abs && !state.apps.people?.ops?.absences?.length && !state.apps.people?.ops?.benefits?.configured) return 1;
  if (m.kind === 'ai_agent' || m.engagement === 'contractor') return awayRecord(state, m) ? 0 : 1;
  const holiday = m.region === 'us' && !isWeekend(state) && state.apps.people?.ops?.benefits?.configured && isCompanyHoliday(state);
  if (holiday) return 0;
  if (!awayRecord(state, m)) return 1;
  const others = humansOf(state.apps.people).filter((x) => x.id !== m.id && x.status === 'active' && x.role === m.role).length;
  return others === 0 ? coverageMitigation(state) : 0;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
const reqOf = (state, id) => {
  const r = records(state).find((x) => x.id === id);
  if (!r || r.kind !== 'vacation') throw new Error('No such request.');
  return r;
};

export function approveRequest(state, id) {
  const r = reqOf(state, id);
  if (r.status !== 'pending') throw new Error('Already answered.');
  r.status = 'approved';
  r.answeredDay = state.day;
  const m = state.apps.people.members.find((x) => x.id === r.memberId);
  if (m) { ensureAbs(state, m); m.abs.bal = round2(Math.max(0, m.abs.bal - r.days * (benefitsOf(state).pto.mode === 'accrued' && m.region === 'us' ? 1 : 0))); }
  return r;
}

/** Deny a request. `alt: true` means you offered other dates, which softens the hit. */
export function denyRequest(state, id, { alt = false } = {}) {
  const r = reqOf(state, id);
  if (r.status !== 'pending') throw new Error('Already answered.');
  r.status = 'denied';
  r.answeredDay = state.day;
  const m = state.apps.people.members.find((x) => x.id === r.memberId);
  if (!m) return r;
  const a = ensureAbs(state, m);
  a.denied.push({ day: state.day, days: r.days, alt });
  a.denied = a.denied.filter((x) => state.day - x.day <= ABS.denied.windowDays);
  m.morale = clamp((m.morale ?? 70) - (alt ? ABS.denied.altHit : ABS.denied.moraleHit), 0, 100);
  const strikes = a.denied.filter((x) => !x.alt).length;
  m.ops = { ...(m.ops ?? {}) };
  if (strikes >= ABS.denied.attrAfter) m.ops.deniedAttr = ABS.denied.attrMult ** Math.min(3, strikes - ABS.denied.attrAfter + 1);
  if (strikes >= ABS.denied.burnoutAfter && !a.burnoutLogged) {
    a.burnoutLogged = true;
    const S = streamFor(state, `abs|burn|${m.id}|${state.day}`);
    const monthly = (m.salary ?? (m.hourlyRate ?? 40) * 2080) / 12;
    logMistake(state, { functionId: 'people_ops', id: 'denied_vacation_burnout', label: 'Repeated vacation denials burned someone out', app: 'people', key: `denied:${m.id}`, delayed: true, cost: { usd: round2(monthly * 0.5), hours: 4 }, detail: `${m.name} has had ${strikes} requests denied in ${ABS.denied.windowDays / 30} months. Morale and loyalty are down, quit risk is up ×${m.ops.deniedAttr}, and burnout leave is likely. If coverage is the worry, approve with a handoff or offer dates; "no" three times is how you lose people.` });
    if (rng(S) < 0.4) startEpisode(state, m, 'mental', Math.round(10 + rng(S) * 15));
  }
  return r;
}

export function setCoverage(state, { runbooks, onCall }) {
  const o = ensureOps(state);
  const c = o.coverage;
  if (runbooks != null) c.runbooks = Boolean(runbooks);
  if (onCall != null) {
    c.onCall = Boolean(onCall);
    let r = state.recurring.find((x) => x.id === o.rec.oncall);
    if (!r && c.onCall) { r = addRecurring(state, { vendor: 'On-call contractor retainer', amount: ABS.remedy.onCallMonthly, category: 'contractors', dayOfMonth: 5, note: 'On-call cover for single-person roles' }); o.rec.oncall = r.id; }
    if (r) r.active = c.onCall;
  }
  return c;
}

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------
function nextWorkday(state, d) { let x = d; while (isWeekend(state, x)) x += 1; return x; }

function startEpisode(state, m, kind, workdays, extra = {}) {
  const start = state.day;
  // spread the working days over the calendar (weekends in between)
  let end = start, left = Math.max(1, workdays) - (isWeekend(state, start) ? 0 : 1);
  while (left > 0) { end += 1; if (!isWeekend(state, end)) left -= 1; }
  const a = ensureAbs(state, m);
  const rec = { id: uid('abs'), memberId: m.id, kind, start, end, days: workdays, status: 'active', planned: false, label: ABS[kind]?.label ?? kind, ...extra };
  if (kind === 'medical' || kind === 'mental') rec.unpaidFrom = start + Math.ceil(ABS.paidSickDays * 7 / 5);
  if (kind === 'cold' || kind === 'flu') { a.sickDays += workdays; a.sickYear += workdays; }
  records(state).push(rec);
  if (['cold', 'flu', 'medical', 'mental'].includes(kind)) emitOps(state, 'employee_out_sick', rec.id, { memberId: m.id, name: m.name, kind, days: workdays, label: `${m.name} is out (${(ABS[kind]?.label ?? kind).toLowerCase()}, ~${workdays} working days)` });
  if (kind === 'medical' || kind === 'parental' || kind === 'mental' || workdays >= 5) notify(state, `${m.name} is out for ~${kind === 'parental' ? Math.round(workdays / 5) + ' weeks' : workdays + ' working days'} (${(ABS[kind]?.label ?? kind).toLowerCase()}).`, { type: 'info', app: 'people' });
  return rec;
}

const inRange = (S, [lo, hi]) => Math.round(lo + rng(S) * (hi - lo));
function drawLen(S) { const u = rng(S); const [, lo, hi] = ABS.vacation.lens.find(([p]) => u < p); return inRange(S, [lo, hi]); }

/** Target vacation days a person takes in a year under the policy and their country. */
export function targetDays(state, m, b = benefitsOf(state)) {
  const a = annualDays(state, m, b);
  if (a === Infinity) return ABS.vacation.unlimitedDays; // unlimited does not lift days taken
  return a * ABS.vacation.usage;
}

// ---------------------------------------------------------------------------
// Daily
// ---------------------------------------------------------------------------
export function absenceDay(state, p) {
  const o = ensureOps(state);
  const b = benefitsOf(state);
  const wk = !isWeekend(state);
  for (const m of p.members) {
    if (!ptoApplies(m)) continue;
    if (m.status !== 'active') continue;
    const a = ensureAbs(state, m);
    // accrual (US employees, accrued policy), capped at 1.5x a year
    if (m.region === 'us' && b.pto.mode === 'accrued') a.bal = round2(Math.min(b.pto.daysPerYear * b.pto.capMult, a.bal + b.pto.daysPerYear / 365));
    if (state.day - a.yearStart >= 365) { a.yearStart = state.day; a.takenYear = 0; a.sickYear = 0; }
    if (!wk || m.leavingDay != null) continue;
    if (state.day - m.startDay < 1) continue;
    // already away: nothing new starts (counted taken days below)
    if (awayRecord(state, m)) { const r = awayRecord(state, m); if (r.kind === 'vacation') { a.taken += 1; a.takenYear += 1; } continue; }
    const S = streamFor(state, `abs|day|${m.id}|${state.day}`);
    const prone = a.sickProne;
    const lowMorale = (m.morale ?? 70) < 40 ? ABS.mental.lowMoraleMult : 1;
    // unplanned episodes, drawn once per working day
    const rates = [['cold', ABS.cold.perYear * prone], ['flu', ABS.flu.perYear * prone], ['medical', ABS.medical.perYear], ['mental', ABS.mental.perYear * lowMorale], ['parental', ABS.parental.perYear], ['bereavement', ABS.bereavement.perYear]];
    let started = false;
    for (const [kind, perYear] of rates) {
      if (rng(S) < perYear / 250) {
        const len = kind === 'parental' ? inRange(S, ABS.parental.weeks) * 5 : inRange(S, ABS[kind].days);
        const rec = startEpisode(state, m, kind, len);
        if (kind === 'parental') {
          const stat = m.region !== 'us' ? EOR_LEAVE[m.region]?.parentalWeeks ?? 12 : 0;
          const paidWeeks = Math.max(b.pto.parentalPaidWeeks ?? 0, stat);
          rec.unpaidFrom = rec.start + paidWeeks * 7;
        }
        started = true;
        break;
      }
    }
    if (started) continue;
    // new vacation request: trips per year = target days / average length
    if (b.pto.mode !== 'statutory' || m.region !== 'us') {
      const t = targetDays(state, m, b);
      const trips = t / ABS.vacation.avgLen;
      const has = o.absences.filter((r) => r.memberId === m.id && r.kind === 'vacation' && (r.status === 'pending' || (r.status === 'approved' && r.end >= state.day))).length;
      if (has < 2 && rng(S) < trips / 250) {
        let days = drawLen(S);
        if (b.pto.mode === 'accrued' && m.region === 'us') days = Math.min(days, Math.floor(a.bal));
        if (days >= 1) {
          const start = nextWorkday(state, state.day + inRange(S, ABS.vacation.leadDays));
          let end = start, left = days - 1;
          while (left > 0) { end += 1; if (!isWeekend(state, end)) left -= 1; }
          const r = { id: uid('abs'), memberId: m.id, kind: 'vacation', start, end, days, status: 'pending', planned: true, requestedDay: state.day, label: 'Vacation' };
          o.absences.push(r);
          emitOps(state, 'pto_requested', r.id, { memberId: m.id, name: m.name, requestId: r.id, days, startDay: start, label: `${m.name} asked for ${days} day${days > 1 ? 's' : ''} off from ${fmtDate(state, start)}` });
        }
      }
    }
  }
  // Silence is an answer: requests unanswered for 7 days go through and the person notices.
  for (const r of o.absences) {
    if (r.kind === 'vacation' && r.status === 'pending' && (state.day - r.requestedDay >= ABS.vacation.autoApproveAfter || state.day >= r.start - 2)) {
      approveRequest(state, r.id);
      r.auto = true;
      const m = p.members.find((x) => x.id === r.memberId);
      if (m) m.morale = clamp((m.morale ?? 70) - 1, 0, 100);
    }
    if (r.status === 'approved' && state.day > r.end) r.status = 'done';
    if (r.status === 'active' && state.day > r.end) r.status = 'done';
  }
  if (o.absences.length > 400) o.absences = o.absences.filter((r) => r.status === 'pending' || r.end >= state.day - 400);
  coverageDay(state, p);
}

// ---------------------------------------------------------------------------
// Coverage gaps
// ---------------------------------------------------------------------------
export function roleCoverage(state, p = state.apps.people) {
  const out = [];
  for (const role of ['support', 'engineer']) {
    const team = humansOf(p).filter((m) => m.status === 'active' && m.role === role && state.day >= m.startDay && m.engagement !== 'cofounder');
    if (!team.length) continue;
    const away = team.filter((m) => awayRecord(state, m)).length;
    out.push({ role, total: team.length, away, down: away === team.length, single: team.length === 1 });
  }
  return out;
}

function coverageDay(state, p) {
  if (isWeekend(state)) return;
  const mit = coverageMitigation(state);
  const ai = p.members.some((m) => m.agentType === 'support_ai' && m.status === 'active' && state.day >= (m.readyDay ?? 0));
  let supportDown = false;
  for (const c of roleCoverage(state, p)) {
    if (!c.down) continue;
    const who = humansOf(p).find((m) => m.status === 'active' && m.role === c.role && awayRecord(state, m));
    const rec = who ? awayRecord(state, who) : null;
    if (c.role === 'support' && !ai) {
      supportDown = true;
      const weekly = p.support?.lastWeek?.total ?? 20;
      p.support.backlog = round2((p.support.backlog ?? 0) + (weekly / 5) * (1 - mit));
    }
    if (c.single && rec && state.day - rec.start >= 2 && (rec.kind !== 'vacation' || rec.days >= 3)) {
      if (mit >= 0.5) continue;
      const days = rec.days;
      const usd = c.role === 'support' ? 400 * Math.min(days, 10) : 250 * Math.min(days, 10);
      logMistake(state, { functionId: 'people_ops', id: 'single_point_of_failure', label: `Your only ${c.role === 'support' ? 'support person' : 'engineer'} was out with no cover`, app: 'people', key: `spof:${rec.id}`, delayed: true, cost: { usd, days: Math.min(days, 14), hours: 3 }, detail: `${who.name} was out for ${days} working days (${rec.label.toLowerCase()}) and nobody else does that job. ${c.role === 'support' ? 'The queue backed up and customers waited.' : 'Shipping stopped.'} Two cheap fixes: document the work (runbooks) and keep an on-call contractor you can call in.` });
    }
  }
  setModifier(state, 'churn', 'support-coverage', supportDown ? 1.04 : 1);
}

// ---------------------------------------------------------------------------
// Stats for the UI and tests
// ---------------------------------------------------------------------------
export function outNow(state, p = state.apps.people, day = state.day) {
  return humansOf(p).filter((m) => m.status === 'active').map((m) => ({ m, rec: awayRecord(state, m, day) })).filter((x) => x.rec);
}
export const pendingRequests = (state) => records(state).filter((r) => r.kind === 'vacation' && r.status === 'pending');
export const upcoming = (state, days = 21) => records(state).filter((r) => r.status === 'approved' && r.start >= state.day && r.start <= state.day + days).sort((a, b) => a.start - b.start);
