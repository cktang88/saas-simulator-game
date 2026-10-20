// Compliance calendar + filing math. Pure functions over state (no posting here).

import { DELAWARE, PROVIDERS, OPERATING_STATES, ONE_099, SOC2, FOUNDER_STOCK } from './catalog.js';
import { filingPaid } from './api.js';
import { dateOf } from '../../core/util.js';
import { poolTotal } from '../fundraising/captable.js';

const DAY_MS = 86400000;
export const dayFor = (state, iso) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${state.startDate}T12:00:00Z`)) / DAY_MS);
export const yearOf = (state, day = state.day) => dateOf(state, day).getUTCFullYear();

// Delaware franchise tax — Authorized Shares Method (the default bill).
export function franchiseAuthorizedShares(authorized) {
  let tax;
  if (authorized <= 5000) tax = 175;
  else if (authorized <= 10000) tax = 250;
  else tax = 250 + 85 * Math.ceil((authorized - 10000) / 10000);
  return Math.min(DELAWARE.maxTax, tax);
}

// Assumed Par Value Capital Method: $400 per $1M (or part) of assumed par value capital, min $400.
export function franchiseAPVC({ grossAssets, issuedShares, authorized, par = 0.00001 }) {
  if (!(issuedShares > 0)) return null;
  const assumedPar = Math.max(grossAssets / issuedShares, par);
  const apvc = assumedPar * authorized;
  return Math.min(DELAWARE.maxTax, Math.max(DELAWARE.apvcMin, Math.ceil(apvc / 1e6) * DELAWARE.apvcPerMillion));
}

// Shares for the Delaware franchise tax at Dec 31 of `year` (null = today). The APVC method counts every issued and
// outstanding share: the founder's stock (Legal's ledger), co-founders, other common (accelerator, advisors) and
// preferred from priced rounds. Options (granted or reserved) and unconverted SAFEs are not issued stock. A priced
// round amends the charter to authorize the new preferred and the pool, so authorized never sits below issued + pool.
export function delawareShares(state, year = null) {
  const fs = state.apps.legal?.founderStock;
  const cap = state.apps.fundraising?.cap;
  const authorized0 = fs?.authorized ?? FOUNDER_STOCK.authorized, par = fs?.par ?? FOUNDER_STOCK.par;
  const founder = fs?.issued ?? 0;
  if (!founder || !cap) return { issued: founder, authorized: authorized0, par, founder };
  const end = year != null ? dayFor(state, `${year}-12-31`) : Infinity;
  const by = (day) => day == null || day <= end;
  const sum = (arr, ok) => (arr ?? []).filter(ok).reduce((a, x) => a + (x.shares ?? 0), 0);
  const cofounders = sum(cap.founders, (f) => f.cofounderId != null && by(f.vesting?.startDay));
  const common = sum(cap.common, () => true);
  const preferred = sum(cap.preferred, (p) => by(p.day));
  const issued = Math.round(founder + cofounders + common + preferred);
  const authorized = Math.max(authorized0, Math.round(issued + Math.max(0, poolTotal(cap))));
  return { issued, authorized, par, founder, cofounders, common, preferred };
}

// Delaware late filing: $200 + 1.5% per month (or part) of tax.
export function delawareLate(tax, daysLate) {
  if (daysLate <= 0) return 0;
  return DELAWARE.latePenalty + tax * DELAWARE.lateInterestMonthly * Math.ceil(daysLate / 30);
}

export function late1099(perFormCount, daysLate) {
  if (daysLate <= 0) return 0;
  const tier = ONE_099.late.find(([d]) => daysLate <= d);
  return perFormCount * tier[1];
}

// Cash + Stripe balance at Dec 31 of `year` from the metrics snapshots (what "gross assets" means for a tiny startup).
export function grossAssetsAt(state, year) {
  const d = dayFor(state, `${year}-12-31`);
  const snap = [...state.metrics.daily].reverse().find((x) => x.day <= d);
  return snap ? Math.max(0, snap.cash + (snap.stripeBalance ?? 0)) : 0;
}

export const deadline83b = (grantDay) => grantDay + 30;

// Contractor payments made outside the People app (Bank → Send money ACH/wire to a freelancer, an advisor's fee...)
// still need a 1099-NEC. Card payments are reported by the card network (1099-K) and platforms (Deel, Upwork...)
// issue their own forms, so neither counts. People-app payments are counted from the member record.
export const PLATFORM_1099 = /deel|upwork|fiverr|contra|toptal|remote\.com/i;
export function directContractorPayments(state, year, catOf = (t) => t.category) {
  const out = {};
  for (const t of state.bank?.txns ?? []) {
    if (!(t.amount < 0) || t.method === 'card' || t.meta?.app === 'people' || PLATFORM_1099.test(t.counterparty ?? '')) continue;
    if (catOf(t) !== 'contractors' || yearOf(state, t.day) !== year) continue;
    out[t.counterparty] = (out[t.counterparty] ?? 0) - t.amount;
  }
  return out;
}

// Payments ≥ $2,000 to US contractors in `year` (2026+ threshold): People-app contractors plus direct bank payments.
export function forms1099(state, year) {
  const people = (state.apps.people?.members ?? []).filter((m) => m.engagement === 'contractor' && m.region === 'us' && (m.paidByYear?.[year] ?? 0) >= ONE_099.threshold)
    .map((m) => ({ id: m.id, name: m.name, amount: m.paidByYear[year] }));
  const direct = Object.entries(directContractorPayments(state, year)).filter(([name, amount]) => amount >= ONE_099.threshold && !people.some((p) => p.name === name))
    .map(([name, amount]) => ({ id: `payee:${name}`, name, amount: Math.round(amount * 100) / 100 }));
  return [...people, ...direct];
}

/**
 * The compliance calendar for the next ~14 months plus anything overdue.
 * Item: { key, title, dueDay, amount, category, kind: 'action'|'auto'|'info', note, status }
 */
export function buildCalendar(state) {
  const L = state.apps.legal ?? {};
  const items = [];
  const inc = L.incorporation?.status === 'done' ? L.incorporation : null;
  const y0 = yearOf(state, 0), y1 = yearOf(state) + 1;
  const entity = state.company.incorporated ? state.company.entity : 'none';
  const add = (it) => items.push({ kind: 'action', category: 'taxes', amount: 0, note: '', ...it });

  for (let y = y0; y <= y1; y++) {
    const formedBefore = (iso) => inc && inc.effectiveDay < dayFor(state, iso);
    if (entity === 'ccorp' && formedBefore(`${y}-01-01`)) {
      add({ key: `de-franchise-${y}`, title: `Delaware annual report + franchise tax (${y - 1})`, dueDay: dayFor(state, `${y}-03-01`), amount: DELAWARE.apvcMin + DELAWARE.annualReportFee, note: 'Default bill uses the Authorized Shares Method; recompute with Assumed Par Value Capital. Late: $200 + 1.5%/mo.' });
    }
    if (entity === 'llc' && inc?.jurisdiction === 'DE' && formedBefore(`${y}-01-01`)) {
      add({ key: `de-llc-tax-${y}`, title: `Delaware LLC annual tax (${y - 1})`, dueDay: dayFor(state, `${y}-06-01`), amount: DELAWARE.llcTax, note: '$400 for tax year 2026 (HB 400). No annual report.' });
    }
    const st = OPERATING_STATES[inc?.operatingState];
    if (st?.annual && formedBefore(`${y}-01-01`)) {
      add({ key: `state-${inc.operatingState}-${y}`, title: st.name, dueDay: dayFor(state, `${y}-${st.due}`), amount: st.annual, note: 'Approximate state fee; verify with the state.' });
    }
    {
      const forms = forms1099(state, y - 1);
      if (forms.length) add({ key: `1099-${y}`, title: `1099-NEC to ${forms.length} US contractor${forms.length > 1 ? 's' : ''} (${y - 1} payments ≥ $2,000)`, dueDay: dayFor(state, `${y}-01-31`), amount: forms.length * ONE_099.perForm, category: 'accounting', note: 'Due to recipients and the IRS by Jan 31. Collect W-9s up front.' });
    }
    if (entity === 'ccorp' && formedBefore(`${y}-01-01`)) {
      add({ key: `form-1120-${y}`, title: `Federal C-corp return Form 1120 (${y - 1})`, dueDay: dayFor(state, `${y}-04-15`), kind: 'info', category: 'accounting', note: 'Your CPA / Books app. Form 7004 extends 6 months. Foreign-owned: Form 5472 too ($25k penalty).' });
    }
  }

  if (inc) {
    const p = PROVIDERS[inc.provider];
    // Every anniversary up to next year's (it was only ever years 1-2, so from year 3 the agent was free forever).
    const years = Math.max(0, Math.floor((state.day - inc.effectiveDay) / 365)) + 1;
    for (let n = 1; n <= Math.max(2, years); n++) {
      const due = inc.effectiveDay + 365 * n;
      if (p.agentAnnual > 0) add({ key: `agent-${n}`, title: `Registered agent renewal (${p.label})`, dueDay: due, amount: p.agentAnnual, category: 'legal', kind: 'auto', note: 'Auto-renews; a Delaware entity must keep a registered agent.' });
    }
  }
  const fs = L.founderStock;
  if (fs && !fs.filed83b) add({ key: '83b', title: '83(b) election for founder stock', dueDay: deadline83b(fs.grantDay), category: 'taxes', note: 'Within 30 days of the stock grant. No extensions, no fix. File online with Form 15620 (IRS account) or by certified mail.' });
  if (L.kyc && !L.kyc.done) add({ key: 'kyc', title: 'Move bank & Stripe to the company (KYC update)', dueDay: L.kyc.dueDay, kind: 'action', category: 'legal', note: 'Commingling personal and company money weakens the liability shield.' });
  for (const tm of L.trademarks ?? []) {
    if (tm.status === 'office_action') add({ key: `tm-oa-${tm.id}`, title: `Trademark office action response: ${tm.mark}`, dueDay: tm.responseDue, category: 'legal', note: 'Miss it and the application is abandoned.' });
  }
  for (const d of L.dsrs ?? []) if (d.status === 'open') add({ key: `dsr-${d.id}`, title: `Data-subject ${d.type} request from ${d.name}`, dueDay: d.dueDay, category: 'legal', note: d.regime === 'ccpa' ? 'CCPA: 45 days (10 business days to acknowledge); one 45-day extension with notice.' : 'GDPR: one month; up to two more months for complex requests, with notice inside the first month.' });
  if (L.soc2 === 'type2' && L.soc2Plan?.doneDay != null) add({ key: `soc2-renew-${L.soc2Plan.doneDay}`, title: 'SOC 2 Type II report expires (renew audit)', dueDay: L.soc2Plan.doneDay + 365, kind: 'info', category: 'legal', amount: SOC2.type2Audit });
  if (L.aiFeatures) {
    for (const [k, label] of [['disclosure', 'EU AI Act Art. 50 AI-interaction disclosure'], ['marking', 'EU AI Act Art. 50(2) AI-content marking']]) {
      if (!L.aiAct?.[k]) add({ key: `ai-act-${k}`, title: label, dueDay: dayFor(state, k === 'disclosure' ? '2026-08-02' : '2026-12-02'), category: 'legal', kind: 'action', note: 'Applies if EU users interact with your AI features.' });
    }
    if (L.aiHighRisk && !L.aiAct?.highRisk) add({ key: 'ai-act-annex3', title: 'EU AI Act Annex III high-risk obligations', dueDay: dayFor(state, '2027-12-02'), category: 'legal', note: 'Your AI touches a high-risk area (e.g. hiring, credit).' });
  }

  for (const it of items) {
    const paid = filingPaid(state, it.key) || L.done?.[it.key];
    it.status = paid ? 'done' : state.day > it.dueDay ? 'overdue' : it.dueDay - state.day <= 30 ? 'due' : 'upcoming';
  }
  // A franchise tax paid on the Authorized Shares notice stays listed until it is amended and refunded, so the
  // Amend action (and the pending refund) stays reachable after the 60-day window.
  const amendPending = (it) => { const p = L.paidFilings?.[it.key]; return p?.method === 'billed' && (p.tax ?? 0) > DELAWARE.apvcMin && !p.amended?.received; };
  return items.filter((it) => it.status !== 'done' || state.day - it.dueDay < 60 || amendPending(it)).sort((a, b) => a.dueDay - b.dueDay);
}
