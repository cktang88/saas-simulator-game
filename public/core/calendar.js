// Founder calendar. Every meeting any app schedules lives here. On the meeting's day its time is
// charged to the founder's weekly hours (meetings come before other work); if the week is already
// spent, the meeting is missed. Many meetings in one day without a focus block cost extra hours
// (context switching). Owning apps run the meeting itself (live chat etc.) when the player clicks
// "Join" — they must NOT charge hours again for calendar events.

import { uid, isWeekend, dayOfWeek, fmtDate } from './util.js';
import { notify, hoursLeft } from './state.js';

export const DEFAULT_WORK = { start: 9 * 60, end: 18 * 60 };
export const CONTEXT_SWITCH = { meetingsThreshold: 3, hoursLost: 1 }; // [design] cost of a fragmented day

export function ensureCalendar(state) {
  state.calendar ??= { events: [], workHours: { ...DEFAULT_WORK }, bookingLink: false };
  return state.calendar;
}

const overlaps = (a, b) => a.day === b.day && a.start < b.start + b.duration && b.start < a.start + a.duration;
const busy = (e) => ['scheduled', 'in_progress'].includes(e.status) && e.kind !== 'deadline';

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
  };
  if (e.day < state.day) throw new Error('That date is in the past.');
  if (!ev.allowConflict && e.kind !== 'deadline') {
    const c = conflicts(state, e);
    if (c.length) throw new Error(`Conflicts with "${c[0].title}" on ${fmtDate(state, e.day)}.`);
  }
  cal.events.push(e);
  return e;
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
  e.day = day;
  e.start = start;
  e.rescheduled = (e.rescheduled ?? 0) + 1;
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

// Runs every day from the clock: charge today's meetings, flag missed/unattended ones.
export function calendarDay(state) {
  const cal = ensureCalendar(state);
  const today = cal.events.filter((e) => e.day === state.day && e.status === 'scheduled' && e.kind !== 'deadline');
  const meetings = today.filter((e) => e.kind !== 'focus' && e.kind !== 'personal');
  for (const e of today) {
    if (e.charged || e.kind === 'personal') continue;
    const hours = e.duration / 60;
    if (e.kind === 'focus') { e.charged = true; continue; } // focus blocks are planning; the work itself costs hours
    if (hoursLeft(state) + 1e-9 < hours) {
      e.status = 'missed';
      notify(state, `You were out of hours this week and missed "${e.title}". Overbooking costs relationships.`, { type: 'bad', app: e.app });
      continue;
    }
    state.founder.hoursUsed += hours;
    e.charged = true;
  }
  const hasFocus = today.some((e) => e.kind === 'focus');
  if (meetings.length >= CONTEXT_SWITCH.meetingsThreshold && !hasFocus) {
    state.founder.hoursUsed += CONTEXT_SWITCH.hoursLost;
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
