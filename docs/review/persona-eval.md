# Persona evaluation harness

Checks that simulated interviewees and prospects (public/core/truth.js `drawPerson` + public/data/persona-prompts.js) give TRUE signal only when the founder talks to the right people the right way, and mislead realistically otherwise. Per CLAUDE.md iteration-velocity rule it is small and short: offline runs in about a second, live in a few minutes.

## Run

```
node scripts/persona-eval.mjs                 # offline, deterministic, N=6 persons per cell
node scripts/persona-eval.mjs --n 10 --verbose   # more persons, print sample transcripts
node scripts/persona-eval.mjs --json          # machine-readable
OPENROUTER_API_KEY=... node scripts/persona-eval.mjs --live   # live LLM (default N=3)
```

Flags: `--seed`, `--max-calls 400` (live aborts before spending if the estimate is higher), `--truth <path>` / `--prompts <path>` (swap in other modules, e.g. a fixture), `--port`. Exit code 1 on any FAIL, 2 if a dependency or API key is missing (with a message saying which).

Live mode starts server.js in-process on a free port and calls public/core/llm.js `ask`, so it exercises the real `/api/llm` proxy path. It runs a subset of nine target x founder cells (about 200-250 calls at N=3). If a reply fails `validateReply` or the call falls back, it is replaced by `offlineAnswer` (as the game would) and counted.

## What it does

- `test/helpers/founder-scripts.js`: four scripted founders (stellar, average, mediocre, keyword_stuffer) as question sequences with a `kind` per step, plus eight targets (right-segment stranger, wrong segment, outsider, friends/family, warm intro, investor, fellow founder, big idiosyncratic customer). Tiers differ by what is asked (past vs hypothetical, follow-ups, current spend, commitment ask, referral ask), not by length or keywords. The stuffer asks hypothetical/leading/pitch questions packed with "last time", "specifically", "how much", "workaround".
- Persons come from `drawPerson(state, { segmentId, channel, seedKey })`, rejection-sampled on `relationship` (and `idiosyncraticAsk` for the big customer). If the generator never yields a relationship, the harness patches the person and prints a `note:` line, so you know that cell tests only the dialogue layer.
- Black-box scoring from reply text: facts revealed = `lastIncident` / `workaround` token overlap >= 50%, `workaroundCostMonthly` number within 10%; commitments by regex, overridden by a structured `commitment` field if `offlineAnswer` returns an object; praise by word list. Heuristics, so a regex miss shows up as a FAIL to investigate, not as proof.

## Assumed module API (adjust the adapter at the top of the script if it differs)

`offlineAnswer(person, question, history, state)` returns a string or `{ reply|text|answer, commitment? }`; `intervieweeSystemPrompt(person, state)` returns a string; `validateReply(person, reply, { question, history, state })` returns truthy/`{ok}`; `classifyQuestion(text)` is only recorded under `--verbose` (kind distribution per scripted kind) for comparison.

## Checks and thresholds

| Check | Threshold | Why |
|---|---|---|
| Tiers separate (right segment, stranger) | reveal stellar-avg >= 0.10, avg-mediocre >= 0.05, stellar-mediocre >= 0.35 | CLAUDE.md rule 7; llm-personas.md s3 "a realistic simulator must punish bad questions" |
| Stellar + right segment reveal | >= 60% of hidden pain facts | design target; Mom Test past-behaviour questions are the reliable signal (misleading-feedback.md s3) |
| Stellar + right segment commitment | >= 1 person in N commits money or a specific next step; not all N | commitments are the only strong evidence; asymmetry rule |
| Wrong segment / outsider | 0 money commitments for every founder type | truth contract: wrong people never commit money |
| No invented pain | <= 20% of no-pain people state an incident or cost | llm-personas.md s2 "refuse to invent needs" |
| Friends vs strangers | praise per reply >= 2x on the same pitch; no money out-commit | politeness 0.85 vs 0.25 [design]; acquiescence (Hill and Roberts 2023, via misleading-feedback.md s5) |
| Investors / founders | 0 money commitments, reveal <= 0.10 | opinions about the idea, not their own pain (truth contract) |
| Leak rate | < 5% of replies to non-money questions contain a hidden number (true or stated WTP, workaround cost) not in the question | llm-personas.md s4 (Agarwal et al.: leakage 17.7% to 86.2% multi-turn); "do not volunteer" |
| Keyword stuffing | stuffer reveal <= mediocre + 0.15, <= stellar - 0.30, <= 0.35; no money commitment | llm-personas.md s4 "score what the question causes, not trigger terms" |
| Stated WTP | median stated/true in [1.05, 2.5] on hypothetical questions | Murphy et al. 2005 median 1.35, long tail (misleading-feedback.md s2) |
| Current-spend answers | median reported/true in [0.8, 1.25] | past behaviour is honest signal |
| Idiosyncratic ask | >= 50% of big customers volunteer it on feature/opinion questions, more than typical strangers | misleading-feedback.md s1 loud-big-customer trap |
| Consistency | same question repeated -> same facts (offline 1.00, live >= 0.70) | llm-personas.md s3 consistency probes; Choi et al. drift |
| Determinism (offline) | replayed script yields identical text | CLAUDE.md determinism rule |
| Wording sensitivity | reveal spread across 3 paraphrases of the stellar script <= 0.25 | Bisbee et al. 2024 |
| Variance | right-segment persons show >= 2 distinct reveal levels | Bisbee 2024, Zhou 2026: simulated respondents too uniform |
| Live validator | < 20% of live replies fall back offline | llm-personas.md s4 post-filter |

Cells with no data (e.g. a segment with no pain-having persons) report SKIP rather than FAIL. Thresholds marked [design] are not real statistics. Keep N small; do not turn this into a grid.

## Results

Status: public/core/truth.js and public/data/persona-prompts.js did not exist when this harness was written, so it has been exercised only against throwaway mock modules (the harness correctly flagged the mock's crude regex answers). Fill the table from `node scripts/persona-eval.mjs --verbose` once both modules land.

| Check | Offline value | Status | Live value | Status |
|---|---|---|---|---|
| Tiers separate | | | | |
| Stellar reveal | | | | |
| Stellar commitment | | | | |
| Wrong segment money | | | | |
| No invented pain | | | | |
| Friend praise ratio | | | | |
| Investor / founder | | | | |
| Leak rate | | | | |
| Keyword stuffing | | | | |
| Stated WTP | | | | |
| Current-spend accuracy | | | | |
| Idiosyncratic ask | | | | |
| Consistency / determinism | | | | |
| Wording sensitivity | | | | |
| Variance | | | | |
