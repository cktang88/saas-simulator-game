// Bridge to the Market & competitors app (marketworld): world events move fundraising odds, valuations and
// what investors ask about. Read-only; neutral (1 / none) when no event is active.

import { worldEffect } from '../marketworld/engine.js';
import { clamp } from '../../core/util.js';
import { knownCompetitors, competitionBrief, marketOverview, competitorsFor } from '../marketworld/competitors.js';


export function worldMult(state, key) {
  try { const v = worldEffect(state, key); return Number.isFinite(v) && v > 0 ? v : 1; } catch { return 1; }
}

// Active events investors worry about (e.g. an AI lab shipped an overlapping feature, a rival raised).
export function investorConcerns(state) {
  const active = state.apps.world?.active ?? [];
  return active.filter((i) => i.status === 'active' && Number(i.effects?.investorConcern) > 0)
    .map((i) => ({ level: Number(i.effects.investorConcern), text: String(i.effects.text ?? i.eventId).slice(0, 300) }));
}

// Combined odds multiplier: the world's raiseOddsMult × a [D] penalty of the concern level (0.15 → −15%),
// which the founder can reduce by responding to the event in the Market app.
export function worldOddsMult(state) {
  const concern = investorConcerns(state).reduce((a, c) => a + c.level, 0);
  return clamp(worldMult(state, 'raiseOddsMult') * (1 - Math.min(0.5, concern)), 0.2, 1.5);
}

export function concernPrompt(state) {
  const cs = investorConcerns(state);
  return cs.length ? `\nRecent market news you know about and WILL ask the founder about: ${cs.map((c) => c.text).join(' | ')}` : '';
}

// ---- Real competitors (marketworld/competitors.js) ----

const fundStr = (c) => (c.fundingTotalUSD ? `$${(c.fundingTotalUSD / 1e6).toFixed(c.fundingTotalUSD >= 1e7 ? 0 : 1)}M raised` : c.fundingStage && c.fundingStage !== 'unknown' ? c.fundingStage.replace(/_/g, ' ') : 'funding unknown');
export const wellFunded = (c) => c && !c.statusQuo && ((c.fundingTotalUSD ?? 0) >= 10e6 || ['public', 'series_b_plus'].includes(c.fundingStage));

// Landscape lines for the panel's metrics sheet (all competitors; estimates).
export function landscape(state) {
  try {
    const ov = marketOverview(state);
    const list = competitorsFor(state).filter((c) => c.kind !== 'adjacent' || c.awareness > 0.2).slice(0, 8);
    return {
      real: ov.real, crowdedness: ov.crowdedness, maturity: ov.marketMaturity, statusQuo: ov.statusQuo,
      competitors: list.map((c) => ({ name: c.name, funding: fundStr(c), share: c.marketShare ?? 0, wellFunded: wellFunded(c), fictional: Boolean(c.fictional) })),
    };
  } catch { return null; }
}

// What one investor knows (deterministic per investor id) and what they should ask.
export function investorCompetitorPrompt(state, invId) {
  let known = [];
  try { known = knownCompetitors(state, { audience: 'investor', seed: invId, max: 3 }); } catch { return ''; }
  if (!known.length) return '\nYou do not know any specific companies in this space. Never name competitors. Probe market size, why now, and what buyers use today instead.';
  const comps = known.map((k) => k.competitor);
  const big = comps.find(wellFunded);
  const other = comps.find((c) => c !== big);
  const asks = [big && `why won't ${big.name} (${fundStr(big)}) crush you?`, other && `how exactly are you different from ${other.name}?`].filter(Boolean);
  return `\nCompanies you know in this space (only these; don't name others): ${competitionBrief(state, known)}${asks.length ? ` Ask the founder: ${asks.join(' / ')}` : ''}`;
}
export function knownCompetitorNames(state, invId) {
  try { return knownCompetitors(state, { audience: 'investor', seed: invId, max: 3 }).map((k) => k.competitor); } catch { return []; }
}
