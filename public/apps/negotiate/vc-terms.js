// Term-sheet detail beyond price: preference, board, vesting, protective provisions, no-shop. Pure, no app imports (sim.js
// calls it when a term sheet is issued, vc.js when it is negotiated). Prevalence is [design] around the researched market:
// 1x non-participating is 96.4% of US deals (Cooley Q1 2026, sourced), participating ~5% (Osler, secondary), seed boards are
// typically 3 seats and Series A 2-2-1 (practitioner sources, unverified). A hardball lead is likelier to include the traps.

import { hash } from '../../core/util.js';

const stream = (state, salt) => ({ seed: (parseInt(hash(`${state.seed}|tsx|${salt}`), 36) | 0) || 1 });
function rand(rs) {
  let t = (rs.seed = (rs.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickW = (rs, entries) => {
  const tot = entries.reduce((a, [, w]) => a + w, 0);
  let r = rand(rs) * tot;
  for (const [v, w] of entries) { r -= w; if (r <= 0) return v; }
  return entries.at(-1)[0];
};

const HARD = { multistage: 1.6, cvc: 1.3, micro_vc: 0.8, seed_fund: 0.7 };

/** Non-price terms of a priced lead term sheet (a private stream per investor: the main rng(state) is untouched). */
export function extraTerms(state, inv, stage = 'seed') {
  const rs = stream(state, `${inv.id}|${stage}`);
  const h = HARD[inv.kind] ?? 1;
  const partP = Math.min(0.2, 0.05 * h * (stage === 'series-a' ? 1.4 : 1));
  const twoXP = 0.01 * h;
  const r = rand(rs);
  let liqPref = 1, participating = false;
  if (r < partP) participating = true;
  if (rand(rs) < twoXP) liqPref = 2;
  const boardSeats = stage === 'series-a'
    ? pickW(rs, [['balanced', 0.62], ['indep', 0.15], ['investor', 0.05 * h], ['founder', 0.18]])
    : pickW(rs, [['founder', 0.8], ['indep', 0.1], ['balanced', 0.1 * h]]);
  const vesting = pickW(rs, [['keep', 0.72], ['partial', 0.2], ['reset', 0.08 * h]]);
  const protective = pickW(rs, [['standard', 0.7], ['light', 0.12], ['broad', 0.18 * h]]);
  const noShopDays = pickW(rs, [[30, 0.15], [45, 0.45], [60, 0.35], [90, 0.05 * h]]);
  return { liqPref, participating, boardSeats, vesting, protective, noShopDays };
}

export const BOARD_TEXT = { founder: '3 seats: 2 founders + 1 investor', indep: '3 seats: 1 founder + 1 investor + 1 mutual independent', balanced: '5 seats: 2 founders + 2 investors + 1 independent', investor: 'investor-controlled board' };
export const VESTING_TEXT = { keep: 'existing vesting kept (double-trigger acceleration)', partial: '25% of founder stock re-vests over 2 years', reset: 'full 4-year founder re-vest (1-year cliff, no acceleration)' };
export const PROTECTIVE_TEXT = { standard: 'standard protective provisions', light: 'light protective provisions', broad: 'broad protective provisions (budget, hiring, debt vetoes)' };

/** "1x non-participating" / "1x participating" / "2x non-participating" / "2x participating". */
export const liqText = (t) => `${t.liqPref ?? 1}x ${t.participating ? 'participating' : 'non-participating'}`;

/** Founder proceeds lost to a participating or multiple preference at an exit, as a closed form (also used by the debrief). */
export function prefCostUsd({ invested, ownership, liqPref = 1, participating = false, exitValue }) {
  // Non-participating: investor takes max(pref, as-converted). Participating: pref plus as-converted share of the rest.
  const asConv = ownership * exitValue;
  const pref = liqPref * invested;
  const np = Math.max(Math.min(pref, exitValue), asConv);
  const part = participating ? Math.min(pref, exitValue) + ownership * Math.max(0, exitValue - pref) : np;
  const baseline = Math.max(Math.min(invested, exitValue), asConv);
  return Math.max(0, Math.round(part - baseline));
}

/** Effective pre-money after the option pool shuffle: the pool top-up comes out of the pre-money holders. */
export function effectivePreMoney({ preMoney, investment, poolPostPct, existingUnissuedPct = 0 }) {
  const post = preMoney + investment;
  const topUp = Math.max(0, poolPostPct - existingUnissuedPct) * post;
  return { effective: preMoney - topUp, haircut: topUp / preMoney, topUp, post };
}
