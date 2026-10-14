// Bridge to the Market & competitors app (marketworld): world events move fundraising odds, valuations and
// what investors ask about. Read-only; neutral (1 / none) when no event is active.

import { worldEffect } from '../marketworld/engine.js';
import { clamp } from '../../core/util.js';

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
