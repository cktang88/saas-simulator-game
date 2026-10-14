// Founder wellbeing and life. Energy follows the research energy model (public/data/world.js WELLBEING):
// long weeks drain it, lighter weeks with a real day off restore it; low energy costs ~20% of your
// effective hours; at the burnout threshold you burn out for weeks. Life happens too: illness, family
// care, moving — at research base rates, conditioned on your circumstances.

import { uid, rng, chance, clamp, dayOfWeek } from './util.js';
import { notify } from './state.js';
import { personalTxn } from './personal.js';

import { WELLBEING, WORLD_EVENTS } from '../data/world.js';

// Static import keeps the simulation deterministic: data is always present from day 1.
const W = WELLBEING;
const LIFE = WORLD_EVENTS.filter((e) => e.category === 'life');
export const wellbeingReady = Promise.resolve();
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
  // Each effect only counts for the days of this week it actually covers.
  for (const e of wb.effects) {
    if (e.untilDay < state.day) continue;
    const share = Math.min(7, e.untilDay - state.day + 1) / 7;
    m = Math.min(m, 1 - (1 - e.capacityMult) * share);
  }
  const low = W?.energyModel?.lowThreshold ?? 40;
  if (state.founder.energy < low) m *= W?.energyModel?.lowEffects?.velocityMult ?? 0.8;
  return m;
}

// Called by the clock at the start of each week (Monday), BEFORE hours reset.
export function wellbeingWeek(state) {
  const f = state.founder;
  const wb = ensureWellbeing(state);
  const em = W?.energyModel ?? { weeklyCostOver55h: [3, 6], weeklyRestoreUnder45hWithDayOff: [4, 8], burnoutThreshold: 20, burnoutWeeks: [2, 6], burnoutCapacity: [0.3, 0.5] };
  const jobHours = { full_time: 40, part_time: 20 }[state.personal?.job] ?? 0; // a day job is work too
  const h = Math.max(0, f.hoursUsed - (f.lostHoursThisWeek ?? 0)) + jobHours; // actual work, not time lost to life
  f.lostHoursThisWeek = 0;
  let delta = 0;
  if (h > 55) delta = -range(state, em.weeklyCostOver55h, 4) * (1 + (h - 55) / 15); // 70h weeks hurt about twice as much
  else if (h < 45 && wb.dayOff) delta = range(state, em.weeklyRestoreUnder45hWithDayOff, 6);
  else if (h < 45) delta = 1;
  else if (wb.dayOff) delta = 0.5;
  else delta = -1; // 45–55h with no real day off slowly wears you down
  if (delta < 0) delta *= (wb.peerGroup ? 0.85 : 1) * (wb.therapy ? 0.75 : 1);
  f.energy = clamp(f.energy + delta, 0, 100);
  wb.history.push({ day: state.day, hours: Math.round(h * 10) / 10, energy: Math.round(f.energy) });
  if (wb.history.length > 260) wb.history.shift();

  if (wb.therapy) personalTxn(state, -600, 'Therapist / coach (4 sessions)', 'living');

  // Burnout is a weekly hazard calibrated to annual rates by weekly hours (research: ~10%/yr at ≤45h,
  // ~20% at 50h, ~50% at 60h+, ~70% at 70h), raised by low energy and lowered by support.
  const annual = h <= 45 ? 0.1 : h <= 50 ? 0.1 + (h - 45) * 0.02 : h <= 55 ? 0.2 + (h - 50) * 0.03 : h <= 60 ? 0.35 + (h - 55) * 0.03 : h <= 70 ? 0.5 + (h - 60) * 0.02 : Math.min(0.9, 0.7 + (h - 70) * 0.02);
  let pWeek = (1 - Math.pow(1 - annual, 1 / 52)) * clamp(1 + (60 - f.energy) / 40, 0.5, 2.5);
  if (wb.peerGroup) pWeek *= 0.8;
  if (wb.therapy) pWeek *= 0.7;
  const burnoutNow = f.energy <= em.burnoutThreshold || chance(state, pWeek);
  if (burnoutNow && !(wb.burnoutUntil > state.day) && !(wb.lastBurnoutEnd > state.day - 56)) {
    const weeks = Math.round(range(state, em.burnoutWeeks, 3));
    const cap = range(state, em.burnoutCapacity, 0.4);
    wb.burnoutUntil = state.day + weeks * 7;
    wb.lastBurnoutEnd = wb.burnoutUntil;
    const ev = { id: uid('life'), type: 'burnout_episode', label: 'Burnout', day: state.day, status: 'needs_response', capacityMult: cap, durationDays: weeks * 7 };
    wb.events.unshift(ev);
    wb.effects.push({ id: ev.id, label: 'Burnout', capacityMult: cap, untilDay: wb.burnoutUntil });
    notify(state, `You've hit burnout: exhausted, cynical, everything takes twice as long. For the next ~${weeks} weeks you have about ${Math.round(cap * 100)}% of your usual capacity. Decide how to handle it in You.`, { type: 'bad', app: 'you' });
  }
  wb.effects = wb.effects.filter((e) => e.untilDay >= state.day);
}

// Called by the clock right after the weekly hour reset: lost capacity shows up as hours already gone.
// Unavoidable weekly overhead: inbox, admin, tools, Slack/communities — grows with customers and the
// number of systems you run (research: knowledge workers spend most time on coordination).
export function weeklyOverhead(state) {
  const customers = (state.stripe?.subscriptions ?? []).filter((x) => x.status === 'active' || x.status === 'past_due').length;
  const a = state.apps;
  const systems = [a.outreach?.sequences?.length, a.ads?.campaigns?.length, a.channels && Object.keys(a.channels).length > 2, a.crm?.companies?.length, a.support?.active, (a.people?.members ?? []).some((m) => m.status === 'active'), a.fundraising?.round?.status === 'open'].filter(Boolean).length;
  return Math.min(12, 3 + 0.02 * customers + systems);
}

export function applyCapacity(state) {
  const f = state.founder;
  f.timeLog ??= [];
  const overhead = weeklyOverhead(state);
  f.hoursUsed += overhead;
  f.timeLog.push({ day: state.day, hours: overhead, label: 'Inbox, admin & tools (unavoidable)' });
  if (f.wellbeing?.peerGroup) { f.hoursUsed += 1; f.timeLog.push({ day: state.day, hours: 1, label: 'Founder peer group' }); }
  const total = capacityMult(state);
  const low = W?.energyModel?.lowThreshold ?? 40;
  const energyMult = f.energy < low ? (W?.energyModel?.lowEffects?.velocityMult ?? 0.8) : 1;
  const lifeMult = total / energyMult;
  const parts = [
    [f.hoursPerWeek * (1 - lifeMult), 'Life & health (reduced capacity)'],
    [f.hoursPerWeek * lifeMult * (1 - energyMult), 'Low energy (slower, more mistakes)'],
  ];
  for (const [lost, label] of parts) {
    if (lost < 0.05) continue;
    f.hoursUsed += lost;
    f.lostHoursThisWeek = (f.lostHoursThisWeek ?? 0) + lost;
    f.timeLog.push({ day: state.day, hours: lost, label });
  }
}

export function lifeDay(state) {
  if (!LIFE.length) return;
  const wb = ensureWellbeing(state);
  const exposure = { lowEnergy: state.founder.energy < 40, hasYoungKids: wb.hasYoungKids, renter: wb.renter, age45plus: wb.age45plus };
  for (const base of LIFE) {
    if (!base.baseRatePerYear) continue;
    // Illness: frequent short colds (≈1.5/yr, 1–3 days) and occasional flu (≈8%/season, 4–10 days)
    // instead of one 1–10 day draw (research: most workers take 2–3 sick days a year).
    let e = base;
    if (base.id === 'founder_illness') {
      const flu = chance(state, 0.08 / (0.08 + 1.5));
      e = { ...base, baseRatePerYear: 1.58, label: flu ? 'You have the flu' : 'You caught a cold', effects: { ...base.effects, daysLost: flu ? [4, 10] : [1, 3], durationDays: flu ? 10 : 5, text: flu ? 'Flu: fever and a week or more of low capacity.' : 'A cold or stomach bug: a few slow days.' } };
    }
    let rate = e.baseRatePerYear / 365;
    for (const [k, mult] of Object.entries(e.conditions?.exposure ?? {})) if (exposure[k]) rate *= mult;
    if (!chance(state, rate)) continue;
    const fx = e.effects ?? {};
    const duration = Math.round(range(state, fx.durationDays, 7));
    // With daysLost (e.g. 1–10 sick days at ~20% capacity), the average capacity over the window is
    // 1 − daysLost/duration × (1 − sickCapacity); otherwise use capacityMult for the whole window.
    const sickCap = fx.capacityMult != null && !Array.isArray(fx.capacityMult) ? fx.capacityMult : 0.2;
    const cap = fx.daysLost
      ? clamp(1 - (Math.min(duration, range(state, fx.daysLost, 3)) / duration) * (1 - sickCap), 0.1, 0.95)
      : fx.capacityMult != null ? range(state, fx.capacityMult, 0.5) : 0.6;
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
    (state.founder.timeLog ??= []).push({ day: state.day, hours: lostNow, label: 'Life & health (reduced capacity)' });
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
