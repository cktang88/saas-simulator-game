// Startup bank ledger (Mercury-style). Every dollar in or out of the company goes through post().
// Categories map to the chart of accounts used by the books app.

import { uid, round2, dayOfMonth } from './util.js';

export const CATEGORIES = {
  // income
  stripe_payout: { label: 'Stripe payout', kind: 'income' },
  owner_contribution: { label: 'Owner contribution', kind: 'equity' },
  investment: { label: 'Equity investment (SAFE / priced round)', kind: 'equity' },
  loan: { label: 'Loan / financing proceeds', kind: 'liability' },
  interest: { label: 'Interest income', kind: 'income' },
  grant: { label: 'Grant income (SBIR etc.)', kind: 'income' },
  refund_in: { label: 'Vendor refund', kind: 'income' },
  transfer: { label: 'Internal transfer', kind: 'transfer' },
  // expenses
  payroll: { label: 'Payroll', kind: 'expense' },
  payroll_tax: { label: 'Payroll taxes & benefits', kind: 'expense' },
  contractors: { label: 'Contractors', kind: 'expense' },
  software: { label: 'Software & SaaS tools', kind: 'expense' },
  ai_inference: { label: 'AI / LLM API usage', kind: 'cogs' },
  hosting: { label: 'Hosting & infrastructure', kind: 'cogs' },
  advertising: { label: 'Advertising', kind: 'expense' },
  marketing: { label: 'Marketing (content, UGC, sponsorships)', kind: 'expense' },
  legal: { label: 'Legal', kind: 'expense' },
  accounting: { label: 'Accounting & bookkeeping', kind: 'expense' },
  taxes: { label: 'Taxes & government fees', kind: 'expense' },
  owner_draw: { label: 'Owner draw / founder salary', kind: 'equity' },
  loan_repayment: { label: 'Loan / financing repayment', kind: 'liability' },
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
export function post(state, { amount, counterparty, description = '', category = 'uncategorized', method = 'ach', accountId = 'checking', meta = {} }) {
  const acct = account(state, accountId);
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

export function chargeRecurring(state) {
  const dom = dayOfMonth(state);
  for (const r of state.recurring) {
    if (!r.active || r.dayOfMonth !== dom || r.variable) continue;
    post(state, { amount: -r.amount, counterparty: r.vendor, description: r.note || `${r.vendor} subscription`, category: r.category, method: 'card' });
  }
}

// Default 2026 solo-founder stack. Amounts are typical list prices (see docs/research/finance-and-payments.md).
export function seedDefaultStack(state) {
  if (state.recurring.length) return;
  addRecurring(state, { vendor: 'Google Workspace', amount: 14, category: 'software', dayOfMonth: 3 });
  addRecurring(state, { vendor: 'Claude Max', amount: 100, category: 'software', dayOfMonth: 5, note: 'AI coding agent subscription' });
  addRecurring(state, { vendor: 'Vercel', amount: 20, category: 'hosting', dayOfMonth: 8 });
  addRecurring(state, { vendor: 'Supabase', amount: 25, category: 'hosting', dayOfMonth: 8 });
  addRecurring(state, { vendor: 'Namecheap', amount: 2, category: 'software', dayOfMonth: 12, note: 'Domains (annual, amortized)' });
}
