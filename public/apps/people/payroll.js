// Payroll math (Gusto + Deel style). Pure functions plus the posting routine used by the daily tick.
// US employees: semi-monthly runs on the 15th and the last day of the month, gross wages → bank 'payroll',
// employer taxes & benefits (burden) → 'payroll_tax'. International employees run through an EOR
// (Deel) with a statutory load. Contractors invoice monthly and are paid via 'contractors'.

import { post } from '../../core/bank.js';
import { dayOfMonth, isLastDayOfMonth, round2, dateOf } from '../../core/util.js';
import { employerAnnual, EOR_LOAD, VENDORS, SEVERANCE } from './catalog.js';
import { expectedVariable, planFor, planKeyOf } from './comp.js';
import { fxFeePct, postFxFee } from './global.js';
import { unpaidDays } from './absence.js';

const FICA_ON_COMMISSION = 0.0765;
export const isHuman = (m) => m.kind !== 'ai_agent';
// Last day a member is on payroll (inclusive), or Infinity.
export const lastWorkDay = (m) => m.endDay ?? Infinity;

// The pay period ending on `day` if it is a pay date, else null. { start, end } in game days, inclusive.
export function payPeriod(state, day = state.day) {
  const dom = dayOfMonth(state, day);
  if (dom === 15) return { start: day - 14, end: day };
  if (isLastDayOfMonth(state, day)) return { start: day - (dom - 16), end: day };
  return null;
}

// Days of [start, end] the member was employed.
export function daysWorked(m, start, end) {
  const a = Math.max(start, m.startDay);
  const b = Math.min(end, lastWorkDay(m));
  return Math.max(0, b - a + 1);
}

// Monthly employer cost of a member (fully loaded, excluding one-off fees and per-payment FX fees: see monthlyFxOf).
export function monthlyCostOf(state, m) {
  if (m.kind === 'ai_agent') return m.monthlyCost ?? 0;
  if (m.engagement === 'cofounder') return 0; // unpaid co-founder: equity only
  if (m.engagement === 'contractor') {
    const fee = m.region === 'us' ? VENDORS.gusto.perPerson : m.cor ? VENDORS.deel.cor : VENDORS.deel.contractor;
    return round2((m.hourlyRate * m.hoursPerWeek * 52) / 12 * (1 + (m.platformFeePct ?? 0)) + fee + (m.stipend ? 60 : 0));
  }
  const variable = m.kind === 'cofounder' || !planKeyOf(m) ? 0 : expectedVariable(planFor(state, planKeyOf(m))); // expected variable pay from the comp plan (people/comp.js)
  const gross = ((m.salary ?? 0) + variable) / 12;
  if (m.engagement === 'eor') return round2(gross * (1 + (EOR_LOAD[m.region] ?? 0.25)) + VENDORS.deel.eor + (m.stipend ? 60 : 0));
  return round2(gross + employerAnnual(state, m.salary + variable, { hours: m.hoursPerWeek ?? 40 }) / 12 + VENDORS.gusto.perPerson);
}

// Recurring FX and payout fees on a member's pay (Deel, 1-3% per payout by region [design]); a US member has none.
export function monthlyFxOf(state, m) {
  if (m.kind === 'ai_agent' || m.engagement === 'cofounder' || !m.region || m.region === 'us') return 0;
  if (m.engagement === 'contractor') return round2((m.hourlyRate * m.hoursPerWeek * 52) / 12 * fxFeePct(m.region));
  if (m.engagement === 'eor') return round2(((m.salary ?? 0) / 12) * fxFeePct(m.region));
  return 0;
}

// Payroll lines for one semi-monthly period.
export function payrollLines(state, members, { start, end }) {
  const len = end - start + 1;
  const lines = [];
  for (const m of members) {
    if (m.kind === 'ai_agent' || m.engagement === 'contractor' || m.engagement === 'cofounder') continue;
    if (m.status === 'offer') continue;
    // A converted contractor is on salary only from the conversion day (earlier days were invoiced as a contractor).
    // Unpaid leave (parental beyond the paid weeks, long medical leave) is not paid for those days (people/absence.js).
    const worked = daysWorked(m.convertedDay != null ? { ...m, startDay: Math.max(m.startDay, m.convertedDay) } : m, start, end) - (state.apps.people?.ops?.absences?.length ? unpaidDays(state, m, start, end) : 0);
    // Commission settled before someone left is still wages owed: pay it with the next run even with no days worked.
    if (worked <= 0 && !((m.commissionDue ?? 0) > 0)) continue;
    const share = Math.max(0, worked) / len;
    // Base only: variable pay is whatever the rep's comp plan earned (m.commissionDue, people/comp.js).
    const gross = round2((((m.salary ?? 0)) / 24) * share + (m.commissionDue ?? 0));
    const employer = m.engagement === 'eor' ? gross * (EOR_LOAD[m.region] ?? 0.25) : (employerAnnual(state, m.salary ?? 0, { hours: m.hoursPerWeek ?? 40 }) / 24) * share + (m.commissionDue ?? 0) * FICA_ON_COMMISSION;
    lines.push({ memberId: m.id, name: m.name, engagement: m.engagement, gross, employer: round2(employer), commission: m.commissionDue ?? 0 });
  }
  return lines;
}

// Run payroll if today is a pay date. Returns the run record or null.
export function runPayrollIfDue(state, p) {
  const members = p.members;
  const period = payPeriod(state);
  if (!period) return null;
  const lines = payrollLines(state, p.members, period);
  if (!lines.length) return null;
  const us = lines.filter((l) => l.engagement === 'employee');
  const eor = lines.filter((l) => l.engagement === 'eor');
  const sum = (a, k) => round2(a.reduce((x, l) => x + l[k], 0));
  const label = `${dateOf(state, period.start).toISOString().slice(5, 10)}–${dateOf(state, period.end).toISOString().slice(5, 10)}`;
  if (us.length) {
    post(state, { amount: -round2(sum(us, 'gross') - sum(us, 'commission')), counterparty: 'Gusto', description: `GUSTO NET PAY + WITHHOLDING ${label} (${us.length})`, category: 'payroll', method: 'payroll', meta: { app: 'people' } });
    if (sum(us, 'commission') > 0) post(state, { amount: -sum(us, 'commission'), counterparty: 'Gusto', description: `GUSTO COMMISSIONS ${label} (${us.filter((l) => l.commission > 0).length})`, category: 'payroll', method: 'payroll', meta: { app: 'people', commission: true } });
    post(state, { amount: -sum(us, 'employer'), counterparty: 'Gusto', description: `GUSTO TAX & BENEFITS ${label}`, category: 'payroll_tax', method: 'payroll', meta: { app: 'people' } });
  }
  if (eor.length) {
    post(state, { amount: -round2(sum(eor, 'gross') - sum(eor, 'commission')), counterparty: 'Deel', description: `DEEL EOR PAYROLL ${label} (${eor.length})`, category: 'payroll', method: 'payroll', meta: { app: 'people' } });
    if (sum(eor, 'commission') > 0) post(state, { amount: -sum(eor, 'commission'), counterparty: 'Deel', description: `DEEL EOR COMMISSIONS ${label}`, category: 'payroll', method: 'payroll', meta: { app: 'people', commission: true } });
    post(state, { amount: -sum(eor, 'employer'), counterparty: 'Deel', description: `DEEL EOR EMPLOYER COSTS ${label}`, category: 'payroll_tax', method: 'payroll', meta: { app: 'people' } });
    for (const l of eor) { const mm = members.find((x) => x.id === l.memberId); if (mm) postFxFee(state, mm, l.gross, 'EOR PAYROLL'); }
  }
  for (const m of p.members) if (lines.some((l) => l.memberId === m.id)) m.commissionDue = 0;
  const run = { day: state.day, start: period.start, end: period.end, gross: sum(lines, 'gross'), employer: sum(lines, 'employer'), lines };
  p.runs.unshift(run);
  if (p.runs.length > 48) p.runs.length = 48;
  return run;
}

// Contractor invoices for the calendar month ending today (month end). Records yearly totals for 1099s.
export function payContractors(state, p) {
  if (!isLastDayOfMonth(state)) return [];
  const dom = dayOfMonth(state);
  const start = state.day - dom + 1, end = state.day;
  const paid = [];
  for (const m of p.members) {
    if (m.engagement !== 'contractor' || m.status === 'offer') continue;
    const r = contractorInvoice(state, m, start, end);
    if (r) paid.push(r);
  }
  return paid;
}

// Invoice and pay one contractor for the days of [start, end] they worked (also used when converting to an employee).
export function contractorInvoice(state, m, start, end) {
  const worked = daysWorked(m, start, end);
  if (!worked) return null;
  const amount = round2(m.hourlyRate * m.hoursPerWeek * (worked / 7));
  const fee = round2(amount * (m.platformFeePct ?? 0));
  post(state, {
    amount: -(amount + fee), counterparty: m.region === 'us' ? m.name : 'Deel',
    description: m.region === 'us' ? `Contractor invoice ${m.name}` : `DEEL CONTRACTOR PAYMENT ${m.name}`,
    category: 'contractors', method: 'ach', meta: { app: 'people', memberId: m.id },
  });
  postFxFee(state, m, amount, 'CONTRACTOR');
  const year = dateOf(state, end).getUTCFullYear();
  m.paidByYear ??= {};
  m.paidByYear[year] = round2((m.paidByYear[year] ?? 0) + amount);
  return { memberId: m.id, amount, fee };
}

// Severance: weeks of base pay plus COBRA support for the same period [A].
export function severanceCost(m, weeks) {
  if (m.engagement === 'contractor' || m.kind === 'ai_agent') return 0;
  const weekly = (m.salary ?? 0) / 52;
  const cobra = m.engagement === 'employee' ? SEVERANCE.cobraMonthly * (weeks / 4.33) : 0;
  return round2(weekly * weeks + cobra);
}

// Monthly vendor bills derived from headcount.
export function vendorBills(members) {
  const live = members.filter((m) => m.kind !== 'ai_agent' && (m.status === 'active' || m.status === 'offer'));
  const usEmp = live.filter((m) => m.engagement === 'employee').length;
  const usCon = live.filter((m) => m.engagement === 'contractor' && m.region === 'us').length;
  const intlCon = live.filter((m) => m.engagement === 'contractor' && m.region !== 'us');
  const eor = live.filter((m) => m.engagement === 'eor').length;
  const gusto = usEmp ? VENDORS.gusto.base + VENDORS.gusto.perPerson * (usEmp + usCon) : usCon ? VENDORS.gusto.contractorOnlyBase + VENDORS.gusto.perPerson * usCon : 0;
  const deel = intlCon.reduce((a, m) => a + (m.cor ? VENDORS.deel.cor : VENDORS.deel.contractor), 0) + eor * VENDORS.deel.eor;
  return { gusto, deel, usEmp, usCon, intlCon: intlCon.length, eor };
}
