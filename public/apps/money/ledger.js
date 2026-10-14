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
// Amounts are stored debit-positive (credits negative); every entry sums to zero, so the balance sheet balances.

import { ensure } from '../../core/state.js';
import { ensureStripe } from '../../core/stripe.js';
import { PAYMENTS } from '../../core/params.js';
import { monthOf, frac, catKind, yearOf, customerRegion, monthsBetween, prevMonthKey, monthEndDay, sumBy } from './common.js';
import { BOOKKEEPING } from './catalog.js';

// Chart of accounts (research §3.3, trimmed to what the simulation produces).
export const COA = {
  1000: { name: 'Operating checking (Mercury)', type: 'asset' },
  1010: { name: 'Treasury (T-bills / money market)', type: 'asset' },
  1050: { name: 'Stripe clearing', type: 'asset' },
  1090: { name: 'Transfers in transit', type: 'asset' },
  2500: { name: 'Deferred revenue', type: 'liability' },
  2600: { name: 'Loans payable (incl. founder loans)', type: 'liability' },
  3100: { name: 'SAFEs & equity investment', type: 'equity' },
  3200: { name: 'Owner contributions / paid-in capital', type: 'equity' },
  3300: { name: 'Owner draws / distributions', type: 'equity' },
  3999: { name: 'Opening balance equity', type: 'equity' },
  4000: { name: 'Subscription revenue', type: 'revenue' },
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
  6100: { name: 'Advertising', type: 'opex' },
  6120: { name: 'Marketing', type: 'opex' },
  6210: { name: 'Legal', type: 'opex' },
  6220: { name: 'Accounting & bookkeeping', type: 'opex' },
  6260: { name: 'State taxes & government fees', type: 'opex' },
  6270: { name: 'Travel & meals', type: 'opex' },
  6990: { name: 'Other expenses', type: 'opex' },
  6999: { name: 'Uncategorized (ask my accountant)', type: 'opex' },
  7000: { name: 'Interest income', type: 'other' },
  7200: { name: 'Other income (vendor refunds)', type: 'other' },
  8000: { name: 'Income tax expense', type: 'tax' },
};
const PL_TYPES = new Set(['revenue', 'cogs', 'opex', 'other', 'tax']);
export const isPL = (acct) => PL_TYPES.has(COA[acct]?.type);

const CAT_ACCOUNT = {
  stripe_payout: '1050', owner_contribution: '3200', investment: '3100', loan: '2600', loan_repayment: '2600',
  interest: '7000', refund_in: '7200', payroll: '6000', payroll_tax: '6050', contractors: '6005', software: '6010',
  ai_inference: '5010', hosting: '5000', advertising: '6100', marketing: '6120', legal: '6210', accounting: '6220',
  taxes: '6260', owner_draw: '3300', travel: '6270', other: '6990', uncategorized: '6999', transfer: '1090',
};
export function accountForCategory(cat, txn = null) {
  if (cat === 'taxes' && txn?.meta?.incomeTax) return '8000';
  if (CAT_ACCOUNT[cat]) return CAT_ACCOUNT[cat];
  const k = catKind(cat);
  return k === 'income' ? '7200' : k === 'equity' ? '3200' : k === 'liability' ? '2600' : k === 'cogs' ? '5000' : '6990';
}
export const cashAccountFor = (txn) => (txn.accountId === 'treasury' ? '1010' : '1000');

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
    needsOpening: true,
  }));
  b.vat ??= { registered: false, registeredDay: null, exposure: 0, intlB2cSales: 0, firstSaleDay: null, payable: 0 };
  b.nexus ??= {};
  b.compliance ??= {};
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
  interest: 'refund_in', owner_draw: 'payroll', other: 'software',
};
export const CATEGORY_CHOICES = ['software', 'ai_inference', 'hosting', 'contractors', 'payroll', 'payroll_tax', 'advertising', 'marketing', 'legal', 'accounting', 'taxes', 'travel', 'other', 'interest', 'refund_in', 'owner_contribution', 'investment', 'loan', 'loan_repayment', 'owner_draw', 'uncategorized'];

export function guessCategory(state, txn) {
  const truth = txn.category;
  if (AUTO.has(truth)) return truth;
  const wrong = CONFUSE[truth];
  if (wrong && frac(`${txn.id}:guess`) < service(state).errorRate) return wrong;
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
  c[field] += amt;
}
const periodDays = (sub) => (sub?.interval === 'year' ? 365 : sub ? 30 : 1); // matches core/stripe.js periods

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
  const c = st.customers.find((x) => x.id === ch.customerId);
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

  for (const ch of st.charges) {
    if (ch.status === 'failed' || !fresh(ch)) continue;
    const m = monthOf(state, ch.day);
    add(b, m, '1050', ch.amount - ch.fee);
    add(b, m, '5100', ch.fee);
    add(b, m, '2500', -ch.amount);
    addCash(b, m, 'gross', ch.amount);
    addCash(b, m, 'fees', ch.fee);
    const sub = st.subscriptions.find((x) => x.id === ch.subId);
    const len = periodDays(sub);
    const sched = { id: ch.id, perDay: ch.amount / len, start: ch.day, len, done: 0 };
    b.schedules.push(sched);
    trackTaxFootprint(state, b, ch);
    mark(ch);
  }
  for (const r of st.refunds) {
    if (!fresh(r)) continue;
    const m = monthOf(state, r.day);
    // Recognize up to yesterday first so "remaining" is exact.
    const remaining = takeSchedule(b, r.chargeId);
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

// All journal lines by month: { 'YYYY-MM': { acct: debit-positive } }.
export function ledgerByMonth(state) {
  const b = ensureBooks(state);
  const out = {};
  for (const [m, j] of Object.entries(b.journal)) out[m] = { ...j };
  for (const t of state.bank.txns) {
    const m = monthOf(state, t.day);
    const o = (out[m] ??= {});
    const cashAcct = cashAccountFor(t);
    const acct = accountForCategory(bookCategory(state, t), t);
    o[cashAcct] = (o[cashAcct] ?? 0) + t.amount;
    o[acct] = (o[acct] ?? 0) - t.amount;
  }
  return out;
}

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
    ];
  } else revenue = ['4000', '4900', '4910'].map(line);
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
      { title: 'Other income', lines: other, total: ot, totalLabel: 'Total other income' },
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
    { label: 'Stripe clearing vs Stripe balance (pending + available + in transit)', ledger: bs.cum['1050'] ?? 0, actual: stripeBalanceActual(state) },
    { label: 'Deferred revenue vs open subscription periods', ledger: -(bs.cum['2500'] ?? 0), actual: deferredRevenueNow(state) },
  ].map((t) => ({ ...t, ok: Math.abs(t.ledger - t.actual) < 0.05 }));
}

// Stripe payout reconciliation for one month (research §3.4 step 3):
// gross − refunds − chargebacks − fees − payouts = change in Stripe balance.
export function stripeRecon(state, month, ledger = ledgerByMonth(state)) {
  const b = ensureBooks(state);
  const c = b.cash[month] ?? { gross: 0, refunds: 0, chargebacks: 0, fees: 0 };
  const payouts = sumBy(state.bank.txns.filter((t) => t.category === 'stripe_payout' && monthOf(state, t.day) === month), (t) => t.amount);
  const j = b.journal[month] ?? {};
  const opening = j['3999'] ? -j['3999'] : 0;
  const net = c.gross - c.refunds - c.chargebacks - c.fees;
  const change = (ledger[month]?.['1050'] ?? 0);
  return { ...c, net, payouts, opening, expectedChange: net - payouts + opening, change, ok: Math.abs(net - payouts + opening - change) < 0.05 };
}

// Deferred revenue roll-forward for a month.
export function deferredRollforward(state, month, ledger = ledgerByMonth(state)) {
  const prev = prevMonthKey(month);
  const opening = -(balanceSheet(state, prev, ledger).cum['2500'] ?? 0);
  const closing = -(balanceSheet(state, month, ledger).cum['2500'] ?? 0);
  const billings = ensureBooks(state).cash[month]?.gross ?? 0;
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
  if (itemId === 'lock') {
    const prev = prevMonthKey(month);
    if (prev >= monthOf(state, 0) && !b.closed[prev]) return `Close ${prev} first.`;
    const cs = closeState(state, month);
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

export const unclosedMonths = (state, year) => closableMonths(state).filter((m) => m.startsWith(String(year)) && !ensureBooks(state).closed[m]);
export { monthEndDay };
