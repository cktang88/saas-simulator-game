// Startup bank ledger (Mercury-style). Every dollar in or out of the company goes through post().
// Categories map to the chart of accounts used by the books app.

import { uid, round2, dayOfMonth, isLastDayOfMonth } from './util.js';
import { BANK } from './params.js';
import { setModifier } from './market.js';
import { notify } from './state.js';

export const CATEGORIES = {
  // income
  stripe_payout: { label: 'Stripe payout', kind: 'income' },
  marketplace_payout: { label: 'Marketplace / app store payout', kind: 'income' },
  owner_contribution: { label: 'Owner contribution', kind: 'equity' },
  investment: { label: 'Equity investment (SAFE / priced round)', kind: 'equity' },
  loan: { label: 'Loan / financing proceeds', kind: 'liability' },
  interest: { label: 'Interest income', kind: 'income' },
  grant: { label: 'Grant income (SBIR etc.)', kind: 'income' },
  sponsorship_income: { label: 'Newsletter sponsorship income', kind: 'income' },
  services_revenue: { label: 'Services / consulting revenue', kind: 'income' },
  refund_in: { label: 'Vendor refund', kind: 'income' },
  transfer: { label: 'Internal transfer', kind: 'transfer' },
  // expenses
  payroll: { label: 'Payroll', kind: 'expense' },
  payroll_tax: { label: 'Payroll taxes & benefits', kind: 'expense' },
  contractors: { label: 'Contractors', kind: 'expense' },
  recruiting: { label: 'Recruiting (agency fees, job boards)', kind: 'expense' },
  software: { label: 'Software & SaaS tools', kind: 'expense' },
  ai_inference: { label: 'AI / LLM API usage', kind: 'cogs' },
  payment_fees: { label: 'Payment processing & fraud fees', kind: 'cogs' },
  hosting: { label: 'Hosting & infrastructure', kind: 'cogs' },
  advertising: { label: 'Advertising', kind: 'expense' },
  marketing: { label: 'Marketing (content, UGC, sponsorships)', kind: 'expense' },
  legal: { label: 'Legal', kind: 'expense' },
  accounting: { label: 'Accounting & bookkeeping', kind: 'expense' },
  taxes: { label: 'Taxes & government fees', kind: 'expense' },
  owner_draw: { label: 'Owner draw / founder salary', kind: 'equity' },
  loan_repayment: { label: 'Loan / financing repayment (principal)', kind: 'liability' },
  loan_interest: { label: 'Loan interest & financing fees', kind: 'expense' },
  travel: { label: 'Travel & meals', kind: 'expense' },
  other: { label: 'Other', kind: 'expense' },
  uncategorized: { label: 'Uncategorized', kind: 'expense' },
};

export function account(state, id = 'checking') {
  return state.bank.accounts.find((a) => a.id === id);
}

export const balance = (state, id = 'checking') => account(state, id).balance;
// All company bank accounts (checking + treasury etc.). Solvency still uses checking, which the sweep refills.
export const totalCash = (state) => state.bank.accounts.reduce((a, x) => a + x.balance, 0);

// Post a transaction. amount > 0 = money in, < 0 = money out.
// method: 'ach' | 'wire' | 'card' | 'stripe' | 'payroll' | 'internal'
// Credit-offset hook (apps/aicost/credits.js registers it). A vendor charge may be partly or wholly covered by a startup
// credit or perk balance: cash moves by the NET amount (a contra-expense, never income) and the transaction keeps the
// gross bill and what was offset in meta.gross / meta.creditApplied. Returns the USD covered (0 = none).
let creditOffsetHook = null;
export const setCreditOffsetHook = (fn) => { creditOffsetHook = typeof fn === 'function' ? fn : null; };

export function post(state, { amount, counterparty, description = '', category = 'uncategorized', method = 'ach', accountId = 'checking', meta = {} }) {
  const acct = account(state, accountId);
  if (creditOffsetHook && amount < 0 && !meta.noCredit && accountId === 'checking') {
    const covered = creditOffsetHook(state, { amount, counterparty, category, meta });
    if (covered > 0) {
      meta = { ...meta, gross: round2(-amount), creditApplied: round2(covered) };
      amount = round2(amount + covered);
    }
  }
  const txn = {
    id: uid('txn'),
    day: state.day,
    amount: round2(amount),
    counterparty,
    description,
    category,
    autoCategory: category, // what the bank guessed; the books app lets the founder recategorize
    method,
    accountId,
    reconciled: false,
    meta,
  };
  acct.balance = round2(acct.balance + txn.amount);
  txn.balanceAfter = acct.balance;
  state.bank.txns.push(txn);
  return txn;
}

// ---- Recurring bills (SaaS tools, hosting, etc.) charged on their day of month. ----

export function addRecurring(state, { vendor, amount, category, dayOfMonth: dom = 1, variable = false, note = '' }) {
  const r = { id: uid('rec'), vendor, amount, category, dayOfMonth: dom, active: true, variable, note };
  state.recurring.push(r);
  return r;
}

// Mercury has no overdraft: a card bill that the checking balance cannot cover is declined, retried after
// ~3 days, and after 3 declines the vendor suspends the account (hosting suspension hurts customers).
export function chargeRecurring(state) {
  const dom = dayOfMonth(state);
  const lastDay = isLastDayOfMonth(state);
  for (const r of state.recurring) {
    if (!r.active || r.variable) continue;
    const retry = r.retryDay != null && state.day >= r.retryDay;
    // A bill set for the 29th–31st is charged on the last day of shorter months (as card billing does).
    const due = r.dayOfMonth === dom || (lastDay && r.dayOfMonth > dom);
    if (!due && !retry) continue;
    if (due && !retry && r.retryDay != null) continue; // a retry is already scheduled
    if (balance(state) < r.amount) {
      r.declines = (r.declines ?? 0) + 1;
      (state.bank.declines ??= []).push({ day: state.day, vendor: r.vendor, amount: r.amount, recurringId: r.id });
      if (state.bank.declines.length > 200) state.bank.declines.splice(0, 50);
      if (r.declines >= BANK.recurringMaxDeclines) {
        r.active = false;
        r.suspended = true;
        r.retryDay = null;
        if (r.category === 'hosting') setModifier(state, 'churn', 'hosting-suspended', 1.5);
        notify(state, `${r.vendor} suspended your account after ${r.declines} declined card payments.${r.category === 'hosting' ? ' Your product is down for customers: churn will spike.' : ''} Add funds and re-enable it in Bank.`, { type: 'bad', app: 'bank' });
      } else {
        r.retryDay = state.day + BANK.recurringRetryDays;
        notify(state, `Card declined: ${r.vendor} ${r.amount.toFixed(2)} (insufficient funds in checking). The vendor retries in ${BANK.recurringRetryDays} days.`, { type: 'warn', app: 'bank' });
      }
      continue;
    }
    post(state, { amount: -r.amount, counterparty: r.vendor, description: r.note || `${r.vendor} subscription`, category: r.category, method: 'card' });
    r.declines = 0;
    r.retryDay = null;
  }
}

// Re-enable a vendor the founder caught up with (clears a hosting suspension when nothing else is suspended).
export function reactivateRecurring(state, id) {
  const r = state.recurring.find((x) => x.id === id);
  if (!r) return null;
  r.active = true; r.suspended = false; r.declines = 0; r.retryDay = null;
  if (!state.recurring.some((x) => x.suspended && x.category === 'hosting')) setModifier(state, 'churn', 'hosting-suspended', null);
  return r;
}

// Is the operating account still the founder's personal checking (before incorporation + Mercury)?
export const isPreIncorporationAccount = (state) => !!account(state, 'checking')?.personal;

// Default 2026 solo-founder stack. Amounts are typical list prices (see docs/research/finance-and-payments.md).
export function seedDefaultStack(state) {
  if (state.recurring.length) return;
  addRecurring(state, { vendor: 'Google Workspace', amount: 14, category: 'software', dayOfMonth: 3 });
  addRecurring(state, { vendor: 'Claude Max', amount: 100, category: 'software', dayOfMonth: 5, note: 'AI coding agent subscription' });
  addRecurring(state, { vendor: 'Vercel', amount: 20, category: 'hosting', dayOfMonth: 8 });
  addRecurring(state, { vendor: 'Supabase', amount: 25, category: 'hosting', dayOfMonth: 8 });
  addRecurring(state, { vendor: 'Namecheap', amount: 2, category: 'software', dayOfMonth: 12, note: 'Domains (annual, amortized)' });
}
