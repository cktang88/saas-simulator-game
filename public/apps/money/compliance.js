// Tax & compliance calendar for the Books app (US-centric, general information — not tax advice).
// Dates and amounts: docs/research/finance-and-payments.md §4 and §7 (compliance calendar).
// Pure state transitions; the Books app wraps them in ctx.act with founder hours.
//
// Ownership: the Legal app owns (reminds, flags and posts) Delaware franchise tax + annual report, Delaware LLC tax
// and 1099-NEC filings under the keys `de-franchise-YYYY`, `de-llc-tax-YYYY`, `1099-YYYY`. Books shows them
// read-only (status via legal/api.js filingPaid) so nothing is charged twice. Books owns Form 1120 with the CPA,
// corporate estimated taxes, US sales-tax nexus and EU/UK VAT, and records what it pays in books.paidFilings.
//
// Books vs truth: the founder's P&L is built from the books categories (AI guesses until reviewed), so a
// miscategorized transaction distorts what the founder sees and the estimates they choose to pay. What the IRS
// actually assesses (missed-estimate catch-ups, the return the CPA files after cleaning up the books) is based on
// what the money really was (trueLedger). The gap shows up at filing as a CPA adjustment, an extra balance due
// or refund, and an underpayment penalty if the estimates paid from wrong books were too low.
export const LEGAL_OWNED = /^(de-franchise|de-llc-tax|1099)-/;

import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { ensureStripe } from '../../core/stripe.js';
import { dayForIso, yearOf, monthOf, sumBy, monthsBetween } from './common.js';
import { filingPaid } from '../legal/api.js';
import { FOUNDER_STOCK, DELAWARE } from '../legal/catalog.js';
import { ensureBooks, ledgerByMonth, trueLedger, profitAndLoss, balanceSheet, bookCategory, misclassified, unclosedMonths, falseNaItems, NA_CHECK } from './ledger.js';
import { ensureIntegrity } from '../../core/integrity.js';
import { missingReceiptsInYear } from './spend.js';
import { taxService, settleRdCredit } from './backoffice.js';
import { service } from './ledger.js';

// Cash-only books at a company that raised and sells annual or invoiced plans: the CPA (and later the investors'
// accountants) restate the year on an accrual basis [design: ~$1,500 + $100 per month of deferred-revenue activity].
export const RESTATE = { base: 1500, perMonth: 100, minRaised: 100000 };
function restatementFee(state, year) {
  if (service(state).accrual) return 0;
  const raised = sumBy(state.bank.txns.filter((t) => t.category === 'investment' && t.amount > 0 && yearOf(state, t.day) <= year), (t) => t.amount);
  if (raised < RESTATE.minRaised) return 0;
  const st = ensureStripe(state);
  const annual = new Set(st.subscriptions.filter((x) => x.interval === 'year').map((x) => x.id));
  const months = new Set(st.charges.filter((c) => c.status !== 'failed' && yearOf(state, c.day) === year && (annual.has(c.subId) || (c.serviceDays ?? 0) > 40)).map((c) => monthOf(state, c.day))).size;
  const invoiced = ensureStripe(state).invoices?.some((i) => i.method === 'ach_invoice' && yearOf(state, i.day ?? 0) === year);
  if (!months && !invoiced) return 0;
  return RESTATE.base + RESTATE.perMonth * Math.max(months, invoiced ? 3 : 0);
}

export const TAX = {
  // Delaware (corp.delaware.gov, checked 2026-10-14)
  deAnnualReportFee: 50,
  deLatePenalty: 200,
  deInterestPerMonth: 0.015,
  deMinTax: 400,
  deMaxTax: 200000,
  deLlcTax: DELAWARE.llcTax, // what Legal charges ($400 for tax year 2026, HB 400)
  // IRS
  form1099Threshold: 2000, // payments made in 2026 and later (OBBBA, 2025)
  form1099EfilePerForm: 3, // e-file service per form [design: Track1099/Tax1099-style pricing]
  form1099Penalty: { within30: 60, late: 130, after: 340 }, // per form, 2026 IRS amounts (indexed annually)
  corpRate: 0.21,
  nolLimit: 0.8, // post-2017 NOLs offset up to 80% of taxable income
  underpaymentRate: 0.07, // IRS underpayment interest ≈ 7%/yr in 2026 [approximate]
  underpaymentMinTax: 500, // corporations owing < $500 for the year owe no estimated-tax penalty (Form 2220)
  cpaBase: { ccorp: 1500, llc: 600, none: 0 }, // research: C-corp return with a CPA $1,000–$3,500 [designer estimate]
  cpaCatchUpPerMonth: 250, // catch-up bookkeeping per month not closed [design]
  cpaPerMisclass: 15, // CPA time fixing miscategorized transactions [design]
  assessAfterDays: 180, // an ignored return is forced by IRS notices after ~6 months [design; same as Legal's ASSESS_AFTER_DAYS]
  delinquentReturnFee: 750, // CPA time answering IRS notices on a delinquent return, on top of the return itself [design]
  cpaPerMissingReceipt: 12, // CPA time chasing an unsubstantiated card charge [design] (same as spend.js SPEND)
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
    authorized: legal.founderStock?.authorized ?? FOUNDER_STOCK.authorized, // Legal's default founder stock
    issued: legal.founderStock?.issued ?? FOUNDER_STOCK.issued, // [assumption until founder stock is issued in Legal]
    authorizedFromLegal: legal.founderStock != null,
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
  const add = (it) => {
    if (LEGAL_OWNED.test(it.id)) {
      const paid = state.apps.legal?.paidFilings?.[it.id] ?? b.paidFilings?.[it.id];
      return items.push({ ...it, owner: 'legal', day: dayForIso(state, it.date), status: filingPaid(state, it.id) ? 'done' : null, rec: paid ? { amount: paid.amount, note: paid.method ? `${paid.method === 'apvc' ? 'Assumed par value capital' : 'Authorized shares'} method` : '' } : null });
    }
    items.push({ ...it, owner: 'books', day: dayForIso(state, it.date), status: b.compliance[it.id]?.status ?? null, rec: b.compliance[it.id] ?? null });
  };
  for (let y = y0; y <= y1; y++) {
    // Individual estimates for pass-through owners: personal money, shown for awareness.
    if (e.entity !== 'ccorp') for (const md of ['01-15', '04-15', '06-15', '09-15']) add({ id: `1040es-${y}-${md}`, date: iso(y, md), title: 'Owner\'s estimated tax (Form 1040-ES)', detail: 'Single-member LLC / sole prop profit flows to your personal return: income tax + 15.3% self-employment tax, paid personally. Safe harbor: 100% of last year\'s tax (110% if AGI > $150K).', kind: 'info', applies: true });
    add({ id: `1099-${y}`, date: iso(y, '01-31'), title: `1099-NEC for ${y - 1} contractor payments`, detail: `Every contractor paid ≥ $${TAX.form1099Threshold.toLocaleString()} in ${y - 1} (threshold rose from $600 for 2026 payments). Collect a W-9 before paying. Due to recipients and the IRS by Jan 31.`, kind: 'filing', applies: y - 1 >= y0 && contractorTotals(state, y - 1, { truth: true }).some((c) => c.required), year: y - 1 });
    if (e.entity === 'ccorp') {
      add({ id: `de-franchise-${y}`, date: iso(y, '03-01'), title: `Delaware annual report + franchise tax (${y - 1})`, detail: `Annual report $50 + franchise tax. Delaware's notice uses the Authorized Shares method (${franchiseTaxAuthorized(e.authorized).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} for ${e.authorized.toLocaleString('en-US')} authorized shares). Filed with the Assumed Par Value Capital method (gross assets from your Dec 31 balance sheet + issued shares) it is usually $400 + $50 = $450.`, kind: 'payment', applies: formedBy(y), year: y - 1 });
      add({ id: `1120-${y}`, date: iso(y, '04-15'), title: `Form 1120 federal return (${y - 1})`, detail: 'C-corp income tax return (21%). File Form 7004 by the due date for a 6-month extension. A CPA return typically costs $1,000–$3,500 [designer estimate]; messy books cost more.', kind: 'filing', applies: formedBy(y), year: y - 1 });
      for (const [q, md] of [['Q1', '04-15'], ['Q2', '06-15'], ['Q3', '09-15'], ['Q4', '12-15']]) add({ id: `cest-${y}-${q}`, date: iso(y, md), title: `Corporate estimated tax ${q} ${y}`, detail: 'Only owed if the corporation expects taxable profit (21%). Pay 25% of the expected annual tax each quarter.', kind: 'payment', applies: e.incorporatedDay != null && e.incorporatedDay <= dayForIso(state, iso(y, md)), year: y });
      if (b.compliance[`1120-${y}`]?.status === 'extended') add({ id: `1120x-${y}`, date: iso(y, '10-15'), title: `Extended Form 1120 due (${y - 1})`, detail: 'The 7004 extension gave you 6 more months to file (not to pay).', kind: 'filing', applies: true, year: y - 1 });
    }
    if (e.entity === 'llc') add({ id: `de-llc-tax-${y}`, date: iso(y, '06-01'), title: `Delaware LLC annual tax (${y - 1})`, detail: 'Flat annual tax, no annual report (Legal app has the current amount). Late: $200 penalty + 1.5%/month.', kind: 'payment', applies: formedBy(y), year: y - 1 });
    if (b.vat.registered) for (const [q, md] of [['Q4', '01-31'], ['Q1', '04-30'], ['Q2', '07-31'], ['Q3', '10-31']]) add({ id: `oss-${y}-${q}`, date: iso(y, md), title: `EU Non-Union OSS + UK VAT return (${q})`, detail: 'Quarterly VAT return for digital services sold to EU/UK consumers, due the end of the month after the quarter.', kind: 'filing', applies: dayForIso(state, iso(y, md)) > b.vat.registeredDay + 20 });
  }
  return items.filter((i) => i.applies && i.day >= -30).sort((a, b) => a.day - b.day);
}

// Catch-up founder hours for a missed filing: gathering records, calling the CPA/IRS, re-filing [design].
const CATCHUP_HOURS = { cest: 3, '1120': 8, oss: 4 };
function logMissed(state, it, kind, usd, detail) {
  return logMistake(state, { functionId: 'bookkeeping_close_tax', id: `missed_${kind}`, label: `Missed deadline: ${it.title}`, app: 'books', delayed: true, cost: { usd, hours: CATCHUP_HOURS[kind] }, key: `missed:${it.id}`, charge: true, detail: `Due ${it.date}. ${detail}` });
}

const rec = (state, id) => (ensureBooks(state).compliance[id] ??= {});
const monthsLate = (state, dueDay) => Math.max(0, Math.ceil((state.day - dueDay) / 30));

// ---- Actions (wrapped by the Books UI in ctx.act with hours) ----

export function payEstimatedTax(state, id, amount) {
  if (!(amount > 0)) throw new Error('Nothing to pay.');
  if (['done', 'missed'].includes(ensureBooks(state).compliance[id]?.status)) throw new Error('This installment is already paid.');
  post(state, { amount: -amount, counterparty: 'IRS', description: 'IRS USATAXPYMT EST TAX', category: 'taxes', method: 'ach', meta: { incomeTax: true, compliance: id } });
  Object.assign(rec(state, id), { status: 'done', day: state.day, amount });
  markPaid(state, id, amount);
}
function markPaid(state, key, amount) {
  const b = ensureBooks(state);
  b.paidFilings ??= {};
  b.paidFilings[key] = { day: state.day, amount: Math.round(amount * 100) / 100 };
}

// Required quarterly installment: 25% of the annualized expected tax (simplified).
// The tax year starts at incorporation (or when the game starts): a corp formed in November has a 2-month first
// tax year, so income is annualized over the months of *its* tax year, not 12.
export function estimateDue(state, year, ledger) {
  const { preTax, months } = yearIncome(state, year, ledger);
  if (preTax <= 0 || !months) return 0;
  const e = entityInfo(state);
  const startIn = (day) => (day != null && yearOf(state, day) === year ? Number(monthOf(state, day).slice(5)) : 1);
  const firstMonth = Math.max(startIn(0), startIn(e.incorporatedDay));
  const yearMonths = 13 - firstMonth;
  const annual = (preTax / months) * Math.max(months, yearMonths);
  return Math.round(annual * TAX.corpRate * 0.25);
}

// CPA quote for the year's return. `ledger` is the founder's books (what they see); the CPA fixes the
// miscategorized transactions (billed per fix) and files on the corrected numbers (trueLedger).
export function cpaQuote(state, year, ledger = ledgerByMonth(state)) {
  const e = entityInfo(state);
  const unclosed = unclosedMonths(state, year).length;
  const errors = misclassified(state, (t) => yearOf(state, t.day) === year).length;
  const noReceipt = missingReceiptsInYear(state, year); // card charges with no receipt: the CPA chases each one
  const falseNa = falseNaItems(state, year).filter((x) => x.caught); // N/A reasons the books contradict (ledger.js NA_CHECK)
  // The tax service sets the base fee (generic CPA vs a startup tax service); Xero books cost a US CPA a little more.
  const base = Math.round((taxService(state).base?.[e.entity] ?? TAX.cpaBase[e.entity] ?? 0) * (service(state).cpaMult ?? 1));
  const restate = e.entity === 'none' ? 0 : restatementFee(state, year);
  const truth = errors ? trueLedger(state) : ledger;
  const taxOf = (L) => (e.entity === 'ccorp' ? incomeTaxFor(state, year, L) : { tax: 0, preTax: yearIncome(state, year, L).preTax });
  const books = taxOf(ledger);
  const tax = errors ? taxOf(truth) : books;
  // Estimates paid this year. A late installment the IRS collected carries its penalty in the same payment: the
  // penalty is not tax paid and never comes back as an overpayment refund.
  const paid = sumBy(state.bank.txns.filter((t) => t.meta?.incomeTax && t.meta?.compliance?.startsWith(`cest-${year}`)), (t) => -t.amount - (t.meta.penalty ?? 0));
  const shortfall = Math.max(0, (tax.tax ?? 0) - paid);
  // Estimates paid too low (e.g. from books that understated profit): interest on the shortfall for ~half a year.
  const underpaymentPenalty = e.entity === 'ccorp' && (tax.tax ?? 0) >= TAX.underpaymentMinTax ? Math.round(shortfall * TAX.underpaymentRate * 0.5) : 0;
  // Filing late: failure-to-file 5%/mo of the unpaid tax (max 25%) after the (extended) due date. A 7004 extension
  // extends the time to file, not to pay: tax unpaid after the original Apr 15 owes the failure-to-pay penalty
  // (0.5%/mo, max 25%) plus underpayment interest, extension or not (IRS; rates approximate).
  const late = monthsLate(state, b1120Due(state, year));
  const latePenalty = shortfall > 0 ? Math.round(Math.min(0.25, 0.05 * late) * shortfall * 100) / 100 : 0;
  const payLate = monthsLate(state, dayForIso(state, `${year + 1}-04-15`));
  const latePayPenalty = shortfall > 0 && payLate > 0 ? Math.round(shortfall * (Math.min(0.25, 0.005 * payLate) + (TAX.underpaymentRate * payLate) / 12) * 100) / 100 : 0;
  return {
    base, unclosed, errors, noReceipt, receipts: noReceipt * TAX.cpaPerMissingReceipt, catchUp: unclosed * TAX.cpaCatchUpPerMonth, fix: errors * TAX.cpaPerMisclass + falseNa.length * NA_CHECK.cpaFeePerItem, falseNa, restate, taxService: taxService(state).label,
    fee: base + restate + unclosed * TAX.cpaCatchUpPerMonth + errors * TAX.cpaPerMisclass + noReceipt * TAX.cpaPerMissingReceipt + falseNa.length * NA_CHECK.cpaFeePerItem,
    ...tax, booksPreTax: books.preTax, booksTax: books.tax ?? 0, adjustment: Math.round(((tax.preTax ?? 0) - (books.preTax ?? 0)) * 100) / 100,
    estimatesPaid: paid, balanceDue: shortfall, underpaymentPenalty, latePenalty, latePayPenalty,
  };
}

const TAX_GENERIC = 'Generic CPA firm';
const e2 = (state) => entityInfo(state).entity;
export function fileWithCpa(state, year, ledger) {
  const id = `1120-${year + 1}`;
  if (['done', 'assessed'].includes(ensureBooks(state).compliance[id]?.status)) throw new Error(`The ${year} return is already filed.`);
  const q = cpaQuote(state, year, ledger);
  const { latePenalty, latePayPenalty } = q;
  const owed = q.balanceDue + latePenalty + latePayPenalty + q.underpaymentPenalty;
  const overpaid = Math.round(Math.max(0, q.estimatesPaid - (q.tax ?? 0)) * 100) / 100; // refunded after filing
  if (q.fee) post(state, { amount: -q.fee, counterparty: taxService(state).label === TAX_GENERIC ? 'CPA firm' : taxService(state).label, description: `ACH TO ${taxService(state).label === TAX_GENERIC ? 'CPA FIRM' : taxService(state).label.toUpperCase()} ${year} RETURN`, category: 'accounting', method: 'ach' });
  if (q.restate) logMistake(state, { functionId: 'bookkeeping_close_tax', id: 'cash_books_restated', label: 'Cash-basis books restated to accrual', app: 'books', delayed: true, key: `restate:${year}`, cost: { usd: q.restate, hours: 4 }, charge: true, detail: `The company raised money and sold annual or invoiced plans, but the ${year} books were cash-only: revenue was booked when collected, with no deferred revenue. The CPA restated the year on an accrual basis for ${'$'}${q.restate.toLocaleString()}. An accrual ledger (QuickBooks with accruals, Puzzle, Digits, Pilot) records it right the first time.` });
  if (e2(state) === 'ccorp') settleRdCredit(state, year);
  if (owed > 0) post(state, { amount: -owed, counterparty: 'IRS', description: 'IRS USATAXPYMT 1120', category: 'taxes', method: 'ach', meta: { incomeTax: true, compliance: id } });
  if (overpaid > 0) post(state, { amount: overpaid, counterparty: 'IRS', description: 'IRS TREAS 310 TAX REF', category: 'taxes', method: 'ach', meta: { incomeTax: true, compliance: id, refund: true } });
  const b = ensureBooks(state);
  if (q.nolAfter != null) b.nol = q.nolAfter;
  Object.assign(rec(state, id), { status: 'done', day: state.day, amount: q.fee + owed, adjustment: q.adjustment, note: `CPA $${q.fee.toLocaleString()} (incl. $${q.catchUp + q.fix + q.receipts} cleanup); tax $${Math.round(q.balanceDue)}${overpaid ? `, refund of $${Math.round(overpaid)} overpaid estimates` : ''}${latePenalty ? ` + $${Math.round(latePenalty)} late` : ''}${latePayPenalty ? ` + $${Math.round(latePayPenalty)} late-payment penalty & interest` : ''}${q.underpaymentPenalty ? ` + $${q.underpaymentPenalty} underpayment penalty` : ''}${Math.abs(q.adjustment) >= 1 ? `; CPA adjusted pre-tax income by $${Math.round(q.adjustment).toLocaleString()} for miscategorized transactions` : ''}` });
  if (b.compliance[`1120x-${year + 1}`]) b.compliance[`1120x-${year + 1}`].status = 'done';
  markPaid(state, `form-1120-${year + 1}`, q.fee + owed);
  if (q.falseNa?.length) {
    const I = ensureIntegrity(state);
    for (const x of q.falseNa) for (const c of I.claims) if (c.recipientId === `close:${x.month}:${x.id}` && c.status === 'open') { c.status = 'caught'; c.caughtDay = state.day; c.caughtBy = 'CPA review at filing'; }
    logMistake(state, { functionId: 'bookkeeping_close_tax', id: 'false_na_close', label: 'Close items marked N/A that the books contradict', app: 'books', delayed: true, charge: true, key: `falsena:${year}`, cost: { usd: q.falseNa.length * NA_CHECK.cpaFeePerItem, hours: q.falseNa.length * NA_CHECK.hoursPerItem }, detail: `The CPA found ${q.falseNa.length}: ${q.falseNa.map((x) => `${x.month} ${x.id} ("${x.reason}") but ${x.why}`).join('; ')}. Those months' statements were wrong when you closed them; anyone who relied on them (investors, a lender) saw the wrong numbers.` });
  }
  return q;
}
/** A return still unfiled ~6 months after its deadline: the IRS notices force it. The CPA files it late on the real
 *  numbers (fee and clean-up as usual), the tax goes out with failure-to-file and failure-to-pay penalties and interest,
 *  plus the cost of answering the notices; logged as a charged, traceable mistake. */
export function assessIgnoredReturn(state, it, ledger = trueLedger(state)) {
  const b = ensureBooks(state);
  const id = `1120-${it.year + 1}`;
  if (['done', 'assessed'].includes(b.compliance[id]?.status)) return null;
  const q = fileWithCpa(state, it.year, ledger);
  post(state, { amount: -TAX.delinquentReturnFee, counterparty: 'CPA firm', description: `CPA: IRS NOTICES, DELINQUENT ${it.year} 1120`, category: 'accounting', method: 'ach' });
  const daysLate = state.day - it.day;
  for (const k of [id, `1120x-${it.year + 1}`]) if (b.compliance[k]) Object.assign(b.compliance[k], { status: 'assessed', assessedDay: state.day });
  b.compliance[id].note = `Forced by IRS notices ${daysLate} days after the deadline. ${b.compliance[id].note ?? ''}`;
  const penalties = Math.round((q.latePenalty + q.latePayPenalty + TAX.delinquentReturnFee) * 100) / 100;
  notify(state, `Your ${it.year} Form 1120 was never filed: after IRS notices your CPA filed it late (${daysLate} days) with $${Math.round(penalties).toLocaleString()} in penalties, interest and notice handling.`, { type: 'bad', app: 'books' });
  logMistake(state, { functionId: 'bookkeeping_close_tax', id: 'return_ignored', label: `Ignored the ${it.year} federal return until the IRS forced it`, app: 'books', delayed: true, charge: true, key: `return_ignored:${id}`, cost: { usd: penalties, hours: CATCHUP_HOURS['1120'] },
    detail: `Due ${it.date}; still unfiled ${daysLate} days later. Failure-to-file $${Math.round(q.latePenalty)}, failure-to-pay + interest $${Math.round(q.latePayPenalty)} on $${Math.round(q.balanceDue)} of tax, and $${TAX.delinquentReturnFee} of CPA time on IRS notices. Filing (or a 7004 extension) by the deadline costs only the CPA fee.` });
  return { ...q, penalties };
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
  if (n.registered) throw new Error(`Already registered in ${st}.`);
  // Back tax on every sale since nexus began: the crossing year above the threshold, then every later year in full
  // (nexus persists once established). Waiting past Jan 1 does not wipe last year's uncollected tax.
  const threshold = TAX.nexusHigh[st] ?? TAX.nexusDefault;
  const y0 = n.crossedDay != null ? yearOf(state, n.crossedDay) : yearOf(state);
  let taxedSales = 0;
  for (let y = y0; y <= yearOf(state); y++) {
    const v = b.sales[y]?.[st] ?? 0;
    taxedSales += y === y0 ? Math.max(0, v - threshold) : v;
  }
  let back = 0;
  if (taxedSales > 0 && SAAS_TAXABLE.has(st) && !ensureStripe(state).settings.merchantOfRecord && state.day - n.crossedDay > 60) {
    back = Math.round(taxedSales * TAX.salesTaxRate * (1 + TAX.backTaxPenalty));
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
  let truth = null; // what the IRS assesses: real categories, not the bookkeeper's guesses (built only if needed)
  for (const it of items) {
    const r = b.compliance[it.id] ?? {};
    if (it.kind === 'info' || it.owner === 'legal') continue; // Legal reminds, flags and charges these
    if (!r.reminded && it.day - state.day <= 14 && it.day >= state.day && !r.status) {
      rec(state, it.id).reminded = true;
      notify(state, `Due ${it.date}: ${it.title}.`, { type: 'warn', app: 'books' });
    }
    if (!r.status && state.day > it.day) {
      const x = rec(state, it.id);
      if (it.id.startsWith('cest-')) {
        const due = estimateDue(state, it.year, (truth ??= trueLedger(state)));
        x.status = due > 0 ? 'missed' : 'na';
        if (due > 0) {
          const pen = Math.round(due * TAX.underpaymentRate * 0.25);
          post(state, { amount: -(due + pen), counterparty: 'IRS', description: 'IRS USATAXPYMT EST TAX + PENALTY', category: 'taxes', method: 'ach', meta: { incomeTax: true, compliance: it.id, penalty: pen } });
          x.amount = due + pen;
          logMissed(state, it, 'cest', pen, `The IRS collected the $${Math.round(due)} installment anyway plus a ~$${pen} underpayment penalty; ${CATCHUP_HOURS.cest}h to reconcile.`);
          notify(state, `Missed corporate estimated tax: paid late with a ~$${pen} underpayment penalty.`, { type: 'bad', app: 'books' });
        }
      } else if (it.id.startsWith('1120')) {
        x.status = 'overdue';
        let bal = 0; try { bal = cpaQuote(state, it.year, (truth ??= trueLedger(state))).balanceDue; } catch { /* no ledger yet */ }
        logMissed(state, it, '1120', Math.round(bal * 0.05), 'No return and no 7004 extension: failure-to-file runs 5% of the unpaid tax per month (first month shown).');
        notify(state, `Form 1120 deadline passed without a return or a 7004 extension. Failure-to-file penalties run 5%/month of any tax due.`, { type: 'bad', app: 'books' });
      } else if (it.id.startsWith('oss-')) {
        x.status = 'overdue';
        logMissed(state, it, 'oss', Math.round((b.vat.payable ?? 0) * 0.05), 'Late VAT return: interest and penalties accrue on the tax due until you file.');
        notify(state, 'Missed a quarterly VAT return. File it now (Books → Tax & compliance) before penalties and interest grow.', { type: 'bad', app: 'books' });
      }
    }
  }
  // An ignored Form 1120 does not go away: IRS notices force it ~6 months after the deadline (Legal's pattern).
  for (const it of items) {
    if (!/^1120x?-/.test(it.id) || b.compliance[it.id]?.status !== 'overdue' || state.day - it.day < TAX.assessAfterDays) continue;
    assessIgnoredReturn(state, it, (truth ??= trueLedger(state)));
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
