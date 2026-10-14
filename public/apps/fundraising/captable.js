// Cap table math (Carta-style), pure and share-based. Covers the YC post-money SAFE, MFN elections,
// priced rounds with the option-pool shuffle, issuing common, and a 1x non-participating exit waterfall.
// Sources: docs/research/fundraising.md §1 (SAFE mechanics, option pool, dilution).

export const FOUNDER_SHARES = 10_000_000; // Clerky / Stripe Atlas default founder issuance

export function newCapTable(founderName = 'Founder') {
  return {
    founders: [{ name: founderName, shares: FOUNDER_SHARES }],
    common: [], // other common: accelerator common, advisors { id, name, shares, note }
    pool: 0, // total shares reserved for the option plan (granted + unissued)
    grants: [], // [{ name, shares }] granted options (from the People app)
    preferred: [], // [{ id, series, holder, shares, invested, price, liqPref, participating, day }]
    safes: [], // [{ id, holder, amount, cap, discount, mfn, proRata, day, status }]
  };
}

const sumBy = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
export const grantedShares = (cap) => sumBy(cap.grants ?? [], (g) => g.shares);
export const poolTotal = (cap) => Math.max(cap.pool ?? 0, grantedShares(cap));
export const commonShares = (cap) => sumBy(cap.founders, (f) => f.shares) + sumBy(cap.common ?? [], (c) => c.shares);
export const preferredShares = (cap) => sumBy(cap.preferred ?? [], (p) => p.shares);
// Fully diluted shares excluding unconverted SAFEs.
export const fdShares = (cap) => commonShares(cap) + preferredShares(cap) + poolTotal(cap);
export const outstandingSafes = (cap) => (cap.safes ?? []).filter((s) => s.status !== 'converted');

// Post-money SAFE: ownership at conversion = investment ÷ post-money cap (fixed until the priced round).
export const safeOwnership = (safe, assumedPost = null) => (safe.cap ? safe.amount / safe.cap : assumedPost ? safe.amount / assumedPost : 0);

// MFN: each outstanding MFN SAFE adopts better terms (lower cap / higher discount) from any later SAFE.
export function applyMfn(safes) {
  return safes.map((s, i) => {
    if (!s.mfn || s.status === 'converted') return s;
    const later = safes.slice(i + 1).filter((x) => x.status !== 'converted');
    let cap = s.cap, discount = s.discount ?? 0;
    for (const l of later) {
      if (l.cap && (!cap || l.cap < cap)) cap = l.cap;
      if ((l.discount ?? 0) > discount) discount = l.discount;
    }
    return cap === s.cap && discount === (s.discount ?? 0) ? s : { ...s, cap, discount, mfnAdopted: true };
  });
}

// Holder rows on an as-converted basis: unconverted SAFEs estimated at amount/cap (uncapped at assumedPost).
export function capRows(cap, { assumedPost = 15_000_000 } = {}) {
  const safes = applyMfn(outstandingSafes(cap));
  const base = fdShares(cap);
  const f = Math.min(0.95, sumBy(safes, (s) => safeOwnership(s, assumedPost)));
  const safeTotal = f > 0 ? (base * f) / (1 - f) : 0;
  const rows = [];
  for (const x of cap.founders) rows.push({ name: x.name, cls: 'Common (founder)', shares: x.shares });
  for (const x of cap.common ?? []) rows.push({ name: x.name, cls: x.note || 'Common', shares: x.shares });
  for (const x of cap.preferred ?? []) rows.push({ name: x.holder, cls: `Preferred ${x.series}`, shares: x.shares, invested: x.invested });
  for (const g of cap.grants ?? []) rows.push({ name: g.name, cls: 'Options (granted)', shares: g.shares });
  const unissued = poolTotal(cap) - grantedShares(cap);
  if (unissued > 0) rows.push({ name: 'Unissued option pool', cls: 'Option pool', shares: unissued });
  for (const s of safes) {
    const o = safeOwnership(s, assumedPost);
    rows.push({ name: s.holder, cls: `SAFE ${s.cap ? `($${(s.cap / 1e6).toFixed(2)}M cap)` : '(uncapped, est.)'}`, shares: f > 0 ? (safeTotal * o) / f : 0, invested: s.amount, estimated: true });
  }
  const total = base + safeTotal;
  return { rows: rows.map((r) => ({ ...r, pct: total ? r.shares / total : 0 })), total, fdExSafes: base };
}

export function founderPct(cap, opts) {
  const { rows } = capRows(cap, opts);
  return rows.filter((r) => r.cls === 'Common (founder)').reduce((a, r) => a + r.pct, 0);
}

// Issue common so the holder owns `pct` post-issuance (e.g. Techstars 5% common).
export function issueCommonPct(cap, { name, pct, note = 'Common' }) {
  const shares = Math.round((fdShares(cap) * pct) / (1 - pct));
  return { ...cap, common: [...(cap.common ?? []), { id: `c${(cap.common ?? []).length + 1}`, name, shares, note }] };
}

// Create or top up the option pool so the unissued pool is `pctPost` of fully diluted after the change.
export function setPoolPct(cap, pctPost) {
  const fd = fdShares(cap), unissued = poolTotal(cap) - grantedShares(cap);
  const add = Math.max(0, Math.round((pctPost * fd - unissued) / (1 - pctPost)));
  return { ...cap, pool: poolTotal(cap) + add };
}

/**
 * Priced round with the option-pool shuffle.
 * - Outstanding SAFEs convert first (post-money SAFE: ownership = amount/cap of the pre-top-up capitalization
 *   including all converting SAFEs; or at the round price × (1 − discount) if better; uncapped at that price).
 * - The pool top-up needed for `poolTargetPost` (unissued pool as % of post-money) goes in the pre-money,
 *   so it dilutes existing holders (founders and converted SAFEs), not the new investor.
 * - New investor ownership = investment / (preMoney + investment).
 */
export function pricedRound(cap, { preMoney, investment, poolTargetPost = 0.1, series = 'Seed', investor = 'Lead investor', day = 0 }) {
  const safes = applyMfn(outstandingSafes(cap));
  const base = fdShares(cap);
  const unissued = poolTotal(cap) - grantedShares(cap);
  const post = preMoney + investment, k = post / preMoney;
  let p = preMoney / base, T = base, shares = [], topUp = 0;
  for (let it = 0; it < 200; it++) {
    const alt = safes.map((s) => s.amount / (p * (1 - (s.discount ?? 0))));
    const uncapped = safes.reduce((a, s, i) => a + (s.cap ? 0 : alt[i]), 0);
    T = base + uncapped;
    for (let j = 0; j < 60; j++) {
      shares = safes.map((s, i) => (s.cap ? Math.max((s.amount / s.cap) * T, alt[i]) : alt[i]));
      T = base + shares.reduce((a, b) => a + b, 0);
    }
    topUp = Math.max(0, (poolTargetPost * T * k - unissued) / (1 - poolTargetPost * k));
    const np = preMoney / (T + topUp);
    if (Math.abs(np - p) < 1e-12 * p) { p = np; break; }
    p = np;
  }
  const newShares = investment / p;
  const conversions = safes.map((s, i) => ({ id: s.id, holder: s.holder, amount: s.amount, shares: Math.round(shares[i]), price: s.amount / shares[i] }));
  const next = {
    ...cap,
    pool: Math.round(poolTotal(cap) + topUp),
    safes: (cap.safes ?? []).map((s) => (s.status === 'converted' ? s : { ...s, status: 'converted', convertedIn: series })),
    preferred: [
      ...(cap.preferred ?? []),
      ...conversions.map((c) => ({ id: `${c.id}_conv`, series: `${series} (SAFE)`, holder: c.holder, shares: c.shares, invested: c.amount, price: c.price, liqPref: 1, participating: false, day })),
      { id: `pr_${series}_${day}`, series, holder: investor, shares: Math.round(newShares), invested: investment, price: p, liqPref: 1, participating: false, day },
    ],
  };
  return { cap: next, price: p, newShares, poolTopUp: topUp, conversions, postMoney: post, preMoney, fdAfter: fdShares(next) };
}

/**
 * Exit waterfall. 1x non-participating preferred, pari passu (simplification: no seniority stacking).
 * Each preferred holder takes the greater of its preference or its as-converted share.
 * Unconverted SAFEs take the greater of their purchase amount or as-converted (amount/cap) — YC liquidity terms.
 * Granted options are treated as exercised (strike ignored); the unissued pool gets nothing.
 * debt (e.g. RBF balance) and fees come off the top.
 */
export function waterfall(cap, exitValue, { debt = 0, fees = 0 } = {}) {
  const proceeds = Math.max(0, exitValue - debt - fees);
  const holders = [];
  for (const f of cap.founders) holders.push({ name: f.name, cls: 'Founder', shares: f.shares, pref: 0, founder: true });
  for (const c of cap.common ?? []) holders.push({ name: c.name, cls: 'Common', shares: c.shares, pref: 0 });
  for (const g of cap.grants ?? []) holders.push({ name: g.name, cls: 'Options', shares: g.shares, pref: 0 });
  for (const p of cap.preferred ?? []) holders.push({ name: p.holder, cls: `Pref ${p.series}`, shares: p.shares, pref: p.invested * (p.liqPref ?? 1), preferred: true });
  const safes = applyMfn(outstandingSafes(cap));
  const base = fdShares(cap) - (poolTotal(cap) - grantedShares(cap)); // issued + granted
  const f = Math.min(0.95, sumBy(safes.filter((s) => s.cap), (s) => s.amount / s.cap));
  for (const s of safes) {
    const sh = s.cap && f > 0 ? ((base * f) / (1 - f)) * (s.amount / s.cap) / f : 0;
    holders.push({ name: s.holder, cls: 'SAFE', shares: sh, pref: s.amount, preferred: true });
  }
  const prefHolders = holders.filter((h) => h.preferred);
  const converting = new Set();
  let payouts;
  for (let it = 0; it < 50; it++) {
    const nonConv = prefHolders.filter((h) => !converting.has(h));
    const prefTotal = sumBy(nonConv, (h) => h.pref);
    const prefPaid = Math.min(prefTotal, proceeds);
    const remaining = proceeds - prefPaid;
    const commonPool = sumBy(holders.filter((h) => !h.preferred || converting.has(h)), (h) => h.shares);
    const pps = commonPool > 0 ? remaining / commonPool : 0;
    payouts = holders.map((h) => {
      if (h.preferred && !converting.has(h)) return { ...h, payout: prefTotal ? (h.pref / prefTotal) * prefPaid : 0, converted: false };
      return { ...h, payout: h.shares * pps, converted: Boolean(h.preferred) };
    });
    let changed = false;
    for (const h of nonConv) if (h.shares * pps > h.pref + 1e-6) { converting.add(h); changed = true; }
    if (!changed) break;
  }
  const founderTake = sumBy(payouts.filter((h) => h.founder), (h) => h.payout);
  return { proceeds, debt, fees, payouts: payouts.map(({ preferred, ...r }) => r), founderTake };
}
