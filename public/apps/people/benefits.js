// Company benefits policy: health (none / QSEHRA / ICHRA / small-group / PEO), dental and vision, 401(k) with provider fee and
// match, stipends and a PTO policy (accrued days, unlimited, or statutory only). Costs are KFF 2025 premiums trended by the
// 2026 small-group increases (ops-data.js); the payroll burden reads this policy once the player configures it
// (catalog.js benefitsFor). Accrued PTO is a balance-sheet liability and is paid out at termination in California.
//
// Mistakes (functionId people_ops): no_health_benefits_lost_candidate, pto_payout_owed, state_sick_leave_gap.

import { notify } from '../../core/state.js';
import { post, addRecurring } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { clamp, round2 } from '../../core/util.js';
import { QSEHRA, PEO, K401, DEFAULT_BENEFITS, STATE_SICK, PTO_PAYOUT_STATES, EOR_LEAVE, healthCost, benefitsAnnual, k401Fee, packageScore, premiumTotals, ABS } from './ops-data.js';
import { ensureOps, employeesOf, humansOf } from './ops-state.js';
import { householdOf } from './negotiation.js';

export const benefitsOf = (state) => ensureOps(state).benefits;
const companyState = (state) => state.apps.people?.ops?.workplace?.state ?? state.apps.legal?.incorporation?.operatingState ?? null;
export const workStateOf = (state, m) => m.workState ?? companyState(state);

/** The health benefit as it actually works today: carriers and PEOs have minimum enrollment, QSEHRA is for small employers only. */
export function healthStatus(state, b = benefitsOf(state)) {
  const p = state.apps.people;
  const staff = employeesOf(p).filter((m) => m.region === 'us').length + (p.members ?? []).filter((m) => m.status === 'offer' && m.engagement === 'employee').length;
  const h = b.health;
  if (h.mode === 'none') return { active: false, note: 'No health benefit offered.' };
  if (h.mode === 'peo' && staff < PEO.minEnrolled) return { active: false, note: `The PEO's carrier needs at least ${PEO.minEnrolled} enrolled employees before coverage starts (small-group minimums are carrier-specific).` };
  if (h.mode === 'group' && staff < 1) return { active: false, note: 'A small-group plan needs at least one W-2 employee who is not an owner or spouse.' };
  if (h.mode === 'qsehra' && staff > QSEHRA.maxFte) return { active: false, note: `QSEHRA is for employers under 50 full-time-equivalent staff.` };
  return { active: true, note: '' };
}

/** Policy used for costs: a health benefit that cannot start costs nothing and counts for nothing. */
export function activePolicy(state) {
  const b = benefitsOf(state);
  if (!b.configured) return b;
  const hs = healthStatus(state, b);
  return hs.active ? b : { ...b, health: { ...b.health, mode: 'none' } };
}

export function setBenefits(state, patch) {
  const o = ensureOps(state);
  const b = o.benefits;
  const h = { ...b.health, ...(patch.health ?? {}) };
  if (patch.health) {
    h.contribPct = clamp(Number(h.contribPct), 0, 1);
    h.depPct = clamp(Number(h.depPct), 0, 1);
    h.allowance = Math.max(0, Math.round(Number(h.allowance) || 0));
    h.waitingDays = clamp(Math.round(Number(h.waitingDays) || 0), 0, 90);
    if (!['none', 'qsehra', 'ichra', 'group', 'peo'].includes(h.mode)) throw new Error('Pick a health option.');
    if (h.mode === 'qsehra' && employeesOf(state.apps.people).length > QSEHRA.maxFte) throw new Error('QSEHRA is for employers under 50 FTEs.');
  }
  const next = {
    ...b, ...patch, configured: true, health: h,
    k401: { ...b.k401, ...(patch.k401 ?? {}) },
    stipends: { ...b.stipends, ...(patch.stipends ?? {}) },
    pto: { ...b.pto, ...(patch.pto ?? {}) },
  };
  if (!['accrued', 'unlimited', 'statutory'].includes(next.pto.mode)) throw new Error('Pick a PTO policy.');
  next.pto.daysPerYear = clamp(Math.round(Number(next.pto.daysPerYear) || 0), 0, 40);
  next.pto.holidays = clamp(Math.round(Number(next.pto.holidays) || 0), 0, 13);
  next.pto.parentalPaidWeeks = clamp(Math.round(Number(next.pto.parentalPaidWeeks) || 0), 0, 26);
  next.k401.matchPct = clamp(Number(next.k401.matchPct) || 0, 0, 0.06);
  Object.assign(b, next);
  syncBenefitBills(state);
  return b;
}

/** 401(k) provider bill as a recurring monthly charge (base + per-head). */
export function syncBenefitBills(state) {
  const o = ensureOps(state);
  const heads = employeesOf(state.apps.people).filter((m) => m.region === 'us').length;
  const amount = k401Fee(o.benefits, heads);
  let r = state.recurring.find((x) => x.id === o.rec.k401);
  if (amount > 0 && !r) { r = addRecurring(state, { vendor: `${K401[o.benefits.k401.provider].label} 401(k)`, amount, category: 'software', dayOfMonth: 3, note: '401(k) provider fee' }); o.rec.k401 = r.id; }
  if (r) { r.amount = round2(amount); r.active = amount > 0; }
  return amount;
}

/** Monthly cost summary for the policy (per eligible employee and for the company today). */
export function benefitCostSummary(state) {
  const b = activePolicy(state);
  const wp = ensureOps(state).workplace;
  const a = benefitsAnnual(state, b, { remote: wp.mode !== 'lease' });
  const emp = employeesOf(state.apps.people).filter((m) => m.region === 'us');
  const salaryTotal = emp.reduce((s, m) => s + (m.salary ?? 0), 0);
  const match = b.k401?.on ? (b.k401.matchPct ?? 0) * K401.participation * salaryTotal : 0;
  const perMonth = round2(a.total / 12);
  return {
    perEmployeeMonth: perMonth, healthMonth: round2(a.health / 12), dentalMonth: round2(a.dental / 12), stipendsMonth: round2(a.stipends / 12),
    k401FeeMonth: k401Fee(b, emp.length), matchMonth: round2(match / 12), companyMonth: round2(perMonth * emp.length + k401Fee(b, emp.length) + match / 12),
    employees: emp.length, healthStatus: healthStatus(state), premium: premiumTotals(state), health: healthCost(state, b.health),
  };
}

/** Candidate-facing package score (0..1.2) and how it moves acceptance, from the configured policy. */
export const packageFor = (state, { family = false } = {}) => packageScore(state, activePolicy(state), { family });

/** A candidate who passes on the offer when the package is the reason: log it. Called on decline. */
export function benefitsDeclineCheck(state, c) {
  const b = activePolicy(state);
  if (!b.configured || c.engagement === 'contractor') return null;
  const family = householdOf(state, c) === 'family';
  const pk = packageScore(state, b, { family });
  if (pk.health > 0.3) return null;
  const ask = c.offer?.expectation ?? c.expectation;
  if ((c.offer?.salary ?? 0) < ask * 0.9 && !family) return null; // pay was the likelier reason
  return logMistake(state, { functionId: 'people_ops', id: 'no_health_benefits_lost_candidate', label: 'Lost a candidate over health benefits', app: 'people', key: `nohealth:${c.id}`, cost: { hours: 8, days: 21 }, delayed: true, detail: `${c.name}${family ? ' (family coverage matters to them)' : ''} turned down the offer; the company offers ${b.health.mode === 'none' ? 'no health benefit' : 'a health benefit that is too thin to count'}. In the US a paid employee-only plan is table stakes; QSEHRA, ICHRA, a small-group plan or a PEO plan fixes it for a few hundred dollars a month per person.` });
}

// ---------------------------------------------------------------------------
// PTO
// ---------------------------------------------------------------------------

/** Vacation days a person can plan per year under the policy (statutory floor for EOR hires). */
export function annualDays(state, m, b = benefitsOf(state)) {
  const stat = m.region && m.region !== 'us' ? EOR_LEAVE[m.region]?.annual ?? 20 : 0;
  if (stat) return b.pto.mode === 'accrued' ? Math.max(stat, b.pto.daysPerYear) : stat;
  return b.pto.mode === 'accrued' ? b.pto.daysPerYear : b.pto.mode === 'unlimited' ? Infinity : 0;
}

export const ptoApplies = (m) => m.kind !== 'ai_agent' && m.kind !== 'cofounder' && (m.engagement === 'employee' || m.engagement === 'eor');
export const dailyRate = (m) => (m.salary ?? 0) / 260;

export function ptoBalance(m) { return round2(m.abs?.bal ?? 0); }

/** Accrued PTO owed to US employees: a liability on the balance sheet (ASC 710). */
export function ptoLiability(state) {
  const b = benefitsOf(state);
  if (b.pto.mode !== 'accrued') return 0;
  return round2(employeesOf(state.apps.people).filter((m) => m.engagement === 'employee').reduce((a, m) => a + ptoBalance(m) * dailyRate(m), 0));
}

/** On exit: pay accrued PTO where the state treats it as wages (California). Posts to the bank and logs the mistake-cost. */
export function ptoPayoutOnExit(state, m) {
  const b = benefitsOf(state);
  if (b.pto.mode !== 'accrued' || m.engagement !== 'employee' || !m.salary) return 0;
  const st = workStateOf(state, m);
  const bal = ptoBalance(m);
  if (!(bal > 0.01)) return 0;
  const owes = Boolean(PTO_PAYOUT_STATES[st]);
  if (!owes) { m.abs.bal = 0; return 0; }
  const amount = round2(bal * dailyRate(m));
  post(state, { amount: -amount, counterparty: 'Gusto', description: `Final pay: ${bal} days accrued PTO payout (${st}): ${m.name}`, category: 'payroll', method: 'payroll', meta: { app: 'people' } });
  m.abs.bal = 0;
  logMistake(state, { functionId: 'people_ops', id: 'pto_payout_owed', label: 'Accrued PTO paid out at exit', app: 'people', key: `ptopay:${m.id}`, delayed: true, cost: { usd: amount, hours: 0.5 }, detail: `${m.name} left with ${bal} days of accrued PTO. ${st} treats vested vacation as wages, paid out at separation (and no use-it-or-lose-it forfeiture). That is $${amount.toLocaleString('en-US')} nobody budgeted. An unlimited policy has no balance to pay out; an accrued policy needs the liability tracked and a cap on carryover.` });
  return amount;
}

/** Monthly compliance check: an accrued policy below a state's paid sick leave mandate. */
export function sickLeaveGapCheck(state) {
  const b = benefitsOf(state);
  if (!b.configured || b.pto.mode !== 'accrued') return [];
  const gaps = [];
  for (const m of employeesOf(state.apps.people)) {
    if (m.region !== 'us') continue;
    const st = workStateOf(state, m);
    const law = STATE_SICK[st];
    if (!law) continue;
    const hours = b.pto.daysPerYear * 8;
    if (hours < law.hours) {
      gaps.push({ memberId: m.id, state: st, mandate: law.hours, have: hours });
      logMistake(state, { functionId: 'people_ops', id: 'state_sick_leave_gap', label: `PTO policy below ${law.label} paid sick leave`, app: 'people', key: `sickgap:${st}`, delayed: true, cost: { usd: 1500, hours: 3 }, detail: `${law.label} requires ${law.hours} hours of paid sick leave a year [${law.src}]; the accrued policy gives ${b.pto.daysPerYear} days (${hours} hours). Back pay and penalties follow a complaint. Raise the accrual or add statutory sick leave.` });
    }
  }
  return gaps;
}

/** What a person's state requires (hours/year of paid sick leave), for the UI. */
export const sickMandate = (state, m) => (m.region === 'us' ? STATE_SICK[workStateOf(state, m)] ?? null : null);
export { ABS };
