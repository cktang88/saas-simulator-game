// Per-prospect competitive context, from the Market app's real (web-discovered) competitor set.
// Landscape-wide pressure is already inside worldDealMult(); here we only apply what THIS buyer uses or
// has evaluated. Multipliers are [design] game estimates: no public benchmark isolates them.
import { knownCompetitors, competitionBrief } from '../marketworld/competitors.js';
import { clamp } from '../../core/util.js';

const safeKnown = (state, opts) => {
  try { return knownCompetitors(state, opts) ?? []; } catch { return []; }
};

/** A strong incumbent: dominant share, heavy funding or public. */
export function isStrong(c) {
  if (!c || c.statusQuo) return false;
  const f = c.fundingTotalUSD ?? 0;
  return (c.marketShare ?? 0) >= 0.2 || f >= 50e6 || c.fundingStage === 'public' || c.fundingStage === 'public_incumbent';
}

export function competitionFor(state, { audience = 'prospect', seed, max = 3 } = {}) {
  const known = safeKnown(state, { audience, seed: String(seed ?? 'x'), max });
  const uses = known.find((k) => k.relation === 'uses')?.competitor ?? null;
  const evaluated = known.filter((k) => k.relation === 'evaluated').map((k) => k.competitor);
  let brief = '';
  try { brief = competitionBrief(state, known); } catch { brief = ''; }
  return { known, uses, evaluated, brief, names: known.map((k) => k.competitor.name).filter(Boolean) };
}

/**
 * Close-odds multiplier from this buyer's own relation to competitors [design]:
 * on the status quo (spreadsheets…) switching is easy (×1.05); on a strong incumbent ×0.8 (switching cost,
 * "nobody gets fired for buying X"); on a smaller rival ×0.9; a strong rival in their evaluation ×0.95.
 */
export function competitorDealMult(comp) {
  if (!comp) return 1;
  let m = 1;
  if (comp.uses?.statusQuo) m *= 1.05;
  else if (comp.uses) m *= isStrong(comp.uses) ? 0.8 : 0.9;
  if (comp.evaluated.some(isStrong)) m *= 0.95;
  return clamp(m, 0.7, 1.1);
}

/** Budget/urgency effect on a persona: status-quo users have less budget urgency; paying incumbent users already have budget. */
export function budgetFactor(comp) {
  if (!comp?.uses) return 1;
  return comp.uses.statusQuo ? 0.8 : 1.15;
}

/** Probability a competitor makes your customer a counter-offer at renewal (share, awareness, momentum). */
export function competitorOfferChance(c) {
  if (!c || c.statusQuo) return 0;
  return clamp(0.05 + 0.6 * (c.marketShare ?? 0) + 0.2 * (c.awareness ?? 0) + (c.momentum === 'rising' ? 0.12 : c.momentum === 'declining' ? -0.05 : 0) + ((c.fundingTotalUSD ?? 0) >= 30e6 ? 0.08 : 0), 0, 0.6);
}
