// What the "AI judges" indicator in the top bar says. It reports what the last calls actually did, not just whether
// a key is set: with a wrong key, no credit or a dead proxy every call quietly falls back to the offline heuristic,
// and the bar must not keep saying "Live". UI-only session state (never in the save), no rng or Date.

export const HEALTH_WINDOW = 20;

export function createHealth() {
  return { recent: [], lastError: null };
}

/** Record one LLM call from the usage sink. A call that was offline by choice (no key, live off) is not a live attempt. */
export function recordCall(h, { mock = false, error = null } = {}) {
  if (mock && error == null) return h;
  h.recent.push(!mock);
  if (h.recent.length > HEALTH_WINDOW) h.recent.shift();
  if (mock) h.lastError = String(error).slice(0, 160);
  return h;
}

/** → { label, tone ('pos' | 'warn' | 'neg' | ''), title } for the top bar. */
export function judgeStatus(h, live, { models = [], decisionModel = '' } = {}) {
  if (!live) return { label: 'Offline', tone: 'warn', title: 'No OpenRouter key, or live models are switched off in Settings: every judge uses the deterministic offline heuristic.' };
  const n = h.recent.length;
  const ok = h.recent.filter(Boolean).length;
  const who = `chat ${models.join(', ') || 'default'}; decisions ${decisionModel || 'default'}`;
  if (!n) return { label: 'Key set', tone: '', title: `A key is set (${who}) but no call has run yet this session, so it is not verified. Settings → Test connection checks it.` };
  if (!ok) return { label: 'Failing', tone: 'neg', title: `None of the last ${n} live calls worked; every one fell back to the offline heuristic (last error: ${h.lastError ?? 'unknown'}). Results are offline until this is fixed in Settings.` };
  if (ok < n) return { label: `Live · ${n - ok}/${n} offline`, tone: 'warn', title: `${n - ok} of the last ${n} live calls failed and used the offline heuristic instead (last error: ${h.lastError ?? 'unknown'}). ${who}.` };
  return { label: 'Live', tone: 'pos', title: `The last ${n} calls were answered live (${who}).` };
}
