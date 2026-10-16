# Early stage: hidden market truth (design contract)

Research: docs/research/early-stage/*.md. Audit findings that motivated this: one demand scalar per idea, interview pain a flat 55% coin flip, product fit measured against the player's own ICP text (so any ICP is "right"), real interviews not simulated, warm contacts more likely to have pain (opposite of politeness bias), pivots detected only on the one-liner with nothing reset, no pre-product smoke tests, presell commitments never counted as evidence (bug).

## Principle

Each idea has a hidden market made of segments. The player never sees it directly; every early-stage system samples from it. Talking to the right people the right way reveals it; the wrong people or the wrong questions produce plausible, misleading noise. Doing everything right raises the odds but cannot create pain that isn't there (asymmetry rule).

## Module: public/core/truth.js (owner: core builder)

Deterministic from `state.seed` + idea key (`idea#${company.pivots}`), using its own seeded stream (never `rng(state)`), generated lazily and cached in `state.market.truth`.

```js
truthOf(state) -> {
  ideaKey, generatedFor: { oneLiner, model },
  demandScale,                 // = marketDemand(state), kept for compatibility
  segments: [{
    id, label, keywords: [],   // matched against ICP text, titles, industries
    share,                     // share of the addressable population
    painPrevalence,            // 0..1: share of people in the segment who really have the problem
    intensity,                 // 0..1 when they have it (hair on fire ~0.8+)
    frequency,                 // 'daily'|'weekly'|'monthly'|'rare'
    wtpMonthly: { median, sd },// true willingness to pay (revealed, not stated)
    budgetOwner,               // 'user'|'manager'|'exec'|'procurement'|'none'
    buyerIsUser,               // false -> users love it, buyers don't pay
    jobs: [{ id, label, keywords: [], importance }], // what actually matters to them
    reach: { warm, community, cold, panel },         // response multipliers by channel
    retentionMult,             // >1 sticky, <1 churny
    idiosyncrasy,              // 0..1: how custom each account's asks are
  }],
  bestSegmentId,               // the "hair on fire" niche (often narrower than the stated ICP)
}
segmentMatch(state, text) -> [{ segmentId, score }]   // ICP text, a title, a company/industry
icpFocus(state) -> { segmentIds, breadth, bestScore }   // how well the current ICP targets truth
drawPerson(state, { segmentId|'outsider', channel, screened, seedKey }) -> hidden person facts:
  { segmentId, role, isBuyer, budgetAuthority, hasPain, painIntensity, frequency, lastIncident,
    workaround, workaroundCostMonthly, wtpTrue, statedWtpMult, politeness, idiosyncraticAsk,
    jobsRanked, competingPriorities, relationship: 'stranger'|'warm'|'friend'|'investor'|'founder' }
featureValue(state, feature) -> { value 0..1, segmentValues: {segId: v}, idiosyncratic: bool }
pmfTruth(state, segmentId?) -> { veryDisappointed, retentionFloor }  // given current product
onPivot(state, { type, keep }) // re-draw or retain truth by pivot type (see below)
```

Rules the generator must respect (sourced numbers in research docs; tag [design] in code):
- Pain is concentrated: 1 segment strong (prevalence 0.5-0.8, intensity 0.7-0.95), 1-2 moderate, others weak/nice-to-have. Weak ideas (low demandScale) have no strong segment.
- Stated WTP > true WTP: statedWtpMult median ~1.35, long tail to ~3 (hypothetical bias meta-analyses).
- Politeness: friends/family 0.85, warm 0.6, stranger 0.25, investor/founder opinions are about the idea, not their own pain (relationship 'investor'/'founder': no pain, high opinion confidence).
- Wrong people: outsiders and non-buyers can sound enthusiastic, have hypothetical or idiosyncratic asks, and never commit money.
- Loud big customer: idiosyncratic asks have value ~0 for the rest of the segment.

## Pivot types (owner: core builder)

`company.pivotLog` entries carry a type: `segment` (same problem, new customer: truth retained, ICP focus changes), `problem` (same customer, new problem: re-draw pain/jobs, keep segment list), `zoom_in` / `zoom_out` (feature becomes product / product becomes feature: jobs re-weighted), `business_model` (B2B↔B2C, self-serve↔sales: wtp/budgetOwner shift), `channel`, `full_restart` (re-draw everything). Each type says what is kept (code, customers, audience, insights) and what is lost; stale LLM feature judgments are invalidated.

## Consumers (each owned by a separate builder)

- Interviews & recruiting: simulated real interviews from drawPerson; recruiting channel and screener decide who you actually get.
- Sales/prospects/presell: personas and hidden intent from drawPerson for the prospect's true segment.
- MVP & experiments: smoke tests / fake doors / concierge / design partners sample from truth.
- PMF & synthesis: segmented Sean Ellis, retention by segment, false-PMF signals, synthesis board with patterns, saturation, contradictions, kill criteria tied to hypotheses.

## Implemented API (final, as built)

Files: `public/core/truth.js`, `public/core/pivots.js`, `public/data/market-truth.js`; wired into `core/market.js`, `apps/product/fit.js`, `apps/product.js`, `apps/customers.js`, `apps/website.js`, `apps/settings.js`, `apps/assistant/planner.js`, `apps/pricing.js`, `apps/channels/pricing-sim.js`. Tests: `test/truth.test.js`.

core/truth.js
- `truthOf(state)`: as the contract; extra segment fields `baseId, kind ('b2b'|'b2c'), group, subKeywords, painClass`. B2B segments come from data/buyer-segments.js (3-4 base segments chosen from the one-liner plus adjacent and a wildcard; the top one is split into solo/multi-site size bands, 4-7 in all). B2C segments are personas inside the churn category (ids `p:students` ...). Generation is independent of `rng(state)`; persisted: `market.truth` (cache), `market.truthSel` (segment list, retained across segment/problem pivots), `market.truthKeys {restart, pain, biz, zoom}`.
- Weak ideas: `demandScale < 0.3` has no segment with prevalence >= 0.5. Tests pin demand with `market.flags = { fixedDemand: x }`.
- `segmentMatch(state, text)`, `icpFocus(state)` -> `{segmentIds, weights, valueWeights, breadth, bestScore, outsider, diffuse, strength, relative, retention, wtp, demandMult, churnMult}`. Empty ICP or no idea = neutral (multipliers 1). A broad ICP is "diffuse" (weights by share; value leans to pain because people with the problem self-select). An ICP that names a segment outside the truth set is `outsider`.
- `drawPerson(state, { segmentId|'outsider', channel, screened, seedKey, relationship, idiosyncratic })`: person facts as in the contract, plus `title, statedWtp, opinion, reachMult`. `idiosyncraticAsk` is plain text or null. Pain is independent of warmth; `screened` raises the share with pain. investor/founder: no pain, `opinion` set. `relationship` and `idiosyncratic` force those traits.
- `featureValue(state, feature)` -> `{value, segmentValues, idiosyncratic}` (`feature.requestedBy`/`custom` + no job match = idiosyncratic, value x0.15).
- `pmfTruth(state, segmentId?)`, `trueWtp(state)`, `judgeKey(state)` (cache key for LLM feature judgments), `ideaKeyOf`, `onPivot(state, {type})`.

core/market.js: `wtpOf(state)` is what the sim uses (explicit `fit.price.wtp`, else truth, else refPrice). `statedWtp(state)` is what the UI shows. `recordStatedWtp(state, value, {notes, source})` is how panels record WTP: stored as `fit.price.stated` (shown to the player, ~1.35x inflated vs truth) and `fit.price.wtp` is left null when an idea exists so behaviour follows the truth. Never show `wtpOf` to the player. `landingConversion` x `demandMult`, `trialConversion` x `sqrt(demandMult)`, churn x `churnMult` x `pivotChurnMult`.

core/pivots.js: `PIVOT_TYPES` (label, summary, keeps, loses, hours, customerLoss, truth), `pivotTypeIds`, `classifyChange(state, prev, next) -> {type|null, why, flags}`, `registerChange(state, prev, next, {type})` (call AFTER the company fields changed; records `company.pivotLog {day, type, from, to, kept, evidence, hours}`, charges founder hours, bumps `company.pivots` for problem/full_restart, calls `onPivot`, logs `pivot_without_evidence` (<15 real conversations since the last pivot), `pivot_every_90` and `thrash_pivoting` (3+ in 6 months)), `syncPivotSnapshot(state)` (planner safety net for edits that bypass Settings), `snapshotOf`, `substantivePivots`, `pivotChurnMult`. `sunk_cost_persist` reuses the existing planner mistake `persistence_as_inaction` (missed kill criterion, no decision, logged every 30 days).

Product fit: with `ctx.state` (the game), relevance comes from `truth.featureValue`; the LLM judge (cached with `f.valueKey = judgeKey(state)`, stale when ICP/idea change, cleared by `onPivot`) only refines spec quality; the judge prompt never sees truth. Presell commitments count as evidence directly (no interview id needed). Without `state` the old text heuristic still applies (unit use).

Test changes: `test/consumer-playbook.test.js` two tests encoded "ICP and price are irrelevant" (a pinned median-fit churn curve, plan-length retention): they now blank the ICP / set `fit.price.wtp` to the reference price; one funnel test now accepts the `organic:wom` source (a well-targeted persona earns word of mouth).
