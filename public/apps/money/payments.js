// Stripe actions core/stripe.js doesn't have yet: partial refunds, proration invoices on mid-period upgrades,
// and coupons. They mirror core semantics exactly (fees via core feeFor, T+2 business-day settlement, the new-
// account payout hold, MRR movements via core changePrice) so the Books ledger and payout reconciliation keep
// tying. Requested as core functions in the report: refund(state, id, { amount }) and chargeOneOff(...).

import { ensureStripe, feeFor, changePrice, monthlyAmount } from '../../core/stripe.js';
import { PAYMENTS } from '../../core/params.js';
import { uid, round2, isWeekend } from '../../core/util.js';

const isLive = (s) => s.status === 'active' || s.status === 'past_due';

function businessDays(state, n) {
  let d = 0, added = 0;
  while (added < n) { d++; if (!isWeekend(state, state.day + d)) added++; }
  return d;
}

// Refund part (or the rest) of a charge. Stripe keeps its fee; the charge stays "succeeded" until fully refunded.
export function partialRefund(state, chargeId, amount, { reason = 'requested_by_customer' } = {}) {
  const st = ensureStripe(state);
  const ch = st.charges.find((c) => c.id === chargeId);
  if (!ch || ch.status !== 'succeeded') throw new Error('Only succeeded payments can be refunded.');
  const left = round2(ch.amount - (ch.amountRefunded ?? 0));
  const amt = round2(amount);
  if (!(amt > 0) || amt > left + 0.001) throw new Error(`You can refund up to ${left.toFixed(2)}.`);
  ch.amountRefunded = round2((ch.amountRefunded ?? 0) + amt);
  const final = ch.amountRefunded >= ch.amount - 0.001;
  if (final) ch.status = 'refunded';
  st.available = round2(st.available - amt);
  const r = { id: uid('re'), chargeId, day: state.day, amount: amt, reason, partial: !final || amt < ch.amount, final, refundableBefore: left };
  st.refunds.push(r);
  return r;
}

// Proration for a mid-period change (Stripe's "always invoice" behavior): charge the difference for the unused
// part of the current period now. Returns the prorated amount (0 for downgrades: credited at renewal, not modeled).
export function prorationAmount(state, sub, { price = sub.price, quantity = sub.quantity ?? 1 }) {
  if (!isLive(sub) || sub.currentPeriodEnd == null) return 0;
  const len = sub.currentPeriodEnd - sub.currentPeriodStart;
  const left = Math.max(0, sub.currentPeriodEnd - state.day);
  const perPeriod = (p, q) => p * q * (1 - (sub.discountPct ?? 0));
  const diff = perPeriod(price, quantity) - perPeriod(sub.price, sub.quantity ?? 1);
  return diff > 0 && len > 0 ? round2((diff * left) / len) : 0;
}

export function chargeProration(state, sub, amount, description = 'Proration for subscription update') {
  if (!(amount > 0.5)) return null; // Stripe minimum charge is $0.50
  const st = ensureStripe(state);
  const c = st.customers.find((x) => x.id === sub.customerId);
  const inv = { id: uid('in'), subId: sub.id, customerId: sub.customerId, day: state.day, amount, status: 'paid', attempts: 1, description };
  st.invoices.push(inv);
  const fee = feeFor(state, amount, c);
  const charge = { id: uid('ch'), invoiceId: inv.id, customerId: sub.customerId, subId: sub.id, day: state.day, amount, fee, status: 'succeeded', failureCode: null, method: sub.invoiceManually ? 'ach_invoice' : 'card', serviceDays: Math.max(1, sub.currentPeriodEnd - state.day), description };
  st.charges.push(charge);
  st.firstChargeDay ??= state.day;
  const since = state.day - st.firstChargeDay;
  const delay = since < PAYMENTS.firstPayoutHoldDays ? PAYMENTS.firstPayoutHoldDays - since + PAYMENTS.payoutDelayDays : PAYMENTS.payoutDelayDays;
  st.pending.push({ amount: round2(amount - fee), availableDay: state.day + businessDays(state, delay), chargeId: charge.id });
  return charge;
}

// ---- Coupons (applied by the founder, e.g. as a retention offer). Recorded as contraction MRR while active and
// expansion when they expire, like ChartMogul treats discounts. duration: 'once' | 'repeating' | 'forever'.

export function createCoupon(app, { code, pctOff, duration = 'repeating', months = 3 }) {
  const c = String(code ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!c) throw new Error('Enter a code.');
  if (!(pctOff > 0 && pctOff <= 100)) throw new Error('Percent off must be 1–100.');
  if ((app.coupons ?? []).some((x) => x.code === c)) throw new Error('That code exists.');
  const coupon = { id: uid('co'), code: c, pctOff, duration, months: duration === 'once' ? 1 : duration === 'forever' ? null : Math.max(1, Math.round(months)), redemptions: 0 };
  (app.coupons ??= []).push(coupon);
  return coupon;
}

export function applyCoupon(state, app, sub, couponId) {
  const co = app.coupons.find((x) => x.id === couponId);
  if (!co) throw new Error('Coupon not found.');
  if (sub.coupon) throw new Error('This subscription already has a coupon.');
  const original = sub.price;
  changePrice(state, sub.id, { price: round2(original * (1 - co.pctOff / 100)) });
  const period = sub.interval === 'year' ? 365 : 30;
  sub.coupon = { id: co.id, code: co.code, pctOff: co.pctOff, originalPrice: original, endDay: co.months == null ? null : state.day + co.months * period };
  co.redemptions++;
  return sub.coupon;
}

// Daily: restore prices when repeating/once coupons run out.
export function expireCoupons(state) {
  for (const sub of ensureStripe(state).subscriptions) {
    if (!sub.coupon || sub.coupon.endDay == null || state.day < sub.coupon.endDay) continue;
    if (sub.status !== 'canceled') changePrice(state, sub.id, { price: sub.coupon.originalPrice });
    sub.coupon = null;
  }
}

export { monthlyAmount };
