// Tax & compliance calendar for the Books app (US-centric, general information — not tax advice).
// Dates and amounts: docs/research/finance-and-payments.md §4 and §7 (compliance calendar).
// Pure state transitions; the Books app wraps them in ctx.act with founder hours.

import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { ensureStripe } from '../../core/stripe.js';
import { dayForIso, yearOf, monthOf, sumBy, monthsBetween } from './common.js';
import { ensureBooks, ledgerByMonth, profitAndLoss, balanceSheet, bookCategory, misclassified, unclosedMonths } from './ledger.js';

export const TAX = {
  // Delaware (corp.delaware.gov, checked 2026-10-14)
  deAnnualReportFee: 50,
  deLatePenalty: 200,
  deInterestPerMonth: 0.015,
  deMinTax: 400,
  deMaxTax: 200000,
  deLlcTax: 300,
  // IRS
  form1099Threshold: 2000, // payments made in 2026 and later (OBBBA, 2025)
  form1099EfilePerForm: 3, // e-file service per form [design: Track1099/Tax1099-style pricing]
  form1099Penalty: { within30: 60, late: 130, after: 340 }, // per form, 2026 IRS amounts (indexed annually)
  corpRate: 0.21,
  nolLimit: 0.8, // post-2017 NOLs offset up to 80% of taxable income
  underpaymentRate: 0.07, // IRS underpayment interest ≈ 7%/yr in 2026 [approximate]
  cpaBase: { ccorp: 1500, llc: 600, none: 0 }, // research: C-corp return with a CPA $1,000–$3,500 [designer estimate]
  cpaCatchUpPerMonth: 250, // catch-up bookkeeping per month not closed [design]
  cpaPerMisclass: 15, // CPA time fixing miscategorized transactions [design]
  // Sales tax / VAT
  nexusDefault: 100000,
  nexusHigh: { CA: 500000, TX: 500000, NY: 500000 },
  salesTaxRate: 0.065, // average combined rate applied to back-tax estimates [design]
  backTaxPenalty: 0.1, // [design]
  vatRegistrationCost: 0, // Non-Union OSS registration is free; time is the cost
};
// States that tax SaaS (research §4.3: TX (80%), NY, PA, WA, OH, TN "and others"; sources conflict — check each state).
export const SAAS_TAXABLE = new Set(['TX', 'NY', 'PA', 'WA', 'OH', 'TN', 'AZ', 'MA', 'UT', 'MD']);

// ---- Delaware franchise tax (the authorized-shares trap) ----

export function franchiseTaxAuthorized(authorized) {
  const tax = authorized <= 5000 ? 175 : authorized <= 10000 ? 250 : 250 + 85 * Math.ceil((authorized - 10000) / 10000);
  return Math.min(TAX.deMaxTax, tax);
}
export function franchiseTaxAPVC({ grossAssets, issued, authorized }) {
  if (!issued || issued <= 0) return TAX.deMinTax;
  const apvc = (Math.max(0, grossAssets) / issued) * authorized;
  return Math.min(TAX.deMaxTax, Math.max(TAX.deMinTax, Math.ceil(apvc / 1e6) * TAX.deMinTax));
}
export function deLatePenalty(tax, monthsLate) {
  return monthsLate > 0 ? TAX.deLatePenalty + tax * TAX.deInterestPerMonth * monthsLate : 0;
}

export function entityInfo(state) {
  const c = state.company;
  const legal = state.apps.legal ?? {};
  const b = ensureBooks(state);
  const entity = c.entity && c.entity !== 'none' ? c.entity : c.incorporated ? 'ccorp' : 'none';
  const incorporatedDay = c.incorporatedDay ?? legal.incorporatedDay ?? b.sawIncorporatedDay ?? (c.incorporated ? 0 : null);
  return {
    entity,
    incorporatedDay,
    authorized: legal.authorizedShares ?? c.authorizedShares ?? 10000000, // Atlas/Clerky default 10M authorized
    issued: legal.issuedShares ?? c.issuedShares ?? 8000000, // [assumption when the Legal app hasn't set it]
    authorizedFromLegal: legal.authorizedShares != null || c.authorizedShares != null,
  };
}

// ---- Contractors / 1099-NEC ----

const PLATFORM = /deel|upwork|fiverr|contra|toptal|remote\.com/i; // platforms issue their own forms
export function contractorTotals(state, year, { truth = false } = {}) {
  const out = {};
  for (const t of state.bank.txns) {
    if (t.amount >= 0 || yearOf(state, t.day) !== year || PLATFORM.test(t.counterparty)) continue;
    const cat = truth ? t.category : bookCategory(state, t);
    if (cat !== 'contractors') continue;
    out[t.counterparty] = (out[t.counterparty] ?? 0) - t.amount;
  }
  return Object.entries(out).map(([payee, total]) => ({ payee, total, required: total >= TAX.form1099Threshold })).sort((a, b) => b.total - a.total);
}

// ---- Income tax (C-corp, Form 1120) ----

export function yearIncome(state, year, ledger = ledgerByMonth(state)) {
  const months = monthsBetween(monthOf(state, 0), monthOf(state)).filter((m) => m.startsWith(String(year)));
  if (!months.length) return { preTax: 0, months: 0 };
  const pl = profitAndLoss(state, months, 'accrual', ledger);
  const taxLines = pl.sections.find((s) => s.title === 'Income taxes');
  const taxes = taxLines ? sumBy(taxLines.total, (v) => v) : 0;
  return { preTax: sumBy(pl.netIncome, (v) => v) - taxes, months: months.length };
}

export function incomeTaxFor(state, year, ledger) {
  const b = ensureBooks(state);
  const { preTax } = yearIncome(state, year, ledger);
  const nol = b.nol ?? 0;
  if (preTax <= 0) return { preTax, taxable: 0, nolUsed: 0, tax: 0, nolAfter: nol - preTax };
  const used = Math.min(nol, preTax * TAX.nolLimit);
  const taxable = preTax - used;
  return { preTax, taxable, nolUsed: used, tax: Math.round(taxable * TAX.corpRate * 100) / 100, nolAfter: nol - used };
}

// ---- Calendar ----

const iso = (y, md) => `${y}-${md}`;
export function calendarItems(state) {
  const b = ensureBooks(state);
  const e = entityInfo(state);
  const st = ensureStripe(state);
  const y0 = yearOf(state, 0), y1 = yearOf(state) + 1;
  const formedBy = (y) => e.incorporatedDay != null && e.incorporatedDay < dayForIso(state, `${y}-01-01`);
  const items = [];
  const add = (it) => items.push({ ...it, day: dayForIso(state, it.date), status: b.compliance[it.id]?.status ?? null, rec: b.compliance[it.id] ?? null });
  for (let y = y0; y <= y1; y++) {
    // Individual estimates for pass-through owners: personal money, shown for awareness.
    if (e.entity !== 'ccorp') for (const md of ['01-15', '04-15', '06-15', '09-15']) add({ id: `1040es-${y}-${md}`, date: iso(y, md), title: 'Owner\'s estimated tax (Form 1040-ES)', detail: 'Single-member LLC / sole prop profit flows to your personal return: income tax + 15.3% self-employment tax, paid personally. Safe harbor: 100% of last year\'s tax (110% if AGI > $150K).', kind: 'info', applies: true });
    add({ id: `1099-${y}`, date: iso(y, '01-31'), title: `1099-NEC for ${y - 1} contractor payments`, detail: `Every contractor paid ≥ $${TAX.form1099Threshold.toLocaleString()} in ${y - 1} (threshold rose from $600 for 2026 payments). Collect a W-9 before paying. Due to recipients and the IRS by Jan 31.`, kind: 'filing', applies: y - 1 >= y0 && contractorTotals(state, y - 1, { truth: true }).some((c) => c.required), year: y - 1 });
    if (e.entity === 'ccorp') {
      add({ id: `de-franchise-${y}`, date: iso(y, '03-01'), title: `Delaware annual report + franchise tax (${y - 1})`, detail: 'Annual report $50 + franchise tax. Delaware\'s notice uses the Authorized Shares method (~$85,165 for 10M shares). File with the Assumed Par Value Capital method using gross assets and issued shares: usually $400.', kind: 'payment', applies: formedBy(y), year: y - 1 });
      add({ id: `1120-${y}`, date: iso(y, '04-15'), title: `Form 1120 federal return (${y - 1})`, detail: 'C-corp income tax return (21%). File Form 7004 by the due date for a 6-month extension. A CPA return typically costs $1,000–$3,500 [designer estimate]; messy books cost more.', kind: 'filing', applies: formedBy(y), year: y - 1 });
      for (const [q, md] of [['Q1', '04-15'], ['Q2', '06-15'], ['Q3', '09-15'], ['Q4', '12-15']]) add({ id: `cest-${y}-${q}`, date: iso(y, md), title: `Corporate estimated tax ${q} ${y}`, detail: 'Only owed if the corporation expects taxable profit (21%). Pay 25% of the expected annual tax each quarter.', kind: 'payment', applies: e.incorporatedDay != null && e.incorporatedDay <= dayForIso(state, iso(y, md)), year: y });
      if (b.compliance[`1120-${y}`]?.status === 'extended') add({ id: `1120x-${y}`, date: iso(y, '10-15'), title: `Extended Form 1120 due (${y - 1})`, detail: 'The 7004 extension gave you 6 more months to file (not to pay).', kind: 'filing', applies: true, year: y - 1 });
    }
    if (e.entity === 'llc') add({ id: `de-llc-${y}`, date: iso(y, '06-01'), title: `Delaware LLC annual tax (${y - 1})`, detail: 'Flat $300, no annual report. Late: $200 penalty + 1.5%/month.', kind: 'payment', applies: formedBy(y), year: y - 1 });
    if (b.vat.registered) for (const [q, md] of [['Q4', '01-31'], ['Q1', '04-30'], ['Q2', '07-31'], ['Q3', '10-31']]) add({ id: `oss-${y}-${q}`, date: iso(y, md), title: `EU Non-Union OSS + UK VAT return (${q})`, detail: 'Quarterly VAT return for digital services sold to EU/UK consumers, due the end of the month after the quarter.', kind: 'filing', applies: dayForIso(state, iso(y, md)) > b.vat.registeredDay + 20 });
  }
  return items.filter((i) => i.applies && i.day >= -30).sort((a, b) => a.day - b.day);
}

const rec = (state, id) => (ensureBooks(state).compliance[id] ??= {});
const monthsLate = (state, dueDay) => Math.max(0, Math.ceil((state.day - dueDay) / 30));

// ---- Actions (wrapped by the Books UI in ctx.act with hours) ----

export function payDelawareFranchise(state, year, { method, grossAssets = null, issued = null }) {
  const e = entityInfo(state);
  const id = `de-franchise-${year + 1}`;
  const dueDay = dayForIso(state, `${year + 1}-03-01`);
  let tax;
  if (method === 'apvc') {
    const bs = balanceSheet(state, `${year}-12`);
    const actual = bs.totalAssets;
    if (!(grossAssets >= 0) || !(issued > 0)) throw new Error('Enter total gross assets and issued shares.');
    if (Math.abs(grossAssets - actual) > Math.max(500, Math.abs(actual) * 0.05)) throw new Error(`Gross assets must come from your Dec 31, ${year} balance sheet (Books → Balance sheet). $${Math.round(grossAssets).toLocaleString()} doesn't match.`);
    if (Math.abs(issued - e.issued) > e.issued * 0.01) throw new Error('Issued shares must match your cap table (see Legal / Fundraising).');
    tax = franchiseTaxAPVC({ grossAssets, issued, authorized: e.authorized });
  } else tax = franchiseTaxAuthorized(e.authorized);
  const late = monthsLate(state, dueDay);
  const penalty = deLatePenalty(tax, late);
  const total = Math.round((tax + TAX.deAnnualReportFee + penalty) * 100) / 100;
  post(state, { amount: -total, counterparty: 'Delaware Division of Corporations', description: 'DE DIV OF CORPORATIONS FRANCHISE TAX', category: 'taxes', method: 'ach', meta: { compliance: id, method, tax, penalty } });
  Object.assign(rec(state, id), { status: 'done', day: state.day, amount: total, note: `${method === 'apvc' ? 'Assumed par value capital' : 'Authorized shares'} method: tax $${tax.toLocaleString()} + $50 report${penalty ? ` + $${Math.round(penalty)} late penalty` : ''}` });
  state.flags.deNotGoodStanding = false;
  return { tax, penalty, total };
}

export function payDelawareLlc(state, year) {
  const id = `de-llc-${year + 1}`;
  const penalty = deLatePenalty(TAX.deLlcTax, monthsLate(state, dayForIso(state, `${year + 1}-06-01`)));
  const total = TAX.deLlcTax + penalty;
  post(state, { amount: -total, counterparty: 'Delaware Division of Corporations', description: 'DE DIV OF CORPORATIONS LLC TAX', category: 'taxes', method: 'ach', meta: { compliance: id } });
  Object.assign(rec(state, id), { status: 'done', day: state.day, amount: total });
  return total;
}

export function file1099s(state, year) {
  const id = `1099-${year + 1}`;
  const payees = state.apps.bank?.payees ?? [];
  const list = contractorTotals(state, year).filter((c) => c.required);
  const missingW9 = list.filter((c) => payees.find((p) => p.name === c.payee)?.w9 === false);
  if (missingW9.length) throw new Error(`Collect W-9s first (Bank → Payees): ${missingW9.map((c) => c.payee).join(', ')}.`);
  const dueDay = dayForIso(state, `${year + 1}-01-31`);
  const late = state.day > dueDay;
  const truthReq = contractorTotals(state, year, { truth: true }).filter((c) => c.required).map((c) => c.payee);
  const missed = truthReq.filter((p) => !list.some((c) => c.payee === p)); // miscategorized contractors you didn't file for
  const per = late ? (state.day - dueDay <= 30 ? TAX.form1099Penalty.within30 : TAX.form1099Penalty.late) : 0;
  const cost = list.length * TAX.form1099EfilePerForm;
  if (cost) post(state, { amount: -cost, counterparty: 'Track1099', description: 'TRACK1099 E-FILE', category: 'accounting', method: 'card' });
  const penalty = per * list.length + missed.length * TAX.form1099Penalty.late;
  if (penalty) post(state, { amount: -penalty, counterparty: 'IRS', description: 'IRS USATAXPYMT INFO RETURN PENALTY', category: 'taxes', method: 'ach' });
  Object.assign(rec(state, id), { status: 'done', day: state.day, amount: cost + penalty, note: `${list.length} form${list.length === 1 ? '' : 's'} filed${missed.length ? `; IRS later penalized ${missed.length} unfiled (miscategorized contractor payments: ${missed.join(', ')})` : ''}` });
  return { forms: list.length, penalty, missed };
}

export function payEstimatedTax(state, id, amount) {
  if (!(amount > 0)) throw new Error('Nothing to pay.');
  post(state, { amount: -amount, counterparty: 'IRS', description: 'IRS USATAXPYMT EST TAX', category: 'taxes', method: 'ach', meta: { incomeTax: true, compliance: id } });
  Object.assign(rec(state, id), { status: 'done', day: state.day, amount });
}

// Required quarterly installment: 25% of the annualized expected tax (simplified).
export function estimateDue(state, year, ledger) {
  const { preTax, months } = yearIncome(state, year, ledger);
  if (preTax <= 0 || !months) return 0;
  const annual = (preTax / months) * 12;
  return Math.round(annual * TAX.corpRate * 0.25);
}

export function cpaQuote(state, year, ledger = ledgerByMonth(state)) {
  const e = entityInfo(state);
  const unclosed = unclosedMonths(state, year).length;
  const errors = misclassified(state, (t) => yearOf(state, t.day) === year).length;
  const base = TAX.cpaBase[e.entity] ?? 0;
  const tax = e.entity === 'ccorp' ? incomeTaxFor(state, year, ledger) : { tax: 0, preTax: yearIncome(state, year, ledger).preTax };
  const paid = sumBy(state.bank.txns.filter((t) => t.meta?.incomeTax && t.meta?.compliance?.startsWith(`cest-${year}`)), (t) => -t.amount);
  return { base, unclosed, errors, catchUp: unclosed * TAX.cpaCatchUpPerMonth, fix: errors * TAX.cpaPerMisclass, fee: base + unclosed * TAX.cpaCatchUpPerMonth + errors * TAX.cpaPerMisclass, ...tax, estimatesPaid: paid, balanceDue: Math.max(0, (tax.tax ?? 0) - paid) };
}

export function fileWithCpa(state, year, ledger) {
  const id = `1120-${year + 1}`;
  const q = cpaQuote(state, year, ledger);
  const dueDay = b1120Due(state, year);
  const late = monthsLate(state, dueDay);
  const latePenalty = q.balanceDue > 0 ? Math.min(0.25, 0.05 * late) * q.balanceDue : 0; // failure-to-file 5%/mo, max 25%
  if (q.fee) post(state, { amount: -q.fee, counterparty: 'CPA firm', description: `ACH TO CPA FIRM ${year} RETURN`, category: 'accounting', method: 'ach' });
  if (q.balanceDue + latePenalty > 0) post(state, { amount: -(q.balanceDue + latePenalty), counterparty: 'IRS', description: 'IRS USATAXPYMT 1120', category: 'taxes', method: 'ach', meta: { incomeTax: true, compliance: id } });
  const b = ensureBooks(state);
  if (q.nolAfter != null) b.nol = q.nolAfter;
  Object.assign(rec(state, id), { status: 'done', day: state.day, amount: q.fee + q.balanceDue + latePenalty, note: `CPA $${q.fee.toLocaleString()} (incl. $${q.catchUp + q.fix} cleanup); tax $${Math.round(q.balanceDue)}${latePenalty ? ` + $${Math.round(latePenalty)} late` : ''}` });
  if (b.compliance[`1120x-${year + 1}`]) b.compliance[`1120x-${year + 1}`].status = 'done';
  return q;
}
function b1120Due(state, year) {
  const ext = ensureBooks(state).compliance[`1120-${year + 1}`]?.status === 'extended';
  return dayForIso(state, `${year + 1}-${ext ? '10-15' : '04-15'}`);
}
export function fileExtension(state, year) {
  const id = `1120-${year + 1}`;
  if (state.day > dayForIso(state, `${year + 1}-04-15`)) throw new Error('Form 7004 must be filed by the original due date.');
  Object.assign(rec(state, id), { status: 'extended', day: state.day, note: 'Form 7004 filed: return due Oct 15 (tax still due Apr 15)' });
}

// EU/UK VAT: register (Non-Union OSS + UK) and pay back what you should have charged.
export function registerVat(state) {
  const b = ensureBooks(state);
  const back = Math.round(b.vat.exposure * 100) / 100;
  if (back > 0) post(state, { amount: -back, counterparty: 'EU OSS / HMRC', description: 'VAT BACK PAYMENT (NON-UNION OSS + UK)', category: 'taxes', method: 'wire' });
  b.vat.registered = true;
  b.vat.registeredDay = state.day;
  b.vat.exposure = 0;
  return back;
}
export function fileVatReturn(state, id) {
  const b = ensureBooks(state);
  const due = Math.round(b.vat.payable * 100) / 100;
  if (due > 0) post(state, { amount: -due, counterparty: 'EU OSS / HMRC', description: 'VAT RETURN PAYMENT', category: 'taxes', method: 'wire' });
  b.vat.payable = 0;
  Object.assign(rec(state, id), { status: 'done', day: state.day, amount: due });
  return due;
}

// ---- US sales-tax nexus ----

export function nexusStatus(state, year = yearOf(state)) {
  const b = ensureBooks(state);
  const sales = b.sales[year] ?? {};
  return Object.entries(sales).filter(([s]) => s !== 'OTHER').map(([s, v]) => {
    const threshold = TAX.nexusHigh[s] ?? TAX.nexusDefault;
    const n = b.nexus[s];
    return { state: s, sales: v, threshold, pct: v / threshold, crossed: v >= threshold, taxable: SAAS_TAXABLE.has(s), registered: Boolean(n?.registered), crossedDay: n?.crossedDay ?? null };
  }).sort((a, b) => b.pct - a.pct);
}
export function registerNexus(state, st) {
  const b = ensureBooks(state);
  const n = (b.nexus[st] ??= { crossedDay: state.day });
  const row = nexusStatus(state).find((r) => r.state === st);
  let back = 0;
  if (row?.crossed && row.taxable && !ensureStripe(state).settings.merchantOfRecord && state.day - n.crossedDay > 60) {
    back = Math.round((row.sales - row.threshold) * TAX.salesTaxRate * (1 + TAX.backTaxPenalty));
    if (back > 0) post(state, { amount: -back, counterparty: `${st} Department of Revenue`, description: `${st} DEPT OF REVENUE SALES TAX`, category: 'taxes', method: 'ach' });
  }
  n.registered = true;
  n.registeredDay = state.day;
  return back;
}

// ---- Daily: reminders, missed deadlines, nexus crossings ----

export function complianceDay(state) {
  const b = ensureBooks(state);
  if (state.company.incorporated && b.sawIncorporatedDay == null) b.sawIncorporatedDay = state.day;
  const items = calendarItems(state);
  for (const it of items) {
    const r = b.compliance[it.id] ?? {};
    if (it.kind === 'info') continue;
    if (!r.reminded && it.day - state.day <= 14 && it.day >= state.day && !r.status) {
      rec(state, it.id).reminded = true;
      notify(state, `Due ${it.date}: ${it.title}.`, { type: 'warn', app: 'books' });
    }
    if (!r.status && state.day > it.day) {
      const x = rec(state, it.id);
      if (it.id.startsWith('de-')) {
        x.status = 'overdue';
        state.flags.deNotGoodStanding = true;
        notify(state, `Missed: ${it.title}. Delaware adds a $200 penalty plus 1.5% interest per month, and the company falls out of good standing until you pay (Books → Tax & compliance).`, { type: 'bad', app: 'books' });
      } else if (it.id.startsWith('cest-')) {
        const due = estimateDue(state, it.year);
        x.status = due > 0 ? 'missed' : 'na';
        if (due > 0) {
          const pen = Math.round(due * TAX.underpaymentRate * 0.25);
          post(state, { amount: -(due + pen), counterparty: 'IRS', description: 'IRS USATAXPYMT EST TAX + PENALTY', category: 'taxes', method: 'ach', meta: { incomeTax: true, compliance: it.id } });
          x.amount = due + pen;
          notify(state, `Missed corporate estimated tax: paid late with a ~$${pen} underpayment penalty.`, { type: 'bad', app: 'books' });
        }
      } else if (it.id.startsWith('1099-')) {
        x.status = 'overdue';
        notify(state, `Missed the Jan 31 1099-NEC deadline. IRS penalties: $60/form within 30 days, $130 after. File now in Books.`, { type: 'bad', app: 'books' });
      } else if (it.id.startsWith('1120')) {
        x.status = 'overdue';
        notify(state, `Form 1120 deadline passed without a return or a 7004 extension. Failure-to-file penalties run 5%/month of any tax due.`, { type: 'bad', app: 'books' });
      } else if (it.id.startsWith('oss-')) {
        x.status = 'overdue';
        notify(state, 'Missed a quarterly VAT return. File it now (Books → Tax & compliance) before penalties and interest grow.', { type: 'bad', app: 'books' });
      }
    }
  }
  // Nexus crossings
  for (const r of nexusStatus(state)) {
    if (r.crossed && !b.nexus[r.state]) {
      b.nexus[r.state] = { crossedDay: state.day, registered: false };
      const mor = ensureStripe(state).settings.merchantOfRecord;
      if (!mor && r.taxable) notify(state, `Sales-tax nexus: you passed $${r.threshold.toLocaleString()} in ${r.state} sales this year, and ${r.state} taxes SaaS. Register before collecting (Books → Tax & compliance).`, { type: 'bad', app: 'books' });
    }
  }
  // First EU/UK consumer sale without an MoR
  if (b.vat.firstSaleDay != null && !b.vat.warned && !b.vat.registered) {
    b.vat.warned = true;
    notify(state, 'You sold to an EU/UK consumer. Non-EU sellers owe VAT from the first B2C sale (no threshold). Register for Non-Union OSS + UK VAT, or switch to a merchant of record.', { type: 'warn', app: 'books' });
  }
}
