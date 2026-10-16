// Real consequences of negotiated enterprise terms. Imports only core modules (no app model files) so sales/model.js
// can call it from closeWon without an import cycle.
//
//  - applyNegotiatedSub: the agreed terms land on the Stripe subscription (net terms on the first invoice, uplift cap, term,
//    MFN, liability cap, termination right) and the CRM company (case-study rights).
//  - repriceMfn: a later, deeper discount forces repricing of every customer with an MFN clause (mistake mfn_triggered_repricing).
//  - negotiatedDay: delayed consequences (liability incidents capped or uncapped, termination for convenience churn).
//  - cappedUplift: the renewal uplift cap limits what Success may propose.
// Every number marked [design] is an assumption, not a statistic. Randomness is a hash-seeded stream per (day, sub), never the
// main rng(state).

import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { changePrice, cancel } from '../../core/stripe.js';
import { clamp, rng, hash, money, round2 } from '../../core/util.js';

export const UPLIFT_CAP = { none: null, cap7: 0.07, cap5: 0.05, cap3: 0.03, lock: 0 };
export const TERMS_DAYS = { upfront: 7, net30: 30, net60: 60, net90: 90 };
export const START_DAYS = { now: 5, d30: 30, d60: 60, d90: 90 };
export const LIABILITY_MULT = { cap1x: 1, super3x: 3, cap2x: 5, uncapped: Infinity }; // payout ceiling in multiples of annual fees
const TFC_MONTHLY = { any: 0.012, y2: 0.006, none: 0 }; // monthly chance an anytime / post-year-1 termination right is used [design]
const INCIDENT_MONTHLY = 0.006; // monthly chance of a data/service incident that triggers a claim [design]
const FN = 'negotiation';

const stream = (state, salt) => ({ seed: (parseInt(hash(`${state.seed}|${salt}`), 36) | 0) || 1 });
export const annualFee = (sub) => round2((sub.price ?? 0) * (sub.quantity ?? 1) * (1 - (sub.discountPct ?? 0)) * (sub.interval === 'year' ? 1 : 12));

/** Put the negotiated terms on the new subscription. Called by closeWon when the deal carries a negotiation. */
export function applyNegotiatedSub(state, deal, sub, company = null) {
  const n = deal?.negotiated;
  if (!n?.terms || !sub) return;
  const t = n.terms;
  sub.negotiated = { negId: n.negId, terms: t, day: state.day, listAcv: n.listAcv };
  sub.termYears = Number(t.term) || 1;
  sub.upliftCap = UPLIFT_CAP[t.uplift] ?? null;
  sub.mfn = t.mfn === 'none' ? null : t.mfn;
  sub.liability = t.liability;
  sub.tfc = t.tfc;
  sub.sla = t.sla;
  if (t.logo !== 'no' && company) { company.referenceable = t.logo; }
  if (sub.invoiceManually) {
    const days = TERMS_DAYS[t.payment] ?? 30;
    sub.paymentTermsDays = days;
    // closeWon already issued the first invoice at the default net-30; move it to the negotiated terms (net-90 delays the cash).
    const inv = (state.stripe?.invoices ?? []).filter((i) => i.subId === sub.id).at(-1);
    if (inv) {
      const delta = days - (inv.dueDay - inv.issuedDay);
      inv.dueDay += delta;
      if (inv.payDay != null) inv.payDay = Math.max(state.day + 1, inv.payDay + delta);
    }
  }
}

/** A new price was just agreed with `newSub`. Every active MFN customer with a better-than-new discount is repriced down to it. */
export function repriceMfn(state, newSub) {
  const d2 = newSub?.discountPct ?? 0;
  if (!(d2 > 0)) return [];
  const out = [];
  for (const sub of state.stripe?.subscriptions ?? []) {
    if (sub === newSub || !sub.mfn || !['active', 'past_due', 'trialing'].includes(sub.status)) continue;
    const d1 = sub.discountPct ?? 0;
    if (d2 <= d1 + 1e-9) continue;
    if (sub.mfn === 'similar') {
      const a = annualFee(sub), b = annualFee(newSub) / Math.max(0.01, 1 - d2);
      if (b < a * 0.5 || b > a * 2) continue; // not a similar customer
    }
    const before = annualFee(sub);
    const newPrice = round2(sub.price * (1 - d2) / Math.max(0.01, 1 - d1));
    changePrice(state, sub.id, { price: newPrice });
    sub.mfnRepriced = (sub.mfnRepriced ?? 0) + 1;
    const loss = Math.round(before - annualFee(sub));
    const co = state.apps?.crm?.companies?.find((c) => c.id === (state.stripe?.customers?.find((x) => x.id === sub.customerId)?.crmCompanyId));
    logMistake(state, { functionId: FN, id: 'mfn_triggered_repricing', label: 'MFN clause forced a repricing', app: 'crm', delayed: true, key: `mfn:${sub.id}:${newSub.id}`,
      cost: { usd: loss }, detail: `You gave a new customer ${Math.round(d2 * 100)}% off. ${co?.name ?? 'A customer'} has an MFN clause and is now repriced from ${Math.round(d1 * 100)}% to ${Math.round(d2 * 100)}% off: ${money(loss)} a year gone, and the lower price is now the anchor for their renewal.` });
    notify(state, `${co?.name ?? 'A customer'}'s MFN clause was triggered by a deeper discount to another account: repriced, ${money(loss)}/yr lost.`, { type: 'bad', app: 'crm' });
    out.push({ subId: sub.id, loss });
  }
  return out;
}

/** The renewal uplift Success may propose can't exceed the cap the customer negotiated. */
export function cappedUplift(sub, upliftPct) {
  const cap = sub?.upliftCap;
  if (cap == null || !(upliftPct > cap)) return { upliftPct, capped: false, cap };
  return { upliftPct: cap, capped: true, cap };
}

const companyOfSub = (state, sub) => state.apps?.crm?.companies?.find((c) => c.id === (state.stripe?.customers?.find((x) => x.id === sub.customerId)?.crmCompanyId));

/** A customer claim after an incident: the liability clause the founder agreed to decides what is paid. Returns { payout, capped }. */
export function settleClaim(state, sub, loss) {
  const name = companyOfSub(state, sub)?.name ?? 'A customer';
  const fee = annualFee(sub);
  const mult = LIABILITY_MULT[sub.liability] ?? 1;
  const payout = Math.round(Math.min(loss, mult === Infinity ? loss : mult * fee));
  const capped = Math.round(Math.min(loss, fee));
  post(state, { amount: -payout, counterparty: `${name} (claim)`, description: 'Customer claim after a service incident', category: 'legal', method: 'ach' });
  if (payout > capped + 1) {
    logMistake(state, { functionId: FN, id: 'uncapped_liability_signed', label: 'Signed uncapped liability', app: 'legal', delayed: true, key: `liab:${sub.id}:${state.day}`, cost: { usd: payout - capped }, detail: `An incident at ${name} produced a ${money(Math.round(loss))} claim. Your ${sub.liability === 'uncapped' ? 'uncapped liability' : 'enlarged cap'} paid ${money(payout)}; a standard 1x cap would have paid ${money(capped)}.` });
    notify(state, `${name} made a ${money(Math.round(loss))} claim after an incident. Your liability clause paid ${money(payout)} (standard cap: ${money(capped)}).`, { type: 'bad', app: 'legal' });
  } else notify(state, `${name} made a claim after an incident; your liability cap limited it to ${money(payout)}.`, { type: 'warn', app: 'legal' });
  return { payout, capped };
}

/** The customer uses the termination-for-convenience right they negotiated. */
export function useTfc(state, sub) {
  const name = companyOfSub(state, sub)?.name ?? 'A customer';
  cancel(state, sub.id, { atPeriodEnd: true, reason: 'termination_for_convenience' });
  logMistake(state, { functionId: FN, id: 'tfc_used', label: 'Customer used the termination-for-convenience right', app: 'crm', delayed: true, key: `tfc:${sub.id}`, cost: { customers: 1, usd: Math.round(annualFee(sub)) }, detail: `${name} cancelled with ${sub.tfc === 'any' ? '30 days notice' : '90 days notice after year 1'} under the termination-for-convenience clause you agreed to. A committed ${sub.termYears}-year term was never really committed.` });
}

/** Delayed consequences of negotiated terms; once per sub per ~30 days. Deterministic from a hash-seeded stream. */
export function negotiatedDay(state) {
  if (state.day % 30 !== 0) return;
  for (const sub of state.stripe?.subscriptions ?? []) {
    if (!sub.negotiated || !['active', 'past_due'].includes(sub.status)) continue;
    const age = state.day - (sub.negotiated.day ?? sub.startDay);
    const pT = TFC_MONTHLY[sub.tfc] ?? 0;
    if (pT > 0 && (sub.tfc === 'any' || age >= 365) && rng(stream(state, `tfc|${sub.id}|${state.day}`)) < pT) { useTfc(state, sub); continue; }
    if (rng(stream(state, `inc|${sub.id}|${state.day}`)) < INCIDENT_MONTHLY) {
      const fee = annualFee(sub);
      settleClaim(state, sub, fee * (1 + 10 * rng(stream(state, `incl|${sub.id}|${state.day}`)) ** 2));
    }
  }
}

/** Fraction by which a signed liability option raises Legal's exposure score. */
export const LIABILITY_EXPOSURE = { cap1x: 0, super3x: 0.5, cap2x: 1, uncapped: 2.5 };
export const clampPct = (v) => clamp(v, 0, 1);
