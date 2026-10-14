// Mercury Treasury auto-transfer rules (D11 §1 workflow 5, help article "Setting up auto-transfer rules"):
// "Maintain a target account balance" between a minimum and a maximum, with Treasury as the supporting
// account. Documented limits that matter for runway:
//  - transfers FROM Treasury: at most two per calendar month, at least seven calendar days apart;
//  - rules run on business days only (Mercury: 6:00 AM PT);
//  - if the supporting account is underfunded the rule is skipped (the admin gets an email) and retries later.
// Refilling only up to the minimum is a game reading of "maintain a target balance" [unverified detail]: a
// minimum that does not cover a payroll-plus-bills week uses up both monthly transfers and strands cash.

import { post } from '../../core/bank.js';
import { round2 } from '../../core/util.js';
import { isBusinessDay, addBusinessDays } from '../../core/stripe.js';
import { newThread, addMessage, findThread } from '../../core/mail.js';
import { TREASURY } from './catalog.js';
import { monthOf, sumBy } from './common.js';
import { mistake } from './operator.js';

export const RULES = { maxRedemptionsPerMonth: 2, minDaysApart: 7, sweepBuffer: 5000 };

const bankSlice = (state) => (state.apps.bank ??= { payees: [], notes: {}, canceled: [], inTransit: [] });
export function ensureTreasury(state) {
  const b = bankSlice(state);
  b.inTransit ??= [];
  const t = (b.treasury ??= { enabled: false, target: TREASURY.defaultOperatingTarget });
  // Older saves stored one "operating target": keep the same band (refill under half, sweep above target + $5k).
  t.min ??= Math.round((t.target ?? TREASURY.defaultOperatingTarget) / 2);
  t.max ??= (t.target ?? TREASURY.defaultOperatingTarget) + RULES.sweepBuffer;
  t.redemptions ??= [];
  t.skips ??= [];
  return t;
}
export const treasuryAcct = (state) => state.bank.accounts.find((a) => a.id === 'treasury');
export const inTransitTotal = (state) => sumBy(state.apps.bank?.inTransit ?? [], (x) => x.amount);

/** Can money leave Treasury today? Two per month, seven days apart (manual transfers count too). */
export function redemptionAllowed(state) {
  const t = ensureTreasury(state);
  const m = monthOf(state);
  const thisMonth = t.redemptions.filter((d) => monthOf(state, d) === m);
  if (thisMonth.length >= RULES.maxRedemptionsPerMonth) return { ok: false, reason: `Treasury allows ${RULES.maxRedemptionsPerMonth} transfers out per month; both are used.` };
  const last = t.redemptions.at(-1);
  if (last != null && state.day - last < RULES.minDaysApart) return { ok: false, reason: `Transfers out of Treasury must be ${RULES.minDaysApart} days apart (last one ${state.day - last} day(s) ago).` };
  return { ok: true, left: RULES.maxRedemptionsPerMonth - thisMonth.length };
}

// Checking → Treasury buys same day; Treasury → checking settles T+1 business day (MMF / T-bills).
export function transferTreasury(state, amount, toTreasury) {
  const amt = round2(amount);
  if (amt <= 0) return false;
  const t = ensureTreasury(state);
  if (toTreasury) {
    post(state, { amount: -amt, counterparty: 'Mercury Treasury', description: 'TRANSFER TO TREASURY', category: 'transfer', method: 'internal', accountId: 'checking' });
    post(state, { amount: amt, counterparty: 'Mercury Checking', description: 'TRANSFER FROM CHECKING', category: 'transfer', method: 'internal', accountId: 'treasury' });
    return true;
  }
  const ok = redemptionAllowed(state);
  if (!ok.ok) throw new Error(ok.reason);
  post(state, { amount: -amt, counterparty: 'Mercury Checking', description: 'REDEMPTION TO CHECKING', category: 'transfer', method: 'internal', accountId: 'treasury' });
  bankSlice(state).inTransit.push({ amount: amt, arriveDay: addBusinessDays(state, state.day, 1) });
  t.redemptions.push(state.day);
  if (t.redemptions.length > 48) t.redemptions.splice(0, 12);
  return true;
}

export function settleTransfers(state) {
  const b = bankSlice(state);
  const due = (b.inTransit ?? []).filter((x) => x.arriveDay <= state.day);
  if (!due.length) return;
  b.inTransit = b.inTransit.filter((x) => x.arriveDay > state.day);
  for (const x of due) post(state, { amount: x.amount, counterparty: 'Mercury Treasury', description: 'TRANSFER FROM TREASURY', category: 'transfer', method: 'internal', accountId: 'checking' });
}

function skip(state, why, need) {
  const t = ensureTreasury(state);
  t.skips.push({ day: state.day, why, need: round2(need) });
  if (t.skips.length > 60) t.skips.splice(0, 20);
  // Silent except for one email to the admin per month and reason.
  const ref = `treasury-skip-${monthOf(state)}-${why}`;
  if (findThread(state, ref)) return;
  const th = newThread(state, { subject: 'Auto-transfer rule skipped', with: { name: 'Mercury', email: 'notifications@mercury.example' }, kind: 'vendor', app: 'bank', refId: ref });
  addMessage(state, th.id, { from: 'them', body: why === 'underfunded'
    ? `Your rule "Maintain a target balance" for Checking could not run: Treasury did not have the $${Math.round(need).toLocaleString()} needed. We'll try again on future dates. Checking stays below your minimum until then.`
    : `Your rule "Maintain a target balance" for Checking could not run today: ${why}. We'll try again on future dates.` });
}

/** The daily rule run (business days only). */
export function treasuryRuleDay(state) {
  const t = ensureTreasury(state);
  const tr = treasuryAcct(state);
  if (!t.enabled || !tr || !isBusinessDay(state)) return;
  const chk = state.bank.accounts.find((a) => a.id === 'checking');
  const pending = inTransitTotal(state);
  if (chk.balance > t.max) { transferTreasury(state, chk.balance - t.max, true); return; }
  if (chk.balance + pending >= t.min) return;
  const need = round2(t.min - chk.balance - pending);
  if (tr.balance < need) { skip(state, 'underfunded', need); return; }
  const ok = redemptionAllowed(state);
  if (!ok.ok) { skip(state, ok.reason, need); return; }
  transferTreasury(state, need, false);
}

/** A bill declined while money sat in Treasury after a skipped rule: the cost of a badly set minimum. */
export function treasuryWatch(state) {
  const t = state.apps.bank?.treasury;
  if (!t?.skips?.length) return;
  const lastSkip = t.skips.at(-1).day;
  if (state.day - lastSkip > 5) return;
  const declinedToday = (state.bank.declines ?? []).filter((d) => d.day === state.day && d.reason !== 'card');
  if (!declinedToday.length || !(treasuryAcct(state)?.balance > 0)) return;
  mistake(state, { functionId: 'cash_runway', id: 'treasury_rule_stranded', label: 'Bills declined while cash sat in Treasury', cost: { hours: 0.5, usd: 0 }, detail: `The auto-transfer rule was skipped (${t.skips.at(-1).why === 'underfunded' ? 'Treasury underfunded for the full refill' : 'monthly transfer limit'}) and ${declinedToday.map((d) => d.vendor).join(', ')} declined. Set the checking minimum to cover a payroll-plus-bills week; Treasury allows only two transfers out per month.`, app: 'bank', key: `stranded:${monthOf(state)}` });
}
