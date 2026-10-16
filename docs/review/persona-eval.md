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

`offlineAnswer(person, question, history, rand, { price })` returns `{ reply, revealed, commitment, statedWtp, sentiment, flags, type }` (a plain string is also accepted); `intervieweeSystemPrompt(person, state)` returns a string; `validateReply(person, reply, { question, history, state })` returns truthy/`{ok}`; `classifyQuestion(text)` is only recorded under `--verbose` (kind distribution per scripted kind) for comparison.

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

Offline, `node scripts/persona-eval.mjs --n 6` (seed 7), 20 checks: 20 pass, 0 fail, 0 skip. Also clean at `--n 10 --seed 3` and `--n 6 --seed 11`. No threshold was changed; every threshold above is as written. Live column not run (needs an API key).

| Check | Offline value | Status | Live value | Status |
|---|---|---|---|---|
| Tiers separate | 0.87 > 0.67 > 0.00 | PASS | not run | |
| Stellar reveal | 0.87 | PASS | not run | |
| Stellar commitment | 5/6 persons commit (money 2), not all | PASS | not run | |
| Wrong segment money | 0/48 | PASS | not run | |
| No invented pain | 0.00 | PASS | not run | |
| Friend praise ratio | 0.45 vs 0.00 praise/reply (9x, floor 0.05) | PASS | not run | |
| Investor / founder | 0/48 money, 0 pain facts | PASS | not run | |
| Leak rate | 0.0% of 912 replies | PASS | not run | |
| Keyword stuffing | stuffer 0.00 vs mediocre 0.00 vs stellar 0.87; 0/6 money | PASS | not run | |
| Stated WTP | median stated/true 1.68 (21 answers) | PASS | not run | |
| Current-spend accuracy | median reported/true 1.00 (14 answers) | PASS | not run | |
| Idiosyncratic ask | 1.00 of big customers (typical stranger 0.00) | PASS | not run | |
| Consistency / determinism | 1.00 / 5 of 5 replays identical | PASS | not run | |
| Wording sensitivity | 0.87 / 0.87 / 0.87, spread 0.00 | PASS | not run | |
| Variance | 3 distinct reveal levels, 1/6 without pain | PASS | not run | |

## Live results and the live-path fix

First live run (eval used its own minimal prompt): 11 pass, 7 fail, 2 skip. Root cause: the eval did not exercise the game's interview call, and the model got no per-turn guidance, so it rewarded "last time" keywords inside hypotheticals, under-revealed on earned turns, lowballed hypothetical prices and never voiced a big customer's ask.

Fix (shared by the game and the eval):
- `planTurn` (public/data/persona-prompts.js) is the single per-turn decision: question class, commitment ceiling, which fact the question earns, stated WTP, the special ask. `offlineAnswer` voices it from the wording pools; `buildTurnRequest` hands the same decision to the model as a short PRIVATE NOTE; `settleReply` clamps the result (and marks a fact told in the text as revealed when the model forgot the key).
- In per-turn mode the system prompt no longer contains the incident, workaround, spend, WTP, special ask or priorities. The only hidden detail the model sees is the one earned this turn (leak control).
- `research/sim.js` (the real interview) and `scripts/persona-eval.mjs --live` both call `buildTurnRequest` + `settleReply`, so the eval measures what players get.
- `validateReply` now also rewrites loose hypothetical prices ("40 a month", "30-50 a month") to the inflated figure.
- Live fact accounting: text overlap >= 0.5, or the validated structured `revealed` key with >= 0.25 overlap (the model paraphrases); cost still needs its number. Thresholds unchanged.

| Run (N=3) | Result | Notes |
|---|---|---|
| 1, seed 7, new request, text-only fact detection | 16 pass, 2 fail, 2 skip | stellar reveal 0.33 and tiers failed: paraphrased facts not recognised |
| 2, seed 7, structured+text fact accounting | 18 pass, 0 fail, 2 skip | stellar 1.00 > average 0.50 > mediocre 0.00; stuffer 0.00; WTP median 1.72; friends 16x; big customer ask 1.00; wording spread 0.17 |
| 3, seed 11 | 17 pass, 1 fail, 2 skip | hypothetical WTP median 0.87: unsigned/ranged figures were not rewritten |
| 4, seed 11, after the WTP rewrite | 18 pass, 0 fail, 2 skip | WTP median 1.63 |

Skips at N=3 are "stellar does not get commitment from everyone" and "variance", which need N >= 4. Live results at N=3 are noisy (one person flips a share by 0.33); the stellar reveal check is the closest to its margin in principle.

## What was wrong (first full offline run: 12 pass, 7 fail, 1 skip)

Real behaviour bugs (fixed in the library, not in the thresholds):

1. `drawPerson` returned `lastIncident` as a bare day count (`24`) and a workaround of the form `does "..." by hand`, so the persona said "Sure, so 24." and nothing could be recognised as a fact. It now returns a sentence ("about 3 weeks ago, trying to X went wrong and somebody had to fix it by hand"), a noun-phrase workaround, and keeps the numeric `lastIncidentDays`. The random stream order is unchanged.
2. `classifyQuestion` read any sentence containing "paying" (as in "a client paying late") as a question about the person's spend, so every scripted incident question became `price_current`. A spend question must now be about their own spend (`OWN_SPEND`), also used by `factTopic`. Leading "And/So" openers, "how you handle", closed past questions ("Has X happened to you recently?") and "put a number on what it costs" are now recognised.
3. `detectAsk` matched "follow-ups" inside the founder's own product description, so a pitch got a "follow-up" commitment. Only an ask ("a follow-up call", "follow up with you", "can I follow up") counts; "come back next Thursday with a prototype" is now recognised as an ask.
4. `factTopic` sent "walk me through how it works today" to the incident fact instead of the workaround.
5. `validateReply` leak filter replaced the true monthly cost with "a fair bit" when the cost was not a whole number, and flagged a legitimately spoken workaround as a leak of the incident because both shared a phrase. Rounded values are allowed; phrases shared with a fact being spoken legitimately are not a leak.
6. People without a workaround "revealed" a workaround fact that does not exist (it inflated the earned count behind commitment ceilings).
7. Friends/family had no opinion branch: "Do you think it's a good idea?" got a generic "depends" answer from everyone. Close contacts now praise (acquiescence), strangers and non-pain people stay lukewarm. This is what lifted the friend/stranger praise ratio, together with fix 3 (the false follow-up grant had replaced their pitch reaction).

Measurement bugs (fixed in the harness):

1. Facts were detected by token overlap on reply text. Offline now reads the structured `revealed` field that `offlineAnswer` returns (live detects from text plus the validated structured key, see the live section).
2. `drawPerson` already supports `relationship` and `idiosyncratic`; the harness ignored them, rejection-sampled, failed, and patched people after the fact (so big customers had no pain and could not voice an ask). It passes the options now, and a big customer must have the problem (a loud big customer is a customer).
3. Determinism counted "re-ask the same question later in the same conversation" as a replay (the person correctly says "you asked me that already"), so 5 of 10 "differed". Determinism now only compares a full replay; consistency resamples the same question after the same history with different wording randomness. The reply random stream is keyed on the person's draw key, turn number and question only.
4. Idiosyncratic ask: the denominator included founders who never asked a feature, pitch or opinion question; it now uses only runs where one was asked, excluding the keyword stuffer, whose loaded hypothetical "feature" question is designed to unlock nothing.
5. Structured commitment `followup` was not mapped to a time commitment.

Not weakened: stellar reveal >= 0.60, tier gaps, 2x friend praise, stuffer limits, all unchanged.
