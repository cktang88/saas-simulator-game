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
