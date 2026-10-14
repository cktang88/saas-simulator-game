// Founder wellbeing and life. Energy follows the research energy model (public/data/world.js WELLBEING):
// long weeks drain it, lighter weeks with a real day off restore it; low energy costs ~20% of your
// effective hours; at the burnout threshold you burn out for weeks. Life happens too: illness, family
// care, moving — at research base rates, conditioned on your circumstances.

import { uid, rng, chance, clamp, dayOfWeek } from './util.js';
import { notify } from './state.js';
import { personalTxn } from './personal.js';

let W = null;
let LIFE = [];
export const wellbeingReady = import('../data/world.js').then((m) => {
  W = m.WELLBEING;
  LIFE = m.WORLD_EVENTS.filter((e) => e.category === 'life');
  return m;
}).catch(() => null);
export const lifeEventTypes = () => LIFE;

const range = (state, r, fallback) => (Array.isArray(r) ? r[0] + rng(state) * (r[1] - r[0]) : r ?? fallback);

export function ensureWellbeing(state) {
  const f = state.founder;
  f.wellbeing ??= { peerGroup: false, therapy: false, dayOff: true, hasYoungKids: false, renter: true, age45plus: false, effects: [], events: [], burnoutUntil: null, lowWeeks: 0, history: [] };
  return f.wellbeing;
}

// Effective share of your weekly hours available right now (life events, burnout, low energy).
export function capacityMult(state) {
  const wb = ensureWellbeing(state);
  let m = 1;
  for (const e of wb.effects) if (e.untilDay >= state.day) m = Math.min(m, e.capacityMult);
  const low = W?.energyModel?.lowThreshold ?? 40;
  if (state.founder.energy < low) m *= W?.energyModel?.lowEffects?.velocityMult ?? 0.8;
  return m;
}

// Called by the clock at the start of each week (Monday), BEFORE hours reset.
export function wellbeingWeek(state) {
  const f = state.founder;
  const wb = ensureWellbeing(state);
  const em = W?.energyModel ?? { weeklyCostOver55h: [3, 6], weeklyRestoreUnder45hWithDayOff: [4, 8], burnoutThreshold: 20, burnoutWeeks: [2, 6], burnoutCapacity: [0.3, 0.5] };
  const h = Math.max(0, f.hoursUsed - (f.lostHoursThisWeek ?? 0)); // actual work, not time lost to life
  f.lostHoursThisWeek = 0;
  let delta = 0;
  if (h > 55) delta = -range(state, em.weeklyCostOver55h, 4) * (1 + (h - 55) / 15); // 70h weeks hurt about twice as much
  else if (h < 45 && wb.dayOff) delta = range(state, em.weeklyRestoreUnder45hWithDayOff, 6);
  else if (wb.dayOff) delta = 1.5;
  else delta = -1;
  if (delta < 0) delta *= (wb.peerGroup ? 0.85 : 1) * (wb.therapy ? 0.75 : 1);
  f.energy = clamp(f.energy + delta, 0, 100);
  wb.history.push({ day: state.day, hours: Math.round(h * 10) / 10, energy: Math.round(f.energy) });
  if (wb.history.length > 260) wb.history.shift();

  if (wb.therapy) personalTxn(state, -600, 'Therapist / coach (4 sessions)', 'living');

  // Burnout episode
  if (f.energy <= em.burnoutThreshold && !(wb.burnoutUntil > state.day)) {
    const weeks = Math.round(range(state, em.burnoutWeeks, 3));
    const cap = range(state, em.burnoutCapacity, 0.4);
    wb.burnoutUntil = state.day + weeks * 7;
    const ev = { id: uid('life'), type: 'burnout_episode', label: 'Burnout', day: state.day, status: 'needs_response', capacityMult: cap, durationDays: weeks * 7 };
    wb.events.unshift(ev);
    wb.effects.push({ id: ev.id, label: 'Burnout', capacityMult: cap, untilDay: wb.burnoutUntil });
    notify(state, `You've hit burnout: exhausted, cynical, everything takes twice as long. For the next ~${weeks} weeks you have about ${Math.round(cap * 100)}% of your usual capacity. Decide how to handle it in You.`, { type: 'bad', app: 'you' });
  }
  wb.effects = wb.effects.filter((e) => e.untilDay >= state.day);
}

// Called by the clock right after the weekly hour reset: lost capacity shows up as hours already gone.
export function applyCapacity(state) {
  const m = capacityMult(state);
  if (m < 1) {
    const lost = state.founder.hoursPerWeek * (1 - m);
    state.founder.hoursUsed += lost;
    state.founder.lostHoursThisWeek = (state.founder.lostHoursThisWeek ?? 0) + lost;
    state.founder.timeLog ??= [];
    state.founder.timeLog.push({ day: state.day, hours: lost, label: m < 0.8 ? 'Life & health (reduced capacity)' : 'Low energy (slower, more mistakes)' });
  }
}

export function lifeDay(state) {
  if (!LIFE.length) return;
  const wb = ensureWellbeing(state);
  const exposure = { lowEnergy: state.founder.energy < 40, hasYoungKids: wb.hasYoungKids, renter: wb.renter, age45plus: wb.age45plus };
  for (const e of LIFE) {
    if (!e.baseRatePerYear) continue;
    let rate = e.baseRatePerYear / 365;
    for (const [k, mult] of Object.entries(e.conditions?.exposure ?? {})) if (exposure[k]) rate *= mult;
    if (!chance(state, rate)) continue;
    const fx = e.effects ?? {};
    const duration = Math.round(range(state, fx.durationDays, 7));
    const cap = fx.capacityMult != null ? range(state, fx.capacityMult, 0.5) : fx.daysLost ? clamp(1 - range(state, fx.daysLost, 3) / Math.max(7, duration), 0.1, 0.9) : 0.6;
    const ev = { id: uid('life'), type: e.id, label: e.label, text: fx.text ?? '', day: state.day, status: 'needs_response', capacityMult: cap, durationDays: duration, cost: fx.cost ? Math.round(range(state, fx.cost, 0)) : 0, responses: e.playerResponses ?? [] };
    wb.events.unshift(ev);
    if (wb.events.length > 60) wb.events.length = 60;
    wb.effects.push({ id: ev.id, label: e.label, capacityMult: cap, untilDay: state.day + duration });
    // The rest of this week is affected immediately.
    const remainingDays = (7 - ((dayOfWeek(state) + 6) % 7));
    const left = Math.max(0, state.founder.hoursPerWeek - state.founder.hoursUsed);
    const lostNow = left * (1 - cap) * Math.min(1, duration / remainingDays);
    state.founder.hoursUsed += lostNow;
    state.founder.lostHoursThisWeek = (state.founder.lostHoursThisWeek ?? 0) + lostNow;
    if (ev.cost) personalTxn(state, -ev.cost, e.label, 'living');
    notify(state, `${e.label}. ${fx.text ?? ''} Decide how to handle it in You.`, { type: 'bad', app: 'you' });
  }
}

// Player response to a life event. response: { id, label, hours, cost, effectHints }
export function respondLife(state, eventId, responseId) {
  const wb = ensureWellbeing(state);
  const ev = wb.events.find((x) => x.id === eventId);
  if (!ev || ev.status !== 'needs_response') return;
  const resp = (ev.responses ?? LIFE.find((e) => e.id === ev.type)?.playerResponses ?? []).find((r) => r.id === responseId)
    ?? (ev.type === 'burnout_episode' ? (LIFE.find((e) => e.id === 'burnout_episode')?.playerResponses ?? []).find((r) => r.id === responseId) : null);
  if (!resp) return;
  ev.status = 'handled';
  ev.response = resp.label;
  if (resp.cost) personalTxn(state, -resp.cost, `${ev.label}: ${resp.label}`, 'living');
  if (resp.hours) state.founder.hoursUsed += resp.hours;
  const fx = resp.effectHints ?? {};
  const eff = wb.effects.find((x) => x.id === ev.id);
  if (typeof fx.energy === 'string') state.founder.energy = clamp(state.founder.energy + Number(fx.energy), 0, 100);
  if (eff && fx.durationDays) eff.untilDay = ev.day + Math.round(range(state, fx.durationDays, ev.durationDays));
  if (eff && fx.daysLostMult) eff.untilDay = ev.day + Math.round(ev.durationDays * fx.daysLostMult);
  if (eff && typeof fx.capacityMult === 'string') eff.capacityMult = clamp(eff.capacityMult + Number(fx.capacityMult), 0.1, 1);
  if (ev.type === 'burnout_episode' && responseId === 'real_break') {
    state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, 50);
    state.founder.energy = clamp(state.founder.energy + 15, 0, 100);
  }
  if (fx.badDecisionChance || fx.errorRisk) ev.riskNote = 'Higher risk of costly mistakes while you push through.';
}
