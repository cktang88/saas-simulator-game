// Governance and vesting consequences of negotiated VC terms, read at an acquisition. Pure on the fundraising slice
// (state.apps.fundraising.governance, recorded when a priced round closes: sim.js recordGovernance). No app imports.

import { clamp, money, round2 } from '../../core/util.js';

/** An acquisition needs investor consent when the board is investor-controlled or the protective provisions are broad. */
export function saleConsent(state, price) {
  const g = state.apps?.fundraising?.governance;
  if (!g) return { blocked: false };
  const inv = g.invested ?? 0;
  const floor = (g.liqPref ?? 1) * inv * (g.participating ? 1.5 : 1);
  if ((g.control === 'investor' || g.protective === 'broad') && price < Math.max(2 * inv, floor * 1.5)) {
    return { blocked: true, reason: `The ${g.control === 'investor' ? 'investor-controlled board' : 'broad protective provisions'} give your investors a veto: a ${money(price)} sale returns less than 2x their ${money(inv)}, so they refuse and the buyer's window passes.` };
  }
  return { blocked: false };
}

/** Share of founder proceeds forfeited at an acquisition because of a re-vest (unvested shares do not pay). */
export function vestingForfeit(governance, years = 0) {
  const g = governance;
  if (!g || g.vesting === 'keep' || !g.vesting) return 0;
  const reset = g.vesting === 'reset';
  const frac = reset ? 1 : 0.25;
  const span = reset ? 4 : 2;
  const cliff = reset ? 1 : 0;
  const vested = years < cliff ? 0 : clamp(years / span, 0, 1);
  return round2(frac * (1 - vested) * (reset ? 1 : 0.5)); // double-trigger acceleration takes half off a partial re-vest [design]
}
export function saleVestingForfeit(state) {
  const g = state.apps?.fundraising?.governance;
  if (!g) return 0;
  return vestingForfeit(g, (state.day - (g.day ?? state.day)) / 365);
}
