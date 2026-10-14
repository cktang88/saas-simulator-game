// Selling the company on an acquisition marketplace (Acquire.com-style). Pure.
// Sources (docs/research/fundraising.md §4, §8): sub-$1M ARR 2.5–4x revenue or 4–6x SDE if owner-dependent;
// $1–5M ARR 4–6x; $5–20M ARR 5–8x; quality moves price up to 2x within a band; asking > closing;
// MicroConf 2024: 60% of indie exits at 1–3x ARR. Arrival rates, fees and diligence odds are [D].

import { clamp, lerp } from '../../core/util.js';

export const EXIT_FEES = 0.06; // [D] marketplace success fee + legal/escrow, as a share of price
export const MIN_MRR_TO_LIST = 500; // [D]

export function revenueBand(arr) {
  if (arr < 1e6) return { label: '<$1M ARR', low: 2.5, high: 4, sde: [4, 6] };
  if (arr < 5e6) return { label: '$1–5M ARR', low: 4, high: 6, sde: [5, 7] };
  return { label: '$5–20M ARR', low: 5, high: 8, sde: [6, 9] };
}

// Quality 0..1 from what buyers pay up for: growth >25% YoY, GRR >90%, gross margin 70–85%, profit, history,
// low owner dependence.
export function exitQuality(m, { monthsHistory = 0, ownerDependent = true } = {}) {
  let q = 0.5;
  const yoy = m.yoyGrowth ?? 0;
  q += yoy > 0.25 ? 0.15 : yoy < 0 ? -0.15 : 0;
  const ch = m.revenueChurn; // monthly
  if (ch != null) q += ch < 0.009 ? 0.15 : ch > 0.04 ? -0.15 : 0; // ~GRR >90% / <60% annualized
  const gm = m.grossMargin;
  if (gm != null) q += gm >= 0.7 ? 0.1 : gm < 0.5 ? -0.1 : 0;
  q += (m.burn ?? 0) <= 0 ? 0.1 : -0.1;
  q += monthsHistory >= 24 ? 0.05 : monthsHistory < 12 ? -0.1 : 0;
  q += ownerDependent ? -0.05 : 0.05;
  return clamp(q, 0, 1);
}

/** Fair value estimate. sde = annual seller's discretionary earnings (profit + owner pay add-back). */
export function exitValuation(m, { sde = 0, monthsHistory = 0, ownerDependent = true } = {}) {
  const arr = m.arr ?? 0;
  const band = revenueBand(arr);
  const q = exitQuality(m, { monthsHistory, ownerDependent });
  const revMultiple = lerp(band.low * 0.5, band.high, q); // poor quality → half the band floor
  const revValue = arr * revMultiple;
  const sdeMultiple = lerp(band.sde[0], band.sde[1], q);
  const sdeValue = Math.max(0, sde) * sdeMultiple;
  let value = revValue, basis = `${revMultiple.toFixed(1)}x ARR`;
  if (ownerDependent && arr < 1e6) {
    if (sdeValue > 0) { value = (revValue + sdeValue) / 2; basis = `blend of ${revMultiple.toFixed(1)}x ARR and ${sdeMultiple.toFixed(1)}x SDE (owner-dependent)`; }
    else { value = revValue * 0.7; basis = `${(revMultiple * 0.7).toFixed(1)}x ARR (owner-dependent, unprofitable)`; }
  }
  return { value: Math.round(value), revMultiple, sdeMultiple, revValue, sdeValue, quality: q, band, basis, effectiveMultiple: arr ? value / arr : 0 };
}

// Weekly expected number of serious offers. [D] More ARR and quality → more buyers; overpricing kills interest.
export function offerRate(fair, ask, arr, quality) {
  const size = clamp(0.15 + arr / 1.5e6, 0.15, 1.2);
  const pricing = clamp(Math.pow(fair / Math.max(1, ask), 3), 0.05, 1.5);
  return size * (0.5 + quality) * pricing;
}

// One offer (LOI). rand: () => [0,1). Closing prices sit below asking.
export function makeOffer({ fair, ask, rand }) {
  const r = rand();
  const strategic = r < 0.04; // rare, priced on strategic value
  const type = strategic ? 'Strategic acquirer' : r < 0.35 ? 'Holding company / roll-up' : r < 0.7 ? 'Operator (first-time buyer)' : 'Search fund / PE-backed buyer';
  let price = fair * (0.72 + 0.3 * rand()) * (strategic ? 1.3 + 0.7 * rand() : 1);
  if (!strategic) price = Math.min(price, ask);
  price = Math.round(price / 1000) * 1000;
  const cashPct = type.startsWith('Operator') ? 0.7 + 0.2 * rand() : 0.85 + 0.15 * rand();
  // Review F11: P(LOI never closes) by buyer: operator/SBA-financed 0.35, holdco/PE/search fund 0.2, strategic 0.15
  // (Axial 2025 dead-deal report; eightx). Exit fees/other numbers [D].
  const failP = strategic ? 0.15 : type.startsWith('Operator') ? 0.35 : 0.2;
  const cashAtClose = Math.round(price * cashPct);
  return { type, price, cashAtClose, earnout: price - cashAtClose, earnoutMonths: 12, diligenceDays: Math.round(30 + 30 * rand()), failP };
}
