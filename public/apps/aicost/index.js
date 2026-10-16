// AI costs and startup perks: the hooks product.js calls (daily, month end), the Automations events and the operator
// readers. UI lives in views.js; state in model.js.

import { inferenceDay, inferenceMonthEnd, aiEngineOn } from './inference.js';
import { codingMonthEnd, codingLimitFactor } from './coding.js';
import { creditsDay, perksMonthEnd } from './credits.js';
import './readers.js';

export function aiDay(state) {
  inferenceDay(state);
  creditsDay(state);
}
export function aiMonthEnd(state) {
  codingMonthEnd(state);
  inferenceMonthEnd(state);
  perksMonthEnd(state);
}

/** Events for Automations: stable ids, newest last. */
export function aiEvents(state, since = 0) {
  const a = (state.apps.aicost?.events ?? []).filter((e) => e.day >= since);
  const b = (state.apps.perks?.events ?? []).filter((e) => e.day >= since);
  return [...a, ...b].sort((x, y) => x.day - y.day);
}
export { aiEngineOn, codingLimitFactor };
