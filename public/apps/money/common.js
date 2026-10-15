// Shared pure helpers for the money apps (Bank, Payments, Books, Analytics). No DOM.

import { CATEGORIES } from '../../core/bank.js';
import { dateOf, monthKey, hash, round2 } from '../../core/util.js';
import { monthlyDebtService } from '../../core/debt.js';

// Categories (incl. transfer, loan_interest, payroll, payroll_tax, recruiting) come from core/bank.js CATEGORIES;
// ledger.js maps each one to the chart of accounts.

export const DAY_MS = 86400000;
export const catLabel = (c) => CATEGORIES[c]?.label ?? c ?? '—';
export const catKind = (c) => CATEGORIES[c]?.kind ?? 'expense';

// Game day number of an ISO date (YYYY-MM-DD).
export const dayForIso = (state, iso) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${state.startDate}T12:00:00Z`)) / DAY_MS);
export const yearOf = (state, day = state.day) => dateOf(state, day).getUTCFullYear();
export const monthOf = (state, day = state.day) => monthKey(state, day);
export const monthStartDay = (state, key) => dayForIso(state, `${key}-01`);
export function nextMonthKey(key) {
  let [y, m] = key.split('-').map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
export function prevMonthKey(key) {
  let [y, m] = key.split('-').map(Number);
  m--;
  if (m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
export const monthEndDay = (state, key) => monthStartDay(state, nextMonthKey(key)) - 1;
export function monthsBetween(a, b) {
  const out = [];
  for (let k = a; k <= b && out.length < 600; k = nextMonthKey(k)) out.push(k);
  return out;
}
export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${String(y).slice(2)}`;
};
// Monday-start week key (ISO date of that Monday).
export function weekKey(state, day) {
  const d = dateOf(state, day);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

export const sumBy = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
export function median(vals) {
  const v = vals.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function groupBy(arr, f) {
  const out = {};
  for (const x of arr) (out[f(x)] ??= []).push(x);
  return out;
}
// Deterministic 0..1 from a string (stable per id across reloads).
export const frac = (s) => parseInt(hash(String(s)), 36) / 4294967296;
// Stable keys for per-record randomness. Core uid() once mixed Date.now() and Math.random() into ids, so anything
// hashed from an id (AI bookkeeper guesses, customer regions) changed from run to run and made the books
// non-deterministic. Key on the record's content instead: the running balance makes repeated identical lines
// (same day, vendor and amount) distinct.
export const txnKey = (t) => `${t.day}|${t.accountId ?? 'checking'}|${t.amount}|${t.balanceAfter ?? ''}|${t.counterparty ?? ''}|${t.description ?? ''}|${t.category ?? ''}`;
export const customerKey = (c) => `${c.createdDay ?? ''}|${c.name ?? ''}|${c.email ?? ''}|${c.company ?? ''}`;
export const r2 = round2;

// ---- Where customers are (for sales-tax nexus and VAT). core/stripe.js only stores 'US' / 'INTL',
// so a stable state/country is derived from the customer id, weighted by population / SaaS buyer share. [design]
const US_STATES = [['CA', 0.12], ['TX', 0.09], ['FL', 0.066], ['NY', 0.059], ['PA', 0.039], ['IL', 0.038], ['OH', 0.035], ['GA', 0.033], ['NC', 0.032], ['MI', 0.03], ['NJ', 0.028], ['VA', 0.026], ['WA', 0.024], ['AZ', 0.022], ['MA', 0.021], ['TN', 0.021], ['CO', 0.018], ['MD', 0.018], ['MN', 0.017], ['UT', 0.01], ['OTHER', 0.293]];
const INTL = [['GB', 0.2, true], ['DE', 0.14, true], ['CA', 0.12, false], ['FR', 0.09, true], ['AU', 0.08, false], ['NL', 0.05, true], ['IN', 0.05, false], ['ES', 0.04, true], ['IT', 0.04, true], ['BR', 0.04, false], ['SE', 0.03, true], ['IE', 0.02, true], ['PL', 0.02, true], ['SG', 0.02, false], ['JP', 0.02, false], ['MX', 0.02, false], ['CH', 0.02, false]];
function weighted(list, u) {
  const tot = list.reduce((a, x) => a + x[1], 0);
  let acc = 0;
  for (const x of list) { acc += x[1] / tot; if (u < acc) return x; }
  return list.at(-1);
}
export function customerRegion(c) {
  if (!c) return { country: 'US', state: 'OTHER', euUk: false };
  if (c.country === 'US') return { country: 'US', state: c.region ?? weighted(US_STATES, frac(customerKey(c) + 'st'))[0], euUk: false };
  if (c.country && c.country !== 'INTL') return { country: c.country, state: null, euUk: ['GB', 'DE', 'FR', 'NL', 'ES', 'IT', 'SE', 'IE', 'PL', 'AT', 'BE', 'DK', 'FI', 'PT'].includes(c.country) };
  const x = weighted(INTL, frac(customerKey(c) + 'co'));
  return { country: x[0], state: null, euUk: x[2] };
}

// ---- Statement descriptors: what the vendor actually prints on a Mercury/card statement.
const DESCRIPTORS = [
  [/google workspace/i, 'GOOGLE *WORKSPACE'], [/claude (max|pro|team)/i, 'ANTHROPIC* CLAUDE.AI SUBSCR'], [/anthropic/i, 'ANTHROPIC'],
  [/openai|chatgpt/i, 'OPENAI *CHATGPT SUBSCR'], [/vercel/i, 'VERCEL INC.'], [/supabase/i, 'SUPABASE'], [/namecheap/i, 'NAMECHEAP.COM'],
  [/cursor/i, 'CURSOR AI POWERED IDE'], [/github/i, 'GITHUB, INC.'], [/notion/i, 'NOTION LABS, INC.'], [/linear/i, 'LINEAR ORBIT INC'],
  [/gusto/i, 'GUSTO NET PAY'], [/deel/i, 'DEEL INC'], [/aws|amazon web/i, 'AWS EMEA'], [/meta|facebook/i, 'FACEBK *ADS'],
  [/google ads/i, 'GOOGLE *ADS'], [/tiktok/i, 'TIKTOK ADS'], [/linkedin/i, 'LINKEDIN *ADS'], [/irs/i, 'IRS USATAXPYMT'],
  [/delaware|de div/i, 'DE DIV OF CORPORATIONS'], [/termly/i, 'TERMLY INC'], [/resend/i, 'RESEND'], [/postmark/i, 'POSTMARK (ACTIVECAMPAIGN)'],
  [/hubspot/i, 'HUBSPOT INC'], [/attio/i, 'ATTIO LTD'], [/intercom/i, 'INTERCOM INC'], [/sentry/i, 'FUNCTIONAL SOFTWARE (SENTRY)'],
];
export function descriptorFor(txn) {
  const d = txn.description ?? '';
  if (/^[A-Z0-9 *#.,&'/-]{6,}$/.test(d)) return d; // already a bank-style descriptor
  const cp = String(txn.counterparty ?? '');
  for (const [re, out] of DESCRIPTORS) if (re.test(cp) || re.test(d)) return out;
  if (txn.method === 'ach') return `${txn.amount > 0 ? 'ACH FROM' : 'ACH TO'} ${cp.toUpperCase()}`.slice(0, 40);
  if (txn.method === 'wire') return `${txn.amount > 0 ? 'WIRE FROM' : 'WIRE TO'} ${cp.toUpperCase()}`.slice(0, 40);
  if (txn.method === 'internal') return cp.toUpperCase();
  return cp.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 30);
}

// Operating cash = checking + treasury (the company's money; treasury is the Bank app's own account).
export const totalCash = (state) => state.bank.accounts.reduce((a, x) => a + x.balance, 0);

// Monthly net cash flow from the bank ledger, excluding money raised (equity, loan proceeds) and internal moves.
// Debt service (loan_repayment, loan_interest) counts as burn: runway must cover repayments.
export const FINANCING = new Set(['owner_contribution', 'investment', 'loan', 'transfer']);
export function operatingFlowByMonth(state) {
  const out = {};
  for (const t of state.bank.txns) {
    if (FINANCING.has(t.category)) continue;
    const k = monthOf(state, t.day);
    out[k] = (out[k] ?? 0) + t.amount;
  }
  return out;
}

// Trailing net burn (positive = burning) per month, averaged over the last n *complete* months,
// falling back to the current partial month (scaled to 30 days) early in the game.
export function trailingBurn(state, n = 3) {
  const flows = operatingFlowByMonth(state);
  const cur = monthOf(state);
  const keys = [];
  for (let k = prevMonthKey(cur); keys.length < n && k >= monthOf(state, 0); k = prevMonthKey(k)) keys.push(k);
  if (keys.length) return { burn: -sumBy(keys, (k) => flows[k] ?? 0) / keys.length, months: keys.length, partial: false };
  const days = Math.max(1, state.day - monthStartDay(state, cur) + 1);
  return { burn: (-(flows[cur] ?? 0) / days) * 30, months: 0, partial: true };
}
// Forward-looking runway: trailing operating burn without past bank debt payments (loan_repayment,
// loan_interest), plus the debt service scheduled now (core/debt.js monthlyDebtService) minus what Stripe
// Capital-style withholdings already took out of payouts (they are inside the trailing burn as smaller payouts).
const DEBT_CATS = new Set(['loan_repayment', 'loan_interest']);
export function runwayWithDebt(state) {
  const tb = trailingBurn(state);
  const cur = monthOf(state);
  let debtPaid = 0;
  if (tb.partial) {
    const days = Math.max(1, state.day - monthStartDay(state, cur) + 1);
    debtPaid = (-sumBy(state.bank.txns.filter((t) => DEBT_CATS.has(t.category) && monthOf(state, t.day) === cur), (t) => t.amount) / days) * 30;
  } else {
    const from = monthStartDay(state, cur) - 1;
    const keys = new Set();
    for (let k = prevMonthKey(cur); keys.size < tb.months; k = prevMonthKey(k)) keys.add(k);
    debtPaid = -sumBy(state.bank.txns.filter((t) => t.day <= from && DEBT_CATS.has(t.category) && keys.has(monthOf(state, t.day))), (t) => t.amount) / Math.max(1, tb.months);
  }
  const withheld = sumBy((state.stripe?.capitalRepayments ?? []).filter((r) => r.day > state.day - 90), (r) => r.amount) / 3;
  const debtService = round2(monthlyDebtService(state));
  const burn = tb.burn - debtPaid + Math.max(0, debtService - withheld);
  const cash = totalCash(state);
  return { burn, debtService, debtPaid, withheld, runway: burn > 0 ? Math.max(0, cash) / burn : Infinity };
}
export const runwayMonths = (state) => runwayWithDebt(state).runway;

// 13-week line-item forecast runway (money/forecast.js), re-exported here for other apps (fundraising leverage).
// Live binding through the import cycle; only called at runtime.
export { runwayMonthsForecast, runwayForecast } from './forecast.js';
