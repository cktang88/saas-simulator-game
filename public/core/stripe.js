// Payments engine modeled on Stripe Billing: customers, subscriptions, trials, invoices, charges,
// fees, failed payments & retries, refunds, disputes, a pending/available balance, and payouts to the bank.
// MRR movements are recorded as events (new / expansion / contraction / churn / reactivation)
// so the analytics app can build ChartMogul-style reports.

import { PAYMENTS } from './params.js';
import { uid, round2, chance, rng, isWeekend, sum, gaussian, dateOf, dayOfMonth } from './util.js';
import { post } from './bank.js';
import { churnBeforeRenewal, trialConversion, mainPlan, annualPickShare } from './market.js';
import { notify } from './state.js';
import { capitalWithhold } from './debt.js';

const KEEP_DETAIL_DAYS = 120; // older charges/invoices are rolled into monthly summaries to bound save size
const SUB_ARCHIVE_DAYS = 395; // canceled subscriptions older than ~13 months are rolled into monthly counts

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
  state.stripe.capitalRepayments ??= []; // Stripe Capital withholdings (see core/debt.js)
  return state.stripe;
}

const S = (state) => ensureStripe(state);
// O(1) lookups by id. Indexes live outside the saved state (WeakMap keyed by the array) and are rebuilt when
// the array changes length or an id misses.
const idIndex = new WeakMap();
function findById(arr, id) {
  if (id == null || !arr) return undefined;
  let m = idIndex.get(arr);
  if (!m || arr.length < m.n) { m = { n: 0, map: new Map() }; idIndex.set(arr, m); }
  for (; m.n < arr.length; m.n++) m.map.set(arr[m.n].id, arr[m.n]); // arrays only grow by push between rebuilds
  const x = m.map.get(id);
  if (x && x.id !== id) { idIndex.delete(arr); return findById(arr, id); }
  if (!x) { const y = arr.find((e) => e.id === id); if (y) idIndex.delete(arr); return y; } // spliced arrays: rare
  return x;
}
export const customerById = (state, id) => findById(S(state).customers, id);
export const subscriptionById = (state, id) => findById(S(state).subscriptions, id);
const cust = customerById;
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
    currency: plan.currency ?? 'usd',
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
  // Enterprise invoices (net-30, ACH/wire) are issued, not charged: the period starts and the customer pays later.
  if (sub.invoiceManually) {
    issueInvoice(state, sub);
    sub.currentPeriodStart = state.day;
    sub.currentPeriodEnd = state.day + periodDays(sub);
    if (isNew) mrrEvent(state, 'new', monthlyAmount(sub), sub);
    return;
  }
  const ok = invoiceAndCharge(state, sub);
  sub.currentPeriodStart = state.day;
  sub.currentPeriodEnd = state.day + periodDays(sub);
  if (ok) {
    if (isNew) mrrEvent(state, 'new', monthlyAmount(sub), sub);
  } else if (isNew && !sub.trialEndDay) {
    // A brand-new subscription whose first payment fails is 'incomplete' (not MRR); Stripe expires it after 23h.
    sub.status = 'incomplete';
    sub.incompleteDay = state.day;
  } else {
    sub.status = 'past_due';
    if (isNew) mrrEvent(state, 'new', monthlyAmount(sub), sub);
    scheduleRetry(state, sub, 0);
  }
}

export function cancel(state, subId, { atPeriodEnd = true, reason = 'customer_request' } = {}) {
  const sub = subscriptionById(state, subId);
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
  const sub = subscriptionById(state, subId);
  if (!sub) return;
  const before = monthlyAmount(sub);
  if (price != null) sub.price = price;
  if (quantity != null) sub.quantity = quantity;
  const delta = monthlyAmount(sub) - before;
  if (isLive(sub) && Math.abs(delta) > 0.001) mrrEvent(state, delta > 0 ? 'expansion' : 'contraction', delta, sub);
}

// ---- Charging ----

// Card fee. FX (+1%) applies only when the charge currency differs from USD settlement (a non-USD plan, or
// Adaptive Pricing showing local currencies to international customers).
export function feeFor(state, amount, customer, currency = 'usd') {
  const st = S(state);
  if (st.settings.merchantOfRecord) return round2(amount * PAYMENTS.morPct + PAYMENTS.morFixed);
  let pct = PAYMENTS.cardPct + PAYMENTS.billingPct;
  const intl = customer?.country !== 'US';
  if (intl) pct += PAYMENTS.intlCardPct;
  if ((currency ?? 'usd') !== 'usd' || (intl && st.settings.adaptivePricing)) pct += PAYMENTS.fxPct;
  if (st.settings.stripeTax) pct += PAYMENTS.taxPct;
  return round2(amount * pct + PAYMENTS.cardFixed);
}

// Invoice paid by ACH Direct Debit / bank transfer: 0.8% capped at $5, plus Billing 0.7% (or Invoicing 0.4%).
export function achInvoiceFee(state, amount) {
  const st = S(state);
  if (st.settings.merchantOfRecord) return round2(amount * PAYMENTS.morPct + PAYMENTS.morFixed);
  const ach = Math.min(PAYMENTS.achCap, amount * PAYMENTS.achPct);
  const billing = amount * (st.settings.invoicingOnly ? PAYMENTS.invoicingPct : PAYMENTS.billingPct);
  return round2(ach + billing + (st.settings.stripeTax ? amount * PAYMENTS.taxPct : 0));
}

const invoiceAmount = (sub) => round2(sub.price * (sub.quantity ?? 1) * (1 - (sub.discountPct ?? 0)));

// ---- Enterprise invoices: net-30, paid late on a lognormal (median due + 10 days, p90 due + 45) ----

function issueInvoice(state, sub) {
  const st = S(state);
  const dueDay = state.day + PAYMENTS.invoiceNetDays;
  const sigma = Math.log(PAYMENTS.invoiceLateP90Days / PAYMENTS.invoiceLateMedianDays) / 1.2816;
  const late = Math.exp(Math.log(PAYMENTS.invoiceLateMedianDays) + sigma * gaussian(state)) - 1; // days past due (a few pay on time)
  const never = chance(state, PAYMENTS.invoiceNeverPays);
  const inv = {
    id: uid('in'), subId: sub.id, customerId: sub.customerId, day: state.day, issuedDay: state.day, dueDay, amount: invoiceAmount(sub),
    status: 'open', attempts: 0, method: 'ach_invoice', collection: 'send_invoice',
    payDay: never ? null : Math.max(state.day + 3, Math.round(dueDay + late)), reminders: 0,
  };
  st.invoices.push(inv);
  return inv;
}

// "Send reminder" (0.1h in the Stripe app): pulls an overdue/near-due invoice's payment forward.
export function sendInvoiceReminder(state, invoiceId) {
  const inv = S(state).invoices.find((i) => i.id === invoiceId);
  if (!inv || inv.status !== 'open' || inv.method !== 'ach_invoice') return null;
  inv.reminders++;
  if (inv.payDay == null) { if (chance(state, 0.35)) inv.payDay = state.day + 5 + Math.floor(rng(state) * 10); }
  else if (inv.payDay > state.day + 2) inv.payDay = Math.max(state.day + 2, Math.round(state.day + (inv.payDay - state.day) * 0.5));
  return inv;
}

function collectInvoice(state, inv) {
  const st = S(state);
  const sub = subscriptionById(state, inv.subId);
  const c = cust(state, inv.customerId);
  inv.attempts++;
  inv.status = 'paid';
  inv.paidDay = state.day;
  const charge = { id: uid('ch'), invoiceId: inv.id, customerId: inv.customerId, subId: inv.subId, day: state.day, amount: inv.amount, fee: achInvoiceFee(state, inv.amount), status: 'succeeded', failureCode: null, method: 'ach_invoice' };
  st.charges.push(charge);
  if (sub) sub.firstPaidDay ??= state.day;
  toPending(state, charge, c, sub);
}

export const openInvoices = (state) => S(state).invoices.filter((i) => i.status === 'open' && i.method === 'ach_invoice');
export const accountsReceivable = (state) => round2(sum(openInvoices(state).map((i) => i.amount)));

function invoiceAndCharge(state, sub, attempt = 0, { newCard = false } = {}) {
  const st = S(state);
  const c = cust(state, sub.customerId);
  const amount = invoiceAmount(sub);
  let inv = attempt > 0 ? st.invoices.find((i) => i.subId === sub.id && i.status === 'open') : null;
  if (!inv) {
    inv = { id: uid('in'), subId: sub.id, customerId: sub.customerId, day: state.day, amount, status: 'open', attempts: 0 };
    st.invoices.push(inv);
  }
  inv.attempts++;
  if (c && !c.card) c.card = { brand: 'visa', last4: String(Math.floor(rng(state) * 9000 + 1000)), expiresDay: state.day + 1000 }; // returning archived customer
  if (newCard && c) { c.card = { ...c.card, last4: String(Math.floor(rng(state) * 9000 + 1000)), expiresDay: state.day + 700 + Math.floor(rng(state) * 400), blocked: false }; }
  // The account updater refreshes most expired cards before the renewal is attempted (included with Stripe).
  if (c && c.card.expiresDay < state.day && attempt === 0 && chance(state, PAYMENTS.updaterRefreshRate)) {
    while (c.card.expiresDay < state.day) c.card.expiresDay += 1095;
  }
  const expired = c && c.card.expiresDay < state.day;
  const blocked = c?.card?.blocked;
  const dunning = st.settings.dunningEmails ?? true;
  let pSuccess = 1 - PAYMENTS.renewalFailRate[state.company.model];
  if (attempt > 0) pSuccess = PAYMENTS.retrySuccess * (st.settings.smartRetries ? PAYMENTS.smartRetryBoost : 1) * (dunning ? 1.25 : 1); // reminder emails get some customers to update cards [design]
  if (expired) pSuccess = attempt > 0 ? (dunning ? PAYMENTS.expiredRetrySuccess : PAYMENTS.expiredRetrySuccess * 0.4) : 0; // customer updates the card from the hosted page
  if (blocked) pSuccess = 0;
  const ok = rng(state) < pSuccess;
  const charge = {
    id: uid('ch'), invoiceId: inv.id, customerId: sub.customerId, subId: sub.id, day: state.day, amount,
    fee: ok ? feeFor(state, amount, c, sub.currency) : 0, status: ok ? 'succeeded' : 'failed',
    failureCode: ok ? null : blocked ? 'card_blocked' : expired ? 'expired_card' : pick3(state), method: 'card',
  };
  st.charges.push(charge);
  if (ok) {
    inv.status = 'paid';
    sub.firstPaidDay ??= state.day;
    if (c && expired) c.card.expiresDay = state.day + 1095; // the customer entered the new card
    toPending(state, charge, c, sub);
    maybeRefundOrDispute(state, charge, sub);
  }
  return ok;
}

// Net of fees (and any Stripe Capital withholding) goes to pending; available after T+2 business days.
// New accounts: the first payout comes 7 calendar days after the first charge (14 for annual prepay).
function toPending(state, charge, c, sub) {
  const st = S(state);
  st.firstChargeDay ??= state.day;
  if (st.firstPayoutDay == null) {
    const hold = sub?.interval === 'year' && state.company.model === 'b2c' ? PAYMENTS.firstPayoutHoldDaysRisky : PAYMENTS.firstPayoutHoldDays;
    st.firstPayoutDay = nextBusinessDay(state, st.firstChargeDay + hold);
  }
  let net = round2(charge.amount - charge.fee);
  const withheld = capitalWithhold(state, net, charge.id);
  if (withheld > 0) { charge.capitalWithheld = withheld; net = round2(net - withheld); }
  const avail = Math.max(addBusinessDays(state, state.day, PAYMENTS.payoutDelayDays), st.firstPayoutDay);
  st.pending.push({ amount: net, availableDay: avail, chargeId: charge.id });
}

function pick3(state) {
  const r = rng(state);
  return r < 0.5 ? 'insufficient_funds' : r < 0.8 ? 'do_not_honor' : 'generic_decline';
}

// ---- US bank business days (Federal Reserve holidays) ----

function nthWeekday(year, month, weekday, n) { // n >= 1; n = -1 for last
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
}
const holidayCache = new Map();
function fedHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const fixed = [[0, 1], [5, 19], [6, 4], [10, 11], [11, 25]]; // New Year, Juneteenth, July 4, Veterans Day, Christmas
  const set = new Set();
  for (const [m, d] of fixed) {
    const wd = new Date(Date.UTC(year, m, d)).getUTCDay();
    if (wd === 0) set.add(`${m}-${d + 1}`); // Sunday → observed Monday (the Fed stays open on Friday for Saturday holidays)
    else if (wd !== 6) set.add(`${m}-${d}`);
  }
  set.add(`0-${nthWeekday(year, 0, 1, 3)}`); // MLK Day
  set.add(`1-${nthWeekday(year, 1, 1, 3)}`); // Presidents' Day
  set.add(`4-${nthWeekday(year, 4, 1, -1)}`); // Memorial Day
  set.add(`8-${nthWeekday(year, 8, 1, 1)}`); // Labor Day
  set.add(`9-${nthWeekday(year, 9, 1, 2)}`); // Columbus Day
  set.add(`10-${nthWeekday(year, 10, 4, 4)}`); // Thanksgiving
  holidayCache.set(year, set);
  return set;
}
export function isBankHoliday(state, day = state.day) {
  const d = dateOf(state, day);
  return fedHolidays(d.getUTCFullYear()).has(`${d.getUTCMonth()}-${d.getUTCDate()}`);
}
export const isBusinessDay = (state, day = state.day) => !isWeekend(state, day) && !isBankHoliday(state, day);
export function nextBusinessDay(state, day) {
  while (!isBusinessDay(state, day)) day++;
  return day;
}
export function addBusinessDays(state, day, n) {
  let added = 0;
  while (added < n) { day++; if (isBusinessDay(state, day)) added++; }
  return day;
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
  const refundRate = sub.interval === 'year' ? PAYMENTS.refundRateAnnual[model] : PAYMENTS.refundRate[model];
  if (first && chance(state, refundRate)) {
    sub.pendingRefund = { day: state.day + 1 + Math.floor(rng(state) * 6), chargeId: charge.id };
  } else if (chance(state, PAYMENTS.disputeRate[model])) {
    S(state).disputes.push({ id: uid('dp'), chargeId: charge.id, customerId: charge.customerId, day: state.day + 10 + Math.floor(rng(state) * 30), amount: charge.amount, status: 'scheduled', reason: chance(state, 0.6) ? 'subscription_canceled' : 'fraudulent' });
  }
}

// Refund a charge. Without `amount`: refund whatever is left (returns null if the charge can't be refunded).
// With `amount`: a partial refund (throws on an invalid amount). Stripe keeps its processing fee either way;
// the charge stays 'succeeded' until fully refunded. Refund records carry { partial, final, refundableBefore }
// so the books can reverse the right share of deferred revenue.
export function refund(state, chargeId, { amount = null, reason = 'requested_by_customer' } = {}) {
  const st = S(state);
  const ch = st.charges.find((c) => c.id === chargeId);
  if (!ch || ch.status !== 'succeeded') {
    if (amount != null) throw new Error('Only succeeded payments can be refunded.');
    return null;
  }
  const left = round2(ch.amount - (ch.amountRefunded ?? 0));
  const amt = round2(amount ?? left);
  if (!(amt > 0) || amt > left + 0.001) {
    if (amount != null) throw new Error(`You can refund up to ${left.toFixed(2)}.`);
    return null;
  }
  ch.amountRefunded = round2((ch.amountRefunded ?? 0) + amt);
  const final = ch.amountRefunded >= ch.amount - 0.001;
  if (final) ch.status = 'refunded';
  st.available = round2(st.available - amt);
  const r = { id: uid('re'), chargeId, day: state.day, amount: amt, reason, partial: !final || amt < ch.amount, final, refundableBefore: left };
  st.refunds.push(r);
  return r;
}

// One-off charge on a customer's card (proration invoices, setup fees). Always succeeds (the card was just used);
// same fee, T+2 settlement, new-account payout hold and Stripe Capital withholding as subscription charges.
export function charge(state, customerId, { amount, description = 'One-off charge', source = null, subId = null, serviceDays = null } = {}) {
  amount = round2(amount);
  if (!(amount >= 0.5)) return null; // Stripe minimum charge is $0.50
  const st = S(state);
  const c = cust(state, customerId);
  const sub = subId ? subscriptionById(state, subId) : null;
  const inv = { id: uid('in'), subId, customerId, day: state.day, amount, status: 'paid', attempts: 1, description };
  st.invoices.push(inv);
  const ch = {
    id: uid('ch'), invoiceId: inv.id, customerId, subId, day: state.day, amount, fee: feeFor(state, amount, c, sub?.currency), status: 'succeeded', failureCode: null,
    method: sub?.invoiceManually ? 'ach_invoice' : 'card', description, ...(serviceDays != null ? { serviceDays } : {}), ...(source ? { source } : {}),
  };
  st.charges.push(ch);
  toPending(state, ch, c, sub);
  return ch;
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
  assignPlanMix(state);

  for (const sub of st.subscriptions) {
    if (sub.status === 'canceled') continue;

    if (sub.status === 'incomplete') {
      if (state.day <= sub.incompleteDay) continue;
      // 23h later: most incomplete checkouts expire; some customers retry with another card.
      if (chance(state, 0.3) && invoiceAndCharge(state, sub, 0, { newCard: true })) {
        sub.status = 'active';
        sub.currentPeriodStart = state.day;
        sub.currentPeriodEnd = state.day + periodDays(sub);
        mrrEvent(state, 'new', monthlyAmount(sub), sub);
      } else {
        sub.status = 'canceled';
        sub.canceledDay = state.day;
        sub.cancelReason = 'incomplete_expired';
        const inv = st.invoices.find((i) => i.subId === sub.id && i.status === 'open');
        if (inv) inv.status = 'void';
      }
      continue;
    }

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
      refund(state, sub.pendingRefund.chargeId, { reason: 'requested_by_customer' });
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

  // Enterprise invoices: collect on the customer's pay day; write off long-overdue ones.
  for (const inv of st.invoices) {
    if (inv.status !== 'open' || inv.method !== 'ach_invoice') continue;
    if (inv.payDay != null && state.day >= inv.payDay) collectInvoice(state, inv);
    else if (state.day >= inv.dueDay + 120) {
      inv.status = 'uncollectible';
      const sub = subscriptionById(state, inv.subId);
      if (sub && isLive(sub)) endSub(state, sub, 'payment_failed');
      notify(state, `Invoice ${inv.id.slice(-6).toUpperCase()} (${inv.amount.toFixed(2)}) is 120 days past due and was written off. The account is canceled.`, { type: 'bad', app: 'stripe' });
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
      // Merchants cancel the subscription on a chargeback and block the card (a stolen card gets reissued anyway).
      const dsub = ch && subscriptionById(state, ch.subId);
      if (dsub && dsub.status !== 'canceled') endSub(state, dsub, 'disputed');
      const dc = cust(state, d.customerId);
      if (dc) dc.card.blocked = true;
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
  if (st.available > 1 && payoutToday(state)) {
    const amount = round2(st.available);
    st.available = 0;
    // The payout is created on the day funds become available and lands the same business day.
    const p = { id: uid('po'), day: state.day, arrivalDay: state.day, amount, status: 'in_transit' };
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
  st.capitalRepayments = (st.capitalRepayments ?? []).filter((r) => r.day >= cutoff);
  // Subscriptions canceled more than ~13 months ago are rolled into monthly counts (their MRR movements stay in
  // st.events, their revenue in st.archive). Customers are kept (CRM, helpdesk and success look them up).
  const subCutoff = state.day - SUB_ARCHIVE_DAYS;
  if (st.subscriptions.some((x) => x.status === 'canceled' && x.canceledDay != null && x.canceledDay < subCutoff)) {
    st.subArchive ??= {};
    st.subscriptions = st.subscriptions.filter((x) => {
      if (!(x.status === 'canceled' && x.canceledDay != null && x.canceledDay < subCutoff)) return true;
      const a = (st.subArchive[`m${Math.floor(x.canceledDay / 30)}`] ??= { canceled: 0, reasons: {} });
      a.canceled++;
      a.reasons[x.cancelReason ?? 'unknown'] = (a.reasons[x.cancelReason ?? 'unknown'] ?? 0) + 1;
      return false;
    });
  }
  // Long-gone customers keep their identity and card (other apps look them up) but drop channel metadata.
  for (const c of st.customers) {
    if (c.archived || c.createdDay >= subCutoff || c.crmCompanyId) continue;
    if (c.subscriptionId && findById(st.subscriptions, c.subscriptionId)) continue;
    delete c.meta;
    c.archived = true;
  }
}

/**
 * Withhold `amount` from the Stripe balance (available first, then the earliest pending funds) to repay
 * financing serviced through Stripe (e.g. Fundraising's Stripe Capital-style advance). Recorded in
 * st.capitalRepayments ({ id, day, amount, principal, interest, loanId, source }) like core Stripe Capital
 * withholdings so the books can clear it from Stripe clearing. Returns the amount actually withheld.
 */
export function withholdFromStripe(state, amount, { loanId = null, principal = null, interest = 0, source = 'external' } = {}) {
  const st = S(state);
  let left = round2(amount);
  const fromAvail = Math.min(left, Math.max(0, st.available));
  st.available = round2(st.available - fromAvail);
  left = round2(left - fromAvail);
  for (const p of st.pending.slice().sort((a, b) => a.availableDay - b.availableDay)) {
    if (left <= 0) break;
    const x = Math.min(left, p.amount);
    p.amount = round2(p.amount - x);
    left = round2(left - x);
  }
  st.pending = st.pending.filter((p) => p.amount > 0.004);
  const took = round2(amount - left);
  if (took > 0) st.capitalRepayments.push({ id: uid('cap'), day: state.day, chargeId: null, loanId, amount: took, principal: round2(principal != null ? Math.min(principal, took) : took - interest), interest: round2(principal != null ? took - Math.min(principal, took) : interest), source });
  return took;
}

// Payout schedule: daily (every business day), weekly (Mondays), monthly (1st), manual. Under a merchant of
// record, payouts come monthly or twice monthly (1st & 15th) — settings.morPayoutSchedule. Weekend and
// holiday payout dates roll to the next business day.
function payoutToday(state) {
  const st = S(state);
  if (!isBusinessDay(state)) return false;
  const scheduled = (doms) => {
    // Today is the first business day on/after one of the scheduled days of month, and we haven't paid it out yet.
    for (const dom of doms) {
      let d = state.day - (dayOfMonth(state) - dom);
      if (d > state.day) continue;
      if (nextBusinessDay(state, d) !== state.day) continue;
      const key = `${dateOf(state).toISOString().slice(0, 7)}-${dom}`;
      if (st.lastScheduledPayout === key) return false;
      st.lastScheduledPayout = key;
      return true;
    }
    return false;
  };
  if (st.settings.merchantOfRecord) return scheduled((st.settings.morPayoutSchedule ?? 'semimonthly') === 'monthly' ? [1] : [1, 15]);
  const sched = st.settings.payoutSchedule ?? 'daily';
  if (sched === 'daily') return true;
  if (sched === 'weekly') return nextBusinessDay(state, state.day - ((dateOf(state).getUTCDay() + 6) % 7)) === state.day; // Monday (or the next business day)
  if (sched === 'monthly') return scheduled([1]);
  return false; // manual
}

// Instant Payout to the bank (1.5%, $0.50 minimum), from the available balance. The fee is shown as its own
// bank line so the books' Stripe clearing still ties out.
export function instantPayout(state, amount = null) {
  const st = S(state);
  amount = round2(amount ?? st.available);
  if (!(amount > 0) || amount > st.available + 0.005) throw new Error(`Only ${st.available.toFixed(2)} is available for payout.`);
  const fee = round2(Math.max(PAYMENTS.instantPayoutMin, amount * PAYMENTS.instantPayoutPct));
  st.available = round2(st.available - amount);
  const p = { id: uid('po'), day: state.day, arrivalDay: state.day, amount, status: 'paid', instant: true, fee };
  st.payouts.push(p);
  post(state, { amount, counterparty: 'Stripe', description: `STRIPE INSTANT PAYOUT ${p.id.slice(-8).toUpperCase()}`, category: 'stripe_payout', method: 'ach' });
  post(state, { amount: -fee, counterparty: 'Stripe', description: 'Stripe Instant Payout fee (1.5%)', category: 'payment_fees', method: 'internal' });
  return p;
}

// Manual payout (schedule 'manual'): standard speed, lands the next business day.
export function manualPayout(state) {
  const st = S(state);
  if (!(st.available > 1)) throw new Error('Nothing available to pay out.');
  const amount = round2(st.available);
  st.available = 0;
  const p = { id: uid('po'), day: state.day, arrivalDay: addBusinessDays(state, state.day, 1), amount, status: 'in_transit' };
  st.payouts.push(p);
  return p;
}

// Self-serve plan mix: when the main plan has an active monthly/annual sibling, new self-serve checkouts
// pick between them (MARKET.annualShare scaled by relative price). Leaves CRM deals, explicitly chosen plans
// and the Pricing lab's tier/interval assignment alone. Applies to trials (charged at trial end).
function assignPlanMix(state) {
  const st = S(state);
  const main = mainPlan(state);
  if (!main) return;
  const P = state.apps?.pricing;
  if (P && (P.tiers?.length > 1 || P.annualDiscount)) return; // pricing-sim.js tierDay owns the mix
  const other = state.plans.find((p) => p.active && p.id !== main.id && p.interval !== main.interval && !String(p.id).startsWith('tier_'));
  if (!other) return;
  const monthly = main.interval === 'month' ? main : other;
  const annual = main.interval === 'year' ? main : other;
  const share = annualPickShare(state, monthly, annual);
  for (let i = st.subscriptions.length - 1; i >= 0; i--) {
    const sub = st.subscriptions[i];
    if (state.day - sub.startDay > 1) break; // subscriptions are appended in time order
    if (sub.mixAssigned || sub.planId !== main.id || sub.status !== 'trialing') continue;
    sub.mixAssigned = true;
    const c = cust(state, sub.customerId);
    if (c?.crmCompanyId || sub.lab || sub.tier) continue;
    const pick = rng(state) < share ? annual : monthly;
    if (pick.id === sub.planId) continue;
    sub.planId = pick.id;
    sub.price = pick.price;
    sub.interval = pick.interval;
  }
}
