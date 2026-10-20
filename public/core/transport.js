// Transport: how LLM calls reach OpenRouter.
//   'server' mode (default): the page was served by server.js, so calls go to its same-origin proxy (./api/llm, ./api/decide).
//   'static' mode: no server (GitHub Pages, ?static=1): the browser calls OpenRouter directly with the player's own key.
// Mode is detected once at startup (detectMode). All same-origin URLs are RELATIVE so the site can live under a sub-path.
// The key is only ever sent to OpenRouter (static) or to the local server that served the page (server).

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const OPENROUTER_URL = `${OPENROUTER_BASE}/chat/completions`;
export const OPENROUTER_KEY_URL = `${OPENROUTER_BASE}/key`;
export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const APP_TITLE = 'SaaS Founder Simulator';
// Same field whitelists as server.js, so static and server mode send identical request bodies.
export const LLM_FIELDS = ['model', 'messages', 'response_format', 'max_tokens', 'temperature', 'plugins', 'reasoning', 'seed'];
export const DECIDE_FIELDS = ['model', 'state', 'questions'];
export const REQUEST_TIMEOUT_MS = 120_000;

let mode = 'server';
let detected = false;
let base = '';

export const getMode = () => mode;
export const isStatic = () => mode === 'static';
export const modeDetected = () => detected;
/** Tests and the boot code can force a mode. */
export function setMode(m) { mode = m === 'static' ? 'static' : 'server'; detected = true; }
export function setBase(b) { base = b || ''; }
export const apiBase = () => base;
/** Same-origin API URL, relative to the page (works under a sub-path). path: 'api/llm' (no leading slash). */
export const apiUrl = (path) => `${base || '.'}/${String(path).replace(/^\/+/, '')}`;

function forcedStatic(search) {
  try { return new URLSearchParams(search ?? globalThis.location?.search ?? '').get('static') === '1'; } catch { return false; }
}

/** Detect the mode once. → { mode, serverKey }. ?static=1 forces static; otherwise a JSON answer from ./api/status means a server. */
export async function detectMode({ search, fetchImpl } = {}) {
  if (forcedStatic(search)) { mode = 'static'; detected = true; return { mode, serverKey: false }; }
  let serverKey = false;
  try {
    const r = await (fetchImpl ?? globalThis.fetch)(apiUrl('api/status'));
    const j = r.ok ? await r.json() : null;
    if (j && typeof j === 'object' && 'serverKey' in j) { mode = 'server'; serverKey = Boolean(j.serverKey); } else mode = 'static';
  } catch { mode = 'static'; }
  detected = true;
  return { mode, serverKey };
}

const pick = (body, fields) => Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => fields.includes(k)));
const referer = () => { try { return globalThis.location ? `${location.origin}${location.pathname}` : 'http://localhost'; } catch { return 'http://localhost'; } };
const timeout = (ms = REQUEST_TIMEOUT_MS) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

function directHeaders(key) {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': referer(), 'X-Title': APP_TITLE };
}

/** Chat completion. Resolves to a fetch Response in both modes (callers read ok/status/json()). */
export function llmFetch(body, key, { timeoutMs } = {}) {
  if (mode === 'static') {
    return globalThis.fetch(OPENROUTER_URL, { method: 'POST', headers: directHeaders(key), body: JSON.stringify({ ...pick(body, LLM_FIELDS), usage: { include: true } }), signal: timeout(timeoutMs) });
  }
  return globalThis.fetch(apiUrl('api/llm'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-OpenRouter-Key': key } : {}) }, body: JSON.stringify(body) });
}

/** Jev typed decisions. */
export function decideFetch(body, key, { timeoutMs } = {}) {
  if (mode === 'static') {
    return globalThis.fetch(DECISIONS_URL, { method: 'POST', headers: directHeaders(key), body: JSON.stringify(pick(body, DECIDE_FIELDS)), signal: timeout(timeoutMs) });
  }
  return globalThis.fetch(apiUrl('api/decide'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-OpenRouter-Key': key } : {}) }, body: JSON.stringify(body) });
}

/**
 * Check a key without spending much. Static: OpenRouter's key-info endpoint (free). Server: a 1-token completion via the proxy.
 * → { status: 'none' | 'valid' | 'invalid' | 'error', detail, info }
 */
export async function testKey(key, { model = 'openai/gpt-4o-mini' } = {}) {
  if (!key && mode === 'static') return { status: 'none', detail: 'No key entered. The game runs on offline deterministic judges.' };
  try {
    if (mode === 'static') {
      const r = await globalThis.fetch(OPENROUTER_KEY_URL, { headers: { Authorization: `Bearer ${key}`, 'HTTP-Referer': referer(), 'X-Title': APP_TITLE }, signal: timeout(20_000) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) return { status: 'invalid', detail: j.error?.message ?? 'OpenRouter rejected this key.' };
      if (!r.ok) return { status: 'error', detail: j.error?.message ?? `HTTP ${r.status}` };
      const d = j.data ?? {};
      const left = typeof d.limit_remaining === 'number' ? `$${d.limit_remaining.toFixed(2)} of the spending limit left` : d.limit == null ? 'no spending limit set on this key' : `limit $${d.limit}`;
      return { status: 'valid', detail: `Key works (${left}).`, info: d };
    }
    const r = await llmFetch({ model, messages: [{ role: 'user', content: 'Reply with: ok' }], max_tokens: 1, temperature: 0 }, key);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) return { status: 'invalid', detail: j.error?.message ?? j.error ?? 'Rejected.' };
    if (!r.ok || j.error) return { status: 'error', detail: j.error?.message ?? j.error ?? `HTTP ${r.status}` };
    return { status: 'valid', detail: 'Key works.' };
  } catch (e) { return { status: 'error', detail: `Could not reach OpenRouter: ${e.message}` }; }
}
