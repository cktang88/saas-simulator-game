// New-hire onboarding: preboarding and the first 90 days. A checklist per hire (welcome note, laptop, accounts, I-9, 30/60/90
// plan, buddy, calendar meetings) whose quality changes ramp time and early attrition, plus the offboarding side (access
// removal). Numbers: ONB in ops-data.js (research docs/research/ops-2026/negotiation-onboarding.md). Every step is a player
// action that costs founder hours (the UI charges them through ctx.act); money goes to the bank.
//
// Mistakes (functionId people_ops): no_onboarding_plan, missed_i9_deadline, access_not_revoked.
// Randomness: per-member streams only (streamFor), so the main rng sequence is untouched.

import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { scheduleEvent, findSlots } from '../../core/calendar.js';
import { clamp, round2, isWeekend, fmtDate, rng } from '../../core/util.js';
import { streamFor } from './global.js';
import { ONB } from './ops-data.js';
import { ensureOps, emitOps, chargeHours } from './ops-state.js';
import { computeAiCodingMultiplier } from './capacity.js';

export const ITEM_LABEL = {
  welcome: 'Welcome note and preboarding call', equipment: 'Laptop and equipment ordered', accounts: 'Accounts and access provisioned',
  i9: 'Form I-9 (Section 2 within 3 business days)', plan: '30/60/90 plan with measurable outcomes', buddy: 'Buddy assigned',
  meetings: 'Onboarding meetings on the calendar',
};

export function addBusinessDays(state, day, n) {
  let d = day, left = n;
  while (left > 0) { d += 1; if (!isWeekend(state, d)) left -= 1; }
  return d;
}

const isHuman = (m) => m.kind !== 'ai_agent' && m.kind !== 'cofounder';
export const needsI9 = (m) => m.region === 'us' && m.engagement === 'employee';
export const needsLaptop = (m) => m.engagement !== 'contractor';

/** Create the onboarding record for a new hire (called when they accept). */
export function startOnboarding(state, m) {
  if (!isHuman(m)) return null;
  const s = m.startDay;
  const items = {
    welcome: { due: Math.max(state.day + 2, s - 7), done: null },
    accounts: { due: Math.max(state.day + 2, s - 2), done: null, readyDay: null },
    plan: { due: Math.max(state.day + 3, s - 3), done: null },
    buddy: { due: Math.max(state.day + 3, s - 3), done: null, who: null },
    meetings: { due: Math.max(state.day + 3, s - 1), done: null, eventIds: [] },
  };
  if (needsLaptop(m)) items.equipment = { due: Math.max(state.day + 2, s - ONB.leadDays - 2), done: null, tier: null, cost: 0, readyDay: null };
  if (needsI9(m)) items.i9 = { due: addBusinessDays(state, s, ONB.i9.businessDays), done: null };
  m.onboarding = { createdDay: state.day, startDay: s, items, applied: false, quality: null };
  return m.onboarding;
}

const ob = (m) => {
  if (!m.onboarding) throw new Error('No onboarding record for this person.');
  return m.onboarding;
};
const member = (state, id) => {
  const m = state.apps.people.members.find((x) => x.id === id);
  if (!m || !isHuman(m) || m.status === 'gone') throw new Error('Not an active team member or hire.');
  return m;
};

// ---------------------------------------------------------------------------
// Player actions (hours are charged by the UI)
// ---------------------------------------------------------------------------

export function sendWelcome(state, memberId) {
  const m = member(state, memberId);
  const it = ob(m).items.welcome;
  if (it.done != null) throw new Error('Already done.');
  it.done = state.day;
  return it;
}

export function orderEquipment(state, memberId, tier = 'standard') {
  const m = member(state, memberId);
  const it = ob(m).items.equipment;
  if (!it) throw new Error('Contractors bring their own equipment.');
  if (it.done != null) throw new Error('Already ordered.');
  const t = ONB.laptop[tier];
  if (!t) throw new Error('Pick a laptop tier.');
  const cost = t.cost + (m.region !== 'us' ? ONB.shipAbroad : 0);
  post(state, { amount: -cost, counterparty: 'Apple Business', description: `Equipment for ${m.name}: ${t.label}`, category: 'other', method: 'card', meta: { app: 'people', equipment: m.id } });
  Object.assign(it, { done: state.day, tier, cost, readyDay: state.day + ONB.leadDays });
  return it;
}

export function provisionAccounts(state, memberId) {
  const m = member(state, memberId);
  const it = ob(m).items.accounts;
  if (it.done != null) throw new Error('Already provisioned.');
  Object.assign(it, { done: state.day, readyDay: state.day + ONB.provisionDays });
  return it;
}

export function completeI9(state, memberId) {
  const m = member(state, memberId);
  const it = ob(m).items.i9;
  if (!it) throw new Error('Form I-9 applies to US employees.');
  if (it.done != null) throw new Error('Already complete.');
  it.done = state.day;
  it.late = state.day > it.due;
  const o = ensureOps(state);
  o.i9Open = o.i9Open.filter((x) => x.memberId !== m.id);
  if (it.late) {
    o.i9Open.push({ memberId: m.id, name: m.name, late: true });
    notify(state, `${m.name}'s I-9 was completed after the deadline. A late Section 2 is still a paperwork violation if audited.`, { type: 'warn', app: 'people' });
  }
  return it;
}

export function assignBuddy(state, memberId, buddyId) {
  const m = member(state, memberId);
  const it = ob(m).items.buddy;
  if (it.done != null) throw new Error('Already assigned.');
  if (buddyId && buddyId !== 'founder') {
    const b = state.apps.people.members.find((x) => x.id === buddyId);
    if (!b || b.status !== 'active' || !isHuman(b) || b.id === m.id) throw new Error('Pick a current teammate.');
  }
  it.done = state.day;
  it.who = buddyId && buddyId !== 'founder' ? buddyId : 'founder';
  return it;
}

/** Put the onboarding meetings on the founder's calendar (charged as meetings on the day). Returns events booked. */
export function scheduleOnboardingMeetings(state, memberId) {
  const m = member(state, memberId);
  const it = ob(m).items.meetings;
  if (it.done != null) throw new Error('Already scheduled.');
  const first = Math.max(state.day + 1, m.startDay);
  const events = [];
  for (const [name, off, minutes] of ONB.meetings) {
    const day = Math.max(state.day + 1, m.startDay + off);
    const slot = findSlots(state, { fromDay: day, duration: minutes, count: 1 })[0];
    if (!slot) continue;
    const ev = scheduleEvent(state, { title: `Onboarding: ${m.name}: ${name}`, kind: 'meeting', app: 'people', refId: m.id, with: { name: m.name }, day: slot.day, start: slot.start, duration: minutes, location: m.region === 'us' ? 'Office or video' : 'Video call', notes: `New-hire onboarding (day ${off}).` });
    events.push(ev);
  }
  if (!events.length) throw new Error('No free slots in the next 30 days.');
  it.done = state.day;
  it.eventIds = events.map((e) => e.id);
  it.firstDay = Math.min(...events.map((e) => e.day));
  m.onboarding.meetingsScheduled = true;
  return events;
}

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

function itemCredit(m, key, it) {
  const s = m.startDay;
  if (key === 'welcome') return it.done == null ? 0 : it.done <= s ? 1 : 0.4;
  if (key === 'equipment' || key === 'accounts') {
    if (it.done == null) return 0;
    const late = Math.max(0, it.readyDay - s);
    return late === 0 ? 1 : late <= 3 ? 0.5 : 0.2;
  }
  if (key === 'i9') return it.done == null ? 0 : it.late ? 0.3 : 1;
  if (key === 'plan') { const p = m.mgmt?.plan; return p ? p.score * (p.beforeStart || p.day - s <= 7 ? 1 : 0.7) : 0; }
  if (key === 'buddy') return it.done == null ? 0 : it.who === 'founder' ? 0.7 : 1;
  if (key === 'meetings') return it.done == null ? 0 : it.firstDay <= s + 1 ? 1 : it.firstDay <= s + 7 ? 0.7 : 0.4;
  return 0;
}

/** Onboarding quality 0..1 over the applicable items; `logistics` excludes the 30/60/90 plan and the I-9 (their effects are modelled elsewhere). */
export function onboardingQuality(m, { logistics = false } = {}) {
  const o = m.onboarding;
  if (!o) return null;
  let s = 0, t = 0;
  for (const [key, it] of Object.entries(o.items)) {
    if (logistics && (key === 'plan' || key === 'i9')) continue;
    const w = ONB.weights[key] ?? 0;
    s += w * itemCredit(m, key, it);
    t += w;
  }
  return t ? round2(s / t) : null;
}

export const rampMult = (lq) => ONB.ramp.poor + (ONB.ramp.great - ONB.ramp.poor) * clamp(lq, 0, 1);
export const earlyExitP90 = (q) => round2(ONB.earlyExit90.none + (ONB.earlyExit90.structured - ONB.earlyExit90.none) * clamp(q, 0, 1));

/** Founder checklist items still open (for the UI and events). */
export const openItems = (m) => Object.entries(m.onboarding?.items ?? {}).filter(([k, it]) => (k === 'plan' ? !m.mgmt?.plan : it.done == null)).map(([k, it]) => ({ key: k, due: it.due, label: ITEM_LABEL[k] }));

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/** On the first day: settle logistics (scramble for anything not done), ramp, sign-on. */
export function onboardingOnStart(state, m) {
  const o = m.onboarding;
  if (!o || o.applied) return null;
  o.applied = true;
  const it = o.items;
  let lateDays = 0;
  if (it.equipment && it.equipment.done == null) {
    const cost = Math.round(ONB.laptop.standard.cost * 1.25);
    post(state, { amount: -cost, counterparty: 'Best Buy Business', description: `Same-day laptop for ${m.name} (nothing ordered before day 1)`, category: 'other', method: 'card', meta: { app: 'people', equipment: m.id } });
    Object.assign(it.equipment, { done: state.day, tier: 'scramble', cost, readyDay: state.day + 3 });
  }
  if (it.accounts && it.accounts.done == null) { it.accounts.done = state.day; it.accounts.readyDay = state.day + ONB.provisionDays; }
  if (it.equipment) lateDays += Math.max(0, it.equipment.readyDay - m.startDay);
  if (it.accounts) lateDays += Math.max(0, it.accounts.readyDay - m.startDay);
  o.lateDays = lateDays;
  const lq = onboardingQuality(m, { logistics: true });
  o.logisticsQuality = lq;
  const base = m.rampWeeks ?? 8;
  let mult = rampMult(lq);
  const jr = m.jobRole ?? m.role;
  let ai = 1;
  if (m.role === 'engineer' && (jr === 'engineer' || jr === 'ai_engineer') && computeAiCodingMultiplier(state) > 1) {
    const fluent = (m.traits?.ai_fluency ?? 50) >= 45;
    ai = 1 - (fluent ? 1 : 0.5) * ONB.aiRamp.weight * (1 - ONB.aiRamp.daysWith / ONB.aiRamp.daysWithout);
  }
  m.rampWeeks = Math.max(1, Math.round((base * mult * ai + lateDays / 7) * 10) / 10);
  o.ramp = { base, mult: round2(mult), ai: round2(ai), lateDays, weeks: m.rampWeeks };
  if (m.engagement !== 'contractor' && (m.signOn ?? 0) > 0) {
    post(state, { amount: -m.signOn, counterparty: m.engagement === 'eor' ? 'Deel' : 'Gusto', description: `Sign-on bonus: ${m.name}`, category: 'payroll', method: 'payroll', meta: { app: 'people' } });
    post(state, { amount: -Math.round(m.signOn * 0.0765), counterparty: m.engagement === 'eor' ? 'Deel' : 'Gusto', description: `Employer tax on sign-on: ${m.name}`, category: 'payroll_tax', method: 'payroll', meta: { app: 'people' } });
  }
  emitOps(state, 'new_hire_start', m.id, { memberId: m.id, name: m.name, startDay: m.startDay, role: m.role, label: `${m.name} starts today` });
  return o;
}

export function onboardingDay(state, p) {
  const ops = ensureOps(state);
  for (const m of p.members) {
    const o = m.onboarding;
    if (!o || m.kind === 'ai_agent') continue;
    const live = m.status === 'active' || (m.status === 'offer' && m.startDay - state.day <= 14);
    if (!live) continue;
    for (const [key, it] of Object.entries(o.items)) {
      const done = key === 'plan' ? Boolean(m.mgmt?.plan) : it.done != null;
      if (!done && state.day > it.due && (state.day - m.startDay) < 90) {
        if (emitOps(state, 'onboarding_overdue', `${m.id}:${key}`, { memberId: m.id, name: m.name, item: key, label: `${m.name}: ${ITEM_LABEL[key]} is overdue` })) {
          if (key !== 'plan') notify(state, `Onboarding overdue for ${m.name}: ${ITEM_LABEL[key]}.`, { type: 'warn', app: 'people' });
        }
      }
    }
    // I-9: Section 2 is due 3 business days after the start. A miss is a paperwork violation with audit exposure.
    const i9 = o.items.i9;
    if (i9 && i9.done == null && state.day > i9.due && m.status === 'active') {
      if (!ops.i9Open.some((x) => x.memberId === m.id)) ops.i9Open.push({ memberId: m.id, name: m.name, late: false });
      logMistake(state, { functionId: 'people_ops', id: 'missed_i9_deadline', label: 'Form I-9 not completed in 3 business days', app: 'people', key: `i9:${m.id}`, delayed: true, cost: { hours: 1, usd: 0 }, charge: true, detail: `${m.name} started ${fmtDate(state, m.startDay)} and Section 2 was due ${fmtDate(state, i9.due)}. Paperwork violations are fined per form (roughly $${ONB.i9.fine[0]}-$${ONB.i9.fine[1].toLocaleString('en-US')}) when I-9s are audited, and a missing form cannot be backdated. Complete it now; it stays a recorded late filing.` });
    }
    // Two weeks in with no structure: say so once, with the early-exit risk.
    if (m.status === 'active' && state.day - m.startDay === 14) {
      const q = onboardingQuality(m);
      if (q != null && q < 0.35) {
        logMistake(state, { functionId: 'people_ops', id: 'no_onboarding_plan', label: 'New hire with no onboarding structure', app: 'people', key: `onb:${m.id}`, delayed: true, cost: { hours: 4, usd: Math.round(((m.salary ?? (m.hourlyRate ?? 40) * 2080) / 12) * 0.15) }, detail: `${m.name} is two weeks in with onboarding at ${Math.round(q * 100)}%: ${openItems(m).map((x) => x.label.toLowerCase()).slice(0, 4).join('; ')}. Without structure about a quarter of new hires leave inside 90 days (sourced range 28-33% for all hires); with a plan, a buddy and set meetings it is a fraction of that. Ramp is also ~${Math.round((rampMult(o.logisticsQuality ?? 0) - 1) * 100)}% longer than it could be.` });
      }
    }
  }
}

/** Month end: early exits in the first 90 days (own stream), I-9 audit exposure, offboarding incidents. */
export function onboardingMonthEnd(state, p) {
  const ops = ensureOps(state);
  for (const m of p.members) {
    const o = m.onboarding;
    if (!o || m.status !== 'active' || m.leavingDay != null || m.engagement === 'contractor') continue;
    const tenure = state.day - m.startDay;
    if (tenure <= 0 || tenure > 100) continue;
    const q = onboardingQuality(m) ?? 0;
    const p90 = earlyExitP90(q);
    const monthly = 1 - Math.pow(1 - p90, 1 / 3);
    o.exitRisk = round2(p90);
    const S = streamFor(state, `ob|exit|${m.id}|${state.day}`);
    if (rng(S) < monthly) {
      m.leavingDay = state.day + 14;
      m.exitReason = 'left in the first 90 days';
      m.earlyExit = true;
      notify(state, `${m.name} is leaving in their first 90 days (last day ${fmtDate(state, m.leavingDay)}). Onboarding was ${Math.round(q * 100)}% complete.`, { type: 'bad', app: 'people' });
      const replace = Math.round(((m.salary ?? (m.hourlyRate ?? 40) * 2080) / 12) * 2 + 3000);
      logMistake(state, { functionId: 'people_ops', id: 'no_onboarding_plan', label: 'Early exit after a thin onboarding', app: 'people', key: `onb-exit:${m.id}`, delayed: true, circles: q < 0.5, cost: { usd: replace, hours: 20, days: 45 }, detail: `${m.name} left inside 90 days (onboarding ${Math.round(q * 100)}%). Losing a hire in the first quarter costs the search again plus the ramp already paid for.` });
    }
  }
  // I-9 audits: a missing or late form is exposed to an audit at a low monthly rate [design].
  for (const x of ops.i9Open) {
    const S = streamFor(state, `i9audit|${x.memberId}|${state.day}`);
    if (!x.fined && rng(S) < ONB.i9.auditMonthly * (x.late ? 0.6 : 1)) {
      x.fined = true;
      const fine = Math.round(ONB.i9.fine[0] + rng(S) * (ONB.i9.fine[1] - ONB.i9.fine[0]));
      post(state, { amount: -fine, counterparty: 'DHS / ICE', description: `Form I-9 paperwork violation: ${x.name}`, category: 'taxes', method: 'ach', meta: { app: 'people' } });
      notify(state, `An I-9 audit fined you $${fine.toLocaleString('en-US')} for ${x.name}'s ${x.late ? 'late' : 'missing'} form.`, { type: 'bad', app: 'people' });
      logMistake(state, { functionId: 'people_ops', id: 'missed_i9_deadline', label: 'I-9 paperwork fine', app: 'people', key: `i9fine:${x.memberId}`, cost: { usd: fine, hours: 2 }, detail: 'Fine from an I-9 inspection.' });
    }
  }
  // Leftover access after an exit.
  for (const x of ops.offboard) {
    if (x.revoked || x.incident) continue;
    if (state.day - x.exitDay < 1) continue;
    const S = streamFor(state, `access|${x.memberId}|${state.day}`);
    if (rng(S) < (x.fired ? ONB.access.incidentMonthlyFired : ONB.access.incidentMonthlyResigned)) {
      x.incident = true;
      const cost = Math.round(ONB.access.cost[0] + rng(S) * (ONB.access.cost[1] - ONB.access.cost[0]));
      post(state, { amount: -cost, counterparty: 'Incident response', description: `Security incident: leftover access of ${x.name} (data cleanup, credential rotation)`, category: 'other', method: 'ach', meta: { app: 'people' } });
      notify(state, `Security incident: ${x.name} still had access after leaving. Cleanup cost $${cost.toLocaleString('en-US')}.`, { type: 'bad', app: 'people' });
      logMistake(state, { functionId: 'people_ops', id: 'access_not_revoked', label: 'Security incident from an ex-employee\'s access', app: 'people', key: `access-inc:${x.memberId}`, cost: { usd: cost, hours: 12 }, detail: `${x.name}'s accounts were never switched off. Revoke access the same day someone leaves (SSO, GitHub, cloud, password manager, Stripe, email).` });
    }
  }
}

// ---------------------------------------------------------------------------
// Offboarding
// ---------------------------------------------------------------------------

export function onboardingOnExit(state, m, fired) {
  if (!isHuman(m) || m.engagement === 'cofounder') return null;
  const ops = ensureOps(state);
  if (ops.offboard.some((x) => x.memberId === m.id)) return null;
  const rec = { memberId: m.id, name: m.name, exitDay: state.day, fired: Boolean(fired), revoked: false, flagged: false };
  ops.offboard.push(rec);
  return rec;
}

export function revokeAccess(state, memberId) {
  const ops = ensureOps(state);
  const x = ops.offboard.find((r) => r.memberId === memberId);
  if (!x) throw new Error('Nothing to revoke.');
  if (x.revoked) throw new Error('Access already removed.');
  x.revoked = state.day;
  return x;
}

/** Daily: leftover access is a mistake the day after the exit. Also auto-flag resignations at their last day. */
export function offboardingDay(state) {
  const ops = ensureOps(state);
  for (const x of ops.offboard) {
    if (x.revoked || x.flagged || state.day - x.exitDay < 1) continue;
    x.flagged = true;
    logMistake(state, { functionId: 'people_ops', id: 'access_not_revoked', label: 'Access left on after someone left', app: 'people', key: `access:${x.memberId}`, delayed: true, cost: { hours: 1 }, charge: true, detail: `${x.name} left ${state.day - x.exitDay} day(s) ago and their accounts are still live. Every month that stays open is a chance of a data leak or an incident (~${Math.round((x.fired ? ONB.access.incidentMonthlyFired : ONB.access.incidentMonthlyResigned) * 100)}%/month, game estimate).` });
  }
}
