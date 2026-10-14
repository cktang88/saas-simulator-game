// Pure pricing statistics: significance tests and sample sizes for price A/B tests, Van Westendorp and
// Gabor-Granger survey analysis, price-increase churn, tier choice and annual-plan share.
// Research: docs/research/channels-partnerships-pricing.md §3 (PRICING_RESEARCH in public/data/channels.js).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- Normal distribution ----

// Abramowitz–Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
export function erf(x) {
  const s = Math.sign(x), a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
export const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// Inverse normal CDF (Acklam's rational approximation).
export function normInv(p) {
  p = clamp(p, 1e-12, 1 - 1e-12);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Two-proportion z-test (pooled), two-sided. A = control, B = variant.
 * → { pA, pB, diff, lift, z, p, ci95: [lo, hi] (difference B−A, unpooled SE), significant, enough }
 * `enough` is false when any cell has < 5 successes/failures (normal approximation unreliable).
 */
export function twoProportionTest(convA, nA, convB, nB, alpha = 0.05) {
  if (!(nA > 0) || !(nB > 0)) return { pA: null, pB: null, diff: null, lift: null, z: 0, p: 1, ci95: [null, null], significant: false, enough: false };
  const pA = convA / nA, pB = convB / nB;
  const pool = (convA + convB) / (nA + nB);
  const se = Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB));
  const z = se > 0 ? (pB - pA) / se : 0;
  const p = se > 0 ? 2 * (1 - normCdf(Math.abs(z))) : 1;
  const seU = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const enough = Math.min(convA, nA - convA, convB, nB - convB) >= 5;
  return { pA, pB, diff: pB - pA, lift: pA > 0 ? pB / pA - 1 : null, z, p, ci95: [pB - pA - 1.96 * seU, pB - pA + 1.96 * seU], significant: enough && p < alpha, enough };
}

/**
 * Welch t-test on per-trial revenue (arrays of numbers, many zeros). Two-sided p via the normal approximation
 * (fine for n ≥ 30; flagged otherwise).
 */
export function welchTest(a, b) {
  const m = (x) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length);
  const v = (x, mu) => x.reduce((s, y) => s + (y - mu) ** 2, 0) / Math.max(1, x.length - 1);
  if (a.length < 2 || b.length < 2) return { meanA: m(a), meanB: m(b), t: 0, p: 1, enough: false };
  const mA = m(a), mB = m(b);
  const se = Math.sqrt(v(a, mA) / a.length + v(b, mB) / b.length);
  const t = se > 0 ? (mB - mA) / se : 0;
  return { meanA: mA, meanB: mB, t, p: se > 0 ? 2 * (1 - normCdf(Math.abs(t))) : 1, enough: a.length >= 30 && b.length >= 30 };
}

// Sample size per arm to detect a relative change `lift` in a baseline conversion p0 (two-sided α, power).
export function sampleSizePerArm(p0, lift, { alpha = 0.05, power = 0.8 } = {}) {
  const p1 = clamp(p0 * (1 + lift), 1e-6, 1 - 1e-6);
  if (!(p0 > 0) || p0 === p1) return Infinity;
  const za = normInv(1 - alpha / 2), zb = normInv(power);
  const pbar = (p0 + p1) / 2;
  const n = (za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p0 * (1 - p0) + p1 * (1 - p1))) ** 2 / (p1 - p0) ** 2;
  return Math.ceil(n);
}

// ---- Van Westendorp price sensitivity meter ----

/**
 * responses: [{ tooCheap, cheap, expensive, tooExpensive }] in $ per month.
 * Curves on a price grid: tooCheap(p) = share saying p is too cheap (descending), cheap(p) (descending),
 * expensive(p) (ascending), tooExpensive(p) (ascending). Intersections:
 *  PMC (point of marginal cheapness) = tooCheap × notCheap; OPP (optimal) = tooCheap × tooExpensive;
 *  IPP (indifference) = cheap × expensive; PME (point of marginal expensiveness) = notExpensive × tooExpensive.
 */
export function vanWestendorp(responses, { steps = 60 } = {}) {
  const rs = responses.filter((r) => [r.tooCheap, r.cheap, r.expensive, r.tooExpensive].every((x) => Number.isFinite(x) && x >= 0));
  if (rs.length < 2) return null;
  const all = rs.flatMap((r) => [r.tooCheap, r.cheap, r.expensive, r.tooExpensive]);
  const lo = Math.max(0, Math.min(...all) * 0.8), hi = Math.max(...all) * 1.1;
  const grid = Array.from({ length: steps + 1 }, (_, i) => lo + ((hi - lo) * i) / steps);
  const n = rs.length;
  const share = (fn) => grid.map((p) => rs.filter((r) => fn(r, p)).length / n);
  const tooCheap = share((r, p) => p <= r.tooCheap);
  const cheap = share((r, p) => p <= r.cheap);
  const expensive = share((r, p) => p >= r.expensive);
  const tooExpensive = share((r, p) => p >= r.tooExpensive);
  const notCheap = cheap.map((x) => 1 - x), notExpensive = expensive.map((x) => 1 - x);
  const cross = (a, b) => {
    for (let i = 1; i < grid.length; i++) {
      const d0 = a[i - 1] - b[i - 1], d1 = a[i] - b[i];
      if (d0 === 0) return grid[i - 1];
      if (Math.sign(d0) !== Math.sign(d1)) return grid[i - 1] + ((grid[i] - grid[i - 1]) * d0) / (d0 - d1 || 1);
    }
    return null;
  };
  return {
    n, grid, tooCheap, cheap, expensive, tooExpensive,
    pmc: cross(tooCheap, notCheap), opp: cross(tooCheap, tooExpensive), ipp: cross(cheap, expensive), pme: cross(notExpensive, tooExpensive),
  };
}

// ---- Gabor-Granger ----

/**
 * responses: [{ price: likelihood 0..1 }] (stated purchase likelihood at each tested price).
 * Stated intent overstates real purchase; we apply the common "top-box" style discount [design]: real ≈ 0.35×stated.
 * → { points: [{ price, demand, revenue }], best: { price, demand, revenue } }
 */
export function gaborGranger(responses, prices, { calibration = 0.35 } = {}) {
  if (!responses.length || !prices.length) return null;
  const points = prices.slice().sort((a, b) => a - b).map((price) => {
    const vals = responses.map((r) => r[price]).filter((x) => Number.isFinite(x));
    const stated = vals.length ? vals.reduce((a, b) => a + clamp(b, 0, 1), 0) / vals.length : 0;
    const demand = stated * calibration;
    return { price, stated, demand, revenue: price * demand };
  });
  // Enforce a non-increasing demand curve (respondents are inconsistent across price points).
  for (let i = 1; i < points.length; i++) if (points[i].demand > points[i - 1].demand) { points[i].demand = points[i - 1].demand; points[i].revenue = points[i].price * points[i].demand; }
  const best = points.reduce((b, p) => (p.revenue > b.revenue ? p : b), points[0]);
  return { points, best, n: responses.length };
}

// ---- Price increases ----
// [design] extra churn ≈ k × increase% over the next 1–2 billing cycles: k ≈ 0.05–0.15 SMB monthly, 0.02–0.08
// enterprise annual, 0.1–0.3 B2C monthly. Grandfathering cuts the spike 50–80% (but delays the gain). Poor
// communication (surprise, no notice) doubles k. Bounded by McKelvey anecdote ($49→$79 with grandfathering →
// 3.2% churn) and Cursor 2025.

export const PRICE_INCREASE_K = { b2c: [0.1, 0.3], smb: [0.05, 0.15], ent: [0.02, 0.08] };

/**
 * Probability that one existing customer cancels because of the increase.
 * increasePct: 0.2 = +20%. comms 0..1 (judged notice email). noticeDays 0..90. grandfathered: customer keeps the
 * old price for a while (cuts the spike 50–80%: we use 65%). lockInOffered: annual lock-in at the old price
 * absorbs some of the angriest [design ×0.85].
 */
export function priceIncreaseChurn({ model = 'smb', increasePct, comms = 0.5, noticeDays = 30, grandfathered = false, lockInOffered = false, valueAdded = false }) {
  if (!(increasePct > 0)) return 0;
  const [klo, khi] = PRICE_INCREASE_K[model] ?? PRICE_INCREASE_K.smb;
  let k = klo + (khi - klo) * (1 - clamp(comms, 0, 1)); // good communication → low end of the range
  if (noticeDays < 14 || comms < 0.3) k *= 2; // surprise / bad comms doubles k
  else if (noticeDays >= 60) k *= 0.9;
  if (valueAdded) k *= 0.8; // tied to visible added value
  let p = k * increasePct * (increasePct > 0.5 ? 1 + (increasePct - 0.5) : 1); // big jumps hurt superlinearly
  if (grandfathered) p *= 0.35;
  if (lockInOffered) p *= 0.85;
  return clamp(p, 0, 0.9);
}

// Expected revenue effect of an increase on the existing base over `months` [design helper for the UI].
export function priceIncreaseOutlook({ customers, oldPrice, newPrice, churnProb, baseMonthlyChurn = 0.03, months = 12, grandfatherMonths = 0 }) {
  const inc = newPrice / oldPrice - 1;
  let keep = customers, revOld = 0, revNew = 0;
  for (let m = 0; m < months; m++) {
    revOld += customers * Math.pow(1 - baseMonthlyChurn, m) * oldPrice;
    const price = m < grandfatherMonths ? oldPrice : newPrice;
    if (m === Math.max(0, Math.min(months - 1, grandfatherMonths))) keep *= 1 - churnProb;
    revNew += keep * Math.pow(1 - baseMonthlyChurn, m) * price;
  }
  return { increasePct: inc, lostCustomers: customers * churnProb, revOld, revNew, netChange: revNew / revOld - 1 };
}

// ---- Tier choice (good-better-best) ----

/**
 * Share of buyers choosing each tier. tiers: [{ price (monthly), value (0..1 relative feature value) }].
 * Logit on value-for-money with a compromise-effect bonus for the middle of 3+ tiers (Huber/Payne/Puto 1982;
 * practitioner target 50–70% middle-tier share is NOT a measured benchmark) [design].
 * wtp: the market's willingness to pay per month.
 */
export function tierShares(tiers, { wtp = 50, highlightIndex = null } = {}) {
  if (!tiers.length) return [];
  if (tiers.length === 1) return [1];
  const u = tiers.map((t, i) => {
    const rel = t.price / Math.max(1, wtp);
    let x = 2.2 * (t.value ?? (i + 1) / tiers.length) - 1.6 * rel;
    if (rel > 2.5) x -= 2;
    if (tiers.length >= 3 && i > 0 && i < tiers.length - 1) x += 0.7; // compromise effect
    if (highlightIndex === i) x += 0.25; // "Most popular" badge
    return x;
  });
  const mx = Math.max(...u);
  const e = u.map((x) => Math.exp(x - mx));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

// Share of new customers who pick annual billing given the annual discount [design around Recurly: 15–20%
// typical, 16.7% mode]. Base share per model comes from core MARKET.annualShare at ~17% discount.
export function annualShare({ baseShare = 0.25, discount = 0.167 }) {
  return clamp(baseShare * (0.35 + 3.9 * clamp(discount, 0, 0.4)), 0.02, 0.9);
}

// ---- Discounting ----
// [design] by ACV, interpolated from Vendr (~10% avg) and Vertice (~34% off list): self-serve 0–5%, SMB 5–15%,
// mid-market 10–25%, enterprise 15–35%.
export const DISCOUNT_BANDS = [
  { id: 'selfServe', label: 'Self-serve (< $5k ACV)', minAcv: 0, range: [0, 0.05] },
  { id: 'smb', label: 'SMB ($5k–$25k ACV)', minAcv: 5000, range: [0.05, 0.15] },
  { id: 'midmarket', label: 'Mid-market ($25k–$100k ACV)', minAcv: 25000, range: [0.1, 0.25] },
  { id: 'enterprise', label: 'Enterprise ($100k+ ACV)', minAcv: 100000, range: [0.15, 0.35] },
];
export const discountBand = (acv) => DISCOUNT_BANDS.filter((b) => acv >= b.minAcv).at(-1) ?? DISCOUNT_BANDS[0];
