// Static-mode niche research (no server worker, e.g. GitHub Pages): the same web-grounded call niche-server.js makes,
// run from this browser with the player's own key. Deliberately small: an in-memory queue with the server's budgets
// (2 at a time, a rolling hourly cap). Finished dossiers go into the niche cache (IndexedDB), so they survive reloads;
// an item interrupted by a reload reads as 'unknown' and core/niche.js simply makes it eligible again.
// Same answers as the server API: request() → { status: queued|running|done|failed }, status(key) → also 'unknown'.

import { disguise } from './niche-disguise.js';
import { RESEARCH_SYSTEM, researchPrompt, normalizeDossier } from './niche-research.js';
import { getSettings } from './llm.js';
import { llmFetch } from './transport.js';
import { nicheCache } from './niche-cache.js';
import { LLM } from './params.js';

export const clientDefaults = () => ({ maxConcurrent: 2, maxPerHour: 12, maxTokens: 6000, webResults: 8, now: () => Date.now() });

export function parseJson(text) {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Model did not return JSON');
}

export function createResearchClient({ cache = nicheCache, fetchImpl = null, config = clientDefaults(), key = () => getSettings().apiKey } = {}) {
  const items = new Map(); // nicheKey -> { status, error, waiters }
  const calls = []; // start times (rolling hour)
  const queue = [];
  let running = 0;

  const view = (k, it) => ({ key: k, status: it.status, ...(it.error ? { error: it.error } : {}) });

  async function run(k, body) {
    const it = items.get(k);
    it.status = 'running';
    try {
      const req = {
        model: body.model || LLM.defaultModels[0], temperature: 0.2, max_tokens: config.maxTokens, reasoning: { enabled: false },
        plugins: [{ id: 'web', max_results: config.webResults }],
        messages: [{ role: 'system', content: RESEARCH_SYSTEM }, { role: 'user', content: researchPrompt(body) }],
        response_format: { type: 'json_object' },
      };
      const res = await (fetchImpl ? fetchImpl(req, key()) : llmFetch(req, key(), { timeoutMs: 180_000 }));
      const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || json.error) throw new Error(json.error?.message ?? json.error ?? `HTTP ${res.status}`);
      const msg = json.choices?.[0]?.message ?? {};
      const raw = parseJson(msg.content);
      raw.citations = [...(raw.citations ?? []), ...(msg.annotations ?? []).filter((a) => a.type === 'url_citation').map((a) => ({ url: a.url_citation?.url, title: a.url_citation?.title }))];
      const dossier = Object.assign(disguise(normalizeDossier(raw), { seedKey: k }), { source: 'research', researchedLevel: body.depth, key: k });
      await cache.put(k, dossier, { server: false });
      it.status = 'done'; it.error = null;
    } catch (e) {
      it.status = 'failed'; it.error = String(e.message).slice(0, 200); // core/niche.js retries after its own backoff
    }
  }

  function pump() {
    const now = config.now();
    while (calls.length && now - calls[0] >= 3_600_000) calls.shift();
    while (queue.length && running < config.maxConcurrent && calls.length < config.maxPerHour) {
      const { k, body } = queue.shift();
      calls.push(now); running++;
      run(k, body).finally(() => { running--; pump(); });
    }
  }

  return {
    async request(body = {}) {
      const k = body.key;
      if (!k) return { status: 'failed', error: 'Bad key' };
      if (await cache.get(k)) return { key: k, status: 'done' };
      const it = items.get(k);
      if (it && it.status !== 'failed') return view(k, it);
      if (!key()) return { key: k, status: 'failed', error: 'no-key' };
      items.set(k, { status: 'queued' });
      queue.push({ k, body: { nodePath: (body.nodePath ?? []).slice(0, 8).map((x) => String(x).slice(0, 120)), depth: Math.max(1, Math.min(6, Math.floor(Number(body.depth)) || 1)), seedFacts: body.seedFacts ?? null, model: body.model ?? null } });
      pump();
      return view(k, items.get(k));
    },
    async status(k) {
      const hit = await cache.get(k);
      if (hit) return { key: k, status: 'done', dossier: hit.dossier };
      const it = items.get(k);
      return it ? view(k, it) : { key: k, status: 'unknown' };
    },
    /** Resolve once nothing is queued or running (tests). */
    async idle() { while (running || queue.length) await new Promise((r) => setTimeout(r, 5)); },
  };
}

let shared = null;
export const browserResearch = () => (shared ??= createResearchClient());
