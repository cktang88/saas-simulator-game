// Back-office stack engine: which vendor runs banking, spend, books, tax, billing, the cap table and the mailroom, and
// what that choice changes in the simulation (hours, fees, errors, events). Pure engine, no DOM; the daily tick runs
// from the Bank app (backofficeDay). Data and sources: ./vendors.js and money/catalog.js (BOOKKEEPING).
//
// Operator quality (ARCHITECTURE principle 7). What separates the tiers is fit, configuration and the traps avoided:
//  - stellar: bank with a tax reserve, AP automated once bills pile up, spend program sized to the team, an accrual
//    ledger with investor metrics once they raise, a startup tax service that claims the R&D credit, billing that
//    matches the pricing model, Carta's free tier (or a cheap tier) before the round, a mailroom that scans notices.
//  - good: the right vendors, one or two settings left at defaults (no reserve, manual AP).
//  - average: defaults everywhere (Mercury, DIY books, generic CPA, spreadsheet cap table) and they pay for it later:
//    missed R&D credit, a restatement and a cap-table cleanup at the round, slow bill pay.
//  - mediocre: the wrong paradigm or overkill (a usage-billing platform on flat pricing, Pilot Core at $1K MRR,
//    Chargebee under $1M ARR, Ironclad at 10 contracts a year), staying on Pulley past its shutdown, no address as a
//    non-US founder, switching ledgers twice.
// Expected gaps [design]: 5-15 founder hours a month and $3-15K a year between stellar and mediocre at seed, plus the
// lumpy costs (restatement, cap-table reconstruction, a missed R&D credit of 6% of qualified spend).
//
// Determinism: per-event draws use frac(salt|key) (stable hashes), like money/spend.js, so this engine never shifts the
// shared random stream other apps draw from.

import { notify, forceHours } from '../../core/state.js';
import { post, addRecurring } from '../../core/bank.js';
import { round2, money, fmtDate, dayOfMonth, dayOfWeek, hash, monthIndex } from '../../core/util.js';
import { activeSubs, mrr, ensureStripe, refund } from '../../core/stripe.js';
import { newThread, addMessage, findThread } from '../../core/mail.js';
import { frac, monthOf, dayForIso, sumBy, yearOf, prevMonthKey, totalCash } from './common.js';
import { mistake } from './operator.js';
import { ensureSpend, programOn, stackRows } from './spend.js';
import { BOOKKEEPING, bookkeepingPrice, BOOKS_MIGRATION } from './catalog.js';
import { ensureBooks, service, misclassified } from './ledger.js';
import {
  DATES, BANKS, BILL_PAY, BANK_SWITCH, DISHONORED, MANUAL_SWEEP_HOURS, SPEND_VENDORS, INTEGRATION, TAX_SERVICES, RD_CREDIT,
  BILLING_PLATFORMS, USAGE_MODELS, USAGE_BILLING, MOR_PROVIDERS, CAP_VENDORS, STANDALONE_409A, CAP_MIGRATION, CAP_RECON, MAILROOM, NOTICES,
} from './vendors.js';

export * from './vendors.js';

// ---------------------------------------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------------------------------------

export function ensureBackoffice(state) {
  const b = (state.apps.backoffice ??= {});
  b.salt ??= hash(`${state.company?.name}|${state.founder?.name}|${state.startDate}|backoffice`);
  b.bank ??= 'mercury';
  b.bankSince ??= 0;
  b.bankSwitches ??= [];
  b.reserve ??= { pct: 0, lastSweepMonth: null, sweeps: 0, missedSweeps: 0, checkedMonth: null };
  b.tax ??= 'cpa';
  b.cap ??= { vendor: 'spreadsheet', since: 0, errors: 0, entries: 0, prefSeen: 0, nextBill: null, price: 0, years: 0, history: [] };
  b.cap.pulley ??= {};
  b.mailroom ??= null; // null = default (home for US founders, none for non-US)
  b.mail ??= { notices: [], month: null };
  b.billing ??= { since: 0, overkillLogged: false, errors: 0, credits: 0, feesPaid: 0 };
  b.integration ??= { events: 0, rewardCut: 0, lastQuarter: null };
  b.booksSwitches ??= [];
  b.scan ??= state.bank?.txns?.length ?? 0; // start at the current end so old saves don't re-process history
  b.cardSpend ??= {};
  b.pendingHours ??= 0;
  b.hoursLog ??= {}; // 'YYYY-MM' -> back-office hours charged
  b.flagged ??= {};
  b.stats ??= { bills: 0, lateBills: 0, lateFees: 0, dishonored: 0, dishonoredUsd: 0, cashback: 0, unreservedTax: 0, reservedTax: 0, autoAllocated: 0, missedNotices: 0, noticePenalties: 0, rdClaimed: 0, rdMissed: 0 };
  return b;
}
// Stable per-event draw. core/util hash() keeps nearby keys close (…|0, …|1 land near each other), so the value is run
// through the murmur3 finalizer before use; otherwise a run of entries would all fall on the same side of a threshold.
const mix32 = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const H = (b, key) => mix32(Math.floor(frac(`${b.salt}|${key}`) * 4294967296) | 0);
const humans = (state) => 1 + (state.apps.people?.members ?? []).filter((m) => m.status === 'active' && m.kind !== 'ai_agent').length;
const legal = (state) => state.apps.legal ?? {};
export const isNonUsFounder = (state) => legal(state).incorporation?.operatingState === 'nonus';
const pricingModel = (state) => state.apps.pricing?.model ?? 'flat';
export const usagePriced = (state) => USAGE_MODELS.has(pricingModel(state));

/** Queue founder hours for back-office work; charged every Monday (and logged per month so the cost is traceable). */
export function queueHours(state, hours, label = 'Back office') {
  const b = ensureBackoffice(state);
  if (!(hours > 0)) return;
  b.pendingHours = round2(b.pendingHours + hours);
  b.pendingLabel = label;
}
function chargePending(state, b) {
  if (b.pendingHours < 0.05) return;
  const h = forceHours(state, b.pendingHours, 'Back office: bill pay, notices, reconciliations', { functionId: 'bookkeeping_close_tax' }); // on today's hours too
  const m = monthOf(state);
  b.hoursLog[m] = round2((b.hoursLog[m] ?? 0) + h);
  b.pendingHours = 0;
}
/** Back-office hours the tick charged in the last n months (for the grade and the test). */
export const opsHours = (state, months = 3) => {
  const b = ensureBackoffice(state);
  return round2(sumBy(Object.entries(b.hoursLog).sort().slice(-months), ([, h]) => h));
};

// ---------------------------------------------------------------------------------------------------------
// Banking
// ---------------------------------------------------------------------------------------------------------

export const bank = (state) => BANKS[ensureBackoffice(state).bank] ?? BANKS.mercury;
export const bankLabel = (state) => bank(state).label;
/** Bill-pay workflow in use: a bank with AP, or the spend program's bill pay, automates it. */
export function apMode(state) {
  if (bank(state).billPay === 'automated') return 'automated';
  const s = ensureSpend(state);
  if (programOn(state) && SPEND_VENDORS[s.vendor ?? 'ramp']?.billPay === 'automated') return 'automated';
  return 'basic';
}
export const bankSwitchHours = (state) => round2(BANK_SWITCH.hours + BANK_SWITCH.perRecurring * (state.recurring ?? []).filter((r) => r.active).length);

export function switchBank(state, key) {
  const b = ensureBackoffice(state);
  const to = BANKS[key];
  if (!to) throw new Error('Unknown bank.');
  if (b.bank === key) throw new Error(`You already bank with ${to.label}.`);
  if (state.bank.accounts[0]?.personal) throw new Error('Business banks need an incorporated company and an EIN (Legal).');
  const from = bank(state);
  b.bank = key; b.bankSince = state.day;
  const chk = state.bank.accounts.find((a) => a.id === 'checking');
  if (chk) chk.name = `${to.label} Checking`;
  const tr = state.bank.accounts.find((a) => a.id === 'treasury');
  if (tr && !to.treasury) {
    if (tr.balance > 0) {
      const amt = round2(tr.balance);
      post(state, { amount: -amt, counterparty: `${to.label} Checking`, description: 'TREASURY CLOSED: MOVED TO CHECKING', category: 'transfer', method: 'internal', accountId: 'treasury' });
      post(state, { amount: amt, counterparty: `${from.label} Treasury`, description: 'TRANSFER FROM CLOSED TREASURY', category: 'transfer', method: 'internal', accountId: 'checking' });
    }
    if (state.apps.bank?.treasury) state.apps.bank.treasury.enabled = false;
  }
  // Cards on file that did not get updated: the founder re-enters them later [design].
  for (const r of state.recurring ?? []) if (r.active && H(b, `card-move|${state.day}|${r.id}`) < BANK_SWITCH.missedCardChance) queueHours(state, 0.25);
  b.bankSwitches.push(state.day);
  const recent = b.bankSwitches.filter((d) => state.day - d <= 180);
  if (recent.length >= 2) mistake(state, { functionId: 'cash_runway', id: 'bank_hopping', label: 'Switched banks twice in six months', circles: true, app: 'bank', key: `bankhop:${state.day}`, cost: { hours: bankSwitchHours(state) }, detail: `Moved the operating account to ${to.label} ${recent.length} times in 180 days: new KYC, payout account, payroll and every card on file each time. Pick the bank for the workflow you need (envelopes, AP, treasury) once.` });
  return { from: from.label, to: to.label };
}

export const reserveAcct = (state) => state.bank.accounts.find((a) => a.id === 'reserve');
function ensureReserveAcct(state) {
  let a = reserveAcct(state);
  if (!a) { a = { id: 'reserve', name: 'Tax reserve', type: 'reserve', balance: 0 }; state.bank.accounts.push(a); }
  return a;
}
const move = (state, amount, from, to, what) => {
  const amt = round2(amount);
  if (amt <= 0) return 0;
  post(state, { amount: -amt, counterparty: to === 'reserve' ? 'Tax reserve' : 'Checking', description: `${what} (internal)`, category: 'transfer', method: 'internal', accountId: from, meta: { app: 'backoffice', noCredit: true } });
  post(state, { amount: amt, counterparty: from === 'reserve' ? 'Tax reserve' : 'Checking', description: `${what} (internal)`, category: 'transfer', method: 'internal', accountId: to, meta: { app: 'backoffice' } });
  return amt;
};

/** Set the share of every deposit to put aside for taxes (0-40%). Envelope banks apply it automatically. */
export function setReserve(state, pct) {
  const b = ensureBackoffice(state);
  if (bank(state).subAccounts === 'none') throw new Error(`${bank(state).label} has a single account: no sub-account for a tax reserve.`);
  b.reserve.pct = round2(Math.max(0, Math.min(0.4, Number(pct) || 0)));
  if (b.reserve.pct > 0) ensureReserveAcct(state);
  return b.reserve;
}
const lastMonthDeposits = (state) => {
  const m = prevMonthKey(monthOf(state));
  return sumBy(state.bank.txns.filter((t) => t.accountId === 'checking' && t.amount > 0 && ['stripe_payout', 'marketplace_payout', 'services_revenue'].includes(t.category) && monthOf(state, t.day) === m), (t) => t.amount);
};
/** Manual banks: move last month's reserve share yourself (0.25 h, charged by the caller). */
export function sweepReserve(state) {
  const b = ensureBackoffice(state);
  if (!(b.reserve.pct > 0)) throw new Error('Set a reserve percentage first.');
  if (bank(state).subAccounts === 'envelopes') throw new Error(`${bank(state).label} moves it automatically on every deposit.`);
  const m = prevMonthKey(monthOf(state));
  if (b.reserve.lastSweepMonth === m) throw new Error(`Last month (${m}) is already swept.`);
  ensureReserveAcct(state);
  const amt = move(state, Math.min(lastMonthDeposits(state) * b.reserve.pct, Math.max(0, state.bank.accounts[0].balance)), 'checking', 'reserve', 'Tax reserve sweep');
  b.reserve.lastSweepMonth = m; b.reserve.sweeps++;
  return amt;
}
export const sweepHours = MANUAL_SWEEP_HOURS;

// ---------------------------------------------------------------------------------------------------------
// Taxes: the startup tax service and the R&D credit (read by money/compliance.js at filing)
// ---------------------------------------------------------------------------------------------------------

export const taxService = (state) => TAX_SERVICES[ensureBackoffice(state).tax] ?? TAX_SERVICES.cpa;
export function setTaxService(state, key) {
  if (!TAX_SERVICES[key]) throw new Error('Unknown tax service.');
  ensureBackoffice(state).tax = key;
}
/** R&D credit for a calendar year: qualified research expenses, the credit and what can be used against payroll tax. */
export function rdCredit(state, year) {
  const inYear = (t) => yearOf(state, t.day) === year && t.amount < 0;
  const wages = -sumBy(state.bank.txns.filter((t) => inYear(t) && t.category === 'payroll'), (t) => t.amount);
  const contractors = -sumBy(state.bank.txns.filter((t) => inYear(t) && t.category === 'contractors'), (t) => t.amount);
  const payrollTax = -sumBy(state.bank.txns.filter((t) => inYear(t) && t.category === 'payroll_tax'), (t) => t.amount);
  const qre = round2(RD_CREDIT.wageShare * (wages + contractors * RD_CREDIT.contractShare));
  const credit = round2(qre * RD_CREDIT.rate);
  const ccorp = state.company.entity === 'ccorp';
  const usable = ccorp ? round2(Math.min(credit, RD_CREDIT.payrollCap, payrollTax)) : 0;
  const tx = taxService(state);
  const fee = tx.rd ? round2(usable * (tx.rdFee ?? 0)) : 0;
  return { year, wages: round2(wages), contractors: round2(contractors), qre, credit, usable, captured: Boolean(tx.rd), fee, net: round2(usable - fee) };
}
/** Called by fileWithCpa: claims the credit (startup tax service) or logs the one the generic CPA left on the table. */
export function settleRdCredit(state, year) {
  const r = rdCredit(state, year);
  const b = ensureBackoffice(state);
  if (r.usable <= 0) return r;
  if (r.captured) {
    post(state, { amount: r.usable, counterparty: 'IRS', description: `R&D credit ${year} applied against payroll tax (Forms 6765 / 8974)`, category: 'taxes', method: 'ach', meta: { app: 'backoffice', rdCredit: year } });
    if (r.fee > 0) post(state, { amount: -r.fee, counterparty: taxService(state).label, description: `R&D credit study fee (${Math.round((taxService(state).rdFee ?? 0) * 100)}% contingency)`, category: 'accounting', method: 'ach' });
    b.stats.rdClaimed = round2(b.stats.rdClaimed + r.net);
  } else if (r.usable >= RD_CREDIT.minToBother) {
    const lost = round2(r.usable * (1 - (TAX_SERVICES.fondo.rdFee ?? 0.2)));
    b.stats.rdMissed = round2(b.stats.rdMissed + lost);
    mistake(state, { functionId: 'bookkeeping_close_tax', id: 'missed_rd_credit', label: 'R&D tax credit never claimed', app: 'books', delayed: true, key: `rd:${year}`, cost: { usd: lost }, detail: `Your ${year} qualified research spend was about ${money(r.qre)} (${money(r.wages)} wages, ${money(r.contractors)} contractors), worth a ${money(r.usable)} payroll-tax credit. The generic CPA filed the return without a credit study. A startup tax service (Fondo-style) or an explicit R&D study would have claimed it, net of a ~20% fee.` });
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------------
// Billing platform and merchant of record
// ---------------------------------------------------------------------------------------------------------

export const billingPlatform = (state) => BILLING_PLATFORMS[ensureStripe(state).settings.billingPlatform ?? 'stripe_billing'] ?? BILLING_PLATFORMS.stripe_billing;
export function setBillingPlatform(state, key) {
  const pl = BILLING_PLATFORMS[key];
  if (!pl) throw new Error('Unknown billing platform.');
  const st = ensureStripe(state);
  if ((st.settings.billingPlatform ?? 'stripe_billing') === key) throw new Error(`Already on ${pl.label}.`);
  st.settings.billingPlatform = key;
  const b = ensureBackoffice(state);
  b.billing = { since: state.day, overkillLogged: false, errors: 0, credits: 0, feesPaid: 0, setupHours: pl.setupHours };
  return pl;
}
export const morProvider = (state) => MOR_PROVIDERS[ensureStripe(state).settings.morProvider ?? 'paddle'] ?? MOR_PROVIDERS.paddle;

function billingMonth(state, b) {
  const st = ensureStripe(state);
  const key = st.settings.billingPlatform ?? 'stripe_billing';
  const pl = billingPlatform(state);
  const m = prevMonthKey(monthOf(state));
  const gross = sumBy(st.charges.filter((c) => c.status !== 'failed' && monthOf(state, c.day) === m), (c) => c.amount);
  // Platform fees beyond Stripe processing (Stripe Billing's own 0.7% is inside the Stripe fee).
  if (key !== 'stripe_billing') {
    const trailing = sumBy(st.charges.filter((c) => c.status !== 'failed' && c.day > state.day - 365), (c) => c.amount);
    const fee = round2(gross * pl.pct + pl.monthly + (pl.allotment && trailing > pl.allotment ? pl.overAllotmentMonthly : 0));
    if (fee > 0) { post(state, { amount: -fee, counterparty: pl.label, description: `${pl.label} platform fee (${m})`, category: 'software', method: 'card', meta: { app: 'backoffice' } }); b.billing.feesPaid = round2((b.billing.feesPaid ?? 0) + fee); }
  }
  const subs = activeSubs(state);
  if (usagePriced(state) && subs.length) {
    const meter = pl.metering;
    queueHours(state, Math.min(12, subs.length * USAGE_BILLING.reconcileHours[meter]));
    let n = 0, credits = 0;
    for (const sub of subs) {
      if (H(b, `usage-err|${m}|${sub.id}`) >= USAGE_BILLING.errorRate[meter]) continue;
      const ch = [...st.charges].reverse().find((c) => c.subId === sub.id && c.status === 'succeeded' && (c.amountRefunded ?? 0) < c.amount);
      if (!ch) continue;
      const amt = round2(Math.min(ch.amount - (ch.amountRefunded ?? 0), ch.amount * USAGE_BILLING.creditShare));
      try { refund(state, ch.id, { amount: amt, reason: 'usage_invoice_error' }); n++; credits += amt; } catch { /* nothing refundable */ }
    }
    if (n) {
      b.billing.errors += n; b.billing.credits = round2(b.billing.credits + credits);
      queueHours(state, n * 0.25);
      if (meter === 'basic' && n >= 2) mistake(state, { functionId: 'payments_dunning', id: 'usage_invoice_errors', label: 'Usage invoices billed wrong on basic metering', app: 'stripe', key: `usageerr:${m}`, cost: { usd: round2(credits), hours: n * 0.25 }, detail: `${n} usage-priced customers disputed their ${m} invoice and got credits (${money(credits)}). Stripe's basic meters were reconciled by hand. Event-stream billing (Metronome, Orb) meters usage and versions plans as code; it pays for itself once pricing is truly usage-based.` });
    }
  }
  // A usage-billing platform on flat or per-seat pricing, or Chargebee under $1M ARR on Stripe alone: fees for nothing.
  const overkill = (pl.metering === 'advanced' && !usagePriced(state)) || (key === 'chargebee' && mrr(state) * 12 < 1_000_000 && state.company.model !== 'ent');
  if (overkill && !b.billing.overkillLogged && state.day - b.billing.since >= USAGE_BILLING.overkillAfterDays) {
    b.billing.overkillLogged = true;
    mistake(state, { functionId: 'payments_dunning', id: 'billing_tool_overkill', label: `${pl.label} without the pricing that needs it`, app: 'stripe', delayed: true, key: `billoverkill:${b.billing.since}`, cost: { usd: b.billing.feesPaid ?? 0, hours: b.billing.setupHours ?? pl.setupHours }, detail: `${pl.label} cost ${money(b.billing.feesPaid ?? 0)} in fees and ~${b.billing.setupHours ?? pl.setupHours}h of integration, but pricing is ${pricingModel(state).replace('_', ' ')}: ${pl.metering === 'advanced' ? 'there is no usage to meter' : 'Stripe Billing already does subscriptions and invoices for a company this size'}. Stripe Billing at 0.7% would have done the same job.` });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Cap table
// ---------------------------------------------------------------------------------------------------------

export const capVendor = (state) => CAP_VENDORS[ensureBackoffice(state).cap.vendor] ?? CAP_VENDORS.spreadsheet;
export function stakeholders(state) {
  const cap = state.apps.fundraising?.cap;
  if (!cap) return 1;
  const names = new Set();
  for (const f of cap.founders ?? []) names.add(`f:${f.name}`);
  for (const c of cap.common ?? []) names.add(`c:${c.name}`);
  for (const g of cap.grants ?? []) names.add(`g:${g.name}`);
  for (const s of cap.safes ?? []) if (s.status !== 'converted') names.add(`s:${s.holder}`);
  for (const p of cap.preferred ?? []) names.add(`p:${p.holder}`);
  return Math.max(1, names.size);
}
const capEntries = (cap) => (cap ? (cap.common?.length ?? 0) + (cap.grants?.length ?? 0) + (cap.safes?.length ?? 0) + (cap.preferred?.length ?? 0) : 0);
export const raisedOnCap = (state) => {
  const cap = state.apps.fundraising?.cap;
  return cap ? sumBy(cap.safes ?? [], (s) => s.amount) + sumBy(cap.preferred ?? [], (p) => p.invested ?? 0) : 0;
};
/** Annual list price for a cap-table vendor today. Carta's free Launch tier only fits ≤25 holders and < ~$1M raised. */
export function capPrice(state, key) {
  const v = CAP_VENDORS[key];
  if (!v) return 0;
  if (key !== 'carta') return v.annual;
  const n = stakeholders(state);
  if (n <= v.freeStakeholders && raisedOnCap(state) < v.freeRaised) return 0;
  return n > v.grow.stakeholders ? v.grow.annual : v.annual;
}
export const capMigrationHours = (state) => round2(CAP_MIGRATION.baseHours + CAP_MIGRATION.perStakeholder * stakeholders(state));
const isDay = (state, iso) => state.day >= dayForIso(state, iso);

function billCap(state, b, price, note) {
  b.cap.price = price; b.cap.nextBill = state.day + 365;
  if (price > 0) post(state, { amount: -price, counterparty: capVendor(state).label, description: `${capVendor(state).label} annual plan${note ? ` (${note})` : ''}`, category: 'software', method: 'card', meta: { app: 'backoffice' } });
}

/** Move the cap table to a vendor (hours are charged by the caller: capMigrationHours). Returns the plan. */
export function chooseCapVendor(state, key, { assisted = false } = {}) {
  const b = ensureBackoffice(state);
  const v = CAP_VENDORS[key];
  if (!v) throw new Error('Unknown cap-table vendor.');
  if (b.cap.vendor === key) throw new Error(`Your cap table is already on ${v.label}.`);
  if (key === 'pulley' && (isDay(state, DATES.pulleyAnnounce) || v.dead)) throw new Error('Pulley is shutting down on Dec 8, 2026 and takes no new customers.');
  if (key === 'angellist' && isDay(state, DATES.angelListClosed)) throw new Error('AngelList closed its standalone cap table to new customers in Aug 2026. Use an RUV to keep angels as one line on a Carta or other cap table.');
  const from = b.cap.vendor;
  // Leaving a spreadsheet: the vendor's onboarding checks every entry against the signed documents.
  if (from === 'spreadsheet' && b.cap.errors > 0) {
    const usd = round2(b.cap.errors * CAP_RECON.usdPerError * 0.5); // no round deadline: half the counsel time [design]
    post(state, { amount: -usd, counterparty: 'Startup law firm', description: `Cap table cleanup at onboarding (${b.cap.errors} entries that did not match the documents)`, category: 'legal', method: 'ach' });
    queueHours(state, b.cap.errors * 1);
    b.cap.cleaned = (b.cap.cleaned ?? 0) + b.cap.errors; b.cap.errors = 0;
  }
  b.cap.history.push({ day: state.day, from, to: key, assisted });
  b.cap.vendor = key; b.cap.since = state.day; b.cap.years = 0;
  let price = capPrice(state, key);
  let note = '';
  if (assisted && from === 'pulley' && key === 'carta') {
    // Carta matches Pulley's year-1 price and credits unused Pulley months; monthly Pulley payers go annual (BOF §0.1).
    const unusedMonths = b.cap.nextBill ? Math.max(0, Math.round((b.cap.nextBill - state.day) / 30.4)) : 0;
    price = Math.max(0, round2(CAP_VENDORS.pulley.annual - unusedMonths * (CAP_VENDORS.pulley.annual / 12)));
    note = 'Pulley price matched for year 1, unused Pulley months credited';
    b.cap.matchedUntil = state.day + 365;
  }
  billCap(state, b, price, note);
  return { vendor: v.label, price };
}

/** 409A cost and who performs it, given the cap-table vendor (people/sim.js get409A reads this). */
export function valuation409A(state) {
  const key = ensureBackoffice(state).cap.vendor;
  const v = CAP_VENDORS[key];
  if (key === 'carta') {
    const paid = (ensureBackoffice(state).cap.price ?? 0) > 0 || capPrice(state, 'carta') > 0;
    return paid ? { cost: 0, counterparty: 'Carta', note: 'Included in Carta Build and above' } : { cost: STANDALONE_409A, counterparty: 'Carta', note: 'Carta 409A bought on its own (~$2,500-4,000 [third-party])' };
  }
  if (v?.separate409a) return { cost: v.separate409a, counterparty: v.label, note: `${v.label} 409A [third-party]` };
  return { cost: 2000, counterparty: 'Independent valuation firm', note: 'Independent appraiser ($1,000-5,000 [design])' };
}

function capDay(state, b) {
  const cap = state.apps.fundraising?.cap;
  // Spreadsheet entries: each new SAFE, grant or issuance has a chance of not matching the signed paper.
  const n = capEntries(cap);
  if (n > b.cap.entries) {
    for (let i = b.cap.entries; i < n; i++) if (b.cap.vendor === 'spreadsheet' && H(b, `cap-entry|${i}`) < CAP_VENDORS.spreadsheet.errorPerEntry) b.cap.errors++;
    b.cap.entries = n;
  }
  // Priced round on a spreadsheet: counsel reconciles every entry under deadline.
  const pref = cap?.preferred?.length ?? 0;
  if (pref > b.cap.prefSeen) {
    b.cap.prefSeen = pref;
    if (b.cap.vendor === 'spreadsheet' && b.cap.errors > 0) {
      const e = b.cap.errors;
      const usd = e * CAP_RECON.usdPerError;
      post(state, { amount: -usd, counterparty: 'Startup law firm', description: `Cap table reconciliation for the priced round (${e} errors)`, category: 'legal', method: 'ach' });
      b.cap.errors = 0;
      mistake(state, { functionId: 'fundraising', id: 'cap_table_spreadsheet', label: 'Spreadsheet cap table reconciled at the priced round', app: 'fundraising', delayed: true, charge: true, key: `caprecon:${state.day}`, cost: { usd, hours: e * CAP_RECON.hoursPerError, days: 7 }, detail: `${e} entr${e === 1 ? 'y' : 'ies'} in the spreadsheet did not match the signed SAFEs, grants or issuances. Company counsel billed ${money(usd)} to reconcile them before closing and the round slipped about a week. Moving the cap table to Carta's free tier (or another system of record) at the first SAFE checks each entry when it is made.` });
    }
  }
  // Annual renewal (Carta renewal uplift [design]).
  if (b.cap.nextBill != null && state.day >= b.cap.nextBill && CAP_VENDORS[b.cap.vendor]?.sel) {
    b.cap.years++;
    const list = capPrice(state, b.cap.vendor);
    const price = b.cap.vendor === 'carta' && list > 0 ? round2(list * (1 + CAP_VENDORS.carta.renewalUplift) ** Math.max(0, b.cap.years - 1)) : list;
    billCap(state, b, price, 'renewal');
  }
  pulleyDay(state, b);
}

// Pulley shutdown: a mid-game event for any company still on Pulley (old saves, earlier start dates, imported setups).
function pulleyDay(state, b) {
  if (b.cap.vendor !== 'pulley') return;
  const P = b.cap.pulley;
  const cutoff = dayForIso(state, DATES.pulleyAssistCutoff), shut = dayForIso(state, DATES.pulleyShutdown), dataEnd = dayForIso(state, DATES.pulleyDataEnd);
  if (isDay(state, DATES.pulleyAnnounce) && !P.announced) {
    P.announced = state.day;
    const th = newThread(state, { subject: 'Pulley is shutting down on December 8, 2026', with: { name: 'Pulley', email: 'support@pulley.example' }, kind: 'vendor', app: 'bank', refId: 'pulley-shutdown' });
    addMessage(state, th.id, { from: 'them', body: `We are winding down Pulley. The last day of service is December 8, 2026.\n\nWe have partnered with Carta for an assisted migration: Carta will match your Pulley pricing for the first year and credit your unused Pulley subscription if you sign by November 30, 2026. Migrating means signing a new Carta contract; monthly plans move to annual or quarterly billing. We cannot assist moves to other providers. Self-serve export ends December 8.\n\nYou can migrate from Bank → Back office.` });
    notify(state, `Pulley is shutting down Dec 8, 2026. Sign with Carta by ${fmtDate(state, cutoff)} for the assisted migration and a year-1 price match (Bank → Back office).`, { type: 'bad', app: 'bank' });
  }
  const left = cutoff - state.day;
  if ([14, 7, 2].includes(left) && !P[`r${left}`]) { P[`r${left}`] = true; notify(state, `${left} days left to sign with Carta for the assisted Pulley migration (price match ends ${fmtDate(state, cutoff)}).`, { type: 'warn', app: 'bank' }); }
  if (state.day > shut && !P.lost) {
    P.lost = state.day;
    const late = state.day > dataEnd;
    const usd = late ? CAP_MIGRATION.rebuild.afterDataEnd : CAP_MIGRATION.rebuild.usd;
    post(state, { amount: -usd, counterparty: 'Startup law firm', description: 'Rebuild cap table from signed documents after Pulley shut down', category: 'legal', method: 'ach' });
    b.cap.vendor = 'spreadsheet'; b.cap.since = state.day; b.cap.nextBill = null; b.cap.price = 0; b.cap.errors = 0;
    notify(state, `Pulley shut down with your cap table still on it. Counsel is rebuilding it from the signed documents (${money(usd)}). Option grants wait until it is done.`, { type: 'bad', app: 'bank' });
    mistake(state, { functionId: 'fundraising', id: 'pulley_missed_migration', label: 'Stayed on Pulley past its shutdown', app: 'bank', delayed: true, charge: true, key: 'pulley-lost', cost: { usd, hours: CAP_MIGRATION.rebuild.hours, days: 21 }, detail: `Pulley announced its shutdown on Sep 16, 2026 with an assisted Carta migration (year-1 price match) open until Nov 30. The cap table was still on Pulley after Dec 8, so it had to be rebuilt from SAFEs, grants and board consents. Migrating before Nov 30 took about two hours.` });
  }
}

/** Migrate off Pulley. Before Nov 30 to Carta = assisted (2 h, price matched); otherwise a self-serve export (8 h, list price). */
export function pulleyMigrationQuote(state, to = 'carta') {
  const assisted = to === 'carta' && state.day <= dayForIso(state, DATES.pulleyAssistCutoff);
  const open = state.day <= dayForIso(state, DATES.pulleyShutdown);
  return { assisted, open, hours: assisted ? CAP_MIGRATION.assistedHours : CAP_MIGRATION.exportHours };
}
export function migrateOffPulley(state, to = 'carta') {
  const b = ensureBackoffice(state);
  if (b.cap.vendor !== 'pulley') throw new Error('Your cap table is not on Pulley.');
  const q = pulleyMigrationQuote(state, to);
  if (!q.open) throw new Error('Pulley has shut down.');
  const res = chooseCapVendor(state, to, { assisted: q.assisted });
  b.cap.pulley.migrated = { day: state.day, to, assisted: q.assisted };
  if (!q.assisted) mistake(state, { functionId: 'fundraising', id: 'pulley_late_migration', label: 'Missed Pulley\'s assisted migration window', app: 'bank', key: 'pulley-late', cost: { hours: q.hours - CAP_MIGRATION.assistedHours, usd: round2(Math.max(0, res.price - CAP_VENDORS.pulley.annual)) }, detail: `Migrated off Pulley on a self-serve export${to === 'carta' ? ' after the Nov 30 assisted cutoff, at Carta list price' : ` to ${CAP_VENDORS[to].label} (Pulley only assists moves to Carta)`}.` });
  return { ...res, ...q };
}

// ---------------------------------------------------------------------------------------------------------
// Mailroom
// ---------------------------------------------------------------------------------------------------------

/** The mailroom actually in effect (a non-US founder has no usable home address; doola bundles one). */
export function mailroom(state) {
  const b = ensureBackoffice(state);
  let k = b.mailroom;
  if (!k) k = legal(state).incorporation?.provider === 'doola' ? 'bundled' : isNonUsFounder(state) ? 'none' : 'home';
  if (k === 'home' && isNonUsFounder(state)) k = 'none';
  return k;
}
export function setMailroom(state, key, { annual = false, agentStates = 0 } = {}) {
  const b = ensureBackoffice(state);
  const m = MAILROOM[key];
  if (!m) throw new Error('Unknown mailroom option.');
  if (key === 'home' && isNonUsFounder(state)) throw new Error('A non-US founder has no US home address to use.');
  state.recurring = state.recurring.filter((r) => !r.mailroom);
  b.mailroom = key;
  if (key === 'stable') {
    const list = annual ? m.annualMonthly : m.monthly;
    const discount = mrr(state) * 12 < 1_000_000 ? m.firstYearDiscount : 0;
    const r = addRecurring(state, { vendor: 'Stable', amount: round2(list * (1 - discount) + agentStates * m.agentPerState), category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)), note: `Virtual mailroom Grow${discount ? ' (50% off year 1)' : ''}${agentStates ? ` + registered agent × ${agentStates}` : ''}` });
    r.mailroom = true; r.list = round2(list + agentStates * m.agentPerState); r.discountUntil = discount ? state.day + 365 : null;
  }
  return mailroom(state);
}

function mailMonth(state, b) {
  const L = legal(state);
  if (!state.company.incorporated) return;
  const k = mailroom(state);
  const mr = MAILROOM[k];
  const m = monthOf(state);
  const foreign = L.incorporation && !['DE', 'nonus'].includes(L.incorporation.operatingState) ? 1 : 0;
  const ps = [NOTICES.perEntity, NOTICES.perEntity, ...(foreign ? [NOTICES.perState] : [])]; // IRS, Delaware/home state, foreign state
  let notices = 0;
  ps.forEach((p, i) => {
    if (H(b, `notice|${m}|${i}`) >= p) return;
    notices++;
    const who = ['IRS', 'Delaware Division of Corporations', `${L.incorporation?.operatingState ?? 'State'} tax department`][i];
    const missed = H(b, `miss|${m}|${i}`) < mr.missChance;
    b.mail.notices.unshift({ day: state.day, who, missed, surfaceDay: state.day + NOTICES.surfaceDays, settled: !missed });
    if (missed) return;
    queueHours(state, NOTICES.handleHours);
    if (k === 'stable' || k === 'bundled') notify(state, `Scanned mail: a notice from the ${who} (${k === 'stable' ? 'Stable' : 'forwarded'}). Handled in a few minutes.`, { type: 'info', app: 'bank' });
  });
  if (b.mail.notices.length > 40) b.mail.notices.length = 40;
  // Stable overage beyond 30 pieces.
  if (k === 'stable') {
    const pieces = NOTICES.piecesBase + 2 * (1 + foreign) + notices + Math.floor(humans(state) / 2);
    if (pieces > mr.pieces) post(state, { amount: -round2((pieces - mr.pieces) * mr.overage), counterparty: 'Stable', description: `Mail overage (${pieces - mr.pieces} pieces)`, category: 'software', method: 'card' });
    const r = state.recurring.find((x) => x.mailroom);
    if (r?.discountUntil != null && state.day >= r.discountUntil) { r.amount = r.list; r.discountUntil = null; }
  }
}
function noticesDay(state, b) {
  for (const n of b.mail.notices) {
    if (n.settled || state.day < n.surfaceDay) continue;
    n.settled = true;
    b.stats.missedNotices++; b.stats.noticePenalties = round2(b.stats.noticePenalties + NOTICES.missedPenalty);
    post(state, { amount: -NOTICES.missedPenalty, counterparty: n.who, description: 'Penalty: notice never answered (mail not received)', category: 'taxes', method: 'ach' });
    notify(state, `A ${n.who} notice sent ${fmtDate(state, n.day)} was never answered: the mail did not reach you. Penalty ${money(NOTICES.missedPenalty)} plus the fix.`, { type: 'bad', app: 'bank' });
    mistake(state, { functionId: 'legal_hygiene', id: 'missed_state_notice', label: 'Missed an official notice (no working mail address)', app: 'bank', delayed: true, charge: true, key: `notice:${n.day}:${n.who}`, cost: { usd: NOTICES.missedPenalty, hours: NOTICES.missedHours }, detail: `The ${n.who} wrote to the company on ${fmtDate(state, n.day)} and nobody saw it (${MAILROOM[mailroom(state)].label}). A virtual mailroom (Stable, ~$49-59/mo) scans every letter the day it arrives.` });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Bookkeeping ledger switches (Books app)
// ---------------------------------------------------------------------------------------------------------

const historyMonths = (state) => Math.min(BOOKS_MIGRATION.maxMonths, new Set(state.bank.txns.map((t) => monthOf(state, t.day))).size);
const expenseFacts = (state) => {
  const out = state.bank.txns.filter((t) => t.amount < 0 && t.day > state.day - 90 && !['transfer', 'owner_draw', 'loan_repayment', 'investment'].includes(t.category));
  const txnsPerYear = state.bank.txns.filter((t) => t.day > state.day - 365 && t.category !== 'transfer').length;
  return { monthlyExpenses: -sumBy(out, (t) => t.amount) / 3, txnsPerYear };
};
export const booksPrice = (state, key) => bookkeepingPrice(key, expenseFacts(state));
export function booksSwitchQuote(state, key) {
  const to = BOOKKEEPING[key];
  if (!to) throw new Error('Unknown bookkeeping option.');
  if (to.dead) throw new Error('Bench shut down overnight on Dec 27, 2024. Its customers lost access to their books; pick a vendor whose ledger you can export.');
  if (to.legacy) throw new Error('That plan is no longer sold.');
  const from = service(state);
  const same = from.ledger === to.ledger;
  const months = historyMonths(state);
  const errors = misclassified(state).length;
  const hours = round2(BOOKS_MIGRATION.onboardingHours + (same ? 0 : months * BOOKS_MIGRATION.perMonthHours * (to.paradigm === 'service' ? 0.3 : 1)));
  const conversion = !same && ['qbo', 'xero'].includes(from.ledger) && ['qbo', 'xero'].includes(to.ledger) ? BOOKS_MIGRATION.conversionFee : 0;
  const cleanup = to.paradigm === 'service' ? round2(errors * BOOKS_MIGRATION.cleanupPerError) : 0;
  return { hours, usd: round2(conversion + cleanup), conversion, cleanup, months: same ? 0 : months, errors, same, price: booksPrice(state, key) };
}
export function switchBooks(state, key) {
  const q = booksSwitchQuote(state, key);
  const b = ensureBooks(state);
  const bo = ensureBackoffice(state);
  if (b.service === key) throw new Error('Already your bookkeeping setup.');
  const to = BOOKKEEPING[key];
  if (q.usd > 0) post(state, { amount: -q.usd, counterparty: to.vendor ?? 'Bookkeeper', description: `Books migration${q.conversion ? ': history conversion' : ''}${q.cleanup ? `: cleanup of ${q.errors} miscategorized transactions` : ''}`, category: 'accounting', method: 'card' });
  state.recurring = state.recurring.filter((r) => !r.bookkeeping);
  if (q.price) { const r = addRecurring(state, { vendor: to.vendor, amount: q.price, category: 'accounting', dayOfMonth: 1, note: `Bookkeeping: ${to.label}` }); r.bookkeeping = true; r.bookkeepingKey = key; }
  const prev = bo.booksSwitches.filter((s) => state.day - s.day <= BOOKS_MIGRATION.circleWindowDays && !s.same);
  bo.booksSwitches.push({ day: state.day, from: b.service, to: key, same: q.same });
  b.service = key; b.serviceSince = state.day;
  if (prev.length && !q.same) mistake(state, { functionId: 'bookkeeping_close_tax', id: 'ledger_hopping', label: 'Moved the books to another ledger again', app: 'books', circles: true, key: `ledgerhop:${state.day}`, cost: { hours: q.hours, usd: q.usd }, detail: `Second ledger migration in ${BOOKS_MIGRATION.circleWindowDays} days (${prev.map((s) => s.to).join(', ')} → ${key}): ${q.months} months of history re-mapped again. Pick the ledger for where the company will be in two years (accrual and investor metrics if you will raise) and stay.` });
  return q;
}
// Tiered bookkeeping prices follow trailing expenses (Pilot recalculates on trailing 3 months).
function repriceBooks(state) {
  const r = state.recurring.find((x) => x.bookkeeping);
  if (!r) return;
  const key = r.bookkeepingKey ?? ensureBooks(state).service;
  const p = booksPrice(state, key);
  if (p > 0 && Math.abs(p - r.amount) >= 1) r.amount = p;
}

// ---------------------------------------------------------------------------------------------------------
// Daily tick (called from the Bank app's onDay)
// ---------------------------------------------------------------------------------------------------------

const NOT_BILLS = new Set(['payroll', 'payroll_tax', 'taxes', 'transfer', 'loan_repayment', 'owner_draw', 'investment', 'owner_contribution', 'loan']);

function scanTxns(state, b) {
  const txns = state.bank.txns;
  if (b.scan > txns.length) b.scan = txns.length;
  const start = b.scan, end = txns.length;
  const mode = apMode(state);
  const relay = bank(state).subAccounts === 'envelopes';
  for (let i = start; i < end; i++) {
    const t = txns[i];
    if (t.meta?.app === 'backoffice') continue;
    if ((t.accountId ?? 'checking') !== 'checking') continue;
    if (t.method === 'card' && t.amount < 0) { const m = monthOf(state, t.day); b.cardSpend[m] = round2((b.cardSpend[m] ?? 0) - t.amount); }
    // Envelope banking: every deposit is split by rule.
    if (relay && b.reserve.pct > 0 && t.amount > 0 && ['stripe_payout', 'marketplace_payout', 'services_revenue'].includes(t.category)) {
      ensureReserveAcct(state);
      b.stats.autoAllocated = round2(b.stats.autoAllocated + move(state, t.amount * b.reserve.pct, 'checking', 'reserve', 'Envelope rule: tax reserve'));
    }
    // Tax payments draw on the reserve first; an unfunded one can bounce (IRC §6657).
    if (t.category === 'taxes' && t.amount <= -100) {
      const res = reserveAcct(state);
      const covered = res ? move(state, Math.min(res.balance, -t.amount), 'reserve', 'checking', 'Tax paid from reserve') : 0;
      if (covered > 0) b.stats.reservedTax = round2(b.stats.reservedTax + covered);
      else b.stats.unreservedTax = round2(b.stats.unreservedTax - t.amount);
      if (t.balanceAfter + covered < 0) {
        const pay = -t.amount;
        const pen = round2(pay >= DISHONORED.threshold ? pay * DISHONORED.pct : Math.min(DISHONORED.flat, pay));
        post(state, { amount: -pen, counterparty: t.counterparty || 'IRS', description: 'Dishonored payment penalty (insufficient funds)', category: 'taxes', method: 'ach', meta: { app: 'backoffice' } });
        b.stats.dishonored++; b.stats.dishonoredUsd = round2(b.stats.dishonoredUsd + pen);
        mistake(state, { functionId: 'cash_runway', id: 'tax_payment_bounced', label: 'Tax payment bounced: the tax money had been spent', app: 'bank', key: `bounce:${t.id}`, charge: true, cost: { usd: pen, hours: 1 }, detail: `${t.description || 'A tax payment'} of ${money(pay)} hit an account that could not cover it: ${money(pen)} dishonored-payment penalty on top. A tax reserve (an envelope rule on every deposit, or a monthly sweep) keeps that money out of operating cash.` });
      }
    }
    // Vendor bills paid by ACH or wire.
    if (t.amount < 0 && ['ach', 'wire'].includes(t.method) && !NOT_BILLS.has(t.category)) {
      b.stats.bills++;
      queueHours(state, BILL_PAY[mode].hours);
      if (H(b, `late|${t.day}|${t.amount}|${t.counterparty}|${i}`) < BILL_PAY[mode].lateChance) {
        const fee = round2(Math.max(BILL_PAY.lateFee.min, -t.amount * BILL_PAY.lateFee.pct));
        post(state, { amount: -fee, counterparty: t.counterparty, description: 'Late payment fee', category: t.category, method: 'ach', meta: { app: 'backoffice' } });
        b.stats.lateBills++; b.stats.lateFees = round2(b.stats.lateFees + fee);
        mistake(state, { functionId: 'bookkeeping_close_tax', id: 'late_vendor_bill', label: 'Vendor bill paid late', app: 'bank', key: `latebill:${i}:${t.day}`, cost: { usd: fee, hours: 0.25 }, detail: `${t.counterparty} charged ${money(fee)} for a late payment (bills entered and scheduled by hand). Automated bill pay (Rho, or Ramp/Brex bill pay) captures, approves and schedules each bill before its due date.` });
      }
    }
  }
  b.scan = txns.length;
}

function monthStart(state, b) {
  const prev = prevMonthKey(monthOf(state));
  const s = ensureSpend(state);
  // Card rewards on last month's card spend.
  const v = SPEND_VENDORS[s.vendor ?? 'ramp'];
  if (programOn(state) && v && b.cardSpend[prev] > 0) {
    const rate = Math.max(0, v.cashback - (s.vendor === 'brex' ? b.integration.rewardCut : 0));
    const amt = round2(b.cardSpend[prev] * rate);
    if (amt >= 1) { post(state, { amount: amt, counterparty: `${v.label} rewards`, description: `${v.label} card rewards (${prev})`, category: 'refund_in', method: 'ach', meta: { app: 'backoffice' } }); b.stats.cashback = round2(b.stats.cashback + amt); }
  }
  for (const k of Object.keys(b.cardSpend)) if (k < prev) delete b.cardSpend[k];
  // Ramp price intelligence: unused tools flagged without an audit.
  if (programOn(state) && (s.vendor ?? 'ramp') === 'ramp') {
    for (const row of stackRows(state)) if (row.unused && !b.flagged[row.vendor]) { b.flagged[row.vendor] = state.day; notify(state, `Ramp flagged ${row.vendor} ($${row.monthly}/mo): no activity in 30+ days. Cancel or downgrade it in Bank → Stack audit.`, { type: 'info', app: 'bank' }); }
  }
  // Brex inside Capital One: integration notices (re-verification, changed terms) [design].
  const onBrex = (programOn(state) && s.vendor === 'brex') || b.bank === 'brex';
  const q = `${monthOf(state).slice(0, 4)}-${Math.floor(monthIndex(state) / 3)}`;
  if (onBrex && [0, 3, 6, 9].includes(monthIndex(state)) && b.integration.lastQuarter !== q) {
    b.integration.lastQuarter = q;
    if (H(b, `brex|${q}`) < INTEGRATION.perQuarter) {
      b.integration.events++;
      b.integration.rewardCut = round2(Math.min(0.005, b.integration.rewardCut + INTEGRATION.rewardCut));
      queueHours(state, INTEGRATION.hours);
      const th = newThread(state, { subject: 'Updates to your Brex account as part of Capital One', with: { name: 'Brex', email: 'notices@brex.example' }, kind: 'vendor', app: 'bank', refId: `brex-${q}` });
      addMessage(state, th.id, { from: 'them', body: 'As Brex integrates with Capital One, we need you to re-verify your beneficial owners and accept updated program terms. Some rewards rates change next quarter. Please complete this within 30 days to avoid interruption.' });
      notify(state, 'Brex (now Capital One) asked for re-verification and changed reward terms: ~1.5h of admin.', { type: 'warn', app: 'bank' });
    }
  }
  // Manual reserve sweeps: a month without one leaves tax money in operating cash.
  if (b.reserve.pct > 0 && bank(state).subAccounts !== 'envelopes' && b.reserve.checkedMonth !== prev) {
    const p2 = prevMonthKey(prev);
    if (b.reserve.lastSweepMonth && b.reserve.lastSweepMonth < p2) b.reserve.missedSweeps++;
    b.reserve.checkedMonth = prev;
  }
  billingMonth(state, b);
  mailMonth(state, b);
  repriceBooks(state);
}

export function backofficeDay(state) {
  if (!state.bank?.txns) return;
  const b = ensureBackoffice(state);
  scanTxns(state, b);
  capDay(state, b);
  noticesDay(state, b);
  if (dayOfMonth(state) === 1) monthStart(state, b);
  if (dayOfWeek(state) === 1) chargePending(state, b);
}

// ---------------------------------------------------------------------------------------------------------
// Grade: does the stack fit the company? (per area, with what a stellar operator would do)
// ---------------------------------------------------------------------------------------------------------

export function stackFacts(state) {
  const st = ensureStripe(state);
  const arr = mrr(state) * 12;
  const raised = sumBy(state.bank.txns.filter((t) => t.category === 'investment' && t.amount > 0), (t) => t.amount) + raisedOnCap(state);
  const bills = state.bank.txns.filter((t) => t.day > state.day - 30 && t.amount < 0 && ['ach', 'wire'].includes(t.method) && !NOT_BILLS.has(t.category)).length;
  const intlB2c = state.company.model === 'b2c';
  return {
    arr, raised, bills, humans: humans(state), vc: state.company.path === 'vc', entity: state.company.entity ?? 'none', incorporated: Boolean(state.company.incorporated),
    usage: usagePriced(state), mor: Boolean(st.settings.merchantOfRecord), intlB2c, nonUs: isNonUsFounder(state), stakeholders: stakeholders(state),
    rdSpend: -sumBy(state.bank.txns.filter((t) => t.day > state.day - 365 && ['payroll', 'contractors'].includes(t.category) && t.amount < 0), (t) => t.amount),
    cash: totalCash(state), invoices: state.company.model === 'ent',
  };
}

export function gradeBackOffice(state) {
  const f = stackFacts(state);
  const b = ensureBackoffice(state);
  const areas = [];
  const add = (id, label, score, why, stellar) => areas.push({ id, label, score: round2(Math.max(0, Math.min(1, score))), why, stellar: score >= 0.95 ? '' : stellar });
  const personal = Boolean(state.bank.accounts[0]?.personal);
  // Banking
  {
    let s = personal ? (f.incorporated ? 0.1 : 0.6) : 0.7;
    const why = [];
    if (!personal) {
      const taxDue = f.entity === 'ccorp' || f.arr > 20000;
      if (taxDue) { if (b.reserve.pct >= 0.1 && (bank(state).subAccounts === 'envelopes' || b.reserve.missedSweeps === 0)) { s += 0.15; why.push('tax reserve funded'); } else why.push('no working tax reserve'); }
      else s += 0.15;
      if (f.bills >= 8) { if (apMode(state) === 'automated') { s += 0.15; why.push('AP automated'); } else { s -= 0.05; why.push(`${f.bills} bills a month typed in by hand`); } }
      else s += 0.15;
      if (f.cash >= 250000 && !state.bank.accounts.some((a) => a.id === 'treasury' && a.balance > 0)) { s -= 0.2; why.push('idle cash earning 0%'); }
      if (b.bank === 'brex') { s -= 0.1; why.push('bank inside an acquisition integration'); }
      if (b.stats.dishonored) { s -= 0.2; why.push('a tax payment bounced'); }
    }
    add('bank', 'Banking', s, why.join('; ') || (personal ? 'still on personal checking' : ''), personal ? 'Open a business account the week the EIN arrives.' : 'Keep taxes in a reserve account (Relay does it on every deposit; on Mercury or Rho sweep monthly), automate bill pay once bills pile up, and put idle cash over $250K in Treasury.');
  }
  // Spend
  {
    const sp = ensureSpend(state);
    const need = f.humans >= 3;
    let s = 0.8;
    const why = [];
    if (need && !programOn(state)) { s = 0.35; why.push(`${f.humans} people on one shared debit card`); }
    if (!need && sp.plan === 'plus') { s = 0.5; why.push('paying per-user Plus for a team of one or two'); }
    if (programOn(state)) { if ((sp.vendor ?? 'ramp') === 'ramp') { s += 0.2; why.push('Ramp: AI coding at the swipe, savings flags'); } else { s += 0.05; why.push('Brex: integration risk inside Capital One'); } }
    else if (!need) s = 0.85;
    add('spend', 'Cards & spend', s, why.join('; '), 'Run cards through a spend program once teammates spend (Ramp Free; Plus at ~5 people for the AI agent and approvals) on top of your bank.');
  }
  // Books
  {
    const sv = service(state);
    let s = 0.6;
    const why = [`${sv.label}`];
    const raising = f.vc && (f.raised > 0 || state.apps.fundraising?.round?.status === 'open');
    if (raising) { s = sv.accrual ? (sv.metrics ? 1 : 0.75) : 0.25; if (!sv.accrual) why.push('cash-only books for an investor-backed company'); }
    else if (f.arr < 24000) { s = sv.price > 150 ? 0.45 : sv.ledger === 'sheet' ? 0.7 : 0.95; if (sv.price > 150) why.push('paying full-service prices pre-revenue'); }
    else s = sv.accrual ? 0.9 : 0.6;
    const hops = b.booksSwitches.filter((x) => !x.same && state.day - x.day <= 365).length;
    if (hops >= 2) { s -= 0.25; why.push('moved ledgers twice'); }
    add('books', 'Books', s, why.join('; '), raising ? 'Investors want accrual books and ARR/burn/runway: Pilot, Puzzle or Digits, on a ledger you can export.' : 'Pre-revenue, a free AI tool (Kick) or DIY is enough; move to accrual books before you raise, once.');
  }
  // Tax
  if (f.entity === 'ccorp') {
    const rd = f.rdSpend > 20000;
    const s = taxService(state).rd ? 1 : rd ? 0.45 : 0.85;
    add('tax', 'Tax', s, `${taxService(state).label}${rd ? `; ${money(f.rdSpend)} of payroll and contractors in the last year` : ''}`, 'A C-corp paying engineers should use a startup tax service that runs the R&D credit study (6% of qualified spend against payroll tax).');
  }
  // Billing
  {
    const pl = billingPlatform(state);
    let s = f.usage ? (pl.metering === 'advanced' ? 1 : activeSubs(state).length > 20 ? 0.5 : 0.8) : (pl.metering === 'advanced' ? 0.3 : pl === BILLING_PLATFORMS.chargebee && f.arr < 1_000_000 ? 0.45 : 1);
    const why = [pl.label];
    if (f.mor) {
      const p = morProvider(state);
      why.push(`MoR: ${p.label}`);
      if (f.invoices && !p.invoicing) { s -= 0.3; why.push('enterprise invoices on an MoR without invoicing'); }
      if (!f.intlB2c && f.invoices) s -= 0.1;
      if (p === MOR_PROVIDERS.lemon) { s -= 0.1; why.push('Lemon Squeezy roadmap risk'); }
    } else if (f.intlB2c && !(state.apps.books?.vat?.registered)) { s -= 0.25; why.push('selling to EU/UK consumers with no MoR and no VAT registration'); }
    add('billing', 'Billing & payments', s, why.join('; '), f.usage ? 'Usage pricing needs event metering (Metronome inside Stripe, Orb) once usage invoices are more than a handful.' : 'Flat or seat pricing: Stripe Billing at 0.7% is the whole job; add an MoR (Paddle, or Stripe Managed Payments to keep your Stripe account) only for global consumer sales.');
  }
  // Cap table
  if (f.entity === 'ccorp') {
    const k = b.cap.vendor;
    let s;
    if (k === 'pulley') s = state.day > dayForIso(state, DATES.pulleyAssistCutoff) ? 0.1 : 0.4;
    else if (k === 'spreadsheet') s = f.stakeholders <= 4 && !(state.apps.fundraising?.cap?.preferred?.length) ? 0.75 : 0.3;
    else if (k === 'carta') s = capPrice(state, 'carta') === 0 || f.stakeholders > 25 || f.raised >= 1_000_000 ? 1 : 0.8;
    else s = 0.9;
    add('cap', 'Cap table', s, `${CAP_VENDORS[k]?.label ?? k}, ${f.stakeholders} holder(s)`, 'Put the cap table in a system of record at the first SAFE (Carta\'s free tier to ~25 holders, or Cake/Fidelity); never stay on a vendor that is shutting down.');
  }
  // Contracts
  if (state.company.model !== 'b2c') {
    const L = legal(state);
    const counsel = L.counsel ?? 'diy';
    const clm = L.clm ?? 'none';
    let s = counsel === 'crosby' ? 1 : counsel === 'lawyer' ? 0.85 : (L.exposure ?? 0) >= 2 ? 0.3 : 0.7;
    if (['juro', 'ironclad'].includes(clm)) s -= 0.35;
    add('contracts', 'Contracts', s, `${counsel === 'diy' ? 'you negotiate redlines yourself' : counsel === 'crosby' ? 'Crosby reviews each document' : 'a law firm reviews redlines'}${clm !== 'none' ? `; ${clm}` : ''}`, 'Send customer paper to lawyer-in-the-loop counsel (Crosby: fixed price, redline back in about an hour); skip CLM software until you sign hundreds of contracts a year.');
  }
  // Mailroom
  if (f.incorporated) {
    const k = mailroom(state);
    const s = k === 'stable' || k === 'bundled' ? 1 : k === 'home' ? 0.8 : 0.2;
    add('mail', 'Mail', s, MAILROOM[k].label, f.nonUs ? 'A non-US founder needs a US address that scans mail (Stable, or the doola/Firstbase bundle).' : 'A virtual mailroom keeps your home address off filings and scans every notice the day it arrives.');
  }
  const score = areas.length ? round2(areas.reduce((a, x) => a + x.score, 0) / areas.length) : null;
  const tier = score == null ? 'unknown' : score >= 0.85 ? 'stellar' : score >= 0.7 ? 'good' : score >= 0.5 ? 'average' : 'mediocre';
  return { score, tier, areas, facts: f };
}
