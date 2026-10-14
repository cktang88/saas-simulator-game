// Procurement-ask effects readable by other modules without import cycles.
import { ASK_EFFECT } from './model.js';

/** Multiplier on a CRM deal's close probability: every undelivered or declined ask lowers the odds. */
export function askPenalty(state, dealId) {
  const asks = state.apps.success?.asks ?? [];
  return asks.filter((a) => a.target === 'deal' && a.refId === dealId && (a.status === 'open' || a.status === 'declined')).reduce((m, a) => m * (ASK_EFFECT[a.kind] ?? 1), 1);
}

/** Unresolved asks block a deal decision for a while (procurement waits) — returns extra days to wait. */
export function askDelay(state, dealId, day) {
  const open = (state.apps.success?.asks ?? []).filter((a) => a.target === 'deal' && a.refId === dealId && a.status === 'open' && a.dueDay > day);
  return open.length ? Math.max(...open.map((a) => a.dueDay - day)) : 0;
}
