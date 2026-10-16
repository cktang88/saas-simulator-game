// Founder calendar. Every meeting any app schedules lives here. On the meeting's day its time is
// charged to the founder's weekly hours (meetings come before other work); if the week is already
// spent, the meeting is missed. Many meetings in one day without a focus block cost extra hours
// (context switching). Owning apps run the meeting itself (live chat etc.) when the player clicks
// "Join" — they must NOT charge hours again for calendar events.

import { uid, isWeekend, dayOfWeek, fmtDate } from './util.js';
import { notify, hoursLeft, OutOfHoursError, addDayHours } from './state.js';

export const DEFAULT_WORK = { start: 9 * 60, end: 18 * 60 };
export const CONTEXT_SWITCH = { meetingsThreshold: 3, hoursLost: 1 }; // [design] cost of a fragmented day

export function ensureCalendar(state) {
  state.calendar ??= { events: [], workHours: { ...DEFAULT_WORK }, bookingLink: false };
  return state.calendar;
}

const overlaps = (a, b) => a.day === b.day && a.start < b.start + b.duration && b.start < a.start + a.duration;
// Flexible focus blocks (placed by an AI scheduler, Reclaim/Motion style) yield to meetings: they are not "busy"
// for conflicts and move elsewhere when a meeting lands on them. Fixed blocks (placed by hand) defend the time.
const busy = (e) => ['scheduled', 'in_progress'].includes(e.status) && e.kind !== 'deadline' && !(e.kind === 'focus' && e.flexible);

export function eventsOn(state, day) {
  return ensureCalendar(state).events.filter((e) => e.day === day && e.status !== 'canceled').sort((a, b) => a.start - b.start);
}

export function conflicts(state, ev) {
  return ensureCalendar(state).events.filter((e) => e.id !== ev.id && busy(e) && overlaps(e, ev));
}

/**
 * scheduleEvent(state, { title, kind, app, refId, with, day, start, duration, location, notes, allowConflict })
 * kind: 'meeting' | 'call' | 'interview' | 'pitch' | 'focus' | 'personal' | 'deadline'
 * start: minutes after midnight (local); duration: minutes. Throws on conflict unless allowConflict.
 */
export function scheduleEvent(state, ev) {
  const cal = ensureCalendar(state);
  const e = {
    id: uid('ev'),
    title: ev.title,
    kind: ev.kind ?? 'meeting',
    app: ev.app ?? null,
    refId: ev.refId ?? null,
    with: ev.with ?? null,
    day: ev.day,
    start: ev.start ?? cal.workHours.start,
    duration: ev.duration ?? 30,
    location: ev.location ?? (ev.kind === 'focus' ? '' : 'Video call'),
    notes: ev.notes ?? '',
    status: 'scheduled',
    charged: false,
    createdDay: state.day,
    ...(ev.kind === 'focus' && ev.flexible ? { flexible: true, moves: 0 } : {}),
    ...(ev.priorityId ? { priorityId: ev.priorityId } : {}),
  };
  if (e.day < state.day) throw new Error('That date is in the past.');
  if (!ev.allowConflict && e.kind !== 'deadline') {
    const c = conflicts(state, e);
    if (c.length) throw new Error(`Conflicts with "${c[0].title}" on ${fmtDate(state, e.day)}.`);
  }
  if (e.day === state.day) chargeNow(state, e);
  cal.events.push(e);
  if (e.kind !== 'focus' && e.kind !== 'deadline') protectFocus(state, e);
  return e;
}

// Today's meetings were charged when the day started; one booked or moved onto today afterwards is charged when it
// lands, so it can't be free. Refuses (instead of booking a meeting that would be missed) when the week is overbooked.
const chargeable = (e) => !e.charged && !['focus', 'personal', 'deadline'].includes(e.kind) && e.status === 'scheduled';
function chargeNow(state, e) {
  if (!chargeable(e)) return;
  const hours = e.duration / 60;
  const left = state.founder.hoursPerWeek - state.founder.hoursUsed + MEETING_OVERTIME;
  if (left + 1e-9 < hours) throw new OutOfHoursError(hours, Math.max(0, left), `That meeting takes ${hours}h today but you are already far over this week's hours. Pick another day.`);
  chargeMeeting(state, e);
}

function chargeMeeting(state, e) {
  const hours = e.duration / 60;
  if (hoursLeft(state) + 1e-9 < hours) notify(state, `"${e.title}" pushed you past your planned hours this week (overtime).`, { type: 'warn', app: e.app });
  state.founder.hoursUsed += hours;
  addDayHours(state, hours);
  state.founder.timeLog ??= [];
  state.founder.timeLog.push({ day: state.day, hours, label: `Meetings (${e.kind ?? 'calendar'})`, app: e.app ?? null });
  e.charged = true;
}

function uncharge(state, e) {
  const hours = e.duration / 60;
  const label = `Meetings (${e.kind ?? 'calendar'})`;
  const log = state.founder.timeLog ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const x = log[i];
    if (x.day === state.day && x.label === label && Math.abs(x.hours - hours) < 1e-9 && (x.app ?? null) === (e.app ?? null)) { log.splice(i, 1); break; }
  }
  state.founder.hoursUsed = Math.max(0, state.founder.hoursUsed - hours);
  addDayHours(state, -hours);
  e.charged = false;
}

// A meeting that lands on focus time: a flexible block moves (or is dropped if the week is full); a fixed block
// that a meeting was forced onto (allowConflict) is broken and loses its deep-work benefit.
function protectFocus(state, meeting) {
  const cal = ensureCalendar(state);
  for (const f of cal.events) {
    if (f.kind !== 'focus' || f.status !== 'scheduled' || f.id === meeting.id || !overlaps(f, meeting)) continue;
    if (!f.flexible) {
      if (!f.broken) { f.broken = true; (cal.focusBroken ??= []).push({ id: uid('fb'), eventId: f.id, day: f.day, by: meeting.title }); }
      continue;
    }
    const weekEnd = f.day + 7 - ((dayOfWeek(state, f.day) + 6) % 7); // same week only
    const slot = focusSlot(state, { fromDay: Math.max(state.day, f.day), toDay: weekEnd, duration: f.duration, ignoreId: f.id });
    f.moves = (f.moves ?? 0) + 1;
    if (slot) { f.day = slot.day; f.start = slot.start; }
    else { f.status = 'canceled'; f.cancelReason = 'displaced'; }
    (cal.focusMoves ??= []).push({ day: state.day, eventId: f.id, dropped: !slot });
    if (cal.focusMoves.length > 300) cal.focusMoves.splice(0, 100);
  }
}

/** First free slot for a focus block (treats every other block, flexible or not, as busy). */
export function focusSlot(state, { fromDay = state.day, toDay = fromDay + 7, duration = 120, ignoreId = null, earliest = null } = {}) {
  const cal = ensureCalendar(state);
  for (let d = fromDay; d < toDay; d++) {
    if (isWeekend(state, d)) continue;
    for (let t = earliest ?? cal.workHours.start; t + duration <= cal.workHours.end; t += 30) {
      const probe = { day: d, start: t, duration };
      if (!cal.events.some((e) => e.id !== ignoreId && ['scheduled', 'in_progress'].includes(e.status) && e.kind !== 'deadline' && overlaps(e, probe))) return { day: d, start: t };
    }
  }
  return null;
}

// ---- Deep work (operator-tiers audit fix 14) ----
// Hours of build or writing work done inside today's focus block count for more; a long block counts more than a
// short one (Graham 2009: hour blocks barely let you start); work on a fragmented day (3+ meetings, no focus
// block) counts for less. All multipliers are [design] game estimates (o5 s4: no measured benchmark exists).
export const DEEP_WORK = { longBlockMin: 120, longMult: 1.25, midBlockMin: 90, midMult: 1.15, shortMult: 1.05, fragmentedMult: 0.85 };

export function isFragmentedDay(state, day = state.day) {
  const evs = ensureCalendar(state).events.filter((e) => e.day === day && !['canceled'].includes(e.status));
  const meetings = evs.filter((e) => !['focus', 'personal', 'deadline'].includes(e.kind) && e.status !== 'missed').length;
  const focus = evs.some((e) => e.kind === 'focus' && !e.broken);
  return meetings >= CONTEXT_SWITCH.meetingsThreshold && !focus;
}

/**
 * deepWork(state, hours, { kind: 'build'|'writing', commit })
 * → { mult, effective, focusHours } where `effective` is hours × the weighted multiplier.
 * Consumes today's unbroken focus-block capacity (each block holds its duration of deep work), so a 2h block
 * boosts at most 2h of work. Build work: product output × mult. Writing work: charge hours / mult (finish sooner).
 * commit:false previews without consuming.
 */
export function deepWork(state, hours, { kind = 'build', commit = true } = {}) {
  const cal = ensureCalendar(state);
  const h = Math.max(0, Number(hours) || 0);
  if (!h) return { mult: 1, effective: 0, focusHours: 0 };
  const blocks = cal.events.filter((e) => e.day === state.day && e.kind === 'focus' && !e.broken && ['scheduled', 'done'].includes(e.status))
    .sort((a, b) => b.duration - a.duration);
  let left = h, eff = 0, focusHours = 0;
  for (const b of blocks) {
    const cap = Math.max(0, b.duration / 60 - (b.usedHours ?? 0));
    const take = Math.min(left, cap);
    if (take <= 0) continue;
    // A block an AI scheduler moved twice or more this week is thrash: you never settle into it (d12 §6).
    const m = (b.moves ?? 0) >= 2 ? DEEP_WORK.shortMult : b.duration >= DEEP_WORK.longBlockMin ? DEEP_WORK.longMult : b.duration >= DEEP_WORK.midBlockMin ? DEEP_WORK.midMult : DEEP_WORK.shortMult;
    eff += take * m;
    focusHours += take;
    left -= take;
    if (commit) b.usedHours = (b.usedHours ?? 0) + take;
    if (left <= 1e-9) break;
  }
  eff += left * (isFragmentedDay(state) ? DEEP_WORK.fragmentedMult : 1);
  if (commit) {
    (cal.deepWork ??= []).push({ day: state.day, hours: Math.round(h * 100) / 100, focusHours: Math.round(focusHours * 100) / 100, kind });
    if (cal.deepWork.length > 600) cal.deepWork.splice(0, 200);
  }
  return { mult: eff / h, effective: eff, focusHours };
}

/** Hours to charge for a writing task given today's focus blocks (finishing sooner inside a long block). */
export function writingHours(state, hours, { commit = true } = {}) {
  const r = deepWork(state, hours, { kind: 'writing', commit });
  return Math.round((hours / Math.max(0.5, r.mult)) * 100) / 100;
}

/** Deep-work hours actually done inside focus blocks, by week (Monday start), for the last n weeks. */
export function focusHoursByWeek(state, weeks = 4) {
  const cal = ensureCalendar(state);
  const monday = state.day - ((dayOfWeek(state) + 6) % 7);
  return Array.from({ length: weeks }, (_, i) => {
    const from = monday - 7 * (i + 1), to = from + 7;
    return (cal.deepWork ?? []).filter((x) => x.day >= from && x.day < to).reduce((a, x) => a + x.focusHours, 0);
  });
}

export function cancelEvent(state, id, reason = 'canceled') {
  const e = ensureCalendar(state).events.find((x) => x.id === id);
  if (e && e.status === 'scheduled') { e.status = 'canceled'; e.cancelReason = reason; }
  return e;
}

export function moveEvent(state, id, day, start) {
  const e = ensureCalendar(state).events.find((x) => x.id === id);
  if (!e) return null;
  const moved = { ...e, day, start };
  const c = conflicts(state, moved);
  if (c.length) throw new Error(`Conflicts with "${c[0].title}".`);
  if (day < state.day) throw new Error('That date is in the past.');
  if (day === state.day && e.day !== state.day) chargeNow(state, e);
  // A meeting charged this morning and moved off today: give today's hours back and charge it on its new day
  // (otherwise it stays `charged` and the new day's meeting is free).
  if (e.charged && e.day === state.day && day !== state.day && !['focus', 'personal', 'deadline'].includes(e.kind)) uncharge(state, e);
  e.day = day;
  e.start = start;
  e.rescheduled = (e.rescheduled ?? 0) + 1;
  if (e.kind !== 'focus' && e.kind !== 'deadline') protectFocus(state, e);
  return e;
}

// Owning app marks a meeting as held/no-show/etc.
export function completeEvent(state, id, status = 'done', outcome = null) {
  const e = ensureCalendar(state).events.find((x) => x.id === id);
  if (e) { e.status = status; e.outcome = outcome; }
  return e;
}

// Free slots of `duration` minutes on business days from `fromDay`, inside work hours.
export function findSlots(state, { fromDay = state.day + 1, duration = 30, count = 5, step = 30, earliest = null } = {}) {
  const cal = ensureCalendar(state);
  const out = [];
  for (let d = fromDay; d < fromDay + 30 && out.length < count; d++) {
    if (isWeekend(state, d)) continue;
    for (let t = earliest ?? cal.workHours.start; t + duration <= cal.workHours.end && out.length < count; t += step) {
      const probe = { id: '_', day: d, start: t, duration };
      if (!conflicts(state, probe).length) { out.push({ day: d, start: t }); break; } // one slot per day keeps choices spread out
    }
  }
  return out;
}

export const fmtTime = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${ap}`;
};

const MEETING_OVERTIME = 8; // hours/week a founder will stretch for booked meetings [design]

// Runs every day from the clock: charge today's meetings, flag missed/unattended ones.
export function calendarDay(state) {
  const cal = ensureCalendar(state);
  const today = cal.events.filter((e) => e.day === state.day && e.status === 'scheduled' && e.kind !== 'deadline');
  const meetings = today.filter((e) => e.kind !== 'focus' && e.kind !== 'personal');
  for (const e of today) {
    if (e.charged || e.kind === 'personal') continue;
    const hours = e.duration / 60;
    if (e.kind === 'focus') { e.charged = true; continue; } // focus blocks are planning; the work itself costs hours
    // A booked meeting is a commitment: founders attend it even past their planned week, working overtime
    // (which counts toward energy drain). Only a badly overbooked week (beyond MEETING_OVERTIME) misses calls.
    if (state.founder.hoursPerWeek - state.founder.hoursUsed + MEETING_OVERTIME + 1e-9 < hours) {
      e.status = 'missed';
      notify(state, `You were far over your hours this week and missed "${e.title}". Overbooking costs relationships.`, { type: 'bad', app: e.app });
      continue;
    }
    chargeMeeting(state, e);
  }
  const hasFocus = today.some((e) => e.kind === 'focus' && !e.broken); // a focus block meetings were forced onto protects nothing (as isFragmentedDay)
  if (meetings.length >= CONTEXT_SWITCH.meetingsThreshold && !hasFocus) {
    state.founder.hoursUsed += CONTEXT_SWITCH.hoursLost;
    addDayHours(state, CONTEXT_SWITCH.hoursLost);
    state.founder.timeLog ??= [];
    state.founder.timeLog.push({ day: state.day, hours: CONTEXT_SWITCH.hoursLost, label: 'Context switching (fragmented day)' });
  }
  // Yesterday's meetings nobody joined become 'unattended'; owning apps decide what that means.
  for (const e of cal.events) {
    if (e.day < state.day && e.status === 'scheduled' && e.kind !== 'deadline' && e.kind !== 'focus' && e.kind !== 'personal') e.status = 'unattended';
    if (e.day < state.day && e.status === 'scheduled' && (e.kind === 'focus' || e.kind === 'personal')) e.status = 'done';
  }
  if (cal.events.length > 1500) cal.events = cal.events.filter((e) => e.day >= state.day - 120 || e.status === 'scheduled');
}

export const weekdayName = (state, day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek(state, day)];
