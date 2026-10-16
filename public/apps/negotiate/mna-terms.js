// Acquisition LOI terms beyond price (pure; exit flow in fundraising/sim.js and the adapter mna.js import it).
// Norms (docs/research/negotiation/science-and-enterprise.md section 4): holdback/escrow 5-20% of price held 12-24 months;
// earnouts 20-40% of price in SaaS over ~24 months with an average payout around 21 cents on the dollar (secondary);
// exclusivity commonly 30-90 days (unverified); buyers retrade after diligence (sourced, L40). Everything else is [design].

import { clamp, hash, round2 } from '../../core/util.js';
import { MNA } from '../../data/negotiation.js';

const stream = (state, salt) => { let t = (parseInt(hash(`${state.seed}|${salt}`), 36) | 0) || 1; return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
const nearest = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

/** The standard LOI details a buyer of this type brings (deterministic from the offer; no random draws). */
export function loiExtras(o) {
  const strategic = /strategic/i.test(o.type), operator = /operator/i.test(o.type), pe = /search|pe/i.test(o.type);
  const earnoutPct = o.earnout && o.price ? clamp(Math.round((o.earnout / o.price) / 0.05) * 0.05, 0, 0.45) : 0;
  return {
    earnoutPct,
    earnoutMonths: nearest(o.earnoutMonths ?? 12, [12, 18, 24]),
    holdbackPct: strategic ? 0.05 : operator ? 0.1 : pe ? 0.15 : 0.1,
    holdbackMonths: pe ? 18 : 12,
    stockPct: strategic ? 0.1 : 0,
    exclusivityDays: nearest(o.diligenceDays ?? 45, [30, 45, 60, 90]),
    retentionMonths: operator ? 12 : strategic ? 6 : 6,
  };
}
export const mnaPackage = (o) => {
  const x = { ...loiExtras(o) };
  for (const k of ['earnoutPct', 'earnoutMonths', 'holdbackPct', 'holdbackMonths', 'stockPct', 'exclusivityDays', 'retentionMonths']) if (o[k] != null) x[k] = o[k];
  return { price: o.price, earnout: x.earnoutPct, earnoutMonths: String(x.earnoutMonths), holdback: x.holdbackPct, holdbackMonths: String(x.holdbackMonths), stock: x.stockPct, exclusivity: String(x.exclusivityDays), retention: String(x.retentionMonths === 24 ? 24 : x.retentionMonths === 12 ? 12 : x.retentionMonths === 0 ? 0 : 6) };
};

/** Write an agreed package back onto an offer (the object the player signs as an LOI). */
export function applyMnaTerms(o, pkg) {
  const price = Math.round(Number(pkg.price) / 1000) * 1000;
  const earnoutPct = Number(pkg.earnout), holdbackPct = Number(pkg.holdback), stockPct = Number(pkg.stock);
  o.price = price;
  o.earnoutPct = earnoutPct; o.earnoutMonths = Number(pkg.earnoutMonths);
  o.holdbackPct = holdbackPct; o.holdbackMonths = Number(pkg.holdbackMonths);
  o.stockPct = stockPct; o.exclusivityDays = Number(pkg.exclusivity); o.retentionMonths = Number(pkg.retention);
  o.earnout = Math.round(price * earnoutPct);
  o.cashAtClose = Math.round(price - o.earnout - price * holdbackPct - price * stockPct);
  o.diligenceDays = o.exclusivityDays;
  o.negotiated = true;
  return o;
}

/** Probability the buyer reprices during diligence; rises with the exclusivity window you gave them (no other bidder to fear). */
export function retradeP(loi) {
  const days = loi.exclusivityDays ?? loi.diligenceDays ?? 45;
  return clamp(MNA.retradeBase * (0.6 + days / 60) * (loi.prepared ? 0.6 : 1), 0, 0.6);
}
export function retrade(state, loi, price) {
  const rnd = stream(state, `retrade|${loi.id}|${loi.signedDay}`);
  if (rnd() >= retradeP(loi)) return null;
  const cut = MNA.retradeCut[0] + (MNA.retradeCut[1] - MNA.retradeCut[0]) * rnd();
  return { price: Math.round(price * (1 - cut) / 1000) * 1000, cut: round2(cut), exclusivityDays: loi.exclusivityDays ?? loi.diligenceDays };
}

/**
 * What the founder is actually paid on a closed LOI: cash at close, buyer stock at a haircut, the holdback net of an indemnity
 * claim, and the earnout from the MRR trajectory (projectEarnout is passed in to avoid an import cycle).
 */
export function settleLoi(state, loi, price, { projectEarnout, mrr, mrrAtLoi, monthlyGrowth }) {
  const scale = price / (loi.price || price);
  const earnout = Math.round((loi.earnoutPct != null ? price * loi.earnoutPct : (loi.earnout ?? 0) * scale));
  const holdback = Math.round(price * (loi.holdbackPct ?? 0));
  const stock = Math.round(price * (loi.stockPct ?? 0));
  const cash = price - earnout - holdback - stock;
  const rnd = stream(state, `holdback|${loi.id}|${loi.signedDay}`);
  const claimed = rnd() < MNA.holdbackClaimP;
  const holdbackPaid = claimed ? Math.round(holdback * (1 - MNA.holdbackClaimShare)) : holdback;
  const stockValue = Math.round(stock * (1 - MNA.stockHaircut));
  const earnoutPaid = projectEarnout({ earnout, months: loi.earnoutMonths ?? 12, mrr, mrrAtLoi, monthlyGrowth });
  return { price, cash, earnout, earnoutPaid, holdback, holdbackPaid, holdbackClaimed: claimed, stock, stockValue, total: cash + stockValue + holdbackPaid + earnoutPaid };
}
