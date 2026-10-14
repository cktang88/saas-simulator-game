// Founder-initiated Stripe actions: partial refunds, proration invoices on mid-period upgrades, and coupons.
// Money movements go through core/stripe.js refund() and charge(), which keep the balance-flow counters, so
// stripeReconciliation(state) stays exact (fees, T+2 business-day settlement, payout hold, Stripe Capital
// withholding all come from core). MRR movements go through core changePrice().

import { ensureStripe, changePrice, monthlyAmount, refund, charge } from '../../core/stripe.js';
import { round2 } from '../../core/util.js';

const isLive = (s) => s.status === 'active' || s.status === 'past_due';

// Refund part (or the rest) of a charge. Stripe keeps its fee; the charge stays "succeeded" until fully refunded.
export function partialRefund(state, chargeId, amount, { reason = 'requested_by_customer' } = {}) {
  return refund(state, chargeId, { amount: round2(amount), reason });
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

// Charge the proration now as a one-off invoice (recognized over the rest of the current period).
export function chargeProration(state, sub, amount, description = 'Proration for subscription update') {
  ensureStripe(state);
  return charge(state, sub.customerId, { amount, description, subId: sub.id, serviceDays: Math.max(1, (sub.currentPeriodEnd ?? state.day + 1) - state.day), source: 'proration' });
}

// A one-off charge (setup fee, onboarding, overage) on a customer's card. Recognized on the day it is charged.
export function chargeOneOff(state, customerId, amount, description = 'One-off charge') {
  ensureStripe(state);
  return charge(state, customerId, { amount, description, serviceDays: 1, source: 'one_off' });
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
