// State slice for People ops (negotiation, onboarding, benefits and time off, workplace): state.apps.people.ops.
// No app imports, so any People module can use it without a cycle.

import { DEFAULT_BENEFITS } from './ops-data.js';

export function ensureOps(state) {
  const p = state.apps.people;
  if (!p) throw new Error('People slice missing (call ensurePeople first).');
  if (!p.ops) {
    p.ops = {
      events: [], fines: [], absences: [], offboard: [], i9Open: [], coverage: { runbooks: false, onCall: false },
      benefits: structuredClone(DEFAULT_BENEFITS),
      workplace: { mode: null, city: null, state: null, cowork: null, lease: null, hybridDays: 2, dayPasses: 0, offsites: [], offsiteUntil: -1 },
      rec: {}, neg: { log: [] },
    };
  }
  const o = p.ops;
  o.neg ??= { log: [] };
  o.rec ??= {};
  return o;
}

export const humansOf = (p) => (p.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.kind !== 'cofounder');
export const activeHumans = (p) => humansOf(p).filter((m) => m.status === 'active');
export const employeesOf = (p) => activeHumans(p).filter((m) => m.engagement === 'employee' || m.engagement === 'eor');

/** Record an event for the Automations triggers (stable id per event so it fires once). */
export function emitOps(state, type, ref, data = {}) {
  const o = ensureOps(state);
  const id = `${type}:${ref}`;
  if (o.events.some((e) => e.id === id)) return null;
  const ev = { id, type, ref: id, day: state.day, ...data };
  o.events.push(ev);
  if (o.events.length > 400) o.events.splice(0, o.events.length - 400);
  return ev;
}

/** Events of a trigger on or after a day (Automations). */
export function opsEvents(state, trigger, since = state.day - 1) {
  const o = state.apps.people?.ops;
  if (!o) return [];
  return o.events.filter((e) => e.type === trigger && e.day >= since);
}

export const OPS_TRIGGERS = ['offer_countered', 'offer_declined', 'new_hire_start', 'onboarding_overdue', 'pto_requested', 'employee_out_sick', 'lease_renewal_due'];

export function chargeHours(state, hours, label) {
  const f = state.founder;
  const h = Math.min(hours, Math.max(0, f.hoursPerWeek - f.hoursUsed));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  (f.timeLog ??= []).push({ day: state.day, hours: h, label });
  return h;
}
