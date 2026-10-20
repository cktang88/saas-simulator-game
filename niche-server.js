// Server side of the fractal-niche engine (wired into server.js):
//   - a tiny JSON disk cache (GET/PUT /api/cache/:key) under data/cache/niches/
//   - a persistent research queue with a background worker (POST /api/research, GET /api/research/:key)
// The worker asks the model with the web plugin, normalises the answer, applies the deterministic disguise pass
// (public/core/niche-disguise.js), writes the dossier into the disk cache and marks the item done.
// API keys are only ever held in memory (never written to queue.json). Design: docs/design/fractal-niches.md.

import { mkdir, readFile, writeFile, rename, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { disguise } from './public/core/niche-disguise.js';
import { RESEARCH_SYSTEM, researchPrompt, normalizeDossier } from './public/core/niche-research.js';
import { LLM, webPlugin } from './public/core/params.js';

export const MAX_ENTRY_BYTES = 256 * 1024;
export const isHexKey = (k) => typeof k === 'string' && /^[0-9a-f]{8,64}$/.test(k);

export const defaults = () => ({
  cacheDir: null, // set by server.js (env NICHE_CACHE_DIR or data/cache/niches)
  fetch: null, // mock hook: (url, init) => Response-like; default global fetch
  now: () => Date.now(),
  openrouterUrl: 'https://openrouter.ai/api/v1/chat/completions',
  research: { enabled: true, maxConcurrent: 2, maxPerHour: 30, maxAttempts: 3, backoffMs: 30_000, tickMs: 1000, maxQueue: 200, maxTokens: 6000, webResults: 8, model: process.env.NICHE_RESEARCH_MODEL || null },
});

let tmpN = 0;
const atomicWrite = async (file, text) => { const tmp = `${file}.${process.pid}.${tmpN++}.tmp`; await writeFile(tmp, text); await rename(tmp, file); };

export class NicheServer {
  constructor(config = defaults()) {
    this.config = config;
    this.queue = { items: {}, calls: [] }; // calls: epoch ms of started research calls (rolling hour)
    this.keys = new Map(); // item key -> API key, memory only
    this.running = new Set();
    this.loaded = null;
    this.timer = null;
  }

  dir() { return this.config.cacheDir; }
  file(key) { return join(this.dir(), `${key}.json`); }

  // ---------------------------------------------------------------- disk cache
  async cacheGet(key) {
    if (!isHexKey(key)) throw Object.assign(new Error('Bad cache key'), { status: 400 });
    try { return JSON.parse(await readFile(this.file(key), 'utf8')); } catch { return null; }
  }
  async cachePut(key, value) {
    if (!isHexKey(key)) throw Object.assign(new Error('Bad cache key'), { status: 400 });
    const text = JSON.stringify(value);
    if (value == null || typeof value !== 'object') throw Object.assign(new Error('Cache entries must be JSON objects'), { status: 400 });
    if (Buffer.byteLength(text) > MAX_ENTRY_BYTES) throw Object.assign(new Error('Cache entry too large'), { status: 413 });
    await mkdir(this.dir(), { recursive: true });
    await atomicWrite(this.file(key), text);
  }

  // ---------------------------------------------------------------- queue persistence
  async load() {
    // A corrupt queue.json (items null, an array, junk entries) must not wedge the worker: coerce it, and never cache a
    // rejected load (every later request would fail until a restart).
    this.loaded ??= (async () => {
      let q = null;
      try { q = JSON.parse(await readFile(join(this.dir(), 'queue.json'), 'utf8')); } catch { /* fresh */ }
      const obj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
      const items = obj(q?.items) ? Object.fromEntries(Object.entries(q.items).filter(([k, it]) => isHexKey(k) && obj(it) && it.key === k)) : {};
      this.queue = { items, calls: Array.isArray(q?.calls) ? q.calls.filter(Number.isFinite) : [] };
      for (const it of Object.values(this.queue.items)) if (it.status === 'running') it.status = 'queued'; // interrupted by a restart
    })().catch((e) => { this.loaded = null; throw e; });
    return this.loaded;
  }
  save() { // serialised so concurrent workers never interleave writes
    this._saving = (this._saving ?? Promise.resolve()).catch(() => {}).then(() => this.writeQueue());
    return this._saving;
  }
  async writeQueue() {
    await mkdir(this.dir(), { recursive: true });
    const now = this.config.now();
    // Drop finished items after an hour and cap the queue size.
    for (const [k, it] of Object.entries(this.queue.items)) if ((it.status === 'done' || it.status === 'failed') && now - it.updatedAt > 3_600_000) delete this.queue.items[k];
    this.queue.calls = this.queue.calls.filter((t) => now - t < 3_600_000);
    await atomicWrite(join(this.dir(), 'queue.json'), JSON.stringify(this.queue));
  }

  envKey() { return process.env.OPENROUTER_API_KEY || null; }
  keyFor(key) { return this.keys.get(key) || this.envKey(); }
  view(it, extra = {}) {
    const waiting = it.status === 'queued' && !this.keyFor(it.key) ? 'no-key' : null;
    return { key: it.key, status: it.status, attempts: it.attempts, error: it.error ?? null, depth: it.depth, ...(waiting ? { waiting } : {}), ...extra };
  }

  // ---------------------------------------------------------------- API
  /** Idempotent enqueue. → { status: queued|running|done|failed, ... } */
  async request({ key, nodePath = [], depth = 1, seedFacts = null, model = null, retry = false }, apiKey = null) {
    await this.load();
    if (!isHexKey(key)) throw Object.assign(new Error('Bad key'), { status: 400 });
    if (!Array.isArray(nodePath) || nodePath.length > 8) throw Object.assign(new Error('Bad nodePath'), { status: 400 });
    depth = Math.max(1, Math.min(6, Math.floor(Number(depth)) || 1));
    if (await this.cacheGet(key)) return { key, status: 'done' };
    let it = this.queue.items[key];
    // API keys are held only for items that will run: a live item (a resumed client hands its key back), or a new one
    // that passed every check. Refused or failed requests never leave a key behind in memory.
    if (it && it.status !== 'failed') { if (apiKey) this.keys.set(key, apiKey); return this.view(it); }
    if (it && it.status === 'failed' && !retry) return this.view(it);
    if (!this.config.research.enabled) return { key, status: 'failed', error: 'research disabled' };
    if (!(apiKey || this.keyFor(key))) return { key, status: 'failed', error: 'no-key' };
    if (Object.values(this.queue.items).filter((x) => x.status === 'queued' || x.status === 'running').length >= this.config.research.maxQueue) return { key, status: 'failed', error: 'queue full' };
    if (apiKey) this.keys.set(key, apiKey);
    const labels = nodePath.map((p) => String(typeof p === 'string' ? p : p?.label ?? '').slice(0, 120)).filter(Boolean);
    it = this.queue.items[key] = {
      key, nodePath: labels, depth, seedFacts: seedFacts && JSON.stringify(seedFacts).length <= 4000 ? seedFacts : null,
      model: typeof model === 'string' && model.length < 100 ? model : null,
      status: 'queued', attempts: 0, nextAt: 0, createdAt: this.config.now(), updatedAt: this.config.now(),
    };
    await this.save();
    this.start();
    return this.view(it);
  }

  async status(key) {
    await this.load();
    if (!isHexKey(key)) throw Object.assign(new Error('Bad key'), { status: 400 });
    const dossier = await this.cacheGet(key);
    if (dossier) return { key, status: 'done', dossier };
    const it = this.queue.items[key];
    return it ? this.view(it) : { key, status: 'unknown' };
  }

  // ---------------------------------------------------------------- worker
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((e) => console.warn('[niche] tick failed', e.message)), this.config.research.tickMs);
    this.timer.unref?.();
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  /** Start as many due items as the budgets allow. Returns the started item keys (for tests). */
  async tick() {
    await this.load();
    const R = this.config.research;
    if (!R.enabled) return [];
    const started = [];
    const now = this.config.now();
    this.queue.calls = this.queue.calls.filter((t) => now - t < 3_600_000);
    const due = Object.values(this.queue.items).filter((it) => it.status === 'queued' && it.nextAt <= now).sort((a, b) => a.createdAt - b.createdAt);
    for (const it of due) {
      if (this.running.size >= R.maxConcurrent || this.queue.calls.length >= R.maxPerHour) break;
      if (!this.keyFor(it.key)) continue; // waits for a key (a client sends one, or the server env has one)
      it.status = 'running'; it.updatedAt = now;
      this.queue.calls.push(now);
      this.running.add(it.key);
      started.push(it.key);
      this.run(it).finally(() => this.running.delete(it.key));
    }
    if (started.length) await this.save();
    return started;
  }

  /** Resolve when nothing is running (tests). */
  async idle() { while (this.running.size) await new Promise((r) => setTimeout(r, 10)); }

  async run(it) {
    const R = this.config.research;
    try {
      const model = it.model || R.model || LLM.defaultModels[0];
      const body = {
        model, temperature: 0.2, max_tokens: R.maxTokens, reasoning: { enabled: false }, usage: { include: true },
        plugins: [webPlugin('research', R.webResults)],
        messages: [{ role: 'system', content: RESEARCH_SYSTEM }, { role: 'user', content: researchPrompt({ nodePath: it.nodePath, depth: it.depth, seedFacts: it.seedFacts }) }],
        response_format: { type: 'json_object' }, // strict json_schema exceeds the provider's grammar limit; shape is in the prompt
      };
      const f = this.config.fetch ?? fetch;
      const res = await f(this.config.openrouterUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.keyFor(it.key)}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'http://localhost', 'X-Title': 'SaaS Founder Simulator' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(180_000),
      });
      const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || json.error) {
        const e = json.error;
        console.warn('[niche] provider error', JSON.stringify({ status: res.status, model, message: e?.message ?? e ?? null, code: e?.code ?? null, raw: e?.metadata?.raw ?? null, provider: e?.metadata?.provider_name ?? null }).slice(0, 2000));
      }
      if (!res.ok || json.error) throw new Error(json.error?.message ?? json.error ?? `HTTP ${res.status}`);
      const msg = json.choices?.[0]?.message ?? {};
      const raw = parseJson(msg.content);
      const cites = (msg.annotations ?? []).filter((a) => a.type === 'url_citation').map((a) => ({ url: a.url_citation?.url, title: a.url_citation?.title }));
      raw.citations = [...(Array.isArray(raw.citations) ? raw.citations : []), ...cites];
      const dossier = disguise(normalizeDossier(raw), { seedKey: it.key });
      dossier.source = 'research';
      dossier.researchedLevel = it.depth;
      dossier.key = it.key;
      await this.cachePut(it.key, dossier);
      it.status = 'done'; it.usd = json.usage?.cost ?? 0; it.error = null;
      if (!this.keys.has(it.key)) this.config.onSpend?.(it.usd); // the operator's env key paid (not a player's own key)
    } catch (e) {
      it.attempts++;
      it.error = String(e.message).slice(0, 200);
      if (it.attempts >= this.config.research.maxAttempts) it.status = 'failed';
      else { it.status = 'queued'; it.nextAt = this.config.now() + this.config.research.backoffMs * 2 ** (it.attempts - 1); }
    }
    it.updatedAt = this.config.now();
    if (it.status === 'done' || it.status === 'failed') this.keys.delete(it.key);
    await this.save().catch(() => {});
  }
}

// A dossier must be a JSON object: `null`, a bare string or an array would crash the normaliser (and burn retries).
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
function parseJson(text) {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { const v = JSON.parse(t); if (isObj(v)) return v; } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { const v = JSON.parse(m[0]); if (isObj(v)) return v; }
  throw new Error('Model did not return a JSON object');
}

export async function cacheStats(dir) {
  try { const files = await readdir(dir); let bytes = 0; for (const f of files) bytes += (await stat(join(dir, f))).size; return { files: files.length, bytes }; } catch { return { files: 0, bytes: 0 }; }
}
