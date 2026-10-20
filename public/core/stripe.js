// Payments engine modeled on Stripe Billing: customers, subscriptions, trials, invoices, charges,
// fees, failed payments & retries, refunds, disputes, a pending/available balance, and payouts to the bank.
// MRR movements are recorded as events (new / expansion / contraction / churn / reactivation)
// so the analytics app can build ChartMogul-style reports.

import { PAYMENTS } from './params.js';
import { MOR_PROVIDERS } from '../apps/money/vendors.js';
import { uid, round2, chance, rng, isWeekend, sum, gaussian, dateOf, dayOfMonth } from './util.js';
import { dueDay as timingDue, timeline, invoicePayFactors, explain } from './timing.js';
import { getSegment } from '../data/buyer-segments.js';
import { paymentFailMult, subModel, profileOf } from './customer-type.js';
import { post } from './bank.js';
import { trialConversion, mainPlan, annualPickShare } from './market.js';
import { notify } from './state.js';
import { capitalWithhold } from './debt.js';
import { churnDay, renewalDecision, recordChurn, pauseAtRenewal, noteSignal } from './churn.js';
import { logMistake } from './operator.js';
import { storePayoutDay } from './mobile.js';

// ---- Dunning (failed-payment recovery) ----
// Decline mix: Churnkey's ~5.4M failed payments [unverified] rescaled so soft declines are ~83% of failures
// (CROSS.declineReasons.softShareOfFailures 0.8-0.9). Soft declines recover on retries; hard declines and expired
// cards only when the customer puts in a new card (Stripe will not retry highest_risk_level /
// transaction_not_allowed). Calibration [design]: Stripe's ordinary defaults (fixed schedule, one plain email, no
// card updater) recover ~35-45%; Smart Retries + a 4-step sequence with update links from a person + the card
// updater recover ~70-80% (Recurly median 47.6%, layered programmes 70-85% [unverified]; CROSS.dunningRecovery).
export const DUNNING = {
  declines: { insufficient_funds: 0.58, do_not_honor: 0.12, generic_decline: 0.09, processing_error: 0.04, transaction_not_allowed: 0.06, highest_risk_level: 0.055, incorrect_number: 0.03, lost_card: 0.01, expired_card: 0.015 },
  soft: new Set(['insufficient_funds', 'do_not_honor', 'generic_decline', 'processing_error']),
  perAttempt: { fixed: 0.125, smart: 0.135 }, // per retry on a soft decline [design]
  schedule: { fixed: PAYMENTS.retryDays, smart: [1, 1, 2, 2, 2, 2, 2, 2] }, // Smart Retries: 8 tries within 2 weeks (Stripe docs)
  cardUpdateBase: 0.08, // chance one dunning message gets the customer to enter a new card, before copy quality [design]
  newCardSuccess: 0.92,
  channel: { email: 1, in_app: 0.8, sms: 1.1 },
  fromPerson: 1.15, // emails from a named person get opened and answered more [design]
  stepDecay: 0.85,
  updaterRefresh: { on: 0.95, off: PAYMENTS.updaterRefreshRate }, // off: issuers' network tokens and automatic updates still refresh most (0.75); on: Stripe's card account updater catches nearly all [design] (expired cards are ~1.1% of declines in Churnkey data)
  preExpiryUpdate: 0.35, // card-expiry reminder 30 days ahead: customer updates before the charge [design]
  maxSteps: 6,
};
export const DEFAULT_DUNNING_STEP = { day: 0, channel: 'email', subject: 'Payment failed', body: 'We were unable to process your payment. Please update your payment method: {{update_link}}' }; // Stripe's stock failed-payment email
export const declineClass = (code) => (DUNNING.soft.has(code) ? 'soft' : code === 'expired_card' ? 'expired' : 'hard');

/** Heuristic quality 0..1 of one dunning message (copy judged; the Stripe app can blend an LLM read in). */
export function dunningStepQuality(step = {}) {
  const t = `${step.subject ?? ''}\n${step.body ?? ''}`.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  let q = 0.3;
  if (/\{\{\s*(update_link|card_link|link)\s*\}\}|https?:\/\/|update (your )?(card|payment)[^.]*\b(here|link|below|this page)/.test(t)) q += 0.3; else q -= 0.1;
  if (/\{\{\s*(amount|plan|date|first_name|name)\s*\}\}|\$\d/.test(t)) q += 0.1;
  if (/\b(i'm|i am|founder|— ?[a-z]+$|thanks,\s*[a-z]+|cheers,\s*[a-z]+)/m.test(t)) q += 0.1;
  if (/\b(pause|downgrade|reply to this|just reply|happy to help|no rush)\b/.test(t)) q += 0.1;
  if (/\b(failure to|terminat|legal|collections|immediately suspend|final warning|you failed)\b/.test(t)) q -= 0.25;
  if (words > 160) q -= 0.15;
  if (words < 8) q -= 0.1;
  if (step.subject && !/^\s*(payment failed|invoice|action required)\s*$/i.test(step.subject)) q += 0.05;
  return Math.max(0, Math.min(1, q));
}

export function ensureDunning(state) {
  const st = state.stripe;
  st.settings.dunning ??= { steps: [{ ...DEFAULT_DUNNING_STEP }], fromPerson: false, designedDay: null };
  st.settings.cardUpdater ??= false;
  st.settings.preExpiryEmails ??= false;
  st.dunningStats ??= { failed: 0, recovered: 0, lost: 0, byCode: {} };
  return st.settings.dunning;
}
const codeStat = (st, code) => (st.dunningStats.byCode[code] ??= { failed: 0, recovered: 0, lost: 0 });
function pickDecline(state) {
  let r = rng(state);
  for (const [k, w] of Object.entries(DUNNING.declines)) { if (k === 'expired_card') continue; r -= w / (1 - DUNNING.declines.expired_card); if (r <= 0) return k; }
  return 'insufficient_funds';
}

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
    // Ordinary processor defaults (operator-tiers audit item 1): fixed retry schedule, one plain email, no updater.
    settings: { smartRetries: false, dunningEmails: true, cardUpdater: false, preExpiryEmails: false, merchantOfRecord: false, stripeTax: false, payoutSchedule: 'daily' },
  };
  ensureDunning(state);
  state.stripe.capitalRepayments ??= []; // Stripe Capital withholdings (see core/debt.js)
  if (!state.stripe.flows) { const st = state.stripe; st.flows = { opening: round2(stripeBalanceNow(st)), sinceDay: state.day, charges: 0, refunds: 0, disputes: 0, disputeReversals: 0, fees: 0, payouts: 0, withheld: 0 }; }
  return state.stripe;
}

const S = (state) => ensureStripe(state);
const stripeBalanceNow = (st) => (st.available ?? 0) + sum((st.pending ?? []).map((p) => p.amount)) + sum((st.payouts ?? []).filter((p) => p.status === 'in_transit').map((p) => p.amount));
const flow = (st, key, amt) => { if (st.flows) st.flows[key] = round2((st.flows[key] ?? 0) + amt); };

/**
 * Reconciliation: every movement of the Stripe balance is counted in st.flows. opening + charges(net) − refunds
 * − disputes(+fees) + won disputes − contest fees − withholdings − payouts must equal available + pending +
 * in transit, and payouts must equal the Stripe payout lines posted to the bank since tracking began.
 */
export function stripeReconciliation(state) {
  const st = S(state);
  const f = st.flows;
  const expected = round2(f.opening + f.charges - f.refunds - f.disputes + f.disputeReversals - f.fees - f.withheld - f.payouts);
  const actual = round2(stripeBalanceNow(st));
  const bankPayouts = round2(sum(state.bank.txns.filter((t) => t.category === 'stripe_payout' && t.day >= f.sinceDay && t.counterparty === 'Stripe').map((t) => t.amount)));
  return { expected, actual, diff: round2(actual - expected), ok: Math.abs(actual - expected) < 0.05, payoutsTracked: f.payouts, bankPayouts, payoutsOk: Math.abs(bankPayouts - f.payouts) < 0.05, flows: { ...f } };
}
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
export const monthlyAmount = (sub) => (sub.pause ? 0 : (sub.interval === 'year' ? sub.price / 12 : sub.interval === 'week' ? (sub.price * 52) / 12 : sub.price) * (sub.quantity ?? 1) * (1 - (sub.discountPct ?? 0))); // paused: no MRR; weekly store plans (core/mobile.js) are 52/12 months
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
    card: { brand: chance(state, 0.6) ? 'visa' : 'mastercard', last4: String(Math.floor(rng(state) * 9000 + 1000)), expiresDay: state.day + Math.floor(rng(state) * 1800) }, // cards run 3-5 years
    meta,
  };
  S(state).customers.push(c);
  return c;
}

// plan: { id, price, interval, trialDays }. A trial's conversion is decided by the market model when it ends.
export function subscribe(state, customerId, plan, { trial = plan.trialDays > 0, quantity = 1, discountPct = 0, source = 'direct', invoiceManually = false, forceConvert = null, fields = null } = {}) {
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
    ...(state.company.customerType ? { customerType: state.company.customerType } : {}), // who it was sold to (core/customer-type.js)
    ...(forceConvert != null ? { forceConvert } : {}), // fixes trial→paid probability at signup (channel-specific intent)
  };
  if (fields) Object.assign(sub, fields); // set before the first charge (store, refund odds): apps/consumer
  S(state).subscriptions.push(sub);
  const c = cust(state, customerId);
  if (c) c.subscriptionId = sub.id;
  if (!trial) startPaidPeriod(state, sub, true);
  return sub;
}

// Days in the billing period that starts today. Stripe bills on the same day of the month (the billing anchor),
// clamped to shorter months (Jan 31 → Feb 28 → Mar 31), and yearly plans on the same date next year. A flat 30
// days billed ~12.2 times a year (1.4% extra revenue and renewals) and walked renewal dates through the calendar.
export function periodDays(state, sub, from = state.day) {
  if (sub.interval === 'week') return 7;
  const d = dateOf(state, from);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth(), dom = d.getUTCDate();
  const monthLen = (mm) => new Date(Date.UTC(y, mm + 1, 0)).getUTCDate();
  // A period that starts off the anchor (first charge, trial end, activation after a failed first payment, a pause
  // ending) re-anchors to today, as Stripe does; on-time renewals keep the anchor through short months.
  if (sub.billingAnchor == null || Math.min(sub.billingAnchor, monthLen(mo)) !== dom) sub.billingAnchor = dom;
  const m = mo + (sub.interval === 'year' ? 12 : 1);
  const target = Date.UTC(y, m, Math.min(sub.billingAnchor, monthLen(m)), 12);
  return Math.round((target - d.getTime()) / 86400000);
}

function startPaidPeriod(state, sub, isNew) {
  // Enterprise invoices (net-30, ACH/wire) are issued, not charged: the period starts and the customer pays later.
  if (sub.invoiceManually) {
    issueInvoice(state, sub);
    sub.currentPeriodStart = state.day;
    sub.currentPeriodEnd = state.day + periodDays(state, sub);
    if (isNew) mrrEvent(state, 'new', monthlyAmount(sub), sub);
    return;
  }
  const ok = invoiceAndCharge(state, sub);
  sub.currentPeriodStart = state.day;
  sub.currentPeriodEnd = state.day + periodDays(state, sub);
  if (ok) {
    if (isNew) mrrEvent(state, 'new', monthlyAmount(sub), sub);
  } else if (isNew && !sub.trialEndDay) {
    // A brand-new subscription whose first payment fails is 'incomplete' (not MRR); Stripe expires it after 23h.
    sub.status = 'incomplete';
    sub.incompleteDay = state.day;
  } else {
    sub.status = 'past_due';
    if (isNew) mrrEvent(state, 'new', monthlyAmount(sub), sub);
    startDunning(state, sub);
    scheduleRetry(state, sub, 0);
  }
}

function startDunning(state, sub) {
  const st = S(state);
  ensureDunning(state);
  const ch = st.charges.at(-1);
  const code = ch?.subId === sub.id && ch.failureCode ? ch.failureCode : 'insufficient_funds';
  sub.dunning = { startDay: state.day, code, cls: declineClass(code), mode: st.settings.smartRetries ? 'smart' : 'fixed', stepsDone: 0, cardUpdated: false };
  st.dunningStats.failed++;
  codeStat(st, code).failed++;
  noteSignal(state, sub, 'failed_payment');
}

// A dunning message goes out: some customers enter a new card, which is charged right away.
function dunningMessagesDay(state, sub) {
  const st = S(state);
  const d = sub.dunning;
  if (!d || st.settings.dunningEmails === false) return false;
  const set = ensureDunning(state);
  const steps = (set.steps ?? []).slice(0, DUNNING.maxSteps).slice().sort((a, b) => a.day - b.day);
  let i = d.stepsDone;
  while (i < steps.length && state.day >= d.startDay + Math.max(0, Math.round(steps[i].day))) {
    const step = steps[i];
    const q = step.quality ?? dunningStepQuality(step);
    const u = (st.settings.dunningDelivery ?? 1) * DUNNING.cardUpdateBase * (0.4 + 1.2 * q) * (DUNNING.channel[step.channel] ?? 1) * (set.fromPerson ? DUNNING.fromPerson : 1) * Math.pow(DUNNING.stepDecay, i);
    i++;
    d.stepsDone = i;
    if (rng(state) < u) {
      d.cardUpdated = true;
      if (invoiceAndCharge(state, sub, (sub.retry?.attempts ?? 0) + 1, { newCard: true })) return true;
    }
  }
  return false;
}

function dunningRecovered(state, sub) {
  const st = S(state);
  if (sub.dunning) { st.dunningStats.recovered++; codeStat(st, sub.dunning.code).recovered++; }
  sub.dunning = null;
  sub.status = 'active';
  sub.retry = null;
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
  // Canceling now (e.g. a past_due sub) voids its unpaid card invoice, as Stripe does; it no longer sits 'open'.
  for (const inv of S(state).invoices) if (inv.subId === sub.id && inv.status === 'open' && inv.method !== 'ach_invoice') inv.status = 'void';
}

function endSub(state, sub, reason) {
  const wasLive = isLive(sub);
  sub.status = 'canceled';
  sub.canceledDay = state.day;
  sub.cancelReason = reason;
  if (wasLive) mrrEvent(state, 'churn', -monthlyAmount(sub), sub);
  if (wasLive || sub.paidMonths > 0) recordChurn(state, sub, reason); // hidden true reason (core/churn.js)
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

// Card fee. FX (+1%) applies only when the merchant prices in a non-USD currency that settles in USD.
// Adaptive Pricing costs the merchant 0%: the customer pays a 2–4% conversion markup inside the local price
// (docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing, "You pay 0%", fetched 2026-10-14).
// Merchant of record fee by provider (apps/money/vendors.js MOR_PROVIDERS): Paddle 5% + 50¢ all-in; Lemon Squeezy and
// Polar add international and subscription surcharges; Stripe Managed Payments is 3.5% on top of normal Stripe fees.
export function morFee(st, amount, customer) {
  const p = MOR_PROVIDERS[st.settings.morProvider ?? 'paddle'] ?? MOR_PROVIDERS.paddle;
  const intl = customer ? customer.country !== 'US' : false;
  let pct = p.pct + (intl ? p.intl : 0) + p.sub;
  let fixed = p.fixed;
  if (p.onTopOfStripe) { pct += PAYMENTS.cardPct + billingPctFor(st) + (intl ? PAYMENTS.intlCardPct : 0); fixed += PAYMENTS.cardFixed; }
  return round2(amount * pct + fixed);
}
// Stripe Billing's 0.7% applies only while Stripe Billing runs the subscriptions; Orb, Metronome or Chargebee bill
// instead (their own fees are posted by apps/money/backoffice.js).
export const billingPctFor = (st) => ((st.settings.billingPlatform ?? 'stripe_billing') === 'stripe_billing' ? PAYMENTS.billingPct : 0);

export function feeFor(state, amount, customer, currency = 'usd') {
  const st = S(state);
  if (st.settings.merchantOfRecord) return morFee(st, amount, customer);
  let pct = PAYMENTS.cardPct + billingPctFor(st);
  const intl = customer?.country !== 'US';
  if (intl) pct += PAYMENTS.intlCardPct;
  if ((currency ?? 'usd') !== 'usd') pct += PAYMENTS.fxPct;
  if (st.settings.stripeTax) pct += PAYMENTS.taxPct;
  if (st.risk?.highRisk) pct += RISK.highRiskFeePct; // after a termination + MATCH listing only high-risk processors take you
  return round2(amount * pct + PAYMENTS.cardFixed);
}

// Invoice paid by ACH Direct Debit / bank transfer: 0.8% capped at $5, plus Billing 0.7% (or Invoicing 0.4%).
export function achInvoiceFee(state, amount) {
  const st = S(state);
  if (st.settings.merchantOfRecord) return morFee(st, amount, { country: 'US' });
  const ach = Math.min(PAYMENTS.achCap, amount * PAYMENTS.achPct);
  const billing = amount * (st.settings.invoicingOnly ? PAYMENTS.invoicingPct : billingPctFor(st));
  return round2(ach + billing + (st.settings.stripeTax ? amount * PAYMENTS.taxPct : 0));
}

const invoiceAmount = (sub) => round2(sub.price * (sub.quantity ?? 1) * (1 - (sub.discountPct ?? 0)));

// ---- Enterprise invoices: net terms, paid on a timeline draw keyed by who the buyer is ----
// Days-to-pay come from timing.js 'invoice.pay' (net-30 base: median due + 10, p90 due + 45): the buyer segment
// (federal pays inside 30 days under the Prompt Payment Act; hospitals, universities and big-company AP run late),
// the net terms, whether vendor setup (W-9 / supplier portal) was finished, AP portal friction. Reminders pull it in.

// What the AP side knows about this buyer, from the CRM deal that created the customer (read-only; no app imports).
export function invoicePayer(state, sub) {
  const c = cust(state, sub.customerId);
  const crm = state.apps?.crm;
  const deal = c?.meta?.dealId ? crm?.deals?.find((d) => d.id === c.meta.dealId) : null;
  const co = crm?.companies?.find((x) => x.id === (deal?.companyId ?? c?.crmCompanyId));
  const seg = co?.segmentId ? getSegment(co.segmentId) : null;
  const pw = deal?.paperwork ?? [];
  const setup = pw.filter((x) => x.id === 'w9' || x.id === 'vendor_portal');
  return {
    segmentId: seg?.id ?? null, group: seg?.group ?? null, segmentLabel: seg?.label ?? null,
    termsDays: sub.paymentTermsDays ?? deal?.proc?.termsDays ?? PAYMENTS.invoiceNetDays,
    onboarding: setup.length ? (setup.every((x) => x.status === 'done') ? 'done' : 'missing') : null,
    portal: pw.some((x) => x.id === 'vendor_portal'),
  };
}

const LATE_CAP_DAYS = 100; // [design] the 120-days-past-due write-off is for non-payers, not slow AP

function issueInvoice(state, sub) {
  const st = S(state);
  const payer = invoicePayer(state, sub);
  const terms = payer.termsDays || PAYMENTS.invoiceNetDays; // card-pay segments (net-0) invoiced anyway get net-30
  const dueDay = state.day + terms; // net terms negotiated in the deal (net-30/45/60)
  const factors = invoicePayFactors({ ...payer, termsDays: terms });
  const t = timeline(state, 'invoice.pay', factors);
  const never = chance(state, PAYMENTS.invoiceNeverPays * (sub.nonPayMult ?? 1)); // sub.nonPayMult: reps paid on bookings ignore collection risk (people/comp.js)
  const inv = {
    id: uid('in'), subId: sub.id, customerId: sub.customerId, day: state.day, issuedDay: state.day, dueDay, amount: invoiceAmount(sub),
    status: 'open', attempts: 0, method: 'ach_invoice', collection: 'send_invoice',
    payDay: never ? null : Math.max(state.day + 3, Math.min(t.day, dueDay + LATE_CAP_DAYS)), reminders: 0, // slow payers still pay before the write-off; bad debt is the `never` share

    pay: { factors, typical: Math.round(t.median), p90: Math.round(t.p90), why: explain(t), payer: payer.segmentLabel },
  };
  st.invoices.push(inv);
  return inv;
}

// "Send reminder" (0.1h in the Stripe app): a re-draw of the payment date with the reminder pulling it earlier
// (diminishing: the first nudge does most of the work; one before the due date gets it into the next AP run).
export function sendInvoiceReminder(state, invoiceId) {
  const inv = findById(S(state).invoices, invoiceId);
  if (!inv || inv.status !== 'open' || inv.method !== 'ach_invoice') return null;
  inv.reminders++;
  const recent = inv.lastReminderDay != null && state.day - inv.lastReminderDay < 5; // AP doesn't move faster for a second nudge the same week
  inv.lastReminderDay = state.day;
  if (recent) return inv;
  if (inv.payDay == null) { if (chance(state, 0.35)) inv.payDay = timingDue(state, 'invoice.pay', [{ label: 'chased an unpaid invoice', speed: 0.2 }]); return inv; }
  const factors = [...(inv.pay?.factors ?? []), { label: inv.reminders === 1 ? 'reminder sent' : `${inv.reminders} reminders sent`, pull: -0.9 / inv.reminders }, state.day < inv.dueDay ? { label: 'reminder before the due date', pull: -0.2 } : null].filter(Boolean);
  const t = timeline(state, 'invoice.pay', factors, { from: inv.issuedDay });
  if (t.day < inv.payDay) { inv.payDay = Math.max(state.day + 2, t.day); if (inv.pay) inv.pay.why = explain(t); }
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
  if (inv.pay) notify(state, `Invoice ${inv.id.slice(-6).toUpperCase()} paid by ${c?.company ?? c?.name ?? 'the customer'}: ${state.day - inv.issuedDay} days after issue, ${state.day - inv.dueDay > 0 ? `${state.day - inv.dueDay} days past due` : 'on time'} (typical for this buyer ~${inv.pay.typical}; ${inv.pay.factors.map((f) => f.label).join(', ') || 'standard net-30 payer'}).`, { type: state.day > inv.dueDay + 14 ? 'warn' : 'info', app: 'stripe' });
}

export const openInvoices = (state) => S(state).invoices.filter((i) => i.status === 'open' && i.method === 'ach_invoice');
export const accountsReceivable = (state) => round2(sum(openInvoices(state).map((i) => i.amount)));

function invoiceAndCharge(state, sub, attempt = 0, { newCard = false } = {}) {
  const st = S(state);
  const c = cust(state, sub.customerId);
  const amount = invoiceAmount(sub);
  let inv = attempt > 0 ? openCardInvoice(state, sub) : null;
  if (!inv) {
    inv = { id: uid('in'), subId: sub.id, customerId: sub.customerId, day: state.day, amount, status: 'open', attempts: 0 };
    st.invoices.push(inv);
    sub.openInvoiceId = inv.id;
  }
  inv.attempts++;
  if (c && !c.card) c.card = { brand: 'visa', last4: String(Math.floor(rng(state) * 9000 + 1000)), expiresDay: state.day + 1000 }; // returning archived customer
  if (newCard && c) { c.card = { ...c.card, last4: String(Math.floor(rng(state) * 9000 + 1000)), expiresDay: state.day + 700 + Math.floor(rng(state) * 400), blocked: false }; }
  // Expired cards: a pre-expiry reminder (if on) or the card account updater refreshes some before the charge.
  ensureDunning(state);
  if (c && c.card.expiresDay < state.day && attempt === 0) {
    const pre = st.settings.preExpiryEmails && (st.settings.dunningEmails ?? true) ? DUNNING.preExpiryUpdate : 0;
    const upd = st.settings.cardUpdater ? DUNNING.updaterRefresh.on : DUNNING.updaterRefresh.off;
    if (chance(state, 1 - (1 - pre) * (1 - upd))) while (c.card.expiresDay < state.day) c.card.expiresDay += 1095;
  }
  const expired = c && c.card.expiresDay < state.day;
  const blocked = c?.card?.blocked;
  const d = sub.dunning;
  // Debit cards of owner-run shops fail far more often than corporate cards or invoices (customer type, [design]).
  let pSuccess = 1 - Math.min(0.5, (PAYMENTS.renewalFailRate[subModel(state, sub)] ?? PAYMENTS.renewalFailRate[state.company.model]) * paymentFailMult(state, sub));
  if (attempt > 0) pSuccess = newCard ? DUNNING.newCardSuccess : (d?.cls ?? 'soft') === 'soft' ? DUNNING.perAttempt[d?.mode ?? (st.settings.smartRetries ? 'smart' : 'fixed')] : 0;
  if (expired && !newCard) pSuccess = 0;
  if (blocked) pSuccess = 0;
  const ok = rng(state) < pSuccess;
  const code = ok ? null : blocked ? 'card_blocked' : expired ? 'expired_card' : attempt > 0 && d?.code ? d.code : pickDecline(state);
  const charge = {
    id: uid('ch'), invoiceId: inv.id, customerId: sub.customerId, subId: sub.id, day: state.day, amount,
    fee: ok ? (sub.store ? storeChargeFee(state, sub, amount) : feeFor(state, amount, c, sub.currency)) : 0, status: ok ? 'succeeded' : 'failed',
    failureCode: code, method: sub.store ? 'store' : 'card', ...(ok && sub.store ? { store: sub.store } : {}),
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

// In-app purchase / store subscriptions (apps/consumer): the store keeps its commission, and proceeds are paid about
// 33-45 days after the end of the fiscal month (core/mobile.js). The consumer app registers the rate/tooling lookup.
let storeFeeHook = null;
export function setStoreFeeHook(fn) { storeFeeHook = fn; }
function storeChargeFee(state, sub, amount) {
  const r = storeFeeHook ? storeFeeHook(state, sub, amount) : { fee: round2(amount * 0.3) };
  return r.fee;
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
  const withheld = charge.store ? 0 : capitalWithhold(state, net, charge.id); // Stripe Capital only sees Stripe payments, not App Store / Play proceeds
  if (withheld > 0) { charge.capitalWithheld = withheld; net = round2(net - withheld); }
  let avail = Math.max(addBusinessDays(state, state.day, PAYMENTS.payoutDelayDays + (st.risk?.payoutDelay ?? 0)), st.firstPayoutDay);
  if (charge.store) avail = storePayoutDay(state, state.day, charge.store, (parseInt(String(charge.id).slice(-3), 36) % 100) / 100); // store proceeds lag the fiscal month
  flow(st, 'charges', net);
  // Rolling reserve after a risk review: a share of each charge stays in the balance for 90 days (still pending).
  const hold = !charge.store && st.risk?.reservePct > 0 ? round2(net * st.risk.reservePct) : 0;
  if (hold > 0) { st.pending.push({ amount: hold, availableDay: state.day + RISK.reserveHoldDays, chargeId: charge.id, reserve: true }); net = round2(net - hold); }
  st.pending.push({ amount: net, availableDay: avail, chargeId: charge.id });
}

// The subscription's open card invoice (indexed via sub.openInvoiceId; linear fallback for older saves).
function openCardInvoice(state, sub) {
  const st = S(state);
  const byId = sub.openInvoiceId ? findById(st.invoices, sub.openInvoiceId) : null;
  if (byId) return byId.status === 'open' ? byId : null;
  return st.invoices.find((i) => i.subId === sub.id && i.status === 'open' && i.method !== 'ach_invoice') ?? null;
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
  const days = DUNNING.schedule[sub.dunning?.mode ?? (S(state).settings.smartRetries ? 'smart' : 'fixed')];
  if (attemptsDone >= days.length) {
    const st = S(state);
    if (sub.dunning) { st.dunningStats.lost++; codeStat(st, sub.dunning.code).lost++; }
    const set = st.settings;
    const steps = set.dunningEmails === false ? 0 : (set.dunning?.steps?.length ?? 1);
    if (steps <= 1 || !set.smartRetries) { // traceable: a customer lost to a payment problem an ordinary setup left unfixed
      const trap = steps <= 1 ? 'one_email' : 'same_retry';
      logMistake(state, { functionId: 'payments_dunning', id: trap, label: trap === 'one_email' ? 'Lost to a failed payment (one dunning email)' : 'Lost to a failed payment (fixed retry schedule)', cost: { customers: 1, usd: round2(monthlyAmount(sub) * 6) }, delayed: true, detail: `${sub.dunning?.code ?? 'decline'}: ${steps} dunning message(s), ${set.smartRetries ? 'smart' : 'fixed'} retries, card updater ${set.cardUpdater ? 'on' : 'off'}.`, app: 'stripe' });
    }
    endSub(state, sub, 'payment_failed');
    const inv = openCardInvoice(state, sub);
    if (inv) inv.status = 'uncollectible';
    return;
  }
  sub.retry = { attempts: attemptsDone, nextDay: state.day + days[attemptsDone] };
}

function maybeRefundOrDispute(state, charge, sub) {
  const model = subModel(state, sub);
  const disputeMult = profileOf(state, sub.customerType ?? state.company.customerType)?.payments?.disputeMult ?? 1; // owners dispute charges they forgot about [design]
  const first = sub.paidMonths === 0;
  const refundRate = sub.store || sub.mobile ? (sub.refundRate ?? 0.03) : sub.interval === 'year' ? PAYMENTS.refundRateAnnual[model] : PAYMENTS.refundRate[model];
  if (first && chance(state, refundRate)) {
    sub.pendingRefund = { day: timingDue(state, 'refund.request'), chargeId: charge.id };
  } else if (!sub.store && chance(state, PAYMENTS.disputeRate[model] * disputeMult)) {
    // Stolen-card holders spot the charge on their statement within weeks; "I cancelled" disputes come later [design].
    const reason = chance(state, 0.6) ? 'subscription_canceled' : 'fraudulent';
    S(state).disputes.push({ id: uid('dp'), chargeId: charge.id, customerId: charge.customerId, day: Math.max(state.day + 3, timingDue(state, 'dispute.filed', [reason === 'fraudulent' ? { label: 'fraud', pull: -0.6 } : { label: 'cancellation dispute', pull: 0.3 }])), amount: charge.amount, status: 'scheduled', reason });
  }
}

// Refund a charge. Without `amount`: refund whatever is left (returns null if the charge can't be refunded).
// With `amount`: a partial refund (throws on an invalid amount). Stripe keeps its processing fee either way;
// the charge stays 'succeeded' until fully refunded. Refund records carry { partial, final, refundableBefore }
// so the books can reverse the right share of deferred revenue.
export function refund(state, chargeId, { amount = null, reason = 'requested_by_customer' } = {}) {
  const st = S(state);
  const ch = findById(st.charges, chargeId);
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
  // A store refund returns the commission share to the developer too; a processor keeps its fee.
  const feeBack = ch.store && ch.amount > 0 ? round2((ch.fee ?? 0) * amt / ch.amount) : 0;
  st.available = round2(st.available - amt + feeBack);
  flow(st, 'refunds', round2(amt - feeBack));
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
    id: uid('ch'), invoiceId: inv.id, customerId, subId, day: state.day, amount, fee: sub?.invoiceManually ? achInvoiceFee(state, amount) : feeFor(state, amount, c, sub?.currency), status: 'succeeded', failureCode: null,
    method: sub?.invoiceManually ? 'ach_invoice' : 'card', description, ...(serviceDays != null ? { serviceDays } : {}), ...(source ? { source } : {}),
  };
  st.charges.push(ch);
  toPending(state, ch, c, sub);
  return ch;
}

// Founder responds to a dispute with evidence (costs time in the Stripe app).
export function respondToDispute(state, disputeId, evidenceQuality = 0.5) {
  const d = findById(S(state).disputes, disputeId);
  if (!d || d.status !== 'needs_response') return;
  d.status = 'under_review';
  d.evidenceQuality = evidenceQuality;
  S(state).available = round2(S(state).available - PAYMENTS.disputeContestFee); // refunded if you win
  flow(S(state), 'fees', PAYMENTS.disputeContestFee);
  d.decisionDay = timingDue(state, 'dispute.decision'); // the issuer's clock, not yours
}

// ---- Daily processing ----

export function stripeDay(state) {
  const st = S(state);
  assignPlanMix(state);
  churnDay(state); // decide upcoming renewals ahead (intent + leading signals), cancel-flow upkeep

  for (const sub of st.subscriptions) {
    if (sub.status === 'canceled') continue;

    if (sub.status === 'incomplete') {
      if (state.day <= sub.incompleteDay) continue;
      // 23h later: most incomplete checkouts expire; some customers retry with another card. The first attempt's
      // invoice is voided either way (a retry issues its own), so it never lingers as 'open' on an active customer.
      const stale = openCardInvoice(state, sub);
      if (stale) stale.status = 'void';
      if (chance(state, 0.3) && invoiceAndCharge(state, sub, 0, { newCard: true })) {
        sub.status = 'active';
        sub.currentPeriodStart = state.day;
        sub.currentPeriodEnd = state.day + periodDays(state, sub);
        mrrEvent(state, 'new', monthlyAmount(sub), sub);
      } else {
        sub.status = 'canceled';
        sub.canceledDay = state.day;
        sub.cancelReason = 'incomplete_expired';
        const inv = openCardInvoice(state, sub);
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

    if (sub.status === 'past_due' && dunningMessagesDay(state, sub)) { dunningRecovered(state, sub); continue; }
    if (sub.status === 'past_due' && sub.retry && state.day >= sub.retry.nextDay) {
      const attempts = sub.retry.attempts + 1;
      if (invoiceAndCharge(state, sub, attempts)) dunningRecovered(state, sub);
      else scheduleRetry(state, sub, attempts);
      continue;
    }

    if (sub.pendingRefund && state.day >= sub.pendingRefund.day) {
      refund(state, sub.pendingRefund.chargeId, { reason: 'requested_by_customer' });
      sub.pendingRefund = null;
      endSub(state, sub, 'refund_requested');
      continue;
    }

    if (sub.status === 'active' && state.day >= sub.currentPeriodEnd) {
      if (sub.pause) { // paused (cancel flow or a save): no charge until it ends; then resume or leave
        const r = pauseAtRenewal(state, sub);
        if (r === 'paused') { sub.currentPeriodStart = state.day; sub.currentPeriodEnd = Math.max(state.day + 1, sub.pause.untilDay); continue; }
        if (r === 'cancel') { endSub(state, sub, 'voluntary'); continue; }
        startPaidPeriod(state, sub, false);
        continue;
      }
      sub.paidMonths += sub.interval === 'year' ? 12 : 1;
      if (sub.cancelAtPeriodEnd) {
        endSub(state, sub, sub.cancelReason ?? 'voluntary');
        continue;
      }
      // Voluntary churn: calibrated hazard (core/market.js), decided ahead with signals, with a true reason,
      // self-serve cancel-flow offers and any save the founder made (core/churn.js).
      const dec = renewalDecision(state, sub);
      if (dec.churn) {
        sub.churnReason = dec.reason;
        endSub(state, sub, 'voluntary');
        continue;
      }
      if (sub.pause) { sub.currentPeriodStart = state.day; sub.currentPeriodEnd = sub.pause.untilDay; continue; }
      startPaidPeriod(state, sub, false);
    }
  }

  // Enterprise invoices: collect on the customer's pay day; write off long-overdue ones.
  for (const inv of st.invoices) {
    if (inv.status !== 'open' || inv.method !== 'ach_invoice') continue;
    if (inv.payDay != null && state.day >= inv.payDay) collectInvoice(state, inv);
    else if (state.day >= inv.dueDay + 120) {
      inv.status = 'uncollectible';
      inv.writtenOffDay = state.day;
      const sub = subscriptionById(state, inv.subId);
      if (sub && isLive(sub)) endSub(state, sub, 'payment_failed');
      notify(state, `Invoice ${inv.id.slice(-6).toUpperCase()} (${inv.amount.toFixed(2)}) is 120 days past due and was written off. The account is canceled.`, { type: 'bad', app: 'stripe' });
    }
  }

  // Disputes: open → founder has 7 days to respond (Stripe gives ~7–21 days).
  for (const d of st.disputes) {
    if (d.status === 'scheduled' && state.day >= d.day) {
      // A charge already refunded can only be disputed for what is left: a fully refunded one is not disputed at all
      // (the cardholder has their money back), and taking the full amount again would double-charge the merchant.
      const dch = findById(st.charges, d.chargeId);
      const left = dch ? round2(dch.amount - (dch.amountRefunded ?? 0)) : d.amount;
      if (!(left > 0)) { d.status = 'withdrawn'; continue; } // dropped below: it never opened, so nothing books it
      if (left < d.amount) d.amount = left;
      d.status = 'needs_response';
      d.dueDay = state.day + 7;
      st.available = round2(st.available - d.amount - PAYMENTS.disputeFee);
      flow(st, 'disputes', d.amount + PAYMENTS.disputeFee);
      const ch = findById(st.charges, d.chargeId);
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
      if (d.status === 'won') { st.available = round2(st.available + d.amount + PAYMENTS.disputeContestFee); flow(st, 'disputeReversals', d.amount + PAYMENTS.disputeContestFee); }
      notify(state, `Dispute ${d.status}: ${d.amount.toFixed(2)}.`, { type: d.status === 'won' ? 'good' : 'bad', app: 'stripe' });
    }
  }

  if (st.disputes.some((d) => d.status === 'withdrawn')) st.disputes = st.disputes.filter((d) => d.status !== 'withdrawn');

  riskDay(state); // dispute-ratio monitoring: warning, reserve, payout delay, network fees, termination, MATCH

  // Pending funds become available, then pay out to the bank on business days.
  const ready = st.pending.filter((p) => p.availableDay <= state.day);
  if (ready.length) {
    st.available = round2(st.available + sum(ready.map((p) => p.amount)));
    st.pending = st.pending.filter((p) => p.availableDay > state.day);
  }
  if (st.available > 1 && !(st.risk?.payoutHoldUntil > state.day) && payoutToday(state)) {
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
      flow(st, 'payouts', p.amount);
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
  st.invoices = st.invoices.filter((i) => i.day >= cutoff || i.status === 'open' || (i.status === 'uncollectible' && state.day - (i.writtenOffDay ?? i.day) < 180));
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
  flow(st, 'withheld', took);
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
  if (st.settings.merchantOfRecord && (MOR_PROVIDERS[st.settings.morProvider ?? 'paddle'] ?? MOR_PROVIDERS.paddle).payouts === 'mor') return scheduled((st.settings.morPayoutSchedule ?? 'semimonthly') === 'monthly' ? [1] : [1, 15]);
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
  flow(st, 'payouts', amount);
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

// ---- Processor risk: the dispute ratio as a process, not a warning ----
// Research: docs/research/verification/money-deals.md §6 and market-people.md §2.8. Stripe flags accounts above ~0.75%;
// Visa VAMP's merchant "excessive" ratio is 1.5% from 1 April 2026 in US/Canada/EU/APAC (2.2% before; vendor sources,
// verify against Visa); Mastercard ECM 1.5%. Sequence [design, anchored on §6]: first breach -> warning and a 30-90
// day remediation plan; repeated breach -> rolling reserve 10-25% held 90 days and slower payouts; above the network
// threshold -> ~$8 per dispute program fee passed through; persistent breach (3-6 months) -> account terminated,
// funds held ~120 days, MATCH list for 5 years, and only high-risk processors (higher fees, a standing reserve) after
// a 2-6 week migration. Clean months step it back down. VAMP's volume floor (reported as 1,500 events; sources
// conflict) is not modelled: the processor's own risk team acts on small accounts at the same ratios [design].
export const RISK = {
  windowDays: 30, reviewEveryDays: 30, minDisputes: 3,
  stripeThreshold: PAYMENTS.excessiveDisputeRate,
  vamp: { before: 0.022, from: 0.015, fromDate: '2026-04-01' },
  reservePct: { ok: 0, warning: 0, review: 0.1, excessive: 0.25 },
  payoutDelay: { ok: 0, warning: 0, review: 5, excessive: 10 }, // extra business days before funds become available
  programFee: 8, // per dispute while above the network threshold (~$8/event, vendor sources)
  terminateAfter: { excessive: 3, any: 5 }, // consecutive monthly breaches
  recoverAfter: 2, // consecutive clean months to step down one level
  reserveHoldDays: 90, frozenDays: 120, matchYears: 5,
  highRiskFeePct: 0.015, highRiskReserve: 0.1, migrationHours: 30, migrationDays: 28,
};
const LEVELS = ['ok', 'warning', 'review', 'excessive'];
export const vampThreshold = (state) => (dateOf(state).toISOString().slice(0, 10) >= RISK.vamp.fromDate ? RISK.vamp.from : RISK.vamp.before);

export function ensureRisk(state) {
  const st = S(state);
  st.risk ??= { level: 'ok', breaches: 0, vampBreaches: 0, clean: 0, lastReviewDay: state.day, history: [], reservePct: 0, payoutDelay: 0, highRisk: false, match: null, terminatedDay: null, falseEvidence: 0 };
  return st.risk;
}

/** Card disputes opened and card charges settled in the last 30 days. */
export function disputeWindow(state, days = RISK.windowDays) {
  const st = S(state);
  const charges = st.charges.filter((c) => c.day > state.day - days && c.status !== 'failed' && c.method !== 'ach_invoice' && !c.store).length;
  const disputes = st.disputes.filter((d) => d.status !== 'scheduled' && d.day > state.day - days && !d.handledBy).length;
  return { charges, disputes, ratio: charges ? disputes / charges : 0 };
}

function setLevel(state, R, level) {
  R.level = level;
  R.reservePct = R.highRisk ? Math.max(RISK.highRiskReserve, RISK.reservePct[level] ?? 0) : RISK.reservePct[level] ?? 0;
  R.payoutDelay = RISK.payoutDelay[level] ?? 0;
}

export function riskDay(state) {
  const st = S(state);
  const R = ensureRisk(state);
  if (R.terminatedDay != null && state.day >= R.terminatedDay + RISK.migrationDays && !R.highRisk) {
    R.highRisk = true; setLevel(state, R, 'ok');
    notify(state, 'You are processing again through a high-risk payment processor: +1.5% per charge and a standing 10% rolling reserve while you are on the MATCH list.', { type: 'warn', app: 'stripe' });
  }
  if (state.day - R.lastReviewDay < RISK.reviewEveryDays) return;
  R.lastReviewDay = state.day;
  if (R.terminatedDay != null && !R.highRisk) return;
  const w = disputeWindow(state);
  const vamp = vampThreshold(state);
  const breach = w.disputes >= RISK.minDisputes && w.ratio >= RISK.stripeThreshold;
  const overVamp = breach && w.ratio >= vamp;
  R.history.push({ day: state.day, ...w, ratio: round2(w.ratio * 10000) / 10000, level: R.level });
  if (R.history.length > 36) R.history.shift();
  if (!breach) {
    R.breaches = 0; R.vampBreaches = 0; R.clean++;
    if (R.clean >= RISK.recoverAfter && R.level !== 'ok') {
      R.clean = 0;
      setLevel(state, R, LEVELS[Math.max(0, LEVELS.indexOf(R.level) - 1)]);
      notify(state, `Payments risk review: dispute rate back under control. Account status is now "${R.level}"${R.reservePct ? ` (reserve ${Math.round(R.reservePct * 100)}%)` : ''}; held reserves release on schedule.`, { type: 'good', app: 'stripe' });
    }
    return;
  }
  R.clean = 0; R.breaches++; if (overVamp) R.vampBreaches++; else R.vampBreaches = 0;
  const pct2 = `${(w.ratio * 100).toFixed(2)}%`;
  // False dispute evidence on file makes the risk team less patient [design].
  const lie = R.falseEvidence > 0 ? 1 : 0;
  if (R.vampBreaches >= RISK.terminateAfter.excessive - lie || R.breaches >= RISK.terminateAfter.any - lie) return terminate(state, R, w);
  const next = overVamp ? (R.breaches >= 2 || R.level === 'review' || R.level === 'excessive' ? 'excessive' : 'review') : R.breaches >= 2 || R.level === 'review' ? 'review' : 'warning';
  const level = LEVELS[Math.max(LEVELS.indexOf(next), LEVELS.indexOf(R.level))];
  const was = R.level;
  setLevel(state, R, level);
  if (overVamp) {
    const fee = RISK.programFee * w.disputes;
    post(state, { amount: -fee, counterparty: 'Stripe', description: `Card network excessive-dispute program fees (${w.disputes} disputes)`, category: 'payment_fees', method: 'ach' });
  }
  const say = level === 'warning' ? 'warning: send a remediation plan (descriptor, cancel flow, refunds on request, fraud rules) within 30 days'
    : level === 'review' ? `account under review: ${Math.round(R.reservePct * 100)}% rolling reserve held 90 days, payouts slowed by ${R.payoutDelay} business days`
      : `above the card networks' ${(vamp * 100).toFixed(1)}% threshold: ${Math.round(R.reservePct * 100)}% reserve, payouts slowed ${R.payoutDelay} business days, $${RISK.programFee} per dispute in program fees`;
  notify(state, `Payments risk review: dispute rate ${pct2} over 30 days (${w.disputes} of ${w.charges} card charges). ${say}. Persistent breaches end in termination and a 5-year MATCH listing.`, { type: level === 'warning' ? 'warn' : 'bad', app: 'stripe' });
  if (level !== was) logMistake(state, { functionId: 'payments_dunning', id: `dispute_${level}`, label: level === 'warning' ? 'Dispute rate breached the processor threshold' : level === 'review' ? 'Rolling reserve after repeated dispute breaches' : 'Above the card-network dispute threshold', app: 'stripe', delayed: true, cost: { usd: overVamp ? RISK.programFee * w.disputes : 0, hours: level === 'warning' ? 2 : 4 }, detail: `${pct2} of card charges disputed in 30 days (Stripe flags ~0.75%; Visa VAMP excessive ${(vamp * 100).toFixed(1)}%). Stellar operators keep it under 0.3%: a recognizable descriptor, trial and renewal reminders, a one-click cancel, refunds on request, 3DS and fraud rules, and pre-dispute alerts.` });
}

function terminate(state, R, w) {
  const st = S(state);
  R.level = 'terminated'; R.terminatedDay = state.day; R.reservePct = 0; R.payoutDelay = 0;
  R.match = { day: state.day, untilDay: state.day + RISK.matchYears * 365, reason: 'Excessive chargebacks' };
  // Funds on hand are frozen ~120 days (they cover disputes still to come), then released.
  const release = state.day + RISK.frozenDays;
  if (st.available > 0) { st.pending.push({ amount: round2(st.available), availableDay: release, chargeId: null, reserve: true, frozen: true }); st.available = 0; }
  for (const p of st.pending) p.availableDay = Math.max(p.availableDay, release);
  R.payoutHoldUntil = release;
  notify(state, `Stripe closed your account for excessive disputes (${(w.ratio * 100).toFixed(2)}% over 30 days). Your balance is held for ${RISK.frozenDays} days and the account is on Mastercard's MATCH list for ${RISK.matchYears} years. Expect ${RISK.migrationDays / 7} weeks to move to a high-risk processor.`, { type: 'bad', app: 'stripe' });
  logMistake(state, { functionId: 'payments_dunning', id: 'processor_terminated', label: 'Payment processor terminated the account (MATCH list)', app: 'stripe', delayed: true, charge: true, circles: true, cost: { hours: RISK.migrationHours, days: RISK.migrationDays, reputation: 2 }, detail: `Months of dispute rates above the thresholds ended in termination: funds frozen ${RISK.frozenDays} days, MATCH-listed for ${RISK.matchYears} years (blocks a normal merchant account), and a high-risk processor at +${RISK.highRiskFeePct * 100}% per charge with a standing ${RISK.highRiskReserve * 100}% reserve. Keep a clear descriptor, reminders, easy cancel and refunds on request.` });
}
