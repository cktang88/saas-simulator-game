// Transport: how LLM calls reach OpenRouter. The player picks a CONNECTION in Settings (resolveConnection):
//   'proxy'    hosted proxy (default on the public site): server.js on Fly with the operator's key, at LLM.proxyUrl.
//   'byok'     your own OpenRouter key, straight from this browser to openrouter.ai (no server).
//   'selfhost' your own server.js (npm start): the server that served this page, or a URL you enter.
//   'offline'  no LLM at all: deterministic heuristic judges (not recommended).
//   'auto'     a server that served this page if there is one, else your own key if one is saved, else the hosted proxy.
// Under the hood there are three MODES: 'server' (proxy and selfhost: calls go to <base>/api/llm etc.),
// 'static' (byok: direct to OpenRouter) and 'offline'. Same-origin URLs are RELATIVE so the site can live under a sub-path.
// The player's key is only sent to openrouter.ai (byok) or to their own server (selfhost); never to the hosted proxy.

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
let connection = 'selfhost';
let sendKey = true; // forward the player's key to the server (own server only, never the hosted proxy)

export const CONNECTIONS = ['proxy', 'byok', 'selfhost', 'offline'];
export const getConnection = () => connection;
export const sendsKey = () => sendKey;
export const isOffline = () => mode === 'offline';

export const getMode = () => mode;
export const isStatic = () => mode === 'static';
export const modeDetected = () => detected;
/** Tests and the boot code can force a mode. */
export function setMode(m) { mode = m === 'static' || m === 'offline' ? m : 'server'; detected = true; connection = mode === 'static' ? 'byok' : mode === 'offline' ? 'offline' : 'selfhost'; sendKey = true; base = ''; }
export function setBase(b) { base = b || ''; }
export const apiBase = () => base;
/** Same-origin API URL, relative to the page (works under a sub-path). path: 'api/llm' (no leading slash). */
export const apiUrl = (path) => `${base || '.'}/${String(path).replace(/^\/+/, '')}`;

function forcedStatic(search) {
  try { return new URLSearchParams(search ?? globalThis.location?.search ?? '').get('static') === '1'; } catch { return false; }
}

// The boot awaits this probe before rendering anything: a server that never answers (a blackholed self-host URL, a
// stopped proxy machine still starting) must not leave the game on a blank page, so the probe gives up after a while.
export const PROBE_TIMEOUT_MS = 10_000;
const probe = (f, timeoutMs = PROBE_TIMEOUT_MS) => f(apiUrl('api/status'), { signal: timeout(timeoutMs) });

/** Detect the mode once. → { mode, serverKey, public }. ?static=1 forces static; otherwise a JSON answer from ./api/status means a server. */
export async function detectMode({ search, fetchImpl, timeoutMs } = {}) {
  if (forcedStatic(search)) { mode = 'static'; detected = true; return { mode, serverKey: false, public: false }; }
  let serverKey = false, isPublic = false;
  try {
    const r = await probe(fetchImpl ?? globalThis.fetch, timeoutMs);
    const j = r.ok ? await r.json() : null;
    if (j && typeof j === 'object' && 'serverKey' in j) { mode = 'server'; serverKey = Boolean(j.serverKey); isPublic = Boolean(j.public); } else mode = 'static';
  } catch { mode = 'static'; }
  detected = true;
  return { mode, serverKey, public: isPublic };
}

const trimBase = (u) => String(u ?? '').trim().replace(/\/+$/, '');

/**
 * Apply the player's connection choice. → { connection, mode, base, reachable, serverKey, public, limits }
 * choice: 'auto' | 'proxy' | 'byok' | 'selfhost' | 'offline'. proxyUrl / serverUrl: optional overrides.
 * A server connection is probed at <base>/api/status; an unreachable one stays selected (calls fall back offline
 * with a clear error) so a player can see what is wrong instead of being silently switched.
 */
export async function resolveConnection({ choice = 'auto', proxyUrl = '', serverUrl = '', defaultProxy = '', hasKey = false, search, fetchImpl, timeoutMs } = {}) {
  const f = fetchImpl ?? globalThis.fetch;
  if (forcedStatic(search)) choice = 'byok';
  let sameOriginProxy = false;
  if (choice === 'auto') {
    base = ''; // probe the server that served this page, not a previously chosen one
    const local = await detectMode({ search: '', fetchImpl: f, timeoutMs });
    // The page served by the HOSTED proxy itself (it serves public/ too) is not "your own server": treating it as
    // selfhost would forward a saved key to the operator's server. It is the hosted proxy, at this same origin.
    const own = local.mode === 'server' && !local.public;
    choice = own ? 'selfhost' : hasKey ? 'byok' : 'proxy'; // a saved key means the player brought their own
    sameOriginProxy = choice === 'proxy' && local.public;
  }
  connection = CONNECTIONS.includes(choice) ? choice : 'proxy';
  detected = true;
  if (connection === 'byok') { mode = 'static'; base = ''; sendKey = false; return { connection, mode, base, reachable: true, serverKey: false }; }
  if (connection === 'offline') { mode = 'offline'; base = ''; sendKey = false; return { connection, mode, base, reachable: false, serverKey: false }; }
  mode = 'server';
  base = connection === 'proxy' ? (sameOriginProxy ? '' : trimBase(proxyUrl || defaultProxy)) : trimBase(serverUrl);
  sendKey = connection === 'selfhost';
  try {
    const r = await probe(f, timeoutMs);
    const j = r.ok ? await r.json() : null;
    if (!j || typeof j !== 'object' || !('serverKey' in j)) return { connection, mode, base, reachable: false, serverKey: false, error: `No game server at ${base || 'this site'}` };
    if (j.public) sendKey = false; // a server that says it is a public proxy never gets the player's key, whatever was picked
    return { connection, mode, base, reachable: true, serverKey: Boolean(j.serverKey), public: Boolean(j.public), limits: j.limits ?? null };
  } catch (e) {
    return { connection, mode, base, reachable: false, serverKey: false, error: `Could not reach ${base || 'this site'}: ${e.message}` };
  }
}

const pick = (body, fields) => Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => fields.includes(k)));
const referer = () => { try { return globalThis.location ? `${location.origin}${location.pathname}` : 'http://localhost'; } catch { return 'http://localhost'; } };
const timeout = (ms = REQUEST_TIMEOUT_MS) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

function directHeaders(key) {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': referer(), 'X-Title': APP_TITLE };
}

/** Headers for a call to a game server: the player's key only goes to their own server. */
export const serverHeaders = (key, extra = {}) => ({ 'Content-Type': 'application/json', ...(key && sendKey ? { 'X-OpenRouter-Key': key } : {}), ...extra });

/** Chat completion. extraHeaders (server modes only): e.g. { 'X-Disk-Cache': '1' } asks the server to cache the reply. */
export function llmFetch(body, key, { timeoutMs, extraHeaders = {} } = {}) {
  if (mode === 'static') {
    return globalThis.fetch(OPENROUTER_URL, { method: 'POST', headers: directHeaders(key), body: JSON.stringify({ ...pick(body, LLM_FIELDS), usage: { include: true } }), signal: timeout(timeoutMs) });
  }
  return globalThis.fetch(apiUrl('api/llm'), { method: 'POST', headers: serverHeaders(key, extraHeaders), body: JSON.stringify(body), signal: timeout(timeoutMs ?? 180_000) });
}

/** Jev typed decisions. */
export function decideFetch(body, key, { timeoutMs } = {}) {
  if (mode === 'static') {
    return globalThis.fetch(DECISIONS_URL, { method: 'POST', headers: directHeaders(key), body: JSON.stringify(pick(body, DECIDE_FIELDS)), signal: timeout(timeoutMs) });
  }
  return globalThis.fetch(apiUrl('api/decide'), { method: 'POST', headers: serverHeaders(key), body: JSON.stringify(body), signal: timeout(timeoutMs ?? 180_000) });
}

/**
 * Check a key without spending much. Static: OpenRouter's key-info endpoint (free). Server: a 1-token completion via the proxy.
 * → { status: 'none' | 'valid' | 'invalid' | 'error', detail, info }
 */
export async function testKey(key, { model = 'openai/gpt-4o-mini', direct = mode === 'static' } = {}) {
  if (!key && (direct || !sendKey)) return { status: 'none', detail: 'No key entered. The game runs on offline deterministic judges.' };
  try {
    if (direct || !sendKey) { // own key straight to OpenRouter's free key-info endpoint (never via the hosted proxy)
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
