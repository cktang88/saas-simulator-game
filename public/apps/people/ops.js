// People ops hub: the hooks sim.js calls for negotiation, onboarding, benefits and time off, and the workplace. Keeps the
// changes in sim.js to one-line calls. Everything here is deterministic (per-candidate and per-member streams).

import { logMistake } from '../../core/operator.js';
import { clamp, round2, rng } from '../../core/util.js';
import { streamFor } from './global.js';
import { STATE_MIX } from './ops-data.js';
import { ensureOps, emitOps, humansOf, chargeHours } from './ops-state.js';
import { negotiationOnOffer, negotiationGate, adjustAcceptProb, hireTermsCheck, renegeCheck, payEquityCheck, payTransparencyCheck, finesDay, householdOf } from './negotiation.js';
import { startOnboarding, onboardingOnStart, onboardingDay, onboardingMonthEnd, onboardingOnExit, offboardingDay } from './onboarding.js';
import { absenceDay } from './absence.js';
import { activePolicy, benefitsDeclineCheck, ptoPayoutOnExit, sickLeaveGapCheck, syncBenefitBills, packageFor } from './benefits.js';
import { workplaceDay, workplaceMonthEnd, workplaceOnOpenJob, workplaceAttrMult, isolationDrain, syncWorkplaceBills, headsFor } from './workplace.js';

export const opsOnOffer = (state, c, o) => { ensureOps(state); return negotiationOnOffer(state, c, o); };
export const opsGate = negotiationGate;
export const opsAdjustProb = adjustAcceptProb;

export function opsOnDecline(state, c, why, cause) {
  emitOps(state, 'offer_declined', c.id, { candidateId: c.id, name: c.name, role: c.role, reason: cause ?? why, label: `${c.name} declined the offer` });
  const n = c.negotiation;
  if (n) (n.history ??= []).push({ day: state.day, kind: 'declined', cause });
  if (!cause) benefitsDeclineCheck(state, c);
}

function drawState(state, m) {
  const wp = ensureOps(state).workplace;
  if (wp.mode && wp.mode !== 'remote' && wp.state) return wp.state; // works from the office city
  const S = streamFor(state, `abs|state|${m.id}`);
  let u = rng(S);
  for (const [st, w] of STATE_MIX) { u -= w; if (u <= 0) return st; }
  return 'OTHER';
}

/** A candidate accepted: terms check, onboarding record, hidden household and work state. */
export function opsOnHire(state, p, m, c) {
  ensureOps(state);
  if (m.kind === 'ai_agent') return;
  m.household = householdOf(state, c);
  if (m.region === 'us') m.workState = drawState(state, m);
  hireTermsCheck(state, p, m, c);
  startOnboarding(state, m);
}

/** First day on the job. */
export function opsOnStart(state, p, m) {
  if (m.kind === 'ai_agent') return;
  onboardingOnStart(state, m);
  payEquityCheck(state, p, m);
  if (m.region === 'us' && m.engagement === 'employee') syncBenefitBills(state);
  syncWorkplaceBills(state);
}

export function opsOnOpenJob(state, job) {
  ensureOps(state);
  payTransparencyCheck(state, job);
  workplaceOnOpenJob(state, job);
}

/** A person leaves (fired, resigned or contract ended). */
export function opsOnExit(state, m, { fired = false } = {}) {
  if (m.kind === 'ai_agent') return;
  ensureOps(state);
  if (m.engagement === 'employee') ptoPayoutOnExit(state, m);
  onboardingOnExit(state, m, fired);
  const lb = m.ops?.lowball;
  if (lb && !fired && m.exitReason === 'resigned' && state.day - lb.day <= 560) {
    // a quit the low offer made likelier: the replacement bill, once
    const replace = round2(((m.salary ?? 0) / 12) * 2 + 3000);
    logMistake(state, { functionId: 'people_ops', id: 'lowball_offer_attrition', label: 'A lowballed hire resigned', app: 'people', key: `lowball-quit:${m.id}`, cost: { usd: replace, hours: 20, days: 45 }, circles: true, detail: `${m.name} accepted ${Math.round(lb.ratio * 100)}% of their ask ${Math.round((state.day - lb.day) / 30)} months ago and has now resigned. Replacing them costs ~$${Math.round(replace).toLocaleString('en-US')} plus a new ramp; the salary saved on the offer is gone.` });
  }
}

/** Daily tick for the ops systems. */
export function opsDay(state, p) {
  ensureOps(state);
  finesDay(state);
  for (const m of p.members) if (m.status === 'offer' && m.ops?.renegeDay != null) renegeCheck(state, m);
  onboardingDay(state, p);
  offboardingDay(state);
  absenceDay(state, p);
  workplaceDay(state);
}

/** Monday: refresh the per-person multipliers the weekly morale and the monthly attrition read. */
export function opsWeekly(state, p) {
  const o = ensureOps(state);
  const wp = o.workplace;
  const pkg = packageFor(state);
  for (const m of humansOf(p)) {
    if (m.status !== 'active') continue;
    const lb = m.ops?.lowball;
    let a = 1;
    if (lb && state.day - lb.day <= 560) a *= lb.attr;
    a *= m.ops?.peerAttr ?? 1;
    a *= m.ops?.deniedAttr ?? 1;
    a *= workplaceAttrMult(state, m);
    if (wp.offsiteUntil > state.day) a *= 0.9;
    if (o.benefits.configured && m.engagement !== 'contractor') a *= clamp(1 + (0.8 - pkg.score) * 0.5, 0.9, 1.15);
    m.opsAttr = round2(a);
    // deny strikes fade after the window
    if (m.ops?.deniedAttr && !(m.abs?.denied ?? []).some((x) => state.day - x.day <= 180 && !x.alt)) delete m.ops.deniedAttr;
    // a founder who is the buddy spends an hour a week for the first month
    const b = m.onboarding?.items?.buddy;
    if (b?.who === 'founder' && state.day - m.startDay < 28) chargeHours(state, 1, `Buddy: ${m.name}`);
  }
  // Solo remote founder: isolation drains energy; coworking day passes or a desk limit it.
  const drain = isolationDrain(state);
  wp.isolation = drain;
  if (drain > 0) state.founder.energy = clamp(state.founder.energy - drain, 0, 100);
}

/** Morale target shift for a person from ops factors. */
export function opsMoraleShift(state, m) {
  const o = state.apps.people?.ops;
  if (!o) return 0;
  let s = 0;
  const lb = m.ops?.lowball;
  if (lb) s -= lb.morale * clamp(1 - (state.day - lb.day) / 365, 0, 1);
  if (m.ops?.peerGap) s -= 3;
  if (o.workplace.offsiteUntil > state.day) s += 2;
  const st = o.benefits.stipends;
  if (o.benefits.configured && (st.home || st.learning || st.wellness)) s += 1;
  return round2(s);
}

export function opsMonthEnd(state, p) {
  ensureOps(state);
  syncBenefitBills(state);
  syncWorkplaceBills(state);
  onboardingMonthEnd(state, p);
  sickLeaveGapCheck(state);
  workplaceMonthEnd(state);
}

export { activePolicy, headsFor };
