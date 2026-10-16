// Land and expand: pure rules (no state, no imports of apps). Strategy parameters and bands live in
// public/data/gtm-comp.js; research in docs/research/gtm-comp/land-and-expand.md. All shapes here are [design].

import { LAND_STRATEGIES, LAND_FIT, EXPAND, NRR_BANDS, bandOfAcv } from '../../data/gtm-comp.js';
import { clamp, round2 } from '../../core/util.js';

export const landOf = (id) => LAND_STRATEGIES[id] ?? null;

/** Seats a land strategy seats at signing, from the company's headcount. */
export const landSeats = (strategyId, employees) => Math.max(1, Math.round(employees * (LAND_STRATEGIES[strategyId]?.sizeShare ?? 0.15)));

/** The account's ceiling for seat utilisation: strategy ceiling, nudged by health and by an owner's coverage. */
export const adoptionCeiling = (strategyId, health = 60, ownerEffect = 0) =>
  clamp((LAND_STRATEGIES[strategyId]?.adoptCeil ?? 0.85) * (0.8 + 0.2 * clamp(health / 80, 0.3, 1.2)) + 0.05 * ownerEffect, 0.2, 1);

/** Churn multiplier from a lost champion, softened by multi-threading, an executive sponsor and a recent QBR. */
export function championRisk(acct, day) {
  const left = acct.champion === 'left' || acct.champion === 'none';
  if (!left) return 1;
  const C = EXPAND.champion;
  const threads = Math.max(acct.map?.threads ?? 1, acct.threads ?? 1);
  let m = threads >= 2 ? C.threadedMult : C.leftMult;
  if (acct.map?.execSponsor || acct.execSponsor) m *= C.execMult;
  if (acct.lastQbrDay != null && day - acct.lastQbrDay <= EXPAND.qbrDays) m *= C.qbrMult;
  return round2(m);
}

/** Acceptance multiplier on a renewal uplift when the land was over-discounted (the price is anchored). */
export function anchorMult(landDiscount, upliftPct) {
  if (!(landDiscount > EXPAND.anchorDiscount) || !(upliftPct > 0)) return 1;
  return round2(1 - Math.min(0.55, EXPAND.anchorUpliftPenalty * (landDiscount - EXPAND.anchorDiscount) * (0.5 + upliftPct / 0.1)));
}

/** Product of the GTM churn factors stored on an account (success engine multiplies this into csChurnMult). */
export function gtmChurn(acct) {
  const g = acct?.gtm;
  if (!g) return 1;
  return clamp((g.ownerChurn ?? 1) * (g.champion ?? 1) * (g.ignored ?? 1) * (g.upsell ?? 1) * (g.landSmall ?? 1) * (g.landFit ?? 1), 0.5, 3);
}

/** How well a land choice fits the account's size band (0..1). */
export const landFit = (strategyId, acv) => LAND_FIT[bandOfAcv(acv)]?.[strategyId] ?? 0.5;

/** Net revenue retention target range for a band, for a median operator. */
export const nrrBand = (acv) => NRR_BANDS[bandOfAcv(acv)];

/**
 * Probability a whitespace pursuit lands. health 0..100; item.status 'open' (a live signal) or 'mapped' (cold pitch).
 * Selling before the account has seen value (utilisation under the floor) rarely works and costs trust.
 */
export function pursuitProbability({ health = 60, itemStatus = 'mapped', needsSponsor = false, execSponsor = false, util = 0.7, landDiscount = 0, askDiscount = null, ownerBoost = 1 }) {
  let p = 0.55 * clamp(health / 70, 0.4, 1.3) * (itemStatus === 'open' ? 1.15 : 0.6);
  if (needsSponsor && !execSponsor) p *= 0.6;
  if (util < 0.55) p *= 0.35;
  if (askDiscount != null && landDiscount > 0 && askDiscount < landDiscount) p *= clamp(1 - 1.5 * (landDiscount - askDiscount), 0.3, 1); // asking list price from an anchored account
  return clamp(p * ownerBoost, 0.03, 0.9);
}

/** Per-seat blended discount after adding `add` seats at `askDiscount` to `q0` seats at `d0`. */
export const blendedUnitPrice = (listUnit, q0, d0, add, askDiscount) => {
  const q1 = q0 + add;
  const amount = q0 * listUnit * (1 - d0) + add * listUnit * (1 - askDiscount);
  return { q1, unit: round2(amount / (q1 * (1 - d0))) }; // sub.price after the change, keeping sub.discountPct at d0
};
