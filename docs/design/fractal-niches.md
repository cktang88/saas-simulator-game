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
3. Server worker (`niche-server.js`): persistent queue `data/cache/niches/queue.json`, up to 2 concurrent calls and 30 per hour, 3 attempts with exponential backoff (30 s, 60 s...), resumes queued items after a restart. One OpenRouter call with the web plugin and `json_object` mode with the compact shape in the prompt (a strict json_schema is rejected by the provider: "compiled grammar is too large"), `normalizeDossier`, **disguise**, write `<key>.json`. API keys come from `OPENROUTER_API_KEY` or the `X-OpenRouter-Key` header of the request, are kept in memory only and never written to disk. Without any key a request is refused (`failed: no-key`) and a resumed item waits.
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

## Integration: outbound prospecting and sales personas

- **Prospector** (`apps/sales/prospector.js`): new free-text filter `niche` ("Niche / keywords") resolves with `nicheFor(state, text, {source:'prospector'})` (memoised per text, so re-renders do not inflate hits). Level-1 text keeps the old universe filtered to the segment; unfiltered search is unchanged; unmatched text falls back to a keyword filter and creates no node. Deeper nodes (or sub-segments) get a lazy sub-universe (`nicheUniverse`): companies = segment universe count x `shareOfSegment` (min 1, never padded). Archetype/size band, region, tools (a tool node forces that tool), titles, vocabulary and workflow come from `dossierOf`. Seeds do not depend on the dossier, so names/domains/ids are stable. Pages of 25 companies are cached; when a researched dossier arrives, only pages with no revealed row regenerate with it.
- **Saved contacts** carry `nicheId` (contact, company, `company.prospect`); the synthetic site copies dossier vocabulary/tools/workflow at save time and is never rewritten. `personForContact` calls `drawPerson({segmentId: rootId, nicheId})`.
- **Fit**: `scoreRow` adds +0.10 when the company's niche is (or is below) the deepest existing node the ICP text names, -0.15 for a sibling pocket of the same segment, 0 for a broader niche or no ICP niche (`row.nicheAdj`).
- **Prompts**: `nicheBriefOf(state, nicheId)` (truth-persona.js) builds a <= 600 char brief (words, tools, workflow, communities, objections; money and percentages scrubbed, no spend/WTP/share). `personBlock`/`prospectSystemPrompt` accept `nicheBrief`; `jobs.js` passes it for niche contacts.
- Tests: `test/niche-prospects.test.js`.

## Integration: recruiting, ads, communities, agencies

Shared helpers: `public/apps/growth/nicheUse.js` (`resolveNiche`, `nichePopulation`, `communitySuggestions`, `communityFit`, `audienceMods`, `messageRelevance`, `nicheBrief`). Agency engine: `public/apps/channels/agencies.js`, UI `channels/agencyPanel.js` (Organic > Find an agency). Test: `test/niche-integration.test.js`.

- **Recruiting** (`research/recruit.js`, `research/sim.js`). The target text goes through `nicheFor(source:'recruit')` when a batch really goes out (previews only read existing nodes). Responders in the target's segment are in-niche with probability 0.62 + 0.07 per level below the segment [design]; a person is drawn with `drawPerson({nicheId})` from the niche or one of its existing children (weighted by child share, own random stream so the base draw sequence is untouched). Narrower niche: smaller reachable pool (`nichePopulation` x 2 roles per company, each channel reaches only a share of it), reply x (1 - 0.35 x hardness), leak -8% per level, panel targeting fee up to 3x, no-shows up to +50%, and every send burns the pool (`recruit.nicheUsed`): once most of a small niche is contacted replies collapse and the plan warns. Interviewees speak the dossier incident/workaround/title; `chatPerson` folds a short brief (tools, vocabulary) into the existing `role` line, so `persona-prompts.js` needed no change.
- **Ads** (`growth/adsEngine.js`, `delivery.js`, `ads.js`). On interests / job-title audiences the targeting text creates `audience.nicheId`. Size = pool for that audience type x `shareOfSegment` (floor 300). CPM +15% per level (B2B; +6% B2C) and up to x1.5 more for pools under 10k; CTR/CVR follow the niche's pain x intensity (and WTP) against its segment; each ad's copy gets x0.9-1.15 CTR and x0.8-1.25 CVR from how many niche terms (vocabulary, tools, titles, qualifiers; max 3 distinct) it uses. Small pools cap spend at ~1.5 impressions/person/day, so budget goes unspent, learning events starve and the learning phase never exits. Pools (frequency, overlap) are keyed by type + niche.
- **Communities** (`growth/organicEngine.js communityPost`, `organic.js`). Suggestions are the `communities` of the ICP niche dossier and its parents (deepest first), offered as a datalist. A listed community uses the dossier-derived size (by kind and depth); relevance = judged relevance x (0.3 + 0.7 x fit), fit 0.72-1 for listed, 0.35 for broad generic rooms, 0.2 for a different segment, 0.4 otherwise. Posts store `fit`, `fitWhy`, `listed`.
- **Agencies and vendors** (recruiting, marketing, PR, dev, consulting, data/list). `searchAgencies({query, kind})` resolves the query to a node (`source:'agency'`; deeper text creates deeper nodes that research their own `agencies`), then builds a fixed roster per (node, kind) with the dossier's disguised agency and price range: tiers great 10%, good 15%, average 25%, mediocre 38%, scam 12% [design]; specialists (know the exact niche, fit 1.0, +25% price) get rarer with depth, verticals 0.82, generalists 0.6. Quality is hidden in `state.agencyBook.hidden`. Reveal: `checkReferences` (firm-picked, +0.08 flattering, fake refs from scams), `checkReferences({backchannel:true})` (unbiased), `runTrial` (paid, narrowest). `engage` pays the up-front share (scams ask 60-100%), records effectiveness = quality x fit x brief and returns `lessons`; scams ghost after 18-38 days (retainers keep billing until cancelled), poor work is revealed at day 45 and logged as a mistake, early exit before the minimum costs 50% of the remainder. `outcomeOf` gives kind-specific results; `asSourcingAgency` adapts a recruiter engagement to `people/candidates.js makeCandidate`.

## Disguise hardening: re-identification guard

Aliasing company names alone left the real company recognisable ("Carrollton-based ... 180+ locations", "Brentwood Associates-backed", "moved to Denticon in April 2026"). `core/niche-disguise.js` now also scrubs the attributes that identify an entity wherever an alias appears (same sentence; the whole note for example companies and agency pricing). Market-level sentences with no aliased entity are left untouched.

- **Scrubbed next to an alias:** HQ town (state and region stay: "headquartered in Texas", "regional"), investor / PE / parent names ("a PE firm", "a growth-equity investor", "a larger operator"), exact location / employee / customer counts bucketed into ranges (180+ locations becomes "100-250 locations"; edges 5, 10, 25, 50, 100, 250, 500, 1k, 2.5k ...), exact months, quarters and dates ("recently", "some years ago"), award and ranking names, product launch names, website domains. Leftover standalone numbers in those sentences get the seeded fudge factor (one factor per dossier; an agency's price text uses the same factor as its price range).
- **Kept:** real software vendors and tools, public communities, associations, regulators and events (protected from every rule). A sentence that pairs a vendor with a specific customer story ("X migrated to a vendor ...") gets the same attribute scrub, without the number fudge.
- **People:** `scrubPeople` also strips "Dr. X", "X Y, DDS/MD/CPA...", "founder / CEO / founded by X", LinkedIn-style "Name - Title" and "Name, Title", emails, phones, street addresses, PO boxes and state+ZIP.
- **Aliases:** stable per (dossier key, real name), unique, no shared first word inside a dossier ("Clearwater Media" and "Clearwater Creative" cannot both survive), never equal to any name present in the source, and shortened forms of a real name ("Acme Dental" for "Acme Dental Partners LLC") map to the same alias.
- **Prompt:** `RESEARCH_SYSTEM` asks for primary / credible sources first (associations, government and regulator data, vendor pricing pages, industry reports), market-level facts over named-company anecdotes, and no street addresses or person names.
- Heuristics are best effort and deterministic; tests in `test/niche-disguise.test.js` (fabricated dental fixture, runs in under a second).
