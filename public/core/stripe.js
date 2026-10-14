// Payments engine modeled on Stripe Billing: customers, subscriptions, trials, invoices, charges,
// fees, failed payments & retries, refunds, disputes, a pending/available balance, and payouts to the bank.
// MRR movements are recorded as events (new / expansion / contraction / churn / reactivation)
// so the analytics app can build ChartMogul-style reports.

import { PAYMENTS } from './params.js';
import { uid, round2, chance, rng, isWeekend, sum } from './util.js';
import { post } from './bank.js';
import { churnBeforeRenewal, trialConversion } from './market.js';
import { notify } from './state.js';

const KEEP_DETAIL_DAYS = 120; // older charges/invoices are rolled into monthly summaries to bound save size

export function ensureStripe(state) {
  state.stripe ??= {
    accountCreatedDay: state.day,
    firstChargeDay: null,
    customers: [],
    subscriptions: [],
    invoices: [],
    charges: [],
    refunds: [],
    disputes: [],
    pending: [], // { amount, availableDay, chargeId }
    available: 0,
    payouts: [],
    events: [], // MRR movements
    archive: {}, // monthKey -> { gross, fees, refunds, charges, failed }
    settings: { smartRetries: true, merchantOfRecord: false, stripeTax: false, payoutSchedule: 'daily' },
  };
  return state.stripe;
}

const S = (state) => ensureStripe(state);
const cust = (state, id) => S(state).customers.find((c) => c.id === id);
export const monthlyAmount = (sub) => (sub.interval === 'year' ? sub.price / 12 : sub.price) * (sub.quantity ?? 1) * (1 - (sub.discountPct ?? 0));
const isLive = (sub) => sub.status === 'active' || sub.status === 'past_due';

export function mrr(state) {
  return round2(sum(S(state).subscriptions.filter(isLive).map(monthlyAmount)));
}
export const activeSubs = (state) => S(state).subscriptions.filter(isLive);
export const trialingSubs = (state) => S(state).subscriptions.filter((s) => s.status === 'trialing');

function mrrEvent(state, type, amount, sub) {
  S(state).events.push({ day: state.day, type, amount: round2(amount), subId: sub.id, customerId: sub.customerId, source: sub.source });
}

// ---- Customers & subscriptions ----

export function createCustomer(state, { name, email, company = null, source = 'direct', crmCompanyId = null, country = null, meta = {} }) {
  const intl = country ? country !== 'US' : chance(state, PAYMENTS.intlShare[state.company.model]);
  const c = {
    id: uid('cus'),
    name, email, company, source, crmCompanyId,
    createdDay: state.day,
    country: country ?? (intl ? 'INTL' : 'US'),
    card: { brand: chance(state, 0.6) ? 'visa' : 'mastercard', last4: String(Math.floor(rng(state) * 9000 + 1000)), expiresDay: state.day + Math.floor(rng(state) * 1100) },
    meta,
  };
  S(state).customers.push(c);
  return c;
}

// plan: { id, price, interval, trialDays }. A trial's conversion is decided by the market model when it ends.
export function subscribe(state, customerId, plan, { trial = plan.trialDays > 0, quantity = 1, discountPct = 0, source = 'direct', invoiceManually = false, forceConvert = null } = {}) {
  const sub = {
    id: uid('sub'),
    customerId,
    planId: plan.id,
    price: plan.price,
    interval: plan.interval,
    quantity,
    discountPct,
    source,
    status: trial ? 'trialing' : 'active',
    startDay: state.day,
    trialEndDay: trial ? state.day + plan.trialDays : null,
    currentPeriodStart: state.day,
    currentPeriodEnd: null,
    paidMonths: 0,
    cancelAtPeriodEnd: false,
    canceledDay: null,
    cancelReason: null,
    retry: null,
    invoiceManually, // enterprise: pays by invoice/ACH instead of card
    firstPaidDay: null,
    ...(forceConvert != null ? { forceConvert } : {}), // fixes trial→paid probability at signup (channel-specific intent)
  };
  S(state).subscriptions.push(sub);
  const c = cust(state, customerId);
  if (c) c.subscriptionId = sub.id;
  if (!trial) startPaidPeriod(state, sub, true);
  return sub;
}

function periodDays(sub) {
  return sub.interval === 'year' ? 365 : 30;
}

function startPaidPeriod(state, sub, isNew) {
  const ok = invoiceAndCharge(state, sub);
  sub.currentPeriodStart = state.day;
  sub.currentPeriodEnd = state.day + periodDays(sub);
  if (ok) {
    if (isNew) mrrEvent(state, 'new', monthlyAmount(sub), sub);
  } else {
    sub.status = 'past_due';
    if (isNew) mrrEvent(state, 'new', monthlyAmount(sub), sub);
    scheduleRetry(state, sub, 0);
  }
}

export function cancel(state, subId, { atPeriodEnd = true, reason = 'customer_request' } = {}) {
  const sub = S(state).subscriptions.find((s) => s.id === subId);
  if (!sub || sub.status === 'canceled') return;
  if (atPeriodEnd && sub.status === 'active') {
    sub.cancelAtPeriodEnd = true;
    sub.cancelReason = reason;
    return;
  }
  endSub(state, sub, reason);
}

function endSub(state, sub, reason) {
  const wasLive = isLive(sub);
  sub.status = 'canceled';
  sub.canceledDay = state.day;
  sub.cancelReason = reason;
  if (wasLive) mrrEvent(state, 'churn', -monthlyAmount(sub), sub);
}

export function changePrice(state, subId, { price, quantity }) {
  const sub = S(state).subscriptions.find((s) => s.id === subId);
  if (!sub) return;
  const before = monthlyAmount(sub);
  if (price != null) sub.price = price;
  if (quantity != null) sub.quantity = quantity;
  const delta = monthlyAmount(sub) - before;
  if (isLive(sub) && Math.abs(delta) > 0.001) mrrEvent(state, delta > 0 ? 'expansion' : 'contraction', delta, sub);
}

// ---- Charging ----

export function feeFor(state, amount, customer) {
  const st = S(state);
  if (st.settings.merchantOfRecord) return round2(amount * PAYMENTS.morPct + PAYMENTS.morFixed);
  let pct = PAYMENTS.cardPct + PAYMENTS.billingPct;
  if (customer?.country !== 'US') pct += PAYMENTS.intlCardPct + PAYMENTS.fxPct;
  if (st.settings.stripeTax) pct += PAYMENTS.taxPct;
  return round2(amount * pct + PAYMENTS.cardFixed);
}

function invoiceAndCharge(state, sub, attempt = 0) {
  const st = S(state);
  const c = cust(state, sub.customerId);
  const amount = round2((sub.interval === 'year' ? sub.price : sub.price) * (sub.quantity ?? 1) * (1 - (sub.discountPct ?? 0)));
  let inv = attempt > 0 ? st.invoices.find((i) => i.subId === sub.id && i.status === 'open') : null;
  if (!inv) {
    inv = { id: uid('in'), subId: sub.id, customerId: sub.customerId, day: state.day, amount, status: 'open', attempts: 0 };
    st.invoices.push(inv);
  }
  inv.attempts++;
  // Card failures: expired cards fail for sure, otherwise a base decline rate; retries recover some.
  const expired = c && c.card.expiresDay < state.day && !sub.invoiceManually;
  let pSuccess = sub.invoiceManually ? 0.97 : 1 - PAYMENTS.renewalFailRate[state.company.model];
  if (attempt > 0) pSuccess = PAYMENTS.retrySuccess * (st.settings.smartRetries ? PAYMENTS.smartRetryBoost : 1) * ((st.settings.dunningEmails ?? true) ? 1.25 : 1); // reminder emails get some customers to update cards [design]
  if (expired) pSuccess = attempt > 0 ? pSuccess * 0.5 : 0; // card updater recovers some expired cards on retry
  const ok = rng(state) < pSuccess;
  const charge = {
    id: uid('ch'), invoiceId: inv.id, customerId: sub.customerId, subId: sub.id, day: state.day, amount,
    fee: ok ? feeFor(state, amount, c) : 0, status: ok ? 'succeeded' : 'failed',
    failureCode: ok ? null : expired ? 'expired_card' : pick3(state), method: sub.invoiceManually ? 'ach_invoice' : 'card',
  };
  st.charges.push(charge);
  if (ok) {
    inv.status = 'paid';
    sub.firstPaidDay ??= state.day;
    st.firstChargeDay ??= state.day;
    const delay = state.day - st.firstChargeDay < PAYMENTS.firstPayoutHoldDays ? PAYMENTS.firstPayoutHoldDays - (state.day - st.firstChargeDay) + PAYMENTS.payoutDelayDays : PAYMENTS.payoutDelayDays;
    st.pending.push({ amount: round2(amount - charge.fee), availableDay: state.day + businessDays(state, delay), chargeId: charge.id });
    if (c && expired) c.card.expiresDay = state.day + 1095; // updater got the new card
    maybeRefundOrDispute(state, charge, sub);
  }
  return ok;
}

function pick3(state) {
  const r = rng(state);
  return r < 0.5 ? 'insufficient_funds' : r < 0.8 ? 'do_not_honor' : 'generic_decline';
}

function businessDays(state, n) {
  let d = 0, added = 0;
  while (added < n) {
    d++;
    if (!isWeekend(state, state.day + d)) added++;
  }
  return d;
}

function scheduleRetry(state, sub, attemptsDone) {
  const days = PAYMENTS.retryDays;
  if (attemptsDone >= days.length) {
    endSub(state, sub, 'payment_failed');
    const inv = S(state).invoices.find((i) => i.subId === sub.id && i.status === 'open');
    if (inv) inv.status = 'uncollectible';
    return;
  }
  sub.retry = { attempts: attemptsDone, nextDay: state.day + days[attemptsDone] };
}

function maybeRefundOrDispute(state, charge, sub) {
  const model = state.company.model;
  const first = sub.paidMonths === 0;
  if (first && chance(state, PAYMENTS.refundRate[model])) {
    sub.pendingRefund = { day: state.day + 1 + Math.floor(rng(state) * 6), chargeId: charge.id };
  } else if (chance(state, PAYMENTS.disputeRate[model])) {
    S(state).disputes.push({ id: uid('dp'), chargeId: charge.id, customerId: charge.customerId, day: state.day + 10 + Math.floor(rng(state) * 30), amount: charge.amount, status: 'scheduled', reason: chance(state, 0.6) ? 'subscription_canceled' : 'fraudulent' });
  }
}

export function refund(state, chargeId, { reason = 'requested_by_customer' } = {}) {
  const st = S(state);
  const ch = st.charges.find((c) => c.id === chargeId);
  if (!ch || ch.status !== 'succeeded') return null;
  ch.status = 'refunded';
  st.available = round2(st.available - ch.amount); // Stripe keeps its processing fee on refunds
  const r = { id: uid('re'), chargeId, day: state.day, amount: ch.amount, reason };
  st.refunds.push(r);
  return r;
}

// Founder responds to a dispute with evidence (costs time in the Stripe app).
export function respondToDispute(state, disputeId, evidenceQuality = 0.5) {
  const d = S(state).disputes.find((x) => x.id === disputeId);
  if (!d || d.status !== 'needs_response') return;
  d.status = 'under_review';
  d.evidenceQuality = evidenceQuality;
  S(state).available = round2(S(state).available - PAYMENTS.disputeContestFee); // refunded if you win
  d.decisionDay = state.day + 30 + Math.floor(rng(state) * 30);
}

// ---- Daily processing ----

export function stripeDay(state) {
  const st = S(state);

  for (const sub of st.subscriptions) {
    if (sub.status === 'canceled') continue;

    if (sub.status === 'trialing' && state.day >= sub.trialEndDay) {
      if (chance(state, sub.forceConvert ?? trialConversion(state))) {
        sub.status = 'active';
        startPaidPeriod(state, sub, true);
      } else endSub(state, sub, 'trial_not_converted');
      continue;
    }

    if (sub.status === 'past_due' && sub.retry && state.day >= sub.retry.nextDay) {
      const attempts = sub.retry.attempts + 1;
      if (invoiceAndCharge(state, sub, attempts)) {
        sub.status = 'active';
        sub.retry = null;
      } else scheduleRetry(state, sub, attempts);
      continue;
    }

    if (sub.pendingRefund && state.day >= sub.pendingRefund.day) {
      refund(state, sub.pendingRefund.chargeId);
      sub.pendingRefund = null;
      endSub(state, sub, 'refund_requested');
      continue;
    }

    if (sub.status === 'active' && state.day >= sub.currentPeriodEnd) {
      sub.paidMonths += sub.interval === 'year' ? 12 : 1;
      if (sub.cancelAtPeriodEnd || chance(state, churnBeforeRenewal(state, sub))) {
        endSub(state, sub, sub.cancelReason ?? 'voluntary');
        continue;
      }
      startPaidPeriod(state, sub, false);
    }
  }

  // Disputes: open → founder has 7 days to respond (Stripe gives ~7–21 days).
  for (const d of st.disputes) {
    if (d.status === 'scheduled' && state.day >= d.day) {
      d.status = 'needs_response';
      d.dueDay = state.day + 7;
      st.available = round2(st.available - d.amount - PAYMENTS.disputeFee);
      const ch = st.charges.find((c) => c.id === d.chargeId);
      if (ch) ch.status = 'disputed';
      notify(state, `New dispute: ${d.reason.replace('_', ' ')} on a ${d.amount.toFixed(2)} charge. Respond in Stripe within 7 days.`, { type: 'bad', app: 'stripe' });
    } else if (d.status === 'needs_response' && state.day > d.dueDay) {
      d.status = 'lost';
    } else if (d.status === 'under_review' && state.day >= d.decisionDay) {
      d.status = chance(state, PAYMENTS.disputeWinWithEvidence * (0.5 + d.evidenceQuality)) ? 'won' : 'lost';
      if (d.status === 'won') st.available = round2(st.available + d.amount + PAYMENTS.disputeContestFee);
      notify(state, `Dispute ${d.status}: ${d.amount.toFixed(2)}.`, { type: d.status === 'won' ? 'good' : 'bad', app: 'stripe' });
    }
  }

  // Pending funds become available, then pay out to the bank on business days.
  const ready = st.pending.filter((p) => p.availableDay <= state.day);
  if (ready.length) {
    st.available = round2(st.available + sum(ready.map((p) => p.amount)));
    st.pending = st.pending.filter((p) => p.availableDay > state.day);
  }
  if (!isWeekend(state) && st.available > 1 && st.settings.payoutSchedule === 'daily') {
    const amount = round2(st.available);
    st.available = 0;
    const p = { id: uid('po'), day: state.day, arrivalDay: state.day + 1, amount, status: 'in_transit' };
    st.payouts.push(p);
  }
  for (const p of st.payouts) {
    if (p.status === 'in_transit' && state.day >= p.arrivalDay) {
      p.status = 'paid';
      post(state, { amount: p.amount, counterparty: 'Stripe', description: `STRIPE TRANSFER ${p.id.slice(-8).toUpperCase()}`, category: 'stripe_payout', method: 'ach' });
    }
  }

  compact(state);
}

// Keep saves small: roll old charges/invoices into monthly summaries, drop old canceled subscriptions' detail.
function compact(state) {
  const st = S(state);
  if (state.day % 30 !== 0) return;
  const cutoff = state.day - KEEP_DETAIL_DAYS;
  const old = st.charges.filter((c) => c.day < cutoff);
  for (const c of old) {
    const k = `m${Math.floor(c.day / 30)}`;
    const a = (st.archive[k] ??= { gross: 0, fees: 0, refunds: 0, charges: 0, failed: 0 });
    if (c.status === 'failed') a.failed++;
    else { a.gross += c.amount; a.fees += c.fee; a.charges++; if (c.status === 'refunded') a.refunds += c.amount; }
  }
  st.charges = st.charges.filter((c) => c.day >= cutoff);
  st.invoices = st.invoices.filter((i) => i.day >= cutoff || i.status === 'open');
  st.payouts = st.payouts.filter((p) => p.day >= cutoff);
  st.refunds = st.refunds.filter((r) => r.day >= cutoff);
}
