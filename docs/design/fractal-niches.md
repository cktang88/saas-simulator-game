# Fractal niches

When the player narrows a search (ICP text, prospect filters, recruit target, ad interests, community names, agency searches) the hidden market lazily grows deeper sub-niches, and each niche gets a **dossier** of realistic detail: first generated offline, then progressively researched with a web-grounded model in the background, disguised, and cached locally.

Layering: `core/niche.js` sits on top of `core/truth.js`. `truthOf`'s signature and the segment ids are unchanged; with no niche nodes everything behaves exactly as before.

## Files

| File | Role |
|---|---|
| `public/core/niche.js` | tree, stats, qualifier extraction, offline dossier, research gating and jobs, hooks into truth |
| `public/core/niche-disguise.js` | shared (browser + server) disguise pass, `nicheHash`, name generator |
| `public/core/niche-research.js` | shared research schema, prompts per depth, `normalizeDossier` |
| `public/core/niche-cache.js` | memory LRU + IndexedDB `niches` store + server cache |
| `niche-server.js` | server: disk cache, persistent research queue, background worker |
| `public/data/niche-seeds.js` | [design] seed ingredients for offline dossiers |

## The tree (state.market.niches)

`nicheFor(state, text, { parentId?, source? })` matches the best truth segment (`segmentMatch`), then extracts qualifiers and descends/creates one child per qualifier in a **fixed order** so word order never matters:

`sub` (sub-industry keyword) > `size` (micro/small/mid/large) > `geo` (US state) or `place` (other place) > `role` > `tool` > `trigger`.

Node id: `base:sub-dental:size-mid:geo-texas:tool-dentrix` (recursive, appended to the truth segment id, which may itself be `health_practices:multi`). Level 1 is the segment, up to level 7. A node stores only `{ id, parentId, rootId, level, dim, value, label, cell, share, m (multipliers), hits, firstDay, lastDay, source, research }` (about 400 bytes). Max 200 nodes per save; least-recently-used leaves without research are pruned.

**Stats.** `statsFor(state, id)` = parent stats x the node's multipliers `m`, computed from the CURRENT truth (so pivots/re-draws flow through; nothing is frozen in the tree). Fields: `painPrevalence, intensity, wtpMonthly, reach, retentionMult, idiosyncrasy`, plus `share` (of the market) and `shareOfSegment`.

**Consistency.** Each split of a node along a dimension is a *partition* (`partition()`/`splitStats()`): geo uses the 50 states with population weights, size uses 4 bands, other dimensions use 6 hashed slots with random shares. Cell multipliers are drawn per split from a stream keyed by (market seed, parentId, dim), centred so the share-weighted mean of every multiplier is exactly 1: **the weighted children average back to the parent**. Jitter is at most +-25% (pain, intensity, WTP, reach), +-15% retention, +-20% idiosyncrasy. With probability 0.35 a split has one clearly better ("hair on fire") and one clearly worse cell. WTP also follows the size band (micro 0.7x ... large 2.3x, renormalised). Clamps (e.g. prevalence <= 0.95) can shave the average when the parent is near a bound. Values that hash to the same slot share stats (documented approximation).

**Truth hooks** (`truth.js` `nicheHooks`, registered when `niche.js` is imported):
- `drawPerson(state, { nicheId })`: uses the node stats and speaks dossier incidents/titles/tools (via a separate stream, so the base draw sequence is unchanged). Result has `nicheId`; `segmentId` stays the truth segment id.
- `icpFocus`: if the ICP text resolves to an EXISTING deeper node, that node's stats replace its segment's in strength/retention/wtp and `breadth` shrinks by `shareOfSegment`. It never creates nodes. The cache key includes the tree revision.

Operator quality: narrowing into the best pocket (`strength` up, small breadth), staying broad, and picking the worst pocket separate in `icpFocus` (tested). A wrong narrow pick costs reachable market; nothing is free.

## API for integration builders

```js
import { nicheFor, pathOf, statsFor, dossierOf, loadDossier, warmNiches, nicheKey, pumpResearch, nicheSummary } from '../core/niche.js';
```

- `nicheFor(state, text, { parentId, source })` -> deepest node or `null`. Bumps `hits` along the chain and calls `pumpResearch`. Call it whenever the player types/chooses a niche: ICP text, prospect filter string ("dental, Texas, Dentrix"), recruit target, ad interest, community name, agency query. `source`: `'icp'|'prospector'|'interview'|'ads'|'community'|'recruit'|'agency'`.
- `pathOf(state, id)` -> nodes root..node. `getNode`, `childrenOf`, `nicheSummary(state)`.
- `statsFor(state, id)` -> `{ rootId, level, share, shareOfSegment, stats }`. Pass `nicheId` to `drawPerson`.
- `dossierOf(state, id)` (sync): researched dossier if it is in the memory cache, else the offline one (always available). `await loadDossier(state, id)` pulls from IndexedDB/server first. Call `await warmNiches(state)` once after loading a save.
- `nicheKey(state, id)` -> 16 hex chars: hash of (root id + qualifier path + researcher model + idea category). **Not** the save id, so saves share dossiers.
- `offlineDossier(state, id)`, `mergeDossier`, `extractQualifiers(text, seg)`, `partition`, `splitStats`, `deepestExisting`.
- Research: `pumpResearch(state)` (also called by `nicheFor`) queues `niche:research` jobs; `niche:poll` runs daily until done. `main.js` imports `core/niche.js`, so handlers are registered. Tunables: `nicheConfig` (`research.maxLevel`, `minHits`, `maxPerDay`, `maxInFlight`, `retryAfterDays`, `live`, `fetch`, `cache`).
- The LLM helper: `ask({ ..., web: true, diskCache: true })` caches grounded calls on the server disk cache (`data/cache/niches/`) in addition to `state.cache`.

### Dossier schema (plain JSON, ~7 KB)

`description`; `archetypes[{name,sizeBand,employees{lo,hi},revenueUsd{lo,hi},countInRegion{lo,hi},note}]`; `exampleCompanies[{name,note}]` (disguised); `roles[{title,cares[],role?}]`; `workflows[]`; `tools[{name,category}]` (real vendors OK); `vocabulary[]`; `painTriggers[]`; `incidents[]` (anonymised); `spend{problemUsdPerMonth,softwareUsdPerMonth,budgetNorm}`; `buying{process,signers[],cycleDays}`; `communities[{name,kind,url}]` (real public communities OK); `objections[]`; `seasonality`; `agencies[{name (disguised),kind: marketing|recruiting|dev|pr|consulting|other,pricing,priceUsd{lo,hi},unit}]`; `citations[{url,title}]`; `fudge` (note); plus `source: 'offline'|'research'`, `researchedLevel`, `disguised`, `key`. Numbers are ranges `{lo,hi}`. Offline numbers are [design]; never present them as statistics.

## Research flow

1. `nicheFor` -> `pumpResearch`. A node is researched only if: the engine is live (`isLive()`), `level <= research.maxLevel` (4), `hits >= minHits[level-1]` (1,1,2,2: the player really narrowed into it), its parent is already researched (a segment has no parent), it is not pending/done, and the budgets allow (3 new calls per game day, 2 in flight). A failed node is retried after 5 game days, at most 3 attempts. Offline: nothing is ever queued.
2. Job `niche:research`: client cache (memory > IndexedDB > server disk cache) first. Only on a miss does it `POST /api/research { key, nodePath, depth, seedFacts, model }` (seedFacts = the parent's dossier summary; depth sets the question set: level 1 overview, level 2 workflows/jargon/incidents/spend, level 3+ specific incidents, local conditions, agencies and prices).
3. Server worker (`niche-server.js`): persistent queue `data/cache/niches/queue.json`, up to 2 concurrent calls and 30 per hour, 3 attempts with exponential backoff (30 s, 60 s...), resumes queued items after a restart. One OpenRouter call with the web plugin and strict JSON schema, `normalizeDossier`, **disguise**, write `<key>.json`. API keys come from `OPENROUTER_API_KEY` or the `X-OpenRouter-Key` header of the request, are kept in memory only and never written to disk. Without any key a request is refused (`failed: no-key`) and a resumed item waits.
4. `GET /api/research/:key` -> `queued|running|done|failed|unknown` (+ `dossier` when done). The `niche:poll` job checks daily, copies the dossier into IndexedDB (`niches` store) and marks the node `research.status = 'done'`.

`POST /api/research` is idempotent: a cached niche answers `done` immediately; an existing queued/running item is returned unchanged.

## Disguise rules (`niche-disguise.js`, deterministic in the key)

- Real company names in `exampleCompanies`, `agencies` and any "Name Inc/LLC/Group/Partners" in free text become generated names (same alias everywhere in one dossier). **Kept:** well-known software vendors (`tools`, `KEEP_VENDORS`) and public communities/associations/events/newsletters (`communities`).
- Every numeric range is multiplied by one seeded factor in [0.8, 1.25] and rounded (2 significant digits above 1000); both ends use the same factor.
- Emails, phone numbers, titled names ("Dr. X"), first-name + surname pairs and "<name> said" are stripped from free text. The model is also told never to name individuals.
- Citations are kept untouched for transparency. The dossier carries a `fudge` note.

## Caching layers

1. In-memory LRU (64 entries / 1.5M chars).
2. IndexedDB `niches` store (DB version 2; the upgrade creates only missing stores, so `state` and `files` survive).
3. Server disk cache `GET/PUT /api/cache/:key`: keys are 8-64 lowercase hex chars (anything else 400, so no path traversal), entries are JSON objects up to 256 KB (413 above), stored in `data/cache/niches/` (gitignored; override with `NICHE_CACHE_DIR`). `ask({ diskCache: true })` uses the same endpoint for any expensive grounded call.
4. `state.cache` (LLM results, part of the save) is now bounded: at most 400 entries, 40 KB per entry, about 1.5 MB total; recency ordered (hit refreshes), oldest evicted first. Dossiers are never in state.

## Budgets (defaults)

Client: 3 new research calls per game day, 2 in flight, depth <= 4. Server: 2 concurrent, 30 per rolling hour, 200 queued, 6000 max tokens, 3 attempts. Roughly $0.02 per web-grounded call on top of tokens, so a heavy game costs well under a dollar and a repeated niche costs nothing.

## Testing

`test/niche.test.js` (seconds, no live calls): determinism and nesting; truth untouched; averaging and bounded jitter; tier separation; dossier for every node; disguise; cache layers with a mock IndexedDB adapter; the real `server.js` on a free port with a temp cache dir and mocked OpenRouter (queue, disguise, cache, poll, retries, budgets, restart resume, bad/oversize keys); client job not queued offline and once per node online.
