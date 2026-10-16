// Local caching of niche dossiers, three layers (all keyed by nicheKey, a hex string that does NOT depend on the save):
//   1. memory  - size-bounded LRU (this tab only; sync reads)
//   2. IndexedDB 'niches' store (core/store.js) - shared by every save in this browser
//   3. server disk cache GET/PUT /api/cache/:key (data/cache/niches/) - shared by every browser on this machine
// Reads go memory -> IndexedDB -> server and promote on a hit. Dossier bodies never live in the game state.
// The IndexedDB adapter and fetch are injectable so tests run without a browser.

import * as store from './store.js';
import { apiBase } from './llm.js';

export class LRU {
  constructor({ maxEntries = 64, maxChars = 1_500_000 } = {}) { this.maxEntries = maxEntries; this.maxChars = maxChars; this.map = new Map(); this.chars = 0; }
  get(k) { if (!this.map.has(k)) return undefined; const e = this.map.get(k); this.map.delete(k); this.map.set(k, e); return e.v; }
  has(k) { return this.map.has(k); }
  set(k, v) {
    const size = JSON.stringify(v).length;
    if (this.map.has(k)) { this.chars -= this.map.get(k).size; this.map.delete(k); }
    this.map.set(k, { v, size }); this.chars += size;
    while (this.map.size > this.maxEntries || (this.chars > this.maxChars && this.map.size > 1)) {
      const [old, e] = this.map.entries().next().value;
      this.map.delete(old); this.chars -= e.size;
    }
  }
  delete(k) { const e = this.map.get(k); if (e) { this.chars -= e.size; this.map.delete(k); } }
  clear() { this.map.clear(); this.chars = 0; }
  get size() { return this.map.size; }
}

export const idbAdapter = { get: store.getNiche, put: store.putNiche, delete: store.deleteNiche };

/** createNicheCache({ adapter, fetchImpl, base, lru }) → { get, put, peek, remove, lru } */
export function createNicheCache({ adapter = idbAdapter, fetchImpl = null, base = null, lru = new LRU() } = {}) {
  const f = () => fetchImpl ?? globalThis.fetch;
  const root = () => base ?? apiBase();
  async function fromServer(key) {
    try { const r = await f()(`${root()}/api/cache/${key}`); return r.ok ? await r.json() : null; } catch { return null; }
  }
  async function toServer(key, dossier) {
    try { const r = await f()(`${root()}/api/cache/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dossier) }); return r.ok; } catch { return false; }
  }
  return {
    lru,
    /** Sync read of the memory layer only. */
    peek: (key) => lru.get(key) ?? null,
    /** → { dossier, tier: 'memory'|'idb'|'server' } or null. Promotes hits to the faster layers. */
    async get(key) {
      const m = lru.get(key);
      if (m) return { dossier: m, tier: 'memory' };
      let d = null;
      try { d = (await adapter.get(key)) ?? null; } catch { d = null; }
      if (d) { lru.set(key, d); return { dossier: d, tier: 'idb' }; }
      d = await fromServer(key);
      if (d) { lru.set(key, d); try { await adapter.put(key, d); } catch { /* storage full or unavailable */ } return { dossier: d, tier: 'server' }; }
      return null;
    },
    /** Store in memory + IndexedDB, and (server: true, default) the server disk cache. */
    async put(key, dossier, { server = true } = {}) {
      lru.set(key, dossier);
      try { await adapter.put(key, dossier); } catch { /* ignore */ }
      return server ? toServer(key, dossier) : true;
    },
    async remove(key) { lru.delete(key); try { await adapter.delete?.(key); } catch { /* ignore */ } },
  };
}

/** The shared cache used by the game (IndexedDB + /api/cache). */
export const nicheCache = createNicheCache();
