# Advice comes from people, not the dashboard

Player intent: consulting vendors and startup advisors give the helpful tips, instead of tips showing up automatically in the dashboard.

The simulator always knows what a stellar operator would have done (operator reads, `data/operator-tiers.js`). That is hidden truth. The player hears it only from a source they recruited, whose quality they cannot see. Research: `docs/research/early-stage/advisors-consultants.md`. Numbers marked [design] are game assumptions, not statistics.

Code: `public/core/advice.js` (gate, source model, ask), `public/apps/advisors/recruit.js` (recruiting, syncing, office hours), `public/apps/advisors.js` (UI), `public/core/operator.js` (`splitLesson`, `lesson` on mistakes), `public/apps/outcomes.js` (Scorecard). Tests: `test/advice.test.js`.

## Rules for every sweep builder

1. Never render `read.coaching`, a trap `coaching` string, `tierBehaviours`, a mistake `lesson`, a habit `why`, "How this usually ends" or luck odds directly. Pass the true lines through `adviceFor` and render the returned items with their `from` tag.
2. Facts are not advice. Evidence ("3 of 8 investors replied", "mean miss 18%"), costs, dates and what happened stay visible. Prescriptions ("A stellar operator...", "Next time...", "Aim for under 40%") go through the gate.
3. Never show `item.quality`, `item.truth` or `item.biased` to the player. They exist for tests and for tracing. Show `from` and `confidence` (a source's confidence is not evidence; the least informed sound the surest).
4. A mistake's `detail` is factual. Put the prescription in `lesson` (or let `logMistake` split it with `splitLesson`).

## Source model (`state.advice`)

`state.advice = { v, learning, sources[], inbox[], followed[] }`. A source:

| field | meaning |
|---|---|
| `kind` | `advisor`, `consultant`, `fractional`, `mentor`, `board`, `peers`, `ai` |
| `functions` | operator function ids covered (`'*'` = everything, generically). From `EXPERTISE[expertise]` (`gtm`, `growth`, `product`, `pricing`, `fundraising`, `finance`, `legal`, `people`, `ops`, `technical`, `domain`, `board`, `general`) |
| `quality` | HIDDEN: `great`/`good`/`average`/`mediocre`/`bad`. Never render |
| `biases` | `raise` (investors: growth and the next round), `consulting` (more consulting), `peers` (what worked for us), `growth`, `outdated` (a different decade or segment) |
| `access` | `none`/`metrics`/`full`: what they see by default; a question can share less or more (`share`) |
| `hoursPerMonth`, `responseDays` | availability (mentor 1 h, advisor 2 h, board 3 h, consultant = the block bought); answers land `responseDays` later |
| `cost` | `{ equityPct, perMonthUsd, perHourUsd, feeUsd }` |
| `quietAfterDays` | the source stops answering (advisors go quiet; a consultant engagement window of 45 days) |
| `refs` | links: `irAdvisorId`, `listingId`/`engagementId`, `memberId`, `accelId`, `board`, `group` |

Kinds and defaults are in `SOURCE_KINDS`. Hidden quality mixes are [design]: for paid consultants about 1 in 10 great, 38% mediocre and 12% scammy/bad, in line with the agencies roster; fractional execs and mentors are somewhat better; the AI Assistant is always `mediocre` and says so ("Generic best practice (I have no experience with your segment): ...", confidence `low`).

How sources arrive:
- Advisors: `findAdvisors` / `startAdvisorTrial` / `signAdvisorSource(state, id, { level: 'light'|'regular'|'deep', pct?, cliffMonths? })`. Equity 0.1-1% (levels 0.15 / 0.35 / 0.75%), two-year monthly vest, posted to the cap table through `fundraising/ir.js signAdvisor`. Advisors added in Fundraising -> Investor relations appear automatically (`syncSources`).
- Consultants: `findConsultants(state, query)` (agencies.js roster, hidden quality) then `hireConsultant(state, listingId, { hours, brief, topic })`. Quality maps from the engagement's true effectiveness; a scam firm is `bad`.
- Mentors: enrolling in an accelerator creates a mentor source (office hours, 1 h/month). `bookOfficeHours` books a 30-minute calendar meeting; when it is held the source speaks through the gate (`holdOfficeHours`).
- Board: after a priced round (`boardActive`); before that, an existing investor becomes a `raise`-biased advisor.
- Fractional execs: hired in People (`m.fractional`), synced as a `fractional` source (People bills them).
- Peers: `joinPeerGroup(state, 'founder_group' | 'mastermind')` ($50 / $400 a month [design]); billed by `adviceDay`; bias `peers`, access `none`.
- AI Assistant: `enableAssistantSource`.
Drawing hidden quality for synced sources uses `drawQualityKeyed` (a hash of seed and key), never `rng(state)`, so syncing cannot shift other seeded flows.

## API (`core/advice.js`)

- `adviceFor(state, functionId, lines, { kind = 'coaching', truth = [], record = true })` -> items `{ id, text, from, sourceId, sourceKind, functionId, kind, day, confidence, quality*, truth*, biased* }`. `lines` is the true coaching text (string or array), `kind` is `coaching | lesson | warning | habit | odds`, `truth` is an optional list of hidden-truth hints that only a `great` source with data access may pass on. Returns `[]` with no source. Learning mode returns every line from `'Coach (learning mode)'`. New items are recorded in `state.advice.inbox` (deduplicated by id, capped at 150) so they can be followed. (* internal.)
- Quality behaviour: `great` the correct lines (plus truth hints with data access); `good` correct but only the first sentence, no detail; `average` one generic playbook line from the tier behaviours; `mediocre` generic filler or an off-target trap line from the same field; `bad` a confidently wrong line from `BAD_ADVICE` (e.g. "Raise now while the market is hot"). A `great` source with `access: 'none'` is capped at `good`. Biases add a slanted line on top. Two sources can disagree: both are returned; `conflicts(items)` pairs a true item with a wrong one.
- `adviceForFunction(state, functionId)` reads the function and gates its coaching.
- `reviewFor(state, functionId, read?)` -> `{ learning, covered, reviewer: 'Board review' | 'Advisor review' | 'Coach (learning mode)', tier, evidence, items, by, needsData }`. The tier and evidence are revealed only by learning mode or by a source with `good`+ quality that can see your data. The Scorecard uses it.
- `lessonFor(state, mistakeEntry)` -> gated lesson items. `hasSource(state, kind)`.
- `ask(state, sourceId, question, { share, functionId, truth, hours, llm })` -> `Promise<answer>` `{ id, from, functionId, text, items, confidence, mock, readyDay, costUsd, hours, shared }`. Charges founder hours (`SOURCE_KINDS[kind].askHours`, mentor 1 h) and the source's hourly fee, and uses up its monthly time (throws when none is left, or the source has gone quiet). The function is inferred from the question unless given. The LLM persona prompt contains only: the source's role, expertise, bias and quality style, the points the gate allows this source to make, and the data shared (`sharedFacts`: MRR, customers, cash; with `full` also the one-liner and ICP). Offline fallback: the same points joined, prefixed "Without seeing your numbers I can only speak generally." or "From what you shared (...)". Answers use `state.cache` through `llm.ask`.
- `followAdvice(state, adviceId)` records `{ adviceId, sourceId, functionId, text, day, truth }` in `state.advice.followed`. Wrong advice logs a delayed mistake `followed_bad_advice` (costs per function in `FOLLOW_COST`, e.g. fundraising: 20 h, 30 days, reputation) that names the source; off-target advice costs 3 h. True, generic and coach lines cost nothing here.
- Settings: `setLearningMode(state, bool)`, `learningMode(state)` (Settings -> "Built-in coaching (learning mode)", default off).
- Sources: `addSource`, `endSource`, `setAccess`, `sources`, `sourcesFor(state, fn)`, `covers`, `publicProfile` (safe to render), `inbox(state)` (arrived items, newest first), `adviceDay(state)` (monthly fees; unpayable sources pause), `ensureAdvice`.

## Operator integration (`core/operator.js`)

- `normalize()` keeps `tier`, `evidence`, `score` and the raw coaching, but `coaching` on a read is now a non-enumerable property: INTERNAL truth for the gate. It is not in a spread, `Object.keys` or JSON. Tests may assert `read.coaching` directly (the underlying read); UI code must call `adviceFor(state, fn, read.coaching)`.
- `logMistake(state, { ..., detail, lesson })`: `detail` is what happened and what it cost; `lesson` is the prescriptive part. When `lesson` is omitted it is split off the end of `detail` by `splitLesson(detail)` -> `{ fact, lesson }`. Prescriptive = "A/The stellar/good/strong operator...", "Stellar operators...", "Next time...", "You should...", "It is better to...", or a sentence starting with an imperative verb; only the trailing run of such sentences moves, plus a trailing "; a stellar operator..." clause.

## Scorecard (`apps/outcomes.js`)

Shows raw data by default: the mistakes ledger (label, date, costs, factual detail), kill and pivot criteria with status, the activity vs reference table (no luck odds, no multipliers), habits met or not with factual detail, warnings with their factual detail. Behind a source: tier badges, evidence and coaching ("Board review" / "Advisor review", per covered function), a mistake's lesson, a warning's "how this usually ends" (as `adviceFor(state, 'general', ...)`), luck odds and multipliers (board or learning mode). Habit mechanics (`why`) are never shown; learning mode shows `note`, the habit's description.

## Still to convert (sweep builders)

Apps that still render `read.coaching` or lesson-like text directly: `calendar.js:207`, `you.js:129`, `sales/rfp-view.js:54`, `sales/learning-view.js:119`, `product/views.js:214`, `growth/asoUi.js:125`, `searchtools.js:179`, `fundraising/view-room.js:50`, `fundraising/view-termsheet.js:68`, `calls.js:141`, `research.js:374`, `legal.js:205`, `support/*`, and notify/mail text that embeds "A stellar operator ...". Convert each to `adviceFor(...)`, keep facts visible, and move prescriptions into `lesson`. Add a test that a state with no source shows no prescriptive text.
