// Static-mode niche research (no server worker, e.g. GitHub Pages): the same web-grounded call niche-server.js makes,
// run from this browser with the player's own key. Deliberately small: a queue with the server's budgets (2 at a time,
// a rolling hourly cap, 3 attempts with backoff on network/rate-limit/server errors). In the browser the queue and the
// hourly budget are persisted (IndexedDB 'kv'), so a reload resumes queued and interrupted items instead of losing them;
// finished dossiers go into the niche cache (IndexedDB).
// Same answers as the server API: request() → { status: queued|running|done|failed }, status(key) → also 'unknown'.

import { disguise } from './niche-disguise.js';
import { RESEARCH_SYSTEM, researchPrompt, normalizeDossier } from './niche-research.js';
import { getSettings } from './llm.js';
import { llmFetch } from './transport.js';
import { nicheCache } from './niche-cache.js';
import { LLM, webPlugin } from './params.js';
import { getKv, putKv } from './store.js';

export const clientDefaults = () => ({ maxConcurrent: 2, maxPerHour: 12, maxTokens: 6000, webResults: 8, maxAttempts: 3, backoffMs: 30_000, now: () => Date.now() });

/** IndexedDB persistence for the shared browser client: { load() → { queue, calls } | null, save(snapshot) }. */
export const idbPersist = { load: () => getKv('niche-queue'), save: (snap) => putKv('niche-queue', snap) };

// Same contract as the server worker (niche-server.js): only a JSON OBJECT is a dossier. `null`, a string or an array
// used to crash on raw.citations (a TypeError, so the paid call was marked failed with a confusing error).
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
export function parseJson(text) {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { const v = JSON.parse(t); if (isObj(v)) return v; } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { const v = JSON.parse(m[0]); if (isObj(v)) return v; }
  throw new Error('Model did not return a JSON object');
}

export function createResearchClient({ cache = nicheCache, fetchImpl = null, config = clientDefaults(), key = () => getSettings().apiKey, persist = null } = {}) {
  config = { ...clientDefaults(), ...config };
  const items = new Map(); // nicheKey -> { status, error, waiters }
  const calls = []; // start times (rolling hour)
  const queue = [];
  let running = 0;

  const view = (k, it) => ({ key: k, status: it.status, ...(it.error ? { error: it.error } : {}) });
  const bodies = new Map(); // nicheKey -> request body, for every item not yet done/failed (what gets persisted)
  const save = () => { if (persist) Promise.resolve(persist.save({ queue: [...bodies].map(([k, body]) => ({ k, body, attempts: items.get(k)?.attempts ?? 0 })), calls: calls.slice() })).catch(() => {}); };
  // Resume what a previous page load left behind: interrupted 'running' items go back in the queue.
  const restored = persist ? Promise.resolve().then(() => persist.load()).then((snap) => {
    for (const t of snap?.calls ?? []) if (config.now() - t < 3_600_000) calls.push(t);
    for (const { k, body, attempts = 0 } of snap?.queue ?? []) {
      if (items.has(k)) continue;
      items.set(k, { status: 'queued', attempts }); bodies.set(k, body); queue.push({ k, body });
    }
    pump();
  }).catch(() => {}) : Promise.resolve();

  async function run(k, body) {
    const it = items.get(k);
    it.status = 'running';
    try {
      const req = {
        model: body.model || LLM.defaultModels[0], temperature: 0.2, max_tokens: config.maxTokens, reasoning: { enabled: false },
        plugins: [webPlugin('research', config.webResults)],
        messages: [{ role: 'system', content: RESEARCH_SYSTEM }, { role: 'user', content: researchPrompt(body) }],
        response_format: { type: 'json_object' },
      };
      let res;
      try { res = await (fetchImpl ? fetchImpl(req, key()) : llmFetch(req, key(), { timeoutMs: 180_000 })); } catch (e) { throw Object.assign(new Error(`network: ${e.message}`), { retry: true }); }
      const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || json.error) throw Object.assign(new Error(json.error?.message ?? json.error ?? `HTTP ${res.status}`), { retry: res.status === 429 || res.status >= 500 });
      const msg = json.choices?.[0]?.message ?? {};
      const raw = parseJson(msg.content);
      raw.citations = [...(Array.isArray(raw.citations) ? raw.citations : []), ...(Array.isArray(msg.annotations) ? msg.annotations : []).filter((a) => a?.type === 'url_citation').map((a) => ({ url: a.url_citation?.url, title: a.url_citation?.title }))];
      const dossier = Object.assign(disguise(normalizeDossier(raw), { seedKey: k }), { source: 'research', researchedLevel: body.depth, key: k });
      await cache.put(k, dossier, { server: false });
      it.status = 'done'; it.error = null; bodies.delete(k);
    } catch (e) {
      it.attempts = (it.attempts ?? 0) + 1;
      it.error = String(e.message).slice(0, 200);
      if (e.retry && it.attempts < config.maxAttempts) { // same backoff as the server worker: 30s, 60s
        it.status = 'queued';
        setTimeout(() => { queue.push({ k, body }); pump(); }, config.backoffMs * 2 ** (it.attempts - 1));
      } else { it.status = 'failed'; bodies.delete(k); } // core/niche.js retries after its own (game-day) backoff
    }
    save();
  }

  function pump() {
    const now = config.now();
    while (calls.length && now - calls[0] >= 3_600_000) calls.shift();
    while (queue.length && running < config.maxConcurrent && calls.length < config.maxPerHour) {
      const { k, body } = queue.shift();
      calls.push(now); running++;
      run(k, body).finally(() => { running--; pump(); });
    }
    save();
  }

  return {
    async request(body = {}) {
      await restored;
      const k = body.key;
      if (!k) return { status: 'failed', error: 'Bad key' };
      if (await cache.get(k)) return { key: k, status: 'done' };
      const it = items.get(k);
      if (it && it.status !== 'failed') return view(k, it);
      if (!key()) return { key: k, status: 'failed', error: 'no-key' };
      items.set(k, { status: 'queued', attempts: 0 });
      const b = { nodePath: (body.nodePath ?? []).slice(0, 8).map((x) => String(x).slice(0, 120)), depth: Math.max(1, Math.min(6, Math.floor(Number(body.depth)) || 1)), seedFacts: body.seedFacts ?? null, model: body.model ?? null };
      bodies.set(k, b); queue.push({ k, body: b });
      pump();
      return view(k, items.get(k));
    },
    async status(k) {
      await restored;
      const hit = await cache.get(k);
      if (hit) return { key: k, status: 'done', dossier: hit.dossier };
      const it = items.get(k);
      return it ? view(k, it) : { key: k, status: 'unknown' };
    },
    /** Resolve once nothing is queued or running (tests). */
    async idle() { await restored; while (running || queue.length) await new Promise((r) => setTimeout(r, 5)); },
  };
}

let shared = null;
export const browserResearch = () => (shared ??= createResearchClient({ persist: typeof indexedDB !== 'undefined' ? idbPersist : null }));
