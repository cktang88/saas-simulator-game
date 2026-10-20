// General ledger for the Books app. Pure (no DOM), deterministic, testable in Node.
//
// Two sources feed the ledger:
//  1. Bank transactions (state.bank.txns) — journaled on the fly every time reports are built, using the
//     *books* category of each transaction (the AI bookkeeper's guess until the founder reviews it).
//     Dr cash / Cr mapped account (or the reverse for money out).
//  2. Stripe activity — journaled incrementally into state.apps.books.journal[YYYY-MM] by syncLedger(), because
//     core/stripe.js compacts charges older than 120 days. Each successful charge is booked to Stripe clearing
//     (net of fees) and to Deferred revenue, then recognized ratably per day over its service period (ASC 606
//     step 5). Refunds and disputes reverse the unrecognized part out of deferred revenue and the recognized
//     part into contra-revenue. Payouts are bank transactions that credit Stripe clearing.
//     Enterprise invoices (net-30, ACH) are booked to Accounts receivable when issued (Dr 1100 / Cr 2500) and
//     cleared when paid (Dr 1050 net + Dr 5100 fee / Cr 1100); invoices written off at due + 120 days reverse
//     what is still deferred and book the rest as bad debt. Stripe Capital (and other Stripe-serviced financing)
//     withholdings are Dr 2600 principal + Dr 7100 interest/fee / Cr 1050.
// Amounts are stored debit-positive (credits negative); every entry sums to zero, so the balance sheet balances.

import { ensure } from '../../core/state.js';
import { ensureStripe, customerById, subscriptionById } from '../../core/stripe.js';
import { PAYMENTS } from '../../core/params.js';
import { monthOf, frac, txnKey, catKind, yearOf, customerRegion, monthsBetween, prevMonthKey, nextMonthKey, monthEndDay, sumBy } from './common.js';
import { BOOKKEEPING } from './catalog.js';
import { receiptFactor } from './spend.js';
import { recordClaims } from '../../core/integrity.js';
import { hash } from '../../core/util.js';

// Chart of accounts (research §3.3, trimmed to what the simulation produces).
export const COA = {
  1000: { name: 'Operating checking (Mercury)', type: 'asset' },
  1010: { name: 'Treasury (T-bills / money market)', type: 'asset' },
  1020: { name: 'Tax reserve account', type: 'asset' },
  1050: { name: 'Stripe clearing', type: 'asset' },
  1090: { name: 'Transfers in transit', type: 'asset' },
  1100: { name: 'Accounts receivable (open invoices)', type: 'asset' },
  1200: { name: 'Prepaid expenses', type: 'asset' },
  2200: { name: 'Accrued expenses', type: 'liability' },
  2500: { name: 'Deferred revenue', type: 'liability' },
  2600: { name: 'Loans payable (incl. founder loans)', type: 'liability' },
  3100: { name: 'SAFEs & equity investment', type: 'equity' },
  3200: { name: 'Owner contributions / paid-in capital', type: 'equity' },
  3300: { name: 'Owner draws / distributions', type: 'equity' },
  3999: { name: 'Opening balance equity', type: 'equity' },
  4000: { name: 'Subscription revenue', type: 'revenue' },
  4100: { name: 'Marketplace revenue (net payouts)', type: 'revenue' },
  4200: { name: 'Services revenue (consulting / client projects)', type: 'revenue' },
  4900: { name: 'Refunds', type: 'revenue' },
  4910: { name: 'Chargebacks (disputes)', type: 'revenue' },
  5000: { name: 'Hosting & infrastructure', type: 'cogs' },
  5010: { name: 'AI inference / LLM API', type: 'cogs' },
  5100: { name: 'Payment processing fees (Stripe / MoR)', type: 'cogs' },
  5110: { name: 'Dispute fees', type: 'cogs' },
  6000: { name: 'Salaries & wages', type: 'opex' },
  6005: { name: 'Contractors', type: 'opex' },
  6050: { name: 'Payroll taxes & benefits', type: 'opex' },
  6010: { name: 'Software & dev tools', type: 'opex' },
  6030: { name: 'Recruiting (agency fees, job boards)', type: 'opex' },
  6100: { name: 'Advertising', type: 'opex' },
  6120: { name: 'Marketing', type: 'opex' },
  6210: { name: 'Legal', type: 'opex' },
  6220: { name: 'Accounting & bookkeeping', type: 'opex' },
  6260: { name: 'State taxes & government fees', type: 'opex' },
  6270: { name: 'Travel & meals', type: 'opex' },
  6900: { name: 'Bad debt (written-off invoices)', type: 'opex' },
  6990: { name: 'Other expenses', type: 'opex' },
  6999: { name: 'Uncategorized (ask my accountant)', type: 'opex' },
  7000: { name: 'Interest income', type: 'other' },
  7100: { name: 'Interest expense & financing fees', type: 'other' },
  7200: { name: 'Other income (vendor refunds)', type: 'other' },
  7300: { name: 'Grant income (SBIR etc.)', type: 'other' },
  8000: { name: 'Income tax expense', type: 'tax' },
};
const PL_TYPES = new Set(['revenue', 'cogs', 'opex', 'other', 'tax']);
export const isPL = (acct) => PL_TYPES.has(COA[acct]?.type);

const CAT_ACCOUNT = {
  stripe_payout: '1050', owner_contribution: '3200', investment: '3100', loan: '2600', loan_repayment: '2600',
  interest: '7000', refund_in: '7200', payroll: '6000', payroll_tax: '6050', contractors: '6005', software: '6010',
  ai_inference: '5010', hosting: '5000', advertising: '6100', marketing: '6120', legal: '6210', accounting: '6220',
  taxes: '6260', owner_draw: '3300', travel: '6270', other: '6990', uncategorized: '6999', transfer: '1090',
  loan_interest: '7100', interest_expense: '7100', payment_fees: '5100', marketplace_payout: '4100', sponsorship_income: '4100', services_revenue: '4200', grant: '7300',
  recruiting: '6030',
};
export function accountForCategory(cat, txn = null) {
  if (cat === 'taxes' && txn?.meta?.incomeTax) return '8000';
  if (CAT_ACCOUNT[cat]) return CAT_ACCOUNT[cat];
  const k = catKind(cat);
  return k === 'income' ? '7200' : k === 'equity' ? '3200' : k === 'liability' ? '2600' : k === 'cogs' ? '5000' : '6990';
}
// GL cash account for a bank account id (checking, Treasury, the tax-reserve sub-account from money/backoffice.js).
export const glFor = (id) => (id === 'treasury' ? '1010' : id === 'reserve' ? '1020' : '1000');
export const cashAccountFor = (txn) => glFor(txn.accountId);

// ---- Books slice ----

export function ensureBooks(state) {
  const b = ensure(state, 'books', () => ({
    service: 'diy',
    serviceSince: state.day,
    cats: {}, // txnId -> { cat, by: 'you'|'service'|'rule', day }
    rules: {}, // counterparty -> category
    closed: {}, // 'YYYY-MM' -> { day }
    close: {}, // 'YYYY-MM' -> { items: { id: 'done'|'na' } }
    journal: {}, // 'YYYY-MM' -> { acct: debit-positive amount }
    cash: {}, // 'YYYY-MM' -> { gross, refunds, chargebacks, fees }
    schedules: [], // revenue recognition: { id (chargeId), perDay, start, len, done }
    sync: { day: -1, ids: [], disputes: {}, recognizedThrough: -1 },
    sales: {}, // year -> { US state -> gross }
    vat: { registered: false, registeredDay: null, exposure: 0, intlB2cSales: 0, firstSaleDay: null, payable: 0 },
    nexus: {}, // state -> { crossedDay, registered, registeredDay }
    compliance: {}, // itemId -> { status, day, amount, note }
    paidFilings: {}, // filing key -> { day, amount } (shared key space with the Legal app)
    adjustments: [], // manual journal entries: { id, month, kind, lines: [{ month, acct, amount }], memo, day }
    needsOpening: true,
  }));
  b.vat ??= { registered: false, registeredDay: null, exposure: 0, intlB2cSales: 0, firstSaleDay: null, payable: 0 };
  b.nexus ??= {};
  b.compliance ??= {};
  b.paidFilings ??= {};
  b.adjustments ??= [];
  b.ar ??= {}; // invoiceId -> { amount, month } for enterprise invoices booked to 1100 and not yet paid/written off
  b.sync.capIds ??= [];
  return b;
}
export const service = (state) => BOOKKEEPING[ensureBooks(state).service] ?? BOOKKEEPING.diy;

// ---- Categorization (the AI bookkeeper's guess vs the truth) ----

// Categories that are matched by deterministic bank rules and never guessed wrong.
const AUTO = new Set(['stripe_payout', 'transfer']);
// The mistakes AI categorizers really make: inference vs subscriptions, hosting vs software, ads vs marketing,
// and the classic one: booking an owner contribution as income. [design]
export const CONFUSE = {
  ai_inference: 'software', hosting: 'software', software: 'hosting', contractors: 'software', advertising: 'marketing',
  marketing: 'advertising', legal: 'accounting', accounting: 'legal', taxes: 'legal', payroll_tax: 'payroll',
  payroll: 'contractors', owner_contribution: 'refund_in', investment: 'loan', loan: 'owner_contribution', travel: 'marketing',
  interest: 'refund_in', owner_draw: 'payroll', other: 'software', loan_interest: 'loan_repayment', recruiting: 'contractors',
  grant: 'investment',
};
export const CATEGORY_CHOICES = ['software', 'ai_inference', 'hosting', 'contractors', 'payroll', 'payroll_tax', 'recruiting', 'advertising', 'marketing', 'legal', 'accounting', 'taxes', 'travel', 'other', 'interest', 'refund_in', 'grant', 'owner_contribution', 'investment', 'loan', 'loan_repayment', 'loan_interest', 'owner_draw', 'uncategorized'];

export function guessCategory(state, txn) {
  const truth = txn.category;
  if (AUTO.has(truth)) return truth;
  const wrong = CONFUSE[truth];
  // A receipt with a memo tells the categorizer what the charge was; a missing one makes it guess worse (spend.js).
  if (wrong && frac(`${txnKey(txn)}:guess`) < service(state).errorRate * receiptFactor(state, txn)) return wrong;
  return truth;
}
export function bookCategory(state, txn) {
  const b = ensureBooks(state);
  const c = b.cats[txn.id];
  if (c) return c.cat;
  const rule = b.rules[txn.counterparty];
  if (rule && !AUTO.has(txn.category)) return rule;
  return guessCategory(state, txn);
}
export function isReviewed(state, txn) {
  const b = ensureBooks(state);
  return Boolean(b.cats[txn.id]) || AUTO.has(txn.category) || Boolean(b.rules[txn.counterparty]);
}
export const reviewQueue = (state, month = null) => state.bank.txns.filter((t) => !isReviewed(state, t) && (!month || monthOf(state, t.day) === month));
// A booked category is wrong when it differs from what the money was really for. 'uncategorized'/'other'
// truths accept any reasonable choice.
export const isMisclassified = (state, txn) => !['uncategorized', 'other'].includes(txn.category) && bookCategory(state, txn) !== txn.category;
export const misclassified = (state, filter = () => true) => state.bank.txns.filter((t) => filter(t) && isMisclassified(state, t));

export const isLocked = (state, day) => Boolean(ensureBooks(state).closed[monthOf(state, day)]);

export function categorize(state, txnId, cat, { rule = false, by = 'you' } = {}) {
  const b = ensureBooks(state);
  const t = state.bank.txns.find((x) => x.id === txnId);
  if (!t) throw new Error('Transaction not found');
  if (AUTO.has(t.category)) throw new Error('Stripe payouts and internal transfers are matched by bank rules.');
  if (isLocked(state, t.day)) throw new Error(`${monthOf(state, t.day)} is closed and locked. Reopen it in Books → Close first.`);
  b.cats[t.id] = { cat, by, day: state.day };
  if (rule) {
    b.rules[t.counterparty] = cat;
    // Apply to every unlocked, unreviewed transaction from the same counterparty.
    for (const o of state.bank.txns) if (o.counterparty === t.counterparty && !b.cats[o.id] && !isLocked(state, o.day) && !AUTO.has(o.category)) b.cats[o.id] = { cat, by: 'rule', day: state.day };
  }
}

// Human-reviewed services confirm their own guesses after ~3 days.
export function serviceAutoReview(state) {
  const sv = service(state);
  if (!sv.autoReview) return 0;
  const b = ensureBooks(state);
  let n = 0;
  for (const t of state.bank.txns) {
    if (t.day > state.day - 3 || isReviewed(state, t) || isLocked(state, t.day)) continue;
    b.cats[t.id] = { cat: guessCategory(state, t), by: 'service', day: state.day };
    n++;
  }
  return n;
}

// ---- Stripe → ledger sync ----

function add(b, month, acct, amt) {
  if (!amt) return;
  const j = (b.journal[month] ??= {});
  j[acct] = (j[acct] ?? 0) + amt;
}
function addCash(b, month, field, amt) {
  const c = (b.cash[month] ??= { gross: 0, refunds: 0, chargebacks: 0, fees: 0 });
  c[field] = (c[field] ?? 0) + amt;
}
// The service period a subscription charge made on `day` covers: the period core/stripe.js started that day (calendar
// month or year), else the nominal length of the plan's interval.
const periodDays = (sub, day) => (!sub ? 1 : sub.currentPeriodStart === day && sub.currentPeriodEnd > day ? sub.currentPeriodEnd - day : sub.interval === 'year' ? 365 : sub.interval === 'week' ? 7 : 30);

export function stripeBalanceActual(state) {
  const st = ensureStripe(state);
  return st.available + sumBy(st.pending, (p) => p.amount) + sumBy(st.payouts.filter((p) => p.status === 'in_transit'), (p) => p.amount);
}

function takeSchedule(b, chargeId) {
  const i = b.schedules.findIndex((s) => s.id === chargeId);
  if (i < 0) return 0;
  const s = b.schedules[i];
  b.schedules.splice(i, 1);
  return s.perDay * (s.len - s.done);
}

// Partial refund: reverse `share` of what is still deferred and scale the rest of the schedule down.
function shrinkSchedule(b, chargeId, share) {
  const s = b.schedules.find((x) => x.id === chargeId);
  if (!s) return 0;
  const k = Math.min(1, Math.max(0, share));
  const rev = s.perDay * (s.len - s.done) * k;
  s.perDay *= 1 - k;
  return rev;
}

function recognizeOne(state, b, id, through) {
  const s = b.schedules.find((x) => x.id === id);
  if (!s) return;
  const target = Math.min(s.len, through - s.start + 1);
  while (s.done < target) {
    const m = monthOf(state, s.start + s.done);
    add(b, m, '2500', s.perDay);
    add(b, m, '4000', -s.perDay);
    s.done++;
  }
}

function recognize(state, b, through) {
  const cache = new Map();
  const mo = (d) => { if (!cache.has(d)) cache.set(d, monthOf(state, d)); return cache.get(d); };
  for (const s of b.schedules) {
    const target = Math.min(s.len, through - s.start + 1);
    while (s.done < target) {
      const m = mo(s.start + s.done);
      add(b, m, '2500', s.perDay);
      add(b, m, '4000', -s.perDay);
      s.done++;
    }
  }
  b.schedules = b.schedules.filter((s) => s.done < s.len);
}

function trackTaxFootprint(state, b, ch) {
  const st = ensureStripe(state);
  const c = customerById(state, ch.customerId);
  const reg = customerRegion(c);
  if (reg.country === 'US') {
    const y = yearOf(state, ch.day);
    const ys = (b.sales[y] ??= {});
    ys[reg.state] = (ys[reg.state] ?? 0) + ch.amount;
  } else if (reg.euUk && state.company.model === 'b2c' && !st.settings.merchantOfRecord) {
    b.vat.intlB2cSales += ch.amount;
    b.vat.firstSaleDay ??= ch.day;
    // VAT you should have charged (EU avg ~21%, UK 20%). Without registration + Stripe Tax collecting it on
    // top of the price, it comes out of your revenue. With both, it is a pass-through. (research §4.4)
    if (!(b.vat.registered && st.settings.stripeTax)) {
      const vat = ch.amount * VAT_RATE / (1 + VAT_RATE);
      if (b.vat.registered) b.vat.payable += vat; else b.vat.exposure += vat;
    }
  }
}
export const VAT_RATE = 0.21; // EU average standard rate ≈ 21%, UK 20% (research §4.4)

export function syncLedger(state) {
  const b = ensureBooks(state);
  const st = ensureStripe(state);
  const s = b.sync;
  const today = state.day;
  const seen = new Set(s.ids);
  const fresh = (x) => x.day > s.day || (x.day === s.day && !seen.has(x.id));
  const todays = s.day === today ? s.ids.slice() : [];
  const mark = (x) => { if (x.day === today) todays.push(x.id); };

  // Enterprise invoices issued (net-30): Dr Accounts receivable / Cr Deferred revenue, recognized from the issue
  // day over the service period. Picks up every open invoice not yet booked (including ones issued before the
  // books started), so 1100 always ties to Stripe's open invoices.
  for (const inv of st.invoices) {
    if (inv.status !== 'open' || inv.method !== 'ach_invoice' || b.ar[inv.id]) continue;
    const issued = inv.issuedDay ?? inv.day;
    const m = monthOf(state, issued);
    add(b, m, '1100', inv.amount);
    add(b, m, '2500', -inv.amount);
    addCash(b, m, 'arIssued', inv.amount);
    const len = periodDays(subscriptionById(state, inv.subId), issued);
    b.schedules.push({ id: inv.id, perDay: inv.amount / len, start: issued, len, done: 0 });
    b.ar[inv.id] = { amount: inv.amount, month: m };
  }
  for (const ch of st.charges) {
    if (ch.status === 'failed' || !fresh(ch)) continue;
    const m = monthOf(state, ch.day);
    add(b, m, '1050', ch.amount - ch.fee);
    add(b, m, '5100', ch.fee);
    addCash(b, m, 'gross', ch.amount);
    addCash(b, m, 'fees', ch.fee);
    const ar = ch.invoiceId != null ? b.ar[ch.invoiceId] : null;
    if (ar) {
      // Invoice paid: clear the receivable; revenue was deferred (and started recognizing) when it was issued.
      add(b, m, '1100', -ar.amount);
      if (Math.abs(ch.amount - ar.amount) > 0.004) add(b, m, '2500', ar.amount - ch.amount); // amount changed: adjust deferral
      addCash(b, m, 'arCollected', ar.amount);
      const sched = b.schedules.find((x) => x.id === ch.invoiceId);
      if (sched) { sched.id = ch.id; if (Math.abs(ch.amount - ar.amount) > 0.004) sched.perDay += (ch.amount - ar.amount) / Math.max(1, sched.len - sched.done); }
      delete b.ar[ch.invoiceId];
    } else {
      add(b, m, '2500', -ch.amount);
      const sub = subscriptionById(state, ch.subId);
      const len = ch.serviceDays ?? periodDays(sub, ch.day); // proration charges cover the rest of the period
      b.schedules.push({ id: ch.id, perDay: ch.amount / len, start: ch.day, len, done: 0 });
    }
    trackTaxFootprint(state, b, ch);
    mark(ch);
  }
  // Invoices written off (core marks them 'uncollectible' at due + 120 days, then may compact them away): reverse
  // what is still deferred, and the part already recognized becomes bad debt. Dr 2500 + Dr 6900 / Cr 1100.
  const arIds = Object.keys(b.ar);
  if (arIds.length) {
    const open = new Map();
    for (const inv of st.invoices) if (b.ar[inv.id]) open.set(inv.id, inv);
    for (const id of arIds) {
      const inv = open.get(id);
      if (inv && inv.status === 'open') continue;
      const ar = b.ar[id];
      const m = monthOf(state, today);
      recognizeOne(state, b, id, today - 1); // recognize through yesterday so the split is exact
      const remaining = Math.min(ar.amount, takeSchedule(b, id));
      add(b, m, '1100', -ar.amount);
      add(b, m, '2500', remaining);
      add(b, m, '6900', ar.amount - remaining);
      addCash(b, m, 'arWrittenOff', ar.amount);
      delete b.ar[id];
    }
  }
  // Stripe Capital withholdings and withholdFromStripe(): repay the loan out of the Stripe balance.
  const capSeen = new Set(s.capIds);
  const capToday = s.day === today ? s.capIds.slice() : [];
  for (const r of st.capitalRepayments ?? []) {
    if (!(r.day > s.day || (r.day === s.day && !capSeen.has(r.id)))) continue;
    const m = monthOf(state, r.day);
    const interest = Math.max(0, Math.min(r.amount, r.interest ?? 0));
    const principal = r.amount - interest;
    add(b, m, '1050', -r.amount);
    add(b, m, '2600', principal);
    add(b, m, '7100', interest);
    addCash(b, m, 'withheld', r.amount);
    if (r.day === today) capToday.push(r.id);
  }
  s.capIds = capToday;
  for (const r of st.refunds) {
    if (!fresh(r)) continue;
    const m = monthOf(state, r.day);
    // Recognize up to yesterday first so "remaining" is exact.
    const remaining = r.partial && !r.final && r.refundableBefore > 0 ? shrinkSchedule(b, r.chargeId, r.amount / r.refundableBefore) : takeSchedule(b, r.chargeId);
    add(b, m, '1050', -r.amount);
    add(b, m, '2500', remaining);
    add(b, m, '4900', r.amount - remaining);
    addCash(b, m, 'refunds', r.amount);
    mark(r);
  }
  for (const d of st.disputes) {
    const f = (s.disputes[d.id] ??= { opened: false, contested: false, won: false });
    if (!f.opened && d.status !== 'scheduled') {
      const m = monthOf(state, Math.min(d.day, today));
      const remaining = takeSchedule(b, d.chargeId);
      add(b, m, '1050', -(d.amount + PAYMENTS.disputeFee));
      add(b, m, '2500', remaining);
      add(b, m, '4910', d.amount - remaining);
      add(b, m, '5110', PAYMENTS.disputeFee);
      addCash(b, m, 'chargebacks', d.amount);
      addCash(b, m, 'fees', PAYMENTS.disputeFee);
      f.opened = true;
    }
    if (f.opened && !f.contested && d.evidenceQuality != null) {
      const m = monthOf(state, today);
      add(b, m, '1050', -PAYMENTS.disputeContestFee);
      add(b, m, '5110', PAYMENTS.disputeContestFee);
      addCash(b, m, 'fees', PAYMENTS.disputeContestFee);
      f.contested = true;
    }
    if (f.opened && !f.won && d.status === 'won') {
      const m = monthOf(state, Math.min(d.decisionDay ?? today, today));
      add(b, m, '1050', d.amount + PAYMENTS.disputeContestFee);
      add(b, m, '4910', -d.amount);
      add(b, m, '5110', -PAYMENTS.disputeContestFee);
      addCash(b, m, 'chargebacks', -d.amount);
      addCash(b, m, 'fees', -PAYMENTS.disputeContestFee);
      f.won = true;
    }
  }
  s.day = today;
  s.ids = todays;
  recognize(state, b, today);
  s.recognizedThrough = today;

  if (b.needsOpening) {
    // Books started mid-game: whatever Stripe holds that the ledger can't explain becomes opening equity.
    b.needsOpening = false;
    const diff = stripeBalanceActual(state) - clearingBalance(state);
    if (Math.abs(diff) > 0.005) {
      add(b, monthOf(state, today), '1050', diff);
      add(b, monthOf(state, today), '3999', -diff);
    }
  }
  return b;
}

function clearingBalance(state) {
  const b = ensureBooks(state);
  let v = sumBy(Object.values(b.journal), (j) => j['1050'] ?? 0);
  for (const t of state.bank.txns) if (t.category === 'stripe_payout') v -= t.amount;
  return v;
}

// ---- Ledger views ----

// All journal lines by month: { 'YYYY-MM': { acct: debit-positive } }. By default bank lines use the books
// category (the founder's view, AI guesses included). { truth: true } uses what the money really was: the basis
// for what tax authorities assess (compliance.js), never shown as "your books".
export function ledgerByMonth(state, { truth = false } = {}) {
  const b = ensureBooks(state);
  const out = {};
  for (const [m, j] of Object.entries(b.journal)) out[m] = { ...j };
  // Credit balance of 2600 so far per lender (chronological). Per counterparty, so an RBF lender's fee is not
  // absorbed as "principal" of a founder loan (or any other lender's balance) that happens to be outstanding.
  const loanBal = new Map();
  for (const t of state.bank.txns) {
    const m = monthOf(state, t.day);
    const o = (out[m] ??= {});
    const cashAcct = cashAccountFor(t);
    const cat = truth ? t.category : bookCategory(state, t);
    const acct = accountForCategory(cat, t);
    o[cashAcct] = (o[cashAcct] ?? 0) + t.amount;
    const lender = t.counterparty ?? '';
    if (acct === '2600' && t.amount < 0) {
      // Legacy combined repayments (principal + interest/fee in one line): principal reduces the loan up to
      // what is outstanding to that lender; anything beyond is interest/financing fees (7100), so 2600 never
      // goes negative.
      const principal = Math.min(-t.amount, Math.max(0, loanBal.get(lender) ?? 0));
      loanBal.set(lender, (loanBal.get(lender) ?? 0) - principal);
      o['2600'] = (o['2600'] ?? 0) + principal;
      if (-t.amount - principal > 0.004) o['7100'] = (o['7100'] ?? 0) + (-t.amount - principal);
      continue;
    }
    if (acct === '2600') loanBal.set(lender, (loanBal.get(lender) ?? 0) + t.amount);
    o[acct] = (o[acct] ?? 0) - t.amount;
  }
  for (const a of ensureBooks(state).adjustments) for (const l of a.lines) {
    const o = (out[l.month] ??= {});
    o[l.acct] = (o[l.acct] ?? 0) + l.amount;
  }
  return out;
}

export const trueLedger = (state) => ledgerByMonth(state, { truth: true });

export const allMonths = (state) => monthsBetween(monthOf(state, 0), monthOf(state));

// Bank transactions behind one account in one month (for drill-down / traceability).
export function bankLinesFor(state, acct, month) {
  return state.bank.txns.filter((t) => monthOf(state, t.day) === month && (accountForCategory(bookCategory(state, t), t) === acct || cashAccountFor(t) === acct));
}

const LINE_ORDER = Object.keys(COA);
// P&L. basis: 'accrual' (recognized revenue) or 'cash' (customer receipts when collected).
export function profitAndLoss(state, months, basis = 'accrual', ledger = ledgerByMonth(state)) {
  const b = ensureBooks(state);
  const val = (m, a) => -(ledger[m]?.[a] ?? 0); // credit-positive for display (revenue +, expense -)
  const line = (acct) => ({ acct, name: COA[acct].name, values: months.map((m) => val(m, acct)) });
  const nonzero = (l) => l.values.some((v) => Math.abs(v) > 0.004);
  let revenue;
  if (basis === 'cash') {
    const c = (m) => b.cash[m] ?? { gross: 0, refunds: 0, chargebacks: 0 };
    revenue = [
      { acct: '4000', name: 'Customer receipts (gross charges collected)', values: months.map((m) => c(m).gross) },
      { acct: '4900', name: 'Refunds', values: months.map((m) => -c(m).refunds) },
      { acct: '4910', name: 'Chargebacks (net of disputes won)', values: months.map((m) => -c(m).chargebacks) },
      line('4100'),
      line('4200'),
    ].filter((l, i) => i < 3 || nonzero(l));
  } else revenue = ['4000', '4100', '4200', '4900', '4910'].map(line).filter((l) => !['4100', '4200'].includes(l.acct) || nonzero(l));
  const pick = (type) => LINE_ORDER.filter((a) => COA[a].type === type).map(line).filter(nonzero);
  const cogs = pick('cogs');
  const opex = pick('opex');
  const other = pick('other');
  const tax = pick('tax');
  const tot = (ls) => months.map((_, i) => sumBy(ls, (l) => l.values[i]));
  const rev = tot(revenue), cg = tot(cogs), op = tot(opex), ot = tot(other), tx = tot(tax);
  const gp = rev.map((v, i) => v + cg[i]);
  const ebitda = gp.map((v, i) => v + op[i]);
  const ni = ebitda.map((v, i) => v + ot[i] + tx[i]);
  return {
    months, basis,
    sections: [
      { title: 'Revenue', lines: revenue, total: rev, totalLabel: 'Net revenue' },
      { title: 'Cost of revenue', lines: cogs, total: cg, totalLabel: 'Total cost of revenue' },
      { title: 'Operating expenses', lines: opex, total: op, totalLabel: 'Total operating expenses' },
      { title: 'Other income (expense)', lines: other, total: ot, totalLabel: 'Total other income (expense)' },
      ...(tax.length ? [{ title: 'Income taxes', lines: tax, total: tx, totalLabel: 'Total income taxes' }] : []),
    ],
    revenue: rev, cogs: cg, grossProfit: gp,
    grossMargin: gp.map((v, i) => (rev[i] > 0 ? v / rev[i] : null)),
    operatingIncome: ebitda, netIncome: ni,
  };
}

export function deferredRevenueNow(state) {
  return sumBy(ensureBooks(state).schedules, (s) => s.perDay * (s.len - s.done));
}

// Balance sheet as of the end of `month` (cumulative ledger). Liabilities/equity shown credit-positive.
export function balanceSheet(state, month = monthOf(state), ledger = ledgerByMonth(state)) {
  const months = Object.keys(ledger).filter((m) => m <= month).sort();
  const year = month.slice(0, 4);
  const cum = {};
  let retained = 0, ytd = 0;
  for (const m of months) {
    for (const [a, v] of Object.entries(ledger[m])) {
      if (isPL(a)) { if (m.slice(0, 4) < year) retained -= v; else ytd -= v; }
      else cum[a] = (cum[a] ?? 0) + v;
    }
  }
  const lines = (type, sign) => Object.keys(COA).filter((a) => COA[a].type === type && Math.abs(cum[a] ?? 0) > 0.004).map((a) => ({ acct: a, name: COA[a].name, value: sign * cum[a] }));
  const assets = lines('asset', 1);
  const liabilities = lines('liability', -1);
  const equity = [...lines('equity', -1), { acct: 'RE', name: 'Retained earnings (prior years)', value: retained }, { acct: 'NI', name: `Net income (${year} YTD)`, value: ytd }];
  const totalAssets = sumBy(assets, (l) => l.value);
  const totalLiabilities = sumBy(liabilities, (l) => l.value);
  const totalEquity = sumBy(equity, (l) => l.value);
  return { month, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01, cum };
}

// Tie-outs for the current period: ledger vs the real systems.
export function tieOuts(state, ledger = ledgerByMonth(state)) {
  const bs = balanceSheet(state, monthOf(state), ledger);
  const acct = (id) => state.bank.accounts.find((a) => a.id === id)?.balance ?? 0;
  return [
    { label: 'Checking: ledger vs bank', ledger: bs.cum['1000'] ?? 0, actual: acct('checking') },
    { label: 'Treasury: ledger vs bank', ledger: bs.cum['1010'] ?? 0, actual: acct('treasury') },
    ...(state.bank.accounts.some((a) => a.id === 'reserve') ? [{ label: 'Tax reserve: ledger vs bank', ledger: bs.cum['1020'] ?? 0, actual: acct('reserve') }] : []),
    { label: 'Stripe clearing vs Stripe balance (pending + available + in transit)', ledger: bs.cum['1050'] ?? 0, actual: stripeBalanceActual(state) },
    { label: 'Deferred revenue vs open subscription periods', ledger: -(bs.cum['2500'] ?? 0), actual: deferredRevenueNow(state) },
    { label: 'Accounts receivable vs open invoices', ledger: bs.cum['1100'] ?? 0, actual: openInvoiceTotal(state) },
  ].map((t) => ({ ...t, ok: Math.abs(t.ledger - t.actual) < 0.05 }));
}

export function openInvoiceTotal(state) {
  return sumBy(ensureStripe(state).invoices.filter((i) => i.status === 'open' && i.method === 'ach_invoice'), (i) => i.amount);
}

// Stripe payout reconciliation for one month (research §3.4 step 3):
// gross − refunds − chargebacks − fees − payouts = change in Stripe balance.
export function stripeRecon(state, month, ledger = ledgerByMonth(state)) {
  const b = ensureBooks(state);
  const c = { gross: 0, refunds: 0, chargebacks: 0, fees: 0, withheld: 0, ...(b.cash[month] ?? {}) };
  const payouts = sumBy(state.bank.txns.filter((t) => t.category === 'stripe_payout' && monthOf(state, t.day) === month), (t) => t.amount);
  const j = b.journal[month] ?? {};
  const opening = j['3999'] ? -j['3999'] : 0;
  const net = c.gross - c.refunds - c.chargebacks - c.fees - c.withheld; // withheld: Stripe Capital repayments
  const change = (ledger[month]?.['1050'] ?? 0);
  return { ...c, net, payouts, opening, expectedChange: net - payouts + opening, change, ok: Math.abs(net - payouts + opening - change) < 0.05 };
}

// Deferred revenue roll-forward for a month.
export function deferredRollforward(state, month, ledger = ledgerByMonth(state)) {
  const prev = prevMonthKey(month);
  const opening = -(balanceSheet(state, prev, ledger).cum['2500'] ?? 0);
  const closing = -(balanceSheet(state, month, ledger).cum['2500'] ?? 0);
  const c = ensureBooks(state).cash[month] ?? {};
  // Billings: card charges when collected, invoices when issued (their collection only clears AR).
  const billings = (c.gross ?? 0) - (c.arCollected ?? 0) + (c.arIssued ?? 0);
  const recognized = -(ledger[month]?.['4000'] ?? 0);
  return { opening, billings, recognized, reversals: opening + billings - recognized - closing, closing };
}

// ---- Month-end close (research §3.4) ----

export const CLOSE_ITEMS = [
  { id: 'feeds', title: 'Bank & card feeds complete through month-end', hours: 0.25, help: 'Confirm Mercury checking, treasury and the card are connected and complete through the last day.' },
  { id: 'categorize', title: 'Categorize transactions', hours: 0.25, help: 'Review every AI-suggested category. Fix the wrong ones. Add vendor rules for new vendors.' },
  { id: 'stripe', title: 'Reconcile Stripe', hours: 0.75, help: 'Gross charges − refunds − disputes − fees = payouts ± change in Stripe balance.' },
  { id: 'bank', title: 'Reconcile bank & card to statement balances', hours: 0.5, help: 'Ledger cash must equal the bank statement ending balance.' },
  { id: 'revrec', title: 'Revenue recognition', hours: 0.5, help: 'Release deferred revenue for the month; book new annual prepayments to deferred revenue; recognized revenue should roughly tie to MRR.' },
  { id: 'accruals', title: 'Accrue unbilled expenses', hours: 0.5, na: true, help: 'Usage-based AI API bills that arrive after month-end, contractor hours, payroll for the last days.' },
  { id: 'prepaids', title: 'Amortize prepaid expenses', hours: 0.25, na: true, help: 'Annual software and insurance paid upfront, spread over 12 months.' },
  { id: 'payroll', title: 'Tie out payroll', hours: 0.25, na: true, help: 'Payroll provider report vs payroll expense and liabilities.' },
  { id: 'salestax', title: 'Sales tax & VAT', hours: 0.25, help: 'Collected tax is a liability; check nexus thresholds and the filing calendar.' },
  { id: 'fixed', title: 'Fixed assets & depreciation', hours: 0.1, na: true, help: 'Capitalize purchases above your threshold (e.g. $2,500); book depreciation.' },
  { id: 'pl', title: 'Review P&L month over month', hours: 0.5, help: 'Investigate any line that moved more than 20% and $500. Watch AI inference against revenue.' },
  { id: 'bs', title: 'Balance sheet review', hours: 0.5, help: 'Stripe clearing ties, no stale items, deferred revenue reasonable.' },
  { id: 'metrics', title: 'Metrics pack', hours: 0.5, help: 'MRR movements, cash, burn, runway, gross margin.' },
  { id: 'lock', title: 'Lock the period', hours: 0.1, help: 'Lock the month so nobody (including you) changes closed numbers; save P&L and balance sheet.' },
];
export const closeHours = (state, item) => Math.max(0.05, Math.round(item.hours * service(state).closeFactor * 100) / 100);

export function closeState(state, month) {
  const b = ensureBooks(state);
  return (b.close[month] ??= { items: {} });
}

// Which months can be closed now: ended months, in order.
export function closableMonths(state) {
  const cur = monthOf(state);
  return allMonths(state).filter((m) => m < cur);
}

// Pre-conditions per item (things the founder must actually fix before ticking).
export function closeBlocker(state, month, itemId) {
  const b = ensureBooks(state);
  if (b.closed[month]) return 'Month is locked.';
  if (month >= monthOf(state)) return 'You can only close a month after it ends.';
  if (itemId === 'categorize') {
    const q = reviewQueue(state, month).length;
    if (q) return `${q} transaction${q === 1 ? '' : 's'} still need review in the bank feed.`;
  }
  const cs = closeState(state, month);
  if (['stripe', 'bank'].includes(itemId) && !cs.recon?.[itemId]) return 'Enter the statement ending balance and reconcile.';
  if (['accruals', 'prepaids'].includes(itemId) && !ensureBooks(state).adjustments.some((j) => j.month === month && j.kind === (itemId === 'accruals' ? 'accrual' : 'prepaid')) && !cs.na?.[itemId]) return itemId === 'accruals' ? 'Book an accrual, or mark N/A with a reason.' : 'Set up the prepaid amortization, or mark N/A with a reason.';
  if (itemId === 'lock') {
    const prev = prevMonthKey(month);
    if (prev >= monthOf(state, 0) && !b.closed[prev]) return `Close ${prev} first.`;
    const open = CLOSE_ITEMS.filter((i) => i.id !== 'lock' && !cs.items[i.id]);
    if (open.length) return `${open.length} checklist item${open.length === 1 ? '' : 's'} still open.`;
  }
  return null;
}

// Line items that moved > 20% and > $500 vs the prior month (close step 11).
export function plVariances(state, month, ledger = ledgerByMonth(state)) {
  const prev = prevMonthKey(month);
  const out = [];
  for (const a of Object.keys(COA).filter(isPL)) {
    const cur = -(ledger[month]?.[a] ?? 0), was = -(ledger[prev]?.[a] ?? 0);
    const d = cur - was;
    if (Math.abs(d) > 500 && (was === 0 || Math.abs(d / was) > 0.2)) out.push({ acct: a, name: COA[a].name, prev: was, cur, delta: d });
  }
  return out;
}

// ---- N/A reasons are claims (close steps marked "not applicable") ----
// Marking an item N/A states a fact about the month ("no payroll", "no purchases above $2,500"). The CPA preparing the
// return ties the books to payroll reports, the GL and next month's bills, so a false N/A surfaces at filing.
// Odds the CPA catches each kind [design; money-deals.md §5: CPAs question obvious inconsistencies]: payroll 95%
// (W-2/941 tie-out), fixed assets 70% (large-purchase scan), prepaids 50%, accruals 30% (usage billed next month).
export const NA_CHECK = { payroll: 0.95, fixed: 0.7, prepaids: 0.5, accruals: 0.3, cpaFeePerItem: 150, hoursPerItem: 1 };
const monthTxns = (state, month) => state.bank.txns.filter((t) => monthOf(state, t.day) === month);

/** Why an N/A for this close item is false for this month, or null if it holds (pure). */
export function naContradiction(state, month, itemId) {
  const txns = monthTxns(state, month);
  if (itemId === 'payroll') {
    const pay = txns.filter((t) => t.category === 'payroll' || t.category === 'payroll_tax');
    return pay.length ? `${pay.length} payroll transaction(s) this month (${Math.round(-sumBy(pay, (t) => t.amount)).toLocaleString('en-US')})` : null;
  }
  if (itemId === 'fixed') {
    const big = txns.filter((t) => t.amount <= -2500 && (t.meta?.equipment || /laptop|equipment|hardware|computer|monitor|server|furniture/i.test(`${t.description} ${t.counterparty}`)));
    return big.length ? `${big.length} purchase(s) above the $2,500 capitalization threshold (${big.map((t) => t.description).slice(0, 2).join('; ')})` : null;
  }
  if (itemId === 'prepaids') {
    const pre = txns.filter((t) => t.amount <= -600 && /annual|yearly|12[- ]month|per year|\/yr|year plan/i.test(`${t.description} ${t.meta?.memo ?? ''}`));
    return pre.length ? `${pre.length} annual prepayment(s) (${pre.map((t) => t.description).slice(0, 2).join('; ')})` : null;
  }
  if (itemId === 'accruals') {
    const next = monthTxns(state, nextMonthKey(month)).filter((t) => (t.category === 'ai_inference' || t.category === 'hosting') && t.amount <= -100);
    return next.length ? `usage-billed vendors billed ${Math.round(-sumBy(next, (t) => t.amount)).toLocaleString('en-US')} next month for this month's usage` : null;
  }
  return null;
}

/** Record an N/A reason as a claim to the CPA, with the truth at the moment it was marked. */
export function recordNaClaim(state, month, itemId, reason) {
  const why = naContradiction(state, month, itemId);
  recordClaims(state, { audience: 'cpa', recipientId: `close:${month}:${itemId}`, channel: 'month-end close', claims: [{ metric: `na_${itemId}`, claimed: true, truth: !why, gap: why ? 1 : 0, text: `${month} ${itemId}: "${reason}"` }] });
  return why;
}

/** N/A reasons in closed months of `year` that the books contradict, with the CPA's (deterministic) catch. */
export function falseNaItems(state, year) {
  const b = ensureBooks(state);
  const out = [];
  for (const [month, cs] of Object.entries(b.close ?? {})) {
    if (!month.startsWith(String(year)) || !cs?.na) continue;
    for (const [id, reason] of Object.entries(cs.na)) {
      const why = naContradiction(state, month, id);
      if (!why) continue;
      const u = (parseInt(hash(`${month}|${id}|cpa`), 36) % 1000) / 1000;
      out.push({ month, id, reason, why, caught: u < (NA_CHECK[id] ?? 0.3) });
    }
  }
  return out;
}

export const unclosedMonths = (state, year) => closableMonths(state).filter((m) => m.startsWith(String(year)) && !ensureBooks(state).closed[m]);
export { monthEndDay };

// ---- Manual journal entries (close steps 6–7) ----

// Deterministic ids (no Date.now()/Math.random(), so replays and tests are reproducible).
const adjId = (state) => { const b = ensureBooks(state); b.adjSeq = (b.adjSeq ?? b.adjustments.length) + 1; return `je_${state.day}_${b.adjSeq}`; };
function assertOpen(state, month) {
  if (ensureBooks(state).closed[month]) throw new Error(`${month} is closed and locked.`);
}

// Accrue an expense incurred in `month` but billed next month (e.g. AI API usage for the last days), with an
// automatic reversal on the 1st of the next month: Dr expense / Cr 2200 Accrued expenses, then the reverse.
export function addAccrual(state, month, { amount, acct = '5010', memo = '' }) {
  if (!(amount > 0)) throw new Error('Enter the accrued amount.');
  if (!COA[acct] || !isPL(acct)) throw new Error('Pick an expense account.');
  assertOpen(state, month);
  const a = round(amount);
  const je = { id: adjId(state), month, kind: 'accrual', memo, day: state.day, lines: [
    { month, acct, amount: a }, { month, acct: '2200', amount: -a },
    { month: nextMonthKey(month), acct: '2200', amount: a }, { month: nextMonthKey(month), acct, amount: -a },
  ] };
  ensureBooks(state).adjustments.push(je);
  return je;
}

// Reclassify an annual prepayment to 1200 Prepaid expenses and amortize it over `months` starting in the month paid.
export function addPrepaid(state, txnId, months = 12) {
  const t = state.bank.txns.find((x) => x.id === txnId);
  if (!t || t.amount >= 0) throw new Error('Pick a payment.');
  const month = monthOf(state, t.day);
  assertOpen(state, month);
  const b = ensureBooks(state);
  if (b.adjustments.some((j) => j.txnId === txnId)) throw new Error('Already set up as a prepaid.');
  const acct = accountForCategory(bookCategory(state, t), t);
  if (!isPL(acct)) throw new Error('Only expenses can be prepaid.');
  const total = -t.amount;
  const per = round(total / months);
  const lines = [{ month, acct: '1200', amount: total }, { month, acct, amount: -total }];
  let m = month, left = total;
  for (let i = 0; i < months; i++) {
    const amt = i === months - 1 ? round(left) : per;
    lines.push({ month: m, acct, amount: amt }, { month: m, acct: '1200', amount: -amt });
    left -= amt; m = nextMonthKey(m);
  }
  const je = { id: adjId(state), month, kind: 'prepaid', txnId, memo: `${t.counterparty}: ${months}-month amortization`, day: state.day, lines };
  b.adjustments.push(je);
  return je;
}
export function removeAdjustment(state, id) {
  const b = ensureBooks(state);
  const je = b.adjustments.find((j) => j.id === id);
  if (!je) return;
  for (const l of je.lines) assertOpen(state, l.month);
  b.adjustments = b.adjustments.filter((j) => j.id !== id);
}
const round = (x) => Math.round(x * 100) / 100;
// Payments that look like annual prepayments (≥ $100, software/legal/accounting/other) in a month.
export const prepaidCandidates = (state, month) => state.bank.txns.filter((t) => monthOf(state, t.day) === month && t.amount <= -100 && ['software', 'legal', 'accounting', 'other', 'marketing'].includes(bookCategory(state, t)) && !ensureBooks(state).adjustments.some((j) => j.txnId === t.id));

// ---- Reconciliations (close steps 3–4): the founder types the statement ending balance; it must tie. ----

export function statementEnding(state, accountId, month) {
  const last = state.bank.txns.filter((t) => t.accountId === accountId && t.day <= monthEndDay(state, month)).at(-1);
  return last?.balanceAfter ?? 0;
}
export function stripeEnding(state, month, ledger = ledgerByMonth(state)) {
  return balanceSheet(state, month, ledger).cum['1050'] ?? 0;
}
// entered: { checking, treasury? } or { stripe }. Returns null when it ties, else an error message.
export function checkReconciliation(state, month, itemId, entered, ledger = ledgerByMonth(state)) {
  const bs = balanceSheet(state, month, ledger);
  const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 0.01;
  if (itemId === 'stripe') {
    const led = bs.cum['1050'] ?? 0;
    if (!near(entered.stripe, stripeEnding(state, month, ledger))) return 'That isn\'t the ending balance on Stripe\'s Balance summary for this month (Payments → Payouts → Monthly balance summary).';
    if (!near(entered.stripe, led)) return `Stripe says ${entered.stripe.toFixed(2)} but the ledger's Stripe clearing is ${led.toFixed(2)}: find the difference.`;
    return null;
  }
  for (const a of state.bank.accounts) {
    const id = a.id;
    const stmt = statementEnding(state, id, month);
    const led = bs.cum[glFor(id)] ?? 0;
    if (!near(entered[id], stmt)) return `${a.name}: that isn't the statement ending balance (Bank → Statements).`;
    if (!near(stmt, led)) return `${a.name}: statement ${stmt.toFixed(2)} vs ledger ${led.toFixed(2)}.`;
  }
  return null;
}
